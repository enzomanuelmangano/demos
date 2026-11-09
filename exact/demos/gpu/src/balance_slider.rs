//! Balance Slider (src/animations/balance-slider: index.tsx, components/balance-slider,
//! text-label): a row 50 tall and `width` wide (the window's 0.9) of two boxes (#44220C, #363636,
//! radius 5) split by a picker (5% of the width, a white pill a quarter of it wide and 80% of its
//! height), the labels COFFEE / MILK and their percentages over them in FiraCode Medium 16.
//!
//! - x starts at (width + pickerWidth) × 0.5. A finger down anywhere on the row springs it to
//!   x + pickerWidth / 2 (withSpring, Reanimated 4's default, overshootClamping); the pan's
//!   updates put it there.
//! - xPercentage = clamp((x − pickerWidth / 2) / width, 0, 1); the left box is
//!   xPercentage × 0.95 of the width, the right box the rest past the picker.
//! - Past 0.33 or 0.72 (leftPercentageLimitBeforeShift / rightPercentageLimitBeforeShift) the
//!   boxes and the picker spring to 30% of the height (withSpring, the default) and the labels
//!   rise by height / 5 (withSpring of their translateY, −height / 2 + 10 at rest).
//! - Each label row sits at the row's bottom, 8 pt in from its side: the label, and the
//!   percentage (`${round(p × 100)}%`) in a 44 pt box 4 pt away, aligned toward the label's
//!   side. A ReText is a TextInput: one line of the font's height (ascent + descent), its
//!   baseline an ascent below its top.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Spring, GENTLE};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// height.
const HEIGHT: f32 = 50.0;
/// PICKER_WIDTH_PERCENTAGE.
const PICKER: f32 = 0.05;
const LEFT_LIMIT: f64 = 0.33;
const RIGHT_LIMIT: f64 = 0.72;
/// styles.text: fontSize.
const FONT_SIZE: f32 = 16.0;
/// styles.percentage: width, marginHorizontal.
const PERCENT_WIDTH: f32 = 44.0;
const PERCENT_MARGIN: f32 = 4.0;
static FIRA_CODE_MEDIUM: &[u8] = include_bytes!("../fonts/fira-code-medium.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let base = (-HEIGHT / 2.0 + 10.0) as f64;
    Box::new(BalanceSlider {
        font: Font::new(FIRA_CODE_MEDIUM, FONT_SIZE),
        percents: (0..=100).map(|p| format!("{p}%")).collect(),
        box_height: Spring::at(1.0),
        label_y: Spring::at(base),
        x: None,
        ..Default::default()
    })
}

#[derive(Default)]
struct BalanceSlider {
    /// The row, in points.
    size: (f32, f32),
    font: Option<Font>,
    /// "0%" … "100%".
    percents: Vec<String>,
    pan: PanGesture,
    x: Option<Spring>,
    box_height: Spring,
    /// The labels' translateY (both share it: the same `shifted`).
    label_y: Spring,
    canvas: Canvas,
    renderer: Renderer,
}

impl BalanceSlider {
    fn width(&self) -> f32 {
        self.size.0
    }
    fn picker_width(&self) -> f32 {
        self.width() * PICKER
    }
    fn x(&mut self) -> &mut Spring {
        let start = ((self.width() + self.picker_width()) * 0.5) as f64;
        self.x.get_or_insert_with(|| Spring::at(start))
    }
    fn x_percentage(&self) -> f64 {
        let x = self.x.as_ref().map_or(0.0, |x| x.value);
        ((x - self.picker_width() as f64 / 2.0) / self.width() as f64).clamp(0.0, 1.0)
    }
    /// hasReachedBoundaries, and what follows it.
    fn update_shift(&mut self) {
        let p = self.x_percentage();
        // xPercentage < 0.33 || xPercentage > 0.72.
        let shifted = !(LEFT_LIMIT..=RIGHT_LIMIT).contains(&p);
        self.box_height.retarget(if shifted { 0.3 } else { 1.0 }, GENTLE);
        let base = (-HEIGHT / 2.0 + 10.0) as f64;
        self.label_y.retarget(if shifted { base - (HEIGHT / 5.0) as f64 } else { base }, GENTLE);
    }
}

impl Surface for BalanceSlider {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let p = self.x_percentage();
        Some(format!("{{\"left\":{},\"right\":{},\"held\":{}}}", (p * 100.0).round(), ((1.0 - p) * 100.0).round(), self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let on_row = (0.0..=self.size.0).contains(&x) && (0.0..=self.size.1).contains(&y);
        let half = (self.picker_width() / 2.0) as f64;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, on_row) {
            Event::Begin { x, .. } => {
                let spring = self.x();
                let velocity = spring.velocity;
                spring.to_clamped(x as f64 + half, velocity, GENTLE);
            }
            Event::Start(p) | Event::Update(p) => self.x().set(p.x as f64 + half),
            _ => {}
        }
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
        self.size = (frame.width, frame.height);
        let now = frame.now_ms;
        let mut moving = self.x().step(now);
        self.update_shift();
        moving |= self.box_height.step(now) | self.label_y.step(now);

        let (w, h) = (self.width(), HEIGHT);
        let pw = self.picker_width();
        let p = self.x_percentage();
        let ui = (p * (1.0 - PICKER as f64)) as f32;
        let bh = self.box_height.value as f32 * h;
        let top = h - bh;
        let left_w = ui * w;
        let right_w = (1.0 - ui - PICKER) * w;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.draw_rrect(0.0, top, left_w, bh, 5.0, &Paint::fill(Color::hex(0x44220C)));
        // The pill: pickerWidth / 4 wide, 80% of the picker's height, centred; radius 50 (a
        // capsule once clamped).
        let (pill_w, pill_h) = (pw / 4.0, 0.8 * bh);
        c.draw_rrect(left_w + (pw - pill_w) / 2.0, top + (bh - pill_h) / 2.0, pill_w, pill_h, 50.0, &Paint::fill(Color::WHITE));
        c.draw_rrect(left_w + pw, top, right_w, bh, 5.0, &Paint::fill(Color::hex(0x363636)));

        if let Some(font) = self.font.as_ref() {
            let m = font.metrics();
            // The row's bottom at the container's (the row's bottom, translated), one line tall.
            let bottom = h + self.label_y.value as f32;
            let baseline = bottom - (m.descent + m.leading);
            let left_pct = &self.percents[(p * 100.0).round() as usize];
            let right_pct = &self.percents[((1.0 - p) * 100.0).round() as usize];
            let label = font.advance_width("COFFEE");
            c.draw_text("COFFEE", 8.0, baseline, font, &Paint::fill(Color::hex(0x964D20)));
            c.draw_text(left_pct, 8.0 + label + PERCENT_MARGIN, baseline, font, &Paint::fill(Color::hex(0xE37C33)));
            let milk = font.advance_width("MILK");
            let milk_x = w - 8.0 - milk;
            c.draw_text("MILK", milk_x, baseline, font, &Paint::fill(Color::hex(0x999898)));
            let pct_right = milk_x - PERCENT_MARGIN;
            debug_assert!(PERCENT_WIDTH >= font.advance_width("100%"));
            c.draw_text(right_pct, pct_right - font.advance_width(right_pct), baseline, font, &Paint::fill(Color::hex(0xF8F8F8)));
        }
        let (px, py) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, px, py, wgpu::Color::TRANSPARENT);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn dragging_moves_the_split_and_shrinks_past_the_limits() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // The window 420 wide: the row 378.
        let frame = |now_ms| Frame { width: 378.0, height: 50.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("balance-rest");
        assert!(!animating);
        assert_eq!(s.agent("{}").unwrap(), "{\"left\":50,\"right\":50,\"held\":false}");
        // Full height: the left box from x 0 to 179.55 (0.5 × 0.95 × 378), the picker after it.
        assert_eq!(&rest.at(20, 96)[..3], &[0x44, 0x22, 0x0C]);
        assert_eq!(&rest.at(2 * 365, 4)[..3], &[0x36, 0x36, 0x36]);
        assert_eq!(&rest.at(2 * 189, 50)[..3], &[255, 255, 255]);

        // Drag to 20%: the boxes drop to 30% of the height and the labels rise.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 25.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 189.0, 0.0));
        let mut ms = 0.0;
        for k in 1..=20 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 189.0 - (189.0 - 0.2 * 378.0) * k as f32 / 20.0, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        s.input(&pointer(PointerPhase::Up, 0.2 * 378.0, ms));
        while ms < 2000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (shifted, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        shifted.save("balance-shifted");
        assert!(!animating);
        assert_eq!(s.agent("{}").unwrap(), "{\"left\":20,\"right\":80,\"held\":false}");
        // The right box is 15 pt tall now: empty above 35.
        assert_eq!(shifted.at(2 * 300, 2 * 33)[3], 0);
        assert_eq!(&shifted.at(2 * 300, 2 * 45)[..3], &[0x36, 0x36, 0x36]);
    }
}
