//! Exclusion Tabs (src/animations/exclusion-tabs/src: index.tsx, constants.ts,
//! components/exclusion-tabs and its hooks): four black tabs melted into one bar; the active one
//! turns blue with rounded corners and pushes its neighbours 10 pt away, so it stands apart.
//!
//! The canvas: the window's width × 45 (`containerWidth`, `height`), a Touchable.Canvas centred
//! on white.
//! - Font: Helvetica bold 13 (matchFont, a Skia font: no kerning); textWidths[i] =
//!   measureText(tab).width: RN Skia's bounds on iOS (each glyph's rounded out and outset
//!   by 1), not the ink: skia's `measure_text` does the same.
//! - Box i: an rrect (boxX, 0, textWidths[i] + 2 · internalBoxPadding (20), 45), radius
//!   borderRadius; boxX = Σ_{j<i} (textWidths[j] + 40) + animatedTranslateX + horizontalTabsPadding,
//!   horizontalTabsPadding = max((containerWidth − Σ (textWidths + 40)) / 2, 0). Filled with its
//!   colour, all four in the gooey layer (Blur 5, ColorMatrix alpha × 15 − 9).
//! - Text i: white, translated to (boxX + 20, 45 / 2 + 13 / 3), over the layer.
//! - A tap (the canvas's Tap, on touches up: the first box, in index order, whose path holds the
//!   finger) plays Haptics.selectionAsync and makes that tab active (React state: the boxes'
//!   animations start from where they are).
//!
//! Motion audit (each a useDerivedValue: a change of the active tab starts it from where it is):
//!
//! | value | driver | to | trigger |
//! |---|---|---|---|
//! | animatedTranslateX (box and text i) | withTiming default (300 ms, inOut(quad)) | i > active: 10, i < active: −10, else 0 | the active tab |
//! | borderRadius (box i) | withTiming default | active ? 12 : 0 | the active tab |
//! | color (box i) | withTiming 150 ms (inOut(quad)), gamma-2.2 channels | active ? #3E82F7 : #000000 | the active tab |
//!
//! Haptics: selection on every tap that lands on a box, the active one included.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, TapGesture};
use reanimated::{Easing, Timing};
use skia::{Color, Font, Paint};

use crate::gfx;
use crate::gooey::{ColorTiming, Goo, Gooey};

/// The tabs (index.tsx).
const TABS: [&str; 4] = ["Home", "Changelog", "Career", "About"];
/// The `height` prop.
const HEIGHT: f32 = 45.0;
/// internalBoxPadding.
const PADDING: f32 = 20.0;
const FONT_SIZE: f32 = 13.0;
/// The layer's Paint: Blur 5, ColorMatrix alpha × 15 − 9.
const GOO: Goo = Goo { sigma: 5.0, k: 15.0, b: -9.0 };
/// activeBackgroundColor, backgroundColor.
const ACTIVE: [u8; 3] = [0x3E, 0x82, 0xF7];
const INACTIVE: [u8; 3] = [0, 0, 0];
static HELVETICA_BOLD: &[u8] = include_bytes!("../fonts/helvetica-bold-subset.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // react-native-skia-gesture's onTap is a plain Gesture.Tap(): RNGH's iOS default, 500 ms and
    // no distance limit (the crate's default).
    let tap = TapGesture::default();
    let font = Font::new(HELVETICA_BOLD, FONT_SIZE);
    let widths = TABS.map(|t| font.as_ref().map_or(0.0, |f| f.measure_text(t).width));
    let active = 0;
    Box::new(ExclusionTabs {
        font,
        widths,
        width: 0.0,
        active,
        shift: std::array::from_fn(|i| Timing::at(shift(i, active))),
        radius: std::array::from_fn(|i| Timing::at(if i == active { 12.0 } else { 0.0 })),
        colors: std::array::from_fn(|i| ColorTiming::at(if i == active { ACTIVE } else { INACTIVE })),
        tap,
        gooey: Gooey::new(GOO),
        posted: Vec::new(),
    })
}

/// useAnimatedBoxX's translateX for tab `i`.
fn shift(i: usize, active: usize) -> f64 {
    if i > active {
        10.0
    } else if i < active {
        -10.0
    } else {
        0.0
    }
}

struct ExclusionTabs {
    font: Option<Font>,
    /// textWidths.
    widths: [f32; 4],
    /// containerWidth (the canvas's).
    width: f32,
    /// activeTabIndex.
    active: usize,
    /// animatedTranslateX per tab.
    shift: [Timing; 4],
    /// borderRadius per tab.
    radius: [Timing; 4],
    /// color per tab.
    colors: [ColorTiming; 4],
    tap: TapGesture,
    gooey: Gooey,
    posted: Vec<String>,
}

impl ExclusionTabs {
    /// horizontalTabsPadding.
    fn padding(&self) -> f32 {
        let total: f32 = self.widths.iter().map(|w| w + PADDING * 2.0).sum();
        ((self.width - total) / 2.0).max(0.0)
    }
    /// boxX of tab `i`.
    fn box_x(&self, i: usize) -> f32 {
        let before: f32 = self.widths[..i].iter().map(|w| w + PADDING * 2.0).sum();
        before + self.shift[i].value as f32 + self.padding()
    }
    /// The first tab whose rrect holds (x, y).
    fn tab_at(&self, x: f32, y: f32) -> Option<usize> {
        (0..TABS.len()).find(|&i| {
            let (bx, w, r) = (self.box_x(i), self.widths[i] + PADDING * 2.0, self.radius[i].value as f32);
            if x < bx || x > bx + w || y < 0.0 || y > HEIGHT {
                return false;
            }
            let r = r.min(w / 2.0).min(HEIGHT / 2.0);
            let cx = x.clamp(bx + r, bx + w - r);
            let cy = y.clamp(r, HEIGHT - r);
            (x - cx).hypot(y - cy) <= r
        })
    }
    fn select(&mut self, index: usize) {
        if index == self.active {
            return;
        }
        let was = self.active;
        self.active = index;
        for i in 0..TABS.len() {
            let to = shift(i, index);
            if to != shift(i, was) {
                self.shift[i].to(to, 300.0, Easing::timing_default());
            }
            if i == index || i == was {
                let on = i == index;
                self.radius[i].to(if on { 12.0 } else { 0.0 }, 300.0, Easing::timing_default());
                self.colors[i].to(if on { ACTIVE } else { INACTIVE }, 150.0);
            }
        }
    }
}

impl Surface for ExclusionTabs {
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
        Some(format!("{{\"active\":{},\"tab\":\"{}\"}}", self.active, TABS[self.active]))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if let Event::Tap { x, y } = self.tap.event(id, gfx::phase(phase), x, y, at_ms, true) {
            if let Some(i) = self.tab_at(x, y) {
                self.posted.push("haptic:selection".into());
                self.select(i);
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
        self.width = frame.width;
        let now = frame.now_ms;
        let mut moving = false;
        for i in 0..TABS.len() {
            moving |= self.shift[i].step(now);
            moving |= self.radius[i].step(now);
            moving |= self.colors[i].step(now);
        }
        let xs: [f32; 4] = std::array::from_fn(|i| self.box_x(i));
        self.gooey.begin(frame);
        for (i, &x) in xs.iter().enumerate() {
            let r = self.radius[i].value as f32;
            self.gooey.goo.draw_rrect(x, 0.0, self.widths[i] + PADDING * 2.0, HEIGHT, r, &Paint::fill(self.colors[i].color()));
        }
        if let Some(font) = &self.font {
            let white = Paint::fill(Color::WHITE);
            for (i, &x) in xs.iter().enumerate() {
                self.gooey.top.draw_text(TABS[i], x + PADDING, HEIGHT / 2.0 + FONT_SIZE / 3.0, font, &white);
            }
        }
        self.gooey.draw(frame, device, queue, encoder, target, format);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: HEIGHT, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    #[test]
    fn a_tap_moves_the_blue_tab() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "exclusion-tabs-home", [255, 255, 255]);
        assert!(!moving);
        let blue = |p: [u8; 4]| p[2] > 200 && p[0] < 120 && p[3] > 200;
        let black = |p: [u8; 4]| p[0] < 20 && p[2] < 20 && p[3] > 200;
        // Tab widths: Home 36.1, Changelog 67.2, Career 41.2, About 37.5 (ink, a little less);
        // padding ≈ (420 − 342) / 2 ≈ 39: Home's box from ≈ 39.5, blue.
        let tabs = |s: &mut Box<dyn Surface>| s.agent("").unwrap();
        assert!(blue(img.at(3 * 55, 3 * 10)), "Home {:?}", img.at(165, 30));
        assert!(black(img.at(3 * 200, 3 * 10)), "Changelog {:?}", img.at(600, 30));
        // A tap on Career (box ≈ 195 + 10 … 286 + 10).
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 22.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 260.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 260.0, 50.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(tabs(&mut s), "{\"active\":2,\"tab\":\"Career\"}");
        let mut ms = 16.0;
        let mut img = img;
        let mut moving = true;
        while moving && ms < 2000.0 {
            ms += 16.0;
            (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        gfx::save_over(&img, "exclusion-tabs-career", [255, 255, 255]);
        assert!(black(img.at(3 * 55, 3 * 10)), "Home {:?}", img.at(165, 30));
        assert!(blue(img.at(3 * 270, 3 * 10)), "Career {:?}", img.at(810, 30));
    }
}
