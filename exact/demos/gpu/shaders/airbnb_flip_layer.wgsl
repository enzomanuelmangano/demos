// Airbnb Flip Interaction (src/animations/airbnb-flip-interaction): one step of building a card
// face's texture: `top` (a layer the face drew, or its text shadow blurred by Graphite) over
// `acc`, premultiplied sRGB-encoded, as Core Graphics composites a Text's shadow under it.
struct Uniforms {
    // 1 when `top` is a blurred low-resolution image (sampled through `low`, inside `out`).
    mode: vec4<f32>,
    low: vec4<f32>,
    out: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var acc: texture_2d<f32>;
@group(0) @binding(2) var top: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

@fragment
fn over(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let under = textureLoad(acc, vec2<i32>(p), 0);
    var t = vec4<f32>(0.0);
    if (u.mode.x > 0.5) {
        if (all(p >= u.out.xy) && all(p <= u.out.zw)) {
            t = textureSampleLevel(top, smp, p * u.low.xy + u.low.zw, 0.0);
        }
    } else {
        t = textureLoad(top, vec2<i32>(p), 0);
    }
    return t + under * (1.0 - t.a);
}
