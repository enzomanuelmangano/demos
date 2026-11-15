//! 3000 glowing points spinning in perspective on black, morphing between a sphere, a cube, a torus
//! and a heart as the paged scroll moves. Four dots below show which page is in view.
//!
//! - The points are generated once per shape and lerped between the two shapes either side of the
//!   scroll, tilted and turned, with a perspective and a gradient. The glow is a blurred radial
//!   gradient behind them, drawn once per size.
//! - Pulled past the first or last page, the rubber band carries the morph on past its ends,
//!   softly limited. The shape stays in place and morphs back with the bounce.
//! - A touch on the dots lands on them, not on the scroll. A fling ends on a page.
//! - Haptics: a selection each time the page changes, during a drag and its glide, at most one per
//!   HAPTIC_GAP_MS; a rigid impact once each time the scroll is pulled or thrown past an end.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use draw2d::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use draw2d::{point, Canvas, Color, Paint, Renderer, Shader};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::scrollable_shapes::{entry, module, Uniforms, DOTS, GLOW, GROUP_0, POINTS, SMP, U};
use shaders::scrollable_shapes_points as points_shader;

/// Points per shape.
const N: usize = 3000;
/// Shapes: sphere, cube, torus, heart.
const SHAPES: usize = 4;
/// Height of each shape, in points.
const TARGET_HEIGHT: f64 = 200.0;
/// Glow blur, in points.
const GLOW_BLUR: f32 = 60.0;
/// Paginator: dot size and active width, spacing, and its bottom, in points.
const DOT: f32 = 6.0;
const DOT_ACTIVE: f32 = 16.0;
const DOT_GAP: f32 = 8.0;
const DOTS_BOTTOM: f32 = 60.0;
/// One spin cycle, ms.
const SPIN_MS: f64 = 10_000.0;
/// The most the morph runs on past its ends (in t).
const OVERMORPH: f64 = 0.35;

/// `x` softly limited to ±OVERMORPH: linear near 0, flat at the limit (tanh).
fn soft(x: f64) -> f64 {
    OVERMORPH * (x / OVERMORPH).tanh()
}

/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-way line the offset goes before the haptics' item changes, pt.
const SWITCH: f64 = 6.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;

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
        page: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    })
}

#[derive(Clone, Copy)]
struct P3 {
    x: f64,
    y: f64,
    z: f64,
}

/// A point on the Fibonacci sphere: (theta, phi).
fn fibonacci(i: usize) -> (f64, f64) {
    let golden = (1.0 + 5f64.sqrt()) / 2.0;
    let t = i as f64 / N as f64;
    ((2.0 * std::f64::consts::PI * i as f64) / golden, (1.0 - 2.0 * t).acos())
}

/// Centres a shape and scales it to TARGET_HEIGHT tall.
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

/// Per point, its x, y and z in each shape, as the instance data.
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

/// An sRGB colour converted to encoded Display P3.
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

/// Rounds a layout edge to the nearest device pixel, a half up.
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
    /// The page, and whether the scroll is past an end (their haptics).
    page: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
}

impl ScrollableShapes {
    /// How far the scroll is past an end (negative before the first page), points.
    fn overscroll(&self) -> f64 {
        let (offset, max) = (self.scroll.offset, self.scroll.max.max(0.0));
        offset - offset.clamp(0.0, max)
    }

    /// A selection when the page changes (one per HAPTIC_GAP_MS at most), a rigid thunk once per
    /// pull past an end.
    fn haptics(&mut self, now: f64) {
        let (offset, max, w) = (self.scroll.offset, self.scroll.max, self.size.0 as f64);
        if w <= 0.0 {
            return;
        }
        // The page holds until the offset is SWITCH past the half-way line: a finger
        // hovering there does not flap.
        let f = offset / w;
        let page = match self.page {
            Some(c) if (f - c as f64).abs() < 0.5 + SWITCH / w => c,
            _ => f.round().clamp(0.0, (SHAPES - 1) as f64) as i64,
        };
        if self.page.is_some_and(|p| p != page) && now - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = now;
        }
        self.page = Some(page);
        if offset < -PAST_END || offset > max + PAST_END {
            if !self.past_end {
                self.posted.push("haptic:impact-rigid".into());
            }
            self.past_end = true;
        } else if (0.0..=max).contains(&offset) {
            self.past_end = false;
        }
    }
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
        // Past an end, the rubber band's overshoot, in pages, carries the morph on: the first pair's
        // t goes below 0, the last pair's above 1, softly limited to OVERMORPH. The shader goes on
        // with the same lerp, at the same rate per page as inside the range.
        let over = self.overscroll() / w;
        if over < 0.0 {
            return (0, 1, soft(over));
        }
        if over > 0.0 {
            return (SHAPES - 2, SHAPES - 1, 1.0 + soft(over));
        }
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

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
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
        // The spin: a linear 2π per SPIN_MS, restarting at the frame that ends each cycle.
        let start = *self.spin_start.get_or_insert(frame.now_ms);
        let runtime = frame.now_ms - start;
        self.time = if runtime >= SPIN_MS {
            self.spin_start = Some(frame.now_ms);
            std::f64::consts::TAU
        } else {
            std::f64::consts::TAU * runtime / SPIN_MS
        };
        self.scroll.step(frame.now_ms);
        self.haptics(frame.now_ms);

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
            let gradient = Shader::Radial { center: point(cx, cy), radius: r, stops: draw2d::stops(&[Color::rgba8(255, 255, 255, 0x40), Color::TRANSPARENT]) };
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
            let sampler = draw2d::render::linear_sampler(device);
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
        draw2d::render::fullscreen_pass(encoder, "scrollable shapes", target, &gpu.compose, &gpu.bind.as_ref().unwrap().0);
        // The spin never settles, so the surface keeps drawing.
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
    let compose = draw2d::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
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
    let view = |label| draw2d::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
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
        // The torus is 1.2 times the target height.
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
        // The first dot is active: wide and white.
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
        // One page on: one selection.
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        // The bright points' mean x, device pixels.
        let centroid = |img: &fixture::Pixels| {
            let (mut sum, mut n) = (0.0f64, 0.0f64);
            for y in (0..img.height).step_by(4) {
                for x in (0..img.width).step_by(4) {
                    let p = img.at(x, y);
                    if p[0] as u32 + p[1] as u32 + p[2] as u32 > 450 {
                        sum += x as f64;
                        n += 1.0;
                    }
                }
            }
            sum / n.max(1.0)
        };
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        let rest_x = centroid(&rest);
        s.input(&pointer(PointerPhase::Down, 10.0, ms));
        let mut pulled = None;
        for k in 1..=40 {
            ms += 33.0;
            s.input(&pointer(PointerPhase::Move, 10.0 + 15.0 * k as f32, ms));
            pulled = Some(fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().0);
        }
        let pulled = pulled.unwrap();
        // Held 180 pt past the start, the band is 0.19 of a page: the morph runs on below 0 (softly)
        // and the shape stays in place.
        let agent = s.agent("").unwrap();
        let t: f64 = agent.split("\"t\":").nth(1).unwrap().trim_end_matches('}').parse().unwrap();
        assert!(t < -0.12 && t > -0.22, "{agent}");
        let moved = centroid(&pulled) - rest_x;
        assert!(moved.abs() < 40.0, "the shape moved {moved} px");
        assert_ne!(pulled.data, rest.data, "the shape deforms");
        ms += 200.0;
        s.input(&pointer(PointerPhase::Up, 610.0, ms));
        let end = ms + 3000.0;
        while ms < end {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.agent("").unwrap().starts_with("{\"scrollX\":0.00,"), "{}", s.agent("").unwrap());
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:impact-rigid"]);
    }
}
