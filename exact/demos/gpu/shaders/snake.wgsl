// Snake's card content (src/animations/snake/src: index.tsx, components/animated-count,
// snake-game/index.tsx) as Core Animation composites it over the card's white, in canvas pixels:
// - `main`: the Skia layer of what does not move per frame: the "Score" label and the board's
//   canvas (its RoundedRect, the snake's path and the food), premultiplied encoded sRGB.
// - the AnimatedCount: three AnimatedDigit containers (21 × 30, overflow hidden, opacity as a
//   group, translateX). In each, the digits column (the ten 21 × 30 Text layers of `digits`)
//   under [translateY, scaleX] about its centre, then the zIndex 10 BlurView (tint light), then
//   the two zIndex 50 LinearGradients (white → clear over the top third, clear → white over the
//   bottom third). `source` draws what is under each BlurView (the card's white and the column);
//   skia::backdrop runs UIBlurEffect.light's chain on it into `effect`; `compose` lays the
//   gradients over that and the container's opacity over the white, as UIKit does under a
//   parent alpha (the group composites over what is behind it).
// - the restart overlay: the PressableScale (`button`, black continuous radius 10 and its white
//   label) at the overlay's opacity, as a group.
// RN leaves allowsEdgeAntialiasing off: a layer covers a pixel whose centre is inside it, and its
// contents are sampled bilinearly (the column under scaleX). Views and Skia's surface are Display
// P3: the Skia layer is turned into P3 to composite and the result goes back to sRGB.
struct Snake {
    // The canvas (device px: w, h), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The count row: its top (points), its height (points), the digits layer's size (px w, h).
    row: vec4<f32>,
    // Each digit's container: its left (device px, translateX included), the column's scaleX
    // and translateY (points), the container's opacity.
    d0: vec4<f32>,
    d1: vec4<f32>,
    d2: vec4<f32>,
    // The button's left and top (device px) and size (device px); the overlay's opacity and the
    // PressableScale's scale (about the button's centre).
    button: vec4<f32>,
    overlay: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Snake;
@group(0) @binding(1) var main_layer: texture_2d<f32>;
@group(0) @binding(2) var effect: texture_2d<f32>;
@group(0) @binding(3) var button: texture_2d<f32>;
@group(0) @binding(4) var digits: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

// The AnimatedDigit: TEXT_DIGIT width 21, height 30; the column of ten.
const DIGIT_W: f32 = 21.0;
const DIGIT_H: f32 = 30.0;

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

fn digit(k: i32) -> vec4<f32> {
    if (k == 0) {
        return u.d0;
    }
    if (k == 1) {
        return u.d1;
    }
    return u.d2;
}

// Whether the pixel centre `q` (device px, the count row's top at 0) is inside container `d`.
fn in_container(q: vec2<f32>, d: vec4<f32>) -> bool {
    let s = u.canvas.z;
    let l = q - vec2<f32>(d.x, 0.0);
    return all(l >= vec2<f32>(0.0)) && l.x < DIGIT_W * s && l.y < DIGIT_H * s;
}

// What is under the BlurViews, in the count row (its top at y 0): the card's white, and in each
// container its digits column under [translateY, scaleX] about the column's centre (10.5, 150),
// the ten Text layers sampled bilinearly. Opaque, encoded.
@fragment
fn source(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    var c = vec3<f32>(1.0);
    for (var k = 0; k < 3; k = k + 1) {
        let d = digit(k);
        if (in_container(pos.xy, d)) {
            let l = (pos.xy - vec2<f32>(d.x, 0.0)) / s;
            let q = vec2<f32>(DIGIT_W / 2.0 + (l.x - DIGIT_W / 2.0) / d.y, l.y - d.z);
            if (all(q >= vec2<f32>(0.0)) && q.x < DIGIT_W && q.y < DIGIT_H * 10.0) {
                let t = textureSampleLevel(digits, smp, q * s / u.row.zw, 0.0);
                c = t.rgb + c * (1.0 - t.a);
            }
        }
    }
    return vec4<f32>(c, 1.0);
}

// expo-linear-gradient's layer: a CGGradient of white at alpha 1, 0, 0, 0 (top) or 0, 0, 0, 1
// (bottom) at 0, 1/3, 2/3, 1, evaluated at the bitmap's pixel row centres and stored in 8 bits.
fn q8(a: f32) -> f32 {
    return round(clamp(a, 0.0, 1.0) * 255.0) / 255.0;
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = vec2<i32>(floor(pos.xy));
    var c = vec3<f32>(1.0);
    let m = layer_p3(textureLoad(main_layer, px, 0));
    c = m.rgb + c * (1.0 - m.a);
    let q = vec2<f32>(pos.x, pos.y - u.row.x * s);
    if (q.y >= 0.0 && q.y < u.row.y * s) {
        for (var k = 0; k < 3; k = k + 1) {
            let d = digit(k);
            // At opacity 0 the container leaves the white (its effect is not run).
            if (in_container(q, d) && d.w > 0.0) {
                let row = floor(q.y);
                let y = (row + 0.5) / s / DIGIT_H;
                let top = q8(1.0 - 3.0 * y);
                let bottom = q8(3.0 * y - 2.0);
                let e = textureLoad(effect, vec2<i32>(px.x, i32(row)), 0).rgb;
                var g = e * (1.0 - top) + vec3<f32>(top);
                g = g * (1.0 - bottom) + vec3<f32>(bottom);
                c = vec3<f32>(1.0) * (1.0 - d.w) + g * d.w;
            }
        }
    }
    let o = u.overlay.x;
    let k = select(u.overlay.y, 1.0, u.overlay.y <= 0.0);
    let half = u.button.zw * 0.5;
    let b = (pos.xy - u.button.xy - half) / k + half;
    if (o > 0.0 && all(b >= vec2<f32>(0.0)) && all(b < u.button.zw)) {
        // At rest texel for texel; pressed, the layer's contents sampled bilinearly (Core
        // Animation's filter) through the scale.
        var raw = textureLoad(button, vec2<i32>(floor(b)), 0);
        if (k != 1.0) {
            raw = textureSampleLevel(button, smp, b / u.button.zw, 0.0);
        }
        let t = layer_p3(raw) * o;
        c = t.rgb + c * (1.0 - t.a);
    }
    var rgb = p3_to_srgb(c);
    if (u.canvas.w > 0.5) {
        rgb = to_linear(rgb);
    }
    return vec4<f32>(rgb, 1.0);
}
