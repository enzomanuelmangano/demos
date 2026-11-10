//! `withTiming` (animation/timing.ts): duration 300 ms and `Easing.inOut(Easing.quad)` by default.

use crate::easing::Easing;

/// One value timed from where it was to `to`.
#[derive(Clone, Debug)]
pub struct Timing {
    from: f64,
    to: f64,
    duration_ms: f64,
    easing: Easing,
    start_ms: Option<f64>,
    /// Where it is.
    pub value: f64,
    /// False once it has arrived.
    pub running: bool,
}

impl Timing {
    /// At rest at `value`.
    pub fn at(value: f64) -> Timing {
        Timing { from: value, to: value, duration_ms: 300.0, easing: Easing::timing_default(), start_ms: None, value, running: false }
    }

    /// Set at once, as an assignment without `withTiming`.
    pub fn set(&mut self, value: f64) {
        self.value = value;
        self.to = value;
        self.running = false;
    }

    /// `withTiming(to, { duration, easing })` from where it is; it starts at the next frame.
    pub fn to(&mut self, to: f64, duration_ms: f64, easing: Easing) {
        self.from = self.value;
        self.to = to;
        self.duration_ms = duration_ms;
        self.easing = easing;
        self.start_ms = None;
        self.running = true;
    }

    /// The target.
    pub fn target(&self) -> f64 {
        self.to
    }

    /// Steps to the frame at `now_ms`; returns whether it still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        if !self.running {
            return false;
        }
        let start = *self.start_ms.get_or_insert(now_ms);
        let runtime = now_ms - start;
        if runtime >= self.duration_ms {
            self.value = self.to;
            self.running = false;
            return false;
        }
        let p = self.easing.at(runtime / self.duration_ms);
        self.value = self.from + (self.to - self.from) * p;
        true
    }
}

impl Default for Timing {
    fn default() -> Self {
        Timing::at(0.0)
    }
}
