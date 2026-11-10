//! react-native-gesture-handler's Pan, Tap and Pinch, recognised from the pointer events a canvas
//! that asks for input receives (exact-gpu's `InputEvent::Pointer`, in canvas points with the
//! host's clock). A surface keeps one recognizer per gesture and asks it, per event, what the
//! RNGH callbacks would have been told.
//!
//! What RNGH's iOS handlers do, kept here:
//! - Pan begins on the first move `min_distance` or more from touch-down (RNGH's `minDist`,
//!   UIKit's 10 pt hysteresis by default). A plain `Gesture.Pan()` is UIKit's own
//!   UIPanGestureRecognizer: RNGH (RNPanHandler.m) adds nothing to it without custom criteria
//!   (`failOffset*` alone is none) and reports `translationInView:` of the window. Its translation
//!   depends on when that move comes (exact/parity-tools/pan-probe, iOS 27 Simulator, a bare
//!   recognizer; argent moves of 2 to 15.6 pt, 0.6 and 2 s drags, and a single 12 pt move at
//!   10 to 130 ms):
//!   - from about 90 ms after touch-down, the pan begins inside that move and the translation
//!     leaves out exactly the 10 pt along the direction it set off in (2.00 at a 12 pt begin;
//!     140 pt → 130.00 at every move size in 2 s drags). Agent-measured on the RN app (slow
//!     drags): 104.5 → 94.3, 140 → 130.2, 99.95 → 90.1;
//!   - earlier, UIKit defers it to the next update and zeroes the translation at the finger
//!     (0.00 at a 12 pt begin at 30, 50, 70 ms; 0.6 s drags of 140 pt: 126.00, 129.67, 126.00,
//!     124.33 for 2, 3.5, 7, 15.6 pt moves). Not modelled: twice (moves 12 pt at ~12 ms and at
//!     ~88 ms) the deferred pan began only at the next move, and once a 110 ms move zeroed.
//!   RNGH's custom criteria (`minDist` here) instead `setTranslation(.zero)` at activation
//!   (RNPanHandler.m): from that point. The demo screen's close Pan (activeOffsetY 10,
//!   failOffsetX ±30) does not delay a demo's pan. The RN Debug app loses more on fast drags
//!   (swipe-cards: 113 for 140 pt in 0.6 s, 127.9 in 2 s): its busy main thread, not RN's
//!   rule; parity follows UIKit (Release).
//! - Velocity is points per second, from the last 100 ms of samples (UIKit's estimate), only
//!   from samples where the finger moved: UIKit hears no `touchesMoved` from a finger at rest, so a drag held still keeps its last velocity at the lift (measured on the RN app:
//!   a ruler dragged at ~100 pt/s, held 600 ms, then lifted still flings one more tick).
//! - Tap is RNGH's iOS `RNBetterTapGestureRecognizer`: it ends within `max_duration_ms` (500,
//!   `defaultMaxDuration`) and has no distance limit unless one is set (`maxDist`, `maxDeltaX`,
//!   `maxDeltaY` are NaN by default, RNTapHandler.m), measured in the window from touch-down.
//!   `maxDist` is a radius, `maxDeltaX`/`maxDeltaY` bound each axis on its own.
//! - Pinch is two fingers: it starts when one of them moves while both are down, and its
//!   `scale` is their distance over the distance when the second came down (UIKit's
//!   `UIPinchGestureRecognizer.scale`, 1 at the start); it ends when either lifts.

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

/// UIKit's pan: a begin this soon after touch-down (ms) zeroes the translation at the finger;
/// a later one leaves out the hysteresis along the set-off (pan-probe: 83 ms zeroed, 97 ms did not).
pub const UIKIT_DEFERRED_BEGIN_MS: f64 = 90.0;

/// A one-finger pan.
#[derive(Clone, Debug)]
pub struct PanGesture {
    /// RNGH `minDist`.
    pub min_distance: f32,
    id: Option<u32>,
    start: (f32, f32),
    /// The touch-down's time.
    down_ms: f64,
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
        PanGesture { min_distance: 10.0, id: None, start: (0.0, 0.0), down_ms: 0.0, origin: (0.0, 0.0), custom: false, last: (0.0, 0.0), active: false, samples: Vec::with_capacity(16) }
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
                            // RNGH's setTranslation(.zero), or UIKit's deferred begin.
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
    /// RNGH `maxDist` (a radius); infinite (RNGH's NaN) by default.
    pub max_distance: f32,
    /// RNGH `maxDeltaX`, `maxDeltaY`: |dx|, |dy| each; infinite by default.
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
    /// `.maxDist(d)`: moving farther than `d` from touch-down fails it.
    pub fn max_distance(mut self, d: f32) -> TapGesture {
        self.max_distance = d;
        self
    }
    /// `.maxDeltaX(dx).maxDeltaY(dy)`: moving farther than `dx` across or `dy` down fails it.
    pub fn max_delta(mut self, dx: f32, dy: f32) -> TapGesture {
        self.max_delta = (dx, dy);
        self
    }
    /// `.maxDuration(ms)`: a tap held longer fails.
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
                    // shouldFailUnderCustomCriteria: each test only when its limit is set.
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
        // RNGH's custom criteria zero the translation where the pan activates.
        let mut pan = PanGesture::new().min_distance(10.0);
        pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        let Event::Start(p) = pan.event(1, Phase::Move, 0.0, 20.0, 16.0, true) else { panic!() };
        assert_eq!(p.translation_y, 0.0);
    }

    #[test]
    fn uikit_zeroes_a_pan_that_begins_early() {
        // pan-probe: a 12 pt move 30 to 83 ms after touch-down begins at 0; from ~97 ms at 2.
        for (ms, want) in [(30.0, 0.0), (70.0, 0.0), (97.0, 2.0), (130.0, 2.0)] {
            let mut pan = PanGesture::new();
            pan.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
            let Event::Start(p) = pan.event(1, Phase::Move, 12.0, 0.0, ms, true) else { panic!() };
            assert_eq!(p.translation_x, want, "{ms} ms");
            let Event::Update(p) = pan.event(1, Phase::Move, 60.0, 0.0, ms + 250.0, true) else { panic!() };
            assert_eq!(p.translation_x, 48.0 + want, "{ms} ms");
        }
        // 0.6 s drags of 140 pt (probe): 7 pt moves begin at 14 pt after ~66 ms → 126.
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
        // RNGH's iOS Tap: maxDist / maxDeltaX / maxDeltaY are NaN unless set.
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
        // .maxDeltaX(5).maxDeltaY(5): a 4.5 pt diagonal (6.4 pt away) still taps; 5.5 across fails.
        let mut tap = TapGesture::default().max_delta(5.0, 5.0);
        tap.event(1, Phase::Down, 0.0, 0.0, 0.0, true);
        tap.event(1, Phase::Move, 4.5, 4.5, 50.0, true);
        assert_eq!(tap.event(1, Phase::Up, 4.5, 4.5, 60.0, true), Event::Tap { x: 4.5, y: 4.5 });
        tap.event(1, Phase::Down, 0.0, 0.0, 100.0, true);
        tap.event(1, Phase::Move, 5.5, 0.0, 150.0, true);
        assert_eq!(tap.event(1, Phase::Up, 5.5, 0.0, 160.0, true), Event::Fail);
    }
}
