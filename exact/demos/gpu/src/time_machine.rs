//! A drag-to-sort todo list on a card. Each reorder keeps the old list as a card behind it.
//! Dragging the screen down opens a stack of those cards over a starfield, a horizontal scroll
//! leafs through them, and dragging up closes the stack on the card in front. A second later the
//! history keeps only that card.
//!
//! - The cards sit in a horizontal scroll one window wide, each card 80% of the window. The
//!   starfield is a shader, blurred as the stack opens.
//! - Texts are drawn once at the screen's scale and resampled under each card's transform.
//! - Haptics: a light impact when a row drag starts, `haptic:selection` when the dragged row passes
//!   another row or the stack's front card changes (at most one per HAPTIC_GAP_MS), and a medium
//!   impact when a release opens or closes the stack.
//!
//! Input: the top safe-area inset.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing};
use skia::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::time_machine::{entry, module, Uniforms, GROUP_0, LAYER, SMP, U, UNDER};

/// Height of a todo row, pt.
const ROW: f64 = 70.0;
/// The most lists kept in the history.
const MAX_HISTORY: usize = 10;
/// The shortest gap between two haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-card line the stack scrolls before its front card's haptic plays, pt.
const SWITCH: f64 = 6.0;
/// The time machine pan's maxPanDistance.
const PAN_DISTANCE: f64 = 300.0;
/// The spring-smoothed progress of the time machine.
const PROGRESS: SpringConfig = SpringConfig {
    stiffness: 300.0,
    damping: 15.0,
    mass: 0.2,
};
/// The spring that moves a row to its slot.
const TOP: SpringConfig = SpringConfig {
    stiffness: 100.0,
    damping: 10.0,
    mass: 0.1,
};
/// The starting todos, by item number − 1.
const TODOS: [(&str, &str); 4] = [
    ("🐱", "Feed the cat"),
    ("🤸\u{200d}♂\u{fe0f}", "Flex useless animations"),
    ("🌱", "Water the plants"),
    ("🍎", "Buy groceries"),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(TimeMachine::new())
}

fn round_px(v: f64, s: f64) -> f64 {
    (v * s + 1e-4).round() / s
}
fn floor_px(v: f64, s: f64) -> f64 {
    (v * s + 1e-4).floor() / s
}
fn ceil_px(v: f64, s: f64) -> f64 {
    (v * s - 1e-4).ceil() / s
}

/// One history entry.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Entry {
    items: [u8; 4],
    key: u64,
}

/// One card's SortableList (fresh at every remount).
#[derive(Clone, Debug)]
struct List {
    pos: [f64; 4],
    top: [Spring; 4],
    tx: [Timing; 4],
    active: Option<usize>,
    was_last: [bool; 4],
    prev: [f64; 4],
    context_y: f64,
    /// The list's scroll offset, pt.
    oy: f64,
    /// A translateX timing whose callback checks for a drag end.
    pending: [bool; 4],
    dirty: bool,
}

impl List {
    fn new() -> List {
        let pos = [0.0, ROW, 2.0 * ROW, 3.0 * ROW];
        List {
            pos,
            top: pos.map(Spring::at),
            tx: std::array::from_fn(|_| Timing::at(0.0)),
            active: None,
            was_last: [false; 4],
            prev: pos,
            context_y: 0.0,
            oy: 0.0,
            pending: [false; 4],
            dirty: false,
        }
    }

    /// The item's slot: its index among the sorted positions (the first equal one), times the row.
    fn slot(&self, i: usize) -> f64 {
        let mut sorted = self.pos;
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted.iter().position(|&p| p == self.pos[i]).unwrap_or(i) as f64 * ROW
    }

    /// Each item's top is mapped in turn, so each sees the positions written before it.
    fn mappers(&mut self) {
        let mut changed = false;
        for i in 0..4 {
            if self.active == Some(i) {
                self.top[i] = Spring::at(self.pos[i]);
                continue;
            }
            let next = self.slot(i);
            if self.pos[i] != next {
                self.pos[i] = next;
                changed = true;
            }
            self.top[i].retarget(next, TOP);
        }
        self.dirty = changed;
    }

    fn top(&self, i: usize) -> f64 {
        if self.active == Some(i) {
            self.pos[i]
        } else {
            self.top[i].value
        }
    }

    fn z(&self, i: usize) -> i32 {
        if self.active == Some(i) {
            100
        } else if self.was_last[i] {
            50
        } else {
            0
        }
    }

    /// Item i's rank among the rows by position (how many are above it).
    fn rank(&self, i: usize) -> usize {
        (0..4).filter(|&k| k != i && self.pos[k] < self.pos[i]).count()
    }

    /// Draw (and hit) order: zIndex, then index.
    fn order(&self) -> [usize; 4] {
        let mut o = [0, 1, 2, 3];
        o.sort_by_key(|&i| self.z(i));
        o
    }

    /// Steps the springs and timings. A finished drag reports the new order if it moved.
    fn step(&mut self, now: f64) -> (bool, Option<[f64; 4]>) {
        if self.dirty || self.active.is_some() {
            self.mappers();
        }
        let mut moving = self.dirty || self.active.is_some();
        let mut end = None;
        for i in 0..4 {
            moving |= self.top[i].step(now);
            let was = self.tx[i].running;
            moving |= self.tx[i].step(now);
            if was && !self.tx[i].running && self.pending[i] {
                self.pending[i] = false;
                if self.prev != self.pos {
                    end = Some(self.pos);
                }
            }
        }
        (moving, end)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Claim {
    /// The time machine pan may still activate; the scroll may still begin.
    Pending,
    /// The time machine pan is active, translation from `origin`.
    Machine { origin: (f32, f32) },
    /// The horizontal ScrollView took the touch.
    Scroll,
    /// An item drag on card `card`, row `row`.
    Item { card: usize, row: usize },
    /// Nothing (the pan failed).
    None,
}

#[derive(Clone, Copy, Debug)]
struct Touch {
    id: u32,
    down: (f32, f32),
    claim: Claim,
}

/// The card and text geometry, in points, for a window.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f64,
    h: f64,
    s: f64,
    /// The list's top in the card.
    list_y: f64,
    /// The row View's x and width.
    row_x: f64,
    row_w: f64,
    /// The background line's x.
    line_x: f64,
    /// The emoji box (x, y, w, h) and the title box, relative to the content View.
    emoji: [f64; 4],
    title: [f64; 4],
}

impl Layout {
    fn new(w: f64, h: f64, s: f64, emoji: (f64, f64)) -> Layout {
        let list_y = round_px((h - 4.0 * ROW) / 2.0, s);
        let row_x = round_px(w * 0.1, s);
        let row_w = round_px(w * 0.1 + w * 0.8, s) - row_x;
        let line_x = round_px((w - 2.0) / 2.0, s);
        // The content box: 16 pt of side padding, 60 pt high.
        let content_w = row_w - 8.0;
        let (ew, eh) = (ceil_px(emoji.0 + 1e-3, s), ceil_px(emoji.1, s));
        let ex = 17.0;
        let ey = floor_px(1.0 + (60.0 - eh) / 2.0, s);
        let th = ceil_px(TITLE_LINE, s);
        let tx = floor_px(ex + ew + 12.0, s);
        let tw = (content_w - 17.0) - (ex + ew + 12.0);
        let ty = floor_px(1.0 + (60.0 - th) / 2.0, s);
        Layout {
            w,
            h,
            s,
            list_y,
            row_x,
            row_w,
            line_x,
            emoji: [ex, ey, ew, eh],
            title: [tx, ty, tw.max(0.0), th],
        }
    }
}

/// The line height of the system font at 16 pt.
const TITLE_LINE: f64 = 2444.0 / 2048.0 * 16.0;

struct TimeMachine {
    safe_top: f64,
    history: Vec<Entry>,
    lists: Vec<List>,
    active_key: u64,
    next_key: u64,
    tm: f64,
    prev_tm: f64,
    progress: Spring,
    active: bool,
    active_ms: f64,
    last_ms: Option<f64>,
    scroll: UiScroll,
    touch: Option<Touch>,
    samples: Vec<(f32, f32, f64)>,
    /// When the history is trimmed to the active list: the time and the list.
    prune: Option<(f64, u64)>,
    now: f64,
    layout: Layout,
    posted: Vec<String>,
    /// When the last haptic was posted, ms.
    haptic_at: f64,
    /// The dragged row's rank, and the stack's front card, as their haptics last saw them.
    item_rank: usize,
    card_index: usize,
    title_font: Option<Font>,
    gpu: Option<Gpu>,
}

struct Gpu {
    key: (u32, u32, u32, wgpu::TextureFormat, u32),
    pipelines: [wgpu::RenderPipeline; 4],
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    sharp: wgpu::TextureView,
    acc: [wgpu::TextureView; 2],
    group: wgpu::TextureView,
    empty: wgpu::TextureView,
    /// The shader's last iTime (NaN: never drawn).
    sharp_time: f64,
    blur: GraphiteBlur,
    plan: Option<GraphitePlan>,
    uniforms: Vec<wgpu::Buffer>,
    sprites: Images,
    sprites_drawn: bool,
    emoji: Option<Images>,
    sprite_canvas: Canvas,
    sprite_renderer: Renderer,
    canvases: Vec<(Canvas, Renderer)>,
}

/// The sprite atlas: per todo (row k), the emoji at (0, k · pitch) and the title at
/// (EMOJI_GAP + emoji width, k · pitch), in pixels.
fn sprite_pitch(s: f64) -> u32 {
    (30.0 * s).ceil() as u32 + 2
}

impl TimeMachine {
    fn new() -> TimeMachine {
        let key = 1;
        TimeMachine {
            safe_top: 0.0,
            history: vec![Entry {
                items: [1, 2, 3, 4],
                key,
            }],
            lists: vec![List::new()],
            active_key: key,
            next_key: 2,
            tm: 0.0,
            prev_tm: 0.0,
            progress: Spring::at(0.0),
            active: false,
            active_ms: 0.0,
            last_ms: None,
            scroll: UiScroll::new(0.0, 0.0, 1.0, FAST, Snap::IntervalCurrent(1.0)),
            touch: None,
            samples: Vec::new(),
            prune: None,
            now: 0.0,
            layout: Layout::default(),
            posted: Vec::new(),
            haptic_at: f64::NEG_INFINITY,
            item_rank: 0,
            card_index: 0,
            title_font: skia::match_ui_font(16.0, 500.0),
            gpu: None,
        }
    }

    fn sw(&self) -> f64 {
        self.layout.w * 0.8
    }

    fn active_index(&self) -> usize {
        let sw = self.sw();
        if sw <= 0.0 {
            return 0;
        }
        (self.scroll.offset / sw).round().max(0.0) as usize
    }

    /// The history changed: every card remounts, the scroll's range follows.
    fn remount(&mut self) {
        self.lists = vec![List::new(); self.history.len()];
        let sw = self.sw().max(1.0);
        let max = sw * (self.history.len().max(1) - 1) as f64;
        let mut offset = self.scroll.offset;
        if offset > max {
            // Scroll to the newest card, without animation.
            offset = max;
            self.scroll =
                UiScroll::new(offset, max, self.layout.w, FAST, Snap::IntervalCurrent(sw));
        } else {
            self.scroll.max = max;
        }
        self.card_index = self.active_index();
    }

    /// A haptic at `at` (ms); a selection only HAPTIC_GAP_MS after the last one.
    fn haptic(&mut self, kind: &str, at: f64) {
        if kind == "selection" && at - self.haptic_at < HAPTIC_GAP_MS {
            return;
        }
        self.posted.push(format!("haptic:{kind}"));
        self.haptic_at = at;
    }

    fn set_tm(&mut self, v: f64) {
        self.tm = v;
        // Active while the stack is open: scrolling is enabled and the shader's time pauses.
        self.active = v > 0.5;
    }

    fn on_close(&mut self) {
        let i = self.active_index();
        let Some(item) = self.history.get(i).copied() else {
            return;
        };
        if item.key == self.active_key {
            return;
        }
        self.active_key = item.key;
        self.prune = Some((self.now + 1000.0, item.key));
    }

    fn drag_end(&mut self, card: usize, pos: [f64; 4]) {
        let Some(entry) = self.history.get(card).copied() else {
            return;
        };
        let mut order = [0usize, 1, 2, 3];
        order.sort_by(|&a, &b| pos[a].partial_cmp(&pos[b]).unwrap());
        let items = order.map(|i| entry.items[i]);
        let key = self.next_key;
        self.next_key += 1;
        self.active_key = key;
        self.history.insert(0, Entry { items, key });
        self.history.truncate(MAX_HISTORY);
        self.remount();
    }

    /// Card i's transform (its local points to the screen's).
    fn card_matrix(&self, i: usize) -> Matrix {
        let (w, h) = (self.layout.w as f32, self.layout.h as f32);
        let f = self.scroll.offset / self.sw().max(1.0);
        let i = i as f64;
        let range = [i - 2.0, i - 1.0, i, i + 1.0];
        let tx1 = interpolate(
            f,
            &range,
            &[120.0, 60.0, 0.0, -self.sw()],
            Extrapolation::Clamp,
        );
        let s1 = interpolate(f, &range, &[0.8, 0.9, 1.0, 1.0], Extrapolation::Clamp);
        let p = self.progress.value;
        let s2 = interpolate(p, &[0.0, 1.0], &[1.0, 0.7], Extrapolation::Extend);
        let tx2 = interpolate(p, &[0.0, 1.0], &[0.0, -30.0], Extrapolation::Extend);
        let k = (s1 * s2) as f32;
        Matrix::translate(-w / 2.0, -h / 2.0)
            .then(Matrix::translate(tx2 as f32, 0.0))
            .then(Matrix::scale(k, k))
            .then(Matrix::translate(w / 2.0 + tx1 as f32, h / 2.0))
    }

    fn card_opacity(&self, i: usize) -> f64 {
        if self.active_index() == i {
            1.0
        } else {
            self.progress.value.powi(3).clamp(0.0, 1.0)
        }
    }

    /// The item a touch at (x, y) lands on: the first card that takes touches (pointerEvents
    /// auto, alpha ≥ 0.01) under it, then its rows by zIndex, inside the list's clip.
    fn hit_item(&self, x: f32, y: f32) -> Option<(usize, usize)> {
        if self.progress.value > 0.1 {
            return None;
        }
        let l = self.layout;
        for i in 0..self.history.len() {
            if self.card_opacity(i) < 0.01 {
                continue;
            }
            let q = self.card_matrix(i).invert().apply(skia::point(x, y));
            let (qx, qy) = (q.x as f64, q.y as f64);
            if qx < 0.0 || qy < 0.0 || qx > l.w || qy > l.h {
                continue;
            }
            if qy < l.list_y || qy > l.list_y + 4.0 * ROW {
                return None;
            }
            let list = &self.lists[i];
            for &r in list.order().iter().rev() {
                let top = l.list_y + list.top(r) - list.oy;
                let left = list.tx[r].value;
                if qy >= top && qy <= top + ROW && qx >= left && qx <= left + l.w {
                    return Some((i, r));
                }
            }
            return None;
        }
        None
    }

    fn velocity_y(&self) -> f64 {
        let Some(&last) = self.samples.last() else {
            return 0.0;
        };
        let first = self
            .samples
            .iter()
            .find(|s| last.2 - s.2 <= 100.0)
            .copied()
            .unwrap_or(last);
        let dt = (last.2 - first.2) / 1000.0;
        if dt <= 0.0 {
            0.0
        } else {
            (last.1 - first.1) as f64 / dt
        }
    }

    fn sample(&mut self, x: f32, y: f32, ms: f64) {
        if self.samples.last().is_some_and(|s| s.0 == x && s.1 == y) {
            return;
        }
        self.samples.retain(|s| ms - s.2 <= 150.0);
        self.samples.push((x, y, ms));
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64) {
        self.now = self.now.max(at_ms);
        if phase == Phase::Down {
            if self.touch.is_some() {
                return;
            }
            self.samples.clear();
            self.sample(x, y, at_ms);
            // Begins the time machine pan; an item drag cancels it at once.
            self.prev_tm = self.tm;
            let claim = if let Some((card, row)) = self.hit_item(x, y) {
                let list = &mut self.lists[card];
                list.prev = list.pos;
                // Row 0 is skipped by the reaction's truthiness check.
                if row != 0 {
                    for k in 0..4 {
                        list.was_last[k] = k == row;
                    }
                }
                list.active = Some(row);
                list.context_y = list.pos[row] - list.oy;
                list.tx[row].set(0.0);
                list.pending[row] = false;
                list.dirty = true;
                self.item_rank = list.rank(row);
                self.haptic("impact-light", at_ms);
                Claim::Item { card, row }
            } else {
                if self.active {
                    self.scroll.input(id, phase, x, y, at_ms, true);
                }
                Claim::Pending
            };
            self.touch = Some(Touch {
                id,
                down: (x, y),
                claim,
            });
            return;
        }
        let Some(mut t) = self.touch else { return };
        if t.id != id {
            return;
        }
        self.sample(x, y, at_ms);
        let (dx, dy) = (x - t.down.0, y - t.down.1);
        let lift = matches!(phase, Phase::Up | Phase::Cancel);
        // The dragged row's rank after this move.
        let mut rank = None;
        match t.claim {
            Claim::Item { card, row } => {
                let list = &mut self.lists[card];
                if !lift {
                    list.tx[row].set(dx as f64);
                    list.pos[row] = list.context_y + dy as f64 + list.oy;
                    list.dirty = true;
                    // Scroll the list when the drag reaches its edge.
                    let lower = 1.5 * ROW;
                    let container = self.layout.h - self.safe_top;
                    let speed = ROW * 0.1;
                    if (y as f64) <= lower {
                        list.oy = (list.oy - speed).max(0.0);
                    } else if y as f64 + list.oy >= list.oy + container {
                        list.oy = (list.oy + speed).max(0.0);
                    }
                    rank = Some(list.rank(row));
                } else {
                    list.tx[row].to(0.0, 300.0, Easing::timing_default());
                    list.pending[row] = true;
                    list.was_last[row] = true;
                    list.active = None;
                    list.dirty = true;
                }
            }
            Claim::Pending => {
                if self.active {
                    self.scroll.input(id, phase, x, y, at_ms, true);
                }
                if lift {
                    // The pan never activated (onFinalize only).
                } else if self.active && self.scroll.dragging() {
                    t.claim = Claim::Scroll;
                } else if dx.abs() > 20.0 {
                    t.claim = Claim::None;
                } else if dy.abs() > 10.0 {
                    // The pan's translation restarts at the activation.
                    t.claim = Claim::Machine { origin: (x, y) };
                    if self.active {
                        self.scroll.input(id, Phase::Cancel, x, y, at_ms, true);
                    }
                }
            }
            Claim::Scroll => self.scroll.input(id, phase, x, y, at_ms, true),
            Claim::Machine { origin } => {
                let ty = (y - origin.1) as f64;
                if !lift {
                    self.set_tm((self.prev_tm + ty / PAN_DISTANCE).clamp(0.0, 1.0));
                } else if phase == Phase::Up {
                    let vy = self.velocity_y();
                    if ty > 100.0 || vy > 500.0 {
                        self.set_tm(1.0);
                    } else if ty < -50.0 || vy < -300.0 {
                        self.set_tm(0.0);
                        self.on_close();
                    } else {
                        let to = if self.tm > 0.5 { 1.0 } else { 0.0 };
                        if to == 0.0 {
                            self.on_close();
                        }
                        self.set_tm(to);
                    }
                    if (self.tm > 0.5) != (self.prev_tm > 0.5) {
                        // The release opens or closes the time machine.
                        self.haptic("impact-medium", at_ms);
                    }
                }
            }
            Claim::None => {}
        }
        if let Some(rank) = rank {
            if rank != self.item_rank {
                self.item_rank = rank;
                self.haptic("selection", at_ms);
            }
        }
        self.touch = if lift { None } else { Some(t) };
    }

    fn step(&mut self, now: f64) -> bool {
        self.now = self.now.max(now);
        let dt = self.last_ms.map_or(0.0, |l| (now - l).max(0.0));
        self.last_ms = Some(now);
        if self.active {
            self.active_ms += dt;
        }
        if self.progress.target() != self.tm {
            self.progress.retarget(self.tm, PROGRESS);
        }
        let mut moving = self.progress.step(now);
        moving |= self.scroll.step(now);
        // The front card the haptics feel holds until the offset is SWITCH past the half-card
        // line: a finger holding the stack there does not flap.
        let sw = self.sw();
        let held = sw > 0.0 && (self.scroll.offset / sw - self.card_index as f64).abs() < 0.5 + SWITCH / sw;
        let index = self.active_index();
        if index != self.card_index && !held {
            self.card_index = index;
            if self.active {
                self.haptic("selection", now);
            }
        }
        let mut ended = None;
        for (i, list) in self.lists.iter_mut().enumerate() {
            let (m, end) = list.step(now);
            moving |= m;
            if let Some(p) = end {
                ended = Some((i, p));
            }
        }
        if let Some((i, p)) = ended {
            self.drag_end(i, p);
            moving = true;
        }
        if let Some((at, key)) = self.prune {
            if now >= at {
                self.prune = None;
                if self.history.iter().any(|e| e.key == key) {
                    self.history.retain(|e| e.key == key);
                    self.remount();
                }
            } else {
                moving = true;
            }
        }
        moving || self.active || self.touch.is_some()
    }

    /// The shader's time: a triangle wave over the active time.
    fn itime(&self) -> f64 {
        let c = self.active_ms.rem_euclid(200_000.0);
        if c < 100_000.0 {
            c / 10_000.0
        } else {
            10.0 - (c - 100_000.0) / 10_000.0
        }
    }

    /// One card into `c`: its shadow, content, rows and texts, under its transform.
    fn record_card(&self, c: &mut Canvas, i: usize, sprites: Option<&Images>) {
        let l = self.layout;
        let (w, h) = (l.w as f32, l.h as f32);
        c.save();
        c.concat(self.card_matrix(i));
        // The container's boxShadow, outside its (square) box.
        c.save();
        let e = 20.0;
        c.clip_with(|p| {
            skia::add_rect(p, -e, -e, w + 2.0 * e, h + 2.0 * e);
            skia::add_rrect_hole(p, 0.0, 0.0, w, h, 0.0);
        });
        c.draw_rrect_shadow(
            0.0,
            0.0,
            w,
            h,
            0.0,
            5.0,
            Color::BLACK.alpha(0x88 as f32 / 255.0),
        );
        c.restore();
        c.clip_continuous_rrect(0.0, 0.0, w, h, 25.0);
        c.draw_continuous_rrect(
            0.0,
            0.0,
            w,
            h,
            25.0,
            &Paint::fill(Color::view_hex(0xf3f3f3)),
        );
        let list = &self.lists[i];
        let ly = l.list_y as f32;
        c.clip_rect(0.0, ly, w, 4.0 * ROW as f32);
        let oy = list.oy as f32;
        // The row separators: 2 pt lines.
        for k in 0..4 {
            let y = ly + k as f32 * ROW as f32 - oy;
            c.draw_continuous_rrect(
                l.line_x as f32,
                y,
                2.0,
                ROW as f32,
                1.0,
                &Paint::fill(Color::view_hex(0xf8f8f8)),
            );
            c.draw_rrect(
                l.line_x as f32,
                y,
                2.0,
                ROW as f32,
                1.0,
                &Paint::fill(Color::view_hex(0xe0e0e0)),
            );
        }
        let entry = self.history[i];
        let s = l.s as f32;
        for r in list.order() {
            let x = (l.row_x + 4.0 + list.tx[r].value) as f32;
            let y = ly + (list.top(r) - list.oy + 4.0) as f32;
            let (cw, ch) = ((l.row_w - 8.0) as f32, 62.0);
            c.save();
            c.clip_with(|p| {
                skia::add_rect(p, x - e, y - e, cw + 2.0 * e, ch + 2.0 * e);
                skia::add_continuous_rrect_hole(p, x, y, cw, ch, 8.0);
            });
            c.draw_rrect_shadow(x, y, cw, ch, 8.0, 5.0, Color::BLACK.alpha(0.01));
            c.restore();
            c.draw_continuous_rrect(x, y, cw, ch, 8.0, &Paint::fill(Color::view_hex(0xf7f7f7)));
            c.draw_path(
                &skia::border_ring_path(x, y, cw, ch, 8.0, 1.0),
                &Paint::fill(Color::view_hex(0xf0f0f0)),
            );
            let Some(sprites) = sprites else { continue };
            let k = (entry.items[r] - 1) as usize;
            let row_px = (k as u32 * sprite_pitch(l.s)) as f32;
            for (b, px) in [(l.emoji, 0.0), (l.title, self.title_x_px())] {
                let (bx, by) = (x + b[0] as f32, y + b[1] as f32);
                let (bw, bh) = (b[2] as f32, b[3] as f32);
                c.draw_rect(
                    bx,
                    by,
                    bw,
                    bh,
                    &Paint::shader(Shader::Image {
                        image: sprites.image(0),
                        to_image: Matrix::translate(-bx, -by)
                            .then(Matrix::scale(s, s))
                            .then(Matrix::translate(px, row_px)),
                    }),
                );
            }
        }
        c.restore();
    }

    fn title_x_px(&self) -> f32 {
        ((self.layout.emoji[2] * self.layout.s).round() + 4.0) as f32
    }
}

#[cfg(target_vendor = "apple")]
mod emoji {
    //! Emoji drawn as TextKit draws them: one CoreText line in the system emoji face, into an sRGB
    //! premultiplied bitmap at the screen's scale.
    use std::ffi::c_void;
    type Ref = *const c_void;
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;
        fn CFRelease(cf: Ref);
        fn CFStringCreateWithBytes(
            alloc: Ref,
            bytes: *const u8,
            len: isize,
            encoding: u32,
            external: bool,
        ) -> Ref;
        fn CFDictionaryCreate(
            alloc: Ref,
            keys: *const Ref,
            values: *const Ref,
            n: isize,
            kc: *const c_void,
            vc: *const c_void,
        ) -> Ref;
        fn CFAttributedStringCreate(alloc: Ref, s: Ref, attributes: Ref) -> Ref;
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        static kCGColorSpaceSRGB: Ref;
        fn CGColorSpaceCreateWithName(name: Ref) -> Ref;
        fn CGColorSpaceRelease(space: Ref);
        fn CGBitmapContextCreate(
            data: *mut c_void,
            width: usize,
            height: usize,
            bpc: usize,
            bpr: usize,
            space: Ref,
            info: u32,
        ) -> Ref;
        fn CGContextRelease(c: Ref);
        fn CGContextScaleCTM(c: Ref, sx: f64, sy: f64);
        fn CGContextSetTextPosition(c: Ref, x: f64, y: f64);
    }
    #[link(name = "CoreText", kind = "framework")]
    extern "C" {
        static kCTFontAttributeName: Ref;
        fn CTFontCreateUIFontForLanguage(kind: u32, size: f64, language: Ref) -> Ref;
        fn CTLineCreateWithAttributedString(s: Ref) -> Ref;
        fn CTLineGetTypographicBounds(
            line: Ref,
            ascent: *mut f64,
            descent: *mut f64,
            leading: *mut f64,
        ) -> f64;
        fn CTLineDraw(line: Ref, c: Ref);
    }
    const SYSTEM: u32 = 2; // kCTFontUIFontSystem
    const UTF8: u32 = 0x0800_0100;

    /// (advance, ascent + descent) in points, and the box's RGBA8 pixels (w, h).
    pub fn draw(text: &str, size: f64, scale: f64) -> Option<(f64, f64, u32, u32, Vec<u8>)> {
        unsafe {
            let font = CTFontCreateUIFontForLanguage(SYSTEM, size, std::ptr::null());
            if font.is_null() {
                return None;
            }
            let s = CFStringCreateWithBytes(
                std::ptr::null(),
                text.as_ptr(),
                text.len() as isize,
                UTF8,
                false,
            );
            let keys = [kCTFontAttributeName];
            let values = [font];
            let attrs = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );
            let a = CFAttributedStringCreate(std::ptr::null(), s, attrs);
            let line = CTLineCreateWithAttributedString(a);
            let (mut asc, mut desc, mut lead) = (0.0, 0.0, 0.0);
            let adv = CTLineGetTypographicBounds(line, &mut asc, &mut desc, &mut lead);
            // The measure, ceiled to the pixel after an epsilon.
            let w = (adv * scale + 1e-3).ceil().max(1.0) as u32;
            let h = ((asc + desc) * scale + 1e-3).ceil().max(1.0) as u32;
            let mut px = vec![0u8; (w * h * 4) as usize];
            let cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
            let ctx = CGBitmapContextCreate(
                px.as_mut_ptr() as *mut c_void,
                w as usize,
                h as usize,
                8,
                (w * 4) as usize,
                cs,
                1,
            );
            if !ctx.is_null() {
                CGContextScaleCTM(ctx, scale, scale);
                CGContextSetTextPosition(ctx, 0.0, h as f64 / scale - asc);
                CTLineDraw(line, ctx);
                CGContextRelease(ctx);
            }
            CGColorSpaceRelease(cs);
            CFRelease(line);
            CFRelease(a);
            CFRelease(attrs);
            CFRelease(s);
            CFRelease(font);
            Some((adv, asc + desc, w, h, px))
        }
    }
}

/// The emoji's advance and line height, in points.
fn emoji_metrics() -> (f64, f64) {
    #[cfg(target_vendor = "apple")]
    if let Some((adv, lh, ..)) = emoji::draw(TODOS[0].0, 24.0, 1.0) {
        return (adv, lh);
    }
    (24.0, (762.0 + 193.0) / 800.0 * 24.0)
}

impl Surface for TimeMachine {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
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
        self.pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let orders: Vec<String> = self
            .history
            .iter()
            .map(|e| {
                format!(
                    "[{},{},{},{}]",
                    e.items[0], e.items[1], e.items[2], e.items[3]
                )
            })
            .collect();
        Some(format!(
            "{{\"timeMachine\":{:.4},\"progress\":{:.4},\"active\":{},\"activeIndex\":{},\"offset\":{:.2},\"history\":[{}],\"held\":{}}}",
            self.tm,
            self.progress.value,
            self.active,
            self.active_index(),
            self.scroll.offset,
            orders.join(","),
            self.touch.is_some()
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
        let s = frame.scale as f64;
        let (w, h) = (frame.width as f64, frame.height as f64);
        let (pw, ph) = frame.pixels();
        if (self.layout.w, self.layout.h, self.layout.s) != (w, h, s) {
            self.layout = Layout::new(w, h, s, emoji_metrics());
            let sw = w * 0.8;
            let max = sw * (self.history.len() - 1) as f64;
            self.scroll = UiScroll::new(
                self.scroll.offset.min(max),
                max,
                w,
                FAST,
                Snap::IntervalCurrent(sw),
            );
        }
        let moving = self.step(frame.now_ms);

        let key = (
            pw,
            ph,
            frame.scale.to_bits(),
            format,
            frame.shader_generation,
        );
        if self.gpu.as_ref().map(|g| g.key) != Some(key) {
            self.gpu = Some(build(device, queue, key, &self.layout));
        }
        let mut gpu = self.gpu.take().unwrap();

        // The text backing stores, once.
        if !gpu.sprites_drawn {
            let c = &mut gpu.sprite_canvas;
            c.begin(frame.scale);
            let pitch = sprite_pitch(s) as f32;
            let tx = self.title_x_px();
            if let Some(font) = self.title_font.as_ref() {
                for (k, (_, title)) in TODOS.iter().enumerate() {
                    let top = k as f32 * pitch / frame.scale;
                    c.draw_text(
                        title,
                        tx / frame.scale,
                        gfx::baseline(font, top),
                        font,
                        &Paint::fill(Color::view_hex(0x333333)),
                    );
                }
            }
            if let Some(emoji) = gpu.emoji.as_ref() {
                for k in 0..TODOS.len() {
                    let im = emoji.image(k);
                    let y = k as f32 * pitch / frame.scale;
                    let (ew, eh) = (im.width / frame.scale, im.height / frame.scale);
                    c.draw_rect(
                        0.0,
                        y,
                        ew,
                        eh,
                        &Paint::shader(Shader::ImageNearest {
                            image: im,
                            to_image: Matrix::translate(0.0, -y)
                                .then(Matrix::scale(frame.scale, frame.scale)),
                            subset: [0.0, 0.0, im.width, im.height],
                        }),
                    );
                }
                gpu.sprite_renderer.set_images(emoji);
            }
            let view = gpu.sprites.render_view();
            let (sw, sh) = (
                gpu.sprites.image(0).width as u32,
                gpu.sprites.image(0).height as u32,
            );
            gpu.sprite_renderer.draw(
                device,
                queue,
                encoder,
                &gpu.sprite_canvas,
                &view,
                GRAPHITE_FORMAT,
                sw,
                sh,
                wgpu::Color::TRANSPARENT,
            );
            gpu.sprites_drawn = true;
        }

        // The background: the shader's layer (redrawn when iTime moves), blurred by σ.
        let itime = self.itime();
        let mut slot = 0usize;
        let uniform = |gpu: &mut Gpu, slot: &mut usize, u: Uniforms| -> usize {
            if gpu.uniforms.len() <= *slot {
                gpu.uniforms
                    .push(device.create_buffer(&wgpu::BufferDescriptor {
                        label: Some("time machine"),
                        size: Uniforms::SIZE as u64,
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    }));
            }
            queue.write_buffer(&gpu.uniforms[*slot], 0, &u.bytes());
            *slot += 1;
            *slot - 1
        };
        let base = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, 0.0],
            star: [w as f32, h as f32, itime as f32, 0.0],
            low: [0.0; 4],
            output: [0.0; 4],
            blend: [1.0, 0.0, 0.0, 0.0],
        };
        if gpu.sharp_time != itime {
            let k = uniform(&mut gpu, &mut slot, base);
            let bind = bind(device, &gpu, k, &gpu.empty, &gpu.empty);
            skia::render::fullscreen_pass(
                encoder,
                "time machine stars",
                &gpu.sharp,
                &gpu.pipelines[0],
                &bind,
            );
            gpu.sharp_time = itime;
        }
        let sigma =
            (interpolate(self.tm, &[1.0, 0.0], &[0.0, 15.0], Extrapolation::Extend) * s) as f32;
        let whole = [0, 0, pw as i32, ph as i32];
        let plan = if sigma > 0.0 {
            GraphitePlan::new(whole, whole, sigma)
        } else {
            None
        };
        // `under`: what the cards are composed over.
        let mut under = 0usize; // 0 sharp, 1/2 acc
        if let Some(plan) = plan {
            let out = gpu.blur.run(
                device,
                queue,
                encoder,
                Placed {
                    view: &gpu.sharp,
                    origin: [0, 0],
                    size: [pw, ph],
                },
                &plan,
            );
            let src = plan.src_rect.map(|v| v as f32);
            let low = plan.low_bounds;
            let kx = (low[2] - low[0]) / (src[2] - src[0]);
            let ky = (low[3] - low[1]) / (src[3] - src[1]);
            let (ow, oh) = (out.size[0] as f32, out.size[1] as f32);
            let u = Uniforms {
                low: [
                    kx / ow,
                    ky / oh,
                    (low[0] - src[0] * kx - out.origin[0] as f32) / ow,
                    (low[1] - src[1] * ky - out.origin[1] as f32) / oh,
                ],
                output: plan.output.map(|v| v as f32),
                ..base
            };
            let view = out.view.clone();
            let k = uniform(&mut gpu, &mut slot, u);
            let bind = bind(device, &gpu, k, &gpu.empty, &view);
            skia::render::fullscreen_pass(
                encoder,
                "time machine blur",
                &gpu.acc[0],
                &gpu.pipelines[1],
                &bind,
            );
            under = 1;
            gpu.plan = Some(plan);
        }

        // The cards, back to front, in groups: a run of opaque cards is one group; each card at
        // an opacity under 1 is its own (Core Animation's group opacity). A card whose opacity
        // can't move a level is skipped, as one off screen.
        let mut groups: Vec<(f32, Vec<usize>)> = Vec::new();
        for i in (0..self.history.len()).rev() {
            let a = self.card_opacity(i) as f32;
            if a * 255.0 < 0.5 || !self.card_visible(i) {
                continue;
            }
            match groups.last_mut() {
                Some((1.0, cards)) if a >= 1.0 => cards.push(i),
                _ => groups.push((a.min(1.0), vec![i])),
            }
        }
        if groups.is_empty() {
            groups.push((0.0, Vec::new()));
        }
        while gpu.canvases.len() < groups.len() {
            let mut r = Renderer::default();
            r.set_images(&gpu.sprites);
            gpu.canvases.push((Canvas::default(), r));
        }
        let n = groups.len();
        for (g, (a, cards)) in groups.iter().enumerate() {
            let mut canvases = std::mem::take(&mut gpu.canvases);
            let (c, r) = &mut canvases[g];
            c.begin(frame.scale);
            for &i in cards {
                self.record_card(c, i, Some(&gpu.sprites));
            }
            r.draw(
                device,
                queue,
                encoder,
                c,
                &gpu.group,
                GRAPHITE_FORMAT,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
            gpu.canvases = canvases;
            let last = g + 1 == n;
            let u = Uniforms {
                canvas: [
                    pw as f32,
                    ph as f32,
                    frame.scale,
                    if last { gfx::srgb_flag(format) } else { 0.0 },
                ],
                blend: [*a, 0.0, 0.0, 0.0],
                ..base
            };
            let k = uniform(&mut gpu, &mut slot, u);
            let from = if under == 0 {
                &gpu.sharp
            } else {
                &gpu.acc[under - 1]
            };
            let bind = bind(device, &gpu, k, from, &gpu.group);
            if last {
                skia::render::fullscreen_pass(
                    encoder,
                    "time machine cards",
                    target,
                    &gpu.pipelines[3],
                    &bind,
                );
            } else {
                let to = if under == 1 { 2 } else { 1 };
                skia::render::fullscreen_pass(
                    encoder,
                    "time machine cards",
                    &gpu.acc[to - 1],
                    &gpu.pipelines[2],
                    &bind,
                );
                under = to;
            }
        }
        self.gpu = Some(gpu);
        moving
    }
}

impl TimeMachine {
    /// Whether any of card i lies on screen (its box and shadow, transformed).
    fn card_visible(&self, i: usize) -> bool {
        let m = self.card_matrix(i);
        let (w, h) = (self.layout.w as f32, self.layout.h as f32);
        let (a, b) = (
            m.apply(skia::point(-15.0, -15.0)),
            m.apply(skia::point(w + 15.0, h + 15.0)),
        );
        a.x < w && b.x > 0.0 && a.y < h && b.y > 0.0
    }
}

fn bind(
    device: &wgpu::Device,
    gpu: &Gpu,
    slot: usize,
    under: &wgpu::TextureView,
    layer: &wgpu::TextureView,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("time machine"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: gpu.uniforms[slot].as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: UNDER.binding,
                resource: wgpu::BindingResource::TextureView(under),
            },
            wgpu::BindGroupEntry {
                binding: LAYER.binding,
                resource: wgpu::BindingResource::TextureView(layer),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
            },
        ],
    })
}

fn build(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    key: (u32, u32, u32, wgpu::TextureFormat, u32),
    layout: &Layout,
) -> Gpu {
    let (pw, ph, _, format, _) = key;
    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let pipe =
        |fs: &str, f| skia::render::fullscreen_pipeline(device, &shader, &group, fs, f, None);
    let pipelines = [
        pipe(entry::STAR, GRAPHITE_FORMAT),
        pipe(entry::UNBLUR, GRAPHITE_FORMAT),
        pipe(entry::BLEND, GRAPHITE_FORMAT),
        pipe(entry::BLEND, format),
    ];
    let t = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pw, ph);
    let s = layout.s;
    let pitch = sprite_pitch(s);
    let sprite_w =
        ((layout.emoji[2] * s).round() + 4.0 + (layout.title[2] * s).ceil() + 2.0) as u32;
    #[allow(unused_mut)]
    let mut emoji = None;
    #[cfg(target_vendor = "apple")]
    {
        let images: Vec<skia::Image> = TODOS
            .iter()
            .filter_map(|(e, _)| emoji::draw(e, 24.0, s))
            .map(|(_, _, w, h, px)| skia::Image::from_rgba(w, h, px))
            .collect();
        if images.len() == TODOS.len() {
            let refs: Vec<&skia::Image> = images.iter().collect();
            emoji = Some(Images::upload(device, queue, &refs));
        }
    }
    Gpu {
        key,
        pipelines,
        layout: group,
        sampler: skia::render::linear_sampler(device),
        sharp: t("time machine stars"),
        acc: [t("time machine under"), t("time machine under")],
        group: t("time machine group"),
        empty: skia::render::sampled_target(device, "time machine empty", GRAPHITE_FORMAT, 1, 1),
        sharp_time: f64::NAN,
        blur: GraphiteBlur::default(),
        plan: None,
        uniforms: Vec::new(),
        sprites: Images::target(device, sprite_w.max(1), pitch * TODOS.len() as u32),
        sprites_drawn: false,
        emoji,
        sprite_canvas: Canvas::default(),
        sprite_renderer: Renderer::default(),
        canvases: Vec::new(),
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

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

    fn machine() -> TimeMachine {
        let mut m = TimeMachine::new();
        m.safe_top = 62.0;
        m.layout = Layout::new(
            W as f64,
            H as f64,
            3.0,
            (24.0, (762.0 + 193.0) / 800.0 * 24.0),
        );
        m.scroll = UiScroll::new(
            0.0,
            0.0,
            W as f64,
            FAST,
            Snap::IntervalCurrent(W as f64 * 0.8),
        );
        m
    }

    fn run(m: &mut TimeMachine, from: f64, to: f64) -> f64 {
        let mut t = from;
        while t <= to {
            m.step(t);
            t += 16.0;
        }
        t
    }

    /// A drag from (x, y) by (dx, dy) in `n` moves 16 ms apart, starting at `t`.
    fn drag(m: &mut TimeMachine, x: f32, y: f32, dx: f32, dy: f32, n: usize, t: f64) -> f64 {
        m.input(&pointer(PointerPhase::Down, x, y, t));
        m.step(t);
        let mut at = t;
        for k in 1..=n {
            at = t + 16.0 * k as f64;
            let f = k as f32 / n as f32;
            m.input(&pointer(PointerPhase::Move, x + dx * f, y + dy * f, at));
            m.step(at);
        }
        m.input(&pointer(PointerPhase::Up, x + dx, y + dy, at + 16.0));
        at + 16.0
    }

    #[test]
    fn the_layout_is_rns() {
        let l = machine().layout;
        assert_eq!(
            (l.list_y, l.row_x, l.row_w, l.line_x),
            (316.0, 42.0, 336.0, 209.0)
        );
        let near = |a: f64, b: f64| (a - b).abs() < 1e-3;
        assert!(
            near(l.emoji[2], 24.333) && near(l.emoji[3], 28.667) && near(l.emoji[1], 16.667),
            "{:?}",
            l.emoji
        );
        assert!(
            near(l.title[0], 53.333) && near(l.title[3], 19.333) && near(l.title[1], 21.333),
            "{:?}",
            l.title
        );
    }

    #[test]
    fn a_drag_reorders_the_list_and_keeps_the_old_order_behind() {
        let mut m = machine();
        // Row 0 (Feed the cat) dragged 90 pt down, past row 1.
        let t = drag(&mut m, 210.0, 351.0, 4.0, 90.0, 12, 0.0);
        assert_eq!(m.posted, vec!["haptic:impact-light".to_string(), "haptic:selection".to_string()]);
        let t = run(&mut m, t, t + 150.0);
        assert_eq!(m.history.len(), 1);
        run(&mut m, t, t + 400.0);
        assert_eq!(m.history.len(), 2, "{:?}", m.history);
        assert_eq!(m.history[0].items, [2, 1, 3, 4]);
        assert_eq!(m.history[1].items, [1, 2, 3, 4]);
        assert_eq!(m.active_key, m.history[0].key);
    }

    #[test]
    fn a_drag_without_a_move_adds_nothing() {
        let mut m = machine();
        let t = drag(&mut m, 210.0, 351.0, 3.0, 5.0, 3, 0.0);
        run(&mut m, t, t + 800.0);
        assert_eq!(m.history.len(), 1);
    }

    #[test]
    fn dragging_the_screen_opens_and_closes_the_time_machine() {
        let mut m = machine();
        let t = drag(&mut m, 210.0, 120.0, 0.0, 160.0, 10, 0.0);
        assert_eq!(m.tm, 1.0);
        assert!(m.active);
        let t = run(&mut m, t, t + 1500.0);
        assert!((m.progress.value - 1.0).abs() < 1e-3);
        let t = drag(&mut m, 300.0, 450.0, -120.0, 0.0, 8, t + 100.0);
        assert_eq!(m.tm, 1.0);
        let t = drag(&mut m, 210.0, 600.0, 0.0, -120.0, 8, t + 1000.0);
        assert_eq!(m.tm, 0.0);
        assert!(!m.active);
        run(&mut m, t, t + 1500.0);
        assert!(m.progress.value.abs() < 1e-3);
        assert_eq!(m.history.len(), 1);
        // A medium impact as the release opens it, and another as it closes it.
        assert_eq!(m.posted, vec!["haptic:impact-medium".to_string(), "haptic:impact-medium".to_string()]);
    }

    #[test]
    fn closing_on_an_older_card_keeps_only_it_a_second_later() {
        let mut m = machine();
        let t = drag(&mut m, 210.0, 351.0, 0.0, 90.0, 12, 0.0);
        let t = run(&mut m, t, t + 600.0);
        assert_eq!(m.history.len(), 2);
        let t = drag(&mut m, 210.0, 120.0, 0.0, 160.0, 10, t);
        let t = run(&mut m, t, t + 1000.0);
        m.scroll.offset = W as f64 * 0.8;
        let t = drag(&mut m, 210.0, 600.0, 0.0, -120.0, 8, t);
        assert_eq!(m.active_key, m.history[1].key);
        let t = run(&mut m, t, t + 900.0);
        assert_eq!(m.history.len(), 2);
        run(&mut m, t, t + 300.0);
        assert_eq!(m.history.len(), 1);
        assert_eq!(m.history[0].items, [1, 2, 3, 4]);
        assert_eq!(m.scroll.offset, 0.0);
    }

    #[test]
    fn it_draws_the_card_and_the_blurred_stars_then_the_stack() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: W,
            height: H,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(62.0)], None).unwrap();
        let (a, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("time-machine-closed");
        let card = Color::view_hex(0xf3f3f3);
        let content = Color::view_hex(0xf7f7f7);
        let line = Color::view_hex(0xe0e0e0);
        let px = |c: Color| [0, 1, 2].map(|k| (c.0[k] * 255.0).round() as u8);
        let close = |p: [u8; 4], c: Color| {
            p[..3]
                .iter()
                .zip(px(c))
                .all(|(&a, b)| (a as i32 - b as i32).abs() <= 1)
        };
        assert_eq!(&a.at(30, 100)[..3], &px(card));
        assert_eq!(&a.at(300, 351)[..3], &px(content));
        assert!(close(a.at(210, 317), line), "{:?}", a.at(210, 317));
        let ink = (100..200)
            .flat_map(|x| (341..361).map(move |y| (x, y)))
            .filter(|&(x, y)| a.at(x, y)[0] < 120)
            .count();
        assert!(ink > 30, "{ink}");
        // Open it: the cards shrink to 0.7 over the sharp, moving stars.
        let mut t = 16.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 120.0, t));
        for k in 1..=10 {
            t += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0,
                120.0 + 16.0 * k as f32,
                t,
            ));
        }
        s.input(&pointer(PointerPhase::Up, 210.0, 280.0, t + 16.0));
        while t < 2000.0 {
            t += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let (b, animating) = fixture::render(&gpu, s.as_mut(), &frame(t + 16.0)).unwrap();
        b.save("time-machine-open");
        assert!(animating);
        assert_eq!(&b.at(200, 250)[..3], &px(card));
        assert!(b.at(30, 456)[0] < 200 && b.at(380, 456)[0] < 200);
        let lit = (0..W as u32)
            .flat_map(|x| (0..130).map(move |y| (x, y)))
            .filter(|&(x, y)| b.at(x, y)[0] > 40)
            .count();
        assert!(lit > 0, "{lit}");
    }
}
