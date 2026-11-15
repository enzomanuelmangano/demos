//! Blur Cards (src/animations/blur-cards): five glass cards (300 × 200, radius 20 with Core
//! Animation's continuous corners, the owner's call over RN's circular arcs, at the
//! window's centre) over a blurred violet glow; a tap anywhere fans them out in 3D and blurs what
//! each covers, a second folds them back.
//!
//! - The background: a rect of the window with RadialGradient(centre, min(w, h) / 2, violet →
//!   black) under Blur 100 (decal), over black; drawn and blurred once per size.
//! - Card `index`: a Group about the window's centre with transform [rotate(−π/2 · p),
//!   translateX(25 · index · p), perspective(10000), rotateY(π/3 · p), rotate(π/4 · p)];
//!   inside, the fill, the stroke (opacity p) and BackdropBlur(blur = max(5p, 0), clip = card).
//! - progress: withSpring(progress > 0.5 ? 0 : 1, { duration, dampingRatio }) at each press of
//!   the full-screen PressableOpacity, RN's { 1500, 0.7 } made { 600, 0.85 } at the owner's request:
//!   90 % in 208 ms (RN 350), within 0.5 % from 425 ms (RN 908), overshoot 0.6 % (RN 4.6 %), so no
//!   lingering tail; the press is the app's (the input counts presses),
//!   the stiffness solved from where the spring is, as Reanimated does at the animation's start.
//!
//! Per frame while it moves: one full-screen pass over the blurred background. The backdrop
//! blurs are analytic (blur_cards.wgsl): what they blur is the glow, which a σ-5 blur leaves as
//! it is, and the cards' own edges, whose Gaussians are closed forms of their distances. The
//! earlier port ran a full-resolution Gaussian of the canvas per card and six full-screen passes
//! a frame (at 3× about 1.5 G texel reads a frame, far over a 120 Hz budget); this is one read
//! of the background a pixel.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Spring};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::blur_cards::{entry, module, Pass, BG, BLURRED, CUR, GROUP_0, SMP, U};

/// The card spring: RN's 1500 ms / ζ 0.7, made about 40 % faster for the owner (module docs).
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
    bg_blur: skia::Blur,
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
                // onStart: the velocity it has, dropped when it points away from the target.
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
        // The cards' transforms, σ and the stroke's opacity are the shader's, from p.
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
        // `cur` and `blurred` are the earlier multi-pass driver's; the background stands in.
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
        skia::render::fullscreen_pass(encoder, "blur cards", target, &gpu.pass, &bind);
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
        pass: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::CARD_PASS, format, None),
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("blur cards"), size: Pass::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        bg_source: skia::render::sampled_target(device, "blur cards background", LAYER, size.0, size.1),
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_shader_carries_skias_continuous_corner_verbatim() {
        let wgsl = include_str!("../shaders/blur_cards.wgsl");
        assert!(wgsl.contains(skia::CONTINUOUS_RRECT_SDF_WGSL), "paste skia::CONTINUOUS_RRECT_SDF_WGSL into blur_cards.wgsl again");
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
