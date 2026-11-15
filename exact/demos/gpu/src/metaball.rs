//! Metaball (src/animations/metaball/index.tsx): two circles (RADIUS 80) whose union is
//! blurred (BLUR 30) and thresholded into one liquid shape, filled with a sweep gradient from
//! the canvas's corner (cyan, blue, cyan) on #0A0A0A. Both start at the screen's centre; each
//! follows a finger. The first stays where it is dropped; the second springs back to the centre
//! (`withSpring`, Reanimated 4's default). A touch goes to the first circle if it is under the
//! finger, else to the second (RN's Touchable order: "the first one registered, i.e. rendered").
//!
//! Everything runs in this surface: the pans, the spring and the drawing, as RN Skia draws it:
//! the circles one path (`addCircle` twice: Graphite's 4× MSAA) with the SweepGradient mixed in
//! Display P3, into an 8-bit layer; the layer is the Group's clip (`layerClip`, the circles'
//! bounds + LAYER_MARGIN, within the screen) outset by the blur's reach, as Skia sizes a filtered
//! layer; Graphite's blur of it (`skia::blur::GraphiteBlur`: downscaled to σ 4, σ 90 px at 3×),
//! then the ColorMatrix and Core Animation's P3 → sRGB (`shaders/metaball.wgsl`).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Spring, SpringConfig};

/// The release spring (the owner's call): damping ratio 1, SwiftUI's `.spring(duration: 0.5,
/// bounce: 0)`: mass 1, stiffness (2π / 0.5)², damping 2√k.
const RELEASE: SpringConfig = SpringConfig { stiffness: 157.913_670_417_429_7, damping: 25.132_741_228_718_345, mass: 1.0 };
use skia::blur::{ceil_size, intersect, outset, round_out, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::metaball::{entry, module, Uniforms, BLURRED, GROUP_0, SMP, U};

const RADIUS: f32 = 80.0;
const BLUR: f32 = 30.0;
/// `RADIUS + 3 * BLUR + 2`: the layer clip's margin around the circles' centres.
const LAYER_MARGIN: f32 = RADIUS + 3.0 * BLUR + 2.0;
/// The ColorMatrix's alpha row: 60 a − 30.
const ALPHA_SCALE: f32 = 60.0;
const ALPHA_BIAS: f32 = -30.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Metaball::default())
}

struct Draw {
    canvas: Canvas,
    renderer: Renderer,
    blur: GraphiteBlur,
    plan: GraphitePlan,
}

impl Default for Draw {
    fn default() -> Draw {
        let mut renderer = Renderer::default();
        renderer.p3 = true;
        Draw { canvas: Canvas::default(), renderer, blur: GraphiteBlur::default(), plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap() }
    }
}

#[derive(Default)]
struct Metaball {
    size: (f32, f32),
    first: (f32, f32),
    second: (Spring, Spring),
    first_pan: PanGesture,
    second_pan: PanGesture,
    first_from: (f32, f32),
    second_from: (f32, f32),
    /// Whether a finger has moved a circle yet: until then both sit at the canvas's centre,
    /// whatever size the canvas is laid out at (RN reads the window's size once).
    touched: bool,
    dirty: bool,
    draw: Draw,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The layer texture's size: the canvas + the blur's reach on every side, px.
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    layer: wgpu::TextureView,
    empty: wgpu::TextureView,
    sampler: wgpu::Sampler,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

impl Metaball {
    fn centre(&self) -> (f32, f32) {
        (self.size.0 / 2.0, self.size.1 / 2.0)
    }
}

impl Surface for Metaball {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"size\":[{},{}],\"first\":[{},{}],\"second\":[{},{}],\"touched\":{}}}",
            self.size.0, self.size.1, self.first.0, self.first.1, self.second.0.value, self.second.1.value, self.touched
        ))
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn opaque(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        let hit = |c: (f32, f32)| (x - c.0).hypot(y - c.1) <= RADIUS;
        let second = (self.second.0.value as f32, self.second.1.value as f32);
        let on_first = hit(self.first) && !self.second_pan.tracking();
        let on_second = !on_first && hit(second) && !self.first_pan.tracking();
        match self.first_pan.event(id, phase, x, y, at_ms, on_first) {
            Event::Begin { .. } => {
                self.first_from = self.first;
                self.touched = true;
            }
            // onActive (the pan's onUpdate); circleGesture has no onEnd, so the lift moves nothing.
            Event::Start(p) | Event::Update(p) => {
                self.first = (self.first_from.0 + p.translation_x, self.first_from.1 + p.translation_y);
                self.dirty = true;
            }
            _ => {}
        }
        match self.second_pan.event(id, phase, x, y, at_ms, on_second) {
            // onStart (the pan's onBegin) only keeps the context: a spring back still running goes
            // on until onActive sets the values.
            Event::Begin { .. } => {
                self.touched = true;
                self.second_from = second;
            }
            Event::Start(p) | Event::Update(p) => {
                self.second.0.set((self.second_from.0 + p.translation_x) as f64);
                self.second.1.set((self.second_from.1 + p.translation_y) as f64);
                self.dirty = true;
            }
            // The lift: back to the centre on a critically damped spring (the owner's call, phone
            // feedback mwh5j03c: RN's withSpring() starts from rest) carrying the finger's release
            // velocity, whichever way it points.
            Event::End(p) => {
                let (cx, cy) = self.centre();
                // A lift with no drag (the pan never moved) keeps a running spring's velocity.
                let v = |s: &Spring, finger: f32| if finger != 0.0 { finger as f64 } else if s.running { s.velocity } else { 0.0 };
                let (vx, vy) = (v(&self.second.0, p.velocity_x), v(&self.second.1, p.velocity_y));
                self.second.0.launch(cx as f64, vx, RELEASE);
                self.second.1.launch(cy as f64, vy, RELEASE);
                self.dirty = true;
            }
            // A cancel: the same spring from where it is, at the velocity it has.
            Event::Fail => {
                let (cx, cy) = self.centre();
                for (s, to) in [(&mut self.second.0, cx), (&mut self.second.1, cy)] {
                    let v = if s.running { s.velocity } else { 0.0 };
                    s.launch(to as f64, v, RELEASE);
                }
                self.dirty = true;
            }
            _ => {}
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
        self.size = (frame.width, frame.height);
        if !self.touched {
            let (cx, cy) = self.centre();
            self.first = (cx, cy);
            self.second = (Spring::at(cx as f64), Spring::at(cy as f64));
        }
        let moving = self.second.0.step(frame.now_ms) | self.second.1.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let scale = frame.scale;
        let sigma = BLUR * scale;
        let reach = ceil_size(3.0 * sigma);
        let size = (pw + 2 * reach as u32, ph + 2 * reach as u32);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, size)) {
            self.gpu = Some(build(device, format, frame.shader_generation, size));
        }
        let (c1, c2) = (self.first, (self.second.0.value as f32, self.second.1.value as f32));
        // layerClip: the circles' bounds + LAYER_MARGIN; the device clip is it rounded out,
        // within the screen; the layer, that clip outset by the blur's reach.
        let clip = [
            c1.0.min(c2.0) - LAYER_MARGIN,
            c1.1.min(c2.1) - LAYER_MARGIN,
            c1.0.max(c2.0) + LAYER_MARGIN,
            c1.1.max(c2.1) + LAYER_MARGIN,
        ];
        let device_clip = intersect(round_out(clip.map(|v| v * scale)), [0, 0, pw as i32, ph as i32]);
        let draw = &mut self.draw;
        // The layer texture's texel (0, 0) is device (−reach, −reach).
        draw.canvas.begin(scale);
        draw.canvas.translate(reach as f32 / scale, reach as f32 / scale);
        let colors = [Color::rgb8(0, 255, 255), Color::rgb8(0, 0, 255), Color::rgb8(0, 255, 255)];
        let paint = Paint::shader(Shader::Sweep { center: point(0.0, 0.0), stops: stops(&colors) });
        draw.canvas.draw_with(&paint, |b| {
            skia::add_circle(b, c1.0, c1.1, RADIUS);
            skia::add_circle(b, c2.0, c2.1, RADIUS);
        });
        let gpu = self.gpu.as_mut().unwrap();
        draw.renderer.draw(device, queue, encoder, &draw.canvas, &gpu.layer, GRAPHITE_FORMAT, size.0, size.1, wgpu::Color::TRANSPARENT);
        let mut u = Uniforms {
            canvas: [pw as f32, ph as f32, scale, gfx::srgb_flag(format)],
            low: [0.0; 4],
            out: [0.0; 4],
            layer: [0.0, ALPHA_SCALE, ALPHA_BIAS, 0.0],
        };
        let mut view = gpu.empty.clone();
        if let Some(desired) = device_clip {
            if draw.plan.update(outset(desired, reach, reach), desired, sigma) {
                let out = draw.blur.run(device, queue, encoder, Placed { view: &gpu.layer, origin: [-reach, -reach], size: [size.0, size.1] }, &draw.plan);
                u.low = low_mapping(&draw.plan, out.origin, out.size);
                u.out = draw.plan.output.map(|v| v as f32);
                u.layer[0] = 1.0;
                view = out.view.clone();
            }
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != view) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("metaball"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(&view) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((view, group));
        }
        skia::render::fullscreen_pass(encoder, "metaball", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        self.dirty = false;
        moving || self.first_pan.tracking() || self.second_pan.tracking()
    }
}

/// The blurred image's uv of a device pixel: uv = p · xy + zw (as spiral's).
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    Gpu {
        format,
        generation,
        size,
        compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None),
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("metaball"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        layer: skia::render::sampled_target(device, "metaball layer", GRAPHITE_FORMAT, size.0, size.1),
        empty: skia::render::sampled_target(device, "metaball empty", GRAPHITE_FORMAT, 1, 1),
        sampler: skia::render::linear_sampler(device),
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 210.0,
            height: 456.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    #[test]
    fn the_circles_start_at_the_centre_and_follow_a_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = Metaball::default();
        let (img, _) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        img.save("metaball-start");
        let lit = |img: &fixture::Pixels, x: u32, y: u32| img.at(x, y)[2] > 128;
        assert!(lit(&img, 105, 228), "centre {:?}", img.at(105, 228));
        assert!(!lit(&img, 105, 100), "above {:?}", img.at(105, 100));
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 228.0, 10.0));
        // RNGH on iOS leaves UIKit's 10 pt hysteresis out of the translation (a pan that begins 90 ms or more after touch-down): 130 pt
        // of travel translate it 120.
        for i in 1..=11 {
            s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 228.0 - (12.0 * i as f32).min(130.0), 100.0 + 8.0 * i as f64));
        }
        let (img, _) = fixture::render(&gpu, &mut s, &frame(200.0)).unwrap();
        img.save("metaball-dragged");
        assert!(lit(&img, 105, 108), "dragged {:?}", img.at(105, 108));
        // Lifted, the first stays 120 pt above the second: their gap of 0 bridges.
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 98.0, 200.0));
        let (img, _) = fixture::render(&gpu, &mut s, &frame(300.0)).unwrap();
        img.save("metaball-bridge");
        assert!(lit(&img, 105, 168), "bridge {:?}", img.at(105, 168));
        assert!(!lit(&img, 20, 168), "beside the bridge {:?}", img.at(20, 168));
        // The lift at another point than the last move: circleGesture has no onEnd.
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 108.0, 400.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 96.0, 496.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 86.0, 504.0));
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 78.0, 512.0));
        assert_eq!(s.first, (105.0, 96.0));
    }

    #[test]
    fn the_second_springs_back_and_a_touch_down_does_not_stop_it() {
        let mut s = Metaball { size: (210.0, 456.0), touched: true, first: (105.0, 0.0), ..Default::default() };
        s.second = (Spring::at(105.0), Spring::at(228.0));
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 228.0, 0.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 240.0, 8.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 400.0, 16.0));
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 400.0, 32.0));
        assert!(s.second.1.running);
        // The lift carries the finger's velocity (down, away from the centre): the blob goes on
        // past where it was let go, then comes back, critically damped (no swing past the centre).
        s.second.1.step(32.0);
        s.second.1.step(48.0);
        assert!(s.second.1.value > 400.0, "{}", s.second.1.value);
        let mut ms = 48.0;
        let mut peak: f64 = 0.0;
        while s.second.1.value > 300.0 {
            ms += 16.0;
            s.second.1.step(ms);
            peak = peak.max(s.second.1.value);
            assert!(ms < 3000.0);
        }
        assert!(peak > 400.0);
        s.second.1.step(ms + 16.0);
        let mid = s.second.1.value;
        assert!(mid < 400.0 && mid > 228.0, "{mid}");
        // Held still on it (the pan not active yet): the spring goes on.
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, mid as f32, ms + 20.0));
        assert!(s.second.1.running);
        s.second.1.step(ms + 70.0);
        assert!(s.second.1.value < mid);
        // Lifted without a drag: the spring again, from where it is, at the velocity it has.
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, mid as f32, ms + 80.0));
        assert!(s.second.1.running && s.second.1.velocity < 0.0);
        // It settles at the centre without passing it (ζ = 1).
        let mut t = ms + 80.0;
        while s.second.1.running {
            t += 16.0;
            s.second.1.step(t);
            assert!(s.second.1.value >= 228.0 - 0.5, "{}", s.second.1.value);
            assert!(t < ms + 5000.0);
        }
    }
}
