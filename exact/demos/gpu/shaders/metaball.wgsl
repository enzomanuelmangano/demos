// Metaball (src/animations/metaball/index.tsx), as an analytic SDF (the owner's call, phone
// feedback mwhp8vhc, in place of RN's Blur 30 + ColorMatrix alpha threshold): each circle is a
// circle's signed distance, the two merged by a polynomial smooth minimum (k), the shape's edge
// covered over one device pixel. A neck forms while the centres are under 2R + k/2 apart and
// breaks there, as RN's blurred union does at about 2R + 40 (k = 80). The fill: RN's
// SweepGradient about (0, 0) (cyan, blue, cyan), interpolated in Display P3, stored in the
// canvas's 8-bit P3 surface, converted to sRGB by Core Animation, over the View's #0A0A0A.
struct Uniforms {
    // The canvas (device px), its scale, whether the target encodes sRGB itself.
    canvas: vec4<f32>,
    // The two centres (pt): first.xy, second.xy.
    blobs: vec4<f32>,
    // .x: the radius (pt); .y: the smooth minimum's k (pt).
    shape: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

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
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

// The polynomial smooth minimum (Quilez): a and b blended over k.
fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = pos.xy / s;
    let r = u.shape.x;
    // The neck's reach grows with the gap up to k at 2R apart: a smooth minimum of two equal
    // fields would swell the shape by k/4 everywhere, so coincident circles stay one circle of
    // radius R (as RN's blurred union of them is), and the neck is k's from 2R on.
    let gap = length(u.blobs.zw - u.blobs.xy);
    let k = max(u.shape.y * clamp(gap / (2.0 * r), 0.0, 1.0), 1e-3);
    let d = smin(length(p - u.blobs.xy) - r, length(p - u.blobs.zw) - r, k);
    // One device pixel of analytic coverage across the edge (the field is a distance, its
    // gradient 1 away from the neck and close to it there).
    let a = clamp(0.5 - d * s, 0.0, 1.0);
    // SweepGradient about (0, 0): its angle clockwise from +x over a turn; stops at 0, 0.5, 1.
    let t = fract(atan2(p.y, p.x) / 6.283185307179586 + 1.0);
    let cyan = vec3<f32>(0.0, 1.0, 1.0);
    let blue = vec3<f32>(0.0, 0.0, 1.0);
    let g = select(mix(blue, cyan, (t - 0.5) * 2.0), mix(cyan, blue, t * 2.0), t < 0.5);
    let canvas = q8(vec4<f32>(g * a, a));
    var src = vec3<f32>(0.0);
    if (canvas.a > 0.0) { src = p3_to_srgb(canvas.rgb / canvas.a) * canvas.a; }
    let bg = vec3<f32>(10.0 / 255.0);
    var c = src + bg * (1.0 - canvas.a);
    if (u.canvas.w > 0.5) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}
