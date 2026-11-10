//! Dot Sheet's background (src/animations/dot-sheet/src/components/background-gradient.tsx):
//! a window-sized canvas whose `<Fill>` is a SweepGradient about the centre (GRADIENT_COLORS:
//! #cda2a8, #daacb2, #A9828D, #d5b1b7, #cfb5b9, #eac5bd, #F0EEF1, #F0EEF1, #FFFFFF, evenly
//! spaced, clockwise from +x) under `<Blur blur={55} />` (sigma 55 points, decal: the fill
//! fades to transparent at the canvas's edges, where the demo's backdrop shows). It never
//! moves: drawn and blurred once per size, then only put into the target.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::dot_sheet::{entry, module, Uniforms, GLOW, GROUP_0, SMP, U};

const GRADIENT_COLORS: [&str; 9] = ["#cda2a8", "#daacb2", "#A9828D", "#d5b1b7", "#cfb5b9", "#eac5bd", "#F0EEF1", "#F0EEF1", "#FFFFFF"];
/// `<Blur blur={55} />`.
const BLUR: f32 = 55.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(DotSheet::default())
}

#[derive(Default)]
struct DotSheet {
    layer: Canvas,
    renderer: Renderer,
    blur: skia::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    _uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl Surface for DotSheet {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
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
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            // Once per size: the sweep fill into a layer, blurred.
            let (w, h) = (frame.width, frame.height);
            let source = skia::render::sampled_target(device, "dot sheet fill", LAYER, pw, ph);
            let colors: Vec<Color> = GRADIENT_COLORS.iter().map(|c| Color::parse(c)).collect();
            self.layer.begin(frame.scale);
            self.layer.draw_rect(0.0, 0.0, w, h, &Paint::shader(Shader::Sweep { center: point(w / 2.0, h / 2.0), stops: stops(&colors) }));
            self.renderer.draw(device, queue, encoder, &self.layer, &source, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
            let glow = self.blur.run(device, queue, encoder, &source, LAYER, pw, ph, BLUR * frame.scale);
            let shader = device.create_shader_module(module());
            let layout = device.create_bind_group_layout(&GROUP_0);
            let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("dot sheet"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
            queue.write_buffer(&uniforms, 0, &Uniforms { flags: [gfx::srgb_flag(format), 0.0, 0.0, 0.0] }.bytes());
            let sampler = skia::render::linear_sampler(device);
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("dot sheet"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: GLOW.binding, resource: wgpu::BindingResource::TextureView(glow) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                ],
            });
            self.gpu = Some(Gpu { format, generation: frame.shader_generation, size: (pw, ph), compose, _uniforms: uniforms, bind });
        }
        let gpu = self.gpu.as_ref().unwrap();
        skia::render::fullscreen_pass(encoder, "dot sheet", target, &gpu.compose, &gpu.bind);
        false
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_sweep_is_blurred_and_fades_at_the_edges() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (a, moving) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        a.save("dot-sheet");
        assert!(!moving);
        // Inside, opaque; at a corner about a quarter covered (decal on two sides).
        assert_eq!(a.at(210, 456)[3], 255);
        let corner = a.at(0, 0)[3];
        assert!((40..100).contains(&corner), "{corner}");
        // Below the centre (90°: between #daacb2 and #A9828D) is pinker and darker than above
        // it (270°: #F0EEF1 to #FFFFFF).
        let (below, above) = (a.at(210, 800), a.at(210, 110));
        assert!(below[1] < above[1], "{below:?} {above:?}");
        // Redrawn the same, without blurring again.
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        assert_eq!(a.data, b.data);
    }
}
