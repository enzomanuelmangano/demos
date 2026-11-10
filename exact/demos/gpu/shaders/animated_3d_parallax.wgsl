// Animated 3D Parallax (src/animations/animated-3d-parallax): the card and the logo, each a
// view under its own `perspective` + `rotateX` + `rotateY`, as Core Animation draws them: a
// pixel shows the point of the view's plane its inverse transform finds there. The card is a
// #1E2731 rounded rect (300², radius 10) over its box shadow (black 0.15, blurred, a texture in
// the card's own points, 20 pt of margin); the logo is the bitmap's coverage in #179CF0, its
// 200 × 164.45 box centred in the 300² content view. Composited in sRGB over #17202A.
struct Uniforms {
    // Screen points → the card's points: the inverse projective 3×3, by rows.
    card0: vec4<f32>,
    card1: vec4<f32>,
    card2: vec4<f32>,
    // Screen points → the content view's points.
    logo0: vec4<f32>,
    logo1: vec4<f32>,
    logo2: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var shadow: texture_2d<f32>;
@group(0) @binding(2) var logo: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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

fn unproject(r0: vec4<f32>, r1: vec4<f32>, r2: vec4<f32>, p: vec2<f32>) -> vec3<f32> {
    let h = vec3<f32>(p, 1.0);
    return vec3<f32>(dot(r0.xyz, h), dot(r1.xyz, h), dot(r2.xyz, h));
}

// A rounded rect's signed distance: centre-relative `p`, half size `b`, radius `r`.
fn rrect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn inside(uv: vec2<f32>) -> bool {
    return all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy / u.canvas.z;

    let qc = unproject(u.card0, u.card1, u.card2, p);
    let lc = qc.xy / qc.z;
    let d = rrect(lc - vec2<f32>(150.0), vec2<f32>(150.0), 10.0);
    let fw = max(fwidth(d), 1e-4);
    let suv = (lc + vec2<f32>(20.0)) / 340.0;
    let s = textureSampleLevel(shadow, smp, suv, 0.0);

    let ql = unproject(u.logo0, u.logo1, u.logo2, p);
    let ll = ql.xy / ql.z;
    let luv = (ll - vec2<f32>(50.0, 67.7734375)) / vec2<f32>(200.0, 164.453125);
    let a = textureSample(logo, smp, luv).r;

    var c = vec3<f32>(23.0, 32.0, 42.0) / 255.0;
    if (qc.z > 0.0 && inside(suv)) {
        c = c * (1.0 - s.a) + s.rgb;
    }
    if (qc.z > 0.0) {
        c = mix(c, vec3<f32>(30.0, 39.0, 49.0) / 255.0, clamp(0.5 - d / fw, 0.0, 1.0));
    }
    if (ql.z > 0.0 && inside(luv)) {
        c = mix(c, vec3<f32>(23.0, 156.0, 240.0) / 255.0, a);
    }
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
