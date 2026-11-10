//! Skia Bottom Sheet (src/animations/skia-bottom-sheet: index.tsx,
//! components/bottom-sheet/index.tsx): a photo filling the screen and a frosted sheet over its
//! bottom (150 pt showing) that the finger drags up and lets snap open or closed.
//!
//! - The photo: picsum id 476, 2000 × 2000 (DEFAULT_IMAGE_URL), `fit="cover"` over the canvas.
//!   Kept in images/ (the same JPEG, its progressive scan rewritten as baseline by `jpegtran`,
//!   pixel-identical), decoded once at the first frame.
//! - The sheet: the rounded rect (x 0, y = height − 150 + clampedTranslateY, the canvas's
//!   width and height, r 30), clampedTranslateY = max(translateY, −(height − 150)). Inside it the
//!   photo blurred (Blur 10, mode "clamp", drawn once at the canvas's pixels: useBlurredImage);
//!   the handle: a white RoundedRect 100 × 5, r 5, centred, 10 below the sheet's top; then the
//!   sheet's path in rgba(0,0,0,0.2) under BlurMask(5, "inner").
//! - The pan (react-native-skia-gesture's Touchable.Path: a Pan whose onBegin hit-tests the
//!   path): onStart (the touch-down on the sheet) keeps context.y = clampedTranslateY; onActive
//!   (the pan's updates) translateY = translationY + context.y; onEnd (its finalize) springs
//!   translateY (Reanimated 4's default) to −height / 2 when |translateY| + 150 > height / 3,
//!   else to 0.
//!
//! The blurred photo and the sheet's blurred coverage are made once per size; a frame is one
//! pass.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Spring, GENTLE};
use skia::{Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::skia_bottom_sheet::{entry, module, Uniforms, BLURRED, GROUP_0, MASK, PHOTO, SMP, U};
use shaders::skia_bottom_sheet_cover as cover;

/// DEFAULT_CARD_INITIAL_OFFSET: how much of the sheet shows when closed.
const INITIAL_OFFSET: f64 = 150.0;
/// DEFAULT_CARD_RADIUS.
const RADIUS: f32 = 30.0;
/// DEFAULT_BLUR: the photo's blur in the sheet.
const BLUR: f32 = 10.0;
/// The sheet's BlurMask.
const MASK_BLUR: f32 = 5.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
static PHOTO_JPEG: &[u8] = include_bytes!("../images/skia-bottom-sheet-picsum-476.jpg");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(SkiaBottomSheet { blur: skia::Blur::clamped(), ..Default::default() })
}

#[derive(Default)]
struct SkiaBottomSheet {
    /// The canvas, in points.
    size: (f32, f32),
    pan: PanGesture,
    /// translateY.
    translate: Spring,
    /// context.y.
    context: f64,
    mask_layer: Canvas,
    renderer: Renderer,
    blur: skia::Blur,
    mask_blur: skia::Blur,
    /// The photo, uploaded at the first frame, and its size in pixels.
    photo: Option<wgpu::TextureView>,
    photo_size: (u32, u32),
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    /// The covering photo, the blurred one, the sheet's blurred coverage.
    bind: wgpu::BindGroup,
}

impl SkiaBottomSheet {
    /// clampedTranslateY.
    fn clamped(&self) -> f64 {
        self.translate.value.max(-(self.size.1 as f64 - INITIAL_OFFSET))
    }
    /// The sheet's top, in points.
    fn top(&self) -> f32 {
        (self.size.1 as f64 - INITIAL_OFFSET + self.clamped()) as f32
    }
    /// Whether (x, y) is on the sheet's rounded rect (`path.contains`).
    fn on_sheet(&self, x: f32, y: f32) -> bool {
        let (w, h) = self.size;
        let top = self.top();
        if x < 0.0 || x > w || y < top || y > top + h {
            return false;
        }
        let cx = x.clamp(RADIUS, w - RADIUS);
        let cy = y.clamp(top + RADIUS, top + h - RADIUS);
        (x - cx).hypot(y - cy) <= RADIUS
    }
    /// onEnd: snap open or closed.
    fn snap(&mut self) {
        let height = self.size.1 as f64;
        let translation = self.translate.value.abs() + INITIAL_OFFSET;
        let to = if translation > height / 3.0 { -height / 2.0 } else { 0.0 };
        // A spring still running hands its velocity on (Reanimated's onStart).
        let v = if self.translate.running { self.translate.velocity } else { 0.0 };
        self.translate.to(to, v, GENTLE);
    }
}

/// The photo, decoded (RGBA) and uploaded.
fn photo_texture(device: &wgpu::Device, queue: &wgpu::Queue) -> (wgpu::TextureView, (u32, u32)) {
    use zune_jpeg::zune_core::{bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions};
    let options = DecoderOptions::default().jpeg_set_out_colorspace(ColorSpace::RGBA);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(PHOTO_JPEG), options);
    let (pixels, (w, h)) = match decoder.decode() {
        Ok(pixels) => {
            let (w, h) = decoder.dimensions().unwrap_or((1, 1));
            (pixels, (w as u32, h as u32))
        }
        Err(_) => (vec![0, 0, 0, 255], (1, 1)),
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("skia bottom sheet photo"),
        size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: LAYER,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &pixels,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4 * w), rows_per_image: Some(h) },
        wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
    );
    (texture.create_view(&Default::default()), (w, h))
}

impl Surface for SkiaBottomSheet {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"translateY\":{:.2},\"target\":{:.2},\"dragging\":{}}}", self.translate.value, self.translate.target(), self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let hit = self.on_sheet(x, y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { .. } => self.context = self.clamped(),
            Event::Start(p) | Event::Update(p) => self.translate.set(p.translation_y as f64 + self.context),
            Event::End(_) | Event::Fail => self.snap(),
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
        self.size = (frame.width, frame.height);
        let moving = self.translate.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let (w, h) = (frame.width, frame.height);
        if self.photo.is_none() {
            let (view, size) = photo_texture(device, queue);
            self.photo = Some(view);
            self.photo_size = size;
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            let photo = skia::render::sampled_target(device, "skia bottom sheet cover", LAYER, pw, ph);
            // The photo, fit "cover": scaled by max(w / iw, h / ih), centred.
            let (iw, ih) = (self.photo_size.0 as f32, self.photo_size.1 as f32);
            let k = (pw as f32 / iw).max(ph as f32 / ih);
            let (dw, dh) = (iw * k, ih * k);
            let cover_uniforms = cover::Cover { canvas: [pw as f32, ph as f32, (pw as f32 - dw) / 2.0, (ph as f32 - dh) / 2.0], image: [dw, dh, 0.0, 0.0] };
            let cover_shader = device.create_shader_module(cover::module());
            let cover_layout = device.create_bind_group_layout(&cover::GROUP_0);
            let cover_pipeline = skia::render::fullscreen_pipeline(device, &cover_shader, &cover_layout, cover::entry::COVER, LAYER, None);
            let cover_buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("skia bottom sheet cover"), size: cover::Cover::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
            queue.write_buffer(&cover_buffer, 0, &cover_uniforms.bytes());
            let sampler = skia::render::linear_sampler(device);
            let cover_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("skia bottom sheet cover"),
                layout: &cover_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: cover::U.binding, resource: cover_buffer.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: cover::PHOTO.binding, resource: wgpu::BindingResource::TextureView(self.photo.as_ref().unwrap()) },
                    wgpu::BindGroupEntry { binding: cover::SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                ],
            });
            skia::render::fullscreen_pass(encoder, "skia bottom sheet cover", &photo, &cover_pipeline, &cover_bind);
            // useBlurredImage: the covering photo blurred, σ 10 points, its edges clamped.
            let blurred = self.blur.run(device, queue, encoder, &photo, LAYER, pw, ph, BLUR * s);
            // The sheet at y 0, its coverage blurred (BlurMask 5).
            let mask_source = skia::render::sampled_target(device, "skia bottom sheet mask", LAYER, pw, ph);
            let c = &mut self.mask_layer;
            c.begin(s);
            c.draw_rrect(0.0, 0.0, w, h, RADIUS, &Paint::fill(Color::WHITE));
            self.renderer.draw(device, queue, encoder, c, &mask_source, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
            let mask = self.mask_blur.run(device, queue, encoder, &mask_source, LAYER, pw, ph, MASK_BLUR * s);

            let shader = device.create_shader_module(module());
            let layout = device.create_bind_group_layout(&GROUP_0);
            let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("skia bottom sheet"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("skia bottom sheet"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: PHOTO.binding, resource: wgpu::BindingResource::TextureView(&photo) },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred) },
                    wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(mask) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                ],
            });
            self.gpu = Some(Gpu { format, generation: frame.shader_generation, size: (pw, ph), compose, uniforms, bind });
        }
        let gpu = self.gpu.as_ref().unwrap();
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)], sheet: [self.top(), w, h, 0.0] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(encoder, "skia bottom sheet", target, &gpu.compose, &gpu.bind);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_sheet_drags_up_and_snaps_open() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let started = std::time::Instant::now();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        eprintln!("first frame (decode, cover, blurs): {:?}", started.elapsed());
        rest.save("skia-bottom-sheet-closed");
        assert!(!animating);
        // The handle: white, 10 below the sheet's top (912 − 150 = 762), darkened by the sheet's
        // inner shade (0.2 × its blurred coverage, ~0.98 there).
        let handle = rest.at(210, 774);
        assert!(handle[..3].iter().all(|&c| (190..=210).contains(&c)), "handle {handle:?}");
        // Inside the sheet the photo is blurred: neighbouring pixels differ less than above it.
        let roughness = |img: &fixture::Pixels, y0: u32| {
            (0..60u32).map(|i| {
                let (a, b) = (img.at(100 + i * 3, y0), img.at(101 + i * 3, y0));
                (0..3).map(|k| (a[k] as i32 - b[k] as i32).abs()).sum::<i32>()
            }).sum::<i32>()
        };
        let (sharp, soft) = (roughness(&rest, 600), roughness(&rest, 850));
        assert!(soft * 3 < sharp, "sharp {sharp} soft {soft}");

        // A drag from the sheet up by 400: the sheet follows, past a third of the screen.
        let finger = |s: &mut Box<dyn Surface>, phase, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 800.0, 0.0);
        for i in 1..=20 {
            finger(&mut s, PointerPhase::Move, 800.0 - 20.0 * i as f32, 16.0 * i as f64);
        }
        assert!(s.agent("{}").unwrap().starts_with("{\"translateY\":-400.00"), "{}", s.agent("{}").unwrap());
        let (dragged, held) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        dragged.save("skia-bottom-sheet-dragged");
        assert!(held);
        assert!(dragged.at(210, 374)[0] >= 190, "the handle at 362 + 10: {:?}", dragged.at(210, 374));
        finger(&mut s, PointerPhase::Up, 400.0, 420.0);
        let mut ms = 400.0;
        let mut animating = true;
        while animating && ms < 5000.0 {
            ms += 16.0;
            animating = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        // Open: translateY −456, the sheet's top at 912 − 150 − 456 = 306.
        assert!(s.agent("{}").unwrap().starts_with("{\"translateY\":-456.00"), "{}", s.agent("{}").unwrap());
        let (open, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        open.save("skia-bottom-sheet-open");
        assert!(open.at(210, 318)[0] >= 190);

        // A touch above the sheet is not its.
        finger(&mut s, PointerPhase::Down, 200.0, 6000.0);
        finger(&mut s, PointerPhase::Move, 400.0, 6100.0);
        finger(&mut s, PointerPhase::Up, 400.0, 6200.0);
        assert!(s.agent("{}").unwrap().starts_with("{\"translateY\":-456.00"));
        // A small drag down from the open sheet snaps it closed once under a third.
        finger(&mut s, PointerPhase::Down, 320.0, 7000.0);
        finger(&mut s, PointerPhase::Move, 520.0, 7100.0);
        finger(&mut s, PointerPhase::Move, 720.0, 7200.0);
        finger(&mut s, PointerPhase::Up, 720.0, 7300.0);
        let mut ms = 7300.0;
        while ms < 10000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.agent("{}").unwrap().starts_with("{\"translateY\":0.00"), "{}", s.agent("{}").unwrap());
    }
}
