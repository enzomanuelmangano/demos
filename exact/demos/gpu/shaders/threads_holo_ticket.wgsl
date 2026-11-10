// Threads Holo Ticket's screen (src/animations/threads-holo-ticket/src/index.tsx,
// components/ticket/index.tsx) as Core Animation composites it: #070018 (a View colour,
// Display P3) and the ticket's Animated.View, 300 × 400 with `overflow: hidden`, carrying
// `[perspective 1000, rotateY]` about its centre (RN sets allowsEdgeAntialiasing for m34 ≠ 0:
// its edges are antialiased). A pixel shows the point of the ticket's plane its inverse
// projective map finds there:
// - the HolographicCard canvas (threads_holo_ticket_card.wgsl's 8-bit layer), sampled
//   bilinearly as a layer's contents are;
// - over it the side that faces: the front's labels and footer line (drawn once into their
//   layer), or the back, mirrored by its scaleX −1: the QR canvas (threads_holo_ticket_qr.wgsl)
//   at (75, 125), its own layer's edges not antialiased.
// Everything composites in Display P3's encoding (RN's views and Skia's surfaces are P3); the
// result is turned into sRGB at the end.
struct Compose {
    // Screen points → the ticket's plane points (inverse projective 3×3, by rows).
    inv: array<vec4<f32>, 3>,
    // The ticket (points: width, height), 1 when the front faces, unused.
    ticket: vec4<f32>,
    // The QR canvas in the back side's points: left, top, size; unused.
    qr: vec4<f32>,
    // The layers' sizes in device pixels: the ticket's (w, h), the QR's (w, h).
    tex: vec4<f32>,
    // The background (Display P3), unused.
    background: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Compose;
@group(0) @binding(1) var card: texture_2d<f32>;
@group(0) @binding(2) var front: texture_2d<f32>;
@group(0) @binding(3) var qr: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

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
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Display P3 (sRGB's transfer curve) to sRGB, clipped to the sRGB gamut.
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b,
    ));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.pos.xy / s;
    var c = u.background.rgb;
    let h = vec3<f32>(p, 1.0);
    let q = vec3<f32>(dot(u.inv[0].xyz, h), dot(u.inv[1].xyz, h), dot(u.inv[2].xyz, h));
    let l = q.xy / q.z;
    let size = u.ticket.xy;
    // The view's edges, antialiased in screen space.
    let d = max(max(-l.x, l.x - size.x), max(-l.y, l.y - size.y));
    let fw = max(fwidth(d), 1e-4);
    var cover = clamp(0.5 - d / fw, 0.0, 1.0);
    if (q.z <= 0.0) {
        cover = 0.0;
    }
    var content = textureSampleLevel(card, smp, l * s / u.tex.xy, 0.0);
    if (u.ticket.z > 0.5) {
        let f = textureSampleLevel(front, smp, l * s / u.tex.xy, 0.0);
        content = f + content * (1.0 - f.a);
    } else {
        // The back side's scaleX −1 about its centre.
        let b = vec2<f32>(size.x - l.x, l.y) - u.qr.xy;
        if (all(b >= vec2<f32>(0.0)) && all(b < vec2<f32>(u.qr.z))) {
            let f = textureSampleLevel(qr, smp, b * s / u.tex.zw, 0.0);
            content = f + content * (1.0 - f.a);
        }
    }
    c = c * (1.0 - cover * content.a) + cover * content.rgb;
    var rgb = p3_to_srgb(c);
    if (u.canvas.w > 0.5) {
        rgb = to_linear(rgb);
    }
    return vec4<f32>(rgb, 1.0);
}
