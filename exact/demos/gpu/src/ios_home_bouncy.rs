//! iOS home screen bounce: a 4-column grid of 28 metallic app squares that spring in from 12×
//! after unlock. A tap replays the animation. A long press opens a spring customizer: a blurred
//! modal with mass, damping and stiffness sliders for the opening and closing springs. Pulling
//! it down dismisses it.
//!
//! Haptics:
//! - Light impact when the long press opens the customizer and when a slider thumb is grabbed.
//! - Selection at each slider step, and once when a pull crosses the dismiss line.
//! - Medium impact when a release dismisses the customizer.
//! - Haptics are at least 40 ms apart. Taps play none.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture, Phase};
use motion::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing};
use draw2d::backdrop::{expo_fraction, BackdropBlur, Chain};
use draw2d::{Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

/// Bold rounded UI font, subset to the customizer's strings.
static BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-bouncy-subset.otf");

/// Each square's colour, row by row.
const APPS: [u32; 28] = [
    0xE6E8EA, 0xDDE1E4, 0xCFD2D5, 0xDCE0E3, 0xE4E6E9, 0xD9DCDF, 0xCDD1D4, 0xE1E3E6, 0xDFE1E3,
    0xD0D3D6, 0xE8EAEC, 0xD8DADD, 0xDADDE0, 0xDFE2E5, 0xCBCED1, 0xD6D9DC, 0xD9DCDE, 0xE6E8EB,
    0xDBDEE1, 0xD0D3D5, 0xDCDFE2, 0xD7DADD, 0xE0E2E5, 0xEAECED, 0xDFE2E5, 0xD2D5D8, 0xDEE0E3,
    0xE4E6E9,
];
const SPACING: f32 = 8.0;
const COLUMNS: usize = 4;
const LIST_BG: u32 = 0xFAFAFA;

/// The spring that takes the progress to 0 before each replay.
const ZERO_SPRING: SpringConfig = SpringConfig {
    mass: 80.0,
    damping: 120.0,
    stiffness: 240.0,
};
const DELAY_MS: f64 = 800.0;
/// Opening and closing spring defaults: [mass, damping, stiffness].
const DEFAULTS: [[f64; 3]; 2] = [[20.0, 80.0, 180.0], [1.4, 18.0, 100.0]];
const SNAP_BACK: SpringConfig = SpringConfig {
    mass: 0.4,
    damping: 10.0,
    stiffness: 100.0,
};
const INDICATOR: SpringConfig = SpringConfig {
    mass: 0.8,
    damping: 20.0,
    stiffness: 200.0,
};
/// Long press time, and how far a finger may drift before the press cancels.
const LONG_PRESS_MS: f64 = 500.0;
const LONG_PRESS_SLOP: f32 = 10.0;
/// The shortest gap between two haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// The pull past which a release dismisses the customizer, pt.
const DISMISS_PULL: f64 = 80.0;
/// Back under DISMISS_PULL by this much before going past it plays again, pt.
const REARM: f64 = 24.0;
/// How far (in steps) past a step's half line a thumb goes before its selection plays.
const STEP_SLACK: f64 = 0.15;
/// Modal fade duration, ms.
const FADE_MS: f64 = 400.0;
/// Slider card keyframe duration, ms, and the horizontal slide distance.
const KEYFRAME_MS: f64 = 500.0;
const OFFSET: f64 = 20.0;
/// Slider track width and thumb size, pt.
const SLIDER: f32 = 280.0;
const THUMB: f32 = 24.0;
/// The sliders: label, min, max, step.
const SLIDERS: [(&str, f64, f64, f64); 3] = [
    ("Mass", 0.1, 100.0, 0.1),
    ("Damping", 1.0, 200.0, 1.0),
    ("Stiffness", 1.0, 500.0, 1.0),
];
const TABS: [&str; 2] = ["Opening", "Closing"];
/// Card layers an animating slider card can take at once.
const CARD_LAYERS: usize = 4;

/// UIKit's extraLight blur. These are UltraLight's settings, not yet measured on device.
const EXTRA_LIGHT: Chain = Chain {
    radius: 20.0,
    scale: 0.125,
    blur_first: true,
    curve: None,
    saturation: 1.8,
    brightness: 0.0,
    tint: Some((0.97, 0.8)),
};

/// UIKit's default ease-in-out curve.
fn ease_in_out() -> Easing {
    Easing::bezier(0.42, 0.0, 0.58, 1.0)
}
fn keyframe_easing(t: f64) -> f64 {
    Easing::bezier(0.25, 0.46, 0.45, 0.94).at(t.clamp(0.0, 1.0))
}

/// Rounds to the pixel grid, halves up.
fn round_px(v: f32, s: f32) -> f32 {
    (v * s + 0.5 + 1e-4).floor() / s
}
/// Rounds a text size up to the pixel grid.
fn ceil_px(v: f32, s: f32) -> f32 {
    ((v + 0.001) * s).ceil() / s
}
/// Rounds a text offset down to the pixel grid.
fn floor_px(v: f32, s: f32) -> f32 {
    (v * s + 1e-4).floor() / s
}

fn item_size(width: f32) -> f32 {
    ((width - 2.0 * SPACING - SPACING * (COLUMNS - 1) as f32) / COLUMNS as f32).floor()
}

/// Row indices in draw order: the middle rows are drawn last, on top.
fn row_order() -> Vec<usize> {
    let n = APPS.len().div_ceil(COLUMNS);
    let z = |i: usize| (n as f64 - (i as f64 - n as f64 / 2.0).abs() + 0.5).floor() as i64;
    let mut rows: Vec<usize> = (0..n).collect();
    rows.sort_by_key(|&i| z(i));
    rows
}

/// A square's frame in the content (x, y, side) and its second-stage scale.
fn squares(width: f32, height: f32, safe_top: f32) -> Vec<([f32; 3], f64)> {
    let item = item_size(width);
    let diagonal = ((width * width + height * height) as f64).sqrt();
    (0..APPS.len())
        .map(|k| {
            let (i, j) = ((k / COLUMNS) as f32, (k % COLUMNS) as f32);
            let row_y = safe_top + 4.0 + i * (item + SPACING);
            // The gap to the right is part of the cell, except at the row's end.
            let last = k % COLUMNS == COLUMNS - 1 || k == APPS.len() - 1;
            let bw = if last { item } else { item + SPACING };
            let bx = j * (item + SPACING);
            let tx = (width / 2.0 - (bx + bw / 2.0)) as f64;
            let ty = (height / 2.0 - (row_y + item / 2.0)) as f64;
            let distance = (tx * tx + ty * ty).sqrt();
            let second = interpolate(
                distance,
                &[0.0, diagonal / 2.0],
                &[1.0, 0.0],
                Extrapolation::Extend,
            );
            ([SPACING + bx + 14.0, row_y + 14.0, item - 28.0], second)
        })
        .collect()
}

/// The content's height (paddings, rows and their margins).
fn content_height(width: f32, safe_top: f32) -> f32 {
    let rows = APPS.len().div_ceil(COLUMNS) as f32;
    safe_top + 4.0 + rows * (item_size(width) + SPACING) + 300.0
}

/// The replay's stages.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Seq {
    Idle,
    /// Spring to 0, started at `at`. The closing config is read here.
    ToZero {
        at: f64,
        closing: SpringConfig,
    },
    /// An 800 ms pause from `at`.
    Delay {
        at: f64,
        closing: SpringConfig,
    },
    /// Spring to 2 with the closing config.
    Closing,
}

/// The touch on the grid, for the tap and the long press.
#[derive(Clone, Copy, Debug)]
struct Press {
    id: u32,
    at: f64,
    x: f32,
    y: f32,
    /// The long-press timer still runs.
    armed: bool,
}

/// One slider card, possibly fading or sliding out.
#[derive(Clone, Copy, Debug)]
struct Card {
    tab: usize,
    /// Its entering keyframe's start (NaN: from the next frame; None: no entering).
    enter: Option<f64>,
    /// Its exiting keyframe's start, with the values it showed.
    exit: Option<f64>,
    values: [f64; 3],
}

impl Card {
    /// Its opacity and translateX at `now`.
    fn style(&self, now: f64) -> (f64, f64) {
        // Exit: towards the side it leaves by (opening → right, closing → left).
        let side = if self.tab == 0 { 1.0 } else { -1.0 };
        if let Some(at) = self.exit {
            let u = if at.is_nan() {
                0.0
            } else {
                ((now - at) / KEYFRAME_MS).clamp(0.0, 1.0)
            };
            let opacity = if u < 0.7 {
                1.0 - keyframe_easing(u / 0.7)
            } else {
                0.0
            };
            return (opacity, side * OFFSET * keyframe_easing(u));
        }
        if let Some(at) = self.enter {
            let u = if at.is_nan() {
                0.0
            } else {
                ((now - at) / KEYFRAME_MS).clamp(0.0, 1.0)
            };
            let opacity = if u < 0.15 {
                0.0
            } else {
                keyframe_easing((u - 0.15) / 0.85)
            };
            // Enter from the side it comes in from (opening ← left, closing → from the right).
            return (opacity, -side * OFFSET * (1.0 - keyframe_easing(u)));
        }
        (1.0, 0.0)
    }

    fn done(&self, now: f64) -> bool {
        self.exit
            .is_some_and(|at| !at.is_nan() && now - at >= KEYFRAME_MS)
    }
}

/// Who a modal finger drives.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Grab {
    /// The pull-to-dismiss pan, with a tab tap still possible.
    Pull { tab: Option<usize> },
    /// Slider `i`'s thumb pan: the thumb's start x, and the value its last haptic felt.
    Thumb { i: usize, start_x: f64, felt: f64 },
}

/// The customizer while it is shown.
struct Modal {
    ty: Spring,
    triggered: bool,
    pan: PanGesture,
    thumb: PanGesture,
    grab: Option<(u32, Grab)>,
    tab: usize,
    indicator: Spring,
    /// A tab was chosen since the last frame.
    retarget: bool,
    cards: Vec<Card>,
}

impl Modal {
    fn new(configs: &[[f64; 3]; 2]) -> Modal {
        Modal {
            ty: Spring::at(0.0),
            triggered: false,
            pan: PanGesture::new(),
            thumb: PanGesture::new(),
            grab: None,
            tab: 0,
            indicator: Spring::at(0.0),
            retarget: false,
            cards: vec![Card {
                tab: 0,
                enter: None,
                exit: None,
                values: configs[0],
            }],
        }
    }

    fn opacity(&self) -> f64 {
        let progress = (self.ty.value / 150.0).min(1.0);
        interpolate(progress, &[0.0, 1.0], &[1.0, 0.0], Extrapolation::Clamp)
    }

    fn intensity(&self) -> f64 {
        interpolate(
            self.ty.value,
            &[0.0, 150.0],
            &[70.0, 0.0],
            Extrapolation::Extend,
        )
    }
}

/// The customizer's boxes, untranslated (window points).
#[derive(Clone, Copy, Debug)]
struct Layout {
    indicator_bar: [f32; 4],
    tabs: [f32; 4],
    tab_h: f32,
    tab_text_top: f32,
    card: [f32; 4],
    header_h: f32,
    value_h: f32,
    label_h: f32,
}

impl Layout {
    /// Slider `i`'s header top.
    fn header(&self, i: usize) -> f32 {
        self.card[1] + 25.0 + i as f32 * (16.0 + self.header_h + 44.0 + 12.0) + 16.0
    }
    /// Slider `i`'s track origin (x, y).
    fn slider(&self, i: usize) -> (f32, f32) {
        (self.card[0] + 25.0, self.header(i) + self.header_h)
    }
}

/// Haptics queued for the host, spaced by HAPTIC_GAP_MS.
#[derive(Default)]
struct Haptics {
    /// When the last one played.
    at: f64,
    posted: Vec<String>,
}

impl Haptics {
    /// Posts `kind` unless another haptic played under HAPTIC_GAP_MS ago.
    fn play(&mut self, kind: &str, at_ms: f64) {
        if at_ms - self.at >= HAPTIC_GAP_MS {
            self.posted.push(format!("haptic:{kind}"));
            self.at = at_ms;
        }
    }
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Bouncy::new())
}

struct Bouncy {
    safe_top: f32,
    size: (f32, f32, f32),
    now: f64,
    progress: Spring,
    seq: Seq,
    /// A replay was requested since the last frame.
    start: bool,
    configs: [[f64; 3]; 2],
    scroll: UiScroll,
    press: Option<Press>,
    modal: Option<Modal>,
    /// Customizer shown (the fade runs to 1) or hidden (to 0).
    visible: bool,
    fade: Timing,
    bold16: Option<Font>,
    bold17: Option<Font>,
    haptics: Haptics,
    /// The current pull is past DISMISS_PULL (a release would dismiss).
    past_dismiss: bool,
    gpu: Option<Gpu>,
}

struct Gpu {
    pixels: (u32, u32, u32),
    /// 0: the blurred home; 1: the customizer's content.
    layers: Images,
    /// The Modal as one group: the blur and the content at its opacity.
    modal: Images,
    /// Animating slider cards, each a group.
    cards: Option<Images>,
    blur: BackdropBlur,
    main: (Canvas, Renderer),
    home: (Canvas, Renderer),
    content: (Canvas, Renderer),
    compose: (Canvas, Renderer),
    card: Vec<(Canvas, Renderer)>,
    bound: [bool; 3],
}

impl Bouncy {
    fn new() -> Bouncy {
        Bouncy {
            safe_top: 0.0,
            size: (0.0, 0.0, 3.0),
            now: 0.0,
            progress: Spring::at(0.0),
            seq: Seq::Idle,
            start: true,
            configs: DEFAULTS,
            scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
            press: None,
            modal: None,
            visible: false,
            fade: Timing::at(0.0),
            bold16: Font::new(BOLD, 16.0).map(Font::with_ui_layout),
            bold17: Font::new(BOLD, 17.0).map(Font::with_ui_layout),
            haptics: Haptics { at: f64::NEG_INFINITY, posted: Vec::new() },
            past_dismiss: false,
            gpu: None,
        }
    }

    fn closing(&self) -> SpringConfig {
        let [mass, damping, stiffness] = self.configs[1];
        SpringConfig {
            mass,
            damping,
            stiffness,
        }
    }

    fn layout(&self) -> Layout {
        let (w, _, s) = self.size;
        let lh = |f: &Option<Font>| f.as_ref().map_or(20.0, |f| ceil_px(gfx::line_height(f), s));
        let (lh16, lh17) = (lh(&self.bold16), lh(&self.bold17));
        let content_top = self.safe_top + 20.0 + 12.0 + 4.0 + 20.0;
        let tab_h = 24.0 + lh16;
        let card_top = round_px(content_top + tab_h + 12.0, s);
        let value_h = lh16 + 12.0 + 2.0;
        let header_h = value_h.max(lh17);
        let card_h = 2.0 + 48.0 + 3.0 * (16.0 + header_h + 44.0 + 12.0);
        Layout {
            indicator_bar: [(w - 40.0) / 2.0, self.safe_top + 32.0, 40.0, 4.0],
            tabs: [24.0, content_top, w - 48.0, tab_h],
            tab_h,
            tab_text_top: content_top + 12.0,
            card: [24.0, card_top, w - 48.0, round_px(card_h, s)],
            header_h,
            value_h,
            label_h: lh17,
        }
    }

    fn scroll_offset(&self) -> f32 {
        let s = self.size.2;
        (self.scroll.offset as f32 * s).round() / s
    }

    /// One frame: the sequence, the scroll, the press timer, the Modal.
    fn step(&mut self, now: f64) -> bool {
        self.now = now;
        let (w, h, _) = self.size;
        self.scroll.max = (content_height(w, self.safe_top) - h).max(0.0) as f64;
        self.scroll.port = h as f64;
        let mut moving = self.scroll.step(now);
        if self.start {
            self.start = false;
            // Restart from the current value, at rest, towards 0.
            let v = self.progress.value;
            self.progress.set(v);
            self.progress.to(0.0, 0.0, ZERO_SPRING);
            self.progress.step(now);
            self.seq = Seq::ToZero {
                at: now,
                closing: self.closing(),
            };
        }
        match self.seq {
            Seq::ToZero { at, closing } => {
                self.progress.step(now);
                if now > at && !self.progress.running {
                    self.seq = Seq::Delay { at: now, closing };
                }
                moving = true;
            }
            Seq::Delay { at, closing } => {
                if now - at >= DELAY_MS {
                    // The opening spring ends on this frame, at 1.
                    self.progress.set(1.0);
                    self.progress.to(2.0, 0.0, closing);
                    self.progress.step(now);
                    self.seq = Seq::Closing;
                }
                moving = true;
            }
            Seq::Closing => {
                if !self.progress.step(now) {
                    self.seq = Seq::Idle;
                }
                moving = true;
            }
            Seq::Idle => {}
        }
        if let Some(p) = self.press {
            if p.armed && now - p.at >= LONG_PRESS_MS {
                self.press = None;
                self.open();
                self.haptics.play("impact-light", now);
            }
            moving = true;
        }
        moving |= self.fade.step(now);
        if !self.visible && !self.fade.running && self.fade.value <= 0.0 {
            self.modal = None;
        }
        let configs = self.configs;
        if let Some(m) = self.modal.as_mut() {
            moving |= m.ty.step(now);
            moving |= m.indicator.step(now);
            if m.retarget {
                m.retarget = false;
                m.indicator.retarget(m.tab as f64, INDICATOR);
                m.indicator.step(now);
                moving = true;
            }
            for c in &mut m.cards {
                for at in [&mut c.enter, &mut c.exit].into_iter().flatten() {
                    if at.is_nan() {
                        *at = now;
                    }
                }
            }
            m.cards.retain(|c| !c.done(now));
            for c in &mut m.cards {
                if c.exit.is_none() {
                    c.values = configs[c.tab];
                }
            }
            moving |= m.cards.len() > 1
                || m.cards
                    .iter()
                    .any(|c| c.enter.is_some_and(|at| now - at < KEYFRAME_MS));
            moving |= m.grab.is_some();
        }
        moving || self.scroll.moving()
    }

    fn open(&mut self) {
        self.visible = true;
        self.modal = Some(Modal::new(&self.configs));
        self.fade.to(1.0, FADE_MS, ease_in_out());
    }

    fn close(&mut self) {
        self.visible = false;
        self.fade.to(0.0, FADE_MS, ease_in_out());
    }

    fn home_pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64) {
        // The grid scrolls with the finger.
        self.scroll.input(id, phase, y, x, at_ms, true);
        if self.scroll.dragging() {
            // A scroll cancels the press.
            self.press = None;
        }
        match phase {
            Phase::Down => {
                if self.press.is_none() {
                    self.press = Some(Press {
                        id,
                        at: at_ms,
                        x,
                        y,
                        armed: true,
                    });
                }
            }
            Phase::Move => {
                if let Some(p) = self.press.as_mut().filter(|p| p.id == id) {
                    if ((x - p.x).powi(2) + (y - p.y).powi(2)).sqrt() > LONG_PRESS_SLOP {
                        p.armed = false;
                    }
                }
            }
            Phase::Up => {
                if self.press.is_some_and(|p| p.id == id) {
                    self.press = None;
                    self.start = true;
                }
            }
            Phase::Cancel => {
                if self.press.is_some_and(|p| p.id == id) {
                    self.press = None;
                }
            }
        }
    }

    /// The thumb of slider `i` of the current card, in window points (x, y, side).
    fn thumb_frame(&self, i: usize) -> Option<[f32; 3]> {
        let m = self.modal.as_ref()?;
        let card = m.cards.iter().find(|c| c.exit.is_none())?;
        let (_, tx) = card.style(self.now);
        let l = self.layout();
        let (sx, sy) = l.slider(i);
        let (_, min, max, _) = SLIDERS[i];
        let t = ((self.configs[card.tab][i] - min) / (max - min)) as f32 * (SLIDER - THUMB);
        Some([sx + tx as f32 + t, sy + 10.0 + m.ty.value as f32, THUMB])
    }

    fn modal_pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64) {
        let l = self.layout();
        if phase == Phase::Down {
            let Some(m) = self.modal.as_ref() else { return };
            if m.grab.is_some() {
                return;
            }
            let thumb = (0..3).find(|&i| {
                self.thumb_frame(i)
                    .is_some_and(|f| x >= f[0] && x <= f[0] + f[2] && y >= f[1] && y <= f[1] + f[2])
            });
            let ty = m.ty.value as f32;
            let tab = (0..2).find(|&k| {
                let tw = l.tabs[2] / 2.0;
                let tx = l.tabs[0] + k as f32 * tw;
                x >= tx && x <= tx + tw && y >= l.tabs[1] + ty && y <= l.tabs[1] + ty + l.tab_h
            });
            let m = self.modal.as_mut().unwrap();
            if let Some(i) = thumb {
                m.grab = Some((id, Grab::Thumb { i, start_x: 0.0, felt: f64::NAN }));
                m.thumb.event(id, phase, x, y, at_ms, true);
            } else {
                m.grab = Some((id, Grab::Pull { tab }));
                // onBegin.
                m.triggered = false;
                self.past_dismiss = false;
                m.pan.event(id, phase, x, y, at_ms, true);
            }
            return;
        }
        let Some(m) = self.modal.as_mut() else { return };
        let Some((gid, grab)) = m.grab else { return };
        if gid != id {
            return;
        }
        let done = matches!(phase, Phase::Up | Phase::Cancel);
        match grab {
            Grab::Thumb { i, start_x, felt } => {
                let tab = m
                    .cards
                    .iter()
                    .find(|c| c.exit.is_none())
                    .map_or(m.tab, |c| c.tab);
                let (_, min, max, step) = SLIDERS[i];
                let span = (SLIDER - THUMB) as f64;
                let mut start_x = start_x;
                let mut felt = felt;
                let update = match m.thumb.event(id, phase, x, y, at_ms, true) {
                    Event::Start(p) => {
                        start_x = (self.configs[tab][i] - min) / (max - min) * span;
                        felt = self.configs[tab][i];
                        self.haptics.play("impact-light", at_ms);
                        Some(p)
                    }
                    Event::Update(p) => Some(p),
                    _ => None,
                };
                if let Some(p) = update {
                    let nx = (start_x + p.translation_x as f64).clamp(0.0, span);
                    let v = min + nx / span * (max - min);
                    self.configs[tab][i] = (v / step).round() * step;
                    if (v - felt).abs() >= step * (0.5 + STEP_SLACK) {
                        felt = self.configs[tab][i];
                        self.haptics.play("selection", at_ms);
                    }
                }
                let m = self.modal.as_mut().unwrap();
                m.grab = if done {
                    None
                } else {
                    Some((id, Grab::Thumb { i, start_x, felt }))
                };
            }
            Grab::Pull { tab } => {
                let mut tab = tab;
                let mut close = false;
                match m.pan.event(id, phase, x, y, at_ms, true) {
                    Event::Start(p) | Event::Update(p) => {
                        // The pan's start cancels a tab tap.
                        tab = None;
                        if p.translation_y > 0.0 {
                            m.ty.set(p.translation_y as f64);
                            if m.ty.value > 120.0 && !m.triggered {
                                m.triggered = true;
                                self.start = true;
                            }
                            if !self.past_dismiss && m.ty.value > DISMISS_PULL {
                                self.past_dismiss = true;
                                self.haptics.play("selection", at_ms);
                            } else if self.past_dismiss && m.ty.value < DISMISS_PULL - REARM {
                                self.past_dismiss = false;
                            }
                        }
                    }
                    Event::End(p) => {
                        if m.ty.value > DISMISS_PULL || p.velocity_y > 800.0 {
                            close = true;
                            self.haptics.play("impact-medium", at_ms);
                        } else {
                            m.ty.to(0.0, 0.0, SNAP_BACK);
                        }
                    }
                    _ => {}
                }
                let m = self.modal.as_mut().unwrap();
                if phase == Phase::Up {
                    if let Some(k) = tab {
                        // A release within 20 pt of a tab counts as a tap on it.
                        let tw = l.tabs[2] / 2.0;
                        let tx = l.tabs[0] + k as f32 * tw;
                        let ty = l.tabs[1] + m.ty.value as f32;
                        let inside = x >= tx - 20.0
                            && x <= tx + tw + 20.0
                            && y >= ty - 20.0
                            && y <= ty + l.tab_h + 20.0;
                        if inside && k != m.tab {
                            m.tab = k;
                            m.retarget = true;
                            for c in &mut m.cards {
                                if c.exit.is_none() {
                                    c.exit = Some(f64::NAN);
                                }
                            }
                            let values = self.configs[k];
                            m.cards.insert(
                                0,
                                Card {
                                    tab: k,
                                    enter: Some(f64::NAN),
                                    exit: None,
                                    values,
                                },
                            );
                        }
                    }
                }
                m.grab = if done {
                    None
                } else {
                    Some((id, Grab::Pull { tab }))
                };
                if close {
                    self.close();
                }
            }
        }
    }

    /// Draws the grid in draw order on the list background.
    fn record_home(&self, c: &mut Canvas) {
        let (w, h, _) = self.size;
        c.draw_rect(0.0, 0.0, w, h, &Paint::fill(Color::view_hex(LIST_BG)));
        let o = self.scroll_offset();
        let (ox, oy) = (w / 2.0 + SPACING, h / 2.0 - o);
        let sq = squares(w, h, self.safe_top);
        let p = self.progress.value;
        for row in row_order() {
            for k in row * COLUMNS..((row + 1) * COLUMNS).min(APPS.len()) {
                let ([x, y, side], second) = sq[k];
                let scale = interpolate(
                    p,
                    &[0.0, 1.0, 2.0],
                    &[12.0, second, 1.0],
                    Extrapolation::Extend,
                ) as f32;
                c.save();
                c.translate(ox, oy);
                c.scale(scale, scale);
                c.translate(-ox, -oy);
                c.draw_continuous_rrect(
                    x,
                    y - o,
                    side,
                    side,
                    16.0,
                    &Paint::fill(Color::view_hex(APPS[k])),
                );
                c.restore();
            }
        }
    }

    /// An outer shadow, drawn only outside its box.
    fn shadow(
        c: &mut Canvas,
        b: [f32; 4],
        r: f32,
        dy: f32,
        sigma: f32,
        color: Color,
        continuous: bool,
    ) {
        c.save();
        let e = 3.0 * sigma + dy.abs() + 2.0;
        c.clip_with(|p| {
            draw2d::add_rect(p, b[0] - e, b[1] - e, b[2] + 2.0 * e, b[3] + 2.0 * e);
            if continuous {
                draw2d::add_continuous_rrect_hole(p, b[0], b[1], b[2], b[3], r);
            } else {
                draw2d::add_rrect_hole(p, b[0], b[1], b[2], b[3], r);
            }
        });
        c.draw_rrect_shadow(b[0], b[1] + dy, b[2], b[3], r, sigma, color);
        c.restore();
    }

    /// A ring of width `bw` inside the box edge.
    fn ring(c: &mut Canvas, b: [f32; 4], r: f32, bw: f32, color: Color) {
        c.draw_with(&Paint::fill(color), |p| {
            draw2d::add_rrect(p, b[0], b[1], b[2], b[3], r);
            draw2d::add_rrect_hole(
                p,
                b[0] + bw,
                b[1] + bw,
                b[2] - 2.0 * bw,
                b[3] - 2.0 * bw,
                (r - bw).max(0.0),
            );
        });
    }

    /// The customizer's tabs and indicator, moved by the pull.
    fn record_content(&self, c: &mut Canvas, m: &Modal) {
        let l = self.layout();
        let s = self.size.2;
        let ty = m.ty.value as f32;
        c.save();
        c.translate(0.0, ty);
        let b = l.indicator_bar;
        c.draw_rrect(
            b[0],
            b[1],
            b[2],
            b[3],
            2.0,
            &Paint::fill(Color::view_hex(0xE5E7EB)),
        );
        let t = l.tabs;
        Self::shadow(
            c,
            t,
            16.0,
            2.0,
            2.0,
            Color::view_hex(0xD1D5DB).alpha(0.05),
            true,
        );
        let tw = t[2] / 2.0;
        let ix = t[0]
            + interpolate(
                m.indicator.value,
                &[0.0, 1.0],
                &[0.0, tw as f64],
                Extrapolation::Extend,
            ) as f32;
        let ib = [ix, t[1] + round_px((l.tab_h - 40.0) / 2.0, s), tw, 40.0];
        Self::shadow(
            c,
            ib,
            12.0,
            2.0,
            3.0,
            Color::view_hex(0xD1D5DB).alpha(0.15),
            false,
        );
        c.draw_continuous_rrect(ib[0], ib[1], ib[2], ib[3], 12.0, &Paint::fill(Color::WHITE));
        if let Some(f) = self.bold16.as_ref() {
            for (k, label) in TABS.iter().enumerate() {
                let w = ceil_px(f.advance_width_spaced(label, -0.3), s);
                let x = t[0] + k as f32 * tw + floor_px((tw - w) / 2.0, s);
                let color = if k == m.tab { 0x6B7280 } else { 0x9CA3AF };
                c.draw_text_spaced(
                    label,
                    x,
                    gfx::baseline(f, l.tab_text_top),
                    f,
                    &Paint::fill(Color::view_hex(color)),
                    -0.3,
                );
            }
        }
        c.restore();
    }

    /// One slider card at the given offset; the caller applies its opacity.
    fn record_card(&self, c: &mut Canvas, card: &Card, tx: f32, ty: f32) {
        let l = self.layout();
        let s = self.size.2;
        let grey = Color::view_hex(0x6B7280);
        c.save();
        c.translate(tx, ty);
        let b = l.card;
        Self::shadow(
            c,
            b,
            32.0,
            4.0,
            8.0,
            Color::view_hex(0xD1D5DB).alpha(0.1),
            false,
        );
        c.draw_continuous_rrect(
            b[0],
            b[1],
            b[2],
            b[3],
            32.0,
            &Paint::fill(Color::WHITE.alpha(0.98)),
        );
        Self::ring(c, b, 32.0, 1.0, Color::view_hex(0xF3F4F6).alpha(0.8));
        let inner_w = b[2] - 2.0 - 48.0;
        for (i, &(label, min, max, _)) in SLIDERS.iter().enumerate() {
            let v = card.values[i];
            let hy = l.header(i);
            if let Some(f) = self.bold17.as_ref() {
                let top = hy + floor_px((l.header_h - l.label_h) / 2.0, s);
                c.draw_text_spaced(
                    label,
                    b[0] + 25.0,
                    gfx::baseline(f, top),
                    f,
                    &Paint::fill(grey),
                    -0.2,
                );
            }
            // The value box: at least 70 pt wide.
            if let Some(f) = self.bold16.as_ref() {
                let text = format!("{v:.1}");
                let tw = f.advance_width(&text);
                let bw = 70f32.max(ceil_px(tw, s) + 22.0);
                let vb = [
                    b[0] + 25.0 + inner_w - bw,
                    hy + round_px((l.header_h - l.value_h) / 2.0, s),
                    bw,
                    l.value_h,
                ];
                Self::shadow(
                    c,
                    vb,
                    12.0,
                    2.0,
                    2.0,
                    Color::view_hex(0xD1D5DB).alpha(0.05),
                    false,
                );
                c.draw_continuous_rrect(
                    vb[0],
                    vb[1],
                    vb[2],
                    vb[3],
                    12.0,
                    &Paint::fill(Color::view_hex(0x9CA3AF).alpha(0.06)),
                );
                Self::ring(c, vb, 12.0, 1.0, Color::view_hex(0xD1D5DB).alpha(0.3));
                // UIKit centres the value a device pixel above a Text's line.
                let x = vb[0] + 11.0 + (vb[2] - 22.0 - tw) / 2.0;
                let top = vb[1] + 7.0 - 1.0 / s;
                c.draw_text(&text, x, gfx::baseline(f, top), f, &Paint::fill(grey));
            }
            let (sx, sy) = l.slider(i);
            let t = ((v - min) / (max - min)) as f32 * (SLIDER - THUMB);
            let tr = [sx, sy + 18.0, SLIDER, 8.0];
            Self::shadow(
                c,
                tr,
                4.0,
                1.0,
                1.0,
                Color::view_hex(0xE5E7EB).alpha(0.1),
                false,
            );
            c.draw_rrect(
                tr[0],
                tr[1],
                tr[2],
                tr[3],
                4.0,
                &Paint::fill(Color::view_hex(0xF9FAFB)),
            );
            c.save();
            c.clip_rrect(tr[0], tr[1], tr[2], tr[3], 4.0);
            c.clip_rect(tr[0] + 1.0, tr[1], tr[2] - 1.0, tr[3]);
            let fb = [
                tr[0] + 1.0 + t + THUMB / 2.0 - SLIDER,
                tr[1] + 1.0,
                SLIDER,
                8.0,
            ];
            Self::shadow(
                c,
                fb,
                0.0,
                1.0,
                1.0,
                Color::view_hex(0xD1D5DB).alpha(0.08),
                false,
            );
            c.draw_rect(
                fb[0],
                fb[1],
                fb[2],
                fb[3],
                &Paint::fill(Color::view_hex(0xE5E7EB)),
            );
            c.restore();
            Self::ring(c, tr, 4.0, 1.0, Color::view_hex(0xF3F4F6));
            // Continuous corners at half the side make a circle.
            let th = [sx + t, sy + 10.0, THUMB, THUMB];
            Self::shadow(
                c,
                th,
                12.0,
                4.0,
                4.0,
                Color::view_hex(0xD1D5DB).alpha(0.1),
                false,
            );
            let (cx, cy) = (th[0] + 12.0, th[1] + 12.0);
            c.draw_circle(cx, cy, 12.0, &Paint::fill(Color::WHITE));
            c.draw_with(&Paint::fill(Color::view_hex(0xF3F4F6)), |p| {
                draw2d::add_circle(p, cx, cy, 12.0);
                draw2d::add_circle_fine(p, cx, cy, 10.0, true);
            });
        }
        c.restore();
    }
}

impl Surface for Bouncy {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.haptics.posted))
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
        let phase = gfx::phase(phase);
        // UIKit ignores touches while a presentation transitions.
        if self.fade.running && phase == Phase::Down {
            return;
        }
        if self.modal.is_some() {
            self.modal_pointer(id, phase, x, y, at_ms);
        } else {
            self.home_pointer(id, phase, x, y, at_ms);
        }
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let m = self.modal.as_ref();
        Some(format!(
            "{{\"progress\":{:.4},\"scroll\":{:.2},\"customizer\":{},\"tab\":{},\"ty\":{:.2},\"opening\":[{},{},{}],\"closing\":[{},{},{}],\"held\":{}}}",
            self.progress.value,
            self.scroll.offset,
            self.visible,
            m.map_or(-1, |m| m.tab as i64),
            m.map_or(0.0, |m| m.ty.value),
            self.configs[0][0],
            self.configs[0][1],
            self.configs[0][2],
            self.configs[1][0],
            self.configs[1][1],
            self.configs[1][2],
            self.press.is_some() || self.scroll.dragging() || m.is_some_and(|m| m.grab.is_some())
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
        let s = frame.scale;
        let (w, h) = (frame.width, frame.height);
        let (pw, ph) = frame.pixels();
        self.size = (w, h, s);
        let now = frame.now_ms;
        let moving = self.step(now);
        let key = (pw, ph, s.to_bits());
        if self.gpu.as_ref().map(|g| g.pixels) != Some(key) {
            self.gpu = Some(Gpu {
                pixels: key,
                layers: Images::targets(device, pw, ph, 2),
                modal: Images::target(device, pw, ph),
                cards: None,
                blur: BackdropBlur::default(),
                main: Default::default(),
                home: Default::default(),
                content: Default::default(),
                compose: Default::default(),
                card: Vec::new(),
                bound: [false; 3],
            });
        }
        let mut gpu = self.gpu.take().unwrap();
        let fmt = wgpu::TextureFormat::Rgba8Unorm;
        let full = |img: draw2d::ImageRef| {
            Paint::shader(Shader::ImageNearest {
                image: img,
                to_image: Matrix::scale(s, s),
                subset: [0.0, 0.0, pw as f32, ph as f32],
            })
        };
        let clear = wgpu::Color::TRANSPARENT;
        gpu.main.0.begin(s);
        self.record_home(&mut gpu.main.0);
        if let Some(m) = self.modal.as_ref() {
            // What the BlurView sees: the home, blurred into layer 0.
            let intensity = m.intensity();
            let blurred = intensity > 0.0;
            if blurred {
                gpu.home.0.begin(s);
                self.record_home(&mut gpu.home.0);
                let v0 = gpu.layers.render_view_layer(0);
                gpu.home
                    .1
                    .draw(device, queue, encoder, &gpu.home.0, &v0, fmt, pw, ph, clear);
                let params = EXTRA_LIGHT.at(expo_fraction(intensity));
                gpu.blur.run(
                    device,
                    queue,
                    encoder,
                    &v0,
                    [0, 0, pw as i32, ph as i32],
                    [0.0, 0.0],
                    &params,
                    s,
                );
                gpu.blur.draw(
                    device,
                    queue,
                    encoder,
                    &v0,
                    fmt,
                    [0.0, 0.0],
                    [0, 0],
                    [pw, ph],
                );
            }
            // Animating cards each render to a layer.
            let ty = m.ty.value as f32;
            let mut direct = Vec::new();
            let mut layered = Vec::new();
            // The mounted card first, exiting cards above it.
            let mut order: Vec<&Card> = m.cards.iter().filter(|c| c.exit.is_none()).collect();
            order.extend(m.cards.iter().filter(|c| c.exit.is_some()));
            for card in order {
                let (a, tx) = card.style(now);
                if a <= 0.0 {
                    continue;
                }
                if a >= 1.0 {
                    direct.push((*card, tx as f32));
                } else if layered.len() < CARD_LAYERS {
                    layered.push((*card, tx as f32, a as f32));
                }
            }
            if !layered.is_empty() && gpu.cards.is_none() {
                gpu.cards = Some(Images::targets(device, pw, ph, CARD_LAYERS as u32));
            }
            while gpu.card.len() < layered.len() {
                gpu.card.push(Default::default());
            }
            for (k, (card, tx, _)) in layered.iter().enumerate() {
                let (c, r) = &mut gpu.card[k];
                c.begin(s);
                self.record_card(c, card, *tx, ty);
                let v = gpu.cards.as_ref().unwrap().render_view_layer(k as u32);
                r.draw(device, queue, encoder, c, &v, fmt, pw, ph, clear);
            }
            // The content as one group, in layer 1.
            let c = &mut gpu.content.0;
            c.begin(s);
            self.record_content(c, m);
            let mut layer = 0;
            for (card, tx) in &direct {
                self.record_card(c, card, *tx, ty);
            }
            for (k, (_, _, a)) in layered.iter().enumerate() {
                c.draw_rect(
                    0.0,
                    0.0,
                    w,
                    h,
                    &full(gpu.cards.as_ref().unwrap().image(k)).with_opacity(*a),
                );
                layer += 1;
            }
            if layer > 0 && !gpu.bound[1] {
                gpu.content.1.set_images(gpu.cards.as_ref().unwrap());
                gpu.bound[1] = true;
            }
            let v1 = gpu.layers.render_view_layer(1);
            gpu.content.1.draw(
                device,
                queue,
                encoder,
                &gpu.content.0,
                &v1,
                fmt,
                pw,
                ph,
                clear,
            );
            // Blur and content, then the modal fades over the home.
            let c = &mut gpu.compose.0;
            c.begin(s);
            if blurred {
                c.draw_rect(0.0, 0.0, w, h, &full(gpu.layers.image(0)));
            }
            c.draw_rect(
                0.0,
                0.0,
                w,
                h,
                &full(gpu.layers.image(1)).with_opacity(m.opacity() as f32),
            );
            if !gpu.bound[2] {
                gpu.compose.1.set_images(&gpu.layers);
                gpu.bound[2] = true;
            }
            let vm = gpu.modal.render_view();
            gpu.compose.1.draw(
                device,
                queue,
                encoder,
                &gpu.compose.0,
                &vm,
                fmt,
                pw,
                ph,
                clear,
            );
            gpu.main.0.draw_rect(
                0.0,
                0.0,
                w,
                h,
                &full(gpu.modal.image(0)).with_opacity(self.fade.value as f32),
            );
            if !gpu.bound[0] {
                gpu.main.1.set_images(&gpu.modal);
                gpu.bound[0] = true;
            }
        } else if gpu.cards.is_some() {
            // Drop the card layers once the customizer is gone.
            gpu.cards = None;
            gpu.card.clear();
            gpu.content.1 = Renderer::default();
            gpu.bound[1] = false;
        }
        gpu.main.1.draw(
            device,
            queue,
            encoder,
            &gpu.main.0,
            target,
            format,
            pw,
            ph,
            clear,
        );
        self.gpu = Some(gpu);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;
    const FRAME: f64 = 1000.0 / 60.0;

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        }
    }

    fn bouncy() -> Bouncy {
        let mut b = Bouncy::new();
        b.bind(&[Value::Number(68.0)], None).unwrap();
        b.size = (W, H, 3.0);
        b
    }

    fn run(b: &mut Bouncy, from: f64, to: f64) -> f64 {
        let mut t = from;
        while t < to {
            b.step(t);
            t += FRAME;
        }
        t
    }

    #[test]
    fn the_grid_is_rns() {
        // Squares sit 14 pt into a 95 pt cell; rows are 103 pt apart.
        let sq = squares(W, H, 68.0);
        assert_eq!(sq.len(), 28);
        assert_eq!(sq[0].0, [22.0, 86.0, 67.0]);
        assert_eq!(sq[5].0, [22.0 + 103.0, 86.0 + 103.0, 67.0]);
        assert_eq!(content_height(W, 68.0), 72.0 + 7.0 * 103.0 + 300.0);
        assert_eq!(row_order(), vec![0, 1, 6, 2, 5, 3, 4]);
    }

    #[test]
    fn the_sequence_holds_12_then_jumps_to_1_after_800_ms_and_bounces_to_2() {
        let mut b = bouncy();
        b.step(0.0);
        assert_eq!(b.progress.value, 0.0);
        // The spring to 0 ends on its first frame; the delay starts there.
        b.step(FRAME);
        assert_eq!(
            b.seq,
            Seq::Delay {
                at: FRAME,
                closing: b.closing()
            }
        );
        let mut t = 2.0 * FRAME;
        while b.seq != Seq::Closing {
            assert_eq!(b.progress.value, 0.0);
            b.step(t);
            t += FRAME;
        }
        t -= FRAME;
        assert!(t - FRAME >= 800.0 && t - FRAME < 800.0 + FRAME, "{t}");
        assert_eq!(b.progress.value, 1.0);
        b.step(t + FRAME);
        assert!(b.progress.value > 1.0);
        let mut over: f64 = 0.0;
        let mut u = t + 2.0 * FRAME;
        while b.seq != Seq::Idle && u < t + 20000.0 {
            b.step(u);
            over = over.max(b.progress.value);
            u += FRAME;
        }
        // The closing spring overshoots 2 by about 2.5 %.
        assert!((over - 2.025).abs() < 0.002, "{over}");
        assert_eq!(b.progress.value, 2.0);
    }

    #[test]
    fn a_tap_replays_and_a_long_press_opens_the_customizer() {
        let mut b = bouncy();
        let t = run(&mut b, 0.0, 4000.0);
        b.input(&pointer(PointerPhase::Down, 200.0, 400.0, t));
        b.input(&pointer(PointerPhase::Up, 200.0, 400.0, t + 80.0));
        assert!(b.start);
        b.step(t + 90.0);
        assert!(matches!(b.seq, Seq::ToZero { .. }));
        let t = run(&mut b, t + 100.0, t + 200.0);
        b.input(&pointer(PointerPhase::Down, 200.0, 400.0, t));
        run(&mut b, t, t + 490.0);
        assert!(!b.visible);
        b.step(t + 510.0);
        assert!(b.visible && b.modal.is_some());
        b.input(&pointer(PointerPhase::Up, 200.0, 400.0, t + 600.0));
        // The lift after the long press is no tap.
        assert!(!b.start);
    }

    #[test]
    fn the_slider_drags_the_closing_mass_and_a_pull_dismisses() {
        let mut b = bouncy();
        b.open();
        let t = run(&mut b, 0.0, 600.0);
        assert!(!b.fade.running);
        let l = b.layout();
        let (cx, cy) = (l.tabs[0] + l.tabs[2] * 0.75, l.tabs[1] + 10.0);
        b.input(&pointer(PointerPhase::Down, cx, cy, t));
        b.input(&pointer(PointerPhase::Up, cx, cy, t + 50.0));
        let t = run(&mut b, t + 60.0, t + 1200.0);
        let m = b.modal.as_ref().unwrap();
        assert_eq!((m.tab, m.cards.len()), (1, 1));
        assert!((m.indicator.value - 1.0).abs() < 1e-9);
        // Drag the mass thumb 110 pt right.
        let f = b.thumb_frame(0).unwrap();
        let (x, y) = (f[0] + 12.0, f[1] + 12.0);
        b.input(&pointer(PointerPhase::Down, x, y, t));
        b.input(&pointer(PointerPhase::Move, x + 20.0, y, t + 100.0));
        b.input(&pointer(PointerPhase::Move, x + 110.0, y, t + 200.0));
        b.input(&pointer(PointerPhase::Up, x + 110.0, y, t + 300.0));
        let start = 1.3 / 99.9 * 256.0;
        let want = ((0.1 + (start + 100.0) / 256.0 * 99.9) / 0.1f64).round() * 0.1;
        assert!(
            (b.configs[1][0] - want).abs() < 1e-9,
            "{} {want}",
            b.configs[1][0]
        );
        assert_eq!(b.configs[0], DEFAULTS[0]);
        // A pull of 150 pt (past 120: the home replays; past 80: it closes).
        let t = t + 400.0;
        b.input(&pointer(PointerPhase::Down, 200.0, 700.0, t));
        b.input(&pointer(PointerPhase::Move, 200.0, 800.0, t + 100.0));
        b.input(&pointer(PointerPhase::Move, 200.0, 860.0, t + 200.0));
        assert!(b.start);
        b.input(&pointer(PointerPhase::Up, 200.0, 860.0, t + 300.0));
        assert!(!b.visible);
        run(&mut b, t + 310.0, t + 900.0);
        assert!(b.modal.is_none());
    }

    #[test]
    fn haptics_on_the_long_press_the_slider_and_the_dismiss() {
        let mut b = bouncy();
        let t = run(&mut b, 0.0, 4000.0);
        // A tap plays none; the long press opens the customizer with a light one.
        b.input(&pointer(PointerPhase::Down, 200.0, 400.0, t));
        b.input(&pointer(PointerPhase::Up, 200.0, 400.0, t + 80.0));
        let t = run(&mut b, t + 90.0, t + 200.0);
        assert!(b.messages().is_empty());
        b.input(&pointer(PointerPhase::Down, 200.0, 400.0, t));
        run(&mut b, t, t + 520.0);
        b.input(&pointer(PointerPhase::Up, 200.0, 400.0, t + 530.0));
        assert_eq!(b.messages(), vec!["haptic:impact-light"]);
        let t = run(&mut b, t + 540.0, t + 1200.0);
        // The mass thumb: light on the take, a selection per step it moves (paced).
        let f = b.thumb_frame(0).unwrap();
        let (x, y) = (f[0] + 12.0, f[1] + 12.0);
        b.input(&pointer(PointerPhase::Down, x, y, t));
        b.input(&pointer(PointerPhase::Move, x + 20.0, y, t + 100.0));
        b.input(&pointer(PointerPhase::Move, x + 110.0, y, t + 200.0));
        b.input(&pointer(PointerPhase::Up, x + 110.0, y, t + 300.0));
        let slid = b.messages();
        assert_eq!(slid[0], "haptic:impact-light", "{slid:?}");
        assert!((2..=3).contains(&slid.len()) && slid[1..].iter().all(|m| m == "haptic:selection"), "{slid:?}");
        // A pull of 150 pt: a selection across the 80 pt line, medium when the release dismisses.
        let t = t + 400.0;
        b.input(&pointer(PointerPhase::Down, 200.0, 700.0, t));
        b.input(&pointer(PointerPhase::Move, 200.0, 800.0, t + 100.0));
        b.input(&pointer(PointerPhase::Move, 200.0, 860.0, t + 200.0));
        b.input(&pointer(PointerPhase::Up, 200.0, 860.0, t + 300.0));
        assert_eq!(b.messages(), vec!["haptic:selection", "haptic:impact-medium"]);
        assert!(!b.visible);
    }

    #[test]
    fn every_value_box_is_its_min_width() {
        let b = bouncy();
        let f = b.bold16.as_ref().unwrap();
        for t in ["100.0", "500.0", "200.0", "99.9"] {
            assert!(ceil_px(f.advance_width(t), 3.0) + 22.0 <= 70.0, "{t}");
        }
    }

    #[test]
    fn it_draws_the_grid_and_the_customizer() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let frame = |now_ms| Frame {
            width: W,
            height: H,
            scale: 2.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0)], None).unwrap();
        let mut t = 0.0;
        let (first, _) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        first.save("ios-home-bouncy-start");
        loop {
            let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
            if !moving || t > 15000.0 {
                img.save("ios-home-bouncy-rest");
                // The first square's centre, and the list beside it.
                let p = img.at(111, 239);
                assert!(
                    p[0].abs_diff(0xE6) <= 3 && p[2].abs_diff(0xEA) <= 3,
                    "{p:?}"
                );
                assert_eq!(img.at(20, 239)[..3], [0xFA, 0xFA, 0xFA]);
                break;
            }
            t += FRAME;
        }
        s.input(&pointer(PointerPhase::Down, 200.0, 500.0, t));
        let end = t + 1200.0;
        while t < end {
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
            t += FRAME;
        }
        s.input(&pointer(PointerPhase::Up, 200.0, 500.0, t));
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        img.save("ios-home-bouncy-customizer");
        // The card's white over the blur, a thumb's white.
        let p = img.at(2 * 30, 2 * 300);
        assert!(p[0] >= 0xF8, "{p:?}");
    }
}
