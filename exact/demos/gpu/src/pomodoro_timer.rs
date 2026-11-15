//! Pomodoro Timer (src/animations/pomodoro-timer: src/index.tsx, components/animated-count/*,
//! components/draggable-slider/*, hooks/useToggle.ts): a ring of 200 ticks (radius 280, its
//! centre 140 above the screen's bottom) the finger turns from the lower half of the screen,
//! the seconds it marks rolling in a five-digit counter above; the white button starts a
//! timer that counts the ticks back, one a second.
//!
//! Layout: on black, the counter (AnimatedCount: five 68 × 120 digits in a reversed row,
//! marginBottom 256, the column centred); the ring box (560 × 560, centred, translateY height /
//! 2 − 140) holding the orange indicator (3 × 48 at top −20, zIndex 10) and the ticks (1.5 wide;
//! every 10th 40 tall and white, the others 30 and rgba(255,255,255,0.5); each at its angle,
//! along the radius) turned together by −progressRadiants; the pan view (the screen's lower
//! half); the button (pressto PressableScale, 64, white, radius 32, MaterialCommunityIcons
//! timer / stop 28 #111) at right 32, bottom 48.
//!
//! A digit: overflow hidden; its column of "0" … "9" (SF Pro Rounded Bold 100, white, centred,
//! each 68 × 120) at translateY −120 × digit and scaleX 0.7 while changing; an expo BlurView
//! (tint default) at intensity 17 × isChangingProgress; black LinearGradients over its top and
//! bottom third. The column's texts are a layer's backing store moved and squeezed by Core
//! Animation: baked once, sampled bilinearly. The blur is `skia::backdrop`, per digit.
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | progress | Pan: onBegin cancel, onUpdate previous + translationX; onFinalize: > 0 → withTiming(0, 500), else withDecay(velocityX) (ignored while the timer runs) | the same: `PanGesture`, `Timing`, `Decay` |
//! | seconds | round((radiants − π/2) / (2π / 200)), radiants = π/2 − progress / 280; a change ≥ 0 sets the count and plays Haptics.selectionAsync | the same, `haptic:selection` |
//! | timer | runTimer: count 0 → Alert; progress withTiming(0, 500); after 300 ms, every 1000 ms progress −= 2π·280 / 200 until count ticks; then isTimerEnabled false and an Alert 1000 ms later, whose OK resets | the same, the Alerts in Contract (`alert:invalid`, `alert:done`; OK back as the input `ok`) |
//! | digit translateY | withSpring(−120 × digit, { mass 0.25, damping 10, stiffness 100 }) | `Spring::retarget` |
//! | digit scaleX | withSpring(isChanging ? 0.7 : 1) (Gentle) | `Spring::retarget` |
//! | isChanging | true on each change of the digit (and at mount), false 200 ms after each (setTimeout) | the same |
//! | blur, opacity, translateX | withTiming(…) (300 ms, inOut quad): intensity 17 × changing, visible ? 1 : 0, −68 × invisible / 2 | `Timing` |
//! | tick colour | withTiming(isTimerEnabled ? rgba(222,208,208,0.525) : colour), per channel in gamma 2.2 | [`Fade`] |
//! | button | PressableScale (pressto) | `pressto::Pressable` |
//!
//! Input: ok (the completion alert's OK presses, counted).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use pressto::{PressEvent, Pressable};
use reanimated::{Decay, Easing, Spring, SpringConfig, Timing, GENTLE};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::blur::GRAPHITE_FORMAT;
use skia::{Canvas, Color, Font, Matrix, Paint, Renderer};

use crate::gfx;

const LINES: usize = 200;
const RADIUS: f64 = 280.0;
const MAX_DIGITS: usize = 5;
const DIGIT_W: f32 = 68.0;
const DIGIT_H: f32 = 120.0;
const BUTTON: f32 = 64.0;
const TRANSLATE_SPRING: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 0.25 };
const TIMER_ICON: &str = "\u{F13AB}";
const STOP_ICON: &str = "\u{F04DB}";

static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");
static MCI: &[u8] = include_bytes!("../fonts/mci-pomodoro-subset.ttf");

/// The demo's surface: input `ok`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Pomodoro {
        size: (0.0, 0.0),
        scale: 0.0,
        started: false,
        progress: Progress::default(),
        previous: 0.0,
        pan: PanGesture::new(),
        timer_shared: false,
        enabled: false,
        run: None,
        alert_at: None,
        ok: None,
        previous_tick: 0,
        count: 0,
        digits: std::array::from_fn(|_| Digit::default()),
        small: Fade::at([255, 255, 255], 0.5),
        big: Fade::at([255, 255, 255], 1.0),
        press: Pressable::new(),
        messages: Vec::new(),
        font: Font::new(SF_ROUNDED_BOLD, 100.0).map(Font::with_ui_layout),
        icon: Font::new(MCI, 28.0).map(Font::with_ui_layout),
        canvas: Canvas::default(),
        renderers: [Renderer::default(), Renderer::default()],
        sprites: None,
        overlay_key: None,
        blurs: std::array::from_fn(|_| BackdropBlur::default()),
        gpu: None,
    })
}

/// The shared value `progress` and the animation it runs.
#[derive(Default)]
struct Progress {
    value: f64,
    timing: Option<Timing>,
    decay: Option<Decay>,
}

impl Progress {
    fn set(&mut self, v: f64) {
        self.value = v;
        self.timing = None;
        self.decay = None;
    }
    fn timing_to(&mut self, to: f64, ms: f64) {
        let mut t = Timing::at(self.value);
        t.to(to, ms, Easing::timing_default());
        self.timing = Some(t);
        self.decay = None;
    }
    fn fling(&mut self, v: f64) {
        let mut d = Decay::at(self.value);
        d.fling(v);
        self.decay = Some(d);
        self.timing = None;
    }
    fn step(&mut self, now: f64) -> bool {
        if let Some(t) = self.timing.as_mut() {
            let moving = t.step(now);
            self.value = t.value;
            if !moving {
                self.timing = None;
            }
            return moving;
        }
        if let Some(d) = self.decay.as_mut() {
            let moving = d.step(now);
            self.value = d.value;
            if !moving {
                self.decay = None;
            }
            return moving;
        }
        false
    }
}

/// `withTiming` of a colour (300 ms, inOut quad): per channel in gamma 2.2, rounded.
struct Fade {
    from: [f64; 4],
    to: [f64; 4],
    t: Timing,
    current: ([u8; 3], f64),
}

fn gamma(c: [u8; 3], a: f64) -> [f64; 4] {
    let l = |v: u8| (v as f64 / 255.0).powf(2.2);
    [l(c[0]), l(c[1]), l(c[2]), a]
}

impl Fade {
    fn at(c: [u8; 3], a: f64) -> Fade {
        Fade { from: gamma(c, a), to: gamma(c, a), t: Timing::at(1.0), current: (c, a) }
    }
    fn to(&mut self, c: [u8; 3], a: f64) {
        self.from = gamma(self.current.0, self.current.1);
        self.to = gamma(c, a);
        self.t.set(0.0);
        self.t.to(1.0, 300.0, Easing::timing_default());
    }
    fn step(&mut self, now: f64) -> bool {
        if !self.t.running {
            return false;
        }
        let moving = self.t.step(now);
        let t = self.t.value;
        let mut rgb = [0u8; 3];
        for (k, v) in rgb.iter_mut().enumerate() {
            let x = (self.from[k] + (self.to[k] - self.from[k]) * t).clamp(0.0, 1.0);
            *v = (x.powf(1.0 / 2.2) * 255.0).round() as u8;
        }
        let a = (self.from[3] + (self.to[3] - self.from[3]) * t).clamp(0.0, 1.0);
        self.current = (rgb, if a < 0.001 { 0.0 } else { a });
        moving
    }
    fn color(&self) -> Color {
        let (c, a) = self.current;
        Color::view_hex(((c[0] as u32) << 16) | ((c[1] as u32) << 8) | c[2] as u32).alpha(a as f32)
    }
}

/// One AnimatedDigit.
struct Digit {
    digit: Option<u32>,
    visible: Option<bool>,
    invisible: Option<usize>,
    changing: bool,
    resets: Vec<f64>,
    translate: Spring,
    squeeze: Spring,
    opacity: Timing,
    shift: Timing,
    change: Timing,
}

impl Default for Digit {
    fn default() -> Digit {
        Digit {
            digit: None,
            visible: None,
            invisible: None,
            changing: false,
            resets: Vec::new(),
            translate: Spring::at(0.0),
            squeeze: Spring::at(1.0),
            opacity: Timing::at(1.0),
            shift: Timing::at(0.0),
            change: Timing::at(0.0),
        }
    }
}

impl Digit {
    fn set_changing(&mut self, on: bool) {
        if self.changing == on {
            return;
        }
        self.changing = on;
        self.change.to(if on { 1.0 } else { 0.0 }, 300.0, Easing::timing_default());
        self.squeeze.retarget(if on { 0.7 } else { 1.0 }, GENTLE);
    }
    fn step(&mut self, now: f64) -> bool {
        let due = self.resets.iter().filter(|&&t| t <= now).count();
        if due > 0 {
            self.resets.retain(|&t| t > now);
            self.set_changing(false);
        }
        let mut moving = !self.resets.is_empty();
        moving |= self.translate.step(now);
        moving |= self.squeeze.step(now);
        moving |= self.opacity.step(now);
        moving |= self.shift.step(now);
        moving |= self.change.step(now);
        moving
    }
}

/// getDigitByIndex: the padded string's character at maxDigits − 1 − index.
fn digit_of(count: i64, index: usize) -> u32 {
    let s = format!("{:0>width$}", count, width = MAX_DIGITS);
    s.chars().nth(MAX_DIGITS - 1 - index).and_then(|c| c.to_digit(10)).unwrap_or(0)
}

struct Run {
    /// When the next interval tick lands.
    next: f64,
    counter: i64,
    target: i64,
}

struct Sprites {
    scale: f32,
    view: wgpu::TextureView,
    px: (u32, u32),
}

struct Gpu {
    format: wgpu::TextureFormat,
    layout: wgpu::BindGroupLayout,
    under: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    overlay: wgpu::RenderPipeline,
    ticks: wgpu::RenderPipeline,
    ticks_layout: wgpu::BindGroupLayout,
    buffer: wgpu::Buffer,
    ticks_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    targets: Option<((u32, u32), wgpu::TextureView, wgpu::TextureView)>,
}

struct Pomodoro {
    size: (f32, f32),
    scale: f32,
    started: bool,
    progress: Progress,
    previous: f64,
    pan: PanGesture,
    /// isTimerEnabled (the slider's shared value).
    timer_shared: bool,
    /// isTimerEnabled (the App's state: the icon).
    enabled: bool,
    run: Option<Run>,
    alert_at: Option<f64>,
    ok: Option<f64>,
    previous_tick: i64,
    count: i64,
    digits: [Digit; MAX_DIGITS],
    small: Fade,
    big: Fade,
    press: Pressable,
    messages: Vec<String>,
    font: Option<Font>,
    icon: Option<Font>,
    canvas: Canvas,
    renderers: [Renderer; 2],
    sprites: Option<Sprites>,
    overlay_key: Option<(bool, u64, u32)>,
    blurs: [BackdropBlur; MAX_DIGITS],
    gpu: Option<Gpu>,
}

impl Pomodoro {
    fn offset(&self) -> f64 {
        2.0 * std::f64::consts::PI * RADIUS / LINES as f64
    }
    fn round(&self, v: f32) -> f32 {
        (v * self.scale + 1e-4).round() / self.scale
    }
    /// The counter's left and top.
    fn counter(&self) -> (f32, f32) {
        let (w, h) = self.size;
        (self.round((w - DIGIT_W * MAX_DIGITS as f32) / 2.0), self.round((h - (DIGIT_H + 256.0)) / 2.0))
    }
    /// The ring box's top-left (Yoga) and its translateY.
    fn ring(&self) -> (f32, f32, f32) {
        let (w, h) = self.size;
        (self.round((w - 560.0) / 2.0), self.round((h - 560.0) / 2.0), h / 2.0 - 140.0)
    }
    fn button(&self) -> (f32, f32) {
        (self.size.0 - 32.0 - BUTTON, self.size.1 - 48.0 - BUTTON)
    }
    fn in_button(&self, x: f32, y: f32) -> bool {
        let (bx, by) = self.button();
        let half = BUTTON / 2.0 * self.press.scale() as f32;
        (x - bx - BUTTON / 2.0).abs() <= half && (y - by - BUTTON / 2.0).abs() <= half
    }
    fn radiants(&self) -> f64 {
        std::f64::consts::FRAC_PI_2 - self.progress.value / RADIUS
    }

    /// The reaction on progressRadiants → onProgressChange.
    fn react(&mut self, now: f64) {
        let rad_per_tick = 2.0 * std::f64::consts::PI / LINES as f64;
        let x = (self.radiants() - std::f64::consts::FRAC_PI_2) / rad_per_tick;
        let seconds = (x + 0.5).floor() as i64;
        if seconds < 0 {
            return;
        }
        if seconds != self.previous_tick {
            self.messages.push("haptic:selection".into());
            self.previous_tick = seconds;
        }
        if seconds != self.count {
            self.count = seconds;
            self.count_changed(now, false);
        }
    }

    /// AnimatedDigit's derived values and reactions after the count changed.
    fn count_changed(&mut self, now: f64, mount: bool) {
        let invisible = MAX_DIGITS.saturating_sub(self.count.to_string().len());
        for (i, d) in self.digits.iter_mut().enumerate() {
            let digit = digit_of(self.count, i);
            if d.digit != Some(digit) || mount {
                if mount {
                    d.translate = Spring::at(-(DIGIT_H as f64) * digit as f64);
                } else {
                    d.translate.retarget(-(DIGIT_H as f64) * digit as f64, TRANSLATE_SPRING);
                }
                // isChanging = curr !== prev, reset 200 ms later.
                d.digit = Some(digit);
                d.set_changing(true);
                d.resets.push(now + 200.0);
            }
            let visible = digit != 0 || i < MAX_DIGITS - invisible;
            if d.visible != Some(visible) {
                if d.visible.is_none() {
                    d.opacity = Timing::at(if visible { 1.0 } else { 0.0 });
                } else {
                    d.opacity.to(if visible { 1.0 } else { 0.0 }, 300.0, Easing::timing_default());
                }
                d.visible = Some(visible);
            }
            if d.invisible != Some(invisible) {
                let to = -(DIGIT_W as f64) * invisible as f64 / 2.0;
                if d.invisible.is_none() {
                    d.shift = Timing::at(to);
                } else {
                    d.shift.to(to, 300.0, Easing::timing_default());
                }
                d.invisible = Some(invisible);
            }
        }
    }

    fn set_timer_shared(&mut self, on: bool) {
        if self.timer_shared == on {
            return;
        }
        self.timer_shared = on;
        if on {
            self.small.to([222, 208, 208], 0.525);
            self.big.to([222, 208, 208], 0.525);
        } else {
            self.small.to([255, 255, 255], 0.5);
            self.big.to([255, 255, 255], 1.0);
        }
    }

    fn reset_timer(&mut self) {
        self.set_timer_shared(false);
        self.progress.timing_to(0.0, 500.0);
        self.run = None;
    }

    fn pressed(&mut self, now: f64) {
        if !self.enabled {
            if self.count == 0 {
                self.messages.push("alert:invalid".into());
                return;
            }
            self.run = Some(Run { next: now + 300.0 + 1000.0, counter: 0, target: self.count });
            self.set_timer_shared(true);
            self.progress.timing_to(0.0, 500.0);
            self.enabled = true;
            return;
        }
        self.enabled = false;
        self.set_timer_shared(false);
        self.run = None;
        self.reset_timer();
    }

    /// The interval and the completion's alert, up to `now`.
    fn timers(&mut self, now: f64) {
        while let Some(run) = self.run.as_mut() {
            if run.next > now {
                break;
            }
            run.counter += 1;
            run.next += 1000.0;
            let done = run.counter >= run.target;
            let v = self.progress.value - self.offset();
            self.progress.set(v);
            self.react(now);
            if done {
                self.run = None;
                self.set_timer_shared(false);
                self.alert_at = Some(now + 1000.0);
            }
        }
        if self.alert_at.is_some_and(|t| t <= now) {
            self.alert_at = None;
            self.messages.push("alert:done".into());
        }
    }

    fn bake(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let s = self.scale;
        let px = ((DIGIT_W * s).round() as u32, (DIGIT_H * s).round() as u32 * 10);
        let view = skia::render::sampled_target(device, "pomodoro digits", GRAPHITE_FORMAT, px.0, px.1);
        let c = &mut self.canvas;
        c.begin(s);
        if let Some(font) = self.font.as_ref() {
            for k in 0..10u32 {
                let t = k.to_string();
                let x = (DIGIT_W - font.advance_width(&t)) / 2.0;
                let top = k as f32 * DIGIT_H;
                let base = ((gfx::baseline(font, top)) * s - 1e-3).ceil() / s;
                c.draw_text(&t, x, base, font, &Paint::fill(Color::WHITE));
            }
        }
        self.renderers[0].draw(device, queue, encoder, c, &view, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        self.sprites = Some(Sprites { scale: s, view, px });
    }
}

const WGSL: &str = r#"
struct Cell { a: vec4<f32>, b: vec4<f32> };
struct U {
    // canvas (points), scale, srgb
    a: vec4<f32>,
    // counter top, sprite px w, h (one digit)
    b: vec4<f32>,
    // per digit: x, translateY, scaleX, opacity; blurred (1/0)
    cells: array<Cell, 5>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// The cell under p (−1 when none) and p in its local points.
fn cell(p: vec2<f32>) -> vec3<f32> {
    for (var i = 0; i < 5; i++) {
        let c = u.cells[i];
        let l = p - vec2<f32>(c.a.x, u.b.x);
        if (l.x >= 0.0 && l.x < 68.0 && l.y >= 0.0 && l.y < 120.0) { return vec3<f32>(l, f32(i)); }
    }
    return vec3<f32>(0.0, 0.0, -1.0);
}

// Black, and each digit's column (its texts' layers, moved and squeezed) inside its cell.
@fragment fn under(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy / u.a.z;
    let k = cell(p);
    if (k.z < 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
    let c = u.cells[i32(k.z)];
    let q = vec2<f32>(34.0 + (k.x - 34.0) / c.a.z, k.y - c.a.y);
    if (q.x < 0.0 || q.x > 68.0 || q.y < 0.0 || q.y > 1200.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
    let size = vec2<f32>(u.b.y, u.b.z * 10.0);
    let s = textureSampleLevel(t0, smp, clamp(q * u.a.z, vec2<f32>(0.5), size - vec2<f32>(0.5)) / size, 0.0);
    return vec4<f32>(s.rgb, 1.0);
}

// The screen: each cell (its column, its blur) under its gradients, at its opacity, on black.
@fragment fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy / u.a.z;
    let k = cell(p);
    var c = vec3<f32>(0.0);
    if (k.z >= 0.0) {
        let cl = u.cells[i32(k.z)];
        c = textureLoad(t0, vec2<i32>(pos.xy), 0).rgb;
        let t = k.y / 120.0;
        let top = max(0.0, 1.0 - 3.0 * t);
        let bottom = max(0.0, 3.0 * t - 2.0);
        c = c * (1.0 - top) * (1.0 - bottom);
        c = c * cl.a.w;
    }
    if (u.a.w > 0.5) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}

// The indicator and the button, drawn once into t0.
@fragment fn overlay(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var c = textureLoad(t0, vec2<i32>(pos.xy), 0);
    if (u.a.w > 0.5 && c.a > 0.0) { c = vec4<f32>(lin(c.rgb / c.a) * c.a, c.a); }
    return c;
}
"#;

const TICKS_WGSL: &str = r#"
struct Tick { a: vec4<f32>, color: vec4<f32> };
struct U {
    // canvas (points), srgb, pixels per point
    a: vec4<f32>,
    ticks: array<Tick, 201>,
};
@group(0) @binding(0) var<uniform> u: U;

struct V {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) color: vec4<f32>,
    // The point in the tick's own frame (points, from its centre), and its half size.
    @location(1) local: vec2<f32>,
    @location(2) @interpolate(flat) half: vec2<f32>,
};

// A tick: centre (a.xy), angle a.z, height a.w, 1.5 wide. RN turns each tick's view with a
// rotate, and RCTViewComponentView switches `allowsEdgeAntialiasing` on for any transform with
// m12 / m21 ≠ 0 (every tick, and the ring under them): Core Animation's edges are antialiased,
// a coverage ramp one device pixel wide across each edge. Drawn here the same way: the quad
// grows by a pixel each side and the fragment takes the pixel's coverage along both axes of the
// tick's frame (a turn keeps distances).
@vertex fn vs(@builtin(vertex_index) i: u32, @builtin(instance_index) id: u32) -> V {
    let t = u.ticks[id];
    let w = select(1.5, 3.0, id == 200u);
    let half = vec2<f32>(w, t.a.w) * 0.5;
    let grow = 1.0 / max(u.a.w, 1.0);
    let local = (vec2<f32>(f32(i & 1u), f32(i >> 1u)) * 2.0 - 1.0) * (half + vec2<f32>(grow));
    let cs = vec2<f32>(cos(t.a.z), sin(t.a.z));
    let p = t.a.xy + vec2<f32>(local.x * cs.x - local.y * cs.y, local.x * cs.y + local.y * cs.x);
    var o: V;
    o.pos = vec4<f32>(2.0 * p.x / u.a.x - 1.0, 1.0 - 2.0 * p.y / u.a.y, 0.0, 1.0);
    o.color = t.color;
    o.local = local;
    o.half = half;
    return o;
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
    var c = v.color;
    if (u.a.z > 0.5) { c = vec4<f32>(lin(c.rgb), c.a); }
    // The pixel's coverage: its distance inside each pair of edges, in device pixels, + 0.5.
    let inside = clamp((v.half - abs(v.local)) * u.a.w + vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(1.0));
    let a = c.a * inside.x * inside.y;
    return vec4<f32>(c.rgb * a, a);
}
"#;

fn bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("pomodoro"), source: wgpu::ShaderSource::Wgsl(WGSL.into()) });
    let uniform = |binding, visibility| wgpu::BindGroupLayoutEntry {
        binding,
        visibility,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
        count: None,
    };
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("pomodoro"),
        entries: &[
            uniform(0, wgpu::ShaderStages::FRAGMENT),
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
        ],
    });
    let blend = Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING);
    let tm = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("pomodoro ticks"), source: wgpu::ShaderSource::Wgsl(TICKS_WGSL.into()) });
    let ticks_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("pomodoro ticks"), entries: &[uniform(0, wgpu::ShaderStages::VERTEX_FRAGMENT)] });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("pomodoro ticks"), bind_group_layouts: &[Some(&ticks_layout)], immediate_size: 0 });
    let ticks = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("pomodoro ticks"),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module: &tm, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &tm,
            entry_point: Some("fs"),
            targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, ..Default::default() },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let buffer = |size: usize| device.create_buffer(&wgpu::BufferDescriptor { label: Some("pomodoro"), size: size as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    Gpu {
        format,
        under: skia::render::fullscreen_pipeline(device, &module, &layout, "under", GRAPHITE_FORMAT, None),
        compose: skia::render::fullscreen_pipeline(device, &module, &layout, "compose", format, None),
        overlay: skia::render::fullscreen_pipeline(device, &module, &layout, "overlay", format, blend),
        ticks,
        ticks_layout,
        layout,
        buffer: buffer(32 + 5 * 32),
        ticks_buffer: buffer(16 + 201 * 32),
        sampler: skia::render::linear_sampler(device),
        targets: None,
    }
}

fn pass(encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, load: wgpu::LoadOp<wgpu::Color>, draw: impl FnOnce(&mut wgpu::RenderPass<'_>)) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("pomodoro"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: target, resolve_target: None, depth_slice: None, ops: wgpu::Operations { load, store: wgpu::StoreOp::Store } })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    draw(&mut pass);
}

impl Surface for Pomodoro {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(Value::Number(ok)) = inputs.first() {
            // The completion alert's OK: toggleTimer, then resetTimer.
            if self.ok.is_some_and(|o| o != *ok) {
                self.enabled = !self.enabled;
                self.reset_timer();
            }
            self.ok = Some(*ok);
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.messages)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"count\":{},\"progress\":{:.2},\"running\":{},\"enabled\":{},\"held\":{}}}",
            self.count,
            self.progress.value,
            self.timer_shared,
            self.enabled,
            self.pan.tracking()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        let phase = gfx::phase(phase);
        let on_button = self.in_button(x, y);
        match self.press.pointer(id, phase, on_button) {
            Some(PressEvent::Press(press)) => {
                self.messages.extend(press.global_message().map(String::from));
                self.pressed(at_ms);
                return;
            }
            Some(_) => return,
            None => {}
        }
        let claim = phase == Phase::Down && !on_button && y >= self.size.1 / 2.0;
        let event = self.pan.event(id, phase, x, y, at_ms, claim);
        if self.timer_shared {
            return;
        }
        match event {
            Event::Begin { .. } => {
                let v = self.progress.value;
                self.progress.set(v);
                self.previous = v;
            }
            Event::Start(p) | Event::Update(p) => {
                self.progress.set(p.translation_x as f64 + self.previous);
                self.react(at_ms);
            }
            Event::End(p) => self.finalize(p.velocity_x as f64),
            Event::Fail => self.finalize(0.0),
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
        let now = frame.now_ms;
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        if !self.started {
            self.started = true;
            self.count_changed(now, true);
        }
        self.timers(now);
        let mut moving = self.progress.step(now);
        if moving {
            self.react(now);
        }
        moving |= self.run.is_some() || self.alert_at.is_some();
        for d in self.digits.iter_mut() {
            moving |= d.step(now);
        }
        moving |= self.small.step(now);
        moving |= self.big.step(now);
        moving |= self.press.step(now);
        if self.sprites.as_ref().map(|s| s.scale) != Some(frame.scale) {
            self.bake(device, queue, encoder);
        }
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            self.gpu = Some(build(device, format));
        }
        let px = frame.pixels();
        let (left, top, ty) = self.ring();
        let (bx, by) = self.button();
        let (cl, ct) = self.counter();
        let theta = -self.radiants();
        let gpu = self.gpu.as_mut().unwrap();
        if gpu.targets.as_ref().map(|t| t.0) != Some(px) {
            let t = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, px.0, px.1);
            gpu.targets = Some((px, t("pomodoro under"), t("pomodoro overlay")));
            self.overlay_key = None;
        }
        // The indicator and the button: per press and icon.
        let okey = (self.enabled, self.press.scale().to_bits(), px.0);
        if self.overlay_key != Some(okey) {
            let k = self.press.scale() as f32;
            let (cx, cy) = (bx + BUTTON / 2.0, by + BUTTON / 2.0);
            let c = &mut self.canvas;
            c.begin(frame.scale);
            let s = frame.scale;
            let ix = left + ((560.0 - 3.0) / 2.0 * s).round() / s;
            c.draw_rect(ix, top - 20.0 + ty, 3.0, 48.0, &Paint::fill(Color::view_hex(0xFFA500)));
            c.save();
            c.concat(Matrix::translate(-cx, -cy).then(Matrix::scale(k, k)).then(Matrix::translate(cx, cy)));
            c.draw_circle(cx, cy, BUTTON / 2.0, &Paint::fill(Color::WHITE));
            if let Some(icon) = self.icon.as_ref() {
                let glyph = if self.enabled { STOP_ICON } else { TIMER_ICON };
                let w = (icon.advance_width(glyph) * s - 1e-3).ceil() / s;
                let h = (gfx::line_height(icon) * s - 1e-3).ceil() / s;
                let gl = ((BUTTON - w) / 2.0 * s + 1e-4).floor() / s;
                let gt = ((BUTTON - h) / 2.0 * s + 1e-4).floor() / s;
                let base = gfx::baseline(icon, gt + icon.metrics().leading / 2.0);
                c.draw_text(glyph, bx + gl, by + (base * s - 1e-3).ceil() / s, icon, &Paint::fill(Color::view_hex(0x111111)));
            }
            c.restore();
            let overlay = &gpu.targets.as_ref().unwrap().2;
            self.renderers[1].draw(device, queue, encoder, c, overlay, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
            self.overlay_key = Some(okey);
        }
        // The digits.
        let sprites = self.sprites.as_ref().unwrap();
        let mut u = vec![0f32; 8 + 5 * 8];
        u[0] = frame.width;
        u[1] = frame.height;
        u[2] = frame.scale;
        u[3] = gfx::srgb_flag(format);
        u[4] = ct;
        u[5] = sprites.px.0 as f32;
        u[6] = (DIGIT_H * frame.scale).round();
        for (i, d) in self.digits.iter().enumerate() {
            let o = 8 + i * 8;
            u[o] = cl + (MAX_DIGITS - 1 - i) as f32 * DIGIT_W + d.shift.value as f32;
            u[o + 1] = d.translate.value as f32;
            u[o + 2] = d.squeeze.value as f32;
            u[o + 3] = d.opacity.value as f32;
        }
        queue.write_buffer(&gpu.buffer, 0, &bytes(&u));
        let (_, under, overlay) = gpu.targets.as_ref().unwrap();
        let group = |view: &wgpu::TextureView| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pomodoro"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: gpu.buffer.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(view) },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            })
        };
        let g_sprites = group(&sprites.view);
        skia::render::fullscreen_pass(encoder, "pomodoro under", under, &gpu.under, &g_sprites);
        // The BlurViews: every capture first, then every draw back into the same picture.
        let s = frame.scale;
        let mut drawn = Vec::new();
        for (i, d) in self.digits.iter().enumerate() {
            let intensity = d.change.value * 17.0;
            if intensity <= 0.0 || d.opacity.value <= 0.0 {
                continue;
            }
            let x = u[8 + i * 8];
            let region = [(x * s).round() as i32, (ct * s).round() as i32, ((x + DIGIT_W) * s).round() as i32, ((ct + DIGIT_H) * s).round() as i32];
            let params = Material::Regular.chain().at(expo_fraction(intensity));
            self.blurs[i].run(device, queue, encoder, under, region, [0.0, 0.0], &params, s);
            drawn.push((i, region));
        }
        for (i, r) in drawn {
            let size = [(r[2] - r[0]).max(0) as u32, (r[3] - r[1]).max(0) as u32];
            self.blurs[i].draw(device, queue, encoder, under, GRAPHITE_FORMAT, [0.0, 0.0], [r[0].max(0) as u32, r[1].max(0) as u32], size);
        }
        let g_under = group(under);
        skia::render::fullscreen_pass(encoder, "pomodoro", target, &gpu.compose, &g_under);
        // The ring and the indicator's place.
        let centre = (left as f64 + 280.0, top as f64 + 280.0 + ty as f64);
        let mut t = vec![0f32; 4 + 201 * 8];
        t[0] = frame.width;
        t[1] = frame.height;
        t[2] = gfx::srgb_flag(format);
        t[3] = frame.scale;
        let (small, big) = (self.small.color().0, self.big.color().0);
        for i in 0..LINES {
            let a = 2.0 * std::f64::consts::PI / LINES as f64 * i as f64;
            let (x, y) = (a.cos() * RADIUS, a.sin() * RADIUS);
            let rotation = -x.atan2(y);
            let (sn, cs) = theta.sin_cos();
            let big_line = i % 10 == 0;
            let o = 4 + i * 8;
            t[o] = (centre.0 + x * cs - y * sn) as f32;
            t[o + 1] = (centre.1 + x * sn + y * cs) as f32;
            t[o + 2] = (rotation + theta) as f32;
            t[o + 3] = if big_line { 40.0 } else { 30.0 };
            t[o + 4..o + 8].copy_from_slice(if big_line { &big } else { &small });
        }
        queue.write_buffer(&gpu.ticks_buffer, 0, &bytes(&t));
        let tb = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pomodoro ticks"),
            layout: &gpu.ticks_layout,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: gpu.ticks_buffer.as_entire_binding() }],
        });
        let g_overlay = group(overlay);
        pass(encoder, target, wgpu::LoadOp::Load, |p| {
            p.set_pipeline(&gpu.ticks);
            p.set_bind_group(0, &tb, &[]);
            p.draw(0..4, 0..LINES as u32);
            p.set_pipeline(&gpu.overlay);
            p.set_bind_group(0, &g_overlay, &[]);
            p.draw(0..3, 0..1);
        });
        moving || self.pan.tracking()
    }
}

impl Pomodoro {
    /// onFinalize.
    fn finalize(&mut self, velocity: f64) {
        if self.progress.value > 0.0 {
            self.progress.timing_to(0.0, 500.0);
        } else {
            self.progress.fling(velocity);
        }
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn digits_pad_as_the_demo() {
        assert_eq!(digit_of(123, 0), 3);
        assert_eq!(digit_of(123, 2), 1);
        assert_eq!(digit_of(123, 4), 0);
    }

    #[test]
    fn a_drag_sets_the_seconds_and_the_timer_counts_them_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "pomodoro-rest", [0, 0, 0]);
        // The orange indicator over the ring's top (x 210, y 912 − 140 − 280 − 20 + 4).
        let ind = rest.at(3 * 210, 3 * 478);
        assert!(ind[0] > 200 && ind[2] < 80, "{ind:?}");
        // The tick right of the top one (1.8°, centre x 218.8, y 492.1): its edges are
        // antialiased, as Core Animation's are under RN's rotate (allowsEdgeAntialiasing), so
        // a row across it has partial pixels between black and its full grey, not only the two.
        let row: Vec<u8> = (640..676).map(|x| rest.at(x, 3 * 492)[0]).collect();
        let full = *row.iter().max().unwrap();
        assert!(full > 60, "{row:?}");
        assert!(row.iter().any(|&v| v > 8 && v + 8 < full), "{row:?}");

        // Drag left 100 pt slowly in the lower half, then lift still.
        let p = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 700.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&p(PointerPhase::Down, 300.0, 0.0));
        let mut ms = 0.0;
        for k in 1..=25 {
            ms += 16.0;
            s.input(&p(PointerPhase::Move, 300.0 - 4.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms += 300.0;
        fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        s.input(&p(PointerPhase::Up, 200.0, ms));
        let haptics = s.messages();
        assert!(haptics.len() >= 9 && haptics.iter().all(|m| m == "haptic:selection"), "{haptics:?}");
        while ms < 6000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let agent = s.agent("{}").unwrap();
        assert!(agent.starts_with("{\"count\":"), "{agent}");
        let count: i64 = agent[9..agent.find(',').unwrap()].parse().unwrap();
        assert!(count >= 10, "{agent}");
        let (set, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&set, "pomodoro-set", [0, 0, 0]);
        s.messages();

        // Start: the count resets to 0 and counts up to the set seconds, one a second.
        let b = |phase, at_ms| InputEvent::Pointer { id: 2, phase, x: 356.0, y: 832.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&b(PointerPhase::Down, ms));
        s.input(&b(PointerPhase::Up, ms + 60.0));
        assert!(s.agent("{}").unwrap().contains("\"running\":true,\"enabled\":true"));
        let end = ms + 1300.0 + 1000.0 * count as f64 + 1100.0;
        while ms < end {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let msgs = s.messages();
        assert!(msgs.contains(&"alert:done".to_string()), "{msgs:?}");
        assert!(s.agent("{}").unwrap().starts_with(&format!("{{\"count\":{count},")));
        // OK: back to 0, the timer icon.
        s.bind(&[Value::Number(1.0)], None).unwrap();
        while ms < end + 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"count\":0,\"progress\":0.00,\"running\":false,\"enabled\":false,\"held\":false}");
    }
}
