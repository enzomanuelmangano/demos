//! Skia Color Picker (src/animations/skia-color-picker: index.tsx, components/color-picker/
//! index.tsx, shader.ts, utils/*): a hue/saturation wheel the width of the screen, on black, with
//! a soft cyan-magenta-yellow halo; a drop-shaped picker follows the finger (clamped to the wheel)
//! and fills with the colour under its tip.
//!
//! - canvasSize W = window width. DEFAULT_PICKER_SHAPE's bounds (SkPath::getBounds, control
//!   points included): (0.167, 0.889)–(43.833, 59.111), 43.666 × 58.222. maxColorPickerSize
//!   m = W − 2 · 58.222.
//! - The wheel ([`shaders::skia_color_picker`] `wheel`, drawn once): Group [translateX h,
//!   translateY h, scale m / W] (h = the bounds' height) over the sweep circle and the runtime
//!   shader circle, both under the group's BlurMask(blur 20, "solid", respectCTM): σ = 20 · m / W
//!   points. The blur of the circle's coverage is Graphite's (skia::blur::GraphitePlan).
//! - The pan (Gesture.Pan on the view over both canvases): onBegin (touch-down) and onUpdate
//!   (from activation, 10 pt) move the picker to the finger clamped to the circle (centre W / 2,
//!   radius m / 2: clampToCircle). No spring: the picker is where the finger is.
//! - The picker: Group [translateX x − 43.666 / 2, translateY y − 58.222]; the shape stroked
//!   white, width 5 (miter join, butt cap), under <Shadow dx 0 dy 0 blur 20 black> (an image
//!   filter: the stroke's alpha blurred by σ 20 in black, the stroke over it, on a layer the size
//!   of the stroke's fast bounds, rounded out: Graphite's blur again, run each frame the picker
//!   moves); then the shape filled with rgba(r, g, b, 1): hsvToRgb(hue, saturation, 100) of the
//!   picker's offset from the centre (getHueFromPosition, getSaturationFromPosition with radius
//!   m / 2), each channel Math.round()ed.
//!
//! Each frame the picker moves: two small canvases (the stroke; the stroke and the fill), one
//! blur, one composite. Nothing is allocated once warm.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{path_from_svg, Canvas, Color, Paint, Path, Renderer};

use crate::{gfx, shaders};
use shaders::skia_color_picker::{entry, module, Uniforms, BASE, BLURRED, GROUP_0, PICKER, SMP, U};

/// DEFAULT_PICKER_SHAPE.
const SHAPE: &str = "M22 .889C9.943.889.167 10.664.167 22.723C.167 37.127 22 59.111 22 59.111S43.833 37.43 43.833 22.723C43.833 10.664 34.057.889 22 .889z";
/// Its control-point bounds (l, t, r, b).
const BOUNDS: [f32; 4] = [0.167, 0.889, 43.833, 59.111];
/// ColorPicker blur, the Shadow's blur, the stroke's width.
const WHEEL_BLUR: f32 = 20.0;
const SHADOW_BLUR: f32 = 20.0;
const STROKE: f32 = 5.0;
/// SkStrokeRec::GetInflationRadius for a miter join (limit 4): width / 2 × 4.
const STROKE_OUTSET: f32 = STROKE / 2.0 * 4.0;
/// Transparent texels around the picker's layer (bilinear reads past it see 0).
const MARGIN: i32 = 4;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ColorPicker {
        shape: path_from_svg(SHAPE),
        size: 0.0,
        picker: None,
        pan: PanGesture::new(),
        dirty: true,
        plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
        blur: GraphiteBlur::default(),
        stroke: Canvas::default(),
        both: Canvas::default(),
        stroke_renderer: Renderer::default(),
        both_renderer: Renderer::default(),
        gpu: None,
    })
}

struct ColorPicker {
    shape: Option<Path>,
    /// W.
    size: f32,
    /// pickerX, pickerY (None until the first frame places it at the centre).
    picker: Option<(f64, f64)>,
    pan: PanGesture,
    dirty: bool,
    plan: GraphitePlan,
    blur: GraphiteBlur,
    stroke: Canvas,
    both: Canvas,
    stroke_renderer: Renderer,
    both_renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    wheel: wgpu::TextureView,
    /// The picker's layer size (texels, margin included): the stroke alone, and stroke + fill.
    layer_size: (u32, u32),
    stroke: wgpu::TextureView,
    both: wgpu::TextureView,
    /// The composite's bind group and the blurred view it reads.
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

/// The bounds' width and height.
fn bounds_size() -> (f32, f32) {
    (BOUNDS[2] - BOUNDS[0], BOUNDS[3] - BOUNDS[1])
}

/// maxColorPickerSize.
fn max_size(w: f32) -> f32 {
    let (bw, bh) = bounds_size();
    w - bw.max(bh) * 2.0
}

/// clampToCircle, in f64 as the worklet runs it.
fn clamp_to_circle(x: f64, y: f64, cx: f64, cy: f64, radius: f64) -> (f64, f64) {
    let (dx, dy) = (x - cx, y - cy);
    if dx * dx + dy * dy > radius.powi(2) {
        let angle = dy.atan2(dx);
        (cx + radius * angle.cos(), cy + radius * angle.sin())
    } else {
        (x, y)
    }
}

/// hsvToRgb(h, s, v): each channel Math.round(c × 255).
fn hsv_to_rgb(h: f64, s: f64, v: f64) -> [u8; 3] {
    let mut h = h % 360.0;
    if h < 0.0 {
        h += 360.0;
    }
    let (h, s, v) = (h / 360.0, s / 100.0, v / 100.0);
    let (r, g, b) = if s == 0.0 {
        (v, v, v)
    } else {
        let sector = h * 6.0;
        let index = sector.floor();
        let f = sector - index;
        let p = v * (1.0 - s);
        let q = v * (1.0 - s * f);
        let t = v * (1.0 - s * (1.0 - f));
        match index as i64 {
            0 => (v, t, p),
            1 => (q, v, p),
            2 => (p, v, t),
            3 => (p, q, v),
            4 => (t, p, v),
            _ => (v, p, q),
        }
    };
    [r, g, b].map(|c| (c * 255.0 + 0.5).floor() as u8)
}

/// The `rgba` derived value: the colour under the picker at (x, y).
fn color_at(x: f64, y: f64, w: f64) -> [u8; 3] {
    let (dx, dy) = (x - w / 2.0, y - w / 2.0);
    let hue = (180.0 + dy.atan2(dx) * 180.0 / std::f64::consts::PI + 360.0) % 360.0;
    let radius = max_size(w as f32) as f64 / 2.0;
    let saturation = ((dx * dx + dy * dy).sqrt() / radius).powi(2) * 100.0;
    hsv_to_rgb(hue, saturation, 100.0)
}

impl ColorPicker {
    fn on_move(&mut self, x: f32, y: f32) {
        let c = self.size as f64 / 2.0;
        self.picker = Some(clamp_to_circle(x as f64, y as f64, c, c, max_size(self.size) as f64 / 2.0));
        self.dirty = true;
    }

    /// The picker group's translation.
    fn translation(&self) -> (f32, f32) {
        let (x, y) = self.picker.unwrap_or((self.size as f64 / 2.0, self.size as f64 / 2.0));
        let (bw, bh) = bounds_size();
        ((x - bw as f64 / 2.0) as f32, (y - bh as f64) as f32)
    }

    /// The shadow's layer: the stroke's fast bounds (path bounds outset by the miter
    /// inflation), translated, in device pixels, rounded out.
    fn layer(&self, scale: f32) -> IRect {
        let (tx, ty) = self.translation();
        let o = STROKE_OUTSET;
        round_out([(BOUNDS[0] - o + tx) * scale, (BOUNDS[1] - o + ty) * scale, (BOUNDS[2] + o + tx) * scale, (BOUNDS[3] + o + ty) * scale])
    }
}

impl Surface for ColorPicker {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (x, y) = self.picker.unwrap_or((self.size as f64 / 2.0, self.size as f64 / 2.0));
        let [r, g, b] = color_at(x, y, self.size as f64);
        Some(format!("{{\"x\":{x:.2},\"y\":{y:.2},\"color\":\"rgba({r}, {g}, {b}, 1)\"}}"))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size <= 0.0 {
            return;
        }
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, true) {
            Event::Begin { x, y } => self.on_move(x, y),
            // Activation sends onUpdate too (RNGH's ACTIVE event).
            Event::Start(p) | Event::Update(p) => self.on_move(p.x, p.y),
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
            self.picker = None;
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, queue, encoder, format, frame.shader_generation, (pw, ph), self.size, s));
            self.dirty = true;
        }
        let Some(shape) = self.shape.as_ref() else { return false };
        let (tx, ty) = self.translation();
        let layer = self.layer(s);
        let gpu = self.gpu.as_mut().unwrap();
        let origin = [layer[0] - MARGIN, layer[1] - MARGIN];
        // The stroke, then the stroke and the fill, into the layer textures.
        let (x, y) = self.picker.unwrap_or((self.size as f64 / 2.0, self.size as f64 / 2.0));
        let [r, g, b] = color_at(x, y, self.size as f64);
        let stroke_paint = Paint::stroke(Color::WHITE, STROKE);
        for (canvas, fill) in [(&mut self.stroke, false), (&mut self.both, true)] {
            canvas.begin(s);
            canvas.translate(-origin[0] as f32 / s + tx, -origin[1] as f32 / s + ty);
            canvas.draw_path(shape, &stroke_paint);
            if fill {
                canvas.draw_path(shape, &Paint::fill(Color::rgb8(r, g, b)));
            }
        }
        let (lw, lh) = gpu.layer_size;
        self.stroke_renderer.draw(device, queue, encoder, &self.stroke, &gpu.stroke, GRAPHITE_FORMAT, lw, lh, wgpu::Color::TRANSPARENT);
        self.both_renderer.draw(device, queue, encoder, &self.both, &gpu.both, GRAPHITE_FORMAT, lw, lh, wgpu::Color::TRANSPARENT);
        // The drop shadow: σ 20 points, the canvas the desired output.
        let mut uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            wheel: [self.size, bounds_size().1, max_size(self.size) / self.size, 0.0],
            low: [0.0; 4],
            output: [0.0; 4],
            layer: [origin[0] as f32, origin[1] as f32, lw as f32, lh as f32],
        };
        let drawn = self.plan.update(layer, [0, 0, pw as i32, ph as i32], SHADOW_BLUR * s);
        if drawn {
            let source = Placed { view: &gpu.stroke, origin, size: [lw, lh] };
            let out = self.blur.run(device, queue, encoder, source, &self.plan);
            uniforms.low = low_mapping(&self.plan, out.origin, out.size);
            uniforms.output = self.plan.output.map(|v| v as f32);
            if gpu.bind.as_ref().is_none_or(|(v, _)| v != out.view) {
                let group = compose_bind(device, gpu, out.view);
                gpu.bind = Some((out.view.clone(), group));
            }
        }
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        if let Some((_, bind)) = gpu.bind.as_ref() {
            skia::render::fullscreen_pass(encoder, "color picker", target, &gpu.compose, bind);
        }
        self.dirty = false;
        self.pan.tracking()
    }
}

/// uv = to_low(p) · (1 / size) − origin / size, as one scale and offset.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn compose_bind(device: &wgpu::Device, gpu: &Gpu, blurred: &wgpu::TextureView) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("color picker"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: BASE.binding, resource: wgpu::BindingResource::TextureView(&gpu.wheel) },
            wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred) },
            wgpu::BindGroupEntry { binding: PICKER.binding, resource: wgpu::BindingResource::TextureView(&gpu.both) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
        ],
    })
}

/// The pipelines, the layer textures, and the wheel, drawn once.
#[allow(clippy::too_many_arguments)]
fn build(device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32), w: f32, s: f32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let wheel_pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::WHEEL, GRAPHITE_FORMAT, None);
    let uniforms = || device.create_buffer(&wgpu::BufferDescriptor { label: Some("color picker"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = skia::render::linear_sampler(device);
    let target = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    // The picker's layer: its fast bounds at most, rounded out, plus the margins.
    let (bw, bh) = bounds_size();
    let layer_size = (((bw + 2.0 * STROKE_OUTSET) * s).ceil() as u32 + 2 + 2 * MARGIN as u32, ((bh + 2.0 * STROKE_OUTSET) * s).ceil() as u32 + 2 + 2 * MARGIN as u32);
    let layer = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, layer_size.0, layer_size.1);
    let wheel = target("color picker wheel");
    // The wheel: the circle's coverage, its Graphite blur (σ 20 · s, respectCTM), the shading.
    let m = max_size(w);
    let k = m / w;
    let h = bh;
    let mut mask = Canvas::default();
    mask.begin(s);
    mask.translate(h, h);
    mask.scale(k, k);
    mask.draw_circle(w / 2.0, w / 2.0, w / 2.0, &Paint::fill(Color::WHITE));
    let coverage = target("color picker coverage");
    Renderer::default().draw(device, queue, encoder, &mask, &coverage, GRAPHITE_FORMAT, pixels.0, pixels.1, wgpu::Color::TRANSPARENT);
    let circle = round_out([h * s, h * s, (h + m) * s, (h + m) * s]);
    let desired = [0, 0, pixels.0 as i32, pixels.1 as i32];
    let mut blur = GraphiteBlur::default();
    let empty = layer("color picker empty");
    let mut u = Uniforms { canvas: [pixels.0 as f32, pixels.1 as f32, s, 0.0], wheel: [w, h, k, 0.0], low: [0.0; 4], output: [0.0; 4], layer: [0.0; 4] };
    let wheel_uniforms = uniforms();
    let bind = |u_buf: &wgpu::Buffer, blurred: &wgpu::TextureView| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("color picker wheel"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: u_buf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: BASE.binding, resource: wgpu::BindingResource::TextureView(&coverage) },
                wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred) },
                wgpu::BindGroupEntry { binding: PICKER.binding, resource: wgpu::BindingResource::TextureView(&empty) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        })
    };
    let group = match GraphitePlan::new(circle, desired, WHEEL_BLUR * k * s) {
        Some(plan) => {
            let source = Placed { view: &coverage, origin: [0, 0], size: [pixels.0, pixels.1] };
            let out = blur.run(device, queue, encoder, source, &plan);
            u.low = low_mapping(&plan, out.origin, out.size);
            u.output = plan.output.map(|v| v as f32);
            queue.write_buffer(&wheel_uniforms, 0, &u.bytes());
            bind(&wheel_uniforms, out.view)
        }
        None => {
            queue.write_buffer(&wheel_uniforms, 0, &u.bytes());
            bind(&wheel_uniforms, &empty)
        }
    };
    skia::render::fullscreen_pass(encoder, "color picker wheel", &wheel, &wheel_pipeline, &group);
    Gpu {
        format,
        generation,
        pixels,
        compose,
        layout,
        uniforms: uniforms(),
        sampler,
        wheel,
        layer_size,
        stroke: layer("color picker stroke"),
        both: layer("color picker picker"),
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_shape_bounds_are_skias() {
        let path = path_from_svg(SHAPE).unwrap();
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for e in path.iter() {
            let pts: Vec<skia::Point> = match e {
                skia::PathEvent::Begin { at } => vec![at],
                skia::PathEvent::Line { to, .. } => vec![to],
                skia::PathEvent::Quadratic { ctrl, to, .. } => vec![ctrl, to],
                skia::PathEvent::Cubic { ctrl1, ctrl2, to, .. } => vec![ctrl1, ctrl2, to],
                skia::PathEvent::End { .. } => vec![],
            };
            for p in pts {
                (l, t, r, b) = (l.min(p.x), t.min(p.y), r.max(p.x), b.max(p.y));
            }
        }
        for (a, e) in [l, t, r, b].iter().zip(BOUNDS) {
            assert!((a - e).abs() < 1e-4, "{a} {e}");
        }
    }

    #[test]
    fn colours_follow_the_worklet() {
        // The centre is white; the right edge (hue 180) is cyan, the left (0) red.
        let w = 420.0;
        let r = max_size(w as f32) as f64 / 2.0;
        assert_eq!(color_at(210.0, 210.0, w), [255, 255, 255]);
        assert_eq!(color_at(210.0 + r, 210.0, w), [0, 255, 255]);
        assert_eq!(color_at(210.0 - r, 210.0, w), [255, 0, 0]);
        // Half way out: saturation 25 %.
        assert_eq!(color_at(210.0, 210.0 + r / 2.0, w), hsv_to_rgb(270.0, 25.0, 100.0));
        assert_eq!(hsv_to_rgb(270.0, 25.0, 100.0), [223, 191, 255]);
    }

    #[test]
    fn the_wheel_and_a_dragged_picker() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 420.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("skia-color-picker-rest");
        assert!(!animating);
        // Wheel at the right edge, inside: cyan-ish (hue 180 at full saturation); outside it the
        // halo is coloured but faint; the corners are transparent.
        let right = rest.at(2 * 360, 420);
        assert!(right[0] < 60 && right[1] > 200 && right[2] > 200, "{right:?}");
        assert_eq!(rest.at(2, 2)[3], 0);
        let halo = rest.at(2 * 395, 420);
        assert!(halo[3] > 0 && halo[3] < 200, "{halo:?}");
        // The picker at the centre: white fill (its tip at the centre, the body above it).
        let body = rest.at(420, 420 - 2 * 30);
        assert!(body[..3].iter().all(|&c| c > 250), "{body:?}");

        let finger = |s: &mut Box<dyn Surface>, phase, x, y, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // Down far right: clamped to the circle's edge, hue 180 (cyan).
        finger(&mut s, PointerPhase::Down, 419.0, 210.0, 0.0);
        let (moved, _) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        moved.save("skia-color-picker-right");
        assert!(s.agent("{}").unwrap().contains("rgba(0, 255, 255, 1)"), "{}", s.agent("{}").unwrap());
        finger(&mut s, PointerPhase::Up, 419.0, 210.0, 30.0);
    }
}
