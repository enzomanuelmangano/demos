//! `withDecay` (animation/decay): deceleration 0.998, velocityFactor 1, the rigid decay or,
//! with `rubber_band_factor`, the rubber band past a clamp.

const SLOPE_FACTOR: f64 = 0.1;
const VELOCITY_EPS: f64 = 1.0;
const DERIVATIVE_EPS: f64 = 0.1;

/// A value flung at a velocity, slowing down.
#[derive(Clone, Copy, Debug)]
pub struct Decay {
    /// `deceleration`.
    pub deceleration: f64,
    /// `velocityFactor`.
    pub velocity_factor: f64,
    /// `clamp`.
    pub clamp: Option<[f64; 2]>,
    /// `rubberBandEffect` with its `rubberBandFactor` (0.6 by default).
    pub rubber_band: Option<f64>,
    v0: f64,
    start_ms: Option<f64>,
    last_ms: f64,
    spring_active: bool,
    /// Where it is.
    pub value: f64,
    /// Units per second.
    pub velocity: f64,
    /// False once it has stopped.
    pub running: bool,
}

impl Decay {
    /// At rest at `value`, with withDecay's defaults.
    pub fn at(value: f64) -> Decay {
        Decay {
            deceleration: 0.998,
            velocity_factor: 1.0,
            clamp: None,
            rubber_band: None,
            v0: 0.0,
            start_ms: None,
            last_ms: 0.0,
            spring_active: false,
            value,
            velocity: 0.0,
            running: false,
        }
    }

    /// `withDecay({ velocity })` from where it is.
    pub fn fling(&mut self, velocity: f64) {
        self.v0 = velocity;
        self.velocity = velocity;
        self.start_ms = None;
        self.spring_active = false;
        self.running = true;
    }

    /// Steps to the frame at `now_ms`; returns whether it still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        if !self.running {
            return false;
        }
        let start = *self.start_ms.get_or_insert_with(|| {
            self.last_ms = now_ms;
            now_ms
        });
        let dt = (now_ms - self.last_ms).clamp(0.0, crate::MAX_STEP_MS);
        let fade = (-(1.0 - self.deceleration) * (now_ms - start) * SLOPE_FACTOR).exp();
        match (self.clamp, self.rubber_band) {
            (Some(clamp), Some(factor)) => {
                let i = if (self.value - clamp[0]).abs() < (self.value - clamp[1]).abs() { 0 } else { 1 };
                let d = if self.value < clamp[0] || self.value > clamp[1] { self.value - clamp[i] } else { 0.0 };
                let v = self.v0 * fade - d * factor;
                if d.abs() > DERIVATIVE_EPS {
                    self.spring_active = true;
                } else if self.spring_active {
                    self.value = clamp[i];
                    self.running = false;
                    return false;
                } else if v.abs() < VELOCITY_EPS {
                    self.running = false;
                    return false;
                }
                self.value += v * self.velocity_factor * dt / 1000.0;
                self.velocity = v;
                self.last_ms = now_ms;
                true
            }
            _ => {
                let v = self.v0 * fade;
                self.value += v * self.velocity_factor * dt / 1000.0;
                self.velocity = v;
                self.last_ms = now_ms;
                if let Some(clamp) = self.clamp {
                    if (self.v0 < 0.0 && self.value <= clamp[0]) || (self.v0 > 0.0 && self.value >= clamp[1]) {
                        self.value = if self.v0 < 0.0 { clamp[0] } else { clamp[1] };
                        self.running = false;
                        return false;
                    }
                }
                self.running = v.abs() >= VELOCITY_EPS;
                self.running
            }
        }
    }
}

impl Default for Decay {
    fn default() -> Self {
        Decay::at(0.0)
    }
}
