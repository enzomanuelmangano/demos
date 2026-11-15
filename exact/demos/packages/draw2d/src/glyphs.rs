//! Glyph masks in an atlas, one quad per glyph: the atlas, the strike keys and the coverage pre-blend table.
//!
//! - A run whose device text size (font size × the matrix's max scale) is under [`MIN_SDFT`] is drawn
//!   from the atlas; larger runs, and glyphs wider or taller than 256 px, are filled as paths.
//! - Each glyph's position is the position matrix plus (½, ½), floored (no subpixel positioning);
//!   its quad is its mask bounds there.
//! - A strike is the font size and the matrix's 2×2, each entry rounded to 1/1024. The coverage is
//!   pre-blended through a 3-bit luminance table from the paint's colour (grey 0.5 for a shader),
//!   with the contrast and gamma constants Skia's mask gamma uses ([`preblend`]).
//! - The atlas is sampled nearest, the coverage is its red channel, one depth per run, no MSAA.
//!
//! The masks come from CoreText ([`crate::coretext`]) on Apple targets. Elsewhere (the web, for
//! tests) there is no platform scaler: text stays filled glyph outlines.

#![cfg_attr(not(target_vendor = "apple"), allow(dead_code))]

use std::collections::HashMap;
use std::cell::RefCell;

/// The device text size from which a run is drawn as paths instead of from the atlas.
pub(crate) const MIN_SDFT: f32 = 162.0;
/// The device text size above which Skia always draws glyphs as paths (unused: runs from [`MIN_SDFT`] are paths already).
#[allow(dead_code)]
pub(crate) const MAX_ATLAS_TEXT: f32 = 324.0;
/// The largest mask side, in px, the atlas takes.
pub(crate) const TOO_BIG: u32 = 256;
/// The atlas's width; it grows in height to [`ATLAS_MAX_H`].
pub(crate) const ATLAS_W: u32 = 2048;
pub(crate) const ATLAS_MAX_H: u32 = 2048;

/// The largest scale of a 2×2 `[scaleX, skewX, skewY, scaleY]`.
pub(crate) fn max_scale(m: [f32; 4]) -> f32 {
    let [sx, kx, ky, sy] = m;
    if kx == 0.0 && ky == 0.0 {
        return sx.abs().max(sy.abs());
    }
    let a = sx * sx + ky * ky;
    let b = sx * kx + sy * ky;
    let c = kx * kx + sy * sy;
    let b2 = b * b;
    let nearly_zero = 1.0 / 4096.0f32;
    let r = if b2 <= nearly_zero * nearly_zero {
        a.max(c)
    } else {
        let amc = a - c;
        let apc2 = (a + c) / 2.0;
        let x = (amc * amc + 4.0 * b2).sqrt() / 2.0;
        apc2 + x
    };
    if !r.is_finite() {
        return -1.0;
    }
    r.max(0.0).sqrt()
}

/// Rounds to a multiple of 1/1024, so near-equal matrices share a strike.
fn relax(x: f32) -> f32 {
    ((x as f64 * 1024.0 + 0.5).floor() as f32) / 1024.0
}

/// A strike: the font (its id and variation), the text size and the relaxed 2×2, and the
/// luminance table.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct StrikeKey {
    /// 0: masks with the pre-blend; 1: raw coverage, as a UIKit label draws it; 2: subpixel-positioned masks.
    pub mode: u8,
    pub font: u64,
    pub size: u32,
    pub post: [u32; 4],
    pub lum: u8,
}

/// The 2×2 of a device matrix `[a, b, c, d]` (x' = a x + c y) as `[scaleX, skewX, skewY, scaleY]`.
pub(crate) fn post2x2(m: &crate::Matrix) -> [f32; 4] {
    let [a, b, c, d, ..] = m.0;
    [relax(a), relax(c), relax(b), relax(d)]
}

/// The text size CoreText rasterises at (the vertical scale taken out) and the remaining 2×2, and whether it is invertible; `None` for a singular matrix.
pub(crate) fn compute_matrices(size: f32, post: [f32; 4]) -> Option<(f32, [f32; 4], bool)> {
    // A = post · Scale(size): scaleX, skewX, skewY, scaleY.
    let [p00, p01, p10, p11] = post;
    let a = [p00 * size, p01 * size, p10 * size, p11 * size];
    let skewed = a[1] != 0.0 || a[2] != 0.0 || a[0] < 0.0 || a[3] < 0.0;
    let ga = if skewed {
        // The Givens rotation of A · (1, 0) = (scaleX, skewY).
        let (ha, hb) = (a[0], a[2]);
        let (c, s);
        if hb == 0.0 {
            c = 1.0f32.copysign(ha);
            s = 0.0;
        } else if ha == 0.0 {
            c = 0.0;
            s = -(1.0f32.copysign(hb));
        } else if hb.abs() > ha.abs() {
            let t = ha / hb;
            let u = (1.0 + t * t).sqrt().copysign(hb);
            s = -1.0 / u;
            c = -s * t;
        } else {
            let t = hb / ha;
            let u = (1.0 + t * t).sqrt().copysign(ha);
            c = 1.0 / u;
            s = -c * t;
        }
        // G = [c, -s; s, c]; GA = G · A.
        [c * a[0] + -s * a[2], c * a[1] + -s * a[3], s * a[0] + c * a[2], s * a[1] + c * a[3]]
    } else {
        a
    };
    let nearly_zero = 1.0 / 4096.0f32;
    if ga[0].abs() <= nearly_zero || ga[3].abs() <= nearly_zero || !ga.iter().all(|v| v.is_finite()) {
        return None;
    }
    let ys = ga[3].abs();
    let sa = if !skewed && a[0] == a[3] {
        [1.0, 0.0, 0.0, 1.0]
    } else if !skewed {
        [a[0] / ys, 0.0, 0.0, 1.0]
    } else {
        // A · Scale(1/s, 1/s).
        let inv = 1.0 / ys;
        [a[0] * inv, a[1] * inv, a[2] * inv, a[3] * inv]
    };
    let det = sa[0] as f64 * sa[3] as f64 - sa[1] as f64 * sa[2] as f64;
    Some((ys, sa, det != 0.0 && det.is_finite()))
}

/// One 8-bit channel reduced to its top 3 bits, spread back to 8.
fn canonical(c: u32) -> u32 {
    let base = (c >> 5) << 5;
    base | (base >> 3) | (base >> 6)
}

/// The pre-blend table index for a paint: its luminance colour (grey 0.5 for a shader) reduced per
/// channel to 3 bits, scaled for the smoothing behaviour (½ for `some`, ¾ for `subpixel`), reduced
/// again, then taken as a grey luminance and reduced to its top 3 bits.
pub(crate) fn luminance_index(paint: &crate::Paint, smoothing: u8) -> u8 {
    let rgb = match &paint.shader {
        crate::Shader::Solid(c) => [c.0[0], c.0[1], c.0[2]],
        _ => [0.5, 0.5, 0.5],
    };
    // Pin to 0…255 with rounding, then truncate.
    let mut c = rgb.map(|v| canonical((v * 255.0 + 0.5).clamp(0.0, 255.0) as u32));
    if smoothing == 1 {
        c = c.map(|v| canonical(v / 2));
    } else if smoothing == 2 {
        c = c.map(|v| canonical(v * 3 / 4));
    }
    let lum = (c[0] * 54 + c[1] * 183 + c[2] * 19) >> 8;
    (canonical(lum) >> 5) as u8
}

/// What the smoothing behaviour makes of a strike: `(requestSmooth, luminance scaling, contrast)`.
/// With no smoothing (iOS) the glyph is unhinted A8 and the contrast is 0.5 (stored as 128 / 255);
/// otherwise hinting stays normal, the luminance colour is scaled (½, ¾) and the contrast is 0.
pub(crate) fn scaler_settings(smoothing: u8) -> (bool, u8, f32) {
    match smoothing {
        0 => (false, 0, 128.0 / 255.0),
        s => (true, s, 0.0),
    }
}

/// The pre-blend table for `index` and `contrast`: a lookup from coverage to corrected coverage, built with sRGB luminance.
pub(crate) fn preblend(index: u8, contrast: f32) -> [u8; 256] {
    let to_luma = |v: f32| if v <= 0.04045f32 { v / 12.92f32 } else { ((v + 0.055f32) / 1.055f32).powf(2.4f32) };
    let from_luma = |v: f32| if v <= 0.0031308f32 { v * 12.92f32 } else { 1.055f32 * v.powf(1.0f32 / 2.4f32) - 0.055f32 };
    // Scale the 3-bit index to 8 bits.
    let base = (index as u32) << 5;
    let lum = base | (base >> 3) | (base >> 6);
    let src = lum as f32 / 255.0f32;
    let lin_src = to_luma(src);
    let dst = 1.0f32 - src;
    let lin_dst = to_luma(dst);
    let adjusted = contrast * lin_dst;
    let round = |x: f32| (x as f64 + 0.5).floor() as i64;
    let mut table = [0u8; 256];
    let mut ii = 0.0f32;
    for t in table.iter_mut() {
        let raw = ii / 255.0f32;
        let srca = raw + ((1.0f32 - raw) * adjusted * raw);
        *t = if (src - dst).abs() < 1.0 / 256.0 {
            round(255.0f32 * srca) as u8
        } else {
            let dsta = 1.0f32 - srca;
            let lin_out = lin_src * srca + dsta * lin_dst;
            let out = from_luma(lin_out);
            let result = (out - dst) / (src - dst);
            round(255.0f32 * result).clamp(i32::MIN as i64, i32::MAX as i64) as u8
        };
        ii += 1.0;
    }
    table
}

/// Where a glyph's mask is in the atlas, and its bounds about the glyph's origin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Slot {
    pub x: u32,
    pub y: u32,
    pub left: i32,
    pub top: i32,
    pub w: u32,
    pub h: u32,
}

/// What a glyph of a strike is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Digest {
    /// No pixels.
    Empty,
    /// Too big for the atlas, or it didn't fit: drawn as a path.
    Path,
    Mask(Slot),
}

/// The glyph atlas: one A8 page every renderer on the thread uploads from.
pub(crate) struct Atlas {
    /// Bumped when the atlas is cleared (every slot is then stale).
    pub epoch: u64,
    pub pixels: Vec<u8>,
    /// The rows of each mask written since the clear, in order (renderers upload what they
    /// haven't seen).
    pub dirty: Vec<(u32, u32)>,
    pub height: u32,
    shelves: Vec<(u32, u32, u32)>,
    glyphs: HashMap<(StrikeKey, u32), Digest>,
    /// An allocation failed: clear at the next frame's start.
    pub full: bool,
    luts: [Option<Box<[u8; 256]>>; 8],
    /// The system's font smoothing (0 none, 1 some, 2 subpixel), probed once.
    pub smoothing: u8,
    #[cfg(target_vendor = "apple")]
    pub(crate) offscreen: crate::coretext::Offscreen,
}

thread_local! {
    /// One atlas per rendering thread (the host renders every surface on one): renderers upload
    /// from the atlas of the thread that recorded their canvas.
    static ATLAS: RefCell<Option<Atlas>> = const { RefCell::new(None) };
}

impl Atlas {
    fn new() -> Atlas {
        Atlas {
            epoch: 1,
            pixels: Vec::new(),
            dirty: Vec::new(),
            height: 0,
            shelves: Vec::new(),
            glyphs: HashMap::new(),
            full: false,
            luts: Default::default(),
            #[cfg(target_vendor = "apple")]
            smoothing: crate::coretext::smooth_behavior() as u8,
            #[cfg(not(target_vendor = "apple"))]
            smoothing: 0,
            #[cfg(target_vendor = "apple")]
            offscreen: Default::default(),
        }
    }

    /// The atlas, made on first use.
    pub(crate) fn with<R>(f: impl FnOnce(&mut Atlas) -> R) -> R {
        ATLAS.with(|a| f(a.borrow_mut().get_or_insert_with(Atlas::new)))
    }

    /// Clears it if a glyph didn't fit last frame (between frames, so no recorded quad is stale).
    pub(crate) fn begin_frame(&mut self) {
        if self.full {
            self.full = false;
            self.epoch += 1;
            self.pixels.clear();
            self.dirty.clear();
            self.height = 0;
            self.shelves.clear();
            self.glyphs.clear();
        }
    }

    pub(crate) fn lut(&mut self, index: u8) -> &[u8; 256] {
        let contrast = scaler_settings(self.smoothing).2;
        self.luts[index as usize & 7].get_or_insert_with(|| Box::new(preblend(index, contrast)))
    }

    /// A shelf slot for a `w × h` mask (1 px apart).
    fn allocate(&mut self, w: u32, h: u32) -> Option<(u32, u32)> {
        let (pw, ph) = (w + 1, h + 1);
        let mut best: Option<usize> = None;
        for (i, &(_, sh, sx)) in self.shelves.iter().enumerate() {
            if sh >= ph && sx + pw <= ATLAS_W && best.is_none_or(|b| self.shelves[b].1 > sh) {
                best = Some(i);
            }
        }
        if let Some(i) = best {
            let (y, _, x) = self.shelves[i];
            self.shelves[i].2 += pw;
            return Some((x, y));
        }
        let y = self.height;
        // Shelves in heights rounded up to 4 px, so close sizes share one.
        let sh = ph.div_ceil(4) * 4;
        if y + sh > ATLAS_MAX_H || pw > ATLAS_W {
            return None;
        }
        self.height = y + sh;
        self.pixels.resize((self.height * ATLAS_W) as usize, 0);
        self.shelves.push((y, sh, pw));
        Some((0, y))
    }

    /// The glyph's digest in a strike, made (and its mask rasterised) on first use by `make`,
    /// which returns its bounds and writes its `w × h` mask.
    pub(crate) fn glyph(&mut self, key: StrikeKey, glyph: u32, make: &mut dyn FnMut(&mut Atlas, &mut Vec<u8>) -> Option<(i32, i32, u32, u32)>) -> Digest {
        if let Some(d) = self.glyphs.get(&(key, glyph)) {
            return *d;
        }
        let mut mask = Vec::new();
        let digest = match make(self, &mut mask) {
            None => Digest::Empty,
            Some((_, _, w, h)) if w.max(h) > TOO_BIG => Digest::Path,
            Some((left, top, w, h)) => match self.allocate(w, h) {
                Some((x, y)) => {
                    for row in 0..h {
                        let at = ((y + row) * ATLAS_W + x) as usize;
                        self.pixels[at..at + w as usize].copy_from_slice(&mask[(row * w) as usize..((row + 1) * w) as usize]);
                    }
                    self.dirty.push((y, y + h));
                    Digest::Mask(Slot { x, y, left, top, w, h })
                }
                None => {
                    self.full = true;
                    return Digest::Path;
                }
            },
        };
        self.glyphs.insert((key, glyph), digest);
        digest
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_preblend_is_skias_table() {
        // Index 0 (black text).
        let t = preblend(0, 0.0);
        assert_eq!((t[0], t[255]), (0, 255));
        // Black text darkens mid coverage: 0.5 becomes 68.
        assert_eq!(t[128], 68, "{:?}", &t[120..136]);
        // With the contrast iOS uses (128 / 255) the same coverage becomes 91.
        assert_eq!(preblend(0, 128.0 / 255.0)[128], 91);
        // White text (index 7) lightens coverage.
        let w = preblend(7, 0.0);
        assert!(w[128] > 128, "{}", w[128]);
        for k in 0..8 {
            for c in [0.0, 128.0 / 255.0] {
                let t = preblend(k, c);
                assert!(t.windows(2).all(|p| p[0] <= p[1]), "{k}: monotonic");
                assert_eq!((t[0], t[255]), (0, 255));
            }
        }
    }

    #[test]
    fn the_strike_matrices_are_compute_matrices() {
        // A uniform device scale: CoreText at size × 3, no remaining transform.
        let (s, sa, inv) = compute_matrices(14.0, [3.0, 0.0, 0.0, 3.0]).unwrap();
        assert_eq!((s, sa, inv), (42.0, [1.0, 0.0, 0.0, 1.0], true));
        // A rotation: the vertical scale of the Givens-rotated matrix, the rotation left in sA.
        let (c, sn) = (0.6f32, 0.8f32);
        let (s, sa, _) = compute_matrices(10.0, [c * 2.0, -sn * 2.0, sn * 2.0, c * 2.0]).unwrap();
        assert!((s - 20.0).abs() < 1e-4, "{s}");
        assert!((sa[0] - 0.6).abs() < 1e-6 && (sa[2] - 0.8).abs() < 1e-6, "{sa:?}");
        assert_eq!(max_scale([3.0, 0.0, 0.0, 2.0]), 3.0);
        assert!((max_scale([c * 2.0, -sn * 2.0, sn * 2.0, c * 2.0]) - 2.0).abs() < 1e-5);
    }

    /// Glyph masks from [`crate::coretext`] against a C reference program (`tools/coretext_reference.c`,
    /// built with the system's `cc`): the smoothing behaviour, the luminance table, bounds and every
    /// byte, with this machine's behaviour and with both `none` and `some` forced.
    #[cfg(target_os = "macos")]
    #[test]
    fn coretext_masks_are_skias() {
        use crate::{Font, Matrix};
        let dir = std::env::temp_dir().join(format!("skia-coretext-ref-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("ref");
        let root = env!("CARGO_MANIFEST_DIR");
        let built = std::process::Command::new("cc")
            .args(["-O0", "-ffp-contract=off", "-w", &format!("{root}/tools/coretext_reference.c"), "-framework", "CoreText", "-framework", "CoreGraphics", "-framework", "CoreFoundation", "-o"])
            .arg(&tool)
            .status();
        if !built.is_ok_and(|s| s.success()) {
            return eprintln!("no cc; skipped");
        }
        let fonts = format!("{root}/../../gpu/fonts/");
        static OUTFIT: &[u8] = include_bytes!("../../../gpu/fonts/outfit.ttf");
        static FIRA: &[u8] = include_bytes!("../../../gpu/fonts/fira-code-medium.ttf");
        static SF_DIGITS: &[u8] = include_bytes!("../../../gpu/fonts/sf-compact-rounded-medium-digits.otf");
        static NEWSREADER: &[u8] = include_bytes!("../../../gpu/fonts/newsreader-prince-subset.ttf");
        let (r, s) = (1.2566371f32.cos(), 1.2566371f32.sin());
        // (file, data, axes, size, device matrix, paint colour, text)
        type Case = (&'static str, &'static [u8], Vec<([u8; 4], f32)>, f32, Matrix, crate::Color, &'static str);
        let cases: Vec<Case> = vec![
            ("outfit.ttf", OUTFIT, vec![], 16.0, Matrix::scale(3.0, 3.0), crate::Color::WHITE, "Sacrifice Mindset"),
            ("outfit.ttf", OUTFIT, vec![(*b"wght", 600.0)], 16.0, Matrix([3.0 * r, 3.0 * s, -3.0 * s, 3.0 * r, 0.0, 0.0]), crate::Color::WHITE, "Rotated"),
            ("fira-code-medium.ttf", FIRA, vec![], 16.0, Matrix::scale(3.0, 3.0), crate::Color::hex(0x964D20), "COFFEE 42%"),
            ("sf-compact-rounded-medium-digits.otf", SF_DIGITS, vec![], 34.0, Matrix::scale(1.5, 1.5), crate::Color::WHITE, "0123456789"),
            ("newsreader-prince-subset.ttf", NEWSREADER, vec![(*b"opsz", 12.0), (*b"wght", 400.0)], 30.0, Matrix::scale(1.0, 1.0), crate::Color::hex(0x1c1a17), "Goodbye rose"),
            ("outfit.ttf", OUTFIT, vec![], 13.0, Matrix::scale(2.0, 3.0), crate::Color::hex(0x7f7f7f), "Wide text"),
            ("outfit.ttf", OUTFIT, vec![], 40.0, Matrix([-2.5, 0.0, 0.7, 2.5, 0.0, 0.0]), crate::Color::hex(0x2a6be0), "Skew"),
        ];
        let spider = format!("{root}/src/spider_symbol.ttf");
        let mut worst = 0u8;
        let mut glyph_count = 0;
        for (file, data, axes, size, m, color, text) in cases {
            let axes_ref: Vec<(&[u8; 4], f32)> = axes.iter().map(|(t, v)| (t, *v)).collect();
            let font = Font::with_variations(data, size, &axes_ref).unwrap();
            let mut run = Vec::new();
            font.glyph_run(text, &mut run);
            let paint = crate::Paint::fill(color);
            let post = post2x2(&m);
            let (text_size, sa, inv) = compute_matrices(size, post).unwrap();
            let typeface = crate::coretext::Typeface::new(data, &font.ct_axes(), axes.iter().any(|(t, _)| t == b"opsz")).unwrap();
            let strike = crate::coretext::Strike::new(&typeface, text_size, sa, inv).unwrap();
            let axes_arg = if axes.is_empty() { "-".to_string() } else { axes.iter().map(|(t, v)| format!("{}={v}", std::str::from_utf8(t).unwrap())).collect::<Vec<_>>().join(",") };
            let [a, b, c, d, ..] = m.0;
            let hex = color.0[..3].iter().fold(0u32, |acc, v| (acc << 8) | (v * 255.0 + 0.5).clamp(0.0, 255.0) as u32);
            for mode in ["probe", "none", "some"] {
                let mut cmd = std::process::Command::new(&tool);
                cmd.arg(format!("{fonts}{file}")).arg(size.to_string());
                for v in [a, c, b, d] {
                    cmd.arg(format!("{v:.9}"));
                }
                cmd.arg(format!("{hex:06x}"));
                cmd.arg(if mode == "probe" { format!("probe={spider}") } else { mode.to_string() });
                cmd.arg(&axes_arg);
                for (g, _) in &run {
                    cmd.arg(g.to_string());
                }
                // The reference parses the matrix from text: it must give the same strike.
                let parsed: Vec<f32> = [a, c, b, d].iter().map(|v| format!("{v:.9}").parse().unwrap()).collect();
                assert_eq!([relax(parsed[0]), relax(parsed[1]), relax(parsed[2]), relax(parsed[3])], post, "{file}: the strike's matrix");
                let out = String::from_utf8(cmd.output().unwrap().stdout).unwrap();
                let mut lines = out.lines();
                let head: Vec<&str> = lines.next().unwrap().split(' ').collect();
                let behavior: u8 = head[1].parse().unwrap();
                if mode == "probe" {
                    assert_eq!(behavior, crate::coretext::smooth_behavior() as u8, "SkCTFontGetSmoothBehavior");
                }
                let (smooth, _, contrast) = scaler_settings(behavior);
                let lum = luminance_index(&paint, behavior);
                assert_eq!(head[3], lum.to_string(), "{file} {mode}: the luminance table");
                let lut = preblend(lum, contrast);
                let mut offscreen = crate::coretext::Offscreen::default();
                for (g, _) in &run {
                    let head: Vec<&str> = lines.next().unwrap().split(' ').collect();
                    assert_eq!(head[0], g.to_string());
                    let ours = strike.bounds(*g);
                    if head[1] == "empty" {
                        assert_eq!(ours, None, "{file} glyph {g}");
                        continue;
                    }
                    let theirs: Vec<i32> = head[1..].iter().map(|v| v.parse().unwrap()).collect();
                    let ours = ours.unwrap_or_else(|| panic!("{file} glyph {g}: empty, Skia's isn't"));
                    assert_eq!([ours.0, ours.1, ours.2 as i32, ours.3 as i32], theirs[..], "{file} glyph {g}: bounds");
                    let hex = lines.next().unwrap();
                    let reference: Vec<u8> = (0..hex.len() / 2).map(|i| u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap()).collect();
                    let mut mask = vec![0u8; (ours.2 * ours.3) as usize];
                    offscreen.draw(&strike, *g, ours, &lut, smooth, &mut mask);
                    assert!(mask.iter().any(|&v| v > 0), "{file} glyph {g}: no ink");
                    assert_eq!(mask.len(), reference.len());
                    for (x, y) in mask.iter().zip(&reference) {
                        worst = worst.max(x.abs_diff(*y));
                    }
                    glyph_count += 1;
                }
            }
        }
        eprintln!("coretext: {glyph_count} glyph masks, max error {worst} / 255");
        assert!(glyph_count > 150);
        assert_eq!(worst, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(all(test, target_vendor = "apple"))]
mod timing {
    #[test]
    #[ignore = "timing"]
    fn strike_and_raster_cost() {
        static SF_DIGITS: &[u8] = include_bytes!("../../../gpu/fonts/sf-compact-rounded-medium-digits.otf");
        let font = crate::Font::new(SF_DIGITS, 34.0).unwrap();
        let typeface = crate::coretext::Typeface::new(SF_DIGITS, &[], false).unwrap();
        let mut run = Vec::new();
        font.glyph_run("012345", &mut run);
        let mut off = crate::coretext::Offscreen::default();
        let lut = super::preblend(7, 128.0 / 255.0);
        let (mut t_strike, mut t_bounds, mut t_draw) = (0.0, 0.0, 0.0);
        let n = 200;
        let mut mask = Vec::new();
        for k in 0..n {
            let size = 34.0 * (1.5 + k as f32 * 0.0071);
            let t = std::time::Instant::now();
            let strike = crate::coretext::Strike::new(&typeface, size, [1.0, 0.0, 0.0, 1.0], true).unwrap();
            t_strike += t.elapsed().as_secs_f64();
            for &(g, _) in &run {
                let t = std::time::Instant::now();
                let b = strike.bounds(g).unwrap();
                t_bounds += t.elapsed().as_secs_f64();
                mask.resize((b.2 * b.3) as usize, 0);
                let t = std::time::Instant::now();
                off.draw(&strike, g, b, &lut, false, &mut mask);
                t_draw += t.elapsed().as_secs_f64();
            }
        }
        let us = |t: f64| t * 1e6 / n as f64;
        println!("per strike: create {:.1} us, 6 bounds {:.1} us, 6 masks {:.1} us", us(t_strike), us(t_bounds), us(t_draw));
    }
}
