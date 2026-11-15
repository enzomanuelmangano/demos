//! A horizontal scroll view that behaves like UIKit's UIScrollView.
//!
//! - Dragging is 1:1 inside the content and rubber-banded past its ends.
//! - On release the scroll decelerates onto the resting offset UIKit projects, or onto the snap
//!   point the surface asks for. A release past an end bounces back, critically damped. A finger
//!   down catches a moving scroll where it is.
//! - `bounces: false` holds the drag inside [0, max], with no band and no bounce.
//! - `scroll_to` is an animated `setContentOffset`: 300 ms on a sine ease-in-out.
//! - `take_drag_end` reports the lift of a finger that dragged, once.

use gesture_handler::{Event, PanGesture, Phase};

/// UIScrollView.DecelerationRate.normal, per ms.
pub const NORMAL: f64 = 0.998;
/// UIScrollView.DecelerationRate.fast, per ms.
pub const FAST: f64 = 0.99;
/// The rubber band's constant.
const RUBBER: f64 = 0.55;
/// The bounce back to an end: its rate, per ms.
const BOUNCE_RATE: f64 = 0.01088;
/// The bounce's pull toward the edge, per pt of overshoot (per ms).
const BOUNCE_PULL: f64 = 0.00797;
/// The speed, pt/ms, at which a deceleration stops. Projected rests use it too.
const STOP_VELOCITY: f64 = 0.00988;
/// −ln of the rate a snap glides at when the lift had no velocity and the rate is normal.
const SNAP_LAMBDA: f64 = 0.014644;
/// One display frame, ms.
const FRAME_MS: f64 = 1000.0 / 60.0;
/// How much of the content's velocity at the lift the bounce keeps.
const BOUNCE_CARRY: f64 = 1.656;

/// The velocity UIKit decelerates with at the lift: the last move's, however long the finger
/// then rested.
pub fn release_velocity(finger: f32) -> f32 {
    finger
}

/// The deceleration for a finger released at `finger` pt/s. Below about 335 pt/s there is no
/// fling: the scroll stops where the finger left it.
pub fn uiscroll_release(finger: f32) -> f32 {
    let v = release_velocity(finger);
    if v.abs() < 335.0 { 0.0 } else { v }
}

/// How a released scroll picks where it rests.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Snap {
    /// Where UIKit projects it.
    Free,
    /// The `snapToInterval` rule (snapToAlignment start): the interval index at or past the target
    /// in the velocity's direction (velocity > 0: ceil; < 0: floor; 0: round).
    Interval(f64),
    /// `snapToInterval` with `disableIntervalMomentum`: RCTScrollView takes the fractional
    /// index from the current offset at the lift, not the projected one (one interval per
    /// fling at most), then the same ceil / floor / round by the velocity's sign.
    IntervalCurrent(f64),
    /// `pagingEnabled` with pages this wide: UIKit's own paging (see [`page_spring`]).
    Page(f64),
}

/// UIKit's paging spring for pages `width` wide: (pull per ms², friction per ms), both linear in
/// the width.
pub fn page_spring(width: f64) -> (f64, f64) {
    (0.000_303_693_18 - (width - 300.0) * 1.846_591e-7, 0.969_801_136 + (width - 300.0) * 9.943_182e-6)
}

/// A paging release's flick threshold, pt/ms: faster lifts turn the page in their direction.
pub const PAGE_FLICK: f64 = 0.3;

/// UIKit's `setContentOffset(_:animated: true)`: its duration, ms.
pub const ANIMATED_MS: f64 = 300.0;

/// The fraction of an animated `setContentOffset` done at `u` (its time, 0…1).
pub fn animated_curve(u: f64) -> f64 {
    let u = u.clamp(0.0, 1.0);
    (1.0 - (std::f64::consts::PI * u).cos()) / 2.0
}

#[derive(Clone, Copy, Debug)]
enum State {
    Idle,
    /// A finger moves it: the raw (unbanded) offset where the pan started, and the finger's x.
    Drag { raw: f64, x: f64 },
    /// Decelerating onto `to` at `lambda` (−ln of the rate per ms), `at` its first frame.
    Settle { from: f64, to: f64, at: f64, lambda: f64 },
    /// A free fling whose projected rest lies past an end: it decelerates from `v` (offset per
    /// ms) at `lambda` until it crosses `edge`, then bounces on with the velocity it has there.
    Fling { from: f64, v: f64, at: f64, lambda: f64, edge: f64 },
    Bounce { edge: f64, offset: f64, velocity: f64, at: Option<f64> },
    /// A `pagingEnabled` release: UIKit's spring onto the page `to`, integrated per ms from the
    /// first frame after the lift (`at`), `x` / `v` at time `t`.
    Page { to: f64, x: f64, v: f64, at: f64, t: f64 },
    /// `setContentOffset(_:animated: true)`.
    Animate { from: f64, to: f64, at: f64 },
}

/// One horizontal scroll view.
#[derive(Clone, Debug)]
pub struct UiScroll {
    /// The offset (contentOffset.x).
    pub offset: f64,
    /// The largest offset in range (content width − port width, ≥ 0).
    pub max: f64,
    /// The port's width (the rubber band's dimension).
    pub port: f64,
    /// The deceleration rate per ms.
    pub rate: f64,
    /// Where a release rests.
    pub snap: Snap,
    /// `bounces` (default true): false holds the content inside its ends.
    pub bounces: bool,
    state: State,
    /// The pan has crossed its hysteresis once; UIKit begins it on the next move.
    armed: bool,
    drag_ended: bool,
    pan: PanGesture,
}

impl UiScroll {
    /// At `offset`, at rest.
    pub fn new(offset: f64, max: f64, port: f64, rate: f64, snap: Snap) -> UiScroll {
        UiScroll { offset, max, port, rate, snap, bounces: true, state: State::Idle, armed: false, drag_ended: false, pan: PanGesture::new() }
    }

    /// Whether it moves (or a finger holds it).
    pub fn moving(&self) -> bool {
        !matches!(self.state, State::Idle) || self.pan.tracking()
    }

    /// Whether a finger drags it.
    pub fn dragging(&self) -> bool {
        matches!(self.state, State::Drag { .. })
    }

    fn band(&self, x: f64) -> f64 {
        let d = self.port;
        (1.0 - 1.0 / (x * RUBBER / d + 1.0)) * d
    }

    /// The raw travel past an end that shows `y` of overshoot.
    fn unband(&self, y: f64) -> f64 {
        let d = self.port;
        let y = y.min(d * 0.999_999);
        (1.0 / (1.0 - y / d) - 1.0) * d / RUBBER
    }

    /// The offset a raw drag position shows.
    fn dragged(&self, raw: f64) -> f64 {
        if !self.bounces {
            raw.clamp(0.0, self.max.max(0.0))
        } else if raw < 0.0 {
            -self.band(-raw)
        } else if raw > self.max {
            self.max + self.band(raw - self.max)
        } else {
            raw
        }
    }

    /// The raw drag position of the offset shown now.
    fn raw(&self) -> f64 {
        if !self.bounces {
            self.offset
        } else if self.offset < 0.0 {
            -self.unband(-self.offset)
        } else if self.offset > self.max {
            self.max + self.unband(self.offset - self.max)
        } else {
            self.offset
        }
    }

    /// A pointer event; `inside` says whether a down here lands on the scroll view.
    pub fn input(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64, inside: bool) {
        if phase == Phase::Down && inside && !self.pan.tracking() && !self.dragging() {
            self.state = State::Idle;
        }
        let was_dragging = self.dragging();
        match self.pan.event(id, phase, x, y, at_ms, inside) {
            // The pan begins on the second move past UIKit's 10 pt hysteresis, and the content
            // follows from that move.
            Event::Start(_) => self.armed = true,
            Event::Update(p) if self.armed => {
                self.armed = false;
                self.state = State::Drag { raw: self.raw(), x: p.x as f64 };
            }
            Event::Update(p) => {
                if let State::Drag { raw, x } = self.state {
                    self.offset = self.dragged(raw + (x - p.x as f64));
                }
            }
            // Lifted before the pan began: no drag, nothing to decelerate.
            Event::End(_) if self.armed => self.armed = false,
            Event::End(p) => {
                self.release(uiscroll_release(p.velocity_x), release_velocity(p.velocity_x));
            }
            // A touch that never dragged: UIKit calls no scrollViewWillEndDragging, so the snap
            // never runs and a caught scroll rests where it is; only one past an end bounces back.
            Event::Fail => {
                if self.bounces && (self.offset < 0.0 || self.offset > self.max) {
                    self.release(0.0, 0.0);
                } else {
                    self.state = State::Idle;
                }
            }
            _ => {}
        }
        if was_dragging && !self.dragging() {
            self.drag_ended = true;
        }
    }

    /// Whether a finger that dragged has lifted since the last call, after the release has picked
    /// where the scroll rests.
    pub fn take_drag_end(&mut self) -> bool {
        std::mem::take(&mut self.drag_ended)
    }

    /// `setContentOffset(to, animated: true)`: from where the content is, whatever it was doing,
    /// over `ANIMATED_MS` on `animated_curve`; the first frame shows the start.
    pub fn scroll_to(&mut self, to: f64) {
        self.state = State::Animate { from: self.offset, to, at: f64::NAN };
    }
    /// `setContentOffset(to, animated: false)`: there at once, any
    /// deceleration, bounce or animation stopped.
    pub fn set_offset(&mut self, to: f64) {
        self.offset = to;
        if !self.dragging() {
            self.state = State::Idle;
        }
    }

    /// The bounce's start velocity (offset per ms) past `edge`, for a finger lifted at `finger`
    /// pt/s: the pull toward the edge plus the content's banded velocity.
    fn bounce_velocity(&self, offset: f64, edge: f64, finger: f64) -> f64 {
        let x = offset - edge;
        let content = -finger / 1000.0;
        if x == 0.0 {
            return content;
        }
        let raw = self.unband(x.abs());
        let slope = RUBBER / (raw * RUBBER / self.port + 1.0).powi(2);
        -BOUNCE_PULL * x + BOUNCE_CARRY * content * slope
    }

    /// The lift: `finger_velocity` (pt/s) as UIScrollView decelerates with it, `bounce_finger`
    /// the finger's velocity a bounce keeps (no deceleration threshold there).
    fn release(&mut self, finger_velocity: f32, bounce_finger: f32) {
        // The content moves against the finger; points per ms.
        let v = -(finger_velocity as f64) / 1000.0;
        let (offset, max) = (self.offset, self.max);
        if self.bounces && (offset < 0.0 || offset > max || (max <= 0.0 && v != 0.0)) {
            let edge = if offset < 0.0 { 0.0 } else if offset > max { max } else { offset };
            let velocity = self.bounce_velocity(offset, edge, bounce_finger as f64);
            self.state = State::Bounce { edge, offset, velocity, at: None };
            return;
        }
        if let Snap::Page(w) = self.snap {
            let f = offset / w;
            let i = if v > PAGE_FLICK { f.floor() + 1.0 } else if v < -PAGE_FLICK { f.ceil() - 1.0 } else { f.round() };
            let to = (i * w).clamp(0.0, max);
            self.state = State::Page { to, x: offset, v, at: f64::NAN, t: 0.0 };
            return;
        }
        // UIKit never decelerates slower than fast: a rate of 0.8 runs at 0.99.
        let lambda = -self.rate.max(FAST).ln();
        let projected = offset + v.signum() * (v.abs() - STOP_VELOCITY).max(0.0) / lambda;
        // A free fling projected past an end decelerates freely until it crosses the end, then
        // bounces from there with the velocity it crossed at. willEndDragging still reports the end.
        if self.snap == Snap::Free && self.bounces && (projected < 0.0 || projected > max) && v != 0.0 {
            let edge = if projected < 0.0 { 0.0 } else { max };
            self.state = State::Fling { from: offset, v, at: f64::NAN, lambda, edge };
            return;
        }
        let to = match self.snap {
            Snap::Free => projected,
            Snap::Interval(_) | Snap::IntervalCurrent(_) | Snap::Page(_) => {
                let (w, from) = match self.snap {
                    Snap::Interval(w) => (w, projected),
                    Snap::IntervalCurrent(w) => (w, offset),
                    _ => unreachable!(),
                };
                let f = from / w;
                let i = if v > 0.0 { f.ceil() } else if v < 0.0 { f.floor() } else { f.round() };
                i * w
            }
        }
        .clamp(0.0, max);
        // A snap moved with no velocity glides at UIKit's own rate, not the deceleration rate.
        let lambda = if v == 0.0 && self.rate > FAST { SNAP_LAMBDA } else { lambda };
        self.state = if (to - offset).abs() < 1e-9 { State::Idle } else { State::Settle { from: offset, to, at: f64::NAN, lambda } };
    }

    /// Steps to the frame at `now`; whether it still moves.
    pub fn step(&mut self, now: f64) -> bool {
        match self.state {
            State::Settle { from, to, at, lambda } => {
                let at = if at.is_nan() { now } else { at };
                // UIKit: e^(−λt) decay from the start velocity that lands on `to` as the velocity
                // falls to STOP_VELOCITY, where it stops.
                let d = (to - from).abs();
                let v = d * lambda + STOP_VELOCITY;
                let end = (v / STOP_VELOCITY).ln() / lambda;
                let t = now - at;
                if t >= end {
                    self.offset = to;
                    self.state = State::Idle;
                } else {
                    self.offset = from + (to - from).signum() * v / lambda * (1.0 - (-lambda * t).exp());
                    self.state = State::Settle { from, to, at, lambda };
                }
                true
            }
            State::Fling { from, v, at, lambda, edge } => {
                // As a bounce, the first frame after the lift already shows one display frame.
                let at = if at.is_nan() { now - FRAME_MS } else { at };
                let cross = -(1.0 - (edge - from) * lambda / v).ln() / lambda;
                let t = now - at;
                if t < cross {
                    self.offset = from + v / lambda * (1.0 - (-lambda * t).exp());
                    self.state = State::Fling { from, v, at, lambda, edge };
                } else {
                    self.state = State::Bounce { edge, offset: edge, velocity: v * (-lambda * cross).exp(), at: Some(at + cross) };
                    return self.step(now);
                }
                true
            }
            State::Bounce { edge, offset, velocity, at } => {
                // UIKit's first frame after the lift already shows one display frame of the bounce.
                let at = at.unwrap_or(now - FRAME_MS);
                let t = now - at;
                let (x0, w) = (offset - edge, BOUNCE_RATE);
                let x = (x0 + (velocity + w * x0) * t) * (-w * t).exp();
                if t > 0.0 && x.abs() < 0.01 {
                    self.offset = edge;
                    self.state = State::Idle;
                } else {
                    self.offset = edge + x;
                    self.state = State::Bounce { edge, offset, velocity, at: Some(at) };
                }
                true
            }
            State::Page { to, mut x, mut v, at, mut t } => {
                // The first frame shows about the lift's offset: the spring starts 1.33 ms before it.
                let at = if at.is_nan() { now - 1.333 } else { at };
                let (pull, friction) = page_spring(if let Snap::Page(w) = self.snap { w } else { self.port });
                while t + 1.0 <= now - at {
                    v = (v + (to - x) * pull) * friction;
                    x += v;
                    t += 1.0;
                }
                if (x - to).abs() < 0.5 && v.abs() < 0.0125 {
                    self.offset = to;
                    self.state = State::Idle;
                } else {
                    self.offset = x;
                    self.state = State::Page { to, x, v, at, t };
                }
                true
            }
            State::Animate { from, to, at } => {
                let at = if at.is_nan() { now } else { at };
                let u = (now - at) / ANIMATED_MS;
                self.offset = from + (to - from) * animated_curve(u);
                self.state = if u >= 1.0 { State::Idle } else { State::Animate { from, to, at } };
                true
            }
            State::Drag { .. } => true,
            State::Idle => self.pan.tracking(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_drag_past_an_end_goes_on_from_the_overshoot() {
        let mut s = UiScroll::new(94.5, 0.0, 420.0, NORMAL, Snap::Free);
        assert!((s.dragged(s.raw()) - 94.5).abs() < 1e-9);
        s.input(1, Phase::Down, 200.0, 10.0, 0.0, true);
        s.input(1, Phase::Move, 215.0, 10.0, 16.0, true);
        // Past 10 pt, and the next move begins it: no jump.
        s.input(1, Phase::Move, 230.0, 10.0, 24.0, true);
        assert!((s.offset - 94.5).abs() < 1e-9, "{}", s.offset);
        s.input(1, Phase::Move, 300.0, 10.0, 32.0, true);
        assert!(s.offset < 94.5 && s.offset > 0.0, "{}", s.offset);
        s.input(1, Phase::Up, 300.0, 10.0, 600.0, true);
        let mut ms = 600.0;
        while s.step(ms) {
            ms += 16.0;
            assert!(ms < 3000.0);
        }
        assert_eq!(s.offset, 0.0);
    }

    #[test]
    fn a_fling_past_the_start_overshoots_and_bounces_back() {
        // Frame by frame after a fling past the start, as UIKit's curve.
        let mut s = UiScroll::new(150.6667, 840.0, 420.0, NORMAL, Snap::Free);
        s.release(1053.4, 1053.4);
        let seen = [116.6667, 100.6667, 85.0, 70.0, 55.3333, 41.3333, 27.6667, 14.3333, 1.6667, -9.3333, -16.6667, -21.3333, -24.0, -25.0];
        let mut ms = 1000.0;
        s.step(ms);
        for x in seen {
            ms += FRAME_MS;
            s.step(ms);
            assert!((s.offset - x).abs() < 0.8, "{ms}: {} vs {x}", s.offset);
        }
        settle(&mut s, ms);
        assert_eq!(s.offset, 0.0);
    }

    #[test]
    fn paging_springs_back_as_uikit() {
        // Frame by frame after a rest release between pages, as UIKit's paging spring.
        let mut s = UiScroll::new(99.0, 1260.0, 420.0, NORMAL, Snap::Page(420.0));
        s.release(0.0, 0.0);
        let seen = [(8.333, 99.0), (50.0, 81.0), (83.333, 60.0), (150.0, 26.0), (250.0, 4.5), (350.0, 0.0)];
        s.step(8.333);
        for (t, x) in seen {
            s.step(t);
            assert!((s.offset - x).abs() < 1.5, "{t}: {} vs {x}", s.offset);
        }
        while s.step(1000.0) {}
        assert_eq!(s.offset, 0.0);
    }

    fn settle(s: &mut UiScroll, mut ms: f64) -> f64 {
        while s.step(ms) {
            ms += 16.0;
            assert!(ms < 10_000.0);
        }
        ms
    }

    #[test]
    fn interval_current_moves_one_interval_at_most() {
        // Interval snaps from the projected rest; IntervalCurrent moves one interval at most.
        let mut a = UiScroll::new(30.0, 7.0 * 300.0, 420.0, NORMAL, Snap::Interval(300.0));
        a.release(-3000.0, -3000.0);
        settle(&mut a, 0.0);
        assert_eq!(a.offset, 1800.0);
        let mut b = UiScroll::new(30.0, 7.0 * 300.0, 420.0, NORMAL, Snap::IntervalCurrent(300.0));
        b.release(-3000.0, -3000.0);
        settle(&mut b, 0.0);
        assert_eq!(b.offset, 300.0);
        let mut c = UiScroll::new(160.0, 7.0 * 300.0, 420.0, FAST, Snap::IntervalCurrent(300.0));
        c.release(0.0, 0.0);
        settle(&mut c, 0.0);
        assert_eq!(c.offset, 300.0);
    }

    #[test]
    fn without_bounces_a_drag_stops_at_the_ends() {
        let mut s = UiScroll::new(0.0, 900.0, 420.0, FAST, Snap::Free);
        s.bounces = false;
        s.input(1, Phase::Down, 100.0, 10.0, 0.0, true);
        s.input(1, Phase::Move, 130.0, 10.0, 16.0, true);
        s.input(1, Phase::Move, 300.0, 10.0, 32.0, true);
        assert_eq!(s.offset, 0.0, "no band past the start");
        s.input(1, Phase::Move, 150.0, 10.0, 48.0, true);
        assert!(s.offset > 0.0 && s.offset < 200.0, "{}", s.offset);
        s.input(1, Phase::Up, 150.0, 10.0, 600.0, true);
        assert!(s.take_drag_end());
        assert!(!s.take_drag_end(), "once");
        settle(&mut s, 600.0);
        assert!((0.0..=900.0).contains(&s.offset));
    }

    #[test]
    fn a_tap_is_no_drag_end() {
        let mut s = UiScroll::new(0.0, 900.0, 420.0, FAST, Snap::Free);
        s.input(1, Phase::Down, 100.0, 10.0, 0.0, true);
        s.input(1, Phase::Up, 100.0, 10.0, 50.0, true);
        assert!(!s.take_drag_end());
    }

    #[test]
    fn scroll_to_is_uikits_animated_offset() {
        let mut s = UiScroll::new(0.0, 2000.0, 420.0, FAST, Snap::Free);
        s.scroll_to(2000.0);
        assert!(s.step(100.0));
        assert_eq!(s.offset, 0.0, "the first frame shows the start");
        s.step(200.0);
        assert!((s.offset - 500.0).abs() < 1e-6, "{}", s.offset);
        s.step(250.0);
        assert!((s.offset - 1000.0).abs() < 1e-6, "{}", s.offset);
        s.step(400.0);
        assert_eq!(s.offset, 2000.0);
        assert!(!s.step(416.0));
    }

    #[test]
    fn interval_snaps_in_the_flicks_direction() {
        let mut s = UiScroll::new(0.0, 3.0 * 420.0, 420.0, FAST, Snap::Interval(420.0));
        s.offset = 30.0;
        // A slow flick toward the next page snaps to it.
        s.release(-300.0, -300.0);
        let mut ms = 0.0;
        while s.step(ms) {
            ms += 16.0;
        }
        assert_eq!(s.offset, 420.0);
    }

    #[test]
    fn the_bounce_is_uikits() {
        // Frame by frame after the lift: a rest release and a fling, both past the left end.
        let rest = [-87.67, -76.33, -66.67, -58.0, -50.33, -43.33, -37.67, -32.67, -28.0, -24.33, -21.0, -18.0];
        let fling = [-65.0, -60.33, -55.33, -50.33, -45.33, -40.67, -36.33, -32.33, -28.67, -25.33, -22.33, -19.67];
        for (from, finger, frames) in [(-100.33, 0.0, rest), (-69.33, 525.0, fling)] {
            let mut s = UiScroll::new(from, 0.0, 420.0, NORMAL, Snap::Free);
            s.release(0.0, finger);
            for (k, want) in frames.iter().enumerate() {
                s.step(k as f64 * FRAME_MS);
                assert!((s.offset - want).abs() < 0.8, "frame {k}: {} vs UIKit {want}", s.offset);
            }
        }
    }

    #[test]
    fn the_deceleration_is_uikits() {
        // Frame by frame of a free fling and of a snap, as UIKit's.
        let mut s = UiScroll::new(306.33, 2000.0, 420.0, NORMAL, Snap::Free);
        s.release(-698.4, -698.4);
        s.step(0.0);
        for (k, want) in [317.67, 379.0, 429.0, 470.0, 503.33, 531.0, 553.33, 571.67, 587.0, 599.33].iter().enumerate() {
            s.step((6 * k + 1) as f64 * FRAME_MS);
            assert!((s.offset - want).abs() < 1.2, "frame {}: {} vs UIKit {want}", 6 * k + 1, s.offset);
        }
        settle(&mut s, 200.0 * FRAME_MS);
        assert!((s.offset - 650.33).abs() < 0.5, "{}", s.offset);
        let mut s = UiScroll::new(53.67, 1260.0, 420.0, NORMAL, Snap::Interval(105.0));
        s.release(0.0, 0.0);
        s.step(0.0);
        for (k, want) in [65.0, 96.33, 103.33].iter().enumerate() {
            s.step((6 * k + 1) as f64 * FRAME_MS);
            assert!((s.offset - want).abs() < 0.5, "snap frame {}: {} vs UIKit {want}", 6 * k + 1, s.offset);
        }
    }

    #[test]
    fn rn_s_rate_0_8_is_fast() {
        // A rate of 0.8 decelerates at fast, and a snap glides at the fast rate.
        let mut s = UiScroll::new(53.67, 1000.0, 420.0, 0.8, Snap::Interval(84.0));
        s.release(0.0, 0.0);
        s.step(0.0);
        for (k, want) in [(1, 58.33), (5, 71.33), (9, 78.0)] {
            s.step(k as f64 * FRAME_MS);
            assert!((s.offset - want).abs() < 0.5, "frame {k}: {} vs UIKit {want}", s.offset);
        }
        let mut s = UiScroll::new(114.33, 1000.0, 420.0, 0.8, Snap::Free);
        s.release(-291.2, -291.2);
        settle(&mut s, 0.0);
        assert!((s.offset - 142.33).abs() < 0.3, "{}", s.offset);
    }

    #[test]
    fn a_flick_drags_from_the_second_move_past_the_hysteresis() {
        // The drag begins on the second move past the hysteresis, and the lift's own point does
        // not move the content.
        let mut s = UiScroll::new(0.0, 2000.0, 420.0, 0.8, Snap::Interval(84.0));
        let moves = [(18.2, 277.33), (36.9, 260.33), (55.5, 243.67), (73.2, 226.67), (90.2, 210.0), (115.1, 193.33)];
        s.input(1, Phase::Down, 294.0, 10.0, 0.0, true);
        for (ms, x) in moves {
            s.input(1, Phase::Move, x, 10.0, ms, true);
        }
        assert!((s.offset - 67.0).abs() < 0.01, "{}", s.offset);
        s.input(1, Phase::Up, 176.33, 10.0, 133.4, true);
        settle(&mut s, 140.0);
        assert_eq!(s.offset, 168.0);
    }

    #[test]
    fn a_lift_after_a_still_rest_flings() {
        // A lift after a still rest decelerates as a lift with no rest does.
        let fling = |rest: f64| {
            let mut s = UiScroll::new(0.0, 10000.0, 420.0, 0.998, Snap::Free);
            s.input(1, Phase::Down, 336.0, 10.0, 0.0, true);
            for k in 1..=24 {
                s.input(1, Phase::Move, 336.0 - 210.0 * k as f32 / 24.0, 10.0, 400.0 * k as f64 / 24.0, true);
            }
            let mut t = 400.0;
            while t < 400.0 + rest {
                t += 16.0;
                s.input(1, Phase::Move, 126.0, 10.0, t, true);
            }
            let lifted = s.offset;
            s.input(1, Phase::Up, 126.0, 10.0, t + 16.0, true);
            settle(&mut s, t + 16.0);
            s.offset - lifted
        };
        let (none, held) = (fling(0.0), fling(1000.0));
        assert!(held > 150.0, "{held}");
        assert!((held - none).abs() < 1.0, "{held} {none}");
    }
}
