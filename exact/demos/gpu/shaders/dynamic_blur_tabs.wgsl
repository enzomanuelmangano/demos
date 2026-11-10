// Dynamic Blur Tabs' bar (src/animations/dynamic-blur-tabs/src/components/bottom-tab-bar): the
// BlurView (skia::backdrop's low-resolution result, drawn back up bilinearly as BACKDROP_WGSL
// does) over the inner rect inside the border, clipped to the bar's continuous outline, under
// the bar's border. Premultiplied, sRGB-encoded; transparent outside the bar.
struct Uniforms {
    // The canvas (device px), unused, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The BlurView's rect: left, top, right, bottom (device px).
    inner: vec4<f32>,
    // skia::backdrop::Backdrop::mapping: the low-resolution coordinate of pixel (0, 0) and the
    // scale; the used size and the texture's size.
    low: vec4<f32>,
    size: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var blurred: texture_2d<f32>;
// The bar's continuous outline, coverage in alpha.
@group(0) @binding(2) var outline: texture_2d<f32>;
// The border's inner edge (the outline inset by the border width, radius r − width), coverage
// in alpha: the border is the outline minus it, rgba(216, 216, 216, 0.597).
@group(0) @binding(3) var hole: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let q = vec2<i32>(p);
    // The pixel's coverage by the inner rect (its edges are on the pixel grid: 0 or 1).
    let cover = clamp(min(p + vec2<f32>(0.5), u.inner.zw) - max(p - vec2<f32>(0.5), u.inner.xy), vec2<f32>(0.0), vec2<f32>(1.0));
    let k = cover.x * cover.y * textureLoad(outline, q, 0).a;
    var c = vec4<f32>(0.0);
    if (k > 0.0) {
        let at = clamp(p * u.low.z + u.low.xy, vec2<f32>(0.5), u.size.xy - vec2<f32>(0.5));
        c = vec4<f32>(textureSampleLevel(blurred, smp, at / u.size.zw, 0.0).rgb, 1.0) * k;
    }
    let o = textureLoad(outline, q, 0).a;
    let ring = clamp(o - textureLoad(hole, q, 0).a, 0.0, 1.0) * 0.597;
    let e = vec4<f32>(vec3<f32>(216.0 / 255.0) * ring, ring);
    c = e + c * (1.0 - e.a);
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
