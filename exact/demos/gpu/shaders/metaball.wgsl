// Metaball (src/animations/metaball/index.tsx): the Group's layer (Blur 30 + ColorMatrix) composed
// onto the canvas. `blurred` is Graphite's blur (skia::blur::GraphiteBlur) of the layer as
// packages/skia drew it: the two circles as one path (Graphite's 4× MSAA), the SweepGradient
// about (0, 0) interpolated in Display P3, premultiplied ENCODED DISPLAY P3 in 8 bits, as RN
// Skia's layer in the surface's colour space. The ColorMatrix runs on the unpremultiplied colour
// (RGB kept, alpha 60 a − 30, clamped); the result lands in the canvas's 8-bit P3 surface, which
// is cleared transparent; Core Animation converts it to sRGB per pixel, unpremultiplied, and
// lays it over the View's #0A0A0A.
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The blurred image: uv = p · low.xy + low.zw (p in device px).
    low: vec4<f32>,
    // The blur result's bounds (ltrb, device px): transparent outside.
    out: vec4<f32>,
    // .x: 1 when there is a blur; .y, .z: the ColorMatrix's alpha row (scale, bias).
    layer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var blurred: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded Display P3 to encoded sRGB (clipped to the sRGB gamut), as packages/skia's.
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}
// An 8-bit surface's store.
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var g = vec4<f32>(0.0);
    if (u.layer.x > 0.5 && all(p >= u.out.xy) && all(p <= u.out.zw)) {
        g = textureSampleLevel(blurred, smp, p * u.low.xy + u.low.zw, 0.0);
    }
    // SkColorFilters::Matrix: unpremultiplied in, RGB kept, alpha k · a + b, clamped.
    var rgb = vec3<f32>(0.0);
    if (g.a > 0.0) { rgb = g.rgb / g.a; }
    let a = clamp(u.layer.y * g.a + u.layer.z, 0.0, 1.0);
    let canvas = q8(vec4<f32>(rgb * a, a));
    var src = vec3<f32>(0.0);
    if (canvas.a > 0.0) { src = p3_to_srgb(canvas.rgb / canvas.a) * canvas.a; }
    let bg = vec3<f32>(10.0 / 255.0);
    var c = src + bg * (1.0 - canvas.a);
    if (u.canvas.w > 0.5) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}
