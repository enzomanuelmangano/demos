// Airbnb Flip Interaction's description (src/animations/airbnb-flip-interaction/index.tsx): the
// pages (each its layer, drawn once: `page0` MainPage, `page1` SecondPage) under their entering /
// exiting Keyframes (opacity, translateY), on the white screen; over the description section the
// AnimatedBlurView: its rgba(255,255,255,0.5) background, then UIBlurEffect.light's chain over
// what is behind it (skia::backdrop, run between the two passes).
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The section (the BlurView's frame), device px, ltrb.
    section: vec4<f32>,
    // The page container's origin (pt) and the page textures' size (px).
    page: vec4<f32>,
    // Up to four page layers, back to front: (which page, opacity, translateY pt, shown).
    g0: vec4<f32>,
    g1: vec4<f32>,
    g2: vec4<f32>,
    g3: vec4<f32>,
    // The backdrop's mapping (skia::backdrop::Backdrop::mapping); `m.w` 1 when the effect runs
    // (intensity 0 shows none, as measured at rest).
    m: vec4<f32>,
    n: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var page0: texture_2d<f32>;
@group(0) @binding(2) var page1: texture_2d<f32>;
@group(0) @binding(3) var blurred: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn backdrop_uv(px: vec2<f32>, m: vec4<f32>, n: vec4<f32>) -> vec2<f32> {
    let c = clamp(px * m.z + m.xy, vec2<f32>(0.5), n.xy - vec2<f32>(0.5));
    return c / n.zw;
}

fn layer(g: vec4<f32>, p: vec2<f32>) -> vec4<f32> {
    if (g.w < 0.5) { return vec4<f32>(0.0); }
    // The layer's texel under this pixel, moved by translateY (Core Animation samples the
    // layer's backing store bilinearly at a fractional offset).
    let q = (p / u.canvas.z - u.page.xy - vec2<f32>(0.0, g.z)) * u.canvas.z;
    let uv = q / u.page.zw;
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(0.0); }
    var c: vec4<f32>;
    if (g.x < 0.5) {
        c = textureSampleLevel(page0, smp, uv, 0.0);
    } else {
        c = textureSampleLevel(page1, smp, uv, 0.0);
    }
    return c * g.y;
}

fn pages(p: vec2<f32>) -> vec4<f32> {
    var c = layer(u.g0, p);
    var t = layer(u.g1, p);
    c = t + c * (1.0 - t.a);
    t = layer(u.g2, p);
    c = t + c * (1.0 - t.a);
    t = layer(u.g3, p);
    c = t + c * (1.0 - t.a);
    return c;
}

fn in_section(p: vec2<f32>) -> bool {
    return all(p >= u.section.xy) && all(p < u.section.zw);
}

// What the effect view sees: the white screen, the pages, the BlurView's own background.
@fragment
fn under(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var c = pages(p);
    c = c + vec4<f32>(1.0) * (1.0 - c.a);
    if (in_section(p)) {
        c = vec4<f32>(0.5) + c * 0.5;
    }
    return c;
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var c: vec4<f32>;
    if (in_section(p) && u.m.w > 0.5) {
        c = vec4<f32>(textureSampleLevel(blurred, smp, backdrop_uv(p, vec4<f32>(u.m.xyz, 0.0), u.n), 0.0).rgb, 1.0);
    } else if (in_section(p)) {
        c = pages(p);
        c = c + vec4<f32>(1.0) * (1.0 - c.a);
        c = vec4<f32>(0.5) + c * 0.5;
    } else {
        c = pages(p);
    }
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(clamp(c.rgb / c.a, vec3<f32>(0.0), vec3<f32>(1.0))) * c.a, c.a);
    }
    return c;
}
