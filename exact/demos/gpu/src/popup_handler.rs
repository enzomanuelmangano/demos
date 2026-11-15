//! Popup Handler's circle (src/animations/popup-handler/index.tsx, BlurredPopup/
//! TouchablePopupHandler.tsx): the white 64 pt circle over the photo, its pan, its tap and its
//! spring to a corner. The menu, the blur and the node's copy stay in Contract.
//!
//! - The GestureDetector's Animated.View: 64 × 64 at the root's top-left, translated by
//!   (translateX, translateY), starting at (size / 2, topY), topY = safeTop +
//!   DEMO_BUTTON_ROW_HEIGHT. In it the white View (radius size / 2, continuous): Core Animation
//!   draws a continuous square whose radius is half its side as a true circle (`draw_circle`).
//! - Pan (`Gesture.Pan()`): onBegin (touch-down on the 64 × 64 box, hit through its translate)
//!   keeps context = translate (a running spring goes on until the first update); onUpdate
//!   `translate.set(translation + context)`, which cancels the spring. So the circle can be
//!   grabbed while it springs or while an option's timeout waits.
//! - Tap (TouchablePopupHandler, `Gesture.Tap().onTouchesUp`): RNGH's Tap (500 ms, no distance
//!   limit) unless the pan activated; at the lift it measures the box where it is drawn and
//!   posts `open:<pageX>,<pageY>` (showPopup and the selection haptic run in Contract).
//! - An option's onPress: `setTimeout(() => selectedAngle.set(angle), 800)`. Inputs `angle` and
//!   `token` (a new token per press) arm one timeout each, stamped at the press's commit; each
//!   fires at its time in order and sets selectedAngle; its useAnimatedReaction runs only when
//!   the angle changes: `translateX.set(withSpring(x))`, `translateY.set(withSpring(y))`
//!   (Gentle), x = right ? W − 64 − 32 : 32, y = bottom ? H − 64 − 64 : topY. valueSetter:
//!   previousAnimation is the running spring, so a second pick keeps its velocity (dropped when
//!   it points away), its clock going on from its last frame; from rest the spring starts at the
//!   frame.
//!
//! Inputs: safeTop, angle (0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right), token.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase, TapGesture};
use reanimated::{Spring, GENTLE};
use skia::{Canvas, Color, Paint, Renderer};

use crate::gfx;

/// `size`.
const SIZE: f64 = 64.0;
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f64 = 56.0;
/// The option's setTimeout.
const DELAY_MS: f64 = 800.0;

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(PopupHandler::default())
}

#[derive(Default)]
struct PopupHandler {
    safe_top: f64,
    size: (f64, f64),
    /// translateX / translateY; None until the first bind places them.
    tx: Spring,
    ty: Spring,
    placed: bool,
    /// The context the pan's onBegin kept.
    context: (f64, f64),
    pan: PanGesture,
    tap: TapGesture,
    /// The tap lost to the pan's activation.
    tap_lost: bool,
    /// selectedAngle.
    selected: u32,
    /// The token bound last, and the timeouts waiting: (stamp, or None until the next frame
    /// stamps it, angle).
    token: Option<f64>,
    timers: Vec<(Option<f64>, u32)>,
    posted: Vec<String>,
    last_ms: f64,
    canvas: Canvas,
    renderer: Renderer,
}

impl PopupHandler {
    fn top_y(&self) -> f64 {
        self.safe_top + BUTTON_ROW
    }

    /// The useAnimatedReaction on selectedAngle.
    fn select(&mut self, angle: u32, now: f64) {
        if angle == self.selected {
            return;
        }
        self.selected = angle;
        let (w, h) = self.size;
        let internal = SIZE / 2.0;
        let x = if angle == 1 || angle == 3 { (w - internal * 2.0) - internal } else { internal };
        let y = if angle >= 2 { (h - internal * 2.0) - SIZE } else { self.top_y() };
        for (s, to) in [(&mut self.tx, x), (&mut self.ty, y)] {
            if s.running {
                // previousAnimation's velocity and lastTimestamp carry over.
                s.retarget(to, GENTLE);
            } else {
                s.assign(to, GENTLE, now);
            }
        }
    }

    fn inside(&self, x: f32, y: f32) -> bool {
        let (x, y) = (x as f64, y as f64);
        x >= self.tx.value && x < self.tx.value + SIZE && y >= self.ty.value && y < self.ty.value + SIZE
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64) {
        let claim = phase == Phase::Down && self.inside(x, y);
        match self.pan.event(id, phase, x, y, ms, claim) {
            Event::Begin { .. } => {
                self.context = (self.tx.value, self.ty.value);
                self.tap_lost = false;
            }
            Event::Start(p) | Event::Update(p) | Event::End(p) => {
                // The pan's activation fails the Tap (UIKit: not simultaneous).
                self.tap_lost = true;
                if !matches!(phase, Phase::Up | Phase::Cancel) {
                    self.tx.set(p.translation_x as f64 + self.context.0);
                    self.ty.set(p.translation_y as f64 + self.context.1);
                }
            }
            _ => {}
        }
        if let Event::Tap { .. } = self.tap.event(id, phase, x, y, ms, claim) {
            if !self.tap_lost {
                // measure(viewRef): the box where it is drawn now.
                self.posted.push(format!("open:{:.4},{:.4}", self.tx.value, self.ty.value));
            }
        }
    }
}

impl Surface for PopupHandler {
    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        self.safe_top = n(0);
        let (angle, token) = (n(1).clamp(0.0, 3.0) as u32, n(2));
        if !self.placed {
            self.tx.set(SIZE / 2.0);
            self.ty.set(self.top_y());
            self.placed = true;
        }
        if self.token.is_some_and(|t| t != token) {
            self.timers.push((at_ms, angle));
        }
        self.token = Some(token);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        self.pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn max_fps(&self) -> u32 {
        // Only a timeout waiting: wake when it is due, not every frame.
        if self.tx.running || self.ty.running || self.pan.tracking() || self.timers.iter().any(|t| t.0.is_none()) {
            return 0;
        }
        match self.timers.iter().filter_map(|t| t.0).map(|at| at + DELAY_MS - self.last_ms).reduce(f64::min) {
            Some(left) if left > 0.0 => (1000.0 / left).ceil().max(1.0) as u32,
            _ => 0,
        }
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"x\":{:.3},\"y\":{:.3},\"angle\":{},\"pending\":{},\"springing\":{},\"held\":{}}}",
            self.tx.value,
            self.ty.value,
            self.selected,
            self.timers.len(),
            self.tx.running || self.ty.running,
            self.pan.tracking()
        ))
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
        let now = frame.now_ms;
        self.last_ms = now;
        self.size = (frame.width as f64, frame.height as f64);
        // The timeouts, in the order they fire.
        for t in &mut self.timers {
            t.0.get_or_insert(now);
        }
        self.timers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        while let Some(&(Some(at), angle)) = self.timers.first() {
            if at + DELAY_MS > now {
                break;
            }
            self.timers.remove(0);
            self.select(angle, now);
        }
        let moving = self.tx.step(now) | self.ty.step(now);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        let r = (SIZE / 2.0) as f32;
        c.draw_circle((self.tx.value as f32) + r, (self.ty.value as f32) + r, r, &Paint::fill(Color::WHITE));
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || !self.timers.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: f64 = 1000.0 / 60.0;

    fn surface_at(safe_top: f64) -> PopupHandler {
        let mut s = PopupHandler { size: (402.0, 874.0), ..Default::default() };
        s.bind(&[Value::Number(safe_top), Value::Number(0.0), Value::Number(0.0)], None).unwrap();
        s
    }

    /// Steps the springs and timers as render does, frame by frame up to `to_ms`.
    fn run(s: &mut PopupHandler, from_ms: f64, to_ms: f64) -> f64 {
        let mut t = from_ms;
        while t <= to_ms {
            s.last_ms = t;
            for timer in &mut s.timers {
                timer.0.get_or_insert(t);
            }
            while let Some(&(Some(at), angle)) = s.timers.first() {
                if at + DELAY_MS > t {
                    break;
                }
                s.timers.remove(0);
                s.select(angle, t);
            }
            s.tx.step(t);
            s.ty.step(t);
            t += FRAME;
        }
        t
    }

    #[test]
    fn an_option_springs_the_circle_after_800_ms() {
        let mut s = surface_at(62.0);
        assert_eq!((s.tx.value, s.ty.value), (32.0, 118.0));
        // Bottom-right, picked at 0: nothing moves for 800 ms.
        s.bind(&[Value::Number(62.0), Value::Number(3.0), Value::Number(1.0)], Some(0.0)).unwrap();
        let t = run(&mut s, 0.0, 790.0);
        assert_eq!((s.tx.value, s.ty.value), (32.0, 118.0));
        let t = run(&mut s, t, 1100.0);
        assert!(s.tx.running && s.tx.value > 32.0 && s.tx.velocity > 0.0);
        run(&mut s, t, 3000.0);
        assert_eq!((s.tx.value, s.ty.value), (402.0 - 96.0, 874.0 - 128.0));
        // The same corner again: selectedAngle does not change, nothing moves.
        s.bind(&[Value::Number(62.0), Value::Number(3.0), Value::Number(2.0)], Some(3000.0)).unwrap();
        run(&mut s, 3000.0, 4000.0);
        assert!(!s.tx.running && s.timers.is_empty());
    }

    #[test]
    fn a_second_pick_keeps_the_velocity_toward_its_corner() {
        let mut s = surface_at(62.0);
        // Dragged above the top corners (y 10), then bottom-left: y springs down.
        s.ty.set(10.0);
        s.select(2, 0.0);
        let mut t = 0.0;
        while s.ty.value < 60.0 {
            t += FRAME;
            s.ty.step(t);
        }
        let (y, v) = (s.ty.value, s.ty.velocity);
        assert!(y < 118.0 && v > 0.0);
        // Top-left fires now: y = 118 lies ahead, so the velocity is kept.
        s.select(0, t + FRAME);
        let mut want = Spring::at(y);
        want.to(118.0, v, GENTLE);
        s.ty.step(t + FRAME);
        want.step(0.0);
        want.step(FRAME);
        assert!((s.ty.value - want.value).abs() < 1e-9, "{} {}", s.ty.value, want.value);
        // The keyframed Contract spring restarted from rest: it lags behind.
        let mut rest = Spring::at(y);
        rest.to(118.0, 0.0, GENTLE);
        rest.step(0.0);
        rest.step(FRAME);
        assert!(s.ty.value > rest.value + 1.0);
    }

    #[test]
    fn the_circle_is_grabbed_mid_spring() {
        let mut s = surface_at(62.0);
        s.bind(&[Value::Number(62.0), Value::Number(3.0), Value::Number(1.0)], Some(0.0)).unwrap();
        let t = run(&mut s, 0.0, 1000.0);
        let (x0, y0) = (s.tx.value, s.ty.value);
        assert!(s.tx.running);
        // Touch down on it: onBegin keeps where it is; the spring goes on until the pan's update.
        let (fx, fy) = (x0 as f32 + 30.0, y0 as f32 + 30.0);
        s.pointer(1, Phase::Down, fx, fy, t);
        let t = run(&mut s, t, t + 120.0);
        assert!(s.tx.value != x0);
        s.pointer(1, Phase::Move, fx + 30.0, fy + 40.0, t);
        s.pointer(1, Phase::Move, fx + 60.0, fy + 80.0, t + 16.0);
        assert!(!s.tx.running && !s.ty.running);
        // UIKit leaves out the 10 pt along the set-off.
        assert!((s.tx.value - (x0 + 60.0 - 6.0)).abs() < 1e-3, "{}", s.tx.value);
        assert!((s.ty.value - (y0 + 80.0 - 8.0)).abs() < 1e-3, "{}", s.ty.value);
        s.pointer(1, Phase::Up, fx + 60.0, fy + 80.0, t + 32.0);
        assert!(s.posted.is_empty(), "a drag opens no menu");
        // A tap on it opens the menu where it is.
        let (cx, cy) = (s.tx.value as f32 + 32.0, s.ty.value as f32 + 32.0);
        s.pointer(2, Phase::Down, cx, cy, t + 500.0);
        s.pointer(2, Phase::Up, cx, cy, t + 560.0);
        assert_eq!(s.posted, vec![format!("open:{:.4},{:.4}", s.tx.value, s.ty.value)]);
    }

    #[test]
    fn the_circle_is_drawn_where_it_is() {
        let gpu = match exact_gpu::fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 402.0, height: 874.0, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface_at(62.0);
        let (img, _) = exact_gpu::fixture::render(&gpu, &mut s, &frame).unwrap();
        // Centre (64, 150) pt → (192, 450) px, radius 96 px.
        assert_eq!(img.at(192, 450), [255, 255, 255, 255]);
        assert_eq!(img.at(192, 450 - 97)[3], 0);
        assert_eq!(img.at(192 + 97, 450)[3], 0);
        assert_eq!(img.at(192 + 94, 450)[3], 255);
    }
}
