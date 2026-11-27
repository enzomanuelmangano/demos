// The intro's 2D board, as the RN intro draws it on its sheet (onboarding/sheet-board.tsx over
// react-native-chessboard's Skia board): one pass for the squares, their cues and the
// coordinate labels, read through the inverse homography; then the pieces, the hover cue, the
// move dots and the capture rings as sprites carried by the homography. Colours are encoded
// sRGB, premultiplied, blended as Skia blends them.

struct Board {
    // Canvas points -> board points (the inverse homography), by columns.
    inv0: vec4<f32>,
    inv1: vec4<f32>,
    inv2: vec4<f32>,
    // Board points -> canvas points, by columns.
    fwd0: vec4<f32>,
    fwd1: vec4<f32>,
    fwd2: vec4<f32>,
    // canvas width, height (points), pixels per point, the board's side (points)
    view: vec4<f32>,
    // the squares' opacity, the pieces' opacity, 1 on an sRGB target, the labels' baseline
    // (ems under the top of their line)
    misc: vec4<f32>,
    light: vec4<f32>,
    dark: vec4<f32>,
    last: vec4<f32>,
    sel_on_light: vec4<f32>,
    sel_on_dark: vec4<f32>,
    check: vec4<f32>,
    wrong: vec4<f32>,
    // the glyph atlas's size (pixels), its pixels per em
    atlas: vec4<f32>,
    // Per square: the last move's, the selection's, the check's and the wrong move's opacity.
    cues: array<vec4<f32>, 64>,
    // Per glyph ("1"…"8", "a"…"h"): its atlas cell (x, y, w, h pixels) and that cell's box in
    // ems from the pen on the baseline (left, top, w, h).
    cell: array<vec4<f32>, 16>,
    em: array<vec4<f32>, 16>,
}

// One sprite: its box in board points before its scale (x, y, w, h); kind (0 a piece, 1 a
// disc, 2 a ring), the piece's layer, its opacity, its scale about its centre; its colour
// (premultiplied) for a disc or a ring.
struct Sprite {
    rect: vec4<f32>,
    look: vec4<f32>,
    color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> b: Board;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var pieces: texture_2d_array<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var<storage, read> sprites: array<Sprite>;

fn over(dst: vec4<f32>, src: vec4<f32>) -> vec4<f32> {
    return src + dst * (1.0 - src.a);
}

// Encoded and premultiplied to what the target wants.
fn out(c: vec4<f32>) -> vec4<f32> {
    if (b.misc.z < 0.5 || c.a <= 0.0) {
        return c;
    }
    let s = c.rgb / c.a;
    let lin = select(pow((s + 0.055) / 1.055, vec3<f32>(2.4)), s / 12.92, s <= vec3<f32>(0.04045));
    return vec4<f32>(lin * c.a, c.a);
}

@vertex
fn vs_squares(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

// The coverage of glyph `g` at `local` (square points) for a label whose line starts at `at`
// (square points), `fs` points high, sampled at mip `lod`.
fn glyph(g: i32, local: vec2<f32>, at: vec2<f32>, fs: f32, lod: f32) -> f32 {
    let e = b.em[g];
    let box = vec4<f32>(at.x + e.x * fs, at.y + (b.misc.w + e.y) * fs, e.z * fs, e.w * fs);
    let uv = (local - box.xy) / box.zw;
    let inside = all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
    let c = b.cell[g];
    let px = c.xy + clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)) * c.zw;
    let a = textureSampleLevel(glyphs, smp, px / b.atlas.xy, lod).r;
    return select(0.0, a, inside);
}

@fragment
fn fs_squares(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = vec3<f32>(pos.xy / b.view.z, 1.0);
    let h = mat3x3<f32>(b.inv0.xyz, b.inv1.xyz, b.inv2.xyz) * p;
    let c = h.xy / h.z;
    let size = b.view.w;
    let sq = size / 8.0;
    let fw = max(fwidth(c), vec2<f32>(1e-4));
    let inside = clamp(min(c, vec2<f32>(size) - c) / fw + 0.5, vec2<f32>(0.0), vec2<f32>(1.0));
    let cover = inside.x * inside.y * select(0.0, 1.0, h.z > 0.0);
    let cc = clamp(c, vec2<f32>(0.0), vec2<f32>(size - 0.001));
    let f = floor(cc / sq);
    let file = i32(f.x);
    let rank = i32(f.y);
    let s = rank * 8 + file;
    let light = (file + rank) % 2 == 0;
    let local = cc - f * sq;
    var col = select(b.dark, b.light, light);
    let cue = b.cues[s];
    col = over(col, b.last * cue.x);
    col = over(col, select(b.sel_on_dark, b.sel_on_light, light) * cue.y);
    // The check: a flat fill of its translucent colour (skia-cues.tsx drawCues). One cue per
    // square: only the owner's channel is lit (board.rs resolve_cues).
    col = over(col, b.check * cue.z);
    col = over(col, b.wrong * cue.w);
    // The labels, 0.15 of a square in the other square colour: the rank on the a-file, its
    // line at (0.05, 0.0518) of the square; the file on the first rank, at (0.85, 0.8347).
    let fs = sq * 0.15;
    let lod = log2(max(max(fw.x, fw.y) * b.atlas.z / fs, 1e-4));
    let rank_a = glyph(clamp(7 - rank, 0, 7), local, vec2<f32>(0.05, 0.0518) * sq, fs, lod) * select(0.0, 1.0, file == 0);
    let file_a = glyph(8 + file, local, vec2<f32>(0.85, 0.8347) * sq, fs, lod) * select(0.0, 1.0, rank == 7);
    col = over(col, select(b.light, b.dark, light) * max(rank_a, file_a));
    return out(col * (cover * b.misc.x));
}

struct SpriteOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) @interpolate(flat) index: u32,
}

// Discs and rings reach a little past their box, for their edges' antialiasing.
const MARGIN: f32 = 0.06;

@vertex
fn vs_sprite(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SpriteOut {
    let sp = sprites[i];
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
    );
    // Pieces (0) and lit squares (3) fill their box exactly.
    let m = select(MARGIN, 0.0, sp.look.x < 0.5 || sp.look.x > 2.5);
    let uv = corners[v] * (1.0 + 2.0 * m) - vec2<f32>(m);
    let centre = sp.rect.xy + sp.rect.zw * 0.5;
    let q = centre + (uv - vec2<f32>(0.5)) * sp.rect.zw * sp.look.w;
    let hp = mat3x3<f32>(b.fwd0.xyz, b.fwd1.xyz, b.fwd2.xyz) * vec3<f32>(q, 1.0);
    let ndc = vec2<f32>(hp.x / hp.z / b.view.x * 2.0 - 1.0, 1.0 - hp.y / hp.z / b.view.y * 2.0);
    var o: SpriteOut;
    o.pos = vec4<f32>(ndc * hp.z, 0.0, hp.z);
    o.uv = uv;
    o.index = i;
    return o;
}

@fragment
fn fs_sprite(in: SpriteOut) -> @location(0) vec4<f32> {
    let sp = sprites[in.index];
    let texel = textureSample(pieces, smp, clamp(in.uv, vec2<f32>(0.0), vec2<f32>(1.0)), i32(sp.look.y));
    let d = length(in.uv - vec2<f32>(0.5));
    let w = max(fwidth(d), 1e-4);
    let disc = clamp((0.5 - d) / w + 0.5, 0.0, 1.0);
    let hole = clamp((0.4 - d) / w + 0.5, 0.0, 1.0);
    var c = texel;
    if (sp.look.x > 2.5) {
        // A lit square (the level board's cue under a carried piece): flat, its box.
        c = sp.color;
    } else if (sp.look.x > 1.5) {
        c = sp.color * (disc - hole);
    } else if (sp.look.x > 0.5) {
        c = sp.color * disc;
    }
    return out(c * (sp.look.z * b.misc.y));
}
