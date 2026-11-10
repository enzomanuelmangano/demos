//! Cuberto Slider (src/animations/cuberto-slider/components/slider.tsx): a 300 × 4 track
//! (#E5E5E5, radius 5), its progress (#6141B9) and a round picker (pickerSize 50, white with a
//! #6141B9 border); dragging it grows the picker (scale 0.7 → 1), thins its border
//! (floor(50 / 3) = 16 → 4) and rounds it (50 / 2.5 = 20 → 25), all withSpring() (Gentle), and
//! a balloon (the Skia path in a 65 × 91 FitBox, the value in white bold 20 inside) trails the
//! picker on withSpring(), leaning toward it.
//!
//! RN draws the track, the bar and the picker as Views and the balloon in a Skia canvas inside
//! a View; they all move per frame from one pan, so the whole slider is this surface, on a
//! full-screen canvas whose centre is the track's (styles.container centres it).
//!
//! - Pan().onBegin: the springs to their pressed values, contextX = clamped x; onUpdate:
//!   translateX = contextX + translationX, clamped to [0, 300]; onTouchesUp: springs back.
//! - The balloon: 65 wide (pickerSize + 15), × 1.4 tall, its bottom 40 (pickerSize × 0.8) above
//!   the track's bottom, centred on balloonX; rotated by
//!   −(−π/2 + atan2(91 + 40, balloonX − x)) about its centre.
//! - The value: floor(interpolate(x, [0, 300], [0, 100], CLAMP)), a TextInput (ReText) filling
//!   the balloon less 10 at the bottom: centred both ways (UITextField centres its line), in
//!   the system font, bold, 20.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Spring, GENTLE};
use skia::{fit_box, Canvas, Color, Font, Paint, Path, Rect, Renderer};

use crate::gfx;

const PRIMARY_COLOR: u32 = 0x6141B9;
const PICKER_SIZE: f32 = 50.0;
const SLIDER_HEIGHT: f32 = 4.0;
const SLIDER_WIDTH: f32 = 300.0;
const DEFAULT_SCALE: f64 = 0.7;
/// pickerSize / 2.5.
const DEFAULT_RADIUS: f64 = PICKER_SIZE as f64 / 2.5;
/// floor(pickerSize / 3).
const DEFAULT_BORDER: f64 = 16.0;
/// pickerSize + 15.
const BALLOON_WIDTH: f32 = PICKER_SIZE + 15.0;
/// balloonWidth × 1.4.
const BALLOON_HEIGHT: f32 = BALLOON_WIDTH * 1.4;
/// pickerSize × 0.8.
const BALLOON_BOTTOM: f32 = PICKER_SIZE * 0.8;
const BALLOON_PATH: &str = "M250.035 633.212C191.503 601.79 -40.8238 460.104 6.50042 212.662C60.5479 -69.9336 480.586 -71.6198 536.5 212.662C584.398 456.188 349.649 596.016 281.356 631.103L323.681 686.551C329.675 694.404 325.058 705.72 315.247 706.885C300.617 708.622 281.362 710.5 266.5 710.5C251.638 710.5 232.383 708.622 217.753 706.885C207.942 705.72 203.325 694.404 209.319 686.551L250.035 633.212Z";
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // fontWeight 'bold', fontSize 20: San Francisco Bold where the platform's file is readable.
    let font = skia::match_system_font(20.0, 700.0).or_else(|| Font::new(OUTFIT, 20.0));
    Box::new(CubertoSlider {
        font,
        balloon: skia::path_from_svg(BALLOON_PATH),
        scale: Spring::at(DEFAULT_SCALE),
        radius: Spring::at(DEFAULT_RADIUS),
        border: Spring::at(DEFAULT_BORDER),
        ..Default::default()
    })
}

#[derive(Default)]
struct CubertoSlider {
    size: (f32, f32),
    font: Option<Font>,
    balloon: Option<Path>,
    pan: PanGesture,
    translate_x: f32,
    context_x: f32,
    scale: Spring,
    radius: Spring,
    border: Spring,
    balloon_x: Spring,
    label: String,
    label_value: i32,
    canvas: Canvas,
    renderer: Renderer,
}

impl CubertoSlider {
    /// The track's top-left corner: the screen's centre less half the track.
    fn origin(&self) -> (f32, f32) {
        ((self.size.0 - SLIDER_WIDTH) / 2.0, (self.size.1 - SLIDER_HEIGHT) / 2.0)
    }
    fn clamped(&self) -> f32 {
        self.translate_x.clamp(0.0, SLIDER_WIDTH)
    }
    fn press(&mut self, down: bool) {
        let (s, r, b) = if down { (1.0, PICKER_SIZE as f64 / 2.0, 4.0) } else { (DEFAULT_SCALE, DEFAULT_RADIUS, DEFAULT_BORDER) };
        self.scale.to(s, self.scale.velocity, GENTLE);
        self.radius.to(r, self.radius.velocity, GENTLE);
        self.border.to(b, self.border.velocity, GENTLE);
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

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The picker's box (50 × 50 at the clamped x, scaled about its centre) is its hit area.
        let (ox, oy) = self.origin();
        let half = PICKER_SIZE / 2.0 * self.scale.value as f32;
        let (cx, cy) = (ox + self.clamped(), oy + SLIDER_HEIGHT / 2.0);
        let hit = (x - cx).abs() <= half && (y - cy).abs() <= half;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { .. } => {
                self.press(true);
                self.context_x = self.clamped();
            }
            Event::Start(p) | Event::Update(p) => self.translate_x = self.context_x + p.translation_x,
            Event::End(_) | Event::Fail => {
                // onTouchesUp (a cancelled touch lets go the same way).
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
        let x = self.clamped();
        // balloonSliderX: withSpring(clampedTranslateX), re-run as x moves.
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
        let (ox, oy) = self.origin();
        // The balloon is a Skia Path (sRGB); the bar and the picker's border are RN Views,
        // whose colour the app reads as Display P3 (`Color::view_hex`).
        let color = Paint::fill(Color::hex(PRIMARY_COLOR));
        let view_color = Paint::fill(Color::view_hex(PRIMARY_COLOR));
        let c = &mut self.canvas;
        c.begin(frame.scale);
        // The track: #E5E5E5, radius 5 (continuous; 4 tall, so 2).
        c.draw_rrect(ox, oy, SLIDER_WIDTH, SLIDER_HEIGHT, 5.0, &Paint::fill(Color::hex(0xE5E5E5)));
        // The balloon, behind the bar and the picker.
        let bx = self.balloon_x.value as f32;
        let rotate = -std::f32::consts::FRAC_PI_2 + (BALLOON_HEIGHT + BALLOON_BOTTOM).atan2(bx - x);
        let saved = c.matrix();
        c.translate(ox + bx, oy + SLIDER_HEIGHT - BALLOON_BOTTOM - BALLOON_HEIGHT / 2.0);
        c.rotate(-rotate);
        c.translate(-BALLOON_WIDTH / 2.0, -BALLOON_HEIGHT / 2.0);
        if let Some(path) = &self.balloon {
            let inner = c.matrix();
            c.concat(fit_box(Rect::new(0.0, 0.0, 543.0, 711.0), Rect::new(0.0, 0.0, BALLOON_WIDTH, BALLOON_HEIGHT)));
            c.draw_path(path, &color);
            c.set_matrix(inner);
        }
        if let Some(font) = &self.font {
            let m = font.metrics();
            // The text box: the balloon less 10 at the bottom; its line centred in it.
            let box_height = BALLOON_HEIGHT - 10.0;
            let baseline = box_height / 2.0 - (m.ascent + m.descent) / 2.0;
            let w = font.advance_width(&self.label);
            c.draw_text(&self.label, BALLOON_WIDTH / 2.0 - w / 2.0, baseline, font, &Paint::fill(Color::WHITE));
        }
        c.set_matrix(saved);
        // The progress: the full-width bar scaled from its left edge.
        c.draw_rect(ox, oy, x, SLIDER_HEIGHT, &view_color);
        // The picker: a white square with a border, rounded, scaled about its centre.
        let (s, r, b) = (self.scale.value as f32, self.radius.value as f32, self.border.value as f32);
        c.translate(ox + x, oy + SLIDER_HEIGHT / 2.0);
        c.scale(s, s);
        let half = PICKER_SIZE / 2.0;
        c.draw_rrect(-half, -half, PICKER_SIZE, PICKER_SIZE, r, &view_color);
        c.draw_rrect(-half + b, -half + b, PICKER_SIZE - 2.0 * b, PICKER_SIZE - 2.0 * b, (r - b).max(0.0), &Paint::fill(Color::WHITE));
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
        // #6141B9: the balloon (Skia) as is, the bar and the picker (Views) read as P3.
        let purple = |p: [u8; 4]| p[0] == 0x61 && p[1] == 0x41 && p[2] == 0xB9;
        let view_purple = |p: [u8; 4]| p[..3] == [103, 63, 192];
        // The track from x 50 to 350 at y 198–202; the picker at x 50, its border 16 × 0.7.
        assert_eq!(img.at(500, 400)[..3], [0xE5, 0xE5, 0xE5], "{:?}", img.at(500, 400));
        assert!(view_purple(img.at(100 - 30, 400)), "border {:?}", img.at(70, 400));
        assert_eq!(img.at(100, 400)[..3], [255, 255, 255], "inside {:?}", img.at(100, 400));
        // The balloon over the picker: its body's centre 40 + ~43 above the track.
        assert!(purple(img.at(100, 180)), "balloon {:?}", img.at(100, 180));
        let pointer = |phase, x, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 200.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 50.0, 0.0));
        let mut ms = 0.0;
        for i in 1..=10 {
            s.input(&pointer(PointerPhase::Move, 50.0 + 15.0 * i as f32, ms));
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("cuberto-dragging");
        // Mid-drag: the picker grown (border 4) at x 200, the balloon behind it, leaning.
        let report: String = s.agent("{}").unwrap();
        assert!(report.starts_with("{\"value\":50,\"x\":150,"), "{report}");
        assert!(view_purple(img.at(300, 400)), "progress {:?}", img.at(300, 400));
        assert_eq!(img.at(2 * 200 - 20, 400)[..3], [255, 255, 255], "picker inside {:?}", img.at(380, 400));
        s.input(&pointer(PointerPhase::Up, 200.0, ms));
        let mut animating = true;
        let mut last = img;
        while animating && ms < 5000.0 {
            ms += 16.0;
            let (img, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            last = img;
            animating = a;
        }
        last.save("cuberto-dropped");
        // At rest: the balloon upright over the picker at x 200.
        assert!(purple(last.at(400, 180)), "balloon {:?}", last.at(400, 180));
        assert!(!purple(last.at(300, 180)), "left of the balloon {:?}", last.at(300, 180));
    }
}
