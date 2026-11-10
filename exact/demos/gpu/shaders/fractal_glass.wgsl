// Fractal Glass (src/animations/fractal-glass/index.tsx), composed per pixel as RN's Skia
// canvas and Core Animation compose it. The canvas (transparent) holds:
// - outside the glass rect (Group clip invertClip): the sharp circle, Graphite's
//   AnalyticRRect coverage (`sharp`, drawn by fractal_glass_rrect.wgsl, 8-bit);
// - inside it (Group clip + Mask mode "alpha" = a layer L1, a dstIn layer L2): L1 holds the
//   circle under `<Blur blur={25} mode="decal">`, Graphite's blur (`blurred`: the low-resolution
//   result of skia::blur::GraphiteBlur, drawn back up with bilinear sampling and written into
//   L1 as 8 bits, within the result's layer bounds); L2 the 4 × 4 LinearGradient cells of
//   fractal-glass-mask.tsx (white → rgba(0,0,0,0.45), top left → bottom right less 5 pt),
//   whose 8-bit alpha L1 is multiplied by (dstIn), again 8 bits.
// Core Animation then puts the canvas over the view's background (withTiming white ↔ black):
// premultiplied src-over in the encoded values; an sRGB target gets the result linearised.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The glass rect in points: x, y, width, height.
    glass: vec4<f32>,
    // The background's colour (straight sRGB, opaque).
    background: vec4<f32>,
    // A device pixel's centre → the blurred texture's uv: uv = p · xy + zw.
    low: vec4<f32>,
    // The blurred result's layer bounds in device pixels (l, t, r, b); empty: no blur.
    output: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sharp: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

// gradientsAmount.
const CELLS: f32 = 4.0;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// A write into an 8-bit surface.
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

// How much of the pixel at p (device px) a span [a, b] (device px) covers on one axis.
fn span(p: f32, a: f32, b: f32) -> f32 {
    return clamp(min(p - a, b - p) + 0.5, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = pos.xy;
    let p = px / s;
    let g = u.glass;
    let inside = span(px.x, g.x * s, (g.x + g.z) * s) * span(px.y, g.y * s, (g.y + g.w) * s);
    // L1: the blurred circle, inside the result's bounds.
    var l1 = vec4<f32>(0.0);
    let o = u.output;
    if (px.x >= o.x && px.x < o.z && px.y >= o.y && px.y < o.w) {
        l1 = q8(textureSampleLevel(blurred, smp, px * u.low.xy + u.low.zw, 0.0));
    }
    // L2's alpha: the cell's gradient at the pixel's centre, unpremultiplied mix, 8 bits.
    let cell = vec2<f32>(g.z, g.w) / CELLS;
    let index = clamp(floor((p - g.xy) / cell), vec2<f32>(0.0), vec2<f32>(CELLS - 1.0));
    let start = g.xy + cell * index;
    let dir = cell - vec2<f32>(5.0);
    let t = clamp(dot(p - start, dir) / dot(dir, dir), 0.0, 1.0);
    let mask = round(mix(1.0, 0.45, t) * 255.0) / 255.0;
    // dstIn.
    l1 = q8(l1 * mask);
    let outside = textureLoad(sharp, vec2<i32>(px), 0);
    let canvas = l1 * inside + outside * (1.0 - inside);
    var c = canvas.rgb + u.background.rgb * (1.0 - canvas.a);
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
