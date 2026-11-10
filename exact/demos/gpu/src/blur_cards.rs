//! Blur Cards (src/animations/blur-cards): five glass cards (300 × 200, radius 20, at the
//! window's centre) over a blurred violet glow; a tap anywhere fans them out in 3D and blurs what
//! each covers, a second folds them back.
//!
//! - The background: a rect of the window with RadialGradient(centre, min(w, h) / 2, violet →
//!   black) under Blur 100 (decal), over black; drawn and blurred once per size.
//! - Card `index`: a Group about the window's centre with transform [rotate(−π/2 · p),
//!   translateX(25 · index · p), perspective(10000), rotateY(π/3 · p), rotate(π/4 · p)];
//!   inside, the fill, the stroke (opacity p) and BackdropBlur(blur = max(5p, 0), clip = card).
//! - progress: withSpring(progress > 0.5 ? 0 : 1, { duration: 1500, dampingRatio: 0.7 }) at each
//!   press of the full-screen PressableOpacity; the press is the app's (the input counts presses),
//!   the stiffness solved from where the spring is, as Reanimated does at the animation's start.
//!
//! Per frame while it moves: one pass per card boundary (see blur_cards.wgsl) and one Blur of
//! the canvas so far per card, as Skia runs each BackdropBlur on what is under it.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Spring};
use skia::{point, stops, Canvas, Color, Matrix4, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::blur_cards::{entry, module, Pass, BG, BLURRED, CUR, GROUP_0, SMP, U};

const CARDS: usize = 5;
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
    blur: skia::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    pass: wgpu::RenderPipeline,
    /// The same pass writing the target.
    last: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    /// One per pass (the queue's writes all land before the frame's commands).
    uniforms: Vec<wgpu::Buffer>,
    /// The canvas so far, ping-ponged.
    canvas: [wgpu::TextureView; 2],
    /// The background's source (before its blur).
    bg_source: wgpu::TextureView,
}

/// Card `index`'s group transform at `p`, about the window's centre (cx, cy).
fn card_matrix(index: usize, p: f32, cx: f32, cy: f32) -> skia::Matrix3 {
    use std::f32::consts::PI;
    Matrix4::rotate_z(-PI / 2.0 * p)
        .multiply(Matrix4::translate(25.0 * index as f32 * p, 0.0, 0.0))
        .multiply(Matrix4::perspective(10000.0))
        .multiply(Matrix4::rotate_y(PI / 3.0 * p))
        .multiply(Matrix4::rotate_z(PI / 4.0 * p))
        .pivot(cx, cy)
        .to_matrix3()
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
                self.progress.to(to, v, duration_config(p - to, v, 1500.0, 0.7, 4.0));
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
        let sigma = (5.0 * p).max(0.0) * s;
        let (cx, cy) = (w / 2.0, h / 2.0);
        let rows = |i: usize| card_matrix(i, p, cx, cy).invert().unwrap_or(skia::Matrix3([0.0; 9])).rows();
        let none = [[0.0f32; 4]; 3];
        let srgb = gfx::srgb_flag(format);
        // Pass k: card k − 1's backdrop blur ends, card k is drawn.
        for k in 0..=CARDS {
            let prev = if k > 0 { rows(k - 1) } else { none };
            let next = if k < CARDS { rows(k) } else { none };
            let last = k == CARDS;
            let uniforms = Pass {
                prev0: prev[0],
                prev1: prev[1],
                prev2: prev[2],
                next0: next[0],
                next1: next[1],
                next2: next[2],
                flags: [(k > 0) as u32 as f32, (k < CARDS) as u32 as f32, p, (k == 0) as u32 as f32],
                canvas: [pw as f32, ph as f32, s, if last { srgb } else { 0.0 }],
                rect: [cx, cy, CARD_W / 2.0, CARD_H / 2.0],
            };
            queue.write_buffer(&gpu.uniforms[k], 0, &uniforms.bytes());
            let cur = &gpu.canvas[(k + 1) % 2];
            let blurred = if k > 0 && sigma > 0.0 { self.blur.run(device, queue, encoder, cur, LAYER, pw, ph, sigma) } else { cur };
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("blur cards"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms[k].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: CUR.binding, resource: wgpu::BindingResource::TextureView(cur) },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred) },
                    wgpu::BindGroupEntry { binding: BG.binding, resource: wgpu::BindingResource::TextureView(bg) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            if last {
                skia::render::fullscreen_pass(encoder, "blur cards", target, &gpu.last, &bind);
            } else {
                skia::render::fullscreen_pass(encoder, "blur cards", &gpu.canvas[k % 2], &gpu.pass, &bind);
            }
        }
        moving
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pass = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::CARD_PASS, LAYER, None);
    let last = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::CARD_PASS, format, None);
    let view = |label| skia::render::sampled_target(device, label, LAYER, size.0, size.1);
    Gpu {
        format,
        generation,
        size,
        pass,
        last,
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: (0..=CARDS)
            .map(|_| device.create_buffer(&wgpu::BufferDescriptor { label: Some("blur cards"), size: Pass::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }))
            .collect(),
        canvas: [view("blur cards a"), view("blur cards b")],
        bg_source: view("blur cards background"),
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

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
