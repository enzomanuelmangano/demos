//! Twitter Tab Bar (src/animations/twitter-tab-bar: index.tsx, constants/palette.ts,
//! constants/screens.ts, screens/home/index.tsx, components/bottom-tab-bar/index.tsx,
//! floating-button.tsx, active-tab-bar-provider.tsx): a dark feed of 50 empty rows under a
//! four-tab bar and a floating compose button. Scrolling down hides the bar and shrinks the
//! button away, scrolling up brings them back; the Message tab spins the button into a message
//! icon. RN Views: Display P3 (`Color::view_hex`); MaterialIcons are Text backing stores (an
//! atlas drawn once), moved and scaled bilinearly as Core Animation shows them.
//!
//! | value | driver | config | trigger |
//! |---|---|---|---|
//! | the feed | FlatList (UIScrollView: `ui_scroll`, vertical) | 50 rows × 100, a 1 pt bottom border #595959, paddingBottom BOTTOM_BAR_HEIGHT | a drag |
//! | isActive | onScroll (scrollEventThrottle 16) | max(prev, 0) − max(y, 0) ≥ 0, prev = y | each scroll event; a tab press sets it true |
//! | bar translateY | mapper withSpring | { dampingRatio 1, duration 500 } (stiffness solved per start), 0 or BAR + safeBottom | isActive set |
//! | button scale (A) | mapper withSpring | Gentle, overshootClamping, isActive ? 1 : 0 | isActive set |
//! | floatingProgress | `.set(withTiming(Message ? 1 : 0, 500))` | inOut(quad) | every tab press |
//! | button rotate, scale (S) | mapper of floatingProgress | [0, 1] → [0, 2π], [0, .5, 1] → [1, 1.2, 1] | progress set |
//! | edit / message opacity | mapper | progress ≤ 0.5 ? 1 : 0 (and its inverse) | progress set |
//! | highlight scale (H) | mapper withSpring | Gentle, highlighted ? 0.8 : 1 | Tap onBegin / onFinalize (maxDuration 10 s) |
//! | tab opacity | mapper withTiming | 300 ms inOut(quad), focused ? 1 : 0.3 | focusedIndex set |
//! | tab press | pressto PressableScale | 0.96, 250 ms | touch down / up; onPress lifted inside |
//! | haptics | the app's PressablesConfig onPress | selection | a tab press |
//!
//! The button's three animated styles (A, S, H) each write the whole `transform` of one view, so
//! what shows is the last writer of the frame, not their product: Reanimated runs the style
//! animations' frame callbacks (A, H) in the order they started, then the mappers in a microtask
//! (S, written every frame floatingProgress is set, even to the same value: a tab press runs its
//! 500 ms timing whatever the target); a style animation that starts from rest writes at once.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use pressto::{PressEvent, Pressable};
use reanimated::{duration_config, interpolate, Easing, Extrapolation, Spring, Timing, GENTLE};
use skia::{Canvas, Color, Font, Images, Matrix, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{self, Snap, UiScroll};

/// BOTTOM_BAR_HEIGHT: IS_SMALL_DEVICE (window height < 700) ? 80 : 95.
const BAR: f32 = 95.0;
const BAR_SMALL: f32 = 80.0;
/// MaterialIcons size.
const ICON: f32 = 28.0;
/// MaterialIcons home, search, notifications, message (ScreenNamesArray's order), then edit.
const GLYPHS: [&str; 5] = ["\u{E88A}", "\u{E8B6}", "\u{E7F4}", "\u{E0C9}", "\u{E3C9}"];
const MESSAGE: usize = 3;
const EDIT: usize = 4;
/// The feed: data length, row height, border width.
const ROWS: usize = 50;
const ROW: f32 = 100.0;
const BORDER: f32 = 1.0;
/// DarkPalette (background #17202A: see `draw`): card (Color('#17202A').lighten(0.15)), border
/// (Color('#FFFFFF').darken(0.65)), primary.
const CARD: u32 = 0x1A2530;
const BORDER_COLOR: u32 = 0x595959;
const PRIMARY: u32 = 0x4A9AE9;
/// The button: right 16, 64 × 64, radius 32.
const FAB: f32 = 64.0;
const FAB_RIGHT: f32 = 16.0;
/// The bar's spring: { dampingRatio: 1, duration: 500 }.
const BAR_MS: f64 = 500.0;
/// floatingProgress's timing.
const SPIN_MS: f64 = 500.0;
/// The tab opacity: withTiming's default 300 ms; an unfocused tab's opacity.
const TAB_MS: f64 = 300.0;
const DIM: f64 = 0.3;
/// The highlight's scale; Gesture.Tap's maxDuration.
const HIGHLIGHT: f64 = 0.8;
const TAP_MAX_MS: f64 = 10_000.0;
/// scrollEventThrottle.
const THROTTLE_MS: f64 = 16.0;
/// Transparent margin around each glyph layer in the atlas, device pixels.
const GUTTER: f32 = 2.0;

static MATERIAL_ICONS: &[u8] = include_bytes!("../fonts/materialicons-twitter-subset.ttf");

/// The demo's surface: `twitter_tab_bar(safeBottom)`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(TwitterTabBar::new())
}

/// Yoga's rounding of a layout edge to the pixel grid: to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// A Text node's position in its parent: Yoga floors it to the pixel grid (textRounding).
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// A Text's measured side, ceiled to the pixel grid.
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

/// A straight layer edge under a fractional translate: CALayer's edge antialiasing is off, so a
/// pixel is in when its centre is.
fn aliased(v: f32, scale: f32) -> f32 {
    (v * scale - 0.5).ceil() / scale
}

#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    w: f32,
    h: f32,
    scale: f32,
    bar: f32,
    bar_top: f32,
    /// The cells' content height (the bar less its paddingBottom).
    content: f32,
    cells: [f32; 5],
    /// The icon Text's box side.
    icon: f32,
    /// The button's frame's top-left.
    fab: (f32, f32),
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32, safe_bottom: f32, icon: f32) -> Layout {
        let bar = if h < 700.0 { BAR_SMALL } else { BAR };
        let bar_top = grid(h - bar, scale);
        let cells = std::array::from_fn(|i| grid(w * i as f32 / 4.0, scale));
        let fab = (grid(w - FAB_RIGHT - FAB, scale), grid(h - (bar + safe_bottom / 2.0) - FAB, scale));
        Layout { w, h, scale, bar, bar_top, content: bar - safe_bottom / 2.0, cells, icon, fab }
    }

    fn fab_centre(&self) -> (f32, f32) {
        (self.fab.0 + FAB / 2.0, self.fab.1 + FAB / 2.0)
    }
}

/// Who wrote the button's transform last: the isActive scale (A) or the highlight (H).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Writer {
    Active,
    Highlight,
}

struct Gpu {
    scale: f32,
    generation: u32,
    atlas: Images,
}

struct TwitterTabBar {
    safe_bottom: f32,
    layout: Layout,
    tab: usize,
    /// The FlatList's UIScrollView (fed y as x), the finger it follows, and onScroll's state:
    /// prevContentOffsetY, the offset last reported, when.
    list: UiScroll,
    list_finger: Option<u32>,
    prev_y: f64,
    reported: f64,
    reported_at: f64,
    active: bool,
    /// The bar's translateY.
    bar_y: Spring,
    /// The button's scale styles: isActive's (A) and the highlight's (H).
    fab_scale: Spring,
    highlight: Spring,
    /// The style animations running, in the order their frame callbacks run.
    writers: Vec<Writer>,
    /// The button's transform as last written: rotate (rad) and scale.
    transform: (f64, f64),
    progress: Timing,
    /// The finger on the button (Gesture.Tap) and when it came down.
    tapping: Option<(u32, f64)>,
    focus: [Timing; 4],
    press: [Pressable; 4],
    icons: Option<Font>,
    posted: Vec<String>,
    gpu: Option<Gpu>,
    layer_canvas: Canvas,
    layer_renderer: Renderer,
    canvas: Canvas,
    renderer: Renderer,
}

impl TwitterTabBar {
    fn new() -> TwitterTabBar {
        TwitterTabBar {
            safe_bottom: 0.0,
            layout: Layout::default(),
            tab: 0,
            list: UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, Snap::Free),
            list_finger: None,
            prev_y: 0.0,
            reported: 0.0,
            reported_at: f64::NEG_INFINITY,
            active: true,
            bar_y: Spring::at(0.0),
            fab_scale: Spring::at(1.0),
            highlight: Spring::at(1.0),
            writers: Vec::new(),
            transform: (0.0, 1.0),
            progress: Timing::at(0.0),
            tapping: None,
            focus: std::array::from_fn(|i| Timing::at(if i == 0 { 1.0 } else { DIM })),
            press: std::array::from_fn(|_| Pressable::new()),
            icons: Font::new(MATERIAL_ICONS, ICON).map(Font::with_ui_layout),
            posted: Vec::new(),
            gpu: None,
            layer_canvas: Canvas::default(),
            layer_renderer: Renderer::default(),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    fn icon_side(&self, scale: f32) -> f32 {
        self.icons.as_ref().map_or(ICON, |f| text_side(f.advance_width(GLYPHS[0]).max(gfx::line_height(f)), scale))
    }

    /// The FlatList's extent: content 50 × 100 + paddingBottom BOTTOM_BAR_HEIGHT in the window.
    fn sync_list(&mut self) {
        let l = self.layout;
        self.list.max = (ROWS as f64 * ROW as f64 + l.bar as f64 - l.h as f64).max(0.0);
        self.list.port = l.h as f64;
    }

    /// A style animation's spring retargeted from its mapper: a running one goes on (the same
    /// target continues, another inherits its velocity); one at rest starts and writes at once.
    fn style_spring(&mut self, who: Writer, to: f64) {
        let s = match who {
            Writer::Active => &mut self.fab_scale,
            Writer::Highlight => &mut self.highlight,
        };
        let was = s.running;
        s.retarget(to, GENTLE);
        if !was {
            self.transform = (0.0, s.value);
            self.writers.retain(|w| *w != who);
            if s.running {
                self.writers.push(who);
            }
        }
    }

    /// `isActive.set(v)`: the bar's and the button's mappers run.
    fn set_active(&mut self, v: bool) {
        self.active = v;
        let to = if v { 0.0 } else { (self.layout.bar + self.safe_bottom) as f64 };
        let b = &mut self.bar_y;
        // isTriggeredTwice: the same target continues the running spring.
        if !(b.running && b.target() == to) && !(!b.running && b.value == to) {
            let x = b.value;
            let vel = if !b.running || (to > x && b.velocity < 0.0) || (to < x && b.velocity > 0.0) { 0.0 } else { b.velocity };
            b.retarget(to, duration_config(x - to, vel, BAR_MS, 1.0, 4.0));
        }
        self.style_spring(Writer::Active, if v { 1.0 } else { 0.0 });
    }

    /// A scroll event (scrollViewDidScroll, throttled to 16 ms).
    fn scrolled(&mut self, at_ms: f64) {
        let y = self.list.offset;
        if y == self.reported || at_ms - self.reported_at <= THROTTLE_MS {
            return;
        }
        self.reported = y;
        self.reported_at = at_ms;
        let up = self.prev_y.max(0.0) - y.max(0.0) >= 0.0;
        self.set_active(up);
        self.prev_y = y;
    }

    fn set_highlight(&mut self, on: bool) {
        self.style_spring(Writer::Highlight, if on { HIGHLIGHT } else { 1.0 });
    }

    /// onTapIcon then focusedIndex.set: isActive true, floatingProgress timed to Message's
    /// side, the screen swapped.
    fn select(&mut self, i: usize) {
        self.set_active(true);
        let to = if i == MESSAGE { 1.0 } else { 0.0 };
        // timing.ts onStart: a running timing to the same target keeps its start.
        if !(self.progress.running && self.progress.target() == to) {
            self.progress.to(to, SPIN_MS, Easing::timing_default());
        }
        if i != self.tab {
            self.focus[self.tab].to(DIM, TAB_MS, Easing::timing_default());
            self.focus[i].to(1.0, TAB_MS, Easing::timing_default());
            if self.tab == 0 {
                // HomeScreen unmounts: its FlatList and prevContentOffsetY go with it.
                self.list = UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, Snap::Free);
                self.list_finger = None;
                self.prev_y = 0.0;
                self.reported = 0.0;
                self.reported_at = f64::NEG_INFINITY;
                self.sync_list();
            }
            self.tab = i;
        }
    }

    /// The button's transform about its centre, as a matrix from its frame to the screen.
    fn fab_matrix(&self) -> Matrix {
        let (cx, cy) = self.layout.fab_centre();
        let (r, s) = self.transform;
        Matrix::translate(-cx, -cy)
            .then(Matrix::scale(s as f32, s as f32))
            .then(Matrix::rotate(r as f32))
            .then(Matrix::translate(cx, cy))
    }

    fn on_fab(&self, x: f32, y: f32) -> bool {
        if self.transform.1.abs() < 1e-6 {
            return false;
        }
        let (fx, fy) = self.layout.fab;
        let p = self.fab_matrix().invert().apply(skia::point(x, y));
        (fx..=fx + FAB).contains(&p.x) && (fy..=fy + FAB).contains(&p.y)
    }

    /// The bar's top on screen, with its translateY.
    fn bar_top(&self) -> f32 {
        self.layout.bar_top + self.bar_y.value as f32
    }

    /// The cell whose PressableScale is under (x, y), through its press scale.
    fn cell_at(&self, x: f32, y: f32) -> Option<usize> {
        let l = &self.layout;
        let top = self.bar_top();
        (0..4).find(|&i| {
            let (x0, x1) = (l.cells[i], l.cells[i + 1]);
            let s = self.press[i].scale() as f32;
            let (cx, cy) = ((x0 + x1) / 2.0, top + l.content / 2.0);
            let (hw, hh) = ((x1 - x0) / 2.0 * s, l.content / 2.0 * s);
            (cx - hw..=cx + hw).contains(&x) && (cy - hh..=cy + hh).contains(&y)
        })
    }

    fn on_bar(&self, y: f32) -> bool {
        y >= self.bar_top()
    }

    fn prepare(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let s = frame.scale;
        if self.gpu.as_ref().is_some_and(|g| g.scale == s && g.generation == frame.shader_generation) {
            return;
        }
        let Some(font) = self.icons.as_ref() else { return };
        let side = self.layout.icon;
        let px = (side * s).round();
        let cell = px + 2.0 * GUTTER;
        let (aw, ah) = ((cell * GLYPHS.len() as f32) as u32, cell as u32);
        let atlas = Images::target(device, aw, ah);
        let view = atlas.render_view();
        let l = &mut self.layer_canvas;
        l.begin(s);
        for (i, glyph) in GLYPHS.iter().enumerate() {
            let (ox, oy) = ((GUTTER + cell * i as f32) / s, GUTTER / s);
            l.save();
            l.clip_rect(ox, oy, side, side);
            l.draw_text(glyph, ox, gfx::baseline(font, oy), font, &Paint::fill(Color::WHITE));
            l.restore();
        }
        self.layer_renderer.draw(device, queue, encoder, &self.layer_canvas, &view, wgpu::TextureFormat::Rgba8Unorm, aw, ah, wgpu::Color::TRANSPARENT);
        self.renderer.set_images(&atlas);
        self.gpu = Some(Gpu { scale: s, generation: frame.shader_generation, atlas });
    }

    fn draw(&mut self) {
        let l = self.layout;
        let s = l.scale;
        let c = &mut self.canvas;
        c.begin(s);
        // #17202A in P3 is sRGB (20.51, 32.32, 42.96): Core Animation shows 20, view_hex rounds to
        // 21 (measured on the simulator, every background pixel).
        c.draw_rect(0.0, 0.0, l.w, l.h, &Paint::fill(Color::rgb8(20, 32, 43)));
        if self.tab == 0 {
            // UIScrollView shows its content on the device pixel.
            let off = ((self.list.offset as f32) * s).round() / s;
            let line = Paint::fill(Color::view_hex(BORDER_COLOR));
            let first = (off / ROW).floor().max(0.0) as usize;
            for r in first..ROWS {
                let y = r as f32 * ROW + ROW - BORDER - off;
                if y > l.h {
                    break;
                }
                c.draw_rect(0.0, y, l.w, BORDER, &line);
            }
        }
        let Some(gpu) = self.gpu.as_ref() else { return };
        let atlas = &gpu.atlas;
        let icon = l.icon;
        let cell_px = (icon * s).round() + 2.0 * GUTTER;
        let composite = |c: &mut Canvas, glyph: usize, x: f32, y: f32, opacity: f32| {
            let g = GUTTER / s;
            let to = Matrix::translate(-x, -y).then(Matrix::scale(s, s)).then(Matrix::translate(GUTTER + cell_px * glyph as f32, GUTTER));
            c.draw_rect(x - g, y - g, icon + 2.0 * g, icon + 2.0 * g, &Paint::image(atlas.image(0), to).with_opacity(opacity));
        };
        // BottomFloatingButton.
        let (r, sc) = self.transform;
        if sc.abs() > 1e-6 {
            let (fx, fy) = l.fab;
            let (cx, cy) = l.fab_centre();
            c.save();
            c.translate(cx, cy);
            c.rotate(r as f32);
            c.scale(sc as f32, sc as f32);
            c.translate(-cx, -cy);
            c.draw_circle(cx, cy, FAB / 2.0, &Paint::fill(Color::view_hex(PRIMARY)));
            let inset = text_grid((FAB - icon) / 2.0, s);
            let glyph = if self.progress.value <= 0.5 { EDIT } else { MESSAGE };
            composite(c, glyph, fx + inset, fy + inset, 1.0);
            c.restore();
        }
        // The bar, moved by its translateY.
        let ty = self.bar_y.value as f32;
        if l.bar_top + ty < l.h {
            let top = aliased(l.bar_top + ty, s);
            c.draw_rect(0.0, top, l.w, l.h - top, &Paint::fill(Color::view_hex(CARD)));
            for i in 0..4 {
                let (x0, x1) = (l.cells[i], l.cells[i + 1]);
                let x = x0 + text_grid((x1 - x0 - icon) / 2.0, s);
                let y = l.bar_top + text_grid((l.content - icon) / 2.0, s);
                let k = self.press[i].scale() as f32;
                let (cx, cy) = ((x0 + x1) / 2.0, l.bar_top + l.content / 2.0);
                c.save();
                c.translate(0.0, ty);
                c.translate(cx, cy);
                c.scale(k, k);
                c.translate(-cx, -cy);
                composite(c, i, x, y, self.focus[i].value as f32);
                c.restore();
            }
        }
    }
}

impl Surface for TwitterTabBar {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_bottom = inputs.first().map(|v| exact_gpu::json::number(v, "safeBottom")).transpose()?.unwrap_or(0.0) as f32;
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let held = self.list.dragging() || self.tapping.is_some() || self.press.iter().any(Pressable::is_pressed);
        Some(format!(
            "{{\"tab\":{},\"offset\":{:.2},\"active\":{},\"bar\":{:.2},\"fab\":[{:.4},{:.4}],\"progress\":{:.4},\"held\":{held}}}",
            self.tab, self.list.offset, self.active, self.bar_y.value, self.transform.0, self.transform.1, self.progress.value
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.layout.w <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        if phase == Phase::Down {
            if self.tapping.is_none() && self.on_fab(x, y) {
                // Gesture.Tap onBegin.
                self.tapping = Some((id, at_ms));
                self.set_highlight(true);
                return;
            }
            if self.on_bar(y) {
                if let Some(i) = self.cell_at(x, y) {
                    if !self.press.iter().any(Pressable::is_pressed) {
                        self.press[i].pointer_down(id, true);
                    }
                }
                return;
            }
            if self.tab == 0 && self.list_finger.is_none() {
                self.list_finger = Some(id);
            }
        }
        if self.tapping.is_some_and(|(t, _)| t == id) {
            if matches!(phase, Phase::Up | Phase::Cancel) {
                // onFinalize (onTouchesUp's onSelect only logs).
                self.tapping = None;
                self.set_highlight(false);
            }
            return;
        }
        if self.press.iter().any(|p| p.finger() == Some(id)) {
            let at = self.cell_at(x, y);
            for i in 0..4 {
                if let Some(PressEvent::Press(press)) = self.press[i].pointer(id, phase, at == Some(i)) {
                    self.posted.extend(press.global_message().map(String::from));
                    self.select(i);
                }
            }
            return;
        }
        if self.list_finger == Some(id) {
            self.list.input(id, phase, y, x, at_ms, true);
            if matches!(phase, Phase::Up | Phase::Cancel) {
                self.list_finger = None;
            }
            self.scrolled(at_ms);
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
        let icon = self.icon_side(frame.scale);
        self.layout = Layout::new(frame.width, frame.height, frame.scale, self.safe_bottom, icon);
        self.sync_list();
        let mut moving = false;
        if self.tab == 0 {
            moving |= self.list.step(now);
            self.scrolled(now);
        }
        if let Some((_, down)) = self.tapping {
            if now - down > TAP_MAX_MS {
                // The Tap fails at maxDuration: onFinalize.
                self.tapping = None;
                self.set_highlight(false);
            }
        }
        // The style animations' frame callbacks, in the order they started; each writes the
        // transform, its last frame too.
        let writers = std::mem::take(&mut self.writers);
        for w in writers {
            let s = match w {
                Writer::Active => &mut self.fab_scale,
                Writer::Highlight => &mut self.highlight,
            };
            let running = s.step(now);
            self.transform = (0.0, s.value);
            if running {
                self.writers.push(w);
            }
        }
        moving |= !self.writers.is_empty();
        moving |= self.bar_y.step(now);
        // floatingProgress, then its mapper (S) in the microtask after the callbacks.
        if self.progress.running {
            moving |= self.progress.step(now);
            let p = self.progress.value;
            let rotate = interpolate(p, &[0.0, 1.0], &[0.0, 2.0 * std::f64::consts::PI], Extrapolation::Extend);
            let scale = interpolate(p, &[0.0, 0.5, 1.0], &[1.0, 1.2, 1.0], Extrapolation::Extend);
            self.transform = (rotate, scale);
        }
        for t in self.focus.iter_mut() {
            moving |= t.step(now);
        }
        for p in self.press.iter_mut() {
            moving |= p.step(now);
        }
        self.prepare(frame, device, queue, encoder);
        self.draw();
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.tapping.is_some() || self.list_finger.is_some() || self.press.iter().any(Pressable::is_pressed)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: W, height: H, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    fn pointer(phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
    }

    fn surface_with_inputs() -> Box<dyn Surface> {
        let mut s = surface();
        s.bind(&[Value::Number(34.0)], None).unwrap();
        s
    }

    fn run(gpu: &exact_gpu::Gpu, s: &mut Box<dyn Surface>, from: f64, to: f64) -> f64 {
        let mut ms = from;
        while ms < to {
            ms += 16.0;
            fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms
    }

    fn state(s: &mut Box<dyn Surface>) -> String {
        s.agent("{}").unwrap()
    }

    #[test]
    fn scrolling_down_hides_the_bar_and_up_brings_it_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface_with_inputs();
        let mut ms = run(&gpu, &mut s, 0.0, 100.0);
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&rest, "twitter-tab-bar-rest", [0x17, 0x20, 0x2A]);
        // A slow 300 pt drag up (the content scrolls down).
        s.input(&pointer(PointerPhase::Down, 200.0, 600.0, ms));
        for k in 1..=30 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 200.0, 600.0 - 10.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms += 300.0;
        s.input(&pointer(PointerPhase::Up, 200.0, 300.0, ms));
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(st.contains("\"active\":false"), "{st}");
        assert!(st.contains("\"bar\":129.00"), "{st}");
        assert!(st.contains("\"fab\":[0.0000,0.0000]"), "{st}");
        // A drag down shows them again.
        s.input(&pointer(PointerPhase::Down, 200.0, 300.0, ms));
        for k in 1..=10 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 200.0, 300.0 + 10.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms += 300.0;
        s.input(&pointer(PointerPhase::Up, 200.0, 400.0, ms));
        run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(st.contains("\"active\":true"), "{st}");
        assert!(st.contains("\"bar\":0.00"), "{st}");
        assert!(st.contains("\"fab\":[0.0000,1.0000]"), "{st}");
    }

    #[test]
    fn the_message_tab_spins_the_button_with_a_haptic() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface_with_inputs();
        let mut ms = run(&gpu, &mut s, 0.0, 100.0);
        // The Message cell: x 315…420, the bar from 817.
        s.input(&pointer(PointerPhase::Down, 367.0, 856.0, ms));
        ms += 80.0;
        s.input(&pointer(PointerPhase::Up, 367.0, 856.0, ms));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        ms = run(&gpu, &mut s, ms, ms + 250.0);
        let st = state(&mut s);
        assert!(st.contains("\"tab\":3"), "{st}");
        assert!(!st.contains("\"progress\":1.0000"), "{st}");
        run(&gpu, &mut s, ms, ms + 600.0);
        let st = state(&mut s);
        assert!(st.contains("\"progress\":1.0000"), "{st}");
    }
}
