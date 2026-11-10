//! QR Code Generator (src/animations/qrcode: index.tsx, components/slider/index.tsx; Metro
//! resolves `./components/slider` to index.tsx, the `.liquid.tsx` sibling is not a platform
//! extension): a text field, the QR code of what it holds (or "reactiive.io") in a red-to-yellow
//! gradient roughened by a DiscretePathEffect, and a "Deviation" slider for the effect's
//! deviation, in a ScrollView. Everything drawn and every touch is this surface; the Contract
//! shell mounts the real text field over it while it is focused (see below).
//!
//! Layout (Yoga's numbers at window `W × H`, safe top `T`; every edge on the device-pixel grid):
//! - The ScrollView fills the screen (black, flex 1); its content container has paddingTop
//!   T + 50 (`justifyContent: 'center'` moves nothing: the container hugs its content). In it
//!   the TouchableWithoutFeedback's View (W wide), a column of:
//! - the TextInput: marginHorizontal 5 % (0.05 W, so 0.9 W wide), paddingHorizontal and
//!   paddingVertical 15, borderWidth 1 white, borderRadius 10 continuous, fontSize 20 white:
//!   its height is 2 × (15 + 1) plus the placeholder's line as RCTTextLayoutManager measures
//!   it (SF's hhea line at 20, 23.8671875, ceiled to the pixel: 24), so 56; marginBottom 25;
//! - QRCode's View (react-native-qrcode-skia 0.3.1: centring, W wide) holding its Canvas, size
//!   W × 0.9 square, centred: its Path is `qr::rounded_path` of node-qrcode's ECL H symbol of
//!   `qrText || 'reactiive.io'` at that size, then `qr::discrete` (DiscretePathEffect length 10,
//!   the deviation), filled (pathStyle 'fill'; strokeWidth 0.5 is unused) with a
//!   LinearGradient (0, 0) → (W, W) of #FF0000 #FF4D00 #FF9900 #FFCC00, evenly spaced;
//! - sliderContainer (marginLeft 25, marginTop 30) → a View (marginTop 20) → the "Deviation"
//!   Text (white, bold 20, letterSpacing 1: 24 tall) and the Slider (marginTop 30, W − 50 wide,
//!   4 tall): the gray track (borderRadius 5 continuous: 2 at this height), the white progress
//!   bar (sharp, scaleX clamped / width from the left), and the 50 × 50 white picker (top −23,
//!   so centred on the track's middle; borderColor white too, so its borderWidth never shows)
//!   with `[translateX(clamped − 25), scale]` about its centre and its animated borderRadius.
//!
//! The scroll: an iOS ScrollView is a UIScrollView with `alwaysBounceVertical` (RN's default
//! for a vertical ScrollView), so although the content is shorter than the screen a drag
//! rubber-bands the whole column and it bounces back: `ui_scroll::UiScroll` on y (the crate's
//! axis is fed y), port = the screen's height. `keyboardDismissMode="on-drag"`: the keyboard
//! leaves when the drag begins (posted `blur`).
//!
//! Touches, as UIKit and RN deliver them:
//! - On the picker (UIKit's hit test of its transformed frame: 50 × scale about its centre, at
//!   touch-down), RNGH's Pan (`gesture_handler::PanGesture`, UIKit's pan) and the
//!   UIScrollView's pan both see the finger; RNGH's recognizer refuses to run with the scroll
//!   view's (`shouldRecognizeSimultaneouslyWithGestureRecognizer` is NO for it) and begins on
//!   the first move past 10 pt, the scroll view's on the second (ui_scroll's measured rule), so
//!   the Pan takes every drag that starts on the picker, whatever its direction. Its onBegin
//!   (touch-down) springs the radius to 25, the border to 4 and the scale to 1 and keeps the
//!   clamped position; onUpdate sets translateX = context + translationX; onTouchesUp (a lift,
//!   active or not; not a cancel) springs them back.
//! - Anywhere else the finger is the scroll view's.
//! - A lift that neither scrolled nor activated the Pan is a press: on the TextInput it focuses
//!   it (posted `focus`); anywhere else it dismisses the keyboard (posted `blur`: the
//!   TouchableWithoutFeedback's `Keyboard.dismiss`, and outside its View the ScrollView's own
//!   `keyboardShouldPersistTaps="handled"` blur). A touch that lands while the scroll moves is
//!   the scroll view's (it stops it; RN's ScrollView captures the responder): no press.
//!
//! The text field: RN's TextInput is uncontrolled and starts empty, showing its placeholder
//! (`qrText` starts at 'reactiive.io', which is what an empty field shows anyway). While it is
//! not focused this surface draws it as UITextField draws an unfocused field: the text (white)
//! or the placeholder (gray) in SF 20 at the left of its text rect (the field inset by padding
//! + border, 16), its line centred in it, the text truncated at its tail with "…" when it does
//! not fit; so it moves with the scroll's rubber band. Focused (the `focused` input), the
//! Contract's real `input` shows over that text rect instead (focus happens at rest: a touch
//! while the scroll moves is no press) and this surface draws only the border.
//!
//! Inputs: `safeTop`, `text` (the field's value), `focused`.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | translateX | Pan onUpdate: context + translationX (RNGH iOS pan) | `PanGesture` (UIKit's hysteresis left out of the translation) |
//! | clampedTranslateX | useDerivedValue clamp(translateX, 0, W − 50) | same, f64 |
//! | deviation | useAnimatedReaction → interpolate(clamped, [0, w], [0, 6]); its first run (startMapper) sets 3 over useSharedValue(6) | `interpolate` each frame; 3 from the first frame |
//! | picker scale | withSpring(1) onBegin, withSpring(0.7) onTouchesUp: default (900, 120, 4) | `Spring::to(.., GENTLE)` with the running velocity (Reanimated's onStart) |
//! | picker borderRadius | withSpring(25) / withSpring(20): default | same |
//! | picker borderWidth | withSpring(4, { dampingRatio 1, duration 500 }) / withSpring(16): never visible (white on white) | `gfx::spring_to` / GENTLE, kept for the agent |
//! | progress bar scaleX | clamped / width, from the left | the bar's right edge at the clamped x, on the pixel grid (a Core Animation layer edge is not antialiased) |
//! | scroll offset | UIScrollView: 1:1 drag, rubber band, bounce (alwaysBounceVertical) | `ui_scroll::UiScroll` |
//! | the QR path | useMemo on value: Skia path; DiscretePathEffect at every deviation | `qr::create` on a text change, `qr::rounded_path` + `qr::discrete` into kept buffers on a text or deviation change |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::{interpolate, Extrapolation, Spring, GENTLE};
use skia::{point, Canvas, Color, Font, Paint, Renderer, Shader};

use crate::gfx;
use crate::qr::{self, Verb};
use crate::ui_scroll::{self, UiScroll};

/// contentContainerStyle paddingTop: safe top + this.
const TOP: f32 = 50.0;
/// styles.textInput: marginHorizontal '5%', paddingHorizontal/Vertical 15, borderWidth 1,
/// borderRadius 10 (continuous), fontSize 20, marginBottom 25.
const INPUT_MARGIN: f32 = 0.05;
const INPUT_PADDING: f32 = 15.0;
const INPUT_BORDER: f32 = 1.0;
const INPUT_RADIUS: f32 = 10.0;
const FONT_SIZE: f32 = 20.0;
const INPUT_BOTTOM: f32 = 25.0;
/// The QRCode's size: windowWidth × 0.9.
const QR_SCALE: f64 = 0.9;
/// DiscretePathEffect length.
const SEGMENT: f32 = 10.0;
/// The LinearGradient's colours (Skia colours), start (0, 0), end (windowWidth, windowWidth).
const GRADIENT: [u32; 4] = [0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00];
/// qrText's fallback, and MAX_QR_TEXT_LENGTH (UTF-16 units).
const FALLBACK: &str = "reactiive.io";
const MAX_LENGTH: usize = 300;
/// The placeholder and its colour ('gray').
const PLACEHOLDER: &str = "Enter text to generate QR code";
const GRAY: u32 = 0x808080;
/// styles.sliderContainer marginLeft 25, marginTop 30; the inner View's marginTop 20.
const SLIDER_LEFT: f32 = 25.0;
const SLIDER_TOP: f32 = 30.0;
const INNER_TOP: f32 = 20.0;
/// styles.title: bold 20, letterSpacing 1.
const TITLE: &str = "Deviation";
const TITLE_SPACING: f32 = 1.0;
/// The Slider's style: marginTop 30, width windowWidth − 50; sliderHeight's default 4.
const TRACK_TOP: f32 = 30.0;
const TRACK_INSET: f32 = 50.0;
const TRACK_HEIGHT: f32 = 4.0;
/// The track's borderRadius (continuous).
const TRACK_RADIUS: f32 = 5.0;
/// pickerSize 50, maxValue 6, minValue 0, initialProgress 0.5.
const PICKER: f32 = 50.0;
const MAX_VALUE: f64 = 6.0;
const MIN_VALUE: f64 = 0.0;
const INITIAL_PROGRESS: f64 = 0.5;
/// defaultScale, pickerSize / 2.5, Math.floor(pickerSize / 3); onBegin's targets.
const SCALE_REST: f64 = 0.7;
const RADIUS_REST: f64 = PICKER as f64 / 2.5;
const BORDER_REST: f64 = 16.0;
const RADIUS_HELD: f64 = PICKER as f64 / 2.0;
const BORDER_HELD: f64 = 4.0;
/// onBegin's borderWidth spring: { dampingRatio: 1, duration: 500 }.
const BORDER_MS: f64 = 500.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(QrCodeGenerator::new())
}

/// Yoga's rounding of an absolute edge to the pixel grid (a half rounds up).
fn grid(v: f32, s: f32) -> f32 {
    ((v * s + 0.5 + 1e-4).floor()) / s
}

/// A measured text height rounded up to the pixel (RCTTextLayoutManager).
fn ceil_px(v: f32, s: f32) -> f32 {
    ((v * s - 1e-3).ceil()) / s
}

/// The line RN measures for a 20-pt system-font Text or TextInput on iOS: SFUI's hhea
/// (1950 + 494) / 2048 × 20 (a constant, so the layout is iOS's wherever this runs: macOS's
/// SFNS, which the tests read, has another line).
const LINE: f32 = 23.867_188;

/// The screen's layout, in content points (the scroll offset not applied), edges on the grid.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f32,
    h: f32,
    s: f32,
    /// The TextInput's frame.
    field: [f32; 4],
    /// The QR canvas's left, top and side (unrounded side: the path's size).
    qr: [f32; 3],
    /// The title's top.
    title: f32,
    /// The track: left, top, width.
    track: [f32; 3],
    /// The content's height.
    content: f32,
}

impl Layout {
    fn new(w: f32, h: f32, s: f32, safe_top: f32, line: f32) -> Layout {
        let text = ceil_px(line, s);
        let pad = safe_top + TOP;
        let field_h = text + 2.0 * (INPUT_PADDING + INPUT_BORDER);
        let field = [
            grid(w * INPUT_MARGIN, s),
            grid(pad, s),
            grid(w * (1.0 - INPUT_MARGIN), s),
            grid(pad + field_h, s),
        ];
        let size = (w as f64 * QR_SCALE) as f32;
        let qr_top = pad + field_h + INPUT_BOTTOM;
        let qr = [grid((w - size) / 2.0, s), grid(qr_top, s), size];
        let title = qr_top + size + SLIDER_TOP + INNER_TOP;
        let track_top = title + text + TRACK_TOP;
        Layout {
            w,
            h,
            s,
            field,
            qr,
            title: grid(title, s),
            track: [grid(SLIDER_LEFT, s), grid(track_top, s), w - TRACK_INSET],
            content: grid(track_top + TRACK_HEIGHT, s),
        }
    }

    /// The field's text rect (inset by padding + border).
    fn text_rect(&self) -> [f32; 4] {
        let i = INPUT_PADDING + INPUT_BORDER;
        let [x0, y0, x1, y1] = self.field;
        [x0 + i, y0 + i, x1 - i, y1 - i]
    }

    /// The slider's width (sliderWidth).
    fn slider_w(&self) -> f64 {
        self.track[2] as f64
    }
}

struct Fonts {
    text: Font,
    title: Font,
}

/// A touch that may end as a press.
#[derive(Clone, Copy, Debug)]
struct Press {
    id: u32,
    /// It came down on the TextInput.
    field: bool,
}

struct QrCodeGenerator {
    safe_top: f32,
    /// The field's value (≤ 300 UTF-16 units) and whether the real field is focused.
    text: String,
    focused: bool,
    /// A `blur` was posted (the keyboard is leaving): draw the field's text again now.
    blurring: bool,
    layout: Layout,
    fonts: Option<Fonts>,
    scroll: UiScroll,
    pan: PanGesture,
    picker_finger: Option<u32>,
    /// translateX and contextX.
    translate_x: f64,
    context_x: f64,
    scale: Spring,
    radius: Spring,
    border: Spring,
    press: Option<Press>,
    posted: Vec<String>,
    /// The QR: the symbol's value, the symbol, and the paths (kept buffers).
    value: String,
    symbol: Option<qr::Symbol>,
    rounded: Vec<Verb>,
    discrete: Vec<Verb>,
    /// What `rounded` and `discrete` were built for: the size, and the deviation's bits.
    rounded_for: Option<f32>,
    discrete_for: Option<(f32, u32)>,
    /// What the field shows unfocused (truncated), and for which text and width.
    shown: String,
    shown_for: Option<(String, u32)>,
    gradient: Paint,
    border_path: Option<(Layout, skia::Path, skia::Path)>,
    canvas: Canvas,
    renderer: Renderer,
}

impl QrCodeGenerator {
    fn new() -> QrCodeGenerator {
        let fonts = skia::match_ui_font(FONT_SIZE, 400.0)
            .zip(skia::match_ui_font(FONT_SIZE, 700.0))
            .map(|(text, title)| Fonts { text, title });
        QrCodeGenerator {
            safe_top: 0.0,
            text: String::new(),
            focused: false,
            blurring: false,
            layout: Layout::default(),
            fonts,
            scroll: UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, ui_scroll::Snap::Free),
            pan: PanGesture::new(),
            picker_finger: None,
            translate_x: f64::NAN,
            context_x: 0.0,
            scale: Spring::at(SCALE_REST),
            radius: Spring::at(RADIUS_REST),
            border: Spring::at(BORDER_REST),
            press: None,
            posted: Vec::new(),
            value: String::new(),
            symbol: None,
            rounded: Vec::new(),
            discrete: Vec::new(),
            rounded_for: None,
            discrete_for: None,
            shown: String::new(),
            shown_for: None,
            gradient: Paint::fill(Color::BLACK),
            border_path: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    /// Lays out for a `w × h` screen at `s` px per point (the first frame, or a new size).
    fn lay_out(&mut self, w: f32, h: f32, s: f32) {
        let layout = Layout::new(w, h, s, self.safe_top, LINE);
        if layout == self.layout {
            return;
        }
        let first = self.layout.s == 0.0;
        self.layout = layout;
        if first || self.translate_x.is_nan() {
            // useSharedValue(initialProgress * sliderWidth).
            self.translate_x = INITIAL_PROGRESS * layout.slider_w();
        }
        self.scroll.max = (layout.content - h).max(0.0) as f64;
        self.scroll.port = h as f64;
        let stops = skia::stops(&GRADIENT.map(Color::hex));
        self.gradient = Paint::shader(Shader::Linear {
            start: point(0.0, 0.0),
            end: point(w, w),
            stops,
        });
        self.border_path = None;
        self.rounded_for = None;
    }

    /// clampedTranslateX.
    fn clamped(&self) -> f64 {
        let w = self.layout.slider_w();
        self.translate_x.max(0.0).min(w)
    }

    /// The Slider's onUpdate(progress): deviationProgress.
    fn deviation(&self) -> f64 {
        interpolate(
            self.clamped(),
            &[0.0, self.layout.slider_w()],
            &[MIN_VALUE, MAX_VALUE],
            Extrapolation::Extend,
        )
    }

    /// The scroll offset as drawn (UIScrollView's contentOffset is on the pixel grid).
    fn offset(&self) -> f32 {
        let s = self.layout.s.max(1.0);
        ((self.scroll.offset as f32) * s).round() / s
    }

    /// The picker's centre on the screen and its side (scale applied).
    fn picker(&self) -> (f32, f32, f32) {
        let [left, top, _] = self.layout.track;
        let cx = left + self.clamped() as f32;
        let cy = top - PICKER / 2.0 + TRACK_HEIGHT / 2.0 + PICKER / 2.0 - self.offset();
        (cx, cy, PICKER * self.scale.value as f32)
    }

    fn on_picker(&self, x: f32, y: f32) -> bool {
        let (cx, cy, side) = self.picker();
        (x - cx).abs() <= side / 2.0 && (y - cy).abs() <= side / 2.0
    }

    fn on_field(&self, x: f32, y: f32) -> bool {
        let [x0, y0, x1, y1] = self.layout.field;
        let off = self.offset();
        x >= x0 && x < x1 && y >= y0 - off && y < y1 - off
    }

    /// Whether this surface draws the field's text (the real field is not showing).
    fn draws_text(&self) -> bool {
        !self.focused || self.blurring
    }

    /// Keyboard.dismiss / the scroll's on-drag dismissal.
    fn blur(&mut self) {
        if self.focused && !self.blurring {
            self.blurring = true;
            self.posted.push("blur".into());
        }
    }

    /// The QR's value: qrText || 'reactiive.io', qrText = text.slice(0, 300).
    fn sync_value(&mut self) {
        let mut units = 0;
        let mut end = self.text.len();
        for (i, c) in self.text.char_indices() {
            if units + c.len_utf16() > MAX_LENGTH {
                end = i;
                break;
            }
            units += c.len_utf16();
        }
        let text = &self.text[..end];
        let value = if text.is_empty() { FALLBACK } else { text };
        if value != self.value || self.symbol.is_none() {
            self.value.clear();
            self.value.push_str(value);
            self.symbol = qr::create(&self.value, qr::Ecl::H);
            self.rounded_for = None;
        }
    }

    /// The path at this size and deviation, rebuilt into the kept buffers when either changed.
    fn sync_path(&mut self) {
        let size = self.layout.qr[2];
        let deviation = self.deviation() as f32;
        if self.rounded_for != Some(size) {
            self.rounded.clear();
            if let Some(symbol) = &self.symbol {
                qr::rounded_path(symbol, self.layout.w as f64 * QR_SCALE, &mut self.rounded);
            }
            self.rounded_for = Some(size);
            self.discrete_for = None;
        }
        if self.discrete_for != Some((size, deviation.to_bits())) {
            qr::discrete(&self.rounded, SEGMENT, deviation, &mut self.discrete);
            self.discrete_for = Some((size, deviation.to_bits()));
        }
    }

    /// What the unfocused field shows: the text, or the placeholder, cut at its tail with "…"
    /// where it is wider than the text rect (UITextField when not editing).
    fn sync_shown(&mut self) {
        let width = {
            let [x0, _, x1, _] = self.layout.text_rect();
            x1 - x0
        };
        let key_ok = self
            .shown_for
            .as_ref()
            .is_some_and(|(t, w)| *t == self.text && *w == width.to_bits());
        if key_ok {
            return;
        }
        self.shown.clear();
        let source = if self.text.is_empty() {
            PLACEHOLDER
        } else {
            self.text.as_str()
        };
        match &self.fonts {
            Some(f) => truncate(&f.text, source, width, &mut self.shown),
            None => self.shown.push_str(source),
        }
        self.shown_for = Some((self.text.clone(), width.to_bits()));
    }

    fn input_pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at_ms: f64) {
        if self.layout.s == 0.0 {
            return;
        }
        match phase {
            Phase::Down => {
                let moving = self.scroll.moving();
                let picker =
                    self.picker_finger.is_none() && !self.pan.tracking() && self.on_picker(x, y);
                if picker {
                    if let Event::Begin { .. } = self.pan.event(id, phase, x, y, at_ms, true) {
                        self.picker_finger = Some(id);
                        self.radius.to(RADIUS_HELD, self.radius.velocity, GENTLE);
                        gfx::spring_to(&mut self.border, BORDER_HELD, BORDER_MS, 1.0);
                        self.scale.to(1.0, self.scale.velocity, GENTLE);
                        self.context_x = self.clamped();
                    }
                }
                // The scroll view sees every finger (a touch stops a moving scroll).
                self.scroll.input(id, phase, y, x, at_ms, true);
                if self.press.is_none() && !moving {
                    self.press = Some(Press {
                        id,
                        field: !picker && self.on_field(x, y),
                    });
                }
            }
            Phase::Move => {
                if self.picker_finger == Some(id) {
                    match self.pan.event(id, phase, x, y, at_ms, true) {
                        Event::Start(p) | Event::Update(p) => {
                            self.translate_x = self.context_x + p.translation_x as f64;
                            // An active RNGH gesture cancels RN's touches: no press.
                            self.cancel_press(id);
                        }
                        _ => {}
                    }
                    return;
                }
                let was = self.scroll.dragging();
                self.scroll.input(id, phase, y, x, at_ms, true);
                if !was && self.scroll.dragging() {
                    self.cancel_press(id);
                    // keyboardDismissMode="on-drag".
                    self.blur();
                }
            }
            Phase::Up | Phase::Cancel => {
                if self.picker_finger == Some(id) {
                    self.pan.event(id, phase, x, y, at_ms, true);
                    self.picker_finger = None;
                    if phase == Phase::Up {
                        // onTouchesUp.
                        self.scale.to(SCALE_REST, self.scale.velocity, GENTLE);
                        self.radius.to(RADIUS_REST, self.radius.velocity, GENTLE);
                        self.border.to(BORDER_REST, self.border.velocity, GENTLE);
                    }
                }
                self.scroll.input(id, phase, y, x, at_ms, true);
                if let Some(p) = self.press.filter(|p| p.id == id) {
                    self.press = None;
                    if phase == Phase::Up {
                        if p.field {
                            if !self.focused {
                                self.posted.push("focus".into());
                            }
                        } else {
                            self.blur();
                        }
                    }
                }
            }
        }
    }

    fn cancel_press(&mut self, id: u32) {
        if self.press.is_some_and(|p| p.id == id) {
            self.press = None;
        }
    }

    /// The whole screen, in points.
    fn record(&mut self) {
        let l = self.layout;
        let off = self.offset();
        let clamped = self.clamped() as f32;
        let draws_text = self.draws_text();
        // The TextInput's Core Animation border: the continuous rounded rect less the one inset
        // by the border's width, with the curve's radius less it (built at a layout change).
        if self.border_path.as_ref().map(|(b, _, _)| *b) != Some(l) {
            let [x0, y0, x1, y1] = l.field;
            let b = INPUT_BORDER;
            let outer = skia::continuous_rrect_path(x0, y0, x1 - x0, y1 - y0, INPUT_RADIUS);
            let inner = skia::continuous_rrect_path(
                x0 + b,
                y0 + b,
                x1 - x0 - 2.0 * b,
                y1 - y0 - 2.0 * b,
                INPUT_RADIUS - b,
            );
            self.border_path = Some((l, outer, inner));
        }
        let white = Paint::fill(Color::view_hex(0xFFFFFF));
        let c = &mut self.canvas;
        c.begin(l.s);
        c.translate(0.0, -off);
        if let Some((_, outer, inner)) = &self.border_path {
            c.draw_path_events(outer.iter().chain(inner.reversed()), &white);
        }

        if let Some(f) = &self.fonts {
            if draws_text {
                let [x0, y0, _, y1] = l.text_rect();
                let top = y0 + (y1 - y0 - gfx::line_height(&f.text)) / 2.0;
                let color = if self.text.is_empty() {
                    Color::hex(GRAY)
                } else {
                    Color::WHITE
                };
                c.draw_text(
                    &self.shown,
                    x0,
                    gfx::baseline(&f.text, top),
                    &f.text,
                    &Paint::fill(color),
                );
            }
            c.draw_text_spaced(
                TITLE,
                l.track[0],
                gfx::baseline(&f.title, l.title),
                &f.title,
                &Paint::fill(Color::WHITE),
                TITLE_SPACING,
            );
        }

        // The QR canvas.
        c.save();
        c.translate(l.qr[0], l.qr[1]);
        let verbs = &self.discrete;
        c.draw_with(&self.gradient, |b| push_verbs(b, verbs));
        c.restore();

        // The slider: the track, the progress bar (its right edge on the pixel grid: a layer
        // edge Core Animation does not antialias), the picker.
        let [left, top, width] = l.track;
        c.draw_continuous_rrect(
            left,
            top,
            width,
            TRACK_HEIGHT,
            TRACK_RADIUS,
            &Paint::fill(Color::view_hex(GRAY)),
        );
        let s = l.s;
        let right = ((left + clamped) * s).round() / s;
        if right > left {
            c.draw_rect(left, top, right - left, TRACK_HEIGHT, &white);
        }
        let k = self.scale.value as f32;
        let side = PICKER * k;
        let (cx, cy) = (left + clamped, top + TRACK_HEIGHT / 2.0);
        let r = (self.radius.value as f32).clamp(0.0, PICKER / 2.0) * k;
        c.draw_rrect(cx - side / 2.0, cy - side / 2.0, side, side, r, &white);
    }
}

/// The QR's verbs into a lyon builder, every contour closed (what Skia fills).
fn push_verbs(b: &mut skia::ScratchBuilder<'_>, verbs: &[Verb]) {
    let mut open = false;
    for v in verbs {
        match *v {
            Verb::Move(p) => {
                if open {
                    b.end(true);
                }
                b.begin(p);
                open = true;
            }
            Verb::Line(p) => {
                b.line_to(p);
            }
            Verb::Quad(c, p) => {
                b.quadratic_bezier_to(c, p);
            }
            Verb::Close => {
                if open {
                    b.end(true);
                    open = false;
                }
            }
        }
    }
    if open {
        b.end(true);
    }
}

/// `text` cut at its tail to fit `width` with "…" after it (Core Text's end truncation), into
/// `out`; the whole text when it fits.
fn truncate(font: &Font, text: &str, width: f32, out: &mut String) {
    out.clear();
    if font.advance_width(text) <= width {
        out.push_str(text);
        return;
    }
    let ellipsis = font.advance_width("\u{2026}");
    let mut end = 0;
    for (i, c) in text.char_indices() {
        let next = i + c.len_utf8();
        if font.advance_width(&text[..next]) + ellipsis > width {
            break;
        }
        end = next;
    }
    out.push_str(&text[..end]);
    out.push('\u{2026}');
}

impl Surface for QrCodeGenerator {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let safe_top = inputs
            .first()
            .map(|v| exact_gpu::json::number(v, "safeTop"))
            .transpose()?
            .unwrap_or(0.0) as f32;
        if safe_top != self.safe_top {
            self.safe_top = safe_top;
            if self.layout.s > 0.0 {
                let (w, h, s) = (self.layout.w, self.layout.h, self.layout.s);
                self.layout = Layout::default();
                self.lay_out(w, h, s);
            }
        }
        if let Some(v) = inputs.get(1) {
            let text = exact_gpu::json::text(v, "text")?;
            if text != self.text {
                self.text = text;
            }
        }
        let focused = match inputs.get(2) {
            Some(Value::Bool(b)) => *b,
            Some(v) => exact_gpu::json::number(v, "focused")? != 0.0,
            None => false,
        };
        if focused != self.focused {
            self.focused = focused;
            self.blurring = false;
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
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
        self.input_pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"value\":{:?},\"version\":{},\"deviation\":{:.4},\"translateX\":{:.3},\"scale\":{:.4},\"radius\":{:.3},\"borderWidth\":{:.3},\"scroll\":{:.2},\"focused\":{},\"held\":{}}}",
            self.value,
            self.symbol.as_ref().map_or(0, |s| s.version),
            self.deviation() + 0.0,
            self.translate_x + 0.0,
            self.scale.value,
            self.radius.value,
            self.border.value,
            self.scroll.offset + 0.0,
            self.focused,
            self.picker_finger.is_some()
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
        self.lay_out(frame.width, frame.height, frame.scale);
        let now = frame.now_ms;
        let mut moving = self.scroll.step(now);
        moving |= self.scale.step(now);
        moving |= self.radius.step(now);
        moving |= self.border.step(now);
        moving |= self.pan.tracking();
        self.sync_value();
        self.sync_path();
        self.sync_shown();
        self.record();
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
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const FRAME_MS: f64 = 1000.0 / 60.0;
    const SAFE_TOP: f64 = 68.0;

    fn ready() -> QrCodeGenerator {
        let mut q = QrCodeGenerator::new();
        q.bind(
            &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(false)],
            None,
        )
        .unwrap();
        q.lay_out(420.0, 912.0, 3.0);
        q
    }

    fn touch(q: &mut QrCodeGenerator, phase: Phase, x: f32, y: f32, ms: f64) {
        q.input_pointer(1, phase, x, y, ms);
    }

    /// A drag from `from` to `to` in `n` moves 16 ms apart, starting at `ms`; returns the time.
    fn drag(q: &mut QrCodeGenerator, from: (f32, f32), to: (f32, f32), n: usize, ms: f64) -> f64 {
        touch(q, Phase::Down, from.0, from.1, ms);
        let mut t = ms;
        for k in 1..=n {
            t += 16.0;
            let u = k as f32 / n as f32;
            touch(
                q,
                Phase::Move,
                from.0 + (to.0 - from.0) * u,
                from.1 + (to.1 - from.1) * u,
                t,
            );
        }
        t
    }

    #[test]
    fn layout_is_yogas() {
        let q = ready();
        let l = q.layout;
        // The field: 21…399 × 118…174 (56: 2 × 16 + the line ceiled to 24).
        assert_eq!(l.field, [21.0, 118.0, 399.0, 174.0]);
        assert_eq!(l.text_rect(), [37.0, 134.0, 383.0, 158.0]);
        // The QR canvas: 378 square at (21, 199).
        assert_eq!(l.qr, [21.0, 199.0, 378.0]);
        // sliderContainer 607, its View 627: the title 627…651, the track 681…685.
        assert_eq!(l.title, 627.0);
        assert_eq!(l.track, [25.0, 681.0, 370.0]);
        assert_eq!(l.content, 685.0);
        // Shorter than the screen: no range, the bounce only.
        assert_eq!(q.scroll.max, 0.0);
        // An odd width: edges on the third-point grid.
        let l = Layout::new(393.0, 852.0, 3.0, 59.0, LINE);
        assert!(
            ((l.field[0] * 3.0) - (l.field[0] * 3.0).round()).abs() < 1e-3,
            "{}",
            l.field[0]
        );
        assert!((l.qr[2] - 353.7).abs() < 1e-3);
    }

    #[test]
    fn the_resting_deviation_is_the_reactions_first_run() {
        let mut q = ready();
        // initialProgress 0.5 × 370 → interpolate(185, [0, 370], [0, 6]) = 3.
        assert_eq!(q.translate_x, 185.0);
        assert_eq!(q.deviation(), 3.0);
        q.sync_value();
        q.sync_path();
        assert_eq!(q.value, "reactiive.io");
        // The same verbs qr::discrete gives for the rounded path at 378, 10, 3 (CanvasKit's,
        // checked bit for bit in qr's tests).
        let s = qr::create("reactiive.io", qr::Ecl::H).unwrap();
        let mut src = Vec::new();
        qr::rounded_path(&s, 378.0, &mut src);
        let mut want = Vec::new();
        qr::discrete(&src, 10.0, 3.0, &mut want);
        assert_eq!(q.discrete, want);
    }

    #[test]
    fn the_text_picks_the_value_and_is_cut_at_300_units() {
        let mut q = ready();
        q.text = "hello".into();
        q.sync_value();
        assert_eq!(q.value, "hello");
        q.text = "é".repeat(400);
        q.sync_value();
        assert_eq!(q.value.chars().count(), 300);
        assert!(q.symbol.is_some(), "300 units always fit at H");
        q.text.clear();
        q.sync_value();
        assert_eq!(q.value, "reactiive.io");
    }

    #[test]
    fn the_picker_follows_the_pan_and_clamps() {
        let mut q = ready();
        // The picker: centre (25 + 185, 683), 35 × 35 at rest.
        let (cx, cy, side) = q.picker();
        assert_eq!((cx, cy), (210.0, 683.0));
        assert!((side - 35.0).abs() < 1e-4);
        assert!(!q.on_picker(210.0 + 18.0, 683.0) && q.on_picker(210.0 + 17.0, 683.0));
        touch(&mut q, Phase::Down, 210.0, 683.0, 0.0);
        // onBegin: the springs head for 1, 25, 4.
        assert_eq!(
            (q.scale.target(), q.radius.target(), q.border.target()),
            (1.0, 25.0, 4.0)
        );
        // 60 pt to the right: the translation leaves out UIKit's 10 pt.
        let mut t = 0.0;
        for k in 1..=6 {
            t += 16.0;
            touch(&mut q, Phase::Move, 210.0 + 10.0 * k as f32, 683.0, t);
        }
        assert!((q.translate_x - 235.0).abs() < 1e-4, "{}", q.translate_x);
        assert!((q.deviation() - 235.0 / 370.0 * 6.0).abs() < 1e-9);
        assert_eq!(q.scroll.offset, 0.0, "the pan took the drag");
        // Far past the end: clamped to the width, deviation 6.
        touch(&mut q, Phase::Move, 600.0, 683.0, t + 16.0);
        assert_eq!(q.clamped(), 370.0);
        assert_eq!(q.deviation(), 6.0);
        touch(&mut q, Phase::Up, 600.0, 683.0, t + 32.0);
        assert_eq!(
            (q.scale.target(), q.radius.target(), q.border.target()),
            (0.7, 20.0, 16.0)
        );
        assert!(q.messages().is_empty(), "a pan is no press");
        // Back from 370 (the translateX keeps the overshoot: context is the clamped value). The
        // first move comes 16 ms after the down, 39.5 pt from it: UIKit begins the pan that early
        // with its translation zeroed at the finger (port-demo's Pan trap), so the 395 pt drag
        // moves the picker 355.5 and it stops at 14.5, as RN's would.
        let t = drag(&mut q, (395.0, 683.0), (0.0, 683.0), 10, 1000.0);
        touch(&mut q, Phase::Up, 0.0, 683.0, t);
        assert!((q.clamped() - 14.5).abs() < 1e-4, "{}", q.clamped());
        assert!((q.deviation() - 14.5 / 370.0 * 6.0).abs() < 1e-6);
        // A drag that sets off after 90 ms leaves out the 10 pt instead: 40 pt left reads 30.
        let t0 = t + 500.0;
        touch(&mut q, Phase::Down, 30.0, 683.0, t0);
        touch(&mut q, Phase::Move, 15.0, 683.0, t0 + 100.0);
        touch(&mut q, Phase::Move, -10.0, 683.0, t0 + 116.0);
        assert!(
            (q.translate_x - (14.5 - 30.0)).abs() < 1e-4,
            "{}",
            q.translate_x
        );
        touch(&mut q, Phase::Up, -10.0, 683.0, t0 + 132.0);
        assert_eq!(q.clamped(), 0.0);
        assert_eq!(q.deviation(), 0.0);
    }

    #[test]
    fn a_vertical_drag_on_the_picker_is_the_pans() {
        let mut q = ready();
        let t = drag(&mut q, (210.0, 683.0), (210.0, 583.0), 8, 0.0);
        assert_eq!(q.scroll.offset, 0.0);
        assert!(!q.scroll.dragging());
        touch(&mut q, Phase::Up, 210.0, 583.0, t);
        assert_eq!(q.translate_x, 185.0, "no horizontal travel");
    }

    #[test]
    fn a_drag_elsewhere_rubber_bands_and_bounces_back() {
        let mut q = ready();
        q.bind(
            &[
                Value::Number(SAFE_TOP),
                Value::str("abc"),
                Value::Bool(true),
            ],
            None,
        )
        .unwrap();
        let t = drag(&mut q, (210.0, 400.0), (210.0, 600.0), 10, 0.0);
        // Pulled down 200 pt (less the hysteresis): the band shows less, negative offset.
        assert!(
            q.scroll.offset < -50.0 && q.scroll.offset > -190.0,
            "{}",
            q.scroll.offset
        );
        // keyboardDismissMode on-drag: blurred once, the field's text drawn by the surface now.
        assert_eq!(q.messages(), vec!["blur".to_string()]);
        assert!(q.draws_text());
        touch(&mut q, Phase::Up, 210.0, 600.0, t + 16.0);
        assert!(q.messages().is_empty(), "a scroll is no press");
        let mut ms = t + 16.0;
        while q.scroll.step(ms) {
            ms += FRAME_MS;
            assert!(ms < 5000.0);
        }
        assert_eq!(q.scroll.offset, 0.0);
        // Up from rest also bands (alwaysBounceVertical) and returns.
        let t = drag(&mut q, (210.0, 600.0), (210.0, 400.0), 10, ms + 100.0);
        assert!(q.scroll.offset > 50.0, "{}", q.scroll.offset);
        touch(&mut q, Phase::Up, 210.0, 400.0, t + 16.0);
    }

    #[test]
    fn presses_focus_the_field_or_dismiss_the_keyboard() {
        let mut q = ready();
        // A tap on the field (its whole 56-pt frame) focuses it.
        touch(&mut q, Phase::Down, 30.0, 120.0, 0.0);
        touch(&mut q, Phase::Up, 30.0, 120.0, 80.0);
        assert_eq!(q.messages(), vec!["focus".to_string()]);
        // Unfocused, a tap elsewhere posts nothing.
        touch(&mut q, Phase::Down, 210.0, 400.0, 200.0);
        touch(&mut q, Phase::Up, 210.0, 400.0, 260.0);
        assert!(q.messages().is_empty());
        q.bind(
            &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(true)],
            None,
        )
        .unwrap();
        assert!(!q.draws_text(), "the real field shows");
        // Focused: a tap on the QR, on the picker (a Pan that never activated) or below the
        // content dismisses the keyboard, once.
        for (x, y) in [(210.0, 400.0), (210.0, 683.0), (210.0, 850.0)] {
            q.bind(
                &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(false)],
                None,
            )
            .unwrap();
            q.bind(
                &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(true)],
                None,
            )
            .unwrap();
            touch(&mut q, Phase::Down, x, y, 300.0);
            touch(&mut q, Phase::Up, x, y, 350.0);
            assert_eq!(q.messages(), vec!["blur".to_string()], "{x} {y}");
            assert!(q.draws_text());
        }
        // A touch while the scroll bounces is the scroll view's: no press.
        q.bind(
            &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(false)],
            None,
        )
        .unwrap();
        let t = drag(&mut q, (210.0, 400.0), (210.0, 600.0), 10, 1000.0);
        touch(&mut q, Phase::Up, 210.0, 600.0, t);
        q.scroll.step(t + 16.0);
        q.scroll.step(t + 32.0);
        assert!(q.scroll.offset < -10.0);
        let y = 120.0 + q.offset();
        touch(&mut q, Phase::Down, 30.0, y, t + 40.0);
        touch(&mut q, Phase::Up, 30.0, y, t + 90.0);
        assert!(q.messages().is_empty());
    }

    #[test]
    fn the_unfocused_field_cuts_long_text_at_its_tail() {
        let Some(font) = skia::match_ui_font(FONT_SIZE, 400.0) else {
            return eprintln!("no system font; skipped");
        };
        let mut out = String::new();
        truncate(&font, PLACEHOLDER, 346.0, &mut out);
        assert_eq!(
            out,
            PLACEHOLDER,
            "the placeholder fits: {}",
            font.advance_width(PLACEHOLDER)
        );
        let long = "https://reactiive.io/demos/qr-code-generator";
        truncate(&font, long, 346.0, &mut out);
        assert!(
            out.ends_with('\u{2026}') && out.len() < long.len() + 3,
            "{out}"
        );
        assert!(font.advance_width(&out) <= 346.0);
    }

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
            at_ms,
        }
    }

    #[test]
    fn renders_the_field_the_qr_and_the_slider() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let px = |img: &fixture::Pixels, x: f32, y: f32| {
            let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
            [p[0] as i32, p[1] as i32, p[2] as i32]
        };
        let near = |a: [i32; 3], b: [i32; 3], tol: i32| (0..3).all(|k| (a[k] - b[k]).abs() <= tol);
        let mut s = QrCodeGenerator::new();
        s.bind(
            &[Value::Number(SAFE_TOP), Value::str(""), Value::Bool(false)],
            None,
        )
        .unwrap();
        let (rest, wants) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        rest.save("qr-code-generator-rest");
        assert!(!wants, "nothing moves at rest");
        // Black around; the field's 1-pt border at its left edge (x 21…22, y 146).
        assert!(near(px(&rest, 5.0, 5.0), [0, 0, 0], 0));
        assert!(
            near(px(&rest, 21.5, 146.0), [255, 255, 255], 2),
            "{:?}",
            px(&rest, 21.5, 146.0)
        );
        assert!(near(px(&rest, 23.0, 146.0), [0, 0, 0], 0));
        // The QR's top-left finder (module 0, 0) is red near (0, 0) of the gradient; the
        // bottom-left finder's far corner leans orange; the finder's inner ring is black.
        let cell = 378.0 / q_size(&s) as f32;
        let tl = px(&rest, 21.0 + cell * 3.5, 199.0 + cell * 0.5);
        assert!(tl[0] > 240 && tl[1] < 60 && tl[2] < 30, "{tl:?}");
        let ring = px(&rest, 21.0 + cell * 1.5, 199.0 + cell * 3.5);
        assert!(near(ring, [0, 0, 0], 0), "{ring:?}");
        let bl = px(&rest, 21.0 + cell * 3.5, 199.0 + 378.0 - cell * 0.5);
        assert!(bl[0] > 240 && bl[1] > tl[1] + 40, "{bl:?} {tl:?}");
        // The track: gray left of the picker is white (progress), right of it gray.
        assert!(
            near(px(&rest, 100.0, 683.0), [255, 255, 255], 1),
            "{:?}",
            px(&rest, 100.0, 683.0)
        );
        assert!(
            near(px(&rest, 300.0, 683.0), [128, 128, 128], 1),
            "{:?}",
            px(&rest, 300.0, 683.0)
        );
        // The picker: 35 pt at (210, 683).
        assert!(near(
            px(&rest, 210.0 + 15.0, 683.0 - 10.0),
            [255, 255, 255],
            1
        ));
        assert!(near(px(&rest, 210.0 + 19.0, 683.0 - 10.0), [0, 0, 0], 0));

        // Held and dragged to the start: deviation 0 (no roughening), the picker at 1.
        s.input(&pointer(PointerPhase::Down, 210.0, 683.0, 100.0));
        let mut t = 100.0;
        for k in 1..=12 {
            t += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0 - 20.0 * k as f32,
                683.0,
                t,
            ));
        }
        let mut img = None;
        while t < 1200.0 {
            t += FRAME_MS;
            img = Some(fixture::render(&gpu, &mut s, &frame(t)).unwrap().0);
        }
        let held = img.unwrap();
        held.save("qr-code-generator-held");
        assert_eq!(s.deviation(), 0.0);
        assert!((s.scale.value - 1.0).abs() < 1e-6 && (s.radius.value - 25.0).abs() < 1e-6);
        // The picker: a 50-pt circle centred on the track's start.
        assert!(near(px(&held, 25.0 + 20.0, 683.0), [255, 255, 255], 1));
        assert!(
            near(px(&held, 25.0 + 19.0, 683.0 - 19.0), [0, 0, 0], 0),
            "outside the circle"
        );
        s.input(&pointer(PointerPhase::Up, 0.0, 683.0, t));

        // Typed text and a long one: the QR's value changes; the field shows the text cut.
        s.bind(
            &[
                Value::Number(SAFE_TOP),
                Value::str("https://reactiive.io/demos/qr-code-generator/exact"),
                Value::Bool(false),
            ],
            None,
        )
        .unwrap();
        let (typed, _) = fixture::render(&gpu, &mut s, &frame(t + 2000.0)).unwrap();
        typed.save("qr-code-generator-typed");
        assert!(s.symbol.as_ref().unwrap().version > 2);

        // Pulled down 150 pt: the whole column moves (the field's border with it).
        let mut t = t + 3000.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 400.0, t));
        for k in 1..=10 {
            t += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0,
                400.0 + 15.0 * k as f32,
                t,
            ));
        }
        let (pulled, wants) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        pulled.save("qr-code-generator-pulled");
        assert!(wants);
        let off = s.offset();
        assert!(off < -40.0, "{off}");
        assert!(near(px(&pulled, 21.5, 146.0 - off), [255, 255, 255], 2));
    }

    fn q_size(s: &QrCodeGenerator) -> usize {
        s.symbol.as_ref().unwrap().size
    }
}
