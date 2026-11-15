//! Chessboard: a live board for both sides, with two player cards and chess clocks, on a puzzle
//! (Lasker–Thomas, London 1912, after 16. Be2+). On checkmate, a glass wave sweeps the screen's
//! snapshot into a haze under the game review card.
//!
//! - Drag: the piece follows the finger and lands on the square it is released on, or springs back.
//!   Tap: select a piece, then tap a square to move it.
//! - Haptics: medium on a capture, rigid on a check, light otherwise; a mate pattern at checkmate;
//!   error on a legal move off the puzzle line.
//! - A legal move off the line lands, shakes and springs home. Each change posts
//!   `puzzle:<wait|play|hint1|hint2|done>`.

// Full API: not every item is used by the board.
#[allow(dead_code)]
mod chess;

use chess::{at, Chess, Kind, Piece, Side};
use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture, Phase, TapGesture};
use pressto::{PressEvent, Pressable};
use motion::{Easing, Spring, SpringConfig, Timing};
use draw2d::{Canvas, Color, Font, Image, Images, Matrix, Paint, Renderer, RsXform};

use crate::gfx;

/// The position after 17...Kg1.
pub const START_FEN: &str = "rn3r2/pbppq1p1/1p2pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18";
const NAME: [&str; 2] = ["lasker", "enzo"];
const RATING: [&str; 2] = ["IM", "???"];
/// Starting clock per side, in seconds.
const CLOCK_START: [i32; 2] = [74, 23];
/// Replay timings, in ms.
const START_DELAY: f64 = 900.0;
const MOVE_GAP: f64 = 260.0;
const AURA_DELAY: f64 = 580.0;
/// The puzzle's start: after 16. Be2+, Black to play its setup move.
pub const PUZZLE_FEN: &str = "rn3r2/pbppq1p1/1p2pN2/8/3P2NP/5kP1/PPP1BP2/R3K2R b KQ - 2 16";
/// The solution from PUZZLE_FEN: 16...Kg2 17. Rh2+ Kg1 18. Kd2#.
const SOLUTION: [(&str, &str); 4] = [("f3", "g2"), ("h1", "h2"), ("g2", "g1"), ("e1", "d2")];
const USER: Side = Side::W;
/// The opponent answers this long after the user's move, in ms.
const REPLY_DELAY: f64 = 500.0;
/// Shake timing for a wrong move, in ms.
const WRONG_SHAKE_AT: f64 = 220.0;
const WRONG_SHAKE_MS: f64 = 320.0;
/// Capture fade timing, in ms.
const CAPTURE_AT: f64 = 90.0;
const CAPTURE_MS: f64 = 200.0;
/// Checkmate wave and fade timings, in ms.
const WAVE_MS: f64 = 3000.0;
const EXIT_MS: f64 = 360.0;

const MOVE_SPRING: Cfg = Cfg { c: SpringConfig { stiffness: 400.0, damping: 40.0, mass: 1.0 }, threshold: 1e-4 };
const SCALE_SPRING: Cfg = Cfg { c: SpringConfig { stiffness: 600.0, damping: 49.0, mass: 1.0 }, threshold: 6e-9 };
const SNAP_BACK_SPRING: Cfg = Cfg { c: SpringConfig { stiffness: 350.0, damping: 37.0, mass: 1.0 }, threshold: 6e-9 };

/// Colours as 0xRRGGBB, shown in Display P3 on iOS.
mod theme {
    pub const BG: u32 = 0x0d0e12;
    pub const SURFACE: u32 = 0x17191f;
    pub const SURFACE_HI: u32 = 0x202329;
    pub const BORDER: u32 = 0x2c2f35;
    pub const TEXT_FAINT: u32 = 0x60636a;
    pub const TEXT_MUTED: u32 = 0x8f9298;
    pub const TEXT: u32 = 0xf0f2f5;
    pub const ACCENT: u32 = 0x3a91f8;
    pub const LOSE: u32 = 0xf56b76;
    pub const BOARD_LIGHT: u32 = 0xe5e8ed;
    pub const BOARD_DARK: u32 = 0x818895;
}

/// Move quality per ply: even plies are White's, odd plies Black's.
#[rustfmt::skip]
const REVIEW: [Q; 35] = [
    Q::Book, Q::Book, Q::Book, Q::Book, Q::Book, Q::Book, Q::Book, Q::Good, Q::Good, Q::Good, Q::Excellent, Q::Inaccuracy,
    Q::Best, Q::Mistake, Q::Best, Q::Blunder, Q::Best, Q::Inaccuracy, Q::Great, Q::Miss, Q::Brilliant, Q::Best, Q::Best,
    Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best, Q::Best,
];
const ACCURACY: [&str; 2] = ["98.1", "64.3"];

/// Quality kinds, in the review table's order.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Q {
    Brilliant,
    Great,
    Book,
    Best,
    Excellent,
    Good,
    Inaccuracy,
    Mistake,
    Miss,
    Blunder,
}
const TABLE_ORDER: [Q; 10] = [Q::Brilliant, Q::Great, Q::Book, Q::Best, Q::Excellent, Q::Good, Q::Inaccuracy, Q::Mistake, Q::Miss, Q::Blunder];
impl Q {
    fn glyph(self) -> &'static str {
        match self {
            Q::Brilliant => "!!",
            Q::Great => "!",
            Q::Book => "⌑",
            Q::Best => "★",
            Q::Excellent | Q::Good => "✓",
            Q::Inaccuracy => "?!",
            Q::Mistake => "?",
            Q::Miss => "✕",
            Q::Blunder => "??",
        }
    }
    fn color(self) -> u32 {
        match self {
            Q::Brilliant => 0x84d5d1,
            Q::Great => 0x90baf1,
            Q::Book => 0xcebb9e,
            Q::Best => 0x93d8b0,
            Q::Excellent => 0xa6dbb6,
            Q::Good => 0xa6d2b6,
            Q::Inaccuracy => 0xe9cf87,
            Q::Mistake => 0xebaf86,
            Q::Miss => 0xe79287,
            Q::Blunder => 0xe18083,
        }
    }
    fn label(self) -> &'static str {
        match self {
            Q::Brilliant => "Brilliant",
            Q::Great => "Great",
            Q::Book => "Book",
            Q::Best => "Best",
            Q::Excellent => "Excellent",
            Q::Good => "Good",
            Q::Inaccuracy => "Inaccuracy",
            Q::Mistake => "Mistake",
            Q::Miss => "Miss",
            Q::Blunder => "Blunder",
        }
    }
}

/// Material value of a piece, in pawns.
fn value(k: Kind) -> i32 {
    match k {
        Kind::P => 1,
        Kind::N | Kind::B => 3,
        Kind::R => 5,
        Kind::Q => 9,
        Kind::K => 0,
    }
}

/// Mate haptic events (ms, amplitude). On Apple the surface posts `haptic:mate` and
/// `haptic:mate-stop` for the `mate-haptic` view, which plays the whole Core Haptics pattern.
/// Without that view (the web build) each event plays as the nearest UIKit impact: amplitude
/// ≥ 0.9 heavy, ≥ 0.5 medium, else light.
const MATE: [(f64, f64); 16] = [
    (0.0, 0.45),
    (90.0, 0.25),
    (240.0, 0.55),
    (330.0, 0.3),
    (400.0, 1.0),
    (470.0, 0.5),
    (540.0, 0.3),
    (700.0, 1.0),
    (760.0, 0.9),
    (900.0, 0.55),
    (1080.0, 0.4),
    (1280.0, 0.3),
    (1500.0, 0.2),
    (1900.0, 0.6),
    (1975.0, 0.75),
    (2060.0, 0.9),
];

static SPRITE: &[u8] = include_bytes!("../images/chessboard/pieces-sprite-768x256.rgba8.zlib");
static BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-chessboard.otf");
static BOLD_TNUM: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-chessboard-tnum.otf");
static HEAVY: &[u8] = include_bytes!("../fonts/sf-pro-rounded-heavy-chessboard.otf");
static COMPACT: &[u8] = include_bytes!("../fonts/sf-compact-rounded-medium-chessboard.otf");
static COMPACT_TNUM: &[u8] = include_bytes!("../fonts/sf-compact-rounded-medium-chessboard-tnum.otf");
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-chessboard-subset.ttf");
static MENLO_BOLD: &[u8] = include_bytes!("../fonts/menlo-bold-chessboard-subset.ttf");
static ZAPF: &[u8] = include_bytes!("../fonts/zapfdingbats-chessboard-subset.ttf");

/// The UI's bitmaps, in [`Images`] order; see gpu/images/chessboard/make.sh.
static UI_IMAGES: [(&[u8], u32); 22] = [
    (include_bytes!("../images/chessboard/avatar-lasker-120x120.rgba8.zlib"), 120),
    (include_bytes!("../images/chessboard/avatar-enzo-120x120.rgba8.zlib"), 120),
    (include_bytes!("../images/chessboard/avatar-lasker-102x102.rgba8.zlib"), 102),
    (include_bytes!("../images/chessboard/avatar-enzo-102x102.rgba8.zlib"), 102),
    (include_bytes!("../images/chessboard/tray-wp-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-wn-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-wb-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-wr-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-wq-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-bp-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-bn-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-bb-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-br-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/tray-bq-48x48.rgba8.zlib"), 48),
    (include_bytes!("../images/chessboard/promo-wq-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-wr-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-wb-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-wn-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-bq-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-br-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-bb-144x144.rgba8.zlib"), 144),
    (include_bytes!("../images/chessboard/promo-bn-144x144.rgba8.zlib"), 144),
];
fn avatar_image(side: Side, big: bool) -> usize {
    (if big { 0 } else { 2 }) + side as usize
}
fn tray_image(side: Side, k: Kind) -> usize {
    4 + side as usize * 5 + k as usize
}
const PROMOTION_PIECES: [Kind; 4] = [Kind::Q, Kind::R, Kind::B, Kind::N];
fn promo_image(side: Side, i: usize) -> usize {
    14 + side as usize * 4 + i
}

fn decode(bytes: &[u8], w: u32) -> Image {
    let px = miniz_oxide::inflate::decompress_to_vec_zlib(bytes).unwrap_or_default();
    let h = (px.len() as u32 / 4).checked_div(w).unwrap_or(0);
    if h == 0 {
        return Image::from_rgba(1, 1, vec![0, 0, 0, 0]);
    }
    Image::from_rgba(w, h, px)
}

#[derive(Clone, Copy)]
struct Cfg {
    c: SpringConfig,
    threshold: f64,
}

/// What a spring's completion callback does.
#[derive(Clone, Copy, Debug)]
enum Done {
    /// Lands the piece on `to` when the spring finishes, and resets `from`.
    /// Resolves the awaited move, finished or not.
    Commit { from: i32, to: i32, piece: Option<Piece>, token: Option<u64> },
    Rook { from: i32, to: i32, piece: Option<Piece> },
    /// Sets zIndex back to 0, finished or not.
    DropZ { sq: i32 },
}

/// An animated value that a spring with a completion callback may drive.
#[derive(Clone, Copy)]
struct Anim {
    s: Spring,
    done: Option<Done>,
}

impl Anim {
    fn at(v: f64) -> Anim {
        Anim { s: Spring::at(v), done: None }
    }
    fn set(&mut self, v: f64, q: &mut Vec<(Done, bool)>) {
        if let Some(d) = self.done.take() {
            q.push((d, false));
        }
        self.s.set(v);
    }
    fn spring(&mut self, to: f64, cfg: Cfg, now: f64, done: Option<Done>, q: &mut Vec<(Done, bool)>) {
        if let Some(d) = self.done.take() {
            q.push((d, false));
        }
        self.s = self.s.with_threshold(cfg.threshold);
        self.s.assign(to, cfg.c, now);
        self.done = done;
    }
    fn step(&mut self, now: f64, q: &mut Vec<(Done, bool)>) -> bool {
        let moving = self.s.step(now);
        if !moving {
            if let Some(d) = self.done.take() {
                q.push((d, true));
            }
        }
        moving || self.done.is_some()
    }
}

/// Per-square state: the piece, its motion and its highlight fades.
#[derive(Clone)]
struct SquareState {
    piece: Option<Piece>,
    tx: Anim,
    ty: Anim,
    scale: Spring,
    z: i32,
    last_move: bool,
    in_check: bool,
    last_fade: Timing,
    check_fade: Timing,
    /// A hint's mark, on the piece to move and then on its square.
    hint: bool,
    hint_fade: Timing,
}

/// A captured piece fading out; `at` is when it was taken.
#[derive(Clone, Copy, Debug)]
struct Ghost {
    sq: i32,
    piece: Piece,
    at: f64,
}

/// A wrong move on `sq`: it shakes from `at`, then goes home.
#[derive(Clone, Copy, Debug)]
struct Wrong {
    sq: i32,
    at: f64,
}

/// A timing that repeats back and forth, or runs once.
#[derive(Clone)]
struct Pulse {
    t: Timing,
    repeat: Option<(f64, f64, Easing)>,
}

impl Pulse {
    fn at(v: f64) -> Pulse {
        Pulse { t: Timing::at(v), repeat: None }
    }
    fn value(&self) -> f64 {
        self.t.value
    }
    /// Starts an endless back-and-forth repeat from the current value.
    fn repeat(&mut self, duration: f64, easing: Easing, now: f64) {
        let start = self.t.value;
        self.t.to(1.0, duration, easing.clone());
        self.t.step(now);
        self.repeat = Some((start, duration, easing));
    }
    fn timing(&mut self, to: f64, duration: f64, easing: Easing) {
        self.repeat = None;
        self.t.to(to, duration, easing);
    }
    fn step(&mut self, now: f64) -> bool {
        let moving = self.t.step(now);
        if !moving {
            if let Some((start, duration, easing)) = self.repeat.clone() {
                // Each leg reverses toward the start value.
                let from = self.t.value;
                self.t.to(start, duration, easing.clone());
                self.t.step(now);
                self.repeat = Some((from, duration, easing));
                return true;
            }
        }
        moving
    }
}

/// One player card's animated values.
struct CardAnim {
    to_move: Option<bool>,
    active: Timing,
    pulse: Pulse,
}

/// One move in the history: its SAN, FEN and squares.
#[derive(Clone, Debug)]
struct Ply {
    #[allow(dead_code)]
    san: String,
    fen: String,
    from: i32,
    to: i32,
}

/// The promotion picker: the pending move and its dialog's fade.
struct Promotion {
    from: i32,
    to: i32,
    color: Side,
    token: Option<u64>,
    shown_ms: Option<f64>,
    closing_ms: Option<f64>,
    opacity: [Timing; 4],
    held: Option<(u32, Option<usize>, bool)>,
}

/// One section of the review card, or one of its buttons.
#[derive(Clone, Copy, Debug)]
struct Section {
    rect: [f32; 4],
    delay: f64,
    button: Option<usize>,
}

/// The checkmate aura and its review card.
struct Aura {
    origin: (f32, f32),
    winner: Side,
    snapshot_at: Option<f64>,
    revealed: bool,
    progress: Timing,
    breath: Pulse,
    vis: Timing,
    card_at: f64,
    card: Option<f64>,
}

/// The replay of the line, played move by move.
#[derive(Clone, Copy, Debug)]
enum Replay {
    Wait { until: f64, next: usize },
    Move { index: usize, token: u64 },
}

enum Js {
    TryMove { from: i32, to: i32, promotion: Option<Kind>, token: Option<u64> },
    Select(i32),
    Resolved(u64),
}

struct Fonts {
    name: Option<Font>,
    rating: Option<Font>,
    tag: Option<Font>,
    lead: Option<Font>,
    clock: Option<Font>,
    kicker: Option<Font>,
    title: Option<Font>,
    h_name: Option<Font>,
    h_label: Option<Font>,
    pill: Option<Font>,
    q_label: Option<Font>,
    q_count: Option<Font>,
    glyph: Option<Font>,
    glyph_menlo: Option<Font>,
    glyph_zapf: Option<Font>,
    button: Option<Font>,
    icon_back: Option<Font>,
    icon_replay: Option<Font>,
    board: Option<Font>,
}

fn ui_font(data: &'static [u8], size: f32) -> Option<Font> {
    Font::new(data, size).map(Font::with_ui_layout)
}

impl Fonts {
    fn new() -> Fonts {
        Fonts {
            name: ui_font(BOLD, 15.0),
            rating: ui_font(COMPACT_TNUM, 13.0),
            tag: ui_font(BOLD, 10.0),
            lead: ui_font(BOLD_TNUM, 12.0),
            clock: ui_font(BOLD_TNUM, 16.0),
            kicker: ui_font(HEAVY, 11.0),
            title: ui_font(HEAVY, 23.0),
            h_name: ui_font(COMPACT, 12.0),
            h_label: ui_font(COMPACT, 14.0),
            pill: ui_font(BOLD_TNUM, 15.0),
            q_label: ui_font(BOLD, 14.0),
            q_count: ui_font(BOLD_TNUM, 15.0),
            glyph: draw2d::match_ui_font(11.0, 900.0),
            glyph_menlo: ui_font(MENLO_BOLD, 11.0),
            glyph_zapf: ui_font(ZAPF, 11.0),
            button: ui_font(BOLD, 16.0),
            icon_back: ui_font(IONICONS, 18.0),
            icon_replay: ui_font(IONICONS, 20.0),
            board: None,
        }
    }
}

/// Snaps to the device pixel grid, rounding half up.
fn snap(v: f32, s: f32) -> f32 {
    (v * s + 1e-4).round() / s
}
/// Floors a text position to the device pixel grid.
fn floor_px(v: f32, s: f32) -> f32 {
    (v * s + 1e-3).floor() / s
}
/// Ceils a text size to the device pixel grid.
fn ceil_px(v: f32, s: f32) -> f32 {
    (v * s - 1e-3).ceil() / s
}

/// Draws a text line with its box top at `top`, its baseline on the next device pixel down.
fn draw_line(c: &mut Canvas, t: &str, x: f32, top: f32, font: &Font, color: Color, spacing: f32, s: f32) {
    let base = ((gfx::baseline(font, top)) * s - 1e-3).ceil() / s;
    c.draw_text_spaced(t, x, base, font, &Paint::fill(color), spacing);
}

fn view(hex: u32, a: f32) -> Color {
    Color::view_hex(hex).alpha(a)
}

/// Clamps an alpha to 0..1, rounded to three decimals.
fn fixed3(a: f64) -> f32 {
    ((a.clamp(0.0, 1.0) * 1000.0).round() / 1000.0) as f32
}

/// Mixes two colours in RGB with gamma 2.2, rounding each channel.
fn mix_gamma(a: u32, b: u32, v: f64) -> u32 {
    let ch = |c: u32, k: u32| ((c >> (16 - 8 * k)) & 0xff) as f64 / 255.0;
    let mut out = 0;
    for k in 0..3 {
        let (x, y) = (ch(a, k).powf(2.2), ch(b, k).powf(2.2));
        let m = (x + (y - x) * v.clamp(0.0, 1.0)).powf(1.0 / 2.2);
        out |= ((m * 255.0).round() as u32).min(255) << (16 - 8 * k);
    }
    out
}

/// A square's top-left corner in the board, not flipped.
fn pos(sq: i32, ps: f32) -> (f32, f32) {
    ((sq & 0xf) as f32 * ps, (sq >> 4) as f32 * ps)
}

fn square_at(x: f32, y: f32, ps: f32) -> i32 {
    let col = (x / ps).floor() as i32;
    let row = (y / ps).floor() as i32;
    row * 16 + col
}

struct Gpu {
    format: wgpu::TextureFormat,
    layout: wgpu::BindGroupLayout,
    compose: wgpu::RenderPipeline,
    wave: wgpu::RenderPipeline,
    finish: wgpu::RenderPipeline,
    buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    px: (u32, u32),
    board: wgpu::TextureView,
    pieces: wgpu::TextureView,
    ui: wgpu::TextureView,
    screen: wgpu::TextureView,
    snapshot: wgpu::TextureView,
    wave_out: wgpu::TextureView,
    sheet: wgpu::TextureView,
    modal: wgpu::TextureView,
    dummy: wgpu::TextureView,
    /// Bind groups, made once: they live as long as the textures.
    groups: Option<[wgpu::BindGroup; 3]>,
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Chessboard::new())
}

struct Chessboard {
    chess: Chess,
    squares: Vec<SquareState>,
    turn: Side,
    selected: Option<i32>,
    valid: Vec<i32>,
    last_move: Option<(i32, i32)>,
    king_in_check: Option<i32>,
    dragged: Option<i32>,
    touch_offset: (f32, f32),
    pan: PanGesture,
    tap: TapGesture,
    promotion: Option<Promotion>,
    callbacks: Vec<(Done, bool)>,
    js: Vec<Js>,
    plies: Vec<Ply>,
    selected_ply: i32,
    history_prev: (i32, usize),
    running: bool,
    replay_gen: u64,
    replay: Option<(u64, Replay)>,
    next_token: u64,
    captured: [Vec<Kind>; 2],
    status: String,
    turn_sv: Side,
    game_over: bool,
    started: bool,
    clock: [i32; 2],
    next_tick: Option<f64>,
    aura_timer: Option<(f64, Side)>,
    show_at: Option<(f64, Side)>,
    mate_haptics: Vec<(f64, &'static str)>,
    // Puzzle state.
    /// When the opponent's next move plays: the setup move, then each reply.
    reply_at: Option<f64>,
    /// The hint's rung on this move: 0, 1 (the piece), 2 (its square).
    hint: u8,
    wrong: Option<Wrong>,
    ghosts: Vec<Ghost>,
    mated_by: Option<Side>,
    /// The last `puzzle:` mode posted.
    mode: &'static str,
    /// The inputs' counters as last seen (hint taps, solution taps); None before the first bind.
    seen: Option<(f64, f64)>,
    cards: [CardAnim; 2],
    aura: Option<Aura>,
    busy: bool,
    sections: Vec<Section>,
    buttons: [Pressable; 2],
    held: Option<u32>,
    messages: Vec<String>,
    size: (f32, f32),
    scale: f32,
    now: f64,
    board_dirty: bool,
    pieces_dirty: bool,
    /// The inputs the cards' layer was last drawn from, redrawn only on change.
    cards_key: Vec<f64>,
    sheet_dirty: bool,
    modal_dirty: bool,
    fonts: Fonts,
    canvas: Canvas,
    renderers: [Renderer; 5],
    p3: gfx::P3Layer,
    p3_pieces: gfx::P3Layer,
    sprite: Option<Images>,
    images: Option<Images>,
    gpu: Option<Gpu>,
}

fn initial_captures() -> [Vec<Kind>; 2] {
    // Captures are the pieces missing from a full set. PUZZLE_FEN has START_FEN's material.
    let chess = Chess::new(PUZZLE_FEN).unwrap();
    let full = [(Kind::P, 8), (Kind::N, 2), (Kind::B, 2), (Kind::R, 2), (Kind::Q, 1)];
    let mut left = [[0i32; 6]; 2];
    for row in chess.board() {
        for p in row.into_iter().flatten() {
            left[p.color as usize][p.kind as usize] += 1;
        }
    }
    let taken = |victim: usize| -> Vec<Kind> { full.iter().flat_map(|&(k, n)| std::iter::repeat(k).take((n - left[victim][k as usize]).max(0) as usize)).collect() };
    [taken(1), taken(0)]
}

impl Chessboard {
    fn new() -> Chessboard {
        let chess = Chess::new(PUZZLE_FEN).unwrap();
        let card = || CardAnim { to_move: None, active: Timing::at(0.0), pulse: Pulse::at(0.0) };
        let mut c = Chessboard {
            chess,
            squares: Vec::new(),
            turn: Side::W,
            selected: None,
            valid: Vec::new(),
            last_move: None,
            king_in_check: None,
            dragged: None,
            touch_offset: (0.0, 0.0),
            pan: PanGesture::new().min_distance(5.0),
            tap: TapGesture::default(),
            promotion: None,
            callbacks: Vec::new(),
            js: Vec::new(),
            plies: Vec::new(),
            selected_ply: -1,
            history_prev: (-1, 0),
            running: false,
            replay_gen: 0,
            replay: None,
            next_token: 1,
            captured: initial_captures(),
            status: "Black to move".into(),
            turn_sv: Side::B,
            game_over: false,
            started: false,
            clock: CLOCK_START,
            next_tick: None,
            aura_timer: None,
            show_at: None,
            mate_haptics: Vec::new(),
            reply_at: None,
            hint: 0,
            wrong: None,
            ghosts: Vec::new(),
            mated_by: None,
            mode: "",
            seen: None,
            cards: [card(), card()],
            aura: None,
            busy: false,
            sections: Vec::new(),
            buttons: [Pressable::new(), Pressable::new()],
            held: None,
            messages: Vec::new(),
            size: (0.0, 0.0),
            scale: 0.0,
            now: 0.0,
            board_dirty: true,
            pieces_dirty: true,
            cards_key: Vec::new(),
            sheet_dirty: true,
            modal_dirty: true,
            fonts: Fonts::new(),
            canvas: Canvas::default(),
            renderers: std::array::from_fn(|_| Renderer::default()),
            p3: gfx::P3Layer::default(),
            p3_pieces: gfx::P3Layer::default(),
            sprite: None,
            images: None,
            gpu: None,
        };
        c.squares = vec![
            SquareState {
                piece: None,
                tx: Anim::at(0.0),
                ty: Anim::at(0.0),
                scale: Spring::at(1.0),
                z: 0,
                last_move: false,
                in_check: false,
                last_fade: Timing::at(0.0),
                check_fade: Timing::at(0.0),
                hint: false,
                hint_fade: Timing::at(0.0),
            };
            128
        ];
        c
    }

    fn ps(&self) -> f32 {
        self.size.0 / 8.0
    }

    /// Creates every square's state from the position.
    fn mount_squares(&mut self) {
        let ps = self.ps();
        for row in 0..8 {
            for col in 0..8 {
                let sq = at(col, row);
                let (x, y) = pos(sq, ps);
                let s = &mut self.squares[sq as usize];
                s.piece = self.chess.get(sq);
                s.tx = Anim::at(x as f64);
                s.ty = Anim::at(y as f64);
            }
        }
        self.turn = self.chess.turn();
    }


    fn update_highlights_after_move(&mut self, from: i32, to: i32) {
        if let Some((a, b)) = self.last_move {
            self.squares[a as usize].last_move = false;
            self.squares[b as usize].last_move = false;
        }
        self.squares[from as usize].last_move = true;
        self.squares[to as usize].last_move = true;
        self.last_move = Some((from, to));
        let in_check = self.chess.is_check();
        let prev = self.king_in_check;
        let king = if in_check || self.chess.is_checkmate() { self.chess.king(self.chess.turn()) } else { None };
        if let Some(p) = prev {
            if Some(p) != king {
                self.squares[p as usize].in_check = false;
            }
        }
        if let Some(k) = king {
            self.squares[k as usize].in_check = true;
        }
        self.king_in_check = king;
    }

    fn execute_move(&mut self, from: i32, to: i32, promotion: Option<Kind>, token: Option<u64>) -> Option<chess::Move> {
        let mv = self.chess.play(from, to, promotion)?;
        let ps = self.ps();
        let now = self.now;
        let moving = self.squares[from as usize].piece;
        if mv.captured.is_some() {
            // The taken piece fades and shrinks as the capturer lands.
            if let Some(piece) = self.squares[to as usize].piece.take() {
                self.ghosts.push(Ghost { sq: to, piece, at: now });
            }
        }
        self.clear_hint();
        let to_pos = pos(to, ps);
        let from_pos = pos(from, ps);
        self.squares[from as usize].z = 100;
        let piece = match promotion {
            Some(k) => Some(Piece { color: mv.color, kind: k }),
            None => moving,
        };
        let commit = Done::Commit { from, to, piece, token };
        let vertical = to_pos.1 != from_pos.1;
        let q = &mut self.callbacks;
        let f = &mut self.squares[from as usize];
        f.tx.spring(to_pos.0 as f64, MOVE_SPRING, now, (!vertical).then_some(commit), q);
        f.ty.spring(to_pos.1 as f64, MOVE_SPRING, now, vertical.then_some(commit), q);
        if mv.flags.contains('k') || mv.flags.contains('q') {
            let kingside = mv.flags.contains('k');
            let row = if mv.color == Side::W { 7 } else { 0 };
            let rook_from = at(if kingside { 7 } else { 0 }, row);
            let rook_to = at(if kingside { 5 } else { 3 }, row);
            let rook_piece = self.squares[rook_from as usize].piece;
            let rp = pos(rook_to, ps);
            let r = &mut self.squares[rook_from as usize];
            r.tx.spring(rp.0 as f64, MOVE_SPRING, now, Some(Done::Rook { from: rook_from, to: rook_to, piece: rook_piece }), q);
            r.ty.spring(rp.1 as f64, MOVE_SPRING, now, None, q);
        }
        if mv.flags.contains('e') {
            // En passant: the captured pawn is on `to`'s file and `from`'s rank.
            let sq = (from & 0x70) | (to & 0xf);
            if let Some(piece) = self.squares[sq as usize].piece.take() {
                self.ghosts.push(Ghost { sq, piece, at: now });
            }
        }
        self.turn = self.chess.turn();
        self.selected = None;
        self.valid.clear();
        self.update_highlights_after_move(from, to);
        self.board_dirty = true;
        self.pieces_dirty = true;
        let is_checkmate = self.chess.is_checkmate();
        let is_stalemate = self.chess.is_stalemate();
        let is_check = self.chess.is_check();
        let fen = self.chess.fen();
        self.on_move(&mv, fen, is_check, is_checkmate, is_stalemate);
        Some(mv)
    }

    fn is_promotion_move(&self, from: i32, to: i32) -> bool {
        match self.chess.get(from) {
            Some(Piece { kind: Kind::P, color }) => (color == Side::W && to >> 4 == 0) || (color == Side::B && to >> 4 == 7),
            _ => false,
        }
    }

    /// Resolves the move's promise after its animation, or at once if it is refused.
    fn try_move(&mut self, from: i32, to: i32, promotion: Option<Kind>, token: Option<u64>) {
        if self.is_promotion_move(from, to) && promotion.is_none() {
            // A pending promotion is abandoned first.
            if let Some(old) = self.promotion.take() {
                if let Some(t) = old.token {
                    self.js.push(Js::Resolved(t));
                }
            }
            let color = self.chess.turn();
            self.promotion = Some(Promotion { from, to, color, token, shown_ms: None, closing_ms: None, opacity: std::array::from_fn(|_| Timing::at(1.0)), held: None });
            self.modal_dirty = true;
            return;
        }
        self.attempt(from, to, promotion, token);
    }

    fn attempt(&mut self, from: i32, to: i32, promotion: Option<Kind>, token: Option<u64>) {
        // Only the user's own moves are checked against the puzzle line.
        if token.is_none() && !self.running && self.off_line(from, to, promotion) {
            self.reject(from, to);
            return;
        }
        if self.execute_move(from, to, promotion, token).is_none() {
            if let Some(t) = token {
                self.js.push(Js::Resolved(t));
            }
        }
    }

    fn select_piece(&mut self, sq: i32) {
        let piece = self.chess.get(sq);
        if piece.map_or(true, |p| p.color != self.chess.turn()) {
            self.selected = None;
            self.valid.clear();
        } else {
            self.selected = Some(sq);
            self.valid = self.chess.targets(sq);
        }
        self.board_dirty = true;
    }

    // The puzzle.

    /// The move the line expects next, if any.
    fn expected(&self) -> Option<(i32, i32)> {
        SOLUTION.get(self.plies.len()).map(|&(a, b)| (chess::square(a).unwrap(), chess::square(b).unwrap()))
    }

    /// Whether a legal move is off the line. Any mate solves the puzzle, so it is never off it.
    /// A drag's drop arrives twice (pan and tap); the second one is already illegal.
    fn off_line(&self, from: i32, to: i32, promotion: Option<Kind>) -> bool {
        if self.expected() == Some((from, to)) {
            return false;
        }
        let mut probe = self.chess.clone();
        probe.play(from, to, promotion).is_some() && !probe.is_checkmate()
    }

    /// The board takes the user's move: their turn, nothing pending, no card over it.
    fn user_can_move(&self) -> bool {
        !self.running && !self.game_over && self.reply_at.is_none() && self.wrong.is_none() && self.aura.is_none() && self.chess.turn() == USER
    }

    /// A legal move off the line: the piece lands on `to`, shakes, then springs home.
    fn reject(&mut self, from: i32, to: i32) {
        let ps = self.ps();
        let now = self.now;
        let tp = pos(to, ps);
        let q = &mut self.callbacks;
        let s = &mut self.squares[from as usize];
        if s.piece.is_none() {
            return;
        }
        s.z = 100;
        s.tx.spring(tp.0 as f64, MOVE_SPRING, now, None, q);
        s.ty.spring(tp.1 as f64, MOVE_SPRING, now, None, q);
        self.selected = None;
        self.valid.clear();
        self.wrong = Some(Wrong { sq: from, at: now });
        self.messages.push("haptic:error".into());
        self.board_dirty = true;
        self.pieces_dirty = true;
    }

    /// The wrong move's horizontal shake at `now` (points), on its square's piece.
    fn shake(&self, sq: i32) -> f32 {
        let Some(w) = self.wrong.filter(|w| w.sq == sq) else {
            return 0.0;
        };
        let t = (self.now - w.at - WRONG_SHAKE_AT) / WRONG_SHAKE_MS;
        if !(0.0..1.0).contains(&t) {
            return 0.0;
        }
        // Three decaying swings, 6 pt at first.
        (6.0 * (t * 3.0 * std::f64::consts::TAU).sin() * (1.0 - t)) as f32
    }

    /// The wrong move's piece goes home once its shake is over.
    fn wrong_step(&mut self) -> bool {
        let Some(w) = self.wrong else {
            return false;
        };
        if self.now < w.at + WRONG_SHAKE_AT + WRONG_SHAKE_MS {
            return true;
        }
        self.wrong = None;
        let home = pos(w.sq, self.ps());
        let now = self.now;
        let q = &mut self.callbacks;
        let s = &mut self.squares[w.sq as usize];
        let drop = Done::DropZ { sq: w.sq };
        s.tx.spring(home.0 as f64, SNAP_BACK_SPRING, now, Some(drop), q);
        s.ty.spring(home.1 as f64, SNAP_BACK_SPRING, now, None, q);
        true
    }

    /// The opponent's move (the setup move, then each reply), when it is due.
    fn reply_step(&mut self) {
        let Some(t) = self.reply_at else {
            return;
        };
        if self.now < t {
            return;
        }
        self.reply_at = None;
        if self.running || self.game_over || self.chess.turn() == USER {
            return;
        }
        if let Some((from, to)) = self.expected() {
            self.selected = None;
            self.valid.clear();
            self.execute_move(from, to, None, None);
        }
    }

    fn clear_hint(&mut self) {
        self.hint = 0;
        for s in self.squares.iter_mut() {
            s.hint = false;
        }
        self.board_dirty = true;
    }

    /// Hint: the piece to move, then (a second tap) its square.
    fn hint_request(&mut self) {
        if !self.user_can_move() || self.hint >= 2 {
            return;
        }
        let Some((from, to)) = self.expected() else {
            return;
        };
        self.hint += 1;
        self.squares[from as usize].hint = true;
        if self.hint == 2 {
            self.squares[to as usize].hint = true;
        }
        self.board_dirty = true;
    }

    /// View solution: the line's move plays (the opponent then answers as after any move).
    fn solve_request(&mut self) {
        if !self.user_can_move() || self.pan.tracking() || self.dragged.is_some() {
            return;
        }
        let Some((from, to)) = self.expected() else {
            return;
        };
        self.selected = None;
        self.valid.clear();
        self.execute_move(from, to, None, None);
    }

    /// The mode the bar shows: wait, play, hint1, hint2 or done.
    fn puzzle_mode(&self) -> &'static str {
        if self.game_over || self.aura.is_some() {
            "done"
        } else if !self.user_can_move() {
            "wait"
        } else {
            ["play", "hint1", "hint2"][self.hint.min(2) as usize]
        }
    }

    fn reset_board(&mut self, fen: &str, slide: Option<(i32, i32)>, last_move: Option<(i32, i32)>) {
        if !self.chess.load(fen) {
            return;
        }
        let ps = self.ps();
        let now = self.now;
        let board = self.chess.board();
        for (row, cells) in board.iter().enumerate() {
            for (col, cell) in cells.iter().enumerate() {
                let sq = at(col, row);
                let (x, y) = pos(sq, ps);
                let q = &mut self.callbacks;
                let s = &mut self.squares[sq as usize];
                s.piece = *cell;
                s.scale.set(1.0);
                s.last_move = last_move.is_some_and(|(a, b)| sq == a || sq == b);
                s.in_check = false;
                s.hint = false;
                match slide {
                    Some((from, to)) if sq == to => {
                        let fp = pos(from, ps);
                        s.z = 100;
                        s.tx.set(fp.0 as f64, q);
                        s.ty.set(fp.1 as f64, q);
                        let vertical = y != fp.1;
                        let drop = Done::DropZ { sq };
                        s.tx.spring(x as f64, MOVE_SPRING, now, (!vertical).then_some(drop), q);
                        s.ty.spring(y as f64, MOVE_SPRING, now, vertical.then_some(drop), q);
                    }
                    _ => {
                        s.tx.set(x as f64, q);
                        s.ty.set(y as f64, q);
                        s.z = 0;
                    }
                }
            }
        }
        self.turn = self.chess.turn();
        self.selected = None;
        self.valid.clear();
        self.last_move = last_move;
        let in_check = self.chess.is_check();
        let king = if in_check || self.chess.is_checkmate() { self.chess.king(self.chess.turn()) } else { None };
        if let Some(k) = king {
            self.squares[k as usize].in_check = true;
        }
        self.king_in_check = king;
        self.board_dirty = true;
        self.pieces_dirty = true;
        self.hint = 0;
        self.wrong = None;
        self.ghosts.clear();
    }

    /// The completion callbacks the last steps and assignments queued, in order.
    fn run_callbacks(&mut self) {
        let ps = self.ps();
        while !self.callbacks.is_empty() {
            let batch = std::mem::take(&mut self.callbacks);
            for (done, finished) in batch {
                match done {
                    Done::Commit { from, to, piece, token } => {
                        if finished {
                            let (x, y) = pos(from, ps);
                            self.squares[to as usize].piece = piece;
                            let q = &mut self.callbacks;
                            let f = &mut self.squares[from as usize];
                            f.piece = None;
                            f.tx.set(x as f64, q);
                            f.ty.set(y as f64, q);
                            f.z = 0;
                        }
                        if let Some(t) = token {
                            self.js.push(Js::Resolved(t));
                        }
                    }
                    Done::Rook { from, to, piece } => {
                        if finished {
                            let (x, y) = pos(from, ps);
                            self.squares[to as usize].piece = piece;
                            let q = &mut self.callbacks;
                            let f = &mut self.squares[from as usize];
                            f.piece = None;
                            f.tx.set(x as f64, q);
                            f.ty.set(y as f64, q);
                        }
                    }
                    Done::DropZ { sq } => self.squares[sq as usize].z = 0,
                }
                self.pieces_dirty = true;
            }
        }
    }


    fn board_input(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64) {
        let ps = self.ps();
        let top = self.board_top();
        let (bx, by) = (x, y - top);
        let inside = bx >= 0.0 && bx < self.size.0 && by >= 0.0 && by < self.size.0;
        // The board takes a finger only on the user's turn.
        let enabled = self.promotion.is_none() && self.user_can_move();
        let claim = phase == Phase::Down && inside && enabled;
        let pan = self.pan.event(id, phase, bx, by, ms, claim);
        let tap = self.tap.event(id, phase, bx, by, ms, claim);
        match pan {
            Event::Begin { x, y } => {
                let sq = square_at(x, y, ps);
                if sq & 0x88 == 0 && self.squares[sq as usize].piece.is_some() {
                    let s = &self.squares[sq as usize];
                    self.dragged = Some(sq);
                    let cx = s.tx.s.value as f32 + ps / 2.0;
                    let cy = s.ty.s.value as f32 + ps / 2.0;
                    self.touch_offset = (x - cx, y - cy);
                }
            }
            Event::Start(p) => {
                if let Some(sq) = self.dragged {
                    let s = &mut self.squares[sq as usize];
                    s.z = 100;
                    s.scale.assign(1.1, SCALE_SPRING.c, ms);
                    let own = s.piece.is_some_and(|p| p.color == self.turn);
                    if own {
                        self.js.push(Js::Select(sq));
                    }
                    self.follow(sq, p.x, p.y);
                }
            }
            Event::Update(p) => {
                if let Some(sq) = self.dragged {
                    self.follow(sq, p.x, p.y);
                }
            }
            Event::End(_) => self.pan_end(ms),
            _ => {}
        }
        if matches!(pan, Event::End(_) | Event::Fail) {
            if let Some(sq) = self.dragged {
                let s = &mut self.squares[sq as usize];
                if s.z > 0 {
                    s.scale.assign(1.0, SCALE_SPRING.c, ms);
                    s.z = 0;
                }
            }
            self.dragged = None;
            self.board_dirty = true;
            self.pieces_dirty = true;
        }
        if let Event::Tap { x, y } = tap {
            self.tap_end(x, y);
        }
    }

    fn follow(&mut self, sq: i32, x: f32, y: f32) {
        let ps = self.ps();
        let (ox, oy) = self.touch_offset;
        let q = &mut self.callbacks;
        let s = &mut self.squares[sq as usize];
        s.tx.set((x - ox - ps / 2.0) as f64, q);
        s.ty.set((y - oy - ps / 2.0) as f64, q);
        self.pieces_dirty = true;
    }

    fn pan_end(&mut self, ms: f64) {
        let Some(sq) = self.dragged else { return };
        let ps = self.ps();
        if self.squares[sq as usize].z <= 0 {
            self.dragged = None;
            return;
        }
        self.squares[sq as usize].scale.assign(1.0, SCALE_SPRING.c, ms);
        let own = self.squares[sq as usize].piece.is_some_and(|p| p.color == self.turn);
        let home = pos(sq, ps);
        let q = &mut self.callbacks;
        if !own {
            let s = &mut self.squares[sq as usize];
            s.tx.spring(home.0 as f64, SNAP_BACK_SPRING, ms, None, q);
            s.ty.spring(home.1 as f64, SNAP_BACK_SPRING, ms, None, q);
            s.z = 0;
            self.selected = None;
            self.valid.clear();
            self.dragged = None;
            return;
        }
        let s = &self.squares[sq as usize];
        let drop_x = (s.tx.s.value as f32 + ps / 2.0).clamp(0.0, ps * 8.0 - 1.0);
        let drop_y = (s.ty.s.value as f32 + ps / 2.0).clamp(0.0, ps * 8.0 - 1.0);
        let target = square_at(drop_x, drop_y, ps);
        if target != sq && self.valid.contains(&target) {
            let tp = pos(target, ps);
            let s = &mut self.squares[sq as usize];
            s.tx.spring(tp.0 as f64, MOVE_SPRING, ms, None, q);
            s.ty.spring(tp.1 as f64, MOVE_SPRING, ms, None, q);
            self.js.push(Js::TryMove { from: sq, to: target, promotion: None, token: None });
            self.dragged = None;
            return;
        }
        let s = &mut self.squares[sq as usize];
        s.tx.spring(home.0 as f64, SNAP_BACK_SPRING, ms, None, q);
        s.ty.spring(home.1 as f64, SNAP_BACK_SPRING, ms, None, q);
        s.z = 0;
        self.selected = None;
        self.valid.clear();
        self.dragged = None;
    }

    fn tap_end(&mut self, x: f32, y: f32) {
        let sq = square_at(x, y, self.ps());
        if sq & 0x88 != 0 {
            return;
        }
        let own = self.squares[sq as usize].piece.is_some_and(|p| p.color == self.turn);
        let Some(selected) = self.selected else {
            if own {
                self.js.push(Js::Select(sq));
            }
            return;
        };
        self.board_dirty = true;
        if sq == selected {
            self.selected = None;
            self.valid.clear();
            return;
        }
        if self.valid.contains(&sq) {
            self.js.push(Js::TryMove { from: selected, to: sq, promotion: None, token: None });
            return;
        }
        if own {
            self.js.push(Js::Select(sq));
            return;
        }
        self.selected = None;
        self.valid.clear();
    }


    fn on_move(&mut self, mv: &chess::Move, fen: String, check: bool, mate: bool, stalemate: bool) {
        let mover = mv.color;
        self.plies.push(Ply { san: mv.san.clone(), fen, from: chess::square(&mv.from).unwrap(), to: chess::square(&mv.to).unwrap() });
        self.set_selected_ply(self.selected_ply + 1);
        if let Some(k) = mv.captured {
            self.captured[mover as usize].push(k);
        }
        self.status = if mate {
            "Checkmate".into()
        } else if stalemate {
            "Stalemate".into()
        } else if check {
            "Check".into()
        } else if mover == Side::W {
            "Black to move".into()
        } else {
            "White to move".into()
        };
        self.turn_sv = mover.other();
        self.game_over = mate || stalemate;
        self.started = true;
        if mate {
            self.mated_by = Some(mover);
        }
        // After the user's move the opponent answers; a replay plays its own moves.
        if !self.game_over && !self.running && mover == USER && self.plies.len() < SOLUTION.len() {
            self.reply_at = Some(self.now + REPLY_DELAY);
        }
        if mate && !cfg!(target_arch = "wasm32") {
            self.messages.push("haptic:mate".into());
            self.aura_timer = Some((self.now + AURA_DELAY, mover));
        } else if mate {
            self.mate_haptics = MATE
                .iter()
                .map(|&(t, a)| {
                    (
                        self.now + t,
                        if a >= 0.9 {
                            "haptic:impact-heavy"
                        } else if a >= 0.5 {
                            "haptic:impact-medium"
                        } else {
                            "haptic:impact-light"
                        },
                    )
                })
                .collect();
            self.aura_timer = Some((self.now + AURA_DELAY, mover));
        } else if mv.captured.is_some() {
            self.messages.push("haptic:impact-medium".into());
        } else if check {
            self.messages.push("haptic:impact-rigid".into());
        } else {
            self.messages.push("haptic:impact-light".into());
        }
    }

    /// The side that mated, if the game ended in checkmate.
    fn winner(&self) -> Option<Side> {
        // The puzzle opens on Black's move, so ply parity cannot say who mated.
        (self.status == "Checkmate").then_some(self.mated_by).flatten()
    }

    /// Selects a ply in the history.
    fn set_selected_ply(&mut self, v: i32) {
        if v == self.selected_ply {
            return;
        }
        self.selected_ply = v;
        let (from, prev_len) = self.history_prev;
        let to = v;
        let grew = self.plies.len() > prev_len;
        self.history_prev = (to, self.plies.len());
        if self.running || grew || to == from || to >= self.plies.len() as i32 {
            return;
        }
        let last = (to >= 0).then(|| (self.plies[to as usize].from, self.plies[to as usize].to));
        let slide = if to == from + 1 && to >= 0 {
            Some((self.plies[to as usize].from, self.plies[to as usize].to))
        } else if to == from - 1 && from >= 0 && (from as usize) < self.plies.len() {
            Some((self.plies[from as usize].to, self.plies[from as usize].from))
        } else {
            None
        };
        let fen = if to < 0 { PUZZLE_FEN.to_string() } else { self.plies[to as usize].fen.clone() };
        self.reset_board(&fen, slide, last);
    }

    /// Resets the game state.
    fn reset_game(&mut self) {
        self.plies.clear();
        self.set_selected_ply(-1);
        self.captured = initial_captures();
        self.status = "Black to move".into();
        self.turn_sv = Side::B;
        self.mated_by = None;
        self.game_over = false;
        self.started = false;
        self.clock = CLOCK_START;
    }

    fn play_sequence(&mut self) {
        if self.running {
            return;
        }
        self.replay_gen += 1;
        self.running = true;
        self.reset_board(PUZZLE_FEN, None, None);
        self.reset_game();
        self.reply_at = None;
        self.replay = Some((self.replay_gen, Replay::Wait { until: self.now + START_DELAY, next: 0 }));
    }

    fn rematch(&mut self) {
        self.replay_gen += 1;
        self.running = false;
        self.replay = None;
        self.aura_timer = None;
        self.mate_haptics.clear();
        if !cfg!(target_arch = "wasm32") {
            self.messages.push("haptic:mate-stop".into());
        }
        self.hide();
        self.reset_board(PUZZLE_FEN, None, None);
        self.reset_game();
        // The setup move comes after the same beat as on opening.
        self.reply_at = Some(self.now + START_DELAY);
    }

    fn hide(&mut self) {
        if let Some(a) = self.aura.as_mut() {
            a.vis.to(0.0, EXIT_MS, Easing::r#in(Easing::Cubic));
        }
    }

    fn replay_step(&mut self) {
        let Some((gen, step)) = self.replay else {
            return;
        };
        if gen != self.replay_gen {
            self.replay = None;
            return;
        }
        if let Replay::Wait { until, next } = step {
            if self.now < until {
                return;
            }
            if next >= SOLUTION.len() {
                self.replay = None;
                self.running = false;
                return;
            }
            let (a, b) = SOLUTION[next];
            let token = self.next_token;
            self.next_token += 1;
            self.replay = Some((gen, Replay::Move { index: next, token }));
            self.try_move(chess::square(a).unwrap(), chess::square(b).unwrap(), None, Some(token));
        }
    }

    fn resolved(&mut self, token: u64) {
        if let Some((gen, Replay::Move { index, token: t })) = self.replay {
            if t == token && gen == self.replay_gen {
                self.replay = Some((gen, Replay::Wait { until: self.now + MOVE_GAP, next: index + 1 }));
            }
        }
    }

    fn run_js(&mut self) {
        while !self.js.is_empty() {
            let batch = std::mem::take(&mut self.js);
            for j in batch {
                match j {
                    Js::TryMove { from, to, promotion, token } => self.try_move(from, to, promotion, token),
                    Js::Select(sq) => self.select_piece(sq),
                    Js::Resolved(t) => self.resolved(t),
                }
            }
            self.run_callbacks();
        }
    }

    /// The timers of the game, the aura and the clocks, up to `now`.
    fn timers(&mut self) {
        let now = self.now;
        while let Some(t) = self.next_tick {
            if t > now {
                break;
            }
            self.next_tick = Some(t + 1000.0);
            if self.started && !self.game_over {
                let c = &mut self.clock[self.turn_sv as usize];
                *c = (*c - 1).max(0);
            }
        }
        while let Some(&(t, kind)) = self.mate_haptics.first() {
            if t > now {
                break;
            }
            self.mate_haptics.remove(0);
            self.messages.push(kind.into());
        }
        if let Some((t, mover)) = self.aura_timer {
            if t <= now {
                // The aura shows a frame later, once its position is measured.
                self.aura_timer = None;
                self.show_at = Some((now + 16.0, mover));
            }
        }
        if let Some((t, mover)) = self.show_at {
            if t <= now {
                self.show_at = None;
                self.show(mover);
            }
        }
        if let Some(a) = self.aura.as_mut() {
            if a.card.is_none() && a.card_at <= now {
                a.card = Some(now);
                self.sheet_dirty = true;
            }
        }
        self.replay_step();
        self.reply_step();
    }

    /// Takes the screen's snapshot; the overlay follows a frame later and the card 900 ms on.
    fn show(&mut self, mover: Side) {
        if self.busy {
            return;
        }
        let king_color = mover.other();
        let Some(k) = self.chess_from_fen_king(king_color) else {
            return;
        };
        self.busy = true;
        let ps = self.ps();
        let (col, row) = ((k & 0xf) as f32, (k >> 4) as f32);
        let origin = (col * ps + ps / 2.0, self.board_top() + row * ps + ps / 2.0);
        self.aura = Some(Aura {
            origin,
            winner: mover,
            snapshot_at: None,
            revealed: false,
            progress: Timing::at(0.0),
            breath: Pulse::at(0.0),
            vis: Timing::at(0.0),
            card_at: self.now + (WAVE_MS * 0.55).round() - 750.0,
            card: None,
        });
    }

    /// The mated king's square, read from the last ply's FEN.
    fn chess_from_fen_king(&self, color: Side) -> Option<i32> {
        let fen = self.plies.last().map(|p| p.fen.as_str()).unwrap_or(PUZZLE_FEN);
        let placement = fen.split(' ').next()?;
        let target = if color == Side::W { 'K' } else { 'k' };
        for (row, rank) in placement.split('/').enumerate() {
            let mut file = 0;
            for ch in rank.chars() {
                if let Some(d) = ch.to_digit(10) {
                    file += d as usize;
                } else {
                    if ch == target {
                        return Some(at(file, row));
                    }
                    file += 1;
                }
            }
        }
        None
    }

    // Layout.

    fn hair(&self) -> f32 {
        // A hairline is 0.4 pt, rounded to whole device pixels, at least one.
        ((0.4 * self.scale).round().max(1.0)) / self.scale
    }

    fn card_h(&self) -> f32 {
        40.0 + 12.0 + 2.0 * self.hair()
    }

    /// The top group's top (black card), centred in the board zone.
    fn group_top(&self) -> f32 {
        let s = self.scale;
        let zone = self.size.1 - 40.0;
        let group = 2.0 * self.card_h() + 20.0 + self.size.0;
        12.0 + snap((zone - group) / 2.0, s)
    }

    fn board_top(&self) -> f32 {
        self.group_top() + self.card_h() + 10.0
    }

    fn card_top(&self, side: Side) -> f32 {
        match side {
            Side::B => self.group_top(),
            Side::W => self.board_top() + self.size.0 + 10.0,
        }
    }

    fn clock_text(&self, side: Side) -> String {
        let s = self.clock[side as usize];
        format!("{}:{:02}", s / 60, s % 60)
    }

    // The review card's layout at rest.

    fn review_rows(&self) -> Vec<(Q, usize, usize)> {
        TABLE_ORDER
            .iter()
            .map(|&q| {
                let you = REVIEW.iter().enumerate().filter(|(i, m)| i % 2 == 0 && **m == q).count();
                let opp = REVIEW.iter().enumerate().filter(|(i, m)| i % 2 == 1 && **m == q).count();
                (q, you, opp)
            })
            .filter(|r| r.1 + r.2 > 0)
            .collect()
    }

    fn line(&self, font: &Option<Font>) -> f32 {
        font.as_ref().map_or(0.0, |f| ceil_px(gfx::line_height(f), self.scale))
    }

    /// Each section's rect at rest, its delay, and the two buttons.
    fn layout_sections(&mut self) {
        let s = self.scale;
        let hair = self.hair();
        let rows = self.review_rows().len();
        let header = self.line(&self.fonts.kicker) + 5.0 + self.line(&self.fonts.title) + 12.0;
        let icon = |f: &Option<Font>| f.as_ref().map_or(0.0, |f| ceil_px(gfx::line_height(f), s));
        let inner = self.line(&self.fonts.button).max(icon(&self.fonts.icon_back)).max(icon(&self.fonts.icon_replay));
        let button_h = 24.0 + inner;
        let total = header + 38.0 * 3.0 + 2.0 + (12.0 + hair) + 34.0 * rows as f32 + 16.0 + button_h;
        let (left, width) = (22.0, self.size.0 - 44.0);
        let mut y = snap(self.size.1 - 40.0 - total, s);
        let mut out = Vec::new();
        let mut push = |y: &mut f32, h: f32, after: f32, delay: f64| {
            out.push(Section { rect: [left, snap(*y, s), width, h], delay, button: None });
            *y += h + after;
        };
        push(&mut y, header, 0.0, 0.0);
        push(&mut y, 38.0, 0.0, 55.0);
        push(&mut y, 38.0, 0.0, 95.0);
        push(&mut y, 38.0, 2.0, 135.0);
        push(&mut y, 12.0 + hair, 0.0, 170.0);
        for i in 0..rows {
            push(&mut y, 34.0, 0.0, 190.0 + 30.0 * i as f64);
        }
        y += 16.0;
        let delay = 190.0 + 30.0 * rows as f64 + 40.0;
        let bw = (width - 10.0) / 2.0;
        let top = snap(y, s);
        out.push(Section { rect: [left, top, snap(bw, s), button_h], delay, button: Some(0) });
        out.push(Section { rect: [left + snap(bw + 10.0, s), top, width - snap(bw + 10.0, s), button_h], delay, button: Some(1) });
        self.sections = out;
    }

    /// A section's enter() progress at `now`: opacity, translateY, scale.
    fn enter(&self, sec: &Section) -> (f32, f32, f32) {
        let Some(card) = self.aura.as_ref().and_then(|a| a.card) else {
            return (0.0, 9.0, 0.985);
        };
        let t = ((self.now - card - sec.delay) / 400.0).clamp(0.0, 1.0);
        let e = Easing::bezier(0.16, 0.84, 0.44, 1.0).at(t) as f32;
        (e, 9.0 * (1.0 - e), 0.985 + 0.015 * e)
    }

    fn entering(&self) -> bool {
        let Some(card) = self.aura.as_ref().and_then(|a| a.card) else {
            return false;
        };
        self.sections.iter().any(|s| self.now - card - s.delay < 400.0)
    }

    /// The button's hit test, through its section's and its own transform.
    fn in_button(&self, i: usize, x: f32, y: f32) -> bool {
        let Some(sec) = self.sections.iter().find(|s| s.button == Some(i)) else {
            return false;
        };
        let [l, t, w, h] = sec.rect;
        let (_, ty, sc) = self.enter(sec);
        let k = self.buttons[i].scale() as f32 * sc;
        let (cx, cy) = (l + w / 2.0, t + h / 2.0 + ty);
        (x - cx).abs() <= w / 2.0 * k && (y - cy).abs() <= h / 2.0 * k
    }

    // The promotion dialog's layout.

    fn modal_rects(&self) -> ([f32; 4], [[f32; 4]; 4]) {
        let (w, h) = (16.0 + 4.0 * (64.0 + 8.0), 80.0);
        let x = snap((self.size.0 - w) / 2.0, self.scale);
        let y = snap((self.size.1 - h) / 2.0, self.scale);
        let buttons = std::array::from_fn(|i| [x + 8.0 + 4.0 + i as f32 * 72.0, y + 8.0, 64.0, 64.0]);
        ([x, y, w, h], buttons)
    }

    /// The dialog's fade, and whether it is still visible.
    fn modal_alpha(&self) -> (f32, f32) {
        let Some(p) = self.promotion.as_ref() else {
            return (0.0, 0.0);
        };
        let Some(shown) = p.shown_ms else {
            return (0.0, 0.0);
        };
        let ease = Easing::in_out(Easing::Quad);
        let fade_in = ((self.now - shown) / 300.0).clamp(0.0, 1.0);
        let mut m = ease.at(fade_in) as f32;
        if let Some(c) = p.closing_ms {
            m = 1.0 - ease.at(((self.now - c) / 300.0).clamp(0.0, 1.0)) as f32;
        }
        let f = ((self.now - shown) / 200.0).clamp(0.0, 1.0) as f32;
        (m, f)
    }

    fn modal_input(&mut self, id: u32, phase: Phase, x: f32, y: f32) {
        let (_, buttons) = self.modal_rects();
        let hit = |r: [f32; 4], slop: bool| {
            let (l, t, rr, b) = if slop { (20.0, 20.0, 20.0, 30.0) } else { (0.0, 0.0, 0.0, 0.0) };
            x >= r[0] - l && x <= r[0] + r[2] + rr && y >= r[1] - t && y <= r[1] + r[3] + b
        };
        let Some(p) = self.promotion.as_mut() else {
            return;
        };
        if p.closing_ms.is_some() {
            return;
        }
        let now = self.now;
        match phase {
            Phase::Down => {
                if p.held.is_some() {
                    return;
                }
                let button = (0..4).find(|&i| hit(buttons[i], false));
                if let Some(i) = button {
                    p.opacity[i].set(0.7);
                }
                p.held = Some((id, button, true));
                self.modal_dirty = true;
            }
            Phase::Move => {
                if let Some((hid, Some(i), inside)) = p.held {
                    if hid == id {
                        let now_inside = hit(buttons[i], true);
                        if now_inside != inside {
                            if now_inside {
                                p.opacity[i].to(0.7, 150.0, Easing::in_out(Easing::Quad));
                            } else {
                                p.opacity[i].to(1.0, 250.0, Easing::in_out(Easing::Quad));
                            }
                            p.held = Some((id, Some(i), now_inside));
                        }
                    }
                }
            }
            Phase::Up | Phase::Cancel => {
                let Some((hid, button, inside)) = p.held else {
                    return;
                };
                if hid != id {
                    return;
                }
                p.held = None;
                if let Some(i) = button {
                    if inside {
                        p.opacity[i].to(1.0, 250.0, Easing::in_out(Easing::Quad));
                    }
                    if phase == Phase::Up && inside {
                        self.promotion_select(PROMOTION_PIECES[i], now);
                    }
                } else if phase == Phase::Up {
                    self.promotion_cancel(now);
                }
            }
        }
    }

    fn promotion_select(&mut self, piece: Kind, now: f64) {
        let Some(p) = self.promotion.as_mut() else {
            return;
        };
        p.closing_ms = Some(now);
        let (from, to, token) = (p.from, p.to, p.token);
        self.attempt(from, to, Some(piece), token);
        self.run_callbacks();
    }

    fn promotion_cancel(&mut self, now: f64) {
        let Some(p) = self.promotion.as_mut() else {
            return;
        };
        p.closing_ms = Some(now);
        let (from, token) = (p.from, p.token);
        let home = pos(from, self.ps());
        let q = &mut self.callbacks;
        let s = &mut self.squares[from as usize];
        s.tx.spring(home.0 as f64, SNAP_BACK_SPRING, now, None, q);
        s.ty.spring(home.1 as f64, SNAP_BACK_SPRING, now, None, q);
        s.scale.assign(1.0, SCALE_SPRING.c, now);
        s.z = 0;
        self.selected = None;
        self.valid.clear();
        self.board_dirty = true;
        if let Some(t) = token {
            self.js.push(Js::Resolved(t));
        }
        self.run_callbacks();
    }

    // Stepping.

    fn step(&mut self) -> bool {
        let now = self.now;
        let mut moving = false;
        let mut board = false;
        let mut pieces = false;
        for i in 0..128usize {
            if i & 0x88 != 0 {
                continue;
            }
            let q = &mut self.callbacks;
            let s = &mut self.squares[i];
            pieces |= s.tx.step(now, q);
            pieces |= s.ty.step(now, q);
            pieces |= s.scale.step(now);
            let last = if s.last_move { 1.0 } else { 0.0 };
            if s.last_fade.target() != last {
                s.last_fade.to(last, 180.0, Easing::Linear);
            }
            let check = if s.in_check { 1.0 } else { 0.0 };
            if s.check_fade.target() != check {
                s.check_fade.to(check, 180.0, Easing::Linear);
            }
            let hint = if s.hint { 1.0 } else { 0.0 };
            if s.hint_fade.target() != hint {
                s.hint_fade.to(hint, 180.0, Easing::Linear);
            }
            board |= s.last_fade.step(now);
            board |= s.check_fade.step(now);
            board |= s.hint_fade.step(now);
        }
        let ghosts = self.ghosts.len();
        self.ghosts.retain(|g| now < g.at + CAPTURE_AT + CAPTURE_MS);
        pieces |= !self.ghosts.is_empty() || self.ghosts.len() != ghosts;
        pieces |= self.wrong_step();
        self.run_callbacks();
        if board {
            self.board_dirty = true;
        }
        if pieces {
            self.pieces_dirty = true;
        }
        moving |= board || pieces;
        for side in [Side::W, Side::B] {
            let to_move = !self.game_over && self.turn_sv == side;
            let c = &mut self.cards[side as usize];
            if c.to_move != Some(to_move) {
                c.to_move = Some(to_move);
                c.active.to(if to_move { 1.0 } else { 0.0 }, 280.0, Easing::timing_default());
                c.active.step(now);
                if to_move {
                    c.pulse.repeat(950.0, Easing::in_out(Easing::Ease), now);
                } else {
                    c.pulse.timing(0.0, 200.0, Easing::timing_default());
                    c.pulse.step(now);
                }
            }
            moving |= c.active.step(now);
            moving |= c.pulse.step(now);
        }
        if let Some(a) = self.aura.as_mut() {
            moving |= a.progress.step(now);
            moving |= a.breath.step(now);
            let was = a.vis.value;
            moving |= a.vis.step(now);
            // Fully hidden: the snapshot and the card are dropped.
            if was > 0.01 && a.vis.value <= 0.01 {
                self.aura = None;
                self.busy = false;
                self.sheet_dirty = true;
            }
        }
        moving |= self.entering();
        for b in self.buttons.iter_mut() {
            moving |= b.step(now);
        }
        if let Some(p) = self.promotion.as_mut() {
            if p.shown_ms.is_none() {
                p.shown_ms = Some(now);
            }
            for o in p.opacity.iter_mut() {
                if o.step(now) {
                    self.modal_dirty = true;
                }
            }
            if let Some(c) = p.closing_ms {
                if now - c >= 300.0 {
                    self.promotion = None;
                }
            }
            moving = true;
        }
        moving
    }
}

// Drawing.

impl Chessboard {
    /// The board's canvas: background, highlights, dots and the piece atlas.
    fn draw_board(&mut self) {
        let ps = self.ps();
        let s = self.scale;
        if self.fonts.board.is_none() {
            self.fonts.board = draw2d::match_system_font(ps * 0.15, 400.0);
        }
        let c = &mut self.canvas;
        c.begin(s);
        let light = Color::hex(theme::BOARD_LIGHT);
        let dark = Color::hex(theme::BOARD_DARK);
        for row in 0..8 {
            for col in 0..8 {
                let is_light = (row + col) % 2 == 0;
                c.draw_rect(col as f32 * ps, row as f32 * ps, ps, ps, &Paint::fill(if is_light { light } else { dark }));
            }
        }
        if let Some(font) = self.fonts.board.as_ref() {
            const COLUMNS: &str = "abcdefgh";
            for col in 0..8 {
                let (x, y) = (col as f32 * ps, 7.0 * ps);
                let is_light = (7 + col) % 2 == 0;
                let color = if is_light { dark } else { light };
                c.draw_text(&COLUMNS[col..col + 1], x + ps - ps * 0.15, y + ps - ps * 0.05, font, &Paint::fill(color));
            }
            for row in 0..8 {
                let y = row as f32 * ps;
                let is_light = row % 2 == 0;
                let color = if is_light { dark } else { light };
                c.draw_text(&(8 - row).to_string(), ps * 0.05, y + ps * 0.18, font, &Paint::fill(color));
            }
        }
        // The last move's squares are gold, not the accent, to read on this board.
        let last = Color::parse("rgba(235, 199, 105, 0.5)");
        let check = Color::hex(theme::LOSE);
        let hint = Color::parse("rgba(124, 92, 200, 0.55)");
        for row in 0..8 {
            for col in 0..8 {
                let sq = &self.squares[at(col, row) as usize];
                let (x, y) = (col as f32 * ps, row as f32 * ps);
                if sq.last_fade.value > 0.0 {
                    c.draw_rect(x, y, ps, ps, &Paint::fill(last).with_opacity(sq.last_fade.value as f32));
                }
                if sq.check_fade.value > 0.0 {
                    c.draw_rect(x, y, ps, ps, &Paint::fill(check).with_opacity(sq.check_fade.value as f32));
                }
                if sq.hint_fade.value > 0.0 {
                    c.draw_rect(x, y, ps, ps, &Paint::fill(hint).with_opacity(sq.hint_fade.value as f32));
                }
            }
        }
        if !self.valid.is_empty() {
            let r = ps * 0.15;
            let valid = self.valid.clone();
            c.draw_with(&Paint::fill(Color::rgba8(0, 0, 0, 255).alpha(0.3)).with_opacity(0.5), |b| {
                for &m in &valid {
                    let (x, y) = pos(m, ps);
                    draw2d::add_circle(b, x + ps / 2.0, y + ps / 2.0, r);
                }
            });
        }
    }

    /// The pieces: one atlas over the board, with taken pieces fading out first.
    fn draw_pieces(&mut self) {
        let ps = self.ps();
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(self.scale);
        if let Some(sprite) = self.sprite.as_ref() {
            let cell = 128.0;
            let mut rects = Vec::with_capacity(4);
            let mut xf = Vec::with_capacity(4);
            let mut colors = Vec::with_capacity(4);
            for g in self.ghosts.iter() {
                let t = ((self.now - g.at - CAPTURE_AT) / CAPTURE_MS).clamp(0.0, 1.0);
                let e = Easing::bezier(0.23, 1.0, 0.32, 1.0).at(t) as f32;
                let k = (1.0 - 0.25 * e) * ps / cell;
                let (x, y) = pos(g.sq, ps);
                let (cx, cy) = (x + ps / 2.0, y + ps / 2.0);
                rects.push(draw2d::Rect { x: g.piece.kind.column() as f32 * cell, y: g.piece.color as usize as f32 * cell, width: cell, height: cell });
                xf.push(RsXform { scos: k, ssin: 0.0, tx: cx - cell / 2.0 * k, ty: cy - cell / 2.0 * k });
                colors.push(Color::rgba8(255, 255, 255, 255).alpha(1.0 - e));
            }
            if !rects.is_empty() {
                c.draw_atlas(sprite.image(0), &rects, &xf, Some(&colors), false);
            }
            let mut pieces: Vec<(i32, i32, Piece)> = Vec::new();
            for row in 0..8 {
                for col in 0..8 {
                    let sq = at(col, row);
                    if let Some(p) = self.squares[sq as usize].piece {
                        pieces.push((self.squares[sq as usize].z, sq, p));
                    }
                }
            }
            pieces.sort_by_key(|p| p.0);
            let mut rects = Vec::with_capacity(pieces.len());
            let mut xf = Vec::with_capacity(pieces.len());
            for (_, sq, p) in pieces {
                let st = &self.squares[sq as usize];
                rects.push(draw2d::Rect { x: p.kind.column() as f32 * cell, y: p.color as usize as f32 * cell, width: cell, height: cell });
                let k = st.scale.value as f32 * ps / cell;
                let (cx, cy) = (st.tx.s.value as f32 + ps / 2.0 + self.shake(sq), st.ty.s.value as f32 + ps / 2.0);
                xf.push(RsXform { scos: k, ssin: 0.0, tx: cx - cell / 2.0 * k, ty: cy - cell / 2.0 * k });
            }
            c.draw_atlas(sprite.image(0), &rects, &xf, None, false);
        }
        self.canvas = c;
    }

    /// The two player cards.
    fn draw_cards(&mut self) {
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(self.scale);
        for side in [Side::B, Side::W] {
            self.draw_card(&mut c, side);
        }
        self.canvas = c;
    }

    fn draw_card(&self, c: &mut Canvas, side: Side) {
        let s = self.scale;
        let hair = self.hair();
        let f = &self.fonts;
        let anim = &self.cards[side as usize];
        let active = anim.active.value;
        let (x0, y0) = (16.0, self.card_top(side));
        let (w, h) = (self.size.0 - 32.0, self.card_h());
        // The card's background, then its border ring.
        let a = fixed3(active);
        if a > 0.0 {
            c.draw_continuous_rrect(x0, y0, w, h, 18.0, &Paint::fill(view(theme::SURFACE, a)));
            c.draw_path(&draw2d::border_ring_path(x0, y0, w, h, 18.0, hair), &Paint::fill(view(theme::BORDER, a)));
        }
        let (cx, cy) = (x0 + hair + 6.0, y0 + hair + 6.0);
        let cw = w - 2.0 * (hair + 6.0);
        if let Some(images) = self.images.as_ref() {
            c.save();
            c.clip_continuous_rrect(cx, cy, 40.0, 40.0, 12.0);
            let img = images.image(avatar_image(side, true));
            c.draw_rect(cx, cy, 40.0, 40.0, &Paint::image(img, Matrix::scale(img.width / 40.0, img.height / 40.0).then(Matrix::translate(-cx * img.width / 40.0, -cy * img.height / 40.0))));
            c.restore();
        }
        c.draw_with(&Paint::fill(Color::rgba8(255, 255, 255, 255).alpha(0.14)), |b| {
            draw2d::add_continuous_rrect(b, cx, cy, 40.0, 40.0, 12.0);
            draw2d::add_continuous_rrect_hole(b, cx + hair, cy + hair, 40.0 - 2.0 * hair, 40.0 - 2.0 * hair, 12.0 - hair);
        });
        let rt_h = self.line(&f.clock);
        let ch = 18.0 + rt_h;
        let clock_w = 62.0 + 12.0 * active as f32;
        let clock_l = snap(cx + cw - clock_w, s);
        let clock_r = snap(cx + cw, s);
        let clock_t = cy + snap((40.0 - ch) / 2.0, s);
        c.save();
        c.clip_continuous_rrect(clock_l, clock_t, clock_r - clock_l, ch, 12.0);
        c.draw_rect(clock_l, clock_t, clock_r - clock_l, ch, &Paint::fill(view(theme::SURFACE_HI, 1.0)));
        if active > 0.0 {
            c.draw_rect(clock_l, clock_t, clock_r - clock_l, ch, &Paint::fill(view(theme::ACCENT, 0.15)).with_opacity(active as f32));
        }
        c.restore();
        // The turn dot is drawn by the compose pass, not here.
        let slot = 6.0 * active as f32;
        if let Some(font) = f.clock.as_ref() {
            let text = self.clock_text(side);
            let tw = font.advance_width_spaced(&text, 0.3);
            let rl = snap(clock_l + 9.0 + slot + slot, s);
            let color = view(mix_gamma(theme::TEXT_MUTED, theme::TEXT, active), 1.0);
            // Centred in its 44 pt, a device pixel higher than a text line.
            let top = clock_t + 9.0 - 1.0 / s;
            draw_line(c, &text, rl + (44.0 - tw) / 2.0, top, font, color, 0.3, s);
        }
        let info_l = cx + 40.0 + 12.0;
        let name_h = self.line(&f.name);
        let info_t = cy + snap((40.0 - (name_h + 3.0 + 16.0)) / 2.0, s);
        let mut x = info_l;
        if let Some(font) = f.name.as_ref() {
            draw_line(c, NAME[side as usize], x, info_t, font, view(theme::TEXT, 1.0), -0.1, s);
            x += ceil_px(font.advance_width_spaced(NAME[side as usize], -0.1), s) + 8.0;
        }
        if let Some(font) = f.rating.as_ref() {
            let rh = self.line(&f.rating);
            draw_line(c, RATING[side as usize], x, info_t + floor_px((name_h - rh) / 2.0, s), font, view(theme::TEXT_MUTED, 1.0), 0.2, s);
            x += ceil_px(font.advance_width_spaced(RATING[side as usize], 0.2), s) + 8.0;
        }
        if let (Some(winner), Some(font)) = (self.winner(), f.tag.as_ref()) {
            let won = winner == side;
            let label = if won { "WON" } else { "LOST" };
            let tw = ceil_px(font.advance_width_spaced(label, 0.6), s) + 12.0;
            let th = self.line(&f.tag) + 4.0;
            let tt = info_t + floor_px((name_h - th) / 2.0, s);
            let hue = if won { theme::ACCENT } else { theme::LOSE };
            c.draw_continuous_rrect(x, tt, tw, th, 5.0, &Paint::fill(view(hue, 0.15)));
            draw_line(c, label, x + 6.0, tt + 2.0, font, view(hue, 1.0), 0.6, s);
        }
        // Taken pieces, value-sorted and overlapping.
        let tray_t = info_t + name_h + 3.0;
        let mut pieces = self.captured[side as usize].clone();
        pieces.sort_by_key(|&k| value(k));
        let foe = side.other();
        let mut tx = info_l;
        if let Some(images) = self.images.as_ref() {
            for (i, &k) in pieces.iter().enumerate() {
                let px = info_l + i as f32 * 11.0;
                let img = images.image(tray_image(foe, k));
                c.draw_rect(
                    px,
                    tray_t,
                    16.0,
                    16.0,
                    &Paint::image(img, Matrix::scale(img.width / 16.0, img.height / 16.0).then(Matrix::translate(-px * img.width / 16.0, -tray_t * img.height / 16.0))),
                );
            }
        }
        if !pieces.is_empty() {
            tx = info_l + 16.0 + 11.0 * (pieces.len() - 1) as f32 + 5.0;
        }
        let mat = |side: usize| self.captured[side].iter().map(|&k| value(k)).sum::<i32>();
        let lead = if side == Side::W { (mat(0) - mat(1)).max(0) } else { (mat(1) - mat(0)).max(0) };
        if lead > 0 {
            if let Some(font) = f.lead.as_ref() {
                let lh = self.line(&f.lead);
                draw_line(c, &format!("+{lead}"), tx, tray_t + floor_px((16.0 - lh) / 2.0, s), font, view(theme::TEXT_MUTED, 1.0), 0.0, s);
            }
        }
    }

    /// The turn dot's centre, half size, corner radius (points) and opacity.
    /// All zero when its slot is closed.
    fn turn_dot(&self, side: Side) -> [f32; 8] {
        let s = self.scale;
        let hair = self.hair();
        let anim = &self.cards[side as usize];
        let (active, pulse) = (anim.active.value, anim.pulse.value());
        let slot = 6.0 * active as f32;
        if slot <= 0.0 {
            return [0.0; 8];
        }
        let (x0, y0) = (16.0, self.card_top(side));
        let w = self.size.0 - 32.0;
        let (cx, cy) = (x0 + hair + 6.0, y0 + hair + 6.0);
        let cw = w - 2.0 * (hair + 6.0);
        let ch = 18.0 + self.line(&self.fonts.clock);
        let clock_w = 62.0 + 12.0 * active as f32;
        let clock_l = snap(cx + cw - clock_w, s);
        let clock_t = cy + snap((40.0 - ch) / 2.0, s);
        let slot_l = snap(clock_l + 9.0, s);
        let op = (active * (0.45 + pulse * 0.55)) as f32;
        let k = (0.8 + pulse * 0.5) as f32;
        let sw = snap(slot, s);
        // Scales the dot's rounded rect about its centre.
        let (dx, dy) = (slot_l + sw / 2.0, clock_t + ch / 2.0);
        let top = snap(clock_t + (ch - 6.0) / 2.0, s);
        let my = dy + (top + 3.0 - dy) * k;
        [dx, my, sw / 2.0 * k, 3.0 * k, (sw / 2.0).min(3.0) * k, op, 0.0, 0.0]
    }

    /// What the cards' layer shows, without the turn dot. Redrawn when this changes.
    fn cards_key(&self) -> Vec<f64> {
        let mut k = vec![self.size.0 as f64, self.size.1 as f64, self.scale as f64, self.images.is_some() as u8 as f64];
        for side in [Side::W, Side::B] {
            k.push(fixed3(self.cards[side as usize].active.value) as f64);
            k.push(self.clock[side as usize] as f64);
            k.push(self.captured[side as usize].len() as f64);
        }
        k.push(self.winner().map_or(-1.0, |w| w as usize as f64));
        k
    }

    /// The review card's sections at rest, drawn as one sheet and moved each frame.
    fn draw_sheet(&mut self) {
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(self.scale);
        let s = self.scale;
        let f = &self.fonts;
        let hair = self.hair();
        let winner = self.aura.as_ref().map_or(Side::W, |a| a.winner);
        let rows = self.review_rows();
        let secs = self.sections.clone();
        let right_block = |l: f32, w: f32| (l + w - 168.0, l + w - 106.0, l + w - 62.0);
        let centre = |c: &mut Canvas, t: &str, col: f32, top: f32, font: &Font, color: Color, spacing: f32| {
            let w = font.advance_width_spaced(t, spacing);
            draw_line(c, t, col + (62.0 - w) / 2.0, top, font, color, spacing, s);
        };
        for (k, sec) in secs.iter().enumerate() {
            let [l, t, w, h] = sec.rect;
            match (k, sec.button) {
                (0, _) => {
                    if let Some(font) = f.kicker.as_ref() {
                        draw_line(&mut c, "GAME REVIEW", l, t, font, view(theme::TEXT_MUTED, 1.0), 2.0, s);
                    }
                    if let Some(font) = f.title.as_ref() {
                        let subtitle = format!("{} wins", NAME[winner as usize]);
                        draw_line(&mut c, &subtitle, l, t + self.line(&f.kicker) + 5.0, font, view(theme::TEXT, 1.0), -0.9, s);
                    }
                }
                (1, _) => {
                    let (c1, _, c2) = right_block(l, w);
                    if let Some(font) = f.h_name.as_ref() {
                        let top = t + floor_px((38.0 - self.line(&f.h_name)) / 2.0, s);
                        centre(&mut c, NAME[0], c1, top, font, view(theme::TEXT_MUTED, 1.0), 0.0);
                        centre(&mut c, NAME[1], c2, top, font, view(theme::TEXT_MUTED, 1.0), 0.0);
                    }
                }
                (2, _) | (3, _) => {
                    let (c1, _, c2) = right_block(l, w);
                    if let Some(font) = f.h_label.as_ref() {
                        let top = t + floor_px((38.0 - self.line(&f.h_label)) / 2.0, s);
                        draw_line(&mut c, if k == 2 { "Players" } else { "Accuracy" }, l, top, font, view(theme::TEXT_MUTED, 1.0), 0.0, s);
                    }
                    if k == 2 {
                        if let Some(images) = self.images.as_ref() {
                            for (i, col) in [c1, c2].into_iter().enumerate() {
                                let (ax, ay) = (col + 14.0, t + 2.0);
                                c.save();
                                c.clip_continuous_rrect(ax, ay, 34.0, 34.0, 10.0);
                                let img = images.image(avatar_image(if i == 0 { Side::W } else { Side::B }, false));
                                let k = img.width / 34.0;
                                c.draw_rect(ax, ay, 34.0, 34.0, &Paint::image(img, Matrix::scale(k, k).then(Matrix::translate(-ax * k, -ay * k))));
                                c.restore();
                                c.draw_with(&Paint::fill(Color::rgba8(255, 255, 255, 255).alpha(0.14)), |b| {
                                    draw2d::add_continuous_rrect(b, ax, ay, 34.0, 34.0, 10.0);
                                    draw2d::add_continuous_rrect_hole(b, ax + hair, ay + hair, 34.0 - 2.0 * hair, 34.0 - 2.0 * hair, 10.0 - hair);
                                });
                            }
                        }
                    } else if let Some(font) = f.pill.as_ref() {
                        let ph = 12.0 + self.line(&f.pill);
                        for (i, col) in [c1, c2].into_iter().enumerate() {
                            let won = (i == 0) == (winner == Side::W);
                            let (px, py) = (col + 3.0, t + snap((38.0 - ph) / 2.0, s));
                            c.draw_continuous_rrect(px, py, 56.0, ph, 9.0, &Paint::fill(if won { view(theme::ACCENT, 1.0) } else { view(theme::TEXT, 0.10) }));
                            let tw = ceil_px(font.advance_width(ACCURACY[i]), s);
                            draw_line(&mut c, ACCURACY[i], px + floor_px((56.0 - tw) / 2.0, s), py + 6.0, font, view(if won { theme::BG } else { theme::TEXT }, 1.0), 0.0, s);
                        }
                    }
                }
                (4, _) => {
                    c.draw_rect(l, t + 8.0, w, hair, &Paint::fill(view(theme::BORDER, 1.0)));
                }
                (_, None) => {
                    let (q, you, opp) = rows[k - 5];
                    let color = view(q.color(), 1.0);
                    let (c1, ic, c2) = right_block(l, w);
                    if let Some(font) = f.q_label.as_ref() {
                        draw_line(&mut c, q.label(), l, t + floor_px((34.0 - self.line(&f.q_label)) / 2.0, s), font, color, -0.2, s);
                    }
                    if let Some(font) = f.q_count.as_ref() {
                        let top = t + floor_px((34.0 - self.line(&f.q_count)) / 2.0, s);
                        for (n, col) in [(you, c1), (opp, c2)] {
                            let colr = if n == 0 { view(theme::TEXT_FAINT, 1.0) } else { color };
                            centre(&mut c, &n.to_string(), col, top, font, colr, 0.0);
                        }
                    }
                    let (gx, gy) = (ic + 11.0, t + 6.0);
                    c.draw_circle(gx + 11.0, gy + 11.0, 11.0, &Paint::fill(color));
                    self.draw_glyph(&mut c, q.glyph(), gx, gy);
                }
                (_, Some(i)) => {
                    self.draw_button(&mut c, i, [l, t, w, h]);
                }
            }
        }
        self.canvas = c;
    }

    /// Centred in its 22 pt box. The ⌑ and ✕ glyphs come from the fallback font.
    fn draw_glyph(&self, c: &mut Canvas, glyph: &str, x: f32, y: f32) {
        let s = self.scale;
        let f = &self.fonts;
        let font = match glyph {
            "⌑" => f.glyph_menlo.as_ref(),
            "✕" => f.glyph_zapf.as_ref(),
            _ => f.glyph.as_ref(),
        };
        let (Some(font), Some(base)) = (font, f.glyph.as_ref()) else {
            return;
        };
        // The line is as tall as the taller of the system and fallback faces.
        let asc = (-base.metrics().ascent).max(-font.metrics().ascent);
        let lh = ceil_px(gfx::line_height(base).max(gfx::line_height(font)), s);
        let w = ceil_px(font.advance_width(glyph), s);
        let (l, t) = (x + floor_px((22.0 - w) / 2.0, s), y + floor_px((22.0 - lh) / 2.0, s));
        let baseline = ((t + asc) * s - 1e-3).ceil() / s;
        c.draw_text(glyph, l, baseline, font, &Paint::fill(view(theme::BG, 1.0)));
    }

    fn draw_button(&self, c: &mut Canvas, i: usize, [l, t, w, h]: [f32; 4]) {
        let s = self.scale;
        let f = &self.fonts;
        let hair = self.hair();
        let (icon, glyph, label, fg) = if i == 0 { (f.icon_back.as_ref(), "\u{F127}", "Back", theme::TEXT) } else { (f.icon_replay.as_ref(), "\u{F51A}", "Replay", theme::BG) };
        if i == 0 {
            c.draw_continuous_rrect(l, t, w, h, 18.0, &Paint::fill(view(theme::TEXT, 0.08)));
            c.draw_path(&draw2d::border_ring_path(l, t, w, h, 18.0, hair), &Paint::fill(view(theme::TEXT, 0.16)));
        } else {
            c.draw_continuous_rrect(l, t, w, h, 18.0, &Paint::fill(view(theme::TEXT, 1.0)));
        }
        let (Some(icon), Some(font)) = (icon, f.button.as_ref()) else {
            return;
        };
        let iw = ceil_px(icon.advance_width(glyph), s);
        let ih = ceil_px(gfx::line_height(icon), s);
        let tw = ceil_px(font.advance_width(label), s);
        let th = self.line(&f.button);
        let content = iw + 8.0 + tw;
        let x = l + snap((w - content) / 2.0, s);
        let it = t + snap((h - ih) / 2.0, s);
        let base = ((gfx::baseline(icon, it + icon.metrics().leading / 2.0)) * s - 1e-3).ceil() / s;
        c.draw_text(glyph, x, base, icon, &Paint::fill(view(fg, 1.0)));
        draw_line(c, label, x + iw + 8.0, t + floor_px((h - th) / 2.0, s), font, view(fg, 1.0), 0.0, s);
    }

    /// The promotion dialog's container and buttons, at full opacity.
    fn draw_modal(&mut self) {
        let mut c = std::mem::take(&mut self.canvas);
        c.begin(self.scale);
        if let Some(p) = self.promotion.as_ref() {
            let ([x, y, w, h], buttons) = self.modal_rects();
            c.draw_rrect_shadow(x, y + 2.0, w, h, 8.0, 4.0, Color::BLACK.alpha(0.25));
            c.draw_rrect(x, y, w, h, 8.0, &Paint::fill(view(0xffffff, 1.0)));
            if let Some(images) = self.images.as_ref() {
                for (i, [bx, by, bw, bh]) in buttons.into_iter().enumerate() {
                    c.draw_rrect(bx, by, bw, bh, 4.0, &Paint::fill(view(0xff9b71, 1.0)));
                    let img = images.image(promo_image(p.color, i));
                    let (ix, iy) = (bx + 8.0, by + 8.0);
                    let k = img.width / 48.0;
                    c.draw_rect(ix, iy, 48.0, 48.0, &Paint::image(img, Matrix::scale(k, k).then(Matrix::translate(-ix * k, -iy * k))));
                }
            }
        }
        self.canvas = c;
    }
}

const WGSL: &str = r#"
struct Layer { rect: vec4<f32>, a: vec4<f32>, b: vec4<f32> };
struct U {
    // W, H, scale, srgb
    screen: vec4<f32>,
    // board top, board size, vis, wave on
    board: vec4<f32>,
    // bg rgb, layers
    bg: vec4<f32>,
    // origin xy, progress, max radius
    wave: vec4<f32>,
    // breath, modal m, modal f, 0
    misc: vec4<f32>,
    modal: vec4<f32>,
    buttons: array<vec4<f32>, 4>,
    opacity: vec4<f32>,
    layers: array<Layer, 20>,
    // The two turn dots: (centre, half size), (radius, opacity, 0, 0); the accent's rgb.
    dots: array<vec4<f32>, 4>,
    accent: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var ta: texture_2d<f32>;
@group(0) @binding(2) var tb: texture_2d<f32>;
@group(0) @binding(3) var tc: texture_2d<f32>;
@group(0) @binding(4) var td: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)));
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}
fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

// The screen: the root's colour, the board's canvas (converted from P3): its squares, then its
// pieces; the views, and the turn dots over them.
@fragment fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var c = vec4<f32>(u.bg.rgb, 1.0);
    let p = vec2<i32>(pos.xy);
    let top = i32(round(u.board.x * u.screen.z));
    let side = i32(round(u.board.y * u.screen.z));
    if (p.y >= top && p.y < top + side && p.x < side) {
        let q = vec2<i32>(p.x, p.y - top);
        c = over(textureLoad(ta, q, 0), c);
        c = over(textureLoad(tc, q, 0), c);
    }
    c = over(textureLoad(tb, p, 0), c);
    for (var i = 0; i < 2; i++) {
        let g = u.dots[i * 2];
        let h = u.dots[i * 2 + 1];
        if (h.y > 0.0 && g.z > 0.0) {
            // A rounded box's distance, in device pixels: its coverage.
            let s = u.screen.z;
            let d = abs(pos.xy - g.xy * s) - g.zw * s + vec2<f32>(h.x * s);
            let dist = length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - h.x * s;
            let a = clamp(0.5 - dist, 0.0, 1.0) * h.y;
            c = over(vec4<f32>(u.accent.rgb * a, a), c);
        }
    }
    return vec4<f32>(c.rgb, 1.0);
}

// ---- wave-shader.ts WAVE_SKSL, over the snapshot (its sRGB bytes read as Display P3, as RN
// Skia's untagged texture image is), its result converted from P3. ----
fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn spectrum(t: f32) -> vec3<f32> {
    return 0.5 + 0.5 * cos(6.2831853 * (t + vec3<f32>(0.0, 0.33, 0.67)));
}
fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}
fn texel(i: vec2<i32>) -> vec3<f32> {
    let size = vec2<i32>(textureDimensions(ta));
    if (i.x < 0 || i.y < 0 || i.x >= size.x || i.y >= size.y) { return vec3<f32>(0.0); }
    return textureLoad(ta, i, 0).rgb;
}
// ImageShader (fit cover at the screen's size, decal, linear) at point p.
fn img(p: vec2<f32>) -> vec3<f32> {
    let q = p * u.screen.z - 0.5;
    let i = vec2<i32>(floor(q));
    let f = q - floor(q);
    let a = mix(texel(i), texel(i + vec2<i32>(1, 0)), f.x);
    let b = mix(texel(i + vec2<i32>(0, 1)), texel(i + vec2<i32>(1, 1)), f.x);
    return mix(a, b, f.y);
}
fn blur_sample(p: vec2<f32>, r: f32) -> vec3<f32> {
    if (r < 0.75) { return img(p); }
    var acc = vec3<f32>(0.0);
    let j = hash(p) * 6.2831853;
    for (var k = 0; k < 32; k++) {
        let i = f32(k);
        let t = (i + 0.5) / 32.0;
        let rad = sqrt(t) * r;
        let a = i * 2.39996323 + j;
        acc += img(p + vec2<f32>(cos(a), sin(a)) * rad);
    }
    return acc / 32.0;
}
fn wave_at(position: vec2<f32>) -> vec3<f32> {
    let res = u.screen.xy;
    let origin = u.wave.xy;
    let progress = u.wave.z;
    let max_radius = u.wave.w;
    let breath = u.misc.x;
    let band = 64.0;
    let amplitude = 50.0;
    let chroma = 0.28;
    let glow_strength = 0.55;
    let wobble = 0.04;
    let max_blur = 24.0;
    let tint = 0.8;
    let glow_c = vec3<f32>(0.8, 0.85, 0.95);

    let to_origin = position - origin;
    let dist = length(to_origin);
    var dir = vec2<f32>(0.0);
    if (dist > 0.0001) { dir = to_origin / dist; }
    let ang = atan2(to_origin.y, to_origin.x);
    let wob = 1.0 + wobble * (sin(ang * 3.0) * 0.6 + sin(ang * 2.0 + 1.7) * 0.4);
    let w = band;
    let released = ss(0.0, 0.12, progress);
    let ft = clamp((progress - 0.02) / 0.5, 0.0, 1.0);
    let fe = 1.0 - pow(1.0 - ft, 2.2);
    let front = max_radius * fe * wob;
    let x = dist - front;
    let lens = exp(-(x * x) / (2.0 * w * w));
    let shell = lens * released;
    let grad = -(x / (w * w)) * lens;
    let bend = grad * w * amplitude * released;
    let off = dir * bend;
    let ca = dir * (abs(bend) * chroma);
    let drop_r = max_radius * ss(0.06, 0.6, progress) * 1.35;
    let passed = ss(drop_r, drop_r - res.x * 0.9, dist);
    let blur_r = passed * (max_blur + 2.5 * breath);
    let center = res * 0.5;
    let recede = 1.0 + 0.045 * ss(0.2, 1.0, progress) * passed;
    let sp = center + (position - center) * recede + off;
    let grey_front = front - dist - w * 2.4;
    let grey_edge = exp(-(grey_front * grey_front) / (2.0 * (w * 3.0) * (w * 3.0)));
    let wave_fade = 1.0 - ss(0.45, 0.62, progress);
    let ca2 = dir * (grey_edge * w * chroma * 0.5);
    let ca_t = (ca + ca2) * wave_fade;
    let chroma_mix = max(shell, grey_edge) * wave_fade;
    let g = blur_sample(sp, blur_r);
    let r = img(sp + ca_t).r;
    let b = img(sp - ca_t).b;
    var col = vec3<f32>(mix(g.r, r, chroma_mix), g.g, mix(g.b, b, chroma_mix));
    let n = normalize(vec3<f32>(-dir * (grad * w * 0.9), 1.0));
    let l3 = normalize(vec3<f32>(-0.5, -0.78, 0.6));
    let h = normalize(l3 + vec3<f32>(0.0, 0.0, 1.0));
    let diff = dot(n, l3);
    let spec = pow(max(dot(n, h), 0.0), 60.0);
    col += vec3<f32>(0.82, 0.88, 1.0) * (clamp(diff, 0.0, 1.0) * shell * 0.32);
    col *= 1.0 - clamp(-diff, 0.0, 1.0) * shell * 0.4;
    col += vec3<f32>(1.0) * (spec * shell * 2.4);
    let rim = exp(-(x * x) / (2.0 * (w * 0.45) * (w * 0.45))) * released;
    col += vec3<f32>(0.85, 0.9, 1.0) * (rim * 0.18);
    let hue_t = 0.42 + 0.24 * sin(ang * 2.0 + dist * 0.008 + progress * 2.5);
    col += spectrum(hue_t) * (shell * glow_strength * wave_fade);
    col += spectrum(hue_t) * (grey_edge * glow_strength * 0.4 * wave_fade);
    col += vec3<f32>(0.78, 0.84, 1.0) * (grey_edge * 0.11 * wave_fade);
    let md = max(res.x, res.y);
    let kd = dist / md;
    let glow = exp(-kd * kd * 6.5) * (0.85 + 0.15 * breath);
    let grey = vec3<f32>(0.038, 0.046, 0.075);
    let backdrop = mix(grey, glow_c, clamp(glow * 0.06, 0.0, 1.0));
    col = mix(col, backdrop, passed * tint);
    col += (hash(position * 0.7) - 0.5) * 0.03 * passed;
    let diag = (position.x * 0.5 + position.y) / (res.y * 1.3);
    let sd = (diag - 0.32) * 2.4;
    let sheen = exp(-(sd * sd));
    col += vec3<f32>(0.55, 0.63, 0.85) * (sheen * 0.03 * passed);
    col += (hash(floor(position)) - 0.5) * 0.015;
    let uvc = position / res - 0.5;
    let vig = 1.0 - ss(0.5, 1.05, length(uvc) * 1.25);
    col *= mix(1.0, 0.72 + 0.28 * vig, passed);
    let vy = position.y / res.y;
    let bottom_dark = ss(0.3, 0.62, vy) * 0.8;
    col *= 1.0 - bottom_dark * passed;
    return col;
}
@fragment fn wave(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(p3_to_srgb(wave_at(pos.xy / u.screen.z)), 1.0);
}

// The card's layers: each section's (and button's) bitmap at rest, moved, scaled and faded.
fn card(p: vec2<f32>) -> vec4<f32> {
    let n = i32(u.bg.w);
    for (var i = 0; i < n; i++) {
        let l = u.layers[i];
        // The section: translateY then scale about its centre; a button: its press scale inside.
        var q = l.a.xy + (p - l.a.xy - vec2<f32>(0.0, l.a.z)) / l.a.w;
        q = l.b.xy + (q - l.b.xy) / l.b.z;
        if (q.x >= l.rect.x && q.y >= l.rect.y && q.x < l.rect.x + l.rect.z && q.y < l.rect.y + l.rect.w) {
            let size = vec2<f32>(textureDimensions(tc));
            let s = textureSampleLevel(tc, smp, q * u.screen.z / size, 0.0);
            return s * l.b.w;
        }
    }
    return vec4<f32>(0.0);
}
fn in_rect(p: vec2<f32>, r: vec4<f32>) -> bool {
    return p.x >= r.x && p.y >= r.y && p.x < r.x + r.z && p.y < r.y + r.w;
}
@fragment fn finish(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy / u.screen.z;
    var c = textureLoad(ta, vec2<i32>(pos.xy), 0);
    let vis = u.board.z;
    if (u.board.w > 0.5 && vis > 0.0) {
        let o = over(card(p) * vis, textureLoad(tb, vec2<i32>(pos.xy), 0));
        c = o * vis + c * (1.0 - vis);
    }
    let m = u.misc.y;
    if (m > 0.0) {
        c = vec4<f32>(c.rgb * (1.0 - 0.5 * m), 1.0);
        var a = m * u.misc.z;
        for (var i = 0; i < 4; i++) {
            if (in_rect(p, u.buttons[i])) { a = a * u.opacity[i]; }
        }
        c = over(textureLoad(td, vec2<i32>(pos.xy), 0) * a, c);
    }
    var rgb = c.rgb;
    if (u.screen.w > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb, 1.0);
}
"#;

const UNIFORM_SIZE: usize = 16 * (6 + 4 + 1) + 20 * 48 + 16 * 5;
/// The dots' and the accent's place in the uniforms (after the 20 layers).
const U_DOTS: usize = (16 * (6 + 4 + 1) + 20 * 48) / 4;

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, px: (u32, u32), board_px: u32) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("chessboard"), source: wgpu::ShaderSource::Wgsl(WGSL.into()) });
    let tex = |binding| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
        count: None,
    };
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("chessboard"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            tex(1),
            tex(2),
            tex(3),
            tex(4),
            wgpu::BindGroupLayoutEntry { binding: 5, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
        ],
    });
    let rgba = wgpu::TextureFormat::Rgba8Unorm;
    let t = |label| draw2d::render::sampled_target(device, label, rgba, px.0, px.1);
    Gpu {
        format,
        compose: draw2d::render::fullscreen_pipeline(device, &module, &layout, "compose", rgba, None),
        wave: draw2d::render::fullscreen_pipeline(device, &module, &layout, "wave", rgba, None),
        finish: draw2d::render::fullscreen_pipeline(device, &module, &layout, "finish", format, None),
        buffer: device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("chessboard"),
            size: UNIFORM_SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }),
        sampler: draw2d::render::linear_sampler(device),
        layout,
        px,
        board: draw2d::render::sampled_target(device, "chessboard board", rgba, board_px, board_px),
        pieces: draw2d::render::sampled_target(device, "chessboard pieces", rgba, board_px, board_px),
        ui: t("chessboard ui"),
        screen: t("chessboard screen"),
        snapshot: t("chessboard snapshot"),
        wave_out: t("chessboard wave"),
        sheet: t("chessboard sheet"),
        modal: t("chessboard modal"),
        dummy: draw2d::render::sampled_target(device, "chessboard dummy", rgba, 1, 1),
        groups: None,
    }
}

fn bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

impl Surface for Chessboard {
    /// Inputs: the hint and solution taps, as counters (each rise is one tap).
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        let (hints, solves) = (n(0), n(1));
        if let Some((h, v)) = self.seen {
            if self.size.0 > 0.0 {
                if hints > h {
                    self.hint_request();
                }
                if solves > v {
                    self.solve_request();
                    self.run_callbacks();
                }
            }
        }
        self.seen = Some((hints, solves));
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.messages))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let fen = self.chess.fen();
        let sq = |s: Option<i32>| s.map_or("null".to_string(), |s| format!("\"{}\"", chess::algebraic(s)));
        Some(format!(
            "{{\"fen\":\"{fen}\",\"plies\":{},\"status\":\"{}\",\"selected\":{},\"valid\":{},\"clocks\":[{},{}],\"aura\":{},\"card\":{},\"promotion\":{},\"held\":{},\"mode\":\"{}\"}}",
            self.plies.len(),
            self.status,
            sq(self.selected),
            self.valid.len(),
            self.clock[0],
            self.clock[1],
            self.aura.as_ref().map_or(0.0, |a| a.vis.value),
            self.aura.as_ref().is_some_and(|a| a.card.is_some()),
            self.promotion.is_some(),
            self.pan.tracking() || self.held.is_some(),
            self.puzzle_mode()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        self.now = self.now.max(at_ms);
        if self.promotion.as_ref().is_some_and(|p| p.shown_ms.is_some()) || self.promotion.as_ref().is_some_and(|p| p.held.is_some()) {
            self.modal_input(id, phase, x, y);
            self.run_js();
            return;
        }
        // Above half visibility the overlay takes touches for the card's buttons.
        let overlay = self.aura.as_ref().is_some_and(|a| a.vis.value > 0.5);
        if overlay || self.held.is_some() {
            if phase == Phase::Down && self.held.is_none() {
                self.held = Some(id);
            }
            if self.held == Some(id) {
                let mounted = self.aura.as_ref().is_some_and(|a| a.card.is_some());
                for i in 0..2 {
                    let inside = mounted && self.in_button(i, x, y);
                    if let Some(PressEvent::Press(press)) = self.buttons[i].pointer(id, phase, inside) {
                        self.messages.extend(press.global_message().map(String::from));
                        self.hide();
                        if i == 0 {
                            self.rematch();
                        } else {
                            self.play_sequence();
                        }
                    }
                }
                if matches!(phase, Phase::Up | Phase::Cancel) {
                    self.held = None;
                }
            }
            self.run_js();
            return;
        }
        self.board_input(id, phase, x, y, at_ms);
        self.run_js();
    }

    fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
        let first = self.size.0 <= 0.0;
        let resized = self.size != (frame.width, frame.height) || self.scale != frame.scale;
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        self.now = frame.now_ms;
        if first {
            self.mount_squares();
            self.next_tick = Some(self.now + 1000.0);
            // The opponent's setup move comes after a short beat.
            self.reply_at = Some(self.now + START_DELAY);
        }
        if resized {
            if !first {
                // A resize snaps every piece to its square.
                let ps = self.ps();
                let mut q = Vec::new();
                for i in 0..128 {
                    if i & 0x88 == 0 && self.squares[i].piece.is_some() {
                        let (x, y) = pos(i as i32, ps);
                        self.squares[i].tx.set(x as f64, &mut q);
                        self.squares[i].ty.set(y as f64, &mut q);
                    }
                }
                self.callbacks.extend(q);
            }
            self.layout_sections();
            self.fonts.board = None;
            self.board_dirty = true;
            self.pieces_dirty = true;
            self.sheet_dirty = true;
            self.modal_dirty = true;
        }
        self.timers();
        self.run_js();
        let mut moving = self.step();
        self.run_js();
        moving |= self.started && !self.game_over;
        moving |= self.replay.is_some() || self.aura_timer.is_some() || self.show_at.is_some() || !self.mate_haptics.is_empty();
        moving |= self.reply_at.is_some() || self.wrong.is_some();
        let mode = self.puzzle_mode();
        if mode != self.mode {
            self.mode = mode;
            self.messages.push(format!("puzzle:{mode}"));
        }
        moving |= self.aura.is_some();
        moving |= self.pan.tracking() || self.held.is_some();

        let s = frame.scale;
        let px = frame.pixels();
        let board_px = (self.size.0 * s).round() as u32;
        if self.sprite.is_none() {
            let sprite = decode(SPRITE, 768);
            self.sprite = Some(Images::upload(device, queue, &[&sprite]));
            let ui: Vec<Image> = UI_IMAGES.iter().map(|(b, w)| decode(b, *w)).collect();
            let refs: Vec<&Image> = ui.iter().collect();
            self.images = Some(Images::upload(device, queue, &refs));
            self.renderers[0].set_images(self.sprite.as_ref().unwrap());
            self.renderers[4].set_images(self.sprite.as_ref().unwrap());
            for r in self.renderers[1..4].iter_mut() {
                r.set_images(self.images.as_ref().unwrap());
            }
        }
        if self.gpu.as_ref().map(|g| (g.format, g.px)) != Some((format, px)) {
            self.gpu = Some(build(device, format, px, board_px));
            self.board_dirty = true;
            self.pieces_dirty = true;
            self.cards_key.clear();
            self.sheet_dirty = true;
            self.modal_dirty = true;
        }
        if self.board_dirty {
            self.board_dirty = false;
            self.draw_board();
            let gpu = self.gpu.as_ref().unwrap();
            self.p3.draw(&mut self.renderers[0], device, queue, encoder, &self.canvas, &gpu.board, wgpu::TextureFormat::Rgba8Unorm, board_px, board_px, wgpu::Color::TRANSPARENT);
        }
        if self.pieces_dirty {
            self.pieces_dirty = false;
            self.draw_pieces();
            let gpu = self.gpu.as_ref().unwrap();
            self.p3_pieces.draw(&mut self.renderers[4], device, queue, encoder, &self.canvas, &gpu.pieces, wgpu::TextureFormat::Rgba8Unorm, board_px, board_px, wgpu::Color::TRANSPARENT);
        }
        // Redrawn only when their inputs change; the turn dot is not part of it.
        let key = self.cards_key();
        if key != self.cards_key {
            self.cards_key = key;
            self.draw_cards();
            let gpu = self.gpu.as_ref().unwrap();
            self.renderers[1].draw(device, queue, encoder, &self.canvas, &gpu.ui, wgpu::TextureFormat::Rgba8Unorm, px.0, px.1, wgpu::Color::TRANSPARENT);
        }
        let card_mounted = self.aura.as_ref().is_some_and(|a| a.card.is_some());
        if card_mounted && self.sheet_dirty {
            self.sheet_dirty = false;
            self.draw_sheet();
            let gpu = self.gpu.as_ref().unwrap();
            self.renderers[2].draw(device, queue, encoder, &self.canvas, &gpu.sheet, wgpu::TextureFormat::Rgba8Unorm, px.0, px.1, wgpu::Color::TRANSPARENT);
        }
        let modal = self.promotion.is_some();
        if modal && self.modal_dirty {
            self.modal_dirty = false;
            self.draw_modal();
            let gpu = self.gpu.as_ref().unwrap();
            self.renderers[3].draw(device, queue, encoder, &self.canvas, &gpu.modal, wgpu::TextureFormat::Rgba8Unorm, px.0, px.1, wgpu::Color::TRANSPARENT);
        }
        let (m, mf) = self.modal_alpha();
        let ([_, _, _, _], mbuttons) = self.modal_rects();
        let mut u = vec![0f32; UNIFORM_SIZE / 4];
        u[0] = frame.width;
        u[1] = frame.height;
        u[2] = s;
        u[3] = gfx::srgb_flag(format);
        u[4] = self.board_top();
        u[5] = self.size.0;
        let bg = Color::view_hex(theme::BG).0;
        u[8..11].copy_from_slice(&bg[..3]);
        if let Some(a) = self.aura.as_ref() {
            u[6] = a.vis.value as f32;
            u[7] = if a.revealed { 1.0 } else { 0.0 };
            let (ox, oy) = a.origin;
            let (w, h) = self.size;
            let max_r = [(ox, oy), (w - ox, oy), (ox, h - oy), (w - ox, h - oy)].iter().map(|(x, y)| (x * x + y * y).sqrt()).fold(0.0f32, f32::max) * 1.28;
            u[12..16].copy_from_slice(&[ox, oy, a.progress.value as f32, max_r]);
            u[16] = a.breath.value() as f32;
        }
        u[17] = m;
        u[18] = mf;
        for (i, r) in mbuttons.iter().enumerate() {
            u[24 + i * 4..28 + i * 4].copy_from_slice(r);
        }
        if let Some(p) = self.promotion.as_ref() {
            for i in 0..4 {
                u[40 + i] = p.opacity[i].value as f32;
            }
        }
        let mut n = 0;
        if card_mounted {
            for sec in self.sections.iter() {
                let (op, ty, sc) = self.enter(sec);
                let [l, t, w, h] = sec.rect;
                let k = sec.button.map_or(1.0, |i| self.buttons[i].scale() as f32);
                let o = 44 + n * 12;
                u[o..o + 12].copy_from_slice(&[l, t, w, h, l + w / 2.0, t + h / 2.0, ty, sc, l + w / 2.0, t + h / 2.0, k, op]);
                n += 1;
            }
        }
        u[11] = n as f32;
        for (i, side) in [Side::B, Side::W].into_iter().enumerate() {
            let d = self.turn_dot(side);
            u[U_DOTS + i * 8..U_DOTS + i * 8 + 8].copy_from_slice(&d);
        }
        let accent = view(theme::ACCENT, 1.0).0;
        u[U_DOTS + 16..U_DOTS + 19].copy_from_slice(&accent[..3]);
        let gpu = self.gpu.as_mut().unwrap();
        queue.write_buffer(&gpu.buffer, 0, &bytes(&u));
        let gpu = &*gpu;
        let group = |a: &wgpu::TextureView, b: &wgpu::TextureView, c: &wgpu::TextureView, d: &wgpu::TextureView| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("chessboard"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: gpu.buffer.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(a) },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(b) },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(c) },
                    wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(d) },
                    wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            })
        };
        let groups = gpu.groups.is_none().then(|| {
            [
                group(&gpu.board, &gpu.ui, &gpu.pieces, &gpu.dummy),
                group(&gpu.snapshot, &gpu.dummy, &gpu.dummy, &gpu.dummy),
                group(&gpu.screen, &gpu.wave_out, &gpu.sheet, &gpu.modal),
            ]
        });
        if let Some(g) = groups {
            self.gpu.as_mut().unwrap().groups = Some(g);
        }
        let gpu = self.gpu.as_ref().unwrap();
        let [g_compose, g_wave, g_finish] = gpu.groups.as_ref().unwrap();
        draw2d::render::fullscreen_pass(encoder, "chessboard compose", &gpu.screen, &gpu.compose, g_compose);
        // The overlay appears on the frame after the snapshot is taken.
        let mut wave = false;
        if let Some(a) = self.aura.as_mut() {
            if a.snapshot_at.is_none() {
                a.snapshot_at = Some(self.now);
                draw2d::render::fullscreen_pass(encoder, "chessboard snapshot", &gpu.snapshot, &gpu.compose, g_compose);
            } else if !a.revealed {
                a.revealed = true;
                a.vis.set(1.0);
                a.progress.set(0.0);
                a.progress.to(1.0, WAVE_MS, Easing::Linear);
                a.progress.step(self.now);
                a.breath = Pulse::at(0.0);
                a.breath.repeat(4200.0, Easing::in_out(Easing::Ease), self.now);
            }
            wave = a.revealed && a.vis.value > 0.0;
        }
        if wave {
            draw2d::render::fullscreen_pass(encoder, "chessboard wave", &gpu.wave_out, &gpu.wave, g_wave);
        }
        draw2d::render::fullscreen_pass(encoder, "chessboard", target, &gpu.finish, g_finish);
        moving || modal
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    fn touch(id: u32, phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    /// A square's centre on the screen.
    fn centre(c: &Chessboard, name: &str) -> (f32, f32) {
        let sq = chess::square(name).unwrap();
        let ps = c.ps();
        let (x, y) = pos(sq, ps);
        (x + ps / 2.0, c.board_top() + y + ps / 2.0)
    }

    fn surface_at(ms: f64) -> Chessboard {
        let mut c = Chessboard::new();
        c.size = (420.0, 912.0);
        c.scale = 3.0;
        c.now = ms;
        c.mount_squares();
        c.layout_sections();
        c
    }

    fn run(c: &mut Chessboard, from: f64, to: f64) {
        let mut ms = from;
        while ms < to {
            ms += 16.0;
            c.now = ms;
            c.timers();
            c.run_js();
            c.step();
            c.run_js();
        }
    }

    #[test]
    fn the_layout_is_yogas() {
        let c = surface_at(0.0);
        assert!((c.card_h() - 52.6667).abs() < 1e-3);
        assert!((c.group_top() - 175.3333).abs() < 1e-3, "{}", c.group_top());
        assert!((c.board_top() - 238.0).abs() < 1e-3);
        assert!((c.card_top(Side::W) - 668.0).abs() < 1e-3);
        assert_eq!(c.captured[0], vec![Kind::P, Kind::P, Kind::N, Kind::B]);
        assert_eq!(c.captured[1], vec![Kind::P, Kind::B, Kind::Q]);
        let rows = c.review_rows();
        assert_eq!(rows.len(), 10);
        assert_eq!(rows[3], (Q::Best, 10, 7));
        assert_eq!(rows[2], (Q::Book, 4, 3));
    }

    fn tap(c: &mut Chessboard, id: u32, name: &str, ms: f64) {
        let (x, y) = centre(c, name);
        c.input(&touch(id, PointerPhase::Down, x, y, ms));
        c.input(&touch(id, PointerPhase::Up, x, y, ms + 50.0));
    }

    /// Plays the opening beat: 16...Kg2, then 17. Rh2+ and the reply 17...Kg1.
    fn to_the_mate(c: &mut Chessboard) -> f64 {
        c.reply_at = Some(START_DELAY);
        run(c, 0.0, 1000.0);
        assert_eq!(c.plies.len(), 1, "the setup move");
        tap(c, 1, "h1", 1000.0);
        tap(c, 2, "h2", 1100.0);
        assert_eq!(c.plies.len(), 2, "17. Rh2+");
        assert_eq!(c.puzzle_mode(), "wait");
        run(c, 1150.0, 1500.0);
        assert_eq!(c.plies.len(), 2, "the reply waits REPLY_DELAY");
        run(c, 1500.0, 2200.0);
        assert_eq!(c.plies.len(), 3, "17...Kg1");
        assert_eq!(c.chess.fen(), START_FEN);
        assert_eq!(c.puzzle_mode(), "play");
        2200.0
    }

    #[test]
    fn the_puzzle_opens_on_the_opponents_move() {
        let mut c = surface_at(0.0);
        c.reply_at = Some(START_DELAY);
        assert_eq!((c.chess.turn(), c.puzzle_mode()), (Side::B, "wait"));
        tap(&mut c, 1, "h1", 100.0);
        assert_eq!(c.selected, None);
        run(&mut c, 0.0, 880.0);
        assert_eq!(c.plies.len(), 0);
        run(&mut c, 880.0, 940.0);
        assert_eq!(c.plies.len(), 1);
        let f3 = chess::square("f3").unwrap() as usize;
        assert_eq!(c.squares[f3].z, 100);
        assert!(c.messages().contains(&"haptic:impact-light".to_string()));
        run(&mut c, 940.0, 1600.0);
        assert_eq!(c.squares[chess::square("g2").unwrap() as usize].piece, Some(Piece { color: Side::B, kind: Kind::K }));
        assert_eq!(c.squares[f3].piece, None);
    }

    #[test]
    fn a_dragged_king_mates_and_the_aura_follows() {
        let mut c = surface_at(0.0);
        let mut ms = to_the_mate(&mut c);
        c.messages();
        let (x0, y0) = centre(&c, "e1");
        let (x1, y1) = centre(&c, "d2");
        c.input(&touch(1, PointerPhase::Down, x0, y0, ms));
        for k in 1..=10 {
            ms += 16.0;
            let t = k as f32 / 10.0;
            c.input(&touch(1, PointerPhase::Move, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ms));
            run(&mut c, ms - 16.0, ms);
        }
        assert!(c.valid.contains(&chess::square("d2").unwrap()), "{:?}", c.valid);
        ms += 16.0;
        c.input(&touch(1, PointerPhase::Up, x1, y1, ms));
        assert_eq!(c.status, "Checkmate");
        assert_eq!(c.plies.len(), 4);
        assert_eq!(c.winner(), Some(Side::W));
        assert!(c.game_over && c.started);
        assert_eq!(c.puzzle_mode(), "done");
        run(&mut c, ms, ms + 1000.0);
        assert_eq!(c.squares[chess::square("d2").unwrap() as usize].piece, Some(Piece { color: Side::W, kind: Kind::K }));
        assert_eq!(c.squares[chess::square("e1").unwrap() as usize].piece, None);
        assert!(c.squares[chess::square("g1").unwrap() as usize].in_check);
        assert!(c.aura.is_some() && c.busy);
        let msgs = c.messages();
        assert_eq!(msgs.iter().filter(|m| *m == "haptic:mate").count(), 1, "{msgs:?}");
        assert!(c.reply_at.is_none());
    }

    #[test]
    fn a_wrong_move_shakes_and_goes_home_and_the_clock_burns() {
        let mut c = surface_at(0.0);
        c.next_tick = Some(1000.0);
        c.reply_at = Some(START_DELAY);
        run(&mut c, 0.0, 1000.0);
        c.messages();
        tap(&mut c, 1, "f6", 1000.0);
        assert_eq!(c.selected, chess::square("f6"));
        tap(&mut c, 2, "d7", 1200.0);
        assert_eq!(c.plies.len(), 1, "not played");
        assert_eq!(c.messages(), vec!["haptic:error".to_string()]);
        assert_eq!(c.puzzle_mode(), "wait");
        run(&mut c, 1250.0, 1500.0);
        let f6 = chess::square("f6").unwrap();
        assert!(c.shake(f6).abs() > 0.5, "{}", c.shake(f6));
        let (d7x, _) = pos(chess::square("d7").unwrap(), c.ps());
        assert!((c.squares[f6 as usize].tx.s.value as f32 - d7x).abs() < 6.0, "{}", c.squares[f6 as usize].tx.s.value);
        run(&mut c, 1500.0, 3000.0);
        let (hx, hy) = pos(f6, c.ps());
        assert!((c.squares[f6 as usize].tx.s.value as f32 - hx).abs() < 0.5 && (c.squares[f6 as usize].ty.s.value as f32 - hy).abs() < 0.5);
        assert_eq!(c.squares[f6 as usize].z, 0);
        assert_eq!(c.squares[chess::square("d7").unwrap() as usize].piece, Some(Piece { color: Side::B, kind: Kind::P }));
        assert_eq!(c.puzzle_mode(), "play");
        assert_eq!(c.clock[0], 71);
    }

    #[test]
    fn hint_then_solution_climb_the_ladder() {
        let mut c = surface_at(0.0);
        assert!(c.bind(&[Value::Number(0.0), Value::Number(0.0)], None).is_ok());
        c.reply_at = Some(START_DELAY);
        run(&mut c, 0.0, 1000.0);
        let (h1, h2) = (chess::square("h1").unwrap() as usize, chess::square("h2").unwrap() as usize);
        c.bind(&[Value::Number(1.0), Value::Number(0.0)], None).unwrap();
        assert!(c.squares[h1].hint && !c.squares[h2].hint);
        assert_eq!(c.puzzle_mode(), "hint1");
        c.bind(&[Value::Number(2.0), Value::Number(0.0)], None).unwrap();
        assert!(c.squares[h1].hint && c.squares[h2].hint);
        assert_eq!(c.puzzle_mode(), "hint2");
        c.bind(&[Value::Number(3.0), Value::Number(0.0)], None).unwrap();
        assert_eq!(c.hint, 2);
        run(&mut c, 1000.0, 1200.0);
        assert!(c.squares[h1].hint_fade.value > 0.99);
        c.bind(&[Value::Number(3.0), Value::Number(1.0)], None).unwrap();
        assert_eq!(c.plies.len(), 2);
        assert!(!c.squares[h1].hint && !c.squares[h2].hint && c.hint == 0);
        run(&mut c, 1200.0, 1800.0);
        assert_eq!(c.plies.len(), 3);
        c.bind(&[Value::Number(3.0), Value::Number(2.0)], None).unwrap();
        assert_eq!(c.status, "Checkmate");
    }

    #[test]
    fn a_capture_fades_its_piece_out() {
        let mut c = surface_at(0.0);
        c.reset_board("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", None, None);
        c.running = true;
        c.try_move(chess::square("e4").unwrap(), chess::square("d5").unwrap(), None, Some(7));
        assert_eq!(c.ghosts.len(), 1);
        assert_eq!(c.messages(), vec!["haptic:impact-medium".to_string()]);
        run(&mut c, 0.0, 200.0);
        assert_eq!(c.ghosts.len(), 1);
        run(&mut c, 200.0, 400.0);
        assert!(c.ghosts.is_empty());
    }

    #[test]
    fn promotion_asks_for_the_piece() {
        let mut c = surface_at(0.0);
        c.reset_board("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", None, None);
        c.select_piece(chess::square("e7").unwrap());
        c.try_move(chess::square("e7").unwrap(), chess::square("e8").unwrap(), None, Some(9));
        assert!(c.promotion.is_some());
        run(&mut c, 0.0, 400.0);
        let (_, buttons) = c.modal_rects();
        let [x, y, w, h] = buttons[3];
        c.input(&touch(3, PointerPhase::Down, x + w / 2.0, y + h / 2.0, 400.0));
        c.input(&touch(3, PointerPhase::Up, x + w / 2.0, y + h / 2.0, 460.0));
        assert_eq!(c.plies.len(), 1);
        run(&mut c, 460.0, 1200.0);
        assert!(c.promotion.is_none());
        assert_eq!(c.squares[chess::square("e8").unwrap() as usize].piece, Some(Piece { color: Side::W, kind: Kind::N }));
    }

    #[test]
    fn castling_mates_too_and_back_restarts_the_puzzle() {
        let mut c = surface_at(0.0);
        let ms = to_the_mate(&mut c);
        tap(&mut c, 1, "e1", ms);
        tap(&mut c, 2, "c1", ms + 100.0);
        assert_eq!(c.status, "Checkmate");
        run(&mut c, ms + 150.0, ms + 1800.0);
        let at = |c: &Chessboard, n: &str| c.squares[chess::square(n).unwrap() as usize].piece;
        assert_eq!(at(&c, "d1"), Some(Piece { color: Side::W, kind: Kind::R }));
        assert_eq!(at(&c, "c1"), Some(Piece { color: Side::W, kind: Kind::K }));
        assert_eq!(at(&c, "a1"), None);
        let a = c.aura.as_mut().unwrap();
        assert!(a.card.is_some());
        a.revealed = true;
        a.vis.set(1.0);
        let ms = ms + 1800.0;
        run(&mut c, ms, ms + 600.0);
        let back = c.sections.iter().find(|s| s.button == Some(0)).unwrap().rect;
        let (bx, by) = (back[0] + back[2] / 2.0, back[1] + back[3] / 2.0);
        c.input(&touch(3, PointerPhase::Down, bx, by, ms + 600.0));
        c.input(&touch(3, PointerPhase::Up, bx, by, ms + 660.0));
        assert!(c.messages().contains(&"haptic:selection".to_string()));
        run(&mut c, ms + 660.0, ms + 1200.0);
        assert!(c.aura.is_none() && !c.busy);
        assert_eq!(c.chess.fen(), PUZZLE_FEN);
        assert_eq!(at(&c, "f3"), Some(Piece { color: Side::B, kind: Kind::K }));
        assert_eq!((c.plies.len(), c.status.as_str(), c.clock), (0, "Black to move", CLOCK_START));
        assert_eq!(c.captured, initial_captures());
        run(&mut c, ms + 1200.0, ms + 2000.0);
        assert_eq!(c.plies.len(), 1);
    }

    #[test]
    fn replay_plays_the_line_after_its_delay() {
        let mut c = surface_at(0.0);
        c.play_sequence();
        assert!(c.running);
        run(&mut c, 0.0, 880.0);
        assert_eq!(c.plies.len(), 0);
        run(&mut c, 880.0, 940.0);
        assert_eq!(c.plies.len(), 1);
        run(&mut c, 940.0, 6000.0);
        assert_eq!(c.plies.len(), 4);
        assert_eq!(c.status, "Checkmate");
        assert!(!c.running);
    }

    #[test]
    fn renders_the_board_cards_and_the_aura() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        assert!(s.bind(&[Value::Number(0.0), Value::Number(0.0)], None).is_ok());
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(s.messages().contains(&"puzzle:wait".to_string()));
        gfx::save_over(&rest, "chessboard-rest", [13, 14, 18]);
        let light = rest.at(3 * 4, 3 * 240);
        let dark = rest.at(3 * 60, 3 * 240);
        assert!(light[0] > 210 && dark[0] < 150 && dark[0] > 110, "{light:?} {dark:?}");
        let top = rest.at(30, 30);
        assert!(top[0] < 20 && top[2] < 25, "{top:?}");
        let mut ms = 0.0;
        let frames = |s: &mut Box<dyn Surface>, to: f64, ms: &mut f64| {
            while *ms < to {
                *ms += 8.0;
                fixture::render(&gpu, s.as_mut(), &frame(*ms)).unwrap();
            }
        };
        frames(&mut s, 1400.0, &mut ms);
        assert!(s.messages().contains(&"puzzle:play".to_string()));
        s.bind(&[Value::Number(0.0), Value::Number(1.0)], None).unwrap();
        frames(&mut s, 2400.0, &mut ms);
        let agent = s.agent("{}").unwrap();
        assert!(agent.contains("\"plies\":3") && agent.contains("\"mode\":\"play\""), "{agent}");
        let (moved, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        let (fx, fy) = ((3.0 * 288.75) as u32, (3.0 * 526.75) as u32);
        assert!(rest.at(fx, fy)[0] < 150 && moved.at(fx, fy)[0] > 200, "{:?} {:?}", rest.at(fx, fy), moved.at(fx, fy));
        let p = |ph, x, y, ms| touch(1, ph, x, y, ms);
        let (x0, y0) = (4.5 * 52.5, 238.0 + 7.5 * 52.5);
        let (x1, y1) = (3.5 * 52.5, 238.0 + 6.5 * 52.5);
        s.input(&p(PointerPhase::Down, x0, y0, ms));
        for k in 1..=10 {
            ms += 16.0;
            let t = k as f32 / 10.0;
            s.input(&p(PointerPhase::Move, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms += 16.0;
        s.input(&p(PointerPhase::Up, x1, y1, ms));
        let end = ms + 4500.0;
        let wave_at = ms + 1700.0;
        while ms < end {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if (wave_at..wave_at + 16.0).contains(&ms) {
                gfx::save_over(&img, "chessboard-wave", [13, 14, 18]);
            }
        }
        let agent = s.agent("{}").unwrap();
        assert!(agent.contains("\"status\":\"Checkmate\"") && agent.contains("\"card\":true"), "{agent}");
        let (end, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&end, "chessboard-review", [13, 14, 18]);
        let replay = end.at(3 * 320, 3 * 840);
        assert!(replay[0] > 200, "{replay:?}");
        let haze = end.at(3 * 210, 3 * 150);
        assert!(haze[0] < 90, "{haze:?}");
    }
}
