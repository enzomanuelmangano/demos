//! Threads Holo Ticket (src/animations/threads-holo-ticket: src/index.tsx, components/
//! holographic-card.tsx, components/ticket/{index,front-side,back-side}.tsx, hooks/
//! use-device-tilt.ts): a 300 × 400 ticket centred on #070018 that turns about its vertical axis
//! as it is dragged (flung with a decay) or flips half a turn on a tap (a spring and the selection
//! haptic). Its HolographicCard canvas shows a holographic grid only while it turns, the shine
//! following the phone's tilt; the front has the event's details, the back a gold QR code.
//!
//! Layout (Yoga's numbers, edges on the device-pixel grid): styles.container centres the
//! zIndex View (the ticket's size) in the window. In the ticket (overflow hidden):
//! - HolographicCard's Canvas (300 × 400, Display P3, gpu/shaders/threads_holo_ticket_card.wgsl:
//!   the notched clip, the RoundedRect #FFF5EE r 5, the luminance Mask of the 7-stop gradient cut
//!   by the 25 × 34 grid of circles, its mask the white Rect at maskOpacity and the black circle
//!   r 160 under BlurMask 200), drawn into an 8-bit layer only when one of its values changes.
//! - FrontSide (absoluteFill, padding 42 / 28 / 60, space-between): three sections (label SF 13
//!   #8E8E93 letterSpacing 0.5, marginBottom 6; value SF 21 semibold #1C1C1E letterSpacing −0.3;
//!   marginBottom 24), the flex 1 spacer, the footer (marginTop auto, a hairline top border
//!   rgba(60,60,67,0.15) as RN's border image, paddingTop 16, a row spaced between: `reactiive`
//!   SF 15 medium #1C1C1E and `00001992` SF 15 #8E8E93, letterSpacing −0.1). Each Text is
//!   TextKit's box: the font's hhea line height and Core Text's width (tracking, kerning, NSKern
//!   after every glyph), rounded up to the device pixel. Drawn once into its layer.
//! - BackSide (absoluteFill, scaleX −1, centred): QRCode's 150 × 150 canvas
//!   (gpu/shaders/threads_holo_ticket_qr.wgsl: react-native-qrcode-skia's rounded modules for
//!   qrcode 1.5.4's version 4-H matrix of "https://reactiive.io/demos",
//!   exact/parity-tools/threads-holo-qr.ts, filled with the gold gradient), drawn once.
//! gpu/shaders/threads_holo_ticket.wgsl composites the ticket per pixel through the inverse of
//! its `[perspective 1000, rotateY]` (Core Animation's matrix about the view's centre).
//!
//! Gestures (RNGH on iOS, Race(tap, pan)): a touch is the ticket's when UIKit's hit test reaches
//! it (positive hitSlops do nothing on iOS: the touch must start in the view): inside the
//! zIndex View's untransformed frame (it clips hit tests, no overflow) and inside the ticket's
//! transformed bounds. The Pan (minDistance 10, translation from its activation as UIKit's,
//! velocity from the last moves) wins at 10 pt; the Tap (maxDistance 10, maxDuration 500 ms)
//! at a lift before that.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | translateX | Pan onStart: context = translateX; onUpdate: translationX + context (cancels any animation) | the same: the pan's translation from its activation, set per move |
//! | translateX | Pan onEnd: withDecay({ velocity: velocityX × 0.7, deceleration 0.998, clamp [x − 1080, x + 1080] }) | `reanimated::Decay` with the same numbers |
//! | translateX | Tap onStart / onEnd: cancelAnimation, then withSpring(round(x / 180) × 180 + 180, { dampingRatio 1.5, duration 500 }) from rest; Haptics.selectionAsync | `gfx::spring_to` (Reanimated's duration bisection, run critically damped as ζ ≥ 1); posts `haptic:selection` |
//! | rotateY | translateX % 360 (deg), the view's `[perspective 1000, rotateY]` | the same, in the compose's inverse map |
//! | front / back | \|rotateY\| < 90 or > 270: front opacity 1, back 0 (and the reverse) | the side the compose draws |
//! | maskOpacity | interpolate(\|rotateY\|, [0, 90, 180, 270, 360], [0, 0.5, 0, 0.5, 0], CLAMP) | the same; the Rect's paint alpha |
//! | smoothPitch / smoothRoll | useAnimatedReaction: the ROTATION sensor's attitude pitch / roll (interval 16 ms), written only while maskOpacity > 0 | the `relativeOrientation` quaternion (62.5 Hz, Core Motion's attitude) as CMAttitude's Z-X'-Y'' pitch / roll, held while maskOpacity is 0 |
//! | maskCenterX | 150 − sin(rotation) × 150 + interpolate(pitch, [−π/4, π/4], [−100, 100], CLAMP) | the same |
//! | maskCenterY | 200 + interpolate(roll, [−π/4, π/4], [−400/3, 400/3], CLAMP) | the same |
//! | gradientStart | (interpolate(roll, ±π/4, [30, 75]), interpolate(pitch, ±π/4, [40, 100])), CLAMP | the same |
//! | gradientEnd | (interpolate(roll, ±π/4, [270, 225]), interpolate(pitch, ±π/4, [360, 300])), CLAMP | the same |
//!
//! Nothing renders at rest; the canvas layer is redrawn only when its values change.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, SensorKind, Surface, SurfaceError, Value};
use reanimated::{interpolate_clamp, Decay, Spring};
use skia::{Canvas, Color, Font, Matrix4, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::threads_holo_ticket::{entry, module, Compose, CARD, FRONT, GROUP_0, QR, SMP, U};
use shaders::threads_holo_ticket_card as card_shader;
use shaders::threads_holo_ticket_qr as qr_shader;

/// The Ticket's width and height (index.tsx).
const W: f64 = 300.0;
const H: f64 = 400.0;
/// rTicketStyle's perspective.
const PERSPECTIVE: f32 = 1000.0;
/// styles.container's backgroundColor (a View: Display P3 components).
const BACKGROUND: u32 = 0x070018;
/// The HolographicCard's colour (#FFF5EEFF) and the RoundedRect's r.
const CARD_COLOR: u32 = 0xFFF5EE;
const CARD_RADIUS: f32 = 5.0;
/// DotSize: the clip's circles.
const DOT_SIZE: f32 = 25.0;
/// LogoAmountHorizontal.
const LOGOS: u32 = 25;
/// The mask circle's r (height / 2.5) and its BlurMask blur (σ, respectCTM).
const MASK_RADIUS: f64 = H / 2.5;
const MASK_BLUR: f32 = 200.0;
/// SkBlurMaskFilterImpl's kMAX_BLUR_SIGMA (device pixels).
const MAX_BLUR_SIGMA: f32 = 532.0;
/// Graphite's circle blur profile width.
const PROFILE: usize = 512;
/// The holographic gradient's colours and positions.
const GRADIENT: [u32; 7] = [0xECD9A8, 0xB89FCC, 0xE5C896, 0x8FB3D5, 0xE8CF9E, 0x9B89C0, 0xEDD5A5];
const POSITIONS: [f32; 7] = [0.0, 0.17, 0.33, 0.5, 0.67, 0.83, 1.0];
/// QR_SIZE and the BackSide gradient.
const QR_SIZE: f64 = 150.0;
const QR_GRADIENT: [u32; 3] = [0xD4AF37, 0x8B6914, 0x4A3C1F];
/// qrcode 1.5.4's `QRCode.create("https://reactiive.io/demos", { errorCorrectionLevel: 'H' })`
/// modules (version 4, mask 6), from exact/parity-tools/threads-holo-qr.ts.
const QR_ROWS: [&str; 33] = [
    "#######..#.##.#....#..#.#.#######",
    "#.....#...#.###.###.#...#.#.....#",
    "#.###.#.#..######..###.##.#.###.#",
    "#.###.#.#...##......##.#..#.###.#",
    "#.###.#..#.#..#.#####.###.#.###.#",
    "#.....#....###.#.###...#..#.....#",
    "#######.#.#.#.#.#.#.#.#.#.#######",
    ".........#.#..#...#.#.#.#........",
    "...##.##...#..#.#..#....#....##..",
    "#....#..#######.##.#####.#.###...",
    "########........#.##..##..##.#.##",
    "#...#..#.##.###..#...###.####.#.#",
    "..#####..#....##..####.##.####.##",
    "##.##...#..###.#.#.#.#.#...###.#.",
    ".#.#####.##.#.###..##.....##.....",
    ".#..##.##...##....##....##.#.#...",
    "##...#####.###..#.#.#....######..",
    "#.#.##.##..###.#...##.#.#.#.##...",
    "..##..#.##...#..#...#..#.##..####",
    "##.##...###.#.#.####...##.#####..",
    "..###.#.##.#.#..#..#....##.#.#.#.",
    "#...#..#.#...###..##.##..######..",
    "#...######..##.###..#.#.#.#...#.#",
    "#..#.#...###..##..#.........#.##.",
    "##....#..#####.#.#..#...######..#",
    "........##........#...#.#...#....",
    "#######.#.###..#..##.####.#.###..",
    "#.....#..#..#..#.#.#...##...####.",
    "#.###.#.##..##########.#######.#.",
    "#.###.#.#..#...##.#..#.###.#.###.",
    "#.###.#...##.##..##.....#...#.###",
    "#.....#...##...#.#.#.#....#...###",
    "#######..#..#..##....#.###..###..",
];
/// FrontSide's padding.
const PAD_TOP: f64 = 42.0;
const PAD_X: f64 = 28.0;
const PAD_BOTTOM: f64 = 60.0;
/// styles.section marginBottom, styles.label marginBottom, styles.footer paddingTop.
const SECTION_GAP: f64 = 24.0;
const LABEL_GAP: f64 = 6.0;
const FOOTER_PAD: f64 = 16.0;
/// The sections: label, value.
const SECTIONS: [(&str, &str); 3] = [("DATE", "TUE 14 JAN"), ("TIME", "11:00 AM CET"), ("USERNAME", "Enzo")];
/// Text styles: size, weight, letterSpacing, colour (Display P3).
const LABEL: TextStyle = TextStyle { size: 13.0, weight: 400.0, spacing: 0.5, color: 0x8E8E93 };
const VALUE: TextStyle = TextStyle { size: 21.0, weight: 600.0, spacing: -0.3, color: 0x1C1C1E };
const USERNAME: TextStyle = TextStyle { size: 15.0, weight: 500.0, spacing: -0.1, color: 0x1C1C1E };
const NUMBER: TextStyle = TextStyle { size: 15.0, weight: 400.0, spacing: -0.1, color: 0x8E8E93 };
/// styles.footer borderTopColor.
const BORDER: [u8; 3] = [60, 60, 67];
const BORDER_ALPHA: f32 = 0.15;
/// The gestures.
const MIN_DISTANCE: f64 = 10.0;
const TAP_MAX_DISTANCE: f64 = 10.0;
const TAP_MAX_MS: f64 = 500.0;
const DECAY_VELOCITY: f64 = 0.7;
const DECAY_DECELERATION: f64 = 0.998;
const DECAY_CLAMP: f64 = 1080.0;
const FLIP_MS: f64 = 500.0;
const FLIP_DAMPING_RATIO: f64 = 1.5;
/// Graphite's tessellation precision (Wang's formula: 1/4 px).
const PRECISION: f32 = 4.0;
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

#[derive(Clone, Copy)]
struct TextStyle {
    size: f32,
    weight: f32,
    spacing: f32,
    color: u32,
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ThreadsHoloTicket {
        layout: Layout::default(),
        x: 0.0,
        motion: Motion::Rest,
        context: 0.0,
        touch: None,
        attitude: None,
        tilt: (0.0, 0.0),
        posted: Vec::new(),
        fonts: None,
        front: Canvas::default(),
        renderer: Renderer::default(),
        drawn: None,
        gpu: None,
    })
}

/// Yoga's rounding of an absolute edge to the pixel grid (a half rounds up).
fn grid(v: f64, s: f64) -> f64 {
    ((v * s + 0.5 + 1e-6).floor()) / s
}

/// RCTCeilPixelValue: a Text's measured size, up to the device pixel.
fn ceil_px(v: f64, s: f64) -> f64 {
    (v * s - 1e-6).ceil() / s
}

/// The screen: a window `w × h` at `s` device pixels per point.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f32,
    h: f32,
    s: f32,
    /// The ticket's top-left (rounded).
    x0: f64,
    y0: f64,
}

impl Layout {
    fn new(w: f32, h: f32, s: f32) -> Layout {
        let (wd, hd, sd) = (w as f64, h as f64, s as f64);
        Layout { w, h, s, x0: grid((wd - W) / 2.0, sd), y0: grid((hd - H) / 2.0, sd) }
    }
    /// A layer of the ticket's plane in device pixels.
    fn ticket_pixels(&self) -> (u32, u32) {
        (((W * self.s as f64).ceil() as u32).max(1), ((H * self.s as f64).ceil() as u32).max(1))
    }
    fn qr_pixels(&self) -> u32 {
        ((QR_SIZE * self.s as f64).ceil() as u32).max(1)
    }
}

/// What moves translateX.
#[derive(Clone, Copy, Debug)]
enum Motion {
    Rest,
    Decay(Decay),
    Spring(Spring),
}

/// The finger on the ticket: the Race of the Tap and the Pan.
#[derive(Clone, Debug)]
struct Touch {
    id: u32,
    down: (f64, f64, f64),
    /// Where the pan activated (its translation's origin), once it has.
    origin: Option<(f64, f64)>,
    /// The tap has failed (moved past maxDistance).
    tap_failed: bool,
    /// The last moves (x, y, ms), the finger's rest skipped (UIKit hears no move then).
    samples: [(f64, f64, f64); 16],
    count: usize,
}

impl Touch {
    fn sample(&mut self, x: f64, y: f64, ms: f64) {
        if self.count > 0 {
            let (lx, ly, _) = self.samples[(self.count - 1) % 16];
            if lx == x && ly == y {
                return;
            }
        }
        self.samples[self.count % 16] = (x, y, ms);
        self.count += 1;
    }
    /// UIKit's velocity: over the samples within 100 ms of the last move, points per second.
    fn velocity_x(&self) -> f64 {
        if self.count == 0 {
            return 0.0;
        }
        let last = self.samples[(self.count - 1) % 16];
        let mut first = last;
        for k in (0..self.count.min(16)).rev() {
            let s = self.samples[(self.count - 1 - k) % 16];
            if last.2 - s.2 <= 100.0 {
                first = s;
                break;
            }
        }
        let dt = (last.2 - first.2) / 1000.0;
        if dt <= 0.0 {
            0.0
        } else {
            (last.0 - first.0) / dt
        }
    }
}

/// CMAttitude's pitch and roll (Z-X'-Y'': yaw about z, then pitch about x, then roll about y) of
/// Core Motion's attitude quaternion `[x, y, z, w]` (device → reference frame).
fn pitch_roll(q: [f64; 4]) -> (f64, f64) {
    let [x, y, z, w] = q;
    let pitch = (2.0 * (w * x + y * z)).clamp(-1.0, 1.0).asin();
    let roll = (2.0 * (w * y - x * z)).atan2(1.0 - 2.0 * (x * x + y * y));
    (pitch, roll)
}

/// The values the canvas draws, at rotateY `rotate` (deg) and the held tilt.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Holo {
    opacity: f64,
    center: (f64, f64),
    start: (f64, f64),
    end: (f64, f64),
}

fn holo(rotate: f64, pitch: f64, roll: f64) -> Holo {
    let q = std::f64::consts::FRAC_PI_4;
    let opacity = interpolate_clamp(rotate.abs(), &[0.0, 90.0, 180.0, 270.0, 360.0], &[0.0, 0.5, 0.0, 0.5, 0.0]);
    let normalized = rotate % 360.0;
    let rotation = if normalized < 0.0 { normalized + 360.0 } else { normalized };
    let base_x = W / 2.0 - (rotation * std::f64::consts::PI / 180.0).sin() * (W / 2.0);
    let cx = base_x + interpolate_clamp(pitch, &[-q, q], &[-W / 3.0, W / 3.0]);
    let cy = H / 2.0 + interpolate_clamp(roll, &[-q, q], &[-H / 3.0, H / 3.0]);
    Holo {
        opacity,
        center: (cx, cy),
        start: (interpolate_clamp(roll, &[-q, q], &[W * 0.1, W * 0.25]), interpolate_clamp(pitch, &[-q, q], &[H * 0.1, H * 0.25])),
        end: (interpolate_clamp(roll, &[-q, q], &[W * 0.9, W * 0.75]), interpolate_clamp(pitch, &[-q, q], &[H * 0.9, H * 0.75])),
    }
}

/// A straight sRGB colour (Skia's) as encoded Display P3 (skcms's matrix).
fn srgb_to_p3(rgb: u32) -> [f32; 3] {
    let lin = |c: u32| {
        let c = (c & 0xFF) as f64 / 255.0;
        if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
    };
    let enc = |c: f64| {
        let c = c.clamp(0.0, 1.0);
        (if c <= 0.0031308 { 12.92 * c } else { 1.055 * c.powf(1.0 / 2.4) - 0.055 }) as f32
    };
    let (r, g, b) = (lin(rgb >> 16), lin(rgb >> 8), lin(rgb));
    [enc(0.8224621 * r + 0.177538 * g), enc(0.0331941 * r + 0.9668058 * g), enc(0.0170827 * r + 0.0723974 * g + 0.9105199 * b)]
}

/// A View colour's components (already Display P3).
fn p3(rgb: u32) -> [f32; 3] {
    [((rgb >> 16) & 0xFF) as f32 / 255.0, ((rgb >> 8) & 0xFF) as f32 / 255.0, (rgb & 0xFF) as f32 / 255.0]
}

/// `wangs_formula::conic` (precision 4) of a quarter circle of radius `r` (device pixels):
/// the chords per quarter Graphite tessellates it into (2^ceil(log2 n)).
fn conic_chords(r: f32) -> u32 {
    let w = std::f32::consts::FRAC_1_SQRT_2;
    // (r, 0), (r, r), (0, r) about their bounds' centre.
    let h = r / 2.0;
    let (p0, p1, p2) = ([h, -h], [h, h], [-h, h]);
    let dot = |a: [f32; 2]| a[0] * a[0] + a[1] * a[1];
    let max_len = dot(p0).max(dot(p1)).max(dot(p2)).sqrt();
    let dp = [-2.0 * w * p1[0] + p0[0] + p2[0], -2.0 * w * p1[1] + p0[1] + p2[1]];
    let dw = (-2.0 * w + 2.0).abs();
    let rp_minus_1 = (max_len * PRECISION - 1.0).max(0.0);
    let numer = dot(dp).sqrt() * PRECISION + rp_minus_1 * dw;
    let denom = 4.0 * w.min(1.0);
    chords((numer / denom).sqrt())
}

/// `wangs_formula::quadratic` (precision 4) of the QR corner's quad, half a cell `h` (device
/// pixels): from one edge's midpoint through the corner to the other's.
fn quad_chords(h: f32) -> u32 {
    // p0 − 2 p1 + p2 = (−h, −h); length_term_p2<2>(4) = 1.
    chords((2.0 * h * h).sqrt())
}

fn chords(n: f32) -> u32 {
    let level = n.max(1.0).log2().ceil().clamp(0.0, 5.0) as u32;
    1 << level
}

/// A quarter circle's chain from (1, 0) to (0, 1): the conic (w = √½) at T = k / n.
fn conic_chain(n: u32) -> Vec<[f32; 2]> {
    let w = std::f32::consts::FRAC_1_SQRT_2;
    (0..=n)
        .map(|k| {
            let t = k as f32 / n as f32;
            let (a, b, c) = ((1.0 - t) * (1.0 - t), 2.0 * w * t * (1.0 - t), t * t);
            let d = a + b + c;
            [(a + b) / d, (b + c) / d]
        })
        .collect()
}

/// The QR corner's chain from (1, 0) to (0, 1) in half cells: the quad (0, 1) → (1, 1) → (1, 0)
/// at T = k / n, walked from its end.
fn quad_chain(n: u32) -> Vec<[f32; 2]> {
    (0..=n)
        .map(|k| {
            let t = 1.0 - k as f32 / n as f32;
            [2.0 * t - t * t, 1.0 - t * t]
        })
        .collect()
}

/// Two chain points per vec4.
fn pack_chain(chain: &[[f32; 2]]) -> [[f32; 4]; 17] {
    let mut out = [[0.0; 4]; 17];
    for (k, p) in chain.iter().enumerate().take(34) {
        out[k / 2][2 * (k % 2)] = p[0];
        out[k / 2][2 * (k % 2) + 1] = p[1];
    }
    out
}

/// Graphite's analytic circle blur of a circle of radius `r` at σ (device pixels): the
/// 512-texel profile and its texture radius (AnalyticBlurMask::MakeCircle,
/// create_circle_profile).
fn circle_blur_profile(sigma: f32, r: f32) -> ([u8; PROFILE], f32) {
    let sigma = sigma.min(MAX_BLUR_SIGMA);
    // σ / r pinned to 8, binned to the 16.16 fixed point's high bits.
    let ratio = (sigma / r).min(8.0);
    let fixed = ((ratio * 65536.0) as i32) & !0xff;
    let sigma = r * (fixed as f32 / 65536.0);
    let texture_radius = r + 3.0 * sigma;
    let scale = PROFILE as f32 / texture_radius;
    (circle_profile(sigma * scale, r * scale), texture_radius)
}

fn circle_profile(sigma: f32, r: f32) -> [u8; PROFILE] {
    let steps = PROFILE;
    let mut half = (6.0 * sigma).ceil() as i32;
    half = ((half + 1) & !1) >> 1;
    let half = half as usize;
    // The half kernel at half-pixel steps, normalised to 0.5, and its running sums.
    let b = -0.5 / (sigma * sigma);
    let mut kernel = vec![0f32; half];
    let mut tot = 0.0f32;
    let mut t = 0.5f32;
    for v in kernel.iter_mut() {
        *v = (t * t * b).exp();
        tot += *v;
        t += 1.0;
    }
    let tot = 2.0 * tot;
    let mut summed = vec![0f32; half];
    let mut sum = 0.0f32;
    for i in 0..half {
        kernel[i] /= tot;
        sum += kernel[i];
        summed[i] = sum;
    }
    // The half kernel applied vertically at each column x of the circle.
    let ysteps = steps + 2 * half;
    let mut yevals = vec![0f32; ysteps];
    let mut x = -(half as f32) + 0.5;
    for v in yevals.iter_mut() {
        if x < -r || x > r {
            *v = 0.0;
        } else {
            let mut y = (r * r - x * x).sqrt();
            y -= 0.5;
            let yi = y.floor() as i32;
            *v = if y < 0.0 {
                (y + 0.5) * summed[0]
            } else if yi >= half as i32 - 1 {
                0.5
            } else {
                let f = y - yi as f32;
                (1.0 - f) * summed[yi as usize] + f * summed[yi as usize + 1]
            };
        }
        x += 1.0;
    }
    let mut out = [0u8; PROFILE];
    for (i, w) in out.iter_mut().enumerate().take(steps - 1) {
        let eval_x = i as f32 + 0.5;
        let ys = &yevals[i..];
        let mut acc = 0.0f32;
        let mut x = eval_x - half as f32;
        for k in 0..half {
            if x >= -r && x <= r {
                acc += ys[k] * kernel[half - k - 1];
            }
            x += 1.0;
        }
        for k in 0..half {
            if x >= -r && x <= r {
                acc += ys[k + half] * kernel[k];
            }
            x += 1.0;
        }
        *w = ((2.0 * acc).clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
    }
    out
}

/// The QR's rows as the shader reads them: modules 0–16 and 17–32 of each row as two floats.
fn qr_rows() -> [[f32; 4]; 17] {
    let mut out = [[0.0; 4]; 17];
    for (i, row) in QR_ROWS.iter().enumerate() {
        let (mut lo, mut hi) = (0u32, 0u32);
        for (j, c) in row.bytes().enumerate() {
            if c == b'#' {
                if j < 17 {
                    lo |= 1 << j;
                } else {
                    hi |= 1 << (j - 17);
                }
            }
        }
        for (half, bits) in [lo, hi].into_iter().enumerate() {
            let slot = 2 * i + half;
            out[slot / 4][slot % 4] = bits as f32;
        }
    }
    out
}

/// The front's Text boxes: (text, style, left, top) in the ticket, and the footer's border.
struct Front {
    fonts: [Font; 4],
    texts: Vec<(&'static str, usize, f64, f64)>,
    /// The border image's band: left, top, width, height.
    border: [f64; 4],
}

const STYLES: [TextStyle; 4] = [LABEL, VALUE, USERNAME, NUMBER];

impl Front {
    fn new(s: f64) -> Option<Front> {
        let fonts = [
            skia::match_ui_font(LABEL.size, LABEL.weight)?,
            skia::match_ui_font(VALUE.size, VALUE.weight)?,
            skia::match_ui_font(USERNAME.size, USERNAME.weight)?,
            skia::match_ui_font(NUMBER.size, NUMBER.weight)?,
        ];
        let height = |k: usize| ceil_px(gfx::line_height(&fonts[k]) as f64, s);
        let (label_h, value_h) = (height(0), height(1));
        let section = label_h + LABEL_GAP + value_h;
        let mut texts = Vec::with_capacity(8);
        for (k, (label, value)) in SECTIONS.iter().enumerate() {
            let top = PAD_TOP + k as f64 * (section + SECTION_GAP);
            texts.push((*label, 0, PAD_X, top));
            texts.push((*value, 1, PAD_X, top + label_h + LABEL_GAP));
        }
        // StyleSheet.hairlineWidth: PixelRatio.roundToNearestPixel(0.4), at least a pixel.
        let hairline = ((0.4 * s).round() / s).max(1.0 / s);
        let row = height(2).max(height(3));
        let footer_h = hairline + FOOTER_PAD + row;
        // The spacer (flex 1) takes the free space; marginTop auto gets none.
        let footer_top = H - PAD_BOTTOM - footer_h;
        let row_top = footer_top + hairline + FOOTER_PAD;
        let content_w = W - 2.0 * PAD_X;
        let number_w = ceil_px(fonts[3].advance_width_spaced("00001992", NUMBER.spacing) as f64, s);
        texts.push(("reactiive", 2, PAD_X, grid(row_top + (row - height(2)) / 2.0, s)));
        texts.push(("00001992", 3, grid(PAD_X + content_w - number_w, s), grid(row_top + (row - height(3)) / 2.0, s)));
        Some(Front { fonts, texts, border: [PAD_X, footer_top, content_w, hairline] })
    }

    /// The labels and the border into the front's layer (Display P3 values, premultiplied).
    fn record(&self, c: &mut Canvas, s: f32) {
        c.begin(s);
        let [x, y, w, h] = self.border.map(|v| v as f32);
        c.draw_rect(x, y, w, h, &Paint::fill(Color::rgb8(BORDER[0], BORDER[1], BORDER[2]).alpha(BORDER_ALPHA)));
        for &(text, k, left, top) in &self.texts {
            let font = &self.fonts[k];
            let style = STYLES[k];
            let baseline = gfx::baseline(font, top as f32);
            c.draw_text_spaced(text, left as f32, baseline, font, &Paint::fill(Color::hex(style.color)), style.spacing);
        }
    }
}

struct ThreadsHoloTicket {
    layout: Layout,
    /// translateX.
    x: f64,
    motion: Motion,
    /// contextX.
    context: f64,
    touch: Option<Touch>,
    /// The sensor's latest (pitch, roll); `None` before its first sample (Reanimated's 0).
    attitude: Option<(f64, f64)>,
    /// smoothPitch, smoothRoll.
    tilt: (f64, f64),
    posted: Vec<String>,
    fonts: Option<Option<Front>>,
    front: Canvas,
    renderer: Renderer,
    /// The canvas layer's last values.
    drawn: Option<[f32; 8]>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    card_pipeline: wgpu::RenderPipeline,
    card_uniforms: wgpu::Buffer,
    card_bind: wgpu::BindGroup,
    card_view: wgpu::TextureView,
    card: card_shader::Card,
    front_view: wgpu::TextureView,
    qr_pipeline: wgpu::RenderPipeline,
    qr_bind: wgpu::BindGroup,
    qr_view: wgpu::TextureView,
    statics_drawn: bool,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl ThreadsHoloTicket {
    /// rotateY: translateX % 360.
    fn rotate_y(&self) -> f64 {
        self.x % 360.0
    }

    fn is_front(&self) -> bool {
        let a = self.rotate_y().abs();
        a < 90.0 || a > 270.0
    }

    /// The ticket's plane (its points) → the screen.
    fn matrix(&self) -> skia::Matrix3 {
        let l = &self.layout;
        let (cx, cy) = ((W / 2.0) as f32, (H / 2.0) as f32);
        Matrix4::translate(l.x0 as f32 + cx, l.y0 as f32 + cy, 0.0)
            .multiply(Matrix4::perspective(PERSPECTIVE))
            .multiply(Matrix4::rotate_y(self.rotate_y().to_radians() as f32))
            .multiply(Matrix4::translate(-cx, -cy, 0.0))
            .to_matrix3()
    }

    /// UIKit's hit test: the zIndex View's frame, then the ticket's transformed bounds.
    fn hits(&self, x: f64, y: f64) -> bool {
        let l = &self.layout;
        if !(x >= l.x0 && x < l.x0 + W && y >= l.y0 && y < l.y0 + H) {
            return false;
        }
        let Some(inv) = self.matrix().invert() else { return false };
        let m = inv.0;
        let (xf, yf) = (x as f32, y as f32);
        if m[6] * xf + m[7] * yf + m[8] <= 0.0 {
            return false;
        }
        let p = inv.map(xf, yf);
        p.x >= 0.0 && (p.x as f64) < W && p.y >= 0.0 && (p.y as f64) < H
    }

    fn step(&mut self, now_ms: f64) -> bool {
        match &mut self.motion {
            Motion::Rest => false,
            Motion::Decay(d) => {
                let moving = d.step(now_ms);
                self.x = d.value;
                if !moving {
                    self.motion = Motion::Rest;
                }
                moving
            }
            Motion::Spring(s) => {
                let moving = s.step(now_ms);
                self.x = s.value;
                if !moving {
                    self.motion = Motion::Rest;
                }
                moving
            }
        }
    }

    /// The canvas's values now: the tilt reaches them only while the mask shows.
    fn holo(&mut self) -> Holo {
        let rotate = self.rotate_y();
        let opacity = holo(rotate, 0.0, 0.0).opacity;
        if opacity > 0.0 {
            self.tilt = self.attitude.unwrap_or((0.0, 0.0));
        }
        holo(rotate, self.tilt.0, self.tilt.1)
    }

    fn pointer(&mut self, id: u32, phase: gesture_handler::Phase, x: f64, y: f64, ms: f64) {
        use gesture_handler::Phase;
        match phase {
            Phase::Down => {
                if self.touch.is_some() || !self.hits(x, y) {
                    return;
                }
                let mut t = Touch { id, down: (x, y, ms), origin: None, tap_failed: false, samples: [(0.0, 0.0, 0.0); 16], count: 0 };
                t.sample(x, y, ms);
                self.touch = Some(t);
            }
            Phase::Move => {
                let Some(t) = self.touch.as_mut().filter(|t| t.id == id) else { return };
                t.sample(x, y, ms);
                let (dx, dy) = (x - t.down.0, y - t.down.1);
                let d2 = dx * dx + dy * dy;
                if d2 > TAP_MAX_DISTANCE * TAP_MAX_DISTANCE {
                    t.tap_failed = true;
                }
                match t.origin {
                    None if d2 >= MIN_DISTANCE * MIN_DISTANCE => {
                        // onStart (the context), then onUpdate at translation 0.
                        t.origin = Some((x, y));
                        t.tap_failed = true;
                        self.context = self.x;
                        self.x = self.context;
                        self.motion = Motion::Rest;
                    }
                    Some((ox, _)) => {
                        self.x = x - ox + self.context;
                        self.motion = Motion::Rest;
                    }
                    None => {}
                }
            }
            Phase::Up | Phase::Cancel => {
                let Some(mut t) = self.touch.take().filter(|t| t.id == id) else { return };
                t.sample(x, y, ms);
                if t.origin.is_some() {
                    // onEnd: the decay from where it is.
                    let mut d = Decay::at(self.x);
                    d.deceleration = DECAY_DECELERATION;
                    d.clamp = Some([self.x - DECAY_CLAMP, self.x + DECAY_CLAMP]);
                    d.fling(t.velocity_x() * DECAY_VELOCITY);
                    self.motion = Motion::Decay(d);
                } else if phase == Phase::Up && !t.tap_failed && ms - t.down.2 <= TAP_MAX_MS {
                    // onStart / onEnd: cancelAnimation, the haptic, the flip spring from rest.
                    let normalized = (self.x / 180.0 + 0.5).floor() * 180.0;
                    let mut s = Spring::at(self.x);
                    gfx::spring_to(&mut s, normalized + 180.0, FLIP_MS, FLIP_DAMPING_RATIO);
                    self.motion = if s.running { Motion::Spring(s) } else { Motion::Rest };
                    self.posted.push("haptic:selection".to_string());
                }
            }
        }
    }
}

impl Surface for ThreadsHoloTicket {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let h = holo(self.rotate_y(), self.tilt.0, self.tilt.1);
        Some(format!(
            "{{\"translateX\":{:.3},\"rotateY\":{:.3},\"front\":{},\"maskOpacity\":{:.4},\"pitch\":{:.4},\"roll\":{:.4},\"moving\":{},\"held\":{}}}",
            self.x,
            self.rotate_y(),
            self.is_front(),
            h.opacity,
            self.tilt.0,
            self.tilt.1,
            !matches!(self.motion, Motion::Rest),
            self.touch.is_some()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        match *event {
            InputEvent::Pointer { id, phase, x, y, at_ms, .. } => self.pointer(id, gfx::phase(phase), x as f64, y as f64, at_ms),
            InputEvent::Sensor { sensor: SensorKind::RelativeOrientation, values, .. } => {
                // `pitch || 0`, `roll || 0`.
                let (p, r) = pitch_roll(values.map(|v| v as f64));
                self.attitude = Some((if p.is_nan() { 0.0 } else { p }, if r.is_nan() { 0.0 } else { r }));
            }
            _ => {}
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
        let layout = Layout::new(frame.width, frame.height, frame.scale);
        self.layout = layout;
        let moving = self.step(frame.now_ms);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.layout)) != Some((format, frame.shader_generation, layout)) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation, layout));
            self.drawn = None;
        }
        let s = layout.s;
        let (tw, th) = layout.ticket_pixels();

        if !self.gpu.as_ref().unwrap().statics_drawn {
            if self.fonts.is_none() {
                self.fonts = Some(Front::new(s as f64));
            }
            self.front.begin(s);
            if let Some(Some(front)) = self.fonts.as_ref() {
                front.record(&mut self.front, s);
            }
            let gpu = self.gpu.as_mut().unwrap();
            self.renderer.draw(device, queue, encoder, &self.front, &gpu.front_view, LAYER_FORMAT, tw, th, wgpu::Color::TRANSPARENT);
            skia::render::fullscreen_pass(encoder, "threads holo ticket qr", &gpu.qr_view, &gpu.qr_pipeline, &gpu.qr_bind);
            gpu.statics_drawn = true;
        }

        let h = self.holo();
        // The Rect's paint alpha as its 8-bit layer keeps it: at 0 the holographic layer is
        // empty, whatever the tilt.
        let o8 = (h.opacity.clamp(0.0, 1.0) * 255.0 + 0.5).floor() as f32 / 255.0;
        let key = if o8 == 0.0 {
            [0.0; 8]
        } else {
            [o8, h.center.0 as f32, h.center.1 as f32, h.start.0 as f32, h.start.1 as f32, h.end.0 as f32, h.end.1 as f32, 1.0]
        };
        if self.drawn != Some(key) {
            let gpu = self.gpu.as_mut().unwrap();
            gpu.card.mask = [h.center.0 as f32 * s, h.center.1 as f32 * s, gpu.card.mask[2], o8];
            gpu.card.gradient = [h.start.0 as f32, h.start.1 as f32, h.end.0 as f32, h.end.1 as f32];
            queue.write_buffer(&gpu.card_uniforms, 0, &gpu.card.bytes());
            skia::render::fullscreen_pass(encoder, "threads holo ticket card", &gpu.card_view, &gpu.card_pipeline, &gpu.card_bind);
            self.drawn = Some(key);
        }

        let inv = self.matrix().invert().unwrap_or(skia::Matrix3([0.0; 9])).rows();
        let qp = layout.qr_pixels() as f32;
        let bg = p3(BACKGROUND);
        let u = Compose {
            inv,
            ticket: [W as f32, H as f32, if self.is_front() { 1.0 } else { 0.0 }, 0.0],
            qr: [((W - QR_SIZE) / 2.0) as f32, ((H - QR_SIZE) / 2.0) as f32, QR_SIZE as f32, 0.0],
            tex: [tw as f32, th as f32, qp, qp],
            background: [bg[0], bg[1], bg[2], 1.0],
            canvas: [frame.pixels().0 as f32, frame.pixels().1 as f32, s, gfx::srgb_flag(format)],
        };
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "threads holo ticket", target, &gpu.compose, &gpu.bind);
        moving
    }
}

fn uniform_buffer(device: &wgpu::Device, label: &str, size: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size: size as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false })
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, layout: Layout) -> Gpu {
    let s = layout.s;
    let (tw, th) = layout.ticket_pixels();
    let sampler = skia::render::linear_sampler(device);

    // The canvas layer.
    let card_view = skia::render::sampled_target(device, "threads holo ticket card", LAYER_FORMAT, tw, th);
    let (profile, texture_radius) = circle_blur_profile(MASK_BLUR * s, MASK_RADIUS as f32 * s);
    let profile_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("threads holo ticket blur profile"),
        size: wgpu::Extent3d { width: PROFILE as u32, height: 1, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::R8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &profile_texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &profile,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(PROFILE as u32), rows_per_image: Some(1) },
        wgpu::Extent3d { width: PROFILE as u32, height: 1, depth_or_array_layers: 1 },
    );
    let profile_view = profile_texture.create_view(&Default::default());
    let notch_n = conic_chords(DOT_SIZE * s);
    let logo = (W / LOGOS as f64) as f32;
    let grid_n = conic_chords(logo / 2.0 * s);
    let base = srgb_to_p3(CARD_COLOR);
    let mut stops = [[0.0; 4]; 7];
    for (k, c) in GRADIENT.iter().enumerate() {
        let v = srgb_to_p3(*c);
        stops[k] = [v[0], v[1], v[2], 1.0];
    }
    let mut positions = [[0.0; 4]; 2];
    for (k, p) in POSITIONS.iter().enumerate() {
        positions[k / 4][k % 4] = *p;
    }
    // LogoAmountVertical: Math.round(height / LogoSize) + 1.
    let rows = (H / (W / LOGOS as f64) + 0.5).floor() + 1.0;
    let card = card_shader::Card {
        canvas: [tw as f32, th as f32, s, 0.0],
        base: [base[0], base[1], base[2], CARD_RADIUS * s],
        mask: [0.0, 0.0, 1.0 / texture_radius, 0.0],
        gradient: [0.0; 4],
        stops,
        positions,
        notch: [(W / 2.0) as f32 * s, 0.0, H as f32 * s, DOT_SIZE * s],
        grid: [logo * s, logo / 2.0 * s, LOGOS as f32, rows as f32],
        counts: [notch_n as f32, grid_n as f32, 0.0, 0.0],
        notch_chain: pack_chain(&conic_chain(notch_n)),
        grid_chain: pack_chain(&conic_chain(grid_n)),
    };
    let card_module = device.create_shader_module(card_shader::module());
    let card_layout = device.create_bind_group_layout(&card_shader::GROUP_0);
    let card_pipeline = skia::render::fullscreen_pipeline(device, &card_module, &card_layout, card_shader::entry::CARD, LAYER_FORMAT, None);
    let card_uniforms = uniform_buffer(device, "threads holo ticket card", card_shader::Card::SIZE);
    let card_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("threads holo ticket card"),
        layout: &card_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: card_shader::U.binding, resource: card_uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: card_shader::PROFILE.binding, resource: wgpu::BindingResource::TextureView(&profile_view) },
            wgpu::BindGroupEntry { binding: card_shader::SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });

    // The front's layer.
    let front_view = skia::render::sampled_target(device, "threads holo ticket front", LAYER_FORMAT, tw, th);

    // The QR canvas.
    let qp = layout.qr_pixels();
    let qr_view = skia::render::sampled_target(device, "threads holo ticket qr", LAYER_FORMAT, qp, qp);
    let cell = (QR_SIZE / QR_ROWS.len() as f64) as f32;
    let qn = quad_chords(cell / 2.0 * s);
    let mut qstops = [[0.0; 4]; 3];
    for (k, c) in QR_GRADIENT.iter().enumerate() {
        let v = srgb_to_p3(*c);
        qstops[k] = [v[0], v[1], v[2], 1.0];
    }
    let qr_u = qr_shader::Qr {
        canvas: [qp as f32, qp as f32, s, cell],
        counts: [QR_ROWS.len() as f32, qn as f32, 0.0, 0.0],
        gradient: [QR_SIZE as f32, QR_SIZE as f32, 0.0, 0.0],
        stops: qstops,
        rows: qr_rows(),
        chain: pack_chain(&quad_chain(qn)),
    };
    let qr_module = device.create_shader_module(qr_shader::module());
    let qr_layout = device.create_bind_group_layout(&qr_shader::GROUP_0);
    let qr_pipeline = skia::render::fullscreen_pipeline(device, &qr_module, &qr_layout, qr_shader::entry::QR, LAYER_FORMAT, None);
    let qr_uniforms = uniform_buffer(device, "threads holo ticket qr", qr_shader::Qr::SIZE);
    queue.write_buffer(&qr_uniforms, 0, &qr_u.bytes());
    let qr_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("threads holo ticket qr"),
        layout: &qr_layout,
        entries: &[wgpu::BindGroupEntry { binding: qr_shader::U.binding, resource: qr_uniforms.as_entire_binding() }],
    });

    // The compose.
    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, None);
    let uniforms = uniform_buffer(device, "threads holo ticket", Compose::SIZE);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("threads holo ticket"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: CARD.binding, resource: wgpu::BindingResource::TextureView(&card_view) },
            wgpu::BindGroupEntry { binding: FRONT.binding, resource: wgpu::BindingResource::TextureView(&front_view) },
            wgpu::BindGroupEntry { binding: QR.binding, resource: wgpu::BindingResource::TextureView(&qr_view) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu {
        format,
        generation,
        layout,
        card_pipeline,
        card_uniforms,
        card_bind,
        card_view,
        card,
        front_view,
        qr_pipeline,
        qr_bind,
        qr_view,
        statics_drawn: false,
        compose,
        uniforms,
        bind,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn layout_is_yogas() {
        // iPhone Air: 420 × 912 at 3×.
        let l = Layout::new(420.0, 912.0, 3.0);
        assert_eq!((l.x0, l.y0), (60.0, 256.0));
        assert_eq!(l.ticket_pixels(), (900, 1200));
        assert_eq!(l.qr_pixels(), 450);
        let Some(front) = Front::new(3.0) else { return eprintln!("no system font; skipped") };
        // Every box on the 1/3 pt grid; the footer's band at the content's bottom less the row.
        for &(_, _, x, y) in &front.texts {
            assert!(((x * 3.0) - (x * 3.0).round()).abs() < 1e-6 && ((y * 3.0) - (y * 3.0).round()).abs() < 1e-6, "{x} {y}");
        }
        assert_eq!(front.texts[0].3, 42.0);
        assert_eq!(front.border[3], 1.0 / 3.0);
        // The sections fit above the footer: the spacer is not negative.
        let last_value = front.texts[5].3 + ceil_px(gfx::line_height(&front.fonts[1]) as f64, 3.0);
        assert!(last_value + SECTION_GAP <= front.border[1], "{last_value} {}", front.border[1]);
        // `00001992` ends at the content box's right edge (272), within a device pixel.
        let n = &front.texts[7];
        let w = front.fonts[3].advance_width_spaced("00001992", NUMBER.spacing) as f64;
        assert!(n.2 + w <= 272.0 + 1e-6 && n.2 + w > 272.0 - 1.0 / 3.0, "{} {w}", n.2);
    }

    #[test]
    fn letter_spacing_is_core_texts() {
        // Core Text (NSKern 0.5 on SF 13 "DATE", measured on macOS): every glyph moves by the
        // kern after it, the last one included.
        let Some(font) = skia::match_ui_font(13.0, 400.0) else { return eprintln!("no system font; skipped") };
        let plain = font.advance_width("DATE");
        assert!((font.advance_width_spaced("DATE", 0.5) - (plain + 2.0)).abs() < 1e-4);
    }

    #[test]
    fn the_attitude_is_cmattitudes() {
        // Flat, face up: identity.
        assert_eq!(pitch_roll([0.0, 0.0, 0.0, 1.0]), (0.0, 0.0));
        // The top edge raised by 30° (about the device's x): pitch 30°.
        let h = 15f64.to_radians();
        let (p, r) = pitch_roll([h.sin(), 0.0, 0.0, h.cos()]);
        assert!((p - 30f64.to_radians()).abs() < 1e-12 && r.abs() < 1e-12);
        // Turned 20° about y: roll 20°.
        let h = 10f64.to_radians();
        let (p, r) = pitch_roll([0.0, h.sin(), 0.0, h.cos()]);
        assert!(p.abs() < 1e-12 && (r - 20f64.to_radians()).abs() < 1e-12);
    }

    #[test]
    fn holo_values_follow_rn() {
        let h = holo(0.0, 0.0, 0.0);
        assert_eq!((h.opacity, h.center, h.start, h.end), (0.0, (150.0, 200.0), (52.5, 70.0), (247.5, 330.0)));
        let h = holo(-90.0, std::f64::consts::FRAC_PI_4, -1.0);
        assert_eq!(h.opacity, 0.5);
        // −90 % 360 + 360 = 270: sin = −1, so 300; + 100 for the pitch.
        assert!((h.center.0 - 400.0).abs() < 1e-9 && (h.center.1 - (200.0 - 400.0 / 3.0)).abs() < 1e-9, "{:?}", h.center);
        assert_eq!(holo(45.0, 0.0, 0.0).opacity, 0.25);
    }

    #[test]
    fn tessellation_and_profile_are_graphites() {
        // A notch (r 75 px): 12.2 → 16 chords a quarter; a grid circle (18 px): 6.0 → 8; the QR
        // corner (6.8 px half cell): 9.6 → 16.
        assert_eq!(conic_chords(75.0), 16);
        assert_eq!(conic_chords(18.0), 8);
        assert_eq!(quad_chords(225.0 / 33.0), 16);
        let c = conic_chain(8);
        assert_eq!((c[0], c[8]), ([1.0, 0.0], [0.0, 1.0]));
        assert!(c.iter().all(|p| ((p[0] * p[0] + p[1] * p[1]).sqrt() - 1.0).abs() < 1e-5));
        // σ 600 clamps to 532; 532 / 480 bins to 1.10546875: σ 530.625, radius 2071.875.
        let (p, radius) = circle_blur_profile(600.0, 480.0);
        assert_eq!(radius, 480.0 + 3.0 * 530.625);
        // A disc blurred wider than itself: 1 − e^{−r²/2σ²} at the centre (0.336), falling outward.
        let centre = 255.0 * (1.0 - (-(480.0f64 * 480.0) / (2.0 * 530.625 * 530.625)).exp());
        assert!((p[0] as f64 - centre).abs() <= 1.0, "{} {centre}", p[0]);
        assert!(p.windows(2).all(|w| w[1] <= w[0]));
        assert_eq!(p[PROFILE - 1], 0);
    }

    #[test]
    fn the_ticket_draws_turns_and_flips() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let px = |img: &fixture::Pixels, x: f32, y: f32| {
            let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
            [p[0] as i32, p[1] as i32, p[2] as i32]
        };
        let near = |a: [i32; 3], b: [i32; 3], tol: i32| (0..3).all(|k| (a[k] - b[k]).abs() <= tol);
        let mut s = surface();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("threads-holo-ticket-rest");
        assert!(!moving);
        // The background, #070018 in Display P3, shown in sRGB.
        let bg = px(&rest, 10.0, 10.0);
        assert_eq!(bg, [9, 0, 25]);
        // The ticket (60…360 × 256…656): seashell inside, the notches are background.
        assert!(near(px(&rest, 330.0, 450.0), [255, 245, 238], 1), "{:?}", px(&rest, 330.0, 450.0));
        assert_eq!(px(&rest, 210.0, 260.0), bg);
        assert_eq!(px(&rest, 210.0, 652.0), bg);
        assert!(near(px(&rest, 236.0, 260.0), [255, 245, 238], 1));
        assert_eq!(px(&rest, 58.0, 450.0), bg);
        // The front's text: a value's glyphs are dark (TUE 14 JAN, at the section's value line).
        let mut dark = 0;
        for k in 0..240 {
            let p = px(&rest, 88.0 + k as f32 * 0.5, 256.0 + 76.0);
            if p[0] < 120 {
                dark += 1;
            }
        }
        assert!(dark > 10, "{dark}");

        // A pan to the right: the ticket turns about y; the holographic grid shows.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 450.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 150.0, 16.0));
        s.input(&pointer(PointerPhase::Move, 156.0, 32.0));
        s.input(&pointer(PointerPhase::Move, 162.0, 48.0));
        // Activated at 12 pt: 45 pt more is 45°.
        s.input(&pointer(PointerPhase::Move, 207.0, 64.0));
        let reply = s.agent("").unwrap();
        assert!(reply.starts_with("{\"translateX\":45.000,\"rotateY\":45.000,\"front\":true,\"maskOpacity\":0.2500"), "{reply}");
        let (turned, _) = fixture::render(&gpu, s.as_mut(), &frame(80.0)).unwrap();
        turned.save("threads-holo-ticket-turned");
        // Tilt the phone: the shine moves.
        let tilt = |s: &mut Box<dyn Surface>, pitch: f64| {
            let h = pitch / 2.0;
            s.input(&InputEvent::Sensor { sensor: SensorKind::RelativeOrientation, values: [h.sin() as f32, 0.0, 0.0, h.cos() as f32], dropped: 0, at_ms: 90.0 });
        };
        tilt(&mut s, -0.6);
        let (left, _) = fixture::render(&gpu, s.as_mut(), &frame(96.0)).unwrap();
        left.save("threads-holo-ticket-tilt-a");
        tilt(&mut s, 0.6);
        let (right, _) = fixture::render(&gpu, s.as_mut(), &frame(112.0)).unwrap();
        right.save("threads-holo-ticket-tilt-b");
        let reply = s.agent("").unwrap();
        assert!(reply.contains("\"pitch\":0.6000"), "{reply}");
        let mut changed = 0;
        for k in 0..40 {
            let (x, y) = (130.0 + 4.0 * k as f32, 400.0 + 3.0 * k as f32);
            if px(&left, x, y) != px(&right, x, y) {
                changed += 1;
            }
        }
        assert!(changed > 10, "{changed}");
        // The turned ticket is narrower than 300 on screen: its edges are background.
        assert_eq!(px(&right, 64.0, 456.0), bg);

        // The lift, the finger still since its last move: the decay flings from that move's
        // velocity, clamped 1080 on.
        s.input(&pointer(PointerPhase::Up, 207.0, 120.0));
        let mut ms = 120.0;
        let mut moving = true;
        while moving && ms < 5000.0 {
            ms += 16.0;
            (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let reply = s.agent("").unwrap();
        assert!(reply.contains("\"moving\":false,\"held\":false"), "{reply}");

        // A tap flips the ticket half a turn: the back's QR shows, the haptic is posted.
        let tap = |s: &mut Box<dyn Surface>, at: f64| {
            let p = |phase| InputEvent::Pointer { id: 2, phase, x: 210.0, y: 450.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: at };
            s.input(&p(PointerPhase::Down));
            s.input(&InputEvent::Pointer { id: 2, phase: PointerPhase::Up, x: 211.0, y: 450.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: at + 80.0 });
        };
        // From rotateY 45 (translateX 1125, the clamp): round(1125 / 180) × 180 + 180 = 1260.
        tap(&mut s, ms + 100.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let mut t = ms + 200.0;
        let mut moving = true;
        while moving && t < ms + 3000.0 {
            t += 16.0;
            (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let (back, _) = fixture::render(&gpu, s.as_mut(), &frame(t + 16.0)).unwrap();
        back.save("threads-holo-ticket-back");
        let reply = s.agent("").unwrap();
        assert!(reply.starts_with("{\"translateX\":1260.000,\"rotateY\":180.000,\"front\":false,\"maskOpacity\":0.0000"), "{reply}");
        // The QR (60 + 75 … 60 + 225, 256 + 125 …) reads unmirrored (scaleX −1 and the half turn
        // cancel): its top-right eye, gold; the card around it seashell.
        let eye = px(&back, 60.0 + 225.0 - 2.0, 256.0 + 125.0 + 2.0);
        assert!(eye[0] > eye[2] + 40 && eye[0] < 240, "{eye:?}");
        assert!(near(px(&back, 60.0 + 40.0, 256.0 + 60.0), [255, 245, 238], 1));
        // A touch outside the ticket does nothing.
        s.input(&InputEvent::Pointer { id: 3, phase: PointerPhase::Down, x: 30.0, y: 450.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: t + 100.0 });
        assert!(s.agent("").unwrap().ends_with("\"held\":false}"));
    }
}
