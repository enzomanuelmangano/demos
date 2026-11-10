// Fractal Glass (src/animations/fractal-glass/index.tsx), per pixel: the background colour; the
// circle (r 100), sharp, outside the glass rect (Group clip invertClip); inside it the circle
// blurred (Blur 25, decal: a radial profile of the blurred disc, `profile`) under the mask of
// fractal-glass-mask.tsx (mode "alpha"): a 4 × 4 grid of cells, each a LinearGradient from
// white (alpha 1) at its top left to rgba(0,0,0,0.45) at its bottom right less 5 pt. Skia
// blends in the target's encoding: sRGB here, linearised at the end for an sRGB target.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The glass rect in points: x, y, width, height.
    glass: vec4<f32>,
    // The circle's centre (points), its radius, the profile's reach (points).
    circle: vec4<f32>,
    // The background's colour (straight sRGB, opaque).
    background: vec4<f32>,
    // The circle's colour.
    color: vec4<f32>,
    // The blurred disc's coverage at distance reach × k / 255 from its centre, k = 0…255.
    profile: array<vec4<f32>, 64>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

// gradientsAmount.
const CELLS: f32 = 4.0;

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

fn sample(k: i32) -> f32 {
    let c = clamp(k, 0, 255);
    return u.profile[c / 4][c % 4];
}

fn blurred(d: f32) -> f32 {
    let t = d / u.circle.w * 255.0;
    if (t >= 255.0) { return 0.0; }
    let k = i32(floor(t));
    return mix(sample(k), sample(k + 1), t - floor(t));
}

// How much of the pixel at p (device px) a span [a, b] (device px) covers on one axis.
fn span(p: f32, a: f32, b: f32) -> f32 {
    return clamp(min(p - a, b - p) + 0.5, 0.0, 1.0);
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = in.uv * u.canvas.xy;
    let p = px / s;
    let g = u.glass;
    let inside = span(px.x, g.x * s, (g.x + g.z) * s) * span(px.y, g.y * s, (g.y + g.w) * s);
    let d = distance(p, u.circle.xy);
    var c = u.background.rgb;
    // The sharp circle outside the glass.
    let sharp = clamp((u.circle.z - d) * s + 0.5, 0.0, 1.0) * (1.0 - inside);
    c = mix(c, u.color.rgb, sharp);
    // The blurred circle inside it, through the mask.
    let cell = vec2<f32>(g.z, g.w) / CELLS;
    let index = clamp(floor((p - g.xy) / cell), vec2<f32>(0.0), vec2<f32>(CELLS - 1.0));
    let start = g.xy + cell * index;
    let dir = cell - vec2<f32>(5.0);
    let t = clamp(dot(p - start, dir) / dot(dir, dir), 0.0, 1.0);
    let mask = mix(1.0, 0.45, t);
    let soft = blurred(d) * mask * inside;
    c = mix(c, u.color.rgb, soft);
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}
