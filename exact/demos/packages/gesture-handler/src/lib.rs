//! react-native-gesture-handler's Pan, Tap, Pinch and Fling, recognised from the pointer events a canvas
//! that asks for input receives (exact-gpu's `InputEvent::Pointer`, in canvas points with the
//! host's clock). A surface keeps one recognizer per gesture and asks it, per event, what the
//! RNGH callbacks would have been told.
//!
//! What RNGH's iOS handlers do, kept here:
//! - Pan begins once the finger has moved `min_distance` (RNGH's `minDist`, UIKit's 10 pt
//!   hysteresis by default) and reports `translationX/Y` without that hysteresis, as RNGH on
//!   iOS does. A plain `Gesture.Pan()` is UIKit's pan, whose translation leaves out exactly the
//!   10 pt along the direction it set off in: at activation it is the travel past 10 pt, not 0
//!   and not the travel from touch-down. Measured on the RN app (iPhone Air sim, argent moves):
//!   104.5 pt → 94.3 (wheel-picker, 5.2 pt moves), 140 → 130.2 (3.5 pt moves), 99.95 → 90.1
//!   (floating-modal, whose moves cross 10 pt only at 14.3). RNGH's custom criteria (`minDist`
//!   here) instead `setTranslation(.zero)` at activation (RNPanHandler.m): from that point. The
//!   demo screen's close Pan (activeOffsetY 10, failOffsetX ±30) does not delay a demo's pan:
//!   horizontal and vertical drags measured the same.
//! - Velocity is points per second, from the last 100 ms of samples (UIKit's estimate), only
//!   from samples where the finger moved: UIKit hears no `touchesMoved` from a finger at rest, so a drag held still keeps its last velocity at the lift (measured on the RN app:
//!   a ruler dragged at ~100 pt/s, held 600 ms, then lifted still flings one more tick).
//! - Tap ends within `max_duration_ms` (500) having moved less than `max_distance` (10).
//! - Pinch is two fingers: it starts when one of them moves while both are down, and its
//!   `scale` is their distance over the distance when the second came down (UIKit's
//!   `UIPinchGestureRecognizer.scale`, 1 at the start); it ends when either lifts.
//! - Fling is UIKit's `UISwipeGestureRecognizer` with its own thresholds ([`FlingGesture`]).

#![deny(missing_docs)]

/// A pointer's phase, as exact-gpu's `PointerPhase` names it.
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
    /// `onBegin`: a finger it may claim is down at (x, y).
    Begin {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// `onStart`: the pan is active.
    Start(Pan),
    /// `onUpdate` / `onChange`.
    Update(Pan),
    /// `onEnd`: the finger lifted while active.
    End(Pan),
    /// `onFinalize` without activating (lifted or cancelled before the pan began).
    Fail,
    /// A tap's `onEnd` (success) at (x, y).
    Tap {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
}

/// A pan's payload (RNGH `PanGestureHandlerEventPayload`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pan {
    /// `x`, `y`: the finger in the canvas.
    pub x: f32,
    /// See `x`.
    pub y: f32,
    /// `translationX/Y`: from where the pan activated (0 on `onStart`).
    pub translation_x: f32,
    /// See `translation_x`.
    pub translation_y: f32,
    /// `changeX/Y`: since the last update.
    pub change_x: f32,
    /// See `change_x`.
    pub change_y: f32,
    /// `velocityX/Y`: points per second.
    pub velocity_x: f32,
    /// See `velocity_x`.
    pub velocity_y: f32,
}

#[derive(Clone, Copy, Debug)]
struct Sample {
    x: f32,
    y: f32,
    ms: f64,
}

/// A one-finger pan.
#[derive(Clone, Debug)]
pub struct PanGesture {
    /// RNGH `minDist`.
    pub min_distance: f32,
    id: Option<u32>,
    start: (f32, f32),
    origin: (f32, f32),
    /// `.min_distance(d)` was set: RNGH's custom criteria, translation from the activation.
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
    /// `Gesture.Pan()`: activates after 10 pt of travel, as UIKit's pan does.
    pub fn new() -> PanGesture {
        PanGesture { min_distance: 10.0, id: None, start: (0.0, 0.0), origin: (0.0, 0.0), custom: false, last: (0.0, 0.0), active: false, samples: Vec::with_capacity(16) }
    }
    /// The former opt-in, now the only behaviour: a no-op kept so callers written against it
    /// still build (swipe_cards); drop the call.
    #[doc(hidden)]
    pub fn uikit(self) -> PanGesture {
        self
    }
    /// `.minDistance(d)`.
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
    /// UIScrollView, unlike a pan's velocity, does not fling a drag held still before the lift.
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
            return; // a finger at rest: UIKit hears no move, its velocity stays
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
                        self.origin = if self.custom {
                            (x, y)
                        } else {
                            // UIKit: the touch-down point moved 10 pt along the set-off.
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
    /// RNGH `maxDuration`.
    pub max_duration_ms: f64,
    /// RNGH `maxDist`.
    pub max_distance: f32,
    id: Option<u32>,
    start: (f32, f32, f64),
    failed: bool,
}

impl Default for TapGesture {
    fn default() -> Self {
        TapGesture { max_duration_ms: 500.0, max_distance: 10.0, id: None, start: (0.0, 0.0, 0.0), failed: false }
    }
}

impl TapGesture {
    /// `.maxDistance(d)` (or `.maxDeltaX(d).maxDeltaY(d)`, as a radius): moving farther fails it.
    pub fn max_distance(mut self, d: f32) -> TapGesture {
        self.max_distance = d;
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
                    if (dx * dx + dy * dy).sqrt() > self.max_distance {
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
    /// `onStart`: both fingers down and moving.
    Start(Pinch),
    /// `onUpdate` / `onChange`.
    Update(Pinch),
    /// `onEnd`: a finger lifted (or was cancelled) while active.
    End(Pinch),
}

/// A pinch's payload (RNGH `PinchGestureHandlerEventPayload`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pinch {
    /// `scale`: the fingers' distance over their distance when the second came down.
    pub scale: f32,
    /// `focalX/Y`: the point between the fingers, in the canvas.
    pub focal_x: f32,
    /// See `focal_x`.
    pub focal_y: f32,
}

/// A two-finger pinch (`Gesture.Pinch()`).
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

/// RNGH's `Directions` (`Directions.RIGHT` …), the bits of UIKit's
/// `UISwipeGestureRecognizerDirection` that RNFlingHandler hands its recognizer.
pub mod directions {
    /// `Directions.RIGHT`.
    pub const RIGHT: u32 = 1;
    /// `Directions.LEFT`.
    pub const LEFT: u32 = 2;
    /// `Directions.UP`.
    pub const UP: u32 = 4;
    /// `Directions.DOWN`.
    pub const DOWN: u32 = 8;
}

/// What a [`FlingGesture`] says about an event.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FlingEvent {
    /// Nothing for this gesture.
    None,
    /// `onBegin`: RNBetterSwipeGestureRecognizer's touchesBegan sends BEGAN at the first touch.
    Begin {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// `onStart` (then `onEnd`): the swipe recognised on this move.
    Start {
        /// Canvas x.
        x: f32,
        /// Canvas y.
        y: f32,
    },
    /// `onFinalize` without activating.
    Fail,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Swipe {
    Possible,
    Recognized,
    Failed,
}

/// `Gesture.Fling().direction(d)` on iOS: RNGH 3.3's RNFlingHandler is UIKit's
/// `UISwipeGestureRecognizer` (RNBetterSwipeGestureRecognizer only adds the BEGAN at touch-down),
/// so this is UIKit's swipe as UIKitCore runs it (`-[UISwipeGestureRecognizer touchesMoved:]` and
/// `_checkForSwipeWithDelta:time:currentPositionChange:currentTimeChange:indirect:`, read from
/// the arm64 code and the defaults a fresh recognizer holds: exact/parity-tools/swipe-probe):
/// - `maximumDuration` 0.5 s: a move later than that from the touch-down fails it.
/// - On each move, with t = min(time since touch-down, 0.5) and (dx, dy) the travel from the
///   touch-down: the needed primary travel is `minimumPrimaryMovement` 50 pt × (1 − t × (1 −
///   `rateOfMinimumMovementDecay` 0.06)) and the allowed sideways travel
///   `maximumSecondaryMovement` 50 pt × (1 − t × (1 − `rateOfMaximumMovementDecay` 0.02));
///   `maximumPrimaryMovement` is FLT_MAX, `minimumSecondaryMovement` and
///   `minimumPrimaryMovementRate` 0. A single direction fails at any travel against it
///   (`maximumOppositeMovement` 0: dx < 0 for RIGHT, dx > 0 for LEFT, dy < 0 for DOWN, dy > 0 for
///   UP) and at a sideways travel past the allowance; it is recognised on the first move whose
///   primary travel reaches the need.
/// - `numberOfTouchesRequired` (RNGH `numberOfPointers`, 1): one more touch fails it; a lift
///   before it is recognised fails it. It resets when all its touches are up.
#[derive(Clone, Debug)]
pub struct FlingGesture {
    /// `.direction(d)`: a mask of [`directions`].
    pub direction: u32,
    /// `.numberOfPointers(n)`.
    pub number_of_pointers: usize,
    /// The touches it follows: id, where it came down, where it is.
    touches: Vec<(u32, f64, f64, f64, f64)>,
    /// Every touch down on it since its last reset.
    down: Vec<u32>,
    start_ms: f64,
    state: Swipe,
}

impl FlingGesture {
    /// `minimumPrimaryMovement`, points.
    pub const MIN_PRIMARY: f64 = 50.0;
    /// `maximumSecondaryMovement`, points.
    pub const MAX_SECONDARY: f64 = 50.0;
    /// `rateOfMinimumMovementDecay`.
    pub const MIN_DECAY: f64 = 0.06;
    /// `rateOfMaximumMovementDecay`.
    pub const MAX_DECAY: f64 = 0.02;
    /// `maximumDuration`, seconds (also the cap on the decays' time).
    pub const MAX_DURATION: f64 = 0.5;

    /// `Gesture.Fling().direction(direction)` (one pointer).
    pub fn new(direction: u32) -> FlingGesture {
        FlingGesture { direction, number_of_pointers: 1, touches: Vec::with_capacity(4), down: Vec::with_capacity(4), start_ms: 0.0, state: Swipe::Possible }
    }

    /// Whether a touch is down on it.
    pub fn tracking(&self) -> bool {
        !self.down.is_empty()
    }

    /// `_checkForSwipeWithDelta:…:indirect:NO` for one touch: `Some(true)` recognised, `Some(false)`
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
        let Event::Start(p) = pan.event(1, Phase::Move, 20.0, 0.0, 32.0, true) else { panic!() };
        assert_eq!(p.translation_x, 10.0, "the travel past UIKit's 10 pt hysteresis");
        let Event::End(p) = pan.event(1, Phase::Up, 40.0, 0.0, 48.0, true) else { panic!() };
        assert_eq!(p.translation_x, 30.0);
        assert!(p.velocity_x > 500.0, "{}", p.velocity_x);
        // RNGH's custom criteria zero the translation where the pan activates.
        let mut pan = PanGesture::new().min_distance(10.0);
        pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        let Event::Start(p) = pan.event(1, Phase::Move, 0.0, 20.0, 16.0, true) else { panic!() };
        assert_eq!(p.translation_y, 0.0);
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
    fn tap_fails_when_dragged() {
        let mut tap = TapGesture::default();
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        tap.event(1, Phase::Move, 30.0, 0.0, 50.0, true);
        assert_eq!(tap.event(1, Phase::Up, 30.0, 0.0, 60.0, true), Event::Fail);
    }

    #[test]
    fn fling_is_uikits_swipe() {
        use directions::*;
        // 50 pt at touch-down, decaying by 0.94 / s of it: 45.3 pt at 0.1 s, 26.5 pt at 0.5 s.
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
