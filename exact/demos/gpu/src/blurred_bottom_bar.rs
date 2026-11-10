//! Blurred Bottom Bar's BlurView (src/animations/blurred-bottom-bar/components/bottom-tab-bar.tsx):
//! `<BlurView intensity={40}>` (iOS; tint default: `.regular`), its style backgroundColor
//! rgba(255,255,255,0.05), flex 1 inside the bar's 1 pt border. This canvas fills that box; the
//! Contract draws the border and the icons over it.
//!
//! What UIKit's backdrop captures under it, drawn here in window points: the focused screen's
//! photo (an `<Image resizeMode="cover">` of the window's size, centred), the LinearGradient over
//! the window's bottom (LINEAR_GRADIENT_COLORS top to bottom, BOTTOM_BAR_HEIGHT + safeBottom + 30
//! tall; unpremultiplied, as Core Graphics interpolates), and the ExpoBlurView's own 5 % white
//! (its backgroundColor, under the effect view). Then skia::backdrop's `.regular` chain at
//! fraction 0.4 over the canvas, on the window's capture grid.
//!
//! Inputs: the photo (0 01.jpg — Home and Settings —, 1 02.jpg, 2 03.jpg), the canvas's window origin (x, y, points),
//! the window's width and height, the gradient's height. Drawn once per change.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::{point, stops, Canvas, Color, Image, Images, Matrix, Paint, Rect, Renderer, Shader};

static PHOTOS: [&[u8]; 3] = [
    include_bytes!("../../assets/demos/blurred-bottom-bar/01.jpg"),
    include_bytes!("../../assets/demos/blurred-bottom-bar/02.jpg"),
    include_bytes!("../../assets/demos/blurred-bottom-bar/03.jpg"),
];

/// `intensity={Platform.OS === 'android' ? 20 : 40}`.
const INTENSITY: f64 = 40.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's bar surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurredBottomBar::default())
}

/// The photo's index, the window's size, the rows, the first row, the photo's height.
type Strip = (usize, (u32, u32), Image, u32, f32);

#[derive(Default)]
struct BlurredBottomBar {
    /// photo, x, y, window width, window height, gradient height.
    inputs: [f64; 6],
    /// The rows of the photo the canvas shows, cut when the photo or the window changes.
    strip: Option<Strip>,
    images: Option<(usize, Images)>,
    canvas: Canvas,
    renderer: Renderer,
    layer: Option<((u32, u32), wgpu::TextureView)>,
    blur: BackdropBlur,
}

/// A `width`×`height` photo's cover placement in a `ww`×`wh` window (points).
fn cover(width: f32, height: f32, ww: f32, wh: f32) -> Matrix {
    skia::fit_cover(Rect { x: 0.0, y: 0.0, width, height }, Rect { x: 0.0, y: 0.0, width: ww, height: wh })
}

impl Surface for BlurredBottomBar {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        for (i, v) in inputs.iter().take(6).enumerate() {
            self.inputs[i] = v.as_number().unwrap_or(0.0);
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"photo\":{},\"origin\":[{:.1},{:.1}]}}", self.inputs[0], self.inputs[1], self.inputs[2]))
    }

    fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let index = (self.inputs[0].max(0.0) as usize).min(2);
        let [_, x, y, ww, wh, gradient] = self.inputs.map(|v| v as f32);
        let (cw, ch) = (frame.width, frame.height);
        // The photo's rows under the canvas (and the blur's reach is inside it: nothing more).
        let window = (ww.round() as u32, wh.round() as u32);
        if self.strip.as_ref().is_none_or(|(i, w, _, _, _)| *i != index || *w != window) {
            let full = Image::from_jpeg(PHOTOS[index]).unwrap_or_else(|| Image::from_rgba(1, 1, vec![0, 0, 0, 255]));
            let m = cover(full.width as f32, full.height as f32, ww, wh);
            let (k, ty) = (m.0[3], m.0[5]);
            let top = (((y - ty) / k).floor() as i64 - 2).clamp(0, full.height as i64 - 1) as u32;
            let bottom = ((((y + ch) - ty) / k).ceil() as i64 + 2).clamp(top as i64 + 1, full.height as i64) as u32;
            let row = full.width as usize * 4;
            let pixels = full.pixels[top as usize * row..bottom as usize * row].to_vec();
            self.strip = Some((index, window, Image { width: full.width, height: bottom - top, pixels }, top, full.height as f32));
            self.images = None;
        }
        let (_, _, strip, top, full_h) = self.strip.as_ref().unwrap();
        if self.images.as_ref().is_none_or(|(i, _)| *i != index) {
            let images = Images::upload(device, queue, &[strip]);
            self.renderer.set_images(&images);
            self.images = Some((index, images));
        }
        if self.layer.as_ref().is_none_or(|(size, _)| *size != (pw, ph)) {
            self.layer = Some(((pw, ph), skia::render::sampled_target(device, "blurred bottom bar", LAYER, pw, ph)));
        }
        // The backdrop, in window points shifted to the canvas.
        let c = &mut self.canvas;
        c.begin(s);
        c.translate(-x, -y);
        let image = self.images.as_ref().unwrap().1.image(0);
        let m = cover(strip.width as f32, *full_h, ww, wh);
        // Image pixels of the strip: the full photo's rows from `top`.
        let placed = Matrix([m.0[0], 0.0, 0.0, m.0[3], m.0[4], m.0[5] + *top as f32 * m.0[3]]);
        c.draw_rect(x, y, cw, ch, &Paint::image(image, placed.invert()));
        // The LinearGradient: [0, 0, 0, 0] white → 0.1 → 0.5 → 0.8 black, evenly spaced.
        let g0 = wh - gradient;
        let shade = Shader::Linear {
            start: point(0.0, g0),
            end: point(0.0, wh),
            stops: stops(&[Color::WHITE.alpha(0.0), Color::BLACK.alpha(0.1), Color::BLACK.alpha(0.5), Color::BLACK.alpha(0.8)]),
        };
        c.draw_rect(0.0, g0, ww, gradient, &Paint::shader(shade));
        // The ExpoBlurView's backgroundColor, behind its effect view.
        c.draw_rect(x, y, cw, ch, &Paint::fill(Color::WHITE.alpha(0.05)));
        let layer = &self.layer.as_ref().unwrap().1;
        self.renderer.draw(device, queue, encoder, &self.canvas, layer, LAYER, pw, ph, wgpu::Color::BLACK);
        let params = Material::Regular.chain().at(expo_fraction(INTENSITY));
        self.blur.run(device, queue, encoder, layer, [0, 0, pw as i32, ph as i32], [x * s, y * s], &params, s);
        self.blur.draw(device, queue, encoder, target, format, [0.0, 0.0], [0, 0], [pw, ph]);
        false
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_bar_matches_uikit_over_each_photo() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // iPhone Air: 420 × 912, safeBottom 34; the bar's inner box 292 × 58 at (64, 804).
        // The captures: exact/parity-tools/blur-probe (`-pattern photo`), every 4th pixel.
        let captures: [&[u8]; 3] = [
            include_bytes!("../tests/blurred-bottom-bar/bar-0.rgb"),
            include_bytes!("../tests/blurred-bottom-bar/bar-1.rgb"),
            include_bytes!("../tests/blurred-bottom-bar/bar-2.rgb"),
        ];
        let frame = Frame { width: 292.0, height: 58.0, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        for (photo, cap) in captures.iter().enumerate() {
            let mut s = surface();
            s.bind(&[Value::Number(photo as f64), Value::Number(64.0), Value::Number(804.0), Value::Number(420.0), Value::Number(912.0), Value::Number(124.0)], None).unwrap();
            let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
            img.save(&format!("blurred-bottom-bar-{photo}"));
            assert!(!animating);
            let mut worst = 0i32;
            for y in 0..44u32 {
                for x in 0..219u32 {
                    let got = img.at(x * 4, y * 4);
                    for c in 0..3 {
                        let want = cap[((y * 219 + x) * 3 + c as u32) as usize] as i32;
                        worst = worst.max((got[c] as i32 - want).abs());
                    }
                }
            }
            // UIKit's own pixels over the same photo, gradient and bar.
            assert!(worst <= 3, "photo {photo}: worst {worst}");
        }
    }
}
