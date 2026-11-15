// Card Shader Reflections: one card's face, a physical metal card lit in a small studio (past
// RN's getCardShader, the owner's ask for premium cards: Apple Card titanium, Revolut Metal).
// One analytic pass per card into its own 8-bit layer at device pixels: `fragCoord` is the pixel's
// centre in the canvas's points (origin at styles.card's top-left, y down); the card itself is
// res − 32 (the Animated.View's padding 16 a side). The output is stored as the layer stores it
// (clamped, 8 bits) in Display P3's encoding, which the compose pass turns into sRGB.
//
// The card's orientation is the one the compose pass draws it with: the carousel's fixed 18°
// roll, the scroll's turn about y (−rotate) and the finger's tilt about x, so the lights stay in
// the room while the card moves under them:
// - brushed metal: Ward's anisotropic highlight from two point lights, stretched across the
//   brushing; the studio's softboxes reflected with an anisotropic blur; per-line normal jitter;
// - a 1.4 pt bevel on the continuous (squircle) outline: the Fresnel rim;
// - foil: a thin-film / diffraction hologram whose colours shift with the half vector;
// - an EMV chip (polished, its contacts engraved), an engraved contactless mark;
// - grain and dither per device pixel.
struct Uniforms {
    // rotate (radians, −π…π), cardType (0 Silver, 1 Gold, 2 Platinum, 3 Metal), points per
    // device pixel (the inverse of the canvas's density scale), the finger's tilt about x
    // (radians; 0 when the surface sends none).
    params: vec4<f32>,
    // resolution: [CARD_WIDTH, CARD_HEIGHT]; the press (0…1); unused.
    res: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    return o;
}

const PI: f32 = 3.14159265359;
/// The carousel's roll (TILT_DEG) and perspective (the eye's distance, points).
const ROLL: f32 = 0.31415926536;
const EYE: f32 = 1200.0;
/// styles.card's radius (continuous here), the bevel's width.
const RADIUS: f32 = 20.0;
const BEVEL: f32 = 1.4;
/// The chip: styles.card padding 30, CARD_WIDTH × 0.15 by × 0.12.
const PAD: f32 = 30.0;

// --- shape -----------------------------------------------------------------------------------

/// A continuous-corner rounded rect's (near) signed distance: centre-relative `p`, half size
/// `b`, corner radius `r`. Core Animation's continuous corner leaves the straight edge 1.528 r
/// from the corner; a 3.26-norm over that run passes the circle's 45° point, which is the shape
/// to the eye.
fn squircle(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let e = min(r * 1.528, min(b.x, b.y));
    let q = abs(p) - b + vec2<f32>(e);
    let m = max(q, vec2<f32>(0.0));
    let n = 3.26;
    let corner = pow(pow(m.x, n) + pow(m.y, n), 1.0 / n);
    return corner + min(max(q.x, q.y), 0.0) - e;
}

// --- noise -----------------------------------------------------------------------------------

fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    let a = hash(i);
    let b = hash(i + vec2<f32>(1.0, 0.0));
    let c = hash(i + vec2<f32>(0.0, 1.0));
    let d = hash(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// --- orientation -----------------------------------------------------------------------------

/// The card's frame on screen (x right, y down, z toward the eye): Rz(roll) · Ry(turn) · Rx(tilt).
fn orient(v: vec3<f32>, turn: f32, tilt: f32) -> vec3<f32> {
    let cx = cos(tilt);
    let sx = sin(tilt);
    let a = vec3<f32>(v.x, v.y * cx - v.z * sx, v.y * sx + v.z * cx);
    let cy = cos(turn);
    let sy = sin(turn);
    let b = vec3<f32>(a.x * cy + a.z * sy, a.y, -a.x * sy + a.z * cy);
    let cz = cos(ROLL);
    let sz = sin(ROLL);
    return vec3<f32>(b.x * cz - b.y * sz, b.x * sz + b.y * cz, b.z);
}

// --- materials -------------------------------------------------------------------------------

struct Material {
    f0: vec3<f32>,
    diffuse: vec3<f32>,
    // Ward's roughness along the brushing (x) and across it (y).
    alpha: vec2<f32>,
    // How strongly the brushing lines move the normal.
    brush: f32,
    // The pearl film over the whole face (Platinum).
    pearl: f32,
};

fn material(t: f32) -> Material {
    // Silver: brushed aluminium.
    if (t < 0.5) {
        return Material(vec3<f32>(0.62, 0.63, 0.65), vec3<f32>(0.07, 0.07, 0.075), vec2<f32>(0.07, 0.34), 1.0, 0.0);
    }
    // Gold: anodised champagne gold.
    if (t < 1.5) {
        return Material(vec3<f32>(0.86, 0.64, 0.36), vec3<f32>(0.07, 0.045, 0.02), vec2<f32>(0.08, 0.30), 0.8, 0.0);
    }
    // Platinum: finely brushed, a pearl film on it.
    if (t < 2.5) {
        return Material(vec3<f32>(0.66, 0.65, 0.64), vec3<f32>(0.09, 0.088, 0.086), vec2<f32>(0.06, 0.18), 0.45, 0.10);
    }
    // Metal: dark titanium, bead-blasted then brushed.
    return Material(vec3<f32>(0.15, 0.15, 0.162), vec3<f32>(0.010, 0.010, 0.012), vec2<f32>(0.09, 0.30), 1.0, 0.0);
}

// --- the studio ------------------------------------------------------------------------------

/// A soft strip in the reflection's plane: `q` the reflected direction projected (x/z, y/z),
/// `c` a point on its axis, `n` its normal, `hw` its half width, `len` its half length. The
/// edges are blurred by the brushing: `t2` / `b2` the brushing's axes in that plane, `sig` the
/// blur along each.
fn strip(q: vec2<f32>, c: vec2<f32>, n: vec2<f32>, hw: f32, len: f32, t2: vec2<f32>, b2: vec2<f32>, sig: vec2<f32>) -> f32 {
    let d = q - c;
    let across = abs(dot(d, n)) - hw;
    let along_dir = vec2<f32>(-n.y, n.x);
    let along = abs(dot(d, along_dir)) - len;
    let w1 = length(vec2<f32>(dot(n, t2) * sig.x, dot(n, b2) * sig.y)) + 0.004;
    let w2 = length(vec2<f32>(dot(along_dir, t2) * sig.x, dot(along_dir, b2) * sig.y)) + 0.05;
    return (1.0 - smoothstep(-w1, w1, across)) * (1.0 - smoothstep(-w2, w2, along));
}

/// The studio seen in direction `r`: a dark room, a bright floor-to-ceiling gradient behind the
/// camera, a long diagonal softbox high left and a broad fill low right.
fn studio(r: vec3<f32>, t2: vec2<f32>, b2: vec2<f32>, sig: vec2<f32>) -> vec3<f32> {
    // Behind the card (grazing reflections): the dark room.
    let z = max(r.z, 0.06);
    let q = r.xy / z;
    let toward = smoothstep(-0.05, 0.35, r.z);
    // Brighter from above (y up the screen is −y).
    let sky = mix(0.035, 0.16, smoothstep(0.9, -0.9, q.y)) * (0.75 + 0.25 * smoothstep(1.2, 0.0, abs(q.x)));
    var c = vec3<f32>(sky) * vec3<f32>(0.98, 0.99, 1.02);
    // The key softbox: a long diagonal strip high left.
    let n1 = normalize(vec2<f32>(0.95, -0.30));
    c += vec3<f32>(1.9, 1.87, 1.80) * strip(q, vec2<f32>(-0.075, -0.10), n1, 0.032, 0.55, t2, b2, sig);
    // The room's other lights, which the sheen sweeps across as the card turns.
    c += vec3<f32>(1.15, 1.14, 1.12) * strip(q, vec2<f32>(0.48, -0.1), n1, 0.05, 0.9, t2, b2, sig);
    c += vec3<f32>(0.95, 0.96, 1.0) * strip(q, vec2<f32>(-0.52, -0.1), n1, 0.045, 0.9, t2, b2, sig);
    c += vec3<f32>(1.1) * strip(q, vec2<f32>(1.12, 0.2), n1, 0.10, 1.4, t2, b2, sig * 1.5);
    c += vec3<f32>(0.95) * strip(q, vec2<f32>(-1.15, -0.3), n1, 0.10, 1.4, t2, b2, sig * 1.5);
    c += vec3<f32>(0.7) * strip(q, vec2<f32>(2.3, 0.6), n1, 0.35, 2.5, t2, b2, sig * 3.0);
    c += vec3<f32>(0.6) * strip(q, vec2<f32>(-2.4, -0.6), n1, 0.35, 2.5, t2, b2, sig * 3.0);
    // The fill: broad, low right, cool.
    let n2 = normalize(vec2<f32>(0.85, -0.52));
    c += vec3<f32>(0.42, 0.46, 0.52) * strip(q, vec2<f32>(0.55, 0.45), n2, 0.22, 0.6, t2, b2, sig * 2.0);
    return mix(vec3<f32>(0.03), c, toward);
}

/// Ward's anisotropic highlight from a point light at `lp` (screen points, from the card's
/// centre), times N·L.
fn ward(pos: vec3<f32>, v: vec3<f32>, n: vec3<f32>, t: vec3<f32>, b: vec3<f32>, lp: vec3<f32>, alpha: vec2<f32>) -> f32 {
    let l = normalize(lp - pos);
    let nl = dot(n, l);
    let nv = dot(n, v);
    if (nl <= 0.0 || nv <= 0.0) {
        return 0.0;
    }
    let h = normalize(l + v);
    let ht = dot(h, t) / alpha.x;
    let hb = dot(h, b) / alpha.y;
    let hn = dot(h, n);
    let e = exp(-(ht * ht + hb * hb) / (hn * hn));
    return e / (4.0 * PI * alpha.x * alpha.y * sqrt(nl * nv)) * nl;
}

/// Thin-film interference: the film's reflectance at three wavelengths (650, 532, 450 nm) for an
/// optical path `path` (nm), soft enough to read as foil rather than as a rainbow.
fn film(path: f32) -> vec3<f32> {
    let w = vec3<f32>(650.0, 532.0, 450.0);
    return 0.5 + 0.5 * cos(2.0 * PI * path / w);
}

/// Schlick's Fresnel for a conductor's tint `f0`.
fn fresnel(f0: vec3<f32>, cos_t: f32) -> vec3<f32> {
    return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - clamp(cos_t, 0.0, 1.0), 5.0);
}

/// Linear light to the layer's 8-bit encoding (sRGB's curve: Display P3's), with a soft
/// shoulder so the highlights roll off instead of clipping flat.
fn encode(c0: vec3<f32>) -> vec3<f32> {
    let knee = 0.72;
    let over = max(c0 - vec3<f32>(knee), vec3<f32>(0.0));
    let c = min(c0, vec3<f32>(knee)) + (1.0 - knee) * (vec3<f32>(1.0) - exp(-over / (1.0 - knee)));
    let x = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3<f32>(0.0031308));
}

/// An antialiased band of half width `hw` around 0 (distance `d`, `aa` points a pixel).
fn line(d: f32, hw: f32, aa: f32) -> f32 {
    return 1.0 - smoothstep(hw - aa * 0.5, hw + aa * 0.5, abs(d));
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let aa = u.params.z;
    let p = in.pos.xy * aa;
    let size = u.res.xy - vec2<f32>(32.0);
    let t = u.params.y;
    let turn = -u.params.x;
    let tilt = u.params.w;
    let press = clamp(u.res.z, 0.0, 1.0);
    var m = material(t);

    // The frame, the point on the card, the eye.
    let tx = orient(vec3<f32>(1.0, 0.0, 0.0), turn, tilt);
    let by = orient(vec3<f32>(0.0, 1.0, 0.0), turn, tilt);
    var n = orient(vec3<f32>(0.0, 0.0, 1.0), turn, tilt);
    let local = p - size * 0.5;
    let pos = tx * local.x + by * local.y;
    let v = normalize(vec3<f32>(0.0, 0.0, EYE) - pos);
    // Past 90° the back shows (Core Animation mirrors the layer): lit as a face all the same.
    if (dot(n, v) < 0.0) {
        n = -n;
    }

    // The brushing: lines along x, a few per device pixel across, long and wavering along.
    let dev = in.pos.xy;
    let lines = vnoise(vec2<f32>(dev.x * 0.004, dev.y * 1.3)) * 0.5
        + vnoise(vec2<f32>(dev.x * 0.010, dev.y * 0.45)) * 0.2
        + vnoise(local * vec2<f32>(0.015, 0.35)) * 0.1 + 0.1;
    // The bead-blast under it: a fine isotropic tooth.
    let tooth = vnoise(dev * 0.7) - 0.5;
    var nn = normalize(n + by * (lines - 0.5) * 0.035 * m.brush + (tx + by) * tooth * 0.012);

    // --- regions: chip, contactless mark, hologram, bevel ------------------------------------
    let chip_o = vec2<f32>(PAD, PAD);
    let chip_s = vec2<f32>(u.res.x * 0.15, u.res.x * 0.12);
    let chip_l = p - chip_o;
    let chip_d = squircle(chip_l - chip_s * 0.5, chip_s * 0.5, 5.0);
    let in_chip = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, chip_d);

    let holo_s = vec2<f32>(34.0, 24.0);
    let holo_c = vec2<f32>(size.x - PAD - holo_s.x * 0.5, size.y - PAD - holo_s.y * 0.5 + 4.0);
    let holo_l = p - holo_c;
    let holo_d = squircle(holo_l, holo_s * 0.5, 6.0);
    let in_holo = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, holo_d);

    // The bevel: the outline's normal tips outward over its last 1.4 pt.
    let card_d = squircle(local, size * 0.5, RADIUS);
    let bevel = smoothstep(-BEVEL, 0.0, card_d);
    if (bevel > 0.0) {
        let e = 0.25;
        let g = normalize(vec2<f32>(
            squircle(local + vec2<f32>(e, 0.0), size * 0.5, RADIUS) - squircle(local - vec2<f32>(e, 0.0), size * 0.5, RADIUS),
            squircle(local + vec2<f32>(0.0, e), size * 0.5, RADIUS) - squircle(local - vec2<f32>(0.0, e), size * 0.5, RADIUS)
        ) + vec2<f32>(1e-6));
        nn = normalize(nn + (tx * g.x + by * g.y) * bevel * bevel * 1.6);
    }

    // The chip: polished, softly anisotropic, gold (palladium on the light cards).
    var chip_f0 = vec3<f32>(0.98, 0.76, 0.40);
    if (t < 0.5 || (t > 1.5 && t < 2.5)) {
        chip_f0 = vec3<f32>(0.86, 0.85, 0.82);
    }
    var groove = 0.0;
    if (in_chip > 0.0) {
        let cu = chip_l / chip_s;
        let gw = 0.32;
        // Two verticals, the side pads' rows, the centre pad's waist.
        var g = line(chip_l.x - chip_s.x * 0.34, gw, aa) + line(chip_l.x - chip_s.x * 0.66, gw, aa);
        let side = step(cu.x, 0.34) + step(0.66, cu.x);
        g += side * (line(chip_l.y - chip_s.y / 3.0, gw, aa) + line(chip_l.y - chip_s.y * 2.0 / 3.0, gw, aa));
        // The centre pad's rounded island.
        let island = squircle(chip_l - chip_s * 0.5, vec2<f32>(chip_s.x * 0.16, chip_s.y * 0.30), 3.0);
        g += line(island, gw, aa);
        groove = clamp(g, 0.0, 1.0);
        // The chip's own rim and a flatter, finer surface.
        let chip_rim = smoothstep(-0.9, 0.0, chip_d);
        let chip_n = normalize(n + (tx + by) * tooth * 0.004);
        nn = normalize(mix(nn, chip_n, in_chip) + (tx * -0.35 + by * -0.35) * chip_rim * in_chip);
    }

    // --- light -------------------------------------------------------------------------------
    // The brushing's axes in the reflection's plane, and the blur along each.
    let t2 = normalize(tx.xy + vec2<f32>(1e-5));
    let b2 = normalize(by.xy + vec2<f32>(1e-5));
    var alpha = m.alpha;
    alpha = mix(alpha, vec2<f32>(0.05, 0.07), in_chip);
    let sig = vec2<f32>(alpha.x * 0.35, alpha.y * 0.30);

    let r = reflect(-v, nn);
    let env = studio(r, t2, b2, sig);
    let key = vec3<f32>(-200.0, -320.0, 900.0);
    let fill = vec3<f32>(420.0, 420.0, 520.0);
    let spec = vec3<f32>(1.0, 0.98, 0.95) * ward(pos, v, nn, tx, by, key, alpha) * 0.55
        + vec3<f32>(0.70, 0.78, 0.90) * ward(pos, v, nn, tx, by, fill, alpha) * 0.18;

    let nv = max(dot(nn, v), 0.0);
    var f0 = mix(m.f0, chip_f0, in_chip);
    // The brushing's lines change the reflectance a little: the visible grain of the metal.
    f0 = f0 * (0.955 + 0.09 * lines);
    let f = fresnel(f0, nv);
    let ln = normalize(key - pos);
    let lambert = max(dot(nn, ln), 0.0);
    var col = f * (env + spec) + mix(m.diffuse, vec3<f32>(0.02), in_chip) * (0.35 + 0.65 * lambert);

    // Pearl (Platinum): a faint film over the face, its colour turning with the eye.
    if (m.pearl > 0.0) {
        let thick = 480.0 + 220.0 * (p.x + 0.6 * p.y) / (size.x + size.y);
        let tint = film(2.0 * 1.38 * thick * sqrt(1.0 - (1.0 - nv * nv) / (1.38 * 1.38)));
        col = col * mix(vec3<f32>(1.0), 0.75 + 0.5 * tint, m.pearl * (1.0 - in_chip));
    }

    // The chip's engraved contacts: dark, a hairline of light on their far wall.
    col = mix(col, col * 0.28 + vec3<f32>(0.004), groove * in_chip);

    // The contactless mark beside the chip: four arcs, laser-engraved.
    let cl_c = vec2<f32>(chip_o.x + chip_s.x + 8.0, chip_o.y + chip_s.y * 0.5);
    let cl = p - cl_c;
    let ang = atan2(cl.y, cl.x);
    let rad = length(cl);
    var arcs = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        let ri = 3.4 + 3.4 * f32(i);
        arcs = max(arcs, line(rad - ri, 0.62, aa) * (1.0 - smoothstep(0.62 - aa / max(ri, 1.0), 0.62 + aa / max(ri, 1.0), abs(ang))));
    }
    // Laser engraving: lighter and matte on the dark card, darker on the light ones.
    var etch = col * 0.55;
    if (t > 2.5) {
        etch = vec3<f32>(0.11, 0.11, 0.115) + col * 0.3;
    }
    col = mix(col, etch, arcs);

    // The hologram: a diffraction foil of concentric rings; its colours follow the half vector.
    if (in_holo > 0.0) {
        let h = normalize(normalize(key - pos) + v);
        let radial = normalize(holo_l + vec2<f32>(1e-4));
        let gdir = tx * radial.x + by * radial.y;
        let ring = length(holo_l);
        let path = 1500.0 * dot(h, gdir) + ring * 34.0 + 380.0 + 50.0 * vnoise(holo_l * 0.6);
        let foil = film(path);
        let foil2 = film(path * 1.31 + 200.0);
        var holo = mix(foil, foil2, 0.5);
        holo = mix(vec3<f32>(dot(holo, vec3<f32>(0.333))), holo, 0.65);
        // A fine guilloché of rings in it, embossed: each ring's crest catches the light.
        let crest = 0.5 + 0.5 * cos(ring * 2.2);
        let lit = 0.28 + 0.85 * env.g + spec.g * 0.6;
        var hc = (0.7 * holo + 0.3 * vec3<f32>(0.85, 0.86, 0.88)) * lit * (0.85 + 0.25 * crest);
        // Its edge: a hairline of shadow.
        let edge = smoothstep(-0.8, 0.0, holo_d);
        hc = hc * (1.0 - 0.45 * edge);
        col = mix(col, hc, in_holo);
    }

    // The press: the card lifts toward the light a touch.
    col = col * (1.0 + 0.06 * press);

    // Grain and dither: per device pixel, so it never swims.
    let grain = hash(dev + vec2<f32>(t * 37.0, 11.0)) - 0.5;
    col = col * (1.0 + grain * 0.035);
    var o = encode(col);
    o = o + (hash(dev * 1.37 + 3.1) - 0.5) / 255.0;
    // The 8-bit layer clamps and rounds it on store.
    return vec4<f32>(o, 1.0);
}
