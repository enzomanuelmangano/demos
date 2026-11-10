//! Theme Canvas Animation (src/animations/theme-canvas-animation: index.tsx,
//! selectable-square/index.tsx): "THEME" on a coloured screen and six round swatches below it; a
//! tap on a swatch floods the screen with its theme from the swatch outward, as a growing
//! circle.
//!
//! - SQUARE_SIZE 35; swatch `i` at (W/2 − 17.5 + offsetX · 70, H/2 − 17.5 + offsetY · 70) for
//!   SQUARE_OFFSETS (−1,0) (0,0) (1,0) (0,1) (−1,1) (1,1), a RoundedRect of r 100 (Skia clamps:
//!   a circle) in colors[i].background, with a 2-wide stroke in colors[i].text when selected,
//!   else in its background.
//! - The screen: a Rect and "THEME" (outfit 40, at W/2 − measureText.width / 2, H/2 − 65) in
//!   the previous theme; over it, clipped to a circle about the selected swatch's centre of
//!   `radius`, the same in the selected theme.
//! - onSelectSquare(i) (i not selected): radius = 0, then withSpring(H, { duration: 1000,
//!   dampingRatio: 1 }) whose end (finished) sets previous = i and radius = 0; previous = the
//!   selected one, selected = i.
//! - A swatch (react-native-skia-gesture): onStart (the canvas pan's onBegin on it) scale =
//!   withSpring(0.9); onTap (the canvas tap's onTouchesUp on it) scale = withSpring(1) and
//!   onSelectSquare. Both Reanimated 4's default spring, about the swatch's centre. The tap
//!   fails past 500 ms (RNGH's maxDuration); RNGH sets no distance for it.
//! - Drawn through `gfx::P3Layer`, RN Skia's 8-bit Display P3 surface: the background #F7FFF7
//!   shows as (246, 255, 247) on RN's screen, #F38D68 as (243, 141, 105), and the swatches'
//!   edges blend in P3 (measured A/B: an sRGB canvas was 1 level off everywhere, 6 on edges).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, TapGesture};
use reanimated::{duration_config, Spring, GENTLE};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// SQUARE_SIZE.
const SQUARE: f32 = 35.0;
/// APP_TEXT.
const APP_TEXT: &str = "THEME";
const FONT_SIZE: f32 = 40.0;
/// colors: background, text.
const COLORS: [(u32, u32); 6] = [(0xF7FFF7, 0x373737), (0x4ECDC4, 0x2C2C2C), (0x1A535C, 0xE8E8E8), (0xEE6C4D, 0xD4D2D2), (0xF38D68, 0x2C2C2C), (0x902D41, 0xDEDEDE)];
/// SQUARE_OFFSETS.
const OFFSETS: [(f32, f32); 6] = [(-1.0, 0.0), (0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 1.0), (1.0, 1.0)];
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // react-native-skia-gesture's onTap is a plain Gesture.Tap(): RNGH's iOS default, 500 ms and
    // no distance limit (the crate's default).
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
    /// The radius spring's completion callback is still to run (it was not interrupted).
    flooding: bool,
    scales: [Spring; 6],
    /// The finger the canvas's pan holds.
    finger: Option<u32>,
    tap: TapGesture,
    canvas: Canvas,
    renderer: Renderer,
    /// RN Skia's 8-bit Display P3 surface: flat colours and edges as RN shows them.
    p3: gfx::P3Layer,
    /// Haptics for the app to play (`message=buzz`): Haptics.selectionAsync on a select.
    posted: Vec<String>,
}

impl Theme {
    /// Swatch `i`'s top left (cx, cy).
    fn corner(&self, i: usize) -> (f32, f32) {
        let (w, h) = self.size;
        let (ox, oy) = OFFSETS[i];
        (w / 2.0 - SQUARE / 2.0 + ox * SQUARE * 2.0, h / 2.0 - SQUARE / 2.0 + oy * SQUARE * 2.0)
    }
    /// The swatch under (x, y), first in order (`isPointInPath` of its circle).
    fn swatch_at(&self, x: f32, y: f32) -> Option<usize> {
        (0..6).find(|&i| {
            let (cx, cy) = self.corner(i);
            (x - cx - SQUARE / 2.0).hypot(y - cy - SQUARE / 2.0) <= SQUARE / 2.0
        })
    }
    fn select(&mut self, index: usize) {
        if index == self.selected {
            return;
        }
        let h = self.size.1 as f64;
        self.radius.set(0.0);
        self.radius.to(h, 0.0, duration_config(-h, 0.0, 1000.0, 1.0, 4.0));
        self.flooding = true;
        // scheduleOnRN(Haptics.selectionAsync).
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
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let scales: Vec<String> = self.scales.iter().map(|s| format!("{:.3}", s.value)).collect();
        Some(format!("{{\"selected\":{},\"previous\":{},\"radius\":{:.1},\"scales\":[{}]}}", self.selected, self.previous, self.radius.value, scales.join(",")))
    }

    /// RN's squares are Skia touch handlers with withSpring(0.9) / withSpring(1), not pressto: not `pressto::Pressable`.
    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        // The canvas's pan: onBegin on a swatch is its onStart.
        match phase {
            gesture_handler::Phase::Down if self.finger.is_none() => {
                self.finger = Some(id);
                if let Some(i) = self.swatch_at(x, y) {
                    let s = &mut self.scales[i];
                    s.to(0.9, s.velocity, GENTLE);
                }
            }
            gesture_handler::Phase::Up | gesture_handler::Phase::Cancel if self.finger == Some(id) => self.finger = None,
            _ => {}
        }
        // The canvas's tap: onTouchesUp on a swatch is its onTap.
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
                // withSpring's callback, finished.
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
        // #F7FFF7 (246, 255, 247 through P3, as RN shows it) everywhere but the text and the swatches; THEME in #373737 above the centre.
        assert_eq!(&rest.at(10, 10)[..3], &[246, 255, 247]);
        assert!(rest.count(|p| p[..3] == [0x37, 0x37, 0x37]) > 300);
        // Swatch 2 (offset (1, 0)) centred at (280, 456): #1A535C.
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
        // Half way: a circle of #1A535C about swatch 2, the rest still #F7FFF7.
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
        // THEME in #E8E8E8 now; swatch 2 ringed in it, swatch 0 no longer.
        assert!(done.count(|p| p[..3] == [0xE8, 0xE8, 0xE8]) > 300);
        // A tap on the selected swatch does nothing but its press.
        finger(&mut s, PointerPhase::Down, 5000.0);
        finger(&mut s, PointerPhase::Up, 5050.0);
        assert!(s.agent("{}").unwrap().starts_with("{\"selected\":2,\"previous\":2,\"radius\":0.0"));
    }
}
