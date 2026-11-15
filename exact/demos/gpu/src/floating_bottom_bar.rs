//! A floating black tab bar of five icons, with a light that hangs over the selected one and
//! springs to the tab pressed.
//!
//! - The light springs (Gentle) from where it is, so a fast change never snaps. The tab left
//!   fades to half opacity at once; the chosen tab brightens when the spring comes to rest.
//! - Each press plays a selection haptic.
//! - A horizontal drag across the bar cancels the press and carries the light under the finger,
//!   stretched by the finger's speed (up to 1.3×). The tab under it lights up, with a selection
//!   haptic as it crosses each tab. On release the light springs to the nearest tab and selects it.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use pressto::{PressEvent, Pressable};
use reanimated::{spring::GENTLE, Easing, Spring, Timing};
use skia::{point, stops, Canvas, Color, Font, Paint, Path, Renderer, Shader};

use crate::gfx;

/// Inset of the light from the bar's sides, pt.
const PADDING: f32 = 5.0;
/// Bar height, pt.
const HEIGHT: f64 = 65.0;
/// Icon font size, pt.
const ICON_SIZE: f32 = 24.0;
const TABS: usize = 5;

static OCTICONS: &[u8] = include_bytes!("../fonts/octicons-floating-bar-subset.ttf");
static FEATHER: &[u8] = include_bytes!("../fonts/feather-bookmark-subset.ttf");
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-floating-bar-subset.ttf");

/// Font index and glyph of each tab's icon.
const ICONS: [(usize, &str); TABS] = [
    (0, "\u{f197}"),
    (1, "\u{f124}"),
    (2, "\u{f105}"),
    (0, "\u{f1d5}"),
    (2, "\u{f56d}"),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let font = |data| Font::new(data, ICON_SIZE).map(Font::with_ui_layout);
    Box::new(FloatingBottomBar {
        fonts: [font(OCTICONS), font(FEATHER), font(IONICONS)],
        index: 0,
        light: Spring::at(0.0),
        opacity: std::array::from_fn(|i| Timing::at(if i == 0 { 1.0 } else { 0.5 })),
        press: std::array::from_fn(|_| Pressable::new()),
        pan: PanGesture::new(),
        dragging: false,
        stretch: Spring::at(1.0),
        layout: None,
        path: None,
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

/// Rounds to the device pixel like Yoga: half away from zero, or floored for text positions.
/// Values within 1e-4 of a pixel snap to it.
fn grid(v: f64, scale: f64, floor: bool) -> f64 {
    let s = v * scale;
    let f = s - s.floor();
    let r = if f < 1e-4 {
        s.floor()
    } else if f > 1.0 - 1e-4 {
        s.ceil()
    } else if floor {
        s.floor()
    } else {
        s.round()
    };
    r / scale
}

/// Rounds a text width up to the pixel; a whole-pixel width still gets one pixel more.
fn text_side(v: f64, scale: f64) -> f64 {
    (v * scale + 1e-3).ceil() / scale
}

/// Frames in the canvas's points, relative to the bar's unrounded left.
#[derive(Clone, Copy, Debug)]
struct Layout {
    /// The bar's rounded left minus its unrounded one.
    shift: f64,
    /// Each cell's rounded left and width, from the bar's rounded left.
    cells: [(f64, f64); TABS],
    /// Each icon Text's left (cell-relative, floored) and top, and its box height.
    texts: [(f64, f64); TABS],
    /// The light's left (from the bar) and singleTabWidth.
    light_left: f64,
    tab: f64,
}

fn layout(bar: f64, scale: f64, line_heights: [f64; TABS]) -> Layout {
    let screen = bar / 0.95;
    let left = (screen - bar) / 2.0;
    let rounded_left = grid(left, scale, false);
    let pad = 0.05 * screen;
    let cell = (bar - 2.0 * pad) / TABS as f64;
    let cells = std::array::from_fn(|i| {
        let rel = pad + cell * i as f64;
        let (l, r) = (
            grid(left + rel, scale, false),
            grid(left + rel + cell, scale, false),
        );
        (grid(rel, scale, false), r - l)
    });
    let w = text_side(ICON_SIZE as f64, scale);
    let texts = std::array::from_fn(|i| {
        let h = text_side(line_heights[i], scale);
        (
            grid((cell - w) / 2.0, scale, true),
            grid((HEIGHT - h) / 2.0, scale, true),
        )
    });
    Layout {
        shift: rounded_left - left,
        cells,
        texts,
        light_left: grid(0.05 * bar, scale, false),
        tab: (bar - 0.1 * bar) / TABS as f64,
    }
}

struct FloatingBottomBar {
    fonts: [Option<Font>; 3],
    /// The selected tab.
    index: usize,
    /// The light's position, in tabs.
    light: Spring,
    /// Each tab's opacity.
    opacity: [Timing; TABS],
    /// Each tab's press state.
    press: [Pressable; TABS],
    /// The drag across the bar, while it holds the light.
    pan: PanGesture,
    dragging: bool,
    /// The light's horizontal stretch (1 at rest).
    stretch: Spring,
    layout: Option<(f32, f32, Layout)>,
    /// The trapezoid, for the size it was built at.
    path: Option<((f32, f32), Path)>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

impl FloatingBottomBar {
    /// Whether (x, y) is inside tab i, at its current pressed scale.
    fn inside(&self, i: usize, x: f32, y: f32) -> bool {
        let Some((_, _, l)) = self.layout else {
            return false;
        };
        let (cl, cw) = l.cells[i];
        let s = self.press[i].scale();
        let cx = l.shift + cl + cw / 2.0;
        let (x, y) = (x as f64, y as f64);
        (x - cx).abs() <= cw * s / 2.0 && (y - HEIGHT / 2.0).abs() <= HEIGHT * s / 2.0
    }

    /// The light's index under a finger at canvas x, clamped to the tabs.
    fn index_at(&self, x: f32) -> f64 {
        let Some((_, _, l)) = self.layout else {
            return self.light.value;
        };
        ((x as f64 - l.shift - l.light_left - l.tab / 2.0) / l.tab).clamp(0.0, (TABS - 1) as f64)
    }

    /// The drag moves the light under the finger, with a haptic per tab crossed.
    fn drag_to(&mut self, x: f32, vx: f32) {
        let before = self.light.value.round();
        self.light.set(self.index_at(x));
        if self.light.value.round() != before {
            self.posted.push(pressto::GLOBAL_ON_PRESS.into());
        }
        let k = 1.0 + (vx.abs() as f64 / 1500.0).min(1.0) * 0.3;
        self.stretch.retarget(k, GENTLE);
    }

    /// The lift: to the nearest tab on the spring, selected.
    fn drop_at(&mut self, vx: f32) {
        self.dragging = false;
        let tab = self.layout.map_or(1.0, |(_, _, l)| l.tab);
        let n = self.light.value.round();
        self.index = n as usize;
        self.light.to(n, vx as f64 / tab, GENTLE);
        self.stretch.retarget(1.0, GENTLE);
    }

    /// Selects tab i from outside; the light springs to it.
    fn navigate(&mut self, i: usize) {
        if i == self.index {
            return;
        }
        self.index = i;
        self.light.retarget(i as f64, GENTLE);
    }
}

impl Surface for FloatingBottomBar {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let opacity: Vec<String> = self
            .opacity
            .iter()
            .map(|t| format!("{:.3}", t.value))
            .collect();
        Some(format!(
            "{{\"index\":{},\"light\":{:.4},\"opacity\":[{}],\"held\":{}}}",
            self.index,
            self.light.value,
            opacity.join(","),
            self.press.iter().any(Pressable::is_pressed)
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, at_ms, ..
        } = *event
        else {
            return;
        };
        let phase = gfx::phase(phase);
        // Once the drag starts, the press is cancelled.
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Start(p) => {
                self.dragging = true;
                for press in &mut self.press {
                    press.pointer(id, gesture_handler::Phase::Cancel, false);
                }
                self.drag_to(p.x, p.velocity_x);
                return;
            }
            Event::Update(p) if self.dragging => {
                self.drag_to(p.x, p.velocity_x);
                return;
            }
            Event::End(p) if self.dragging => {
                self.drop_at(p.velocity_x);
                return;
            }
            Event::Fail if self.dragging => {
                self.drop_at(0.0);
                return;
            }
            _ if self.dragging => return,
            _ => {}
        }
        if phase == gesture_handler::Phase::Down {
            if let Some(i) = (0..TABS).find(|&i| self.inside(i, x, y)) {
                self.press[i].pointer_down(id, true);
            }
            return;
        }
        for i in 0..TABS {
            let inside = self.inside(i, x, y);
            if let Some(PressEvent::Press(press)) = self.press[i].pointer(id, phase, inside) {
                if let Some(message) = press.global_message() {
                    self.posted.push(message.into());
                }
                self.navigate(i);
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
        let (w, h) = (frame.width, frame.height);
        if self.layout.map(|(lw, ls, _)| (lw, ls)) != Some((w, frame.scale)) {
            let lh = std::array::from_fn(|i| {
                self.fonts[ICONS[i].0]
                    .as_ref()
                    .map_or(ICON_SIZE as f64, |f| gfx::line_height(f) as f64)
            });
            self.layout = Some((w, frame.scale, layout(w as f64, frame.scale as f64, lh)));
        }
        let (_, _, l) = self.layout.unwrap();
        let now = frame.now_ms;

        // Update the light, then each tab's opacity.
        let mut moving = self.light.step(now) | self.stretch.step(now) | self.dragging;
        let under = self.light.value.round();
        for (i, t) in self.opacity.iter_mut().enumerate() {
            let to = if self.light.value == i as f64 || (self.dragging && under == i as f64) {
                1.0
            } else {
                0.5
            };
            if t.target() != to {
                t.to(to, 300.0, Easing::timing_default());
            }
            moving |= t.step(now);
        }
        for p in &mut self.press {
            moving |= p.step(now);
        }

        let tab = l.tab as f32;
        if self.path.as_ref().map(|(size, _)| *size) != Some((tab, h)) {
            let mut b = skia::path_builder();
            b.begin(point(PADDING * 3.0, 0.0));
            b.line_to(point(tab - PADDING * 3.0, 0.0));
            b.line_to(point(tab, h));
            b.line_to(point(0.0, h));
            b.end(true);
            self.path = Some(((tab, h), b.build()));
        }

        let c = &mut self.canvas;
        c.begin(frame.scale);
        // Icons, each scaled about its cell's centre.
        for (i, &(font, glyph)) in ICONS.iter().enumerate() {
            let Some(font) = self.fonts[font].as_ref() else {
                continue;
            };
            let (cl, cw) = l.cells[i];
            let (tx, ty) = l.texts[i];
            let s = self.press[i].scale() as f32;
            let (cx, cy) = ((l.shift + cl + cw / 2.0) as f32, (HEIGHT / 2.0) as f32);
            c.save();
            c.translate(cx, cy);
            c.scale(s, s);
            c.translate(-cx, -cy);
            let x = (l.shift + cl + tx) as f32;
            let paint = Paint::fill(Color::WHITE).with_opacity(self.opacity[i].value as f32);
            c.draw_text(glyph, x, gfx::baseline(font, ty as f32), font, &paint);
            c.restore();
        }
        // The light, drawn over the icons.
        let lx = (l.shift + l.light_left + self.light.value * l.tab) as f32;
        let path = &self.path.as_ref().unwrap().1;
        let light = Paint::shader(Shader::Linear {
            start: point(0.0, 0.0),
            end: point(0.0, h),
            stops: stops(&[Color::WHITE, Color::TRANSPARENT]),
        })
        .with_opacity(0.5);
        c.save();
        c.translate(lx, 0.0);
        // Stretched about its centre by the finger's speed.
        let k = self.stretch.value as f32;
        c.translate(tab / 2.0, 0.0);
        c.scale(k, 1.0);
        c.translate(-tab / 2.0, 0.0);
        c.draw_path(path, &light);
        c.draw_rrect(
            PADDING,
            0.0,
            tab - PADDING * 2.0,
            7.0,
            20.0,
            &Paint::fill(Color::WHITE),
        );
        c.restore();
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

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 399.0,
            height: 65.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    #[test]
    fn rn_s_yoga_frames() {
        let l = layout(
            399.0,
            3.0,
            [24.28125, 24.65625, 24.609375, 24.28125, 24.609375],
        );
        assert!((l.shift - 1.0 / 6.0).abs() < 1e-9);
        let lefts: Vec<f64> = l.cells.iter().map(|c| (c.0 * 3.0).round()).collect();
        assert_eq!(lefts, vec![63.0, 277.0, 491.0, 706.0, 920.0]);
        assert!((l.texts[0].0 - 70.0 / 3.0).abs() < 1e-9);
        assert!((l.texts[0].1 - 61.0 / 3.0).abs() < 1e-9, "{}", l.texts[0].1);
        assert!((l.texts[1].1 - 20.0).abs() < 1e-9, "{}", l.texts[1].1);
        assert!((l.light_left - 20.0).abs() < 1e-9);
    }

    fn tap(s: &mut dyn Surface, x: f32, at_ms: f64) {
        for phase in [PointerPhase::Down, PointerPhase::Up] {
            s.input(&InputEvent::Pointer {
                id: 1,
                phase,
                x,
                y: 30.0,
                dx: 0.0,
                dy: 0.0,
                kind: PointerKind::Touch,
                buttons: 1,
                at_ms,
            });
        }
    }

    #[test]
    fn the_old_tab_fades_at_once_the_new_one_when_the_spring_rests() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        tap(s.as_mut(), 199.5, 10.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let at = |s: &mut Box<dyn Surface>, ms: f64| {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            s.agent("").unwrap()
        };
        let mut ms = 1000.0 / 60.0;
        let mut seen = Vec::new();
        while ms < 1400.0 {
            seen.push((ms, at(&mut s, ms)));
            ms += 1000.0 / 60.0;
        }
        let state = |ms: f64| {
            seen.iter()
                .find(|(t, _)| (*t - ms).abs() < 9.0)
                .unwrap()
                .1
                .clone()
        };
        // Mid-fade: tab 0 is fading out, tab 2 is still at 0.5.
        let mid = state(316.0);
        assert!(mid.contains("\"opacity\":[0.5"), "{mid}");
        assert!(
            mid.contains(",0.500,0.500,0.500]") || mid.contains("0.500,0.500,0.500,0.500]"),
            "{mid}"
        );
        // Tab 2 brightens only after the spring rests.
        assert!(
            state(800.0).contains("0.500,0.500,0.500,0.500,0.500"),
            "{}",
            state(800.0)
        );
        let end = state(1390.0);
        assert!(
            end.contains("\"opacity\":[0.500,0.500,1.000,0.500,0.500]"),
            "{end}"
        );
        assert!(end.contains("\"light\":2.0000"), "{end}");
    }

    #[test]
    fn the_light_and_icons_draw_where_rn_puts_them() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("floating-bottom-bar");
        assert!(!animating);
        assert_eq!(img.at(3 * 40, 9)[3], 255);
        assert_eq!(img.at(3 * 24, 9)[3], 0);
        // Icon ink sits in each cell's middle third.
        let ink = |x0: u32, x1: u32| {
            (x0..x1)
                .flat_map(|x| (60..135).map(move |y| (x, y)))
                .any(|(x, y)| img.at(x, y)[3] > 0)
        };
        assert!(ink(3 * 120, 3 * 140), "bookmark");
        assert!(!ink(3 * 150, 3 * 160), "between bookmark and add");
    }

    #[test]
    fn a_drag_across_the_bar_carries_the_light_and_selects_where_it_lifts() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, at_ms: f64| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y: 30.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // Drag across all tabs, 4 pt a frame.
        let mut x = 50.0;
        let mut ms = 0.0;
        finger(&mut s, PointerPhase::Down, x, ms);
        while x < 285.0 {
            x += 4.0;
            ms += 16.7;
            finger(&mut s, PointerPhase::Move, x, ms);
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        // Tabs 1 to 3 crossed: one selection haptic each, and no press.
        assert_eq!(s.messages(), vec!["haptic:selection".to_string(); 3]);
        let a = s.agent("").unwrap();
        assert!(a.contains("\"index\":0") && !a.contains("\"held\":true"), "{a}");
        finger(&mut s, PointerPhase::Up, x, ms);
        let mut moving = true;
        while moving && ms < 3000.0 {
            ms += 16.7;
            moving = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        let a = s.agent("").unwrap();
        assert!(a.contains("\"index\":3") && a.contains("\"light\":3.0000"), "{a}");
        assert!(s.messages().is_empty());
    }
}
