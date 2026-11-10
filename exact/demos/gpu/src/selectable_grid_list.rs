//! Selectable Grid List (src/animations/selectable-grid-list: index.tsx, constants.ts,
//! components/SelectableGridList, SelectableListItem.tsx): fifty photos in four columns; a tap
//! toggles one, a drag selects the range from the cell it started on to the cell under the
//! finger, scrolling near the top; a floating button counts the selection and clears it. The
//! whole window (#000), the list from safeTop + 56 down.
//!
//! - The list: itemSize = width / 4 square cells (padding 4), rows from the list's top, scrolled
//!   by `offset`; paddingBottom safeBottom + 10. A cell's index is
//!   floor(x / itemSize) + 4 × floor((y + offset) / itemSize), clamped to 0…49.
//! - The pan (Gesture.Exclusive(pan, tap)): onBegin the start index; onUpdate the pending range
//!   start…index (rebuilt when the cell changes, the current selection losing what it covers),
//!   and scrollTo(offset ∓ itemSize × 0.15) when y + offset ≤ offset + itemSize or ≥ that + the
//!   window's height − 2 × itemSize; onEnd a one-cell range toggles it, a longer one joins the
//!   selection; onFinalize clears the pending range. The tap (maxDelta 5) toggles its cell.
//! - A cell: the photo (contentFit cover) in a view of radius 10 + border and a border
//!   (withTiming(active ? 4 : 0), #55D5FF while active, else #000) that clips it; a 24 pt badge
//!   (#55D5FF, radius 12, AntDesign check 16 black) at the cell's bottom-left, opacity
//!   withTiming(active), scale withSpring(active) (Reanimated's default).
//! - The button (bottom 20, right 20, 96 × 64, radius 20, #55D5FF, boxShadow 0 0 20px
//!   rgba(0,0,0,0.5) → σ 10): MaterialIcons clear 20 and the count (20, black, 32 wide) spaced
//!   evenly; translateY withSpring(count == 0 ? 150 : 0); a PressableScale (0.96, 250 ms) whose
//!   press clears the selection and posts `press` (the app's selection haptic).
//!
//! The photos are what picsum.photos served for `200/200?key=<i>` (random, cached by RN), kept
//! in images/ at their 200 px. scrollTo is clamped to the content here (UIKit would let a
//! programmatic offset pass it). The safe area's bottom is the iPhone's 34 (DemoEnv has no
//! bottom inset). Corners are circular where RN's button is continuous. No fade-in on load
//! (the photos are bundled).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase, TapGesture};
use reanimated::{Easing, Spring, Timing, GENTLE};
use skia::{fit_cover, Canvas, Color, Font, Images, Paint, Rect, Renderer};

use crate::floating_modal::press_easing;
use crate::gfx;

/// GridConfig.
const COLUMNS: usize = 4;
const PADDING: f32 = 4.0;
/// The data's length.
const ITEMS: usize = 50;
/// Palette.primary.
const PRIMARY: u32 = 0x55D5FF;
/// DEMO_BUTTON_ROW_HEIGHT.
const BUTTON_ROW: f64 = 56.0;
/// useSafeAreaInsets().bottom on an iPhone with a home indicator.
const SAFE_BOTTOM: f64 = 34.0;
/// styles.floating.
const FAB_W: f32 = 96.0;
const FAB_H: f32 = 64.0;
/// AntDesign check, MaterialIcons clear.
const CHECK: &str = "\u{F141}";
const CLEAR: &str = "\u{E14C}";
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-subset.ttf");
static MATERIAL: &[u8] = include_bytes!("../fonts/materialicons-subset.ttf");

macro_rules! photos {
    ($($n:literal),*) => { [$(include_bytes!(concat!("../images/selectable-grid-list/", $n, ".jpg")).as_slice()),*] };
}
static PHOTOS: [&[u8]; ITEMS] = photos!(
    "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24",
    "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49"
);

/// The demo's surface. Input: the safe area's top inset.
pub fn surface() -> Box<dyn Surface> {
    Box::new(grid())
}

fn grid() -> SelectableGrid {
    SelectableGrid {
        size: (0.0, 0.0),
        safe_top: 0.0,
        offset: 0.0,
        current: [false; ITEMS],
        pending: None,
        start: None,
        last_pending: None,
        pan: PanGesture::new(),
        tap: TapGesture::default().max_distance(5.0),
        active: [false; ITEMS],
        border: std::array::from_fn(|_| Timing::at(0.0)),
        badge: std::array::from_fn(|_| Timing::at(0.0)),
        badge_scale: [Spring::at(0.0); ITEMS],
        count: 0,
        counts: (0..=ITEMS).map(|n| n.to_string()).collect(),
        fab_y: Spring::at(150.0),
        fab_press: Timing::at(0.0),
        pressing: None,
        posted: Vec::new(),
        check: Font::new(ANTDESIGN, 16.0),
        clear: Font::new(MATERIAL, 20.0),
        label: skia::match_system_font(20.0, 400.0),
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    }
}

struct SelectableGrid {
    size: (f64, f64),
    safe_top: f64,
    /// contentOffsetY.
    offset: f64,
    /// currentActiveIndexes.
    current: [bool; ITEMS],
    /// pendingIndexes: an inclusive range.
    pending: Option<(usize, usize)>,
    /// initialSelectedIndex.
    start: Option<usize>,
    /// lastPendingFinalIndex.
    last_pending: Option<usize>,
    pan: PanGesture,
    tap: TapGesture,
    /// totalActiveIndexes, per cell, as the items last saw it.
    active: [bool; ITEMS],
    border: [Timing; ITEMS],
    badge: [Timing; ITEMS],
    badge_scale: [Spring; ITEMS],
    count: usize,
    counts: Vec<String>,
    fab_y: Spring,
    fab_press: Timing,
    pressing: Option<u32>,
    posted: Vec<String>,
    check: Option<Font>,
    clear: Option<Font>,
    label: Option<Font>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl SelectableGrid {
    fn item(&self) -> f64 {
        self.size.0 / COLUMNS as f64
    }
    fn list_top(&self) -> f64 {
        self.safe_top + BUTTON_ROW
    }
    fn max_offset(&self) -> f64 {
        let rows = ITEMS.div_ceil(COLUMNS) as f64;
        let content = rows * self.item() + SAFE_BOTTOM + 10.0;
        (content - (self.size.1 - self.list_top())).max(0.0)
    }
    /// calculateGridItemPosition: (x, y) in the list's view.
    fn index_at(&self, x: f64, y: f64) -> usize {
        let item = self.item();
        let index = (x / item).floor() + COLUMNS as f64 * ((y + self.offset) / item).floor();
        index.clamp(0.0, (ITEMS - 1) as f64) as usize
    }
    fn total(&self, i: usize) -> bool {
        self.current[i] || self.pending.is_some_and(|(a, b)| (a.min(b)..=a.max(b)).contains(&i))
    }
    fn toggle(&mut self, i: usize) {
        self.current[i] = !self.current[i];
        self.pending = None;
    }
    fn fab_frame(&self) -> (f32, f32) {
        let (w, h) = (self.size.0 as f32, self.size.1 as f32);
        (w - 20.0 - FAB_W, h - 20.0 - FAB_H + self.fab_y.value as f32)
    }
    fn scroll_to(&mut self, y: f64) {
        self.offset = y.clamp(0.0, self.max_offset());
    }
}

impl Surface for SelectableGrid {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
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
        let selected: Vec<String> = (0..ITEMS).filter(|&i| self.total(i)).map(|i| i.to_string()).collect();
        Some(format!("{{\"selected\":[{}],\"offset\":{:.2},\"held\":{}}}", selected.join(","), self.offset, self.pan.tracking() || self.pressing.is_some()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        // The floating button, above the list.
        let (fx, fy) = self.fab_frame();
        if phase == Phase::Down && self.pressing.is_none() && !self.pan.tracking() && (fx..=fx + FAB_W).contains(&x) && (fy..=fy + FAB_H).contains(&y) {
            self.pressing = Some(id);
            self.fab_press.to(1.0, 250.0, press_easing());
            return;
        }
        if self.pressing == Some(id) {
            if matches!(phase, Phase::Up | Phase::Cancel) {
                self.pressing = None;
                self.fab_press.to(0.0, 250.0, press_easing());
                if phase == Phase::Up {
                    // gridListRef.current.reset().
                    self.current = [false; ITEMS];
                    self.pending = None;
                    self.posted.push("press".into());
                }
            }
            return;
        }
        let top = self.list_top();
        let (lx, ly) = (x as f64, y as f64 - top);
        let on_list = ly >= 0.0;
        match self.pan.event(id, phase, x, y, at_ms, on_list) {
            Event::Begin { .. } => {
                self.last_pending = None;
                self.start = Some(self.index_at(lx, ly));
            }
            Event::Start(_) | Event::Update(_) => {
                if let Some(start) = self.start {
                    let end = self.index_at(lx, ly);
                    if self.last_pending != Some(end) {
                        self.last_pending = Some(end);
                        self.pending = Some((start, end));
                        let (a, b) = (start.min(end), start.max(end));
                        for i in a..=b {
                            self.current[i] = false;
                        }
                    }
                    let item = self.item();
                    let lower = self.offset + item;
                    let upper = lower + self.size.1 - 2.0 * item;
                    let speed = item * 0.15;
                    if ly + self.offset <= lower {
                        self.scroll_to(self.offset - speed);
                    } else if ly + self.offset >= upper {
                        self.scroll_to(self.offset + speed);
                    }
                }
            }
            Event::End(_) => {
                if let Some(start) = self.start {
                    let end = self.index_at(lx, ly);
                    if start == end {
                        self.toggle(end);
                    } else {
                        for i in start.min(end)..=start.max(end) {
                            self.current[i] = true;
                        }
                    }
                }
                self.pending = None;
                self.start = None;
            }
            Event::Fail => {
                self.pending = None;
                self.start = None;
            }
            _ => {}
        }
        // The tap, once the pan has failed (Exclusive).
        let claim = on_list && !self.pan.active();
        if let Event::Tap { .. } = self.tap.event(id, phase, x, y, at_ms, claim) {
            let i = self.index_at(lx, ly);
            self.toggle(i);
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
        self.offset = self.offset.clamp(0.0, self.max_offset());
        if self.images.is_none() {
            let decoded: Vec<skia::Image> = PHOTOS.iter().map(|b| skia::Image::from_jpeg(b).unwrap_or(skia::Image { width: 1, height: 1, pixels: vec![40, 40, 40, 255] })).collect();
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let now = frame.now_ms;
        let mut moving = false;
        let mut count = 0;
        for i in 0..ITEMS {
            let active = self.total(i);
            count += active as usize;
            if active != self.active[i] {
                self.active[i] = active;
                let v = if active { 1.0 } else { 0.0 };
                self.border[i].to(4.0 * v, 300.0, Easing::timing_default());
                self.badge[i].to(v, 300.0, Easing::timing_default());
                self.badge_scale[i].retarget(v, GENTLE);
            }
            moving |= self.border[i].step(now) | self.badge[i].step(now) | self.badge_scale[i].step(now);
        }
        if count != self.count || (count == 0) != (self.fab_y.target() == 150.0) {
            self.count = count;
            self.fab_y.retarget(if count == 0 { 150.0 } else { 0.0 }, GENTLE);
        }
        moving |= self.fab_y.step(now) | self.fab_press.step(now);

        let (w, h) = (frame.width, frame.height);
        let item = self.item() as f32;
        let top = self.list_top() as f32;
        let offset = self.offset as f32;
        let (fx, fy) = self.fab_frame();
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::BLACK);
        c.save();
        c.clip_path(&skia::rect_path(0.0, top, w, h - top));
        let first_row = (offset / item).floor().max(0.0) as usize;
        let last_row = ((offset + h - top) / item).ceil() as usize;
        for row in first_row..=last_row {
            for col in 0..COLUMNS {
                let i = row * COLUMNS + col;
                if i >= ITEMS {
                    break;
                }
                let x = col as f32 * item;
                let y = top + row as f32 * item - offset;
                let side = item - 2.0 * PADDING;
                let (ix, iy) = (x + PADDING, y + PADDING);
                let bw = self.border[i].value as f32;
                if bw > 0.0 {
                    let color = if self.active[i] { Color::hex(PRIMARY) } else { Color::BLACK };
                    c.draw_rrect(ix, iy, side, side, 10.0 + bw, &Paint::fill(color));
                }
                if let Some(images) = self.images.as_ref() {
                    let photo = images.image(i);
                    let inner = Rect::new(ix + bw, iy + bw, side - 2.0 * bw, side - 2.0 * bw);
                    let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), inner);
                    c.draw_rrect(inner.x, inner.y, inner.width, inner.height, 10.0, &Paint::image(photo, placed.invert()));
                }
                let opacity = self.badge[i].value as f32;
                let s = self.badge_scale[i].value as f32;
                if opacity > 0.0 && s != 0.0 {
                    c.save();
                    c.translate(x + 12.0, y + item - 12.0);
                    c.scale(s, s);
                    c.opacity(opacity);
                    c.draw_rrect(-12.0, -12.0, 24.0, 24.0, 12.0, &Paint::fill(Color::hex(PRIMARY)));
                    if let Some(font) = self.check.as_ref() {
                        let gw = font.advance_width(CHECK);
                        c.draw_text(CHECK, -gw / 2.0, gfx::baseline(font, -gfx::line_height(font) / 2.0), font, &Paint::fill(Color::BLACK));
                    }
                    c.restore();
                }
            }
        }
        c.restore();

        // The floating button.
        if fy < h + 40.0 {
            let k = 1.0 - 0.04 * self.fab_press.value as f32;
            c.save();
            c.translate(fx + FAB_W / 2.0, fy + FAB_H / 2.0);
            c.scale(k, k);
            c.translate(-FAB_W / 2.0, -FAB_H / 2.0);
            c.draw_rrect_shadow(0.0, 0.0, FAB_W, FAB_H, 20.0, 10.0, Color::BLACK.alpha(0.5));
            c.draw_rrect(0.0, 0.0, FAB_W, FAB_H, 20.0, &Paint::fill(Color::hex(PRIMARY)));
            // space-evenly over 76: the icon (20) and the count (32), 8 apart.
            if let Some(font) = self.clear.as_ref() {
                let gw = font.advance_width(CLEAR);
                c.draw_text(CLEAR, 18.0 + (20.0 - gw) / 2.0, gfx::baseline(font, (FAB_H - gfx::line_height(font)) / 2.0), font, &Paint::fill(Color::BLACK));
            }
            if let Some(font) = self.label.as_ref() {
                let text = &self.counts[self.count];
                let tw = font.advance_width(text);
                c.draw_text(text, 46.0 + (32.0 - tw) / 2.0, gfx::baseline(font, (FAB_H - gfx::line_height(font)) / 2.0), font, &Paint::fill(Color::BLACK));
            }
            c.restore();
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);
        moving || self.pan.tracking() || self.pressing.is_some()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn taps_and_drags_select_and_the_button_clears() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut s = surface();
        s.bind(&[Value::Number(62.0)], None).unwrap();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("grid-rest");
        assert!(!moving);
        // The list from 118; cells 105 wide; the photo of cell 0 inside 4…101 × 122…219.
        assert_eq!(&rest.at(2 * 50, 2 * 60)[..3], &[0, 0, 0]);
        assert_ne!(&rest.at(2 * 50, 2 * 170)[..3], &[0, 0, 0]);

        // Tap cell 5 (row 1, column 1).
        s.input(&pointer(PointerPhase::Down, 150.0, 280.0, 0.0));
        s.input(&pointer(PointerPhase::Up, 151.0, 281.0, 80.0));
        assert!(s.agent("{}").unwrap().contains("\"selected\":[5]"));
        // Drag from cell 8 to cell 14.
        let mut ms = 100.0;
        s.input(&pointer(PointerPhase::Down, 50.0, 380.0, ms));
        for k in 1..=10 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 50.0 + 25.0 * k as f32, 380.0 + 11.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.agent("{}").unwrap().contains("\"selected\":[5,8,9,10,11,12,13,14]"), "{}", s.agent("{}").unwrap());
        s.input(&pointer(PointerPhase::Up, 300.0, 490.0, ms));
        while ms < 1500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (selected, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        selected.save("grid-selected");
        assert!(!moving);
        // Cell 5's border (4 wide, #55D5FF) at its left edge; the button is up (8 selected).
        assert_eq!(&selected.at(2 * 110, 2 * 270)[..3], &[0x55, 0xD5, 0xFF]);
        assert_eq!(&selected.at(2 * 330, 2 * 860)[..3], &[0x55, 0xD5, 0xFF]);

        // The button clears.
        s.input(&pointer(PointerPhase::Down, 352.0, 860.0, ms));
        s.input(&pointer(PointerPhase::Up, 352.0, 860.0, ms + 60.0));
        assert_eq!(s.messages(), vec!["press".to_string()]);
        assert!(s.agent("{}").unwrap().contains("\"selected\":[]"));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (cleared, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert_eq!(cleared.data, rest.data);
    }

    #[test]
    fn dragging_near_the_top_scrolls_up() {
        let mut s = grid();
        s.size = (420.0, 912.0);
        s.safe_top = 62.0;
        s.offset = 200.0;
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 50.0, 300.0, 0.0));
        s.input(&pointer(PointerPhase::Move, 50.0, 200.0, 16.0));
        // y 82 in the list ≤ itemSize: up by 15.75.
        assert!((s.offset - (200.0 - 105.0 * 0.15)).abs() < 1e-9, "{}", s.offset);
    }
}
