//! Atlas Sphere (src/animations/atlas-sphere/atlas-sphere.tsx): a grid of small cyan dots that,
//! under a finger, shrink with their distance from it and gather toward it, as if wrapped on a
//! sphere; they spread back when it lifts.
//!
//! - The grid (CANVAS = the canvas the Contract sizes): SQUARES_AMOUNT_HORIZONTAL 40,
//!   SQUARE_CONTAINER_SIZE = floor(SCREEN_WIDTH / 48) = the canvas's width / 40, rows =
//!   floor(CANVAS_HEIGHT / SQUARE_CONTAINER_SIZE); sprite `i` at ((i % 40) · C, floor(i / 40) · C).
//! - Each sprite is the texture's (0, 0, 3, 3): BASE_SQUARE, a #00f7ff circle of r 1.5 at
//!   (1.5, 1.5) drawn into a C × C pixel image (one texel per point), magnified by the device.
//! - Per sprite: d = point − grid (0 with no point yet), pd = |d| · progress; scale = pd >
//!   SCALE_DISTANCE ? 0.1 : 1 + pd / SCALE_DISTANCE · (0.1 − 1), SCALE_DISTANCE = √(W² + H²) / 4;
//!   scale ≤ 0.1 hides it; else RSXform(scale, 0, grid + d (1 − scale) progress²).
//! - Pan: onBegin, progress = withSpring(1, { duration 600, dampingRatio 1 }) and the point; onUpdate
//!   (once active, after 10 pt), the point; onTouchesUp, withSpring(0, { duration 1000,
//!   dampingRatio 1 }).
//!
//! The transforms are computed in the vertex shader, one instance per sprite: a frame writes
//! one uniform buffer.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::Spring;

use crate::{gfx, shaders};
use shaders::atlas_sphere::{entry, module, Uniforms, GROUP_0, U};

/// SQUARES_AMOUNT_HORIZONTAL.
const COLUMNS: u32 = 40;
/// SQUARE_SIZE: the circle's diameter, the sprite's side.
const SQUARE_SIZE: f32 = 3.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AtlasSphere { pan: PanGesture::new(), texels: texels(), ..Default::default() })
}

#[derive(Default)]
struct AtlasSphere {
    size: (f32, f32),
    point: Option<(f32, f32)>,
    progress: Spring,
    pan: PanGesture,
    texels: [[f32; 4]; 4],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// BASE_SQUARE rasterized one texel per point, as Skia covers a circle: each texel's centre
/// `r − d + 0.5`, clamped (row 3 and column 3 are outside the circle).
fn texels() -> [[f32; 4]; 4] {
    let r = SQUARE_SIZE / 2.0;
    std::array::from_fn(|y| std::array::from_fn(|x| (r - (x as f32 + 0.5 - r).hypot(y as f32 + 0.5 - r) + 0.5).clamp(0.0, 1.0)))
}

impl AtlasSphere {
    /// SQUARE_CONTAINER_SIZE, the rows, SCALE_DISTANCE.
    fn grid(&self) -> (f32, u32, f32) {
        let (w, h) = self.size;
        let c = (w / COLUMNS as f32).max(1.0);
        let rows = (h / c).floor().max(0.0) as u32;
        (c, rows, w.hypot(h) / 4.0)
    }
}

impl Surface for AtlasSphere {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (x, y) = self.point.unwrap_or((-1.0, -1.0));
        Some(format!("{{\"progress\":{:.3},\"point\":[{x:.1},{y:.1}],\"held\":{}}}", self.progress.value, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        let was = self.pan.tracking();
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Begin { x, y } => {
                gfx::spring_to(&mut self.progress, 1.0, 600.0, 1.0);
                self.point = Some((x, y));
            }
            Event::Start(p) | Event::Update(p) => self.point = Some((p.x, p.y)),
            _ => {}
        }
        // onTouchesUp: the pan's finger lifted (or was cancelled).
        if was && !self.pan.tracking() && matches!(phase, Phase::Up | Phase::Cancel) {
            gfx::spring_to(&mut self.progress, 0.0, 1000.0, 1.0);
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
        let moving = self.progress.step(frame.now_ms);
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (c, rows, scale_distance) = self.grid();
        let (px, py) = self.point.unwrap_or((0.0, 0.0));
        let (pw, ph) = frame.pixels();
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            grid: [c, COLUMNS as f32, scale_distance, 0.0],
            touch: [px, py, self.progress.value as f32, if self.point.is_some() { 1.0 } else { 0.0 }],
            texels: self.texels,
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("atlas sphere"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // The Canvas is transparent over the container's #000000.
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.draw(0..6, 0..COLUMNS * rows);
        moving || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::SPRITE_VS, entry::SPRITE_FS, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), "atlas sphere");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("atlas sphere uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("atlas sphere"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }],
    });
    Gpu { format, generation, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_dots_gather_under_the_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // iPhone Air (420 × 912): C = floor(420 / 48) = 8, the canvas 320 × 712, 89 rows.
        let frame = |now_ms| Frame { width: 320.0, height: 712.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("atlas-sphere-rest");
        assert!(!animating);
        // At rest every dot is at its grid cell: (1.5, 1.5) of cell (0, 0) lit, (5, 5) dark.
        assert!(rest.at(3, 3)[2] > 200, "{:?}", rest.at(3, 3));
        assert_eq!(rest.at(10, 10)[3], 0);
        let lit = |img: &fixture::Pixels, x0: u32, x1: u32, y0: u32, y1: u32| (y0..y1).flat_map(|y| (x0..x1).map(move |x| (x, y))).filter(|&(x, y)| img.at(x, y)[3] > 40).count();
        let a = lit(&rest, 0, 640, 0, 1424);
        assert!(a > 3560 * 4, "{a}");

        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 160.0, 356.0, 10.0);
        let mut ms = 0.0;
        while ms < 1200.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("atlas-sphere-held");
        assert!(animating);
        assert!(s.agent("{}").unwrap().starts_with("{\"progress\":1.000"));
        // A sphere about the finger: lit near it, past SCALE_DISTANCE (195 pt) nothing.
        assert!(lit(&held, 220, 420, 612, 812) > 400);
        assert_eq!(lit(&held, 0, 640, 0, 120), 0);
        assert_eq!(lit(&held, 0, 640, 1300, 1424), 0);

        finger(&mut s, PointerPhase::Up, 160.0, 356.0, ms);
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        assert!(!animating);
        assert_eq!(back.data, rest.data);
    }
}
