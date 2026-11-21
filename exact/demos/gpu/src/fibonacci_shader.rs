//! A glowing fibonacci sphere on black, with a slider below it that sets the number of circles.
//!
//! - The slider is a track 0.8 x width with a white picker that grows while held; its travel maps to N in [5, 350].
//! - Shader time sweeps 0 to 15 and back, 20 s each way; `magicalMul` is input 0, 2.4 by default.
//! - Haptics: light when the pan takes the picker (not on a tap); rigid each time the drag pushes
//!   past an end, re-armed once it comes back inside. Steps of N play nothing.
//! - A second input N hands the slider to the Contract: no slider or touches, the sphere runs
//!   full-bleed and unmasked between the top row and the floating bar, and `native` is reported once.
//! - Each point is solved once per frame on the CPU, not per pixel; full-bleed, the field is a
//!   low-res far part plus a quad per point for its near part (matches the single pass to one 8-bit step).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture};
use motion::{interpolate_clamp, Spring, GENTLE};
use draw2d::{Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::fibonacci_shader::{entry, module, Uniforms, GROUP_0, POINTS, U};
use shaders::fibonacci_shader_compose as compose;

/// Largest circle count.
const MAX_N: f64 = 350.0;
const MIN_N: f64 = 5.0;
/// Space above the sphere, pt.
const TOP: f32 = 100.0;
const SLIDER_GAP: f32 = 80.0;
const TRACK: f32 = 4.0;
const PICKER: f32 = 35.0;
const REST_SCALE: f64 = 0.8;
/// How far back inside the track the drag must go before the end's rigid can play again, pt.
const REARM: f64 = 6.0;
/// Room taken by the top row and the floating bar, pt; the sphere centres between them.
const TOP_ROOM: f32 = 112.0;
const BAR_ROOM: f32 = 84.0;
/// Full-bleed square size in widths; the glow runs past the mask edge.
const FULL_BLEED_SCALE: f32 = 1.2;

/// The far field is drawn at 1 / FAR_DIV of the screen's size, per axis.
const FAR_DIV: f32 = 4.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // Per-point colours never change: cos(i + 0, 2, 4) + 1 packed as unorm8 over 0 to 2.
    let colors = (0..MAX_N as usize)
        .map(|i| {
            let c = [0.0, 2.0, 4.0].map(|k| ((((i as f64 + k).cos() + 1.0) / 2.0) * 255.0).round() as u32);
            c[0] | c[1] << 8 | c[2] << 16
        })
        .collect();
    Box::new(FibonacciShader { magic: 2.4, scale: Spring::at(REST_SCALE), colors, points: Vec::with_capacity(MAX_N as usize), ..Default::default() })
}

#[derive(Default)]
struct FibonacciShader {
    magic: f64,
    /// N from the Contract's native slider (input 1); when set, the layout is full-bleed.
    native: Option<f64>,
    said_native: bool,
    /// Picker offset, unclamped, and the clamped offset at drag start.
    translate_x: f64,
    context_x: f64,
    scale: Spring,
    pan: PanGesture,
    /// The drag is past an end of the track, and its rigid haptic has played.
    past_end: bool,
    posted: Vec<String>,
    /// Per-point colours, and the points as the shader reads them (kept so a frame allocates nothing).
    colors: Vec<u32>,
    points: Vec<[f32; 4]>,
    start_ms: Option<f64>,
    width: f32,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    full_bleed: bool,
    uniforms: wgpu::Buffer,
    points: wgpu::Buffer,
    bind: wgpu::BindGroup,
    /// The drawn-slider layout: every point at every pixel, masked.
    masked: Option<wgpu::RenderPipeline>,
    /// The full-bleed layout: the far field, the near quads, the compose.
    field: Option<Field>,
}

struct Field {
    far_pipeline: wgpu::RenderPipeline,
    near_pipeline: wgpu::RenderPipeline,
    compose_pipeline: wgpu::RenderPipeline,
    compose_layout: wgpu::BindGroupLayout,
    compose_uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The textures and what reads them, for a canvas of `size` device pixels.
    textures: Option<Textures>,
}

struct Textures {
    size: (u32, u32),
    far: wgpu::TextureView,
    near: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

impl FibonacciShader {
    fn slider_width(&self) -> f64 {
        self.width as f64 * 0.8
    }
    /// Picker offset, clamped to the track.
    fn clamped(&self) -> f64 {
        self.translate_x.clamp(0.0, self.slider_width())
    }
    /// N, derived from the clamped offset.
    fn n(&self) -> f64 {
        if let Some(n) = self.native {
            return n.clamp(MIN_N, MAX_N);
        }
        interpolate_clamp(self.clamped(), &[0.0, self.slider_width()], &[MIN_N, MAX_N])
    }
    /// Top-left corner of the track.
    fn track(&self) -> (f32, f32) {
        (self.width * 0.1, TOP + self.width + SLIDER_GAP)
    }
}

/// Shader time: sweeps 0 to 15 and back, 20 s each way.
fn itime(ms: f64) -> f64 {
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        15.0 * c / 20000.0
    } else {
        15.0 - 15.0 * (c - 20000.0) / 20000.0
    }
}

/// Solves each point's position and weight once (they depend only on time, N and the multiplier).
/// Writes one vec4 a point and returns the point count, ceil(N).
fn solve(out: &mut Vec<[f32; 4]>, colors: &[u32], t: f64, n: f64, mul: f64) -> usize {
    out.clear();
    let count = (n.ceil() as usize).min(colors.len());
    for (i, &color) in colors.iter().enumerate().take(count) {
        let i = i as f64;
        let a = i / (n * 0.5) - 1.0;
        let r = (1.0 - a * a).max(0.0).sqrt();
        let angle = i * mul + t;
        let (px, py) = (angle.cos() * r, (angle + 11.0).cos() * r);
        let k = 1.0 / (py + 2.0);
        out.push([(px * k) as f32, (a * k) as f32, ((1.0 - py) / (n * 75.0)) as f32, f32::from_bits(color)]);
    }
    count
}

fn as_bytes(data: &[[f32; 4]]) -> &[u8] {
    // [f32; 4] is plain old data: 16 bytes, no padding.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

impl Surface for FibonacciShader {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(m) = inputs.first().and_then(|v| v.as_number()) {
            self.magic = m;
        }
        if let Some(n) = inputs.get(1).and_then(|v| v.as_number()) {
            self.native = Some(n);
            if !self.said_native {
                self.said_native = true;
                self.posted.push("native".into());
            }
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        // The Contract's slider takes the touches.
        if self.native.is_some() {
            return;
        }
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // Picker hit area: a square at the bar's end, scaled with the picker.
        let (tx, ty) = self.track();
        let (cx, cy) = (tx + self.clamped() as f32, ty + TRACK / 2.0);
        let half = PICKER / 2.0 * self.scale.value as f32;
        let hit = (x - cx).abs() <= half && (y - cy).abs() <= half;
        let event = self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit);
        match event {
            Event::Begin { .. } => {
                self.scale.to(1.0, self.scale.velocity, GENTLE);
                self.context_x = self.clamped();
                self.past_end = false;
            }
            Event::Start(p) | Event::Update(p) => {
                if matches!(event, Event::Start(_)) {
                    self.posted.push("haptic:impact-light".into());
                }
                self.translate_x = self.context_x + p.translation_x as f64;
                let w = self.slider_width();
                let past = self.translate_x < 0.0 || self.translate_x > w;
                if past && !self.past_end {
                    self.posted.push("haptic:impact-rigid".into());
                    self.past_end = true;
                } else if self.translate_x > REARM && self.translate_x < w - REARM {
                    self.past_end = false;
                }
            }
            Event::End(p) => {
                self.translate_x = self.context_x + p.translation_x as f64;
                self.scale.to(REST_SCALE, self.scale.velocity, GENTLE);
            }
            Event::Fail => self.scale.to(REST_SCALE, self.scale.velocity, GENTLE),
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"n\":{},\"magicalMul\":{},\"held\":{},\"native\":{}}}", self.n(), self.magic, self.pan.tracking(), self.native.is_some()))
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
        self.width = frame.width;
        let start = *self.start_ms.get_or_insert(frame.now_ms);
        self.scale.step(frame.now_ms);
        let (pw, ph) = frame.pixels();

        if self.native.is_some() {
            return self.render_full_bleed(frame, device, queue, encoder, target, format, start);
        }

        let (tx, ty) = self.track();
        let w = self.slider_width() as f32;
        let clamped = self.clamped() as f32;
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        canvas.draw_rrect(tx, ty, w, TRACK, 5.0, &Paint::fill(Color::rgba8(255, 255, 255, 51)));
        canvas.draw_rect(tx, ty, clamped, TRACK, &Paint::fill(Color::WHITE));
        canvas.draw_circle(tx + clamped, ty + TRACK / 2.0, PICKER / 2.0 * self.scale.value as f32, &Paint::fill(Color::WHITE));
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);

        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.full_bleed)) != Some((format, frame.shader_generation, false)) {
            self.gpu = Some(build(device, format, frame.shader_generation, false));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let s = frame.scale;
        let side = frame.width;
        let n = self.n();
        let count = solve(&mut self.points, &self.colors, itime(frame.now_ms - start), n, self.magic);
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)], square: [0.0, TOP, side, 0.0], params: [count as f32, 0.0, 0.0, 0.0] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        queue.write_buffer(&gpu.points, 0, as_bytes(&self.points));
        let (y0, y1) = ((TOP * s).round().min(ph as f32) as u32, ((TOP + side) * s).round().min(ph as f32) as u32);
        if y1 > y0 {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("fibonacci shader"),
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
            pass.set_scissor_rect(0, y0, pw, y1 - y0);
            pass.set_pipeline(gpu.masked.as_ref().unwrap());
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..3, 0..1);
        }
        true
    }
}

impl FibonacciShader {
    /// Full-bleed layout in three passes: the far field at low res, the near parts as quads around
    /// the points, and the sum onto the target.
    #[allow(clippy::too_many_arguments)]
    fn render_full_bleed(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        start: f64,
    ) -> bool {
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.full_bleed)) != Some((format, frame.shader_generation, true)) {
            self.gpu = Some(build(device, format, frame.shader_generation, true));
        }
        let (pw, ph) = frame.pixels();
        let size = (pw.max(1), ph.max(1));
        let far_size = (((size.0 as f32 / FAR_DIV).ceil() as u32).max(1), ((size.1 as f32 / FAR_DIV).ceil() as u32).max(1));
        let side = (frame.width * FULL_BLEED_SCALE).min((frame.height - TOP_ROOM - BAR_ROOM).max(1.0));
        let centre = (TOP_ROOM + frame.height - BAR_ROOM) / 2.0;
        let n = self.n();
        let count = solve(&mut self.points, &self.colors, itime(frame.now_ms - start), n, self.magic);
        let gpu = self.gpu.as_mut().unwrap();
        let canvas = [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)];
        let uniforms = Uniforms { canvas, square: [(frame.width - side) / 2.0, centre - side / 2.0, side, 0.0], params: [count as f32, 1.0, far_size.0 as f32, far_size.1 as f32] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        queue.write_buffer(&gpu.points, 0, as_bytes(&self.points));
        let field = gpu.field.as_mut().unwrap();
        queue.write_buffer(&field.compose_uniforms, 0, &compose::Uniforms { canvas }.bytes());
        if field.textures.as_ref().map(|t| t.size) != Some(size) {
            let far = gfx::target(device, "fibonacci shader far", wgpu::TextureFormat::Rgba16Float, far_size.0, far_size.1);
            let near = gfx::target(device, "fibonacci shader near", wgpu::TextureFormat::Rgba16Float, size.0, size.1);
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("fibonacci shader compose"),
                layout: &field.compose_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: compose::U.binding, resource: field.compose_uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: compose::FAR.binding, resource: wgpu::BindingResource::TextureView(&far) },
                    wgpu::BindGroupEntry { binding: compose::NEAR.binding, resource: wgpu::BindingResource::TextureView(&near) },
                    wgpu::BindGroupEntry { binding: compose::SMP.binding, resource: wgpu::BindingResource::Sampler(&field.sampler) },
                ],
            });
            field.textures = Some(Textures { size, far, near, bind });
        }
        let textures = field.textures.as_ref().unwrap();
        gfx::pass(encoder, "fibonacci shader far", &textures.far, &field.far_pipeline, &gpu.bind);
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("fibonacci shader near"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &textures.near,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&field.near_pipeline);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..6, 0..count as u32);
        }
        gfx::pass(encoder, "fibonacci shader", target, &field.compose_pipeline, &textures.bind);
        true
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, full_bleed: bool) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fibonacci shader"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let points = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fibonacci shader points"), size: MAX_N as u64 * 16, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fibonacci shader"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }, wgpu::BindGroupEntry { binding: POINTS.binding, resource: points.as_entire_binding() }],
    });
    if !full_bleed {
        let masked = Some(draw2d::render::fullscreen_pipeline(device, &shader, &layout, entry::FS, format, None));
        return Gpu { format, generation, full_bleed, uniforms, points, bind, masked, field: None };
    }
    let half = wgpu::TextureFormat::Rgba16Float;
    let additive = wgpu::BlendState {
        color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
        alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
    };
    let far_pipeline = draw2d::render::fullscreen_pipeline(device, &shader, &layout, entry::FAR_FS, half, None);
    let near_pipeline = gfx::fullscreen(device, half, &shader, &layout, entry::NEAR_VS, entry::NEAR_FS, Some(additive), "fibonacci shader near");
    let compose_shader = device.create_shader_module(compose::module());
    let compose_layout = device.create_bind_group_layout(&compose::GROUP_0);
    let compose_pipeline = draw2d::render::fullscreen_pipeline(device, &compose_shader, &compose_layout, compose::entry::FS, format, None);
    let compose_uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fibonacci shader compose"), size: compose::Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = gfx::linear_sampler(device, "fibonacci shader");
    let field = Field { far_pipeline, near_pipeline, compose_pipeline, compose_layout, compose_uniforms, sampler, textures: None };
    Gpu { format, generation, full_bleed, uniforms, points, bind, masked: None, field: Some(field) }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_sphere_glows_in_its_circle_and_the_slider_sets_n() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(2.4)], None).unwrap();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("fibonacci-shader-5");
        assert!(animating);
        // Black outside the mask; the picker is white at the track's start.
        assert_eq!(&a.at(210, 50)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(3, 103)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(42, 602)[..3], &[255, 255, 255]);
        let lit = (100..520).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit > 50, "{lit} lit samples");
        // Drag the picker to the track's end: N = 350.
        let p = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 602.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&p(exact_gpu::PointerPhase::Down, 42.0, 10.0));
        for k in 1..=20 {
            s.input(&p(exact_gpu::PointerPhase::Move, 42.0 + k as f32 * 20.0, 10.0 + k as f64 * 16.0));
        }
        // Hovering on the end: no second rigid.
        for k in 0..20 {
            s.input(&p(exact_gpu::PointerPhase::Move, if k % 2 == 0 { 396.0 } else { 386.0 }, 330.0 + k as f64 * 3.0));
        }
        s.input(&p(exact_gpu::PointerPhase::Up, 420.0, 400.0));
        // The grab, then the track's end, once however far past it the finger goes.
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:impact-rigid"]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains("\"n\":350"), "{reply}");
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(5000.0)).unwrap();
        b.save("fibonacci-shader-350");
        assert_ne!(a.data, b.data);
        assert_eq!(&b.at(300, 602)[..3], &[255, 255, 255]);
    }

    #[test]
    fn a_native_n_hands_over_the_slider_and_goes_full_bleed() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(2.4)], None).unwrap();
        assert!(s.messages().is_empty());
        // `native` is reported once, however often the slider binds.
        s.bind(&[Value::Number(2.4), Value::Number(120.0)], None).unwrap();
        s.bind(&[Value::Number(2.4), Value::Number(400.0)], None).unwrap();
        assert_eq!(s.messages(), vec!["native"]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains("\"n\":350") && reply.contains("\"native\":true"), "{reply}");
        // Touches on the drawn track do nothing.
        let p = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 602.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&p(exact_gpu::PointerPhase::Down, 378.0, 10.0));
        s.input(&p(exact_gpu::PointerPhase::Move, 42.0, 30.0));
        s.input(&p(exact_gpu::PointerPhase::Up, 42.0, 50.0));
        assert!(s.messages().is_empty());
        s.bind(&[Value::Number(2.4), Value::Number(120.0)], None).unwrap();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(3000.0)).unwrap();
        a.save("fibonacci-shader-native-120");
        assert!(animating);
        // No drawn slider: the track's row holds no white bar or picker.
        assert!((20..400).all(|x| a.at(x, 602)[..3] != [255, 255, 255]));
        // Full-bleed: the glow reaches past the mask circle, with no hard edge at the square's top.
        let lit = |y0: u32, y1: u32| (y0..y1).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit(300, 640) > 100, "{} lit samples", lit(300, 640));
        let row = |y: u32| (0..420).map(|x| a.at(x, y)[..3].iter().map(|&c| c as i32).sum::<i32>()).sum::<i32>();
        assert!((row(99) - row(101)).abs() < 2000, "{} {}", row(99), row(101));
        s.bind(&[Value::Number(3.0), Value::Number(350.0)], None).unwrap();
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(3000.0)).unwrap();
        b.save("fibonacci-shader-native-350");
        assert_ne!(a.data, b.data);
    }

    /// Full-bleed as one pass summing every point at every pixel: the reference the far/near split must match.
    struct Direct(FibonacciShader);

    impl Surface for Direct {
        fn bind(&mut self, inputs: &[Value], at: Option<f64>) -> Result<(), SurfaceError> {
            self.0.bind(inputs, at)
        }
        fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
            let this = &mut self.0;
            let start = *this.start_ms.get_or_insert(frame.now_ms);
            if this.gpu.is_none() {
                this.gpu = Some(build(device, format, frame.shader_generation, false));
            }
            let gpu = this.gpu.as_ref().unwrap();
            let (pw, ph) = frame.pixels();
            let side = (frame.width * FULL_BLEED_SCALE).min((frame.height - TOP_ROOM - BAR_ROOM).max(1.0));
            let centre = (TOP_ROOM + frame.height - BAR_ROOM) / 2.0;
            let n = this.n();
            let count = solve(&mut this.points, &this.colors, itime(frame.now_ms - start), n, this.magic);
            let uniforms = Uniforms { canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)], square: [(frame.width - side) / 2.0, centre - side / 2.0, side, 0.0], params: [count as f32, 1.0, 0.0, 0.0] };
            queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
            queue.write_buffer(&gpu.points, 0, as_bytes(&this.points));
            gfx::pass(encoder, "direct", target, gpu.masked.as_ref().unwrap(), &gpu.bind);
            true
        }
    }

    #[test]
    fn the_full_bleed_field_is_the_effects_sum() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        for (scale, n, mul) in [(3.0f32, 350.0, 2.4), (3.0, 204.6, 57.3), (3.0, 5.0, 2.4), (1.0, 120.2, 31.1)] {
            let frame = |now_ms| Frame { width: 402.0, height: 874.0, scale, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
            let mut split = surface();
            let mut direct = Direct(FibonacciShader { colors: (0..MAX_N as usize).map(|i| { let c = [0.0, 2.0, 4.0].map(|k| ((((i as f64 + k).cos() + 1.0) / 2.0) * 255.0).round() as u32); c[0] | c[1] << 8 | c[2] << 16 }).collect(), magic: 2.4, ..Default::default() });
            for s in [split.as_mut(), &mut direct as &mut dyn Surface] {
                s.bind(&[Value::Number(mul), Value::Number(n)], None).unwrap();
                fixture::render(&gpu, s, &frame(0.0)).unwrap();
            }
            let (a, _) = fixture::render(&gpu, split.as_mut(), &frame(5000.0)).unwrap();
            let (b, _) = fixture::render(&gpu, &mut direct, &frame(5000.0)).unwrap();
            let (mut worst, mut sum, mut count, mut off) = (0, 0i64, 0i64, 0);
            for py in 0..a.height {
                for px in 0..a.width {
                    for k in 0..3 {
                        let d = (a.at(px, py)[k] as i32 - b.at(px, py)[k] as i32).abs();
                        worst = worst.max(d);
                        sum += d as i64;
                        count += 1;
                        off += (d > 1) as i32;
                    }
                }
            }
            eprintln!("scale {scale} n {n}: worst {worst}, mean {:.5}, over 1: {off} of {count}", sum as f64 / count as f64);
            assert!(worst <= 2, "scale {scale} n {n}: worst {worst}");
        }
    }
}
