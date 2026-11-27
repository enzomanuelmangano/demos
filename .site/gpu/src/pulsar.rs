//! The RN app's Core Haptics patterns (react-native-pulsar 1.6.1, pod 1.1.4) as Exact's surface
//! haptics (`exact_gpu::haptics`): onboarding/mate-haptics.ts WAVE_PATTERN and CARD_PATTERN,
//! onboarding/dizzy.ts POP_PATTERNS.
//!
//! Pulsar's PatternComposer.parsePattern builds two CHHapticPatterns and starts both at once: the
//! discrete points as transients (intensity = amplitude, sharpness = frequency, no curves), and,
//! when both curves have points, one continuous event at intensity 1 and sharpness 0 lasting the
//! longer curve, moved by `hapticIntensityControl` and `hapticSharpnessControl`. A curve whose
//! first point is after 0 gets a point at 0 with the same value (CurveLineModifier.addPoint).
//! Times are ms here, as in the RN source; the messages carry seconds.

use exact_gpu::haptics::{Curve, Event, Haptic, Parameter, Pattern};

/// A pattern as RN writes it: `discretePattern` (ms, amplitude, frequency) and the continuous
/// pattern's amplitude and frequency curves (ms, value).
pub struct Pulsar {
    pub discrete: &'static [(f32, f32, f32)],
    pub amplitude: &'static [(f32, f32)],
    pub frequency: &'static [(f32, f32)],
}

/// mate-haptics.ts WAVE_PATTERN: from the wave's first visible frame, the detonation and its rumble.
pub const WAVE: Pulsar = Pulsar {
    discrete: &[(0.0, 1.0, 0.35), (60.0, 0.9, 0.2), (230.0, 0.55, 0.5), (460.0, 0.4, 0.4), (760.0, 0.3, 0.35), (1160.0, 0.2, 0.3), (1660.0, 0.12, 0.3)],
    amplitude: &[(0.0, 1.0), (170.0, 0.55), (290.0, 0.7), (560.0, 0.4), (810.0, 0.5), (1600.0, 0.15), (2300.0, 0.0)],
    frequency: &[(0.0, 0.9), (130.0, 0.25), (1000.0, 0.35), (2300.0, 0.3)],
};

/// mate-haptics.ts CARD_PATTERN: when the card has risen, a short ascending triple.
pub const CARD: Pulsar = Pulsar {
    discrete: &[(0.0, 0.6, 0.6), (75.0, 0.75, 0.8), (160.0, 0.9, 1.0)],
    amplitude: &[(0.0, 0.0), (160.0, 0.0)],
    frequency: &[(0.0, 0.5), (160.0, 0.5)],
};

/// dizzy.ts `pop(amplitude, frequency)`: a crack and a softer, duller tail 45 ms behind it.
const fn pop(discrete: &'static [(f32, f32, f32)]) -> Pulsar {
    Pulsar { discrete, amplitude: &[(0.0, 0.0), (60.0, 0.0)], frequency: &[(0.0, 0.5), (60.0, 0.5)] }
}

/// dizzy.ts POP_PATTERNS: pop(0.5, 0.5), pop(0.7, 0.72), pop(0.95, 0.95), the tail at
/// amplitude × 0.35 and frequency × 0.6.
pub const POPS: [Pulsar; 3] = [
    pop(&[(0.0, 0.5, 0.5), (45.0, 0.5 * 0.35, 0.5 * 0.6)]),
    pop(&[(0.0, 0.7, 0.72), (45.0, 0.7 * 0.35, 0.72 * 0.6)]),
    pop(&[(0.0, 0.95, 0.95), (45.0, 0.95 * 0.35, 0.95 * 0.6)]),
];

fn curve(parameter: Parameter, points: &[(f32, f32)]) -> Curve {
    let mut out: Vec<(f32, f32)> = Vec::with_capacity(points.len() + 1);
    if let Some(&(t, v)) = points.first() {
        if t > 0.0 {
            out.push((0.0, v));
        }
    }
    out.extend(points.iter().map(|&(t, v)| (t / 1000.0, v)));
    Curve { parameter, points: out }
}

impl Pulsar {
    /// The messages that play it now, as Pulsar's `play` starts its two players.
    pub fn messages(&self) -> Vec<String> {
        let mut out = Vec::with_capacity(2);
        if !self.amplitude.is_empty() && !self.frequency.is_empty() {
            let last = |c: &[(f32, f32)]| c.iter().fold(0.0f32, |m, p| m.max(p.0));
            let duration = last(self.amplitude).max(last(self.frequency)) / 1000.0;
            out.push(
                Haptic::Pattern(Pattern {
                    events: vec![Event::Continuous { time: 0.0, duration, intensity: 1.0, sharpness: 0.0 }],
                    curves: vec![curve(Parameter::Intensity, self.amplitude), curve(Parameter::Sharpness, self.frequency)],
                })
                .message(),
            );
        }
        if !self.discrete.is_empty() {
            let events = self.discrete.iter().map(|&(t, a, f)| Event::Transient { time: t / 1000.0, intensity: a, sharpness: f }).collect();
            out.push(Haptic::Pattern(Pattern { events, curves: Vec::new() }).message());
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pattern_is_a_continuous_player_and_a_transient_player() {
        let m = WAVE.messages();
        assert_eq!(m.len(), 2);
        assert!(m[0].contains("\"continuous\"") && m[0].contains("\"duration\":2.3"), "{}", m[0]);
        assert!(m[0].contains("[0.17,0.55]"), "the curve in seconds: {}", m[0]);
        assert_eq!(m[1].matches("\"transient\"").count(), 7);
        assert!(m[1].contains("\"curves\":[]"));
    }

    #[test]
    fn the_pops_rise_and_each_has_its_tail() {
        for (i, p) in POPS.iter().enumerate() {
            assert_eq!(p.discrete.len(), 2);
            assert!((p.discrete[1].0 - 45.0).abs() < 1e-6);
            if i > 0 {
                assert!(p.discrete[0].1 > POPS[i - 1].discrete[0].1);
            }
        }
        assert!((POPS[2].discrete[1].1 - 0.3325).abs() < 1e-6);
    }
}
