//! A horizontal UIScrollView, as the demos' Rust surfaces model it (clock_time_picker's and
//! selectable_grid_list's model, shared): the drag is 1:1 inside the content and rubber-banded
//! past its ends (UIKit's `(1 − 1 / (x · 0.55 / d + 1)) · d`, d the port's width); at release
//! UIKit projects the resting offset (velocity · rate / (1 − rate), the deceleration rate per
//! ms), the app may move that target (RCTEnhancedScrollView's snapping), and the scroll then
//! decelerates exponentially onto it (rate per ms). Released past an end, or with velocity at an
//! end of a port with no room to scroll (`alwaysBounceHorizontal`), it bounces back, critically
//! damped. A finger down catches a moving scroll where it is.
//!
//! A drag that starts past an end (an offset set out of range, as RN's `contentOffset` prop
//! leaves it at mount) goes on from where the content is: its raw travel is the band's inverse
//! of that overshoot.

use gesture_handler::{Event, PanGesture, Phase};

/// UIScrollView.DecelerationRate.normal, per ms.
pub const NORMAL: f64 = 0.998;
/// UIScrollView.DecelerationRate.fast, per ms.
pub const FAST: f64 = 0.99;
/// The rubber band's constant.
const RUBBER: f64 = 0.55;
/// The bounce back to an end: critically damped at this rate (per ms).
const BOUNCE_RATE: f64 = 0.0125;

/// How a released scroll picks where it rests.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Snap {
    /// Where UIKit projects it.
    Free,
    /// RN's `snapToInterval` (snapToAlignment start): the interval index at or past the target
    /// in the velocity's direction (velocity > 0: ceil; < 0: floor; 0: round).
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

    Interval(f64),
}

#[derive(Clone, Copy, Debug)]
enum State {
    Idle,
    /// A finger moves it: the raw (unbanded) offset where the pan started, and the finger's x.
    Drag { raw: f64, x: f64 },
    Settle { from: f64, to: f64, at: f64 },
    Bounce { edge: f64, offset: f64, velocity: f64, at: Option<f64> },
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
    state: State,
    pan: PanGesture,
}

impl UiScroll {
    /// At `offset`, at rest.
    pub fn new(offset: f64, max: f64, port: f64, rate: f64, snap: Snap) -> UiScroll {
        UiScroll { offset, max, port, rate, snap, state: State::Idle, pan: PanGesture::new() }
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
        if raw < 0.0 {
            -self.band(-raw)
        } else if raw > self.max {
            self.max + self.band(raw - self.max)
        } else {
            raw
        }
    }

    /// The raw drag position of the offset shown now.
    fn raw(&self) -> f64 {
        if self.offset < 0.0 {
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
        match self.pan.event(id, phase, x, y, at_ms, inside) {
            Event::Start(p) => self.state = State::Drag { raw: self.raw(), x: p.x as f64 },
            Event::Update(p) => {
                if let State::Drag { raw, x } = self.state {
                    self.offset = self.dragged(raw + (x - p.x as f64));
                }
            }
            Event::End(p) => self.release(release_velocity(p.velocity_x, self.pan.rest_ms(at_ms))),
            Event::Fail => self.release(0.0),
            _ => {}
        }
    }

    fn release(&mut self, finger_velocity: f32) {
        // The content moves against the finger; points per ms.
        let v = -(finger_velocity as f64) / 1000.0;
        let (offset, max) = (self.offset, self.max);
        if offset < 0.0 || offset > max || (max <= 0.0 && v != 0.0) {
            let edge = if offset < 0.0 { 0.0 } else if offset > max { max } else { offset };
            self.state = State::Bounce { edge, offset, velocity: v, at: None };
            return;
        }
        let projected = offset + v * self.rate / (1.0 - self.rate);
        let to = match self.snap {
            Snap::Free => projected,
            Snap::Interval(w) => {
                let f = projected / w;
                let i = if v > 0.0 { f.ceil() } else if v < 0.0 { f.floor() } else { f.round() };
                i * w
            }
        }
        .clamp(0.0, max);
        self.state = if (to - offset).abs() < 1e-9 { State::Idle } else { State::Settle { from: offset, to, at: f64::NAN } };
    }

    /// Steps to the frame at `now`; whether it still moves.
    pub fn step(&mut self, now: f64) -> bool {
        match self.state {
            State::Settle { from, to, at } => {
                let at = if at.is_nan() { now } else { at };
                let x = to + (from - to) * self.rate.powf(now - at);
                if (x - to).abs() < 0.01 {
                    self.offset = to;
                    self.state = State::Idle;
                } else {
                    self.offset = x;
                    self.state = State::Settle { from, to, at };
                }
                true
            }
            State::Bounce { edge, offset, velocity, at } => {
                let at = at.unwrap_or(now);
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

    #[test]
    fn interval_snaps_in_the_flicks_direction() {
        let mut s = UiScroll::new(0.0, 3.0 * 420.0, 420.0, FAST, Snap::Interval(420.0));
        s.offset = 30.0;
        // A slow flick toward the next page: projected 30 + 0.3 · 99 = 59.7 → ceil → 420.
        s.release(-300.0);
        let mut ms = 0.0;
        while s.step(ms) {
            ms += 16.0;
        }
        assert_eq!(s.offset, 420.0);
    }
}
