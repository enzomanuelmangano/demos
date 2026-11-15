//! Airbnb slider price: the "$" and four rolling digits above the slider, showing the price the
//! slider sets (the surface's input).
//!
//! - Each digit rolls to its value on a spring. Digit boxes fade with the price's length, and the
//!   "$" slides to stay beside the number.
//! - Every glyph is drawn once into an atlas and composited at its offset. The offsets fall on
//!   half pixels, so the compositor samples the atlas bilinearly.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Easing, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;

const DIGITS: usize = 4;
const DIGIT_W: f64 = 19.0;
const DIGIT_H: f64 = 36.0;
const FONT_SIZE: f32 = 30.0;
const PRIMARY: u32 = 0x27303F;
/// Atlas cell width, points: the "$" box is the widest glyph box.
const CELL_W: f32 = 20.0;
/// The transparent margin around each atlas cell, device pixels.
const GUTTER: f32 = 2.0;

/// Number of digits in `price`.
fn length(price: i64) -> usize {
    price.max(0).to_string().len()
}

/// Decimal digit at `index` (0 is the ones digit).
fn digit(price: i64, index: usize) -> i64 {
    (price / 10_i64.pow(index as u32)) % 10
}

fn visible(price: i64, index: usize) -> bool {
    digit(price, index) != 0 || index < length(price)
}

/// The "$"'s translateX for `price`.
fn currency_x(price: i64) -> f64 {
    let missing = DIGITS as f64 - length(price) as f64;
    missing * DIGIT_W / 2.0 - DIGIT_W - 2.5
}

/// A digit box's translateX for `price`.
fn digit_x(price: i64) -> f64 {
    -DIGIT_W * (DIGITS - length(price)) as f64 / 2.0
}

/// Starts or retargets a spring from where it is. Retargeting to the running spring's own target
/// leaves it unchanged; otherwise the velocity is kept when it points at `to`.
fn chase(s: &mut Spring, to: f64, duration_ms: f64, damping_ratio: f64) {
    if s.running && s.target() == to {
        return;
    }
    let v =
        if !s.running || (to > s.value && s.velocity < 0.0) || (to < s.value && s.velocity > 0.0) {
            0.0
        } else {
            s.velocity
        };
    s.retarget(
        to,
        duration_config(s.value - to, v, duration_ms, damping_ratio, 4.0),
    );
}

struct Digit {
    y: Spring,
    x: Spring,
    opacity: Timing,
}

/// The surface: input 0 is the price.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Price {
        price: None,
        currency: Spring::at(currency_x(0)),
        digits: std::array::from_fn(|i| Digit {
            y: Spring::at(0.0),
            x: Spring::at(digit_x(0)),
            opacity: Timing::at(if visible(0, i) { 1.0 } else { 0.0 }),
        }),
        font: skia::match_ui_font(FONT_SIZE, 700.0),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        atlas_canvas: Canvas::default(),
        atlas_renderer: Renderer::default(),
        atlas: None,
    })
}

struct Price {
    price: Option<i64>,
    currency: Spring,
    digits: [Digit; DIGITS],
    font: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
    atlas_canvas: Canvas,
    atlas_renderer: Renderer,
    /// The Texts' backing stores ("0"…"9", then "$"), one cell each, with the scale and shader
    /// generation they were drawn for.
    atlas: Option<(f32, u32, Images)>,
}

/// Cell `i`'s top-left in the atlas, pixels.
fn cell(i: usize, s: f32) -> [f32; 2] {
    let w = (CELL_W * s).ceil() + 2.0 * GUTTER;
    [GUTTER + i as f32 * w, GUTTER]
}

/// Draws the Text box `frame` (points) from the atlas cell at `origin` (pixels), sampled
/// bilinearly as Core Animation shows a Text's backing store at a fractional offset.
fn composite(
    c: &mut Canvas,
    atlas: &Images,
    origin: [f32; 2],
    frame: [f32; 4],
    s: f32,
    opacity: f32,
) {
    let g = GUTTER / s;
    let to = Matrix::translate(-frame[0], -frame[1])
        .then(Matrix::scale(s, s))
        .then(Matrix::translate(origin[0], origin[1]));
    c.draw_rect(
        frame[0] - g,
        frame[1] - g,
        frame[2] + 2.0 * g,
        frame[3] + 2.0 * g,
        &Paint::image(atlas.image(0), to).with_opacity(opacity),
    );
}

impl Price {
    /// The atlas, drawn once per scale.
    fn atlas(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let s = frame.scale;
        if self
            .atlas
            .as_ref()
            .is_some_and(|a| a.0 == s && a.1 == frame.shader_generation)
        {
            return;
        }
        let Some(font) = self.font.as_ref() else {
            return;
        };
        let end = cell(11, s);
        let (aw, ah) = (
            (end[0] - GUTTER) as u32,
            ((DIGIT_H as f32 * s).ceil() + 2.0 * GUTTER) as u32,
        );
        let atlas = Images::target(device, aw, ah);
        let view = atlas.render_view();
        let c = &mut self.atlas_canvas;
        c.begin(s);
        let paint = Paint::fill(Color::view_hex(PRIMARY));
        for i in 0..11 {
            let label = if i < 10 {
                i.to_string()
            } else {
                "$".to_string()
            };
            let [ox, oy] = cell(i, s).map(|v| v / s);
            let w = if i < 10 { DIGIT_W as f32 } else { CELL_W };
            // A digit wider than its box (bold 0 and 4) starts at the box's left instead of centring.
            let adv = font.advance_width(&label);
            let x = if i < 10 && adv <= w {
                (w - adv) / 2.0
            } else {
                0.0
            };
            // Ink past the text's box is clipped.
            c.save();
            c.clip_rect(ox, oy, w, DIGIT_H as f32);
            c.draw_text(&label, ox + x, gfx::baseline(font, oy), font, &paint);
            c.restore();
        }
        self.atlas_renderer.draw(
            device,
            queue,
            encoder,
            &self.atlas_canvas,
            &view,
            wgpu::TextureFormat::Rgba8Unorm,
            aw,
            ah,
            wgpu::Color::TRANSPARENT,
        );
        self.renderer.set_images(&atlas);
        self.atlas = Some((s, frame.shader_generation, atlas));
    }

    fn set(&mut self, price: i64) {
        let Some(old) = self.price.replace(price) else {
            return;
        };
        if old == price {
            return;
        }
        self.currency.retarget(currency_x(price), GENTLE);
        let changed_length = length(old) != length(price);
        for (i, d) in self.digits.iter_mut().enumerate() {
            if digit(old, i) != digit(price, i) {
                chase(&mut d.y, -DIGIT_H * digit(price, i) as f64, 200.0, 3.0);
            }
            if visible(old, i) != visible(price, i) {
                let to = if visible(price, i) { 1.0 } else { 0.0 };
                if d.opacity.value != to || d.opacity.target() != to {
                    d.opacity.to(to, 300.0, Easing::timing_default());
                }
            }
            if changed_length {
                chase(&mut d.x, digit_x(price), 200.0, 1.0);
            }
        }
    }
}

impl Surface for Price {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let price = inputs
            .first()
            .and_then(|v| v.as_number())
            .unwrap_or(0.0)
            .round() as i64;
        if self.price.is_none() {
            self.price = Some(price);
            self.currency = Spring::at(currency_x(price));
            for (i, d) in self.digits.iter_mut().enumerate() {
                *d = Digit {
                    y: Spring::at(-DIGIT_H * digit(price, i) as f64),
                    x: Spring::at(digit_x(price)),
                    opacity: Timing::at(if visible(price, i) { 1.0 } else { 0.0 }),
                };
            }
        } else {
            self.set(price);
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let ys: Vec<String> = self
            .digits
            .iter()
            .map(|d| format!("{:.2}", d.y.value))
            .collect();
        Some(format!(
            "{{\"price\":{},\"currencyX\":{:.2},\"digitY\":[{}]}}",
            self.price.unwrap_or(0),
            self.currency.value,
            ys.join(",")
        ))
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
        let now = frame.now_ms;
        let mut moving = self.currency.step(now);
        for d in &mut self.digits {
            let fading = d.opacity.step(now);
            // A running spring toward the same target keeps running unchanged.
            moving |= d.y.step(now) | d.x.step(now) | fading;
        }
        self.atlas(frame, device, queue, encoder);
        let (w, s) = (frame.width as f64, frame.scale);
        // The row is 76 wide, centred and snapped to the pixel grid.
        let row =
            (((w - DIGITS as f64 * DIGIT_W) / 2.0) * s as f64 + 0.5 + 1e-4).floor() / s as f64;
        let c = &mut self.canvas;
        c.begin(s);
        if let Some((_, _, atlas)) = self.atlas.as_ref() {
            // The "$" sits at the row's left, moved by its spring.
            let x = (row + self.currency.value) as f32;
            composite(
                c,
                atlas,
                cell(10, s),
                [x, 0.0, CELL_W, DIGIT_H as f32],
                s,
                1.0,
            );
            for (i, d) in self.digits.iter().enumerate() {
                if d.opacity.value <= 0.0 {
                    continue;
                }
                // Clip to the digit box; its column scrolls inside it.
                let left = (row + (DIGITS - 1 - i) as f64 * DIGIT_W + d.x.value) as f32;
                c.save();
                c.clip_rect(left, 0.0, DIGIT_W as f32, DIGIT_H as f32);
                // Only the rows the box shows.
                let first = ((-d.y.value / DIGIT_H).floor().max(0.0)) as usize;
                for k in first..(first + 2).min(10) {
                    let y = (k as f64 * DIGIT_H + d.y.value) as f32;
                    composite(
                        c,
                        atlas,
                        cell(k, s),
                        [left, y, DIGIT_W as f32, DIGIT_H as f32],
                        s,
                        d.opacity.value as f32,
                    );
                }
                c.restore();
            }
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            target,
            format,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_digits_roll_to_the_price() {
        assert_eq!(currency_x(0), 7.0);
        assert_eq!(currency_x(4500), -21.5);
        assert!(visible(0, 0) && !visible(0, 1) && visible(205, 1) && !visible(205, 3));
        assert_eq!(digit_x(45), -19.0);

        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 36.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "airbnb-slider-0", [227, 236, 250]);
        s.bind(&[Value::Number(2350.0)], None).unwrap();
        let mut ms = 0.0;
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 3000.0 {
            ms += 16.7;
        }
        assert!(ms < 1000.0, "{ms}");
        assert_eq!(
            s.agent("{}").unwrap(),
            "{\"price\":2350,\"currencyX\":-21.50,\"digitY\":[-0.00,-180.00,-108.00,-72.00]}"
        );
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&img, "airbnb-slider-2350", [227, 236, 250]);
    }
}
