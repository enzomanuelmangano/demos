// Fractal Glass: a pane of reeded (fluted) glass over the demo's circle, one full-screen pass,
// analytic. RN draws a blurred circle under a 4 × 4 grid of gradient cells; this is the real
// material instead (the reeded architectural glass of Figma's / Spline's "fractal glass"):
// - vertical flutes, each a cylindrical lens: the content behind is refracted sideways by the
//   lens's slope, so each flute shows its own compressed, mirrored slice of what is behind it;
// - dispersion: red, green and blue refract by slightly different amounts, so colour fringes
//   bloom where the slope is steep, at the flute edges;
// - per flute, a specular line where the lens faces the light, and a shadow in the groove;
// - frosting: a grain jitter of the sample point plus a share of the blurred circle, and the
//   blob's light caught along the flute ridges;
// - a second, softer light drifting slowly behind the pane, and the key light swaying, so the
//   glass is alive untouched; each flute's highlight wavers a little down its length, and its
//   colour fringes grow toward its edges, unevenly from flute to flute;
// - a crisp bevelled pane edge with a thin specular rim.
//
// One pass, no offscreen target, and no per-frame work in the shader that a uniform can hold:
// - the circle is evaluated here, analytically (the coverage Skia's AnalyticRRect writes), not
//   read from a canvas-sized surface;
// - the circle under σ 25 pt is a function of the distance to its centre alone (the disc
//   convolved with the Gaussian), read from `profile`, 256 values the Rust surface fills once;
// - everything that depends only on the clock (the drifting light, the key light) arrives
//   evaluated in the uniforms.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // The glass rect in points: x, y, width, height.
    glass: vec4<f32>,
    // The background's colour (straight sRGB, opaque) in rgb; w: its luminance (0 dark, 1 light).
    background: vec4<f32>,
    // The circle: centre in points, radius in points.
    circle: vec4<f32>,
    // The circle's colour (straight sRGB); w: a flute's width in points.
    colour: vec4<f32>,
    // The second light's centre in points; z: the highlight's wander phase (radians).
    ambient: vec4<f32>,
    // The key light's unit direction.
    key: vec4<f32>,
    // The unit half vector between the key light and the viewer.
    halfway: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
// The blurred circle's alpha at a distance from its centre: 0 … REACH points, PROFILE_N values.
@group(0) @binding(1) var profile: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

// The distance at which the blurred circle has faded to nothing (radius + 4 σ), points, and
// the number of values of the profile.
const REACH: f32 = 200.0;
const PROFILE_N: f32 = 256.0;
// The pane's corner radius, points.
const CORNER: f32 = 20.0;
// How far a flute's steepest slope moves the sample sideways, points.
const DEPTH: f32 = 9.0;
// Each flute is magnified about its centre by 1 / MAG (and mirrored by the slope term).
const MAG: f32 = 0.62;
// Lens curvature: the profile is a circle's arc, |slope| ≤ K / sqrt(1 − K²).
const K: f32 = 0.94;
// Dispersion: red refracts by (1 − D), blue by (1 + D).
const DISPERSION: f32 = 0.30;
// Frosting: the grain's reach, points, and the share of the blurred circle.
const GRAIN: f32 = 0.7;
const FROST: f32 = 0.5;
const TAU: f32 = 6.2831853;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// Two uniform numbers in [0, 1) for a device pixel (PCG).
fn grain(p: vec2<f32>) -> vec2<f32> {
    var v = vec2<u32>(vec2<i32>(p));
    v = v * 1664525u + 1013904223u;
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2<u32>(16u));
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2<u32>(16u));
    return vec2<f32>(v & vec2<u32>(0xffffu)) / 65536.0;
}

// A number in [0, 1) for a flute's index.
fn flute_hash(i: f32) -> f32 {
    return fract(sin(i * 12.9898 + 4.1414) * 43758.547);
}

// The second light: a broad soft glow drifting on a slow Lissajous around the pane (periods
// 20 s and 15 s), a pastel tint on a light background and a violet bloom on a dark one. p in
// points; its weight 0…1.
fn ambient_at(p: vec2<f32>) -> f32 {
    let d = p - u.ambient.xy;
    let r = 125.0;
    return exp(-dot(d, d) / (2.0 * r * r));
}

fn ambient_colour(light: f32) -> vec3<f32> {
    return mix(vec3<f32>(0.42, 0.30, 1.0), vec3<f32>(1.0, 0.55, 0.62), light);
}

// The background with the second light on it (straight sRGB).
fn backdrop(p: vec2<f32>, light: f32) -> vec3<f32> {
    let bg = u.background.rgb;
    // A faint vertical wash, so even an empty pane has something to bend.
    let wash = (p.y / max(u.canvas.y / u.canvas.z, 1.0) - 0.5) * mix(0.05, -0.035, light);
    return bg + (ambient_colour(light) - bg) * ambient_at(p) * mix(0.42, 0.46, light) + vec3<f32>(wash);
}

// Signed distance (points) from p to a rounded rect (origin, size, radius).
fn rrect(p: vec2<f32>, o: vec2<f32>, size: vec2<f32>, r: f32) -> f32 {
    let h = size * 0.5;
    let q = abs(p - o - h) - h + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// The outward normal of that rounded rect at p (the nearest side, or the corner's radius).
fn rrect_normal(p: vec2<f32>, o: vec2<f32>, size: vec2<f32>, r: f32) -> vec2<f32> {
    let h = size * 0.5;
    let rel = p - o - h;
    let q = abs(rel) - h + vec2<f32>(r);
    var n: vec2<f32>;
    if (q.x > 0.0 && q.y > 0.0) {
        n = normalize(q);
    } else if (q.x > q.y) {
        n = vec2<f32>(1.0, 0.0);
    } else {
        n = vec2<f32>(0.0, 1.0);
    }
    return n * sign(rel + vec2<f32>(1e-4));
}

// The circle's coverage at device pixel q (the pixel's centre): AnalyticRRect's edge, for a
// circle, one device pixel wide.
fn disc(q: vec2<f32>) -> f32 {
    let s = u.canvas.z;
    let d = max(length(q / s - u.circle.xy), 1e-3);
    let r = u.circle.z;
    return clamp(0.5 - 0.5 * s * (d * d - r * r) / d, 0.0, 1.0);
}

// The blurred circle's alpha at device pixel q, held at the pane's edge (where the blur's
// layer ends).
fn haze(q: vec2<f32>) -> f32 {
    let s = u.canvas.z;
    let g = u.glass * s;
    let c = clamp(q, g.xy + vec2<f32>(0.5), g.xy + g.zw - vec2<f32>(0.5));
    let d = length(c / s - u.circle.xy);
    return textureSampleLevel(profile, smp, vec2<f32>((d * (PROFILE_N - 1.0) / REACH + 0.5) / PROFILE_N, 0.5), 0.0).r;
}

// What lies behind the glass at device pixel q, frosted: the sharp circle mixed with its haze,
// over the background (straight sRGB).
fn behind(q: vec2<f32>, light: f32) -> vec3<f32> {
    let a = mix(disc(floor(q) + vec2<f32>(0.5)), haze(q), FROST);
    return u.colour.rgb * a + backdrop(q / u.canvas.z, light) * (1.0 - a);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let px = pos.xy;
    let p = px / s;
    let g = u.glass;
    let light = u.background.w;

    let d = rrect(p, g.xy, g.zw, CORNER);
    let cover = clamp(0.5 - d * s, 0.0, 1.0);
    // Outside: the scene itself, the sharp circle over the background, under the pane's soft
    // shadow (seen on a light background). A pixel wholly inside the pane never shows it.
    var outside = vec3<f32>(0.0);
    if (cover < 1.0) {
        let a = disc(px);
        outside = u.colour.rgb * a + backdrop(p, light) * (1.0 - a);
        // The shadow reaches 18 pt past the pane's edge.
        if (d < 30.0) {
            let drop = rrect(p - vec2<f32>(0.0, 12.0), g.xy, g.zw, CORNER);
            outside *= 1.0 - 0.07 * light * (1.0 - smoothstep(-6.0, 18.0, drop));
        }
    }
    if (cover <= 0.0) {
        var c = outside;
        if (u.canvas.w > 0.5) { c = to_linear(c); }
        return vec4<f32>(c, 1.0);
    }

    // The flute this pixel looks through, and where across it (−1 left edge … 1 right edge).
    let fw = u.colour.w;
    let f = (p.x - g.x) / fw;
    let centre = g.x + (floor(f) + 0.5) * fw;
    let x = clamp(fract(f) * 2.0 - 1.0, -1.0, 1.0);
    let x2 = x * x;
    // The lens: an arc of a circle, height sqrt(1 − (Kx)²); its slope steepens at the edges.
    let kx = K * x;
    let rise = sqrt(1.0 - kx * kx);
    let slope = kx / rise;

    // Each flute is its own piece of glass: a number that varies its fringes and highlight.
    let id = flute_hash(floor(f));

    // Refraction: magnified about the flute's centre, pushed against the slope (a mirrored
    // slice), per channel; a touch of vertical magnification about the pane's middle.
    let mid = g.y + g.w * 0.5;
    let y = mid + (p.y - mid) * 0.985;
    let jitter = (grain(px) - vec2<f32>(0.5)) * 2.0 * GRAIN;
    let base = centre + (p.x - centre) * MAG;
    let shift = -DEPTH * slope;
    // Dispersion grows toward the flute's edges, a little unevenly from flute to flute.
    let disp = DISPERSION * (0.35 + 1.25 * x2) * (0.7 + 0.6 * id);
    let r = behind((vec2<f32>(base + shift * (1.0 - disp), y) + jitter) * s, light).r;
    let gg = behind((vec2<f32>(base + shift, y) + jitter.yx) * s, light).g;
    let b = behind((vec2<f32>(base + shift * (1.0 + disp), y) - jitter) * s, light).b;
    var c = vec3<f32>(r, gg, b);

    // The key light: from the upper left, swaying slowly (12 s), so the left shoulder of each
    // flute catches it and the highlight drifts across the flutes.
    let sl = slope * 0.55;
    let normal = vec3<f32>(sl, 0.0, 1.0) * inverseSqrt(1.0 + sl * sl);
    let l = u.key.xyz;
    let diffuse = dot(normal, l) - l.z;
    let h = u.halfway.xyz;
    // The highlight wavers down the flute (no glass is drawn perfectly), each flute its own way.
    let waver = 0.72 + 0.28 * sin(p.y / 23.0 + id * TAU + u.ambient.z) * sin(p.y / 61.0 + id * 3.1);
    let spec = pow(max(dot(normal, h), 0.0), 90.0) * waver;
    // The groove where two flutes meet: in shadow, darkest on the side facing away.
    let groove = smoothstep(0.82, 1.0, abs(x)) * select(0.55, 1.0, x > 0.0);
    // The blob's light, scattered in the glass: strongest where the glass is steepest.
    let glow_a = haze(px);
    let glow = vec4<f32>(u.colour.rgb * glow_a, glow_a);
    let ridge = x2 * x2;
    // The second light, caught on the ridges too.
    let soft = ambient_at(p) * ridge;

    // Frosting: the glass is a little milky (lighter on dark, a breath of grey on light).
    c = mix(c, vec3<f32>(mix(0.10, 0.97, light)), 0.06);
    c = c * (1.0 + diffuse * 0.28);
    c = c * (1.0 - groove * mix(0.35, 0.10, light));
    // Added on a dark background; on a light one it tints instead (it would only clip).
    let w = 0.12 + ridge * 0.5;
    let tint = glow.rgb / max(glow.a, 1e-3);
    c = mix(c + glow.rgb * w, mix(c, c * tint, glow.a * w), light);
    c = mix(c + ambient_colour(light) * soft * 0.35, mix(c, c * ambient_colour(light), soft * 0.25), light);
    c = c + vec3<f32>(spec) * mix(0.30, 0.38, light) * (1.0 - 0.5 * glow.a * light);

    // The pane's edge, crisp: a 4 pt bevel shaded by its facing (lit toward the key light),
    // and a hairline specular rim on its outer lip.
    let inner = -d;
    let en = rrect_normal(p, g.xy, g.zw, CORNER);
    let facing = dot(en, normalize(vec2<f32>(l.x, l.y)));
    let bevel = 1.0 - smoothstep(0.0, 4.0, inner);
    c = c + vec3<f32>(bevel * max(facing, 0.0) * mix(0.22, 0.30, light));
    c = c * (1.0 - bevel * max(-facing, 0.0) * mix(0.30, 0.14, light));
    let px_pt = 1.0 / s;
    let rim = 1.0 - smoothstep(0.0, 0.9 + px_pt, inner);
    // White where it faces the light; elsewhere white on dark, a grey hairline on light.
    let lip = mix(vec3<f32>(1.0), vec3<f32>(0.62), light * (1.0 - max(facing, 0.0)));
    c = mix(c, lip, rim * (0.30 + 0.55 * max(facing, 0.0) + 0.25 * light));
    c = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    // A breath of grain on the surface itself (also keeps gradients from banding).
    c = c + (grain(px.yx).x - 0.5) * 0.012;

    var out = mix(outside, c, cover);
    if (u.canvas.w > 0.5) { out = to_linear(clamp(out, vec3<f32>(0.0), vec3<f32>(1.0))); }
    return vec4<f32>(out, 1.0);
}
