// Bezier Curve Outline (src/animations/bezier-curve-outline/src): the screen's layers, src-over
// on premultiplied sRGB-encoded colours.
//
// `main`: the main content (background, the square's shadow, its face and chessboard) with the
// icon container over it at the container's own (group) opacity 1 − progress, inside the square.
// `compose`: the outline layer at opacity outline, under the main content at opacity
// 1 − outline (two views with group opacity); inside the square the main content shows the
// square's BlurView (`blurred`, skia::backdrop's low-resolution result, drawn back up
// bilinearly as BACKDROP_WGSL does). The result is the full-screen BlurView's backdrop.
struct Uniforms {
    // The canvas (device px), unused, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // outlineModeProgress, 1 − progress (the icon's opacity), whether the square's blur is on,
    // unused.
    mix: vec4<f32>,
    // The square's backdrop (skia::backdrop::Backdrop::mapping): the low-resolution coordinate
    // of pixel (0, 0) and the scale; the used size and the texture's size.
    low: vec4<f32>,
    out: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// main: the content under the icon; compose: the main content.
@group(0) @binding(1) var base: texture_2d<f32>;
// main: the icon container; compose: the outline layer.
@group(0) @binding(2) var upper: texture_2d<f32>;
// The square's shape (its clip), alpha.
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var blurred: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn over(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    return a + b * (1.0 - a.a);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn content(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let q = vec2<i32>(pos.xy);
    return over(textureLoad(upper, q, 0) * u.mix.y, textureLoad(base, q, 0));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let q = vec2<i32>(p);
    var m = textureLoad(base, q, 0);
    if (u.mix.z > 0.5) {
        let c = clamp(p * u.low.z + u.low.xy, vec2<f32>(0.5), u.out.xy - vec2<f32>(0.5));
        let b = textureSampleLevel(blurred, smp, c / u.out.zw, 0.0);
        let k = textureLoad(mask, q, 0).a;
        m = m * (1.0 - k) + b * k;
    }
    let o = u.mix.x;
    var c = over(m * (1.0 - o), textureLoad(upper, q, 0) * o);
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
