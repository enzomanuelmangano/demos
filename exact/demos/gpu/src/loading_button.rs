//! Loading Button (src/animations/loading-button: index.tsx, components/loading-button/index.tsx,
//! activity-indicator.tsx), the whole demo: a pill reading "Check Transaction" that turns into a
//! spinner and "Analyzing Transaction", then a check and "Transaction Safe" (or a lock and
//! "Transaction Unsafe", every other time), and back after 1.5 s.
//!
//! Why it is all here: in RN the pill's width follows Yoga every frame (the indicator's box
//! animates its width, height and marginRight through useAnimatedStyle, 200 ms inOut(quad), and
//! Reanimated commits each frame's layout), while the title's own width changes at once (a
//! Text, no layout animation; `key="text"` keeps it mounted, so its FadeIn plays only at
//! mount). The PressableScale's `layout={LinearTransition.springify()}` moves nothing visible:
//! on the RN app every recorded frame of every transition (idle → loading mid-growth, loading →
//! success, success → idle) has the pill centred on Yoga's frame to the pixel (left + right =
//! 1259 px). The Contract port eased the row and the title through 200 ms layout transitions
//! and sprang the button: a title change (loading → success) narrowed the pill over 200 ms
//! where RN's jumps, so its right edge stood out by the eased remainder (about 15 px
//! mid-animation), and the spring held the pill off centre.
//!
//! - The pill: a row, paddingHorizontal 12, 40 tall, radius 16 continuous, background
//!   Color(activeColor).lighten(0.6) with `transition: 'backgroundColor 200ms'` (CSS ease);
//!   centred in the white screen (Yoga rounds its edges to the pixel grid).
//! - The indicator's box: progress = withTiming(status == idle ? 0 : 1, 200 ms); width and
//!   height 20 × progress, marginRight 6 × progress, clipping the 20 pt canvas; the row centres
//!   it. The canvas: below.
//! - The title: bold 14 in activeColor (at once), a Text node (its box the measured size
//!   rounded up to the pixel, its position floored to the grid, its baseline on the next pixel
//!   row). FadeIn (300 ms inOut(quad)) at mount.
//! - PressableScale: scale 0.96 while pressed (250 ms, bezier(0.25, 0.1, 0.25, 1)) about the
//!   animated frame's centre; a press inside posts the app's selection haptic and runs
//!   handlePress: ignored while isLoading; else status loading, 2000 ms later success (even
//!   calls) or error, isLoading false, and 1500 ms after that reset() (idle). The press is the
//!   shared `pressto::Pressable`. As in RN, a press
//!   during the outcome starts again and the earlier reset timer still fires.
//!
//! Loading Button's ActivityIndicator (src/animations/loading-button/components/loading-button/
//! activity-indicator.tsx): a 20 pt canvas (size 20, strokeWidth max(2, 20 / 8) = 2.5) in the
//! status's colour (colorFromStatusMap: idle and loading #47A1E6, success #5BC682, error
//! #CD5454; it changes at once).
//!
//! - Loading group (opacity: withTiming(loading ? 1 : 0, { duration: 200 })): a quarter arc
//!   (addArc of the oval inset 1.25, 0° to 90°) stroked 2.5 with round caps, turning about the
//!   centre: withRepeat(withTiming(4π, { duration: 800, easing: linear }), -1) while loading,
//!   back to 0 at once otherwise; under it the ring (r 8.75, stroke 2.5) at opacity 0.08.
//! - Icon group (opacity: withTiming(success or error ? 1 : 0, { duration: 200 })): the disc
//!   (r 8.75, filled) and, for success or error, its white SVG (24 × 24 viewBox) fitted
//!   ("contain") into a 9 pt square in the middle (iconSize = size × 0.45). The icon follows the
//!   status at once, so it is gone while the disc fades out.
//!
//! The indicator's status colour changes at once; its timers are the demo's (above).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::{Easing, Timing};
use skia::{fit_box, path_from_svg, Canvas, Color, Font, Paint, Path, Rect, Renderer};

use crate::floating_modal::press_easing;
use crate::gfx;

const SIZE: f32 = 20.0;
const STROKE: f32 = 2.5;
const SVG_SIZE: f32 = 24.0;
/// One turn of the repeat: 4π in 800 ms.
const PERIOD_MS: f64 = 800.0;
/// handleMutation's `wait(2000)`.
const WAIT_MS: f64 = 2000.0;
/// handlePress's `setTimeout(reset, 1500)`.
const RESET_MS: f64 = 1500.0;
const SUCCESS: &str = "M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z";
const ERROR: &str = "M12 8c-1.062 0-2.073.211-3 .587v-3.587c0-1.654 1.346-3 3-3s3 1.346 3 3v1h2v-1c0-2.761-2.238-5-5-5-2.763 0-5 2.239-5 5v4.761c-1.827 1.466-3 3.714-3 6.239 0 4.418 3.582 8 8 8s8-3.582 8-8-3.582-8-8-8zm0 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2z";

/// The pill: height, paddingHorizontal, radius; the indicator's box and its margin at full.
const PILL_H: f64 = 40.0;
const PAD: f64 = 12.0;
const PILL_R: f32 = 16.0;
const GAP: f64 = 6.0;
/// colorFromStatusMap and Color(c).lighten(0.6).hex() (Display P3 components, 0…255).
const ACTIVE: [u32; 4] = [0x47A1E6, 0x47A1E6, 0x5BC682, 0xCD5454];
const LIGHT: [u32; 4] = [0xE6F2FC, 0xE6F2FC, 0xDCF3E4, 0xF4DADA];
const TITLES: [&str; 4] = ["Check Transaction", "Analyzing Transaction", "Transaction Safe", "Transaction Unsafe"];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(LoadingButton::new())
}

struct LoadingButton {
    size: (f64, f64),
    scale: f64,
    /// The last frame's time.
    last_now: f64,
    status: u8,
    is_loading: bool,
    /// i.current.
    calls: u32,
    /// When the repeat started (at the first frame after the status turned loading).
    spin_from: Option<Option<f64>>,
    loading: Timing,
    icon: Timing,
    /// The indicator box's progress.
    progress: Timing,
    /// The background colour's CSS transition: from, to, start (None until stamped).
    background: ([f64; 3], [f64; 3], Option<f64>),
    /// The title's FadeIn.
    fade: Timing,
    /// The pill's Yoga frame (x, width), as last drawn.
    yoga: (f64, f64),
    /// The PressableScale (the shared pressto machine).
    press: Pressable,
    /// The pending timers: armed (None until the next frame stamps them), then due at.
    settle_at: Option<Option<f64>>,
    reset_at: Option<Option<f64>>,
    posted: Vec<String>,
    arc: Path,
    success: Path,
    error: Path,
    title: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

fn color(status: u8) -> Color {
    match status {
        2 => Color::hex(0x5BC682),
        3 => Color::hex(0xCD5454),
        _ => Color::hex(0x47A1E6),
    }
}

fn components(rgb: u32) -> [f64; 3] {
    [((rgb >> 16) & 255) as f64, ((rgb >> 8) & 255) as f64, (rgb & 255) as f64]
}

/// Display P3 components (0…255) as the sRGB colour they make (`Color::view_hex`, unrounded).
fn p3(c: [f64; 3]) -> Color {
    let lin = |v: f64| {
        let v = v / 255.0;
        if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
    };
    let enc = |v: f64| {
        let v = v.clamp(0.0, 1.0);
        (if v <= 0.0031308 { 12.92 * v } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }) as f32
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    Color([enc(1.2249 * r - 0.2247 * g), enc(-0.0420 * r + 1.0419 * g), enc(-0.0197 * r - 0.0786 * g + 1.0979 * b), 1.0])
}

impl LoadingButton {
    fn new() -> LoadingButton {
        let mut arc = skia::path_builder();
        skia::add_arc(&mut arc, STROKE / 2.0, STROKE / 2.0, SIZE - STROKE, SIZE - STROKE, 0.0, 90.0);
        let light = components(LIGHT[0]);
        LoadingButton {
            size: (0.0, 0.0),
            scale: 3.0,
            last_now: 0.0,
            status: 0,
            is_loading: false,
            calls: 0,
            spin_from: None,
            loading: Timing::at(0.0),
            icon: Timing::at(0.0),
            progress: Timing::at(0.0),
            background: (light, light, None),
            fade: {
                let mut t = Timing::at(0.0);
                t.to(1.0, 300.0, Easing::timing_default());
                t
            },
            yoga: (0.0, 0.0),
            press: Pressable::new(),
            settle_at: None,
            reset_at: None,
            posted: Vec::new(),
            arc: arc.build(),
            success: path_from_svg(SUCCESS).unwrap_or_default(),
            error: path_from_svg(ERROR).unwrap_or_default(),
            title: skia::match_ui_font(14.0, 700.0),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    fn round(&self, v: f64) -> f64 {
        (v * self.scale).round() / self.scale
    }

    fn floor(&self, v: f64) -> f64 {
        (v * self.scale + 1e-4).floor() / self.scale
    }

    fn ceil(&self, v: f64) -> f64 {
        (v * self.scale - 1e-4).ceil() / self.scale
    }

    /// setStatus: the indicator's derived timings and the effect, the box's progress, the
    /// background's transition.
    fn set_status(&mut self, status: u8) {
        if status == self.status {
            return;
        }
        let was = self.status;
        self.status = status;
        let loading = if status == 1 { 1.0 } else { 0.0 };
        let icon = if status >= 2 { 1.0 } else { 0.0 };
        if self.loading.target() != loading {
            self.loading.to(loading, 200.0, Easing::timing_default());
        }
        if self.icon.target() != icon {
            self.icon.to(icon, 200.0, Easing::timing_default());
        }
        let progress = if status == 0 { 0.0 } else { 1.0 };
        if self.progress.target() != progress {
            self.progress.to(progress, 200.0, Easing::timing_default());
        }
        self.spin_from = if status == 1 { Some(None) } else { None };
        if LIGHT[was as usize] != LIGHT[status as usize] {
            let (from, to, at) = self.background;
            let now = self.background_now(from, to, at);
            self.background = (now, components(LIGHT[status as usize]), None);
        }
    }

    /// The background colour at the last frame (the transition's ease, 200 ms).
    fn background_now(&self, from: [f64; 3], to: [f64; 3], at: Option<f64>) -> [f64; 3] {
        let Some(at) = at else { return from };
        let t = ((self.last_now - at) / 200.0).clamp(0.0, 1.0);
        let e = press_easing().at(t);
        [0, 1, 2].map(|k| from[k] + (to[k] - from[k]) * e)
    }

    /// handlePress.
    fn handle_press(&mut self) {
        if self.is_loading {
            return;
        }
        self.is_loading = true;
        self.set_status(1);
        self.settle_at = Some(None);
    }

    /// The pill's Yoga frame (x, width) for the current progress and title.
    fn layout(&self) -> (f64, f64) {
        let p = self.progress.value;
        let text = self.text_width();
        let w = PAD * 2.0 + (SIZE as f64 + GAP) * p + text;
        let x0 = self.round((self.size.0 - w) / 2.0);
        let x1 = self.round((self.size.0 + w) / 2.0);
        (x0, x1 - x0)
    }

    fn text_width(&self) -> f64 {
        self.title.as_ref().map_or(0.0, |f| self.ceil(f.advance_width(TITLES[self.status as usize]) as f64))
    }

    /// The pill's top.
    fn top(&self) -> f64 {
        self.round((self.size.1 - PILL_H) / 2.0)
    }
}

impl Surface for LoadingButton {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"status\":{},\"loadingOpacity\":{},\"iconOpacity\":{},\"pill\":[{:.2},{:.2}],\"held\":{}}}",
            self.status, self.loading.value, self.icon.value, self.yoga.0, self.yoga.1, self.press.is_pressed()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, .. } = *event else { return };
        let (ox, ow) = self.yoga;
        let top = self.top();
        let inside = (ox..=ox + ow).contains(&(x as f64)) && (top..=top + PILL_H).contains(&(y as f64));
        if let Some(PressEvent::Press(press)) = self.press.pointer(id, gfx::phase(phase), inside) {
            self.posted.extend(press.global_message().map(String::from));
            self.handle_press();
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
        self.size = (frame.width as f64, frame.height as f64);
        self.scale = frame.scale as f64;
        let now = frame.now_ms;
        self.last_now = now;
        if self.background.2.is_none() && self.background.0 != self.background.1 {
            self.background.2 = Some(now);
        }
        // index.tsx's timers.
        let mut moving = false;
        for k in 0..2 {
            let (slot, delay) = if k == 0 { (&mut self.settle_at, WAIT_MS) } else { (&mut self.reset_at, RESET_MS) };
            if let Some(due) = slot {
                let due = *due.get_or_insert(now + delay);
                if now >= due {
                    *slot = None;
                    if k == 0 {
                        // mutateAsync resolves (even calls) or throws; isLoading false; the
                        // reset's setTimeout.
                        let outcome = if self.calls % 2 == 0 { 2 } else { 3 };
                        self.calls += 1;
                        self.set_status(outcome);
                        self.is_loading = false;
                        self.reset_at = Some(None);
                    } else {
                        self.set_status(0);
                        self.is_loading = false;
                    }
                } else {
                    moving = true;
                }
            }
        }
        moving |= self.loading.step(now) | self.icon.step(now) | self.progress.step(now) | self.fade.step(now) | self.press.step(now);
        // Yoga's frame, every frame.
        let yoga = self.layout();
        self.yoga = yoga;
        if let Some(at) = self.background.2 {
            moving |= now - at < 200.0;
        }
        let rotation = match &mut self.spin_from {
            Some(start) => {
                moving = true;
                let start = *start.get_or_insert(now);
                4.0 * std::f64::consts::PI * ((now - start).rem_euclid(PERIOD_MS) / PERIOD_MS)
            }
            None => 0.0,
        };

        let status = self.status;
        let (ox, ow) = yoga;
        let pill_w = yoga.1 as f32;
        let top = self.top() as f32;
        let p = self.progress.value;
        let boxw = self.round(PAD + SIZE as f64 * p) - PAD;
        let box_top = self.round((PILL_H - SIZE as f64 * p) / 2.0) as f32;
        let text_left = self.floor(PAD + (SIZE as f64 + GAP) * p) as f32;
        let (from, to, at) = self.background;
        let bg = p3(self.background_now(from, to, at));
        let fade = self.fade.value as f32;
        let press = self.press.scale() as f32;
        let title = TITLES[status as usize];
        let text_top = self.title.as_ref().map(|f| {
            let m = f.metrics();
            let th = self.ceil((-m.ascent + m.descent + m.leading) as f64);
            let t = self.floor((PILL_H - th) / 2.0);
            self.ceil(t - m.ascent as f64) as f32
        });

        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::WHITE);
        c.save();
        // PressableScale: its animated frame, scaled about its centre.
        c.translate((ox + ow / 2.0) as f32, top + PILL_H as f32 / 2.0);
        c.scale(press, press);
        c.translate(-(ow / 2.0) as f32, -(PILL_H as f32) / 2.0);
        c.draw_continuous_rrect(0.0, 0.0, pill_w, PILL_H as f32, PILL_R, &Paint::fill(bg));
        // The indicator's box, clipping its 20 pt canvas.
        if boxw > 0.0 {
            c.save();
            c.translate(PAD as f32, box_top);
            c.clip_rect(0.0, 0.0, boxw as f32, boxw as f32);
            draw_indicator(c, status, rotation, self.loading.value as f32, self.icon.value as f32, &self.arc, &self.success, &self.error);
            c.restore();
        }
        if let (Some(font), Some(baseline)) = (self.title.as_ref(), text_top) {
            c.draw_text(title, text_left, baseline, font, &Paint::fill(p3(components(ACTIVE[status as usize]))).with_opacity(fade));
        }
        c.restore();
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::WHITE);
        moving || self.press.is_animating()
    }
}

/// The ActivityIndicator's canvas, at its origin.
#[allow(clippy::too_many_arguments)]
fn draw_indicator(canvas: &mut Canvas, status: u8, rotation: f64, loading: f32, icon: f32, arc: &Path, success: &Path, error: &Path) {
    let c = color(status);
    let center = SIZE / 2.0;
    let radius = center - STROKE / 2.0;
    // <Group opacity={loadingOpacity}>.
    canvas.save();
    canvas.opacity(loading);
    canvas.save();
    canvas.translate(center, center);
    canvas.rotate(rotation as f32);
    canvas.translate(-center, -center);
    canvas.draw_path(arc, &Paint::stroke(c, STROKE).caps(skia::Cap::Round, skia::Join::Miter));
    canvas.restore();
    canvas.draw_circle(center, center, radius, &Paint::stroke(c, STROKE).with_opacity(0.08));
    canvas.restore();
    // <Group opacity={iconOpacity}>.
    canvas.save();
    canvas.opacity(icon);
    canvas.draw_circle(center, center, radius, &Paint::fill(c));
    let svg = match status {
        2 => Some(success),
        3 => Some(error),
        _ => None,
    };
    if let Some(svg) = svg {
        // fitbox('contain', rect(0, 0, 24, 24), rect(offset, offset, iconSize, iconSize)).
        let icon_size = SIZE * 0.45;
        let offset = (SIZE - icon_size) / 2.0;
        canvas.save();
        canvas.concat(fit_box(Rect::new(0.0, 0.0, SVG_SIZE, SVG_SIZE), Rect::new(offset, offset, icon_size, icon_size)));
        canvas.draw_path(svg, &Paint::fill(Color::WHITE));
        canvas.restore();
    }
    canvas.restore();
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_press_loads_settles_and_resets() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let pointer = |phase, at_ms| InputEvent::Pointer { id: 1, phase, x: 210.0, y: 456.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut s = surface();
        let mut ms = 0.0;
        while ms < 500.0 {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 16.0;
        }
        let (idle, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&idle, "loading-button-idle", [255, 255, 255]);
        assert!(!moving);
        s.input(&pointer(PointerPhase::Down, ms));
        s.input(&pointer(PointerPhase::Up, ms + 60.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert!(s.agent("{}").unwrap().contains("\"status\":1"));
        // A second press while loading does nothing.
        s.input(&pointer(PointerPhase::Down, ms + 100.0));
        s.input(&pointer(PointerPhase::Up, ms + 160.0));
        let t0 = ms;
        while ms < t0 + 2100.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"status\":2"), "{state}");
        let (safe, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&safe, "loading-button-safe", [255, 255, 255]);
        while ms < t0 + 6000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"status\":0"), "{state}");
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert_eq!(back.data, idle.data);
    }

    #[test]
    fn the_title_jumps_and_the_indicator_grows_in_layout() {
        let mut s = LoadingButton::new();
        s.size = (420.0, 912.0);
        let (x0, w0) = s.layout();
        s.handle_press();
        // The title's width changes at once; the indicator's box is still 0.
        let (x1, w1) = s.layout();
        assert!(w1 > w0 && x1 < x0);
        s.progress.value = 0.5;
        let (_, w2) = s.layout();
        assert!((w2 - w1 - 13.0).abs() < 0.34, "{w2} {w1}");
    }
}
