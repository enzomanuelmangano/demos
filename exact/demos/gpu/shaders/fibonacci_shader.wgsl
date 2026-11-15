// Fibonacci Shader: XorDev's sphere of N glowing points, each adding colour / d^2 at distance
// d, in a square of the canvas's width. `fs` sums every point at every pixel and masks the
// square with a white circle of half its width under Blur(10): the drawn-slider layout.
// `far_fs`, `near_vs` and `near_fs` are the full-bleed layout's, split by distance (see RC).
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, and whether the target
    // encodes sRGB itself (1).
    canvas: vec4<f32>,
    // The square's top-left corner and side, in points.
    square: vec4<f32>,
    // The trip count, 1 for the full-bleed layout (no circle mask), and the far field's size
    // in texels.
    params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// One vec4 a point, solved on the CPU once a frame (350 of them, against a loop that would
// solve each for every pixel): (kx, ky, w, colour), k being the point's offset in the square's
// coordinates, w its weight, and the colour cos(i + 0, 2, 4) + 1 as three unorm8 over 0 to 2
// in the bits of a float.
@group(0) @binding(1) var<storage, read> points: array<vec4<f32>>;

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
    let n = i32(u.params.x);
    let q = (fc * 2.0 - res) / res.y;
    var o = vec3<f32>(0.0);
    for (var i = 0; i < n; i = i + 1) {
        let a = points[i];
        let c = q + a.xy;
        o = o + unpack4x8unorm(bitcast<u32>(a.w)).xyz * (2.0 * a.z / dot(c, c));
    }
    // The layer stores the shader's (premultiplied) colour clamped; the mask keeps it where
    // the blurred circle's luminance (its coverage, white) is.
    var m = 1.0;
    if (u.params.y < 0.5) {
        m = blurred_disk(length(fc - res * 0.5), size * 0.5);
    }
    var rgb = clamp(o, vec3<f32>(0.0), vec3<f32>(1.0)) * m;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb, 1.0);
}

// The full-bleed field is split at RC, in the square's units (it spans 2). With t = d^2 / RC^2,
// a point's w / d^2 is a smooth part and a near part:
//   far  = w / d^2 * (2t - t^2), and w / d^2 beyond RC: finite and smooth at the point, so a
//          texture a sixteenth of the screen's area, read bilinearly, holds it;
//   near = w / d^2 * (1 - t)^2, zero beyond RC: a quad of half-side RC around each point,
//          added where it reaches (the sum is the effect's, to the last bit of a pixel).
// Every pixel then pays for the points near it, not for all of them.
const RC: f32 = 0.1;

// The point's colour cos(i + 0, 2, 4) + 1, times its weight.
fn tint(a: vec4<f32>) -> vec3<f32> {
    return unpack4x8unorm(bitcast<u32>(a.w)).xyz * (2.0 * a.z);
}

// Every point's far part at the texel's pixel, in the far field's texture.
@fragment
fn far_fs(in: Out) -> @location(0) vec4<f32> {
    let px = in.pos.xy * u.canvas.xy / u.params.zw;
    let fc = px / u.canvas.z - u.square.xy;
    let side = u.square.z;
    let q = (fc * 2.0 - side) / side;
    let inv = 1.0 / (RC * RC);
    let n = i32(u.params.x);
    var o = vec3<f32>(0.0);
    for (var i = 0; i < n; i = i + 1) {
        let a = points[i];
        let c = q + a.xy;
        let t = dot(c, c) * inv;
        o = o + tint(a) * (inv * select(1.0 / t, 2.0 - t, t < 1.0));
    }
    return vec4<f32>(o, 1.0);
}

struct Near {
    @builtin(position) pos: vec4<f32>,
    // The pixel's offset from the point, in the square's units.
    @location(0) c: vec2<f32>,
    @location(1) @interpolate(flat) tint: vec3<f32>,
};

@vertex
fn near_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Near {
    let a = points[i];
    let corner = array<vec2<f32>, 6>(vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0))[v];
    let c = corner * RC;
    // The pixel's q is the point's (-k) plus c.
    let side = u.square.z;
    let px = (u.square.xy + ((c - a.xy) * side + side) * 0.5) * u.canvas.z;
    var o: Near;
    o.pos = vec4<f32>(px.x / u.canvas.x * 2.0 - 1.0, 1.0 - px.y / u.canvas.y * 2.0, 0.0, 1.0);
    o.c = c;
    o.tint = tint(a);
    return o;
}

// Capped only against half-float overflow (and 0 * inf): a pixel at a point's very centre is a
// huge value, and anything over 1 clamps in the compose.
@fragment
fn near_fs(in: Near) -> @location(0) vec4<f32> {
    let d2 = dot(in.c, in.c);
    let t = d2 / (RC * RC);
    let k = (1.0 - t) * (1.0 - t) / d2;
    return vec4<f32>(min(in.tint * select(0.0, min(k, 1.0e9), t < 1.0), vec3<f32>(16.0)), 0.0);
}
