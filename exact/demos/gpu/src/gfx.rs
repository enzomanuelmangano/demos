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

/// Where a one-line RN `<Text>` box's baseline sits: an ascent below its top (TextKit's line
/// fragment starts at the box top; measured by exact/parity-tools/text-probe).
pub fn baseline(font: &skia::Font, top: f32) -> f32 {
    top - font.metrics().ascent
}

/// The height of one line of `font` (an RN `<Text>` with no `lineHeight`): ascent + descent.
/// RN's NSLayoutManager has `usesFontLeading = NO`, so the hhea line gap is not in the line
/// (AntDesign, Entypo and Ionicons have one: their boxes were a lineGap too tall).
pub fn line_height(font: &skia::Font) -> f32 {
    font.ui_line_height()
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

/// RN Skia's canvas on iOS: an 8-bit Display P3 surface that Core Animation converts to the
/// screen. Every flat colour takes a rounded P3 round trip (#F7FFF7 shows as (246, 255, 247),
/// #F38D68 as (243, 141, 105)) and antialiased edges, glyphs and clips blend P3 values (a
/// half-covered #4ECDC4 edge over #F7FFF7: RN (169, 231, 222), an sRGB blend 163 in red).
/// `draw` renders the canvas into an Rgba8Unorm layer with `renderer.p3` set, then converts each
/// pixel to sRGB, unpremultiplied, into the target (theme-canvas-animation, measured).
#[derive(Default)]
pub struct P3Layer {
    layer: Option<(u32, u32, wgpu::TextureView)>,
    pipe: Option<(wgpu::TextureFormat, wgpu::RenderPipeline, wgpu::BindGroupLayout)>,
    bind: Option<wgpu::BindGroup>,
}

const P3_RESOLVE: &str = r#"
@group(0) @binding(0) var layer: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(p * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Linear Display P3 to linear sRGB (D65).
fn p3_lin_to_srgb_lin(l: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b);
}
fn resolve(pos: vec4<f32>) -> vec4<f32> {
    let c = textureLoad(layer, vec2<i32>(pos.xy), 0);
    if (c.a <= 0.0) { return vec4<f32>(0.0); }
    return vec4<f32>(c.rgb / c.a, c.a);
}
// An encoded (unorm) target.
@fragment fn fs_encoded(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let c = resolve(pos);
    return vec4<f32>(enc(p3_lin_to_srgb_lin(lin(c.rgb))) * c.a, c.a);
}
// An sRGB target (the hardware encodes): write linear.
@fragment fn fs_linear(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let c = resolve(pos);
    return vec4<f32>(lin(enc(p3_lin_to_srgb_lin(lin(c.rgb)))) * c.a, c.a);
}
"#;

impl P3Layer {
    /// Draws `canvas` as RN Skia would show it: into the P3 layer (cleared to `clear`), then
    /// converted into `target` (`width`×`height` pixels).
    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        renderer: &mut skia::Renderer,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        canvas: &skia::Canvas,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        clear: wgpu::Color,
    ) {
        renderer.p3 = true;
        if self.layer.as_ref().map(|l| (l.0, l.1)) != Some((width, height)) {
            self.layer = Some((width, height, self::target(device, "p3 layer", wgpu::TextureFormat::Rgba8Unorm, width, height)));
            self.bind = None;
        }
        if self.pipe.as_ref().map(|p| p.0) != Some(format) {
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("p3 layer"), source: wgpu::ShaderSource::Wgsl(P3_RESOLVE.into()) });
            let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("p3 layer"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
                    count: None,
                }],
            });
            let fs = if format.is_srgb() { "fs_linear" } else { "fs_encoded" };
            let pipeline = fullscreen(device, format, &module, &layout, "vs", fs, None, "p3 layer");
            self.pipe = Some((format, pipeline, layout));
            self.bind = None;
        }
        let (_, _, layer) = self.layer.as_ref().unwrap();
        let (_, pipeline, layout) = self.pipe.as_ref().unwrap();
        let bind = self.bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("p3 layer"),
                layout,
                entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(layer) }],
            })
        });
        renderer.draw(device, queue, encoder, canvas, layer, wgpu::TextureFormat::Rgba8Unorm, width, height, clear);
        pass(encoder, "p3 layer", target, pipeline, bind);
    }
}
