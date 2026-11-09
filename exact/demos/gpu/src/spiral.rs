//! Spiral (src/animations/spiral): `floor(height × 1.8)` circles on a logarithmic spiral
//! (utils.ts: `a = i / 4`, `k = 0.005`, at `angle × i`), each of radius `1.2 − d / dmax`
//! (d its distance from the centre, dmax the half diagonal), filled with a sweep gradient
//! (cyan, magenta, yellow, cyan) and glowing (`ImageFilter.MakeMerge([MakeBlur(5, 5), null])`)
//! on #010101. A tap anywhere picks a random angle; every coordinate springs to the new spiral
//! (`withSpring({ duration: 3000, dampingRatio: 1 })`, spring-array.ts: reanimated's
//! `SpringArray`).
//!
//! The circles are instances of one quad (no tessellation); the glow is skia's `Blur` at a
//! third of the resolution.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, TapGesture};
use reanimated::SpringArray;

use crate::{gfx, shaders};
use shaders::spiral::{entry, module, Uniforms, CIRCLES, GLOW, GROUP_0, GROUP_1, SMP, SRC, U};

const DURATION: f64 = 3000.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Spiral::default())
}

fn positions(angle: f64, count: usize) -> Vec<f64> {
    let mut out = Vec::with_capacity(count * 2);
    for i in 0..count {
        let a = i as f64 / 4.0;
        let r = a * (0.005 * angle).exp();
        out.push(r * (angle * i as f64).cos());
        out.push(r * (angle * i as f64).sin());
    }
    out
}

#[derive(Default)]
struct Spiral {
    springs: Option<SpringArray>,
    count: usize,
    tap: TapGesture,
    taps: u64,
    data: Vec<[f32; 4]>,
    gpu: Option<Gpu>,
    blur: skia::Blur,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    dots: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    circles: wgpu::Buffer,
    group0: wgpu::BindGroup,
    layout1: wgpu::BindGroupLayout,
    layer: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

impl Spiral {
    /// A new random angle: Math.random() from the tap's clock and count (xorshift).
    fn random(&mut self, at_ms: f64) -> f64 {
        self.taps += 1;
        let mut x = (at_ms.to_bits() ^ self.taps.wrapping_mul(0x9E37_79B9_7F4A_7C15)) | 1;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        (x >> 11) as f64 / (1u64 << 53) as f64
    }
}

impl Surface for Spiral {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn opaque(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if let Event::Tap { .. } = self.tap.event(id, gfx::phase(phase), x, y, at_ms, true) {
            let angle = std::f64::consts::TAU * self.random(at_ms);
            let target = positions(angle, self.count);
            if let Some(springs) = self.springs.as_mut() {
                springs.retarget(&target, DURATION);
            }
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
        // RN reads the window once: the circle count is the screen's height × 1.8.
        let count = (frame.height as f64 * 1.8).floor() as usize;
        if self.springs.is_none() || count != self.count {
            self.count = count;
            self.springs = Some(SpringArray::new(positions(std::f64::consts::FRAC_PI_2, count)));
        }
        let springs = self.springs.as_mut().unwrap();
        let moving = springs.step(frame.now_ms);
        let max_distance = ((frame.width as f64 / 2.0).powi(2) + (frame.height as f64 / 2.0).powi(2)).sqrt();
        self.data.clear();
        for i in 0..count {
            let (x, y) = (springs.current[i * 2], springs.current[i * 2 + 1]);
            let progress = ((x * x + y * y).sqrt() / max_distance).clamp(0.0, 1.0);
            self.data.push([x as f32, y as f32, (1.2 - progress) as f32, 0.0]);
        }
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size, g.circles.size())) != Some((format, frame.shader_generation, (pw, ph), (count * 16) as u64)) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph), count));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        queue.write_buffer(&gpu.circles, 0, bytemuck_cast(&self.data));
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("spiral dots"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &gpu.layer,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.dots);
            pass.set_bind_group(0, &gpu.group0, &[]);
            pass.draw(0..6, 0..count as u32);
        }
        // Blur(5): sigma 5 points.
        let glow = self.blur.run(device, queue, encoder, &gpu.layer, LAYER, pw, ph, 5.0 * frame.scale);
        let group1 = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("spiral compose"),
            layout: &gpu.layout1,
            entries: &[
                wgpu::BindGroupEntry { binding: SRC.binding, resource: wgpu::BindingResource::TextureView(&gpu.layer) },
                wgpu::BindGroupEntry { binding: GLOW.binding, resource: wgpu::BindingResource::TextureView(glow) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("spiral"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.compose);
            pass.set_bind_group(0, &gpu.group0, &[]);
            pass.set_bind_group(1, &group1, &[]);
            pass.draw(0..3, 0..1);
        }
        moving
    }
}

fn bytemuck_cast(data: &[[f32; 4]]) -> &[u8] {
    // [f32; 4] is plain old data: 16 bytes, no padding.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), count: usize) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout0 = device.create_bind_group_layout(&GROUP_0);
    let layout1 = device.create_bind_group_layout(&GROUP_1);
    let pipeline = |layouts: &[Option<&wgpu::BindGroupLayout>], vs: &str, fs: &str, target: wgpu::TextureFormat, blend| {
        let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("spiral"), bind_group_layouts: layouts, immediate_size: 0 });
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("spiral"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &shader, entry_point: Some(vs), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some(fs),
                targets: &[Some(wgpu::ColorTargetState { format: target, blend, write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        })
    };
    let dots = pipeline(&[Some(&layout0)], entry::DOT_VS, entry::DOT_FS, LAYER, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING));
    let compose = pipeline(&[Some(&layout0), Some(&layout1)], entry::VS, entry::COMPOSE, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("spiral uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let circles = device.create_buffer(&wgpu::BufferDescriptor { label: Some("spiral circles"), size: (count.max(1) * 16) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let group0 = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("spiral"),
        layout: &layout0,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: CIRCLES.binding, resource: circles.as_entire_binding() },
        ],
    });
    Gpu {
        format,
        generation,
        size,
        dots,
        compose,
        uniforms,
        circles,
        group0,
        layout1,
        layer: skia::render::sampled_target(device, "spiral layer", LAYER, size.0, size.1),
        sampler: skia::render::linear_sampler(device),
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_spiral_glows_and_springs_to_a_new_angle() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (a, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("spiral-rest");
        assert!(!moving);
        let lit = (0..912).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[0] > 40 || a.at(x, y)[1] > 40).count();
        // At π/2 the spiral is a cross: its four arms.
        assert!(lit > 100, "{lit} lit samples");
        let tap = |phase, at_ms| InputEvent::Pointer { id: 1, phase, x: 200.0, y: 400.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&tap(exact_gpu::PointerPhase::Down, 10.0));
        s.input(&tap(exact_gpu::PointerPhase::Up, 60.0));
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(100.0)).unwrap();
        assert!(moving);
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(800.0)).unwrap();
        b.save("spiral-moving");
        assert_ne!(a.data, b.data);
        let mut ms = 800.0;
        while ms < 8000.0 {
            ms += 64.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (c, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        c.save("spiral-settled");
        assert!(!moving);
    }
}
