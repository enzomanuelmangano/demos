// The checkmate wave (onboarding/wave-shader.ts, WAVE_PYRAMID_SKSL): a glass
// shell sweeps out from the mated king over a snapshot of the screen, and a
// soft drop of frosted haze follows it until the whole screen has sunk into
// the page's own ground. The snapshot is the canvas's children; the frost
// reads the blur pyramid (blur.wgsl). Skia ran this on the canvas's encoded
// sRGB values, so the maths here does too, and encodes only at the end.
struct Wave {
    // canvas size in points (xy), pixels per point (z), 1 when the target encodes sRGB (w)
    res: vec4<f32>,
    // wave origin in points (xy), progress 0..1 (z), max radius in points (w)
    origin: vec4<f32>,
    // band, amplitude, glow strength, wobble
    p1: vec4<f32>,
    // max blur (points), breath 0..1, tint, the overlay's opacity
    p2: vec4<f32>,
    // the pyramid's two radii in points (xy); the probe's uv (zw)
    blur: vec4<f32>,
    accent_dark: vec4<f32>,
    accent_light: vec4<f32>,
    gold_dark: vec4<f32>,
    gold_light: vec4<f32>,
    base_dark: vec4<f32>,
    base_light: vec4<f32>,
}

@group(0) @binding(0) var<uniform> u: Wave;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var blur_a: texture_2d<f32>;
@group(0) @binding(3) var blur_b: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn eotf(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((max(c, vec3<f32>(0.0)) + 0.055) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

// `image.eval(p)`, p in points.
fn at(t: texture_2d<f32>, p: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(t, smp, clamp(p / u.res.xy, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).rgb;
}

// The frost from the pyramid: sharp, then the first level, then the second,
// by the radius the wake wants (WAVE_PYRAMID_SKSL blurSample).
fn blur_sample(p: vec2<f32>, r: f32) -> vec3<f32> {
    if (r <= 0.0) {
        return at(image, p);
    }
    if (r <= u.blur.x) {
        return mix(at(image, p), at(blur_a, p), r / u.blur.x);
    }
    let t = clamp((r - u.blur.x) / (u.blur.y - u.blur.x), 0.0, 1.0);
    return mix(at(blur_a, p), at(blur_b, p), t);
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let position = frag.xy / u.res.z;
    let res = u.res.xy;
    let progress = u.origin.z;
    let max_radius = u.origin.w;
    let band = u.p1.x;
    let amplitude = u.p1.y;
    let glow_strength = u.p1.z;
    let wobble = u.p1.w;
    let max_blur = u.p2.x;
    let breath = u.p2.y;
    let tint = u.p2.z;

    // The scheme, read off the page the snapshot shows (its top-left corner).
    let probe = textureSampleLevel(image, smp, u.blur.zw, 0.0).rgb;
    let light = dot(probe, vec3<f32>(0.2126, 0.7152, 0.0722)) > 0.5;
    let accent = select(u.accent_dark.rgb, u.accent_light.rgb, light);
    let gold = select(u.gold_dark.rgb, u.gold_light.rgb, light);
    let base = select(u.base_dark.rgb, u.base_light.rgb, light);

    let to_origin = position - u.origin.xy;
    let dist = length(to_origin);
    let dir = select(vec2<f32>(0.0), to_origin / dist, dist > 0.0001);
    let ang = atan2(to_origin.y, to_origin.x);
    let wob = 1.0 + wobble * (sin(ang * 3.0) * 0.6 + sin(ang * 2.0 + 1.7) * 0.4);

    // The shell starts thin and thickens as it travels.
    let f_t = clamp(progress / 0.68, 0.0, 1.0);
    let w = band * (0.45 + 0.55 * ss(0.0, 0.18, f_t));
    // Ease-out, unhurried, launched rather than held.
    var fe = 1.0 - pow(1.0 - f_t, 1.6);
    fe = fe * (0.65 + 0.35 * ss(0.0, 0.09, f_t));
    let released = ss(0.0, 0.035, fe);
    let front = max_radius * fe * wob;
    let x = dist - front;
    let lens = exp(-(x * x) / (2.0 * w * w));
    let launch = ss(w * 0.15, w * 1.2, front);
    let shell = lens * released * launch;

    // The dome's slope magnifies the board through the glass.
    let grad = -(x / (w * w)) * lens;
    let bend = grad * w * amplitude * released * launch;
    let off = dir * bend;

    // One soft radial drop of haze and frost, growing from the king.
    let drop_r = max_radius * ss(0.26, 0.82, progress) * 1.35;
    let passed = ss(drop_r, drop_r - res.x * 0.9, dist);
    let blur_r = passed * (max_blur + 2.5 * breath);
    let sp = position + off;

    let grey_front = front - dist - w * 2.4;
    let grey_edge = exp(-(grey_front * grey_front) / (2.0 * (w * 3.0) * (w * 3.0))) * launch;
    let wave_fade = 1.0 - ss(0.62, 0.80, progress);

    // No chromatic split (u_chroma 0 in the app: it cast the crest purple).
    var col = blur_sample(sp, blur_r);

    // The glass dome's light, gathered, then screened on once.
    let n = normalize(vec3<f32>(-dir * (grad * w * 0.9), 1.0));
    let l3 = normalize(vec3<f32>(-0.5, -0.78, 0.6));
    let h = normalize(l3 + vec3<f32>(0.0, 0.0, 1.0));
    let diff = dot(n, l3);
    let spec = pow(max(dot(n, h), 0.0), 60.0);
    let warm_white = vec3<f32>(1.0, 0.97, 0.92);
    var lightc = vec3<f32>(0.0);
    let lit = shell;
    lightc = lightc + warm_white * (clamp(diff, 0.0, 1.0) * lit * 0.20);
    lightc = lightc + warm_white * (spec * lit * 1.2);
    let rim = exp(-(x * x) / (2.0 * (w * 0.45) * (w * 0.45))) * released;
    lightc = lightc + mix(warm_white, gold, 0.5) * (rim * 0.11);
    col = col * (1.0 - clamp(-diff, 0.0, 1.0) * shell * 0.4);

    // Iridescence on the brand: between the accent sand and the board's gold.
    let shimmer = 0.5 + 0.5 * sin(ang * 2.0 + dist * 0.008 + progress * 2.5);
    let iris = mix(accent, gold, shimmer) * 0.5;
    lightc = lightc + iris * (lit * glow_strength * wave_fade);
    lightc = lightc + iris * (grey_edge * glow_strength * 0.4 * wave_fade);
    lightc = lightc + warm_white * (grey_edge * 0.06 * wave_fade);
    col = 1.0 - (1.0 - col) * (1.0 - clamp(lightc, vec3<f32>(0.0), vec3<f32>(1.0)));

    // The settled backdrop: the page's ground, a faint lift toward the king.
    let md = max(res.x, res.y);
    let kd = dist / md;
    let glow = exp(-kd * kd * 6.5) * (0.85 + 0.15 * breath);
    let backdrop = mix(base, accent, clamp(glow * 0.06, 0.0, 1.0));
    col = mix(col, backdrop, passed * tint);

    // A soft diagonal sheen: the haze reads as a pane of glass.
    let diag = (position.x * 0.5 + position.y) / (res.y * 1.3);
    // pow() of a negative base is undefined in WGSL (NaN on Metal): squared.
    let sd = (diag - 0.32) * 2.4;
    let sheen = exp(-(sd * sd));
    col = col + accent * (sheen * 0.04 * passed);

    // Dither, half a level either way.
    col = col + (hash(floor(position)) - 0.5) * (1.0 / 255.0);

    // The vignette, in the settled wake only.
    let uvc = position / res - 0.5;
    let vig = 1.0 - ss(0.5, 1.05, length(uvc) * 1.25);
    col = col * mix(1.0, 0.80 + 0.20 * vig, passed);

    // The lower screen settles onto the page's ground, a surface for type.
    let vy = position.y / res.y;
    let bottom_settle = ss(0.26, 0.62, vy) * 0.72;
    col = mix(col, base, bottom_settle * passed);

    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
    if (u.res.w > 0.5) {
        col = eotf(col);
    }
    let a = u.p2.w;
    return vec4<f32>(col * a, a);
}
