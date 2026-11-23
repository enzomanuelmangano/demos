#!/usr/bin/env python3
"""Bake the relighting surface field for the `light-on-painting` demo.

The demo relights a still painting with a movable point light. That needs a
per-pixel surface description the fragment shader can sample:

    R,G = slope of the depth field (d depth/dx, d depth/dy)
    B   = ambient occlusion  (1 = fully open, 0 = fully buried)
    A   = depth              (0 = far, 1 = near)

Upstream is TypeGPU's `monocular-light-injection` by Konrad Reczko
(@reczko_konrad) at Software Mansion, which derives all of this on the GPU every
frame because its input is a live camera feed whose depth changes:

    https://x.com/reczko_konrad/status/2089670934009413751
    https://github.com/software-mansion/TypeGPU/tree/main/apps/typegpu-docs/src/examples/image-processing/monocular-light-injection

The gradient and occlusion maths below is a port of his `surfaceKernel`, so the
shader constants stay transferable between the two projects.

Copyright (c) 2025 Software Mansion <swmansion.com>. MIT licensed; see
https://github.com/software-mansion/TypeGPU/blob/main/LICENSE

A painting never changes, so the whole runtime chain — the depth network, the
disparity range estimator, the temporal filter and the surface compute kernel —
collapses into this one offline script. That is a reduction in ambition from his
original, not an improvement on it: running the network per frame, inside
TypeGPU, with the depth buffer never leaving the GPU, is the hard part.

Usage:
    python3 scripts/bake-painting-surface.py \
        --image src/animations/light-on-painting/assets/nighthawks.jpg \
        --out   src/animations/light-on-painting/assets/nighthawks-surface.bin

Requires torch + transformers (Depth Anything V2) and Pillow + numpy.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

# --- surfaceKernel constants (kept in sync with shaders/relight.ts) -----------

DEFAULT_GRADIENT_RADIUS = 7
GRADIENT_LIMIT = 0.009
GRADIENT_NOISE = 0.0003
OCCLUSION_RADII = (3, 9)
RING_OFFSETS = (-1, 0, 1)
OCCLUSION_SCALE = 0.07
OCCLUSION_RANGE = 0.25
OCCLUSION_FLOOR = 0.012

# writeTexture wants bytesPerRow % 256 == 0. rgba16float is 8 bytes/texel, so
# the baked width has to be a multiple of 32.
WIDTH_ALIGNMENT = 32
DEFAULT_WIDTH = 640

MODEL_ID = "depth-anything/Depth-Anything-V2-Large-hf"
NORMALS_MODEL_ID = "prs-eth/marigold-normals-v1-1"

# The shader reconstructs its normal as normalize(vec3(tilt, 1)) where
# tilt = -slope * relief * RELIEF_SCALE. To hand it a measured normal we invert
# that: tilt = (n.x/n.z, n.y/n.z), so slope = -tilt / SHADER_TILT_GAIN.
RELIEF_SCALE = 200.0
SHADER_RELIEF = 1.25
SHADER_TILT_GAIN = RELIEF_SCALE * SHADER_RELIEF


def estimate_depth(image: Image.Image) -> np.ndarray:
    """Run Depth Anything V2 and return raw disparity (higher = nearer)."""
    import torch
    from transformers import pipeline

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    estimator = pipeline("depth-estimation", model=MODEL_ID, device=device)
    prediction = estimator(image)
    # `predicted_depth` keeps full precision; the PIL `depth` output is already
    # quantised to 8 bits, which bands badly once a gradient is taken from it.
    return prediction["predicted_depth"].squeeze().float().cpu().numpy()


def estimate_normals(image: Image.Image, steps: int) -> np.ndarray:
    """Predict surface normals directly, rather than differentiating depth.

    Differentiating a monocular depth field gives soft, low-frequency normals:
    a face becomes one smooth mound, and any large region with a steady depth
    ramp picks up a single uniform tilt. A model trained to output normals
    resolves the things that actually catch a moving light — an eyelid, a lip,
    the fold of a headscarf — because that is what it was asked to predict.

    Returns an (H, W, 3) unit normal field in camera space, +x right, +y up,
    +z towards the viewer.
    """
    import torch
    from diffusers import MarigoldNormalsPipeline

    pipe = MarigoldNormalsPipeline.from_pretrained(
        NORMALS_MODEL_ID, variant="fp16", torch_dtype=torch.float16
    )
    if torch.backends.mps.is_available():
        pipe = pipe.to("mps")
    result = pipe(image, num_inference_steps=steps, ensemble_size=1)
    normals = result.prediction[0]
    if hasattr(normals, "cpu"):
        normals = normals.cpu().numpy()
    normals = np.asarray(normals, dtype=np.float32)
    if normals.shape[0] == 3:  # (3, H, W) -> (H, W, 3)
        normals = np.transpose(normals, (1, 2, 0))
    norm = np.linalg.norm(normals, axis=-1, keepdims=True)
    return normals / np.maximum(norm, 1e-6)


def slope_from_normals(normals: np.ndarray) -> np.ndarray:
    """Convert unit normals into the slope pair the shader expects."""
    nx = normals[..., 0]
    ny = normals[..., 1]
    # Keep the normal on the viewer's side and off the horizon, where the tilt
    # would blow up.
    nz = np.maximum(np.abs(normals[..., 2]), 0.2)
    # Screen y runs downwards in the shader, so the model's +y (up) flips.
    tilt = np.stack([nx / nz, -ny / nz])
    return -tilt / SHADER_TILT_GAIN


def resize(field: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Bilinear resize of a single-channel float field."""
    source = Image.fromarray(field.astype(np.float32), mode="F")
    return np.asarray(source.resize(size, Image.BILINEAR), dtype=np.float32)


def normalize(disparity: np.ndarray, low_pct: float, high_pct: float) -> np.ndarray:
    """Map disparity to 0..1, clipping outliers the way the GPU range estimator
    would have after its temporal blend."""
    low = float(np.percentile(disparity, low_pct))
    high = float(np.percentile(disparity, high_pct))
    span = max(high - low, 1e-6)
    return np.clip((disparity - low) / span, 0.0, 1.0)


def gaussian_blur(field: np.ndarray, sigma: float) -> np.ndarray:
    """Small separable gaussian. The network's output carries a fine grain that
    the gradient stage would otherwise amplify into shimmering normals."""
    if sigma <= 0:
        return field
    radius = max(1, int(math.ceil(sigma * 3)))
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-(offsets**2) / (2 * sigma * sigma))
    kernel /= kernel.sum()

    padded = np.pad(field, ((0, 0), (radius, radius)), mode="edge")
    horizontal = sum(
        kernel[i] * padded[:, i : i + field.shape[1]] for i in range(kernel.size)
    )
    padded = np.pad(horizontal, ((radius, radius), (0, 0)), mode="edge")
    return sum(kernel[i] * padded[i : i + field.shape[0], :] for i in range(kernel.size))


def bilateral_blur(
    field: np.ndarray, sigma_space: float, sigma_range: float
) -> np.ndarray:
    """Edge-aware low-pass, run separably.

    A plain gaussian averages across a silhouette, so the "low frequency" near
    an edge is a blend of the figure and the background behind her. Subtracting
    that leaves a bright/dark ring hugging the outline. Weighting each tap by
    how close its depth is to the centre's keeps the blur on one side of the
    edge, so the residual there is ~0 and no ring can form.
    """
    radius = max(1, int(math.ceil(sigma_space * 3)))
    offsets = np.arange(-radius, radius + 1)
    spatial = np.exp(-(offsets**2) / (2 * sigma_space * sigma_space))
    range_scale = 2 * sigma_range * sigma_range

    def pass_over(data: np.ndarray, axis: int) -> np.ndarray:
        total = np.zeros_like(data)
        weight = np.zeros_like(data)
        for index, offset in enumerate(offsets):
            neighbour = shifted(
                data, int(offset) if axis == 0 else 0, 0 if axis == 0 else int(offset)
            )
            difference = neighbour - data
            w = spatial[index] * np.exp(-(difference**2) / range_scale)
            total += w * neighbour
            weight += w
        return total / np.maximum(weight, 1e-9)

    return pass_over(pass_over(field, 0), 1)


def shifted(field: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """Sample the field at an offset, clamping at the border (matches the
    shader's clamp-to-edge texel fetch)."""
    rows, cols = field.shape
    ys = np.clip(np.arange(rows) + dy, 0, rows - 1)
    xs = np.clip(np.arange(cols) + dx, 0, cols - 1)
    return field[ys][:, xs]


def gentler_delta(backward: np.ndarray, forward: np.ndarray) -> np.ndarray:
    """Harmonic-ish blend of the two one-sided differences. A plain central
    difference straddles a depth discontinuity and invents a slope that belongs
    to neither side; weighting each side by the *other* side's magnitude lets
    the flatter neighbour win."""
    back = np.abs(backward)
    front = np.abs(forward)
    return (backward * front + forward * back) / np.maximum(back + front, 1e-9)


def surface_slope(gradient: np.ndarray) -> np.ndarray:
    """Soft-clamp the gradient magnitude and subtract the noise floor, so flat
    regions stay flat and cliffs stop short of infinite tilt."""
    steepness = np.maximum(np.linalg.norm(gradient, axis=0), 1e-9)
    shrunk = np.sqrt(np.maximum(steepness**2 - GRADIENT_NOISE**2, 0.0))
    ceiling = GRADIENT_LIMIT * np.tanh(shrunk / GRADIENT_LIMIT)
    return gradient * (ceiling / steepness)


def compute_slope(depth: np.ndarray, radius: int) -> np.ndarray:
    """Slope of the depth field, measured over +/- `radius` texels.

    The radius sets what counts as a feature. A wide one averages a face's nose
    and lips away into a single soft mound; a narrow one keeps them but lets the
    network's own grain through, which is what the noise floor above is for.
    """
    center = depth
    left = shifted(depth, -radius, 0)
    right = shifted(depth, radius, 0)
    up = shifted(depth, 0, -radius)
    down = shifted(depth, 0, radius)
    gradient = np.stack(
        [
            gentler_delta(center - left, right - center),
            gentler_delta(center - up, down - center),
        ]
    ) / float(radius)
    return surface_slope(gradient)


def compute_occlusion(depth: np.ndarray) -> np.ndarray:
    """Height-field ambient occlusion: how much nearer the neighbourhood sits.
    A pixel ringed by closer surfaces is in a crevice and gets darkened."""
    occlusion = np.zeros_like(depth)
    taps = 0
    for radius in OCCLUSION_RADII:
        for step_y in RING_OFFSETS:
            for step_x in RING_OFFSETS:
                if step_x == 0 and step_y == 0:
                    continue
                neighbor = shifted(depth, step_x * radius, step_y * radius)
                difference = neighbor - depth
                contact = 1.0 - np.clip(np.abs(difference) / OCCLUSION_RANGE, 0.0, 1.0)
                cleared = np.maximum(difference - OCCLUSION_FLOOR, 0.0)
                occlusion += np.clip(cleared / OCCLUSION_SCALE, 0.0, 1.0) * contact
                taps += 1
    return 1.0 - np.clip(occlusion / float(taps), 0.0, 1.0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--smooth", type=float, default=1.0)
    parser.add_argument(
        "--gradient-radius", type=int, default=DEFAULT_GRADIENT_RADIUS
    )
    parser.add_argument(
        "--normals",
        action="store_true",
        help=(
            "Predict surface normals with Marigold instead of differentiating "
            "the depth field. Slower, and the single biggest quality lever: "
            "depth-derived normals cannot resolve features the depth model "
            "never represented sharply in the first place."
        ),
    )
    parser.add_argument(
        "--normal-steps",
        type=int,
        default=4,
        help="Marigold denoising steps. 4 is plenty; more mostly costs time.",
    )
    parser.add_argument(
        "--detail-sigma",
        type=float,
        default=0.0,
        help=(
            "Radius of a high-pass applied to the depth before the gradient is "
            "taken. A painted scene recedes steadily from background to "
            "foreground, and that ramp is a real depth cue but a bad surface "
            "normal: taken literally it tilts every large region the same way, "
            "so a whole torso ends up facing the floor and goes black under a "
            "light from above. Subtracting the low frequencies leaves the local "
            "form — a nose, a fold, a jaw — which is what should catch light. "
            "The depth channel itself is left untouched."
        ),
    )
    parser.add_argument(
        "--detail-range",
        type=float,
        default=0.05,
        help=(
            "Depth difference, in normalised units, that the high-pass treats "
            "as an edge worth preserving rather than smoothing across."
        ),
    )
    parser.add_argument(
        "--relief",
        type=float,
        default=1.0,
        help=(
            "Scales the baked slope. Different subjects want different amounts "
            "of relief — a face carries far more form than a flat street scene "
            "— and baking it in keeps the shader's relief dial global."
        ),
    )
    parser.add_argument("--low-percentile", type=float, default=1.0)
    parser.add_argument("--high-percentile", type=float, default=99.0)
    parser.add_argument(
        "--preview",
        type=Path,
        default=None,
        help="Optional PNG showing depth / occlusion / normals side by side.",
    )
    args = parser.parse_args()

    if args.width % WIDTH_ALIGNMENT:
        raise SystemExit(
            f"--width must be a multiple of {WIDTH_ALIGNMENT} "
            "so writeTexture's bytesPerRow stays 256-byte aligned."
        )

    image = Image.open(args.image).convert("RGB")
    print(f"source        {image.width}x{image.height}")

    disparity = estimate_depth(image)
    print(f"disparity     {disparity.shape[1]}x{disparity.shape[0]}")

    height = round(args.width * image.height / image.width)
    depth = normalize(
        resize(disparity, (args.width, height)),
        args.low_percentile,
        args.high_percentile,
    )
    depth = gaussian_blur(depth, args.smooth)
    depth = np.clip(depth, 0.0, 1.0)

    if args.normals:
        normals = estimate_normals(image, args.normal_steps)
        normals = np.stack(
            [resize(normals[..., c], (args.width, height)) for c in range(3)],
            axis=-1,
        )
        magnitude = np.linalg.norm(normals, axis=-1, keepdims=True)
        normals = normals / np.maximum(magnitude, 1e-6)
        slope = slope_from_normals(normals) * args.relief
        print(f"normals       {NORMALS_MODEL_ID}")
    else:
        relief_field = depth
        if args.detail_sigma > 0:
            relief_field = depth - bilateral_blur(
                depth, args.detail_sigma, args.detail_range
            )
        slope = compute_slope(relief_field, args.gradient_radius) * args.relief
    occlusion = compute_occlusion(depth)

    surface = np.stack([slope[0], slope[1], occlusion, depth], axis=-1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    surface.astype(np.float16).tofile(args.out)

    meta = {
        "width": args.width,
        "height": height,
        "format": "rgba16float",
        "channels": ["slopeX", "slopeY", "occlusion", "depth"],
        "source": args.image.name,
        "relief": args.relief,
        "normals": args.normals,
        "detailSigma": args.detail_sigma,
        "gradientRadius": args.gradient_radius,
    }
    args.out.with_suffix(".json").write_text(json.dumps(meta, indent=2) + "\n")

    print(f"baked         {args.width}x{height} -> {args.out} "
          f"({args.out.stat().st_size / 1024:.0f} KB)")
    print(f"slope range   {slope.min():+.5f} .. {slope.max():+.5f}")
    print(f"occlusion     {occlusion.min():.3f} .. {occlusion.max():.3f}")

    if args.preview:
        write_preview(args.preview, depth, occlusion, slope)
        print(f"preview       {args.preview}")


def write_preview(
    path: Path, depth: np.ndarray, occlusion: np.ndarray, slope: np.ndarray
) -> None:
    """Stack depth, occlusion and the derived normals into one contact sheet."""
    normal = np.stack(
        [-slope[0] * 200.0, -slope[1] * 200.0, np.ones_like(depth)], axis=-1
    )
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    panels = [
        np.repeat((depth * 255)[..., None], 3, axis=-1),
        np.repeat((occlusion * 255)[..., None], 3, axis=-1),
        (normal * 0.5 + 0.5) * 255,
    ]
    sheet = np.concatenate(panels, axis=0).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet).save(path)


if __name__ == "__main__":
    main()
