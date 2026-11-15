//! Motion Blur (src/animations/motion-blur): a black + button adds a random transaction card
//! (emoji, amount, address) to a list showing the last three; the new card pops in, the others
//! slide up on a spring and the oldest fades out upwards. This surface is the list (the
//! BlurredList View: the window's width × maxVisibleItems · 110, clipped); the + stays Contract.
//! Past RN (the owner's ask): holding the + fires in bursts. The press adds one card (the
//! Contract's count), then from `BURST_DELAY_MS` this surface keeps adding, every
//! `BURST_FIRST_MS` shrinking by `BURST_RAMP` to `BURST_MIN_MS`, until the release, posting
//! `haptic:impact-light` per card.
//!
//! The owner asked for a REAL motion blur here, past RN. RN's "motion blur" is an expo-blur
//! BlurView (tint extraLight) over each card whose intensity runs 50 → 0 linearly in 500 ms after
//! the card mounts (and 0 → 50 in 150 ms as it leaves): an isotropic frosted blur on a timer,
//! the same on a card that is still and on one that moves, in no direction. Here each card is
//! blurred by its own motion, as a film camera records it:
//!
//! - The shutter: 1/15 s (`EXPOSURE_MS`, 66.7 ms; a 360° shutter at 15 fps), Hann-weighted,
//!   centred on the frame's instant (Blender's "centre on frame"), the same on a 60 Hz and a
//!   120 Hz display. The slide's spring peaks at ~600 pt/s (5 pt, 15 px a 120 Hz frame): a 40 pt
//!   smear, the pop-in's ~50 pt. 180° at 24 fps (20.8 ms) and 360° at 24 fps (41.7 ms) both read
//!   as no blur on the phone.
//! - Debug (input 3, `slow`): the demo's clock runs at `SLOW_RATE` (10× slower, the shutter in
//!   the demo's time, so each frame's smear is the same, held 10× longer) and a HUD in the
//!   list's top-left corner reads what the device gives the surface: its pixel scale, the
//!   frame's dt, the samples a pixel took and the longest smear (device px) since the last press.
//! - The integral: the card's layer (drawn once into an atlas slot) under its transform at N
//!   instants across the shutter, its opacity then, averaged in linear light (a box shutter: an
//!   ideal global shutter). Transforms are the analytic motion (keyframe, spring, exit) evaluated
//!   at N + 1 knots; N is the swept path of the slot's corners in device pixels, so samples land
//!   at most half a pixel apart, capped at `MAX_SAMPLES`. Between knots the shader samples at a
//!   per-pixel offset (interleaved gradient noise) and fetches bilinearly: no banding, no ghosts.
//! - A card still over the whole shutter is one sample, its texels exactly (no resampling at
//!   rest: offsets are whole pixels); when no card moves `render` returns false and the host
//!   draws nothing.
//!
//! Layout and motion (blurred-list/index.tsx, list-item/index.tsx):
//! - Card k: itemContainer (absolute, full width, 90 tall) at calculateTop(k, n, 3) = (k −
//!   max(n − 3, 0)) · 110, top withSpring (Reanimated's default: k 900, c 120, m 4, critically
//!   damped), starting at its target when it mounts; its content 80 % wide, centred, white,
//!   radius 20 continuous, boxShadow 0 0 10 rgba(0, 0, 0, 0.05), and iOS shadow (black)
//!   offset 20 → 10, opacity 0.03 → 0.02, radius 10 → 5 as it becomes the last (withTiming, 300
//!   ms inOut(quad)). ListItem: a row, padding 10 (stretched, as the Contract port measured),
//!   the emoji circle (60, #F4F4F4, the emoji 25), ItemDetails (flex 1, marginLeft 10, flex-end):
//!   amount Honk-Bold 22 letterSpacing 1, address Honk-Regular 14 marginTop 5 opacity 0.3.
//! - Entering, past RN (the owner's ask; RN drops it in with a Keyframe of scale 0.5 →
//!   1 and translateY 100 → 0 about the list's top centre): dealt from under the card above, its
//!   top springing from half a card above its slot (the default spring), its scale 0.92 → 1
//!   with it, fading in over 120 ms, drawn under the others while it comes out.
//! - The canvas reaches `LIST_TOP` above the list and `LIST_BOTTOM` below it (the list's
//!   clip cut the top card's corners and shadow): the list's points are `LIST_TOP` down.
//! - Exiting (k < n − 3): FadeOutUp 400 ms inOut(quad): opacity 1 → 0, translateY 0 → −25, at
//!   the top it had.
//!
//! Inputs: count (the presses of the +), seed (`env.seed`: the items' rolls, as the Contract's
//! `roll`), held (the + is down; absent: false). The list shows count + the bursts' cards. Every
//! change starts at the next frame's instant (`Frame::now_ms`), never at the bind's stamp: a
//! stamp on another clock would start the motion in the past (no motion, no blur).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::motion_blur::{entry, module, Uniforms, ATLAS, GROUP_0, SMP, U};

/// LIST_ITEM_HEIGHT.
const CARD_H: f64 = 90.0;
/// The canvas reaches this far above the list (pt), so the top card's corners and shadow and
/// the leaving card's rise are not cut at the list's edge; and this far below it.
pub const LIST_TOP: f64 = 24.0;
/// The canvas's reach below the list (pt): the bottom card's shadow.
pub const LIST_BOTTOM: f64 = 30.0;
/// The new card: its top starts this many card heights above its slot, under the card above …
const ENTER_RISE: f64 = 0.5;
/// … at this scale …
const ENTER_SCALE: f64 = 0.92;
/// … fading in over this …
const ENTER_FADE_MS: f64 = 120.0;
/// … and drawn under the others for this long.
const ENTER_UNDER_MS: f64 = 450.0;
/// LIST_ITEM_HEIGHT + LIST_ITEM_MARGIN_BOTTOM.
const ROW: f64 = 110.0;
/// maxVisibleItems.
const MAX_VISIBLE: usize = 3;
/// FadeOutUp.duration(400).
const EXIT_MS: f64 = 400.0;
/// isLastItemProgress's withTiming (default: 300 ms, inOut(quad)).
const SHADOW_MS: f64 = 300.0;
/// The shutter: 1/15 s, a photographer's slow shutter for motion (a 360° shutter at 15 fps).
pub const EXPOSURE_MS: f64 = 1000.0 / 15.0;
/// The debug slow motion's rate (input 3).
pub const SLOW_RATE: f64 = 0.1;
/// The debug HUD's font size.
const HUD_SIZE: f32 = 12.0;
/// Holding the +: the first burst card this long after the press.
pub const BURST_DELAY_MS: f64 = 300.0;
/// Then one every this long at first…
pub const BURST_FIRST_MS: f64 = 120.0;
/// … each interval this much of the last …
pub const BURST_RAMP: f64 = 0.88;
/// … down to this.
pub const BURST_MIN_MS: f64 = 70.0;
/// The most knots (intervals) a card takes in a frame.
pub const MAX_SAMPLES: usize = 64;
/// The most samples a pixel takes for one card (its cost at the fastest moves).
pub const MAX_TOTAL: usize = 192;
/// Cards drawn at once (the shader's arrays).
const SLOTS: usize = 8;
/// Knots in the uniform.
const KNOTS: usize = SLOTS * (MAX_SAMPLES + 1);
/// The layer's margin around the card (pt): the shadows' reach (offset 20 + 3σ 30 below, 3σ to
/// the sides, the box shadow's 3σ 15 above).
const MARGIN_X: f64 = 30.0;
const MARGIN_TOP: f64 = 15.0;
const MARGIN_BOTTOM: f64 = 50.0;
/// Reanimated's default spring (GentleSpringConfig): ω = √(900 / 4), ζ = 120 / (2√3600) = 1.
const OMEGA: f64 = 15.0;
const STIFFNESS: f64 = 900.0;
const MASS: f64 = 4.0;

static HONK_BOLD: &[u8] = include_bytes!("../../assets/fonts/Honk-Bold.otf");
static HONK: &[u8] = include_bytes!("../../assets/fonts/Honk-Regular.otf");

/// generate-random-item.ts's emojis.
const EMOJIS: [&str; 36] = [
    "🫠", "💪", "🤔", "😎", "🚀", "💡", "🌈", "🍕", "🎉", "🦄", "🌟", "🍀", "🎸", "🏆", "🌺", "🍦",
    "🐱", "🐶", "🦋", "🌴", "⚡️", "🔥", "❄️", "🌊", "🎨", "📚", "🧠", "🧘", "🏄", "🚴", "🏋️", "🧗",
    "🎭", "🎬", "🎧", "📷",
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(MotionBlur::default())
}

fn round_px(v: f64, s: f64) -> f64 {
    (v * s + 1e-4).round() / s
}
fn ceil_px(v: f64, s: f64) -> f64 {
    (v * s - 1e-4).ceil() / s
}

/// env.contract's `roll(seed, k, n)`: integer arithmetic in doubles, as every host rolls it.
pub fn roll(seed: f64, k: f64, n: f64) -> f64 {
    fn turn(x: f64) -> f64 {
        (x % 65536.0) * 32768.0 + (x / 65536.0).floor()
    }
    fn stir(x: f64) -> f64 {
        turn((x * (16807.0 + (x / 65536.0).floor())) % 2147483647.0)
    }
    (stir(stir(stir(
        1.0 + (stir(stir(1.0 + seed % 2147483646.0)) + k) % 2147483646.0,
    ))) * n
        / 2147483647.0)
        .floor()
}

/// generateRandomItem(k + 1) as the Contract rolls it: (emoji index, amount, address).
pub fn item(seed: f64, k: usize) -> (usize, String, String) {
    let k = k as f64;
    let cents = roll(seed, k * 4.0, 1_000_000.0) as u64;
    let amount = format!("$ {}.{:02}", cents / 100, cents % 100);
    let hex = |d: u64| char::from_digit(d as u32, 16).unwrap_or('0');
    let a = roll(seed, k * 4.0 + 1.0, 4096.0) as u64;
    let b = roll(seed, k * 4.0 + 2.0, 256.0) as u64;
    let address = format!(
        "0x{}{}{}..{}{}",
        hex(a / 256),
        hex(a / 16 % 16),
        hex(a % 16),
        hex(b / 16),
        hex(b % 16)
    );
    (roll(seed, k * 4.0 + 3.0, 36.0) as usize, amount, address)
}

fn in_out_quad(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        2.0 * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(2) / 2.0
    }
}

/// One `withSpring` of `top`: from `from` at `v0` (pt/s) to `to`, started at `t0`.
#[derive(Clone, Copy, Debug)]
struct Seg {
    t0: f64,
    from: f64,
    to: f64,
    v0: f64,
}

impl Seg {
    fn rest(t0: f64, at: f64) -> Seg {
        Seg {
            t0,
            from: at,
            to: at,
            v0: 0.0,
        }
    }
    /// (value, velocity) at `t` ms: the critically damped closed form, at rest once its energy
    /// falls under 6e-9 of the start's (Reanimated's energyThreshold).
    fn at(&self, t: f64) -> (f64, f64) {
        let d0 = self.from - self.to;
        let e0 = 0.5 * STIFFNESS * d0 * d0 + 0.5 * MASS * self.v0 * self.v0;
        if e0 <= 0.0 {
            return (self.to, 0.0);
        }
        let dt = (t - self.t0).max(0.0) / 1000.0;
        let e = (-OMEGA * dt).exp();
        let a = self.v0 + OMEGA * d0;
        let d = (d0 + a * dt) * e;
        let v = e * (self.v0 - OMEGA * dt * a);
        if (0.5 * STIFFNESS * d * d + 0.5 * MASS * v * v) / e0 < 6e-9 {
            return (self.to, 0.0);
        }
        (self.to + d, v)
    }
}

/// A shadow timing: from → to over SHADOW_MS from t0.
#[derive(Clone, Copy, Debug)]
struct Fade {
    t0: f64,
    from: f64,
    to: f64,
}

impl Fade {
    fn at(&self, t: f64) -> f64 {
        self.from + (self.to - self.from) * in_out_quad((t - self.t0) / SHADOW_MS)
    }
}

/// One card (index k) and its motion's history (what the shutter can still see).
#[derive(Clone, Debug)]
struct Card {
    k: usize,
    added: f64,
    tops: Vec<Seg>,
    shadow: Vec<Fade>,
    exit: Option<f64>,
}

/// A card's transform at one instant: screen pt = scale · layer pt + (ox, oy); its opacity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pose {
    /// The scale.
    pub s: f64,
    /// The layer's origin on screen (pt).
    pub ox: f64,
    /// The layer's origin on screen (pt).
    pub oy: f64,
    /// Opacity.
    pub alpha: f64,
}

/// Where the card sits in the list (pt) and its layer's size.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Layout {
    w: f64,
    s: f64,
    card_x: f64,
    card_w: f64,
    mx: f64,
    mt: f64,
    mb: f64,
}

impl Layout {
    fn new(w: f64, s: f64) -> Layout {
        // alignSelf center, width 80 %: Yoga rounds both edges to the pixel.
        let card_x = round_px(w * 0.1, s);
        let card_w = round_px(w * 0.9, s) - card_x;
        Layout {
            w,
            s,
            card_x,
            card_w,
            mx: ceil_px(MARGIN_X, s),
            mt: ceil_px(MARGIN_TOP, s),
            mb: ceil_px(MARGIN_BOTTOM, s),
        }
    }
    /// The layer (pt).
    fn layer(&self) -> (f64, f64) {
        (self.card_w + 2.0 * self.mx, CARD_H + self.mt + self.mb)
    }
    /// The layer (px).
    fn layer_px(&self) -> (u32, u32) {
        let (w, h) = self.layer();
        ((w * self.s).round() as u32, (h * self.s).round() as u32)
    }
}

impl Card {
    fn top_at(&self, t: f64) -> (f64, f64) {
        let seg = self
            .tops
            .iter()
            .rev()
            .find(|g| g.t0 <= t)
            .or(self.tops.first())
            .copied()
            .unwrap_or(Seg::rest(0.0, 0.0));
        seg.at(t)
    }
    fn shadow_at(&self, t: f64) -> f64 {
        self.shadow
            .iter()
            .rev()
            .find(|f| f.t0 <= t)
            .or(self.shadow.first())
            .map_or(1.0, |f| f.at(t))
    }
    fn pose(&self, l: &Layout, t: f64) -> Pose {
        // Dealt from under the card above (the owner's ask, past RN's drop-in keyframe): its
        // top springs from half a card above its slot (`tops`), its scale with the same
        // critically damped step from ENTER_SCALE, about the card's centre, and it fades in
        // over ENTER_FADE_MS, drawn under the others (`live`). Before it mounts: transparent.
        let s = ENTER_SCALE + (1.0 - ENTER_SCALE) * self.pose_scale(t);
        let mut alpha = if t < self.added {
            0.0
        } else {
            ((t - self.added) / ENTER_FADE_MS).min(1.0)
        };
        let mut ty_exit = 0.0;
        if let Some(x) = self.exit {
            if t >= x {
                let e = in_out_quad((t - x) / EXIT_MS);
                alpha *= 1.0 - e;
                ty_exit = -25.0 * e;
            }
        }
        let top = self.top_at(t).0 + ty_exit;
        let (cx, cy) = (l.card_x + l.card_w / 2.0, top + CARD_H / 2.0);
        Pose {
            s,
            ox: cx - s * (l.card_w / 2.0 + l.mx),
            oy: LIST_TOP + cy - s * (CARD_H / 2.0 + l.mt),
            alpha,
        }
    }
    /// How far its entering scale has come (1: done).
    fn pose_scale(&self, t: f64) -> f64 {
        if !self.added.is_finite() {
            return 1.0;
        }
        let dt = ((t - self.added) / 1000.0).max(0.0);
        let step = 1.0 - (-OMEGA * dt).exp() * (1.0 + OMEGA * dt);
        // At rest once a hundredth of a device pixel off (Reanimated's threshold, in scale).
        if (1.0 - step) * (1.0 - ENTER_SCALE) * 400.0 < 0.01 {
            1.0
        } else {
            step
        }
    }
    /// Whether it is still coming out from under the card above (drawn under the others).
    fn entering(&self, t: f64) -> bool {
        self.added.is_finite() && t < self.added + ENTER_UNDER_MS
    }
    /// Whether anything about it changes after `t`.
    fn moving(&self, t: f64) -> bool {
        t < self.added + ENTER_FADE_MS
            || self.pose_scale(t) < 1.0
            || self.exit.is_some()
            || self.top_at(t).1 != 0.0
            || self.tops.last().is_some_and(|g| g.at(t).0 != g.to)
            || self.shadow.last().is_some_and(|f| t < f.t0 + SHADOW_MS)
    }
}

/// calculateTop(k, n, 3).
fn top_of(k: usize, n: usize) -> f64 {
    k as f64 * ROW - n.saturating_sub(MAX_VISIBLE) as f64 * ROW
}

/// The samples one card takes over the shutter centred at `t`, and its knots.
pub fn knots(pose: impl Fn(f64) -> Pose, t: f64, layer: (f64, f64), scale: f64) -> Vec<Pose> {
    plan(pose, t, layer, scale).0
}

/// [`knots`] and the samples the shader takes in each interval between two knots (M): N · M
/// instants across the shutter, half a device pixel apart along the swept path up to
/// `MAX_TOTAL` samples.
pub fn plan(
    pose: impl Fn(f64) -> Pose,
    t: f64,
    layer: (f64, f64),
    scale: f64,
) -> (Vec<Pose>, usize, f64) {
    let (lw, lh) = layer;
    let corners = |p: &Pose| {
        [
            (p.ox, p.oy),
            (p.ox + p.s * lw, p.oy),
            (p.ox, p.oy + p.s * lh),
            (p.ox + p.s * lw, p.oy + p.s * lh),
        ]
    };
    // The swept path of the corners (device px), probed at 16 steps; opacity counted alone
    // needs no extra samples (its mean is the centre's to within a level).
    const PROBES: usize = 16;
    let probe: Vec<Pose> = (0..=PROBES)
        .map(|i| pose(t - EXPOSURE_MS / 2.0 + EXPOSURE_MS * i as f64 / PROBES as f64))
        .collect();
    // The path as long as its fastest stretch makes it (samples are even in time, so the
    // spacing is set where the card moves fastest).
    let (mut path, mut swept): (f64, f64) = (0.0, 0.0);
    for c in 0..4 {
        let mut len = 0.0;
        for w in probe.windows(2) {
            let (a, b) = (corners(&w[0])[c], corners(&w[1])[c]);
            let step = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
            path = path.max(step * PROBES as f64 * scale);
            len += step * scale;
        }
        swept = swept.max(len);
    }
    let visible = probe.iter().any(|p| p.alpha > 0.0);
    if !visible {
        return (Vec::new(), 1, 0.0);
    }
    let total = ((2.0 * path).ceil() as usize).clamp(1, MAX_TOTAL);
    if total == 1 || path < 0.05 {
        return (vec![pose(t)], 1, swept);
    }
    let m = total.div_ceil(MAX_SAMPLES);
    let n = total.div_ceil(m);
    let knots = (0..=n)
        .map(|j| pose(t - EXPOSURE_MS / 2.0 + EXPOSURE_MS * j as f64 / n as f64))
        .collect();
    (knots, m, swept)
}

#[derive(Default)]
struct MotionBlur {
    count: Option<usize>,
    seed: f64,
    /// The last inputs (count, held, slow), applied at the next frame.
    pending: Option<(usize, bool, bool)>,
    /// The demo's clock at the frame being drawn.
    now_anim: f64,
    /// The demo's clock: at host time `clock.0` it read `clock.1`, running at `rate`.
    clock: (f64, f64),
    rate: f64,
    slow: bool,
    /// The debug HUD's readings: the last host frame time, its dt, the most samples and the
    /// longest smear (device px) since the last press.
    last_host: Option<f64>,
    dt: f64,
    peak_samples: usize,
    peak_smear: f64,
    /// The Contract's count, the burst's cards since, whether the + is held.
    presses: usize,
    bursts: usize,
    held: bool,
    /// The next burst card's instant, and the interval after it.
    next_burst: Option<f64>,
    interval: f64,
    posted: Vec<String>,
    cards: Vec<Card>,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
    /// What the atlas holds: per slot (k, shadow progress in 1/1024).
    drawn: Vec<(usize, i64)>,
    /// The last frame's sample counts (agent).
    samples: Vec<usize>,
}

struct Gpu {
    key: (wgpu::TextureFormat, u32, u32, u32, u32),
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
    atlas: wgpu::TextureView,
    atlas_size: (u32, u32),
    slot_size: (u32, u32),
    layout: Layout,
    bold: Font,
    regular: Font,
    /// The debug HUD's face.
    hud: Font,
    emoji: Option<Images>,
}

impl MotionBlur {
    fn apply(&mut self, n: usize, t: f64) {
        let Some(old) = self.count else {
            // First bind: the list as it is, at rest.
            self.count = Some(n);
            self.cards = (n.saturating_sub(MAX_VISIBLE)..n)
                .map(|k| Card {
                    k,
                    added: f64::NEG_INFINITY,
                    tops: vec![Seg::rest(f64::NEG_INFINITY, top_of(k, n))],
                    shadow: vec![Fade {
                        t0: f64::NEG_INFINITY,
                        from: (k + 1 == n) as u8 as f64,
                        to: (k + 1 == n) as u8 as f64,
                    }],
                    exit: None,
                })
                .collect();
            return;
        };
        if n == old {
            return;
        }
        if n < old {
            self.count = None;
            return self.apply(n, t);
        }
        self.count = Some(n);
        for card in self.cards.iter_mut().filter(|c| c.exit.is_none()) {
            let (x, v) = card.top_at(t);
            if card.k + MAX_VISIBLE < n {
                // Off the visible area: it renders null and leaves from where it is.
                card.exit = Some(t);
                card.tops.push(Seg::rest(t, x));
            } else {
                card.tops.push(Seg {
                    t0: t,
                    from: x,
                    to: top_of(card.k, n),
                    v0: v,
                });
            }
            let sh = card.shadow_at(t);
            if card.k + 1 != n && card.shadow.last().map(|f| f.to) != Some(0.0) {
                card.shadow.push(Fade {
                    t0: t,
                    from: sh,
                    to: 0.0,
                });
            }
        }
        for k in old.max(n.saturating_sub(MAX_VISIBLE + 4))..n {
            let last = (k + 1 == n) as u8 as f64;
            let exit = (k + MAX_VISIBLE < n).then_some(t);
            let slot = top_of(k, n);
            self.cards.push(Card {
                k,
                added: t,
                tops: vec![Seg {
                    t0: t,
                    from: slot - ENTER_RISE * CARD_H,
                    to: slot,
                    v0: 0.0,
                }],
                shadow: vec![Fade {
                    t0: t,
                    from: last,
                    to: last,
                }],
                exit,
            });
        }
    }

    fn prune(&mut self, t: f64) {
        let keep = t - EXPOSURE_MS;
        self.cards
            .retain(|c| c.exit.is_none_or(|x| t < x + EXIT_MS + EXPOSURE_MS));
        for c in &mut self.cards {
            while c.tops.len() > 1 && c.tops[1].t0 <= keep {
                c.tops.remove(0);
            }
            while c.shadow.len() > 1 && c.shadow[1].t0 <= keep {
                c.shadow.remove(0);
            }
        }
    }

    /// The cards drawn now, oldest first (at most SLOTS: the oldest leaving go first).
    fn live(&self) -> Vec<Card> {
        let mut live: Vec<Card> = self.cards.clone();
        live.sort_by_key(|c| c.k);
        let skip = live.len().saturating_sub(SLOTS - self.slow as usize);
        let mut live = live.split_off(skip);
        // Drawn in this order: a card still coming out from under the others first.
        let t = self.now_anim;
        live.sort_by_key(|c| (!c.entering(t), c.k));
        live
    }

    /// Card `card`'s layer into `c` at the slot's origin (pt).
    fn record_card(c: &mut Canvas, g: &Gpu, seed: f64, card: &Card, lp: f64) {
        let l = g.layout;
        let s = l.s;
        let (x, y) = (l.mx as f32, l.mt as f32);
        let w = l.card_w as f32;
        // contentStyle's iOS shadow (σ = shadowRadius, as the Contract port's CSS blur of 2r)
        // and the boxShadow, under the opaque card.
        let off = 20.0 - 10.0 * lp;
        let sigma = 10.0 - 5.0 * lp;
        let op = 0.03 - 0.01 * lp;
        c.draw_rrect_shadow(
            x,
            y + off as f32,
            w,
            CARD_H as f32,
            20.0,
            sigma as f32,
            Color::BLACK.alpha(op as f32),
        );
        c.draw_rrect_shadow(x, y, w, CARD_H as f32, 20.0, 5.0, Color::BLACK.alpha(0.05));
        c.draw_continuous_rrect(x, y, w, CARD_H as f32, 20.0, &Paint::fill(Color::WHITE));
        let (emoji, amount, address) = item(seed, card.k);
        let lh1 = ceil_px(gfx::line_height(&g.bold) as f64, s);
        let lh2 = ceil_px(gfx::line_height(&g.regular) as f64, s);
        let details = lh1 + 5.0 + lh2;
        let inner = details.max(60.0);
        let row_top = round_px((CARD_H - inner - 20.0) / 2.0, s);
        let (rx, ry) = (l.mx + 10.0, l.mt + row_top + 10.0);
        c.draw_rrect(
            rx as f32,
            ry as f32,
            60.0,
            60.0,
            30.0,
            &Paint::fill(Color::view_hex(0xF4F4F4)),
        );
        if let Some(images) = &g.emoji {
            let im = images.image(emoji);
            let (bw, bh) = (im.width as f64 / s, im.height as f64 / s);
            let bx = rx + round_px((60.0 - bw) / 2.0, s);
            let by = ry + round_px((60.0 - bh) / 2.0, s);
            let (bx, by) = (bx as f32, by as f32);
            c.draw_rect(
                bx,
                by,
                bw as f32,
                bh as f32,
                &Paint::shader(Shader::Image {
                    image: im,
                    to_image: Matrix::translate(-bx, -by).then(Matrix::scale(s as f32, s as f32)),
                }),
            );
        }
        let right = l.mx + l.card_w - 10.0;
        let dy = ry + round_px((inner - details) / 2.0, s);
        let aw = ceil_px(g.bold.advance_width_spaced(&amount, 1.0) as f64, s);
        c.draw_text_spaced(
            &amount,
            (right - aw) as f32,
            gfx::baseline(&g.bold, dy as f32),
            &g.bold,
            &Paint::fill(Color::BLACK),
            1.0,
        );
        let bw = ceil_px(g.regular.advance_width(&address) as f64, s);
        let by = dy + lh1 + 5.0;
        c.draw_text(
            &address,
            (right - bw) as f32,
            gfx::baseline(&g.regular, by as f32),
            &g.regular,
            &Paint::fill(Color::BLACK.alpha(0.3)),
        );
    }
}

impl Surface for MotionBlur {
    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let n = inputs
            .first()
            .and_then(|v| v.as_number())
            .unwrap_or(0.0)
            .max(0.0) as usize;
        let seed = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        let held = inputs
            .get(2)
            .and_then(|v| v.as_bool().or(v.as_number().map(|x| x != 0.0)))
            .unwrap_or(false);
        let slow = inputs
            .get(3)
            .and_then(|v| v.as_bool().or(v.as_number().map(|x| x != 0.0)))
            .unwrap_or(false);
        if seed != self.seed {
            self.seed = seed;
            self.count = None;
            self.bursts = 0;
            self.drawn.clear();
        }
        // Applied at the next frame's instant: `at_ms` is not taken, as it may be on another
        // clock than `Frame::now_ms` (an idle surface's clock also stands still).
        let _ = at_ms;
        self.pending = Some((n, held, slow));
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let ks: Vec<String> = self.cards.iter().map(|c| c.k.to_string()).collect();
        let ns: Vec<String> = self.samples.iter().map(|n| n.to_string()).collect();
        Some(format!(
            "{{\"count\":{},\"bursts\":{},\"held\":{},\"cards\":[{}],\"samples\":[{}]}}",
            self.count.unwrap_or(0),
            self.bursts,
            self.held,
            ks.join(","),
            ns.join(",")
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
        let host = frame.now_ms;
        if self.rate == 0.0 {
            self.rate = 1.0;
            self.clock = (host, host);
        }
        self.dt = self.last_host.map_or(0.0, |l| host - l);
        self.last_host = Some(host);
        let anim = |c: (f64, f64), rate: f64| c.1 + (host - c.0) * rate;
        if let Some((_, _, slow)) = self.pending {
            if slow != self.slow {
                self.clock = (host, anim(self.clock, self.rate));
                self.rate = if slow { SLOW_RATE } else { 1.0 };
                self.slow = slow;
                self.drawn.clear();
            }
        }
        // Every motion below runs on the demo's clock (the host's, or 10× slower in debug).
        let t = anim(self.clock, self.rate);
        self.now_anim = t;
        if let Some((n, held, _)) = self.pending.take() {
            if n != self.presses || held != self.held {
                self.peak_samples = 0;
                self.peak_smear = 0.0;
            }
            if n < self.presses {
                self.bursts = 0;
            }
            self.presses = n;
            if held && !self.held {
                self.next_burst = Some(t + BURST_DELAY_MS);
                self.interval = BURST_FIRST_MS;
            }
            if !held {
                self.next_burst = None;
            }
            self.held = held;
            self.apply(self.presses + self.bursts, t);
        }
        while let Some(at) = self.next_burst.filter(|&at| at <= t) {
            self.bursts += 1;
            self.apply(self.presses + self.bursts, at);
            self.posted.push("haptic:impact-light".into());
            self.next_burst = Some(at + self.interval);
            self.interval = (self.interval * BURST_RAMP).max(BURST_MIN_MS);
        }
        self.prune(t);
        let (pw, ph) = frame.pixels();
        let s = frame.scale as f64;
        let layout = Layout::new(frame.width as f64, s);
        let (sw, sh) = layout.layer_px();
        let key = (format, frame.shader_generation, sw, sh, (s * 1000.0) as u32);
        if self.gpu.as_ref().map(|g| g.key) != Some(key) {
            self.gpu = Some(build(device, queue, key, layout));
            self.drawn.clear();
            if let Some(images) = self.gpu.as_ref().and_then(|g| g.emoji.as_ref()) {
                self.renderer.set_images(images);
            }
        }
        let owned = self.gpu.take().unwrap();
        let gpu = &owned;
        let live = self.live();
        // The atlas: re-drawn when its cards or a shadow change.
        let mut want: Vec<(usize, i64)> = live
            .iter()
            .map(|c| (c.k, (c.shadow_at(t) * 1024.0).round() as i64))
            .collect();
        let hud = self.slow.then(|| {
            format!(
                "slow-mo 10x  {:.0}x  dt {:.1} ms  {} samples  smear {:.0} px",
                s, self.dt, self.peak_samples, self.peak_smear
            )
        });
        if let Some(h) = &hud {
            // The HUD's text in the key (its hash), so a new reading redraws the atlas.
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            h.hash(&mut hasher);
            want.push((usize::MAX, hasher.finish() as i64));
        }
        if want != self.drawn {
            let c = &mut self.canvas;
            c.begin(s as f32);
            for (i, card) in live.iter().enumerate() {
                let (ox, oy) = slot_origin(i, gpu.slot_size);
                c.save();
                c.concat(Matrix::translate(
                    (ox as f64 / s) as f32,
                    (oy as f64 / s) as f32,
                ));
                MotionBlur::record_card(c, gpu, self.seed, card, card.shadow_at(t));
                c.restore();
            }
            if let Some(h) = &hud {
                let (ox, oy) = slot_origin(SLOTS - 1, gpu.slot_size);
                let (x, y) = ((ox as f64 / s) as f32, (oy as f64 / s) as f32);
                let w = gpu.hud.advance_width(h) + 12.0;
                c.draw_rrect(x, y, w, 20.0, 10.0, &Paint::fill(Color::BLACK.alpha(0.75)));
                let base = gfx::baseline(&gpu.hud, y + (20.0 - gfx::line_height(&gpu.hud)) / 2.0);
                c.draw_text(h, x + 6.0, base, &gpu.hud, &Paint::fill(Color::WHITE));
            }
            self.renderer.draw(
                device,
                queue,
                encoder,
                c,
                &gpu.atlas,
                wgpu::TextureFormat::Rgba8Unorm,
                gpu.atlas_size.0,
                gpu.atlas_size.1,
                wgpu::Color::TRANSPARENT,
            );
            self.drawn = want;
        }
        let mut u = Uniforms {
            bounds: [[0.0, 0.0, -1.0, -1.0]; SLOTS],
            slots: [[0.0; 4]; SLOTS],
            info: [[0.0; 4]; SLOTS],
            knots: [[0.0; 4]; KNOTS],
            canvas: [
                pw as f32,
                ph as f32,
                gpu.atlas_size.0 as f32,
                gpu.atlas_size.1 as f32,
            ],
            flags: [gfx::srgb_flag(format), 0.0, 0.0, 0.0],
        };
        let (lw, lh) = layout.layer();
        let mut next = 0;
        let mut samples = Vec::new();
        for (i, card) in live.iter().enumerate() {
            let (ks, m, smear) = plan(|tt| card.pose(&layout, tt), t, (lw, lh), s);
            self.peak_smear = self.peak_smear.max(smear);
            if ks.is_empty() || next + ks.len() > KNOTS {
                samples.push(0);
                continue;
            }
            let n = if ks.len() == 1 { 1 } else { ks.len() - 1 };
            samples.push(n * m);
            self.peak_samples = self.peak_samples.max(n * m);
            let (x0, y0) = slot_origin(i, gpu.slot_size);
            u.slots[i] = [x0 as f32, y0 as f32, sw as f32, sh as f32];
            u.info[i] = [n as f32, next as f32, m as f32, 0.0];
            let mut b = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
            for (j, p) in ks.iter().enumerate() {
                u.knots[next + j] = [
                    p.s as f32,
                    (p.ox * s) as f32,
                    (p.oy * s) as f32,
                    p.alpha as f32,
                ];
                b = [
                    b[0].min(p.ox * s),
                    b[1].min(p.oy * s),
                    b[2].max((p.ox + p.s * lw) * s),
                    b[3].max((p.oy + p.s * lh) * s),
                ];
            }
            u.bounds[i] = [
                (b[0] - 1.0) as f32,
                (b[1] - 1.0) as f32,
                (b[2] + 1.0) as f32,
                (b[3] + 1.0) as f32,
            ];
            next += ks.len();
        }
        self.samples = samples;
        if hud.is_some() && next < KNOTS {
            // The HUD: the last slot, still, 4 pt into the list's top-left corner.
            let i = SLOTS - 1;
            let (x0, y0) = slot_origin(i, gpu.slot_size);
            u.slots[i] = [x0 as f32, y0 as f32, sw as f32, (24.0 * s) as f32];
            u.info[i] = [1.0, next as f32, 1.0, 0.0];
            let o = (4.0 * s).round() as f32;
            u.knots[next] = [1.0, o, o, 1.0];
            u.bounds[i] = [o, o, o + sw as f32, o + (24.0 * s) as f32];
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "motion blur", target, &gpu.pipeline, &gpu.bind);
        self.gpu = Some(owned);
        self.held || self.cards.iter().any(|c| c.moving(t - EXPOSURE_MS))
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }
}

/// Slot `i`'s top-left in the atlas (px): two columns, a 2 px transparent gutter around each.
fn slot_origin(i: usize, slot: (u32, u32)) -> (u32, u32) {
    (
        (i % 2) as u32 * (slot.0 + 4) + 2,
        (i / 2) as u32 * (slot.1 + 4) + 2,
    )
}

fn build(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    key: (wgpu::TextureFormat, u32, u32, u32, u32),
    layout: Layout,
) -> Gpu {
    let (format, _, sw, sh, _) = key;
    let slot_size = (sw, sh);
    let atlas_size = (2 * (sw + 4), (SLOTS as u32).div_ceil(2) * (sh + 4));
    let atlas = skia::render::sampled_target(
        device,
        "motion blur atlas",
        wgpu::TextureFormat::Rgba8Unorm,
        atlas_size.0,
        atlas_size.1,
    );
    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let pipeline =
        skia::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("motion blur"),
        size: Uniforms::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let sampler = skia::render::linear_sampler(device);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("motion blur"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: ATLAS.binding,
                resource: wgpu::BindingResource::TextureView(&atlas),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    #[allow(unused_mut)]
    let mut emoji = None;
    #[cfg(target_vendor = "apple")]
    {
        let images: Vec<skia::Image> = EMOJIS
            .iter()
            .filter_map(|e| emoji_text::draw(e, 25.0, layout.s))
            .map(|(w, h, pixels)| skia::Image {
                width: w,
                height: h,
                pixels,
            })
            .collect();
        if images.len() == EMOJIS.len() {
            let refs: Vec<&skia::Image> = images.iter().collect();
            emoji = Some(Images::upload(device, queue, &refs));
        }
    }
    #[cfg(not(target_vendor = "apple"))]
    let _ = (queue, EMOJIS);
    Gpu {
        key,
        pipeline,
        uniforms,
        bind,
        atlas,
        atlas_size,
        slot_size,
        layout,
        bold: Font::new(HONK_BOLD, 22.0)
            .expect("Honk-Bold")
            .with_ui_layout(),
        regular: Font::new(HONK, 14.0)
            .expect("Honk-Regular")
            .with_ui_layout(),
        hud: Font::new(HONK, HUD_SIZE)
            .expect("Honk-Regular")
            .with_ui_layout(),
        emoji,
    }
}

#[cfg(target_vendor = "apple")]
mod emoji_text {
    //! RN's emoji Text as TextKit draws it (time_machine.rs's recipe): the system font (its
    //! cascade picks Apple Color Emoji), one CTLine, the baseline the line's ascent below the box
    //! top, into an sRGB premultiplied bitmap at the screen's scale, the box Yoga's (ceiled).
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
    const SYSTEM: u32 = 2;
    const UTF8: u32 = 0x0800_0100;

    /// The box's premultiplied RGBA8 pixels (w, h).
    pub fn draw(text: &str, size: f64, scale: f64) -> Option<(u32, u32, Vec<u8>)> {
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
            Some((w, h, px))
        }
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    const W: f32 = 402.0;
    const H: f32 = (330.0 + LIST_TOP + LIST_BOTTOM) as f32;
    const S: f32 = 3.0;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: W,
            height: H,
            scale: S,
            now_ms,
            seekable: true,
            period_ms: 1000.0 / 120.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    fn gpu() -> Option<exact_gpu::Gpu> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        fixture::device()
            .map_err(|e| eprintln!("{e}; skipped"))
            .ok()
    }

    #[test]
    fn items_roll_as_the_contract() {
        let (e, amount, address) = item(12345.0, 0);
        assert!(e < 36);
        assert!(amount.starts_with("$ ") && amount.len() >= 6, "{amount}");
        assert!(
            address.starts_with("0x") && address.len() == 9 && &address[5..7] == "..",
            "{address}"
        );
        // roll is in range and deterministic.
        for k in 0..50 {
            let r = roll(987654.0, k as f64, 36.0);
            assert!((0.0..36.0).contains(&r) && r == r.floor());
            assert_eq!(r, roll(987654.0, k as f64, 36.0));
        }
    }

    #[test]
    fn the_spring_is_continuous_and_settles() {
        let g = Seg {
            t0: 0.0,
            from: 110.0,
            to: 0.0,
            v0: 0.0,
        };
        assert_eq!(g.at(0.0), (110.0, 0.0));
        let (x, v) = g.at(1000.0 / 15.0);
        // Peak speed of a critically damped spring from rest: ω d0 / e.
        assert!((v.abs() - 15.0 * 110.0 / std::f64::consts::E).abs() < 1e-6 && x > 0.0);
        assert_eq!(g.at(2000.0), (0.0, 0.0));
    }

    #[test]
    fn a_still_card_takes_one_sample_a_moving_one_many() {
        let l = Layout::new(W as f64, S as f64);
        let rest = Card {
            k: 0,
            added: f64::NEG_INFINITY,
            tops: vec![Seg::rest(f64::NEG_INFINITY, 0.0)],
            shadow: vec![],
            exit: None,
        };
        assert_eq!(
            knots(|t| rest.pose(&l, t), 1000.0, l.layer(), S as f64).len(),
            1
        );
        // Mid-slide, near the spring's peak speed (~600 pt/s): ~25 pt over the shutter, ~75 px:
        // the cap.
        let slide = Card {
            k: 0,
            added: f64::NEG_INFINITY,
            tops: vec![Seg {
                t0: 0.0,
                from: 110.0,
                to: 0.0,
                v0: 0.0,
            }],
            shadow: vec![],
            exit: None,
        };
        let (ks, m, _) = plan(|t| slide.pose(&l, t), 1000.0 / 15.0, l.layer(), S as f64);
        assert!(
            ((ks.len() - 1) * m).abs_diff(MAX_TOTAL) < m,
            "{} × {m}",
            ks.len() - 1
        );
        // Samples ≤ 0.8 device px apart at the shutter's fastest instant (the cap), dithered between.
        for w in ks.windows(2) {
            assert!(((w[1].oy - w[0].oy) * S as f64).abs() / m as f64 <= 0.8);
        }
        // A slower slide (late in the spring) is sampled every half pixel.
        let (ks, m, _) = plan(|t| slide.pose(&l, t), 300.0, l.layer(), S as f64);
        assert!((ks.len() - 1) * m < MAX_TOTAL);
        for w in ks.windows(2) {
            assert!(((w[1].oy - w[0].oy) * S as f64).abs() / m as f64 <= 0.51);
        }
    }

    fn render_seq(name: &str, taps: &[f64], shots: &[f64]) -> Vec<fixture::Pixels> {
        let Some(gpu) = gpu() else { return Vec::new() };
        let mut s = surface();
        s.bind(&[Value::Number(0.0), Value::Number(424242.0)], Some(0.0))
            .unwrap();
        let mut out = Vec::new();
        let mut ms = 0.0;
        let mut taps = taps.to_vec();
        let mut shots = shots.to_vec();
        let mut count = 0.0;
        while !shots.is_empty() {
            while taps.first().is_some_and(|&t| t <= ms) {
                count += 1.0;
                s.bind(
                    &[Value::Number(count), Value::Number(424242.0)],
                    Some(taps.remove(0)),
                )
                .unwrap();
            }
            let (px, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if shots.first().is_some_and(|&t| (t - ms).abs() < 1e-6) {
                gfx::save_over(
                    &px,
                    &format!("{name}-{}", shots.remove(0) as i64),
                    [255, 255, 255],
                );
                out.push(px);
            }
            ms += 1000.0 / 120.0;
            ms = (ms * 1000.0).round() / 1000.0;
            if let Some(&t) = shots.first() {
                if t < ms && t > ms - 1000.0 / 120.0 {
                    ms = t;
                }
            }
        }
        out
    }

    #[test]
    fn cards_rest_sharp_and_blur_along_their_motion() {
        // Three cards at rest, then a fourth: the others slide up, the oldest leaves.
        let shots = [
            1030.0, 1060.0, 1100.0, 1450.0, 1520.0, 1560.0, 1600.0, 1650.0, 3000.0,
        ];
        let px = render_seq("motion-blur", &[0.0, 500.0, 1000.0, 1500.0], &shots);
        if px.is_empty() {
            return;
        }
        let l = Layout::new(W as f64, S as f64);
        let (cx0, cx1) = (
            (l.card_x * 3.0) as u32,
            ((l.card_x + l.card_w) * 3.0) as u32,
        );
        let at_rest = &px[3];
        // At rest: the cards are centred (white at both inner edges, transparent past them).
        let mid_y = (LIST_TOP + 2.0 * ROW + 45.0) as u32 * 3;
        assert_eq!(at_rest.at(cx0 + 3, mid_y)[3], 255);
        assert_eq!(at_rest.at(cx1 - 3, mid_y)[3], 255);
        assert!(
            at_rest.at(cx0 - 60, mid_y)[3] < 40,
            "{:?}",
            at_rest.at(cx0 - 60, mid_y)
        );
        // At rest the card's top edge is sharp: from transparent-ish to white within ~2 px.
        let x = (W as u32 * 3) / 2;
        let edge = |p: &fixture::Pixels, y0: u32, y1: u32| {
            (y0..y1)
                .filter(|&y| {
                    let a = p.at(x, y)[3];
                    a > 40 && a < 250
                })
                .count()
        };
        assert!(
            edge(
                at_rest,
                ((LIST_TOP + 2.0 * ROW) * 3.0) as u32 - 10,
                ((LIST_TOP + 2.0 * ROW) * 3.0) as u32 + 10
            ) <= 3
        );
        // Mid-slide (100 ms after the tap): the top edges are smeared over many pixels along y,
        // and the vertical sides (motion along them) stay sharp.
        let sliding = &px[6];
        let soft = (0..H as u32 * 3)
            .filter(|&y| {
                let a = sliding.at(x, y)[3];
                a > 60 && a < 230
            })
            .count();
        assert!(soft > 40, "{soft}");
        let side = (cx0 - 8..cx0 + 8)
            .filter(|&xx| {
                let a = sliding.at(xx, ((LIST_TOP + ROW) * 3.0 + 135.0) as u32)[3];
                a > 60 && a < 230
            })
            .count();
        assert!(side <= 4, "{side}");
        // Settled: identical to a fresh render of the same list.
        let Some(gpu) = gpu() else { return };
        let mut fresh = surface();
        fresh
            .bind(&[Value::Number(4.0), Value::Number(424242.0)], Some(0.0))
            .unwrap();
        let (still, moving) = fixture::render(&gpu, fresh.as_mut(), &frame(5000.0)).unwrap();
        assert!(!moving);
        assert_eq!(still.data, px[8].data);
    }

    #[test]
    fn holding_the_plus_fires_in_bursts_until_the_release() {
        let Some(gpu) = gpu() else { return };
        let mut s = surface();
        let bind = |s: &mut Box<dyn Surface>, n: f64, held: bool| {
            s.bind(
                &[Value::Number(n), Value::Number(7.0), Value::Bool(held)],
                Some(-1e9),
            )
            .unwrap()
        };
        bind(&mut s, 0.0, false);
        fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        // The press adds one (the Contract's count) and holds; the bind's stamp is ignored.
        bind(&mut s, 1.0, true);
        let mut haptics = 0;
        let mut ms = 1000.0;
        let mut shot = None;
        while ms <= 2000.0 {
            let (px, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            assert!(moving);
            haptics += s
                .messages()
                .iter()
                .filter(|m| *m == "haptic:impact-light")
                .count();
            if ms >= 1800.0 && shot.is_none() {
                shot = Some(px);
            }
            ms = ((ms + 1000.0 / 120.0) * 1000.0).round() / 1000.0;
        }
        if let Some(px) = shot {
            gfx::save_over(&px, "motion-blur-burst-800", [255, 255, 255]);
        }
        // Cards at 300, 420, 525.6, 618.5, 700.3, 772.3, then every 70 ms: 9 by 1000 ms.
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"bursts\":9,"), "{state}");
        assert_eq!(haptics, 9);
        // The release stops it; the list then settles.
        bind(&mut s, 1.0, false);
        let mut t = 2010.0;
        let mut moving = true;
        while moving && t < 4000.0 {
            moving = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap().1;
            t += 1000.0 / 120.0;
        }
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"bursts\":9,"));
        assert!(s.messages().is_empty());
    }

    #[test]
    fn slow_motion_runs_the_clock_ten_times_slower_and_shows_the_hud() {
        let Some(gpu) = gpu() else { return };
        let mut s = surface();
        let bind = |s: &mut Box<dyn Surface>, n: f64, slow: bool| {
            s.bind(
                &[
                    Value::Number(n),
                    Value::Number(7.0),
                    Value::Bool(false),
                    Value::Bool(slow),
                ],
                None,
            )
            .unwrap()
        };
        bind(&mut s, 3.0, true);
        fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        bind(&mut s, 4.0, true);
        // 1 s of host time is 100 ms of the demo's: still mid-slide, still blurred.
        let mut ms = 1000.0 / 120.0;
        let mut last = None;
        while ms <= 1000.0 {
            let (px, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            assert!(moving);
            last = Some(px);
            ms += 1000.0 / 120.0;
        }
        let px = last.unwrap();
        gfx::save_over(&px, "motion-blur-slow-1000", [255, 255, 255]);
        let state = s.agent("{}").unwrap();
        assert!(!state.contains("\"samples\":[1,1,1"), "{state}");
        // The HUD: a dark pill in the top-left corner.
        let p = px.at(30, 30);
        assert!(p[3] > 150 && p[0] < 80, "{p:?}");
    }
}
