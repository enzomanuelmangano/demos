//! Spring, timing, easing, decay and interpolation functions stepped on the host's frame clock.
//!
//! Not a reimplementation of react-native-reanimated: a small folder of the same constants and
//! methods its timing and spring functions use, so the demos keep their numbers.
//!
//! ```
//! use motion::{Spring, GENTLE};
//!
//! let mut spring = Spring::at(0.0);
//! spring.to(100.0, 0.0, GENTLE);
//! let mut now_ms = 0.0;
//! while spring.step(now_ms) {
//!     now_ms += 1000.0 / 60.0;
//! }
//! assert_eq!(spring.value, 100.0);
//! ```
//!
//! Modules: [`spring`], [`timing`], [`easing`], [`decay`], [`spring_array`], [`mod@interpolate`].
//!
//! # Credits
//!
//! Same constants as react-native-reanimated 4.x's `withSpring`, `withTiming`, `withDecay`, `Easing`
//! and `interpolate` (MIT).

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

/// The longest step, in ms, one frame advances an animation.
pub const MAX_STEP_MS: f64 = 64.0;
