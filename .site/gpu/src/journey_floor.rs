//! `journeyfloor(scroll, topInset, reduced, light)`: the board under Journey's road, the RN app's
//! src/components/journey/board-floor.tsx (`useBoardFloorPaint`, `drawBoardFloor`), drawn by
//! shaders/journey_floor.wgsl over the whole screen behind the list. The scroll offset comes from the
//! list's `scroll` action each frame (home-tabs-architecture.md §2: a 1–2 frame lag of a faint
//! quarter-speed pattern is not visible). `light` is the page's scheme (`exactViewport().prefersColorScheme`):
//! the canvas has no children (a scheme probe child cost a host capture on Journey's first visit). The
//! pipeline is the device's, shared and warmed with the road's ([`warm`]).

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use std::sync::Arc;

use crate::warm::PerDevice;
use crate::{gfx, shaders};

/// The inputs, in bind order.
pub const INPUTS: usize = 4;
const HORIZON: f32 = 0.6;
const PARALLAX_FACTOR: f32 = 0.25;
const SQUARES_ACROSS: f32 = 6.0;
const NEAR_SQUARENESS: f32 = 0.75;

/// The floor's uniforms for a `width`×`height` screen: `[depthScale, rowsPerPoint]`
/// (useBoardFloorPaint: square at the bottom edge, height / width = NearSquareness).
pub fn depth(width: f32, height: f32) -> (f32, f32) {
    let k = (1.0 + HORIZON) * (1.0 + HORIZON);
    let depth_scale = SQUARES_ACROSS * k * height / (width * NEAR_SQUARENESS);
    (depth_scale, depth_scale / (k * height))
}

/// The tint and strength: the accent at 0.05 on the dark page, primaryDark at 0.11 on the light.
pub fn tint(light: bool) -> ([f32; 3], f32) {
    let c = if light { 0xA68160u32 } else { 0xCBAA8E };
    let ch = |s: u32| ((c >> s) & 0xff) as f32 / 255.0;
    ([ch(16), ch(8), ch(0)], if light { 0.11 } else { 0.05 })
}

/// The floor's layout and pipeline for a device and format, built once ([`program`]).
struct Program {
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
}

fn program(device: &wgpu::Device, format: wgpu::TextureFormat) -> Arc<Program> {
    static BUILT: PerDevice<Program> = PerDevice::new();
    BUILT.get(device, crate::journey::format_key(format), || build(device, format))
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Program {
    let module = device.create_shader_module(shaders::journey_floor::module());
    let layout = device.create_bind_group_layout(&shaders::journey_floor::GROUP_0);
    let pipeline =
        gfx::fullscreen(device, format, &module, &layout, shaders::journey_floor::entry::VS, shaders::journey_floor::entry::FS, None, "journey floor");
    Program { layout, pipeline }
}

/// Builds the floor's pipeline for `format` ahead of Journey's first visit (journey.rs `warm`).
pub fn warm(device: &wgpu::Device, format: wgpu::TextureFormat) {
    let _ = program(device, format);
}

struct Gpu {
    format: wgpu::TextureFormat,
    program: Arc<Program>,
    uniform: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

#[derive(Default)]
struct FloorSurface {
    scroll: f32,
    top_inset: f32,
    reduced: bool,
    light: bool,
    gpu: Option<Gpu>,
    /// The module's threads are joined once the last surface holding one goes (warm.rs).
    _lease: crate::warm::Lease,
}

impl Surface for FloorSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) -> bool {
        self.gpu = None;
        true
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let get = |i: usize, name: &str| inputs.get(i).map(|v| number(v, name)).transpose().map(|v| v.unwrap_or(0.0));
        self.scroll = get(0, "scroll")? as f32;
        self.top_inset = get(1, "topInset")? as f32;
        self.reduced = get(2, "reduced")? > 0.5;
        self.light = get(3, "light")? > 0.5;
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
        // Journey opened first (tapped before Home's ghost drew): the warm-up's clock starts here.
        crate::warm::first_frame(device, queue, format, frame.scale);
        let light = self.light;
        if self.gpu.as_ref().is_none_or(|g| g.format != format) {
            let program = program(device, format);
            let uniform = gfx::uniform(device, "journey floor", shaders::journey_floor::Floor::SIZE);
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("journey floor"),
                layout: &program.layout,
                entries: &[wgpu::BindGroupEntry { binding: shaders::journey_floor::F.binding, resource: uniform.as_entire_binding() }],
            });
            self.gpu = Some(Gpu { format, program, uniform, bind });
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (w, h) = (frame.width, frame.height);
        let (depth_scale, rows_per_point) = depth(w, h);
        let drift = if self.reduced { 0.0 } else { PARALLAX_FACTOR };
        let (rgb, strength) = tint(light);
        let u = shaders::journey_floor::Floor {
            a: [w, h, (self.scroll + self.top_inset) * rows_per_point * drift, strength],
            b: [rgb[0], rgb[1], rgb[2], HORIZON],
            c: [SQUARES_ACROSS, depth_scale, 1.0 / frame.scale.max(1e-3), if format.is_srgb() { 1.0 } else { 0.0 }],
        };
        let mut bytes = [0u8; shaders::journey_floor::Floor::SIZE];
        u.write(&mut bytes);
        queue.write_buffer(&gpu.uniform, 0, &bytes);
        gfx::pass(encoder, "journey floor", target, &gpu.program.pipeline, &gpu.bind);
        false
    }
}

/// A new floor surface, for the registry.
pub fn journey_floor() -> Box<dyn Surface> {
    Box::new(FloorSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_square_at_the_bottom_edge_is_three_quarters_as_tall_as_wide() {
        let (depth_scale, rows) = depth(420.0, 912.0);
        assert!((depth_scale - 6.0 * 2.56 * 912.0 / (420.0 * 0.75)).abs() < 1e-3);
        assert!((rows - depth_scale / (2.56 * 912.0)).abs() < 1e-6);
        assert_eq!(tint(false).1, 0.05);
        assert_eq!(tint(true).1, 0.11);
    }
}
