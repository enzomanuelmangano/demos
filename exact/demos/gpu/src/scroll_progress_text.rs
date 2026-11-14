//! Scroll Progress's article (src/animations/scroll-progress: index.tsx renderSection,
//! constants.ts sections): the sections' column inside the ScrollView, drawn as UIKit lays and
//! draws its Texts, so every line sits on RN's pixel (the host rounds a text's lines 2+ to the
//! nearest pixel from its snapped origin; CoreGraphics puts each line's baseline on the next
//! device pixel down).
//!
//! - A section (styles.textContainer, marginBottom 20): the title (#EEE, SF 20 bold, marginBottom
//!   10), then the description (#999, SF 14). No lineHeight: TextKit's lines are UIFont.lineHeight
//!   apart (SF's hhea ascent + descent, unrounded: 23.8671875 at 20, 16.70703125 at 14), the
//!   first baseline an ascent below the box's top, each drawn on the next device pixel down.
//! - Yoga: each Text's height is its lines' height ceiled to the device pixel after an epsilon
//!   (RCTTextLayoutManager), so every box starts on a whole pixel; word wrapping at the content
//!   width (`gfx::wrap`, TextKit's).
//! - The column's height (the sum, each section's margin included) is posted once as
//!   `height:<pt>` for the Contract to size the canvas: the scroll's content then measures as RN's.
//!
//! Input: the content width (the screen less paddingHorizontal 32 × 2).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// constants.ts sections: (title, description).
pub const SECTIONS: [(&str, &str); 15] = [
    ("Introduction", "Chess openings are the first few moves of a chess game. There are many different chess openings, and each one has its own set of ideas and strategies. Here are some of the most popular chess openings:"),
    ("The Ruy Lopez", "his opening is named after the 16th-century Spanish bishop Ruy López de Segura. It starts with the moves 1.e4 e5 2.Nf3 Nc6 3.Bb5, and it is known for its focus on controlling the center of the board and attacking the black king."),
    ("The Sicilian Defense", "The Sicilian Defense: This opening is the most popular choice for Black, and it starts with the move 1.e4 c5. It is known for its aggressive nature and the many tactical possibilities it offers."),
    ("The French Defense", "This opening is named after the French chess master André Danican Philidor, who popularized it in the 18th century. It starts with the moves 1.e4 e6, and it is known for its solid and defensive nature."),
    ("The Italian Game", "This opening starts with the moves 1.e4 e5 2.Nf3 Nc6 3.Bc4, and it is known for its focus on rapid development and control of the center."),
    ("The Caro-Kann Defense", "This opening is named after the Austrian chess master Rudolf Spielmann, who popularized it in the 19th century. It starts with the moves 1.e4 c6, and it is known for its focus on controlling the center of the board."),
    ("The Queen’s Gambit", "This opening is named after the 16th-century English queen Elizabeth I, who was known for her love of chess. It starts with the moves 1.d4 d5 2.c4, and it is known for its focus on controlling the center of the board."),
    ("The Nimzo-Indian Defense", "This opening is named after the Indian chess master Aron Nimzowitsch, who popularized it in the 20th century. It starts with the moves 1.d4 Nf6 2.c4 e6, and it is known for its focus on controlling the center of the board."),
    ("The King’s Gambit", "This opening is named after the 16th-century English king Henry VIII, who was known for his love of chess. It starts with the moves 1.e4 e5 2.f4, and it is known for its focus on controlling the center of the board."),
    ("The King’s Indian Attack", "This opening is named after the 16th-century Indian king Shivaji, who was known for his love of chess. It starts with the moves 1.d4 Nf6 2.c4 g6, and it is known for its focus on controlling the center of the board."),
    ("The Queen’s Indian Defense", "This opening is named after the 16th-century Indian queen Rani Lakshmibai, who was known for her love of chess. It starts with the moves 1.d4 Nf6 2.c4 e6, and it is known for its focus on controlling the center of the board."),
    ("The Grünfeld Defense", "This opening is named after the 16th-century German chess master Samuel Loyd, who was known for his love of chess. It starts with the moves 1.d4 Nf6 2.c4 g6, and it is known for its focus on controlling the center of the board."),
    ("The Benoni Defense", "This opening is named after the 16th-century South African chess master Benoni, who was known for his love of chess. It starts with the moves 1.d4 Nf6 2.c4 c5, and it is known for its focus on controlling the center of the board."),
    ("The English Opening", "This opening is named after the 16th-century English chess master, who was known for his love of chess. It starts with the moves 1.c4 e5, and it is known for its focus on controlling the center of the board."),
    ("The Four Knights Game", "This opening is named after the 16th-century English chess master, who was known for his love of chess. It starts with the moves 1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6, and it is known for its focus on controlling the center of the board."),
];

/// styles.title fontSize, 'bold'; styles.description fontSize.
const TITLE_SIZE: f32 = 20.0;
const DESCRIPTION_SIZE: f32 = 14.0;
/// styles.title marginBottom, styles.textContainer marginBottom.
const TITLE_GAP: f32 = 10.0;
const SECTION_GAP: f32 = 20.0;

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ScrollProgressText::default())
}

#[derive(Default)]
struct ScrollProgressText {
    width: f32,
    fonts: Option<(Font, Font)>,
    /// The scale and width the column was laid out and drawn at.
    drawn: Option<(f32, f32, u32)>,
    /// The column's height posted last.
    posted_height: Option<f32>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

/// RCTTextLayoutManager's measured side (internal_roundTextMeasurementToPixelGrid).
fn text_side(v: f32, s: f32) -> f32 {
    ((v + 0.001) * s).ceil() / s
}

/// One Text: its lines (byte ranges) and its box height in device pixels.
fn text_box<'a>(font: &Font, text: &'a str, width: f32, s: f32) -> (Vec<&'a str>, i64) {
    let lines: Vec<&str> = gfx::wrap(font, text, width).into_iter().map(|(a, b)| &text[a..b]).collect();
    let h = (text_side(lines.len() as f32 * gfx::line_height(font), s) * s).round() as i64;
    (lines, h)
}

/// The column's layout at `width` and scale `s`: per Text its top, lines and font (0 title,
/// 1 description); and the column's height. Every edge is a whole device pixel (the margins
/// are whole points), so the sums are kept in pixels.
fn layout<'a>(fonts: &(Font, Font), width: f32, s: f32) -> (Vec<(f32, Vec<&'a str>, usize)>, f32) {
    let mut out = Vec::with_capacity(2 * SECTIONS.len());
    let px = |v: f32| (v * s).round() as i64;
    let mut y = 0i64;
    for (title, description) in SECTIONS {
        let (lines, h) = text_box(&fonts.0, title, width, s);
        out.push((y as f32 / s, lines, 0));
        y += h + px(TITLE_GAP);
        let (lines, h) = text_box(&fonts.1, description, width, s);
        out.push((y as f32 / s, lines, 1));
        y += h + px(SECTION_GAP);
    }
    (out, y as f32 / s)
}

fn fonts() -> Option<(Font, Font)> {
    Some((skia::match_ui_font(TITLE_SIZE, 700.0)?, skia::match_ui_font(DESCRIPTION_SIZE, 400.0)?))
}

impl Surface for ScrollProgressText {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.width = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"width\":{},\"height\":{}}}", self.width, self.posted_height.unwrap_or(0.0)))
    }

    fn render(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        if self.fonts.is_none() {
            self.fonts = fonts();
        }
        let Some(fonts) = self.fonts.as_ref() else { return false };
        let s = frame.scale;
        let width = if self.width > 0.0 { self.width } else { frame.width };
        let (texts, height) = layout(fonts, width, s);
        if self.posted_height != Some(height) {
            self.posted_height = Some(height);
            self.posted.push(format!("height:{height}"));
        }
        let c = &mut self.canvas;
        c.begin(s);
        let paints = [Paint::fill(Color::hex(0xEEEEEE)), Paint::fill(Color::hex(0x999999))];
        for (top, lines, k) in &texts {
            let font = if *k == 0 { &fonts.0 } else { &fonts.1 };
            let lh = gfx::line_height(font);
            for (i, line) in lines.iter().enumerate() {
                c.draw_text(line, 0.0, gfx::baseline(font, top + i as f32 * lh), font, &paints[*k]);
            }
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        self.drawn = Some((s, width, frame.shader_generation));
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_column_measures_as_yoga_lays_it_out() {
        let Some(f) = fonts() else { return eprintln!("no system font; skipped") };
        // iPhone Air: 420 − 64 wide, 3×.
        let (texts, height) = layout(&f, 356.0, 3.0);
        assert_eq!(texts.len(), 30);
        for (top, lines, k) in &texts {
            assert!(((top * 3.0) - (top * 3.0).round()).abs() < 1e-3, "every Text starts on a pixel: {top}");
            assert!(!lines.is_empty());
            if *k == 0 {
                assert_eq!(lines.len(), 1, "{lines:?}");
            }
        }
        // A description's lines: TextKit's 16.707 apart, the box ceiled (4 lines: 66.83 → 67).
        assert!((text_side(4.0 * 16.70703125, 3.0) - 67.0).abs() < 1e-4);
        // (The Mac's SF has other metrics than iOS's: on the simulator the column is 1931.667 tall,
        // the Contract's default.)
        assert!(height > 1500.0 && height < 2500.0, "{height}");
    }
}
