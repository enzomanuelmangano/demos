//! The canvas into a surface's target: one pipeline, MSAA 4×, a stencil for clips.

use crate::{wgpu, Canvas, GpuPaint, Op, Vertex};

const SAMPLES: u32 = 4;
const DEPTH: wgpu::TextureFormat = wgpu::TextureFormat::Stencil8;

const SHADER: &str = r#"
struct View { size: vec2<f32>, srgb: f32, _p: f32 };
struct Paint { head: vec4<f32>, geometry: vec4<f32>, offsets: array<vec4<f32>, 2>, colors: array<vec4<f32>, 8> };
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> paints: array<Paint>;
@group(0) @binding(2) var images: texture_2d_array<f32>;
@group(0) @binding(3) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) paint: u32,
    @location(1) px: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) uv: vec2<f32>,
};

@vertex fn vs(@location(0) pos: vec2<f32>, @location(1) paint: u32, @location(2) color: u32, @location(3) uv: vec2<f32>) -> Out {
    var o: Out;
    o.pos = vec4<f32>(pos.x / view.size.x * 2.0 - 1.0, 1.0 - pos.y / view.size.y * 2.0, 0.0, 1.0);
    o.paint = paint;
    o.px = pos;
    o.color = unpack4x8unorm(color);
    o.uv = uv;
    return o;
}

fn offset(p: Paint, i: u32) -> f32 { return p.offsets[i / 4u][i % 4u]; }

fn ramp(p: Paint, t0: f32) -> vec4<f32> {
    let n = u32(p.head.y);
    let t = clamp(t0, 0.0, 1.0);
    if (t <= offset(p, 0u)) { return p.colors[0]; }
    for (var i = 1u; i < n; i = i + 1u) {
        let o = offset(p, i);
        if (t <= o) {
            let a = offset(p, i - 1u);
            let k = select((t - a) / (o - a), 1.0, o - a <= 0.0);
            return mix(p.colors[i - 1u], p.colors[i], k);
        }
    }
    return p.colors[n - 1u];
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// A rounded rect blurred by a Gaussian (Evan Wallace, "Fast Rounded Rectangle Shadows").
fn erf2(x0: vec2<f32>) -> vec2<f32> {
    let s = sign(x0);
    let a = abs(x0);
    var x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    x = x * x;
    return s - s / (x * x);
}
fn gaussian(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066282746 * sigma);
}
fn shadow_x(x: f32, y: f32, sigma: f32, corner: f32, half: vec2<f32>) -> f32 {
    let delta = min(half.y - corner - abs(y), 0.0);
    let curved = half.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
    let integral = 0.5 + 0.5 * erf2((x + vec2<f32>(-curved, curved)) * (0.7071067812 / sigma));
    return integral.y - integral.x;
}
fn shadow(lower: vec2<f32>, upper: vec2<f32>, p0: vec2<f32>, sigma: f32, corner: f32) -> f32 {
    let center = (lower + upper) * 0.5;
    let half = (upper - lower) * 0.5;
    let p = p0 - center;
    let low = p.y - half.y;
    let high = p.y + half.y;
    let start = clamp(-3.0 * sigma, low, high);
    let end = clamp(3.0 * sigma, low, high);
    let step = (end - start) / 4.0;
    var y = start + step * 0.5;
    var value = 0.0;
    for (var i = 0; i < 4; i = i + 1) {
        value = value + shadow_x(p.x, p.y - y, sigma, corner, half) * gaussian(y, sigma) * step;
        y = y + step;
    }
    return value;
}

@fragment fn fs(in: Out) -> @location(0) vec4<f32> {
    // Image texel gradients, taken where every pixel of a quad runs them.
    let dims = vec2<f32>(textureDimensions(images));
    let gx = dpdx(in.uv) / dims;
    let gy = dpdy(in.uv) / dims;
    let p = paints[in.paint];
    let kind = u32(p.head.x);
    var c = p.colors[0];
    if (kind == 1u) {
        let a = p.geometry.xy; let d = p.geometry.zw - a;
        c = ramp(p, dot(in.px - a, d) / max(dot(d, d), 1e-6));
    } else if (kind == 2u) {
        c = ramp(p, length(in.px - p.geometry.xy) / max(p.geometry.z, 1e-6));
    } else if (kind == 3u) {
        let v = in.px - p.geometry.xy;
        c = ramp(p, fract(atan2(v.y, v.x) / 6.283185307 + 1.0));
    } else if (kind == 4u) {
        let uv = clamp(in.uv, vec2<f32>(0.5), max(p.geometry.xy - vec2<f32>(0.5), vec2<f32>(0.5))) / dims;
        let t = textureSampleGrad(images, smp, uv, i32(p.geometry.z), gx, gy);
        if (p.geometry.w > 0.5) {
            c = vec4<f32>(in.color.rgb, in.color.a * t.a);
        } else {
            c = vec4<f32>(t.rgb / max(t.a, 1e-5), t.a) * in.color;
        }
    } else if (kind == 5u) {
        c.a = c.a * shadow(p.geometry.xy, p.geometry.zw, in.px, p.offsets[0].y, p.offsets[0].x);
    }
    if (kind != 4u) { c = c * in.color; }
    let a = c.a * p.head.z;
    var rgb = c.rgb;
    if (view.srgb > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb * a, a);
}

@fragment fn clip() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }
"#;

/// Draws [`Canvas`] frames into a surface's targets. One per surface; buffers grow and stay.
#[derive(Default)]
pub struct Renderer {
    built: Option<Built>,
    size: (u32, u32),
    msaa: Option<(wgpu::TextureView, wgpu::TextureView)>,
    vertices: Option<(wgpu::Buffer, u64)>,
    indices: Option<(wgpu::Buffer, u64)>,
    paints: Option<(wgpu::Buffer, u64)>,
    bind: Option<wgpu::BindGroup>,
    /// The images paints sample ([`Renderer::set_images`]); a blank layer until set.
    images: Option<wgpu::TextureView>,
}

struct Built {
    format: wgpu::TextureFormat,
    draw: wgpu::RenderPipeline,
    draw_once: wgpu::RenderPipeline,
    clip_in: wgpu::RenderPipeline,
    clip_out: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    view: wgpu::Buffer,
    blank: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

fn grow(slot: &mut Option<(wgpu::Buffer, u64)>, device: &wgpu::Device, label: &str, usage: wgpu::BufferUsages, size: u64) -> bool {
    if slot.as_ref().is_some_and(|(_, cap)| *cap >= size) {
        return false;
    }
    let cap = size.max(4096).next_power_of_two();
    *slot = Some((device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size: cap, usage: usage | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }), cap));
    true
}

impl Renderer {
    /// The images [`crate::Shader::Image`] and [`Canvas::draw_atlas`] sample from now on
    /// (uploaded once: [`crate::Images::upload`] / [`crate::Images::target`]).
    pub fn set_images(&mut self, images: &crate::Images) {
        self.images = Some(images.view.clone());
        self.bind = None;
    }

    /// Draws `canvas` into `target` (`format`, `width`×`height` device pixels), cleared to
    /// `clear` first (premultiplied, in the target's encoding). Records into `encoder`.
    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        canvas: &Canvas,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        clear: wgpu::Color,
    ) {
        if self.built.as_ref().map(|b| b.format) != Some(format) {
            self.built = Some(build(device, format));
            self.bind = None;
            self.msaa = None;
        }
        let (width, height) = (width.max(1), height.max(1));
        if self.size != (width, height) || self.msaa.is_none() {
            self.size = (width, height);
            let make = |format, label| {
                device
                    .create_texture(&wgpu::TextureDescriptor {
                        label: Some(label),
                        size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                        mip_level_count: 1,
                        sample_count: SAMPLES,
                        dimension: wgpu::TextureDimension::D2,
                        format,
                        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                        view_formats: &[],
                    })
                    .create_view(&Default::default())
            };
            self.msaa = Some((make(format, "skia msaa"), make(DEPTH, "skia stencil")));
        }
        let built = self.built.as_ref().unwrap();
        let mut view = [0u8; 16];
        view[..4].copy_from_slice(&(width as f32).to_le_bytes());
        view[4..8].copy_from_slice(&(height as f32).to_le_bytes());
        view[8..12].copy_from_slice(&(if format.is_srgb() { 1.0f32 } else { 0.0 }).to_le_bytes());
        queue.write_buffer(&built.view, 0, &view);

        let vb = bytemuck::cast_slice::<Vertex, u8>(&canvas.vertices);
        let ib = bytemuck::cast_slice::<u32, u8>(&canvas.indices);
        let pb = bytemuck::cast_slice::<GpuPaint, u8>(&canvas.paints);
        grow(&mut self.vertices, device, "skia vertices", wgpu::BufferUsages::VERTEX, vb.len() as u64);
        grow(&mut self.indices, device, "skia indices", wgpu::BufferUsages::INDEX, ib.len() as u64);
        if grow(&mut self.paints, device, "skia paints", wgpu::BufferUsages::STORAGE, pb.len().max(std::mem::size_of::<GpuPaint>()) as u64) {
            self.bind = None;
        }
        if !vb.is_empty() {
            queue.write_buffer(&self.vertices.as_ref().unwrap().0, 0, vb);
            queue.write_buffer(&self.indices.as_ref().unwrap().0, 0, ib);
        }
        if !pb.is_empty() {
            queue.write_buffer(&self.paints.as_ref().unwrap().0, 0, pb);
        }
        let bind = self.bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("skia"),
                layout: &built.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: built.view.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: self.paints.as_ref().unwrap().0.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(self.images.as_ref().unwrap_or(&built.blank)) },
                    wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&built.sampler) },
                ],
            })
        });
        let (msaa, stencil) = self.msaa.as_ref().unwrap();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("skia"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: msaa,
                resolve_target: Some(target),
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(clear), store: wgpu::StoreOp::Discard },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: stencil,
                depth_ops: None,
                stencil_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(0), store: wgpu::StoreOp::Discard }),
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        if canvas.indices.is_empty() {
            return;
        }
        pass.set_bind_group(0, &*bind, &[]);
        pass.set_vertex_buffer(0, self.vertices.as_ref().unwrap().0.slice(..vb.len() as u64));
        pass.set_index_buffer(self.indices.as_ref().unwrap().0.slice(..ib.len() as u64), wgpu::IndexFormat::Uint32);
        for op in &canvas.ops {
            match *op {
                Op::Draw { start, end, level } => {
                    pass.set_pipeline(&built.draw);
                    pass.set_stencil_reference(level);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::DrawOnce { start, end, level } => {
                    pass.set_pipeline(&built.draw_once);
                    pass.set_stencil_reference(level);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::ClipIn { start, end, level } => {
                    pass.set_pipeline(&built.clip_in);
                    pass.set_stencil_reference(level);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
                Op::ClipOut { start, end, level } => {
                    pass.set_pipeline(&built.clip_out);
                    pass.set_stencil_reference(level + 1);
                    pass.draw_indexed(start..end, 0, 0..1);
                }
            }
        }
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Built {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("skia"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("skia"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2Array, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 3, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
        ],
    });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("skia"), bind_group_layouts: &[Some(&layout)], immediate_size: 0 });
    let premultiplied = wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING;
    let pipeline = |fs: &str, blend: Option<wgpu::BlendState>, writes: wgpu::ColorWrites, compare: wgpu::CompareFunction, pass: wgpu::StencilOperation| {
        let face = wgpu::StencilFaceState { compare, fail_op: wgpu::StencilOperation::Keep, depth_fail_op: wgpu::StencilOperation::Keep, pass_op: pass };
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("skia"),
            layout: Some(&pl),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs"),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Uint32, 2 => Uint32, 3 => Float32x2],
                })],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some(fs),
                targets: &[Some(wgpu::ColorTargetState { format, blend, write_mask: writes })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState { cull_mode: None, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Always),
                stencil: wgpu::StencilState { front: face, back: face, read_mask: 0xff, write_mask: 0xff },
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState { count: SAMPLES, ..Default::default() },
            multiview_mask: None,
            cache: None,
        })
    };
    Built {
        format,
        draw: pipeline("fs", Some(premultiplied), wgpu::ColorWrites::ALL, wgpu::CompareFunction::Equal, wgpu::StencilOperation::Keep),
        draw_once: pipeline("fs", Some(premultiplied), wgpu::ColorWrites::ALL, wgpu::CompareFunction::Equal, wgpu::StencilOperation::IncrementClamp),
        clip_in: pipeline("clip", None, wgpu::ColorWrites::empty(), wgpu::CompareFunction::Equal, wgpu::StencilOperation::IncrementClamp),
        clip_out: pipeline("clip", None, wgpu::ColorWrites::empty(), wgpu::CompareFunction::Equal, wgpu::StencilOperation::DecrementClamp),
        layout,
        view: device.create_buffer(&wgpu::BufferDescriptor { label: Some("skia view"), size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        blank: device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("skia no image"),
                size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            })
            .create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() }),
        sampler: device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("skia images"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        }),
    }
}

/// A texture a pass renders into and a later pass samples.
pub fn sampled_target(device: &wgpu::Device, label: &str, format: wgpu::TextureFormat, width: u32, height: u32) -> wgpu::TextureView {
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

/// A clamped, linear sampler.
pub fn linear_sampler(device: &wgpu::Device) -> wgpu::Sampler {
    device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("skia linear"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    })
}

/// A pipeline drawing one full-screen triangle (the module's `vs`) with fragment `fs`.
pub fn fullscreen_pipeline(
    device: &wgpu::Device,
    module: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    fs: &str,
    format: wgpu::TextureFormat,
    blend: Option<wgpu::BlendState>,
) -> wgpu::RenderPipeline {
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(fs), bind_group_layouts: &[Some(layout)], immediate_size: 0 });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(fs),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
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

/// One full-screen draw into `view`, cleared to transparent first.
pub fn fullscreen_pass(encoder: &mut wgpu::CommandEncoder, label: &str, view: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, bind: &wgpu::BindGroup) {
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
