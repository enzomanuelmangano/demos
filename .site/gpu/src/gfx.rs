//! What every surface here shares: full-screen pipelines, uniform buffers,
//! render targets, and the colour maths.

use exact_gpu::wgpu;

/// The device's persistent pipeline cache: exact-gpu's, which the module installs per device (on
/// Metal a binary archive on disk that every pipeline of the device goes through; on Vulkan the
/// `wgpu::PipelineCache` handle). Held while pipelines are created; `.handle.as_ref()` goes in each
/// descriptor's `cache`. Not kept: the module owns the cache's lifetime (its writer threads stop
/// at unload), so a surface asks again for each build.
pub fn pipeline_cache(device: &wgpu::Device) -> exact_gpu::PipelineCache {
    exact_gpu::PipelineCache::new(device)
}

/// A pipeline drawing one full-screen triangle with `vs`/`fs` of `module`, through the device's
/// pipeline cache.
pub fn fullscreen(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    module: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    vs: &str,
    fs: &str,
    blend: Option<wgpu::BlendState>,
    label: &str,
) -> wgpu::RenderPipeline {
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(label), bind_group_layouts: &[Some(layout)], immediate_size: 0 });
    let cache = pipeline_cache(device);
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module, entry_point: Some(vs), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module,
            entry_point: Some(fs),
            targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: Default::default(),
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: cache.handle.as_ref(),
    })
}

/// A uniform buffer of `size` bytes, written each frame.
pub fn uniform(device: &wgpu::Device, label: &str, size: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size: size as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

/// A sampled render target of `width`×`height` pixels.
pub fn target(device: &wgpu::Device, label: &str, format: wgpu::TextureFormat, width: u32, height: u32) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
        .create_view(&Default::default())
}

/// A clamped, linearly filtered sampler.
pub fn linear_sampler(device: &wgpu::Device, label: &str) -> wgpu::Sampler {
    device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some(label),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    })
}

/// One pass of a full-screen pipeline into `view`, cleared first.
pub fn pass(encoder: &mut wgpu::CommandEncoder, label: &str, view: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, bind: &wgpu::BindGroup) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind, &[]);
    pass.draw(0..3, 0..1);
}

/// `0xRRGGBB` as encoded sRGB components, 0..1, in a vec4.
pub fn srgb4(c: u32) -> [f32; 4] {
    [((c >> 16) & 255) as f32 / 255.0, ((c >> 8) & 255) as f32 / 255.0, (c & 255) as f32 / 255.0, 0.0]
}

/// GLSL's smoothstep, a reversed edge pair included.
pub fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// A CSS cubic Bézier easing `(x1, y1, x2, y2)` at `x`, by bisection.
pub fn bezier(x1: f32, y1: f32, x2: f32, y2: f32, x: f32) -> f32 {
    let x = x.clamp(0.0, 1.0);
    let at = |a: f32, b: f32, t: f32| 3.0 * (1.0 - t) * (1.0 - t) * t * a + 3.0 * (1.0 - t) * t * t * b + t * t * t;
    let (mut lo, mut hi) = (0.0f32, 1.0f32);
    for _ in 0..30 {
        let mid = (lo + hi) / 2.0;
        if at(x1, x2, mid) < x {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    at(y1, y2, (lo + hi) / 2.0)
}

/// Every uniform (and small storage) block a surface writes per frame, in one buffer filled
/// once a frame. `queue.write_buffer` stages a buffer of its own on every call, and on the
/// simulator each is a Metal buffer made over XPC (~0.2–0.3 ms of main thread): the arena
/// copies from a ring of persistently re-mapped staging buffers instead, and only falls back to
/// `write_buffer` when none is mapped yet. Blocks are reserved once, when the pipelines are
/// built, at the device's uniform alignment.
pub struct Arena {
    buffer: wgpu::Buffer,
    bytes: Vec<u8>,
    next: usize,
    align: usize,
    written: usize,
    staging: Vec<Staging>,
    /// A hash of what the last flush wrote: a surface's frames compare it to see they stopped changing.
    fingerprint: u64,
}

/// Whether a surface's frames have stopped changing: the same uniform bytes (its arena's
/// fingerprint) for STILL_MS. Long enough that a wait inside an animation (a delay before a fill)
/// is never taken for rest; a surface that is still asks for no frames until something changes it.
#[derive(Default)]
pub struct Stillness {
    hash: Option<u64>,
    since: f64,
}

/// How long the same uniforms make a surface still.
pub const STILL_MS: f64 = 2000.0;

impl Stillness {
    /// New inputs or a new size: the count starts again (what follows may move).
    pub fn reset(&mut self) {
        self.hash = None;
    }

    /// One frame's fingerprint at `now`: whether the frames have been the same for STILL_MS.
    pub fn note(&mut self, hash: u64, now: f64) -> bool {
        if self.hash != Some(hash) {
            self.hash = Some(hash);
            self.since = now;
        }
        now - self.since >= STILL_MS
    }
}

/// FNV-1a over the bytes.
fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x100_0000_01b3))
}

struct Staging {
    buffer: std::sync::Arc<wgpu::Buffer>,
    /// Mapped for writing, and whether this frame copied from it (to map again once submitted).
    mapped: std::sync::Arc<std::sync::atomic::AtomicBool>,
    used: bool,
}

const RING: usize = 3;

impl Arena {
    /// An arena of `capacity` bytes.
    pub fn new(device: &wgpu::Device, label: &str, capacity: usize) -> Arena {
        let align = (device.limits().min_uniform_buffer_offset_alignment as usize).max(device.limits().min_storage_buffer_offset_alignment as usize);
        let capacity = capacity.div_ceil(4) * 4;
        Arena {
            buffer: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: capacity as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            bytes: vec![0; capacity],
            next: 0,
            align,
            written: 0,
            fingerprint: 0,
            staging: (0..RING)
                .map(|_| Staging {
                    buffer: std::sync::Arc::new(device.create_buffer(&wgpu::BufferDescriptor {
                        label: Some(label),
                        size: capacity as u64,
                        usage: wgpu::BufferUsages::MAP_WRITE | wgpu::BufferUsages::COPY_SRC,
                        mapped_at_creation: true,
                    })),
                    mapped: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
                    used: false,
                })
                .collect(),
        }
    }

    /// A block of `size` bytes: its offset.
    pub fn reserve(&mut self, size: usize) -> usize {
        let at = self.next.div_ceil(self.align) * self.align;
        assert!(at + size <= self.bytes.len(), "arena full: {} + {size} > {}", at, self.bytes.len());
        self.next = at + size;
        at
    }

    /// The block at `offset`, `size` bytes, as a binding.
    pub fn binding(&self, offset: usize, size: usize) -> wgpu::BindingResource<'_> {
        wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &self.buffer, offset: offset as u64, size: std::num::NonZeroU64::new(size as u64) })
    }

    /// The block at `offset` to fill, in place.
    pub fn at(&mut self, offset: usize, size: usize) -> &mut [u8] {
        self.written = self.written.max(offset + size);
        &mut self.bytes[offset..offset + size]
    }

    /// Copies what this frame filled into the arena, before `encoder`'s commands.
    pub fn flush(&mut self, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let len = self.written.div_ceil(4) * 4;
        if len == 0 {
            return;
        }
        self.written = 0;
        self.fingerprint = fnv(&self.bytes[..len]);
        let ready = self.staging.iter_mut().find(|s| !s.used && s.mapped.load(std::sync::atomic::Ordering::Acquire));
        match ready {
            Some(s) => {
                match s.buffer.slice(..len as u64).get_mapped_range_mut() {
                    Ok(mut range) => range.copy_from_slice(&self.bytes[..len]),
                    Err(_) => {
                        queue.write_buffer(&self.buffer, 0, &self.bytes[..len]);
                        return;
                    }
                }
                s.buffer.unmap();
                s.mapped.store(false, std::sync::atomic::Ordering::Release);
                s.used = true;
                encoder.copy_buffer_to_buffer(&s.buffer, 0, &self.buffer, 0, len as u64);
            }
            None => queue.write_buffer(&self.buffer, 0, &self.bytes[..len]),
        }
    }

    /// A hash of the bytes the last flush wrote.
    pub fn fingerprint(&self) -> u64 {
        self.fingerprint
    }

    /// The frame was submitted: the staging buffers it copied from are mapped again.
    pub fn submitted(&mut self) {
        for s in self.staging.iter_mut().filter(|s| s.used) {
            s.used = false;
            let mapped = s.mapped.clone();
            s.buffer.slice(..).map_async(wgpu::MapMode::Write, move |r| {
                if r.is_ok() {
                    mapped.store(true, std::sync::atomic::Ordering::Release);
                }
            });
        }
    }
}

#[cfg(test)]
mod stillness_tests {
    use super::*;

    /// A surface under Reduce Motion stops asking for frames only once its uniforms have not changed
    /// for STILL_MS: a wait inside an animation (its bytes still) shorter than that keeps it drawing,
    /// and any change starts the count again (site.rs, mascot.rs).
    #[test]
    fn frames_stop_after_still_ms_of_the_same_uniforms() {
        let mut s = Stillness::default();
        let a = fnv(&[1, 2, 3]);
        let b = fnv(&[1, 2, 4]);
        assert_ne!(a, b);
        assert!(!s.note(a, 0.0));
        assert!(!s.note(a, STILL_MS - 1.0));
        assert!(s.note(a, STILL_MS));
        assert!(!s.note(b, STILL_MS + 16.0));
        assert!(!s.note(b, 2.0 * STILL_MS));
        assert!(s.note(b, 2.0 * STILL_MS + 16.0));
        // New inputs: the same frame again counts from now.
        s.reset();
        assert!(!s.note(b, 3.0 * STILL_MS));
        assert!(s.note(b, 4.0 * STILL_MS));
    }
}
