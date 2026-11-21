// Art Gallery: the frame on the screen. The mosaic (`scene`, encoded sRGB, as RN's canvas holds
// it) with the zoom-out button over it as Core Animation composes RN's view: an Animated.View
// whose opacity is a group's (bg × (1 − a·G.a) + a·G), G being the 56 pt circle (overflow
// hidden, radius 28) holding the BlurView's backdrop (draw2d::backdrop, sampled here) under the
// icon and the hairline border (`ink`, premultiplied, drawn unscaled by packages/draw2d), all of
// it scaled by pressto's PressableScale about the button's centre.

struct Present {
    // Device pixels (w, h), 1 when the target encodes sRGB itself, the button's opacity.
    canvas: vec4<f32>,
    // The button's centre (device px), its radius (device px, scaled), its scale.
    fab: vec4<f32>,
    // `ink`'s top-left (device px, unscaled) and size (px).
    ink: vec4<f32>,
    // The BlurView's box (device px, x0 y0 x1 y1): absoluteFill inside the border, scaled.
    blur: vec4<f32>,
    // draw2d::backdrop's mapping (Backdrop::mapping).
    m: vec4<f32>,
    n: vec4<f32>,
};

@group(0) @binding(0) var<uniform> p: Present;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var low: texture_2d<f32>;
@group(0) @binding(3) var ink: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

fn backdrop_uv(px: vec2<f32>, m: vec4<f32>, n: vec4<f32>) -> vec2<f32> {
    let c = clamp(px * m.z + m.xy, vec2<f32>(0.5), n.xy - vec2<f32>(0.5));
    return c / n.zw;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@vertex
fn present_vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(pos[i], 0.0, 1.0);
}

@fragment
fn present_fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    var c = textureLoad(scene, vec2<i32>(frag.xy), 0).rgb;
    let a = p.canvas.w;
    if (a > 0.0) {
        let d = distance(frag.xy, p.fab.xy);
        let cov = clamp(p.fab.z - d + 0.5, 0.0, 1.0);
        if (cov > 0.0) {
            let blur = textureSampleLevel(low, smp, backdrop_uv(frag.xy, p.m, p.n), 0.0).rgb;
            let q = p.fab.xy + (frag.xy - p.fab.xy) / p.fab.w;
            let k = textureSampleLevel(ink, smp, (q - p.ink.xy) / p.ink.zw, 0.0) * cov;
            let inside = all(frag.xy >= p.blur.xy) && all(frag.xy < p.blur.zw);
            let bc = select(0.0, cov, inside);
            let g = k.rgb + blur * bc * (1.0 - k.a);
            let ga = k.a + bc * (1.0 - k.a);
            c = c * (1.0 - a * ga) + a * g;
        }
    }
    if (p.canvas.z > 0.5) {
        c = to_linear(c);
    }
    return vec4<f32>(c, 1.0);
}
