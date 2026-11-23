//! Fifty photos in four columns. A tap toggles one cell. A drag selects the range from the cell it
//! started on to the cell under the finger, and dragging near the top or bottom scrolls the list.
//! A floating button counts the selection and clears it.
//!
//! - The selection pan and the list's scroll are exclusive: each drag is one or the other. A drag
//!   less than 30° off the horizontal selects; 30° or more scrolls the list, 1:1 from the second
//!   move past 10 pt, with UIKit's rubber band and fling.
//! - Haptics: a light impact when a drag-select starts, a selection tick as cells change (at most
//!   one per TICK_MS), and a soft impact when it ends.
//! - Photos cross-dissolve in over FADE_MS as the list renders them. The button is continuous.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture, Phase, TapGesture};
use pressto::{PressEvent, Pressable};
use motion::{duration_config, Easing, Spring, SpringConfig as Config, Timing};

/// The border and badge fade over FADE_SELECT_MS. The badge and button springs are critically
/// damped, settling in 300 and 350 ms.
const FADE_SELECT_MS: f64 = 200.0;
const TICK_MS: f64 = 40.0;
fn badge_spring() -> Config {
    duration_config(1.0, 0.0, 300.0, 1.0, 4.0)
}
fn fab_spring() -> Config {
    duration_config(150.0, 0.0, 350.0, 1.0, 4.0)
}
use draw2d::{fit_cover, Canvas, Color, Font, Images, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{self, Snap, UiScroll};

/// Grid columns, and the cells' padding in points.
const COLUMNS: usize = 4;
const PADDING: f32 = 4.0;
/// Photos in the grid.
const ITEMS: usize = 50;
/// The selection colour.
const PRIMARY: u32 = 0x55D5FF;
/// Height of the row above the list, in points.
const BUTTON_ROW: f64 = 56.0;
/// Photo cross-dissolve, in ms, with an ease-in-out curve.
const FADE_MS: f64 = 100.0;
/// The list renders INITIAL_RENDER photos at once, then BATCH more every BATCH_MS.
const INITIAL_RENDER: usize = 20;
const BATCH: usize = 10;
const BATCH_MS: f64 = 50.0;
/// The floating button's size, in points.
const FAB_W: f32 = 96.0;
const FAB_H: f32 = 64.0;
/// Icon glyphs: a check and a clear.
const CHECK: &str = "\u{F141}";
const CLEAR: &str = "\u{E14C}";
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-subset.ttf");
static MATERIAL: &[u8] = include_bytes!("../fonts/materialicons-subset.ttf");

static PHOTOS: [&crate::bytes::Bytes; ITEMS] = [
    crate::image!("selectable-grid-list/00.jpg"),
    crate::image!("selectable-grid-list/01.jpg"),
    crate::image!("selectable-grid-list/02.jpg"),
    crate::image!("selectable-grid-list/03.jpg"),
    crate::image!("selectable-grid-list/04.jpg"),
    crate::image!("selectable-grid-list/05.jpg"),
    crate::image!("selectable-grid-list/06.jpg"),
    crate::image!("selectable-grid-list/07.jpg"),
    crate::image!("selectable-grid-list/08.jpg"),
    crate::image!("selectable-grid-list/09.jpg"),
    crate::image!("selectable-grid-list/10.jpg"),
    crate::image!("selectable-grid-list/11.jpg"),
    crate::image!("selectable-grid-list/12.jpg"),
    crate::image!("selectable-grid-list/13.jpg"),
    crate::image!("selectable-grid-list/14.jpg"),
    crate::image!("selectable-grid-list/15.jpg"),
    crate::image!("selectable-grid-list/16.jpg"),
    crate::image!("selectable-grid-list/17.jpg"),
    crate::image!("selectable-grid-list/18.jpg"),
    crate::image!("selectable-grid-list/19.jpg"),
    crate::image!("selectable-grid-list/20.jpg"),
    crate::image!("selectable-grid-list/21.jpg"),
    crate::image!("selectable-grid-list/22.jpg"),
    crate::image!("selectable-grid-list/23.jpg"),
    crate::image!("selectable-grid-list/24.jpg"),
    crate::image!("selectable-grid-list/25.jpg"),
    crate::image!("selectable-grid-list/26.jpg"),
    crate::image!("selectable-grid-list/27.jpg"),
    crate::image!("selectable-grid-list/28.jpg"),
    crate::image!("selectable-grid-list/29.jpg"),
    crate::image!("selectable-grid-list/30.jpg"),
    crate::image!("selectable-grid-list/31.jpg"),
    crate::image!("selectable-grid-list/32.jpg"),
    crate::image!("selectable-grid-list/33.jpg"),
    crate::image!("selectable-grid-list/34.jpg"),
    crate::image!("selectable-grid-list/35.jpg"),
    crate::image!("selectable-grid-list/36.jpg"),
    crate::image!("selectable-grid-list/37.jpg"),
    crate::image!("selectable-grid-list/38.jpg"),
    crate::image!("selectable-grid-list/39.jpg"),
    crate::image!("selectable-grid-list/40.jpg"),
    crate::image!("selectable-grid-list/41.jpg"),
    crate::image!("selectable-grid-list/42.jpg"),
    crate::image!("selectable-grid-list/43.jpg"),
    crate::image!("selectable-grid-list/44.jpg"),
    crate::image!("selectable-grid-list/45.jpg"),
    crate::image!("selectable-grid-list/46.jpg"),
    crate::image!("selectable-grid-list/47.jpg"),
    crate::image!("selectable-grid-list/48.jpg"),
    crate::image!("selectable-grid-list/49.jpg"),
];

/// The files of gpu/images this surface draws: embedded on the iPhone, fetched before it draws on the web
/// (crate::bytes).
const IMAGES: &[&str] = &[
    "selectable-grid-list/00.jpg",
    "selectable-grid-list/01.jpg",
    "selectable-grid-list/02.jpg",
    "selectable-grid-list/03.jpg",
    "selectable-grid-list/04.jpg",
    "selectable-grid-list/05.jpg",
    "selectable-grid-list/06.jpg",
    "selectable-grid-list/07.jpg",
    "selectable-grid-list/08.jpg",
    "selectable-grid-list/09.jpg",
    "selectable-grid-list/10.jpg",
    "selectable-grid-list/11.jpg",
    "selectable-grid-list/12.jpg",
    "selectable-grid-list/13.jpg",
    "selectable-grid-list/14.jpg",
    "selectable-grid-list/15.jpg",
    "selectable-grid-list/16.jpg",
    "selectable-grid-list/17.jpg",
    "selectable-grid-list/18.jpg",
    "selectable-grid-list/19.jpg",
    "selectable-grid-list/20.jpg",
    "selectable-grid-list/21.jpg",
    "selectable-grid-list/22.jpg",
    "selectable-grid-list/23.jpg",
    "selectable-grid-list/24.jpg",
    "selectable-grid-list/25.jpg",
    "selectable-grid-list/26.jpg",
    "selectable-grid-list/27.jpg",
    "selectable-grid-list/28.jpg",
    "selectable-grid-list/29.jpg",
    "selectable-grid-list/30.jpg",
    "selectable-grid-list/31.jpg",
    "selectable-grid-list/32.jpg",
    "selectable-grid-list/33.jpg",
    "selectable-grid-list/34.jpg",
    "selectable-grid-list/35.jpg",
    "selectable-grid-list/36.jpg",
    "selectable-grid-list/37.jpg",
    "selectable-grid-list/38.jpg",
    "selectable-grid-list/39.jpg",
    "selectable-grid-list/40.jpg",
    "selectable-grid-list/41.jpg",
    "selectable-grid-list/42.jpg",
    "selectable-grid-list/43.jpg",
    "selectable-grid-list/44.jpg",
    "selectable-grid-list/45.jpg",
    "selectable-grid-list/46.jpg",
    "selectable-grid-list/47.jpg",
    "selectable-grid-list/48.jpg",
    "selectable-grid-list/49.jpg",
];

/// The demo's surface. Inputs: the safe area's top and bottom insets.
/// On the web it draws once its [`IMAGES`] arrived (crate::bytes::gate).
pub fn surface() -> Box<dyn Surface> {
    crate::bytes::gate(IMAGES, ungated())
}

fn ungated() -> Box<dyn Surface> {
    Box::new(grid())
}

fn grid() -> SelectableGrid {
    SelectableGrid {
        size: (0.0, 0.0),
        safe_top: 0.0,
        safe_bottom: 0.0,
        list: UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, Snap::Free),
        scroller: None,
        scrolling: None,
        opened: None,
        fade: std::array::from_fn(|_| Timing::at(0.0)),
        current: [false; ITEMS],
        pending: None,
        start: None,
        last_pending: None,
        down: (0.0, 0.0),
        pan: PanGesture::new(),
        tap: TapGesture::default().max_delta(5.0, 5.0),
        active: [false; ITEMS],
        border: std::array::from_fn(|_| Timing::at(0.0)),
        badge: std::array::from_fn(|_| Timing::at(0.0)),
        badge_scale: [Spring::at(0.0); ITEMS],
        count: 0,
        counts: (0..=ITEMS).map(|n| n.to_string()).collect(),
        fab_y: Spring::at(150.0),
        fab_press: Pressable::new(),
        posted: Vec::new(),
        last_tick: f64::NEG_INFINITY,
        check: Font::new(ANTDESIGN, 16.0).map(Font::with_ui_layout),
        clear: Font::new(MATERIAL, 20.0).map(Font::with_ui_layout),
        // A text input's font, with UIKit's tracking and kerning.
        label: draw2d::match_ui_font(20.0, 400.0),
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    }
}

struct SelectableGrid {
    size: (f64, f64),
    safe_top: f64,
    safe_bottom: f64,
    /// The list's scroll (vertical, fed with x and y swapped). Its offset goes past the ends while it bounces.
    list: UiScroll,
    /// The finger the selection pan took from the scroll view (not fed to it any more).
    scroller: Option<u32>,
    /// The finger the scroll view took (the pan failed for it).
    scrolling: Option<u32>,
    /// When the list first drew. Photos load from there.
    opened: Option<f64>,
    /// Each photo's cross-dissolve.
    fade: [Timing; ITEMS],
    /// The confirmed selection.
    current: [bool; ITEMS],
    /// The drag's pending range, inclusive, shown as selected.
    pending: Option<(usize, usize)>,
    /// Where the drag started.
    start: Option<usize>,
    /// The drag's last end cell, to skip repeats.
    last_pending: Option<usize>,
    /// Where the finger went down (the pan's translation starts at its activation).
    down: (f32, f32),
    pan: PanGesture,
    tap: TapGesture,
    /// Whether each cell was selected at the last frame.
    active: [bool; ITEMS],
    border: [Timing; ITEMS],
    badge: [Timing; ITEMS],
    badge_scale: [Spring; ITEMS],
    count: usize,
    counts: Vec<String>,
    fab_y: Spring,
    /// The last selection tick (frame time).
    last_tick: f64,
    /// The button's PressableScale (the shared pressto machine).
    fab_press: Pressable,
    posted: Vec<String>,
    check: Option<Font>,
    clear: Option<Font>,
    label: Option<Font>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl SelectableGrid {
    fn offset(&self) -> f64 {
        self.list.offset
    }
    fn item(&self) -> f64 {
        self.size.0 / COLUMNS as f64
    }
    fn list_top(&self) -> f64 {
        self.safe_top + BUTTON_ROW
    }
    /// The list's height (the FlatList's bounds).
    fn bounds(&self) -> f64 {
        self.size.1 - self.list_top()
    }
    /// The furthest contentOffset: contentSize (rows, paddingBottom safeBottom + 10) less the
    /// bounds, at least 0.01 (RCTScrollViewComponentView's maxRect).
    fn max_offset(&self) -> f64 {
        let rows = ITEMS.div_ceil(COLUMNS) as f64;
        let content = rows * self.item() + self.safe_bottom + 10.0;
        (content - self.bounds()).max(0.01)
    }
    /// The cell under (x, y) in the list's view.
    fn index_at(&self, x: f64, y: f64) -> usize {
        let item = self.item();
        let index = (x / item).floor() + COLUMNS as f64 * ((y + self.offset()) / item).floor();
        index.clamp(0.0, (ITEMS - 1) as f64) as usize
    }
    fn total(&self, i: usize) -> bool {
        self.current[i]
            || self
                .pending
                .is_some_and(|(a, b)| (a.min(b)..=a.max(b)).contains(&i))
    }
    fn toggle(&mut self, i: usize) {
        self.current[i] = !self.current[i];
        self.pending = None;
    }
    fn fab_frame(&self) -> (f32, f32) {
        let (w, h) = (self.size.0 as f32, self.size.1 as f32);
        (w - 20.0 - FAB_W, h - 20.0 - FAB_H + self.fab_y.value as f32)
    }
    /// The list's scroll range and port, from the window's size.
    fn sync_list(&mut self) {
        self.list.max = self.max_offset();
        self.list.port = self.bounds().max(1.0);
    }
    fn scroll_to(&mut self, y: f64) {
        let to = y.clamp(0.0, self.max_offset());
        self.list.set_offset(to);
    }
}

impl Surface for SelectableGrid {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        self.safe_bottom = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let selected: Vec<String> = (0..ITEMS)
            .filter(|&i| self.total(i))
            .map(|i| i.to_string())
            .collect();
        Some(format!(
            "{{\"selected\":[{}],\"offset\":{:.2},\"held\":{}}}",
            selected.join(","),
            self.offset(),
            self.pan.tracking() || self.fab_press.is_pressed()
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
        self.sync_list();
        let phase = gfx::phase(phase);
        // The floating button, above the list.
        let (fx, fy) = self.fab_frame();
        let on_fab = (fx..=fx + FAB_W).contains(&x) && (fy..=fy + FAB_H).contains(&y);
        if phase == Phase::Down && !self.pan.tracking() && self.fab_press.pointer_down(id, on_fab) {
            return;
        }
        if self.fab_press.finger() == Some(id) {
            if let Some(PressEvent::Press(press)) = self.fab_press.pointer(id, phase, on_fab) {
                // Clears the selection. The app plays its haptic on `press`.
                self.current = [false; ITEMS];
                self.pending = None;
                if press.global {
                    self.posted.push("press".into());
                }
            }
            return;
        }
        let top = self.list_top();
        let (lx, ly) = (x as f64, y as f64 - top);
        let on_list = ly >= 0.0;
        let event = self.pan.event(id, phase, x, y, at_ms, on_list);
        if let Event::Begin { x, y } = event {
            self.down = (x, y);
        }
        if phase == Phase::Down {
            self.scroller = None;
            self.scrolling = None;
        }
        // The list's scroll sees every touch until the selection pan takes a drag that sets off sideways.
        // A drag 30° or more off the horizontal scrolls the list; less than that selects.
        let mut sideways = false;
        if let Event::Start(e) = event {
            let (dx, dy) = (e.x - self.down.0, e.y - self.down.1);
            sideways = dy.abs() < dx.abs() * 0.5773502691896258;
            if sideways {
                self.posted.push("haptic:impact-light".into());
            }
            if !sideways {
                // The list takes the drag: the pan fails and the list scrolls from here.
                self.pending = None;
                self.start = None;
                self.scrolling = Some(id);
            }
        }
        if self.scroller != Some(id) {
            let fed = if sideways { Phase::Cancel } else { phase };
            self.list.input(id, fed, y, x, at_ms, on_list);
            if sideways {
                self.scroller = Some(id);
            }
        }
        if self.scrolling == Some(id) {
            // The tap sees the finger too (it fails on the travel).
            self.tap.event(id, phase, x, y, at_ms, false);
            return;
        }
        match event {
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
                    let offset = self.offset();
                    let lower = offset + item;
                    let upper = lower + self.size.1 - 2.0 * item;
                    let speed = item * 0.15;
                    if ly + offset <= lower {
                        self.scroll_to(offset - speed);
                    } else if ly + offset >= upper {
                        self.scroll_to(offset + speed);
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
                        self.posted.push("haptic:impact-soft".into());
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
        // A tap toggles its cell, unless the pan has taken the touch.
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
        let now = frame.now_ms;
        self.sync_list();
        let mut moving = self.list.step(now);
        // The photos start their fades in batches after the list opens.
        let opened = *self.opened.get_or_insert(now);
        for (i, fade) in self.fade.iter_mut().enumerate() {
            let batch = if i < INITIAL_RENDER {
                0.0
            } else {
                ((i - INITIAL_RENDER) / BATCH + 1) as f64 * BATCH_MS
            };
            if fade.value == 0.0 && !fade.running && now >= opened + batch {
                fade.to(1.0, FADE_MS, Easing::bezier(0.42, 0.0, 0.58, 1.0));
            }
            moving |= fade.step(now) || fade.value < 1.0;
        }
        if self.images.is_none() {
            let decoded: Vec<draw2d::Image> = PHOTOS
                .iter()
                .map(|b| {
                    draw2d::Image::from_jpeg(b).unwrap_or(draw2d::Image {
                        width: 1,
                        height: 1,
                        pixels: vec![40, 40, 40, 255],
                    })
                })
                .collect();
            let refs: Vec<&draw2d::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let mut count = 0;
        let mut changed = false;
        for i in 0..ITEMS {
            let active = self.total(i);
            count += active as usize;
            if active != self.active[i] {
                self.active[i] = active;
                changed = true;
                let v = if active { 1.0 } else { 0.0 };
                self.border[i].to(4.0 * v, FADE_SELECT_MS, Easing::timing_default());
                self.badge[i].to(v, FADE_SELECT_MS, Easing::timing_default());
                self.badge_scale[i].retarget(v, badge_spring());
            }
            moving |=
                self.border[i].step(now) | self.badge[i].step(now) | self.badge_scale[i].step(now);
        }
        if count != self.count || (count == 0) != (self.fab_y.target() == 150.0) {
            self.count = count;
            self.fab_y
                .retarget(if count == 0 { 150.0 } else { 0.0 }, fab_spring());
        }
        moving |= self.fab_y.step(now) | self.fab_press.step(now);
        if changed && now - self.last_tick >= TICK_MS {
            self.last_tick = now;
            self.posted.push("haptic:selection".into());
        }

        let (w, h) = (frame.width, frame.height);
        let item = self.item() as f32;
        let top = self.list_top() as f32;
        let offset = self.offset() as f32;
        let (fx, fy) = self.fab_frame();
        let s_px = frame.scale;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::BLACK);
        c.save();
        c.clip_path(&draw2d::rect_path(0.0, top, w, h - top));
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
                    let color = if self.active[i] {
                        Color::view_hex(PRIMARY)
                    } else {
                        Color::BLACK
                    };
                    c.draw_rrect(ix, iy, side, side, 10.0 + bw, &Paint::fill(color));
                }
                if let Some(images) = self.images.as_ref() {
                    let photo = images.image(i);
                    let inner = Rect::new(ix + bw, iy + bw, side - 2.0 * bw, side - 2.0 * bw);
                    let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), inner);
                    let fade = self.fade[i].value as f32;
                    if fade > 0.0 {
                        c.draw_rrect(
                            inner.x,
                            inner.y,
                            inner.width,
                            inner.height,
                            10.0,
                            &Paint::image(photo, placed.invert()).with_opacity(fade),
                        );
                    }
                }
                let opacity = self.badge[i].value as f32;
                let s = self.badge_scale[i].value as f32;
                if opacity > 0.0 && s != 0.0 {
                    c.save();
                    c.translate(x + 12.0, y + item - 12.0);
                    c.scale(s, s);
                    c.opacity(opacity);
                    c.draw_rrect(
                        -12.0,
                        -12.0,
                        24.0,
                        24.0,
                        12.0,
                        &Paint::fill(Color::view_hex(PRIMARY)),
                    );
                    if let Some(font) = self.check.as_ref() {
                        // Centred in the badge (see `glyph_box`).
                        let (gx, base) = glyph_box(font, CHECK, 24.0, 24.0, s_px);
                        c.draw_text(
                            CHECK,
                            gx - 12.0,
                            base - 12.0,
                            font,
                            &Paint::fill(Color::BLACK),
                        );
                    }
                    c.restore();
                }
            }
        }
        c.restore();

        // The floating button.
        if fy < h + 40.0 {
            let k = self.fab_press.scale() as f32;
            c.save();
            c.translate(fx + FAB_W / 2.0, fy + FAB_H / 2.0);
            c.scale(k, k);
            c.translate(-FAB_W / 2.0, -FAB_H / 2.0);
            c.draw_rrect_shadow(0.0, 0.0, FAB_W, FAB_H, 20.0, 10.0, Color::BLACK.alpha(0.5));
            c.draw_continuous_rrect(
                0.0,
                0.0,
                FAB_W,
                FAB_H,
                20.0,
                &Paint::fill(Color::view_hex(PRIMARY)),
            );
            // The icon and the count are spaced evenly.
            if let Some(font) = self.clear.as_ref() {
                let iw = text_side(font.advance_width(CLEAR), s_px);
                let gap = (FAB_W - 20.0 - iw - 32.0) / 3.0;
                let (gx, base) = glyph_box(font, CLEAR, iw, FAB_H, s_px);
                let left = text_grid(10.0 + gap, s_px);
                c.draw_text(CLEAR, left + gx, base, font, &Paint::fill(Color::BLACK));
                if let Some(label) = self.label.as_ref() {
                    let text = &self.counts[self.count];
                    let tw = label.advance_width(text);
                    // A text input centres its line one device pixel higher than a text does.
                    // The count's left edge, rounded to the pixel.
                    let x = ((10.0 + 2.0 * gap + iw) * s_px + 1e-4).round() / s_px;
                    let base =
                        gfx::baseline(label, (FAB_H - gfx::line_height(label)) / 2.0) - 1.0 / s_px;
                    c.draw_text(
                        text,
                        x + (32.0 - tw) / 2.0,
                        base,
                        label,
                        &Paint::fill(Color::BLACK),
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
        moving || self.pan.tracking() || self.fab_press.is_animating()
    }
}

/// A Text's offset in its parent: Yoga floors it to the device pixel.
fn text_grid(v: f32, s: f32) -> f32 {
    (v * s + 1e-3).floor() / s
}
/// A text's measured side, ceiled to the device pixel after an epsilon.
fn text_side(v: f32, s: f32) -> f32 {
    ((v * s + 1e-4).floor() + 1.0) / s
}
/// An icon glyph centred in a `w` × `h` box: its x, and its baseline from the box's top-left. The box
/// is the font's ascent + descent, ceiled to the pixel; the baseline lands on the next pixel down.
fn glyph_box(font: &Font, glyph: &str, w: f32, h: f32, s: f32) -> (f32, f32) {
    let m = font.metrics();
    let tw = text_side(font.advance_width(glyph), s);
    let th = text_side(-m.ascent + m.descent, s);
    let (x, top) = (text_grid((w - tw) / 2.0, s), text_grid((h - th) / 2.0, s));
    (x, ((top - m.ascent) * s - 1e-3).ceil() / s)
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
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        let mut s = surface();
        s.bind(&[Value::Number(62.0), Value::Number(34.0)], None)
            .unwrap();
        // The photos fade in (100 ms each, the last batch 150 ms after the mount).
        let (first, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        assert!(moving);
        let (half, _) = fixture::render(&gpu, s.as_mut(), &frame(50.0)).unwrap();
        let mut t = 50.0;
        while t < 300.0 {
            t += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(300.0)).unwrap();
        rest.save("grid-rest");
        assert!(!moving);
        // Cell 0's photo: black at the mount, half-way (ease-in-out at 0.5 is 0.5) at 50 ms.
        let (p0, p1, p2) = (
            first.at(2 * 50, 2 * 170),
            half.at(2 * 50, 2 * 170),
            rest.at(2 * 50, 2 * 170),
        );
        assert_eq!(&p0[..3], &[0, 0, 0]);
        for k in 0..3 {
            assert!(
                (p1[k] as f32 - p2[k] as f32 * 0.5).abs() <= 2.0,
                "{p1:?} vs {p2:?}"
            );
        }
        // The list from 118; cells 105 wide; the photo of cell 0 inside 4…101 × 122…219.
        assert_eq!(&rest.at(2 * 50, 2 * 60)[..3], &[0, 0, 0]);
        assert_ne!(&rest.at(2 * 50, 2 * 170)[..3], &[0, 0, 0]);

        // Tap cell 5 (row 1, column 1).
        s.input(&pointer(PointerPhase::Down, 150.0, 280.0, 300.0));
        s.input(&pointer(PointerPhase::Up, 151.0, 281.0, 380.0));
        assert!(s.agent("{}").unwrap().contains("\"selected\":[5]"));
        // Drag from cell 8 to cell 14.
        let mut ms = 400.0;
        s.input(&pointer(PointerPhase::Down, 50.0, 380.0, ms));
        for k in 1..=10 {
            ms += 16.0;
            s.input(&pointer(
                PointerPhase::Move,
                50.0 + 25.0 * k as f32,
                380.0 + 11.0 * k as f32,
                ms,
            ));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(
            s.agent("{}")
                .unwrap()
                .contains("\"selected\":[5,8,9,10,11,12,13,14]"),
            "{}",
            s.agent("{}").unwrap()
        );
        s.input(&pointer(PointerPhase::Up, 300.0, 490.0, ms));
        while ms < 1500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (selected, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        selected.save("grid-selected");
        assert!(!moving);
        // Cell 5's border (4 wide, #55D5FF) at its left edge; the button is up (8 selected).
        assert_eq!(&selected.at(2 * 110, 2 * 270)[..3], &[0, 216, 255]);
        // (330, 860) is the clear glyph's centre, where CoreText's mask leaves half coverage.
        assert_eq!(&selected.at(2 * 322, 2 * 860)[..3], &[0, 216, 255]);

        // The drag-select's haptics: an impact as it starts, ticks as cells change (40 ms
        // apart at most), a soft impact as it ends.
        let haptics = s.messages();
        assert_eq!(
            haptics.first().map(String::as_str),
            Some("haptic:impact-light"),
            "{haptics:?}"
        );
        assert_eq!(
            haptics.last().map(String::as_str),
            Some("haptic:impact-soft"),
            "{haptics:?}"
        );
        assert!(
            haptics.iter().any(|m| m == "haptic:selection"),
            "{haptics:?}"
        );

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
        s.list.offset = 200.0;
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        // Sideways (a vertical drag would scroll the list itself), in the top row.
        s.input(&pointer(PointerPhase::Down, 50.0, 200.0, 0.0));
        s.input(&pointer(PointerPhase::Move, 70.0, 201.0, 16.0));
        // y 83 in the list ≤ itemSize: up by 15.75.
        assert!(
            (s.offset() - (200.0 - 105.0 * 0.15)).abs() < 1e-9,
            "{}",
            s.offset()
        );
    }

    #[test]
    fn scroll_to_clamps_as_rn_does() {
        let mut s = grid();
        s.size = (420.0, 912.0);
        s.safe_top = 62.0;
        s.safe_bottom = 34.0;
        // 13 rows of 105, + 34 + 10, less the 794 the list shows.
        assert!((s.max_offset() - (13.0 * 105.0 + 44.0 - 794.0)).abs() < 1e-9);
        s.scroll_to(-50.0);
        assert_eq!(s.offset(), 0.0);
        s.scroll_to(1e6);
        assert_eq!(s.offset(), s.max_offset());
        // Content shorter than the list keeps 0.01 of room.
        s.size = (420.0, 4000.0);
        assert_eq!(s.max_offset(), 0.01);
    }

    #[test]
    fn a_vertical_drag_scrolls_and_a_sideways_one_selects() {
        let mut s = grid();
        s.size = (420.0, 912.0);
        s.safe_top = 62.0;
        s.safe_bottom = 34.0;
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        // Up 200 over 200 ms, then let go: the list scrolls (no selection), then flings on.
        s.input(&pointer(PointerPhase::Down, 200.0, 700.0, 0.0));
        for k in 1..=20 {
            s.input(&pointer(
                PointerPhase::Move,
                200.0,
                700.0 - 10.0 * k as f32,
                10.0 * k as f64,
            ));
        }
        // UIScrollView began on the second move past its 10 pt: 180 of content, 1:1.
        assert!((s.offset() - 180.0).abs() < 1e-6, "{}", s.offset());
        assert!(s.agent("{}").unwrap().contains("\"selected\":[]"));
        s.input(&pointer(PointerPhase::Up, 200.0, 500.0, 200.0));
        // 1 pt/ms released: UIKit projects 494 pt on, past the end, so it settles on the end.
        let mut ms = 200.0;
        while s.list.step(ms) {
            ms += 16.0;
            assert!(ms < 5000.0);
        }
        assert!((s.offset() - s.max_offset()).abs() < 1e-9, "{}", s.offset());
        // A sideways drag selects (the scroll view does not begin).
        let mut u = grid();
        u.size = (420.0, 912.0);
        u.safe_top = 62.0;
        u.input(&pointer(PointerPhase::Down, 50.0, 170.0, 0.0));
        for k in 1..=10 {
            u.input(&pointer(
                PointerPhase::Move,
                50.0 + 25.0 * k as f32,
                170.0 + 2.0 * k as f32,
                16.0 * k as f64,
            ));
        }
        assert_eq!(u.offset(), 0.0);
        assert!(
            u.agent("{}").unwrap().contains("\"selected\":[0,1,2]"),
            "{}",
            u.agent("{}").unwrap()
        );
    }
}
