//! Email Demo's rows (src/animations/email-demo: index.tsx styles.listContainerItem,
//! components/interactive-list AnimatedListItem, components/list-item ListItem, constants.ts):
//! one canvas per row, inside the row's Contract box (which keeps the list's translateY and
//! opacity springs), drawing the row's layer and its springing Core Animation shadow.
//!
//! - The row (listContainerItem): W × 100 (W = window − 24), radius 20 continuous, border 0.5
//!   rgba(229, 231, 235, 0.3) (translucent, not clipping: RCTBorderDrawing's ring with circular
//!   corners, `skia::border_ring_path`), boxShadow 0 1 4 rgba(0, 0, 0, 0.05) (RCTBoxShadow: σ 2, the
//!   circular rounded rect, outside the view; a sublayer, so in the layer's own shadow too).
//!   listContainerItem's white is overridden by the animated backgroundColor, which RN draws in
//!   its background layer (continuous, the view's cornerCurve).
//! - ListItem: a centred row, padding 16 × 12 inside the border: the photo (expo-image, cover,
//!   45 × 45, radius 22.5: expo-image ignores borderCurve, so a circle, measured) at (16.667, 27.667); the labels (flex 1, 306 wide,
//!   centred): the title (17 semibold, letterSpacing −0.2, #111827, one line, marginBottom 4)
//!   and the subtitle (15, letterSpacing −0.1, lineHeight 20, #6b7280, two lines at most), each
//!   Text box ceiled to the device pixel after an epsilon (20.287 → 20.333, 40 → 40.333). Yoga
//!   rounds each position relative to its parent (ListItem's 0.5 inset is 0.667, the labels'
//!   17.167 is 17.333; a Text's offset floored): title at 18, subtitle at 42.333, matched on
//!   RN's pixels.
//! - The photos: constants.ts's Unsplash URLs as RN requests them (w=400&h=400), downscaled as
//!   expo-image does (`resize`: UIGraphicsImageRenderer on the iOS Simulator, 135 px), bundled
//!   (gpu/images/email-demo). Interior within ~1–3 levels of RN's on average (max 19–48 on
//!   sharp edges): SDWebImage's decode path is not reproduced bit for bit.
//!
//! Motion audit (AnimatedListItem's rStyle; on = index == erased count):
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | backgroundColor | withSpring(on ? rgba(59,130,246,0.06) : transparent, { damping 25, stiffness 200, mass 1.2 }): Reanimated's colour animation, each RGBA channel its own spring in gamma 2.2 space, rgb rounded to 8 bits, alpha < 0.001 → 0; processColor rounds alpha to 8 bits; Display P3 | four `Spring`s, the same rounding, `Color::view_hex` |
//! | shadowOpacity | withSpring(on ? 0.15 : 0, same config) | `Spring` |
//! | shadowRadius | withSpring(on ? 12 : 4, same config) | `Spring`; σ = shadowRadius (as RCTBoxShadow's blur / 2 is) |
//! | shadowOffset.height | withSpring(on ? 6 : 1, same config) | `Spring` |
//! | shadowColor | rgba(59, 130, 246, 0.4), Display P3 | × shadowOpacity, premultiplied |
//! | the shadow's shape | no shadowPath (the background isn't opaque): the layer's alpha, its sublayers included | the content layer's alpha, Graphite's blur |
//! | translateY, opacity | withSpring(−shifted · 110, { 30, 180, 1.5 }), withSpring(index ≥ shifted, { 26, 190, 1.4 }) | the Contract row box (verified), this canvas inside it |
//!
//! Each spring retargets from where it is at its velocity, dropped when it points away from
//! the new target (Reanimated's onStart; `Spring::to`). On mount every value is at its target.
//!
//! Inputs: the row's index, the erased count.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Spring, SpringConfig as Config};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{fit_cover, Canvas, Color, Font, Images, Paint, Rect, Renderer};

use crate::{gfx, shaders};
use shaders::email_demo::{entry, module, Uniforms, BLURRED, CONTENT, GROUP_0, SMP, U};

/// The canvas's margin around the row: the shadow's reach (offset 6 + 3σ 36) and more.
pub const MARGIN: f32 = 48.0;
/// ITEM_HEIGHT.
const HEIGHT: f32 = 100.0;
const RADIUS: f32 = 20.0;
const BORDER: f32 = 0.5;
/// The photo's side (itemHeight × 0.45) and radius (× 0.225).
const PHOTO: f32 = 45.0;
const PHOTO_RADIUS: f32 = 22.5;
const SUBTITLE_LINE: f32 = 20.0;
/// The springs of rStyle's highlight values.
const HIGHLIGHT: Config = Config { stiffness: 200.0, damping: 25.0, mass: 1.2 };
/// rgba(59, 130, 246, 0.06): processColor's alpha byte is round(0.06 × 255) = 15.
const BLUE: [f64; 3] = [59.0, 130.0, 246.0];
const BLUE_ALPHA: f64 = 15.0 / 255.0;
const SHADOW_COLOR_ALPHA: f32 = 0.4;

const TITLES: [&str; 10] = [
    "Welcome to our community",
    "Security verification required",
    "Your order has been confirmed",
    "Team meeting reminder",
    "Payment successful",
    "New message from Sarah",
    "Weekly newsletter",
    "Password reset request",
    "Event invitation",
    "App update available",
];
const SUBTITLES: [&str; 10] = [
    "Get started with your new account and explore amazing features.",
    "Please verify your identity to secure your account.",
    "Thank you for your purchase. Order #12345 is being processed.",
    "Don't forget about today's meeting at 2:00 PM.",
    "Your payment of $29.99 has been processed successfully.",
    "Hey! Are we still on for lunch tomorrow?",
    "Here are this week's top stories and updates.",
    "Click here to reset your password within 24 hours.",
    "You're invited to our annual conference next month.",
    "Version 2.1 is now available with new features.",
];
/// The photos as RN shows them: each URL's 400 × 400 JPEG, decoded by ImageIO and downscaled by
/// expo-image's `resize` (UIGraphicsImageRenderer, 45 × 45 at scale 3, `draw(in:)`), run on the
/// iOS Simulator; 135 × 135 RGB rows, zlib. Drawn one texel per device pixel.
static PHOTOS: [&[u8]; 10] = [
    include_bytes!("../images/email-demo/01-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/02-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/03-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/04-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/05-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/06-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/07-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/08-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/09-135.rgb8.zlib"),
    include_bytes!("../images/email-demo/10-135.rgb8.zlib"),
];
const PHOTO_PX: u32 = 135;

/// A bundled photo's pixels (opaque RGBA).
fn photo(index: usize) -> skia::Image {
    let rgb = miniz_oxide::inflate::decompress_to_vec_zlib(PHOTOS[index]).unwrap_or_default();
    let n = (PHOTO_PX * PHOTO_PX) as usize;
    let mut rgba = vec![200u8; n * 4];
    if rgb.len() == n * 3 {
        for (d, s) in rgba.chunks_exact_mut(4).zip(rgb.chunks_exact(3)) {
            d[..3].copy_from_slice(s);
            d[3] = 255;
        }
    }
    skia::Image::from_rgba(PHOTO_PX, PHOTO_PX, rgba)
}

/// One row's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Row {
        index: 0,
        on: None,
        background: Default::default(),
        opacity: Spring::default(),
        radius: Spring::default(),
        offset: Spring::default(),
        title: skia::match_ui_font(17.0, 600.0),
        subtitle: skia::match_ui_font(15.0, 400.0),
        lines: Vec::new(),
        laid_out: None,
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        blur: GraphiteBlur::default(),
        plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
        gpu: None,
    })
}

struct Row {
    index: usize,
    on: Option<bool>,
    /// backgroundColor's R, G, B (gamma 2.2 linear, 0…1) and A.
    background: [Spring; 4],
    opacity: Spring,
    radius: Spring,
    offset: Spring,
    title: Option<Font>,
    subtitle: Option<Font>,
    /// The subtitle's lines (byte ranges).
    lines: Vec<(usize, usize)>,
    /// The (row index, label width) the lines were broken for.
    laid_out: Option<(usize, f32)>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
    blur: GraphiteBlur,
    plan: GraphitePlan,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    layer: wgpu::TextureView,
    empty: wgpu::TextureView,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

/// The highlight's values: backgroundColor (linear channels), shadowOpacity, shadowRadius,
/// shadowOffset.height.
fn targets(on: bool) -> ([f64; 4], f64, f64, f64) {
    if on {
        let lin = |c: f64| (c / 255.0).powf(2.2);
        ([lin(BLUE[0]), lin(BLUE[1]), lin(BLUE[2]), BLUE_ALPHA], 0.15, 12.0, 6.0)
    } else {
        ([0.0; 4], 0.0, 4.0, 1.0)
    }
}

/// The colour Reanimated writes for linear channels `c` (rgbaArrayToRGBAColor of toGammaSpace,
/// after clampRGBA), as the view gets it (processColor: the alpha to 8 bits).
fn background_color(c: [f64; 4]) -> Option<Color> {
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let byte = |v: f64| (clamp(v).powf(1.0 / 2.2) * 255.0).round() as u32;
    let a = clamp(c[3]);
    let a = if a < 0.001 { 0.0 } else { a };
    let a8 = (a * 255.0).round();
    if a8 <= 0.0 {
        return None;
    }
    let rgb = (byte(c[0]) << 16) | (byte(c[1]) << 8) | byte(c[2]);
    Some(Color::view_hex(rgb).alpha((a8 / 255.0) as f32))
}

/// Yoga's rounding of a layout edge to the device pixel grid (half up).
fn grid(v: f32, scale: f32) -> f32 {
    (v * scale + 0.5 + 1e-4).floor() / scale
}

/// A Text's measured side: ceiled to the device pixel after an epsilon (an exact 40 is 40.333).
fn text_side(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor() + 1.0) / scale
}

/// TextKit's word wrapping with `letterSpacing` (NSKern after every glyph): a break after spaces
/// (which hang) and after a hyphen between letters; a line holds what fits in `width`.
pub(crate) fn wrap(font: &Font, text: &str, spacing: f32, width: f32, out: &mut Vec<(usize, usize)>) {
    out.clear();
    let mut breaks: Vec<(usize, usize)> = Vec::new();
    let bytes: Vec<(usize, char)> = text.char_indices().collect();
    let n = bytes.len();
    let byte = |i: usize| if i < n { bytes[i].0 } else { text.len() };
    let mut i = 0;
    while i < n {
        let c = bytes[i].1;
        if c == ' ' {
            let mut j = i;
            while j < n && bytes[j].1 == ' ' {
                j += 1;
            }
            if j < n {
                breaks.push((i, j));
            }
            i = j;
            continue;
        }
        if c == '-' && i > 0 && i + 1 < n && bytes[i - 1].1.is_alphanumeric() && bytes[i + 1].1.is_alphanumeric() {
            breaks.push((i + 1, i + 1));
        }
        i += 1;
    }
    breaks.push((n, n));
    let fits = |a: usize, b: usize| font.advance_width_spaced(&text[byte(a)..byte(b)], spacing) <= width + 1e-3;
    let mut start = 0;
    let mut k = 0;
    while start < n {
        let mut last = None;
        while k < breaks.len() {
            let (end, next) = breaks[k];
            if end <= start {
                k += 1;
                continue;
            }
            if fits(start, end) {
                last = Some((end, next));
                k += 1;
            } else {
                break;
            }
        }
        match last {
            Some((end, next)) => {
                out.push((byte(start), byte(end)));
                start = next;
            }
            None => {
                let mut end = start + 1;
                while end < n && fits(start, end + 1) {
                    end += 1;
                }
                out.push((byte(start), byte(end)));
                start = end;
            }
        }
    }
}

/// Where ListItem's pieces sit in the row (row points; the row's origin is on the pixel grid).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Layout {
    photo: [f32; 4],
    labels_x: f32,
    labels_w: f32,
    title_top: f32,
    subtitle_top: f32,
}

/// Yoga's rounding: each node's position relative to its parent, half up (a Text's floored),
/// its size from its unrounded absolute edges; a child's absolute position is the sum of its
/// ancestors' rounded ones. The row's origin is on the pixel grid.
fn layout(row_w: f32, title_h: f32, subtitle_lines: usize, scale: f32) -> Layout {
    let g = |v: f32| grid(v, scale);
    let floor = |v: f32| (v * scale + 1e-4).floor() / scale;
    // ListItem's View, inside the border: (0.5, 0.5) relative, rounded to 0.667.
    let inner = g(BORDER);
    let (pad_x, pad_y) = (16.0, 12.0);
    let (cw, ch) = (row_w - 2.0 * (BORDER + pad_x), HEIGHT - 2.0 * (BORDER + pad_y));
    // avatarContainer (and the photo at its origin): centred in the 75 tall content box.
    let (px, py) = (inner + g(pad_x), inner + g(pad_y + (ch - PHOTO) / 2.0));
    let (ax, ay) = (BORDER + pad_x, BORDER + pad_y + (ch - PHOTO) / 2.0);
    let photo = [px, py, g(ax + PHOTO) - g(ax), g(ay + PHOTO) - g(ay)];
    // labelsContainer: flex 1 after the photo and its marginRight 12; its Texts ceiled.
    let lx = pad_x + PHOTO + 12.0;
    let lw = cw - PHOTO - 12.0;
    let title_box = text_side(title_h, scale);
    let subtitle_box = text_side(SUBTITLE_LINE * subtitle_lines as f32, scale);
    let lh = title_box + 4.0 + subtitle_box;
    let ly = inner + g(pad_y + (ch - lh) / 2.0);
    let labels_x = inner + g(lx);
    let abs_l = BORDER + lx;
    Layout { photo, labels_x, labels_w: g(abs_l + lw) - g(abs_l), title_top: ly, subtitle_top: ly + floor(title_box + 4.0) }
}

impl Row {
    fn on(&self) -> bool {
        self.on.unwrap_or(false)
    }

    fn step(&mut self, now_ms: f64) -> bool {
        let mut moving = false;
        for s in self.background.iter_mut().chain([&mut self.opacity, &mut self.radius, &mut self.offset]) {
            moving |= s.step(now_ms);
        }
        moving
    }

    /// The row's layer into `self.canvas`: the row at (MARGIN, MARGIN).
    fn record(&mut self, row_w: f32, scale: f32) {
        let (title, subtitle) = (self.title.as_ref(), self.subtitle.as_ref());
        if let Some(sub) = subtitle {
            let label_w = layout(row_w, 0.0, 1, scale).labels_w;
            if self.laid_out != Some((self.index, label_w)) {
                wrap(sub, SUBTITLES[self.index], -0.1, label_w, &mut self.lines);
                self.lines.truncate(2);
                self.laid_out = Some((self.index, label_w));
            }
        }
        let title_h = title.map_or(0.0, gfx::line_height);
        let l = layout(row_w, title_h, self.lines.len().max(1), scale);
        let (x, y) = (MARGIN, MARGIN);
        let c = &mut self.canvas;
        c.begin(scale);
        c.translate(x, y);
        // RCTBoxShadow: outside the view only.
        c.save();
        c.clip_with(|b| {
            skia::add_rect(b, -MARGIN, -MARGIN, row_w + 2.0 * MARGIN, HEIGHT + 2.0 * MARGIN);
            skia::add_rrect_hole(b, 0.0, 0.0, row_w, HEIGHT, RADIUS);
        });
        c.draw_rrect_shadow(0.0, 1.0, row_w, HEIGHT, RADIUS, 2.0, Color::BLACK.alpha(0.05));
        c.restore();
        let bg: [f64; 4] = std::array::from_fn(|k| self.background[k].value);
        if let Some(color) = background_color(bg) {
            c.draw_continuous_rrect(0.0, 0.0, row_w, HEIGHT, RADIUS, &Paint::fill(color));
        }
        c.draw_path(&skia::border_ring_path(0.0, 0.0, row_w, HEIGHT, RADIUS, BORDER), &Paint::fill(Color::view_hex(0xE5E7EB).alpha(0.3)));
        if let Some(images) = self.images.as_ref() {
            let [px, py, pw, ph] = l.photo;
            let photo = images.image(0);
            let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), Rect::new(px, py, pw, ph));
            // expo-image ignores borderCurve (ListItem's own TODO): a circular radius, a circle.
            c.draw_rrect(px, py, pw, ph, PHOTO_RADIUS, &Paint::image(photo, placed.invert()));
        }
        if let Some(f) = title {
            c.draw_text_spaced(TITLES[self.index], l.labels_x, gfx::baseline(f, l.title_top), f, &Paint::fill(Color::view_hex(0x111827)), -0.2);
        }
        if let Some(f) = subtitle {
            // lineHeight 20: each line's baseline (20 − line height) / 2 below TextKit's.
            let offset = (SUBTITLE_LINE - gfx::line_height(f)) / 2.0;
            let paint = Paint::fill(Color::view_hex(0x6B7280));
            let text = SUBTITLES[self.index];
            for (i, &(a, b)) in self.lines.iter().enumerate() {
                let top = l.subtitle_top + i as f32 * SUBTITLE_LINE + offset;
                c.draw_text_spaced(&text[a..b], l.labels_x, gfx::baseline(f, top), f, &paint, -0.1);
            }
        }
    }
}

impl Surface for Row {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let index = (inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0).round().max(0.0) as usize).min(9);
        let shifted = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0).round();
        if index != self.index {
            self.index = index;
            self.images = None;
        }
        let on = index as f64 == shifted;
        if self.on == Some(on) {
            return Ok(());
        }
        let (bg, opacity, radius, offset) = targets(on);
        if self.on.is_none() {
            for (s, v) in self.background.iter_mut().zip(bg) {
                s.set(v);
            }
            self.opacity.set(opacity);
            self.radius.set(radius);
            self.offset.set(offset);
        } else {
            let to = |s: &mut Spring, v: f64| {
                let velocity = if s.running { s.velocity } else { 0.0 };
                s.to(v, velocity, HIGHLIGHT);
            };
            for (s, v) in self.background.iter_mut().zip(bg) {
                to(s, v);
            }
            to(&mut self.opacity, opacity);
            to(&mut self.radius, radius);
            to(&mut self.offset, offset);
        }
        self.on = Some(on);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"index\":{},\"highlighted\":{},\"shadowOpacity\":{:.4},\"shadowRadius\":{:.3},\"shadowOffset\":{:.3},\"backgroundAlpha\":{:.4}}}",
            self.index,
            self.on(),
            self.opacity.value,
            self.radius.value,
            self.offset.value,
            self.background[3].value
        ))
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
        if self.on.is_none() {
            self.bind(&[], None).ok();
        }
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let moving = self.step(frame.now_ms);
        if self.images.is_none() {
            let images = Images::upload(device, queue, &[&photo(self.index)]);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let row_w = frame.width - 2.0 * MARGIN;
        self.record(row_w, s);
        let gpu = self.gpu.as_mut().unwrap();
        self.renderer.draw(device, queue, encoder, &self.canvas, &gpu.layer, GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        let mut u = Uniforms { canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)], low: [0.0; 4], out: [0.0; 4], color: [0.0; 4], offset: [0.0; 4] };
        let mut view = gpu.empty.clone();
        let alpha = SHADOW_COLOR_ALPHA * self.opacity.value as f32;
        if alpha > 0.0 {
            let dy = self.offset.value as f32 * s;
            // The layer's ink: the row and its box shadow's reach.
            let reach = 2.0 * 3.0 + 1.0;
            let layer: IRect = round_out([(MARGIN - reach) * s, (MARGIN - reach) * s, (MARGIN + row_w + reach) * s, (MARGIN + HEIGHT + reach + 1.0) * s]);
            let desired: IRect = round_out([0.0, -dy, pw as f32, ph as f32 - dy]);
            if self.plan.update(layer, desired, self.radius.value as f32 * s) {
                let out = self.blur.run(device, queue, encoder, Placed { view: &gpu.layer, origin: [0, 0], size: [pw, ph] }, &self.plan);
                u.low = low_mapping(&self.plan, out.origin, out.size);
                u.out = self.plan.output.map(|v| v as f32);
                let blue = Color::view_hex(0x3B82F6).0;
                u.color = [blue[0] * alpha, blue[1] * alpha, blue[2] * alpha, alpha];
                u.offset = [0.0, dy, 0.0, 0.0];
                view = out.view.clone();
            }
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != view) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("email row"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: CONTENT.binding, resource: wgpu::BindingResource::TextureView(&gpu.layer) },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(&view) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((view, group));
        }
        skia::render::fullscreen_pass(encoder, "email row", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        moving
    }
}

fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    Gpu {
        format,
        generation,
        pixels,
        compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None),
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("email row"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        layer: skia::render::sampled_target(device, "email row layer", GRAPHITE_FORMAT, pixels.0, pixels.1),
        empty: skia::render::sampled_target(device, "email row empty", GRAPHITE_FORMAT, 1, 1),
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_labels_fit_as_rn_lays_them_out() {
        let (Some(title), Some(sub)) = (skia::match_ui_font(17.0, 600.0), skia::match_ui_font(15.0, 400.0)) else {
            return eprintln!("no system font; skipped");
        };
        // iPhone Air: the row 396 wide, the labels 306.
        // The iOS SF 17 semibold line (UIFont.lineHeight 20.287109, the text probe).
        let l = layout(396.0, 20.287109, 2, 3.0);
        assert!((l.labels_w - 306.0).abs() < 1e-3, "{l:?}");
        assert!((l.title_top - 18.0).abs() < 1e-3 && (l.subtitle_top - 127.0 / 3.0).abs() < 1e-3, "{l:?}");
        assert!((l.photo[0] - 50.0 / 3.0).abs() < 1e-3 && (l.photo[1] - 83.0 / 3.0).abs() < 1e-3, "{l:?}");
        let mut lines = Vec::new();
        for i in 0..10 {
            // One line each title (numberOfLines 1 never truncates here).
            assert!(title.advance_width_spaced(TITLES[i], -0.2) <= l.labels_w, "{}", TITLES[i]);
            wrap(&sub, SUBTITLES[i], -0.1, l.labels_w, &mut lines);
            assert!((1..=2).contains(&lines.len()), "{}: {lines:?}", SUBTITLES[i]);
        }
    }

    #[test]
    fn the_highlight_springs_to_the_next_row() {
        let mut r = surface();
        r.bind(&[Value::Number(0.0), Value::Number(0.0)], None).unwrap();
        assert!(r.agent("").unwrap().contains("\"highlighted\":true,\"shadowOpacity\":0.1500,\"shadowRadius\":12.000"));
        let mut row = surface_row();
        row.bind(&[Value::Number(0.0), Value::Number(0.0)], None).unwrap();
        row.bind(&[Value::Number(0.0), Value::Number(1.0)], None).unwrap();
        let mut ms = 0.0;
        let mut frames = 0;
        while row.step(ms) {
            ms += 1000.0 / 60.0;
            frames += 1;
            assert!(frames < 200);
        }
        assert_eq!((row.opacity.value, row.radius.value, row.offset.value), (0.0, 4.0, 1.0));
        assert!(background_color(std::array::from_fn(|k| row.background[k].value)).is_none());
    }

    fn surface_row() -> Row {
        Row {
            index: 0,
            on: None,
            background: Default::default(),
            opacity: Spring::default(),
            radius: Spring::default(),
            offset: Spring::default(),
            title: None,
            subtitle: None,
            lines: Vec::new(),
            laid_out: None,
            images: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
            blur: GraphiteBlur::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
            gpu: None,
            }
    }

    #[test]
    fn the_highlighted_row_casts_a_blue_shadow_below() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        dir.push("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let frame = |w: f32| Frame { width: w, height: HEIGHT + 2.0 * MARGIN, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let w = 396.0 + 2.0 * MARGIN;
        let mut on = surface();
        on.bind(&[Value::Number(0.0), Value::Number(0.0)], None).unwrap();
        let (img_on, moving) = fixture::render(&gpu, on.as_mut(), &frame(w)).unwrap();
        assert!(!moving);
        gfx::save_over(&img_on, "email-row-on", [248, 250, 252]);
        let mut off = surface();
        off.bind(&[Value::Number(0.0), Value::Number(3.0)], None).unwrap();
        let (img_off, _) = fixture::render(&gpu, off.as_mut(), &frame(w)).unwrap();
        gfx::save_over(&img_off, "email-row-off", [248, 250, 252]);
        // Below the row's bottom (y 48 + 100), under the photo: blue in the highlighted one only.
        let (x, y) = ((MARGIN + 40.0) as u32 * 3, (MARGIN + HEIGHT + 8.0) as u32 * 3);
        let p = img_on.at(x, y);
        assert!(p[3] > 0 && p[2] > p[0], "{p:?}");
        assert!(img_off.at(x, y)[3] < p[3], "{:?} {:?}", img_off.at(x, y), p);
    }
}
