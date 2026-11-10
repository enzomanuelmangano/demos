//! Floating Modal (src/animations/floating-modal: index.tsx, components/FloatingModal/
//! index.tsx, constants.ts, AddCloseIcon, AnimatedBackdrop, Modal): a white 64 pt "+" button in
//! the bottom-right corner that opens into a centred square modal ("New", a "Done" button) and
//! is dragged away to close; the whole window, over the Contract's rgba(0,0,0,0.1).
//!
//! - progress = withTiming(isOpened ? 1 : 0) (300 ms, inOut(quad)). size = 64 → 0.9 × width,
//!   right = 32 → 0.05 × width, bottom = 32 → height / 2 − size / 2 (the size of this frame: a
//!   quadratic path), borderRadius 32 → 15, all clamped; white, boxShadow `0px 12px 12px
//!   rgba(0,0,0,0.2)` (σ 6, RN's iOS blur / 2), drawn with the view.
//! - transform [scale, translateX, translateY] about the view's centre, scale = 1 − √(x² + y²) /
//!   √(width² + height²). The pan (on the modal) sets x, y = translation while opened; at
//!   onFinalize a downward drag with scale < 0.95 closes it, and x, y spring back to 0
//!   (withSpring, Reanimated's default, overshootClamping).
//! - isVisible = progress === 1: the backdrop (rgba(0,0,0,0.4)) fades to it (withTiming,
//!   300 ms) and closes the modal on touch start while visible; the content fades to it
//!   (100 ms) and takes touches only while visible.
//! - The content (absoluteFill, centred): "New" (20 bold) in a 64 tall row; at the bottom an
//!   80 tall row holding the "Done" button (margin 10, #111, radius 12, "Done" 20 / 700 white).
//! - The "+" (AntDesign plus, 28, black) in a 64² PressableScale at the modal's top-left,
//!   rotated by progress × π/4; pressing it toggles isOpened.
//! - PressableScale (pressto): scale 1 → 0.96 on withTiming(250 ms, bezier(0.25, 0.1, 0.25, 1))
//!   while pressed; every press posts `press` (the app's selection haptic).
//!
//! - The "+"'s `transform` has two writers: the icon's rotate style and pressto's scale style,
//!   both animated styles of the same view. Reanimated sends each style's changed props when its
//!   mapper runs and `transform` is replaced whole, so the view shows the last one written: a
//!   frame where only the press moves shows [scale] (unrotated), one where the progress moves
//!   shows [rotate] (scale 1). In a frame where both move, the mappers run in Reanimated's
//!   topological order (mappers.ts `updateMappersOrder`, a DFS over registration order):
//!   pressto's (registered in its own effect, a child's, first), then the icon's, which wins.
//!   Before any write it is pressto's initial [scale 1] (last in the style array).
//! - Text is RN `<Text>`, laid out by UIKit (`skia::match_ui_font`: tracking, kerning). The
//!   modal has no borderCurve (circular); the "Done" button is continuous. The boxShadow's path
//!   is RCTBoxShadow's circular rounded rect.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Easing, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// FLOATING_BUTTON_SIZE.
const BUTTON: f64 = 64.0;
/// AntDesign "plus" (U+F21A), size 28.
const PLUS: &str = "\u{F21A}";
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-subset.ttf");

/// pressto's press animation.
pub(crate) fn press_easing() -> Easing {
    Easing::bezier(0.25, 0.1, 0.25, 1.0)
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(modal())
}

fn modal() -> FloatingModal {
    FloatingModal {
        down_y: 0.0,
        size: (0.0, 0.0),
        opened: false,
        progress: Timing::at(0.0),
        x: Spring::at(0.0),
        y: Spring::at(0.0),
        backdrop: Timing::at(0.0),
        content: Timing::at(0.0),
        visible: false,
        pan: PanGesture::new(),
        press: None,
        plus_press: Timing::at(0.0),
        done_press: Timing::at(0.0),
        plus_shown: (0.0, 1.0),
        posted: Vec::new(),
        plus: Font::new(ANTDESIGN, 28.0),
        title: skia::match_ui_font(20.0, 700.0),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Button {
    Plus,
    Done,
}

struct FloatingModal {
    /// Where the pan's finger went down (onEnd reads translationY even when it never activated).
    down_y: f64,
    size: (f64, f64),
    opened: bool,
    progress: Timing,
    x: Spring,
    y: Spring,
    backdrop: Timing,
    content: Timing,
    visible: bool,
    pan: PanGesture,
    /// The button a finger is down on (until it lifts, moves away as a pan, or is cancelled).
    press: Option<(u32, Button)>,
    plus_press: Timing,
    done_press: Timing,
    /// The "+"'s transform as last written: (rotate, scale).
    plus_shown: (f64, f64),
    posted: Vec<String>,
    plus: Option<Font>,
    title: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

/// The modal's frame (untransformed) and its radius at `p`.
fn frame_at(p: f64, w: f64, h: f64) -> (f64, f64, f64, f64) {
    let size = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON, w * 0.9]);
    let right = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON / 2.0, w * 0.05]);
    let bottom = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON / 2.0, h / 2.0 - size / 2.0]);
    let radius = interpolate_clamp(p, &[0.0, 1.0], &[32.0, 15.0]);
    (w - right - size, h - bottom - size, size, radius)
}

impl FloatingModal {
    fn scale(&self) -> f64 {
        let (w, h) = self.size;
        1.0 - self.x.value.hypot(self.y.value) / w.hypot(h)
    }

    /// A canvas point in the modal's own points (its top-left at 0, 0), through the inverse of
    /// its transform.
    fn local(&self, px: f64, py: f64) -> (f64, f64, f64) {
        let (fx, fy, size, _) = frame_at(self.progress.value, self.size.0, self.size.1);
        let s = self.scale();
        let (cx, cy) = (fx + size / 2.0, fy + size / 2.0);
        ((px - cx) / s - self.x.value + size / 2.0, (py - cy) / s - self.y.value + size / 2.0, size)
    }

    fn toggle(&mut self) {
        self.opened = !self.opened;
        self.progress.to(if self.opened { 1.0 } else { 0.0 }, 300.0, Easing::timing_default());
    }

    fn release(&mut self, fired: bool) {
        if let Some((_, button)) = self.press.take() {
            let t = match button {
                Button::Plus => &mut self.plus_press,
                Button::Done => &mut self.done_press,
            };
            t.to(0.0, 250.0, press_easing());
            if fired {
                self.posted.push("press".into());
                if button == Button::Plus {
                    self.toggle();
                }
            }
        }
    }
}

impl Surface for FloatingModal {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"opened\":{},\"progress\":{:.3},\"scale\":{:.4},\"visible\":{},\"held\":{}}}",
            self.opened,
            self.progress.value,
            self.scale(),
            self.visible,
            self.pan.tracking() || self.press.is_some()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let (lx, ly, size) = self.local(x as f64, y as f64);
        let on_modal = (0.0..=size).contains(&lx) && (0.0..=size).contains(&ly);
        let phase = gfx::phase(phase);
        if phase == gesture_handler::Phase::Down {
            if !on_modal {
                // The backdrop's onTouchStart, while it takes touches.
                if self.visible {
                    self.toggle();
                }
                return;
            }
            if self.press.is_none() {
                let on_plus = lx <= BUTTON && ly <= BUTTON;
                let on_done = self.visible && (10.0..=size - 10.0).contains(&lx) && (size - 70.0..=size - 10.0).contains(&ly);
                let button = if on_plus { Some(Button::Plus) } else if on_done { Some(Button::Done) } else { None };
                if let Some(b) = button {
                    self.press = Some((id, b));
                    let t = if b == Button::Plus { &mut self.plus_press } else { &mut self.done_press };
                    t.to(1.0, 250.0, press_easing());
                }
            }
        }
        match self.pan.event(id, phase, x, y, at_ms, on_modal) {
            Event::Begin { y: by, .. } => self.down_y = by as f64,
            Event::Start(p) | Event::Update(p) => {
                // The pan activates: the button under the finger is cancelled.
                if self.press.is_some_and(|(pid, _)| pid == id) {
                    self.release(false);
                }
                if self.opened {
                    self.x.set(p.translation_x as f64);
                    self.y.set(p.translation_y as f64);
                }
            }
            Event::End(p) => self.finalize(p.translation_y as f64),
            // RN's onEnd checks event.translationY even for a pan that never activated.
            Event::Fail => self.finalize(y as f64 - self.down_y),
            _ => {}
        }
        if matches!(phase, gesture_handler::Phase::Up | gesture_handler::Phase::Cancel) && self.press.is_some_and(|(pid, _)| pid == id) {
            self.release(phase == gesture_handler::Phase::Up);
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
        self.size = (frame.width as f64, frame.height as f64);
        let now = frame.now_ms;
        let (p0, k0) = (self.progress.value, self.plus_press.value);
        let mut moving = self.progress.step(now);
        moving |= self.x.step(now) | self.y.step(now);
        let visible = self.progress.value == 1.0;
        if visible != self.visible {
            self.visible = visible;
            let v = if visible { 1.0 } else { 0.0 };
            self.backdrop.to(v, 300.0, Easing::timing_default());
            self.content.to(v, 100.0, Easing::timing_default());
        }
        moving |= self.backdrop.step(now) | self.content.step(now);
        moving |= self.plus_press.step(now) | self.done_press.step(now);
        // The "+"'s two transform writers, pressto's first, the icon's last.
        if self.plus_press.value != k0 {
            self.plus_shown = (0.0, 1.0 - 0.04 * self.plus_press.value);
        }
        if self.progress.value != p0 {
            self.plus_shown = (self.progress.value.clamp(0.0, 1.0) * std::f64::consts::FRAC_PI_4, 1.0);
        }

        let p = self.progress.value;
        let (fx, fy, size, radius) = frame_at(p, self.size.0, self.size.1);
        let s = self.scale() as f32;
        let (fx, fy, size, radius) = (fx as f32, fy as f32, size as f32, radius as f32);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if self.backdrop.value > 0.0 {
            c.save();
            c.opacity(self.backdrop.value as f32);
            c.fill(Color::rgba8(0, 0, 0, 255).alpha(0.4));
            c.restore();
        }
        // The modal: about its centre, scale then the translation (scaled).
        c.save();
        c.translate(fx + size / 2.0, fy + size / 2.0);
        c.scale(s, s);
        c.translate(self.x.value as f32 - size / 2.0, self.y.value as f32 - size / 2.0);
        c.draw_rrect_shadow(0.0, 12.0, size, size, radius, 6.0, Color::rgba8(0, 0, 0, 255).alpha(0.2));
        c.draw_rrect(0.0, 0.0, size, size, radius, &Paint::fill(Color::WHITE));
        if self.content.value > 0.0 {
            c.save();
            c.opacity(self.content.value as f32);
            if let Some(font) = self.title.as_ref() {
                let lh = gfx::line_height(font);
                let new_w = font.advance_width("New");
                c.draw_text("New", (size - new_w) / 2.0, gfx::baseline(font, (64.0 - lh) / 2.0), font, &Paint::fill(Color::BLACK));
                // The button: the bottom 80 row, inset 10, scaled about its centre.
                let (bx, by, bw, bh) = (10.0, size - 70.0, size - 20.0, 60.0);
                let k = 1.0 - 0.04 * self.done_press.value as f32;
                c.save();
                c.translate(bx + bw / 2.0, by + bh / 2.0);
                c.scale(k, k);
                c.translate(-bw / 2.0, -bh / 2.0);
                c.draw_continuous_rrect(0.0, 0.0, bw, bh, 12.0, &Paint::fill(Color::hex(0x111111)));
                let done_w = font.advance_width("Done");
                c.draw_text("Done", (bw - done_w) / 2.0, gfx::baseline(font, (bh - lh) / 2.0), font, &Paint::fill(Color::WHITE));
                c.restore();
            }
            c.restore();
        }
        if let Some(font) = self.plus.as_ref() {
            let half = (BUTTON / 2.0) as f32;
            let (rotate, k) = self.plus_shown;
            c.save();
            c.translate(half, half);
            c.rotate(rotate as f32);
            c.scale(k as f32, k as f32);
            let w = font.advance_width(PLUS);
            let lh = gfx::line_height(font);
            c.draw_text(PLUS, -w / 2.0, gfx::baseline(font, -lh / 2.0), font, &Paint::fill(Color::BLACK));
            c.restore();
        }
        c.restore();
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.pan.tracking() || self.press.is_some()
    }
}

impl FloatingModal {
    /// onFinalize.
    fn finalize(&mut self, translation_y: f64) {
        if !self.opened {
            return;
        }
        if translation_y > 0.0 && self.scale() < 0.95 {
            self.toggle();
        }
        self.x.to_clamped(0.0, 0.0, GENTLE);
        self.y.to_clamped(0.0, 0.0, GENTLE);
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn it_opens_drags_and_closes() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut s = surface();
        s.bind(&[], None).unwrap();
        let (closed, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        closed.save("floating-modal-closed");
        assert!(!moving);
        // The button: 324…388 × 816…880, white; the window around it clear.
        assert_eq!(closed.at(2 * 330, 2 * 860), [255, 255, 255, 255]);
        assert_eq!(closed.at(2 * 100, 2 * 100)[3], 0);

        // Tap the "+": it opens.
        s.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 356.0, 848.0, 80.0));
        assert_eq!(s.messages(), vec!["press".to_string()]);
        let mut ms = 0.0;
        while ms < 800.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (open, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        open.save("floating-modal-open");
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"opened\":true"));
        // 378² centred: x 21…399, y 267…645; the backdrop darkens the rest; "Done" is #111.
        assert_eq!(open.at(2 * 30, 2 * 300), [255, 255, 255, 255]);
        assert_eq!(open.at(2 * 10, 2 * 100)[3], 102);
        assert_eq!(&open.at(2 * 40, 2 * 590)[..3], &[0x11, 0x11, 0x11]);

        // Drag it down 200: it shrinks, and the release closes it.
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        for k in 1..=20 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 210.0, 400.0 + 10.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (dragged, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        dragged.save("floating-modal-dragged");
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"scale\":0.8008"), "{state}");
        s.input(&pointer(PointerPhase::Up, 210.0, 600.0, ms));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"opened\":false"));
        assert_eq!(back.data, closed.data);
    }

    #[test]
    fn the_plus_shows_the_last_transform_written() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut m = modal();
        m.bind(&[], None).unwrap();
        fixture::render(&gpu, &mut m, &frame(0.0)).unwrap();
        // Open: during the release both move, the icon's rotate is written last.
        m.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        let mut ms = 0.0;
        for _ in 0..3 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        // Held, closed: pressto's scale only.
        assert_eq!(m.plus_shown.0, 0.0);
        assert!(m.plus_shown.1 < 1.0);
        m.input(&pointer(PointerPhase::Up, 356.0, 848.0, ms));
        while ms < 800.0 {
            ms += 16.0;
            let before = m.progress.value;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
            if m.progress.value != before {
                // Both may have moved this frame: the icon's rotate is written last.
                assert_eq!(m.plus_shown.1, 1.0, "the rotate wins the shared frames");
            }
        }
        assert!((m.plus_shown.0 - std::f64::consts::FRAC_PI_4).abs() < 1e-9 && m.plus_shown.1 == 1.0);
        // Opened, press the "+" (now at the modal's top-left) and hold: the press rewrites the
        // transform as [scale], the rotation is gone while held.
        let (fx, fy, _, _) = frame_at(1.0, 420.0, 912.0);
        m.input(&pointer(PointerPhase::Down, fx as f32 + 32.0, fy as f32 + 32.0, ms));
        for _ in 0..3 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        assert_eq!(m.plus_shown.0, 0.0);
    }
}
