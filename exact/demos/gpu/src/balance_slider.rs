//! Balance slider: a row of two boxes, COFFEE and MILK, split by a picker the finger drags. Each
//! label shows its side's percentage.
//!
//! - The split is the picker's position as a fraction of the row, clamped to 0…1. The boxes take
//!   the split, with the picker between them.
//! - Past 0.33 or 0.72 the boxes shrink to 30% of the height and the labels rise. The change is
//!   a spring, not a snap.
//! - The labels are text inputs: one line tall, with their baselines an ascent below the top.
//!
//! Haptics: a light impact when the pan takes the row, so a tap plays none. A selection when the
//! split crosses 0.33 or 0.72 going out, and none on the way back. A rigid impact when it reaches
//! an end. No two haptics are posted within HAPTIC_GAP_MS.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture};
use motion::{Spring, GENTLE};
use draw2d::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// Row height, points.
const HEIGHT: f32 = 50.0;
/// Picker width as a fraction of the row.
const PICKER: f32 = 0.05;
const LEFT_LIMIT: f64 = 0.33;
const RIGHT_LIMIT: f64 = 0.72;
/// Label font size, points.
const FONT_SIZE: f32 = 16.0;
/// Percentage box width, points.
const PERCENT_WIDTH: f32 = 44.0;
const PERCENT_MARGIN: f32 = 4.0;
/// The shortest gap between two haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far from an end the split re-arms its limit haptic.
const END_REARM: f64 = 0.02;
/// How far back inside the limits the split goes before a new crossing plays again.
const REARM: f64 = 0.03;
static FIRA_CODE_MEDIUM: &[u8] = include_bytes!("../fonts/fira-code-medium.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BalanceSlider::new())
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
    /// The labels' translateY, shared by both.
    label_y: Spring,
    /// The limit's selection played and is not re-armed yet; the split is at an end.
    felt_shifted: bool,
    at_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

impl BalanceSlider {
    fn new() -> BalanceSlider {
        let base = (-HEIGHT / 2.0 + 10.0) as f64;
        BalanceSlider {
            font: Font::new(FIRA_CODE_MEDIUM, FONT_SIZE).map(Font::with_ui_layout),
            percents: (0..=100).map(|p| format!("{p}%")).collect(),
            box_height: Spring::at(1.0),
            label_y: Spring::at(base),
            x: None,
            haptic_at: f64::NEG_INFINITY,
            ..Default::default()
        }
    }
    /// Posts `kind` unless another haptic played under HAPTIC_GAP_MS ago.
    fn haptic(&mut self, kind: &str, at_ms: f64) {
        if at_ms - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push(format!("haptic:{kind}"));
            self.haptic_at = at_ms;
        }
    }
    /// The split's detents and ends, felt where it is now.
    fn feel(&mut self, at_ms: f64) {
        if self.width() <= 0.0 || self.x.is_none() {
            return;
        }
        let p = self.x_percentage();
        let shifted = !(LEFT_LIMIT..=RIGHT_LIMIT).contains(&p);
        let end = p <= 0.0 || p >= 1.0;
        if end && !self.at_end {
            self.haptic("impact-rigid", at_ms);
        } else if shifted && !self.felt_shifted {
            self.haptic("selection", at_ms);
        }
        if shifted {
            self.felt_shifted = true;
        } else if p > LEFT_LIMIT + REARM && p < RIGHT_LIMIT - REARM {
            self.felt_shifted = false;
        }
        if end {
            self.at_end = true;
        } else if p > END_REARM && p < 1.0 - END_REARM {
            self.at_end = false;
        }
    }
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
    /// Moves the boxes and labels to their shifted or resting layout.
    fn update_shift(&mut self) {
        let p = self.x_percentage();
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

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let p = self.x_percentage();
        Some(format!("{{\"left\":{},\"right\":{},\"held\":{}}}", (p * 100.0).round(), ((1.0 - p) * 100.0).round(), self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let on_row = (0.0..=self.size.0).contains(&x) && (0.0..=self.size.1).contains(&y);
        let half = (self.picker_width() / 2.0) as f64;
        let event = self.pan.event(id, gfx::phase(phase), x, y, at_ms, on_row);
        match event {
            Event::Begin { x, .. } => {
                let spring = self.x();
                let velocity = spring.velocity;
                spring.to_clamped(x as f64 + half, velocity, GENTLE);
            }
            Event::Start(p) | Event::Update(p) => {
                if matches!(event, Event::Start(_)) {
                    self.haptic("impact-light", at_ms);
                }
                self.x().set(p.x as f64 + half);
                self.feel(at_ms);
            }
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
        self.feel(now);
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
        c.draw_rrect(0.0, top, left_w, bh, 5.0, &Paint::fill(Color::view_hex(0x44220C)));
        // The pill: a quarter of the picker's width, 80% of its height, centred.
        let (pill_w, pill_h) = (pw / 4.0, 0.8 * bh);
        c.draw_rrect(left_w + (pw - pill_w) / 2.0, top + (bh - pill_h) / 2.0, pill_w, pill_h, 50.0, &Paint::fill(Color::WHITE));
        c.draw_rrect(left_w + pw, top, right_w, bh, 5.0, &Paint::fill(Color::view_hex(0x363636)));

        if let Some(font) = self.font.as_ref() {
            let m = font.metrics();
            // Labels sit at the row's bottom, one line tall, and rise with the shift.
            let bottom = h + self.label_y.value as f32;
            let baseline = bottom - (m.descent + m.leading);
            let left_pct = &self.percents[(p * 100.0).round() as usize];
            let right_pct = &self.percents[((1.0 - p) * 100.0).round() as usize];
            let label = font.advance_width("COFFEE");
            c.draw_text("COFFEE", 8.0, baseline, font, &Paint::fill(Color::view_hex(0x964D20)));
            c.draw_text(left_pct, 8.0 + label + PERCENT_MARGIN, baseline, font, &Paint::fill(Color::view_hex(0xE37C33)));
            let milk = font.advance_width("MILK");
            let milk_x = w - 8.0 - milk;
            c.draw_text("MILK", milk_x, baseline, font, &Paint::fill(Color::view_hex(0x999898)));
            let pct_right = milk_x - PERCENT_MARGIN;
            debug_assert!(PERCENT_WIDTH >= font.advance_width("100%"));
            c.draw_text(right_pct, pct_right - font.advance_width(right_pct), baseline, font, &Paint::fill(Color::view_hex(0xF8F8F8)));
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
    fn haptics_on_the_grab_the_limits_and_the_end() {
        let mut s = BalanceSlider::new();
        s.size = (378.0, 50.0);
        s.x();
        s.feel(0.0);
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 25.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        // A tap plays nothing.
        s.input(&pointer(PointerPhase::Down, 189.0, 0.0));
        assert!(s.messages().is_empty());
        // Left past 0.33 (light at activation, one selection), on to the end (one rigid), held
        // there (nothing more).
        let mut ms = 0.0;
        for k in 1..=40 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, (189.0 - 220.0 * k as f32 / 30.0).max(-20.0), ms));
        }
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:selection", "haptic:impact-rigid"]);
        // Back across 0.33 to the middle: nothing, the end and the limit re-armed.
        for k in 1..=20 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 189.0 * k as f32 / 20.0, ms));
        }
        assert!(s.messages().is_empty());
        assert!(!s.at_end && !s.felt_shifted);
        // Hovering on the 0.72 line: one selection, no flapping.
        let edge = (0.72 * 378.0) as f32;
        for k in 0..40 {
            ms += 50.0;
            s.input(&pointer(PointerPhase::Move, edge + if k % 2 == 0 { 3.0 } else { -3.0 }, ms));
        }
        assert!(s.messages().len() <= 1);
        s.input(&pointer(PointerPhase::Up, 189.0, ms));
    }

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
        // At full height the left box ends where the picker starts.
        // Views read hex as Display P3, so these are not the sRGB bytes.
        assert_eq!(&rest.at(20, 96)[..3], &[73, 32, 5]);
        assert_eq!(&rest.at(2 * 365, 4)[..3], &[0x36, 0x36, 0x36]);
        assert_eq!(&rest.at(2 * 189, 50)[..3], &[255, 255, 255]);

        // Drag to 20%: the boxes drop to 30% of the height and the labels rise.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 25.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
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
