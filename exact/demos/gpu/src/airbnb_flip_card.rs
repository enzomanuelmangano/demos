//! Airbnb Flip Interaction's card (src/animations/airbnb-flip-interaction/flip-interaction/
//! components/card: index.tsx, front.tsx, back.tsx, profile-avatar.tsx): the coral profile card
//! that turns half a turn to the white stats card. The canvas sits over FlipCard's box
//! (cardWidth × cardWidth / 1.6, cardWidth = window − 64) with MARGIN around it for the shadow
//! and the perspective; the press (pressto's PressableOpacity) is the Contract's.
//!
//! Each face (cardFace: radius 28 continuous, overflow hidden, boxShadow 0 4 12 rgba(0,0,0,0.1):
//! RCTBoxShadow, σ 6, the circular rounded rect, outside the view, a sublayer so it turns with
//! the face) is drawn once into a texture, then shown through its transform about its centre:
//! `[perspective 1000, rotateY, scale]` (the front rotateY 180·p, the back 180 + 180·p; scale
//! interpolate(p, [0, 0.5, 1], [1, 0.95, 1]), extended), a face turned away not drawn
//! (backfaceVisibility hidden), the back over the front (gpu/shaders/airbnb_flip.wgsl).
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | progress | useDerivedValue(withSpring(isFlipped ? 1 : 0, { mass 1.2, stiffness 60, damping 12, velocity 0.2 })) | `Spring`, GENTLE replaced by (60, 12, 1.2); onStart's velocity: the running animation's + 0.2 (0.2 from rest), dropped when it points away from the target (so a flip back from rest starts from 0) |
//! | rotateY, scale | interpolate(progress) as above, every frame | the same, in the faces' 4×4 |
//! | opacity (press) | pressto PressableOpacity | the Contract's wrapper |
//!
//! Faces (Yoga: each position rounded relative to its parent, a Text's floored, sizes from the
//! rounded absolute edges; Text boxes ceiled to the device pixel after an epsilon):
//! - Front: expo LinearGradient #FF6B6B → #FF8E53 → #FF6B6B, (0, 0) → (1, 1) of its bounds (a CG
//!   linear gradient in DeviceRGB: isolines perpendicular to the diagonal), clipped to the face.
//!   padding 24: "Reactiive" (SF-Pro-Rounded-Heavy 32, letterSpacing −0.5, white, marginBottom
//!   4), "Verified" (SF-Pro-Rounded-Bold 17, letterSpacing 0.2, rgba(255,255,255,0.95), text
//!   shadow 0 1 r 1 rgba(0,0,0,0.1)), a flex 1 spacer, the avatar at the bottom right.
//! - Back: white, radius 28 continuous, padding 24, centred: the avatar and (marginLeft 24)
//!   "Reactiive" (Heavy 22, −0.3, #1A1D29, marginBottom 4) over "Italy" (Bold 15, 0.1, #6B7280);
//!   marginTop 8, a row spaced around: "3"/"Trip", "1"/"Review", "4"/"Years" (Heavy 24, −0.5,
//!   #1A1D29; Bold 13, 0.2, #6B7280, marginTop 4).
//! - The avatar (80): LinearGradient #4A5568 → #2D3748 top to bottom; the gradient layer masks
//!   to its bounds, so RN draws Core Animation's border: a circle r 40 with a 3 pt
//!   rgba(255,255,255,0.3) ring; "R" (Heavy 32, white, text shadow 0 1 r 2 rgba(0,0,0,0.2))
//!   centred. The badge: 25.6 at bottom −2 right −2, #FF6B6B → #FF5252, radius 12.8, a 3 pt white
//!   ring; "✓" (the system font 11.2 bold, white, text shadow 0 1 r 1 rgba(0,0,0,0.2)).
//! - A Text's shadow (NSShadow, blur r): the glyphs in the shadow's colour, offset, blurred
//!   with σ = r / 2 (Core Graphics' blur), under the glyphs.
//!
//! Input: isFlipped.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring, SpringConfig};
use skia::blur::{GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Font, Matrix4, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::airbnb_flip::{entry as card_entry, module as card_module, Uniforms, BACK_TEX, FRONT_TEX, GROUP_0 as CARD_GROUP, SMP as CARD_SMP, U as CARD_U};
use shaders::airbnb_flip_layer as layer_shader;

static HEAVY: &[u8] = include_bytes!("../fonts/sf-pro-rounded-heavy-airbnb-subset.otf");
static BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-airbnb-subset.otf");

/// The canvas's margin around the card box: the box shadow (offset 4 + 3σ 18) and the
/// perspective's growth (the near edge ×1.2 at 90°).
pub const MARGIN: f32 = 56.0;
/// The face texture's margin around the face: its box shadow's reach.
const FACE_MARGIN: f32 = 24.0;
/// spacing.l + 4.
const RADIUS: f32 = 28.0;
const PERSPECTIVE: f32 = 1000.0;
/// card/index.tsx SPRING_CONFIG.
const SPRING: SpringConfig = SpringConfig { stiffness: 60.0, damping: 12.0, mass: 1.2 };
const SPRING_VELOCITY: f64 = 0.2;
const AVATAR: f32 = 80.0;

/// The card's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Card { flipped: None, progress: Spring::default(), faces: None, gpu: None })
}

struct Card {
    flipped: Option<bool>,
    progress: Spring,
    /// The two faces' textures, for (face width, height, scale).
    faces: Option<((u32, u32, u32), [wgpu::TextureView; 2])>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    bind: Option<wgpu::BindGroup>,
}

/// Yoga's rounding of an edge to the device pixel grid (half up).
fn grid(v: f32, s: f32) -> f32 {
    (v * s + 0.5 + 1e-4).floor() / s
}
/// A Text node's position, floored.
fn floor(v: f32, s: f32) -> f32 {
    (v * s + 1e-4).floor() / s
}
/// A Text's measured side, ceiled after an epsilon.
fn side(v: f32, s: f32) -> f32 {
    ((v * s + 1e-4).floor() + 1.0) / s
}

/// A face's fonts.
struct Fonts {
    heavy32: Font,
    heavy22: Font,
    heavy24: Font,
    bold17: Font,
    bold15: Font,
    bold13: Font,
    check: Option<Font>,
}

impl Fonts {
    fn new() -> Option<Fonts> {
        let heavy = |s: f32| Font::new(HEAVY, s).map(Font::with_ui_layout);
        let bold = |s: f32| Font::new(BOLD, s).map(Font::with_ui_layout);
        Some(Fonts { heavy32: heavy(32.0)?, heavy22: heavy(22.0)?, heavy24: heavy(24.0)?, bold17: bold(17.0)?, bold15: bold(15.0)?, bold13: bold(13.0)?, check: skia::match_ui_font(11.2, 700.0) })
    }
}

/// One layer of a face: drawn as is, or (a Text's shadow) blurred by σ points first.
struct Layer {
    canvas: Canvas,
    sigma: Option<f32>,
}

/// A text run: its string, font, letterSpacing and colour at a Text box's top left.
struct Run<'a> {
    text: &'a str,
    font: &'a Font,
    spacing: f32,
    color: Color,
    x: f32,
    top: f32,
}

fn draw_run(c: &mut Canvas, r: &Run, dy: f32, color: Color) {
    c.draw_text_spaced(r.text, r.x, gfx::baseline(r.font, r.top + dy), r.font, &Paint::fill(color), r.spacing);
}

/// A Text's measured width (Core Text's line, NSKern after every glyph), ceiled.
fn text_w(font: &Font, text: &str, spacing: f32, s: f32) -> f32 {
    side(font.advance_width_spaced(text, spacing), s)
}

/// Where profile-avatar.tsx's pieces sit, relative to the avatar's (x, y).
struct AvatarLayout {
    r: (f32, f32),
    badge: [f32; 4],
    check: (f32, f32),
}

/// `abs` is the avatar's unrounded absolute origin in the face, `at` its rounded one.
fn avatar_layout(f: &Fonts, abs: (f32, f32), s: f32) -> AvatarLayout {
    // "R": centred in the gradient's content box (border 3: 74 × 74 at 3).
    let rw = text_w(&f.heavy32, "R", 0.0, s);
    let rh = side(gfx::line_height(&f.heavy32), s);
    let r = (floor(3.0 + (74.0 - rw) / 2.0, s), floor(3.0 + (74.0 - rh) / 2.0, s));
    // The badge: absolute, right −2, bottom −2, 25.6 square; its size from rounded edges.
    let b = AVATAR * 0.32;
    let rel = AVATAR + 2.0 - b;
    let (bx, by) = (grid(rel, s), grid(rel, s));
    let (ax, ay) = (abs.0 + rel, abs.1 + rel);
    let badge = [bx, by, grid(ax + b, s) - grid(ax, s), grid(ay + b, s) - grid(ay, s)];
    // "✓": centred in the badge's content box (border 3), unrounded sizes.
    let (cw, ch) = match &f.check {
        Some(font) => (text_w(font, "✓", 0.0, s), side(gfx::line_height(font), s)),
        None => (0.0, 0.0),
    };
    let check = (bx + floor(3.0 + (b - 6.0 - cw) / 2.0, s), by + floor(3.0 + (b - 6.0 - ch) / 2.0, s));
    AvatarLayout { r, badge, check }
}

/// The avatar's body (gradient circle and its ring) into `c` at (x, y).
fn avatar_body(c: &mut Canvas, x: f32, y: f32) {
    let g = Shader::Linear { start: point(x, y), end: point(x, y + AVATAR), stops: stops(&[Color::hex(0x4A5568), Color::hex(0x2D3748)]) };
    c.draw_rrect(x, y, AVATAR, AVATAR, AVATAR / 2.0, &Paint::shader(g));
    c.draw_path(&skia::border_ring_path(x, y, AVATAR, AVATAR, AVATAR / 2.0, 3.0), &Paint::fill(Color::WHITE.alpha(0.3)));
}

fn badge_body(c: &mut Canvas, x: f32, y: f32, l: &AvatarLayout) {
    let [bx, by, bw, bh] = l.badge;
    let (bx, by) = (x + bx, y + by);
    let g = Shader::Linear { start: point(bx, by), end: point(bx, by + bh), stops: stops(&[Color::hex(0xFF6B6B), Color::hex(0xFF5252)]) };
    let r = AVATAR * 0.16;
    c.draw_rrect(bx, by, bw, bh, r, &Paint::shader(g));
    c.draw_path(&skia::border_ring_path(bx, by, bw, bh, r, 3.0), &Paint::fill(Color::WHITE));
}

/// A canvas begun for a face texture (the face at (FACE_MARGIN, FACE_MARGIN)), clipped to the
/// face when `clip`.
fn face_canvas(s: f32, w: f32, h: f32, clip: bool) -> Canvas {
    let mut c = Canvas::default();
    c.begin(s);
    c.translate(FACE_MARGIN, FACE_MARGIN);
    if clip {
        c.clip_continuous_rrect(0.0, 0.0, w, h, RADIUS);
    }
    c
}

/// The face's box shadow, outside the face.
fn box_shadow(c: &mut Canvas, w: f32, h: f32) {
    c.save();
    c.clip_with(|b| {
        skia::add_rect(b, -FACE_MARGIN, -FACE_MARGIN, w + 2.0 * FACE_MARGIN, h + 2.0 * FACE_MARGIN);
        skia::add_rrect_hole(b, 0.0, 0.0, w, h, RADIUS);
    });
    c.draw_rrect_shadow(0.0, 4.0, w, h, RADIUS, 6.0, Color::BLACK.alpha(0.1));
    c.restore();
}

/// The text shadow layer for `runs` (σ = r / 2, colour, offset 0 1).
fn shadow_layer(s: f32, w: f32, h: f32, runs: &[(&Run, Color)], r: f32) -> Layer {
    let mut c = face_canvas(s, w, h, true);
    for (run, color) in runs {
        draw_run(&mut c, run, 1.0, *color);
    }
    Layer { canvas: c, sigma: Some(r / 2.0) }
}

/// The front face's layers. `w`, `h`: the face's drawn size; `hu`: its unrounded height.
fn front_layers(f: &Fonts, w: f32, h: f32, hu: f32, s: f32) -> Vec<Layer> {
    // paddingContainer: padding 24, a column.
    let name_h = side(gfx::line_height(&f.heavy32), s);
    let ver_h = side(gfx::line_height(&f.bold17), s);
    let name = Run { text: "Reactiive", font: &f.heavy32, spacing: -0.5, color: Color::WHITE, x: 24.0, top: 24.0 };
    let verified = Run { text: "Verified", font: &f.bold17, spacing: 0.2, color: Color::WHITE.alpha(0.95), x: 24.0, top: floor(24.0 + name_h + 4.0, s) };
    // The spacer and avatarSection share what is left (flex 1 each); the avatar at the
    // section's bottom right.
    let left = hu - 48.0 - name_h - 4.0 - ver_h;
    let section_top = 24.0 + name_h + 4.0 + ver_h + left / 2.0;
    let ay_rel = left / 2.0 - AVATAR;
    let (ax, ay) = (24.0 + (w - 48.0 - AVATAR), grid(section_top, s) + grid(ay_rel, s));
    let al = avatar_layout(f, (ax, section_top + ay_rel), s);
    let r = Run { text: "R", font: &f.heavy32, spacing: 0.0, color: Color::WHITE, x: ax + al.r.0, top: ay + al.r.1 };
    let check = f.check.as_ref().map(|font| Run { text: "✓", font, spacing: 0.0, color: Color::WHITE, x: ax + al.check.0, top: ay + al.check.1 });

    let mut l0 = face_canvas(s, w, h, false);
    box_shadow(&mut l0, w, h);
    l0.clip_continuous_rrect(0.0, 0.0, w, h, RADIUS);
    let g = Shader::Linear { start: point(0.0, 0.0), end: point(w, h), stops: stops(&[Color::hex(0xFF6B6B), Color::hex(0xFF8E53), Color::hex(0xFF6B6B)]) };
    l0.draw_rect(0.0, 0.0, w, h, &Paint::shader(g));
    draw_run(&mut l0, &name, 0.0, name.color);
    let mut layers = vec![Layer { canvas: l0, sigma: None }];
    layers.push(shadow_layer(s, w, h, &[(&verified, Color::BLACK.alpha(0.1))], 1.0));
    let mut l1 = face_canvas(s, w, h, true);
    draw_run(&mut l1, &verified, 0.0, verified.color);
    avatar_body(&mut l1, ax, ay);
    layers.push(Layer { canvas: l1, sigma: None });
    layers.push(shadow_layer(s, w, h, &[(&r, Color::BLACK.alpha(0.2))], 2.0));
    let mut l2 = face_canvas(s, w, h, true);
    draw_run(&mut l2, &r, 0.0, r.color);
    badge_body(&mut l2, ax, ay, &al);
    layers.push(Layer { canvas: l2, sigma: None });
    if let Some(check) = &check {
        layers.push(shadow_layer(s, w, h, &[(check, Color::BLACK.alpha(0.2))], 1.0));
        let mut l3 = face_canvas(s, w, h, true);
        draw_run(&mut l3, check, 0.0, check.color);
        layers.push(Layer { canvas: l3, sigma: None });
    }
    layers
}

/// The back face's layers.
fn back_layers(f: &Fonts, w: f32, h: f32, hu: f32, s: f32) -> Vec<Layer> {
    let ink = Color::view_hex(0x1A1D29);
    let grey = Color::view_hex(0x6B7280);
    // headerSection (80 tall: the avatar) and statsContainer (marginTop 8), centred in the
    // padding box (24).
    let name_h = side(gfx::line_height(&f.heavy22), s);
    let loc_h = side(gfx::line_height(&f.bold15), s);
    let num_h = side(gfx::line_height(&f.heavy24), s);
    let lab_h = side(gfx::line_height(&f.bold13), s);
    let stat_h = num_h + 4.0 + lab_h;
    let content = AVATAR + 8.0 + stat_h;
    let header_rel = (hu - 48.0 - content) / 2.0;
    let header_y = grid(24.0 + header_rel, s);
    let stats_y = grid(24.0 + header_rel + AVATAR + 8.0, s);
    let (ax, ay) = (24.0, header_y);
    let al = avatar_layout(f, (24.0, 24.0 + header_rel), s);
    // profileInfo: marginLeft 24, centred across the row.
    let info_h = name_h + 4.0 + loc_h;
    let info_y = header_y + grid((AVATAR - info_h) / 2.0, s);
    let info_x = 24.0 + AVATAR + 24.0;
    let name = Run { text: "Reactiive", font: &f.heavy22, spacing: -0.3, color: ink, x: info_x, top: info_y };
    let location = Run { text: "Italy", font: &f.bold15, spacing: 0.1, color: grey, x: info_x, top: info_y + floor(name_h + 4.0, s) };
    // The stats: space-around over the 308 wide row; each item centres its two Texts.
    let stats = [("3", "Trip"), ("1", "Review"), ("4", "Years")];
    let widths: Vec<(f32, f32)> = stats.iter().map(|(n, l)| (text_w(&f.heavy24, n, -0.5, s), text_w(&f.bold13, l, 0.2, s))).collect();
    let row_w = w - 48.0;
    let total: f32 = widths.iter().map(|(a, b)| a.max(*b)).sum();
    let gap = (row_w - total) / 3.0;
    let mut runs = Vec::new();
    let mut x = gap / 2.0;
    for (k, (n, l)) in stats.iter().enumerate() {
        let (nw, lw) = widths[k];
        let iw = nw.max(lw);
        let ix = 24.0 + grid(x, s);
        let iy = stats_y + grid((stat_h - stat_h) / 2.0, s);
        runs.push(Run { text: n, font: &f.heavy24, spacing: -0.5, color: ink, x: ix + floor((iw - nw) / 2.0, s), top: iy });
        runs.push(Run { text: l, font: &f.bold13, spacing: 0.2, color: grey, x: ix + floor((iw - lw) / 2.0, s), top: iy + floor(num_h + 4.0, s) });
        x += iw + gap;
    }
    let r = Run { text: "R", font: &f.heavy32, spacing: 0.0, color: Color::WHITE, x: ax + al.r.0, top: ay + al.r.1 };
    let check = f.check.as_ref().map(|font| Run { text: "✓", font, spacing: 0.0, color: Color::WHITE, x: ax + al.check.0, top: ay + al.check.1 });

    let mut l0 = face_canvas(s, w, h, false);
    box_shadow(&mut l0, w, h);
    l0.clip_continuous_rrect(0.0, 0.0, w, h, RADIUS);
    l0.draw_continuous_rrect(0.0, 0.0, w, h, RADIUS, &Paint::fill(Color::WHITE));
    draw_run(&mut l0, &name, 0.0, name.color);
    draw_run(&mut l0, &location, 0.0, location.color);
    for run in &runs {
        draw_run(&mut l0, run, 0.0, run.color);
    }
    avatar_body(&mut l0, ax, ay);
    let mut layers = vec![Layer { canvas: l0, sigma: None }];
    layers.push(shadow_layer(s, w, h, &[(&r, Color::BLACK.alpha(0.2))], 2.0));
    let mut l1 = face_canvas(s, w, h, true);
    draw_run(&mut l1, &r, 0.0, r.color);
    badge_body(&mut l1, ax, ay, &al);
    layers.push(Layer { canvas: l1, sigma: None });
    if let Some(check) = &check {
        layers.push(shadow_layer(s, w, h, &[(check, Color::BLACK.alpha(0.2))], 1.0));
        let mut l2 = face_canvas(s, w, h, true);
        draw_run(&mut l2, check, 0.0, check.color);
        layers.push(Layer { canvas: l2, sigma: None });
    }
    layers
}

/// Draws `layers` in order into a new face texture of `px` pixels (shadows blurred by Graphite).
fn build_face(device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, layers: &[Layer], px: (u32, u32), s: f32) -> wgpu::TextureView {
    let target = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, px.0, px.1);
    let accs = [target("airbnb face a"), target("airbnb face b")];
    let shader = device.create_shader_module(layer_shader::module());
    let layout = device.create_bind_group_layout(&layer_shader::GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, layer_shader::entry::OVER, GRAPHITE_FORMAT, None);
    let sampler = skia::render::linear_sampler(device);
    // Start from transparent.
    {
        let _clear = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("airbnb face clear"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &accs[0], resolve_target: None, depth_slice: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
    }
    let mut cur = 0;
    for layer in layers {
        let tmp = target("airbnb face layer");
        let mut renderer = Renderer::default();
        renderer.draw(device, queue, encoder, &layer.canvas, &tmp, GRAPHITE_FORMAT, px.0, px.1, wgpu::Color::TRANSPARENT);
        let mut u = layer_shader::Uniforms { mode: [0.0; 4], low: [0.0; 4], out: [0.0; 4] };
        let mut blur = GraphiteBlur::default();
        let mut top = tmp.clone();
        if let Some(sigma) = layer.sigma {
            let full = [0, 0, px.0 as i32, px.1 as i32];
            if let Some(plan) = GraphitePlan::new(full, full, sigma * s) {
                let out = blur.run(device, queue, encoder, Placed { view: &tmp, origin: [0, 0], size: [px.0, px.1] }, &plan);
                u.mode = [1.0, 0.0, 0.0, 0.0];
                u.low = low_mapping(&plan, out.origin, out.size);
                u.out = plan.output.map(|v| v as f32);
                top = out.view.clone();
            }
        }
        let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("airbnb face"), size: layer_shader::Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        queue.write_buffer(&buffer, 0, &u.bytes());
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("airbnb face"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: layer_shader::U.binding, resource: buffer.as_entire_binding() },
                wgpu::BindGroupEntry { binding: layer_shader::ACC.binding, resource: wgpu::BindingResource::TextureView(&accs[cur]) },
                wgpu::BindGroupEntry { binding: layer_shader::TOP.binding, resource: wgpu::BindingResource::TextureView(&top) },
                wgpu::BindGroupEntry { binding: layer_shader::SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        });
        skia::render::fullscreen_pass(encoder, "airbnb face over", &accs[1 - cur], &pipeline, &bind);
        cur = 1 - cur;
    }
    accs[cur].clone()
}

fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

/// The face's plane (points, its box's origin) → the canvas's face-box frame, for rotateY
/// `deg` and `scale`, about the centre; and whether it faces the viewer.
pub fn face_matrix(w: f32, h: f32, deg: f64, scale: f64) -> (skia::Matrix3, bool) {
    let rad = (deg as f32).to_radians();
    let m = Matrix4::perspective(PERSPECTIVE).multiply(Matrix4::rotate_y(rad)).multiply(Matrix4::scale(scale as f32, scale as f32, 1.0)).pivot(w / 2.0, h / 2.0);
    (m.to_matrix3(), rad.cos() > 1e-6)
}

impl Card {
    fn step(&mut self, now_ms: f64) -> bool {
        self.progress.step(now_ms)
    }

    fn scale(p: f64) -> f64 {
        interpolate(p, &[0.0, 0.5, 1.0], &[1.0, 0.95, 1.0], Extrapolation::Extend)
    }
}

impl Surface for Card {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let flipped = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        if self.flipped == Some(flipped) {
            return Ok(());
        }
        let to = if flipped { 1.0 } else { 0.0 };
        if self.flipped.is_none() {
            self.progress.set(to);
        } else {
            // onStart: the running animation's velocity + config.velocity (config.velocity
            // alone from rest); `Spring::to` drops it when it points away from the target.
            let v = if self.progress.running { self.progress.velocity } else { 0.0 } + SPRING_VELOCITY;
            self.progress.to(to, v, SPRING);
        }
        self.flipped = Some(flipped);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"flipped\":{},\"progress\":{:.4},\"velocity\":{:.4}}}", self.flipped.unwrap_or(false), self.progress.value, self.progress.velocity))
    }

    fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
        if self.flipped.is_none() {
            self.bind(&[], None).ok();
        }
        let s = frame.scale;
        let moving = self.step(frame.now_ms);
        // The card box: the canvas less its margin; the face's drawn height from its rounded
        // edges (the box's top is on the grid), its layout height unrounded (cardWidth / 1.6).
        let w = frame.width - 2.0 * MARGIN;
        let hu = w / 1.6;
        let h = grid(hu, s);
        let tex = (((w + 2.0 * FACE_MARGIN) * s).round() as u32, ((h + 2.0 * FACE_MARGIN) * s).round() as u32);
        let key = (tex.0, tex.1, (s * 100.0) as u32);
        if self.faces.as_ref().map(|f| f.0) != Some(key) {
            let Some(fonts) = Fonts::new() else { return false };
            let front = build_face(device, queue, encoder, &front_layers(&fonts, w, h, hu, s), tex, s);
            let back = build_face(device, queue, encoder, &back_layers(&fonts, w, h, hu, s), tex, s);
            self.faces = Some((key, [front, back]));
            if let Some(g) = self.gpu.as_mut() {
                g.bind = None;
            }
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            let shader = device.create_shader_module(card_module());
            let layout = device.create_bind_group_layout(&CARD_GROUP);
            self.gpu = Some(Gpu {
                format,
                generation: frame.shader_generation,
                compose: skia::render::fullscreen_pipeline(device, &shader, &layout, card_entry::COMPOSE, format, None),
                layout,
                sampler: skia::render::linear_sampler(device),
                uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("airbnb card"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
                bind: None,
            });
        }
        let p = self.progress.value;
        let scale = Card::scale(p);
        let rows = |deg: f64| -> [[f32; 4]; 3] {
            let (m, shown) = face_matrix(w, h, deg, scale);
            match (shown, m.invert()) {
                (true, Some(inv)) => {
                    let mut r = inv.rows();
                    r[0][3] = 1.0;
                    r
                }
                _ => [[0.0; 4]; 3],
            }
        };
        let f = rows(180.0 * p);
        let b = rows(180.0 + 180.0 * p);
        let u = Uniforms {
            canvas: [frame.pixels().0 as f32, frame.pixels().1 as f32, s, gfx::srgb_flag(format)],
            face: [MARGIN, MARGIN, FACE_MARGIN, FACE_MARGIN],
            front0: f[0],
            front1: f[1],
            front2: f[2],
            back0: b[0],
            back1: b[1],
            back2: b[2],
            tex: [tex.0 as f32, tex.1 as f32, 0.0, 0.0],
        };
        let gpu = self.gpu.as_mut().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.is_none() {
            let faces = &self.faces.as_ref().unwrap().1;
            gpu.bind = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("airbnb card"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: CARD_U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: FRONT_TEX.binding, resource: wgpu::BindingResource::TextureView(&faces[0]) },
                    wgpu::BindGroupEntry { binding: BACK_TEX.binding, resource: wgpu::BindingResource::TextureView(&faces[1]) },
                    wgpu::BindGroupEntry { binding: CARD_SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            }));
        }
        skia::render::fullscreen_pass(encoder, "airbnb card", target, &gpu.compose, gpu.bind.as_ref().unwrap());
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn a_flip_back_from_rest_drops_the_config_velocity() {
        let mut c = Card { flipped: None, progress: Spring::default(), faces: None, gpu: None };
        c.bind(&[Value::Bool(false)], None).unwrap();
        c.bind(&[Value::Bool(true)], None).unwrap();
        c.step(0.0);
        assert!((c.progress.velocity - 0.2).abs() < 1e-9, "{}", c.progress.velocity);
        let mut ms = 0.0;
        while c.step(ms) {
            ms += 1000.0 / 60.0;
        }
        c.bind(&[Value::Bool(false)], None).unwrap();
        c.step(ms);
        // From rest at 1 toward 0, +0.2 points away: dropped.
        assert_eq!(c.progress.velocity, 0.0);
    }

    #[test]
    fn the_faces_turn_about_their_centre() {
        let (m, shown) = face_matrix(356.0, 222.5, 0.0, 1.0);
        assert!(shown);
        let p = m.map(10.0, 20.0);
        assert!((p.x - 10.0).abs() < 1e-4 && (p.y - 20.0).abs() < 1e-4);
        assert!(!face_matrix(356.0, 222.5, 180.0, 1.0).1);
        assert!(face_matrix(356.0, 222.5, 360.0, 1.0).1);
        // At 60°, the left edge (x 0) comes toward the viewer: taller than the right.
        let (m, _) = face_matrix(356.0, 222.5, 60.0, 1.0);
        let (l, r) = (m.map(0.0, 0.0), m.map(356.0, 0.0));
        assert!(l.y < r.y, "{l:?} {r:?}");
    }

    #[test]
    fn the_card_draws_both_faces() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        dir.push("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let w = 356.0 + 2.0 * MARGIN;
        let frame = |ms: f64| Frame { width: w, height: 222.5 + 2.0 * MARGIN, scale: 3.0, now_ms: ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Bool(false)], None).unwrap();
        let (front, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(!moving);
        gfx::save_over(&front, "airbnb-card-front", [255, 255, 255]);
        // Coral at the face's centre.
        let c = front.at((w * 1.5) as u32, ((MARGIN + 60.0) * 3.0) as u32);
        assert!(c[0] > 240 && c[1] > 90 && c[1] < 160, "{c:?}");
        s.bind(&[Value::Bool(true)], None).unwrap();
        let mut ms = 0.0;
        let mut moving = true;
        let mut mid = None;
        while moving && ms < 4000.0 {
            ms += 1000.0 / 60.0;
            let (img, m) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if mid.is_none() && ms >= 250.0 {
                mid = Some(img);
            }
            moving = m;
        }
        gfx::save_over(&mid.unwrap(), "airbnb-card-mid", [255, 255, 255]);
        let (back, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        gfx::save_over(&back, "airbnb-card-back", [255, 255, 255]);
        let c = back.at((MARGIN as u32 + 300) * 3, ((MARGIN + 30.0) * 3.0) as u32);
        assert!(c[0] > 245 && c[1] > 245 && c[2] > 245, "{c:?}");
    }
}
