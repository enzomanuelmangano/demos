//! Skia's `Blur` image filter (`ImageFilter.MakeBlur(σ, σ, TileMode.Decal)`) for a layer a demo
//! drew into a texture: a separable Gaussian, run at a lower resolution where σ is large (the
//! result is smooth, so a bilinear read back up is exact to the eye), outside the texture
//! transparent (decal).

use crate::wgpu;

const SHADER: &str = r#"
struct P { dir: vec2<f32>, sigma: f32, _p: f32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> p: P;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out; o.pos = vec4<f32>(q, 0.0, 1.0); o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5); return o;
}
fn tap(uv: vec2<f32>) -> vec4<f32> {
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(0.0); }
    return textureSampleLevel(src, smp, uv, 0.0);
}
@fragment fn down(in: Out) -> @location(0) vec4<f32> { return textureSampleLevel(src, smp, in.uv, 0.0); }
@fragment fn gauss(in: Out) -> @location(0) vec4<f32> {
    let r = i32(ceil(3.0 * p.sigma));
    let texel = p.dir / vec2<f32>(textureDimensions(src));
    var sum = vec4<f32>(0.0);
    var weight = 0.0;
    for (var i = -r; i <= r; i = i + 1) {
        let x = f32(i);
        let w = exp(-0.5 * x * x / (p.sigma * p.sigma));
        sum = sum + tap(in.uv + texel * x) * w;
        weight = weight + w;
    }
    return sum / weight;
}
"#;

/// A blur's textures and pipelines, kept between frames.
#[derive(Default)]
pub struct Blur {
    built: Option<Built>,
    size: (u32, u32),
    a: Option<wgpu::TextureView>,
    b: Option<wgpu::TextureView>,
}

struct Built {
    format: wgpu::TextureFormat,
    down: wgpu::RenderPipeline,
    gauss: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    params: [wgpu::Buffer; 3],
}

impl Blur {
    /// Blurs `source` (`width`×`height` pixels of `format`) by `sigma` pixels and returns the
    /// blurred texture, at `1/factor` of the size, to be sampled with a linear filter.
    /// `factor` is chosen so σ is about 4 texels where it is large.
    #[allow(clippy::too_many_arguments)]
    pub fn run(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        sigma: f32,
    ) -> &wgpu::TextureView {
        let factor = (sigma / 4.0).floor().clamp(1.0, 8.0);
        let size = (((width as f32) / factor).ceil() as u32, ((height as f32) / factor).ceil() as u32);
        if self.built.as_ref().map(|b| b.format) != Some(format) {
            self.built = Some(build(device, format));
            self.size = (0, 0);
        }
        if self.size != size {
            self.size = size;
            self.a = Some(crate::render::sampled_target(device, "skia blur a", format, size.0, size.1));
            self.b = Some(crate::render::sampled_target(device, "skia blur b", format, size.0, size.1));
        }
        let b = self.built.as_ref().unwrap();
        let s = sigma / factor;
        let put = |i: usize, dir: [f32; 2]| {
            let mut bytes = [0u8; 16];
            bytes[..4].copy_from_slice(&dir[0].to_le_bytes());
            bytes[4..8].copy_from_slice(&dir[1].to_le_bytes());
            bytes[8..12].copy_from_slice(&s.to_le_bytes());
            queue.write_buffer(&b.params[i], 0, &bytes);
        };
        put(0, [0.0, 0.0]);
        put(1, [1.0, 0.0]);
        put(2, [0.0, 1.0]);
        let (ta, tb) = (self.a.as_ref().unwrap(), self.b.as_ref().unwrap());
        let bind = |view: &wgpu::TextureView, i: usize| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("skia blur"),
                layout: &b.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(view) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&b.sampler) },
                    wgpu::BindGroupEntry { binding: 2, resource: b.params[i].as_entire_binding() },
                ],
            })
        };
        crate::render::fullscreen_pass(encoder, "skia blur down", ta, &b.down, &bind(source, 0));
        crate::render::fullscreen_pass(encoder, "skia blur x", tb, &b.gauss, &bind(ta, 1));
        crate::render::fullscreen_pass(encoder, "skia blur y", ta, &b.gauss, &bind(tb, 2));
        ta
    }
}

impl Blur {
    /// The last [`Blur::run`]'s result, kept until the next run (a blur of something drawn
    /// once, sampled every frame).
    pub fn output(&self) -> Option<&wgpu::TextureView> {
        self.a.as_ref()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Built {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("skia blur"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("skia blur"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
        ],
    });
    let pipeline = |fs| crate::render::fullscreen_pipeline(device, &module, &layout, fs, format, None);
    let param = || device.create_buffer(&wgpu::BufferDescriptor { label: Some("skia blur"), size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    Built {
        format,
        down: pipeline("down"),
        gauss: pipeline("gauss"),
        layout,
        sampler: crate::render::linear_sampler(device),
        params: [param(), param(), param()],
    }
}
