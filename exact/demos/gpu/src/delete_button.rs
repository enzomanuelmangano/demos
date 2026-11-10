//! Delete Button (src/animations/delete-button/src: index.tsx, components/delete-button.tsx and
//! its hooks): a red "Delete" pill that, tapped, slides left, turns black and reads "Confirm",
//! while a black close circle melts out of its right end; the circle's "X" puts it back.
//!
//! The canvas: (width + additionalWidth) × height = (150 + 80) × 50 (index.tsx's props), in a
//! Touchable.Canvas, centred on white.
//! - The gooey layer (useGooeyLayer: Blur 10, ColorMatrix alpha × 18 − 10):
//!   - a RoundedRect (deleteButtonRectX, 0, 150, 50, r 20) in deleteButtonColor, in a Group
//!     scaled by `scale` about (width / 2, height / 2) = (75, 25);
//!   - a Circle (closeIconCircleX, 25, r 25) in deleteButtonColor, in a Group at opacity
//!     closeButtonOpacity, scaled by `closeButtonScale` about (width + additionalWidth / 2,
//!     25) = (190, 25).
//! - "Delete" and "Confirm" (Helvetica bold 14: matchFont, a Skia font: no kerning), white, at
//!   x = deleteButtonRectX + 75 − measureText(text).width / 2, y = 14 / 3 + 25, at their
//!   opacities.
//! - The close icon: two white RoundedRects (12√2 + 2) × 2, r 1, centred, rotated ±π/4, in a
//!   Group translated to (closeIconCircleX, 25), in a layer at closeButtonOpacity (both bars
//!   are one path here: a layer's alpha covers their crossing once).
//!
//! Gestures (react-native-skia-gesture): the canvas's Pan, onBegin on a shape (its own props'
//! path, no Group transform; the rect is registered before the circle) is that shape's onStart
//! and its onFinalize the same shape's onEnd; the canvas's Tap (RNGH: 500 ms, no distance), on
//! touches up, is the onTap of the shape under the lifted finger.
//! - Rect: onStart pressed; onEnd released; onTap released, Haptics.selectionAsync, then
//!   isToggled = true (when toggled, onDelete: isToggled = !closeOnConfirm = true, and
//!   onConfirmDeletion, a no-op).
//! - Circle: onStart pressed; onEnd released; onTap released, isToggled = false, selection
//!   haptic.
//!
//! Motion audit (every animated value; Reanimated 4 defaults: withSpring GentleSpringConfig
//! (900, 120, 4), withTiming 300 ms inOut(quad)); each a useDerivedValue, so a change of
//! isToggled / pressed starts it from where it is, a spring keeping its velocity:
//!
//! | value | driver | to | trigger |
//! |---|---|---|---|
//! | deleteButtonRectX | withSpring default | toggled ? 0 : additionalWidth / 2 (40) | isToggled |
//! | deleteButtonColor | withTiming default, gamma-2.2 channels | toggled ? black : red | isToggled |
//! | scale (rect group) | withSpring default | pressed ? 0.95 : 1 | rect onStart / onEnd / onTap |
//! | closeIconCircleX | withSpring default | toggled ? 190 : 115 | isToggled |
//! | closeButtonOpacity (circle group, icon layer alpha) | withTiming default | toggled ? 1 : 0 | isToggled |
//! | closeButtonScale | withSpring default | pressed ? 0.95 : 1 | circle onStart / onEnd / onTap |
//! | deleteTextOpacity | withTiming default | toggled ? 0 : 1 | isToggled |
//! | confirmTextOpacity | withTiming default | toggled ? 1 : 0 | isToggled |
//!
//! Text x follows deleteButtonRectX each frame (no animation of its own). Haptics: selection on
//! each onTap that lands on a shape.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, Phase, TapGesture};
use reanimated::{Easing, Spring, Timing, GENTLE};
use skia::{Color, Font, Matrix, Paint, Path};

use crate::gfx;
use crate::gooey::{ColorTiming, Goo, Gooey};

/// The `width` prop.
const WIDTH: f32 = 150.0;
/// The `height` prop.
const HEIGHT: f32 = 50.0;
/// The `additionalWidth` prop.
const ADDITIONAL: f32 = 80.0;
/// The RoundedRect's r.
const RECT_RADIUS: f32 = 20.0;
/// fontStyle.fontSize.
const FONT_SIZE: f32 = 14.0;
/// CloseIconBarLength.
const BAR_LENGTH: f32 = 12.0 * std::f32::consts::SQRT_2 + 2.0;
/// CloseIconBarThickness.
const BAR_THICKNESS: f32 = 2.0;
/// initialText, confirmText.
const DELETE: &str = "Delete";
const CONFIRM: &str = "Confirm";
/// useGooeyLayer's defaults: blurRadius 10, alphaMultiplier 18, alphaOffset −10.
const GOO: Goo = Goo { sigma: 10.0, k: 18.0, b: -10.0 };
const RED: [u8; 3] = [255, 0, 0];
const BLACK: [u8; 3] = [0, 0, 0];
/// Helvetica Bold (face 1 of iOS's Helvetica.ttc), the glyphs of the labels both Helvetica demos
/// draw.
static HELVETICA_BOLD: &[u8] = include_bytes!("../fonts/helvetica-bold-subset.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let mut tap = TapGesture::default();
    tap.max_distance = f32::INFINITY;
    let font = Font::new(HELVETICA_BOLD, FONT_SIZE);
    let widths = font.as_ref().map_or((0.0, 0.0), |f| (f.measure_text(DELETE).width, f.measure_text(CONFIRM).width));
    Box::new(DeleteButton {
        font,
        widths,
        cross: cross_path(),
        toggled: false,
        rect_x: Spring::at((ADDITIONAL / 2.0) as f64),
        color: ColorTiming::at(RED),
        scale: Spring::at(1.0),
        close_x: Spring::at((WIDTH / 2.0 + ADDITIONAL / 2.0) as f64),
        close_opacity: Timing::at(0.0),
        close_scale: Spring::at(1.0),
        delete_opacity: Timing::at(1.0),
        confirm_opacity: Timing::at(0.0),
        finger: None,
        tap,
        gooey: Gooey::new(GOO),
        posted: Vec::new(),
    })
}

/// The two bars of the close icon, centred on the origin, as one path.
fn cross_path() -> Path {
    let bar = skia::rrect_path(-BAR_LENGTH / 2.0, -BAR_THICKNESS / 2.0, BAR_LENGTH, BAR_THICKNESS, BAR_THICKNESS / 2.0);
    let a = skia::transform_path(&bar, &Matrix::rotate(std::f32::consts::FRAC_PI_4));
    let b = skia::transform_path(&bar, &Matrix::rotate(-std::f32::consts::FRAC_PI_4));
    let mut builder = Path::builder();
    builder.extend_from_paths(&[a.as_slice(), b.as_slice()]);
    builder.build()
}

/// The shape a touch belongs to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Shape {
    Rect,
    Circle,
}

struct DeleteButton {
    font: Option<Font>,
    /// measureText(initialText).width, measureText(confirmText).width.
    widths: (f32, f32),
    cross: Path,
    /// isToggled.
    toggled: bool,
    /// deleteButtonRectX.
    rect_x: Spring,
    /// deleteButtonColor.
    color: ColorTiming,
    /// The rect group's scale (isButtonPressed).
    scale: Spring,
    /// closeIconCircleX.
    close_x: Spring,
    close_opacity: Timing,
    /// closeButtonScale (isCloseButtonPressed).
    close_scale: Spring,
    delete_opacity: Timing,
    confirm_opacity: Timing,
    /// The canvas pan's finger and the shape its onBegin landed on.
    finger: Option<(u32, Option<Shape>)>,
    tap: TapGesture,
    gooey: Gooey,
    /// Haptics for the app to play.
    posted: Vec<String>,
}

impl DeleteButton {
    /// The first registered shape whose path holds (x, y), at its props' current values.
    fn shape_at(&self, x: f32, y: f32) -> Option<Shape> {
        if in_rrect(x, y, self.rect_x.value as f32, 0.0, WIDTH, HEIGHT, RECT_RADIUS) {
            return Some(Shape::Rect);
        }
        let cx = self.close_x.value as f32;
        if (x - cx).hypot(y - HEIGHT / 2.0) <= HEIGHT / 2.0 {
            return Some(Shape::Circle);
        }
        None
    }

    fn press(&mut self, shape: Shape, pressed: bool) {
        let s = match shape {
            Shape::Rect => &mut self.scale,
            Shape::Circle => &mut self.close_scale,
        };
        s.retarget(if pressed { 0.95 } else { 1.0 }, GENTLE);
    }

    fn toggle(&mut self, on: bool) {
        if self.toggled == on {
            return;
        }
        self.toggled = on;
        self.rect_x.retarget(if on { 0.0 } else { (ADDITIONAL / 2.0) as f64 }, GENTLE);
        self.color.to(if on { BLACK } else { RED }, 300.0);
        self.close_x.retarget((if on { WIDTH + ADDITIONAL / 2.0 } else { WIDTH / 2.0 + ADDITIONAL / 2.0 }) as f64, GENTLE);
        let (one, zero) = if on { (1.0, 0.0) } else { (0.0, 1.0) };
        self.close_opacity.to(one, 300.0, Easing::timing_default());
        self.delete_opacity.to(zero, 300.0, Easing::timing_default());
        self.confirm_opacity.to(one, 300.0, Easing::timing_default());
    }
}

/// Whether (x, y) is inside the rounded rect (Skia's `contains` of an `addRRect` path).
fn in_rrect(x: f32, y: f32, rx: f32, ry: f32, w: f32, h: f32, r: f32) -> bool {
    if x < rx || x > rx + w || y < ry || y > ry + h {
        return false;
    }
    let r = r.min(w / 2.0).min(h / 2.0);
    let cx = x.clamp(rx + r, rx + w - r);
    let cy = y.clamp(ry + r, ry + h - r);
    (x - cx).hypot(y - cy) <= r
}

impl Surface for DeleteButton {
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
            "{{\"toggled\":{},\"rectX\":{:.2},\"closeX\":{:.2},\"scale\":{:.3},\"closeScale\":{:.3}}}",
            self.toggled, self.rect_x.value, self.close_x.value, self.scale.value, self.close_scale.value
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        // The canvas's pan: onBegin on a shape is its onStart, onFinalize its onEnd.
        match phase {
            Phase::Down if self.finger.is_none() => {
                let shape = self.shape_at(x, y);
                self.finger = Some((id, shape));
                if let Some(shape) = shape {
                    self.press(shape, true);
                }
            }
            Phase::Up | Phase::Cancel if self.finger.is_some_and(|(f, _)| f == id) => {
                if let Some((_, Some(shape))) = self.finger.take() {
                    self.press(shape, false);
                }
            }
            _ => {}
        }
        // The canvas's tap: onTouchesUp on a shape is its onTap.
        if let Event::Tap { x, y } = self.tap.event(id, phase, x, y, at_ms, true) {
            match self.shape_at(x, y) {
                Some(Shape::Rect) => {
                    self.press(Shape::Rect, false);
                    self.posted.push("haptic:selection".into());
                    // onDelete when toggled sets isToggled = !closeOnConfirm (true): no change.
                    self.toggle(true);
                }
                Some(Shape::Circle) => {
                    self.press(Shape::Circle, false);
                    self.toggle(false);
                    self.posted.push("haptic:selection".into());
                }
                None => {}
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
        let now = frame.now_ms;
        let mut moving = false;
        for s in [&mut self.rect_x, &mut self.scale, &mut self.close_x, &mut self.close_scale] {
            moving |= s.step(now);
        }
        for t in [&mut self.close_opacity, &mut self.delete_opacity, &mut self.confirm_opacity] {
            moving |= t.step(now);
        }
        moving |= self.color.step(now);

        let rect_x = self.rect_x.value as f32;
        let close_x = self.close_x.value as f32;
        let close_opacity = self.close_opacity.value as f32;
        let color = Paint::fill(self.color.color());
        self.gooey.begin(frame);
        let goo = &mut self.gooey.goo;
        // The rect's group: scale about (width / 2, height / 2).
        let (s, ox, oy) = (self.scale.value as f32, WIDTH / 2.0, HEIGHT / 2.0);
        goo.save();
        goo.translate(ox, oy);
        goo.scale(s, s);
        goo.translate(-ox, -oy);
        goo.draw_rrect(rect_x, 0.0, WIDTH, HEIGHT, RECT_RADIUS, &color);
        goo.restore();
        // The circle's group: opacity, scale about (width + additionalWidth / 2, height / 2).
        if close_opacity > 0.0 {
            let (s, ox) = (self.close_scale.value as f32, WIDTH + ADDITIONAL / 2.0);
            goo.save();
            goo.opacity(close_opacity);
            goo.translate(ox, oy);
            goo.scale(s, s);
            goo.translate(-ox, -oy);
            goo.draw_circle(close_x, HEIGHT / 2.0, HEIGHT / 2.0, &color);
            goo.restore();
        }
        let top = &mut self.gooey.top;
        if let Some(font) = &self.font {
            let baseline = FONT_SIZE / 3.0 + HEIGHT / 2.0;
            for (text, width, opacity) in [(DELETE, self.widths.0, self.delete_opacity.value), (CONFIRM, self.widths.1, self.confirm_opacity.value)] {
                if opacity > 0.0 {
                    top.draw_text(text, rect_x + WIDTH / 2.0 - width / 2.0, baseline, font, &Paint::fill(Color::WHITE).with_opacity(opacity as f32));
                }
            }
        }
        if close_opacity > 0.0 {
            top.save();
            top.translate(close_x, HEIGHT / 2.0);
            top.draw_path(&self.cross, &Paint::fill(Color::WHITE).with_opacity(close_opacity));
            top.restore();
        }
        self.gooey.draw(frame, device, queue, encoder, target, format);
        moving || self.finger.is_some()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: WIDTH + ADDITIONAL, height: HEIGHT, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    fn pointer(phase: PointerPhase, x: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y: 25.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    #[test]
    fn delete_turns_into_confirm_and_the_cross_puts_it_back() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "delete-button-rest", [255, 255, 255]);
        assert!(!moving);
        // At rest: the red pill from x 40 to 190 (the layer's blur and alpha × 18 − 10 eat
        // its top and bottom edges), white text in its middle, nothing past it.
        let red = |p: [u8; 4]| p[0] > 200 && p[1] < 40 && p[3] > 200;
        assert!(red(img.at(3 * 60, 75)), "pill {:?}", img.at(180, 75));
        assert!(red(img.at(3 * 175, 75)), "pill right {:?}", img.at(525, 75));
        assert_eq!(img.at(3 * 20, 75)[3], 0, "left of it");
        assert_eq!(img.at(3 * 215, 75)[3], 0, "right of it");
        assert_eq!(img.at(3 * 115, 3)[3], 0, "the top edge is eaten by the goo");
        let white = img.data.chunks(4).filter(|p| p[0] > 200 && p[1] > 200 && p[3] > 200).count();
        assert!(white > 300, "the white label, {white} px");

        s.input(&pointer(PointerPhase::Down, 115.0, 10.0));
        assert!(s.agent("").unwrap().contains("\"toggled\":false"));
        s.input(&pointer(PointerPhase::Up, 115.0, 80.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let mut ms = 16.0;
        let mut img = img;
        let mut moving = true;
        while moving && ms < 4000.0 {
            ms += 16.0;
            (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        gfx::save_over(&img, "delete-button-confirm", [255, 255, 255]);
        assert!(s.agent("").unwrap().contains("\"toggled\":true"));
        // Toggled: a black pill from 0 to 150 and a black circle centred at 190.
        let black = |p: [u8; 4]| p[0] < 30 && p[3] > 200;
        assert!(black(img.at(3 * 20, 75)), "pill {:?}", img.at(60, 75));
        assert!(black(img.at(3 * 172, 75)), "circle's rim {:?}", img.at(516, 75));
        assert_eq!(img.at(3 * 190, 75)[..3], [255, 255, 255], "the cross's centre");

        // The cross: back to Delete.
        s.input(&pointer(PointerPhase::Down, 190.0, ms));
        s.input(&pointer(PointerPhase::Up, 190.0, ms + 60.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert!(s.agent("").unwrap().contains("\"toggled\":false"));
    }
}
