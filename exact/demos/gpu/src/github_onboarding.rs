//! Four cat photos on a paging list over a gradient whose colours follow the scroll. Each page's
//! round badge turns and shrinks as it leaves, its title fades, and four dots page the list.
//!
//! - The list pages on UIKit's paging spring; a dot's press scrolls to its page.
//! - The background is computed per pixel from the scroll, in the surface's colour space.
//! - Haptics: a selection each time the front page changes, at most one per 40 ms; a rigid impact
//!   when a drag pulls the list past either end. A dot's scroll plays only its press's selection.

use std::f64::consts::PI;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::Phase;
use motion::{interpolate, interpolate_clamp, interpolate_color, Extrapolation};
use draw2d::{fit_cover, Canvas, Color, Font, Images, Matrix, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

/// The shortest gap between two page haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-page line the list goes before the page's haptic plays, pt.
const SWITCH: f64 = 6.0;
/// How far past an end the rubber band pulls before its rigid plays (re-armed back inside), pt.
const PAST_END: f64 = 2.0;
/// Page data: title, colour and photo.
const TITLES: [&str; 4] = [
    "Lazy Day Lounger",
    "Whiskered Explorer",
    "Curious Kitty Gaze",
    "Sleek Feline in Repose",
];
const COLORS: [u32; 4] = [0x265D9E, 0x4E8DC5, 0x7BB2E9, 0xA1CAE8];
static PHOTOS: [(&[u8], u32, u32); 4] = [
    (
        include_bytes!("../images/github-onboarding/02-696x999.rgb8up.zlib"),
        696,
        999,
    ),
    (
        include_bytes!("../images/github-onboarding/01-640x853.rgb8up.zlib"),
        640,
        853,
    ),
    (
        include_bytes!("../images/github-onboarding/03-640x896.rgb8up.zlib"),
        640,
        896,
    ),
    (
        include_bytes!("../images/github-onboarding/04-640x960.rgb8up.zlib"),
        640,
        960,
    ),
];
/// Badge padding, pt.
const PADDING: f64 = 10.0;
/// Title margin, font size and letter spacing, pt.
const TITLE_TOP: f64 = 50.0;
const TITLE_MARGIN: f64 = 40.0;
const TITLE_SIZE: f32 = 40.0;
const SPACING: f32 = 1.0;
/// Dot size, spacing, distance from the bottom, and touch slop, pt.
const DOT: f64 = 7.0;
const DOT_PAD: f64 = 5.0;
const DOTS_BOTTOM: f64 = 100.0;
const HIT_SLOP: f64 = 5.0;

/// A photo's pixels (opaque RGBA), its rows restored from their deltas.
fn photo(index: usize) -> draw2d::Image {
    let (bytes, w, h) = PHOTOS[index];
    let mut rgb = miniz_oxide::inflate::decompress_to_vec_zlib(bytes).unwrap_or_default();
    let row = w as usize * 3;
    if rgb.len() != row * h as usize {
        return draw2d::Image {
            width: 1,
            height: 1,
            pixels: vec![255, 255, 255, 255],
        };
    }
    for y in 1..h as usize {
        let (above, here) = rgb.split_at_mut(y * row);
        for (b, a) in here[..row].iter_mut().zip(&above[(y - 1) * row..]) {
            *b = b.wrapping_add(*a);
        }
    }
    let mut pixels = vec![255u8; w as usize * h as usize * 4];
    for (d, s) in pixels.chunks_exact_mut(4).zip(rgb.chunks_exact(3)) {
        d[..3].copy_from_slice(s);
    }
    draw2d::Image {
        width: w,
        height: h,
        pixels,
    }
}

/// Rounds a view edge to the device pixel grid, halves up.
fn grid(v: f64, scale: f64) -> f64 {
    (v * scale + 0.5 + 1e-4).floor() / scale
}

/// Rounds a text's offset down to the device pixel grid.
fn text_grid(v: f64, scale: f64) -> f64 {
    (v * scale + 1e-4).floor() / scale
}

/// Rounds a text's far edge up to the device pixel grid.
fn text_ceil(v: f64, scale: f64) -> f64 {
    (v * scale - 1e-4).ceil() / scale
}

/// A page's title as TextKit lays it out: its lines, their widths and the widest.
struct Title {
    lines: Vec<String>,
    widths: Vec<f64>,
    max: f64,
}

/// The gradient's two colours at `progress`, in sRGB.
fn gradient(progress: f64) -> [[f64; 3]; 2] {
    let input = [0.0, 1.0, 2.0, 3.0];
    let rgba = |c: Color| {
        [
            c.0[0] as f64 * 255.0,
            c.0[1] as f64 * 255.0,
            c.0[2] as f64 * 255.0,
            1.0,
        ]
    };
    let base: [[f64; 4]; 4] = COLORS.map(|c| rgba(Color::hex(c)));
    let dark: [[f64; 4]; 4] = COLORS.map(|c| rgba(Color::hex(c).darken(0.8)));
    let pick = |out: &[[f64; 4]]| {
        let c = interpolate_color(progress, &input, out);
        [c[0] / 255.0, c[1] / 255.0, c[2] / 255.0]
    };
    [pick(&base), pick(&dark)]
}

/// sRGB (encoded) → Display P3 (encoded), as Skia converts a paint's colour to the surface's space.
fn srgb_to_p3(c: [f64; 3]) -> [f32; 3] {
    let lin = |c: f64| {
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    let enc = |c: f64| {
        let c = c.clamp(0.0, 1.0);
        if c <= 0.0031308 {
            12.92 * c
        } else {
            1.055 * c.powf(1.0 / 2.4) - 0.055
        }
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    [
        enc(0.8224621 * r + 0.1775380 * g) as f32,
        enc(0.0331941 * r + 0.9668058 * g) as f32,
        enc(0.0170827 * r + 0.0723974 * g + 0.9105199 * b) as f32,
    ]
}

/// A page's animated values at scroll offset `x`: (x-scale, scale, title opacity).
fn page_style(x: f64, index: usize, w: f64) -> (f64, f64, f64) {
    let i = index as f64;
    let input = [(i - 1.0) * w, i * w, (i + 1.0) * w];
    let rotate = interpolate(
        x,
        &input,
        &[PI / 4.0, PI * 2.0, PI / 4.0],
        Extrapolation::Extend,
    );
    let scale = interpolate(x, &input, &[0.5, 1.0, 0.5], Extrapolation::Extend);
    let opacity = interpolate_clamp(x, &input, &[-1.0, 1.0, -1.0]).clamp(0.0, 1.0);
    (scale * rotate.cos(), scale, opacity)
}

/// A dot's opacity at `progress`.
fn dot_opacity(progress: f64, index: usize) -> f64 {
    let i = index as f64;
    interpolate_clamp(progress, &[i - 0.7, i, i + 0.7], &[0.2, 0.6, 0.2])
}

/// A title broken into lines as TextKit wraps it in `width` (at spaces).
fn lines(font: &Font, text: &str, width: f64) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for word in text.split(' ') {
        if let Some(last) = out.last_mut() {
            let joined = format!("{last} {word}");
            if font.advance_width_spaced(&joined, SPACING) as f64 <= width + 1e-3 {
                *last = joined;
                continue;
            }
        }
        out.push(word.to_string());
    }
    out
}

const COMPOSE: &str = r#"
struct U { c0: vec4<f32>, c1: vec4<f32>, span: vec4<f32> };
@group(0) @binding(0) var layer: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: U;
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
fn p3_lin_to_srgb_lin(l: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b);
}
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // The gradient's t at the pixel's centre, the P3 surface's 8-bit value, shown in sRGB.
    let t = clamp(pos.y / u.span.x, 0.0, 1.0);
    let p3 = round(mix(u.c0.rgb, u.c1.rgb, t) * 255.0) / 255.0;
    let back = enc(p3_lin_to_srgb_lin(lin(p3)));
    let ui = textureLoad(layer, vec2<i32>(pos.xy), 0);
    let c = ui.rgb + back * (1.0 - ui.a);
    return vec4<f32>(select(c, lin(c), u.span.y > 0.5), 1.0);
}
"#;

struct Gpu {
    format: wgpu::TextureFormat,
    size: (u32, u32),
    layer: wgpu::TextureView,
    uniforms: wgpu::Buffer,
    pipeline: wgpu::RenderPipeline,
    bind: wgpu::BindGroup,
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Onboarding {
        scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Page(1.0)),
        dots: std::array::from_fn(|_| pressto::Pressable::new()),
        held: None,
        size: (0.0, 0.0),
        font: draw2d::match_ui_font(TITLE_SIZE, 700.0),
        titles: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        images: None,
        gpu: None,
        posted: Vec::new(),
        page: 0,
        swiping: false,
        banded: false,
        haptic_at: f64::NEG_INFINITY,
    })
}

struct Onboarding {
    scroll: UiScroll,
    dots: [pressto::Pressable; 4],
    /// The dot a finger holds.
    held: Option<usize>,
    size: (f64, f64),
    font: Option<Font>,
    /// The four titles laid out for the current width (once per size, not per frame).
    titles: Vec<Title>,
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
    gpu: Option<Gpu>,
    posted: Vec<String>,
    /// The front page as its haptic last saw it.
    page: i64,
    /// A finger's swipe moves the list (until it rests): its page changes play.
    swiping: bool,
    /// The finger has the list past an end (its rigid haptic played).
    banded: bool,
    /// When the last haptic was posted, ms.
    haptic_at: f64,
}

impl Onboarding {
    /// The swipe's haptics for the list's offset now: the page it crossed, the end it hit.
    fn swipe_haptics(&mut self, now: f64) {
        // The page holds until the offset is SWITCH past the half-page line: a finger holding
        // the list there does not flap.
        let w = self.size.0.max(1.0);
        let f = self.scroll.offset / w;
        let held = (f - self.page as f64).abs() < 0.5 + SWITCH / w;
        let page = f.round() as i64;
        if page != self.page && !held {
            self.page = page;
            if self.swiping && now - self.haptic_at >= HAPTIC_GAP_MS {
                self.posted.push("haptic:selection".into());
                self.haptic_at = now;
            }
        }
        let (offset, max) = (self.scroll.offset, self.scroll.max);
        let out = offset < -PAST_END || offset > max + PAST_END;
        if (0.0..=max).contains(&offset) {
            self.banded = false;
        } else if out && self.scroll.dragging() && !self.banded {
            self.banded = true;
            self.posted.push("haptic:impact-rigid".into());
            self.haptic_at = now;
        }
    }

    /// The row of dots: its left and top.
    fn dots_origin(&self) -> (f64, f64) {
        let row = 4.0 * (DOT + 2.0 * DOT_PAD);
        ((self.size.0 - row) / 2.0, self.size.1 - DOTS_BOTTOM - DOT)
    }

    /// The dot whose pressable (with its hitSlop) is under (x, y): the last one wins.
    fn dot_at(&self, x: f64, y: f64) -> Option<usize> {
        let (left, top) = self.dots_origin();
        let cell = DOT + 2.0 * DOT_PAD;
        (0..4).rev().find(|&i| {
            let l = left + i as f64 * cell;
            (l - HIT_SLOP..=l + cell + HIT_SLOP).contains(&x)
                && (top - HIT_SLOP..=top + DOT + HIT_SLOP).contains(&y)
        })
    }

    fn draw_ui(&mut self, scale: f64) {
        let (w, h) = self.size;
        let x = self.scroll.offset;
        let (dl, dt) = self.dots_origin();
        let c = &mut self.canvas;
        c.begin(scale as f32);
        let side = w * 0.6;
        let line_h = self
            .font
            .as_ref()
            .map_or(0.0, |f| gfx::line_height(f) as f64);
        for i in 0..4 {
            let page_x = i as f64 * w - x;
            if page_x <= -w || page_x >= w {
                continue;
            }
            let (sx, s, opacity) = page_style(x, i, w);
            let title = self.titles.get(i);
            // Centre the column on the unrounded text height, as Yoga does.
            let text_h = title.map_or(0.0, |t| t.lines.len() as f64) * line_h;
            let top0 = (h - (side + TITLE_TOP + text_h)) / 2.0;
            // The page's views on Yoga's grid inside the content, the content moved by the offset.
            let left = grid((w - side) / 2.0, scale) + page_x;
            let top = grid(top0, scale);
            let (cx, cy) = (left + side / 2.0, top + side / 2.0);
            if sx.abs() > 1e-6 {
                c.save();
                c.concat(
                    Matrix::translate(-cx as f32, -cy as f32)
                        .then(Matrix::scale(sx as f32, s as f32))
                        .then(Matrix::translate(cx as f32, cy as f32)),
                );
                c.draw_circle(
                    cx as f32,
                    cy as f32,
                    (side / 2.0) as f32,
                    &Paint::fill(Color::WHITE),
                );
                if let Some(images) = self.images.as_ref() {
                    let photo = images.image(i);
                    let inner = side - 2.0 * PADDING;
                    let (ix, iy) = (left + PADDING, top + PADDING);
                    let placed = fit_cover(
                        Rect::new(0.0, 0.0, photo.width, photo.height),
                        Rect::new(ix as f32, iy as f32, inner as f32, inner as f32),
                    );
                    c.draw_circle(
                        cx as f32,
                        cy as f32,
                        (inner / 2.0) as f32,
                        &Paint::image(photo, placed.invert()),
                    );
                }
                c.restore();
            }
            if let (Some(font), Some(title), true) = (self.font.as_ref(), title, opacity > 0.0) {
                // Round the left edge down and the right edge up: a half-pixel left edge needs the extra pixel.
                let raw_left = (w - title.max) / 2.0;
                let left = text_grid(raw_left, scale);
                let box_w = text_ceil(raw_left + title.max, scale) - left;
                let box_left = left + page_x;
                let box_top = text_grid(top0 + side + TITLE_TOP, scale);
                let paint = Paint::fill(Color::WHITE).with_opacity(opacity as f32);
                for (k, (line, lw)) in title.lines.iter().zip(&title.widths).enumerate() {
                    let lx = box_left + (box_w - lw) / 2.0;
                    let ly = box_top + k as f64 * line_h;
                    c.draw_text_spaced(
                        line,
                        lx as f32,
                        gfx::baseline(font, ly as f32),
                        font,
                        &paint,
                        SPACING,
                    );
                }
            }
        }
        let progress = x / w;
        let cell = DOT + 2.0 * DOT_PAD;
        for (i, dot) in self.dots.iter().enumerate() {
            let l = grid(dl + i as f64 * cell, scale);
            let (cx, cy) = (l + cell / 2.0, grid(dt, scale) + DOT / 2.0);
            let k = dot.scale();
            c.save();
            c.concat(
                Matrix::translate(-cx as f32, -cy as f32)
                    .then(Matrix::scale(k as f32, k as f32))
                    .then(Matrix::translate(cx as f32, cy as f32)),
            );
            let paint = Paint::fill(Color::view_hex(0xD4D4D4))
                .with_opacity(dot_opacity(progress, i) as f32);
            c.draw_circle(cx as f32, cy as f32, (DOT / 2.0) as f32, &paint);
            c.restore();
        }
    }
}

impl Surface for Onboarding {
    /// An input, when given, sets the scroll's offset (tests).
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(x) = inputs.first().and_then(|v| v.as_number()) {
            self.scroll.offset = x;
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"contentOffset\":{:.2}}}", self.scroll.offset))
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        let phase = gfx::phase(phase);
        let (px, py) = (x as f64, y as f64);
        if phase == Phase::Down && self.held.is_none() && !self.scroll.dragging() {
            if let Some(i) = self.dot_at(px, py) {
                self.held = Some(i);
                self.dots[i].pointer(id, phase, true);
                return;
            }
        }
        if let Some(i) = self.held {
            if self.dots[i].finger() != Some(id) {
                return;
            }
            let inside = self.dot_at(px, py) == Some(i) || {
                let (left, top) = self.dots_origin();
                let l = left + i as f64 * (DOT + 2.0 * DOT_PAD);
                (l - HIT_SLOP..=l + DOT + 2.0 * DOT_PAD + HIT_SLOP).contains(&px)
                    && (top - HIT_SLOP..=top + DOT + HIT_SLOP).contains(&py)
            };
            if let Some(pressto::PressEvent::Press(p)) = self.dots[i].pointer(id, phase, inside) {
                self.swiping = false;
                self.scroll.scroll_to(i as f64 * self.size.0);
                if let Some(m) = p.global_message() {
                    self.posted.push(m.to_string());
                }
            }
            if matches!(phase, Phase::Up | Phase::Cancel) {
                self.held = None;
            }
            return;
        }
        let inside = (0.0..=self.size.0).contains(&px) && (0.0..=self.size.1).contains(&py);
        self.scroll.input(id, phase, x, y, at_ms, inside);
        if self.scroll.dragging() {
            self.swiping = true;
        }
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
        let (w, h, scale) = (frame.width as f64, frame.height as f64, frame.scale as f64);
        if self.size != (w, h) {
            self.size = (w, h);
            self.scroll.port = w;
            self.scroll.snap = Snap::Page(w);
            self.scroll.max = 3.0 * w;
            self.titles = match self.font.as_ref() {
                Some(font) => TITLES
                    .iter()
                    .map(|t| {
                        let lines = lines(font, &t.to_uppercase(), w - 2.0 * TITLE_MARGIN);
                        let widths: Vec<f64> = lines
                            .iter()
                            .map(|l| font.advance_width_spaced(l, SPACING) as f64)
                            .collect();
                        let max = widths.iter().cloned().fold(0.0, f64::max);
                        Title { lines, widths, max }
                    })
                    .collect(),
                None => Vec::new(),
            };
        }
        if self.images.is_none() {
            let decoded: Vec<draw2d::Image> = (0..4).map(photo).collect();
            let refs: Vec<&draw2d::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let mut moving = self.scroll.step(frame.now_ms);
        self.swipe_haptics(frame.now_ms);
        if !moving && !self.scroll.dragging() {
            self.swiping = false;
        }
        for dot in &mut self.dots {
            moving |= dot.step(frame.now_ms);
        }
        self.draw_ui(scale);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.size)) != Some((format, (pw, ph))) {
            let layer = gfx::target(
                device,
                "github onboarding views",
                wgpu::TextureFormat::Rgba8Unorm,
                pw,
                ph,
            );
            let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("github onboarding"),
                source: wgpu::ShaderSource::Wgsl(COMPOSE.into()),
            });
            let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("github onboarding"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: false },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                ],
            });
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("github onboarding"),
                size: 48,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("github onboarding"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&layer),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: uniforms.as_entire_binding(),
                    },
                ],
            });
            let pipeline = gfx::fullscreen(
                device,
                format,
                &module,
                &layout,
                "vs",
                "fs",
                None,
                "github onboarding",
            );
            self.gpu = Some(Gpu {
                format,
                size: (pw, ph),
                layer,
                uniforms,
                pipeline,
                bind,
            });
        }
        let gpu = self.gpu.as_ref().unwrap();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            &gpu.layer,
            wgpu::TextureFormat::Rgba8Unorm,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        let [c0, c1] = gradient(self.scroll.offset / w).map(srgb_to_p3);
        let span = (2.0 * h * scale) as f32;
        let u: [f32; 12] = [
            c0[0],
            c0[1],
            c0[2],
            1.0,
            c1[0],
            c1[1],
            c1[2],
            1.0,
            span,
            gfx::srgb_flag(format),
            0.0,
            0.0,
        ];
        let mut bytes = [0u8; 48];
        for (d, v) in bytes.chunks_exact_mut(4).zip(u) {
            d.copy_from_slice(&v.to_le_bytes());
        }
        queue.write_buffer(&gpu.uniforms, 0, &bytes);
        gfx::pass(
            encoder,
            "github onboarding",
            target,
            &gpu.pipeline,
            &gpu.bind,
        );
        moving || self.scroll.moving()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_pages_turn_and_the_dots_page() {
        let (sx, s, o) = page_style(0.0, 0, 420.0);
        assert!((sx - 1.0).abs() < 1e-9 && s == 1.0 && o == 1.0);
        let (sx, s, o) = page_style(420.0, 0, 420.0);
        assert!((sx - 0.5 * (PI / 4.0).cos()).abs() < 1e-9 && s == 0.5 && o == 0.0);
        assert_eq!(page_style(105.0, 0, 420.0).2, 0.5);
        assert!(
            (dot_opacity(0.0, 0) - 0.6).abs() < 1e-9 && (dot_opacity(1.0, 0) - 0.2).abs() < 1e-9
        );
        // Darken 0.8 keeps a fifth of the lightness.
        let [_, dark] = gradient(0.0);
        assert!(dark[2] < 0.25, "{dark:?}");

        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let touch = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut s = surface();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("github-onboarding-rest");
        // The title takes two lines (48 + 48 pt), so the column is 252 + 50 + 96 tall: the
        // badge's top at 257, white 4 pt below it (its padding).
        let p = img.at(3 * 210, 3 * (257 + 4));
        assert!(p[0] > 250 && p[1] > 250 && p[2] > 250, "{p:?}");
        let p = img.at(3 * 210, 3 * (257 - 2));
        assert!(p[2] < 200, "{p:?}");
        // The top of the gradient is the first colour, as P3 8-bit shows it.
        let t = img.at(10, 1);
        assert!(
            (t[0] as i32 - 0x26).abs() <= 2 && (t[2] as i32 - 0x9E).abs() <= 2,
            "{t:?}"
        );
        // Half a page: the badges turn.
        s.bind(&[Value::Number(210.0)], None).unwrap();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        img.save("github-onboarding-half");
        // The third dot: the list pages to 840, a haptic.
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let mut ms = 100.0;
        let (dx, dy) = (176.0 + 2.0 * 17.0 + 8.5, 912.0 - 100.0 - 3.5);
        s.input(&touch(PointerPhase::Down, dx, dy, ms));
        s.input(&touch(PointerPhase::Up, dx, dy, ms + 60.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 3000.0 {
            ms += 16.7;
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":840.00}");
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("github-onboarding-page3");
        // A slow drag past half a page turns it; a short one goes back.
        let drag = |s: &mut Box<dyn Surface>, to: f32, ms: &mut f64| {
            s.input(&touch(PointerPhase::Down, 300.0, 400.0, *ms));
            for k in 1..=30 {
                *ms += 16.7;
                s.input(&touch(
                    PointerPhase::Move,
                    300.0 + (to - 300.0) * k as f32 / 30.0,
                    400.0,
                    *ms,
                ));
            }
            *ms += 200.0;
            s.input(&touch(PointerPhase::Up, to, 400.0, *ms));
            while fixture::render(&gpu, s.as_mut(), &frame(*ms)).unwrap().1 && *ms < 9000.0 {
                *ms += 16.7;
            }
        };
        drag(&mut s, 60.0, &mut ms);
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":1260.00}");
        drag(&mut s, 550.0, &mut ms);
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":840.00}");
        drag(&mut s, 400.0, &mut ms);
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":840.00}");
        // A selection as the first swipe turns to page 4, one as the second turns back to 3;
        // the short one turns none.
        assert_eq!(s.messages(), vec!["haptic:selection".to_string(), "haptic:selection".to_string()]);
    }
}
