//! Scrollable Shapes (src/animations/scrollable-shapes: index.tsx, shapes/*, components/
//! paginator.tsx): 3000 glowing points spinning in perspective on black, morphing between a
//! sphere, a cube, a torus and a heart as an invisible paged scroll moves; four dots below say
//! which.
//!
//! - The glow canvas (static): a Circle at the window's centre, r = W × 0.6, filled with a
//!   RadialGradient (same centre and radius) #ffffff40 → transparent, under Blur 60 (a Graphite
//!   blur of a canvas-sized layer: drawn once per size, shaders/scrollable_shapes.wgsl).
//! - The points canvas: shapes/ generated as RN does (Fibonacci sphere points, mapped per
//!   shape, normalised to a height of 200, cube × 0.75, torus × 1.2), lerped between shapes idx
//!   and idx + 1 by the scroll (inputRange i × W), tilted 0.2 rad about x, turned iTime about y,
//!   perspective 350 / (350 + z) about (W / 2, H / 2); drawPoints with round caps, stroke 1.0
//!   where the scale > 1.1 else 0.9, the paint a linear gradient (0, 0) → (W, H) of #00d9ff,
//!   #ffffff, #ff006e (shaders/scrollable_shapes_points.wgsl).
//! - The Paginator: absolute, left 0, right 0, bottom 60, a centred row with gap 8 of four
//!   white Views 6 tall, radius 3 continuous; dot i: progress = clamp((scrollX − (i − 1) W) / W,
//!   0, 2); width 6 + 10 · p and opacity 0.3 + 0.7 · p up to 1, then back down. Laid out per
//!   frame as Yoga lays it out (edges on the pixel grid). A touch on its row lands on it, not on
//!   the scroll.
//! - The ScrollView: absoluteFill, horizontal, content W × 4, snapToInterval W,
//!   decelerationRate "fast", bouncing (ui_scroll.rs).
//!
//! Motion audit:
//!
//! | value | driver | config | trigger |
//! |---|---|---|---|
//! | iTime | withRepeat(withTiming(2π, { duration 10000, Easing.linear }), −1) | each cycle restarts at the frame it ends | mount |
//! | scrollX | the ScrollView's contentOffset.x (onScroll) | UIScrollView: rubber band 0.55, rate 0.99/ms, snapToInterval W (ceil/floor by velocity) | the finger |
//! | shape morph | idx, clampedT from scrollX over i × W (per frame) | — | scrollX |
//! | dot width, opacity | piecewise from scrollX (per frame) | — | scrollX |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use skia::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, Canvas, Color, Paint, Renderer, Shader};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::scrollable_shapes::{entry, module, Uniforms, DOTS, GLOW, GROUP_0, POINTS, SMP, U};
use shaders::scrollable_shapes_points as points_shader;

/// N_POINTS.
const N: usize = 3000;
/// SHAPES_COUNT.
const SHAPES: usize = 4;
/// TARGET_HEIGHT.
const TARGET_HEIGHT: f64 = 200.0;
/// The glow's Blur.
const GLOW_BLUR: f32 = 60.0;
/// The paginator: DOT_SIZE, DOT_ACTIVE_WIDTH, DOT_SPACING, its bottom.
const DOT: f32 = 6.0;
const DOT_ACTIVE: f32 = 16.0;
const DOT_GAP: f32 = 8.0;
const DOTS_BOTTOM: f32 = 60.0;
/// One cycle of iTime.
const SPIN_MS: f64 = 10_000.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ScrollableShapes {
        axes: shape_axes(),
        size: (0.0, 0.0),
        scale: 1.0,
        scroll: UiScroll::new(0.0, 0.0, 0.0, FAST, Snap::Free),
        spin_start: None,
        time: 0.0,
        dots: Canvas::default(),
        glow: Canvas::default(),
        renderers: [Renderer::default(), Renderer::default()],
        blur: GraphiteBlur::default(),
        plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
        gpu: None,
    })
}

#[derive(Clone, Copy)]
struct P3 {
    x: f64,
    y: f64,
    z: f64,
}

/// fibonacciPoint(i, total): (theta, phi).
fn fibonacci(i: usize) -> (f64, f64) {
    let golden = (1.0 + 5f64.sqrt()) / 2.0;
    let t = i as f64 / N as f64;
    ((2.0 * std::f64::consts::PI * i as f64) / golden, (1.0 - 2.0 * t).acos())
}

/// normalizeShape: centred on each axis, scaled uniformly to a height of TARGET_HEIGHT.
fn normalize(points: Vec<P3>) -> Vec<P3> {
    let (mut min, mut max) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
    for p in &points {
        for (k, v) in [p.x, p.y, p.z].into_iter().enumerate() {
            min[k] = min[k].min(v);
            max[k] = max[k].max(v);
        }
    }
    let scale = TARGET_HEIGHT / (max[1] - min[1]);
    let center_y = (min[1] + max[1]) / 2.0;
    points
        .into_iter()
        .map(|p| P3 { x: (p.x - (min[0] + max[0]) / 2.0) * scale, y: (p.y - center_y) * scale, z: (p.z - (min[2] + max[2]) / 2.0) * scale })
        .collect()
}

fn scaled(points: Vec<P3>, f: f64) -> Vec<P3> {
    points.into_iter().map(|p| P3 { x: p.x * f, y: p.y * f, z: p.z * f }).collect()
}

fn sphere() -> Vec<P3> {
    let r = 100.0;
    normalize((0..N).map(|i| {
        let (theta, phi) = fibonacci(i);
        P3 { x: r * phi.sin() * theta.cos(), y: r * phi.sin() * theta.sin(), z: r * phi.cos() }
    }).collect())
}

fn cube() -> Vec<P3> {
    let s = 150.0 / 2.0;
    let points = (0..N)
        .map(|i| {
            let (theta, phi) = fibonacci(i);
            let (sx, sy, sz) = (phi.sin() * theta.cos(), phi.sin() * theta.sin(), phi.cos());
            let max = sx.abs().max(sy.abs()).max(sz.abs());
            P3 { x: (sx / max) * s, y: (sy / max) * s, z: (sz / max) * s }
        })
        .collect();
    scaled(normalize(points), 0.75)
}

fn torus() -> Vec<P3> {
    let (major, minor) = (50.0f64, 25.0f64);
    let ratio = major / minor;
    let minor_segments = (N as f64 / ratio).sqrt().round() as usize;
    let major_segments = (N as f64 / minor_segments as f64).round() as usize;
    let at = |u: f64, v: f64| P3 { x: (major + minor * v.cos()) * u.cos(), y: (major + minor * v.cos()) * u.sin(), z: minor * v.sin() };
    let mut points = Vec::with_capacity(N);
    'outer: for i in 0..major_segments {
        let u = (i as f64 / major_segments as f64) * std::f64::consts::PI * 2.0;
        for j in 0..minor_segments {
            if points.len() >= N {
                break 'outer;
            }
            let v = (j as f64 / minor_segments as f64) * std::f64::consts::PI * 2.0;
            points.push(at(u, v));
        }
    }
    while points.len() < N {
        let t = points.len() as f64 / N as f64;
        points.push(at(t * std::f64::consts::PI * 2.0 * major_segments as f64, t * std::f64::consts::PI * 2.0 * minor_segments as f64));
    }
    points.truncate(N);
    scaled(normalize(points), 1.2)
}

fn heart() -> Vec<P3> {
    let scale = 120.0;
    normalize((0..N).map(|i| {
        let (u, v) = fibonacci(i);
        let sin_v = v.sin();
        let hx = sin_v * (15.0 * u.sin() - 4.0 * (3.0 * u).sin());
        let hz = 8.0 * v.cos();
        let hy = sin_v * (15.0 * u.cos() - 5.0 * (2.0 * u).cos() - 2.0 * (3.0 * u).cos() - (4.0 * u).cos());
        P3 { x: hx * scale * 0.06, y: -hy * scale * 0.06, z: hz * scale * 0.06 }
    }).collect())
}

/// getShapeAxes: per point, its x, y and z in each shape (display order), as the instance data.
fn shape_axes() -> Vec<[f32; 12]> {
    let shapes = [sphere(), cube(), torus(), heart()];
    (0..N)
        .map(|i| {
            let mut v = [0.0f32; 12];
            for (s, shape) in shapes.iter().enumerate() {
                v[s] = shape[i].x as f32;
                v[4 + s] = shape[i].y as f32;
                v[8 + s] = shape[i].z as f32;
            }
            v
        })
        .collect()
}

/// A straight sRGB colour as encoded Display P3 (the skia package's gradient stops).
fn srgb_to_p3(rgb: u32) -> [f32; 4] {
    let lin = |c: u32| {
        let v = (c & 0xFF) as f32 / 255.0;
        if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
    };
    let enc = |v: f32| {
        let v = v.clamp(0.0, 1.0);
        if v <= 0.0031308 { 12.92 * v } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
    };
    let (r, g, b) = (lin(rgb >> 16), lin(rgb >> 8), lin(rgb));
    [enc(0.8225 * r + 0.1774 * g), enc(0.0332 * r + 0.9669 * g), enc(0.0171 * r + 0.0724 * g + 0.9108 * b), 1.0]
}

/// Yoga's rounding of a layout edge to the pixel grid: to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

struct ScrollableShapes {
    axes: Vec<[f32; 12]>,
    size: (f32, f32),
    scale: f32,
    scroll: UiScroll,
    /// iTime's current cycle's start.
    spin_start: Option<f64>,
    time: f64,
    dots: Canvas,
    glow: Canvas,
    renderers: [Renderer; 2],
    blur: GraphiteBlur,
    plan: GraphitePlan,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    points: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    point_uniforms: wgpu::Buffer,
    instances: wgpu::Buffer,
    /// The glow layer before its blur, the points' layer, the dots' layer.
    layers: [wgpu::TextureView; 3],
    point_bind: wgpu::BindGroup,
    /// The compose bind group (made once the glow is blurred) and its uniforms.
    bind: Option<(wgpu::BindGroup, Uniforms)>,
}

impl ScrollableShapes {
    /// The scroll's segment and clampedT.
    fn morph(&self) -> (usize, usize, f64) {
        let w = self.size.0 as f64;
        let scroll = self.scroll.offset;
        let mut idx = 0;
        while idx < SHAPES - 1 && scroll > w * (idx + 1) as f64 {
            idx += 1;
        }
        let next = (idx + 1).min(SHAPES - 1);
        let t = if idx >= SHAPES - 1 { 1.0 } else { (scroll - w * idx as f64) / (w * next as f64 - w * idx as f64) };
        (idx, next, t.clamp(0.0, 1.0))
    }

    /// Dot i's width and opacity.
    fn dot(&self, i: usize) -> (f32, f32) {
        let w = self.size.0 as f64;
        let progress = ((self.scroll.offset - (i as f64 - 1.0) * w) / w).clamp(0.0, 2.0) as f32;
        if progress <= 1.0 {
            (DOT + (DOT_ACTIVE - DOT) * progress, 0.3 + 0.7 * progress)
        } else {
            (DOT_ACTIVE - (DOT_ACTIVE - DOT) * (progress - 1.0), 1.0 - 0.7 * (progress - 1.0))
        }
    }

    /// The paginator's row (top, bottom) in points.
    fn dots_row(&self) -> (f32, f32) {
        let h = self.size.1;
        (h - DOTS_BOTTOM - DOT, h - DOTS_BOTTOM)
    }

    fn record_dots(&mut self, scale: f32) {
        let w = self.size.0;
        let dots: [(f32, f32); SHAPES] = std::array::from_fn(|i| self.dot(i));
        let total: f32 = dots.iter().map(|d| d.0).sum::<f32>() + DOT_GAP * (SHAPES - 1) as f32;
        let (top, bottom) = self.dots_row();
        let (top, bottom) = (grid(top, scale), grid(bottom, scale));
        let c = &mut self.dots;
        c.begin(scale);
        let mut x = (w - total) / 2.0;
        for (dw, opacity) in dots {
            let (l, r) = (grid(x, scale), grid(x + dw, scale));
            c.draw_continuous_rrect(l, top, r - l, bottom - top, DOT / 2.0, &Paint::fill(Color::WHITE).with_opacity(opacity));
            x += dw + DOT_GAP;
        }
    }
}

impl Surface for ScrollableShapes {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (idx, next, t) = self.morph();
        Some(format!("{{\"scrollX\":{:.2},\"shape\":{idx},\"next\":{next},\"t\":{t:.4}}}", self.scroll.offset))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let (top, bottom) = self.dots_row();
        let inside = !(y >= grid(top, self.scale) && y < grid(bottom, self.scale));
        self.scroll.input(id, gfx::phase(phase), x, y, at_ms, inside);
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
        let (w, h) = (frame.width, frame.height);
        self.scale = frame.scale;
        if self.size != (w, h) {
            self.size = (w, h);
            self.scroll.port = w as f64;
            self.scroll.max = 3.0 * w as f64;
            self.scroll.snap = Snap::Interval(w as f64);
            if let Some(gpu) = self.gpu.as_mut() {
                gpu.bind = None;
            }
        }
        // iTime: withRepeat(withTiming(2π, 10 s, linear)), a cycle restarting at the frame
        // that ends the last.
        let start = *self.spin_start.get_or_insert(frame.now_ms);
        let runtime = frame.now_ms - start;
        self.time = if runtime >= SPIN_MS {
            self.spin_start = Some(frame.now_ms);
            std::f64::consts::TAU
        } else {
            std::f64::consts::TAU * runtime / SPIN_MS
        };
        self.scroll.step(frame.now_ms);

        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation, (pw, ph), &self.axes));
        }
        let scale = frame.scale;
        // The glow: drawn and blurred once per size.
        if self.gpu.as_ref().unwrap().bind.is_none() {
            let gpu = self.gpu.as_mut().unwrap();
            let (cx, cy, r) = (w / 2.0, h / 2.0, w * 0.6);
            self.glow.begin(scale);
            let gradient = Shader::Radial { center: point(cx, cy), radius: r, stops: skia::stops(&[Color::rgba8(255, 255, 255, 0x40), Color::TRANSPARENT]) };
            self.glow.draw_circle(cx, cy, r, &Paint::shader(gradient));
            self.renderers[0].draw(device, queue, encoder, &self.glow, &gpu.layers[0], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
            let layer = [0, 0, pw as i32, ph as i32];
            let mut u = Uniforms { low: [0.0; 4], out: [0.0, 0.0, -1.0, -1.0], canvas: [gfx::srgb_flag(format), 0.0, 0.0, 0.0] };
            let glow = if self.plan.update(layer, layer, GLOW_BLUR * scale) {
                let out = self.blur.run(device, queue, encoder, Placed { view: &gpu.layers[0], origin: [0, 0], size: [pw, ph] }, &self.plan);
                u.low = low_mapping(&self.plan, out.origin, out.size);
                u.out = self.plan.output.map(|v| v as f32);
                out.view.clone()
            } else {
                gpu.layers[0].clone()
            };
            let layout = device.create_bind_group_layout(&GROUP_0);
            let sampler = skia::render::linear_sampler(device);
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("scrollable shapes"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: GLOW.binding, resource: wgpu::BindingResource::TextureView(&glow) },
                    wgpu::BindGroupEntry { binding: POINTS.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[1]) },
                    wgpu::BindGroupEntry { binding: DOTS.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[2]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                ],
            });
            queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
            gpu.bind = Some((group, u));
        }
        self.record_dots(scale);
        let (idx, next, t) = self.morph();
        let gpu = self.gpu.as_mut().unwrap();
        let pu = points_shader::Uniforms {
            center: [w / 2.0, h / 2.0, scale, 0.0],
            view: [pw as f32, ph as f32, w, h],
            morph: [idx as f32, next as f32, t as f32, 0.0],
            spin: [self.time.cos() as f32, self.time.sin() as f32, 0.2f64.cos() as f32, 0.2f64.sin() as f32],
            stops: [srgb_to_p3(0x00D9FF), srgb_to_p3(0xFFFFFF), srgb_to_p3(0xFF006E)],
        };
        queue.write_buffer(&gpu.point_uniforms, 0, &pu.bytes());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scrollable shapes points"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &gpu.layers[1],
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.points);
            pass.set_bind_group(0, &gpu.point_bind, &[]);
            pass.set_vertex_buffer(0, gpu.instances.slice(..));
            pass.draw(0..4, 0..N as u32);
        }
        self.renderers[1].draw(device, queue, encoder, &self.dots, &gpu.layers[2], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        skia::render::fullscreen_pass(encoder, "scrollable shapes", target, &gpu.compose, &gpu.bind.as_ref().unwrap().0);
        // iTime repeats forever.
        true
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

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32), axes: &[[f32; 12]]) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let point_module = device.create_shader_module(points_shader::module());
    let point_layout = device.create_bind_group_layout(&points_shader::GROUP_0);
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("scrollable shapes points"), bind_group_layouts: &[Some(&point_layout)], immediate_size: 0 });
    let attributes = wgpu::vertex_attr_array![0 => Float32x4, 1 => Float32x4, 2 => Float32x4];
    let points = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("scrollable shapes points"),
        layout: Some(&pl),
        vertex: wgpu::VertexState {
            module: &point_module,
            entry_point: Some(points_shader::entry::VS),
            buffers: &[Some(wgpu::VertexBufferLayout { array_stride: 48, step_mode: wgpu::VertexStepMode::Instance, attributes: &attributes })],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &point_module,
            entry_point: Some(points_shader::entry::FS),
            targets: &[Some(wgpu::ColorTargetState { format: GRAPHITE_FORMAT, blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, ..Default::default() },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let instances = device.create_buffer(&wgpu::BufferDescriptor { label: Some("scrollable shapes axes"), size: (axes.len() * 48) as u64, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let mut bytes = Vec::with_capacity(axes.len() * 48);
    for a in axes {
        for v in a {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
    }
    queue.write_buffer(&instances, 0, &bytes);
    let point_uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("scrollable shapes points"), size: points_shader::Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let point_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("scrollable shapes points"),
        layout: &point_layout,
        entries: &[wgpu::BindGroupEntry { binding: points_shader::U.binding, resource: point_uniforms.as_entire_binding() }],
    });
    let view = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    Gpu {
        format,
        generation,
        pixels,
        compose,
        points,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("scrollable shapes"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        point_uniforms,
        instances,
        layers: [view("scrollable shapes glow"), view("scrollable shapes points"), view("scrollable shapes dots")],
        point_bind,
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn shapes_are_rns() {
        let s = sphere();
        let (min, max) = s.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p.y), b.max(p.y)));
        assert!((max - min - 200.0).abs() < 1e-9);
        // Torus: 39 minor × 77 major segments ≥ 3000: no fill needed; × 1.2 after normalising.
        let t = torus();
        let (min, max) = t.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p.y), b.max(p.y)));
        assert!((max - min - 240.0).abs() < 1e-9, "{}", max - min);
        assert_eq!(shape_axes().len(), N);
    }

    #[test]
    fn a_flick_morphs_to_the_next_shape() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "scrollable-shapes-sphere", [0, 0, 0]);
        assert!(moving);
        // The glow at the centre, some points, the first dot wide and white.
        let c = img.at(630, 1368);
        assert!(c[0] > 20 && c[3] == 255, "centre {c:?}");
        let lit = img.data.chunks(4).filter(|p| p[2] > 150).count();
        assert!(lit > 2000, "points {lit}");
        // Dots row 2538…2556 px: dot 0 (16 wide) from x (420 − 46) / 2 = 187.
        assert!(img.at(3 * 190, 2547)[0] > 240, "dot 0 {:?}", img.at(570, 2547));
        // A slow flick to the left: 30 pt, then release.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 400.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 300.0, 16.0));
        for i in 1..=6 {
            s.input(&pointer(PointerPhase::Move, 300.0 - 8.0 * i as f32, 16.0 + 16.0 * i as f64));
        }
        s.input(&pointer(PointerPhase::Up, 252.0, 120.0));
        let mut ms = 120.0;
        let mut img = img;
        while ms < 3000.0 {
            ms += 16.0;
            img = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().0;
        }
        gfx::save_over(&img, "scrollable-shapes-cube", [0, 0, 0]);
        assert!(s.agent("").unwrap().starts_with("{\"scrollX\":420.00,\"shape\":0,\"next\":1,\"t\":1.0000"), "{}", s.agent("").unwrap());
    }
}
