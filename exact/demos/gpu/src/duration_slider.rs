//! Duration Slider: a soft white dial with a red ring that follows a round knob dragged around
//! it. The value, 1 to 12, sits in the middle.
//!
//! - The ring fills clockwise from the top. The knob sits at the ring's end and follows the finger.
//!   A finger within 24 pt of the centre moves nothing, since its angle there is noise.
//! - Past a stop the ring stays clamped: full at 12, empty at 1. It does not wrap. The knob gives
//!   a little (a rubber band) and springs back on release. A finger that circles past a stop
//!   re-engages the knob as it crosses back over.
//! - On release the knob springs to the nearest value's mark, carrying the finger's angular speed.
//! - Haptics: a selection on each value change, and a limit haptic when the ring reaches a stop.
//! - The figures are proportional and centred by their ink, so a lone "1" sits centred.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::spring::{Config, Spring};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Font, Paint, PathEvent, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::duration_slider::{entry, module, Uniforms, GROUP_0, SMP, T0, T1, T2, T3, T4, T5, T6, T7, T8, U};

/// Ring width, pt.
const STROKE: f32 = 70.0;
/// Inset of the ring from the dial's edge, pt.
const INTERNAL_OFFSET: f32 = 20.0;
const MIN_VAL: f64 = 1.0;
const MAX_VAL: f64 = 12.0;
/// Largest figure size, pt.
const FONT_SIZE: f32 = 100.0;
const VALUES: [&str; 12] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
/// SF Pro Rounded Bold, digits only.
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");
/// Each digit's advance and ink left and right, in font units (2048 per em).
const DIGIT_INK: [(f32, f32, f32); 10] = [
    (1343.0, 83.0, 1260.0),
    (983.0, 59.0, 761.0),
    (1235.0, 100.0, 1166.0),
    (1290.0, 103.0, 1200.0),
    (1326.0, 70.0, 1283.0),
    (1280.0, 131.0, 1214.0),
    (1317.0, 82.0, 1240.0),
    (1172.0, 52.0, 1104.0),
    (1336.0, 83.0, 1253.0),
    (1321.0, 79.0, 1237.0),
];
/// The cap height (the flat-topped figures' height), font units.
const CAP_HEIGHT: f32 = 1443.0;
const UNITS_PER_EM: f32 = 2048.0;

/// A value's ink span, left and right of its pen start, at `size` points. No kerning.
fn ink_span(value: &str, size: f32) -> (f32, f32) {
    let (mut pen, mut left, mut right) = (0.0f32, f32::MAX, f32::MIN);
    for ch in value.chars() {
        let (adv, l, r) = DIGIT_INK[ch.to_digit(10).unwrap_or(0) as usize];
        left = left.min(pen + l);
        right = right.max(pen + r);
        pen += adv;
    }
    let k = size / UNITS_PER_EM;
    (left * k, right * k)
}
/// A finger nearer the centre than this (pt) moves nothing: its angle is noise there.
const DEAD_ZONE: f64 = 24.0;
/// How far past either stop (turns) the unwrapped finger is kept.
const SLACK: f64 = 0.5;
/// Rubber band past a stop, in turns at most.
const BAND: f64 = 0.03;
/// Detent and grip spring: about 300 ms, damping ratio 0.85.
const SNAP: Config = Config { stiffness: 1400.0, damping: 127.2, mass: 4.0 };
/// A touch this near the knob's centre (pt) takes it.
const HIT: f32 = 44.0;
/// The white centre shrinks this much (pt) while held.
const GRIP: f32 = 4.0;
/// Figure size as a fraction of the inner disc's diameter.
const FIGURE_SCALE: f32 = 0.55;

/// The demo's surface (the canvas is size × size).
pub fn surface() -> Box<dyn Surface> {
    Box::new(slider())
}

fn slider() -> DurationSlider {
    DurationSlider {
        size: 0.0,
        turn: 0.0,
        knob_turn: Spring::at(0.0),
        grip: Spring::at(0.0),
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
    /// The finger's angle from the top, clockwise, in turns, unwrapped across the top and held
    /// within [−SLACK, 1 + SLACK]. 0 at mount.
    turn: f64,
    /// The knob's angle in turns: the finger's turn, rubber-banded past the stops while held, then
    /// a spring to the value's mark.
    knob_turn: Spring,
    /// 1 while the knob is held.
    grip: Spring,
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
    /// Progress in turns, clamped to 0…1.
    fn progress(&self) -> f64 {
        self.knob_turn.value.clamp(0.0, 1.0)
    }

    /// The knob's centre, on the ring at its angle from the top.
    fn knob(&self) -> (f32, f32) {
        let g = geometry(self.size);
        let theta = self.knob_turn.value * std::f64::consts::TAU - std::f64::consts::FRAC_PI_2;
        let c = g.c as f64;
        ((g.r as f64 * theta.cos() + c) as f32, (g.r as f64 * theta.sin() + c) as f32)
    }

    /// The finger's angle from the top, clockwise, in [0, 1) turn; None near the centre.
    fn finger_turn(&self, x: f32, y: f32) -> Option<f64> {
        let c = self.size as f64 / 2.0;
        let (dx, dy) = (x as f64 - c, y as f64 - c);
        if dx.hypot(dy) < DEAD_ZONE {
            return None;
        }
        Some(((dy.atan2(dx) + std::f64::consts::FRAC_PI_2) / std::f64::consts::TAU).rem_euclid(1.0))
    }

    /// animatedValue: an index into VALUES.
    fn value(&self) -> usize {
        ((self.progress() * MAX_VAL).round() + MIN_VAL).min(MAX_VAL) as usize - 1
    }

    /// The finger at (x, y): the turn nearest the last one (continuous across the top).
    fn set(&mut self, x: f32, y: f32) {
        let Some(a) = self.finger_turn(x, y) else { return };
        let before = self.turn;
        self.turn = (a + (self.turn - a).round()).clamp(-SLACK, 1.0 + SLACK);
        self.knob_turn.set(banded(self.turn));
        if (before < 1.0 && self.turn >= 1.0) || (before > 0.0 && self.turn <= 0.0) {
            self.posted.push("haptic:limit".into());
        }
        let v = self.value();
        if self.value.is_some_and(|old| old != v) {
            self.posted.push("haptic:selection".into());
        }
        self.value = Some(v);
    }
}

impl DurationSlider {
    /// Springs the knob to its value's mark, carrying the finger's angular speed when it left
    /// inside the span.
    fn release(&mut self, pan: Option<gesture_handler::Pan>) {
        self.dragging = false;
        self.grip.to(0.0, 0.0, SNAP);
        let c = self.size as f64 / 2.0;
        let speed = match pan {
            Some(p) if (0.0..=1.0).contains(&self.turn) => {
                let (dx, dy) = (p.x as f64 - c, p.y as f64 - c);
                let d2 = (dx * dx + dy * dy).max(1.0);
                (dx * p.velocity_y as f64 - dy * p.velocity_x as f64) / d2 / std::f64::consts::TAU
            }
            _ => 0.0,
        };
        let detent = self.value() as f64 / 12.0;
        self.turn = detent;
        self.knob_turn.to(detent, speed, SNAP);
    }
}

/// The finger's turn as the knob shows it: itself inside 0…1, rubber-banded past a stop. The band
/// relaxes again toward half a turn past the stop, where the unwrapped turn cycles, so the knob
/// never jumps.
fn banded(turn: f64) -> f64 {
    let band = |x: f64| {
        let x = x.min(SLACK - x).max(0.0);
        (1.0 - 1.0 / (x * 0.55 / BAND + 1.0)) * BAND
    };
    if turn > 1.0 {
        1.0 + band(turn - 1.0)
    } else if turn < 0.0 {
        -band(-turn)
    } else {
        turn
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
        crate::haptic::host(std::mem::take(&mut self.posted))
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
        let on_knob = (x - kx).hypot(y - ky) <= HIT;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, true) {
            Event::Begin { x, y } if on_knob => {
                self.dragging = true;
                self.grip.to(1.0, 0.0, SNAP);
                // From the knob's own turn (it may be springing), so the finger picks it up.
                self.turn = self.knob_turn.value.clamp(0.0, 1.0);
                self.set(x, y);
            }
            Event::Start(p) | Event::Update(p) if self.dragging => self.set(p.x, p.y),
            Event::End(p) if self.dragging => self.release(Some(p)),
            Event::End(_) | Event::Fail if self.dragging => self.release(None),
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
            self.turn = 0.0;
            self.knob_turn = Spring::at(0.0);
            self.value = Some(self.value());
            let disc = 2.0 * (geometry(self.size).r - STROKE / 2.0);
            if let Some(font) = self.font.as_mut() {
                font.set_size((disc * FIGURE_SCALE).min(FONT_SIZE));
            }
            let shader = gradient(&geometry(self.size));
            self.paints = Some((Paint::shader(shader.clone()).stroked(STROKE), Paint::shader(shader)));
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, queue, encoder, format, frame.shader_generation, (pw, ph), self.size, s));
            self.gpu.as_mut().unwrap().bind = None;
        }
        let moving = self.knob_turn.step(frame.now_ms) | self.grip.step(frame.now_ms);
        let g = geometry(self.size);
        let (kx, ky) = self.knob();
        let white_r = STROKE / 2.0 - 10.0 - GRIP * self.grip.value as f32;
        let progress = self.progress();
        let sweep = (progress * std::f64::consts::TAU) as f32;
        let value = VALUES[self.value()];
        let mut arc = [PathEvent::End { last: point(0.0, 0.0), first: point(0.0, 0.0), close: false }; 6];
        let n = if sweep > 0.0 { arc_events(g.c, g.c, g.r, sweep, &mut arc) } else { 0 };
        let (donut_paint, knob_paint) = self.paints.as_ref().unwrap();
        let [donut, picker, knob, text] = &mut self.canvases;
        donut.begin(s);
        if n > 0 {
            donut.draw_path_events(arc[..n].iter().copied(), donut_paint);
            // The dots the ring has passed, through it.
            let passed = Paint::fill(Color::rgba8(255, 255, 255, 140));
            for k in 1..12 {
                let t = k as f64 / 12.0;
                if t < progress {
                    let a = t * std::f64::consts::TAU - std::f64::consts::FRAC_PI_2;
                    donut.draw_circle(g.c + g.r * a.cos() as f32, g.c + g.r * a.sin() as f32, 3.0, &passed);
                }
            }
        }
        picker.begin(s);
        picker.draw_circle(kx, ky, STROKE / 2.0, knob_paint);
        knob.begin(s);
        knob.draw_circle(kx, ky, white_r, &Paint::fill(Color::WHITE));
        text.begin(s);
        if let Some(font) = self.font.as_ref() {
            // Centres the ink box on c, and the cap height vertically.
            let (left, right) = ink_span(value, font.size());
            let x = g.c - (left + right) / 2.0;
            let baseline = g.c + CAP_HEIGHT / 2.0 / UNITS_PER_EM * font.size();
            text.draw_text(value, x, baseline, font, &Paint::fill(Color::hex(0x111111)));
        }
        let gpu = self.gpu.as_mut().unwrap();
        for i in 0..4 {
            let view = &gpu.layers[if i == 3 { 4 } else { i }];
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], view, GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        }
        skia::render::fullscreen_pass(encoder, "duration slider saturate", &gpu.layers[3], &gpu.saturate, &gpu.saturate_bind);
        // Blurs: the donut's glow, the knob's glow, and the knob's inner shadow.
        let clip = circle_bounds(g.c, g.c, g.r + STROKE / 2.0, s);
        let dy = (20.0 * s).round() as i32;
        let white = circle_bounds(kx, ky, white_r, s);
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
        self.dragging || moving
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
    // Static background, drawn once.
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
    // Static inner disc, drawn once.
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

    /// The finger on the 123 pt radius at `turns` clockwise from the top.
    fn at(turns: f64) -> (f32, f32) {
        let a = turns * std::f64::consts::TAU - std::f64::consts::FRAC_PI_2;
        ((168.0 + 123.0 * a.cos()) as f32, (168.0 + 123.0 * a.sin()) as f32)
    }

    /// The finger walked from `from` to `to` turns in 1/100-turn steps.
    fn walk(s: &mut DurationSlider, from: f64, to: f64) {
        let n = ((to - from).abs() * 100.0).ceil() as usize;
        for i in 1..=n {
            let (x, y) = at(from + (to - from) * i as f64 / n as f64);
            s.set(x, y);
        }
    }

    #[test]
    fn values_follow_the_angle() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        assert_eq!(s.value(), 0);
        s.value = Some(0);
        walk(&mut s, 0.0, 0.25);
        assert_eq!(s.value() + 1, 4);
        assert_eq!(s.posted.len(), 3);
        walk(&mut s, 0.25, 0.995);
        assert_eq!(s.value() + 1, 12);
    }

    #[test]
    fn a_full_turn_stops_at_12_and_does_not_wrap() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        s.value = Some(0);
        walk(&mut s, 0.0, 1.0);
        assert_eq!((s.value() + 1, s.progress()), (12, 1.0));
        let before = s.posted.len();
        walk(&mut s, 1.0, 1.3);
        assert_eq!((s.value() + 1, s.progress()), (12, 1.0));
        assert_eq!(s.posted.len(), before);
        walk(&mut s, 1.3, 0.8);
        assert!((s.progress() - 0.8).abs() < 1e-6, "{}", s.progress());
        assert_eq!(s.value() + 1, 11);
    }

    #[test]
    fn circling_on_past_a_stop_reengages_at_the_stop() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        s.value = Some(0);
        walk(&mut s, 0.0, 1.0);
        for k in 0..200 {
            let (x, y) = at(1.0 + k as f64 / 100.0);
            s.set(x, y);
            assert_eq!(s.progress(), 1.0, "at {}", 1.0 + k as f64 / 100.0);
        }
        walk(&mut s, 2.99, 3.05);
        assert_eq!(s.progress(), 1.0);
        walk(&mut s, 3.05, 2.7);
        assert!((s.progress() - 0.7).abs() < 1e-6, "{}", s.progress());
    }

    #[test]
    fn backwards_from_rest_stays_at_1() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        s.value = Some(0);
        let (x, y) = at(-0.004);
        s.set(x, y);
        assert_eq!((s.value() + 1, s.progress()), (1, 0.0));
        walk(&mut s, -0.004, -0.3);
        assert_eq!((s.value() + 1, s.progress()), (1, 0.0));
        assert!(s.posted.is_empty());
        s.set(170.0, 166.0);
        assert_eq!(s.progress(), 0.0);
    }

    #[test]
    fn the_lift_springs_to_the_dot_and_the_band_gives_a_little() {
        let mut s = DurationSlider { size: 336.0, ..slider() };
        s.value = Some(0);
        walk(&mut s, 0.0, 0.27);
        s.release(None);
        for i in 0..60 {
            s.knob_turn.step(i as f64 * 16.0);
        }
        assert!((s.knob_turn.value - 0.25).abs() < 1e-4, "{}", s.knob_turn.value);
        walk(&mut s, 0.25, 1.2);
        assert!(s.knob_turn.value > 1.0 && s.knob_turn.value <= 1.0 + BAND, "{}", s.knob_turn.value);
        assert_eq!(s.progress(), 1.0);
        assert_eq!(s.posted.iter().filter(|m| *m == "haptic:limit").count(), 1);
        s.release(None);
        for i in 0..60 {
            s.knob_turn.step(1000.0 + i as f64 * 16.0);
        }
        assert!((s.knob_turn.value - 11.0 / 12.0).abs() < 1e-4, "{}", s.knob_turn.value);
        assert_eq!(s.value() + 1, 12);
    }

    #[test]
    fn figures_are_rns_and_their_ink_is_centred() {
        let s = slider();
        let font = s.font.as_ref().unwrap();
        // Advances and ink match the font.
        for (d, &(adv, _, _)) in DIGIT_INK.iter().enumerate() {
            let w = font.advance_width(&d.to_string());
            assert!((w - adv / UNITS_PER_EM * 100.0).abs() < 1e-3, "{d}: {w}");
        }
        assert!((font.advance_width("12") - 2218.0 / UNITS_PER_EM * 100.0).abs() < 1e-3);
        for d in 0..10 {
            let m = font.measure_text(&d.to_string());
            let (l, r) = ink_span(&d.to_string(), 100.0);
            assert_eq!((m.x, m.x + m.width), ((l.floor() - 1.0), (r.ceil() + 1.0)), "{d}");
        }
        let (l, r) = ink_span("12", 100.0);
        assert!((l - 59.0 / 20.48).abs() < 1e-3 && (r - 2149.0 / 20.48).abs() < 1e-3);
        assert!((CAP_HEIGHT / 2.0 / UNITS_PER_EM * 100.0 - 35.2295).abs() < 1e-3);
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
        let knob = rest.at(2 * 168, 2 * 15);
        assert!(knob[0] > 200 && knob[1] < 90, "{knob:?}");
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
        assert!(s.agent("{}").unwrap().contains("\"value\":4"), "{}", s.agent("{}").unwrap());
        let a = -std::f32::consts::FRAC_PI_4;
        let ring = dragged.at((2.0 * (168.0 + 123.0 * a.cos())) as u32, (2.0 * (168.0 + 123.0 * a.sin())) as u32);
        assert!(ring[0] > 200 && ring[1] < 90, "{ring:?}");
        finger(&mut s, PointerPhase::Up, x, y, 400.0);
        assert!(!s.agent("{}").unwrap().contains("\"dragging\":true"));
    }
}
