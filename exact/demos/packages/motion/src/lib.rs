//! react-native-reanimated 4.7.1, for GPU surfaces: what a worklet runs on the UI thread,
//! stepped here on the host's frame clock. Ported line for line from
//! node_modules/react-native-reanimated/src, so a demo's numbers carry over unchanged.
//!
//! - [`spring`]: `withSpring` (animation/spring).
//! - [`timing`]: `withTiming` (animation/timing.ts) and [`easing`]: `Easing` (Easing.ts, Bezier.ts).
//! - [`decay`]: `withDecay` (animation/decay).
//! - [`spring_array`]: a duration spring over a whole array at once.
//! - [`interpolate`]: `interpolate` and `Extrapolation` (interpolation.ts).

#![deny(missing_docs)]

pub mod decay;
pub mod easing;
pub mod interpolate;
pub mod spring;
pub mod spring_array;
pub mod timing;

pub use decay::Decay;
pub use easing::Easing;
pub use interpolate::{interpolate, interpolate_clamp, interpolate_color, Extrapolation};
pub use spring::{duration_config, Config as SpringConfig, Spring, GENTLE};
pub use spring_array::SpringArray;
pub use timing::Timing;

/// The frame clock's longest step (`Math.min(…, 64)` in every animation's onFrame).
pub const MAX_STEP_MS: f64 = 64.0;
