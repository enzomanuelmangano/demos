//! 3D Scroll Transition (src/animations/3d-scroll-transition: index.tsx,
//! components/blurred-list-item.tsx): the numbers 99 … 0 on an inverted FlatList on black, one
//! item (window width × 0.55 tall) centred; each tips back about its centre as it leaves the
//! middle, fading and blurring.
//!
//! The list: inverted (scaleY −1 on the list and on each cell), paddingVertical height / 2 −
//! size / 2, snapToInterval size, decelerationRate fast (`ui_scroll` on the vertical axis, its
//! finger read upside down). scrollY is its contentOffset.y.
//!
//! An item: `<Animated.View style={{ opacity, transform: [{ perspective: 200 }, { rotateX }] }}>`
//! around an RN Skia Canvas (window width × size, a Display P3 surface): a Group whose layer is
//! Blur(blur) holding a Mask (a layer: a Fill of SweepGradient((width / 2, size / 2), [cyan,
//! magenta, yellow, cyan]), then the mask's layer with dstIn: the Text in white, SF Pro Rounded
//! Bold 175 at (width / 2 − measureText.width / 2, size / 2 + 175 / 4)); the Group's BlurMask
//! (σ 4, solid) is the paint every drawing in it inherits, so the text's coverage is
//! solid-blurred (inside kept, a σ 4 glow outside). With inputRange [s(i−1), s(i−1) + 20, s·i,
//! s(i+1) − 20, s(i+1)]: blur [0, 6, 0, 6, 0] and opacity [0, .5, 1, .5, 0] clamped, rotateX
//! [−π/2, −π/2, 0, −π/2, −π/2] extended.
//!
//! Here: each number's masked sweep is baked once (it scrolls into view: the text's coverage,
//! Graphite's blur of it for the solid mask filter, the sweep kept where it lands); per frame the
//! two items in view (only they have opacity) are blurred by their σ when it is not 0, resolved
//! to sRGB as Core Animation shows the canvas, and drawn through their layer's 4×4.
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | scrollY | FlatList onScroll (UIScrollView, snapToInterval, fast) | `UiScroll` (Snap::Interval, FAST) |
//! | blur, opacity, rotateX | interpolate(scrollY) per item | the same, every frame |
//!
//! The leave is past RN's (the owner's phone note: the number flattened edge-on near the top):
//! see LEAVE_* and `render`: a 58° tilt at most, the fade, Gaussian blur and shrink on one
//! smootherstep from a quarter of an item out, symmetric both ways.
//!
//! Haptics (past RN, which plays none: the owner's haptic language): `haptic:selection` each time
//! the centred number (round(scrollY / size)) changes, during the drag and the glide, at most one
//! per HAPTIC_GAP_MS; `haptic:impact-rigid` once each time the list is pulled or thrown past an
//! end (the rubber band).
//!
//! No inputs.

use std::collections::HashMap;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use skia::blur::{ceil_size, outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Font, Matrix4, Paint, Renderer, Shader};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

const COUNT: usize = 100;
const PERSPECTIVE: f32 = 200.0;
const FONT_SIZE: f32 = 175.0;
/// BlurMask blur (σ, points).
const GLOW: f32 = 4.0;
/// The leave (past RN's, by the owner's call): the largest tilt (rad, 58°), where the fade, blur
/// and shrink begin and end (fractions of an item from the centre), the blur at its end (σ, pt)
/// and the scale.
const LEAVE_TILT: f64 = 58.0 * std::f64::consts::PI / 180.0;
const LEAVE_FROM: f64 = 0.25;
const LEAVE_TO: f64 = 0.85;
const LEAVE_BLUR: f64 = 12.0;
const LEAVE_SCALE: f64 = 0.86;

/// 6t⁵ − 15t⁴ + 10t³ of t = (x − a) / (b − a) clamped: flat at both ends.
fn smootherstep(a: f64, b: f64, x: f64) -> f64 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
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
        bakes: HashMap::new(),
        sweep: None,
        text: [None, None],
        glow: [(GraphiteBlur::default(), None), (GraphiteBlur::default(), None)],
        renderers: [Renderer::default(), Renderer::default()],
        slots: [Slot::default(), Slot::default()],
        renderer: Renderer::default(),
        canvas: Canvas::default(),
        gpu: None,
        centred: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    }
}

#[derive(Default)]
struct Slot {
    blur: GraphiteBlur,
    plan: Option<GraphitePlan>,
    resolved: Option<((u32, u32), wgpu::TextureView)>,
    bind: Option<(wgpu::TextureView, wgpu::TextureView, wgpu::BindGroup)>,
    buffer: Option<wgpu::Buffer>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    layout: wgpu::BindGroupLayout,
    combine: wgpu::RenderPipeline,
    resolve: wgpu::RenderPipeline,
    quad: wgpu::RenderPipeline,
    quad_layout: wgpu::BindGroupLayout,
    quad_buffers: [wgpu::Buffer; 2],
    quad_binds: [Option<(wgpu::TextureView, wgpu::BindGroup)>; 2],
    combine_buffers: [wgpu::Buffer; 2],
    sampler: wgpu::Sampler,
    empty: wgpu::TextureView,
}

struct ScrollTransition {
    size: (f32, f32),
    scale: f32,
    scroll: UiScroll,
    font: Option<Font>,
    /// Each number's masked sweep (P3, premultiplied), by item index.
    bakes: HashMap<usize, wgpu::TextureView>,
    /// The sweep filling the canvas, (size, scale) and its texture.
    sweep: Option<((u32, u32), wgpu::TextureView)>,
    /// The text's coverage, drawn per bake.
    /// Per bake slot (an item's parity: the two in view never share one, as each resource is
    /// written once a frame).
    text: [Option<((u32, u32), wgpu::TextureView)>; 2],
    glow: [(GraphiteBlur, Option<GraphitePlan>); 2],
    renderers: [Renderer; 2],
    slots: [Slot; 2],
    renderer: Renderer,
    canvas: Canvas,
    gpu: Option<Gpu>,
    /// The centred item, and whether the list is past an end (their haptics).
    centred: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
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
    /// Item i's cell in the content (Yoga): top and height.
    fn cell(&self, i: usize) -> (f64, f64) {
        let top = self.pad() + i as f64 * self.item();
        let t = self.round(top);
        (t, self.round(top + self.item()) - t)
    }
    /// A selection when the centred number changes (one per HAPTIC_GAP_MS at most), a rigid thunk
    /// once per pull past an end.
    fn haptics(&mut self, now: f64) {
        let (offset, max) = (self.scroll.offset, self.scroll.max);
        let centred = (offset / self.item()).round().clamp(0.0, (COUNT - 1) as f64) as i64;
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

// The canvas as Core Animation shows it: the Group's layer (t0, or its blur t1), each pixel
// colour-matched from P3 unpremultiplied.
@fragment fn resolve(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy;
    var c = textureLoad(t0, vec2<i32>(p), 0);
    if (u.a.x > 0.5) {
        c = vec4<f32>(0.0);
        if (all(p >= u.out.xy) && all(p <= u.out.zw)) {
            c = q8(textureSampleLevel(t1, smp, (p + u.reach.xy) * u.low.xy + u.low.zw, 0.0));
        }
    }
    if (c.a <= 0.0) { return vec4<f32>(0.0); }
    return vec4<f32>(p3_to_srgb(c.rgb / c.a) * c.a, c.a);
}
"#;

const QUAD_WGSL: &str = r#"
struct U {
    h0: vec4<f32>,
    h1: vec4<f32>,
    h2: vec4<f32>,
    // canvas (points): w, h; the item's w, h
    size: vec4<f32>,
    // scale, opacity, srgb target, texture px w
    a: vec4<f32>,
    // texture px h
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
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
    let px = vec2<f32>(u.a.w, u.b.x);
    let q = clamp(v.local * u.a.x, vec2<f32>(0.5), px - vec2<f32>(0.5));
    var c = textureSampleLevel(tex, smp, q / px, 0.0) * u.a.y;
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
fn texture() -> wgpu::BindingType {
    wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }
}
fn sampler() -> wgpu::BindingType {
    wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering)
}
fn buffer(device: &wgpu::Device, size: u64) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor { label: Some("scroll 3d"), size, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false })
}
fn bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}
/// The blurred image's uv of a layer pixel (spiral's).
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("scroll 3d"), source: wgpu::ShaderSource::Wgsl(WGSL.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("scroll 3d"),
        entries: &[entry(0, uniform()), entry(1, texture()), entry(2, texture()), entry(3, texture()), entry(4, sampler())],
    });
    let combine = skia::render::fullscreen_pipeline(device, &module, &layout, "combine", GRAPHITE_FORMAT, None);
    let resolve = skia::render::fullscreen_pipeline(device, &module, &layout, "resolve", GRAPHITE_FORMAT, None);
    let qm = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("scroll 3d quad"), source: wgpu::ShaderSource::Wgsl(QUAD_WGSL.into()) });
    let quad_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("scroll 3d quad"),
        entries: &[entry(0, uniform()), entry(1, texture()), entry(2, sampler())],
    });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("scroll 3d quad"), bind_group_layouts: &[Some(&quad_layout)], immediate_size: 0 });
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
        resolve,
        quad,
        quad_layout,
        quad_buffers: [buffer(device, 96), buffer(device, 96)],
        quad_binds: [None, None],
        combine_buffers: [buffer(device, 64), buffer(device, 64)],
        sampler: skia::render::linear_sampler(device),
        empty: skia::render::sampled_target(device, "scroll 3d empty", GRAPHITE_FORMAT, 1, 1),
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

impl ScrollTransition {
    /// Item i's canvas: the Mask's layer, baked once.
    fn bake(&mut self, i: usize, px: (u32, u32), device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let Some(font) = self.font.as_ref() else { return };
        let (w, h) = (px.0 as f32 / self.scale, px.1 as f32 / self.scale);
        if self.sweep.as_ref().map(|s| s.0) != Some(px) {
            let view = skia::render::sampled_target(device, "scroll 3d sweep", GRAPHITE_FORMAT, px.0, px.1);
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
            self.text[k] = Some((px, skia::render::sampled_target(device, "scroll 3d text", GRAPHITE_FORMAT, px.0, px.1)));
        }
        let text = (COUNT - 1 - i).to_string();
        let width = font.measure_text(&text).width;
        let size = self.item() as f32;
        self.canvas.begin(self.scale);
        self.canvas.draw_text(&text, self.size.0 / 2.0 - width / 2.0, size / 2.0 + FONT_SIZE / 4.0, font, &Paint::fill(Color::WHITE));
        let text_view = self.text[k].as_ref().unwrap().1.clone();
        self.renderers[k].p3 = true;
        self.renderers[k].draw(device, queue, encoder, &self.canvas, &text_view, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        // The solid BlurMask: Graphite's blur of the coverage, the glyphs over it.
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
            return;
        }
        let plan = plan.as_ref().unwrap();
        let out = blur.run(device, queue, encoder, Placed { view: &text_view, origin: [0, 0], size: [px.0, px.1] }, plan);
        let low = low_mapping(plan, out.origin, out.size);
        let o = plan.output.map(|v| v as f32);
        let glow = out.view.clone();
        if self.gpu.is_none() {
            return;
        }
        let gpu = self.gpu.as_ref().unwrap();
        let mut u = [0f32; 16];
        u[4..8].copy_from_slice(&low);
        u[8..12].copy_from_slice(&o);
        queue.write_buffer(&gpu.combine_buffers[k], 0, &bytes(&u));
        let view = skia::render::sampled_target(device, "scroll 3d item", GRAPHITE_FORMAT, px.0, px.1);
        let sweep = &self.sweep.as_ref().unwrap().1;
        let bind = group(device, gpu, &gpu.combine_buffers[k], [sweep, &text_view, &glow]);
        skia::render::fullscreen_pass(encoder, "scroll 3d combine", &view, &gpu.combine, &bind);
        self.bakes.insert(i, view);
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
        if (frame.width, frame.height, frame.scale) != (self.size.0, self.size.1, self.scale) {
            self.size = (frame.width, frame.height);
            self.scale = frame.scale;
            self.bakes.clear();
            self.configure();
        }
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            self.gpu = Some(build(device, format));
        }
        let moving = self.scroll.step(frame.now_ms);
        self.haptics(frame.now_ms);
        let offset = self.scroll.offset;
        let s = self.item();
        let pxw = (frame.width * frame.scale).round() as u32;
        // The items with opacity: |scrollY − s·i| < s.
        let visible: Vec<usize> = (0..COUNT).filter(|&i| (offset - s * i as f64).abs() < s).collect();
        self.bakes.retain(|k, _| visible.contains(k));
        let mut draws = Vec::new();
        let several = visible.len() > 1;
        for &i in &visible {
            // The leave, redesigned (the owner's phone note: it flattened edge-on toward the top):
            // d, how far the number is from the centre (0 … 1 of an item, either way). It tips back
            // at most LEAVE_TILT, easing in; from a quarter out it fades, blurs (Graphite's
            // Gaussian, up to LEAVE_BLUR) and shrinks toward LEAVE_SCALE on one smootherstep, gone
            // before the tilt could read as a flat sheet. Symmetric above and below.
            let d = ((offset - s * i as f64).abs() / s).min(1.0);
            let k = smootherstep(LEAVE_FROM, LEAVE_TO, d);
            let opacity = 1.0 - k;
            if opacity <= 0.0 {
                continue;
            }
            // While two numbers show, each takes the blur path (σ at least 0.2 pt, invisible in
            // motion): a slot that drops from a blur to none while the other slot blurs drew
            // nothing that frame (found here; the number vanished a quarter out). At rest the one
            // number is unblurred.
            let blur = if several { (LEAVE_BLUR * k).max(0.2) } else { LEAVE_BLUR * k };
            let rotate = -LEAVE_TILT * smootherstep(0.0, 1.0, d);
            let shrink = 1.0 - (1.0 - LEAVE_SCALE) * k;
            let (top, h) = self.cell(i);
            let px = (pxw, (h * frame.scale as f64).round() as u32);
            if !self.bakes.contains_key(&i) {
                self.bake(i, px, device, queue, encoder);
            }
            let Some(item) = self.bakes.get(&i).cloned() else { continue };
            // The slot: its σ's blur, then the canvas resolved to sRGB.
            let slot = &mut self.slots[i % 2];
            let gpu = self.gpu.as_ref().unwrap();
            if slot.resolved.as_ref().map(|r| r.0) != Some(px) {
                slot.resolved = Some((px, skia::render::sampled_target(device, "scroll 3d resolved", GRAPHITE_FORMAT, px.0, px.1)));
                slot.bind = None;
            }
            let buf = slot.buffer.get_or_insert_with(|| buffer(device, 64));
            let mut u = [0f32; 16];
            let mut blurred = gpu.empty.clone();
            if blur > 0.0 {
                let sigma = blur as f32 * frame.scale;
                let reach = ceil_size(3.0 * sigma);
                let bounds = [0, 0, px.0 as i32, px.1 as i32];
                let layer = outset(bounds, reach, reach);
                let ok = match &mut slot.plan {
                    Some(p) => p.update(layer, bounds, sigma),
                    None => {
                        slot.plan = GraphitePlan::new(layer, bounds, sigma);
                        slot.plan.is_some()
                    }
                };
                if ok {
                    let plan = slot.plan.as_ref().unwrap();
                    let out = slot.blur.run(device, queue, encoder, Placed { view: &item, origin: [0, 0], size: [px.0, px.1] }, plan);
                    u[0] = 1.0;
                    u[4..8].copy_from_slice(&low_mapping(plan, out.origin, out.size));
                    u[8..12].copy_from_slice(&plan.output.map(|v| v as f32));
                    blurred = out.view.clone();
                }
            }
            queue.write_buffer(buf, 0, &bytes(&u));
            if slot.bind.as_ref().is_none_or(|(a, b, _)| *a != item || *b != blurred) {
                let g = group(device, gpu, buf, [&item, &blurred, &gpu.empty]);
                slot.bind = Some((item.clone(), blurred.clone(), g));
            }
            let resolved = slot.resolved.as_ref().unwrap().1.clone();
            skia::render::fullscreen_pass(encoder, "scroll 3d resolve", &resolved, &gpu.resolve, &slot.bind.as_ref().unwrap().2);
            // The layer: the flipped list puts the cell's top at height − (top + h − offset).
            let screen_top = frame.height as f64 - (top + h - offset);
            let (w, hf) = (frame.width, h as f32);
            let m = Matrix4::translate(0.0, screen_top as f32, 0.0)
                .multiply(
                    Matrix4::perspective(PERSPECTIVE)
                        .multiply(Matrix4::rotate_x(rotate as f32))
                        .multiply(Matrix4::scale(shrink as f32, shrink as f32, 1.0))
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
            q[17] = opacity as f32;
            q[18] = gfx::srgb_flag(format);
            q[19] = px.0 as f32;
            q[20] = px.1 as f32;
            draws.push((i % 2, q, resolved));
        }
        let gpu = self.gpu.as_mut().unwrap();
        for (slot, q, view) in &draws {
            queue.write_buffer(&gpu.quad_buffers[*slot], 0, &bytes(q));
            if gpu.quad_binds[*slot].as_ref().is_none_or(|(v, _)| v != view) {
                let g = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("scroll 3d quad"),
                    layout: &gpu.quad_layout,
                    entries: &[
                        wgpu::BindGroupEntry { binding: 0, resource: gpu.quad_buffers[*slot].as_entire_binding() },
                        wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(view) },
                        wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                    ],
                });
                gpu.quad_binds[*slot] = Some((view.clone(), g));
            }
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
        for (slot, _, _) in &draws {
            pass.set_bind_group(0, &gpu.quad_binds[*slot].as_ref().unwrap().1, &[]);
            pass.draw(0..4, 0..1);
        }
        moving
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
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "scroll3d-rest", [0, 0, 0]);
        assert!(!animating);
        // "99" centred at 456: its sweep-coloured ink; the screen's top black.
        let ink = (3 * 420..3 * 490).flat_map(|y| (3 * 120..3 * 300).map(move |x| (x, y))).filter(|&(x, y)| rest.at(x, y)[..3].iter().map(|&c| c as u32).sum::<u32>() > 200).count();
        assert!(ink > 3000, "{ink}");
        assert_eq!(&rest.at(10, 10)[..3], &[0, 0, 0]);
        assert_eq!(s.agent("{}").unwrap(), "{\"offset\":0.00,\"number\":99,\"moving\":false}");

        // Drag down 140 pt slowly, then lift still: the snap rounds to the next item (231 pt).
        let p = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
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
        // One number on: one selection. A slow drag up of 300 pt: back one number, then past the
        // start, one rigid thunk however long it is held.
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
        // "99" (item 0) at d = 0, .25, .5, .75 and 1 of an item from the centre: the list moved
        // by d · item (231 pt at 420 wide), 99 leaving downward (the list is inverted), 98 coming
        // in from above; the lit pixels below the centre (99's alone).
        let mut ink = Vec::new();
        for (n, d) in [0.0f64, 0.25, 0.5, 0.75, 1.0].iter().enumerate() {
            s.scroll.set_offset(231.0 * d);
            fixture::render(&gpu, &mut s, &frame(10.0 + n as f64)).unwrap();
            let (img, _) = fixture::render(&gpu, &mut s, &frame(10.5 + n as f64)).unwrap();
            gfx::save_over(&img, &format!("scroll3d-leave-{n}"), [0, 0, 0]);
            let lit = (img.height / 2 + 60..img.height).step_by(3).flat_map(|y| (0..img.width).step_by(3).map(move |x| (x, y))).filter(|&(x, y)| img.at(x, y)[..3].iter().map(|&c| c as u32).sum::<u32>() > 150).count();
            ink.push(lit);
        }
        // A quarter out still whole (it has moved into the measured band), then fading and
        // blurring, nearly gone at three quarters (at a whole item the band holds only 98's lower half).
        assert!(ink[1] > ink[0], "{ink:?}");
        assert!(ink[1] > 0 && ink[3] < ink[2] / 3, "{ink:?}");
    }
}
