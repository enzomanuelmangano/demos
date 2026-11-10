//! Reanimated 4's `withSpring`, frame by frame, as `springOnFrame` runs it
//! (react-native-reanimated/src/animation/spring/spring.ts, springUtils.ts): the analytic
//! under- or critically damped step from the animation's start, a frame's time capped at 64 ms,
//! done when its energy falls under `energyThreshold` (6e-9) of the start's.

/// A spring's constants. `GENTLE` is `withSpring`'s default.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Config {
    /// k.
    pub stiffness: f64,
    /// c.
    pub damping: f64,
    /// m.
    pub mass: f64,
}

/// Reanimated 4's default (`GentleSpringConfig`).
pub const GENTLE: Config = Config { stiffness: 900.0, damping: 120.0, mass: 4.0 };

/// One animated value.
#[derive(Clone, Copy, Debug)]
pub struct Spring {
    config: Config,
    from: f64,
    to: f64,
    v0: f64,
    /// Seconds since the start.
    t: f64,
    last_ms: Option<f64>,
    energy0: f64,
    /// Where it is, and how fast it moves (units / s).
    pub value: f64,
    /// Units per second.
    pub velocity: f64,
    /// False once at rest.
    pub running: bool,
    /// `overshootClamping`: done the moment it leaves the span from its start to its target.
    overshoot_clamping: bool,
}

/// `withSpring(to, { duration, dampingRatio, mass })`: the constants Reanimated solves when the
/// animation starts (springUtils.ts `calculateNewStiffnessToMatchDuration`), from the distance
/// `x0` (value − target) and the velocity `v0` it starts with: the stiffness whose energy falls
/// to 6e-9 of its start by 1.5 × duration (bisection, as Reanimated's), damping 2ζ√(km).
pub fn duration_config(x0: f64, v0: f64, duration_ms: f64, damping_ratio: f64, mass: f64) -> Config {
    let threshold = 6e-9;
    let energy = |x: f64, v: f64, k: f64| 0.5 * k * x * x + 0.5 * mass * v * v;
    let diff = |k: f64| {
        let settling = duration_ms * 1.5 / 1000.0;
        let omega0 = (k / mass).sqrt() * damping_ratio;
        let e = (-omega0 * settling).exp();
        let xtk = (x0 + (v0 + x0 * omega0) * settling) * e;
        let vtk = (x0 + (v0 + x0 * omega0) * settling) * e * -omega0 + (v0 + x0 * omega0) * e;
        energy(xtk, vtk, k) / energy(x0, v0, k) - threshold
    };
    let precision = threshold * 1e-3;
    let (mut lo, mut hi) = (f64::EPSILON, 8e3);
    let direction = if diff(hi) >= diff(lo) { 1.0 } else { -1.0 };
    let mut k = (lo + hi) / 2.0;
    let mut left = 100;
    while diff(k).abs() > precision && left > 0 {
        left -= 1;
        if diff(k) * direction < 0.0 {
            lo = k;
        } else {
            hi = k;
        }
        k = (lo + hi) / 2.0;
    }
    Config { stiffness: k, damping: 2.0 * damping_ratio * (k * mass).sqrt(), mass }
}

impl Spring {
    /// At rest at `value`.
    pub fn at(value: f64) -> Spring {
        Spring { config: GENTLE, from: value, to: value, v0: 0.0, t: 0.0, last_ms: None, energy0: 0.0, value, velocity: 0.0, running: false, overshoot_clamping: false }
    }

    /// Held where the finger puts it.
    pub fn set(&mut self, value: f64) {
        *self = Spring::at(value);
    }

    /// Off to `to` from where it is, at `velocity`. As Reanimated's `onStart`, a velocity that
    /// points away from `to` is dropped (only inertia toward the target is kept).
    pub fn to(&mut self, to: f64, velocity: f64, config: Config) {
        let velocity = if (to > self.value && velocity < 0.0) || (to < self.value && velocity > 0.0) { 0.0 } else { velocity };
        self.overshoot_clamping = false;
        let x0 = self.value - to;
        self.config = config;
        self.from = self.value;
        self.to = to;
        self.v0 = velocity;
        self.t = 0.0;
        self.last_ms = None;
        self.energy0 = 0.5 * config.stiffness * x0 * x0 + 0.5 * config.mass * velocity * velocity;
        self.running = self.energy0 > 0.0;
        if !self.running {
            self.value = to;
            self.velocity = 0.0;
        }
    }

    /// [`Spring::to`] with `overshootClamping: true`: it ends at `to` as soon as it passes it.
    pub fn to_clamped(&mut self, to: f64, velocity: f64, config: Config) {
        self.to(to, velocity, config);
        self.overshoot_clamping = true;
    }

    /// `withSpring(to)` from a mapper (`useDerivedValue(() => withSpring(x.get()))`) when its
    /// input changes: from where it is, at its velocity, its clock going on from the last frame
    /// (Reanimated starts the new animation at that frame's timestamp), so a target that moves
    /// every frame is still chased.
    pub fn retarget(&mut self, to: f64, config: Config) {
        if self.running && self.to == to && self.config == config {
            return;
        }
        let last = if self.running { self.last_ms } else { None };
        self.to(to, self.velocity, config);
        self.last_ms = last;
        // spring.ts onStart: `initialEnergy = getEnergy(x0, config.velocity, …)`; the inherited
        // velocity moves the spring but is not in the energy its rest is measured against.
        let x0 = self.from - to;
        self.energy0 = 0.5 * config.stiffness * x0 * x0;
        self.running = self.energy0 > 0.0;
        if !self.running {
            self.value = to;
            self.velocity = 0.0;
        }
    }

    /// Where it is going.
    pub fn target(&self) -> f64 {
        self.to
    }

    /// Steps to the frame at `now_ms`; returns whether it still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        if !self.running {
            return false;
        }
        let dt = match self.last_ms {
            None => 0.0,
            Some(last) => (now_ms - last).clamp(0.0, 64.0) / 1000.0,
        };
        self.last_ms = Some(now_ms);
        self.t += dt;
        let Config { stiffness: k, damping: c, mass: m } = self.config;
        let zeta = c / (2.0 * (k * m).sqrt());
        let omega0 = (k / m).sqrt();
        let x0 = self.to - self.from;
        let v0 = -self.v0;
        let t = self.t;
        let (x, v) = if zeta < 1.0 {
            let omega1 = omega0 * (1.0 - zeta * zeta).sqrt();
            let envelope = (-zeta * omega0 * t).exp();
            let x = envelope * (((v0 + zeta * omega0 * x0) / omega1) * (omega1 * t).sin() + x0 * (omega1 * t).cos());
            let v = zeta * omega0 * x
                - envelope * ((omega1 * t).cos() * (v0 + zeta * omega0 * x0) - omega1 * x0 * (omega1 * t).sin());
            (x, v)
        } else {
            let envelope = (-omega0 * t).exp();
            let x = envelope * (x0 + (v0 + omega0 * x0) * t);
            let v = envelope * (v0 * (t * omega0 - 1.0) + t * x0 * omega0 * omega0);
            (x, v)
        };
        self.value = self.to - x;
        self.velocity = v;
        if self.overshoot_clamping && (self.value < self.from.min(self.to) || self.value > self.from.max(self.to)) {
            self.value = self.to;
            self.velocity = 0.0;
            self.running = false;
            return false;
        }
        let energy = 0.5 * k * x * x + 0.5 * m * v * v;
        if self.energy0 <= 0.0 || energy / self.energy0 < 6e-9 {
            self.value = self.to;
            self.velocity = 0.0;
            self.running = false;
        }
        self.running
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gentle_settles_in_about_its_perceptual_duration() {
        let mut s = Spring::at(0.0);
        s.to(100.0, 0.0, GENTLE);
        let mut ms = 0.0;
        while s.step(ms) {
            ms += 1000.0 / 60.0;
            assert!(ms < 3000.0);
        }
        assert_eq!(s.value, 100.0);
        // GentleSpringConfigWithDuration says 550 ms perceptual, 1.5x to rest.
        assert!((700.0..1000.0).contains(&ms), "{ms}");
    }
}

impl Default for Spring {
    fn default() -> Self {
        Spring::at(0.0)
    }
}
