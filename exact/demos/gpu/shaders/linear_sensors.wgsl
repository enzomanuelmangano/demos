// Linear Sensors (src/animations/linear-sensors): the full-screen glow (a RadialGradient Fill
// under Blur 50, decal: it fades out at the screen's edges) and the 500² canvas at the centre,
// its group under [perspective 200, rotateY, rotateX] about the canvas's centre. What the
// group draws is kept in its own plane (the canvas's points, a 300² window from (100, 100)): a
// pixel finds its point there with the inverse projective 3×3 and composes, in order, the drop
// shadow (<Shadow color="#000000" blur={3.5} dx dy>: the layer's alpha blurred, moved), the
// layer, and the three ovals (#cecece, stroke 2) under BlurMask 3 "solid": coverage
// c + blur(c) × (1 − c). Premultiplied, over the demo's backdrop.
struct Compose {
    // Screen points → the canvas's points, by rows.
    r0: vec4<f32>,
    r1: vec4<f32>,
    r2: vec4<f32>,
    // The canvas's rect on screen (points): x, y, width, height.
    canvas_rect: vec4<f32>,
    // The drop shadow's offset (points), unused.
    shadow: vec4<f32>,
    // The target (device pixels), device pixels per point, 1 to write linear.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Compose;
@group(0) @binding(1) var glow: texture_2d<f32>;
@group(0) @binding(2) var layer: texture_2d<f32>;
@group(0) @binding(3) var layer_blur: texture_2d<f32>;
@group(0) @binding(4) var ovals: texture_2d<f32>;
@group(0) @binding(5) var ovals_blur: texture_2d<f32>;
@group(0) @binding(6) var smp: sampler;

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

const WINDOW: f32 = 100.0;
const SIDE: f32 = 300.0;

fn at(t: texture_2d<f32>, l: vec2<f32>) -> vec4<f32> {
    let uv = (l - vec2<f32>(WINDOW)) / SIDE;
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(0.0); }
    return textureSampleLevel(t, smp, uv, 0.0);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy / u.canvas.z;
    let back = textureSampleLevel(glow, smp, in.uv, 0.0);
    let h = vec3<f32>(p, 1.0);
    let q = vec3<f32>(dot(u.r0.xyz, h), dot(u.r1.xyz, h), dot(u.r2.xyz, h));
    let l = q.xy / q.z;
    let on = q.z > 0.0 && all(p >= u.canvas_rect.xy) && all(p <= u.canvas_rect.xy + u.canvas_rect.zw);
    var c = vec4<f32>(0.0);
    if (on) {
        let shadow = at(layer_blur, l - u.shadow.xy).a;
        c = vec4<f32>(0.0, 0.0, 0.0, shadow);
        let s = at(layer, l);
        c = s + c * (1.0 - s.a);
        let o = at(ovals, l).a;
        let k = o + at(ovals_blur, l).a * (1.0 - o);
        c = vec4<f32>(vec3<f32>(206.0 / 255.0) * k, k) + c * (1.0 - k);
    }
    c = c + back * (1.0 - c.a);
    var rgb = c.rgb;
    if (u.canvas.w > 0.5 && c.a > 0.0) { rgb = to_linear(rgb / c.a) * c.a; }
    return vec4<f32>(rgb, c.a);
}
