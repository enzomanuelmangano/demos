//! The article's column of titled sections, laid out and drawn the way UIKit lays out and draws
//! text, so every line sits on a device pixel.
//!
//! - A section is a title and a description, word-wrapped at the content width. Lines are the
//!   font's line height apart, each baseline on the next device pixel down.
//! - Each text box is ceiled to a whole device pixel, so every box starts on one.
//! - The column's total height is posted once as `height:<pt>`, so the scroll view sizes to it.
//!
//! Input: the content width.
//!
//! `meter` is the pill's percentage and progress bar, drawn from the scroll offset and the scroll
//! range: the bar is never a scroll-driven animation, which the host resets while the content is
//! past its end.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use draw2d::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// The article: (title, description) per section.
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

/// Title and description font sizes, in points.
const TITLE_SIZE: f32 = 20.0;
const DESCRIPTION_SIZE: f32 = 14.0;
/// Gap below a title, and between sections, in points.
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

/// A text's measured side, ceiled to the device pixel after an epsilon.
fn text_side(v: f32, s: f32) -> f32 {
    ((v + 0.001) * s).ceil() / s
}

/// One Text: its lines (byte ranges) and its box height in device pixels.
fn text_box<'a>(font: &Font, text: &'a str, width: f32, s: f32) -> (Vec<&'a str>, i64) {
    let lines: Vec<&str> = gfx::wrap(font, text, width).into_iter().map(|(a, b)| &text[a..b]).collect();
    let h = (text_side(lines.len() as f32 * gfx::line_height(font), s) * s).round() as i64;
    (lines, h)
}

/// Each text's top, lines and font (0 title, 1 description), and the column's height. Sums
/// are kept in device pixels, so every edge is a whole pixel.
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
    Some((draw2d::match_ui_font(TITLE_SIZE, 700.0)?, draw2d::match_ui_font(DESCRIPTION_SIZE, 400.0)?))
}

impl Surface for ScrollProgressText {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.width = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
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

/// The meter's label column, the bar's share of the row and its height, in points.
const LABEL_WIDTH: f32 = 50.0;
const BAR_SHARE: f32 = 0.7;
const BAR_HEIGHT: f32 = 5.0;
const LABEL_SIZE: f32 = 15.0;
const LABEL_LINE: f32 = 18.0;

/// How far through the scroll, 0 to 1: the same clamp whatever the offset, so a bounce past the end
/// holds 1 and a pull past the top holds 0.
pub fn progress(offset: f32, range: f32) -> f32 {
    if range.is_finite() && range > 0.0 && offset.is_finite() {
        (offset / range).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// The percentage the label shows, the nearest whole one.
pub fn percent(progress: f32) -> u32 {
    (progress * 100.0).round() as u32
}

/// The fill's width in points for a track of `track` points.
pub fn fill_width(progress: f32, track: f32) -> f32 {
    track * progress
}

/// The meter surface: inputs are the scroll offset and the scroll range (content less viewport), in points.
pub fn meter() -> Box<dyn Surface> {
    Box::new(Meter::default())
}

#[derive(Default)]
struct Meter {
    offset: f32,
    range: f32,
    font: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Surface for Meter {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.offset = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        self.range = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let p = progress(self.offset, self.range);
        Some(format!("{{\"progress\":{p},\"percent\":{}}}", percent(p)))
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
        if self.font.is_none() {
            self.font = draw2d::match_ui_font(LABEL_SIZE, 400.0);
        }
        let Some(font) = self.font.as_ref() else { return false };
        let p = progress(self.offset, self.range);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        // The label and the bar sit as a centred row, the bar a share of the row's width.
        let track = BAR_SHARE * frame.width;
        let x0 = ((frame.width - LABEL_WIDTH - track) / 2.0).max(0.0);
        let label = format!("{}%", percent(p));
        let lh = gfx::line_height(font);
        let top = (frame.height - LABEL_LINE) / 2.0 + (LABEL_LINE - lh) / 2.0;
        let text_x = x0 + (LABEL_WIDTH - font.measure_text(&label).width) / 2.0;
        c.draw_text(&label, text_x, gfx::baseline(font, top), font, &Paint::fill(Color::hex(0x9E9E9E)));
        let (bx, by) = (x0 + LABEL_WIDTH, (frame.height - BAR_HEIGHT) / 2.0);
        c.draw_continuous_rrect(bx, by, track, BAR_HEIGHT, BAR_HEIGHT / 2.0, &Paint::fill(Color::hex(0x1A1A1A)));
        c.save();
        c.clip_continuous_rrect(bx, by, track, BAR_HEIGHT, BAR_HEIGHT / 2.0);
        c.draw_rect(bx, by, fill_width(p, track), BAR_HEIGHT, &Paint::fill(Color::hex(0x9E9E9E)));
        c.restore();
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_column_measures_as_yoga_lays_it_out() {
        let Some(f) = fonts() else { return eprintln!("no system font; skipped") };
        // A 420 pt screen less 32 pt of padding on each side, at 3×.
        let (texts, height) = layout(&f, 356.0, 3.0);
        assert_eq!(texts.len(), 30);
        for (top, lines, k) in &texts {
            assert!(((top * 3.0) - (top * 3.0).round()).abs() < 1e-3, "every Text starts on a pixel: {top}");
            assert!(!lines.is_empty());
            if *k == 0 {
                assert_eq!(lines.len(), 1, "{lines:?}");
            }
        }
        // Four description lines, ceiled to whole pixels.
        assert!((text_side(4.0 * 16.70703125, 3.0) - 67.0).abs() < 1e-4);
        // Font metrics differ by host, so the height is only checked to a range.
        assert!(height > 1500.0 && height < 2500.0, "{height}");
    }

    #[test]
    fn the_bar_follows_the_clamped_offset() {
        // Below the top, the top, the middle, the end, past the end: never empty at the end.
        let range = 1000.0;
        let track = 118.3;
        for (offset, want) in [(-40.0, 0.0), (0.0, 0.0), (500.0, 0.5), (999.0, 0.999), (1000.0, 1.0), (1001.0, 1.0), (1060.0, 1.0), (1e9, 1.0)] {
            let p = progress(offset, range);
            assert_eq!(p, want, "offset {offset}");
            assert!((fill_width(p, track) - track * want).abs() < 1e-4);
        }
        assert_eq!(fill_width(progress(1060.0, range), track), track);
        assert_eq!(fill_width(progress(-40.0, range), track), 0.0);
        // A degenerate range or a broken offset reads as the start.
        assert_eq!(progress(10.0, 0.0), 0.0);
        assert_eq!(progress(f32::NAN, range), 0.0);
        assert_eq!((percent(0.0), percent(0.5), percent(0.995), percent(1.0)), (0, 50, 100, 100));
    }

    fn meter_frame() -> Frame {
        Frame { width: 169.0, height: 18.0, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    /// Light pixels of the bar's row, as (first, last) device x of the fill, or None when empty.
    fn fill_span(img: &exact_gpu::fixture::Pixels) -> Option<(u32, u32)> {
        let y = img.height / 2;
        let xs: Vec<u32> = (0..img.width).filter(|&x| img.at(x, y)[0] > 0x60 && img.at(x, y)[3] > 200).collect();
        // The label's pixels are left of the bar; keep what starts at or after the label column.
        let bar_from = (LABEL_WIDTH * 3.0) as u32;
        let xs: Vec<u32> = xs.into_iter().filter(|&x| x >= bar_from + 30).collect();
        Some((*xs.first()?, *xs.last()?))
    }

    #[test]
    fn the_bar_draws_at_the_start_the_middle_and_past_the_end() {
        let gpu = match exact_gpu::fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = meter();
        let mut spans = Vec::new();
        for (name, offset) in [("0", 0.0), ("50", 500.0), ("100", 1000.0), ("bounce", 1060.0), ("top-pull", -40.0)] {
            s.bind(&[Value::Number(offset), Value::Number(1000.0)], None).unwrap();
            let (img, _) = exact_gpu::fixture::render(&gpu, s.as_mut(), &meter_frame()).unwrap();
            gfx::save_over(&img, &format!("scroll-progress-meter-{name}"), [46, 45, 46]);
            spans.push(fill_span(&img));
        }
        assert_eq!(spans[0], None, "empty at 0");
        let mid = spans[1].expect("half full");
        let full = spans[2].expect("full at 100");
        assert_eq!(spans[3], Some(full), "a bounce past the end draws the same full bar");
        assert_eq!(spans[4], None, "a pull past the top draws the same empty bar");
        // The track starts at 150 + x0 device px; the half fill ends at half of it.
        let track = (BAR_SHARE * 169.0 * 3.0) as u32;
        assert!(full.1 - full.0 + 30 + 3 >= track - 8, "full width {full:?} of {track}");
        let half = (mid.1 + 1 - 150 - ((169.0 - 50.0 - BAR_SHARE * 169.0) / 2.0 * 3.0) as u32) as f32 / track as f32;
        assert!((half - 0.5).abs() < 0.03, "{half}");
        assert_eq!(s.agent("{}").unwrap(), "{\"progress\":0,\"percent\":0}");
    }
}
