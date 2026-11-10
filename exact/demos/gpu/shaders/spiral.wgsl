// Spiral (src/animations/spiral): the Group's layer (glowPaint) composed onto the canvas.
// `layer` holds the circles as packages/skia drew them (one path of addCircle conics, Graphite's
// 4× MSAA, the sweep gradient interpolated in Display P3), premultiplied ENCODED DISPLAY P3, as
// RN Skia's layer in the surface's colour space; it reaches `reach` pixels past the canvas on
// every side, as Skia sizes a layer for its filter's input. `blurred` is Graphite's blur of it
// (MakeBlur(5, 5, Decal)). ImageFilter.MakeMerge([blur, null]) draws the blur, then the layer
// over it, each into an 8-bit surface; the result is the (transparent) canvas, which Core
// Animation converts to sRGB and lays over the View's #010101. Everything mixes in P3, as RN's
// does, and becomes sRGB once, at the end.
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The blurred image: uv = p · low.xy + low.zw (p in layer px).
    low: vec4<f32>,
    // The blur result's layer bounds (ltrb, layer px): transparent outside.
    out: vec4<f32>,
    // .x: how far the layer reaches past the canvas (px); .y: 1 when there is a blur.
    layer: vec4<f32>,
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
    // Device pixel centre → layer pixel space (the canvas's origin is layer (0, 0)).
    let p = pos.xy;
    let sharp = textureLoad(content, vec2<i32>(p + vec2<f32>(u.layer.x)), 0);
    var glow = vec4<f32>(0.0);
    if (u.layer.y > 0.5 && all(p >= u.out.xy) && all(p <= u.out.zw)) {
        glow = q8(textureSampleLevel(blurred, smp, p * u.low.xy + u.low.zw, 0.0));
    }
    // MakeMerge: the blur, then the layer over it (src-over), into one surface; drawn onto the
    // canvas, which is cleared transparent (the #010101 is the View's backgroundColor).
    let merged = q8(sharp + glow * (1.0 - sharp.a));
    // Core Animation colour-matches the P3 surface per pixel, unpremultiplied (a dim or edge
    // pixel keeps its colour's sRGB hue: cyan's glow has no red, where converting the
    // premultiplied value gave it up to 10 levels), and blends it over the View's #010101.
    var src = vec3<f32>(0.0);
    if (merged.a > 0.0) { src = p3_to_srgb(merged.rgb / merged.a) * merged.a; }
    let bg = vec3<f32>(1.0 / 255.0);
    var c = src + bg * (1.0 - merged.a);
    if (u.canvas.w > 0.5) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}
