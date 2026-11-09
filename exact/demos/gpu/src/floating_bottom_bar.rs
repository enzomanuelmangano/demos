//! Floating Bottom Bar (src/animations/floating-bottom-bar): the tab bar's `ShaderLight`
//! (components/bottom-tab-bar/shader-light), the light the selected tab sits under. The canvas
//! is the light's box (`singleTabWidth` × 65); the bar, its icons and the light's spring to the
//! selected tab are Contract (demos/floating-bottom-bar).
//!
//! - A trapezoid from (15, 0)–(w − 15, 0) down to (w, h)–(0, h) (`internalCanvasHorizontalPadding`
//!   5, times 3 at the top), filled with a vertical LinearGradient white → transparent at
//!   opacity 0.5.
//! - Over it a white RoundedRect at x 5, width w − 10, height 7, r 20 (clamped to 3.5).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use skia::{point, stops, Canvas, Color, Paint, Path, Renderer, Shader};

/// shader-light: internalCanvasHorizontalPadding.
const PADDING: f32 = 5.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ShaderLight::default())
}

#[derive(Default)]
struct ShaderLight {
    /// The trapezoid, for the size it was built at.
    path: Option<((f32, f32), Path)>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Surface for ShaderLight {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
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
        let (w, h) = (frame.width, frame.height);
        if self.path.as_ref().map(|(size, _)| *size) != Some((w, h)) {
            let mut b = skia::path_builder();
            b.begin(point(PADDING * 3.0, 0.0));
            b.line_to(point(w - PADDING * 3.0, 0.0));
            b.line_to(point(w, h));
            b.line_to(point(0.0, h));
            b.end(true);
            self.path = Some(((w, h), b.build()));
        }
        let path = &self.path.as_ref().unwrap().1;
        let light = Paint::shader(Shader::Linear { start: point(0.0, 0.0), end: point(0.0, h), stops: stops(&[Color::WHITE, Color::TRANSPARENT]) })
            .with_opacity(0.5);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.draw_path(path, &light);
        c.draw_rrect(PADDING, 0.0, w - PADDING * 2.0, 7.0, 20.0, &Paint::fill(Color::WHITE));
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        false
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_light_fades_down_from_its_bar() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // singleTabWidth on a 420 pt screen: 420 × 0.95 × 0.9 / 5 = 71.82.
        let frame = Frame { width: 72.0, height: 65.0, scale: 2.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        img.save("floating-bottom-bar-light");
        assert!(!animating);
        // The bar: opaque white from x 5 to 67, y 0 to 7 (×2 device pixels).
        assert_eq!(img.at(72, 6)[3], 255, "{:?}", img.at(72, 6));
        assert_eq!(img.at(4, 6)[3], 0, "left of the bar {:?}", img.at(4, 6));
        // The trapezoid: half white at its top, fading to nothing at its bottom.
        let top = img.at(72, 20)[3];
        let low = img.at(72, 120)[3];
        assert!((100..=128).contains(&top), "top {top}");
        assert!(low < 20, "bottom {low}");
        // Its slanted side: outside at the top corner, inside at the bottom one.
        assert_eq!(img.at(8, 20)[3], 0);
        assert!(img.at(4, 124)[3] > 0);
    }
}
