//! Text as `<Text x y text font>` draws it: a [`Font`] (a typeface at a size, `useFont` /
//! `matchFont`) whose glyphs are filled as paths. As Skia's `SkFont`, there is no shaping and
//! no kerning: each character's glyph from the font's cmap, placed at the advance of the last.
//!
//! Glyph outlines are read with ttf-parser (TrueType and CFF, variable fonts at the axis values
//! the font was made with), cached per glyph in font units, and drawn through the canvas's
//! transform, so a glyph is tessellated at the size it lands on screen.

use std::cell::RefCell;
use std::collections::HashMap;

use lyon::math::point;
use lyon::path::Path;
use ttf_parser::{Face, GlyphId, OutlineBuilder, Tag};

use crate::{Canvas, Matrix, Paint, Rect};

/// A typeface at a size: RN Skia's `SkFont`.
pub struct Font {
    face: Face<'static>,
    size: f32,
    /// Font units to points.
    units: f32,
    glyphs: RefCell<HashMap<u16, Option<Path>>>,
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
    /// `useFont(require(file), size)`: the first face of a TrueType/OpenType file.
    pub fn new(data: &'static [u8], size: f32) -> Option<Font> {
        Font::with_variations(data, size, &[])
    }

    /// A variable font at the given axis values (`wght`, `opsz`, …); an axis the font lacks is
    /// skipped.
    pub fn with_variations(data: &'static [u8], size: f32, axes: &[(&[u8; 4], f32)]) -> Option<Font> {
        let mut face = Face::parse(data, 0).ok()?;
        for (tag, value) in axes {
            let tag = Tag::from_bytes(tag);
            if let Some(axis) = face.variation_axes().into_iter().find(|a| a.tag == tag) {
                face.set_variation(tag, value.clamp(axis.min_value, axis.max_value));
            }
        }
        let units = size / face.units_per_em() as f32;
        Some(Font { face, size, units, glyphs: RefCell::new(HashMap::new()) })
    }

    /// The size in points.
    pub fn size(&self) -> f32 {
        self.size
    }

    /// `getMetrics()`, from the font's hhea table (Skia's ascent, descent and leading).
    pub fn metrics(&self) -> FontMetrics {
        FontMetrics {
            ascent: -(self.face.ascender() as f32) * self.units,
            descent: -(self.face.descender() as f32) * self.units,
            leading: self.face.line_gap() as f32 * self.units,
        }
    }

    fn glyph(&self, c: char) -> GlyphId {
        self.face.glyph_index(c).unwrap_or(GlyphId(0))
    }

    fn advance(&self, g: GlyphId) -> f32 {
        self.face.glyph_hor_advance(g).unwrap_or(0) as f32 * self.units
    }

    /// The pen's travel over `text` (`getTextWidth`, the sum of advances).
    pub fn advance_width(&self, text: &str) -> f32 {
        text.chars().map(|c| self.advance(self.glyph(c))).sum()
    }

    /// `measureText(text)`: the ink bounds of `text` drawn at the origin (y down), as Skia
    /// returns them: `width` is the ink's, not the advance's.
    pub fn measure_text(&self, text: &str) -> Rect {
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        let mut pen = 0.0;
        for c in text.chars() {
            let g = self.glyph(c);
            if let Some(bb) = self.face.glyph_bounding_box(g) {
                l = l.min(pen + bb.x_min as f32 * self.units);
                r = r.max(pen + bb.x_max as f32 * self.units);
                t = t.min(-(bb.y_max as f32) * self.units);
                b = b.max(-(bb.y_min as f32) * self.units);
            }
            pen += self.advance(g);
        }
        if l > r {
            return Rect::new(0.0, 0.0, 0.0, 0.0);
        }
        Rect::new(l, t, r - l, b - t)
    }

    /// Every glyph of `text` with its pen x, its outline (font units, y up) handed to `f`.
    fn each(&self, text: &str, mut f: impl FnMut(f32, &Path)) {
        let mut glyphs = self.glyphs.borrow_mut();
        let mut pen = 0.0;
        for c in text.chars() {
            let g = self.glyph(c);
            let path = glyphs.entry(g.0).or_insert_with(|| {
                let mut b = Outline { b: Path::builder(), open: false };
                self.face.outline_glyph(g, &mut b)?;
                if b.open {
                    b.b.end(false);
                }
                Some(b.b.build())
            });
            if let Some(path) = path {
                f(pen, path);
            }
            pen += self.advance(g);
        }
    }
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

impl Canvas {
    /// `<Text x y text font paint>`: `text` with its baseline's start at (x, y).
    pub fn draw_text(&mut self, text: &str, x: f32, y: f32, font: &Font, paint: &Paint) {
        let saved = self.matrix();
        let u = font.units;
        font.each(text, |pen, path| {
            self.set_matrix(Matrix([u, 0.0, 0.0, -u, x + pen, y]).then(saved));
            self.draw_path(path, paint);
        });
        self.set_matrix(saved);
    }
}
