//! The ghost's performer, with no rendering in it: the RN app's `ghost-rig.ts` (the moves, the
//! states and `createRig`'s per-frame update) and the scheduling half of `hero-scene-core.ts`
//! (the ambient gestures, Reduce Motion's held pose, the entrance). hero.rs draws what a frame
//! returns. Every number is RN's; the RN file and line a block ports is named above it.
//!
//! Doubles, as RN's JS: the clock accumulates for as long as Home lives.

use std::f64::consts::{PI, TAU};

// ————— ghost-rig.ts:9-46 —————
/// Frame 1 is the pawn, 30 the settled ghost, 30 to 102 the authored idle loop.
pub const PAWN_FRAME: f64 = 1.0;
pub const GHOST_FRAME: f64 = 30.0;
pub const IDLE_TO: f64 = 102.0;
pub const FPS: f64 = 24.0;
/// Where the eyes rest when nothing is pulling them, radians of pitch.
pub const REST_PITCH: f64 = 0.4818;
pub const FACE_LAMBDA: f64 = 6.0;
pub const BODY_LAMBDA: f64 = 3.2;
pub const BLINK_DOWN: f64 = 0.07;
pub const BLINK_UP: f64 = 0.16;
pub const GAZE_LAMBDA: f64 = 14.0;
pub const DEG: f64 = PI / 180.0;
/// easeOutBack's overshoot.
pub const BACK: f64 = 1.35;
/// The residual drains as a critically damped spring (ghost-rig.ts:1270).
pub const RESIDUAL_W: f64 = 13.0;
/// The non-body channels' low-pass (createRig's AUX_LAMBDA).
pub const AUX_LAMBDA: f64 = 25.0;

// ————— hero-scene-core.ts:49-50, 252 —————
/// Seconds between ambient gestures.
pub const AMBIENT_MIN_S: f64 = 2.6;
pub const AMBIENT_MAX_S: f64 = 5.4;
/// How long past a move's end the pose counts as held.
pub const HOLD_MARGIN_S: f64 = 0.4;
/// The longest step a frame advances the rig by (a frame after a sleep is not a jump).
pub const MAX_DT: f64 = 0.05;
/// Home's ambient gestures (rating-hero.tsx:24-44).
pub const HOME_AMBIENT: [&str; 5] = ["scan", "nod", "lean", "eyeRoll", "doubleTake"];

/// Frame-rate independent exponential approach.
pub fn approach(from: f64, to: f64, lambda: f64, dt: f64) -> f64 {
    to + (from - to) * (-lambda * dt).exp()
}
pub fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}
/// Progress through a window, clamped to 0..1.
pub fn span(t: f64, from: f64, to: f64) -> f64 {
    clamp01((t - from) / (to - from))
}
pub fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}
pub fn ease_in(t: f64) -> f64 {
    t * t * t
}
pub fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t.powi(3)
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}
pub fn ease_out_back(t: f64) -> f64 {
    1.0 + (BACK + 1.0) * (t - 1.0).powi(3) + BACK * (t - 1.0).powi(2)
}
/// An angle folded into (-pi, pi].
pub fn wrap_pi(a: f64) -> f64 {
    a.sin().atan2(a.cos())
}
/// A non-finite value sticks, because the residual accumulates.
fn safe0(v: f64) -> f64 {
    if v.is_finite() {
        v
    } else {
        0.0
    }
}

// ————— faces.ts —————
/// A GhostFace: the channels of ghost-rig.ts CHANNELS, in its order.
pub type Face = [f64; 15];
pub const W_L: usize = 0;
pub const W_R: usize = 1;
pub const H_L: usize = 2;
pub const H_R: usize = 3;
pub const ANG_L: usize = 4;
pub const ANG_R: usize = 5;
pub const FROWN_L: usize = 6;
pub const FROWN_R: usize = 7;
pub const GLINT_X: usize = 8;
pub const GLINT_Y: usize = 9;
pub const YAW: usize = 10;
pub const PITCH: usize = 11;
pub const SPREAD: usize = 12;
pub const OPEN: usize = 13;
pub const PUPIL: usize = 14;

/// NEUTRAL_FACE.
pub const NEUTRAL: Face = [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0];

const fn with(mut f: Face, sets: &[(usize, f64)]) -> Face {
    let mut i = 0;
    while i < sets.len() {
        f[sets[i].0] = sets[i].1;
        i += 1;
    }
    f
}

/// ghost-rig.ts SMILE: the eye shut to a hair above the blink floor, read as an arc.
pub const SMILE: Face = with(NEUTRAL, &[(H_L, 1.1), (H_R, 1.1), (FROWN_R, 0.05), (YAW, -1.5), (PITCH, -5.5), (SPREAD, -1.5), (OPEN, 0.07)]);

/// A face of faces.ts by name (faceByName): neutral for a name it does not have.
pub fn face_by_name(name: &str) -> Face {
    match name {
        "attentive" => with(NEUTRAL, &[(YAW, 4.0), (PITCH, 11.0), (GLINT_Y, 0.1)]),
        "alert" => with(NEUTRAL, &[(H_L, 1.1), (H_R, 1.1), (PITCH, 6.0)]),
        "wide" => with(NEUTRAL, &[(W_L, 1.15), (W_R, 1.15), (H_L, 1.2), (H_R, 1.2)]),
        "surprised" => with(NEUTRAL, &[(W_L, 1.1), (W_R, 1.1), (H_L, 1.15), (H_R, 1.15), (GLINT_Y, 0.06)]),
        "down_gaze" => with(NEUTRAL, &[(YAW, 2.0), (PITCH, -13.0), (GLINT_Y, -0.28)]),
        "sly" => with(NEUTRAL, &[(YAW, 8.0), (H_L, 0.55), (H_R, 0.55), (ANG_L, 6.0), (ANG_R, 6.0)]),
        "sad" => with(NEUTRAL, &[(PITCH, 8.0), (FROWN_L, -0.7), (FROWN_R, -0.7), (OPEN, 0.85)]),
        "pleading" => {
            with(NEUTRAL, &[(YAW, 3.0), (PITCH, 11.0), (W_L, 1.04), (W_R, 1.04), (H_L, 1.12), (H_R, 1.12), (SPREAD, 3.5), (FROWN_L, -0.5), (FROWN_R, -0.5)])
        }
        "found" => with(NEUTRAL, &[(YAW, 2.0), (PITCH, -11.0), (W_L, 1.04), (W_R, 1.04), (H_L, 1.12), (H_R, 1.12), (SPREAD, 3.5)]),
        _ => NEUTRAL,
    }
}

// ————— ghost-rig.ts:56-66, 77-92: the body and its offsets —————
/// lift in head radii; spin, tilt, flip in radians; squash an offset from 1.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Body {
    pub lift: f64,
    pub spin: f64,
    pub tilt: f64,
    pub flip: f64,
    pub squash: f64,
}

impl Body {
    const fn lift(lift: f64) -> Body {
        Body { lift, spin: 0.0, tilt: 0.0, flip: 0.0, squash: 0.0 }
    }
    fn get(&self, i: usize) -> f64 {
        [self.lift, self.spin, self.tilt, self.flip, self.squash][i]
    }
    fn set(&mut self, i: usize, v: f64) {
        match i {
            0 => self.lift = v,
            1 => self.spin = v,
            2 => self.tilt = v,
            3 => self.flip = v,
            _ => self.squash = v,
        }
    }
}

/// The REST pose: no offset.
pub const REST: Body = Body::lift(0.0);

// ————— ghost-rig.ts:140-176: keyframed tracks —————
/// The vanish's key times (every track shares them), seconds.
const VANISH_T: [f64; 10] = [0.0, 0.305, 0.543, 0.702, 0.935, 1.25, 1.567, 1.883, 2.187, 2.523];
/// Its body tracks (lift, spin, tilt, flip, squash) and presence, ghost-rig.ts:438-535.
const VANISH_BODY: [[f64; 10]; 5] = [
    [0.0, 0.16, 0.227, 0.292, 0.24, 0.048, -0.076, -0.028, 0.022, 0.04],
    [0.0, 0.324, 1.833, 3.284, 5.997, 6.34, 6.341, 6.332, 6.332, 6.33],
    [0.0; 10],
    [0.0; 10],
    [0.0, -0.12, 0.205, 0.018, -0.08, 0.009, 0.0, 0.0, 0.0, 0.0],
];
const VANISH_PRESENCE: [f64; 10] = [0.0, 0.854, 0.928, 0.999, 0.999, 1.0, 1.0, 1.0, 1.0, 1.0];
/// Its face tracks, in CHANNELS order, ghost-rig.ts:537-686.
const VANISH_FACE: [[f64; 10]; 15] = [
    [1.04, 1.04, 1.034, 1.029, 1.005, 1.0, 1.005, 1.034, 1.039, 1.06],
    [1.04, 1.04, 1.034, 1.029, 1.005, 1.0, 1.005, 1.034, 1.039, 1.0],
    [1.12, 1.12, 1.117, 1.114, 1.103, 1.1, 1.103, 1.117, 1.119, 1.06],
    [1.12, 1.12, 1.117, 1.114, 1.103, 1.1, 1.103, 1.117, 1.119, 1.06],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -17.073],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -16.79],
    [0.0; 10],
    [0.0, 0.0, 0.007, 0.014, 0.044, 0.05, 0.043, 0.008, 0.001, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.083],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.177],
    [2.0, 2.0, 1.49, 1.0, -1.052, -1.498, -1.022, 1.472, 1.921, -13.538],
    [-11.0, -11.0, -10.198, -9.428, 3.009, -4.029, -6.251, -0.158, 14.638, 25.0],
    [3.5, 3.5, 2.771, 2.071, -0.86, -1.496, -0.818, 2.745, 3.387, 0.0],
    [1.0, 1.0, 0.864, 0.734, 0.188, 0.071, 0.197, 0.86, 0.979, 1.0],
    [1.0, 1.292, 1.215, 1.14, 1.201, 1.014, 1.0, 1.0, 1.0, 0.87],
];

/// sampleTrack, every key linear: the first value before the first key, the last after the last.
pub fn sample_linear(times: &[f64], values: &[f64], t: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    if values.len() == 1 || t <= times[0] {
        return values[0];
    }
    let last = times.len() - 1;
    if t >= times[last] {
        return values[last];
    }
    let mut i = 0;
    while i < times.len() - 2 && times[i + 1] <= t {
        i += 1;
    }
    let span = times[i + 1] - times[i];
    let u = if span > 1e-9 { (t - times[i]) / span } else { 1.0 };
    values[i] + (values[i + 1] - values[i]) * u
}

// ————— ghost-rig.ts:241-262: the pirouette's knobs (SPIN) —————
const SPIN_TURNS: f64 = 1.0;
const SPIN_TURN_SECS: f64 = 0.62;
const SPIN_WIND_SECS: f64 = 0.18;
const SPIN_WIND_RAD: f64 = 0.4;
const SPIN_JUMP: f64 = 0.45;
const SPIN_FALL_SECS: f64 = 0.22;
const SPIN_CROUCH: f64 = 0.16;
const SPIN_LAND: f64 = 0.18;
const SPIN_SMILE_SECS: f64 = 0.55;
const SPIN_SMILE_SNAP: f64 = 18.0;
/// GESTURE: the panel's amplitude and speed knobs, 1 in the app.
const GESTURE_AMP: f64 = 1.0;
const GESTURE_SPEED: f64 = 1.0;

/// A saccade path across the eye (ghost-rig.ts scanPath): fixations of `hold` joined by flicks.
fn scan_path(s: f64, path: &[(f64, f64)], hold: f64, jump: f64) -> (f64, f64) {
    let step = hold + jump;
    let i = (s / step).floor() as usize;
    let from = path[i % path.len()];
    let to = path[(i + 1) % path.len()];
    let into = (s % step) - hold;
    if into <= 0.0 {
        return from;
    }
    let k = clamp01(into / jump);
    let e = k * k * (3.0 - 2.0 * k);
    (from.0 + (to.0 - from.0) * e, from.1 + (to.1 - from.1) * e)
}

/// One of MOVES (ghost-rig.ts:301-883): a one-shot added on top of the state's rest pose.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Move {
    Scan,
    Pirouette,
    PopIn,
    PawnFlash,
    Vanish,
    Somersault,
    DoubleTake,
    Shiver,
    EyeRoll,
    Nod,
    Recoil,
    Bow,
    Lean,
}

/// A gesture's pupil offsets: x, y in the eye's half-extents, size a multiplier.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pupil {
    pub x: f64,
    pub y: f64,
    pub size: f64,
}

impl Move {
    /// Every move, in MOVES' order.
    pub const ALL: [Move; 13] = [
        Move::Scan,
        Move::Pirouette,
        Move::PopIn,
        Move::PawnFlash,
        Move::Vanish,
        Move::Somersault,
        Move::DoubleTake,
        Move::Shiver,
        Move::EyeRoll,
        Move::Nod,
        Move::Recoil,
        Move::Bow,
        Move::Lean,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Move::Scan => "scan",
            Move::Pirouette => "pirouette",
            Move::PopIn => "popIn",
            Move::PawnFlash => "pawnFlash",
            Move::Vanish => "vanish",
            Move::Somersault => "somersault",
            Move::DoubleTake => "doubleTake",
            Move::Shiver => "shiver",
            Move::EyeRoll => "eyeRoll",
            Move::Nod => "nod",
            Move::Recoil => "recoil",
            Move::Bow => "bow",
            Move::Lean => "lean",
        }
    }

    pub fn named(name: &str) -> Option<Move> {
        Move::ALL.iter().copied().find(|m| m.name() == name)
    }

    pub fn seconds(self) -> f64 {
        match self {
            Move::Scan => 2.4,
            Move::Pirouette => SPIN_WIND_SECS + SPIN_TURN_SECS + SPIN_FALL_SECS + 0.24 + SPIN_SMILE_SECS,
            Move::PopIn => 0.95,
            Move::PawnFlash => 0.8,
            Move::Vanish => 4.0,
            Move::Somersault => 1.15,
            Move::DoubleTake => 0.95,
            Move::Shiver => 1.1,
            Move::EyeRoll => 0.85,
            Move::Nod => 0.62,
            Move::Recoil => 0.9,
            Move::Bow => 0.85,
            Move::Lean => 0.9,
        }
    }

    /// Whether the panel's knobs apply (all but the pirouette and the somersault).
    pub fn scalable(self) -> bool {
        !matches!(self, Move::Pirouette | Move::Somersault)
    }

    /// The offset from the state's rest pose at `s` seconds in (bodyOf).
    pub fn body(self, s: f64) -> Body {
        match self {
            Move::Scan => REST,
            Move::Pirouette => {
                let t1 = SPIN_WIND_SECS;
                let t2 = t1 + SPIN_TURN_SECS;
                let t3 = t2 + SPIN_FALL_SECS;
                let t4 = t3 + 0.24;
                let wind = span(s, 0.0, t1);
                let turn = span(s, t1, t2);
                let fall = span(s, t2, t3);
                let land = span(s, t3, t4);
                let spin = -SPIN_WIND_RAD * ease_out(wind) + (SPIN_TURNS * TAU + SPIN_WIND_RAD) * ease_in_out(turn);
                let lift = -0.1 * ease_out(wind) * (1.0 - turn) + SPIN_JUMP * ease_out(turn) * (1.0 - ease_in(fall));
                let impact = if s < t3 {
                    0.0
                } else if land < 0.2 {
                    ease_out(land / 0.2)
                } else {
                    1.0 - ease_out_back((land - 0.2) / 0.8)
                };
                let squash = -SPIN_CROUCH * ease_out(wind) * (1.0 - turn) + 0.12 * ease_out(turn) * (1.0 - fall) - SPIN_LAND * impact;
                let tilt = 0.07 * (turn * PI).sin();
                Body { lift, spin, tilt, flip: 0.0, squash }
            }
            Move::PopIn => {
                let rise = span(s, 0.0, 0.45);
                let settle = span(s, 0.45, 0.95);
                let lift = 0.3 * ease_out(rise) * (1.0 - ease_out_back(settle));
                let squash = 0.16 * ease_out(rise) * (1.0 - settle) - 0.1 * (1.0 - ease_out_back(settle));
                Body { lift, squash, ..REST }
            }
            Move::PawnFlash => {
                let t = clamp01(s / 0.8);
                let down = if t < 0.28 { ease_out(t / 0.28) } else { 1.0 - ease_in_out(span(t, 0.28, 1.0)) };
                Body { lift: -0.12 * down, squash: -0.1 * down, ..REST }
            }
            Move::Vanish => {
                let mut b = REST;
                for (i, track) in VANISH_BODY.iter().enumerate() {
                    b.set(i, sample_linear(&VANISH_T, track, s));
                }
                b
            }
            Move::Somersault => {
                let t = clamp01(s / 1.15);
                let wind = span(t, 0.0, 0.15);
                let air = span(t, 0.15, 0.68);
                let land = span(t, 0.68, 1.0);
                let flip = TAU * ease_in_out(air);
                let lift = -0.12 * ease_out(wind) * (1.0 - air) + 0.78 * (air * PI).sin();
                let tuck = (air * PI).sin();
                let impact = if air < 1.0 {
                    0.0
                } else if land < 0.2 {
                    ease_out(land / 0.2)
                } else {
                    1.0 - ease_out_back((land - 0.2) / 0.8)
                };
                let squash = -0.18 * ease_out(wind) * (1.0 - air) - 0.22 * tuck - 0.16 * impact;
                Body { lift, spin: 0.0, tilt: 0.0, flip, squash }
            }
            Move::DoubleTake => {
                let jerk = (span(s, 0.08, 0.26) * PI).sin() * (1.0 - span(s, 0.5, 0.9));
                Body { lift: 0.04 * jerk, spin: -0.05 * jerk, tilt: -0.03 * jerk, flip: 0.0, squash: 0.03 * jerk }
            }
            Move::Shiver => {
                let t = clamp01(s / 1.1);
                let damp = (1.0 - t).powf(1.2) * (t / 0.08).min(1.0);
                Body {
                    lift: 0.012 * (s * PI * 2.0 * 11.0).sin() * damp,
                    spin: 0.035 * (s * PI * 2.0 * 11.0 + 1.1).sin() * damp,
                    tilt: 0.02 * (s * PI * 2.0 * 9.0).sin() * damp,
                    flip: 0.0,
                    squash: 0.03 * (s * PI * 2.0 * 11.0 + PI / 2.0).sin() * damp,
                }
            }
            Move::EyeRoll => {
                let w = (clamp01(s / 0.85) * PI).sin();
                Body { tilt: 0.03 * w, squash: -0.02 * w, ..REST }
            }
            Move::Nod => {
                let k = (clamp01(s / 0.62) * PI).sin().powf(0.8);
                Body { lift: -0.16 * k, tilt: 0.05 * k, squash: -0.07 * k, ..REST }
            }
            Move::Recoil => {
                let t = clamp01(s / 0.9);
                let flinch = (clamp01(s / 0.16) * PI * 0.5).sin();
                let settle = 1.0 - ease_out(span(t, 0.18, 1.0));
                Body {
                    lift: 0.12 * flinch * settle,
                    spin: 0.2 * (t * PI * 4.0).sin() * (1.0 - t).powf(1.5),
                    tilt: -0.05 * flinch * settle,
                    flip: 0.0,
                    squash: 0.07 * flinch * settle,
                }
            }
            Move::Bow => {
                let k = (clamp01(s / 0.85) * PI).sin().powf(0.9);
                Body { lift: -0.12 * k, tilt: 0.06 * k, squash: -0.05 * k, ..REST }
            }
            Move::Lean => {
                let k = (clamp01(s / 0.9) * PI).sin().powf(1.4);
                Body { lift: -0.05 * k, tilt: 0.04 * k, squash: -0.03 * k, ..REST }
            }
        }
    }

    /// The expression the move takes over with at `s`; None eases back to the state's own.
    pub fn face(self, s: f64) -> Option<Face> {
        match self {
            Move::Pirouette => {
                let down = SPIN_WIND_SECS + SPIN_TURN_SECS + SPIN_FALL_SECS;
                (SPIN_SMILE_SECS > 0.0 && s > down && s < down + SPIN_SMILE_SECS).then_some(SMILE)
            }
            Move::PawnFlash => (s < 0.5).then(|| face_by_name("surprised")),
            Move::Vanish => {
                let mut f = NEUTRAL;
                for (i, track) in VANISH_FACE.iter().enumerate() {
                    f[i] = sample_linear(&VANISH_T, track, s);
                }
                Some(f)
            }
            Move::Somersault => (s > 0.9).then_some(SMILE),
            Move::DoubleTake => (s > 0.1 && s < 0.62).then(|| face_by_name("wide")),
            Move::Shiver => (s < 0.8).then(|| face_by_name("pleading")),
            Move::EyeRoll => (s < 0.7).then(|| face_by_name("sly")),
            Move::Nod => (s > 0.12 && s < 0.46).then_some(SMILE),
            Move::Recoil => {
                if s < 0.24 {
                    Some(face_by_name("surprised"))
                } else if s < 0.66 {
                    Some(face_by_name("sad"))
                } else {
                    None
                }
            }
            Move::Bow => (s > 0.16 && s < 0.62).then_some(SMILE),
            Move::Scan | Move::PopIn | Move::Lean => None,
        }
    }

    /// How fast that expression arrives.
    pub fn face_lambda(self) -> f64 {
        match self {
            Move::Pirouette => SPIN_SMILE_SNAP,
            Move::PawnFlash | Move::Somersault => 16.0,
            // fromKeys: followed, not eased.
            Move::Vanish => 30.0,
            Move::DoubleTake => 20.0,
            Move::Shiver => 10.0,
            Move::EyeRoll => 12.0,
            Move::Nod | Move::Bow => 14.0,
            Move::Recoil => 13.0,
            Move::Scan | Move::PopIn | Move::Lean => FACE_LAMBDA,
        }
    }

    /// Whether the move insists on holding the camera's eye.
    pub fn holds_gaze(self, s: f64) -> bool {
        match self {
            Move::Pirouette => s > SPIN_WIND_SECS + SPIN_TURN_SECS,
            Move::Somersault => s > 0.85,
            _ => false,
        }
    }

    /// How far the body morphs back toward the pawn, 0 ghost to 1 pawn.
    pub fn to_pawn(self, s: f64) -> f64 {
        match self {
            Move::PawnFlash => {
                let t = clamp01(s / 0.8);
                if t < 0.28 {
                    ease_out(t / 0.28) * 0.85
                } else {
                    0.85 * (1.0 - ease_in_out(span(t, 0.28, 1.0)))
                }
            }
            _ => 0.0,
        }
    }

    /// Multiplies the state's presence (the vanish's `presence` track).
    pub fn fade(self, s: f64) -> f64 {
        match self {
            Move::Vanish => sample_linear(&VANISH_T, &VANISH_PRESENCE, s),
            _ => 1.0,
        }
    }

    /// Extra gaze, radians (yaw, pitch), on top of wherever it is looking.
    pub fn glance(self, s: f64) -> (f64, f64) {
        match self {
            Move::DoubleTake => {
                let up = span(s, 0.06, 0.16);
                let hold = 1.0 - span(s, 0.52, 0.8);
                (0.0, -0.34 * ease_out(up) * hold)
            }
            Move::EyeRoll => {
                let t = clamp01(s / 0.85);
                let w = (t * PI).sin();
                (0.2 * (t * TAU).sin() * w, -0.16 * (1.0 - (t * TAU).cos()) * 0.5 * w - 0.06 * w)
            }
            _ => (0.0, 0.0),
        }
    }

    /// Pupil offsets added to the expression's.
    pub fn pupil(self, s: f64) -> Option<Pupil> {
        match self {
            Move::Scan => {
                let (x, y) = scan_path(s, &[(0.0, 0.0), (-0.3, 0.16), (0.26, 0.1), (0.12, -0.2), (-0.22, -0.16)], 0.34, 0.05);
                let w = (clamp01(s / 2.4) * PI).sin().powf(0.5);
                Some(Pupil { x: x * w, y: y * w, size: 1.0 - 0.14 * w })
            }
            Move::PawnFlash => {
                let t = clamp01(s / 0.8);
                let shock = if t < 0.3 { ease_out(t / 0.3) } else { 1.0 - ease_in_out(span(t, 0.3, 0.9)) };
                Some(Pupil { x: 0.0, y: -0.06 * shock, size: 1.0 - 0.52 * shock })
            }
            Move::DoubleTake => {
                let w = (clamp01(span(s, 0.06, 0.8)) * PI).sin().powf(0.7);
                Some(Pupil { x: 0.0, y: 0.08 * w, size: 1.0 + 0.34 * w })
            }
            Move::Shiver => {
                let t = clamp01(s / 1.1);
                let damp = (1.0 - t).powf(1.2) * (t / 0.08).min(1.0);
                Some(Pupil { size: 1.0 + 0.3 * damp, x: 0.02 * (s * PI * 2.0 * 9.0).sin() * damp, y: 0.02 * (s * PI * 2.0 * 7.0 + 0.8).sin() * damp })
            }
            Move::Nod => {
                let k = (clamp01(s / 0.62) * PI).sin().powf(0.8);
                Some(Pupil { x: 0.0, y: -0.1 * k, size: 1.0 + 0.16 * k })
            }
            _ => None,
        }
    }
}

// ————— ghost-rig.ts:889-1159: the states —————
/// Where a state looks.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Gaze {
    You,
    Board,
    Wander,
}

/// A StateSpec.
#[derive(Clone, Copy, Debug)]
pub struct State {
    pub key: &'static str,
    pub face: &'static str,
    pub presence: f64,
    pub idle_speed: f64,
    pub rest: Body,
    pub rest_lambda: Option<f64>,
    pub bob_hz: f64,
    pub bob_amp: f64,
    pub sway_hz: f64,
    pub sway_amp: f64,
    pub blink_every: f64,
    pub gaze: Gaze,
    pub entry: Option<Move>,
    pub repeat_every: f64,
}

const fn st(
    key: &'static str,
    face: &'static str,
    presence: f64,
    idle_speed: f64,
    rest: Body,
    bob: (f64, f64),
    sway: (f64, f64),
    blink_every: f64,
    gaze: Gaze,
    entry: Option<Move>,
    repeat_every: f64,
) -> State {
    State {
        key,
        face,
        presence,
        idle_speed,
        rest,
        rest_lambda: None,
        bob_hz: bob.0,
        bob_amp: bob.1,
        sway_hz: sway.0,
        sway_amp: sway.1,
        blink_every,
        gaze,
        entry,
        repeat_every,
    }
}

/// STATES, in RN's order.
pub const STATES: [State; 11] = [
    st("alive", "alert", 1.0, 1.0, Body::lift(0.1), (0.28, 0.03), (0.13, 0.035), 4.5, Gaze::You, Some(Move::Pirouette), 11.0),
    st("pending", "attentive", 1.0, 1.1, Body { tilt: 0.02, ..REST }, (0.36, 0.022), (0.2, 0.02), 3.0, Gaze::You, None, 0.0),
    st("risk", "pleading", 1.0, 1.45, Body::lift(-0.04), (0.8, 0.014), (0.55, 0.01), 2.0, Gaze::You, Some(Move::Shiver), 4.2),
    State {
        rest_lambda: Some(0.9),
        ..st(
            "broken",
            "sad",
            0.14,
            0.35,
            Body { lift: -0.46, spin: -0.22, tilt: 0.17, flip: 0.0, squash: -0.05 },
            (0.11, 0.05),
            (0.07, 0.04),
            9.0,
            Gaze::Wander,
            None,
            0.0,
        )
    },
    st("returned", "found", 1.0, 1.15, Body::lift(0.14), (0.5, 0.04), (0.16, 0.03), 3.5, Gaze::You, Some(Move::Vanish), 0.0),
    st("record", "wide", 1.0, 1.3, Body::lift(0.22), (0.9, 0.05), (0.0, 0.0), 6.0, Gaze::You, Some(Move::Somersault), 3.4),
    st("thinking", "down_gaze", 1.0, 0.9, Body::lift(0.02), (0.24, 0.02), (0.11, 0.025), 4.0, Gaze::Board, Some(Move::Scan), 3.4),
    st("correct", "alert", 1.0, 1.15, Body::lift(0.06), (0.4, 0.03), (0.14, 0.02), 3.5, Gaze::You, Some(Move::Nod), 0.0),
    st("incorrect", "attentive", 1.0, 1.0, REST, (0.42, 0.022), (0.18, 0.018), 2.5, Gaze::You, Some(Move::PawnFlash), 0.0),
    st("solved", "alert", 1.0, 1.2, Body::lift(0.14), (0.6, 0.04), (0.12, 0.02), 4.0, Gaze::You, Some(Move::Pirouette), 0.0),
    st("solvedQuiet", "alert", 1.0, 1.05, Body::lift(0.04), (0.34, 0.03), (0.13, 0.02), 3.8, Gaze::You, Some(Move::Bow), 0.0),
];

/// The state named `key`, or STATES[0] (createRig's fallback).
pub fn state(key: &str) -> &'static State {
    STATES.iter().find(|s| s.key == key).unwrap_or(&STATES[0])
}

/// A uniform 0..1 draw (Math.random's stand-in): xorshift32, seeded so a test can replay it.
#[derive(Clone, Copy, Debug)]
pub struct Random(u32);

impl Random {
    pub fn new(seed: u32) -> Random {
        Random(seed.max(1))
    }
    pub fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 >> 8) as f64 / (1u32 << 24) as f64
    }
}

/// eye-rig.ts apxAt (Blender's APX curve on the aperture).
fn apx_at(k: f64) -> f64 {
    crate::scene::apx_at(k as f32) as f64
}

// ————— ghost-rig.ts:1210-1240: one frame —————
/// What one frame asks the renderer to draw (RigFrame).
#[derive(Clone, Copy, Debug)]
pub struct RigFrame {
    pub lift: f64,
    pub spin: f64,
    pub tilt: f64,
    pub flip: f64,
    /// Vertical scale, floored at 0.4; the horizontal follows to keep volume.
    pub squash: f64,
    pub presence: f64,
    /// Position in Blender's clip, frames, the morph toward the pawn applied.
    pub frame: f64,
    pub face: Face,
    /// Where the eyes point, radians, aim included.
    pub aim_yaw: f64,
    pub aim_pitch: f64,
    pub moving: Option<Move>,
}

// ————— ghost-rig.ts:1275-1553: createRig —————
/// The rig: the per-frame state, steppable at a fixed rate for tests.
pub struct Rig {
    spec: &'static State,
    target: Face,
    shown: Face,
    presence: f64,
    pose: Body,
    idle_speed: f64,
    rest_lambda_now: f64,
    idle_t: f64,
    clock: f64,
    residual: Body,
    residual_vel: Body,
    last_raw: Body,
    drawn_to_pawn: f64,
    drawn_fade: f64,
    drawn_glance: (f64, f64),
    drawn_pupil: Pupil,
    moving: Option<Move>,
    move_t: f64,
    play_id: u32,
    last_play_id: u32,
    repeat_in: f64,
    prev_spin: f64,
    spin_vel_now: f64,
    blink_clock: f64,
    blink_phase: f64,
    blink_due: f64,
    gaze_yaw_now: f64,
    gaze_pitch_now: f64,
    /// Off for a deterministic run (RigOptions.blink).
    pub blink: bool,
    random: Random,
}

impl Rig {
    /// createRig(startState).
    pub fn new(start: &str, seed: u32) -> Rig {
        let spec = state(start);
        let target = face_by_name(spec.face);
        let mut rig = Rig {
            spec,
            target,
            shown: target,
            presence: spec.presence,
            pose: spec.rest,
            idle_speed: spec.idle_speed,
            rest_lambda_now: spec.rest_lambda.unwrap_or(BODY_LAMBDA),
            idle_t: 0.0,
            clock: 0.0,
            residual: REST,
            residual_vel: REST,
            last_raw: REST,
            drawn_to_pawn: 0.0,
            drawn_fade: 1.0,
            drawn_glance: (0.0, 0.0),
            drawn_pupil: Pupil { x: 0.0, y: 0.0, size: 1.0 },
            moving: None,
            move_t: 0.0,
            play_id: 0,
            // createRig's lastPlayId -1: never equal to a play id.
            last_play_id: u32::MAX,
            repeat_in: 0.0,
            prev_spin: 0.0,
            spin_vel_now: 0.0,
            blink_clock: 0.0,
            blink_phase: -1.0,
            blink_due: 0.0,
            gaze_yaw_now: 0.0,
            gaze_pitch_now: 0.0,
            blink: true,
            random: Random::new(seed),
        };
        rig.enter(spec.key);
        rig
    }

    pub fn state(&self) -> &'static State {
        self.spec
    }

    pub fn moving(&self) -> Option<Move> {
        self.moving
    }

    fn schedule_blink(&mut self) {
        self.blink_clock = 0.0;
        self.blink_due = self.spec.blink_every * (0.7 + self.random.next() * 0.6);
    }

    /// playMove: None clears the running move; the residual absorbs its contribution.
    pub fn play(&mut self, m: Option<Move>) {
        self.moving = m;
        self.move_t = 0.0;
        self.play_id = self.play_id.wrapping_add(1);
    }

    /// enter(key): a state change is a transition, its entry move played.
    pub fn enter(&mut self, key: &str) {
        self.spec = state(key);
        self.target = face_by_name(self.spec.face);
        self.play(self.spec.entry);
        self.repeat_in = self.spec.repeat_every;
        self.schedule_blink();
    }

    /// One frame of `dt` seconds (update, with the pointer at rest and the idle looping).
    pub fn update(&mut self, dt: f64) -> RigFrame {
        let spec = self.spec;
        self.clock += dt;

        // The state's own pose.
        self.rest_lambda_now = approach(self.rest_lambda_now, spec.rest_lambda.unwrap_or(BODY_LAMBDA), 4.0, dt);
        let rest_lambda = self.rest_lambda_now;
        self.presence = approach(self.presence, spec.presence, rest_lambda, dt);
        for i in 0..5 {
            self.pose.set(i, approach(self.pose.get(i), spec.rest.get(i), rest_lambda, dt));
        }
        self.idle_speed = approach(self.idle_speed, spec.idle_speed, BODY_LAMBDA, dt);
        self.idle_t += dt * self.idle_speed;

        // The gesture.
        let mut overriding: Option<Face> = None;
        let mut override_lambda = FACE_LAMBDA;
        let mut insists_on_gaze = false;
        let mut raw = REST;
        let mut to_pawn = 0.0;
        let mut fade = 1.0;
        let mut glance = (0.0, 0.0);
        let mut pupil = Pupil { x: 0.0, y: 0.0, size: 1.0 };
        if let Some(m) = self.moving {
            self.move_t += dt * if m.scalable() { GESTURE_SPEED } else { 1.0 };
            if self.move_t >= m.seconds() {
                self.moving = None;
                self.move_t = 0.0;
                self.play_id = self.play_id.wrapping_add(1);
            } else {
                let s = self.move_t;
                let amp = if m.scalable() { GESTURE_AMP } else { 1.0 };
                let base = m.body(s);
                raw = Body { lift: base.lift * amp, spin: base.spin * amp, tilt: base.tilt * amp, flip: base.flip * amp, squash: base.squash * amp };
                overriding = m.face(s);
                override_lambda = m.face_lambda();
                insists_on_gaze = m.holds_gaze(s);
                to_pawn = clamp01(m.to_pawn(s) * amp);
                fade = m.fade(s);
                glance = m.glance(s);
                if let Some(p) = m.pupil(s) {
                    pupil = Pupil { x: p.x * amp, y: p.y * amp, size: 1.0 + (p.size - 1.0) * amp };
                }
            }
        } else if spec.repeat_every > 0.0 {
            self.repeat_in -= dt;
            if self.repeat_in <= 0.0 {
                self.play(spec.entry);
                self.repeat_in = spec.repeat_every;
            }
        }

        // The residual: a move's offset at a seam drains as a critically damped spring.
        if self.play_id != self.last_play_id {
            let settle = |was: f64, now: f64, wrap: bool| {
                let d = if wrap { wrap_pi(was - now) } else { was - now };
                if d.is_finite() {
                    d
                } else {
                    0.0
                }
            };
            for i in 0..5 {
                let wrap = i == 1 || i == 3;
                let r = self.residual.get(i) + settle(self.last_raw.get(i), raw.get(i), wrap);
                self.residual.set(i, r);
            }
            // Adopted, not eased into, on the frame a move starts.
            self.drawn_fade = fade.max(0.0);
            self.drawn_to_pawn = clamp01(to_pawn);
            self.last_play_id = self.play_id;
        }
        self.last_raw = raw;
        for i in 0..5 {
            let x = self.residual.get(i);
            let v = self.residual_vel.get(i);
            let a = -2.0 * RESIDUAL_W * v - RESIDUAL_W * RESIDUAL_W * x;
            let v = safe0(v + a * dt);
            self.residual_vel.set(i, v);
            self.residual.set(i, safe0(x + v * dt));
        }

        self.drawn_to_pawn = safe0(approach(self.drawn_to_pawn, clamp01(to_pawn), AUX_LAMBDA, dt));
        self.drawn_fade = safe0(approach(self.drawn_fade, fade.max(0.0), AUX_LAMBDA, dt));
        self.drawn_glance.0 = safe0(approach(self.drawn_glance.0, glance.0, AUX_LAMBDA, dt));
        self.drawn_glance.1 = safe0(approach(self.drawn_glance.1, glance.1, AUX_LAMBDA, dt));
        self.drawn_pupil.x = safe0(approach(self.drawn_pupil.x, pupil.x, AUX_LAMBDA, dt));
        self.drawn_pupil.y = safe0(approach(self.drawn_pupil.y, pupil.y, AUX_LAMBDA, dt));
        self.drawn_pupil.size = safe0(approach(self.drawn_pupil.size, pupil.size, AUX_LAMBDA, dt));

        let mut extra = REST;
        for i in 0..5 {
            extra.set(i, safe0(raw.get(i) + self.residual.get(i)));
        }

        let bob = (self.clock * spec.bob_hz * TAU).sin() * spec.bob_amp;
        let sway = (self.clock * spec.sway_hz * TAU).sin() * spec.sway_amp;

        // The blink.
        let mut open_scale = 1.0;
        if self.blink && spec.blink_every > 0.0 {
            if overriding.is_none() {
                self.blink_clock += dt;
            }
            if self.blink_phase < 0.0 && self.blink_clock > self.blink_due && overriding.is_none() {
                self.blink_phase = 0.0;
                self.schedule_blink();
            }
            if self.blink_phase >= 0.0 {
                self.blink_phase += dt;
                if self.blink_phase < BLINK_DOWN {
                    open_scale = apx_at(1.0 - self.blink_phase / BLINK_DOWN);
                } else if self.blink_phase < BLINK_DOWN + BLINK_UP {
                    open_scale = apx_at((self.blink_phase - BLINK_DOWN) / BLINK_UP);
                } else {
                    self.blink_phase = -1.0;
                    open_scale = 1.0;
                    self.schedule_blink();
                }
            }
        }

        // The face.
        let aim = overriding.unwrap_or(self.target);
        let lambda = if overriding.is_some() { override_lambda } else { FACE_LAMBDA };
        for i in 0..15 {
            self.shown[i] = approach(self.shown[i], aim[i], lambda, dt);
        }
        let mut face = self.shown;
        face[OPEN] = (self.shown[OPEN] * open_scale).max(0.04);
        face[GLINT_X] = self.shown[GLINT_X] + self.drawn_pupil.x;
        face[GLINT_Y] = self.shown[GLINT_Y] + self.drawn_pupil.y;
        face[PUPIL] = (self.shown[PUPIL] * self.drawn_pupil.size.max(0.05)).max(0.25);

        // The gaze: with no pointer, 'you' is the camera.
        let mode = if insists_on_gaze { Gaze::You } else { spec.gaze };
        let (yaw_wanted, pitch_wanted) = match mode {
            Gaze::You => (0.0, 0.0),
            Gaze::Board => (0.0, 0.34),
            Gaze::Wander => (-0.12 + sway * 0.4, 0.22),
        };
        self.gaze_yaw_now = approach(self.gaze_yaw_now, yaw_wanted + self.drawn_glance.0, GAZE_LAMBDA, dt);
        self.gaze_pitch_now = approach(self.gaze_pitch_now, pitch_wanted + self.drawn_glance.1, GAZE_LAMBDA, dt);

        // The turn drags the eyes a little behind it.
        let spin_vel_raw = wrap_pi(extra.spin - self.prev_spin) / dt.max(1e-4);
        self.prev_spin = extra.spin;
        self.spin_vel_now = approach(self.spin_vel_now, spin_vel_raw, 12.0, dt);
        let lag = (self.spin_vel_now * 0.022).clamp(-0.28, 0.28);

        // The clip.
        let scrub = GHOST_FRAME + (self.idle_t * FPS) % (IDLE_TO - GHOST_FRAME);

        RigFrame {
            lift: self.pose.lift + extra.lift + bob,
            spin: sway + self.pose.spin + extra.spin,
            tilt: self.pose.tilt + extra.tilt,
            flip: extra.flip,
            squash: (1.0 + self.pose.squash + extra.squash).max(0.4),
            presence: self.presence * self.drawn_fade,
            frame: scrub + (PAWN_FRAME - scrub) * self.drawn_to_pawn,
            face,
            aim_yaw: face[YAW] * DEG + self.gaze_yaw_now - lag,
            aim_pitch: REST_PITCH + face[PITCH] * DEG + self.gaze_pitch_now,
            moving: self.moving,
        }
    }
}

// ————— hero-scene-core.ts:313-480: the performer around the rig —————
/// What a tick asks of the canvas.
#[derive(Clone, Copy, Debug)]
pub enum Tick {
    /// Draw this pose.
    Draw(RigFrame),
    /// Held, and already drawn: nothing to draw, no frame to ask for.
    Held,
}

/// The rig with Home's scheduler: a random ambient gesture every 2.6–5.4 s (never the same
/// twice running), the first after the entry move, and under Reduce Motion the entry run to
/// rest before the first frame and the pose held (no bob, no ambient).
pub struct Performer {
    pub rig: Rig,
    ambient: Vec<Move>,
    until_ambient: f64,
    last_ambient: Option<Move>,
    hold_after: f64,
    played_secs: f64,
    held: bool,
    /// Whether the last pose drawn went to a canvas on screen.
    drawn_held: bool,
    entrance_secs: f64,
    entry_secs: f64,
    /// Set once the first state's entrance has played (onEntrancePlayed).
    pub entrance_played: bool,
    pool: Vec<Move>,
}

impl Performer {
    pub fn new(state: &str, ambient: &[Move], reduced: bool, seed: u32) -> Performer {
        let rig = Rig::new(state, seed);
        let entry_secs = rig.state().entry.map_or(0.0, |m| m.seconds());
        let mut p = Performer {
            rig,
            ambient: ambient.to_vec(),
            until_ambient: AMBIENT_MAX_S.max(entry_secs + AMBIENT_MIN_S),
            last_ambient: None,
            hold_after: entry_secs + HOLD_MARGIN_S,
            played_secs: 0.0,
            held: false,
            drawn_held: false,
            entrance_secs: 0.0,
            entry_secs,
            entrance_played: false,
            pool: Vec::with_capacity(ambient.len()),
        };
        if reduced {
            p.run_to_rest();
        }
        p
    }

    fn roll_ambient(&mut self) -> f64 {
        AMBIENT_MIN_S + self.rig.random.next() * (AMBIENT_MAX_S - AMBIENT_MIN_S)
    }

    /// runToRest: the entry move played through before a frame is drawn.
    fn run_to_rest(&mut self) {
        let seconds = self.rig.state().entry.map_or(0.0, |m| m.seconds()) + HOLD_MARGIN_S;
        let mut t = 0.0;
        while t < seconds {
            self.rig.update(0.05);
            t += 0.05;
        }
        self.played_secs = self.hold_after;
    }

    /// Whether the pose is held and drawn: a still canvas asks for no frames.
    pub fn resting(&self) -> bool {
        self.held && self.drawn_held
    }

    /// Plays `m` now, as an ambient gesture would (a story's forced gesture).
    pub fn play(&mut self, m: Move) {
        self.rig.play(Some(m));
        self.held = false;
        self.drawn_held = false;
        self.played_secs = 0.0;
        self.hold_after = m.seconds() + HOLD_MARGIN_S;
        self.until_ambient = self.roll_ambient();
    }

    /// One tick of `dt` seconds on a visible canvas.
    pub fn tick(&mut self, dt: f64, reduced: bool) -> Tick {
        let dt = dt.clamp(0.0, MAX_DT);
        // A Reduce Motion switched off lets the ghost play again.
        if self.held && !reduced {
            self.held = false;
            self.drawn_held = false;
        }
        if self.held && self.drawn_held {
            return Tick::Held;
        }
        let still = reduced;
        if !still && !self.ambient.is_empty() {
            self.until_ambient -= dt;
            if self.until_ambient <= 0.0 {
                // Never the same one twice running.
                self.pool.clear();
                let last = self.last_ambient;
                if self.ambient.len() > 1 {
                    self.pool.extend(self.ambient.iter().copied().filter(|m| Some(*m) != last));
                } else {
                    self.pool.extend(self.ambient.iter().copied());
                }
                let pick = self.pool[((self.rig.random.next() * self.pool.len() as f64) as usize).min(self.pool.len() - 1)];
                self.last_ambient = Some(pick);
                self.rig.play(Some(pick));
                self.until_ambient = self.roll_ambient();
            }
        }
        let f = self.rig.update(dt);
        if !self.entrance_played {
            self.entrance_secs += dt;
            if reduced || self.entrance_secs >= self.entry_secs + HOLD_MARGIN_S {
                self.entrance_played = true;
            }
        }
        if still && !self.held {
            self.played_secs += dt;
            self.held = self.played_secs >= self.hold_after;
        }
        // This frame is drawn: once held, the next tick has nothing to add.
        self.drawn_held = self.held;
        Tick::Draw(f)
    }

    /// The canvas went off screen: the pose drawn there may be gone with its surface.
    pub fn hidden(&mut self) {
        self.drawn_held = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DT: f64 = 1.0 / 60.0;

    #[test]
    fn the_curves_start_and_end_where_rn_says() {
        for e in [ease_out, ease_in, ease_in_out, ease_out_back] {
            assert!(e(0.0).abs() < 1e-12 && (e(1.0) - 1.0).abs() < 1e-12);
        }
        // easeOutBack overshoots past 1 and comes back.
        assert!((0..100).map(|i| ease_out_back(i as f64 / 100.0)).fold(0.0, f64::max) > 1.05);
        assert!((wrap_pi(TAU + 0.1) - 0.1).abs() < 1e-12);
        assert!((approach(0.0, 1.0, 6.0, 1.0) - (1.0 - (-6.0f64).exp())).abs() < 1e-12);
    }

    #[test]
    fn the_vanish_samples_its_keys_and_holds_the_last() {
        let m = Move::Vanish;
        assert_eq!(m.fade(0.0), 0.0);
        assert!((m.fade(0.305) - 0.854).abs() < 1e-12);
        assert!((m.body(0.4).spin - (0.324 + (1.833 - 0.324) * (0.4 - 0.305) / (0.543 - 0.305))).abs() < 1e-12);
        let end = m.face(3.5).unwrap();
        assert_eq!(end[YAW], -13.538);
        assert_eq!(end[PITCH], 25.0);
        assert!((m.body(4.0).spin - 6.33).abs() < 1e-12, "lands a hair past a full turn");
    }

    #[test]
    fn every_move_but_the_vanish_starts_and_ends_at_rest() {
        for m in Move::ALL {
            // The vanish lands a turn on; popIn starts squashed (-0.1), as RN's does.
            if m == Move::Vanish || m == Move::PopIn {
                continue;
            }
            for s in [0.0, m.seconds()] {
                let b = m.body(s);
                let wrapped = Body { spin: wrap_pi(b.spin), flip: wrap_pi(b.flip), ..b };
                for i in 0..5 {
                    assert!(wrapped.get(i).abs() < 1e-6, "{} at {s}: channel {i} = {}", m.name(), wrapped.get(i));
                }
            }
        }
    }

    #[test]
    fn home_s_returned_state_is_rn_s() {
        let s = state("returned");
        assert_eq!(s.face, "found");
        assert_eq!((s.idle_speed, s.rest.lift, s.bob_hz, s.bob_amp, s.sway_hz, s.sway_amp, s.blink_every), (1.15, 0.14, 0.5, 0.04, 0.16, 0.03, 3.5));
        assert_eq!(s.entry, Some(Move::Vanish));
        for (name, secs) in [("scan", 2.4), ("nod", 0.62), ("lean", 0.9), ("eyeRoll", 0.85), ("doubleTake", 0.95), ("vanish", 4.0)] {
            assert_eq!(Move::named(name).unwrap().seconds(), secs);
        }
        assert!((Move::Pirouette.seconds() - 1.81).abs() < 1e-12);
    }

    #[test]
    fn the_entry_fades_in_from_nothing_and_the_move_ends_on_time() {
        let mut rig = Rig::new("returned", 7);
        rig.blink = false;
        let first = rig.update(DT);
        assert!(first.presence < 0.06, "adopted, not eased: {}", first.presence);
        let mut t = DT;
        while rig.moving().is_some() {
            rig.update(DT);
            t += DT;
        }
        assert!((t - 4.0).abs() < 2.0 * DT, "vanish ran {t}s");
        let f = rig.update(DT);
        assert!((f.presence - 1.0).abs() < 1e-3);
    }

    #[test]
    fn a_seam_is_continuous_the_residual_drains_it() {
        // Cut a nod off at its deepest: the next frame may not jump.
        let mut rig = Rig::new("pending", 3);
        rig.blink = false;
        for _ in 0..120 {
            rig.update(DT);
        }
        rig.play(Some(Move::Nod));
        let mut last = rig.update(DT).lift;
        for _ in 0..18 {
            last = rig.update(DT).lift;
        }
        rig.play(None);
        let next = rig.update(DT).lift;
        assert!((next - last).abs() < 0.01, "jumped {last} -> {next}");
        for _ in 0..60 {
            rig.update(DT);
        }
        assert!(rig.residual.lift.abs() < 1e-3);
    }

    #[test]
    fn the_spin_lag_wraps_a_finished_turn() {
        let mut rig = Rig::new("returned", 1);
        rig.blink = false;
        let mut worst: f64 = 0.0;
        let mut prev = rig.update(DT).aim_yaw;
        for _ in 0..400 {
            let f = rig.update(DT);
            worst = worst.max((f.aim_yaw - prev).abs());
            prev = f.aim_yaw;
        }
        assert!(worst < 0.1, "the eyes swung {worst} rad in a frame");
    }

    #[test]
    fn blinks_come_every_few_seconds_and_never_over_a_gesture_face() {
        let mut rig = Rig::new("pending", 11);
        let mut blinks = 0;
        let mut was_low = false;
        for _ in 0..(60 * 30) {
            let low = rig.update(DT).face[OPEN] < 0.5;
            if low && !was_low {
                blinks += 1;
            }
            was_low = low;
        }
        // blinkEvery 3 × 0.7..1.3, plus the blink itself: 7 to 14 in 30 s.
        assert!((7..=14).contains(&blinks), "{blinks} blinks");
    }

    #[test]
    fn the_ambient_gestures_wait_out_the_entry_then_never_repeat() {
        let mut p = Performer::new("returned", &HOME_AMBIENT.map(|n| Move::named(n).unwrap()), false, 42);
        let mut t = 0.0;
        let mut starts: Vec<(f64, Move)> = Vec::new();
        let mut was: Option<Move> = Some(Move::Vanish);
        while t < 120.0 {
            let Tick::Draw(f) = p.tick(DT, false) else { panic!("never held while playing") };
            t += DT;
            if f.moving != was {
                if let Some(m) = f.moving {
                    starts.push((t, m));
                }
                was = f.moving;
            }
        }
        assert!(starts[0].0 >= 6.6 - 2.0 * DT, "first gesture at {}", starts[0].0);
        for w in starts.windows(2) {
            assert_ne!(w[0].1, w[1].1, "the same gesture twice running");
            let gap = w[1].0 - w[0].0;
            assert!((AMBIENT_MIN_S - 2.0 * DT..=AMBIENT_MAX_S + 2.0 * DT).contains(&gap), "gap {gap}");
        }
        assert!(starts.len() > 20);
        assert!(p.entrance_played);
    }

    #[test]
    fn reduce_motion_draws_the_rested_pose_once_then_asks_for_nothing() {
        let mut p = Performer::new("returned", &HOME_AMBIENT.map(|n| Move::named(n).unwrap()), true, 5);
        let mut draws = 0;
        let mut frames = Vec::new();
        for _ in 0..600 {
            match p.tick(DT, true) {
                Tick::Draw(f) => {
                    draws += 1;
                    frames.push(f);
                }
                Tick::Held => {}
            }
        }
        // The entry ran before the first frame; the margin's frames, then nothing.
        assert!(draws <= (HOLD_MARGIN_S / DT).ceil() as usize + 2, "{draws} draws");
        assert!(p.resting());
        assert!(frames[0].moving.is_none(), "the entry played before the first frame");
        assert!((frames[0].presence - 1.0).abs() < 1e-3);
        // Shown again after a hide: one frame, then held.
        p.hidden();
        assert!(matches!(p.tick(DT, true), Tick::Draw(_)));
        assert!(matches!(p.tick(DT, true), Tick::Held));
        // Reduce Motion off: it plays again.
        assert!(matches!(p.tick(DT, false), Tick::Draw(_)));
        assert!(!p.resting());
    }
}
