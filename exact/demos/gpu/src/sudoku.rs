//! Sudoku (src/animations/sudoku: index.tsx, theme.ts, logic/{sudoku.ts, sudoku-game.ts},
//! components/{button.tsx, number-pad.tsx, sudoku-board/{index.tsx, constants.ts, cell.tsx,
//! cell-container.tsx}}; react-native-fast-confetti 1.1.2's PIConfetti): "SUDOKU" over a card
//! with a Start Game button; started, the 9 × 9 board fades in, its cells in a diagonal cascade,
//! then a number pad; a cell selects (its number's cells get a spring circle), the pad fills it,
//! a solved board blasts 500 confetti flakes with a haptic celebration; the title solves the
//! board ("Genius!" 2.1 s later), New Game asks first. Everything drawn is here; the two
//! Alert.alerts are the Contract's dialogs (the surface posts `alert:new-game` / `alert:genius`,
//! the dialogs' buttons come back as the `reset` / `ok` tokens).
//!
//! Layout: React Native 0.88's Yoga as Fabric runs it (YGErrataAll, flexShrink 0, edges on the
//! device-pixel grid: a node's left/top rounded relative to its parent, its size from its
//! rounded absolute edges; a Text's measured size `ceil((v + 0.001) × scale) / scale`,
//! RCTTextLayoutManager's rounding). Checked node by node against RN's own Yoga
//! (exact/parity-tools/sudoku/yoga-layout.cpp) in `the_layout_is_react_natives_yoga`. Notable:
//! the started card is max(W − 40, BOARD_SIZE + 34) wide (it overflows the content's padding,
//! centred), the pad is min(W − 74, 400) wide (its first measure's room) and wraps 5 + 5 at 420,
//! the cells fill the board edge to edge under its 2 pt border (rows overflow its padding box,
//! centred).
//!
//! Drawing (Core Animation's composition of RN's views):
//! - The LinearGradient (expo-linear-gradient: a CGGradient in DeviceRGB of the colours as
//!   sRGB UIColors, drawn into an 8-bit image): #0A1222 → #121D33 top to bottom, each pixel row
//!   at its centre, rounded to 8 bits, runs of equal rows one rect.
//! - View and Text colours are Display P3 (`Color::view_hex`); rgba alphas are RN's
//!   `processColor` bytes (round(a × 255)). COLORS.border + '40' is 'rgba(148, 163, 184,
//!   0.25)40': normalize-colors' rgba matcher is unanchored, so it is COLORS.border.
//! - The card (boardContainer): boxShadow 0 3 6 rgba(0,0,0,0.23) (RCTBoxShadow: σ = blur / 2 =
//!   3, its circular rounded rect, masked to outside the view's circular rounded rect),
//!   surface, continuous radius 16, a 1 pt Core Animation border over its children, which are
//!   clipped by its container view (overflow hidden + a boxShadow: radius 16, circular corners).
//! - Buttons (components/button.tsx): the container (boxShadow 0 2 6 rgba(0,0,0,0.08), σ 3;
//!   primary: #3B82F608 continuous r 10; its children clipped circular r 10) and the
//!   PressableScale (primary: #3B82F6 continuous r 10; secondary: a 1 pt Core Animation border
//!   of COLORS.border, continuous r 10), text weight 500, letterSpacing 0.2.
//! - The board: no background, a 2 pt primary Core Animation border (continuous r 8) over its
//!   cells, clipped continuous. Its CALayer shadow (primary, 0 4, 0.3, radius 8) is clipped by
//!   its own masksToBounds (overflow hidden), so Core Animation never shows it.
//! - A cell: its background layer (surface, or COLORS.highlight while selected with no
//!   highlighted number), RCTBorderDrawing's border image (0.5 pt borders rounded to the pixel:
//!   2 px at 3×; the 2 pt primary + '50' right/bottom of each third), the circle (continuous
//!   pill, zIndex −1: above the background layers, under the text), the number (20 pt, 600
//!   #FFFFFF; a given 500 #94A3B8). Sides of different colours meet on the corner's diagonal:
//!   each colour's trapezoids are filled in RCTBorderDrawing's order with their exact pixel
//!   coverage.
//! - The pad keys: 46², a circular-cornered 1 pt border image (r 12), the background layer
//!   continuous r 12, "1"…"9" 18 pt 500 and Ionicons backspace-outline 22 #E2E8F0 (the glyph
//!   half the font's lineGap below its box top + ascender).
//! - Group opacity as Core Animation's: the cells are drawn into a layer (board space, on the
//!   pixel grid) and each composited at its own opacity; the wrapper (board + pad) and the Start
//!   PressableScale are drawn into another layer (window space) and composited at theirs. The
//!   header's draws don't overlap, so their opacities multiply.
//! - PIConfetti: useTexture's 1000 × 60 image at one pixel per point (sizeVariation 0: every
//!   flake 10 × 10, radius 0; colour row c = the c-th colour, its SkColor alpha truncated from
//!   a × 255), drawn by an Atlas of 500 RSXforms, sampled bilinearly with the image clamped at
//!   its edges (a texel row of each edge colour is repeated around it here), Atlas opacity
//!   1 − fall.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | header opacity | entering FadeIn.duration(1000): withTiming 0 → 1, inOut(quad) | `header_fade`, from the first frame |
//! | header frame | layout LinearTransition: withTiming of originX/Y, width, height, 300 ms inOut(quad), from the current frame | `AnimFrame` |
//! | card frame | the same | `AnimFrame`; children at their new place in it, ghosts at their old |
//! | headerActions opacity | entering FadeIn.duration(400); no exiting (kept while its child exits) | `Actions::group` |
//! | New Game / Start PressableScale opacity | entering FadeIn.duration(400); exiting FadeOut.duration(200) from 1 (FadeOut's initial value) | `press_fade` |
//! | PressableScale scale (title, New Game, Start) | pressto as designed (RNGH 3.3 shows none: pressto 0.7 hands its v3 BaseButton onBegan/onEnded, which it never reads): withTiming(active, 250 ms, bezier(0.25, 0.1, 0.25, 1)), 1 → 0.96 about its centre; onPress at a lift inside it, not on a cancel | `pressto::Pressable` per `Which`; a button's container (shadow, tint) does not scale |
//! | wrapper opacity | entering FadeIn.duration(800), exiting FadeOut.duration(200) | `BoardView::wrapper` |
//! | board opacity, translateY | entering FadeInDown.duration(200): 0 → 1, 25 → 0, inOut(quad) | `BoardView::enter` |
//! | cell opacity | entering FadeIn.delay(max(0, (r + c) × 75 − elapsed)).duration(350), the row mounted one per frame (rAF) from setTimeout(600)'s revealStart | `CellAnim::fade`, delay from the row's JS render time |
//! | cell circle scale | withSpring(h ? 1 : 0), default (900, 120, 4) | `CellAnim::scale` |
//! | cell circle opacity | withTiming(h ? 1 : 0, 150 ms, inOut(quad)) | `CellAnim::opacity` |
//! | cell circle colour | withSpring between rgba(59,130,246,0.35) and (…,0): Reanimated springs R, G, B in gamma 2.2 space (equal here, so constant) and A linearly, clamps, alpha < 0.001 → 0, then processColor's byte | `CellAnim::alpha`, `alpha_byte` |
//! | cell background | selected && highlighted 0 ? highlight : surface, instant | `selected` |
//! | pad scale | onPressIn withSpring(0.95, { mass 0.3, damping 10, stiffness 100 }), onPressOut withSpring(1, same), Pressability's 130 ms minimum press | `KeyAnim::scale` |
//! | pad colours | highlighted ? highlightStrong / primary / primaryLight : transparent / border / #FFFFFF, instant | `key_highlight` |
//! | pad mount | setTimeout(delay + 1600 = 2200) after the board's effect; no entering | `Timer::Numpad` |
//! | confetti blast | withTiming(1, 1000 ms) (inOut(quad)) | `Confetti::blast` |
//! | confetti fall | withTiming(1, 10000 ms) (inOut(quad)) | `Confetti::fall` |
//! | flake transform | PIConfetti's useRSXformBuffer worklet, line for line (golden-angle start, delayBlast with IDENTITY extrapolation, fall distance H + 100 − 150 + 300, the 8-stop randomX, rz / rx, \|cos rx\| flip) | `flake` |
//! | haptics | the app's PressablesConfig onPress (selection) on every PressableScale press; playCelebrationHaptics: light ×3 (50 ms), medium ×3 (80 ms), heavy, 100, heavy, 100, success, each wait a setTimeout after the haptic | `haptic:*`, `Timer::Haptic` |
//! | Genius alert | setTimeout(100) then setTimeout(2000) after solve() | `Timer::Solved`, `Timer::Genius` |
//!
//! JS timing: a touch's or a timer's JS work shows at the next frame (React's commit, a shared
//! value's set); setTimeout fires on the first frame at or after its time (RCTTiming); an exiting
//! view keeps its place in its parent and its last state.

use std::sync::Mutex;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::{
    interpolate, interpolate_clamp, Easing, Extrapolation, Spring, SpringConfig, Timing, GENTLE,
};
use skia::{Canvas, Color, Font, ImageRef, Images, Matrix, Paint, Rect, Renderer, RsXform};

use crate::gfx::{self, Random};

/// theme.ts COLORS (RN View / Text colours: Display P3).
const BACKGROUND: u32 = 0x0A1222;
const SURFACE: u32 = 0x121D33;
const PRIMARY: u32 = 0x3B82F6;
const PRIMARY_LIGHT: u32 = 0x60A5FA;
const TEXT: u32 = 0xFAFAFA;
const TEXT_SECONDARY: u32 = 0xE2E8F0;
const TEXT_TERTIARY: u32 = 0x94A3B8;
const INITIAL: u32 = 0x94A3B8;
const USER_INPUT: u32 = 0xFFFFFF;
/// COLORS.border 'rgba(148, 163, 184, 0.25)': processColor's alpha byte round(0.25 × 255).
const BORDER: u32 = 0x94A3B8;
const BORDER_A: u8 = 64;
/// highlight 0.25, highlightStrong 0.35 (rgba(59, 130, 246, a)), primary + '50', primary + '08'.
const HIGHLIGHT_A: u8 = 64;
const HIGHLIGHT_STRONG_A: u8 = 89;
const THIRD_A: u8 = 0x50;
const PRIMARY_CONTAINER_A: u8 = 0x08;
/// ELEVATION.medium boxShadow '0px 3px 6px rgba(0, 0, 0, 0.23)'; the Button's '0px 2px 6px
/// rgba(0, 0, 0, 0.08)': offset, σ = blur / 2, alpha byte.
const CARD_SHADOW: (f32, f32, u8) = (3.0, 3.0, 59);
const BUTTON_SHADOW: (f32, f32, u8) = (2.0, 3.0, 20);
/// Radii: card 16, button 10, board 8, pad key 12.
const CARD_R: f32 = 16.0;
const BUTTON_R: f32 = 10.0;
const BOARD_R: f32 = 8.0;
const KEY_R: f32 = 12.0;
/// SIZE_MAP and letterSpacings.
const TITLE_SPACING: f32 = 1.0;
const SUBTITLE_SPACING: f32 = 0.3;
const BUTTON_SPACING: f32 = 0.2;
/// Pad keys: 46², border 1, gap 10, padding 12, marginTop 32.
const KEY: f32 = 46.0;
const KEY_GAP: f32 = 10.0;
const PAD_PADDING: f32 = 12.0;
const PAD_TOP: f32 = 32.0;
/// SudokuBoard's `delay` and the number pad's delay + 1600.
const REVEAL_MS: f64 = 600.0;
const NUMPAD_MS: f64 = 600.0 + 1600.0;
/// The cascade: (row + col) × 75 ms, FadeIn 350 ms.
const STAGGER_MS: f64 = 75.0;
const CELL_FADE_MS: f64 = 350.0;
/// Pressability: minimum press, press retention offsets (top, left, right, bottom).
const MIN_PRESS_MS: f64 = 130.0;
const RETENTION: (f32, f32, f32, f32) = (20.0, 20.0, 20.0, 30.0);
/// The pad's press springs.
const KEY_SPRING: SpringConfig = SpringConfig {
    stiffness: 100.0,
    damping: 10.0,
    mass: 0.3,
};
/// generateSudoku('medium').
const CELLS_TO_REMOVE: u32 = 45;
/// PIConfetti: count, flake 10 × 10, blastRadius 300, fallDuration 10000, blastDuration 1000,
/// blast position (width / 2, 150), containerHeight = window height + 100.
const FLAKES: usize = 500;
const FLAKE: f32 = 10.0;
const BLAST_RADIUS: f64 = 300.0;
const FALL_MS: f64 = 10000.0;
const BLAST_MS: f64 = 1000.0;
const BLAST_Y: f64 = 150.0;
/// useVariations: sizeSteps² = 100 size variations (all 10 × 10 at sizeVariation 0).
const SIZES: usize = 100;
/// ConfettiColors as RN Skia reads them: SkColorSetARGB(a × 255, …) truncates the alpha
/// (0.15 → 38, 0.25 → 63, 0.35 → 89), then the colour is its 8-bit channels.
const CONFETTI: [(u32, u8); 6] = [
    (0x3B82F6, 255),
    (0x60A5FA, 255),
    (0x3B82F6, 38),
    (0x3B82F6, 63),
    (0x3B82F6, 0),
    (0x3B82F6, 89),
];
/// playCelebrationHaptics: each haptic and the setTimeout after it.
const CELEBRATION: [(&str, f64); 9] = [
    ("haptic:impact-light", 50.0),
    ("haptic:impact-light", 50.0),
    ("haptic:impact-light", 50.0),
    ("haptic:impact-medium", 80.0),
    ("haptic:impact-medium", 80.0),
    ("haptic:impact-medium", 80.0),
    ("haptic:impact-heavy", 100.0),
    ("haptic:impact-heavy", 100.0),
    ("haptic:success", 0.0),
];
/// forceSolveWithConfetti's setTimeout(100), then the Genius alert's setTimeout(2000).
const SOLVED_MS: f64 = 100.0;
const GENIUS_MS: f64 = 2000.0;

/// Ionicons (@expo/vector-icons 15) cut to backspace-outline, U+F155.
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-backspace-subset.ttf");
const BACKSPACE: &str = "\u{F155}";

/// The demo's surface: `sudoku(seed, reset, ok)`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sudoku::new())
}

// ---------------------------------------------------------------------------------------------
// logic/sudoku.ts and logic/sudoku-game.ts, line for line (0 is `null`).

type Grid = [[u8; 9]; 9];

fn is_valid_move(board: &Grid, row: usize, col: usize, num: u8) -> bool {
    for x in 0..9 {
        if board[row][x] == num && x != col {
            return false;
        }
    }
    for x in 0..9 {
        if board[x][col] == num && x != row {
            return false;
        }
    }
    let box_row = row / 3 * 3;
    let box_col = col / 3 * 3;
    for i in 0..3 {
        for j in 0..3 {
            if board[box_row + i][box_col + j] == num && box_row + i != row && box_col + j != col {
                return false;
            }
        }
    }
    true
}

/// `shuffle`: Fisher–Yates from the end, `Math.floor(Math.random() * (i + 1))`.
fn shuffle<T: Copy, const N: usize>(array: [T; N], rng: &mut Random) -> [T; N] {
    let mut a = array;
    for i in (1..N).rev() {
        let j = (rng.next() * (i as f64 + 1.0)).floor() as usize;
        a.swap(i, j);
    }
    a
}

fn fill_box(board: &mut Grid, row: usize, col: usize, rng: &mut Random) {
    let nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    let mut index = 0;
    for i in 0..3 {
        for j in 0..3 {
            board[row + i][col + j] = nums[index];
            index += 1;
        }
    }
}

fn find_empty(board: &Grid) -> Option<(usize, usize)> {
    for row in 0..9 {
        for col in 0..9 {
            if board[row][col] == 0 {
                return Some((row, col));
            }
        }
    }
    None
}

fn solve_sudoku(board: &mut Grid, rng: &mut Random) -> bool {
    let Some((row, col)) = find_empty(board) else {
        return true;
    };
    let nums = shuffle([1u8, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    for num in nums {
        if is_valid_move(board, row, col, num) {
            board[row][col] = num;
            if solve_sudoku(board, rng) {
                return true;
            }
            board[row][col] = 0;
        }
    }
    false
}

fn count_solutions(board: &mut Grid, count: &mut u32) -> bool {
    let Some((row, col)) = find_empty(board) else {
        *count += 1;
        return *count > 1;
    };
    for num in 1..=9 {
        if is_valid_move(board, row, col, num) {
            board[row][col] = num;
            if count_solutions(board, count) && *count > 1 {
                return true;
            }
            board[row][col] = 0;
        }
    }
    false
}

/// `generateSudoku('medium')`: the diagonal boxes shuffled, the rest solved with shuffled
/// candidates, then each of the 81 cells tried once in shuffled order, removed while 45 are not
/// yet removed and the puzzle keeps one solution.
fn generate_sudoku(rng: &mut Random) -> (Grid, Grid) {
    let mut board = [[0u8; 9]; 9];
    for b in (0..9).step_by(3) {
        fill_box(&mut board, b, b, rng);
    }
    solve_sudoku(&mut board, rng);
    let solution = board;
    let mut puzzle = board;
    let mut removed = 0;
    let mut order = [0usize; 81];
    for (i, o) in order.iter_mut().enumerate() {
        *o = i;
    }
    let cells = shuffle(order, rng);
    for cell in cells {
        if removed >= CELLS_TO_REMOVE {
            break;
        }
        let (r, c) = (cell / 9, cell % 9);
        let temp = puzzle[r][c];
        puzzle[r][c] = 0;
        let mut temp_board = puzzle;
        let mut solutions = 0;
        count_solutions(&mut temp_board, &mut solutions);
        if solutions == 1 {
            removed += 1;
        } else {
            puzzle[r][c] = temp;
        }
    }
    (puzzle, solution)
}

fn is_cell_valid(board: &Grid, row: usize, col: usize) -> bool {
    let value = board[row][col];
    if value == 0 {
        return true;
    }
    let mut temp = *board;
    temp[row][col] = 0;
    is_valid_move(&temp, row, col, value)
}

fn is_puzzle_complete(board: &Grid) -> bool {
    for row in 0..9 {
        for col in 0..9 {
            if board[row][col] == 0 || !is_cell_valid(board, row, col) {
                return false;
            }
        }
    }
    true
}

/// sudoku-game.ts's SudokuGame.
#[derive(Clone, Debug)]
struct Game {
    board: Grid,
    initial: Grid,
    solution: Grid,
    selected: (i8, i8),
    highlighted: u8,
}

impl Game {
    fn new(initial: Grid, solution: Grid) -> Game {
        Game {
            board: initial,
            initial,
            solution,
            selected: (-1, -1),
            highlighted: 0,
        }
    }

    fn select_cell(&mut self, row: usize, col: usize) {
        if self.selected == (row as i8, col as i8) {
            self.selected = (-1, -1);
            self.highlighted = 0;
        } else {
            self.selected = (row as i8, col as i8);
            self.highlighted = self.board[row][col];
        }
    }

    fn set_number(&mut self, number: u8) -> bool {
        let (row, col) = self.selected;
        if row == -1 || col == -1 {
            return false;
        }
        if self.initial[row as usize][col as usize] != 0 {
            return false;
        }
        self.highlighted = number;
        self.board[row as usize][col as usize] = number;
        true
    }

    fn clear_cell(&mut self) -> bool {
        let (row, col) = self.selected;
        if row == -1 || col == -1 {
            return false;
        }
        if self.initial[row as usize][col as usize] != 0 {
            return false;
        }
        self.board[row as usize][col as usize] = 0;
        self.highlighted = 0;
        true
    }

    fn is_complete(&self) -> bool {
        is_puzzle_complete(&self.board)
    }

    fn solve(&mut self) -> bool {
        self.board = self.solution;
        true
    }
}

/// index.tsx's module-level `initialSudoku`: generated at the first mount, kept for the session.
static INITIAL_SUDOKU: Mutex<Option<(Grid, Grid)>> = Mutex::new(None);

// ---------------------------------------------------------------------------------------------
// Layout.

/// A frame in window points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct R {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

impl R {
    fn at(self, dx: f32, dy: f32) -> R {
        R {
            x: self.x + dx,
            y: self.y + dy,
            ..self
        }
    }
    fn rel(self, parent: R) -> R {
        R {
            x: self.x - parent.x,
            y: self.y - parent.y,
            ..self
        }
    }
    fn contains(self, x: f32, y: f32) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
    /// Scaled by `k` about its centre.
    fn scaled(self, k: f32) -> R {
        let (cx, cy) = self.center();
        R { x: cx - self.w * k / 2.0, y: cy - self.h * k / 2.0, w: self.w * k, h: self.h * k }
    }
    fn center(self) -> (f32, f32) {
        (self.x + self.w / 2.0, self.y + self.h / 2.0)
    }
}

/// Yoga's `roundValueToPixelGrid`: to the nearest device pixel, a half up, within 1e-4 of a
/// pixel already on it; `ceil` / `floor` force the way (a text node's).
fn round_px(value: f64, scale: f64, ceil: bool, floor: bool) -> f64 {
    let scaled = value * scale;
    let mut fractial = scaled % 1.0;
    if fractial < 0.0 {
        fractial += 1.0;
    }
    let near = |a: f64, b: f64| (a - b).abs() < 0.0001;
    let rounded = if near(fractial, 0.0) {
        scaled - fractial
    } else if near(fractial, 1.0) {
        scaled - fractial + 1.0
    } else if ceil {
        scaled - fractial + 1.0
    } else if floor {
        scaled - fractial
    } else {
        scaled - fractial
            + if fractial > 0.5 || near(fractial, 0.5) {
                1.0
            } else {
                0.0
            }
    };
    rounded / scale
}

/// RCTTextLayoutManager's rounding of a measured text side.
fn text_round(v: f32, scale: f32) -> f32 {
    (((v as f64 + 0.001) * scale as f64).ceil() / scale as f64) as f32
}

/// A laid-out Yoga node: its unrounded absolute origin (what its children's sizes round from)
/// and its rounded window frame (its rounded lefts summed, as UIKit composes frames).
#[derive(Clone, Copy, Debug)]
struct Node {
    ax: f64,
    ay: f64,
    r: R,
}

impl Node {
    fn root(w: f32, h: f32) -> Node {
        Node {
            ax: 0.0,
            ay: 0.0,
            r: R {
                x: 0.0,
                y: 0.0,
                w,
                h,
            },
        }
    }

    fn child(&self, s: f64, x: f32, y: f32, w: f32, h: f32) -> Node {
        self.child_of(s, x, y, w, h, false)
    }

    /// A node with a measure function, which Yoga makes a text node: its position floored, its
    /// far edges ceiled when its size is off the grid, floored when on it.
    fn text(&self, s: f64, x: f32, y: f32, w: f32, h: f32) -> Node {
        self.child_of(s, x, y, w, h, true)
    }

    fn child_of(&self, s: f64, x: f32, y: f32, w: f32, h: f32, text: bool) -> Node {
        let (ax, ay) = (self.ax + x as f64, self.ay + y as f64);
        let off = |v: f32| {
            let scaled = v as f64 * s;
            (scaled.round() - scaled).abs() >= 0.0001
        };
        let (fw, fh) = (text && off(w), text && off(h));
        let edge = |a: f64, d: f32, frac: bool| {
            round_px(a + d as f64, s, frac, text && !frac) - round_px(a, s, false, text)
        };
        Node {
            ax,
            ay,
            r: R {
                x: self.r.x + round_px(x as f64, s, false, text) as f32,
                y: self.r.y + round_px(y as f64, s, false, text) as f32,
                w: edge(ax, w, fw) as f32,
                h: edge(ay, h, fh) as f32,
            },
        }
    }
}

/// The measured (unrounded) Text sizes the layout needs: Core Text's typographic widths (the
/// letterSpacing after every glyph) and TextKit's line heights.
#[derive(Clone, Copy, Debug, Default)]
struct Sizes {
    title: (f32, f32),
    subtitle: (f32, f32),
    new_game: (f32, f32),
    start: (f32, f32),
}

/// What is mounted (the layout's inputs besides the window).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Content {
    started: bool,
    actions: bool,
    numpad: bool,
}

/// The views' final frames (window points) for a content.
#[derive(Clone, Debug)]
struct Layout {
    header: R,
    title: R,
    subtitle: R,
    actions: R,
    new_game_text: R,
    card: R,
    start: R,
    start_text: R,
    wrapper: R,
    board: R,
    cells: [R; 81],
    bgs: [R; 81],
    /// Each cell's border widths (top, left, right, bottom) as Yoga lays them out.
    borders: [[f32; 4]; 81],
    #[cfg_attr(not(test), allow(dead_code))]
    numpad: R,
    keys: [R; 10],
    board_size: f32,
}

/// The pad's lines: keys per full line for its inner width (46 wide, 10 apart).
fn keys_per_line(inner: f32) -> usize {
    let mut n = 1;
    while (n + 1) as f32 * KEY + n as f32 * KEY_GAP <= inner + 1e-4 {
        n += 1;
    }
    n
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32, sizes: Sizes, content: Content) -> Layout {
        let s = scale as f64;
        let t = |v: (f32, f32)| (text_round(v.0, scale), text_round(v.1, scale));
        let (title_w, title_h) = t(sizes.title);
        let (sub_w, sub_h) = t(sizes.subtitle);
        let (ng_w, ng_h) = t(sizes.new_game);
        let (st_w, st_h) = t(sizes.start);
        // The New Game PressableScale (small, secondary): minWidth 64, paddingH 12, paddingV 6,
        // border 1, in its alignSelf flex-start container.
        let aw = (ng_w + 24.0 + 2.0).max(64.0);
        let ah = ng_h + 12.0 + 2.0;
        let hw = title_w
            .max(sub_w)
            .max(if content.actions { aw } else { 0.0 });
        let hh = title_h + 6.0 + sub_h + if content.actions { 16.0 + ah } else { 0.0 };
        let board = (w - 48.0).min(400.0);
        let cell = board / 9.0;
        // The pad: maxWidth min(W − 32, 400), as wide as its first measure's room (W − 74).
        let nw = (w - 74.0).min((w - 32.0).min(400.0));
        let per_line = keys_per_line(nw - 2.0 * PAD_PADDING);
        let lines = 10usize.div_ceil(per_line);
        let nh = 2.0 * PAD_PADDING + lines as f32 * KEY + (lines - 1) as f32 * KEY_GAP;
        let wh = board + if content.numpad { PAD_TOP + nh } else { 0.0 };
        // The Start button (large, primary): minWidth 96, paddingH 20, paddingV 10, in its
        // container (minWidth 200), in startContainer (padding 24).
        let cw = (st_w + 40.0).max(96.0).max(200.0);
        let ph = st_h + 20.0;
        let (bw, bh) = if content.started {
            ((w - 40.0).max(board + 34.0), (wh + 34.0).max(160.0))
        } else {
            (
                (w - 40.0).max(cw + 48.0 + 34.0),
                (ph + 48.0 + 34.0).max(160.0),
            )
        };
        let total = hh + 48.0 + bh;
        let top = 20.0 + (h - 40.0 - total) / 2.0;
        let root = Node::root(w, h);
        let content_node = root.child(s, 0.0, 0.0, w, h).child(s, 0.0, 0.0, w, h);
        let header = content_node.child(s, 20.0 + (w - 40.0 - hw) / 2.0, top, hw, hh);
        let title = header
            .child(s, (hw - title_w) / 2.0, 0.0, title_w, title_h)
            .text(s, 0.0, 0.0, title_w, title_h);
        let subtitle = header.text(s, (hw - sub_w) / 2.0, title_h + 6.0, sub_w, sub_h);
        let actions = header.child(s, (hw - aw) / 2.0, title_h + 6.0 + sub_h + 16.0, aw, ah);
        let pressable = actions
            .child(s, 0.0, 0.0, aw, ah)
            .child(s, 0.0, 0.0, aw, ah);
        let new_game_text = pressable.text(
            s,
            13.0 + (aw - 26.0 - ng_w) / 2.0,
            1.0 + 6.0 + (ah - 14.0 - ng_h) / 2.0,
            ng_w,
            ng_h,
        );
        let card = content_node.child(s, 20.0 + (w - 40.0 - bw) / 2.0, top + hh + 48.0, bw, bh);
        let start_container = card.child(
            s,
            17.0 + (bw - 34.0 - (cw + 48.0)) / 2.0,
            17.0 + (bh - 34.0 - (ph + 48.0)) / 2.0,
            cw + 48.0,
            ph + 48.0,
        );
        let start = start_container
            .child(s, 24.0, 24.0, cw, ph)
            .child(s, 0.0, 0.0, cw, ph);
        let start_text = start.text(s, 20.0 + (cw - 40.0 - st_w) / 2.0, 10.0, st_w, st_h);
        let wrapper = card.child(
            s,
            17.0 + (bw - 34.0 - board) / 2.0,
            17.0 + (bh - 34.0 - wh) / 2.0,
            board,
            wh,
        );
        let sb = wrapper.child(s, 0.0, 0.0, board, wh);
        let board_node = sb.child(s, 0.0, 0.0, board, board);
        let mut cells = [R::default(); 81];
        let mut bgs = [R::default(); 81];
        let mut borders = [[0.0f32; 4]; 81];
        // Rows centred in the board's padding box (2 + (BOARD − 4 − 9 · CELL) / 2), each its
        // cells side by side from the row's start.
        let mut row_y = 2.0 + (board - 4.0 - 9.0 * cell) / 2.0;
        for r in 0..9 {
            let row = board_node.child(s, 2.0 + (board - 4.0 - board) / 2.0, row_y, board, cell);
            let mut col_x = 0.0f32;
            for c in 0..9 {
                let n = row.child(s, col_x, 0.0, cell, cell);
                let right = if (c + 1) % 3 == 0 && c != 8 { 2.0 } else { 0.5 };
                let bottom = if (r + 1) % 3 == 0 && r != 8 { 2.0 } else { 0.5 };
                let bg = n.child(s, 0.5, 0.5, cell - 0.5 - right, cell - 0.5 - bottom);
                cells[r * 9 + c] = n.r;
                bgs[r * 9 + c] = bg.r;
                borders[r * 9 + c] = [0.5, 0.5, right, bottom];
                col_x += cell;
            }
            row_y += cell;
        }
        let numpad = sb.child(s, (board - nw) / 2.0, board + PAD_TOP, nw, nh);
        let mut keys = [R::default(); 10];
        let inner = nw - 2.0 * PAD_PADDING;
        for (i, k) in keys.iter_mut().enumerate() {
            let line = i / per_line;
            let on_line = per_line.min(10 - line * per_line);
            let line_w = on_line as f32 * KEY + (on_line - 1) as f32 * KEY_GAP;
            let x = PAD_PADDING + (inner - line_w) / 2.0 + (i % per_line) as f32 * (KEY + KEY_GAP);
            let y = PAD_PADDING + line as f32 * (KEY + KEY_GAP);
            *k = numpad.child(s, x, y, KEY, KEY).r;
        }
        Layout {
            header: header.r,
            title: title.r,
            subtitle: subtitle.r,
            actions: actions.r,
            new_game_text: new_game_text.r,
            card: card.r,
            start: start.r,
            start_text: start_text.r,
            wrapper: wrapper.r,
            board: board_node.r,
            cells,
            bgs,
            borders,
            numpad: numpad.r,
            keys,
            board_size: board,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Animation pieces.

fn in_out_quad() -> Easing {
    Easing::timing_default()
}

/// A Timing at `from`, off to `to` over `ms` inOut(quad) from the next step.
fn timed(from: f64, to: f64, ms: f64) -> Timing {
    let mut t = Timing::at(from);
    t.to(to, ms, in_out_quad());
    t
}

/// A LinearTransition'd view's frame: originX/Y, width, height, each a 300 ms inOut(quad)
/// timing from where it is when the layout changes.
#[derive(Clone, Debug, Default)]
struct AnimFrame {
    parts: [Timing; 4],
    target: R,
}

impl AnimFrame {
    fn set(&mut self, r: R) {
        for (p, v) in self.parts.iter_mut().zip([r.x, r.y, r.w, r.h]) {
            p.set(v as f64);
        }
        self.target = r;
    }

    fn go(&mut self, r: R) {
        if r == self.target {
            return;
        }
        for (p, v) in self.parts.iter_mut().zip([r.x, r.y, r.w, r.h]) {
            p.to(v as f64, 300.0, in_out_quad());
        }
        self.target = r;
    }

    fn step(&mut self, now: f64) -> bool {
        let mut moving = false;
        for p in self.parts.iter_mut() {
            moving |= p.step(now);
        }
        moving
    }

    fn now(&self) -> R {
        let [x, y, w, h] = [0, 1, 2, 3].map(|i| self.parts[i].value as f32);
        R { x, y, w, h }
    }
}

/// The New Game button's headerActions View (its place in the header, from the layout it
/// mounted or left in).
#[derive(Clone, Debug)]
struct Actions {
    group: Timing,
    press: Timing,
    leaving: bool,
    rel: R,
    text_rel: R,
}

/// The Start Game button (its container's place in the card).
#[derive(Clone, Debug)]
struct StartView {
    press: Timing,
    leaving: bool,
    rel: R,
    text_rel: R,
}

/// One cell's animations.
#[derive(Clone, Debug, Default)]
struct CellAnim {
    /// The frame its row's view mounted (None: not mounted), its entering delay.
    mounted: Option<f64>,
    delay: f64,
    fade: Option<Timing>,
    highlighted: bool,
    scale: Spring,
    opacity: Timing,
    alpha: Spring,
}

impl CellAnim {
    fn fade_value(&self) -> f32 {
        self.fade.as_ref().map_or(0.0, |t| t.value as f32)
    }
}

/// A pad key's press spring.
#[derive(Clone, Debug)]
struct KeyAnim {
    scale: Spring,
}

/// The board under the card: SudokuBoard and its wrapper, live or leaving.
#[derive(Clone, Debug)]
struct BoardView {
    gen: u32,
    wrapper: Timing,
    enter: Timing,
    leaving: bool,
    /// Its wrapper's place in the card, and every frame in it (relative to the wrapper).
    rel: R,
    board: R,
    cells: [R; 81],
    bgs: [R; 81],
    borders: [[f32; 4]; 81],
    keys: [R; 10],
    /// CELL_SIZE (BOARD_SIZE / 9, unrounded).
    cell_size: f32,
    /// React's `board` state, the givens, the UI copies of selectedCell / highlightedNumber.
    shown: Grid,
    givens: Grid,
    selected: (i8, i8),
    highlight: u8,
    /// The reveal's start (performance.now() at the timer), rows rendered so far.
    reveal: Option<f64>,
    rows_rendered: usize,
    anims: Vec<CellAnim>,
    numpad: bool,
    keys_anim: Vec<KeyAnim>,
}

impl BoardView {
    fn cell_highlighted(&self, i: usize) -> bool {
        let v = self.shown[i / 9][i % 9];
        v != 0 && v == self.highlight && self.highlight != 0
    }

    /// The derived isHighlighted of every mounted cell: a flip starts its animations.
    fn update_highlights(&mut self) {
        for i in 0..81 {
            let h = self.cell_highlighted(i);
            let a = &mut self.anims[i];
            if a.mounted.is_none() || a.highlighted == h {
                continue;
            }
            a.highlighted = h;
            let v = if h { 1.0 } else { 0.0 };
            let sv = if a.scale.running {
                a.scale.velocity
            } else {
                0.0
            };
            a.scale.to(v, sv, GENTLE);
            a.opacity.to(v, 150.0, in_out_quad());
            let av = if a.alpha.running {
                a.alpha.velocity
            } else {
                0.0
            };
            a.alpha.to(if h { 0.35 } else { 0.0 }, av, GENTLE);
        }
    }
}

/// The circle's colour alpha as RN applies it: clamped, under 0.001 → 0, processColor's byte.
fn alpha_byte(a: f64) -> u8 {
    let a = a.clamp(0.0, 1.0);
    let a = if a < 0.001 { 0.0 } else { a };
    (a * 255.0).round() as u8
}

/// One PIConfetti flake's random parameters (generatePIBoxesArray).
#[derive(Clone, Copy, Debug, Default)]
struct Flake {
    clockwise: bool,
    max_rotation: (f64, f64),
    color: usize,
    size: usize,
    random_xs: [f64; 6],
    initial_rotation: f64,
    offset: (f64, f64),
    delay_blast: f64,
}

/// `getRandomValue(min, max)`: min itself when min == max (no Math.random()).
fn random_value(rng: &mut Random, min: f64, max: f64) -> f64 {
    if min == max {
        return min;
    }
    rng.next() * (max - min) + min
}

/// generatePIBoxesArray with PIConfetti's defaults (rotation x, z in [π, 3π], randomSpeed
/// [0.9, 1.3], offsets x [−50, 50], y [0, 150]), every Math.random() in its object's order.
fn flakes(rng: &mut Random, out: &mut Vec<Flake>) {
    use std::f64::consts::PI;
    out.clear();
    for _ in 0..FLAKES {
        let clockwise = rng.next() >= 0.5;
        let rx = random_value(rng, PI, 3.0 * PI);
        let rz = random_value(rng, PI, 3.0 * PI);
        let color = random_value(rng, 0.0, (CONFETTI.len() - 1) as f64).round() as usize;
        let size = random_value(rng, 0.0, (SIZES - 1) as f64).round() as usize;
        let mut random_xs = [0.0; 6];
        for x in random_xs.iter_mut() {
            *x = random_value(rng, -5.0, 5.0);
        }
        let _initial_random_y = random_value(rng, -20.0, 20.0);
        let initial_rotation = random_value(rng, 0.1 * PI, PI);
        let _random_speed = random_value(rng, 0.9, 1.3);
        let offset_x = random_value(rng, -50.0, 50.0);
        let offset_y = random_value(rng, 0.0, 150.0);
        let delay_blast = random_value(rng, 0.0, 0.6);
        let _acceleration = (random_value(rng, 0.1, 0.3), random_value(rng, 0.1, 0.3));
        out.push(Flake {
            clockwise,
            max_rotation: (rx, rz),
            color,
            size,
            random_xs,
            initial_rotation,
            offset: (offset_x, offset_y),
            delay_blast,
        });
    }
}

/// PIConfetti's transform worklet for flake `i` at (blast, fall): its RSXform.
fn flake(i: usize, f: &Flake, blast: f64, fall: f64, width: f64, height: f64) -> RsXform {
    let (cx, cy) = (width / 2.0, BLAST_Y);
    let radius = ((i as f64 + 1.0) / FLAKES as f64).sqrt() * BLAST_RADIUS;
    let angle = ((i as f64 * 137.5) % 360.0) * (std::f64::consts::PI / 180.0);
    let x = cx + radius * angle.cos();
    let y = cy + radius * angle.sin();
    let (mut tx, mut ty) = (x, y);
    let (dx, dy) = (x - cx, y - cy);
    let delayed = interpolate(
        blast,
        &[f.delay_blast, 1.0],
        &[0.0, 1.0],
        Extrapolation::Identity,
    );
    tx += -dx * (1.0 - delayed);
    ty += -dy * (1.0 - delayed);
    let container_height = height + 100.0;
    let fall_distance = interpolate(
        fall,
        &[0.0, 1.0],
        &[0.0, container_height - cy + BLAST_RADIUS],
        Extrapolation::Extend,
    );
    let spread_x = interpolate(fall, &[0.0, 1.0], &[0.0, f.offset.0], Extrapolation::Extend);
    let spread_y = interpolate(fall, &[0.0, 1.0], &[0.0, f.offset.1], Extrapolation::Extend);
    tx += spread_x;
    ty += fall_distance + spread_y;
    let jiggle = 0.1;
    let mut input = [0.0f64; 8];
    let mut output = [0.0f64; 8];
    input[1] = jiggle;
    for k in 0..6 {
        input[k + 2] = jiggle + ((k + 1) as f64 * (1.0 - jiggle)) / 6.0;
        output[k + 2] = f.random_xs[k];
    }
    tx += interpolate(fall, &input, &output, Extrapolation::Extend);
    let direction = if f.clockwise { 1.0 } else { -1.0 };
    let rz = f.initial_rotation
        + interpolate_clamp(fall, &[0.0, 1.0], &[0.0, direction * f.max_rotation.1]);
    let rx = f.initial_rotation
        + interpolate_clamp(fall, &[0.0, 1.0], &[0.0, direction * f.max_rotation.0]);
    let oscillating = rx.cos().abs();
    let blast_scale = interpolate_clamp(blast, &[0.0, 0.2, 1.0], &[0.0, 1.0, 1.0]);
    let scale = blast_scale * oscillating;
    let (px, py) = (FLAKE as f64 / 2.0, FLAKE as f64 / 2.0);
    let s = rz.sin() * scale;
    let c = rz.cos() * scale;
    RsXform {
        scos: c as f32,
        ssin: s as f32,
        tx: (tx - c * px + s * py) as f32,
        ty: (ty - s * px - c * py) as f32,
    }
}

/// A PIConfetti restart: new flakes, the blast and the fall from 0.
struct Confetti {
    flakes: Vec<Flake>,
    blast: Timing,
    fall: Timing,
}

// ---------------------------------------------------------------------------------------------
// Presses and JS.

/// The PressableScales (RNGH buttons).
#[derive(Clone, Copy, Debug, PartialEq)]
enum Which {
    Title,
    NewGame,
    Start,
}

/// What an RN Pressable responder holds.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Target {
    Cell(usize),
    Key(usize),
}

/// The Pressability responder (one at a time).
#[derive(Clone, Copy, Debug)]
struct Responder {
    id: u32,
    target: Target,
    /// The frame its press region was measured with, its activation time (None: out of the
    /// press rect).
    region: R,
    active: Option<f64>,
}

/// A setTimeout.
#[derive(Clone, Copy, Debug, PartialEq)]
enum TimerKind {
    Reveal(u32),
    Numpad(u32),
    Haptic(usize),
    Solved,
    Genius,
    PressOut(u32, usize),
}

#[derive(Clone, Copy, Debug)]
struct Timer {
    due: f64,
    kind: TimerKind,
}

/// JS work that reaches the screen at the next frame after `at`.
#[derive(Clone, Copy, Debug)]
enum Event {
    Started(u32),
    Stopped,
    Row(usize, f64),
    Numpad,
    Ui((i8, i8), u8),
    Board(Grid),
    Confetti,
    PressIn(usize),
    PressOut(usize),
}

/// The demo's fonts (None where the system face can't be read: the web).
struct Fonts {
    title: Font,
    subtitle: Font,
    new_game: Font,
    start: Font,
    cell: Font,
    given: Font,
    key: Font,
}

impl Fonts {
    fn new() -> Option<Fonts> {
        Some(Fonts {
            title: skia::match_ui_font(40.0, 700.0)?,
            subtitle: skia::match_ui_font(15.0, 400.0)?,
            new_game: skia::match_ui_font(14.0, 500.0)?,
            start: skia::match_ui_font(16.0, 500.0)?,
            cell: skia::match_ui_font(20.0, 600.0)?,
            given: skia::match_ui_font(20.0, 500.0)?,
            key: skia::match_ui_font(18.0, 500.0)?,
        })
    }

    fn sizes(&self) -> Sizes {
        let lh = |f: &Font| gfx::line_height(f);
        Sizes {
            title: (
                self.title.advance_width_spaced("SUDOKU", TITLE_SPACING),
                lh(&self.title),
            ),
            subtitle: (
                self.subtitle
                    .advance_width_spaced("Challenge your mind", SUBTITLE_SPACING),
                lh(&self.subtitle),
            ),
            new_game: (
                self.new_game
                    .advance_width_spaced("New Game", BUTTON_SPACING),
                lh(&self.new_game),
            ),
            start: (
                self.start
                    .advance_width_spaced("Start Game", BUTTON_SPACING),
                lh(&self.start),
            ),
        }
    }
}

/// SF's hhea line height at `size` ((1950 + 494) / 2048), where no font can be read.
fn sf_line(size: f32) -> f32 {
    (1950.0 + 494.0) / 2048.0 * size
}

/// The offscreen layers: the cells (board space) and the wrapper / Start / confetti texture
/// (window space bands).
struct Layers {
    pixels: (u32, u32),
    cells: Images,
    cells_view: wgpu::TextureView,
    cells_px: u32,
    layer: Images,
    layer_view: wgpu::TextureView,
    layer_px: (u32, u32),
    /// Band heights (pixels): the wrapper's, the Start button's; where the confetti texture is.
    wrapper_band: u32,
    start_band: u32,
    confetti_y: u32,
}

struct Sudoku {
    seed: Option<f64>,
    rng: Random,
    ui_rng: Random,
    tokens: Option<(f64, f64)>,
    sudoku: Option<(Grid, Grid)>,
    /// JS: hasStarted, the board's SudokuGame, its generation (each mount).
    started: bool,
    game: Option<Game>,
    gen: u32,
    events: Vec<(f64, Event)>,
    timers: Vec<Timer>,
    /// The last frame's time (JS work from `bind` is stamped with it).
    last_now: f64,
    first: Option<f64>,
    header_fade: Timing,
    header_frame: AnimFrame,
    card_frame: AnimFrame,
    actions: Option<Actions>,
    actions_ghost: Option<Actions>,
    start: Option<StartView>,
    start_ghost: Option<StartView>,
    board: Option<BoardView>,
    board_ghost: Option<BoardView>,
    confetti: Option<Confetti>,
    /// The PressableScales (the shared pressto machine), by `Which`.
    presses: [Pressable; 3],
    responder: Option<Responder>,
    layout: Option<Layout>,
    size: (f32, f32, f32),
    fonts: Option<Fonts>,
    icon: Option<Font>,
    posted: Vec<String>,
    sprites: Vec<Rect>,
    xforms: Vec<RsXform>,
    canvases: [Canvas; 3],
    renderers: [Renderer; 3],
    layers: Option<Layers>,
}

impl Sudoku {
    fn new() -> Sudoku {
        Sudoku {
            seed: None,
            rng: Random::new(0.0),
            ui_rng: Random::new(1.0),
            tokens: None,
            sudoku: None,
            started: false,
            game: None,
            gen: 0,
            events: Vec::new(),
            timers: Vec::new(),
            last_now: 0.0,
            first: None,
            header_fade: timed(0.0, 1.0, 1000.0),
            header_frame: AnimFrame::default(),
            card_frame: AnimFrame::default(),
            actions: None,
            actions_ghost: None,
            start: None,
            start_ghost: None,
            board: None,
            board_ghost: None,
            confetti: None,
            presses: std::array::from_fn(|_| Pressable::new()),
            responder: None,
            layout: None,
            size: (0.0, 0.0, 0.0),
            fonts: Fonts::new(),
            icon: Font::new(IONICONS, 22.0),
            posted: Vec::new(),
            sprites: Vec::with_capacity(FLAKES),
            xforms: Vec::with_capacity(FLAKES),
            canvases: Default::default(),
            renderers: Default::default(),
            layers: None,
        }
    }

    fn sizes(&self) -> Sizes {
        match self.fonts.as_ref() {
            Some(f) => f.sizes(),
            None => Sizes {
                title: (180.0, sf_line(40.0)),
                subtitle: (140.0, sf_line(15.0)),
                new_game: (65.0, sf_line(14.0)),
                start: (80.0, sf_line(16.0)),
            },
        }
    }

    fn content(&self) -> Content {
        Content {
            started: self.board.is_some(),
            actions: self.actions.is_some(),
            numpad: self.board.as_ref().is_some_and(|b| b.numpad),
        }
    }

    fn layout_for(&self, content: Content) -> Layout {
        let (w, h, s) = self.size;
        Layout::new(w, h, s, self.sizes(), content)
    }

    fn schedule(&mut self, due: f64, kind: TimerKind) {
        self.timers.push(Timer { due, kind });
    }

    /// handleSudokuComplete: confetti restart (runOnUI) and playCelebrationHaptics.
    fn on_complete(&mut self, at: f64) {
        self.events.push((at, Event::Confetti));
        self.posted.push(CELEBRATION[0].0.into());
        self.schedule(at + CELEBRATION[0].1, TimerKind::Haptic(1));
    }

    /// A PressableScale's onPress (JS), after the app's selection haptic: its handler.
    fn pressed(&mut self, which: Which, at: f64) {
        match which {
            Which::Title => {
                // onGeniusLongPress: if started, solve (setBoard, onComplete), then 100 ms,
                // then 2000 ms, then the alert.
                if !self.started {
                    return;
                }
                if let Some(game) = self.game.as_mut() {
                    if game.solve() {
                        let board = game.board;
                        self.events.push((at, Event::Board(board)));
                        self.on_complete(at);
                        self.schedule(at + SOLVED_MS, TimerKind::Solved);
                    }
                }
            }
            Which::NewGame => self.posted.push("alert:new-game".into()),
            Which::Start => {
                // setHasStarted(true): SudokuBoard mounts (its game from the puzzle) and its
                // effect sets the reveal and the pad's timeouts.
                if self.started {
                    return;
                }
                self.started = true;
                let (puzzle, solution) = self.sudoku.unwrap_or_default();
                self.game = Some(Game::new(puzzle, solution));
                self.gen += 1;
                let gen = self.gen;
                self.events.push((at, Event::Started(gen)));
                self.schedule(at + REVEAL_MS, TimerKind::Reveal(gen));
                self.schedule(at + NUMPAD_MS, TimerKind::Numpad(gen));
            }
        }
    }

    /// setHasStarted(false) (JS): the board unmounts, its timeouts cleared.
    fn stop(&mut self, at: f64) {
        if !self.started {
            return;
        }
        self.started = false;
        self.game = None;
        let gen = self.gen;
        self.timers
            .retain(|t| !matches!(t.kind, TimerKind::Reveal(g) | TimerKind::Numpad(g) if g == gen));
        self.events.push((at, Event::Stopped));
    }

    /// A Pressable's onPress (JS).
    fn press_target(&mut self, target: Target, at: f64) {
        let Some(game) = self.game.as_mut() else {
            return;
        };
        match target {
            Target::Cell(i) => {
                game.select_cell(i / 9, i % 9);
                let (sel, hl) = (game.selected, game.highlighted);
                self.events.push((at, Event::Ui(sel, hl)));
            }
            Target::Key(k) if k < 9 => {
                if game.set_number(k as u8 + 1) {
                    let board = game.board;
                    let complete = game.is_complete();
                    self.events.push((at, Event::Board(board)));
                    if complete {
                        self.on_complete(at);
                    }
                }
            }
            Target::Key(_) => {
                if game.clear_cell() {
                    let board = game.board;
                    self.events.push((at, Event::Board(board)));
                }
            }
        }
    }

    /// Pressability's _deactivate: onPressOut after the 130 ms minimum press.
    fn press_out(&mut self, k: usize, activated: f64, at: f64) {
        let delay = MIN_PRESS_MS - (at - activated);
        if delay > 0.0 {
            self.schedule(at + delay, TimerKind::PressOut(self.gen, k));
        } else {
            self.events.push((at, Event::PressOut(k)));
        }
    }

    /// The timeouts due at this frame (JS at `now`).
    fn fire_timers(&mut self, now: f64) {
        let mut i = 0;
        while i < self.timers.len() {
            if self.timers[i].due > now {
                i += 1;
                continue;
            }
            let t = self.timers.remove(i);
            match t.kind {
                TimerKind::Reveal(gen) => {
                    if let Some(b) = self.board.as_mut().filter(|b| b.gen == gen) {
                        // setRevealStart(performance.now()); setMountedRows(1): row 0 renders now.
                        b.reveal = Some(now);
                        b.rows_rendered = 1;
                        self.events.push((now, Event::Row(0, now)));
                    }
                }
                TimerKind::Numpad(gen) => {
                    if self.board.as_ref().is_some_and(|b| b.gen == gen) {
                        self.events.push((now, Event::Numpad));
                    }
                }
                TimerKind::Haptic(step) => {
                    self.posted.push(CELEBRATION[step].0.into());
                    if step + 1 < CELEBRATION.len() {
                        self.schedule(now + CELEBRATION[step].1, TimerKind::Haptic(step + 1));
                    }
                }
                TimerKind::Solved => self.schedule(now + GENIUS_MS, TimerKind::Genius),
                TimerKind::Genius => self.posted.push("alert:genius".into()),
                TimerKind::PressOut(gen, k) => {
                    if gen == self.gen {
                        self.events.push((now, Event::PressOut(k)));
                    }
                }
            }
        }
    }

    /// The JS work done before this frame reaches the screen.
    fn apply_events(&mut self, now: f64) {
        let mut i = 0;
        while i < self.events.len() {
            if self.events[i].0 >= now {
                i += 1;
                continue;
            }
            let (_, event) = self.events.remove(i);
            match event {
                Event::Started(gen) => self.mount_board(gen, now),
                Event::Stopped => self.unmount_board(),
                Event::Row(r, rendered) => {
                    if let Some(b) = self.board.as_mut() {
                        let elapsed = rendered - b.reveal.unwrap_or(rendered);
                        for c in 0..9 {
                            let a = &mut b.anims[r * 9 + c];
                            a.mounted = Some(now);
                            a.delay = (((r + c) as f64) * STAGGER_MS - elapsed).max(0.0);
                        }
                        // The style's first run: its animations at their targets.
                        for c in 0..9 {
                            let i = r * 9 + c;
                            let h = b.cell_highlighted(i);
                            let a = &mut b.anims[i];
                            a.highlighted = h;
                            let v = if h { 1.0 } else { 0.0 };
                            a.scale.set(v);
                            a.opacity.set(v);
                            a.alpha.set(if h { 0.35 } else { 0.0 });
                        }
                    }
                }
                Event::Numpad => {
                    if let Some(b) = self.board.as_mut() {
                        b.numpad = true;
                    }
                }
                Event::Ui(sel, hl) => {
                    if let Some(b) = self.board.as_mut() {
                        b.selected = sel;
                        b.highlight = hl;
                        b.update_highlights();
                    }
                }
                Event::Board(grid) => {
                    if let Some(b) = self.board.as_mut() {
                        b.shown = grid;
                        b.update_highlights();
                    }
                }
                Event::Confetti => {
                    // restart(): refreshBoxes (Math.random on the UI runtime), reset, then both
                    // timings.
                    let mut c = self.confetti.take().unwrap_or(Confetti {
                        flakes: Vec::with_capacity(FLAKES),
                        blast: Timing::at(0.0),
                        fall: Timing::at(0.0),
                    });
                    flakes(&mut self.ui_rng, &mut c.flakes);
                    c.blast = timed(0.0, 1.0, BLAST_MS);
                    c.fall = timed(0.0, 1.0, FALL_MS);
                    self.confetti = Some(c);
                }
                Event::PressIn(k) | Event::PressOut(k) => {
                    let to = if matches!(event, Event::PressIn(_)) {
                        0.95
                    } else {
                        1.0
                    };
                    if let Some(b) = self.board.as_mut() {
                        let s = &mut b.keys_anim[k].scale;
                        let v = if s.running { s.velocity } else { 0.0 };
                        s.to(to, v, KEY_SPRING);
                    }
                }
            }
        }
        // requestAnimationFrame: one more row each frame until all nine have rendered.
        if let Some(b) = self.board.as_mut() {
            if b.reveal.is_some()
                && b.rows_rendered > 0
                && b.rows_rendered < 9
                && !self.events.iter().any(|e| matches!(e.1, Event::Row(..)))
            {
                let r = b.rows_rendered;
                b.rows_rendered += 1;
                self.events.push((now, Event::Row(r, now)));
            }
        }
    }

    fn mount_board(&mut self, gen: u32, now: f64) {
        let Some(game) = self.game.clone() else {
            return;
        };
        let (w, h, s) = self.size;
        let target = Layout::new(
            w,
            h,
            s,
            self.sizes(),
            Content {
                started: true,
                actions: true,
                numpad: false,
            },
        );
        // The Start button leaves (FadeOut 200 from 1), headerActions enter (FadeIn 400 twice).
        if let Some(mut st) = self.start.take() {
            st.leaving = true;
            st.press = timed(1.0, 0.0, 200.0);
            self.start_ghost = Some(st);
        }
        let header = target.header;
        self.actions = Some(Actions {
            group: timed(0.0, 1.0, 400.0),
            press: timed(0.0, 1.0, 400.0),
            leaving: false,
            rel: target.actions.rel(header),
            text_rel: target.new_game_text.rel(target.actions),
        });
        // A board still leaving gives way.
        self.board_ghost = None;
        let wrapper = target.wrapper;
        let board = target.board.rel(wrapper);
        let mut cells = [R::default(); 81];
        let mut bgs = [R::default(); 81];
        for i in 0..81 {
            cells[i] = target.cells[i].rel(target.board);
            bgs[i] = target.bgs[i].rel(target.board);
        }
        let numpad_target = Layout::new(
            w,
            h,
            s,
            self.sizes(),
            Content {
                started: true,
                actions: true,
                numpad: true,
            },
        );
        let mut keys = [R::default(); 10];
        for (k, key) in keys.iter_mut().enumerate() {
            *key = numpad_target.keys[k].rel(numpad_target.wrapper);
        }
        self.board = Some(BoardView {
            gen,
            wrapper: timed(0.0, 1.0, 800.0),
            enter: timed(0.0, 1.0, 200.0),
            leaving: false,
            rel: wrapper.rel(target.card),
            board,
            cells,
            bgs,
            borders: target.borders,
            keys,
            cell_size: target.board_size / 9.0,
            shown: game.board,
            givens: game.initial,
            selected: (-1, -1),
            highlight: 0,
            reveal: None,
            rows_rendered: 0,
            anims: vec![CellAnim::default(); 81],
            numpad: false,
            keys_anim: vec![
                KeyAnim {
                    scale: Spring::at(1.0)
                };
                10
            ],
        });
        let _ = now;
    }

    fn unmount_board(&mut self) {
        let (w, h, s) = self.size;
        let target = Layout::new(w, h, s, self.sizes(), Content::default());
        if let Some(mut b) = self.board.take() {
            b.leaving = true;
            b.wrapper = timed(1.0, 0.0, 200.0);
            self.board_ghost = Some(b);
        }
        if let Some(mut a) = self.actions.take() {
            a.leaving = true;
            a.press = timed(1.0, 0.0, 200.0);
            self.actions_ghost = Some(a);
        }
        self.start_ghost = None;
        self.start = Some(StartView {
            press: timed(0.0, 1.0, 400.0),
            leaving: false,
            rel: target.start.rel(target.card),
            text_rel: target.start_text.rel(target.start),
        });
        self.responder = None;
    }

    /// Steps every animation to `now`; whether anything moves.
    fn step(&mut self, now: f64) -> bool {
        let mut moving = self.header_fade.step(now);
        for p in self.presses.iter_mut() {
            moving |= p.step(now);
        }
        moving |= self.header_frame.step(now);
        moving |= self.card_frame.step(now);
        for a in [&mut self.actions, &mut self.actions_ghost]
            .into_iter()
            .flatten()
        {
            moving |= a.group.step(now);
            moving |= a.press.step(now);
        }
        for st in [&mut self.start, &mut self.start_ghost]
            .into_iter()
            .flatten()
        {
            moving |= st.press.step(now);
        }
        if let Some(b) = self.board.as_mut() {
            moving |= b.wrapper.step(now);
            moving |= b.enter.step(now);
            for a in b.anims.iter_mut() {
                let Some(mounted) = a.mounted else { continue };
                if a.fade.is_none() && now - mounted >= a.delay {
                    // withDelay hands over to the timing at the first frame past the delay.
                    a.fade = Some(timed(0.0, 1.0, CELL_FADE_MS));
                }
                match a.fade.as_mut() {
                    Some(f) => moving |= f.step(now),
                    None => moving = true,
                }
                moving |= a.scale.step(now);
                moving |= a.opacity.step(now);
                moving |= a.alpha.step(now);
            }
            for k in b.keys_anim.iter_mut() {
                moving |= k.scale.step(now);
            }
            moving |= b.reveal.is_some() && b.rows_rendered < 9;
        }
        if let Some(b) = self.board_ghost.as_mut() {
            moving |= b.wrapper.step(now);
            if !b.wrapper.running {
                self.board_ghost = None;
            }
        }
        if self
            .actions_ghost
            .as_ref()
            .is_some_and(|a| !a.press.running)
        {
            self.actions_ghost = None;
        }
        if self.start_ghost.as_ref().is_some_and(|s| !s.press.running) {
            self.start_ghost = None;
        }
        if let Some(c) = self.confetti.as_mut() {
            moving |= c.blast.step(now);
            moving |= c.fall.step(now);
            if !c.fall.running && c.fall.value >= 1.0 {
                // fadeOutOnEnd: opacity 0 from here on.
                self.confetti = None;
            }
        }
        moving | !self.timers.is_empty() | !self.events.is_empty()
    }

    /// The header's and the card's animated frames.
    fn frames(&self) -> (R, R) {
        (self.header_frame.now(), self.card_frame.now())
    }

    /// The layout's targets for what is mounted; a change starts their LinearTransitions.
    fn relayout(&mut self) {
        let content = self.content();
        let layout = self.layout_for(content);
        if self.layout.is_none() {
            self.header_frame.set(layout.header);
            self.card_frame.set(layout.card);
        } else {
            self.header_frame.go(layout.header);
            self.card_frame.go(layout.card);
        }
        if self.start.as_ref().is_some_and(|s| !s.leaving) {
            let st = self.start.as_mut().unwrap();
            st.rel = layout.start.rel(layout.card);
            st.text_rel = layout.start_text.rel(layout.start);
        }
        if let Some(a) = self.actions.as_mut() {
            a.rel = layout.actions.rel(layout.header);
            a.text_rel = layout.new_game_text.rel(layout.actions);
        }
        if let Some(b) = self.board.as_mut() {
            b.rel = layout.wrapper.rel(layout.card);
        }
        self.layout = Some(layout);
    }

    /// The opacity a view under the header shows at (UIKit hit-tests nothing at ≤ 0.01).
    fn hittable(alpha: f64) -> bool {
        alpha > 0.01
    }

    fn pressable(&self, which: Which) -> &Pressable {
        &self.presses[which as usize]
    }

    /// A PressableScale's frame in the window as it shows (through its press scale), and
    /// whether UIKit's hit test reaches it.
    fn press_rect(&self, which: Which) -> Option<(R, bool)> {
        let layout = self.layout.as_ref()?;
        let (header, card) = self.frames();
        let hf = self.header_fade.value;
        let k = self.pressable(which).scale() as f32;
        match which {
            Which::Title => {
                let title = layout.title.rel(layout.header).at(header.x, header.y);
                Some((title.scaled(k), Self::hittable(hf)))
            }
            Which::NewGame => self.actions.as_ref().map(|a| {
                let r = a.rel.at(header.x, header.y);
                (r.scaled(k), Self::hittable(hf * a.group.value * a.press.value))
            }),
            Which::Start => self.start.as_ref().map(|st| {
                let r = st.rel.at(card.x, card.y);
                (r.scaled(k), Self::hittable(st.press.value))
            }),
        }
    }

    /// Whether (x, y) is in the PressableScale's bounds (pointerInside).
    fn in_press(&self, which: Which, x: f32, y: f32) -> bool {
        self.press_rect(which).is_some_and(|(r, _)| r.contains(x, y))
    }

    fn hit_press(&self, x: f32, y: f32) -> Option<Which> {
        let (_, card) = self.frames();
        [Which::Title, Which::NewGame, Which::Start].into_iter().find(|&w| {
            self.press_rect(w).is_some_and(|(r, hit)| hit && r.contains(x, y) && (w != Which::Start || card.contains(x, y)))
        })
    }

    fn hit_target(&self, x: f32, y: f32) -> Option<(Target, R)> {
        let (_, card) = self.frames();
        let b = self.board.as_ref()?;
        if !card.contains(x, y) || !Self::hittable(b.wrapper.value) {
            return None;
        }
        let wrapper = b.rel.at(card.x, card.y);
        if b.numpad {
            for (k, key) in b.keys.iter().enumerate() {
                let r = key.at(wrapper.x, wrapper.y);
                let s = b.keys_anim[k].scale.value as f32;
                let (cx, cy) = r.center();
                let scaled = R {
                    x: cx - r.w * s / 2.0,
                    y: cy - r.h * s / 2.0,
                    w: r.w * s,
                    h: r.h * s,
                };
                if scaled.contains(x, y) {
                    return Some((Target::Key(k), r));
                }
            }
        }
        let ty = 25.0 * (1.0 - b.enter.value as f32);
        let board = b.board.at(wrapper.x, wrapper.y + ty);
        if !Self::hittable(b.enter.value) || !board.contains(x, y) {
            return None;
        }
        for i in 0..81 {
            let r = b.cells[i].at(board.x, board.y);
            if b.anims[i].mounted.is_some()
                && Self::hittable(b.anims[i].fade_value() as f64)
                && r.contains(x, y)
            {
                return Some((Target::Cell(i), r));
            }
        }
        None
    }
}

/// Pressability's press rect: the measured region and the retention offsets (exclusive).
fn in_press_rect(r: R, x: f32, y: f32) -> bool {
    let (top, left, right, bottom) = RETENTION;
    x > r.x - left && x < r.x + r.w + right && y > r.y - top && y < r.y + r.h + bottom
}

// ---------------------------------------------------------------------------------------------
// Drawing.

fn view(hex: u32) -> Color {
    Color::view_hex(hex)
}

fn view_a(hex: u32, a: u8) -> Color {
    Color::view_hex(hex).alpha(a as f32 / 255.0)
}

/// A one-line Text in its box (TextKit's baseline: the box top + the ascender).
fn text(c: &mut Canvas, s: &str, r: R, font: &Font, color: Color, spacing: f32) {
    c.draw_text_spaced(
        s,
        r.x,
        gfx::baseline(font, r.y),
        font,
        &Paint::fill(color),
        spacing,
    );
}

/// A Core Animation border: the continuous rounded rect less the one inset by its width (the
/// curve's radius less it).
fn ca_border(c: &mut Canvas, r: R, radius: f32, width: f32, color: Color) {
    c.draw_with(&Paint::fill(color), |b| {
        skia::add_continuous_rrect(b, r.x, r.y, r.w, r.h, radius);
        skia::add_continuous_rrect_hole(
            b,
            r.x + width,
            r.y + width,
            r.w - 2.0 * width,
            r.h - 2.0 * width,
            (radius - width).max(0.0),
        );
    });
}

/// RCTBoxShadow's outset shadow of a view `r` with circular corners `radius`: the offset rounded
/// rect blurred by σ, masked to outside the view's rounded rect (and inside the padded one).
fn box_shadow(c: &mut Canvas, r: R, radius: f32, (dy, sigma, a): (f32, f32, u8), opacity: f32) {
    let blur = 2.0 * sigma;
    let pad = 2.0 * (blur + 1.0);
    c.save();
    c.opacity(opacity);
    c.clip_with(|b| {
        skia::add_rrect(
            b,
            r.x - pad,
            r.y + dy - pad,
            r.w + 2.0 * pad,
            r.h + 2.0 * pad,
            radius,
        );
        skia::add_rrect_hole(b, r.x, r.y, r.w, r.h, radius);
    });
    c.draw_rrect_shadow(
        r.x,
        r.y + dy,
        r.w,
        r.h,
        radius,
        sigma,
        Color::BLACK.alpha(a as f32 / 255.0),
    );
    c.restore();
}

/// expo-linear-gradient's image: [from, to] top to bottom over `h`, each pixel row's colour at
/// its centre rounded to 8 bits (sRGB, as CGGradient draws DeviceRGB into an 8-bit context).
fn draw_gradient(c: &mut Canvas, w: f32, h: f32, scale: f32, from: u32, to: u32) {
    let rows = (h * scale).round() as i32;
    let ch = |v: u32, k: u32| ((v >> k) & 0xFF) as f32;
    let at = |r: i32| -> [u8; 3] {
        let t = ((r as f32 + 0.5) / scale / h).clamp(0.0, 1.0);
        [16, 8, 0].map(|k| (ch(from, k) + (ch(to, k) - ch(from, k)) * t).round() as u8)
    };
    let mut r = 0;
    while r < rows {
        let color = at(r);
        let mut end = r + 1;
        while end < rows && at(end) == color {
            end += 1;
        }
        c.draw_rect(
            0.0,
            r as f32 / scale,
            w,
            (end - r) as f32 / scale,
            &Paint::fill(Color::rgb8(color[0], color[1], color[2])),
        );
        r = end;
    }
}

/// The area of the polygon `poly` inside the unit pixel at (px, py) (Sutherland–Hodgman).
fn coverage(poly: &[(f64, f64)], px: f64, py: f64) -> f64 {
    let mut a: Vec<(f64, f64)> = poly.to_vec();
    let edges: [(f64, f64, bool, bool); 4] = [
        (px, 0.0, true, true),
        (px + 1.0, 0.0, true, false),
        (py, 0.0, false, true),
        (py + 1.0, 0.0, false, false),
    ];
    for (v, _, is_x, lower) in edges {
        let inside = |p: &(f64, f64)| {
            let c = if is_x { p.0 } else { p.1 };
            if lower {
                c >= v
            } else {
                c <= v
            }
        };
        let mut out = Vec::with_capacity(a.len() + 2);
        for i in 0..a.len() {
            let (p, q) = (a[i], a[(i + 1) % a.len()]);
            let (ip, iq) = (inside(&p), inside(&q));
            if ip {
                out.push(p);
            }
            if ip != iq {
                let (cp, cq) = if is_x { (p.0, q.0) } else { (p.1, q.1) };
                let t = (v - cp) / (cq - cp);
                out.push((p.0 + (q.0 - p.0) * t, p.1 + (q.1 - p.1) * t));
            }
        }
        a = out;
        if a.is_empty() {
            return 0.0;
        }
    }
    let mut area = 0.0;
    for i in 0..a.len() {
        let (p, q) = (a[i], a[(i + 1) % a.len()]);
        area += p.0 * q.1 - q.0 * p.1;
    }
    (area / 2.0).abs()
}

/// One pixel-exact fill of RCTBorderDrawing's image: a colour and its coverage per pixel, as
/// rects of equal coverage (x, y, w, h in the cell's pixels).
#[derive(Clone, Debug)]
struct BorderFill {
    color: Color,
    rects: Vec<([u16; 4], f32)>,
}

/// Pixels of equal coverage merged: runs along a row, then runs repeated on the next rows.
fn merge(pixels: &[(u16, u16, f32)]) -> Vec<([u16; 4], f32)> {
    let mut runs: Vec<([u16; 4], f32)> = Vec::new();
    let mut i = 0;
    while i < pixels.len() {
        let (x0, y, k) = pixels[i];
        let mut j = i + 1;
        while j < pixels.len()
            && pixels[j].1 == y
            && pixels[j].0 == pixels[j - 1].0 + 1
            && pixels[j].2 == k
        {
            j += 1;
        }
        let w = (j - i) as u16;
        // A run that continues one directly above grows down.
        match runs
            .iter_mut()
            .find(|(r, rk)| r[0] == x0 && r[2] == w && *rk == k && r[1] + r[3] == y)
        {
            Some((r, _)) => r[3] += 1,
            None => runs.push(([x0, y, w, 1], k)),
        }
        i = j;
    }
    runs
}

/// RCTGetSolidBorderImage of a cell (no radii): the insets rounded to the pixel; one colour →
/// the ring; several → the sides' trapezoids (outer corner to inner corner), each run of a
/// colour in RIGHT, BOTTOM, LEFT, TOP order filled at once, at its exact pixel coverage.
fn cell_border(w: f32, h: f32, widths: [f32; 4], scale: f32) -> Vec<BorderFill> {
    let s = scale as f64;
    let round = |v: f32| ((v as f64 * s).round()) / s;
    let [t, l, r, b] = widths.map(round);
    let (w, h) = (w as f64, h as f64);
    let color = |wd: f32| {
        if wd > 1.0 {
            view_a(PRIMARY, THIRD_A)
        } else {
            view_a(BORDER, BORDER_A)
        }
    };
    let colors = [
        color(widths[2]),
        color(widths[3]),
        color(widths[1]),
        color(widths[0]),
    ];
    let (tl, tr, bl, br) = ((l, t), (w - r, t), (l, h - b), (w - r, h - b));
    let sides: [Vec<(f64, f64)>; 4] = [
        vec![(w, 0.0), tr, br, (w, h)],
        vec![(0.0, h), bl, br, (w, h)],
        vec![(0.0, 0.0), tl, bl, (0.0, h)],
        vec![(0.0, 0.0), tl, tr, (w, 0.0)],
    ];
    let (pw, ph) = ((w * s).round() as i32, (h * s).round() as i32);
    let inner = |x: i32, y: i32| {
        let (x0, y0, x1, y1) = (
            x as f64 / s,
            y as f64 / s,
            (x + 1) as f64 / s,
            (y + 1) as f64 / s,
        );
        x0 >= l - 1e-9 && x1 <= w - r + 1e-9 && y0 >= t - 1e-9 && y1 <= h - b + 1e-9
    };
    let mut fills: Vec<BorderFill> = Vec::new();
    let mut groups: Vec<(Color, Vec<usize>)> = Vec::new();
    for (i, c) in colors.iter().enumerate() {
        match groups.last_mut() {
            Some((gc, members)) if *gc == *c => members.push(i),
            _ => groups.push((*c, vec![i])),
        }
    }
    for (c, members) in groups {
        let mut pixels = Vec::new();
        for y in 0..ph {
            for x in 0..pw {
                if inner(x, y) {
                    continue;
                }
                let mut k = 0.0;
                for &m in &members {
                    let poly: Vec<(f64, f64)> =
                        sides[m].iter().map(|p| (p.0 * s, p.1 * s)).collect();
                    k += coverage(&poly, x as f64, y as f64);
                }
                let k = k.min(1.0) as f32;
                if k > 1e-6 {
                    pixels.push((x as u16, y as u16, k));
                }
            }
        }
        fills.push(BorderFill {
            color: c,
            rects: merge(&pixels),
        });
    }
    fills
}

/// The cells' border fills, by their (w, h, widths) (a handful of distinct kinds).
struct BorderCache {
    kinds: Vec<((u32, u32, [u32; 4]), Vec<BorderFill>)>,
}

impl BorderCache {
    fn get(&mut self, w: f32, h: f32, widths: [f32; 4], scale: f32) -> &[BorderFill] {
        let key = (
            (w * 64.0) as u32,
            (h * 64.0) as u32,
            widths.map(|v| (v * 64.0) as u32),
        );
        if let Some(i) = self.kinds.iter().position(|k| k.0 == key) {
            return &self.kinds[i].1;
        }
        self.kinds.push((key, cell_border(w, h, widths, scale)));
        &self.kinds.last().unwrap().1
    }
}

thread_local! {
    static BORDERS: std::cell::RefCell<(f32, BorderCache)> = std::cell::RefCell::new((0.0, BorderCache { kinds: Vec::new() }));
}

/// Draws a cell's border image at (x, y) (board points, on the pixel grid).
fn draw_cell_border(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32, widths: [f32; 4], scale: f32) {
    BORDERS.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.0 != scale {
            *cache = (scale, BorderCache { kinds: Vec::new() });
        }
        for fill in cache.1.get(w, h, widths, scale) {
            for &([px0, py0, pw, ph], k) in &fill.rects {
                let col = fill.color.alpha(fill.color.0[3] * k);
                c.draw_rect(
                    x + px0 as f32 / scale,
                    y + py0 as f32 / scale,
                    pw as f32 / scale,
                    ph as f32 / scale,
                    &Paint::fill(col),
                );
            }
        }
    });
}

impl Sudoku {
    /// The cells, each at full opacity, into the cells layer (board space).
    fn record_cells(&mut self, scale: f32) {
        let c = &mut self.canvases[0];
        c.begin(scale);
        let (Some(b), Some(f)) = (
            self.board.as_ref().or(self.board_ghost.as_ref()),
            self.fonts.as_ref(),
        ) else {
            return;
        };
        for i in 0..81 {
            let a = &b.anims[i];
            if a.mounted.is_none() {
                continue;
            }
            let cell = b.cells[i];
            let (r, col) = (i / 9, i % 9);
            let selected = b.selected == (r as i8, col as i8) && b.highlight == 0;
            // The background layer (instant).
            let bg = if selected {
                view_a(PRIMARY, HIGHLIGHT_A)
            } else {
                view(SURFACE)
            };
            c.draw_rect(cell.x, cell.y, cell.w, cell.h, &Paint::fill(bg));
            draw_cell_border(c, cell.x, cell.y, cell.w, cell.h, b.borders[i], scale);
            // The circle: scale about its centre, its colour's alpha byte, its layer opacity.
            let alpha =
                alpha_byte(a.alpha.value) as f32 / 255.0 * a.opacity.value.clamp(0.0, 1.0) as f32;
            let k = a.scale.value as f32;
            if alpha > 0.0 && k > 0.0 {
                let bgr = b.bgs[i];
                let (cx, cy) = bgr.center();
                c.save();
                c.translate(cx, cy);
                c.scale(k, k);
                c.draw_continuous_rrect(
                    -bgr.w / 2.0,
                    -bgr.h / 2.0,
                    bgr.w,
                    bgr.h,
                    100.0,
                    &Paint::fill(view(PRIMARY).alpha(alpha)),
                );
                c.restore();
            }
            let value = b.shown[r][col];
            if value != 0 {
                let given = b.givens[r][col] != 0;
                let font = if given { &f.given } else { &f.cell };
                let digit = DIGITS[value as usize - 1];
                let tw = text_round(font.advance_width(digit), scale);
                let th = text_round(gfx::line_height(font), scale);
                // Centred in the cell's content box (inside its unrounded borders).
                let [_, left, right, bottom] = b.borders[i];
                let unit = b.cell_size;
                let s = scale as f64;
                let tx = cell.x
                    + round_px(
                        (left + (unit - left - right - tw) / 2.0) as f64,
                        s,
                        false,
                        true,
                    ) as f32;
                let ty = cell.y
                    + round_px(
                        (0.5 + (unit - 0.5 - bottom - th) / 2.0) as f64,
                        s,
                        false,
                        true,
                    ) as f32;
                text(
                    c,
                    digit,
                    R {
                        x: tx,
                        y: ty,
                        w: tw,
                        h: th,
                    },
                    font,
                    view(if given { INITIAL } else { USER_INPUT }),
                    0.0,
                );
            }
        }
    }
}

const DIGITS: [&str; 9] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

impl Sudoku {
    /// The wrapper (board + pad), the Start PressableScale and the confetti texture into the
    /// layer.
    fn record_layer(&mut self, scale: f32, card: R, cells_image: ImageRef) {
        let Some(l) = self.layers.as_ref() else {
            return;
        };
        let (wrapper_band, start_band, confetti_y) = (l.wrapper_band, l.start_band, l.confetti_y);
        let c = &mut self.canvases[1];
        c.begin(scale);
        let s = scale;
        // Band 0: the wrapper in window space, shifted up to the band by whole pixels.
        if let Some(b) = self.board.as_ref().or(self.board_ghost.as_ref()) {
            let wrapper = b.rel.at(card.x, card.y);
            let y0 = band_origin(wrapper.y, s);
            c.save();
            c.translate(0.0, -y0 as f32 / s);
            let ty = 25.0 * (1.0 - b.enter.value as f32);
            let board = b.board.at(wrapper.x, wrapper.y + ty);
            let board_alpha = b.enter.value.clamp(0.0, 1.0) as f32;
            c.save();
            c.clip_continuous_rrect(board.x, board.y, board.w, board.h, BOARD_R);
            let to_cells = Matrix::translate(-board.x, -board.y).then(Matrix::scale(s, s));
            for i in 0..81 {
                let a = &b.anims[i];
                let alpha = a.fade_value() * board_alpha;
                if a.mounted.is_none() || alpha <= 0.0 {
                    continue;
                }
                let r = b.cells[i].at(board.x, board.y);
                c.draw_rect(
                    r.x,
                    r.y,
                    r.w,
                    r.h,
                    &Paint::image(cells_image, to_cells).with_opacity(alpha),
                );
            }
            c.restore();
            ca_border(c, board, BOARD_R, 2.0, view(PRIMARY).alpha(board_alpha));
            if b.numpad {
                for k in 0..10 {
                    let r = b.keys[k].at(wrapper.x, wrapper.y);
                    let hl = k < 9 && (k as u8 + 1) == b.highlight;
                    let sc = b.keys_anim[k].scale.value as f32;
                    let (cx, cy) = r.center();
                    c.save();
                    c.translate(cx, cy);
                    c.scale(sc, sc);
                    c.translate(-cx, -cy);
                    if hl {
                        c.draw_continuous_rrect(
                            r.x,
                            r.y,
                            r.w,
                            r.h,
                            KEY_R,
                            &Paint::fill(view_a(PRIMARY, HIGHLIGHT_STRONG_A)),
                        );
                    }
                    let border = if hl {
                        view(PRIMARY)
                    } else {
                        view_a(BORDER, BORDER_A)
                    };
                    c.draw_path(
                        &skia::border_ring_path(r.x, r.y, r.w, r.h, KEY_R, 1.0),
                        &Paint::fill(border),
                    );
                    if k < 9 {
                        if let Some(f) = self.fonts.as_ref() {
                            let tw = text_round(f.key.advance_width(DIGITS[k]), s);
                            let th = text_round(gfx::line_height(&f.key), s);
                            let tr = R {
                                x: r.x
                                    + round_px(
                                        (1.0 + (44.0 - tw) / 2.0) as f64,
                                        s as f64,
                                        false,
                                        true,
                                    ) as f32,
                                y: r.y
                                    + round_px(
                                        (1.0 + (44.0 - th) / 2.0) as f64,
                                        s as f64,
                                        false,
                                        true,
                                    ) as f32,
                                w: tw,
                                h: th,
                            };
                            text(
                                c,
                                DIGITS[k],
                                tr,
                                &f.key,
                                view(if hl { PRIMARY_LIGHT } else { USER_INPUT }),
                                0.0,
                            );
                        }
                    } else if let Some(icon) = self.icon.as_ref() {
                        let tw = text_round(icon.advance_width(BACKSPACE), s);
                        let th = text_round(gfx::line_height(icon), s);
                        let x = r.x
                            + round_px((1.0 + (44.0 - tw) / 2.0) as f64, s as f64, false, true)
                                as f32;
                        let y = r.y
                            + round_px((1.0 + (44.0 - th) / 2.0) as f64, s as f64, false, true)
                                as f32;
                        let m = icon.metrics();
                        c.draw_text(
                            BACKSPACE,
                            x,
                            y + m.leading / 2.0 - m.ascent,
                            icon,
                            &Paint::fill(view(TEXT_SECONDARY)),
                        );
                    }
                    c.restore();
                }
            }
            c.restore();
        }
        // Band 1: the Start PressableScale (live or leaving), shifted the same way.
        if let Some(st) = self.start.as_ref().or(self.start_ghost.as_ref()) {
            let r = st.rel.at(card.x, card.y);
            let y0 = band_origin(r.y, s);
            c.save();
            c.translate(0.0, (wrapper_band as f32 - y0 as f32) / s);
            c.draw_continuous_rrect(r.x, r.y, r.w, r.h, BUTTON_R, &Paint::fill(view(PRIMARY)));
            if let Some(f) = self.fonts.as_ref() {
                let tr = st.text_rel.at(r.x, r.y);
                text(c, "Start Game", tr, &f.start, view(TEXT), BUTTON_SPACING);
            }
            c.restore();
        }
        // Band 2: useTexture's image, one pixel per texel, its edge texels repeated around it.
        c.save();
        c.scale(1.0 / s, 1.0 / s);
        let y = (wrapper_band + start_band) as f32;
        let _ = confetti_y;
        let width = (SIZES as f32) * FLAKE;
        for (row, &(hex, a)) in CONFETTI.iter().enumerate() {
            let color = Color::hex(hex).alpha(a as f32 / 255.0);
            let top = y + 1.0 + row as f32 * FLAKE;
            let (t, hgt) = match row {
                0 => (top - 1.0, FLAKE + 1.0),
                5 => (top, FLAKE + 1.0),
                _ => (top, FLAKE),
            };
            c.draw_rect(0.0, t, width + 2.0, hgt, &Paint::fill(color));
        }
        c.restore();
    }
}

/// A PressableScale's transform: scale `k` about the centre of `r`.
fn scale_about(c: &mut Canvas, r: R, k: f32) {
    if k != 1.0 {
        let (cx, cy) = r.center();
        c.translate(cx, cy);
        c.scale(k, k);
        c.translate(-cx, -cy);
    }
}

/// The first whole pixel of a band holding something whose top is at `y` (window points).
fn band_origin(y: f32, scale: f32) -> i32 {
    (y * scale).floor() as i32 - 2
}

impl Sudoku {
    fn record_main(&mut self, scale: f32, header: R, card: R, layer: ImageRef) {
        let (w, h, _) = self.size;
        let Some(l) = self.layers.as_ref() else {
            return;
        };
        let (wrapper_band, confetti_y) = (l.wrapper_band, l.confetti_y);
        let s = scale;
        let c = &mut self.canvases[2];
        c.begin(s);
        draw_gradient(c, w, h, s, BACKGROUND, SURFACE);
        // The header.
        let hf = self.header_fade.value.clamp(0.0, 1.0) as f32;
        if let (Some(layout), Some(f)) = (self.layout.as_ref(), self.fonts.as_ref()) {
            if hf > 0.0 {
                let title = layout.title.rel(layout.header).at(header.x, header.y);
                // The title's PressableScale, about its centre.
                c.save();
                scale_about(c, title, self.presses[Which::Title as usize].scale() as f32);
                text(
                    c,
                    "SUDOKU",
                    title,
                    &f.title,
                    view(TEXT).alpha(hf),
                    TITLE_SPACING,
                );
                c.restore();
                let subtitle = layout.subtitle.rel(layout.header).at(header.x, header.y);
                text(
                    c,
                    "Challenge your mind",
                    subtitle,
                    &f.subtitle,
                    view(TEXT_TERTIARY).alpha(hf),
                    SUBTITLE_SPACING,
                );
            }
            for a in [self.actions.as_ref(), self.actions_ghost.as_ref()]
                .into_iter()
                .flatten()
            {
                let group = hf * a.group.value.clamp(0.0, 1.0) as f32;
                let r = a.rel.at(header.x, header.y);
                if group <= 0.0 {
                    continue;
                }
                box_shadow(c, r, BUTTON_R, BUTTON_SHADOW, group);
                let alpha = group * a.press.value.clamp(0.0, 1.0) as f32;
                if alpha > 0.0 {
                    // The PressableScale (its border and label), about its centre; the
                    // container's shadow stays.
                    c.save();
                    scale_about(c, r, self.presses[Which::NewGame as usize].scale() as f32);
                    ca_border(
                        c,
                        r,
                        BUTTON_R,
                        1.0,
                        view_a(BORDER, BORDER_A).alpha(BORDER_A as f32 / 255.0 * alpha),
                    );
                    text(
                        c,
                        "New Game",
                        a.text_rel.at(r.x, r.y),
                        &f.new_game,
                        view(TEXT_SECONDARY).alpha(alpha),
                        BUTTON_SPACING,
                    );
                    c.restore();
                }
            }
        }
        // The card.
        box_shadow(c, card, CARD_R, CARD_SHADOW, 1.0);
        c.draw_continuous_rrect(
            card.x,
            card.y,
            card.w,
            card.h,
            CARD_R,
            &Paint::fill(view(SURFACE)),
        );
        c.save();
        c.clip_rrect(card.x, card.y, card.w, card.h, CARD_R);
        for st in [self.start.as_ref(), self.start_ghost.as_ref()]
            .into_iter()
            .flatten()
        {
            let r = st.rel.at(card.x, card.y);
            box_shadow(c, r, BUTTON_R, BUTTON_SHADOW, 1.0);
            c.draw_continuous_rrect(
                r.x,
                r.y,
                r.w,
                r.h,
                BUTTON_R,
                &Paint::fill(view_a(PRIMARY, PRIMARY_CONTAINER_A)),
            );
            let alpha = st.press.value.clamp(0.0, 1.0) as f32;
            if alpha > 0.0 {
                let y0 = band_origin(r.y, s);
                let to_band = Matrix::scale(s, s)
                    .then(Matrix::translate(0.0, wrapper_band as f32 - y0 as f32));
                c.save();
                // The PressableScale (its fill and label, from the band), about its centre;
                // the container's shadow and tint stay.
                scale_about(c, r, self.presses[Which::Start as usize].scale() as f32);
                c.clip_rrect(r.x, r.y, r.w, r.h, BUTTON_R);
                c.draw_rect(
                    r.x - 1.0,
                    r.y - 1.0,
                    r.w + 2.0,
                    r.h + 2.0,
                    &Paint::image(layer, to_band).with_opacity(alpha),
                );
                c.restore();
            }
        }
        if let Some(b) = self.board.as_ref().or(self.board_ghost.as_ref()) {
            let alpha = b.wrapper.value.clamp(0.0, 1.0) as f32;
            if alpha > 0.0 {
                let wrapper = b.rel.at(card.x, card.y);
                let y0 = band_origin(wrapper.y, s);
                let to_band = Matrix::scale(s, s).then(Matrix::translate(0.0, -y0 as f32));
                let bottom = (y0 as f32 + wrapper_band as f32) / s;
                c.draw_rect(
                    card.x,
                    y0 as f32 / s,
                    card.w,
                    bottom - y0 as f32 / s,
                    &Paint::image(layer, to_band).with_opacity(alpha),
                );
            }
        }
        c.restore();
        ca_border(c, card, CARD_R, 1.0, view_a(BORDER, BORDER_A));
        // PIConfetti over everything (pointerEvents none).
        if let Some(conf) = self.confetti.as_ref() {
            let opacity = interpolate_clamp(conf.fall.value, &[0.0, 1.0], &[1.0, 0.0]) as f32;
            if opacity > 0.0 {
                self.sprites.clear();
                self.xforms.clear();
                for (i, fl) in conf.flakes.iter().enumerate() {
                    self.sprites.push(Rect::new(
                        1.0 + fl.size as f32 * FLAKE,
                        confetti_y as f32 + 1.0 + fl.color as f32 * FLAKE,
                        FLAKE,
                        FLAKE,
                    ));
                    self.xforms.push(flake(
                        i,
                        fl,
                        conf.blast.value,
                        conf.fall.value,
                        w as f64,
                        h as f64,
                    ));
                }
                c.save();
                c.opacity(opacity);
                c.draw_atlas(layer, &self.sprites, &self.xforms, None, false);
                c.restore();
            }
        }
    }
}

impl Surface for Sudoku {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let number = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        let (seed, reset, ok) = (number(0), number(1), number(2));
        if self.seed.is_none() {
            self.seed = Some(seed);
            self.rng = Random::new(seed);
            self.ui_rng = Random::new(seed + 7919.0);
            // getInitialSudoku(): generated at the first mount of the session, then kept.
            let mut cache = INITIAL_SUDOKU.lock().unwrap();
            let sudoku = *cache.get_or_insert_with(|| generate_sudoku(&mut self.rng));
            self.sudoku = Some(sudoku);
        }
        let at = self.last_now;
        match self.tokens {
            None => self.tokens = Some((reset, ok)),
            Some((r0, o0)) => {
                if reset != r0 {
                    // The New Game alert's New Game: setSudoku(generateSudoku('medium')),
                    // setHasStarted(false).
                    self.sudoku = Some(generate_sudoku(&mut self.rng));
                    self.stop(at);
                }
                if ok != o0 {
                    // The Genius alert's OK: setHasStarted(false).
                    self.stop(at);
                }
                self.tokens = Some((reset, ok));
            }
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let board = self.board.as_ref();
        let grid: String = match self.game.as_ref() {
            Some(g) => g
                .board
                .iter()
                .flatten()
                .map(|&v| char::from(b'0' + v))
                .collect(),
            None => String::new(),
        };
        let solution: String = match self.game.as_ref() {
            Some(g) => g
                .solution
                .iter()
                .flatten()
                .map(|&v| char::from(b'0' + v))
                .collect(),
            None => String::new(),
        };
        let (sel, hl) = self
            .game
            .as_ref()
            .map_or(((-1, -1), 0), |g| (g.selected, g.highlighted));
        Some(format!(
            "{{\"started\":{},\"mounted\":{},\"rows\":{},\"numpad\":{},\"selected\":[{},{}],\"highlighted\":{},\"complete\":{},\"confetti\":{},\"board\":\"{}\",\"solution\":\"{}\"}}",
            self.started,
            board.is_some(),
            board.map_or(0, |b| b.anims.iter().filter(|a| a.mounted.is_some()).count() / 9),
            board.is_some_and(|b| b.numpad),
            sel.0,
            sel.1,
            hl,
            self.game.as_ref().is_some_and(|g| g.is_complete()),
            self.confetti.is_some(),
            grid,
            solution
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        if self.layout.is_none() {
            return;
        }
        match phase {
            PointerPhase::Down => {
                if !self.presses.iter().any(Pressable::is_pressed) {
                    if let Some(which) = self.hit_press(x, y) {
                        self.presses[which as usize].pointer_down(id, true);
                        return;
                    }
                }
                if self.responder.is_none() {
                    if let Some((target, region)) = self.hit_target(x, y) {
                        self.responder = Some(Responder {
                            id,
                            target,
                            region,
                            active: Some(at_ms),
                        });
                        if let Target::Key(k) = target {
                            self.events.push((at_ms, Event::PressIn(k)));
                        }
                    }
                }
            }
            PointerPhase::Move => {
                for which in [Which::Title, Which::NewGame, Which::Start] {
                    let inside = self.in_press(which, x, y);
                    self.presses[which as usize].pointer_move(id, inside);
                }
                let Some(mut r) = self.responder.filter(|r| r.id == id) else {
                    return;
                };
                let inside = in_press_rect(r.region, x, y);
                match (r.active, inside) {
                    (Some(activated), false) => {
                        r.active = None;
                        if let Target::Key(k) = r.target {
                            self.press_out(k, activated, at_ms);
                        }
                    }
                    (None, true) => {
                        r.active = Some(at_ms);
                        if let Target::Key(k) = r.target {
                            self.events.push((at_ms, Event::PressIn(k)));
                        }
                    }
                    _ => {}
                }
                self.responder = Some(r);
            }
            PointerPhase::Up | PointerPhase::Cancel => {
                for which in [Which::Title, Which::NewGame, Which::Start] {
                    if self.pressable(which).finger() != Some(id) {
                        continue;
                    }
                    let inside = self.in_press(which, x, y);
                    if let Some(PressEvent::Press(press)) = self.presses[which as usize].pointer(id, gfx::phase(phase), inside) {
                        self.posted.extend(press.global_message().map(String::from));
                        self.pressed(which, at_ms);
                    }
                    return;
                }
                let Some(r) = self.responder.filter(|r| r.id == id) else {
                    return;
                };
                self.responder = None;
                if let Some(activated) = r.active {
                    if phase == PointerPhase::Up {
                        self.press_target(r.target, at_ms);
                    }
                    if let Target::Key(k) = r.target {
                        self.press_out(k, activated, at_ms);
                    }
                }
            }
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
        if self.sudoku.is_none() {
            // Never bound (a fixture without inputs): the session's puzzle from seed 0.
            let _ = self.bind(
                &[Value::Number(0.0), Value::Number(0.0), Value::Number(0.0)],
                None,
            );
        }
        let size = (frame.width, frame.height, frame.scale);
        if self.size != size {
            self.size = size;
            self.layout = None;
            self.layers = None;
        }
        if self.first.is_none() {
            self.first = Some(now);
            // The first render: the Start button's container and its FadeIn 400.
            let target = self.layout_for(Content::default());
            self.start = Some(StartView {
                press: timed(0.0, 1.0, 400.0),
                leaving: false,
                rel: target.start.rel(target.card),
                text_rel: target.start_text.rel(target.start),
            });
        }
        self.apply_events(now);
        self.relayout();
        self.fire_timers(now);
        let mut moving = self.step(now);
        self.last_now = now;

        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        if self.layers.as_ref().is_none_or(|l| l.pixels != (pw, ph)) {
            let numpad = self.layout_for(Content {
                started: true,
                actions: true,
                numpad: true,
            });
            let board_px = (numpad.board_size * s).ceil() as u32 + 2;
            let wrapper_band = ((numpad.wrapper.h + 25.0) * s).ceil() as u32 + 8;
            let start = self.layout_for(Content::default()).start;
            let start_band = (start.h * s).ceil() as u32 + 8;
            let confetti_y = wrapper_band + start_band;
            let layer_px = (
                pw.max(SIZES as u32 * FLAKE as u32 + 2),
                confetti_y + CONFETTI.len() as u32 * FLAKE as u32 + 2,
            );
            let cells = Images::target(device, board_px, board_px);
            let layer = Images::target(device, layer_px.0, layer_px.1);
            self.renderers[1].set_images(&cells);
            self.renderers[2].set_images(&layer);
            self.layers = Some(Layers {
                pixels: (pw, ph),
                cells_view: cells.render_view(),
                cells,
                cells_px: board_px,
                layer_view: layer.render_view(),
                layer,
                layer_px,
                wrapper_band,
                start_band,
                confetti_y,
            });
        }
        let (header, card) = self.frames();
        self.record_cells(s);
        {
            let l = self.layers.as_ref().unwrap();
            self.renderers[0].draw(
                device,
                queue,
                encoder,
                &self.canvases[0],
                &l.cells_view,
                wgpu::TextureFormat::Rgba8Unorm,
                l.cells_px,
                l.cells_px,
                wgpu::Color::TRANSPARENT,
            );
        }
        let cells_image = self.layers.as_ref().unwrap().cells.image(0);
        self.record_layer(s, card, cells_image);
        {
            let l = self.layers.as_ref().unwrap();
            self.renderers[1].draw(
                device,
                queue,
                encoder,
                &self.canvases[1],
                &l.layer_view,
                wgpu::TextureFormat::Rgba8Unorm,
                l.layer_px.0,
                l.layer_px.1,
                wgpu::Color::TRANSPARENT,
            );
        }
        let layer_image = self.layers.as_ref().unwrap().layer.image(0);
        self.record_main(s, header, card, layer_image);
        self.renderers[2].draw(
            device,
            queue,
            encoder,
            &self.canvases[2],
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        moving |= self.presses.iter().any(Pressable::is_animating) || self.responder.is_some();
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: W,
            height: H,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        }
    }

    fn tap(s: &mut Sudoku, (x, y): (f32, f32), at_ms: f64) {
        s.input(&pointer(PointerPhase::Down, x, y, at_ms));
        s.input(&pointer(PointerPhase::Up, x, y, at_ms + 60.0));
    }

    fn rgb(img: &fixture::Pixels, x: f32, y: f32) -> [u8; 3] {
        let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
        [p[0], p[1], p[2]]
    }

    fn bytes(c: Color) -> [u8; 3] {
        [c.0[0], c.0[1], c.0[2]].map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8)
    }

    fn close(a: [u8; 3], b: [u8; 3], tol: i32) -> bool {
        a.iter()
            .zip(b)
            .all(|(x, y)| (*x as i32 - y as i32).abs() <= tol)
    }

    /// RN's own Yoga (exact/parity-tools/sudoku/yoga-layout.cpp) with Text sizes 180, 140, 70
    /// and 80 wide (SF line heights): `/tmp/sudoku-yoga W H 3 started numpad 180 140 70 80`.
    #[test]
    fn the_layout_is_react_natives_yoga() {
        let sizes = Sizes {
            title: (180.0, sf_line(40.0)),
            subtitle: (140.0, sf_line(15.0)),
            new_game: (70.0, sf_line(14.0)),
            start: (80.0, sf_line(16.0)),
        };
        type Rows = &'static [(&'static str, [f32; 4])];
        let cases: [(f32, f32, bool, bool, Rows); 7] = [
            (
                420.0,
                912.0,
                false,
                false,
                &[
                    ("header", [120.0000, 316.0000, 180.3333, 72.0000]),
                    ("title.text", [120.0000, 316.0000, 180.3333, 48.0000]),
                    ("subtitle", [140.0000, 370.0000, 140.3333, 18.0000]),
                    ("boardContainer", [20.0000, 436.0000, 380.0000, 160.0000]),
                    ("start.pressable", [110.0000, 496.3333, 200.0000, 39.3333]),
                    ("start.text", [169.6667, 506.3333, 80.3333, 19.3333]),
                ],
            ),
            (
                420.0,
                912.0,
                true,
                false,
                &[
                    ("header", [120.0000, 169.6667, 180.3333, 119.0000]),
                    ("headerActions", [162.0000, 257.6667, 96.3333, 31.0000]),
                    ("newGame.text", [175.0000, 264.6667, 70.3333, 17.0000]),
                    ("boardContainer", [7.0000, 336.6667, 406.0000, 406.0000]),
                    ("boardWrapper", [24.0000, 353.6667, 372.0000, 372.0000]),
                    ("board", [24.0000, 353.6667, 372.0000, 372.0000]),
                    ("cell00", [24.0000, 353.6667, 41.3333, 41.3333]),
                    ("cellbg02", [107.3333, 354.3333, 38.6667, 40.3333]),
                    ("cellbg25", [231.3333, 437.0000, 38.6667, 39.0000]),
                    ("cell38", [354.6667, 477.6667, 41.3333, 41.3333]),
                    ("cell88", [354.6667, 684.3333, 41.3333, 41.3334]),
                    ("cellbg88", [355.3333, 685.0000, 40.3333, 40.3333]),
                ],
            ),
            (
                420.0,
                912.0,
                true,
                true,
                &[
                    ("header", [120.0000, 90.6667, 180.3333, 119.0000]),
                    ("title.text", [120.0000, 90.6667, 180.3333, 48.0000]),
                    ("subtitle", [140.0000, 144.6667, 140.3333, 18.0000]),
                    ("headerActions", [162.0000, 178.6667, 96.3333, 31.0000]),
                    ("boardContainer", [7.0000, 257.6667, 406.0000, 564.0000]),
                    ("boardWrapper", [24.0000, 274.6667, 372.0000, 530.0000]),
                    ("cell88", [354.6667, 605.3333, 41.3333, 41.3334]),
                    ("numpad", [37.0000, 678.6666, 346.0000, 126.0000]),
                    ("key0", [75.0000, 690.6666, 46.0000, 46.0000]),
                    ("key5", [75.0000, 746.6666, 46.0000, 46.0000]),
                    ("key9", [299.0000, 746.6666, 46.0000, 46.0000]),
                ],
            ),
            (
                393.0,
                852.0,
                true,
                true,
                &[
                    ("header", [106.3333, 74.0000, 180.3333, 119.0000]),
                    ("newGame.text", [161.3333, 169.0000, 70.3333, 17.0000]),
                    ("boardContainer", [7.0000, 241.0000, 379.0000, 537.0000]),
                    ("board", [24.0000, 258.0000, 345.0000, 345.0000]),
                    ("cellbg02", [101.3333, 258.6667, 35.6667, 37.3333]),
                    ("cellbg25", [216.3333, 335.3333, 35.6667, 35.6667]),
                    ("cell38", [330.6667, 373.0000, 38.3333, 38.3333]),
                    ("cellbg88", [331.3333, 565.3333, 37.3333, 37.3334]),
                    ("numpad", [37.0000, 635.0000, 319.0000, 126.0000]),
                    ("key0", [61.6667, 647.0000, 46.0000, 46.0000]),
                    ("key9", [285.6667, 703.0000, 46.0000, 46.0000]),
                ],
            ),
            (
                440.0,
                956.0,
                true,
                true,
                &[
                    ("header", [130.0000, 102.6667, 180.3333, 119.0000]),
                    ("boardContainer", [7.0000, 269.6667, 426.0000, 584.0000]),
                    ("cell00", [24.0000, 286.6667, 43.6667, 43.3333]),
                    ("cellbg02", [111.6667, 287.3333, 41.0000, 42.6667]),
                    ("cellbg25", [242.3333, 374.3333, 41.0000, 41.3333]),
                    ("cell38", [372.3333, 417.3333, 43.6667, 43.3333]),
                    ("cell88", [372.3333, 635.0000, 43.6667, 43.6667]),
                    ("numpad", [37.0000, 710.6666, 366.0000, 126.0000]),
                    ("key0", [57.0000, 722.6666, 46.0000, 46.0000]),
                    ("key5", [337.0000, 722.6666, 46.0000, 46.0000]),
                    ("key9", [281.0000, 778.6666, 46.0000, 46.0000]),
                ],
            ),
            (
                375.0,
                812.0,
                false,
                false,
                &[
                    ("header", [97.3333, 266.0000, 180.3333, 72.0000]),
                    ("boardContainer", [20.0000, 386.0000, 335.0000, 160.0000]),
                    ("start.pressable", [87.6667, 446.3333, 200.0000, 39.3333]),
                    ("start.text", [147.3333, 456.3333, 80.3333, 19.3333]),
                ],
            ),
            (
                402.0,
                874.0,
                true,
                true,
                &[
                    ("header", [111.0000, 80.6667, 180.3333, 119.0000]),
                    ("boardContainer", [7.0000, 247.6667, 388.0000, 546.0000]),
                    ("cellbg25", [221.3333, 344.0000, 36.6667, 37.0000]),
                    ("cell88", [338.6667, 579.3333, 39.3333, 39.3334]),
                    ("numpad", [37.0000, 650.6667, 328.0000, 126.0000]),
                    ("key9", [290.0000, 718.6667, 46.0000, 46.0000]),
                ],
            ),
        ];
        for (w, h, started, numpad, rows) in cases {
            let l = Layout::new(
                w,
                h,
                3.0,
                sizes,
                Content {
                    started,
                    actions: started,
                    numpad,
                },
            );
            for &(name, [x, y, rw, rh]) in rows {
                let r = match name {
                    "header" => l.header,
                    "title.text" => l.title,
                    "subtitle" => l.subtitle,
                    "headerActions" => l.actions,
                    "newGame.text" => l.new_game_text,
                    "boardContainer" => l.card,
                    "start.pressable" => l.start,
                    "start.text" => l.start_text,
                    "boardWrapper" => l.wrapper,
                    "board" => l.board,
                    "numpad" => l.numpad,
                    n if n.starts_with("cellbg") => {
                        l.bgs[n[6..7].parse::<usize>().unwrap() * 9
                            + n[7..8].parse::<usize>().unwrap()]
                    }
                    n if n.starts_with("cell") => {
                        l.cells[n[4..5].parse::<usize>().unwrap() * 9
                            + n[5..6].parse::<usize>().unwrap()]
                    }
                    n if n.starts_with("key") => l.keys[n[3..].parse::<usize>().unwrap()],
                    n => panic!("{n}"),
                };
                for (got, want) in [r.x, r.y, r.w, r.h].into_iter().zip([x, y, rw, rh]) {
                    assert!((got - want).abs() < 0.002, "{w}×{h} started {started} numpad {numpad}: {name} {r:?} vs [{x}, {y}, {rw}, {rh}]");
                }
            }
        }
    }

    #[test]
    fn the_puzzle_is_generate_sudoku_medium() {
        for seed in 1..6 {
            let mut rng = Random::new(seed as f64);
            let (puzzle, solution) = generate_sudoku(&mut rng);
            assert!(is_puzzle_complete(&solution));
            let holes = puzzle.iter().flatten().filter(|&&v| v == 0).count();
            assert_eq!(holes, 45, "seed {seed}");
            for (p, s) in puzzle.iter().flatten().zip(solution.iter().flatten()) {
                assert!(*p == 0 || p == s);
            }
            let mut b = puzzle;
            let mut n = 0;
            count_solutions(&mut b, &mut n);
            assert_eq!(n, 1);
        }
    }

    #[test]
    fn the_game_is_sudoku_game_ts() {
        let mut rng = Random::new(3.0);
        let (puzzle, solution) = generate_sudoku(&mut rng);
        let mut g = Game::new(puzzle, solution);
        assert!(!g.set_number(1), "nothing selected");
        let given = (0..81).find(|&i| puzzle[i / 9][i % 9] != 0).unwrap();
        let empty = (0..81).find(|&i| puzzle[i / 9][i % 9] == 0).unwrap();
        g.select_cell(given / 9, given % 9);
        assert_eq!(g.highlighted, puzzle[given / 9][given % 9]);
        assert!(!g.set_number(1), "a given");
        g.select_cell(given / 9, given % 9);
        assert_eq!(
            (g.selected, g.highlighted),
            ((-1, -1), 0),
            "the same cell deselects"
        );
        g.select_cell(empty / 9, empty % 9);
        assert_eq!(g.highlighted, 0);
        assert!(g.set_number(7));
        assert_eq!((g.board[empty / 9][empty % 9], g.highlighted), (7, 7));
        assert!(g.clear_cell());
        assert_eq!((g.board[empty / 9][empty % 9], g.highlighted), (0, 0));
        // Every empty cell its solution's number: complete.
        g.selected = (-1, -1);
        for i in 0..81 {
            if puzzle[i / 9][i % 9] == 0 {
                g.select_cell(i / 9, i % 9);
                g.set_number(solution[i / 9][i % 9]);
            }
        }
        assert!(g.is_complete(), "{:?}", g.board);
        g.board[empty / 9][empty % 9] = if solution[empty / 9][empty % 9] == 1 {
            2
        } else {
            1
        };
        assert!(!g.is_complete());
        assert!(g.solve() && g.is_complete());
    }

    #[test]
    fn the_circle_colour_is_reanimateds_alpha_spring() {
        assert_eq!(alpha_byte(0.35), 89);
        assert_eq!(alpha_byte(0.0009), 0);
        assert_eq!(alpha_byte(-0.01), 0);
        let mut a = Spring::at(0.0);
        a.to(0.35, 0.0, GENTLE);
        let mut ms = 0.0;
        let mut last = 0;
        while a.step(ms) {
            let b = alpha_byte(a.value);
            assert!(b >= last, "critically damped: never back");
            last = b;
            ms += 1000.0 / 120.0;
        }
        assert_eq!(alpha_byte(a.value), 89);
    }

    #[test]
    fn flakes_blast_out_of_the_centre_and_fall() {
        let mut rng = Random::new(5.0);
        let mut fl = Vec::new();
        flakes(&mut rng, &mut fl);
        assert_eq!(fl.len(), FLAKES);
        assert!(fl
            .iter()
            .all(|f| f.color < 6 && f.size < 100 && (0.0..0.6).contains(&f.delay_blast)));
        // Before the blast: scale 0 at the centre.
        let x = flake(10, &fl[10], 0.0, 0.0, 420.0, 912.0);
        assert_eq!((x.scos, x.ssin), (0.0, 0.0));
        // Blast done, no fall: on the golden-angle disc, scaled by |cos(initialRotation)|.
        let f = Flake {
            initial_rotation: 0.0,
            ..fl[499]
        };
        let x = flake(499, &f, 1.0, 0.0, 420.0, 912.0);
        let angle = ((499.0f64 * 137.5) % 360.0).to_radians();
        assert!((x.scos - 1.0).abs() < 1e-6 && x.ssin.abs() < 1e-6);
        assert!((x.tx as f64 + 5.0 - (210.0 + 300.0 * angle.cos())).abs() < 1e-3);
        assert!((x.ty as f64 + 5.0 - (150.0 + 300.0 * angle.sin())).abs() < 1e-3);
        // Fallen: H + 100 − 150 + 300 lower, the offsets added.
        let f = Flake {
            initial_rotation: 0.0,
            max_rotation: (2.0 * std::f64::consts::PI, 2.0 * std::f64::consts::PI),
            ..fl[499]
        };
        let y = flake(499, &f, 1.0, 1.0, 420.0, 912.0);
        let rot = y.ssin.atan2(y.scos);
        assert!(rot.abs() < 1e-4);
        let (s, c) = (y.ssin as f64, y.scos as f64);
        let ty = y.ty as f64 + s * 5.0 + c * 5.0;
        assert!(
            (ty - (150.0 + 300.0 * angle.sin() + 912.0 + 100.0 - 150.0 + 300.0 + f.offset.1)).abs()
                < 1e-2
        );
    }

    fn render_to(
        gpu: &exact_gpu::Gpu,
        s: &mut Sudoku,
        from: f64,
        to: f64,
    ) -> (fixture::Pixels, f64) {
        let mut ms = from;
        loop {
            let (img, _) = fixture::render(gpu, s, &frame(ms)).unwrap();
            if ms >= to {
                return (img, ms);
            }
            ms = (ms + 1000.0 / 60.0).min(to);
        }
    }

    #[test]
    fn start_reveal_select_fill_solve_and_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = Sudoku::new();
        if s.fonts.is_none() {
            return eprintln!("no system font; skipped");
        }
        s.bind(
            &[Value::Number(42.0), Value::Number(0.0), Value::Number(0.0)],
            None,
        )
        .unwrap();
        // Mount: the header fades in over 1000 ms; the card is there at once.
        let (first, _) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        let l = s.layout.clone().unwrap();
        let card_bg = bytes(view(SURFACE));
        assert!(
            close(rgb(&first, l.card.x + 8.0, l.card.y + 30.0), card_bg, 1),
            "{:?}",
            rgb(&first, l.card.x + 8.0, l.card.y + 30.0)
        );
        let (start, ms) = render_to(&gpu, &mut s, 16.0, 1200.0);
        gfx::save_over(&start, "sudoku-start", [0, 0, 0]);
        // The gradient: #0A1222 at the top, #121D33 at the bottom (sRGB).
        assert!(
            close(rgb(&start, 3.0, 0.2), [10, 18, 34], 1),
            "{:?}",
            rgb(&start, 3.0, 0.2)
        );
        assert!(
            close(rgb(&start, 3.0, H - 0.2), [18, 29, 51], 1),
            "{:?}",
            rgb(&start, 3.0, H - 0.2)
        );
        // The Start button: primary beside its text.
        let st = l.start;
        assert!(
            close(
                rgb(&start, st.x + 8.0, st.y + st.h / 2.0),
                bytes(view(PRIMARY)),
                2
            ),
            "{:?}",
            rgb(&start, st.x + 8.0, st.y + st.h / 2.0)
        );
        let ink =
            (0..60).any(|i| rgb(&start, l.title.x + i as f32 * 3.0, l.title.y + 24.0)[0] > 200);
        assert!(ink, "SUDOKU");

        // Held (pressto as designed), Start scales to 0.96 about its centre over 250 ms: its
        // left edge moves in by w × 0.02; slid off and lifted outside, no press, no haptic.
        s.input(&pointer(PointerPhase::Down, st.x + st.w / 2.0, st.y + st.h / 2.0, ms + 5.0));
        let (held, ms) = render_to(&gpu, &mut s, ms + 16.0, ms + 300.0);
        gfx::save_over(&held, "sudoku-start-held", [0, 0, 0]);
        assert!((s.pressable(Which::Start).scale() - 0.96).abs() < 1e-9);
        let inset = st.w * 0.02;
        assert!(!close(rgb(&held, st.x + inset - 1.0, st.y + st.h / 2.0), bytes(view(PRIMARY)), 6), "{:?}", rgb(&held, st.x + inset - 1.0, st.y + st.h / 2.0));
        assert!(close(rgb(&held, st.x + inset + 2.0, st.y + st.h / 2.0), bytes(view(PRIMARY)), 2), "{:?}", rgb(&held, st.x + inset + 2.0, st.y + st.h / 2.0));
        s.input(&pointer(PointerPhase::Move, st.x - 40.0, st.y - 40.0, ms + 5.0));
        s.input(&pointer(PointerPhase::Up, st.x - 40.0, st.y - 40.0, ms + 10.0));
        assert!(s.messages().is_empty());
        let (back, ms) = render_to(&gpu, &mut s, ms + 16.0, ms + 300.0);
        assert_eq!(s.pressable(Which::Start).scale(), 1.0);
        assert!(close(rgb(&back, st.x + 1.0, st.y + st.h / 2.0), bytes(view(PRIMARY)), 2));

        // Start: the selection haptic at the lift, the board mounts at the next frame.
        tap(&mut s, st.center(), ms + 10.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let t0 = ms + 70.0;
        let (_, _) = render_to(&gpu, &mut s, ms + 16.0, t0 + 300.0);
        assert!(s.agent("").unwrap().contains("\"mounted\":true,\"rows\":0"));
        let (reveal, _) = render_to(&gpu, &mut s, t0 + 316.0, t0 + 900.0);
        gfx::save_over(&reveal, "sudoku-reveal", [0, 0, 0]);
        let agent = s.agent("").unwrap();
        assert!(agent.contains("\"rows\":9,\"numpad\":false"), "{agent}");
        let (_, ms) = render_to(&gpu, &mut s, t0 + 916.0, t0 + 2300.0);
        assert!(s.agent("").unwrap().contains("\"numpad\":true"));
        let (board_img, ms) = render_to(&gpu, &mut s, ms + 16.0, ms + 900.0);
        gfx::save_over(&board_img, "sudoku-board", [0, 0, 0]);
        let l = s.layout.clone().unwrap();
        // The board's primary border, a cell's surface, the pad's keys.
        let b = l.board;
        assert!(
            close(
                rgb(&board_img, b.x + b.w / 2.0, b.y + 0.7),
                bytes(view(PRIMARY)),
                3
            ),
            "{:?}",
            rgb(&board_img, b.x + b.w / 2.0, b.y + 0.7)
        );
        let key = l.keys[0];
        assert!(
            !close(
                rgb(&board_img, key.x + 0.2, key.y + key.h / 2.0),
                card_bg,
                2
            ),
            "the key's border"
        );

        // A given cell: its number's cells get the circle.
        let game = s.game.clone().unwrap();
        let given = (0..81).find(|&i| game.initial[i / 9][i % 9] != 0).unwrap();
        let cell = |i: usize| l.cells[i];
        tap(&mut s, cell(given).center(), ms + 10.0);
        let (hl, ms) = render_to(&gpu, &mut s, ms + 80.0, ms + 1200.0);
        gfx::save_over(&hl, "sudoku-highlight", [0, 0, 0]);
        let v = game.initial[given / 9][given % 9];
        let other = (0..81)
            .find(|&i| i != given && game.initial[i / 9][i % 9] == v)
            .unwrap();
        let o = l.bgs[other];
        let near_corner = rgb(&hl, o.x + o.w / 2.0, o.y + 3.0);
        assert!(
            near_corner[2] > card_bg[2] + 20,
            "the circle: {near_corner:?}"
        );
        // The pad's key for that number is highlighted.
        let kr = l.keys[v as usize - 1];
        assert!(
            close(
                rgb(&hl, kr.x + kr.w / 2.0, kr.y + 0.4),
                bytes(view(PRIMARY)),
                40
            ),
            "{:?}",
            rgb(&hl, kr.x + kr.w / 2.0, kr.y + 0.4)
        );

        // An empty cell selected, then a number: it shows.
        let empty = (0..81).find(|&i| game.initial[i / 9][i % 9] == 0).unwrap();
        tap(&mut s, cell(empty).center(), ms + 10.0);
        let (_, ms) = render_to(&gpu, &mut s, ms + 80.0, ms + 400.0);
        let n = (game.solution[empty / 9][empty % 9] % 9) + 1;
        tap(&mut s, l.keys[n as usize - 1].center(), ms + 10.0);
        let (filled, ms) = render_to(&gpu, &mut s, ms + 80.0, ms + 800.0);
        gfx::save_over(&filled, "sudoku-filled", [0, 0, 0]);
        assert_eq!(s.game.as_ref().unwrap().board[empty / 9][empty % 9], n);
        let e = l.cells[empty];
        let ink = (0..30).any(|i| {
            (0..30).any(|j| rgb(&filled, e.x + 6.0 + i as f32, e.y + 6.0 + j as f32)[0] > 200)
        });
        assert!(ink, "the number");

        // The title solves: the haptics' chain, confetti, "Genius!" at 100 + 2000 ms.
        let title = l.title;
        tap(&mut s, title.center(), ms + 10.0);
        let lift = ms + 70.0;
        assert_eq!(
            s.messages(),
            vec![
                "haptic:selection".to_string(),
                "haptic:impact-light".to_string()
            ]
        );
        let mut heard = Vec::new();
        let mut t = lift + 1.0;
        let mut blast = None;
        while t < lift + 2300.0 {
            let (img, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            if blast.is_none() && t > lift + 700.0 {
                blast = Some(img);
            }
            for m in s.messages() {
                heard.push((m, t - lift));
            }
            t += 1000.0 / 60.0;
        }
        gfx::save_over(blast.as_ref().unwrap(), "sudoku-confetti", [0, 0, 0]);
        let kinds: Vec<&str> = heard.iter().map(|(m, _)| m.as_str()).collect();
        assert_eq!(
            kinds,
            vec![
                "haptic:impact-light",
                "haptic:impact-light",
                "haptic:impact-medium",
                "haptic:impact-medium",
                "haptic:impact-medium",
                "haptic:impact-heavy",
                "haptic:impact-heavy",
                "haptic:success",
                "alert:genius"
            ],
            "{heard:?}"
        );
        let genius = heard.last().unwrap().1;
        assert!(
            (2100.0..2100.0 + 2.0 * 1000.0 / 60.0 + 1.0).contains(&genius),
            "{genius}"
        );
        assert!(s.agent("").unwrap().contains("\"complete\":true"));
        // OK: back to the Start button.
        s.bind(
            &[Value::Number(42.0), Value::Number(0.0), Value::Number(1.0)],
            None,
        )
        .unwrap();
        let (_, ms) = render_to(&gpu, &mut s, t, t + 120.0);
        assert!(s
            .agent("")
            .unwrap()
            .starts_with("{\"started\":false,\"mounted\":false"));
        let (back, _) = render_to(&gpu, &mut s, ms + 16.0, ms + 800.0);
        gfx::save_over(&back, "sudoku-back", [0, 0, 0]);
        let l = s.layout.clone().unwrap();
        assert!(close(
            rgb(&back, l.start.x + 8.0, l.start.y + l.start.h / 2.0),
            bytes(view(PRIMARY)),
            2
        ));
    }

    #[test]
    fn a_pad_press_springs_to_095_and_back_after_130_ms() {
        let mut s = Sudoku::new();
        s.size = (W, H, 3.0);
        s.bind(
            &[Value::Number(9.0), Value::Number(0.0), Value::Number(0.0)],
            None,
        )
        .unwrap();
        s.first = Some(0.0);
        s.start = None;
        s.relayout();
        s.pressed(Which::Start, 0.0);
        s.apply_events(16.0);
        s.relayout();
        s.board.as_mut().unwrap().numpad = true;
        s.relayout();
        let l = s.layout.clone().unwrap();
        s.board.as_mut().unwrap().wrapper.set(1.0);
        s.board.as_mut().unwrap().enter.set(1.0);
        s.card_frame.set(l.card);
        let key = l.keys[3].center();
        s.input(&pointer(PointerPhase::Down, key.0, key.1, 100.0));
        s.input(&pointer(PointerPhase::Up, key.0, key.1, 150.0));
        s.apply_events(160.0);
        assert_eq!(s.board.as_ref().unwrap().keys_anim[3].scale.target(), 0.95);
        // Released 50 ms in: onPressOut waits for 130 ms from the press.
        s.fire_timers(200.0);
        s.apply_events(230.0);
        assert_eq!(s.board.as_ref().unwrap().keys_anim[3].scale.target(), 0.95);
        s.fire_timers(231.0);
        s.apply_events(240.0);
        assert_eq!(s.board.as_ref().unwrap().keys_anim[3].scale.target(), 1.0);
    }
}
