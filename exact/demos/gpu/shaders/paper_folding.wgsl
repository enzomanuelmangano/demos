// Paper Folding (src/animations/paper-folding), per pixel: the blurred sweep background (drawn
// once, `background`), the paper's soft shadow on it, then the paper's three folds back to front
// (2, 1, 0: the first fold is on top). Each fold is a 250 × 110 rect seen through an
// orthographic rotateX: on screen it spans `length` (signed: negative when it is flipped, its
// back seen, mirrored) from `top`. Folds 1 and 2 keep RN's inner Shadow (dx 0, dy 12, blur 25,
// #efefef) and part of its grey (`shade`).
//
// Past RN (the owner's phone note, 2026-11-15: "faster, and more like paper"): a warm off-white
// sheet with a fibre grain fixed to the paper (its back differs), a crease line at each hinge
// that deepens as it folds, Lambert light on the rotating fold from its angle, a thin bright
// edge where it faces the light, a soft shadow from each fold onto the ones under it that grows
// as the paper closes, and the folded edges' thickness (a lit half-cylinder rim) once folded.
// All analytic: no texture but the background, no second pass.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The paper's left and top (points), its width, a fold's height.
    paper: vec4<f32>,
    // Per fold 0, 1, 2: its top (points, from the paper's top), its signed length, its wrapper's
    // scale about the paper's top centre (perspective 1e6 about a transformOrigin z), unused.
    folds: array<vec4<f32>, 3>,
    // RN's colour of folds 1 and 2 (straight sRGB).
    shade: vec4<f32>,
    // The progress drawn (0 folded … 1 open, the landing's settle included), unused × 3.
    look: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var background: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

// <Shadow dy={12} blur={25} color="#efefef" inner>.
const SHADOW_DY: f32 = 12.0;
const SHADOW_SIGMA: f32 = 25.0;
const SHADOW: f32 = 239.0 / 255.0;
const PI: f32 = 3.14159265;
// A warm off-white (#FBF8F1).
const PAPER: vec3<f32> = vec3<f32>(0.984, 0.973, 0.945);
// The light: in front, a little above (screen y down, z toward the eye).
const LIGHT: vec3<f32> = vec3<f32>(0.0, -0.2425, 0.9701);
// The folded edge's rim: its radius (points) when fully folded.
const RIM: f32 = 2.0;

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
fn within(p: f32, a: f32, b: f32, sigma: f32) -> f32 {
    let k = 0.70710678 / sigma;
    return 0.5 * (erf((b - p) * k) - erf((a - p) * k));
}

// A rect [x0, x1] × [y0, y1] blurred by σ, at p: a box shadow's coverage.
fn box_shadow(p: vec2<f32>, x0: f32, x1: f32, y0: f32, y1: f32, sigma: f32) -> f32 {
    return within(p.x, x0, x1, sigma) * within(p.y, y0, y1, sigma);
}

// How much of the pixel at p (device px) a span [a, b] (device px) covers.
fn span(p: f32, a: f32, b: f32) -> f32 {
    return clamp(min(p - a, b - p) + 0.5, 0.0, 1.0);
}

// Value noise on a unit lattice, from an integer hash (no sin: exact on every GPU).
fn hash(c: vec2<i32>) -> f32 {
    var h = (bitcast<u32>(c.x) * 0x8da6b343u) ^ (bitcast<u32>(c.y) * 0xd8163841u);
    h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
    h = (h ^ (h >> 12u)) * 0x297a2d39u;
    h = h ^ (h >> 15u);
    return f32(h >> 8u) * (1.0 / 16777216.0);
}

fn noise(q: vec2<f32>) -> f32 {
    let i = vec2<i32>(floor(q));
    let f = fract(q);
    let s = f * f * (3.0 - 2.0 * f);
    let a = hash(i);
    let b = hash(i + vec2<i32>(1, 0));
    let c = hash(i + vec2<i32>(0, 1));
    let d = hash(i + vec2<i32>(1, 1));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y) - 0.5;
}

// The sheet's grain at q (points on the sheet): a fine tooth, two crossing families of short
// fibres, and the cloudy formation of the pulp. About ±2 %.
fn fibre(q: vec2<f32>, seed: f32) -> f32 {
    let o = vec2<f32>(seed * 37.0, seed * 11.0);
    let tooth = noise(q * 0.8 + o);
    let r1 = vec2<f32>(q.x * 0.94 + q.y * 0.34, q.y * 0.94 - q.x * 0.34);
    let r2 = vec2<f32>(q.x * 0.82 - q.y * 0.57, q.y * 0.82 + q.x * 0.57);
    let f1 = noise(vec2<f32>(r1.x * 0.16, r1.y * 1.25) + o * 1.7);
    let f2 = noise(vec2<f32>(r2.x * 0.13, r2.y * 1.1) - o);
    let cloud = noise(q * 0.045 + o * 0.3);
    return 1.0 + 0.012 * tooth + 0.014 * (f1 + f2) + 0.018 * cloud;
}

// A thin line of width w (points) at distance d: 1 on it, 0 away from it.
fn line(d: f32, w: f32) -> f32 {
    let x = d / w;
    return exp(-x * x);
}

// A folded edge's rim: a half-cylinder of radius r on the hinge at y = h, bulging toward `dir`
// (±1 in screen y). Returns its colour (rgb) and coverage (a).
fn rim(p: vec2<f32>, px: vec2<f32>, s: f32, x0: f32, x1: f32, h: f32, dir: f32, r: f32) -> vec4<f32> {
    if (r < 0.05) { return vec4<f32>(0.0); }
    let a = select(h - r, h, dir > 0.0) * s;
    let b = select(h, h + r, dir > 0.0) * s;
    let cover = span(px.x, x0 * s, x1 * s) * span(px.y, a, b);
    if (cover <= 0.0) { return vec4<f32>(0.0); }
    let t = clamp((p.y - h) * dir / r, 0.0, 1.0);
    let n = vec3<f32>(0.0, dir * t, sqrt(max(1.0 - t * t, 0.0)));
    let lit = dot(n, LIGHT) / LIGHT.z;
    // Its silhouette: a hairline where the bend turns away.
    let outline = 1.0 - 0.14 * line(1.0 - t, 0.35 / r);
    return vec4<f32>(PAPER * clamp(0.72 + 0.32 * lit, 0.55, 1.05) * outline, cover);
}

fn over(c: vec4<f32>, rgb: vec3<f32>, cover: f32) -> vec4<f32> {
    return vec4<f32>(rgb, 1.0) * cover + c * (1.0 - cover);
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = in.uv * u.canvas.xy;
    let p = px / s;
    let w = u.paper.z;
    let fh = u.paper.w;
    let mid = u.paper.x + w * 0.5;
    var c = textureSampleLevel(background, smp, in.uv, 0.0);

    // Each fold's rect on screen (points).
    var y0: array<f32, 3>;
    var y1: array<f32, 3>;
    var hw: array<f32, 3>;
    var cov: array<f32, 3>;
    for (var k = 0; k < 3; k = k + 1) {
        let f = u.folds[k];
        let top = u.paper.y + f.x;
        y0[k] = min(top, top + f.y);
        y1[k] = max(top, top + f.y);
        hw[k] = w * 0.5 * f.z;
        cov[k] = 0.0;
        if (abs(f.y) * s >= 0.01) {
            cov[k] = span(px.x, (mid - hw[k]) * s, (mid + hw[k]) * s) * span(px.y, y0[k] * s, y1[k] * s);
        }
    }
    let top_y = min(y0[0], min(y0[1], y0[2]));
    let bottom_y = max(y1[0], max(y1[1], y1[2]));
    let x0 = mid - w * 0.5;
    let x1 = mid + w * 0.5;
    // Far from the paper: the background alone.
    if (p.x < x0 - 48.0 || p.x > x1 + 48.0 || p.y < top_y - 48.0 || p.y > bottom_y + 60.0) {
        return finish(c);
    }

    let pr = u.look.x;
    let folded = clamp(1.0 - pr, 0.0, 1.0);
    let theta = PI * (1.0 - pr);
    // The rotating fold's face toward the eye, and how it takes the light (1 when flat).
    var n = vec3<f32>(0.0, sin(theta), cos(theta));
    if (n.z < 0.0) { n = -n; }
    let lambert = dot(n, LIGHT) / LIGHT.z;
    // How far apart the layers stand (mid-fold) and how strongly the upper ones shade the lower.
    let lift = abs(sin(theta));
    let cast_k = 0.30 * pow(folded, 0.8);
    let cast_dy = 0.8 + 5.0 * lift;
    let cast_sigma = 1.0 + 6.0 * lift;

    // The paper's own shadow on the background: a contact shadow and a wide soft one.
    let contact = box_shadow(p - vec2<f32>(0.0, 1.2), x0 + 0.5, x1 - 0.5, top_y, bottom_y, 1.6) * 0.16;
    let ambient = box_shadow(p - vec2<f32>(0.0, 6.0), x0 + 4.0, x1 - 4.0, top_y + 2.0, bottom_y, 11.0) * 0.10;
    let sh = 1.0 - (1.0 - contact) * (1.0 - ambient);
    c = vec4<f32>(c.rgb * (1.0 - sh), c.a + (1.0 - c.a) * sh);

    // Hinge A joins folds 0 and 1, hinge B folds 1 and 2. Once folded past edge-on (the length
    // of fold 1 negative), both folds of a hinge lie on one side: the bend shows a rim.
    let hinge_a = u.paper.y + u.folds[1].x;
    let hinge_b = hinge_a + u.folds[1].y;
    let rim_r = RIM * smoothstep(0.5, 0.0, pr);
    let crease = 0.045 + 0.11 * folded;

    for (var k = 2; k >= 0; k = k - 1) {
        // Skip a fold a fold above it covers whole.
        var hidden = false;
        for (var j = 0; j < k; j = j + 1) {
            if (cov[j] >= 1.0) { hidden = true; }
        }
        if (k == 0) {
            // Hinge B's rim lies behind fold 0, in front of folds 1 and 2.
            let rb = rim(p, px, s, x0, x1, hinge_b, -1.0, rim_r);
            c = over(c, rb.rgb, rb.a);
        }
        if (cov[k] <= 0.0 || hidden) { continue; }
        let f = u.folds[k];
        let top = u.paper.y + f.x;
        let len = f.y;
        let local = vec2<f32>((p.x - mid) / f.z + w * 0.5, clamp((p.y - top) / len, 0.0, 1.0) * fh);
        // The grain, fixed to the sheet (continuous across the folds when flat); a fold seen
        // mirrored shows the sheet's back.
        let back = select(0.0, 1.0, len < 0.0);
        var rgb = PAPER * fibre(vec2<f32>(local.x, f32(k) * fh + local.y), back);
        var light = 1.0;
        if (k == 1) {
            // Lambert from its angle, and the valley it runs into (hinge B) darker.
            let valley = local.y / fh;
            light = clamp(1.0 + 0.32 * (lambert - 1.0), 0.5, 1.05) * mix(1.0, u.shade.r, 0.2) * (1.0 - 0.14 * lift * valley * valley);
        } else if (k == 2) {
            light = mix(1.0, u.shade.r, 0.55);
        }
        if (k > 0) {
            // RN's inner Shadow: #efefef where the rect's outside, moved down 12, blurred.
            let inside = within(local.x, 0.0, w, SHADOW_SIGMA) * within(local.y, SHADOW_DY, fh + SHADOW_DY, SHADOW_SIGMA);
            light = light * mix(1.0, SHADOW, 1.0 - inside);
        }
        // Fold 2 hangs furthest back: the folds in front cast their shadow down onto it.
        var lit = 1.0;
        if (k == 2) {
            for (var j = 0; j < 2; j = j + 1) {
                let b = box_shadow(p - vec2<f32>(0.0, cast_dy), mid - hw[j], mid + hw[j], y0[j], y1[j], cast_sigma);
                lit = lit * (1.0 - cast_k * b);
            }
        }
        rgb = rgb * light * lit;
        // Hinge B is a valley (fold 1 runs back into fold 2): a dark crease line, deeper as it
        // folds. Hinge A is a ridge: a thin bright edge on fold 0's lower edge, where the bend
        // turns to the light, strongest mid-fold; flat, a faint pressed line.
        if (k >= 1) {
            let d = select(top + len, top, k == 2);
            rgb = rgb * (1.0 - crease * line(p.y - d, 0.7));
        }
        if (k == 1) {
            rgb = rgb * (1.0 - 0.045 * line(p.y - top, 0.6));
        }
        if (k == 0) {
            // Folded, its top is a cut edge in front of hinge B's rim: a hairline.
            rgb = rgb * (1.0 - 0.10 * (rim_r / RIM) * line(p.y - top - 0.3, 0.45));
            let edge = top + len;
            rgb = rgb * (1.0 - 0.045 * pr * line(p.y - edge, 0.6));
            let glint = 0.7 * lift * smoothstep(0.45, 0.6, pr);
            rgb = mix(rgb, vec3<f32>(1.0), glint * line(p.y - (edge - 0.8), 0.7));
        }
        c = over(c, rgb, cov[k]);
    }
    // Hinge A's rim: the front of the folded stack's lower edge.
    let ra = rim(p, px, s, x0, x1, hinge_a, 1.0, rim_r);
    c = over(c, ra.rgb, ra.a);
    return finish(c);
}

fn finish(c: vec4<f32>) -> vec4<f32> {
    var rgb = c.rgb;
    if (u.canvas.w > 0.5 && c.a > 0.0) { rgb = to_linear(rgb / c.a) * c.a; }
    return vec4<f32>(rgb, c.a);
}
