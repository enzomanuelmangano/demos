//! Swipe cards: nine photos in a stack, the front one following the finger and thrown when it is
//! released far enough. Inputs: safeTop, then three counters the buttons bump (swipe left, swipe
//! right, reset).
//!
//! - The drag moves the card along its tilted, scaled axes. A release past the throw line (a third
//!   of the width, or a fast flick) throws the card; otherwise it springs back.
//! - Buttons throw the active card. Reset returns the cards one after another, 100 ms apart.
//! - Haptics, never per move: `haptic:impact-light` when a drag takes the front card (a tap plays
//!   none); `haptic:selection` when the drag first crosses the throw line, and again only after it
//!   returns REARM back under it; `haptic:impact-medium` when a card is thrown. A spring back
//!   plays nothing.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture, Phase};
use motion::{interpolate, Easing, Extrapolation, Spring, Timing, GENTLE};
use draw2d::{fit_cover, Canvas, Images, Paint, Rect, Renderer};

use crate::gfx;

const COUNT: usize = 9;
/// Height of the button row, pt.
const BUTTON_ROW: f64 = 56.0;
/// How far the card area rises into the button row, pt.
const CENTRED_SLACK: f64 = 40.0;
/// The time scale of a flick's velocity, s.
const FLICK: f64 = 0.1;
/// The shortest gap between a haptic and the next selection, ms. A flick that crosses the line
/// right after the grab, or a finger hovering on the line, adds no tap on top of the last one.
const HAPTIC_GAP_MS: f64 = 150.0;
/// The tilt at the throw line, rad (9 degrees); it grows linearly with the drag and holds there.
const MAX_TILT: f64 = std::f64::consts::PI / 20.0;
/// How far back under the throw line the drag must go before a new crossing plays again, pt.
const REARM: f64 = 24.0;

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
    /// Where a release would throw the card: the next active index.
    next: f64,
    /// When the reset reaches this card (None until the next frame stamps it).
    reset_due: Option<Option<f64>>,
}

struct SwipeCards {
    size: (f64, f64),
    scale_px: f64,
    safe_top: f64,
    /// The buttons' counters, as last bound (None before the first bind).
    counters: Option<[f64; 3]>,
    active: f64,
    /// The active index when the current gesture began.
    current: f64,
    cards: Vec<Card>,
    pan: PanGesture,
    /// The card the touch went to.
    touched: Option<usize>,
    reset_at: Option<f64>,
    now: f64,
    /// The drag's throw-line selection played and is not re-armed yet, and when it played.
    past_line: bool,
    haptic_at: f64,
    posted: Vec<String>,
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
            pan: PanGesture::new(),
            touched: None,
            reset_at: None,
            now: 0.0,
            past_line: false,
            haptic_at: f64::NEG_INFINITY,
            posted: Vec::new(),
            images: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    /// Rounds an edge to the device pixel grid.
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

    /// The card's tilt, from its horizontal drag.
    fn rotate(&self, i: usize) -> f64 {
        let t = self.third();
        interpolate(self.cards[i].x.value, &[-t, 0.0, t], &[-MAX_TILT, 0.0, MAX_TILT], Extrapolation::Clamp)
    }

    /// Where a release would throw the card: `current + 1` when the drag's translation and
    /// velocity, each normalised to 1 at the throw line and at a flick, reach the unit circle
    /// (no arctangent: the card's tilt and this decision are both piecewise linear), else `current`.
    fn decide(&self, tx: f64, vx: f64, current: f64) -> f64 {
        let third = self.third();
        let nx = interpolate(tx, &[-third, 0.0, third], &[-1.0, 0.0, 1.0], Extrapolation::Extend);
        let nv = interpolate(vx, &[-third / FLICK, 0.0, third / FLICK], &[-1.0, 0.0, 1.0], Extrapolation::Extend);
        let radius = tx.signum_js() * (nx * nx + nv * nv);
        interpolate(radius, &[-1.0, 0.0, 1.0], &[current + 1.0, current, current + 1.0], Extrapolation::Clamp)
    }

    /// Posts a selection unless a haptic played less than HAPTIC_GAP_MS ago.
    fn select(&mut self, at_ms: f64) {
        if at_ms - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = at_ms;
        }
    }

    /// Whether the point lands on card i's transformed box. A faded-out card takes no touches.
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

    /// Animates each card's fade, offset and scale to its place for the active index.
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

    /// Throws card i to the right (sign 1) or the left (sign -1).
    fn throw(&mut self, i: usize, sign: f64) {
        let max = self.size.0 * 1.5;
        self.cards[i].x.to(sign * max, 0.0, GENTLE);
        self.active += 1.0;
        self.restack();
    }

    /// A button throws the active card; none past the last.
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

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
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
        let event = self.pan.event(id, phase, x, y, at_ms, true);
        let event_kind = if matches!(event, Event::Start(_)) { Kind::Start } else { Kind::Other };
        match event {
            Event::Begin { .. } => {
                self.current = self.active.floor();
                self.past_line = false;
            }
            Event::Start(p) | Event::Update(p) => {
                if self.current != i as f64 {
                    return;
                }
                if matches!(event_kind, Kind::Start) {
                    self.posted.push("haptic:impact-light".into());
                    self.haptic_at = at_ms;
                }
                let (tx, vx) = (p.translation_x as f64, p.velocity_x as f64);
                // Past the throw line a release throws at any speed. One selection on the way out,
                // re-armed only REARM back under the line.
                if !self.past_line && tx.abs() >= third {
                    self.past_line = true;
                    self.select(at_ms);
                } else if self.past_line && tx.abs() < third - REARM {
                    self.past_line = false;
                }
                self.cards[i].x.set(tx);
                self.cards[i].y.set(p.translation_y as f64);
                let a = self.current;
                self.cards[i].next = self.decide(tx, vx, a);
            }
            Event::End(p) => self.finalize(i, p.translation_x as f64, at_ms),
            Event::Fail => self.finalize(i, 0.0, at_ms),
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
            let decoded: Vec<draw2d::Image> = PHOTOS
                .iter()
                .map(|b| draw2d::Image::from_jpeg(b).unwrap_or(draw2d::Image { width: 1, height: 1, pixels: vec![0, 0, 0, 255] }))
                .collect();
            let refs: Vec<&draw2d::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let now = frame.now_ms;
        // Reset staggers the cards: card i at i × 100 ms.
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
    /// Release on card i: throws it if the drag reached the next index, else springs it back.
    fn finalize(&mut self, i: usize, translation_x: f64, at_ms: f64) {
        self.touched = None;
        if self.current != i as f64 {
            return;
        }
        if self.cards[i].next == self.active + 1.0 {
            let sign = translation_x.signum_js();
            self.throw(i, if sign == 1.0 { 1.0 } else { -1.0 });
            // The throw always plays; it is the one tap a flick ends with.
            self.posted.push("haptic:impact-medium".into());
            self.haptic_at = at_ms;
        } else {
            self.cards[i].x.to(0.0, 0.0, GENTLE);
            self.cards[i].y.to(0.0, 0.0, GENTLE);
        }
    }
}

/// Which pan event an input brought (Start plays the grab).
enum Kind {
    Start,
    Other,
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
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false }
    }

    fn state(s: &mut Box<dyn Surface>) -> String {
        s.agent("{}").unwrap()
    }

    #[test]
    fn the_drag_moves_along_the_tilted_axes() {
        let mut s = SwipeCards::new();
        s.size = (420.0, 912.0);
        s.safe_top = 68.0;
        // The drag follows the card's tilted axes, not the screen's.
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
    fn hovering_at_the_throw_line_plays_one_selection() {
        let mut s = SwipeCards::new();
        s.size = (420.0, 912.0);
        s.safe_top = 68.0;
        let mut ms = 0.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        // Slowly out to the line (140), then back and forth across it by 10 pt, many times.
        let mut x = 210.0;
        for k in 0..60 {
            ms += 50.0;
            x = if k < 16 { 210.0 + 10.0 * k as f32 } else if k % 2 == 0 { 355.0 } else { 345.0 };
            s.input(&pointer(PointerPhase::Move, x, 400.0, ms));
        }
        let posted = s.messages();
        assert_eq!(posted, vec!["haptic:impact-light", "haptic:selection"], "{posted:?}");
        for x2 in [300.0, 260.0, 300.0, 360.0] {
            ms += 50.0;
            s.input(&pointer(PointerPhase::Move, x2, 400.0, ms));
        }
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        s.input(&InputEvent::Pointer { id: 2, phase: PointerPhase::Down, x: 100.0, y: 400.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false });
        assert!(s.messages().is_empty());
        let _ = x;
    }

    #[test]
    fn the_tilt_and_the_throw_decision_are_the_linear_ones_not_an_arctangent() {
        let mut s = SwipeCards::new();
        s.size = (420.0, 912.0);
        let deg = |r: f64| r.to_degrees();
        // 9 degrees at the throw line (140 pt), linear below it, held beyond it, mirrored.
        for (x, want) in [(0.0, 0.0), (35.0, 2.25), (70.0, 4.5), (140.0, 9.0), (400.0, 9.0), (-70.0, -4.5), (-140.0, -9.0)] {
            s.cards[0].x.set(x);
            assert!((deg(s.rotate(0)) - want).abs() < 1e-9, "{x}: {}", deg(s.rotate(0)));
        }
        // The decision is the unit circle of translation / 140 pt and velocity / 1400 pt/s.
        let thrown = |tx: f64, vx: f64| s.decide(tx, vx, 3.0) == 4.0;
        assert!(!thrown(0.0, 0.0) && !thrown(100.0, 0.0) && thrown(140.0, 0.0) && thrown(-141.0, 0.0));
        // 0.6^2 + 0.8^2 = 1: 84 pt at 1120 pt/s sits exactly on the circle.
        assert!(thrown(84.0, 1120.0) && !thrown(83.0, 1120.0) && thrown(-84.0, -1120.0));
        // A fast flick back against the drag's side is not a throw: the sign is the translation's.
        assert_eq!(s.decide(-20.0, 2000.0, 3.0), 4.0);
        assert_eq!(s.decide(0.0, 5000.0, 3.0), 3.0);
        // Between the two it blends: radius 0.5 is half way to the next index.
        assert!((s.decide(140.0 * 0.5f64.sqrt(), 0.0, 3.0) - 3.5).abs() < 1e-9);
    }

    #[test]
    fn a_drag_makes_few_haptics_never_one_per_move() {
        let play = |moves: &dyn Fn(usize) -> f32, steps: usize, dt: f64| {
            let mut s = SwipeCards::new();
            s.size = (420.0, 912.0);
            s.safe_top = 68.0;
            let mut ms = 0.0;
            s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
            for k in 0..steps {
                ms += dt;
                s.input(&pointer(PointerPhase::Move, 210.0 + moves(k), 400.0, ms));
            }
            s.input(&pointer(PointerPhase::Up, 210.0, 400.0, ms + dt));
            s.messages()
        };
        let count = |m: &[String], k: &str| m.iter().filter(|x| x.as_str() == k).count();
        // Sweeping across the throw line and 60 pt back, again and again every 60 ms, for 6 s:
        // one grab, and a selection at most every 150 ms (and each needs the 24 pt re-arm).
        let sweep = play(&|k| if k % 2 == 0 { 100.0 } else { 20.0 }, 100, 60.0);
        assert_eq!(count(&sweep, "haptic:impact-light"), 1, "{sweep:?}");
        assert!(count(&sweep, "haptic:selection") <= 6000 / 150, "{sweep:?}");
        // The release may throw (the sweep's last move is fast): one tap, at the end.
        assert!(count(&sweep, "haptic:impact-medium") <= 1, "{sweep:?}");
        // A flick that passes the line in the first 100 ms: the grab and the throw, nothing between.
        let flick = play(&|k| 40.0 * (k + 1) as f32, 6, 16.0);
        assert_eq!(flick, vec!["haptic:impact-light", "haptic:impact-medium"], "{flick:?}");
        // A slow drag to the line and a release: grab, line, throw.
        let slow = play(&|k| 12.0 * (k + 1) as f32, 14, 50.0);
        assert_eq!(slow, vec!["haptic:impact-light", "haptic:selection", "haptic:impact-medium"], "{slow:?}");
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
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        for k in 1..=8 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 210.0 + 20.0 * k as f32, 400.0, ms));
        }
        s.input(&pointer(PointerPhase::Up, 370.0, 400.0, ms + 8.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"), "{}", state(&mut s));
        // The line is crossed 100 ms after the grab: too soon after it for a tap of its own.
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:impact-medium"]);
        while ms < 2000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(state(&mut s).contains("\"x\":[630.0,"), "{}", state(&mut s));
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        for k in 1..=10 {
            ms += 50.0;
            s.input(&pointer(PointerPhase::Move, 210.0 + 4.0 * k as f32, 400.0, ms));
        }
        s.input(&pointer(PointerPhase::Up, 250.0, 400.0, ms + 200.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"));
        assert_eq!(s.messages(), vec!["haptic:impact-light"]);
        let t0 = ms;
        while ms < t0 + 1000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.messages().is_empty());
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
        // next survives the reset, so a tap throws the card again, to the left.
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, ms));
        s.input(&pointer(PointerPhase::Up, 210.0, 400.0, ms + 50.0));
        assert!(state(&mut s).contains("\"activeIndex\":1"), "{}", state(&mut s));
        s.bind(&[Value::Number(68.0), Value::Number(0.0), Value::Number(1.0), Value::Number(1.0)], None).unwrap();
        assert!(state(&mut s).contains("\"activeIndex\":2"));
    }
}
