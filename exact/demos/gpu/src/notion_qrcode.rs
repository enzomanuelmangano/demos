//! Notion QR Code (src/animations/notion-qrcode: index.tsx, constants.ts, create-picture.ts,
//! hooks/use-shape-data.ts, utils/{shape-generation.ts, hungarian-match.ts, qr-generation.ts,
//! transforms.ts, haptics.ts}, components/toggle-button.tsx, data/skia-objects.ts): 348 avatars
//! from a 5 × 4 sprite on a rotating 3D torus; the round button morphs them, in a wave, into
//! the QR code of "https://www.reactiive.io" and back, with four light haptics on the way out;
//! the button's icon and label cross-fade, and it pulses once the QR has settled.
//!
//! Everything is this one surface: the Skia picture, the two expo-linear-gradients over it and
//! the ToggleButton (its scale pulse, icons and labels all follow `progress` per frame, as the
//! picture does, and the pulse is a Reanimated style-updater quirk a Contract transition can't
//! express). The screen's #f5f5f5 is the Contract's.
//!
//! Shape data (hooks/use-shape-data.ts computeShapeData, f64 line for line): node-qrcode's
//! `QRCode.create(text, 'M')` (`qr::create`, bit for bit), read as qr-generation.ts reads it:
//! `modules.get(x, y)` is BitMatrix's get(row = x, col = y), so the code is transposed; the
//! Fibonacci torus (110, 80) normalized to 0.65 × the window's height, the QR's points
//! normalized to 220; `sortTorusByFlow` and `sortBySpiral` are Array.prototype.sort with
//! comparators that are not orders (the flow's 0.1 tolerance is intransitive), so the result
//! is the engine's sort's: RN runs Hermes (hermes-engine 260318099.0.4, RN 0.88's), whose sort
//! is lib/VM/JSLib/Sorting.cpp `quickSort`: an introsort (median of three, insertion sort at
//! ≤ 6, heapsort below 2 log₂ n levels) made stable by an index tiebreak, ported here with its
//! exact comparator calls (V8 and JSC give other orders: exact/parity-tools/notion-qrcode).
//! Then the greedy `hungarianMatch`, avatar i % 20, the sprite's 128-point cells. The data
//! arrives as RN's does: computed after requestAnimationFrame + setTimeout(0) and shown at the
//! commit after (the third frame of the first mount; module-cached later, the second frame,
//! once the sprite has loaded): the screen is empty until then.
//!
//! The picture (create-picture.ts, every frame, f64 as the worklet computes): the stagger angle
//! from the frozen rotation, the wave delay, the cubic in-out, the lerp, the rotation with its
//! transitionBoost, the perspective (DISTANCE 800, centre W/2, H/2), the size and its pulse, the
//! smoothstep front fade, the corner radius, the depth sort (z descending, index ascending).
//! Per point, back to front, as Skia records it: drawRRect of the background (x − 1, y − 1,
//! size + 1, size + 1, radius (size + 1) / 2), its colour the `hsl(220, s%, l%)` string RN Skia's
//! CSSColorParser parses (in float, the strings formatted as JS's Number#toString does), alpha
//! setAlphaf(max(imageOpacity, morph)); then, when imageOpacity > 0, clipRRect (antialiased) and
//! drawImageRect of the avatar's cell, sampled nearest (`SkSamplingOptions()`, strict: Graphite's
//! nearest path inside the src rect, `skia::Shader::ImageNearest`), alpha imageOpacity. The
//! sprite is avatars-sprite.png (images/, straight RGBA; premultiplied as Skia's PNG decode).
//! `exact/parity-tools/notion-qrcode` runs the RN files themselves in Hermes (shape and picture
//! digests, reference.txt) and RN Skia's own CSSColorParser; the tests below match them.
//!
//! Core Animation's composition over the canvas:
//! - The LinearGradients (expo-linear-gradient: a CGGradient of the sRGB colours drawn into an
//!   8-bit image, each pixel row at its centre): top 150 tall, white at alpha 1, 0.8, 0 at 0,
//!   0.4, 1; bottom 280 tall, 0, 0.9, 1 at 0, 0.6, 1 (processColor's alpha bytes 204 and 230).
//! - ToggleButton: the container absolute, bottom 50, centred, as wide as max(64, "CONNECT");
//!   its Animated.View (scale about its centre) holds the PressableScale: 64 × 64, white,
//!   circular radius 32 (no borderCurve), RCTBorderDrawing's 1 pt rgba(0,0,0,0.06) ring,
//!   boxShadow '0px 7px 12px rgba(0,0,0,0.08)' (RCTBoxShadow: σ 6, alpha byte 20). The Ionicons
//!   "scan" and "qr-code" (28, #1a1a1a, half the font's lineGap below their box top + ascender)
//!   centred inside the border, and the labels CONNECT / SHARE (15, 600, letterSpacing 0.5,
//!   #1a1a1a) centred in a 20-tall box 12 below. Text layers are Core Animation layers: their
//!   bitmaps are drawn once, on the pixel grid, and composited (bilinear) at their opacity,
//!   translateY and the button's scale. Layout is Yoga's (pixel grid, text sizes ceiled).
//!
//! The press: pressto's PressableScale as designed (the shared `pressto::Pressable`; pressto 0.7
//! on RNGH 3.3 shows none, its v3 BaseButton never reading onBegan/onEnded): a touch that
//! begins on it (UIKit's hit test of its bounds through the pulse's and its own scale) holds
//! it, scale 1 → 0.96 about its centre inside the pulse (withTiming 250 ms, bezier(0.25, 0.1,
//! 0.25, 1)); onPress at a lift inside those bounds, not outside, not on a cancel; the app's
//! PressablesConfig plays the selection haptic.
//! toggle() runs on the JS thread at the lift: it reads iTime's last UI value.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | iTime | withTiming(2π × 1000, { duration 40 s × 1000, Easing.linear }) from mount | `itime_at`, from the first frame |
//! | progress | withSpring(showQR ? 1 : 0, { duration showQR ? 6000 : 4000, dampingRatio 1 }): mass 4, stiffness by calculateNewStiffnessToMatchDuration, critically damped, stepped per frame from the current state (springOnFrame), dt capped at 64, a cancelled spring's lastTimestamp and velocity carried, velocity away from the target dropped, done at energy ≤ 6e-9 of 0.5 k x0² | `Progress`, line for line; started at the lift with the synchronous first step |
//! | staggerBaseTime, frozenRotationTime | set at toggle to iTime % 2π | `stagger`, `frozen` |
//! | per point x, y, size, radius, opacities, colour | createPicture of progress, iTime, the frozen angles | `Picture::compute` |
//! | scan icon opacity | interpolate(progress, [0, .25], [1, 0], CLAMP) | `icon_opacities` |
//! | qr-code icon opacity | interpolate(progress, [.2, .45], [0, 1], CLAMP) | same |
//! | CONNECT opacity, translateY | [0, .2] → [1, 0], [0, 8], CLAMP | `label_styles` |
//! | SHARE opacity, translateY | [.25, .5] → [0, 1], [8, 0], CLAMP | same |
//! | button scale | useAnimatedStyle: progress > 0.95 ? withRepeat(withSequence(withTiming(1.05, 1000), withTiming(1, 1000)), −1, true) : withTiming(1, 300) (inOut(quad)), re-run at every progress set: the style updater restarts the animation from its current value each time (a timing to the same target keeps its start time); with the spring's frame first in the rAF queue a restart is evaluated at once at runtime 0, so the scale holds while progress moves and pulses from the frame the spring settles; reverse has no effect on a sequence | `Pulse`, with the rAF queue's order (`style_first`) |
//! | haptics | useAnimatedReaction on progress: a forward crossing of 0.05, 0.12, 0.21, 0.32 with index > lastHapticIndex → impactAsync(Light); reset below 0.05 when not increasing; lastHapticIndex = −1 at toggle; the press's selectionAsync | `haptic:impact-light`, `haptic:selection` |
//!
//! Frame order (react-native-worklets' rAF queue, microtasks drained after each callback): the
//! iTime step, then the spring's step and the mappers it triggers (picture, styles, reaction)
//! and the button style's frame callback, in the order they were queued.

use std::f64::consts::PI;
use std::fmt::Write as _;
use std::sync::{Arc, Mutex};

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::interpolate_clamp;
use skia::{Canvas, Color, Font, Image, ImageRef, Images, Matrix, Paint, Renderer, Shader};

use crate::{gfx, qr};

/// NotionQRCode's qrData.
const QR_DATA: &str = "https://www.reactiive.io";
/// constants.ts: DISTANCE, DEFAULT_AVATAR_SIZE, DEFAULT_QR_TARGET_HEIGHT, DEFAULT_TORUS
/// (majorRadius, minorRadius, targetHeight = SCREEN_HEIGHT × 0.65).
const DISTANCE: f64 = 800.0;
const AVATAR_SIZE: f64 = 28.0;
const QR_TARGET_HEIGHT: f64 = 220.0;
const MAJOR_RADIUS: f64 = 110.0;
const MINOR_RADIUS: f64 = 80.0;
const TORUS_HEIGHT: f64 = 0.65;
/// DEFAULT_COLORS: hue, saturationRange, lightnessRange.
const HUE: f64 = 220.0;
const SATURATION: [f64; 2] = [30.0, 70.0];
const LIGHTNESS: [f64; 2] = [70.0, 85.0];
/// DEFAULT_SPRITE: cols, cellSize, numAvatars (640 × 512, 5 × 4).
const SPRITE_COLS: usize = 5;
const CELL: f64 = 128.0;
const AVATARS: usize = 20;
const SPRITE_W: u32 = 640;
const SPRITE_H: u32 = 512;
static SPRITE: &[u8] = include_bytes!("../images/notion-qrcode-avatars-640x512.rgba8.zlib");
/// HAPTIC_THRESHOLDS.
const HAPTIC_THRESHOLDS: [f64; 4] = [0.05, 0.12, 0.21, 0.32];
/// The rotation: 40 s per turn, 1000 turns.
const TURN_MS: f64 = 40000.0;
const TURNS: f64 = 1000.0;
/// toggle()'s springs: duration (showQR ? 6000 : 4000), dampingRatio 1; Reanimated's mass 4 and
/// energyThreshold.
const FORWARD_MS: f64 = 6000.0;
const BACK_MS: f64 = 4000.0;
const MASS: f64 = 4.0;
const ENERGY_THRESHOLD: f64 = 6e-9;
/// buttonPulseStyle: progress > 0.95 → 1.05 and back over 1000 ms each, else 1 in 300 ms.
const PULSE_FROM: f64 = 0.95;
const PULSE_TO: f64 = 1.05;
const PULSE_MS: f64 = 1000.0;
const SETTLE_MS: f64 = 300.0;
/// ToggleButton: button 64, border 1, radius 32, boxShadow 0 7 12 rgba(0,0,0,0.08) (σ = 6,
/// alpha byte round(0.08 × 255)), the ring's rgba(0,0,0,0.06) (byte 15), bottom 50, the
/// label box 20 tall 12 below, labels 15 / 600 / letterSpacing 0.5, icons 28, #1a1a1a.
const BUTTON: f32 = 64.0;
const BORDER: f32 = 1.0;
const RADIUS: f32 = 32.0;
const SHADOW: (f32, f32, u8) = (7.0, 6.0, 20);
const RING_A: u8 = 15;
const BOTTOM: f32 = 50.0;
const LABEL_BOX: f32 = 20.0;
const LABEL_TOP: f32 = 12.0;
const LABEL_SIZE: f32 = 15.0;
const LABEL_WEIGHT: f32 = 600.0;
const LABEL_SPACING: f32 = 0.5;
const ICON_SIZE: f32 = 28.0;
const INK: u32 = 0x1A1A1A;
/// The LinearGradients: height and (location, processColor alpha byte) stops.
const TOP_GRADIENT: (f32, [(f32, u8); 3]) = (150.0, [(0.0, 255), (0.4, 204), (1.0, 0)]);
const BOTTOM_GRADIENT: (f32, [(f32, u8); 3]) = (280.0, [(0.0, 0), (0.6, 230), (1.0, 255)]);
/// Ionicons (@expo/vector-icons 15) cut to "scan" (U+F556) and "qr-code" (U+F4FC).
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-scan-qr-code-subset.ttf");
const SCAN: &str = "\u{F556}";
const QR_CODE: &str = "\u{F4FC}";

/// The demo's surface: `notion_qrcode()`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(NotionQrCode::new())
}

// ---------------------------------------------------------------------------------------------
// Math as Hermes calls it (libm's pow, never a multiplication LLVM might put in its place).

#[cfg(target_vendor = "apple")]
fn pow(x: f64, y: f64) -> f64 {
    extern "C" {
        fn pow(x: f64, y: f64) -> f64;
    }
    // SAFETY: libm's pow is a pure function of two doubles.
    unsafe { pow(x, y) }
}

#[cfg(not(target_vendor = "apple"))]
fn pow(x: f64, y: f64) -> f64 {
    x.powf(y)
}

// ---------------------------------------------------------------------------------------------
// Hermes's Array.prototype.sort (lib/VM/JSLib/Sorting.cpp quickSort over StandardSortModel):
// `_less(i, j)` is the comparator's sign, ties broken by the elements' original indices; every
// swap moves the index along.

struct HermesSort<'a, T, F: FnMut(&T, &T) -> f64> {
    v: &'a mut [T],
    index: Vec<u32>,
    cmp: F,
}

impl<T, F: FnMut(&T, &T) -> f64> HermesSort<'_, T, F> {
    fn less(&mut self, i: usize, j: usize) -> bool {
        // StandardSortModel::compare: (res < 0) ? -1 : (res > 0 ? 1 : 0) (NaN is 0).
        let res = (self.cmp)(&self.v[i], &self.v[j]);
        if res < 0.0 {
            true
        } else if res > 0.0 {
            false
        } else {
            self.index[i] < self.index[j]
        }
    }

    fn swap(&mut self, i: usize, j: usize) {
        self.v.swap(i, j);
        self.index.swap(i, j);
    }

    fn heap_fix_down(&mut self, base: usize, begin: usize, end: usize) {
        if end - begin <= 1 {
            return;
        }
        let last_good = base + (end - base - 2) / 2;
        let mut i = begin;
        while i <= last_good {
            let mut j = (i - base) * 2 + 1 + base;
            if j + 1 < end && self.less(j, j + 1) {
                j += 1;
            }
            if !self.less(i, j) {
                break;
            }
            self.swap(i, j);
            i = j;
        }
    }

    fn heap_sort(&mut self, begin: usize, mut end: usize) {
        if end - begin <= 1 {
            return;
        }
        let mut start = (end - begin - 2) / 2 + begin;
        loop {
            self.heap_fix_down(begin, start, end);
            if start == begin {
                break;
            }
            start -= 1;
        }
        while end - begin > 1 {
            end -= 1;
            self.swap(begin, end);
            self.heap_fix_down(begin, begin, end);
        }
    }

    fn insertion_sort(&mut self, begin: usize, end: usize) {
        if begin == end {
            return;
        }
        for i in begin + 1..end {
            let mut j = i;
            while j != begin {
                if !self.less(j, j - 1) {
                    break;
                }
                self.swap(j, j - 1);
                j -= 1;
            }
        }
    }

    /// [l] <= [l+1] <= [r], [l+1] the pivot: its final place.
    fn partition(&mut self, l: usize, r: usize) -> usize {
        let pivot = l + 1;
        let (mut i, mut j) = (pivot + 1, r);
        loop {
            while i <= j {
                if !self.less(i, pivot) {
                    break;
                }
                i += 1;
            }
            while i <= j {
                if !self.less(pivot, j) {
                    break;
                }
                j -= 1;
            }
            if i >= j {
                break;
            }
            self.swap(i, j);
            i += 1;
            j -= 1;
        }
        if j != pivot {
            self.swap(pivot, j);
        }
        j
    }

    fn quick_sort(&mut self, mut limit: i32, mut l: usize, mut r: usize) {
        loop {
            if limit <= 0 {
                return self.heap_sort(l, r + 1);
            }
            // Median of three: the middle to [l+1], then sort [l], [l+1], [r].
            self.swap(l + 1, l + ((r - l) >> 1));
            if self.less(r, l + 1) {
                self.swap(r, l + 1);
            }
            if self.less(l + 1, l) {
                self.swap(l + 1, l);
            }
            if self.less(r, l + 1) {
                self.swap(r, l + 1);
            }
            let j = self.partition(l, r);
            let (l_size, r_size) = (j - l, r - j);
            if l_size <= r_size {
                if l_size > INSERTION_THRESHOLD {
                    self.quick_sort(limit - 1, l, j - 1);
                } else {
                    self.insertion_sort(l, j);
                }
                if r_size > INSERTION_THRESHOLD {
                    l = j + 1;
                    limit -= 1;
                    continue;
                }
                self.insertion_sort(j + 1, r + 1);
            } else {
                if r_size > INSERTION_THRESHOLD {
                    self.quick_sort(limit - 1, j + 1, r);
                } else {
                    self.insertion_sort(j + 1, r + 1);
                }
                if l_size > INSERTION_THRESHOLD {
                    r = j - 1;
                    limit -= 1;
                    continue;
                }
                self.insertion_sort(l, j);
            }
            return;
        }
    }
}

/// Sorting.cpp's INSERTION_THRESHOLD.
const INSERTION_THRESHOLD: usize = 6;

/// `array.sort((a, b) => cmp(a, b))` as Hermes runs it.
fn hermes_sort<T>(v: &mut [T], cmp: impl FnMut(&T, &T) -> f64) {
    let len = v.len();
    let mut s = HermesSort {
        v,
        index: (0..len as u32).collect(),
        cmp,
    };
    if len > INSERTION_THRESHOLD {
        // llvh::Log2_32(len) * 2.
        let log2 = 31 - (len as u32).leading_zeros();
        s.quick_sort(log2 as i32 * 2, 0, len - 1);
    } else {
        s.insertion_sort(0, len);
    }
}

// ---------------------------------------------------------------------------------------------
// hooks/use-shape-data.ts computeShapeData and utils/, line for line in f64.

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct P3 {
    x: f64,
    y: f64,
    z: f64,
}

/// ShapeData.
#[derive(Debug)]
struct ShapeData {
    torus: Vec<P3>,
    qr: Vec<P3>,
    /// qrSize (read by the parity test).
    #[cfg_attr(not(test), allow(dead_code))]
    qr_size: usize,
    qr_module_size: f64,
    assignments: Vec<usize>,
    sprite: [[f64; 4]; AVATARS],
}

/// generateTorusPoints: Fibonacci angles (θ = 2πi / φ, ϕ = acos(1 − 2i/n)), v = 2ϕ.
fn torus_points(count: usize, major: f64, minor: f64) -> Vec<P3> {
    let golden = (1.0 + 5f64.sqrt()) / 2.0;
    (0..count)
        .map(|i| {
            let i = i as f64;
            let t = i / count as f64;
            let theta = (2.0 * PI * i) / golden;
            let phi = (1.0 - 2.0 * t).acos();
            let (u, v) = (theta, phi * 2.0);
            P3 {
                x: (major + minor * v.cos()) * u.cos(),
                y: minor * v.sin(),
                z: (major + minor * v.cos()) * u.sin(),
            }
        })
        .collect()
}

/// generateQRPointsFromModules: a 200-wide grid centred on 0.
fn qr_points(modules: &[(usize, usize)], matrix_size: usize) -> Vec<P3> {
    let size = 200.0;
    let module_size = size / matrix_size as f64;
    let offset = size / 2.0;
    modules
        .iter()
        .map(|&(mx, my)| P3 {
            x: mx as f64 * module_size - offset + module_size / 2.0,
            y: my as f64 * module_size - offset + module_size / 2.0,
            z: 0.0,
        })
        .collect()
}

/// normalizeShape: centred on its bounds, scaled to `target_height` tall.
fn normalize(points: &[P3], target_height: f64) -> Vec<P3> {
    let (mut min_x, mut max_x) = (f64::INFINITY, f64::NEG_INFINITY);
    let (mut min_y, mut max_y) = (f64::INFINITY, f64::NEG_INFINITY);
    let (mut min_z, mut max_z) = (f64::INFINITY, f64::NEG_INFINITY);
    for p in points {
        min_x = min_x.min(p.x);
        max_x = max_x.max(p.x);
        min_y = min_y.min(p.y);
        max_y = max_y.max(p.y);
        min_z = min_z.min(p.z);
        max_z = max_z.max(p.z);
    }
    let height = max_y - min_y;
    let current_height = if height == 0.0 || height.is_nan() {
        1.0
    } else {
        height
    };
    let scale = target_height / current_height;
    let center_y = (min_y + max_y) / 2.0;
    points
        .iter()
        .map(|p| P3 {
            x: (p.x - (min_x + max_x) / 2.0) * scale,
            y: (p.y - center_y) * scale,
            z: (p.z - (min_z + max_z) / 2.0) * scale,
        })
        .collect()
}

/// sortTorusByFlow's comparator: by angle about y, within 0.1 rad by y.
fn flow(a: &P3, b: &P3) -> f64 {
    let angle_a = a.z.atan2(a.x);
    let angle_b = b.z.atan2(b.x);
    if (angle_a - angle_b).abs() > 0.1 {
        return angle_a - angle_b;
    }
    a.y - b.y
}

/// sortBySpiral's comparator: distance × 0.1 + angle.
fn spiral(a: &P3, b: &P3) -> f64 {
    let dist_a = (a.x * a.x + a.y * a.y).sqrt();
    let dist_b = (b.x * b.x + b.y * b.y).sqrt();
    let angle_a = a.y.atan2(a.x);
    let angle_b = b.y.atan2(b.x);
    let spiral_a = dist_a * 0.1 + angle_a;
    let spiral_b = dist_b * 0.1 + angle_b;
    spiral_a - spiral_b
}

/// hungarianMatch: for each source point in turn, the nearest unused target (strictly nearer).
fn greedy_match(source: &[P3], target: &[P3]) -> Vec<P3> {
    let n = source.len();
    let mut used = vec![false; n];
    source
        .iter()
        .map(|src| {
            let (mut best, mut best_j) = (f64::INFINITY, usize::MAX);
            for (j, t) in target.iter().enumerate() {
                if used[j] {
                    continue;
                }
                let (dx, dy, dz) = (src.x - t.x, src.y - t.y, src.z - t.z);
                let dist = dx * dx + dy * dy + dz * dz;
                if dist < best {
                    best = dist;
                    best_j = j;
                }
            }
            used[best_j] = true;
            target[best_j]
        })
        .collect()
}

/// computeShapeData for a window `height` tall.
fn compute_shape_data(height: f64) -> ShapeData {
    // generateQRMatrix + getQRBlackModules: matrix[y][x] = modules.get(x, y) (row x, col y).
    let symbol = qr::create(QR_DATA, qr::Ecl::M).expect("the QR fits");
    let size = symbol.size;
    let mut modules = Vec::new();
    for y in 0..size {
        for x in 0..size {
            if symbol.dark(x, y) {
                modules.push((x, y));
            }
        }
    }
    let n = modules.len();
    let qr_module_size = QR_TARGET_HEIGHT / size as f64;
    let raw_torus = torus_points(n, MAJOR_RADIUS, MINOR_RADIUS);
    let raw_qr = qr_points(&modules, size);
    let mut torus = normalize(&raw_torus, height * TORUS_HEIGHT);
    let mut qr = normalize(&raw_qr, QR_TARGET_HEIGHT);
    hermes_sort(&mut torus, flow);
    hermes_sort(&mut qr, spiral);
    let qr = greedy_match(&torus, &qr);
    let mut sprite = [[0.0; 4]; AVATARS];
    for (i, s) in sprite.iter_mut().enumerate() {
        *s = [
            (i % SPRITE_COLS) as f64 * CELL,
            (i / SPRITE_COLS) as f64 * CELL,
            CELL,
            CELL,
        ];
    }
    ShapeData {
        torus,
        qr,
        qr_size: size,
        qr_module_size,
        assignments: (0..n).map(|i| i % AVATARS).collect(),
        sprite,
    }
}

/// The module-level shapeDataCache (keyed by the torus's target height).
static SHAPE_CACHE: Mutex<Option<(u64, Arc<ShapeData>)>> = Mutex::new(None);

/// The cached data for `height`, and whether it was cached already.
fn shape_data(height: f64) -> (Arc<ShapeData>, bool) {
    let mut cache = SHAPE_CACHE.lock().unwrap();
    let key = (height * TORUS_HEIGHT).to_bits();
    if let Some((k, data)) = cache.as_ref() {
        if *k == key {
            return (data.clone(), true);
        }
    }
    let data = Arc::new(compute_shape_data(height));
    *cache = Some((key, data.clone()));
    (data, false)
}

// ---------------------------------------------------------------------------------------------
// Colours: backgroundColorString, then Skia.Color's CSSColorParser (react-native-skia 3.7.2,
// cpp/api/third_party/CSSColorParser.cpp) in float, as clang compiles it for arm64 (its
// `a * b + c` fused). JsiSkColor's round trip through a Float32Array (byte × (1/255f), then
// × 255 truncated) gives every byte back (checked below).

/// backgroundColorString's saturation and lightness (percent) for an avatar at `boost`.
fn background_hsl(avatar: usize, boost: f64) -> (f64, f64) {
    let [sat_min, sat_max] = SATURATION;
    let [light_min, light_max] = LIGHTNESS;
    let sat_range = sat_max - sat_min;
    let light_range = light_max - light_min;
    let base_sat = sat_min + (avatar % 5) as f64 * (sat_range / 4.0);
    let base_light = light_min + (avatar % 4) as f64 * (light_range / 3.0);
    let sat = 100f64.min(base_sat + 10.0 * boost);
    let light = 30f64.max(base_light - 15.0 * boost);
    (sat, light)
}

/// A number as JS's template literal writes it (the shortest round trip; no exponent in the
/// demo's ranges), parsed back by strtof: the float CSSColorParser reads. No allocation.
fn strtof(v: f64) -> f32 {
    struct Digits {
        buf: [u8; 48],
        len: usize,
    }
    impl std::fmt::Write for Digits {
        fn write_str(&mut self, s: &str) -> std::fmt::Result {
            let b = s.as_bytes();
            let end = self.len + b.len();
            if end > self.buf.len() {
                return Err(std::fmt::Error);
            }
            self.buf[self.len..end].copy_from_slice(b);
            self.len = end;
            Ok(())
        }
    }
    let mut d = Digits {
        buf: [0; 48],
        len: 0,
    };
    let _ = write!(d, "{v}");
    std::str::from_utf8(&d.buf[..d.len])
        .ok()
        .and_then(|s| s.parse::<f32>().ok())
        .unwrap_or(0.0)
}

/// css_hue_to_rgb.
fn hue_to_rgb(m1: f32, m2: f32, mut h: f32) -> f32 {
    if h < 0.0 {
        h += 1.0;
    } else if h > 1.0 {
        h -= 1.0;
    }
    if h * 6.0 < 1.0 {
        return ((m2 - m1) * h).mul_add(6.0, m1);
    }
    if h * 2.0 < 1.0 {
        return m2;
    }
    if h * 3.0 < 2.0 {
        return ((m2 - m1) * (2.0f32 / 3.0 - h)).mul_add(6.0, m1);
    }
    m1
}

/// clamp_css_byte: rounded half away from zero, clamped.
fn css_byte(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

/// CSSColorParser::parse of `hsl(HUE, sat%, light%)`.
fn hsl_bytes(sat: f64, light: f64) -> [u8; 3] {
    let h = (strtof(HUE) / 360.0).fract();
    let s = (strtof(sat) / 100.0).clamp(0.0, 1.0);
    let l = (strtof(light) / 100.0).clamp(0.0, 1.0);
    let m2 = if l <= 0.5 {
        l * (s + 1.0)
    } else {
        (-l).mul_add(s, l + s)
    };
    let m1 = l * 2.0 - m2;
    [
        css_byte(hue_to_rgb(m1, m2, h + 1.0 / 3.0) * 255.0),
        css_byte(hue_to_rgb(m1, m2, h) * 255.0),
        css_byte(hue_to_rgb(m1, m2, h - 1.0 / 3.0) * 255.0),
    ]
}

/// The paint colour of an avatar's background at `boost`: SkPaint::setColor(SkColor), each
/// byte × (1 / 255f).
fn background_color(avatar: usize, boost: f64) -> Color {
    let (sat, light) = background_hsl(avatar, boost);
    let [r, g, b] = hsl_bytes(sat, light);
    let k = 1.0f32 / 255.0;
    Color([r as f32 * k, g as f32 * k, b as f32 * k, 1.0])
}

// ---------------------------------------------------------------------------------------------
// create-picture.ts: one frame's transforms, line for line in f64.

/// transforms.ts smoothstep.
fn smoothstep(edge0: f64, edge1: f64, x: f64) -> f64 {
    let t = 0f64.max(1f64.min((x - edge0) / (edge1 - edge0)));
    t * t * (3.0 - 2.0 * t)
}

/// The per-point arrays createPicture fills, and its depth order (kept between frames).
#[derive(Default)]
struct Picture {
    xs: Vec<f64>,
    ys: Vec<f64>,
    sizes: Vec<f64>,
    radii: Vec<f64>,
    image: Vec<f64>,
    zs: Vec<f64>,
    morph: Vec<f64>,
    order: Vec<u32>,
}

impl Picture {
    /// STEP 2 and 3 for `progress`, `i_time`, `stagger_time`, `frozen` on a `w × h` canvas.
    #[allow(clippy::too_many_arguments)]
    fn compute(
        &mut self,
        shape: &ShapeData,
        progress: f64,
        i_time: f64,
        stagger_time: f64,
        frozen: f64,
        w: f64,
        h: f64,
    ) {
        let n = shape.torus.len();
        for v in [
            &mut self.xs,
            &mut self.ys,
            &mut self.sizes,
            &mut self.radii,
            &mut self.image,
            &mut self.zs,
            &mut self.morph,
        ] {
            v.resize(n, 0.0);
        }
        let (center_x, center_y) = (w / 2.0, h / 2.0);
        let time_value = i_time % (PI * 2.0);
        let stagger_tilt_cos = 0.3f64.cos();
        let stagger_tilt_sin = 0.3f64.sin();
        let stagger_cos = stagger_time.cos();
        let stagger_sin = stagger_time.sin();
        let mut rotation_delta = time_value - frozen;
        if rotation_delta > PI {
            rotation_delta -= 2.0 * PI;
        }
        if rotation_delta < -PI {
            rotation_delta += 2.0 * PI;
        }
        for index in 0..n {
            let t = shape.torus[index];
            let q = shape.qr[index];
            // 2a: the wave delay from the frozen rotation.
            let tilted_z = t.y * stagger_tilt_sin + t.z * stagger_tilt_cos;
            let rotated_x = t.x * stagger_cos + tilted_z * stagger_sin;
            let rotated_z = -t.x * stagger_sin + tilted_z * stagger_cos;
            let angle = rotated_z.atan2(rotated_x);
            let normalized_angle = (angle + PI) / (2.0 * PI);
            let wave_delay = normalized_angle * 0.25;
            let staggered = 1f64.min(0f64.max((progress - wave_delay) / (1.0 - wave_delay)));
            // 2b: cubic in-out.
            let eased = if staggered < 0.5 {
                4.0 * pow(staggered, 3.0)
            } else {
                1.0 - pow(-2.0 * staggered + 2.0, 3.0) / 2.0
            };
            // 2c.
            let base_x = t.x + (q.x - t.x) * eased;
            let base_y = t.y + (q.y - t.y) * eased;
            let base_z = t.z + (q.z - t.z) * eased;
            // 2d.
            let transition_boost = (eased * PI).sin() * 0.6;
            let rotation_amount = (frozen + rotation_delta) * (1.0 - eased) + transition_boost;
            let tilt_amount = 0.3 * (1.0 - eased);
            let tilt_cos = tilt_amount.cos();
            let tilt_sin = tilt_amount.sin();
            let t_y = base_y * tilt_cos - base_z * tilt_sin;
            let t_z = base_y * tilt_sin + base_z * tilt_cos;
            let rot_cos = rotation_amount.cos();
            let rot_sin = rotation_amount.sin();
            let px = base_x * rot_cos + t_z * rot_sin;
            let py = t_y;
            let pz = -base_x * rot_sin + t_z * rot_cos;
            // 2e.
            let scale = DISTANCE / (DISTANCE + pz);
            let screen_x = center_x + px * scale;
            let screen_y = center_y + py * scale;
            // 2f.
            let avatar_scale = AVATAR_SIZE * scale;
            let qr_scale = shape.qr_module_size * scale * 0.9;
            let base_size = avatar_scale + (qr_scale - avatar_scale) * eased;
            let pulse_phase = eased * PI;
            let scale_pulse = 1.0 + pulse_phase.sin() * pow(1.0 - eased, 0.5) * 0.3;
            let size = base_size * scale_pulse;
            // 2g.
            let front_fade = smoothstep(100.0, -150.0, pz);
            let transition_opacity = 1.0 - eased;
            self.xs[index] = screen_x - size / 2.0;
            self.ys[index] = screen_y - size / 2.0;
            self.sizes[index] = size;
            self.radii[index] = (size / 2.0) * (1.0 - eased);
            self.image[index] = transition_opacity * front_fade;
            self.zs[index] = pz;
            self.morph[index] = eased;
        }
        // STEP 3: order.sort((a, b) => zs[b] - zs[a] || a - b), a total order.
        self.order.clear();
        self.order.extend(0..n as u32);
        let zs = &self.zs;
        self.order.sort_unstable_by(|&a, &b| {
            zs[b as usize]
                .partial_cmp(&zs[a as usize])
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.cmp(&b))
        });
    }
}

// ---------------------------------------------------------------------------------------------
// Reanimated 4.7.1, as the demo drives it.

/// getEnergy (springUtils.ts).
fn energy(displacement: f64, velocity: f64, stiffness: f64, mass: f64) -> f64 {
    let potential = 0.5 * stiffness * pow(displacement, 2.0);
    let kinetic = 0.5 * mass * pow(velocity, 2.0);
    potential + kinetic
}

/// calculateNewStiffnessToMatchDuration with dampingRatio 1, mass 4: bisectRoot over
/// [Number.EPSILON, 8e3], 100 iterations, precision energyThreshold × 1e-3.
fn stiffness_for(x0: f64, v0: f64, duration_ms: f64) -> f64 {
    let zeta = 1.0;
    let diff = |stiffness: f64| {
        let settling = (duration_ms * 1.5) / 1000.0;
        let omega0 = (stiffness / MASS).sqrt() * zeta;
        let xtk = (x0 + (v0 + x0 * omega0) * settling) * (-omega0 * settling).exp();
        let vtk = (x0 + (v0 + x0 * omega0) * settling) * (-omega0 * settling).exp() * -omega0
            + (v0 + x0 * omega0) * (-omega0 * settling).exp();
        let e0 = energy(x0, v0, stiffness, MASS);
        let etk = energy(xtk, vtk, stiffness, MASS);
        etk / e0 - ENERGY_THRESHOLD
    };
    let precision = ENERGY_THRESHOLD * 1e-3;
    let (mut min, mut max) = (f64::EPSILON, 8e3);
    let direction = if diff(max) >= diff(min) { 1.0 } else { -1.0 };
    let mut idx = 100;
    let mut current = (max + min) / 2.0;
    while diff(current).abs() > precision && idx > 0 {
        idx -= 1;
        if diff(current) * direction < 0.0 {
            min = current;
        } else {
            max = current;
        }
        current = (min + max) / 2.0;
    }
    current
}

/// One withSpring({ duration, dampingRatio: 1 }) animation object.
#[derive(Clone, Copy, Debug)]
struct SpringAnim {
    to: f64,
    current: f64,
    velocity: f64,
    last_ts: f64,
    stiffness: f64,
    omega0: f64,
    initial_energy: f64,
    finished: bool,
}

/// The `progress` shared value: its value and its `_animation` (kept after it finishes).
#[derive(Clone, Copy, Debug, Default)]
struct Progress {
    value: f64,
    anim: Option<SpringAnim>,
}

impl Progress {
    fn running(&self) -> bool {
        self.anim.is_some_and(|a| !a.finished)
    }

    /// `progress.set(withSpring(to, { duration, dampingRatio: 1 }))` run on the UI thread at
    /// `now` (valueSetter): the previous animation cancelled, onStart, the synchronous first
    /// step. Whether the value was set (the mappers then run).
    fn start(&mut self, to: f64, duration_ms: f64, now: f64) -> bool {
        let previous = self.anim.take();
        if self.value == to {
            // valueSetter: the target is the value already: nothing starts.
            return false;
        }
        let value = self.value;
        let x0 = value - to;
        let mut velocity = previous.map_or(0.0, |p| p.velocity + 0.0);
        if (to > value && velocity < 0.0) || (to < value && velocity > 0.0) {
            velocity = 0.0;
        }
        let stiffness = stiffness_for(x0, velocity, duration_ms);
        let omega0 = (stiffness / MASS).sqrt();
        let last = previous.map_or(0.0, |p| p.last_ts);
        self.anim = Some(SpringAnim {
            to,
            current: value,
            velocity,
            last_ts: if last != 0.0 { last } else { now },
            stiffness,
            omega0,
            initial_energy: energy(x0, 0.0, stiffness, MASS),
            finished: false,
        });
        self.step(now);
        true
    }

    /// springOnFrame at `now` (critically damped); sets the value. Whether it finished.
    fn step(&mut self, now: f64) -> bool {
        let Some(a) = self.anim.as_mut().filter(|a| !a.finished) else {
            return true;
        };
        let delta = (now - a.last_ts).max(0.0).min(64.0);
        a.last_ts = now;
        let t = delta / 1000.0;
        let v0 = a.velocity;
        let x0 = a.current - a.to;
        let omega0 = a.omega0;
        let envelope = (-omega0 * t).exp();
        let position = a.to + envelope * (x0 + (v0 + omega0 * x0) * t);
        let velocity =
            envelope * -omega0 * (x0 + (v0 + omega0 * x0) * t) + envelope * (v0 + omega0 * x0);
        a.current = position;
        a.velocity = velocity;
        let current_energy = energy(a.to - a.current, a.velocity, a.stiffness, MASS);
        if a.initial_energy == 0.0 || current_energy / a.initial_energy <= ENERGY_THRESHOLD {
            a.velocity = 0.0;
            a.current = a.to;
            a.last_ts = 0.0;
            a.finished = true;
        }
        self.value = a.current;
        a.finished
    }
}

/// Easing.inOut(Easing.quad).
fn in_out_quad(t: f64) -> f64 {
    let quad = |t: f64| t * t;
    if t < 0.5 {
        quad(t * 2.0) / 2.0
    } else {
        1.0 - quad((1.0 - t) * 2.0) / 2.0
    }
}

/// A withTiming object (timing.ts), default easing.
#[derive(Clone, Copy, Debug)]
struct Timed {
    to: f64,
    duration: f64,
    start: f64,
    from: f64,
}

impl Timed {
    /// onStart: continuity with a running timing to the same target, else from `value`.
    fn start(to: f64, duration: f64, value: f64, now: f64, previous: Option<Timed>) -> Timed {
        match previous {
            Some(p) if p.to == to && p.start != 0.0 => Timed {
                to,
                duration,
                start: p.start,
                from: p.from,
            },
            _ => Timed {
                to,
                duration,
                start: now,
                from: value,
            },
        }
    }

    /// onFrame: (current, finished).
    fn frame(&mut self, now: f64) -> (f64, bool) {
        let mut runtime = now - self.start;
        if runtime < 0.0 {
            self.start = now;
            runtime = 0.0;
        }
        if runtime >= self.duration {
            self.start = 0.0;
            return (self.to, true);
        }
        let normalized = (runtime / self.duration).max(0.0).min(1.0);
        let progress = in_out_quad(normalized);
        (self.from + (self.to - self.from) * progress, false)
    }
}

/// What buttonPulseStyle's transform holds.
#[derive(Clone, Copy, Debug)]
enum PulseAnim {
    /// withTiming(1, { duration: 300 }).
    Settle(Timed),
    /// withRepeat(withSequence(withTiming(1.05, 1000), withTiming(1, 1000)), -1, true): the
    /// sequence's running child (0 or 1).
    Pulse(usize, Timed),
}

/// buttonPulseStyle's style updater (useAnimatedStyleCommon.ts styleUpdater): the animation
/// it runs, its current value, whether its frame callback is queued.
#[derive(Clone, Copy, Debug)]
struct Pulse {
    anim: Option<PulseAnim>,
    current: f64,
    running: bool,
}

impl Pulse {
    /// The updater at a `progress` set at `now`: prepareAnimation from the current value (the
    /// running animation's, or the last one's end), then the frame callback at once if none
    /// is queued. Whether it queued one now.
    fn mapper(&mut self, progress: f64, now: f64) -> bool {
        let value = self.current;
        let previous = self.anim;
        self.anim = Some(if progress > PULSE_FROM {
            // withRepeat → withSequence → withTiming(1.05).onStart: its previous animation is
            // never a timing to 1.05 with a start time.
            PulseAnim::Pulse(0, Timed::start(PULSE_TO, PULSE_MS, value, now, None))
        } else {
            let previous = match previous {
                Some(PulseAnim::Settle(t)) => Some(t),
                _ => None,
            };
            PulseAnim::Settle(Timed::start(1.0, SETTLE_MS, value, now, previous))
        });
        if self.running {
            return false;
        }
        self.running = true;
        self.frame(now);
        true
    }

    /// The frame callback at `now`.
    fn frame(&mut self, now: f64) {
        let Some(anim) = self.anim.as_mut() else {
            self.running = false;
            return;
        };
        match anim {
            PulseAnim::Settle(t) => {
                let (v, done) = t.frame(now);
                self.current = v;
                if done {
                    self.anim = None;
                    self.running = false;
                }
            }
            PulseAnim::Pulse(child, t) => {
                let (v, done) = t.frame(now);
                self.current = v;
                if done {
                    if *child == 0 {
                        // The sequence's next child starts from where this one ended.
                        *child = 1;
                        *t = Timed::start(1.0, PULSE_MS, v, now, None);
                    } else {
                        // The repeat (reverse, which a sequence ignores): the sequence again.
                        *child = 0;
                        *t = Timed::start(PULSE_TO, PULSE_MS, v, now, None);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Layout: Yoga's pixel grid (React Native 0.88: roundLayoutResultsToPixelGrid).

/// roundValueToPixelGrid.
fn round_px(value: f64, scale: f64, ceil: bool, floor: bool) -> f64 {
    let scaled = value * scale;
    let mut fraction = scaled % 1.0;
    if fraction < 0.0 {
        fraction += 1.0;
    }
    let near = |a: f64, b: f64| (a - b).abs() < 0.0001;
    let rounded = if near(fraction, 0.0) {
        scaled - fraction
    } else if near(fraction, 1.0) {
        scaled - fraction + 1.0
    } else if ceil {
        scaled - fraction + 1.0
    } else if floor {
        scaled - fraction
    } else {
        scaled - fraction
            + if fraction > 0.5 || near(fraction, 0.5) {
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

/// A frame in window points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct R {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

/// A laid-out node: its unrounded absolute origin and its window frame (rounded lefts summed).
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

    /// A child at (x, y) relative, `w × h` unrounded; `text`: a measure-func node.
    fn child(&self, s: f64, x: f64, y: f64, w: f64, h: f64, text: bool) -> Node {
        let (ax, ay) = (self.ax + x, self.ay + y);
        let off = |v: f64| {
            let scaled = v * s;
            (scaled.round() - scaled).abs() >= 0.0001
        };
        let (fw, fh) = (text && off(w), text && off(h));
        let edge = |a: f64, d: f64, frac: bool| {
            round_px(a + d, s, frac, text && !frac) - round_px(a, s, false, text)
        };
        Node {
            ax,
            ay,
            r: R {
                x: self.r.x + round_px(x, s, false, text) as f32,
                y: self.r.y + round_px(y, s, false, text) as f32,
                w: edge(ax, w, fw) as f32,
                h: edge(ay, h, fh) as f32,
            },
        }
    }
}

/// ToggleButton's frames.
#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    /// The PressableScale (and its Animated.View).
    button: R,
    /// The icons' Text frames (the iconContainers hug them).
    scan: R,
    qr: R,
    /// The labels.
    connect: R,
    share: R,
}

/// The measured text sizes (Core Text's widths with the letterSpacing after each glyph, the
/// line heights), unrounded.
#[derive(Clone, Copy, Debug)]
struct Sizes {
    icon: (f32, f32),
    connect: (f32, f32),
    share: (f32, f32),
}

impl Layout {
    fn new(w: f32, h: f32, s: f32, sizes: Sizes) -> Layout {
        let sd = s as f64;
        let t = |(w, h): (f32, f32)| (text_round(w, s) as f64, text_round(h, s) as f64);
        let (iw, ih) = t(sizes.icon);
        let (cw, chh) = t(sizes.connect);
        let (sw, sh) = t(sizes.share);
        let root = Node::root(w, h);
        // buttonContainer: absolute, bottom 50, alignSelf center; a column of the 64 × 64
        // Animated.View and the labelContainer (marginTop 12, height 20, CONNECT's width).
        let width = (BUTTON as f64).max(cw);
        let height = BUTTON as f64 + LABEL_TOP as f64 + LABEL_BOX as f64;
        let container = root.child(
            sd,
            (w as f64 - width) / 2.0,
            h as f64 - BOTTOM as f64 - height,
            width,
            height,
            false,
        );
        let pulse = container.child(
            sd,
            (width - BUTTON as f64) / 2.0,
            0.0,
            BUTTON as f64,
            BUTTON as f64,
            false,
        );
        let button = pulse.child(sd, 0.0, 0.0, BUTTON as f64, BUTTON as f64, false);
        // iconContainer: absolute, centred in the padding box (inside the 1 pt border); the
        // Ionicons Text at its origin.
        let inner = (BUTTON - 2.0 * BORDER) as f64;
        let icon = |n: &Node| {
            let c = n.child(
                sd,
                BORDER as f64 + (inner - iw) / 2.0,
                BORDER as f64 + (inner - ih) / 2.0,
                iw,
                ih,
                false,
            );
            c.child(sd, 0.0, 0.0, iw, ih, true).r
        };
        let labels = container.child(
            sd,
            (width - cw) / 2.0,
            BUTTON as f64 + LABEL_TOP as f64,
            cw,
            LABEL_BOX as f64,
            false,
        );
        let connect = labels.child(
            sd,
            (cw - cw) / 2.0,
            (LABEL_BOX as f64 - chh) / 2.0,
            cw,
            chh,
            true,
        );
        let share = labels.child(
            sd,
            (cw - sw) / 2.0,
            (LABEL_BOX as f64 - sh) / 2.0,
            sw,
            sh,
            true,
        );
        Layout {
            button: button.r,
            scan: icon(&button),
            qr: icon(&button),
            connect: connect.r,
            share: share.r,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The surface.

/// The demo's fonts (None where the system face can't be read: the web).
struct Fonts {
    label: Font,
    icon: Font,
}

impl Fonts {
    fn new() -> Option<Fonts> {
        Some(Fonts {
            label: skia::match_ui_font(LABEL_SIZE, LABEL_WEIGHT)?,
            icon: Font::new(IONICONS, ICON_SIZE)?,
        })
    }

    fn sizes(&self) -> Sizes {
        let lh = gfx::line_height(&self.label);
        Sizes {
            icon: (self.icon.advance_width(SCAN), gfx::line_height(&self.icon)),
            connect: (
                self.label.advance_width_spaced("CONNECT", LABEL_SPACING),
                lh,
            ),
            share: (self.label.advance_width_spaced("SHARE", LABEL_SPACING), lh),
        }
    }
}

/// The layer texture: the sprite at its origin (sampled by the picture), and under it the
/// four text layers (scan, qr-code, CONNECT, SHARE) as Core Animation keeps them: drawn once
/// on the pixel grid, composited every frame.
struct Layers {
    pixels: (u32, u32, u32),
    images: Images,
    view: wgpu::TextureView,
    size: (u32, u32),
    /// Each text layer's origin in the texture (pixels).
    origins: [(f32, f32); 4],
    drawn: bool,
}

/// The surface's state.
struct NotionQrCode {
    /// The first frame (the mount: iTime's start), the frames since, the frame the picture
    /// first shows at.
    first: Option<f64>,
    frames: u32,
    visible_from: u32,
    last_now: f64,
    size: (f32, f32, f32),
    shape: Option<Arc<ShapeData>>,
    picture: Picture,
    /// isShowingQR, progress, iTime (its last frame's value), the frozen angles.
    showing_qr: bool,
    progress: Progress,
    itime: f64,
    stagger: f64,
    frozen: f64,
    /// buttonPulseStyle, and whether its frame callback runs before the spring's.
    pulse: Pulse,
    style_first: bool,
    /// The haptic reaction: lastHapticIndex and its previous value.
    haptic_index: i32,
    reaction_prev: Option<f64>,
    /// The PressableScale (the shared pressto machine).
    press: Pressable,
    posted: Vec<String>,
    /// The resting colours (createBackgroundColors: morph 0 and 1).
    resting: [[Color; AVATARS]; 2],
    fonts: Option<Fonts>,
    layout: Option<Layout>,
    canvases: [Canvas; 2],
    renderers: [Renderer; 2],
    sprite: Option<Images>,
    layers: Option<Layers>,
}

impl NotionQrCode {
    fn new() -> NotionQrCode {
        let mut resting = [[Color::BLACK; AVATARS]; 2];
        for (k, row) in resting.iter_mut().enumerate() {
            for (i, c) in row.iter_mut().enumerate() {
                *c = background_color(i, k as f64);
            }
        }
        NotionQrCode {
            first: None,
            frames: 0,
            visible_from: 2,
            last_now: 0.0,
            size: (0.0, 0.0, 0.0),
            shape: None,
            picture: Picture::default(),
            showing_qr: false,
            progress: Progress::default(),
            itime: 0.0,
            stagger: 0.0,
            frozen: 0.0,
            pulse: Pulse {
                anim: None,
                current: 1.0,
                running: false,
            },
            style_first: false,
            haptic_index: -1,
            reaction_prev: Some(0.0),
            press: Pressable::new(),
            posted: Vec::new(),
            resting,
            fonts: Fonts::new(),
            layout: None,
            canvases: [Canvas::default(), Canvas::default()],
            renderers: [Renderer::default(), Renderer::default()],
            sprite: None,
            layers: None,
        }
    }

    /// iTime at `now`: withTiming(2π × 1000, { duration: 40 s × 1000, linear }) from the mount.
    fn itime_at(&self, now: f64) -> f64 {
        let start = self.first.unwrap_or(now);
        let to = PI * 2.0 * TURNS;
        let normalized = ((now - start) / (TURN_MS * TURNS)).max(0.0).min(1.0);
        0.0 + (to - 0.0) * normalized
    }

    /// The mappers a progress set triggers: the haptic reaction, then buttonPulseStyle (the
    /// picture and the icon / label styles read progress when drawn). Whether the style's
    /// frame callback was queued now.
    fn mappers(&mut self, now: f64) -> bool {
        let current = self.progress.value;
        if let Some(previous) = self.reaction_prev {
            if current > previous {
                for (i, &th) in HAPTIC_THRESHOLDS.iter().enumerate() {
                    if previous < th && current >= th && i as i32 > self.haptic_index {
                        self.haptic_index = i as i32;
                        self.posted.push("haptic:impact-light".into());
                        break;
                    }
                }
            } else if current < 0.05 {
                self.haptic_index = -1;
            }
        }
        self.reaction_prev = Some(current);
        let queued = self.pulse.mapper(current, now);
        if queued {
            // Its rAF now follows the spring's.
            self.style_first = false;
        }
        queued
    }

    /// toggle() at the lift, as the UI thread runs its sets at `at`.
    fn toggle(&mut self, at: f64) {
        let at = at.max(self.last_now);
        self.showing_qr = !self.showing_qr;
        self.haptic_index = -1;
        let rotation = self.itime % (2.0 * PI);
        self.stagger = rotation;
        self.frozen = rotation;
        // The new spring's rAF is queued after a running style's.
        self.style_first = self.pulse.running;
        let (to, ms) = if self.showing_qr {
            (1.0, FORWARD_MS)
        } else {
            (0.0, BACK_MS)
        };
        if self.progress.start(to, ms, at) {
            self.mappers(at);
        }
    }

    /// One display frame at `now`: iTime, then the spring (and its mappers) and the style's
    /// frame callback in their queue order.
    fn advance(&mut self, now: f64) {
        if self.first.is_none() {
            self.first = Some(now);
            // The style updater's first run at mount: withTiming(1, 300) from 1.
            self.pulse.mapper(self.progress.value, now);
        }
        self.itime = self.itime_at(now);
        let style_first = self.style_first;
        if style_first && self.pulse.running {
            self.pulse.frame(now);
        }
        let mut queued = false;
        if self.progress.running() {
            self.progress.step(now);
            queued = self.mappers(now);
        }
        if !style_first && self.pulse.running && !queued {
            self.pulse.frame(now);
        }
        self.last_now = now;
    }

    fn relayout(&mut self) {
        if self.layout.is_some() {
            return;
        }
        let (w, h, s) = self.size;
        let sizes = match self.fonts.as_ref() {
            Some(f) => f.sizes(),
            None => {
                let sf = (1950.0 + 494.0) / 2048.0 * LABEL_SIZE;
                Sizes {
                    icon: (ICON_SIZE, 571.0 / 512.0 * ICON_SIZE),
                    connect: (78.0, sf),
                    share: (54.0, sf),
                }
            }
        };
        self.layout = Some(Layout::new(w, h, s, sizes));
    }

    /// The button's scale: the pulse's Animated.View, then the PressableScale's own.
    fn button_scale(&self) -> f32 {
        (self.pulse.current * self.press.scale()) as f32
    }

    /// UIKit's hit test of the PressableScale's bounds through the pulse's and its own scale.
    fn hit(&self, x: f32, y: f32) -> bool {
        let Some(l) = self.layout.as_ref() else {
            return false;
        };
        let k = self.button_scale();
        let (cx, cy) = (l.button.x + l.button.w / 2.0, l.button.y + l.button.h / 2.0);
        let (hw, hh) = (l.button.w / 2.0 * k, l.button.h / 2.0 * k);
        x - cx >= -hw && x - cx < hw && y - cy >= -hh && y - cy < hh
    }

    /// The icons' opacities (teamIconStyle: scan, scanIconStyle: qr-code).
    fn icon_opacities(&self) -> (f32, f32) {
        let p = self.progress.value;
        (
            interpolate_clamp(p, &[0.0, 0.25], &[1.0, 0.0]) as f32,
            interpolate_clamp(p, &[0.2, 0.45], &[0.0, 1.0]) as f32,
        )
    }

    /// The labels' (opacity, translateY): CONNECT, SHARE.
    fn label_styles(&self) -> [(f32, f32); 2] {
        let p = self.progress.value;
        [
            (
                interpolate_clamp(p, &[0.0, 0.2], &[1.0, 0.0]) as f32,
                interpolate_clamp(p, &[0.0, 0.2], &[0.0, 8.0]) as f32,
            ),
            (
                interpolate_clamp(p, &[0.25, 0.5], &[0.0, 1.0]) as f32,
                interpolate_clamp(p, &[0.25, 0.5], &[8.0, 0.0]) as f32,
            ),
        ]
    }

    /// The layer texture's text layers, drawn once (canvas 0, the sprite's renderer).
    fn record_layers(&mut self, s: f32) {
        let (Some(l), Some(layers)) = (self.layout, self.layers.as_ref()) else {
            return;
        };
        let c = &mut self.canvases[0];
        c.begin(s);
        // The sprite, texel for texel.
        let sprite = ImageRef {
            layer: 0,
            width: SPRITE_W as f32,
            height: SPRITE_H as f32,
        };
        c.draw_rect(
            0.0,
            0.0,
            SPRITE_W as f32 / s,
            SPRITE_H as f32 / s,
            &Paint::shader(Shader::ImageNearest {
                image: sprite,
                to_image: Matrix::scale(s, s),
                subset: [0.0, 0.0, SPRITE_W as f32, SPRITE_H as f32],
            }),
        );
        let Some(f) = self.fonts.as_ref() else { return };
        let ink = Paint::fill(Color::view_hex(INK));
        let frames = [l.scan, l.qr, l.connect, l.share];
        for (k, r) in frames.iter().enumerate() {
            let (ox, oy) = layers.origins[k];
            let (x, y) = (ox / s, oy / s);
            c.save();
            c.clip_rect(x, y, r.w, r.h);
            if k < 2 {
                // Ionicons: half the font's lineGap below the box top + ascender.
                let m = f.icon.metrics();
                let glyph = if k == 0 { SCAN } else { QR_CODE };
                c.draw_text(glyph, x, y + m.leading / 2.0 - m.ascent, &f.icon, &ink);
            } else {
                let text = if k == 2 { "CONNECT" } else { "SHARE" };
                c.draw_text_spaced(
                    text,
                    x,
                    gfx::baseline(&f.label, y),
                    &f.label,
                    &ink,
                    LABEL_SPACING,
                );
            }
            c.restore();
        }
    }

    /// The screen (canvas 1, the layer texture's renderer).
    fn record_main(&mut self, s: f32) {
        let (w, h, _) = self.size;
        let (scan_op, qr_op) = self.icon_opacities();
        let labels = self.label_styles();
        let layers = self.layers.as_ref().unwrap();
        let tex = layers.images.image(0);
        let c = &mut self.canvases[1];
        c.begin(s);
        // The Picture.
        if let Some(shape) = self
            .shape
            .as_ref()
            .filter(|_| self.frames >= self.visible_from)
        {
            let p = &self.picture;
            for &o in &p.order {
                let index = o as usize;
                let avatar = shape.assignments[index];
                let cell = shape.sprite[avatar];
                let (x, y, size) = (p.xs[index], p.ys[index], p.sizes[index]);
                let image_opacity = p.image[index];
                let morph = p.morph[index];
                let color = if morph == 0.0 {
                    self.resting[0][avatar]
                } else if morph == 1.0 {
                    self.resting[1][avatar]
                } else {
                    background_color(avatar, morph)
                };
                let alpha = image_opacity.max(morph).clamp(0.0, 1.0) as f32;
                if alpha > 0.0 {
                    let pad = 1.0;
                    c.draw_rrect(
                        (x - pad) as f32,
                        (y - pad) as f32,
                        (size + pad) as f32,
                        (size + pad) as f32,
                        ((size + pad) / 2.0) as f32,
                        &Paint::fill(color.alpha(alpha)),
                    );
                }
                if image_opacity > 0.0 {
                    let (xf, yf, sf) = (x as f32, y as f32, size as f32);
                    c.save();
                    c.clip_rrect(xf, yf, sf, sf, p.radii[index] as f32);
                    // RectToRect(src, dst)'s inverse: dst points to sprite pixels.
                    let k = cell[2] as f32 / sf;
                    let to_image = Matrix([
                        k,
                        0.0,
                        0.0,
                        k,
                        cell[0] as f32 - xf * k,
                        cell[1] as f32 - yf * k,
                    ]);
                    let subset = [
                        cell[0] as f32,
                        cell[1] as f32,
                        (cell[0] + cell[2]) as f32,
                        (cell[1] + cell[3]) as f32,
                    ];
                    c.draw_rect(
                        xf,
                        yf,
                        sf,
                        sf,
                        &Paint::shader(Shader::ImageNearest {
                            image: tex,
                            to_image,
                            subset,
                        })
                        .with_opacity((image_opacity as f32).min(1.0)),
                    );
                    c.restore();
                }
            }
        }
        // The LinearGradients.
        draw_gradient(c, 0.0, w, TOP_GRADIENT, s);
        draw_gradient(c, h - BOTTOM_GRADIENT.0, w, BOTTOM_GRADIENT, s);
        let Some(l) = self.layout else { return };
        // The button, under its Animated.View's scale and the PressableScale's.
        let b = l.button;
        let k = (self.pulse.current * self.press.scale()) as f32;
        let (cx, cy) = (b.x + b.w / 2.0, b.y + b.h / 2.0);
        c.save();
        c.translate(cx, cy);
        c.scale(k, k);
        c.translate(-cx, -cy);
        box_shadow(c, b, RADIUS, SHADOW);
        c.draw_rrect(
            b.x,
            b.y,
            b.w,
            b.h,
            RADIUS,
            &Paint::fill(Color::view_hex(0xFFFFFF)),
        );
        c.draw_with(
            &Paint::fill(Color::BLACK.alpha(RING_A as f32 / 255.0)),
            |p| {
                skia::add_rrect(p, b.x, b.y, b.w, b.h, RADIUS);
                skia::add_rrect_hole(
                    p,
                    b.x + BORDER,
                    b.y + BORDER,
                    b.w - 2.0 * BORDER,
                    b.h - 2.0 * BORDER,
                    RADIUS - BORDER,
                );
            },
        );
        // The icon layers (iconContainer opacities), in the button.
        for (k, (r, op)) in [(l.scan, scan_op), (l.qr, qr_op)].into_iter().enumerate() {
            if op > 0.0 {
                layer(c, tex, layers.origins[k], r, 0.0, op, s);
            }
        }
        c.restore();
        // The labels: opacity and translateY.
        for (k, (r, (op, ty))) in [(l.connect, labels[0]), (l.share, labels[1])]
            .into_iter()
            .enumerate()
        {
            if op > 0.0 {
                layer(c, tex, layers.origins[2 + k], r, ty, op, s);
            }
        }
    }
}

/// A text layer `r` (its bitmap at `origin` in the layer texture) composited `dy` lower at
/// `opacity`, through the canvas's transform, sampled bilinearly (Core Animation's filter).
fn layer(c: &mut Canvas, tex: ImageRef, origin: (f32, f32), r: R, dy: f32, opacity: f32, s: f32) {
    let y = r.y + dy;
    let to_image = Matrix([s, 0.0, 0.0, s, origin.0 - r.x * s, origin.1 - y * s]);
    c.draw_rect(
        r.x,
        y,
        r.w,
        r.h,
        &Paint::image(tex, to_image).with_opacity(opacity),
    );
}

/// RCTBoxShadow's outset shadow of a view `r` with circular corners `radius`: the offset rounded
/// rect blurred by σ, masked to outside the view's rounded rect (and inside the padded one).
fn box_shadow(c: &mut Canvas, r: R, radius: f32, (dy, sigma, a): (f32, f32, u8)) {
    let blur = 2.0 * sigma;
    let pad = 2.0 * (blur + 1.0);
    c.save();
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

/// expo-linear-gradient's image: white at the stops' alphas top to bottom over `h` from `top`,
/// each pixel row's alpha at its centre rounded to 8 bits; runs of equal rows one rect.
fn draw_gradient(c: &mut Canvas, top: f32, w: f32, (h, stops): (f32, [(f32, u8); 3]), s: f32) {
    let rows = (h * s).round() as i32;
    let at = |r: i32| -> u8 {
        let t = ((r as f32 + 0.5) / s / h).clamp(0.0, 1.0);
        let k = if t <= stops[1].0 { 0 } else { 1 };
        let ((l0, a0), (l1, a1)) = (stops[k], stops[k + 1]);
        let (a0, a1) = (a0 as f32 / 255.0, a1 as f32 / 255.0);
        ((a0 + (a1 - a0) * (t - l0) / (l1 - l0)) * 255.0).round() as u8
    };
    let mut r = 0;
    while r < rows {
        let alpha = at(r);
        let mut end = r + 1;
        while end < rows && at(end) == alpha {
            end += 1;
        }
        if alpha > 0 {
            c.draw_rect(
                0.0,
                top + r as f32 / s,
                w,
                (end - r) as f32 / s,
                &Paint::fill(Color::WHITE.alpha(alpha as f32 / 255.0)),
            );
        }
        r = end;
    }
}

impl Surface for NotionQrCode {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"qr\":{},\"progress\":{},\"pulse\":{},\"points\":{},\"visible\":{}}}",
            self.showing_qr,
            self.progress.value,
            self.pulse.current,
            self.shape.as_ref().map_or(0, |s| s.torus.len()),
            self.shape.is_some() && self.frames >= self.visible_from
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
        let inside = self.hit(x, y);
        if let Some(PressEvent::Press(press)) = self.press.pointer(id, crate::gfx::phase(phase), inside) {
            // BaseButton's onPress: the app's PressablesConfig haptic, then
            // animationRef.current.toggle().
            self.posted.extend(press.global_message().map(String::from));
            self.toggle(at_ms);
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
        self.press.step(now);
        let size = (frame.width, frame.height, frame.scale);
        if self.size != size {
            self.size = size;
            self.layout = None;
            self.layers = None;
            // computeShapeData for this window (module-cached by its height).
            let (shape, cached) = shape_data(frame.height as f64);
            if self.shape.is_none() {
                // The commit after requestAnimationFrame + setTimeout(0), or at once when
                // cached (the sprite's load the frame after).
                self.visible_from = if cached { 1 } else { 2 };
            }
            self.shape = Some(shape);
        }
        self.relayout();
        self.advance(now);
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        if self.sprite.is_none() {
            let pixels = miniz_oxide::inflate::decompress_to_vec_zlib(SPRITE)
                .unwrap_or_else(|_| vec![0; (SPRITE_W * SPRITE_H * 4) as usize]);
            let image = Image::from_rgba(SPRITE_W, SPRITE_H, pixels);
            let images = Images::upload(device, queue, &[&image]);
            self.renderers[0].set_images(&images);
            self.sprite = Some(images);
        }
        if self
            .layers
            .as_ref()
            .is_none_or(|l| l.pixels != (pw, ph, s.to_bits()))
        {
            let l = self.layout.unwrap_or_default();
            let px = |v: f32| (v * s).round();
            let gap = 4.0;
            let y0 = SPRITE_H as f32 + gap;
            let mut x = 0.0;
            let mut origins = [(0.0, 0.0); 4];
            for (k, r) in [l.scan, l.qr, l.connect, l.share].iter().enumerate() {
                origins[k] = (x, y0);
                x += px(r.w) + gap;
            }
            let band = [l.scan, l.qr, l.connect, l.share]
                .iter()
                .map(|r| px(r.h))
                .fold(0.0, f32::max);
            let tw = (x as u32).max(SPRITE_W);
            let th = (y0 + band + gap) as u32;
            let images = Images::target(device, tw, th);
            self.renderers[1].set_images(&images);
            self.layers = Some(Layers {
                pixels: (pw, ph, s.to_bits()),
                view: images.render_view(),
                images,
                size: (tw, th),
                origins,
                drawn: false,
            });
        }
        if !self.layers.as_ref().unwrap().drawn {
            self.record_layers(s);
            let l = self.layers.as_mut().unwrap();
            self.renderers[0].draw(
                device,
                queue,
                encoder,
                &self.canvases[0],
                &l.view,
                wgpu::TextureFormat::Rgba8Unorm,
                l.size.0,
                l.size.1,
                wgpu::Color::TRANSPARENT,
            );
            l.drawn = true;
        }
        if let Some(shape) = self.shape.clone() {
            if self.frames >= self.visible_from {
                self.picture.compute(
                    &shape,
                    self.progress.value,
                    self.itime,
                    self.stagger,
                    self.frozen,
                    self.size.0 as f64,
                    self.size.1 as f64,
                );
            }
        }
        self.record_main(s);
        self.renderers[1].draw(
            device,
            queue,
            encoder,
            &self.canvases[1],
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        self.frames += 1;
        // iTime turns forever: the picture is redrawn every frame.
        true
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    const W: f32 = 420.0;
    const H: f32 = 912.0;
    const FRAME_MS: f64 = 1000.0 / 60.0;
    /// exact/parity-tools/notion-qrcode: the RN files run in Hermes, and RN Skia's parser.
    const REFERENCE: &str = include_str!("../../../parity-tools/notion-qrcode/reference.txt");
    /// parity.ts's states: name, progress, iTime, staggerBaseTime, frozenRotationTime.
    const FRAMES: [(&str, f64, f64, f64, f64); 8] = [
        ("rest", 0.0, 1.234, 0.0, 0.0),
        ("rest-wrap", 0.0, 5.5, 0.0, 0.0),
        ("forward-30", 0.3, 20.7, 2.1, 2.1),
        ("forward-62", 0.62, 9.9, 3.05, 3.05),
        ("forward-97", 0.97, 3.3, 1.0, 1.0),
        ("qr", 1.0, 100.3, 0.4, 0.4),
        ("back-45", 0.45, 7.0, 6.1, 6.1),
        ("back-08", 0.08, 13.25, 0.2, 0.2),
    ];

    /// What parity.ts hashes: numbers as float64 bytes, strings' bytes then a 0 (FNV-1a 32).
    #[derive(Default)]
    struct Fnv(u32, usize);
    impl Fnv {
        fn byte(&mut self, b: u8) {
            if self.1 == 0 && self.0 == 0 {
                self.0 = 0x811c_9dc5;
            }
            self.0 = (self.0 ^ b as u32).wrapping_mul(0x0100_0193);
        }
        fn num(&mut self, v: f64) {
            for b in v.to_le_bytes() {
                self.byte(b);
            }
            self.1 += 1;
        }
        fn str(&mut self, s: &str) {
            for b in s.bytes() {
                self.byte(b);
            }
            self.byte(0);
            self.1 += 1;
        }
        fn hex(&self) -> String {
            format!("{:08x}", if self.1 == 0 { 0x811c_9dc5 } else { self.0 })
        }
    }

    fn reference(kind: &str, name: Option<&str>) -> (String, usize) {
        for line in REFERENCE.lines() {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.first() != Some(&kind) {
                continue;
            }
            let (hash, count) = match name {
                Some(n) if f.get(1) == Some(&n) => (f[2], f[3]),
                None => (f[1], f[2]),
                _ => continue,
            };
            let count = count.split('=').nth(1).unwrap().parse().unwrap();
            return (hash.to_string(), count);
        }
        panic!("no {kind} {name:?} in reference.txt");
    }

    /// `hsl(220, s%, l%)` as the template literal writes it.
    fn hsl_string(avatar: usize, boost: f64) -> String {
        let (sat, light) = background_hsl(avatar, boost);
        format!("hsl({HUE}, {sat}%, {light}%)")
    }

    /// createPicture's Skia calls for a state, as stubs.ts records them (the hash and the
    /// colour strings in draw order).
    fn record(
        shape: &ShapeData,
        p: &mut Picture,
        (progress, t, st, fr): (f64, f64, f64, f64),
        colors: &mut Vec<(String, usize, f64)>,
    ) -> Fnv {
        p.compute(shape, progress, t, st, fr, W as f64, H as f64);
        let mut h = Fnv::default();
        for &o in &p.order {
            let i = o as usize;
            let avatar = shape.assignments[i];
            let c = shape.sprite[avatar];
            let (x, y, size, image, morph) = (p.xs[i], p.ys[i], p.sizes[i], p.image[i], p.morph[i]);
            let s = hsl_string(avatar, morph);
            if !colors.iter().any(|(k, ..)| *k == s) {
                colors.push((s.clone(), avatar, morph));
            }
            let pad = 1.0;
            let radius = (size + pad) / 2.0;
            for v in [
                1.0,
                x - pad,
                y - pad,
                size + pad,
                size + pad,
                radius,
                radius,
            ] {
                h.num(v);
            }
            h.str(&s);
            h.num(image.max(morph));
            if image > 0.0 {
                h.num(2.0);
                for v in [3.0, x, y, size, size, p.radii[i], p.radii[i], 1.0, 1.0] {
                    h.num(v);
                }
                for v in [4.0, c[0], c[1], c[2], c[3], x, y, size, size, image] {
                    h.num(v);
                }
                h.num(5.0);
            }
        }
        h
    }

    #[test]
    fn the_shape_data_is_hermess() {
        let shape = compute_shape_data(H as f64);
        let mut h = Fnv::default();
        let n = shape.torus.len();
        for v in [n as f64, shape.qr_size as f64, shape.qr_module_size] {
            h.num(v);
        }
        for i in 0..n {
            let (t, q) = (shape.torus[i], shape.qr[i]);
            for v in [t.x, t.y, t.z, q.x, q.y, q.z, shape.assignments[i] as f64] {
                h.num(v);
            }
        }
        for c in shape.sprite {
            for v in c {
                h.num(v);
            }
        }
        let (hash, count) = reference("shape", None);
        assert_eq!((n, shape.qr_size), (count, 25));
        assert_eq!(h.hex(), hash, "the shape data differs from Hermes's");
    }

    #[test]
    fn hermes_sort_is_stable_on_ties_and_sorts_an_order() {
        let mut v: Vec<(i32, usize)> = (0..40).map(|i| ((i * 7919 % 13) as i32, i)).collect();
        hermes_sort(&mut v, |a, b| (a.0 - b.0) as f64);
        for w in v.windows(2) {
            assert!(
                w[0].0 < w[1].0 || (w[0].0 == w[1].0 && w[0].1 < w[1].1),
                "{w:?}"
            );
        }
        // Below the insertion threshold, and the heapsort fallback's sizes.
        for n in [0usize, 1, 2, 6, 7, 100, 1000] {
            let mut v: Vec<f64> = (0..n).map(|i| ((i * 2654435761) % 1009) as f64).collect();
            hermes_sort(&mut v, |a, b| a - b);
            assert!(v.windows(2).all(|w| w[0] <= w[1]));
        }
    }

    #[test]
    fn the_picture_is_create_pictures_and_its_colours_css_color_parsers() {
        let shape = compute_shape_data(H as f64);
        let mut p = Picture::default();
        let mut colors = Vec::new();
        for (name, progress, t, st, fr) in FRAMES {
            let h = record(&shape, &mut p, (progress, t, st, fr), &mut colors);
            let (hash, count) = reference("frame", Some(name));
            // Each drawn point: 9 values, + 21 with its image.
            let ops: usize = p
                .order
                .iter()
                .map(|&o| if p.image[o as usize] > 0.0 { 9 + 21 } else { 9 })
                .sum();
            assert_eq!(ops, count, "{name}: draws");
            assert_eq!(h.hex(), hash, "{name}: the picture differs from Hermes's");
        }
        // Every hsl() string, through CSSColorParser and JsiSkColor's round trip.
        let mut h = Fnv(0x811c_9dc5, 1);
        for (_, avatar, morph) in &colors {
            let (sat, light) = background_hsl(*avatar, *morph);
            for b in hsl_bytes(sat, light) {
                h.byte(b);
            }
            h.byte(255);
        }
        let (hash, count) = reference("colors", None);
        assert_eq!(colors.len(), count);
        assert_eq!(
            format!("{:08x}", h.0),
            hash,
            "the colours differ from CSSColorParser's"
        );
    }

    #[test]
    fn jsi_colour_round_trips_every_byte() {
        // toValue: byte × (1 / 255f) into a Float32Array; fromValue: × 255, truncated.
        for k in 0..=255u32 {
            let f = k as f32 * (1.0f32 / 255.0);
            assert_eq!((f * 255.0) as u32, k);
        }
    }

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

    /// The motion without a GPU: frames every 1/60 s from `from` to `to`.
    fn run(s: &mut NotionQrCode, from: f64, to: f64, mut each: impl FnMut(&NotionQrCode, f64)) {
        let mut ms = from;
        while ms <= to {
            s.advance(ms);
            each(s, ms);
            ms += FRAME_MS;
        }
    }

    fn press(s: &mut NotionQrCode, at: f64) {
        let b = s.layout.unwrap().button;
        let (x, y) = (b.x + 32.0, b.y + 32.0);
        s.input(&pointer(PointerPhase::Down, x, y, at - 60.0));
        s.input(&pointer(PointerPhase::Up, x, y, at));
    }

    fn mounted() -> NotionQrCode {
        let mut s = NotionQrCode::new();
        s.size = (W, H, 3.0);
        s.relayout();
        s
    }

    #[test]
    fn the_toggle_scales_while_held_and_presses_only_lifted_inside() {
        // pressto as designed: 0.96 at 250 ms on the bezier; lifted outside, no onPress.
        let mut s = mounted();
        let b = s.layout.unwrap().button;
        let (x, y) = (b.x + 32.0, b.y + 32.0);
        s.input(&pointer(PointerPhase::Down, x, y, 0.0));
        s.press.step(0.0);
        s.press.step(250.0);
        assert!((s.button_scale() - 0.96).abs() < 1e-6);
        s.input(&pointer(PointerPhase::Move, x, y - 120.0, 260.0));
        s.input(&pointer(PointerPhase::Up, x, y - 120.0, 300.0));
        assert!(s.messages().is_empty());
        assert!(!s.showing_qr);
        press(&mut s, 1000.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert!(s.showing_qr);
    }

    #[test]
    fn the_spring_haptics_and_pulse_follow_reanimated() {
        let mut s = mounted();
        run(&mut s, 0.0, 1000.0, |_, _| {});
        assert_eq!(s.pulse.current, 1.0);
        assert!(!s.pulse.running);
        press(&mut s, 1008.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        // The frozen angles: iTime's last frame value mod 2π.
        assert_eq!(s.frozen, s.itime_at(s.last_now) % (2.0 * PI));
        let mut haptics = Vec::new();
        let mut last = 0.0;
        let mut settled = None;
        let mut pulse_while_moving = Vec::new();
        run(&mut s, 1000.0 + FRAME_MS, 13000.0, |s, ms| {
            let p = s.progress.value;
            assert!(p >= last, "forward progress is monotonic");
            if p > PULSE_FROM && s.progress.running() {
                pulse_while_moving.push(s.pulse.current);
            }
            if settled.is_none() && !s.progress.running() {
                settled = Some(ms);
            }
            last = p;
        });
        // Four light impacts, one per threshold, all in the first third.
        for m in s.messages() {
            haptics.push(m);
        }
        assert_eq!(haptics, vec!["haptic:impact-light".to_string(); 4]);
        assert_eq!(s.progress.value, 1.0);
        let settled = settled.unwrap();
        // Critically damped to 6e-9 of its energy at 1.5 × 6000 ms.
        assert!(
            (8500.0..9600.0).contains(&(settled - 1008.0)),
            "{}",
            settled - 1008.0
        );
        // The style restarts each frame and is evaluated at once: no pulse while it moves.
        assert!(!pulse_while_moving.is_empty() && pulse_while_moving.iter().all(|&v| v == 1.0));
        // Then 1 → 1.05 over 1000 ms (inOut(quad)), back over 1000 ms, again.
        let mut t = settled + FRAME_MS;
        let mut values = Vec::new();
        let mut s3 = mounted();
        // Re-run from the settle frame on a copy of the state to read the pulse in time.
        s3.progress = s.progress;
        s3.pulse = Pulse {
            anim: Some(PulseAnim::Pulse(
                0,
                Timed::start(PULSE_TO, PULSE_MS, 1.0, settled, None),
            )),
            current: 1.0,
            running: true,
        };
        s3.first = Some(0.0);
        while t < settled + 4000.0 {
            s3.advance(t);
            values.push((t - settled, s3.pulse.current));
            t += FRAME_MS;
        }
        let at = |dt: f64| {
            values
                .iter()
                .min_by(|a, b| (a.0 - dt).abs().total_cmp(&(b.0 - dt).abs()))
                .unwrap()
                .1
        };
        assert!((at(500.0) - 1.025).abs() < 2e-3, "{}", at(500.0));
        assert!((at(1000.0) - 1.05).abs() < 1e-3, "{}", at(1000.0));
        assert!((at(2000.0) - 1.0).abs() < 1e-3, "{}", at(2000.0));
        assert!((at(3000.0) - 1.05).abs() < 1e-3, "{}", at(3000.0));
        // Back: the spring's rAF follows the running style's, so the restarts creep, then
        // withTiming(1, 300) from where it was.
        s.advance(13000.0);
        let before = s.pulse.current;
        press(&mut s, 13010.0);
        assert!(s.style_first);
        let mut back = Vec::new();
        run(&mut s, 13000.0 + FRAME_MS, 13600.0, |s, _| {
            back.push((s.progress.value, s.pulse.current))
        });
        assert!(back.iter().all(|&(p, _)| p < 1.0));
        assert!(
            (back.last().unwrap().1 - 1.0).abs() < 1e-12,
            "{before} → {:?}",
            back.last()
        );
        // No haptics backwards.
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
    }

    #[test]
    fn a_double_toggle_before_the_spring_moves_keeps_it_still() {
        let mut s = mounted();
        run(&mut s, 0.0, 500.0, |_, _| {});
        press(&mut s, 505.0);
        // valueSetter's guard: the target is the value: the forward spring is cancelled.
        press(&mut s, 506.0);
        run(&mut s, 500.0 + FRAME_MS, 1500.0, |s, _| {
            assert_eq!(s.progress.value, 0.0)
        });
        assert!(!s.progress.running());
    }

    fn save(img: &fixture::Pixels, name: &str) {
        let bg = Color::view_hex(0xF5F5F5)
            .0
            .map(|v| (v * 255.0).round() as u8);
        gfx::save_over(img, name, [bg[0], bg[1], bg[2]]);
    }

    fn px(img: &fixture::Pixels, x: f32, y: f32) -> [u8; 4] {
        let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
        [p[0], p[1], p[2], p[3]]
    }

    #[test]
    fn torus_morph_and_qr_render() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = NotionQrCode::new();
        if s.fonts.is_none() {
            return eprintln!("no system font; skipped");
        }
        // Mount: nothing but the gradients and the button until the shape data's commit.
        let (first, _) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        let l = s.layout.unwrap();
        let centre = (l.button.x + 32.0, l.button.y + 32.0);
        assert_eq!(
            px(&first, W / 2.0, H / 2.0)[3],
            0,
            "no avatar before the data"
        );
        // Top gradient: opaque white at the top; the button: white at its centre.
        assert_eq!(px(&first, 10.0, 0.2), [255, 255, 255, 255]);
        assert_eq!(
            px(&first, centre.0 + 20.0, centre.1 + 20.0),
            [255, 255, 255, 255]
        );
        let mut ms = 0.0;
        let mut img = first;
        while ms < 2000.0 {
            ms += FRAME_MS;
            img = fixture::render(&gpu, &mut s, &frame(ms)).unwrap().0;
        }
        save(&img, "notion-qrcode-torus");
        let painted = (0..200)
            .filter(|i| px(&img, 60.0 + *i as f32 * 1.5, H / 2.0)[3] > 0)
            .count();
        assert!(painted > 20, "the torus is drawn: {painted}");
        // Press the button: the morph, mid-way, then the QR.
        s.input(&pointer(PointerPhase::Down, centre.0, centre.1, ms + 5.0));
        s.input(&pointer(PointerPhase::Up, centre.0, centre.1, ms + 70.0));
        let start = ms;
        while ms < start + 1800.0 {
            ms += FRAME_MS;
            img = fixture::render(&gpu, &mut s, &frame(ms)).unwrap().0;
        }
        save(&img, "notion-qrcode-morph");
        assert!(
            s.progress.value > 0.2 && s.progress.value < 0.9,
            "{}",
            s.progress.value
        );
        while ms < start + 11000.0 {
            ms += FRAME_MS;
            img = fixture::render(&gpu, &mut s, &frame(ms)).unwrap().0;
        }
        save(&img, "notion-qrcode-qr");
        assert_eq!(s.progress.value, 1.0);
        // The QR: its dot centres span 220 about the centre (the first row at H / 2 − 110).
        let dots = (0..250)
            .filter(|i| px(&img, W / 2.0 - 125.0 + *i as f32, H / 2.0 - 110.0)[3] > 200)
            .count();
        assert!(dots > 40, "{dots}");
        let messages = s.messages();
        assert_eq!(
            messages.iter().filter(|m| *m == "haptic:selection").count(),
            1
        );
        assert_eq!(
            messages
                .iter()
                .filter(|m| *m == "haptic:impact-light")
                .count(),
            4
        );
    }
}
