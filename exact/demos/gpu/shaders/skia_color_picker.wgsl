// Skia Color Picker (src/animations/skia-color-picker/components/color-picker): the wheel,
// drawn once, and each frame's composite of the wheel, the picker's drop shadow and the picker.
//
// `wheel`: the Group (translate h, h; scale s) holding two circles (centre W/2, r W/2) under the
// group's BlurMask(20, "solid"): the sweep-gradient circle (cyan, magenta, yellow, cyan from +x,
// clockwise, unpremultiplied sRGB lerp) and the runtime shader circle (radialGradientShader at
// size W, evaluated at each pixel centre's local point). "solid" coverage = the shape's
// coverage ∪ its blur: cov + blur · (1 − cov).
//
// `compose`: wheel; then the DropShadow (black, the stroke layer's alpha blurred) and the stroke
// and fill layer over it, src-over.
struct Uniforms {
    // The canvas (device px), device px per point, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // W (canvasSize), h (the picker's bounds height: the group's translation), s (its scale).
    wheel: vec4<f32>,
    // The blurred image: uv = p · xy + zw (the plan's low-resolution mapping).
    low: vec4<f32>,
    // Where the blur's output exists (device px, ltrb).
    output: vec4<f32>,
    // The picker layer's origin and size (device px).
    layer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// wheel: the circle's coverage. compose: the wheel.
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
// compose: the picker (stroke, then fill), premultiplied.
@group(0) @binding(3) var picker: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

const PI: f32 = 3.1415926535897932384626433832795;

fn blur_at(p: vec2<f32>) -> f32 {
    if (any(p < u.output.xy) || any(p > u.output.zw)) { return 0.0; }
    return textureSampleLevel(blurred, smp, p * u.low.xy + u.low.zw, 0.0).a;
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

// RN Skia draws into the app's Display P3 surface: a runtime effect's output is P3, and a
// gradient interpolates its sRGB stops' P3 values. The wheel is stored and blended in P3 and
// turned into sRGB per pixel at the composite (the saturated edge clips to the sRGB gamut there).
fn dec(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = dec(c);
    return enc(vec3<f32>(1.2249401 * l.r - 0.2249404 * l.g, -0.0420569 * l.r + 1.0420571 * l.g, -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = dec(c);
    return enc(vec3<f32>(0.8224621 * l.r + 0.1775380 * l.g, 0.0331941 * l.r + 0.9668058 * l.g, 0.0170827 * l.r + 0.0723974 * l.g + 0.9105199 * l.b));
}

fn sweep_p3(t: f32) -> vec3<f32> {
    let cyan = srgb_to_p3(vec3<f32>(0.0, 1.0, 1.0));
    let magenta = srgb_to_p3(vec3<f32>(1.0, 0.0, 1.0));
    let yellow = srgb_to_p3(vec3<f32>(1.0, 1.0, 0.0));
    if (t < 1.0 / 3.0) { return mix(cyan, magenta, t * 3.0); }
    if (t < 2.0 / 3.0) { return mix(magenta, yellow, t * 3.0 - 1.0); }
    return mix(yellow, cyan, t * 3.0 - 2.0);
}

@fragment
fn wheel(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let size = u.wheel.x;
    let cov = textureLoad(base, vec2<i32>(p), 0).a;
    let mask = cov + blur_at(p) * (1.0 - cov);
    // The pixel centre in the group's local space.
    let local = (p / u.canvas.z - vec2<f32>(u.wheel.y)) / u.wheel.z;
    // SkSweepGradient: angle from +x, clockwise on screen, 0…1.
    let d = local - vec2<f32>(size * 0.5);
    var t = atan2(d.y, d.x) / (2.0 * PI);
    if (t < 0.0) { t = t + 1.0; }
    // The wheel canvas as RN Skia stores it: premultiplied Display P3 (8 bits: the target).
    var c = vec4<f32>(sweep_p3(t) * mask, mask);
    // radialGradientShader.
    let normalized = local / vec2<f32>(size);
    let distance = length(normalized - vec2<f32>(0.5));
    if (distance <= 0.5) {
        let nc = normalized - 0.5;
        let a = atan2(nc.y, nc.x);
        let hue = a * 0.5 / PI + 0.5;
        let sat = (distance * 2.0) * (distance * 2.0);
        let rgb = hsv2rgb(vec3<f32>(hue, sat, 1.0));
        c = vec4<f32>(rgb * mask, mask) + c * (1.0 - mask);
    }
    return c;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    // Each RN canvas is an 8-bit premultiplied Display P3 surface; Core Animation converts each
    // pixel to sRGB unpremultiplied, then blends the picker's canvas over the wheel's (over black).
    let w = textureLoad(base, vec2<i32>(p), 0);
    var c = vec4<f32>(0.0);
    if (w.a > 0.0) {
        c = vec4<f32>(p3_to_srgb(w.rgb / w.a) * w.a, w.a);
    }
    // The picker's canvas: the shadow's black under the stroke and the fill (the layer, P3).
    var k = vec4<f32>(0.0);
    let q = vec2<i32>(p - u.layer.xy);
    if (all(q >= vec2<i32>(0)) && all(vec2<f32>(q) < u.layer.zw)) {
        k = textureLoad(picker, q, 0);
    }
    let pc = round((k + vec4<f32>(0.0, 0.0, 0.0, blur_at(p)) * (1.0 - k.a)) * 255.0) / 255.0;
    if (pc.a > 0.0) {
        c = vec4<f32>(p3_to_srgb(pc.rgb / pc.a) * pc.a, pc.a) + c * (1.0 - pc.a);
    }
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
