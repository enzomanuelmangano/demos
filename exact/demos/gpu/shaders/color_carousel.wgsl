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

// <RadialGradient c={(w/2, w/2)} r={w/2}>: interpolated in straight sRGB, clamped past r.
@fragment
fn bg_fs(in: Bg) -> @location(0) vec4<f32> {
    let p = in.pos.xy / u.canvas.z;
    let w = u.canvas.x / u.canvas.z;
    let t = clamp(length(p - vec2<f32>(w * 0.5)) / (w * 0.5), 0.0, 1.0);
    return encode(vec4<f32>(mix(u.inner.rgb, u.outer.rgb, t), 1.0));
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

@fragment
fn card_fs(in: Quad) -> @location(0) vec4<f32> {
    let c = cards[in.card];
    let d = rrect_sdf(in.local, c.size.xy, c.size.z);
    let fw = max(length(vec2<f32>(dpdx(d), dpdy(d))), 1e-4);
    let cover = clamp(0.5 - d / fw, 0.0, 1.0);
    // boxShadow: black at 0.25, outside the box (CSS clips it under the border box).
    let shade = 0.25 * rounded_shadow(in.local, c.size.xy, c.size.z, c.size.w) * (1.0 - cover);
    let card = encode(vec4<f32>(c.color.rgb, cover));
    let s = vec4<f32>(0.0, 0.0, 0.0, shade);
    return card + s * (1.0 - card.a);
}
