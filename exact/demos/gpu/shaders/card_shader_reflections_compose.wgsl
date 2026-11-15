// Card Shader Reflections' screen: the four cards as Core Animation composites them, one
// analytic draw per visible card (its quad: the card and its shadow's reach, projected), over
// the cleared #111, blended in index order (premultiplied over: the group opacity's equation);
// pixels outside every quad run no shader. Each card is each a physical metal card lit in a small studio (past RN's getCardShader:
// the owner's ask for premium cards, Apple Card titanium, Revolut Metal).
//
// Each card's Animated.View carries `[rotate 18deg, perspective 1200, translateY, rotateY]` (and,
// past RN, the finger's tilt and press) about its centre; a pixel finds the point of the card's
// plane its inverse projective map gives (painted in index order), and is shaded there:
// - brushed or anodised metal: the studio's softboxes reflected with an anisotropic blur, Ward's
//   anisotropic highlight from two point lights, the brushing's lines jittering the normal;
// - a 1.4 pt bevel on the continuous (squircle) outline: the Fresnel rim;
// - a thin-film / diffraction hologram, an EMV chip with engraved contacts, an engraved
//   contactless mark and the laser-engraved title (the atlas's glyph coverage as its mask);
// - its shadow, analytic: an ambient and a contact one, offset by the turn, tilt and press;
// - the Animated.View's opacity over the group.
// The lights and the eye stay in the room while the card turns with the scroll, tilts under the
// finger, and turns with the phone (Core Motion's attitude, smoothed): `frame`, from Rust.
// The brushing's noise is a 256² tile (Rust makes it once), read per plane device pixel. Held
// back to read as Apple Card titanium, not glitter (the owner: "it sparkles too much"): the
// brushing only shades, it barely moves the normal; the highlight is broad and low; the foil is
// a soft, faint band of colour on satin metal.
// Each card's colour is Display P3 (RN's surfaces), turned into sRGB before it blends.
struct Uniforms {
    // Per card, three rows: screen points → the card's plane points (inverse projective 3×3).
    inv: array<vec4<f32>, 12>,
    // Per card: visible (1), the Animated.View's opacity, unused, the title's alpha.
    look: array<vec4<f32>, 4>,
    // Per card: its overlay slot's left edge in the atlas (device pixels); the shadow's extra
    // offset (points, in the card's plane); the press (0…1).
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
        return Material(vec3<f32>(0.66, 0.65, 0.64), vec3<f32>(0.09, 0.088, 0.086), vec2<f32>(0.06, 0.18), 0.45, 0.05);
    }
    // Metal: dark titanium, bead-blasted then brushed.
    return Material(vec3<f32>(0.15, 0.15, 0.162), vec3<f32>(0.010, 0.010, 0.012), vec2<f32>(0.09, 0.30), 1.0, 0.0);
}

// --- the studio ------------------------------------------------------------------------------

/// A soft strip in the reflection's plane: `q` the reflected direction projected (x/z, y/z),
/// `c` a point on its axis, `n` its normal, `hw` its half width, `len` its half length. The
/// edges are blurred by the brushing: `t2` / `b2` its axes in that plane, `sig` the blur along each.
fn strip(q: vec2<f32>, c: vec2<f32>, n: vec2<f32>, hw: f32, len: f32, t2: vec2<f32>, b2: vec2<f32>, sig: vec2<f32>) -> f32 {
    let d = q - c;
    let across = abs(dot(d, n)) - hw;
    let along_dir = vec2<f32>(-n.y, n.x);
    let along = abs(dot(d, along_dir)) - len;
    let w1 = length(vec2<f32>(dot(n, t2) * sig.x, dot(n, b2) * sig.y)) + 0.03;
    let w2 = length(vec2<f32>(dot(along_dir, t2) * sig.x, dot(along_dir, b2) * sig.y)) + 0.05;
    return (1.0 - smoothstep(-w1, w1, across)) * (1.0 - smoothstep(-w2, w2, along));
}

/// The studio seen in direction `r`: a dark room, a soft gradient behind the camera, a column of
/// near-vertical softboxes the sheen sweeps across as the card turns, a cool fill low right.
fn studio(r: vec3<f32>, t2: vec2<f32>, b2: vec2<f32>, sig: vec2<f32>) -> vec3<f32> {
    let z = max(r.z, 0.06);
    let q = r.xy / z;
    let toward = smoothstep(-0.05, 0.35, r.z);
    let sky = mix(0.03, 0.13, smoothstep(0.9, -0.9, q.y)) * (0.75 + 0.25 * smoothstep(1.2, 0.0, abs(q.x)));
    var c = vec3<f32>(sky) * vec3<f32>(0.98, 0.99, 1.02);
    let n1 = vec2<f32>(0.95393920, -0.30123345);
    c += vec3<f32>(1.45, 1.43, 1.38) * strip(q, vec2<f32>(-0.075, -0.10), n1, 0.06, 0.6, t2, b2, sig);
    c += vec3<f32>(0.8, 0.79, 0.78) * strip(q, vec2<f32>(0.48, -0.1), n1, 0.05, 0.9, t2, b2, sig);
    c += vec3<f32>(0.66, 0.67, 0.7) * strip(q, vec2<f32>(-0.52, -0.1), n1, 0.045, 0.9, t2, b2, sig);
    c += vec3<f32>(0.8) * strip(q, vec2<f32>(1.12, 0.2), n1, 0.10, 1.4, t2, b2, sig * 1.5);
    c += vec3<f32>(0.7) * strip(q, vec2<f32>(-1.15, -0.3), n1, 0.10, 1.4, t2, b2, sig * 1.5);
    c += vec3<f32>(0.7) * strip(q, vec2<f32>(2.3, 0.6), n1, 0.35, 2.5, t2, b2, sig * 3.0);
    c += vec3<f32>(0.6) * strip(q, vec2<f32>(-2.4, -0.6), n1, 0.35, 2.5, t2, b2, sig * 3.0);
    let n2 = vec2<f32>(0.85285, -0.52215);
    c += vec3<f32>(0.42, 0.46, 0.52) * strip(q, vec2<f32>(0.55, 0.45), n2, 0.22, 0.6, t2, b2, sig * 2.0);
    return mix(vec3<f32>(0.03), c, toward);
}

/// Ward's anisotropic highlight from a point light at `lp` (room points, from the card's
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

/// Thin-film interference: the film's reflectance at 650, 532 and 450 nm for an optical path
/// `path` (nm).
fn film(path: f32) -> vec3<f32> {
    return 0.5 + 0.5 * cos(2.0 * PI * path / vec3<f32>(650.0, 532.0, 450.0));
}

fn fresnel(f0: vec3<f32>, cos_t: f32) -> vec3<f32> {
    return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - clamp(cos_t, 0.0, 1.0), 5.0);
}

/// Linear light to Display P3's encoding, with a soft shoulder so highlights roll off.
fn encode(c0: vec3<f32>) -> vec3<f32> {
    let knee = 0.72;
    let over = max(c0 - vec3<f32>(knee), vec3<f32>(0.0));
    let c = min(c0, vec3<f32>(knee)) + (1.0 - knee) * (vec3<f32>(1.0) - exp(-over / (1.0 - knee)));
    return enc(c);
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
    let press = clamp(u.slot[k].w, 0.0, 1.0);
    let m = material(t);

    // The frame, the point, the eye: in the room.
    let tx = u.frame[3u * k].xyz;
    let by = u.frame[3u * k + 1u].xyz;
    var n = u.frame[3u * k + 2u].xyz;
    let local = p - size * 0.5;
    let pos = tx * local.x + by * local.y;
    let v = normalize(vec3<f32>(0.0, 0.0, EYE) - pos);
    // Past 90° the back shows (Core Animation mirrors the layer): lit as a face all the same.
    if (dot(n, v) < 0.0) {
        n = -n;
    }

    // The tile at the plane's device pixel: r the brushing's lines (long along x), g the
    // bead-blast's tooth, b the grain.
    let texel = vec2<i32>(floor(p * s)) & vec2<i32>(255);
    let nz = textureLoad(tile, texel, 0);
    let lines = nz.r;
    let tooth = nz.g - 0.5;
    var nn = normalize(n + by * (lines - 0.5) * 0.008 * m.brush + (tx + by) * tooth * 0.002);

    // The bevel: the outline's normal tips outward over its last 1.4 pt.
    let card_d = squircle(local, size * 0.5, u.card.z);
    let bevel = smoothstep(-BEVEL, 0.0, card_d);
    if (bevel > 0.0) {
        let g = squircle_dir(local, size * 0.5, u.card.z);
        nn = normalize(nn + (tx * g.x + by * g.y) * bevel * bevel * 0.8);
    }

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
        let chip_rim = smoothstep(-0.9, 0.0, chip_d);
        let chip_n = normalize(n + (tx + by) * tooth * 0.004);
        nn = normalize(mix(nn, chip_n, in_chip) + (tx * -0.35 + by * -0.35) * chip_rim * in_chip);
    }
    var chip_f0 = vec3<f32>(0.98, 0.76, 0.40);
    if (t < 0.5 || (t > 1.5 && t < 2.5)) {
        chip_f0 = vec3<f32>(0.70, 0.69, 0.67);
    }

    // --- light -------------------------------------------------------------------------------
    let t2 = normalize(tx.xy + vec2<f32>(1e-5));
    let b2 = normalize(by.xy + vec2<f32>(1e-5));
    // Broad and low: Ward's lobe 1.8× wider than the brushing's own, the env's blur doubled.
    let alpha = mix(m.alpha * 1.8, vec2<f32>(0.09, 0.12), in_chip);
    let sig = vec2<f32>(alpha.x * 0.45, alpha.y * 0.40);

    let r = reflect(-v, nn);
    let env = studio(r, t2, b2, sig);
    let key = vec3<f32>(-200.0, -320.0, 900.0);
    let fill = vec3<f32>(420.0, 420.0, 520.0);
    let spec = vec3<f32>(1.0, 0.98, 0.95) * ward(pos, v, nn, tx, by, key, alpha) * 0.32
        + vec3<f32>(0.70, 0.78, 0.90) * ward(pos, v, nn, tx, by, fill, alpha) * 0.10;

    let nv = max(dot(nn, v), 0.0);
    var f0 = mix(m.f0, chip_f0, in_chip);
    // The brushing shows as shading of the reflectance (it cannot glitter), not as normals.
    f0 = f0 * (1.0 + 0.10 * (lines - 0.5) * m.brush);
    let fr = fresnel(f0, nv);
    let ln = normalize(key - pos);
    let lambert = max(dot(nn, ln), 0.0);
    var col = fr * (env + spec) + mix(m.diffuse, vec3<f32>(0.02), in_chip) * (0.35 + 0.65 * lambert);

    // Pearl (Platinum): a faint film over the face, its colour turning with the eye.
    if (m.pearl > 0.0) {
        let thick = 480.0 + 220.0 * (p.x + 0.6 * p.y) / (size.x + size.y);
        let tint = film(2.0 * 1.38 * thick * sqrt(1.0 - (1.0 - nv * nv) / (1.38 * 1.38)));
        col = col * mix(vec3<f32>(1.0), 0.75 + 0.5 * tint, m.pearl * (1.0 - in_chip));
    }

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
        let h = normalize(normalize(key - pos) + v);
        let radial = normalize(holo_l + vec2<f32>(1e-4));
        let gdir = tx * radial.x + by * radial.y;
        let ring = length(holo_l);
        let path = 900.0 * dot(h, gdir) + ring * 22.0 + 380.0;
        var holo = film(path);
        holo = mix(vec3<f32>(dot(holo, vec3<f32>(0.333))), holo, 0.45);
        // The colour lives in a soft band across the foil, where the half vector meets it.
        let sweep = dot(h, tx) * 7.0 + holo_l.x / holo_s.x;
        let band_w = exp(-sweep * sweep * 1.5);
        let crest = 0.5 + 0.5 * cos(ring * 2.2);
        let satin = col * 1.08 + vec3<f32>(0.02);
        var hc = mix(satin, satin * (0.7 + 0.6 * holo), 0.7 * band_w) * (0.96 + 0.06 * crest);
        hc = hc * (1.0 - 0.25 * smoothstep(-0.8, 0.0, holo_d));
        col = mix(col, hc, in_holo);
    }

    // The press: the card lifts toward the light a touch. The grain: fixed to the card.
    col = col * (1.0 + 0.06 * press) * (1.0 + (nz.b - 0.5) * 0.012);
    return encode(col);
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
    // The shadow: ambient and contact, offset with the card's turn, tilt and press; black.
    var shade = 0.0;
    if (cover < 1.0) {
        let press = u.slot[k].w;
        let off = vec2<f32>(3.0, 12.0) + u.slot[k].yz;
        let ambient = soft(rrect(local - off * (1.0 + 0.6 * press), half - vec2<f32>(4.0), u.card.z), 18.0 + 8.0 * press);
        let contact = soft(rrect(local - vec2<f32>(0.0, 2.5) - off * 0.15, half - vec2<f32>(1.0), u.card.z), 3.0 + 2.0 * press);
        shade = (1.0 - (1.0 - 0.62 * ambient) * (1.0 - 0.38 * contact * (1.0 - 0.5 * press))) * (1.0 - cover);
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
