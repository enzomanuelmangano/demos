//! Sudoku: a 9 x 9 board whose cells fade in on a diagonal, with a number pad, Undo, Erase and
//! Notes driven from the Contract. A cell selects, the pad fills it, a solved board plays the
//! celebration and asks "Genius!".
//!
//! Two surfaces: `backdrop` draws the screen's dithered gradient behind the Contract's views, and
//! `surface` is the board alone (border, cells, digits, pencil marks), alive from Start to New Game.
//!
//! - Inputs, in bind order: `seed` (a new value is a new puzzle), `cmd` and `token` (the pad: 1-9 a
//!   digit, 10 Erase, 11 Undo, 12 solve, applied once per new token), `notes` (1 while pencil marks are on).
//! - Messages: `remain:<nine digits>` (how many of each number are left), `hl:<n>` (the selected
//!   number, 0 for none), `pad` (the pad appears), `solved`, `alert:genius`, and `haptic:<kind>`.
//! - Haptics: selection on a cell, light on an entry, success when a row, column or box completes,
//!   error on a wrong digit, and a celebration at the end (light x3, medium x3, heavy x2, success).
//! - Givens are slate, the user's digits white, a wrong one red with a short shake. A selected
//!   empty cell takes a blue tint; every cell holding the selected number gets a springing circle.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use draw2d::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx::Random;

/// The board surface (inputs and messages in the module docs).
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sudoku::new())
}

/// The screen's gradient, behind everything.
pub fn backdrop() -> Box<dyn Surface> {
    Box::new(Backdrop::default())
}

// ---------------------------------------------------------------------------------------------
// Look.

/// The gradient's top colour and the card's colour.
const BACKGROUND: u32 = 0x0A1222;
const SURFACE: u32 = 0x121D33;
const PRIMARY: u32 = 0x3B82F6;
const PRIMARY_LIGHT: u32 = 0x60A5FA;
/// Cell lines, given digits and pencil marks.
const MUTED: u32 = 0x94A3B8;
const WHITE: u32 = 0xFFFFFF;
const ERROR: u32 = 0xDC2626;

/// The board's corner radius and border width, pt.
const BOARD_R: f32 = 8.0;
const BORDER: f32 = 2.0;
/// Each cell's own edge, and the thicker one on the right and bottom of every third.
const LINE: f32 = 0.5;
const THIRD: f32 = 2.0;
const LINE_A: f32 = 0.25;
const THIRD_A: f32 = 80.0 / 255.0;
/// The selected empty cell's tint, and the circle on the cells of the selected number.
const SELECTED_A: f32 = 0.25;
const CIRCLE_A: f32 = 0.35;

/// The board's border fades in over this long at Start.
const FRAME_MS: f64 = 200.0;
/// The cells begin after this, each fading over `FADE_MS` and starting `STEP_MS` later per step
/// of row + column; the pad appears `PAD_MS` after Start.
const REVEAL_MS: f64 = 600.0;
const STEP_MS: f64 = 75.0;
const FADE_MS: f64 = 350.0;
const PAD_MS: f64 = 2200.0;
/// The selected-number circle: spring rate per ms, opacity fade, and when it counts as at rest.
const CIRCLE_RATE: f64 = 15.0 / 1000.0;
const CIRCLE_FADE_MS: f64 = 150.0;
const CIRCLE_REST_MS: f64 = 700.0;
/// A wrong digit's shake: length, amplitude (pt) and half-swings.
const SHAKE_MS: f64 = 420.0;
const SHAKE_PX: f32 = 5.0;
const SHAKE_SWINGS: f64 = 6.0;
/// A completed unit's wave: each cell's pulse and the delay per neighbour.
const WAVE_MS: f64 = 460.0;
const WAVE_STEP_MS: f64 = 38.0;
/// The solved board's wave: delay per cell of distance from the last entry.
const SOLVE_STEP_MS: f64 = 30.0;
/// Delay from solving to the Genius alert.
const GENIUS_MS: f64 = 1500.0;

/// The celebration: each haptic and the wait after it.
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
const CMD_SOLVE: u8 = 12;

// ---------------------------------------------------------------------------------------------
// The puzzle: 45 cells removed, a unique solution.

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

    /// The number in the selected cell (0 for none): what the pad and the circles light.
    fn highlighted(&self) -> u8 {
        self.selected.map_or(0, |(r, c)| self.board[r][c])
    }

    /// Every cell at its answer.
    fn fill(&mut self) {
        self.board = self.solution;
        self.notes = [[0; 9]; 9];
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
        let note = (cell * 0.25).round().max(8.0);
        let given = draw2d::match_ui_font(20.0, 500.0)?;
        let user = draw2d::match_ui_font(20.0, 600.0)?;
        let note_font = draw2d::match_ui_font(note, 500.0)?;
        let note_strong = draw2d::match_ui_font(note, 700.0)?;
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

/// A cell's selected-number circle: its scale and opacity easing from where they were toward
/// the new target (1 on, 0 off) from the moment it changed.
#[derive(Clone, Copy)]
struct Circle {
    from: (f32, f32),
    to: f32,
    at: f64,
}

impl Circle {
    const REST: Circle = Circle {
        from: (0.0, 0.0),
        to: 0.0,
        at: -1.0e9,
    };

    /// (scale, opacity, at rest).
    fn value(&self, now: f64) -> (f32, f32, bool) {
        let t = (now - self.at).max(0.0);
        let k = ((1.0 + CIRCLE_RATE * t) * (-CIRCLE_RATE * t).exp()) as f32;
        let scale = self.to + (self.from.0 - self.to) * k;
        let q = ease_in_out((t / CIRCLE_FADE_MS).min(1.0)) as f32;
        let opacity = self.from.1 + (self.to - self.from.1) * q;
        (scale, opacity, t >= CIRCLE_REST_MS)
    }

    fn aim(&mut self, to: f32, now: f64) {
        if to != self.to {
            let (s, o, _) = self.value(now);
            *self = Circle {
                from: (s, o),
                to,
                at: now,
            };
        }
    }
}

/// A timed event: a haptic of the celebration, the pad, or the Genius alert.
struct Due {
    at: f64,
    message: &'static str,
}

struct Sudoku {
    rng: Random,
    seeded: bool,
    seed: f64,
    token: f64,
    notes_on: bool,
    /// The board's side in points: its canvas.
    side: f32,
    game: Game,
    /// The first frame of this puzzle, where the reveal starts; None until drawn.
    started: Option<f64>,
    solved_at: Option<f64>,
    /// The last frame's time, which `bind` and the pointer stamp their work with (a pointer's
    /// `at_ms` is not on the frame clock).
    now: f64,
    shake: [[f64; 9]; 9],
    wave: [[(f64, f32); 9]; 9],
    circle: [[Circle; 9]; 9],
    due: Vec<Due>,
    posted: Vec<String>,
    sent_remain: String,
    sent_hl: i8,
    size: (f32, f32, f32),
    fonts: Option<Fonts>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Sudoku {
    fn new() -> Sudoku {
        Sudoku {
            rng: Random::new(0.0),
            seeded: false,
            seed: 0.0,
            token: 0.0,
            notes_on: false,
            side: 354.0,
            game: Game::new(([[0; 9]; 9], [[0; 9]; 9])),
            started: None,
            solved_at: None,
            now: 0.0,
            shake: [[f64::NEG_INFINITY; 9]; 9],
            wave: [[(f64::NEG_INFINITY, 0.0); 9]; 9],
            circle: [[Circle::REST; 9]; 9],
            due: Vec::new(),
            posted: Vec::new(),
            sent_remain: String::new(),
            sent_hl: -1,
            size: (0.0, 0.0, 0.0),
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
        self.circle = [[Circle::REST; 9]; 9];
        self.due.clear();
        self.sent_remain.clear();
        self.sent_hl = -1;
        self.report();
    }

    /// The cell under a point of the canvas.
    fn at(&self, x: f32, y: f32) -> Option<(usize, usize)> {
        let cell = self.side / 9.0;
        let (cx, cy) = (x / cell, y / cell);
        ((0.0..9.0).contains(&cx) && (0.0..9.0).contains(&cy)).then(|| (cy as usize, cx as usize))
    }

    /// The pad's state and the selected number, posted when they change.
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
        let hl = self.game.highlighted() as i8;
        if hl != self.sent_hl {
            self.posted.push(format!("hl:{hl}"));
            self.sent_hl = hl;
        }
    }

    fn select(&mut self, cell: (usize, usize)) {
        if self.game.selected != Some(cell) {
            self.game.selected = Some(cell);
            self.posted.push("haptic:selection".into());
            self.report();
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
            CMD_SOLVE => {
                self.game.fill();
                Entry::Solved
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

    /// Draws the board; true while something on it moves.
    fn record(&mut self, now: f64) -> bool {
        let s = self.size.2;
        let size = self.side;
        let cell = size / 9.0;
        if self.fonts.as_ref().is_none_or(|f| f.cell != cell) {
            self.fonts = Fonts::new(cell);
        }
        let since = now - self.started.unwrap_or(now);
        let cascading = since < REVEAL_MS + 16.0 * STEP_MS + FADE_MS;
        let mut moving = cascading;
        let frame_a = ease_in_out((since / FRAME_MS).clamp(0.0, 1.0)) as f32;
        let fade = |r: usize, c: usize| -> f32 {
            ease_in_out(((since - REVEAL_MS - (r + c) as f64 * STEP_MS) / FADE_MS).clamp(0.0, 1.0))
                as f32
        };

        let g = &self.game;
        let sel = g.selected;
        let hl = g.highlighted();
        for r in 0..9 {
            for c in 0..9 {
                let on = hl != 0 && g.board[r][c] == hl;
                self.circle[r][c].aim(if on { 1.0 } else { 0.0 }, now);
            }
        }

        let c = &mut self.canvas;
        c.begin(s);
        c.save();
        c.clip_continuous_rrect(0.0, 0.0, size, size, BOARD_R);
        for i in 0..81 {
            let (r, col) = (i / 9, i % 9);
            let f = fade(r, col);
            if f <= 0.0 {
                continue;
            }
            let (x, y) = (col as f32 * cell, r as f32 * cell);
            // The selected empty cell; a selected number takes circles instead.
            if sel == Some((r, col)) && hl == 0 {
                c.draw_rect(
                    x,
                    y,
                    cell,
                    cell,
                    &Paint::fill(Color::hex(PRIMARY).alpha(SELECTED_A * f)),
                );
            }
            let (scale, opacity, rest) = self.circle[r][col].value(now);
            if !rest {
                moving = true;
            }
            if scale > 0.001 && opacity > 0.001 {
                let d = cell * scale;
                c.draw_continuous_rrect(
                    x + (cell - d) / 2.0,
                    y + (cell - d) / 2.0,
                    d,
                    d,
                    d / 2.0,
                    &Paint::fill(
                        Color::hex(PRIMARY).alpha(CIRCLE_A * opacity * scale.min(1.0) * f),
                    ),
                );
            }
            // A unit's wave and a wrong digit's flash.
            let (wave_at, k) = self.wave[r][col];
            let p = (now - wave_at) / WAVE_MS;
            if (0.0..1.0).contains(&p) {
                c.draw_rect(
                    x,
                    y,
                    cell,
                    cell,
                    &Paint::fill(Color::hex(PRIMARY).alpha(0.30 * k.min(1.0) * bump(p) * f)),
                );
                moving = true;
            } else if p < 0.0 {
                moving = true;
            }
            let t = now - self.shake[r][col];
            if (0.0..SHAKE_MS).contains(&t) {
                c.draw_rect(
                    x,
                    y,
                    cell,
                    cell,
                    &Paint::fill(Color::hex(ERROR).alpha(0.22 * (1.0 - (t / SHAKE_MS) as f32) * f)),
                );
                moving = true;
            }
        }
        let fading: &dyn Fn(usize, usize) -> f32 = &fade;
        grid_lines(c, cell, cascading.then_some(fading));
        c.restore();

        // The border, over the cells' outer edges.
        c.draw_with(&Paint::fill(Color::hex(PRIMARY).alpha(frame_a)), |p| {
            draw2d::add_continuous_rrect(p, 0.0, 0.0, size, size, BOARD_R);
            draw2d::add_continuous_rrect_hole(
                p,
                BORDER,
                BORDER,
                size - 2.0 * BORDER,
                size - 2.0 * BORDER,
                BOARD_R - BORDER,
            );
        });

        // The digits and pencil marks.
        let Some(f) = self.fonts.as_ref() else {
            return moving;
        };
        for i in 0..81 {
            let (r, col) = (i / 9, i % 9);
            let fd = fade(r, col);
            if fd <= 0.0 {
                continue;
            }
            let (x, y) = (col as f32 * cell, r as f32 * cell);
            let (cx, cy) = (x + cell / 2.0, y + cell / 2.0);
            let v = g.board[r][col];
            if v != 0 {
                let (font, centre, hex) = if g.initial[r][col] != 0 {
                    (&f.given, f.centres[0][v as usize], MUTED)
                } else if g.wrong(r, col) {
                    (&f.user, f.centres[1][v as usize], ERROR)
                } else {
                    (&f.user, f.centres[1][v as usize], WHITE)
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
                    DIGITS[v as usize],
                    -centre.0,
                    -centre.1,
                    font,
                    &Paint::fill(Color::hex(hex).alpha(fd)),
                );
                c.restore();
            } else if g.notes[r][col] != 0 {
                // The marks on a 3 x 3 grid pulled in from the cell's lines.
                let step = cell * 0.29;
                for d in 1..=9u8 {
                    if g.notes[r][col] & (1 << d) == 0 {
                        continue;
                    }
                    let k = (d - 1) as f32;
                    let nx = cx + (k % 3.0 - 1.0) * step;
                    let ny = cy + ((k / 3.0).floor() - 1.0) * step;
                    let (font, centre, hex) = if d == hl {
                        (&f.note_strong, f.centres[3][d as usize], PRIMARY_LIGHT)
                    } else {
                        (&f.note, f.centres[2][d as usize], MUTED)
                    };
                    c.draw_text(
                        DIGITS[d as usize],
                        nx - centre.0,
                        ny - centre.1,
                        font,
                        &Paint::fill(Color::hex(hex).alpha(fd)),
                    );
                }
            }
        }
        moving
    }
}

const DIGITS: [&str; 10] = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/// A pulse over p in [0, 1): 0 -> 1 -> 0, smooth at both ends.
fn bump(p: f64) -> f32 {
    let s = (p * std::f64::consts::PI).sin();
    (s * s) as f32
}

/// Ease in and out, quadratic.
fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

/// The cell lines and the box lines. Each boundary is two pieces side by side, one belonging to
/// the cell before it (thicker and bluer on a box line) and one to the cell after; the
/// horizontal ones stop at the vertical ones, so no point is drawn twice. With `fade`, every
/// piece takes its cell's opacity, drawn per cell; without, whole lines.
fn grid_lines(c: &mut Canvas, cell: f32, fade: Option<&dyn Fn(usize, usize) -> f32>) {
    let size = cell * 9.0;
    let lo = |i: usize| match i {
        0 => 0.0,
        9 => size,
        _ => i as f32 * cell - if i % 3 == 0 { THIRD } else { LINE },
    };
    let hi = |i: usize| match i {
        0 => 0.0,
        9 => size,
        _ => i as f32 * cell + LINE,
    };
    let a = |r: usize, col: usize| fade.map_or(1.0, |f| f(r, col));
    for i in 1..9 {
        let p = i as f32 * cell;
        let third = i % 3 == 0;
        // (start, end, colour, alpha, the piece's cell offset along the cross axis)
        let pieces = [
            (
                lo(i),
                p,
                if third { PRIMARY } else { MUTED },
                if third { THIRD_A } else { LINE_A },
                1,
            ),
            (p, hi(i), MUTED, LINE_A, 0),
        ];
        for (from, to, hex, alpha, after) in pieces {
            let w = to - from;
            let idx = i - 1 + after;
            // The vertical piece, per row when fading.
            if fade.is_some() {
                for r in 0..9 {
                    let paint = Paint::fill(Color::hex(hex).alpha(alpha * a(r, idx)));
                    c.draw_rect(from, r as f32 * cell, w, cell, &paint);
                }
            } else {
                c.draw_rect(
                    from,
                    0.0,
                    w,
                    size,
                    &Paint::fill(Color::hex(hex).alpha(alpha)),
                );
            }
            // The horizontal piece, between the vertical ones.
            for col in 0..9 {
                let paint = Paint::fill(Color::hex(hex).alpha(alpha * a(idx, col)));
                c.draw_rect(hi(col), from, lo(col + 1) - hi(col), w, &paint);
            }
        }
    }
}

/// The gradient as runs of equal device rows, each channel error-diffused down the rows so 8-bit
/// banding dissolves: (first row, end, colour).
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
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        let (seed, cmd, token) = (n(0), n(1), n(2));
        self.notes_on = n(3) != 0.0;
        if !self.seeded || seed != self.seed {
            self.seeded = true;
            self.seed = seed;
            self.rng = Random::new(seed);
            self.token = token;
            self.new_game();
        } else if token != self.token {
            self.token = token;
            self.command(cmd as u8);
        }
        Ok(())
    }

    fn size(&mut self, width: f32, _height: f32) -> bool {
        let changed = self.side != width;
        self.side = width;
        changed
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { phase, x, y, .. } = *event else {
            return;
        };
        // Selects on touch-down, once the cells have appeared.
        let shown = self.started.is_some_and(|s| self.now - s >= REVEAL_MS);
        if phase == PointerPhase::Down && shown && self.solved_at.is_none() {
            if let Some(cell) = self.at(x, y) {
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
            "{{\"board\":\"{}\",\"solution\":\"{}\",\"selected\":[{sr},{sc}],\"mistakes\":{},\"remain\":\"{}\",\"notes\":{},\"solved\":{}}}",
            grid(&g.board),
            grid(&g.solution),
            g.mistakes,
            self.sent_remain,
            self.notes_on,
            self.solved_at.is_some(),
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
        self.side = frame.width;
        self.size = (frame.width, frame.height, frame.scale);
        if self.started.is_none() {
            self.started = Some(now);
            self.due.push(Due {
                at: now + PAD_MS,
                message: "pad",
            });
        }
        self.fire(now);
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
        moving || !self.due.is_empty()
    }
}

// ---------------------------------------------------------------------------------------------
// The backdrop.

#[derive(Default)]
struct Backdrop {
    gradient: Vec<(i32, i32, [u8; 3])>,
    size: (f32, f32, f32),
    canvas: Canvas,
    renderer: Renderer,
}

impl Surface for Backdrop {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
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
        let size = (frame.width, frame.height, frame.scale);
        if self.size != size {
            self.size = size;
            self.gradient = gradient_rows(size.1, size.2, BACKGROUND, SURFACE);
        }
        let c = &mut self.canvas;
        c.begin(size.2);
        for &(r0, r1, col) in &self.gradient {
            c.draw_rect(
                0.0,
                r0 as f32 / size.2,
                size.0,
                (r1 - r0) as f32 / size.2,
                &Paint::fill(Color::rgb8(col[0], col[1], col[2])),
            );
        }
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
        false
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    /// The board canvas's side, pt.
    const SIDE: f32 = 354.0;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: SIDE,
            height: SIDE,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn inputs(seed: f64, cmd: f64, token: f64, notes: bool) -> Vec<Value> {
        [seed, cmd, token, notes as u8 as f64]
            .map(Value::Number)
            .to_vec()
    }

    fn haptics(messages: Vec<String>) -> Vec<String> {
        messages
            .into_iter()
            .filter(|m| m.starts_with("haptic:"))
            .collect()
    }

    struct Driver {
        s: Sudoku,
        token: f64,
        notes: bool,
    }

    impl Driver {
        /// A puzzle whose reveal is over, so the cells take touches.
        fn new() -> Driver {
            let mut s = Sudoku::new();
            s.size(SIDE, SIDE);
            s.bind(&inputs(7.0, 0.0, 0.0, false), Some(0.0)).unwrap();
            s.started = Some(-REVEAL_MS - 1.0);
            Driver {
                s,
                token: 0.0,
                notes: false,
            }
        }

        fn press(&mut self, cmd: u8) -> Vec<String> {
            self.token += 1.0;
            self.s
                .bind(&inputs(7.0, cmd as f64, self.token, self.notes), None)
                .unwrap();
            self.s.messages()
        }

        fn notes(&mut self, on: bool) {
            self.notes = on;
            self.s
                .bind(&inputs(7.0, 0.0, self.token, on), None)
                .unwrap();
        }

        fn touch(&mut self, x: f32, y: f32) -> Vec<String> {
            self.s.input(&InputEvent::Pointer {
                id: 1,
                phase: PointerPhase::Down,
                x,
                y,
                dx: 0.0,
                dy: 0.0,
                kind: PointerKind::Touch,
                buttons: 1,
                at_ms: 0.0, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
            });
            self.s.messages()
        }

        fn tap(&mut self, (r, c): (usize, usize)) -> Vec<String> {
            let cell = SIDE / 9.0;
            self.touch((c as f32 + 0.5) * cell, (r as f32 + 0.5) * cell)
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
        assert_eq!(haptics(d.tap((2, 3))), vec!["haptic:selection"]);
        assert_eq!(d.s.game.selected, Some((2, 3)));
        // The same cell again: no second tick.
        assert!(d.tap((2, 3)).is_empty());
        // Outside the board: nothing.
        d.touch(SIDE + 5.0, 40.0);
        assert_eq!(d.s.game.selected, Some((2, 3)));
    }

    #[test]
    fn the_cells_take_no_touch_before_they_appear() {
        let mut d = Driver::new();
        d.s.started = Some(-100.0);
        let _ = d.s.messages();
        assert!(d.tap((2, 3)).is_empty());
        assert_eq!(d.s.game.selected, None);
    }

    #[test]
    fn the_pad_reports_the_selected_number() {
        let mut d = Driver::new();
        let given = (0..81)
            .map(|i| (i / 9, i % 9))
            .find(|&(r, c)| d.s.game.initial[r][c] != 0)
            .unwrap();
        let v = d.s.game.initial[given.0][given.1];
        assert!(d.tap(given).contains(&format!("hl:{v}")));
        let empty = d.empty()[0];
        assert!(d.tap(empty).contains(&"hl:0".to_string()));
        assert_eq!(d.s.game.highlighted(), 0);
    }

    #[test]
    fn a_right_digit_is_light_a_wrong_one_an_error_with_a_shake() {
        let mut d = Driver::new();
        let cell = d.empty()[0];
        d.tap(cell);
        let wrong = d.wrong_for(cell);
        let m = d.press(wrong);
        assert!(m.contains(&"haptic:error".to_string()), "{m:?}");
        assert_eq!(d.s.game.mistakes, 1);
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
        assert_eq!(haptics(d.press(digit)), vec!["haptic:impact-light"]);
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
        assert_eq!(haptics(d.press(CMD_ERASE)), vec!["haptic:impact-light"]);
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

    fn celebration(d: &mut Driver) -> Vec<String> {
        let mut all = Vec::new();
        let mut t = 0.0;
        while t < 2000.0 {
            d.s.fire(t);
            all.extend(d.s.messages());
            t += 10.0;
        }
        all
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
        let all = celebration(&mut d);
        let haptics: Vec<_> = all.iter().filter(|m| m.starts_with("haptic:")).collect();
        assert_eq!(haptics.len(), CELEBRATION.len());
        assert_eq!(haptics.last().unwrap().as_str(), "haptic:success");
        assert!(all.contains(&"alert:genius".to_string()));
        // A new seed: a fresh puzzle.
        d.s.bind(&inputs(8.0, 0.0, d.token, false), None).unwrap();
        assert!(d.s.solved_at.is_none());
        assert_eq!(d.empty().len(), 45);
    }

    #[test]
    fn the_title_solves_the_board() {
        let mut d = Driver::new();
        let m = d.press(CMD_SOLVE);
        assert!(m.contains(&"solved".to_string()), "{m:?}");
        assert!(d.s.game.solved());
        let all = celebration(&mut d);
        assert!(all.contains(&"alert:genius".to_string()));
    }

    #[test]
    fn the_circle_springs_in_and_out() {
        let mut c = Circle::REST;
        assert_eq!(c.value(0.0), (0.0, 0.0, true));
        c.aim(1.0, 100.0);
        let (s, o, rest) = c.value(150.0);
        assert!(s > 0.0 && s < 1.0 && o > 0.0 && o < 1.0 && !rest);
        let (s, o, rest) = c.value(100.0 + CIRCLE_REST_MS);
        assert!(s > 0.999 && o == 1.0 && rest);
        // Turned back mid-flight it leaves from where it is.
        c.aim(0.0, 1000.0);
        let (s, _, _) = c.value(1000.0);
        assert!((s - 1.0).abs() < 0.01);
        assert!(c.value(2000.0).0 < 0.001);
    }

    #[test]
    fn the_pad_comes_after_start_and_the_board_then_rests() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut s = Sudoku::new();
        s.size(SIDE, SIDE);
        s.bind(&inputs(7.0, 0.0, 0.0, false), Some(0.0)).unwrap();
        let mut t = 0.0;
        let mut pads = Vec::new();
        let mut moving = true;
        while t < PAD_MS + 600.0 {
            (_, moving) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            pads.extend(s.messages().into_iter().filter(|m| m == "pad").map(|_| t));
            t += 1000.0 / 120.0;
        }
        assert_eq!(pads.len(), 1);
        assert!(pads[0] >= PAD_MS && pads[0] < PAD_MS + 20.0, "{pads:?}");
        assert!(!moving, "a board at rest asks for no frames");
    }

    fn out(name: &str, img: &fixture::Pixels) {
        if let Some(p) = img.save(name) {
            eprintln!("wrote {}", p.display());
        }
    }

    /// The board's states, rendered (`EXACT_GPU_OUT=<dir>`): the cascade, rest, a selection,
    /// a pencil-marked cell and an entry, a wrong digit, a unit's wave and the solved board.
    #[test]
    fn renders_the_board_states() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut d = Driver::new();
        d.s.started = None;
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
        let cascade = run(&mut d.s, 1200.0, &mut t);
        out("sudoku-0-cascade", &cascade);
        let rest = run(&mut d.s, 2600.0, &mut t);
        out("sudoku-1-rest", &rest);
        let cell = SIDE / 9.0;
        let px = |img: &fixture::Pixels, (r, c): (usize, usize), fx: f32, fy: f32| {
            let x = ((c as f32 + fx) * cell * 3.0) as u32;
            let y = ((r as f32 + fy) * cell * 3.0) as u32;
            img.at(x, y)
        };
        // A box line is stronger than a cell line.
        let box_line = rest.at(
            ((3.0 * cell - 1.0) * 3.0) as u32,
            ((cell / 2.0) * 3.0) as u32,
        );
        let cell_line = rest.at(((cell - 0.25) * 3.0) as u32, ((cell / 2.0) * 3.0) as u32);
        assert!(box_line[3] > cell_line[3], "{box_line:?} vs {cell_line:?}");

        // Select an empty cell: it takes the blue tint.
        let empty = d.empty();
        let target = empty[empty.len() / 2];
        d.tap(target);
        let sel = run(&mut d.s, t + 20.0, &mut t);
        out("sudoku-2-selection", &sel);
        assert!(
            px(&sel, target, 0.12, 0.12)[3] > px(&rest, target, 0.12, 0.12)[3] + 30,
            "the selected cell is tinted"
        );

        // Pencil marks in another empty cell, then a right entry in the selected one: circles
        // on every cell of its number.
        let other = *empty
            .iter()
            .find(|&&p| p != target && !peers(p, target))
            .unwrap();
        d.notes(true);
        d.tap(other);
        for k in [1, 5, 9] {
            d.press(k);
        }
        d.notes(false);
        d.tap(target);
        d.press(d.answer(target));
        let entry = run(&mut d.s, t + 700.0, &mut t);
        out("sudoku-3-entry", &entry);
        let ring = px(&entry, target, 0.5, 0.1);
        assert!(ring[3] > 40, "the entry's circle is drawn: {ring:?}");

        // A wrong digit, then settled: red ink.
        let wrong_cell = *d.empty().iter().find(|&&p| p != other).unwrap();
        d.tap(wrong_cell);
        d.press(d.wrong_for(wrong_cell));
        let shake = run(&mut d.s, t + 60.0, &mut t);
        out("sudoku-4-error", &shake);
        let settled = run(&mut d.s, t + 600.0, &mut t);
        out("sudoku-4b-error-settled", &settled);
        let red = settled.count(|p| p[0] > 150 && p[1] < 90 && p[2] < 90 && p[3] > 200);
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
        // Drop the pending celebration events.
        d.s.due.clear();
        let (_, moving) = fixture::render(&gpu, &mut d.s, &frame(t + 2000.0)).unwrap();
        assert!(!moving, "a solved board rests");
    }
}
