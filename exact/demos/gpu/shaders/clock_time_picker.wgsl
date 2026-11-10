// Clock Time Picker (src/animations/clock-time-picker): the canvas's layers, src-over on
// premultiplied sRGB-encoded colours. `base` holds the clock face and ticks and the time list
// (text and its two gradient overlays, clipped to the list); then each hand and the centre dot,
// each with its own drop shadow (black, blur 10: the shape's alpha blurred by Graphite, clipped to
// the clock's 100 × 100 canvas) under it.
struct Uniforms {
    // The canvas (device px), unused, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // Shadow k: uv = p · low.xy + low.zw, defined inside out (ltrb, device px).
    low0: vec4<f32>,
    out0: vec4<f32>,
    low1: vec4<f32>,
    out1: vec4<f32>,
    low2: vec4<f32>,
    out2: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var hour: texture_2d<f32>;
@group(0) @binding(3) var minute: texture_2d<f32>;
@group(0) @binding(4) var dot: texture_2d<f32>;
@group(0) @binding(5) var b0: texture_2d<f32>;
@group(0) @binding(6) var b1: texture_2d<f32>;
@group(0) @binding(7) var b2: texture_2d<f32>;
@group(0) @binding(8) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn shadow(t: texture_2d<f32>, low: vec4<f32>, o: vec4<f32>, p: vec2<f32>) -> f32 {
    if (any(p < o.xy) || any(p > o.zw)) { return 0.0; }
    return textureSampleLevel(t, smp, p * low.xy + low.zw, 0.0).a;
}

fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let q = vec2<i32>(p);
    var c = textureLoad(base, q, 0);
    c = over(textureLoad(hour, q, 0), c * (1.0 - shadow(b0, u.low0, u.out0, p)));
    c = over(textureLoad(minute, q, 0), c * (1.0 - shadow(b1, u.low1, u.out1, p)));
    c = over(textureLoad(dot, q, 0), c * (1.0 - shadow(b2, u.low2, u.out2, p)));
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
