// Blur Circles (src/animations/blur-circles): RN Skia's draws, in order, into the canvas's 8-bit
// Display P3 surface (cleared transparent), then Core Animation's P3 → sRGB per pixel,
// unpremultiplied, over the View's white.
// Both groups' clip is the glass's rrect without antialiasing: its bounds snapped to pixels,
// then Graphite's analytic clip.
// 1. Group clip=glass + Blur 10: Graphite's blur of the sweep circle within the layer's bounds
//    (`inside_low`), drawn back through the glass clip.
// 2. Group clip=glass invertClip: the sweep circle (`sweep`) outside the glass.
// 3. The glass, rgba(0,0,0,0.08) through BlurMask 20 "inner": Graphite draws the circle's
//    coverage into a layer (`mask`), blurs it (`mask_low`) and keeps blur × coverage (DstIn),
//    an 8-bit image the paint is drawn through.
// 4. The hairline, rgba(255,255,255,0.25), 1 pt stroke.
// Every draw lands in 8 bits (q8).
struct Uniforms {
    // The glass's centre and radius (device px), the scale.
    glass: vec4<f32>,
    // The glass's clip, its device bounds snapped to whole pixels (ltrb).
    clip: vec4<f32>,
    // The canvas (device px), whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The blurred inside: uv = p · xy + zw (p in device px); its bounds (ltrb, device px).
    in_low: vec4<f32>,
    in_out: vec4<f32>,
    // The blurred mask, the same.
    m_low: vec4<f32>,
    m_out: vec4<f32>,
    // .x: 1 when the inside was blurred, .y: 1 when the mask was; .zw: the mask layer's origin.
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inside_low: texture_2d<f32>;
@group(0) @binding(2) var sweep: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var mask_low: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

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
fn over(src: vec4<f32>, dst: vec4<f32>) -> vec4<f32> {
    return q8(src + dst * (1.0 - src.a));
}
fn within(p: vec2<f32>, r: vec4<f32>) -> bool {
    return all(p >= r.xy) && all(p <= r.zw);
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let d = distance(p, u.glass.xy);
    // Group 1's clip and group 2's inverse: the same analytic clip.
    let clip = graphite_clip(p);
    var s = vec4<f32>(0.0);
    if (u.flags.x > 0.5 && within(p, u.in_out)) {
        s = over(textureSampleLevel(inside_low, smp, p * u.in_low.xy + u.in_low.zw, 0.0) * clip, s);
    }
    let texel = vec2<i32>(p);
    s = over(textureLoad(sweep, texel, 0) * (1.0 - clip), s);
    if (u.flags.y > 0.5 && within(p, u.m_out)) {
        let blurred = textureSampleLevel(mask_low, smp, p * u.m_low.xy + u.m_low.zw, 0.0).a;
        // The coverage layer is transparent outside its texture.
        let mt = texel - vec2<i32>(u.flags.zw);
        var coverage = 0.0;
        if (all(mt >= vec2<i32>(0)) && all(vec2<u32>(mt) < textureDimensions(mask))) {
            coverage = textureLoad(mask, mt, 0).a;
        }
        let m = q8(vec4<f32>(blurred * coverage)).a;
        let a = 0.08 * m;
        s = over(vec4<f32>(0.0, 0.0, 0.0, a), s);
    }
    let ring = 0.25 * clamp(0.5 * u.glass.w - abs(d - u.glass.z) + 0.5, 0.0, 1.0);
    s = over(vec4<f32>(ring), s);
    var src = vec3<f32>(0.0);
    if (s.a > 0.0) { src = p3_to_srgb(s.rgb / s.a) * s.a; }
    var c = src + vec3<f32>(1.0 - s.a);
    if (u.canvas.z > 0.5) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}

// Graphite's `sk_analytic_clip` for the glass's clip at a pixel centre. RN Skia's native Group
// clips without antialiasing (`clipRRect(rrect, op)`), so Graphite snaps the rrect's bounds to
// whole pixels (`u.clip`, PixelSnapping::kYes); a circle's corners share its centre:
// 0.5 + (r² − |q|²) / (2 (|qx| + |qy|)), the same for the inverse (1 − that).
fn graphite_clip(p: vec2<f32>) -> f32 {
    let q = p - 0.5 * (u.clip.xy + u.clip.zw);
    let r = 0.5 * (u.clip.z - u.clip.x);
    let igl = 0.5 / max(abs(q.x) + abs(q.y), 1e-6);
    return clamp(0.5 + igl * (r * r - dot(q, q)), 0.0, 1.0);
}
