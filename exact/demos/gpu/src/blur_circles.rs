//! Blur Circles (src/animations/blur-circles): a sweep-gradient circle (cyan, magenta, yellow,
//! cyan about (50, 128)) and a glass circle, both RADIUS 80, wandering about the screen's
//! centre on simplex noise (constants.ts: FREQUENCY 1800, A 30; the glass at 2×FREQUENCY and
//! 3×A, each on its own permutation table). The clock runs 0 → 20000 → 0 forever
//! (withRepeat(withTiming(20000, { duration: 20000 }), -1, true): Easing.inOut(quad)).
//! Inside the glass the circle is blurred (Blur 10), outside it is sharp; the glass shades its
//! inside (BlurMask 20, "inner") and has a white hairline.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::Easing;
use simplex_noise::{Noise2D, Random};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::blur_circles::{entry, module, Uniforms, GROUP_0, INSIDE, MASK, SHARP, SMP, U};

const RADIUS: f32 = 80.0;
const FREQUENCY: f64 = 1800.0;
const A: f64 = 30.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurCircles::default())
}

#[derive(Default)]
struct BlurCircles {
    noise: Option<(Noise2D, Noise2D)>,
    start_ms: Option<f64>,
    layers: [Canvas; 3],
    renderers: [Renderer; 3],
    blurs: [skia::Blur; 2],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// inside (before its blur), sharp, mask (before its blur).
    views: [wgpu::TextureView; 3],
}

/// withRepeat(withTiming(20000, { duration: 20000 }), -1, true).
fn clock(ms: f64) -> f64 {
    let ease = Easing::timing_default();
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        20000.0 * ease.at(c / 20000.0)
    } else {
        20000.0 - 20000.0 * ease.at((c - 20000.0) / 20000.0)
    }
}

impl Surface for BlurCircles {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
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
        let start = *self.start_ms.get_or_insert(frame.now_ms);
        let (noise, second) = self.noise.get_or_insert_with(|| {
            let mut random = Random::new(frame.now_ms.to_bits());
            (Noise2D::new(|| random.next()), Noise2D::new(|| random.next()))
        });
        let t = clock(frame.now_ms - start);
        let (cx, cy) = (frame.width as f64 / 2.0, frame.height as f64 / 2.0);
        let c1 = ((A * noise.at(t / FREQUENCY, 0.0) + cx) as f32, (A * noise.at(0.0, t / FREQUENCY) + cy) as f32);
        let c2 = ((3.0 * A * second.at(t / (2.0 * FREQUENCY), 0.0) + cx) as f32, (3.0 * A * second.at(0.0, t / (2.0 * FREQUENCY)) + cy) as f32);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let sweep = Paint::shader(Shader::Sweep {
            center: point(50.0, 128.0),
            stops: stops(&[Color::parse("cyan"), Color::parse("magenta"), Color::parse("yellow"), Color::parse("cyan")]),
        });
        // inside: the sweep circle clipped to the glass; sharp: the sweep circle; mask: the glass.
        for (i, layer) in self.layers.iter_mut().enumerate() {
            layer.begin(frame.scale);
            match i {
                0 => {
                    layer.save();
                    layer.clip_rrect(c2.0 - RADIUS, c2.1 - RADIUS, 2.0 * RADIUS, 2.0 * RADIUS, RADIUS);
                    layer.draw_circle(c1.0, c1.1, RADIUS, &sweep);
                    layer.restore();
                }
                1 => layer.draw_circle(c1.0, c1.1, RADIUS, &sweep),
                _ => layer.draw_circle(c2.0, c2.1, RADIUS, &Paint::fill(Color::WHITE)),
            }
            self.renderers[i].draw(device, queue, encoder, layer, &gpu.views[i], LAYER, pw, ph, wgpu::Color::TRANSPARENT);
        }
        let s = frame.scale;
        let [blur_inside, blur_mask] = &mut self.blurs;
        let inside = blur_inside.run(device, queue, encoder, &gpu.views[0], LAYER, pw, ph, 10.0 * s);
        let mask = blur_mask.run(device, queue, encoder, &gpu.views[2], LAYER, pw, ph, 20.0 * s);
        let uniforms = Uniforms { glass: [c2.0 * s, c2.1 * s, RADIUS * s, s], canvas: [pw as f32, ph as f32, gfx::srgb_flag(format), 0.0] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blur circles"),
            layout: &gpu.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: INSIDE.binding, resource: wgpu::BindingResource::TextureView(inside) },
                wgpu::BindGroupEntry { binding: SHARP.binding, resource: wgpu::BindingResource::TextureView(&gpu.views[1]) },
                wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(mask) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        skia::render::fullscreen_pass(encoder, "blur circles", target, &gpu.compose, &bind);
        true
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let view = |label| skia::render::sampled_target(device, label, LAYER, size.0, size.1);
    Gpu {
        format,
        generation,
        size,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("blur circles"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        sampler: skia::render::linear_sampler(device),
        views: [view("blur circles inside"), view("blur circles sharp"), view("blur circles mask")],
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_glass_blurs_what_it_covers() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(1000.0)).unwrap();
        a.save("blur-circles-0");
        assert!(animating);
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(9000.0)).unwrap();
        b.save("blur-circles-8s");
        // White far from the circles; colour at the centre.
        assert_eq!(&a.at(10, 10)[..3], &[255, 255, 255]);
        assert!(a.at(210, 456)[..3] != [255, 255, 255]);
        assert_ne!(a.data, b.data);
    }
}
