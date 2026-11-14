//! One place of Animated Count Text (src/animations/animated-count-text,
//! components/animated-digit.tsx): the 40 × 55 window (overflow hidden) over the column of the
//! ten digit Texts, rolled to its digit by
//! `translateY: withSpring(-height * digit, { duration: 1000, dampingRatio: 0.9 })`.
//! The Contract keeps the window's FadeIn / FadeOut 250, its LinearTransition 800 and the row's
//! springify; this canvas fills the window and draws the column.
//!
//! - Input: `digit` (0…9). The first bind places the column at rest (the style's first run takes
//!   the animation's target); each new digit starts the spring at the next frame, as the
//!   animated style's mapper does after the commit.
//! - The spring is spring.ts onStart's, every start: the velocity running toward the new target
//!   (one pointing away is dropped), the stiffness solved for x0 = current − target and that
//!   velocity (`calculateNewStiffnessToMatchDuration`, mass 4), the rest measured against x0's
//!   energy alone, the clock going on from the running spring's last frame.
//! - Each digit is an RN `<Text>` (SF bold 50, white, 40 × 55, textAlign center): TextKit's line
//!   at the box's top, the baseline an ascent below it; drawn once into an atlas (the Texts'
//!   backing stores) and shown through the column's translate with bilinear sampling, as Core
//!   Animation moves those layers.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::Spring;
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;

/// TEXT_DIGIT_WIDTH.
const WIDTH: f32 = 40.0;
/// TEXT_DIGIT_HEIGHT.
const HEIGHT: f32 = 55.0;
/// FONT_SIZE, fontWeight 'bold'.
const FONT_SIZE: f32 = 50.0;
const FONT_WEIGHT: f32 = 700.0;
/// withSpring's { duration: 1000, dampingRatio: 0.9 } (mass: Reanimated's default 4).
const DURATION_MS: f64 = 1000.0;
const DAMPING_RATIO: f64 = 0.9;
const MASS: f64 = 4.0;

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AnimatedCountDigit::default())
}

#[derive(Default)]
struct AnimatedCountDigit {
    /// The digit bound last, and whether the spring has been sent there.
    digit: Option<f64>,
    pending: bool,
    /// translateY, points.
    translate: Spring,
    font: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
    atlas_renderer: Renderer,
    atlas_canvas: Canvas,
    /// The ten Texts' backing stores, stacked as the column lays them out, and its scale.
    atlas: Option<(f32, u32, Images)>,
}

/// `sv = withSpring(to, { duration, dampingRatio })` restarted by the animated style at
/// `now_ms` (spring.ts onStart, previousAnimation the running one).
fn start(spring: &mut Spring, to: f64, now_ms: f64) {
    let x = spring.value;
    let v = if spring.running { spring.velocity } else { 0.0 };
    // Clip velocity that would drive the first frame away from the new target.
    let v = if (to > x && v < 0.0) || (to < x && v > 0.0) { 0.0 } else { v };
    let config = reanimated::duration_config(x - to, v, DURATION_MS, DAMPING_RATIO, MASS);
    if spring.running {
        // lastTimestamp = previousAnimation.lastTimestamp: the clock goes on from its last frame.
        spring.retarget(to, config);
    } else {
        spring.assign(to, config, now_ms);
    }
}

impl AnimatedCountDigit {
    fn atlas(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let s = frame.scale;
        if self.atlas.as_ref().is_some_and(|a| a.0 == s && a.1 == frame.shader_generation) {
            return;
        }
        if self.font.is_none() {
            self.font = skia::match_ui_font(FONT_SIZE, FONT_WEIGHT);
        }
        let Some(font) = self.font.as_ref() else { return };
        let (aw, ah) = ((WIDTH * s).round() as u32, (10.0 * HEIGHT * s).round() as u32);
        let atlas = Images::target(device, aw, ah);
        let view = atlas.render_view();
        let c = &mut self.atlas_canvas;
        c.begin(s);
        let white = Paint::fill(Color::WHITE);
        for n in 0..10 {
            let label = n.to_string();
            let top = n as f32 * HEIGHT;
            // RN's Text draws in its own frame: ink past it is cut.
            c.save();
            c.clip_rect(0.0, top, WIDTH, HEIGHT);
            // textAlign center in the 40-wide box (its width is given: no ceiled slack).
            let x = (WIDTH - font.advance_width(&label)) / 2.0;
            c.draw_text(&label, x, gfx::baseline(font, top), font, &white);
            c.restore();
        }
        self.atlas_renderer.draw(device, queue, encoder, &self.atlas_canvas, &view, wgpu::TextureFormat::Rgba8Unorm, aw, ah, wgpu::Color::TRANSPARENT);
        self.renderer.set_images(&atlas);
        self.atlas = Some((s, frame.shader_generation, atlas));
    }
}

impl Surface for AnimatedCountDigit {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let digit = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0).clamp(0.0, 9.0).round();
        match self.digit {
            None => self.translate.set(-(HEIGHT as f64) * digit),
            Some(d) if d != digit => self.pending = true,
            _ => {}
        }
        self.digit = Some(digit);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"digit\":{},\"translateY\":{:.3},\"velocity\":{:.3},\"running\":{}}}",
            self.digit.unwrap_or(0.0),
            self.translate.value,
            self.translate.velocity,
            self.translate.running
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
        if std::mem::take(&mut self.pending) {
            start(&mut self.translate, -(HEIGHT as f64) * self.digit.unwrap_or(0.0), now);
        }
        let moving = self.translate.step(now);
        self.atlas(frame, device, queue, encoder);
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let c = &mut self.canvas;
        c.begin(s);
        if let Some((_, _, atlas)) = self.atlas.as_ref() {
            // The column moved by translateY: a canvas point p shows the column's p − (0, ty).
            let to = Matrix::translate(0.0, -self.translate.value as f32).then(Matrix::scale(s, s));
            c.draw_rect(0.0, 0.0, frame.width, frame.height, &Paint::image(atlas.image(0), to));
        }
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: f64 = 1000.0 / 60.0;

    /// Frames 0..=n at 60 Hz.
    fn run(s: &mut Spring, n: u32) {
        for i in 0..=n {
            s.step(i as f64 * FRAME);
        }
    }

    #[test]
    fn a_start_from_rest_is_the_fixed_duration_spring() {
        let mut s = Spring::at(0.0);
        start(&mut s, -55.0 * 7.0, 0.0);
        let c = reanimated::duration_config(55.0 * 7.0, 0.0, DURATION_MS, DAMPING_RATIO, MASS);
        // Reanimated's bisection stops within its precision at 333.0078 (tools/spring.ts runs it
        // to the root, 333.0278: the -exact-spring the Contract had).
        assert!((c.stiffness - 333.0078125).abs() < 1e-9 && (c.damping - 65.6946).abs() < 1e-4, "{c:?}");
        run(&mut s, 120);
        assert_eq!(s.value, -385.0);
    }

    #[test]
    fn a_reversal_drops_the_velocity_and_solves_a_new_stiffness() {
        let next = 13.0 * FRAME;
        let mut s = Spring::at(0.0);
        start(&mut s, -495.0, 0.0);
        run(&mut s, 12);
        assert!(s.running && s.velocity < 0.0);
        let x = s.value;
        // Back up toward 0: the downward velocity points away, Reanimated drops it.
        start(&mut s, 0.0, next);
        let want = reanimated::duration_config(x, 0.0, DURATION_MS, DAMPING_RATIO, MASS);
        let mut fresh = Spring::at(x);
        fresh.to(0.0, 0.0, want);
        // Both advance one frame from the last one.
        s.step(next);
        fresh.step(0.0);
        fresh.step(FRAME);
        assert!((s.value - fresh.value).abs() < 1e-9, "{} {}", s.value, fresh.value);
        assert!(s.velocity > 0.0);
        // Onward, toward a further target: the velocity is kept and the stiffness solved with it.
        let mut k = Spring::at(0.0);
        start(&mut k, -495.0, 0.0);
        run(&mut k, 12);
        let (x, v) = (k.value, k.velocity);
        start(&mut k, -550.0, next);
        let with_v = reanimated::duration_config(x + 550.0, v, DURATION_MS, DAMPING_RATIO, MASS);
        assert!((with_v.stiffness - want.stiffness).abs() > 1.0);
        let mut want = Spring::at(x);
        want.to(-550.0, v, with_v);
        k.step(next);
        want.step(0.0);
        want.step(FRAME);
        assert!((k.value - want.value).abs() < 1e-9, "{} {}", k.value, want.value);
    }

    #[test]
    fn the_column_rests_on_its_digit() {
        let gpu = match exact_gpu::fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 40.0, height: 55.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut surface = AnimatedCountDigit::default();
        surface.bind(&[Value::Number(3.0)], None).unwrap();
        let ink = |img: &exact_gpu::fixture::Pixels| {
            let (mut sum, mut sx, mut sy) = (0f64, 0f64, 0f64);
            for y in 0..165 {
                for x in 0..120 {
                    let a = img.at(x, y)[3] as f64;
                    sum += a;
                    sx += x as f64 * a;
                    sy += y as f64 * a;
                }
            }
            (sum, sx / sum, sy / sum)
        };
        let (img, moving) = exact_gpu::fixture::render(&gpu, &mut surface, &frame(0.0)).unwrap();
        assert!(!moving);
        let (sum, cx, cy) = ink(&img);
        assert!(sum > 255.0 * 300.0, "ink {sum}");
        // The "3" (its ink leans right of its advance's centre) sits mid-window.
        assert!((cx - 60.0).abs() < 6.0 && (cy - 90.0).abs() < 10.0, "centroid {cx} {cy}");
        // To 8 and back mid-roll: it settles on 3 again.
        surface.bind(&[Value::Number(8.0)], None).unwrap();
        let mut ms = 0.0;
        for _ in 0..12 {
            ms += FRAME;
            exact_gpu::fixture::render(&gpu, &mut surface, &frame(ms)).unwrap();
        }
        surface.bind(&[Value::Number(3.0)], None).unwrap();
        while exact_gpu::fixture::render(&gpu, &mut surface, &frame(ms)).unwrap().1 && ms < 4000.0 {
            ms += FRAME;
        }
        assert!(ms < 4000.0);
        let (again, _) = exact_gpu::fixture::render(&gpu, &mut surface, &frame(ms)).unwrap();
        assert_eq!(again.data, img.data);
    }
}
