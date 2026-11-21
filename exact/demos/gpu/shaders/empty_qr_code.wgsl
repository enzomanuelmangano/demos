// Empty QR Code's screen (src/animations/empty-qrcode: index.tsx, components/qrcode-share/
// index.tsx) as Core Animation composites it: the #fbfbfb container (a View colour, Display P3)
// and QRCodeShare's Animated.View (150 × 150, borderRadius 50 continuous, overflow hidden) under
// its `[scale, rotate]` about its centre. Inside it, in its own points:
// - the #111 View (flex 1: the whole 150 × 150), a solid layer;
// - the QRCode canvas (90 × 90 at (30, 30), centred by the #111 View), its Skia layer;
// - the zIndex 1 absoluteFill logo View at its opacity (a group), holding the letter canvas
//   (150 × 150), its Skia layer.
// A pixel finds its point of the card through the inverse transform (u.inv0, u.inv1); a layer covers it
// when that point is inside the layer (2D transform: RN leaves allowsEdgeAntialiasing off, so
// layer edges are not antialiased), its contents sampled bilinearly as a layer's are. The card's
// continuous rounded clip (masksToBounds) is `mask`: its shape under the transform, drawn by the
// skia package. Everything composites in Display P3's encoding (RN's views and Skia's surfaces
// are P3): the Skia layers hold encoded sRGB (the skia package's output) and are turned into P3
// here; the result goes back to sRGB at the end.
struct Compose {
    // Screen points → card points: x' = inv0.x * x + inv0.y * y + inv0.z (row 0), row 1.
    inv0: vec4<f32>,
    inv1: vec4<f32>,
    // The card (points), the QR canvas's left/top and size in the card (points).
    card: vec4<f32>,
    // The layers' sizes in device pixels: the letter's (w, h), the QR's (w, h).
    tex: vec4<f32>,
    // The logo View's opacity, the QR canvas's size (points), unused.
    layer: vec4<f32>,
    // The mask's origin on the target (device px) and its size (device px).
    mask: vec4<f32>,
    // The container's colour and the #111 View's (Display P3, encoded).
    background: vec4<f32>,
    fill: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Compose;
@group(0) @binding(1) var letter: texture_2d<f32>;
@group(0) @binding(2) var qr: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Display P3 to sRGB (both with sRGB's transfer curve), clipped to the sRGB gamut.
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
// A premultiplied, encoded sRGB sample as premultiplied encoded P3.
fn layer_p3(c: vec4<f32>) -> vec4<f32> {
    if (c.a <= 0.0) {
        return vec4<f32>(0.0);
    }
    return vec4<f32>(srgb_to_p3(c.rgb / c.a) * c.a, c.a);
}

fn inside(p: vec2<f32>, size: vec2<f32>) -> bool {
    return all(p >= vec2<f32>(0.0)) && all(p < size);
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = pos.xy / s;
    var c = u.background.rgb;
    let l = vec2<f32>(dot(u.inv0.xyz, vec3<f32>(p, 1.0)), dot(u.inv1.xyz, vec3<f32>(p, 1.0)));
    let size = u.card.xy;
    let mq = vec2<i32>(floor(pos.xy - u.mask.xy));
    if (inside(l, size) && all(mq >= vec2<i32>(0)) && all(vec2<f32>(mq) < u.mask.zw)) {
        let m = textureLoad(mask, mq, 0).a;
        // The #111 View, then the QR canvas, then the logo View at its opacity.
        var content = vec4<f32>(u.fill.rgb, 1.0);
        let q = l - u.card.zw;
        if (inside(q, vec2<f32>(u.layer.y))) {
            let t = layer_p3(textureSampleLevel(qr, smp, q * s / u.tex.zw, 0.0));
            content = t + content * (1.0 - t.a);
        }
        let g = layer_p3(textureSampleLevel(letter, smp, l * s / u.tex.xy, 0.0)) * u.layer.x;
        content = g + content * (1.0 - g.a);
        c = c * (1.0 - m) + content.rgb * m;
    }
    var rgb = p3_to_srgb(c);
    if (u.canvas.w > 0.5) {
        rgb = to_linear(rgb);
    }
    return vec4<f32>(rgb, 1.0);
}
