//! A column of the numbers 99 … 0 on black, with one item centred at a time. Each item tips back
//! about its centre as it leaves the middle, fading and blurring.
//!
//! - The list is inverted and snaps one item at a time; a drag moves it 1:1.
//! - Each number is a sweep-coloured glyph set with a solid glow, drawn in a perspective layer.
//! - Haptics: a selection each time the centred number changes; a rigid impact once per pull past
//!   an end.
//!
//! The frame: a number is baked once (text, glow, sweep) into a pooled texture, the five around
//! the centre kept ready so a drag never waits for one. A leaving number's blur is a halving
//! chain and a separable Gaussian on fixed textures, then one perspective quad that also
//! converts P3 to sRGB. Nothing is created while scrolling, and nothing is drawn at rest.
//!
//! No inputs.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use draw2d::blur::{ceil_size, outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use draw2d::{point, stops, Canvas, Color, Font, Matrix4, Paint, Renderer, Shader};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

const COUNT: usize = 100;
const PERSPECTIVE: f32 = 200.0;
const FONT_SIZE: f32 = 175.0;
/// Glow blur (σ, points) around the number's glyphs.
const GLOW: f32 = 4.0;
/// The leave: the largest tilt (rad), the range over which it fades (fractions of an item from
/// the centre), the blur at its end (σ, pt) and the scale at its end.
const LEAVE_TILT: f64 = 58.0 * std::f64::consts::PI / 180.0;
const LEAVE_FROM: f64 = 0.25;
const LEAVE_TO: f64 = 0.85;
const LEAVE_BLUR: f64 = 12.0;
const LEAVE_SCALE: f64 = 0.86;
/// Baked numbers kept: the centre and two either side (a frame moves less than an item).
const POOL: usize = 5;
/// Halvings of the blur's chain (σ 4 px per halving up to 64 px).
const LEVELS: usize = 4;
/// Numbers drawn at once.
const ROWS: usize = 2;
/// A blur's widest kernel on its low-resolution grid: 12 taps either side in 6 linear pairs.
const PAIRS: usize = 6;
/// Dynamic-uniform slots (256 B each): a quad per row, a horizontal and a vertical pass per row.
const ARENA_SLOTS: usize = 2 + 2 * ROWS;
/// A blur under this σ (px) is not drawn.
const MIN_SIGMA: f32 = 0.15;

/// 6t⁵ − 15t⁴ + 10t³ of t = (x − a) / (b − a) clamped: flat at both ends.
fn smootherstep(a: f64, b: f64, x: f64) -> f64 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-item line the offset goes before the haptics' item changes, pt.
const SWITCH: f64 = 6.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;

static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");

/// The demo's surface (no inputs).
pub fn surface() -> Box<dyn Surface> {
    Box::new(new())
}

fn new() -> ScrollTransition {
    ScrollTransition {
        size: (0.0, 0.0),
        scale: 0.0,
        scroll: UiScroll::new(0.0, 0.0, 0.0, FAST, Snap::Free),
        font: Font::new(SF_ROUNDED_BOLD, FONT_SIZE),
        sweep: None,
        text: [None, None],
        glow: [(GraphiteBlur::default(), None), (GraphiteBlur::default(), None)],
        renderers: [Renderer::default(), Renderer::default()],
        renderer: Renderer::default(),
        canvas: Canvas::default(),
        gpu: None,
        targets: None,
        centred: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    }
}

/// The pipelines and the buffers that live as long as the target format.
struct Gpu {
    format: wgpu::TextureFormat,
    /// The bake's combine: a uniform and three textures.
    layout: wgpu::BindGroupLayout,
    combine: wgpu::RenderPipeline,
    combine_buffers: [wgpu::Buffer; 2],
    combine_binds: [Option<([wgpu::TextureView; 3], wgpu::BindGroup)>; 2],
    /// The passes' layout: a dynamic uniform, a texture, a sampler.
    pass_layout: wgpu::BindGroupLayout,
    down: wgpu::RenderPipeline,
    blur: wgpu::RenderPipeline,
    quad: wgpu::RenderPipeline,
    arena: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

/// Everything sized by the item: the baked numbers, each row's blur chain, and the bind groups
/// that read them. Made once per size.
struct Targets {
    px: (u32, u32),
    /// The baked numbers (P3, premultiplied) and which item each holds.
    items: [wgpu::TextureView; POOL],
    owner: [Option<usize>; POOL],
    /// Per row: the halving chain (level l at index l − 1), the blur's scratch per level
    /// (level 0 at index 0) and the full-size result of a blur that needs no halving.
    down: [[wgpu::TextureView; LEVELS]; ROWS],
    tmp: [[wgpu::TextureView; LEVELS + 1]; ROWS],
    out0: [wgpu::TextureView; ROWS],
    read_item: [wgpu::BindGroup; POOL],
    read_down: [[wgpu::BindGroup; LEVELS]; ROWS],
    read_tmp: [[wgpu::BindGroup; LEVELS + 1]; ROWS],
    read_out0: [wgpu::BindGroup; ROWS],
}

struct ScrollTransition {
    size: (f32, f32),
    scale: f32,
    scroll: UiScroll,
    font: Option<Font>,
    /// The sweep filling the canvas, (size) and its texture.
    sweep: Option<((u32, u32), wgpu::TextureView)>,
    /// The text's coverage, one slot per item parity; each slot is written once a frame.
    text: [Option<((u32, u32), wgpu::TextureView)>; 2],
    glow: [(GraphiteBlur, Option<GraphitePlan>); 2],
    renderers: [Renderer; 2],
    renderer: Renderer,
    canvas: Canvas,
    gpu: Option<Gpu>,
    targets: Option<Targets>,
    /// The centred item, and whether the list is past an end (their haptics).
    centred: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
}

/// One number on screen this frame.
#[derive(Clone, Copy)]
struct Row {
    item: usize,
    pool: usize,
    opacity: f32,
    /// The blur's σ in layer pixels.
    sigma: f32,
    rotate: f32,
    shrink: f32,
    top: f64,
    height: f64,
}

impl ScrollTransition {
    fn item(&self) -> f64 {
        self.size.0 as f64 * 0.55
    }
    fn pad(&self) -> f64 {
        self.size.1 as f64 / 2.0 - self.item() / 2.0
    }
    fn round(&self, v: f64) -> f64 {
        let s = self.scale as f64;
        (v * s + 1e-6).round() / s
    }
    /// Item i's top and height in the content, on the pixel grid.
    fn cell(&self, i: usize) -> (f64, f64) {
        let top = self.pad() + i as f64 * self.item();
        let t = self.round(top);
        (t, self.round(top + self.item()) - t)
    }
    /// The baked textures' size: the width, and the tallest cell (a cell is a pixel taller one
    /// time in three).
    fn bake_px(&self) -> (u32, u32) {
        ((self.size.0 * self.scale).round() as u32, (self.item() * self.scale as f64).ceil() as u32 + 1)
    }
    /// A selection when the centred number changes (one per HAPTIC_GAP_MS at most), a rigid thunk
    /// once per pull past an end.
    fn haptics(&mut self, now: f64) {
        let (offset, max) = (self.scroll.offset, self.scroll.max);
        // The centred item holds until the offset is SWITCH past the half-item line: a finger
        // hovering there does not flap.
        let f = offset / self.item();
        let centred = match self.centred {
            Some(c) if (f - c as f64).abs() < 0.5 + SWITCH / self.item() => c,
            _ => f.round().clamp(0.0, (COUNT - 1) as f64) as i64,
        };
        if self.centred.is_some_and(|c| c != centred) && now - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = now;
        }
        self.centred = Some(centred);
        if offset < -PAST_END || offset > max + PAST_END {
            if !self.past_end {
                self.posted.push("haptic:impact-rigid".into());
            }
            self.past_end = true;
        } else if (0.0..=max).contains(&offset) {
            self.past_end = false;
        }
    }

    fn configure(&mut self) {
        let item = self.item();
        let port = self.size.1 as f64;
        let s = &mut self.scroll;
        s.max = (COUNT - 1) as f64 * item;
        s.port = port;
        s.snap = Snap::Interval(item);
    }
}

const WGSL: &str = r#"
struct U {
    // .x: σ > 0 (a blur to read); .y: sRGB target
    a: vec4<f32>,
    low: vec4<f32>,
    out: vec4<f32>,
    // the layer's reach past the canvas (px)
    reach: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var t2: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

// The Mask's layer: the sweep (t0), kept (dstIn) where the text's solid-blurred coverage is:
// the glyphs (t1) over their blur (t2, Graphite's, low resolution).
@fragment fn combine(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    let sweep = textureLoad(t0, vec2<i32>(p), 0);
    let text = textureLoad(t1, vec2<i32>(p), 0).a;
    var glow = 0.0;
    if (all(p >= u.out.xy) && all(p <= u.out.zw)) {
        glow = q8(textureSampleLevel(t2, smp, p * u.low.xy + u.low.zw, 0.0)).a;
    }
    let m = q8(vec4<f32>(text + glow * (1.0 - text))).a;
    return q8(sweep * m);
}
"#;

/// The blur's passes: a 2 x 2 box down to half size, and one direction of a Gaussian in linear
/// taps (the weights and offsets come from the CPU).
const PASS_WGSL: &str = r#"
struct U {
    // dx, dy, the centre weight, the pair count
    dir: vec4<f32>,
    // (offset, weight) x 2 per vec4
    taps: array<vec4<f32>, 3>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

@fragment fn down(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let hi = vec2<i32>(textureDimensions(t0)) - vec2<i32>(1);
    let p = vec2<i32>(pos.xy) * 2;
    return 0.25 * (
        textureLoad(t0, min(p, hi), 0) +
        textureLoad(t0, min(p + vec2<i32>(1, 0), hi), 0) +
        textureLoad(t0, min(p + vec2<i32>(0, 1), hi), 0) +
        textureLoad(t0, min(p + vec2<i32>(1, 1), hi), 0));
}

@fragment fn blur(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(t0));
    let uv = pos.xy / dims;
    let step = u.dir.xy / dims;
    var c = textureSampleLevel(t0, smp, uv, 0.0) * u.dir.z;
    let n = i32(u.dir.w);
    for (var j = 0; j < n; j++) {
        let t = u.taps[j / 2];
        let tap = select(t.xy, t.zw, (j & 1) == 1);
        c += (textureSampleLevel(t0, smp, uv + step * tap.x, 0.0) + textureSampleLevel(t0, smp, uv - step * tap.x, 0.0)) * tap.y;
    }
    return c;
}
"#;

const QUAD_WGSL: &str = r#"
struct U {
    h0: vec4<f32>,
    h1: vec4<f32>,
    h2: vec4<f32>,
    // canvas (points): w, h; the item's w, h
    size: vec4<f32>,
    // scale, opacity, srgb target, the texture's px w
    a: vec4<f32>,
    // the texture's px h, layer px per texel, the layer's px w, h
    b: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct V { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32> };

@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
    let f = vec3<f32>(f32(i & 1u) * u.size.z, f32(i >> 1u) * u.size.w, 1.0);
    let x = dot(u.h0.xyz, f);
    let y = dot(u.h1.xyz, f);
    let w = dot(u.h2.xyz, f);
    var o: V;
    o.pos = vec4<f32>(2.0 * x / u.size.x - w, w - 2.0 * y / u.size.y, 0.0, w);
    o.local = f.xy;
    return o;
}
fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249 * l.r - 0.2247 * l.g,
        -0.0420 * l.r + 1.0419 * l.g,
        -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}
// The number as Core Animation shows it: the layer (or its blur, at 1 / b.y of the resolution)
// colour-matched from P3 unpremultiplied, then faded.
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(u.a.w, u.b.x);
    let lim = max(vec2<f32>(u.b.z, u.b.w) / u.b.y - vec2<f32>(0.5), vec2<f32>(0.5));
    let q = clamp(v.local * (u.a.x / u.b.y), vec2<f32>(0.5), lim);
    let t = textureSampleLevel(tex, smp, q / dims, 0.0);
    if (t.a <= 0.0) { return vec4<f32>(0.0); }
    var c = vec4<f32>(p3_to_srgb(t.rgb / t.a) * t.a, t.a) * u.a.y;
    if (u.a.z > 0.5 && c.a > 0.0) { c = vec4<f32>(lin(c.rgb / c.a) * c.a, c.a); }
    return c;
}
"#;

fn entry(binding: u32, ty: wgpu::BindingType) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry { binding, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty, count: None }
}
fn uniform() -> wgpu::BindingType {
    wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }
}
fn dynamic_uniform() -> wgpu::BindingType {
    wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: true, min_binding_size: None }
}
fn texture() -> wgpu::BindingType {
    wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }
}
fn sampler() -> wgpu::BindingType {
    wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering)
}
fn buffer(device: &wgpu::Device, size: u64) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor { label: Some("scroll 3d"), size, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false })
}
/// `v` as little-endian f32 into `bytes` at `at`.
fn put(bytes: &mut [u8], at: usize, v: &[f32]) {
    for (k, f) in v.iter().enumerate() {
        bytes[at + 4 * k..at + 4 * k + 4].copy_from_slice(&f.to_le_bytes());
    }
}
/// The blurred image's uv for a layer pixel.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

/// The halvings and the σ on the grid they leave, for a blur of `sigma` px: the smallest chain
/// that brings σ to 4 px or less (a kernel of at most 12 taps either side).
fn blur_levels(sigma: f32) -> (usize, f32) {
    let mut k = 0;
    while k < LEVELS && sigma / (1u32 << k) as f32 > 4.0 {
        k += 1;
    }
    (k, sigma / (1u32 << k) as f32)
}

/// A Gaussian of `sigma` texels as the centre weight and the linear (offset, weight) pairs
/// either side, 3σ out: each pair is two taps in one bilinear read.
fn linear_taps(sigma: f32) -> (f32, usize, [f32; 2 * PAIRS]) {
    let radius = ((3.0 * sigma).ceil() as usize).clamp(1, 2 * PAIRS);
    let mut w = [0f32; 2 * PAIRS + 1];
    let mut sum = 0.0;
    for (i, wi) in w.iter_mut().enumerate().take(radius + 1) {
        *wi = (-((i * i) as f32) / (2.0 * sigma * sigma)).exp();
        sum += if i == 0 { *wi } else { 2.0 * *wi };
    }
    let mut taps = [0f32; 2 * PAIRS];
    let pairs = radius.div_ceil(2);
    for j in 0..pairs {
        let (a, b) = (2 * j + 1, 2 * j + 2);
        let (wa, wb) = (w[a] / sum, if b <= radius { w[b] / sum } else { 0.0 });
        taps[2 * j] = (a as f32 * wa + b as f32 * wb) / (wa + wb);
        taps[2 * j + 1] = wa + wb;
    }
    (w[0] / sum, pairs, taps)
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("scroll 3d"), source: wgpu::ShaderSource::Wgsl(WGSL.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("scroll 3d"),
        entries: &[entry(0, uniform()), entry(1, texture()), entry(2, texture()), entry(3, texture()), entry(4, sampler())],
    });
    let combine = draw2d::render::fullscreen_pipeline(device, &module, &layout, "combine", GRAPHITE_FORMAT, None);
    let pass_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("scroll 3d pass"),
        entries: &[entry(0, dynamic_uniform()), entry(1, texture()), entry(2, sampler())],
    });
    let pm = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("scroll 3d pass"), source: wgpu::ShaderSource::Wgsl(PASS_WGSL.into()) });
    let down = draw2d::render::fullscreen_pipeline(device, &pm, &pass_layout, "down", GRAPHITE_FORMAT, None);
    let blur = draw2d::render::fullscreen_pipeline(device, &pm, &pass_layout, "blur", GRAPHITE_FORMAT, None);
    let qm = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("scroll 3d quad"), source: wgpu::ShaderSource::Wgsl(QUAD_WGSL.into()) });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("scroll 3d quad"), bind_group_layouts: &[Some(&pass_layout)], immediate_size: 0 });
    let quad = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("scroll 3d quad"),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module: &qm, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &qm,
            entry_point: Some("fs"),
            targets: &[Some(wgpu::ColorTargetState { format, blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, ..Default::default() },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    Gpu {
        format,
        layout,
        combine,
        combine_buffers: [buffer(device, 64), buffer(device, 64)],
        combine_binds: [None, None],
        pass_layout,
        down,
        blur,
        quad,
        arena: buffer(device, 256 * ARENA_SLOTS as u64),
        sampler: draw2d::render::linear_sampler(device),
    }
}

fn group(device: &wgpu::Device, gpu: &Gpu, buffer: &wgpu::Buffer, t: [&wgpu::TextureView; 3]) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("scroll 3d"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: buffer.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(t[0]) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(t[1]) },
            wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(t[2]) },
            wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
        ],
    })
}

/// A pass's bind group: the arena's slot (set per draw), a texture, the sampler.
fn read(device: &wgpu::Device, gpu: &Gpu, view: &wgpu::TextureView) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("scroll 3d pass"),
        layout: &gpu.pass_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &gpu.arena, offset: 0, size: wgpu::BufferSize::new(256) }) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(view) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
        ],
    })
}

/// One fullscreen pass of `pipeline` into `target`, its uniform at arena slot `slot`.
fn pass(encoder: &mut wgpu::CommandEncoder, label: &str, target: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, bind: &wgpu::BindGroup, slot: usize) {
    let mut p = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: target,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    p.set_pipeline(pipeline);
    p.set_bind_group(0, bind, &[(slot * 256) as u32]);
    p.draw(0..3, 0..1);
}

impl Targets {
    fn new(device: &wgpu::Device, gpu: &Gpu, px: (u32, u32)) -> Targets {
        let target = |label: &str, w: u32, h: u32| draw2d::render::sampled_target(device, label, GRAPHITE_FORMAT, w, h);
        let at = |l: usize| (px.0.div_ceil(1 << l), px.1.div_ceil(1 << l));
        let items: [wgpu::TextureView; POOL] = std::array::from_fn(|_| target("scroll 3d item", px.0, px.1));
        let down: [[wgpu::TextureView; LEVELS]; ROWS] = std::array::from_fn(|_| std::array::from_fn(|l| target("scroll 3d down", at(l + 1).0, at(l + 1).1)));
        let tmp: [[wgpu::TextureView; LEVELS + 1]; ROWS] = std::array::from_fn(|_| std::array::from_fn(|l| target("scroll 3d blur", at(l).0, at(l).1)));
        let out0: [wgpu::TextureView; ROWS] = std::array::from_fn(|_| target("scroll 3d blurred", px.0, px.1));
        Targets {
            px,
            read_item: std::array::from_fn(|p| read(device, gpu, &items[p])),
            read_down: std::array::from_fn(|j| std::array::from_fn(|l| read(device, gpu, &down[j][l]))),
            read_tmp: std::array::from_fn(|j| std::array::from_fn(|l| read(device, gpu, &tmp[j][l]))),
            read_out0: std::array::from_fn(|j| read(device, gpu, &out0[j])),
            items,
            owner: [None; POOL],
            down,
            tmp,
            out0,
        }
    }
}

impl ScrollTransition {
    /// Number `i`, baked into pool slot `p`: its sweep, kept where the text and its glow are.
    fn bake(&mut self, i: usize, p: usize, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) -> bool {
        let Some(font) = self.font.as_ref() else { return false };
        let px = self.targets.as_ref().unwrap().px;
        let (w, h) = (px.0 as f32 / self.scale, px.1 as f32 / self.scale);
        if self.sweep.as_ref().map(|s| s.0) != Some(px) {
            let view = draw2d::render::sampled_target(device, "scroll 3d sweep", GRAPHITE_FORMAT, px.0, px.1);
            let colors = [Color::rgb8(0, 255, 255), Color::rgb8(255, 0, 255), Color::rgb8(255, 255, 0), Color::rgb8(0, 255, 255)];
            self.canvas.begin(self.scale);
            let size = self.item() as f32;
            self.canvas.draw_rect(0.0, 0.0, w, h, &Paint::shader(Shader::Sweep { center: point(self.size.0 / 2.0, size / 2.0), stops: stops(&colors) }));
            self.renderer.p3 = true;
            self.renderer.draw(device, queue, encoder, &self.canvas, &view, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
            self.sweep = Some((px, view));
        }
        let k = i % 2;
        if self.text[k].as_ref().map(|t| t.0) != Some(px) {
            self.text[k] = Some((px, draw2d::render::sampled_target(device, "scroll 3d text", GRAPHITE_FORMAT, px.0, px.1)));
        }
        let text = (COUNT - 1 - i).to_string();
        let width = font.measure_text(&text).width;
        let size = self.item() as f32;
        self.canvas.begin(self.scale);
        self.canvas.draw_text(&text, self.size.0 / 2.0 - width / 2.0, size / 2.0 + FONT_SIZE / 4.0, font, &Paint::fill(Color::WHITE));
        let text_view = self.text[k].as_ref().unwrap().1.clone();
        self.renderers[k].p3 = true;
        self.renderers[k].draw(device, queue, encoder, &self.canvas, &text_view, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        // The glow: a solid blur of the coverage, under the glyphs.
        let sigma = GLOW * self.scale;
        let reach = ceil_size(3.0 * sigma);
        let bounds = [0, 0, px.0 as i32, px.1 as i32];
        let layer = outset(bounds, reach, reach);
        let (blur, plan) = (&mut self.glow[k].0, &mut self.glow[k].1);
        let ok = match plan {
            Some(p) => p.update(layer, bounds, sigma),
            None => {
                *plan = GraphitePlan::new(layer, bounds, sigma);
                plan.is_some()
            }
        };
        if !ok {
            return false;
        }
        let plan = plan.as_ref().unwrap();
        let out = blur.run(device, queue, encoder, Placed { view: &text_view, origin: [0, 0], size: [px.0, px.1] }, plan);
        let low = low_mapping(plan, out.origin, out.size);
        let o = plan.output.map(|v| v as f32);
        let glow = out.view.clone();
        let gpu = self.gpu.as_mut().unwrap();
        let mut u = [0u8; 64];
        put(&mut u, 16, &low);
        put(&mut u, 32, &o);
        queue.write_buffer(&gpu.combine_buffers[k], 0, &u);
        let sweep = self.sweep.as_ref().unwrap().1.clone();
        let views = [sweep, text_view, glow];
        if gpu.combine_binds[k].as_ref().is_none_or(|(v, _)| *v != views) {
            let g = group(device, gpu, &gpu.combine_buffers[k], [&views[0], &views[1], &views[2]]);
            gpu.combine_binds[k] = Some((views, g));
        }
        let t = self.targets.as_mut().unwrap();
        draw2d::render::fullscreen_pass(encoder, "scroll 3d combine", &t.items[p], &gpu.combine, &gpu.combine_binds[k].as_ref().unwrap().1);
        t.owner[p] = Some(i);
        true
    }

    /// The pool slot to bake item `i` into: one holding nothing, or an item outside the five
    /// around the centre `c`.
    fn victim(&self, c: i64) -> usize {
        let t = self.targets.as_ref().unwrap();
        let mut best = 0;
        let mut far = -1;
        for (p, o) in t.owner.iter().enumerate() {
            let d = o.map_or(i64::MAX, |i| (i as i64 - c).abs());
            if d > far {
                (best, far) = (p, d);
            }
        }
        best
    }
}

impl Surface for ScrollTransition {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let s = self.item();
        let index = if s > 0.0 { (self.scroll.offset / s).round() as i64 } else { 0 };
        Some(format!(
            "{{\"offset\":{:.2},\"number\":{},\"moving\":{}}}",
            self.scroll.offset,
            COUNT as i64 - 1 - index.clamp(0, COUNT as i64 - 1),
            self.scroll.moving()
        ))
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        // Inverted: the content follows the finger down as the offset grows.
        self.scroll.input(id, gfx::phase(phase), -y, x, at_ms, true);
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
        let resized = (frame.width, frame.height, frame.scale) != (self.size.0, self.size.1, self.scale);
        if resized {
            self.size = (frame.width, frame.height);
            self.scale = frame.scale;
            self.configure();
        }
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            self.gpu = Some(build(device, format));
            self.targets = None;
        }
        if resized || self.targets.is_none() {
            let px = self.bake_px();
            self.targets = Some(Targets::new(device, self.gpu.as_ref().unwrap(), px));
        }
        let moving = self.scroll.step(frame.now_ms);
        self.haptics(frame.now_ms);
        let offset = self.scroll.offset;
        let s = self.item();
        let c = (offset / s).round().clamp(0.0, (COUNT - 1) as f64) as i64;

        // The items with opacity: |scrollY − s·i| < s.
        let mut rows = [None::<Row>; ROWS];
        let mut count = 0;
        let first = ((offset / s).floor() as i64 - 1).max(0) as usize;
        // With two numbers on screen each is blurred at least 0.2 pt (as the reference's layers are).
        let several = (first..(first + 4).min(COUNT)).filter(|&i| (offset - s * i as f64).abs() < s).count() > 1;
        for i in first..(first + 4).min(COUNT) {
            if (offset - s * i as f64).abs() >= s || count == ROWS {
                continue;
            }
            // The leave: d is how far the number is from the centre, 0 to 1 of an item either way. It
            // tips back at most LEAVE_TILT, easing in. From a quarter out it fades, blurs and shrinks on
            // one smootherstep, gone before the tilt could read as a flat sheet. Symmetric both ways.
            let d = ((offset - s * i as f64).abs() / s).min(1.0);
            let k = smootherstep(LEAVE_FROM, LEAVE_TO, d);
            if 1.0 - k <= 0.0 {
                continue;
            }
            let (top, height) = self.cell(i);
            rows[count] = Some(Row {
                item: i,
                pool: 0,
                opacity: (1.0 - k) as f32,
                sigma: if several { ((LEAVE_BLUR * k) as f32).max(0.2) } else { (LEAVE_BLUR * k) as f32 } * frame.scale,
                rotate: (-LEAVE_TILT * smootherstep(0.0, 1.0, d)) as f32,
                shrink: (1.0 - (1.0 - LEAVE_SCALE) * k) as f32,
                top,
                height,
            });
            count += 1;
        }

        // Bake what is on screen, then, one number a frame, the rest of the five around the centre
        // (the two bakes of a frame take different text slots).
        let mut used = [false; 2];
        for row in rows.iter_mut().flatten() {
            let t = self.targets.as_ref().unwrap();
            row.pool = match t.owner.iter().position(|o| *o == Some(row.item)) {
                Some(p) => p,
                None => {
                    let p = self.victim(c);
                    used[row.item % 2] = true;
                    self.bake(row.item, p, device, queue, encoder);
                    p
                }
            };
        }
        let (lo, hi) = ((c - 2).max(0), (c + 2).min(COUNT as i64 - 1));
        let (mut missing, mut next) = (0, None::<i64>);
        for i in lo..=hi {
            if !self.targets.as_ref().unwrap().owner.contains(&Some(i as usize)) {
                missing += 1;
                if next.is_none_or(|n| (i - c).abs() < (n - c).abs()) {
                    next = Some(i);
                }
            }
        }
        if let Some(i) = next.filter(|i| !used[*i as usize % 2]) {
            let p = self.victim(c);
            if self.bake(i as usize, p, device, queue, encoder) {
                missing -= 1;
            }
        }
        let pending = missing > 0 && self.font.is_some();
        let gpu = self.gpu.as_ref().unwrap();
        let targets = self.targets.as_ref().unwrap();

        // The passes' uniforms in one write: the quads at slots 0.., then each row's two blur passes.
        let mut arena = [0u8; 256 * ARENA_SLOTS];
        for (j, row) in rows.iter().flatten().enumerate() {
            let (w, hf) = (frame.width, row.height as f32);
            // The layer: the flipped list puts the cell's top at height − (top + h − offset).
            let screen_top = frame.height as f64 - (row.top + row.height - offset);
            let m = Matrix4::translate(0.0, screen_top as f32, 0.0)
                .multiply(
                    Matrix4::perspective(PERSPECTIVE)
                        .multiply(Matrix4::rotate_x(row.rotate))
                        .multiply(Matrix4::scale(row.shrink, row.shrink, 1.0))
                        .pivot(w / 2.0, hf / 2.0),
                )
                .to_matrix3()
                .rows();
            let mut q = [0f32; 24];
            for r in 0..3 {
                q[r * 4..r * 4 + 3].copy_from_slice(&m[r][..3]);
            }
            q[12] = frame.width;
            q[13] = frame.height;
            q[14] = w;
            q[15] = hf;
            q[16] = frame.scale;
            q[17] = row.opacity;
            q[18] = gfx::srgb_flag(format);
            let (levels, low_sigma) = blur_levels(row.sigma);
            let blurred = row.sigma >= MIN_SIGMA;
            let level = if blurred { levels } else { 0 };
            let tex = if blurred && level > 0 { (targets.px.0.div_ceil(1 << level), targets.px.1.div_ceil(1 << level)) } else { targets.px };
            q[19] = tex.0 as f32;
            q[20] = tex.1 as f32;
            q[21] = (1u32 << level) as f32;
            q[22] = targets.px.0 as f32;
            q[23] = (row.height * frame.scale as f64).round() as f32;
            put(&mut arena, 256 * j, &q);
            if blurred {
                let (w0, pairs, taps) = linear_taps(low_sigma);
                for (dir, slot) in [([1.0f32, 0.0], 2 + 2 * j), ([0.0, 1.0], 3 + 2 * j)] {
                    let mut u = [0f32; 16];
                    u[..4].copy_from_slice(&[dir[0], dir[1], w0, pairs as f32]);
                    u[4..4 + 2 * PAIRS].copy_from_slice(&taps);
                    put(&mut arena, 256 * slot, &u);
                }
            }
        }
        queue.write_buffer(&gpu.arena, 0, &arena);
        for (j, row) in rows.iter().flatten().enumerate() {
            if row.sigma < MIN_SIGMA {
                continue;
            }
            let (levels, _) = blur_levels(row.sigma);
            // Halve down to the level, blur along x then y there.
            for l in 1..=levels {
                let from = if l == 1 { &targets.read_item[row.pool] } else { &targets.read_down[j][l - 2] };
                pass(encoder, "scroll 3d down", &targets.down[j][l - 1], &gpu.down, from, 0);
            }
            let from = if levels == 0 { &targets.read_item[row.pool] } else { &targets.read_down[j][levels - 1] };
            pass(encoder, "scroll 3d blur x", &targets.tmp[j][levels], &gpu.blur, from, 2 + 2 * j);
            let into = if levels == 0 { &targets.out0[j] } else { &targets.down[j][levels - 1] };
            pass(encoder, "scroll 3d blur y", into, &gpu.blur, &targets.read_tmp[j][levels], 3 + 2 * j);
        }
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("scroll 3d"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.quad);
        // The cells in the list's order: a later item over an earlier one.
        for (j, row) in rows.iter().flatten().enumerate() {
            let bind = if row.sigma < MIN_SIGMA {
                &targets.read_item[row.pool]
            } else {
                match blur_levels(row.sigma).0 {
                    0 => &targets.read_out0[j],
                    l => &targets.read_down[j][l - 1],
                }
            };
            pass.set_bind_group(0, bind, &[(256 * j) as u32]);
            pass.draw(0..4, 0..1);
        }
        moving || pending
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn a_drag_down_brings_the_next_number_in_tipping_the_last_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        // The first frames bake the numbers around the centre; then it rests.
        let (mut rest, mut animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        for k in 1..10 {
            if animating {
                (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(k as f64)).unwrap();
            }
        }
        gfx::save_over(&rest, "scroll3d-rest", [0, 0, 0]);
        assert!(!animating);
        // "99" is centred and inked; the top of the screen is black.
        let ink = (3 * 420..3 * 490).flat_map(|y| (3 * 120..3 * 300).map(move |x| (x, y))).filter(|&(x, y)| rest.at(x, y)[..3].iter().map(|&c| c as u32).sum::<u32>() > 200).count();
        assert!(ink > 3000, "{ink}");
        assert_eq!(&rest.at(10, 10)[..3], &[0, 0, 0]);
        assert_eq!(s.agent("{}").unwrap(), "{\"offset\":0.00,\"number\":99,\"moving\":false}");

        // Drag down 140 pt slowly, then lift still: the snap rounds to the next item (231 pt).
        let p = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&p(PointerPhase::Down, 300.0, 0.0));
        let mut ms = 0.0;
        for k in 1..=35 {
            ms += 16.0;
            s.input(&p(PointerPhase::Move, 300.0 + 4.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (mid, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&mid, "scroll3d-mid", [0, 0, 0]);
        ms += 200.0;
        s.input(&p(PointerPhase::Up, 440.0, ms));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"offset\":231.00,\"number\":98,\"moving\":false}");
        // One selection per item change. Dragging past the start gives one rigid impact, however long
        // it is held.
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        s.input(&p(PointerPhase::Down, 600.0, ms));
        for k in 1..=30 {
            ms += 33.0;
            s.input(&p(PointerPhase::Move, 600.0 - 10.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms += 200.0;
        s.input(&p(PointerPhase::Up, 300.0, ms));
        let end = ms + 4000.0;
        while ms < end {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"offset\":0.00,\"number\":99,\"moving\":false}");
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:impact-rigid"]);
    }

    #[test]
    fn the_leave_fades_and_blurs_before_it_tilts_flat() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = new();
        fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        // "99" at d = 0 … 1 of an item from the centre: it leaves downward (the list is inverted) and
        // 98 comes in from above. The lit pixels below the centre are 99's.
        let mut ink = Vec::new();
        for (n, d) in [0.0f64, 0.25, 0.5, 0.75, 1.0].iter().enumerate() {
            s.scroll.set_offset(231.0 * d);
            fixture::render(&gpu, &mut s, &frame(10.0 + n as f64)).unwrap();
            let (img, _) = fixture::render(&gpu, &mut s, &frame(10.5 + n as f64)).unwrap();
            gfx::save_over(&img, &format!("scroll3d-leave-{n}"), [0, 0, 0]);
            let lit = (img.height / 2 + 60..img.height).step_by(3).flat_map(|y| (0..img.width).step_by(3).map(move |x| (x, y))).filter(|&(x, y)| img.at(x, y)[..3].iter().map(|&c| c as u32).sum::<u32>() > 150).count();
            ink.push(lit);
        }
        // A quarter out it is still whole, then it fades and blurs, nearly gone at three quarters.
        assert!(ink[1] > ink[0], "{ink:?}");
        assert!(ink[1] > 0 && ink[3] < ink[2] / 3, "{ink:?}");
    }

    #[test]
    fn the_kernel_sums_to_one_and_the_chain_brings_sigma_under_four() {
        for sigma in [0.6f32, 2.0, 4.0, 9.0, 20.0, 36.0] {
            let (k, low) = blur_levels(sigma);
            assert!(low <= 4.0 && (low * (1u32 << k) as f32 - sigma).abs() < 1e-4, "{sigma} {k} {low}");
            let (w0, pairs, taps) = linear_taps(low);
            let sum = w0 + 2.0 * (0..pairs).map(|j| taps[2 * j + 1]).sum::<f32>();
            assert!((sum - 1.0).abs() < 1e-4, "{sigma}: {sum}");
            assert!(pairs <= PAIRS);
        }
    }

    #[test]
    fn a_flick_draws_from_the_pool_and_rest_draws_nothing() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = new();
        let format = wgpu::TextureFormat::Rgba8Unorm;
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d { width: 1260, height: 2736, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&Default::default());
        // A frame without the fixture's read-back: whether it asks for another, and the heap
        // allocations of the render.
        let mut run = |s: &mut ScrollTransition, ms: f64| {
            let mut encoder = gpu.device.create_command_encoder(&Default::default());
            let (more, allocs) = crate::steddy_graph_interaction::tests::counted(|| s.render(&frame(ms), &gpu.device, &gpu.queue, &mut encoder, &view, format));
            gpu.queue.submit([encoder.finish()]);
            let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
            (more, allocs)
        };
        // The first frames bake the centre and then the two numbers either side, one a frame.
        let mut ms = 0.0;
        let mut frames = 0;
        while run(&mut s, ms).0 {
            ms += 16.0;
            frames += 1;
            assert!(frames < 10, "still baking");
        }
        let held = |s: &ScrollTransition| {
            let mut o: Vec<usize> = s.targets.as_ref().unwrap().owner.iter().flatten().copied().collect();
            o.sort();
            o
        };
        assert_eq!(held(&s), vec![0, 1, 2]);
        // A flick over three numbers: the pool follows the centre, a frame allocates only what
        // wgpu does for its passes, and it comes to rest and stops.
        let p = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        let (mut worst, mut more, mut steps) = (0, true, 0);
        s.input(&p(PointerPhase::Down, 100.0, ms));
        for k in 1..=9 {
            ms += 16.0;
            s.input(&p(if k < 9 { PointerPhase::Move } else { PointerPhase::Up }, 100.0 + 40.0 * k.min(8) as f32, ms));
            let r = run(&mut s, ms);
            (more, worst) = (r.0, worst.max(r.1));
        }
        while more && steps < 400 {
            ms += 16.0;
            let r = run(&mut s, ms);
            (more, worst) = (r.0, worst.max(r.1));
            steps += 1;
        }
        assert!(!more, "still drawing after {steps} frames");
        assert!(worst < 200, "a frame allocated {worst} times");
        let c = (s.scroll.offset / s.item()).round() as usize;
        assert!(c >= 2, "{c}");
        assert_eq!(held(&s), (c - 2..=(c + 2).min(COUNT - 1)).collect::<Vec<_>>());
        // At rest a render is one pass with nothing to bake.
        let (more, n) = run(&mut s, ms + 16.0);
        assert!(!more && n < 25, "{n}");
    }
}
