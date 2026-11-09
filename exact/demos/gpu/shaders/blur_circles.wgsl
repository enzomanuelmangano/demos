// Blur Circles (src/animations/blur-circles): the composite of its Skia groups, per pixel, over
// white. `inside` is the sweep circle clipped to the glass circle and blurred (Blur 10); `sharp`
// is the sweep circle, shown outside the glass (invertClip); `mask` is the glass circle blurred
// (BlurMask 20) for its "inner" shade: rgba(0,0,0,0.08) × coverage × blurred coverage. Then the
// glass's white hairline (rgba(255,255,255,0.25), 1 pt).
struct Uniforms {
    // The glass circle's centre and radius (device pixels), the hairline's width (device px).
    glass: vec4<f32>,
    // The canvas (device pixels), whether the target encodes sRGB itself.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inside: texture_2d<f32>;
@group(0) @binding(2) var sharp: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
    return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy;
    let d = distance(p, u.glass.xy);
    let cover = clamp(u.glass.z - d + 0.5, 0.0, 1.0);
    var c = vec3<f32>(1.0);
    let a = textureSampleLevel(inside, smp, in.uv, 0.0) * cover;
    c = c * (1.0 - a.a) + a.rgb;
    let b = textureSampleLevel(sharp, smp, in.uv, 0.0) * (1.0 - cover);
    c = c * (1.0 - b.a) + b.rgb;
    let shade = 0.08 * cover * textureSampleLevel(mask, smp, in.uv, 0.0).a;
    c = c * (1.0 - shade);
    let ring = 0.25 * clamp(0.5 * u.glass.w - abs(d - u.glass.z) + 0.5, 0.0, 1.0);
    c = c * (1.0 - ring) + vec3<f32>(ring);
    if (u.canvas.z > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
