// Spiral (src/animations/spiral): ~1640 circles on a logarithmic spiral, filled with a sweep
// gradient (cyan, magenta, yellow, cyan) about the canvas's centre, glowing (Blur 5 under the
// sharp circles) on #010101. The circles are instances of one quad, antialiased in the shader.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, and whether the target
    // encodes sRGB itself (1).
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// Per circle: x, y (points from the centre), radius (points), unused.
@group(0) @binding(1) var<storage, read> circles: array<vec4<f32>>;
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var glow: texture_2d<f32>;
@group(1) @binding(2) var smp: sampler;

struct Dot {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) centre: vec2<f32>,
    @location(2) radius: f32,
};

@vertex
fn dot_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Dot {
    let c = circles[i];
    let s = u.canvas.z;
    let r = c.z * s;
    let corner = array<vec2<f32>, 6>(vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0))[v];
    let centre = u.canvas.xy * 0.5 + c.xy * s;
    let p = centre + corner * (r + 1.0);
    var o: Dot;
    o.pos = vec4<f32>(p.x / u.canvas.x * 2.0 - 1.0, 1.0 - p.y / u.canvas.y * 2.0, 0.0, 1.0);
    o.local = p;
    o.centre = centre;
    o.radius = r;
    return o;
}

fn sweep(p: vec2<f32>) -> vec3<f32> {
    let v = p - u.canvas.xy * 0.5;
    let t = fract(atan2(v.y, v.x) / 6.283185307 + 1.0) * 3.0;
    let cyan = vec3<f32>(0.0, 1.0, 1.0);
    let magenta = vec3<f32>(1.0, 0.0, 1.0);
    let yellow = vec3<f32>(1.0, 1.0, 0.0);
    if (t < 1.0) { return mix(cyan, magenta, t); }
    if (t < 2.0) { return mix(magenta, yellow, t - 1.0); }
    return mix(yellow, cyan, t - 2.0);
}

@fragment
fn dot_fs(in: Dot) -> @location(0) vec4<f32> {
    let a = clamp(in.radius - distance(in.local, in.centre) + 0.5, 0.0, 1.0);
    return vec4<f32>(sweep(in.local) * a, a);
}

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

// The background, the blurred copy, then the sharp circles over it (ImageFilter.MakeMerge).
@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let g = textureSampleLevel(glow, smp, in.uv, 0.0);
    let d = textureSampleLevel(src, smp, in.uv, 0.0);
    var c = vec3<f32>(1.0 / 255.0) * (1.0 - g.a) + g.rgb;
    c = c * (1.0 - d.a) + d.rgb;
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
