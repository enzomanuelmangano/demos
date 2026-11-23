//! Pan, Tap, Pinch and Fling recognizers fed by raw pointer events, for GPU surfaces.
//!
//! A surface keeps one recognizer per gesture and passes it every pointer event (id, phase, canvas
//! position, time in ms); it answers with what happened (begin, start, update, end, fail). Not a
//! reimplementation of react-native-gesture-handler: it uses the same callback names and payload
//! shapes, and iOS's own recognizer thresholds, so the demos keep their feel.
//!
//! ```
//! use gestures::{Event, PanGesture, Phase};
//!
//! let mut pan = PanGesture::new();
//! pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
//! let Event::Start(p) = pan.event(1, Phase::Move, 20.0, 0.0, 132.0, true) else { panic!() };
//! assert_eq!(p.translation_x, 10.0);
//! ```
//!
//! - [`PanGesture`] begins on the first move `min_distance` (10 pt) or more from touch-down. By
//!   default its translation leaves out that 10 pt, except when it begins within
//!   [`UIKIT_DEFERRED_BEGIN_MS`] of touch-down, where it starts at 0. With `.min_distance(d)` set,
//!   the translation always starts at 0 where the pan activates.
//! - Pan velocity is points per second over the last 100 ms of samples, taken only from moves: a
//!   finger held still keeps its last velocity at the lift.
//! - [`TapGesture`] ends within `max_duration_ms` (500) and has no distance limit unless one is
//!   set (`max_distance` is a radius, `max_delta` bounds each axis).
//! - [`PinchGesture`] needs two fingers; its `scale` is their distance over the distance when the
//!   second came down.
//! - [`FlingGesture`] follows iOS's swipe recognizer and its thresholds.
//!
//! # Credits
//!
//! Callback names and payloads follow react-native-gesture-handler 3.x (MIT).

#![deny(missing_docs)]

/// A pointer's phase.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    /// Down.
    Down,
    /// Move.
    Move,
    /// Up.
    Up,
    /// Cancelled by the platform.
    Cancel,
}

/// What a recognizer says about an event.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Event {
    /// Nothing for this gesture.
    None,
    /// A finger it may claim is down at (x, y).
    Begin {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// The pan is active.
    Start(Pan),
    /// The pan moved.
    Update(Pan),
    /// The finger lifted while the pan was active.
    End(Pan),
    /// The gesture failed: the finger lifted or was cancelled before the pan began, or a tap broke a limit.
    Fail,
    /// A tap succeeded at (x, y).
    Tap {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
}

/// A pan's payload.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pan {
    /// The finger's x in the canvas.
    pub x: f32,
    /// The finger's y in the canvas.
    pub y: f32,
    /// Horizontal travel from where the pan activated (0 on start).
    pub translation_x: f32,
    /// Vertical travel from where the pan activated.
    pub translation_y: f32,
    /// Horizontal travel since the last update.
    pub change_x: f32,
    /// Vertical travel since the last update.
    pub change_y: f32,
    /// Horizontal velocity, points per second.
    pub velocity_x: f32,
    /// Vertical velocity, points per second.
    pub velocity_y: f32,
}

#[derive(Clone, Copy, Debug)]
struct Sample {
    x: f32,
    y: f32,
    ms: f64,
}

/// A pan that begins this soon after touch-down (ms) starts its translation at 0 at the finger; a
/// later one leaves out the `min_distance` travelled along the direction it set off in.
pub const UIKIT_DEFERRED_BEGIN_MS: f64 = 90.0;

/// A one-finger pan.
#[derive(Clone, Debug)]
pub struct PanGesture {
    /// Travel from touch-down, in points, before the pan begins.
    pub min_distance: f32,
    id: Option<u32>,
    start: (f32, f32),
    /// The touch-down's time.
    down_ms: f64,
    origin: (f32, f32),
    /// `.min_distance(d)` was set: the translation counts from the activation.
    custom: bool,
    last: (f32, f32),
    active: bool,
    samples: Vec<Sample>,
}

impl Default for PanGesture {
    fn default() -> Self {
        PanGesture::new()
    }
}

impl PanGesture {
    /// A pan that activates after 10 pt of travel.
    pub fn new() -> PanGesture {
        PanGesture { min_distance: 10.0, id: None, start: (0.0, 0.0), down_ms: 0.0, origin: (0.0, 0.0), custom: false, last: (0.0, 0.0), active: false, samples: Vec::with_capacity(16) }
    }
    /// A no-op kept for callers that still chain it; drop the call.
    #[doc(hidden)]
    pub fn uikit(self) -> PanGesture {
        self
    }
    /// Sets the travel before the pan begins; the translation then counts from the activation.
    pub fn min_distance(mut self, d: f32) -> PanGesture {
        self.min_distance = d;
        self.custom = true;
        self
    }
    /// Whether a finger is down on this gesture.
    pub fn tracking(&self) -> bool {
        self.id.is_some()
    }
    /// Whether the pan is active.
    pub fn active(&self) -> bool {
        self.active
    }
    /// How long since the finger last moved, at `now`.
    pub fn rest_ms(&self, now: f64) -> f64 {
        self.samples.last().map_or(0.0, |s| now - s.ms)
    }

    fn payload(&self, x: f32, y: f32) -> Pan {
        let (vx, vy) = self.velocity();
        Pan {
            x,
            y,
            translation_x: x - self.origin.0,
            translation_y: y - self.origin.1,
            change_x: x - self.last.0,
            change_y: y - self.last.1,
            velocity_x: vx,
            velocity_y: vy,
        }
    }

    fn velocity(&self) -> (f32, f32) {
        let Some(last) = self.samples.last() else { return (0.0, 0.0) };
        let first = self.samples.iter().find(|s| last.ms - s.ms <= 100.0).unwrap_or(last);
        let dt = (last.ms - first.ms) / 1000.0;
        if dt <= 0.0 {
            return (0.0, 0.0);
        }
        (((last.x - first.x) as f64 / dt) as f32, ((last.y - first.y) as f64 / dt) as f32)
    }

    fn sample(&mut self, x: f32, y: f32, ms: f64) {
        if self.samples.last().is_some_and(|s| s.x == x && s.y == y) {
            return; // a finger at rest sends no move, so its velocity stays
        }
        self.samples.retain(|s| ms - s.ms <= 150.0);
        self.samples.push(Sample { x, y, ms });
    }

    /// A pointer event; `claim` says whether a down here is this pan's (a hit test).
    pub fn event(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64, claim: bool) -> Event {
        match phase {
            Phase::Down => {
                if self.id.is_some() || !claim {
                    return Event::None;
                }
                self.id = Some(id);
                self.start = (x, y);
                self.down_ms = ms;
                self.origin = (x, y);
                self.last = (x, y);
                self.active = false;
                self.samples.clear();
                self.sample(x, y, ms);
                if self.min_distance <= 0.0 {
                    self.active = true;
                    return Event::Start(self.payload(x, y));
                }
                Event::Begin { x, y }
            }
            Phase::Move => {
                if self.id != Some(id) {
                    return Event::None;
                }
                self.sample(x, y, ms);
                let out = if self.active {
                    Event::Update(self.payload(x, y))
                } else {
                    let (dx, dy) = (x - self.start.0, y - self.start.1);
                    if (dx * dx + dy * dy).sqrt() >= self.min_distance {
                        self.active = true;
                        self.origin = if self.custom || ms - self.down_ms < UIKIT_DEFERRED_BEGIN_MS {
                            // A custom distance, or a begin right after touch-down: translation from the finger.
                            (x, y)
                        } else {
                            // The touch-down point moved `min_distance` along the set-off.
                            let d = (dx * dx + dy * dy).sqrt();
                            (self.start.0 + dx / d * self.min_distance, self.start.1 + dy / d * self.min_distance)
                        };
                        Event::Start(self.payload(x, y))
                    } else {
                        Event::None
                    }
                };
                self.last = (x, y);
                out
            }
            Phase::Up | Phase::Cancel => {
                if self.id != Some(id) {
                    return Event::None;
                }
                self.sample(x, y, ms);
                self.id = None;
                if self.active {
                    self.active = false;
                    Event::End(self.payload(x, y))
                } else {
                    Event::Fail
                }
            }
        }
    }
}

/// A single tap.
#[derive(Clone, Debug)]
pub struct TapGesture {
    /// The longest a tap may take from touch-down to lift, in ms.
    pub max_duration_ms: f64,
    /// The farthest the finger may move from touch-down, a radius; unlimited by default.
    pub max_distance: f32,
    /// The farthest the finger may move along each axis, |dx| and |dy|; unlimited by default.
    pub max_delta: (f32, f32),
    id: Option<u32>,
    start: (f32, f32, f64),
    failed: bool,
}

impl Default for TapGesture {
    fn default() -> Self {
        TapGesture { max_duration_ms: 500.0, max_distance: f32::INFINITY, max_delta: (f32::INFINITY, f32::INFINITY), id: None, start: (0.0, 0.0, 0.0), failed: false }
    }
}

impl TapGesture {
    /// Moving farther than `d` from touch-down fails the tap.
    pub fn max_distance(mut self, d: f32) -> TapGesture {
        self.max_distance = d;
        self
    }
    /// Moving farther than `dx` across or `dy` down fails the tap.
    pub fn max_delta(mut self, dx: f32, dy: f32) -> TapGesture {
        self.max_delta = (dx, dy);
        self
    }
    /// A tap held longer than `ms` fails.
    pub fn max_duration(mut self, ms: f64) -> TapGesture {
        self.max_duration_ms = ms;
        self
    }
    /// A pointer event; `claim` says whether a down here is this tap's.
    pub fn event(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64, claim: bool) -> Event {
        match phase {
            Phase::Down => {
                if self.id.is_some() || !claim {
                    return Event::None;
                }
                self.id = Some(id);
                self.start = (x, y, ms);
                self.failed = false;
                Event::Begin { x, y }
            }
            Phase::Move => {
                if self.id == Some(id) {
                    let (dx, dy) = (x - self.start.0, y - self.start.1);
                    // Each limit is tested only when it is set.
                    if dx.abs() > self.max_delta.0 || dy.abs() > self.max_delta.1 || (dx * dx + dy * dy).sqrt() > self.max_distance {
                        self.failed = true;
                    }
                }
                Event::None
            }
            Phase::Up | Phase::Cancel => {
                if self.id != Some(id) {
                    return Event::None;
                }
                self.id = None;
                if phase == Phase::Up && !self.failed && ms - self.start.2 <= self.max_duration_ms {
                    Event::Tap { x, y }
                } else {
                    Event::Fail
                }
            }
        }
    }
}

/// What a [`PinchGesture`] says about an event.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PinchEvent {
    /// Nothing for this gesture.
    None,
    /// Both fingers are down and moving.
    Start(Pinch),
    /// The pinch changed.
    Update(Pinch),
    /// A finger lifted or was cancelled while the pinch was active.
    End(Pinch),
}

/// A pinch's payload.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pinch {
    /// The fingers' distance over their distance when the second came down.
    pub scale: f32,
    /// The x of the point between the fingers, in the canvas.
    pub focal_x: f32,
    /// The y of the point between the fingers, in the canvas.
    pub focal_y: f32,
}

/// A two-finger pinch.
#[derive(Clone, Debug, Default)]
pub struct PinchGesture {
    /// The fingers down on it: id and where it is.
    fingers: [Option<(u32, f32, f32)>; 2],
    start_distance: f32,
    active: bool,
}

impl PinchGesture {
    /// Whether any finger is down on this gesture.
    pub fn tracking(&self) -> bool {
        self.fingers.iter().any(Option::is_some)
    }
    /// Whether the pinch is active.
    pub fn active(&self) -> bool {
        self.active
    }

    fn payload(&self) -> Pinch {
        let (Some((_, ax, ay)), Some((_, bx, by))) = (self.fingers[0], self.fingers[1]) else { return Pinch { scale: 1.0, ..Pinch::default() } };
        let d = (bx - ax).hypot(by - ay);
        Pinch { scale: if self.start_distance > 0.0 { d / self.start_distance } else { 1.0 }, focal_x: (ax + bx) / 2.0, focal_y: (ay + by) / 2.0 }
    }

    /// A pointer event; `claim` says whether a down here is this pinch's.
    pub fn event(&mut self, id: u32, phase: Phase, x: f32, y: f32, claim: bool) -> PinchEvent {
        let slot = self.fingers.iter().position(|f| f.is_some_and(|(i, _, _)| i == id));
        match phase {
            Phase::Down => {
                if slot.is_some() || !claim {
                    return PinchEvent::None;
                }
                let Some(free) = self.fingers.iter().position(Option::is_none) else { return PinchEvent::None };
                self.fingers[free] = Some((id, x, y));
                if let (Some((_, ax, ay)), Some((_, bx, by))) = (self.fingers[0], self.fingers[1]) {
                    self.start_distance = (bx - ax).hypot(by - ay);
                }
                PinchEvent::None
            }
            Phase::Move => {
                let Some(k) = slot else { return PinchEvent::None };
                self.fingers[k] = Some((id, x, y));
                if self.fingers.iter().any(Option::is_none) {
                    return PinchEvent::None;
                }
                if self.active {
                    PinchEvent::Update(self.payload())
                } else {
                    self.active = true;
                    PinchEvent::Start(self.payload())
                }
            }
            Phase::Up | Phase::Cancel => {
                let Some(k) = slot else { return PinchEvent::None };
                let payload = self.payload();
                self.fingers[k] = None;
                if self.active {
                    self.active = false;
                    PinchEvent::End(payload)
                } else {
                    PinchEvent::None
                }
            }
        }
    }
}

/// Fling directions, as bits of a mask.
pub mod directions {
    /// Rightward.
    pub const RIGHT: u32 = 1;
    /// Leftward.
    pub const LEFT: u32 = 2;
    /// Upward.
    pub const UP: u32 = 4;
    /// Downward.
    pub const DOWN: u32 = 8;
}

/// What a [`FlingGesture`] says about an event.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FlingEvent {
    /// Nothing for this gesture.
    None,
    /// A touch is down at (x, y); sent at the first touch, before anything is recognised.
    Begin {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// The swipe was recognised on this move.
    Start {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// The touch ended without a swipe.
    Fail,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Swipe {
    Possible,
    Recognized,
    Failed,
}

/// A swipe recognizer with iOS's swipe thresholds.
/// - A move later than `MAX_DURATION` (0.5 s) from the touch-down fails it.
/// - On each move, with t = min(time since touch-down, 0.5) and (dx, dy) the travel from the
///   touch-down, the needed primary travel is `MIN_PRIMARY` × (1 − t × (1 − `MIN_DECAY`)) and the
///   allowed sideways travel is `MAX_SECONDARY` × (1 − t × (1 − `MAX_DECAY`)).
/// - A single direction fails at any travel against it and at a sideways travel past the
///   allowance; it is recognised on the first move whose primary travel reaches the need.
/// - One more touch than `number_of_pointers` fails it, and so does a lift before it is
///   recognised. It resets when all its touches are up.
#[derive(Clone, Debug)]
pub struct FlingGesture {
    /// The directions that count, a mask of [`directions`].
    pub direction: u32,
    /// The number of touches required.
    pub number_of_pointers: usize,
    /// The touches it follows: id, where it came down, where it is.
    touches: Vec<(u32, f64, f64, f64, f64)>,
    /// Every touch down on it since its last reset.
    down: Vec<u32>,
    start_ms: f64,
    state: Swipe,
}

impl FlingGesture {
    /// The travel needed along the direction at touch-down, points.
    pub const MIN_PRIMARY: f64 = 50.0;
    /// The sideways travel allowed at touch-down, points.
    pub const MAX_SECONDARY: f64 = 50.0;
    /// How fast the needed travel decays: the share left after one second.
    pub const MIN_DECAY: f64 = 0.06;
    /// How fast the allowed sideways travel decays: the share left after one second.
    pub const MAX_DECAY: f64 = 0.02;
    /// The longest a swipe may take, seconds (also the cap on the decays' time).
    pub const MAX_DURATION: f64 = 0.5;

    /// A one-finger fling in `direction`.
    pub fn new(direction: u32) -> FlingGesture {
        FlingGesture { direction, number_of_pointers: 1, touches: Vec::with_capacity(4), down: Vec::with_capacity(4), start_ms: 0.0, state: Swipe::Possible }
    }

    /// Whether a touch is down on it.
    pub fn tracking(&self) -> bool {
        !self.down.is_empty()
    }

    /// Judges one touch's travel (dx, dy) after `time_s`: `Some(true)` recognised, `Some(false)`
    /// failed (too much movement), `None` still possible.
    pub fn check(direction: u32, dx: f64, dy: f64, time_s: f64) -> Option<bool> {
        let t = time_s.min(0.5);
        let min_primary = Self::MIN_PRIMARY * (1.0 - t * (1.0 - Self::MIN_DECAY));
        let max_secondary = Self::MAX_SECONDARY * (1.0 - t * (1.0 - Self::MAX_DECAY));
        let max_opposite = 0.0;
        let horizontal = direction & 3;
        let vertical = direction & 12;
        if (horizontal == directions::LEFT && dx > max_opposite)
            || (horizontal == directions::RIGHT && dx < -max_opposite)
            || (vertical == directions::DOWN && dy < -max_opposite)
            || (vertical == directions::UP && dy > max_opposite)
        {
            return Some(false);
        }
        let mut recognised = false;
        let mut failed = false;
        if horizontal != 0 {
            if dy.abs() > max_secondary {
                return Some(false);
            }
            recognised = dx.abs() >= min_primary;
        }
        if vertical != 0 {
            if dx.abs() > max_secondary {
                failed = true;
            } else if dy.abs() >= min_primary {
                recognised = true;
            }
        }
        if recognised {
            Some(true)
        } else if failed {
            Some(false)
        } else {
            None
        }
    }

    /// A pointer event; `claim` says whether a down here is this gesture's (a hit test).
    pub fn event(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64, claim: bool) -> FlingEvent {
        match phase {
            Phase::Down => {
                if !claim {
                    return FlingEvent::None;
                }
                if self.down.is_empty() {
                    self.state = Swipe::Possible;
                    self.touches.clear();
                }
                self.down.push(id);
                if self.state != Swipe::Possible {
                    return FlingEvent::None;
                }
                if self.touches.len() + 1 > self.number_of_pointers {
                    self.state = Swipe::Failed;
                    return FlingEvent::Fail;
                }
                let first = self.touches.is_empty();
                self.touches.push((id, x as f64, y as f64, x as f64, y as f64));
                self.start_ms = ms;
                if first {
                    FlingEvent::Begin { x, y }
                } else {
                    FlingEvent::None
                }
            }
            Phase::Move => {
                if self.state != Swipe::Possible {
                    return FlingEvent::None;
                }
                let Some(i) = self.touches.iter().position(|t| t.0 == id) else { return FlingEvent::None };
                let time = (ms - self.start_ms) / 1000.0;
                if time > Self::MAX_DURATION {
                    self.state = Swipe::Failed;
                    return FlingEvent::Fail;
                }
                self.touches[i].3 = x as f64;
                self.touches[i].4 = y as f64;
                let mut all = self.touches.len() == self.number_of_pointers;
                let mut failed = false;
                for t in &self.touches {
                    match Self::check(self.direction, t.3 - t.1, t.4 - t.2, time) {
                        Some(true) => {}
                        Some(false) => {
                            all = false;
                            failed = true;
                        }
                        None => all = false,
                    }
                }
                if all {
                    self.state = Swipe::Recognized;
                    FlingEvent::Start { x, y }
                } else if failed {
                    self.state = Swipe::Failed;
                    FlingEvent::Fail
                } else {
                    FlingEvent::None
                }
            }
            Phase::Up | Phase::Cancel => {
                let Some(k) = self.down.iter().position(|&d| d == id) else { return FlingEvent::None };
                self.down.swap_remove(k);
                self.touches.retain(|t| t.0 != id);
                if self.state == Swipe::Possible {
                    self.state = Swipe::Failed;
                    return FlingEvent::Fail;
                }
                FlingEvent::None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pan_starts_past_its_distance_and_reports_velocity() {
        let mut pan = PanGesture::new();
        assert!(matches!(pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true), Event::Begin { .. }));
        assert_eq!(pan.event(1, Phase::Move, 4.0, 0.0, 16.0, true), Event::None);
        let Event::Start(p) = pan.event(1, Phase::Move, 20.0, 0.0, 132.0, true) else { panic!() };
        assert_eq!(p.translation_x, 10.0, "the travel past UIKit's 10 pt hysteresis");
        let Event::End(p) = pan.event(1, Phase::Up, 40.0, 0.0, 148.0, true) else { panic!() };
        assert_eq!(p.translation_x, 30.0);
        assert!(p.velocity_x > 500.0, "{}", p.velocity_x);
        // With a custom distance the translation counts from the activation.
        let mut pan = PanGesture::new().min_distance(10.0);
        pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        let Event::Start(p) = pan.event(1, Phase::Move, 0.0, 20.0, 16.0, true) else { panic!() };
        assert_eq!(p.translation_y, 0.0);
    }

    #[test]
    fn uikit_zeroes_a_pan_that_begins_early() {
        // A 12 pt move within 90 ms of touch-down begins at 0; a later one begins at 2.
        for (ms, want) in [(30.0, 0.0), (70.0, 0.0), (97.0, 2.0), (130.0, 2.0)] {
            let mut pan = PanGesture::new();
            pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
            let Event::Start(p) = pan.event(1, Phase::Move, 12.0, 0.0, ms, true) else { panic!() };
            assert_eq!(p.translation_x, want, "{ms} ms");
            let Event::Update(p) = pan.event(1, Phase::Move, 60.0, 0.0, ms + 250.0, true) else { panic!() };
            assert_eq!(p.translation_x, 48.0 + want, "{ms} ms");
        }
        // A 0.6 s drag of 140 pt in 7 pt moves begins at 14 pt after about 66 ms → 126.
        let mut pan = PanGesture::new();
        pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        let mut last = Event::None;
        for i in 1..=20 {
            last = pan.event(1, Phase::Move, i as f32 * 7.0, 0.0, i as f64 * 30.0, true);
        }
        let Event::Update(p) = last else { panic!() };
        assert_eq!(p.translation_x, 126.0);
    }

    #[test]
    fn a_drag_held_still_keeps_its_velocity() {
        let mut pan = PanGesture::new();
        pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        for i in 1..=20 {
            pan.event(1, Phase::Move, i as f32 * 5.0, 0.0, i as f64 * 50.0, true);
        }
        for i in 1..=12 {
            pan.event(1, Phase::Move, 100.0, 0.0, 1000.0 + i as f64 * 50.0, true);
        }
        let Event::End(p) = pan.event(1, Phase::Up, 100.0, 0.0, 1700.0, true) else { panic!() };
        assert!((p.velocity_x - 100.0).abs() < 1.0, "{}", p.velocity_x);
    }

    #[test]
    fn pinch_scales_by_the_fingers_distance() {
        let mut pinch = PinchGesture::default();
        assert_eq!(pinch.event(1, Phase::Down, 100.0, 100.0, true), PinchEvent::None);
        assert_eq!(pinch.event(1, Phase::Move, 100.0, 90.0, true), PinchEvent::None);
        assert_eq!(pinch.event(2, Phase::Down, 100.0, 190.0, true), PinchEvent::None);
        let PinchEvent::Start(p) = pinch.event(2, Phase::Move, 100.0, 190.0, true) else { panic!() };
        assert_eq!(p.scale, 1.0);
        let PinchEvent::Update(p) = pinch.event(2, Phase::Move, 100.0, 290.0, true) else { panic!() };
        assert_eq!(p.scale, 2.0);
        assert_eq!(p.focal_y, 190.0);
        assert!(matches!(pinch.event(1, Phase::Up, 100.0, 90.0, true), PinchEvent::End(_)));
        assert!(!pinch.active());
    }

    #[test]
    fn tap_has_no_distance_limit_by_default() {
        let mut tap = TapGesture::default();
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        tap.event(1, Phase::Move, 300.0, 200.0, 50.0, true);
        assert_eq!(tap.event(1, Phase::Up, 300.0, 200.0, 60.0, true), Event::Tap { x: 300.0, y: 200.0 });
    }

    #[test]
    fn tap_fails_after_500_ms() {
        let mut tap = TapGesture::default();
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        assert_eq!(tap.event(1, Phase::Up, 0.0, 0.0, 500.0, true), Event::Tap { x: 0.0, y: 0.0 });
        tap.event(1, Phase::Down, 0.0, 0.0, 1000.0, true);
        assert_eq!(tap.event(1, Phase::Up, 0.0, 0.0, 1501.0, true), Event::Fail);
        let mut held = TapGesture::default().max_duration(f64::INFINITY);
        held.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        assert_eq!(held.event(1, Phase::Up, 0.0, 0.0, 5000.0, true), Event::Tap { x: 0.0, y: 0.0 });
    }

    #[test]
    fn tap_fails_past_max_dist() {
        let mut tap = TapGesture::default().max_distance(10.0);
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        tap.event(1, Phase::Move, 30.0, 0.0, 50.0, true);
        assert_eq!(tap.event(1, Phase::Up, 30.0, 0.0, 60.0, true), Event::Fail);
    }

    #[test]
    fn tap_max_delta_bounds_each_axis() {
        // With a 5 pt limit per axis, a 4.5 pt diagonal (6.4 pt away) still taps; 5.5 across fails.
        let mut tap = TapGesture::default().max_delta(5.0, 5.0);
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        tap.event(1, Phase::Move, 4.5, 4.5, 50.0, true);
        assert_eq!(tap.event(1, Phase::Up, 4.5, 4.5, 60.0, true), Event::Tap { x: 4.5, y: 4.5 });
        tap.event(1, Phase::Down, 0.0, 0.0, 100.0, true);
        tap.event(1, Phase::Move, 5.5, 0.0, 150.0, true);
        assert_eq!(tap.event(1, Phase::Up, 5.5, 0.0, 160.0, true), Event::Fail);
    }

    #[test]
    fn fling_is_uikits_swipe() {
        use directions::*;
        // The needed travel is 50 pt at touch-down, 45.3 pt at 0.1 s, 26.5 pt at 0.5 s.
        let mut f = FlingGesture::new(RIGHT);
        assert!(matches!(f.event(1, Phase::Down, 0.0, 0.0, 0.0, true), FlingEvent::Begin { .. }));
        assert_eq!(f.event(1, Phase::Move, 45.0, 0.0, 100.0, true), FlingEvent::None);
        assert!(matches!(f.event(1, Phase::Move, 45.4, 0.0, 100.0, true), FlingEvent::Start { .. }));
        assert_eq!(f.event(1, Phase::Move, 90.0, 0.0, 120.0, true), FlingEvent::None, "once a touch");
        assert_eq!(f.event(1, Phase::Up, 90.0, 0.0, 130.0, true), FlingEvent::None);
        // Sideways: 50 pt × (1 − 0.98 t) allowed (35.3 at 0.3 s).
        assert_eq!(FlingGesture::check(RIGHT, 40.0, 35.0, 0.3), Some(true));
        assert_eq!(FlingGesture::check(RIGHT, 40.0, 35.4, 0.3), Some(false));
        assert_eq!(FlingGesture::check(RIGHT, 30.0, -20.0, 0.3), None);
        // Any travel against the direction fails it; the other axis' direction does not matter.
        assert_eq!(FlingGesture::check(RIGHT, -0.5, 0.0, 0.1), Some(false));
        assert_eq!(FlingGesture::check(UP, 10.0, 0.5, 0.1), Some(false));
        assert_eq!(FlingGesture::check(UP, -10.0, -48.0, 0.0), None);
        assert_eq!(FlingGesture::check(UP, -10.0, -50.0, 0.0), Some(true));
        assert_eq!(FlingGesture::check(DOWN, 0.0, 26.5, 0.6), Some(true), "the decay stops at 0.5 s");
        // Too slow: a move after 0.5 s fails it, however far.
        let mut f = FlingGesture::new(LEFT);
        f.event(1, Phase::Down, 100.0, 0.0, 0.0, true);
        assert_eq!(f.event(1, Phase::Move, 90.0, 0.0, 400.0, true), FlingEvent::None);
        assert_eq!(f.event(1, Phase::Move, 0.0, 0.0, 501.0, true), FlingEvent::Fail);
        assert_eq!(f.event(1, Phase::Up, 0.0, 0.0, 510.0, true), FlingEvent::None);
        // A lift before it is recognised fails it; a second finger fails it.
        let mut f = FlingGesture::new(DOWN);
        f.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        assert_eq!(f.event(1, Phase::Up, 0.0, 20.0, 50.0, true), FlingEvent::Fail);
        f.event(1, Phase::Down, 0.0, 0.0, 100.0, true);
        assert_eq!(f.event(2, Phase::Down, 50.0, 0.0, 110.0, true), FlingEvent::Fail);
        assert_eq!(f.event(1, Phase::Move, 0.0, 80.0, 150.0, true), FlingEvent::None);
        f.event(1, Phase::Up, 0.0, 80.0, 160.0, true);
        f.event(2, Phase::Up, 50.0, 0.0, 170.0, true);
        // Reset once every touch is up.
        f.event(3, Phase::Down, 0.0, 0.0, 200.0, true);
        assert!(matches!(f.event(3, Phase::Move, 0.0, 60.0, 220.0, true), FlingEvent::Start { .. }));
    }
}
