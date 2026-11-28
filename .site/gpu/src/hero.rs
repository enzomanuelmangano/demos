//! The Home ghost: the RN app's `GhostPerformer` (src/components/ghost/ghost-performer.tsx,
//! hero-scene-core.ts, ghost-rig.ts) on wgpu, beside the rating on Home (rating-hero.tsx:24-44,
//! 226-234: size 152, state `returned`, fill 0.26, ambient scan/nod/lean/eyeRoll/doubleTake,
//! shading `soft`). ghost-site.glb with its board and found-marker hidden, framed on the head
//! (`fill` of the frame), the body in the soft material (shaders/figure.wgsl mode 4), the veil's
//! eyes in the toon with the eyes, every material faded by the rig's presence. The rig and the
//! ambient scheduler are hero_rig.rs.
//!
//! `hero(fill, reduced, visible, state, play, at)`:
//! - `fill` (0.26 on Home): how much of the frame the head fills;
//! - `reduced` 1: the entry move run to rest before the first frame, then held (no bob, no
//!   ambient) and no frame asked for while held;
//! - `visible` 0: off screen, nothing posed, drawn or asked for (lib/scene-visible.ts);
//! - `state` (default "returned"): a ghost-rig state; a change is a transition;
//! - `play`: a move to play now, once per change (a story's gesture);
//! - `at` ≥ 0: a still, deterministic pose: no blink, no ambient, the entry run to rest, then
//!   `play` stepped `at` seconds in at 60 Hz (the parity stories; RN's twin steps the same).
//!
//! Publishes `{"drawn":true}` once, after its first frame.
//!
//! Off Home's launch path, as RN's GhostBoot decodes the model in C++ at launch and its GpuWarm
//! compiles ahead: ghost-site.glb is parsed once per process on a thread started when the first
//! ghost is made ([`preload`]), and the figure's pipelines are compiled on a thread of their own at
//! the first frame (through the device's pipeline cache). Until both are in, the canvas asks for
//! frames and presents none. A seekable clock (tests, stories, the agent) builds in line. Its first
//! frame and its entrance tell warm.rs when Journey's warm-up may start.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, Lifecycle, Surface, SurfaceError, Value};
use glam::{Mat3, Mat4, Quat, Vec3};

use crate::figure::{Call, Figure, MeshData};
use crate::hero_rig::{self as rig, Move, Performer, RigFrame, Tick, FPS, GHOST_FRAME, HOME_AMBIENT};
use crate::{glb, scene, shaders, site, veil};

/// The number of inputs.
pub const INPUTS: usize = 6;

// ————— ghost-rig.ts:13-19 —————
/// Head centre in Blender's axes, and the head's radius in world units.
const HEAD_CENTRE: Vec3 = Vec3::new(0.0, -1.062, 2.033);
const HEAD_RADIUS: f32 = 1.795 / 2.0;
/// The shot aims slightly below the head centre.
const FACE_DROP: f32 = 0.3;
/// Home's framing (rating-hero.tsx: fill 0.26).
const HOME_FILL: f32 = 0.26;

// ————— hero-scene-core.ts:184-193: MeshBasicMaterial hex, sRGB —————
const INK: u32 = 0x040404;
const LINEWORK: u32 = 0xffffff;

/// The frames per second it draws at most (ghost-fps.ts GHOST_CEILING_FPS).
const CEILING_FPS: u32 = 60;
/// The still pose's step (`at`), and the seed every still uses.
const STILL_DT: f64 = 1.0 / 60.0;
const STILL_SEED: u32 = 0x5eed;

#[derive(Clone, Copy, PartialEq)]
enum Shade {
    Flat(u32),
    Soft,
    Veil,
}

struct Model {
    scene: glb::Scene,
    shades: Vec<Shade>,
    /// The board's and the found-marker's (hero-scene-core.ts:198-203): never drawn.
    hidden: Vec<bool>,
    quant: f32,
    /// The camera's position and view direction, posed at GHOST_FRAME.
    view: Mat4,
    worlds: Vec<Mat4>,
}

/// ghost-site.glb, parsed once per process ([`preload`]).
static PARSED: std::sync::OnceLock<Result<glb::Scene, String>> = std::sync::OnceLock::new();

fn parse() -> Result<glb::Scene, String> {
    glb::Scene::load(site::GLB, "ghost-site.glb", "")
}

/// The GLB thread could not be started (or ended without parsing): the first frame parses in line.
static PARSE_INLINE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Starts parsing ghost-site.glb on a thread of its own, once per process (native: the web has no
/// threads and parses at the first frame).
pub fn preload() {
    #[cfg(not(target_arch = "wasm32"))]
    {
        static STARTED: std::sync::Once = std::sync::Once::new();
        STARTED.call_once(|| {
            let started = crate::warm::spawn("hero-glb", || {
                // A panic in the parse leaves PARSED unset: the next frame parses in line and reports it.
                let parsed = std::panic::catch_unwind(|| PARSED.get_or_init(parse).is_ok());
                if parsed.is_err() {
                    PARSE_INLINE.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            });
            if !started {
                PARSE_INLINE.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        });
    }
}

/// The parsed file: at once when `wait` (parsing here, or waiting for the thread) or when the
/// thread could not do it, else only once the thread has finished.
fn parsed(wait: bool) -> Option<&'static Result<glb::Scene, String>> {
    if wait || cfg!(target_arch = "wasm32") || PARSE_INLINE.load(std::sync::atomic::Ordering::SeqCst) {
        Some(PARSED.get_or_init(parse))
    } else {
        PARSED.get()
    }
}

/// The figure for `scene`'s primitives, one uniform slot each.
fn figure(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, scene: &glb::Scene) -> Figure {
    let meshes: Vec<MeshData> = scene.prims.iter().map(|p| MeshData { vertices: &p.base, indices: &p.indices, targets: &p.targets }).collect();
    let slots: Vec<Option<usize>> = (0..meshes.len()).map(Some).collect();
    Figure::new(device, format, generation, &meshes, &slots, &[])
}

impl Model {
    #[cfg(test)]
    fn load(fill: f32) -> Result<Model, String> {
        Model::from(parsed(true).unwrap().clone()?, fill)
    }

    fn from(mut scene: glb::Scene, fill: f32) -> Result<Model, String> {
        let veil = scene.named("Ghost_Tail_Baked").ok_or("ghost-site.glb: no Ghost_Tail_Baked")?;
        let cam = scene.named("ToonCam").ok_or("ghost-site.glb: no ToonCam")?;
        let shades = scene
            .prims
            .iter()
            .map(|p| match p.material.as_str() {
                "Ghost_Fill" => Shade::Soft,
                "Ghost_Fill_Veil" => Shade::Veil,
                "Ghost_Outline" => Shade::Flat(LINEWORK),
                _ => Shade::Flat(INK),
            })
            .collect();
        let off: Vec<usize> =
            (0..scene.nodes.len()).filter(|&i| scene.nodes[i].name.starts_with("Board") || scene.nodes[i].name.starts_with("Found_")).collect();
        let hidden = scene.prims.iter().map(|p| off.iter().any(|&root| scene.under(p.node, root))).collect();
        let quant = scene.nodes[veil].rest.2.x;
        // Posed before the camera is read: the clip carries it (hero-scene-core.ts:247-252).
        scene.pose((GHOST_FRAME / FPS) as f32);
        let worlds = scene.worlds();
        let forward = worlds[cam].transform_vector3(Vec3::NEG_Z).normalize();
        Ok(Model { view: shot(forward, fill), shades, hidden, quant, worlds, scene })
    }
}

/// placeCamera(CAM_REST): back from the face along the file camera's direction, so the head
/// fills `fill` of the frame (hero-scene-core.ts:262-298).
fn shot(forward: Vec3, fill: f32) -> Mat4 {
    let aim = head_world() - Vec3::Y * FACE_DROP;
    let dist = HEAD_RADIUS / fill.max(1e-3) / (Y_FOV / 2.0).tan();
    Mat4::look_at_rh(aim - forward * dist, aim, Vec3::Y)
}

/// glTF is Y-up and Blender Z-up: (x, y, z) becomes (x, z, -y).
fn head_world() -> Vec3 {
    Vec3::new(HEAD_CENTRE.x, HEAD_CENTRE.z, -HEAD_CENTRE.y)
}

/// ToonCam's vertical field of view.
const Y_FOV: f32 = 0.845_707_8;

/// The stage: lifted in head radii, turned on the head's own axis (three's Euler XYZ: flip,
/// spin, tilt), squashed with its volume kept (hero-scene-core.ts:455-461).
fn stage(f: &RigFrame) -> Mat4 {
    let head = head_world();
    let squash = f.squash as f32;
    let wide = 1.0 / squash.sqrt();
    let turn = Quat::from_rotation_x(f.flip as f32) * Quat::from_rotation_y(f.spin as f32) * Quat::from_rotation_z(f.tilt as f32);
    Mat4::from_translation(Vec3::Y * (f.lift as f32 * HEAD_RADIUS))
        * Mat4::from_translation(head)
        * Mat4::from_scale_rotation_translation(Vec3::new(wide, squash, wide), turn, Vec3::ZERO)
        * Mat4::from_translation(-head)
}

/// The rig's face as the veil reads it (its yaw and pitch went into the aim).
fn veil_face(f: &rig::Face) -> veil::Face {
    let c = |i: usize| f[i] as f32;
    veil::Face {
        w_l: c(rig::W_L),
        w_r: c(rig::W_R),
        h_l: c(rig::H_L),
        h_r: c(rig::H_R),
        ang_l: c(rig::ANG_L),
        ang_r: c(rig::ANG_R),
        frown_l: c(rig::FROWN_L),
        frown_r: c(rig::FROWN_R),
        glint_x: c(rig::GLINT_X),
        glint_y: c(rig::GLINT_Y),
        spread: c(rig::SPREAD),
        open: c(rig::OPEN),
        pupil: c(rig::PUPIL),
    }
}

/// What the canvas is told.
#[derive(Clone, PartialEq)]
struct Inputs {
    fill: f32,
    reduced: bool,
    visible: bool,
    state: String,
    play: String,
    at: f64,
}

impl Default for Inputs {
    fn default() -> Inputs {
        Inputs { fill: HOME_FILL, reduced: false, visible: true, state: "returned".into(), play: String::new(), at: -1.0 }
    }
}

/// The Home ghost.
#[derive(Default)]
pub struct HeroSurface {
    model: Option<Model>,
    at: Inputs,
    performer: Option<Performer>,
    /// The still pose (`at` ≥ 0), solved once per change.
    still: Option<RigFrame>,
    still_drawn: bool,
    gpu: Option<Figure>,
    calls: Vec<Call>,
    last_ms: Option<f64>,
    host_hidden: bool,
    host_reduced: bool,
    drawn: bool,
    publish: Option<String>,
    /// The figure being compiled off the main thread: for which device, format and shader
    /// generation, and where it lands.
    #[cfg(not(target_arch = "wasm32"))]
    building: Option<(usize, wgpu::TextureFormat, u32, std::sync::mpsc::Receiver<Figure>)>,
    /// The last render drew nothing because the model or the figure is not in yet.
    waiting: bool,
    /// warm.rs was told the entrance has played (or was given up on).
    settled_told: bool,
    bound: bool,
    error: Option<SurfaceError>,
    /// The module's threads are joined once the last surface holding one goes (warm.rs).
    _lease: crate::warm::Lease,
}

impl HeroSurface {
    /// Journey's warm-up may stop waiting for this ghost: its entrance played, or Home was left first.
    fn settle(&mut self) {
        if !self.settled_told {
            self.settled_told = true;
            crate::warm::ghost_settled();
        }
    }

    /// The figure for this frame's target, once it is in: compiled in line under a seekable clock
    /// (and on the web), else on a thread started here, `None` until it lands.
    fn figure_ready(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, inline: bool) -> Option<Figure> {
        let scene = match parsed(true) {
            Some(Ok(scene)) => scene,
            _ => return None,
        };
        #[cfg(not(target_arch = "wasm32"))]
        if !inline {
            let key = crate::warm::device_key(device);
            if !self.building.as_ref().is_some_and(|(k, f, g, _)| *k == key && *f == format && *g == generation) {
                let (send, receive) = std::sync::mpsc::channel();
                let on_thread = device.clone();
                let spawned = crate::warm::spawn("hero-figure", move || {
                    let _ = send.send(figure(&on_thread, format, generation, scene));
                });
                if !spawned {
                    return Some(figure(device, format, generation, scene));
                }
                self.building = Some((key, format, generation, receive));
            }
            let landed = match self.building.as_ref().map(|(_, _, _, r)| r.try_recv()) {
                Some(Ok(figure)) => Some(figure),
                // The thread ended without one (it panicked): build here, where a panic reaches
                // Exact's guard, rather than wait for a frame that never comes.
                Some(Err(std::sync::mpsc::TryRecvError::Disconnected)) => Some(figure(device, format, generation, scene)),
                _ => None,
            };
            if landed.is_some() {
                self.building = None;
            }
            return landed;
        }
        let _ = inline;
        Some(figure(device, format, generation, scene))
    }

    fn reduced(&self) -> bool {
        self.at.reduced || self.host_reduced
    }

    /// Home shown or hidden (`was` the visibility before): a move between screens for warm.rs, and
    /// Home left before its ghost's entrance played gives that entrance up.
    fn moved(&mut self, was: bool) {
        if was == self.shown() {
            return;
        }
        crate::warm::navigated();
        // Home left, whether or not the ghost had drawn: its entrance is given up on.
        if was {
            self.settle();
        }
    }

    fn shown(&self) -> bool {
        self.at.visible && !self.host_hidden
    }

    /// The still pose of `inputs`: deterministic, the same steps RN's twin takes.
    fn pose(inputs: &Inputs) -> RigFrame {
        let mut r = rig::Rig::new(&inputs.state, STILL_SEED);
        r.blink = false;
        let entry = r.state().entry.map_or(0.0, |m| m.seconds()) + rig::HOLD_MARGIN_S;
        let mut f = r.update(0.05);
        let mut t = 0.05;
        while t < entry {
            f = r.update(0.05);
            t += 0.05;
        }
        if let Some(m) = Move::named(&inputs.play) {
            r.play(Some(m));
            let steps = (inputs.at / STILL_DT).round() as usize;
            for _ in 0..steps.max(1) {
                f = r.update(STILL_DT);
            }
        }
        f
    }

    fn performer(&self, seed: u32) -> Performer {
        let ambient = HOME_AMBIENT.map(|n| Move::named(n).expect("a Home gesture"));
        Performer::new(&self.at.state, &ambient, self.reduced(), seed)
    }

    /// Whether the next render has anything new to draw.
    fn wants_frame(&self) -> bool {
        if !self.shown() {
            return false;
        }
        if self.at.at >= 0.0 {
            return !self.still_drawn;
        }
        !self.performer.as_ref().is_some_and(|p| p.resting())
    }
}

impl Surface for HeroSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) -> bool {
        self.gpu = None;
        // The picture went with the device: a held ghost draws its pose again.
        if let Some(p) = self.performer.as_mut() {
            p.hidden();
        }
        self.still_drawn = false;
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.building = None;
        }
        true
    }

    fn max_fps(&self) -> u32 {
        CEILING_FPS
    }

    fn reduced_motion(&mut self, reduce: bool) {
        self.host_reduced = reduce;
    }

    fn lifecycle(&mut self, event: Lifecycle) {
        let was = self.shown();
        match event {
            Lifecycle::Hidden | Lifecycle::Interrupted => self.host_hidden = true,
            Lifecycle::Visible | Lifecycle::Resumed => self.host_hidden = false,
            _ => {}
        }
        self.moved(was);
        if self.host_hidden {
            if let Some(p) = self.performer.as_mut() {
                p.hidden();
            }
            self.still_drawn = false;
        }
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        if inputs.len() > INPUTS {
            return Err(SurfaceError(format!("hero: expected {INPUTS} inputs, got {}", inputs.len())));
        }
        let num = |i: usize, name: &str, or: f64| -> Result<f64, SurfaceError> { Ok(inputs.get(i).map(|v| number(v, name)).transpose()?.unwrap_or(or)) };
        let text = |i: usize, or: &str| -> String { inputs.get(i).and_then(|v| v.as_str()).unwrap_or(or).to_string() };
        let next = Inputs {
            fill: num(0, "fill", HOME_FILL as f64)?.clamp(0.01, 1.0) as f32,
            reduced: num(1, "reduced", 0.0)? > 0.5,
            visible: num(2, "visible", 1.0)? > 0.5,
            state: text(3, "returned"),
            play: text(4, ""),
            at: num(5, "at", -1.0)?,
        };
        if next == self.at && self.bound {
            return Ok(());
        }
        self.bound = true;
        let shown = self.shown();
        let was = std::mem::replace(&mut self.at, next);
        // The model is made at the first frame from the file parsed off the main thread ([`preload`]).
        if was.fill != self.at.fill {
            self.model = None;
        }
        self.moved(shown);
        if !self.at.visible {
            if let Some(p) = self.performer.as_mut() {
                p.hidden();
            }
            self.still_drawn = false;
        }
        if self.at.at >= 0.0 {
            if self.still.is_none() || was.state != self.at.state || was.play != self.at.play || was.at != self.at.at {
                self.still = Some(HeroSurface::pose(&self.at));
                self.still_drawn = false;
            }
        } else {
            self.still = None;
            if let Some(p) = self.performer.as_mut() {
                if was.state != self.at.state {
                    // A state change is itself a gesture (hero-scene-core.ts:405-415).
                    p.rig.enter(&self.at.state);
                }
                if was.play != self.at.play {
                    if let Some(m) = Move::named(&self.at.play) {
                        p.play(m);
                    }
                }
                if was.reduced != self.at.reduced {
                    p.hidden();
                }
            }
        }
        Ok(())
    }

    fn published(&mut self) -> Option<String> {
        self.publish.take()
    }

    fn frame_presentable(&self) -> bool {
        !self.waiting
    }

    fn take_error(&mut self) -> Option<SurfaceError> {
        self.error.take()
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
        self.waiting = false;
        if !self.bound || !self.shown() {
            // Off screen: no pose, no render, no present; time off screen does not count.
            self.last_ms = None;
            return false;
        }
        // The launch's first surface frame starts Journey's warm-up clock, ghost or not (warm.rs).
        crate::warm::first_frame(device, queue, format, frame.scale);
        // The model and the figure, made off the main thread: nothing presented until both are in.
        let inline = frame.seekable;
        if self.model.is_none() {
            match parsed(inline) {
                Some(Ok(scene)) => match Model::from(scene.clone(), self.at.fill) {
                    Ok(model) => self.model = Some(model),
                    Err(e) => {
                        self.error = Some(SurfaceError(e));
                        return false;
                    }
                },
                Some(Err(e)) => {
                    self.error = Some(SurfaceError(e.clone()));
                    return false;
                }
                None => {
                    self.waiting = true;
                    return true;
                }
            }
        }
        if !self.gpu.as_ref().is_some_and(|g| g.fits(format, frame.shader_generation)) {
            match self.figure_ready(device, format, frame.shader_generation, inline) {
                Some(figure) => self.gpu = Some(figure),
                None => {
                    self.waiting = true;
                    return true;
                }
            }
        }
        let now = frame.now_ms;
        let dt = self.last_ms.map_or(rig::MAX_DT, |l| ((now - l) / 1000.0).clamp(0.0, rig::MAX_DT));
        self.last_ms = Some(now);

        let f = if let Some(still) = self.still {
            self.still_drawn = true;
            still
        } else {
            if self.performer.is_none() {
                self.performer = Some(self.performer((now as u64 as u32) | 1));
            }
            let reduced = self.reduced();
            let performer = self.performer.as_mut().unwrap();
            let tick = performer.tick(dt, reduced);
            if performer.entrance_played {
                self.settle();
            }
            match tick {
                Tick::Draw(f) => f,
                Tick::Held => return false,
            }
        };

        let model = self.model.as_mut().unwrap();
        model.scene.pose((f.frame / FPS) as f32);
        let mut worlds = std::mem::take(&mut model.worlds);
        model.scene.worlds_into(&mut worlds);

        let gpu = self.gpu.as_mut().unwrap();

        let (w, h) = (frame.width.max(1.0), frame.height.max(1.0));
        let view_proj = Mat4::perspective_rh(Y_FOV, w / h, 0.1, 1000.0) * model.view;
        let tone = |t: f32| scene::v4(scene::tone_at(scene::GHOST_BG, scene::GHOST_INK, t));
        let lin = |c: u32| scene::v4(scene::linear(c));
        let v4 = |v: Vec3| [v.x, v.y, v.z, 0.0];
        let head_c = veil::to_y(veil::HEAD_C) / model.quant.max(1e-6);
        // setAim, setGazeOff (no setOpen: the squint reads an aperture of 0), setFace.
        let (yaw, pitch) = (f.aim_yaw as f32, f.aim_pitch as f32);
        let eyes = veil::solve(yaw, pitch, yaw, 0.0, &veil_face(&f.face));
        gpu.scene(&shaders::figure::Scene {
            view_proj: view_proj.to_cols_array_2d(),
            key: v4(Vec3::new(0.0695, -0.0872, 0.9938).normalize()),
            eye_dark: scene::v4(scene::eye_dark()),
            pupil: [veil::PUPIL_TONE, veil::PUPIL_TONE, veil::PUPIL_TONE, 1.0],
            contour: lin(INK),
            head: [head_c.x, head_c.y, head_c.z, 1.0],
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
        let stage = stage(&f);
        self.calls.clear();
        for (i, p) in model.scene.prims.iter().enumerate() {
            if model.hidden[i] || model.scene.nodes[p.node].hidden {
                continue;
            }
            let m = stage * worlds[p.node];
            let normal = Mat4::from_mat3(Mat3::from_mat4(m).inverse().transpose());
            let (lit, mid, shade, mode) = match model.shades[i] {
                Shade::Flat(c) => (lin(c), [0.0; 4], [0.0; 4], 0.0),
                Shade::Soft => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 4.0),
                Shade::Veil => (tone(scene::TONE_LIT), tone(scene::TONE_MID), tone(scene::TONE_SHADE), 2.0),
            };
            let mut weights = [[0.0f32; 4]; 14];
            for (k, x) in model.scene.nodes[p.node].weights.iter().take(p.targets.len().min(crate::figure::MAX_TARGETS)).enumerate() {
                weights[k / 4][k % 4] = *x;
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
                    weights,
                },
            );
            self.calls.push(Call { mesh: i, slot: i, outlined: false });
        }
        model.worlds = worlds;

        // No dissolve on Home: the mask starts below the canvas. Presence fades every material.
        gpu.render(device, queue, encoder, target, frame.pixels(), (2.0, 3.0), f.presence.clamp(0.0, 1.0) as f32, &self.calls);
        if !self.drawn {
            self.drawn = true;
            self.publish = Some("{\"drawn\":true}".into());
            // Home's ghost is up: the target Journey's warm-up builds for (warm.rs).
            crate::warm::ghost_drawn(device, queue, format, frame.scale);
        }
        self.wants_frame()
    }
}

/// A new Home ghost, for the registry.
pub fn hero() -> Box<dyn Surface> {
    preload();
    Box::new(HeroSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn surface(inputs: &[Value]) -> HeroSurface {
        let mut s = HeroSurface::default();
        s.bind(inputs, None).unwrap();
        s
    }

    fn n(v: f64) -> Value {
        Value::Number(v)
    }

    #[test]
    fn the_board_and_the_found_marker_are_never_drawn() {
        let model = Model::load(HOME_FILL).unwrap();
        let board = model.scene.named("Board_Pivot").unwrap();
        for (i, p) in model.scene.prims.iter().enumerate() {
            if model.scene.under(p.node, board) {
                assert!(model.hidden[i]);
            }
        }
        assert!(model.shades.contains(&Shade::Soft) && model.shades.contains(&Shade::Veil));
        assert!(model.hidden.iter().any(|h| !h));
    }

    #[test]
    fn the_head_fills_a_quarter_of_home_s_frame() {
        let model = Model::load(HOME_FILL).unwrap();
        let vp = Mat4::perspective_rh(Y_FOV, 1.0, 0.1, 1000.0) * model.view;
        let head = head_world();
        let top = vp.project_point3(head + Vec3::Y * HEAD_RADIUS);
        let bottom = vp.project_point3(head - Vec3::Y * HEAD_RADIUS);
        assert!(((top.y - bottom.y) / 2.0 - HOME_FILL).abs() < 0.02, "{}", (top.y - bottom.y) / 2.0);
        // Aimed FACE_DROP below the head: the head sits above centre.
        assert!((top.y + bottom.y) / 2.0 > 0.0);
    }

    #[test]
    fn the_stage_turns_on_the_head_s_own_axis() {
        let rest = RigFrame {
            lift: 0.0,
            spin: 1.0,
            tilt: 0.0,
            flip: 0.0,
            squash: 1.0,
            presence: 1.0,
            frame: 30.0,
            face: rig::NEUTRAL,
            aim_yaw: 0.0,
            aim_pitch: 0.0,
            moving: None,
        };
        let m = stage(&rest);
        assert!((m.transform_point3(head_world()) - head_world()).length() < 1e-5);
        let lifted = stage(&RigFrame { lift: 0.5, spin: 0.0, squash: 0.81, ..rest });
        let p = lifted.transform_point3(head_world() + Vec3::new(1.0, 1.0, 0.0)) - head_world();
        assert!((p.y - (0.81 + 0.5 * HEAD_RADIUS)).abs() < 1e-5 && (p.x - 1.0 / 0.9).abs() < 1e-5, "{p}");
    }

    #[test]
    fn the_still_pose_is_deterministic() {
        let s = |play: &str, at: f64| HeroSurface::pose(&Inputs { play: play.into(), at, ..Default::default() });
        let a = s("nod", 0.31);
        let b = s("nod", 0.31);
        assert_eq!(a.lift, b.lift);
        assert_eq!(a.face, b.face);
        assert!(a.lift < s("", 0.0).lift - 0.05, "the nod dips");
        assert!((s("", 0.0).presence - 1.0).abs() < 1e-3);
    }

    #[test]
    fn inputs_default_to_home_s() {
        let s = surface(&[n(0.26), n(0.0), n(1.0)]);
        assert!(s.at.state == "returned" && s.at.at < 0.0 && s.shown());
        let hidden = surface(&[n(0.26), n(0.0), n(0.0)]);
        assert!(!hidden.wants_frame());
        assert!(HeroSurface::default().bind(&std::array::from_fn::<Value, 7, _>(|_| n(0.0)), None).is_err());
    }

    /// A frame of the settled ghost, read back: the head in the frame's upper half, two dark
    /// eyes, transparent corners; then nothing asked for once Reduce Motion holds him.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn the_ghost_draws_and_rests() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut frame = Frame {
            width: 152.0,
            height: 152.0,
            scale: 3.0,
            now_ms: 1000.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface(&[n(0.26), n(1.0), n(1.0)]);
        let (px, more) = fixture::render(&gpu, &mut s, &frame).unwrap();
        assert!(!more, "held under Reduce Motion: no frame asked for");
        assert_eq!(s.published().as_deref(), Some("{\"drawn\":true}"));
        if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(std::path::Path::new(&out).join(format!("hero-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
        }
        let (w, h) = (px.width as usize, px.height as usize);
        let at = |x: usize, y: usize| &px.data[(y * w + x) * 4..(y * w + x) * 4 + 4];
        assert!(at(1, 1)[3] < 4 && at(w - 2, 1)[3] < 4, "transparent corners");
        let solid = px.count(|p| p[3] > 250);
        assert!(solid > w * h / 50 && solid < w * h / 2, "a small ghost: {solid} of {}", w * h);
        let dark = (0..h).flat_map(|y| (0..w).map(move |x| (x, y))).filter(|&(x, y)| {
            let p = at(x, y);
            p[3] > 250 && p[0] < 90
        });
        let (left, right) = dark.fold((0, 0), |(l, r), (x, _)| if x < w / 2 { (l + 1, r) } else { (l, r + 1) });
        assert!(left > 30 && right > 30, "eyes {left} {right}");
        // Live: it keeps asking while it moves.
        let mut live = surface(&[n(0.26), n(0.0), n(1.0)]);
        frame.now_ms = 2000.0;
        let (_, more) = fixture::render(&gpu, &mut live, &frame).unwrap();
        assert!(more);
    }

    /// A live clock (the app's): the file and the figure are made off the main thread, so the first
    /// frames present nothing and ask for more; the ghost draws once they are in.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn live_frames_wait_for_the_figure_built_off_the_main_thread() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut frame = Frame {
            width: 152.0,
            height: 152.0,
            scale: 3.0,
            now_ms: 1000.0,
            children_generation: 0,
            seekable: false,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface(&[n(0.26), n(1.0), n(1.0)]);
        let (_, more) = fixture::render(&gpu, &mut s, &frame).unwrap();
        assert!(more && !s.frame_presentable(), "the first frame waits for the figure");
        let mut waited = 0;
        while !s.drawn && waited < 400 {
            std::thread::sleep(std::time::Duration::from_millis(5));
            frame.now_ms += 5.0;
            fixture::render(&gpu, &mut s, &frame).unwrap();
            waited += 1;
        }
        assert!(s.drawn && s.frame_presentable(), "drawn once the figure landed");
        assert_eq!(s.published().as_deref(), Some("{\"drawn\":true}"));
    }

    /// The live ghost's frame cost on this Mac's GPU (the simulator's), 456 px square as on an
    /// iPhone: GPU execution by timestamp queries, and the CPU's pose + encode. Not a gate:
    /// `cargo test -p patterns-exact-gpu --release hero::tests::frame_cost -- --ignored --nocapture`.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    #[ignore]
    fn frame_cost() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let (device, queue) = (&gpu.device, &gpu.queue);
        let timed = device.features().contains(wgpu::Features::TIMESTAMP_QUERY);
        let format = wgpu::TextureFormat::Bgra8Unorm;
        let target = device
            .create_texture(&wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d { width: 456, height: 456, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&Default::default());
        let query = device.create_query_set(&wgpu::QuerySetDescriptor { label: None, ty: wgpu::QueryType::Timestamp, count: 2 });
        let resolve = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 16,
            usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let read = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 16,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut s = surface(&[n(0.26), n(0.0), n(1.0)]);
        let mut frame = Frame {
            width: 152.0,
            height: 152.0,
            scale: 3.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: false,
            period_ms: 16.667,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let (mut gpu_ms, mut cpu_ms, mut wall_ms) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..600 {
            frame.now_ms = i as f64 * 16.667;
            let t0 = std::time::Instant::now();
            let mut encoder = device.create_command_encoder(&Default::default());
            // An empty pass stamps the start, another the end (no timestamps inside encoders here).
            let stamp = |encoder: &mut wgpu::CommandEncoder, at: u32| {
                let writes = wgpu::RenderPassTimestampWrites {
                    query_set: &query,
                    beginning_of_pass_write_index: (at == 0).then_some(0),
                    end_of_pass_write_index: (at == 1).then_some(1),
                };
                drop(encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: None,
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &target,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: Some(writes),
                    occlusion_query_set: None,
                    multiview_mask: None,
                }));
            };
            if timed {
                stamp(&mut encoder, 0);
            }
            s.render(&frame, device, queue, &mut encoder, &target, format);
            if timed {
                stamp(&mut encoder, 1);
                encoder.resolve_query_set(&query, 0..2, &resolve, 0);
                encoder.copy_buffer_to_buffer(&resolve, 0, &read, 0, 16);
            }
            let cmd = encoder.finish();
            cpu_ms.push(t0.elapsed().as_secs_f64() * 1000.0);
            let t1 = std::time::Instant::now();
            queue.submit([cmd]);
            s.submitted();
            if timed {
                read.slice(..).map_async(wgpu::MapMode::Read, |_| {});
                device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
                let ticks: Vec<u64> = {
                    let view = read.slice(..).get_mapped_range().unwrap();
                    let bytes: &[u8] = &view;
                    bytemuck::cast_slice::<u8, u64>(bytes).to_vec()
                };
                read.unmap();
                wall_ms.push(t1.elapsed().as_secs_f64() * 1000.0);
                gpu_ms.push((ticks[1].saturating_sub(ticks[0])) as f64 * queue.get_timestamp_period() as f64 / 1e6);
            } else {
                device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            }
        }
        let stat = |v: &mut Vec<f64>| {
            v.drain(..60);
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            if v.is_empty() {
                return (0.0, 0.0, 0.0);
            }
            (v[v.len() / 2], v[v.len() * 99 / 100], v[v.len() - 1])
        };
        println!(
            "hero frame: gpu (timestamps: {timed}) median/p99/max {:?} ms; submit to done {:?} ms; cpu pose+encode {:?} ms",
            stat(&mut gpu_ms),
            stat(&mut wall_ms),
            stat(&mut cpu_ms)
        );
    }
}
