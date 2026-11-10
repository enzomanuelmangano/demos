// Skia Bottom Sheet (src/animations/skia-bottom-sheet/components/bottom-sheet): the canvas,
// composed per pixel. `photo` is the photo drawn to cover the canvas; `blurred` the same blurred
// (Blur 10, mode "clamp"), shown inside the sheet (Group clip = the sheet's rounded rect: x 0,
// y = top, the canvas's width and height, r 30); over it the handle (a white RoundedRect 100 × 5,
// r 5, centred, 10 below the sheet's top); then the sheet's path filled rgba(0,0,0,0.2) under
// BlurMask(5, "inner"): its coverage × its coverage blurred. `mask` is that blurred coverage for
// the sheet at y 0 (it only moves): read at the pixel moved up by the sheet's top.
struct Uniforms {
    // The canvas (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The sheet's top, the canvas's width and height (points), unused.
    sheet: vec4<f32>,
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

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.uv * u.canvas.xy / s;
    let top = u.sheet.x;
    let size = u.sheet.yz;
    let inside = clamp(0.5 - rrect(p, vec2<f32>(0.0, top), size, 30.0) * s, 0.0, 1.0);
    var c = mix(textureLoad(photo, vec2<i32>(in.pos.xy), 0).rgb, textureSampleLevel(blurred, smp, in.uv, 0.0).rgb, inside);
    // SHEET_HANDLE_WIDTH 100, 5 tall, r 5, at y = top + 10.
    let handle = clamp(0.5 - rrect(p, vec2<f32>(size.x / 2.0 - 50.0, top + 10.0), vec2<f32>(100.0, 5.0), 5.0) * s, 0.0, 1.0);
    c = mix(c, vec3<f32>(1.0), handle);
    let q = vec2<f32>(p.x, p.y - top) / size;
    var blur = 0.0;
    if (q.y >= 0.0) { blur = textureSampleLevel(mask, smp, q, 0.0).a; }
    c = c * (1.0 - 0.2 * inside * blur);
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
