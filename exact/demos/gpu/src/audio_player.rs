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
        card: None,
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
    /// The music player's waveform (the second input is `"card"`): see `Card`.
    card: Option<Box<Card>>,
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
    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        if inputs.get(1).and_then(|v| v.as_str()) == Some("card") {
            let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
            let card = self.card.get_or_insert_with(|| Box::new(Card::new(seed)));
            card.bind(inputs, at_ms);
            return Ok(());
        }
        let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        if self.seed != Some(seed) {
            self.seed = Some(seed);
            self.values = waveform(seed);
            self.layout = Layout::new(self.width, self.height, self.pixel_scale, &self.values);
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        // Asked before the first bind, when the mode is not known yet: the card's waveform is
        // transparent over the glass (the legacy demo fills its frame anyway).
        false
    }

    fn messages(&mut self) -> Vec<String> {
        match self.card.as_mut() {
            Some(card) => std::mem::take(&mut card.posted),
            None => Vec::new(),
        }
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        if let Some(card) = self.card.as_ref() {
            return Some(card.agent());
        }
        Some(format!(
            "{{\"time\":\"{}\",\"x\":{:.2},\"dragging\":{},\"held\":{}}}",
            self.label(),
            self.current.value,
            self.dragging,
            self.pan.tracking()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        if let Some(card) = self.card.as_mut() {
            card.input(event);
            return;
        }
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
        if let Some(card) = self.card.as_mut() {
            return card.render(frame, device, queue, encoder, target, format);
        }
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

// ---------------------------------------------------------------------------------------------
// The music player (the owner's phone note: "migliora il layout, Liquid Glass, musica vera,
// play/pausa, haptics sul pan"). audio-player.contract lays out the card (artwork, title, glass
// controls) and passes `audio_player(seed, "card", playing, duration, skip, wave, sync)`; this
// surface draws only the waveform and the two times, transparent, in its own frame, and owns
// the playhead so nothing commits per frame:
//
// - inputs: `playing` (bool), `duration` (seconds as text; "" until the `audio-track` native
//   view has read the file: NOMINAL), `skip` ("<token>:<seconds>", a new token moves the
//   playhead by that much), `wave` (50 comma-separated levels 0…1 the native view measured
//   from the file; "" keeps the seed's waveform), `sync` ("<token>:<seconds>", the player's
//   own clock about twice a second: a drift over 0.25 s is corrected, not within 0.8 s of a
//   seek of ours, whose answer may still be on the way).
// - messages: "audio-player:2" at the first bind (the Contract switches from the legacy
//   frame), "haptic:grab" at touch-down on the waveform, "haptic:tick" each bar the finger
//   crosses (at most one per 28 ms), "haptic:release" at the lift, "seek:<s>" when a scrub or a
//   skip moves the playhead, "ended" when it reaches the end while playing.
// - the bars: RN's look kept: played at full opacity, the rest at 0.35, each change over
//   300 ms inOut(quad); while a finger is down RN's scales (1.4 near it, 0.9 played, 0.7 ahead)
//   on the gentle spring; a new waveform grows each bar's height on the same spring.

/// The length shown before the file has reported its own (no file: the UI still plays).
const NOMINAL: f64 = 180.0;
/// The waveform's band and the times' line below it, in the surface's frame (points).
const WAVE_H: f32 = 52.0;
const CARD_BAR_W: f32 = 3.0;
const CARD_BAR_MAX: f32 = 44.0;
const TIME_GAP: f32 = 8.0;
const AHEAD_OPACITY: f64 = 0.35;
/// The finger's halo: bars within this many points of it grow (RN: 20).
const HALO: f64 = 20.0;
const TICK_MIN_MS: f64 = 28.0;
const SYNC_TOLERANCE: f64 = 0.25;
const SYNC_QUIET_MS: f64 = 800.0;

struct Card {
    seed_values: [f64; N],
    wave_text: String,
    height: [Spring; N],
    opacity: [Timing; N],
    opacity_target: [Option<f64>; N],
    scale: [Spring; N],
    scale_target: [Option<f64>; N],
    font: Option<Font>,
    playing: bool,
    duration: f64,
    /// The playhead: `base` seconds at `since` (ms), running while `since` is some.
    base: f64,
    since: Option<f64>,
    /// A play asked for before a clock was known: started at the next frame.
    start_pending: bool,
    skip_token: Option<String>,
    sync_token: Option<String>,
    quiet_until: f64,
    dragging: bool,
    pan: PanGesture,
    last_bar: Option<usize>,
    last_tick: f64,
    now: f64,
    width: f32,
    posted: Vec<String>,
    announced: bool,
    canvas: Canvas,
    renderer: Renderer,
}

/// "m:ss".
fn clock(seconds: f64) -> String {
    let s = seconds.max(0.0).floor() as u64;
    format!("{}:{:02}", s / 60, s % 60)
}

/// "<token>:<value>" → (token, value).
fn tokened(text: &str) -> Option<(&str, f64)> {
    let (token, value) = text.split_once(':')?;
    let value: f64 = value.trim().parse().ok()?;
    value.is_finite().then_some((token, value))
}

impl Card {
    fn new(seed: f64) -> Card {
        let values = waveform(seed);
        Card {
            seed_values: values,
            wave_text: String::new(),
            height: std::array::from_fn(|i| Spring::at(values[i])),
            opacity: std::array::from_fn(|_| Timing::at(AHEAD_OPACITY)),
            opacity_target: [None; N],
            scale: [Spring::at(1.0); N],
            scale_target: [None; N],
            font: skia::match_ui_font(12.0, 600.0),
            playing: false,
            duration: NOMINAL,
            base: 0.0,
            since: None,
            start_pending: false,
            skip_token: None,
            sync_token: None,
            quiet_until: f64::MIN,
            dragging: false,
            pan: PanGesture::new(),
            last_bar: None,
            last_tick: f64::MIN,
            now: 0.0,
            width: 0.0,
            posted: Vec::new(),
            announced: false,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    /// The playhead at `now` (seconds), held at the end.
    fn position(&self, now: f64) -> f64 {
        let at = match self.since {
            Some(since) => self.base + (now - since).max(0.0) / 1000.0,
            None => self.base,
        };
        at.clamp(0.0, self.duration)
    }

    /// Moves the playhead to `seconds` at `now`, still running if it was.
    fn place(&mut self, seconds: f64, now: f64) {
        self.base = seconds.clamp(0.0, self.duration);
        if self.since.is_some() {
            self.since = Some(now);
        }
    }

    fn seek_posted(&mut self, now: f64) {
        let at = self.position(now);
        self.posted.push(format!("seek:{at:.3}"));
        self.quiet_until = now + SYNC_QUIET_MS;
    }

    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) {
        if !self.announced {
            self.announced = true;
            self.posted.push("audio-player:2".into());
        }
        let now = at_ms.unwrap_or(self.now).max(self.now);
        self.now = now;
        let text = |i: usize| inputs.get(i).and_then(|v| v.as_str()).unwrap_or("");
        let duration = text(3)
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|d| d.is_finite() && *d > 0.5)
            .unwrap_or(NOMINAL);
        if duration != self.duration {
            let at = self.position(now);
            self.duration = duration;
            self.place(at, now);
        }
        let wave = text(5);
        if wave != self.wave_text {
            self.wave_text = wave.to_string();
            let levels: Vec<f64> = wave
                .split(',')
                .filter_map(|v| v.trim().parse::<f64>().ok())
                .filter(|v| v.is_finite())
                .collect();
            let target: [f64; N] = if levels.len() == N {
                std::array::from_fn(|i| levels[i].clamp(0.0, 1.0))
            } else {
                self.seed_values
            };
            for (spring, to) in self.height.iter_mut().zip(target) {
                spring.retarget(to, GENTLE);
            }
        }
        let playing = inputs.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
        if playing != self.playing {
            self.playing = playing;
            if playing {
                if self.position(now) >= self.duration - 0.05 {
                    // Play at the end starts over.
                    self.base = 0.0;
                    self.posted.push("seek:0".into());
                    self.quiet_until = now + SYNC_QUIET_MS;
                }
                if !self.dragging {
                    match at_ms {
                        Some(at) => self.since = Some(at),
                        None => self.start_pending = true,
                    }
                }
            } else {
                self.base = self.position(now);
                self.since = None;
                self.start_pending = false;
            }
        }
        if let Some((token, by)) = tokened(text(4)) {
            if self.skip_token.as_deref() != Some(token) {
                let first = self.skip_token.is_none();
                self.skip_token = Some(token.to_string());
                // The value at mount is no press.
                if !first && !self.dragging {
                    let at = self.position(now) + by;
                    self.place(at, now);
                    self.seek_posted(now);
                }
            }
        }
        if let Some((token, at)) = tokened(text(6)) {
            if self.sync_token.as_deref() != Some(token) {
                self.sync_token = Some(token.to_string());
                if self.playing
                    && !self.dragging
                    && now >= self.quiet_until
                    && (at - self.position(now)).abs() > SYNC_TOLERANCE
                {
                    self.place(at, now);
                }
            }
        }
    }

    fn agent(&self) -> String {
        format!(
            "{{\"mode\":\"card\",\"at\":{:.2},\"duration\":{:.2},\"playing\":{},\"dragging\":{},\"held\":{}}}",
            self.position(self.now),
            self.duration,
            self.playing,
            self.dragging,
            self.pan.tracking()
        )
    }

    fn scrub_to(&mut self, x: f32, now: f64) {
        if self.width <= 0.0 {
            return;
        }
        let f = (x / self.width).clamp(0.0, 1.0) as f64;
        self.base = f * self.duration;
        let bar = ((f * N as f64).floor() as usize).min(N - 1);
        if self.last_bar != Some(bar) {
            if self.last_bar.is_some() && now - self.last_tick >= TICK_MIN_MS {
                self.posted.push("haptic:tick".into());
                self.last_tick = now;
            }
            self.last_bar = Some(bar);
        }
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
        self.now = self.now.max(at_ms);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, true) {
            Event::Begin { x, .. } => {
                self.dragging = true;
                self.since = None;
                self.start_pending = false;
                self.last_bar = None;
                self.posted.push("haptic:grab".into());
                self.scrub_to(x, at_ms);
            }
            Event::Start(p) | Event::Update(p) => {
                if self.dragging {
                    self.scrub_to(p.x, at_ms);
                }
            }
            Event::End(_) | Event::Fail => {
                if self.dragging {
                    self.dragging = false;
                    self.posted.push("haptic:release".into());
                    self.seek_posted(at_ms);
                    if self.playing && self.base < self.duration {
                        self.since = Some(at_ms);
                    }
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
        let now = frame.now_ms;
        self.now = now;
        self.width = frame.width;
        if self.start_pending {
            self.start_pending = false;
            if self.playing && !self.dragging {
                self.since = Some(now);
            }
        }
        if self.since.is_some() && self.position(now) >= self.duration {
            self.base = self.duration;
            self.since = None;
            self.posted.push("ended".into());
        }
        let at = self.position(now);
        let w = frame.width as f64;
        let x = if self.duration > 0.0 {
            at / self.duration * w
        } else {
            0.0
        };
        let pitch = w / N as f64;
        let mut moving = self.since.is_some() || self.pan.tracking();
        for i in 0..N {
            self.opacity[i].step(now);
            self.scale[i].step(now);
            // The bar's own centre: played once the playhead has reached it.
            let centre = pitch * (i as f64 + 0.5);
            let played = x >= centre;
            let opacity = if played { 1.0 } else { AHEAD_OPACITY };
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
            } else if (x - centre).abs() < HALO && played {
                1.4
            } else if played {
                0.9
            } else {
                0.7
            };
            match self.scale_target[i] {
                None => self.scale[i].set(scale),
                Some(t) if t != scale => self.scale[i].retarget(scale, GENTLE),
                _ => {}
            }
            self.scale_target[i] = Some(scale);
            moving |= self.opacity[i].step(now);
            moving |= self.scale[i].step(now);
            moving |= self.height[i].step(now);
        }

        let c = &mut self.canvas;
        c.begin(frame.scale);
        let snap = |v: f32| (v * frame.scale).round() / frame.scale;
        let mid = WAVE_H / 2.0;
        for i in 0..N {
            let h = (CARD_BAR_MAX as f64 * self.height[i].value.max(0.08)) as f32;
            let cx = snap((pitch * (i as f64 + 0.5)) as f32 - CARD_BAR_W / 2.0) + CARD_BAR_W / 2.0;
            c.save();
            c.translate(cx, mid);
            c.scale(1.0, self.scale[i].value as f32);
            c.draw_rrect(
                -CARD_BAR_W / 2.0,
                -h / 2.0,
                CARD_BAR_W,
                h,
                (CARD_BAR_W / 2.0).min(h / 2.0),
                &Paint::fill(Color::WHITE).with_opacity(self.opacity[i].value as f32),
            );
            c.restore();
        }
        if let Some(font) = self.font.as_ref() {
            let alpha = if self.dragging { 0.9 } else { 0.6 };
            let paint = Paint::fill(Color::WHITE).with_opacity(alpha);
            let baseline = gfx::baseline(font, WAVE_H + TIME_GAP);
            let elapsed = clock(at);
            let remaining = format!("-{}", clock((self.duration - at).max(0.0).ceil()));
            c.draw_text(&elapsed, 0.0, baseline, font, &paint);
            let rw = font.advance_width(&remaining);
            c.draw_text(&remaining, frame.width - rw, baseline, font, &paint);
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

    #[test]
    fn the_card_plays_scrubs_and_skips() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 320.0,
            height: 80.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let text = |t: &str| Value::from(t.to_string());
        let inputs = |playing: bool, duration: &str, skip: &str, sync: &str| {
            vec![
                Value::Number(7.0),
                text("card"),
                Value::Bool(playing),
                text(duration),
                text(skip),
                text(""),
                text(sync),
            ]
        };
        let at = |s: &mut Box<dyn Surface>| -> f64 {
            let a = s.agent("{}").unwrap();
            let i = a.find("\"at\":").unwrap() + 5;
            a[i..].split(',').next().unwrap().parse().unwrap()
        };
        let mut s = surface();
        s.bind(&inputs(false, "", "0:0", "0:0"), Some(0.0)).unwrap();
        assert_eq!(s.messages(), vec!["audio-player:2".to_string()]);
        let (still, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        still.save("audio-player-card");
        assert!(!moving, "paused, nothing moves");
        assert!(s.agent("{}").unwrap().contains("\"duration\":180.00"));
        // Transparent between the bars.
        assert_eq!(still.at(1, 1)[3], 0);

        // The file's length, then play for 2 s.
        s.bind(&inputs(true, "200.5", "0:0", "0:0"), Some(100.0))
            .unwrap();
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(2100.0)).unwrap();
        assert!(moving);
        assert!(
            (at(&mut s) - 2.0).abs() < 0.01,
            "{}",
            s.agent("{}").unwrap()
        );
        // A skip of +15.
        s.bind(&inputs(true, "200.5", "1:15", "0:0"), Some(2100.0))
            .unwrap();
        assert_eq!(s.messages(), vec!["seek:17.000".to_string()]);
        // The player's clock 1 s behind is not trusted right after our seek...
        s.bind(&inputs(true, "200.5", "1:15", "1:16"), Some(2200.0))
            .unwrap();
        assert!((at(&mut s) - 17.1).abs() < 0.01);
        // ...but later it corrects the drift.
        s.bind(&inputs(true, "200.5", "1:15", "2:30"), Some(4000.0))
            .unwrap();
        fixture::render(&gpu, s.as_mut(), &frame(4000.0)).unwrap();
        assert!(
            (at(&mut s) - 30.0).abs() < 0.01,
            "{}",
            s.agent("{}").unwrap()
        );

        // A scrub: grab at the middle, across a few bars, lift.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 26.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&pointer(PointerPhase::Down, 160.0, 4000.0));
        let mut ms = 4000.0;
        for k in 1..=10 {
            ms += 50.0;
            s.input(&pointer(PointerPhase::Move, 160.0 + k as f32 * 8.0, ms));
        }
        let (held, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("audio-player-card-held");
        assert!(s.agent("{}").unwrap().contains("\"dragging\":true"));
        s.input(&pointer(PointerPhase::Up, 240.0, ms));
        let messages = s.messages();
        assert_eq!(messages.first().map(String::as_str), Some("haptic:grab"));
        let ticks = messages.iter().filter(|m| *m == "haptic:tick").count();
        assert!(ticks >= 8, "{messages:?}");
        assert_eq!(
            &messages[messages.len() - 2..],
            &["haptic:release".to_string(), "seek:150.375".to_string()]
        );
        // Still playing from there.
        fixture::render(&gpu, s.as_mut(), &frame(ms + 1000.0)).unwrap();
        assert!(
            (at(&mut s) - 151.375).abs() < 0.01,
            "{}",
            s.agent("{}").unwrap()
        );
        // It ends, and play again starts over.
        fixture::render(&gpu, s.as_mut(), &frame(ms + 60_000.0)).unwrap();
        assert!(s.messages().contains(&"ended".to_string()));
        s.bind(&inputs(false, "200.5", "1:15", "2:30"), Some(ms + 60_000.0))
            .unwrap();
        s.bind(&inputs(true, "200.5", "1:15", "2:30"), Some(ms + 61_000.0))
            .unwrap();
        assert_eq!(s.messages(), vec!["seek:0".to_string()]);
        assert!(at(&mut s) < 0.01);
    }
}
