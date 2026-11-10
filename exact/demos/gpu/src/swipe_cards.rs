//! Swipe Cards' stack (src/animations/swipe-cards: index.tsx, components/Card/index.tsx,
//! hooks/use-swipe-controls.ts): nine photos, the front one following the finger.
//!
//! - Each card: the flex-7 box (7 / 9 of the window) under its marginTop safeTop +
//!   DEMO_BUTTON_ROW_HEIGHT − CENTRED_SLACK, centred in it, 90 % × 75 % of it, radius 25
//!   continuous, the photo `contentFit="cover"` (centred), zIndex −index.
//! - rCardStyle, in RN's order about the card's centre: `rotate(rotate)`, `translateY(transY)`,
//!   `scale(scale)`, `translateX(translateX)`, `translateY(translateY)`. So the drag moves along
//!   the card's tilted, scaled axes, as RN's does. `rotate` = interpolate(translateX,
//!   [−w/3, 0, w/3], [−π/20, 0, π/20], CLAMP). opacity, transY and scale are withTiming (300 ms,
//!   inOut(quad)) of (index − activeIndex < 5 ? 1 : 0), (index − activeIndex) × 23 and
//!   1 − 0.07 × (index − activeIndex); a timing to an unchanged target keeps its timeline
//!   (Reanimated's withTiming onStart), and on mount the style is at its targets.
//! - The pan (one GestureDetector per card; the touch goes to the topmost card under it, its
//!   transform and its alpha ≥ 0.01 as UIKit's hit test): onBegin currentActiveIndex =
//!   floor(activeIndex); onUpdate (RNGH reports `translationInView:` of the window: 0 at the
//!   move where UIKit's pan begins, the first one 10 pt or more from touch-down, and counted
//!   from the finger there; measured by exact/parity-tools/pan-probe with the card transformed
//!   as RN's and still, same numbers) on the active card sets translateX / translateY to the
//!   translation and nextActiveIndex = interpolate(sign(x) · (nx² + nv²), [−1, 0, 1],
//!   [a + 1, a, a + 1], CLAMP), nx = x / (w/3), nv = vx / ((w/3) / 0.1); onFinalize, when
//!   nextActiveIndex == activeIndex + 1 it throws by sign(translationX) (0 throws left), else
//!   both springs to 0. nextActiveIndex is kept per card between gestures, as RN's shared value
//!   (a tap on a card that was thrown and reset throws it again, left).
//! - swipeRight / swipeLeft: translateX withSpring(±1.5 w) (Gentle), translateY where it is,
//!   activeIndex + 1. reset: activeIndex 0 at once; card i after i × 100 ms (setTimeout): if its
//!   translateX ≠ 0, both translates withSpring(0) (the second test reads translateX again).
//!   Every spring here starts at velocity 0: a drag sets the values (no animation to inherit)
//!   and reset cancels the running one first.
//!
//! Inputs: safeTop, then three counters the buttons bump (swipe left, swipe right, reset).
//! The photos are the RN assets resampled to cover the card at 3× (images/swipe-cards).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::{interpolate, Easing, Extrapolation, Spring, Timing, GENTLE};
use skia::{fit_cover, Canvas, Images, Paint, Rect, Renderer};

use crate::gfx;

const COUNT: usize = 9;
/// DEMO_BUTTON_ROW_HEIGHT, CENTRED_SLACK.
const BUTTON_ROW: f64 = 56.0;
const CENTRED_SLACK: f64 = 40.0;
/// FLICK_DURATION, s.
const FLICK: f64 = 0.1;

static PHOTOS: [&[u8]; COUNT] = [
    include_bytes!("../images/swipe-cards/01.jpg"),
    include_bytes!("../images/swipe-cards/02.jpg"),
    include_bytes!("../images/swipe-cards/03.jpg"),
    include_bytes!("../images/swipe-cards/04.jpg"),
    include_bytes!("../images/swipe-cards/05.jpg"),
    include_bytes!("../images/swipe-cards/06.jpg"),
    include_bytes!("../images/swipe-cards/07.jpg"),
    include_bytes!("../images/swipe-cards/08.jpg"),
    include_bytes!("../images/swipe-cards/09.jpg"),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(SwipeCards::new())
}

struct Card {
    x: Spring,
    y: Spring,
    opacity: Timing,
    lift: Timing,
    scale: Timing,
    /// nextActiveIndex.
    next: f64,
    /// reset()'s setTimeout: due at (None until the next frame stamps it).
    reset_due: Option<Option<f64>>,
}

struct SwipeCards {
    size: (f64, f64),
    scale_px: f64,
    safe_top: f64,
    /// The buttons' counters, as last bound (None before the first bind).
    counters: Option<[f64; 3]>,
    active: f64,
    /// currentActiveIndex (one value per card in RN; every card sets it at onBegin of its own
    /// gesture, and only the touched card's matters).
    current: f64,
    cards: Vec<Card>,
    pan: PanGesture,
    /// The card the touch went to.
    touched: Option<usize>,
    reset_at: Option<f64>,
    now: f64,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl SwipeCards {
    fn new() -> SwipeCards {
        let cards = (0..COUNT)
            .map(|i| {
                let k = i as f64;
                Card {
                    x: Spring::at(0.0),
                    y: Spring::at(0.0),
                    opacity: Timing::at(if k < 5.0 { 1.0 } else { 0.0 }),
                    lift: Timing::at(k * 23.0),
                    scale: Timing::at(1.0 - 0.07 * k),
                    next: 0.0,
                    reset_due: None,
                }
            })
            .collect();
        SwipeCards {
            size: (0.0, 0.0),
            scale_px: 3.0,
            safe_top: 0.0,
            counters: None,
            active: 0.0,
            current: 0.0,
            cards,
            // UIKit's pan reports translationInView:window from where it began (0 there), not
            // the travel past 10 pt, and the card's own transform plays no part
            // (exact/parity-tools/pan-probe): RNGH's custom-criteria model.
            pan: PanGesture::new().min_distance(10.0),
            touched: None,
            reset_at: None,
            now: 0.0,
            images: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    /// Yoga's pixel rounding of an edge.
    fn round(&self, v: f64) -> f64 {
        (v * self.scale_px).round() / self.scale_px
    }

    /// The card's layout box (before rCardStyle): x, y, width, height.
    fn layout(&self) -> (f64, f64, f64, f64) {
        let (w, h) = self.size;
        let top = self.safe_top + BUTTON_ROW - CENTRED_SLACK;
        let bottom = self.round(h * 7.0 / 9.0);
        let box_h = bottom - top;
        let (cw, ch) = (w * 0.9, box_h * 0.75);
        let (x0, y0) = (self.round((w - cw) / 2.0), self.round(top + (box_h - ch) / 2.0));
        let (x1, y1) = (self.round((w + cw) / 2.0), self.round(top + (box_h + ch) / 2.0));
        (x0, y0, x1 - x0, y1 - y0)
    }

    fn third(&self) -> f64 {
        self.size.0 / 3.0
    }

    /// The derived rotate.
    fn rotate(&self, i: usize) -> f64 {
        let t = self.third();
        interpolate(self.cards[i].x.value, &[-t, 0.0, t], &[-std::f64::consts::PI / 20.0, 0.0, std::f64::consts::PI / 20.0], Extrapolation::Clamp)
    }

    /// Whether card i's transformed box holds the point (UIKit's hit test of the Animated.View).
    fn hits(&self, i: usize, px: f64, py: f64) -> bool {
        let c = &self.cards[i];
        if c.opacity.value < 0.01 {
            return false;
        }
        let (x, y, w, h) = self.layout();
        let (cx, cy) = (x + w / 2.0, y + h / 2.0);
        let r = self.rotate(i);
        let (dx, dy) = (px - cx, py - cy);
        // R⁻¹, then translateY(transY)⁻¹, scale⁻¹, translate(x, y)⁻¹.
        let (qx, qy) = (dx * r.cos() + dy * r.sin(), -dx * r.sin() + dy * r.cos());
        let s = c.scale.value;
        if s.abs() < 1e-9 {
            return false;
        }
        let (qx, qy) = (qx / s - c.x.value, (qy - c.lift.value) / s - c.y.value);
        qx.abs() <= w / 2.0 && qy.abs() <= h / 2.0
    }

    /// rCardStyle's withTimings, to the targets of the current activeIndex.
    fn restack(&mut self) {
        let a = self.active;
        let easing = Easing::timing_default();
        for (i, c) in self.cards.iter_mut().enumerate() {
            let d = i as f64 - a;
            let targets = [if d < 5.0 { 1.0 } else { 0.0 }, d * 23.0, 1.0 - 0.07 * d];
            for (t, to) in [&mut c.opacity, &mut c.lift, &mut c.scale].into_iter().zip(targets) {
                if t.target() != to {
                    t.to(to, 300.0, easing.clone());
                }
            }
        }
    }

    /// The card's swipeRight / swipeLeft.
    fn throw(&mut self, i: usize, sign: f64) {
        let max = self.size.0 * 1.5;
        self.cards[i].x.to(sign * max, 0.0, GENTLE);
        self.active += 1.0;
        self.restack();
    }

    /// useSwipeControls' swipeRight / swipeLeft: refs[activeIndex], none past the last.
    fn button_throw(&mut self, sign: f64) {
        let a = self.active;
        if a >= 0.0 && (a as usize) < COUNT && a.fract() == 0.0 {
            self.throw(a as usize, sign);
        }
    }

    fn reset(&mut self) {
        self.active = 0.0;
        self.restack();
        for c in &mut self.cards {
            c.reset_due = Some(None);
        }
        self.reset_at = None;
    }
}

impl Surface for SwipeCards {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |k: usize| inputs.get(k).and_then(|v| v.as_number()).unwrap_or(0.0);
        self.safe_top = n(0);
        let now = [n(1), n(2), n(3)];
        if let Some(was) = self.counters {
            if now[0] > was[0] {
                self.button_throw(-1.0);
            }
            if now[1] > was[1] {
                self.button_throw(1.0);
            }
            if now[2] > was[2] {
                self.reset();
            }
        }
        self.counters = Some(now);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let xs: Vec<String> = self.cards.iter().map(|c| format!("{:.1}", c.x.value)).collect();
        Some(format!("{{\"activeIndex\":{},\"x\":[{}],\"held\":{}}}", self.active, xs.join(","), self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        if phase == Phase::Down && !self.pan.tracking() {
            self.touched = (0..COUNT).find(|&i| self.hits(i, x as f64, y as f64));
        }
        let Some(i) = self.touched else { return };
        let third = self.third();
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Begin { .. } => self.current = self.active.floor(),
            Event::Start(p) | Event::Update(p) => {
                if self.current != i as f64 {
                    return;
                }
                let (tx, vx) = (p.translation_x as f64, p.velocity_x as f64);
                self.cards[i].x.set(tx);
                self.cards[i].y.set(p.translation_y as f64);
                let nx = interpolate(tx, &[-third, 0.0, third], &[-1.0, 0.0, 1.0], Extrapolation::Extend);
                let nv = interpolate(vx, &[-third / FLICK, 0.0, third / FLICK], &[-1.0, 0.0, 1.0], Extrapolation::Extend);
                let radius = tx.signum_js() * (nx * nx + nv * nv);
                let a = self.current;
                self.cards[i].next = interpolate(radius, &[-1.0, 0.0, 1.0], &[a + 1.0, a, a + 1.0], Extrapolation::Clamp);
            }
            Event::End(p) => self.finalize(i, p.translation_x as f64),
            Event::Fail => self.finalize(i, 0.0),
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
        self.size = (frame.width as f64, frame.height as f64);
        self.scale_px = frame.scale as f64;
        self.now = frame.now_ms;
        if self.images.is_none() {
            let decoded: Vec<skia::Image> = PHOTOS
                .iter()
                .map(|b| skia::Image::from_jpeg(b).unwrap_or(skia::Image { width: 1, height: 1, pixels: vec![0, 0, 0, 255] }))
                .collect();
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let now = frame.now_ms;
        // reset()'s timeouts: card i's ref.reset() at i × 100 ms.
        let mut moving = false;
        let start = *self.reset_at.get_or_insert(now);
        for (i, c) in self.cards.iter_mut().enumerate() {
            if let Some(due) = &mut c.reset_due {
                let at = *due.get_or_insert(start + i as f64 * 100.0);
                if now >= at {
                    c.reset_due = None;
                    if c.x.value != 0.0 {
                        c.x.to(0.0, 0.0, GENTLE);
                        c.y.to(0.0, 0.0, GENTLE);
                    }
                } else {
                    moving = true;
                }
            }
        }
        for c in &mut self.cards {
            moving |= c.x.step(now) | c.y.step(now) | c.opacity.step(now) | c.lift.step(now) | c.scale.step(now);
        }

        let (lx, ly, lw, lh) = self.layout();
        let (cx, cy) = ((lx + lw / 2.0) as f32, (ly + lh / 2.0) as f32);
        let (w, h) = (lw as f32, lh as f32);
        let rotations: Vec<f64> = (0..COUNT).map(|i| self.rotate(i)).collect();
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(images) = self.images.as_ref() {
            for i in (0..COUNT).rev() {
                let card = &self.cards[i];
                let opacity = card.opacity.value as f32;
                if opacity <= 0.0 {
                    continue;
                }
                c.save();
                c.translate(cx, cy);
                c.rotate(rotations[i] as f32);
                c.translate(0.0, card.lift.value as f32);
                let s = card.scale.value as f32;
                c.scale(s, s);
                c.translate(card.x.value as f32, card.y.value as f32);
                let photo = images.image(i);
                let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), Rect::new(-w / 2.0, -h / 2.0, w, h));
                c.draw_continuous_rrect(-w / 2.0, -h / 2.0, w, h, 25.0, &Paint::image(photo, placed.invert()).with_opacity(opacity));
                c.restore();
            }
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.pan.tracking()
    }
}

impl SwipeCards {
    /// onFinalize on card i.
    fn finalize(&mut self, i: usize, translation_x: f64) {
        self.touched = None;
        if self.current != i as f64 {
            return;
        }
        if self.cards[i].next == self.active + 1.0 {
            let sign = translation_x.signum_js();
            self.throw(i, if sign == 1.0 { 1.0 } else { -1.0 });
        } else {
            self.cards[i].x.to(0.0, 0.0, GENTLE);
            self.cards[i].y.to(0.0, 0.0, GENTLE);
        }
    }
}

/// JavaScript's Math.sign (0 for 0, where f64::signum gives 1).
trait SignJs {
    fn signum_js(self) -> f64;
}

impl SignJs for f64 {
    fn signum_js(self) -> f64 {
        if self > 0.0 {
            1.0
        } else if self < 0.0 {
            -1.0
        } else {
            0.0
        }
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    fn state(s: &mut Box<dyn Surface>) -> String {
        s.agent("{}").unwrap()
    }

    #[test]
    fn the_drag_moves_along_the_tilted_axes() {
        let mut s = SwipeCards::new();
        s.size = (420.0, 912.0);
        s.safe_top = 68.0;
        // A drag of 140 right: rotate = 140 / 140 × π/20 = 9°; the card's centre moves by
        // R(9°) · (140, 0): (138.3, 21.9) on the screen, not (140, 0).
        s.cards[0].x.set(140.0);
        let (x, y, w, h) = s.layout();
        let (cx, cy) = (x + w / 2.0, y + h / 2.0);
        let r = s.rotate(0);
        assert!((r - std::f64::consts::PI / 20.0).abs() < 1e-12);
        let (mx, my) = (cx + 140.0 * r.cos(), cy + 140.0 * r.sin());
        assert!(s.hits(0, mx, my));
        assert!((140.0 * r.sin() - 21.9).abs() < 0.05);
    }

    #[test]
    fn a_fling_throws_and_reset_brings_the_cards_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0), Value::Number(0.0), Value::Number(0.0), Value::Number(0.0)], None).unwrap();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "swipe-cards-rest", [0x24, 0x28, 0x31]);
        assert!(!moving);
        // A drag to the right, fast: thrown.
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        for k in 1..=8 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 210.0 + 20.0 * k as f32, 400.0, ms));
        }
        s.input(&pointer(PointerPhase::Up, 370.0, 400.0, ms + 8.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"), "{}", state(&mut s));
        while ms < 2000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(state(&mut s).contains("\"x\":[630.0,"), "{}", state(&mut s));
        // A slow, short drag on the next card springs back.
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        for k in 1..=10 {
            ms += 50.0;
            s.input(&pointer(PointerPhase::Move, 210.0 + 4.0 * k as f32, 400.0, ms));
        }
        s.input(&pointer(PointerPhase::Up, 250.0, 400.0, ms + 200.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"));
        // Reset (the third counter).
        s.bind(&[Value::Number(68.0), Value::Number(0.0), Value::Number(0.0), Value::Number(1.0)], None).unwrap();
        assert!(state(&mut s).contains("\"activeIndex\":0"));
        let t0 = ms;
        while ms < t0 + 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert_eq!(back.data, rest.data);
        // A tap on the front card now: its nextActiveIndex is still 1 (from its throw), so RN
        // throws it again, to the left (sign of a zero translation).
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        s.input(&pointer(PointerPhase::Up, 210.0, 400.0, ms + 50.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"), "{}", state(&mut s));
        // A button throw right (the second counter).
        s.bind(&[Value::Number(68.0), Value::Number(0.0), Value::Number(1.0), Value::Number(1.0)], None).unwrap();
        assert!(state(&mut s).contains("\"activeIndex\":2"));
    }
}
