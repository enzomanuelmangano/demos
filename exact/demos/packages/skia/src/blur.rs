//! Skia's `Blur` image filter (`ImageFilter.MakeBlur(σ, σ, TileMode.Decal)`) for a layer a demo
//! drew into a texture: a separable Gaussian, run at a lower resolution where σ is large (the
//! result is smooth, so a bilinear read back up is exact to the eye), outside the texture
//! transparent (decal), or its edge repeated outward ([`Blur::clamped`], `TileMode.Clamp`: the
//! `<Blur mode="clamp">` a photo's edges keep their colour with).

use crate::wgpu;

const SHADER: &str = r#"
struct P { dir: vec2<f32>, sigma: f32, clamp: f32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> p: P;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out; o.pos = vec4<f32>(q, 0.0, 1.0); o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5); return o;
}
fn tap(uv: vec2<f32>) -> vec4<f32> {
    if (p.clamp < 0.5 && (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0)))) { return vec4<f32>(0.0); }
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
    /// `TileMode.Clamp`: outside the texture is its nearest edge pixel (`Blur::default()` is
    /// `TileMode.Decal`, outside transparent).
    pub clamp: bool,
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
    /// `<Blur mode="clamp">`: a blur whose source's edges extend outward.
    pub fn clamped() -> Blur {
        Blur { clamp: true, ..Blur::default() }
    }

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
        let clamp = self.clamp;
        let put = |i: usize, dir: [f32; 2]| {
            let mut bytes = [0u8; 16];
            bytes[..4].copy_from_slice(&dir[0].to_le_bytes());
            bytes[4..8].copy_from_slice(&dir[1].to_le_bytes());
            bytes[8..12].copy_from_slice(&s.to_le_bytes());
            bytes[12..16].copy_from_slice(&(clamp as u32 as f32).to_le_bytes());
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

// ---------------------------------------------------------------------------------------------
// Skia m157 Graphite's blur image filter, step for step.
//
// RN Skia 3.7.2 builds Skia m157 with Graphite on Dawn. `SkImageFilters::Blur(σ, σ, kDecal)` on
// a layer runs `FilterResult::Builder::blur` (src/core/SkImageFilterTypes.cpp) with Graphite's
// blur engine, `SkShaderBlurAlgorithm` (src/gpu/graphite/TextureUtils.cpp), whose
// `maxSigma()` is `kMaxLinearSigma` = 4. A larger σ is not blurred at full resolution: the
// layer is first downscaled (`FilterResult::rescale`: halvings about the centre, then one step
// between ½ and 1, each a bilinear draw into an 8-bit surface), blurred there with σ ≤ 4 by
// two 1-D passes of a linear-sampled discrete Gaussian (`Compute1DBlurLinearKernel`), and the
// low-resolution result is drawn back up with bilinear sampling. [`GraphitePlan`] is that
// geometry (the same float and integer rect math, `kRoundEpsilon` and all), and
// [`GraphiteBlur`] runs its passes. Outside each surface is transparent (decal), as Skia's
// transparent boundaries and decal tiling make it.
// ---------------------------------------------------------------------------------------------

/// An integer rect, left, top, right, bottom.
pub type IRect = [i32; 4];
/// A float rect, left, top, right, bottom.
pub type FRect = [f32; 4];

/// `kRoundEpsilon` (SkImageFilterTypes.cpp).
const ROUND_EPSILON: f32 = 1e-3;
/// `SkShaderBlurAlgorithm::kMaxLinearSigma`.
pub const MAX_LINEAR_SIGMA: f32 = 4.0;

/// `skif::RoundOut`: the rect inset by `kRoundEpsilon`, then rounded out.
pub fn round_out(r: FRect) -> IRect {
    [(r[0] + ROUND_EPSILON).floor() as i32, (r[1] + ROUND_EPSILON).floor() as i32, (r[2] - ROUND_EPSILON).ceil() as i32, (r[3] - ROUND_EPSILON).ceil() as i32]
}

/// `LayerSpace<SkSize>::ceil`.
pub fn ceil_size(v: f32) -> i32 {
    (v - ROUND_EPSILON).ceil() as i32
}

/// `SkIRect::intersect`, `None` when empty.
pub fn intersect(a: IRect, b: IRect) -> Option<IRect> {
    let r = [a[0].max(b[0]), a[1].max(b[1]), a[2].min(b[2]), a[3].min(b[3])];
    (r[0] < r[2] && r[1] < r[3]).then_some(r)
}

/// `SkIRect::outset`.
pub fn outset(r: IRect, dx: i32, dy: i32) -> IRect {
    [r[0] - dx, r[1] - dy, r[2] + dx, r[3] + dy]
}

fn width(r: FRect) -> f32 {
    r[2] - r[0]
}

fn height(r: FRect) -> f32 {
    r[3] - r[1]
}

fn to_f(r: IRect) -> FRect {
    r.map(|v| v as f32)
}

/// `downscale_step_count` (SkImageFilterTypes.cpp).
pub fn downscale_step_count(scale: f32) -> u32 {
    let n = (1.0 / scale).ceil() as i32;
    // SkNextLog2: the smallest k with 2^k ≥ n.
    let mut steps = if n <= 1 { 0 } else { 32 - ((n - 1) as u32).leading_zeros() };
    if steps > 0 {
        let final_step = scale * (1u32 << (steps - 1)) as f32;
        let limit = if steps == 1 { 1.0 - ROUND_EPSILON } else { 0.9 };
        if final_step >= limit {
            steps -= 1;
        }
    }
    steps
}

/// `scale_about_center`: the rect's coordinates relative to its centre, scaled (a new pixel
/// space centred on 0).
fn scale_about_center(r: FRect, sx: f32, sy: f32) -> FRect {
    let cx = if sx == 1.0 { 0.0 } else { 0.5 * r[0] + 0.5 * r[2] };
    let cy = if sy == 1.0 { 0.0 } else { 0.5 * r[1] + 0.5 * r[3] };
    [(r[0] - cx) * sx, (r[1] - cy) * sy, (r[2] - cx) * sx, (r[3] - cy) * sy]
}

/// One `rescale` iteration: the image over `from` (the previous step's space) drawn into the
/// surface `pixels` of the new space, `from` mapping onto `to`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RescaleStep {
    /// The image's bounds in the previous space.
    pub from: FRect,
    /// Those bounds in the new space.
    pub to: FRect,
    /// The surface drawn, `to` rounded out.
    pub pixels: IRect,
}

/// Where everything of one Graphite blur lands, in layer pixels.
#[derive(Clone, Debug, PartialEq)]
pub struct GraphitePlan {
    /// σ in layer pixels.
    pub sigma: f32,
    /// The blur's radius, `ceil(3σ)`.
    pub radius: i32,
    /// `srcRect`: the part of the layer image that is rescaled.
    pub src_rect: IRect,
    /// The rescale's draws, in order (none when σ ≤ 4).
    pub steps: Vec<RescaleStep>,
    /// The low-resolution image: its pixels, in the last step's space (the layer itself when
    /// there is no step).
    pub low_pixels: IRect,
    /// The space's float bounds that map onto `src_rect`.
    pub low_bounds: FRect,
    /// The σ the low-resolution image is blurred with.
    pub low_sigma: f32,
    /// That kernel's radius.
    pub low_radius: i32,
    /// The pixels of the layer the result is drawn into (`fLayerBounds` of the result).
    pub output: IRect,
}

impl GraphitePlan {
    /// `FilterResult::Builder::blur` for a source image covering `layer` (transparent outside),
    /// a desired output `desired` (the device clip, in layer pixels) and `sigma`.
    pub fn new(layer: IRect, desired: IRect, sigma: f32) -> Option<GraphitePlan> {
        Self::build(layer, desired, sigma, Vec::new())
    }

    /// [`GraphitePlan::new`] into `self`, its steps' buffer reused (a blur planned every frame
    /// allocates nothing once warm). False when nothing is drawn (`self` is then stale).
    pub fn update(&mut self, layer: IRect, desired: IRect, sigma: f32) -> bool {
        let steps = std::mem::take(&mut self.steps);
        match Self::build(layer, desired, sigma, steps) {
            Some(plan) => {
                *self = plan;
                true
            }
            None => false,
        }
    }

    fn build(layer: IRect, desired: IRect, sigma: f32, mut steps: Vec<RescaleStep>) -> Option<GraphitePlan> {
        steps.clear();
        let radius = ceil_size(3.0 * sigma);
        let max_output = outset(layer, radius, radius);
        let output_bounds = intersect(max_output, desired)?;
        let sample_bounds = outset(output_bounds, radius, radius);
        let scale = if sigma > MAX_LINEAR_SIGMA { MAX_LINEAR_SIGMA / sigma } else { 1.0 };
        // rescale(): visibleLayerBounds ∩ desired, decal, not periodic so no overscaling.
        let src_rect = intersect(layer, sample_bounds)?;
        let src = to_f(src_rect);
        let mut x_steps = downscale_step_count(scale);
        let mut bounds = src;
        while x_steps > 0 {
            // Square σ: the x and y step counts and factors are the same.
            let sx = if x_steps > 1 { 0.5 } else { width(src) * scale / width(bounds) };
            let sy = if x_steps > 1 { 0.5 } else { height(src) * scale / height(bounds) };
            x_steps -= 1;
            let to = scale_about_center(bounds, sx, sy);
            steps.push(RescaleStep { from: bounds, to, pixels: round_out(to) });
            bounds = to;
        }
        let (low_pixels, low_bounds) = match steps.last() {
            Some(s) => (s.pixels, s.to),
            None => (src_rect, src),
        };
        // The low-res image's transform back to the layer, its inverse scale: σ in its pixels.
        let inv_x = width(low_bounds) / width(src);
        let low_sigma = (sigma * inv_x).min(MAX_LINEAR_SIGMA);
        let low_radius = (3.0 * low_sigma).ceil() as i32;
        let plan = GraphitePlan { sigma, radius, src_rect, steps, low_pixels, low_bounds, low_sigma, low_radius, output: [0; 4] };
        // srcRelativeOutput: the output bounds in low-res pixels, within the image's blur reach.
        let o = to_f(output_bounds);
        let a = plan.to_low([o[0], o[1]]);
        let b = plan.to_low([o[2], o[3]]);
        let rel = round_out([a[0] - low_pixels[0] as f32, a[1] - low_pixels[1] as f32, b[0] - low_pixels[0] as f32, b[1] - low_pixels[1] as f32]);
        let dims = [0, 0, low_pixels[2] - low_pixels[0], low_pixels[3] - low_pixels[1]];
        let reach = ceil_size(3.0 * low_sigma);
        let rel = intersect(rel, outset(dims, reach, reach))?;
        // The result's layer bounds: its image mapped back, within the desired output.
        let a = plan.to_layer([(rel[0] + low_pixels[0]) as f32, (rel[1] + low_pixels[1]) as f32]);
        let b = plan.to_layer([(rel[2] + low_pixels[0]) as f32, (rel[3] + low_pixels[1]) as f32]);
        let output = intersect(round_out([a[0], a[1], b[0], b[1]]), desired)?;
        Some(GraphitePlan { output, ..plan })
    }

    /// A layer point in the low-resolution image's space.
    pub fn to_low(&self, p: [f32; 2]) -> [f32; 2] {
        let s = to_f(self.src_rect);
        let l = self.low_bounds;
        [l[0] + (p[0] - s[0]) * (width(l) / width(s)), l[1] + (p[1] - s[1]) * (height(l) / height(s))]
    }

    /// A point of the low-resolution space in the layer.
    pub fn to_layer(&self, p: [f32; 2]) -> [f32; 2] {
        let s = to_f(self.src_rect);
        let l = self.low_bounds;
        [s[0] + (p[0] - l[0]) * (width(s) / width(l)), s[1] + (p[1] - l[1]) * (height(s) / height(l))]
    }

    /// `Compute1DBlurLinearKernel(low_sigma, low_radius)`: `low_radius + 1` taps, each an
    /// (offset, weight) pair read with bilinear sampling.
    pub fn linear_kernel(&self) -> Vec<(f32, f32)> {
        linear_kernel(self.low_sigma, self.low_radius)
    }
}

/// `Compute1DBlurKernel`: the normalised discrete Gaussian of `2·radius + 1` taps.
pub fn gaussian_kernel(sigma: f32, radius: i32) -> Vec<f32> {
    let denom = if radius > 0 { 1.0 / (2.0 * sigma * sigma) } else { 1.0 };
    let full: Vec<f32> = (0..2 * radius + 1)
        .map(|x| {
            let t = (x - radius) as f32;
            (-(t * t * denom)).exp()
        })
        .collect();
    let sum: f32 = full.iter().sum();
    let scale = 1.0 / sum;
    full.into_iter().map(|w| w * scale).collect()
}

/// `SkShaderBlurAlgorithm::Compute1DBlurLinearKernel`, ordered as the shader reads it.
pub fn linear_kernel(sigma: f32, radius: i32) -> Vec<(f32, f32)> {
    let full = gaussian_kernel(sigma, radius);
    let half_size = (radius + 1) as usize;
    let half_radius = half_size / 2;
    let mut kernel = vec![0f32; half_size];
    let mut offsets = vec![0f32; half_size];
    let mut low = half_radius as isize - 1;
    let mut index = radius as usize;
    let pair = |wi: f32, wj: f32| (wi + wj, wj / (wi + wj));
    if radius & 1 == 1 {
        let (w, o) = pair(full[index] * 0.5, full[index + 1]);
        kernel[half_radius] = w;
        offsets[half_radius] = o;
        kernel[low as usize] = w;
        offsets[low as usize] = -o;
        index += 1;
        low -= 1;
    } else {
        kernel[half_radius] = full[index];
        offsets[half_radius] = 0.0;
    }
    index += 1;
    for i in half_radius + 1..half_size {
        let (w, o) = pair(full[index], full[index + 1]);
        kernel[i] = w;
        offsets[i] = o + (index as i32 - radius) as f32;
        kernel[low as usize] = kernel[i];
        offsets[low as usize] = -offsets[i];
        index += 2;
        low -= 1;
    }
    offsets.into_iter().zip(kernel).collect()
}

const GRAPHITE_SHADER: &str = r#"
struct Down { src_bounds: vec4<f32>, dst_bounds: vec4<f32>, origins: vec4<f32>, pixels: vec4<f32>, src_size: vec4<f32> };
struct Blur1D { dir_size: vec4<f32>, taps: array<vec4<f32>, 8> };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> d: Down;
@group(0) @binding(3) var<uniform> b: Blur1D;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
// One rescale draw: the destination pixel's centre in the new space, mapped back to the
// previous space (RectToRect(from, to) inverted), sampled bilinearly. Outside the surface
// `pixels`: nothing (the next step reads transparent there).
@fragment fn down(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let q = d.origins.zw + pos.xy;
    if (any(q < d.pixels.xy) || any(q > d.pixels.zw)) { return vec4<f32>(0.0); }
    let k = (d.src_bounds.zw - d.src_bounds.xy) / (d.dst_bounds.zw - d.dst_bounds.xy);
    let p = d.src_bounds.xy + (q - d.dst_bounds.xy) * k;
    return textureSampleLevel(src, smp, (p - d.origins.xy) / d.src_size.xy, 0.0);
}
// The 1-D linear-kernel blur effect: Σ weight · child.eval(coord + offset · dir).
@fragment fn blur(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var sum = vec4<f32>(0.0);
    for (var i = 0; i < 8; i = i + 1) {
        let t = b.taps[i];
        sum = sum + t.y * textureSampleLevel(src, smp, (pos.xy + t.x * b.dir_size.xy) / b.dir_size.zw, 0.0);
        sum = sum + t.w * textureSampleLevel(src, smp, (pos.xy + t.z * b.dir_size.xy) / b.dir_size.zw, 0.0);
    }
    return sum;
}
"#;

/// The transparent margin around each rescale surface (bilinear reads past its edge see 0).
const STEP_MARGIN: i32 = 4;

/// [`GraphitePlan`]'s passes on the GPU, 8-bit premultiplied surfaces as Skia's. Its targets,
/// uniform buffers and bind groups are kept between runs: a blur run every frame (a filtered
/// shape that moves) allocates nothing once its sizes have been seen.
#[derive(Default)]
pub struct GraphiteBlur {
    built: Option<GraphiteBuilt>,
    targets: Vec<((u32, u32), wgpu::TextureView)>,
    params: Vec<wgpu::Buffer>,
    /// Per slot: the view it last read and its bind group.
    binds: Vec<Option<(wgpu::TextureView, wgpu::BindGroup)>>,
    sizes: Vec<(u32, u32)>,
    /// The linear kernel's taps for (σ bits, radius).
    taps: Option<((u32, i32), [f32; 32])>,
}

struct GraphiteBuilt {
    down: wgpu::RenderPipeline,
    blur: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
}

/// A texture with the layer-space position of its texel (0, 0).
pub struct Placed<'a> {
    /// The texture.
    pub view: &'a wgpu::TextureView,
    /// Texel (0, 0)'s layer position.
    pub origin: [i32; 2],
    /// Its size in texels.
    pub size: [u32; 2],
}

/// The blurred low-resolution image: texel (0, 0) at `origin` in the plan's low-resolution
/// space ([`GraphitePlan::to_low`]), to be sampled bilinearly.
pub struct Blurred<'a> {
    /// The texture.
    pub view: &'a wgpu::TextureView,
    /// Texel (0, 0)'s position in the low-resolution space.
    pub origin: [i32; 2],
    /// Its size in texels.
    pub size: [u32; 2],
}

/// The format of every Graphite surface here: BGRA8 premultiplied in RN, the same bytes.
pub const GRAPHITE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

impl GraphiteBlur {
    /// The bind group of `slot` reading `view` (made once per view and slot).
    fn bind(&mut self, device: &wgpu::Device, slot: usize, view: &wgpu::TextureView) {
        if self.binds.len() <= slot {
            self.binds.resize_with(slot + 1, || None);
        }
        if self.binds[slot].as_ref().is_some_and(|(v, _)| v == view) {
            return;
        }
        let built = self.built.as_ref().unwrap();
        let params = &self.params[slot];
        let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("graphite blur"),
            layout: &built.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&built.sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: params, offset: 0, size: wgpu::BufferSize::new(80) }) },
                wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: params, offset: 256, size: wgpu::BufferSize::new(144) }) },
            ],
        });
        self.binds[slot] = Some((view.clone(), group));
    }

    /// Runs `plan` on `source` (the layer image, transparent outside the plan's layer).
    pub fn run<'s>(&'s mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, source: Placed<'_>, plan: &GraphitePlan) -> Blurred<'s> {
        if self.built.is_none() {
            self.built = Some(build_graphite(device));
        }
        // Surfaces: one per step, then the two blur passes on the low-res grid with room for
        // the kernel's reach.
        let reach = plan.low_radius + 2;
        let low_origin = [plan.low_pixels[0] - reach, plan.low_pixels[1] - reach];
        let low_size = [(plan.low_pixels[2] - plan.low_pixels[0] + 2 * reach) as u32, (plan.low_pixels[3] - plan.low_pixels[1] + 2 * reach) as u32];
        // σ ≤ 4 has no rescale: the source is read on the low-res grid. A source placed
        // otherwise is first copied there (an identity step: texel centres onto texel centres).
        let src = plan.src_rect.map(|v| v as f32);
        let copy = [RescaleStep { from: src, to: src, pixels: plan.src_rect }];
        let steps: &[RescaleStep] = if plan.steps.is_empty() && (source.origin, source.size) != (low_origin, low_size) { &copy } else { &plan.steps };
        let n = steps.len();
        self.sizes.clear();
        for (i, s) in steps.iter().enumerate() {
            self.sizes.push(if i + 1 == n { (low_size[0], low_size[1]) } else { ((s.pixels[2] - s.pixels[0] + 2 * STEP_MARGIN) as u32, (s.pixels[3] - s.pixels[1] + 2 * STEP_MARGIN) as u32) });
        }
        self.sizes.push((low_size[0], low_size[1]));
        self.sizes.push((low_size[0], low_size[1]));
        let count = self.sizes.len();
        self.targets.truncate(count);
        for i in 0..count {
            let size = self.sizes[i];
            if self.targets.get(i).map(|t| t.0) != Some(size) {
                let view = crate::render::sampled_target(device, "graphite blur", GRAPHITE_FORMAT, size.0, size.1);
                if i < self.targets.len() {
                    self.targets[i] = (size, view);
                } else {
                    self.targets.push((size, view));
                }
            }
        }
        while self.params.len() < count {
            self.params.push(device.create_buffer(&wgpu::BufferDescriptor { label: Some("graphite blur"), size: 400, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }));
        }
        let put = |data: &mut [u8; 400], at: usize, v: &[f32]| {
            for (k, f) in v.iter().enumerate() {
                data[at + 4 * k..at + 4 * k + 4].copy_from_slice(&f.to_le_bytes());
            }
        };
        let (mut prev_origin, mut prev_size) = (source.origin, source.size);
        for i in 0..n {
            let step = steps[i];
            let margin = if i + 1 == n { reach } else { STEP_MARGIN };
            let origin = [step.pixels[0] - margin, step.pixels[1] - margin];
            let mut data = [0u8; 400];
            put(&mut data, 0, &[
                step.from[0], step.from[1], step.from[2], step.from[3],
                step.to[0], step.to[1], step.to[2], step.to[3],
                prev_origin[0] as f32, prev_origin[1] as f32, origin[0] as f32, origin[1] as f32,
                step.pixels[0] as f32, step.pixels[1] as f32, step.pixels[2] as f32, step.pixels[3] as f32,
                prev_size[0] as f32, prev_size[1] as f32, 0.0, 0.0,
            ]);
            queue.write_buffer(&self.params[i], 0, &data);
            let input = if i == 0 { source.view.clone() } else { self.targets[i - 1].1.clone() };
            self.bind(device, i, &input);
            let built = self.built.as_ref().unwrap();
            crate::render::fullscreen_pass(encoder, "graphite rescale", &self.targets[i].1, &built.down, &self.binds[i].as_ref().unwrap().1);
            prev_origin = origin;
            prev_size = [self.sizes[i].0, self.sizes[i].1];
        }
        // With no step the low-res image is the source; put it on the blur grid first.
        let key = (plan.low_sigma.to_bits(), plan.low_radius);
        if self.taps.as_ref().map(|t| t.0) != Some(key) {
            let mut taps = [0f32; 32];
            for (k, (o, w)) in plan.linear_kernel().into_iter().enumerate() {
                taps[2 * k] = o;
                taps[2 * k + 1] = w;
            }
            self.taps = Some((key, taps));
        }
        let taps = self.taps.as_ref().unwrap().1;
        let low_index = if n == 0 { usize::MAX } else { n - 1 };
        for (pass, dir) in [[1.0f32, 0.0], [0.0, 1.0]].into_iter().enumerate() {
            let slot = count - 2 + pass;
            // The blur's uniforms sit at offset 256 (the uniform offset alignment).
            let mut data = [0u8; 400];
            put(&mut data, 256, &[dir[0], dir[1], low_size[0] as f32, low_size[1] as f32]);
            put(&mut data, 272, &taps);
            queue.write_buffer(&self.params[slot], 0, &data);
            let input = if pass == 1 {
                self.targets[slot - 1].1.clone()
            } else if low_index != usize::MAX {
                self.targets[low_index].1.clone()
            } else {
                assert_eq!((source.origin, source.size), (low_origin, low_size), "a σ ≤ 4 blur reads the source on the low-res grid");
                source.view.clone()
            };
            self.bind(device, slot, &input);
            let built = self.built.as_ref().unwrap();
            crate::render::fullscreen_pass(encoder, "graphite blur 1d", &self.targets[slot].1, &built.blur, &self.binds[slot].as_ref().unwrap().1);
        }
        let _ = prev_size;
        Blurred { view: &self.targets[count - 1].1, origin: low_origin, size: low_size }
    }
}

fn build_graphite(device: &wgpu::Device) -> GraphiteBuilt {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("graphite blur"), source: wgpu::ShaderSource::Wgsl(GRAPHITE_SHADER.into()) });
    let uniform = |binding| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
        count: None,
    };
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("graphite blur"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            uniform(2),
            uniform(3),
        ],
    });
    let pipeline = |fs| crate::render::fullscreen_pipeline(device, &module, &layout, fs, GRAPHITE_FORMAT, None);
    GraphiteBuilt { down: pipeline("down"), blur: pipeline("blur"), layout, sampler: crate::render::linear_sampler(device) }
}

#[cfg(test)]
mod graphite_tests {
    use super::*;

    #[test]
    fn step_counts_follow_skia() {
        // σ 75 (25 pt at 3×): 4/75 → ceil(18.75) = 19 → 5 steps (the last 0.853 < 0.9 stays).
        assert_eq!(downscale_step_count(4.0 / 75.0), 5);
        // σ 50 (2×): 4/50 → 13 → 4 steps, the last 0.64.
        assert_eq!(downscale_step_count(4.0 / 50.0), 4);
        assert_eq!(downscale_step_count(1.0), 0);
        // 0.95 of a single step is not near the identity (limit 0.999): one step.
        assert_eq!(downscale_step_count(0.95), 1);
        assert_eq!(downscale_step_count(0.9995), 0);
    }

    #[test]
    fn the_linear_kernel_reproduces_the_gaussian() {
        // σ 4 → radius 12 → 13 taps; read back with exact bilinear weights they are the
        // 25-tap discrete Gaussian.
        let k = linear_kernel(4.0, 12);
        assert_eq!(k.len(), 13);
        let full = gaussian_kernel(4.0, 12);
        let mut back = vec![0f32; 25];
        for (o, w) in k {
            let x = o + 12.0;
            let i = x.floor() as usize;
            let f = x - i as f32;
            back[i] += w * (1.0 - f);
            if f > 0.0 {
                back[i + 1] += w * f;
            }
        }
        for (a, b) in back.iter().zip(&full) {
            assert!((a - b).abs() < 1e-6, "{a} {b}");
        }
        assert!((full.iter().sum::<f32>() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn the_plan_of_the_fractal_glass_blur() {
        // iPhone Air 3×: the pane (40, 306, 380, 606) pt = (120, 918, 1140, 1818) px; the
        // circle at (180, 270) r 100 → (240, 510, 840, 1110) px; σ 75 → R 225.
        let desired = [120, 918, 1140, 1818];
        let layer = intersect(outset(desired, 225, 225), round_out([240.0, 510.0, 840.0, 1110.0])).unwrap();
        assert_eq!(layer, [240, 693, 840, 1110]);
        let plan = GraphitePlan::new(layer, desired, 75.0).unwrap();
        assert_eq!(plan.radius, 225);
        assert_eq!(plan.steps.len(), 5);
        assert_eq!(plan.src_rect, layer);
        // Halvings about the centre (540, 901.5), then 0.853.
        assert_eq!(plan.steps[0].to, [-150.0, -104.25, 150.0, 104.25]);
        assert_eq!(plan.steps[0].pixels, [-150, -105, 150, 105]);
        assert!((plan.steps[4].to[2] - plan.steps[4].to[0] - 600.0 * 4.0 / 75.0).abs() < 1e-3);
        assert!((plan.low_sigma - 4.0).abs() < 1e-5);
        assert_eq!(plan.low_radius, 12);
        // A layer point maps there and back.
        let p = plan.to_layer(plan.to_low([500.0, 900.0]));
        assert!((p[0] - 500.0).abs() < 1e-3 && (p[1] - 900.0).abs() < 1e-3);
        // The output stays within the pane.
        assert!(plan.output[0] >= 120 && plan.output[3] <= 1818);
    }
}
