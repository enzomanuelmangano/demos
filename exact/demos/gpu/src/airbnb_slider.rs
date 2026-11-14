//! Airbnb Slider's price (src/animations/airbnb-slider: index.tsx, components/animated-count.tsx,
//! animated-digit.tsx): the "$" and four rolling digits above the slider, from the price the
//! demo's Contract slider sets (the surface's input).
//!
//! - The row (index.tsx): `flexDirection: 'row'`, centred in the screen's column; it holds the
//!   absolute "$" Text (SF bold 30, Palette.primary) and AnimatedCount: a `row-reverse` of four
//!   19 × 36 digit boxes (overflow hidden), so the row is 76 wide and the ones digit rightmost.
//! - "$": translateX `withSpring((missing × 19) / 2 − 19 − 2.5)` (Reanimated's default spring),
//!   `missing` = 4 − the price's digit count; its style re-runs on every price change.
//! - Each digit (animated-digit.tsx): its column of ten Texts "0"…"9" (each 19 × 36, centred)
//!   moves translateY `withSpring(−36 × digit, { duration: 200, dampingRatio: 3 })`, re-run
//!   when that digit changes. The box: opacity `withTiming(visible ? 1 : 0)` (300 ms,
//!   inOut(quad)), set when its visibility changes; translateX `withSpring(−19 × invisible / 2,
//!   { dampingRatio: 1, duration: 200 })` in the same style as the opacity, so that style (and
//!   its spring) re-runs on every frame the opacity moves, and whenever `invisible` changes.
//!   A digit is visible when it is not 0, or when it lies inside the price's digits.
//! - At mount every value rests on its target (useAnimatedStyle's first style is the target).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Easing, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// maxDigits, textDigitWidth, textDigitHeight, fontSize.
const DIGITS: usize = 4;
const DIGIT_W: f64 = 19.0;
const DIGIT_H: f64 = 36.0;
const FONT_SIZE: f32 = 30.0;
/// Palette.primary.
const PRIMARY: u32 = 0x27303F;

/// `count.toString().length`.
fn length(price: i64) -> usize {
    price.max(0).to_string().len()
}

/// getDigitByIndex.
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

/// `withSpring(to, { duration, dampingRatio })` started (or restarted) from where `s` is, as a
/// re-run style starts it: its velocity kept when it points at `to`, the stiffness solved for it.
fn chase(s: &mut Spring, to: f64, duration_ms: f64, damping_ratio: f64) {
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
    })
}

struct Price {
    price: Option<i64>,
    currency: Spring,
    digits: [Digit; DIGITS],
    font: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Price {
    fn set(&mut self, price: i64) {
        let Some(old) = self.price.replace(price) else {
            return;
        };
        if old == price {
            return;
        }
        // index.tsx's style: re-run on every price change.
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
            // The box's style re-runs while its opacity moves: its spring restarts each frame.
            if fading {
                let to = d.x.target();
                chase(&mut d.x, to, 200.0, 1.0);
            }
            moving |= d.y.step(now) | d.x.step(now) | fading;
        }
        let (w, scale) = (frame.width as f64, frame.scale as f64);
        // The row, 76 wide, centred on Yoga's grid; the canvas is the screen's width.
        let row = (((w - DIGITS as f64 * DIGIT_W) / 2.0) * scale + 0.5 + 1e-4).floor() / scale;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(font) = self.font.as_ref() {
            let paint = Paint::fill(Color::view_hex(PRIMARY));
            let top = gfx::baseline(font, 0.0);
            c.draw_text("$", (row + self.currency.value) as f32, top, font, &paint);
            for (i, d) in self.digits.iter().enumerate() {
                if d.opacity.value <= 0.0 {
                    continue;
                }
                let left = row + (DIGITS - 1 - i) as f64 * DIGIT_W + d.x.value;
                c.save();
                c.clip_rect(left as f32, 0.0, DIGIT_W as f32, DIGIT_H as f32);
                let paint = paint.clone().with_opacity(d.opacity.value as f32);
                // Only the rows the box shows.
                let first = ((-d.y.value / DIGIT_H).floor().max(0.0)) as usize;
                for k in first..(first + 2).min(10) {
                    let label = k.to_string();
                    let x = left + (DIGIT_W - font.advance_width(&label) as f64) / 2.0;
                    let y = k as f64 * DIGIT_H + d.y.value;
                    c.draw_text(
                        &label,
                        x as f32,
                        gfx::baseline(font, y as f32),
                        font,
                        &paint,
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
