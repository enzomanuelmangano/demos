//! Slide To Reveal (src/animations/slide-to-reveal: index.tsx, components/slide-to-reveal.tsx,
//! components/text-code.tsx): a dark rounded card (`width` = window × 0.6, 80 tall) showing the
//! code 112358 blurred; where the finger goes, the digits come out sharp and grow.
//!
//! - text = "1  1  2  3  5  8" (the digits joined by two spaces), SF Compact Rounded Medium 34.
//!   textWidth = measureText(text).width; digit at index i (spaces skipped) is drawn at
//!   x = i × textWidth / text.length + (width − textWidth) / 2 − 5, y = textY − 5 with
//!   textY = 34 / 2 + 80 / 2.
//! - Each digit scales by interpolate(distance, [0, 80], [1, 0.5], CLAMP) about
//!   (x + measureText(digit).width / 2, y − 34 / 3); distance from (x, y) to the finger while
//!   it is down, else withTiming(80) (from where it was).
//! - The pan (Gesture.Pan on the canvas): onBegin the mask is on and the point is the finger's,
//!   onUpdate follows it, onFinalize turns the mask off. maskOpacity = withTiming(on ? 1 : 0).
//! - The content's opacity: withTiming(1) once the font has loaded (from 0, at mount here).
//! - Drawn: the RoundedRect (#0F0F0F, r 20); the digits blurred (BlurMask 7) under an alpha
//!   Mask whose white circle (r = width) covers the canvas (its black circle at the finger adds
//!   no alpha: the blurred digits show everywhere); the sharp digits under a luminance Mask of a
//!   white circle (r 60, BlurMask 15, opacity maskOpacity) at the finger.
//!
//! The blurred digits are blurred once at scale 1 (BlurMask respects the transform, so a digit
//! scaled by k blurred by 7k is the blurred digit scaled by k); the circle is blurred once.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Easing, Timing};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::slide_to_reveal::{entry, module, Uniforms, ATLAS, GROUP_0, SHARP, SMP, SPOT, U};

/// The `code` prop.
const CODE: &str = "112358";
/// fontSize.
const FONT_SIZE: f32 = 34.0;
/// The canvas's height.
const HEIGHT: f32 = 80.0;
/// The digits' BlurMask.
const TEXT_BLUR: f32 = 7.0;
/// The finger's circle: r 60, BlurMask 15.
const SPOT_RADIUS: f32 = 60.0;
const SPOT_BLUR: f32 = 15.0;
/// The spot texture: the circle and 3σ around it.
const SPOT_SIZE: f32 = 2.0 * (SPOT_RADIUS + 3.0 * SPOT_BLUR);
/// The atlas: one cell per digit, the pen this far into it (room for 3σ of blur).
const CELL: f32 = 72.0;
const PEN: f32 = 26.0;
const DIGITS: usize = 6;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// SF-Compact-Rounded-Medium.otf, its digits and space (fontTools subset: same outlines, same
/// metrics).
static SF_COMPACT_ROUNDED: &[u8] = include_bytes!("../fonts/sf-compact-rounded-medium-digits.otf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let text = CODE.chars().map(String::from).collect::<Vec<_>>().join("  ");
    Box::new(SlideToReveal {
        font: Font::new(SF_COMPACT_ROUNDED, FONT_SIZE),
        text,
        distance: std::array::from_fn(|_| Timing::at(80.0)),
        ..Default::default()
    })
}

/// A digit: the character, its index in the text, its width (ink).
struct Digit {
    text: String,
    index: usize,
    ink: f32,
}

#[derive(Default)]
struct SlideToReveal {
    font: Option<Font>,
    text: String,
    digits: Vec<Digit>,
    /// textWidth.
    text_width: f32,
    /// The canvas's width, in points.
    width: f32,
    pan: PanGesture,
    active: bool,
    finger: (f32, f32),
    /// Per digit, its distance to the finger.
    distance: [Timing; DIGITS],
    mask_opacity: Timing,
    content: Option<Timing>,
    sharp_layer: Canvas,
    atlas_layer: Canvas,
    spot_layer: Canvas,
    renderers: [Renderer; 3],
    atlas_blur: skia::Blur,
    spot_blur: skia::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    sharp: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

impl SlideToReveal {
    /// The baseline: textY − 5.
    fn baseline() -> f32 {
        FONT_SIZE / 2.0 + HEIGHT / 2.0 - 5.0
    }
    /// Digit `d`'s pen x in the canvas.
    fn digit_x(&self, d: &Digit) -> f32 {
        d.index as f32 * self.text_width / self.text.chars().count() as f32 + (self.width - self.text_width) / 2.0 - 5.0
    }
    fn layout(&mut self) {
        let Some(font) = &self.font else { return };
        if !self.digits.is_empty() {
            return;
        }
        self.text_width = font.measure_text(&self.text).width;
        self.digits = self.text.chars().enumerate().filter(|&(_, c)| c != ' ').map(|(index, c)| {
            let text = c.to_string();
            let ink = font.measure_text(&text).width;
            Digit { text, index, ink }
        }).collect();
    }
    /// The highlighted point moved (or appeared): each digit's distance follows it at once.
    fn follow(&mut self) {
        let y = Self::baseline();
        for k in 0..self.digits.len() {
            let x = self.digit_x(&self.digits[k]);
            let (dx, dy) = ((x - self.finger.0) as f64, (y - self.finger.1) as f64);
            self.distance[k].set((dx * dx + dy * dy).sqrt());
        }
    }
    fn release(&mut self) {
        self.active = false;
        self.mask_opacity.to(0.0, 300.0, Easing::timing_default());
        for d in &mut self.distance {
            d.to(80.0, 300.0, Easing::timing_default());
        }
    }
}

impl Surface for SlideToReveal {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let scales: Vec<String> = self.distance.iter().map(|d| format!("{:.3}", interpolate_clamp(d.value, &[0.0, 80.0], &[1.0, 0.5]))).collect();
        Some(format!("{{\"active\":{},\"maskOpacity\":{:.3},\"scales\":[{}]}}", self.active, self.mask_opacity.value, scales.join(",")))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, true) {
            Event::Begin { x, y } => {
                self.active = true;
                self.finger = (x, y);
                self.mask_opacity.to(1.0, 300.0, Easing::timing_default());
                self.follow();
            }
            Event::Start(p) | Event::Update(p) => {
                self.finger = (p.x, p.y);
                self.follow();
            }
            Event::End(_) | Event::Fail => self.release(),
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
        self.width = frame.width;
        self.layout();
        let content = self.content.get_or_insert_with(|| {
            let mut t = Timing::at(0.0);
            t.to(1.0, 300.0, Easing::timing_default());
            t
        });
        let mut moving = content.step(frame.now_ms);
        moving |= self.mask_opacity.step(frame.now_ms);
        for d in &mut self.distance {
            moving |= d.step(frame.now_ms);
        }
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let y = Self::baseline();
        let white = Paint::fill(Color::WHITE);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            // Once per size: the digits at scale 1 in their cells, blurred; the spot, blurred.
            let (aw, ah) = (((CELL * DIGITS as f32 * s).round() as u32).max(1), ((HEIGHT * s).round() as u32).max(1));
            let atlas_source = skia::render::sampled_target(device, "slide to reveal atlas", LAYER, aw, ah);
            let c = &mut self.atlas_layer;
            c.begin(s);
            if let Some(font) = &self.font {
                for (k, d) in self.digits.iter().enumerate() {
                    c.draw_text(&d.text, k as f32 * CELL + PEN, y, font, &white);
                }
            }
            self.renderers[0].draw(device, queue, encoder, c, &atlas_source, LAYER, aw, ah, wgpu::Color::TRANSPARENT);
            let atlas = self.atlas_blur.run(device, queue, encoder, &atlas_source, LAYER, aw, ah, TEXT_BLUR * s);
            let sp = ((SPOT_SIZE * s).round() as u32).max(1);
            let spot_source = skia::render::sampled_target(device, "slide to reveal spot", LAYER, sp, sp);
            let c = &mut self.spot_layer;
            c.begin(s);
            c.draw_circle(SPOT_SIZE / 2.0, SPOT_SIZE / 2.0, SPOT_RADIUS, &white);
            self.renderers[1].draw(device, queue, encoder, c, &spot_source, LAYER, sp, sp, wgpu::Color::TRANSPARENT);
            let spot = self.spot_blur.run(device, queue, encoder, &spot_source, LAYER, sp, sp, SPOT_BLUR * s);

            let sharp = skia::render::sampled_target(device, "slide to reveal sharp", LAYER, pw, ph);
            let shader = device.create_shader_module(module());
            let layout = device.create_bind_group_layout(&GROUP_0);
            let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("slide to reveal"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
            let sampler = skia::render::linear_sampler(device);
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("slide to reveal"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: ATLAS.binding, resource: wgpu::BindingResource::TextureView(atlas) },
                    wgpu::BindGroupEntry { binding: SHARP.binding, resource: wgpu::BindingResource::TextureView(&sharp) },
                    wgpu::BindGroupEntry { binding: SPOT.binding, resource: wgpu::BindingResource::TextureView(spot) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
                ],
            });
            self.gpu = Some(Gpu { format, generation: frame.shader_generation, size: (pw, ph), compose, uniforms, sharp, bind });
        }
        let gpu = self.gpu.as_ref().unwrap();
        // The sharp digits, each scaled about its pivot.
        let mut digit = [[0.0f32, 0.0, 1.0, 0.0]; DIGITS];
        let c = &mut self.sharp_layer;
        c.begin(s);
        for (k, d) in self.digits.iter().enumerate().take(DIGITS) {
            let x = d.index as f32 * self.text_width / self.text.chars().count() as f32 + (self.width - self.text_width) / 2.0 - 5.0;
            let scale = interpolate_clamp(self.distance[k].value, &[0.0, 80.0], &[1.0, 0.5]) as f32;
            let (ox, oy) = (x + d.ink / 2.0, y - FONT_SIZE / 3.0);
            digit[k] = [ox, oy, scale, x];
            if let Some(font) = &self.font {
                c.save();
                c.translate(ox, oy);
                c.scale(scale, scale);
                c.translate(-ox, -oy);
                c.draw_text(&d.text, x, y, font, &white);
                c.restore();
            }
        }
        self.renderers[2].draw(device, queue, encoder, c, &gpu.sharp, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
        let content = self.content.as_ref().map_or(1.0, |t| t.value) as f32;
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            view: [frame.width, frame.height, content, self.mask_opacity.value as f32],
            finger: [self.finger.0, self.finger.1, CELL * DIGITS as f32, HEIGHT],
            cells: [SPOT_SIZE, SPOT_SIZE, CELL, PEN],
            digit,
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(encoder, "slide to reveal", target, &gpu.compose, &gpu.bind);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_finger_sharpens_and_grows_the_digits_under_it() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // windowWidth 420 × 0.6.
        let frame = |now_ms| Frame { width: 252.0, height: 80.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (first, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(animating, "the content fades in");
        // Before the fade: the card alone, #0F0F0F, transparent past its corner.
        assert_eq!(first.at(380, 120), [15, 15, 15, 255]);
        assert_eq!(first.at(1, 1)[3], 0);
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        rest.save("slide-to-reveal-rest");
        assert!(!animating);
        // The digits at rest: blurred, half size; a glow brighter than the card in the middle.
        let lit = rest.count(|p| p[0] > 40);
        assert!(lit > 2000, "{lit}");
        assert_eq!(s.agent("{}").unwrap(), "{\"active\":false,\"maskOpacity\":0.000,\"scales\":[0.500,0.500,0.500,0.500,0.500,0.500]}");

        // A finger on the third digit (the 2): it grows to ~1, sharp, under the spot.
        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y: 45.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 110.0, 500.0);
        let mut ms = 400.0;
        while ms < 900.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("slide-to-reveal-held");
        assert!(animating, "held");
        let state = s.agent("{}").unwrap();
        assert!(state.starts_with("{\"active\":true,\"maskOpacity\":1.000"), "{state}");
        // Sharp near the finger: some pixels fully white.
        assert!(held.count(|p| p[0] > 245) > 100, "{}", held.count(|p| p[0] > 245));
        assert!(rest.count(|p| p[0] > 245) < 10);

        finger(&mut s, PointerPhase::Up, 110.0, 1000.0);
        while ms < 1600.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (after, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!animating);
        assert_eq!(after.data, rest.data);
    }
}
