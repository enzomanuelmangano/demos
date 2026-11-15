//! A photo warped by a butterfly-wave transition, as a ruler of white ticks is dragged under a
//! blue-to-orange indicator. A ring shows the progress.
//!
//! - Drag the ruler: it follows the finger 1:1 and rubber-bands past its ends. On release it
//!   decelerates like a native scroll view, springs back from an end, and otherwise snaps to the
//!   tick at or past the fling's direction.
//! - Haptics: a selection per tick index reached, at most one per HAPTIC_GAP_MS.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, interpolate_color, Extrapolation};
use skia::blur::GRAPHITE_FORMAT;
use skia::{point, stops, Canvas, Cap, Color, Join, Paint, Renderer, Shader};

use crate::ui_scroll::{Snap, UiScroll, NORMAL};
use crate::{gfx, shaders};
use shaders::prequel_slider::{entry, module, Uniforms, GROUP_0, MASK, PHOTO, SMP, U, UI};

/// The ruler's tick indices, 0 through LINES.
const LINES: usize = 50;
/// Distance between ticks, in points.
const SPACE: f64 = 10.0;
/// Tall and short tick heights, in points.
const MAX_LINE: f32 = 12.0;
const MIN_LINE: f32 = 5.0;
/// Height of the slider's area, in points.
const AREA_H: f32 = MAX_LINE * 5.0;
/// The shortest gap between two tick haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// Tick width, in points.
const LINE_W: f32 = 1.5;
/// Tick corner radius: half the width.
const LINE_R: f32 = LINE_W / 2.0;
/// The indicator is 1.4 × this wide, in points.
const INDICATOR_LINE_W: f32 = 2.0;
/// Every this many ticks is a tall one.
const BIG_EACH: usize = 10;
/// Progress ring: diameter and stroke, in points.
const DONUT: f32 = 35.0;
const DONUT_STROKE: f32 = 4.0;
/// Height of the row above the editor, in points.
const BUTTON_ROW: f32 = 56.0;
/// The photo: a baseline JPEG in images/.
static PHOTO_JPEG: &[u8] = include_bytes!("../images/prequel-slider-unsplash-3540.jpg");

/// The demo's surface. Inputs: the safe area's top and bottom.
pub fn surface() -> Box<dyn Surface> {
    Box::new(PrequelSlider::new())
}

impl PrequelSlider {
    fn new() -> PrequelSlider {
        PrequelSlider {
        insets: (0.0, 0.0),
        size: (0.0, 0.0),
        scale: 1.0,
        // The ruler starts centred: offset W / 2 at rest.
        scroll: UiScroll::new(0.0, (LINES as f64 * SPACE).round(), 0.0, NORMAL, Snap::Interval(SPACE)),
        last_offset: f64::NAN,
        progress: 0.0,
        line_index: -1,
        now_ms: 0.0,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
        gradient: None,
        ui: Canvas::default(),
        mask: Canvas::default(),
        renderers: [Renderer::default(), Renderer::default()],
        gpu: None,
        }
    }
}

#[cfg(test)]
impl PrequelSlider {
    fn new_for_test() -> PrequelSlider {
        let mut s = PrequelSlider::new();
        s.size = (420.0, 912.0);
        s.scale = 3.0;
        s.scroll.port = 420.0;
        s
    }
}

/// Rounds a layout edge to the device pixel grid, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    let s = (v * scale) as f64;
    let f = s - s.floor();
    let r = if f > 0.5 || (f - 0.5).abs() < 1e-4 || (f - 1.0).abs() < 1e-4 { s.floor() + 1.0 } else { s.floor() };
    (r / scale as f64) as f32
}

/// A view's frame on the pixel grid: (left, top, right, bottom) in points.
fn frame_of(x: f32, y: f32, w: f32, h: f32, scale: f32) -> [f32; 4] {
    [grid(x, scale), grid(y, scale), grid(x + w, scale), grid(y + h, scale)]
}

struct PrequelSlider {
    /// Safe-area top and bottom, in points.
    insets: (f32, f32),
    /// The window, in points, and its pixels per point.
    size: (f32, f32),
    scale: f32,
    /// The ruler as a UIScrollView: scrollOffset = W / 2 − its contentOffset.
    scroll: UiScroll,
    /// scrollOffset as the reaction last saw it.
    last_offset: f64,
    /// The ruler's progress, 0 to 1.
    progress: f64,
    /// The last tick index reached, −1 before any.
    line_index: i64,
    /// The latest time seen (a frame's or a pointer's), and when the last tick haptic played.
    now_ms: f64,
    haptic_at: f64,
    posted: Vec<String>,
    gradient: Option<Paint>,
    ui: Canvas,
    /// The editor's clip, drawn once per size.
    mask: Canvas,
    renderers: [Renderer; 2],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    /// Layers: the UI, and the editor's mask.
    layers: [wgpu::TextureView; 2],
    bind: wgpu::BindGroup,
    /// The mask was drawn for this layout.
    masked: bool,
}

/// Where everything is, in points, on the pixel grid.
struct Layout {
    /// The editor canvas's frame, and its width and height props.
    editor: [f32; 4],
    editor_props: (f32, f32),
    /// The donut canvas's frame.
    donut: [f32; 4],
    /// The slider's area (its gesture view) and the lines' canvas frame.
    area: [f32; 4],
    lines: [f32; 4],
    /// The indicator View's frame.
    indicator: [f32; 4],
}

impl PrequelSlider {
    fn layout(&self, scale: f32) -> Layout {
        let (w, h) = self.size;
        let (safe_top, safe_bottom) = self.insets;
        let editor_top = safe_top + BUTTON_ROW;
        let (ew, eh) = (w * 0.95, h * 0.9 - safe_bottom * 3.0 - editor_top);
        let bottom_top = h - (safe_bottom + 40.0) - 100.0;
        let slider_top = bottom_top + DONUT;
        let (iw, ih) = (INDICATOR_LINE_W * 1.4, MAX_LINE * 1.5);
        Layout {
            editor: frame_of((w - ew) / 2.0, editor_top, ew, eh, scale),
            editor_props: (ew, eh),
            donut: frame_of((w - DONUT) / 2.0, bottom_top, DONUT, DONUT, scale),
            area: frame_of(0.0, slider_top, w, AREA_H, scale),
            lines: frame_of(0.0, slider_top + AREA_H / 2.0 - MAX_LINE / 2.0, w, MAX_LINE, scale),
            indicator: frame_of(w / 2.0, slider_top + AREA_H / 2.0 - ih / 2.0, iw, ih, scale),
        }
    }

    /// scrollOffset: the ticks' x, W / 2 at the ruler's start.
    fn offset(&self) -> f64 {
        self.size.0 as f64 / 2.0 - self.scroll.offset
    }

    /// Updates the progress and the tick index from the offset. The first value is not a change.
    fn react(&mut self) {
        let offset = self.offset();
        if offset == self.last_offset {
            return;
        }
        let first = self.last_offset.is_nan();
        self.last_offset = offset;
        if first {
            return;
        }
        let w = self.size.0 as f64;
        let progress = interpolate(offset, &[w / 2.0, -(LINES as f64 * SPACE).round() + w / 2.0], &[0.0, 1.0], Extrapolation::Extend);
        // The progress stops at the ends, so the tick index and its haptic do too.
        let progress = progress.clamp(0.0, 1.0);
        let index = ((progress * LINES as f64).floor() as i64).min(LINES as i64);
        if index != self.line_index && index >= 0 {
            // At most one haptic per HAPTIC_GAP_MS: a fling can cross a tick every frame, and each
            // haptic is a main-thread call.
            if self.now_ms - self.haptic_at >= HAPTIC_GAP_MS {
                self.posted.push("haptic:selection".into());
                self.haptic_at = self.now_ms;
            }
            self.line_index = index;
        }
        self.progress = progress;
    }

    /// The indicator's colour: blue at 0, orange at 1.
    fn color(&self) -> [u8; 3] {
        let c = interpolate_color(self.progress, &[0.0, 1.0], &[[109.0, 155.0, 241.0, 1.0], [255.0, 165.0, 0.0, 1.0]]);
        [c[0] as u8, c[1] as u8, c[2] as u8]
    }

    fn record(&mut self, scale: f32, at: &Layout) {
        let w = self.size.0;
        let rgb = self.color();
        let x0 = self.offset() as f32;
        let c = &mut self.ui;
        c.begin(scale);
        // The donut: rotated −90° about its centre, so its circle starts at the top.
        let (dx, dy) = (at.donut[0] + DONUT / 2.0, at.donut[1] + DONUT / 2.0);
        let r = DONUT / 2.0 - DONUT_STROKE / 2.0;
        // The track: white at 0.25.
        let ring = Paint::stroke(Color([1.0, 1.0, 1.0, 0.25]), DONUT_STROKE).caps(Cap::Round, Join::Miter);
        c.draw_with(&ring, |b| skia::add_circle(b, dx, dy, r));
        let end = self.progress.clamp(0.0, 1.0) as f32;
        if end > 0.0 {
            let arc = Paint::stroke(Color::rgb8(rgb[0], rgb[1], rgb[2]), DONUT_STROKE).caps(Cap::Round, Join::Miter);
            // The arc starts at 12 o'clock and runs clockwise.
            c.draw_with(&arc, |b| skia::add_arc(b, dx - r, dy - r, 2.0 * r, 2.0 * r, -90.0, 360.0 * end));
        }
        // The slider's lines, in the lines canvas (clipped to it).
        let top = at.lines[1];
        c.save();
        c.clip_rrect(0.0, top, w, at.lines[3] - top, 0.0);
        let small = Paint::fill(Color::WHITE).with_opacity(0.5);
        let big = Paint::fill(Color::WHITE);
        for pass in [false, true] {
            for i in 0..=LINES {
                if (i % BIG_EACH == 0) != pass {
                    continue;
                }
                // Only the ticks on screen are drawn.
                let offset = (i as f64 * SPACE) as f32;
                let base = -x0 + w / 2.0;
                if base < offset - w / 2.0 || base > offset + w / 2.0 {
                    continue;
                }
                let x = offset + x0;
                let h = if pass { MAX_LINE } else { MIN_LINE };
                c.draw_rrect(x, top + (MAX_LINE - h) / 2.0, LINE_W, h, LINE_R, if pass { &big } else { &small });
            }
        }
        if let Some(g) = self.gradient.as_ref() {
            c.draw_rect(0.0, top, w, MAX_LINE, g);
        }
        c.restore();
        // The indicator's colour is in Display P3, as a view's is.
        let ind = at.indicator;
        let hex = (rgb[0] as u32) << 16 | (rgb[1] as u32) << 8 | rgb[2] as u32;
        c.draw_continuous_rrect(ind[0], ind[1], ind[2] - ind[0], ind[3] - ind[1], 10.0, &Paint::fill(Color::view_hex(hex)));
    }
}

impl Surface for PrequelSlider {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        let insets = (n(0), n(1));
        if insets != self.insets {
            self.insets = insets;
            if let Some(gpu) = self.gpu.as_mut() {
                gpu.masked = false;
            }
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.4},\"offset\":{:.2},\"lineIndex\":{}}}", self.progress, self.offset(), self.line_index))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        // The touch area is the slider's area.
        let area = self.layout(self.scale).area;
        let inside = x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3];
        self.now_ms = self.now_ms.max(at_ms);
        self.scroll.input(id, gfx::phase(phase), x, y, at_ms, inside);
        self.react();
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
        if self.size != (frame.width, frame.height) {
            self.size = (frame.width, frame.height);
            let w = frame.width;
            // The rubber band is the window's width.
            self.scroll.port = w as f64;
            let black = Color::BLACK;
            let clear = Color::TRANSPARENT;
            self.gradient = Some(Paint::shader(Shader::Linear { start: point(0.0, 0.0), end: point(w, 0.0), stops: stops(&[black, clear, clear, clear, black]) }));
            if let Some(gpu) = self.gpu.as_mut() {
                gpu.masked = false;
            }
        }
        self.now_ms = self.now_ms.max(frame.now_ms);
        let moving = self.scroll.step(frame.now_ms);
        self.react();
        let scale = frame.scale;
        self.scale = scale;
        let at = self.layout(scale);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation, (pw, ph)));
        }
        self.record(scale, &at);
        let gpu = self.gpu.as_mut().unwrap();
        self.renderers[0].draw(device, queue, encoder, &self.ui, &gpu.layers[0], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        if !gpu.masked {
            let e = at.editor;
            self.mask.begin(scale);
            self.mask.draw_continuous_rrect(e[0], e[1], e[2] - e[0], e[3] - e[1], 10.0, &Paint::fill(Color::WHITE));
            self.renderers[1].draw(device, queue, encoder, &self.mask, &gpu.layers[1], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
            gpu.masked = true;
        }
        // Cover-fit the photo to the editor.
        let (iw, ih) = (3540.0f64, 2360.0f64);
        let (ew, eh) = (at.editor_props.0 as f64, at.editor_props.1 as f64);
        let (src_w, src_h) = if ew / eh > iw / ih { (iw, iw * eh / ew) } else { (ih * ew / eh, ih) };
        let (src_x, src_y) = ((iw - src_w) / 2.0, (ih - src_h) / 2.0);
        let s = ew / src_w;
        let u = Uniforms {
            editor: [at.editor[0] * scale, at.editor[1] * scale, scale, self.progress as f32],
            res: [ew as f32, eh as f32, gfx::srgb_flag(format), 0.0],
            image: [iw as f32, ih as f32, s as f32, 0.0],
            cover: [(-src_x * s) as f32, (-src_y * (eh / src_h)) as f32, 0.0, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "prequel slider", target, &gpu.pipeline, &gpu.bind);
        moving || self.scroll.moving()
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let layers = [skia::render::sampled_target(device, "prequel ui", GRAPHITE_FORMAT, pixels.0, pixels.1), skia::render::sampled_target(device, "prequel mask", GRAPHITE_FORMAT, pixels.0, pixels.1)];
    let photo = photo(device, queue);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("prequel slider"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = skia::render::linear_sampler(device);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("prequel slider"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: PHOTO.binding, resource: wgpu::BindingResource::TextureView(&photo) },
            wgpu::BindGroupEntry { binding: UI.binding, resource: wgpu::BindingResource::TextureView(&layers[0]) },
            wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(&layers[1]) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, pixels, pipeline, uniforms, layers, bind, masked: false }
}

/// The photo as one mip level: the shader samples it without mipmaps.
fn photo(device: &wgpu::Device, queue: &wgpu::Queue) -> wgpu::TextureView {
    let image = skia::Image::from_jpeg(PHOTO_JPEG).unwrap_or_else(|| skia::Image::from_rgba(1, 1, vec![0, 0, 0, 255]));
    let size = wgpu::Extent3d { width: image.width, height: image.height, depth_or_array_layers: 1 };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("prequel photo"),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &image.pixels,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(image.width * 4), rows_per_image: Some(image.height) },
        size,
    );
    texture.create_view(&Default::default())
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn layout_is_on_yogas_pixel_grid() {
        assert_eq!(grid(10.5, 3.0), 32.0 / 3.0);
        assert_eq!(grid(409.5, 3.0), 1229.0 / 3.0);
        assert_eq!(grid(718.8, 3.0), 2156.0 / 3.0);
    }

    #[test]
    fn dragging_warps_the_photo_and_fills_the_ring() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(68.0), Value::Number(34.0)], None).unwrap();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "prequel-slider-rest", [0, 0, 0]);
        assert!(!moving);
        // The editor (x 32…1229 px, y 372…2156 px) is the opaque photo.
        assert_eq!(rest.at(600, 1200)[3], 255);
        assert_eq!(rest.at(20, 1200)[3], 0, "left of the editor");
        assert_eq!(rest.at(34, 374)[3], 0, "the continuous corner");
        // The indicator, blue.
        let ind = rest.at(634, 2409);
        assert!(ind[2] > 220 && ind[0] < 120, "indicator {ind:?}");
        // The ring's track, at its top.
        let ring = rest.at(631, 2214 + 6);
        assert!(ring[3] > 40 && ring[3] < 90, "ring {ring:?}");
        let before = rest.at(600, 1200);
        let finger = |s: &mut Box<dyn Surface>, phase, x, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y: 2409.0 / 3.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // The drag follows 1:1 from the second move past the 10 pt slop, with no jump.
        finger(&mut s, PointerPhase::Down, 350.0, 0.0);
        for i in 1..=23 {
            finger(&mut s, PointerPhase::Move, 350.0 - 11.5 * i as f32, 40.0 * i as f64);
        }
        // One haptic per tick index reached, at most one per HAPTIC_GAP_MS.
        let posted = s.messages();
        assert!(posted.iter().filter(|m| *m == "haptic:selection").count() > 15, "{posted:?}");
        assert!(s.agent("").unwrap().starts_with("{\"progress\":0.4830,\"offset\":-31.50,\"lineIndex\":24}"), "{}", s.agent("").unwrap());
        // Below ~335 pt/s no release velocity is reported, so the snap goes to the nearest tick.
        finger(&mut s, PointerPhase::Move, 86.5, 960.0);
        finger(&mut s, PointerPhase::Move, 87.5, 1000.0);
        finger(&mut s, PointerPhase::Up, 87.5, 2000.0);
        let mut ms = 2000.0;
        let mut img = rest;
        let mut moving = true;
        while moving && ms < 6000.0 {
            ms += 16.0;
            (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        gfx::save_over(&img, "prequel-slider-half", [0, 0, 0]);
        assert!(s.agent("").unwrap().starts_with("{\"progress\":0.4800,\"offset\":-30.00"), "{}", s.agent("").unwrap());
        assert_ne!(img.at(600, 1200), before, "the photo is warped");
        // Half way: the ring's arc reaches the bottom.
        let ring = img.at(631, 2313);
        assert!(ring[3] > 200, "ring's arc at 6 o'clock {ring:?}");
    }

    #[test]
    fn the_ruler_scrolls_like_a_scroll_view() {
        let mut s = PrequelSlider::new_for_test();
        let y = s.layout(3.0).area[1] + 30.0;
        let mut at = 0.0;
        let mut finger = |s: &mut PrequelSlider, phase, x: f32, at_ms: f64| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // A fling left (1.2 pt/ms): it glides on after the lift and rests on a 10 pt tick.
        finger(&mut s, PointerPhase::Down, 300.0, at);
        for i in 1..=6 {
            at += 16.0;
            finger(&mut s, PointerPhase::Move, 300.0 - 19.2 * i as f32, at);
        }
        let lifted = s.scroll.offset;
        finger(&mut s, PointerPhase::Up, 300.0 - 19.2 * 6.0, at + 1.0);
        let mut t = at;
        loop {
            // A frame at 120 Hz, as render steps it.
            s.now_ms = s.now_ms.max(t);
            let more = s.scroll.step(t);
            s.react();
            if !more {
                break;
            }
            t += 8.33;
        }
        assert!(s.scroll.offset > lifted + 50.0, "{} after {lifted}", s.scroll.offset);
        assert_eq!(s.scroll.offset % SPACE, 0.0);
        // Haptics stay paced: at most one per HAPTIC_GAP_MS.
        let haptics = s.posted.iter().filter(|m| *m == "haptic:selection").count();
        let lines = (s.scroll.offset / SPACE) as usize;
        assert!(haptics as f64 <= (t - 0.0) / HAPTIC_GAP_MS + 1.0 && haptics < lines, "{haptics} haptics for {lines} lines in {t} ms");
        // Dragged right past the start: banded (less than the finger), then back to 0.
        let mut s = PrequelSlider::new_for_test();
        at = t + 100.0;
        let start = s.scroll.offset;
        finger(&mut s, PointerPhase::Down, 50.0, at);
        for i in 1..=30 {
            at += 16.0;
            finger(&mut s, PointerPhase::Move, 50.0 + 12.0 * i as f32, at);
        }
        let over = -s.scroll.offset;
        assert!(over > 0.0 && over < 350.0 - start, "overshoot {over}");
        at += 500.0;
        finger(&mut s, PointerPhase::Up, 410.0, at);
        let mut t = at;
        while s.scroll.step(t) {
            t += 16.0;
        }
        assert!(s.scroll.offset.abs() < 0.01, "{}", s.scroll.offset);
        assert_eq!(s.progress, 0.0);
    }
}
