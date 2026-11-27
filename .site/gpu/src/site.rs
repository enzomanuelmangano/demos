//! The setup's ghost: the RN app's `Ghost` (src/components/ghost/ghost.tsx, ghost-scene.tsx,
//! paywall-scene-core.ts) on wgpu, shown on the username form, inside the daily goal's ring and
//! over the Pro offer. ghost-site.glb's pawn leaps up as the ghost on a spring (damping 0.62,
//! its overshoot spent as lift and stretch) while the shot closes from the board to his face;
//! then he breathes, sways, and plays the idle loop. He glances toward the plan chosen (`look`),
//! follows a watched point (`gaze`: the goal's number, the ring's arc as it fills, the time
//! wheel), takes a double take at a refused username and holds a look (`reaction`), wears a
//! mood for a goal and hops into it (`mood`), smiles when the ring closes, and reels with the
//! dizzy birds when the plan is flipped four times in 1.6 s. The body dissolves into the page
//! from `fade` down (the app's mask), and the canvas fades in over 260 ms on its first frame.
//!
//! `site(look, reaction, mood, gazeX, gazeY, gazeOn, fill, closed, fadeStart, fadeEnd, reduced)`.
//! `fill` (0..1) is how far the goal's ring fills: when it changes the ghost follows the arc's
//! tip as the ring draws it (420 ms in, 1600 ms inOut cubic, goal-step/index.tsx), and smiles
//! as it closes if `closed`. Publishes `{"pop": n, "kind": k}` as each bird pops.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use glam::{Mat4, Quat, Vec3};

use crate::birds::{self, Birds, Look};
use crate::figure::{Call, Figure, MeshData};
use crate::veil::{self, Face};
use crate::{glb, scene, shaders};

/// The model, embedded: the same file the RN app ships.
pub const GLB: &[u8] = include_bytes!("../models/ghost-site.glb");

// ————— paywall-scene-core.ts —————
const PAWN_FRAME: f32 = 1.0;
const GHOST_FRAME: f32 = 30.0;
const IDLE_TO: f32 = 102.0;
const FPS: f32 = 24.0;
const MORPH_DURATION: f32 = 1.9;
const MORPH_DAMPING_RATIO: f32 = 0.62;
const SPRING_REST: f32 = 0.001;
const BOUNCE_LIFT: f32 = 0.75;
const BOUNCE_STRETCH: f32 = 0.18;
const EYE_FROM: f32 = 0.72;
const EYE_TO: f32 = 0.98;
const REST_PITCH: f32 = 0.4818;
const GAZE_YAW: f32 = 0.17;
const MOOD_HOP: [f32; 4] = [0.0, 0.03, 0.06, 0.11];
const MOOD_HOP_SECONDS: f32 = 0.34;
const FOLLOW_YAW: f32 = 0.42;
const FOLLOW_PITCH: f32 = 0.32;
const FOLLOW_BODY: f32 = 1.0;
const BODY_YAW: f32 = 0.23;
const BODY_LAMBDA: f32 = 5.5;
const FLIPS_NEEDED: usize = 4;
const FAST_WINDOW: f32 = 1.6;
const DIZZY_ONSET: f32 = 0.8;
const DIZZY_PER_FLIP: f32 = 0.2;
const DIZZY_DECAY: f32 = 0.42;
const DIZZY_FROM: f32 = 0.55;
const DIZZY_BIRDS_ON: f32 = 0.7;
const DIZZY_BIRDS_OFF: f32 = 0.45;
const CONFUSE_SPIN_HZ: f32 = 1.6;
const CONFUSE_ORBIT_YAW: f32 = 0.34;
const CONFUSE_ORBIT_PITCH: f32 = 0.2;
const CONFUSE_LOLL: f32 = 0.13;
const CONFUSE_FACE: f32 = 1.08;
const BODY_ROLL: f32 = 0.05;
const TAKE_SECONDS: f32 = 0.35;
const TAKE_LIFT: f32 = 0.14;
const SKEPTIC_LAMBDA: f32 = 14.0;
const SKEPTIC_FACE_LAMBDA: f32 = 12.0;
const SKEPTIC_ROLL: f32 = 0.08;
const SKEPTIC_YAW: f32 = -0.1;
const SKEPTIC_PITCH: f32 = -0.12;
const EYE_LAMBDA: f32 = 14.0;
const FACE_LAMBDA: f32 = 6.0;
/// ghost-rig.ts SPIN.smileSnap: how fast the smile's face arrives.
const SMILE_SNAP: f32 = 18.0;
const REST_BREATH: f32 = 0.045;
const REST_BREATH_HZ: f32 = 0.3;
const BLINK_EVERY: (f32, f32) = (2.6, 6.2);
const BLINK_DOWN: f32 = 0.07;
const BLINK_UP: f32 = 0.16;
const IDLE_SWAY: f32 = 0.035;
const IDLE_SWAY_HZ: f32 = 0.13;
const FACE_FILL: f32 = 0.39;
const FACE_DROP: f32 = 0.3;
const REST_DROP: f32 = 1.25;
const WIDE_PULL: f32 = 0.7;
/// The head, measured in Blender (its axes), and its radius.
const HEAD_CENTRE: Vec3 = Vec3::new(0.0, -1.062, 2.033);
const HEAD_RADIUS: f32 = 1.795 / 2.0;
/// The flat materials (MeshBasicMaterial hex, sRGB).
const INK: u32 = 0x040404;
const LINEWORK: u32 = 0xffffff;
const TILE_DARK: u32 = 0x8c6a5c;
const TILE_LIGHT: u32 = 0xd0b5a4;
/// ghost.tsx: the canvas fades in over 260 ms on its first frame.
const SHOWN_MS: f64 = 260.0;

// ————— goal-step/index.tsx —————
const RING_IN_MS: f64 = 420.0;
const FILL_MS: f64 = 1600.0;
const SMILE_IN_MS: f64 = 120.0;
const SMILE_HOLD_MS: f64 = 1100.0;
const SMILE_OUT_MS: f64 = 260.0;

/// GHOST_REACTION.
const REACTION_PROFANE: i32 = 2;

fn approach(value: f32, target: f32, lambda: f32, dt: f32) -> f32 {
    value + (target - value) * (1.0 - (-lambda * dt).exp())
}

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let k = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    k * k * (3.0 - 2.0 * k)
}

/// Easing.inOut(Easing.quad), Reanimated's default timing.
fn in_out_quad(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

/// Easing.inOut(Easing.cubic).
fn in_out_cubic(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Shade {
    Flat(u32),
    Toon,
    Veil,
}

struct Model {
    scene: glb::Scene,
    /// Each primitive's shading.
    shades: Vec<Shade>,
    /// Whether each primitive is the board's (hidden once the close shot would catch it).
    board: Vec<bool>,
    quant: f32,
    camera: (Vec3, Vec3),
    worlds: Vec<Mat4>,
}

impl Model {
    fn load() -> Result<Model, String> {
        let scene = glb::Scene::load(GLB, "ghost-site.glb", "")?;
        let pivot = scene.named("Board_Pivot").ok_or("ghost-site.glb: no Board_Pivot")?;
        let veil = scene.named("Ghost_Tail_Baked").ok_or("ghost-site.glb: no Ghost_Tail_Baked")?;
        let cam = scene.named("ToonCam").ok_or("ghost-site.glb: no ToonCam")?;
        let shades = scene
            .prims
            .iter()
            .map(|p| match p.material.as_str() {
                "Ghost_Fill" => Shade::Toon,
                "Ghost_Fill_Veil" => Shade::Veil,
                "Ghost_Outline" => Shade::Flat(LINEWORK),
                "Tile_Dark" => Shade::Flat(TILE_DARK),
                "Tile_Light" => Shade::Flat(TILE_LIGHT),
                _ => Shade::Flat(INK),
            })
            .collect();
        let board = scene.prims.iter().map(|p| scene.under(p.node, pivot)).collect();
        // The mesh is quantized: in units of its node's scale (extras.quantScale).
        let quant = scene.nodes[veil].rest.2.x;
        let n = &scene.nodes[cam];
        Ok(Model { shades, board, quant, camera: (n.rest.0, n.rest.1 * Vec3::NEG_Z), worlds: Vec::new(), scene })
    }
}

/// The shot: wide on the board (the pawn) to close on the face, by `closing`.
struct Shot {
    wide_from: Vec3,
    wide_look: Vec3,
    face_from: Vec3,
    face_look: Vec3,
    head: Vec3,
}

impl Shot {
    fn new(camera: (Vec3, Vec3)) -> Shot {
        let (at, forward) = camera;
        let wide_from = at - forward * WIDE_PULL;
        // glTF is Y-up and Blender Z-up: (x, y, z) becomes (x, z, -y).
        let head = Vec3::new(HEAD_CENTRE.x, HEAD_CENTRE.z, -HEAD_CENTRE.y);
        let half_fov = Y_FOV / 2.0;
        let face_look = head - Vec3::Y * FACE_DROP;
        let face_from = face_look - forward * (HEAD_RADIUS / FACE_FILL / half_fov.tan());
        let wide_look = wide_from + forward * 10.0 + Vec3::Y * REST_DROP;
        Shot { wide_from, wide_look, face_from, face_look, head }
    }

    fn view(&self, closing: f32) -> Mat4 {
        let eye = self.wide_from.lerp(self.face_from, closing);
        let look = self.wide_look.lerp(self.face_look, closing);
        Mat4::look_at_rh(eye, look, Vec3::Y)
    }
}

/// ToonCam's vertical field of view (the file's camera, square).
const Y_FOV: f32 = 0.845_707_8;

/// What the canvas is told.
#[derive(Clone, Copy, PartialEq, Default)]
struct Inputs {
    look: f32,
    reaction: i32,
    mood: i32,
    gaze: (f32, f32, f32),
    fill: f32,
    closed: bool,
    fade: (f32, f32),
    reduced: bool,
    /// reactiive.io /apps: back to the pawn (the leap run backwards), and up again when it clears.
    pawn: bool,
}

/// The ghost.
pub struct SiteSurface {
    /// Under Reduce Motion he comes to rest: then no frames are asked for (gfx::Stillness).
    still: crate::gfx::Stillness,
    model: Option<Model>,
    shot: Option<Shot>,
    at: Inputs,
    birds: Birds,
    gpu: Option<Figure>,
    calls: Vec<Call>,
    publish: Option<String>,
    pops: u32,
    first_ms: Option<f64>,
    last_ms: Option<f64>,
    clock: f32,
    morph: f32,
    morph_speed: f32,
    body_yaw: f32,
    dizzy: f32,
    spin_phase: f32,
    last_aim: Option<f32>,
    flips: [f32; 8],
    flip_count: usize,
    idle_t: f32,
    birds_on: bool,
    yaw: f32,
    pitch: f32,
    face: Face,
    blink_at: f32,
    blink_t: f32,
    seed: u32,
    skeptic: f32,
    reaction_now: i32,
    reaction_shown: i32,
    mood_now: i32,
    mood_t: f32,
    take_t: f32,
    // The goal's ring: where its arc was when it was last asked to go, where to, since when;
    // and the smile its closing started.
    fill_from: f32,
    fill_to: f32,
    fill_at: Option<f64>,
    fill_pending: bool,
    smile_at: Option<f64>,
}

impl Default for SiteSurface {
    fn default() -> SiteSurface {
        SiteSurface {
            still: Default::default(),
            model: None,
            shot: None,
            at: Inputs { fade: (0.62, 0.94), ..Default::default() },
            birds: Birds::default(),
            gpu: None,
            calls: Vec::new(),
            publish: None,
            pops: 0,
            first_ms: None,
            last_ms: None,
            clock: 0.0,
            morph: 0.0,
            morph_speed: 0.0,
            body_yaw: 0.0,
            dizzy: 0.0,
            spin_phase: 0.0,
            last_aim: None,
            flips: [0.0; 8],
            flip_count: 0,
            idle_t: 0.0,
            birds_on: false,
            yaw: 0.0,
            pitch: REST_PITCH,
            face: veil::NEUTRAL,
            blink_at: BLINK_EVERY.0,
            blink_t: -1.0,
            seed: 0x2545_f491,
            skeptic: 0.0,
            reaction_now: 0,
            reaction_shown: 0,
            mood_now: 0,
            mood_t: MOOD_HOP_SECONDS,
            take_t: -1.0,
            fill_from: 0.0,
            fill_to: 0.0,
            fill_at: None,
            fill_pending: false,
            smile_at: None,
        }
    }
}

impl SiteSurface {
    fn random(&mut self) -> f32 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        (self.seed >> 8) as f32 / (1u32 << 24) as f32
    }

    /// Counts a change of plan at `clock` (a point followed is none): FLIPS_NEEDED inside
    /// FAST_WINDOW make him dizzy, the gating one straight to DIZZY_ONSET.
    fn change_of_mind(&mut self, aim: f32, follow: f32, clock: f32) {
        if follow > 0.0 || self.last_aim.is_none() {
            self.last_aim = Some(aim);
        }
        if self.last_aim == Some(aim) {
            return;
        }
        self.last_aim = Some(aim);
        let mut kept = 0;
        for i in 0..self.flip_count {
            if clock - self.flips[i] <= FAST_WINDOW {
                self.flips[kept] = self.flips[i];
                kept += 1;
            }
        }
        self.flip_count = kept.min(self.flips.len() - 1);
        self.flips[self.flip_count] = clock;
        self.flip_count += 1;
        if self.flip_count >= FLIPS_NEEDED {
            self.dizzy = (self.dizzy + DIZZY_PER_FLIP).max(DIZZY_ONSET).min(1.0);
        }
    }

    /// Where the ring's arc is at `now`, 0..1.
    fn progress(&self, now: f64) -> f32 {
        match self.fill_at {
            None => self.fill_from,
            Some(at) => {
                let k = in_out_cubic((now - at - RING_IN_MS) / FILL_MS) as f32;
                self.fill_from + (self.fill_to - self.fill_from) * k
            }
        }
    }

    /// The smile the ring's closing asks for at `now`, 0..1.
    fn smile(&self, now: f64) -> f32 {
        let Some(at) = self.smile_at else { return 0.0 };
        let t = now - at;
        (if t < SMILE_IN_MS {
            in_out_quad(t / SMILE_IN_MS)
        } else if t < SMILE_IN_MS + SMILE_HOLD_MS {
            1.0
        } else {
            1.0 - in_out_quad((t - SMILE_IN_MS - SMILE_HOLD_MS) / SMILE_OUT_MS)
        }) as f32
    }
}

impl Surface for SiteSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) {
        self.gpu = None;
    }

    /// A new size frames it again: its stillness counts from the next frame.
    fn size(&mut self, _width: f32, _height: f32) -> bool {
        self.still.reset();
        false
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        self.still.reset();
        let get = |i: usize, name: &str, or: f64| -> Result<f32, SurfaceError> { Ok(inputs.get(i).map(|v| number(v, name)).transpose()?.unwrap_or(or) as f32) };
        let next = Inputs {
            look: get(0, "look", 0.0)?,
            reaction: get(1, "reaction", 0.0)?.round() as i32,
            mood: (get(2, "mood", 0.0)?.round() as i32).clamp(0, 3),
            gaze: (get(3, "gazeX", 0.0)?, get(4, "gazeY", 0.0)?, get(5, "gazeOn", 0.0)?.clamp(0.0, 1.0)),
            fill: get(6, "fill", 0.0)?.clamp(0.0, 1.0),
            closed: get(7, "closed", 0.0)? > 0.5,
            fade: (get(8, "fadeStart", 0.62)?, get(9, "fadeEnd", 0.94)?),
            reduced: get(10, "reduced", 0.0)? > 0.5,
            pawn: get(11, "pawn", 0.0)? > 0.5,
        };
        if next.fill != self.at.fill {
            // A new aim for the arc: from where it is (none: the choice resets it).
            let now = self.last_ms.unwrap_or(0.0);
            self.fill_from = if next.fill == 0.0 { 0.0 } else { self.progress(now) };
            self.fill_to = next.fill;
            self.fill_at = None;
            self.fill_pending = next.fill > 0.0;
            self.smile_at = None;
        }
        self.at = next;
        if self.model.is_none() {
            let model = Model::load().map_err(SurfaceError)?;
            self.shot = Some(Shot::new(model.camera));
            self.model = Some(model);
        }
        Ok(())
    }

    fn published(&mut self) -> Option<String> {
        self.publish.take()
    }

    fn submitted(&mut self) {
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.submitted();
        }
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
        let now = frame.now_ms;
        let dt = self.last_ms.map_or(1.0 / 60.0, |l| ((now - l) / 1000.0).clamp(0.0, 0.1) as f32);
        self.last_ms = Some(now);
        let first = *self.first_ms.get_or_insert(now);
        if self.fill_pending {
            self.fill_pending = false;
            self.fill_at = Some(now);
        }
        self.clock += dt;
        let clock = self.clock;
        let at = self.at;
        let reduced = at.reduced;

        // 0 pawn, 1 ghost, on a spring; semi-implicit, so a slow frame does not gain energy. `pawn` (reactiive.io)
        // pulls it back to 0: the leap run backwards, critically damped so he settles into the pawn, not past it.
        let morph_to = if at.pawn { 0.0 } else { 1.0 };
        let stiffness = (std::f32::consts::TAU / MORPH_DURATION).powi(2);
        let ratio = if at.pawn { 1.0 } else { MORPH_DAMPING_RATIO };
        let damping = 4.0 * std::f32::consts::PI * ratio / MORPH_DURATION;
        self.morph_speed += (stiffness * (morph_to - self.morph) - damping * self.morph_speed) * dt;
        self.morph += self.morph_speed * dt;
        if ((morph_to - self.morph).abs() < SPRING_REST && self.morph_speed.abs() < SPRING_REST) || reduced {
            self.morph = morph_to;
            self.morph_speed = 0.0;
        }
        self.morph = self.morph.max(0.0);
        let morph = self.morph;
        let clip_at = morph.min(1.0);
        let excess = morph - clip_at;
        let settled = morph >= 1.0;

        let mut lift = excess * BOUNCE_LIFT + if reduced { 0.0 } else { (clock * REST_BREATH_HZ * std::f32::consts::TAU).sin() * REST_BREATH };
        let stretch = 1.0 + excess * BOUNCE_STRETCH;

        // The ring's arc, watched while it fills; its closing, smiled at.
        let progress = self.progress(now);
        let filling = self.fill_at.is_some() && self.fill_to > 0.0 && progress < self.fill_to - 0.002;
        if self.fill_at.is_some() && at.closed && !filling && self.smile_at.is_none() && self.fill_to > 0.0 && progress >= self.fill_to - 0.002 {
            self.smile_at = Some(now);
        }
        let (gaze, follow) = if filling {
            let a = progress * std::f32::consts::TAU;
            ((a.sin(), -a.cos()), 1.0)
        } else {
            ((at.gaze.0, at.gaze.1), at.gaze.2)
        };

        // A change of mind, counted; a watched point is not one.
        let aim = at.look;
        self.change_of_mind(aim, follow, clock);
        self.dizzy = if reduced { 0.0 } else { (self.dizzy - DIZZY_DECAY * dt).max(0.0) };
        let env = smoothstep(DIZZY_FROM, 1.0, self.dizzy);
        if self.dizzy > 0.0 {
            self.spin_phase += dt * CONFUSE_SPIN_HZ;
        } else {
            self.spin_phase = 0.0;
        }
        let orbit = self.spin_phase * std::f32::consts::TAU;
        let dizzy_yaw = orbit.sin() * CONFUSE_ORBIT_YAW * env;
        let dizzy_pitch = orbit.cos() * CONFUSE_ORBIT_PITCH * env;
        let loll = orbit.sin() * CONFUSE_LOLL * env;

        let body_want = if settled && !reduced { (aim * (1.0 - follow) + gaze.0 * follow * FOLLOW_BODY) * BODY_YAW * (1.0 - env) } else { 0.0 };
        self.body_yaw = approach(self.body_yaw, body_want, BODY_LAMBDA, dt);

        // The double take on a refused name, then the held look.
        let wanted = if settled { at.reaction } else { 0 };
        let wants_look = wanted != 0;
        if wants_look && wanted != self.reaction_now {
            self.take_t = 0.0;
        }
        if !wants_look {
            self.take_t = -1.0;
        }
        if wants_look {
            self.reaction_shown = wanted;
        }
        self.reaction_now = wanted;
        self.skeptic = approach(self.skeptic, if wants_look { 1.0 } else { 0.0 }, SKEPTIC_LAMBDA, dt);
        if self.take_t >= 0.0 {
            self.take_t = if self.take_t > TAKE_SECONDS { -1.0 } else { self.take_t + dt };
        }
        let taking = self.take_t >= 0.0;
        if taking && !reduced {
            lift += (self.take_t / TAKE_SECONDS * std::f32::consts::PI).sin() * TAKE_LIFT;
        }
        if at.mood != self.mood_now {
            self.mood_now = at.mood;
            self.mood_t = 0.0;
        }
        self.mood_t = (self.mood_t + dt).min(MOOD_HOP_SECONDS);
        if !reduced && at.mood != 0 && settled {
            lift += (self.mood_t / MOOD_HOP_SECONDS * std::f32::consts::PI).sin() * MOOD_HOP[at.mood as usize];
        }

        // The stage: everything turns, rolls, lifts and stretches about the ghost's base; the
        // turn's axis is kept under the head.
        let turn_axis = -HEAD_CENTRE.y;
        let roll = -self.body_yaw * (BODY_ROLL / BODY_YAW) + loll + if reduced { 0.0 } else { SKEPTIC_ROLL * self.skeptic };
        let stage_at = Vec3::new(-turn_axis * self.body_yaw.sin(), lift, turn_axis * (1.0 - self.body_yaw.cos()));
        let squash = 1.0 / stretch.sqrt();
        let stage = Mat4::from_scale_rotation_translation(
            Vec3::new(squash, stretch, squash),
            Quat::from_rotation_y(self.body_yaw) * Quat::from_rotation_z(roll),
            stage_at,
        );

        self.idle_t = if settled && !reduced { self.idle_t + dt } else { 0.0 };
        let f = if settled { GHOST_FRAME + (self.idle_t * FPS) % (IDLE_TO - GHOST_FRAME) } else { PAWN_FRAME + clip_at * (GHOST_FRAME - PAWN_FRAME) };

        // The eyes: shown as the morph lands; blinks unless reeling.
        let opening = ((morph - EYE_FROM) / (EYE_TO - EYE_FROM)).clamp(0.0, 1.0);
        let mut open = opening;
        if settled && env < 0.15 && !reduced {
            if self.blink_t < 0.0 && clock > self.blink_at {
                self.blink_t = 0.0;
            }
            if self.blink_t >= 0.0 {
                self.blink_t += dt;
                if self.blink_t > BLINK_DOWN + BLINK_UP {
                    self.blink_t = -1.0;
                    let r = self.random();
                    self.blink_at = clock + BLINK_EVERY.0 + r * (BLINK_EVERY.1 - BLINK_EVERY.0);
                } else {
                    open *= if self.blink_t < BLINK_DOWN { 1.0 - self.blink_t / BLINK_DOWN } else { (self.blink_t - BLINK_DOWN) / BLINK_UP };
                }
            }
        }
        let show = opening * opening;

        // The face: the take's, the held look's, a mood's, the smile over all but a take.
        let take_face = Face { w_l: 1.14, w_r: 1.14, h_l: 1.22, h_r: 1.22, ..veil::NEUTRAL };
        let held_face = if self.reaction_shown == REACTION_PROFANE {
            Face { h_l: 0.72, h_r: 1.06, w_r: 1.04, frown_l: 0.45, ..veil::NEUTRAL }
        } else {
            Face { open: 0.4, glint_y: -0.15, ..veil::NEUTRAL }
        };
        let (aimed_face, mix) = if taking { (take_face, 1.0) } else { (held_face, self.skeptic) };
        let looked = veil::NEUTRAL.toward(&aimed_face, mix);
        let moody = match self.mood_now {
            1 => veil::face("dreamy"),
            2 => veil::face("alert"),
            3 => veil::face("wide"),
            _ => looked,
        };
        let smile = if taking { 0.0 } else { self.smile(now) };
        let want = moody.toward(&veil::SMILE, smile);
        let lambda = if taking {
            FACE_LAMBDA * 3.0
        } else if smile > 0.01 {
            SMILE_SNAP
        } else if self.skeptic > 0.01 {
            SKEPTIC_FACE_LAMBDA
        } else {
            FACE_LAMBDA
        };
        self.face = self.face.toward(&want, 1.0 - (-lambda * dt).exp());

        // The look: the plan's side or the watched point, then the side-eye; dizzy, it orbits.
        let side_eye = if taking { 0.0 } else { self.skeptic };
        self.yaw = approach(self.yaw, (aim * GAZE_YAW * (1.0 - follow) + gaze.0 * FOLLOW_YAW * follow) * (1.0 - env) + SKEPTIC_YAW * side_eye, EYE_LAMBDA, dt);
        self.pitch = approach(self.pitch, REST_PITCH + gaze.1 * FOLLOW_PITCH * follow + SKEPTIC_PITCH * side_eye, EYE_LAMBDA, dt);
        let sway = if settled && !reduced { (clock * IDLE_SWAY_HZ * std::f32::consts::TAU).sin() * IDLE_SWAY } else { 0.0 };
        let aim_yaw = self.yaw + sway + dizzy_yaw;
        let aim_pitch = self.pitch + dizzy_pitch;
        let mut shown_face = self.face;
        if env > 0.0 {
            let grow = (CONFUSE_FACE - 1.0) * env;
            shown_face.w_l += grow;
            shown_face.w_r += grow;
            shown_face.h_l += grow;
            shown_face.h_r += grow;
        }
        let eyes = veil::solve(aim_yaw, aim_pitch, aim_yaw, open, &shown_face);

        // The dolly rides the morph, held back so the leap is seen whole first.
        let closing = smoothstep(0.0, 1.0, (morph - 0.45) / 0.55);
        let shot = self.shot.as_ref().unwrap();
        let (w, h) = (frame.width.max(1.0), frame.height.max(1.0));
        let view_proj = Mat4::perspective_rh(Y_FOV, w / h, 0.1, 1000.0) * shot.view(closing);
        let board_visible = closing < 0.75;

        // The birds ride the head as drawn.
        self.birds_on = if self.birds_on { self.dizzy >= DIZZY_BIRDS_OFF } else { self.dizzy >= DIZZY_BIRDS_ON };
        let head = stage.transform_point3(shot.head);
        let pops = self.birds.update(dt, self.birds_on, head, HEAD_RADIUS * stretch, view_proj, reduced);
        for (order, kind) in ["soft", "light", "rigid"].iter().enumerate() {
            if pops & (1 << order) != 0 {
                self.pops += 1;
                self.publish = Some(format!("{{\"pop\":{},\"kind\":\"{}\"}}", self.pops, kind));
            }
        }

        // The pose.
        let model = self.model.as_mut().unwrap();
        model.scene.pose(f / FPS);
        let mut worlds = std::mem::take(&mut model.worlds);
        model.scene.worlds_into(&mut worlds);

        // Pipelines and buffers, once per format and shader generation.
        let prims = model.scene.prims.len();
        if !self.gpu.as_ref().is_some_and(|g| g.fits(format, frame.shader_generation)) {
            let bird_meshes = birds::meshes();
            let mut meshes: Vec<MeshData> =
                model.scene.prims.iter().map(|p| MeshData { vertices: &p.base, indices: &p.indices, targets: &p.targets }).collect();
            meshes.extend(bird_meshes.iter().map(|m| MeshData { vertices: &m.vertices, indices: &m.indices, targets: &[] }));
            let mut slots: Vec<Option<usize>> = (0..prims).map(Some).collect();
            slots.extend(std::iter::repeat_n(None, birds::MAX_DRAWS));
            self.gpu = Some(Figure::new(device, format, frame.shader_generation, &meshes, &slots, &[]));
        }
        let gpu = self.gpu.as_mut().unwrap();

        let tone = |t: f32| scene::v4(scene::tone_at(scene::GHOST_BG, scene::GHOST_INK, t));
        let lin = |c: u32| scene::v4(scene::linear(c));
        let q = model.quant.max(1e-6);
        let head_c = veil::to_y(veil::HEAD_C) / q;
        let v4 = |v: Vec3| [v.x, v.y, v.z, 0.0];
        gpu.scene(&shaders::figure::Scene {
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
        for (i, p) in model.scene.prims.iter().enumerate() {
            if model.scene.nodes[p.node].hidden || (model.board[i] && !board_visible) {
                continue;
            }
            let m = stage * worlds[p.node];
            let normal = Mat4::from_mat3(glam::Mat3::from_mat4(m).inverse().transpose());
            let (lit, mid, shade, mode) = match model.shades[i] {
                Shade::Flat(c) => (lin(c), [0.0; 4], [0.0; 4], 0.0),
                Shade::Toon => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 1.0),
                Shade::Veil => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 2.0),
            };
            let weights = &model.scene.nodes[p.node].weights;
            let mut w = [[0.0f32; 4]; 14];
            for (k, x) in weights.iter().take(p.targets.len().min(crate::figure::MAX_TARGETS)).enumerate() {
                w[k / 4][k % 4] = *x;
            }
            gpu.draw(
                i,
                &shaders::figure::Draw {
                    model: m.to_cols_array_2d(),
                    normal: normal.to_cols_array_2d(),
                    lit,
                    mid,
                    shade,
                    mode: [mode, p.targets.len() as f32, p.base.len() as f32, 0.0],
                    weights: w,
                },
            );
            self.calls.push(Call { mesh: i, slot: i, outlined: false });
        }
        for (k, d) in self.birds.draws().iter().enumerate() {
            let slot = prims + k;
            let mesh = prims + birds::PARTS.iter().position(|p| *p == d.part).unwrap();
            let bands = |c: [u32; 3]| (lin(c[0]), lin(c[1]), lin(c[2]));
            let ((lit, mid, shade), mode) = match d.look {
                Look::Body => (bands(birds::BODY), 3.0),
                Look::Beak => (bands(birds::BEAK), 3.0),
                Look::Ink => ((lin(birds::CONTOUR), [0.0; 4], [0.0; 4]), 0.0),
            };
            let normal = Mat4::from_mat3(glam::Mat3::from_mat4(d.model).inverse().transpose());
            gpu.draw(
                slot,
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
            self.calls.push(Call { mesh, slot, outlined: d.look != Look::Ink });
        }
        model.worlds = worlds;

        let shown = in_out_quad((now - first) / SHOWN_MS) as f32;
        gpu.render(device, queue, encoder, target, frame.pixels(), at.fade, shown, &self.calls);
        // He breathes, sways and floats for as long as he shows; under Reduce Motion none of that
        // runs, and once his frames stop changing the surface asks for no more (as aura.rs).
        let still = self.still.note(gpu.fingerprint(), now);
        !(at.reduced && still)
    }
}

/// A new setup ghost, for the registry.
pub fn site() -> Box<dyn Surface> {
    Box::new(SiteSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn surface(inputs: &[f64]) -> SiteSurface {
        let mut s = SiteSurface::default();
        let values: Vec<Value> = inputs.iter().map(|v| Value::Number(*v)).collect();
        s.bind(&values, None).unwrap();
        s
    }

    #[test]
    fn the_model_reads_its_baked_meshes() {
        let model = Model::load().unwrap();
        let veil = model.scene.named("Ghost_Tail_Baked").unwrap();
        let tail = model.scene.prims.iter().find(|p| p.node == veil).unwrap();
        assert_eq!(tail.targets.len(), 14);
        assert!((model.quant - 1.0644).abs() < 1e-3);
        assert!(model.shades.contains(&Shade::Veil));
        // The board is the pivot's: its tiles among them.
        assert!(model.board.iter().filter(|b| **b).count() >= 6);
    }

    #[test]
    fn the_close_shot_fills_the_frame_with_his_head() {
        let model = Model::load().unwrap();
        let shot = Shot::new(model.camera);
        let vp = Mat4::perspective_rh(Y_FOV, 1.0, 0.1, 1000.0) * shot.view(1.0);
        let top = vp.project_point3(shot.head + Vec3::Y * HEAD_RADIUS);
        let bottom = vp.project_point3(shot.head - Vec3::Y * HEAD_RADIUS);
        // FACE_FILL of the frame's height (2 in NDC), the head a little above centre.
        assert!(((top.y - bottom.y) / 2.0 - FACE_FILL).abs() < 0.02, "{}", (top.y - bottom.y) / 2.0);
        assert!((top.y + bottom.y) / 2.0 > 0.0);
    }

    #[test]
    fn four_quick_changes_of_plan_make_him_dizzy_but_slow_ones_do_not() {
        let mut s = surface(&[-1.0]);
        s.change_of_mind(-1.0, 0.0, 0.0);
        for i in 1..=4 {
            s.change_of_mind(if i % 2 == 1 { 1.0 } else { -1.0 }, 0.0, i as f32 * 0.3);
            assert_eq!(s.dizzy > 0.0, i == 4, "flip {i}");
        }
        assert!(s.dizzy >= DIZZY_BIRDS_ON);
        let mut slow = surface(&[-1.0]);
        slow.change_of_mind(-1.0, 0.0, 0.0);
        for i in 1..=6 {
            slow.change_of_mind(if i % 2 == 1 { 1.0 } else { -1.0 }, 0.0, i as f32 * 0.6);
        }
        assert_eq!(slow.dizzy, 0.0);
        // Following a point is never a change of mind.
        let mut watching = surface(&[0.0]);
        for i in 0..8 {
            watching.change_of_mind(i as f32 * 0.1, 1.0, i as f32 * 0.1);
        }
        assert_eq!(watching.dizzy, 0.0);
    }

    #[test]
    fn the_ring_is_watched_as_it_fills_and_the_smile_holds_then_lets_go() {
        let mut s = surface(&[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6, 1.0]);
        s.fill_at = Some(0.0);
        assert_eq!(s.progress(RING_IN_MS), 0.0);
        assert!((s.progress(RING_IN_MS + FILL_MS / 2.0) - 0.3).abs() < 1e-4);
        assert!((s.progress(RING_IN_MS + FILL_MS) - 0.6).abs() < 1e-6);
        s.smile_at = Some(0.0);
        assert_eq!(s.smile(0.0), 0.0);
        assert_eq!(s.smile(SMILE_IN_MS + 10.0), 1.0);
        assert_eq!(s.smile(SMILE_IN_MS + SMILE_HOLD_MS + SMILE_OUT_MS), 0.0);
    }

    /// Stills of the settled ghost, read back: his head fills the frame, its bottom dissolved.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn the_ghost_draws() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut s = surface(&[0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.62, 0.94, 1.0]);
        let mut frame = Frame {
            width: 190.0,
            height: 190.0,
            scale: 3.0,
            now_ms: 1000.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        fixture::render(&gpu, &mut s, &frame).unwrap();
        frame.now_ms = 1400.0;
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(std::path::Path::new(&out).join(format!("site-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
        }
        let (w, h) = (px.width as usize, px.height as usize);
        let at = |x: usize, y: usize| &px.data[(y * w + x) * 4..(y * w + x) * 4 + 4];
        assert!(px.count(|p| p[3] > 250) > w * h / 10, "his head fills the frame");
        assert!(at(w / 2, h - 2)[3] < 8, "dissolved at the bottom");
        // Two dark eyes on the white face, a little above centre.
        let dark = (h / 4..h * 3 / 5).flat_map(|y| (0..w).map(move |x| (x, y))).filter(|&(x, y)| {
            let p = at(x, y);
            p[3] > 250 && p[0] < 90
        });
        let (left, right) = dark.fold((0, 0), |(l, r), (x, _)| if x < w / 2 { (l + 1, r) } else { (l, r + 1) });
        assert!(left > 200 && right > 200, "eyes {left} {right}");
    }
}
