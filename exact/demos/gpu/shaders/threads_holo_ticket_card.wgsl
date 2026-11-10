// Threads Holo Ticket's HolographicCard canvas (src/animations/threads-holo-ticket/src/
// components/holographic-card.tsx), one pass per device pixel of its 300 × 400 Display P3
// surface, every layer kept at 8 bits as RN Skia's Graphite stores it:
//
//   <Group clip={two circles r 25 at (150, 0), (150, 400)} invertClip>
//     <RoundedRect 0 0 300 400 r 5 color #FFF5EEFF />
//     <Mask mode="luminance">              (a layer of the children, a dstIn layer of the mask
//       <Rect><LinearGradient 7 stops/></Rect>        through LumaColorFilter)
//       <Image gridTexture dstIn />
//     mask: <Rect white opacity={maskOpacity}/> <Circle r 160 black><BlurMask 200/></Circle>
//
// - The clip is a path (two contours): Graphite draws it into depth with 4× MSAA, its circles
//   tessellated into Wang's-formula chords (u.notch_chain); a pixel keeps the samples outside
//   both. The layer and the rounded rect are drawn on the samples it keeps.
// - The rounded rect: AnalyticRRectRenderStep's coverage for a filled rrect with circular
//   corners (edge distance, the corners' implicit-circle distance), + 0.5, saturated.
// - The gradient: the stops in Display P3, interpolated there (unpremultiplied, opaque).
// - gridTexture: the 25 × 34 circles of radius LogoSize / 2 filled into an 8-bit texture at
//   device pixels (useTexture), a path, so 4× MSAA of its chords (u.grid_chain); drawn 1:1
//   with dstIn.
// - The blurred circle: BlurMask's σ (200 × 3, clamped to Skia's 532 device pixels), as
//   Graphite's analytic circle blur: σ / r binned to 1/256 below 16.16 fixed point, a 512-texel
//   profile out to r + 3σ (a texture the module makes on the CPU), sampled linearly at
//   (|p − c| + 0.5) / textureRadius.
// - LumaColorFilter: dot((0.2126, 0.7152, 0.0722), premultiplied rgb) as the mask's alpha.
struct Card {
    // The surface (device pixels: width, height), device pixels per point, unused.
    canvas: vec4<f32>,
    // The rounded rect's colour (Display P3, opaque), its radius in device pixels.
    base: vec4<f32>,
    // The mask circle's centre (device pixels), 1 / the profile's texture radius (device
    // pixels), and the Rect's opacity as its 8-bit layer stores it.
    mask: vec4<f32>,
    // The gradient's start and end (points).
    gradient: vec4<f32>,
    // The seven stops (Display P3, opaque) and their positions.
    stops: array<vec4<f32>, 7>,
    positions: array<vec4<f32>, 2>,
    // The notches: centre x, top y, bottom y, radius (device pixels).
    notch: vec4<f32>,
    // The grid: cell, radius (device pixels), columns, rows.
    grid: vec4<f32>,
    // Chord counts: a notch circle's quarter, a grid circle's quarter.
    counts: vec4<f32>,
    // Each quarter circle's chain from (1, 0) to (0, 1), unit radius, two points per vec4: a
    // notch's, a grid circle's.
    notch_chain: array<vec4<f32>, 17>,
    grid_chain: array<vec4<f32>, 17>,
};

@group(0) @binding(0) var<uniform> u: Card;
// The blur profile: 512 × 1 texels, 8 bits, filtered linearly (clamped).
@group(0) @binding(1) var profile: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    return o;
}

// The 4× standard sample positions in a pixel.
const SAMPLES = array<vec2<f32>, 4>(vec2<f32>(0.375, 0.125), vec2<f32>(0.875, 0.375), vec2<f32>(0.125, 0.625), vec2<f32>(0.625, 0.875));

// An 8-bit channel store.
fn q8(v: f32) -> f32 {
    return floor(clamp(v, 0.0, 1.0) * 255.0 + 0.5) / 255.0;
}
fn q8v(v: vec4<f32>) -> vec4<f32> {
    return floor(clamp(v, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0 + 0.5) / 255.0;
}

fn chain_point(grid: bool, k: u32) -> vec2<f32> {
    let v = select(u.notch_chain[k / 2u], u.grid_chain[k / 2u], grid);
    return select(v.zw, v.xy, k % 2u == 0u);
}

// Whether `d` (from the circle's centre, in its radii) is inside the chord polygon whose
// first-quadrant chain has `n` chords.
fn in_chain(d: vec2<f32>, grid: bool, n: u32) -> bool {
    let q = abs(d);
    for (var k = 0u; k < n; k = k + 1u) {
        let a = chain_point(grid, k);
        let b = chain_point(grid, k + 1u);
        let e = b - a;
        let w = q - a;
        if (e.x * w.y - e.y * w.x <= 0.0) {
            return false;
        }
    }
    return true;
}

fn stop_position(i: u32) -> f32 {
    return u.positions[i / 4u][i % 4u];
}

fn gradient(p: vec2<f32>) -> vec3<f32> {
    let a = u.gradient.xy;
    let e = u.gradient.zw - a;
    let t = clamp(dot(p - a, e) / dot(e, e), 0.0, 1.0);
    if (t <= stop_position(0u)) {
        return u.stops[0].rgb;
    }
    for (var i = 1u; i < 7u; i = i + 1u) {
        let o = stop_position(i);
        if (t <= o) {
            let s = stop_position(i - 1u);
            return mix(u.stops[i - 1u].rgb, u.stops[i].rgb, (t - s) / (o - s));
        }
    }
    return u.stops[6].rgb;
}

// The analytic rrect coverage of a filled rect (0, 0, w, h) with circular corners of radius r,
// at the device pixel centre p.
fn rrect_coverage(p: vec2<f32>, size: vec2<f32>, r: f32) -> f32 {
    var d = min(min(p.x, size.x - p.x), min(p.y, size.y - p.y));
    let c = clamp(p, vec2<f32>(r), size - vec2<f32>(r));
    let v = p - c;
    if (v.x != 0.0 && v.y != 0.0) {
        // The implicit circle's distance: (r² − |v|²) / (2|v|) (its value over its gradient).
        let l = length(v);
        d = (r * r - l * l) / (2.0 * l);
    }
    return clamp(d + 0.5, 0.0, 1.0);
}

@fragment
fn card(in: Out) -> @location(0) vec4<f32> {
    let px = in.pos.xy;
    let s = u.canvas.z;
    let p = px / s;
    let origin = floor(px);

    // The clip's and the grid's samples.
    var kept = 0.0;
    var grid = 0.0;
    let nr = u.notch.w;
    let gc = u.grid.x;
    let gr = u.grid.y;
    let n_notch = u32(u.counts.x);
    let n_grid = u32(u.counts.y);
    for (var k = 0u; k < 4u; k = k + 1u) {
        let sp = origin + SAMPLES[k];
        let top = (sp - vec2<f32>(u.notch.x, u.notch.y)) / nr;
        let bottom = (sp - vec2<f32>(u.notch.x, u.notch.z)) / nr;
        let out_top = any(abs(top) > vec2<f32>(1.0)) || !in_chain(top, false, n_notch);
        let out_bottom = any(abs(bottom) > vec2<f32>(1.0)) || !in_chain(bottom, false, n_notch);
        if (out_top && out_bottom) {
            kept = kept + 1.0;
        }
        let cell = floor(sp / gc);
        if (cell.x >= 0.0 && cell.x < u.grid.z && cell.y >= 0.0 && cell.y < u.grid.w) {
            let d = (sp - (cell + 0.5) * gc) / gr;
            if (all(abs(d) <= vec2<f32>(1.0)) && in_chain(d, true, n_grid)) {
                grid = grid + 1.0;
            }
        }
    }
    if (kept == 0.0) {
        return vec4<f32>(0.0);
    }

    // The Mask's children layer: the gradient rect, then the grid image (dstIn).
    let g = q8(grid / 4.0);
    var layer = q8v(vec4<f32>(gradient(p), 1.0));
    layer = q8v(layer * g);
    // The mask layer: the white rect at its opacity, the blurred black circle over it.
    let to_centre = (px - u.mask.xy) * u.mask.z;
    let a = textureSampleLevel(profile, smp, vec2<f32>(length(to_centre) + 0.5 * u.mask.z, 0.5), 0.0).r;
    let m = q8(u.mask.w * (1.0 - a));
    // LumaColorFilter (r = g = b = m), then dstIn.
    let luma = clamp(dot(vec3<f32>(0.2126, 0.7152, 0.0722), vec3<f32>(m)), 0.0, 1.0);
    layer = q8v(layer * luma);

    // On each kept sample: the rounded rect, the layer over it.
    let cover = rrect_coverage(px, u.canvas.xy, u.base.w);
    let base = q8v(vec4<f32>(u.base.rgb * cover, cover));
    let sample_value = q8v(layer + base * (1.0 - layer.a));
    return q8v(sample_value * (kept / 4.0));
}
