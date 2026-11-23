//! The press machine behind pressto's pressables, for GPU surfaces: touch in, press out, a
//! progress that eases from 0 to 1 while held, a toggle and a group.
//!
//! One machine runs every pressable (scale, opacity, no feedback, custom), so they all press
//! alike. These are pressto's own conventions (its API names and defaults), not a reimplementation
//! of another library.
//!
//! ```
//! use pressto::Pressable;
//!
//! let mut button = Pressable::new();
//! assert!(button.pointer_down(1, true));
//! let mut now_ms = 0.0;
//! while button.step(now_ms) {
//!     now_ms += 16.0;
//! }
//! assert_eq!(button.scale(), 0.96);
//! assert!(button.pointer_up(1, true).is_some());
//! ```
//!
//! - A touch-down inside the button turns the press on; sliding off keeps it; the lift turns it
//!   off and presses only when the finger lifts inside the bounds; a cancel (a scroll or another
//!   gesture takes the touch) turns it off without a press. No maximum duration or distance.
//! - `progress` eases to 1 over 250 ms on `bezier(0.25, 0.1, 0.25, 1)`, or springs (mass 1,
//!   damping 30, stiffness 200). Each change of target starts a fresh full run from the current
//!   value on the next frame.
//! - Defaults: min scale 0.96, base scale 1, active opacity 0.5; the scale and opacity are
//!   interpolated from `progress`.
//! - `is_toggled` flips on every press; a [`Group`] remembers the last pressable pressed.
//! - Every [`Press`] carries [`GLOBAL_ON_PRESS`] (`"haptic:selection"`) for the surface to post,
//!   unless the pressable skips the global handlers.
//!
//! The surface hit-tests which button a point is in and passes the pointer events to
//! [`Pressable::pointer`] (or the per-phase calls). Each frame it calls [`Pressable::step`] with
//! the clock and draws with [`Pressable::scale`], [`Pressable::opacity`] and
//! [`Pressable::progress`]; `step` and [`Pressable::is_animating`] say whether to keep drawing.
//!
//! Types: [`Pressable`], [`Press`] / [`PressEvent`], [`Config`], [`Animation`], [`HitSlop`], [`Group`].
//!
//! # Credits
//!
//! The timing curve and the spring use the same constants as `motion`, which follows
//! react-native-reanimated 4.x's `withTiming` and `withSpring` (MIT).

#![deny(missing_docs)]

pub use gestures::Phase;
use motion::{Easing, Spring, SpringConfig, Timing};

/// The message a surface posts on every press, unless the pressable skips the global handlers.
pub const GLOBAL_ON_PRESS: &str = "haptic:selection";

/// The default timing duration, in ms.
pub const TIMING_MS: f64 = 250.0;

/// The default timing curve: `bezier(0.25, 0.1, 0.25, 1)`.
pub fn timing_easing() -> Easing {
    Easing::bezier(0.25, 0.1, 0.25, 1.0)
}

/// The default spring: mass 1, damping 30, stiffness 200.
pub const SPRING: SpringConfig = SpringConfig {
    stiffness: 200.0,
    damping: 30.0,
    mass: 1.0,
};

/// What a scale or opacity pressable interpolates to while pressed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Config {
    /// The opacity of an opacity pressable when pressed.
    pub active_opacity: f64,
    /// The scale of a scale pressable when pressed.
    pub min_scale: f64,
    /// The scale of a scale pressable at rest.
    pub base_scale: f64,
}

/// The default config: active opacity 0.5, min scale 0.96, base scale 1.
pub const DEFAULT_CONFIG: Config = Config {
    active_opacity: 0.5,
    min_scale: 0.96,
    base_scale: 1.0,
};

impl Default for Config {
    fn default() -> Self {
        DEFAULT_CONFIG
    }
}

/// How the progress animates.
#[derive(Clone, Debug)]
pub enum Animation {
    /// A timed run over a duration with an easing curve.
    Timing {
        /// The duration, in ms.
        duration_ms: f64,
        /// The curve.
        easing: Easing,
    },
    /// A spring.
    Spring(SpringConfig),
}

impl Animation {
    /// The default timing: 250 ms on `bezier(0.25, 0.1, 0.25, 1)`.
    pub fn timing() -> Animation {
        Animation::Timing {
            duration_ms: TIMING_MS,
            easing: timing_easing(),
        }
    }
    /// The default spring ([`SPRING`]).
    pub fn spring() -> Animation {
        Animation::Spring(SPRING)
    }
}

impl Default for Animation {
    fn default() -> Self {
        Animation::timing()
    }
}

#[derive(Clone, Debug)]
enum Progress {
    Timing(Timing),
    Spring(Spring),
}

/// A press: the finger lifted inside the button. The press-out came with it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Press {
    /// The toggle state after this press flipped it.
    pub is_toggled: bool,
    /// Whether the global handlers run (the pressable did not skip them).
    pub global: bool,
}

impl Press {
    /// The global press message ([`GLOBAL_ON_PRESS`]), unless the pressable skips the global handlers.
    pub fn global_message(&self) -> Option<&'static str> {
        self.global.then_some(GLOBAL_ON_PRESS)
    }
}

/// What a pointer event did to a pressable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PressEvent {
    /// A touch-down inside it.
    PressIn,
    /// The press ended without a press: lifted outside, or cancelled.
    PressOut,
    /// A press, with its press-out.
    Press(Press),
}

/// One pressable: its press, its progress and its toggle state.
#[derive(Clone, Debug)]
pub struct Pressable {
    /// What it interpolates to while pressed.
    pub config: Config,
    animation: Animation,
    skip_global_handlers: bool,
    enabled: bool,
    finger: Option<u32>,
    /// Whether the finger was inside the bounds at the press's last event.
    inside: bool,
    is_toggled: bool,
    progress: Progress,
}

impl Default for Pressable {
    fn default() -> Self {
        Pressable::new()
    }
}

impl Pressable {
    /// A pressable with the default config and timing, at rest.
    pub fn new() -> Pressable {
        Pressable {
            config: DEFAULT_CONFIG,
            animation: Animation::timing(),
            skip_global_handlers: false,
            enabled: true,
            finger: None,
            inside: false,
            is_toggled: false,
            progress: Progress::Timing(Timing::at(0.0)),
        }
    }

    /// Sets the config (the caller merges it over [`DEFAULT_CONFIG`]).
    pub fn with_config(mut self, config: Config) -> Pressable {
        self.config = config;
        self
    }

    /// Sets how the progress animates, keeping its current value.
    pub fn with_animation(mut self, animation: Animation) -> Pressable {
        let p = self.progress();
        self.progress = match animation {
            Animation::Timing { .. } => Progress::Timing(Timing::at(p)),
            Animation::Spring(_) => Progress::Spring(Spring::at(p)),
        };
        self.animation = animation;
        self
    }

    /// Its presses carry no [`GLOBAL_ON_PRESS`].
    pub fn skip_global_handlers(mut self) -> Pressable {
        self.skip_global_handlers = true;
        self
    }

    /// Sets the toggle state it starts in.
    pub fn initial_toggled(mut self, toggled: bool) -> Pressable {
        self.is_toggled = toggled;
        self
    }

    /// A disabled button takes no touch-down; disabling one under a finger cancels its press.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            self.cancel();
        }
    }

    /// Whether it takes touches.
    pub fn enabled(&self) -> bool {
        self.enabled
    }

    fn set_active(&mut self, active: bool) {
        let to = if active { 1.0 } else { 0.0 };
        match (&mut self.progress, &self.animation) {
            (
                Progress::Timing(t),
                Animation::Timing {
                    duration_ms,
                    easing,
                },
            ) => {
                if t.target() != to || !t.running && t.value != to {
                    t.to(to, *duration_ms, easing.clone());
                }
            }
            (Progress::Spring(s), Animation::Spring(config)) => s.retarget(to, *config),
            _ => unreachable!("progress and animation are set together"),
        }
    }

    /// A touch-down; `inside` = in the button's bounds. Returns whether it is this press's:
    /// only one finger, only inside, only when enabled.
    pub fn pointer_down(&mut self, id: u32, inside: bool) -> bool {
        if self.finger.is_some() || !inside || !self.enabled {
            return false;
        }
        self.finger = Some(id);
        self.inside = true;
        self.set_active(true);
        true
    }

    /// The finger moved; `inside` = it is in the button's bounds. Sliding off keeps the press.
    pub fn pointer_move(&mut self, id: u32, inside: bool) {
        if self.finger == Some(id) {
            self.inside = inside;
        }
    }

    /// The finger lifted at a point `inside` the button or not. `Some` is a press (it flips the
    /// toggle); `None` if it was not this press's or it lifted outside (press-out only:
    /// check [`Pressable::is_pressed`] before, or use [`Pressable::pointer`]).
    pub fn pointer_up(&mut self, id: u32, inside: bool) -> Option<Press> {
        if self.finger != Some(id) {
            return None;
        }
        self.finger = None;
        self.inside = inside;
        self.set_active(false);
        if !inside {
            return None;
        }
        self.is_toggled = !self.is_toggled;
        Some(Press {
            is_toggled: self.is_toggled,
            global: !self.skip_global_handlers,
        })
    }

    /// The touch was taken (a scroll began, another gesture won, the platform cancelled):
    /// press-out, no press. Returns whether a press was held.
    pub fn cancel(&mut self) -> bool {
        if self.finger.take().is_none() {
            return false;
        }
        self.set_active(false);
        true
    }

    /// A pointer event, as one call: what it did to the pressable, if anything.
    pub fn pointer(&mut self, id: u32, phase: Phase, inside: bool) -> Option<PressEvent> {
        match phase {
            Phase::Down => self.pointer_down(id, inside).then_some(PressEvent::PressIn),
            Phase::Move => {
                self.pointer_move(id, inside);
                None
            }
            Phase::Up => {
                if self.finger != Some(id) {
                    return None;
                }
                Some(
                    self.pointer_up(id, inside)
                        .map_or(PressEvent::PressOut, PressEvent::Press),
                )
            }
            Phase::Cancel => {
                (self.finger == Some(id) && self.cancel()).then_some(PressEvent::PressOut)
            }
        }
    }

    /// Steps the progress to the frame at `now_ms`; returns whether it still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        match &mut self.progress {
            Progress::Timing(t) => t.step(now_ms),
            Progress::Spring(s) => s.step(now_ms),
        }
    }

    /// The progress: 0 at rest, 1 pressed.
    pub fn progress(&self) -> f64 {
        match &self.progress {
            Progress::Timing(t) => t.value,
            Progress::Spring(s) => s.value,
        }
    }

    /// The scale of a scale pressable: `progress` interpolated from `base_scale` to `min_scale`.
    pub fn scale(&self) -> f64 {
        let p = self.progress();
        self.config.base_scale + (self.config.min_scale - self.config.base_scale) * p
    }

    /// The opacity of an opacity pressable: `progress` interpolated from 1 to `active_opacity`.
    pub fn opacity(&self) -> f64 {
        1.0 + (self.config.active_opacity - 1.0) * self.progress()
    }

    /// Whether a finger holds it.
    pub fn is_pressed(&self) -> bool {
        self.finger.is_some()
    }

    /// The finger holding it.
    pub fn finger(&self) -> Option<u32> {
        self.finger
    }

    /// Whether the finger was inside the bounds at the press's last event.
    pub fn pointer_inside(&self) -> bool {
        self.finger.is_some() && self.inside
    }

    /// Whether it is toggled on.
    pub fn is_toggled(&self) -> bool {
        self.is_toggled
    }

    /// Whether its progress moves or a finger holds it: `render()` keeps drawing while true.
    pub fn is_animating(&self) -> bool {
        self.finger.is_some()
            || match &self.progress {
                Progress::Timing(t) => t.running,
                Progress::Spring(s) => s.running,
            }
    }
}

/// How far past its bounds a touch still reaches a pressable. It grows the hit frame for the
/// touch-down and for the lift (so a lift in the slop still presses), in the button's own
/// coordinates.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HitSlop {
    /// Past the top edge.
    pub top: f64,
    /// Past the right edge.
    pub right: f64,
    /// Past the bottom edge.
    pub bottom: f64,
    /// Past the left edge.
    pub left: f64,
}

impl HitSlop {
    /// The same slop `n` on every side.
    pub const fn all(n: f64) -> HitSlop {
        HitSlop { top: n, right: n, bottom: n, left: n }
    }
    /// Whether (x, y) is in the box at (x0, y0) of `w` x `h`, grown by the slop.
    pub fn contains(&self, x0: f64, y0: f64, w: f64, h: f64, x: f64, y: f64) -> bool {
        (x0 - self.left..=x0 + w + self.right).contains(&x)
            && (y0 - self.top..=y0 + h + self.bottom).contains(&y)
    }
}

/// Which pressable of a group was pressed last.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Group {
    last: Option<usize>,
}

impl Group {
    /// A group none of whose pressables was pressed.
    pub fn new() -> Group {
        Group { last: None }
    }
    /// The pressable `key` was pressed.
    pub fn press(&mut self, key: usize) {
        self.last = Some(key);
    }
    /// Whether `key` was the last pressed.
    pub fn is_selected(&self, key: usize) -> bool {
        self.last == Some(key)
    }
    /// The key of the last pressed, if any.
    pub fn last(&self) -> Option<usize> {
        self.last
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn a_held_press_eases_to_one_over_250_ms_on_the_bezier() {
        let mut p = Pressable::new();
        assert!(p.pointer_down(1, true));
        assert!(p.is_pressed() && p.is_animating());
        // The animation starts at the next frame.
        p.step(0.0);
        assert_eq!(p.progress(), 0.0);
        p.step(125.0);
        let e = timing_easing();
        assert!(close(p.progress(), e.at(0.5)), "{}", p.progress());
        // bezier(0.25, 0.1, 0.25, 1) at x = 0.5 is about 0.8024.
        assert!((p.progress() - 0.8024).abs() < 1e-3, "{}", p.progress());
        p.step(62.5 * 3.0);
        assert!(close(p.progress(), e.at(0.75)));
        assert!(p.step(249.0));
        assert!(!p.step(250.0));
        assert_eq!(p.progress(), 1.0);
        assert!(close(p.scale(), 0.96));
        assert!(close(p.opacity(), 0.5));
        // Held: still animating (a finger is down), though the progress rests.
        assert!(p.is_animating());
    }

    #[test]
    fn a_release_mid_flight_eases_back_from_where_it_is_over_a_full_250_ms() {
        let mut p = Pressable::new();
        p.pointer_down(1, true);
        p.step(0.0);
        p.step(100.0);
        let v = p.progress();
        assert!(v > 0.4 && v < 0.9, "{v}");
        assert_eq!(
            p.pointer_up(1, true),
            Some(Press {
                is_toggled: true,
                global: true
            })
        );
        // The new run starts at the next frame from the last frame's value.
        p.step(116.0);
        assert!(close(p.progress(), v));
        p.step(116.0 + 125.0);
        assert!(
            close(p.progress(), v * (1.0 - timing_easing().at(0.5))),
            "{}",
            p.progress()
        );
        // Not done at 100 + 250: a full 250 ms from 116, not shortened by the 100 ms it came.
        assert!(p.step(350.0));
        assert!(p.progress() > 0.0);
        assert!(!p.step(366.0));
        assert_eq!(p.progress(), 0.0);
        assert!(!p.is_animating());
    }

    #[test]
    fn sliding_off_keeps_it_pressed_and_lifting_outside_does_not_press() {
        let mut p = Pressable::new();
        assert_eq!(p.pointer(7, Phase::Down, true), Some(PressEvent::PressIn));
        assert_eq!(p.pointer(7, Phase::Move, false), None);
        assert!(p.is_pressed());
        assert!(!p.pointer_inside());
        // Back in and out again: still the same press.
        p.pointer(7, Phase::Move, true);
        assert!(p.pointer_inside());
        p.pointer(7, Phase::Move, false);
        assert_eq!(p.pointer(7, Phase::Up, false), Some(PressEvent::PressOut));
        assert!(!p.is_pressed());
        assert!(!p.is_toggled());
        // Slid off and back in, lifted inside: a press, however long it was held.
        p.pointer(8, Phase::Down, true);
        p.pointer(8, Phase::Move, false);
        p.pointer(8, Phase::Move, true);
        assert!(matches!(
            p.pointer(8, Phase::Up, true),
            Some(PressEvent::Press(_))
        ));
    }

    #[test]
    fn a_cancel_releases_without_a_press() {
        let mut p = Pressable::new();
        p.pointer_down(1, true);
        p.step(0.0);
        p.step(200.0);
        assert!(p.cancel());
        assert!(!p.is_pressed());
        assert!(!p.cancel());
        // The lift that follows is no longer this press's.
        assert_eq!(p.pointer_up(1, true), None);
        assert_eq!(p.pointer(1, Phase::Up, true), None);
        assert!(!p.is_toggled());
        p.step(216.0);
        assert!(p.step(400.0));
        assert!(!p.step(466.0));
        assert_eq!(p.progress(), 0.0);
        // A platform cancel by phase.
        p.pointer(2, Phase::Down, true);
        assert_eq!(
            p.pointer(2, Phase::Cancel, true),
            Some(PressEvent::PressOut)
        );
        assert!(!p.is_toggled());
    }

    #[test]
    fn only_a_down_inside_and_one_finger_claim_it() {
        let mut p = Pressable::new();
        assert!(!p.pointer_down(1, false));
        assert!(p.pointer_down(2, true));
        assert!(!p.pointer_down(3, true));
        assert_eq!(p.pointer_up(3, true), None);
        assert!(p.is_pressed());
        p.set_enabled(false);
        assert!(!p.is_pressed());
        assert!(!p.pointer_down(4, true));
    }

    #[test]
    fn presses_toggle_and_carry_the_global_haptic_unless_skipped() {
        let mut p = Pressable::new().initial_toggled(true);
        p.pointer_down(1, true);
        let press = p.pointer_up(1, true).unwrap();
        assert_eq!(
            press,
            Press {
                is_toggled: false,
                global: true
            }
        );
        assert_eq!(press.global_message(), Some("haptic:selection"));
        p.pointer_down(1, true);
        assert!(p.pointer_up(1, true).unwrap().is_toggled);
        let mut quiet = Pressable::new().skip_global_handlers();
        quiet.pointer_down(1, true);
        assert_eq!(quiet.pointer_up(1, true).unwrap().global_message(), None);
    }

    #[test]
    fn config_drives_scale_and_opacity() {
        let mut p = Pressable::new().with_config(Config {
            active_opacity: 0.3,
            min_scale: 1.1,
            base_scale: 1.05,
        });
        assert!(close(p.scale(), 1.05));
        assert!(close(p.opacity(), 1.0));
        p.pointer_down(1, true);
        p.step(0.0);
        p.step(300.0);
        assert!(close(p.scale(), 1.1));
        assert!(close(p.opacity(), 0.3));
    }

    #[test]
    fn spring_mode_settles_critically_damped() {
        let mut p = Pressable::new().with_animation(Animation::spring());
        p.pointer_down(1, true);
        let mut ms = 0.0;
        let mut last = 0.0;
        while p.step(ms) {
            // ζ ≈ 1.06 runs critically damped: no overshoot, monotonic.
            assert!(
                p.progress() >= last && p.progress() <= 1.0,
                "{} at {ms}",
                p.progress()
            );
            last = p.progress();
            ms += 1000.0 / 60.0;
            assert!(ms < 3000.0);
        }
        assert_eq!(p.progress(), 1.0);
        // ω0 = √200 critically damped: its energy falls under 6e-9 of its start at ~0.88 s.
        assert!((800.0..1000.0).contains(&ms), "{ms}");
        // A release mid-flight springs back from where it is, without a jump.
        p.pointer_up(1, true);
        p.step(ms);
        while p.step(ms) {
            ms += 16.0;
        }
        p.pointer_down(2, true);
        p.step(ms);
        p.step(ms + 100.0);
        let v = p.progress();
        assert!(v > 0.2 && v < 1.0, "{v}");
        p.cancel();
        p.step(ms + 116.0);
        assert!((p.progress() - v).abs() < 0.1, "{} vs {v}", p.progress());
        ms += 116.0;
        while p.step(ms) {
            ms += 16.0;
        }
        assert_eq!(p.progress(), 0.0);
    }

    /// A quick tap: active for one frame. The frame the press began at shows 0 (the new run's
    /// start), the next one frame of the curve; the release then eases back from there over a full
    /// 250 ms from its own first frame.
    #[test]
    fn a_quick_tap_dips_and_returns_over_a_full_250_ms_from_where_it_was() {
        let e = timing_easing();
        let mut p = Pressable::new();
        assert!(p.pointer_down(1, true));
        p.step(0.0);
        assert_eq!(p.progress(), 0.0);
        p.step(16.0);
        let dip = p.progress();
        assert!(close(dip, e.at(16.0 / 250.0)), "{dip}");
        assert!(dip > 0.0);
        assert!(p.pointer_up(1, true).is_some());
        // The release's first frame holds where the press left it.
        p.step(32.0);
        assert!(close(p.progress(), dip));
        p.step(32.0 + 125.0);
        assert!(close(p.progress(), dip * (1.0 - e.at(0.5))), "{}", p.progress());
        // A full 250 ms from 32, not shortened to the 16 ms the press ran.
        assert!(p.step(32.0 + 249.0));
        assert!(p.progress() > 0.0);
        assert!(!p.step(32.0 + 250.0));
        assert_eq!(p.progress(), 0.0);
    }

    /// Down and up before any frame: the press is never seen as active, so nothing moves.
    #[test]
    fn a_tap_inside_one_frame_never_moves() {
        let mut p = Pressable::new();
        p.pointer_down(1, true);
        assert!(p.pointer_up(1, true).is_some());
        let mut ms = 0.0;
        while p.step(ms) {
            assert_eq!(p.progress(), 0.0);
            ms += 16.0;
        }
        assert_eq!(p.progress(), 0.0);
    }

    /// A re-press during the release: a run to 1 from the current value, its first frame holding
    /// it, then a full 250 ms forward (no reversing shortcut).
    #[test]
    fn a_re_press_during_the_release_eases_forward_over_a_full_250_ms() {
        let e = timing_easing();
        let mut p = Pressable::new();
        p.pointer_down(1, true);
        p.step(0.0);
        p.step(300.0);
        assert_eq!(p.progress(), 1.0);
        p.pointer_up(1, true);
        p.step(316.0);
        p.step(316.0 + 100.0);
        let v = p.progress();
        assert!(close(v, 1.0 - e.at(100.0 / 250.0)), "{v}");
        assert!(p.pointer_down(2, true));
        p.step(432.0);
        assert!(close(p.progress(), v));
        p.step(432.0 + 125.0);
        assert!(close(p.progress(), v + (1.0 - v) * e.at(0.5)), "{}", p.progress());
        assert!(p.step(432.0 + 249.0));
        assert!(!p.step(432.0 + 250.0));
        assert_eq!(p.progress(), 1.0);
    }

    /// The lift's own location decides the press: a finger that was inside on its last move and
    /// lifts outside presses nothing.
    #[test]
    fn the_lift_location_alone_decides_the_press() {
        let mut p = Pressable::new();
        p.pointer(1, Phase::Down, true);
        p.pointer(1, Phase::Move, true);
        assert_eq!(p.pointer(1, Phase::Up, false), Some(PressEvent::PressOut));
        p.pointer(2, Phase::Down, true);
        p.pointer(2, Phase::Move, false);
        assert!(matches!(p.pointer(2, Phase::Up, true), Some(PressEvent::Press(_))));
    }

    #[test]
    fn hit_slop_grows_the_frame_for_the_down_and_the_lift() {
        let slop = HitSlop::all(16.0);
        assert!(slop.contains(10.0, 10.0, 48.0, 48.0, -5.0, 30.0));
        assert!(!slop.contains(10.0, 10.0, 48.0, 48.0, -7.0, 30.0));
        assert!(slop.contains(10.0, 10.0, 48.0, 48.0, 73.0, 74.0));
        assert!(!HitSlop::default().contains(10.0, 10.0, 48.0, 48.0, 9.0, 30.0));
        let mut p = Pressable::new();
        assert!(p.pointer_down(1, slop.contains(10.0, 10.0, 48.0, 48.0, 0.0, 0.0)));
        assert!(p.pointer_up(1, slop.contains(10.0, 10.0, 48.0, 48.0, 70.0, 70.0)).is_some());
    }

    #[test]
    fn a_group_remembers_the_last_pressed() {
        let mut g = Group::new();
        assert_eq!(g.last(), None);
        g.press(2);
        assert!(g.is_selected(2) && !g.is_selected(0));
    }
}
