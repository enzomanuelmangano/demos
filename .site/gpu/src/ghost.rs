//! The intro's 3D stage: the ghost beside the tilted board with the glow
//! under them, and the page turn that flies the camera overhead and lands
//! the real board — the RN app's three.js scene (WebGPU + TSL) and its sheet
//! board (onboarding/ghost-scene-core.ts, sheet-board.tsx) on wgpu.
//!
//! `ghost(scheme, page, live, how, pokeN, pokeX, pokeY)`: `"dark"` or
//! `"light"`; the intro's page (0 the orbit, 1 the puzzle); where a finger
//! holds the pager, in pages (or -9 when none does); how the page is reached
//! when it is let go (0 a tap's spring, 1 a release's settle, 2 Reduce
//! Motion's jump); and the taps on the canvas (a count and the last one's
//! point, in canvas points), which poke the ghost when they land on him. A
//! poke that lands is published as `{"poke": n, "kind": "cross"}`
//! (`exactSurface("ghost")`), for its haptic. The canvas is laid out as the RN stage is: as wide
//! as the screen, its bottom `BOARD_COPY_GAP` under where the board lands.
//! The real board is drawn here too (board.rs, as the RN intro draws it on
//! its sheet): `board`, `targets`, `cues` and the piece in hand (`dragSq`,
//! `dragX`, `dragY`, `grabX`, `grabY`) are its inputs, carried through the
//! 3D board's corners while the camera flies and at rest where it lands, at
//! the bottom of the canvas `BOARD_COPY_GAP` over its edge. Its taps are a
//! hit grid laid out there by Contract. The canvas's one child is the scheme
//! probe. The surface leaves the page to the compositor: it draws
//! premultiplied, transparent where nothing is.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{ChildrenMode, Frame, InputEvent, Placement, PointerPhase, Surface, SurfaceError, Value};

use crate::board::{self, BoardState};
use crate::layers::{self, Layers};
use crate::touch::{Effect, Effects, Gesture, Scene};
use glam::{Mat3, Mat4, Quat, Vec2, Vec3};

use crate::morph::Morph;
use crate::probe::SchemeProbe;
use crate::scene::{self, Bounds, Kind, Model, Palette, Rig};
use crate::{gfx, poke, shaders};

const MSAA: u32 = 4;
const SCENE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
/// One half of the glow's breath, ms.
const GLOW_BREATH_MS: f64 = 2600.0;
/// The entrance (ghost-3d.tsx:84-85, reveal-curve.ts): the fade's progress runs over REVEAL_MS
/// counted in drawn frames of at most REVEAL_FRAME_MS, from the frame after the first drawn; its
/// opacity is `reveal_ease` of it, and the page takes touches from half that opacity.
pub const REVEAL_MS: f64 = 360.0;
const REVEAL_FRAME_MS: f64 = 1000.0 / 60.0;
pub const REVEAL_TOUCH_OPACITY: f32 = 0.5;
/// Reduce Motion's page turn (index.tsx PAGE_DIP_OUT_MS, PAGE_DIP_IN_MS), on `withTiming`'s
/// default in-out quad.
const DIP_OUT_MS: f64 = 120.0;
const DIP_IN_MS: f64 = 260.0;
/// The board takes touches once its landing fade is this far in (pattern-beat.tsx:530-536), and
/// a kept "Show me" plays once the pager is this close to page 1 (NEARLY_LANDED_PAGE, :163).
const LANDED_TOUCHABLE: f32 = 0.99;
const NEARLY_LANDED_PAGE: f64 = 0.005;

/// The surface's inputs, at most: `dipped` (19) is the last, optional.
pub const INPUTS: usize = 20;

/// The dip's opacity at `now`: (from, to, start, ms) on in-out quad.
fn dip_at(d: (f32, f32, f64, f64), now: f64) -> f32 {
    let x = ((now - d.2) / d.3).clamp(0.0, 1.0) as f32;
    d.0 + (d.1 - d.0) * in_out_quad(x)
}

/// The glow's breath at `now_ms`, ping-pong over GLOW_BREATH_MS each way; held at its middle
/// under Reduce Motion (ghost-scene-core.ts:1814-1817).
pub fn breath(now_ms: f64, reduced: bool) -> f32 {
    if reduced {
        0.5
    } else {
        (0.5 - 0.5 * (now_ms / GLOW_BREATH_MS * std::f64::consts::PI).cos()) as f32
    }
}

/// `revealEase` (reveal-curve.ts): ease-out cubic.
pub fn reveal_ease(p: f32) -> f32 {
    1.0 - (1.0 - p).powi(3)
}

fn in_out_quad(x: f32) -> f32 {
    if x < 0.5 {
        2.0 * x * x
    } else {
        1.0 - (-2.0 * x + 2.0).powi(2) / 2.0
    }
}
/// The sheet board's opacity floor and ceiling (sheet-board.tsx).
const SHEET_FLOOR: f32 = 2.0 / 255.0;
const SHEET_CEILING: f32 = 254.0 / 255.0;
/// Where the copy hands over, in pages (intro-clock.ts), carried into the
/// morph's biased space: the board's frame and slab fade on this window.
const COPY_HOLD: f32 = 0.18;
const COPY_FADE: f32 = 0.58;
const MORPH_BIAS: f32 = 0.8;
const GHOST_LEAVE_FROM: f32 = 0.78;
/// A finger is wider than his outline: his box grown by this much of his height.
const POKE_SLOP: f32 = 0.08;
/// Only at rest on the first page: once the camera leaves, he is not for poking.
const POKE_MAX_MORPH: f32 = 0.02;

/// Whether the ray through canvas point (x, y) meets the box (three's
/// `Raycaster.setFromCamera` and `Ray.intersectsBox`).
fn ray_hits(inv: Mat4, w: f32, h: f32, x: f32, y: f32, lo: Vec3, hi: Vec3) -> bool {
    let (nx, ny) = (x / w * 2.0 - 1.0, 1.0 - y / h * 2.0);
    let a = inv.project_point3(Vec3::new(nx, ny, 0.0));
    let b = inv.project_point3(Vec3::new(nx, ny, 1.0));
    let d = b - a;
    let (mut t0, mut t1) = (0.0f32, f32::INFINITY);
    for k in 0..3 {
        if d[k].abs() < 1e-9 {
            if a[k] < lo[k] || a[k] > hi[k] {
                return false;
            }
            continue;
        }
        let (u, v) = ((lo[k] - a[k]) / d[k], (hi[k] - a[k]) / d[k]);
        t0 = t0.max(u.min(v));
        t1 = t1.min(u.max(v));
    }
    t0 <= t1
}

/// The ghost and his board.
pub struct GhostSurface {
    palette: Palette,
    model: Option<(Model, Bounds)>,
    error: Option<SurfaceError>,
    /// The clip's own clock, seconds, and the frame it was last advanced on: it stands still under
    /// Reduce Motion (the mixer is updated by 0, ghost-scene-core.ts:1746-1758).
    clip_s: f64,
    clip_ms: Option<f64>,
    /// The entrance's progress (0..1, `revealProgress`), whether a frame was drawn yet, and whether
    /// the app heard it take touches.
    reveal: f32,
    drawn: bool,
    touchable: bool,
    /// Reduce Motion's dip when the app binds it (`dipped`): the stage, board and copy fade out and
    /// back on their own, the dots (outside RN's pattern layer) do not. (from, to, start, ms).
    dip: Option<(f32, f32, f64, f64)>,
    /// What the app last heard of the landing and of the pager's nearness to page 1.
    landed_told: bool,
    near_told: bool,
    /// A fixed clip time, seconds, for a test's still.
    pub hold: Option<f32>,
    /// A fixed breath phase, 0..1, for a test's still.
    pub hold_phase: Option<f32>,
    /// The page turn; `None` until the first binding says which page.
    morph: Option<Morph>,
    /// A turn bound before any frame: its page and when it was asked.
    pending: Option<(f64, Option<f64>)>,
    /// The clock of the last frame drawn.
    last_ms: Option<f64>,
    /// The real board: its state on this clock, whether it was bound yet,
    /// and this frame's uniform, sprites and their bytes.
    board: BoardState,
    board_bound: bool,
    board_uniform: crate::shaders::board::Board,
    sprites: Vec<crate::shaders::board::Sprite>,
    /// The pieces' arrival (pattern-beat's `pieceEntrance`): whether the
    /// sheet has taken over from the 3D body, and the fade toward it as
    /// (from, to, start ms, duration ms).
    arriving: Option<bool>,
    entrance: (f32, f32, f64, f64),
    gpu: Option<Gpu>,
    /// Taps on the canvas: the count already seen, and the newest unread one.
    taps_seen: Option<f64>,
    tap: Option<(f32, f32)>,
    /// The poke ladder, what the last frame showed (hop, stretch, face) and
    /// what a new rung takes over from (ghost-scene-core's `shown*`, `carry*`).
    poke: poke::State,
    shown: (f32, f32, Option<scene::Expr>),
    carried: (f32, f32, Option<scene::Expr>),
    /// `Ghost_Root`, its rest transform, and his height at rest.
    root: Option<(usize, Vec3, Quat, Vec3, f32)>,
    /// What a tap is judged against: the last frame's inverse view-projection,
    /// canvas size, his box, his opacity and the morph.
    last_hit: Option<(Mat4, f32, f32, Vec3, Vec3, f32, f32)>,
    /// Pokes that landed, and the record not yet published.
    landed_pokes: u32,
    /// The scheme, read off the page (the canvas's child `intro-probe`, a dot in `page`).
    probe: SchemeProbe,
    /// The intro as one surface (the canvas covers the screen): its children by name (index ->
    /// name, and the copy, each a texture and a frame), the layers that composite them, and the
    /// stage's own texture.
    names: Vec<String>,
    /// The screen's height (points), 0 when the canvas is only the stage.
    screen: f32,
    copy: [Option<(Option<wgpu::TextureView>, [f32; 4])>; 3],
    canvas: (f32, f32),
    /// The screen's pixels per point (the copy moves on whole pixels).
    scale: f32,
    /// The touches (touch.rs), what the app lets them do, and what they did that it has not
    /// heard yet: (what, a, b), published one a frame.
    gesture: Gesture,
    interactive: bool,
    reduced: bool,
    deaf: bool,
    heard: std::collections::VecDeque<(&'static str, f64, f64)>,
    told: u32,
    /// Which side of half a page the pager was last on (the button's word turns there).
    side: Option<bool>,
}

impl Default for GhostSurface {
    fn default() -> Self {
        GhostSurface {
            palette: scene::DARK,
            model: None,
            error: None,
            clip_s: 0.0,
            clip_ms: None,
            reveal: 0.0,
            drawn: false,
            touchable: false,
            dip: None,
            landed_told: false,
            near_told: false,
            hold: None,
            hold_phase: None,
            morph: None,
            pending: None,
            last_ms: None,
            board: BoardState::default(),
            board_bound: false,
            board_uniform: board::uniform_base(),
            sprites: Vec::with_capacity(97),
            arriving: None,
            entrance: (0.0, 0.0, 0.0, 1.0),
            gpu: None,
            taps_seen: None,
            tap: None,
            poke: poke::NONE,
            shown: (0.0, 0.0, None),
            carried: (0.0, 0.0, None),
            root: None,
            last_hit: None,
            landed_pokes: 0,
            probe: SchemeProbe::default(),
            names: Vec::new(),
            screen: 0.0,
            copy: [None, None, None],
            canvas: (0.0, 0.0),
            scale: 0.0,
            gesture: Gesture::default(),
            interactive: false,
            reduced: false,
            deaf: false,
            heard: std::collections::VecDeque::new(),
            told: 0,
            side: None,
        }
    }
}

struct Mesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
    /// Where its draw uniforms sit in the shared buffer.
    offset: usize,
    bind: wgpu::BindGroup,
    node: usize,
    order: usize,
    kind: Kind,
    double_sided: bool,
}

struct Targets {
    size: (u32, u32),
    color: wgpu::TextureView,
    resolve: wgpu::TextureView,
    depth: wgpu::TextureView,
    composite_bind: wgpu::BindGroup,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    front: wgpu::RenderPipeline,
    both: wgpu::RenderPipeline,
    composite: wgpu::RenderPipeline,
    composite_layout: wgpu::BindGroupLayout,
    board: board::Gpu,
    /// Where the scene's and the glow's uniforms sit in `arena`.
    scene_at: usize,
    scene_bind: wgpu::BindGroup,
    glow_at: usize,
    /// The copy, the dots and the stage, composited (layers.rs).
    layers: Layers,
    /// Every uniform block, written once a frame (gfx::Arena).
    arena: gfx::Arena,
    meshes: Vec<Mesh>,
    /// The frame's draw order (mesh index, depth), kept so a frame allocates nothing.
    order: Vec<(usize, f32)>,
    targets: Option<Targets>,
}

/// `v` with its fourth component set.
fn with_w(mut v: [f32; 4], w: f32) -> [f32; 4] {
    v[3] = w;
    v
}

/// `squareToQuad` (sheet-board.tsx): child points of a `size` square to the quad.
fn square_to_quad(size: f32, q: [Vec2; 4]) -> Mat3 {
    let [p0, p1, p2, p3] = q;
    let (dx1, dx2, dx3) = (p1.x - p2.x, p3.x - p2.x, p0.x - p1.x + p2.x - p3.x);
    let (dy1, dy2, dy3) = (p1.y - p2.y, p3.y - p2.y, p0.y - p1.y + p2.y - p3.y);
    let den = dx1 * dy2 - dx2 * dy1;
    let g = if den == 0.0 { 0.0 } else { (dx3 * dy2 - dx2 * dy3) / den };
    let h = if den == 0.0 { 0.0 } else { (dx1 * dy3 - dx3 * dy1) / den };
    let a = p1.x - p0.x + g * p1.x;
    let b = p3.x - p0.x + h * p3.x;
    let d = p1.y - p0.y + g * p1.y;
    let e = p3.y - p0.y + h * p3.y;
    // Row major [a/s b/s x0; d/s e/s y0; g/s h/s 1], as columns for glam.
    Mat3::from_cols(Vec3::new(a / size, d / size, g / size), Vec3::new(b / size, e / size, h / size), Vec3::new(p0.x, p0.y, 1.0))
}

fn page_of(value: &Value) -> Result<f64, SurfaceError> {
    match value {
        Value::Bool(b) => Ok(if *b { 1.0 } else { 0.0 }),
        other => {
            let n = number(other, "page")?;
            Ok(if n >= 0.5 { 1.0 } else { 0.0 })
        }
    }
}

impl Surface for GhostSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) -> bool {
        self.gpu = None;
        self.probe.device_lost();
        // The host captures the children again for the new device.
        self.copy = Default::default();
        true
    }

    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        if inputs.len() > INPUTS {
            return Err(SurfaceError(format!("ghost: expected {INPUTS} inputs, got {}", inputs.len())));
        }
        let scheme = match inputs.first() {
            Some(s) => s.as_str().ok_or_else(|| SurfaceError("ghost.scheme: expected a string".into()))?.to_string(),
            None => "dark".to_string(),
        };
        let page = match inputs.get(1) {
            Some(p) => page_of(p)?,
            None => 0.0,
        };
        let num = |i: usize, name: &str, default: f64| -> Result<f64, SurfaceError> {
            match inputs.get(i) {
                Some(v) => number(v, name),
                None => Ok(default),
            }
        };
        let live = num(2, "live", -9.0)?;
        let how = num(3, "how", 0.0)? as u8;
        let taps = num(4, "pokeN", 0.0)?;
        let (tx, ty) = (num(5, "pokeX", 0.0)? as f32, num(6, "pokeY", 0.0)? as f32);
        match self.taps_seen {
            // Taps already counted belong to an earlier run of this canvas.
            None => self.taps_seen = Some(taps),
            Some(seen) if taps != seen => {
                self.taps_seen = Some(taps);
                self.tap = Some((tx, ty));
            }
            _ => {}
        }
        if inputs.len() > 7 {
            let text = |i: usize, name: &str| -> Result<String, SurfaceError> {
                match inputs.get(i) {
                    Some(v) => Ok(v.as_str().ok_or_else(|| SurfaceError(format!("ghost.{name}: expected a string")))?.to_string()),
                    None => Err(SurfaceError(format!("ghost.{name}: missing"))),
                }
            };
            let drag = [num(10, "dragSq", -1.0)?, num(11, "dragX", 0.0)?, num(12, "dragY", 0.0)?, num(13, "grabX", 0.0)?, num(14, "grabY", 0.0)?];
            let input = board::Input::parse(&text(7, "board")?, &text(8, "targets")?, &text(9, "cues")?, drag).map_err(SurfaceError)?;
            self.board.bind(input, at_ms, !self.board_bound);
            self.board_bound = true;
        }
        self.screen = num(18, "screenH", 0.0)? as f32;
        self.interactive = num(15, "interactive", 0.0)? > 0.5;
        self.reduced = num(16, "reduced", 0.0)? > 0.5;
        self.board.reduced = self.reduced;
        self.deaf = num(17, "deaf", 0.0)? > 0.5;
        if let Some(d) = inputs.get(19) {
            let dipped = number(d, "dipped")? > 0.5;
            let now = at_ms.or(self.last_ms).unwrap_or(0.0);
            let shown = self.dip.map_or(1.0, |d| dip_at(d, now));
            let to = if dipped { 0.0 } else { 1.0 };
            if self.dip.map_or(1.0, |d| d.1) != to {
                self.dip = Some((shown, to, now, if dipped { DIP_OUT_MS } else { DIP_IN_MS }));
            }
        }
        let palette = match scheme.as_str() {
            "light" => scene::LIGHT,
            "dark" => scene::DARK,
            other => return Err(SurfaceError(format!("ghost.scheme: \"{other}\" is neither \"light\" nor \"dark\""))),
        };
        if self.model.is_none() {
            let mut model = Model::load().map_err(SurfaceError)?;
            let bounds = Bounds::of(&mut model);
            self.model = Some((model, bounds));
        }
        self.palette = palette;
        let at = at_ms.or(self.last_ms);
        if let Some(m) = &mut self.morph {
            m.reduced = self.reduced;
        }
        match &mut self.morph {
            // The first binding is where the intro opens: no flight.
            None => self.morph = Some(Morph::at_page(page)),
            Some(m) if live > -5.0 => m.drag(live, at.unwrap_or(0.0)),
            Some(m) if m.dragging() || m.page() != page => match at {
                Some(at) => m.release(page, at, how),
                None => self.pending = Some((page, None)),
            },
            Some(_) => {}
        }
        Ok(())
    }

    fn take_error(&mut self) -> Option<SurfaceError> {
        self.error.take()
    }

    /// One thing a touch (or a poke) did at a time, as `{"poke": n, "kind": rung, "ev": m,
    /// "act": what, "a", "b", "live": 1}`: `live` says the surface takes the intro's touches.
    fn published(&mut self) -> Option<String> {
        let (act, a, b) = match self.heard.pop_front() {
            Some(e) => e,
            None if self.told == 0 && TAKES_INTRO => ("live", 0.0, 0.0),
            None => return None,
        };
        self.told += 1;
        Some(format!(
            "{{\"poke\":{},\"kind\":\"{}\",\"ev\":{},\"act\":\"{}\",\"a\":{},\"b\":{},\"live\":{}}}",
            self.landed_pokes,
            poke::kind(self.poke.level).name(),
            self.told,
            act,
            a,
            b,
            TAKES_INTRO as u8
        ))
    }

    fn wants_input(&self) -> bool {
        TAKES_INTRO
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.deaf {
            return;
        }
        let Some((p, landed)) = self.morph.as_ref().map(|m| (m.scroll(), m.frame().landed)) else { return };
        let effects = match phase {
            PointerPhase::Down => {
                let [sx, sy, sw, sh] = self.stage_box(self.canvas.0, self.canvas.1);
                // Once its landing fade is all but in (pattern-beat.tsx realBoardStyle), and as the app allows.
                let board = (self.interactive && landed > LANDED_TOUCHABLE).then(|| (sx, sy + sh - sw - scene::BOARD_COPY_GAP, sw));
                let scene = Scene { width: self.canvas.0, board, pieces: self.board.occupied(), p, reduced: self.reduced };
                self.gesture.down(id, x, y, at_ms, scene);
                Effects::default()
            }
            PointerPhase::Move => self.gesture.moved(id, x, y, at_ms),
            PointerPhase::Up => self.gesture.up(id, x, y, at_ms, false),
            PointerPhase::Cancel => self.gesture.up(id, x, y, at_ms, true),
        };
        for effect in effects {
            let morph = self.morph.as_mut().unwrap();
            match effect {
                Effect::Pager(p) => morph.drag(p, at_ms),
                Effect::Release { to, from } => {
                    morph.release(to, at_ms, 1);
                    self.heard.push_back(("page", to, from));
                }
                Effect::Dip(to) => self.heard.push_back(("dip", to, 0.0)),
                Effect::Poke(px, py) => {
                    if morph.scroll().abs() <= 0.02 {
                        let [sx, sy, ..] = self.stage_box(self.canvas.0, self.canvas.1);
                        self.tap = Some((px - sx, py - sy));
                    }
                }
                Effect::Tap(sq) => self.heard.push_back(("tap", sq as f64, 0.0)),
                Effect::Lift { s: sq, x: gx, y: gy } => {
                    self.board.hand(Some(board::Drag { sq, x: 0.0, y: 0.0, grab_x: gx, grab_y: gy }), at_ms);
                    self.heard.push_back(("lift", sq as f64, 0.0));
                }
                Effect::Carry(dx, dy) => {
                    if let Some((sq, _)) = self.board.drop_square(at_ms) {
                        let held = self.board.held().unwrap();
                        self.board.hand(Some(board::Drag { sq, x: dx, y: dy, ..held }), at_ms);
                    }
                }
                Effect::Drop => {
                    if let Some((from, to)) = self.board.drop_square(at_ms) {
                        self.board.hand(None, at_ms);
                        self.heard.push_back(("drop", from as f64, to as f64));
                    }
                }
            }
        }
    }

    fn children_mode(&self) -> ChildrenMode {
        ChildrenMode::Each
    }

    /// The intro's children: `intro-probe` (the scheme) and the copy, `intro-copy-0`,
    /// `intro-copy-1-title` and `intro-copy-1-sub`, each rasterised once by the host and drawn here.
    fn child(&mut self, index: usize, name: &str, texture: Option<&wgpu::TextureView>, frame: [f32; 4]) {
        if self.names.len() <= index {
            self.names.resize(index + 1, String::new());
        }
        if !name.is_empty() {
            self.names[index] = name.to_string();
        }
        let gone = name.is_empty() && texture.is_none() && frame == [0.0; 4];
        match self.names[index].as_str() {
            "intro-copy-0" => self.copy[0] = (!gone).then(|| (texture.cloned(), frame)),
            "intro-copy-1-title" => self.copy[1] = (!gone).then(|| (texture.cloned(), frame)),
            "intro-copy-1-sub" => self.copy[2] = (!gone).then(|| (texture.cloned(), frame)),
            _ => self.probe.child(texture),
        }
    }

    fn submitted(&mut self) {
        self.probe.submitted();
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.arena.submitted();
        }
    }

    /// The copy where it is drawn (for VoiceOver's boxes); the rest is the surface's own.
    fn placement(&self, index: usize) -> Option<Placement> {
        let which = match self.names.get(index).map(String::as_str) {
            Some("intro-copy-0") => 0,
            Some("intro-copy-1-title") => 1,
            Some("intro-copy-1-sub") => 2,
            _ => return Some(crate::probe::hidden()),
        };
        let (_, dx, dy) = layers::copy_at(which, self.morph.as_ref().map_or(0.0, |m| m.scroll()) as f32, self.canvas.0, self.scale, self.reduced);
        Some(Placement { hidden: false, homography: [1.0, 0.0, dx, 0.0, 1.0, dy, 0.0, 0.0, 1.0], depth: 0.0, clip_depth: [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0]] })
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
        self.canvas = (frame.width, frame.height);
        self.scale = frame.scale;
        let stage = self.stage_box(frame.width, frame.height);
        let wants = self.render_frame(frame, stage, device, queue, encoder, target, format);
        // The button's word turns as the pager passes half a page, whatever moves it.
        let side = self.morph.as_ref().map_or(0.0, |m| m.scroll()) >= 0.5;
        if self.side.is_some_and(|s| s != side) {
            self.heard.push_back(("cross", if side { 1.0 } else { 0.0 }, 0.0));
        }
        self.side = Some(side);
        // The landing (the board takes touches) and the pager all but at page 1 (a kept
        // "Show me" plays), each heard once a change.
        if let Some(m) = self.morph.as_ref() {
            let landed = m.frame().landed > LANDED_TOUCHABLE;
            if landed != self.landed_told {
                self.landed_told = landed;
                self.heard.push_back(("landed", landed as u8 as f64, 0.0));
            }
            let near = (m.scroll() - 1.0).abs() <= NEARLY_LANDED_PAGE;
            if near != self.near_told {
                self.near_told = near;
                self.heard.push_back(("near", near as u8 as f64, 0.0));
            }
        }
        wants || !self.heard.is_empty()
    }
}

/// Whether the surface takes the intro: its touches, its copy and its dots. On the web the
/// host composites a canvas's children itself and the app's own pager and dots stay.
const TAKES_INTRO: bool = cfg!(not(target_arch = "wasm32"));

/// The dots' row (index.tsx StoryDot's row): 24 pt in, 6 pt down the route (whose
/// safe area reads 0 in it), 24 pt high.
const DOTS_LEFT: f32 = 24.0;
const DOTS_TOP: f32 = 6.0;
const DOTS_ROW: f32 = 24.0;

impl GhostSurface {
    /// RN's stage in a canvas `w`×`h` that is the whole route, on a screen `self.screen` high:
    /// from 56 pt down the screen less the top safe area to `BOARD_COPY_GAP` under where the
    /// board lands, as wide as the screen. The route's top inset is the screen's height less
    /// the route's, less the home indicator's 34 pt where there is one. With no screen height,
    /// the canvas is the stage.
    fn stage_box(&self, w: f32, h: f32) -> [f32; 4] {
        if self.screen <= 0.0 {
            return [0.0, 0.0, w, h];
        }
        let home = ((self.screen - h - 20.0) * 0.6).clamp(0.0, 34.0);
        let inset = self.screen - h - home;
        [0.0, 56.0 - 2.0 * inset, w, 156.0 + w + inset]
    }

    /// One frame: the scene into its own target, then one pass on the canvas: the scene over
    /// its glow in the stage's box, the real board, the copy and the dots.
    #[allow(clippy::too_many_arguments)]
    fn render_frame(
        &mut self,
        canvas: &Frame,
        stage: [f32; 4],
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        let Some((model, bounds)) = self.model.as_mut() else {
            return false;
        };
        // The stage's own frame: the scene, the glow and the board are laid out in it.
        let [sx, sy, sw, sh] = stage;
        let frame = &Frame { width: sw.max(1.0), height: sh.max(1.0), ..*canvas };
        let origin = Vec2::new(sx, sy);
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation, model));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let (pw, ph) = frame.pixels();
        if gpu.targets.as_ref().map(|t| t.size) != Some((pw, ph)) {
            gpu.targets = Some(targets(device, &gpu.composite_layout, &gpu.arena, gpu.glow_at, pw, ph));
        }
        // The page turn, up to this frame.
        let morph = self.morph.get_or_insert_with(|| Morph::at_page(0.0));
        if let Some((page, _)) = self.pending.take() {
            morph.turn(page, frame.now_ms);
        }
        morph.advance(frame.now_ms);
        let mf = morph.frame();
        let settled = morph.settled();
        // The orbit runs from the first frame, on its own clock: held still under Reduce Motion.
        if let Some(last) = self.clip_ms {
            if !self.reduced {
                self.clip_s += (frame.now_ms - last).max(0.0) / 1000.0;
            }
        }
        self.clip_ms = Some(frame.now_ms);
        let t = self.hold.unwrap_or(self.clip_s as f32);
        // The entrance: a frame drawn after the first one moves it on by at most one frame's share.
        if self.drawn && self.reveal < 1.0 {
            let dt = self.last_ms.map_or(REVEAL_FRAME_MS, |l| (frame.now_ms - l).clamp(0.0, REVEAL_FRAME_MS));
            self.reveal = (self.reveal + (dt / REVEAL_MS) as f32).min(1.0);
        }
        // A still for a test is the entrance done.
        let reveal = if self.hold.is_some() { 1.0 } else { reveal_ease(self.reveal) };
        if !self.drawn {
            self.heard.push_back(("reveal", 0.0, 0.0));
        }
        if !self.touchable && reveal >= REVEAL_TOUCH_OPACITY {
            self.touchable = true;
            self.heard.push_back(("reveal", 1.0, 0.0));
        }
        let dip = self.dip.map_or(1.0, |d| dip_at(d, frame.now_ms));
        let dipping = self.dip.is_some_and(|d| frame.now_ms < d.2 + d.3);
        let clip = t - model.duration * (t / model.duration).floor();
        // The orbit's own pose of his root first: a poke is drawn on top of it.
        if self.root.is_none() {
            if let Some(i) = model.node_named("Ghost_Root") {
                let n = &model.nodes[i];
                let (rt, rr, rs) = (n.t, n.r, n.s);
                let (lo, hi) = model.box_under(i, &model.worlds());
                self.root = Some((i, rt, rr, rs, hi.y - lo.y));
            }
        }
        if let Some((i, rt, rr, rs, _)) = self.root {
            let n = &mut model.nodes[i];
            n.t = rt;
            n.r = rr;
            n.s = rs;
        }
        model.pose(clip);
        let now = frame.now_ms;
        // A tap, judged against the frame on screen (the last one drawn): only
        // at rest on the first page, on him, and while he is fully there.
        if let Some((tx, ty)) = self.tap.take() {
            if let (Some((inv, lw, lh, lo, hi, alpha, morph_t)), Some(root)) = (self.last_hit, self.root) {
                let grow = Vec3::splat(root.4 * POKE_SLOP);
                if morph_t.abs() < POKE_MAX_MORPH && alpha > 0.99 && ray_hits(inv, lw, lh, tx, ty, lo - grow, hi + grow) {
                    if let Some(next) = poke::next(self.poke, now) {
                        self.poke = next;
                        self.carried = self.shown;
                        self.landed_pokes += 1;
                        self.heard.push_back(("poke", 0.0, 0.0));
                    }
                }
            }
        }
        // The poke on top of the orbit: squash, jump, and the pirouette. Reduce Motion: the face
        // alone answers (ghost-scene-core.ts:1782-1813).
        let carry = poke::carry(self.poke, now);
        let reduced = self.reduced;
        if let Some((i, _, _, base_s, height)) = self.root {
            let stretch = if reduced { 0.0 } else { poke::stretch(self.poke, now) + self.carried.1 * carry };
            let hop = if reduced { 0.0 } else { poke::hop(self.poke, now) + self.carried.0 * carry };
            self.shown.0 = hop;
            self.shown.1 = stretch;
            let n = &mut model.nodes[i];
            n.s = base_s * Vec3::new(1.0 - stretch / 2.0, 1.0 + stretch, 1.0 - stretch / 2.0);
            n.t.y += hop * height;
            let spin = poke::spin(self.poke, now);
            let stand = poke::stand(self.poke, now);
            if !reduced && (spin != 0.0 || stand > 0.0) {
                // Straightened out of his lean, then turned about the vertical,
                // both about his root (the centre of his head).
                let axis = (n.r * Vec3::Y).normalize();
                let stand_q = Quat::from_rotation_arc(axis, Vec3::Y).slerp(Quat::IDENTITY, 1.0 - stand);
                let spin_q = Quat::from_axis_angle(Vec3::Y, spin) * stand_q;
                n.r = spin_q * n.r;
            }
        }
        let worlds = model.worlds();
        let (w, h) = (frame.width.max(1.0), frame.height.max(1.0));
        let rig = Rig::solve(bounds, w, h);
        let pose = rig.pose(mf.t);
        let view_proj = rig.view_proj(&pose);
        // The face: the clip's, the rung's over it, and what showed at the tap
        // handing over to it.
        let mut expr = scene::expr_at(clip);
        let face_w = poke::face_weight(self.poke, now);
        if face_w > 0.0 {
            expr = expr.toward(&scene::expression(poke::kind(self.poke.level).face()), face_w);
        }
        if carry > 0.0 {
            if let Some(c) = self.carried.2 {
                expr = expr.toward(&c, carry);
            }
        }
        self.shown.2 = Some(expr);
        let eyes = scene::eyes_with(clip, model.duration, expr);
        self.probe.frame(device, encoder);
        let pal = match self.probe.light() {
            Some(true) => scene::LIGHT,
            Some(false) => scene::DARK,
            None => self.palette,
        };
        // The fades, in the morph's biased space (ghost-scene-core's draw).
        let body_alpha = 1.0 - scene::ease(COPY_HOLD.powf(MORPH_BIAS), COPY_FADE.powf(MORPH_BIAS), mf.t);
        let ghost_alpha = 1.0 - scene::ease(GHOST_LEAVE_FROM, 1.0, mf.t);
        if let Some((i, ..)) = self.root {
            let (lo, hi) = model.box_under(i, &worlds);
            self.last_hit = Some((view_proj.inverse(), w, h, lo, hi, ghost_alpha, mf.t));
        }
        let on_screen = body_alpha.max(ghost_alpha) > 0.001;
        let key = Vec3::new(0.0695, -0.0872, 0.9938).normalize();
        let tone = |t: f32| scene::tone_at(scene::GHOST_BG, scene::GHOST_INK, t);
        let su = shaders::scene::Scene {
            view_proj: view_proj.to_cols_array_2d(),
            lit: scene::v4(tone(scene::TONE_LIT)),
            mid: scene::v4(tone(scene::TONE_MID)),
            shade: scene::v4(tone(scene::TONE_SHADE)),
            eye_dark: scene::v4(scene::eye_dark()),
            pupil: scene::v4(tone(0.0)),
            key: scene::v4(key),
            eye_u0: scene::v4(eyes.u[0]),
            eye_u1: scene::v4(eyes.u[1]),
            eye_r0: scene::v4(eyes.r[0]),
            eye_r1: scene::v4(eyes.r[1]),
            eye: [eyes.rad[0], eyes.rad[1], eyes.sq[0], eyes.sq[1]],
            glint_at: [eyes.glint_at[0].x, eyes.glint_at[0].y, eyes.glint_at[1].x, eyes.glint_at[1].y],
            glint_frown: [eyes.glint_r[0], eyes.glint_r[1], eyes.frown[0], eyes.frown[1]],
            lid: [eyes.ap, eyes.ap_soft, eyes.lid_curve, eyes.frown_drop],
            misc: [eyes.gate_lo, eyes.gate_hi, eyes.glint_soft, eyes.k_soft],
            head: [0.04, 0.06, 0.0, 1.0],
        };
        su.write(gpu.arena.at(gpu.scene_at, shaders::scene::Scene::SIZE));
        // three's transparent order: the tiles (renderOrder -1), then back to
        // front by each object's origin, then creation order.
        let mut drawn = std::mem::take(&mut gpu.order);
        drawn.clear();
        for (i, mesh) in gpu.meshes.iter().enumerate() {
            let model_m = worlds[mesh.node];
            let normal = Mat4::from_mat3(Mat3::from_mat4(model_m).inverse().transpose());
            let (color, mode, alpha) = match mesh.kind {
                Kind::TileLight => (scene::linear(pal.light), 0.0, 1.0),
                Kind::TileDark => (scene::linear(pal.dark), 0.0, 1.0),
                Kind::Body => (scene::linear(pal.body), 0.0, body_alpha),
                Kind::Line => (tone(scene::TONE_LIT), 0.0, body_alpha),
                Kind::Ghost => (Vec3::ZERO, 1.0, ghost_alpha),
                Kind::Veil => (Vec3::ZERO, 2.0, ghost_alpha),
            };
            let visible = match mesh.kind {
                Kind::Body | Kind::Line => body_alpha > 0.001,
                _ => true,
            };
            let du = shaders::scene::Draw {
                model: model_m.to_cols_array_2d(),
                normal: normal.to_cols_array_2d(),
                color: [color.x, color.y, color.z, alpha],
                mode: [mode, 0.0, 0.0, 0.0],
            };
            du.write(gpu.arena.at(mesh.offset, shaders::scene::Draw::SIZE));
            if visible {
                let z = view_proj.project_point3(model_m.w_axis.truncate()).z;
                drawn.push((i, z));
            }
        }
        drawn.sort_by(|a, b| {
            let (ma, mb) = (&gpu.meshes[a.0], &gpu.meshes[b.0]);
            let tile = |m: &Mesh| matches!(m.kind, Kind::TileLight | Kind::TileDark);
            tile(mb).cmp(&tile(ma)).then(b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)).then(ma.order.cmp(&mb.order))
        });
        // Reduce Motion: the breath holds at its middle.
        let phase = self.hold_phase.unwrap_or_else(|| breath(frame.now_ms, reduced));
        let size = (w * 0.9).min(360.0);
        // The glow's centre, authored on the page: AURA_AT_BOARD of the
        // width below the board's top, less the beat layer's 48 + 8.
        let board_top = h - w - scene::BOARD_COPY_GAP;
        let cy = board_top + w * 0.72 - 56.0;
        let lin = |c: u32| scene::v4(scene::linear(c));
        let glow = shaders::composite::Glow {
            rect: [w, h, w / 2.0 - size / 2.0, cy - size / 2.0],
            params: [size, phase, 0.0, pal.halo_gain],
            halo: with_w(lin(pal.glow_halo), 1.0),
            core: lin(pal.glow_core),
            contact: lin(pal.glow_contact),
            extra: [pal.contact_gain, if format.is_srgb() { 1.0 } else { 0.0 }, pw as f32, ph as f32],
            // The ghost's frame fades in with the entrance (ghost-3d.tsx revealAlpha) and out with the dip.
            origin: [sx * frame.scale, sy * frame.scale, 1.0 - reveal * dip, 0.0],
            stage: [0.0; 4],
        };
        glow.write(gpu.arena.at(gpu.glow_at, shaders::composite::Glow::SIZE));
        // The real board, where the 3D board's playing surface is: its squares
        // and then its pieces, each draw at the sheet's opacity, as RN Skia's
        // group opacity reaches each draw (sheet-board.tsx): the pieces are
        // faded over squares that are themselves faded.
        let quad = rig.surface_quad(view_proj);
        let opacity = (1.0 - body_alpha).clamp(SHEET_FLOOR, SHEET_CEILING);
        // The pieces arrive once the sheet has taken over from the 3D body
        // (its opacity under half): one 500 ms out-cubic fade, or 160 ms back.
        let entrance_at = |e: (f32, f32, f64, f64), now: f64| {
            let x = ((now - e.2) / e.3).clamp(0.0, 1.0) as f32;
            e.0 + (e.1 - e.0) * (1.0 - (1.0 - x).powi(3))
        };
        let landing = body_alpha < 0.5;
        match self.arriving {
            None => {
                let v = if landing { 1.0 } else { 0.0 };
                self.entrance = (v, v, frame.now_ms, 1.0);
            }
            Some(was) if was != landing => {
                let from = entrance_at(self.entrance, frame.now_ms);
                self.entrance = if landing { (from, 1.0, frame.now_ms, 500.0) } else { (from, 0.0, frame.now_ms, 160.0) };
            }
            _ => {}
        }
        self.arriving = Some(landing);
        let arrival = entrance_at(self.entrance, frame.now_ms);
        let arriving = frame.now_ms < self.entrance.2 + self.entrance.3;
        // Its rest: as wide as the canvas, BOARD_COPY_GAP over its bottom.
        let (cy0, side) = (h - w - scene::BOARD_COPY_GAP, w);
        let rest = [Vec2::new(0.0, cy0), Vec2::new(side, cy0), Vec2::new(side, cy0 + side), Vec2::new(0.0, cy0 + side)];
        let off = quad.iter().zip(rest.iter()).map(|(a, b)| (a.x - b.x).abs().max((a.y - b.y).abs())).fold(0.0f32, f32::max);
        let at_rest = (mf.scroll >= 0.999 && mf.landed >= 0.999) || off < 0.5;
        let (m, corners) = if at_rest { (Mat3::from_translation(Vec2::new(0.0, cy0)), rest) } else { (square_to_quad(side, quad), quad) };
        let board_moving = self.board.frame(frame.now_ms, side, &mut self.board_uniform.cues, &mut self.sprites);
        // The mate shown at rest (the settle watch): the wave's cue after a mate played by hand.
        if self.board.take_settled() {
            self.heard.push_back(("settled", 1.0, 0.0));
        }
        // In the canvas: the stage's box is `origin` down and across it.
        let m = Mat3::from_translation(origin) * m;
        let (inv, fwd) = (m.inverse().to_cols_array(), m.to_cols_array());
        let u = &mut self.board_uniform;
        board::scheme(u, pal.light == scene::LIGHT.light);
        u.inv0 = [inv[0], inv[1], inv[2], 0.0];
        u.inv1 = [inv[3], inv[4], inv[5], 0.0];
        u.inv2 = [inv[6], inv[7], inv[8], 0.0];
        u.fwd0 = [fwd[0], fwd[1], fwd[2], 0.0];
        u.fwd1 = [fwd[3], fwd[4], fwd[5], 0.0];
        u.fwd2 = [fwd[6], fwd[7], fwd[8], 0.0];
        u.view = [canvas.width, canvas.height, frame.scale, side];
        u.misc[0] = opacity * dip;
        u.misc[1] = opacity * arrival * dip;
        u.misc[2] = if format.is_srgb() { 1.0 } else { 0.0 };
        // The squares' pass covers the quad's bounds, a pixel around.
        let (mut lo, mut hi) = (Vec2::splat(f32::MAX), Vec2::splat(f32::MIN));
        for c in corners {
            lo = lo.min(c + origin);
            hi = hi.max(c + origin);
        }
        let (cw, ch) = canvas.pixels();
        let px = |v: f32, max: u32| ((v * frame.scale).max(0.0) as u32).min(max);
        let (x0, y0) = (px(lo.x - 1.0, cw), px(lo.y - 1.0, ch));
        let (x1, y1) = (px(hi.x + 1.0, cw) + 1, px(hi.y + 1.0, ch) + 1);
        let scissor = [x0, y0, x1.min(cw).saturating_sub(x0), y1.min(ch).saturating_sub(y0)];
        let sprites = gpu.board.fill(&mut gpu.arena, &self.board_uniform, &self.sprites);
        // The copy and the dots, by where the pager is (layers.rs).
        let p = self.morph.as_ref().map_or(0.0, |m| m.scroll()) as f32;
        let mut draws = Vec::with_capacity(5);
        for (which, c) in self.copy.iter().enumerate() {
            if let Some((Some(tex), [x, y, w, h])) = c {
                let (opacity, dx, dy) = layers::copy_at(which as u8, p, canvas.width, frame.scale, reduced);
                let opacity = opacity * reveal * dip;
                if opacity > 0.001 {
                    draws.push(layers::Draw::Texture(tex, [x + dx, y + dy, *w, *h], opacity));
                }
            }
        }
        if self.screen > 0.0 && TAKES_INTRO {
            draws.extend(layers::dot_draws(p, (DOTS_LEFT, DOTS_TOP + DOTS_ROW / 2.0), self.probe.light() == Some(true), reveal));
        }
        let n = gpu.layers.prepare(device, &mut gpu.arena, (canvas.width, canvas.height), format.is_srgb(), &draws);
        gpu.arena.flush(queue, encoder);
        // The scene, once its uniforms are in (the arena's copy precedes it).
        let tg = gpu.targets.as_ref().unwrap();
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ghost scene"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &tg.color,
                    resolve_target: Some(&tg.resolve),
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Discard },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &tg.depth,
                    depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_bind_group(0, &gpu.scene_bind, &[]);
            for &(i, _) in &drawn {
                let mesh = &gpu.meshes[i];
                pass.set_pipeline(if mesh.double_sided { &gpu.both } else { &gpu.front });
                pass.set_bind_group(1, &mesh.bind, &[]);
                pass.set_vertex_buffer(0, mesh.vertices.slice(..));
                pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.count, 0, 0..1);
            }
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("intro"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            // Nothing of the scene shows once the frame and the ghost are both
            // gone: the RN canvas stops drawing its frame there, glow and all.
            if on_screen {
                let (ox, oy) = (sx * frame.scale, sy * frame.scale);
                pass.set_viewport(ox, oy, pw as f32, ph as f32, 0.0, 1.0);
                pass.set_pipeline(&gpu.composite);
                pass.set_bind_group(0, &tg.composite_bind, &[]);
                pass.draw(0..3, 0..1);
                pass.set_viewport(0.0, 0.0, cw as f32, ch as f32, 0.0, 1.0);
            }
            gpu.board.encode(&mut pass, scissor, sprites, (cw, ch));
            gpu.layers.encode(&mut pass, n);
        }
        gpu.order = drawn;
        self.last_ms = Some(frame.now_ms);
        self.drawn = true;
        if self.hold.is_some() && self.hold_phase.is_some() {
            return !settled;
        }
        // The orbit, the blinks and the breath run while the scene shows; the
        // landed board asks for nothing until its next turn (RN's loop sleeps).
        !settled || on_screen || arriving || board_moving || self.poke.level > 0 && carry > 0.0 || self.reveal < 1.0 || dipping
    }
}

fn targets(device: &wgpu::Device, layout: &wgpu::BindGroupLayout, arena: &gfx::Arena, glow_at: usize, width: u32, height: u32) -> Targets {
    let texture = |label, format, samples, usage| {
        device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: samples,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage,
                view_formats: &[],
            })
            .create_view(&Default::default())
    };
    let color = texture("ghost msaa", SCENE_FORMAT, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT);
    let resolve = texture("ghost scene", SCENE_FORMAT, 1, wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING);
    let depth = texture("ghost depth", DEPTH_FORMAT, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT);
    let composite_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ghost composite"),
        layout,
        entries: &[
            wgpu::BindGroupEntry { binding: shaders::composite::G.binding, resource: arena.binding(glow_at, shaders::composite::Glow::SIZE) },
            wgpu::BindGroupEntry { binding: shaders::composite::SCENE.binding, resource: wgpu::BindingResource::TextureView(&resolve) },
        ],
    });
    Targets { size: (width, height), color, resolve, depth, composite_bind }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, model: &Model) -> Gpu {
    use wgpu::util::DeviceExt;
    let sm = device.create_shader_module(shaders::scene::module());
    let g0 = device.create_bind_group_layout(&shaders::scene::GROUP_0);
    let g1 = device.create_bind_group_layout(&shaders::scene::GROUP_1);
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("ghost scene"),
        bind_group_layouts: &[Some(&g0), Some(&g1)],
        immediate_size: 0,
    });
    // three's NormalBlending, straight alpha into the scene pass.
    let normal_blending = wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::SrcAlpha,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
    };
    let cache = crate::gfx::pipeline_cache(device);
    let pipeline = |cull: Option<wgpu::Face>| {
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ghost scene"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &sm,
                entry_point: Some(shaders::scene::entry::VS),
                buffers: &[Some(shaders::scene::VertexIn::LAYOUT)],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &sm,
                entry_point: Some(shaders::scene::entry::FS),
                targets: &[Some(wgpu::ColorTargetState { format: SCENE_FORMAT, blend: Some(normal_blending), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState { cull_mode: cull, front_face: wgpu::FrontFace::Ccw, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_FORMAT,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::LessEqual),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState { count: MSAA, ..Default::default() },
            multiview_mask: None,
            cache: cache.handle.as_ref(),
        })
    };
    let front = pipeline(Some(wgpu::Face::Back));
    let both = pipeline(None);
    let cm = device.create_shader_module(shaders::composite::module());
    let composite_layout = device.create_bind_group_layout(&shaders::composite::GROUP_0);
    let composite =
        gfx::fullscreen(device, format, &cm, &composite_layout, shaders::composite::entry::VS, shaders::composite::entry::FS, None, "ghost composite");
    // Every block written per frame, in one buffer written once (gfx::Arena).
    let mut arena = gfx::Arena::new(device, "intro uniforms", 32 * 1024);
    let scene_at = arena.reserve(shaders::scene::Scene::SIZE);
    let glow_at = arena.reserve(shaders::composite::Glow::SIZE);
    let draw_at: Vec<usize> = model.prims.iter().map(|_| arena.reserve(shaders::scene::Draw::SIZE)).collect();
    let scene_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ghost scene"),
        layout: &g0,
        entries: &[wgpu::BindGroupEntry { binding: shaders::scene::S.binding, resource: arena.binding(scene_at, shaders::scene::Scene::SIZE) }],
    });
    let meshes = model
        .prims
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let vertices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("ghost vertices"),
                contents: bytemuck::cast_slice(&p.vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
            let indices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("ghost indices"),
                contents: bytemuck::cast_slice(&p.indices),
                usage: wgpu::BufferUsages::INDEX,
            });
            let offset = draw_at[i];
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("ghost draw"),
                layout: &g1,
                entries: &[wgpu::BindGroupEntry { binding: shaders::scene::D.binding, resource: arena.binding(offset, shaders::scene::Draw::SIZE) }],
            });
            Mesh { vertices, indices, count: p.indices.len() as u32, offset, bind, node: p.node, order: i, kind: p.kind, double_sided: p.double_sided }
        })
        .collect();
    Gpu {
        format,
        generation,
        front,
        both,
        composite,
        composite_layout,
        board: board::Gpu::new(device, queue, format, &mut arena),
        layers: Layers::new(device, format, &mut arena),
        scene_at,
        scene_bind,
        glow_at,
        meshes,
        order: Vec::new(),
        targets: None,
        arena,
    }
}

/// A new ghost surface, for the registry.
pub fn ghost() -> Box<dyn Surface> {
    Box::new(GhostSurface::default())
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    /// Renders stills for comparison with the RN reference: set
    /// `GHOST_STILLS="t1,t2,…"` (clip seconds), `GHOST_PHASE`, and for the
    /// page turn `GHOST_TURN` (clip seconds at the tap) with `GHOST_AFTER`
    /// (ms after it, one still each); `EXACT_GPU_OUT` names where the RGBA
    /// dumps go. The canvas is the iPhone Air's: 420 points wide, `GHOST_H`
    /// (default 644) tall, at 3x.
    #[test]
    fn stills() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => {
                eprintln!("{error}; ghost readback skipped");
                return;
            }
        };
        let height: f32 = std::env::var("GHOST_H").ok().and_then(|v| v.parse().ok()).unwrap_or(644.0);
        let mut frame = Frame {
            width: 420.0,
            height,
            scale: 3.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let phase = std::env::var("GHOST_PHASE").ok().and_then(|v| v.parse().ok()).unwrap_or(0.5);
        let save = |px: &fixture::Pixels, name: String| {
            if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
                let out = std::path::PathBuf::from(out);
                std::fs::create_dir_all(&out).unwrap();
                std::fs::write(out.join(format!("{name}-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
            }
        };
        let stills = std::env::var("GHOST_STILLS").unwrap_or_else(|_| "0".into());
        for t in stills.split(',') {
            let t: f32 = t.trim().parse().unwrap();
            let mut s = GhostSurface::default();
            s.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
            s.hold = Some(t);
            s.hold_phase = Some(phase);
            let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
            assert!(px.count(|p| p[3] > 250) > 1000, "the scene draws");
            // The glow under them: beside the board, left of the ghost, the
            // canvas is the glow's warm haze, not clear (RN 01-intro-dark).
            let glow = px.at(300, 350 * 3);
            assert!(glow[3] >= 8, "the glow draws beside the board: {glow:?}");
            save(&px, format!("ghost-{t}"));
        }
        // The page turn: the clip runs on from `turn`, the breath holds.
        if let Ok(turn) = std::env::var("GHOST_TURN") {
            let turn: f64 = turn.parse().unwrap();
            let after = std::env::var("GHOST_AFTER").unwrap_or_else(|_| "0,500,1000,2500".into());
            let mut s = GhostSurface::default();
            s.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
            s.hold_phase = Some(phase);
            frame.now_ms = 0.0;
            fixture::render(&gpu, &mut s, &frame).unwrap();
            let tap = turn * 1000.0;
            frame.now_ms = tap;
            fixture::render(&gpu, &mut s, &frame).unwrap();
            s.bind(&[Value::str("dark"), Value::Number(1.0)], Some(tap)).unwrap();
            for ms in after.split(',') {
                let ms: f64 = ms.trim().parse().unwrap();
                frame.now_ms = tap + ms;
                let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
                save(&px, format!("turn-{ms}"));
            }
        }
    }

    /// The intro's puzzle at rest on page 1, drawn by the surface: the squares'
    /// colours, a piece, a label and the selection's gold where Contract's
    /// board drew them (dumped as `board-…` with `EXACT_GPU_OUT`).
    #[test]
    fn board_at_rest() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut position = vec![".."; 64];
        for (k, sq) in [
            ("br", 0),
            ("br", 6),
            ("bk", 7),
            ("bp", 8),
            ("bp", 9),
            ("bp", 14),
            ("bp", 15),
            ("bp", 18),
            ("wn", 28),
            ("wp", 48),
            ("wp", 49),
            ("wp", 53),
            ("wp", 54),
            ("wp", 55),
            ("wr", 58),
            ("wk", 62),
        ] {
            position[sq] = k;
        }
        let args = |selected: i32, targets: &str| {
            vec![
                Value::str("dark"),
                Value::Number(1.0),
                Value::Number(-9.0),
                Value::Number(0.0),
                Value::Number(0.0),
                Value::Number(0.0),
                Value::Number(0.0),
                Value::str(&position.concat()),
                Value::str(targets),
                Value::str(&format!("{selected},-1,-1,-1,-1,arc,0")),
                Value::Number(-1.0),
                Value::Number(0.0),
                Value::Number(0.0),
                Value::Number(0.0),
                Value::Number(0.0),
            ]
        };
        let (w, h) = (420.0f32, 600.0f32);
        let mut frame = Frame {
            width: w,
            height: h,
            scale: 3.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = GhostSurface::default();
        s.bind(&args(-1, ""), None).unwrap();
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        let top = ((h - w - scene::BOARD_COPY_GAP) * 3.0) as u32;
        let sq = 157.5f32;
        let at = |c: f32, r: f32| px.at((c * sq) as u32, top + (r * sq) as u32);
        // a6 is light (#FDE5D9), b6 dark (#A48574), at the sheet's ceiling.
        let a6 = at(0.5, 2.5);
        assert!((a6[0] as i32 - 0xFD).abs() <= 2 && (a6[2] as i32 - 0xD9).abs() <= 2, "a6 light: {a6:?}");
        let b6 = at(1.5, 2.5);
        assert!((b6[0] as i32 - 0xA4).abs() <= 2 && (b6[1] as i32 - 0x85).abs() <= 2, "b6 dark: {b6:?}");
        // The knight on e5 is drawn: its body is near white, not the square's colour.
        let e5 = at(4.5, 3.5);
        assert!(e5[0] > 0xF0 && e5[2] > 0xF0, "the white knight: {e5:?}");
        if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
            let out = std::path::PathBuf::from(out);
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(out.join(format!("board-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
        }
        // Picked up: the knight's square turns gold, over the next 70 ms.
        frame.now_ms = 16.0;
        s.bind(&args(28, "45,13,43"), Some(16.0)).unwrap();
        fixture::render(&gpu, &mut s, &frame).unwrap();
        frame.now_ms = 200.0;
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        let e5 = px.at((4.05 * sq) as u32, top + (3.05 * sq) as u32);
        assert!(e5[0] > 0xD0 && e5[1] > 0xA0 && e5[2] < 0x90, "e5 in its gold: {e5:?}");
        let f3 = px.at((5.5 * sq) as u32, top + (5.5 * sq) as u32);
        assert!(f3[0] < 0xF0, "a move dot on f3: {f3:?}");
    }

    /// The intro as one canvas: the stage drawn where its child says, the dots over the page.
    #[test]
    fn the_stage_draws_in_its_box_on_the_screen() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let frame = Frame {
            width: 420.0,
            height: 912.0,
            scale: 1.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = GhostSurface::default();
        s.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
        s.hold = Some(0.0);
        s.hold_phase = Some(0.5);
        s.screen = 912.0 + 68.0 + 34.0;
        // A piece of copy, as the host hands it: its own texture and frame.
        let copy = gfx::target(&gpu.device, "copy", wgpu::TextureFormat::Bgra8Unorm, 420, 120);
        fixture::render(&gpu, &mut s, &frame).unwrap();
        s.child(0, "intro-copy-0", Some(&copy), [0.0, 577.0, 420.0, 120.0]);
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        assert!(px.count(|p| p[3] > 250) > 1000, "the stage draws");
        let glow0 = px.at(300, 450);
        assert!(glow0[3] >= 8, "the stage under the copy: {glow0:?}");
        let dot = px.at(30, 18);
        assert!(dot[3] > 200, "the first dot: {dot:?}");
        let glow = px.at(300, 450);
        assert!(glow[3] >= 8, "the glow draws beside the board, in the stage's box: {glow:?}");
    }

    /// A tap on the ghost, in the screen-sized canvas, pokes him (the stage is offset in it).
    #[test]
    fn a_tap_on_him_pokes_him_in_the_screen_canvas() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut frame = Frame {
            width: 420.0,
            height: 810.0,
            scale: 1.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = GhostSurface::default();
        s.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
        s.screen = 912.0;
        s.hold = Some(0.0);
        s.hold_phase = Some(0.5);
        fixture::render(&gpu, &mut s, &frame).unwrap();
        let _ = s.published();
        let mut poked = None;
        'grid: for gy in (100..500).step_by(20) {
            for gx in (20..400).step_by(20) {
                let (x, y) = (gx as f32, gy as f32);
                let at = frame.now_ms;
                s.input(&InputEvent::Pointer {
                    id: 1,
                    phase: PointerPhase::Down,
                    x,
                    y,
                    dx: 0.0,
                    dy: 0.0,
                    kind: exact_gpu::PointerKind::Touch,
                    buttons: 1,
                    at_ms: at,
                    shift_key: false,
                    ctrl_key: false,
                    alt_key: false,
                    meta_key: false,
                });
                s.input(&InputEvent::Pointer {
                    id: 1,
                    phase: PointerPhase::Up,
                    x,
                    y,
                    dx: 0.0,
                    dy: 0.0,
                    kind: exact_gpu::PointerKind::Touch,
                    buttons: 0,
                    at_ms: at + 50.0,
                    shift_key: false,
                    ctrl_key: false,
                    alt_key: false,
                    meta_key: false,
                });
                frame.now_ms += 3000.0;
                fixture::render(&gpu, &mut s, &frame).unwrap();
                if let Some(rec) = s.published() {
                    if rec.contains("\"act\":\"poke\"") {
                        poked = Some((gx, gy));
                        break 'grid;
                    }
                }
            }
        }
        assert!(poked.is_some(), "some tap on the stage pokes him");
    }
    fn canvas(width: f32, height: f32, now_ms: f64) -> Frame {
        Frame {
            width,
            height,
            scale: 1.0,
            now_ms,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    /// Every record the surface has for the app, in order: (act, a).
    fn heard(s: &mut GhostSurface) -> Vec<(String, f64)> {
        let mut out = Vec::new();
        while let Some(m) = s.published() {
            let field = |k: &str| m.split(&format!("\"{k}\":")).nth(1).map(|r| r.split([',', '}']).next().unwrap().trim_matches('"').to_string());
            out.push((field("act").unwrap(), field("a").unwrap().parse().unwrap()));
            if s.heard.is_empty() {
                break;
            }
        }
        out
    }

    /// The intro's inputs, all 20: the scheme, the page, at rest, a knight on e5, the flags
    /// (`reduced`, `dipped`) and the screen's height (912 + 68 + 34, an Air's).
    fn inputs(page: f64, reduced: bool, dipped: bool) -> Vec<Value> {
        let mut position = vec![".."; 64];
        position[28] = "wn";
        let mut v =
            vec![Value::str("dark"), Value::Number(page), Value::Number(-9.0), Value::Number(0.0), Value::Number(0.0), Value::Number(0.0), Value::Number(0.0)];
        v.extend([Value::str(&position.concat()), Value::str(""), Value::str("-1,-1,-1,-1,-1,arc,0")]);
        v.extend([-1.0, 0.0, 0.0, 0.0, 0.0, 0.0].map(Value::Number));
        v.extend([reduced as u8 as f64, 0.0, 912.0 + 68.0 + 34.0, dipped as u8 as f64].map(Value::Number));
        v
    }

    /// ghost-3d.tsx:326-348, reveal-curve.ts: the first drawn frame is clear and tells the app the
    /// entrance starts; each frame after it moves the fade on by at most 1/60 s of REVEAL_MS (a long
    /// frame counts as one), the app hears it take touches once revealEase passes 0.5 (the fifth
    /// frame at 60 Hz), and the whole is in after REVEAL_MS of frames.
    #[test]
    fn the_intro_enters_over_360_ms_of_drawn_frames() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut s = GhostSurface::default();
        s.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
        s.hold_phase = Some(0.5);
        let (px, _) = fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 0.0)).unwrap();
        assert_eq!(px.count(|p| p[3] > 8), 0, "nothing shows on the first frame");
        assert_eq!(heard(&mut s), vec![("reveal".to_string(), 0.0)]);
        let mut touchable_at = None;
        for k in 1..=21 {
            fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, k as f64 * REVEAL_FRAME_MS)).unwrap();
            if heard(&mut s).contains(&("reveal".to_string(), 1.0)) {
                touchable_at.get_or_insert(k);
            }
        }
        assert_eq!(touchable_at, Some(5));
        assert!(s.reveal > 0.97 && s.reveal < 1.0, "{}", s.reveal);
        // A stall counts as one frame.
        fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 2000.0)).unwrap();
        assert_eq!(s.reveal, 1.0);
        let (px, _) = fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 2016.0)).unwrap();
        assert!(px.count(|p| p[3] > 250) > 1000, "the scene is in");
        let mut late = GhostSurface::default();
        late.bind(&[Value::str("dark"), Value::Number(0.0)], None).unwrap();
        fixture::render(&gpu, &mut late, &canvas(420.0, 644.0, 0.0)).unwrap();
        fixture::render(&gpu, &mut late, &canvas(420.0, 644.0, 1000.0)).unwrap();
        assert!((late.reveal as f64 - REVEAL_FRAME_MS / REVEAL_MS).abs() < 1e-5);
    }

    /// ghost-scene-core.ts:1746-1817 under Reduce Motion: the clip holds (no orbit, blink or
    /// change of face), the breath holds at its middle, and a poke is the face alone.
    #[test]
    fn reduce_motion_holds_the_clip_the_breath_and_the_pokes_motion() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        assert_eq!(breath(1300.0, true), 0.5);
        assert!(breath(0.0, false) == 0.0 && breath(GLOW_BREATH_MS, false) == 1.0);
        for reduced in [false, true] {
            let mut s = GhostSurface::default();
            s.bind(&inputs(0.0, reduced, false), None).unwrap();
            fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 0.0)).unwrap();
            s.poke = poke::State { level: 1, at: 1000.0 };
            fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 1140.0)).unwrap();
            assert_eq!(s.clip_s == 0.0, reduced, "the clip's clock: {}", s.clip_s);
            assert_eq!(s.shown.0 == 0.0 && s.shown.1 == 0.0, reduced, "hop and squash: {:?}", (s.shown.0, s.shown.1));
            assert!(poke::face_weight(s.poke, 1140.0) > 0.0, "the face answers either way");
        }
    }

    /// Reduce Motion's dip, when the app hands it over (`dipped`): the stage fades out over 120 ms
    /// and back over 260 ms, the dots (RN's top row, outside the pattern layer) stay.
    #[test]
    fn the_dip_fades_the_page_and_not_the_dots() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut s = GhostSurface::default();
        s.bind(&inputs(0.0, true, false), None).unwrap();
        s.hold = Some(0.0);
        s.hold_phase = Some(0.5);
        let (px, _) = fixture::render(&gpu, &mut s, &canvas(420.0, 912.0, 0.0)).unwrap();
        let (glow, dot) = (px.at(300, 450)[3], px.at(30, 18)[3]);
        assert!(glow >= 8 && dot > 200, "{glow} {dot}");
        s.bind(&inputs(0.0, true, true), Some(16.0)).unwrap();
        let (px, _) = fixture::render(&gpu, &mut s, &canvas(420.0, 912.0, 16.0 + DIP_OUT_MS)).unwrap();
        assert_eq!(px.at(300, 450)[3], 0, "the stage is out");
        assert!(px.at(30, 18)[3] > 200, "the dot stays");
        s.bind(&inputs(1.0, true, false), Some(140.0)).unwrap();
        let (px, _) = fixture::render(&gpu, &mut s, &canvas(420.0, 912.0, 140.0 + DIP_IN_MS / 2.0)).unwrap();
        let mid = px.at(30, 18)[3];
        assert!(mid > 200, "{mid}");
        assert!((dip_at(s.dip.unwrap(), 140.0 + DIP_IN_MS / 2.0) - 0.5).abs() < 1e-4);
    }

    /// The app hears when the board takes touches (its landing fade past 0.99) and when the pager
    /// is within 0.005 of page 1 (a kept "Show me" plays): pattern-beat.tsx:530-536, :713-722.
    #[test]
    fn the_landing_and_the_last_half_percent_are_heard() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let mut s = GhostSurface::default();
        s.bind(&inputs(0.0, false, false), None).unwrap();
        s.hold_phase = Some(0.5);
        fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, 0.0)).unwrap();
        heard(&mut s);
        s.bind(&inputs(1.0, false, false), Some(0.0)).unwrap();
        let mut when = std::collections::HashMap::new();
        let mut t = 0.0;
        while t < 3000.0 {
            t += REVEAL_FRAME_MS;
            fixture::render(&gpu, &mut s, &canvas(420.0, 644.0, t)).unwrap();
            for (act, a) in heard(&mut s) {
                if a == 1.0 {
                    when.entry(act).or_insert(t);
                }
            }
        }
        let near = when["near"];
        assert!((1300.0..1450.0).contains(&near), "{near}");
        assert!(when.contains_key("landed"), "{when:?}");
    }
}
