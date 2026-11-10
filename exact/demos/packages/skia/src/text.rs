//! Text as `<Text x y text font>` draws it: a [`Font`] (a typeface at a size, `useFont` /
//! `matchFont`) whose glyphs are filled as paths. As Skia's `SkFont`, there is no shaping and
//! no kerning: each character's glyph from the font's cmap, placed at the advance of the last.
//!
//! A [`match_ui_font`] font lays text out as UIKit does an RN `<Text>` (Core Text): its glyphs
//! go through the GSUB features Core Text turns on by default (`ccmp`, `locl`, `rlig`, `liga`,
//! `calt`: SF's raised colon between digits, its ligatures), its advances carry the font's `trak`
//! tracking for the point size and the `kern` feature's GPOS pair adjustments (variation deltas
//! included), and its optical size follows the point size ([`Font::set_size`] re-applies it as
//! an animated `fontSize` changes).
//!
//! [`Canvas::draw_text`] draws as Graphite does on iOS ([`crate::glyphs`]): below 162 device
//! pixels, glyph masks rasterised by CoreText as RN Skia's Mac scaler does ([`crate::coretext`])
//! from an atlas, one quad per glyph; larger runs (and every run where there is no CoreText: the
//! web) as glyph outlines, read with ttf-parser (TrueType and CFF, variable fonts at the axis
//! values the font was made with), cached per glyph in font units, and filled through the
//! canvas's transform.

use std::cell::RefCell;
use std::collections::HashMap;

use lyon::math::point;
use lyon::path::Path;
use ttf_parser::{Face, GlyphId, OutlineBuilder, Tag};

use crate::{Canvas, Matrix, Paint, Rect};
#[cfg(target_vendor = "apple")]
use crate::{DrawClip, Geo, Op, Shader, Vertex, EMPTY};

/// A typeface at a size: RN Skia's `SkFont`.
pub struct Font {
    face: Face<'static>,
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    data: &'static [u8],
    /// This font's id in the glyph atlas, and its variation's generation (bumped as `opsz`
    /// follows the size).
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    uid: u64,
    generation: u64,
    /// CoreText's typeface for this variation and the last strikes made from it.
    #[cfg(target_vendor = "apple")]
    typeface: RefCell<Option<(u64, Option<crate::coretext::Typeface>)>>,
    #[cfg(target_vendor = "apple")]
    strikes: RefCell<Vec<(crate::glyphs::StrikeKey, Option<crate::coretext::Strike>)>>,
    size: f32,
    /// Font units to points.
    units: f32,
    glyphs: RefCell<HashMap<u16, Option<Path>>>,
    /// The axes it was made with (`opsz` follows the size under [`Font::set_size`]).
    axes: Vec<([u8; 4], f32)>,
    /// UIKit's layout ([`match_ui_font`]): tracking and kerning in the advances.
    ui: Option<UiLayout>,
}

/// What Core Text adds to a run's advances.
#[derive(Clone, Debug)]
struct UiLayout {
    /// The `trak` table's default track (0) at the size, font units per glyph.
    tracking: f32,
    /// The GPOS lookups of the `kern` feature (script `latn`, else `DFLT`), in lookup order.
    kern: Vec<u16>,
    /// The GSUB lookups of the default features, in lookup order.
    gsub: Vec<u16>,
    /// Each string's glyphs after GSUB (the axes don't change them: no FeatureVariations).
    shaped: RefCell<HashMap<String, Vec<GlyphId>>>,
}

/// `getMetrics()`: in points, y down (ascent negative, as Skia's).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FontMetrics {
    /// Above the baseline: negative.
    pub ascent: f32,
    /// Below the baseline: positive.
    pub descent: f32,
    /// The line gap.
    pub leading: f32,
}

impl Font {
    /// `useFont(require(file), size)`: the first face of a TrueType/OpenType file, for RN Skia's
    /// `<Text>` (Skia's glyph masks and gamma pre-blend). A font standing in for an RN `<Text>`
    /// (a label, an @expo/vector-icons glyph, a ReText) must be `.with_ui_layout()`: UIKit draws
    /// those with raw coverage, and Skia's pre-blend makes them 5-20 % heavier (measured against
    /// the text probe's colour cases).
    pub fn new(data: &'static [u8], size: f32) -> Option<Font> {
        Font::with_variations(data, size, &[])
    }

    /// A variable font at the given axis values (`wght`, `opsz`, …); an axis the font lacks is
    /// skipped.
    pub fn with_variations(data: &'static [u8], size: f32, axes: &[(&[u8; 4], f32)]) -> Option<Font> {
        let mut face = Face::parse(data, 0).ok()?;
        let axes: Vec<([u8; 4], f32)> = axes.iter().map(|(t, v)| (**t, *v)).collect();
        apply_axes(&mut face, &axes);
        let units = size / face.units_per_em() as f32;
        static UID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let uid = UID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Some(Font {
            face,
            data,
            uid,
            generation: 0,
            #[cfg(target_vendor = "apple")]
            typeface: RefCell::new(None),
            #[cfg(target_vendor = "apple")]
            strikes: RefCell::new(Vec::new()),
            size,
            units,
            glyphs: RefCell::new(HashMap::new()),
            axes,
            ui: None,
        })
    }

    /// The size in points.
    pub fn size(&self) -> f32 {
        self.size
    }

    /// This font laid out as UIKit lays out a label ([`match_ui_font`]).
    pub fn with_ui_layout(mut self) -> Font {
        let kern = feature_lookups(self.face.tables().gpos, &[b"kern"]);
        let gsub = feature_lookups(self.face.tables().gsub, &[b"ccmp", b"locl", b"rlig", b"liga", b"calt"]);
        self.ui = Some(UiLayout { tracking: tracking(&self.face, self.size), kern, gsub, shaped: RefCell::new(HashMap::new()) });
        self
    }

    /// Another point size (an animated `fontSize`): the optical size (`opsz`, if it was set)
    /// follows it as Core Text's does, and so do a UIKit font's tracking; outlines are re-read
    /// only when the variation changes.
    pub fn set_size(&mut self, size: f32) {
        if size == self.size {
            return;
        }
        let before = self.face.variation_coordinates().to_vec();
        for axis in &mut self.axes {
            if &axis.0 == b"opsz" {
                axis.1 = size;
            }
        }
        apply_axes(&mut self.face, &self.axes);
        if self.face.variation_coordinates() != before.as_slice() {
            self.glyphs.borrow_mut().clear();
            self.generation += 1;
        }
        self.size = size;
        self.units = size / self.face.units_per_em() as f32;
        if let Some(ui) = self.ui.as_mut() {
            ui.tracking = tracking(&self.face, size);
        }
    }

    /// The tracking a UIKit font adds after each glyph, in points (0 for a Skia font).
    pub fn tracking(&self) -> f32 {
        self.ui.as_ref().map_or(0.0, |ui| ui.tracking * self.units)
    }

    /// The GPOS `kern` adjustment between two characters, in points (0 for a Skia font).
    pub fn kerning(&self, first: char, second: char) -> f32 {
        self.pair(self.glyph(first), self.glyph(second)) * self.units
    }

    /// The pair adjustment (font units) of `first` followed by `second`, as the `kern`
    /// feature's lookups apply it: each lookup in order, its first subtable whose coverage holds
    /// `first` and that has the pair (a class pair always matches), the first glyph's x advance
    /// (plus its variation delta at the font's axes).
    fn pair(&self, first: GlyphId, second: GlyphId) -> f32 {
        let Some(ui) = self.ui.as_ref() else { return 0.0 };
        let Some(gpos) = self.face.raw_face().table(Tag::from_bytes(b"GPOS")) else { return 0.0 };
        let gdef = self.face.tables().gdef;
        let coords = self.face.variation_coordinates();
        let mut total = 0.0;
        for &index in &ui.kern {
            let Some((x, device)) = gpos_pair(gpos, index, first.0, second.0) else { continue };
            // A VariationIndex device: the delta at the font's axes (SF's period + space is
            // −100 with a +100 delta at every weight: 0, as Core Text kerns it).
            let delta = device.and_then(|(outer, inner)| gdef.and_then(|g| g.glyph_variation_delta(outer, inner, coords))).unwrap_or(0.0);
            total += x as f32 + delta;
        }
        total
    }

    /// `getMetrics()`: the font's hhea ascender, descender and line gap, as CoreText reads them
    /// (`CTFontGetAscent` / `Descent` / `Leading`, Skia's on iOS, and UIKit's `UIFont`): not the
    /// OS/2 typo metrics a font's USE_TYPO_METRICS flag asks for (AntDesign, Entypo set it).
    pub fn metrics(&self) -> FontMetrics {
        let t = self.face.tables();
        let typo = t.os2.is_some_and(|o| o.use_typographic_metrics());
        let (asc, desc, gap) = if typo {
            // hhea, with its MVAR deltas (hasc, hdsc, hlgp) at the font's variation.
            let coords = self.face.variation_coordinates();
            let delta = |tag: &[u8; 4]| t.mvar.and_then(|m| m.metric_offset(Tag::from_bytes(tag), coords)).unwrap_or(0.0);
            (t.hhea.ascender as f32 + delta(b"hasc"), t.hhea.descender as f32 + delta(b"hdsc"), t.hhea.line_gap as f32 + delta(b"hlgp"))
        } else {
            (self.face.ascender() as f32, self.face.descender() as f32, self.face.line_gap() as f32)
        };
        FontMetrics { ascent: -asc * self.units, descent: -desc * self.units, leading: gap * self.units }
    }

    /// The line an RN `<Text>` with no `lineHeight` lays out (RN's `NSLayoutManager` has
    /// `usesFontLeading = NO`): ascent + descent, the line gap left out; the baseline is the
    /// ascent below the line's top (measured by exact/parity-tools/text-probe).
    pub fn ui_line_height(&self) -> f32 {
        let m = self.metrics();
        -m.ascent + m.descent
    }

    fn glyph(&self, c: char) -> GlyphId {
        self.face.glyph_index(c).unwrap_or(GlyphId(0))
    }

    /// A glyph's advance in points: hmtx plus its HVAR offset at the font's axes, unrounded.
    fn advance(&self, g: GlyphId) -> f32 {
        let tables = self.face.tables();
        let base = tables.hmtx.and_then(|h| h.advance(g)).map(|a| a as f32);
        let Some(base) = base else { return self.face.glyph_hor_advance(g).unwrap_or(0) as f32 * self.units };
        let offset = tables.hvar.and_then(|h| h.advance_offset(g, self.face.variation_coordinates())).unwrap_or(0.0);
        (base + offset) * self.units
    }

    /// Each glyph of `text` with its pen x: the advances, plus a UIKit font's tracking after
    /// each glyph and kerning between pairs. The pen's end is the returned width.
    fn layout(&self, text: &str, mut f: impl FnMut(GlyphId, f32)) -> f32 {
        let Some(ui) = self.ui.as_ref() else {
            let mut pen = 0.0;
            for c in text.chars() {
                let g = self.glyph(c);
                f(g, pen);
                pen += self.advance(g);
            }
            return pen;
        };
        let mut shaped = ui.shaped.borrow_mut();
        if !shaped.contains_key(text) {
            let mut glyphs: Vec<GlyphId> = text.chars().map(|c| self.glyph(c)).collect();
            substitute(&self.face, &ui.gsub, &mut glyphs);
            shaped.insert(text.to_string(), glyphs);
        }
        let glyphs = &shaped[text];
        let track = self.tracking();
        let mut pen = 0.0;
        for (i, &g) in glyphs.iter().enumerate() {
            f(g, pen);
            pen += self.advance(g) + track;
            if let Some(&next) = glyphs.get(i + 1) {
                pen += self.pair(g, next) * self.units;
            }
        }
        pen
    }

    /// The pen's travel over `text` (`getTextWidth`, the sum of advances; a UIKit font's
    /// tracking and kerning included).
    pub fn advance_width(&self, text: &str) -> f32 {
        self.layout(text, |_, _| {})
    }

    /// `measureText(text)`: the bounds of `text` drawn at the origin (y down), as RN Skia
    /// returns them on iOS: each glyph's Core Text bounds rounded out to whole points and
    /// outset by 1 (its antialiasing margin) about its pen position, unioned. So `width` is
    /// neither the ink's nor the advance's: Helvetica bold 13 "Home" is 37.888 (ink 34.77,
    /// advance 36.12), as the RN app's measureText returns it (read on the simulator).
    pub fn measure_text(&self, text: &str) -> Rect {
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        self.layout(text, |g, pen| {
            if let Some(bb) = self.face.glyph_bounding_box(g) {
                l = l.min(pen + (bb.x_min as f32 * self.units).floor() - 1.0);
                r = r.max(pen + (bb.x_max as f32 * self.units).ceil() + 1.0);
                t = t.min((-(bb.y_max as f32) * self.units).floor() - 1.0);
                b = b.max((-(bb.y_min as f32) * self.units).ceil() + 1.0);
            }
        });
        if l > r {
            return Rect::new(0.0, 0.0, 0.0, 0.0);
        }
        Rect::new(l, t, r - l, b - t)
    }

    /// [`Font::advance_width`] with RN's `letterSpacing` (Core Text's `NSKern`): measured with
    /// Core Text, a non-zero kern keeps the font's tracking and pair kerning and adds `spacing`
    /// after every glyph, the last one included (the line's typographic width).
    pub fn advance_width_spaced(&self, text: &str, spacing: f32) -> f32 {
        let mut n = 0;
        let width = self.layout(text, |_, _| n += 1);
        width + spacing * n as f32
    }
}

/// A GPOS PairPos lookup's adjustment for `first` then `second`, read from the table's bytes
/// (ttf-parser drops value-record device tables, whose offsets are from the PairPos subtable):
/// the first subtable whose coverage holds `first` and that has the pair (a class pair always
/// does), its first value record's x advance and its x-advance VariationIndex device, if any.
fn gpos_pair(gpos: &[u8], lookup: u16, first: u16, second: u16) -> Option<(i16, Option<(u16, u16)>)> {
    let u16_at = |d: &[u8], o: usize| -> Option<u16> { Some(u16::from_be_bytes([*d.get(o)?, *d.get(o + 1)?])) };
    let u32_at = |d: &[u8], o: usize| -> Option<u32> { Some(u32::from_be_bytes([*d.get(o)?, *d.get(o + 1)?, *d.get(o + 2)?, *d.get(o + 3)?])) };
    let coverage = |d: &[u8], g: u16| -> Option<usize> {
        match u16_at(d, 0)? {
            1 => {
                let n = u16_at(d, 2)? as usize;
                (0..n).position(|k| u16_at(d, 4 + 2 * k) == Some(g))
            }
            2 => {
                let n = u16_at(d, 2)? as usize;
                (0..n).find_map(|k| {
                    let o = 4 + 6 * k;
                    let (s, e, i) = (u16_at(d, o)?, u16_at(d, o + 2)?, u16_at(d, o + 4)?);
                    (s <= g && g <= e).then(|| (i + g - s) as usize)
                })
            }
            _ => None,
        }
    };
    let class = |d: &[u8], g: u16| -> u16 {
        let f = || -> Option<u16> {
            match u16_at(d, 0)? {
                1 => {
                    let (start, n) = (u16_at(d, 2)?, u16_at(d, 4)?);
                    if g >= start && g - start < n { u16_at(d, 6 + 2 * (g - start) as usize) } else { Some(0) }
                }
                2 => {
                    let n = u16_at(d, 2)? as usize;
                    Some((0..n).find_map(|k| {
                        let o = 4 + 6 * k;
                        let (s, e, c) = (u16_at(d, o)?, u16_at(d, o + 2)?, u16_at(d, o + 4)?);
                        (s <= g && g <= e).then_some(c)
                    }).unwrap_or(0))
                }
                _ => Some(0),
            }
        };
        f().unwrap_or(0)
    };
    let record_len = |f: u16| 2 * f.count_ones() as usize;
    // A value record at `o` of format `f`, in subtable `sub`: (x advance, x-advance device).
    let value = |sub: &[u8], o: usize, f: u16| -> Option<(i16, Option<(u16, u16)>)> {
        let field = |bit: u16| -> Option<u16> { (f & bit != 0).then(|| u16_at(sub, o + 2 * (f & (bit - 1)).count_ones() as usize)).flatten() };
        let x = field(0x4).unwrap_or(0) as i16;
        let device = field(0x40).filter(|&off| off != 0).and_then(|off| {
            let d = sub.get(off as usize..)?;
            (u16_at(d, 4)? == 0x8000).then(|| Some((u16_at(d, 0)?, u16_at(d, 2)?))).flatten()
        });
        Some((x, device))
    };
    let list = gpos.get(u16_at(gpos, 8)? as usize..)?;
    let lk = list.get(u16_at(list, 2 + 2 * lookup as usize)? as usize..)?;
    let (kind, count) = (u16_at(lk, 0)?, u16_at(lk, 4)? as usize);
    for k in 0..count {
        let mut sub = lk.get(u16_at(lk, 6 + 2 * k)? as usize..)?;
        if kind == 9 {
            if u16_at(sub, 2)? != 2 {
                continue;
            }
            sub = sub.get(u32_at(sub, 4)? as usize..)?;
        } else if kind != 2 {
            continue;
        }
        let Some(at) = coverage(sub.get(u16_at(sub, 2)? as usize..)?, first) else { continue };
        let (f1, f2) = (u16_at(sub, 4)?, u16_at(sub, 6)?);
        match u16_at(sub, 0)? {
            1 => {
                let set = sub.get(u16_at(sub, 10 + 2 * at)? as usize..)?;
                let n = u16_at(set, 0)? as usize;
                let stride = 2 + record_len(f1) + record_len(f2);
                let found = (0..n).find(|&r| u16_at(set, 2 + r * stride) == Some(second));
                if let Some(r) = found {
                    // The record's device offsets are from the PairSet (OpenType 1.9).
                    return value(set, 2 + r * stride + 2, f1);
                }
            }
            2 => {
                let c1 = class(sub.get(u16_at(sub, 8)? as usize..)?, first) as usize;
                let c2 = class(sub.get(u16_at(sub, 10)? as usize..)?, second) as usize;
                let (n1, n2) = (u16_at(sub, 12)? as usize, u16_at(sub, 14)? as usize);
                if c1 >= n1 || c2 >= n2 {
                    continue;
                }
                let stride = record_len(f1) + record_len(f2);
                return value(sub, 16 + (c1 * n2 + c2) * stride, f1);
            }
            _ => {}
        }
    }
    None
}

fn apply_axes(face: &mut Face<'static>, axes: &[([u8; 4], f32)]) {
    for (tag, value) in axes {
        let tag = Tag::from_bytes(tag);
        if let Some(axis) = face.variation_axes().into_iter().find(|a| a.tag == tag) {
            face.set_variation(tag, value.clamp(axis.min_value, axis.max_value));
        }
    }
}

/// The `trak` table's default (0) horizontal track at `size` points, in font units: its
/// per-size values interpolated linearly between the sizes listed, the end values held past
/// them (Apple's tracking table, which Core Text applies to every label).
fn tracking(face: &Face<'static>, size: f32) -> f32 {
    let Some(trak) = face.tables().trak else { return 0.0 };
    let data = trak.horizontal;
    let Some(track) = (0..data.tracks.len()).filter_map(|i| data.tracks.get(i)).find(|t| t.value == 0.0) else { return 0.0 };
    let n = data.sizes.len().min(track.values.len());
    if n == 0 {
        return 0.0;
    }
    let at = |i: u16| (data.sizes.get(i).map_or(0.0, |s| s.0), track.values.get(i).unwrap_or(0) as f32);
    let (s0, v0) = at(0);
    if size <= s0 {
        return v0;
    }
    for i in 1..n {
        let (s1, v1) = at(i);
        let (sa, va) = at(i - 1);
        if size <= s1 {
            // Core Text keeps whole font units, truncated toward zero (measured by
            // exact/parity-tools/text-probe: SF at 26.5 pt tracks 19, not 19.75).
            return (va + (v1 - va) * (size - sa) / (s1 - sa)).trunc();
        }
    }
    at(n - 1).1
}

/// The lookups of `features` in a GSUB or GPOS table for Latin text (script `latn`, else
/// `DFLT`, its default language system), sorted: lookups apply in LookupList order.
fn feature_lookups(table: Option<ttf_parser::opentype_layout::LayoutTable<'_>>, features: &[&[u8; 4]]) -> Vec<u16> {
    let Some(table) = table else { return Vec::new() };
    let script = table.scripts.find(Tag::from_bytes(b"latn")).or_else(|| table.scripts.find(Tag::from_bytes(b"DFLT")));
    let Some(lang) = script.and_then(|s| s.default_language) else { return Vec::new() };
    let mut lookups: Vec<u16> = lang
        .feature_indices
        .into_iter()
        .filter_map(|i| table.features.get(i))
        .filter(|f| features.iter().any(|t| f.tag == Tag::from_bytes(t)))
        .flat_map(|f| f.lookup_indices.into_iter())
        .collect();
    lookups.sort_unstable();
    lookups.dedup();
    lookups
}

/// Whether a lookup with `flags` skips glyph `g` (its GDEF class: base, ligature or mark).
fn skipped(face: &Face<'static>, flags: ttf_parser::opentype_layout::LookupFlags, g: GlyphId) -> bool {
    use ttf_parser::gdef::GlyphClass;
    if !flags.ignore_flags() {
        return false;
    }
    match face.tables().gdef.and_then(|d| d.glyph_class(g)) {
        Some(GlyphClass::Base) => flags.ignore_base_glyphs(),
        Some(GlyphClass::Ligature) => flags.ignore_ligatures(),
        Some(GlyphClass::Mark) => flags.ignore_marks(),
        _ => false,
    }
}

/// GSUB's lookups, in order, over the whole run (OpenType's application: each lookup walks the
/// glyphs from the start; at a glyph, its first subtable that applies does, and the walk
/// continues after what it consumed). Single, multiple, ligature and chained-context lookups
/// (formats 1–3, their nested lookups at their sequence indices); alternates have no default.
fn substitute(face: &Face<'static>, lookups: &[u16], glyphs: &mut Vec<GlyphId>) {
    let Some(gsub) = face.tables().gsub else { return };
    for &index in lookups {
        let Some(lookup) = gsub.lookups.get(index) else { continue };
        let mut i = 0;
        while i < glyphs.len() {
            if skipped(face, lookup.flags, glyphs[i]) {
                i += 1;
                continue;
            }
            i += apply_at(face, &gsub, index, glyphs, i).unwrap_or(1).max(1);
        }
    }
}

/// Lookup `index` at glyph `i`: how many glyphs it consumed, or `None` where nothing applied.
fn apply_at(face: &Face<'static>, gsub: &ttf_parser::opentype_layout::LayoutTable<'static>, index: u16, glyphs: &mut Vec<GlyphId>, i: usize) -> Option<usize> {
    use ttf_parser::gsub::{SingleSubstitution, SubstitutionSubtable};
    use ttf_parser::opentype_layout::ChainedContextLookup;
    let lookup = gsub.lookups.get(index)?;
    let flags = lookup.flags;
    let g = glyphs[i];
    // The glyph positions after / before `i` that the lookup sees.
    let next = |glyphs: &Vec<GlyphId>, from: usize| (from + 1..glyphs.len()).find(|&k| !skipped(face, flags, glyphs[k]));
    let prev = |glyphs: &Vec<GlyphId>, from: usize| (0..from).rev().find(|&k| !skipped(face, flags, glyphs[k]));
    for subtable in lookup.subtables.into_iter::<SubstitutionSubtable>() {
        let Some(at) = subtable.coverage().get(g) else { continue };
        match subtable {
            SubstitutionSubtable::Single(SingleSubstitution::Format1 { delta, .. }) => {
                glyphs[i] = GlyphId((g.0 as i32 + delta as i32) as u16);
                return Some(1);
            }
            SubstitutionSubtable::Single(SingleSubstitution::Format2 { substitutes, .. }) => {
                glyphs[i] = substitutes.get(at)?;
                return Some(1);
            }
            SubstitutionSubtable::Multiple(m) => {
                let seq = m.sequences.get(at)?;
                let subs: Vec<GlyphId> = seq.substitutes.into_iter().collect();
                let n = subs.len();
                glyphs.splice(i..=i, subs);
                return Some(n);
            }
            SubstitutionSubtable::Ligature(l) => {
                let set = l.ligature_sets.get(at)?;
                for lig in set.into_iter() {
                    let mut positions = Vec::with_capacity(lig.components.len() as usize);
                    let mut k = i;
                    let matched = lig.components.into_iter().all(|c| match next(glyphs, k) {
                        Some(n) if glyphs[n] == c => {
                            positions.push(n);
                            k = n;
                            true
                        }
                        _ => false,
                    });
                    if matched {
                        for &p in positions.iter().rev() {
                            glyphs.remove(p);
                        }
                        glyphs[i] = lig.glyph;
                        return Some(1);
                    }
                }
            }
            SubstitutionSubtable::ChainContext(chain) => {
                // The rule's input positions (the first is `i`), when its context matches.
                let mut matched: Option<(Vec<usize>, ttf_parser::LazyArray16<'_, ttf_parser::opentype_layout::SequenceLookupRecord>)> = None;
                match chain {
                    ChainedContextLookup::Format1 { sets, .. } | ChainedContextLookup::Format2 { sets, .. } => {
                        let classes = match chain {
                            ChainedContextLookup::Format2 { backtrack_classes, input_classes, lookahead_classes, .. } => Some((backtrack_classes, input_classes, lookahead_classes)),
                            _ => None,
                        };
                        let set_index = match classes {
                            Some((_, input, _)) => input.get(g),
                            None => at,
                        };
                        let Some(set) = sets.get(set_index) else { continue };
                        'rules: for rule in set.into_iter() {
                            let value = |kind: usize, g: GlyphId| -> u16 {
                                match classes {
                                    Some((b, inp, la)) => [b, inp, la][kind].get(g),
                                    None => g.0,
                                }
                            };
                            let mut positions = vec![i];
                            let mut k = i;
                            for want in rule.input.into_iter() {
                                match next(glyphs, k) {
                                    Some(n) if value(1, glyphs[n]) == want => {
                                        positions.push(n);
                                        k = n;
                                    }
                                    _ => continue 'rules,
                                }
                            }
                            let mut b = i;
                            for want in rule.backtrack.into_iter() {
                                match prev(glyphs, b) {
                                    Some(p) if value(0, glyphs[p]) == want => b = p,
                                    _ => continue 'rules,
                                }
                            }
                            let mut a = k;
                            for want in rule.lookahead.into_iter() {
                                match next(glyphs, a) {
                                    Some(n) if value(2, glyphs[n]) == want => a = n,
                                    _ => continue 'rules,
                                }
                            }
                            matched = Some((positions, rule.lookups));
                            break;
                        }
                    }
                    ChainedContextLookup::Format3 { backtrack_coverages, input_coverages, lookahead_coverages, lookups, .. } => {
                        let mut positions = vec![i];
                        let mut k = i;
                        let mut ok = true;
                        for c in input_coverages.into_iter().skip(1) {
                            match next(glyphs, k) {
                                Some(n) if c.contains(glyphs[n]) => {
                                    positions.push(n);
                                    k = n;
                                }
                                _ => {
                                    ok = false;
                                    break;
                                }
                            }
                        }
                        let mut b = i;
                        for c in backtrack_coverages.into_iter() {
                            if !ok {
                                break;
                            }
                            match prev(glyphs, b) {
                                Some(p) if c.contains(glyphs[p]) => b = p,
                                _ => ok = false,
                            }
                        }
                        let mut a = k;
                        for c in lookahead_coverages.into_iter() {
                            if !ok {
                                break;
                            }
                            match next(glyphs, a) {
                                Some(n) if c.contains(glyphs[n]) => a = n,
                                _ => ok = false,
                            }
                        }
                        if ok {
                            matched = Some((positions, lookups));
                        }
                    }
                }
                let Some((positions, records)) = matched else { continue };
                let consumed = positions.len();
                for record in records.into_iter() {
                    if let Some(&p) = positions.get(record.sequence_index as usize) {
                        apply_at(face, gsub, record.lookup_list_index, glyphs, p);
                    }
                }
                return Some(consumed);
            }
            _ => {}
        }
    }
    None
}

struct Outline {
    b: lyon::path::path::Builder,
    open: bool,
}

impl OutlineBuilder for Outline {
    fn move_to(&mut self, x: f32, y: f32) {
        if self.open {
            self.b.end(false);
        }
        self.b.begin(point(x, y));
        self.open = true;
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.b.line_to(point(x, y));
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.b.quadratic_bezier_to(point(x1, y1), point(x, y));
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.b.cubic_bezier_to(point(x1, y1), point(x2, y2), point(x, y));
    }
    fn close(&mut self) {
        if self.open {
            self.b.end(true);
            self.open = false;
        }
    }
}

/// `matchFont({ fontFamily: "System", fontSize, fontWeight })`: the platform's system UI face
/// (San Francisco on Apple: iOS's `Core/SFUI.ttf`, the Simulator's runtime copy, macOS's
/// `SFNS.ttf`) at `weight` (100…900) and the optical size Core Text picks for `size`. `None`
/// where the file cannot be read (the web, other platforms).
pub fn match_system_font(size: f32, weight: f32) -> Option<Font> {
    let data = system_face()?;
    Font::with_variations(data, size, &[(b"wght", weight), (b"opsz", size)])
}

/// An RN `<Text>` in the system font (`fontSize`, `fontWeight`), as UIKit lays it out: the
/// system face at `weight` and the optical size of `size` ([`match_system_font`]), with the
/// font's tracking for the size, its default GSUB substitutions, and its kerning in the advances
/// ([`Font::with_ui_layout`]). GPOS mark positioning is not applied (the demos' labels have no
/// combining marks: `Ó` is its own glyph). RN maps `fontWeight` to a `UIFontWeight` (`'600'` is
/// `.semibold`), which San Francisco draws at its named instance's `wght`, not at the CSS number:
/// [`ui_weight`].
pub fn match_ui_font(size: f32, weight: f32) -> Option<Font> {
    let data = system_face()?;
    Font::with_variations(data, size, &[(b"wght", ui_weight(weight)), (b"opsz", size)]).map(Font::with_ui_layout)
}

/// The `wght` San Francisco (`SFUI.ttf`'s fvar instances) draws an RN `fontWeight` at: RN's
/// RCTFont maps 100…900 to UIFontWeight ultraLight, thin, light, regular, medium, semibold, bold,
/// heavy, black, whose instances are 30.925, 110.725, 274.315, 400, 510, 590, 700, 860, 1000
/// (a semibold `'600'` drawn at 600 was a hair heavy: expandable-mini-player's "Demo"). Weights
/// between the hundreds interpolate.
pub fn ui_weight(weight: f32) -> f32 {
    const WGHT: [f32; 9] = [30.925, 110.725, 274.315, 400.0, 510.0, 590.0, 700.0, 860.0, 1000.0];
    let k = ((weight / 100.0).clamp(1.0, 9.0)) - 1.0;
    let i = (k.floor() as usize).min(7);
    WGHT[i] + (WGHT[i + 1] - WGHT[i]) * (k - i as f32)
}

fn system_face() -> Option<&'static [u8]> {
    static FACE: std::sync::OnceLock<Option<&'static [u8]>> = std::sync::OnceLock::new();
    *FACE.get_or_init(|| {
        let root = std::env::var("SIMULATOR_ROOT").or_else(|_| std::env::var("IPHONE_SIMULATOR_ROOT")).unwrap_or_default();
        let candidates = [
            format!("{root}/System/Library/Fonts/Core/SFUI.ttf"),
            "/System/Library/Fonts/Core/SFUI.ttf".to_string(),
            "/System/Library/Fonts/CoreUI/SFUI.ttf".to_string(),
            "/System/Library/Fonts/SFNS.ttf".to_string(),
        ];
        candidates.iter().find_map(|p| std::fs::read(p).ok()).map(|bytes| &*Box::leak(bytes.into_boxed_slice()))
    })
}

impl Font {
    /// Each glyph of `text` and its pen x (the layout [`Canvas::draw_text`] places).
    pub(crate) fn glyph_run(&self, text: &str, out: &mut Vec<(u16, f32)>) {
        out.clear();
        self.layout(text, |g, pen| out.push((g.0, pen)));
    }

    /// A glyph's outline (font units, y up), read once.
    fn with_outline(&self, g: u16, f: impl FnOnce(&Path)) {
        let mut glyphs = self.glyphs.borrow_mut();
        let path = glyphs.entry(g).or_insert_with(|| {
            let mut b = Outline { b: Path::builder(), open: false };
            self.face.outline_glyph(GlyphId(g), &mut b)?;
            if b.open {
                b.b.end(false);
            }
            Some(b.b.build())
        });
        if let Some(path) = path {
            f(path);
        }
    }

    /// The variation as `SkTypeface_Mac::MakeFromStream` gives it to CoreText
    /// (`ctvariation_from_SkFontArguments`): none when the font was made without one, else every
    /// axis, at the value asked for pinned to its range, or at its default.
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    pub(crate) fn ct_axes(&self) -> Vec<([u8; 4], f32)> {
        if self.axes.is_empty() {
            return Vec::new();
        }
        self.face
            .variation_axes()
            .into_iter()
            .map(|a| {
                let tag = a.tag.to_bytes();
                let value = self.axes.iter().rev().find(|(t, _)| *t == tag).map_or(a.def_value, |(_, v)| v.clamp(a.min_value, a.max_value));
                (tag, value)
            })
            .collect()
    }

    /// The glyph atlas's name for this font at its current variation.
    #[cfg_attr(not(target_vendor = "apple"), allow(dead_code))]
    pub(crate) fn atlas_key(&self) -> u64 {
        (self.uid << 24) | (self.generation & 0xFF_FFFF)
    }

    /// `f` with the CoreText strike of `key` (made on first use; the last few are kept).
    #[cfg(target_vendor = "apple")]
    pub(crate) fn with_strike<R>(&self, key: crate::glyphs::StrikeKey, text_size: f32, sa: [f32; 4], invertible: bool, f: impl FnOnce(&crate::coretext::Strike) -> R) -> Option<R> {
        let mut strikes = self.strikes.borrow_mut();
        if let Some(i) = strikes.iter().position(|(k, _)| *k == key) {
            if i != 0 {
                let s = strikes.remove(i);
                strikes.insert(0, s);
            }
        } else {
            let mut typeface = self.typeface.borrow_mut();
            if typeface.as_ref().is_none_or(|(g, _)| *g != self.generation) {
                *typeface = Some((self.generation, crate::coretext::Typeface::new(self.data, &self.ct_axes(), self.axes.iter().any(|(t, _)| t == b"opsz"))));
            }
            let strike = typeface.as_ref().and_then(|(_, t)| t.as_ref()).and_then(|t| crate::coretext::Strike::new(t, text_size, sa, invertible));
            strikes.insert(0, (key, strike));
            strikes.truncate(8);
        }
        strikes[0].1.as_ref().map(f)
    }
}

impl Canvas {
    /// `<Text x y text font paint>`: `text` with its baseline's start at (x, y). As Graphite
    /// draws a glyph run ([`crate::glyphs`]): from the glyph atlas below 162 device pixels (where
    /// CoreText rasterises the masks), the glyphs it can't take and larger runs as paths.
    pub fn draw_text(&mut self, text: &str, x: f32, y: f32, font: &Font, paint: &Paint) {
        self.draw_text_spaced(text, x, y, font, paint, 0.0);
    }

    /// [`Canvas::draw_text`] with RN's `letterSpacing` ([`Font::advance_width_spaced`]): `spacing`
    /// added after every glyph, the run drawn as [`Canvas::draw_text`] draws it.
    pub fn draw_text_spaced(&mut self, text: &str, x: f32, y: f32, font: &Font, paint: &Paint, spacing: f32) {
        let mut run = std::mem::take(&mut self.glyph_run);
        font.glyph_run(text, &mut run);
        if spacing != 0.0 {
            for (i, glyph) in run.iter_mut().enumerate() {
                glyph.1 += spacing * i as f32;
            }
        }
        #[cfg(target_vendor = "apple")]
        let paths = self.draw_glyph_masks(&mut run, x, y, font, paint);
        #[cfg(not(target_vendor = "apple"))]
        let paths = true;
        if paths {
            let saved = self.matrix();
            let u = font.units;
            for &(g, pen) in &run {
                font.with_outline(g, |path| {
                    self.set_matrix(Matrix([u, 0.0, 0.0, -u, x + pen, y]).then(saved));
                    self.draw_path(path, paint);
                });
            }
            self.set_matrix(saved);
        }
        self.glyph_run = run;
    }

    /// The direct-mask sub run of a glyph run (`prepare_for_direct_mask_drawing`): one draw, its
    /// glyphs' quads from the atlas. Leaves in `run` the glyphs that are paths and returns
    /// whether there are any.
    #[cfg(target_vendor = "apple")]
    fn draw_glyph_masks(&mut self, run: &mut Vec<(u16, f32)>, x: f32, y: f32, font: &Font, paint: &Paint) -> bool {
        use crate::glyphs::{self, Atlas, Digest, StrikeKey};
        let m = self.state.matrix;
        let xf = crate::graphite::Xf::new(m);
        if !xf.valid() || run.is_empty() {
            run.clear();
            return false;
        }
        let [a, b, c, d, e, f] = m.0;
        let device_size = font.size * glyphs::max_scale([a, c, b, d]);
        // An RN `<Text>` (a UIKit-laid-out font) under a scale and translation: drawn as UIKit
        // draws a label's glyphs.
        let uikit = font.ui.is_some() && b == 0.0 && c == 0.0 && a > 0.0 && d > 0.0 && paint.stroke.is_none();
        // A hairline or stroked run, an SDFT-sized one (not ported yet) or a path-sized one.
        if !uikit && (paint.stroke.is_some() || !(device_size > 0.0) || device_size >= glyphs::MIN_SDFT) {
            return true;
        }
        let post = glyphs::post2x2(&m);
        let Some((text_size, sa, invertible)) = glyphs::compute_matrices(font.size, post) else {
            run.clear();
            return false;
        };
        let smoothing = crate::coretext::smooth_behavior() as u8;
        let (smooth, _, _) = glyphs::scaler_settings(smoothing);
        let lum = if uikit { 0 } else { glyphs::luminance_index(paint, smoothing) };
        let key = StrikeKey { mode: uikit as u8, font: font.atlas_key(), size: font.size.to_bits(), post: post.map(f32::to_bits), lum };
        if uikit {
            return self.draw_uikit_glyphs(run, x, y, font, paint, key, text_size, sa, invertible);
        }
        // positionMatrix = drawMatrix.preTranslate(origin), then postTranslate(½, ½).
        let tx = a * x + c * y + e + 0.5;
        let ty = b * x + d * y + f + 0.5;
        let mut quads = std::mem::take(&mut self.glyph_quads);
        quads.clear();
        let mut bounds = EMPTY;
        let mut paths = 0;
        let epoch = Atlas::with(|atlas| {
            for i in 0..run.len() {
                let (g, pen) = run[i];
                let (px, py) = (a * pen + c * 0.0 + tx, b * pen + d * 0.0 + ty);
                if !(px.is_finite() && py.is_finite()) {
                    continue;
                }
                let digest = atlas.glyph(key, g as u32, &mut |atlas, mask| {
                    font.with_strike(key, text_size, sa, invertible, |strike| {
                        let bounds = strike.bounds(g)?;
                        if bounds.2.max(bounds.3) <= glyphs::TOO_BIG {
                            mask.resize((bounds.2 * bounds.3) as usize, 0);
                            let lut = *atlas.lut(lum);
                            atlas.offscreen.draw(strike, g, bounds, &lut, smooth, mask);
                        }
                        Some(bounds)
                    })
                    .flatten()
                });
                match digest {
                    Digest::Empty => {}
                    Digest::Path => {
                        run[paths] = run[i];
                        paths += 1;
                    }
                    Digest::Mask(slot) => {
                        let (ox, oy) = (px.floor() + slot.left as f32, py.floor() + slot.top as f32);
                        let r = [ox, oy, ox + slot.w as f32, oy + slot.h as f32];
                        bounds = [bounds[0].min(r[0]), bounds[1].min(r[1]), bounds[2].max(r[2]), bounds[3].max(r[3])];
                        quads.push((r, slot));
                    }
                }
            }
            atlas.epoch
        });
        run.truncate(paths);
        self.glyph_quads = quads;
        self.emit_glyph_quads(&xf, paint, bounds, epoch);
        paths > 0
    }

    /// One glyph-run draw of the quads in `glyph_quads` (device bounds `bounds`): the clip
    /// stack, a depth, the paint, a quad per glyph.
    #[cfg(target_vendor = "apple")]
    fn emit_glyph_quads(&mut self, xf: &crate::graphite::Xf, paint: &Paint, bounds: [f32; 4], epoch: u64) {
        let m = self.state.matrix;
        let quads = std::mem::take(&mut self.glyph_quads);
        if !quads.is_empty() {
            self.atlas_epoch = epoch;
            let mut geo = Geo::Path;
            let mut clip = DrawClip::default();
            if self.visit_clips(&mut geo, xf, false, bounds, EMPTY, &mut clip) {
                let depth = self.next_depth();
                self.use_msaa_clips(&clip, depth);
                let paint_index = self.push_paint(paint, clip.analytic.as_ref());
                let to_image = match &paint.shader {
                    Shader::Image { to_image, .. } => Some(m.invert().then(*to_image)),
                    _ => None,
                };
                let start = self.indices.len() as u32;
                for (r, slot) in &quads {
                    let base = self.vertices.len() as u32;
                    for (k, (vx, vy)) in [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3])].into_iter().enumerate() {
                        let u = slot.x + if k == 1 || k == 2 { slot.w } else { 0 };
                        let v = slot.y + if k >= 2 { slot.h } else { 0 };
                        let uv = to_image.map_or(lyon::math::point(0.0, 0.0), |t| t.apply(lyon::math::point(vx, vy)));
                        self.vertices.push(Vertex { pos: [vx, vy], depth, paint: paint_index, color: u | (v << 16), uv: [uv.x, uv.y] });
                    }
                    self.indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
                }
                let end = self.indices.len() as u32;
                self.ops.push(Op::Glyphs { start, end, scissor: clip.scissor });
            }
        }
        self.glyph_quads = quads;
    }

    /// An RN `<Text>` run as UIKit draws it (`NSLayoutManager drawGlyphsForGlyphRange:` into the
    /// text view's backing store, measured on the iOS Simulator by exact/parity-tools/text-probe):
    /// each glyph drawn by CoreGraphics at its device position with the context's default
    /// subpixel positioning and quantization (the x fraction kept to the strike's
    /// [`crate::coretext::Strike::subpixel_levels`], floored; y floored in CoreGraphics'
    /// y-up space, so the baseline rounds down the screen), its coverage as drawn (no Skia
    /// pre-blend). A run's glyphs blend over each other as CoreGraphics' do.
    #[cfg(target_vendor = "apple")]
    #[allow(clippy::too_many_arguments)]
    fn draw_uikit_glyphs(&mut self, run: &mut Vec<(u16, f32)>, x: f32, y: f32, font: &Font, paint: &Paint, key: crate::glyphs::StrikeKey, text_size: f32, sa: [f32; 4], invertible: bool) -> bool {
        use crate::glyphs::{self, Atlas, Digest};
        let m = self.state.matrix;
        let xf = crate::graphite::Xf::new(m);
        let [a, _, _, d, e, f] = m.0;
        let mut quads = std::mem::take(&mut self.glyph_quads);
        quads.clear();
        let mut bounds = EMPTY;
        let mut paths = 0;
        let probe = font.face.glyph_index('H').map(|g| g.0).or_else(|| run.first().map(|r| r.0)).unwrap_or(0);
        let epoch = Atlas::with(|atlas| {
            let levels = font
                .with_strike(key, text_size, sa, invertible, |strike| {
                    if strike.levels.get() == 0 {
                        strike.levels.set(strike.subpixel_levels(probe, &mut atlas.offscreen));
                    }
                    strike.levels.get()
                })
                .unwrap_or(1) as f32;
            let identity: [u8; 256] = std::array::from_fn(|i| i as u8);
            for i in 0..run.len() {
                let (g, pen) = run[i];
                let (px, py) = (a * (x + pen) + e, d * y + f);
                if !(px.is_finite() && py.is_finite()) {
                    continue;
                }
                let (ix, iy) = (px.floor(), py.ceil());
                let sub = ((px - ix) * levels).floor().min(levels - 1.0);
                let digest = atlas.glyph(key, g as u32 | ((sub as u32) << 16), &mut |atlas, mask| {
                    font.with_strike(key, text_size, sa, invertible, |strike| {
                        let b = strike.bounds(g)?;
                        // A subpixel offset reaches up to a pixel further right.
                        let b = (b.0, b.1, b.2 + 1, b.3);
                        if b.2.max(b.3) <= glyphs::TOO_BIG {
                            mask.resize((b.2 * b.3) as usize, 0);
                            atlas.offscreen.draw_at(strike, g, b, &identity, false, Some((sub / levels) as f64), mask);
                        }
                        Some(b)
                    })
                    .flatten()
                });
                match digest {
                    Digest::Empty => {}
                    Digest::Path => {
                        run[paths] = run[i];
                        paths += 1;
                    }
                    Digest::Mask(slot) => {
                        let (ox, oy) = (ix + slot.left as f32, iy + slot.top as f32);
                        let r = [ox, oy, ox + slot.w as f32, oy + slot.h as f32];
                        bounds = [bounds[0].min(r[0]), bounds[1].min(r[1]), bounds[2].max(r[2]), bounds[3].max(r[3])];
                        quads.push((r, slot));
                    }
                }
            }
            atlas.epoch
        });
        run.truncate(paths);
        self.glyph_quads = quads;
        self.emit_glyph_quads(&xf, paint, bounds, epoch);
        paths > 0
    }

}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    /// The face `match_system_font` reads, at a size of one font unit per point (`opsz` given
    /// separately, so the outlines are the text-size ones).
    fn face_at_units(opsz: f32) -> Option<Font> {
        let data = system_face()?;
        let upem = Face::parse(data, 0).ok()?.units_per_em() as f32;
        Font::with_variations(data, upem, &[(b"wght", 400.0), (b"opsz", opsz)]).map(Font::with_ui_layout)
    }

    #[test]
    fn ui_layout_kerns_as_harfbuzz_and_core_text() {
        let Some(font) = face_at_units(17.0) else { return eprintln!("no system font; skipped") };
        // hb-shape --variations=opsz=17,wght=400 --font-size=2048 SFNS.ttf: the advances with
        // GPOS kern applied (no GSUB change for these strings), in font units, rounded as hb
        // prints them. Tracking is per glyph on top, removed here.
        let cases: [(&str, &[i32]); 2] = [
            ("Happiness does not wait", &[1520, 1130, 1250, 1250, 506, 1195, 1170, 1052, 1072, 576, 1258, 1210, 1170, 1072, 576, 1195, 1210, 744, 576, 1556, 1130, 506, 744]),
            ("Ólafur Arnalds", &[1580, 518, 1130, 741, 1195, 780, 576, 1380, 800, 1195, 1130, 518, 1258, 1072]),
        ];
        let track = font.tracking();
        for (text, hb) in cases {
            let mut pens = Vec::new();
            let end = font.layout(text, |_, pen| pens.push(pen));
            pens.push(end);
            for (i, want) in hb.iter().enumerate() {
                let got = pens[i + 1] - pens[i] - track;
                assert!((got - *want as f32).abs() <= 0.5, "{text} #{i}: {got} vs {want}");
            }
        }
        // `Te`: SF's kern, −200 units at the text size.
        assert!((font.kerning('T', 'e') + 200.0).abs() < 1.0, "{}", font.kerning('T', 'e'));
        assert_eq!(font.kerning('H', 'a'), 0.0);
    }

    #[test]
    fn ui_layout_substitutes_as_harfbuzz() {
        // Core Text's default GSUB features (ccmp, locl, rlig, liga, calt): SF raises the colon
        // between digits (colon.uc) and leaves letters alone. Glyph ids from hb-shape
        // --variations=opsz=17,wght=400 --no-glyph-names on SFNS.ttf, which the tests read.
        let Some(font) = face_at_units(17.0) else { return eprintln!("no system font; skipped") };
        if system_face().map(|d| d.len()) != std::fs::metadata("/System/Library/Fonts/SFNS.ttf").ok().map(|m| m.len() as usize) {
            return eprintln!("not macOS's SFNS.ttf; skipped");
        }
        let cases: [(&str, &[u16]); 4] = [
            ("0:22", &[1308, 1778, 1312, 1312]),
            ("12:05 office flow", &[1310, 1312, 1778, 1308, 1316, 3, 816, 708, 708, 739, 656, 676, 3, 708, 772, 816, 945]),
            ("a:b 1:2:3", &[588, 1449, 651, 3, 1310, 1778, 1312, 1778, 1313]),
            ("React Native", &[239, 676, 588, 656, 895, 3, 186, 588, 895, 739, 939, 676]),
        ];
        for (text, want) in cases {
            let mut got = Vec::new();
            font.layout(text, |g, _| got.push(g.0));
            assert_eq!(got, want, "{text}");
        }
        // A Skia font (SkFont's drawText) maps characters only.
        let plain = Font::with_variations(system_face().unwrap(), 17.0, &[(b"opsz", 17.0)]).unwrap();
        let mut got = Vec::new();
        plain.layout("0:22", |g, _| got.push(g.0));
        assert_ne!(got[1], 1778);
    }

    #[test]
    fn ui_tracking_is_apples_table() {
        // The HIG's SF tracking: 14 pt −0.15, 17 pt −0.43, 12 pt 0 (trak's track 0: −22, −52, 0
        // units of 2048 at those sizes), linear between the listed sizes.
        let Some(mut font) = match_ui_font(14.0, 400.0) else { return eprintln!("no system font; skipped") };
        assert!((font.tracking() + 22.0 * 14.0 / 2048.0).abs() < 1e-4, "{}", font.tracking());
        font.set_size(17.0);
        assert!((font.tracking() + 52.0 * 17.0 / 2048.0).abs() < 1e-4, "{}", font.tracking());
        font.set_size(12.0);
        assert!(font.tracking().abs() < 1e-6);
        font.set_size(18.5);
        let units = -52.0 + (-46.0 + 52.0) * (18.5 - 17.0) / 3.0;
        assert!((font.tracking() - units * 18.5 / 2048.0).abs() < 1e-4, "{}", font.tracking());
        // A Skia font has none.
        assert_eq!(match_system_font(14.0, 400.0).unwrap().tracking(), 0.0);
    }

    #[test]
    fn optical_size_follows_the_point_size() {
        let Some(mut font) = match_ui_font(14.0, 400.0) else { return eprintln!("no system font; skipped") };
        // Below the axis's 17 the outlines are the 17 ones: a 12 pt font's 'a' is the 14 pt one
        // scaled; past it they change (Display grows narrower per em).
        let a14 = font.advance('a'.into_glyph(&font)) / 14.0;
        font.set_size(12.0);
        let a12 = font.advance('a'.into_glyph(&font)) / 12.0;
        assert!((a14 - a12).abs() < 1e-6);
        font.set_size(28.0);
        let a28 = font.advance('a'.into_glyph(&font)) / 28.0;
        assert!(a28 < a14 - 1e-3, "{a28} vs {a14}");
    }

    trait IntoGlyph {
        fn into_glyph(self, font: &Font) -> GlyphId;
    }
    impl IntoGlyph for char {
        fn into_glyph(self, font: &Font) -> GlyphId {
            font.glyph(self)
        }
    }
}
