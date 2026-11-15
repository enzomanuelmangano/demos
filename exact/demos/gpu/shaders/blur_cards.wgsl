// Blur Cards (src/animations/blur-cards): five glass cards, drawn in order, each one
// <Path> fill (rgba(255,255,255,0.1)), <Path> stroke (2, rgba(255,255,255,0.2), opacity =
// progress) and a <BackdropBlur blur={5p} clip={card}> that blurs everything drawn so far (its own
// fill and stroke too) inside the card. A card is a rounded rect (300 × 200, radius 20, Core
// Animation's continuous corner: the owner's call over RN's circular arcs) seen
// through its group's 3D transform: a pixel finds the card's point with the inverse projective
// 3×3 and covers by the rounded rect's distance there.
//
// One pass, no texture blurs. What the blurs act on is the background (a σ-100 glow, which a
// σ-5 blur leaves as it is) and the cards' own edges: a Gaussian of an edge is Φ of the distance
// to it over σ, and of a 2 pt line the difference of two. Each edge is blurred by every backdrop
// blur after it whose card covers the pixel (its own included), so by σ·√n. Five rounded-rect
// distances per pixel replace five full-screen Gaussians and six full-screen passes a frame.
//
// The interface (Pass, the bindings, the entry points) is the one the binary was built with, so
// a native host takes this text by hot reload; the earlier binary ran this entry once per card
// boundary, and its last run (the one that reaches the screen) draws the whole picture here.
struct Pass {
    // prev*, next*, flags.xyw, `cur` and `blurred`: the earlier multi-pass driver's (one
    // card's inverse rows each, the canvas so far and its blur), unread here.
    prev0: vec4<f32>,
    prev1: vec4<f32>,
    prev2: vec4<f32>,
    next0: vec4<f32>,
    next1: vec4<f32>,
    next2: vec4<f32>,
    // z: progress (the spring's value).
    flags: vec4<f32>,
    // The target (device pixels), device pixels per point, 1 to write linear (an sRGB target).
    canvas: vec4<f32>,
    // The card's rect in its points: centre x, y, half width, half height.
    rect: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Pass;
@group(0) @binding(1) var cur: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
@group(0) @binding(3) var bg: texture_2d<f32>;
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

// continuous_rrect_sdf: packages/draw2d/src/continuous_sdf.rs (Core Animation's continuous corner).
const CRR_E: f32 = 1.528665;

struct CrrHit { d2: f32, side: f32 };

fn crr_project(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, end: f32, q: vec2<f32>) -> CrrHit {
    var t = 0.0;
    var best = 1e30;
    for (var i = 0; i < 5; i = i + 1) {
        let s = end * f32(i) / 4.0;
        let ms = 1.0 - s;
        let c = ms * ms * ms * p0 + 3.0 * ms * ms * s * p1 + 3.0 * ms * s * s * p2 + s * s * s * p3;
        let d = dot(c - q, c - q);
        if (d < best) { best = d; t = s; }
    }
    for (var i = 0; i < 3; i = i + 1) {
        let mt = 1.0 - t;
        let c = mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
        let d1 = 3.0 * (mt * mt * (p1 - p0) + 2.0 * mt * t * (p2 - p1) + t * t * (p3 - p2));
        let d2 = 6.0 * (mt * (p2 - 2.0 * p1 + p0) + t * (p3 - 2.0 * p2 + p1));
        let o = c - q;
        let h = dot(d1, d1) + dot(o, d2);
        if (h > 1e-6) { t = clamp(t - dot(o, d1) / h, 0.0, end); }
    }
    let mt = 1.0 - t;
    let c = mt * mt * mt * p0 + 3.0 * mt * mt * t * p1 + 3.0 * mt * t * t * p2 + t * t * t * p3;
    let d1 = 3.0 * (mt * mt * (p1 - p0) + 2.0 * mt * t * (p2 - p1) + t * t * (p3 - p2));
    let o = q - c;
    return CrrHit(dot(o, o), d1.x * o.y - d1.y * o.x);
}

// The signed distance (negative inside) from `p` to the continuous rounded rect centred at the
// origin, half size `half`, corner radius `r` (drawn at min(r, w / 2, h / 2)); corners that do
// not overlap (2 × 1.52866 r ≤ min(w, h)).
fn continuous_rrect_sdf(p: vec2<f32>, half: vec2<f32>, r_in: f32) -> f32 {
    let r = max(min(r_in, min(half.x, half.y)), 0.0);
    let qq = half - abs(p);
    let a = max(qq.x, qq.y);
    let b = min(qq.x, qq.y);
    let e = CRR_E * r;
    if (r <= 0.0 || a - e >= max(b, 0.0) || b >= 3.0 * r) { return -b; }
    let q = vec2<f32>(a, b) / r;
    let h1 = crr_project(vec2<f32>(CRR_E, 0.0), vec2<f32>(1.088493, 0.0), vec2<f32>(0.868407, 0.0), vec2<f32>(0.631494, 0.074911), 1.0, q);
    let h2 = crr_project(vec2<f32>(0.631494, 0.074911), vec2<f32>(0.372824, 0.169060), vec2<f32>(0.169060, 0.372824), vec2<f32>(0.074911, 0.631494), 0.5, q);
    var hit = h2;
    if (h1.d2 < h2.d2) { hit = h1; }
    let sx = max(CRR_E - q.x, 0.0);
    let side = sx * sx + q.y * q.y;
    if (side < hit.d2) { return select(sqrt(side), -sqrt(side), q.y > 0.0) * r; }
    return select(sqrt(hit.d2), -sqrt(hit.d2), hit.side < 0.0) * r;
}

// Φ, the standard normal CDF (logistic approximation, |error| < 2e-4).
fn phi(x: f32) -> f32 {
    let t = clamp(x, -8.0, 8.0);
    return 1.0 / (1.0 + exp(-1.5976 * t - 0.07056 * t * t * t));
}

const PI: f32 = 3.14159265;

// Card `i`'s signed distance (its points; continuous corners) at screen point `pt`, its group at progress `p`:
// [rotate(−π/2·p), translateX(25·i·p), perspective(10000), rotateY(π/3·p), rotate(π/4·p)] about
// the window's centre, its plane's projective 3×3 inverted by the adjugate; behind the eye, far.
fn card(i: f32, p: f32, pt: vec2<f32>) -> f32 {
    let a = -PI / 2.0 * p;
    let b = PI / 3.0 * p;
    let g = PI / 4.0 * p;
    let tx = 25.0 * i * p;
    let ru = vec3<f32>(cos(g), -sin(g), 0.0);
    let rv = vec3<f32>(sin(g), cos(g), 0.0);
    let rw = vec3<f32>(ru.xy * sin(b) / 10000.0, 1.0);
    let rx = cos(b) * ru + tx * rw;
    let r0 = cos(a) * rx - sin(a) * rv + u.rect.x * rw;
    let r1 = sin(a) * rx + cos(a) * rv + u.rect.y * rw;
    let c0 = cross(r1, rw);
    let c1 = cross(rw, r0);
    let c2 = cross(r0, r1);
    let q = (c0 * pt.x + c1 * pt.y + c2) / dot(r0, c0);
    return select(1e6, continuous_rrect_sdf(q.xy / q.z, u.rect.zw, 20.0), q.z > 0.0);
}

// A card's fill (x) and 2 pt stroke (y) coverage at distance `d` (its points; `fw` its
// fwidth, `g` its gradient's length, both a pixel), blurred by σ `s` device pixels.
fn profile(d: f32, fw: f32, g: f32, s: f32) -> vec2<f32> {
    if (s < 0.05) {
        return vec2<f32>(clamp(0.5 - d / fw, 0.0, 1.0), clamp(0.5 - (abs(d) - 1.0) / fw, 0.0, 1.0));
    }
    // Device pixels from the edge, the line's half width in them, and σ with the
    // anti-aliasing's own spread (a pixel-wide ramp: 1/12 px²).
    let dp = d / g;
    let hw = 1.0 / g;
    let se = sqrt(s * s + 0.0833);
    return vec2<f32>(phi(-dp / se), phi((hw - dp) / se) - phi((-hw - dp) / se));
}

@fragment
fn card_pass(in: Out) -> @location(0) vec4<f32> {
    let pt = in.uv * u.canvas.xy / u.canvas.z;
    let p = u.flags.z;
    // BackdropBlur's σ, device pixels.
    let sigma = max(5.0 * p, 0.0) * u.canvas.z;
    var d: array<f32, 5>;
    var fw: array<f32, 5>;
    var grad: array<f32, 5>;
    var inside: array<f32, 5>;
    for (var i = 0; i < 5; i = i + 1) {
        let di = card(f32(i), p, pt);
        let dx = dpdx(di);
        let dy = dpdy(di);
        d[i] = di;
        fw[i] = max(abs(dx) + abs(dy), 1e-4);
        grad[i] = max(length(vec2<f32>(dx, dy)), 1e-4);
        inside[i] = clamp(0.5 - di / fw[i], 0.0, 1.0);
    }
    _ = textureSampleLevel(cur, smp, in.uv, 0.0);
    _ = textureSampleLevel(blurred, smp, in.uv, 0.0);
    var c = textureSampleLevel(bg, smp, in.uv, 0.0).rgb;
    let stroke = 0.2 * clamp(p, 0.0, 1.0);
    // How many backdrop blurs (fractional at a clip's anti-aliased edge) reach card i's drawing.
    var n: array<f32, 5>;
    var after = 0.0;
    for (var i = 4; i >= 0; i = i - 1) {
        after = after + inside[i];
        n[i] = after;
    }
    for (var i = 0; i < 5; i = i + 1) {
        // A clip's anti-aliased edge mixes what is under it with its blur by coverage, so a
        // fractional count mixes the two whole counts around it.
        let lo = floor(n[i]);
        var a = profile(d[i], fw[i], grad[i], sigma * sqrt(lo));
        if (n[i] > lo) {
            a = mix(a, profile(d[i], fw[i], grad[i], sigma * sqrt(lo + 1.0)), n[i] - lo);
        }
        c = mix(c, vec3<f32>(1.0), 0.1 * a.x);
        c = mix(c, vec3<f32>(1.0), stroke * a.y);
    }
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
