// Skia Bottom Sheet (src/animations/skia-bottom-sheet/components/bottom-sheet): the canvas,
// composed per pixel. `photo` is the photo drawn to cover the canvas; `blurred` the same blurred
// (Blur 10, mode "clamp"), shown inside the sheet (Group clip = the sheet's rounded rect: x 0,
// y = top, the canvas's width and height, r 30); over it the handle (a white RoundedRect 100 × 5,
// r 5, centred, 10 below the sheet's top); then the sheet's path filled rgba(0,0,0,0.2) under
// BlurMask(5, "inner"): its coverage × its coverage blurred. `mask` is that blurred coverage for
// the sheet at y 0 (it only moves): read at the pixel moved up by the sheet's top.
// Each draw lands in the canvas's 8-bit Display P3 surface; Core Animation shows it as sRGB.
// The Group's clip is RN's non-AA clipPath of an rrect path: Graphite snaps its device bounds
// to whole pixels, then its analytic clip.
struct Uniforms {
    // The canvas (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The sheet's top, the canvas's width and height (points), unused.
    sheet: vec4<f32>,
    // The clip's snapped device bounds (ltrb) and corner radius (device px).
    clip: vec4<f32>,
    clip_r: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
    return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// A rounded rect's signed distance (negative inside); radii clamped to half the shorter side,
// as Skia's rrect clamps them.
fn rrect(p: vec2<f32>, origin: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
    let half = size * 0.5;
    let r = min(radius, min(half.x, half.y));
    let d = abs(p - origin - half) - half + vec2<f32>(r);
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded sRGB to encoded Display P3 (D65), and back (clipped to sRGB), as gfx::P3Layer's.
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        0.8224621 * l.r + 0.1775380 * l.g,
        0.0331941 * l.r + 0.9668058 * l.g,
        0.0170827 * l.r + 0.0723974 * l.g + 0.9105199 * l.b));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}
// An 8-bit surface's store.
fn q8(c: vec3<f32>) -> vec3<f32> {
    return round(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)) * 255.0) / 255.0;
}
// Graphite's `sk_analytic_clip` for an rrect with equal circular corners, at a pixel centre.
fn analytic_clip(p: vec2<f32>, r: vec4<f32>, radius: f32) -> f32 {
    let c = clamp(p, r.xy + vec2<f32>(radius), r.zw - vec2<f32>(radius));
    let q = p - c;
    if (all(q != vec2<f32>(0.0))) {
        let igl = 0.5 / (abs(q.x) + abs(q.y));
        return clamp(0.5 + igl * (radius * radius - dot(q, q)), 0.0, 1.0);
    }
    let lin = min(min(p.x - r.x, r.z - p.x), min(p.y - r.y, r.w - p.y));
    return clamp(0.5 + lin, 0.0, 1.0);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.uv * u.canvas.xy / s;
    let top = u.sheet.x;
    let size = u.sheet.yz;
    // The sheet's path, antialiased (the Touchable.Path's coverage).
    let inside = clamp(0.5 - rrect(p, vec2<f32>(0.0, top), size, 30.0) * s, 0.0, 1.0);
    var c = q8(srgb_to_p3(textureLoad(photo, vec2<i32>(in.pos.xy), 0).rgb));
    let clip = analytic_clip(in.pos.xy, u.clip, u.clip_r.x);
    c = q8(mix(c, srgb_to_p3(textureSampleLevel(blurred, smp, in.uv, 0.0).rgb), clip));
    // SHEET_HANDLE_WIDTH 100, 5 tall, r 5, at y = top + 10.
    let handle = clamp(0.5 - rrect(p, vec2<f32>(size.x / 2.0 - 50.0, top + 10.0), vec2<f32>(100.0, 5.0), 5.0) * s, 0.0, 1.0);
    c = q8(mix(c, vec3<f32>(1.0), handle));
    let q = vec2<f32>(p.x, p.y - top) / size;
    var blur = 0.0;
    if (q.y >= 0.0) { blur = textureSampleLevel(mask, smp, q, 0.0).a; }
    c = q8(c * (1.0 - 0.2 * inside * blur));
    var out = p3_to_srgb(c);
    if (u.canvas.w > 0.5) { out = to_linear(out); }
    return vec4<f32>(out, 1.0);
}
