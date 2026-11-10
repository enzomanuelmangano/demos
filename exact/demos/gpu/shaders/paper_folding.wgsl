// Paper Folding (src/animations/paper-folding), per pixel: the blurred sweep background (drawn
// once, `background`), then the paper's three folds back to front (2, 1, 0: the first fold is
// on top). Each fold is a 250 × 110 rect seen through an orthographic rotateX: on screen it
// spans `length` (signed: negative when it is flipped, its content mirrored) from `top`. Fold 0
// is white (its drop shadow falls outside its own canvas); folds 1 and 2 are their colour under
// an inner Shadow (dx 0, dy 12, blur 25, #efefef): what lies outside the rect, moved down 12
// and blurred (σ 25), over the rect.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The paper's left and top (points), its width, a fold's height.
    paper: vec4<f32>,
    // Per fold 0, 1, 2: its top (points, from the paper's top), its signed length, its wrapper's
    // scale about the paper's top centre (perspective 1e6 about a transformOrigin z), unused.
    folds: array<vec4<f32>, 3>,
    // The colour of folds 1 and 2 (straight sRGB).
    shade: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var background: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

// <Shadow dy={12} blur={25} color="#efefef" inner>.
const SHADOW_DY: f32 = 12.0;
const SHADOW_SIGMA: f32 = 25.0;
const SHADOW: vec3<f32> = vec3<f32>(239.0 / 255.0);

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

// erf, Abramowitz & Stegun 7.1.26.
fn erf(x: f32) -> f32 {
    let t = 1.0 / (1.0 + 0.3275911 * abs(x));
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
    return sign(x) * y;
}

// The share of a Gaussian (σ) about p that falls in [a, b].
fn within(p: f32, a: f32, b: f32) -> f32 {
    let k = 1.0 / (SHADOW_SIGMA * 1.41421356);
    return 0.5 * (erf((b - p) * k) - erf((a - p) * k));
}

// How much of the pixel at p (device px) a span [a, b] (device px) covers.
fn span(p: f32, a: f32, b: f32) -> f32 {
    return clamp(min(p - a, b - p) + 0.5, 0.0, 1.0);
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = in.uv * u.canvas.xy;
    let p = px / s;
    let w = u.paper.z;
    let fh = u.paper.w;
    var c = textureSampleLevel(background, smp, in.uv, 0.0);
    let mid = u.paper.x + w * 0.5;
    for (var k = 2; k >= 0; k = k - 1) {
        let f = u.folds[k];
        let top = u.paper.y + f.x;
        let len = f.y;
        if (abs(len) * s < 0.01) { continue; }
        let a = min(top, top + len) * s;
        let b = max(top, top + len) * s;
        let half = w * 0.5 * f.z;
        let cover = span(px.x, (mid - half) * s, (mid + half) * s) * span(px.y, a, b);
        if (cover <= 0.0) { continue; }
        let local = vec2<f32>((p.x - mid) / f.z + w * 0.5, clamp((p.y - top) / len, 0.0, 1.0) * fh);
        var rgb = vec3<f32>(1.0);
        if (k > 0) {
            let inside = within(local.x, 0.0, w) * within(local.y, SHADOW_DY, fh + SHADOW_DY);
            rgb = mix(u.shade.rgb, SHADOW, 1.0 - inside);
        }
        c = vec4<f32>(rgb, 1.0) * cover + c * (1.0 - cover);
    }
    var rgb = c.rgb;
    if (u.canvas.w > 0.5 && c.a > 0.0) { rgb = to_linear(rgb / c.a) * c.a; }
    return vec4<f32>(rgb, c.a);
}
