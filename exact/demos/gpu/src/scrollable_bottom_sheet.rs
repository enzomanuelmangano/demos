//! A gradient button opens a dark sheet over three horizontal pages, and the sheet's height follows
//! the page in view. The last page's button closes it, as does a drag down past 100 or a tap on the
//! backdrop.
//!
//! - A drag on the sheet moves it 1:1. A release past CLOSE_DRAG closes it; otherwise it springs back.
//! - Haptics: a light impact when a drag takes the sheet; a selection when the pull passes
//!   CLOSE_DRAG (re-armed REARM under it) and when a drag or its glide brings another page into view,
//!   at most one per HAPTIC_GAP_MS; a medium impact when a release closes the sheet.
//!
//! The layout is on the pixel grid. Views are Display P3; the gradients are drawn once into an atlas.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, Pan, PanGesture, Phase};
use pressto::{PressEvent, Pressable};
use motion::{interpolate, Easing, Extrapolation, Spring, SpringConfig as Config, Timing};
use draw2d::{Canvas, Color, Font, Image, Images, Matrix, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{self, Snap, UiScroll};

/// Page heights, in points: the sheet's height at each page.
const PAGES: [f64; 3] = [350.0, 500.0, 250.0];
/// The sheet's spring.
const SPRING: Config = Config {
    stiffness: 180.0,
    damping: 25.0,
    mass: 0.9,
};
/// Grab line: 75 × 4, 15 below the top. The pages start 34 below the top.
const LINE_W: f32 = 75.0;
const LINE_H: f32 = 4.0;
const LINE_TOP: f32 = 15.0;
const PAGES_TOP: f32 = 34.0;
/// The sheet's radius (continuous).
const RADIUS: f32 = 25.0;
/// The round button is 50 × 50. The page buttons are 200 × 50, with the half-height radius.
const ROUND: f32 = 50.0;
const PILL_W: f32 = 200.0;
const PILL_H: f32 = 50.0;
/// The gradients' colours.
const FROM: u32 = 0x4E65FF;
const TO: u32 = 0x92EFFD;
/// Fade durations, ms.
const PAGES_FADE_MS: f64 = 150.0;
const BACKDROP_FADE_MS: f64 = 300.0;
/// Backdrop alpha: 5 % white.
const BACKDROP_ALPHA: u8 = 13;
/// Delay before the pages scroll back to the first page after a close, ms.
const RESET_MS: f64 = 500.0;
/// Scroll events are throttled to this interval, ms.
const THROTTLE_MS: f64 = 16.0;
/// The drag's pull past 100 closes.
const CLOSE_DRAG: f32 = 100.0;
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// Back under CLOSE_DRAG by this much before going past it plays again, points.
const REARM: f32 = 24.0;
/// How far past the half-page line the pages go before the page's haptic plays, points.
const SWITCH: f64 = 6.0;
/// Transparent margin around each atlas cell, device pixels.
const GUTTER: f32 = 2.0;
/// The atlas cells: the round button, "Next Page", "Close".
const CELL_ROUND: usize = 0;
const CELL_NEXT: usize = 1;
const CELL_CLOSE: usize = 2;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sheet::new())
}

/// Rounds a layout edge to the nearest device pixel, a half up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// A text's position: floored to the device pixel.
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// A Text's measured side, ceiled to the pixel grid.
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

fn channel(rgb: u32, shift: u32) -> f64 {
    ((rgb >> shift) & 0xFF) as f64
}

/// The gradient from `FROM` to `TO`, from `start` to `end` (fractions of the box), as a `w × h`
/// image: each pixel's colour at its centre's projection, rounded to 8 bits.
fn gradient_image(w: u32, h: u32, start: (f64, f64), end: (f64, f64)) -> Image {
    let (wf, hf) = (w as f64, h as f64);
    let (sx, sy) = (start.0 * wf, start.1 * hf);
    let (ax, ay) = (end.0 * wf - sx, end.1 * hf - sy);
    let len2 = ax * ax + ay * ay;
    let mut pixels = Vec::with_capacity((w * h * 4) as usize);
    for py in 0..h {
        for px in 0..w {
            let (x, y) = (px as f64 + 0.5 - sx, py as f64 + 0.5 - sy);
            let t = ((x * ax + y * ay) / len2).clamp(0.0, 1.0);
            for k in [16, 8, 0] {
                let (a, b) = (channel(FROM, k), channel(TO, k));
                pixels.push((a + (b - a) * t).round() as u8);
            }
            pixels.push(255);
        }
    }
    Image::from_rgba(w, h, pixels)
}

/// Who a finger on the sheet went to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Owner {
    /// Not decided: the pan and the scroll view both wait for 10 pt.
    Undecided,
    /// The sheet's pan: the sheet follows the finger down.
    Sheet,
    /// The pages' scroll view: a horizontal set-off.
    Scroll,
}

#[derive(Clone, Copy, Debug)]
struct Finger {
    id: u32,
    down: (f32, f32),
    owner: Owner,
    /// The finger landed on the pages (the scroll view had it).
    on_pages: bool,
}

struct Gpu {
    scale: f32,
    generation: u32,
    atlas: Images,
}

struct Sheet {
    w: f32,
    h: f32,
    scale: f32,
    translate_y: Spring,
    active: bool,
    /// The sheet's translateY when the pan began.
    context: f64,
    pages_opacity: Timing,
    backdrop_opacity: Timing,
    pages: UiScroll,
    pan: PanGesture,
    finger: Option<Finger>,
    /// The scroll event last reported: offset, when.
    reported: f64,
    reported_at: f64,
    /// When the pages scroll back to the first page.
    resets: Vec<f64>,
    /// The round button, then the three page buttons.
    press: [Pressable; 4],
    font: Option<Font>,
    posted: Vec<String>,
    /// The pull went past CLOSE_DRAG (its selection played) and is not re-armed yet.
    past_close: bool,
    /// The page in view, and whether a press's scrollTo (or the close's reset) drives the pages.
    page: i64,
    driven: bool,
    /// The last selection haptic's time (the frame clock).
    haptic_at: f64,
    /// The last frame's time: springs and the scroll events run on the frame clock (a pointer's
    /// `at_ms` is on another base).
    now: f64,
    drawn_ms: f64,
    /// The last frame still moved something.
    moving: bool,
    gpu: Option<Gpu>,
    layer_canvas: Canvas,
    layer_renderer: Renderer,
    canvas: Canvas,
    renderer: Renderer,
}

impl Sheet {
    fn new() -> Sheet {
        Sheet {
            w: 0.0,
            h: 0.0,
            scale: 3.0,
            // pages[0].height at mount: below the screen.
            translate_y: Spring::at(PAGES[0]),
            active: false,
            context: 0.0,
            pages_opacity: Timing::at(0.0),
            backdrop_opacity: Timing::at(0.0),
            pages: UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, Snap::Free),
            pan: PanGesture::new(),
            finger: None,
            reported: 0.0,
            reported_at: f64::NEG_INFINITY,
            resets: Vec::new(),
            press: std::array::from_fn(|_| Pressable::new()),
            font: draw2d::match_ui_font(20.0, 700.0),
            posted: Vec::new(),
            past_close: false,
            page: 0,
            driven: false,
            haptic_at: f64::NEG_INFINITY,
            now: 0.0,
            drawn_ms: 0.0,
            moving: false,
            gpu: None,
            layer_canvas: Canvas::default(),
            layer_renderer: Renderer::default(),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
        }
    }

    fn sync_layout(&mut self, w: f32, h: f32, scale: f32) {
        let first = self.w <= 0.0;
        self.w = w;
        self.h = h;
        self.scale = scale;
        self.pages.port = w as f64;
        self.pages.max = 2.0 * w as f64;
        self.pages.snap = Snap::Page(w as f64);
        if first {
            self.pages.offset = 0.0;
        }
    }

    /// Slides the sheet to `destination`, and arms the reset after a close.
    fn scroll_to_y(&mut self, destination: f64, now: f64) {
        self.active = destination != 0.0;
        if destination == 0.0 {
            self.resets.push(now + RESET_MS);
        }
        self.translate_y.assign(destination, SPRING, now);
    }

    /// Fades follow `active`. A fade toward the same target keeps its running timing.
    fn sync_fades(&mut self) {
        let to = if self.active { 1.0 } else { 0.0 };
        for (t, ms) in [
            (&mut self.pages_opacity, PAGES_FADE_MS),
            (&mut self.backdrop_opacity, BACKDROP_FADE_MS),
        ] {
            if t.target() != to || (!t.running && t.value != to) {
                t.to(to, ms, Easing::timing_default());
            }
        }
    }

    /// A scroll event: moves the sheet to the height of the page at the offset.
    fn scrolled(&mut self, at_ms: f64) {
        let x = self.pages.offset;
        if x == self.reported || at_ms - self.reported_at <= THROTTLE_MS {
            return;
        }
        self.reported = x;
        self.reported_at = at_ms;
        if !self.active {
            return;
        }
        let w = self.w as f64;
        let height = interpolate(x, &[0.0, w, 2.0 * w], &PAGES, Extrapolation::Clamp);
        self.scroll_to_y(-height, at_ms);
    }

    fn sheet_top(&self) -> f32 {
        self.h + self.translate_y.value as f32
    }

    /// The pages' bottom in the sheet (the spacer's top), on Yoga's grid; never above their top.
    fn pages_bottom(&self) -> f32 {
        grid(-self.translate_y.value as f32, self.scale).max(PAGES_TOP)
    }

    /// The round button's frame.
    fn round_frame(&self) -> (f32, f32) {
        (
            grid((self.w - ROUND) / 2.0, self.scale),
            grid((self.h - ROUND) / 2.0, self.scale),
        )
    }

    /// Page `i`'s button frame on screen (before its press scale).
    fn pill_frame(&self, i: usize) -> (f32, f32) {
        let s = self.scale;
        let off = ((self.pages.offset as f32) * s).round() / s;
        let fill = self.pages_bottom() - PAGES_TOP;
        let x = i as f32 * self.w + grid((self.w - PILL_W) / 2.0, s) - off;
        let y = self.sheet_top() + PAGES_TOP + grid((fill - PILL_H) / 2.0, s);
        (x, y)
    }

    /// Whether (x, y) is in the pressable `k`'s bounds through its press scale.
    fn on_press(&self, k: usize, x: f32, y: f32) -> bool {
        let ((fx, fy), (bw, bh)) = if k == 0 {
            (self.round_frame(), (ROUND, ROUND))
        } else {
            (self.pill_frame(k - 1), (PILL_W, PILL_H))
        };
        let sc = self.press[k].scale() as f32;
        let (cx, cy) = (fx + bw / 2.0, fy + bh / 2.0);
        (x - cx).abs() <= bw / 2.0 * sc && (y - cy).abs() <= bh / 2.0 * sc
    }

    fn on_sheet(&self, x: f32, y: f32) -> bool {
        let top = self.sheet_top();
        (0.0..=self.w).contains(&x) && y >= top && y < top + self.h
    }

    /// The pages take touches only while they are visible (opacity 0.01 and up).
    fn on_pages(&self, y: f32) -> bool {
        let top = self.sheet_top();
        self.pages_opacity.value >= 0.01 && y >= top + PAGES_TOP && y < top + self.pages_bottom()
    }

    fn pressed(&mut self, k: usize) {
        let now = self.now;
        match k {
            0 => {
                // onPress: close when active, else open on the first page.
                if self.active {
                    self.scroll_to_y(0.0, now);
                } else {
                    self.scroll_to_y(-PAGES[0], now);
                }
            }
            1 | 2 => {
                self.pages.scroll_to((self.w as f64) * k as f64);
                self.driven = true;
            }
            _ => self.scroll_to_y(0.0, now),
        }
    }

    fn press_event(&mut self, k: usize, id: u32, phase: Phase, x: f32, y: f32) {
        let inside = self.on_press(k, x, y);
        if let Some(PressEvent::Press(press)) = self.press[k].pointer(id, phase, inside) {
            self.posted.extend(press.global_message().map(String::from));
            self.pressed(k);
        }
    }

    /// A selection haptic, at most one per HAPTIC_GAP_MS.
    fn selection(&mut self) {
        if self.now - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = self.now;
        }
    }

    /// A selection when the page in view changes under a drag of the pages or its glide.
    fn page_haptic(&mut self) {
        if self.pages.dragging() {
            self.driven = false;
        }
        let w = (self.w as f64).max(1.0);
        let f = self.pages.offset / w;
        let held = (f - self.page as f64).abs() < 0.5 + SWITCH / w;
        let page = f.round().clamp(0.0, 2.0) as i64;
        if page != self.page && (!held || self.driven) {
            self.page = page;
            if !self.driven {
                self.selection();
            }
        }
    }

    fn pan_update(&mut self, p: &Pan) {
        if !self.past_close && p.translation_y > CLOSE_DRAG {
            self.past_close = true;
            self.selection();
        } else if self.past_close && p.translation_y < CLOSE_DRAG - REARM {
            self.past_close = false;
        }
        if p.translation_y > 0.0 {
            let v = (p.translation_y as f64 + self.context).max(50.0 - self.h as f64);
            self.translate_y.set(v);
        }
    }

    fn sheet_finger(&mut self, f: Finger, phase: Phase, x: f32, y: f32, at_ms: f64) {
        let id = f.id;
        let mut f = f;
        let event = if f.owner == Owner::Scroll {
            Event::None
        } else {
            self.pan.event(id, phase, x, y, at_ms, true)
        };
        if f.owner == Owner::Undecided {
            if let Event::Start(p) = event {
                let (dx, dy) = (x - f.down.0, y - f.down.1);
                for k in 0..4 {
                    self.press[k].cancel();
                }
                if f.on_pages && dx.abs() > dy.abs() {
                    f.owner = Owner::Scroll;
                    self.pan.event(id, Phase::Cancel, x, y, at_ms, true);
                } else {
                    f.owner = Owner::Sheet;
                    if f.on_pages {
                        self.pages.input(id, Phase::Cancel, x, y, at_ms, true);
                        f.on_pages = false;
                    }
                    // onStart, then onUpdate with the activating event.
                    self.context = self.translate_y.value;
                    self.past_close = false;
                    self.posted.push("haptic:impact-light".into());
                    self.pan_update(&p);
                }
            }
        } else if f.owner == Owner::Sheet {
            match event {
                Event::Update(p) => self.pan_update(&p),
                Event::End(p) => {
                    let to = if p.translation_y > CLOSE_DRAG {
                        0.0
                    } else {
                        self.context
                    };
                    self.scroll_to_y(to, self.now);
                    if to == 0.0 {
                        self.posted.push("haptic:impact-medium".into());
                    }
                }
                _ => {}
            }
        }
        if f.on_pages && f.owner != Owner::Sheet {
            self.pages.input(id, phase, x, y, at_ms, true);
        }
        if f.owner == Owner::Undecided {
            for k in 1..4 {
                if self.press[k].finger() == Some(id) {
                    self.press_event(k, id, phase, x, y);
                }
            }
        }
        self.finger = if matches!(phase, Phase::Up | Phase::Cancel) {
            None
        } else {
            Some(f)
        };
        self.scrolled(self.now);
    }

    fn prepare(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let s = frame.scale;
        if self
            .gpu
            .as_ref()
            .is_some_and(|g| g.scale == s && g.generation == frame.shader_generation)
        {
            return;
        }
        let Some(font) = self.font.as_ref() else {
            return;
        };
        let (px_w, px_h) = ((PILL_W * s).round(), (PILL_H * s).round());
        let round_px = (ROUND * s).round();
        // The round button: top to bottom. The pills run from bottom left to top right.
        let round = gradient_image(round_px as u32, round_px as u32, (0.5, 0.0), (0.5, 1.0));
        let pill = gradient_image(px_w as u32, px_h as u32, (0.0, 1.0), (1.0, 0.0));
        let gradients = Images::upload(device, queue, &[&round, &pill]);
        let cell = (px_w + 2.0 * GUTTER, px_h + 2.0 * GUTTER);
        let (aw, ah) = (cell.0 as u32, (cell.1 * 3.0) as u32);
        let atlas = Images::target(device, aw, ah);
        let view = atlas.render_view();
        self.layer_renderer.set_images(&gradients);
        let l = &mut self.layer_canvas;
        l.begin(s);
        let g = GUTTER / s;
        // The round button: its gradient clipped to a circle.
        let oy = |cell_i: usize| (GUTTER + cell.1 * cell_i as f32) / s;
        let to_px = |ox: f32, oy: f32| Matrix::translate(-ox, -oy).then(Matrix::scale(s, s));
        let (ox, y0) = (g, oy(CELL_ROUND));
        l.draw_rrect(
            ox,
            y0,
            ROUND,
            ROUND,
            ROUND / 2.0,
            &Paint::image(gradients.image(0), to_px(ox, y0)),
        );
        // The pills and their Text.
        let tside = text_side(gfx::line_height(font), s);
        for (cell_i, title) in [(CELL_NEXT, "Next Page"), (CELL_CLOSE, "Close")] {
            let y0 = oy(cell_i);
            l.draw_rrect(
                ox,
                y0,
                PILL_W,
                PILL_H,
                PILL_H / 2.0,
                &Paint::image(gradients.image(1), to_px(ox, y0)),
            );
            let tw = text_side(font.advance_width(title), s);
            let tx = ox + text_grid((PILL_W - tw) / 2.0, s);
            let ty = y0 + text_grid((PILL_H - tside) / 2.0, s);
            l.draw_text(
                title,
                tx,
                gfx::baseline(font, ty),
                font,
                &Paint::fill(Color::WHITE),
            );
        }
        self.layer_renderer.draw(
            device,
            queue,
            encoder,
            &self.layer_canvas,
            &view,
            wgpu::TextureFormat::Rgba8Unorm,
            aw,
            ah,
            wgpu::Color::TRANSPARENT,
        );
        self.renderer.set_images(&atlas);
        self.gpu = Some(Gpu {
            scale: s,
            generation: frame.shader_generation,
            atlas,
        });
    }

    fn draw(&mut self) {
        let (w, h, s) = (self.w, self.h, self.scale);
        let round = self.round_frame();
        let pills: [(f32, f32); 3] = std::array::from_fn(|i| self.pill_frame(i));
        let top = self.sheet_top();
        let bottom = self.pages_bottom();
        let scales: [f32; 4] = std::array::from_fn(|k| self.press[k].scale() as f32);
        let c = &mut self.canvas;
        c.begin(s);
        c.draw_rect(0.0, 0.0, w, h, &Paint::fill(Color::rgb8(0, 0, 0)));
        let Some(gpu) = self.gpu.as_ref() else { return };
        let atlas = gpu.atlas.image(0);
        let cell_h = (PILL_H * s).round() + 2.0 * GUTTER;
        let composite = |c: &mut Canvas,
                         cell: usize,
                         (x, y): (f32, f32),
                         (bw, bh): (f32, f32),
                         k: f32,
                         opacity: f32| {
            let g = GUTTER / s;
            let (cx, cy) = (x + bw / 2.0, y + bh / 2.0);
            c.save();
            c.translate(cx, cy);
            c.scale(k, k);
            c.translate(-cx, -cy);
            let to = Matrix::translate(-x, -y)
                .then(Matrix::scale(s, s))
                .then(Matrix::translate(GUTTER, GUTTER + cell_h * cell as f32));
            c.draw_rect(
                x - g,
                y - g,
                bw + 2.0 * g,
                bh + 2.0 * g,
                &Paint::image(atlas, to).with_opacity(opacity),
            );
            c.restore();
        };
        composite(c, CELL_ROUND, round, (ROUND, ROUND), scales[0], 1.0);
        let backdrop = self.backdrop_opacity.value as f32;
        if backdrop > 0.0 {
            c.draw_rect(
                0.0,
                0.0,
                w,
                h,
                &Paint::fill(Color::rgba8(255, 255, 255, BACKDROP_ALPHA)).with_opacity(backdrop),
            );
        }
        if top >= h {
            return;
        }
        c.draw_continuous_rrect(
            0.0,
            top,
            w,
            h,
            RADIUS,
            &Paint::fill(Color::view_hex(0x171717)),
        );
        c.draw_rrect(
            grid((w - LINE_W) / 2.0, s),
            top + LINE_TOP,
            LINE_W,
            LINE_H,
            2.0,
            &Paint::fill(Color::view_hex(0x808080)),
        );
        let opacity = self.pages_opacity.value as f32;
        if opacity <= 0.0 || bottom <= PAGES_TOP {
            return;
        }
        c.save();
        c.clip_rect(0.0, top + PAGES_TOP, w, bottom - PAGES_TOP);
        for (i, &(x, y)) in pills.iter().enumerate() {
            if x + PILL_W < 0.0 || x > w {
                continue;
            }
            let cell = if i == 2 { CELL_CLOSE } else { CELL_NEXT };
            composite(c, cell, (x, y), (PILL_W, PILL_H), scales[i + 1], opacity);
        }
        c.restore();
    }
}

impl Surface for Sheet {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let held = self.finger.is_some() || self.press.iter().any(Pressable::is_pressed);
        Some(format!(
            "{{\"active\":{},\"translateY\":{:.2},\"offset\":{:.2},\"pages\":{:.3},\"backdrop\":{:.3},\"held\":{held}}}",
            self.active, self.translate_y.value, self.pages.offset, self.pages_opacity.value, self.backdrop_opacity.value
        ))
    }

    fn max_fps(&self) -> u32 {
        // Only waiting for a scheduled reset: wake at its deadline.
        if self.moving || self.finger.is_some() || self.press.iter().any(Pressable::is_pressed) {
            return 0;
        }
        match self
            .resets
            .iter()
            .cloned()
            .fold(None, |a: Option<f64>, t| Some(a.map_or(t, |a| a.min(t))))
        {
            Some(at) if at - self.drawn_ms > 17.0 => (1000.0 / (at - self.drawn_ms)).ceil() as u32,
            _ => 0,
        }
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
        if self.w <= 0.0 {
            return;
        }
        // An input may start a motion (a lift's spring): the next frames run uncapped.
        self.moving = true;
        let phase = gfx::phase(phase);
        if phase == Phase::Down {
            if self.finger.is_some() || self.press.iter().any(Pressable::is_pressed) {
                return;
            }
            if self.on_sheet(x, y) {
                let on_pages = self.on_pages(y);
                let f = Finger {
                    id,
                    down: (x, y),
                    owner: Owner::Undecided,
                    on_pages,
                };
                if on_pages {
                    for k in 1..4 {
                        if self.on_press(k, x, y) {
                            self.press[k].pointer_down(id, true);
                        }
                    }
                }
                self.sheet_finger(f, phase, x, y, at_ms);
            } else if self.active {
                // The backdrop closes the sheet on touch.
                self.scroll_to_y(0.0, self.now);
            } else if self.on_press(0, x, y) {
                self.press[0].pointer_down(id, true);
            }
            return;
        }
        if let Some(f) = self.finger.filter(|f| f.id == id) {
            self.sheet_finger(f, phase, x, y, at_ms);
        } else if self.press[0].finger() == Some(id) {
            self.press_event(0, id, phase, x, y);
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
        // A scroll between frames starts its spring then, so this frame already moves it.
        let between = if self.now > 0.0 {
            self.now.min(now)
        } else {
            now
        };
        self.now = now;
        self.drawn_ms = now;
        self.sync_layout(frame.width, frame.height, frame.scale);
        let due: Vec<f64> = self.resets.iter().cloned().filter(|&t| t <= now).collect();
        if !due.is_empty() {
            self.resets.retain(|&t| t > now);
            self.pages.scroll_to(0.0);
            self.driven = true;
        }
        let mut moving = self.pages.step(now);
        self.page_haptic();
        self.scrolled(between);
        moving |= self.translate_y.step(now);
        self.sync_fades();
        moving |= self.pages_opacity.step(now);
        moving |= self.backdrop_opacity.step(now);
        for p in self.press.iter_mut() {
            moving |= p.step(now);
        }
        self.prepare(frame, device, queue, encoder);
        self.draw();
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
        self.moving = moving;
        moving || self.finger.is_some() || self.press.iter().any(Pressable::is_pressed)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: W,
            height: H,
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

    fn run(gpu: &exact_gpu::Gpu, s: &mut Box<dyn Surface>, from: f64, to: f64) -> f64 {
        let mut ms = from;
        while ms < to {
            ms += 16.0;
            fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        ms
    }

    fn tap(gpu: &exact_gpu::Gpu, s: &mut Box<dyn Surface>, x: f32, y: f32, ms: f64) -> f64 {
        s.input(&pointer(PointerPhase::Down, x, y, ms));
        let ms = run(gpu, s, ms, ms + 80.0);
        s.input(&pointer(PointerPhase::Up, x, y, ms));
        ms
    }

    /// A drag from (x0, y0) by (dx, dy) over `n` moves 16 ms apart, starting 100 ms after the down.
    fn drag(
        gpu: &exact_gpu::Gpu,
        s: &mut Box<dyn Surface>,
        (x0, y0): (f32, f32),
        (dx, dy): (f32, f32),
        n: usize,
        ms: f64,
    ) -> f64 {
        s.input(&pointer(PointerPhase::Down, x0, y0, ms));
        let mut ms = run(gpu, s, ms, ms + 100.0);
        for k in 1..=n {
            ms += 16.0;
            let f = k as f32 / n as f32;
            s.input(&pointer(PointerPhase::Move, x0 + dx * f, y0 + dy * f, ms));
            fixture::render(gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        s.input(&pointer(PointerPhase::Up, x0 + dx, y0 + dy, ms));
        ms
    }

    fn state(s: &mut Box<dyn Surface>) -> String {
        s.agent("{}").unwrap()
    }

    #[test]
    fn the_pages_size_the_sheet_and_close_it() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let mut ms = run(&gpu, &mut s, 0.0, 100.0);
        // The round button opens the sheet on the first page, with the haptic.
        ms = tap(&gpu, &mut s, 210.0, 456.0, ms);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(
            st.contains("\"active\":true,\"translateY\":-350.00"),
            "{st}"
        );
        let (open, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&open, "scrollable-bottom-sheet-open", [0, 0, 0]);
        // A horizontal drag pages on; the sheet grows to 500 and never follows the finger down.
        ms = drag(&gpu, &mut s, (340.0, 700.0), (-250.0, 25.0), 25, ms);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(
            st.contains("\"translateY\":-500.00,\"offset\":420.00"),
            "{st}"
        );
        // The second page came into view: one selection.
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        // Next Page is the third page, 250 tall.
        ms = tap(&gpu, &mut s, 210.0, 679.0, ms);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(
            st.contains("\"translateY\":-250.00,\"offset\":840.00"),
            "{st}"
        );
        // pressto's selection only: the press's scrollTo plays no page haptic.
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        // A short drag down springs back; one past 100 closes.
        ms = drag(&gpu, &mut s, (210.0, 700.0), (0.0, 60.0), 20, ms);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(
            st.contains("\"active\":true,\"translateY\":-250.00"),
            "{st}"
        );
        // The grab; nothing as it springs back.
        assert_eq!(s.messages(), vec!["haptic:impact-light"]);
        ms = drag(&gpu, &mut s, (210.0, 700.0), (0.0, 150.0), 20, ms);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(
            st.contains("\"active\":false,\"translateY\":0.00,\"offset\":0.00"),
            "{st}"
        );
        // The grab, the close line crossed, the close; the reset's scroll back plays none.
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:selection", "haptic:impact-medium"]);
        // The button reopens it on the first page; the backdrop closes it.
        ms = tap(&gpu, &mut s, 210.0, 456.0, ms);
        ms = run(&gpu, &mut s, ms, ms + 1500.0);
        assert!(state(&mut s).contains("\"translateY\":-350.00"));
        ms = tap(&gpu, &mut s, 210.0, 200.0, ms);
        run(&gpu, &mut s, ms, ms + 1500.0);
        let st = state(&mut s);
        assert!(st.contains("\"active\":false,\"translateY\":0.00"), "{st}");
    }
}
