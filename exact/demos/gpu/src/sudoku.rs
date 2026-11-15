//! Sudoku, redesigned from the owner's phone feedback (2026-11-15, "terrible layout, and haptics
//! are missing"; notes mwhonvzk-e2cc0a, mwhn456m-c9c3f7). The RN demo (src/animations/sudoku) is
//! the starting point for the game, not the look: no card, no blue border, no header block, no
//! start screen. This surface draws the screen's dithered gradient and the board; the Contract
//! (demos/sudoku/sudoku.contract) lays out the header, the glass number pad and the glass tools,
//! and hands the board's frame and every pad press in through `bind`.
//!
//! Inputs, in bind order: `seed`, `reset` (a token: New Game), `ok` (a token: the Genius alert's
//! OK, also a new game), the board's `left`, `top` and `size` in points, `cmd` and `token` (the
//! pad: 1–9 a digit, 10 Erase, 11 Undo, applied once per new token) and `notes` (1 while pencil
//! marks are on).
//!
//! Messages: `remain:<nine digits>` (how many of each number are still to place, for the pad),
//! `mistakes:<n>`, `time:<seconds>` (once a second while the puzzle is open), `solved`,
//! `alert:genius`, and the haptics as `haptic:<kind>` (played by the host, no commit):
//! selection on a cell, light on an entry, success when a row, column or box completes, error on
//! a wrong digit, and the celebration (light ×3, medium ×3, heavy ×2, success) at the end.
//!
//! The board: a full-width square with continuous corners, a faint fill, one-device-pixel cell
//! lines and 2 pt box lines (and outer ring). Given digits white semibold, the user's in system
//! blue, a wrong one in system red with a short damped shake. The selected cell is tinted blue;
//! its row, column and box take a light tint, and every cell holding its number a blue one.
//! Motion is transforms and opacity of what is drawn, nothing laid out: the cells fade in on a
//! diagonal at each new puzzle, a completed unit runs a wave (a tint and a small scale, cell
//! after cell from the entry), the solved puzzle a wave over the whole board.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx::Random;

/// The Sudoku surface (inputs and messages in the module docs).
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sudoku::new())
}

// ---------------------------------------------------------------------------------------------
// Look.

/// theme.ts COLORS.background → COLORS.surface: the screen's gradient, top to bottom.
const BACKGROUND: u32 = 0x0A1222;
const SURFACE: u32 = 0x121D33;
/// UIKit's dark systemBlue, systemRed and secondaryLabel (as sRGB).
const BLUE: u32 = 0x0A84FF;
const RED: u32 = 0xFF453A;
const SECONDARY: u32 = 0x98989F;
const WHITE: u32 = 0xFFFFFF;

/// The board's continuous corner radius.
const BOARD_R: f32 = 14.0;
/// The box lines and the outer ring.
const BOX_LINE: f32 = 2.0;
const BOX_LINE_A: f32 = 0.42;
/// The cell lines: one device pixel.
const CELL_LINE_A: f32 = 0.13;
const BOARD_FILL_A: f32 = 0.035;
/// The tints: the selected cell, the cells holding its number, its row, column and box.
const SELECTED_A: f32 = 0.20;
const SAME_A: f32 = 0.15;
/// The selected cell's ring: its width, inset and corner radius.
const RING: f32 = 2.0;
const RING_INSET: f32 = 1.5;
const RING_R: f32 = 7.0;
const PEER_A: f32 = 0.055;

/// The diagonal fade at each new puzzle: per step of r + c, and each cell's fade.
const MOUNT_STEP_MS: f64 = 14.0;
const MOUNT_FADE_MS: f64 = 240.0;
/// A wrong digit's shake: its length, amplitude (pt) and half-swings.
const SHAKE_MS: f64 = 420.0;
const SHAKE_PX: f32 = 5.0;
const SHAKE_SWINGS: f64 = 6.0;
/// A completed unit's wave: each cell's pulse and the step between neighbours.
const WAVE_MS: f64 = 460.0;
const WAVE_STEP_MS: f64 = 38.0;
/// The solved board's wave: the step per cell of distance from the last entry.
const SOLVE_STEP_MS: f64 = 30.0;
/// After the solved board's wave, the Genius alert.
const GENIUS_MS: f64 = 1500.0;

/// The celebration at the puzzle's end (index.tsx playCelebrationHaptics): each haptic and the
/// wait after it.
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

/// The pad's commands (`cmd`).
const CMD_ERASE: u8 = 10;
const CMD_UNDO: u8 = 11;

// ---------------------------------------------------------------------------------------------
// logic/sudoku.ts (generateSudoku('medium'), 45 cells removed with a unique solution).

type Grid = [[u8; 9]; 9];
type Notes = [[u16; 9]; 9];

const CELLS_TO_REMOVE: u32 = 45;

fn is_valid_move(board: &Grid, row: usize, col: usize, num: u8) -> bool {
    for x in 0..9 {
        if board[row][x] == num && x != col {
            return false;
        }
        if board[x][col] == num && x != row {
            return false;
        }
    }
    let (br, bc) = (row / 3 * 3, col / 3 * 3);
    for i in 0..3 {
        for j in 0..3 {
            if board[br + i][bc + j] == num && (br + i, bc + j) != (row, col) {
                return false;
            }
        }
    }
    true
}

fn shuffle<T: Copy, const N: usize>(array: [T; N], rng: &mut Random) -> [T; N] {
    let mut a = array;
    for i in (1..N).rev() {
        let j = (rng.next() * (i as f64 + 1.0)).floor() as usize;
        a.swap(i, j);
    }
    a
}

fn find_empty(board: &Grid) -> Option<(usize, usize)> {
    (0..81)
        .map(|i| (i / 9, i % 9))
        .find(|&(r, c)| board[r][c] == 0)
}

fn solve_sudoku(board: &mut Grid, rng: &mut Random) -> bool {
    let Some((row, col)) = find_empty(board) else {
        return true;
    };
    for num in shuffle([1u8, 2, 3, 4, 5, 6, 7, 8, 9], rng) {
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

fn generate_sudoku(rng: &mut Random) -> (Grid, Grid) {
    let mut board = [[0u8; 9]; 9];
    for b in (0..9).step_by(3) {
        let nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
        for (k, n) in nums.into_iter().enumerate() {
            board[b + k / 3][b + k % 3] = n;
        }
    }
    solve_sudoku(&mut board, rng);
    let solution = board;
    let mut puzzle = board;
    let mut removed = 0;
    let order: [usize; 81] = std::array::from_fn(|i| i);
    for cell in shuffle(order, rng) {
        if removed >= CELLS_TO_REMOVE {
            break;
        }
        let (r, c) = (cell / 9, cell % 9);
        let temp = puzzle[r][c];
        puzzle[r][c] = 0;
        let mut probe = puzzle;
        let mut solutions = 0;
        count_solutions(&mut probe, &mut solutions);
        if solutions == 1 {
            removed += 1;
        } else {
            puzzle[r][c] = temp;
        }
    }
    (puzzle, solution)
}

/// The 27 units: rows 0–8, columns 9–17, boxes 18–26.
fn unit_cells(u: usize) -> [(usize, usize); 9] {
    std::array::from_fn(|k| match u {
        0..=8 => (u, k),
        9..=17 => (k, u - 9),
        _ => {
            let b = u - 18;
            (b / 3 * 3 + k / 3, b % 3 * 3 + k % 3)
        }
    })
}

fn units_of(r: usize, c: usize) -> [usize; 3] {
    [r, 9 + c, 18 + r / 3 * 3 + c / 3]
}

fn peers(a: (usize, usize), b: (usize, usize)) -> bool {
    a.0 == b.0 || a.1 == b.1 || (a.0 / 3 == b.0 / 3 && a.1 / 3 == b.1 / 3)
}

// ---------------------------------------------------------------------------------------------
// The game.

#[derive(Clone, Debug)]
struct Undo {
    cell: (usize, usize),
    value: u8,
    notes: Box<Notes>,
}

/// What an entry did, for the haptics and the motion.
#[derive(Clone, Debug, PartialEq)]
enum Entry {
    /// Nothing (no cell, a given, the same digit again, an empty erase).
    None,
    /// A pencil mark toggled, or a cell erased.
    Marked,
    /// A right digit, and the units it completed.
    Right(Vec<usize>),
    /// A wrong digit.
    Wrong,
    /// The last right digit: the puzzle is solved.
    Solved,
}

#[derive(Clone, Debug)]
struct Game {
    initial: Grid,
    solution: Grid,
    board: Grid,
    notes: Notes,
    selected: Option<(usize, usize)>,
    mistakes: u32,
    undo: Vec<Undo>,
}

impl Game {
    fn new((initial, solution): (Grid, Grid)) -> Game {
        Game {
            initial,
            solution,
            board: initial,
            notes: [[0; 9]; 9],
            selected: None,
            mistakes: 0,
            undo: Vec::new(),
        }
    }

    fn right(&self, r: usize, c: usize) -> bool {
        self.board[r][c] != 0 && self.board[r][c] == self.solution[r][c]
    }

    fn wrong(&self, r: usize, c: usize) -> bool {
        self.board[r][c] != 0 && self.board[r][c] != self.solution[r][c]
    }

    fn unit_done(&self, u: usize) -> bool {
        unit_cells(u).iter().all(|&(r, c)| self.right(r, c))
    }

    fn solved(&self) -> bool {
        (0..81).all(|i| self.right(i / 9, i % 9))
    }

    /// How many of each number are still to place (right digits count, wrong ones don't).
    fn remaining(&self) -> [u8; 9] {
        let mut left = [9u8; 9];
        for i in 0..81 {
            let (r, c) = (i / 9, i % 9);
            if self.right(r, c) {
                left[self.board[r][c] as usize - 1] -= 1;
            }
        }
        left
    }

    fn editable(&self) -> Option<(usize, usize)> {
        self.selected.filter(|&(r, c)| self.initial[r][c] == 0)
    }

    fn push_undo(&mut self, cell: (usize, usize)) {
        self.undo.push(Undo {
            cell,
            value: self.board[cell.0][cell.1],
            notes: Box::new(self.notes),
        });
    }

    fn enter(&mut self, digit: u8, notes: bool) -> Entry {
        let Some((r, c)) = self.editable() else {
            return Entry::None;
        };
        if self.right(r, c) {
            // A placed right digit stays: Erase or Undo take it back.
            return Entry::None;
        }
        let bit = 1u16 << digit;
        if notes {
            if self.board[r][c] != 0 {
                return Entry::None;
            }
            self.push_undo((r, c));
            self.notes[r][c] ^= bit;
            return Entry::Marked;
        }
        if self.board[r][c] == digit {
            return Entry::None;
        }
        let before: [bool; 27] = std::array::from_fn(|u| self.unit_done(u));
        self.push_undo((r, c));
        self.board[r][c] = digit;
        self.notes[r][c] = 0;
        if digit != self.solution[r][c] {
            self.mistakes += 1;
            return Entry::Wrong;
        }
        // A right digit clears its pencil mark from every peer.
        for i in 0..81 {
            let p = (i / 9, i % 9);
            if p != (r, c) && peers(p, (r, c)) {
                self.notes[p.0][p.1] &= !bit;
            }
        }
        if self.solved() {
            return Entry::Solved;
        }
        Entry::Right(
            units_of(r, c)
                .into_iter()
                .filter(|&u| !before[u] && self.unit_done(u))
                .collect(),
        )
    }

    fn erase(&mut self) -> Entry {
        let Some((r, c)) = self.editable() else {
            return Entry::None;
        };
        if self.board[r][c] == 0 && self.notes[r][c] == 0 {
            return Entry::None;
        }
        self.push_undo((r, c));
        self.board[r][c] = 0;
        self.notes[r][c] = 0;
        Entry::Marked
    }

    /// Takes the last entry back (the mistakes stay counted); the cell it touched is selected.
    fn undo(&mut self) -> Option<(usize, usize)> {
        let u = self.undo.pop()?;
        self.board[u.cell.0][u.cell.1] = u.value;
        self.notes = *u.notes;
        self.selected = Some(u.cell);
        Some(u.cell)
    }
}

// ---------------------------------------------------------------------------------------------
// The surface.

#[derive(Clone, Copy, Debug, PartialEq)]
struct Board {
    left: f32,
    top: f32,
    size: f32,
}

impl Board {
    fn cell(&self) -> f32 {
        self.size / 9.0
    }

    fn at(&self, x: f32, y: f32) -> Option<(usize, usize)> {
        let (cx, cy) = ((x - self.left) / self.cell(), (y - self.top) / self.cell());
        ((0.0..9.0).contains(&cx) && (0.0..9.0).contains(&cy)).then(|| (cy as usize, cx as usize))
    }
}

struct Fonts {
    /// The cell size they were made for.
    cell: f32,
    given: Font,
    user: Font,
    note: Font,
    note_strong: Font,
    /// Each digit's ink centre from its pen position, per font: (dx, dy).
    centres: [[(f32, f32); 10]; 4],
}

impl Fonts {
    fn new(cell: f32) -> Option<Fonts> {
        let digit = (cell * 0.56).round();
        let note = (cell * 0.25).round().max(8.0);
        let given = skia::match_ui_font(digit, 600.0)?;
        let user = skia::match_ui_font(digit, 500.0)?;
        let note_font = skia::match_ui_font(note, 500.0)?;
        let note_strong = skia::match_ui_font(note, 700.0)?;
        let mut centres = [[(0.0, 0.0); 10]; 4];
        for (k, f) in [&given, &user, &note_font, &note_strong]
            .into_iter()
            .enumerate()
        {
            for d in 1..=9u8 {
                let ink = f.measure_text(&d.to_string());
                centres[k][d as usize] = (ink.x + ink.width / 2.0, ink.y + ink.height / 2.0);
            }
        }
        Some(Fonts {
            cell,
            given,
            user,
            note: note_font,
            note_strong,
            centres,
        })
    }
}

/// A timed event: a haptic of the celebration, or the Genius alert.
struct Due {
    at: f64,
    message: &'static str,
}

struct Sudoku {
    rng: Random,
    seeded: bool,
    tokens: (f64, f64, f64),
    notes_on: bool,
    board: Board,
    game: Game,
    /// The puzzle's first frame (its fade and its clock start there); None until drawn.
    started: Option<f64>,
    /// When the puzzle was solved (the clock stops).
    solved_at: Option<f64>,
    /// The last frame's time: what `bind` and the pointer stamp their work with (a pointer's
    /// `at_ms` is not on the frame clock).
    now: f64,
    shake: [[f64; 9]; 9],
    wave: [[(f64, f32); 9]; 9],
    due: Vec<Due>,
    posted: Vec<String>,
    sent_remain: String,
    sent_mistakes: i64,
    sent_time: i64,
    fps: u32,
    size: (f32, f32, f32),
    gradient: Vec<(i32, i32, [u8; 3])>,
    fonts: Option<Fonts>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Sudoku {
    fn new() -> Sudoku {
        let mut rng = Random::new(0.0);
        let game = Game::new(generate_sudoku(&mut rng));
        Sudoku {
            rng,
            seeded: false,
            tokens: (0.0, 0.0, 0.0),
            notes_on: false,
            board: Board {
                left: 16.0,
                top: 160.0,
                size: 370.0,
            },
            game,
            started: None,
            solved_at: None,
            now: 0.0,
            shake: [[f64::NEG_INFINITY; 9]; 9],
            wave: [[(f64::NEG_INFINITY, 0.0); 9]; 9],
            due: Vec::new(),
            posted: Vec::new(),
            sent_remain: String::new(),
            sent_mistakes: -1,
            sent_time: -1,
            fps: 0,
            size: (0.0, 0.0, 0.0),
            gradient: Vec::new(),
            fonts: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    fn new_game(&mut self) {
        self.game = Game::new(generate_sudoku(&mut self.rng));
        self.started = None;
        self.solved_at = None;
        self.shake = [[f64::NEG_INFINITY; 9]; 9];
        self.wave = [[(f64::NEG_INFINITY, 0.0); 9]; 9];
        self.due.clear();
        self.sent_time = -1;
        self.report();
    }

    /// The pad's state and the mistakes, posted when they change.
    fn report(&mut self) {
        let remain: String = self
            .game
            .remaining()
            .iter()
            .map(|&n| char::from(b'0' + n))
            .collect();
        if remain != self.sent_remain {
            self.posted.push(format!("remain:{remain}"));
            self.sent_remain = remain;
        }
        let mistakes = self.game.mistakes as i64;
        if mistakes != self.sent_mistakes {
            self.posted.push(format!("mistakes:{mistakes}"));
            self.sent_mistakes = mistakes;
        }
    }

    fn select(&mut self, cell: (usize, usize)) {
        if self.game.selected != Some(cell) {
            self.game.selected = Some(cell);
            self.posted.push("haptic:selection".into());
        }
    }

    fn command(&mut self, cmd: u8) {
        if self.solved_at.is_some() {
            return;
        }
        let at = self.now;
        let entry = match cmd {
            1..=9 => self.game.enter(cmd, self.notes_on),
            CMD_ERASE => self.game.erase(),
            CMD_UNDO => {
                if let Some((r, c)) = self.game.undo() {
                    self.shake[r][c] = f64::NEG_INFINITY;
                    self.posted.push("haptic:impact-light".into());
                }
                Entry::None
            }
            _ => Entry::None,
        };
        let cell = self.game.selected.unwrap_or((4, 4));
        match entry {
            Entry::None => {}
            Entry::Marked => self.posted.push("haptic:impact-light".into()),
            Entry::Wrong => {
                self.shake[cell.0][cell.1] = at;
                self.posted.push("haptic:error".into());
            }
            Entry::Right(units) => {
                if units.is_empty() {
                    self.posted.push("haptic:impact-light".into());
                } else {
                    for u in units {
                        for (r, c) in unit_cells(u) {
                            let d = (r.abs_diff(cell.0) + c.abs_diff(cell.1)) as f64;
                            let start = at + d * WAVE_STEP_MS;
                            if self.wave[r][c].0 + WAVE_MS < start || self.wave[r][c].0 > start {
                                self.wave[r][c] = (start, 1.0);
                            }
                        }
                    }
                    self.posted.push("haptic:success".into());
                }
            }
            Entry::Solved => self.solve(cell, at),
        }
        self.report();
    }

    fn solve(&mut self, from: (usize, usize), at: f64) {
        self.solved_at = Some(at);
        self.game.selected = None;
        for i in 0..81usize {
            let (r, c) = (i / 9, i % 9);
            let d = (r.abs_diff(from.0) + c.abs_diff(from.1)) as f64;
            self.wave[r][c] = (at + d * SOLVE_STEP_MS, 1.6);
        }
        let mut t = at;
        for (message, wait) in CELEBRATION {
            self.due.push(Due { at: t, message });
            t += wait;
        }
        self.due.push(Due {
            at: at + GENIUS_MS,
            message: "alert:genius",
        });
        self.posted.push("solved".into());
    }

    fn fire(&mut self, now: f64) {
        let mut i = 0;
        while i < self.due.len() {
            if self.due[i].at <= now {
                let d = self.due.remove(i);
                self.posted.push(d.message.into());
            } else {
                i += 1;
            }
        }
    }

    fn elapsed(&self, now: f64) -> f64 {
        match self.started {
            Some(s) => (self.solved_at.unwrap_or(now) - s).max(0.0),
            None => 0.0,
        }
    }

    /// Draws everything; true while something on the board moves.
    fn record(&mut self, now: f64) -> bool {
        let (w, h, s) = self.size;
        let mut moving = false;
        let b = self.board;
        let cell = b.cell();
        if self.fonts.as_ref().is_none_or(|f| f.cell != cell) {
            self.fonts = Fonts::new(cell);
        }
        let c = &mut self.canvas;
        c.begin(s);
        for &(r0, r1, col) in &self.gradient {
            c.draw_rect(
                0.0,
                r0 as f32 / s,
                w,
                (r1 - r0) as f32 / s,
                &Paint::fill(Color::rgb8(col[0], col[1], col[2])),
            );
        }
        let _ = h;
        let since = now - self.started.unwrap_or(now);
        // The board's lines and fill fade in with the first cells.
        let frame_a = ease_out((since / 200.0).clamp(0.0, 1.0)) as f32;
        moving |= since < 200.0;
        c.draw_continuous_rrect(
            b.left,
            b.top,
            b.size,
            b.size,
            BOARD_R,
            &Paint::fill(Color::hex(WHITE).alpha(BOARD_FILL_A * frame_a)),
        );

        // The tints, clipped to the board's corners.
        let g = &self.game;
        let sel = g.selected;
        let sel_value = sel.map_or(0, |(r, c)| g.board[r][c]);
        c.save();
        c.clip_continuous_rrect(b.left, b.top, b.size, b.size, BOARD_R);
        for i in 0..81 {
            let (r, col) = (i / 9, i % 9);
            let (x, y) = (b.left + col as f32 * cell, b.top + r as f32 * cell);
            let mut tints: [(u32, f32); 4] = [(0, 0.0); 4];
            if let Some(sc) = sel {
                if sc == (r, col) {
                    tints[0] = (BLUE, SELECTED_A);
                } else if sel_value != 0 && g.board[r][col] == sel_value {
                    tints[0] = (BLUE, SAME_A);
                } else if peers(sc, (r, col)) {
                    tints[0] = (WHITE, PEER_A);
                }
            }
            let (wave_at, k) = self.wave[r][col];
            let p = (now - wave_at) / WAVE_MS;
            if (0.0..1.0).contains(&p) {
                tints[1] = (BLUE, 0.30 * k.min(1.0) * bump(p));
                moving = true;
            } else if p < 0.0 {
                moving = true;
            }
            let t = now - self.shake[r][col];
            if (0.0..SHAKE_MS).contains(&t) {
                tints[2] = (RED, 0.22 * (1.0 - (t / SHAKE_MS) as f32));
                moving = true;
            }
            for (hex, a) in tints {
                if a > 0.0 {
                    c.draw_rect(
                        x,
                        y,
                        cell,
                        cell,
                        &Paint::fill(Color::hex(hex).alpha(a * frame_a)),
                    );
                }
            }
        }
        // The selected cell's ring, over its tint.
        if let Some((r, col)) = sel {
            let (x, y) = (
                b.left + col as f32 * cell + RING_INSET,
                b.top + r as f32 * cell + RING_INSET,
            );
            let side = cell - 2.0 * RING_INSET;
            c.draw_with(&Paint::fill(Color::hex(BLUE).alpha(frame_a)), |p| {
                skia::add_continuous_rrect(p, x, y, side, side, RING_R);
                skia::add_continuous_rrect_hole(
                    p,
                    x + RING,
                    y + RING,
                    side - 2.0 * RING,
                    side - 2.0 * RING,
                    RING_R - RING,
                );
            });
        }
        c.restore();

        // The cell lines (one device pixel) and the box lines, on the pixel grid.
        let snap = |v: f32| (v * s).round() / s;
        let hair = 1.0 / s;
        for i in 1..9 {
            let (width, a) = if i % 3 == 0 {
                (BOX_LINE, BOX_LINE_A)
            } else {
                (hair, CELL_LINE_A)
            };
            let paint = Paint::fill(Color::hex(WHITE).alpha(a * frame_a));
            let x = snap(b.left + i as f32 * cell - width / 2.0);
            let y = snap(b.top + i as f32 * cell - width / 2.0);
            c.draw_rect(x, b.top, width, b.size, &paint);
            c.draw_rect(b.left, y, b.size, width, &paint);
        }
        let ring = Color::hex(WHITE).alpha(BOX_LINE_A * frame_a);
        c.draw_with(&Paint::fill(ring), |p| {
            skia::add_continuous_rrect(p, b.left, b.top, b.size, b.size, BOARD_R);
            skia::add_continuous_rrect_hole(
                p,
                b.left + BOX_LINE,
                b.top + BOX_LINE,
                b.size - 2.0 * BOX_LINE,
                b.size - 2.0 * BOX_LINE,
                BOARD_R - BOX_LINE,
            );
        });

        // The digits and pencil marks.
        let Some(f) = self.fonts.as_ref() else {
            return moving;
        };
        for i in 0..81 {
            let (r, col) = (i / 9, i % 9);
            let delay = (r + col) as f64 * MOUNT_STEP_MS;
            let fade = ease_out(((since - delay) / MOUNT_FADE_MS).clamp(0.0, 1.0)) as f32;
            if fade < 1.0 {
                moving = true;
            }
            if fade <= 0.0 {
                continue;
            }
            let (x, y) = (b.left + col as f32 * cell, b.top + r as f32 * cell);
            let (cx, cy) = (x + cell / 2.0, y + cell / 2.0);
            let v = g.board[r][col];
            if v != 0 {
                let given = g.initial[r][col] != 0;
                let (font, centre, hex) = if given {
                    (&f.given, f.centres[0][v as usize], WHITE)
                } else if g.wrong(r, col) {
                    (&f.user, f.centres[1][v as usize], RED)
                } else {
                    (&f.user, f.centres[1][v as usize], BLUE)
                };
                let (wave_at, k) = self.wave[r][col];
                let p = (now - wave_at) / WAVE_MS;
                let grow = if (0.0..1.0).contains(&p) {
                    0.13 * k * bump(p)
                } else {
                    0.0
                };
                let t = now - self.shake[r][col];
                let dx = if (0.0..SHAKE_MS).contains(&t) {
                    let q = t / SHAKE_MS;
                    SHAKE_PX
                        * ((q * SHAKE_SWINGS * std::f64::consts::PI).sin() * (1.0 - q).powi(2))
                            as f32
                } else {
                    0.0
                };
                c.save();
                c.translate(cx + dx, cy);
                if grow > 0.0 {
                    c.scale(1.0 + grow, 1.0 + grow);
                }
                c.draw_text(
                    &DIGITS[v as usize],
                    -centre.0,
                    -centre.1,
                    font,
                    &Paint::fill(Color::hex(hex).alpha(fade)),
                );
                c.restore();
            } else if g.notes[r][col] != 0 {
                // The marks on a 3 × 3 grid pulled in from the cell's lines.
                let step = cell * 0.29;
                for d in 1..=9u8 {
                    if g.notes[r][col] & (1 << d) == 0 {
                        continue;
                    }
                    let k = (d - 1) as f32;
                    let nx = cx + (k % 3.0 - 1.0) * step;
                    let ny = cy + ((k / 3.0).floor() - 1.0) * step;
                    let strong = d == sel_value;
                    let (font, centre, hex) = if strong {
                        (&f.note_strong, f.centres[3][d as usize], BLUE)
                    } else {
                        (&f.note, f.centres[2][d as usize], SECONDARY)
                    };
                    c.draw_text(
                        &DIGITS[d as usize],
                        nx - centre.0,
                        ny - centre.1,
                        font,
                        &Paint::fill(Color::hex(hex).alpha(fade)),
                    );
                }
            }
        }
        moving
    }
}

const DIGITS: [&str; 10] = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/// A pulse over p in [0, 1): 0 → 1 → 0, smooth at both ends.
fn bump(p: f64) -> f32 {
    let s = (p * std::f64::consts::PI).sin();
    (s * s) as f32
}

/// Ease-out cubic.
fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// The gradient's runs of equal device rows, each channel error-diffused down the rows (so the
/// 8-bit steps dissolve into one-level alternations, invisible at 3×): (first row, end, colour).
fn gradient_rows(h: f32, scale: f32, from: u32, to: u32) -> Vec<(i32, i32, [u8; 3])> {
    let rows = (h * scale).round() as i32;
    let ch = |v: u32, k: u32| ((v >> k) & 0xFF) as f32;
    let mut err = [0.0f32; 3];
    let mut runs: Vec<(i32, i32, [u8; 3])> = Vec::new();
    for r in 0..rows {
        let t = ((r as f32 + 0.5) / scale / h).clamp(0.0, 1.0);
        let mut color = [0u8; 3];
        for (k, shift) in [16, 8, 0].into_iter().enumerate() {
            let v = ch(from, shift) + (ch(to, shift) - ch(from, shift)) * t;
            let q = (v + err[k]).round().clamp(0.0, 255.0);
            err[k] += v - q;
            color[k] = q as u8;
        }
        match runs.last_mut() {
            Some(last) if last.2 == color => last.1 = r + 1,
            _ => runs.push((r, r + 1, color)),
        }
    }
    runs
}

impl Surface for Sudoku {
    fn max_fps(&self) -> u32 {
        self.fps
    }

    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize, or: f64| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(or);
        let (seed, reset, ok) = (n(0, 0.0), n(1, 0.0), n(2, 0.0));
        if !self.seeded {
            self.seeded = true;
            self.rng = Random::new(seed);
            self.tokens = (reset, ok, n(7, 0.0));
            self.new_game();
        }
        let size = n(5, 0.0);
        if size > 0.0 {
            self.board = Board {
                left: n(3, 16.0) as f32,
                top: n(4, 160.0) as f32,
                size: size as f32,
            };
        }
        self.notes_on = n(8, 0.0) != 0.0;
        let (r0, o0, t0) = self.tokens;
        let token = n(7, 0.0);
        self.tokens = (reset, ok, token);
        if reset != r0 || ok != o0 {
            self.new_game();
        } else if token != t0 {
            self.command(n(6, 0.0) as u8);
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { phase, x, y, .. } = *event else {
            return;
        };
        // The selection follows the finger down, on the touch (no wait for the lift).
        if phase == PointerPhase::Down && self.solved_at.is_none() {
            if let Some(cell) = self.board.at(x, y) {
                self.select(cell);
            }
        }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let g = &self.game;
        let grid =
            |m: &Grid| -> String { m.iter().flatten().map(|&v| char::from(b'0' + v)).collect() };
        let (sr, sc) = g.selected.map_or((-1, -1), |(r, c)| (r as i32, c as i32));
        Some(format!(
            "{{\"board\":\"{}\",\"solution\":\"{}\",\"selected\":[{sr},{sc}],\"mistakes\":{},\"remain\":\"{}\",\"notes\":{},\"solved\":{},\"seconds\":{}}}",
            grid(&g.board),
            grid(&g.solution),
            g.mistakes,
            self.sent_remain,
            self.notes_on,
            self.solved_at.is_some(),
            (self.elapsed(self.now) / 1000.0).floor()
        ))
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
        if !self.seeded {
            let _ = self.bind(&[], None);
        }
        self.now = now;
        let size = (frame.width, frame.height, frame.scale);
        if self.size != size {
            self.size = size;
            self.gradient = gradient_rows(size.1, size.2, BACKGROUND, SURFACE);
        }
        if self.started.is_none() {
            self.started = Some(now);
        }
        self.fire(now);
        // The clock, once a second while the puzzle is open.
        let secs = (self.elapsed(now) / 1000.0).floor() as i64;
        if secs != self.sent_time {
            self.sent_time = secs;
            self.posted.push(format!("time:{secs}"));
        }
        let moving = self.record(now);
        let (pw, ph) = frame.pixels();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        if moving || !self.due.is_empty() {
            self.fps = 0;
            return true;
        }
        if self.solved_at.is_none() {
            // Only the clock waits: wake at its next second, not 120 times a second.
            let left = 1000.0 - self.elapsed(now) % 1000.0;
            self.fps = (1000.0 / left.max(1.0)).ceil().clamp(1.0, 120.0) as u32;
            return true;
        }
        self.fps = 0;
        false
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    const W: f32 = 420.0;
    const H: f32 = 912.0;
    const LEFT: f32 = 16.0;
    const TOP: f32 = 170.0;
    const SIZE: f32 = 388.0;

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

    fn inputs(reset: f64, cmd: f64, token: f64, notes: bool) -> Vec<Value> {
        [
            7.0,
            reset,
            0.0,
            LEFT as f64,
            TOP as f64,
            SIZE as f64,
            cmd,
            token,
            notes as u8 as f64,
        ]
        .map(Value::Number)
        .to_vec()
    }

    struct Driver {
        s: Sudoku,
        token: f64,
        notes: bool,
    }

    impl Driver {
        fn new() -> Driver {
            let mut s = Sudoku::new();
            s.size(W, H);
            s.bind(&inputs(0.0, 0.0, 0.0, false), Some(0.0)).unwrap();
            Driver {
                s,
                token: 0.0,
                notes: false,
            }
        }

        fn press(&mut self, cmd: u8) -> Vec<String> {
            self.token += 1.0;
            self.s
                .bind(&inputs(0.0, cmd as f64, self.token, self.notes), None)
                .unwrap();
            self.s.messages()
        }

        fn notes(&mut self, on: bool) {
            self.notes = on;
            self.s
                .bind(&inputs(0.0, 0.0, self.token, on), None)
                .unwrap();
        }

        fn tap(&mut self, (r, c): (usize, usize)) -> Vec<String> {
            let cell = SIZE / 9.0;
            let (x, y) = (
                LEFT + (c as f32 + 0.5) * cell,
                TOP + (r as f32 + 0.5) * cell,
            );
            self.s.input(&InputEvent::Pointer {
                id: 1,
                phase: PointerPhase::Down,
                x,
                y,
                dx: 0.0,
                dy: 0.0,
                kind: PointerKind::Touch,
                buttons: 1,
                at_ms: 0.0,
            });
            self.s.messages()
        }

        fn empty(&self) -> Vec<(usize, usize)> {
            (0..81)
                .map(|i| (i / 9, i % 9))
                .filter(|&(r, c)| self.s.game.board[r][c] == 0)
                .collect()
        }

        fn answer(&self, (r, c): (usize, usize)) -> u8 {
            self.s.game.solution[r][c]
        }

        fn wrong_for(&self, cell: (usize, usize)) -> u8 {
            (1..=9).find(|&d| d != self.answer(cell)).unwrap()
        }
    }

    #[test]
    fn the_puzzle_has_45_holes_and_one_solution() {
        let d = Driver::new();
        let g = &d.s.game;
        assert_eq!(d.empty().len(), 45);
        let mut probe = g.initial;
        let mut n = 0;
        count_solutions(&mut probe, &mut n);
        assert_eq!(n, 1);
        for i in 0..81 {
            let (r, c) = (i / 9, i % 9);
            assert!(is_valid_move(&g.solution, r, c, g.solution[r][c]));
        }
    }

    #[test]
    fn a_cell_selects_on_the_touch_with_a_selection_tick() {
        let mut d = Driver::new();
        let _ = d.s.messages();
        assert_eq!(d.tap((2, 3)), vec!["haptic:selection"]);
        assert_eq!(d.s.game.selected, Some((2, 3)));
        // The same cell again: no second tick.
        assert!(d.tap((2, 3)).is_empty());
        // Outside the board: nothing.
        d.s.input(&InputEvent::Pointer {
            id: 1,
            phase: PointerPhase::Down,
            x: 200.0,
            y: 40.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms: 0.0,
        });
        assert_eq!(d.s.game.selected, Some((2, 3)));
    }

    #[test]
    fn a_right_digit_is_light_a_wrong_one_an_error_with_a_shake() {
        let mut d = Driver::new();
        let cell = d.empty()[0];
        d.tap(cell);
        let wrong = d.wrong_for(cell);
        let m = d.press(wrong);
        assert!(m.contains(&"haptic:error".to_string()), "{m:?}");
        assert!(m.contains(&"mistakes:1".to_string()), "{m:?}");
        assert!(d.s.shake[cell.0][cell.1].is_finite());
        assert!(d.s.game.wrong(cell.0, cell.1));
        let before = d.s.game.remaining();
        let right = d.answer(cell);
        let m = d.press(right);
        assert!(
            m.contains(&"haptic:impact-light".to_string())
                || m.contains(&"haptic:success".to_string()),
            "{m:?}"
        );
        assert_eq!(
            d.s.game.remaining()[right as usize - 1],
            before[right as usize - 1] - 1
        );
        assert!(m.iter().any(|x| x.starts_with("remain:")));
        // A placed right digit stays put.
        assert!(d.press(d.wrong_for(cell)).is_empty());
    }

    #[test]
    fn givens_take_no_entry() {
        let mut d = Driver::new();
        let given = (0..81)
            .map(|i| (i / 9, i % 9))
            .find(|&(r, c)| d.s.game.initial[r][c] != 0)
            .unwrap();
        d.tap(given);
        let board = d.s.game.board;
        assert!(d.press(d.wrong_for(given)).is_empty());
        assert!(d.press(CMD_ERASE).is_empty());
        assert_eq!(d.s.game.board, board);
    }

    #[test]
    fn notes_toggle_and_a_right_digit_clears_them_from_its_peers() {
        let mut d = Driver::new();
        let empty = d.empty();
        let a = empty[0];
        let digit = d.answer(a);
        // A peer of `a` that is empty, marked with the same digit.
        let b = *empty
            .iter()
            .find(|&&p| p != a && peers(p, a))
            .expect("an empty peer");
        d.notes(true);
        d.tap(b);
        assert_eq!(d.press(digit), vec!["haptic:impact-light"]);
        assert_eq!(d.s.game.notes[b.0][b.1], 1 << digit);
        d.press(digit);
        assert_eq!(d.s.game.notes[b.0][b.1], 0);
        d.press(digit);
        d.notes(false);
        d.tap(a);
        d.press(digit);
        assert_eq!(
            d.s.game.notes[b.0][b.1], 0,
            "the peer's mark went with the right digit"
        );
        // Undo brings the mark back with the empty cell.
        d.press(CMD_UNDO);
        assert_eq!(d.s.game.board[a.0][a.1], 0);
        assert_eq!(d.s.game.notes[b.0][b.1], 1 << digit);
    }

    #[test]
    fn erase_and_undo() {
        let mut d = Driver::new();
        let cell = d.empty()[0];
        d.tap(cell);
        d.press(d.wrong_for(cell));
        assert_eq!(d.press(CMD_ERASE), vec!["haptic:impact-light"]);
        assert_eq!(d.s.game.board[cell.0][cell.1], 0);
        d.press(CMD_UNDO);
        assert!(d.s.game.wrong(cell.0, cell.1));
        d.press(CMD_UNDO);
        assert_eq!(d.s.game.board[cell.0][cell.1], 0);
        // The mistake stays counted.
        assert_eq!(d.s.game.mistakes, 1);
        assert!(d.press(CMD_UNDO).is_empty());
    }

    #[test]
    fn a_completed_unit_plays_success_and_a_wave() {
        let mut d = Driver::new();
        // The unit with the fewest holes; fill all but its last hole, then the last.
        let u = (0..27)
            .min_by_key(|&u| {
                let n = unit_cells(u)
                    .iter()
                    .filter(|&&(r, c)| d.s.game.board[r][c] == 0)
                    .count();
                if n == 0 {
                    99
                } else {
                    n
                }
            })
            .unwrap();
        let holes: Vec<_> = unit_cells(u)
            .into_iter()
            .filter(|&(r, c)| d.s.game.board[r][c] == 0)
            .collect();
        let (last, rest) = holes.split_last().unwrap();
        for &cell in rest {
            d.tap(cell);
            d.press(d.answer(cell));
        }
        d.tap(*last);
        let m = d.press(d.answer(*last));
        assert!(m.contains(&"haptic:success".to_string()), "{m:?}");
        for (r, c) in unit_cells(u) {
            assert!(d.s.wave[r][c].0.is_finite(), "every cell of the unit waves");
        }
    }

    #[test]
    fn the_last_digit_celebrates_then_asks() {
        let mut d = Driver::new();
        let empty = d.empty();
        for &cell in &empty {
            d.tap(cell);
            d.press(d.answer(cell));
        }
        assert!(d.s.solved_at.is_some());
        let mut all = Vec::new();
        let mut t = 0.0;
        while t < 2000.0 {
            d.s.fire(t);
            all.extend(d.s.messages());
            t += 10.0;
        }
        let haptics: Vec<_> = all.iter().filter(|m| m.starts_with("haptic:")).collect();
        assert_eq!(haptics.len(), CELEBRATION.len());
        assert_eq!(haptics.last().unwrap().as_str(), "haptic:success");
        assert!(all.contains(&"alert:genius".to_string()));
        // New Game: a fresh puzzle.
        d.s.bind(&inputs(1.0, 0.0, d.token, false), None).unwrap();
        assert!(d.s.solved_at.is_none());
        assert_eq!(d.empty().len(), 45);
    }

    #[test]
    fn the_clock_ticks_once_a_second_and_rests_between() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut s = Sudoku::new();
        s.size(W, H);
        s.bind(&inputs(0.0, 0.0, 0.0, false), Some(0.0)).unwrap();
        let mut t = 0.0;
        let mut times = Vec::new();
        while t < 3100.0 {
            fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            times.extend(s.messages().into_iter().filter(|m| m.starts_with("time:")));
            t += 1000.0 / 120.0;
        }
        assert_eq!(times, vec!["time:0", "time:1", "time:2", "time:3"]);
        // At rest (the fade done) only the clock wakes it: a low frame rate.
        assert!(s.max_fps() > 0 && s.max_fps() < 120, "{}", s.max_fps());
    }

    fn out(name: &str, img: &fixture::Pixels) {
        if let Some(p) = img.save(name) {
            eprintln!("wrote {}", p.display());
        }
    }

    /// The board's states, rendered (`EXACT_GPU_OUT=<dir>`): rest, a selection, a pencil-marked
    /// cell and an entry, a wrong digit mid-shake, a unit's wave and the solved board's wave.
    #[test]
    fn renders_the_board_states() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut d = Driver::new();
        let mut t = 0.0;
        let run = |s: &mut Sudoku, until: f64, t: &mut f64| -> fixture::Pixels {
            loop {
                let (img, _) = fixture::render(&gpu, s, &frame(*t)).unwrap();
                if *t >= until {
                    return img;
                }
                *t += 1000.0 / 120.0;
            }
        };
        let rest = run(&mut d.s, 600.0, &mut t);
        out("sudoku-1-rest", &rest);
        let px = |img: &fixture::Pixels, (r, c): (usize, usize), fx: f32, fy: f32| {
            let cell = SIZE / 9.0;
            let x = ((LEFT + (c as f32 + fx) * cell) * 3.0) as u32;
            let y = ((TOP + (r as f32 + fy) * cell) * 3.0) as u32;
            img.at(x, y)
        };
        // A given digit is white ink at its centre column somewhere; the box line is brighter than
        // a cell line.
        let box_line = rest.at(
            ((LEFT + 3.0 * SIZE / 9.0) * 3.0) as u32,
            ((TOP + SIZE / 18.0) * 3.0) as u32,
        );
        let cell_line = rest.at(
            ((LEFT + SIZE / 9.0) * 3.0).round() as u32,
            ((TOP + SIZE / 18.0) * 3.0) as u32,
        );
        assert!(
            box_line[0] > cell_line[0] + 20,
            "{box_line:?} vs {cell_line:?}"
        );

        // Select an empty cell whose box holds the same number elsewhere as a given.
        let empty = d.empty();
        let cell = empty[empty.len() / 2];
        d.tap(cell);
        let sel = run(&mut d.s, t + 20.0, &mut t);
        out("sudoku-2-selection", &sel);
        let at_sel = px(&sel, cell, 0.12, 0.12);
        let at_rest = px(&rest, cell, 0.12, 0.12);
        assert!(
            at_sel[2] > at_rest[2] + 30,
            "the selected cell is blue: {at_sel:?} vs {at_rest:?}"
        );

        // Pencil marks in another empty cell, then a right entry in the selected one.
        let other = *empty
            .iter()
            .find(|&&p| p != cell && !peers(p, cell))
            .unwrap();
        d.notes(true);
        d.tap(other);
        for k in [1, 5, 9] {
            d.press(k);
        }
        d.notes(false);
        d.tap(cell);
        d.press(d.answer(cell));
        let entry = run(&mut d.s, t + 700.0, &mut t);
        out("sudoku-3-entry", &entry);

        // A wrong digit, mid-shake.
        let wrong_cell = *d.empty().iter().find(|&&p| p != other).unwrap();
        d.tap(wrong_cell);
        d.press(d.wrong_for(wrong_cell));
        let shake = run(&mut d.s, t + 60.0, &mut t);
        out("sudoku-4-error", &shake);
        let settled = run(&mut d.s, t + 600.0, &mut t);
        out("sudoku-4b-error-settled", &settled);
        let red = settled.count(|p| p[0] > 200 && p[1] < 120 && p[2] < 110);
        assert!(red > 50, "the wrong digit is red: {red}");
        d.press(CMD_ERASE);

        // A unit completed: its wave mid-way.
        let u = (0..27)
            .filter(|&u| !d.s.game.unit_done(u))
            .min_by_key(|&u| {
                unit_cells(u)
                    .iter()
                    .filter(|&&(r, c)| !d.s.game.right(r, c))
                    .count()
            })
            .unwrap();
        for (r, c) in unit_cells(u) {
            if !d.s.game.right(r, c) {
                d.tap((r, c));
                d.press(d.answer((r, c)));
            }
        }
        let wave = run(&mut d.s, t + 200.0, &mut t);
        out("sudoku-5-wave", &wave);
        run(&mut d.s, t + 800.0, &mut t);

        // The rest: solved, its wave across the board.
        for cell in d.empty() {
            d.tap(cell);
            d.press(d.answer(cell));
        }
        for (r, c) in (0..81).map(|i| (i / 9, i % 9)) {
            if d.s.game.wrong(r, c) {
                d.tap((r, c));
                d.press(d.answer((r, c)));
            }
        }
        assert!(d.s.solved_at.is_some());
        let solved = run(&mut d.s, t + 320.0, &mut t);
        out("sudoku-6-solved-wave", &solved);
        let done = run(&mut d.s, t + 1600.0, &mut t);
        out("sudoku-7-solved", &done);
        let (_, moving) = fixture::render(&gpu, &mut d.s, &frame(t + 2000.0)).unwrap();
        assert!(!moving, "a solved board rests");
    }
}
