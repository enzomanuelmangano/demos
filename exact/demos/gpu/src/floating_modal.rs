//! Floating Modal (src/animations/floating-modal: index.tsx, components/FloatingModal/
//! index.tsx, constants.ts, AddCloseIcon, AnimatedBackdrop, Modal): a white 64 pt "+" button in
//! the bottom-right corner that opens into a centred square modal ("New", a "Done" button) and
//! is dragged away to close; the whole window, over the Contract's rgba(0,0,0,0.1).
//!
//! - progress = withTiming(isOpened ? 1 : 0) (300 ms, inOut(quad)). size = 64 → 0.9 × width,
//!   right = 32 → 0.05 × width, bottom = 32 → height / 2 − size / 2 (the size of this frame: a
//!   quadratic path), borderRadius 32 → 15, all clamped; white, boxShadow `0px 12px 12px
//!   rgba(0,0,0,0.2)` (σ 6, RN's iOS blur / 2), drawn with the view.
//! - transform [scale, translateX, translateY] about the view's centre, scale = 1 − √(x² + y²) /
//!   √(width² + height²). The pan (on the modal) sets x, y = translation while opened; at
//!   onFinalize a downward drag with scale < 0.95 closes it, and x, y spring back to 0
//!   (withSpring, Reanimated's default, overshootClamping).
//! - isVisible = progress === 1: the backdrop (rgba(0,0,0,0.4)) fades to it (withTiming,
//!   300 ms) and closes the modal on touch start while visible; the content fades to it
//!   (100 ms) and takes touches only while visible.
//! - The content (absoluteFill, centred): "New" (20 bold) in a 64 tall row; at the bottom an
//!   80 tall row holding the "Done" button (margin 10, #111, radius 12, "Done" 20 / 700 white).
//! - The "+" (AntDesign plus, 28, black) in a 64² PressableScale at the modal's top-left,
//!   rotated by progress × π/4; pressing it toggles isOpened.
//! - PressableScale (pressto, the shared `pressto::Pressable`): scale 1 → 0.96 on
//!   withTiming(250 ms, bezier(0.25, 0.1, 0.25, 1)) while pressed; a press lifted inside the
//!   button posts `press` (the app's selection haptic); a pan that activates cancels it.
//!
//! - The "+"'s `transform` has two writers: the icon's rotate style and pressto's scale style,
//!   both animated styles of the same view. Reanimated sends each style's changed props when its
//!   mapper runs and `transform` is replaced whole, so the view shows the last one written: a
//!   frame where only the press moves shows [scale] (unrotated), one where the progress moves
//!   shows [rotate] (scale 1). In a frame where both move, the mappers run in Reanimated's
//!   topological order (mappers.ts `updateMappersOrder`, a DFS over registration order):
//!   pressto's (registered in its own effect, a child's, first), then the icon's, which wins.
//!   Before any write it is pressto's initial [scale 1] (last in the style array). Every
//!   pressto style reads the provider's `lastTouchedPressable`, which each onPress sets (no
//!   equality check in Reanimated's setter): pressing "Done" re-runs the "+"'s pressto mapper
//!   too, so the open modal's "×" shows as an upright "+" until the progress moves again.
//! - Text is RN `<Text>`, laid out by UIKit (`skia::match_ui_font`: tracking, kerning). The
//!   modal has no borderCurve (circular); the "Done" button is continuous. The boxShadow's path
//!   is RCTBoxShadow's circular rounded rect.
//!
//! Beyond RN (the owner's phone feedback, 2026-11-15: "improve this component's layout and
//! transitions"): the modal opens as an iOS 26 floating sheet, 10 pt from the display's sides
//! and bottom, its corners concentric with the display's (62 − 10 = 52 pt, circular: analytic, no MSAA frame) and the
//! Done button's with the sheet's (a 30 pt pill); it opens and closes on a critically damped
//! spring (500 ms) instead of a 300 ms timing; the scrim follows the progress (and thins as the
//! sheet is dragged down) instead of waiting for the end; the content fades in over the last
//! 40 % of the way; a drag rubber-bands up and sideways and closes on a flick down as well;
//! `open` and `close` are posted for a haptic.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate_clamp, Easing, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;

/// FLOATING_BUTTON_SIZE.
const BUTTON: f64 = 64.0;
/// The open sheet's inset from the display's sides and bottom, and the display's corner radius
/// (iPhone 17: 62 pt): the sheet's radius is concentric with it.
const INSET: f64 = 10.0;
const DISPLAY_RADIUS: f64 = 62.0;
/// iOS's rubber band: (1 − 1 / (d · 0.55 / dim + 1)) · dim.
fn rubber(d: f64, dim: f64) -> f64 {
    if dim <= 0.0 {
        return 0.0;
    }
    d.signum() * (1.0 - 1.0 / (d.abs() * 0.55 / dim + 1.0)) * dim
}
/// AntDesign "plus" (U+F21A), size 28.
const PLUS: &str = "\u{F21A}";
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-subset.ttf");
/// The transparent margin around each text layer in the atlas, device pixels.
const GUTTER: f32 = 2.0;

/// pressto's press animation (`pressto::timing_easing`), for the surfaces that ease like it.
pub(crate) fn press_easing() -> Easing {
    pressto::timing_easing()
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(modal())
}

fn modal() -> FloatingModal {
    FloatingModal {
        down_y: 0.0,
        size: (0.0, 0.0),
        s: 3.0,
        opened: false,
        progress: Spring::at(0.0),
        x: Spring::at(0.0),
        y: Spring::at(0.0),
        backdrop: Timing::at(0.0),
        content: Timing::at(0.0),
        visible: false,
        pan: PanGesture::new(),
        plus_press: Pressable::new(),
        done_press: Pressable::new(),
        plus_shown: (0.0, 1.0),
        touched: false,
        posted: Vec::new(),
        plus: Font::new(ANTDESIGN, 28.0).map(Font::with_ui_layout),
        title: skia::match_ui_font(20.0, 700.0),
        canvas: Canvas::default(),
        group_canvas: Canvas::default(),
        layer_canvas: Canvas::default(),
        renderer: Renderer::default(),
        group_renderer: Renderer::default(),
        layer_renderer: Renderer::default(),
        gpu: None,
    }
}

struct Gpu {
    generation: u32,
    scale: f32,
    /// The three text layers ("+", "New", "Done"), each its box at device pixels.
    atlas: Images,
    /// Where each layer's box starts in the atlas (pixels).
    origins: [[f32; 2]; 3],
    /// What is composited from bitmaps, in screen pixels: the content view's subtree (its
    /// group opacity applied when this is drawn) on top, the "+" in a strip below the screen.
    group: Images,
    group_view: wgpu::TextureView,
    group_size: (u32, u32),
}

struct FloatingModal {
    /// Where the pan's finger went down (onEnd reads translationY even when it never activated).
    down_y: f64,
    size: (f64, f64),
    /// Device pixels per point.
    s: f64,
    opened: bool,
    progress: Spring,
    x: Spring,
    y: Spring,
    backdrop: Timing,
    content: Timing,
    visible: bool,
    pan: PanGesture,
    /// The "+" and "Done" PressableScales (the shared pressto machine); a finger is on one
    /// until it lifts, moves away as a pan, or is cancelled.
    plus_press: Pressable,
    done_press: Pressable,
    /// The "+"'s transform as last written: (rotate, scale).
    plus_shown: (f64, f64),
    /// A press set pressto's `lastTouchedPressable` since the last frame.
    touched: bool,
    posted: Vec<String>,
    plus: Option<Font>,
    title: Option<Font>,
    canvas: Canvas,
    group_canvas: Canvas,
    layer_canvas: Canvas,
    renderer: Renderer,
    group_renderer: Renderer,
    layer_renderer: Renderer,
    gpu: Option<Gpu>,
}

/// Yoga's rounding of a View's edge to the pixel grid: the nearest device pixel, a half up.
fn grid(v: f64, s: f64) -> f64 {
    (v * s + 0.5 + 1e-4).floor() / s
}

/// A Text node's position in its parent: floored to the pixel grid (Yoga's textRounding).
fn text_grid(v: f64, s: f64) -> f64 {
    (v * s + 1e-4).floor() / s
}

/// A Text's measured side: Core Text's size ceiled to the pixel grid (an exact 28 is 28.333).
fn text_side(v: f64, s: f64) -> f64 {
    ((v + 0.001) * s).ceil() / s
}

/// The modal's laid-out views at `p`, in its own points (top-left 0, 0) except `frame`.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Layout {
    /// The modal's frame on screen, Yoga-rounded: x, y, width, height.
    frame: (f64, f64, f64, f64),
    radius: f64,
    /// "New"'s, "Done"'s and the "+"'s Text boxes (x, y), and the Done button's (x, y, w, h).
    new_at: (f64, f64),
    done_at: (f64, f64),
    plus_at: (f64, f64),
    button: (f64, f64, f64, f64),
}

impl FloatingModal {
    /// The Text boxes' sides (w, h) of "+", "New" and "Done".
    fn text_boxes(&self) -> [(f64, f64); 3] {
        let s = self.s;
        let side = |font: &Option<Font>, t: &str| match font {
            Some(f) => (
                text_side(f.advance_width(t) as f64, s),
                text_side(gfx::line_height(f) as f64, s),
            ),
            None => (0.0, 0.0),
        };
        [
            side(&self.plus, PLUS),
            side(&self.title, "New"),
            side(&self.title, "Done"),
        ]
    }

    /// rOpenedModalStyle's frame at `p` and the content laid out in it, as Yoga rounds them
    /// (positions relative to the parent, sizes from the unrounded absolute edges).
    fn layout(&self, p: f64) -> Layout {
        let (w, h, s) = (self.size.0, self.size.1, self.s);
        // The floating sheet: the display's width less the insets, 0.9 × width tall (RN's
        // square's height), at the bottom; from the 64 pt button at right 32, bottom 32.
        let sw = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON, w - 2.0 * INSET]);
        let size = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON, w * 0.9]);
        let right = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON / 2.0, INSET]);
        let bottom = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON / 2.0, INSET]);
        let radius = interpolate_clamp(p, &[0.0, 1.0], &[BUTTON / 2.0, DISPLAY_RADIUS - INSET])
            .min(size / 2.0)
            .min(sw / 2.0);
        let (l0, t0) = (w - right - sw, h - bottom - size);
        let frame = (
            grid(l0, s),
            grid(t0, s),
            grid(l0 + sw, s) - grid(l0, s),
            grid(t0 + size, s) - grid(t0, s),
        );
        let [plus, new, done] = self.text_boxes();
        // The content (absoluteFill, alignItems center): the title row as wide as its Text,
        // centred, 64 tall; the 80 tall button row at the bottom, its button inset 10.
        let new_at = (
            grid((sw - new.0) / 2.0, s),
            text_grid((BUTTON - new.1) / 2.0, s),
        );
        let row_top = grid(size - 80.0, s);
        let (bl, bt) = (l0 + 10.0, t0 + size - 70.0);
        let button = (
            10.0,
            row_top + 10.0,
            grid(bl + sw - 20.0, s) - grid(bl, s),
            grid(bt + 60.0, s) - grid(bt, s),
        );
        let done_at = (
            button.0 + text_grid((sw - 20.0 - done.0) / 2.0, s),
            button.1 + text_grid((60.0 - done.1) / 2.0, s),
        );
        let plus_at = (
            text_grid((BUTTON - plus.0) / 2.0, s),
            text_grid((BUTTON - plus.1) / 2.0, s),
        );
        Layout {
            frame,
            radius,
            new_at,
            done_at,
            plus_at,
            button,
        }
    }

    fn scale(&self) -> f64 {
        let (w, h) = self.size;
        1.0 - self.x.value.hypot(self.y.value) / w.hypot(h)
    }

    /// The modal's transform (its own points to screen points): [scale, translateX,
    /// translateY] about its centre.
    fn modal_matrix(&self, l: &Layout) -> Matrix {
        let (fx, fy, fw, fh) = l.frame;
        let k = self.scale() as f32;
        Matrix::translate(
            self.x.value as f32 - fw as f32 / 2.0,
            self.y.value as f32 - fh as f32 / 2.0,
        )
        .then(Matrix::scale(k, k))
        .then(Matrix::translate(
            (fx + fw / 2.0) as f32,
            (fy + fh / 2.0) as f32,
        ))
    }

    /// The "+" view's transform inside the modal: the last written of rotate / scale about (32, 32).
    fn plus_matrix(&self) -> Matrix {
        let (rotate, k) = self.plus_shown;
        let half = (BUTTON / 2.0) as f32;
        Matrix::translate(-half, -half)
            .then(Matrix::scale(k as f32, k as f32))
            .then(Matrix::rotate(rotate as f32))
            .then(Matrix::translate(half, half))
    }

    /// The Done button's transform inside the modal: pressto's scale about its centre.
    fn button_matrix(&self, l: &Layout) -> Matrix {
        let (bx, by, bw, bh) = l.button;
        let k = self.done_press.scale() as f32;
        let (cx, cy) = ((bx + bw / 2.0) as f32, (by + bh / 2.0) as f32);
        Matrix::translate(-cx, -cy)
            .then(Matrix::scale(k, k))
            .then(Matrix::translate(cx, cy))
    }

    fn toggle(&mut self) {
        self.opened = !self.opened;
        let to = if self.opened { 1.0 } else { 0.0 };
        gfx::spring_to(&mut self.progress, to, 500.0, 1.0);
        self.posted
            .push(if self.opened { "open" } else { "close" }.into());
    }

    /// The scrim's opacity: the progress, thinned as the open sheet is dragged down.
    fn scrim(&self) -> f64 {
        let drag = (self.y.value.max(0.0) / 400.0).clamp(0.0, 1.0);
        self.progress.value.clamp(0.0, 1.0) * (1.0 - drag)
    }

    /// The content's opacity: the last 40 % of the progress.
    fn content_opacity(&self) -> f64 {
        ((self.progress.value - 0.6) / 0.4).clamp(0.0, 1.0)
    }

    /// A finger is on one of the buttons.
    fn pressing(&self) -> bool {
        self.plus_press.is_pressed() || self.done_press.is_pressed()
    }

    /// UIKit's hit test of a screen point, through each view's transform: (on the modal or its
    /// "+" (the pan's views), on the "+", on the Done button while the content takes touches).
    fn hits(&self, px: f64, py: f64) -> (bool, bool, bool) {
        let l = self.layout(self.progress.value);
        let m = self.modal_matrix(&l).invert();
        let q = m.apply(skia::Point::new(px as f32, py as f32));
        let (lx, ly) = (q.x as f64, q.y as f64);
        let in_modal = (0.0..=l.frame.2).contains(&lx) && (0.0..=l.frame.3).contains(&ly);
        let pq = self.plus_matrix().invert().apply(q);
        let on_plus =
            (0.0..=BUTTON as f32).contains(&pq.x) && (0.0..=BUTTON as f32).contains(&pq.y);
        let bq = self.button_matrix(&l).invert().apply(q);
        let (bx, by, bw, bh) = l.button;
        let on_done = self.opened
            && self.progress.value > 0.9
            && in_modal
            && (bx..=bx + bw).contains(&(bq.x as f64))
            && (by..=by + bh).contains(&(bq.y as f64));
        (in_modal || on_plus, on_plus, on_done)
    }
}

impl Surface for FloatingModal {
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
            "{{\"opened\":{},\"progress\":{:.3},\"scale\":{:.4},\"visible\":{},\"held\":{}}}",
            self.opened,
            self.progress.value,
            self.scale(),
            self.visible,
            self.pan.tracking() || self.pressing()
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
        if self.size.0 <= 0.0 {
            return;
        }
        let (on_modal, on_plus, on_done) = self.hits(x as f64, y as f64);
        let phase = gfx::phase(phase);
        if phase == gesture_handler::Phase::Down {
            if !on_modal {
                // The scrim's touch, while the sheet is open (or opening).
                if self.opened {
                    self.toggle();
                }
                return;
            }
            if !self.pressing() && !self.plus_press.pointer_down(id, on_plus) {
                self.done_press.pointer_down(id, on_done);
            }
        }
        match self.pan.event(id, phase, x, y, at_ms, on_modal) {
            Event::Begin { y: by, .. } => self.down_y = by as f64,
            Event::Start(p) | Event::Update(p) => {
                // The pan activates: the button under the finger is cancelled.
                if self.plus_press.finger() == Some(id) {
                    self.plus_press.cancel();
                }
                if self.done_press.finger() == Some(id) {
                    self.done_press.cancel();
                }
                if self.opened {
                    // Down follows the finger; up and sideways rubber-band.
                    let (_, _, fw, fh) = self.layout(1.0).frame;
                    let ty = p.translation_y as f64;
                    self.x.set(rubber(p.translation_x as f64, fw));
                    self.y.set(if ty > 0.0 { ty } else { rubber(ty, fh) });
                }
            }
            Event::End(p) => self.finalize(p.translation_y as f64, p.velocity_y as f64),
            // RN's onEnd checks event.translationY even for a pan that never activated.
            Event::Fail => self.finalize(y as f64 - self.down_y, 0.0),
            _ => {}
        }
        if phase != gesture_handler::Phase::Down {
            // onPress (lifted inside, in the view's transformed bounds): the app's haptic,
            // posted as `press` (what floating-modal.contract listens for); the "+" toggles
            // isOpened.
            if let Some(PressEvent::Press(press)) = self.plus_press.pointer(id, phase, on_plus) {
                if press.global {
                    self.posted.push("press".into());
                }
                self.touched = true;
                self.toggle();
            }
            if let Some(PressEvent::Press(press)) = self.done_press.pointer(id, phase, on_done) {
                if press.global {
                    self.posted.push("press".into());
                }
                self.touched = true;
            }
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
        self.s = frame.scale as f64;
        let now = frame.now_ms;
        let (p0, k0) = (self.progress.value, self.plus_press.progress());
        let mut moving = self.progress.step(now);
        moving |= self.x.step(now) | self.y.step(now);
        let visible = self.opened && self.progress.value > 0.9;
        if visible != self.visible {
            self.visible = visible;
            let v = if visible { 1.0 } else { 0.0 };
            self.backdrop.to(v, 300.0, Easing::timing_default());
            self.content.to(v, 100.0, Easing::timing_default());
        }
        moving |= self.backdrop.step(now) | self.content.step(now);
        moving |= self.plus_press.step(now) | self.done_press.step(now);
        // The "+"'s two transform writers, pressto's first, the icon's last.
        if self.plus_press.progress() != k0 || std::mem::take(&mut self.touched) {
            self.plus_shown = (0.0, self.plus_press.scale());
        }
        if self.progress.value != p0 {
            self.plus_shown = (
                self.progress.value.clamp(0.0, 1.0) * std::f64::consts::FRAC_PI_4,
                1.0,
            );
        }

        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let boxes = self.text_boxes();
        self.prepare(frame, device, queue, encoder, boxes, (pw, ph));
        let gpu = self.gpu.as_ref().unwrap();
        let l = self.layout(self.progress.value);
        let modal = self.modal_matrix(&l);
        let (_, _, fw, fh) = l.frame;
        let (fw, fh, radius) = (fw as f32, fh as f32, l.radius as f32);
        let px = |v: f64| v as f32;

        // The bitmaps, in screen pixels: the content's subtree, then the "+" in the strip.
        let content = self.content_opacity() as f32;
        let plus_m = self.plus_matrix().then(modal);
        let strip = plus_bounds(plus_m, s, pw, ph);
        let button_m = self.button_matrix(&l);
        let has_title = self.title.is_some();
        let g = &mut self.group_canvas;
        g.begin(s);
        if content > 0.0 {
            g.save();
            g.concat(modal);
            if has_title {
                composite(
                    g,
                    &gpu.atlas,
                    gpu.origins[1],
                    [
                        px(l.new_at.0),
                        px(l.new_at.1),
                        px(boxes[1].0),
                        px(boxes[1].1),
                    ],
                    s,
                );
                g.concat(button_m);
                let (bx, by, bw, bh) = l.button;
                // Concentric with the sheet: its radius less the 10 pt margin, a pill at most.
                g.draw_continuous_rrect(
                    px(bx),
                    px(by),
                    px(bw),
                    px(bh),
                    ((l.radius - 10.0) as f32).clamp(12.0, px(bh) / 2.0),
                    &Paint::fill(Color::hex(0x111111)),
                );
                composite(
                    g,
                    &gpu.atlas,
                    gpu.origins[2],
                    [
                        px(l.done_at.0),
                        px(l.done_at.1),
                        px(boxes[2].0),
                        px(boxes[2].1),
                    ],
                    s,
                );
            }
            g.restore();
        }
        if let Some((sx, sy, _, _)) = strip {
            g.save();
            g.translate(-(sx as f32) / s, (ph as f32 - sy as f32) / s);
            g.concat(plus_m);
            composite(
                g,
                &gpu.atlas,
                gpu.origins[0],
                [
                    px(l.plus_at.0),
                    px(l.plus_at.1),
                    px(boxes[0].0),
                    px(boxes[0].1),
                ],
                s,
            );
            g.restore();
        }
        let (gw, gh) = gpu.group_size;
        self.group_renderer.draw(
            device,
            queue,
            encoder,
            &self.group_canvas,
            &gpu.group_view,
            wgpu::TextureFormat::Rgba8Unorm,
            gw,
            gh,
            wgpu::Color::TRANSPARENT,
        );

        let scrim = self.scrim();
        let c = &mut self.canvas;
        c.begin(s);
        if scrim > 0.0 {
            c.save();
            c.opacity(scrim as f32);
            c.fill(Color::rgba8(0, 0, 0, 255).alpha(0.4));
            c.restore();
        }
        // The modal (Core Animation's background, radius and shadow, through its transform).
        c.save();
        c.concat(modal);
        c.draw_rrect_shadow(
            0.0,
            12.0,
            fw,
            fh,
            radius,
            6.0,
            Color::rgba8(0, 0, 0, 255).alpha(0.2),
        );
        // Analytic (Graphite's rrect step): a continuous rrect is a path, which turns the whole
        // full-screen frame into 4x MSAA every frame of the motion (3x: 1206 x 2622 x 4).
        c.draw_rrect(0.0, 0.0, fw, fh, radius, &Paint::fill(Color::WHITE));
        c.restore();
        // The content as one group at its opacity (allowsGroupOpacity), then the "+", 1:1.
        if content > 0.0 {
            let (x0, y0, x1, y1) = bounds(modal, fw, fh);
            c.draw_rect(
                x0,
                y0,
                x1 - x0,
                y1 - y0,
                &Paint::image(gpu.group.image(0), Matrix::scale(s, s)).with_opacity(content),
            );
        }
        if let Some((sx, sy, sw, sh)) = strip {
            let to =
                Matrix::scale(s, s).then(Matrix::translate(-(sx as f32), ph as f32 - sy as f32));
            c.draw_rect(
                sx as f32 / s,
                sy as f32 / s,
                sw as f32 / s,
                sh as f32 / s,
                &Paint::image(gpu.group.image(0), to),
            );
        }
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
            || self.pan.tracking()
            || self.plus_press.is_animating()
            || self.done_press.is_animating()
    }
}

/// The screen bounds (points) of a `w` × `h` box through `m`.
fn bounds(m: Matrix, w: f32, h: f32) -> (f32, f32, f32, f32) {
    let pts =
        [(0.0, 0.0), (w, 0.0), (0.0, h), (w, h)].map(|(x, y)| m.apply(skia::Point::new(x, y)));
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for p in pts {
        x0 = x0.min(p.x);
        y0 = y0.min(p.y);
        x1 = x1.max(p.x);
        y1 = y1.max(p.y);
    }
    (x0, y0, x1, y1)
}

/// The "+"'s 64² view on screen, in whole pixels within the screen, for the strip below it:
/// (x, y, w, h), none when it is off screen.
fn plus_bounds(m: Matrix, s: f32, pw: u32, ph: u32) -> Option<(u32, u32, u32, u32)> {
    let (x0, y0, x1, y1) = bounds(m, BUTTON as f32, BUTTON as f32);
    let x0 = ((x0 * s).floor() - 2.0).clamp(0.0, pw as f32) as u32;
    let y0 = ((y0 * s).floor() - 2.0).clamp(0.0, ph as f32) as u32;
    let x1 = ((x1 * s).ceil() + 2.0).clamp(0.0, pw as f32) as u32;
    let y1 = ((y1 * s).ceil() + 2.0).clamp(0.0, ph as f32) as u32;
    (x1 > x0 && y1 > y0).then_some((x0, y0, x1 - x0, (y1 - y0).min(strip_height(s))))
}

/// The strip's height: the "+" view's diagonal at full scale, plus margins.
fn strip_height(s: f32) -> u32 {
    (BUTTON as f32 * std::f32::consts::SQRT_2 * s).ceil() as u32 + 6
}

/// Draws a text layer from the atlas: its box `frame` (points, untransformed) from `origin`
/// (pixels), sampled bilinearly through the canvas's transform, as Core Animation shows a
/// Text's backing store.
fn composite(c: &mut Canvas, atlas: &Images, origin: [f32; 2], frame: [f32; 4], s: f32) {
    let g = GUTTER / s;
    let to = Matrix::translate(-frame[0], -frame[1])
        .then(Matrix::scale(s, s))
        .then(Matrix::translate(origin[0], origin[1]));
    c.draw_rect(
        frame[0] - g,
        frame[1] - g,
        frame[2] + 2.0 * g,
        frame[3] + 2.0 * g,
        &Paint::image(atlas.image(0), to),
    );
}

impl FloatingModal {
    /// The atlas of the three Text layers (drawn once per scale) and the group target.
    fn prepare(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        boxes: [(f64, f64); 3],
        (pw, ph): (u32, u32),
    ) {
        let s = frame.scale;
        let stale = self
            .gpu
            .as_ref()
            .is_none_or(|g| g.generation != frame.shader_generation || g.scale != s);
        if stale {
            let px: Vec<(u32, u32)> = boxes
                .iter()
                .map(|b| {
                    (
                        (b.0 * s as f64).round() as u32,
                        (b.1 * s as f64).round() as u32,
                    )
                })
                .collect();
            let aw = px.iter().map(|b| b.0).max().unwrap_or(1) + 2 * GUTTER as u32;
            let mut origins = [[0.0; 2]; 3];
            let mut y = GUTTER;
            for (i, b) in px.iter().enumerate() {
                origins[i] = [GUTTER, y];
                y += b.1 as f32 + 2.0 * GUTTER;
            }
            let ah = y as u32;
            let atlas = Images::target(device, aw, ah);
            let atlas_view = atlas.render_view();
            // Each Text's backing store: its line at the box's top-left, clipped to its box.
            let l = &mut self.layer_canvas;
            l.begin(s);
            let texts = [
                (&self.plus, PLUS, Color::BLACK),
                (&self.title, "New", Color::BLACK),
                (&self.title, "Done", Color::WHITE),
            ];
            for (i, (font, text, color)) in texts.into_iter().enumerate() {
                if let Some(font) = font {
                    let (ox, oy) = (origins[i][0] / s, origins[i][1] / s);
                    l.save();
                    l.clip_rect(ox, oy, boxes[i].0 as f32, boxes[i].1 as f32);
                    l.draw_text(text, ox, gfx::baseline(font, oy), font, &Paint::fill(color));
                    l.restore();
                }
            }
            self.layer_renderer.draw(
                device,
                queue,
                encoder,
                &self.layer_canvas,
                &atlas_view,
                wgpu::TextureFormat::Rgba8Unorm,
                aw,
                ah,
                wgpu::Color::TRANSPARENT,
            );
            self.group_renderer.set_images(&atlas);
            let group = self
                .gpu
                .take()
                .filter(|g| g.group_size == (pw, ph + strip_height(s)));
            let (group, group_view) = match group {
                Some(g) => (g.group, g.group_view),
                None => {
                    let g = Images::target(device, pw, ph + strip_height(s));
                    let v = g.render_view();
                    (g, v)
                }
            };
            self.renderer.set_images(&group);
            self.gpu = Some(Gpu {
                generation: frame.shader_generation,
                scale: s,
                atlas,
                origins,
                group,
                group_view,
                group_size: (pw, ph + strip_height(s)),
            });
        } else if self
            .gpu
            .as_ref()
            .is_some_and(|g| g.group_size != (pw, ph + strip_height(s)))
        {
            let gpu = self.gpu.as_mut().unwrap();
            gpu.group = Images::target(device, pw, ph + strip_height(s));
            gpu.group_view = gpu.group.render_view();
            gpu.group_size = (pw, ph + strip_height(s));
            self.renderer.set_images(&gpu.group);
        }
    }

    /// onFinalize.
    fn finalize(&mut self, translation_y: f64, velocity_y: f64) {
        if !self.opened {
            return;
        }
        if translation_y > 0.0 && (self.scale() < 0.95 || velocity_y > 800.0) {
            self.toggle();
        }
        self.x.to_clamped(0.0, 0.0, GENTLE);
        self.y.to_clamped(0.0, 0.0, GENTLE);
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_plus_presses_only_when_lifted_inside_it() {
        // pressto's BaseButton: onPress needs pointerInside at the lift (shouldCancelWhenOutside
        // false keeps the press on while the finger is off it, but lifting there presses nothing).
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut m = modal();
        m.size = (420.0, 912.0);
        m.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        assert!(m.plus_press.is_pressed());
        m.input(&pointer(PointerPhase::Up, 300.0, 848.0, 80.0));
        assert!(!m.plus_press.is_pressed());
        assert!(m.messages().is_empty());
        assert!(!m.opened);
        m.input(&pointer(PointerPhase::Down, 356.0, 848.0, 200.0));
        m.input(&pointer(PointerPhase::Up, 360.0, 850.0, 1500.0));
        assert_eq!(m.messages(), vec!["press".to_string(), "open".to_string()]);
        assert!(m.opened);
    }

    #[test]
    fn it_opens_drags_and_closes() {
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
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut s = surface();
        s.bind(&[], None).unwrap();
        let (closed, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        closed.save("floating-modal-closed");
        assert!(!moving);
        // The button: 324…388 × 816…880, white; the window around it clear.
        assert_eq!(closed.at(2 * 330, 2 * 860), [255, 255, 255, 255]);
        assert_eq!(closed.at(2 * 100, 2 * 100)[3], 0);

        // Tap the "+": it opens.
        s.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 356.0, 848.0, 80.0));
        assert_eq!(s.messages(), vec!["press".to_string(), "open".to_string()]);
        let mut ms = 0.0;
        while ms < 800.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (open, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        open.save("floating-modal-open");
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"opened\":true"));
        // The floating sheet: x 10…410, 378 tall, 10 above the bottom (y 524…902); the scrim
        // darkens the rest; "Done" (y 832…892) is #111.
        assert_eq!(open.at(2 * 30, 2 * 700), [255, 255, 255, 255]);
        assert_eq!(open.at(2 * 10, 2 * 100)[3], 102);
        assert_eq!(&open.at(2 * 60, 2 * 862)[..3], &[0x11, 0x11, 0x11]);

        // Drag it down 210 (RNGH on iOS leaves UIKit's 10 pt hysteresis out: translation 200):
        // it shrinks, and the release closes it.
        s.input(&pointer(PointerPhase::Down, 210.0, 650.0, ms));
        for k in 1..=21 {
            ms += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0,
                650.0 + 10.0 * k as f32,
                ms,
            ));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (dragged, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        dragged.save("floating-modal-dragged");
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"scale\":0.8008"), "{state}");
        s.input(&pointer(PointerPhase::Up, 210.0, 860.0, ms));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert!(s.agent("{}").unwrap().contains("\"opened\":false"));
        assert_eq!(back.data, closed.data);
    }

    #[test]
    fn the_plus_shows_the_last_transform_written() {
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
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut m = modal();
        m.bind(&[], None).unwrap();
        fixture::render(&gpu, &mut m, &frame(0.0)).unwrap();
        // Open: during the release both move, the icon's rotate is written last.
        m.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        let mut ms = 0.0;
        for _ in 0..3 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        // Held, closed: pressto's scale only.
        assert_eq!(m.plus_shown.0, 0.0);
        assert!(m.plus_shown.1 < 1.0);
        m.input(&pointer(PointerPhase::Up, 356.0, 848.0, ms));
        // The 500 ms critically damped spring rests (Reanimated's energy threshold) ~1 s on.
        while ms < 1500.0 {
            ms += 16.0;
            let before = m.progress.value;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
            if m.progress.value != before {
                // Both may have moved this frame: the icon's rotate is written last.
                assert_eq!(m.plus_shown.1, 1.0, "the rotate wins the shared frames");
            }
        }
        assert!(
            (m.plus_shown.0 - std::f64::consts::FRAC_PI_4).abs() < 1e-9 && m.plus_shown.1 == 1.0,
            "{:?} progress {} running {}",
            m.plus_shown,
            m.progress.value,
            m.progress.running
        );
        // Opened, press the "+" (now at the modal's top-left) and hold: the press rewrites the
        // transform as [scale], the rotation is gone while held.
        let (fx, fy, _, _) = m.layout(1.0).frame;
        m.input(&pointer(
            PointerPhase::Down,
            fx as f32 + 32.0,
            fy as f32 + 32.0,
            ms,
        ));
        for _ in 0..3 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        assert_eq!(m.plus_shown.0, 0.0);
    }

    #[test]
    fn pressing_done_rewrites_the_plus_upright() {
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
            shader_generation: 0,
            headroom: 1.0,
        };
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut m = modal();
        fixture::render(&gpu, &mut m, &frame(0.0)).unwrap();
        m.input(&pointer(PointerPhase::Down, 356.0, 848.0, 0.0));
        m.input(&pointer(PointerPhase::Up, 356.0, 848.0, 80.0));
        let mut ms = 80.0;
        while ms < 1000.0 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        assert!((m.plus_shown.0 - std::f64::consts::FRAC_PI_4).abs() < 1e-9);
        // "Done" (the bottom row of the floating sheet, y 832…892): its onPress sets
        // lastTouchedPressable, and the "+"'s pressto style writes [scale] over the rotate.
        m.input(&pointer(PointerPhase::Down, 210.0, 862.0, ms));
        m.input(&pointer(PointerPhase::Up, 210.0, 862.0, ms + 80.0));
        assert_eq!(
            m.messages(),
            vec!["press".to_string(), "open".to_string(), "press".to_string()]
        );
        while ms < 2000.0 {
            ms += 16.0;
            fixture::render(&gpu, &mut m, &frame(ms)).unwrap();
        }
        assert_eq!(m.plus_shown, (0.0, 1.0));
        assert!(m.opened);
    }
}
