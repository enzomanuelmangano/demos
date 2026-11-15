//! Infinite Carousel (src/animations/infinite-carousel: index.tsx, constants.ts,
//! components/infinite-circular-carousel/*, components/list-item-calc, components/
//! background-gradient): twelve calculator themes on a circular carousel the finger pans (a
//! Pan driving one translateX that never wraps; each item shifts itself by the list's length),
//! over a blurred sweep gradient whose colour fades to the centred theme's.
//!
//! Layout (Yoga: each position rounded relative to its parent at the device pixel, sizes from
//! the unrounded absolute edges): ListItemSize L = width / 4.8; the row (width, translateX
//! (width − L) / 2) centred vertically; item i at i·L, L wide, its card (L·1.2 × L·1.2 / 0.7,
//! radius 15 continuous, overflow hidden) centred in it. A card: expo LinearGradient #343f3d →
//! #242d2b left to right, a flex-2 spacer, then (flex 3, marginBottom 10) a wrapping row of nine
//! card/3.5 cells, each a padding-2.5 circle (radius 100 continuous: Core Animation's circle):
//! #CBCBCD for the first two, the theme's primary for every third, its secondary otherwise.
//!
//! Each card is a Core Animation layer under `[perspective 500, translateX −8p, scale
//! 1 − |p|·0.025, rotateY clamp(p, −1, 1)·30°]` about its centre (p: interpolate(−shift,
//! [i−2 … i+2]·L, [−1, −1.5, 0, 1.5, 1], clamp)), drawn by zIndex floor(|p|·100): its backing
//! store (baked once at the screen's scale) sampled bilinearly through the 4×4, the quad's edges
//! not antialiased.
//!
//! The background is two RN Skia canvases (Display P3 surfaces) over the screen's #e0be95: a
//! full-screen Rect of the main colour at 0.75 under one with SweepGradient(centre,
//! [#CBCBCD, main, main]) and Blur(30), then a Rect at opacity 0.3 of SweepGradient([white,
//! white, #d9d9d9]) with Blur(10). The blurs are Graphite's (`GraphiteBlur`, decal, the layer the
//! rect's bounds); the white one once, the coloured one again only while the colour moves.
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | translateX | Pan onBegin: cancelAnimation, context; onUpdate: context + translationX | the same, `PanGesture::new()` (UIKit's 10 pt hysteresis) |
//! | release | onEnd: base + snapPoint(tx % size, velocityX, ±intervals), withSpring (Gentle 900/120/4) | `Spring` from rest |
//! | card tap | onTouchEnd (a touch the pan never took) → scrollToIndex: the nearest of three destinations, withSpring({ mass 0.25, damping 10, stiffness 100 }) | the same |
//! | activeIndex | useAnimatedReaction: abs(round((tx % size) / L)) % 12 | the same, each step |
//! | main colour | useDerivedValue(withTiming(primary, 500, linear)): per channel in gamma 2.2, from the last rounded rgba | [`Fade`] |
//!
//! Haptics (past RN, which plays none: the owner's haptic language): `haptic:selection` each
//! time the centred theme (activeIndex) changes, during the drag, the release's spring and a
//! tap's scrollToIndex, at most one per HAPTIC_GAP_MS. The ring has no end, so no limit haptic.
//!
//! No inputs.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, Phase, PanGesture};
use reanimated::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing, GENTLE};
use skia::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Matrix3, Matrix4, Paint, Renderer, Shader};

use crate::gfx;

/// constants.ts ThemeData: primary, secondary.
const THEMES: [(u32, u32); 12] = [
    (0xCB832E, 0x7B6746),
    (0xA37125, 0x756245),
    (0x43972A, 0x486A41),
    (0x48A067, 0x47725F),
    (0xCA3E9D, 0x7B5372),
    (0xCC5FA8, 0x7E5C72),
    (0x4733C9, 0x5E517B),
    (0xCA2B1D, 0x784348),
    (0x9271C9, 0x6B627A),
    (0x49A27B, 0x457068),
    (0x7B91A1, 0x6B6A72),
    (0x3273B3, 0x4B6175),
];
const N: usize = THEMES.len();
const DEFAULT_WHITE: u32 = 0xCBCBCD;
/// The demo's backdrop (the registry's), under the canvases.
const BACKDROP: u32 = 0xe0be95;
const MAX_ROTATE_Y: f64 = 30.0;
const PERSPECTIVE: f32 = 500.0;
/// scrollToIndex's spring.
const TAP_SPRING: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 0.25 };
const FADE_MS: f64 = 500.0;
/// `<Blur blur={30}>`, `<Blur blur={10}>`: σ in points.
const BLUR_MAIN: f32 = 30.0;
const BLUR_WHITE: f32 = 10.0;
const RADIUS: f32 = 15.0;
/// Header (8 floats) + 12 cards × 16.
const UNIFORM_FLOATS: usize = 8 + N * 16;
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-card line the strip goes before the haptics' card changes, pt.
const SWITCH: f64 = 6.0;

/// The demo's surface (no inputs).
pub fn surface() -> Box<dyn Surface> {
    Box::new(InfiniteCarousel {
        size: (0.0, 0.0),
        scale: 0.0,
        pan: PanGesture::new(),
        tx: Spring::at(0.0),
        started: false,
        context_x: 0.0,
        active: 0,
        fade: Fade::at(THEMES[0].0),
        down_card: None,
        cards: None,
        bg: Background::default(),
        gpu: None,
        uniforms: vec![0u8; UNIFORM_FLOATS * 4],
        now_ms: 0.0,
        felt: None,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    })
}

/// Reanimated's `withTiming` of a colour string: each channel timed in gamma-2.2 space
/// (toLinearSpace), clamped, back to gamma and rounded to 8 bits (rgbaArrayToRGBAColor); a new
/// timing starts from the last rounded colour.
struct Fade {
    from: [f64; 3],
    to: [f64; 3],
    t: Timing,
    /// The colour shown (sRGB, 8 bits).
    current: [u8; 3],
}

fn channels(hex: u32) -> [u8; 3] {
    [(hex >> 16) as u8, (hex >> 8) as u8, hex as u8]
}

impl Fade {
    fn at(hex: u32) -> Fade {
        let c = channels(hex);
        let l = c.map(|v| (v as f64 / 255.0).powf(2.2));
        Fade { from: l, to: l, t: Timing::at(1.0), current: c }
    }
    fn to(&mut self, hex: u32) {
        self.from = self.current.map(|v| (v as f64 / 255.0).powf(2.2));
        self.to = channels(hex).map(|v| (v as f64 / 255.0).powf(2.2));
        self.t.set(0.0);
        self.t.to(1.0, FADE_MS, Easing::Linear);
    }
    /// Steps to `now`; returns whether it still moves.
    fn step(&mut self, now: f64) -> bool {
        if !self.t.running {
            return false;
        }
        let moving = self.t.step(now);
        let t = self.t.value;
        for k in 0..3 {
            let v = (self.from[k] + (self.to[k] - self.from[k]) * t).clamp(0.0, 1.0);
            self.current[k] = (v.powf(1.0 / 2.2) * 255.0).round() as u8;
        }
        moving
    }
}

/// One card's frame in canvas points (Yoga's), its layer's centre at rest, and its cell in the
/// bake (pixels).
#[derive(Clone, Copy, Debug)]
struct CardBox {
    left: f32,
    top: f32,
    w: f32,
    h: f32,
    cell: (u32, u32),
}

struct Cards {
    scale: f32,
    size: (f32, f32),
    view: wgpu::TextureView,
    px: (u32, u32),
    boxes: [CardBox; N],
}

#[derive(Default)]
struct Background {
    key: Option<([u8; 3], (u32, u32))>,
    white_key: Option<(u32, u32)>,
    canvas: Canvas,
    renderer: Renderer,
    main_blur: GraphiteBlur,
    main_plan: Option<GraphitePlan>,
    white_blur: GraphiteBlur,
    white_plan: Option<GraphitePlan>,
    layer: Option<((u32, u32), wgpu::TextureView)>,
    /// The blurred images and their uv mappings.
    main: Option<(wgpu::TextureView, [f32; 4], [f32; 4])>,
    white: Option<(wgpu::TextureView, [f32; 4], [f32; 4])>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    compose: wgpu::RenderPipeline,
    compose_layout: wgpu::BindGroupLayout,
    compose_buffer: wgpu::Buffer,
    compose_bind: Option<(wgpu::TextureView, wgpu::TextureView, wgpu::BindGroup)>,
    cards: wgpu::RenderPipeline,
    cards_layout: wgpu::BindGroupLayout,
    cards_buffer: wgpu::Buffer,
    cards_bind: Option<wgpu::BindGroup>,
    sampler: wgpu::Sampler,
    empty: wgpu::TextureView,
}

struct InfiniteCarousel {
    size: (f32, f32),
    scale: f32,
    pan: PanGesture,
    /// The shared value translateX.
    tx: Spring,
    started: bool,
    context_x: f64,
    active: usize,
    fade: Fade,
    /// The card a touch went down on (its onTouchEnd's target).
    down_card: Option<usize>,
    cards: Option<Cards>,
    bg: Background,
    gpu: Option<Gpu>,
    uniforms: Vec<u8>,
    /// The latest time seen (a frame's or a pointer's), when the last selection haptic played,
    /// and the messages to post.
    now_ms: f64,
    /// The card (0 … N − 1, along the strip) the haptics last felt: it holds until the strip is
    /// SWITCH past the half-card line, so a finger hovering there does not flap.
    felt: Option<i64>,
    haptic_at: f64,
    posted: Vec<String>,
}

/// Yoga's YGRoundValueToPixelGrid at `scale`.
fn round_px(v: f64, scale: f64) -> f64 {
    let x = v * scale;
    let f = x - x.floor();
    let r = if f < 1e-4 {
        x.floor()
    } else if f > 1.0 - 1e-4 {
        x.ceil()
    } else {
        x.round()
    };
    r / scale
}

impl InfiniteCarousel {
    fn item(&self) -> f64 {
        self.size.0 as f64 / 4.8
    }
    fn list(&self) -> f64 {
        self.item() * N as f64
    }

    /// CarouselItem's derivedTranslate.
    fn shift(&self, i: usize) -> f64 {
        let size = self.list();
        let t = self.tx.value % size;
        let visible = (self.size.0 as f64 / self.item()).round();
        let half = (visible / 2.0 + 0.5).floor(); // Math.round(maxVisibleItems / 2)
        let passed = t.abs() > size / 2.0;
        if i as f64 <= half && passed {
            return t + size;
        }
        if i as f64 > N as f64 - half && !passed {
            return t - size;
        }
        t
    }

    fn progress(&self, i: usize) -> f64 {
        let l = self.item();
        let i = i as f64;
        interpolate(
            -self.shift(i as usize),
            &[(i - 2.0) * l, (i - 1.0) * l, i * l, (i + 1.0) * l, (i + 2.0) * l],
            &[-1.0, -1.5, 0.0, 1.5, 1.0],
            Extrapolation::Clamp,
        )
    }

    /// Card `i`'s layer transform: local points of its frame → canvas points.
    fn transform(&self, b: &CardBox, i: usize) -> Matrix3 {
        let p = self.progress(i);
        let rotate = interpolate(p, &[-1.0, 1.0], &[-MAX_ROTATE_Y, MAX_ROTATE_Y], Extrapolation::Clamp);
        let scale = (1.0 - p.abs() * 0.025) as f32;
        let row = (self.size.0 as f64 - self.item()) / 2.0;
        let x = b.left as f64 + row + self.shift(i);
        Matrix4::translate(x as f32, b.top, 0.0)
            .multiply(
                Matrix4::perspective(PERSPECTIVE)
                    .multiply(Matrix4::translate((-p * 8.0) as f32, 0.0, 0.0))
                    .multiply(Matrix4::scale(scale, scale, 1.0))
                    .multiply(Matrix4::rotate_y(rotate.to_radians() as f32))
                    .pivot(b.w / 2.0, b.h / 2.0),
            )
            .to_matrix3()
    }

    /// The topmost card in hit-testing order (later siblings first: zIndex is the layer's
    /// zPosition, which UIKit's hit-test ignores) holding (x, y).
    fn card_at(&self, x: f32, y: f32) -> Option<usize> {
        let cards = self.cards.as_ref()?;
        (0..N).rev().find(|&i| {
            let b = &cards.boxes[i];
            self.transform(b, i).invert().is_some_and(|inv| {
                let q = inv.map(x, y);
                q.x >= 0.0 && q.y >= 0.0 && q.x <= b.w && q.y <= b.h
            })
        })
    }

    /// Whether a touch at (x, y) reaches the GestureDetector's row: its band, or a card.
    fn claims(&self, x: f32, y: f32) -> bool {
        let Some(cards) = self.cards.as_ref() else { return false };
        let b = cards.boxes[0];
        (y >= b.top && y <= b.top + b.h) || self.card_at(x, y).is_some()
    }

    /// useAnimatedReaction on the active index.
    fn react(&mut self) {
        let l = self.item();
        if l <= 0.0 {
            return;
        }
        let scrolled = (self.tx.value % self.list()) / l;
        let index = ((scrolled + 0.5).floor().abs() as usize) % N;
        if index != self.active {
            self.active = index;
            self.fade.to(THEMES[index].0);
        }
        let n = N as f64;
        let s = (self.tx.value / l).rem_euclid(n);
        let felt = s.round().rem_euclid(n) as i64;
        match self.felt {
            None => self.felt = Some(felt),
            Some(c) => {
                // The distance to the felt card along the loop, in cards.
                let d = ((s - c as f64 + n / 2.0).rem_euclid(n) - n / 2.0).abs();
                if d >= 0.5 + SWITCH / l {
                    self.felt = Some(felt);
                    if self.now_ms - self.haptic_at >= HAPTIC_GAP_MS {
                        self.posted.push("haptic:selection".into());
                        self.haptic_at = self.now_ms;
                    }
                }
            }
        }
    }

    /// The release: snapPoint over ±intervals, a Gentle spring from rest.
    fn snap(&mut self, velocity: f64) {
        let l = self.item();
        let size = self.list();
        let fixed = self.tx.value % size;
        let base = self.tx.value - fixed;
        let point = fixed + 0.2 * velocity;
        let intervals = (0..N).map(|i| -((i + 1) as f64) * l).chain((0..N).map(|i| i as f64 * l));
        let mut best = (f64::MAX, 0.0);
        for p in intervals {
            let d = (point - p).abs();
            if d < best.0 {
                best = (d, p);
            }
        }
        let value = self.tx.value;
        self.tx.set(value);
        self.tx.to(base + best.1, 0.0, GENTLE);
    }

    /// scrollToIndex(index): the nearest of the three destinations.
    fn scroll_to(&mut self, index: usize) {
        let l = self.item();
        let size = self.list();
        let tx = self.tx.value;
        let base = tx - tx % size;
        let d0 = base - index as f64 * l;
        let mut best = (f64::MAX as f64, 0.0);
        for d in [d0, d0 + size, d0 - size] {
            let dist = (tx - d).abs();
            if dist < best.0 {
                best = (dist, d);
            }
        }
        self.tx.to(best.1, 0.0, TAP_SPRING);
    }

    /// The cards' frames (Yoga) and their bake, once per size and scale.
    fn bake(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let s = self.scale as f64;
        let (w, h) = (self.size.0 as f64, self.size.1 as f64);
        let l = w / 4.8;
        let cw = l * 1.2;
        let ch = cw / 0.7;
        let r = |v: f64| round_px(v, s);
        // The container centres the wrapper (ch tall) in the screen.
        let top_unr = (h - ch) / 2.0;
        let top = r(top_unr);
        let card_rel = r((l - cw) / 2.0);
        let mut boxes = [CardBox { left: 0.0, top: 0.0, w: 0.0, h: 0.0, cell: (0, 0) }; N];
        let ph = (((top_unr + ch) * s).round() - (top_unr * s).round()) as u32;
        let mut cell_x = 0u32;
        for (i, b) in boxes.iter_mut().enumerate() {
            let abs_l = i as f64 * l + (l - cw) / 2.0;
            let pw = (((abs_l + cw) * s).round() - (abs_l * s).round()) as u32;
            *b = CardBox {
                left: (r(i as f64 * l) + card_rel) as f32,
                top: top as f32,
                w: (pw as f64 / s) as f32,
                h: (ph as f64 / s) as f32,
                cell: (cell_x, 0),
            };
            cell_x += pw + 2;
        }
        let px = (cell_x, ph);
        let view = skia::render::sampled_target(device, "infinite cards", GRAPHITE_FORMAT, px.0, px.1);
        let mut c = Canvas::default();
        c.begin(self.scale);
        let cell = cw / 3.5;
        for (i, b) in boxes.iter().enumerate() {
            let (primary, secondary) = THEMES[i];
            let ox = b.cell.0 as f32 / self.scale;
            let abs_l = i as f64 * l + (l - cw) / 2.0;
            c.save();
            c.translate(ox, 0.0);
            c.clip_continuous_rrect(0.0, 0.0, b.w, b.h, RADIUS);
            let g = Shader::Linear {
                start: point(0.0, 0.0),
                end: point(b.w, 0.0),
                stops: stops(&[Color::hex(0x343f3d), Color::hex(0x242d2b)]),
            };
            c.draw_rect(0.0, 0.0, b.w, b.h, &Paint::shader(g));
            // listContainer: below the flex-2 spacer, (ch − 10) · 3/5 tall.
            let list_rel = (ch - 10.0) * 0.4;
            let line = (cw - 3.0 * cell) / 2.0;
            for k in 0..9 {
                let color = if k < 2 {
                    DEFAULT_WHITE
                } else if (k + 1) % 3 == 0 {
                    primary
                } else {
                    secondary
                };
                let (col, row) = ((k % 3) as f64, (k / 3) as f64);
                let (rx, ry) = (line + col * cell, row * cell);
                let x = r(rx) + r(2.5);
                let y = r(list_rel) + r(ry) + r(2.5);
                let ax = abs_l + rx + 2.5;
                let ay = top_unr + list_rel + ry + 2.5;
                let dw = ((ax + cell - 5.0) * s).round() - (ax * s).round();
                let dh = ((ay + cell - 5.0) * s).round() - (ay * s).round();
                let (dw, dh) = ((dw / s) as f32, (dh / s) as f32);
                let paint = Paint::fill(Color::view_hex(color));
                if (dw - dh).abs() < 1e-3 {
                    c.draw_circle(x as f32 + dw / 2.0, y as f32 + dh / 2.0, dw / 2.0, &paint);
                } else {
                    c.draw_continuous_rrect(x as f32, y as f32, dw, dh, dw.min(dh) / 2.0, &paint);
                }
            }
            c.restore();
        }
        let mut renderer = Renderer::default();
        renderer.draw(device, queue, encoder, &c, &view, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        self.cards = Some(Cards { scale: self.scale, size: self.size, view, px, boxes });
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.cards_bind = None;
        }
    }
}

/// The blurred image's uv of a layer pixel: uv = p · xy + zw (spiral's).
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

impl Background {
    /// A full-screen Rect of `stops`' sweep (P3), blurred by σ points: the image and mappings.
    #[allow(clippy::too_many_arguments)]
    fn blurred(
        &mut self,
        white: bool,
        colors: [Color; 3],
        sigma: f32,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Option<(wgpu::TextureView, [f32; 4], [f32; 4])> {
        let (pw, ph) = frame.pixels();
        if self.layer.as_ref().map(|l| l.0) != Some((pw, ph)) {
            self.layer = Some(((pw, ph), skia::render::sampled_target(device, "infinite layer", GRAPHITE_FORMAT, pw, ph)));
        }
        let layer = &self.layer.as_ref().unwrap().1;
        self.canvas.begin(frame.scale);
        let paint = Paint::shader(Shader::Sweep { center: point(frame.width / 2.0, frame.height / 2.0), stops: stops(&colors) });
        self.canvas.draw_rect(0.0, 0.0, frame.width, frame.height, &paint);
        self.renderer.p3 = true;
        self.renderer.draw(device, queue, encoder, &self.canvas, layer, GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        let bounds = [0, 0, pw as i32, ph as i32];
        let sigma = sigma * frame.scale;
        let (blur, plan) = if white { (&mut self.white_blur, &mut self.white_plan) } else { (&mut self.main_blur, &mut self.main_plan) };
        let plan = match plan {
            Some(p) => {
                if !p.update(bounds, bounds, sigma) {
                    return None;
                }
                p
            }
            None => {
                *plan = GraphitePlan::new(bounds, bounds, sigma);
                plan.as_mut()?
            }
        };
        let out = blur.run(device, queue, encoder, Placed { view: layer, origin: [0, 0], size: [pw, ph] }, plan);
        let low = low_mapping(plan, out.origin, out.size);
        Some((out.view.clone(), low, plan.output.map(|v| v as f32)))
    }
}

const COMPOSE_WGSL: &str = r#"
struct U {
    // device px, scale, srgb target
    canvas: vec4<f32>,
    // the main colour (encoded sRGB), 1 when there is a blur of each
    main: vec4<f32>,
    low1: vec4<f32>,
    out1: vec4<f32>,
    low2: vec4<f32>,
    out2: vec4<f32>,
    backdrop: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var blur1: texture_2d<f32>;
@group(0) @binding(2) var blur2: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        0.8225 * l.r + 0.1774 * l.g,
        0.0332 * l.r + 0.9669 * l.g,
        0.0171 * l.r + 0.0724 * l.g + 0.9108 * l.b));
}
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}
// Core Animation's colour match of a P3 canvas pixel: unpremultiplied, then premultiplied again.
fn shown(c: vec4<f32>) -> vec3<f32> {
    if (c.a <= 0.0) { return vec3<f32>(0.0); }
    return p3_to_srgb(c.rgb / c.a) * c.a;
}

@fragment fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    // Canvas 1: the Rect of the main colour at 0.75, then the blurred sweep's layer over it.
    var g1 = vec4<f32>(0.0);
    if (u.main.w > 0.5 && all(p >= u.out1.xy) && all(p <= u.out1.zw)) {
        g1 = q8(textureSampleLevel(blur1, smp, p * u.low1.xy + u.low1.zw, 0.0));
    }
    let m = q8(vec4<f32>(q8(vec4<f32>(srgb_to_p3(u.main.rgb), 1.0)).rgb * 0.75, 0.75));
    let c1 = q8(g1 + m * (1.0 - g1.a));
    // Canvas 2: the white sweep's blurred layer at 0.3.
    var g2 = vec4<f32>(0.0);
    if (u.canvas.w > 1.5 && all(p >= u.out2.xy) && all(p <= u.out2.zw)) {
        g2 = q8(textureSampleLevel(blur2, smp, p * u.low2.xy + u.low2.zw, 0.0));
    }
    let c2 = q8(g2 * 0.3);
    var c = u.backdrop.rgb;
    c = shown(c1) + c * (1.0 - c1.a);
    c = shown(c2) + c * (1.0 - c2.a);
    if (fract(u.canvas.w) > 0.25) { c = lin(c); }
    return vec4<f32>(c, 1.0);
}
"#;

const CARDS_WGSL: &str = r#"
struct Card { h0: vec4<f32>, h1: vec4<f32>, h2: vec4<f32>, cell: vec4<f32> };
struct U {
    // canvas size (points), scale, srgb
    a: vec4<f32>,
    // bake size (px)
    bake: vec4<f32>,
    cards: array<Card, 12>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct V { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) @interpolate(flat) id: u32 };

@vertex fn vs(@builtin(vertex_index) i: u32, @builtin(instance_index) id: u32) -> V {
    let c = u.cards[id];
    let f = vec3<f32>(f32(i & 1u) * c.cell.z, f32(i >> 1u) * c.cell.w, 1.0);
    let x = dot(c.h0.xyz, f);
    let y = dot(c.h1.xyz, f);
    let w = dot(c.h2.xyz, f);
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
    let c = u.cards[v.id];
    let s = u.a.z;
    let q = clamp(v.local * s, vec2<f32>(0.5), c.cell.zw * s - vec2<f32>(0.5)) + c.cell.xy;
    let base = textureSampleLevel(tex, smp, q / u.bake.xy, 0.0);
    if (u.a.w > 0.5 && base.a > 0.0) {
        return vec4<f32>(lin(base.rgb / base.a) * base.a, base.a);
    }
    return base;
}
"#;

fn put(buf: &mut [u8], at: usize, v: f32) {
    buf[at * 4..at * 4 + 4].copy_from_slice(&v.to_le_bytes());
}

fn tex_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
        count: None,
    }
}
fn uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
        count: None,
    }
}
fn sampler_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry { binding, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let compose_module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("infinite compose"), source: wgpu::ShaderSource::Wgsl(COMPOSE_WGSL.into()) });
    let compose_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("infinite compose"),
        entries: &[uniform_entry(0), tex_entry(1), tex_entry(2), sampler_entry(3)],
    });
    let compose = skia::render::fullscreen_pipeline(device, &compose_module, &compose_layout, "compose", format, None);
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("infinite cards"), source: wgpu::ShaderSource::Wgsl(CARDS_WGSL.into()) });
    let cards_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("infinite cards"),
        entries: &[uniform_entry(0), tex_entry(1), sampler_entry(2)],
    });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("infinite cards"), bind_group_layouts: &[Some(&cards_layout)], immediate_size: 0 });
    let cards = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("infinite cards"),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs"),
            targets: &[Some(wgpu::ColorTargetState { format, blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, ..Default::default() },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let buffer = |label, size: usize| device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size: size as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    Gpu {
        format,
        compose,
        compose_layout,
        compose_buffer: buffer("infinite compose", 112),
        compose_bind: None,
        cards,
        cards_layout,
        cards_buffer: buffer("infinite cards", UNIFORM_FLOATS * 4),
        cards_bind: None,
        sampler: skia::render::linear_sampler(device),
        empty: skia::render::sampled_target(device, "infinite empty", GRAPHITE_FORMAT, 1, 1),
    }
}

impl Surface for InfiniteCarousel {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let size = self.list();
        let offset = if size > 0.0 { -(self.tx.value % size) / self.item() + 0.0 } else { 0.0 };
        Some(format!("{{\"active\":{},\"offset\":{:.3},\"moving\":{},\"held\":{}}}", self.active, offset, self.tx.running, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        self.now_ms = self.now_ms.max(at_ms);
        let phase = gfx::phase(phase);
        let claim = phase == Phase::Down && self.claims(x, y);
        if claim {
            self.down_card = self.card_at(x, y);
        }
        match self.pan.event(id, phase, x, y, at_ms, claim) {
            Event::Begin { .. } => {
                // cancelAnimation(translateX); contextX = translateX.
                let v = self.tx.value;
                self.tx.set(v);
                self.context_x = v;
            }
            Event::Start(p) | Event::Update(p) => {
                // The pan took the touch: the card's onTouchEnd is cancelled.
                self.down_card = None;
                self.tx.set(self.context_x + p.translation_x as f64);
                self.react();
            }
            Event::End(p) => self.snap(p.velocity_x as f64),
            Event::Fail => {
                if phase == Phase::Up {
                    if let Some(i) = self.down_card {
                        self.scroll_to(i);
                    }
                }
                self.down_card = None;
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
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        if !self.started && frame.width > 0.0 {
            // translateX = −listOffset × 500.
            self.tx = Spring::at(-self.list() * 500.0);
            self.started = true;
        }
        let now = frame.now_ms;
        self.now_ms = self.now_ms.max(now);
        let mut moving = self.tx.step(now);
        self.react();
        moving |= self.fade.step(now);
        if self.cards.as_ref().map(|c| (c.scale, c.size)) != Some((frame.scale, self.size)) {
            self.bake(device, queue, encoder);
        }
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            self.gpu = Some(build(device, format));
        }

        // The background: each blur again only when its input changed.
        let px = frame.pixels();
        let key = (self.fade.current, px);
        if self.bg.white_key != Some(px) {
            let white = [Color::WHITE, Color::WHITE, Color::hex(0xd9d9d9)];
            self.bg.white = self.bg.blurred(true, white, BLUR_WHITE, frame, device, queue, encoder);
            self.bg.white_key = Some(px);
        }
        if self.bg.key != Some(key) {
            let [r, g, b] = self.fade.current;
            let main = Color::rgb8(r, g, b);
            let colors = [Color::hex(DEFAULT_WHITE), main, main];
            self.bg.main = self.bg.blurred(false, colors, BLUR_MAIN, frame, device, queue, encoder);
            self.bg.key = Some(key);
        }
        let gpu = self.gpu.as_mut().unwrap();
        let mut u = [0f32; 28];
        u[0] = px.0 as f32;
        u[1] = px.1 as f32;
        u[2] = frame.scale;
        let [r, g, b] = self.fade.current;
        u[4] = r as f32 / 255.0;
        u[5] = g as f32 / 255.0;
        u[6] = b as f32 / 255.0;
        let main = self.bg.main.clone();
        let white = self.bg.white.clone();
        if let Some((_, low, out)) = &main {
            u[7] = 1.0;
            u[8..12].copy_from_slice(low);
            u[12..16].copy_from_slice(out);
        }
        // canvas.w: 2 when the white blur exists, + 0.5 for an sRGB target.
        u[3] = if white.is_some() { 2.0 } else { 0.0 } + 0.5 * gfx::srgb_flag(format);
        if let Some((_, low, out)) = &white {
            u[16..20].copy_from_slice(low);
            u[20..24].copy_from_slice(out);
        }
        let [br, bg_, bb] = channels(BACKDROP);
        u[24] = br as f32 / 255.0;
        u[25] = bg_ as f32 / 255.0;
        u[26] = bb as f32 / 255.0;
        u[27] = 1.0;
        let bytes: Vec<u8> = u.iter().flat_map(|v| v.to_le_bytes()).collect();
        queue.write_buffer(&gpu.compose_buffer, 0, &bytes);
        let v1 = main.map(|m| m.0).unwrap_or_else(|| gpu.empty.clone());
        let v2 = white.map(|m| m.0).unwrap_or_else(|| gpu.empty.clone());
        if gpu.compose_bind.as_ref().is_none_or(|(a, b, _)| *a != v1 || *b != v2) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("infinite compose"),
                layout: &gpu.compose_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: gpu.compose_buffer.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&v1) },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&v2) },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.compose_bind = Some((v1, v2, group));
        }
        skia::render::fullscreen_pass(encoder, "infinite compose", target, &gpu.compose, &gpu.compose_bind.as_ref().unwrap().2);

        // The cards, by zIndex (stable: equal ones in the row's order).
        let cards = self.cards.as_ref().unwrap();
        let mut order: [usize; N] = std::array::from_fn(|i| i);
        let z: [i64; N] = std::array::from_fn(|i| (self.progress(i) * 100.0).abs().floor() as i64);
        order.sort_by_key(|&i| z[i]);
        let mats: Vec<[[f32; 4]; 3]> = order.iter().map(|&i| self.transform(&cards.boxes[i], i).rows()).collect();
        let uni = &mut self.uniforms;
        put(uni, 0, frame.width);
        put(uni, 1, frame.height);
        put(uni, 2, frame.scale);
        put(uni, 3, gfx::srgb_flag(format));
        put(uni, 4, cards.px.0 as f32);
        put(uni, 5, cards.px.1 as f32);
        for (slot, &i) in order.iter().enumerate() {
            let b = cards.boxes[i];
            let m = mats[slot];
            let base = 8 + slot * 16;
            for (r, row) in m.iter().enumerate() {
                for k in 0..3 {
                    put(uni, base + r * 4 + k, row[k]);
                }
            }
            put(uni, base + 12, b.cell.0 as f32);
            put(uni, base + 13, b.cell.1 as f32);
            put(uni, base + 14, b.w);
            put(uni, base + 15, b.h);
        }
        let gpu = self.gpu.as_mut().unwrap();
        queue.write_buffer(&gpu.cards_buffer, 0, &self.uniforms);
        let bind = gpu.cards_bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("infinite cards"),
                layout: &gpu.cards_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: gpu.cards_buffer.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&cards.view) },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            })
        });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("infinite cards"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.cards);
        pass.set_bind_group(0, &*bind, &[]);
        pass.draw(0..4, 0..N as u32);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn pointer(phase: PointerPhase, x: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y: 456.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    #[test]
    fn the_colour_fades_in_gamma_space() {
        let mut f = Fade::at(0xCB832E);
        f.to(0xA37125);
        f.step(0.0);
        assert_eq!(f.current, [0xCB, 0x83, 0x2E]);
        f.step(250.0);
        // Halfway in gamma 2.2: ((203^2.2 + 163^2.2) / 2)^(1/2.2) = 184.5.
        assert!((183..=185).contains(&f.current[0]), "{:?}", f.current);
        while f.step(600.0) {}
        assert_eq!(f.current, [0xA3, 0x71, 0x25]);
    }

    #[test]
    fn a_drag_snaps_to_the_next_theme_and_a_tap_scrolls_to_its_card() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "infinite-rest", [0, 0, 0]);
        assert!(!animating);
        // The centred card (105 × 150 at 157.5, 381): its gradient, a theme circle below.
        let body = rest.at(3 * 165, 3 * 400);
        assert!(body[0] < 70 && body[1] < 80, "{body:?}");
        assert!(rest.at(3 * 420 / 2, 3 * 100)[3] == 255);
        assert_eq!(s.agent("{}").unwrap(), "{\"active\":0,\"offset\":0.000,\"moving\":false,\"held\":false}");

        // Drag left by 100 pt (90 counted) at ~310 pt/s, then lift still: the lift keeps the last
        // move's velocity (UIKit hears no moves from a finger at rest), 90 + 0.2 × 310 > 1.5 L: two on.
        s.input(&pointer(PointerPhase::Down, 300.0, 0.0));
        let mut ms = 100.0;
        for k in 1..=20 {
            s.input(&pointer(PointerPhase::Move, 300.0 - 5.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 16.0;
        }
        ms += 200.0;
        s.input(&pointer(PointerPhase::Up, 200.0, ms));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (done, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&done, "infinite-next", [0, 0, 0]);
        assert!(!animating);
        assert_eq!(s.agent("{}").unwrap(), "{\"active\":2,\"offset\":2.000,\"moving\":false,\"held\":false}");
        // Two themes on: a selection as each comes to the centre.
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:selection"]);

        // A tap on the card left of centre (theme 1, around x 134) scrolls back to it.
        s.input(&pointer(PointerPhase::Down, 118.0, ms));
        s.input(&pointer(PointerPhase::Up, 118.0, ms + 80.0));
        while ms < 6000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"active\":1,\"offset\":1.000,\"moving\":false,\"held\":false}");
        assert_eq!(s.messages(), vec!["haptic:selection"]);
    }
}
