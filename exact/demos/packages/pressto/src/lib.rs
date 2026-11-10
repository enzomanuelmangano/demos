//! pressto 0.7.0's `BasePressable` for GPU surfaces: one press machine every surface that draws
//! a pressto pressable (PressableScale, PressableOpacity, PressableWithoutFeedback, a
//! `createAnimatedPressable`) runs, so they all press alike. Ported from
//! node_modules/pressto/src (pressables/base.tsx, provider/constants.ts).
//!
//! As DESIGNED, not as the RN app runs today: pressto 0.7.0 hands RNGH 3.3's v3 BaseButton
//! `onBegan` / `onEnded`, which it no longer reads (it reads `onBegin` / `onFinalize`), so the RN
//! app shows no press feedback. Here the feedback is what pressto means:
//!
//! - RNGH's iOS BaseButton: `active` turns on at a touch-down inside the button (onBegin with
//!   pointerInside); `shouldCancelWhenOutside` is false, so sliding off keeps it on; the lift
//!   turns it off and fires `onPress` only when the finger lifts inside the button's bounds; a
//!   cancel (a scroll or another gesture takes the touch) turns it off with no `onPress`. No
//!   maximum duration and no maximum distance (a held, wandering press still presses).
//! - `progress = withTiming(active ? 1 : 0, { duration: 250, easing: bezier(0.25, 0.1, 0.25, 1) })`
//!   (`DefaultAnimationConfigs.timing`), or `withSpring(…, { mass: 1, damping: 30,
//!   stiffness: 200 })` (`DefaultAnimationConfigs.spring`; ζ = 30 / (2√200) ≈ 1.06, which
//!   Reanimated runs critically damped, as `reanimated::Spring` does). A `useDerivedValue`
//!   starts its new animation at the next frame, from the value the last frame left: a release
//!   mid-flight eases back from there over a fresh full 250 ms (not a CSS reversal).
//! - `DefaultPressableConfig`: minScale 0.96, baseScale 1, activeOpacity 0.5;
//!   PressableScale is `interpolate(progress, [0, 1], [baseScale, minScale])`, PressableOpacity
//!   `interpolate(progress, [0, 1], [1, activeOpacity])`.
//! - `isToggled` flips on every onPress (`initialToggled` first); a [`Group`]
//!   (PressablesGroup) remembers the last pressable pressed (`isSelected`).
//! - The app's `PressablesConfig` `globalHandlers.onPress` is `Haptics.selectionAsync()`
//!   (app/_layout.tsx): every [`Press`] carries [`GLOBAL_ON_PRESS`] (`"haptic:selection"`) for
//!   the surface to post, unless the pressable set `skipGlobalHandlers`.
//!
//! The surface hit-tests (which button a point is in) and feeds the pointer events of its canvas
//! (`InputEvent::Pointer`) as [`Pressable::pointer`] or the per-phase calls; `render()` calls
//! [`Pressable::step`] with the frame's clock and draws with [`Pressable::scale`] /
//! [`Pressable::opacity`] / [`Pressable::progress`], returning true while
//! [`Pressable::is_animating`].
//!
//! `gesture-handler`'s `TapGesture` is not used under it: everything it adds (maxDuration 500,
//! maxDist) is off for a BaseButton; only its [`Phase`] is shared.

#![deny(missing_docs)]

pub use gesture_handler::Phase;
use reanimated::{Easing, Spring, SpringConfig, Timing};

/// What the app's `PressablesConfig` `globalHandlers.onPress` does: `Haptics.selectionAsync()`,
/// as the message a surface posts.
pub const GLOBAL_ON_PRESS: &str = "haptic:selection";

/// `DefaultAnimationConfigs.timing.duration`.
pub const TIMING_MS: f64 = 250.0;

/// `DefaultAnimationConfigs.timing.easing`: `Easing.bezier(0.25, 0.1, 0.25, 1)`.
pub fn timing_easing() -> Easing {
    Easing::bezier(0.25, 0.1, 0.25, 1.0)
}

/// `DefaultAnimationConfigs.spring`: `{ mass: 1, damping: 30, stiffness: 200 }`.
pub const SPRING: SpringConfig = SpringConfig {
    stiffness: 200.0,
    damping: 30.0,
    mass: 1.0,
};

/// `PressableConfig`: what PressableScale and PressableOpacity interpolate to.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Config {
    /// `activeOpacity`: PressableOpacity's opacity when pressed.
    pub active_opacity: f64,
    /// `minScale`: PressableScale's scale when pressed.
    pub min_scale: f64,
    /// `baseScale`: PressableScale's scale at rest.
    pub base_scale: f64,
}

/// `DefaultPressableConfig`.
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

/// `animationType` + `animationConfig`.
#[derive(Clone, Debug)]
pub enum Animation {
    /// `'timing'`: `withTiming(…, { duration, easing })`.
    Timing {
        /// ms.
        duration_ms: f64,
        /// The curve.
        easing: Easing,
    },
    /// `'spring'`: `withSpring(…, config)`.
    Spring(SpringConfig),
}

impl Animation {
    /// `'timing'` with `DefaultAnimationConfigs.timing` (pressto's default).
    pub fn timing() -> Animation {
        Animation::Timing {
            duration_ms: TIMING_MS,
            easing: timing_easing(),
        }
    }
    /// `'spring'` with `DefaultAnimationConfigs.spring`.
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

/// An `onPress`: the finger lifted inside the button. The press-out came with it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Press {
    /// `isToggled` after this press flipped it.
    pub is_toggled: bool,
    /// Whether the global handlers run (no `skipGlobalHandlers`).
    pub global: bool,
}

impl Press {
    /// The global onPress's message ([`GLOBAL_ON_PRESS`]), unless `skipGlobalHandlers`.
    pub fn global_message(&self) -> Option<&'static str> {
        self.global.then_some(GLOBAL_ON_PRESS)
    }
}

/// What a pointer event did to a pressable (the handler pressto would call).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PressEvent {
    /// `onPressIn`: a touch-down inside it.
    PressIn,
    /// `onPressOut` without `onPress`: lifted outside, or cancelled.
    PressOut,
    /// `onPress` (with its press-out).
    Press(Press),
}

/// One pressto pressable: its BaseButton press, its progress, its `isToggled`.
#[derive(Clone, Debug)]
pub struct Pressable {
    /// Its `PressableConfig`.
    pub config: Config,
    animation: Animation,
    skip_global_handlers: bool,
    enabled: bool,
    finger: Option<u32>,
    /// pointerInside at the press's last event.
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

    /// `config` (merged over `DefaultPressableConfig` by the caller).
    pub fn with_config(mut self, config: Config) -> Pressable {
        self.config = config;
        self
    }

    /// `animationType` / `animationConfig`.
    pub fn with_animation(mut self, animation: Animation) -> Pressable {
        let p = self.progress();
        self.progress = match animation {
            Animation::Timing { .. } => Progress::Timing(Timing::at(p)),
            Animation::Spring(_) => Progress::Spring(Spring::at(p)),
        };
        self.animation = animation;
        self
    }

    /// `skipGlobalHandlers`: its presses carry no [`GLOBAL_ON_PRESS`].
    pub fn skip_global_handlers(mut self) -> Pressable {
        self.skip_global_handlers = true;
        self
    }

    /// `initialToggled`.
    pub fn initial_toggled(mut self, toggled: bool) -> Pressable {
        self.is_toggled = toggled;
        self
    }

    /// `enabled` / `disabled`: a disabled button takes no touch-down; disabling one under a
    /// finger cancels its press.
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

    /// A touch-down; `inside` = in the button's bounds. Returns whether it is this press's
    /// (onPressIn): only one finger, only inside, only when enabled.
    pub fn pointer_down(&mut self, id: u32, inside: bool) -> bool {
        if self.finger.is_some() || !inside || !self.enabled {
            return false;
        }
        self.finger = Some(id);
        self.inside = true;
        self.set_active(true);
        true
    }

    /// The finger moved; `inside` = it is in the button's bounds. Sliding off keeps the press
    /// (`shouldCancelWhenOutside` false).
    pub fn pointer_move(&mut self, id: u32, inside: bool) {
        if self.finger == Some(id) {
            self.inside = inside;
        }
    }

    /// The finger lifted at a point `inside` the button or not. `Some` is onPress (it flips
    /// `isToggled`); `None` if it was not this press's or it lifted outside (press-out only:
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
    /// press-out, no onPress. Returns whether a press was held.
    pub fn cancel(&mut self) -> bool {
        if self.finger.take().is_none() {
            return false;
        }
        self.set_active(false);
        true
    }

    /// A pointer event, as one call: what pressto would call for it.
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

    /// `progress`: 0 at rest, 1 pressed.
    pub fn progress(&self) -> f64 {
        match &self.progress {
            Progress::Timing(t) => t.value,
            Progress::Spring(s) => s.value,
        }
    }

    /// PressableScale: `interpolate(progress, [0, 1], [baseScale, minScale])`.
    pub fn scale(&self) -> f64 {
        let p = self.progress();
        self.config.base_scale + (self.config.min_scale - self.config.base_scale) * p
    }

    /// PressableOpacity: `interpolate(progress, [0, 1], [1, activeOpacity])`.
    pub fn opacity(&self) -> f64 {
        1.0 + (self.config.active_opacity - 1.0) * self.progress()
    }

    /// `isPressed` (`active`): a finger holds it.
    pub fn is_pressed(&self) -> bool {
        self.finger.is_some()
    }

    /// The finger holding it.
    pub fn finger(&self) -> Option<u32> {
        self.finger
    }

    /// pointerInside at the press's last event.
    pub fn pointer_inside(&self) -> bool {
        self.finger.is_some() && self.inside
    }

    /// `isToggled`.
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

/// `PressablesGroup`: which pressable of a group was pressed last (`isSelected`). The app's
/// `PressablesConfig` wraps everything in one.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Group {
    last: Option<usize>,
}

impl Group {
    /// A group none of whose pressables was pressed.
    pub fn new() -> Group {
        Group { last: None }
    }
    /// `lastTouchedPressable.set(key)`: the pressable `key` was pressed (onPress).
    pub fn press(&mut self, key: usize) {
        self.last = Some(key);
    }
    /// `isSelected` for `key`.
    pub fn is_selected(&self, key: usize) -> bool {
        self.last == Some(key)
    }
    /// The last pressed.
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
        // The animation starts at the next frame (its first step).
        p.step(0.0);
        assert_eq!(p.progress(), 0.0);
        p.step(125.0);
        let e = timing_easing();
        assert!(close(p.progress(), e.at(0.5)), "{}", p.progress());
        // bezier(0.25, 0.1, 0.25, 1) at x = 0.5 is about 0.8024 (CSS `ease`).
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
        // The new withTiming starts at the next frame from the last frame's value.
        p.step(116.0);
        assert!(close(p.progress(), v));
        p.step(116.0 + 125.0);
        assert!(
            close(p.progress(), v * (1.0 - timing_easing().at(0.5))),
            "{}",
            p.progress()
        );
        // Not done at 100 + 250 (no CSS reversal of the 100 ms it came): a full 250 from 116.
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

    #[test]
    fn a_group_remembers_the_last_pressed() {
        let mut g = Group::new();
        assert_eq!(g.last(), None);
        g.press(2);
        assert!(g.is_selected(2) && !g.is_selected(0));
    }
}
