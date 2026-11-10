// Airbnb Flip Interaction's card (src/animations/airbnb-flip-interaction/flip-interaction/
// components/card/index.tsx): the two faces, each a texture of its layer (its box shadow, its
// content clipped to the continuous rounded rect) drawn once, shown through its own transform
// [perspective 1000, rotateY, scale] about its centre as Core Animation projects a layer: per
// pixel, the inverse of that plane's projective map finds the point of the face it shows,
// sampled bilinearly. A face turned away is not drawn (backfaceVisibility hidden); the back is
// the later sibling, over the front.
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The face box's origin in the canvas (pt), the texture's margin (pt), its size (px).
    face: vec4<f32>,
    // Front, then back: the screen → face plane map's rows (pt), .w of the first row 1 when shown.
    front0: vec4<f32>,
    front1: vec4<f32>,
    front2: vec4<f32>,
    back0: vec4<f32>,
    back1: vec4<f32>,
    back2: vec4<f32>,
    tex: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var front_tex: texture_2d<f32>;
@group(0) @binding(2) var back_tex: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn face(t: texture_2d<f32>, r0: vec4<f32>, r1: vec4<f32>, r2: vec4<f32>, p: vec2<f32>) -> vec4<f32> {
    if (r0.w < 0.5) { return vec4<f32>(0.0); }
    let w = dot(r2.xyz, vec3<f32>(p, 1.0));
    if (w <= 0.0) { return vec4<f32>(0.0); }
    let q = vec2<f32>(dot(r0.xyz, vec3<f32>(p, 1.0)), dot(r1.xyz, vec3<f32>(p, 1.0))) / w;
    let uv = (q + u.face.zw) * u.canvas.z / u.tex.xy;
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(0.0); }
    return textureSampleLevel(t, smp, uv, 0.0);
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // The pixel's centre in the face box's points.
    let p = pos.xy / u.canvas.z - u.face.xy;
    let f = face(front_tex, u.front0, u.front1, u.front2, p);
    let b = face(back_tex, u.back0, u.back1, u.back2, p);
    var c = b + f * (1.0 - b.a);
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
