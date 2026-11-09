//! Fluid Slider (src/animations/fluid-slider/components/fluid-slider): a #007AFF bar (12 tall,
//! r 6, `sliderSize.width` = width × 0.95) and a metaball circle (r 20) melted together by the
//! layer's Blur 4 + ColorMatrix (alpha × 50 − 25); over the layer a white circle (r 16) with the
//! value 0…100 in Outfit 12 (black, Skia's default paint).
//!
//! - The canvas is `width` × 100, moved right by (width − sliderWidth) / 2 (its translateX):
//!   here the canvas is the screen's width and the drawing is offset by as much.
//! - A touch down on the bar (Touchable.RoundedRect, its path) puts the picker at the finger
//!   (onStart: pickerX = x, isSliding = true); the pan's updates (once active) follow it; its
//!   finalize ends the slide. The picker's x is clamped to [r, sliderWidth − r].
//! - pickerY: withSpring(isSliding ? 100 / 2 − 25 : 100 / 2, { stiffness 200, damping 20,
//!   mass 0.8 }).
//! - The value: round(interpolate(x, [r, sliderWidth − r], [0, 100], CLAMP)), centred on the
//!   picker by its measured ink width, its baseline at pickerY + 12 / 3.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Spring, SpringConfig};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::fluid_slider::{entry, module, Uniforms, GOO, GROUP_0, SMP, TOP, U};

/// DISTANCE_BETWEEN_SLIDER_AND_METABALL.
const DISTANCE: f32 = 10.0;
/// The `color` prop's default.
const COLOR: u32 = 0x007AFF;
/// sliderHeight.
const SLIDER_HEIGHT: f32 = 12.0;
/// fontSize.
const FONT_SIZE: f32 = 12.0;
/// usePickerLayout's pickerY spring.
const PICKER_Y: SpringConfig = SpringConfig { stiffness: 200.0, damping: 20.0, mass: 0.8 };
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FluidSlider { font: Font::new(OUTFIT, FONT_SIZE), picker_y: None, ..Default::default() })
}

#[derive(Default)]
struct FluidSlider {
    /// The canvas, in points.
    size: (f32, f32),
    font: Option<Font>,
    pan: PanGesture,
    /// pickerX, in the RN canvas's points.
    picker_x: f32,
    sliding: bool,
    picker_y: Option<Spring>,
    /// The value's text, rebuilt only when it changes.
    label: String,
    label_value: i32,
    layers: [Canvas; 2],
    renderers: [Renderer; 2],
    blur: skia::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The layer before its blur, and what is drawn over it.
    views: [wgpu::TextureView; 2],
    bind: Option<wgpu::BindGroup>,
}

impl FluidSlider {
    /// sliderSize.width.
    fn slider_width(&self) -> f32 {
        self.size.0 * 0.95
    }
    /// The canvas's translateX.
    fn offset(&self) -> f32 {
        (self.size.0 - self.slider_width()) / 2.0
    }
    /// metaballRadius: min(20, (height − DISTANCE / 2) / 3).
    fn radius(&self) -> f32 {
        20f32.min((self.size.1 - DISTANCE / 2.0) / 3.0)
    }
    /// The bar's top: height / 2 − sliderHeight / 2 + 1.
    fn bar_y(&self) -> f32 {
        self.size.1 / 2.0 - SLIDER_HEIGHT / 2.0 + 1.0
    }
    fn clamped_x(&self) -> f32 {
        self.picker_x.min(self.slider_width() - self.radius()).max(self.radius())
    }
    fn slide(&mut self, sliding: bool) {
        self.sliding = sliding;
        let h = self.size.1 as f64;
        if let Some(y) = self.picker_y.as_mut() {
            y.to(if sliding { h / 2.0 - 25.0 } else { h / 2.0 }, y.velocity, PICKER_Y);
        }
    }
    /// Whether (x, y), in the RN canvas's points, is on the bar's rounded rect.
    fn on_bar(&self, x: f32, y: f32) -> bool {
        let (w, top, r) = (self.slider_width(), self.bar_y(), SLIDER_HEIGHT / 2.0);
        if x < 0.0 || x > w || y < top || y > top + SLIDER_HEIGHT {
            return false;
        }
        let cx = x.clamp(r, w - r);
        let cy = y.clamp(top + r, top + SLIDER_HEIGHT - r);
        (x - cx).hypot(y - cy) <= r
    }
}

impl Surface for FluidSlider {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"value\":{},\"sliding\":{}}}", self.label_value, self.sliding))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let x = x - self.offset();
        let hit = self.on_bar(x, y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { x, .. } => {
                self.picker_x = x;
                self.slide(true);
            }
            Event::Start(p) | Event::Update(p) => self.picker_x = p.x,
            Event::End(_) | Event::Fail => self.slide(false),
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
        let rest = frame.height as f64 / 2.0;
        let picker_y = self.picker_y.get_or_insert_with(|| Spring::at(rest));
        if !picker_y.running && !self.sliding {
            picker_y.set(rest);
        }
        let moving = picker_y.step(frame.now_ms);
        let py = picker_y.value as f32;
        let (r, w) = (self.radius(), self.slider_width());
        let x = self.clamped_x();
        let value = interpolate_clamp(x as f64, &[r as f64, (w - r) as f64], &[0.0, 100.0]).round() as i32;
        if value != self.label_value || self.label.is_empty() {
            use std::fmt::Write;
            self.label.clear();
            let _ = write!(self.label, "{value}");
            self.label_value = value;
        }

        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let color = Paint::fill(Color::hex(COLOR));
        let bar_y = self.size.1 / 2.0 - SLIDER_HEIGHT / 2.0 + 1.0;
        let offset = (self.size.0 - w) / 2.0;
        let [goo, top] = &mut self.layers;
        goo.begin(frame.scale);
        goo.translate(offset, 0.0);
        goo.draw_rrect(0.0, bar_y, w, SLIDER_HEIGHT, 6.0, &color);
        goo.draw_circle(x, py, r, &color);
        top.begin(frame.scale);
        top.translate(offset, 0.0);
        top.draw_circle(x, py, r * 0.8, &Paint::fill(Color::WHITE));
        if let Some(font) = &self.font {
            let ink = font.measure_text(&self.label);
            top.draw_text(&self.label, x - ink.width / 2.0, py + FONT_SIZE / 3.0, font, &Paint::fill(Color::BLACK));
        }
        for (i, layer) in self.layers.iter().enumerate() {
            self.renderers[i].draw(device, queue, encoder, layer, &gpu.views[i], LAYER, pw, ph, wgpu::Color::TRANSPARENT);
        }
        // Blur 4: σ 4 points.
        let blurred = self.blur.run(device, queue, encoder, &gpu.views[0], LAYER, pw, ph, 4.0 * frame.scale);
        queue.write_buffer(&gpu.uniforms, 0, &Uniforms { canvas: [gfx::srgb_flag(format), 0.0, 0.0, 0.0] }.bytes());
        let bind = gpu.bind.get_or_insert_with(|| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("fluid slider"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: GOO.binding, resource: wgpu::BindingResource::TextureView(blurred) },
                    wgpu::BindGroupEntry { binding: TOP.binding, resource: wgpu::BindingResource::TextureView(&gpu.views[1]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            })
        });
        skia::render::fullscreen_pass(encoder, "fluid slider", target, &gpu.compose, bind);
        moving || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let view = |label| skia::render::sampled_target(device, label, LAYER, size.0, size.1);
    Gpu {
        format,
        generation,
        size,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("fluid slider"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        sampler: skia::render::linear_sampler(device),
        views: [view("fluid slider goo"), view("fluid slider top")],
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;
    use exact_gpu::PointerPhase;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 400.0, height: 100.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    #[test]
    fn the_picker_rises_and_follows_the_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("fluid-slider-rest");
        // At rest: the picker at x = r (20) from the bar's start (offset 10): a white disc on
        // the blue at (30, 50), the bar blue at (200, 51).
        let blue = |p: [u8; 4]| p[2] > 200 && p[0] < 60 && p[3] > 200;
        assert!(blue(img.at(400, 102)), "bar {:?}", img.at(400, 102));
        assert_eq!(img.at(60 + 26, 100)[..3], [255, 255, 255], "{:?}", img.at(86, 100));
        assert_eq!(img.at(400, 40)[3], 0);
        let pointer = |phase, x, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 51.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 200.0, 0.0));
        for i in 1..=10 {
            s.input(&pointer(PointerPhase::Move, 200.0 + 10.0 * i as f32, 16.0 * i as f64));
        }
        let mut ms = 0.0;
        let mut img = img;
        while ms < 1000.0 {
            ms += 16.0;
            img = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().0;
        }
        img.save("fluid-slider-sliding");
        // Sliding: the picker at x 300 (290 + the offset), raised to y 25; the goo bridges it
        // to the bar.
        assert!(blue(img.at(600, 14)), "picker rim {:?}", img.at(600, 14));
        assert_eq!(img.at(576, 50)[..3], [255, 255, 255], "picker disc {:?}", img.at(576, 50));
        assert!(!blue(img.at(100, 50)), "above the bar far from it {:?}", img.at(100, 50));
        assert_eq!(s.agent("{}").unwrap(), "{\"value\":79,\"sliding\":true}");
        s.input(&pointer(PointerPhase::Up, 300.0, 200.0));
        let mut animating = true;
        while animating && ms < 4000.0 {
            ms += 16.0;
            let (i, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            img = i;
            animating = a;
        }
        img.save("fluid-slider-dropped");
        assert!(!animating);
        assert_eq!(img.at(600, 14)[3], 0, "settled back {:?}", img.at(600, 14));
    }
}
