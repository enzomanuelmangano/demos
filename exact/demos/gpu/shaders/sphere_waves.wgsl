// Sphere Waves (src/animations/sphere-waves): 2000 dots (drawCircle, antialiased) filled with
// one LinearGradient from (0, 0) to the canvas's (width, height) through five evenly spaced HSL
// colours, interpolated as Skia does (unpremultiplied sRGB), on black. The dots are instances
// of one quad, their coverage computed here.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The gradient's five colours (straight sRGB).
    stops: array<vec4<f32>, 5>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// Per dot: x, y, radius (points), unused.
@group(0) @binding(1) var<storage, read> dots: array<vec4<f32>>;

struct Dot {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) centre: vec2<f32>,
    @location(2) radius: f32,
};

@vertex
fn dot_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Dot {
    let c = dots[i];
    let s = u.canvas.z;
    let r = c.z * s;
    let corner = array<vec2<f32>, 6>(vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0))[v];
    let centre = c.xy * s;
    let p = centre + corner * (r + 1.0);
    var o: Dot;
    o.pos = vec4<f32>(p.x / u.canvas.x * 2.0 - 1.0, 1.0 - p.y / u.canvas.y * 2.0, 0.0, 1.0);
    o.local = p;
    o.centre = centre;
    o.radius = r;
    return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn gradient(p: vec2<f32>) -> vec3<f32> {
    let d = u.canvas.xy;
    let t = clamp(dot(p, d) / dot(d, d), 0.0, 1.0) * 4.0;
    let k = min(u32(floor(t)), 3u);
    return mix(u.stops[k].rgb, u.stops[k + 1u].rgb, t - f32(k));
}

@fragment
fn dot_fs(in: Dot) -> @location(0) vec4<f32> {
    // A circle under a pixel wide covers its area, not more.
    let r = in.radius;
    let a = clamp(r - distance(in.local, in.centre) + 0.5, 0.0, 1.0) * min(1.0, r * 2.0);
    var rgb = gradient(in.local);
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb * a, a);
}
