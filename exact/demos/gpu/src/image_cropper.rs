//! Image Cropper (src/animations/image-cropper: index.tsx; components/image-cropper/index.tsx,
//! grid/index.tsx, grid/useCornerGestures.ts; components/border-button/index.tsx): a square
//! Unsplash photo under a crop grid (a white 3 × 3 grid, the outside dimmed, four white dots at
//! the corners) that a finger moves or resizes by its corners; Expand, Collapse and Crop buttons
//! under it; Crop presents the cropped region full screen in a native Modal (slide), whose Back
//! dismisses it. All of it is this surface: the canvas, its touches, the buttons, the Modal.
//!
//! Layout (React Native 0.88's Yoga, checked against exact/parity-tools/image-cropper/
//! yoga-layout.cpp; window `W × H`, scale `s`; each node's position rounded relative to its
//! parent, half up, a Text's floored; its size from its unrounded absolute edges; text sides
//! ceiled after 0.001 as RCTTextLayoutManager does):
//! - styles.container: black, flex 1, items and content centred. Its children: the
//!   Touchable.Canvas (alignSelf centre, W × W·imageRatio; the photo is 2706 × 2706, so W × W;
//!   backgroundColor black) and styles.buttonsContainer (a row, wrap, space-evenly, marginTop
//!   20, marginHorizontal 10, width 100 %: Yoga centres it at x 0, W wide).
//! - FancyBorderButton (pressto PressableScale: a BaseButton): borderWidth 1 white,
//!   borderRadius 8 (borderCurve continuous, but see the border below), padding 16; its Text
//!   (SF 14 regular, white, letterSpacing 1: Core Text's width with 1 pt after every glyph)
//!   at (17, 17). 51 pt tall (17 + SF 14's 16.707 ceiled to 17 + 17).
//! - The Modal's page (Modal.js's white container, flex 1 > styles.detailContainer: black,
//!   flex 1, centred): its Canvas W × W at (H − W) / 2, and styles.backButtonContainer
//!   (absolute, bottom 100, right 20) holding the Back button.
//!
//! The canvas, as RN Skia 3.7.2's recorder draws it (Graphite, the canvas's own pixels at s):
//! - `<Image rect={(0, 0, W, W)} fit="contain">`: drawImageRect of the whole photo with
//!   SkSamplingOptions(kLinear) (bilinear at level 0, no mipmaps; ImageCmd's default). The
//!   photo is the JPEG useImage fetches (`w=2706`), decoded as SkJpegCodec decodes it
//!   (libjpeg-turbo: exact/parity-tools/image-cropper/photo.py; bundled losslessly).
//! - Grid: `<Path path={grid} color="white" style="stroke" strokeWidth={2.5}>`, its eight
//!   open lines in grid/index.tsx's order (butt caps); `<Group clip={path} invertClip>` over
//!   `<Rect (0, 0, W, W) color="rgba(0,0,0,0.4)">`: SkCanvas::clipPath(path, kDifference) with
//!   no anti-aliasing (the recorder's two-argument call), a rect path → clipRect → Graphite's
//!   ClipStack snaps it to the pixel grid (floor(v + 0.5) in device pixels): the dimming
//!   covers whole pixels outside that rect; the transparent Touchable.Path draws nothing; the
//!   four `<Circle r={8} color="white">` at the corners. All clipped to the canvas's bounds.
//!
//! The buttons, as UIKit shows them: RCTViewComponentView draws a non-clipping view's border
//! with RCTBorderDrawing (circular corners whatever the borderCurve): a stretchable 17 × 17 pt
//! image (caps 8 pt) in a border layer, here CoreGraphics' own pixels
//! (exact/parity-tools/image-cropper/build-border.sh, bundled: border-17pt-r8-w1-3x.a8), its
//! middle stretched. The Text's layer draws the label with UIKit's font. Under pressto's scale
//! Core Animation resamples both layers' backing stores (bilinear, edges hard where the
//! scaled bounds cover a pixel centre): each button is drawn once into an atlas (one pixel of
//! its edge repeated around it, as a clamped sample reads it) and composited scaled.
//!
//! The Modal (RCTModalHostViewComponentView: UIModalPresentationFullScreen, cover vertical,
//! animated): UIKit adds an additive `position` CASpringAnimation (mass 3, stiffness 1000,
//! damping 500, duration 0.5 s, from ±H to 0), which Core Animation runs critically damped
//! (ω = √(1000 / 3)): y = H (1 + ωt) e^(−ωt), cut to 0 at 0.5 s (measured on UIKit for Mac:
//! exact/parity-tools/image-cropper/modal-probe.m). The presented page is composited layer by
//! layer at that fractional offset (its black backgrounds with hard edges; the canvas's
//! texture and the Back button resampled). Back's handleBack clears croppedRect in the same
//! commit as visible = false, so the page loses its content at once and the dismissal slides
//! Modal.js's white container down (H (1 − (1 + ωt) e^(−ωt)) for 0.5 s). UIKit takes no new
//! touch during either transition.
//!
//! Touches, as UIKit hit-tests the views:
//! - A button (its frame under its current scale, CGRectContainsPoint): pressto's BaseButton.
//!   onBegan sets active (progress withTiming(1, { 250 ms, bezier(0.25, 0.1, 0.25, 1) })); the
//!   finger dragged out of the bounds (RNGestureHandlerButton's strict hit frame) makes the
//!   last event's pointerInside false; the lift is TouchUpInside or TouchUpOutside by the same
//!   frame, and BaseButton calls onPress if the lift or the event before it was inside:
//!   PressablesConfig's onPress (the app's selection haptic, `haptic:selection`), then the
//!   button's. onEnded / onCancelled set active false.
//! - The canvas (react-native-skia-gesture's Touchable.Canvas: Gesture.Simultaneous(Pan(),
//!   Tap()); the Tap's onTouchesUp finds no onTap handler): the Pan's onBegin finds the first
//!   touchable whose shape contains the touch-down point in registration order (useEffect
//!   order: the grid's Path, then the TopLeft, TopRight, BottomLeft, BottomRight circles), so a
//!   touch inside the grid moves it even on a dot; only a dot's outside part resizes. Its
//!   onStart (the context) runs then; onUpdate (and the activation's update) passes the
//!   translation, UIKit's (gesture_handler::PanGesture: a 10 pt hysteresis, an early begin
//!   zeroed). SkRect::contains is half-open; a circle contains what is within r of its centre.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | grid x, y | expand: withTiming(0, { duration 250 }) (inOut(quad)); the move Pan's onActive: clamp(t, −ctx, max − size − ctx) + ctx; TopLeft / BottomLeft (x), TopLeft / TopRight (y): clamp(t + ctx, 0, max − new size) | `Timing` (a timing to the target it already runs to keeps its start and from, as timing.ts's onStart); a set cancels |
//! | grid width, height | expand: withTiming(W, H); collapse: withTiming(W / 3, H / 3); a corner's onActive: clamp(±t + ctx, min, max − x / y now) | same |
//! | button scale | pressto: progress withTiming(active, { 250 ms, bezier(0.25, 0.1, 0.25, 1) }), scale interpolate(progress, [0, 1], [1, 0.96]) | `press::Pressto` (layers resampled) |
//! | Modal page y | UIKit cover vertical: CASpringAnimation (3, 1000, 500), critical, 0.5 s | `modal_offset` |
//! | haptics | PressablesConfig onPress: selection, at each button's press | `haptic:selection` |
//!
//! Inputs: none.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::{Easing, Timing};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;

/// The photo as RN Skia decodes it: 2706 × 2706 RGB rows, each minus the row above, zlib.
static PHOTO: &[u8] = include_bytes!("../images/image-cropper/photo-2706x2706.rgb8up.zlib");
const PHOTO_PX: u32 = 2706;
/// imageRatio: image.height() / image.width().
const RATIO: f64 = PHOTO_PX as f64 / PHOTO_PX as f64;
/// RCTGetBorderImage's stretchable border image at 3×: 51 × 51 alpha, caps 24 px.
static BORDER: &[u8] = include_bytes!("../images/image-cropper/border-17pt-r8-w1-3x.a8");
const BORDER_PX: i32 = 51;
const BORDER_CAP_PX: i32 = 24;

/// Grid's dotRadius default.
const DOT_RADIUS: f32 = 8.0;
/// The grid Path's strokeWidth.
const GRID_STROKE: f32 = 2.5;
/// The dimming Rect's rgba(0,0,0,0.4).
const DIM_ALPHA: f32 = 0.4;
/// AnimationDuration (TimingConfig: the default easing, inOut(quad)).
const TIMING_MS: f64 = 250.0;
/// FancyBorderButton: borderWidth 1, padding 16.
const BUTTON_INSET: f64 = 1.0 + 16.0;
/// The Text's default fontSize and its letterSpacing.
const TEXT_SIZE: f32 = 14.0;
const LETTER_SPACING: f32 = 1.0;
/// styles.buttonsContainer: marginTop 20, marginHorizontal 10.
const ROW_MARGIN_TOP: f64 = 20.0;
const ROW_MARGIN_H: f64 = 10.0;
/// styles.backButtonContainer: bottom 100, right 20.
const BACK_BOTTOM: f64 = 100.0;
const BACK_RIGHT: f64 = 20.0;
/// The buttons' titles; 3 is the Modal's Back.
const LABELS: [&str; 4] = ["Expand", "Collapse", "Crop", "Back"];
const BACK: usize = 3;
/// UIKit's cover-vertical spring: mass, stiffness; its duration.
const MODAL_MASS: f64 = 3.0;
const MODAL_STIFFNESS: f64 = 1000.0;
const MODAL_MS: f64 = 500.0;
/// Pixels between the atlas's cells (each also has its edge repeated once around it).
const GAP: i32 = 4;

/// Yoga's `inexactEquals`.
fn inexact(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.0001
}

/// Yoga's `roundValueToPixelGrid`.
fn round_px(value: f64, s: f64, ceil: bool, floor: bool) -> f64 {
    let v = value * s;
    let mut f = v % 1.0;
    if f < 0.0 {
        f += 1.0;
    }
    let r = if inexact(f, 0.0) {
        v - f
    } else if inexact(f, 1.0) {
        v - f + 1.0
    } else if ceil {
        v - f + 1.0
    } else if floor {
        v - f
    } else {
        v - f + if f > 0.5 || inexact(f, 0.5) { 1.0 } else { 0.0 }
    };
    r / s
}

/// RCTTextLayoutManager's measured side (internal_roundTextMeasurementToPixelGrid).
fn text_side(v: f64, s: f64) -> f64 {
    ((v + 0.001) * s).ceil() / s
}

/// One laid-out node: its unrounded absolute origin (Yoga's), where it shows (the sum of its
/// ancestors' rounded relative positions) and its rounded size.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Node {
    abs: [f64; 2],
    at: [f64; 2],
    size: [f64; 2],
}

impl Node {
    fn root(w: f64, h: f64) -> Node {
        Node {
            abs: [0.0; 2],
            at: [0.0; 2],
            size: [w, h],
        }
    }

    /// A child at (x, y) relative, w × h unrounded; `text` for a Text node (floored position,
    /// its size ceiled when fractional).
    fn child(&self, x: f64, y: f64, w: f64, h: f64, text: bool, s: f64) -> Node {
        let abs = [self.abs[0] + x, self.abs[1] + y];
        let side = |a: f64, len: f64| {
            let f = (len * s) % 1.0;
            let fractional = !inexact(f, 0.0) && !inexact(f, 1.0);
            round_px(a + len, s, text && fractional, text && !fractional)
                - round_px(a, s, false, text)
        };
        Node {
            abs,
            at: [
                self.at[0] + round_px(x, s, false, text),
                self.at[1] + round_px(y, s, false, text),
            ],
            size: [side(abs[0], w), side(abs[1], h)],
        }
    }

    /// Whether (x, y) is inside the node scaled by `k` about its centre (CGRectContainsPoint).
    fn contains(&self, x: f64, y: f64, k: f64) -> bool {
        let (cx, cy) = (
            self.at[0] + self.size[0] / 2.0,
            self.at[1] + self.size[1] / 2.0,
        );
        let (hw, hh) = (self.size[0] * k / 2.0, self.size[1] * k / 2.0);
        x >= cx - hw && x < cx + hw && y >= cy - hh && y < cy + hh
    }
}

/// The views' frames (points) for a window.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f64,
    h: f64,
    s: f64,
    /// The Touchable.Canvas.
    canvas: Node,
    /// The buttons (Expand, Collapse, Crop on the screen; Back on the Modal's page at rest).
    buttons: [Node; 4],
    /// Their Texts.
    texts: [Node; 4],
    /// The Modal's Canvas (on its page at rest).
    detail: Node,
}

impl Layout {
    /// `text_w`: each title's Core Text width with the letterSpacing; `line`: SF 14's line.
    fn new(w: f64, h: f64, s: f64, text_w: [f64; 4], line: f64) -> Layout {
        let root = Node::root(w, h);
        let th = text_side(line, s);
        let bw = text_w.map(|t| 2.0 * BUTTON_INSET + text_side(t, s));
        let bh = 2.0 * BUTTON_INSET + th;
        // The canvas: height = width × imageRatio.
        let ch = w * RATIO;
        // justifyContent centre: the column's content (canvas, the row with its marginTop).
        let top = (h - (ch + ROW_MARGIN_TOP + bh)) / 2.0;
        let canvas = root.child((w - w) / 2.0, top, w, ch, false, s);
        // width 100 % with marginHorizontal 10, centred: (W − (W + 20)) / 2 + 10.
        let row = root.child(
            (w - w - 2.0 * ROW_MARGIN_H) / 2.0 + ROW_MARGIN_H,
            top + ch + ROW_MARGIN_TOP,
            w,
            bh,
            false,
            s,
        );
        // space-evenly: the free space in four equal parts, around and between the three.
        let even = (w - bw[0] - bw[1] - bw[2]) / 4.0;
        let mut buttons = [Node::default(); 4];
        let mut texts = [Node::default(); 4];
        let mut x = even;
        for i in 0..3 {
            buttons[i] = row.child(x, 0.0, bw[i], bh, false, s);
            x += bw[i] + even;
        }
        // The Modal's page: the detail container fills it.
        let page = Node::root(w, h);
        let detail = page.child((w - w) / 2.0, (h - ch) / 2.0, w, ch, false, s);
        let container = page.child(
            w - BACK_RIGHT - bw[BACK],
            h - BACK_BOTTOM - bh,
            bw[BACK],
            bh,
            false,
            s,
        );
        buttons[BACK] = container.child(0.0, 0.0, bw[BACK], bh, false, s);
        for i in 0..4 {
            texts[i] = buttons[i].child(
                BUTTON_INSET,
                BUTTON_INSET,
                text_side(text_w[i], s),
                th,
                true,
                s,
            );
        }
        Layout {
            w,
            h,
            s,
            canvas,
            buttons,
            texts,
            detail,
        }
    }
}

/// An SkRect as JsiSkRect keeps one (`Skia.XYWHRect(x, y, w, h)`: floats, right = x + w).
#[derive(Clone, Copy, Debug, PartialEq)]
struct SkRect {
    l: f32,
    t: f32,
    r: f32,
    b: f32,
}

impl SkRect {
    fn xywh(x: f64, y: f64, w: f64, h: f64) -> SkRect {
        let (x, y) = (x as f32, y as f32);
        SkRect {
            l: x,
            t: y,
            r: x + w as f32,
            b: y + h as f32,
        }
    }
    /// SkRect::contains(x, y): half-open.
    fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.l && x < self.r && y >= self.t && y < self.b
    }
}

/// A touchable of the grid (grid/index.tsx; useCornerGestures' createCornerHandler arguments).
#[derive(Clone, Copy, Debug, PartialEq)]
enum Handle {
    /// The Touchable.Path: moves the grid.
    Move,
    /// A corner: isNegativeX, isNegativeY, updateX, updateY.
    Corner(bool, bool, bool, bool),
}

const TOP_LEFT: Handle = Handle::Corner(true, true, true, true);
const TOP_RIGHT: Handle = Handle::Corner(false, true, false, true);
const BOTTOM_LEFT: Handle = Handle::Corner(true, false, true, false);
const BOTTOM_RIGHT: Handle = Handle::Corner(false, false, false, false);

/// Reanimated's shared values x, y, gridWidth, gridHeight.
#[derive(Clone, Debug)]
struct Grid {
    x: Timing,
    y: Timing,
    w: Timing,
    h: Timing,
}

/// `v.set(withTiming(to, TimingConfig))`: a timing to the target the running one already has
/// keeps its start time and start value (timing.ts onStart).
fn time_to(v: &mut Timing, to: f64) {
    if v.running && v.target() == to {
        return;
    }
    v.to(to, TIMING_MS, Easing::timing_default());
}

/// RN Skia's clamp: Math.min(Math.max(lowerBound, value), upperBound).
fn clamp(value: f64, lower: f64, upper: f64) -> f64 {
    value.max(lower).min(upper)
}

/// The Modal's state.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Modal {
    Hidden,
    /// Presenting since (ms).
    Presenting(f64),
    Shown,
    /// Dismissing since (ms): the page is Modal.js's empty white container.
    Dismissing(f64),
}

/// The detail Canvas's drawing: FitBox's transform and the clip, in its pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Detail {
    /// rect2rect's scaleX, scaleY, translateX, translateY, as the Group's SkM44 holds them.
    m: [f32; 4],
    /// clipRect(croppedRect) mapped to the canvas's pixels and rounded (Graphite's snap):
    /// left, top, right, bottom.
    clip: [f32; 4],
}

/// FitBox(fit "contain", src = croppedRect, dst = (0, 0, W, W)) over Group clip={croppedRect}.
fn detail_for(crop: SkRect, w: f64, h: f64, s: f64, px: [f64; 2]) -> Detail {
    // fitbox's JS: the rect's getters (floats), doubles from there.
    let (sx0, sy0) = (crop.l as f64, crop.t as f64);
    let (sw, sh) = ((crop.r - crop.l) as f64, (crop.b - crop.t) as f64);
    let (dw, dh) = (w as f32 as f64, h as f32 as f64);
    // applyBoxFit "contain".
    let (fw, fh) = if dw / dh > sw / sh {
        (sw * dh / sh, dh)
    } else {
        (dw, sh * dw / sw)
    };
    // inscribe(dst sizes, dst).
    let (dx, dy) = ((dw - fw) / 2.0, (dh - fh) / 2.0);
    // rect2rect(src, dst).
    let (scx, scy) = (fw / sw, fh / sh);
    let (tx, ty) = (dx - sx0 * scx, dy - sy0 * scy);
    let m = [scx as f32, scy as f32, tx as f32, ty as f32];
    // The CTM: scale(s) · translate(tx, ty) · scale(sx, sy), in floats; clipRect mapped,
    // intersected with the canvas's pixels, then floor(v + 0.5).
    let s32 = s as f32;
    let (a, d, e, f) = (s32 * m[0], s32 * m[1], s32 * m[2], s32 * m[3]);
    let snap = |v: f32, hi: f32| (v.max(0.0).min(hi) + 0.5).floor();
    let clip = [
        snap(a * crop.l + e, px[0] as f32),
        snap(d * crop.t + f, px[1] as f32),
        snap(a * crop.r + e, px[0] as f32),
        snap(d * crop.b + f, px[1] as f32),
    ];
    Detail { m, clip }
}

/// UIKit's cover-vertical spring as Core Animation runs it (critically damped), at `t` ms
/// after its start: the fraction of the travel left.
fn modal_left(t_ms: f64) -> f64 {
    let t = (t_ms / 1000.0).max(0.0);
    let w = (MODAL_STIFFNESS / MODAL_MASS).sqrt();
    (1.0 + w * t) * (-w * t).exp()
}

mod press {
    //! pressto's PressableScale (node_modules/pressto/src: pressables/base.tsx, custom/scale.ts,
    //! provider/constants.ts: the app's PressablesConfig keeps the default 'timing' animation and
    //! config) on RNGH's BaseButton, as designed: kept in one place for the shared module.
    use reanimated::{interpolate, Easing, Extrapolation, Timing};

    /// DefaultAnimationConfigs.timing.duration.
    const PRESSTO_MS: f64 = 250.0;
    /// DefaultPressableConfig.minScale (baseScale 1).
    const PRESSTO_MIN_SCALE: f64 = 0.96;

    /// One PressableScale: its finger, whether the last event was inside, its progress.
    #[derive(Clone, Debug)]
    pub(super) struct Pressto {
        pub(super) progress: Timing,
        pub(super) finger: Option<u32>,
        inside: bool,
    }

    impl Pressto {
        pub(super) fn new() -> Pressto {
            Pressto {
                progress: Timing::at(0.0),
                finger: None,
                inside: false,
            }
        }

        /// `progress = withTiming(active ? 1 : 0, DefaultAnimationConfigs.timing)` (useDerivedValue
        /// re-run when active changes; the same target keeps the running timeline).
        fn animate(&mut self, active: bool) {
            let to = if active { 1.0 } else { 0.0 };
            if self.progress.running && self.progress.target() == to {
                return;
            }
            self.progress
                .to(to, PRESSTO_MS, Easing::bezier(0.25, 0.1, 0.25, 1.0));
        }

        /// onBegan (handleTouchDown): active.
        pub(super) fn down(&mut self, id: u32) {
            self.finger = Some(id);
            self.inside = true;
            self.animate(true);
        }

        /// A move of the finger: DragInside / DragOutside's pointerInside.
        pub(super) fn moved(&mut self, inside: bool) {
            self.inside = inside;
        }

        /// The finger lifts `inside` (TouchUpInside) or not, or is cancelled: onEnded /
        /// onCancelled set active false; whether BaseButton calls onPress (its handleEvent: the
        /// END after ACTIVE, not cancelled, while lastIsPressed: TouchUpInside's ACTIVE event,
        /// or the last drag's when the lift is outside).
        pub(super) fn up(&mut self, cancelled: bool, inside: bool) -> bool {
            self.finger = None;
            self.animate(false);
            !cancelled && (inside || self.inside)
        }

        /// scale.ts: interpolate(progress, [0, 1], [baseScale 1, minScale 0.96]).
        pub(super) fn scale(&self) -> f64 {
            interpolate(
                self.progress.value,
                &[0.0, 1.0],
                &[1.0, PRESSTO_MIN_SCALE],
                Extrapolation::Extend,
            )
        }

        pub(super) fn step(&mut self, now: f64) -> bool {
            self.progress.step(now)
        }
    }
}

/// Where the atlas keeps each layer (pixels): the photo as the canvas shows it, the detail
/// Canvas, each button (its content's top-left; one repeated pixel around each but the photo).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Atlas {
    size: [u32; 2],
    photo: [i32; 2],
    detail: [i32; 2],
    buttons: [[i32; 2]; 4],
}

/// One button's border image at its size, its edge repeated once around it: runs of equal
/// coverage (x, y, w, h in the cell's pixels from its repeated corner; alpha).
fn border_runs(w: i32, h: i32) -> Vec<([i32; 4], u8)> {
    // CALayer.contentsCenter: the caps 1:1, the middle pixel stretched (nearest).
    let at = |x: i32, y: i32| -> u8 {
        let map = |v: i32, len: i32| {
            if v < BORDER_CAP_PX {
                v
            } else if v >= len - BORDER_CAP_PX {
                v - (len - BORDER_PX)
            } else {
                BORDER_CAP_PX + 1
            }
        };
        let (x, y) = (x.clamp(0, w - 1), y.clamp(0, h - 1));
        BORDER
            .get((map(y, h) * BORDER_PX + map(x, w)) as usize)
            .copied()
            .unwrap_or(0)
    };
    let mut runs: Vec<([i32; 4], u8)> = Vec::new();
    for y in -1..=h {
        let mut x = -1;
        while x <= w {
            let a = at(x, y);
            let mut e = x + 1;
            while e <= w && at(e, y) == a {
                e += 1;
            }
            if a != 0 {
                let r = [x + 1, y + 1, e - x, 1];
                match runs
                    .iter_mut()
                    .find(|(q, qa)| *qa == a && q[0] == r[0] && q[2] == r[2] && q[1] + q[3] == r[1])
                {
                    Some((q, _)) => q[3] += 1,
                    None => runs.push((r, a)),
                }
            }
            x = e;
        }
    }
    runs
}

/// The photo's RGBA texels (opaque), its rows restored from their deltas.
fn photo() -> skia::Image {
    let mut rgb = miniz_oxide::inflate::decompress_to_vec_zlib(PHOTO).unwrap_or_default();
    let n = PHOTO_PX as usize;
    let row = n * 3;
    if rgb.len() != row * n {
        return skia::Image {
            width: 1,
            height: 1,
            pixels: vec![0, 0, 0, 255],
        };
    }
    for y in 1..n {
        let (above, here) = rgb.split_at_mut(y * row);
        let above = &above[(y - 1) * row..];
        for (b, a) in here[..row].iter_mut().zip(above) {
            *b = b.wrapping_add(*a);
        }
    }
    let mut pixels = vec![255u8; n * n * 4];
    for (d, s) in pixels.chunks_exact_mut(4).zip(rgb.chunks_exact(3)) {
        d[..3].copy_from_slice(s);
    }
    skia::Image {
        width: PHOTO_PX,
        height: PHOTO_PX,
        pixels,
    }
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(ImageCropper::new())
}

struct Gpu {
    generation: u32,
    photo: Images,
    atlas: Images,
    atlas_view: wgpu::TextureView,
    atlas_size: [u32; 2],
}

struct ImageCropper {
    layout: Layout,
    /// SF 14 (None where the system face can't be read: the web).
    font: Option<Font>,
    grid: Grid,
    /// The Touchable.Canvas's Pan and the touchable its onBegin found.
    pan: PanGesture,
    owner: Option<Handle>,
    /// The move gesture's ctx {x, y}; the corners' ctx {x, y, width, height}.
    move_ctx: [f64; 2],
    corner_ctx: [f64; 4],
    presses: [press::Pressto; 4],
    modal: Modal,
    /// croppedRect's drawing while the page shows it.
    detail: Option<Detail>,
    posted: Vec<String>,
    now: f64,
    atlas: Atlas,
    atlas_dirty: bool,
    borders: Vec<Vec<([i32; 4], u8)>>,
    canvas: Canvas,
    layer_canvas: Canvas,
    renderer: Renderer,
    layer_renderer: Renderer,
    gpu: Option<Gpu>,
}

impl ImageCropper {
    fn new() -> ImageCropper {
        ImageCropper {
            layout: Layout::default(),
            font: None,
            grid: Grid {
                x: Timing::at(0.0),
                y: Timing::at(0.0),
                w: Timing::at(0.0),
                h: Timing::at(0.0),
            },
            pan: PanGesture::new(),
            owner: None,
            move_ctx: [0.0; 2],
            corner_ctx: [0.0; 4],
            presses: std::array::from_fn(|_| press::Pressto::new()),
            modal: Modal::Hidden,
            detail: None,
            posted: Vec::new(),
            now: 0.0,
            atlas: Atlas::default(),
            atlas_dirty: true,
            borders: Vec::new(),
            canvas: Canvas::default(),
            layer_canvas: Canvas::default(),
            renderer: Renderer::default(),
            layer_renderer: Renderer::default(),
            gpu: None,
        }
    }

    /// The layout for this window; the grid at its first values (minWidth, minHeight) the
    /// first time.
    fn lay_out(&mut self, w: f64, h: f64, s: f64) {
        let l = &self.layout;
        if l.w == w && l.h == h && l.s == s {
            return;
        }
        if self.font.is_none() {
            self.font = skia::match_ui_font(TEXT_SIZE, 400.0);
        }
        let (text_w, line) = match &self.font {
            Some(f) => (
                LABELS.map(|t| f.advance_width_spaced(t, LETTER_SPACING) as f64),
                gfx::line_height(f) as f64,
            ),
            None => ([0.0; 4], 0.0),
        };
        let first = self.layout.w == 0.0;
        self.layout = Layout::new(w, h, s, text_w, line);
        if first {
            // useSharedValue(0), (0), (minWidth), (minHeight).
            let (mw, mh) = self.limits();
            self.grid.w.set(mw);
            self.grid.h.set(mh);
        }
        self.borders = (0..4)
            .map(|i| {
                let b = self.layout.buttons[i];
                border_runs(
                    (b.size[0] * s).round() as i32,
                    (b.size[1] * s).round() as i32,
                )
            })
            .collect();
        self.atlas_dirty = true;
    }

    /// maxWidth (width), maxHeight (height = width × imageRatio).
    fn max(&self) -> (f64, f64) {
        (self.layout.w, self.layout.w * RATIO)
    }

    /// minWidth (width / 3), minHeight (height / 3).
    fn limits(&self) -> (f64, f64) {
        let (w, h) = self.max();
        (w / 3.0, h / 3.0)
    }

    /// getGridRect / the Path's rect: rect(x, y, gridWidth, gridHeight).
    fn grid_rect(&self) -> SkRect {
        let g = &self.grid;
        SkRect::xywh(g.x.value, g.y.value, g.w.value, g.h.value)
    }

    /// The first touchable containing the touch-down point (canvas points), in registration
    /// order: the grid's Path, then the TopLeft, TopRight, BottomLeft, BottomRight circles.
    fn touchable_at(&self, x: f32, y: f32) -> Option<Handle> {
        if self.grid_rect().contains(x, y) {
            return Some(Handle::Move);
        }
        let g = &self.grid;
        let (gx, gy, gw, gh) = (g.x.value, g.y.value, g.w.value, g.h.value);
        // topRightX = gridWidth + x, bottomLeftY = gridHeight + y.
        let dots = [
            (gx, gy, TOP_LEFT),
            (gw + gx, gy, TOP_RIGHT),
            (gx, gh + gy, BOTTOM_LEFT),
            (gw + gx, gh + gy, BOTTOM_RIGHT),
        ];
        dots.into_iter().find_map(|(cx, cy, h)| {
            let (cx, cy, r) = (cx as f32, cy as f32, DOT_RADIUS);
            let inside = x >= cx - r && x < cx + r && y >= cy - r && y < cy + r && {
                let (dx, dy) = (x - cx, y - cy);
                dx * dx + dy * dy <= r * r
            };
            inside.then_some(h)
        })
    }

    /// The touchable's onStart: its context.
    fn on_start(&mut self, h: Handle) {
        let g = &self.grid;
        match h {
            Handle::Move => self.move_ctx = [g.x.value, g.y.value],
            Handle::Corner(..) => {
                self.corner_ctx = [g.x.value, g.y.value, g.w.value, g.h.value];
            }
        }
    }

    /// The touchable's onActive with the pan's translation.
    fn on_active(&mut self, h: Handle, tx: f64, ty: f64) {
        let (max_w, max_h) = self.max();
        let (min_w, min_h) = self.limits();
        let g = &mut self.grid;
        match h {
            Handle::Move => {
                let [cx, cy] = self.move_ctx;
                g.x.set(clamp(tx, -cx, max_w - g.w.value - cx) + cx);
                g.y.set(clamp(ty, -cy, max_h - g.h.value - cy) + cy);
            }
            Handle::Corner(neg_x, neg_y, upd_x, upd_y) => {
                let [cx, cy, cw, ch] = self.corner_ctx;
                // calculateNewDimensions: against x and y as they are now.
                let new_w = clamp(if neg_x { -tx } else { tx } + cw, min_w, max_w - g.x.value);
                let new_h = clamp(if neg_y { -ty } else { ty } + ch, min_h, max_h - g.y.value);
                g.w.set(new_w);
                g.h.set(new_h);
                if upd_x {
                    g.x.set(clamp(tx + cx, 0.0, max_w - new_w));
                }
                if upd_y {
                    g.y.set(clamp(ty + cy, 0.0, max_h - new_h));
                }
            }
        }
    }

    /// The Pan's callbacks for one of its events.
    fn on_pan(&mut self, event: Event) {
        match event {
            Event::Begin { x, y } => {
                self.owner = self.touchable_at(x, y);
                if let Some(h) = self.owner {
                    self.on_start(h);
                }
            }
            // onStart then onUpdate at the activation; onUpdate after.
            Event::Start(p) | Event::Update(p) => {
                if let Some(h) = self.owner {
                    self.on_active(h, p.translation_x as f64, p.translation_y as f64);
                }
            }
            Event::End(_) | Event::Fail => self.owner = None,
            _ => {}
        }
    }

    /// expand(): x, y to 0, gridWidth to width, gridHeight to height.
    fn expand(&mut self) {
        let (w, h) = self.max();
        time_to(&mut self.grid.x, 0.0);
        time_to(&mut self.grid.y, 0.0);
        time_to(&mut self.grid.w, w);
        time_to(&mut self.grid.h, h);
    }

    /// collapse(): gridWidth to minWidth, gridHeight to minHeight.
    fn collapse(&mut self) {
        let (w, h) = self.limits();
        time_to(&mut self.grid.w, w);
        time_to(&mut self.grid.h, h);
    }

    /// handleCrop: croppedRect = getGridRect(), showDetail: the Modal presents.
    fn crop(&mut self, at: f64) {
        let l = &self.layout;
        let px = [
            (l.detail.size[0] * l.s).round(),
            (l.detail.size[1] * l.s).round(),
        ];
        self.detail = Some(detail_for(
            self.grid_rect(),
            l.detail.size[0],
            l.detail.size[1],
            l.s,
            px,
        ));
        self.modal = Modal::Presenting(at);
        self.atlas_dirty = true;
    }

    /// handleBack: showDetail false and croppedRect null in one commit.
    fn back(&mut self, at: f64) {
        self.detail = None;
        self.modal = Modal::Dismissing(at);
    }

    fn on_press(&mut self, i: usize, at: f64) {
        // PressablesConfig's globalHandlers.onPress, then the button's.
        self.posted.push("haptic:selection".into());
        match i {
            0 => self.expand(),
            1 => self.collapse(),
            2 => self.crop(at),
            _ => self.back(at),
        }
    }

    fn transitioning(&self) -> bool {
        matches!(self.modal, Modal::Presenting(_) | Modal::Dismissing(_))
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, at: f64) {
        let (fx, fy) = (x as f64, y as f64);
        match phase {
            Phase::Down => {
                // UIKit ignores new touches while a presentation transition runs.
                if self.transitioning() {
                    return;
                }
                let buttons: &[usize] = if self.modal == Modal::Shown {
                    &[BACK]
                } else {
                    &[0, 1, 2]
                };
                for &i in buttons {
                    let k = self.presses[i].scale();
                    if self.layout.buttons[i].contains(fx, fy, k) {
                        if self.presses[i].finger.is_none() {
                            self.presses[i].down(id);
                        }
                        return;
                    }
                }
                if self.modal != Modal::Hidden {
                    return;
                }
                let c = self.layout.canvas;
                if c.contains(fx, fy, 1.0) && !self.pan.tracking() {
                    let (px, py) = ((fx - c.at[0]) as f32, (fy - c.at[1]) as f32);
                    let e = self.pan.event(id, phase, px, py, at, true);
                    self.on_pan(e);
                }
            }
            Phase::Move | Phase::Up | Phase::Cancel => {
                for i in 0..4 {
                    if self.presses[i].finger != Some(id) {
                        continue;
                    }
                    let k = self.presses[i].scale();
                    let inside = self.layout.buttons[i].contains(fx, fy, k);
                    if phase == Phase::Move {
                        self.presses[i].moved(inside);
                    } else if self.presses[i].up(phase == Phase::Cancel, inside) {
                        self.on_press(i, at);
                    }
                    return;
                }
                let c = self.layout.canvas;
                let (px, py) = ((fx - c.at[0]) as f32, (fy - c.at[1]) as f32);
                let e = self.pan.event(id, phase, px, py, at, true);
                self.on_pan(e);
            }
        }
    }

    /// Advances everything to `now`; whether anything still moves.
    fn step(&mut self, now: f64) -> bool {
        self.now = now;
        match self.modal {
            Modal::Presenting(t0) if now - t0 >= MODAL_MS => self.modal = Modal::Shown,
            Modal::Dismissing(t0) if now - t0 >= MODAL_MS => self.modal = Modal::Hidden,
            _ => {}
        }
        let g = &mut self.grid;
        let mut moving = g.x.step(now) | g.y.step(now) | g.w.step(now) | g.h.step(now);
        for p in &mut self.presses {
            moving |= p.step(now);
        }
        moving
            || self.transitioning()
            || self.pan.tracking()
            || self.presses.iter().any(|p| p.finger.is_some())
    }

    /// The page's offset (points) and whether it is the empty white container, at `now`.
    fn page(&self) -> Option<(f64, bool)> {
        let h = self.layout.h;
        match self.modal {
            Modal::Hidden => None,
            Modal::Shown => Some((0.0, false)),
            Modal::Presenting(t0) => Some((h * modal_left(self.now - t0), false)),
            Modal::Dismissing(t0) => Some((h * (1.0 - modal_left(self.now - t0)), true)),
        }
    }

    /// Plans the atlas: the photo's canvas, the detail canvas, the four buttons.
    fn plan_atlas(&mut self) {
        let l = &self.layout;
        let px = |v: f64| (v * l.s).round() as i32;
        let (cw, ch) = (px(l.canvas.size[0]), px(l.canvas.size[1]));
        let (dw, dh) = (px(l.detail.size[0]), px(l.detail.size[1]));
        let detail = [1, ch + GAP + 1];
        let y = detail[1] + dh + 1 + GAP + 1;
        let mut x = 1;
        let mut buttons = [[0; 2]; 4];
        let mut tall = 0;
        for (i, b) in buttons.iter_mut().enumerate() {
            *b = [x, y];
            x += px(l.buttons[i].size[0]) + 2 + GAP;
            tall = tall.max(px(l.buttons[i].size[1]));
        }
        let width = cw.max(dw + 2).max(x);
        self.atlas = Atlas {
            size: [width.max(1) as u32, (y + tall + 1).max(1) as u32],
            photo: [0, 0],
            detail,
            buttons,
        };
    }

    /// Records the atlas's layers into `layer_canvas` (its images: the photo).
    fn record_atlas(&mut self, photo: skia::ImageRef) {
        let l = self.layout;
        let s = l.s as f32;
        let a = self.atlas;
        let c = &mut self.layer_canvas;
        c.begin(s);
        let px = |v: f64| (v * l.s).round() as f32;
        // The canvas's photo: drawImageRect(image, (0, 0, 2706, 2706), (0, 0, W, W), kLinear).
        let (cw, ch) = (px(l.canvas.size[0]), px(l.canvas.size[1]));
        let to_photo = Matrix::scale(
            PHOTO_PX as f32 / l.canvas.size[0] as f32,
            PHOTO_PX as f32 / (l.canvas.size[0] * RATIO) as f32,
        );
        c.save();
        clip_px(c, a.photo[0] as f32, a.photo[1] as f32, cw, ch);
        c.translate(a.photo[0] as f32 / s, a.photo[1] as f32 / s);
        c.draw_rect(
            0.0,
            0.0,
            l.canvas.size[0] as f32,
            (l.canvas.size[0] * RATIO) as f32,
            &Paint::image(photo, to_photo),
        );
        c.restore();
        // The detail canvas, its edge repeated: drawn nine times, each part shifted a pixel.
        if let Some(d) = self.detail {
            let (dw, dh) = (px(l.detail.size[0]), px(l.detail.size[1]));
            let [ox, oy] = [a.detail[0] as f32, a.detail[1] as f32];
            for (sx, sy) in SHIFTS {
                let span = |o: f32, len: f32, sh: i32| match sh {
                    -1 => (o - 1.0, 1.0),
                    1 => (o + len, 1.0),
                    _ => (o, len),
                };
                let (rx, rw) = span(ox, dw, sx);
                let (ry, rh) = span(oy, dh, sy);
                let (gx, gy) = (ox + sx as f32, oy + sy as f32);
                c.save();
                clip_px(c, rx, ry, rw, rh);
                // Group clip={croppedRect}: a pixel-snapped scissor.
                clip_px(
                    c,
                    gx + d.clip[0],
                    gy + d.clip[1],
                    d.clip[2] - d.clip[0],
                    d.clip[3] - d.clip[1],
                );
                c.translate(gx / s, gy / s);
                // FitBox's Group: translateX, translateY, scaleX, scaleY.
                c.concat(Matrix::translate(d.m[2], d.m[3]));
                c.concat(Matrix::scale(d.m[0], d.m[1]));
                c.draw_rect(
                    0.0,
                    0.0,
                    l.detail.size[0] as f32,
                    (l.detail.size[0] * RATIO) as f32,
                    &Paint::image(
                        photo,
                        Matrix::scale(
                            PHOTO_PX as f32 / l.detail.size[0] as f32,
                            PHOTO_PX as f32 / (l.detail.size[0] * RATIO) as f32,
                        ),
                    ),
                );
                c.restore();
            }
        }
        // The buttons: the border image's pixels, then the Text in its frame.
        let white = Paint::fill(Color::WHITE);
        for i in 0..4 {
            let [bx, by] = a.buttons[i];
            c.save();
            c.set_matrix(Matrix::IDENTITY);
            for &(r, alpha) in &self.borders[i] {
                c.draw_rect(
                    (bx - 1 + r[0]) as f32,
                    (by - 1 + r[1]) as f32,
                    r[2] as f32,
                    r[3] as f32,
                    &Paint::fill(Color::WHITE).with_opacity(alpha as f32 / 255.0),
                );
            }
            c.restore();
            if let Some(f) = &self.font {
                let b = l.buttons[i];
                let t = l.texts[i];
                let (tx, ty) = (t.at[0] - b.at[0], t.at[1] - b.at[1]);
                c.save();
                clip_px(
                    c,
                    bx as f32 + px(tx),
                    by as f32 + px(ty),
                    px(t.size[0]),
                    px(t.size[1]),
                );
                // Points from the cell's whole-pixel corner: the glyphs' subpixel phase is the
                // screen's.
                c.set_matrix(Matrix::scale(s, s).then(Matrix::translate(bx as f32, by as f32)));
                c.draw_text_spaced(
                    LABELS[i],
                    tx as f32,
                    gfx::baseline(f, ty as f32),
                    f,
                    &white,
                    LETTER_SPACING,
                );
                c.restore();
            }
        }
    }

    /// Records the frame into `canvas` (its images: the atlas).
    fn record(&mut self, atlas: skia::ImageRef) {
        let l = self.layout;
        let s = l.s;
        let a = self.atlas;
        let page = self.page();
        let rect = self.grid_rect();
        let g = &self.grid;
        let (gx, gy, gw, gh) = (g.x.value, g.y.value, g.w.value, g.h.value);
        let c = &mut self.canvas;
        c.begin(s as f32);
        let px = |v: f64| (v * s).round() as f32;
        // styles.container: black.
        c.draw_rect(0.0, 0.0, l.w as f32, l.h as f32, &Paint::fill(Color::BLACK));
        // The canvas: the photo (its pixels from the atlas), the grid, the dimming, the dots.
        let (cx, cy, cw, ch) = (
            px(l.canvas.at[0]),
            px(l.canvas.at[1]),
            px(l.canvas.size[0]),
            px(l.canvas.size[1]),
        );
        layer(
            c,
            atlas,
            [a.photo[0] as f32, a.photo[1] as f32],
            [cx, cy, cw, ch],
            1.0,
            0.0,
        );
        c.save();
        clip_px(c, cx, cy, cw, ch);
        c.translate(l.canvas.at[0] as f32, l.canvas.at[1] as f32);
        let p = |x: f64, y: f64| skia::point(x as f32, y as f32);
        c.draw_with(&Paint::stroke(Color::WHITE, GRID_STROKE), |b| {
            let lines = [
                (p(gx, gh / 3.0 + gy), p(gw + gx, gh / 3.0 + gy)),
                (
                    p(gx, (gh / 3.0) * 2.0 + gy),
                    p(gw + gx, (gh / 3.0) * 2.0 + gy),
                ),
                (p(gx, gh + gy), p(gw + gx, gh + gy)),
                (p(gw / 3.0 + gx, gy), p(gw / 3.0 + gx, gh + gy)),
                (
                    p((gw / 3.0) * 2.0 + gx, gy),
                    p((gw / 3.0) * 2.0 + gx, gh + gy),
                ),
                (p(gw + gx, gy), p(gw + gx, gh + gy)),
                (p(gx, gy), p(gx, gh + gy)),
                (p(gx, gy), p(gw + gx, gy)),
            ];
            for (from, to) in lines {
                b.begin(from);
                b.line_to(to);
                b.end(false);
            }
        });
        // The dimming: whole pixels outside the snapped grid rect (canvas pixels).
        let m = c.matrix();
        c.set_matrix(Matrix::IDENTITY);
        let s32 = s as f32;
        let snap = |v: f32, hi: f32| (v.max(0.0).min(hi) + 0.5).floor();
        let (l0, t0) = (snap(rect.l * s32, cw), snap(rect.t * s32, ch));
        let (r0, b0) = (snap(rect.r * s32, cw), snap(rect.b * s32, ch));
        let dim = Paint::fill(Color::BLACK.alpha(DIM_ALPHA));
        for [x, y, w, h] in [
            [0.0, 0.0, cw, t0],
            [0.0, b0, cw, ch - b0],
            [0.0, t0, l0, b0 - t0],
            [r0, t0, cw - r0, b0 - t0],
        ] {
            if w > 0.0 && h > 0.0 {
                c.draw_rect(cx + x, cy + y, w, h, &dim);
            }
        }
        c.set_matrix(m);
        let white = Paint::fill(Color::WHITE);
        for (x, y) in [(gx, gy), (gw + gx, gy), (gx, gh + gy), (gw + gx, gh + gy)] {
            c.draw_circle(x as f32, y as f32, DOT_RADIUS, &white);
        }
        c.restore();
        // The buttons, each its layer at pressto's scale.
        for i in 0..3 {
            let b = l.buttons[i];
            let k = self.presses[i].scale() as f32;
            let [ox, oy] = a.buttons[i];
            layer(
                c,
                atlas,
                [ox as f32, oy as f32],
                [px(b.at[0]), px(b.at[1]), px(b.size[0]), px(b.size[1])],
                k,
                0.0,
            );
        }
        // The Modal's page.
        if let Some((offset, empty)) = page {
            let oy = (offset * s) as f32;
            let (w, h) = (px(l.w), px(l.h));
            // Its background layers: hard edges where a pixel's centre is covered.
            let top = (oy - 0.5).ceil().max(0.0);
            c.save();
            c.set_matrix(Matrix::IDENTITY);
            if top < h {
                let bg = if empty { Color::WHITE } else { Color::BLACK };
                c.draw_rect(0.0, top, w, h - top, &Paint::fill(bg));
            }
            c.restore();
            if !empty {
                let d = l.detail;
                let [ox, oy0] = a.detail;
                layer(
                    c,
                    atlas,
                    [ox as f32, oy0 as f32],
                    [px(d.at[0]), px(d.at[1]), px(d.size[0]), px(d.size[1])],
                    1.0,
                    oy,
                );
                let b = l.buttons[BACK];
                let [bx, by] = a.buttons[BACK];
                layer(
                    c,
                    atlas,
                    [bx as f32, by as f32],
                    [px(b.at[0]), px(b.at[1]), px(b.size[0]), px(b.size[1])],
                    self.presses[BACK].scale() as f32,
                    oy,
                );
            }
        }
    }
}

/// The nine copies of a layer that repeat its edge: (dx, dy) in pixels.
const SHIFTS: [(i32, i32); 9] = [
    (0, 0),
    (-1, 0),
    (1, 0),
    (0, -1),
    (0, 1),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

/// A clip to device pixels (x, y, w, h), whatever the canvas's transform.
fn clip_px(c: &mut Canvas, x: f32, y: f32, w: f32, h: f32) {
    let m = c.matrix();
    c.set_matrix(Matrix::IDENTITY);
    c.clip_rect(x, y, w, h);
    c.set_matrix(m);
}

/// A Core Animation layer: the atlas's pixels at `cell` (its size in `frame`), shown at
/// `frame` (device pixels x, y, w, h at rest), scaled by `k` about its centre and moved down
/// `oy` device pixels; its edges hard (the pixels whose centres it covers), its texels
/// sampled bilinearly.
fn layer(c: &mut Canvas, atlas: skia::ImageRef, cell: [f32; 2], frame: [f32; 4], k: f32, oy: f32) {
    let [x, y, w, h] = frame;
    let (cx, cy) = (x + w / 2.0, y + h / 2.0 + oy);
    let (x0, y0) = (cx - k * w / 2.0, cy - k * h / 2.0);
    let (x1, y1) = (cx + k * w / 2.0, cy + k * h / 2.0);
    let edge = |v: f32| (v - 0.5).ceil();
    let (qx0, qy0, qx1, qy1) = (edge(x0), edge(y0), edge(x1), edge(y1));
    if qx1 <= qx0 || qy1 <= qy0 {
        return;
    }
    let to = Matrix::translate(-x0, -y0)
        .then(Matrix::scale(1.0 / k, 1.0 / k))
        .then(Matrix::translate(cell[0], cell[1]));
    c.save();
    c.set_matrix(Matrix::IDENTITY);
    c.draw_rect(qx0, qy0, qx1 - qx0, qy1 - qy0, &Paint::image(atlas, to));
    c.restore();
}

impl Surface for ImageCropper {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
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
        self.pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let g = &self.grid;
        let modal = match self.modal {
            Modal::Hidden => "hidden",
            Modal::Presenting(_) => "presenting",
            Modal::Shown => "shown",
            Modal::Dismissing(_) => "dismissing",
        };
        let pressed: Vec<bool> = self.presses.iter().map(|p| p.finger.is_some()).collect();
        Some(format!(
            "{{\"grid\":[{:.3},{:.3},{:.3},{:.3}],\"modal\":\"{modal}\",\"pressed\":{pressed:?},\"held\":{}}}",
            g.x.value,
            g.y.value,
            g.w.value,
            g.h.value,
            self.pan.tracking() || pressed.iter().any(|&p| p)
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
        self.lay_out(frame.width as f64, frame.height as f64, frame.scale as f64);
        let moving = self.step(frame.now_ms);
        if self
            .gpu
            .as_ref()
            .is_none_or(|g| g.generation != frame.shader_generation)
        {
            // The photo is kept across a pipeline rebuild; the atlas is redrawn.
            let photo = match self.gpu.take() {
                Some(g) => g.photo,
                None => Images::upload_unmipped(device, queue, &photo()),
            };
            self.layer_renderer.set_images(&photo);
            let atlas = Images::target(device, 1, 1);
            let atlas_view = atlas.render_view();
            self.gpu = Some(Gpu {
                generation: frame.shader_generation,
                photo,
                atlas,
                atlas_view,
                atlas_size: [0, 0],
            });
            self.atlas_dirty = true;
        }
        if self.atlas_dirty {
            self.plan_atlas();
            let size = self.atlas.size;
            let gpu = self.gpu.as_mut().unwrap();
            if gpu.atlas_size != size {
                gpu.atlas = Images::target(device, size[0], size[1]);
                gpu.atlas_view = gpu.atlas.render_view();
                gpu.atlas_size = size;
            }
            let photo = gpu.photo.image(0);
            self.renderer.set_images(&gpu.atlas);
            self.record_atlas(photo);
            let gpu = self.gpu.as_ref().unwrap();
            self.layer_renderer.draw(
                device,
                queue,
                encoder,
                &self.layer_canvas,
                &gpu.atlas_view,
                wgpu::TextureFormat::Rgba8Unorm,
                size[0],
                size[1],
                wgpu::Color::TRANSPARENT,
            );
            self.atlas_dirty = false;
        }
        let atlas = self.gpu.as_ref().unwrap().atlas.image(0);
        self.record(atlas);
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
    use exact_gpu::fixture;

    const FRAME_MS: f64 = 1000.0 / 60.0;
    /// The titles' widths and SF 14's line as this Mac's San Francisco gives them (the
    /// fixtures' font; the iPhone's measures its own).
    const MAC_TEXT: [f64; 4] = [53.817383, 63.767578, 35.363281, 35.759766];
    const MAC_LINE: f64 = 16.488281;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 0.0005
    }

    fn at(n: Node, x: f64, y: f64, w: f64, h: f64) {
        assert!(
            close(n.at[0], x) && close(n.at[1], y) && close(n.size[0], w) && close(n.size[1], h),
            "{n:?} vs ({x}, {y}, {w}, {h})"
        );
    }

    fn ready() -> ImageCropper {
        let mut a = ImageCropper::new();
        a.lay_out(420.0, 912.0, 3.0);
        a
    }

    fn touch(a: &mut ImageCropper, id: u32, phase: Phase, x: f32, y: f32, t: f64) {
        a.pointer(id, phase, x, y, t);
    }

    /// A drag from (x, y) by (dx, dy) in `n` moves over `ms`, starting at `t` (a down, moves,
    /// an up); returns the time of the up.
    fn drag(
        a: &mut ImageCropper,
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        n: u32,
        t: f64,
        ms: f64,
    ) -> f64 {
        touch(a, 7, Phase::Down, x, y, t);
        for i in 1..=n {
            let k = i as f32 / n as f32;
            let tt = t + ms * i as f64 / n as f64;
            touch(a, 7, Phase::Move, x + dx * k, y + dy * k, tt);
            a.step(tt);
        }
        touch(a, 7, Phase::Up, x + dx, y + dy, t + ms);
        t + ms
    }

    fn tap(a: &mut ImageCropper, i: usize, t: f64) {
        let b = a.layout.buttons[i];
        let (x, y) = (
            (b.at[0] + b.size[0] / 2.0) as f32,
            (b.at[1] + b.size[1] / 2.0) as f32,
        );
        touch(a, 3, Phase::Down, x, y, t);
        a.step(t + 30.0);
        touch(a, 3, Phase::Up, x, y, t + 60.0);
    }

    /// Steps frames from `from` until nothing moves (or `to`); the last frame's time.
    fn settle(a: &mut ImageCropper, from: f64, to: f64) -> f64 {
        let mut t = from;
        while t < to {
            t += FRAME_MS;
            if !a.step(t) {
                break;
            }
        }
        t
    }

    fn grid(a: &ImageCropper) -> [f64; 4] {
        let g = &a.grid;
        [g.x.value, g.y.value, g.w.value, g.h.value]
    }

    fn frame(now: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms: now,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    /// exact/parity-tools/image-cropper's Yoga runner (`/tmp/image-cropper-yoga 420 912 3
    /// 16.488281 53.817383 63.767578 35.363281 35.759766`, and at 393 × 852 with SF 14's iOS line
    /// 16.70703125): every frame as React Native lays it out.
    #[test]
    fn lays_out_as_yoga() {
        let t = |v: f64| (v * 3.0).round() / 3.0;
        let l = Layout::new(420.0, 912.0, 3.0, MAC_TEXT, MAC_LINE);
        at(l.canvas, 0.0, t(210.6667), 420.0, 420.0);
        at(l.buttons[0], 41.0, t(650.6667), 88.0, t(50.6666));
        at(l.texts[0], 58.0, t(667.6667), 54.0, t(16.6666));
        at(l.buttons[1], t(170.3333), t(650.6667), 98.0, t(50.6666));
        at(l.texts[1], t(187.3333), t(667.6667), 64.0, t(16.6666));
        at(
            l.buttons[2],
            t(309.3333),
            t(650.6667),
            t(69.6667),
            t(50.6666),
        );
        at(l.texts[2], t(326.3333), t(667.6667), t(35.6667), t(16.6666));
        at(l.detail, 0.0, 246.0, 420.0, 420.0);
        at(l.buttons[BACK], 330.0, t(761.3333), 70.0, t(50.6667));
        at(l.texts[BACK], 347.0, t(778.3333), 36.0, t(16.6667));
        let l = Layout::new(393.0, 852.0, 3.0, MAC_TEXT, 16.70703125);
        at(l.canvas, 0.0, 194.0, 393.0, 393.0);
        at(l.buttons[0], t(34.3333), 607.0, 88.0, 51.0);
        at(l.texts[0], t(51.3333), 624.0, 54.0, 17.0);
        at(l.buttons[1], t(156.6667), 607.0, 98.0, 51.0);
        at(l.buttons[2], 289.0, 607.0, t(69.6667), 51.0);
        at(l.texts[2], 306.0, 624.0, t(35.6667), 17.0);
        at(l.detail, 0.0, t(229.6667), 393.0, 393.0);
        at(l.buttons[BACK], 303.0, 701.0, 70.0, 51.0);
        at(l.texts[BACK], 320.0, 718.0, 36.0, 17.0);
    }

    /// The bundled photo is libjpeg-turbo's decode of the JPEG RN fetches (photo.py's FNV-1a).
    #[test]
    fn the_photo_is_rn_skias_decode() {
        let img = photo();
        assert_eq!((img.width, img.height), (PHOTO_PX, PHOTO_PX));
        let mut h: u64 = 0xCBF29CE484222325;
        for p in img.pixels.chunks_exact(4) {
            for &b in &p[..3] {
                h = (h ^ b as u64).wrapping_mul(0x100000001B3);
            }
        }
        assert_eq!(h, 0xa64ac14c7f4d46b1);
    }

    /// The border image is RCTGetBorderImage's: 51 × 51, a 3 px ring, round corners; stretched,
    /// the caps stay and the middle repeats.
    #[test]
    fn the_border_is_rn_s_stretched_image() {
        assert_eq!(BORDER.len(), (BORDER_PX * BORDER_PX) as usize);
        let px = |x: i32, y: i32| BORDER[(y * BORDER_PX + x) as usize];
        assert_eq!(
            (px(25, 0), px(25, 2), px(25, 3), px(0, 25), px(3, 25)),
            (255, 255, 0, 255, 0)
        );
        assert_eq!((px(0, 0), px(25, 25)), (0, 0));
        // A 264 × 153 px button: its runs cover the caps and the stretched edges, one pixel out.
        let runs = border_runs(264, 153);
        let mut cov = vec![0u8; 266 * 155];
        for (r, a) in &runs {
            for y in r[1]..r[1] + r[3] {
                for x in r[0]..r[0] + r[2] {
                    cov[(y * 266 + x) as usize] = *a;
                }
            }
        }
        let c = |x: i32, y: i32| cov[((y + 1) * 266 + x + 1) as usize];
        for y in 0..24 {
            for x in 0..24 {
                assert_eq!(c(x, y), px(x, y));
                assert_eq!(c(263 - x, 152 - y), px(50 - x, 50 - y));
            }
        }
        assert_eq!(
            (c(130, 0), c(130, 2), c(130, 3), c(130, 76)),
            (255, 255, 0, 0)
        );
        // The repeated edge: the row above is row 0's, the column left is column 0's.
        assert_eq!((c(130, -1), c(-1, 76), c(-1, -1)), (255, 255, px(0, 0)));
    }

    /// A touch inside the grid moves it, even on a dot (the Path registers first); only a dot's
    /// outside part resizes; a touch elsewhere does nothing.
    #[test]
    fn the_grid_s_path_takes_a_touch_before_its_dots() {
        let a = ready();
        // The grid starts at (0, 0), W / 3 × W / 3 = 140 × 140.
        assert_eq!(grid(&a), [0.0, 0.0, 140.0, 140.0]);
        assert_eq!(a.touchable_at(70.0, 70.0), Some(Handle::Move));
        // Inside the rect, on the bottom-right dot: the Path.
        assert_eq!(a.touchable_at(137.0, 137.0), Some(Handle::Move));
        // The dot's part outside the rect: the corner.
        assert_eq!(a.touchable_at(143.0, 143.0), Some(BOTTOM_RIGHT));
        assert_eq!(a.touchable_at(145.0, 138.0), Some(BOTTOM_RIGHT));
        assert_eq!(a.touchable_at(147.0, 2.0), Some(TOP_RIGHT));
        assert_eq!(a.touchable_at(4.0, 146.0), Some(BOTTOM_LEFT));
        // SkRect::contains is half-open: x 140 is outside the rect, inside the dot.
        assert_eq!(a.touchable_at(140.0, 70.0), None);
        assert_eq!(a.touchable_at(140.0, 135.0), Some(BOTTOM_RIGHT));
        assert_eq!(a.touchable_at(200.0, 200.0), None);
    }

    /// The move Pan: UIKit's translation (10 pt hysteresis left out after 90 ms), clamped in the
    /// canvas.
    #[test]
    fn a_drag_moves_the_grid_within_the_canvas() {
        let mut a = ready();
        let top = a.layout.canvas.at[1] as f32;
        // A slow drag of 100, 50: 90 and 45 after the 10 pt along the set-off are left out.
        drag(&mut a, 70.0, top + 70.0, 100.0, 50.0, 20, 100.0, 1000.0);
        let g = grid(&a);
        let d = (100.0f64 * 100.0 + 50.0 * 50.0).sqrt();
        assert!(
            close(g[0], 100.0 - 10.0 * 100.0 / d) && close(g[1], 50.0 - 10.0 * 50.0 / d),
            "{g:?}"
        );
        // Far past the corner: clamped at W − width.
        drag(&mut a, 150.0, top + 100.0, 900.0, 900.0, 20, 2000.0, 1000.0);
        let g = grid(&a);
        assert_eq!([g[0], g[1]], [280.0, 280.0]);
        // A touch outside the grid does nothing.
        drag(&mut a, 30.0, top + 30.0, -50.0, -50.0, 10, 4000.0, 500.0);
        assert_eq!(grid(&a), [280.0, 280.0, 140.0, 140.0]);
    }

    /// The corners: the bottom-right grows the grid (clamped at max − x); the top-left moves x
    /// and y with the finger, its width from the context, never below minWidth (and x keeps
    /// following the finger then, as useCornerGestures does).
    #[test]
    fn the_corners_resize_as_use_corner_gestures() {
        let mut a = ready();
        let top = a.layout.canvas.at[1] as f32;
        // Bottom-right, from its outer part, a fast drag (the begin within 90 ms: zeroed).
        touch(&mut a, 7, Phase::Down, 143.0, top + 143.0, 0.0);
        touch(&mut a, 7, Phase::Move, 155.0, top + 143.0, 30.0);
        assert_eq!(grid(&a), [0.0, 0.0, 140.0, 140.0]);
        touch(&mut a, 7, Phase::Move, 205.0, top + 193.0, 60.0);
        assert_eq!(grid(&a), [0.0, 0.0, 190.0, 190.0]);
        touch(&mut a, 7, Phase::Move, 905.0, top + 893.0, 90.0);
        assert_eq!(grid(&a), [0.0, 0.0, 420.0, 420.0]);
        touch(&mut a, 7, Phase::Up, 905.0, top + 893.0, 100.0);
        // Expanded, a dot's outer part is outside the canvas: no touch reaches it, and inside
        // the rect the Path takes the touch and can't move it.
        touch(&mut a, 7, Phase::Down, 425.0, top + 418.0, 200.0);
        assert_eq!(a.owner, None);
        touch(&mut a, 7, Phase::Up, 425.0, top + 418.0, 210.0);
        touch(&mut a, 7, Phase::Down, 418.0, top + 418.0, 220.0);
        assert_eq!(a.owner, Some(Handle::Move));
        touch(&mut a, 7, Phase::Move, 300.0, top + 300.0, 260.0);
        touch(&mut a, 7, Phase::Up, 300.0, top + 300.0, 270.0);
        assert_eq!(grid(&a), [0.0, 0.0, 420.0, 420.0]);
        // At (200, 200), 140 × 140: the top-left dragged right by 100 (a begin within 90 ms:
        // the translation from the second move): the width stays at minWidth and x follows the
        // finger, up to maxWidth − 140.
        for v in [&mut a.grid.x, &mut a.grid.y] {
            v.set(200.0);
        }
        for v in [&mut a.grid.w, &mut a.grid.h] {
            v.set(140.0);
        }
        touch(&mut a, 7, Phase::Down, 197.0, top + 197.0, 400.0);
        assert_eq!(a.owner, Some(TOP_LEFT));
        touch(&mut a, 7, Phase::Move, 209.0, top + 197.0, 430.0);
        touch(&mut a, 7, Phase::Move, 309.0, top + 197.0, 460.0);
        assert_eq!(grid(&a), [280.0, 200.0, 140.0, 140.0]);
        // Then 262 left of the activation: the width is clamped against x as it was (280:
        // 420 − 280 = 140) and x goes to clamp(−62, 0, 280) = 0; the next move sees x 0 and
        // grows the width to 262 + 140 − 1 = 401 (x stays clamped at 0).
        touch(&mut a, 7, Phase::Move, -53.0, top + 197.0, 490.0);
        assert_eq!(grid(&a), [0.0, 200.0, 140.0, 140.0]);
        touch(&mut a, 7, Phase::Move, -52.0, top + 197.0, 520.0);
        assert_eq!(grid(&a), [0.0, 200.0, 401.0, 140.0]);
    }

    /// Expand and Collapse: 250 ms timings (inOut(quad)) from where the grid is; a second Expand
    /// keeps the running timeline.
    #[test]
    fn expand_and_collapse_time_the_grid() {
        let mut a = ready();
        a.grid.x.set(100.0);
        a.grid.y.set(50.0);
        tap(&mut a, 0, 0.0);
        assert_eq!(a.messages(), vec!["haptic:selection".to_string()]);
        // The first frame after the press is the timing's start.
        a.step(80.0);
        assert_eq!(grid(&a), [100.0, 50.0, 140.0, 140.0]);
        a.step(80.0 + 125.0);
        let g = grid(&a);
        assert!(close(g[0], 50.0) && close(g[2], 280.0), "{g:?}");
        // Expand again mid-way: the same timeline.
        tap(&mut a, 0, 210.0);
        a.step(80.0 + 187.5);
        let p = 1.0 - (-2.0f64 * 0.75 + 2.0).powi(2) / 2.0;
        assert!(
            close(a.grid.w.value, 140.0 + 280.0 * p),
            "{}",
            a.grid.w.value
        );
        let t = settle(&mut a, 300.0, 2000.0);
        assert_eq!(grid(&a), [0.0, 0.0, 420.0, 420.0]);
        tap(&mut a, 1, t);
        settle(&mut a, t + 60.0, t + 2000.0);
        assert_eq!(grid(&a), [0.0, 0.0, 140.0, 140.0]);
    }

    /// pressto: progress toward 1 from the touch-down (250 ms, bezier(0.25, 0.1, 0.25, 1)), the
    /// scale 1 → 0.96; a finger dragged out and lifted presses nothing.
    #[test]
    fn pressto_scales_and_presses_only_inside() {
        let mut a = ready();
        let b = a.layout.buttons[2];
        let (x, y) = ((b.at[0] + 10.0) as f32, (b.at[1] + 10.0) as f32);
        touch(&mut a, 3, Phase::Down, x, y, 0.0);
        a.step(16.0);
        a.step(16.0 + 250.0);
        assert!(close(a.presses[2].scale(), 0.96));
        touch(&mut a, 3, Phase::Move, x, y - 30.0, 300.0);
        touch(&mut a, 3, Phase::Up, x, y - 30.0, 320.0);
        assert!(a.messages().is_empty());
        assert_eq!(a.modal, Modal::Hidden);
        let t = settle(&mut a, 320.0, 1000.0);
        assert!(close(a.presses[2].scale(), 1.0));
        // Lifted just outside after a move inside: lastIsPressed was true, so onPress.
        let (x0, y0) = (b.at[0] as f32 + 2.0, b.at[1] as f32 + 2.0);
        touch(&mut a, 3, Phase::Down, x0, y0, t);
        touch(&mut a, 3, Phase::Move, x0 - 1.0, y0, t + 20.0);
        touch(&mut a, 3, Phase::Up, x0 - 3.0, y0, t + 40.0);
        assert_eq!(a.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(a.modal, Modal::Presenting(t + 40.0));
    }

    /// Crop presents the page with UIKit's cover-vertical spring (critical, 0.5 s), Back slides
    /// the empty white container down; no touch lands during either.
    #[test]
    fn crop_presents_and_back_dismisses_the_modal() {
        let mut a = ready();
        a.grid.x.set(70.0);
        a.grid.y.set(140.0);
        tap(&mut a, 2, 0.0);
        assert_eq!(a.modal, Modal::Presenting(60.0));
        // FitBox: 140 × 140 scaled to 420 × 420 (3×), from (70, 140).
        let d = a.detail.unwrap();
        assert_eq!(d.m, [3.0, 3.0, -210.0, -420.0]);
        assert_eq!(d.clip, [0.0, 0.0, 1260.0, 1260.0]);
        a.step(60.0 + 100.0);
        let (oy, empty) = a.page().unwrap();
        let w = (1000.0f64 / 3.0).sqrt();
        assert!(
            !empty && close(oy, 912.0 * (1.0 + w * 0.1) * (-w * 0.1).exp()),
            "{oy}"
        );
        // A touch during the transition is not taken.
        tap(&mut a, BACK, 200.0);
        assert!(
            a.presses.iter().all(|p| p.finger.is_none()) && a.modal != Modal::Dismissing(260.0)
        );
        a.step(60.0 + 499.0);
        assert!(a.page().unwrap().0 > 0.5);
        a.step(60.0 + 500.0);
        assert_eq!((a.modal, a.page()), (Modal::Shown, Some((0.0, false))));
        a.messages();
        tap(&mut a, BACK, 1000.0);
        assert_eq!(a.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(a.modal, Modal::Dismissing(1060.0));
        a.step(1060.0 + 250.0);
        let (oy, empty) = a.page().unwrap();
        assert!(
            empty && close(oy, 912.0 * (1.0 - modal_left(250.0))),
            "{oy}"
        );
        a.step(1060.0 + 500.0);
        assert_eq!((a.modal, a.page()), (Modal::Hidden, None));
    }

    /// A wide crop fits the width; its clip is the snapped scissor where the crop lands.
    #[test]
    fn a_wide_crop_fits_the_width() {
        let d = detail_for(
            SkRect::xywh(10.5, 20.25, 280.0, 140.0),
            420.0,
            420.0,
            3.0,
            [1260.0, 1260.0],
        );
        assert_eq!(d.m, [1.5, 1.5, -15.75, 74.625]);
        assert_eq!(d.clip, [0.0, 315.0, 1260.0, 945.0]);
    }

    #[test]
    fn renders_the_cropper_the_buttons_and_the_modal() {
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let mut a = ready();
        let (img, _) = fixture::render(&gpu, &mut a, &frame(0.0)).unwrap();
        img.save("image-cropper-rest");
        let px = |img: &fixture::Pixels, x: f32, y: f32| img.at((x * 3.0) as u32, (y * 3.0) as u32);
        let top = a.layout.canvas.at[1] as f32;
        // The container black above the canvas; a grid line white; the dots white.
        assert_eq!(&px(&img, 200.0, 100.0)[..3], &[0, 0, 0]);
        assert_eq!(&px(&img, 70.0, top + 140.0 / 3.0)[..3], &[255, 255, 255]);
        assert_eq!(&px(&img, 141.5, top + 141.5)[..3], &[255, 255, 255]);
        // Outside the grid the photo is dimmed to 0.6: compare with the copy in the atlas.
        let b = a.layout.buttons[0];
        // The Expand button's border: white at its left edge's middle.
        assert_eq!(
            &px(
                &img,
                b.at[0] as f32 + 0.5,
                (b.at[1] + b.size[1] / 2.0) as f32
            )[..3],
            &[255, 255, 255]
        );
        // Drag the grid, press Collapse (held: scaled), then Crop.
        drag(&mut a, 70.0, top + 70.0, 120.0, 160.0, 20, 100.0, 1000.0);
        let b1 = a.layout.buttons[1];
        let (x1, y1) = ((b1.at[0] + 20.0) as f32, (b1.at[1] + 20.0) as f32);
        touch(&mut a, 3, Phase::Down, x1, y1, 1200.0);
        a.step(1216.0);
        let (held, _) = fixture::render(&gpu, &mut a, &frame(1216.0 + 125.0)).unwrap();
        held.save("image-cropper-held");
        touch(&mut a, 3, Phase::Cancel, x1, y1, 1400.0);
        settle(&mut a, 1400.0, 2000.0);
        tap(&mut a, 2, 2000.0);
        let (mid, _) = fixture::render(&gpu, &mut a, &frame(2060.0 + 120.0)).unwrap();
        mid.save("image-cropper-presenting");
        let (shown, _) = fixture::render(&gpu, &mut a, &frame(2060.0 + 600.0)).unwrap();
        shown.save("image-cropper-shown");
        assert_eq!(a.modal, Modal::Shown);
        // The page is black around its canvas; the Back button's border white.
        assert_eq!(&px(&shown, 200.0, 100.0)[..3], &[0, 0, 0]);
        let bb = a.layout.buttons[BACK];
        assert_eq!(
            &px(&shown, bb.at[0] as f32 + 0.5, (bb.at[1] + 25.0) as f32)[..3],
            &[255, 255, 255]
        );
        tap(&mut a, BACK, 3000.0);
        let (gone, _) = fixture::render(&gpu, &mut a, &frame(3060.0 + 80.0)).unwrap();
        gone.save("image-cropper-dismissing");
        // The white container, its top a third of the way down.
        assert_eq!(&px(&gone, 200.0, 905.0)[..3], &[255, 255, 255]);
        let (back, _) = fixture::render(&gpu, &mut a, &frame(3060.0 + 520.0)).unwrap();
        back.save("image-cropper-back");
        assert_eq!(a.modal, Modal::Hidden);
    }
}
