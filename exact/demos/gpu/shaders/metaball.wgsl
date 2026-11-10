// Metaball (src/animations/metaball/index.tsx): two circles of radius 80, their union filled with
// a sweep gradient about the canvas's corner, then blurred (σ 30) and its alpha thresholded by
// the ColorMatrix (a' = 60 a - 30). The blur runs on a field a point or two per texel: the mask,
// a horizontal and a vertical Gaussian, then the threshold and the gradient at full resolution.
struct Uniforms {
    // Circle centres, canvas points: (x1, y1, x2, y2).
    centres: vec4<f32>,
    // The field's origin in canvas points (x, y), and points per texel (size, size).
    field: vec4<f32>,
    // The field's texel count (w, h), σ in texels, the radius in points.
    grid: vec4<f32>,
    // The canvas in points (w, h), and whether the target is sRGB-encoding (1) or not (0).
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let p = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(p, 0.0, 1.0);
    o.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    return o;
}

// The union's coverage at a field texel, antialiased over one texel.
@fragment
fn mask(in: Out) -> @location(0) vec4<f32> {
    let p = u.field.xy + in.uv * u.grid.xy * u.field.z;
    let d = min(distance(p, u.centres.xy), distance(p, u.centres.zw)) - u.grid.w;
    let a = clamp(0.5 - d / u.field.z, 0.0, 1.0);
    return vec4<f32>(a, 0.0, 0.0, 1.0);
}

fn gauss(dir: vec2<f32>, uv: vec2<f32>) -> f32 {
    let sigma = u.grid.z;
    let r = i32(ceil(3.0 * sigma));
    let texel = dir / u.grid.xy;
    var sum = 0.0;
    var weight = 0.0;
    for (var i = -r; i <= r; i = i + 1) {
        let x = f32(i);
        let w = exp(-0.5 * x * x / (sigma * sigma));
        sum = sum + textureSampleLevel(src, smp, uv + texel * x, 0.0).r * w;
        weight = weight + w;
    }
    return sum / weight;
}

@fragment
fn blur_x(in: Out) -> @location(0) vec4<f32> {
    return vec4<f32>(gauss(vec2<f32>(1.0, 0.0), in.uv), 0.0, 0.0, 1.0);
}

@fragment
fn blur_y(in: Out) -> @location(0) vec4<f32> {
    return vec4<f32>(gauss(vec2<f32>(0.0, 1.0), in.uv), 0.0, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn enc_srgb(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded sRGB to encoded Display P3, and back (clipped to sRGB): RN Skia on iOS draws into a
// Display P3 surface, so its gradients interpolate between the stops' P3 values.
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc_srgb(vec3<f32>(
        0.8225 * l.r + 0.1774 * l.g,
        0.0332 * l.r + 0.9669 * l.g,
        0.0171 * l.r + 0.0724 * l.g + 0.9108 * l.b));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc_srgb(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}

// SweepGradient c=(0, 0), colors cyan → blue → cyan (mixed in P3), over the background #0A0A0A.
@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy;
    let fuv = (p - u.field.xy) / (u.grid.xy * u.field.z);
    let a = clamp(textureSampleLevel(src, smp, fuv, 0.0).r * 60.0 - 30.0, 0.0, 1.0);
    let turn = fract(atan2(p.y, p.x) / 6.283185307 + 1.0);
    let k = 1.0 - abs(turn * 2.0 - 1.0);
    let colour = p3_to_srgb(mix(srgb_to_p3(vec3<f32>(0.0, 1.0, 1.0)), srgb_to_p3(vec3<f32>(0.0, 0.0, 1.0)), k));
    let bg = vec3<f32>(10.0 / 255.0);
    var c = mix(bg, colour, a);
    if (u.canvas.z > 0.5) {
        c = to_linear(c);
    }
    return vec4<f32>(c, 1.0);
}
