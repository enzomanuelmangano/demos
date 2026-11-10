//! Record Button (src/animations/record-button: index.tsx, components/record-button/index.tsx,
//! create-skia-line.ts), the whole demo: an inverted FlatList of two window-tall pages, the
//! HomeScreen ("Scroll") at offset 0 and the TopScreen above it, whose red "Record" outline draws
//! itself as the page comes in.
//!
//! The list (`ui_scroll`, vertical: the finger's y drives it; inverted, so dragging down raises
//! the offset): bounces false, decelerationRate "fast", snapToInterval the window's height
//! (RCTScrollView's rule: the page at or past UIKit's projected rest in the fling's direction).
//! onScrollBeginDrag: shouldEnableSnapping = progress < 0.9. onScrollEndDrag (at the lift,
//! after the release has picked its page): progress > 0.97 and shouldEnableSnapping →
//! scrollToIndex(1), UIKit's animated setContentOffset. The button's press → scrollToIndex(0).
//!
//! - progress = interpolate(offset, [0.08, 0.2] × height, [0, 1], CLAMP); activated =
//!   progress > 0.98, a light impact when it turns on.
//! - The HomeScreen: #191919, borderRadius interpolate(offset, [0, 0.1], [0, 35], CLAMP)
//!   continuous, "Scroll" (18, white) centred. Behind: #252525 (styles.list, the TopScreen).
//! - The button (90 × 40, bottom 40 of the TopScreen, centred): pressto's PressableScale (scale
//!   0.96 while pressed, withTiming 250 ms bezier(0.25, 0.1, 0.25, 1); a scroll that starts
//!   cancels the press), inside it scale withSpring(activated ? 1.1 : 1) (Gentle). The canvas:
//!   two stroked paths (#ed4e3c, 1, round caps) drawn to `end = progress`: getRightLinePath and
//!   its mirror; a RoundedRect (r 20) at opacity withTiming(activated ? 1 : 0). The label
//!   "Record" (16): opacity progress, white 600 once activated, else #ed4e3c 500, centred.
//!
//! Text is RN `<Text>` (`skia::match_ui_font`), its box the measured size rounded up to the
//! device pixel, its position floored to Yoga's pixel grid (a Text node's), its baseline the hhea ascender below its top.
//! View colours are Display P3 (`Color::view_hex`); Skia's paints are sRGB (`Color::hex`).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::{interpolate, Easing, Extrapolation, Spring, Timing, GENTLE};
use skia::{path_from_svg, Canvas, Color, Font, Matrix, Paint, Path, Renderer};

use crate::floating_modal::press_easing;
use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

const WIDTH: f32 = 90.0;
const HEIGHT: f32 = 40.0;
const RADIUS: f32 = 20.0;
const STROKE: f32 = 1.0;
const COLOR: u32 = 0xed4e3c;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(RecordButton::new())
}

impl RecordButton {
    fn new() -> RecordButton {
        let right = right_line_path(STROKE, RADIUS, WIDTH, HEIGHT);
        // builder.transform(Skia.Matrix().translate(width, 0).scale(-1, 1)): x → width − x.
        let left = skia::transform_path(
            &right,
            &Matrix::scale(-1.0, 1.0).then(Matrix::translate(WIDTH, 0.0)),
        );
        RecordButton {
            size: (0.0, 0.0),
            scale: 3.0,
            scroll: None,
            snapping: false,
            activated: false,
            fill: Timing::at(0.0),
            grow: Spring::at(1.0),
            press: Timing::at(0.0),
            finger: None,
            posted: Vec::new(),
            right,
            left,
            scroll_font: skia::match_ui_font(18.0, 400.0),
            label_500: skia::match_ui_font(16.0, 500.0),
            label_600: skia::match_ui_font(16.0, 600.0),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }
}

/// getRightLinePath.
fn right_line_path(stroke: f32, r: f32, width: f32, height: f32) -> Path {
    let pad = stroke / 2.0;
    let (w, h) = (width - pad * 2.0, height - pad * 2.0);
    let d = format!(
        "M{} {} L{} {} a{r} {r} 0 0 0 {r} {} L{w} {} a{r} {r} 0 0 0 {} {} L{} {pad}",
        w / 2.0,
        h,
        w - r,
        h,
        -r,
        r + pad,
        -r,
        -r,
        w / 2.0
    );
    path_from_svg(&d).unwrap_or_default()
}

struct RecordButton {
    size: (f64, f64),
    scale: f64,
    scroll: Option<UiScroll>,
    /// shouldEnableSnapping.
    snapping: bool,
    activated: bool,
    /// internalRoundedRectOpacity.
    fill: Timing,
    /// rContainerStyle's scale.
    grow: Spring,
    /// pressto's press (0 → 1 while pressed).
    press: Timing,
    /// The finger on the button.
    finger: Option<u32>,
    posted: Vec<String>,
    right: Path,
    left: Path,
    scroll_font: Option<Font>,
    label_500: Option<Font>,
    label_600: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

impl RecordButton {
    fn round(&self, v: f64) -> f64 {
        (v * self.scale).round() / self.scale
    }

    fn floor(&self, v: f64) -> f64 {
        (v * self.scale + 1e-4).floor() / self.scale
    }

    fn ceil(&self, v: f64) -> f64 {
        (v * self.scale - 1e-4).ceil() / self.scale
    }

    fn offset(&self) -> f64 {
        self.scroll.as_ref().map_or(0.0, |s| s.offset)
    }

    fn progress(&self) -> f64 {
        let h = self.size.1;
        interpolate(
            self.offset(),
            &[h * 0.08, h * 0.2],
            &[0.0, 1.0],
            Extrapolation::Clamp,
        )
    }

    /// The button's frame (before its scales): left, top.
    fn button(&self) -> (f64, f64) {
        let (w, _) = self.size;
        (
            self.round((w - WIDTH as f64) / 2.0),
            self.offset() - 40.0 - HEIGHT as f64,
        )
    }

    fn ensure(&mut self) {
        let h = self.size.1;
        match &mut self.scroll {
            Some(s) => {
                s.max = h;
                s.port = h;
                s.snap = Snap::Interval(h);
            }
            None => {
                let mut s = UiScroll::new(0.0, h, h, FAST, Snap::Interval(h));
                s.bounces = false;
                self.scroll = Some(s);
            }
        }
    }

    /// The mappers reading the scroll.
    fn react(&mut self) {
        let on = self.progress() > 0.98;
        if on != self.activated {
            if on {
                self.posted.push("haptic:impact-light".into());
            }
            self.activated = on;
            self.grow.retarget(if on { 1.1 } else { 1.0 }, GENTLE);
            self.fill
                .to(if on { 1.0 } else { 0.0 }, 300.0, Easing::timing_default());
        }
    }

    /// A Text's box and baseline: (left, baseline) for `text` centred in the box at `x, y, w, h`.
    fn centred(&self, font: &Font, text: &str, x: f64, y: f64, w: f64, h: f64) -> (f32, f32) {
        let m = font.metrics();
        let tw = self.ceil(font.advance_width(text) as f64);
        let th = self.ceil((-m.ascent + m.descent + m.leading) as f64);
        // Yoga rounds a Text node's position down to the pixel grid (roundLayoutResultsToPixelGrid:
        // forceFloor for NodeType::Text), not to the nearest pixel.
        let left = self.floor(x + (w - tw) / 2.0);
        let top = self.floor(y + (h - th) / 2.0);
        // The baseline, the hhea ascender below the top, lands on the next device pixel row (A/B
        // registrations of RN text against this: +0.48, +0.59, +0.44, +0.3 px, each the distance
        // to the next row).
        (left as f32, self.ceil(top - m.ascent as f64) as f32)
    }
}

impl Surface for RecordButton {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let held = self.scroll.as_ref().is_some_and(|s| s.dragging()) || self.finger.is_some();
        Some(format!(
            "{{\"offset\":{:.2},\"progress\":{:.3},\"activated\":{},\"held\":{held}}}",
            self.offset(),
            self.progress(),
            self.activated
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
        self.ensure();
        let phase = gfx::phase(phase);
        let (bx, by) = self.button();
        let on_button = (bx..=bx + WIDTH as f64).contains(&(x as f64))
            && (by..=by + HEIGHT as f64).contains(&(y as f64));
        if phase == Phase::Down && on_button && self.finger.is_none() {
            self.finger = Some(id);
            self.press.to(1.0, 250.0, press_easing());
        }
        // The list scrolls along y; inverted, a finger moving down raises the offset, so the
        // scroll model (whose content moves against the finger's x) is fed −y.
        let Some(s) = self.scroll.as_mut() else {
            return;
        };
        let was = s.dragging();
        s.input(id, phase, -y, x, at_ms, true);
        let now = s.dragging();
        if now && !was {
            // onScrollBeginDrag; the scroll cancels the press (pressto under a ScrollView).
            self.snapping = self.progress() < 0.9;
            if self.finger.take().is_some() {
                self.press.to(0.0, 250.0, press_easing());
            }
        }
        if self.scroll.as_mut().is_some_and(|s| s.take_drag_end())
            && self.progress() > 0.97
            && self.snapping
        {
            // onScrollEndDrag: scrollToIndex({ index: 1 }).
            let h = self.size.1;
            if let Some(s) = self.scroll.as_mut() {
                s.scroll_to(h);
            }
        }
        if self.finger == Some(id) && matches!(phase, Phase::Up | Phase::Cancel) {
            self.finger = None;
            self.press.to(0.0, 250.0, press_easing());
            if phase == Phase::Up && on_button {
                // onButtonPress: scrollToIndex({ index: 0 }); the app's press haptic.
                self.posted.push("haptic:selection".into());
                if let Some(s) = self.scroll.as_mut() {
                    s.scroll_to(0.0);
                }
            }
        }
        self.react();
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
        self.scale = frame.scale as f64;
        self.ensure();
        let now = frame.now_ms;
        let mut moving = self.scroll.as_mut().is_some_and(|s| s.step(now));
        self.react();
        moving |= self.fill.step(now) | self.grow.step(now) | self.press.step(now);
        let (w, h) = self.size;
        let offset = self.offset();
        let progress = self.progress();
        let (bx, by) = self.button();
        let scroll_text = self
            .scroll_font
            .as_ref()
            .map(|f| self.centred(f, "Scroll", 0.0, 0.0, w, h));
        let label_font = if self.activated {
            self.label_600.as_ref()
        } else {
            self.label_500.as_ref()
        };
        let label =
            label_font.map(|f| self.centred(f, "Record", 0.0, 0.0, WIDTH as f64, HEIGHT as f64));
        let (wf, hf) = (w as f32, h as f32);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::view_hex(0x252525));

        // The HomeScreen, `offset` below the top.
        let radius = interpolate(offset, &[0.0, 0.1], &[0.0, 35.0], Extrapolation::Clamp) as f32;
        c.save();
        c.translate(0.0, offset as f32);
        c.draw_continuous_rrect(
            0.0,
            0.0,
            wf,
            hf,
            radius,
            &Paint::fill(Color::view_hex(0x191919)),
        );
        if let (Some(font), Some((x, baseline))) = (self.scroll_font.as_ref(), scroll_text) {
            c.draw_text("Scroll", x, baseline, font, &Paint::fill(Color::WHITE));
        }
        c.restore();

        // The button, in the TopScreen.
        if by + (HEIGHT as f64) * 1.1 > 0.0 {
            let s = (interpolate(
                self.press.value,
                &[0.0, 1.0],
                &[1.0, 0.96],
                Extrapolation::Extend,
            ) * self.grow.value) as f32;
            c.save();
            c.translate(bx as f32 + WIDTH / 2.0, by as f32 + HEIGHT / 2.0);
            c.scale(s, s);
            c.translate(-WIDTH / 2.0, -HEIGHT / 2.0);
            let line =
                Paint::stroke(Color::hex(COLOR), STROKE).caps(skia::Cap::Round, skia::Join::Miter);
            let end = progress as f32;
            if end > 0.0 {
                c.draw_path(&skia::trim(&self.left, 0.0, end), &line);
                c.draw_path(&skia::trim(&self.right, 0.0, end), &line);
            }
            if self.fill.value > 0.0 {
                c.draw_rrect(
                    0.0,
                    0.0,
                    WIDTH,
                    HEIGHT,
                    RADIUS,
                    &Paint::fill(Color::hex(COLOR)).with_opacity(self.fill.value as f32),
                );
            }
            if let (Some(font), Some((x, baseline))) = (label_font, label) {
                let color = if self.activated {
                    Color::WHITE
                } else {
                    Color::view_hex(COLOR)
                };
                if progress > 0.0 {
                    c.draw_text(
                        "Record",
                        x,
                        baseline,
                        font,
                        &Paint::fill(color).with_opacity(progress as f32),
                    );
                }
            }
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
        moving || self.finger.is_some() || self.scroll.as_ref().is_some_and(|s| s.moving())
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
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

    fn settle(gpu: &exact_gpu::Gpu, s: &mut Box<dyn Surface>, mut ms: f64) -> f64 {
        let end = ms + 3000.0;
        while ms < end {
            ms += 16.0;
            fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms
    }

    #[test]
    fn a_short_flick_down_pages_up_and_the_press_comes_home() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("record-button-home");
        // A 120 pt flick down at ~600 pt/s: the nearest page is the home one, RN's snapToInterval
        // takes the next one in the fling's direction (the TopScreen).
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 300.0, ms));
        for k in 1..=12 {
            ms += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0,
                300.0 + 10.0 * k as f32,
                ms,
            ));
        }
        s.input(&pointer(PointerPhase::Up, 210.0, 420.0, ms + 4.0));
        let ms = settle(&gpu, &mut s, ms);
        let state = s.agent("{}").unwrap();
        assert!(
            state.contains("\"offset\":912.00") && state.contains("\"activated\":true"),
            "{state}"
        );
        assert!(s.messages().contains(&"haptic:impact-light".to_string()));
        let (top, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        top.save("record-button-top");
        // The filled button at 165…255 × 832…872.
        assert_eq!(&top.at(3 * 175, 3 * 852)[..3], &[0xed, 0x4e, 0x3c]);
        // A tap on it scrolls home.
        s.input(&pointer(PointerPhase::Down, 210.0, 852.0, ms));
        s.input(&pointer(PointerPhase::Up, 210.0, 852.0, ms + 60.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        settle(&gpu, &mut s, ms + 60.0);
        assert!(s.agent("{}").unwrap().contains("\"offset\":0.00"));
    }

    #[test]
    fn a_slow_drag_past_097_snaps_up_at_the_lift() {
        let mut s = RecordButton::new();
        s.size = (420.0, 912.0);
        s.ensure();
        // Drag down 200 slowly (progress 1 at 182.4), hold, lift: no fling, the nearest page
        // is home, but onScrollEndDrag's rule scrolls to the TopScreen.
        let mut ms = 0.0;
        s.input(&pointer(PointerPhase::Down, 210.0, 300.0, ms));
        for k in 1..=40 {
            ms += 25.0;
            s.input(&pointer(
                PointerPhase::Move,
                210.0,
                300.0 + 5.25 * k as f32,
                ms,
            ));
        }
        s.input(&pointer(PointerPhase::Up, 210.0, 510.0, ms + 400.0));
        let mut t = ms + 400.0;
        while s.scroll.as_mut().unwrap().step(t) {
            t += 16.0;
        }
        assert_eq!(s.offset(), 912.0);
    }
}
