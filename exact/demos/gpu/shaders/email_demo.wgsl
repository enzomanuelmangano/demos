// Email Demo (src/animations/email-demo): one row's layer and its Core Animation shadow.
// `content` is the row as its layer draws it (the box shadow, the background, the border ring,
// the photo and the labels), premultiplied sRGB-encoded. The layer's shadow (no shadowPath: the
// background is not opaque) is that content's alpha, blurred (σ = shadowRadius) by Graphite's
// blur into `blurred`, offset by shadowOffset and tinted with shadowColor × shadowOpacity, drawn
// under the content.
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The blurred alpha: uv = p · low.xy + low.zw, defined inside out (ltrb, layer px).
    low: vec4<f32>,
    out: vec4<f32>,
    // shadowColor × shadowOpacity, premultiplied; .w 0 draws no shadow.
    color: vec4<f32>,
    // shadowOffset (device px).
    offset: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var content: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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
    var c = textureLoad(content, vec2<i32>(p), 0);
    if (u.color.w > 0.0) {
        let q = p - u.offset.xy;
        var a = 0.0;
        if (all(q >= u.out.xy) && all(q <= u.out.zw)) {
            a = textureSampleLevel(blurred, smp, q * u.low.xy + u.low.zw, 0.0).a;
        }
        c = c + u.color * a * (1.0 - c.a);
    }
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
