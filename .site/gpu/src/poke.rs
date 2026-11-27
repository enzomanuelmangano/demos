//! Poking the intro's ghost (onboarding/ghost-poke.ts), as pure functions of
//! (state, now): taps climb surprised, skeptical, cross, shy, and the fifth is a
//! pirouette. Every curve starts and ends at rest; a new rung takes over from
//! what was on screen (`carry`).

use std::f32::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Surprised,
    Skeptical,
    Cross,
    Shy,
    Spin,
}

pub const LADDER: [Kind; 5] = [Kind::Surprised, Kind::Skeptical, Kind::Cross, Kind::Shy, Kind::Spin];

impl Kind {
    /// The name the app hears (and the RN `PokeKind`).
    pub fn name(self) -> &'static str {
        match self {
            Kind::Surprised => "surprised",
            Kind::Skeptical => "skeptical",
            Kind::Cross => "cross",
            Kind::Shy => "shy",
            Kind::Spin => "spin",
        }
    }
    /// The face each rung wears (faces.ts names).
    pub fn face(self) -> &'static str {
        match self {
            Kind::Spin => "found",
            other => other.name(),
        }
    }
    fn hold_ms(self) -> f32 {
        match self {
            Kind::Surprised => 900.0,
            Kind::Skeptical => 1100.0,
            Kind::Cross => 1200.0,
            Kind::Shy => 1400.0,
            Kind::Spin => SPIN_MS + 700.0,
        }
    }
    fn hop_height(self) -> f32 {
        match self {
            Kind::Surprised => 0.07,
            Kind::Skeptical => 0.03,
            Kind::Cross => 0.045,
            Kind::Shy => 0.015,
            Kind::Spin => 0.0,
        }
    }
}

/// A tap within this long of the last one climbs; a longer pause starts over.
pub const CHAIN_MS: f32 = 2000.0;
const SPIN_MS: f32 = 1300.0;
const SPIN_BACK: f32 = 1.4;
const SPIN_GO: f32 = SPIN_BACK / (SPIN_BACK + 1.0) / 2.0;
/// The pirouette's two beats after the tap, ms (its haptics).
pub fn spin_release_ms() -> f32 {
    (SPIN_MS * SPIN_GO).round()
}
pub fn spin_land_ms() -> f32 {
    (SPIN_MS * (1.0 - SPIN_GO)).round()
}
const SPIN_HOP: f32 = 0.06;
const SPIN_CROUCH: f32 = 0.06;
const SPIN_STRETCH: f32 = 0.05;
const FACE_RISE_MS: f32 = 120.0;
const FACE_FALL_MS: f32 = 450.0;
const HOP_MS: f32 = 300.0;
const LAND_MS: f32 = 260.0;
pub const CARRY_MS: f32 = 160.0;

/// `level` 0 is no poke yet; `at` is when the current rung was reached, ms.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct State {
    pub level: usize,
    pub at: f64,
}

pub const NONE: State = State { level: 0, at: 0.0 };

pub fn kind(level: usize) -> Kind {
    LADDER[level.clamp(1, LADDER.len()) - 1]
}

fn clamp01(x: f32) -> f32 {
    x.clamp(0.0, 1.0)
}
fn smooth(x: f32) -> f32 {
    let c = clamp01(x);
    c * c * (3.0 - 2.0 * c)
}
fn bell(x: f32, a: f32, b: f32) -> f32 {
    if x <= a || x >= b {
        return 0.0;
    }
    let s = (PI * (x - a) / (b - a)).sin();
    s * s
}
fn ease_in_out_back(x: f32, c: f32) -> f32 {
    let y = 2.0 * x;
    if x < 0.5 {
        y * y * ((c + 1.0) * y - c) / 2.0
    } else {
        ((y - 2.0) * (y - 2.0) * ((c + 1.0) * (y - 2.0) + c) + 2.0) / 2.0
    }
}
fn since(s: State, now: f64) -> f32 {
    (now - s.at) as f32
}
fn spin_x(s: State, now: f64) -> f32 {
    if s.level > 0 && kind(s.level) == Kind::Spin {
        since(s, now) / SPIN_MS
    } else {
        -1.0
    }
}

/// The state after a tap at `now`, or `None` when it is ignored (mid
/// pirouette, and through the face after it).
pub fn next(s: State, now: f64) -> Option<State> {
    if s.level > 0 {
        let k = kind(s.level);
        let t = since(s, now);
        if k == Kind::Spin {
            if t < k.hold_ms() {
                return None;
            }
        } else if t < CHAIN_MS {
            return Some(State { level: s.level + 1, at: now });
        }
    }
    Some(State { level: 1, at: now })
}

pub fn carry(s: State, now: f64) -> f32 {
    if s.level == 0 {
        0.0
    } else {
        1.0 - smooth(since(s, now) / CARRY_MS)
    }
}

pub fn face_weight(s: State, now: f64) -> f32 {
    if s.level == 0 {
        return 0.0;
    }
    let k = kind(s.level);
    let start = if k == Kind::Spin { spin_land_ms() - 120.0 } else { 0.0 };
    let t = since(s, now) - start;
    let hold = k.hold_ms() - start;
    if t <= 0.0 {
        0.0
    } else if t < FACE_RISE_MS {
        smooth(t / FACE_RISE_MS)
    } else if t < hold {
        1.0
    } else {
        1.0 - smooth((t - hold) / FACE_FALL_MS)
    }
}

pub fn hop(s: State, now: f64) -> f32 {
    if s.level == 0 {
        return 0.0;
    }
    let x = spin_x(s, now);
    if x >= 0.0 {
        return SPIN_HOP * bell(x, 0.28, 0.78);
    }
    kind(s.level).hop_height() * bell(since(s, now), 0.0, HOP_MS)
}

pub fn stretch(s: State, now: f64) -> f32 {
    if s.level == 0 {
        return 0.0;
    }
    let x = spin_x(s, now);
    if x >= 0.0 {
        return -SPIN_CROUCH * bell(x, 0.02, 0.36) + SPIN_STRETCH * bell(x, 0.3, 0.72) - SPIN_CROUCH * 0.8 * bell(x, 0.68, 0.94);
    }
    let t = since(s, now);
    let amount = kind(s.level).hop_height();
    amount * 0.8 * bell(t, 0.0, HOP_MS) - amount * 1.2 * bell(t, HOP_MS * 0.85, HOP_MS + LAND_MS)
}

pub fn spin(s: State, now: f64) -> f32 {
    let x = spin_x(s, now);
    if x <= 0.0 || x >= 1.0 {
        return 0.0;
    }
    2.0 * PI * ease_in_out_back(x, SPIN_BACK)
}

pub fn stand(s: State, now: f64) -> f32 {
    let x = spin_x(s, now);
    if x <= 0.0 || x >= 1.0 {
        return 0.0;
    }
    smooth(x / 0.26) * (1.0 - smooth((x - 0.7) / 0.3))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ghost-poke.test.ts, case for case.
    #[test]
    fn climbs_then_spins() {
        let mut s = NONE;
        let mut kinds = vec![];
        for i in 0..5 {
            s = next(s, 1000.0 + i as f64 * 500.0).unwrap();
            kinds.push(kind(s.level));
        }
        assert_eq!(kinds, LADDER.to_vec());
    }

    #[test]
    fn starts_over_after_a_pause() {
        let first = next(NONE, 0.0).unwrap();
        let second = next(first, CHAIN_MS as f64 + 1.0).unwrap();
        assert_eq!(kind(second.level), Kind::Surprised);
    }

    #[test]
    fn ignores_taps_through_the_pirouette() {
        let mut s = NONE;
        for i in 0..5 {
            s = next(s, i as f64 * 100.0).unwrap();
        }
        assert!(next(s, 500.0).is_none());
        let later = next(s, 400.0 + 2001.0).unwrap();
        assert_eq!(kind(later.level), Kind::Surprised);
    }

    #[test]
    fn the_reaction() {
        assert_eq!(face_weight(NONE, 5000.0), 0.0);
        assert_eq!(hop(NONE, 5000.0), 0.0);
        let surprised = State { level: 1, at: 1000.0 };
        assert_eq!(face_weight(surprised, 1000.0), 0.0);
        assert_eq!(face_weight(surprised, 1500.0), 1.0);
        assert!(hop(surprised, 1140.0) > 0.0);
        assert_eq!(hop(surprised, 3000.0), 0.0);
        assert!(stretch(surprised, 1320.0) < 0.0);
        assert_eq!(spin(surprised, 1300.0), 0.0);
        let spun = State { level: 5, at: 1000.0 };
        assert!(spin(spun, 1100.0) < 0.0);
        assert!(spin(spun, 1650.0) > PI * 0.8);
        assert!(spin(spun, 2050.0) > 2.0 * PI);
        assert!((spin(spun, 2299.0).cos() - 1.0).abs() < 1e-3);
        assert_eq!(spin(spun, 3000.0), 0.0);
        assert_eq!(face_weight(spun, 1300.0), 0.0);
        assert_eq!(face_weight(spun, 2000.0), 1.0);
        assert_eq!(carry(surprised, 1000.0), 1.0);
        assert_eq!(carry(surprised, 1300.0), 0.0);
        assert_eq!(spin_release_ms(), 379.0);
        assert_eq!(spin_land_ms(), 921.0);
    }
}
