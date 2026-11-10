// Fibonacci Shader (src/animations/fibonacci-shader/index.tsx): XorDev's sphere of N glowing
// points (FibonacciEffect, line for line), in a square of the canvas's width, masked in
// luminance by a white circle of half that width under Blur(10).
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, and whether the target
    // encodes sRGB itself (1).
    canvas: vec4<f32>,
    // The square's top-left corner and side, in points; unused.
    square: vec4<f32>,
    // iTime, N, magicalMul; unused.
    params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    return o;
}

// MAX_CIRCLES_AMOUNT.
const MAX_N: f32 = 350.0;
// <Blur blur={10} />: sigma 10 points.
const SIGMA: f32 = 10.0;

// Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
fn erf(x: f32) -> f32 {
    let s = sign(x);
    let a = abs(x);
    let t = 1.0 / (1.0 + 0.3275911 * a);
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
    return s * y;
}

// The blurred circle's coverage at distance d from its centre: the disk of radius r convolved
// with a Gaussian of sigma SIGMA, exactly (one axis integrated numerically, the other in erf).
fn blurred_disk(d: f32, r: f32) -> f32 {
    if (d < r - 5.0 * SIGMA) { return 1.0; }
    if (d > r + 5.0 * SIGMA) { return 0.0; }
    let lo = max(-r, d - 5.0 * SIGMA);
    let hi = min(r, d + 5.0 * SIGMA);
    let n = 48;
    let dx = (hi - lo) / f32(n);
    var sum = 0.0;
    for (var k = 0; k < n; k = k + 1) {
        let x = lo + (f32(k) + 0.5) * dx;
        let h = sqrt(max(r * r - x * x, 0.0));
        let g = exp(-0.5 * (x - d) * (x - d) / (SIGMA * SIGMA));
        sum = sum + g * erf(h / (SIGMA * 1.41421356));
    }
    return sum * dx / (SIGMA * 2.50662827);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    // FC: the pixel's centre in the canvas's points (Skia's local coordinates).
    let fc = in.pos.xy / u.canvas.z - u.square.xy;
    let size = u.square.z;
    let res = vec2<f32>(size, size);
    let t = u.params.x;
    let n = u.params.y;
    let mul = u.params.z;
    var o = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    let uv = fc * 2.0 - res;
    for (var i = 0.0; i < MAX_N; i = i + 1.0) {
        if (i >= n) {
            break;
        }
        let a = i / (n * 0.5) - 1.0;
        let p = cos(i * mul + t + vec2<f32>(0.0, 11.0)) * sqrt(1.0 - a * a);
        let c = uv / res.y + vec2<f32>(p.x, a) / (p.y + 2.0);
        o = o + (cos(i + vec4<f32>(0.0, 2.0, 4.0, 0.0)) + 1.0) / dot(c, c) * (1.0 - p.y) / (n * 75.0);
    }
    // The layer stores the shader's (premultiplied) colour clamped; the mask keeps it where
    // the blurred circle's luminance (its coverage, white) is.
    let m = blurred_disk(length(fc - res * 0.5), size * 0.5);
    var rgb = clamp(o.rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * m;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb, 1.0);
}
