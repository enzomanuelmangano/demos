// Color Carousel (src/animations/color-carousel): the square's radial gradient (the active
// colour at the centre to #111111 at half the width), then the cards, each a rounded rect
// (radius 5) under its view's transform [scale, perspective 500, rotateY], with the view's
// boxShadow (0 0 5px rgba(0,0,0,0.25)), drawn back to front by zIndex.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The gradient's inner colour (straight sRGB), its outer colour.
    inner: vec4<f32>,
    outer: vec4<f32>,
};

// Per card: the homography from the card's points (origin at its centre) to device pixels,
// row by row (x, y, w); its colour; half its width and height, its radius, the shadow's
// sigma (points).
struct Card {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
    color: vec4<f32>,
    size: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> cards: array<Card>;

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn encode(c: vec4<f32>) -> vec4<f32> {
    // Premultiplied, in the target's encoding.
    var rgb = c.rgb;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb * c.a, c.a);
}

struct Bg {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn bg_vs(@builtin(vertex_index) i: u32) -> Bg {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Bg;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    return o;
}

fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Display P3 to sRGB and back (both with sRGB's transfer curve).
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b,
    ));
}
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        0.8224622 * l.r + 0.1775378 * l.g,
        0.0331942 * l.r + 0.9668058 * l.g,
        0.0170827 * l.r + 0.0723974 * l.g + 0.9105199 * l.b,
    ));
}

// <RadialGradient c={(w/2, w/2)} r={w/2}>, clamped past r, as RN Skia draws it: the canvas is
// an 8-bit Display P3 surface and Skia mixes a gradient in the destination's encoded values, so
// the two colours are mixed as P3, the result stored to 8 bits, and Core Animation shows it in
// sRGB (row 1000 on device: 96 % of pixels exact, the rest 1 level; mixing sRGB was 51 %).
@fragment
fn bg_fs(in: Bg) -> @location(0) vec4<f32> {
    let p = in.pos.xy / u.canvas.z;
    let w = u.canvas.x / u.canvas.z;
    let t = clamp(length(p - vec2<f32>(w * 0.5)) / (w * 0.5), 0.0, 1.0);
    let p3 = round(mix(srgb_to_p3(u.inner.rgb), srgb_to_p3(u.outer.rgb), t) * 255.0) / 255.0;
    return encode(vec4<f32>(p3_to_srgb(p3), 1.0));
}

struct Quad {
    @builtin(position) pos: vec4<f32>,
    // The card's own points, interpolated in perspective.
    @location(0) local: vec2<f32>,
    @location(1) @interpolate(flat) card: u32,
};

@vertex
fn card_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Quad {
    let c = cards[i];
    let corner = array<vec2<f32>, 6>(vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0))[v];
    // The card and its shadow (3 sigma) and a pixel of antialiasing.
    let margin = 3.0 * c.size.w + 1.0;
    let local = corner * (c.size.xy + vec2<f32>(margin));
    let h = vec3<f32>(dot(c.m0.xyz, vec3(local, 1.0)), dot(c.m1.xyz, vec3(local, 1.0)), dot(c.m2.xyz, vec3(local, 1.0)));
    var o: Quad;
    // Clip space keeps the homogeneous w, so `local` is interpolated perspective-correctly.
    o.pos = vec4<f32>(h.x / u.canvas.x * 2.0 - h.z, h.z - h.y / u.canvas.y * 2.0, 0.0, h.z);
    o.local = local;
    o.card = i;
    return o;
}

fn rrect_sdf(p: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - half + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Apple's continuous corner (packages/draw2d CONTINUOUS_CORNER), in radii from the corner's
// point: (a, c) is a back along the side coming in and c along the side going out. Its first
// two cubics run from the side (1.52866, 0) to the diagonal (the second's t = 0.5); the rest is
// their mirror image.
const EXTENT: f32 = 1.528665;
fn cubic(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec2<f32> {
    let m = 1.0 - t;
    return m * m * m * p0 + 3.0 * m * m * t * p1 + 3.0 * m * t * t * p2 + t * t * t * p3;
}
fn cubic_d(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec2<f32> {
    let m = 1.0 - t;
    return 3.0 * m * m * (p1 - p0) + 6.0 * m * t * (p2 - p1) + 3.0 * t * t * (p3 - p2);
}

// The signed distance (points, positive inside) from `q` to the continuous corner of radius
// `r`; `q` is how far the point lies in from the two sides that meet there. Folded about the
// diagonal; the point of the curve at the same `a` and the curve's normal there (a first-order
// distance: the curve bends by far less than a pixel across the antialiasing ramp).
fn continuous_corner_sd(q0: vec2<f32>, r: f32) -> f32 {
    let q = vec2<f32>(max(q0.x, q0.y), min(q0.x, q0.y)) / r;
    var p0 = vec2<f32>(EXTENT, 0.0);
    var p1 = vec2<f32>(1.088493, 0.0);
    var p2 = vec2<f32>(0.868407, 0.0);
    var p3 = vec2<f32>(0.631494, 0.074911);
    var lo = 0.0;
    var hi = 1.0;
    if (q.x < 0.631494) {
        p0 = vec2<f32>(0.631494, 0.074911);
        p1 = vec2<f32>(0.372824, 0.169060);
        p2 = vec2<f32>(0.169060, 0.372824);
        p3 = vec2<f32>(0.074911, 0.631494);
        hi = 0.5;
    }
    // a(t) falls from p0 to p3: the t whose a is q.x (clamped to the piece).
    for (var i = 0; i < 18; i = i + 1) {
        let mid = 0.5 * (lo + hi);
        if (cubic(p0, p1, p2, p3, mid).x > q.x) { lo = mid; } else { hi = mid; }
    }
    let t = 0.5 * (lo + hi);
    let c = cubic(p0, p1, p2, p3, t);
    let d = normalize(cubic_d(p0, p1, p2, p3, t));
    // Inward: the tangent (−a, +c) turned toward larger a and c.
    let n = vec2<f32>(d.y, -d.x);
    return dot(q - c, n) * r;
}

fn erf(x: f32) -> f32 {
    let s = sign(x);
    let a = abs(x);
    let t = 1.0 / (1.0 + 0.3275911 * a);
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
    return s * y;
}

// A rounded box's Gaussian shadow (Evan Wallace's closed form, integrated along x per row).
fn shadow_x(x: f32, y: f32, sigma: f32, corner: f32, half: vec2<f32>) -> f32 {
    let delta = min(half.y - corner - abs(y), 0.0);
    let curved = half.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
    let s = 0.70710678 / sigma;
    return 0.5 * (erf((x + curved) * s) - erf((x - curved) * s));
}

fn rounded_shadow(p: vec2<f32>, half: vec2<f32>, corner: f32, sigma: f32) -> f32 {
    let low = p.y - half.y;
    let high = p.y + half.y;
    let start = clamp(-3.0 * sigma, low, high);
    let end = clamp(3.0 * sigma, low, high);
    let step = (end - start) / 4.0;
    var y = start + step * 0.5;
    var value = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        let g = exp(-y * y / (2.0 * sigma * sigma)) / (sqrt(6.2831853) * sigma);
        value = value + shadow_x(p.x, p.y - y, sigma, corner, half) * g * step;
        y = y + step;
    }
    return value;
}

// A card as Core Animation draws a transformed view (RN: borderRadius 5, borderCurve
// continuous, its boxShadow layer): the straight edges ALIASED (CALayer's
// allowsEdgeAntialiasing is NO: a pixel is in or out by its centre), the continuous corners
// antialiased. Under it RCTBoxShadow's layer: a shadowPath of the bounds with CIRCULAR radius 5
// (RCTPathCreateWithRoundedRect), shadowRadius blur / 2, masked even-odd to outside that
// circular rounded rect (so a sliver between it and the continuous corner shows neither).
@fragment
fn card_fs(in: Quad) -> @location(0) vec4<f32> {
    let c = cards[in.card];
    let half = c.size.xy;
    let r = c.size.z;
    // In from the nearest two sides.
    let q = half - abs(in.local);
    let sd = continuous_corner_sd(q, r);
    let fw = max(length(vec2<f32>(dpdx(sd), dpdy(sd))), 1e-4);
    // Core Animation's corner ramp is softer than a pixel's box: fitted on the device's centre
    // card (scale 2), 1.3 px wide and 0.1 px in (mean coverage error 0.009, was 0.021 at 1 px).
    let round_cover = clamp(0.5 + (sd / fw - 0.1) / 1.3, 0.0, 1.0);
    let ext = EXTENT * r;
    var cover = 0.0;
    if (all(q > vec2<f32>(0.0))) {
        cover = select(1.0, round_cover, all(q < vec2<f32>(ext)));
    }
    // The mask's hole: the circular rounded rect, antialiased (a CAShapeLayer).
    let d = rrect_sdf(in.local, half, r);
    let dw = max(length(vec2<f32>(dpdx(d), dpdy(d))), 1e-4);
    let hole = clamp(0.5 - d / dw, 0.0, 1.0);
    let shade = 0.25 * rounded_shadow(in.local, half, r, c.size.w) * (1.0 - hole);
    let card = encode(vec4<f32>(c.color.rgb, cover));
    let s = vec4<f32>(0.0, 0.0, 0.0, shade);
    return card + s * (1.0 - card.a);
}
