//! Which colour scheme the app is in, read off the page. Contract cannot read the
//! scheme, so a surface that draws in the scheme's colours is given a child: a dot
//! in the `page` token, which the host captures in that scheme's colour. The probe
//! copies its centre into a 1×1 texture, reads it back once the frame is
//! submitted, and reports light (a light page) or dark. A changed capture is
//! sampled again. Where the host composites children itself (the web), there is
//! no texture, and the surface keeps its dark default.

use std::sync::{Arc, Mutex};

use exact_gpu::wgpu;

use crate::{gfx, shaders};

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// One surface's probe.
#[derive(Default)]
pub struct SchemeProbe {
    gpu: Option<Gpu>,
    /// The child's texture, and whether it changed since it was last sampled.
    source: Option<wgpu::TextureView>,
    fresh: bool,
    /// A copy recorded this frame, to map once submitted; a map in flight.
    copied: bool,
    reading: Arc<Mutex<Option<bool>>>,
    in_flight: bool,
    light: Option<bool>,
}

struct Gpu {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    buffer: Arc<wgpu::Buffer>,
}

impl SchemeProbe {
    /// The device was lost: the pipeline, the target and a read in flight were the old device's.
    /// The scheme last read is kept until the new device reads it again.
    pub fn device_lost(&mut self) {
        self.gpu = None;
        self.source = None;
        self.fresh = false;
        self.copied = false;
        self.in_flight = false;
        self.reading = Arc::default();
    }

    /// The probe child's texture, given or replaced.
    pub fn child(&mut self, texture: Option<&wgpu::TextureView>) {
        self.source = texture.cloned();
        self.fresh = self.source.is_some();
    }

    /// Whether a reading is under way: a capture not yet sampled, a copy not yet mapped, or a map in
    /// flight. A surface keeps asking for frames meanwhile, or the reading is never collected (a
    /// still surface under Reduce Motion would keep the old scheme's palette).
    pub fn pending(&self) -> bool {
        (self.fresh && self.source.is_some()) || self.copied || self.in_flight
    }

    /// Whether the page is light, once read.
    pub fn light(&self) -> Option<bool> {
        self.light
    }

    /// Records the copy when the child changed and no read is in flight;
    /// collects a finished read. Returns whether the scheme just changed.
    pub fn frame(&mut self, device: &wgpu::Device, encoder: &mut wgpu::CommandEncoder) -> bool {
        let mut changed = false;
        if let Some(light) = self.reading.lock().unwrap().take() {
            self.in_flight = false;
            changed = self.light != Some(light);
            self.light = Some(light);
        }
        let Some(source) = self.source.as_ref() else { return changed };
        if !self.fresh || self.in_flight {
            return changed;
        }
        let gpu = self.gpu.get_or_insert_with(|| build(device));
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("scheme probe"),
            layout: &gpu.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: shaders::probe::SRC.binding, resource: wgpu::BindingResource::TextureView(source) },
                wgpu::BindGroupEntry { binding: shaders::probe::SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        gfx::pass(encoder, "scheme probe", &gpu.view, &gpu.pipeline, &bind);
        encoder.copy_texture_to_buffer(
            gpu.texture.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &gpu.buffer,
                layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(256), rows_per_image: None },
            },
            wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
        );
        self.fresh = false;
        self.copied = true;
        self.in_flight = true;
        changed
    }

    /// The frame's commands were submitted: map the copy.
    pub fn submitted(&mut self) {
        if !self.copied {
            return;
        }
        self.copied = false;
        let Some(gpu) = self.gpu.as_ref() else { return };
        let buffer = gpu.buffer.clone();
        let reading = self.reading.clone();
        gpu.buffer.slice(..).map_async(wgpu::MapMode::Read, move |result| {
            let light = result.ok().and_then(|_| {
                let range = buffer.slice(..).get_mapped_range().ok()?;
                let p = [range[0], range[1], range[2]];
                Some(0.2126 * p[0] as f32 + 0.7152 * p[1] as f32 + 0.0722 * p[2] as f32 > 127.5)
            });
            buffer.unmap();
            *reading.lock().unwrap() = Some(light.unwrap_or(false));
        });
    }
}

fn build(device: &wgpu::Device) -> Gpu {
    let module = device.create_shader_module(shaders::probe::module());
    let layout = device.create_bind_group_layout(&shaders::probe::GROUP_0);
    let pipeline = gfx::fullscreen(device, FORMAT, &module, &layout, shaders::probe::entry::VS, shaders::probe::entry::FS, None, "scheme probe");
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("scheme probe"),
        size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    let buffer = Arc::new(device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("scheme probe"),
        size: 256,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    }));
    Gpu { pipeline, layout, sampler: gfx::linear_sampler(device, "scheme probe"), texture, view, buffer }
}

/// Where the host puts the probe child: nowhere. It is read, never shown.
pub fn hidden() -> exact_gpu::Placement {
    exact_gpu::Placement { hidden: true, homography: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], depth: 0.0, clip_depth: [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0]] }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A reading in progress (sampled, copied, mapping) keeps the probe pending; collected, it is not.
    #[test]
    fn a_reading_under_way_is_pending_until_collected() {
        let mut p = SchemeProbe::default();
        assert!(!p.pending());
        p.copied = true;
        p.in_flight = true;
        assert!(p.pending());
        p.copied = false;
        assert!(p.pending());
        *p.reading.lock().unwrap() = Some(true);
        if let Some(light) = p.reading.lock().unwrap().take() {
            p.in_flight = false;
            p.light = Some(light);
        }
        assert!(!p.pending());
        assert_eq!(p.light(), Some(true));
    }
}
