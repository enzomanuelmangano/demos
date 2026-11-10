//! Miles Bar Chart's week strip (src/animations/miles-bar-chart/src/index.tsx): a horizontal
//! FlatList of seven week labels, one window-wide page each, under the chart (the bars stay in
//! the Contract; this surface posts `week:<i>` when activeIndex changes).
//!
//! - The column (the 150 pt chart over the 60 pt list box) is centred in the screen. The list:
//!   snapToInterval width, decelerationRate "fast", bounces (`ui_scroll`, RCTScrollView's snap:
//!   the page at or past UIKit's projected rest in the fling's direction), hitSlop 100.
//! - activeIndex = floor((offset + width / 2) / width), held in 0…6; a selection haptic when it
//!   changes (useAnimatedReaction).
//! - Each label: an item view the window's width, 40 tall under the content's paddingTop 20
//!   (the horizontal content row stretches to the list's 60), the Text centred in it: white
//!   FiraCode-Regular 16. TextKit lays the Text out at the hhea line height ((1980 + 644) /
//!   2000 × 16 = 20.992), its baseline the hhea ascender (15.84) below the line's top; RN sizes
//!   the Text's box to its measured width and height rounded up to the device pixel, and Yoga
//!   rounds a Text node's position down to the pixel grid (roundLayoutResultsToPixelGrid's
//!   forceFloor for NodeType::Text), not to the nearest pixel. Inputs: the seven labels.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

static FIRA: &[u8] = include_bytes!("../fonts/fira-code-regular.ttf");
const WEEKS: usize = 7;
const SIZE: f32 = 16.0;
/// The chart's height and the list box's.
const CHART: f64 = 150.0;
const LIST: f64 = 60.0;
const PAD_TOP: f64 = 20.0;
const HIT_SLOP: f64 = 100.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Weeks {
        size: (0.0, 0.0),
        scale: 3.0,
        labels: Vec::new(),
        scroll: None,
        active: 0,
        posted: Vec::new(),
        font: Font::new(FIRA, SIZE).map(Font::with_ui_layout),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct Weeks {
    size: (f64, f64),
    scale: f64,
    labels: Vec<String>,
    scroll: Option<UiScroll>,
    active: i64,
    posted: Vec<String>,
    font: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Weeks {
    fn round(&self, v: f64) -> f64 {
        (v * self.scale).round() / self.scale
    }

    /// The list box's top.
    fn list_top(&self) -> f64 {
        self.round((self.size.1 - CHART - LIST) / 2.0) + CHART
    }

    fn ensure(&mut self) {
        let w = self.size.0;
        let max = w * (WEEKS as f64 - 1.0);
        match &mut self.scroll {
            Some(s) => {
                s.max = max;
                s.port = w;
                s.snap = Snap::Interval(w);
            }
            None => self.scroll = Some(UiScroll::new(0.0, max, w, FAST, Snap::Interval(w))),
        }
    }

    fn react(&mut self) {
        let w = self.size.0;
        let x = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let i = (((x + w / 2.0) / w).floor() as i64).clamp(0, WEEKS as i64 - 1);
        if i != self.active {
            self.active = i;
            self.posted.push(format!("week:{i}"));
        }
    }
}

impl Surface for Weeks {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.labels = (0..WEEKS)
            .map(|i| {
                inputs
                    .get(i)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string()
            })
            .collect();
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let held = self.scroll.as_ref().is_some_and(|s| s.dragging());
        Some(format!(
            "{{\"offset\":{offset:.2},\"active\":{},\"held\":{held}}}",
            self.active
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
        let top = self.list_top();
        let w = self.size.0;
        let inside = (-HIT_SLOP..=w + HIT_SLOP).contains(&(x as f64))
            && (top - HIT_SLOP..=top + LIST + HIT_SLOP).contains(&(y as f64));
        if let Some(s) = &mut self.scroll {
            s.input(id, gfx::phase(phase), x, y, at_ms, inside);
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
        let moving = self.scroll.as_mut().is_some_and(|s| s.step(frame.now_ms));
        self.react();
        let w = self.size.0;
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let item_top = self.list_top() + PAD_TOP;
        let item_h = LIST - PAD_TOP;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(font) = self.font.as_ref() {
            let m = font.metrics();
            let line = (-m.ascent + m.descent + m.leading) as f64;
            let text_h = (line * self.scale - 1e-4).ceil() / self.scale;
            // Yoga floors a Text node's position to the pixel grid (forceFloor for NodeType::Text).
            let text_top = ((item_top + (item_h - text_h) / 2.0) * self.scale + 1e-4).floor() / self.scale;
            // The baseline lands on the next device pixel row (as record_button's).
            let baseline = (((text_top - m.ascent as f64) * self.scale - 1e-4).ceil() / self.scale) as f32;
            for (i, label) in self.labels.iter().enumerate() {
                let item_left = i as f64 * w;
                let text_w =
                    (font.advance_width(label) as f64 * self.scale - 1e-4).ceil() / self.scale;
                let left = ((item_left + (w - text_w) / 2.0) * self.scale + 1e-4).floor() / self.scale;
                let x = left - offset;
                if x > w || x + text_w < 0.0 {
                    continue;
                }
                c.draw_text(label, x as f32, baseline, font, &Paint::fill(Color::WHITE));
            }
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
        moving || self.scroll.as_ref().is_some_and(|s| s.moving())
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_slow_short_drag_pages_in_its_direction() {
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
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 530.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut s = surface();
        let labels: Vec<Value> = (0..7)
            .map(|i| Value::from(format!("week of {} November", 3 + 7 * i)))
            .collect();
        s.bind(&labels, None).unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "miles-weeks-rest", [0x39, 0x2F, 0x40]);
        // A 100 pt drag left, still moving at ~400 pt/s at the lift: nearest is page 0, RN's
        // snapToInterval takes page 1 (the fling's direction).
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 300.0, ms));
        for k in 1..=10 {
            ms += 25.0;
            s.input(&pointer(PointerPhase::Move, 300.0 - 10.0 * k as f32, ms));
        }
        s.input(&pointer(PointerPhase::Up, 200.0, ms + 5.0));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(
            state.contains("\"offset\":420.00") && state.contains("\"active\":1"),
            "{state}"
        );
        assert_eq!(s.messages(), vec!["week:1".to_string()]);
    }
}
