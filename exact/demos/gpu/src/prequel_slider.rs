//! Prequel Slider (src/animations/prequel-slider/src: index.tsx, gl-transition,
//! components/image-editor, components/donut-circular-progress, components/draggable-slider): a
//! photo warped by a butterfly-wave transition as a ruler of white ticks is dragged under a
//! blue-to-orange indicator, with a ring showing the progress.
//!
//! One canvas over the whole screen (black, the container's), laid out as RN lays the views out
//! (Yoga's pixel grid: each edge rounded to the nearest device pixel, a half up):
//! - The ImageEditor: a canvas of width W × 0.95, height H × 0.9 − safeBottom × 3 − editorTop,
//!   editorTop = safeTop + DEMO_BUTTON_ROW_HEIGHT (56), centred, clipped to its continuous r 10
//!   corners (borderRadius 10, borderCurve continuous, overflow hidden). Its Fill is the
//!   transition shader (shaders/prequel_slider.wgsl) with uniforms progress and resolution =
//!   the width and height props, both children the photo (Unsplash's photo-1596501048547,
//!   3540 × 2360 as DemoImageUrl's `w=3540` serves it: images/, losslessly baseline).
//! - The bottom column: absolute, bottom safeBottom + 40, height 100, items centred: the
//!   DonutCircularProgress (35², stroke 4: a circle of r 35 / 2 − 2 rotated −90°, the whole of it
//!   in rgba(255, 255, 255, 0.25), then 0…progress of it in `color`, both round-capped), then
//!   the DraggableSlider (W × scrollableAreaHeight 60).
//! - The slider's canvas: W × maxLineHeight 12 at paddingTop 60 / 2 − 12 / 2 = 24. Lines i =
//!   0…50 at x = i · 10 + scrollOffset (drawn when on screen), 1.5 wide (getLinesPath's default:
//!   the lineWidth prop is not passed to it), 12 tall for i % 10 == 0 (white) else 5 (white at
//!   0.5), centred vertically, rrect r 10 that SkRRect scales to 0.75. Over them the
//!   BoundaryGradient: #000 → transparent ×3 → #000 across the width.
//! - The indicator View: lineWidth 2 × 1.4 by maxLineHeight × 1.5 = 18, at left W / 2, top
//!   60 / 2 − 9, radius 10 continuous, backgroundColor `color` (a View: Display P3).
//!
//! Motion audit:
//!
//! | value | driver | config | trigger / cancel |
//! |---|---|---|---|
//! | scrollOffset | Pan onUpdate: clamp(context + translationX, −500 + W / 2, W / 2) | — | onBegin: context = scrollOffset, cancelAnimation |
//! | scrollOffset | Pan onEnd: withSpring(snapPoint(offset, velocityX, W / 2 − 10 i, i 0…50)) | mass 0.45, damping 10, stiffness 100 (ζ 0.75) | the next onBegin |
//! | progress | useAnimatedReaction on scrollOffset (not on its first run) | interpolate(offset, [W / 2, W / 2 − 500], [0, 1]), extended | — |
//! | color | interpolateColor(progress, [0, 1], [#6d9bf1, orange]) (gamma 2.2, clamped) | — | — |
//!
//! Haptics: Haptics.selectionAsync when floor(progress · 50) changes to an index ≥ 0
//! (previousLineIndex starts at −1, so the first move plays one).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate, interpolate_color, Extrapolation, Spring, SpringConfig};
use skia::blur::GRAPHITE_FORMAT;
use skia::{point, stops, Canvas, Cap, Color, Join, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::prequel_slider::{entry, module, Uniforms, GROUP_0, MASK, PHOTO, SMP, U, UI};

/// Lines.
const LINES: usize = 50;
/// SpacePerLine.
const SPACE: f64 = 10.0;
/// MaxLineHeight, MinLineHeight.
const MAX_LINE: f32 = 12.0;
const MIN_LINE: f32 = 5.0;
/// ScrollableAreHeight = MaxLineHeight × 5.
const AREA_H: f32 = MAX_LINE * 5.0;
/// getLinesPath's lineWidth default.
const LINE_W: f32 = 1.5;
/// SkRRect's radius for rrect(1.5 × h, 10, 10): scaled to fit the width.
const LINE_R: f32 = LINE_W / 2.0;
/// The LineWidth prop (the indicator's width is 1.4 × it).
const INDICATOR_LINE_W: f32 = 2.0;
/// bigLineIndexOffset.
const BIG_EACH: usize = 10;
/// The snap spring.
const SNAP: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 0.45 };
/// DonutCircularProgress: size, strokeWidth.
const DONUT: f32 = 35.0;
const DONUT_STROKE: f32 = 4.0;
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f32 = 56.0;
/// The photo (images/: the JPEG Unsplash serves for DemoImageUrl, transcoded to baseline,
/// pixel-identical).
static PHOTO_JPEG: &[u8] = include_bytes!("../images/prequel-slider-unsplash-3540.jpg");

/// The demo's surface. Inputs: the safe area's top and bottom (useSafeAreaInsets).
pub fn surface() -> Box<dyn Surface> {
    Box::new(PrequelSlider {
        insets: (0.0, 0.0),
        size: (0.0, 0.0),
        scale: 1.0,
        scroll: Spring::at(0.0),
        last_offset: f64::NAN,
        context: 0.0,
        pan: PanGesture::new(),
        progress: 0.0,
        line_index: -1,
        posted: Vec::new(),
        gradient: None,
        ui: Canvas::default(),
        mask: Canvas::default(),
        renderers: [Renderer::default(), Renderer::default()],
        gpu: None,
    })
}

/// Yoga's rounding of a layout edge to the pixel grid (roundValueToPixelGrid): to the nearest
/// device pixel, a half up.
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

/// snapPoint (redash): the point nearest value + 0.2 · velocity, the first of equals.
fn snap_point(value: f64, velocity: f64, w: f64) -> f64 {
    let p = value + 0.2 * velocity;
    let mut best = w / 2.0;
    let mut min = f64::INFINITY;
    for i in 0..=LINES {
        let s = w / 2.0 - i as f64 * SPACE;
        let d = (p - s).abs();
        if d < min {
            min = d;
            best = s;
        }
    }
    best
}

struct PrequelSlider {
    /// safeTop, safeBottom.
    insets: (f32, f32),
    /// The window, in points, and its pixels per point.
    size: (f32, f32),
    scale: f32,
    /// scrollOffset.
    scroll: Spring,
    /// scrollOffset as the reaction last saw it.
    last_offset: f64,
    /// scrollContext.
    context: f64,
    pan: PanGesture,
    /// progressPercentage.
    progress: f64,
    /// previousLineIndex.
    line_index: i64,
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
    /// The UI layer, the editor's mask.
    layers: [wgpu::TextureView; 2],
    bind: wgpu::BindGroup,
    /// The mask was drawn for this layout.
    masked: bool,
}

/// Where everything is, in points (RN's layout on the pixel grid).
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

    /// The offset's bounds: [−ProgressWidth + W / 2, W / 2].
    fn bounds(&self) -> (f64, f64) {
        let w = self.size.0 as f64;
        (-(LINES as f64 * SPACE).round() + w / 2.0, w / 2.0)
    }

    /// useAnimatedReaction on scrollOffset: onProgressChange.
    fn react(&mut self) {
        let offset = self.scroll.value;
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
        let index = (progress * LINES as f64).floor() as i64;
        if index != self.line_index && index >= 0 {
            self.posted.push("haptic:selection".into());
            self.line_index = index;
        }
        self.progress = progress;
    }

    /// `color`: interpolateColor(progress, [0, 1], ['#6d9bf1', 'orange']).
    fn color(&self) -> [u8; 3] {
        let c = interpolate_color(self.progress, &[0.0, 1.0], &[[109.0, 155.0, 241.0, 1.0], [255.0, 165.0, 0.0, 1.0]]);
        [c[0] as u8, c[1] as u8, c[2] as u8]
    }

    fn record(&mut self, scale: f32, at: &Layout) {
        let w = self.size.0;
        let rgb = self.color();
        let c = &mut self.ui;
        c.begin(scale);
        // The donut: rotated −90° about its centre, so its circle starts at the top.
        let (dx, dy) = (at.donut[0] + DONUT / 2.0, at.donut[1] + DONUT / 2.0);
        let r = DONUT / 2.0 - DONUT_STROKE / 2.0;
        // backgroundColor 'rgba(255,255,255,0.25)'.
        let ring = Paint::stroke(Color([1.0, 1.0, 1.0, 0.25]), DONUT_STROKE).caps(Cap::Round, Join::Miter);
        c.draw_with(&ring, |b| skia::add_circle(b, dx, dy, r));
        let end = self.progress.clamp(0.0, 1.0) as f32;
        if end > 0.0 {
            let arc = Paint::stroke(Color::rgb8(rgb[0], rgb[1], rgb[2]), DONUT_STROKE).caps(Cap::Round, Join::Miter);
            // The circle's first `end` of its length from the top (addCircle starts at 3
            // o'clock, clockwise; the group's −90° turns it to 12).
            c.draw_with(&arc, |b| skia::add_arc(b, dx - r, dy - r, 2.0 * r, 2.0 * r, -90.0, 360.0 * end));
        }
        // The slider's lines, in the lines canvas (clipped to it).
        let top = at.lines[1];
        c.save();
        c.clip_rrect(0.0, top, w, at.lines[3] - top, 0.0);
        let x0 = self.scroll.value as f32;
        let small = Paint::fill(Color::WHITE).with_opacity(0.5);
        let big = Paint::fill(Color::WHITE);
        for pass in [false, true] {
            for i in 0..=LINES {
                if (i % BIG_EACH == 0) != pass {
                    continue;
                }
                // getLinesPath draws a line when the scroll's base −offset + W / 2 is within
                // W / 2 of it.
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
        // The indicator View: its colour is a View's (Display P3).
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
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.4},\"offset\":{:.2},\"lineIndex\":{}}}", self.progress, self.scroll.value, self.line_index))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        // The GestureDetector's view: the slider's W × 60 area, as laid out.
        let area = self.layout(self.scale).area;
        let inside = x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3];
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, inside) {
            Event::Begin { .. } => {
                self.context = self.scroll.value;
                let v = self.scroll.value;
                self.scroll.set(v);
            }
            Event::Start(p) | Event::Update(p) => {
                let (lo, hi) = self.bounds();
                self.scroll.set((self.context + p.translation_x as f64).clamp(lo, hi));
                self.react();
            }
            Event::End(p) => {
                let target = snap_point(self.scroll.value, p.velocity_x as f64, self.size.0 as f64);
                self.scroll.to(target, 0.0, SNAP);
            }
            _ => {}
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
        if self.size != (frame.width, frame.height) {
            let first = self.size.0 == 0.0;
            self.size = (frame.width, frame.height);
            let w = frame.width;
            if first {
                // useSharedValue(ScreenWidth / 2).
                self.scroll.set(w as f64 / 2.0);
            }
            let black = Color::BLACK;
            let clear = Color::TRANSPARENT;
            self.gradient = Some(Paint::shader(Shader::Linear { start: point(0.0, 0.0), end: point(w, 0.0), stops: stops(&[black, clear, clear, clear, black]) }));
            if let Some(gpu) = self.gpu.as_mut() {
                gpu.masked = false;
            }
        }
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
        // Cover: fitRects("cover", image, (0, 0, width, height)) → rect2rect(src, dst).
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
        moving || self.pan.tracking()
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

/// The photo as Skia holds it: its decoded pixels, one level (the shader reads it without
/// mipmaps, as `ImageShader`'s default sampling does).
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
        assert_eq!(snap_point(150.0, 100.0, 420.0), 170.0);
        assert_eq!(snap_point(-2000.0, 0.0, 420.0), 210.0 - 500.0);
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
        // The editor: x 32…1229 px, y 372…2156 px (H 912, safe 68/34): the photo, opaque.
        assert_eq!(rest.at(600, 1200)[3], 255);
        assert_eq!(rest.at(20, 1200)[3], 0, "left of the editor");
        assert_eq!(rest.at(34, 374)[3], 0, "the continuous corner");
        // The indicator at x 630…638 px, y 2382…2436 px, blue (#6d9bf1 as P3).
        let ind = rest.at(634, 2409);
        assert!(ind[2] > 220 && ind[0] < 120, "indicator {ind:?}");
        // The ring's track, white at 0.25, at the donut's top (centre 630.5 px, r 46.5 px).
        let ring = rest.at(631, 2214 + 6);
        assert!(ring[3] > 40 && ring[3] < 90, "ring {ring:?}");
        let before = rest.at(600, 1200);
        let finger = |s: &mut Box<dyn Surface>, phase, x, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y: 2409.0 / 3.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // Drag left 253 pt slowly: offset 210 − 253 → progress 0.506; release, snap to 0.5.
        finger(&mut s, PointerPhase::Down, 350.0, 0.0);
        for i in 1..=22 {
            finger(&mut s, PointerPhase::Move, 350.0 - 11.5 * i as f32, 40.0 * i as f64);
        }
        // A haptic per line index reached (11.5 pt moves skip some of the 26).
        let posted = s.messages();
        assert!(posted.iter().filter(|m| *m == "haptic:selection").count() > 15, "{posted:?}");
        assert!(s.agent("").unwrap().ends_with("\"lineIndex\":25}"), "{}", s.agent("").unwrap());
        finger(&mut s, PointerPhase::Up, 97.0, 2000.0);
        let mut ms = 2000.0;
        let mut img = rest;
        let mut moving = true;
        while moving && ms < 6000.0 {
            ms += 16.0;
            (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        gfx::save_over(&img, "prequel-slider-half", [0, 0, 0]);
        assert!(s.agent("").unwrap().starts_with("{\"progress\":0.5000,\"offset\":-40.00"), "{}", s.agent("").unwrap());
        assert_ne!(img.at(600, 1200), before, "the photo is warped");
        // Half: the ring's arc reaches the bottom; the indicator is between blue and orange.
        let ring = img.at(631, 2313);
        assert!(ring[3] > 200, "ring's arc at 6 o'clock {ring:?}");
    }
}
