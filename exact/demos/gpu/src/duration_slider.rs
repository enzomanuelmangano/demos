//! Duration Slider (src/animations/duration-slider: src/index.tsx, components/circular-slider.tsx,
//! donut.tsx, picker.tsx, background-dots.tsx): a soft white dial (0.8 × the window wide) with a
//! red ring that follows a round knob dragged around it, and the value 1…12 in its middle.
//!
//! Geometry (circular-slider.tsx): size = 0.8 W, strokeWidth 70, internalOffset 20, initialAngle
//! π/2, c = size / 2, radius r = (size − 20 − 70) / 2.
//! - backgroundLayer (static): Group clip(circle r + 35) { layer Blur 30 { circle r + 35 #ebebeb } };
//!   Group layer(inner Shadow dx 0 dy 20 blur 10 #e9e9e9) { clip(circle r + 37) { layer Blur 10 {
//!   circle r + 37 #f7f7f7 } } }; BackgroundDots (twelve r 3 dots at r, #656565, the one at
//!   angle 2π − π/2 left out).
//! - Donut: the circle (c, r) trimmed 0…progress, stroked 70, RadialGradient (c, r + 70,
//!   #dc3f69 → #f2384d), under [rotate π/2, scale −1] about c: from the top, clockwise.
//! - The glow: clip(circle r + 35) { the donut under layer Blur 100; the donut }.
//! - Picker, clip(circle r + 35): { layer Blur 20 { the knob circle (r 35 at angle θ on r, the
//!   same gradient) }; the knob; the white r 25 circle with an inner Shadow (dx 0, dy 20,
//!   blur 10, #d4d4d4) }.
//! - innerDiscLayer (static): Group opacity 0.5 { layer Blur 20 { disc r − 35 #222222 }; the disc };
//!   disc r − 35 white.
//! - Text: String(value), #111, SF-Pro-Rounded-Bold 100 (Skia's own text), x = c − measureText.
//!   width / 2 − 2, y = c + 100 / 3.
//!
//! Every Blur, Shadow and BlurMask-replacement is a Graphite blur (skia::blur::GraphitePlan).
//! RN Skia's inner shadow is colour · blur(complement of the saturated alpha, offset) · alpha:
//! the blur of the complement is 1 − the blur of the shape.
//!
//! Motion audit: no animation. The Touchable canvas's Pan: onBegin at touch-down on the knob
//! (its circle path contains the point) sets translate = the finger; onUpdate (from 10 pt of
//! travel) follows it; progress = (atan2(y − c, x − c) + π/2) mod 2π / 2π; value =
//! min(round(progress · 12) + 1, 12); each change posts `haptic:selection`
//! (Haptics.selectionAsync), none at mount.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Font, Paint, PathEvent, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::duration_slider::{entry, module, Uniforms, GROUP_0, SMP, T0, T1, T2, T3, T4, T5, T6, T7, T8, U};

const STROKE: f32 = 70.0;
const INTERNAL_OFFSET: f32 = 20.0;
const MIN_VAL: f64 = 1.0;
const MAX_VAL: f64 = 12.0;
const FONT_SIZE: f32 = 100.0;
const VALUES: [&str; 12] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");

/// The demo's surface (the canvas is size × size).
pub fn surface() -> Box<dyn Surface> {
    Box::new(slider())
}

fn slider() -> DurationSlider {
    DurationSlider {
        size: 0.0,
        translate: None,
        pan: PanGesture::new(),
        dragging: false,
        value: None,
        posted: Vec::new(),
        font: Font::new(SF_ROUNDED_BOLD, FONT_SIZE),
        canvases: Default::default(),
        renderers: Default::default(),
        blurs: Default::default(),
        plans: [GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(), GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(), GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap()],
        paints: None,
        gpu: None,
    }
}

struct DurationSlider {
    size: f32,
    /// translateX, translateY (None: the initial (c, 0)).
    translate: Option<(f64, f64)>,
    pan: PanGesture,
    /// The knob holds the finger.
    dragging: bool,
    value: Option<usize>,
    posted: Vec<String>,
    font: Option<Font>,
    /// The donut, the knob's glow source, the white knob, the value.
    canvases: [Canvas; 4],
    renderers: [Renderer; 4],
    blurs: [GraphiteBlur; 3],
    plans: [GraphitePlan; 3],
    /// The donut's stroke and the knob's fill (the gradient), made when the size is known.
    paints: Option<(Paint, Paint)>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    saturate: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    empty: wgpu::TextureView,
    background: wgpu::TextureView,
    disc: wgpu::TextureView,
    /// The donut, the picker, the knob, its saturated alpha, the value.
    layers: [wgpu::TextureView; 5],
    saturate_bind: wgpu::BindGroup,
    /// The composite's bind group and the three blurred views it reads.
    bind: Option<([wgpu::TextureView; 3], wgpu::BindGroup)>,
}

struct Geometry {
    c: f32,
    r: f32,
}

fn geometry(size: f32) -> Geometry {
    Geometry { c: size / 2.0, r: (size - INTERNAL_OFFSET - STROKE) / 2.0 }
}

/// The donut's and the knob's gradient.
fn gradient(g: &Geometry) -> Shader {
    Shader::Radial { center: point(g.c, g.c), radius: g.r + STROKE, stops: stops(&[Color::hex(0xDC3F69), Color::hex(0xF2384D)]) }
}

/// A circle's bounds in device pixels, rounded out (a clip's or a layer's device bounds).
fn circle_bounds(cx: f32, cy: f32, r: f32, s: f32) -> IRect {
    round_out([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s])
}

/// The arc from the top, clockwise by `sweep` radians, as cubics (≤ 90° each): the trimmed
/// circle under the donut's rotate(π/2) · scale(−1). No allocation.
fn arc_events(cx: f32, cy: f32, r: f32, sweep: f32, out: &mut [PathEvent; 6]) -> usize {
    let start = -std::f32::consts::FRAC_PI_2;
    let pieces = ((sweep / std::f32::consts::FRAC_PI_2).ceil() as usize).clamp(1, 4);
    let step = sweep / pieces as f32;
    let k = 4.0 / 3.0 * (step / 4.0).tan();
    let at = |a: f32| point(cx + r * a.cos(), cy + r * a.sin());
    let first = at(start);
    out[0] = PathEvent::Begin { at: first };
    let mut from = first;
    for i in 0..pieces {
        let (a0, a1) = (start + step * i as f32, start + step * (i + 1) as f32);
        let to = at(a1);
        let ctrl1 = point(from.x - k * r * a0.sin(), from.y + k * r * a0.cos());
        let ctrl2 = point(to.x + k * r * a1.sin(), to.y - k * r * a1.cos());
        out[1 + i] = PathEvent::Cubic { from, ctrl1, ctrl2, to };
        from = to;
    }
    out[1 + pieces] = PathEvent::End { last: from, first, close: false };
    pieces + 2
}

impl DurationSlider {
    fn translate(&self) -> (f64, f64) {
        self.translate.unwrap_or((self.size as f64 / 2.0, 0.0))
    }

    /// The progress derived value.
    fn progress(&self) -> f64 {
        let c = self.size as f64 / 2.0;
        let (x, y) = self.translate();
        let mut theta = (y - c).atan2(x - c) + std::f64::consts::FRAC_PI_2;
        if theta < 0.0 {
            theta += std::f64::consts::TAU;
        }
        theta / std::f64::consts::TAU
    }

    /// The knob's centre (picker.tsx: theta normalised, on the radius).
    fn knob(&self) -> (f32, f32) {
        let g = geometry(self.size);
        let (x, y) = self.translate();
        let c = g.c as f64;
        let theta = ((y - c).atan2(x - c) + std::f64::consts::TAU) % std::f64::consts::TAU;
        ((g.r as f64 * theta.cos() + c) as f32, (g.r as f64 * theta.sin() + c) as f32)
    }

    /// animatedValue: an index into VALUES.
    fn value(&self) -> usize {
        ((self.progress() * MAX_VAL).round() + MIN_VAL).min(MAX_VAL) as usize - 1
    }

    fn set(&mut self, x: f32, y: f32) {
        self.translate = Some((x as f64, y as f64));
        let v = self.value();
        if self.value.is_some_and(|old| old != v) {
            self.posted.push("haptic:selection".into());
        }
        self.value = Some(v);
    }
}

impl Surface for DurationSlider {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"value\":{},\"progress\":{:.4},\"dragging\":{}}}", self.value() + 1, self.progress(), self.dragging))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size <= 0.0 {
            return;
        }
        let (kx, ky) = self.knob();
        let on_knob = (x - kx).hypot(y - ky) <= STROKE / 2.0;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, true) {
            Event::Begin { x, y } if on_knob => {
                self.dragging = true;
                self.set(x, y);
            }
            Event::Start(p) | Event::Update(p) if self.dragging => self.set(p.x, p.y),
            Event::End(_) | Event::Fail => self.dragging = false,
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
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        if self.size != frame.width {
            self.size = frame.width;
            self.translate = None;
            self.value = Some(self.value());
            let shader = gradient(&geometry(self.size));
            self.paints = Some((Paint::shader(shader.clone()).stroked(STROKE), Paint::shader(shader)));
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, queue, encoder, format, frame.shader_generation, (pw, ph), self.size, s));
            self.gpu.as_mut().unwrap().bind = None;
        }
        let g = geometry(self.size);
        let (kx, ky) = self.knob();
        let sweep = (self.progress() * std::f64::consts::TAU) as f32;
        let value = VALUES[self.value()];
        let mut arc = [PathEvent::End { last: point(0.0, 0.0), first: point(0.0, 0.0), close: false }; 6];
        let n = if sweep > 0.0 { arc_events(g.c, g.c, g.r, sweep, &mut arc) } else { 0 };
        let (donut_paint, knob_paint) = self.paints.as_ref().unwrap();
        let [donut, picker, knob, text] = &mut self.canvases;
        donut.begin(s);
        if n > 0 {
            donut.draw_path_events(arc[..n].iter().copied(), donut_paint);
        }
        picker.begin(s);
        picker.draw_circle(kx, ky, STROKE / 2.0, knob_paint);
        knob.begin(s);
        knob.draw_circle(kx, ky, STROKE / 2.0 - 10.0, &Paint::fill(Color::WHITE));
        text.begin(s);
        if let Some(font) = self.font.as_ref() {
            let x = g.c - font.measure_text(value).width / 2.0 - 2.0;
            text.draw_text(value, x, g.c + FONT_SIZE / 3.0, font, &Paint::fill(Color::hex(0x111111)));
        }
        let gpu = self.gpu.as_mut().unwrap();
        for i in 0..4 {
            let view = &gpu.layers[if i == 3 { 4 } else { i }];
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], view, GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        }
        skia::render::fullscreen_pass(encoder, "duration slider saturate", &gpu.layers[3], &gpu.saturate, &gpu.saturate_bind);
        // The three blurs: the donut's glow (σ 100) and the knob's (σ 20) on layers the size of
        // the clip, the knob's inner shadow (σ 10) on the white circle's bounds moved down 20.
        let clip = circle_bounds(g.c, g.c, g.r + STROKE / 2.0, s);
        let dy = (20.0 * s).round() as i32;
        let white = circle_bounds(kx, ky, STROKE / 2.0 - 10.0, s);
        let shifted = [white[0], white[1] + dy, white[2], white[3] + dy];
        let jobs: [(IRect, IRect, f32, usize, [i32; 2]); 3] = [(clip, clip, 100.0 * s, 0, [0, 0]), (clip, clip, 20.0 * s, 1, [0, 0]), (shifted, clip, 10.0 * s, 3, [0, dy])];
        let mut u = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            clip: [g.c * s, g.c * s, (g.r + STROKE / 2.0) * s, 0.0],
            low0: [0.0; 4],
            out0: [0.0; 4],
            low1: [0.0; 4],
            out1: [0.0; 4],
            low2: [0.0; 4],
            out2: [0.0; 4],
            extra: [0.0; 4],
        };
        let mut views: [wgpu::TextureView; 3] = [gpu.empty.clone(), gpu.empty.clone(), gpu.empty.clone()];
        for (k, (layer, desired, sigma, source, origin)) in jobs.into_iter().enumerate() {
            if !self.plans[k].update(layer, desired, sigma) {
                continue;
            }
            let placed = Placed { view: &gpu.layers[source], origin, size: [pw, ph] };
            let out = self.blurs[k].run(device, queue, encoder, placed, &self.plans[k]);
            let low = low_mapping(&self.plans[k], out.origin, out.size);
            let output = self.plans[k].output.map(|v| v as f32);
            match k {
                0 => (u.low0, u.out0) = (low, output),
                1 => (u.low1, u.out1) = (low, output),
                _ => (u.low2, u.out2) = (low, output),
            }
            views[k] = out.view.clone();
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != views) {
            let group = bind_group(device, &gpu.layout, &gpu.uniforms, &gpu.sampler, [&views[0], &views[1], &views[2], &gpu.background, &gpu.layers[0], &gpu.layers[1], &gpu.layers[2], &gpu.disc, &gpu.layers[4]]);
            gpu.bind = Some((views, group));
        }
        skia::render::fullscreen_pass(encoder, "duration slider", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        self.dragging
    }
}

/// uv = to_low(p) / size − origin / size, as one scale and offset.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn bind_group(device: &wgpu::Device, layout: &wgpu::BindGroupLayout, uniforms: &wgpu::Buffer, sampler: &wgpu::Sampler, t: [&wgpu::TextureView; 9]) -> wgpu::BindGroup {
    let slots = [T0.binding, T1.binding, T2.binding, T3.binding, T4.binding, T5.binding, T6.binding, T7.binding, T8.binding];
    let mut entries: Vec<wgpu::BindGroupEntry> = slots.iter().zip(t).map(|(&binding, view)| wgpu::BindGroupEntry { binding, resource: wgpu::BindingResource::TextureView(view) }).collect();
    entries.push(wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() });
    entries.push(wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(sampler) });
    device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("duration slider"), layout, entries: &entries })
}

/// The pipelines, the per-frame layers, and the two static layers (drawn here, once).
#[allow(clippy::too_many_arguments)]
fn build(device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32), size: f32, s: f32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = |fs: &str, f| skia::render::fullscreen_pipeline(device, &shader, &layout, fs, f, None);
    let sampler = skia::render::linear_sampler(device);
    let target = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    let new_uniforms = || device.create_buffer(&wgpu::BufferDescriptor { label: Some("duration slider"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let empty = skia::render::sampled_target(device, "duration slider empty", GRAPHITE_FORMAT, 1, 1);
    let g = geometry(size);
    let canvas_rect = [0, 0, pixels.0 as i32, pixels.1 as i32];
    let base = Uniforms {
        canvas: [pixels.0 as f32, pixels.1 as f32, s, 0.0],
        clip: [g.c * s, g.c * s, (g.r + STROKE / 2.0) * s, 0.0],
        low0: [0.0; 4],
        out0: [0.0; 4],
        low1: [0.0; 4],
        out1: [0.0; 4],
        low2: [0.0; 4],
        out2: [0.0; 4],
        extra: [(g.r + STROKE / 2.0 + 2.0) * s, 20.0 * s, 0.0, 0.0],
    };
    // A shape drawn alone into a layer.
    let draw = |encoder: &mut wgpu::CommandEncoder, label, f: &dyn Fn(&mut Canvas)| {
        let mut canvas = Canvas::default();
        canvas.begin(s);
        f(&mut canvas);
        let view = target(label);
        Renderer::default().draw(device, queue, encoder, &canvas, &view, GRAPHITE_FORMAT, pixels.0, pixels.1, wgpu::Color::TRANSPARENT);
        view
    };
    let outer = g.r + STROKE / 2.0;
    let rim = outer + 2.0;
    let disc_r = g.r - STROKE / 2.0;
    let disc_layer = draw(encoder, "duration slider disc", &|c| c.draw_circle(g.c, g.c, outer, &Paint::fill(Color::hex(0xEBEBEB))));
    let rim_layer = draw(encoder, "duration slider rim", &|c| c.draw_circle(g.c, g.c, rim, &Paint::fill(Color::hex(0xF7F7F7))));
    let dots = draw(encoder, "duration slider dots", &|c| {
        let initial = std::f64::consts::FRAC_PI_2;
        for i in 0..12 {
            let angle = (i as f64 * std::f64::consts::PI) / 6.0;
            if angle == 2.0 * std::f64::consts::PI - initial {
                continue;
            }
            let (x, y) = (g.c as f64 + g.r as f64 * angle.cos(), g.c as f64 + g.r as f64 * angle.sin());
            c.draw_circle(x as f32, y as f32, 3.0, &Paint::fill(Color::hex(0x656565)));
        }
    });
    let dark = draw(encoder, "duration slider dark disc", &|c| c.draw_circle(g.c, g.c, disc_r, &Paint::fill(Color::hex(0x222222))));
    let white = draw(encoder, "duration slider white disc", &|c| c.draw_circle(g.c, g.c, disc_r, &Paint::fill(Color::WHITE)));
    // One Graphite blur of `source` (texel 0 at `origin`), its mapping into `u`'s slot `k`.
    let blur = |blur: &mut GraphiteBlur, encoder: &mut wgpu::CommandEncoder, source: &wgpu::TextureView, origin: [i32; 2], layer: IRect, desired: IRect, sigma: f32, u: &mut Uniforms, k: usize| -> wgpu::TextureView {
        let Some(plan) = GraphitePlan::new(layer, desired, sigma) else { return empty.clone() };
        let out = blur.run(device, queue, encoder, Placed { view: source, origin, size: [pixels.0, pixels.1] }, &plan);
        let (low, output) = (low_mapping(&plan, out.origin, out.size), plan.output.map(|v| v as f32));
        match k {
            0 => (u.low0, u.out0) = (low, output),
            1 => (u.low1, u.out1) = (low, output),
            _ => (u.low2, u.out2) = (low, output),
        }
        out.view.clone()
    };
    let pass = |encoder: &mut wgpu::CommandEncoder, fs: &str, out: &wgpu::TextureView, u: &Uniforms, t: [&wgpu::TextureView; 9]| {
        let buffer = new_uniforms();
        queue.write_buffer(&buffer, 0, &u.bytes());
        let group = bind_group(device, &layout, &buffer, &sampler, t);
        skia::render::fullscreen_pass(encoder, "duration slider static", out, &pipeline(fs, GRAPHITE_FORMAT), &group);
    };
    let mut blurs: [GraphiteBlur; 3] = Default::default();
    let [ba, bb, bc] = &mut blurs;
    // backgroundLayer.
    let mut u = base;
    let disc_clip = circle_bounds(g.c, g.c, outer, s);
    let rim_clip = circle_bounds(g.c, g.c, rim, s);
    let a = blur(ba, encoder, &disc_layer, [0, 0], disc_clip, disc_clip, 30.0 * s, &mut u, 0);
    let x = blur(bb, encoder, &rim_layer, [0, 0], rim_clip, rim_clip, 10.0 * s, &mut u, 1);
    let rim_sat = target("duration slider rim alpha");
    pass(encoder, entry::RIM_SATURATE, &rim_sat, &u, [&empty, &x, &empty, &empty, &empty, &empty, &empty, &empty, &empty]);
    let dy = (20.0 * s).round() as i32;
    let shifted = [rim_clip[0], rim_clip[1] + dy, rim_clip[2], rim_clip[3] + dy];
    let xs = blur(bc, encoder, &rim_sat, [0, dy], shifted, canvas_rect, 10.0 * s, &mut u, 2);
    let background = target("duration slider background");
    pass(encoder, entry::BACKGROUND, &background, &u, [&a, &x, &xs, &dots, &empty, &empty, &empty, &empty, &empty]);
    // innerDiscLayer.
    let mut u = base;
    let mut disc_blur = GraphiteBlur::default();
    let d = blur(&mut disc_blur, encoder, &dark, [0, 0], canvas_rect, canvas_rect, 20.0 * s, &mut u, 0);
    let disc = target("duration slider inner disc");
    pass(encoder, entry::DISC, &disc, &u, [&d, &empty, &empty, &dark, &white, &empty, &empty, &empty, &empty]);
    let layers = [target("duration slider donut"), target("duration slider picker"), target("duration slider knob"), target("duration slider knob alpha"), target("duration slider value")];
    let uniforms = new_uniforms();
    queue.write_buffer(&uniforms, 0, &base.bytes());
    let saturate_bind = bind_group(device, &layout, &uniforms, &sampler, [&empty, &empty, &empty, &layers[2], &empty, &empty, &empty, &empty, &empty]);
    Gpu {
        format,
        generation,
        pixels,
        compose: pipeline(entry::COMPOSE, format),
        saturate: pipeline(entry::SATURATE, GRAPHITE_FORMAT),
        layout,
        sampler,
        uniforms,
        empty,
        background,
        disc,
        layers,
        saturate_bind,
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_top_dot_is_left_out() {
        // 9π/6 is 2π − π/2 in f64, so the twelfth dot (at the top) is moved off the canvas.
        assert_eq!((9.0 * std::f64::consts::PI) / 6.0, 2.0 * std::f64::consts::PI - std::f64::consts::FRAC_PI_2);
    }

    #[test]
    fn values_follow_the_angle() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        assert_eq!(s.value(), 0);
        s.value = Some(0);
        // A quarter turn clockwise (the right): round(0.25 · 12) + 1 = 4.
        s.set(336.0, 168.0);
        assert_eq!(s.value() + 1, 4);
        assert_eq!(s.posted, vec!["haptic:selection".to_string()]);
        // Just before the top again: min(12 + 1, 12) = 12.
        s.set(167.0, 0.0);
        assert_eq!(s.value() + 1, 12);
    }

    #[test]
    fn dragging_the_knob_fills_the_ring() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 336.0, height: 336.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("duration-slider-rest");
        // The knob at the top (168, 45): its red ring (25…35 from its centre) at y = 15.
        let knob = rest.at(2 * 168, 2 * 15);
        assert!(knob[0] > 200 && knob[1] < 90, "{knob:?}");
        // The dial's light face at the right of the ring, near-white.
        let face = rest.at(2 * 300, 2 * 168);
        assert!(face[0] > 200 && face[1] > 200 && face[3] == 255, "{face:?}");
        let finger = |s: &mut Box<dyn Surface>, phase, x, y, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 168.0, 45.0, 0.0);
        let mut y = 45.0;
        let mut x = 168.0;
        for i in 0..20 {
            let a = -std::f32::consts::FRAC_PI_2 + (i as f32 + 1.0) * 0.08;
            x = 168.0 + 123.0 * a.cos();
            y = 168.0 + 123.0 * a.sin();
            finger(&mut s, PointerPhase::Move, x, y, 16.0 * (i as f64 + 1.0));
        }
        let (dragged, animating) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        dragged.save("duration-slider-dragged");
        assert!(animating);
        // 1.6 rad of 2π: round(0.2546 · 12) + 1 = 4.
        assert!(s.agent("{}").unwrap().contains("\"value\":4"), "{}", s.agent("{}").unwrap());
        // The ring is red where it was light: at 45° clockwise from the top, on the radius.
        let a = -std::f32::consts::FRAC_PI_4;
        let ring = dragged.at((2.0 * (168.0 + 123.0 * a.cos())) as u32, (2.0 * (168.0 + 123.0 * a.sin())) as u32);
        assert!(ring[0] > 200 && ring[1] < 90, "{ring:?}");
        finger(&mut s, PointerPhase::Up, x, y, 400.0);
        assert!(!s.agent("{}").unwrap().contains("\"dragging\":true"));
    }
}
