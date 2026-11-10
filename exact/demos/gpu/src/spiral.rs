//! Spiral (src/animations/spiral): `floor(height × 1.8)` circles on a logarithmic spiral
//! (utils.ts: `a = i / 4`, `k = 0.005`, at `angle × i`), each of radius `1.2 − d / dmax`
//! (d its distance from the centre, dmax the half diagonal), filled with a sweep gradient
//! (cyan, magenta, yellow, cyan) and glowing (`ImageFilter.MakeMerge([MakeBlur(5, 5), null])`)
//! on #010101. A tap anywhere picks a random angle; every coordinate springs to the new spiral
//! (`withSpring({ duration: 3000, dampingRatio: 1 })`, spring-array.ts: reanimated's
//! `SpringArray`).
//!
//! Drawn as RN draws it: ONE path of `addCircle` conics (packages/skia: Graphite's 4× MSAA
//! fill, so the overlaps are a union and the outer, sub-pixel circles take quarter coverages),
//! into the Group's layer, which is encoded Display P3 as RN Skia's surface is: the gradient
//! mixes its stops in P3 (the arms' in-between hues: RN's (220, 93, 255), not sRGB's
//! (191, 64, 255)) and the blur mixes P3 values (an sRGB blur of the glow was up to 18 levels
//! off). The layer reaches the blur's radius past the canvas, as Skia sizes a filtered layer,
//! so the circles just off screen glow into its edges. Graphite's blur (`GraphiteBlur`), the
//! merge and the canvas in `spiral.wgsl`, converted to sRGB once.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, TapGesture};
use reanimated::SpringArray;
use skia::blur::{ceil_size, outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::spiral::{entry, module, Uniforms, BLURRED, CONTENT, GROUP_0, SMP, U};

const DURATION: f64 = 3000.0;
/// `MakeBlur(5, 5, …)`: σ in points.
const SIGMA: f32 = 5.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // pressto's PressableWithoutFeedback (absoluteFill) is RNGH's BaseButton: onPress at the
    // finger's lift unless cancelled, however long it was held or far it moved
    // (shouldCancelWhenOutside: false, and the button covers the screen).
    let tap = TapGesture::default().max_duration(f64::INFINITY);
    let mut renderer = Renderer::default();
    renderer.p3 = true;
    Box::new(Spiral {
        springs: None,
        count: 0,
        tap,
        taps: 0,
        canvas: Canvas::default(),
        renderer,
        blur: GraphiteBlur::default(),
        plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
        gpu: None,
    })
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

struct Spiral {
    springs: Option<SpringArray>,
    count: usize,
    tap: TapGesture,
    taps: u64,
    canvas: Canvas,
    renderer: Renderer,
    blur: GraphiteBlur,
    plan: GraphitePlan,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The layer's size (canvas + 2 × the blur's reach), px.
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    layer: wgpu::TextureView,
    empty: wgpu::TextureView,
    sampler: wgpu::Sampler,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
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
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
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
            self.springs = Some(SpringArray::new(positions(
                std::f64::consts::FRAC_PI_2,
                count,
            )));
        }
        let springs = self.springs.as_mut().unwrap();
        let moving = springs.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let sigma = SIGMA * s;
        // The layer: the device clip outset by the blur's reach (the merge's input bounds).
        let reach = ceil_size(3.0 * sigma);
        let size = (pw + 2 * reach as u32, ph + 2 * reach as u32);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size))
            != Some((format, frame.shader_generation, size))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, size));
        }
        // The Group: translate(width / 2, height / 2), the path, the SweepGradient at (0, 0).
        let max_distance =
            ((frame.width as f64 / 2.0).powi(2) + (frame.height as f64 / 2.0).powi(2)).sqrt();
        let current = &springs.current;
        self.canvas.begin(s);
        self.canvas.translate(
            reach as f32 / s + frame.width / 2.0,
            reach as f32 / s + frame.height / 2.0,
        );
        let colors = [
            Color::rgb8(0, 255, 255),
            Color::rgb8(255, 0, 255),
            Color::rgb8(255, 255, 0),
            Color::rgb8(0, 255, 255),
        ];
        let paint = Paint::shader(Shader::Sweep {
            center: point(0.0, 0.0),
            stops: stops(&colors),
        });
        self.canvas.draw_with(&paint, |b| {
            for i in 0..count {
                let (x, y) = (current[i * 2], current[i * 2 + 1]);
                // interpolate(distance, [0, max], [1.2, 0.2], CLAMP), inlined.
                let progress = ((x * x + y * y).sqrt() / max_distance).clamp(0.0, 1.0);
                skia::add_circle(b, x as f32, y as f32, (1.2 - progress) as f32);
            }
        });
        let gpu = self.gpu.as_mut().unwrap();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            &gpu.layer,
            GRAPHITE_FORMAT,
            size.0,
            size.1,
            wgpu::Color::TRANSPARENT,
        );
        let mut u = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            low: [0.0; 4],
            out: [0.0; 4],
            layer: [reach as f32, 0.0, 0.0, 0.0],
        };
        let mut view = gpu.empty.clone();
        let layer = outset([0, 0, pw as i32, ph as i32], reach, reach);
        if self.plan.update(layer, [0, 0, pw as i32, ph as i32], sigma) {
            let out = self.blur.run(
                device,
                queue,
                encoder,
                Placed {
                    view: &gpu.layer,
                    origin: [-reach, -reach],
                    size: [size.0, size.1],
                },
                &self.plan,
            );
            u.low = low_mapping(&self.plan, out.origin, out.size);
            u.out = self.plan.output.map(|v| v as f32);
            u.layer[1] = 1.0;
            view = out.view.clone();
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != view) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("spiral"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: U.binding,
                        resource: gpu.uniforms.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: CONTENT.binding,
                        resource: wgpu::BindingResource::TextureView(&gpu.layer),
                    },
                    wgpu::BindGroupEntry {
                        binding: BLURRED.binding,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                    wgpu::BindGroupEntry {
                        binding: SMP.binding,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                ],
            });
            gpu.bind = Some((view, group));
        }
        skia::render::fullscreen_pass(
            encoder,
            "spiral",
            target,
            &gpu.compose,
            &gpu.bind.as_ref().unwrap().1,
        );
        moving
    }
}

/// The blurred image's uv of a layer pixel: uv = p · xy + zw (as email-demo's).
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [
        kx / sw,
        ky / sh,
        (low[0] - src[0] * kx - origin[0] as f32) / sw,
        (low[1] - src[1] * ky - origin[1] as f32) / sh,
    ]
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    Gpu {
        format,
        generation,
        size,
        compose: skia::render::fullscreen_pipeline(
            device,
            &shader,
            &layout,
            entry::COMPOSE,
            format,
            None,
        ),
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("spiral"),
            size: Uniforms::SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }),
        layer: skia::render::sampled_target(
            device,
            "spiral layer",
            GRAPHITE_FORMAT,
            size.0,
            size.1,
        ),
        empty: skia::render::sampled_target(device, "spiral empty", GRAPHITE_FORMAT, 1, 1),
        sampler: skia::render::linear_sampler(device),
        bind: None,
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
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface();
        let (a, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("spiral-rest");
        assert!(!moving);
        let lit = (0..912)
            .step_by(4)
            .flat_map(|y| (0..420).step_by(4).map(move |x| (x, y)))
            .filter(|&(x, y)| a.at(x, y)[0] > 40 || a.at(x, y)[1] > 40)
            .count();
        // At π/2 the spiral is a cross: its four arms.
        assert!(lit > 100, "{lit} lit samples");
        // The lower arm sits a quarter of the sweep along, cyan → magenta mixed in Display P3:
        // RN's (220, 93, 255) on device, where an sRGB ramp is (191, 64, 255).
        let core = (520..700)
            .map(|y| a.at(210, y))
            .max_by_key(|p| p[0] as u32 + p[1] as u32 + p[2] as u32)
            .unwrap();
        assert!(
            (core[0] as i32 - 220).abs() <= 2 && (core[1] as i32 - 93).abs() <= 2 && core[2] >= 253,
            "{core:?}"
        );
        let tap = |phase, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x: 200.0,
            y: 400.0,
            dx: 0.0,
            dy: 0.0,
            kind: exact_gpu::PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
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
        // BaseButton's onPress: a press held 900 ms that wandered 80 pt still turns it.
        let at = |phase, x, at_ms| InputEvent::Pointer {
            id: 2,
            phase,
            x,
            y: 400.0,
            dx: 0.0,
            dy: 0.0,
            kind: exact_gpu::PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&at(exact_gpu::PointerPhase::Down, 100.0, ms));
        s.input(&at(exact_gpu::PointerPhase::Move, 180.0, ms + 400.0));
        s.input(&at(exact_gpu::PointerPhase::Up, 180.0, ms + 900.0));
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms + 950.0)).unwrap();
        assert!(moving, "a long press turns the spiral");
    }
}
