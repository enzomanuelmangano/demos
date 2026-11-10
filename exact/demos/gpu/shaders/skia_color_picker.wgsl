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

fn sweep(t: f32) -> vec3<f32> {
    let cyan = vec3<f32>(0.0, 1.0, 1.0);
    let magenta = vec3<f32>(1.0, 0.0, 1.0);
    let yellow = vec3<f32>(1.0, 1.0, 0.0);
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
    var c = vec4<f32>(sweep(t) * mask, mask);
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
    var c = textureLoad(base, vec2<i32>(p), 0);
    let shadow = blur_at(p);
    c = c * (1.0 - shadow);
    let q = vec2<i32>(p - u.layer.xy);
    if (all(q >= vec2<i32>(0)) && all(vec2<f32>(q) < u.layer.zw)) {
        let k = textureLoad(picker, q, 0);
        c = k + c * (1.0 - k.a);
    }
    if (u.canvas.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}
