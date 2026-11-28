//! The daily goal's glow: the RN app's `WelcomeTacticsAura` (src/components/welcome-tactics-aura.tsx)
//! alone on its canvas, and over it, on the light page only, `GhostStage`
//! (src/components/daily-goal/ghost-stage.tsx), the accent's pool behind the white ghost.
//! shaders/composite.wgsl draws both (its no-scene path), as the offer's mascot draws the aura.
//!
//! `aura(reduced, stage)`: `stage` is GhostStage's side in points (0 for none). The canvas's one
//! child is the scheme probe (probe.rs).

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{ChildrenMode, Frame, Surface, SurfaceError, Value};

use crate::probe::SchemeProbe;
use crate::{gfx, scene, shaders};

/// The breath: 2600 ms in-out sine, there and back, from 0 on mount and on each Reduce Motion
/// change; still at 0.45 under Reduce Motion.
const BREATH_MS: f64 = 2600.0;
const STILL: f32 = 0.45;
/// theme.colors.accent (packages/theme/src/unistyles/patterns.ts DARK_ACCENT), both schemes.
const ACCENT: u32 = 0xCBAA8E;

/// The breath's phase `ms` after it started.
pub fn breath(ms: f64, reduced: bool) -> f32 {
    if reduced {
        return STILL;
    }
    let k = ms.max(0.0) / BREATH_MS;
    let x = k.fract() as f32;
    let x = if (k.floor() as i64) % 2 == 0 { x } else { 1.0 - x };
    0.5 - 0.5 * (std::f32::consts::PI * x).cos()
}

struct Gpu {
    format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    uniform: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

#[derive(Default)]
struct AuraSurface {
    reduced: bool,
    stage: f32,
    from: Option<(f64, bool)>,
    probe: SchemeProbe,
    gpu: Option<Gpu>,
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(shaders::composite::module());
    let layout = device.create_bind_group_layout(&shaders::composite::GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &module, &layout, shaders::composite::entry::VS, shaders::composite::entry::FS, None, "aura");
    let uniform = gfx::uniform(device, "aura", shaders::composite::Glow::SIZE);
    // No scene: the shader never reads it (origin.w), but the group binds one.
    let empty = gfx::target(device, "aura scene", wgpu::TextureFormat::Rgba8Unorm, 1, 1);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("aura"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: shaders::composite::G.binding, resource: uniform.as_entire_binding() },
            wgpu::BindGroupEntry { binding: shaders::composite::SCENE.binding, resource: wgpu::BindingResource::TextureView(&empty) },
        ],
    });
    Gpu { format, pipeline, uniform, bind }
}

impl Surface for AuraSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) -> bool {
        self.gpu = None;
        self.probe.device_lost();
        true
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let get = |i: usize, name: &str| inputs.get(i).map(|v| number(v, name)).transpose();
        self.reduced = get(0, "reduced")?.unwrap_or(0.0) > 0.5;
        self.stage = get(1, "stage")?.unwrap_or(0.0) as f32;
        Ok(())
    }

    fn children_mode(&self) -> ChildrenMode {
        ChildrenMode::Each
    }

    fn child(&mut self, _index: usize, _name: &str, texture: Option<&wgpu::TextureView>, _frame: [f32; 4]) {
        self.probe.child(texture);
    }

    fn submitted(&mut self) {
        self.probe.submitted();
    }

    fn placement(&self, _index: usize) -> Option<exact_gpu::Placement> {
        Some(crate::probe::hidden())
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
        let now = frame.now_ms;
        let reduced = self.reduced;
        if self.from.is_none_or(|(_, r)| r != reduced) {
            self.from = Some((now, reduced));
        }
        let phase = breath(now - self.from.map_or(now, |(t, _)| t), reduced);
        self.probe.frame(device, encoder);
        let light = self.probe.light() == Some(true);
        let pal = if light { scene::LIGHT } else { scene::DARK };
        if self.gpu.as_ref().is_none_or(|g| g.format != format) {
            self.gpu = Some(build(device, format));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (w, h) = (frame.width, frame.height);
        let (pw, ph) = frame.pixels();
        let lin = |c: u32| scene::v4(scene::linear(c));
        let mut contact = lin(pal.glow_contact);
        contact[3] = 1.0;
        let mut stage = lin(ACCENT);
        stage[3] = if light { self.stage / 2.0 } else { 0.0 };
        let glow = shaders::composite::Glow {
            rect: [w, h, 0.0, 0.0],
            params: [w, phase, 0.0, pal.halo_gain],
            halo: lin(pal.glow_halo),
            core: lin(pal.glow_core),
            contact,
            extra: [pal.contact_gain, if format.is_srgb() { 1.0 } else { 0.0 }, pw as f32, ph as f32],
            origin: [0.0, 0.0, 0.0, 1.0],
            stage,
        };
        let mut bytes = [0u8; shaders::composite::Glow::SIZE];
        glow.write(&mut bytes);
        queue.write_buffer(&gpu.uniform, 0, &bytes);
        gfx::pass(encoder, "aura", target, &gpu.pipeline, &gpu.bind);
        // It breathes for as long as it shows; still, it is drawn again once the scheme is read.
        !reduced || self.probe.light().is_none() || self.probe.pending()
    }
}

/// A new aura surface, for the registry.
pub fn aura() -> Box<dyn Surface> {
    Box::new(AuraSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_breath_goes_there_and_back() {
        assert_eq!(breath(0.0, false), 0.0);
        assert!((breath(1300.0, false) - 0.5).abs() < 1e-4);
        assert!((breath(2600.0, false) - 1.0).abs() < 1e-4);
        assert!((breath(5200.0, false)).abs() < 1e-4);
        assert_eq!(breath(1000.0, true), STILL);
    }
}
