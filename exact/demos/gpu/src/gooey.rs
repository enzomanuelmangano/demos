//! A Skia gooey layer and what the canvas draws over it, shared by the demos that melt shapes
//! together with `<Group layer={<Paint><Blur blur={σ} /><ColorMatrix … 0, 0, 0, k, b /></Paint>}>`
//! (delete-button, exclusion-tabs).
//!
//! A frame records the layer's shapes into [`Gooey::goo`] and what is drawn after the layer into
//! [`Gooey::top`]; [`Gooey::draw`] renders both, blurs the layer as Skia Graphite does
//! (`skia::blur::GraphiteBlur`: the layer is the canvas, transparent outside it, so the blur fades
//! at the canvas's edges as RN's does), and composes them in one pass (`shaders/gooey.wgsl`).
//! Its targets, uniforms and bind group are kept between frames.

use exact_gpu::wgpu;
use exact_gpu::Frame;
use skia::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{Canvas, Renderer};

use crate::{gfx, shaders};
use shaders::gooey::{entry, module, Uniforms, GOO, GROUP_0, SMP, TOP, U};

/// The layer's paint: `<Blur blur={sigma}>` (points) and the colour matrix's alpha row
/// (`k · a + b`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Goo {
    /// The blur's σ, in points.
    pub sigma: f32,
    /// The alpha row's scale.
    pub k: f32,
    /// The alpha row's bias.
    pub b: f32,
}

/// A gooey layer, the canvas over it, and their GPU state.
pub struct Gooey {
    /// The layer's shapes, recorded each frame.
    pub goo: Canvas,
    /// What the canvas draws after the layer, recorded each frame.
    pub top: Canvas,
    paint: Goo,
    renderers: [Renderer; 2],
    blur: GraphiteBlur,
    plan: GraphitePlan,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The layer before its blur, and what is drawn over it.
    layers: [wgpu::TextureView; 2],
    /// Read where the layer is empty (nothing to blur).
    empty: wgpu::TextureView,
    /// The bind group and the blurred view it reads.
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

impl Gooey {
    /// A layer with this paint.
    pub fn new(paint: Goo) -> Gooey {
        Gooey {
            goo: Canvas::default(),
            top: Canvas::default(),
            paint,
            renderers: [Renderer::default(), Renderer::default()],
            blur: GraphiteBlur::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
            gpu: None,
        }
    }

    /// Starts a frame: both canvases begin at the frame's scale.
    pub fn begin(&mut self, frame: &Frame) {
        self.goo.begin(frame.scale);
        self.top.begin(frame.scale);
    }

    /// Renders the recorded frame into `target`.
    #[allow(clippy::too_many_arguments)]
    pub fn draw(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) {
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let gpu = self.gpu.as_mut().unwrap();
        self.renderers[0].draw(device, queue, encoder, &self.goo, &gpu.layers[0], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        self.renderers[1].draw(device, queue, encoder, &self.top, &gpu.layers[1], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        let layer = [0, 0, pw as i32, ph as i32];
        let mut u = Uniforms { low: [0.0; 4], out: [0.0, 0.0, -1.0, -1.0], matrix: [self.paint.k, self.paint.b, gfx::srgb_flag(format), 0.0] };
        let mut blurred = gpu.empty.clone();
        if self.plan.update(layer, layer, self.paint.sigma * frame.scale) {
            let out = self.blur.run(device, queue, encoder, Placed { view: &gpu.layers[0], origin: [0, 0], size: [pw, ph] }, &self.plan);
            u.low = low_mapping(&self.plan, out.origin, out.size);
            u.out = self.plan.output.map(|v| v as f32);
            blurred = out.view.clone();
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != blurred) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("gooey"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: GOO.binding, resource: wgpu::BindingResource::TextureView(&blurred) },
                    wgpu::BindGroupEntry { binding: TOP.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[1]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((blurred, group));
        }
        skia::render::fullscreen_pass(encoder, "gooey", target, &gpu.pipeline, &gpu.bind.as_ref().unwrap().1);
    }
}

/// The low-resolution image's uv for a device pixel: uv = p · xy + zw.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let view = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    Gpu {
        format,
        generation,
        pixels,
        pipeline,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("gooey"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        sampler: skia::render::linear_sampler(device),
        layers: [view("gooey layer"), view("gooey top")],
        empty: skia::render::sampled_target(device, "gooey empty", GRAPHITE_FORMAT, 1, 1),
        bind: None,
    }
}

/// Reanimated's `withTiming` on a colour (animation/utilCommon.ts colorOnStart / colorOnFrame):
/// each channel timed in its gamma-2.2 linear space (value^2.2), shown as `rgba(…)` with each
/// channel back to 0…255 and rounded; a retarget starts from that rounded colour.
#[derive(Clone, Debug)]
pub struct ColorTiming {
    channels: [reanimated::Timing; 3],
    target: [u8; 3],
}

impl ColorTiming {
    /// At rest at `rgb`.
    pub fn at(rgb: [u8; 3]) -> ColorTiming {
        ColorTiming { channels: rgb.map(|c| reanimated::Timing::at(linear(c as f64))), target: rgb }
    }

    /// `withTiming(to, { duration })` with the default easing (inOut(quad)), from the colour
    /// shown; no change when already going there.
    pub fn to(&mut self, rgb: [u8; 3], duration_ms: f64) {
        if self.target == rgb {
            return;
        }
        self.target = rgb;
        let shown = self.rgb();
        for (k, c) in self.channels.iter_mut().enumerate() {
            c.set(linear(shown[k] as f64));
            c.to(linear(rgb[k] as f64), duration_ms, reanimated::Easing::timing_default());
        }
    }

    /// Steps to `now_ms`; whether it still moves.
    pub fn step(&mut self, now_ms: f64) -> bool {
        let mut moving = false;
        for c in &mut self.channels {
            moving |= c.step(now_ms);
        }
        moving
    }

    /// The colour shown: each channel clamped, to gamma space, rounded.
    pub fn rgb(&self) -> [u8; 3] {
        self.channels.each_ref().map(|c| (c.value.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round() as u8)
    }

    /// [`ColorTiming::rgb`] as a Skia colour.
    pub fn color(&self) -> skia::Color {
        let [r, g, b] = self.rgb();
        skia::Color::rgb8(r, g, b)
    }
}

fn linear(c: f64) -> f64 {
    (c / 255.0).powf(2.2)
}
