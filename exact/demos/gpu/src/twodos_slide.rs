//! Twodos Slide (src/animations/twodos-slide: index.tsx, components/animated-squares,
//! components/friction-slider, utils/draw-squircle.ts, utils/haptic.ts): two 120 pt squares
//! fanned out about their bottom-right corner over a "Slide to Unlock →" label; dragging the label
//! sideways (a horizontal UIScrollView whose content is exactly as wide as the screen, so every
//! drag is its rubber band) turns the squares and draws a dark outline round the front one.
//!
//! - Layout (index.tsx): two flex 1 halves. The top one centres the squares' 120 × 120 box at its
//!   bottom (justifyContent flex-end). The bottom one is the ScrollView (iOS: horizontal, bounces,
//!   decelerationRate "normal", contentOffset { x: INITIAL_SCROLL_POSITION }), its content
//!   container a row W wide, 200 tall, alignItems flex-start, justifyContent center, holding the
//!   label row (marginTop 64, alignItems center): "Slide to Unlock" (bold 16, gray, marginRight 5)
//!   and AntDesign arrow-right (20, gray). On iOS `containerStyle` is not used.
//! - The squares (animated-squares): absolute, borderRadius 25 continuous, boxShadow 0 0 10px
//!   rgba(0,0,0,0.1). The back one #f4dbbd (zIndex −1), the front one #DEB986. Each transform
//!   is [translateY 60, translateX 60, (front: scale 1.04), rotate, translateX −60, translateY
//!   −60] about the view's centre: a turn (and scale) about its bottom-right corner. The front
//!   one holds a Skia canvas (Group translate 25.5, 25.5: the squircle of drawSquirclePath
//!   { smoothing 1, radius 20, 69 × 69 } stroked #f4dbbd 9 wide, then again #2a2a2a with round
//!   caps, trimmed 0 → pathProgress) and Entypo check (120 / 2.8, #2a2a2a) centred.
//! - What Core Animation composites: the bodies and their shadows are drawn in the rotated space
//!   (layer backgrounds; RCTBoxShadow's shadow layer, shadowRadius = blur / 2, its path the
//!   circular rounded rect, masked even-odd to outside the view's circular rounded rect). The Skia
//!   canvas and the icon's text are rasterized in the square's own space at the screen's scale and
//!   then resampled (bilinear) by the turn: drawn here into a texture, then as an image under the
//!   transform. The label row is rasterized at its pixel-aligned place in the content and moved
//!   by the scroll's (fractional) offset: a texture too.
//! - The scroll (ui_scroll.rs): content width = port width, so the range is [0, 0] and any drag
//!   is rubber-banded; released, it bounces back to 0 (alwaysBounceHorizontal, RN's default for a
//!   horizontal ScrollView).
//! - The opening offset: contentOffset={{ x: INITIAL_SCROLL_POSITION }} (94.5 at 420) is set on a
//!   UIScrollView whose content is exactly as wide as the port, and the demo opens with the label
//!   centred and the squares at rest (measured on the simulator, RN Fabric, iOS 27.1): the offset
//!   is clamped to the [0, 0] range before the first frame, with no onScroll. So the scroll opens
//!   at 0 here.
//! - onScroll: RCTScrollViewComponentView dispatches it from scrollViewDidScroll (each change of
//!   the offset, once per frame here) only when more than scrollEventThrottle (16 ms) has passed
//!   since the last dispatch; beginning or ending a drag, and starting or ending a deceleration,
//!   force the next one through. scrollOffset = −contentOffset.x.
//! - realProgress = interpolate(scrollOffset, [−W/4, 0, W/4], [−1, 0, 1], EXTEND) (the squares'
//!   turn); clampedProgress the same with CLAMP, then clamp(·, 0, 1) for the outline. The
//!   reaction on realProgress: when it changes and the previous progress is ≥ 1, the light impact
//!   haptic, through lodash debounce(1000, leading, no trailing): played only when no call came in
//!   the last 1000 ms.
//!
//! Motion audit:
//!
//! | value | driver | config | trigger |
//! |---|---|---|---|
//! | contentOffset.x | UIScrollView (ui_scroll.rs) | rubber band 0.55 × W, range [0, 0]; release: critically damped bounce, rate 0.0125/ms (decelerationRate normal 0.998/ms, never used: always out of range or with no room) | the finger |
//! | scrollOffset | onScroll | −contentOffset.x, at most one dispatch per 16 ms (forced at drag begin/end, deceleration begin/end) | didScroll |
//! | realProgress | useDerivedValue | interpolate [−W/4, 0, W/4] → [−1, 0, 1], EXTEND | scrollOffset |
//! | clampedProgress | useDerivedValue | same, CLAMP | scrollOffset |
//! | baseRotation | useDerivedValue | 5 · progress + 5 (deg) | progress |
//! | front square transform | useAnimatedStyle | about its bottom-right corner: scale 1.04, rotate baseRotation | baseRotation |
//! | back square transform | useAnimatedStyle | about its bottom-right corner: rotate −1.2 · baseRotation | baseRotation |
//! | pathProgress (outline end) | useDerivedValue | clamp(clampedProgress, 0, 1) | clampedProgress |
//! | haptic | Haptics.impactAsync(Light) | debounce 1000 ms, leading, no trailing | realProgress changes while the previous progress ≥ 1 |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use skia::{point, Canvas, Cap, Color, Font, Images, Join, Matrix, MeasuredPath, Paint, Path, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

/// AnimatedSquares `size`.
const SIZE: f32 = 120.0;
/// strokeWidth.
const STROKE: f32 = 9.0;
/// internalSquarePathPadding.
const PADDING: f32 = 30.0;
/// externalBorderRadius.
const RADIUS: f32 = 25.0;
/// The squircle: borderSmoothing 1, borderRadius 20, SIZE − 2 · PADDING + STROKE square.
const SQUIRCLE_RADIUS: f64 = 20.0;
const SQUIRCLE_SIDE: f64 = (SIZE - PADDING * 2.0 + STROKE) as f64;
/// boxShadow '0px 0px 10px rgba(0, 0, 0, 0.1)': shadowRadius = blur / 2.
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.1;
/// The front square's scale.
const FRONT_SCALE: f32 = 1.04;
/// The back square turns −1.2× the front's.
const BACK_TURN: f64 = -1.2;
/// scrollableView marginTop; the label's marginRight.
const ROW_TOP: f32 = 64.0;
const LABEL_GAP: f32 = 5.0;
/// slideActionLabel fontSize (bold); the arrow's size; the check's (size / 2.8).
const LABEL_SIZE: f32 = 16.0;
const ARROW_SIZE: f32 = 20.0;
const CHECK_SIZE: f32 = SIZE / 2.8;
const LABEL: &str = "Slide to Unlock";
/// AntDesign arrow-right, Entypo check.
const ARROW: &str = "\u{F117}";
const CHECK: &str = "\u{F140}";
/// scrollEventThrottle (ms).
const THROTTLE_MS: f64 = 16.0;
/// The haptic's debounce wait (ms).
const DEBOUNCE_MS: f64 = 1000.0;
/// Where the scroll opens: RN's INITIAL_SCROLL_POSITION (W / 8 × 1.8) clamped to the [0, 0] range.
const INITIAL_OFFSET: f64 = 0.0;

static ANTDESIGN_ARROW: &[u8] = include_bytes!("../fonts/antdesign-arrow-right-subset.ttf");
static ENTYPO_CHECK: &[u8] = include_bytes!("../fonts/entypo-check-subset.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(TwodosSlide::new())
}

/// getPathParamsForBorder + drawSquirclePath (utils/draw-squircle.ts, react-native-squircle):
/// four corners of a cubic, a small clockwise arc and a cubic, joined by lines; not closed.
pub(crate) fn squircle_path(width: f64, height: f64, border_radius: f64, smoothing: f64) -> Path {
    let max_radius = width.min(height) / 2.0;
    let r = border_radius.min(max_radius);
    let p = ((1.0 + smoothing) * r).min(max_radius);
    let (alpha, beta) = if r <= max_radius / 2.0 {
        (45.0 * smoothing, 90.0 * (1.0 - smoothing))
    } else {
        let diff = (r - max_radius / 2.0) / (max_radius / 2.0);
        (45.0 * smoothing * (1.0 - diff), 90.0 * (1.0 - smoothing * (1.0 - diff)))
    };
    let rad = |deg: f64| deg * (std::f64::consts::PI / 180.0);
    let theta = (90.0 - beta) / 2.0;
    let p3_to_p4 = r * rad(theta / 2.0).tan();
    let csl = rad(beta / 2.0).sin() * r * 2f64.sqrt();
    let c = p3_to_p4 * rad(alpha).cos();
    let d = c * rad(alpha).tan();
    let b = (p - csl - c - d) / 3.0;
    let a = 2.0 * b;
    let (w, h) = (width, height);
    let pt = |x: f64, y: f64| point(x as f32, y as f32);
    let mut path = skia::path_builder();
    // rArcTo(r, r, 0, useSmallArc true, isCCW false, dx, dy), from where the last cubic ended.
    let arc = |b: &mut skia::PathBuilder, from: skia::Point, dx: f64, dy: f64| {
        let r = r as f32;
        skia::add_svg_arc(b, from, pt(from.x as f64 + dx, from.y as f64 + dy), r, r, 0.0, true, false);
    };
    // Top right.
    path.begin(pt((w / 2.0).max(w - p), 0.0));
    path.cubic_bezier_to(pt(w - (p - a), 0.0), pt(w - (p - a - b), 0.0), pt(w - (p - a - b - c), d));
    arc(&mut path, pt(w - (p - a - b - c), d), csl, csl);
    path.cubic_bezier_to(pt(w, p - a - b), pt(w, p - a), pt(w, (h / 2.0).min(p)));
    // Bottom right.
    path.line_to(pt(w, (h / 2.0).max(h - p)));
    path.cubic_bezier_to(pt(w, h - (p - a)), pt(w, h - (p - a - b)), pt(w - d, h - (p - a - b - c)));
    arc(&mut path, pt(w - d, h - (p - a - b - c)), -csl, csl);
    path.cubic_bezier_to(pt(w - (p - a - b), h), pt(w - (p - a), h), pt((w / 2.0).max(w - p), h));
    // Bottom left.
    path.line_to(pt((w / 2.0).min(p), h));
    path.cubic_bezier_to(pt(p - a, h), pt(p - a - b, h), pt(p - a - b - c, h - d));
    arc(&mut path, pt(p - a - b - c, h - d), -csl, -csl);
    path.cubic_bezier_to(pt(0.0, h - (p - a - b)), pt(0.0, h - (p - a)), pt(0.0, (h / 2.0).max(h - p)));
    // Top left.
    path.line_to(pt(0.0, (h / 2.0).min(p)));
    path.cubic_bezier_to(pt(0.0, p - a), pt(0.0, p - a - b), pt(d, p - a - b - c));
    arc(&mut path, pt(d, p - a - b - c), csl, -csl);
    path.cubic_bezier_to(pt(p - a - b, 0.0), pt(p - a, 0.0), pt((w / 2.0).min(p), 0.0));
    path.end(false);
    path.build()
}

/// Yoga's rounding of a layout edge to the pixel grid: to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// A Text's measured box side: Core Text's used size, ceiled to the pixel grid (RN's
/// internal_roundTextMeasurementToPixelGrid).
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

/// What Core Animation composites as rasters, in one texture: the front square's own-space
/// content at the top-left, the label row below it (a transparent gap between).
struct Layers {
    scale: f32,
    images: Images,
    view: wgpu::TextureView,
    /// The texture's pixels.
    pixels: (u32, u32),
    /// The row's first pixel row.
    row_y: u32,
    /// The row's box in the content (points, pixel-aligned).
    row_box: [f32; 4],
}

/// Transparent pixels between the two rasters (bilinear taps never reach across).
const GAP_PX: u32 = 4;

struct TwodosSlide {
    size: (f32, f32),
    scroll: UiScroll,
    /// The offset scrollViewDidScroll last saw.
    shown: f64,
    last_dispatch: Option<f64>,
    /// `_forceDispatchNextScrollEvent`.
    force: bool,
    /// (dragging, moving) at the last frame: drag and deceleration begin / end.
    was: (bool, bool),
    scroll_offset: f64,
    progress: f64,
    clamped: f64,
    /// The debounced haptic's last call.
    last_call: Option<f64>,
    posted: Vec<String>,
    squircle: MeasuredPath,
    label: Option<Font>,
    arrow: Option<Font>,
    check: Option<Font>,
    layers: Option<Layers>,
    /// The outline's end the square texture holds.
    drawn_path: Option<f32>,
    canvas: Canvas,
    layer_canvas: Canvas,
    /// The screen, the rasters.
    renderers: [Renderer; 2],
}

impl TwodosSlide {
    fn new() -> TwodosSlide {
        TwodosSlide {
            size: (0.0, 0.0),
            scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
            shown: 0.0,
            last_dispatch: None,
            force: false,
            was: (false, false),
            scroll_offset: 0.0,
            progress: 0.0,
            clamped: 0.0,
            last_call: None,
            posted: Vec::new(),
            squircle: MeasuredPath::new(squircle_path(SQUIRCLE_SIDE, SQUIRCLE_SIDE, SQUIRCLE_RADIUS, 1.0)),
            label: skia::match_ui_font(LABEL_SIZE, 700.0),
            arrow: Font::new(ANTDESIGN_ARROW, ARROW_SIZE),
            check: Font::new(ENTYPO_CHECK, CHECK_SIZE),
            layers: None,
            drawn_path: None,
            canvas: Canvas::default(),
            layer_canvas: Canvas::default(),
            renderers: [Renderer::default(), Renderer::default()],
        }
    }

    fn width(&self) -> f64 {
        self.size.0 as f64
    }

    /// interpolate(scrollOffset, [−W/4, 0, W/4], [−1, 0, 1]): EXTEND, and CLAMP.
    fn progresses(&self, scroll_offset: f64) -> (f64, f64) {
        let q = self.width() / 4.0;
        let real = scroll_offset / q;
        (real, real.clamp(-1.0, 1.0))
    }

    /// One onScroll: the reaction on realProgress.
    fn on_scroll(&mut self, content_offset: f64, now: f64) {
        self.scroll_offset = -content_offset;
        let (real, clamped) = self.progresses(self.scroll_offset);
        if real != self.progress {
            if self.progress >= 1.0 {
                // debounce(hapticFeedback, 1000, { leading: true, trailing: false }).
                if self.last_call.is_none_or(|t| now - t >= DEBOUNCE_MS) {
                    self.posted.push("haptic:impact-light".into());
                }
                self.last_call = Some(now);
            }
            self.progress = real;
            self.clamped = clamped;
        }
    }

    /// scrollViewDidScroll for this frame's offset, and RN's throttle.
    fn did_scroll(&mut self, now: f64) {
        let (dragging, moving) = (self.scroll.dragging(), self.scroll.moving() && !self.scroll.dragging());
        if dragging != self.was.0 || moving != self.was.1 {
            self.force = true;
        }
        self.was = (dragging, moving);
        if self.scroll.offset == self.shown {
            return;
        }
        self.shown = self.scroll.offset;
        let due = self.force || self.last_dispatch.is_none_or(|t| now - t > THROTTLE_MS);
        if due {
            self.force = false;
            self.last_dispatch = Some(now);
            self.on_scroll(self.shown, now);
        }
    }

    /// The rasters: the front square's own-space content (the Skia canvas, then the check, its
    /// Text box centred in the 120 square), and the label row `row_y` pixels down.
    fn record_layers(&mut self, scale: f32, end: f32, row: [f32; 4], row_y: u32) {
        let c = &mut self.layer_canvas;
        c.begin(scale);
        c.save();
        c.translate(PADDING - STROKE / 2.0, PADDING - STROKE / 2.0);
        c.draw_path(self.squircle.path(), &Paint::stroke(Color::hex(0xF4DBBD), STROKE));
        c.draw_trimmed(&self.squircle, 0.0, end, &Paint::stroke(Color::hex(0x2A2A2A), STROKE).caps(Cap::Round, Join::Miter));
        c.restore();
        if let Some(font) = self.check.as_ref() {
            let (w, h) = (text_side(font.advance_width(CHECK), scale), text_side(gfx::line_height(font), scale));
            let (x, y) = (grid((SIZE - w) / 2.0, scale), grid((SIZE - h) / 2.0, scale));
            // TextKit sets an icon glyph half the font's lineGap below the box top + ascender.
            c.draw_text(CHECK, x, gfx::baseline(font, y + font.metrics().leading / 2.0), font, &Paint::fill(Color::view_hex(0x2A2A2A)));
        }
        let c = &mut self.layer_canvas;
        c.save();
        c.translate(0.0, row_y as f32 / scale);
        self.record_row(scale, row);
        self.layer_canvas.restore();
    }

    /// The label row's box in the content: centred in W, 64 down.
    fn row_box(&self, scale: f32) -> Option<[f32; 4]> {
        let (label, arrow) = (self.label.as_ref()?, self.arrow.as_ref()?);
        let (lw, lh) = (text_side(label.advance_width(LABEL), scale), text_side(gfx::line_height(label), scale));
        let (aw, ah) = (text_side(arrow.advance_width(ARROW), scale), text_side(gfx::line_height(arrow), scale));
        let (w, h) = (lw + LABEL_GAP + aw, lh.max(ah));
        let x = grid((self.size.0 - w) / 2.0, scale);
        Some([x, grid(ROW_TOP, scale), grid(x + w, scale) - x, grid(ROW_TOP + h, scale) - grid(ROW_TOP, scale)])
    }

    fn record_row(&mut self, scale: f32, row: [f32; 4]) {
        let (Some(label), Some(arrow)) = (self.label.as_ref(), self.arrow.as_ref()) else { return };
        let gray = Paint::fill(Color::view_hex(0x808080));
        let (lw, lh) = (text_side(label.advance_width(LABEL), scale), text_side(gfx::line_height(label), scale));
        let ah = text_side(gfx::line_height(arrow), scale);
        let c = &mut self.layer_canvas;
        // alignItems center: each child centred in the row's height (edges on the grid, in the
        // row's own pixel-aligned frame).
        let top = |h: f32| grid((row[3] - h) / 2.0, scale);
        c.draw_text(LABEL, 0.0, gfx::baseline(label, top(lh)), label, &gray);
        // TextKit puts half the icon font's lineGap above its ascender (SF has none).
        c.draw_text(ARROW, grid(lw + LABEL_GAP, scale), gfx::baseline(arrow, top(ah) + arrow.metrics().leading / 2.0), arrow, &gray);
    }

    /// One square under its transform (about its bottom-right corner), its shadow first.
    fn square(c: &mut Canvas, origin: (f32, f32), scale: f32, turn_deg: f64, color: u32) {
        c.save();
        c.translate(origin.0 + SIZE, origin.1 + SIZE);
        c.scale(scale, scale);
        c.rotate(turn_deg.to_radians() as f32);
        c.translate(-SIZE, -SIZE);
        // The shadow layer's mask: outside the view's circular rounded rect.
        c.save();
        c.clip_with(|b| {
            let e = 3.0 * SHADOW_SIGMA + 2.0 * (2.0 * SHADOW_SIGMA + 1.0);
            skia::add_rect(b, -e, -e, SIZE + 2.0 * e, SIZE + 2.0 * e);
            skia::add_rrect_hole(b, 0.0, 0.0, SIZE, SIZE, RADIUS);
        });
        c.draw_rrect_shadow_local(0.0, 0.0, SIZE, SIZE, RADIUS, SHADOW_SIGMA, Color::BLACK.alpha(SHADOW_ALPHA));
        c.restore();
        c.draw_continuous_rrect(0.0, 0.0, SIZE, SIZE, RADIUS, &Paint::fill(Color::view_hex(color)));
    }
}

impl Surface for TwodosSlide {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"contentOffset\":{:.2},\"scrollOffset\":{:.2},\"progress\":{:.4},\"pathProgress\":{:.4},\"dragging\":{}}}",
            // (+ 0.0: no "-0.00".)
            self.scroll.offset + 0.0,
            self.scroll_offset + 0.0,
            self.progress + 0.0,
            self.clamped.clamp(0.0, 1.0) + 0.0,
            self.scroll.dragging()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The ScrollView is the bottom half (its hit test: inside its bounds).
        let inside = y >= self.size.1 / 2.0 && y <= self.size.1 && (0.0..=self.size.0).contains(&x);
        self.scroll.input(id, gfx::phase(phase), x, y, at_ms, inside);
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
        let (w, h, scale) = (frame.width, frame.height, frame.scale);
        if self.size != (w, h) {
            let first = self.size == (0.0, 0.0);
            self.size = (w, h);
            self.scroll.port = w as f64;
            self.scroll.max = 0.0;
            if first {
                // contentOffset={{ x: INITIAL_SCROLL_POSITION }} at mount, with no onScroll.
                self.scroll.offset = INITIAL_OFFSET * w as f64;
                self.shown = self.scroll.offset;
                self.last_dispatch = Some(frame.now_ms);
            }
            self.layers = None;
        }
        let moving = self.scroll.step(frame.now_ms);
        self.did_scroll(frame.now_ms);

        if self.layers.as_ref().is_none_or(|l| l.scale != scale) {
            let side = (SIZE * scale).round() as u32;
            let row_box = self.row_box(scale).unwrap_or([0.0, 0.0, 1.0, 1.0]);
            let (rw, rh) = ((row_box[2] * scale).round() as u32, (row_box[3] * scale).round() as u32);
            let row_y = side + GAP_PX;
            let pixels = (side.max(rw), row_y + rh);
            let images = Images::target(device, pixels.0, pixels.1);
            let view = images.render_view();
            self.renderers[0].set_images(&images);
            self.layers = Some(Layers { scale, images, view, pixels, row_y, row_box });
            self.drawn_path = None;
        }
        let end = self.clamped.clamp(0.0, 1.0) as f32;
        if self.drawn_path != Some(end) {
            let (row_box, row_y) = self.layers.as_ref().map(|l| (l.row_box, l.row_y)).unwrap();
            self.record_layers(scale, end, row_box, row_y);
            let layers = self.layers.as_ref().unwrap();
            self.renderers[1].draw(device, queue, encoder, &self.layer_canvas, &layers.view, wgpu::TextureFormat::Rgba8Unorm, layers.pixels.0, layers.pixels.1, wgpu::Color::TRANSPARENT);
            self.drawn_path = Some(end);
        }

        let layers = self.layers.as_ref().unwrap();
        let c = &mut self.canvas;
        c.begin(scale);
        let half = grid(h / 2.0, scale);
        let origin = (grid((w - SIZE) / 2.0, scale), grid(half - SIZE, scale));
        let turn = 5.0 * self.progress + 5.0;
        // The back square (zIndex −1) under the front one.
        Self::square(c, origin, 1.0, BACK_TURN * turn, 0xF4DBBD);
        c.restore();
        Self::square(c, origin, FRONT_SCALE, turn, 0xDEB986);
        let image = layers.images.image(0);
        c.draw_rect(0.0, 0.0, SIZE, SIZE, &Paint::image(image, Matrix::scale(scale, scale)));
        c.restore();
        // The ScrollView's content, moved by its offset (clipped to the bottom half).
        c.save();
        c.clip_rrect(0.0, half, w, h - half, 0.0);
        c.translate(-self.scroll.offset as f32, half);
        let [rx, ry, rw, rh] = layers.row_box;
        let to_row = Matrix::translate(-rx, -ry).then(Matrix::scale(scale, scale)).then(Matrix::translate(0.0, layers.row_y as f32));
        c.draw_rect(rx, ry, rw, rh, &Paint::image(image, to_row));
        c.restore();

        let (pw, ph) = frame.pixels();
        self.renderers[0].draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.scroll.moving()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    /// iPhone Air's window.
    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: W, height: H, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    fn state(s: &mut Box<dyn Surface>) -> String {
        s.agent("{}").unwrap()
    }

    #[test]
    fn the_squircle_is_draw_squircles() {
        let p = squircle_path(69.0, 69.0, 20.0, 1.0);
        let bb = lyon_bounds(&p);
        assert!(bb.0.abs() < 1e-3 && bb.1.abs() < 1e-3 && (bb.2 - 69.0).abs() < 1e-3 && (bb.3 - 69.0).abs() < 1e-3, "{bb:?}");
        // Open, from the top's middle back to it (max(w / 2, w − p) = min(w / 2, p) = 34.5).
        let events: Vec<_> = p.iter().collect();
        assert!(matches!(events[0], skia::PathEvent::Begin { at } if at == point(34.5, 0.0)));
        assert!(matches!(events.last(), Some(skia::PathEvent::End { last, close: false, .. }) if (last.x - 34.5).abs() < 1e-4 && last.y.abs() < 1e-4));
    }

    fn lyon_bounds(p: &Path) -> (f32, f32, f32, f32) {
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for e in p.iter() {
            let q = e.to();
            l = l.min(q.x);
            t = t.min(q.y);
            r = r.max(q.x);
            b = b.max(q.y);
        }
        (l, t, r, b)
    }

    #[test]
    fn on_scroll_is_throttled_to_16_ms_and_forced_at_a_drag_s_ends() {
        let mut s = TwodosSlide::new();
        s.size = (W, H);
        s.scroll = UiScroll::new(0.0, 0.0, W as f64, NORMAL, Snap::Free);
        s.last_dispatch = Some(0.0);
        // 120 Hz frames while the offset changes with no drag: every other one dispatches.
        let mut dispatched = 0;
        for k in 1..=10 {
            s.scroll.offset = -(k as f64);
            let before = s.last_dispatch;
            s.did_scroll(1000.0 + k as f64 * 8.333);
            if s.last_dispatch != before {
                dispatched += 1;
            }
        }
        assert_eq!(dispatched, 5);
        // Progress follows the dispatched offset: scrollOffset / (W / 4), extended.
        assert!((s.progress - s.scroll_offset / 105.0).abs() < 1e-12);
    }

    #[test]
    fn the_haptic_plays_past_full_progress_once_per_quiet_second() {
        let mut s = TwodosSlide::new();
        s.size = (W, H);
        // Past progress 1 (scrollOffset > 105): the first change after it buzzes.
        s.on_scroll(-110.0, 0.0);
        assert!(s.posted.is_empty(), "the previous progress was 0");
        s.on_scroll(-112.0, 16.0);
        assert_eq!(s.posted, vec!["haptic:impact-light".to_string()]);
        // Calls keep coming within 1000 ms of each other: no more.
        for k in 2..100 {
            s.on_scroll(-112.0 - k as f64, 16.0 * k as f64);
        }
        assert_eq!(s.posted.len(), 1);
        // A quiet second, then a change while still past 1: again.
        s.on_scroll(-300.0, 16.0 * 99.0 + 1000.0);
        assert_eq!(s.posted.len(), 2);
    }

    #[test]
    fn it_opens_centred_and_a_drag_turns_and_draws() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "twodos-rest", [255, 255, 255]);
        assert!(!animating);
        // RN opens at contentOffset 0 (INITIAL_SCROLL_POSITION clamped): the squares at progress 0.
        assert_eq!(state(&mut s), "{\"contentOffset\":0.00,\"scrollOffset\":0.00,\"progress\":0.0000,\"pathProgress\":0.0000,\"dragging\":false}");
        // The label row is centred.
        let row_y = (3.0 * (H / 2.0 + ROW_TOP + 10.0)) as u32;
        let ink: Vec<u32> = (0..(3.0 * W) as u32).filter(|&x| rest.at(x, row_y)[3] > 0 && rest.at(x, row_y)[0] < 200).collect();
        let (l, r) = (*ink.first().unwrap() as f32 / 3.0, *ink.last().unwrap() as f32 / 3.0);
        assert!(((l + r) / 2.0 - W / 2.0).abs() < 3.0, "ink {l}..{r}");
        // The front square's body (#DEB986 as Display P3) left of the outline, inside the box.
        let (bx, by) = (150.0, 336.0);
        let body = rest.at((3.0 * (bx + 12.0)) as u32, (3.0 * (by + 60.0)) as u32);
        assert!(body[3] == 255 && body[0] > 220 && body[2] < 150, "{body:?}");
        // No outline drawn yet: the ring at the top centre is the light stroke.
        let ring = rest.at((3.0 * (bx + 62.0)) as u32, (3.0 * (by + 25.5 + 2.0)) as u32);
        assert!(ring[0] > 220, "{ring:?}");

        // Drag 300 pt right (finger right: contentOffset goes negative, progress positive).
        let y = H * 0.75;
        s.input(&pointer(PointerPhase::Down, 60.0, y, 100.0));
        let mut ms = 100.0;
        for k in 1..=40 {
            ms += 16.67;
            s.input(&pointer(PointerPhase::Move, 60.0 + 300.0 * k as f32 / 40.0, y, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (dragged, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.67)).unwrap();
        gfx::save_over(&dragged, "twodos-dragged", [255, 255, 255]);
        let st = state(&mut s);
        let progress: f64 = st.split("\"progress\":").nth(1).unwrap().split(',').next().unwrap().parse().unwrap();
        assert!(progress > 0.3 && progress < 1.5, "{st}");
        // The outline has started: many more dark (#2a2a2a) pixels over the squares than the
        // check alone.
        let dark = |img: &fixture::Pixels| {
            let mut n = 0;
            for y in (3.0 * by) as u32..(3.0 * (by + SIZE)) as u32 {
                for x in (3.0 * bx) as u32..(3.0 * (bx + SIZE)) as u32 {
                    let p = img.at(x, y);
                    n += (p[3] == 255 && p[0] < 60) as u32;
                }
            }
            n
        };
        let (before, after) = (dark(&rest), dark(&dragged));
        assert!(after > before + 3000, "{before} → {after} {st}");

        // Released, it bounces home: offset 0, progress 0.
        s.input(&pointer(PointerPhase::Up, 360.0, y, ms));
        while ms < 4000.0 {
            ms += 16.67;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (home, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&home, "twodos-home", [255, 255, 255]);
        assert!(!animating);
        assert_eq!(state(&mut s), "{\"contentOffset\":0.00,\"scrollOffset\":0.00,\"progress\":0.0000,\"pathProgress\":0.0000,\"dragging\":false}");
    }
}
