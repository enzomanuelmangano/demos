//! Floating Bottom Bar (src/animations/floating-bottom-bar: index.tsx,
//! components/bottom-tab-bar/{index.tsx, shader-light, animated-opacity-view}): a black floating
//! tab bar of five icons; a light hangs over the selected one and springs to the tab pressed.
//! The canvas is the bar (tabBarWidth × 65); its black continuous body is Contract
//! (demos/floating-bottom-bar), drawn under this.
//!
//! Layout (RN's Yoga, on the device pixel grid; `px` below):
//! - The bar: absolute, centred, tabBarWidth = screen × 0.95, paddingHorizontal 5 % of the screen.
//!   Yoga rounds each node's position relative to its parent (half away from zero), a Text's
//!   floored, and a Text's measured sides ceiled after an epsilon (24 → 24.333).
//! - Five cells (`iconContainer`: flex 1, centred), each a PressableScale holding a vector-icon
//!   Text, size 24, white: Octicons home, Feather bookmark, Ionicons add-circle-outline,
//!   Octicons person, Ionicons settings-sharp. The Text is ceil(24) wide and ceil(hhea ascent +
//!   descent) tall, its glyph at its left, the baseline an ascent below its top (TextKit).
//! - The ShaderLight (zIndex 10, over the icons): absolute at left 0.05 × tabBarWidth, 65 tall,
//!   translateX selectedAnimatedIndex × singleTabWidth, singleTabWidth = tabBarWidth × 0.9 / 5
//!   (RN's own figure, a little wider than a cell). A trapezoid (15, 0)–(w − 15, 0) down to
//!   (w, h)–(0, h), a vertical LinearGradient white → transparent at opacity 0.5; over it a white
//!   RoundedRect at x 5, w − 10 wide, 7 tall, r 20.
//!
//! Motion audit:
//!
//! | value | driver | to | trigger |
//! |---|---|---|---|
//! | selectedAnimatedIndex (the light's translateX ÷ singleTabWidth) | `useDerivedValue(() => withSpring(currentIndex))`, Gentle (900, 120, 4): from where it is, at its velocity unless that points away, energy measured from x0 alone (config.velocity 0) | the tab | navigate (onPress) |
//! | tab i opacity | `withTiming(activeIndex === i ? 1 : 0.5)` (300 ms, inOut(quad)), re-run on every frame of the spring; a timing to the same target keeps its start (timing.ts onStart) | 1 only when the spring rests exactly on i | activeIndex's frames |
//! | tab i scale | pressto PressableScale: 1 → 0.96, 250 ms ease on press in / out | | BaseButton |
//!
//! So the tab left fades to 0.5 at once (300 ms, from the spring's second frame, when activeIndex
//! leaves its integer), and the tab chosen stays at 0.5 until the spring rests (833 ms at 60 Hz)
//! and then fades to 1. Haptics: pressto's global onPress (selection) on every press.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::{spring::GENTLE, Easing, Spring, Timing};
use skia::{point, stops, Canvas, Color, Font, Paint, Path, Renderer, Shader};

use crate::gfx;

/// shader-light: internalCanvasHorizontalPadding.
const PADDING: f32 = 5.0;
/// The bar's height.
const HEIGHT: f64 = 65.0;
/// The icons' font size.
const ICON_SIZE: f32 = 24.0;
const TABS: usize = 5;

static OCTICONS: &[u8] = include_bytes!("../fonts/octicons-floating-bar-subset.ttf");
static FEATHER: &[u8] = include_bytes!("../fonts/feather-bookmark-subset.ttf");
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-floating-bar-subset.ttf");

/// getIconByScreenName: (font, glyph) per tab.
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
        layout: None,
        path: None,
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

/// Yoga's `roundValueToPixelGrid`: to the device pixel, half away from zero, `floor` for a
/// Text's position; values within 1e-4 of a pixel snap to it.
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

/// A Text's measured side: ceiled to the pixel after an epsilon (an exact 24 measures 24.333).
fn text_side(v: f64, scale: f64) -> f64 {
    (v * scale + 1e-3).ceil() / scale
}

/// RN's frames in the canvas's points (its origin at the bar's unrounded left, as laid out here).
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
    /// currentIndex (the navigator's state.index).
    index: usize,
    /// selectedAnimatedIndex.
    light: Spring,
    /// Each AnimatedOpacityView's opacity.
    opacity: [Timing; TABS],
    /// Each PressableScale.
    press: [Pressable; TABS],
    layout: Option<(f32, f32, Layout)>,
    /// The trapezoid, for the size it was built at.
    path: Option<((f32, f32), Path)>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

impl FloatingBottomBar {
    /// The cell under (x, y) at the pressable's current scale (RNGH's inside test is through the
    /// view's transform).
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

    /// navigation.navigate(screen): the derived value's withSpring retargets.
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
        std::mem::take(&mut self.posted)
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
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        let phase = gfx::phase(phase);
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

        // The derived value's frame, then the style's mapper for every tab (activeIndex === i).
        let mut moving = self.light.step(now);
        for (i, t) in self.opacity.iter_mut().enumerate() {
            let to = if self.light.value == i as f64 {
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
        // The icons, each in its PressableScale (scale about the cell's centre, opacity).
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
        // The ShaderLight, over them.
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
        // tabBarWidth on a 420 pt screen: 399.
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
        // The bar at 10.5 rounds to 10.667; cells at 21 + 71.4 i rounded; texts floored at 23.333.
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
        // Tab 2's centre: 10.667 + 163.667 + 35.7 − 10.5.
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
        // ~300 ms in: tab 0 well on its way down, tab 2 still at 0.5.
        let mid = state(316.0);
        assert!(mid.contains("\"opacity\":[0.5"), "{mid}");
        assert!(
            mid.contains(",0.500,0.500,0.500]") || mid.contains("0.500,0.500,0.500,0.500]"),
            "{mid}"
        );
        // Before the rest (frame 50 of the spring) tab 2 has not moved; after, it brightens.
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
        // The light's bar: x from 10.667 + 20 + 5 − 10.5 = 25.17 pt, 7 tall.
        assert_eq!(img.at(3 * 40, 9)[3], 255);
        assert_eq!(img.at(3 * 24, 9)[3], 0);
        // An icon's ink in each cell's middle third, none between cells.
        let ink = |x0: u32, x1: u32| {
            (x0..x1)
                .flat_map(|x| (60..135).map(move |y| (x, y)))
                .any(|(x, y)| img.at(x, y)[3] > 0)
        };
        assert!(ink(3 * 120, 3 * 140), "bookmark");
        assert!(!ink(3 * 150, 3 * 160), "between bookmark and add");
    }
}
