//! A movie page whose floating sun button switches the light and dark themes. While the button
//! is held, the page shrinks, the poster's glow fades and a blur rises over everything.
//!
//! - The button is the demo's own (a Liquid Glass pane over this canvas, see the Contract): it
//!   tells the surface whether it is held and which theme is on. The surface draws the page.
//! - The page has no height of its own beyond its content, so it does not scroll; it only
//!   bounces. The scale's origin, the page's centre, lies below the screen.
//! - The blur is taken over a Display P3 surface; views and text use the app's P3 colours.
//!
//! Inputs: safeTop, safeBottom, held, dark.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use motion::{Easing, Spring, Timing};
use draw2d::backdrop::{expo_fraction, BackdropBlur, Material};
use draw2d::blur::{ceil_size, outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use draw2d::{fit_cover, Canvas, Color, Font, Images, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

static POSTER: &crate::bytes::Bytes = crate::image!("interaction-appearance/past-lives.jpg");

const TITLE: &str = "Past Lives";
const DESCRIPTION: &str = "This heart-meltingly romantic and sad movie from Korean-Canadian dramatist and film-maker Celine Song left me wrung out and empty and weirdly euphoric, as if I\u{2019}d lived through an 18-month affair in the course of an hour and three-quarters. How extraordinary to think that this is Song\u{2019}s feature debut.\n\nIt\u{2019}s delicate, sophisticated and yet also somehow simple, direct, even verging on the cheesy. Past Lives has been compared to the movies of Richard Linklater, Noah Baumbach and Greta Gerwig; all true, but I also found myself remembering the wrenching final moments of Wong Kar-wai\u{2019}s In the Mood for Love, with Tony Leung murmuring his pain into a stone hollow in Angkor Wat and - yes - the gooey genius of Dean Friedman\u{2019}s plaintive 1978 chart hit Lucky Stars.";

const IMAGE_W: f32 = 200.0;
const IMAGE_H: f32 = 250.0;
const IMAGE_X: f32 = 32.0;
const BLUR: f32 = 500.0;
const GRADIENT_H: f32 = 400.0;

/// Theme colours: primary, background, text.
struct Palette {
    primary: u32,
    background: u32,
    text: u32,
}
const LIGHT: Palette = Palette { primary: 0x000000, background: 0xFCFCFC, text: 0xA0A0A0 };
const DARK: Palette = Palette { primary: 0xFFFFFF, background: 0x090909, text: 0x808080 };

/// The files of gpu/images this surface draws: embedded on the iPhone, fetched before it draws on the web
/// (crate::bytes).
const IMAGES: &[&str] = &[
    "interaction-appearance/past-lives.jpg",
];

/// The surface. Inputs: safeTop, safeBottom, held, dark.
/// On the web it draws once its [`IMAGES`] arrived (crate::bytes::gate).
pub fn surface() -> Box<dyn Surface> {
    crate::bytes::gate(IMAGES, ungated())
}

fn ungated() -> Box<dyn Surface> {
    Box::new(Appearance {
        safe: (0.0, 0.0),
        size: (0.0, 0.0),
        scale: 0.0,
        dark: false,
        switching: false,
        intensity: Timing::at(0.0),
        page: Spring::at(1.0),
        glow: Timing::at(1.0),
        scroll: UiScroll::new(0.0, 0.0, 1.0, NORMAL, Snap::Free),
        title: draw2d::match_ui_font(32.0, 400.0),
        body: draw2d::match_ui_font(16.0, 400.0),
        total: 0.0,
        content_key: None,
        glow_key: None,
        button_cleared: false,
        textures: None,
        poster: None,
        renderers: [Renderer::default(), Renderer::default(), Renderer::default(), Renderer::default()],
        canvas: Canvas::default(),
        blur: GraphiteBlur::default(),
        backdrop: BackdropBlur::default(),
        gpu: None,
    })
}

struct Textures {
    px: (u32, u32),
    /// The ScrollView's content (W × total, sRGB premultiplied).
    content: (u32, u32, wgpu::TextureView),
    /// The blurred MovieImage's canvas as Core Animation shows it (sRGB premultiplied).
    glow: (u32, u32, wgpu::TextureView),
    /// The poster in P3, the blur's input.
    layer: wgpu::TextureView,
    button: wgpu::TextureView,
    under: wgpu::TextureView,
    blurred: wgpu::TextureView,
}

struct Gpu {
    format: wgpu::TextureFormat,
    layout: wgpu::BindGroupLayout,
    resolve: wgpu::RenderPipeline,
    under: wgpu::RenderPipeline,
    finish: wgpu::RenderPipeline,
    buffers: [wgpu::Buffer; 3],
    sampler: wgpu::Sampler,
}

struct Appearance {
    safe: (f32, f32),
    size: (f32, f32),
    scale: f32,
    dark: bool,
    switching: bool,
    intensity: Timing,
    page: Spring,
    glow: Timing,
    scroll: UiScroll,
    title: Option<Font>,
    body: Option<Font>,
    /// The ScrollView's content height (= the rescaler's).
    total: f32,
    content_key: Option<(bool, u32, u32, u32)>,
    glow_key: Option<(u32, u32)>,
    button_cleared: bool,
    textures: Option<Textures>,
    poster: Option<Images>,
    /// Content, glow layer, button, spare: each draws once a frame at most.
    renderers: [Renderer; 4],
    canvas: Canvas,
    blur: GraphiteBlur,
    backdrop: BackdropBlur,
    gpu: Option<Gpu>,
}

impl Appearance {
    fn palette(&self) -> &'static Palette {
        if self.dark {
            &DARK
        } else {
            &LIGHT
        }
    }
    fn canvas_height(&self) -> f32 {
        300.0 + self.safe.0 + 32.0
    }
    fn image_y(&self) -> f32 {
        (self.canvas_height() - IMAGE_H) / 2.0 + 32.0
    }
    fn set_switching(&mut self, on: bool) {
        if self.switching == on {
            return;
        }
        self.switching = on;
        let quad = Easing::timing_default();
        self.intensity.to(if on { 15.0 } else { 0.0 }, 350.0, quad.clone());
        self.glow.to(if on { 0.0 } else { 1.0 }, if on { 350.0 } else { 1000.0 }, quad);
        gfx::spring_to(&mut self.page, if on { 0.95 } else { 1.0 }, 600.0, 1.0);
    }
    fn round(&self, v: f32) -> f32 {
        (v * self.scale + 1e-4).round() / self.scale
    }
    fn floor(&self, v: f32) -> f32 {
        (v * self.scale + 1e-4).floor() / self.scale
    }
    fn ceil(&self, v: f32) -> f32 {
        (v * self.scale - 1e-4).ceil() / self.scale
    }

    /// The ScrollView's content into `c` (its origin the content's top), returning its height.
    fn record_content(&self, c: &mut Canvas, poster: Option<draw2d::ImageRef>) -> f32 {
        let p = self.palette();
        let w = self.size.0;
        let ch = self.canvas_height();
        let iy = self.image_y();
        if let Some(img) = poster {
            let m = fit_cover(Rect::new(0.0, 0.0, img.width, img.height), Rect::new(IMAGE_X, iy, IMAGE_W, IMAGE_H));
            // Continuous corners: the poster's clip is not circular.
            c.draw_continuous_rrect(IMAGE_X, iy, IMAGE_W, IMAGE_H, 20.0, &Paint::image(img, m.invert()));
        }
        let (Some(title), Some(body)) = (self.title.as_ref(), self.body.as_ref()) else { return ch };
        // CoreGraphics puts a line's baseline on the next device pixel down.
        let snap = |v: f32| (v * self.scale - 1e-3).ceil() / self.scale;
        let title_top = ch;
        let title_h = self.ceil(gfx::line_height(title));
        c.draw_text(TITLE, 32.0, snap(gfx::baseline(title, title_top)), title, &Paint::fill(Color::view_hex(p.primary)));
        let top = self.floor(title_top + title_h + 16.0);
        let width = w - 96.0;
        let offset = (22.0 - gfx::line_height(body)) / 2.0;
        let ink = Paint::fill(Color::view_hex(p.text));
        let mut line = 0usize;
        let mut ranges = Vec::new();
        for paragraph in DESCRIPTION.split('\n') {
            if paragraph.is_empty() {
                line += 1;
                continue;
            }
            crate::gfx::wrap_spaced(body, paragraph, 0.0, width, &mut ranges);
            for &(a, b) in &ranges {
                let y = top + line as f32 * 22.0;
                c.draw_text(paragraph[a..b].trim_end(), 32.0, snap(gfx::baseline(body, y + offset)), body, &ink);
                line += 1;
            }
        }
        top + self.ceil(line as f32 * 22.0) + 200.0
    }

    fn uniforms(&self, frame: &Frame, format: wgpu::TextureFormat) -> [f32; 24] {
        let p = self.palette();
        let t = self.textures.as_ref().unwrap();
        let bg = Color::view_hex(p.background).0;
        let g = if self.dark { 0x09 } else { 0xFC };
        let k = self.page.value as f32;
        let mut u = [0f32; 24];
        u[0] = frame.width;
        u[1] = frame.height;
        u[2] = frame.scale;
        u[3] = gfx::srgb_flag(format);
        u[4..8].copy_from_slice(&[bg[0], bg[1], bg[2], 1.0]);
        // The rescaler: centre (W / 2, total / 2), scale.
        u[8] = frame.width / 2.0;
        u[9] = self.total / 2.0;
        u[10] = k;
        u[11] = self.glow.value as f32;
        u[12] = self.total;
        u[13] = self.scroll.offset as f32;
        u[14] = t.glow.1 as f32 / frame.scale;
        u[15] = t.content.1 as f32 / frame.scale;
        // The gradient's end colour (P3 of a neutral is itself), its start's rgb.
        u[16] = g as f32 / 255.0;
        u[17] = if self.dark { 0.0 } else { 1.0 };
        u[18] = if self.intensity.value > 0.0 { 1.0 } else { 0.0 };
        u
    }
}

const WGSL: &str = r#"
struct U {
    // canvas (points), scale, srgb target
    a: vec4<f32>,
    background: vec4<f32>,
    // rescaler centre, its scale, the glow's opacity
    r: vec4<f32>,
    // total height, scroll offset, the glow canvas's height, the content's height (points)
    h: vec4<f32>,
    // gradient end grey, start grey, blur on
    g: vec4<f32>,
    low: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var t0: texture_2d<f32>;
@group(0) @binding(2) var t1: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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
fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

// The blurred MovieImage's canvas (Graphite's blur of the P3 layer, t1 at low resolution) as
// Core Animation shows it.
@fragment fn resolve(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let c = q8(textureSampleLevel(t1, smp, pos.xy * u.low.xy + u.low.zw, 0.0));
    if (c.a <= 0.0) { return vec4<f32>(0.0); }
    return vec4<f32>(p3_to_srgb(c.rgb / c.a) * c.a, c.a);
}

fn sample(t: texture_2d<f32>, p: vec2<f32>, h: f32) -> vec4<f32> {
    if (p.x < 0.0 || p.y < 0.0 || p.x > u.a.x || p.y > h) { return vec4<f32>(0.0); }
    return textureSampleLevel(t, smp, p / vec2<f32>(u.a.x, h), 0.0);
}

// What the blur view sees: the background, then the rescaler's layers (glow t0 at its opacity,
// the scroll content t1 clipped to the ScrollView, the gradient) through its scale.
@fragment fn under(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy / u.a.z;
    let q = u.r.xy + (p - u.r.xy) / u.r.z;
    var c = u.background;
    c = over(sample(t0, q, u.h.z) * u.r.w, c);
    if (q.y >= 0.0 && q.y <= u.h.x) {
        c = over(sample(t1, vec2<f32>(q.x, q.y + u.h.y), u.h.w), c);
    }
    let t = (q.y - (u.h.x - 400.0)) / 400.0;
    if (t >= 0.0 && t <= 1.0 && q.x >= 0.0 && q.x <= u.a.x) {
        let k = clamp((t - 0.5) / 0.5, 0.0, 1.0);
        let grey = mix(u.g.y, u.g.x, k);
        c = over(q8(vec4<f32>(vec3<f32>(grey) * k, k)), c);
    }
    return c;
}

// The screen: the blur's output (t0) or what is under it, the button (t1) over it.
@fragment fn finish(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let i = vec2<i32>(pos.xy);
    let base = textureLoad(t0, i, 0);
    var c = over(textureLoad(t1, i, 0), base);
    if (u.a.w > 0.5) { c = vec4<f32>(lin(c.rgb), c.a); }
    return vec4<f32>(c.rgb, 1.0);
}
"#;

fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("appearance"), source: wgpu::ShaderSource::Wgsl(WGSL.into()) });
    let tex = |binding| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
        count: None,
    };
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("appearance"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            },
            tex(1),
            tex(2),
            wgpu::BindGroupLayoutEntry { binding: 3, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
        ],
    });
    let buffer = || device.create_buffer(&wgpu::BufferDescriptor { label: Some("appearance"), size: 96, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    Gpu {
        format,
        resolve: draw2d::render::fullscreen_pipeline(device, &module, &layout, "resolve", GRAPHITE_FORMAT, None),
        under: draw2d::render::fullscreen_pipeline(device, &module, &layout, "under", GRAPHITE_FORMAT, None),
        finish: draw2d::render::fullscreen_pipeline(device, &module, &layout, "finish", format, None),
        layout,
        buffers: [buffer(), buffer(), buffer()],
        sampler: draw2d::render::linear_sampler(device),
    }
}

fn bind(device: &wgpu::Device, gpu: &Gpu, k: usize, a: &wgpu::TextureView, b: &wgpu::TextureView) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("appearance"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: gpu.buffers[k].as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(a) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(b) },
            wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
        ],
    })
}

fn bytes(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

impl Surface for Appearance {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let [Value::Number(top), Value::Number(bottom), ..] = inputs {
            self.safe = (*top as f32, *bottom as f32);
        }
        let flag = |i: usize| inputs.get(i).is_some_and(|v| v.as_bool().or(v.as_number().map(|x| x != 0.0)).unwrap_or(false));
        // The button's hold and the theme come from the Contract.
        self.set_switching(flag(2));
        self.dark = flag(3);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"theme\":\"{}\",\"switching\":{},\"intensity\":{:.2},\"scale\":{:.4},\"held\":{}}}",
            if self.dark { "dark" } else { "light" },
            self.switching,
            self.intensity.value,
            self.page.value,
            self.scroll.moving()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            return;
        };
        // The scroll view covers the screen; its axes are swapped for the vertical pan.
        self.scroll.input(id, gfx::phase(phase), y, x, at_ms, true);
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
        let mut moving = self.intensity.step(now);
        moving |= self.glow.step(now);
        moving |= self.page.step(now);
        moving |= self.scroll.step(now);
        self.size = (frame.width, frame.height);
        self.scale = frame.scale;
        let px = frame.pixels();
        if self.gpu.as_ref().map(|g| g.format) != Some(format) {
            self.gpu = Some(build(device, format));
        }
        if self.poster.is_none() {
            let img = draw2d::Image::from_jpeg(POSTER).unwrap_or(draw2d::Image { width: 1, height: 1, pixels: vec![128, 128, 128, 255] });
            let images = Images::upload_unmipped(device, queue, &img);
            for r in self.renderers.iter_mut() {
                r.set_images(&images);
            }
            self.poster = Some(images);
        }
        let poster = self.poster.as_ref().map(|i| i.image(0));
        // Measure the content (the rescaler's height) before sizing anything.
        let key = (self.dark, px.0, px.1, (self.safe.0 * 8.0) as u32 ^ frame.scale.to_bits());
        let mut c = std::mem::take(&mut self.canvas);
        let record = self.content_key != Some(key);
        if record {
            c.begin(frame.scale);
            self.total = self.record_content(&mut c, poster);
            self.scroll.port = self.total as f64;
        }
        let content_px = (px.0, (self.total * frame.scale).ceil() as u32);
        let glow_px = (px.0, (((self.canvas_height() + 500.0) * frame.scale).round() as u32).min(px.1 * 2));
        if self.textures.as_ref().map(|t| (t.px, t.content.1, t.glow.1)) != Some((px, content_px.1, glow_px.1)) {
            let t = |label, w, h| draw2d::render::sampled_target(device, label, GRAPHITE_FORMAT, w, h);
            self.textures = Some(Textures {
                px,
                content: (content_px.0, content_px.1, t("appearance content", content_px.0, content_px.1)),
                glow: (glow_px.0, glow_px.1, t("appearance glow", glow_px.0, glow_px.1)),
                layer: t("appearance layer", glow_px.0, glow_px.1),
                button: t("appearance button", px.0, px.1),
                under: t("appearance under", px.0, px.1),
                blurred: t("appearance blurred", px.0, px.1),
            });
            self.glow_key = None;
            self.button_cleared = false;
        }
        let gpu = self.gpu.as_ref().unwrap();
        let tex = self.textures.as_ref().unwrap();
        // The ScrollView's content: per theme.
        if record {
            self.renderers[0].draw(device, queue, encoder, &c, &tex.content.2, GRAPHITE_FORMAT, content_px.0, content_px.1, wgpu::Color::TRANSPARENT);
            self.content_key = Some(key);
        }
        self.canvas = c;
        // The blurred poster glow: redrawn when its size changes.
        if self.glow_key != Some(glow_px) {
            let iy = self.image_y();
            let c = &mut self.canvas;
            c.begin(frame.scale);
            if let Some(img) = poster {
                let m = fit_cover(Rect::new(0.0, 0.0, img.width, img.height), Rect::new(IMAGE_X, iy, IMAGE_W, IMAGE_H));
                c.draw_rect(IMAGE_X, iy, IMAGE_W, IMAGE_H, &Paint::image(img, m.invert()));
            }
            self.renderers[1].p3 = true;
            self.renderers[1].draw(device, queue, encoder, c, &tex.layer, GRAPHITE_FORMAT, glow_px.0, glow_px.1, wgpu::Color::TRANSPARENT);
            let sigma = BLUR * frame.scale;
            let bounds = [0, 0, glow_px.0 as i32, glow_px.1 as i32];
            let reach = ceil_size(3.0 * sigma);
            if let Some(plan) = GraphitePlan::new(outset(bounds, reach, reach), bounds, sigma) {
                let out = self.blur.run(device, queue, encoder, Placed { view: &tex.layer, origin: [0, 0], size: [glow_px.0, glow_px.1] }, &plan);
                let mut u = [0f32; 24];
                u[20..24].copy_from_slice(&low_mapping(&plan, out.origin, out.size));
                queue.write_buffer(&gpu.buffers[0], 0, &bytes(&u));
                let g = bind(device, gpu, 0, &tex.layer, out.view);
                draw2d::render::fullscreen_pass(encoder, "appearance resolve", &tex.glow.2, &gpu.resolve, &g);
            }
            self.glow_key = Some(glow_px);
        }
        // The button is the Contract's glass; the layer over the blur stays clear.
        if !self.button_cleared {
            let c = &mut self.canvas;
            c.begin(frame.scale);
            self.renderers[2].draw(device, queue, encoder, c, &tex.button, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
            self.button_cleared = true;
        }
        // What the blur sees.
        let u = self.uniforms(frame, format);
        queue.write_buffer(&gpu.buffers[1], 0, &bytes(&u));
        let g = bind(device, gpu, 1, &tex.glow.2, &tex.content.2);
        draw2d::render::fullscreen_pass(encoder, "appearance under", &tex.under, &gpu.under, &g);
        let mut base = &tex.under;
        if self.intensity.value > 0.0 {
            let params = Material::Regular.chain().at(expo_fraction(self.intensity.value));
            self.backdrop.run(device, queue, encoder, &tex.under, [0, 0, px.0 as i32, px.1 as i32], [0.0, 0.0], &params, frame.scale);
            self.backdrop.draw(device, queue, encoder, &tex.blurred, GRAPHITE_FORMAT, [0.0, 0.0], [0, 0], [px.0, px.1]);
            base = &tex.blurred;
        }
        queue.write_buffer(&gpu.buffers[2], 0, &bytes(&u));
        let g = bind(device, gpu, 2, base, &tex.button);
        draw2d::render::fullscreen_pass(encoder, "appearance", target, &gpu.finish, &g);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn holding_the_sun_shrinks_and_blurs_the_page_and_the_press_turns_it_dark() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0), Value::Number(34.0), Value::Bool(false), Value::Bool(false)], None).unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "appearance-rest", [0, 0, 0]);
        // The light background beside the poster (the σ 500 glow tints it a little), the poster
        // inside its rrect.
        let bg = rest.at(3 * 400, 3 * 300);
        assert!(bg[..3].iter().all(|&c| (240..=252).contains(&c)), "{bg:?}");
        assert!(rest.at(3 * 130, 3 * 270)[..3].iter().any(|&c| c < 200));
        // The surface draws no button: the glass is the Contract's.
        let corner = rest.at(3 * 358, 3 * 850);
        assert!(corner[..3].iter().all(|&c| (240..=252).contains(&c)), "{corner:?}");

        // Held: the Contract says so.
        let mut ms = 0.0;
        s.bind(&[Value::Number(68.0), Value::Number(34.0), Value::Bool(true), Value::Bool(false)], None).unwrap();
        while ms < 800.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&held, "appearance-held", [0, 0, 0]);
        assert_eq!(s.agent("{}").unwrap(), "{\"theme\":\"light\",\"switching\":true,\"intensity\":15.00,\"scale\":0.9500,\"held\":false}");
        // Released with a press: the theme turns dark and the hold ends.
        s.bind(&[Value::Number(68.0), Value::Number(34.0), Value::Bool(false), Value::Bool(true)], None).unwrap();
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (dark, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&dark, "appearance-dark", [0, 0, 0]);
        assert!(!animating);
        let bg = dark.at(3 * 400, 3 * 300);
        assert!(bg[..3].iter().all(|&c| (9..=20).contains(&c)), "{bg:?}");
        assert_eq!(s.agent("{}").unwrap(), "{\"theme\":\"dark\",\"switching\":false,\"intensity\":0.00,\"scale\":1.0000,\"held\":false}");
    }
}
