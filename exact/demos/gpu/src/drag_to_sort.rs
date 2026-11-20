//! Nine habit rows on a scrolling list; a row held for 250 ms lifts and follows the finger while
//! the others slide into the order its position makes.
//!
//! - A move past 10 pt before the long press fails it and the list scrolls instead.
//! - The list scrolls while the held row is dragged near its top or bottom edge.
//! - Lift: the row scales to 1.05 about its centre and casts a soft shadow, and the rest of the
//!   list fades under a white veil, all on one `lift` spring (200 ms up, a 350 ms spring back).
//! - Haptics: light on lift, soft on drop.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::Phase;
use motion::{Easing, Spring, Timing};
use draw2d::{point, stops, Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

const COUNT: usize = 9;
const PADDING: f64 = 6.0;
const HEIGHT: f64 = 80.0;
const ITEM: f64 = HEIGHT + PADDING * 2.0;
const MAX_RADIUS: f64 = 10.0;
/// Height of the demo button row above the list, pt.
const BUTTON_ROW: f64 = 56.0;
/// How long a finger holds a row before it lifts, ms: short enough to feel immediate.
const LONG_PRESS_MS: f64 = 250.0;
/// Extra scale of the lifted row, and how far its shadow drops (pt).
const LIFT_SCALE: f64 = 0.05;
const LIFT_DROP: f32 = 8.0;
/// The shadow's opacity, the blur radius it imitates (σ = blur / 2), and its ring count.
const SHADOW_ALPHA: f64 = 0.18;
const SHADOW_BLUR: f64 = 16.0;
const SHADOW_RINGS: usize = 14;
/// The white veil over the rest of the list at full lift.
const VEIL: f32 = 0.35;

/// The shadow's rings, outermost first: (spread past the card's edge, alpha). Painted over one
/// another, a point `d` past the edge is covered by the rings reaching it, and their alphas
/// compose to SHADOW_ALPHA × (1 − Φ(d / σ)): a Gaussian-blurred edge, from fixed shapes.
fn shadow_rings() -> [(f32, f32); SHADOW_RINGS] {
    let sigma = SHADOW_BLUR / 2.0;
    // Normal CDF (Abramowitz-Stegun 7.1.26).
    let phi = |x: f64| {
        let z = x.abs() / std::f64::consts::SQRT_2;
        let t = 1.0 / (1.0 + 0.3275911 * z);
        let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * (-z * z).exp();
        0.5 * (1.0 + if x < 0.0 { -y } else { y })
    };
    let target = |d: f64| SHADOW_ALPHA * (1.0 - phi(d / sigma));
    let (outer, inner) = (2.5 * sigma, -sigma);
    let mut out = [(0.0f32, 0.0f32); SHADOW_RINGS];
    let mut covered = 0.0;
    for (k, ring) in out.iter_mut().enumerate() {
        let d = outer + (inner - outer) * k as f64 / (SHADOW_RINGS - 1) as f64;
        let want = target(d);
        let a = 1.0 - (1.0 - want) / (1.0 - covered);
        covered = want;
        *ring = (d as f32, a.max(0.0) as f32);
    }
    out
}

/// A habit row: title, which of the five squares are on, icon colour and square colour (rgb, alpha).
struct Habit {
    title: &'static str,
    active: [bool; 5],
    color: (u32, f32),
    square: (u32, f32),
}

const HABITS: [Habit; COUNT] = [
    Habit {
        title: "Meditation",
        active: [true, false, false, true, false],
        color: (0xEE82EE, 0.2),
        square: (0xEE82EE, 0.5),
    },
    Habit {
        title: "Coding",
        active: [true, false, true, true, false],
        color: (0x0000FF, 0.2),
        square: (0x0000FF, 0.3),
    },
    Habit {
        title: "Workout",
        active: [true, true, true, true, false],
        color: (0x006900, 0.2),
        square: (0x006900, 0.3),
    },
    Habit {
        title: "Reading",
        active: [true, true, false, true, true],
        color: (0xFF0000, 0.2),
        square: (0xFF0000, 0.2),
    },
    Habit {
        title: "Sleep",
        active: [true, true, true, true, true],
        color: (0x00C8D2, 0.2),
        square: (0x00C8D2, 0.4),
    },
    Habit {
        title: "Eat healthy",
        active: [true, true, true, true, true],
        color: (0xFF9600, 0.2),
        square: (0xFF9600, 0.5),
    },
    Habit {
        title: "Drink water",
        active: [true, true, true, true, true],
        color: (0x006400, 0.2),
        square: (0x006400, 0.4),
    },
    Habit {
        title: "Walk",
        active: [true, false, true, false, true],
        color: (0x000064, 0.2),
        square: (0x000064, 0.4),
    },
    Habit {
        title: "Playing Piano",
        active: [true, false, true, true, true],
        color: (0x0000C8, 0.2),
        square: (0x0000C8, 0.4),
    },
];

/// The emoji images, 76 x 70 px, premultiplied RGBA, zlib-compressed.
static EMOJI: [&[u8]; COUNT] = [
    include_bytes!("../images/drag-to-sort/emoji-0-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-1-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-2-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-3-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-4-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-5-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-6-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-7-76x70.rgba.zlib"),
    include_bytes!("../images/drag-to-sort/emoji-8-76x70.rgba.zlib"),
];
const EMOJI_PX: (u32, u32) = (76, 70);

fn emoji(i: usize) -> draw2d::Image {
    let (w, h) = EMOJI_PX;
    let pixels = miniz_oxide::inflate::decompress_to_vec_zlib(EMOJI[i]).unwrap_or_default();
    if pixels.len() != (w * h * 4) as usize {
        return draw2d::Image {
            width: 1,
            height: 1,
            pixels: vec![0, 0, 0, 0],
        };
    }
    draw2d::Image {
        width: w,
        height: h,
        pixels,
    }
}

/// Layout rounding to the pixel grid: a view edge (half up), a text offset (floor), a text side (ceil).
fn grid(v: f64, s: f64) -> f64 {
    (v * s + 0.5 + 1e-4).floor() / s
}
fn text_grid(v: f64, s: f64) -> f64 {
    (v * s + 1e-4).floor() / s
}
fn text_side(v: f64, s: f64) -> f64 {
    ((v * s + 1e-4).floor() + 1.0) / s
}

fn view_rgba(c: (u32, f32)) -> Color {
    Color::view_hex(c.0).alpha(c.1)
}

/// A finger on a row, waiting for the long press.
#[derive(Clone, Copy)]
struct Hold {
    id: u32,
    index: usize,
    down: (f64, f64),
    at: f64,
}

/// The demo's surface; input 0 is safeTop.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sort {
        scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
        safe_top: 0.0,
        positions: std::array::from_fn(|i| i as f64 * ITEM),
        top: std::array::from_fn(|i| Timing::at(i as f64 * ITEM)),
        radius: std::array::from_fn(|_| Timing::at(5.0)),
        translate_x: std::array::from_fn(|_| Timing::at(0.0)),
        lift: [Spring::at(0.0); COUNT],
        order_top: None,
        active: None,
        last_active: None,
        hold: None,
        drag: None,
        size: (0.0, 0.0),
        fonts: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        images: None,
        posted: Vec::new(),
    })
}

struct Sort {
    scroll: UiScroll,
    safe_top: f64,
    positions: [f64; COUNT],
    top: [Timing; COUNT],
    radius: [Timing; COUNT],
    translate_x: [Timing; COUNT],
    /// 0 at rest, 1 lifted (the scale and the shadow).
    lift: [Spring; COUNT],
    /// The row drawn last (the veil goes under it).
    order_top: Option<usize>,
    active: Option<usize>,
    last_active: Option<usize>,
    hold: Option<Hold>,
    /// The active drag: its finger, its down point, contextY.
    drag: Option<(u32, (f64, f64), f64)>,
    size: (f64, f64),
    fonts: Option<(Font, Font)>,
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
    posted: Vec<String>,
}

impl Sort {
    /// Where the content container's top is on screen.
    fn content_top(&self) -> f64 {
        self.safe_top + BUTTON_ROW - self.scroll.offset
    }

    fn z(&self, i: usize) -> i32 {
        if self.active == Some(i) {
            100
        } else if self.last_active == Some(i) {
            50
        } else {
            0
        }
    }

    /// Rows in drawing order (the dragged row last).
    fn order(&self) -> Vec<usize> {
        let mut o: Vec<usize> = (0..COUNT).collect();
        o.sort_by_key(|&i| (self.z(i), i));
        o
    }

    /// The row under a window point (the topmost).
    fn row_at(&self, x: f64, y: f64) -> Option<usize> {
        let top = self.content_top();
        self.order().into_iter().rev().find(|&i| {
            let ty = top + self.top[i].value;
            let tx = self.translate_x[i].value;
            (ty..ty + ITEM).contains(&y) && (tx..tx + self.size.0).contains(&x)
        })
    }

    /// Every row but the dragged one takes its rank x 92, and its `top` animates there when that changes.
    fn settle(&mut self) {
        for _ in 0..COUNT * 2 {
            let mut changed = false;
            for i in 0..COUNT {
                if self.active == Some(i) {
                    continue;
                }
                let mut sorted = self.positions;
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let rank = sorted
                    .iter()
                    .position(|&p| p == self.positions[i])
                    .unwrap_or(i);
                let next = rank as f64 * ITEM;
                if self.positions[i] != next {
                    self.positions[i] = next;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        for i in 0..COUNT {
            if self.active == Some(i) {
                continue;
            }
            let next = self.positions[i];
            if self.top[i].target() != next {
                self.top[i].to(next, 200.0, Easing::timing_default());
            }
        }
    }

    fn activate(&mut self, hold: Hold, finger: (f64, f64)) {
        let i = hold.index;
        self.active = Some(i);
        self.last_active = Some(i);
        let context = self.positions[i] - self.scroll.offset;
        self.drag = Some((hold.id, hold.down, context));
        self.translate_x[i] = Timing::at(finger.0 - hold.down.0);
        self.top[i] = Timing::at(self.positions[i]);
        self.radius[i].to(MAX_RADIUS, 300.0, Easing::timing_default());
        gfx::spring_to(&mut self.lift[i], 1.0, 200.0, 1.0);
        self.posted.push("haptic:impact-light".into());
    }

    fn update(&mut self, x: f64, y: f64) {
        let Some((_, down, context)) = self.drag else {
            return;
        };
        let Some(i) = self.active else { return };
        self.translate_x[i] = Timing::at(x - down.0);
        self.positions[i] = context + (y - down.1) + self.scroll.offset;
        self.top[i] = Timing::at(self.positions[i]);
        // Edge scrolling: near the top or bottom the list scrolls.
        let speed = ITEM * 0.1;
        if y <= 1.5 * ITEM {
            self.scroll.offset = (self.scroll.offset - speed).max(0.0);
        } else if y >= self.size.1 - self.safe_top {
            self.scroll.offset = (self.scroll.offset + speed).max(0.0);
        }
        self.settle();
    }

    fn release(&mut self) {
        if let Some(i) = self.active.take() {
            self.translate_x[i].to(0.0, 300.0, Easing::timing_default());
            self.radius[i].to(5.0, 300.0, Easing::timing_default());
            self.top[i] = Timing::at(self.positions[i]);
            gfx::spring_to(&mut self.lift[i], 0.0, 350.0, 0.7);
            self.posted.push("haptic:impact-soft".into());
        }
        self.drag = None;
        self.settle();
    }

    fn draw(&mut self, scale: f64) {
        let (w, _) = self.size;
        let content = self.content_top();
        let order = self.order();
        self.order_top = order.last().copied();
        let c = &mut self.canvas;
        c.begin(scale as f32);
        c.draw_rect(
            0.0,
            0.0,
            w as f32,
            self.size.1 as f32,
            &Paint::fill(Color::WHITE),
        );
        // The slot backgrounds, fixed at each index.
        for i in 0..COUNT {
            let y = grid(content + i as f64 * ITEM + PADDING, scale);
            c.draw_continuous_rrect(
                PADDING as f32,
                y as f32,
                (w - 2.0 * PADDING) as f32,
                HEIGHT as f32,
                MAX_RADIUS as f32,
                &Paint::fill(Color::BLACK.alpha(0.1)),
            );
        }
        let half = (w - 2.0 * PADDING - 20.0) / 2.0;
        for i in order {
            let h = &HABITS[i];
            let (dx, dy) = (self.translate_x[i].value, content + self.top[i].value);
            c.save();
            c.translate(dx as f32, dy as f32);
            // The card sits PADDING in from its slot.
            let (x0, y0) = (PADDING, PADDING);
            // The lift: a shadow of fixed rings under the card, then the card scaled about its centre.
            let lift = self.lift[i].value.max(0.0) as f32;
            if lift > 0.001 {
                // The rest of the list under a veil, the lifted row above it.
                if self.order_top == Some(i) {
                    c.save();
                    c.translate(-dx as f32, -dy as f32);
                    c.draw_rect(0.0, 0.0, w as f32, self.size.1 as f32, &Paint::fill(Color::WHITE.alpha(VEIL * lift.min(1.0))));
                    c.restore();
                }
                let (cw, chh) = ((w - 2.0 * PADDING) as f32, HEIGHT as f32);
                let s = 1.0 + (LIFT_SCALE as f32) * lift;
                let (sw, sh) = (cw * s, chh * s);
                let (sx, sy) = (x0 as f32 + (cw - sw) / 2.0, y0 as f32 + (chh - sh) / 2.0 + LIFT_DROP * lift);
                for (spread, a) in shadow_rings() {
                    let r = (MAX_RADIUS as f32 * s + spread).max(0.0);
                    c.draw_continuous_rrect(
                        sx - spread,
                        sy - spread,
                        sw + 2.0 * spread,
                        sh + 2.0 * spread,
                        r.min((sh + 2.0 * spread) / 2.0),
                        &Paint::fill(Color::BLACK.alpha(a * lift.min(1.0))),
                    );
                }
            }
            let s = 1.0 + (LIFT_SCALE * self.lift[i].value) as f32;
            let (ccx, ccy) = ((x0 + (w - 2.0 * PADDING) / 2.0) as f32, (y0 + HEIGHT / 2.0) as f32);
            c.concat(Matrix::translate(-ccx, -ccy).then(Matrix::scale(s, s)).then(Matrix::translate(ccx, ccy)));
            c.draw_rrect(
                x0 as f32,
                y0 as f32,
                (w - 2.0 * PADDING) as f32,
                HEIGHT as f32,
                self.radius[i].value as f32,
                &Paint::fill(Color::WHITE),
            );
            let left = x0 + 10.0;
            let icon = 44.0;
            let icon_top = y0 + grid((HEIGHT - icon) / 2.0, scale);
            c.draw_circle(
                (left + icon / 2.0) as f32,
                (icon_top + icon / 2.0) as f32,
                (icon / 2.0) as f32,
                &Paint::fill(view_rgba(h.color)),
            );
            if let Some(images) = self.images.as_ref() {
                let img = images.image(i);
                let (bw, bh) = (img.width as f64 / 3.0, img.height as f64 / 3.0);
                let (ex, ey) = (
                    left + text_grid((icon - bw) / 2.0, scale),
                    icon_top + text_grid((icon - bh) / 2.0, scale),
                );
                let to = Matrix::translate(-ex as f32, -ey as f32).then(Matrix::scale(3.0, 3.0));
                c.draw_rect(
                    ex as f32,
                    ey as f32,
                    bw as f32,
                    bh as f32,
                    &Paint::image(img, to),
                );
            }
            if let Some((title, subtitle)) = self.fonts.as_ref() {
                let (th, sh) = (
                    text_side(gfx::line_height(title) as f64, scale),
                    text_side(gfx::line_height(subtitle) as f64, scale),
                );
                let block = th + 5.0 + sh;
                let tx = left + icon + 12.0;
                let ty = y0 + grid((HEIGHT - block) / 2.0, scale);
                c.draw_text(
                    h.title,
                    tx as f32,
                    gfx::baseline(title, ty as f32),
                    title,
                    &Paint::fill(Color::BLACK),
                );
                let sy = ty + text_grid(th + 5.0, scale);
                c.draw_text(
                    "Every day",
                    tx as f32,
                    gfx::baseline(subtitle, sy as f32),
                    subtitle,
                    &Paint::fill(Color::view_hex(0x808080)),
                );
            }
            // Five 25 pt squares spaced evenly.
            let gap = (half - 5.0 * 25.0) / 5.0;
            let sx0 = left + half;
            for (k, &on) in h.active.iter().enumerate() {
                let sx = sx0 + grid(gap / 2.0 + k as f64 * (25.0 + gap), scale);
                let sy = y0 + grid((HEIGHT - 25.0) / 2.0, scale);
                let s = if on { 1.0 } else { 0.3 };
                let (cx, cy) = ((sx + 12.5) as f32, (sy + 12.5) as f32);
                c.save();
                c.concat(
                    Matrix::translate(-cx, -cy)
                        .then(Matrix::scale(s, s))
                        .then(Matrix::translate(cx, cy)),
                );
                let paint =
                    Paint::fill(view_rgba(h.square)).with_opacity(if on { 1.0 } else { 0.6 });
                c.draw_continuous_rrect(sx as f32, sy as f32, 25.0, 25.0, 10.0, &paint);
                c.restore();
            }
            c.restore();
        }
        // A fade from the top edge over the list.
        let gh = (self.safe_top * 3.0) as f32;
        if gh > 0.0 {
            let g = Shader::Linear {
                start: point(0.0, 0.0),
                end: point(0.0, gh),
                stops: stops(&[
                    Color::WHITE,
                    Color::WHITE.alpha(0.05),
                    Color::WHITE.alpha(0.025),
                ]),
            };
            c.draw_rect(0.0, 0.0, w as f32, gh, &Paint::shader(g));
        }
    }
}

impl Surface for Sort {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.safe_top = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let mut order: Vec<usize> = (0..COUNT).collect();
        order.sort_by(|&a, &b| self.positions[a].partial_cmp(&self.positions[b]).unwrap());
        let order: Vec<String> = order.iter().map(|i| i.to_string()).collect();
        Some(format!(
            "{{\"order\":[{}],\"active\":{},\"contentOffset\":{:.2}}}",
            order.join(","),
            self.active.map_or(-1, |i| i as i64),
            self.scroll.offset
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
        let phase = gfx::phase(phase);
        let (px, py) = (x as f64, y as f64);
        if let Some((finger, _, _)) = self.drag {
            if finger == id {
                match phase {
                    Phase::Move => self.update(px, py),
                    Phase::Up | Phase::Cancel => self.release(),
                    Phase::Down => {}
                }
            }
            return;
        }
        match phase {
            Phase::Down if self.hold.is_none() => {
                if let Some(index) = self.row_at(px, py) {
                    self.hold = Some(Hold {
                        id,
                        index,
                        down: (px, py),
                        at: at_ms,
                    });
                }
            }
            Phase::Move => {
                if let Some(h) = self.hold {
                    if h.id == id && ((px - h.down.0).powi(2) + (py - h.down.1).powi(2)) > 100.0 {
                        self.hold = None;
                    }
                }
            }
            Phase::Up | Phase::Cancel => {
                if self.hold.is_some_and(|h| h.id == id) {
                    self.hold = None;
                }
            }
            _ => {}
        }
        // The list scrolls vertically: its pan takes the axes swapped.
        self.scroll.input(id, phase, y, x, at_ms, true);
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
        let (w, h, scale) = (frame.width as f64, frame.height as f64, frame.scale as f64);
        if self.size != (w, h) {
            self.size = (w, h);
            self.scroll.port = h;
        }
        self.scroll.max =
            (self.safe_top + BUTTON_ROW + COUNT as f64 * ITEM + 2.0 * ITEM - h).max(0.0);
        if self.fonts.is_none() {
            self.fonts = draw2d::match_ui_font(16.0, 700.0).zip(draw2d::match_ui_font(14.0, 400.0));
        }
        if self.images.is_none() {
            let decoded: Vec<draw2d::Image> = (0..COUNT).map(emoji).collect();
            let refs: Vec<&draw2d::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let now = frame.now_ms;
        if let Some(hold) = self.hold {
            if now - hold.at >= LONG_PRESS_MS && !self.scroll.dragging() {
                self.hold = None;
                // The drag takes the touch: the list's own pan is cancelled.
                self.scroll.input(
                    hold.id,
                    Phase::Cancel,
                    hold.down.1 as f32,
                    hold.down.0 as f32,
                    now,
                    true,
                );
                self.activate(hold, hold.down);
            }
        }
        let mut moving = self.scroll.step(now) || self.hold.is_some() || self.drag.is_some();
        for i in 0..COUNT {
            moving |= self.top[i].step(now)
                | self.radius[i].step(now)
                | self.translate_x[i].step(now)
                | self.lift[i].step(now);
        }
        self.draw(scale);
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
            wgpu::Color::WHITE,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_held_row_lifts_and_reorders_the_list() {
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
        let touch = |phase, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x: 200.0,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0)], None).unwrap();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("drag-to-sort-rest");
        // Held 250 ms, row 0 lifts.
        let mut ms = 100.0;
        s.input(&touch(PointerPhase::Down, 170.0, ms));
        while ms < 620.0 {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 16.7;
        }
        assert_eq!(s.messages(), vec!["haptic:impact-light".to_string()]);
        // The lift settles: row 0 over a veiled list.
        let mut held = ms;
        while held < ms + 250.0 {
            fixture::render(&gpu, s.as_mut(), &frame(held)).unwrap();
            held += 16.7;
        }
        let (lifted, _) = fixture::render(&gpu, s.as_mut(), &frame(held)).unwrap();
        lifted.save("drag-to-sort-lifted");
        // Just under the lifted card: grey shadow on white.
        let under = lifted.at(3 * 210, 3 * 218);
        assert!(under[0] < 235 && under[0] > 150, "shadow {under:?}");
        // The neighbours veiled: row 1's dark title is lighter than black.
        let mut darkest = 255;
        for x in 72..126 {
            for y in 230..260 {
                darkest = darkest.min(lifted.at(3 * x, 3 * y)[0]);
            }
        }
        assert!(darkest > 60 && darkest < 140, "veiled title {darkest}");
        // Down past rows 1 and 2.
        for k in 1..=20 {
            ms += 16.7;
            s.input(&touch(PointerPhase::Move, 170.0 + 10.0 * k as f32, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(
            s.agent("{}").unwrap().starts_with("{\"order\":[1,2,0,3"),
            "{}",
            s.agent("{}").unwrap()
        );
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("drag-to-sort-drag");
        // Lifted: the shadow darkens the white just under the held row (row 0, now at y ≈ 370).
        let under = img.at(2 * 210, 2 * (370 - 30 + 92 - 6 + 4));
        assert!(under[0] < 250, "{under:?}");
        s.input(&touch(PointerPhase::Up, 370.0, ms));
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 5000.0 {
            ms += 16.7;
        }
        assert_eq!(
            s.agent("{}").unwrap(),
            "{\"order\":[1,2,0,3,4,5,6,7,8],\"active\":-1,\"contentOffset\":0.00}"
        );
        // The drop: a soft impact, and the lift settled back to rest.
        assert_eq!(s.messages(), vec!["haptic:impact-soft".to_string()]);
        // A quick drag scrolls the list instead.
        s.input(&touch(PointerPhase::Down, 600.0, ms));
        for k in 1..=10 {
            ms += 16.7;
            s.input(&touch(PointerPhase::Move, 600.0 - 15.0 * k as f32, ms));
        }
        s.input(&touch(PointerPhase::Up, 450.0, ms + 300.0));
        assert!(s.messages().is_empty());
        let a = s.agent("{}").unwrap();
        assert!(!a.ends_with("\"contentOffset\":0.00}"), "{a}");
    }
}
