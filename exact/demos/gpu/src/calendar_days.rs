//! Calendar Days (src/animations/calendar-days: index.tsx, components/animated-slider.tsx,
//! components/calendar-card/*): a 190 × 190 tear-off calendar ("ON THE" on a #f5655b header, a
//! white body showing a day number) over a slider; dragging the slider flips the pages up, one
//! per 1/30 of its travel, each on its own spring, with a selection haptic per 1/31.
//!
//! Layout (Yoga, centred column): the card, then the slider 60 below it (window width − 80, 4
//! tall). The card: header 50 (radius 24 top, continuous), body 140 (white, radius 20 bottom),
//! under `boxShadow: 0 0 20 rgba(0,0,0,0.1)` (σ 10, outside the radius-24 box only). The body
//! holds the static top page (1, its top half; a gradient safeTop tall to rgba(0,0,0,0.03) and a
//! 1 pt rgba(0,0,0,0.08) divider), the static bottom page (31, its bottom half; a 15 pt gradient
//! from rgba(0,0,0,0.04)), and 30 pages over the bottom half. Page `i` (front: i + 1's bottom
//! half, back: i + 2's top half, mirrored) turns about its top edge: perspective 400,
//! translateY −35, rotateX(p × 180°), translateY 35, origin (50 %, 50 %, 0.005); its front shows
//! while p < 0.5, its back after; zIndex 30 − i, then i + 31. Each face: white, radius 20 bottom
//! (continuous), a 10 pt fold gradient (0.04 black, at its top on the front, its bottom on the
//! back), the number (SF-Pro-Rounded-Bold 90, black, centred in a 140 box), and DepthShadow
//! (rgba(0,0,0,0.1) under a 70 pt gradient from rgba(0,0,0,0.3), at opacity
//! interpolate(p, [0, 0.5], [0, 0.3]) on the front, [0.5, 1] → [0.3, 0] on the back).
//!
//! The faces are Core Animation layers under a 3D transform: their backing stores (drawn here
//! once into one texture at the screen's scale) sampled bilinearly through each page's
//! homography, the quad's edges not antialiased (UIViewEdgeAntialiasing is off).
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | slider translateX | Pan (plain: UIKit's 10 pt hysteresis) onUpdate: contextX + translationX; contextX = clamped x at onBegin | the same, `PanGesture::new()` |
//! | progress | clamp(translateX, 0, w) / w, re-set on every pan update | the same |
//! | picker scale | onBegin withSpring(1), onFinalize withSpring(0.8) (Gentle 900/120/4, ζ = 1) | [`RnSpring`], Reanimated's onStart/onFrame |
//! | page flip p | every progress set: if p ≠ target (progress × 30 > i), withSpring(target, { duration 1100, dampingRatio 1 }) | [`RnSpring`]: a fresh start solves the stiffness; a restart toward the same running target continues it (isTriggeredTwice), its rest measured at the default stiffness 900 |
//! | haptic | round(progress × 31) changes → Haptics.selectionAsync | `haptic:selection` |
//!
//! Input: safeTop (the top page's gradient height).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::duration_config;
use skia::{point, Canvas, Color, Font, Paint, Renderer, Shader};

use crate::gfx;

/// TOTAL_PAGES (the haptic's) and the card's pages (totalPages − 1).
const TOTAL: f64 = 31.0;
const PAGES: usize = 30;
/// SIZE, HEADER_HEIGHT, BODY_HEIGHT, PAGE_SIZE.
const SIZE: f32 = 190.0;
const HEADER: f32 = 50.0;
const BODY: f32 = 140.0;
const PAGE: f32 = 70.0;
const HEADER_COLOR: u32 = 0xf5655b;
const BACKGROUND: u32 = 0xfcfcfc;
/// sliderWrapper marginTop, the slider's height, pickerSize.
const SLIDER_GAP: f32 = 60.0;
const TRACK: f32 = 4.0;
const PICKER: f32 = 40.0;
const HIT_SLOP: f32 = 20.0;
const PICKER_REST: f64 = 0.8;
const FLIP_MS: f64 = 1100.0;
const PERSPECTIVE: f32 = 400.0;
const ORIGIN_Z: f32 = 0.005;
/// The bake texture: the front face at y 0, the back at 72, the number cells from 144 (points).
const BACK_Y: f32 = 72.0;
const CELLS_Y: f32 = 144.0;
const COLS: usize = 6;
const BAKE: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// Globals (12 floats) + 30 pages × 16.
const UNIFORM_FLOATS: usize = 12 + PAGES * 16;

/// assets/fonts/SF-Pro-Rounded-Bold.otf cut to the digits (snake's subset).
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");

/// The demo's surface: input `safeTop`.
pub fn surface() -> Box<dyn Surface> {
    let numbers: Vec<String> = (1..=31).map(|n| n.to_string()).collect();
    Box::new(CalendarDays {
        safe_top: 0.0,
        size: (0.0, 0.0),
        scale: 1.0,
        pan: PanGesture::new(),
        translate_x: 0.0,
        context_x: 0.0,
        picker: RnSpring::at(PICKER_REST),
        pages: [RnSpring::at(0.0); PAGES],
        haptic_page: 0,
        messages: Vec::new(),
        header_font: skia::match_ui_font(20.0, 600.0),
        number_font: Font::new(SF_ROUNDED_BOLD, 90.0).map(Font::with_ui_layout),
        numbers,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        bake: None,
        origins: [(0.0, 0.0); 31],
        gpu: None,
        uniforms: [0u8; UNIFORM_FLOATS * 4],
    })
}

/// A Reanimated 4 `withSpring` on one shared value, ζ ≥ 1 (both of this demo's configs are
/// critically damped), as spring.ts runs it: onStart from the running animation, onFrame
/// stepping from the current value and velocity by each frame's delta (≤ 64 ms).
#[derive(Clone, Copy, Debug)]
pub struct RnSpring {
    /// `animation.current`.
    pub value: f64,
    velocity: f64,
    to: f64,
    omega0: f64,
    /// The stiffness the rest test reads (`config.stiffness`).
    energy_k: f64,
    start_value: f64,
    initial_energy: f64,
    last: f64,
    start: f64,
    /// Whether an animation is attached.
    pub running: bool,
}

/// What `withSpring` was given.
#[derive(Clone, Copy, Debug)]
enum Config {
    /// `withSpring(v)`: Gentle, 900 / 120 / 4.
    Gentle,
    /// `{ duration, dampingRatio: 1 }`, mass 4.
    Duration(f64),
}

const MASS: f64 = 4.0;
const GENTLE_K: f64 = 900.0;

impl RnSpring {
    fn at(value: f64) -> RnSpring {
        RnSpring {
            value,
            velocity: 0.0,
            to: value,
            omega0: 0.0,
            energy_k: GENTLE_K,
            start_value: 0.0,
            initial_energy: 0.0,
            last: 0.0,
            start: 0.0,
            running: false,
        }
    }

    /// `sv.set(withSpring(to, config))` at `now` (ms).
    fn start(&mut self, to: f64, config: Config, now: f64) {
        let previous = self.running;
        let twice = previous && self.last != 0.0 && self.start != 0.0 && self.to == to;
        let x0 = if twice {
            self.start_value
        } else {
            self.value - to
        };
        let mut v = if previous { self.velocity } else { 0.0 };
        if (to > self.value && v < 0.0) || (to < self.value && v > 0.0) {
            v = 0.0;
        }
        // config.stiffness: the default's unless a fresh duration spring solves it.
        self.energy_k = GENTLE_K;
        if !twice {
            let k = match config {
                Config::Gentle => GENTLE_K,
                Config::Duration(ms) => duration_config(x0, v, ms, 1.0, MASS).stiffness,
            };
            self.energy_k = k;
            self.omega0 = (k / MASS).sqrt();
        }
        self.initial_energy = 0.5 * self.energy_k * x0 * x0;
        self.last = if previous && self.last != 0.0 {
            self.last
        } else {
            now
        };
        self.start = if twice { self.start } else { now };
        self.start_value = x0;
        self.to = to;
        self.velocity = v;
        self.running = true;
    }

    /// onFrame at `now`; whether it still runs.
    fn step(&mut self, now: f64) -> bool {
        if !self.running {
            return false;
        }
        let t = (now - self.last).clamp(0.0, 64.0) / 1000.0;
        self.last = now;
        let (x0, v0, w) = (self.value - self.to, self.velocity, self.omega0);
        let e = (-w * t).exp();
        self.value = self.to + e * (x0 + (v0 + w * x0) * t);
        self.velocity = e * -w * (x0 + (v0 + w * x0) * t) + e * (v0 + w * x0);
        let x = self.to - self.value;
        let energy = 0.5 * self.energy_k * x * x + 0.5 * MASS * self.velocity * self.velocity;
        if self.initial_energy == 0.0 || energy / self.initial_energy <= 6e-9 {
            self.value = self.to;
            self.velocity = 0.0;
            self.last = 0.0;
            self.running = false;
        }
        self.running
    }
}

struct Bake {
    scale: f32,
    view: wgpu::TextureView,
    /// Its size in pixels.
    px: (u32, u32),
    /// The number cells' crop of the 190 × 140 number box (points): x, y, w, h.
    crop: [f32; 4],
}

struct Gpu {
    format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    bind: Option<wgpu::BindGroup>,
}

struct CalendarDays {
    safe_top: f32,
    size: (f32, f32),
    scale: f32,
    pan: PanGesture,
    translate_x: f64,
    context_x: f64,
    picker: RnSpring,
    pages: [RnSpring; PAGES],
    haptic_page: i64,
    messages: Vec<String>,
    header_font: Option<Font>,
    number_font: Option<Font>,
    /// "1" … "31".
    numbers: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
    bake: Option<Bake>,
    /// Each number's glyph origin in its box, at the bake's scale.
    origins: [(f32, f32); 31],
    gpu: Option<Gpu>,
    uniforms: [u8; UNIFORM_FLOATS * 4],
}

/// Placement of the frame's boxes, in canvas points.
#[derive(Clone, Copy)]
struct Layout {
    card: (f32, f32),
    slider: (f32, f32),
    slider_w: f32,
}

impl CalendarDays {
    fn px(&self, v: f32) -> f32 {
        (v * self.scale).round() / self.scale
    }
    fn layout(&self) -> Layout {
        let (w, h) = self.size;
        let top = self.px((h - (SIZE + SLIDER_GAP + TRACK)) / 2.0);
        Layout {
            card: (self.px((w - SIZE) / 2.0), top),
            slider: (40.0, top + SIZE + SLIDER_GAP),
            slider_w: w - 80.0,
        }
    }

    fn slider_w(&self) -> f64 {
        (self.size.0 - 80.0).max(1.0) as f64
    }
    fn clamped_x(&self) -> f64 {
        self.translate_x.clamp(0.0, self.slider_w())
    }
    fn progress(&self) -> f64 {
        self.clamped_x() / self.slider_w()
    }

    /// Progress was set (every pan update): the pages' reaction and the haptic's.
    fn progress_set(&mut self, now: f64) {
        let current = self.progress() * PAGES as f64;
        for (i, page) in self.pages.iter_mut().enumerate() {
            let target = if current > i as f64 { 1.0 } else { 0.0 };
            if page.value == target {
                continue;
            }
            page.start(target, Config::Duration(FLIP_MS), now);
        }
        let haptic = (self.progress() * TOTAL).round() as i64;
        if haptic != self.haptic_page {
            self.haptic_page = haptic;
            self.messages.push("haptic:selection".into());
        }
    }

    fn picker_hit(&self, x: f32, y: f32) -> bool {
        let l = self.layout();
        let (cx, cy) = (
            l.slider.0 + self.clamped_x() as f32,
            l.slider.1 + TRACK / 2.0,
        );
        let half = (PICKER / 2.0 + HIT_SLOP) * self.picker.value as f32;
        (x - cx).abs() <= half && (y - cy).abs() <= half
    }

    /// The faces and the number cells, drawn once per scale into one texture.
    fn bake(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let Some(font) = self.number_font.as_ref() else {
            return;
        };
        let s = self.scale;
        let mut origins = [(0.0, 0.0); 31];
        for (i, n) in self.numbers.iter().enumerate() {
            origins[i] = number_origin(font, n, s);
        }
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for n in &self.numbers {
            let (x, y) = origins[n.parse::<usize>().unwrap() - 1];
            let m = font.measure_text(n);
            l = l.min(x + m.x);
            t = t.min(y + m.y);
            r = r.max(x + m.x + m.width);
            b = b.max(y + m.y + m.height);
        }
        let crop = [
            l.floor() - 1.0,
            t.floor() - 1.0,
            (r.ceil() + 1.0) - (l.floor() - 1.0),
            (b.ceil() + 1.0) - (t.floor() - 1.0),
        ];
        let rows = self.numbers.len().div_ceil(COLS);
        let width = SIZE.max(COLS as f32 * (crop[2] + 2.0));
        let height = CELLS_Y + rows as f32 * (crop[3] + 2.0);
        let px = ((width * s).ceil() as u32, (height * s).ceil() as u32);
        let view = gfx::target(device, "calendar bake", BAKE, px.0, px.1);
        let mut c = Canvas::default();
        c.begin(s);
        for (y0, front) in [(0.0, true), (BACK_Y, false)] {
            c.save();
            c.translate(0.0, y0);
            c.clip_rect(0.0, 0.0, SIZE, PAGE);
            c.clip_continuous_rrect(0.0, -40.0, SIZE, PAGE + 40.0, 20.0);
            c.draw_rect(0.0, 0.0, SIZE, PAGE, &Paint::fill(Color::WHITE));
            // FoldGradient: 10 tall, its 0.04 end at the fold.
            let (g0, g1) = if front {
                (0.0, 10.0)
            } else {
                (PAGE - 10.0, PAGE)
            };
            let (c0, c1) = if front {
                (Color::BLACK.alpha(0.04), Color::TRANSPARENT)
            } else {
                (Color::TRANSPARENT, Color::BLACK.alpha(0.04))
            };
            let g = Shader::Linear {
                start: point(0.0, g0),
                end: point(0.0, g1),
                stops: vec![(0.0, c0), (1.0, c1)],
            };
            c.draw_rect(0.0, g0, SIZE, 10.0, &Paint::shader(g));
            c.restore();
        }
        let black = Paint::fill(Color::BLACK);
        for (i, n) in self.numbers.iter().enumerate() {
            let (cx, cy) = (
                (i % COLS) as f32 * (crop[2] + 2.0),
                CELLS_Y + (i / COLS) as f32 * (crop[3] + 2.0),
            );
            let (x, y) = origins[i];
            c.save();
            c.clip_rect(cx, cy, crop[2], crop[3]);
            c.translate(cx - crop[0], cy - crop[1]);
            c.draw_text(n, x, y, font, &black);
            c.restore();
        }
        let mut renderer = Renderer::default();
        renderer.draw(
            device,
            queue,
            encoder,
            &c,
            &view,
            BAKE,
            px.0,
            px.1,
            wgpu::Color::TRANSPARENT,
        );
        self.origins = origins;
        self.bake = Some(Bake {
            scale: s,
            view,
            px,
            crop,
        });
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.bind = None;
        }
    }
}

const PAGE_WGSL: &str = r#"
struct Page { h0: vec4<f32>, h1: vec4<f32>, h2: vec4<f32>, info: vec4<f32> };
struct U {
    // canvas size (points), scale, srgb
    a: vec4<f32>,
    // crop x, y, w, h (points)
    crop: vec4<f32>,
    // bake size (px), columns
    bake: vec4<f32>,
    pages: array<Page, 30>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct V { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) @interpolate(flat) id: u32 };

@vertex fn vs(@builtin(vertex_index) i: u32, @builtin(instance_index) id: u32) -> V {
    let p = u.pages[id];
    let f = vec3<f32>(f32(i & 1u) * 190.0, f32(i >> 1u) * 70.0, 1.0);
    let x = dot(p.h0.xyz, f);
    let y = dot(p.h1.xyz, f);
    let w = dot(p.h2.xyz, f);
    var o: V;
    o.pos = vec4<f32>(2.0 * x / u.a.x - w, w - 2.0 * y / u.a.y, 0.0, w);
    o.local = f.xy;
    o.id = id;
    return o;
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment fn fs(v: V) -> @location(0) vec4<f32> {
    let p = u.pages[v.id];
    let s = u.a.z;
    let texel = 0.5 / s;
    let back = p.info.x > 0.5;
    let fx = clamp(v.local.x, texel, 190.0 - texel);
    let fy = clamp(v.local.y, texel, 70.0 - texel);
    let base = textureSampleLevel(tex, smp, vec2<f32>(fx, fy + select(0.0, 72.0, back)) * s / u.bake.xy, 0.0);
    // The number box: the front shows its bottom half, the back its top half mirrored.
    let bx = v.local.x;
    let by = select(v.local.y + 70.0, 70.0 - v.local.y, back);
    let c = vec2<f32>(bx, by) - u.crop.xy;
    var cov = 0.0;
    if (c.x >= 0.0 && c.y >= 0.0 && c.x <= u.crop.z && c.y <= u.crop.w) {
        let cell = p.info.y;
        let col = cell - floor(cell / u.bake.z) * u.bake.z;
        let row = floor(cell / u.bake.z);
        let origin = vec2<f32>(col * (u.crop.z + 2.0), 144.0 + row * (u.crop.w + 2.0));
        let q = origin + clamp(c, vec2<f32>(texel), u.crop.zw - vec2<f32>(texel));
        cov = textureSampleLevel(tex, smp, q * s / u.bake.xy, 0.0).a;
    }
    // DepthShadow: rgba(0,0,0,0.1) under a 0.3 → 0 gradient over the face's 70, at its opacity.
    let g = 0.3 * (1.0 - clamp(v.local.y, 0.0, 70.0) / 70.0);
    let shade = p.info.z * (1.0 - 0.9 * (1.0 - g));
    let rgb = base.rgb * (1.0 - cov) * (1.0 - shade);
    if (u.a.w > 0.5 && base.a > 0.0) {
        return vec4<f32>(lin(rgb / base.a) * base.a, base.a);
    }
    return vec4<f32>(rgb, base.a);
}
"#;

/// The text box of `n` in the 190 × 140 number box at `scale`: the glyphs' x and baseline.
/// numberContainer is centred (a View: rounded); the Text in it at 0, its line centred in the
/// box it ceils to (textAlign center); the line centred in 140, floored (a Text node).
fn number_origin(font: &Font, n: &str, scale: f32) -> (f32, f32) {
    let ceil = |v: f32| (v * scale - 1e-3).ceil() / scale;
    let width = font.advance_width(n);
    let boxed = ceil(width);
    let left = ((SIZE - boxed) / 2.0 * scale).round() / scale + (boxed - width) / 2.0;
    let top = (((BODY - ceil(gfx::line_height(font))) / 2.0) * scale + 1e-3).floor() / scale;
    (left, gfx::baseline(font, top))
}

fn put(buf: &mut [u8], at: usize, v: f32) {
    buf[at * 4..at * 4 + 4].copy_from_slice(&v.to_le_bytes());
}

impl Surface for CalendarDays {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(Value::Number(v)) = inputs.first() {
            self.safe_top = *v as f32;
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
        let flipped = self.pages.iter().filter(|p| p.value >= 0.5).count();
        Some(format!(
            "{{\"progress\":{:.4},\"flipped\":{},\"day\":{},\"held\":{}}}",
            self.progress(),
            flipped,
            flipped + 1,
            self.pan.tracking()
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
        let claim = self.picker_hit(x, y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, claim) {
            Event::Begin { .. } => {
                self.picker.start(1.0, Config::Gentle, at_ms);
                self.context_x = self.clamped_x();
            }
            Event::Start(p) | Event::Update(p) => {
                self.translate_x = self.context_x + p.translation_x as f64;
                self.progress_set(at_ms);
            }
            Event::End(_) | Event::Fail => self.picker.start(PICKER_REST, Config::Gentle, at_ms),
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
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        let now = frame.now_ms;
        let mut moving = self.picker.step(now);
        for page in self.pages.iter_mut() {
            moving |= page.step(now);
        }
        if self.bake.as_ref().map(|b| b.scale) != Some(frame.scale) {
            self.bake(device, queue, encoder);
        }

        let l = self.layout();
        let (cx, cy) = l.card;
        let cxp = self.clamped_x() as f32;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        // cardShadow: outside its radius-24 box only (the body's radius-20 corners show the
        // screen there).
        c.draw_rrect_shadow(
            cx,
            cy,
            SIZE,
            SIZE,
            24.0,
            10.0,
            Color::rgba8(0, 0, 0, 255).alpha(0.1),
        );
        c.draw_continuous_rrect(
            cx,
            cy,
            SIZE,
            SIZE,
            24.0,
            &Paint::fill(Color::hex(BACKGROUND)),
        );
        // Header.
        c.save();
        c.clip_rect(cx, cy, SIZE, HEADER);
        c.clip_continuous_rrect(cx, cy, SIZE, HEADER + 48.0, 24.0);
        c.draw_rect(
            cx,
            cy,
            SIZE,
            HEADER,
            &Paint::fill(Color::view_hex(HEADER_COLOR)),
        );
        c.restore();
        if let Some(font) = self.header_font.as_ref() {
            let width = font.advance_width_spaced("ON THE", 3.0);
            let s = frame.scale;
            let ceil = |v: f32| (v * s - 1e-3).ceil() / s;
            let floor = |v: f32| (v * s + 1e-3).floor() / s;
            let left = floor((SIZE - ceil(width)) / 2.0);
            let top = floor((HEADER - ceil(gfx::line_height(font))) / 2.0);
            c.draw_text_spaced(
                "ON THE",
                cx + left,
                cy + gfx::baseline(font, top),
                font,
                &Paint::fill(Color::WHITE),
                3.0,
            );
        }
        // Body and the two static pages.
        let by = cy + HEADER;
        c.save();
        c.clip_rect(cx, by, SIZE, BODY);
        c.clip_continuous_rrect(cx, by - 40.0, SIZE, BODY + 40.0, 20.0);
        c.draw_rect(cx, by, SIZE, BODY, &Paint::fill(Color::WHITE));
        c.restore();
        let number = self.number_font.as_ref();
        let (top_origin, bottom_origin) = (Some(self.origins[0]), Some(self.origins[30]));
        let black = Paint::fill(Color::BLACK);
        // Top: radius 20 at its top; the number box from its top (−35 + 35).
        c.save();
        c.clip_rect(cx, by, SIZE, PAGE);
        c.clip_continuous_rrect(cx, by, SIZE, PAGE + 40.0, 20.0);
        if let (Some(f), Some((x, y))) = (number, top_origin) {
            c.draw_text("1", cx + x, by + y, f, &black);
        }
        let gh = self.safe_top;
        let g = Shader::Linear {
            start: point(0.0, by + PAGE - gh),
            end: point(0.0, by + PAGE),
            stops: vec![(0.0, Color::TRANSPARENT), (1.0, Color::BLACK.alpha(0.03))],
        };
        c.draw_rect(cx, by + PAGE - gh, SIZE, gh, &Paint::shader(g));
        c.draw_rect(
            cx,
            by + PAGE - 1.0,
            SIZE,
            1.0,
            &Paint::fill(Color::BLACK.alpha(0.08)),
        );
        c.restore();
        // Bottom: radius 20 at its bottom; the number box from −70.
        c.save();
        c.clip_rect(cx, by + PAGE, SIZE, PAGE);
        c.clip_continuous_rrect(cx, by + PAGE - 40.0, SIZE, PAGE + 40.0, 20.0);
        if let (Some(f), Some((x, y))) = (number, bottom_origin) {
            c.draw_text("31", cx + x, by + y, f, &black);
        }
        let g = Shader::Linear {
            start: point(0.0, by + PAGE),
            end: point(0.0, by + PAGE + 15.0),
            stops: vec![(0.0, Color::BLACK.alpha(0.04)), (1.0, Color::TRANSPARENT)],
        };
        c.draw_rect(cx, by + PAGE, SIZE, 15.0, &Paint::shader(g));
        c.restore();

        // The slider: track, progress bar, picker (its shadow scaled with it).
        let (sx, sy) = l.slider;
        c.draw_continuous_rrect(
            sx,
            sy,
            l.slider_w,
            TRACK,
            TRACK / 2.0,
            &Paint::fill(Color::BLACK.alpha(0.08)),
        );
        if cxp > 0.0 {
            c.draw_continuous_rrect(
                sx,
                sy,
                cxp,
                TRACK,
                TRACK / 2.0,
                &Paint::fill(Color::view_hex(HEADER_COLOR)),
            );
        }
        let ps = self.picker.value as f32;
        c.save();
        c.translate(sx + cxp, sy + TRACK / 2.0);
        c.scale(ps, ps);
        c.draw_rrect_shadow_local(
            -PICKER / 2.0,
            -PICKER / 2.0 + 2.0,
            PICKER,
            PICKER,
            PICKER / 2.0,
            4.0,
            Color::BLACK.alpha(0.15),
        );
        c.draw_circle(0.0, 0.0, PICKER / 2.0, &Paint::fill(Color::WHITE));
        c.restore();

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

        // The pages, by zIndex.
        let Some(bake) = self.bake.as_ref() else {
            return moving || self.pan.tracking();
        };
        let mut order: [usize; PAGES] = std::array::from_fn(|i| i);
        let z = |i: usize, p: f64| if p < 0.5 { PAGES - i } else { i + PAGES + 1 };
        order.sort_unstable_by_key(|&i| z(i, self.pages[i].value));
        let u = &mut self.uniforms;
        put(u, 0, frame.width);
        put(u, 1, frame.height);
        put(u, 2, frame.scale);
        put(u, 3, gfx::srgb_flag(format));
        for k in 0..4 {
            put(u, 4 + k, bake.crop[k]);
        }
        put(u, 8, bake.px.0 as f32);
        put(u, 9, bake.px.1 as f32);
        put(u, 10, COLS as f32);
        for (slot, &i) in order.iter().enumerate() {
            let p = self.pages[i].value;
            let back = p >= 0.5;
            let shade = if back {
                0.3 * (1.0 - ((p - 0.5) / 0.5).clamp(0.0, 1.0))
            } else {
                0.3 * (p / 0.5).clamp(0.0, 1.0)
            };
            let h = {
                let a = (p * std::f64::consts::PI) as f32;
                let (sin, cos) = a.sin_cos();
                let (ox, oy) = (cx + SIZE / 2.0, cy + HEADER + PAGE + PAGE / 2.0);
                let w = [0.0, -sin / PERSPECTIVE, 1.0 + ORIGIN_Z * cos / PERSPECTIVE];
                [
                    [1.0 + ox * w[0], ox * w[1], -SIZE / 2.0 + ox * w[2]],
                    [
                        oy * w[0],
                        cos + oy * w[1],
                        ORIGIN_Z * sin - PAGE / 2.0 + oy * w[2],
                    ],
                    w,
                ]
            };
            let base = 12 + slot * 16;
            for (r, row) in h.iter().enumerate() {
                for (k, v) in row.iter().enumerate() {
                    put(u, base + r * 4 + k, *v);
                }
            }
            // The front shows page i + 1, the back i + 2 (cells 0-based).
            put(u, base + 12, if back { 1.0 } else { 0.0 });
            put(u, base + 13, if back { i + 1 } else { i } as f32);
            put(u, base + 14, shade as f32);
        }
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("calendar pages"),
                source: wgpu::ShaderSource::Wgsl(PAGE_WGSL.into()),
            });
            let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("calendar pages"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
            let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("calendar pages"),
                bind_group_layouts: &[Some(&layout)],
                immediate_size: 0,
            });
            let blend = wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING;
            let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("calendar pages"),
                layout: Some(&pl),
                vertex: wgpu::VertexState {
                    module: &module,
                    entry_point: Some("vs"),
                    buffers: &[],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &module,
                    entry_point: Some("fs"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(blend),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleStrip,
                    ..Default::default()
                },
                depth_stencil: None,
                multisample: Default::default(),
                multiview_mask: None,
                cache: None,
            });
            let buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("calendar pages"),
                size: (UNIFORM_FLOATS * 4) as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            self.gpu = Some(Gpu {
                format,
                pipeline,
                layout,
                buffer,
                sampler: gfx::linear_sampler(device, "calendar pages"),
                bind: None,
            });
        }
        let gpu = self.gpu.as_mut().unwrap();
        queue.write_buffer(&gpu.buffer, 0, &self.uniforms);
        let bind = gpu.bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("calendar pages"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: gpu.buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(&bake.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                ],
            })
        });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("calendar pages"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &*bind, &[]);
        pass.draw(0..4, 0..PAGES as u32);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_duration_spring_restarted_toward_its_target_continues() {
        let mut a = RnSpring::at(0.0);
        a.start(1.0, Config::Duration(FLIP_MS), 16.0);
        let mut b = a;
        for k in 2..20 {
            a.step(k as f64 * 16.0);
            b.step(k as f64 * 16.0);
            b.start(1.0, Config::Duration(FLIP_MS), k as f64 * 16.0);
        }
        assert!((a.value - b.value).abs() < 1e-12, "{} {}", a.value, b.value);
        let mut ms = 320.0;
        while a.step(ms) {
            ms += 16.0;
        }
        assert_eq!(a.value, 1.0);
        assert!((1100.0..2000.0).contains(&ms), "{ms}");
    }

    #[test]
    fn dragging_the_slider_flips_the_pages() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 2.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "calendar-rest", [252, 252, 252]);
        assert!(!animating);
        // Card at (115, 329): the header's colour, the body white, a page's number ink.
        let header = rest.at(2 * 125, 2 * 335);
        assert!(header[0] > 240 && header[1] < 120, "{header:?}");
        assert_eq!(&rest.at(2 * 120, 2 * 500)[..3], &[255, 255, 255]);
        let ink = (2 * 440..2 * 470)
            .flat_map(|y| (2 * 150..2 * 270).map(move |x| (x, y)))
            .filter(|&(x, y)| rest.at(x, y)[0] < 64)
            .count();
        assert!(ink > 200, "{ink}");
        assert_eq!(
            s.agent("{}").unwrap(),
            "{\"progress\":0.0000,\"flipped\":0,\"day\":1,\"held\":false}"
        );

        // Drag the picker (at 40, 585) halfway, 100 ms after the down.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 585.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&pointer(PointerPhase::Down, 40.0, 0.0));
        let mut ms = 100.0;
        for k in 1..=30 {
            s.input(&pointer(
                PointerPhase::Move,
                40.0 + 180.0 * k as f32 / 30.0,
                ms,
            ));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 16.0;
        }
        let haptics = s.messages();
        assert!(
            haptics.iter().all(|m| m == "haptic:selection") && haptics.len() >= 10,
            "{haptics:?}"
        );
        let (mid, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&mid, "calendar-mid", [252, 252, 252]);
        s.input(&pointer(PointerPhase::Up, 220.0, ms));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (done, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&done, "calendar-done", [252, 252, 252]);
        assert!(!animating);
        // 170 of 340: the hysteresis leaves out 10 pt, progress 0.5 → 15 pages.
        assert_eq!(
            s.agent("{}").unwrap(),
            "{\"progress\":0.5000,\"flipped\":15,\"day\":16,\"held\":false}"
        );
    }
}
