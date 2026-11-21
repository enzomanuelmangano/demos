// Fibonacci Shader's full-bleed layout, composed: the far field (a small texture, read
// bilinearly) plus the near parts the quads added, clamped as the effect clamps its sum.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, and whether the target
    // encodes sRGB itself (1).
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var far: texture_2d<f32>;
@group(0) @binding(2) var near: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let f = textureSampleLevel(far, smp, in.pos.xy / u.canvas.xy, 0.0).rgb;
    let n = textureLoad(near, vec2<i32>(in.pos.xy), 0).rgb;
    var rgb = clamp(f + n, vec3<f32>(0.0), vec3<f32>(1.0));
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb, 1.0);
}
