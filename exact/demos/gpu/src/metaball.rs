//! Metaball (src/animations/metaball/index.tsx): two circles (RADIUS 80) whose union is
//! blurred (BLUR 30) and thresholded into one liquid shape, filled with a sweep gradient from
//! the canvas's corner (cyan, blue, cyan) on #0A0A0A. Both start at the screen's centre; each
//! follows a finger. The first stays where it is dropped; the second springs back to the centre
//! (`withSpring`, Reanimated 4's default). A touch goes to the first circle if it is under the
//! finger, else to the second (RN's Touchable order: "the first one registered, i.e. rendered").
//!
//! Everything runs in this surface: the pans, the spring and the drawing. The blur is a
//! separable Gaussian on a field of FIELD points per texel, which is σ/2 = 15 texels;
//! the threshold samples it at full resolution, so the edge stays sharp.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Spring, GENTLE};

use crate::{gfx, shaders};
use shaders::metaball::{entry, module, Uniforms, GROUP_0, SMP, SRC, U};

const RADIUS: f32 = 80.0;
const BLUR: f32 = 30.0;
/// Canvas points per field texel.
const FIELD: f32 = 2.0;
/// The field reaches this far past the canvas, so a circle at the edge blurs as Skia's
/// unclipped layer does.
const MARGIN: f32 = 3.0 * BLUR + RADIUS;
const FIELD_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::R16Float;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Metaball::default())
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
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    grid: (u32, u32),
    mask: wgpu::RenderPipeline,
    blur_x: wgpu::RenderPipeline,
    blur_y: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    uniforms: exact_gpu::FrameUniform,
    a: wgpu::TextureView,
    b: wgpu::TextureView,
    /// Per uniform slot: (reads b, reads a).
    binds: Vec<(wgpu::BindGroup, wgpu::BindGroup)>,
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
            Event::Start(p) | Event::Update(p) | Event::End(p) => {
                self.first = (self.first_from.0 + p.translation_x, self.first_from.1 + p.translation_y);
                self.dirty = true;
            }
            _ => {}
        }
        match self.second_pan.event(id, phase, x, y, at_ms, on_second) {
            Event::Begin { .. } => {
                self.touched = true;
                self.second_from = second;
                self.second.0.set(second.0 as f64);
                self.second.1.set(second.1 as f64);
            }
            Event::Start(p) | Event::Update(p) => {
                self.second.0.set((self.second_from.0 + p.translation_x) as f64);
                self.second.1.set((self.second_from.1 + p.translation_y) as f64);
                self.dirty = true;
            }
            Event::End(_) | Event::Fail => {
                let (cx, cy) = self.centre();
                self.second.0.to(cx as f64, 0.0, GENTLE);
                self.second.1.to(cy as f64, 0.0, GENTLE);
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
        let grid = (
            ((frame.width + 2.0 * MARGIN) / FIELD).ceil() as u32,
            ((frame.height + 2.0 * MARGIN) / FIELD).ceil() as u32,
        );
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.grid)) != Some((format, frame.shader_generation, grid)) {
            self.gpu = Some(build(device, format, frame.shader_generation, grid));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let uniforms = Uniforms {
            centres: [self.first.0, self.first.1, self.second.0.value as f32, self.second.1.value as f32],
            field: [-MARGIN, -MARGIN, FIELD, FIELD],
            grid: [grid.0 as f32, grid.1 as f32, BLUR / FIELD, RADIUS],
            canvas: [frame.width, frame.height, gfx::srgb_flag(format), 0.0],
        };
        let slot = gpu.uniforms.write(queue, &uniforms.bytes());
        let (reads_b, reads_a) = &gpu.binds[slot];
        gfx::pass(encoder, "metaball mask", &gpu.a, &gpu.mask, reads_b);
        gfx::pass(encoder, "metaball blur x", &gpu.b, &gpu.blur_x, reads_a);
        gfx::pass(encoder, "metaball blur y", &gpu.a, &gpu.blur_y, reads_b);
        gfx::pass(encoder, "metaball", target, &gpu.compose, reads_a);
        self.dirty = false;
        moving || self.first_pan.tracking() || self.second_pan.tracking()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, grid: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let field = |fs| gfx::fullscreen(device, FIELD_FORMAT, &shader, &layout, entry::VS, fs, None, "metaball field");
    let (mask, blur_x, blur_y) = (field(entry::MASK), field(entry::BLUR_X), field(entry::BLUR_Y));
    let compose = gfx::fullscreen(device, format, &shader, &layout, entry::VS, entry::COMPOSE, None, "metaball");
    let uniforms = exact_gpu::FrameUniform::new(device, Uniforms::SIZE, "metaball uniforms");
    let a = gfx::target(device, "metaball a", FIELD_FORMAT, grid.0, grid.1);
    let b = gfx::target(device, "metaball b", FIELD_FORMAT, grid.0, grid.1);
    let sampler = gfx::linear_sampler(device, "metaball");
    let bind = |slot: usize, view: &wgpu::TextureView| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("metaball"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.buffer(slot).as_entire_binding() },
                wgpu::BindGroupEntry { binding: SRC.binding, resource: wgpu::BindingResource::TextureView(view) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        })
    };
    let binds = (0..uniforms.slots()).map(|slot| (bind(slot, &b), bind(slot, &a))).collect();
    Gpu { format, generation, grid, mask, blur_x, blur_y, compose, uniforms, a, b, binds }
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
        for i in 1..=10 {
            s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 228.0 - 12.0 * i as f32, 10.0 + 16.0 * i as f64));
        }
        let (img, _) = fixture::render(&gpu, &mut s, &frame(200.0)).unwrap();
        img.save("metaball-dragged");
        assert!(lit(&img, 105, 108), "dragged {:?}", img.at(105, 108));
        // Lifted, the first stays 120 pt above the second: their gap of 0 bridges.
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 108.0, 200.0));
        let (img, _) = fixture::render(&gpu, &mut s, &frame(300.0)).unwrap();
        img.save("metaball-bridge");
        assert!(lit(&img, 105, 168), "bridge {:?}", img.at(105, 168));
        assert!(!lit(&img, 20, 168), "beside the bridge {:?}", img.at(20, 168));
    }
}
