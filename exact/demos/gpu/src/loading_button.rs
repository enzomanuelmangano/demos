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
//! The input is the status: 0 idle, 1 loading, 2 success, 3 error. The box that clips the
//! canvas (its width, height and margin from 0 to 20 / 6) is the Contract's.
//!
//! index.tsx's timers run here, on the frame clock the spinner already keeps (a demo is no
//! Contract root, so it may own no task): 2000 ms after the status turns loading the surface
//! posts `settle` (`await wait(2000)` resolving), 1500 ms after it turns success or error
//! `reset` (the `setTimeout(reset, 1500)`). As in RN, neither is cancelled by a later status:
//! a press during the outcome still resets at the first timeout's time.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Easing, Timing};
use skia::{fit_box, path_from_svg, Canvas, Color, Paint, Path, Rect, Renderer};

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

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let mut arc = skia::path_builder();
    skia::add_arc(&mut arc, STROKE / 2.0, STROKE / 2.0, SIZE - STROKE, SIZE - STROKE, 0.0, 90.0);
    Box::new(LoadingButton {
        status: None,
        spin_from: None,
        loading: Timing::at(0.0),
        icon: Timing::at(0.0),
        arc: arc.build(),
        settle_at: None,
        reset_at: None,
        posted: Vec::new(),
        success: path_from_svg(SUCCESS).unwrap_or_default(),
        error: path_from_svg(ERROR).unwrap_or_default(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct LoadingButton {
    status: Option<u8>,
    /// When the repeat started (at the first frame after the status turned loading).
    spin_from: Option<Option<f64>>,
    loading: Timing,
    icon: Timing,
    /// The pending timers: armed (None until the next frame stamps them), then due at.
    settle_at: Option<Option<f64>>,
    reset_at: Option<Option<f64>>,
    posted: Vec<String>,
    arc: Path,
    success: Path,
    error: Path,
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

impl Surface for LoadingButton {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let status = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0).clamp(0.0, 3.0) as u8;
        if self.status == Some(status) {
            return Ok(());
        }
        let first = self.status.is_none();
        self.status = Some(status);
        let loading = if status == 1 { 1.0 } else { 0.0 };
        let icon = if status >= 2 { 1.0 } else { 0.0 };
        if first {
            // A derived withTiming starts where it is going.
            self.loading.set(loading);
            self.icon.set(icon);
        } else {
            self.loading.to(loading, 200.0, Easing::timing_default());
            self.icon.to(icon, 200.0, Easing::timing_default());
        }
        // The effect: the repeat while loading, else cancelAnimation and 0.
        self.spin_from = if status == 1 { Some(None) } else { None };
        if !first {
            match status {
                1 => self.settle_at = Some(None),
                2 | 3 => self.reset_at = Some(None),
                _ => {}
            }
        }
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"status\":{},\"loadingOpacity\":{},\"iconOpacity\":{}}}", self.status.unwrap_or(0), self.loading.value, self.icon.value))
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
        let status = self.status.unwrap_or(0);
        let mut moving = self.loading.step(frame.now_ms);
        moving |= self.icon.step(frame.now_ms);
        for (slot, delay, message) in [(&mut self.settle_at, WAIT_MS, "settle"), (&mut self.reset_at, RESET_MS, "reset")] {
            if let Some(due) = slot {
                let due = *due.get_or_insert(frame.now_ms + delay);
                if frame.now_ms >= due {
                    *slot = None;
                    self.posted.push(message.to_string());
                } else {
                    moving = true;
                }
            }
        }
        let rotation = match &mut self.spin_from {
            Some(start) => {
                moving = true;
                let start = *start.get_or_insert(frame.now_ms);
                4.0 * std::f64::consts::PI * ((frame.now_ms - start).rem_euclid(PERIOD_MS) / PERIOD_MS)
            }
            None => 0.0,
        };
        let c = color(status);
        let center = SIZE / 2.0;
        let radius = center - STROKE / 2.0;
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        // <Group opacity={loadingOpacity}>.
        canvas.save();
        canvas.opacity(self.loading.value as f32);
        canvas.save();
        canvas.translate(center, center);
        canvas.rotate(rotation as f32);
        canvas.translate(-center, -center);
        canvas.draw_path(&self.arc, &Paint::stroke(c, STROKE).caps(skia::Cap::Round, skia::Join::Miter));
        canvas.restore();
        canvas.draw_circle(center, center, radius, &Paint::stroke(c, STROKE).with_opacity(0.08));
        canvas.restore();
        // <Group opacity={iconOpacity}>.
        canvas.save();
        canvas.opacity(self.icon.value as f32);
        canvas.draw_circle(center, center, radius, &Paint::fill(c));
        let icon = match status {
            2 => Some(&self.success),
            3 => Some(&self.error),
            _ => None,
        };
        if let Some(icon) = icon {
            // fitbox('contain', rect(0, 0, 24, 24), rect(offset, offset, iconSize, iconSize));
            // the SVG's own width and height (24) win over ImageSVG's box.
            let icon_size = SIZE * 0.45;
            let offset = (SIZE - icon_size) / 2.0;
            canvas.save();
            canvas.concat(fit_box(Rect::new(0.0, 0.0, SVG_SIZE, SVG_SIZE), Rect::new(offset, offset, icon_size, icon_size)));
            canvas.draw_path(icon, &Paint::fill(Color::WHITE));
            canvas.restore();
        }
        canvas.restore();
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
    fn it_spins_while_loading_then_shows_the_outcome() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // 20 pt at 3x, to look at.
        let frame = |now_ms| Frame { width: 20.0, height: 20.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (idle, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(!moving);
        assert!(idle.data.chunks(4).all(|p| p[3] == 0), "idle draws nothing");
        s.bind(&[Value::Number(1.0)], None).unwrap();
        fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        let (a, moving) = fixture::render(&gpu, s.as_mut(), &frame(316.0)).unwrap();
        a.save("loading-button-spin-a");
        assert!(moving);
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(416.0)).unwrap();
        b.save("loading-button-spin-b");
        assert_ne!(a.data, b.data, "the arc turns");
        // At 0 ms of a turn the arc covers the lower right: (x 55, y 30) at 3x is on it.
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(816.0)).unwrap();
        assert!(c.at(55, 30)[3] > 200, "{:?}", c.at(55, 30));
        assert!(s.messages().is_empty());
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(2016.0)).unwrap();
        assert!(moving);
        assert_eq!(s.messages(), vec!["settle".to_string()], "the wait resolves at 2 s");
        s.bind(&[Value::Number(2.0)], None).unwrap();
        fixture::render(&gpu, s.as_mut(), &frame(2100.0)).unwrap();
        let (d, moving) = fixture::render(&gpu, s.as_mut(), &frame(2400.0)).unwrap();
        d.save("loading-button-success");
        assert!(moving, "the reset's timeout is pending");
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(3600.0)).unwrap();
        assert!(!moving);
        assert_eq!(s.messages(), vec!["reset".to_string()]);
        // Green disc with the white check in its middle.
        let edge = d.at(30, 8);
        assert!(edge[1] > edge[0] && edge[3] == 255, "{edge:?}");
        assert_eq!(&d.at(30, 30)[..3], &[255, 255, 255]);
    }
}
