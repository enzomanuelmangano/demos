// Delete Button (src/animations/delete-button): the pill and the close circle in RN's gooey layer
// (Blur 10, alpha × 18 − 10), its shape computed analytically and drawn crisp. The layer's alpha
// is the pill's coverage plus the circle's at its group's opacity, less their overlap's (src-over);
// its Gaussian blur, per pixel, is an integral over the layer's rows: each row of a rounded rect
// (a circle is one with r = its half size) is a span, whose horizontal blur is a difference of two
// Φ, weighted by the vertical Gaussian (32 rows across the shapes). The layer's edge is where that
// blur reaches the threshold, (0.5 + 10) / 18, so the shapes' outlines, corners, the edges the
// canvas eats and the neck between them are RN's; one pixel of analytic anti-aliasing across it
// (fwidth of the blurred alpha) instead of RN's ×18 ramp, so no soft rim. What the canvas draws
// after the layer (the labels, the cross) is `top`, over it. One pass, no textures blurred.
struct Uniforms {
    // The pill (points, after its group's scale): centre x, y, half width, half height.
    rect: vec4<f32>,
    // The pill's corner radius, the circle's centre x, y and radius (after its group's scale).
    shape: vec4<f32>,
    // The circle's group opacity, device pixels per point, whether the target encodes sRGB
    // itself (the shader writes linear), the blur's σ (points).
    layer: vec4<f32>,
    // deleteButtonColor (the canvas's encoding), the threshold.
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var top: texture_2d<f32>;

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

// Φ, the standard normal CDF (Abramowitz–Stegun 7.1.26 erf, |error| < 1.5e-7).
fn phi(x: f32) -> f32 {
    let z = abs(x) * 0.70710678;
    let t = 1.0 / (1.0 + 0.3275911 * z);
    let e = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z);
    return 0.5 * (1.0 + select(-e, e, x >= 0.0));
}

// Row y of a rounded rect (centre c, half size h, radius r): its span, empty (x > y) off it.
fn span(c: vec2<f32>, h: vec2<f32>, r: f32, y: f32) -> vec2<f32> {
    let ay = abs(y - c.y);
    if (ay > h.y) { return vec2<f32>(1.0, 0.0); }
    let dy = max(ay - (h.y - r), 0.0);
    let inset = r - sqrt(max(r * r - dy * dy, 0.0));
    return vec2<f32>(c.x - h.x + inset, c.x + h.x - inset);
}

// A span's horizontal blur at x.
fn cover(s: vec2<f32>, x: f32, sigma: f32) -> f32 {
    if (s.y <= s.x) { return 0.0; }
    return phi((x - s.x) / sigma) - phi((x - s.y) / sigma);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy / u.layer.y;
    let sigma = u.layer.w;
    let o = u.layer.x;
    let pc = u.rect.xy;
    let ph = u.rect.zw;
    let cc = u.shape.yz;
    let ch = vec2<f32>(u.shape.w);
    let y0 = min(pc.y - ph.y, cc.y - ch.y);
    let y1 = max(pc.y + ph.y, cc.y + ch.y);
    let dy = (y1 - y0) / 32.0;
    var f = 0.0;
    for (var i = 0; i < 32; i = i + 1) {
        let y = y0 + (f32(i) + 0.5) * dy;
        let g = (p.y - y) / sigma;
        let w = exp(-0.5 * g * g);
        let a = span(pc, ph, u.shape.x, y);
        let b = span(cc, ch, u.shape.w, y);
        let both = vec2<f32>(max(a.x, b.x), min(a.y, b.y));
        f = f + w * (cover(a, p.x, sigma) + o * (cover(b, p.x, sigma) - cover(both, p.x, sigma)));
    }
    f = f * dy / (sigma * 2.50662827);
    // One device pixel across the threshold's contour.
    let a = clamp(0.5 + (f - u.color.w) / max(fwidth(f), 1e-6), 0.0, 1.0);
    // Skia blends in the canvas's encoded space: `top` (premultiplied) over the layer.
    let t = textureLoad(top, vec2<i32>(in.pos.xy), 0);
    var c = vec4<f32>(t.rgb + u.color.rgb * a * (1.0 - t.a), t.a + a * (1.0 - t.a));
    if (u.layer.z > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
