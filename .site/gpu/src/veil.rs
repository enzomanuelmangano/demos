//! The eyes on a ghost-site veil, solved on the CPU once a frame: the uniforms the RN app's
//! setters write (onboarding/ghost-materials.ts `makeVeilMaterial`: setAim, setGazeOff, setFace),
//! with the lid model of eye-rig.ts `rigFor` at this ghost's eye (BL.eyeRad 0.23) and the faces
//! of faces.ts. shaders/figure.wgsl draws them.

use glam::{Quat, Vec3};

use crate::scene::apx_at;

// ————— eye-rig.ts —————
const AT_RAD: f32 = 0.269;
const EYE_SQ: f32 = 1.167;
/// The catchlight's squash (GLINT_SQ).
pub const PUPIL_SQ: f32 = 1.155;
const GLINT_RAD_R: f32 = 0.08608 / AT_RAD;
const GLINT_SEAT_U: f32 = -0.26;
const SHUT_RISE_U: f32 = 0.08;
const COVER_AT: f32 = 0.1248;
const COVER_CLEARANCE_U: f32 = 0.02;
const LID_OVERSHOOT_U: f32 = 0.08;
const CORNER_R: f32 = 0.15;
const CAP_SHUT: f32 = 0.88;
const CAP_OPEN: f32 = 1.02;
const CAP_POW: i32 = 10;
const SQUINT_RISE_U: f32 = 0.23;
const SQUINT_POW: f32 = 1.5;
const SQUINT_MIN_U: f32 = 0.2;
const GAZE_FULL_RAD: f32 = 0.3;

// ————— ghost-materials.ts BL, in Blender's axes —————
/// The eye's angular radius on this head.
pub const EYE_RAD: f32 = 0.23;
/// The eye's edge, an absolute width.
pub const EYE_SOFT: f32 = 0.004;
/// The catchlight's tone (BL.pupTone), linear.
pub const PUPIL_TONE: f32 = 0.97;
/// EYE_sub's centre, Blender axes.
pub const HEAD_C: Vec3 = Vec3::new(0.000063, -0.000004, 0.060143);
const BASE_U: [Vec3; 2] = [Vec3::new(-0.20544, 0.444568, 0.871868), Vec3::new(0.20544, 0.444568, 0.871868)];
const BASE_R: [Vec3; 2] = [Vec3::new(-0.907761, -0.419487, 0.0), Vec3::new(-0.907761, 0.419487, 0.0)];
const BASE_D: [Vec3; 2] = [Vec3::new(0.365737, -0.791448, 0.489742), Vec3::new(-0.365737, -0.791448, 0.489742)];

/// Blender Z-up to three's Y-up.
pub fn to_y(v: Vec3) -> Vec3 {
    Vec3::new(v.x, v.z, -v.y)
}

fn open_half() -> f32 {
    EYE_RAD * EYE_SQ
}

fn bot_close() -> f32 {
    let pupil_half = GLINT_RAD_R * PUPIL_SQ / EYE_SQ;
    let cover_k = apx_at(COVER_AT);
    1.0 + (GLINT_SEAT_U - pupil_half - COVER_CLEARANCE_U - cover_k * (1.0 + LID_OVERSHOOT_U) - SHUT_RISE_U * (1.0 - cover_k)) / (1.0 - cover_k)
}

fn meet_arc() -> f32 {
    -open_half() * (1.0 - bot_close())
}

fn top_arc(open: f32) -> f32 {
    let meet = meet_arc();
    meet + apx_at(open) * (open_half() * (1.0 + LID_OVERSHOOT_U) - meet)
}

fn bot_arc(open: f32) -> f32 {
    let meet = meet_arc();
    meet + apx_at(open) * (-open_half() * (1.0 + LID_OVERSHOOT_U) - meet)
}

fn lid_lift(open: f32) -> f32 {
    SHUT_RISE_U * open_half() * (1.0 - apx_at(open))
}

fn cap_half(open: f32) -> f32 {
    let k = apx_at(open).powi(CAP_POW);
    EYE_RAD * (CAP_SHUT + (CAP_OPEN - CAP_SHUT) * k)
}

fn corner(open: f32) -> f32 {
    let top = top_arc(open) + lid_lift(open);
    let below = open_half() - top;
    let band = (top_arc(open) - bot_arc(open) + lid_lift(open)) / 2.0;
    (CORNER_R * EYE_RAD).min(below).min(band).max(0.0)
}

/// How far each lid comes in for a gaze `off` radians from rest (squintFor).
pub fn squint(off: f32, open: f32) -> f32 {
    let k = (off.abs() / GAZE_FULL_RAD).min(1.0).powf(SQUINT_POW);
    let want = k * SQUINT_RISE_U * open_half();
    let height = top_arc(open) + lid_lift(open) - bot_arc(open);
    let room = (height - SQUINT_MIN_U * open_half()) / 2.0;
    want.min(room).max(0.0)
}

// ————— faces.ts —————

/// An expression: what `setFace` reads of faces.ts' GhostFace (its yaw and pitch are the
/// look-at's, not the face's).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Face {
    pub w_l: f32,
    pub w_r: f32,
    pub h_l: f32,
    pub h_r: f32,
    pub ang_l: f32,
    pub ang_r: f32,
    pub frown_l: f32,
    pub frown_r: f32,
    pub glint_x: f32,
    pub glint_y: f32,
    pub spread: f32,
    pub open: f32,
    pub pupil: f32,
}

/// NEUTRAL_FACE.
pub const NEUTRAL: Face = Face {
    w_l: 1.0,
    w_r: 1.0,
    h_l: 1.0,
    h_r: 1.0,
    ang_l: 0.0,
    ang_r: 0.0,
    frown_l: 0.0,
    frown_r: 0.0,
    glint_x: 0.0,
    glint_y: 0.0,
    spread: 0.0,
    open: 1.0,
    pupil: 1.0,
};

/// ghost-rig.ts SMILE: the eye shut to a hair above the blink floor, read as an arc.
pub const SMILE: Face = Face { h_l: 1.1, h_r: 1.1, frown_r: 0.05, spread: -1.5, open: 0.07, ..NEUTRAL };

impl Face {
    /// The channels, in a fixed order.
    pub fn fields(&self) -> [f32; 13] {
        [
            self.w_l,
            self.w_r,
            self.h_l,
            self.h_r,
            self.ang_l,
            self.ang_r,
            self.frown_l,
            self.frown_r,
            self.glint_x,
            self.glint_y,
            self.spread,
            self.open,
            self.pupil,
        ]
    }

    /// From `fields`.
    pub fn from_fields(f: [f32; 13]) -> Face {
        Face {
            w_l: f[0],
            w_r: f[1],
            h_l: f[2],
            h_r: f[3],
            ang_l: f[4],
            ang_r: f[5],
            frown_l: f[6],
            frown_r: f[7],
            glint_x: f[8],
            glint_y: f[9],
            spread: f[10],
            open: f[11],
            pupil: f[12],
        }
    }

    /// Each channel `k` of the way from `self` to `to`.
    pub fn toward(&self, to: &Face, k: f32) -> Face {
        let (a, b) = (self.fields(), to.fields());
        let mut f = [0.0; 13];
        for i in 0..13 {
            f[i] = a[i] + (b[i] - a[i]) * k;
        }
        Face::from_fields(f)
    }
}

/// A face of faces.ts by name; neutral for any other.
pub fn face(name: &str) -> Face {
    let n = NEUTRAL;
    match name {
        "alert" => Face { h_l: 1.1, h_r: 1.1, ..n },
        "wide" => Face { w_l: 1.15, w_r: 1.15, h_l: 1.2, h_r: 1.2, ..n },
        "dreamy" => Face { glint_y: 0.12, open: 0.9, ..n },
        _ => n,
    }
}

// ————— the uniforms —————

/// What one frame's setters leave in the veil's uniforms.
#[derive(Clone, Copy, Debug)]
pub struct Eyes {
    pub u: [Vec3; 2],
    pub r: [Vec3; 2],
    pub d: [Vec3; 2],
    pub rad: [f32; 2],
    pub sq: [f32; 2],
    pub glint_r: [f32; 2],
    pub frown: [f32; 2],
    pub pupil_at: [[f32; 2]; 2],
    pub top_arc: f32,
    pub bot_arc: f32,
    pub lid_lift: f32,
    pub cap_half: f32,
    pub corner: f32,
    pub squint: f32,
}

/// The base axes of eye `side` aimed by `yaw` and `pitch` (about Blender's X, then its Z),
/// rolled by `ang` about its own forward axis, in Y-up.
fn aimed(side: usize, yaw: f32, pitch: f32, ang: f32) -> (Vec3, Vec3, Vec3) {
    let q = Quat::from_rotation_z(yaw) * Quat::from_rotation_x(pitch);
    let (mut u, mut r) = (to_y(q * BASE_U[side]), to_y(q * BASE_R[side]));
    let d = to_y(q * BASE_D[side]);
    if ang != 0.0 {
        let roll = Quat::from_axis_angle(d.normalize(), ang);
        u = roll * u;
        r = roll * r;
    }
    (u, r, d)
}

/// The eyes aimed at (`yaw`, `pitch`) wearing `face`; `open` is the aperture the lids were set
/// to before the face (setOpen), which the glance's squint reads; `off` the glance from rest.
pub fn solve(yaw: f32, pitch: f32, off: f32, open: f32, face: &Face) -> Eyes {
    let deg = std::f32::consts::PI / 180.0;
    let seat = GLINT_SEAT_U * EYE_RAD * EYE_SQ;
    let half_u = EYE_RAD * EYE_SQ;
    let mut e = Eyes {
        u: [Vec3::ZERO; 2],
        r: [Vec3::ZERO; 2],
        d: [Vec3::ZERO; 2],
        rad: [EYE_RAD; 2],
        sq: [EYE_SQ; 2],
        glint_r: [0.0; 2],
        frown: [0.0; 2],
        pupil_at: [[face.glint_x * EYE_RAD, seat + face.glint_y * half_u]; 2],
        top_arc: top_arc(face.open),
        bot_arc: bot_arc(face.open),
        lid_lift: lid_lift(face.open),
        cap_half: cap_half(face.open),
        corner: corner(face.open),
        squint: squint(off, open),
    };
    for side in 0..2 {
        let sgn = if side == 0 { 1.0 } else { -1.0 };
        let (w, h, ang) = if side == 0 { (face.w_l, face.h_l, face.ang_l) } else { (face.w_r, face.h_r, face.ang_r) };
        let (u, r, d) = aimed(side, yaw + face.spread * sgn * deg, pitch, ang * sgn * deg);
        let rad = EYE_RAD * w;
        let sq = (EYE_SQ * h / w.max(1e-4)).max(0.05);
        e.u[side] = u;
        e.r[side] = r;
        e.d[side] = d;
        e.rad[side] = rad;
        e.sq[side] = sq;
        e.glint_r[side] = (GLINT_RAD_R * rad * face.pupil).min(0.42 * rad * sq);
        e.frown[side] = if side == 0 { face.frown_l } else { face.frown_r };
    }
    e
}

/// eye-rig.ts `solvePupils`: one pupil offset (`r` across, `u` up in the eyes' mean tangent
/// basis) solved per eye by least squares on its axes, so the discs do not sit on a V.
fn solve_pupils(r_axes: [Vec3; 2], u_axes: [Vec3; 2], r: f32, u: f32) -> [[f32; 2]; 2] {
    let rm = r_axes[0] + r_axes[1];
    let um = u_axes[0] + u_axes[1];
    let nr = if rm.length() > 0.0 { rm.length() } else { 1.0 };
    let nu = if um.length() > 0.0 { um.length() } else { 1.0 };
    let t = rm * (r / nr) + um * (u / nu);
    let one = |ra: Vec3, ua: Vec3| {
        let (a, b, c) = (ra.dot(ra), ra.dot(ua), ua.dot(ua));
        let det = a * c - b * b;
        let det = if det == 0.0 { 1e-9 } else { det };
        let (tr, tu) = (t.dot(ra), t.dot(ua));
        [(c * tr - b * tu) / det, (a * tu - b * tr) / det]
    };
    [one(r_axes[0], u_axes[0]), one(r_axes[1], u_axes[1])]
}

/// The offer mascot's eyes (mascot-scene-core.ts): the lids at `open` (setOpen) with `frown`
/// (setFrown), aimed at (`yaw`, `pitch`) (setAim), squinting for a glance `off` from rest
/// (setGazeOff), the pupils at the clip's (`pupil_r`, `pupil_u`) plus the swirl, solved at the
/// authored aim (`pupil_aim`) so they ride the sockets (setPupil).
#[allow(clippy::too_many_arguments)]
pub fn solve_clip(yaw: f32, pitch: f32, open: f32, frown: f32, off: f32, pupil_r: f32, pupil_u: f32, swirl: (f32, f32), pupil_aim: (f32, f32)) -> Eyes {
    let mut e = Eyes {
        u: [Vec3::ZERO; 2],
        r: [Vec3::ZERO; 2],
        d: [Vec3::ZERO; 2],
        rad: [EYE_RAD; 2],
        sq: [EYE_SQ; 2],
        glint_r: [GLINT_RAD_R * EYE_RAD; 2],
        frown: [frown; 2],
        pupil_at: [[0.0; 2]; 2],
        top_arc: top_arc(open),
        bot_arc: bot_arc(open),
        lid_lift: lid_lift(open),
        cap_half: cap_half(open),
        corner: corner(open),
        squint: squint(off, open),
    };
    let (mut ra, mut ua) = ([Vec3::ZERO; 2], [Vec3::ZERO; 2]);
    for side in 0..2 {
        let (u, r, d) = aimed(side, yaw, pitch, 0.0);
        e.u[side] = u;
        e.r[side] = r;
        e.d[side] = d;
        let (u, r, _) = aimed(side, pupil_aim.0, pupil_aim.1, 0.0);
        ua[side] = u;
        ra[side] = r;
    }
    e.pupil_at = solve_pupils(ra, ua, pupil_r + swirl.0, pupil_u + swirl.1);
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_open_eye_is_the_untouched_oval_and_a_shut_one_a_stroke() {
        // Open: the lids park past the outline, no corner rounding.
        assert!(top_arc(1.0) > open_half());
        assert!(bot_arc(1.0) < -open_half());
        assert_eq!(corner(1.0), 0.0);
        // Shut: both edges meet, lidLift alone between them.
        assert!((top_arc(0.0) - bot_arc(0.0)).abs() < 1e-6);
        assert!(lid_lift(0.0) > 0.0);
    }

    #[test]
    fn a_glance_squints_both_lids_but_never_shut() {
        assert_eq!(squint(0.0, 1.0), 0.0);
        let s = squint(0.3, 1.0);
        assert!((s - SQUINT_RISE_U * open_half()).abs() < 1e-6);
        // At a near-shut aperture the squint leaves room.
        let h = top_arc(0.2) + lid_lift(0.2) - bot_arc(0.2);
        assert!(h - 2.0 * squint(0.3, 0.2) >= SQUINT_MIN_U * open_half() - 1e-6);
    }

    #[test]
    fn one_pupil_offset_lands_on_both_eyes() {
        let e = solve_clip(0.0, 0.48, 1.0, 0.0, 0.0, 0.0, -0.05, (0.0, 0.0), (0.0, 0.48));
        // Straight down in the shared basis: both discs low, mirrored across.
        assert!(e.pupil_at[0][1] < 0.0 && e.pupil_at[1][1] < 0.0);
        assert!((e.pupil_at[0][1] - e.pupil_at[1][1]).abs() < 1e-3);
        assert!((e.pupil_at[0][0] + e.pupil_at[1][0]).abs() < 1e-3 || (e.pupil_at[0][0] - e.pupil_at[1][0]).abs() < 1e-3);
    }

    #[test]
    fn the_eyes_sit_on_the_front_of_the_head_left_and_right() {
        let e = solve(0.0, 0.4818, 0.0, 1.0, &NEUTRAL);
        // Forward axes point out of the face (+Z in Y-up) and apart.
        assert!(e.d[0].z > 0.0 && e.d[1].z > 0.0);
        assert!(e.d[0].x > 0.0 && e.d[1].x < 0.0);
    }
}
