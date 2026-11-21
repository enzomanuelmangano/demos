// Card Shader Reflections' screen: the four cards as Core Animation composites them, one
// analytic draw per visible card (its quad: the card and its shadow's reach, projected), over
// the cleared #111, blended in index order (premultiplied over: the group opacity's equation);
// pixels outside every quad run no shader.
//
// Each card's Animated.View carries `[rotate 18deg, perspective 1200, translateY, rotateY]` (and,
// past RN, the finger's tilt) about its centre; a pixel finds the point of the card's plane its
// inverse projective map gives (painted in index order), and is shaded there:
// - the body is RN's getCardShader, line for line: its environment (two soft lights over the
//   metal's base), conductor Fresnel, specular and rim, the light turned by the scroll's `rotate`,
//   the grain's normal, contrast, vignette and colour shift. Its hash noise is read at the plane's
//   device pixel and fixed to the card, so it does not crawl while the card turns;
// - an EMV chip with engraved contacts, an engraved contactless mark and the laser-engraved title
//   (the atlas's glyph coverage as its mask), and a small hologram foil;
// - its shadow, analytic: an ambient and a contact one, offset by the turn and the tilt;
// - the Animated.View's opacity over the group.
// Each card's colour is Display P3 (RN's surfaces), turned into sRGB before it blends.
struct Uniforms {
    // Per card, three rows: screen points → the card's plane points (inverse projective 3×3).
    inv: array<vec4<f32>, 12>,
    // Per card: visible (1), the Animated.View's opacity, unused, the title's alpha.
    look: array<vec4<f32>, 4>,
    // Per card: its overlay slot's left edge in the atlas (device pixels); the shadow's extra
    // offset (points, in the card's plane); the body shader's `rotate` (radians).
    slot: array<vec4<f32>, 4>,
    // Per card, its frame in the room (x right, y down, z toward the eye: the phone's turn ·
    // Rz(18°) · Ry(the scroll's turn) · Rx(the finger's tilt)), three rows: the card's x axis
    // and its cardType (0 Silver, 1 Gold, 2 Platinum, 3 Metal); its y axis; its normal.
    frame: array<vec4<f32>, 12>,
    // Per card, its quad on screen (points): top-left, top-right; bottom-right, bottom-left.
    quad: array<vec4<f32>, 8>,
    // The card: width, height, radius (points); the chip / title split (points).
    card: vec4<f32>,
    // The noise tile's size (texels: 256, 256); the atlas (width, height).
    tex: vec4<f32>,
    // CARD_WIDTH (the chip's size); unused.
    light: vec4<f32>,
    // The overlay slot's width, height (points); unused.
    overlay: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var tile: texture_2d<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) card: u32,
};

/// Card `k`'s quad (instance k), two triangles.
@vertex
fn vs(@builtin(vertex_index) i: u32, @builtin(instance_index) k: u32) -> Out {
    var corners = array<u32, 6>(0u, 1u, 2u, 0u, 2u, 3u);
    let c = corners[i];
    let pair = u.quad[2u * k + c / 2u];
    let pt = select(pair.xy, pair.zw, (c & 1u) == 1u);
    let ndc = pt * u.canvas.z / u.canvas.xy * 2.0 - 1.0;
    var o: Out;
    o.pos = vec4<f32>(ndc.x, -ndc.y, 0.0, 1.0);
    o.card = k;
    return o;
}

const PI: f32 = 3.14159265359;
/// The perspective (the eye's distance, points).
const EYE: f32 = 1200.0;
const BEVEL: f32 = 1.4;
/// The chip: styles.card padding 30, CARD_WIDTH × 0.15 by × 0.12.
const PAD: f32 = 30.0;
const SQ_N: f32 = 3.26;

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Display P3 (sRGB's transfer curve) to sRGB, clipped to the sRGB gamut.
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(1.2249 * l.r - 0.2247 * l.g, -0.0420 * l.r + 1.0419 * l.g, -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}

// --- shape -----------------------------------------------------------------------------------

/// A continuous-corner rounded rect's (near) signed distance: centre-relative `p`, half size
/// `b`, corner radius `r`. Core Animation's continuous corner leaves the straight edge 1.528 r
/// from the corner; a 3.26-norm over that run passes the circle's 45° point. The norm is taken
/// only in the corners.
fn squircle(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let e = min(r * 1.528, min(b.x, b.y));
    let q = abs(p) - b + vec2<f32>(e);
    if (q.x > 0.0 && q.y > 0.0) {
        return pow(pow(q.x, SQ_N) + pow(q.y, SQ_N), 1.0 / SQ_N) - e;
    }
    return max(q.x, q.y) - e;
}

/// The squircle's outward direction at `p` (its gradient, normalised).
fn squircle_dir(p: vec2<f32>, b: vec2<f32>, r: f32) -> vec2<f32> {
    let e = min(r * 1.528, min(b.x, b.y));
    let q = abs(p) - b + vec2<f32>(e);
    var g = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), q.x > q.y);
    if (q.x > 0.0 && q.y > 0.0) {
        g = normalize(pow(q, vec2<f32>(SQ_N - 1.0)));
    }
    return g * sign(p + vec2<f32>(1e-6));
}

/// A circular rounded rect's signed distance (the shadows: their blur hides the corner's kind).
fn rrect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

/// A rounded rect's soft shadow: coverage at distance `d` for a blur `sigma`.
fn soft(d: f32, sigma: f32) -> f32 {
    return 1.0 - smoothstep(-1.6 * sigma, 1.9 * sigma, d);
}

/// An antialiased band of half width `hw` around 0 (distance `d`, `aa` points a pixel).
fn band(d: f32, hw: f32, aa: f32) -> f32 {
    return 1.0 - smoothstep(hw - aa * 0.5, hw + aa * 0.5, abs(d));
}

// --- the card's body: the RN demo's getCardShader, per pixel in the card's own plane --------

struct Metal {
    refl: vec3<f32>,
    edge: vec3<f32>,
    base: vec3<f32>,
    hi1: vec3<f32>,
    hi2: vec3<f32>,
    rough: f32,
    normal: f32,
};

fn metal(t: f32) -> Metal {
    if (t < 0.5) {
        return Metal(vec3<f32>(0.92), vec3<f32>(0.94), vec3<f32>(0.15), vec3<f32>(0.9), vec3<f32>(0.85), 0.32, 0.2 * 1.1);
    }
    if (t < 1.5) {
        return Metal(vec3<f32>(0.92, 0.88, 0.78), vec3<f32>(0.9, 0.87, 0.82), vec3<f32>(0.16, 0.14, 0.11), vec3<f32>(0.92, 0.88, 0.78), vec3<f32>(0.88, 0.85, 0.78), 0.32, 0.13);
    }
    if (t < 2.5) {
        return Metal(vec3<f32>(0.99, 0.98, 0.97), vec3<f32>(1.0, 0.99, 0.98), vec3<f32>(0.25, 0.24, 0.23), vec3<f32>(0.99, 0.98, 0.97), vec3<f32>(0.97, 0.96, 0.95), 0.3, 0.14 * 1.05);
    }
    return Metal(vec3<f32>(0.96), vec3<f32>(0.98), vec3<f32>(0.18), vec3<f32>(0.95), vec3<f32>(0.92), 0.32, 0.16 * 1.15);
}

fn hash2(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(443.897, 441.423, 437.195));
    p3 = p3 + vec3<f32>(dot(p3, p3.yzx + vec3<f32>(19.19)));
    return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2<f32>(1.0, 0.0));
    let c = hash2(i + vec2<f32>(0.0, 1.0));
    let d = hash2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/// The fine metallic grain at card uv.
fn grain_at(uv: vec2<f32>, t: f32) -> f32 {
    let fine = vnoise(uv * 1600.0) * 0.35;
    let medium = vnoise(uv * 800.0) * 0.3;
    let rough = vnoise(uv * 400.0) * 0.2;
    let a = PI * 0.15;
    let ru = vec2<f32>(uv.x * cos(a) - uv.y * sin(a), uv.x * sin(a) + uv.y * cos(a));
    let directional = vnoise(ru * 1000.0) * 0.4;
    let detail = (fine + medium + rough + directional) * 0.4;
    var k = 1.1;
    if (t < 0.5) {
        k = 1.0;
    } else if (t < 1.5) {
        k = 0.9;
    } else if (t < 2.5) {
        k = 0.95;
    }
    return detail * k;
}

/// Fresnel for a conductor.
fn fresnel_conductor(cos_t: f32, reflectivity: vec3<f32>, edge: vec3<f32>) -> vec3<f32> {
    let r = clamp(reflectivity, vec3<f32>(0.0), vec3<f32>(0.99));
    let rs = sqrt(r);
    let n = mix((1.0 + rs) / (1.0 - rs), (1.0 - r) / (1.0 + r), edge);
    var k2 = ((n + 1.0) * (n + 1.0) * r - (n - 1.0) * (n - 1.0)) / (1.0 - r);
    k2 = max(k2, vec3<f32>(0.0));
    let k = sqrt(k2);
    let c2 = vec3<f32>(cos_t * cos_t);
    let rs_num = n * n + k * k - 2.0 * n * cos_t + c2;
    let rs_den = n * n + k * k + 2.0 * n * cos_t + c2;
    let rp_num = (n * n + k * k) * c2 - 2.0 * n * cos_t + vec3<f32>(1.0);
    let rp_den = (n * n + k * k) * c2 + 2.0 * n * cos_t + vec3<f32>(1.0);
    return clamp(0.5 * (rs_num / rs_den + rp_num / rp_den), vec3<f32>(0.0), vec3<f32>(1.0));
}

/// The environment's colour in direction `r`: two soft lights over the metal's base.
fn env_map(r: vec3<f32>, roughness: f32, t: f32, m: Metal) -> vec3<f32> {
    let uv = vec2<f32>(atan2(r.z, r.x) / (2.0 * PI) + 0.5, acos(clamp(r.y, -1.0, 1.0)) / PI);
    let i1 = pow(max(1.0 - distance(uv, vec2<f32>(0.3, 0.4)) * 1.8, 0.0), 6.0);
    let i2 = pow(max(1.0 - distance(uv, vec2<f32>(0.7, 0.6)) * 1.8, 0.0), 6.0);
    var env = m.base + m.hi1 * i1 * 1.6 + m.hi2 * i2 * 1.6;
    let shift = pow(max(1.0 - r.y, 0.0), 4.0) * 0.8;
    var tint = vec3<f32>(1.0 + shift * 0.04);
    var mix_c = vec3<f32>(0.35);
    if (t < 0.5) {
        tint = vec3<f32>(1.0 + shift * 0.05);
        mix_c = vec3<f32>(0.4, 0.4, 0.45);
    } else if (t < 1.5) {
        tint = vec3<f32>(1.0 + shift * 0.08, 1.0 + shift * 0.06, 1.0 + shift * 0.02);
        mix_c = vec3<f32>(0.45, 0.35, 0.15);
    } else if (t < 2.5) {
        tint = vec3<f32>(1.0 + shift * 0.06, 1.0 + shift * 0.05, 1.0 + shift * 0.04);
        mix_c = vec3<f32>(0.42, 0.41, 0.4);
    }
    env = env * tint;
    return mix(env, mix_c, roughness);
}

/// The body's colour at card plane point `p` (points), Display P3-encoded: the RN demo's shader.
/// The brushing is the demo's hash noise, fixed to the card's device pixels so it does not crawl
/// as the card turns. `rotate` is the card's turn in radians.
fn body(p: vec2<f32>, size: vec2<f32>, rotate: f32, t: f32, s: f32) -> vec3<f32> {
    let m = metal(t);
    let uv = p / size;
    let view = normalize(vec3<f32>(uv * 2.0 - 1.0, 1.0));
    let speed = abs(sin(rotate));
    let roughness = m.rough;

    // The light, turned about y by the card's rotation.
    let c = cos(-rotate);
    let sn = sin(-rotate);
    let base_light = vec3<f32>(-3.0, -0.8, 2.5);
    let light = normalize(vec3<f32>(base_light.x * c - base_light.z * sn, base_light.y, base_light.x * sn + base_light.z * c));

    // The grain's normal, from the noise one point right and down.
    let q = (floor(p * s) + vec2<f32>(0.5)) / s / size;
    let eps = vec2<f32>(1.0) / size;
    let pattern = grain_at(q, t);
    let r = grain_at(q + vec2<f32>(eps.x, 0.0), t);
    let d = grain_at(q + vec2<f32>(0.0, eps.y), t);
    let strength = m.normal * (1.0 + speed * 0.15);
    let normal = normalize(vec3<f32>((r - pattern) * strength * 2.0, (d - pattern) * strength * 2.0, 1.0));

    // Specular, rim and fresnel glow.
    let half_dir = normalize(light + view);
    let n_h = max(dot(normal, half_dir), 0.0);
    let n_v = max(dot(normal, view), 0.0);
    let n_l = max(dot(normal, light), 0.0);
    let dyn_rough = roughness * (0.6 + speed * 0.4);
    let spec_power = (1.0 - dyn_rough) * (156.0 + speed * 100.0) + 16.0;
    let specular_term = pow(n_h, spec_power);
    let rim = pow(1.0 - n_v, 3.0 + speed * 2.0);
    let fres_glow = pow(1.0 - n_v, 2.5 + speed * 1.5);
    let spec_int = 1.6 + speed * 0.8;
    let rim_int = 0.7 + speed * 0.6;
    let specular = m.base * (specular_term * spec_int * pow(n_l, 1.8) + rim * rim_int + fres_glow * 0.8) * (1.0 - dyn_rough * 0.4);

    let fres = fresnel_conductor(max(dot(normal, view), 0.0), m.refl * (1.0 + speed * 0.4), m.edge);
    let reflect_dir = reflect(-view, normal);
    let env = env_map(reflect_dir, roughness * (0.5 + speed * 0.3), t, m);

    var col = mix(m.base, env, fres * (0.8 + speed * 0.3));
    col = col * (0.5 + 0.7 * pow(max(dot(normal, light), 0.0), 1.4)) + specular * 1.2;
    col = col * (1.0 + pattern * (0.35 + speed * 0.45));
    col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(0.85 + speed * 0.2));

    let vc = vec2<f32>(0.5 + sin(rotate) * 0.15, 0.5 + cos(rotate * 0.7) * 0.1);
    let vignette = 1.0 - length((uv - vc) * (1.5 + speed * 0.5));
    col = col * mix(0.85, 1.0, vignette);
    let shift = sin(rotate * 0.5) * 0.1;
    col = col + vec3<f32>(shift, shift * 0.5, -shift * 0.5) * speed * 0.2;
    return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}

/// Thin-film interference: the film's reflectance at 650, 532 and 450 nm for an optical path
/// `path` (nm).
fn film(path: f32) -> vec3<f32> {
    return 0.5 + 0.5 * cos(2.0 * PI * path / vec3<f32>(650.0, 532.0, 450.0));
}

/// The atlas's glyph coverage at plane point `l` of card `k` (0 outside its slot).
fn glyph(l: vec2<f32>, k: u32, s: f32) -> f32 {
    if (any(l < vec2<f32>(0.0)) || any(l > u.overlay.xy)) {
        return 0.0;
    }
    let auv = (vec2<f32>(u.slot[k].x, 0.0) + l * s) / u.tex.zw;
    return textureSampleLevel(atlas, smp, auv, 0.0).a;
}

/// Card `k`'s face at plane point `p` (points, origin at its top-left), `aa` plane points a
/// screen pixel; Display P3-encoded.
fn face(p: vec2<f32>, k: u32, aa: f32, s: f32) -> vec3<f32> {
    let size = u.card.xy;
    let t = u.frame[3u * k].w;

    // The frame, the point, the eye: in the room (the hologram's colours follow them).
    let tx = u.frame[3u * k].xyz;
    let by = u.frame[3u * k + 1u].xyz;
    let local = p - size * 0.5;
    let pos = tx * local.x + by * local.y;
    let v = normalize(vec3<f32>(0.0, 0.0, EYE) - pos);

    // The body: the RN shader, turned by the scroll (and a little by the phone).
    var col = body(p, size, u.slot[k].w, t, s);

    // The tile at the plane's device pixel: b the grain.
    let texel = vec2<i32>(floor(p * s)) & vec2<i32>(255);
    let nz = textureLoad(tile, texel, 0);

    // The chip: polished, gold (palladium on the light cards), its contacts engraved.
    let cw = u.light.x;
    let chip_o = vec2<f32>(PAD, PAD);
    let chip_s = vec2<f32>(cw * 0.15, cw * 0.12);
    let chip_l = p - chip_o;
    var in_chip = 0.0;
    var groove = 0.0;
    if (all(chip_l > vec2<f32>(-1.0)) && all(chip_l < chip_s + vec2<f32>(1.0))) {
        let chip_d = squircle(chip_l - chip_s * 0.5, chip_s * 0.5, 5.0);
        in_chip = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, chip_d);
        let cu = chip_l / chip_s;
        let gw = 0.32;
        var g = band(chip_l.x - chip_s.x * 0.34, gw, aa) + band(chip_l.x - chip_s.x * 0.66, gw, aa);
        let side = step(cu.x, 0.34) + step(0.66, cu.x);
        g += side * (band(chip_l.y - chip_s.y / 3.0, gw, aa) + band(chip_l.y - chip_s.y * 2.0 / 3.0, gw, aa));
        let island = squircle(chip_l - chip_s * 0.5, vec2<f32>(chip_s.x * 0.16, chip_s.y * 0.30), 3.0);
        g += band(island, gw, aa);
        groove = clamp(g, 0.0, 1.0);
    }
    var chip_f0 = vec3<f32>(0.98, 0.76, 0.40);
    if (t < 0.5 || (t > 1.5 && t < 2.5)) {
        chip_f0 = vec3<f32>(0.70, 0.69, 0.67);
    }
    let lum = dot(col, vec3<f32>(0.3333));
    col = mix(col, chip_f0 * clamp(0.45 + lum * 1.2, 0.0, 1.0), in_chip);
    col = mix(col, col * 0.28 + vec3<f32>(0.004), groove * in_chip);

    // The contactless mark beside the chip: four arcs, laser-engraved.
    let cl = p - vec2<f32>(chip_o.x + chip_s.x + 8.0, chip_o.y + chip_s.y * 0.5);
    if (cl.x > -1.0 && cl.x < 15.0 && abs(cl.y) < 11.0) {
        let ang = atan2(cl.y, cl.x);
        let rad = length(cl);
        var arcs = 0.0;
        for (var i = 0; i < 4; i = i + 1) {
            let ri = 3.4 + 3.4 * f32(i);
            let ea = aa / ri;
            arcs = max(arcs, band(rad - ri, 0.62, aa) * (1.0 - smoothstep(0.62 - ea, 0.62 + ea, abs(ang))));
        }
        var etch = col * 0.55;
        if (t > 2.5) {
            etch = vec3<f32>(0.11, 0.11, 0.115) + col * 0.3;
        }
        col = mix(col, etch, arcs);
    }

    // The hologram: a diffraction foil of concentric rings; its colours follow the half vector,
    // so they run as the card turns and the phone tilts.
    let holo_s = vec2<f32>(34.0, 24.0);
    let holo_l = p - vec2<f32>(size.x - PAD - holo_s.x * 0.5, size.y - PAD - holo_s.y * 0.5 + 4.0);
    if (all(abs(holo_l) < holo_s * 0.5 + vec2<f32>(1.0))) {
        let holo_d = squircle(holo_l, holo_s * 0.5, 6.0);
        let in_holo = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, holo_d);
        let key = vec3<f32>(-200.0, -320.0, 900.0);
        let h = normalize(normalize(key - pos) + v);
        let radial = normalize(holo_l + vec2<f32>(1e-4));
        let gdir = tx * radial.x + by * radial.y;
        let ring = length(holo_l);
        let path = 900.0 * dot(h, gdir) + ring * 22.0 + 380.0;
        var holo = film(path);
        holo = mix(vec3<f32>(dot(holo, vec3<f32>(0.333))), holo, 0.45);
        let sweep = dot(h, tx) * 7.0 + holo_l.x / holo_s.x;
        let band_w = exp(-sweep * sweep * 1.5);
        let crest = 0.5 + 0.5 * cos(ring * 2.2);
        let satin = col * 1.08 + vec3<f32>(0.02);
        var hc = mix(satin, satin * (0.8 + 0.4 * holo), 0.5 * band_w) * (0.96 + 0.06 * crest);
        hc = hc * (1.0 - 0.25 * smoothstep(-0.8, 0.0, holo_d));
        col = mix(col, hc, in_holo);
    }

    col = col * (1.0 + (nz.b - 0.5) * 0.006);
    return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.pos.xy / s;
    let k = in.card;
    let size = u.card.xy;
    let half = size * 0.5;
    let look = u.look[k];
    let h = vec3<f32>(p, 1.0);
    let q = vec3<f32>(dot(u.inv[3u * k].xyz, h), dot(u.inv[3u * k + 1u].xyz, h), dot(u.inv[3u * k + 2u].xyz, h));
    let l = q.xy / q.z;
    // Plane points a screen pixel (taken before any branch on the pixel).
    let dl = fwidth(l);
    let aa = max(max(dl.x, dl.y), 1e-4);
    if (q.z <= 0.0) {
        return vec4<f32>(0.0);
    }
    let local = l - half;
    // The clip, antialiased in screen space.
    let d = squircle(local, half, u.card.z);
    let cover = clamp(0.5 - d / aa, 0.0, 1.0);
    var content = vec3<f32>(0.0);
    if (cover > 0.0) {
        content = face(l, k, aa, s);
        // The engraved title (below the chip's band).
        if (look.w > 0.0 && l.y >= u.card.w) {
            let a = glyph(l, k, s);
            if (a > 0.0) {
                let o = vec2<f32>(0.42, 0.42);
                let near = a * (1.0 - glyph(l - o, k, s));
                let far = a * (1.0 - glyph(l + o, k, s));
                let lum = dot(content, vec3<f32>(0.2126, 0.7152, 0.0722));
                var etched = content * 0.58;
                if (u.frame[3u * k].w > 2.5) {
                    etched = vec3<f32>(0.30, 0.30, 0.31) + content * 0.25;
                }
                etched = etched * (1.0 - 0.45 * near) + vec3<f32>(0.22) * far * (0.4 + lum);
                content = mix(content, etched, a);
            }
        }
    }
    // The shadow: ambient and contact, offset with the card's turn and tilt; black.
    var shade = 0.0;
    if (cover < 1.0) {
        let off = vec2<f32>(3.0, 12.0) + u.slot[k].yz;
        let ambient = soft(rrect(local - off, half - vec2<f32>(4.0), u.card.z), 18.0);
        let contact = soft(rrect(local - vec2<f32>(0.0, 2.5) - off * 0.15, half - vec2<f32>(1.0), u.card.z), 3.0);
        shade = (1.0 - (1.0 - 0.62 * ambient) * (1.0 - 0.38 * contact)) * (1.0 - cover);
    }
    // The group: the face over its shadow (premultiplied), then the Animated.View's opacity.
    let group_a = shade + cover * (1.0 - shade);
    let a = look.y * group_a;
    if (a <= 0.0) {
        return vec4<f32>(0.0);
    }
    // Unpremultiplied (the shadow is black), dithered one level, into the target's encoding.
    let dither = fract(sin(dot(in.pos.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5;
    var rgb = p3_to_srgb(content * cover * (1.0 - shade) / group_a + vec3<f32>(dither / 255.0));
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb * a, a);
}
