//! The intro's 2D board, drawn by the stage itself as the RN intro draws it: "One WebGPU canvas
//! draws everything … react-native-chessboard NEVER mounts in the flow. Its piece PNGs are
//! loaded as textures" (onboarding/README.md, laws 0 and 1; sheet-board.tsx). Ports
//! react-native-chessboard's Skia board (vendor/react-native-chessboard/src: the squares, the
//! labels, `skia-cues`, `skia-dots.tsx`, `skia-hover.tsx`), its piece motion (state/move-executor.ts,
//! config/animations.ts SCALE_SPRING and LIFT_SPRING, hooks/use-board-gesture.ts) and the
//! intro's knight jump (pattern-beat.tsx KNIGHT_ARC).
//!
//! Contract binds the position, the selection and the cues only when they change, and the
//! finger's travel while a piece is carried; every fade, flight and spring runs here, on the
//! surface's clock. The board is drawn through the homography the stage gives it (the 3D
//! board's corners while the camera flies, its rest square once landed).

use exact_gpu::wgpu;

use crate::{board_glyphs, gfx, shaders};

/// The RN sprite's pieces (the app's `assets/pieces`), one layer each, in this order.
const KINDS: [&str; 12] = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];
const PIECE_PNGS: [&[u8]; 12] = [
    include_bytes!("../textures/pieces/wk.png"),
    include_bytes!("../textures/pieces/wq.png"),
    include_bytes!("../textures/pieces/wr.png"),
    include_bytes!("../textures/pieces/wb.png"),
    include_bytes!("../textures/pieces/wn.png"),
    include_bytes!("../textures/pieces/wp.png"),
    include_bytes!("../textures/pieces/bk.png"),
    include_bytes!("../textures/pieces/bq.png"),
    include_bytes!("../textures/pieces/br.png"),
    include_bytes!("../textures/pieces/bb.png"),
    include_bytes!("../textures/pieces/bn.png"),
    include_bytes!("../textures/pieces/bp.png"),
];
const GLYPH_PNG: &[u8] = include_bytes!("../textures/board-glyphs.png");
const PIECE_PX: u32 = 256;

/// The board's colours (app.tamber `board.*`), encoded sRGB, premultiplied.
const LIGHT: u32 = 0xFDE5D9FF;
const DARK: u32 = 0xA48574FF;
const LAST: u32 = 0xC18E357A;
const SEL_ON_LIGHT: u32 = 0xC18E35CC;
const SEL_ON_DARK: u32 = 0xF4C26ACC;
// On the light page the palette is lifted by LIGHT_SCHEME_LIFT 0.04 in OKLCH lightness
// (use-board-palette.ts lightenPalette, values from its lightenColor); the wrong move's red is no
// palette colour and stays.
const LIFTED_LIGHT: u32 = 0xFFF2E6FF;
const LIFTED_DARK: u32 = 0xB19180FF;
const LIFTED_LAST: u32 = 0xCE9A437A;
const LIFTED_SEL_ON_LIGHT: u32 = 0xCE9A43CC;
const LIFTED_SEL_ON_DARK: u32 = 0xFFCF77CC;
const LIFTED_CHECK: u32 = 0xF35A5694;

/// The squares and cues in the page's scheme.
pub fn scheme(u: &mut shaders::board::Board, light: bool) {
    let pick = |l: u32, d: u32| rgba(if light { l } else { d });
    u.light = pick(LIFTED_LIGHT, LIGHT);
    u.dark = pick(LIFTED_DARK, DARK);
    u.last = pick(LIFTED_LAST, LAST);
    u.sel_on_light = pick(LIFTED_SEL_ON_LIGHT, SEL_ON_LIGHT);
    u.sel_on_dark = pick(LIFTED_SEL_ON_DARK, SEL_ON_DARK);
    u.check = pick(LIFTED_CHECK, CHECK);
}
/// patterns.ts sandstone `checkHighlight`, rgba(229, 76, 74, 0.58): a flat fill (skia-cues.tsx).
const CHECK: u32 = 0xE54C4A94;
const WRONG: u32 = 0xCC333673;
const DOT: u32 = 0x00000026;
/// The hover cue: black at 0.08 (skia-hover.tsx).
const HOVER: u32 = 0x00000014;
/// Where a label's baseline sits under the top of its line, in ems, as the Contract board's
/// `text` laid it out (measured off its capture).
const LABEL_BASELINE: f32 = 0.755;

/// A cue fades in over 70 ms and out over 90 ms, linearly (config/animations.ts CUE_APPEAR_MS,
/// CUE_DISMISS_MS).
const CUE_IN_MS: f64 = 70.0;
const CUE_OUT_MS: f64 = 90.0;
/// A captured piece stays whole for this share of its capturer's travel, then fades out linearly
/// (config/animations.ts CAPTURE_FADE_DELAY_FRACTION, state/piece-motion.ts startCaptureFade).
const CAPTURE_FADE_DELAY_FRACTION: f64 = 0.75;

/// Who owns a square's cue: the channel of the uniform's `cues[s]` it is drawn from
/// (board.wgsl: last move, selection, check, wrong).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Cue {
    Last = 0,
    Select = 1,
    Check = 2,
    Wrong = 3,
}

/// The board's cues as lit squares, highest priority first, each square once (skia-cues.tsx
/// `resolved`): a caller's mark (the wrong move), the check, the selection, the square under a
/// carried piece (in the selection's colour), the last move's from and to.
pub fn resolve_cues(input: &Input, hovered: Option<usize>) -> [Option<Cue>; 64] {
    let mut out = [None; 64];
    let mut claim = |s: i32, c: Cue| {
        if (0..64).contains(&s) && out[s as usize].is_none() {
            out[s as usize] = Some(c);
        }
    };
    claim(input.wrong, Cue::Wrong);
    claim(input.check, Cue::Check);
    claim(input.selected, Cue::Select);
    claim(hovered.map_or(-1, |h| h as i32), Cue::Select);
    claim(input.from, Cue::Last);
    claim(input.to, Cue::Last);
    out
}
/// A move dot's reveal and dismissal (skia-dots.tsx).
const DOT_MS: f64 = 90.0;
/// KNIGHT_ARC and the board's own slide.
const ARC_MS: f64 = 460.0;
const SLIDE_MS: f64 = 180.0;
thread_local! {
    /// MOVE_TIMING's easing (config/animations.ts:80): Reanimated's Easing.inOut(Easing.quad).
    static MOVE_EASING: motion::Easing = motion::Easing::in_out(motion::Easing::Quad);
}
/// The piece in hand: grows to 1.8 on SCALE_SPRING (stiffness 6241, damping 158) and its offset
/// from the finger springs on LIFT_SPRING (576, 48), both critically damped (ω = √k).
const SCALE_OMEGA: f32 = 79.0;
const LIFT_OMEGA: f32 = 24.0;
const HAND_SCALE: f32 = 1.8;
/// The mate's settle watch (pattern-beat.tsx settleWatch): the board's cues fade rather than
/// vanish (CUE_FADE_MS: the hover ring and dots in 90 ms, the check in 70), then SETTLE_FRAMES
/// frames running with the knight full size and still.
const CUE_FADE_MS: f64 = 150.0;
const SETTLE_FRAMES: u32 = 3;
/// DRAG_LIFT: the piece rides 0.4 of a square above the finger (its centre 0.9 above its grab).
const DRAG_LIFT: f32 = 0.4;
/// Sprites at most: the hover cue, 32 pieces, 64 dots or rings, and the level board's lit
/// squares under a carried piece (the one it is over and those still fading).
const MAX_SPRITES: usize = 1 + 32 + 64 + 4;

/// How a move reaches its square.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
    /// The intro's knight jump.
    Arc,
    /// The board's slide.
    Slide,
    /// Put down where it is let go.
    Instant,
}

/// A carried piece: its square, the finger's travel since the press and where in its square
/// it was pressed (points).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Drag {
    pub sq: usize,
    pub x: f32,
    pub y: f32,
    pub grab_x: f32,
    pub grab_y: f32,
}

/// What Contract binds: the position (a kind index + 1 per square, 0 empty), the selected
/// piece's legal squares, the cues, how the last move travelled and how many were made, and
/// the piece in hand.
#[derive(Clone, Debug, PartialEq)]
pub struct Input {
    pub squares: [u8; 64],
    pub targets: u64,
    pub selected: i32,
    pub from: i32,
    pub to: i32,
    pub check: i32,
    pub wrong: i32,
    pub motion: Motion,
    pub moves: u32,
    pub drag: Option<Drag>,
}

impl Default for Input {
    fn default() -> Self {
        Input { squares: [0; 64], targets: 0, selected: -1, from: -1, to: -1, check: -1, wrong: -1, motion: Motion::Instant, moves: 0, drag: None }
    }
}

fn sq_of(n: f64) -> i32 {
    if (0.0..64.0).contains(&n) {
        n as i32
    } else {
        -1
    }
}

impl Input {
    /// From the surface's arguments: the position (`"wk"`, `".."` per square, a8 first), the
    /// targets (`"45,13"`), the cues (`"selected,from,to,check,wrong,motion,moves"`), and the
    /// piece in hand (its square, -1 when none, the finger's travel and the grab).
    pub fn parse(position: &str, targets: &str, cues: &str, drag: [f64; 5]) -> Result<Input, String> {
        let mut input = Input::default();
        let bytes = position.as_bytes();
        if bytes.len() != 128 {
            return Err(format!("board: expected 64 squares, got {} characters", bytes.len()));
        }
        for (s, cell) in bytes.chunks(2).enumerate() {
            if cell != b".." {
                let kind = std::str::from_utf8(cell).unwrap_or("");
                let k = KINDS.iter().position(|k| *k == kind).ok_or_else(|| format!("board: unknown piece \"{kind}\""))?;
                input.squares[s] = k as u8 + 1;
            }
        }
        for t in targets.split(',').filter(|t| !t.is_empty()) {
            let s: f64 = t.trim().parse().map_err(|_| format!("board: bad target \"{t}\""))?;
            if sq_of(s) >= 0 {
                input.targets |= 1 << sq_of(s);
            }
        }
        let c: Vec<&str> = cues.split(',').collect();
        if c.len() != 7 {
            return Err(format!("board: expected 7 cues, got \"{cues}\""));
        }
        let num = |i: usize| -> Result<f64, String> { c[i].trim().parse().map_err(|_| format!("board: bad cue \"{}\"", c[i])) };
        input.selected = sq_of(num(0)?);
        input.from = sq_of(num(1)?);
        input.to = sq_of(num(2)?);
        input.check = sq_of(num(3)?);
        input.wrong = sq_of(num(4)?);
        input.motion = match c[5].trim() {
            "arc" => Motion::Arc,
            "slide" => Motion::Slide,
            _ => Motion::Instant,
        };
        input.moves = num(6)? as u32;
        let [sq, x, y, gx, gy] = drag;
        input.drag = (sq_of(sq) >= 0).then(|| Drag { sq: sq as usize, x: x as f32, y: y as f32, grab_x: gx as f32, grab_y: gy as f32 });
        Ok(input)
    }
}

/// An eased value: CSS's transition, retargeted from wherever it is.
#[derive(Clone, Copy, Debug)]
struct Fade {
    from: f32,
    to: f32,
    start: f64,
    ms: f64,
    curve: Curve,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Curve {
    Linear,
    OutCubic,
    InCubic,
    DotShow,
    DotHide,
}

impl Curve {
    fn at(self, x: f32) -> f32 {
        let out_cubic = |x: f32| 1.0 - (1.0 - x).powi(3);
        let in_cubic = |x: f32| x * x * x;
        match self {
            Curve::Linear => x,
            Curve::OutCubic => out_cubic(x),
            Curve::InCubic => in_cubic(x),
            Curve::DotShow => (1.6 * out_cubic(x)).min(1.0),
            Curve::DotHide => 1.0 - (1.6 * (1.0 - in_cubic(x))).min(1.0),
        }
    }
}

impl Fade {
    const fn still(v: f32) -> Fade {
        Fade { from: v, to: v, start: 0.0, ms: 1.0, curve: Curve::Linear }
    }
    fn value(&self, now: f64) -> f32 {
        let x = ((now - self.start) / self.ms).clamp(0.0, 1.0) as f32;
        self.from + (self.to - self.from) * self.curve.at(x)
    }
    fn moving(&self, now: f64) -> bool {
        self.from != self.to && now < self.start + self.ms
    }
    fn retarget(&mut self, to: f32, now: f64, ms: f64, curve: Curve) {
        if to != self.to {
            *self = Fade { from: self.value(now), to, start: now, ms, curve };
        }
    }
}

/// A critically damped spring (Exact's `-exact-spring(k, 2√k, 1)`) toward `to`.
#[derive(Clone, Copy, Debug)]
struct Spring {
    from: [f32; 2],
    velocity: [f32; 2],
    to: [f32; 2],
    start: f64,
    omega: f32,
}

impl Spring {
    fn at_rest(v: [f32; 2], omega: f32) -> Spring {
        Spring { from: v, velocity: [0.0; 2], to: v, start: 0.0, omega }
    }
    /// Value and velocity (per second) at `now`.
    fn state(&self, now: f64) -> ([f32; 2], [f32; 2]) {
        let t = ((now - self.start) / 1000.0).max(0.0) as f32;
        let e = (-self.omega * t).exp();
        let mut x = [0.0; 2];
        let mut v = [0.0; 2];
        for k in 0..2 {
            let a = self.from[k] - self.to[k];
            let b = self.velocity[k] + self.omega * a;
            x[k] = self.to[k] + (a + b * t) * e;
            v[k] = (b - self.omega * (a + b * t)) * e;
        }
        (x, v)
    }
    fn value(&self, now: f64) -> [f32; 2] {
        self.state(now).0
    }
    fn retarget(&mut self, to: [f32; 2], now: f64) {
        let (x, v) = self.state(now);
        *self = Spring { from: x, velocity: v, to, start: now, omega: self.omega };
    }
    fn moving(&self, now: f64) -> bool {
        let (x, v) = self.state(now);
        (0..2).any(|k| (x[k] - self.to[k]).abs() > 1e-3 || v[k].abs() > 1e-2)
    }
}

/// A piece on its way to its square: from where it was drawn (squares), the clock, and how.
#[derive(Clone, Copy, Debug)]
struct Flight {
    from: [f32; 2],
    start: f64,
    motion: Motion,
    /// The jump's long axis is the file (the across leg leads).
    across_leads: bool,
}

fn bezier_pace(t: f32) -> f32 {
    gfx::bezier(0.45, 0.0, 0.2, 1.0, t)
}
fn out_quad(x: f32) -> f32 {
    1.0 - (1.0 - x) * (1.0 - x)
}
fn in_out_quad(x: f32) -> f32 {
    if x < 0.5 {
        2.0 * x * x
    } else {
        1.0 - (-2.0 * x + 2.0).powi(2) / 2.0
    }
}
/// The jump's swell: 1, 1.14, 1, on out-quad then in-out-quad.
fn swell(t: f32) -> f32 {
    if t < 0.5 {
        1.0 + 0.14 * out_quad(2.0 * t)
    } else {
        1.14 - 0.14 * in_out_quad(2.0 * t - 1.0)
    }
}

impl Flight {
    /// Where it is, in squares, toward `to`; whether it still moves.
    fn at(&self, to: [f32; 2], now: f64) -> ([f32; 2], bool) {
        let ms = if self.motion == Motion::Arc { ARC_MS } else { SLIDE_MS };
        let t = ((now - self.start) / ms).clamp(0.0, 1.0) as f32;
        let (ex, ey) = match self.motion {
            Motion::Arc => {
                let p = bezier_pace(t);
                let (lead, trail) = (1.0 - (1.0 - p) * (1.0 - p), p * p);
                if self.across_leads {
                    (lead, trail)
                } else {
                    (trail, lead)
                }
            }
            _ => {
                let e = MOVE_EASING.with(|m| m.at(t as f64)) as f32;
                (e, e)
            }
        };
        ([self.from[0] + (to[0] - self.from[0]) * ex, self.from[1] + (to[1] - self.from[1]) * ey], t < 1.0)
    }
}

fn col(s: usize) -> f32 {
    (s % 8) as f32
}
fn rank(s: usize) -> f32 {
    (s / 8) as f32
}

/// The square a carried piece would drop on: under its centre as drawn, clamped to the board
/// (use-board-gesture.ts squareUnderFinger, fed `finger + holdX/holdY` with the hold's spring
/// where it is NOW, not where it is going). `lift` is the piece's offset from its square plus the
/// finger's travel: at rest `(grab − ½, grab − 0.9)` squares, so the centre rides DRAG_LIFT above
/// the finger.
fn hover_square(d: &Drag, sq: f32, lift: [f32; 2]) -> usize {
    let x = (col(d.sq) * sq + d.x + lift[0] + sq / 2.0).clamp(0.0, 8.0 * sq - 1.0);
    let y = (rank(d.sq) * sq + d.y + lift[1] + sq / 2.0).clamp(0.0, 8.0 * sq - 1.0);
    (y / sq).floor() as usize * 8 + (x / sq).floor() as usize
}

/// The lift's offset at rest: centred on the finger, DRAG_LIFT of a square above it.
fn lift_rest(d: &Drag, sq: f32) -> [f32; 2] {
    [d.grab_x - sq / 2.0, d.grab_y - (0.5 + DRAG_LIFT) * sq]
}

/// Touch resampled onto the display's frames (use-board-gesture.ts's `resampler`): on a frame
/// with no new touch the carried piece is drawn where the finger will be if it keeps going (the
/// last step, scaled by how many frames a step usually spans), held one frame more, then put
/// back under the finger. A frame with news draws the truth.
#[derive(Clone, Copy, Debug)]
struct Resampler {
    /// The finger's travel as last seen, the frames since it changed, the frames a step spans
    /// (smoothed), the last step per frame and the lead drawn.
    at: [f32; 2],
    frames: u32,
    per_event: f32,
    step: [f32; 2],
    lead: f32,
}

impl Resampler {
    fn new(at: [f32; 2]) -> Resampler {
        Resampler { at, frames: 0, per_event: 1.0, step: [0.0; 2], lead: 0.0 }
    }

    /// One drawn frame, the finger last seen at `at`: how far ahead of it the piece is drawn.
    fn frame(&mut self, at: [f32; 2]) -> [f32; 2] {
        if at != self.at {
            let took = self.frames + 1;
            if took <= 3 {
                self.per_event = self.per_event * 0.7 + took as f32 * 0.3;
            }
            self.step = [(at[0] - self.at[0]) / took as f32, (at[1] - self.at[1]) / took as f32];
            self.at = at;
            self.frames = 0;
            self.lead = 0.0;
        } else {
            self.frames += 1;
            let span = self.per_event.round().max(1.0) as u32;
            if self.frames <= span {
                self.lead = self.frames as f32 / span as f32;
            } else if self.frames == span + 2 {
                self.lead = 0.0;
            }
        }
        [self.step[0] * self.lead, self.step[1] * self.lead]
    }
}

/// A drop the surface put down before the app answered it (use-board-gesture.ts onEnd sets the
/// piece on its square on the UI thread, then tells JS): the move shown over the app's bindings
/// until they carry it (`moves` changes), name another position or selection, or, for anything
/// but a promotion (the picker is open), PROVISIONAL_MS pass.
#[derive(Clone, Copy, Debug)]
struct Provisional {
    from: usize,
    to: usize,
    kind: u8,
    moves: u32,
    selected: i32,
    squares: [u8; 64],
    at: f64,
    promotes: bool,
}

/// How long a drop shown ahead of the app waits for its answer (as the unanswered drop's 150).
const PROVISIONAL_MS: f64 = 150.0;
/// White's pieces are kinds 1 to 6 (KINDS + 1): the player's on both boards (whiteAt).
fn white(kind: u8) -> bool {
    (1..=6).contains(&kind)
}

impl Provisional {
    /// Whether `input` is still the app before its answer.
    fn holds(&self, input: &Input) -> bool {
        input.moves == self.moves && input.selected == self.selected && input.squares == self.squares
    }
    /// The move over `input`: set down at once, the selection and its dots gone.
    fn over(&self, mut input: Input) -> Input {
        input.squares[self.from] = 0;
        input.squares[self.to] = self.kind;
        input.from = self.from as i32;
        input.to = self.to as i32;
        input.selected = -1;
        input.targets = 0;
        input.motion = Motion::Instant;
        input.drag = None;
        input
    }
}

/// The board's state on the surface's clock.
pub struct BoardState {
    shown: Input,
    next: Option<(Input, Option<f64>)>,
    /// Per square: its cue's owner (cut, never blended; held while it fades out) and opacity
    /// (advanceCues); the dot's opacity and scale; the ring's opacity.
    owner: [Cue; 64],
    cue: [Fade; 64],
    dot: [Fade; 64],
    dot_scale: [Fade; 64],
    ring: [Fade; 64],
    /// Per square: the piece flying in, and the jump's swell from its start.
    flights: [Option<Flight>; 64],
    swell: Option<(usize, f64)>,
    /// A captured piece fading while its capturer travels: its kind, square, start and the travel's ms.
    capture: Option<(u8, usize, f64, f64)>,
    /// Reduce Motion: the knight's jump has no swell (move-executor.ts:297).
    pub reduced: bool,
    /// The piece in hand's offset from its square plus the finger (points), and the scale of
    /// the piece it belongs to (its square).
    lift: Spring,
    scale: Spring,
    scale_sq: Option<usize>,
    hover: Fade,
    hover_sq: usize,
    /// The square's side the last frame drew at (points).
    square: f32,
    /// The piece the surface's own touch carries (touch.rs), over what the app binds; and,
    /// once let go, when, until the app answers the drop (or 150 ms pass).
    local: Option<Drag>,
    dropped: Option<f64>,
    /// The carried piece's touch resampled onto the frames.
    resample: Resampler,
    /// A drop shown before the app's answer, and the app's last binding under it.
    provisional: Option<Provisional>,
    app: Input,
    /// The mate's settle watch, armed from its move's landing; and the settle not yet told.
    watch: Option<SettleWatch>,
    settled: bool,
}

/// pattern-beat.tsx `settleWatch`, from `handleMoveSettled` (the move's piece set down: at once
/// for a drop, at the end of its travel otherwise) to the board shown at rest.
#[derive(Clone, Copy, Debug)]
struct SettleWatch {
    /// The landing, and the square the mating piece stands on.
    at: f64,
    to: i32,
    /// The watch's first frame (`settleSince`), the still frames running, the last scale read.
    since: Option<f64>,
    frames: u32,
    scale: f32,
}

impl Default for BoardState {
    fn default() -> Self {
        BoardState {
            shown: Input::default(),
            next: None,
            owner: [Cue::Last; 64],
            cue: [Fade::still(0.0); 64],
            dot: [Fade::still(0.0); 64],
            dot_scale: [Fade::still(0.0); 64],
            ring: [Fade::still(0.0); 64],
            flights: [None; 64],
            swell: None,
            capture: None,
            reduced: false,
            lift: Spring::at_rest([0.0; 2], LIFT_OMEGA),
            scale: Spring::at_rest([1.0; 2], SCALE_OMEGA),
            scale_sq: None,
            hover: Fade::still(0.0),
            hover_sq: 0,
            square: 0.0,
            local: None,
            dropped: None,
            resample: Resampler::new([0.0; 2]),
            provisional: None,
            app: Input::default(),
            watch: None,
            settled: false,
        }
    }
}

impl BoardState {
    /// A binding: applied at the next frame, at `at` (the host's clock) when known.
    pub fn bind(&mut self, mut input: Input, at: Option<f64>, first: bool) {
        // The app's answer to a drop puts the piece down; until then a carried piece is the touch's.
        if self.dropped.take().is_some() {
            self.local = None;
        }
        input.drag = input.drag.or(self.local);
        self.app = input.clone();
        if let Some(p) = self.provisional {
            if p.holds(&input) {
                input = p.over(input);
            } else {
                self.provisional = None;
            }
        }
        if first {
            self.shown = input;
            for (s, c) in resolve_cues(&self.shown, None).into_iter().enumerate() {
                self.owner[s] = c.unwrap_or(Cue::Last);
                self.cue[s] = Fade::still(if c.is_some() { 1.0 } else { 0.0 });
            }
            return;
        }
        // Bindings between two frames keep the first one's time.
        let at = match self.next.take() {
            Some((_, Some(t))) => Some(t),
            _ => at,
        };
        self.next = Some((input, at));
    }

    /// The surface's own touch carries `drag`; None lets it go: put down at once where the
    /// surface can judge the drop (use-board-gesture.ts onEnd), else pending the app's answer.
    pub fn hand(&mut self, drag: Option<Drag>, at: f64) {
        match drag {
            Some(d) => {
                if self.local.is_none_or(|l| l.sq != d.sq) {
                    self.resample = Resampler::new([d.x, d.y]);
                }
                self.local = Some(d);
                self.dropped = None;
            }
            None => {
                self.let_go(at);
                return;
            }
        }
        let mut input = match &self.next {
            Some((i, _)) => i.clone(),
            None => self.shown.clone(),
        };
        input.drag = self.local;
        let at = match self.next.take() {
            Some((_, Some(t))) => Some(t),
            _ => Some(at),
        };
        self.next = Some((input, at));
    }

    /// The carried piece let go at `at`, judged as use-board-gesture.ts onEnd judges it on the UI
    /// thread: not the player's piece, or back on its own square, or (its targets known) not one
    /// of them: home at once; one of its targets: set down there at once. Only a piece whose
    /// targets have not arrived yet waits for the app.
    fn let_go(&mut self, at: f64) {
        let Some(d) = self.local else { return };
        let base = match &self.next {
            Some((i, _)) => i.clone(),
            None => self.shown.clone(),
        };
        let to = hover_square(&d, self.square.max(1.0), self.lift.value(at));
        let kind = base.squares[d.sq];
        let known = base.selected == d.sq as i32;
        let legal = known && to != d.sq && base.targets & (1 << to) != 0;
        if !(legal || !white(kind) || to == d.sq || known) {
            self.dropped = Some(at);
            return;
        }
        self.local = None;
        self.dropped = None;
        let mut input = base;
        input.drag = None;
        if legal {
            let promotes = kind == 6 && to < 8;
            let p = Provisional { from: d.sq, to, kind, moves: self.app.moves, selected: self.app.selected, squares: self.app.squares, at, promotes };
            input = p.over(input);
            self.provisional = Some(p);
        }
        let when = match self.next.take() {
            Some((_, Some(t))) => Some(t),
            _ => Some(at),
        };
        self.next = Some((input, when));
    }

    /// Whether the mate has come to rest as the board draws it since last asked (once per mate).
    pub fn take_settled(&mut self) -> bool {
        std::mem::take(&mut self.settled)
    }

    /// The piece the surface's touch carries.
    pub fn held(&self) -> Option<Drag> {
        self.local
    }

    /// The square a carried piece would drop on at `now`, and the piece's square.
    pub fn drop_square(&self, now: f64) -> Option<(usize, usize)> {
        let d = self.local?;
        Some((d.sq, hover_square(&d, self.square.max(1.0), self.lift.value(now))))
    }

    /// The selected square as drawn (-1 for none).
    pub fn selected(&self) -> i32 {
        self.shown.selected
    }

    /// The position as drawn: a kind (+ 1) per square, 0 empty.
    pub fn occupied_kinds(&self) -> [u8; 64] {
        self.shown.squares
    }

    /// Which squares hold a piece.
    pub fn occupied(&self) -> u64 {
        let i = self.next.as_ref().map(|(i, _)| i).unwrap_or(&self.shown);
        (0..64).filter(|&s| i.squares[s] != 0).fold(0, |m, s| m | 1 << s)
    }

    /// Where the piece on `s` is drawn now, in squares.
    fn place(&self, s: usize, now: f64) -> [f32; 2] {
        let to = [col(s), rank(s)];
        match &self.flights[s] {
            Some(f) => f.at(to, now).0,
            None => to,
        }
    }

    fn apply(&mut self, next: Input, now: f64) {
        let old = std::mem::replace(&mut self.shown, next);
        let new = &self.shown;
        let sq = self.square.max(1.0);
        for s in 0..64 {
            let target = new.targets & (1 << s) != 0;
            let empty = new.squares[s] == 0;
            let (alpha, scale) = if target { (Curve::DotShow, Curve::OutCubic) } else { (Curve::DotHide, Curve::InCubic) };
            let dot = if target && empty { 1.0 } else { 0.0 };
            self.dot[s].retarget(dot, now, DOT_MS, alpha);
            self.dot_scale[s].retarget(dot, now, DOT_MS, scale);
            self.ring[s].retarget(if target && !empty { 1.0 } else { 0.0 }, now, DOT_MS, alpha);
        }
        // The pieces: one that arrives on a square comes from a square of its kind that lost
        // it (the move's own first), from where it was drawn; others appear there.
        let mut landed: Option<usize> = None;
        if old.squares != new.squares {
            let was: Vec<[f32; 2]> = (0..64).map(|s| self.place(s, now)).collect();
            let mut flights = [None; 64];
            let mut lost: Vec<usize> = (0..64).filter(|&s| old.squares[s] != 0 && new.squares[s] != old.squares[s]).collect();
            for s in 0..64 {
                if new.squares[s] == 0 {
                    continue;
                }
                if new.squares[s] == old.squares[s] {
                    flights[s] = self.flights[s];
                    continue;
                }
                let source = lost
                    .iter()
                    .position(|&t| old.squares[t] == new.squares[s] && t as i32 == new.from && s as i32 == new.to)
                    .or_else(|| lost.iter().position(|&t| old.squares[t] == new.squares[s]));
                let Some(k) = source else { continue };
                let t = lost.remove(k);
                // The move's own piece onto an occupied square: the victim fades while it travels.
                if t as i32 == new.from && s as i32 == new.to && old.squares[s] != 0 && new.moves != old.moves && new.motion != Motion::Instant {
                    let ms = if new.motion == Motion::Arc { ARC_MS } else { SLIDE_MS };
                    self.capture = Some((old.squares[s], s, now, ms));
                }
                if old.drag.is_some_and(|d| d.sq == t) {
                    landed = Some(s);
                }
                if new.motion != Motion::Instant {
                    let (dx, dy) = ((col(s) - col(t)).abs(), (rank(s) - rank(t)).abs());
                    flights[s] = Some(Flight { from: was[t], start: now, motion: new.motion, across_leads: dx >= dy });
                }
            }
            self.flights = flights;
        }
        if new.moves != old.moves && new.motion == Motion::Arc && new.to >= 0 && !self.reduced {
            self.swell = Some((new.to as usize, now));
        }
        // The mate (the check appears with its move): watched from its piece's landing. Any other
        // move (a take-back, a reset) ends a watch on the one before.
        if new.moves != old.moves {
            self.watch = None;
            if new.check >= 0 && old.check < 0 && new.to >= 0 {
                let ms = match new.motion {
                    Motion::Instant => 0.0,
                    Motion::Arc => ARC_MS,
                    _ => SLIDE_MS,
                };
                self.watch = Some(SettleWatch { at: now + ms, to: new.to, since: None, frames: 0, scale: 0.0 });
            }
        }
        match (old.drag, new.drag) {
            (None, Some(d)) | (Some(_), Some(d)) if old.drag.map(|o| o.sq) != Some(d.sq) => {
                // Picked up: it grows, and its offset springs from where it stood to centred
                // 0.4 of a square above the finger.
                self.lift = Spring::at_rest([0.0; 2], LIFT_OMEGA);
                self.lift.retarget(lift_rest(&d, sq), now);
                if self.scale_sq != Some(d.sq) {
                    self.scale = Spring::at_rest([1.0; 2], SCALE_OMEGA);
                }
                self.scale.retarget([HAND_SCALE; 2], now);
                self.scale_sq = Some(d.sq);
                self.hover_sq = hover_square(&d, sq, self.lift.value(now));
                self.hover.retarget(1.0, now, CUE_IN_MS, Curve::Linear);
            }
            (Some(d), None) => {
                // Put down at once, where it lands or back home; it shrinks back there.
                self.scale_sq = Some(landed.unwrap_or(d.sq));
                self.scale.retarget([1.0; 2], now);
                self.hover.retarget(0.0, now, CUE_OUT_MS, Curve::Linear);
            }
            _ => {}
        }
        if let Some(d) = &new.drag {
            self.hover_sq = hover_square(d, sq, self.lift.value(now));
        }
        // The cues: each square once, by priority; a square named anew fades in from where it
        // stood, one let go fades out in the colour it had (advanceCues).
        let hovered = self.shown.drag.map(|_| self.hover_sq);
        for (s, c) in resolve_cues(&self.shown, hovered).into_iter().enumerate() {
            match c {
                Some(c) => {
                    self.owner[s] = c;
                    self.cue[s].retarget(1.0, now, CUE_IN_MS, Curve::Linear);
                }
                None => self.cue[s].retarget(0.0, now, CUE_OUT_MS, Curve::Linear),
            }
        }
    }

    /// The captured piece's opacity at `now` (whole, then linear out over the travel's last
    /// quarter), or `None` once its capturer has landed (endCaptureFade).
    fn capture_alpha(&self, now: f64) -> Option<f32> {
        let (_, _, start, ms) = self.capture?;
        let t = (now - start) / ms;
        if t >= 1.0 {
            return None;
        }
        Some((1.0 - ((t - CAPTURE_FADE_DELAY_FRACTION) / (1.0 - CAPTURE_FADE_DELAY_FRACTION)).clamp(0.0, 1.0)) as f32)
    }

    /// Brings the state to `now` for a board of `side` points; the uniform's cues and the
    /// sprites to draw; whether anything still moves.
    pub fn frame(&mut self, now: f64, side: f32, cues: &mut [[f32; 4]; 64], sprites: &mut Vec<shaders::board::Sprite>) -> bool {
        self.square = side / 8.0;
        // A drop the app did not answer (not its piece, nothing to change): put down.
        if self.dropped.is_some_and(|t| now - t > 150.0) {
            self.dropped = None;
            self.local = None;
            let mut input = self.next.as_ref().map(|(i, _)| i.clone()).unwrap_or_else(|| self.shown.clone());
            input.drag = None;
            self.next = Some((input, Some(now)));
        }
        // A drop shown ahead that the app never answered (and no picker is open): the app's.
        if self.provisional.is_some_and(|p| !p.promotes && now - p.at > PROVISIONAL_MS) {
            self.provisional = None;
            let mut input = self.app.clone();
            input.drag = input.drag.or(self.local);
            self.next = Some((input, Some(now)));
        }
        if let Some((input, at)) = self.next.take() {
            if input != self.shown {
                self.apply(input, at.unwrap_or(now).min(now));
            }
        }
        let sq = self.square;
        let mut moving = false;
        for s in 0..64 {
            moving |= self.cue[s].moving(now);
            cues[s] = [0.0; 4];
            cues[s][self.owner[s] as usize] = self.cue[s].value(now);
        }
        let shown = &self.shown;
        sprites.clear();
        let disc = |rect: [f32; 4], kind: f32, alpha: f32, scale: f32, color: u32| shaders::board::Sprite {
            rect,
            look: [kind, 0.0, alpha, scale],
            color: rgba(color),
        };
        let hover = self.hover.value(now);
        moving |= self.hover.moving(now);
        if hover > 0.0 {
            let (c, r) = (col(self.hover_sq), rank(self.hover_sq));
            sprites.push(disc([(c - 0.7) * sq, (r - 0.7) * sq, 2.4 * sq, 2.4 * sq], 1.0, hover, 1.0, HOVER));
        }
        // The victim under its capturer, from the resting layer.
        match self.capture_alpha(now) {
            Some(alpha) => {
                let (kind, s, ..) = self.capture.unwrap();
                sprites.push(shaders::board::Sprite { rect: [col(s) * sq, rank(s) * sq, sq, sq], look: [0.0, (kind - 1) as f32, alpha, 1.0], color: [0.0; 4] });
                moving = true;
            }
            None => self.capture = None,
        }
        let in_hand = shown.drag.map(|d| d.sq);
        let mut held = None;
        for s in 0..64 {
            let kind = shown.squares[s];
            if kind == 0 {
                continue;
            }
            let to = [col(s), rank(s)];
            let (at, flying) = match &self.flights[s] {
                Some(f) => f.at(to, now),
                None => (to, false),
            };
            if !flying {
                self.flights[s] = None;
            }
            moving |= flying;
            let mut scale = 1.0;
            if self.scale_sq == Some(s) {
                scale = self.scale.value(now)[0];
                moving |= self.scale.moving(now);
            }
            if let Some((sw, start)) = self.swell {
                if sw == s {
                    let t = ((now - start) / ARC_MS) as f32;
                    if t < 1.0 {
                        scale = swell(t.max(0.0));
                        moving = true;
                    } else {
                        self.swell = None;
                    }
                }
            }
            let mut rect = [at[0] * sq, at[1] * sq, sq, sq];
            let sprite = |rect: [f32; 4], scale: f32| shaders::board::Sprite { rect, look: [0.0, (kind - 1) as f32, 1.0, scale], color: [0.0; 4] };
            if in_hand == Some(s) {
                let d = shown.drag.unwrap();
                let lift = self.lift.value(now);
                moving |= self.lift.moving(now);
                // The surface's own touch: resampled, and drawn every frame while held.
                let lead = match self.local {
                    Some(l) if l.sq == d.sq => {
                        moving = true;
                        self.resample.frame([d.x, d.y])
                    }
                    _ => [0.0; 2],
                };
                rect[0] += d.x + lift[0] + lead[0];
                rect[1] += d.y + lift[1] + lead[1];
                held = Some(sprite(rect, scale));
            } else {
                sprites.push(sprite(rect, scale));
            }
        }
        for s in 0..64 {
            let (c, r) = (col(s), rank(s));
            let (dot, dot_scale, ring) = (self.dot[s].value(now), self.dot_scale[s].value(now), self.ring[s].value(now));
            moving |= self.dot[s].moving(now) || self.dot_scale[s].moving(now) || self.ring[s].moving(now);
            if dot > 0.0 && dot_scale > 0.0 {
                sprites.push(disc([(c + 0.34) * sq, (r + 0.34) * sq, 0.32 * sq, 0.32 * sq], 1.0, dot, dot_scale, DOT));
            }
            if ring > 0.0 {
                sprites.push(disc([c * sq, r * sq, sq, sq], 2.0, ring, 1.0, DOT));
            }
        }
        sprites.extend(held);
        self.watch_settle(now);
        // A drop shown ahead waits on PROVISIONAL_MS's clock; one held under the promotion picker
        // waits on the app alone, and asks for no frames meanwhile.
        moving || self.next.is_some() || self.dropped.is_some() || self.watch.is_some() || self.provisional.is_some_and(|p| !p.promotes)
    }

    /// The scale the piece on `s` is drawn at: the put-down spring, the jump's swell.
    fn piece_scale(&self, s: usize, now: f64) -> f32 {
        let mut scale = if self.scale_sq == Some(s) { self.scale.value(now)[0] } else { 1.0 };
        if let Some((sw, start)) = self.swell {
            if sw == s && now - start < ARC_MS {
                scale = swell(((now - start) / ARC_MS).max(0.0) as f32);
            }
        }
        scale
    }

    /// One frame of the settle watch (pattern-beat.tsx:878-912): the cues' fade past since its
    /// first frame, the move still the last one, the piece at full size (within 0.002) and still
    /// (within 0.0005 of the last frame), nothing hovered, selected or offered; SETTLE_FRAMES such
    /// frames running and the mate is told settled.
    fn watch_settle(&mut self, now: f64) {
        let Some(mut w) = self.watch else { return };
        if now < w.at {
            return;
        }
        let since = *w.since.get_or_insert(now);
        let scale = if (0..64).contains(&w.to) { self.piece_scale(w.to as usize, now) } else { 1.0 };
        let shown = &self.shown;
        let still = now - since >= CUE_FADE_MS
            && shown.to == w.to
            && (scale - 1.0).abs() < 0.002
            && (scale - w.scale).abs() < 0.0005
            && shown.drag.is_none()
            && shown.selected < 0
            && shown.targets == 0;
        w.scale = scale;
        w.frames = if still { w.frames + 1 } else { 0 };
        if w.frames >= SETTLE_FRAMES {
            self.watch = None;
            self.settled = true;
        } else {
            self.watch = Some(w);
        }
    }
}

/// `0xRRGGBBAA` as premultiplied encoded components.
fn rgba(c: u32) -> [f32; 4] {
    let a = (c & 255) as f32 / 255.0;
    let ch = |shift: u32| ((c >> shift) & 255) as f32 / 255.0 * a;
    [ch(24), ch(16), ch(8), a]
}

/// The board's colours and the glyphs' metrics, the uniform's fixed part.
pub fn uniform_base() -> shaders::board::Board {
    let mut cell = [[0.0; 4]; 16];
    let mut em = [[0.0; 4]; 16];
    for (g, (c, e)) in board_glyphs::GLYPHS.iter().enumerate() {
        cell[g] = *c;
        em[g] = *e;
    }
    shaders::board::Board {
        inv0: [0.0; 4],
        inv1: [0.0; 4],
        inv2: [0.0; 4],
        fwd0: [0.0; 4],
        fwd1: [0.0; 4],
        fwd2: [0.0; 4],
        view: [0.0; 4],
        misc: [0.0, 0.0, 0.0, LABEL_BASELINE],
        light: rgba(LIGHT),
        dark: rgba(DARK),
        last: rgba(LAST),
        sel_on_light: rgba(SEL_ON_LIGHT),
        sel_on_dark: rgba(SEL_ON_DARK),
        check: rgba(CHECK),
        wrong: rgba(WRONG),
        atlas: [board_glyphs::ATLAS[0] as f32, board_glyphs::ATLAS[1] as f32, board_glyphs::EM_PX, 0.0],
        cues: [[0.0; 4]; 64],
        cell,
        em,
    }
}

/// The board's pipelines, textures and buffers; made once per target format and shader
/// generation.
pub struct Gpu {
    pub squares: wgpu::RenderPipeline,
    pub sprites: wgpu::RenderPipeline,
    /// Where its uniform and its sprites sit in the surface's arena.
    uniform_at: usize,
    sprites_at: usize,
    pub bind: wgpu::BindGroup,
}

fn decode(png_bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(png_bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().expect("a vendored PNG");
    let mut buf = vec![0; reader.output_buffer_size().expect("a vendored PNG's size")];
    let info = reader.next_frame(&mut buf).expect("a vendored PNG");
    buf.truncate(info.buffer_size());
    (info.width, info.height, buf)
}

/// Halves an image of `channels` per pixel (a box filter, odd edges kept).
fn halve(w: u32, h: u32, channels: usize, px: &[u8]) -> (u32, u32, Vec<u8>) {
    let (nw, nh) = ((w / 2).max(1), (h / 2).max(1));
    let mut out = vec![0u8; (nw * nh) as usize * channels];
    for y in 0..nh {
        for x in 0..nw {
            for c in 0..channels {
                let mut sum = 0u32;
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let (sx, sy) = ((2 * x + dx).min(w - 1), (2 * y + dy).min(h - 1));
                    sum += px[((sy * w + sx) as usize) * channels + c] as u32;
                }
                out[((y * nw + x) as usize) * channels + c] = ((sum + 2) / 4) as u8;
            }
        }
    }
    (nw, nh, out)
}

fn mip_count(w: u32, h: u32) -> u32 {
    32 - w.max(h).leading_zeros()
}

/// Uploads `levels` of a texture, mip by mip, layer by layer.
fn upload(queue: &wgpu::Queue, texture: &wgpu::Texture, layer: u32, channels: u32, mut w: u32, mut h: u32, mut px: Vec<u8>) {
    let mips = texture.mip_level_count();
    for level in 0..mips {
        queue.write_texture(
            wgpu::TexelCopyTextureInfo { texture, mip_level: level, origin: wgpu::Origin3d { x: 0, y: 0, z: layer }, aspect: wgpu::TextureAspect::All },
            &px,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(w * channels), rows_per_image: Some(h) },
            wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        );
        if level + 1 < mips {
            let (nw, nh, next) = halve(w, h, channels as usize, &px);
            (w, h, px) = (nw, nh, next);
        }
    }
}

impl Gpu {
    pub fn new(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, arena: &mut gfx::Arena) -> Gpu {
        let module = device.create_shader_module(shaders::board::module());
        let layout = device.create_bind_group_layout(&shaders::board::GROUP_0);
        let blend = Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING);
        let squares =
            gfx::fullscreen(device, format, &module, &layout, shaders::board::entry::VS_SQUARES, shaders::board::entry::FS_SQUARES, blend, "board squares");
        let sprites =
            gfx::fullscreen(device, format, &module, &layout, shaders::board::entry::VS_SPRITE, shaders::board::entry::FS_SPRITE, blend, "board sprites");
        // The pieces: the RN sprite's 256 px PNGs, premultiplied, one layer each, mipmapped.
        let piece_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("board pieces"),
            size: wgpu::Extent3d { width: PIECE_PX, height: PIECE_PX, depth_or_array_layers: KINDS.len() as u32 },
            mip_level_count: mip_count(PIECE_PX, PIECE_PX),
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        for (layer, bytes) in PIECE_PNGS.iter().enumerate() {
            let (w, h, mut px) = decode(bytes);
            assert!(w == PIECE_PX && h == PIECE_PX && px.len() == (w * h * 4) as usize, "a 256 px RGBA piece");
            for p in px.chunks_mut(4) {
                let a = p[3] as u32;
                for c in &mut p[..3] {
                    *c = ((*c as u32 * a + 127) / 255) as u8;
                }
            }
            upload(queue, &piece_tex, layer as u32, 4, w, h, px);
        }
        let (gw, gh, gpx) = decode(GLYPH_PNG);
        let glyph_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("board glyphs"),
            size: wgpu::Extent3d { width: gw, height: gh, depth_or_array_layers: 1 },
            mip_level_count: mip_count(gw, gh),
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let channels = (gpx.len() / (gw * gh) as usize).max(1);
        let gray: Vec<u8> = gpx.chunks(channels).map(|p| p[0]).collect();
        upload(queue, &glyph_tex, 0, 1, gw, gh, gray);
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("board"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        let uniform_at = arena.reserve(shaders::board::Board::SIZE);
        let sprites_at = arena.reserve(MAX_SPRITES * shaders::board::Sprite::SIZE);
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("board"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: shaders::board::B.binding, resource: arena.binding(uniform_at, shaders::board::Board::SIZE) },
                wgpu::BindGroupEntry {
                    binding: shaders::board::GLYPHS.binding,
                    resource: wgpu::BindingResource::TextureView(&glyph_tex.create_view(&Default::default())),
                },
                wgpu::BindGroupEntry {
                    binding: shaders::board::PIECES.binding,
                    resource: wgpu::BindingResource::TextureView(
                        &piece_tex.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() }),
                    ),
                },
                wgpu::BindGroupEntry { binding: shaders::board::SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                wgpu::BindGroupEntry {
                    binding: shaders::board::SPRITES.binding,
                    resource: arena.binding(sprites_at, MAX_SPRITES * shaders::board::Sprite::SIZE),
                },
            ],
        });
        Gpu { squares, sprites, uniform_at, sprites_at, bind }
    }

    /// Fills this frame's uniform and sprites in the arena: how many sprites to draw.
    pub fn fill(&self, arena: &mut gfx::Arena, uniform: &shaders::board::Board, sprites: &[shaders::board::Sprite]) -> u32 {
        uniform.write(arena.at(self.uniform_at, shaders::board::Board::SIZE));
        let n = sprites.len().min(MAX_SPRITES);
        if n > 0 {
            let out = arena.at(self.sprites_at, n * shaders::board::Sprite::SIZE);
            for (i, s) in sprites[..n].iter().enumerate() {
                s.write(&mut out[i * shaders::board::Sprite::SIZE..]);
            }
        }
        n as u32
    }

    /// Draws the board into `pass` (a target `size` pixels): its squares within `scissor`
    /// (pixels: x, y, w, h), then `n` sprites.
    pub fn encode(&self, pass: &mut wgpu::RenderPass<'_>, scissor: [u32; 4], n: u32, size: (u32, u32)) {
        pass.set_bind_group(0, &self.bind, &[]);
        if scissor[2] > 0 && scissor[3] > 0 {
            pass.set_scissor_rect(scissor[0], scissor[1], scissor[2], scissor[3]);
            pass.set_pipeline(&self.squares);
            pass.draw(0..3, 0..1);
        }
        // What follows in the pass draws anywhere.
        pass.set_scissor_rect(0, 0, size.0, size.1);
        if n > 0 {
            pass.set_pipeline(&self.sprites);
            pass.draw(0..6, 0..n);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WN: u8 = 5;
    const BP: u8 = 12;
    const BK: u8 = 7;

    fn input(pieces: &[(usize, u8)], from: i32, to: i32, moves: u32, motion: Motion) -> Input {
        let mut i = Input { from, to, moves, motion, ..Input::default() };
        for &(s, k) in pieces {
            i.squares[s] = k;
        }
        i
    }

    fn frame(b: &mut BoardState, now: f64) -> ([[f32; 4]; 64], Vec<shaders::board::Sprite>) {
        let mut cues = [[0.0; 4]; 64];
        let mut sprites = Vec::new();
        b.frame(now, 400.0, &mut cues, &mut sprites);
        (cues, sprites)
    }

    /// skia-cues.tsx `resolved`: a caller's mark, the check, the selection, the square under a
    /// carried piece, the last move; each square once, the first claim wins.
    #[test]
    fn one_cue_per_square_by_priority() {
        let mut i = Input { selected: 10, from: 7, to: 10, check: 7, wrong: -1, ..Input::default() };
        let r = resolve_cues(&i, Some(20));
        assert_eq!((r[7], r[10], r[20]), (Some(Cue::Check), Some(Cue::Select), Some(Cue::Select)));
        i.wrong = 7;
        assert_eq!(resolve_cues(&i, None)[7], Some(Cue::Wrong));
        assert_eq!(resolve_cues(&i, None).iter().filter(|c| c.is_some()).count(), 2);
    }

    /// cue-fades.test.ts: a lit square cut to a new owner keeps its opacity (no second fade in);
    /// a released square fades out over 90 ms in the colour it had; a new one fades in over 70.
    #[test]
    fn cues_cut_to_their_owner_and_fade_as_advance_cues() {
        let mut b = BoardState::default();
        b.bind(input(&[(28, WN)], 12, 28, 1, Motion::Instant), Some(0.0), true);
        let (c, _) = frame(&mut b, 0.0);
        assert_eq!(c[28], [1.0, 0.0, 0.0, 0.0]);
        // Selected on the last move's square: the selection takes it, at once, lit.
        b.bind(Input { selected: 28, ..input(&[(28, WN)], 12, 28, 1, Motion::Instant) }, Some(100.0), false);
        let (c, _) = frame(&mut b, 100.0);
        assert_eq!(c[28], [0.0, 1.0, 0.0, 0.0]);
        // Let go of everything: out over 90 ms, still in the selection's colour.
        b.bind(input(&[(28, WN)], -1, -1, 1, Motion::Instant), Some(200.0), false);
        let (c, _) = frame(&mut b, 245.0);
        assert!((c[28][1] - 0.5).abs() < 1e-3 && c[28][0] == 0.0, "{:?}", c[28]);
        let (c, _) = frame(&mut b, 290.0);
        assert_eq!(c[28], [0.0; 4]);
        // The check on h8 fades in over 70 ms.
        b.bind(Input { check: 7, ..input(&[(28, WN)], -1, -1, 1, Motion::Instant) }, Some(300.0), false);
        let (c, _) = frame(&mut b, 335.0);
        assert!((c[7][2] - 0.5).abs() < 1e-3, "{:?}", c[7]);
    }

    /// pattern-beat.tsx settleWatch: a dropped mate is told settled once the cues have faded
    /// (150 ms from the watch's first frame) and 3 still frames have run; a tapped one counts
    /// from its 460 ms jump's landing; told once.
    #[test]
    fn the_mate_settles_after_the_cue_fade_and_three_still_frames() {
        let settle = |motion: Motion| {
            let mut b = BoardState::default();
            b.bind(input(&[(28, WN), (7, BK)], -1, -1, 0, motion), Some(0.0), true);
            b.bind(Input { check: 7, ..input(&[(13, WN), (7, BK)], 28, 13, 1, motion) }, Some(0.0), false);
            let mut t = 0.0;
            while t < 2000.0 {
                frame(&mut b, t);
                if b.take_settled() {
                    assert!(!b.take_settled());
                    return t;
                }
                t += 1000.0 / 60.0;
            }
            panic!("never settled");
        };
        let drop = settle(Motion::Instant);
        assert!((150.0..=200.0).contains(&drop), "a drop settles at {drop}");
        let tap = settle(Motion::Arc);
        assert!((ARC_MS + 150.0..=ARC_MS + 210.0).contains(&tap), "a tapped mate settles at {tap}");
    }

    /// A take-back before the mate settled: its watch ends with it, and no settle is told.
    #[test]
    fn a_move_after_the_mate_ends_its_watch() {
        let mut b = BoardState::default();
        b.bind(input(&[(28, WN), (7, BK)], -1, -1, 0, Motion::Instant), Some(0.0), true);
        b.bind(Input { check: 7, ..input(&[(13, WN), (7, BK)], 28, 13, 1, Motion::Instant) }, Some(0.0), false);
        frame(&mut b, 0.0);
        b.bind(input(&[(28, WN), (7, BK)], -1, -1, 2, Motion::Instant), Some(50.0), false);
        let mut t = 50.0;
        while t < 1000.0 {
            frame(&mut b, t);
            assert!(!b.take_settled(), "settled at {t} after the take-back");
            t += 1000.0 / 60.0;
        }
    }

    /// piece-motion.ts startCaptureFade: the victim is whole for 75% of its capturer's travel,
    /// then fades linearly, and is gone when the capturer lands; a drop (instant) takes it at once.
    #[test]
    fn a_captured_piece_fades_over_the_last_quarter_of_the_move() {
        let victim = |sprites: &[shaders::board::Sprite]| sprites.iter().find(|s| s.look[1] == (BP - 1) as f32).map(|s| s.look[2]);
        let mut b = BoardState::default();
        b.bind(input(&[(28, WN), (18, BP)], -1, -1, 0, Motion::Arc), Some(0.0), true);
        frame(&mut b, 0.0);
        b.bind(input(&[(18, WN)], 28, 18, 1, Motion::Arc), Some(0.0), false);
        assert_eq!(victim(&frame(&mut b, 0.0).1), Some(1.0));
        assert_eq!(victim(&frame(&mut b, 0.7 * ARC_MS).1), Some(1.0));
        let half = victim(&frame(&mut b, 0.875 * ARC_MS).1).unwrap();
        assert!((half - 0.5).abs() < 1e-3, "{half}");
        assert_eq!(victim(&frame(&mut b, ARC_MS).1), None);
        let mut b = BoardState::default();
        b.bind(input(&[(28, WN), (18, BP)], -1, -1, 0, Motion::Instant), Some(0.0), true);
        frame(&mut b, 0.0);
        b.bind(input(&[(18, WN)], 28, 18, 1, Motion::Instant), Some(0.0), false);
        assert_eq!(victim(&frame(&mut b, 0.0).1), None);
    }

    /// move-executor.ts:297: under Reduce Motion the knight's jump has no swell.
    #[test]
    fn reduce_motion_drops_the_jumps_swell() {
        for reduced in [false, true] {
            let mut b = BoardState { reduced, ..BoardState::default() };
            b.bind(input(&[(28, WN)], -1, -1, 0, Motion::Arc), Some(0.0), true);
            frame(&mut b, 0.0);
            b.bind(input(&[(13, WN)], 28, 13, 1, Motion::Arc), Some(0.0), false);
            let (_, sprites) = frame(&mut b, ARC_MS / 2.0);
            let knight = sprites.iter().find(|s| s.look[1] == (WN - 1) as f32).unwrap();
            assert_eq!(knight.look[3] > 1.1, !reduced, "{reduced}: {}", knight.look[3]);
        }
    }

    fn knight_at(sprites: &[shaders::board::Sprite]) -> [f32; 2] {
        let k = sprites.iter().find(|s| s.look[0] == 0.0 && s.look[1] == (WN - 1) as f32).unwrap();
        [k.rect[0], k.rect[1]]
    }

    /// The knight on e5 (28) selected, f7 (13) its target, at 50 pt squares.
    fn selected_knight(targets: u64) -> BoardState {
        let mut b = BoardState::default();
        let mut i = input(&[(28, WN)], -1, -1, 0, Motion::Instant);
        i.selected = 28;
        i.targets = targets;
        b.bind(i, Some(0.0), true);
        frame(&mut b, 0.0);
        b
    }

    fn carry(b: &mut BoardState, x: f32, y: f32, at: f64) {
        b.hand(Some(Drag { sq: 28, x, y, grab_x: 25.0, grab_y: 25.0 }), at);
        frame(b, at);
    }

    /// use-board-gesture.ts's resampler: a frame with no touch draws one step ahead, holds it a
    /// frame, then puts the piece back under the finger; a frame with news draws the truth.
    #[test]
    fn a_frame_without_a_touch_is_predicted_then_settled_back() {
        let mut r = Resampler::new([0.0; 2]);
        assert_eq!(r.frame([10.0, 0.0]), [0.0; 2]);
        assert_eq!(r.frame([10.0, 0.0]), [10.0, 0.0]);
        assert_eq!(r.frame([10.0, 0.0]), [10.0, 0.0]);
        assert_eq!(r.frame([10.0, 0.0]), [0.0; 2]);
        // Touch at half the display's rate (60 Hz on 120): the step per frame, half of it ahead.
        let mut r = Resampler::new([0.0; 2]);
        let mut x = 0.0;
        for _ in 0..12 {
            x += 10.0;
            r.frame([x, 0.0]);
            r.frame([x, 0.0]);
        }
        assert_eq!(r.per_event.round(), 2.0);
        x += 10.0;
        r.frame([x, 0.0]);
        assert_eq!(r.frame([x, 0.0]), [2.5, 0.0]);
    }

    /// squareUnderFinger is fed the hold's spring where it is now: just picked up, the piece is
    /// still over its own square, and that is where a release lands.
    #[test]
    fn the_drop_square_follows_the_lift_as_drawn() {
        let mut b = selected_knight(0);
        b.hand(Some(Drag { sq: 28, x: 5.0, y: 0.0, grab_x: 25.0, grab_y: 10.0 }), 0.0);
        frame(&mut b, 0.0);
        assert_eq!(b.drop_square(0.0), Some((28, 28)));
        assert_eq!(b.drop_square(1000.0), Some((28, 20)));
    }

    /// onEnd on the UI thread: a drop on a target is set there on the frame it is let go, and
    /// the app's answer (the move made) does not move it again.
    #[test]
    fn a_legal_drop_is_set_down_at_once() {
        let mut b = selected_knight(1 << 13);
        carry(&mut b, 0.0, 0.0, 0.0);
        carry(&mut b, 50.0, -100.0, 400.0);
        b.hand(None, 400.0);
        assert_eq!(knight_at(&frame(&mut b, 400.0).1), [250.0, 50.0]);
        assert_eq!(b.shown.selected, -1);
        // A binding from before the answer keeps the drop.
        let mut stale = input(&[(28, WN)], -1, -1, 0, Motion::Instant);
        stale.selected = 28;
        stale.targets = 1 << 13;
        b.bind(stale, Some(410.0), false);
        assert_eq!(knight_at(&frame(&mut b, 410.0).1), [250.0, 50.0]);
        b.bind(input(&[(13, WN)], 28, 13, 1, Motion::Instant), Some(420.0), false);
        assert_eq!(knight_at(&frame(&mut b, 420.0).1), [250.0, 50.0]);
        assert!(b.provisional.is_none());
    }

    /// A drop off its targets goes home on the frame it is let go, not after the app's 150 ms.
    #[test]
    fn an_illegal_drop_goes_home_at_once() {
        let mut b = selected_knight(1 << 13);
        carry(&mut b, 0.0, 0.0, 0.0);
        carry(&mut b, -100.0, 0.0, 400.0);
        b.hand(None, 400.0);
        assert_eq!(knight_at(&frame(&mut b, 400.0).1), [200.0, 150.0]);
    }

    /// A piece let go before its targets have come back from the app waits for its answer.
    #[test]
    fn a_drop_before_the_targets_waits_for_the_app() {
        let mut b = BoardState::default();
        b.bind(input(&[(28, WN)], -1, -1, 0, Motion::Instant), Some(0.0), true);
        frame(&mut b, 0.0);
        carry(&mut b, 0.0, 0.0, 0.0);
        carry(&mut b, 50.0, -100.0, 400.0);
        b.hand(None, 400.0);
        assert_ne!(knight_at(&frame(&mut b, 400.0).1), [200.0, 150.0]);
        assert_eq!(knight_at(&frame(&mut b, 600.0).1), [200.0, 150.0]);
    }

    /// The promotion picker holds the drop with no clock of its own: once the board is at rest
    /// under it, the surface asks for no more frames until the app answers.
    #[test]
    fn a_promotion_drop_asks_for_no_frames_while_the_picker_is_open() {
        const WP: u8 = 6;
        let mut b = BoardState::default();
        let mut i = input(&[(12, WP)], -1, -1, 0, Motion::Instant);
        i.selected = 12;
        i.targets = 1 << 4;
        b.bind(i, Some(0.0), true);
        frame(&mut b, 0.0);
        let drag = |y: f32| Some(Drag { sq: 12, x: 0.0, y, grab_x: 25.0, grab_y: 25.0 });
        b.hand(drag(0.0), 0.0);
        frame(&mut b, 0.0);
        b.hand(drag(-50.0), 400.0);
        frame(&mut b, 400.0);
        b.hand(None, 400.0);
        frame(&mut b, 400.0);
        assert!(b.provisional.is_some_and(|p| p.promotes && p.to == 4));
        let (mut cues, mut sprites) = ([[0.0; 4]; 64], Vec::new());
        assert!(!b.frame(5000.0, 400.0, &mut cues, &mut sprites));
        assert!(b.provisional.is_some());
    }
}
