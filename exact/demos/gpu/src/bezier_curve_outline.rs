//! Bezier Curve Outline (src/animations/bezier-curve-outline/src: index.tsx,
//! components/bezier-outline.tsx, constants.ts, hooks/useAnimateThroughPath, components/
//! animated-square): a chess-board square on #efefef that, pressed, grows from 64 to 180 while
//! it travels along a cubic Bézier and blurs on the way; "Outline Mode" (the Contract's button)
//! crossfades to the curve itself on #111111, whose four control points can be dragged.
//!
//! The whole screen below the button and the full-screen blur is this surface:
//! - The outline (BezierOutline, opacity outlineModeProgress): #111111; the cubic first →
//!   (second, third) → fourth stroked rgba(255,255,255,0.4) width 1; the lines first–second and
//!   third–fourth rgba(255,255,255,0.1) width 1; per point a circle (r 12 for first and fourth,
//!   else 10) stroked width 2 (white 0.4 / 0.2) then filled #202020. InitialPoints: first (140,
//!   H − 200), second (W − 100, H − 300), third (W − 100, 300), fourth (200, 200).
//!   Touchable.Canvas: onBegin at touch-down, the first circle (in registration order) whose path
//!   holds the finger is set to it; onUpdate (from 10 pt) follows the finger. Touches reach it
//!   only while outlineModeProgress > 0 (the main content takes them at 0).
//! - The main content (opacity 1 − outlineModeProgress): #efefef; the square at
//!   (cx − size / 2, cy − size / 2), size = interpolate(progress, [0, 1], [64, 180]); (cx, cy)
//!   walks the contour sampled every 1 pt of length (getPosTan(i), i < length), progress × len
//!   into those points as useAnimateThroughPath reads them (extended one step past the end).
//!   The square (PressableScale): boxShadow 0 2 10 rgba(0,0,0,0.2), #a5a5a5, radius 20
//!   continuous; clipped: the 8 × 8 chessboard (#ECD9B9 / #AD8969, flex cells on the pixel grid),
//!   the icon container (#AD8969, opacity 1 − progress) with the pawn (48², marginBottom 4,
//!   contentFit cover), and the BlurView (tint default: .regular) over both.
//!
//! Motion audit:
//! - outlineModeProgress = withSpring(outlineMode) (Reanimated's default: 900, 120, 4).
//! - progress: start (progress === 0) cancels, sets 0 and withSpring(1, { duration 1500,
//!   dampingRatio 1 }); else cancel and withSpring(0, …) (no velocity: cancelled first).
//! - pressto on the square (the shared `pressto::Pressable`): withTiming(active, 250 ms,
//!   bezier(0.25, 0.1, 0.25, 1)), scale 1 → 0.96 about its centre; onPress (lifted inside)
//!   posts `haptic:selection` then toggles.
//! - The square's BlurView (zIndex 100: over the chessboard and the icon) intensity
//!   interpolate(progress, [0, 0.7, 1], [0, 40, 0]), expo-blur's animator fraction intensity /
//!   100 clamped to 0.01…1: skia::backdrop's `.regular` chain over the square's bounds (as
//!   pressed: its radius scaled with the press), clipped to the square's corners.
//! - The full-screen BlurView (zIndex 100: over the outline and the main content, under the
//!   button), tint systemUltraThinMaterialLight, intensity withTiming(held ? 65 : 0, 300 ms,
//!   linear) (the Contract's button sends `held`): skia::backdrop's chain over the whole screen
//!   at that fraction, never below 0.01 (a BlurView at intensity 0 still blurs at 1 %).
//! - Points are re-sampled whenever the curve changes while the square can be seen
//!   (outlineModeProgress < 1) and at each start.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate, Extrapolation, Spring, Timing, GENTLE};
use reanimated::Easing;
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::blur::{round_out, GRAPHITE_FORMAT};
use skia::{path_from_svg, point, Canvas, Color, Paint, Path, PathEvent, Renderer};

use crate::{gfx, shaders};
use shaders::bezier_curve_outline::{entry, module, Uniforms, BASE, BLURRED, GROUP_0, MASK, SMP, U, UPPER};

/// The square's sizes, radius, the pawn's box.
const SMALL: f64 = 64.0;
const BIG: f64 = 180.0;
const RADIUS: f32 = 20.0;
const ICON: f32 = 48.0;
/// assets/pawn.svg (viewBox 50): its four paths.
const PAWN: [&str; 4] = [
    "M25 11.961c-3.39 0-6.032 2.505-6.032 5.818 0 1.704.716 3.333 1.976 4.514-3.896 1.692-3.644 2.322-3.236 6.479h3.776c-1.66 8.227-9.02 6.338-8.862 15.47h24.755c.16-9.132-7.201-7.242-8.861-15.47h3.776c.408-4.157.66-4.787-3.237-6.48a6.189 6.189 0 0 0 1.976-4.513c0-3.313-2.64-5.818-6.031-5.818z",
    "M24.999 11.96c-.594 0-1.164.081-1.702.226 8.042 1.26 6.731 8.948 2.355 10.106 1.836.664 3.7 1.606 4.342 2.453.58.767.142 2.534.142 2.534l-12.555.204.128 1.02 5.694.021c1.711 8.098 14.126 6.628 13.968 15.718.158-9.09-7.118-7.642-8.829-15.74h3.752c.309-4.98 1.019-3.604-3.238-6.21a6.198 6.198 0 0 0 1.976-4.513c0-3.314-2.643-5.82-6.033-5.82z",
    "M23.738 12.775c-.301-.106-4.279 1.244-3.986 5.297.12 1.658 1.217 3.176 1.38 3.141l.493.559s-.946-1.995-.946-3.7c0-3.157 3.064-5.3 3.064-5.3zm-1.571 16.489c-1.968 8.064-8.231 6.47-8.75 14.133v-.016c1.76-6.292 7.394-5.506 9.136-14.063z",
    "M22.256 22.461c-1.397.672-3.813 1.37-3.942 2.788l1.761-.404c.144-.32.641-1.406 2.21-2.392z",
];

/// Where the composite's copy of the uniforms sits (the uniform offset alignment).
const COMPOSE_OFFSET: u64 = 256;

/// The demo's surface. Inputs: outlineMode, whether the button is held.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BezierOutline {
        size: (0.0, 0.0),
        outline: None,
        outline_progress: Spring::at(0.0),
        points: [(0.0, 0.0); 4],
        samples: Vec::with_capacity(2048),
        stale: true,
        progress: Spring::at(0.0),
        press: Pressable::new(),
        dragging: None,
        pan: PanGesture::new(),
        posted: Vec::new(),
        pawn: PAWN.iter().filter_map(|d| path_from_svg(d)).collect(),
        canvases: Default::default(),
        renderers: Default::default(),
        held: false,
        intensity: Timing::at(0.0),
        square_blur: BackdropBlur::default(),
        screen_blur: BackdropBlur::default(),
        gpu: None,
    })
}

struct BezierOutline {
    size: (f64, f64),
    outline: Option<bool>,
    outline_progress: Spring,
    /// first, second, third, fourth.
    points: [(f64, f64); 4],
    /// The contour sampled every point of its length (getPathPoints).
    samples: Vec<(f64, f64)>,
    stale: bool,
    progress: Spring,
    /// The square's PressableScale (the shared pressto machine).
    press: Pressable,
    /// The control point a finger moves.
    dragging: Option<usize>,
    pan: PanGesture,
    posted: Vec<String>,
    pawn: Vec<Path>,
    /// The outline, the content under the icon, the icon container, the square's mask.
    canvases: [Canvas; 4],
    renderers: [Renderer; 4],
    /// The button is held (blurIntensity 65, else 0).
    held: bool,
    /// The full-screen BlurView's intensity, withTiming(…, 300 ms, linear).
    intensity: Timing,
    square_blur: BackdropBlur,
    screen_blur: BackdropBlur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    content: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    /// outline, under, icon, mask, main, the screen under the full-screen BlurView.
    layers: [wgpu::TextureView; 6],
    content_bind: wgpu::BindGroup,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

/// A cubic's point at t (f64).
fn cubic(p: &[(f64, f64); 4], t: f64) -> (f64, f64) {
    let u = 1.0 - t;
    let (a, b, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
    (a * p[0].0 + b * p[1].0 + c * p[2].0 + d * p[3].0, a * p[0].1 + b * p[1].1 + c * p[2].1 + d * p[3].1)
}

/// getPathPoints: the contour's position at each whole length 0, 1, … < length (the cubic
/// measured along 1024 chords). Fills `out` (its capacity kept).
fn sample(points: &[(f64, f64); 4], out: &mut Vec<(f64, f64)>) {
    out.clear();
    const N: usize = 1024;
    let mut length = 0.0;
    let mut prev = points[0];
    let mut next_at = 0.0;
    for k in 1..=N {
        let q = cubic(points, k as f64 / N as f64);
        let seg = (q.0 - prev.0).hypot(q.1 - prev.1);
        while seg > 0.0 && next_at <= length + seg + 1e-6 {
            let f = (next_at - length) / seg;
            out.push((prev.0 + (q.0 - prev.0) * f, prev.1 + (q.1 - prev.1) * f));
            next_at += 1.0;
        }
        length += seg;
        prev = q;
    }
    // i < totalLength (the chords' sum, to a micro-point).
    let length = (length * 1e6).round() / 1e6;
    while !out.is_empty() && (out.len() - 1) as f64 >= length {
        out.pop();
    }
}

impl BezierOutline {
    /// cx, cy as useAnimateThroughPath derives them.
    fn center(&self) -> (f64, f64) {
        let pts = &self.samples;
        let len = pts.len();
        if len <= 1 {
            return (0.0, 0.0);
        }
        let t = self.progress.value * len as f64;
        let i = (t.floor().max(0.0) as usize).min(len - 2);
        let f = t - i as f64;
        (pts[i].0 + (pts[i + 1].0 - pts[i].0) * f, pts[i].1 + (pts[i + 1].1 - pts[i].1) * f)
    }

    fn square(&self) -> (f64, f64, f64) {
        let size = interpolate(self.progress.value, &[0.0, 1.0], &[SMALL, BIG], Extrapolation::Extend);
        let (cx, cy) = self.center();
        (cx - size / 2.0, cy - size / 2.0, size)
    }

    /// onPress, after the global handler's haptic.
    fn on_press(&mut self) {
        if self.progress.value == 0.0 {
            sample(&self.points, &mut self.samples);
            self.stale = false;
            self.progress.set(0.0);
            gfx::spring_to(&mut self.progress, 1.0, 1500.0, 1.0);
        } else {
            let v = self.progress.value;
            self.progress.set(v);
            gfx::spring_to(&mut self.progress, 0.0, 1500.0, 1.0);
        }
    }

    fn record(&mut self, s: f32) {
        let (x, y, size) = self.square();
        let (x, y, size) = (x as f32, y as f32, size as f32);
        let k = self.press.scale() as f32;
        let [outline, under, icon, mask] = &mut self.canvases;
        // The outline.
        outline.begin(s);
        outline.fill(Color::view_hex(0x111111));
        let p = self.points.map(|(x, y)| point(x as f32, y as f32));
        outline.draw_path_events([PathEvent::Begin { at: p[0] }, PathEvent::Cubic { from: p[0], ctrl1: p[1], ctrl2: p[2], to: p[3] }, PathEvent::End { last: p[3], first: p[0], close: false }], &Paint::stroke(Color::WHITE.alpha(0.4), 1.0));
        outline.draw_path_events(
            [
                PathEvent::Begin { at: p[0] },
                PathEvent::Line { from: p[0], to: p[1] },
                PathEvent::End { last: p[1], first: p[0], close: false },
                PathEvent::Begin { at: p[2] },
                PathEvent::Line { from: p[2], to: p[3] },
                PathEvent::End { last: p[3], first: p[2], close: false },
            ],
            &Paint::stroke(Color::WHITE.alpha(0.1), 1.0),
        );
        for (i, q) in p.iter().enumerate() {
            let ends = i == 0 || i == 3;
            let r = if ends { 12.0 } else { 10.0 };
            outline.draw_circle(q.x, q.y, r, &Paint::stroke(Color::WHITE.alpha(if ends { 0.4 } else { 0.2 }), 2.0));
            outline.draw_circle(q.x, q.y, r, &Paint::fill(Color::hex(0x202020)));
        }
        // The main content and the square, scaled by its press about its centre.
        let place = |c: &mut Canvas| {
            c.translate(x + size / 2.0, y + size / 2.0);
            c.scale(k, k);
            c.translate(-size / 2.0, -size / 2.0);
        };
        under.begin(s);
        under.fill(Color::view_hex(0xEFEFEF));
        under.save();
        place(under);
        // boxShadow 0 2 10: σ 5 (RN's iOS blur / 2) on RCTBoxShadow's circular rounded rect.
        under.draw_rrect_shadow(0.0, 2.0, size, size, RADIUS, 5.0, Color::BLACK.alpha(0.2));
        under.draw_continuous_rrect(0.0, 0.0, size, size, RADIUS, &Paint::fill(Color::view_hex(0xA5A5A5)));
        under.clip_continuous_rrect(0.0, 0.0, size, size, RADIUS);
        // The chessboard: flex cells, their edges on the pixel grid (Yoga's rounding).
        let snap = |v: f32| (v * s).round() / s;
        for row in 0..8 {
            for col in 0..8 {
                let (x0, x1) = (snap(size * col as f32 / 8.0), snap(size * (col + 1) as f32 / 8.0));
                let (y0, y1) = (snap(size * row as f32 / 8.0), snap(size * (row + 1) as f32 / 8.0));
                let color = if (row + col) % 2 == 0 { 0xECD9B9 } else { 0xAD8969 };
                under.draw_rect(x0, y0, x1 - x0, y1 - y0, &Paint::fill(Color::view_hex(color)));
            }
        }
        under.restore();
        // The icon container (its own layer: a group opacity).
        icon.begin(s);
        icon.save();
        place(icon);
        icon.clip_continuous_rrect(0.0, 0.0, size, size, RADIUS);
        icon.draw_rect(0.0, 0.0, size, size, &Paint::fill(Color::view_hex(0xAD8969)));
        icon.translate((size - ICON) / 2.0, (size - ICON - 4.0) / 2.0);
        icon.scale(ICON / 50.0, ICON / 50.0);
        if let [body, shade, light, glint] = &self.pawn[..] {
            icon.draw_path(body, &Paint::fill(Color::hex(0xE9E9E9)));
            icon.draw_path(body, &Paint::stroke(Color::hex(0x2A2A2A), 1.5).caps(skia::Cap::Butt, skia::Join::Round));
            icon.draw_path(shade, &Paint::fill(Color::BLACK).with_opacity(0.2));
            icon.draw_path(light, &Paint::fill(Color::WHITE));
            icon.draw_path(glint, &Paint::fill(Color::WHITE));
        }
        icon.restore();
        mask.begin(s);
        mask.save();
        place(mask);
        mask.draw_continuous_rrect(0.0, 0.0, size, size, RADIUS, &Paint::fill(Color::WHITE));
        mask.restore();
    }

    /// The square's blur fraction: expo-blur's intensity / 100, clamped to 0.01…1.
    fn blur_fraction(&self) -> f32 {
        expo_fraction(interpolate(self.progress.value, &[0.0, 0.7, 1.0], &[0.0, 40.0, 0.0], Extrapolation::Extend))
    }
}

impl Surface for BezierOutline {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let outline = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        if self.outline.is_some_and(|o| o != outline) {
            self.outline_progress.retarget(if outline { 1.0 } else { 0.0 }, GENTLE);
        }
        self.outline = Some(outline);
        // onPressIn / onPressOut: blurIntensity.set(65 / 0), its prop withTiming(…, 300 ms,
        // Easing.linear) from where it is.
        let held = inputs.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
        if held != self.held {
            self.held = held;
            self.intensity.to(if held { 65.0 } else { 0.0 }, 300.0, Easing::Linear);
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (x, y, size) = self.square();
        Some(format!(
            "{{\"outline\":{:.3},\"progress\":{:.3},\"square\":[{:.1},{:.1},{:.1}],\"first\":[{:.1},{:.1}]}}",
            self.outline_progress.value, self.progress.value, x, y, size, self.points[0].0, self.points[0].1
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        let (xf, yf) = (x as f64, y as f64);
        if self.outline_progress.value > 0.0 {
            // The outline's Touchable canvas.
            let at = |i: usize, p: &[(f64, f64); 4]| (xf - p[i].0).hypot(yf - p[i].1) <= if i == 0 || i == 3 { 12.0 } else { 10.0 };
            match self.pan.event(id, phase, x, y, at_ms, true) {
                Event::Begin { x, y } => {
                    self.dragging = (0..4).find(|&i| at(i, &self.points));
                    if let Some(i) = self.dragging {
                        self.points[i] = (x as f64, y as f64);
                        self.stale = true;
                    }
                }
                Event::Start(p) | Event::Update(p) => {
                    if let Some(i) = self.dragging {
                        self.points[i] = (p.x as f64, p.y as f64);
                        self.stale = true;
                    }
                }
                Event::End(_) | Event::Fail => self.dragging = None,
                _ => {}
            }
            return;
        }
        // The square (PressableScale), in its own bounds.
        let (sx, sy, size) = self.square();
        let inside = (sx..=sx + size).contains(&xf) && (sy..=sy + size).contains(&yf);
        if let Some(PressEvent::Press(press)) = self.press.pointer(id, phase, inside) {
            self.posted.extend(press.global_message().map(String::from));
            self.on_press();
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
        let (w, h) = (frame.width as f64, frame.height as f64);
        if self.size != (w, h) {
            self.size = (w, h);
            self.points = [(140.0, h - 200.0), (w - 100.0, h - 300.0), (w - 100.0, 300.0), (200.0, 200.0)];
            self.stale = true;
        }
        let now = frame.now_ms;
        let mut moving = self.outline_progress.step(now);
        moving |= self.progress.step(now);
        moving |= self.press.step(now);
        moving |= self.intensity.step(now);
        // The contour is walked again while the square can be seen.
        if self.stale && self.outline_progress.value != 1.0 {
            sample(&self.points, &mut self.samples);
            self.stale = false;
        }
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        self.record(s);
        let fraction = self.blur_fraction();
        let (sx, sy, size) = self.square();
        let gpu = self.gpu.as_mut().unwrap();
        for i in 0..4 {
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], &gpu.layers[i], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        }
        // The composite below is the full-screen blur's source: encoded, not linearised.
        let mut u = Uniforms { canvas: [pw as f32, ph as f32, s, 0.0], mix: [self.outline_progress.value as f32, 1.0 - self.progress.value as f32, 0.0, 0.0], low: [0.0; 4], out: [0.0; 4] };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "bezier content", &gpu.layers[4], &gpu.content, &gpu.content_bind);
        // The square's BlurView over its bounds as pressed (scale k about its centre).
        let k = self.press.scale() as f32;
        let (cx, cy, half) = ((sx + size / 2.0) as f32, (sy + size / 2.0) as f32, size as f32 * k / 2.0);
        let square = round_out([(cx - half) * s, (cy - half) * s, (cx + half) * s, (cy + half) * s]);
        // What the window shows of it (the backdrop captures nothing beyond the screen).
        let square = [square[0].max(0), square[1].max(0), square[2].min(pw as i32).max(square[0].max(0) + 1), square[3].min(ph as i32).max(square[1].max(0) + 1)];
        let out = self.square_blur.run(device, queue, encoder, &gpu.layers[4], square, [0.0, 0.0], &Material::Regular.chain().at(fraction), s * k);
        u.low = out.mapping[0];
        u.out = out.mapping[1];
        u.mix[2] = 1.0;
        let blurred = out.view.clone();
        // The composite reads its own copy (the content pass's is written above).
        queue.write_buffer(&gpu.uniforms, COMPOSE_OFFSET, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != blurred) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("bezier compose"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &gpu.uniforms, offset: COMPOSE_OFFSET, size: wgpu::BufferSize::new(Uniforms::SIZE as u64) }) },
                    wgpu::BindGroupEntry { binding: BASE.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[4]) },
                    wgpu::BindGroupEntry { binding: UPPER.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[0]) },
                    wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[3]) },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(&blurred) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((blurred, group));
        }
        skia::render::fullscreen_pass(encoder, "bezier compose", &gpu.layers[5], &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        // The full-screen BlurView over all of it, then the target.
        let screen = expo_fraction(self.intensity.value);
        self.screen_blur.run(device, queue, encoder, &gpu.layers[5], [0, 0, pw as i32, ph as i32], [0.0, 0.0], &Material::SystemUltraThinMaterialLight.chain().at(screen), s);
        self.screen_blur.draw(device, queue, encoder, target, format, [0.0, 0.0], [0, 0], [pw, ph]);
        moving || self.press.is_animating() || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let target = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    let layers = [target("bezier outline"), target("bezier under"), target("bezier icon"), target("bezier mask"), target("bezier main"), target("bezier screen")];
    // Two copies of the uniforms (256-aligned): the content pass's, the composite's.
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("bezier"), size: COMPOSE_OFFSET + Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = skia::render::linear_sampler(device);
    let empty = skia::render::sampled_target(device, "bezier empty", GRAPHITE_FORMAT, 1, 1);
    let content_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("bezier content"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &uniforms, offset: 0, size: wgpu::BufferSize::new(Uniforms::SIZE as u64) }) },
            wgpu::BindGroupEntry { binding: BASE.binding, resource: wgpu::BindingResource::TextureView(&layers[1]) },
            wgpu::BindGroupEntry { binding: UPPER.binding, resource: wgpu::BindingResource::TextureView(&layers[2]) },
            wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(&layers[3]) },
            wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(&empty) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu {
        format,
        generation,
        pixels,
        content: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::CONTENT, GRAPHITE_FORMAT, None),
        compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, GRAPHITE_FORMAT, None),
        layout,
        sampler,
        uniforms,
        layers,
        content_bind,
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_contour_is_sampled_every_point() {
        let line = [(0.0, 0.0), (10.0, 0.0), (20.0, 0.0), (30.0, 0.0)];
        let mut out = Vec::new();
        sample(&line, &mut out);
        // Length 30: i = 0…29.
        assert_eq!(out.len(), 30);
        assert!((out[29].0 - 29.0).abs() < 1e-6 && out[29].1 == 0.0);
    }

    #[test]
    fn pressing_sends_the_square_along_the_curve_and_outline_mode_shows_the_curve() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Bool(false)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("bezier-rest");
        assert!(!animating);
        // #efefef around; the square centred on the curve's start (140, 712), its icon #AD8969.
        assert_eq!(&rest.at(10, 10)[..3], &[0xEF, 0xEF, 0xEF]);
        let icon = rest.at(140 - 25, 712);
        assert!(icon[0] > 160 && icon[0] < 190 && icon[2] < 120, "{icon:?}");
        let tap = |s: &mut Box<dyn Surface>, x: f32, y: f32, at: f64| {
            for (phase, t) in [(PointerPhase::Down, at), (PointerPhase::Up, at + 50.0)] {
                s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: t });
            }
        };
        tap(&mut s, 140.0, 712.0, 0.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let mut ms = 50.0;
        while ms < 3500.0 {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if (ms - 450.0).abs() < 8.0 {
                img.save("bezier-moving");
            }
        }
        let state = s.agent("{}").unwrap();
        // At the end: 180 square centred near the curve's end (200, 200).
        assert!(state.contains("\"progress\":1.000"), "{state}");
        let (end, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        end.save("bezier-end");
        assert!(!animating);
        // The chessboard's light square at the big square's top-left cell.
        let cell = end.at(200 - 90 + 11, 200 - 90 + 11);
        assert!(cell[0] > 220 && cell[2] > 160, "{cell:?}");
        // Outline mode: the dark background, the control points drawn.
        s.bind(&[Value::Bool(true)], None).unwrap();
        while ms < 6000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (outline, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        outline.save("bezier-outline");
        // #111111 under the full-screen BlurView at intensity 0 (fraction 0.01).
        let flat = |c: u8, f: f32| (Material::SystemUltraThinMaterialLight.chain().at(f).flat([c as f32 / 255.0; 3])[0] * 255.0).round() as u8;
        assert_eq!(&outline.at(10, 10)[..3], &[flat(0x11, 0.01); 3]);
        // Holding the button: the BlurView's intensity runs to 65 in 300 ms, linearly.
        s.bind(&[Value::Bool(true), Value::Bool(true)], None).unwrap();
        let start = ms;
        while ms < start + 150.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        while ms < start + 400.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("bezier-held");
        assert!(!animating);
        assert_eq!(&held.at(10, 10)[..3], &[flat(0x11, 0.65); 3]);
        s.bind(&[Value::Bool(true), Value::Bool(false)], None).unwrap();
        // Drag the first point (140, 712) to (100, 600).
        let at = |s: &mut Box<dyn Surface>, phase, x, y, t| s.input(&InputEvent::Pointer { id: 2, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: t });
        at(&mut s, PointerPhase::Down, 141.0, 713.0, ms);
        at(&mut s, PointerPhase::Move, 120.0, 650.0, ms + 16.0);
        at(&mut s, PointerPhase::Move, 100.0, 600.0, ms + 32.0);
        at(&mut s, PointerPhase::Up, 100.0, 600.0, ms + 48.0);
        assert!(s.agent("{}").unwrap().contains("\"first\":[100.0,600.0]"), "{}", s.agent("{}").unwrap());
    }
}
