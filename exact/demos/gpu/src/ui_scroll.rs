//! A horizontal UIScrollView, as the demos' Rust surfaces model it (clock_time_picker's and
//! selectable_grid_list's model, shared): the drag is 1:1 inside the content and rubber-banded
//! past its ends (UIKit's `(1 − 1 / (x · 0.55 / d + 1)) · d`, d the port's width); at release
//! UIKit projects the resting offset ((v − 0.00988) / −ln(rate) past the lift, the rate per ms),
//! the app may move that target (RCTEnhancedScrollView's snapping), and the scroll then
//! decelerates onto it: e^(−λt), λ = −ln(rate), from the start velocity that lands on the target
//! as the velocity falls to 0.00988 pt/ms, where it stops (a lift with no velocity whose target
//! the app moved glides at λ = 0.01464 instead). Measured with exact/demos/tools/scroll-probe
//! (free flings at 281 and 698 pt/s, RN's snapToInterval rule after flings at 264, 476 and 705
//! pt/s and after three still lifts): every frame of the eight within 1.1 pt. Released past an end, or with velocity at an
//! end of a port with no room to scroll (`alwaysBounceHorizontal`), it bounces back, critically
//! damped (`bounce_velocity`). A finger down catches a moving scroll where it is.
//!
//! The bounce, measured on the iOS 27.1 simulator with a bare UIScrollView logging contentOffset
//! per display frame (exact/demos/tools/scroll-probe, a port-wide scroll with
//! alwaysBounceHorizontal; releases at rest from 54 and 100 pt of overshoot, flings at 525 and
//! 788 pt/s released at 69 and 96 pt): x(t) = (x0 + (v0 + w·x0)·t)·e^(−w·t) from the lift, w =
//! 0.01088 per ms, its start velocity v0 toward the edge 0.00797 × the overshoot plus 1.656 × the
//! finger's velocity × the band's slope at that overshoot (the content's own velocity), away
//! from the edge. All four curves within 0.73 pt, every frame. (The earlier model, critically
//! damped from rest at 0.0125, was 6 pt behind UIKit 33 ms after a rest release.)
//!
//! A drag that starts past an end (an offset set out of range, as RN's `contentOffset` prop
//! leaves it at mount) goes on from where the content is: its raw travel is the band's inverse
//! of that overshoot.
//!
//! `bounces: false` (RN's `bounces={false}`) holds the drag inside [0, max], with no band and no
//! bounce. `scroll_to` is UIKit's `setContentOffset(_:animated: true)` (RN's animated
//! `scrollTo` / `scrollToIndex`), measured on the iOS 27 simulator (a probe logging
//! `contentOffset` per display frame for 100, 420, 932, −300 and 2000 pt): 300 ms whatever the
//! distance, on a sine ease-in-out (1 − cos πu) / 2, its first frame still at the start.
//! `take_drag_end` is RN's `onScrollEndDrag`: once, at the lift of a finger that dragged.

use gesture_handler::{Event, PanGesture, Phase};

/// UIScrollView.DecelerationRate.normal, per ms.
pub const NORMAL: f64 = 0.998;
/// UIScrollView.DecelerationRate.fast, per ms.
pub const FAST: f64 = 0.99;
/// The rubber band's constant.
const RUBBER: f64 = 0.55;
/// The bounce back to an end: critically damped at this rate (per ms), measured.
const BOUNCE_RATE: f64 = 0.01088;
/// The bounce's start velocity toward the edge, per pt of overshoot (per ms), measured.
const BOUNCE_PULL: f64 = 0.00797;
/// The velocity a deceleration stops at, pt/ms (measured: UIKit's projected rest is
/// (v − this) / −ln(rate) past the lift, and a changed target is reached with this velocity).
const STOP_VELOCITY: f64 = 0.00988;
/// −ln of the per-ms rate a snap glides at when the lift had no velocity (UIKit animates a target
/// set in willEndDragging at this rate, measured), whatever the deceleration rate.
const SNAP_LAMBDA: f64 = 0.014644;
/// One display frame, ms.
const FRAME_MS: f64 = 1000.0 / 60.0;
/// How much of the content's velocity at the lift the bounce keeps, measured.
const BOUNCE_CARRY: f64 = 1.656;

/// The finger's velocity UIScrollView decelerates with at the lift: none once the finger has
/// rested 100 ms (measured on the RN app: a drag held 1 s, then lifted, does not fling, where a
/// RNGH pan keeps its velocity).
pub fn release_velocity(finger: f32, rest_ms: f64) -> f32 {
    if rest_ms > 100.0 { 0.0 } else { finger }
}

/// UIScrollView's deceleration velocity for a finger released at `finger` pt/s (the crate's
/// 100 ms estimate), as measured on the RN app (selectable-grid-list's FlatList, iPhone Air
/// sim, steady drags whose moves reach the app every ~17.6 ms, lifted 34–48 ms after the
/// last; Exact's estimate logged from the same input): a finger at 313 pt/s does not fling
/// (nor slower ones), at 360 pt/s it flings 175 pt (Exact 180), at 672 pt/s 340 pt (Exact
/// 335), at 0.998 per ms. Below the threshold the scroll stops where the finger left it.
pub fn uiscroll_release(finger: f32, rest_ms: f64) -> f32 {
    let v = release_velocity(finger, rest_ms);
    if v.abs() < 335.0 { 0.0 } else { v }
}

/// How a released scroll picks where it rests.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Snap {
    /// Where UIKit projects it.
    Free,
    /// RN's `snapToInterval` (snapToAlignment start): the interval index at or past the target
    /// in the velocity's direction (velocity > 0: ceil; < 0: floor; 0: round).
    Interval(f64),
    /// `snapToInterval` with `disableIntervalMomentum`: RCTScrollView takes the fractional
    /// index from the current offset at the lift, not the projected one (one interval per
    /// fling at most), then the same ceil / floor / round by the velocity's sign.
    IntervalCurrent(f64),
}

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
    Bounce { edge: f64, offset: f64, velocity: f64, at: Option<f64> },
    /// `setContentOffset(_:animated: true)`.
    Animate { from: f64, to: f64, at: f64 },
}

/// One horizontal scroll view.
#[derive(Clone, Debug)]
pub struct UiScroll {
    /// contentOffset.x.
    pub offset: f64,
    /// The largest offset in range (content width − port width, ≥ 0).
    pub max: f64,
    /// The port's width (the rubber band's dimension).
    pub port: f64,
    /// The deceleration rate per ms.
    pub rate: f64,
    /// Where a release rests.
    pub snap: Snap,
    /// RN's `bounces` (default true): false holds the content inside its ends.
    pub bounces: bool,
    state: State,
    drag_ended: bool,
    pan: PanGesture,
}

impl UiScroll {
    /// At `offset`, at rest.
    pub fn new(offset: f64, max: f64, port: f64, rate: f64, snap: Snap) -> UiScroll {
        UiScroll { offset, max, port, rate, snap, bounces: true, state: State::Idle, drag_ended: false, pan: PanGesture::new() }
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
            Event::Start(p) => self.state = State::Drag { raw: self.raw(), x: p.x as f64 },
            Event::Update(p) => {
                if let State::Drag { raw, x } = self.state {
                    self.offset = self.dragged(raw + (x - p.x as f64));
                }
            }
            Event::End(p) => {
                let rest = self.pan.rest_ms(at_ms);
                self.release(uiscroll_release(p.velocity_x, rest), release_velocity(p.velocity_x, rest));
            }
            Event::Fail => self.release(0.0, 0.0),
            _ => {}
        }
        if was_dragging && !self.dragging() {
            self.drag_ended = true;
        }
    }

    /// Whether a finger that dragged has lifted since the last call (RN's `onScrollEndDrag`,
    /// after the release has picked where the scroll rests).
    pub fn take_drag_end(&mut self) -> bool {
        std::mem::take(&mut self.drag_ended)
    }

    /// `setContentOffset(to, animated: true)`: from where the content is, whatever it was doing,
    /// over `ANIMATED_MS` on `animated_curve`; the first frame shows the start.
    pub fn scroll_to(&mut self, to: f64) {
        self.state = State::Animate { from: self.offset, to, at: f64::NAN };
    }

    /// The bounce's start velocity (offset per ms) from `offset` past `edge`, for a finger lifted
    /// at `finger` pt/s (the content moves against it): UIKit's pull toward the edge plus what it
    /// keeps of the content's banded velocity (see the module's notes).
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
        let lambda = -self.rate.ln();
        let projected = offset + v.signum() * (v.abs() - STOP_VELOCITY).max(0.0) / lambda;
        let to = match self.snap {
            Snap::Free => projected,
            Snap::Interval(_) | Snap::IntervalCurrent(_) => {
                let (w, from) = match self.snap {
                    Snap::Interval(w) => (w, projected),
                    Snap::IntervalCurrent(w) => (w, offset),
                    Snap::Free => unreachable!(),
                };
                let f = from / w;
                let i = if v > 0.0 { f.ceil() } else if v < 0.0 { f.floor() } else { f.round() };
                i * w
            }
        }
        .clamp(0.0, max);
        // A snap moved with no velocity glides at UIKit's own rate, not the deceleration rate.
        let lambda = if v == 0.0 { SNAP_LAMBDA } else { lambda };
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
        // Activated at 15 pt: no jump.
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

    fn settle(s: &mut UiScroll, mut ms: f64) -> f64 {
        while s.step(ms) {
            ms += 16.0;
            assert!(ms < 10_000.0);
        }
        ms
    }

    #[test]
    fn interval_current_moves_one_interval_at_most() {
        // A hard fling from 30 at 3000 pt/s, NORMAL (× 499): projected 30 + 1497 = 1527, so
        // Interval rests on ceil(5.09) = page 6; IntervalCurrent on ceil(0.1) = page 1.
        let mut a = UiScroll::new(30.0, 7.0 * 300.0, 420.0, NORMAL, Snap::Interval(300.0));
        a.release(-3000.0, -3000.0);
        settle(&mut a, 0.0);
        assert_eq!(a.offset, 1800.0);
        let mut b = UiScroll::new(30.0, 7.0 * 300.0, 420.0, NORMAL, Snap::IntervalCurrent(300.0));
        b.release(-3000.0, -3000.0);
        settle(&mut b, 0.0);
        assert_eq!(b.offset, 300.0);
        // No velocity: the nearest, from where it is.
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
        s.input(1, Phase::Move, 100.0, 10.0, 48.0, true);
        assert!(s.offset > 0.0 && s.offset < 200.0, "{}", s.offset);
        s.input(1, Phase::Up, 100.0, 10.0, 600.0, true);
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
        // Measured: 0.25 a third in, 0.5 halfway (2000 pt, frames of 16.67 ms).
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
        // A slow flick toward the next page: projected 30 + 0.3 · 99 = 59.7 → ceil → 420.
        s.release(-300.0, -300.0);
        let mut ms = 0.0;
        while s.step(ms) {
            ms += 16.0;
        }
        assert_eq!(s.offset, 420.0);
    }

    #[test]
    fn the_bounce_is_uikits() {
        // scroll-probe, iPhone Air sim, iOS 27.1: contentOffset per display frame after the lift,
        // released at rest 100.33 pt past the left end, and flung at 525 pt/s from 69.33 past it.
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
        // scroll-probe: a free fling at 698.4 pt/s from 306.33 (UIKit's target 650.33), every 6th
        // frame after the lift; RN's snap from a still lift at 53.67 onto 105 (frames 1, 7, 13).
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
}
