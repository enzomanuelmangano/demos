//! `withSpring(target, { duration, dampingRatio: 1 })` over a whole array of numbers, stepped
//! together: the RN demos' spring-array.ts (src/animations/spiral/spring-array.ts), itself
//! Reanimated 4.5's critically damped duration spring per element. The stiffness is solved per
//! element (one solve for every element at rest), a velocity pointing away from the new target
//! is dropped, and each element rests once its energy falls under 6e-9 of its start.

const MASS: f64 = 4.0;
const ENERGY_THRESHOLD: f64 = 6e-9;
const PERCEPTUAL_COEFFICIENT: f64 = 1.5;

fn energy(x: f64, v: f64, k: f64) -> f64 {
    0.5 * k * x * x + 0.5 * MASS * v * v
}

/// The stiffness that settles a critically damped spring from `x0` at `v0` in `duration_ms`.
pub fn solve_stiffness(x0: f64, v0: f64, duration_ms: f64) -> f64 {
    let settling = duration_ms * PERCEPTUAL_COEFFICIENT / 1000.0;
    let diff = |k: f64| {
        let w = (k / MASS).sqrt();
        let envelope = (-w * settling).exp();
        let a = v0 + x0 * w;
        let xt = (x0 + a * settling) * envelope;
        let vt = xt * -w + a * envelope;
        let e0 = 0.5 * k * x0 * x0 + 0.5 * MASS * v0 * v0;
        energy(xt, vt, k) / e0 - ENERGY_THRESHOLD
    };
    let precision = ENERGY_THRESHOLD * 1e-3;
    let (mut lo, mut hi) = (f64::EPSILON, 8e3);
    let direction = if diff(hi) >= diff(lo) { 1.0 } else { -1.0 };
    let mut k = (lo + hi) / 2.0;
    for _ in 0..100 {
        let d = diff(k);
        if !(d.abs() > precision) {
            break;
        }
        if d * direction < 0.0 {
            lo = k;
        } else {
            hi = k;
        }
        k = (lo + hi) / 2.0;
    }
    k
}

/// Every element of an array, sprung together.
#[derive(Clone, Debug, Default)]
pub struct SpringArray {
    /// Where each element is.
    pub current: Vec<f64>,
    velocity: Vec<f64>,
    target: Vec<f64>,
    omega0: Vec<f64>,
    stiffness: Vec<f64>,
    initial: Vec<f64>,
    done: Vec<bool>,
    last_ms: Option<f64>,
    /// False once every element rests.
    pub running: bool,
}

impl SpringArray {
    /// At rest at `values`.
    pub fn new(values: Vec<f64>) -> SpringArray {
        let n = values.len();
        SpringArray {
            target: values.clone(),
            current: values,
            velocity: vec![0.0; n],
            omega0: vec![0.0; n],
            stiffness: vec![0.0; n],
            initial: vec![0.0; n],
            done: vec![true; n],
            last_ms: None,
            running: false,
        }
    }

    /// Points every element at its new target, as starting withSpring would.
    pub fn retarget(&mut self, target: &[f64], duration_ms: f64) {
        let rest = solve_stiffness(1.0, 0.0, duration_ms);
        for (i, &to) in target.iter().enumerate() {
            let value = self.current[i];
            let mut v = self.velocity[i];
            if (to > value && v < 0.0) || (to < value && v > 0.0) {
                v = 0.0;
            }
            let x0 = value - to;
            let k = if v == 0.0 && x0 != 0.0 { rest } else { solve_stiffness(x0, v, duration_ms) };
            self.target[i] = to;
            self.velocity[i] = v;
            self.stiffness[i] = k;
            self.omega0[i] = (k / MASS).sqrt();
            self.initial[i] = energy(x0, 0.0, k);
            self.done[i] = false;
        }
        if !self.running {
            self.last_ms = None;
        }
        self.running = true;
    }

    /// Advances every element to `now_ms`; returns whether any still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        if !self.running {
            return false;
        }
        let last = self.last_ms.unwrap_or(now_ms);
        let t = (now_ms - last).clamp(0.0, crate::MAX_STEP_MS) / 1000.0;
        self.last_ms = Some(now_ms);
        let mut running = false;
        for i in 0..self.current.len() {
            if self.done[i] {
                continue;
            }
            let to = self.target[i];
            let x0 = self.current[i] - to;
            let v0 = self.velocity[i];
            let w = self.omega0[i];
            let envelope = (-w * t).exp();
            let position = to + envelope * (x0 + (v0 + w * x0) * t);
            let v = envelope * -w * (x0 + (v0 + w * x0) * t) + envelope * (v0 + w * x0);
            let e = energy(to - position, v, self.stiffness[i]);
            if self.initial[i] == 0.0 || e / self.initial[i] <= ENERGY_THRESHOLD {
                self.current[i] = to;
                self.velocity[i] = 0.0;
                self.done[i] = true;
            } else {
                self.current[i] = position;
                self.velocity[i] = v;
                running = true;
            }
        }
        self.running = running;
        running
    }
}
