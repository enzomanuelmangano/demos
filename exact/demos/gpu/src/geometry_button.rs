//! Geometry Button (src/animations/geometry-button): fifty white circles (rounded rects of
//! `size` 100, corner radius 50) stroked over each other; pressed, they fan out on a ring of
//! radius 50 as the stroke thins (3 → 0.6 → 0.2) and the button grows from half size to full.
//!
//! - `progress`: withSpring(isActive ? 1 : 0, { duration: 600, dampingRatio: 1 }), which is
//!   stiffness 755.4, damping 109.9, mass 4 (tools/spring.ts 600 1).
//! - The canvas's scale: withSpring(isActive ? 1 : 0.5), Reanimated 4's default spring.
//! - The canvas is 200×200 with a border radius of 100: it clips to its circle, scaled with it.
//! - Tap().maxDuration(20000): active from the finger's down to its lift. The heavy haptic at
//!   the down is the app's (`-exact-press-haptic` on the canvas's box).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use reanimated::{interpolate_clamp, Spring, SpringConfig, GENTLE};
use skia::{Canvas, Color, Paint, Renderer};

const CIRCLES: usize = 50;
const SIZE: f64 = 100.0;
const PROGRESS: SpringConfig = SpringConfig { stiffness: 755.4, damping: 109.9, mass: 4.0 };

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(GeometryButton { progress: Spring::at(0.0), scale: Spring::at(0.5), ..Default::default() })
}

#[derive(Default)]
struct GeometryButton {
    size: (f32, f32),
    finger: Option<u32>,
    progress: Spring,
    scale: Spring,
    canvas: Canvas,
    renderer: Renderer,
}

impl GeometryButton {
    fn press(&mut self, active: bool) {
        self.progress.to(if active { 1.0 } else { 0.0 }, self.progress.velocity, PROGRESS);
        self.scale.to(if active { 1.0 } else { 0.5 }, self.scale.velocity, GENTLE);
    }
}

impl Surface for GeometryButton {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, .. } = *event else { return };
        match phase {
            PointerPhase::Down if self.finger.is_none() => {
                // The tap is the scaled view's: a touch inside its circle.
                let (cx, cy) = (self.size.0 / 2.0, self.size.1 / 2.0);
                let r = self.size.0.min(self.size.1) / 2.0 * self.scale.value as f32;
                if (x - cx).hypot(y - cy) <= r {
                    self.finger = Some(id);
                    self.press(true);
                }
            }
            PointerPhase::Up | PointerPhase::Cancel if self.finger == Some(id) => {
                self.finger = None;
                self.press(false);
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
        self.size = (frame.width, frame.height);
        let moving = self.progress.step(frame.now_ms) | self.scale.step(frame.now_ms);
        let p = self.progress.value;
        let stroke_width = interpolate_clamp(p, &[0.0, 0.5, 1.0], &[3.0, 0.6, 0.2]);
        let radius = (SIZE / 2.0) as f32;
        let mut path = skia::path_builder();
        for i in 0..CIRCLES {
            let rotation = i as f32 * std::f32::consts::TAU / CIRCLES as f32;
            let (dx, dy) = (radius * rotation.cos() * p as f32, radius * rotation.sin() * p as f32);
            skia::add_rrect(&mut path, -radius + dx, -radius + dy, SIZE as f32, SIZE as f32, radius);
        }
        let path = path.build();
        let (w, h) = (frame.width, frame.height);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.translate(w / 2.0, h / 2.0);
        c.scale(self.scale.value as f32, self.scale.value as f32);
        // The 200×200 canvas, its radius 100: a circle, scaled with the view.
        let r = w.min(h) / 2.0;
        c.clip_rrect(-r, -r, 2.0 * r, 2.0 * r, r);
        c.draw_path(&path, &Paint::stroke(Color::WHITE, stroke_width as f32));
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.finger.is_some()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 200.0, height: 200.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn pressed_it_fans_out_and_grows() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("geometry-rest");
        // At rest: one ring of radius 25 (half of 50) about the centre.
        assert!(rest.at(125, 100)[3] > 0, "{:?}", rest.at(125, 100));
        assert_eq!(rest.at(100, 100)[3], 0);
        let pointer = |phase, at_ms| InputEvent::Pointer { id: 1, phase, x: 100.0, y: 100.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 0.0));
        let mut ms = 0.0;
        let mut last = rest;
        while ms < 2000.0 {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            last = img;
        }
        last.save("geometry-pressed");
        // Pressed: the circles reach the canvas's edge.
        assert!(last.at(196, 100)[3] > 0 || last.at(195, 100)[3] > 0, "{:?}", last.at(196, 100));
    }
}
