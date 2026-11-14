//! Audio Player (src/animations/audio-player: index.tsx, constants.ts, helpers/,
//! components/waveform-scrubber/index.tsx, waveform-sample/index.tsx,
//! use-current-playing-value.ts): a 22 s waveform of 50 bars that plays itself and is scrubbed
//! with a finger, on #1D1B2B, the whole window.
//!
//! - Layout: a column centred in the window: a row the scrubber's width (window × 0.95) of two
//!   pills (16:9 of 35 tall, radius 10, #474069, 15 below them) with the time ("0:ss", live) and
//!   "0:22" (14 bold, #D4D4D4, centred), then the scrubber (80 tall, radius 15, #474069,
//!   paddingHorizontal 18): 50 flex cells, a 3 pt bar (#D4D4D4, radius 15) centred in each,
//!   45 × max(value, 0.1) tall. Every frame is Yoga's, rounded to the device pixel (`Layout`):
//!   the bars' edges are whole pixels, the Texts' frames floored left and ceiled right.
//! - Colours are RN View colours: the app sets `RCTColorSpace.displayP3`, so each hex is P3
//!   (`Color::view_hex`: #474069 shows as 72, 64, 108).
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
//! - The pills and the scrubber are `borderCurve: 'continuous'` (Apple's corner); the bars have
//!   no borderCurve (circular). Both times (a ReText TextInput and a Text) are laid out by UIKit
//!   (`skia::match_ui_font`: SF's tracking for 14 pt and its kerning).
//! - The waveform is computed when RN evaluates the demo's module, once per app launch: the
//!   stream is `env.seed`, also once per launch, so a second visit shows the same waveform in
//!   both.

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
    // The two times: an RN Text and a ReText (a TextInput), both laid out by UIKit.
    let font = skia::match_ui_font(14.0, 700.0);
    let labels = (0..=DURATION as usize)
        .map(|s| format!("0:{s:02}"))
        .collect();
    Box::new(AudioPlayer {
        font,
        labels,
        seed: None,
        values: [0.0; N],
        width: 0.0,
        height: 0.0,
        pixel_scale: 3.0,
        layout: Layout::new(0.0, 0.0, 3.0, &[0.0; N]),
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
    /// Device pixels per point.
    pixel_scale: f32,
    /// RN's layout of the column as Yoga rounds it to the device pixel grid (on a size change).
    layout: Layout,
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
    let (min, max) = out
        .iter()
        .fold((f64::MAX, f64::MIN), |(a, b), &v| (a.min(v), b.max(v)));
    for v in out.iter_mut() {
        *v = (*v - min) / (max - min);
    }
    out
}

/// Yoga's `roundValueToPixelGrid`: half up on the device grid, a Text's left floored and its
/// right ceiled.
fn grid(v: f64, scale: f64, ceil: bool, floor: bool) -> f64 {
    let s = v * scale;
    let f = s.rem_euclid(1.0);
    let r = if f.abs() < 1e-4 {
        s.floor()
    } else if (f - 1.0).abs() < 1e-4 {
        s.ceil()
    } else if ceil {
        s.ceil()
    } else if floor {
        s.floor()
    } else if f >= 0.5 {
        s.ceil()
    } else {
        s.floor()
    };
    r / scale
}

/// RN's frames (window points, as drawn): each node's position rounded relative to its parent,
/// its size from its rounded absolute edges (Yoga's roundLayoutResultsToPixelGrid).
struct Layout {
    content_width: f64,
    left_pill: (f32, f32, f32, f32),
    right_pill: (f32, f32, f32, f32),
    /// The two texts' x and width (width '100%' of their pill, rounded as a Text: the left
    /// floored, the right ceiled); their top.
    left_text: (f32, f32),
    right_text: (f32, f32),
    text_top: f32,
    row: (f32, f32, f32, f32),
    bars: [(f32, f32, f32, f32); N],
}

impl Layout {
    fn new(width: f32, height: f32, scale: f32, values: &[f64; N]) -> Layout {
        let k = scale as f64;
        let r = |v: f64| grid(v, k, false, false);
        let size = |a: f64, b: f64| r(b) - r(a);
        let text_size = |a: f64, b: f64| grid(b, k, true, false) - grid(a, k, false, true);
        let (w, h) = (width as f64, height as f64);
        let sw = w * 0.95;
        let pw = PILL_W as f64;
        let ph = PILL_H as f64;
        // The column: container centres it both ways.
        let (al, at) = (
            (w - sw) / 2.0,
            (h - (ph + PILL_GAP as f64 + ROW_H as f64)) / 2.0,
        );
        let (x0, y0) = (r(al), r(at));
        let left_pill = (x0, y0, size(al, al + pw), size(at, at + ph));
        let right_rel = sw - pw;
        let right_pill = (
            x0 + r(right_rel),
            y0,
            size(al + right_rel, al + sw),
            size(at, at + ph),
        );
        // A one-line Text centred in a 35 tall pill: its top floored.
        let font_line = 14.0 * (1950.0 + 494.0) / 2048.0;
        let text_top = y0 + grid((ph - font_line) / 2.0, k, false, true);
        let left_text = (left_pill.0, text_size(al, al + pw));
        let right_text = (right_pill.0, text_size(al + right_rel, al + sw));
        let row_rel = ph + PILL_GAP as f64;
        let row = (
            x0,
            y0 + r(row_rel),
            size(al, al + sw),
            size(at + row_rel, at + row_rel + ROW_H as f64),
        );
        let cell = (sw - 2.0 * ROW_PADDING as f64) / N as f64;
        let bars = std::array::from_fn(|i| {
            let bh = BAR_MAX as f64 * values[i].max(0.1);
            let cell_rel = ROW_PADDING as f64 + cell * i as f64;
            let (bl, bt) = ((cell - BAR_W as f64) / 2.0, (ROW_H as f64 - bh) / 2.0);
            let (ax, ay) = (al + cell_rel + bl, at + row_rel + bt);
            let x = row.0 + r(cell_rel) + r(bl);
            let y = row.1 + r(bt);
            (
                x as f32,
                y as f32,
                size(ax, ax + BAR_W as f64) as f32,
                size(ay, ay + bh) as f32,
            )
        });
        let f = |t: (f64, f64, f64, f64)| (t.0 as f32, t.1 as f32, t.2 as f32, t.3 as f32);
        Layout {
            content_width: sw - CONTENT_INSET,
            left_pill: f(left_pill),
            right_pill: f(right_pill),
            left_text: (left_text.0 as f32, left_text.1 as f32),
            right_text: (right_text.0 as f32, right_text.1 as f32),
            text_top: text_top as f32,
            row: f(row),
            bars,
        }
    }
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
            self.layout = Layout::new(self.width, self.height, self.pixel_scale, &self.values);
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
        Some(format!(
            "{{\"time\":\"{}\",\"x\":{:.2},\"dragging\":{},\"held\":{}}}",
            self.label(),
            self.current.value,
            self.dragging,
            self.pan.tracking()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        if self.width <= 0.0 {
            return;
        }
        // event.x is in the scrubber's own (pixel-snapped) frame.
        let (rx, ry, rw, rh) = self.layout.row;
        let local_x = (x - rx) as f64;
        let on_row = (rx..=rx + rw).contains(&x) && (ry..=ry + rh).contains(&y);
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
        if self.width != frame.width
            || self.height != frame.height
            || self.pixel_scale != frame.scale
        {
            self.width = frame.width;
            self.height = frame.height;
            self.pixel_scale = frame.scale;
            self.layout = Layout::new(self.width, self.height, self.pixel_scale, &self.values);
        }
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
            // Reanimated's frame: the running animations step first, then the reactions start
            // new ones from that frame's value (and, for withSpring, velocity) at its timestamp.
            self.opacity[i].step(now);
            self.scale[i].step(now);
            let position = self.position(i);
            let active = x > position;
            let opacity = if active { 1.0 } else { 0.6 };
            match self.opacity_target[i] {
                None => self.opacity[i].set(opacity),
                Some(t) if t != opacity => {
                    self.opacity[i].to(opacity, 300.0, Easing::timing_default())
                }
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
                // `scaleY.set(withSpring(target))` over a running spring: its velocity (dropped
                // when it points away), the start energy without it (spring.ts onStart).
                Some(t) if t != scale => self.scale[i].retarget(scale, GENTLE),
                _ => {}
            }
            self.scale_target[i] = Some(scale);
            moving |= self.opacity[i].step(now);
            moving |= self.scale[i].step(now);
        }

        let l = &self.layout;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::view_hex(BACKGROUND));
        let primary = Paint::fill(Color::view_hex(PRIMARY));
        for (px, py, pw, ph) in [l.left_pill, l.right_pill] {
            c.draw_continuous_rrect(px, py, pw, ph, PILL_RADIUS, &primary);
        }
        if let Some(font) = self.font.as_ref() {
            let body = Paint::fill(Color::view_hex(BODY));
            let baseline = gfx::baseline(font, l.text_top);
            let s = (x / l.content_width * DURATION)
                .floor()
                .clamp(0.0, DURATION) as usize;
            for (label, (bx, bw), field) in [
                (&self.labels[s], l.left_text, true),
                (&self.labels[DURATION as usize], l.right_text, false),
            ] {
                // textAlign center in the Text's (floored left, ceiled right) frame.
                let lw = font.advance_width(label);
                let mut tx = bx + (bw - lw) / 2.0;
                if field {
                    // The time is a ReText (a UITextField): its centred line starts on a whole
                    // device pixel (measured: 1/9 pt left of a Text's in the same frame).
                    tx = (tx * frame.scale).floor() / frame.scale;
                }
                c.draw_text(label, tx, baseline, font, &body);
            }
        }
        let (rx, ry, rw, rh) = l.row;
        c.draw_continuous_rrect(rx, ry, rw, rh, ROW_RADIUS, &primary);
        let bar = Color::view_hex(BODY);
        for i in 0..N {
            let (bx, by, bw, bh) = l.bars[i];
            // scaleY about the snapped frame's centre (the corners scale with it).
            c.save();
            c.translate(bx + bw / 2.0, by + bh / 2.0);
            c.scale(1.0, self.scale[i].value as f32);
            c.draw_rrect(
                -bw / 2.0,
                -bh / 2.0,
                bw,
                bh,
                BAR_RADIUS.min(bw / 2.0).min(bh / 2.0),
                &Paint::fill(bar).with_opacity(self.opacity[i].value as f32),
            );
            c.restore();
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
            wgpu::Color::BLACK,
        );
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
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 2.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(7.0)], None).unwrap();
        let (start, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        start.save("audio-player-start");
        assert!(moving, "it plays");
        // The background, the left pill (x 10.5…72.7, y 391…426), the scrubber below it, in the
        // sRGB that RN's Display P3 hex makes (#1D1B2B, #474069).
        assert_eq!(&start.at(4, 4)[..3], &[29, 27, 44]);
        assert_eq!(&start.at(2 * 14, 2 * 395)[..3], &[72, 64, 108]);
        assert_eq!(&start.at(2 * 210, 2 * 444)[..3], &[72, 64, 108]);
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:00\""));
        let mut ms = 0.0;
        while ms < 5500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(
            s.agent("{}").unwrap().contains("\"time\":\"0:05\""),
            "{}",
            s.agent("{}").unwrap()
        );

        // A finger down at the middle of the scrubber: currentX jumps there, the bars rescale.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 486.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
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
        assert!(
            state.contains("\"dragging\":true") && state.contains("\"time\":\"0:11\""),
            "{state}"
        );
        s.input(&pointer(PointerPhase::Up, mid, ms));
        fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        ms += 1000.0;
        fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(
            s.agent("{}").unwrap().contains("\"time\":\"0:12\""),
            "{}",
            s.agent("{}").unwrap()
        );
        while ms < 30000.0 {
            ms += 64.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving, "it stops at the end");
        assert!(s.agent("{}").unwrap().contains("\"time\":\"0:22\""));
    }
}
