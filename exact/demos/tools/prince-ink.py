#!/usr/bin/env python3
"""Writes gpu/images/prince-rgb-910x1218.rgb8.zlib from the RN demo's prince.png.

What RN reads (text-image-morph/sampling.ts computeTargets): `readPixels` of the decoded PNG as
RGBA_8888 unpremul with no colour space, which Skia returns as the file's own 8-bit samples
(a null destination colour space is the source's: no conversion). The PNG is opaque (alpha 255
everywhere, checked below), so premul/unpremul changes nothing. The ink probability is a function
of those 8-bit r, g, b only, so the Rust surface keeps r, g, b and computes RN's makeInkProb on
them in f64, in RN's order of operations.

Pixels whose probability is exactly 0 (t <= 0 in makeInkProb) are written as white, whose
probability is also exactly 0: the stream is smaller and every probability is unchanged.

Also prints the checksum the Rust test asserts (the count of pixels with p > 0 and the f64 sum
of p, in row-major order).

    python3 tools/prince-ink.py            # from exact/demos
"""
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
PNG = HERE / "../../src/animations/the-little-prince/assets/prince.png"
OUT = HERE / "gpu/images/prince-rgb-910x1218.rgb8.zlib"

# constants.ts
INK_FLOOR, SAT_WEIGHT, SAMPLE_GAMMA = 0.18, 0.45, 1.4


def ink_prob(rgb: np.ndarray) -> np.ndarray:
    r, g, b = (rgb[..., i] / 255 for i in range(3))
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx <= 0, 0, (mx - mn) / np.where(mx <= 0, 1, mx))
    ink = np.maximum(1 - lum, sat * SAT_WEIGHT)
    t = np.maximum(0, np.minimum(1, (ink - INK_FLOOR) / (1 - INK_FLOOR)))
    return t, t**SAMPLE_GAMMA


def main() -> int:
    im = Image.open(PNG)
    assert im.mode == "RGBA" and im.size == (910, 1218), (im.mode, im.size)
    a = np.asarray(im)
    assert (a[..., 3] == 255).all(), "prince.png has transparent pixels: premul would change rgb"
    rgb = a[..., :3].copy()
    t, p = ink_prob(rgb)
    rgb[t <= 0] = 255
    _, p2 = ink_prob(rgb)
    assert (p2 == p).all()
    OUT.write_bytes(zlib.compress(rgb.tobytes(), 9))
    flat = p.reshape(-1)
    total = 0.0
    for v in flat[flat > 0]:  # row-major, sequential f64 sum, as the Rust test adds
        total += float(v)
    print(f"{OUT.name}: {OUT.stat().st_size} bytes; p>0 pixels {int((flat > 0).sum())}, sum p {total!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
