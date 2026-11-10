//! What every surface here shares: full-screen pipelines, render targets, samplers, passes.

use exact_gpu::wgpu;

/// A pipeline drawing one full-screen triangle with `vs`/`fs` of `module`.
#[allow(clippy::too_many_arguments)]
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
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some(label),
        bind_group_layouts: &[Some(layout)],
        immediate_size: 0,
    });
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
        cache: None,
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

/// One full-screen draw into `view`, cleared first.
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

/// 1 when the target encodes sRGB itself (the shader writes linear), else 0.
pub fn srgb_flag(format: wgpu::TextureFormat) -> f32 {
    if format.is_srgb() {
        1.0
    } else {
        0.0
    }
}

/// The host's pointer phase as gesture-handler names it.
pub fn phase(phase: exact_gpu::PointerPhase) -> gesture_handler::Phase {
    match phase {
        exact_gpu::PointerPhase::Down => gesture_handler::Phase::Down,
        exact_gpu::PointerPhase::Move => gesture_handler::Phase::Move,
        exact_gpu::PointerPhase::Up => gesture_handler::Phase::Up,
        exact_gpu::PointerPhase::Cancel => gesture_handler::Phase::Cancel,
    }
}

/// `Math.random()` for a surface: a seeded stream (mulberry32), so a demo's random layout is
/// the same for a seed (the Contract's `env.seed`) and differs between launches.
#[derive(Clone, Debug)]
pub struct Random(u32);

impl Random {
    /// The stream `seed` names.
    pub fn new(seed: f64) -> Random {
        Random((seed.abs() as u64 % 4_294_967_296) as u32 ^ 0x9E37_79B9)
    }
    /// The next number in [0, 1).
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

/// Where a one-line RN `<Text>` box's baseline sits: the line is the font's ascent + descent
/// (+ its line gap) tall, the baseline an ascent below its top.
pub fn baseline(font: &skia::Font, top: f32) -> f32 {
    top - font.metrics().ascent
}

/// The height of one line of `font` (an RN `<Text>` with no `lineHeight`).
pub fn line_height(font: &skia::Font) -> f32 {
    let m = font.metrics();
    -m.ascent + m.descent + m.leading
}

/// `v.set(withSpring(to, { duration, dampingRatio }))`: from where `spring` is, at its velocity
/// (dropped when it points away from `to`, as Reanimated's onStart), with the stiffness solved
/// for this start (mass 4, Reanimated's default).
pub fn spring_to(spring: &mut reanimated::Spring, to: f64, duration_ms: f64, damping_ratio: f64) {
    let (x, v) = (spring.value, spring.velocity);
    let v = if !spring.running || (to > x && v < 0.0) || (to < x && v > 0.0) { 0.0 } else { v };
    spring.to(to, v, reanimated::duration_config(x - to, v, duration_ms, damping_ratio, 4.0));
}

/// A fixture image (premultiplied) composited over the opaque `background` colour, written as
/// `EXACT_GPU_OUT/<name>.ppm` (what the demo looks like on its screen's colour).
#[cfg(all(test, not(target_arch = "wasm32")))]
pub fn save_over(img: &exact_gpu::fixture::Pixels, name: &str, background: [u8; 3]) {
    let Some(dir) = std::env::var_os("EXACT_GPU_OUT") else { return };
    let mut out = format!("P6\n{} {}\n255\n", img.width, img.height).into_bytes();
    for p in img.data.chunks(4) {
        let a = p[3] as u32;
        for k in 0..3 {
            out.push((p[k] as u32 + (255 - a) * background[k] as u32 / 255).min(255) as u8);
        }
    }
    let _ = std::fs::write(std::path::Path::new(&dir).join(format!("{name}.ppm")), out);
}
