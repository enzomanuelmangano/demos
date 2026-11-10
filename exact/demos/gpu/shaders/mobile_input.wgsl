// Mobile Input (src/animations/mobile-input): the screen's composite.
//
// The container's #1C274D, then the Canvas's CircleStroke: a stroked circle shaded by a
// SweepGradient (yellow, cyan, cyan, #3C91E6, magenta, orange, yellow, evenly spaced, from +x,
// clockwise) under the group's BlurMask(blur, "solid"): coverage ∪ its blur, cov + blur · (1 − cov).
// Then the UI layer (the face, the PIN area, the keypad: all white, premultiplied).
//
// RN Skia draws into the app's Display P3 surface: the gradient interpolates its sRGB stops' P3
// values. The blends are in sRGB's encoded values (measured: the glow's edge over #1C274D, blue 48
// where a P3 blend gives 74).
struct Uniforms {
    // The target (device px), device px per point, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The ring's centre (points), whether the BlurMask is on (σ > 0), the canvas's bottom (device px).
    ring: vec4<f32>,
    // The blurred image: uv = p · xy + zw (the plan's low-resolution mapping).
    low: vec4<f32>,
    // Where the blur's output exists (device px, ltrb).
    output: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// The ring's coverage (alpha).
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
// The face, the PIN area and the keypad, premultiplied.
@group(0) @binding(3) var ui: texture_2d<f32>;
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

fn dec(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = dec(c);
    return enc(vec3<f32>(1.2249 * l.r - 0.2247 * l.g, -0.0420 * l.r + 1.0419 * l.g, -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = dec(c);
    return enc(vec3<f32>(0.8225 * l.r + 0.1774 * l.g, 0.0332 * l.r + 0.9669 * l.g, 0.0171 * l.r + 0.0724 * l.g + 0.9108 * l.b));
}

// The gradient's stops (sRGB), evenly spaced: SweepGradient's colors.
fn stop(i: i32) -> vec3<f32> {
    switch i {
        case 0, 6: { return vec3<f32>(1.0, 1.0, 0.0); }                          // yellow
        case 1, 2: { return vec3<f32>(0.0, 1.0, 1.0); }                          // cyan
        case 3: { return vec3<f32>(60.0, 145.0, 230.0) / 255.0; }                // #3C91E6
        case 4: { return vec3<f32>(1.0, 0.0, 1.0); }                             // magenta
        default: { return vec3<f32>(1.0, 165.0 / 255.0, 0.0); }                  // orange
    }
}

fn sweep_p3(t: f32) -> vec3<f32> {
    let x = clamp(t, 0.0, 1.0) * 6.0;
    let i = min(i32(floor(x)), 5);
    return mix(srgb_to_p3(stop(i)), srgb_to_p3(stop(i + 1)), x - f32(i));
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    // styles.container: #1C274D, a Display P3 view colour, as the sRGB colour it shows.
    var c = p3_to_srgb(vec3<f32>(28.0, 39.0, 77.0) / 255.0);
    if (p.y < u.ring.w) {
        let cov = textureLoad(coverage, vec2<i32>(p), 0).a;
        var mask = cov;
        if (u.ring.z > 0.5) {
            mask = cov + blur_at(p) * (1.0 - cov);
        }
        // SkSweepGradient at the pixel centre's local point: angle from +x, clockwise, 0…1.
        let d = p / u.canvas.z - u.ring.xy;
        var t = atan2(d.y, d.x) / (2.0 * PI);
        if (t < 0.0) { t = t + 1.0; }
        // The canvas's 8-bit P3 pixel (premultiplied), shown as sRGB over the container.
        let a8 = round(mask * 255.0) / 255.0;
        if (a8 > 0.0) {
            let rgb8 = round(sweep_p3(t) * mask * 255.0) / 255.0;
            c = p3_to_srgb(min(rgb8 / a8, vec3<f32>(1.0))) * a8 + c * (1.0 - a8);
        }
    }
    let k = textureLoad(ui, vec2<i32>(p), 0);
    c = k.rgb + c * (1.0 - k.a);
    var out = c;
    if (u.canvas.w > 0.5) {
        out = to_linear(out);
    }
    return vec4<f32>(out, 1.0);
}
