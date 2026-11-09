//! `Easing` (Easing.ts) and `Easing.bezier` (Bezier.ts).

/// An easing curve, evaluated on 0…1.
#[derive(Clone, Debug, PartialEq)]
pub enum Easing {
    /// `Easing.linear`.
    Linear,
    /// `Easing.ease`: `Bezier(0.42, 0, 1, 1)`.
    Ease,
    /// `Easing.quad`.
    Quad,
    /// `Easing.cubic`.
    Cubic,
    /// `Easing.poly(n)`.
    Poly(f64),
    /// `Easing.sin`.
    Sin,
    /// `Easing.circle`.
    Circle,
    /// `Easing.exp`.
    Exp,
    /// `Easing.elastic(bounciness)`.
    Elastic(f64),
    /// `Easing.back(s)`.
    Back(f64),
    /// `Easing.bounce`.
    Bounce,
    /// `Easing.bezier(x1, y1, x2, y2)`.
    Bezier(Bezier),
    /// `Easing.in(e)`.
    In(Box<Easing>),
    /// `Easing.out(e)`.
    Out(Box<Easing>),
    /// `Easing.inOut(e)`.
    InOut(Box<Easing>),
    /// `Easing.steps(n, roundToNextStep)`.
    Steps(u32, bool),
}

impl Easing {
    /// `Easing.bezier(x1, y1, x2, y2)`.
    pub fn bezier(x1: f64, y1: f64, x2: f64, y2: f64) -> Easing {
        Easing::Bezier(Bezier::new(x1, y1, x2, y2))
    }
    /// `Easing.in(e)`.
    pub fn r#in(e: Easing) -> Easing {
        Easing::In(Box::new(e))
    }
    /// `Easing.out(e)`.
    pub fn out(e: Easing) -> Easing {
        Easing::Out(Box::new(e))
    }
    /// `Easing.inOut(e)`.
    pub fn in_out(e: Easing) -> Easing {
        Easing::InOut(Box::new(e))
    }
    /// `withTiming`'s default: `Easing.inOut(Easing.quad)`.
    pub fn timing_default() -> Easing {
        Easing::in_out(Easing::Quad)
    }

    /// The curve at `t`.
    pub fn at(&self, t: f64) -> f64 {
        use std::f64::consts::PI;
        match self {
            Easing::Linear => t,
            Easing::Ease => EASE.with(|b| b.at(t)),
            Easing::Quad => t * t,
            Easing::Cubic => t * t * t,
            Easing::Poly(n) => t.powf(*n),
            Easing::Sin => 1.0 - (t * PI / 2.0).cos(),
            Easing::Circle => 1.0 - (1.0 - t * t).sqrt(),
            Easing::Exp => 2f64.powf(10.0 * (t - 1.0)),
            Easing::Elastic(b) => 1.0 - (t * PI / 2.0).cos().powi(3) * (t * b * PI).cos(),
            Easing::Back(s) => t * t * ((s + 1.0) * t - s),
            Easing::Bounce => {
                if t < 1.0 / 2.75 {
                    7.5625 * t * t
                } else if t < 2.0 / 2.75 {
                    let t2 = t - 1.5 / 2.75;
                    7.5625 * t2 * t2 + 0.75
                } else if t < 2.5 / 2.75 {
                    let t2 = t - 2.25 / 2.75;
                    7.5625 * t2 * t2 + 0.9375
                } else {
                    let t2 = t - 2.625 / 2.75;
                    7.5625 * t2 * t2 + 0.984375
                }
            }
            Easing::Bezier(b) => b.at(t),
            Easing::In(e) => e.at(t),
            Easing::Out(e) => 1.0 - e.at(1.0 - t),
            Easing::InOut(e) => {
                if t < 0.5 {
                    e.at(t * 2.0) / 2.0
                } else {
                    1.0 - e.at((1.0 - t) * 2.0) / 2.0
                }
            }
            Easing::Steps(n, next) => {
                let v = t.clamp(0.0, 1.0) * *n as f64;
                (if *next { v.ceil() } else { v.floor() }) / *n as f64
            }
        }
    }
}

thread_local! {
    static EASE: Bezier = Bezier::new(0.42, 0.0, 1.0, 1.0);
}

const NEWTON_ITERATIONS: usize = 4;
const NEWTON_MIN_SLOPE: f64 = 0.001;
const SUBDIVISION_PRECISION: f64 = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS: usize = 10;
const TABLE: usize = 11;
const STEP: f64 = 1.0 / (TABLE as f64 - 1.0);

/// A cubic Bézier easing, its sample table precomputed (Bezier.ts).
#[derive(Clone, Debug, PartialEq)]
pub struct Bezier {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    samples: [f64; TABLE],
}

fn a(a1: f64, a2: f64) -> f64 {
    1.0 - 3.0 * a2 + 3.0 * a1
}
fn b(a1: f64, a2: f64) -> f64 {
    3.0 * a2 - 6.0 * a1
}
fn c(a1: f64) -> f64 {
    3.0 * a1
}
fn calc(t: f64, a1: f64, a2: f64) -> f64 {
    ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t
}
fn slope(t: f64, a1: f64, a2: f64) -> f64 {
    3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1)
}

impl Bezier {
    /// `Bezier(x1, y1, x2, y2)`; the x values must lie in 0…1.
    pub fn new(x1: f64, y1: f64, x2: f64, y2: f64) -> Bezier {
        let mut samples = [0.0; TABLE];
        for (i, s) in samples.iter_mut().enumerate() {
            *s = calc(i as f64 * STEP, x1, x2);
        }
        Bezier { x1, y1, x2, y2, samples }
    }

    fn t_for_x(&self, x: f64) -> f64 {
        let mut start = 0.0;
        let mut current = 1;
        let last = TABLE - 1;
        while current != last && self.samples[current] <= x {
            start += STEP;
            current += 1;
        }
        current -= 1;
        let dist = (x - self.samples[current]) / (self.samples[current + 1] - self.samples[current]);
        let guess = start + dist * STEP;
        let initial = slope(guess, self.x1, self.x2);
        if initial >= NEWTON_MIN_SLOPE {
            let mut t = guess;
            for _ in 0..NEWTON_ITERATIONS {
                let s = slope(t, self.x1, self.x2);
                if s == 0.0 {
                    return t;
                }
                t -= (calc(t, self.x1, self.x2) - x) / s;
            }
            t
        } else if initial == 0.0 {
            guess
        } else {
            let (mut lo, mut hi) = (start, start + STEP);
            let mut t;
            let mut i = 0;
            loop {
                t = lo + (hi - lo) / 2.0;
                let cx = calc(t, self.x1, self.x2) - x;
                if cx > 0.0 {
                    hi = t;
                } else {
                    lo = t;
                }
                i += 1;
                if cx.abs() <= SUBDIVISION_PRECISION || i >= SUBDIVISION_MAX_ITERATIONS {
                    break;
                }
            }
            t
        }
    }

    /// The curve at `x`.
    pub fn at(&self, x: f64) -> f64 {
        if self.x1 == self.y1 && self.x2 == self.y2 {
            return x;
        }
        if x == 0.0 {
            return 0.0;
        }
        if x == 1.0 {
            return 1.0;
        }
        calc(self.t_for_x(x), self.y1, self.y2)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bezier_matches_css_ease_at_its_midpoint() {
        // cubic-bezier(0.25, 0.1, 0.25, 1) at 0.5 is about 0.8024.
        let e = Easing::bezier(0.25, 0.1, 0.25, 1.0);
        assert!((e.at(0.5) - 0.8024).abs() < 1e-3, "{}", e.at(0.5));
        assert_eq!(e.at(0.0), 0.0);
        assert_eq!(e.at(1.0), 1.0);
    }

    #[test]
    fn in_out_quad_is_symmetric() {
        let e = Easing::timing_default();
        assert!((e.at(0.25) + e.at(0.75) - 1.0).abs() < 1e-12);
    }
}
