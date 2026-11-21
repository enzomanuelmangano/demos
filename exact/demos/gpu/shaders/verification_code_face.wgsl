// Verification Code Face (src/animations/verification-code-face): the IconSquare, a 96² view
// under perspective(300) rotateY(θ) rotateX(−π/8) about its centre, as Core Animation draws it:
// the view's layer (its black continuous square and the face's sublayers, drawn flat into
// `layer` at the screen's scale) sampled bilinearly through the inverse transform, the quad's
// edges not antialiased (UIViewEdgeAntialiasing is off).
struct Uniforms {
    // Canvas points → the square's points: the inverse projective 3×3, by rows.
    h0: vec4<f32>,
    h1: vec4<f32>,
    h2: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The square's side (points), the layer's side (pixels).
    layer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var face: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

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
    let p = vec3<f32>(in.uv * u.canvas.xy / u.canvas.z, 1.0);
    let q = vec3<f32>(dot(u.h0.xyz, p), dot(u.h1.xyz, p), dot(u.h2.xyz, p));
    if (q.z <= 0.0) {
        return vec4<f32>(0.0);
    }
    let l = q.xy / q.z;
    let side = u.layer.x;
    if (any(l < vec2<f32>(0.0)) || any(l >= vec2<f32>(side))) {
        return vec4<f32>(0.0);
    }
    let texel = 0.5 / u.canvas.z;
    let c = textureSampleLevel(face, smp, clamp(l, vec2<f32>(texel), vec2<f32>(side - texel)) / side, 0.0);
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        return vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
