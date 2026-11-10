// Duration Slider (src/animations/duration-slider/src/components): the canvas's layers combined
// per pixel, in Skia's draw order, src-over on premultiplied sRGB-encoded colours. Layers come
// from packages/skia (t3…t8) and Graphite blurs (t0…t2, read through their low-resolution
// mappings).
//
// `background` (once): the BlurMask-'inner' disc (blur 30 of the r + 35 circle, clipped to it),
// then the inner-shadowed rim (blur 10 of the r + 37 circle, clipped to it; RN Skia's inner
// Shadow #e9e9e9, dy 20, blur 10), then the dots.
// `rim_saturate` (once): the rim's alpha saturated (AlphaSaturate: a × 255, clamped), the inner
// shadow's coverage.
// `disc` (once): Group opacity 0.5 { blur 20 of the #222 disc; the disc }; the white disc.
// `saturate` (per frame): the knob's alpha saturated.
// `compose` (per frame): background; the donut; under the r + 35 clip: its blur-100 glow, the
// donut, the picker's blur-20 glow, the picker, the white knob with its inner shadow (#d4d4d4,
// dy 20, blur 10); then the inner disc layer and the value.
struct Uniforms {
    // The canvas (device px), device px per point, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The centre (device px), the clip circle's radius (device px), unused.
    clip: vec4<f32>,
    // Blur k: uv = p · low.xy + low.zw, defined inside out (ltrb, device px).
    low0: vec4<f32>,
    out0: vec4<f32>,
    low1: vec4<f32>,
    out1: vec4<f32>,
    low2: vec4<f32>,
    out2: vec4<f32>,
    // The rim's own clip radius (device px) for `background`, the inner shadows' dy (device px).
    extra: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var t2: texture_2d<f32>;
@group(0) @binding(4) var t3: texture_2d<f32>;
@group(0) @binding(5) var t4: texture_2d<f32>;
@group(0) @binding(6) var t5: texture_2d<f32>;
@group(0) @binding(7) var t6: texture_2d<f32>;
@group(0) @binding(8) var t7: texture_2d<f32>;
@group(0) @binding(9) var t8: texture_2d<f32>;
@group(0) @binding(10) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn inside(p: vec2<f32>, o: vec4<f32>) -> bool {
    return all(p >= o.xy) && all(p <= o.zw);
}

fn blur0(p: vec2<f32>) -> vec4<f32> {
    if (!inside(p, u.out0)) { return vec4<f32>(0.0); }
    return textureSampleLevel(t0, smp, p * u.low0.xy + u.low0.zw, 0.0);
}

fn blur1(p: vec2<f32>) -> vec4<f32> {
    if (!inside(p, u.out1)) { return vec4<f32>(0.0); }
    return textureSampleLevel(t1, smp, p * u.low1.xy + u.low1.zw, 0.0);
}

fn blur2(p: vec2<f32>) -> vec4<f32> {
    if (!inside(p, u.out2)) { return vec4<f32>(0.0); }
    return textureSampleLevel(t2, smp, p * u.low2.xy + u.low2.zw, 0.0);
}

fn texel(t: texture_2d<f32>, p: vec2<f32>) -> vec4<f32> {
    return textureLoad(t, vec2<i32>(p), 0);
}

fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

// An anti-aliased circle clip's coverage at p (radius in device px).
fn clip_cover(p: vec2<f32>, radius: f32) -> f32 {
    return clamp(radius - distance(p, u.clip.xy) + 0.5, 0.0, 1.0);
}

// RN Skia's inner shadow over `src`: colour · (1 − blur(saturated alpha, shifted by dy)) · src.a,
// then src over it (the blurred complement of the shape is 1 − the blurred shape).
fn inner_shadow(src: vec4<f32>, blurred: f32, color: vec3<f32>) -> vec4<f32> {
    let a = (1.0 - blurred) * src.a;
    return over(src, vec4<f32>(color * a, a));
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// t0: blur 30 of the disc; t1: blur 10 of the rim circle; t2: blur 10 of the rim's saturated
// alpha; t3: the dots.
@fragment
fn background(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var c = blur0(p) * clip_cover(p, u.clip.z);
    let rim = blur1(p) * clip_cover(p, u.extra.x);
    c = over(inner_shadow(rim, blur2(p).a, vec3<f32>(233.0 / 255.0)), c);
    return over(texel(t3, p), c);
}

// t1: blur 10 of the rim circle.
@fragment
fn rim_saturate(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let a = (blur1(pos.xy) * clip_cover(pos.xy, u.extra.x)).a;
    return vec4<f32>(min(a * 255.0, 1.0));
}

// t0: blur 20 of the dark disc; t3: the dark disc; t4: the white disc.
@fragment
fn disc(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let dark = over(texel(t3, p), blur0(p)) * 0.5;
    return over(texel(t4, p), dark);
}

// t3: the knob.
@fragment
fn saturate(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(min(texel(t3, pos.xy).a * 255.0, 1.0));
}

// t0: the donut's glow; t1: the picker's glow; t2: blur 10 of the knob's saturated alpha;
// t3: the background; t4: the donut; t5: the picker; t6: the knob; t7: the inner disc; t8:
// the value.
@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var c = texel(t3, p);
    let donut = texel(t4, p);
    c = over(donut, c);
    let k = clip_cover(p, u.clip.z);
    c = over(blur0(p) * k, c);
    c = over(donut * k, c);
    c = over(blur1(p) * k, c);
    c = over(texel(t5, p) * k, c);
    c = over(inner_shadow(texel(t6, p), blur2(p).a, vec3<f32>(212.0 / 255.0)) * k, c);
    c = over(texel(t7, p), c);
    c = over(texel(t8, p), c);
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
