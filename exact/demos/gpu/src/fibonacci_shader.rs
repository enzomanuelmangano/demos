//! Fibonacci Shader (src/animations/fibonacci-shader): on black, a square canvas of the
//! window's width (marginTop 100) runs XorDev's FibonacciEffect (gpu/shaders/
//! fibonacci_shader.wgsl), masked in luminance by a white circle of radius width / 2 under
//! Blur(10). Under it (marginTop 80) the AnimatedSlider (components/animated-slider): a
//! 0.8 × width track 4 tall (its `height` falls back to 4: the `sliderHeight` prop is never
//! read), rgba(255,255,255,0.2), radius 5 (UIKit holds it to 2); a white bar as wide as the
//! picker's travel; a white 35 pt picker at scale 0.8, springing to 1 while a finger holds it
//! (withSpring()). Dragging the picker maps its travel [0, width] to N [5, 350] (CLAMP).
//!
//! - iTime: withRepeat(withTiming(15, { duration: 20000, easing: linear }), -1, true).
//! - magicalMul: the input (Math.random() × 100 from the 🪄 button, in the Contract), 2.4 first.
//!
//! Haptics (past RN, which plays none: the owner's haptic language): `haptic:impact-light` when
//! the pan takes the picker (its activation, so a tap plays none); `haptic:impact-rigid` once
//! each time the drag pushes it past an end of the track (clampedTranslateX's limit: N at 5 or
//! 350), re-armed only once the drag is REARM back inside. N's steps play none: 345 of them in
//! the track's ~340 pt would buzz.
//!
//! Native controls (the owner's redesign, phone feedback 2026-11-15: the drawn slider fought the
//! screen's navigation and should be native): a second input, N from the Contract's
//! `swift-slider`, hands the slider to the Contract. With it the surface draws no slider, takes
//! no touches, and runs the sphere full-bleed: no square, no circle mask, the glow fading out on
//! the screen's black, its centre between the close button's row and the floating bar. It says
//! `native` once, so a Contract on a build without this keeps the old layout.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Spring, GENTLE};
use skia::{Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::fibonacci_shader::{entry, module, Uniforms, GROUP_0, U};

/// MAX_CIRCLES_AMOUNT.
const MAX_N: f64 = 350.0;
/// The slider's minValue.
const MIN_N: f64 = 5.0;
/// The square's marginTop.
const TOP: f32 = 100.0;
/// styles.animatedSlider marginTop.
const SLIDER_GAP: f32 = 80.0;
/// The track's height (flattenedStyle.height ?? 4).
const TRACK: f32 = 4.0;
/// pickerSize.
const PICKER: f32 = 35.0;
/// defaultScale.
const REST_SCALE: f64 = 0.8;
/// How far back inside the track the drag goes before the end's rigid plays again, pt.
const REARM: f64 = 6.0;
/// Full-bleed: the room the demo's top row (safe area + close button) and the floating bar
/// (10 + 64 + 10) take; the sphere centres between them.
const TOP_ROOM: f32 = 112.0;
const BAR_ROOM: f32 = 84.0;
/// Full-bleed: the sphere's square is this many widths (the glow, unmasked, runs past it).
const FULL_BLEED_SCALE: f32 = 1.2;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FibonacciShader { magic: 2.4, scale: Spring::at(REST_SCALE), ..Default::default() })
}

#[derive(Default)]
struct FibonacciShader {
    magic: f64,
    /// N from the Contract's native slider (input 1): no drawn slider, full-bleed.
    native: Option<f64>,
    said_native: bool,
    /// translateX (unclamped, as RN's shared value) and the context at onBegin.
    translate_x: f64,
    context_x: f64,
    scale: Spring,
    pan: PanGesture,
    /// The drag holds the picker past an end of the track (its rigid haptic played).
    past_end: bool,
    posted: Vec<String>,
    start_ms: Option<f64>,
    width: f32,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl FibonacciShader {
    fn slider_width(&self) -> f64 {
        self.width as f64 * 0.8
    }
    /// clampedTranslateX.
    fn clamped(&self) -> f64 {
        self.translate_x.clamp(0.0, self.slider_width())
    }
    /// N, from the reaction on clampedTranslateX.
    fn n(&self) -> f64 {
        if let Some(n) = self.native {
            return n.clamp(MIN_N, MAX_N);
        }
        interpolate_clamp(self.clamped(), &[0.0, self.slider_width()], &[MIN_N, MAX_N])
    }
    /// The track's top-left corner in the canvas.
    fn track(&self) -> (f32, f32) {
        (self.width * 0.1, TOP + self.width + SLIDER_GAP)
    }
}

/// withRepeat(withTiming(15, { duration: 20000, easing: linear }), -1, true).
fn itime(ms: f64) -> f64 {
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        15.0 * c / 20000.0
    } else {
        15.0 - 15.0 * (c - 20000.0) / 20000.0
    }
}

impl Surface for FibonacciShader {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(m) = inputs.first().and_then(|v| v.as_number()) {
            self.magic = m;
        }
        if let Some(n) = inputs.get(1).and_then(|v| v.as_number()) {
            self.native = Some(n);
            if !self.said_native {
                self.said_native = true;
                self.posted.push("native".into());
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

    fn input(&mut self, event: &InputEvent) {
        // The native slider has the touches.
        if self.native.is_some() {
            return;
        }
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The GestureDetector wraps the picker: a 35 pt square at the bar's end, scaled.
        let (tx, ty) = self.track();
        let (cx, cy) = (tx + self.clamped() as f32, ty + TRACK / 2.0);
        let half = PICKER / 2.0 * self.scale.value as f32;
        let hit = (x - cx).abs() <= half && (y - cy).abs() <= half;
        let event = self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit);
        match event {
            Event::Begin { .. } => {
                self.scale.to(1.0, self.scale.velocity, GENTLE);
                self.context_x = self.clamped();
                self.past_end = false;
            }
            Event::Start(p) | Event::Update(p) => {
                if matches!(event, Event::Start(_)) {
                    self.posted.push("haptic:impact-light".into());
                }
                self.translate_x = self.context_x + p.translation_x as f64;
                let w = self.slider_width();
                let past = self.translate_x < 0.0 || self.translate_x > w;
                if past && !self.past_end {
                    self.posted.push("haptic:impact-rigid".into());
                    self.past_end = true;
                } else if self.translate_x > REARM && self.translate_x < w - REARM {
                    self.past_end = false;
                }
            }
            Event::End(p) => {
                self.translate_x = self.context_x + p.translation_x as f64;
                self.scale.to(REST_SCALE, self.scale.velocity, GENTLE);
            }
            Event::Fail => self.scale.to(REST_SCALE, self.scale.velocity, GENTLE),
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"n\":{},\"magicalMul\":{},\"held\":{},\"native\":{}}}", self.n(), self.magic, self.pan.tracking(), self.native.is_some()))
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
        let start = *self.start_ms.get_or_insert(frame.now_ms);
        self.scale.step(frame.now_ms);
        let (pw, ph) = frame.pixels();

        if self.native.is_some() {
            return self.render_full_bleed(frame, device, queue, encoder, target, format, start);
        }

        // The slider, on the container's black.
        let (tx, ty) = self.track();
        let w = self.slider_width() as f32;
        let clamped = self.clamped() as f32;
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        canvas.draw_rrect(tx, ty, w, TRACK, 5.0, &Paint::fill(Color::rgba8(255, 255, 255, 51)));
        canvas.draw_rect(tx, ty, clamped, TRACK, &Paint::fill(Color::WHITE));
        canvas.draw_circle(tx + clamped, ty + TRACK / 2.0, PICKER / 2.0 * self.scale.value as f32, &Paint::fill(Color::WHITE));
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);

        // The shader's square.
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let s = frame.scale;
        let side = frame.width;
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            square: [0.0, TOP, side, 0.0],
            params: [itime(frame.now_ms - start) as f32, self.n() as f32, self.magic as f32, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let (y0, y1) = ((TOP * s).round().min(ph as f32) as u32, ((TOP + side) * s).round().min(ph as f32) as u32);
        if y1 > y0 {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("fibonacci shader"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_scissor_rect(0, y0, pw, y1 - y0);
            pass.set_pipeline(&gpu.pipeline);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..3, 0..1);
        }
        // iTime runs for ever.
        true
    }
}

impl FibonacciShader {
    /// The native layout: the sphere over the whole canvas, unmasked (params.w = 1), its square
    /// (1.2 widths) centred between the top row and the bar.
    #[allow(clippy::too_many_arguments)]
    fn render_full_bleed(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
        start: f64,
    ) -> bool {
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (pw, ph) = frame.pixels();
        let side = (frame.width * FULL_BLEED_SCALE).min((frame.height - TOP_ROOM - BAR_ROOM).max(1.0));
        let centre = (TOP_ROOM + frame.height - BAR_ROOM) / 2.0;
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            square: [(frame.width - side) / 2.0, centre - side / 2.0, side, 0.0],
            params: [itime(frame.now_ms - start) as f32, self.n() as f32, self.magic as f32, 1.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("fibonacci shader"),
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
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.draw(0..3, 0..1);
        // iTime runs for ever.
        true
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::FS, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fibonacci shader"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fibonacci shader"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }],
    });
    Gpu { format, generation, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_sphere_glows_in_its_circle_and_the_slider_sets_n() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(2.4)], None).unwrap();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("fibonacci-shader-5");
        assert!(animating);
        // Black above the square and in its corners (outside the mask); the slider's picker
        // white at the track's start (x 42, y 100 + 420 + 80 + 2).
        assert_eq!(&a.at(210, 50)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(3, 103)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(42, 602)[..3], &[255, 255, 255]);
        let lit = (100..520).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit > 50, "{lit} lit samples");
        // Drag the picker to the track's end: N = 350.
        let p = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 602.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&p(exact_gpu::PointerPhase::Down, 42.0, 10.0));
        for k in 1..=20 {
            s.input(&p(exact_gpu::PointerPhase::Move, 42.0 + k as f32 * 20.0, 10.0 + k as f64 * 16.0));
        }
        // Hovering on the end: no second rigid.
        for k in 0..20 {
            s.input(&p(exact_gpu::PointerPhase::Move, if k % 2 == 0 { 396.0 } else { 386.0 }, 330.0 + k as f64 * 3.0));
        }
        s.input(&p(exact_gpu::PointerPhase::Up, 420.0, 400.0));
        // The grab, then the track's end (once, however far past it the finger goes).
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:impact-rigid"]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains("\"n\":350"), "{reply}");
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(5000.0)).unwrap();
        b.save("fibonacci-shader-350");
        assert_ne!(a.data, b.data);
        // The bar is white to the end; the picker sits at its end (x 378).
        assert_eq!(&b.at(300, 602)[..3], &[255, 255, 255]);
    }

    #[test]
    fn a_native_n_hands_over_the_slider_and_goes_full_bleed() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        // One input: the drawn slider, no `native`.
        s.bind(&[Value::Number(2.4)], None).unwrap();
        assert!(s.messages().is_empty());
        // N from the native slider: `native` once, however often it binds.
        s.bind(&[Value::Number(2.4), Value::Number(120.0)], None).unwrap();
        s.bind(&[Value::Number(2.4), Value::Number(400.0)], None).unwrap();
        assert_eq!(s.messages(), vec!["native"]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains("\"n\":350") && reply.contains("\"native\":true"), "{reply}");
        // Touches on the old track do nothing (no grab haptic, N unchanged).
        let p = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 602.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&p(exact_gpu::PointerPhase::Down, 378.0, 10.0));
        s.input(&p(exact_gpu::PointerPhase::Move, 42.0, 30.0));
        s.input(&p(exact_gpu::PointerPhase::Up, 42.0, 50.0));
        assert!(s.messages().is_empty());
        s.bind(&[Value::Number(2.4), Value::Number(120.0)], None).unwrap();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(3000.0)).unwrap();
        a.save("fibonacci-shader-native-120");
        assert!(animating);
        // No drawn slider: the old track's row (y 602) holds no white bar or picker.
        assert!((20..400).all(|x| a.at(x, 602)[..3] != [255, 255, 255]));
        // Full-bleed: the glow reaches past the old circle (no mask) and the screen's centre band
        // is lit; no hard edge where the old square began (y 100).
        let lit = |y0: u32, y1: u32| (y0..y1).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit(300, 640) > 100, "{} lit samples", lit(300, 640));
        let row = |y: u32| (0..420).map(|x| a.at(x, y)[..3].iter().map(|&c| c as i32).sum::<i32>()).sum::<i32>();
        assert!((row(99) - row(101)).abs() < 2000, "{} {}", row(99), row(101));
        s.bind(&[Value::Number(3.0), Value::Number(350.0)], None).unwrap();
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(3000.0)).unwrap();
        b.save("fibonacci-shader-native-350");
        assert_ne!(a.data, b.data);
    }
}
