//! Snake (src/animations/snake/src: index.tsx, snake-game/{index.tsx, snake-game.ts},
//! components/animated-count/{animated-count.tsx, animated-digit.tsx}): a white card holding a
//! "Score" label, an AnimatedCount of the score, and a 10 × 10 Skia board where a snake moves
//! every 120 ms, turned by four flings, growing on the food; when it bites itself a "Life goes
//! on..." button fades in over the board and restarts the game.
//!
//! The surface is the card's content (the canvas inside the card's padding, `boardSize` wide):
//! the label, the count and the board with its overlay. The card (white, radius 18 continuous,
//! boxShadow 0 2 10 rgba(92,92,92,0.2), padding 10) and the white screen are the Contract's.
//!
//! Layout (Yoga's numbers; an edge on the device-pixel grid from its unrounded absolute place,
//! a half rounding up): boardSize = floor(width × 0.7 / 10) × 10 (290 on a 420-pt window),
//! squareSize = floor(boardSize / 10). statsContainer (alignItems center, marginBottom 8): the
//! "Score" Text (gray, bold 18, marginBottom 4: TextKit's SF line, 21.48 pt, ceiled to the pixel
//! as RN measures text) over the count's row-reverse of three 21 × 30 digits. The card is centred
//! in the window, so the count's left (centred over boardSize) lands on the grid from the
//! window's width: the surface takes `width` and `height` for that and for the backdrop's grid.
//!
//! The game is snake-game.ts line for line ([`SnakeGame`]): rows = cols = 10, wrapping on, the
//! snake [(⌊W/2⌋, ⌊H/2⌋), (⌊W/2⌋ − sq, ⌊H/2⌋)] going RIGHT, the reversal rule against the
//! direction it last moved, food by 32 random picks and then a pick among the free cells.
//! `Math.random()` is [`gfx::Random`] seeded from the Contract's `env.seed` and the mount, so a
//! game differs between mounts and launches as RN's does.
//!
//! When things happen (RN's threads, as frames here):
//! - useFrameCallback (UI): skipped on its first frame (no timeSincePreviousFrame) and while the
//!   shown state is over; otherwise when timestamp − lastTimestamp > 120 (lastTimestamp starts at
//!   0, so the second frame ticks) it schedules updateGame on the JS thread and sets
//!   lastTimestamp. So a tick lands on the first frame more than 120 ms after the last (125 ms
//!   at 120 Hz, 133.3 ms at 60 Hz). updateGame (JS, right after that frame) moves the game and
//!   sets gameState, which reaches the UI thread before the next frame: the board shows the move
//!   one frame after the tick. A turn (JS too) applies to the next move whose JS runs after it.
//! - Reactions run in the frame's mapper pass: gameState's score (also on its first run, prev
//!   null) → scheduleOnRN(onScoreChange) → score.set: the count follows one frame later; its
//!   isGameOver → onGameOver → isGameOver.set(true): the overlay starts one frame later. So at
//!   mount the count, shown at useSharedValue(20)'s 20, rolls to 0 on the second frame.
//! - AnimatedDigit's reaction on its digit (first run included, prev null) sets isChanging true
//!   and schedules resetIsChanging, a setTimeout(200) on the JS thread: RCTTiming fires it on the
//!   first frame at or after its target, and isChanging = false reaches the UI the frame after.
//!   Animations started in a mapper pass start at that frame (their first value is where they
//!   are); a style re-run with an unchanged target goes on (Reanimated's triggered-twice spring,
//!   timing's same-target continuity).
//! - The press (pressto's PressableScale on RNGH 3.3's BaseButton): pressto 0.7 hands BaseButton
//!   onBegan/onActivated/onEnded, which RNGH 3's BaseButton never reads, so it never scales; its
//!   onPress runs at any uncancelled lift of a touch that began in its frame (JS:
//!   isGameOver.set(false), restart()), with the app's PressablesConfig haptic. The overlay takes
//!   the board's touches (pointerEvents auto) from the frame its style says game over.
//!
//! Drawing. The board canvas: RoundedRect (0, 0, rows·sq, cols·sq, r 10, #ebebec); the snake
//! Path, one addRRect(rrect(segment, sq/2, sq/2)) per segment (an oval: Skia's addOval from its
//! left, clockwise), #68DE45; the food, addRRect(rrect(food, sq, sq)) (clamped to the same
//! oval), #e75b5b. The `<BlurMask blur={gameOverBlurMask} />` is a direct child of `<Canvas>`: RN
//! Skia 3.7's sksg visits it as a root node of its own (Recorder/Visitor.ts visitNode: a
//! BlurMaskFilter node only pushes a mask filter into its PARENT's paint, and at the root there
//! is none; Canvas.tsx renders the children with no wrapping Group), so it filters nothing: RN
//! never blurs the board at game over, and neither does this. The count's digits are the ten
//! SF-Pro-Rounded-Bold 24 Texts (21 × 30, centred by their Core Text advance, the baseline at
//! the hhea ascent), the BlurView (tint light, intensity = progress × 10: skia::backdrop's
//! `Material::Light` at expo-blur's fraction, which never goes under 0.01, so a resting digit is
//! blurred by σ 0.3 pt), and the two LinearGradients; gpu/shaders/snake.wgsl composites them as
//! Core Animation does.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | snake, food, score | useFrameCallback, > 120 ms since the last tick, JS move, shown a frame later | [`SnakeDemo::advance`]: the same frames |
//! | overlay opacity | useAnimatedStyle withTiming(isGameOver ? 1 : 0, 250 ms), inOut(quad) (Reanimated's default easing) | `Timing` 250 ms, `Easing::timing_default()`, from the frame isGameOver lands |
//! | overlay pointerEvents | 'auto' when isGameOver, else 'none' | the overlay takes board touches from that frame |
//! | digit translateY | withSpring(−30 × digit, { mass 0.25, damping 10, stiffness 100 }): ζ = 1 | `Spring::retarget` with that config, critical |
//! | digit scaleX | withSpring(isChanging ? 0.7 : 1), the default (900, 120, 4) | `Spring::retarget(GENTLE)` |
//! | digit opacity | useDerivedValue withTiming(isVisible ? 1 : 0): 300 ms inOut(quad) | `Timing`, started when the target changes |
//! | digit translateX | withTiming(−21 × invisibleDigits / 2): 300 ms inOut(quad) | `Timing`, all three digits |
//! | isChanging | reaction on the digit (true), setTimeout 200 ms on JS (false) | true in the mapper pass, false the frame after the first frame ≥ +200 ms |
//! | blur intensity | withTiming(isChanging ? 1 : 0) × 10: 300 ms inOut(quad) | `Timing`, fraction = clamp(i / 100, 0.01, 1) of UIBlurEffect.light |
//! | board blur | withTiming(isGameOver ? 50 : 0, 1000 ms) on a root BlurMask | nothing (RN draws none, above) |
//! | button scale | pressto PressableScale: never scales (above) | none |
//! | haptics | onDirectionChange → selectionAsync at each fling's onStart (a refused reversal too); PressablesConfig on the restart press | `haptic:selection` at the recognising move and at the lift |

use std::collections::VecDeque;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use gesture_handler::{directions, FlingEvent, FlingGesture};
use reanimated::{Easing, Spring, SpringConfig, Timing, GENTLE};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx::{self, Random};
use crate::shaders::snake::{
    entry, module, Snake as Uniforms, BUTTON, DIGITS, EFFECT, GROUP_0, MAIN_LAYER, SMP, U,
};

/// SnakeBoard's `n` (rows = columns).
const N: i32 = 10;
/// useFrameCallback: a move when more than this has passed since the last.
const TICK_MS: f64 = 120.0;
/// styles.boardContainer padding.
const CARD_PADDING: f32 = 10.0;
/// styles.scoreText: fontSize 18, bold, marginBottom 4; styles.statsContainer marginBottom 8.
const SCORE_SIZE: f32 = 18.0;
const SCORE_MARGIN: f32 = 4.0;
const STATS_MARGIN: f32 = 8.0;
/// `<AnimatedCount maxDigits={3} fontSize={24} textDigitHeight={30} textDigitWidth={21}>`.
const MAX_DIGITS: usize = 3;
const DIGIT_W: f32 = 21.0;
const DIGIT_H: f32 = 30.0;
const DIGIT_SIZE: f32 = 24.0;
/// The board's RoundedRect r, and the Skia colours (sRGB).
const BOARD_RADIUS: f32 = 10.0;
const BOARD: u32 = 0xEBEBEC;
const SNAKE: u32 = 0x68DE45;
const FOOD: u32 = 0xE75B5B;
/// styles.scoreText color 'gray'.
const GRAY: u32 = 0x808080;
/// The restart button: padding 10, paddingHorizontal 20, borderRadius 10 continuous, black; its
/// Text white, 16, weight 500.
const LABEL: &str = "Life goes on...";
const LABEL_SIZE: f32 = 16.0;
const BUTTON_PAD_X: f32 = 20.0;
const BUTTON_PAD_Y: f32 = 10.0;
const BUTTON_RADIUS: f32 = 10.0;
/// rRestartButtonViewStyle's withTiming duration.
const OVERLAY_MS: f64 = 250.0;
/// resetIsChanging's setTimeout.
const RESET_MS: f64 = 200.0;
/// The digit's translateY spring: { mass: 0.25, damping: 10, stiffness: 100 } (ζ = 1).
const ROLL: SpringConfig = SpringConfig {
    stiffness: 100.0,
    damping: 10.0,
    mass: 0.25,
};
/// scaleX while the digit changes.
const SQUEEZE: f64 = 0.7;
/// blurIntensity = isChangingProgress × 10.
const BLUR_INTENSITY: f64 = 10.0;
/// TextKit's line of the system font (SF: (1950 + 494) / 2048 of the size), before RN ceils it.
const SF_LINE: f32 = (1950.0 + 494.0) / 2048.0;
/// assets/fonts/SF-Pro-Rounded-Bold.otf cut to the digits (fontTools subset: the same outlines,
/// advances and hhea metrics; Core Text applies no tracking to it: a one-digit line's width is
/// the glyph's advance, measured with CTLine on the full font).
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");
const DIGIT_TEXT: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// What the backdrops read and write: 8-bit (CA's framebuffer) and unquantised.
const SOURCE: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const EFFECT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

static MOUNTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The demo's surface: inputs `seed` (env.seed), the window's `width` and `height`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(SnakeDemo::new())
}

/// A board cell's top-left corner, in the board's points (multiples of squareSize).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cell {
    /// x.
    pub x: i32,
    /// y.
    pub y: i32,
}

/// snake-game.ts's `SnakeGame`.
#[derive(Clone, Debug)]
pub struct SnakeGame {
    board_width: i32,
    board_height: i32,
    /// Head first.
    pub snake: VecDeque<Cell>,
    /// None once the snake fills the board.
    pub food: Option<Cell>,
    /// The direction of the next move (the pending turn, if any)...
    pub direction: u32,
    /// ...and the direction the snake actually moved last.
    pub moved_direction: u32,
    /// isGameOver.
    pub is_game_over: bool,
    /// score.
    pub score: u32,
    square_size: i32,
    wrapping_enabled: bool,
    free: Vec<Cell>,
}

impl SnakeGame {
    /// `new SnakeGame(rows, cols, squareSize, wrappingEnabled)`.
    pub fn new(
        rows: i32,
        cols: i32,
        square_size: i32,
        wrapping_enabled: bool,
        random: &mut Random,
    ) -> SnakeGame {
        let cells = (rows * cols).max(0) as usize;
        let mut game = SnakeGame {
            board_width: cols * square_size,
            board_height: rows * square_size,
            snake: VecDeque::with_capacity(cells + 2),
            food: None,
            direction: directions::RIGHT,
            moved_direction: directions::RIGHT,
            is_game_over: false,
            score: 0,
            square_size,
            wrapping_enabled,
            free: Vec::with_capacity(cells),
        };
        game.start_snake();
        game.food = game.generate_food(random);
        game
    }

    fn start_snake(&mut self) {
        let (x, y) = (
            self.board_width.div_euclid(2),
            self.board_height.div_euclid(2),
        );
        self.snake.clear();
        self.snake.push_back(Cell { x, y });
        self.snake.push_back(Cell {
            x: x - self.square_size,
            y,
        });
    }

    /// `move()`.
    pub fn step(&mut self, random: &mut Random) {
        if self.is_game_over {
            return;
        }
        let head = self.snake[0];
        let sq = self.square_size;
        let mut new_head = match self.direction {
            directions::UP => Cell {
                x: head.x,
                y: head.y - sq,
            },
            directions::DOWN => Cell {
                x: head.x,
                y: head.y + sq,
            },
            directions::LEFT => Cell {
                x: head.x - sq,
                y: head.y,
            },
            _ => Cell {
                x: head.x + sq,
                y: head.y,
            },
        };
        if self.wrapping_enabled {
            new_head = self.wrap_coordinates(new_head);
        } else if self.is_wall_collision(new_head) {
            self.is_game_over = true;
            return;
        }
        if self.is_snake(new_head) {
            self.is_game_over = true;
            return;
        }
        self.snake.push_front(new_head);
        self.moved_direction = self.direction;
        if self.food == Some(new_head) {
            self.score += 1;
            self.food = self.generate_food(random);
        } else {
            self.snake.pop_back();
        }
    }

    fn wrap_coordinates(&self, c: Cell) -> Cell {
        let mut w = c;
        if c.x < 0 {
            w.x = self.board_width - self.square_size;
        } else if c.x >= self.board_width {
            w.x = 0;
        }
        if c.y < 0 {
            w.y = self.board_height - self.square_size;
        } else if c.y >= self.board_height {
            w.y = 0;
        }
        w
    }

    fn is_wall_collision(&self, c: Cell) -> bool {
        c.x < 0 || c.x >= self.board_width || c.y < 0 || c.y >= self.board_height
    }

    /// `changeDirection(newDirection)`: no reversal of the direction it last moved.
    pub fn change_direction(&mut self, new_direction: u32) {
        use directions::*;
        let moved = self.moved_direction;
        if (moved == UP && new_direction == DOWN)
            || (moved == DOWN && new_direction == UP)
            || (moved == LEFT && new_direction == RIGHT)
            || (moved == RIGHT && new_direction == LEFT)
        {
            return;
        }
        self.direction = new_direction;
    }

    /// `generateFood()`: 32 random cells (`Math.floor(Math.random() * cols) * squareSize`, x
    /// then y), then one of the free cells (row by row) at random, or none.
    fn generate_food(&mut self, random: &mut Random) -> Option<Cell> {
        let cols = self.board_width.div_euclid(self.square_size);
        let rows = self.board_height.div_euclid(self.square_size);
        for _ in 0..32 {
            let x = (random.next() * cols as f64).floor() as i32 * self.square_size;
            let y = (random.next() * rows as f64).floor() as i32 * self.square_size;
            let food = Cell { x, y };
            if !self.is_snake(food) {
                return Some(food);
            }
        }
        let mut free = std::mem::take(&mut self.free);
        free.clear();
        for row in 0..rows {
            for col in 0..cols {
                let cell = Cell {
                    x: col * self.square_size,
                    y: row * self.square_size,
                };
                if !self.is_snake(cell) {
                    free.push(cell);
                }
            }
        }
        let pick = if free.is_empty() {
            None
        } else {
            Some(free[(random.next() * free.len() as f64).floor() as usize])
        };
        self.free = free;
        pick
    }

    fn is_snake(&self, c: Cell) -> bool {
        self.snake.iter().any(|s| *s == c)
    }

    /// `clear()`.
    pub fn clear(&mut self, random: &mut Random) {
        self.start_snake();
        self.direction = directions::RIGHT;
        self.moved_direction = directions::RIGHT;
        self.is_game_over = false;
        self.food = self.generate_food(random);
        self.score = 0;
    }
}

/// `gameState` as the UI thread holds it (`getState()`).
#[derive(Clone, Debug, Default, PartialEq)]
struct Shown {
    snake: Vec<Cell>,
    food: Option<Cell>,
    over: bool,
    score: u32,
}

impl Shown {
    fn capture(&mut self, g: &SnakeGame) {
        self.snake.clear();
        self.snake.extend(g.snake.iter().copied());
        self.food = g.food;
        self.over = g.is_game_over;
        self.score = g.score;
    }
}

/// What JS sent the UI thread since the last frame: it lands at the next.
#[derive(Clone, Copy, Debug, Default)]
struct Hop {
    /// gameState.set (the value is in `staged`).
    state: bool,
    /// App's isGameOver.set.
    over: Option<bool>,
    /// App's score.set.
    score: Option<u32>,
    /// A digit's isChanging.set(false).
    reset: [bool; MAX_DIGITS],
}

/// getDigitByIndex: the count padded to `max` digits, the `k`-th from the right (from the left
/// of a longer count's string, as the RN code indexes it).
fn digit_of(count: u32, k: usize, max: usize) -> u32 {
    let len = digits_len(count);
    let l = len.max(max);
    let p = max - 1 - k;
    if p < l - len {
        return 0;
    }
    (count / 10u32.pow((l - 1 - p) as u32)) % 10
}

fn digits_len(count: u32) -> usize {
    let mut n = 1;
    let mut c = count;
    while c >= 10 {
        c /= 10;
        n += 1;
    }
    n
}

/// One AnimatedDigit's state.
#[derive(Clone, Debug)]
struct Digit {
    value: u32,
    visible: bool,
    changing: bool,
    /// translateY (points), scaleX, the container's opacity and translateX, isChangingProgress.
    ty: Spring,
    sx: Spring,
    opacity: Timing,
    tx: Timing,
    progress: Timing,
}

impl Digit {
    /// The initial updater run (animations at their targets) for `count`.
    fn new(count: u32, k: usize) -> Digit {
        let value = digit_of(count, k, MAX_DIGITS);
        let invisible = MAX_DIGITS as f64 - digits_len(count) as f64;
        let visible = value != 0 || k < digits_len(count);
        Digit {
            value,
            visible,
            changing: false,
            ty: Spring::at(-(DIGIT_H as f64) * value as f64),
            sx: Spring::at(1.0),
            opacity: Timing::at(if visible { 1.0 } else { 0.0 }),
            tx: Timing::at(-(DIGIT_W as f64) * invisible / 2.0),
            progress: Timing::at(0.0),
        }
    }

    fn step(&mut self, now: f64) -> bool {
        let a = self.ty.step(now);
        let b = self.sx.step(now);
        let c = self.opacity.step(now);
        let d = self.tx.step(now);
        let e = self.progress.step(now);
        a | b | c | d | e
    }
}

/// withTiming(to) from a mapper: a new animation only when the target changes (a same-target
/// re-run keeps its timeline; a value at the target is not set again), started at this frame.
fn time_to(t: &mut Timing, to: f64, ms: f64, now: f64) {
    if t.target() != to {
        t.to(to, ms, Easing::timing_default());
        t.step(now);
    }
}

/// withSpring(to) from a mapper, started at this frame (a running spring's clock goes on).
fn spring_to(s: &mut Spring, to: f64, config: SpringConfig, now: f64) {
    s.retarget(to, config);
    s.step(now);
}

/// Yoga's rounding of an absolute edge to the pixel grid (a half rounds up).
fn grid(v: f32, s: f32) -> f32 {
    ((v * s + 0.5 + 1e-4).floor()) / s
}

/// A text measure ceiled to the device pixel, as RN's text layout returns it.
fn ceil_px(v: f32, s: f32) -> f32 {
    ((v * s - 1e-3).ceil()) / s
}

/// The canvas's content, in its points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    s: f32,
    /// boardSize, squareSize.
    board: f32,
    square: i32,
    /// The "Score" box's left, its line's height.
    score_x: f32,
    score_h: f32,
    /// The count's left and top; the board's top.
    count_x: f32,
    count_top: f32,
    board_top: f32,
    /// The restart button's frame.
    button: [f32; 4],
    /// The canvas's origin in the window (points).
    window: [f32; 2],
}

impl Layout {
    /// `screen` the window (points), `canvas_w` the canvas's width (boardSize when the window is
    /// unknown), the "Score" and button label advances.
    fn new(screen: [f32; 2], canvas_w: f32, s: f32, score_w: f32, label_w: f32) -> Layout {
        let board = if screen[0] > 0.0 {
            (screen[0] * 0.7 / 10.0).floor() * 10.0
        } else {
            canvas_w
        };
        let square = (board / N as f32).floor() as i32;
        let score_h = ceil_px(SCORE_SIZE * SF_LINE, s);
        let score_box = ceil_px(score_w, s);
        let count_w = DIGIT_W * MAX_DIGITS as f32;
        let count_top = score_h + SCORE_MARGIN;
        let board_top = count_top + DIGIT_H + STATS_MARGIN;
        let card_h = 2.0 * CARD_PADDING + board_top + board;
        // The canvas's unrounded place in the window, and where it is drawn.
        let left = (screen[0] - (board + 2.0 * CARD_PADDING)) / 2.0 + CARD_PADDING;
        let top = (screen[1] - card_h) / 2.0 + CARD_PADDING;
        let (l0, t0) = (grid(left, s), grid(top, s));
        let stats_w = score_box.max(count_w);
        let stats_x = left + (board - stats_w) / 2.0;
        let (text_w, text_h) = (ceil_px(label_w, s), ceil_px(LABEL_SIZE * SF_LINE, s));
        let (bw, bh) = (text_w + 2.0 * BUTTON_PAD_X, text_h + 2.0 * BUTTON_PAD_Y);
        Layout {
            s,
            board,
            square,
            score_x: grid(stats_x + (stats_w - score_box) / 2.0, s) - l0,
            score_h,
            count_x: grid(stats_x + (stats_w - count_w) / 2.0, s) - l0,
            count_top,
            board_top,
            button: [
                grid(left + (board - bw) / 2.0, s) - l0,
                grid(top + board_top + (board - bh) / 2.0, s) - t0,
                bw,
                bh,
            ],
            window: [l0, t0],
        }
    }

    fn px(&self, points: f32) -> u32 {
        (points * self.s).round().max(1.0) as u32
    }

    fn on_board(&self, x: f32, y: f32) -> bool {
        x >= 0.0 && x < self.board && y >= self.board_top && y < self.board_top + self.board
    }

    fn on_button(&self, x: f32, y: f32) -> bool {
        let [bx, by, bw, bh] = self.button;
        x >= bx && x < bx + bw && y >= by && y < by + bh
    }

    /// Digit `k`'s container's left, device px (row-reverse: digit 0 is the rightmost).
    fn digit_left_px(&self, k: usize, tx: f32) -> f32 {
        (self.count_x + DIGIT_W * (MAX_DIGITS - 1 - k) as f32 + tx) * self.s
    }
}

/// The pixel columns `[x0, x1)` whose centres are inside `[left, left + width)` (device px), with
/// the shader's arithmetic.
fn covered(left: f32, width: f32) -> (i32, i32) {
    let inside = |i: i32| {
        let l = i as f32 + 0.5 - left;
        l >= 0.0 && l < width
    };
    let mut x0 = (left - 0.5).ceil() as i32;
    while !inside(x0) && (x0 as f32) < left + 1.0 {
        x0 += 1;
    }
    while inside(x0 - 1) {
        x0 -= 1;
    }
    let mut x1 = x0;
    while inside(x1) {
        x1 += 1;
    }
    (x0, x1)
}

struct SnakeDemo {
    mount: u64,
    seed: Option<f64>,
    screen: [f32; 2],
    layout: Layout,
    random: Random,
    /// The JS thread's game.
    game: Option<SnakeGame>,
    /// gameState on the UI thread, and the value JS last set (landing next frame).
    shown: Shown,
    staged: Shown,
    shown_generation: u64,
    next: Hop,
    /// useFrameCallback's first frame passed; lastTimestamp (None: 0, far back).
    started: bool,
    last_tick: Option<f64>,
    /// The mapper pass has run once (the reactions' first run).
    mapped: bool,
    /// The score reaction's previous input.
    score_prev: Option<u32>,
    /// App's isGameOver and score on the UI thread.
    over: bool,
    count: u32,
    /// rRestartButtonViewStyle: opacity, and pointerEvents auto.
    overlay: Timing,
    overlay_auto: bool,
    digits: [Digit; MAX_DIGITS],
    /// resetIsChanging's timeouts: when, which digit.
    timers: Vec<(f64, usize)>,
    flings: [FlingGesture; 4],
    /// The finger on the restart button.
    press: Option<u32>,
    posted: Vec<String>,
    score_font: Option<Font>,
    label_font: Option<Font>,
    digit_font: Option<Font>,
    main: Canvas,
    main_renderer: Renderer,
    statics: Canvas,
    digits_renderer: Renderer,
    button_renderer: Renderer,
    blurs: [BackdropBlur; MAX_DIGITS],
    /// What the layers hold: the shown generation; the count's pose.
    drawn_main: Option<u64>,
    drawn_count: Option<[f32; 15]>,
    bytes: Vec<u8>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    size: (u32, u32),
    main_view: wgpu::TextureView,
    digits_view: wgpu::TextureView,
    button_view: wgpu::TextureView,
    source_view: wgpu::TextureView,
    effect_view: wgpu::TextureView,
    statics_drawn: bool,
    source: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl SnakeDemo {
    fn new() -> SnakeDemo {
        let count = 20;
        SnakeDemo {
            mount: MOUNTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            seed: None,
            screen: [0.0, 0.0],
            layout: Layout::default(),
            random: Random::new(0.0),
            game: None,
            shown: Shown::default(),
            staged: Shown::default(),
            shown_generation: 0,
            next: Hop::default(),
            started: false,
            last_tick: None,
            mapped: false,
            score_prev: None,
            over: false,
            // useSharedValue(20).
            count,
            overlay: Timing::at(0.0),
            overlay_auto: false,
            digits: [
                Digit::new(count, 0),
                Digit::new(count, 1),
                Digit::new(count, 2),
            ],
            timers: Vec::with_capacity(16),
            flings: [
                FlingGesture::new(directions::LEFT),
                FlingGesture::new(directions::UP),
                FlingGesture::new(directions::RIGHT),
                FlingGesture::new(directions::DOWN),
            ],
            press: None,
            posted: Vec::new(),
            score_font: skia::match_ui_font(SCORE_SIZE, 700.0),
            label_font: skia::match_ui_font(LABEL_SIZE, 500.0),
            digit_font: Font::new(SF_ROUNDED_BOLD, DIGIT_SIZE),
            main: Canvas::default(),
            main_renderer: Renderer::default(),
            statics: Canvas::default(),
            digits_renderer: Renderer::default(),
            button_renderer: Renderer::default(),
            blurs: Default::default(),
            drawn_main: None,
            drawn_count: None,
            bytes: vec![0; Uniforms::SIZE],
            gpu: None,
        }
    }

    /// useConst(() => new SnakeGame(10, 10, squareSize, true)) at the mount, with its
    /// Math.random() stream.
    fn ensure_game(&mut self) {
        if self.game.is_some() || self.layout.square <= 0 {
            return;
        }
        let seed = self.seed.unwrap_or(0.0);
        self.random = Random::new(seed * 4096.0 + self.mount as f64);
        let game = SnakeGame::new(N, N, self.layout.square, true, &mut self.random);
        self.shown.capture(&game);
        self.staged = self.shown.clone();
        self.game = Some(game);
    }

    /// A fling's onStart → scheduleOnRN(changeDirectionWrapper): the game turns (JS) and
    /// onDirectionChange plays Haptics.selectionAsync.
    fn turn(&mut self, direction: u32) {
        if let Some(g) = self.game.as_mut() {
            g.change_direction(direction);
        }
        self.posted.push("haptic:selection".into());
    }

    /// The restart press's onPress (JS): isGameOver.set(false); restart(): clear() and
    /// gameState.set; the app's press haptic.
    fn restart(&mut self) {
        self.next.over = Some(false);
        if let Some(g) = self.game.as_mut() {
            g.clear(&mut self.random);
            self.staged.capture(g);
            self.next.state = true;
        }
        self.posted.push("haptic:selection".into());
    }

    /// One frame at `now`, as RN's threads run it: what JS sent lands, timers fire, the
    /// animations and the frame callback run, then the mapper pass.
    fn advance(&mut self, now: f64) {
        self.ensure_game();
        let hop = std::mem::take(&mut self.next);
        let first = !self.mapped;
        let state_changed = hop.state;
        if hop.state {
            std::mem::swap(&mut self.shown, &mut self.staged);
            self.shown_generation += 1;
        }
        let over_changed = hop.over.is_some_and(|o| o != self.over);
        if let Some(o) = hop.over {
            self.over = o;
        }
        let count_changed = hop.score.is_some_and(|c| c != self.count);
        if let Some(c) = hop.score {
            self.count = c;
        }
        // RCTTiming: a setTimeout fires on the first frame at or after its target (JS), and its
        // isChanging.set(false) lands at the next.
        let mut k = 0;
        while k < self.timers.len() {
            if now >= self.timers[k].0 - 1e-6 {
                self.next.reset[self.timers[k].1] = true;
                self.timers.swap_remove(k);
            } else {
                k += 1;
            }
        }
        // requestAnimationFrame: the running animations.
        self.overlay.step(now);
        for d in &mut self.digits {
            d.step(now);
        }
        // useFrameCallback.
        if !self.started {
            self.started = true;
        } else if !self.shown.over && self.last_tick.is_none_or(|last| now - last > TICK_MS) {
            if let Some(g) = self.game.as_mut() {
                // updateGame (JS): move, then gameState.set.
                g.step(&mut self.random);
                self.staged.capture(g);
                self.next.state = true;
            }
            self.last_tick = Some(now);
        }
        // The mapper pass.
        if first || state_changed {
            // useAnimatedReaction(() => gameState.get().isGameOver): onGameOver (JS).
            if self.shown.over {
                self.next.over = Some(true);
            }
            // useAnimatedReaction(() => gameState.get().score): onScoreChange (JS).
            if self.score_prev != Some(self.shown.score) {
                self.next.score = Some(self.shown.score);
            }
            self.score_prev = Some(self.shown.score);
        }
        if first || over_changed {
            time_to(
                &mut self.overlay,
                if self.over { 1.0 } else { 0.0 },
                OVERLAY_MS,
                now,
            );
            self.overlay_auto = self.over;
        }
        let count = self.count;
        let len = digits_len(count);
        let invisible = MAX_DIGITS as f64 - len as f64;
        for (k, d) in self.digits.iter_mut().enumerate() {
            let value = digit_of(count, k, MAX_DIGITS);
            let digit_changed = first || (count_changed && value != d.value);
            let was = d.changing;
            // isChanging.set(false) from the timeout landed before this pass.
            if hop.reset[k] {
                d.changing = false;
            }
            if digit_changed {
                // The digit's reaction: isChanging.set(curr !== prev), true whenever it runs;
                // scheduleOnRN(resetIsChanging).
                d.value = value;
                d.changing = true;
                self.timers.push((now + RESET_MS, k));
            }
            if digit_changed || d.changing != was {
                // rStyle.
                spring_to(&mut d.ty, -(DIGIT_H as f64) * d.value as f64, ROLL, now);
                spring_to(
                    &mut d.sx,
                    if d.changing { SQUEEZE } else { 1.0 },
                    GENTLE,
                    now,
                );
                // isChangingProgress.
                time_to(
                    &mut d.progress,
                    if d.changing { 1.0 } else { 0.0 },
                    300.0,
                    now,
                );
            }
            if first || count_changed {
                // isVisible → opacity; invisibleDigitsAmount → translateX.
                d.visible = value != 0 || k < len;
                time_to(
                    &mut d.opacity,
                    if d.visible { 1.0 } else { 0.0 },
                    300.0,
                    now,
                );
                time_to(&mut d.tx, -(DIGIT_W as f64) * invisible / 2.0, 300.0, now);
            }
        }
        self.mapped = true;
    }

    /// The count's pose: per digit translateX, scaleX, translateY, opacity, blur fraction.
    fn count_pose(&self) -> [f32; 15] {
        let mut p = [0.0; 15];
        for (k, d) in self.digits.iter().enumerate() {
            p[k * 5] = d.tx.value as f32;
            p[k * 5 + 1] = d.sx.value as f32;
            p[k * 5 + 2] = d.ty.value as f32;
            p[k * 5 + 3] = d.opacity.value as f32;
            p[k * 5 + 4] = expo_fraction(d.progress.value * BLUR_INTENSITY);
        }
        p
    }

    /// The Skia layer: the "Score" Text and the board's canvas.
    fn record_main(&mut self) {
        let l = self.layout;
        let c = &mut self.main;
        c.begin(l.s);
        if let Some(font) = &self.score_font {
            c.draw_text(
                "Score",
                l.score_x,
                gfx::baseline(font, 0.0),
                font,
                &Paint::fill(Color::hex(GRAY)),
            );
        }
        c.translate(0.0, l.board_top);
        let sq = l.square as f32;
        let side = N as f32 * sq;
        c.draw_rrect(
            0.0,
            0.0,
            side,
            side,
            BOARD_RADIUS,
            &Paint::fill(Color::hex(BOARD)),
        );
        let snake = &self.shown.snake;
        c.draw_with(&Paint::fill(Color::hex(SNAKE)), |b| {
            for s in snake {
                skia::add_oval_from(b, s.x as f32, s.y as f32, sq, sq, 3);
            }
        });
        if let Some(f) = self.shown.food {
            c.draw_with(&Paint::fill(Color::hex(FOOD)), |b| {
                skia::add_oval_from(b, f.x as f32, f.y as f32, sq, sq, 3)
            });
        }
    }

    /// The ten digit Texts (21 × 300) and the button (its frame's size), side by side.
    fn record_statics(&mut self) {
        let l = self.layout;
        let c = &mut self.statics;
        c.begin(l.s);
        if let Some(font) = &self.digit_font {
            let ascent = -font.metrics().ascent;
            for (n, t) in DIGIT_TEXT.iter().enumerate() {
                let x = (DIGIT_W - font.advance_width(t)) / 2.0;
                c.draw_text(
                    t,
                    x,
                    DIGIT_H * n as f32 + ascent,
                    font,
                    &Paint::fill(Color::BLACK),
                );
            }
        }
    }

    fn record_button(&mut self) {
        let l = self.layout;
        let c = &mut self.statics;
        c.begin(l.s);
        let [_, _, bw, bh] = l.button;
        c.draw_continuous_rrect(0.0, 0.0, bw, bh, BUTTON_RADIUS, &Paint::fill(Color::BLACK));
        if let Some(font) = &self.label_font {
            c.draw_text(
                LABEL,
                BUTTON_PAD_X,
                gfx::baseline(font, BUTTON_PAD_Y),
                font,
                &Paint::fill(Color::WHITE),
            );
        }
    }
}

impl Surface for SnakeDemo {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let num = |i: usize| inputs.get(i).and_then(|v| v.as_number());
        if self.seed.is_none() {
            self.seed = Some(num(0).unwrap_or(0.0));
        }
        self.screen = [num(1).unwrap_or(0.0) as f32, num(2).unwrap_or(0.0) as f32];
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
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
        let l = self.layout;
        if l.s <= 0.0 {
            return;
        }
        if phase == PointerPhase::Down && self.overlay_auto && l.on_board(x, y) {
            // The overlay (pointerEvents auto) is hit; in it, the button.
            if self.press.is_none() && l.on_button(x, y) {
                self.press = Some(id);
            }
            return;
        }
        if matches!(phase, PointerPhase::Up | PointerPhase::Cancel) && self.press == Some(id) {
            self.press = None;
            if phase == PointerPhase::Up {
                self.restart();
            }
            return;
        }
        let claim = l.on_board(x, y);
        let phase = gfx::phase(phase);
        for i in 0..self.flings.len() {
            if let FlingEvent::Start { .. } = self.flings[i].event(id, phase, x, y, at_ms, claim) {
                let direction = self.flings[i].direction;
                self.turn(direction);
            }
        }
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (head, length, food, direction) = match &self.game {
            Some(g) => (
                g.snake.front().map(|c| [c.x, c.y]),
                g.snake.len(),
                g.food.map(|c| [c.x, c.y]),
                g.direction,
            ),
            None => (None, 0, None, 0),
        };
        let json =
            |c: Option<[i32; 2]>| c.map_or("null".to_string(), |c| format!("[{},{}]", c[0], c[1]));
        Some(format!(
            "{{\"score\":{},\"count\":{},\"over\":{},\"overlay\":{},\"direction\":{},\"head\":{},\"length\":{},\"food\":{},\"held\":{}}}",
            self.shown.score,
            self.count,
            self.over,
            self.overlay.value,
            direction,
            json(head),
            length,
            json(food),
            self.flings.iter().any(|f| f.tracking()) || self.press.is_some()
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
        let score_w = self
            .score_font
            .as_ref()
            .map_or(0.0, |f| f.advance_width("Score"));
        let label_w = self
            .label_font
            .as_ref()
            .map_or(0.0, |f| f.advance_width(LABEL));
        let layout = Layout::new(self.screen, frame.width, frame.scale, score_w, label_w);
        if layout != self.layout {
            self.layout = layout;
            self.drawn_main = None;
            self.drawn_count = None;
        }
        self.advance(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let l = self.layout;
        let s = l.s;
        if self
            .gpu
            .as_ref()
            .map(|g| (g.format, g.generation, g.layout, g.size))
            != Some((format, frame.shader_generation, l, (pw, ph)))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, l, (pw, ph)));
            self.drawn_main = None;
            self.drawn_count = None;
        }
        // Each layer through its own renderer (a renderer stages its buffers once per frame).
        if !self.gpu.as_ref().unwrap().statics_drawn {
            self.record_statics();
            let (dw, dh) = (l.px(DIGIT_W), l.px(DIGIT_H * 10.0));
            let gpu = self.gpu.as_ref().unwrap();
            self.digits_renderer.draw(
                device,
                queue,
                encoder,
                &self.statics,
                &gpu.digits_view,
                LAYER,
                dw,
                dh,
                wgpu::Color::TRANSPARENT,
            );
            self.record_button();
            let (bw, bh) = (l.px(l.button[2]), l.px(l.button[3]));
            let gpu = self.gpu.as_ref().unwrap();
            self.button_renderer.draw(
                device,
                queue,
                encoder,
                &self.statics,
                &gpu.button_view,
                LAYER,
                bw,
                bh,
                wgpu::Color::TRANSPARENT,
            );
            self.gpu.as_mut().unwrap().statics_drawn = true;
        }
        if self.drawn_main != Some(self.shown_generation) {
            self.record_main();
            let gpu = self.gpu.as_ref().unwrap();
            self.main_renderer.draw(
                device,
                queue,
                encoder,
                &self.main,
                &gpu.main_view,
                LAYER,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
            self.drawn_main = Some(self.shown_generation);
        }

        let pose = self.count_pose();
        let mut u = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            row: [
                l.count_top,
                DIGIT_H,
                l.px(DIGIT_W) as f32,
                l.px(DIGIT_H * 10.0) as f32,
            ],
            d0: [0.0; 4],
            d1: [0.0; 4],
            d2: [0.0; 4],
            button: [
                l.button[0] * s,
                l.button[1] * s,
                l.px(l.button[2]) as f32,
                l.px(l.button[3]) as f32,
            ],
            overlay: [self.overlay.value as f32, 0.0, 0.0, 0.0],
        };
        let mut lefts = [0.0f32; MAX_DIGITS];
        for k in 0..MAX_DIGITS {
            lefts[k] = l.digit_left_px(k, pose[k * 5]);
            let d = [lefts[k], pose[k * 5 + 1], pose[k * 5 + 2], pose[k * 5 + 3]];
            match k {
                0 => u.d0 = d,
                1 => u.d1 = d,
                _ => u.d2 = d,
            }
        }
        u.write(&mut self.bytes);
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &self.bytes);

        if self.drawn_count != Some(pose) {
            let row_h = l.px(DIGIT_H);
            skia::render::fullscreen_pass(
                encoder,
                "snake count source",
                &gpu.source_view,
                &gpu.source,
                &gpu.bind,
            );
            let window = [l.window[0] * s, (l.window[1] + l.count_top) * s];
            for k in 0..MAX_DIGITS {
                if pose[k * 5 + 3] <= 0.0 {
                    continue;
                }
                let (x0, x1) = covered(lefts[k], DIGIT_W * s);
                let x0 = x0.max(0);
                let x1 = x1.min(pw as i32);
                if x1 <= x0 {
                    continue;
                }
                let params = Material::Light.chain().at(pose[k * 5 + 4]);
                let blur = &mut self.blurs[k];
                blur.run(
                    device,
                    queue,
                    encoder,
                    &gpu.source_view,
                    [x0, 0, x1, row_h as i32],
                    window,
                    &params,
                    s,
                );
                blur.draw(
                    device,
                    queue,
                    encoder,
                    &gpu.effect_view,
                    EFFECT_FORMAT,
                    [0.0, 0.0],
                    [x0 as u32, 0],
                    [(x1 - x0) as u32, row_h],
                );
            }
            self.drawn_count = Some(pose);
        }
        skia::render::fullscreen_pass(encoder, "snake", target, &gpu.compose, &gpu.bind);
        // useFrameCallback runs every frame.
        true
    }
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    size: (u32, u32),
) -> Gpu {
    let (pw, ph) = size;
    let l = layout;
    let main_view = skia::render::sampled_target(device, "snake main", LAYER, pw, ph);
    let digits_view = skia::render::sampled_target(
        device,
        "snake digits",
        LAYER,
        l.px(DIGIT_W),
        l.px(DIGIT_H * 10.0),
    );
    let button_view = skia::render::sampled_target(
        device,
        "snake button",
        LAYER,
        l.px(l.button[2]),
        l.px(l.button[3]),
    );
    let source_view =
        skia::render::sampled_target(device, "snake count source", SOURCE, pw, l.px(DIGIT_H));
    let effect_view = skia::render::sampled_target(
        device,
        "snake count effect",
        EFFECT_FORMAT,
        pw,
        l.px(DIGIT_H),
    );
    let sampler = skia::render::linear_sampler(device);
    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let source =
        skia::render::fullscreen_pipeline(device, &shader, &group, entry::SOURCE, SOURCE, None);
    let compose =
        skia::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("snake"),
        size: Uniforms::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("snake"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: MAIN_LAYER.binding,
                resource: wgpu::BindingResource::TextureView(&main_view),
            },
            wgpu::BindGroupEntry {
                binding: EFFECT.binding,
                resource: wgpu::BindingResource::TextureView(&effect_view),
            },
            wgpu::BindGroupEntry {
                binding: BUTTON.binding,
                resource: wgpu::BindingResource::TextureView(&button_view),
            },
            wgpu::BindGroupEntry {
                binding: DIGITS.binding,
                resource: wgpu::BindingResource::TextureView(&digits_view),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    Gpu {
        format,
        generation,
        layout,
        size,
        main_view,
        digits_view,
        button_view,
        source_view,
        effect_view,
        statics_drawn: false,
        source,
        compose,
        uniforms,
        bind,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};
    use gesture_handler::directions::*;

    const F120: f64 = 1000.0 / 120.0;
    const F60: f64 = 1000.0 / 60.0;

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

    /// A surface laid out on an iPhone Air (420 × 912 at 3×), its game made.
    fn demo(seed: f64) -> SnakeDemo {
        let mut d = SnakeDemo::new();
        d.bind(
            &[
                Value::Number(seed),
                Value::Number(420.0),
                Value::Number(912.0),
            ],
            None,
        )
        .unwrap();
        let score_w = d
            .score_font
            .as_ref()
            .map_or(0.0, |f| f.advance_width("Score"));
        let label_w = d
            .label_font
            .as_ref()
            .map_or(0.0, |f| f.advance_width(LABEL));
        d.layout = Layout::new(d.screen, 290.0, 3.0, score_w, label_w);
        d.ensure_game();
        d
    }

    fn cells(g: &SnakeGame) -> Vec<(i32, i32)> {
        g.snake.iter().map(|c| (c.x, c.y)).collect()
    }

    #[test]
    fn layout_is_yogas() {
        let l = Layout::new([420.0, 912.0], 290.0, 3.0, 51.0, 110.0);
        assert_eq!((l.board, l.square), (290.0, 29));
        // "Score" (SF 18: 21.48 pt) ceiled to 65 / 3; the count 4 below; the board 30 + 8 below.
        assert!(
            (l.score_h - 65.0 / 3.0).abs() < 1e-4 && (l.count_top - 77.0 / 3.0).abs() < 1e-4,
            "{l:?}"
        );
        assert!((l.board_top - l.count_top - 38.0).abs() < 1e-4);
        // The count centred over 290 at 65 + 113.5 = 178.5 in the window: Yoga rounds it to
        // 536 / 3, 113.667 in the canvas.
        assert!(
            (l.count_x - (536.0 / 3.0 - 65.0)).abs() < 1e-4,
            "{}",
            l.count_x
        );
        assert_eq!(l.window[0], 65.0);
        // The button: 110 + 40 wide, SF 16's 19.09 ceiled + 20 tall, centred in the board.
        assert!(
            (l.button[2] - 150.0).abs() < 1e-4 && (l.button[3] - (58.0 / 3.0 + 20.0)).abs() < 1e-4
        );
        assert!((l.button[0] - 70.0).abs() < 1e-4, "{:?}", l.button);
        // Digit 0 is the rightmost; translateX moves all three.
        assert!((l.digit_left_px(0, 0.0) - (l.count_x + 42.0) * 3.0).abs() < 1e-3);
        assert!((l.digit_left_px(2, -10.5) - (l.count_x - 10.5) * 3.0).abs() < 1e-3);
        // A smaller window: boardSize 270, squareSize 27.
        let l = Layout::new([393.0, 852.0], 270.0, 3.0, 51.0, 110.0);
        assert_eq!((l.board, l.square), (270.0, 27));
    }

    #[test]
    fn covered_pixels_are_the_shaders() {
        assert_eq!(covered(339.0, 63.0), (339, 402));
        // A half-pixel left edge: the pixel whose centre is on it is in.
        assert_eq!(covered(307.5, 63.0), (307, 370));
        assert_eq!(covered(307.6, 63.0), (308, 371));
    }

    #[test]
    fn the_game_is_snake_game_ts() {
        let mut r = Random::new(3.0);
        let mut g = SnakeGame::new(10, 10, 29, true, &mut r);
        assert_eq!(cells(&g), vec![(145, 145), (116, 145)]);
        assert_eq!(
            (g.direction, g.moved_direction, g.score, g.is_game_over),
            (RIGHT, RIGHT, 0, false)
        );
        let food = g.food.unwrap();
        assert!(food.x % 29 == 0 && food.y % 29 == 0 && !g.is_snake(food));
        // Far from the food, a move keeps the length.
        g.food = Some(Cell { x: 0, y: 0 });
        g.step(&mut r);
        assert_eq!(cells(&g), vec![(174, 145), (145, 145)]);
        // Two turns in one tick: UP is taken (it moved RIGHT), LEFT is refused against the RIGHT
        // it moved, though the pending turn is UP.
        g.change_direction(UP);
        g.change_direction(LEFT);
        assert_eq!(g.direction, UP);
        g.change_direction(LEFT);
        assert_eq!(g.direction, UP);
        g.step(&mut r);
        assert_eq!(cells(&g)[0], (174, 116));
        // Reversing what it moved is refused.
        g.change_direction(DOWN);
        assert_eq!(g.direction, UP);
        // Wrapping: up from row 0 to the last row (290 − 29).
        for _ in 0..4 {
            g.step(&mut r);
        }
        assert_eq!(cells(&g)[0], (174, 0));
        g.step(&mut r);
        assert_eq!(cells(&g)[0], (174, 261));
        // Eating: the head on the food grows it and scores; new food off the snake.
        g.food = Some(Cell { x: 174, y: 232 });
        g.step(&mut r);
        assert_eq!((g.score, g.snake.len()), (1, 3));
        assert!(g.food.is_some_and(|f| !g.is_snake(f)));
        // Biting itself (the tail's cell counts: it has not moved yet) ends it, the snake
        // unchanged.
        g.snake = [(0, 0), (29, 0), (29, 29), (0, 29)]
            .iter()
            .map(|&(x, y)| Cell { x, y })
            .collect();
        g.direction = DOWN;
        g.moved_direction = LEFT;
        let before = cells(&g);
        g.step(&mut r);
        assert!(g.is_game_over);
        assert_eq!(cells(&g), before);
        g.step(&mut r);
        assert_eq!(cells(&g), before, "over: no more moves");
        // clear(): the start again.
        g.clear(&mut r);
        assert_eq!(cells(&g), vec![(145, 145), (116, 145)]);
        assert_eq!((g.direction, g.score, g.is_game_over), (RIGHT, 0, false));
        // A full board has no food; one free cell is the food.
        g.snake = (0..100)
            .map(|i| Cell {
                x: (i % 10) * 29,
                y: (i / 10) * 29,
            })
            .collect();
        assert_eq!(g.generate_food(&mut r), None);
        g.snake.pop_back();
        assert_eq!(g.generate_food(&mut r), Some(Cell { x: 261, y: 261 }));
    }

    #[test]
    fn ticks_land_on_the_first_frame_past_120_ms_and_show_a_frame_later() {
        for (period, gap) in [(F120, 15), (F60, 8)] {
            let mut d = demo(1.0);
            d.game.as_mut().unwrap().food = Some(Cell { x: 0, y: 0 });
            let mut moves = Vec::new();
            let mut shown = Vec::new();
            for n in 0..40 {
                let before = d.game.as_ref().unwrap().snake[0];
                let head = d.shown.snake[0];
                d.advance(1000.0 + n as f64 * period);
                if d.game.as_ref().unwrap().snake[0] != before {
                    moves.push(n);
                }
                if d.shown.snake[0] != head {
                    shown.push(n);
                }
            }
            // The first frame is skipped; lastTimestamp 0 makes the second tick.
            assert_eq!(moves[0], 1, "{moves:?}");
            for w in moves.windows(2) {
                assert_eq!(w[1] - w[0], gap, "{moves:?}");
            }
            assert_eq!(shown, moves.iter().map(|m| m + 1).collect::<Vec<_>>());
        }
    }

    #[test]
    fn the_count_rolls_from_20_to_0_at_mount() {
        let mut d = demo(2.0);
        let mut t = 0.0;
        // Frame 0: the first mapper pass. Every digit's reaction runs (prev null): isChanging,
        // so scaleX heads for 0.7 and the blur rises; the count still shows 20 (020: the
        // hundreds hidden).
        d.advance(t);
        assert_eq!(d.count, 20);
        assert!(d
            .digits
            .iter()
            .all(|g| g.changing && g.sx.target() == SQUEEZE && g.progress.target() == 1.0));
        assert_eq!(
            [d.digits[0].value, d.digits[1].value, d.digits[2].value],
            [0, 2, 0]
        );
        assert_eq!(
            [
                d.digits[0].opacity.value,
                d.digits[1].opacity.value,
                d.digits[2].opacity.value
            ],
            [1.0, 1.0, 0.0]
        );
        assert_eq!(d.digits[1].ty.value, -60.0);
        assert_eq!(d.digits[0].tx.value, -10.5);
        // Frame 1: onScoreChange(0) landed: the tens roll to 0 and fade, the row slides to −21.
        t += F120;
        d.advance(t);
        assert_eq!(d.count, 0);
        assert_eq!(
            (
                d.digits[1].ty.target(),
                d.digits[1].opacity.target(),
                d.digits[0].tx.target()
            ),
            (0.0, 0.0, -21.0)
        );
        assert_eq!(d.digits[1].ty.value, -60.0, "it starts where it is");
        assert_eq!(d.digits[0].opacity.target(), 1.0);
        // The first timeout (frame 0 + 200 ms) fires on frame 24 (200 ms at 120 Hz) and
        // isChanging is false from frame 25.
        let mut frame = 1;
        while d.digits[0].changing {
            t += F120;
            frame += 1;
            d.advance(t);
        }
        assert_eq!(frame, 25);
        assert!(
            !d.digits[1].changing,
            "the tens' own second timeout does not matter"
        );
        assert_eq!(
            (d.digits[0].sx.target(), d.digits[0].progress.target()),
            (1.0, 0.0)
        );
        // Everything settles.
        for _ in 0..240 {
            t += F120;
            d.advance(t);
        }
        assert_eq!(
            [
                d.digits[0].sx.value,
                d.digits[1].ty.value,
                d.digits[1].opacity.value,
                d.digits[0].tx.value
            ],
            [1.0, 0.0, 0.0, -21.0]
        );
    }

    #[test]
    fn eating_rolls_the_count_two_frames_after_the_shown_move() {
        let mut d = demo(4.0);
        let mut t = 0.0;
        d.advance(t);
        for _ in 0..400 {
            t += F120;
            d.advance(t);
        }
        // The food right ahead.
        let head = d.game.as_ref().unwrap().snake[0];
        d.game.as_mut().unwrap().food = Some(Cell {
            x: (head.x + 29) % 290,
            y: head.y,
        });
        let mut n = 0;
        while d.game.as_ref().unwrap().score == 0 {
            t += F120;
            n += 1;
            d.advance(t);
            assert!(n < 30);
        }
        assert_eq!((d.shown.score, d.count), (0, 0));
        t += F120;
        d.advance(t);
        assert_eq!((d.shown.score, d.count), (1, 0));
        t += F120;
        d.advance(t);
        assert_eq!(d.count, 1);
        assert!(d.digits[0].changing && d.digits[0].ty.target() == -30.0);
        assert!(!d.digits[1].changing, "the tens did not change");
    }

    #[test]
    fn game_over_fades_the_button_in_and_its_press_restarts() {
        let mut d = demo(5.0);
        let mut t = 0.0;
        d.advance(t);
        // A loop the next move bites.
        {
            let g = d.game.as_mut().unwrap();
            g.snake = [(29, 29), (58, 29), (58, 58), (29, 58), (0, 58)]
                .iter()
                .map(|&(x, y)| Cell { x, y })
                .collect();
            g.direction = DOWN;
            g.moved_direction = LEFT;
            g.food = Some(Cell { x: 261, y: 261 });
        }
        let mut n = 0;
        while !d.game.as_ref().unwrap().is_game_over {
            t += F120;
            n += 1;
            d.advance(t);
            assert!(n < 30);
        }
        // Shown over at the next frame (the ticks stop); isGameOver the one after.
        t += F120;
        d.advance(t);
        assert!(d.shown.over && !d.over && d.overlay.target() == 0.0);
        let last = d.last_tick;
        t += F120;
        d.advance(t);
        assert!(d.over && d.overlay_auto && d.overlay.target() == 1.0 && d.overlay.value == 0.0);
        let start = t;
        while d.overlay.value < 1.0 {
            t += F120;
            d.advance(t);
        }
        assert!((t - start - 250.0).abs() < F120, "{}", t - start);
        assert_eq!(d.last_tick, last, "no tick while over");
        // A fling on the board now reaches the overlay, not the flings.
        let l = d.layout;
        d.input(&pointer(PointerPhase::Down, 20.0, l.board_top + 20.0, t));
        d.input(&pointer(
            PointerPhase::Move,
            120.0,
            l.board_top + 20.0,
            t + 30.0,
        ));
        d.input(&pointer(
            PointerPhase::Up,
            120.0,
            l.board_top + 20.0,
            t + 40.0,
        ));
        assert!(d.messages().is_empty());
        // The button: a touch that began in it restarts at its lift, inside or not.
        let (bx, by) = (l.button[0] + 5.0, l.button[1] + 5.0);
        d.input(&pointer(PointerPhase::Down, bx, by, t));
        d.input(&pointer(PointerPhase::Up, bx, by - 80.0, t + 50.0));
        assert_eq!(d.messages(), vec!["haptic:selection".to_string()]);
        assert!(!d.game.as_ref().unwrap().is_game_over);
        t += F120;
        d.advance(t);
        assert!(!d.over && !d.overlay_auto && !d.shown.over && d.overlay.target() == 0.0);
        // Restarted; the frame callback ticks at once (the last tick is long past), shown next.
        assert_eq!(d.shown.snake[0], Cell { x: 145, y: 145 });
        assert_eq!(d.game.as_ref().unwrap().snake[0], Cell { x: 174, y: 145 });
        t += F120;
        d.advance(t);
        assert_eq!(d.shown.snake[0], Cell { x: 174, y: 145 });
        // A cancelled press does nothing.
        d.overlay_auto = true;
        d.input(&pointer(PointerPhase::Down, bx, by, t));
        d.input(&pointer(PointerPhase::Cancel, bx, by, t + 10.0));
        assert!(d.messages().is_empty());
    }

    #[test]
    fn a_fling_on_the_board_turns_the_snake_with_a_haptic() {
        let mut d = demo(6.0);
        d.advance(0.0);
        let l = d.layout;
        let y = l.board_top + 100.0;
        // Up 60 pt in 60 ms: UP recognises on the move past 50 × (1 − 0.94 t).
        d.input(&pointer(PointerPhase::Down, 100.0, y, 1000.0));
        d.input(&pointer(PointerPhase::Move, 101.0, y - 30.0, 1030.0));
        assert!(d.messages().is_empty());
        d.input(&pointer(PointerPhase::Move, 102.0, y - 60.0, 1060.0));
        assert_eq!(d.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(d.game.as_ref().unwrap().direction, UP);
        d.input(&pointer(PointerPhase::Up, 102.0, y - 70.0, 1070.0));
        assert!(d.messages().is_empty(), "one per touch");
        // A refused reversal still buzzes (onDirectionChange runs regardless).
        d.input(&pointer(PointerPhase::Down, 200.0, y, 2000.0));
        d.input(&pointer(PointerPhase::Move, 140.0, y, 2040.0));
        d.input(&pointer(PointerPhase::Up, 140.0, y, 2050.0));
        assert_eq!(d.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(
            d.game.as_ref().unwrap().direction,
            UP,
            "LEFT is refused: it moved RIGHT"
        );
        // Off the board (the score row) nothing.
        d.input(&pointer(PointerPhase::Down, 100.0, 10.0, 3000.0));
        d.input(&pointer(PointerPhase::Move, 200.0, 10.0, 3040.0));
        d.input(&pointer(PointerPhase::Up, 200.0, 10.0, 3050.0));
        assert!(d.messages().is_empty());
        // Too slow: 20 pt by 0.5 s (26.5 needed then), so the move after it fails it.
        d.input(&pointer(PointerPhase::Down, 100.0, y, 4000.0));
        for i in 1..=10 {
            d.input(&pointer(
                PointerPhase::Move,
                100.0 + i as f32 * 2.0,
                y,
                4000.0 + i as f64 * 50.0,
            ));
        }
        d.input(&pointer(PointerPhase::Move, 100.0 + 80.0, y, 4600.0));
        d.input(&pointer(PointerPhase::Up, 180.0, y, 4610.0));
        assert!(d.messages().is_empty());
    }

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 290.0,
            height: 290.0 + 38.0 + 65.0 / 3.0 + 4.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    #[test]
    fn renders_the_score_the_count_and_the_board() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let px = |img: &fixture::Pixels, x: f32, y: f32| {
            let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
            [p[0] as i32, p[1] as i32, p[2] as i32]
        };
        let near = |a: [i32; 3], b: [i32; 3], tol: i32| (0..3).all(|k| (a[k] - b[k]).abs() <= tol);
        let hex = |rgb: u32| {
            [
                (rgb >> 16) as i32 & 255,
                (rgb >> 8) as i32 & 255,
                rgb as i32 & 255,
            ]
        };
        let mut s = demo(7.0);
        let mut t = 0.0;
        let (first, wants) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        first.save("snake-mount");
        assert!(wants);
        let l = s.layout;
        // The board's background, inside its rounded rect.
        assert!(
            near(px(&first, 5.0, l.board_top + 150.0), hex(BOARD), 1),
            "{:?}",
            px(&first, 5.0, l.board_top + 150.0)
        );
        // Outside the board's radius-10 corner: the card's white.
        assert!(near(px(&first, 0.5, l.board_top + 0.5), [255, 255, 255], 1));
        // The snake's head at (145, 145) of the board, its centre.
        assert!(near(
            px(&first, 145.0 + 14.5, l.board_top + 145.0 + 14.5),
            hex(SNAKE),
            2
        ));
        // Mid-roll: frame 1 at 120 Hz and on.
        let mut mid = false;
        while t < 2000.0 {
            t += F120;
            let (img, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            if !mid && t >= 100.0 {
                img.save("snake-roll");
                mid = true;
            }
        }
        let (rest, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        rest.save("snake-rest");
        // The count at rest: one "0", centred (translateX −21 puts digit 0 at the count's
        // middle); the hidden digits are white.
        let cx = l.count_x + 42.0 - 21.0 + 10.5;
        let cy = l.count_top + 15.0;
        let ink = |img: &fixture::Pixels, x0: f32, x1: f32| {
            let mut dark = 0;
            let (mut y, mut x);
            y = cy - 9.0;
            while y < cy + 9.0 {
                x = x0;
                while x < x1 {
                    if px(img, x, y)[0] < 128 {
                        dark += 1;
                    }
                    x += 1.0 / 3.0;
                }
                y += 1.0 / 3.0;
            }
            dark
        };
        assert!(ink(&rest, cx - 8.0, cx + 8.0) > 100, "a 0 in the middle");
        assert_eq!(ink(&rest, cx + 11.0, cx + 30.0), 0);
        assert_eq!(ink(&rest, cx - 30.0, cx - 11.0), 0);
        // The 0's counter is white-ish (blurred by σ 0.3 pt only), its stroke dark.
        assert!(px(&rest, cx, cy)[0] > 200, "{:?}", px(&rest, cx, cy));
        // "Score": gray ink in its line.
        let mut gray = 0;
        let mut x = l.score_x;
        while x < l.score_x + 50.0 {
            let p = px(&rest, x, 12.0);
            if p[0] < 200 && (p[0] - p[2]).abs() < 4 {
                gray += 1;
            }
            x += 1.0 / 3.0;
        }
        assert!(gray > 10, "{gray}");

        // Game over: the button over the board.
        {
            let g = s.game.as_mut().unwrap();
            g.snake = [(29, 29), (58, 29), (58, 58), (29, 58), (0, 58)]
                .iter()
                .map(|&(x, y)| Cell { x, y })
                .collect();
            g.direction = DOWN;
            g.moved_direction = LEFT;
        }
        let mut mid = false;
        let end = t + 1500.0;
        while t < end {
            t += F120;
            let (img, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            if !mid && s.overlay.value > 0.4 {
                img.save("snake-over-mid");
                mid = true;
            }
        }
        let (over, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        over.save("snake-over");
        assert_eq!(s.overlay.value, 1.0);
        let [bx, by, bw, bh] = l.button;
        assert!(
            near(px(&over, bx + 3.0, by + bh / 2.0), [0, 0, 0], 1),
            "{:?}",
            px(&over, bx + 3.0, by + bh / 2.0)
        );
        assert!(near(px(&over, bx - 1.0, by + bh / 2.0), hex(BOARD), 2));
        let mut white = 0;
        let mut x = bx + BUTTON_PAD_X;
        while x < bx + bw - BUTTON_PAD_X {
            if px(&over, x, by + bh / 2.0)[0] > 200 {
                white += 1;
            }
            x += 1.0 / 3.0;
        }
        assert!(white > 20, "the label: {white}");
    }
}
