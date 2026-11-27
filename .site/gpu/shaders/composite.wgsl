// The scene pass under the radial glow, then three's output transform: the
// glow is composited behind the scene in linear light, premultiplied, and the
// result is sRGB-encoded as the RN canvas reached the screen, so the
// compositor lays it over the page as Skia laid that canvas.
struct Glow {
    // canvas size in points (xy), glow origin in points (zw)
    rect: vec4<f32>,
    // glow size in points, breath phase, edge fade, halo gain
    params: vec4<f32>,
    // the halo's colour (rgb); 1 to fade the glow out at the canvas's floor (w)
    halo: vec4<f32>,
    core: vec4<f32>,
    // the contact pool's colour (rgb); 1 to draw WelcomeTacticsAura (w): its ovals under
    // Skia's blur mask, laid in order on their own canvas, two layers at phase 0 and 1, the
    // second's opacity the breath, and the scene's canvas over it (the offer's mascot)
    contact: vec4<f32>,
    // contact gain, 1 when the target encodes sRGB itself, pixel width, pixel height
    extra: vec4<f32>,
    // where the scene's box starts in the target, pixels (xy): a stage drawn inside a
    // bigger canvas, through a viewport; how far the whole is faded out (z: 0 not at all, 1
    // gone; the intro's entrance and Reduce Motion's dip); 1 when there is no scene (w): the
    // aura alone (the daily goal's, aura.rs)
    origin: vec4<f32>,
    // GhostStage (src/components/daily-goal/ghost-stage.tsx), over the aura: the accent (rgb,
    // linear) and the disc's radius in points (w, 0 for none), centred on the canvas
    stage: vec4<f32>,
}

@group(0) @binding(0) var<uniform> g: Glow;
@group(0) @binding(1) var scene: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

const ARTBOARD = 300.0;
const FALLOFF = 1.15;

fn oval(q: vec2<f32>, x: f32, y: f32, w: f32, h: f32, blur: f32, alpha: f32) -> f32 {
    let centre = vec2<f32>((x + w / 2.0) / ARTBOARD, (y + h / 2.0) / ARTBOARD);
    let radii = vec2<f32>((w / 2.0 + blur) / ARTBOARD, (h / 2.0 + blur) / ARTBOARD);
    let dd = (q - centre) / radii;
    return alpha * exp(dot(dd, dd) * -FALLOFF);
}

// ————— WelcomeTacticsAura (src/components/welcome-tactics-aura.tsx) —————
// Each oval is a solid ellipse under a BlurMask (`blur` is the Gaussian's sigma, in artboard
// units as the group's scale applies to it), its colour at the oval's opacity, laid src-over in
// sRGB-encoded values on its own canvas, as Skia draws: halo, core, contact. The blurred
// ellipse is the Gaussian over the ellipse's columns: at each column u the column's coverage is
// Phi((y + h)/s) - Phi((y - h)/s), h = b * sqrt(1 - u^2 / a^2); integrated over u within four
// sigma of the point, in u = a * sin(t) so the ends' square root is smooth, by 12-point
// Gauss-Legendre.

const GL_X = array<f32, 6>(0.1252334085, 0.3678314990, 0.5873179543, 0.7699026742, 0.9041172564, 0.9815606342);
const GL_W = array<f32, 6>(0.2491470458, 0.2334925365, 0.2031674267, 0.1600783285, 0.1069393260, 0.0471753364);

// Abramowitz and Stegun 7.1.26 (error under 1.5e-7).
fn erf(x: f32) -> f32 {
    let t = 1.0 / (1.0 + 0.3275911 * abs(x));
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
    return select(-y, y, x >= 0.0);
}

// Coverage of the ellipse (centre c, radii r, artboard units) blurred by sigma s, at p.
fn blurred_ellipse(p: vec2<f32>, c: vec2<f32>, r: vec2<f32>, s: f32) -> f32 {
    let d = p - c;
    if (abs(d.x) > r.x + 4.0 * s || abs(d.y) > r.y + 4.0 * s) {
        return 0.0;
    }
    let lo = asin(clamp((d.x - 4.0 * s) / r.x, -1.0, 1.0));
    let hi = asin(clamp((d.x + 4.0 * s) / r.x, -1.0, 1.0));
    let mid = 0.5 * (hi + lo);
    let half = 0.5 * (hi - lo);
    let k = 1.0 / (s * 1.41421356);
    var acc = 0.0;
    for (var i = 0; i < 12; i = i + 1) {
        let j = i % 6;
        let t = mid + half * select(-GL_X[j], GL_X[j], i < 6);
        let u = r.x * sin(t);
        let h = r.y * cos(t);
        let g = exp(-(d.x - u) * (d.x - u) / (2.0 * s * s));
        let col = 0.5 * (erf((d.y + h) * k) - erf((d.y - h) * k));
        acc = acc + GL_W[j] * g * col * r.x * cos(t);
    }
    return acc * half / (s * 2.50662827);
}

fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

// One Skia oval: `<Oval x y width height color opacity><BlurMask blur/></Oval>`, premultiplied.
fn skia_oval(p: vec2<f32>, x: f32, y: f32, w: f32, h: f32, blur: f32, opacity: f32, col: vec3<f32>) -> vec4<f32> {
    let a = opacity * blurred_ellipse(p, vec2<f32>(x + w / 2.0, y + h / 2.0), vec2<f32>(w / 2.0, h / 2.0), blur);
    return vec4<f32>(col * a, a);
}

// AuraLayer at `phase` (0 or 1), encoded and premultiplied, at artboard point p.
fn aura_layer(p: vec2<f32>, phase: f32, halo: vec3<f32>, core: vec3<f32>, contact: vec3<f32>) -> vec4<f32> {
    var c = skia_oval(p, 43.0 + phase * 6.0, 49.0, 212.0, 174.0, 34.0, (0.08 + phase * 0.045) * g.params.w, halo);
    c = over(skia_oval(p, 51.0 - phase * 4.0, 53.0, 136.0, 126.0, 24.0, 0.045 + (1.0 - phase) * 0.035, core), c);
    c = over(skia_oval(p, 72.0, 211.0, 194.0, 34.0, 15.0, (0.085 + phase * 0.035) * g.extra.x, contact), c);
    return c;
}

// The three ovals at breath `phase`, premultiplied.
fn layer(q: vec2<f32>, phase: f32) -> vec4<f32> {
    let a1 = oval(q, 43.0 + phase * 6.0, 49.0, 212.0, 174.0, 34.0, 0.08 + phase * 0.045);
    let a2 = oval(q, 51.0 - phase * 4.0, 53.0, 136.0, 126.0, 24.0, 0.045 + (1.0 - phase) * 0.035);
    let a3 = oval(q, 72.0, 211.0, 194.0, 34.0, 15.0, 0.085 + phase * 0.035);
    let halo_a = a1 * g.params.w;
    let pool_a = a3 * g.extra.x;
    return vec4<f32>(g.halo.rgb * halo_a + g.core.rgb * a2 + g.contact.rgb * pool_a, halo_a + a2 + pool_a);
}

fn oetf(c: vec3<f32>) -> vec3<f32> {
    let lo = c * 12.92;
    let hi = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, c <= vec3<f32>(0.0031308));
}

fn eotf(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((max(c, vec3<f32>(0.0)) + 0.055) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

// GhostStage: a Circle of radius r (the canvas's centre) filled by a RadialGradient centred at
// (r, 0.92 r) of its own square, radius r, the accent at alphas 0x66, 0x2E, 0x00 at 0, 0.55, 1;
// premultiplied, encoded, the disc's edge anti-aliased over one pixel (`ppt` pixels a point).
fn ghost_stage(point: vec2<f32>, ppt: f32) -> vec4<f32> {
    let r = g.stage.w;
    let c = g.rect.xy * 0.5;
    let t = min(length(point - vec2<f32>(c.x, c.y - 0.08 * r)) / r, 1.0);
    let a0 = 102.0 / 255.0;
    let a1 = 46.0 / 255.0;
    var a = select(mix(a1, 0.0, (t - 0.55) / 0.45), mix(a0, a1, t / 0.55), t < 0.55);
    a = a * clamp((r - length(point - c)) * ppt + 0.5, 0.0, 1.0);
    return vec4<f32>(oetf(g.stage.rgb) * a, a);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let at = pos.xy - g.origin.xy;
    let px = vec2<i32>(at);
    var sc = vec4<f32>(0.0);
    if (g.origin.w < 0.5) {
        sc = textureLoad(scene, px, 0);
    }
    let uv = at / g.extra.zw;
    let point = uv * g.rect.xy;
    let q = (point - g.rect.zw) / g.params.x;
    if (g.contact.w > 0.5) {
        // The aura's canvas, then the mascot's (three's output, encoded) over it; the breath is
        // the top layer's view opacity. No dither: Skia draws these without one.
        let p = q * ARTBOARD;
        let halo = oetf(g.halo.rgb);
        let core = oetf(g.core.rgb);
        let contact = oetf(g.contact.rgb);
        let b = g.params.y;
        var aura = vec4<f32>(0.0);
        if (b < 1.0) {
            aura = aura_layer(p, 0.0, halo, core, contact);
        }
        if (b > 0.0) {
            aura = over(aura_layer(p, 1.0, halo, core, contact) * b, aura);
        }
        if (g.stage.w > 0.0) {
            aura = over(ghost_stage(point, g.extra.z / g.rect.x), aura);
        }
        let straight_scene = select(vec3<f32>(0.0), sc.rgb / max(sc.a, 1e-6), sc.a > 0.0);
        let scene_enc = vec4<f32>(oetf(min(straight_scene, vec3<f32>(1.0))) * sc.a, sc.a);
        let out = over(scene_enc, aura);
        let shown_m = 1.0 - g.origin.z;
        if (g.extra.y > 0.5) {
            return vec4<f32>(eotf(out.rgb), out.a) * shown_m;
        }
        return out * shown_m;
    }
    let glow = layer(q, g.params.y);
    var rgb = glow.rgb;
    var a = glow.a;
    let floor_fade = select(1.0, ss(0.0, 0.12, 1.0 - uv.y), g.halo.w > 0.5);
    rgb = rgb * floor_fade;
    a = a * floor_fade;
    let ef = max(g.params.z, 1e-6);
    let edge = ss(0.0, ef, uv.x) * ss(0.0, ef, 1.0 - uv.x);
    rgb = rgb * edge;
    a = a * edge;
    let grain = (fract(sin(dot(point, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5)
        * (2.0 / 255.0) * ss(0.0003, 0.003, a);
    let da = max(a + grain, 0.0);
    rgb = rgb * (da / max(a, 0.0001));
    a = da;
    let behind = 1.0 - sc.a;
    let lin = sc.rgb + rgb * behind;
    let alpha = sc.a + a * behind;
    // Encoded straight, as three's output does (measured against the RN
    // reference: the glow's colour is encoded before its coverage applies),
    // then premultiplied for the compositor.
    let straight = select(vec3<f32>(0.0), lin / max(alpha, 1e-6), alpha > 0.0);
    let encoded = oetf(min(straight, vec3<f32>(1.0))) * alpha;
    let shown = 1.0 - g.origin.z;
    if (g.extra.y > 0.5) {
        return vec4<f32>(eotf(encoded), alpha) * shown;
    }
    return vec4<f32>(encoded, alpha) * shown;
}
