// Scrollable Shapes' points (src/animations/scrollable-shapes/index.tsx's Picture): N_POINTS
// points, each lerped between two of the four shapes by the scroll, tilted about x by 0.2 rad,
// turned about y by iTime, put in perspective (DISTANCE 350) about the window's centre, and
// drawn as Skia's drawPoints draws a round-capped point: a circle of the stroke's width (1.0
// where the perspective scale > 1.1, else 0.9), antialiased analytically. The paint's shader is
// a linear gradient (0, 0) → (W, H) of #00d9ff, #ffffff, #ff006e, interpolated as the skia
// package interpolates (encoded Display P3, back to sRGB). Out: premultiplied, encoded sRGB.
struct Uniforms {
    // The window's centre (points), pixels per point, unused.
    center: vec4<f32>,
    // The layer's size (pixels), the window's width and height (points: the gradient's end).
    view: vec4<f32>,
    // The scroll's segment (idx, nextIdx) and clampedT, unused.
    morph: vec4<f32>,
    // cos(time), sin(time), cos(0.2), sin(0.2).
    spin: vec4<f32>,
    // The gradient's colours, encoded Display P3.
    stops: array<vec4<f32>, 3>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) center: vec2<f32>,
    @location(1) radius: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @location(0) xs: vec4<f32>, @location(1) ys: vec4<f32>, @location(2) zs: vec4<f32>) -> Out {
    let i = u32(u.morph.x);
    let j = u32(u.morph.y);
    let t = u.morph.z;
    let x = xs[i] + (xs[j] - xs[i]) * t;
    let y = ys[i] + (ys[j] - ys[i]) * t;
    let z = zs[i] + (zs[j] - zs[i]) * t;
    // rotateX (tilt), then rotateY (time).
    let y1 = y * u.spin.z - z * u.spin.w;
    let z1 = y * u.spin.w + z * u.spin.z;
    let x2 = x * u.spin.x + z1 * u.spin.y;
    let z2 = -x * u.spin.y + z1 * u.spin.x;
    let scale = 350.0 / (350.0 + z2);
    let s = vec2<f32>(u.center.x + x2 * scale, u.center.y + y1 * scale) * u.center.z;
    let r = select(0.45, 0.5, scale > 1.1) * u.center.z;
    let corner = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
    let p = s + corner * (r + 1.0);
    var o: Out;
    o.pos = vec4<f32>(p.x / u.view.x * 2.0 - 1.0, 1.0 - p.y / u.view.y * 2.0, 0.0, 1.0);
    o.center = s;
    o.radius = r;
    return o;
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let cover = clamp(in.radius - distance(in.pos.xy, in.center) + 0.5, 0.0, 1.0);
    let pt = in.pos.xy / u.center.z;
    let d = u.view.zw;
    let t = clamp(dot(pt, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    var c = u.stops[2].rgb;
    if (t <= 0.5) {
        c = mix(u.stops[0].rgb, u.stops[1].rgb, t / 0.5);
    } else {
        c = mix(u.stops[1].rgb, u.stops[2].rgb, (t - 0.5) / 0.5);
    }
    return vec4<f32>(p3_to_srgb(c) * cover, cover);
}
