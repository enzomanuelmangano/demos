//! The level test's pieces, drawn and carried by a surface as the RN board carries them
//! (react-native-chessboard: Skia pieces, the pan and tap on the UI thread, use-board-gesture.ts).
//! The level test's board was Contract views whose piece in hand followed a `pan=` action: a
//! runner round trip, a commit and a re-evaluation of both board layers on every finger move,
//! the carried piece trailing the finger and the pan starting only past UIKit's own hysteresis.
//! Here the touch never reaches Contract while it moves: the surface takes the board's touches
//! (touch.rs, the 5 pt pan and the 5 pt tap) and draws the pieces, the dots and the hover cue
//! (board.rs, the intro's board: LIFT_SPRING, SCALE_SPRING, the resampler, the drop set down on
//! the frame it is let go). It tells the app a tap, a lift and a drop, once each.
//!
//! The squares, their cues and labels, the hint and "Why?" stay Contract's (level-test.contract):
//! they change only when a piece is picked up or put down. The one square cue that follows the
//! finger, the square under the carried piece lit in the selection's gold (skia-cues `resolved`),
//! is drawn here, over Contract's squares and under the pieces, in the page's scheme (the canvas's
//! one child is the scheme probe, probe.rs).
//!
//! `levelboard(position, targets, cues, interactive, entrance, reduced)`: the position, targets
//! and cues as the ghost's board takes them (board.contract `boardCode`, `targetCode`,
//! `cueCode`), whether the board is the player's, and the pieces' entrance ("in", "out" or "").

use std::collections::VecDeque;

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{ChildrenMode, Frame, InputEvent, Placement, PointerPhase, Surface, SurfaceError, Value};

use crate::board::{self, BoardState, Cue};
use crate::probe::SchemeProbe;
use crate::touch::{Effect, Effects, Gesture, Scene};
use crate::{gfx, shaders};

/// The surface's inputs.
pub const INPUTS: usize = 6;

/// The pieces' entrance (apps/patterns/src/utils/piece-entrance.ts; board.contract
/// `entranceFade`): a front crosses the board along the a8–h1 diagonals; in, each piece fades over
/// 303 ms after its diagonal's delay × 550 ms; out, over 165 ms after (0.45 − delay) × 300 ms.
/// Its delay is its diagonal's place among the occupied ones × 0.45.
const SWEEP: f32 = 0.45;
const IN_MS: f64 = 550.0;
const IN_FADE_MS: f64 = 303.0;
const OUT_MS: f64 = 300.0;
const OUT_FADE_MS: f64 = 165.0;

/// Each square's entrance delay (0..SWEEP) for the occupied squares in `squares`.
pub fn entrance_delays(squares: &[u8; 64]) -> [f32; 64] {
    let diag = |s: usize| s % 8 + s / 8;
    let mut used = [false; 15];
    for s in (0..64).filter(|&s| squares[s] != 0) {
        used[diag(s)] = true;
    }
    let count = used.iter().filter(|&&u| u).count();
    let mut out = [0.0; 64];
    for (s, d) in out.iter_mut().enumerate() {
        let before = used[..diag(s)].iter().filter(|&&u| u).count();
        *d = before as f32 / (count.max(2) - 1) as f32 * SWEEP;
    }
    out
}

/// The entrance: shown ("" or "in") or gone ("out"), since when, with each square's delay.
#[derive(Clone, Copy, Debug)]
struct Entrance {
    shown: bool,
    at: f64,
    delays: [f32; 64],
}

impl Entrance {
    /// A piece's opacity on `s` at `now`; whether the sweep still runs.
    fn alpha(&self, s: usize, now: f64) -> (f32, bool) {
        let d = self.delays[s] as f64;
        if self.shown {
            let x = ((now - self.at - d * IN_MS) / IN_FADE_MS).clamp(0.0, 1.0);
            (x as f32, x < 1.0)
        } else {
            let x = ((now - self.at - (SWEEP as f64 - d) * OUT_MS) / OUT_FADE_MS).clamp(0.0, 1.0);
            (1.0 - x as f32, x < 1.0)
        }
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    arena: gfx::Arena,
    board: board::Gpu,
}

struct LevelBoard {
    board: BoardState,
    bound: bool,
    interactive: bool,
    entrance: Option<Entrance>,
    entrance_code: String,
    gesture: Gesture,
    /// What the touches did that the app has not heard yet, and how many it has.
    heard: VecDeque<(&'static str, f64, f64)>,
    told: u32,
    side: f32,
    last_ms: Option<f64>,
    uniform: shaders::board::Board,
    sprites: Vec<shaders::board::Sprite>,
    lit: Vec<shaders::board::Sprite>,
    probe: SchemeProbe,
    gpu: Option<Gpu>,
}

impl Default for LevelBoard {
    fn default() -> Self {
        LevelBoard {
            board: BoardState::default(),
            bound: false,
            interactive: false,
            entrance: None,
            entrance_code: String::new(),
            gesture: Gesture::default(),
            heard: VecDeque::new(),
            told: 0,
            side: 0.0,
            last_ms: None,
            uniform: board::uniform_base(),
            sprites: Vec::with_capacity(101),
            lit: Vec::with_capacity(101),
            probe: SchemeProbe::default(),
            gpu: None,
        }
    }
}

fn text(inputs: &[Value], i: usize, name: &str) -> Result<String, SurfaceError> {
    match inputs.get(i) {
        Some(v) => Ok(v.as_str().ok_or_else(|| SurfaceError(format!("levelboard.{name}: expected a string")))?.to_string()),
        None => Err(SurfaceError(format!("levelboard.{name}: missing"))),
    }
}

impl LevelBoard {
    /// What the board's touches did: told to the app once each, the carried piece kept here.
    fn act(&mut self, effects: Effects, at_ms: f64) {
        for effect in effects {
            match effect {
                Effect::Tap(s) => self.heard.push_back(("tap", s as f64, 0.0)),
                Effect::Lift { s, x, y } => {
                    self.board.hand(Some(board::Drag { sq: s, x: 0.0, y: 0.0, grab_x: x, grab_y: y }), at_ms);
                    self.heard.push_back(("lift", s as f64, 0.0));
                }
                Effect::Carry(dx, dy) => {
                    if let Some(held) = self.board.held() {
                        self.board.hand(Some(board::Drag { x: dx, y: dy, ..held }), at_ms);
                    }
                }
                Effect::Drop => {
                    if let Some((from, to)) = self.board.drop_square(at_ms) {
                        self.board.hand(None, at_ms);
                        self.heard.push_back(("drop", from as f64, to as f64));
                    }
                }
                // A pan from an empty square, a tap off the pieces: nothing on this board.
                _ => {}
            }
        }
    }
}

impl Surface for LevelBoard {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) {
        self.gpu = None;
        self.probe.device_lost();
    }

    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        if inputs.len() > INPUTS {
            return Err(SurfaceError(format!("levelboard: expected {INPUTS} inputs, got {}", inputs.len())));
        }
        let input = board::Input::parse(&text(inputs, 0, "position")?, &text(inputs, 1, "targets")?, &text(inputs, 2, "cues")?, [-1.0, 0.0, 0.0, 0.0, 0.0])
            .map_err(SurfaceError)?;
        let num = |i: usize, name: &str| inputs.get(i).map(|v| number(v, name)).transpose();
        self.interactive = num(3, "interactive")?.unwrap_or(0.0) > 0.5;
        let entrance = text(inputs, 4, "entrance")?;
        let reduced = num(5, "reduced")?.unwrap_or(0.0) > 0.5;
        self.board.reduced = reduced;
        let shown = entrance != "out";
        let now = at_ms.or(self.last_ms).unwrap_or(0.0);
        match &self.entrance {
            // The first binding is how it opens: no sweep.
            None => self.entrance = Some(Entrance { shown, at: f64::NEG_INFINITY, delays: [0.0; 64] }),
            Some(e) if e.shown != shown || (entrance == "in" && self.entrance_code != "in") => {
                // Out, the pieces leave from the position they stood in.
                let squares = if shown { input.squares } else { self.board.occupied_kinds() };
                let at = if entrance.is_empty() { f64::NEG_INFINITY } else { now };
                self.entrance = Some(Entrance { shown, at, delays: entrance_delays(&squares) });
            }
            _ => {}
        }
        self.entrance_code = entrance;
        self.board.bind(input, at_ms, !self.bound);
        self.bound = true;
        Ok(())
    }

    /// `{"ev": n, "act": what, "a", "b", "live": 1}`, one at a time; `live` says the surface
    /// takes the board's touches (none where the host gives a surface none: the web).
    fn published(&mut self) -> Option<String> {
        let (act, a, b) = match self.heard.pop_front() {
            Some(e) => e,
            None if self.told == 0 && TAKES_TOUCHES => ("live", 0.0, 0.0),
            None => return None,
        };
        self.told += 1;
        Some(format!("{{\"ev\":{},\"act\":\"{}\",\"a\":{},\"b\":{},\"live\":{}}}", self.told, act, a, b, TAKES_TOUCHES as u8))
    }

    fn wants_input(&self) -> bool {
        TAKES_TOUCHES
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let effects = match phase {
            PointerPhase::Down => {
                // Read when the finger lands, as the pan's onTouchesDown reads `touchable`.
                if !self.interactive || self.side <= 0.0 {
                    return;
                }
                let scene = Scene { width: self.side, board: Some((0.0, 0.0, self.side)), pieces: self.board.occupied(), p: 1.0, reduced: self.board.reduced };
                self.gesture.down(id, x, y, at_ms, scene);
                Effects::default()
            }
            PointerPhase::Move => self.gesture.moved(id, x, y, at_ms),
            PointerPhase::Up => self.gesture.up(id, x, y, at_ms, false),
            PointerPhase::Cancel => self.gesture.up(id, x, y, at_ms, true),
        };
        self.act(effects, at_ms);
    }

    fn children_mode(&self) -> ChildrenMode {
        ChildrenMode::Each
    }

    fn child(&mut self, _index: usize, _name: &str, texture: Option<&wgpu::TextureView>, _frame: [f32; 4]) {
        self.probe.child(texture);
    }

    fn placement(&self, _index: usize) -> Option<Placement> {
        Some(crate::probe::hidden())
    }

    fn submitted(&mut self) {
        self.probe.submitted();
        if let Some(gpu) = &mut self.gpu {
            gpu.arena.submitted();
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
        let now = frame.now_ms;
        self.last_ms = Some(now);
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            let mut arena = gfx::Arena::new(device, "level board uniforms", 16 * 1024);
            let board = board::Gpu::new(device, queue, format, &mut arena);
            self.gpu = Some(Gpu { format, generation: frame.shader_generation, arena, board });
        }
        // The board fills the canvas's width (the canvas is the board's square).
        let side = frame.width;
        self.side = side;
        let mut moving = self.board.frame(now, side, &mut self.uniform.cues, &mut self.sprites);
        if let Some(e) = self.entrance {
            let sq = side / 8.0;
            for s in self.sprites.iter_mut().filter(|s| s.look[0] == 0.0) {
                let (c, r) = ((s.rect[0] / sq).round().clamp(0.0, 7.0) as usize, (s.rect[1] / sq).round().clamp(0.0, 7.0) as usize);
                let (alpha, sweeping) = e.alpha(r * 8 + c, now);
                s.look[2] *= alpha;
                moving |= sweeping;
            }
        }
        self.probe.frame(device, encoder);
        let light = self.probe.light() == Some(true);
        board::scheme(&mut self.uniform, light);
        // The square under the carried piece (and one it just left, fading): the selection's gold,
        // the dark one on light squares; the selected square itself is Contract's.
        let selected = self.board.selected();
        self.lit.clear();
        let sq = side / 8.0;
        for s in (0..64).filter(|&s| s as i32 != selected) {
            let a = self.uniform.cues[s][Cue::Select as usize];
            if a > 0.0 {
                let on_light = (s % 8 + s / 8) % 2 == 0;
                let c = if on_light { self.uniform.sel_on_light } else { self.uniform.sel_on_dark };
                let color = [c[0] * a, c[1] * a, c[2] * a, c[3] * a];
                self.lit.push(shaders::board::Sprite { rect: [(s % 8) as f32 * sq, (s / 8) as f32 * sq, sq, sq], look: [3.0, 0.0, 1.0, 1.0], color });
            }
        }
        self.lit.extend(self.sprites.drain(..));
        std::mem::swap(&mut self.lit, &mut self.sprites);
        let u = &mut self.uniform;
        u.inv0 = [1.0, 0.0, 0.0, 0.0];
        u.inv1 = [0.0, 1.0, 0.0, 0.0];
        u.inv2 = [0.0, 0.0, 1.0, 0.0];
        u.fwd0 = u.inv0;
        u.fwd1 = u.inv1;
        u.fwd2 = u.inv2;
        u.view = [frame.width, frame.height, frame.scale, side];
        u.misc[0] = 0.0;
        u.misc[1] = 1.0;
        u.misc[2] = if format.is_srgb() { 1.0 } else { 0.0 };
        let gpu = self.gpu.as_mut().unwrap();
        let n = gpu.board.fill(&mut gpu.arena, &self.uniform, &self.sprites);
        gpu.arena.flush(queue, encoder);
        let (pw, ph) = frame.pixels();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("level board"),
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
        // The squares are Contract's: only the sprites (an empty scissor skips the squares).
        gpu.board.encode(&mut pass, [0, 0, 0, 0], n, (pw, ph));
        moving || self.gesture.busy() || !self.heard.is_empty() || self.probe.light().is_none()
    }
}

/// Where the host gives a surface touches (not the web, whose Contract handles stay).
const TAKES_TOUCHES: bool = cfg!(not(target_arch = "wasm32"));

/// A new level board surface, for the registry.
pub fn level_board() -> Box<dyn Surface> {
    Box::new(LevelBoard::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// board.contract `entranceDelay`: a diagonal's place among the occupied ones × 0.45.
    #[test]
    fn the_entrance_crosses_the_occupied_diagonals() {
        let mut squares = [0u8; 64];
        // a8 (diagonal 0), e5 (diagonal 7), h1 (diagonal 14).
        for s in [0, 28, 63] {
            squares[s] = 1;
        }
        let d = entrance_delays(&squares);
        assert_eq!((d[0], d[28], d[63]), (0.0, 0.225, 0.45));
        let e = Entrance { shown: true, at: 0.0, delays: d };
        assert_eq!(e.alpha(0, 303.0), (1.0, false));
        assert!(e.alpha(63, 0.45 * 550.0).0 < 1e-6);
        let out = Entrance { shown: false, at: 0.0, delays: d };
        assert_eq!(out.alpha(63, 0.0), (1.0, true));
        assert_eq!(out.alpha(0, 0.45 * 300.0 + 165.0), (0.0, false));
    }

    /// The board's touches reach the app once each: a tap; a lift, then its drop.
    #[test]
    fn a_drag_is_told_as_a_lift_and_a_drop() {
        let mut b = LevelBoard { interactive: true, side: 400.0, ..LevelBoard::default() };
        let mut i = board::Input::default();
        i.squares[28] = 5;
        b.board.bind(i, Some(0.0), true);
        let at = |b: &mut LevelBoard, phase, x, y, at_ms| b.input(&pointer(phase, x, y, at_ms));
        let down = |b: &mut LevelBoard, x, y, ms| at(b, PointerPhase::Down, x, y, ms);
        down(&mut b, 225.0, 175.0, 0.0);
        at(&mut b, PointerPhase::Up, 226.0, 175.0, 50.0);
        down(&mut b, 225.0, 175.0, 100.0);
        at(&mut b, PointerPhase::Move, 231.0, 175.0, 116.0);
        at(&mut b, PointerPhase::Move, 260.0, 120.0, 132.0);
        at(&mut b, PointerPhase::Up, 260.0, 120.0, 148.0);
        let acts: Vec<_> = b.heard.iter().map(|h| (h.0, h.1)).collect();
        assert_eq!(acts, vec![("tap", 28.0), ("lift", 28.0), ("drop", 28.0)]);
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: exact_gpu::PointerKind::Touch,
            buttons: 0,
            shift_key: false,
            ctrl_key: false,
            alt_key: false,
            meta_key: false,
            at_ms,
        }
    }
}
