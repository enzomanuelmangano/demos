//! The offer card's mascot: the pawn that morphs into the ghost beside his
//! board, over the WelcomeTacticsAura glow — the RN app's GhostMorph
//! (onboarding/ghost-morph.tsx, mascot-scene-core.ts, ghost-clip.ts,
//! board-turn.ts, dizzy.ts, src/components/welcome-tactics-aura.tsx) on wgpu.
//!
//! `mascot(play, reduced)`: 1 once the card is let in (the morph plays from
//! its held first frame), and Reduce Motion (the settled ghost at once, the
//! glow still, no touches). ghost-morph.glb (figure.rs: its morph targets
//! blended in the vertex shader) plays on the clip clock RN plays
//! (`clip_time_at`: a held half second, the pre-jump run at 1.4×, then the
//! float loop). The eyes are the veil (veil.rs) fed the clip's tables, then,
//! settled, a live look-at at the board handed over in 0.7 s while the whole
//! figure turns toward it; blinks on their own clock. A poke flinches him,
//! bolts him away from the finger and up, sulks, glares back and drifts home
//! (a re-tap goes further, up to a shudder), kept inside the frame. The board
//! turns a quarter on a tap and like a turntable under a drag, carrying the
//! flick into a damped spring (board-turn.ts); while it turns he is confused
//! (eyes dart, head cocks, pupils swirl), and three quick turns or one swipe
//! make him dizzy: birds circle his head and pop away (birds.rs). A press
//! squashes what it lands on; its release is felt (`selection` on the board,
//! `rigid` on the ghost), as are the morph's beats (MORPH_HAPTICS, every one the
//! clip crosses), published one a frame as `{"haptic": n, "kind": "soft"}`
//! (`exactSurface("mascot")`) for the root's impact presets; the birds' pops are
//! Core Haptics patterns (dizzy.ts POP_PATTERNS, pulsar.rs) the host plays. One
//! finger: a second is ignored and the release waits for every finger up
//! (ghost-morph.tsx). The canvas's one child is the scheme probe (probe.rs): the
//! glow takes the scheme's colours.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{ChildrenMode, Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use glam::{Mat4, Quat, Vec3};

use crate::birds::{self, Birds, Look};
use crate::figure::{self, Call, Figure, MeshData};
use crate::mascot_clip::{
    BEAT_REST, EYES_APPEAR_FRAME, EYE_CY_T, EYE_CZ_T, EYE_OPEN_T, EYE_PITCH_T, EYE_YAW_T, FLOAT_REST, MORPH_HAPTICS, PUP_R_T, PUP_U_T, SHUT_RUN,
};
use crate::probe::SchemeProbe;
use crate::{gfx, glb, scene, shaders, veil};

/// The model, embedded: the same file the RN app ships.
pub const GLB: &[u8] = include_bytes!("../models/ghost-morph.glb");

/// The board's white linework, points wide (mascot-scene-core.ts BOARD_LINE_PX: the 0.0105-unit
/// tube on the 2.48-unit board read about 0.6 pt along its near edge).
const BOARD_LINE_PT: f32 = 0.6;

// ————— ghost-clip.ts —————
const CLIP_FPS: f32 = 24.0;
const BEAT: (f32, f32) = (1.0, 151.0);
const FLOAT: (f32, f32) = (151.0, 313.0);
const HOLD_SEC: f32 = 0.5;
const JUMP_AT: f32 = 3.58;
const PRE_JUMP_RATE: f32 = 1.4;
const RATE_EASE_SEC: f32 = 0.3;

fn sec_of(frame: f32) -> f32 {
    frame / CLIP_FPS
}

fn beat_parts() -> (f32, f32, f32, f32) {
    let jump_at_clip = JUMP_AT - sec_of(BEAT.0);
    let ease_clip = RATE_EASE_SEC * (PRE_JUMP_RATE + 1.0) / 2.0;
    let fast_clip = jump_at_clip - ease_clip;
    let fast_sec = fast_clip / PRE_JUMP_RATE;
    (jump_at_clip, fast_clip, fast_sec, fast_sec + RATE_EASE_SEC + (sec_of(BEAT.1) - sec_of(BEAT.0) - jump_at_clip))
}

/// How long the morph runs before the float, seconds (MORPH_LENGTH_SEC).
pub fn morph_length() -> f32 {
    HOLD_SEC + beat_parts().3
}

/// The clip time for `elapsed` seconds since the card let the morph go (clipTimeAt).
pub fn clip_time_at(elapsed: f32) -> f32 {
    let (jump_at_clip, fast_clip, fast_sec, beat_elapsed) = beat_parts();
    let left = elapsed.max(0.0) - HOLD_SEC;
    if left <= 0.0 {
        return sec_of(BEAT.0);
    }
    if left < beat_elapsed {
        let u = left;
        let at = if u <= fast_sec {
            u * PRE_JUMP_RATE
        } else if u - fast_sec < RATE_EASE_SEC {
            let t = u - fast_sec;
            let x = t / RATE_EASE_SEC;
            fast_clip + PRE_JUMP_RATE * t + (1.0 - PRE_JUMP_RATE) * RATE_EASE_SEC * (x * x * x - x * x * x * x / 2.0)
        } else {
            jump_at_clip + (u - fast_sec - RATE_EASE_SEC)
        };
        return sec_of(BEAT.0) + at;
    }
    let float_len = sec_of(FLOAT.1) - sec_of(FLOAT.0);
    let t = (left - beat_elapsed) % float_len;
    sec_of(FLOAT.0) + t.min(float_len - 1e-3)
}

/// The settled ghost's blinks (mascot-scene-core.ts makeEyeLife), measured off the reference
/// clip: a 0.34 s blink every 4.5 ± 1.6 s (at least 1.3 s apart), sometimes two in quick
/// succession; on their own clock so they never lock to the 6.75 s float loop. They join the
/// authored lid (the lower of the two) once the ghost has settled and their clock is open.
const BLINK_EVERY: f32 = 4.5;
const BLINK_JITTER: f32 = 1.6;
const BLINK_MIN_GAP: f32 = 1.3;
const BLINK_SEC: f32 = 0.34;
const DOUBLE_BLINK: f32 = 0.12;

#[derive(Clone, Copy, Debug)]
pub struct Blinks {
    seed: u32,
    t: f32,
    at: f32,
    until: f32,
    double: bool,
}

impl Blinks {
    pub fn new(seed: u32) -> Blinks {
        let mut b = Blinks { seed: seed | 1, t: 0.0, at: 0.0, until: -1.0, double: false };
        b.at = b.jitter();
        b
    }
    fn random(&mut self) -> f32 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        (self.seed >> 8) as f32 / (1u32 << 24) as f32
    }
    fn jitter(&mut self) -> f32 {
        let r = self.random();
        (BLINK_EVERY + (r * 2.0 - 1.0) * BLINK_JITTER).max(BLINK_MIN_GAP)
    }
    /// Advances `dt` seconds: how open the lid is, 0..1.
    pub fn step(&mut self, dt: f32) -> f32 {
        self.t += dt;
        if self.t >= self.at && self.until < 0.0 {
            self.until = self.t + BLINK_SEC;
            self.double = self.random() < DOUBLE_BLINK;
        }
        if self.until < 0.0 {
            return 1.0;
        }
        let k = 1.0 - (self.until - self.t) / BLINK_SEC;
        if k >= 1.0 {
            self.until = -1.0;
            self.at = if std::mem::take(&mut self.double) { self.t + 0.12 } else { self.t + self.jitter() };
            return 1.0;
        }
        1.0 - (std::f32::consts::PI * k.clamp(0.0, 1.0)).sin().powf(0.8)
    }
}

fn sample_at(table: &[f32], frame: f32) -> f32 {
    let a = (frame.floor().max(0.0) as usize).min(table.len() - 1);
    let b = (a + 1).min(table.len() - 1);
    table[a] + (table[b] - table[a]) * (frame - a as f32)
}

// ————— board-turn.ts, mascot-scene-core.ts —————
const BOARD_QUARTER: f32 = std::f32::consts::FRAC_PI_2;
const BOARD_DRAG_GAIN: f32 = std::f32::consts::FRAC_PI_2;
const BOARD_DRAG_SLOP: f32 = 0.04;
const BOARD_FLICK_SEC: f32 = 0.18;
const BOARD_TURN_SEC: f32 = 0.62;
const BOARD_DAMPING: f32 = 0.72;
const BOARD_STEP_SEC: f32 = 1.0 / 240.0;
const PRESS_IN_SEC: f32 = 0.08;
const PRESS_OUT_SEC: f32 = 0.16;
const PRESS_SQUASH_GHOST: f32 = 0.07;
const PRESS_SQUASH_BOARD: f32 = 0.045;
/// How much tighter than Blender's framing the app crops.
const FRAME_ZOOM: f32 = 1.1;
const CAM_LENS: f32 = 40.0;
const SENSOR: f32 = 36.0;
/// The flat materials (MeshBasicMaterial hex, sRGB).
const INK: u32 = 0x040404;
const LINEWORK: u32 = 0xffffff;
const TILE_DARK: u32 = 0x8c6a5c;
const TILE_LIGHT: u32 = 0xd0b5a4;
/// The aura's breath: 2600 ms in-out sine, there and back; still at 0.45 under Reduce Motion.
const AURA_BREATH_MS: f64 = 2600.0;
const AURA_STILL: f32 = 0.45;

/// The quarter a release leaves the board on (boardTurnOnRelease), in NDC.
pub fn board_turn_on_release(quarters: f32, down: (f32, f32), at: Option<(f32, f32)>, dragging: bool, angle: f32, angle_at_down: f32, flick: f32) -> f32 {
    let (dx, dy) = at.map_or((0.0, 0.0), |(x, y)| (x - down.0, y - down.1));
    if !dragging && (dx * dx + dy * dy).sqrt() <= BOARD_DRAG_SLOP {
        return quarters + 1.0;
    }
    if !dragging && dx.abs() <= BOARD_DRAG_SLOP {
        return quarters;
    }
    let angle = if dragging { angle } else { angle_at_down + dx * BOARD_DRAG_GAIN };
    ((angle + flick * BOARD_DRAG_GAIN * BOARD_FLICK_SEC) / BOARD_QUARTER).round()
}

// ————— the poke (mascot-scene-core.ts) —————
// The reaction in beats: flinch toward the touch, bolt out and up, sulk held out there, glare
// back once, drift home and settle. Seconds each.
const FLINCH: f32 = 0.06;
const BOLT: f32 = 0.2;
const SULK: f32 = 0.3;
const GLARE: f32 = 0.16;
const HOME: f32 = 0.72;
const SETTLE: f32 = 0.3;
const T1: f32 = FLINCH;
const T2: f32 = T1 + BOLT;
const T3: f32 = T2 + SULK;
const T4: f32 = T3 + GLARE;
const REACT_TOTAL: f32 = T4 + HOME + SETTLE;
const CARRY_FADE: f32 = 0.26;
const SHUDDER_KICK: f32 = 0.09;
const SHUDDER_FOR: f32 = 0.22;
const RETAP_FURTHER: f32 = 0.35;
const AWAY_MAX: f32 = 1.4;
const FLEE_DIST: f32 = 1.15;
const BACK_MIN: f32 = 0.55;
/// The ghost's silhouette as five stacked spheres in Ghost_Root's space (GHOST_HULL).
const GHOST_HULL: [([f32; 3], f32); 5] = [
    ([0.29, -3.0559, -0.2861], 1.3348),
    ([0.235, -2.2855, -0.243], 1.1856),
    ([0.05, -1.3495, -0.4528], 1.0642),
    ([0.0031, -0.6118, -0.6281], 1.1173),
    ([0.003, 0.3921, -0.7202], 1.1084),
];
const FLINCH_BACK: f32 = -0.09;
const FLEE_LIFT: f32 = 0.2;
const SULK_LIFT: f32 = 0.55;
const FLEE_CURVE: f32 = 0.28;
const FLEE_SPIN: f32 = 0.42;
const FRAME_LIMIT_X: f32 = 0.68;
const FRAME_LIMIT_Y: f32 = 0.78;
const GHOST_WORLD_RADIUS: f32 = 0.34;
const LEAN_PER_SPEED: f32 = 0.1;
const LEAN_MAX: f32 = 0.3;
const STRETCH_PER_SPEED: f32 = 0.055;
const STRETCH_MAX: f32 = 0.22;
const GLANCE_YAW: f32 = 0.34;
const GRAB_PAD: f32 = 0.14;
// The look-at at the board: the whole figure turns on Ghost_Root, the eyes carry the rest.
const HEAD_TURN_MAX: f32 = 0.3;
const AIM_HANDOVER: f32 = 0.7;
const AIM_YAW_MAX: f32 = 0.38;
const AIM_PITCH_MAX: f32 = 0.38;
// Confusion while the board turns: eyes dart, head cocks, pupils swirl.
const CONFUSE_TAIL: f32 = 0.55;
const CONFUSE_DART: f32 = 0.26;
const CONFUSE_DART_HZ: f32 = 4.2;
const CONFUSE_COCK: f32 = 0.2;
const HYPNO_RADIUS: f32 = 0.072;
const HYPNO_TURNS: f32 = 2.4;
/// The head's top hull sphere, in Ghost_Root's space: where the birds circle.
const BIRD_HEAD_LOCAL: Vec3 = Vec3::new(0.003, 0.3921, -0.7202);
const BIRD_HEAD_RADIUS_LOCAL: f32 = 1.1084;
// dizzy.ts: every board tap adds one, a swipe lifts it past DIZZY_ON; it drains.
const DIZZY_DRAIN: f32 = 1.0;
const DIZZY_MAX: f32 = 3.2;
const DIZZY_ON: f32 = 2.2;
const DIZZY_OFF: f32 = 1.6;
const DIZZY_SWIPE: f32 = DIZZY_ON + 0.8;

fn smooth(k: f32) -> f32 {
    k * k * (3.0 - 2.0 * k)
}

/// 0 → 1, at rest at both ends, fast early.
fn bolt(k: f32) -> f32 {
    1.0 - (1.0 - k).powi(4) * (1.0 + 4.0 * k)
}

/// 0 at both ends, 1 in the middle, at rest at both ends.
fn bell(k: f32) -> f32 {
    (std::f32::consts::PI * k).sin().powi(2)
}

/// The reaction `age` seconds after the poke (reactionAt).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct React {
    pub away: f32,
    pub lift: f32,
    pub scowl: f32,
    pub gaze: f32,
}

pub fn reaction_at(age: f32) -> React {
    if age < T1 {
        let k = smooth(age / FLINCH);
        return React { away: FLINCH_BACK * k, lift: 0.0, scowl: 0.0, gaze: k };
    }
    if age < T2 {
        let k = (age - T1) / BOLT;
        return React {
            away: FLINCH_BACK + (1.0 - FLINCH_BACK) * bolt(k),
            lift: bell(k) * (1.0 - SULK_LIFT) + smooth(k) * SULK_LIFT,
            scowl: smooth(k),
            gaze: 1.0 - smooth(k) * 1.8,
        };
    }
    if age < T3 {
        let k = (age - T2) / SULK;
        return React { away: 1.0, lift: SULK_LIFT + (1.0 - (k * std::f32::consts::TAU).cos()) / 2.0 * 0.09, scowl: 1.0, gaze: -0.8 };
    }
    if age < T4 {
        let k = (age - T3) / GLARE;
        return React { away: 1.0, lift: SULK_LIFT, scowl: 1.0, gaze: -0.8 + 1.7 * smooth((k * 2.4).min(1.0)) };
    }
    let k = ((age - T4) / (HOME + SETTLE)).min(1.0);
    let e = k * k * k * (k * (k * 6.0 - 15.0) + 10.0);
    React { away: 1.0 - e, lift: SULK_LIFT * (1.0 - e), scowl: 1.0 - smooth((k / 0.55).min(1.0)), gaze: 0.9 * (1.0 - smooth((k * 1.8).min(1.0))) }
}

/// How far out the ghost is `age` seconds into a flight started `from` out, and its speed
/// (flightAt): a re-tap goes further, up to AWAY_MAX, where it shudders instead.
pub fn flight_at(age: f32, from: f32) -> (f32, f32) {
    let target = AWAY_MAX.min(1.0 + from * RETAP_FURTHER);
    let lead = T1 * from.min(1.0);
    let room = target - from;
    let shudder = if room < SHUDDER_KICK { SHUDDER_KICK - room } else { 0.0 };
    let base = |a: f32| {
        let s = (a + lead).clamp(0.0, REACT_TOTAL);
        let r = reaction_at(s).away;
        if s >= T2 {
            return target * r;
        }
        from + (target - from) * if r < 0.0 { r * (1.0 - from.min(1.0)) } else { r }
    };
    let shape = |a: f32| base(a).min(AWAY_MAX) + if shudder > 0.0 && a > 0.0 && a < SHUDDER_FOR { shudder * bell(a / SHUDDER_FOR) } else { 0.0 };
    let h = 1.0 / 120.0;
    (shape(age), (shape(age + h) - shape(age - h)) / (2.0 * h))
}

/// frame-clamp.ts frameFit: the share of a move from `rest` to `now` (NDC) that stays inside `limit`.
fn frame_fit(now: f32, rest: f32, limit: f32) -> f32 {
    let reach = now.abs();
    if reach <= limit {
        return 1.0;
    }
    let travel = reach - rest.abs();
    if travel <= 1e-4 {
        return 1.0;
    }
    ((limit - rest.abs()) / travel).max(0.0)
}

/// solveAim: yaw and pitch that turn the eye's forward axis `d` (Blender axes) along `want`,
/// on the branch nearest the last answer, clamped to the front of the head.
fn solve_aim(want: Vec3, d: Vec3, prev: Option<(f32, f32)>) -> (f32, f32) {
    let r = d.y.hypot(d.z);
    let phi = d.z.atan2(d.y);
    let base = (want.z / r).clamp(-1.0, 1.0).asin();
    let wrap = |a: f32| a.sin().atan2(a.cos());
    let mut best = (0.0, 0.0, f32::INFINITY);
    for p0 in [base - phi, std::f32::consts::PI - base - phi] {
        let pitch = wrap(p0);
        let (sp, cp) = pitch.sin_cos();
        let yaw = wrap(want.y.atan2(want.x) - (d.y * cp - d.z * sp).atan2(d.x));
        let cost = match prev {
            Some((py, pp)) => (yaw - py).powi(2) + (pitch - pp).powi(2),
            None => yaw * yaw + pitch * pitch,
        };
        if cost < best.2 {
            best = (yaw, pitch, cost);
        }
    }
    (best.0.clamp(-AIM_YAW_MAX, AIM_YAW_MAX), best.1.clamp(-AIM_PITCH_MAX, AIM_PITCH_MAX))
}

fn gaze_rest_at(frame: f32) -> f32 {
    let last = SHUT_RUN.1 - 1.0;
    if frame <= SHUT_RUN.0 {
        return BEAT_REST;
    }
    if frame >= last {
        return FLOAT_REST;
    }
    let k = (frame - SHUT_RUN.0) / (last - SHUT_RUN.0).max(1.0);
    BEAT_REST + (FLOAT_REST - BEAT_REST) * k
}

// ————— the model —————

#[derive(Clone, Copy, PartialEq)]
enum Shade {
    Flat(u32),
    Toon,
    Veil,
}

/// A drawn primitive: its index in the file's, its node and how it is shaded.
struct MPrim {
    prim: usize,
    node: usize,
    shade: Shade,
}

/// Whether a node's mesh is board linework, drawn as lines (replaceBoardLinework).
fn is_linework(name: &str) -> bool {
    name == "Board_Wire" || name.starts_with("Board_Inner_")
}

struct Model {
    scene: glb::Scene,
    prims: Vec<MPrim>,
    /// The board's linework, drawn as lines, not its baked meshes: each segment's node and
    /// ends in that node's space (replaceBoardLinework).
    lines: Vec<(usize, Vec3, Vec3)>,
    camera: usize,
    board: usize,
    ghost: usize,
    veil: usize,
    quant: f32,
    /// The nodes the flee moves (CTRL_Grow and everything under it).
    fled: Vec<bool>,
    /// This frame's world matrices.
    worlds: Vec<Mat4>,
}

impl Model {
    fn load() -> Result<Model, String> {
        // Everything but ToonCam's animation, which orbits the shot (mascot-scene-core.ts).
        let scene = glb::Scene::load(GLB, "ghost-morph.glb", "ToonCam")?;
        let mut prims = Vec::new();
        let mut lines = Vec::new();
        for (i, p) in scene.prims.iter().enumerate() {
            let node = &scene.nodes[p.node];
            if node.name == "Board_Wire" {
                // The wire cage: its box's twelve edges.
                let (mut lo, mut hi) = (Vec3::splat(f32::MAX), Vec3::splat(f32::MIN));
                for v in &p.base {
                    lo = lo.min(Vec3::new(v[0], v[1], v[2]));
                    hi = hi.max(Vec3::new(v[0], v[1], v[2]));
                }
                let (xs, ys, zs) = ([lo.x, hi.x], [lo.y, hi.y], [lo.z, hi.z]);
                for y in ys {
                    for z in zs {
                        lines.push((p.node, Vec3::new(xs[0], y, z), Vec3::new(xs[1], y, z)));
                    }
                }
                for x in xs {
                    for z in zs {
                        lines.push((p.node, Vec3::new(x, ys[0], z), Vec3::new(x, ys[1], z)));
                    }
                }
                for x in xs {
                    for y in ys {
                        lines.push((p.node, Vec3::new(x, y, zs[0]), Vec3::new(x, y, zs[1])));
                    }
                }
                continue;
            }
            if node.name.starts_with("Board_Inner_") {
                // A 2×2 plane scaled to a sliver: the line runs down its long axis.
                let sc = node.rest.2;
                let (a, b) = if sc.x.abs() >= sc.z.abs() { (Vec3::new(-1.0, 0.0, 0.0), Vec3::X) } else { (Vec3::new(0.0, 0.0, -1.0), Vec3::Z) };
                lines.push((p.node, a, b));
                continue;
            }
            let shade = match p.material.as_str() {
                "Ghost_Fill" => Shade::Toon,
                "Ghost_Fill_Veil" => Shade::Veil,
                "Ghost_Outline" => Shade::Flat(LINEWORK),
                "Tile_Dark" => Shade::Flat(TILE_DARK),
                "Tile_Light" => Shade::Flat(TILE_LIGHT),
                _ => Shade::Flat(INK),
            };
            prims.push(MPrim { prim: i, node: p.node, shade });
        }
        let named = |name: &str| scene.named(name).ok_or_else(|| format!("ghost-morph.glb: no {name}"));
        let veil = named("Ghost_Tail_Baked")?;
        let grow = named("CTRL_Grow")?;
        // The veil's mesh is in units of its node's scale (its extras' quantScale).
        let quant = scene.nodes[veil].rest.2.x;
        let fled = (0..scene.nodes.len()).map(|i| scene.under(i, grow)).collect();
        Ok(Model {
            camera: named("ToonCam")?,
            board: named("Board_Pivot")?,
            ghost: named("Ghost_Root")?,
            veil,
            quant,
            prims,
            lines,
            fled,
            worlds: Vec::new(),
            scene,
        })
    }

    /// The world box of what is drawn under `root`, at rest.
    fn box_under(&self, root: usize, worlds: &[Mat4]) -> (Vec3, Vec3) {
        self.scene.box_under(root, worlds, |p| !is_linework(&self.scene.nodes[p.node].name))
    }
}

/// Where the ray through NDC (x, y) enters the box, or None.
fn ray_box(inv: Mat4, x: f32, y: f32, lo: Vec3, hi: Vec3) -> Option<f32> {
    let (a, d) = ray(inv, x, y);
    let (mut t0, mut t1) = (0.0f32, f32::INFINITY);
    for k in 0..3 {
        if d[k].abs() < 1e-9 {
            if a[k] < lo[k] || a[k] > hi[k] {
                return None;
            }
            continue;
        }
        let (u, v) = ((lo[k] - a[k]) / d[k], (hi[k] - a[k]) / d[k]);
        t0 = t0.max(u.min(v));
        t1 = t1.min(u.max(v));
    }
    (t0 <= t1).then_some(t0)
}

/// The ray through NDC (x, y): its origin on the near plane and its (unnormalised) direction.
fn ray(inv: Mat4, x: f32, y: f32) -> (Vec3, Vec3) {
    let a = inv.project_point3(Vec3::new(x, y, 0.0));
    let b = inv.project_point3(Vec3::new(x, y, 1.0));
    (a, b - a)
}

/// Where the ray (origin, direction) first meets the sphere, as a parameter along it.
fn ray_sphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: f32) -> Option<f32> {
    let d = dir.normalize();
    let oc = origin - centre;
    let b = oc.dot(d);
    let c = oc.dot(oc) - radius * radius;
    let disc = b * b - c;
    if disc < 0.0 {
        return None;
    }
    let s = disc.sqrt();
    let t = if -b - s >= 0.0 { -b - s } else { -b + s };
    (t >= 0.0).then_some(t)
}

#[derive(Clone, Copy, PartialEq)]
enum Held {
    Ghost,
    Board,
}

/// The poke the ghost is reacting to, and the seams a re-tap opens.
#[derive(Default)]
struct Flee {
    at: Option<f64>,
    from: f32,
    dir: Vec3,
    side: f32,
    next_dir: Vec3,
    next_side: f32,
    shove: Vec3,
    last_away: f32,
    lean: f32,
    stretch: f32,
    carry: Vec3,
    carry_was: Vec3,
    carry_pending: bool,
    carry_at: Option<f64>,
    carry_rot: bool,
    twist_shown: f32,
    scowl_shown: f32,
    glance_shown: f32,
    carry_twist: f32,
    carry_scowl: f32,
    carry_glance: f32,
}

/// The board's turn confusing him, and how dizzy taps have made him.
#[derive(Default)]
struct Confusion {
    at: Option<f64>,
    dir: f32,
    from: f32,
    shown: f32,
    clock: f32,
    dizzy: f32,
    dizzy_on: bool,
}

struct Gpu {
    figure: Figure,
    composite: wgpu::RenderPipeline,
    composite_layout: wgpu::BindGroupLayout,
    composite_bind: Option<(u32, wgpu::BindGroup)>,
    lines: wgpu::RenderPipeline,
    lines_bind: wgpu::BindGroup,
}

/// The arena's extra blocks: the glow, the linework.
const GLOW: usize = 0;
const LINES: usize = 1;

/// The mascot.
pub struct MascotSurface {
    /// Under Reduce Motion the card's figure comes to rest: then no frames are asked for.
    still: crate::gfx::Stillness,
    model: Option<Model>,
    play: bool,
    reduced: bool,
    started: Option<f64>,
    last_ms: Option<f64>,
    last_clip: Option<f32>,
    // The board: quarters asked for, its angle and speed.
    quarters: f32,
    angle: f32,
    speed: f32,
    // The touch: what it landed on, where (NDC) and the board's angle then,
    // where the drag took over, whether it has, the latest point and the flick.
    held: Option<Held>,
    down: (f32, f32),
    angle_at_down: f32,
    drag_from: (f32, f32),
    dragging: bool,
    at: Option<(f32, f32)>,
    flick: f32,
    /// The finger's velocity, RNGH's pan (minDistance 0): the flick is its velocityX at the
    /// release, in NDC per second (ghost-morph.tsx onEnd). The finger that counts and how
    /// many are down.
    pan: gestures::PanGesture,
    primary: Option<u32>,
    fingers: u32,
    released: bool,
    press: f32,
    press_kind: Option<Held>,
    inv_view_proj: Option<Mat4>,
    size: (f32, f32),
    haptics: u32,
    /// Felt presets not yet published (one a frame), and patterns for the host.
    felt: std::collections::VecDeque<&'static str>,
    patterns: Vec<String>,
    /// When the aura's breath started (mount, and each Reduce Motion change) and under which.
    aura_from: Option<(f64, bool)>,
    probe: SchemeProbe,
    gpu: Option<Gpu>,
    /// The settled ghost's blinks, and whether they have joined the authored lid.
    blinks: Option<Blinks>,
    blinks_joined: bool,
    flee: Flee,
    confusion: Confusion,
    /// The figure's turn toward the board, and the eyes' live look-at handed over from the clip.
    face: Quat,
    aim: Option<(f32, f32)>,
    aim_prev: (f32, f32),
    aim_at: f64,
    birds: Birds,
    calls: Vec<Call>,
}

impl Default for MascotSurface {
    fn default() -> MascotSurface {
        MascotSurface {
            still: Default::default(),
            model: None,
            play: false,
            reduced: false,
            started: None,
            last_ms: None,
            last_clip: None,
            quarters: 0.0,
            angle: 0.0,
            speed: 0.0,
            held: None,
            down: (0.0, 0.0),
            angle_at_down: 0.0,
            drag_from: (0.0, 0.0),
            dragging: false,
            at: None,
            flick: 0.0,
            pan: gestures::PanGesture::new().min_distance(0.0),
            primary: None,
            fingers: 0,
            released: false,
            press: 0.0,
            press_kind: None,
            inv_view_proj: None,
            size: (0.0, 0.0),
            haptics: 0,
            felt: std::collections::VecDeque::new(),
            patterns: Vec::new(),
            aura_from: None,
            probe: SchemeProbe::default(),
            gpu: None,
            blinks: None,
            blinks_joined: false,
            flee: Flee { dir: Vec3::NEG_Z, next_dir: Vec3::NEG_Z, ..Default::default() },
            confusion: Confusion { dir: 1.0, ..Default::default() },
            face: Quat::IDENTITY,
            aim: None,
            aim_prev: (0.0, 0.0),
            aim_at: 0.0,
            birds: Birds::default(),
            calls: Vec::new(),
        }
    }
}

impl MascotSurface {
    fn haptic(&mut self, kind: &'static str) {
        self.felt.push_back(kind);
    }

    fn ndc(&self, x: f32, y: f32) -> (f32, f32) {
        let (w, h) = (self.size.0.max(1.0), self.size.1.max(1.0));
        (x / w * 2.0 - 1.0, 1.0 - y / h * 2.0)
    }

    /// What a touch-down at NDC `p` lands on: the ghost first (he stands in front), by his hull
    /// grown back to where he would stand had he not fled; else the board's box. A hit on the
    /// ghost picks the way he will flee and the side he was poked on.
    fn touch_down(&mut self, p: (f32, f32)) {
        let (Some(inv), Some(model)) = (self.inv_view_proj, self.model.as_ref()) else { return };
        let worlds = &model.worlds;
        if worlds.len() != model.scene.nodes.len() {
            return;
        }
        let (origin, dir) = ray(inv, p.0, p.1);
        let cam = worlds[model.camera];
        let (cam_right, cam_fwd, cam_at) = (cam.x_axis.truncate().normalize(), cam.z_axis.truncate().normalize(), cam.w_axis.truncate());
        let root = worlds[model.ghost];
        let root_scale = root.x_axis.truncate().length();
        let away = self.flee.last_away;
        let grab = |centre: Vec3, r: f32| {
            let dist = cam_at.distance(centre);
            let rest = dist - away * FLEE_DIST;
            r * root_scale * if rest <= 0.01 { 1.0 } else { dist / rest * (1.0 + GRAB_PAD * away.min(1.0)) }
        };
        let mut best: Option<(f32, Vec3, f32)> = None;
        for (c, r) in GHOST_HULL {
            let centre = root.transform_point3(Vec3::from(c));
            let radius = grab(centre, r);
            let mut spheres = [(centre, radius), (centre - self.flee.shove, radius)];
            let n = if away > 0.02 { 2 } else { 1 };
            for (centre, radius) in spheres.iter_mut().take(n) {
                if let Some(t) = ray_sphere(origin, dir, *centre, *radius) {
                    if best.is_none_or(|b| t < b.0) {
                        best = Some((t, *centre, *radius));
                    }
                }
            }
        }
        self.held = None;
        if let Some((t, centre, radius)) = best {
            self.held = Some(Held::Ghost);
            let hit = origin + dir.normalize() * t;
            let mut flee = -(hit - centre).normalize();
            let backness = flee.dot(cam_fwd);
            if backness > -BACK_MIN {
                flee = (flee + cam_fwd * (-BACK_MIN - backness)).normalize();
            }
            self.flee.next_dir = flee;
            self.flee.next_side = ((hit.dot(cam_right) - centre.dot(cam_right)) / radius).clamp(-1.0, 1.0);
        } else {
            let (blo, bhi) = model.box_under(model.board, worlds);
            if ray_box(inv, p.0, p.1, blo, bhi).is_some() {
                self.held = Some(Held::Board);
            }
        }
    }
}

impl Surface for MascotSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) {
        self.gpu = None;
        self.probe.device_lost();
    }

    /// A new size frames it again: its stillness counts from the next frame.
    fn size(&mut self, _width: f32, _height: f32) -> bool {
        self.still.reset();
        false
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        self.still.reset();
        let get = |i: usize, name: &str| inputs.get(i).map(|v| number(v, name)).transpose();
        self.play = get(0, "play")?.unwrap_or(0.0) > 0.5;
        self.reduced = get(1, "reduced")?.unwrap_or(0.0) > 0.5;
        if self.model.is_none() {
            self.model = Some(Model::load().map_err(SurfaceError)?);
        }
        Ok(())
    }

    fn published(&mut self) -> Option<String> {
        let kind = self.felt.pop_front()?;
        self.haptics += 1;
        Some(format!("{{\"haptic\":{},\"kind\":\"{}\"}}", self.haptics, kind))
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.patterns)
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = event else { return };
        // One finger (onTouchesDown ignores a touch that is not the only one; the release waits
        // for the last finger up). Counted under Reduce Motion too, so a switch mid-touch leaves
        // no finger behind.
        match phase {
            PointerPhase::Down => {
                self.fingers += 1;
                if self.fingers > 1 {
                    return;
                }
                self.primary = Some(*id);
            }
            PointerPhase::Up | PointerPhase::Cancel => {
                self.fingers = self.fingers.saturating_sub(1);
            }
            PointerPhase::Move => {}
        }
        let mine = self.primary == Some(*id);
        if !mine && *phase != PointerPhase::Up {
            return;
        }
        if self.reduced {
            // Reduce Motion: no flinching, no turning.
            if self.fingers == 0 {
                self.primary = None;
            }
            return;
        }
        let gp = match phase {
            PointerPhase::Down => gestures::Phase::Down,
            PointerPhase::Move => gestures::Phase::Move,
            PointerPhase::Up => gestures::Phase::Up,
            PointerPhase::Cancel => gestures::Phase::Cancel,
        };
        let size = self.size.0.max(1.0);
        if mine {
            // onUpdate and onEnd: the pan's velocityX / size × 2, read again at the lift.
            if let gestures::Event::Start(pan) | gestures::Event::Update(pan) | gestures::Event::End(pan) = self.pan.event(*id, gp, *x, *y, *at_ms, true) {
                self.flick = pan.velocity_x / size * 2.0;
            }
        }
        let p = self.ndc(*x, *y);
        match phase {
            PointerPhase::Down => {
                self.touch_down(p);
                self.down = p;
                self.angle_at_down = self.angle;
                self.drag_from = (p.0, self.angle);
                self.dragging = false;
                self.at = None;
                self.flick = 0.0;
            }
            PointerPhase::Move => {
                self.at = Some(p);
                if self.held == Some(Held::Board) {
                    if !self.dragging && (p.0 - self.drag_from.0).abs() > BOARD_DRAG_SLOP {
                        self.dragging = true;
                        self.drag_from = (p.0, self.angle);
                    }
                    if self.dragging {
                        self.angle = self.drag_from.1 + (p.0 - self.drag_from.0) * BOARD_DRAG_GAIN;
                        self.speed = 0.0;
                    }
                }
            }
            PointerPhase::Up => {
                if self.fingers == 0 {
                    self.primary = None;
                    self.released = true;
                }
            }
            PointerPhase::Cancel => {
                // Taken away: let go without firing.
                self.primary = None;
                self.held = None;
                self.dragging = false;
                self.released = false;
            }
        }
    }

    fn children_mode(&self) -> ChildrenMode {
        ChildrenMode::Each
    }

    fn child(&mut self, _index: usize, _name: &str, texture: Option<&wgpu::TextureView>, _frame: [f32; 4]) {
        self.probe.child(texture);
    }

    fn submitted(&mut self) {
        self.probe.submitted();
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.figure.submitted();
        }
    }

    fn placement(&self, _index: usize) -> Option<exact_gpu::Placement> {
        Some(crate::probe::hidden())
    }

    fn render(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        if self.model.is_none() {
            return false;
        }
        self.size = (frame.width, frame.height);
        let now = frame.now_ms;
        let dt = self.last_ms.map_or(0.0, |l| ((now - l) / 1000.0).clamp(0.0, 0.1) as f32);
        self.last_ms = Some(now);
        let reduced = self.reduced;
        if reduced {
            // Reduce Motion clears the touch every frame (mascot-scene-core.ts): a press, a
            // release or a drag cut off by the switch leaves no squash and no paused spring.
            self.held = None;
            self.released = false;
            self.dragging = false;
        }

        // The release: a poke sets him off; a board tap, drag or flick picks the quarter and
        // confuses him; any is felt.
        if self.released {
            self.released = false;
            if let Some(kind) = self.held {
                self.haptic(if kind == Held::Ghost { "rigid" } else { "selection" });
                if kind == Held::Ghost {
                    // Mid-reaction, the new beat starts from where he is.
                    let f = &mut self.flee;
                    f.from = f.last_away;
                    f.at = Some(now);
                    f.dir = f.next_dir;
                    f.side = f.next_side;
                    f.carry_was = f.shove;
                    f.carry_pending = true;
                } else {
                    let before = self.quarters;
                    let across = self.at.is_some_and(|a| (a.0 - self.down.0).abs() > BOARD_DRAG_SLOP);
                    let swiped = self.dragging || across;
                    if swiped {
                        self.speed = self.flick * BOARD_DRAG_GAIN;
                    }
                    self.quarters = board_turn_on_release(self.quarters, self.down, self.at, self.dragging, self.angle, self.angle_at_down, self.flick);
                    if self.quarters != before {
                        let c = &mut self.confusion;
                        c.dizzy = if swiped { (c.dizzy + 1.0).max(DIZZY_SWIPE).min(DIZZY_MAX) } else { (c.dizzy + 1.0).min(DIZZY_MAX) };
                        c.dizzy_on = swiped || c.dizzy_on || c.dizzy >= DIZZY_ON;
                        c.at = Some(now);
                        c.from = c.shown;
                        // Alternates from rest, so two spins do not replay the same shrug.
                        if c.shown < 0.01 {
                            c.dir = -c.dir;
                            c.clock = 0.0;
                        }
                    }
                }
            }
            self.held = None;
            self.dragging = false;
        }
        // The board's spring toward the quarter, stepped finely.
        let want = self.quarters * BOARD_QUARTER;
        if !self.dragging && (self.angle != want || self.speed != 0.0) {
            let omega = 4.0 / (BOARD_DAMPING * BOARD_TURN_SEC);
            let mut left = dt;
            while left > 0.0 {
                let h = left.min(BOARD_STEP_SEC);
                let accel = omega * omega * (want - self.angle) - 2.0 * BOARD_DAMPING * omega * self.speed;
                self.speed += accel * h;
                self.angle += self.speed * h;
                left -= BOARD_STEP_SEC;
            }
            if (want - self.angle).abs() < 1e-4 && self.speed.abs() < 1e-3 {
                self.angle = want;
                self.speed = 0.0;
            }
        }
        // The press squash: in over 80 ms, out over 160, eased.
        let press_want = if self.held.is_some() { 1.0 } else { 0.0 };
        let rate = dt / if press_want > self.press { PRESS_IN_SEC } else { PRESS_OUT_SEC };
        self.press = (self.press + (press_want - self.press).clamp(-rate, rate)).clamp(0.0, 1.0);
        if press_want > 0.0 {
            self.press_kind = self.held;
        } else if self.press == 0.0 {
            self.press_kind = None;
        }
        let press_shown = smooth(self.press);

        // The clip.
        if self.play && self.started.is_none() {
            self.started = Some(now);
        }
        let elapsed = if reduced { morph_length() + 0.001 } else { self.started.map_or(0.0, |s| ((now - s) / 1000.0) as f32) };
        let settled = elapsed > morph_length();
        let clip = clip_time_at(elapsed);
        if self.started.is_some() && !reduced {
            if let Some(prev) = self.last_clip {
                if clip > prev && clip - prev < 0.25 {
                    // Every beat crossed (morphHapticsBetween), not only the last.
                    for (_, kind) in MORPH_HAPTICS.iter().filter(|(at, _)| *at > prev && *at <= clip) {
                        self.felt.push_back(*kind);
                    }
                }
            }
            self.last_clip = Some(clip);
        }

        // The poke's beat, and the board's confusion.
        let flee_age = self.flee.at.map(|at| ((now - at) / 1000.0) as f32);
        let react = flee_age.filter(|a| *a < REACT_TOTAL).map(reaction_at);
        if self.flee.at.is_some() && react.is_none() {
            self.flee.at = None;
            self.flee.from = 0.0;
        }
        let (away, flee_speed) = match (react, flee_age) {
            (Some(_), Some(age)) => flight_at(age, self.flee.from),
            _ => (0.0, 0.0),
        };
        let mut confuse = 0.0;
        if let Some(at) = self.confusion.at {
            let age = ((now - at) / 1000.0) as f32;
            let span = BOARD_TURN_SEC + CONFUSE_TAIL;
            if age >= span {
                self.confusion.at = None;
            } else if age < 0.12 {
                confuse = self.confusion.from + (1.0 - self.confusion.from) * smooth(age / 0.12);
            } else {
                confuse = smooth(1.0 - (age - 0.12) / (span - 0.12));
            }
        }
        self.confusion.shown = confuse;
        if confuse > 0.0 {
            self.confusion.clock += dt;
        }

        let model = self.model.as_mut().unwrap();
        model.scene.pose(clip);
        {
            let b = &mut model.scene.nodes[model.board];
            b.r = b.rest.1 * Quat::from_rotation_y(self.angle);
            let bs = 1.0 - if self.press_kind == Some(Held::Board) { PRESS_SQUASH_BOARD * press_shown } else { 0.0 };
            b.s = b.rest.2 * bs;
        }
        let mut worlds = std::mem::take(&mut model.worlds);
        model.scene.worlds_into(&mut worlds);

        // The camera: ToonCam's own place and aim, its FOV rebuilt from the
        // 40 mm lens on a 36 mm sensor and tightened by FRAME_ZOOM.
        let (w, h) = (frame.width.max(1.0), frame.height.max(1.0));
        let aspect = w / h;
        let h_fov = 2.0 * (SENSOR / 2.0 / CAM_LENS).atan();
        let zoomed = 2.0 * ((h_fov / 2.0).tan() / FRAME_ZOOM).atan();
        let v_fov = 2.0 * ((zoomed / 2.0).tan() / aspect).atan();
        let cam = worlds[model.camera];
        let view_proj = Mat4::perspective_rh(v_fov, aspect, 0.1, 1000.0) * cam.inverse();
        self.inv_view_proj = Some(view_proj.inverse());
        let (cam_right, cam_up, cam_fwd) = (cam.x_axis.truncate().normalize(), cam.y_axis.truncate().normalize(), cam.z_axis.truncate().normalize());

        // The flee: out along the poke, up in an arc, bowed sideways, kept in the frame.
        let f = &mut self.flee;
        let mut side = cam_right - f.dir * cam_right.dot(f.dir);
        if side.length_squared() > 1e-6 {
            side = side.normalize();
        }
        let beat = flee_age.map_or(0.0, |a| (a / REACT_TOTAL).min(1.0));
        let bow = bell(beat) * if f.side == 0.0 { 1.0 } else { f.side };
        let mut shove = f.dir * (away * FLEE_DIST) + cam_up * (react.map_or(0.0, |r| r.lift) * FLEE_LIFT) + side * (bow * FLEE_CURVE);
        if f.carry_pending {
            f.carry = f.carry_was - shove;
            f.carry_at = Some(now);
            f.carry_pending = false;
            f.carry_rot = true;
        }
        let mut carry_w = 0.0;
        if let Some(at) = f.carry_at {
            let u = ((now - at) / 1000.0) as f32 / CARRY_FADE;
            if u >= 1.0 {
                f.carry_at = None;
            } else {
                carry_w = (1.0 - u).powi(2) * (1.0 + 2.0 * u);
                shove += f.carry * carry_w;
            }
        }
        if shove.length_squared() > 1e-8 {
            let rest = worlds[model.ghost].w_axis.truncate();
            let at = rest + shove;
            let p_rest = view_proj.project_point3(rest);
            let p_at = view_proj.project_point3(at);
            let pad_x = (view_proj.project_point3(at + cam_right * GHOST_WORLD_RADIUS).x - p_at.x).abs();
            let pad_y = (view_proj.project_point3(at + cam_up * GHOST_WORLD_RADIUS).y - p_at.y).abs();
            let scale = frame_fit(p_at.x, p_rest.x, (FRAME_LIMIT_X - pad_x).max(0.05)).min(frame_fit(p_at.y, p_rest.y, (FRAME_LIMIT_Y - pad_y).max(0.05)));
            if scale < 1.0 {
                let along = shove.dot(cam_fwd);
                shove = cam_fwd * along + (shove - cam_fwd * along) * scale;
            }
        }
        f.shove = shove;
        f.last_away = away;
        // Lean and stretch from the flight's speed, smoothed.
        let moving = react.is_some();
        let lean_want = if moving { (-flee_speed * LEAN_PER_SPEED).clamp(-LEAN_MAX, LEAN_MAX) } else { 0.0 };
        let stretch_want = if moving { (flee_speed.abs() * STRETCH_PER_SPEED).clamp(-STRETCH_MAX, STRETCH_MAX) } else { 0.0 };
        let follow = if dt > 0.0 { (dt * 18.0).min(1.0) } else { 1.0 };
        f.lean += (lean_want - f.lean) * follow;
        f.stretch += (stretch_want - f.stretch) * follow;

        // The figure turns toward the board once settled, on Ghost_Root (no animation track).
        let shift = Mat4::from_translation(shove);
        let root_rest = model.scene.nodes[model.ghost].rest;
        let parent = model.scene.nodes[model.ghost].parent.map_or(Mat4::IDENTITY, |p| worlds[p]);
        if settled {
            let board_at = worlds[model.board].w_axis.truncate();
            let head_at = (shift * worlds[model.ghost]).w_axis.truncate();
            let (_, parent_q, _) = parent.to_scale_rotation_translation();
            let mut want = (root_rest.1.inverse() * (parent_q.inverse() * (board_at - head_at).normalize())).normalize();
            let fwd = Vec3::new(0.0, 0.4897, 0.7919).normalize();
            let angle = fwd.dot(want).clamp(-1.0, 1.0).acos();
            if angle > HEAD_TURN_MAX {
                want = fwd.lerp(want, HEAD_TURN_MAX / angle).normalize();
            }
            let face_want = Quat::from_rotation_arc(fwd, want);
            self.face = self.face.slerp(face_want, if dt > 0.0 { (dt * 2.2).min(1.0) } else { 1.0 });
        }
        let twist_raw = -bow * FLEE_SPIN;
        if f.carry_rot {
            f.carry_twist = f.twist_shown - twist_raw;
        }
        f.twist_shown = twist_raw + f.carry_twist * carry_w;
        let squash = 1.0 - if self.press_kind == Some(Held::Ghost) { PRESS_SQUASH_GHOST * press_shown } else { 0.0 };
        {
            let g = &mut model.scene.nodes[model.ghost];
            g.r = root_rest.1
                * self.face
                * Quat::from_rotation_y(f.twist_shown)
                * Quat::from_rotation_x(f.lean)
                * Quat::from_rotation_z(self.confusion.dir * CONFUSE_COCK * confuse);
            g.s = root_rest.2 * squash * Vec3::new(1.0 - f.stretch * 0.5, 1.0 + f.stretch, 1.0 - f.stretch * 0.5);
        }
        model.scene.worlds_into(&mut worlds);
        for (i, w) in worlds.iter_mut().enumerate() {
            if model.fled[i] {
                *w = shift * *w;
            }
        }

        // The eyes: the clip's tables through the opening, then a live look-at at the board,
        // handed over; the poke's glance and scowl, the confusion's dart and swirl, the blinks.
        let scowl_raw = react.map_or(0.0, |r| r.scowl);
        if f.carry_rot {
            f.carry_scowl = f.scowl_shown - scowl_raw;
        }
        let scowl = scowl_raw + f.carry_scowl * carry_w;
        f.scowl_shown = scowl;
        let fr = clip * CLIP_FPS;
        let q = model.quant.max(1e-6);
        let head_c = Vec3::new(0.0, sample_at(&EYE_CZ_T, fr) / q, -sample_at(&EYE_CY_T, fr) / q);
        let show = if fr < EYES_APPEAR_FRAME { 0.0 } else { 1.0 };
        let blinks = self.blinks.get_or_insert_with(|| Blinks::new(now as u32 ^ 0x9e37_79b9));
        let life = if reduced { 1.0 } else { blinks.step(dt) };
        if settled && life > 0.999 {
            self.blinks_joined = true;
        }
        let authored = sample_at(&EYE_OPEN_T, fr);
        let open = if settled && self.blinks_joined { authored.min(life) } else { authored } * (1.0 - 0.22 * scowl);
        let frown = scowl * (open * 2.0 - 0.2).clamp(0.0, 1.0);
        let glance_raw = react.map_or(0.0, |r| f.side * GLANCE_YAW * r.gaze);
        if f.carry_rot {
            f.carry_glance = f.glance_shown - glance_raw;
        }
        let glance = glance_raw + f.carry_glance * carry_w;
        f.glance_shown = glance;
        f.carry_rot = false;
        let mut yaw = sample_at(&EYE_YAW_T, fr);
        let mut pitch = sample_at(&EYE_PITCH_T, fr);
        if settled {
            let veil = worlds[model.veil];
            let head = veil.transform_point3(veil::to_y(veil::HEAD_C) / q);
            let board_at = worlds[model.board].w_axis.truncate();
            let (_, mesh_q, _) = veil.to_scale_rotation_translation();
            let d = mesh_q.inverse() * (board_at - head).normalize();
            let want = Vec3::new(d.x, -d.z, d.y).normalize();
            let solved = solve_aim(want, Vec3::new(0.365737, -0.791448, 0.489742), self.aim.map(|_| self.aim_prev));
            self.aim_prev = solved;
            let (mut ay, mut ap) = self.aim.unwrap_or_else(|| {
                self.aim_at = now;
                (yaw, pitch)
            });
            let k = if dt > 0.0 { (dt * 7.0).min(1.0) } else { 1.0 };
            ay += (solved.0 - ay) * k;
            ap += (solved.1 - ap) * k;
            self.aim = Some((ay, ap));
            let h = smooth((((now - self.aim_at) / 1000.0) as f32 / AIM_HANDOVER).min(1.0));
            yaw += (ay - yaw) * h;
            pitch += (ap - pitch) * h;
        }
        let c = &self.confusion;
        let dart = if confuse > 0.0 { (c.clock * CONFUSE_DART_HZ * std::f32::consts::TAU).sin() * CONFUSE_DART * confuse } else { 0.0 };
        let swirl = if confuse > 0.0 {
            let spin = c.clock / (BOARD_TURN_SEC + CONFUSE_TAIL) * HYPNO_TURNS * std::f32::consts::TAU;
            let r = HYPNO_RADIUS * confuse;
            (spin.cos() * r, spin.sin() * r * veil::PUPIL_SQ)
        } else {
            (0.0, 0.0)
        };
        let off = sample_at(&EYE_YAW_T, fr) - gaze_rest_at(fr);
        let eyes = veil::solve_clip(yaw + glance + dart, pitch, open, frown, off, sample_at(&PUP_R_T, fr), sample_at(&PUP_U_T, fr), swirl, (yaw, pitch));

        // He sees birds: taps drain away; the birds ride the head as drawn.
        let c = &mut self.confusion;
        c.dizzy = (c.dizzy - DIZZY_DRAIN * dt).max(0.0);
        c.dizzy_on = if c.dizzy_on { c.dizzy >= DIZZY_OFF } else { c.dizzy >= DIZZY_ON };
        let root = worlds[model.ghost];
        let pops = self.birds.update(
            dt,
            c.dizzy_on,
            root.transform_point3(BIRD_HEAD_LOCAL),
            root.x_axis.truncate().length() * BIRD_HEAD_RADIUS_LOCAL,
            view_proj,
            reduced,
        );
        // Each bird's pop, its own rising pattern (use-pop-haptics.ts on iOS).
        for (order, pattern) in crate::pulsar::POPS.iter().enumerate() {
            if pops & (1 << order) != 0 {
                self.patterns.extend(pattern.messages());
            }
        }

        // Pipelines and buffers, once per format and shader generation.
        let prims = model.prims.len();
        if !self.gpu.as_ref().is_some_and(|g| g.figure.fits(format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation, model));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let fig = &mut gpu.figure;
        let tone = |t: f32| scene::v4(scene::tone_at(scene::GHOST_BG, scene::GHOST_INK, t));
        let lin = |c: u32| scene::v4(scene::linear(c));
        let v4 = |v: Vec3| [v.x, v.y, v.z, 0.0];
        fig.scene(&shaders::figure::Scene {
            view_proj: view_proj.to_cols_array_2d(),
            key: v4(Vec3::new(0.0695, -0.0872, 0.9938).normalize()),
            eye_dark: scene::v4(scene::eye_dark()),
            pupil: [veil::PUPIL_TONE, veil::PUPIL_TONE, veil::PUPIL_TONE, 1.0],
            contour: lin(birds::CONTOUR),
            head: [head_c.x, head_c.y, head_c.z, show],
            lid: [eyes.top_arc, eyes.bot_arc, eyes.lid_lift, eyes.cap_half],
            lid2: [eyes.corner, eyes.squint, veil::EYE_SOFT, veil::PUPIL_SQ],
            eye_u0: v4(eyes.u[0]),
            eye_r0: v4(eyes.r[0]),
            eye_d0: v4(eyes.d[0]),
            eye_u1: v4(eyes.u[1]),
            eye_r1: v4(eyes.r[1]),
            eye_d1: v4(eyes.d[1]),
            shape0: [eyes.rad[0], eyes.sq[0], eyes.glint_r[0], eyes.frown[0]],
            shape1: [eyes.rad[1], eyes.sq[1], eyes.glint_r[1], eyes.frown[1]],
            pupil_at: [eyes.pupil_at[0][0], eyes.pupil_at[0][1], eyes.pupil_at[1][0], eyes.pupil_at[1][1]],
        });
        self.calls.clear();
        for (k, mp) in model.prims.iter().enumerate() {
            if model.scene.nodes[mp.node].hidden {
                continue;
            }
            let p = &model.scene.prims[mp.prim];
            let m = worlds[mp.node];
            let normal = Mat4::from_mat3(glam::Mat3::from_mat4(m).inverse().transpose());
            let (lit, mid, shade, mode) = match mp.shade {
                Shade::Flat(c) => (lin(c), [0.0; 4], [0.0; 4], 0.0),
                Shade::Toon => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 1.0),
                Shade::Veil => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 2.0),
            };
            let mut wts = [[0.0f32; 4]; 14];
            for (i, x) in model.scene.nodes[mp.node].weights.iter().take(p.targets.len().min(figure::MAX_TARGETS)).enumerate() {
                wts[i / 4][i % 4] = *x;
            }
            fig.draw(
                k,
                &shaders::figure::Draw {
                    model: m.to_cols_array_2d(),
                    normal: normal.to_cols_array_2d(),
                    lit,
                    mid,
                    shade,
                    mode: [mode, p.targets.len() as f32, p.base.len() as f32, 0.0],
                    weights: wts,
                },
            );
            self.calls.push(Call { mesh: k, slot: k, outlined: false });
        }
        for (k, d) in self.birds.draws().iter().enumerate() {
            let mesh = prims + birds::PARTS.iter().position(|p| *p == d.part).unwrap();
            let bands = |c: [u32; 3]| (lin(c[0]), lin(c[1]), lin(c[2]));
            let ((lit, mid, shade), mode) = match d.look {
                Look::Body => (bands(birds::BODY), 3.0),
                Look::Beak => (bands(birds::BEAK), 3.0),
                Look::Ink => ((lin(birds::CONTOUR), [0.0; 4], [0.0; 4]), 0.0),
            };
            let normal = Mat4::from_mat3(glam::Mat3::from_mat4(d.model).inverse().transpose());
            fig.draw(
                prims + k,
                &shaders::figure::Draw {
                    model: d.model.to_cols_array_2d(),
                    normal: normal.to_cols_array_2d(),
                    lit,
                    mid,
                    shade,
                    mode: [mode, 0.0, 0.0, birds::CONTOUR_WIDTH],
                    weights: [[0.0; 4]; 14],
                },
            );
            self.calls.push(Call { mesh, slot: prims + k, outlined: d.look != Look::Ink });
        }

        // The glow: WelcomeTacticsAura over the whole canvas, its two layers
        // crossfaded by the breath, in the page's scheme.
        self.probe.frame(device, encoder);
        let pal = if self.probe.light() == Some(true) { scene::LIGHT } else { scene::DARK };
        // The breath starts at 0 on mount and again when Reduce Motion changes (its effect).
        if self.aura_from.is_none_or(|(_, r)| r != reduced) {
            self.aura_from = Some((now, reduced));
        }
        let breath = if reduced {
            AURA_STILL
        } else {
            let k = (now - self.aura_from.map_or(now, |(t, _)| t)) / AURA_BREATH_MS;
            let x = k.fract() as f32;
            let x = if (k.floor() as i64) % 2 == 0 { x } else { 1.0 - x };
            0.5 - 0.5 * (std::f32::consts::PI * x).cos()
        };
        let (pw, ph) = frame.pixels();
        let mut contact = lin(pal.glow_contact);
        contact[3] = 1.0;
        let glow_at = fig.extra_at(GLOW);
        shaders::composite::Glow {
            rect: [w, h, 0.0, 0.0],
            params: [w, breath, 0.0, pal.halo_gain],
            halo: lin(pal.glow_halo),
            core: lin(pal.glow_core),
            contact,
            extra: [pal.contact_gain, if format.is_srgb() { 1.0 } else { 0.0 }, pw as f32, ph as f32],
            origin: [0.0; 4],
            stage: [0.0; 4],
        }
        .write(fig.block(glow_at, shaders::composite::Glow::SIZE));
        // The board's linework, BOARD_LINE_PX (0.6 pt) wide whatever its distance.
        let mut ends = [[0.0f32; 4]; 32];
        for (k, (node, a, b)) in model.lines.iter().take(16).enumerate() {
            let m = view_proj * worlds[*node];
            ends[k * 2] = (m * a.extend(1.0)).to_array();
            ends[k * 2 + 1] = (m * b.extend(1.0)).to_array();
        }
        let lines_at = fig.extra_at(LINES);
        shaders::lines::Lines { ends, view: [pw as f32, ph as f32, BOARD_LINE_PT * frame.scale, model.lines.len() as f32], color: [1.0, 1.0, 1.0, 1.0] }
            .write(fig.block(lines_at, shaders::lines::Lines::SIZE));
        model.worlds = worlds;

        let line_count = model.lines.len().min(16) as u32;
        let (lines, lines_bind) = (&gpu.lines, &gpu.lines_bind);
        gpu.figure.scene_pass(device, queue, encoder, (pw, ph), &self.calls, |pass| {
            if line_count > 0 {
                pass.set_pipeline(lines);
                pass.set_bind_group(0, lines_bind, &[]);
                pass.draw(0..6, 0..line_count);
            }
        });
        let (resolved, epoch) = gpu.figure.resolved().unwrap();
        if gpu.composite_bind.as_ref().map(|b| b.0) != Some(epoch) {
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("mascot composite"),
                layout: &gpu.composite_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: shaders::composite::G.binding,
                        resource: gpu.figure.binding(gpu.figure.extra_at(GLOW), shaders::composite::Glow::SIZE),
                    },
                    wgpu::BindGroupEntry { binding: shaders::composite::SCENE.binding, resource: wgpu::BindingResource::TextureView(resolved) },
                ],
            });
            gpu.composite_bind = Some((epoch, bind));
        }
        gfx::pass(encoder, "mascot composite", target, &gpu.composite, &gpu.composite_bind.as_ref().unwrap().1);
        // The float loops and the glow breathes for as long as the card shows; under Reduce Motion
        // (no float, the glow held) the surface stops asking once its frames stop changing and the
        // scheme is read (as aura.rs).
        let still = self.still.note(gpu.figure.fingerprint(), now) && self.probe.light().is_some();
        !(reduced && still) || self.probe.pending()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, model: &Model) -> Gpu {
    let bird_meshes = birds::meshes();
    let mut meshes: Vec<MeshData> = model
        .prims
        .iter()
        .map(|mp| {
            let p = &model.scene.prims[mp.prim];
            MeshData { vertices: &p.base, indices: &p.indices, targets: &p.targets }
        })
        .collect();
    meshes.extend(bird_meshes.iter().map(|m| MeshData { vertices: &m.vertices, indices: &m.indices, targets: &[] }));
    let mut slots: Vec<Option<usize>> = (0..model.prims.len()).map(Some).collect();
    slots.extend(std::iter::repeat_n(None, birds::MAX_DRAWS));
    let figure = Figure::new(device, format, generation, &meshes, &slots, &[shaders::composite::Glow::SIZE, shaders::lines::Lines::SIZE]);
    let cm = device.create_shader_module(shaders::composite::module());
    let composite_layout = device.create_bind_group_layout(&shaders::composite::GROUP_0);
    let composite =
        gfx::fullscreen(device, format, &cm, &composite_layout, shaders::composite::entry::VS, shaders::composite::entry::FS, None, "mascot composite");
    // The linework: depth-tested against the scene, not written into it, in the scene's MSAA.
    let lm = device.create_shader_module(shaders::lines::module());
    let ll = device.create_bind_group_layout(&shaders::lines::GROUP_0);
    let lpl =
        device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("mascot lines"), bind_group_layouts: &[Some(&ll)], immediate_size: 0 });
    let cache = gfx::pipeline_cache(device);
    let lines = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("mascot lines"),
        layout: Some(&lpl),
        vertex: wgpu::VertexState { module: &lm, entry_point: Some(shaders::lines::entry::VS), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &lm,
            entry_point: Some(shaders::lines::entry::FS),
            targets: &[Some(wgpu::ColorTargetState { format: figure::SCENE_FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: Default::default(),
        depth_stencil: Some(wgpu::DepthStencilState {
            format: figure::DEPTH_FORMAT,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: wgpu::MultisampleState { count: figure::MSAA, ..Default::default() },
        multiview_mask: None,
        cache: cache.handle.as_ref(),
    });
    let lines_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("mascot lines"),
        layout: &ll,
        entries: &[wgpu::BindGroupEntry { binding: shaders::lines::L.binding, resource: figure.binding(figure.extra_at(LINES), shaders::lines::Lines::SIZE) }],
    });
    Gpu { figure, composite, composite_layout, composite_bind: None, lines, lines_bind }
}

/// A new mascot surface, for the registry.
pub fn mascot() -> Box<dyn Surface> {
    Box::new(MascotSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_settled_ghost_blinks_now_and_then() {
        let mut b = Blinks::new(7);
        let mut shut = 0;
        let mut was_open = true;
        for _ in 0..(60 * 30) {
            let open = b.step(1.0 / 60.0);
            if was_open && open < 0.2 {
                shut += 1;
            }
            was_open = open >= 0.2;
        }
        // About one a 4.5 s over 30 s, a double now and then.
        assert!((4..=12).contains(&shut), "{shut} blinks in 30 s");
    }

    #[test]
    fn the_clip_holds_runs_and_floats() {
        assert_eq!(clip_time_at(0.0), sec_of(BEAT.0));
        assert_eq!(clip_time_at(HOLD_SEC), sec_of(BEAT.0));
        // The pre-jump run is 1.4× real time.
        assert!((clip_time_at(HOLD_SEC + 1.0) - (sec_of(BEAT.0) + 1.4)).abs() < 1e-4);
        // The morph ends on the float's first frame and loops inside it.
        assert!((clip_time_at(morph_length()) - sec_of(FLOAT.0)).abs() < 1e-3);
        let late = clip_time_at(morph_length() + 100.0);
        assert!(late >= sec_of(FLOAT.0) && late < sec_of(FLOAT.1));
    }

    #[test]
    fn a_tap_turns_a_quarter_a_drag_follows_a_flick_carries() {
        assert_eq!(board_turn_on_release(0.0, (0.0, 0.0), Some((0.01, 0.0)), false, 0.0, 0.0, 0.0), 1.0);
        assert_eq!(board_turn_on_release(2.0, (0.0, 0.0), Some((0.0, 0.3)), false, 0.0, 0.0, 0.0), 2.0);
        // Dragged to 0.6 of a quarter: the nearest quarter.
        assert_eq!(board_turn_on_release(0.0, (0.0, 0.0), Some((0.6, 0.0)), true, 0.6 * BOARD_QUARTER, 0.0, 0.0), 1.0);
        // A flick carries it on.
        assert_eq!(board_turn_on_release(0.0, (0.0, 0.0), Some((0.3, 0.0)), true, 0.3 * BOARD_QUARTER, 0.0, 2.0), 1.0);
    }

    #[test]
    fn a_poke_bolts_him_out_sulks_and_brings_him_home() {
        // The flinch winds up toward the finger, then he bolts past halfway, holds, comes home.
        assert!(reaction_at(T1 * 0.9).away < 0.0);
        assert_eq!(reaction_at(T2 + 0.01).away, 1.0);
        assert!(reaction_at(T3 + 0.01).gaze > -0.8);
        assert!(reaction_at(REACT_TOTAL).away.abs() < 1e-6);
        // At rest at both ends.
        assert!(flight_at(0.0, 0.0).1.abs() < 0.5);
        assert!(flight_at(REACT_TOTAL - 0.01, 0.0).1.abs() < 0.2);
        // A re-tap from out there goes further; at the ceiling it shudders.
        assert!(flight_at(T2 + 0.05, 1.0).0 > 1.3);
        assert!(flight_at(T2 + 0.05, AWAY_MAX).0 <= AWAY_MAX + SHUDDER_KICK);
    }

    #[test]
    fn the_look_at_solves_the_eye_onto_its_target() {
        let d = Vec3::new(0.365737, -0.791448, 0.489742);
        // Asked for its own axis, no turn.
        let (y, p) = solve_aim(d.normalize(), d, None);
        assert!(y.abs() < 1e-3 && p.abs() < 1e-3);
        // A board below and ahead wants more than the face allows: clamped.
        let (_, p) = solve_aim(Vec3::new(0.0, -0.3, -0.95).normalize(), d, None);
        assert!(p.abs() <= AIM_PITCH_MAX + 1e-6);
    }

    #[test]
    fn the_frame_keeps_him_in_view() {
        assert_eq!(frame_fit(0.3, 0.0, 0.68), 1.0);
        let k = frame_fit(1.0, 0.2, 0.68);
        assert!((0.2 + (1.0 - 0.2) * k - 0.68).abs() < 1e-5);
    }

    #[test]
    fn the_model_reads_its_morphs() {
        let model = Model::load().unwrap();
        let tail = model.scene.prims.iter().find(|p| p.node == model.veil).unwrap();
        assert_eq!(tail.targets.len(), 54);
        assert!(tail.targets.iter().any(|t| t.iter().any(|d| d[0].abs() > 1e-3)));
        assert!((model.quant - 2.0723).abs() < 1e-3);
    }

    /// A still of the settled ghost, read back: something drawn, and the glow round it.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn the_mascot_draws() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut s = MascotSurface::default();
        s.bind(&[Value::Number(1.0), Value::Number(1.0)], None).unwrap();
        let frame = Frame {
            width: 270.0,
            height: 270.0,
            scale: 2.0,
            now_ms: 1000.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(std::path::Path::new(&out).join(format!("mascot-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
        }
        assert!(px.count(|p| p[3] > 250) > 2000, "the ghost and board draw");
        assert!(px.count(|p| p[3] > 4 && p[3] < 200) > 2000, "the glow draws");
    }
}
