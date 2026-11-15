//! Blur cards: five glass cards at the window's centre, over a blurred violet glow. A press fans
//! them out in 3D and blurs what each covers. The next press folds them back.
//!
//! - The background is a radial glow, drawn and blurred once per size.
//! - Each card is a rounded rect with continuous corners, turned about the centre. Its blur covers
//!   what lies behind it.
//! - Each press starts the spring. It keeps the running velocity, unless that points away from its
//!   target.
//!
//! Per frame while it moves, one full-screen pass reads the background once per pixel. The backdrop
//! blurs are analytic: the glow barely changes under a σ-5 blur, and each card's edges have
//! closed-form Gaussians. A full-resolution Gaussian per card would not fit a 120 Hz frame.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use motion::{duration_config, Spring};
use draw2d::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::blur_cards::{entry, module, Pass, BG, BLURRED, CUR, GROUP_0, SMP, U};

/// Card spring: 600 ms, damping ratio 0.85.
const DURATION_MS: f64 = 600.0;
const DAMPING_RATIO: f64 = 0.85;
const CARD_W: f32 = 300.0;
const CARD_H: f32 = 200.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurCards::default())
}

#[derive(Default)]
struct BlurCards {
    presses: Option<f64>,
    progress: Spring,
    bg_layer: Canvas,
    bg_renderer: Renderer,
    bg_blur: draw2d::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    pass: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    /// The background's source (before its blur).
    bg_source: wgpu::TextureView,
}

impl Surface for BlurCards {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let presses = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        match self.presses {
            None => self.presses = Some(presses),
            Some(last) if last != presses => {
                self.presses = Some(presses);
                let p = self.progress.value;
                let to = if p > 0.5 { 0.0 } else { 1.0 };
                // Keep the velocity unless it points away from the target.
                let v = self.progress.velocity;
                let v = if (to > p && v < 0.0) || (to < p && v > 0.0) { 0.0 } else { v };
                self.progress.to(to, v, duration_config(p - to, v, DURATION_MS, DAMPING_RATIO, 4.0));
            }
            _ => {}
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.4},\"target\":{}}}", self.progress.value, self.progress.target()))
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
        let moving = self.progress.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let (w, h) = (frame.width, frame.height);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
            // The background, once: the gradient rect, blurred (σ 100).
            let gpu = self.gpu.as_ref().unwrap();
            let c = &mut self.bg_layer;
            c.begin(s);
            let glow = Shader::Radial { center: point(w / 2.0, h / 2.0), radius: w.min(h) / 2.0, stops: stops(&[Color::parse("violet"), Color::parse("black")]) };
            c.draw_rect(0.0, 0.0, w, h, &Paint::shader(glow));
            self.bg_renderer.draw(device, queue, encoder, c, &gpu.bg_source, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
            self.bg_blur.run(device, queue, encoder, &gpu.bg_source, LAYER, pw, ph, 100.0 * s);
        }
        let gpu = self.gpu.as_ref().unwrap();
        let Some(bg) = self.bg_blur.output() else { return false };
        let p = self.progress.value as f32;
        // The shader derives the cards' transforms, blur and stroke from p.
        let none = [0.0f32; 4];
        let uniforms = Pass {
            prev0: none,
            prev1: none,
            prev2: none,
            next0: none,
            next1: none,
            next2: none,
            flags: [0.0, 0.0, p, 1.0],
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            rect: [w / 2.0, h / 2.0, CARD_W / 2.0, CARD_H / 2.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        // The shader's other inputs are unused: the background stands in for them.
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blur cards"),
            layout: &gpu.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: CUR.binding, resource: wgpu::BindingResource::TextureView(bg) },
                wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(bg) },
                wgpu::BindGroupEntry { binding: BG.binding, resource: wgpu::BindingResource::TextureView(bg) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        draw2d::render::fullscreen_pass(encoder, "blur cards", target, &gpu.pass, &bind);
        moving
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    Gpu {
        format,
        generation,
        size,
        pass: draw2d::render::fullscreen_pipeline(device, &shader, &layout, entry::CARD_PASS, format, None),
        layout,
        sampler: draw2d::render::linear_sampler(device),
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("blur cards"), size: Pass::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        bg_source: draw2d::render::sampled_target(device, "blur cards background", LAYER, size.0, size.1),
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_shader_carries_skias_continuous_corner_verbatim() {
        let wgsl = include_str!("../shaders/blur_cards.wgsl");
        assert!(wgsl.contains(draw2d::CONTINUOUS_RRECT_SDF_WGSL), "paste draw2d::CONTINUOUS_RRECT_SDF_WGSL into blur_cards.wgsl again");
    }

    #[test]
    fn a_press_fans_the_cards_out_and_another_folds_them() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("blur-cards-rest");
        assert!(!animating);
        // Five fills of 0.1 white stacked at the centre, over the glow: brighter than outside.
        let inside = rest.at(210, 456);
        let outside = rest.at(210, 456 + 120);
        assert!(inside[1] > outside[1] + 60, "{inside:?} {outside:?}");
        // The corner is black (the glow fades out well before it).
        assert_eq!(&rest.at(2, 2)[..3], &[0, 0, 0]);

        s.bind(&[Value::Number(1.0)], None).unwrap();
        let mut ms = 0.0;
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (open, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        open.save("blur-cards-open");
        assert!(!animating);
        assert!(s.agent("{}").unwrap().starts_with("{\"progress\":1.0000"));
        // Fanned out: the cards turned upright (−90°), so the band above the centre is glass now
        // and the far left of the centre row is not.
        assert!(open.at(210, 456 - 130)[1] > rest.at(210, 456 - 130)[1] + 10);
        assert_ne!(open.data, rest.data);

        s.bind(&[Value::Number(2.0)], None).unwrap();
        while ms < 8000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (closed, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        assert_eq!(closed.data, rest.data);
    }
}
