//! Audio Player (src/animations/audio-player: index.tsx, constants.ts, helpers/,
//! components/waveform-scrubber/index.tsx, waveform-sample/index.tsx,
//! use-current-playing-value.ts): a 22 s waveform of 50 bars that plays itself and is scrubbed
//! with a finger, on #1D1B2B, the whole window.
//!
//! - Layout: a column centred in the window: a row the scrubber's width (window × 0.95) of two
//!   pills (16:9 of 35 tall, radius 10, #474069, 15 below them) with the time ("0:ss", live) and
//!   "0:22" (14 bold, #D4D4D4, centred), then the scrubber (80 tall, radius 15, #474069,
//!   paddingHorizontal 18): 50 flex cells, a 3 pt bar (#D4D4D4, radius 15) centred in each,
//!   45 × max(value, 0.1) tall.
//! - The samples: pickNValuesFromDistribution(0, √½, 50) (Box–Muller of Math.random(), here a
//!   stream seeded by the canvas's input) normalised to 0…1.
//! - currentX: withTiming(contentWidth, 22 s, linear) at mount, contentWidth = scrubber − 20
//!   (waveformPaddingHorizontal, not the 36 of padding). A bar's `position` is
//!   contentWidth / 50 × i.
//! - The pan (on the scrubber): onBegin isDragging and touchedX = clamp(x, 0, contentWidth),
//!   onUpdate touchedX; a changed touchedX while dragging cancels the timing and sets currentX;
//!   onFinalize ends the drag and currentX times on to contentWidth over what remains, linear.
//! - Each bar, when its target changes: opacity withTiming(currentX > position ? 1 : 0.6) (300 ms,
//!   inOut(quad)); scaleY withSpring (Reanimated's default) of getNextScaleY: 1 unless dragging;
//!   1.4 near the finger (|currentX − position| < 20) and played, 0.9 played, 0.7 ahead. The
//!   scale is the view's, about its centre (the corners scale with it).
//! - The time: `0:${zeroPad(min(floor(currentX / contentWidth × 22), 22), 2)}`.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Easing, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

/// Palette.
const PRIMARY: u32 = 0x474069;
const BODY: u32 = 0xD4D4D4;
const BACKGROUND: u32 = 0x1D1B2B;
/// DURATION (s).
const DURATION: f64 = 22.0;
/// N_SAMPLES.
const N: usize = 50;
/// styles.timeContainer: height, aspectRatio, borderRadius, marginBottom.
const PILL_H: f32 = 35.0;
const PILL_W: f32 = 35.0 * 16.0 / 9.0;
const PILL_RADIUS: f32 = 10.0;
const PILL_GAP: f32 = 15.0;
/// styles.samplesContainer: height, borderRadius, paddingHorizontal.
const ROW_H: f32 = 80.0;
const ROW_RADIUS: f32 = 15.0;
const ROW_PADDING: f32 = 18.0;
/// waveformPaddingHorizontal.
const CONTENT_INSET: f64 = 20.0;
/// styles.sample: width, borderRadius; the 45 of its height.
const BAR_W: f32 = 3.0;
const BAR_RADIUS: f32 = 15.0;
const BAR_MAX: f32 = 45.0;

/// The demo's surface. Input: a seed for the waveform (Math.random()).
pub fn surface() -> Box<dyn Surface> {
    let font = skia::match_system_font(14.0, 700.0);
    let labels = (0..=DURATION as usize).map(|s| format!("0:{s:02}")).collect();
    Box::new(AudioPlayer {
        font,
        labels,
        seed: None,
        values: [0.0; N],
        width: 0.0,
        height: 0.0,
        current: Timing::at(0.0),
        started: false,
        dragging: false,
        touched: 0.0,
        pan: PanGesture::new(),
        opacity: std::array::from_fn(|_| Timing::at(0.6)),
        opacity_target: [None; N],
        scale: [Spring::at(1.0); N],
        scale_target: [None; N],
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct AudioPlayer {
    font: Option<Font>,
    /// "0:00" … "0:22".
    labels: Vec<String>,
    seed: Option<f64>,
    values: [f64; N],
    /// The window's width the layout is for.
    width: f32,
    height: f32,
    current: Timing,
    started: bool,
    dragging: bool,
    touched: f64,
    pan: PanGesture,
    opacity: [Timing; N],
    opacity_target: [Option<f64>; N],
    scale: [Spring; N],
    scale_target: [Option<f64>; N],
    canvas: Canvas,
    renderer: Renderer,
}

/// pickNValuesFromDistribution(0, √½, n), then normalizeArray.
fn waveform(seed: f64) -> [f64; N] {
    let mut random = gfx::Random::new(seed);
    let mut out = [0.0; N];
    for v in out.iter_mut() {
        *v = loop {
            let u = 1.0 - random.next();
            let w = 1.0 - random.next();
            let z = (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * w).cos();
            let value = z * std::f64::consts::FRAC_1_SQRT_2;
            if value.is_finite() {
                break value;
            }
        };
    }
    let (min, max) = out.iter().fold((f64::MAX, f64::MIN), |(a, b), &v| (a.min(v), b.max(v)));
    for v in out.iter_mut() {
        *v = (*v - min) / (max - min);
    }
    out
}

impl AudioPlayer {
    fn scrubber_width(&self) -> f64 {
        self.width as f64 * 0.95
    }
    fn content_width(&self) -> f64 {
        self.scrubber_width() - CONTENT_INSET
    }
    fn position(&self, i: usize) -> f64 {
        self.content_width() / N as f64 * i as f64
    }
    /// The scrubber's frame in the canvas: x, y.
    fn origin(&self, height: f32) -> (f32, f32) {
        let x = (self.width - self.scrubber_width() as f32) / 2.0;
        let top = (height - (PILL_H + PILL_GAP + ROW_H)) / 2.0;
        (x, top)
    }
    fn seconds(&self) -> f64 {
        self.current.value / self.content_width() * DURATION
    }
    fn label(&self) -> &str {
        let s = self.seconds().floor().clamp(0.0, DURATION) as usize;
        &self.labels[s]
    }
    fn play_from_here(&mut self) {
        let remaining = DURATION * (1.0 - self.current.value / self.content_width());
        let to = self.content_width();
        self.current.to(to, remaining * 1000.0, Easing::Linear);
    }
}

impl Surface for AudioPlayer {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        if self.seed != Some(seed) {
            self.seed = Some(seed);
            self.values = waveform(seed);
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"time\":\"{}\",\"x\":{:.2},\"dragging\":{},\"held\":{}}}", self.label(), self.current.value, self.dragging, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.width <= 0.0 {
            return;
        }
        let (ox, oy) = self.origin(self.height);
        let row_top = oy + PILL_H + PILL_GAP;
        let local_x = (x - ox) as f64;
        let on_row = (0.0..=self.scrubber_width()).contains(&local_x) && (row_top..=row_top + ROW_H).contains(&y);
        let clamp = |v: f64, w: f64| v.clamp(0.0, w);
        let w = self.content_width();
        let touch = |s: &mut AudioPlayer, v: f64| {
            // useAnimatedReaction on touchedX: only a change moves currentX.
            if v != s.touched && s.dragging {
                s.current.set(v);
            }
            s.touched = v;
        };
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, on_row) {
            Event::Begin { .. } => {
                // onBegin: touchedX then isDragging; the reaction sees both.
                let v = clamp(local_x, w);
                self.dragging = true;
                let changed = v != self.touched;
                self.touched = v;
                if changed {
                    self.current.set(v);
                }
            }
            Event::Start(_) | Event::Update(_) => touch(self, clamp(local_x, w)),
            Event::End(_) | Event::Fail => {
                self.dragging = false;
                self.play_from_here();
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
        self.width = frame.width;
        self.height = frame.height;
        let now = frame.now_ms;
        if !self.started {
            // The mount effect: withTiming(contentWidth, { duration: 22000, linear }).
            self.started = true;
            let to = self.content_width();
            self.current.to(to, DURATION * 1000.0, Easing::Linear);
        }
        let mut moving = self.current.step(now);
        let x = self.current.value;
        for i in 0..N {
            let position = self.position(i);
            let active = x > position;
            let opacity = if active { 1.0 } else { 0.6 };
            match self.opacity_target[i] {
                None => self.opacity[i].set(opacity),
                Some(t) if t != opacity => self.opacity[i].to(opacity, 300.0, Easing::timing_default()),
                _ => {}
            }
            self.opacity_target[i] = Some(opacity);
            let scale = if !self.dragging {
                1.0
            } else if (x - position).abs() < 20.0 && active {
                1.4
            } else if active {
                0.9
            } else {
                0.7
            };
            match self.scale_target[i] {
                None => self.scale[i].set(scale),
                Some(t) if t != scale => {
                    let v = self.scale[i].velocity;
                    self.scale[i].to(scale, v, GENTLE)
                }
                _ => {}
            }
            self.scale_target[i] = Some(scale);
            moving |= self.opacity[i].step(now);
            moving |= self.scale[i].step(now);
        }

        let (ox, oy) = self.origin(frame.height);
        let sw = self.scrubber_width() as f32;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::hex(BACKGROUND));
        let primary = Paint::fill(Color::hex(PRIMARY));
        c.draw_rrect(ox, oy, PILL_W, PILL_H, PILL_RADIUS, &primary);
        c.draw_rrect(ox + sw - PILL_W, oy, PILL_W, PILL_H, PILL_RADIUS, &primary);
        if let Some(font) = self.font.as_ref() {
            let body = Paint::fill(Color::hex(BODY));
            let top = oy + (PILL_H - gfx::line_height(font)) / 2.0;
            let baseline = gfx::baseline(font, top);
            let label = {
                let s = (x / (sw as f64 - CONTENT_INSET) * DURATION).floor().clamp(0.0, DURATION) as usize;
                &self.labels[s]
            };
            let lw = font.advance_width(label);
            c.draw_text(label, ox + (PILL_W - lw) / 2.0, baseline, font, &body);
            let end = &self.labels[DURATION as usize];
            let ew = font.advance_width(end);
            c.draw_text(end, ox + sw - PILL_W + (PILL_W - ew) / 2.0, baseline, font, &body);
        }
        let row_top = oy + PILL_H + PILL_GAP;
        c.draw_rrect(ox, row_top, sw, ROW_H, ROW_RADIUS, &primary);
        let cell = (sw - 2.0 * ROW_PADDING) / N as f32;
        for i in 0..N {
            let h = BAR_MAX * (self.values[i] as f32).max(0.1);
            let cx = ox + ROW_PADDING + cell * (i as f32 + 0.5);
            let cy = row_top + ROW_H / 2.0;
            c.save();
            c.translate(cx, cy);
            c.scale(1.0, self.scale[i].value as f32);
            c.draw_rrect(-BAR_W / 2.0, -h / 2.0, BAR_W, h, BAR_RADIUS, &Paint::fill(Color::hex(BODY)).with_opacity(self.opacity[i].value as f32));
            c.restore();
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn it_plays_and_scrubs() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(7.0)], None).unwrap();
        let (start, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        start.save("audio-player-start");
        assert!(moving, "it plays");
        // The background, the left pill (x 10.5…72.7, y 391…426), the scrubber below it.
        assert_eq!(&start.at(4, 4)[..3], &[0x1D, 0x1B, 0x2B]);
        assert_eq!(&start.at(2 * 14, 2 * 395)[..3], &[0x47, 0x40, 0x69]);
        assert_eq!(&start.at(2 * 210, 2 * 444)[..3], &[0x47, 0x40, 0x69]);
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:00\""));
        let mut ms = 0.0;
        while ms < 5500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:05\""), "{}", s.agent("{}").unwrap());

        // A finger down at the middle of the scrubber: currentX jumps there, the bars rescale.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 486.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mid = 10.5 + 0.5 * 379.0;
        s.input(&pointer(PointerPhase::Down, mid, ms));
        for _ in 0..40 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("audio-player-held");
        assert!(moving, "held");
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"dragging\":true") && state.contains("\"time\":\"0:11\""), "{state}");
        s.input(&pointer(PointerPhase::Up, mid, ms));
        fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        ms += 1000.0;
        fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:12\""), "{}", s.agent("{}").unwrap());
        while ms < 30000.0 {
            ms += 64.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving, "it stops at the end");
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:22\""));
    }
}
