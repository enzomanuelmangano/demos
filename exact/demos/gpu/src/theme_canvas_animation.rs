//! A theme picker: "THEME" on a coloured screen with six round swatches below it. A tap on a
//! swatch floods the screen with that swatch's theme, as a circle growing out from it.
//!
//! - A swatch scales in to 0.9 while it is held and springs back on release. A tap fails past
//!   500 ms.
//! - Drawn in 8-bit Display P3, so flat colours and swatch edges blend in P3.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, TapGesture};
use motion::{duration_config, Spring, GENTLE};
use draw2d::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// Swatch edge, pt.
const SQUARE: f32 = 35.0;
/// A swatch's touch radius (see `swatch_at`).
const TOUCH_RADIUS: f32 = 30.0;
/// The title.
const APP_TEXT: &str = "THEME";
const FONT_SIZE: f32 = 40.0;
/// Each theme's background and text colour.
const COLORS: [(u32, u32); 6] = [(0xF7FFF7, 0x373737), (0x4ECDC4, 0x2C2C2C), (0x1A535C, 0xE8E8E8), (0xEE6C4D, 0xD4D2D2), (0xF38D68, 0x2C2C2C), (0x902D41, 0xDEDEDE)];
/// Swatch positions, in steps of 2 × SQUARE from the centre.
const OFFSETS: [(f32, f32); 6] = [(-1.0, 0.0), (0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 1.0), (1.0, 1.0)];
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // A plain tap: it fails past 500 ms, with no distance limit.
    let tap = TapGesture::default();
    Box::new(Theme { font: Font::new(OUTFIT, FONT_SIZE), scales: std::array::from_fn(|_| Spring::at(1.0)), tap, ..Default::default() })
}

#[derive(Default)]
struct Theme {
    size: (f32, f32),
    font: Option<Font>,
    text_width: f32,
    selected: usize,
    previous: usize,
    radius: Spring,
    /// The radius spring's completion is still pending.
    flooding: bool,
    scales: [Spring; 6],
    /// The finger the canvas's pan holds.
    finger: Option<u32>,
    tap: TapGesture,
    canvas: Canvas,
    renderer: Renderer,
    /// The 8-bit Display P3 surface.
    p3: gfx::P3Layer,
    /// Haptics for the host to play: a selection on each theme change.
    posted: Vec<String>,
}

impl Theme {
    /// Swatch `i`'s top left (cx, cy).
    fn corner(&self, i: usize) -> (f32, f32) {
        let (w, h) = self.size;
        let (ox, oy) = OFFSETS[i];
        (w / 2.0 - SQUARE / 2.0 + ox * SQUARE * 2.0, h / 2.0 - SQUARE / 2.0 + oy * SQUARE * 2.0)
    }
    /// The swatch whose touch area holds (x, y), the nearest if two overlap. The touch area is
    /// wider than the drawn circle: a 60 pt target, past the 44 pt minimum.
    fn swatch_at(&self, x: f32, y: f32) -> Option<usize> {
        (0..6)
            .map(|i| {
                let (cx, cy) = self.corner(i);
                (i, (x - cx - SQUARE / 2.0).hypot(y - cy - SQUARE / 2.0))
            })
            .filter(|&(_, d)| d <= TOUCH_RADIUS)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, _)| i)
    }
    fn select(&mut self, index: usize) {
        if index == self.selected {
            return;
        }
        let h = self.size.1 as f64;
        self.radius.set(0.0);
        self.radius.to(h, 0.0, duration_config(-h, 0.0, 1000.0, 1.0, 4.0));
        self.flooding = true;
        self.posted.push("haptic:selection".into());
        self.previous = self.selected;
        self.selected = index;
    }
}

impl Surface for Theme {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let scales: Vec<String> = self.scales.iter().map(|s| format!("{:.3}", s.value)).collect();
        Some(format!("{{\"selected\":{},\"previous\":{},\"radius\":{:.1},\"scales\":[{}]}}", self.selected, self.previous, self.radius.value, scales.join(",")))
    }

    /// Swatches are drawn touch targets with spring scales, not `pressto::Pressable`.
    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        // A swatch scales in while the finger is down.
        match phase {
            gestures::Phase::Down if self.finger.is_none() => {
                self.finger = Some(id);
                if let Some(i) = self.swatch_at(x, y) {
                    let s = &mut self.scales[i];
                    s.to(0.9, s.velocity, GENTLE);
                }
            }
            gestures::Phase::Up | gestures::Phase::Cancel if self.finger == Some(id) => self.finger = None,
            _ => {}
        }
        // A tap selects the swatch and springs it back.
        if let Event::Tap { x, y } = self.tap.event(id, phase, x, y, at_ms, true) {
            if let Some(i) = self.swatch_at(x, y) {
                let s = &mut self.scales[i];
                s.to(1.0, s.velocity, GENTLE);
                self.select(i);
            }
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
        let mut moving = false;
        if self.radius.running {
            moving |= self.radius.step(frame.now_ms);
            if !self.radius.running && self.flooding {
                // The spring has ended: the flood is complete.
                self.flooding = false;
                self.previous = self.selected;
                self.radius.set(0.0);
            }
        }
        for s in &mut self.scales {
            moving |= s.step(frame.now_ms);
        }
        if self.text_width == 0.0 {
            if let Some(font) = &self.font {
                self.text_width = font.measure_text(APP_TEXT).width;
            }
        }
        let (w, h) = (frame.width, frame.height);
        let (tx, ty) = (w / 2.0 - self.text_width / 2.0, h / 2.0 - 65.0);
        let corners: [(f32, f32); 6] = std::array::from_fn(|i| self.corner(i));
        let c = &mut self.canvas;
        c.begin(frame.scale);
        let background = |c: &mut Canvas, theme: usize| {
            let (bg, text) = COLORS[theme];
            c.draw_rect(0.0, 0.0, w, h, &Paint::fill(Color::hex(bg)));
            if let Some(font) = &self.font {
                c.draw_text(APP_TEXT, tx, ty, font, &Paint::fill(Color::hex(text)));
            }
        };
        background(c, self.previous);
        let r = self.radius.value as f32;
        if r > 0.0 {
            let (sx, sy) = corners[self.selected];
            let (cx, cy) = (sx + SQUARE / 2.0, sy + SQUARE / 2.0);
            c.save();
            c.clip_rrect(cx - r, cy - r, 2.0 * r, 2.0 * r, r);
            background(c, self.selected);
            c.restore();
        }
        for (i, &(x, y)) in corners.iter().enumerate() {
            let (bg, text) = COLORS[i];
            let scale = self.scales[i].value as f32;
            let (ox, oy) = (x + SQUARE / 2.0, y + SQUARE / 2.0);
            c.save();
            c.translate(ox, oy);
            c.scale(scale, scale);
            c.translate(-ox, -oy);
            c.draw_rrect(x, y, SQUARE, SQUARE, 100.0, &Paint::fill(Color::hex(bg)));
            let border = if self.selected == i { text } else { bg };
            c.draw_rrect(x, y, SQUARE, SQUARE, 100.0, &Paint::stroke(Color::hex(border), 2.0));
            c.restore();
        }
        let (pw, ph) = frame.pixels();
        self.p3.draw(&mut self.renderer, device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);
        moving || self.finger.is_some()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_swatch_takes_a_touch_30_pt_round_its_centre() {
        let mut s = Theme::default();
        s.size = (400.0, 800.0);
        // Swatch 1 is at the centre (200, 400); swatch 0, 70 to its left.
        assert_eq!(s.swatch_at(200.0 + 29.0, 400.0), Some(1));
        assert_eq!(s.swatch_at(200.0, 400.0 - 29.0), Some(1));
        assert_eq!(s.swatch_at(200.0, 400.0 - 31.0), None);
        assert_eq!(s.swatch_at(200.0 - 29.0, 400.0), Some(1));
        assert_eq!(s.swatch_at(200.0 - 35.0, 400.0), None);
        assert_eq!(s.swatch_at(200.0 - 41.0, 400.0), Some(0));
    }

    #[test]
    fn a_tap_on_a_swatch_floods_the_screen_with_its_theme() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("theme-canvas-rest");
        assert!(!animating);
        assert_eq!(&rest.at(10, 10)[..3], &[246, 255, 247]);
        assert!(rest.count(|p| p[..3] == [0x37, 0x37, 0x37]) > 300);
        assert_eq!(&rest.at(280, 456)[..3], &[0x1A, 0x53, 0x5C]);

        let finger = |s: &mut Box<dyn Surface>, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 280.0, y: 456.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 10.0);
        let mut held = false;
        for ms in [16.0, 150.0] {
            held = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        assert!(held);
        assert!(s.agent("{}").unwrap().contains("\"scales\":[1.000,1.000,0.9"), "{}", s.agent("{}").unwrap());
        finger(&mut s, PointerPhase::Up, 160.0);
        assert!(s.agent("{}").unwrap().starts_with("{\"selected\":2,\"previous\":0"));
        assert_eq!(s.messages(), ["haptic:selection"]);
        fixture::render(&gpu, s.as_mut(), &frame(166.0)).unwrap();
        let (mid, moving) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        mid.save("theme-canvas-flooding");
        assert!(moving);
        assert_eq!(&mid.at(300, 470)[..3], &[0x1A, 0x53, 0x5C]);
        assert_eq!(&mid.at(10, 10)[..3], &[246, 255, 247]);
        let mut ms = 400.0;
        let mut moving = true;
        while moving && ms < 3000.0 {
            ms += 16.0;
            moving = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        let (done, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        done.save("theme-canvas-done");
        assert_eq!(s.agent("{}").unwrap(), "{\"selected\":2,\"previous\":2,\"radius\":0.0,\"scales\":[1.000,1.000,1.000,1.000,1.000,1.000]}");
        assert_eq!(&done.at(10, 10)[..3], &[0x1A, 0x53, 0x5C]);
        assert!(done.count(|p| p[..3] == [0xE8, 0xE8, 0xE8]) > 300);
        // A tap on the selected swatch does nothing but its press.
        finger(&mut s, PointerPhase::Down, 5000.0);
        finger(&mut s, PointerPhase::Up, 5050.0);
        assert!(s.agent("{}").unwrap().starts_with("{\"selected\":2,\"previous\":2,\"radius\":0.0"));
    }
}
