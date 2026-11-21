//! Cuberto Slider: a 300-point track with a round picker and a balloon that shows the value.
//! Dragging the picker grows it, thins its border and rounds it; the balloon trails the picker.
//!
//! - The track, bar, picker and balloon are drawn into one full-screen canvas, centred on the
//!   track. Pan begin presses the picker (its springs go to the pressed values). Pan update moves
//!   it by the drag, clamped to the track. Touch-up releases it.
//! - The balloon hangs above the track and leans toward the picker.
//! - Pixels: the picker's straight edges are aliased to the whole pixels whose centres they
//!   hold (edge antialiasing off); its corners stay antialiased. The balloon is drawn upright into
//!   a layer, then placed with its transform, so the value is not resampled.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture};
use motion::{interpolate_clamp, Spring, GENTLE};
use draw2d::{fit_box, Canvas, Color, Font, Images, Matrix, Paint, Path, Rect, Renderer};

use crate::gfx;

const PRIMARY_COLOR: u32 = 0x6141B9;
const PICKER_SIZE: f32 = 50.0;
const SLIDER_HEIGHT: f32 = 4.0;
const SLIDER_WIDTH: f32 = 300.0;
/// Minimum ms between selection ticks.
const TICK_MIN_MS: f64 = 35.0;
const DEFAULT_SCALE: f64 = 0.7;
/// Picker corner radius at rest, pt.
const DEFAULT_RADIUS: f64 = PICKER_SIZE as f64 / 2.5;
/// Picker border width at rest, pt.
const DEFAULT_BORDER: f64 = 16.0;
/// Balloon width, pt.
const BALLOON_WIDTH: f32 = PICKER_SIZE + 15.0;
/// Balloon height, pt.
const BALLOON_HEIGHT: f32 = BALLOON_WIDTH * 1.4;
/// Gap between the balloon and the track, pt.
const BALLOON_BOTTOM: f32 = PICKER_SIZE * 0.8;
const BALLOON_PATH: &str = "M250.035 633.212C191.503 601.79 -40.8238 460.104 6.50042 212.662C60.5479 -69.9336 480.586 -71.6198 536.5 212.662C584.398 456.188 349.649 596.016 281.356 631.103L323.681 686.551C329.675 694.404 325.058 705.72 315.247 706.885C300.617 708.622 281.362 710.5 266.5 710.5C251.638 710.5 232.383 708.622 217.753 706.885C207.942 705.72 203.325 694.404 209.319 686.551L250.035 633.212Z";
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // System bold 20 pt, laid out as UIKit lays it out; falls back to the bundled font.
    let font = draw2d::match_ui_font(20.0, 700.0).or_else(|| Font::new(OUTFIT, 20.0).map(Font::with_ui_layout));
    Box::new(CubertoSlider {
        font,
        balloon: draw2d::path_from_svg(BALLOON_PATH),
        scale: Spring::at(DEFAULT_SCALE),
        radius: Spring::at(DEFAULT_RADIUS),
        border: Spring::at(DEFAULT_BORDER),
        ..Default::default()
    })
}

#[derive(Default)]
struct CubertoSlider {
    size: (f32, f32),
    /// The screen's pixels per point.
    scale_px: f32,
    font: Option<Font>,
    balloon: Option<Path>,
    pan: PanGesture,
    translate_x: f32,
    context_x: f32,
    /// Haptics to post: a light impact at the grab, a selection tick per value step (at most one
    /// per TICK_MIN_MS), a rigid tap where the picker meets either end.
    posted: Vec<String>,
    last_value: i32,
    last_tick_ms: f64,
    at_end: bool,
    scale: Spring,
    radius: Spring,
    border: Spring,
    balloon_x: Spring,
    label: String,
    label_value: i32,
    canvas: Canvas,
    renderer: Renderer,
    /// The balloon's upright content, in device pixels.
    layer: Canvas,
    layer_renderer: Renderer,
    /// The layer's texture, its pixel size and the label and shader generation it holds.
    layer_gpu: Option<(Images, wgpu::TextureView, (u32, u32), u32)>,
    layer_label: Option<i32>,
}

/// Rounds an edge to the device pixel, half up.
fn round_px(v: f32, scale: f32) -> f32 {
    (v * scale + 0.5).floor() / scale
}

/// The first whole-pixel edge whose centre lies past `v` (points), with edge antialiasing off.
fn alias(v: f32, scale: f32) -> f32 {
    (v * scale - 0.5).ceil() / scale
}

impl CubertoSlider {
    /// The track's top-left corner, centred on the screen and pixel-snapped.
    fn origin(&self, scale: f32) -> (f32, f32) {
        (round_px((self.size.0 - SLIDER_WIDTH) / 2.0, scale), round_px((self.size.1 - SLIDER_HEIGHT) / 2.0, scale))
    }
    /// Draws a rounded rect with edge antialiasing off: corners antialiased, straight edges on
    /// whole pixels (`alias`).
    fn layer_rrect(c: &mut Canvas, sp: f32, (l, t, r, b): (f32, f32, f32, f32), radius: f32, paint: &Paint) {
        let (al, at, ar, ab) = (alias(l, sp), alias(t, sp), alias(r, sp), alias(b, sp));
        if ar <= al || ab <= at {
            return;
        }
        let radius = radius.min((r - l) / 2.0).min((b - t) / 2.0);
        c.save();
        c.clip_rect(al, at, ar - al, ab - at);
        c.draw_rrect(l, t, r - l, b - t, radius, paint);
        c.restore();
        // The straight spans between the corners, whole pixels.
        let (il, it, ir, ib) = (alias(l + radius, sp), alias(t + radius, sp), alias(r - radius, sp), alias(b - radius, sp));
        if ib > it {
            c.draw_rect(al, it, ar - al, ib - it, paint);
        }
        if ir > il {
            c.draw_rect(il, at, ir - il, ab - at, paint);
        }
    }
    /// The shown value, 0 to 100.
    fn value(&self) -> i32 {
        interpolate_clamp(self.clamped() as f64, &[0.0, SLIDER_WIDTH as f64], &[0.0, 100.0]).floor() as i32
    }
    /// The drag moved the picker: a tick for a new value, a tap at an end.
    fn felt(&mut self, at_ms: f64) {
        let end = self.translate_x <= 0.0 || self.translate_x >= SLIDER_WIDTH;
        let value = self.value();
        if end && !self.at_end {
            self.posted.push("haptic:impact-rigid".into());
            self.last_tick_ms = at_ms;
            self.last_value = value;
        } else if !end && value != self.last_value && at_ms - self.last_tick_ms >= TICK_MIN_MS {
            self.posted.push("haptic:selection".into());
            self.last_tick_ms = at_ms;
            self.last_value = value;
        }
        self.at_end = end;
    }
    fn clamped(&self) -> f32 {
        self.translate_x.clamp(0.0, SLIDER_WIDTH)
    }
    fn press(&mut self, down: bool) {
        let (s, r, b) = if down { (1.0, PICKER_SIZE as f64 / 2.0, 4.0) } else { (DEFAULT_SCALE, DEFAULT_RADIUS, DEFAULT_BORDER) };
        // Retargets the running springs, keeping their velocity.
        self.scale.retarget(s, GENTLE);
        self.radius.retarget(r, GENTLE);
        self.border.retarget(b, GENTLE);
    }
}

impl Surface for CubertoSlider {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"value\":{},\"x\":{},\"balloonX\":{}}}", self.label_value, self.clamped(), self.balloon_x.value))
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The picker's box (50 × 50 at the clamped x, scaled about its centre) is its hit area.
        let (ox, oy) = self.origin(self.scale_px);
        let half = PICKER_SIZE / 2.0 * self.scale.value as f32;
        let (cx, cy) = (ox + self.clamped(), oy + SLIDER_HEIGHT / 2.0);
        let hit = (x - cx).abs() <= half && (y - cy).abs() <= half;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { .. } => {
                self.press(true);
                self.context_x = self.clamped();
                self.posted.push("haptic:impact-light".into());
                self.last_value = self.value();
                self.at_end = self.translate_x <= 0.0 || self.translate_x >= SLIDER_WIDTH;
                self.last_tick_ms = at_ms;
            }
            Event::Start(p) | Event::Update(p) => {
                self.translate_x = self.context_x + p.translation_x;
                self.felt(at_ms);
            }
            Event::End(_) | Event::Fail => {
                // Release on touch-up; a cancelled touch releases too.
                if matches!(phase, PointerPhase::Up | PointerPhase::Cancel) {
                    self.press(false);
                }
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
        let sp = frame.scale;
        self.scale_px = sp;
        let x = self.clamped();
        // The balloon follows the picker on a spring.
        self.balloon_x.retarget(x as f64, GENTLE);
        let now = frame.now_ms;
        let moving = self.scale.step(now) | self.radius.step(now) | self.border.step(now) | self.balloon_x.step(now);
        let value = interpolate_clamp(x as f64, &[0.0, SLIDER_WIDTH as f64], &[0.0, 100.0]).floor() as i32;
        if value != self.label_value || self.label.is_empty() {
            use std::fmt::Write;
            self.label.clear();
            let _ = write!(self.label, "{value}");
            self.label_value = value;
        }
        let (ox, oy) = self.origin(sp);
        // The balloon is sRGB; the bar and the picker are Display P3 (`Color::view_hex`).
        let color = Paint::fill(Color::hex(PRIMARY_COLOR));
        let view_color = Paint::fill(Color::view_hex(PRIMARY_COLOR));

        // The balloon's content, drawn upright: the path and the value.
        let (lw, lh) = ((BALLOON_WIDTH * sp).ceil() as u32, (BALLOON_HEIGHT * sp).ceil() as u32);
        if self.layer_gpu.as_ref().is_none_or(|g| g.2 != (lw, lh) || g.3 != frame.shader_generation) {
            let images = Images::target(device, lw, lh);
            let view = images.render_view();
            self.renderer.set_images(&images);
            self.layer_gpu = Some((images, view, (lw, lh), frame.shader_generation));
            self.layer_label = None;
        }
        if self.layer_label != Some(value) {
            self.layer_label = Some(value);
            let l = &mut self.layer;
            l.begin(sp);
            if let Some(path) = &self.balloon {
                l.save();
                l.concat(fit_box(Rect::new(0.0, 0.0, 543.0, 711.0), Rect::new(0.0, 0.0, BALLOON_WIDTH, BALLOON_HEIGHT)));
                l.draw_path(path, &color);
                l.restore();
            }
            if let Some(font) = &self.font {
                // The value: centred in the balloon, 10 pt above its bottom edge.
                let top = (BALLOON_HEIGHT - 10.0 - gfx::line_height(font)) / 2.0;
                let w = font.advance_width(&self.label);
                l.draw_text(&self.label, BALLOON_WIDTH / 2.0 - w / 2.0, gfx::baseline(font, top), font, &Paint::fill(Color::WHITE));
            }
            let (_, view, _, _) = self.layer_gpu.as_ref().unwrap();
            self.layer_renderer.draw(device, queue, encoder, &self.layer, view, wgpu::TextureFormat::Rgba8Unorm, lw, lh, wgpu::Color::TRANSPARENT);
        }

        let c = &mut self.canvas;
        c.begin(sp);
        c.draw_rrect(ox, oy, SLIDER_WIDTH, SLIDER_HEIGHT, 5.0, &Paint::fill(Color::hex(0xE5E5E5)));
        // The balloon, behind the bar and the picker, leaning toward it.
        let bx = self.balloon_x.value as f32;
        let rotate = -std::f32::consts::FRAC_PI_2 + (BALLOON_HEIGHT + BALLOON_BOTTOM).atan2(bx - x);
        let (vl, vt) = (round_px(ox - BALLOON_WIDTH / 2.0, sp), round_px(oy + SLIDER_HEIGHT - BALLOON_BOTTOM - BALLOON_HEIGHT, sp));
        let saved = c.matrix();
        c.translate(vl + bx + BALLOON_WIDTH / 2.0, vt + BALLOON_HEIGHT / 2.0);
        c.rotate(-rotate);
        c.translate(-BALLOON_WIDTH / 2.0, -BALLOON_HEIGHT / 2.0);
        if let Some((images, ..)) = &self.layer_gpu {
            c.draw_rect(0.0, 0.0, BALLOON_WIDTH, BALLOON_HEIGHT, &Paint::image(images.image(0), Matrix::scale(sp, sp)));
        }
        c.set_matrix(saved);
        // Progress: from the left edge to the picker.
        c.draw_rect(ox, oy, x, SLIDER_HEIGHT, &view_color);
        // The picker: a border drawn over a white fill.
        let (s, r, b) = (self.scale.value as f32, self.radius.value as f32, self.border.value as f32);
        let (cx, cy) = (ox + x, oy + SLIDER_HEIGHT / 2.0);
        let half = PICKER_SIZE / 2.0 * s;
        let (l, t, rr, bb) = (cx - half, cy - half, cx + half, cy + half);
        Self::layer_rrect(c, sp, (l, t, rr, bb), r * s, &view_color);
        let bw = b * s;
        Self::layer_rrect(c, sp, (l + bw, t + bw, rr - bw, bb - bw), ((r - b) * s).max(0.0), &Paint::fill(Color::WHITE));
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 400.0, height: 400.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn the_balloon_trails_the_picker() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("cuberto-rest");
        assert!(!animating);
        let purple = |p: [u8; 4]| p[0] == 0x61 && p[1] == 0x41 && p[2] == 0xB9;
        let view_purple = |p: [u8; 4]| p[..3] == [103, 63, 192];
        assert_eq!(img.at(500, 400)[..3], [0xE5, 0xE5, 0xE5], "{:?}", img.at(500, 400));
        assert!(view_purple(img.at(100 - 30, 400)), "border {:?}", img.at(70, 400));
        assert_eq!(img.at(100, 400)[..3], [255, 255, 255], "inside {:?}", img.at(100, 400));
        assert!(purple(img.at(100, 180)), "balloon {:?}", img.at(100, 180));
        let pointer = |phase, x, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 200.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&pointer(PointerPhase::Down, 50.0, 0.0));
        let mut ms = 100.0;
        // The pan begins 10 pt late (UIKit hysteresis), so 160 pt of travel moves the picker 150.
        for i in 1..=10 {
            s.input(&pointer(PointerPhase::Move, 50.0 + 16.0 * i as f32, ms));
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("cuberto-dragging");
        let report: String = s.agent("{}").unwrap();
        assert!(report.starts_with("{\"value\":50,\"x\":150,"), "{report}");
        assert!(view_purple(img.at(300, 400)), "progress {:?}", img.at(300, 400));
        assert_eq!(img.at(2 * 200 - 20, 400)[..3], [255, 255, 255], "picker inside {:?}", img.at(380, 400));
        s.input(&pointer(PointerPhase::Up, 210.0, ms));
        let mut animating = true;
        let mut last = img;
        while animating && ms < 5000.0 {
            ms += 16.0;
            let (img, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            last = img;
            animating = a;
        }
        last.save("cuberto-dropped");
        assert!(purple(last.at(400, 180)), "balloon {:?}", last.at(400, 180));
        assert!(!purple(last.at(300, 180)), "left of the balloon {:?}", last.at(300, 180));
    }
}
