//! Record Button's canvas (src/animations/record-button/components/record-button): a 90 × 40
//! canvas (ButtonWidth, ButtonHeight) in #ed4e3c (ButtonColor).
//!
//! - Two stroked paths (StrokeWidth 1, round caps) drawn to `end = progress`: getRightLinePath
//!   (create-skia-line.ts: from the bottom's middle right, round the bottom-right corner, up,
//!   round the top-right corner, left to the top's middle; corners `rArcTo(20, 20, 0, small,
//!   counter-clockwise)`, inset by half the stroke) and its mirror (translate(90, 0)
//!   .scale(-1, 1)): the outline draws itself from the bottom to the top on both sides.
//! - A filled RoundedRect (0, 0, 90, 40, r 20) at opacity withTiming(activated ? 1 : 0) (300 ms,
//!   inOut(quad)), activated = progress > 0.98.
//!
//! The input is `progress` (index.tsx: interpolate(scrollOffset, [0.08, 0.2] × the window's
//! height, [0, 1], CLAMP)), from the Contract's scroll.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Easing, Timing};
use skia::{path_from_svg, Canvas, Color, Matrix, Paint, Path, Renderer};

const WIDTH: f32 = 90.0;
const HEIGHT: f32 = 40.0;
const RADIUS: f32 = 20.0;
const STROKE: f32 = 1.0;
const COLOR: u32 = 0xed4e3c;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let right = right_line_path(STROKE, RADIUS, WIDTH, HEIGHT);
    // builder.transform(Skia.Matrix().translate(width, 0).scale(-1, 1)): x → width − x.
    let left = skia::transform_path(&right, &Matrix::scale(-1.0, 1.0).then(Matrix::translate(WIDTH, 0.0)));
    Box::new(RecordButton { progress: 0.0, bound: false, fill: Timing::at(0.0), right, left, canvas: Canvas::default(), renderer: Renderer::default() })
}

/// getRightLinePath.
fn right_line_path(stroke: f32, r: f32, width: f32, height: f32) -> Path {
    let pad = stroke / 2.0;
    let (w, h) = (width - pad * 2.0, height - pad * 2.0);
    let d = format!("M{} {} L{} {} a{r} {r} 0 0 0 {r} {} L{w} {} a{r} {r} 0 0 0 {} {} L{} {pad}", w / 2.0, h, w - r, h, -r, r + pad, -r, -r, w / 2.0);
    path_from_svg(&d).unwrap_or_default()
}

struct RecordButton {
    progress: f64,
    bound: bool,
    /// internalRoundedRectOpacity.
    fill: Timing,
    right: Path,
    left: Path,
    canvas: Canvas,
    renderer: Renderer,
}

impl Surface for RecordButton {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.progress = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0).clamp(0.0, 1.0);
        let target = if self.progress > 0.98 { 1.0 } else { 0.0 };
        if !self.bound {
            self.bound = true;
            self.fill.set(target);
        } else if self.fill.target() != target {
            self.fill.to(target, 300.0, Easing::timing_default());
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{},\"fill\":{}}}", self.progress, self.fill.value))
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
        let moving = self.fill.step(frame.now_ms);
        let color = Color::hex(COLOR);
        let line = Paint::stroke(color, STROKE).caps(skia::Cap::Round, skia::Join::Miter);
        let end = self.progress as f32;
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        if end > 0.0 {
            canvas.draw_path(&skia::trim(&self.left, 0.0, end), &line);
            canvas.draw_path(&skia::trim(&self.right, 0.0, end), &line);
        }
        if self.fill.value > 0.0 {
            canvas.draw_rrect(0.0, 0.0, WIDTH, HEIGHT, RADIUS, &Paint::fill(color).with_opacity(self.fill.value as f32));
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_outline_draws_itself_then_fills() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 90.0, height: 40.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (a, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(a.data.chunks(4).all(|p| p[3] == 0), "nothing at 0");
        s.bind(&[Value::Number(0.5)], None).unwrap();
        let (b, moving) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        b.save("record-button-half");
        assert!(!moving);
        // Half: the bottom edges and the lower half of both round sides; the top is not drawn.
        assert!(b.at(135, 117)[3] > 100, "bottom middle {:?}", b.at(135, 117));
        assert!(b.at(264, 75)[3] > 100, "right side {:?}", b.at(264, 75));
        assert!(b.at(6, 75)[3] > 100, "left side {:?}", b.at(6, 75));
        assert_eq!(b.at(135, 1)[3], 0, "top middle");
        s.bind(&[Value::Number(1.0)], None).unwrap();
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(32.0)).unwrap();
        assert!(moving);
        let (c, moving) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        c.save("record-button-full");
        assert!(!moving);
        assert_eq!(c.at(135, 60), [0xed, 0x4e, 0x3c, 255]);
    }
}
