//! Four metal cards (Metal, Silver, Gold, Platinum) in a horizontally snapping list on a #111
//! background. Each card is tilted 18 degrees and turns about y as it scrolls away from the centre.
//!
//! - One analytic pass (card_shader_reflections_compose.wgsl) draws every visible card per pixel:
//!   brushed or anodised metal under softboxes, an anisotropic highlight, a Fresnel bevel, a
//!   thin-film hologram, an engraved chip, contactless mark and title, grain, and an analytic shadow.
//! - The chip, the four titles and the shadow are recorded once into an atlas; the brushing noise
//!   is a 256 x 256 tile made once (`noise_tile`).
//! - The lights stay in the room: each card's frame there is the phone's turn (Core Motion
//!   attitude, clamped, scaled by ATTITUDE_GAIN, smoothed on ATTITUDE_SPRING) x the 18 degree roll
//!   x the scroll's turn x the finger's tilt, so tilting the phone sweeps the highlights.
//! - A finger dragging the list tilts the centred card about x toward the finger (up to MAX_TILT
//!   at its top or bottom edge) and settles back on release; a tap (within TAP_SLOP) does nothing.
//! - A sensor sample that moves the smoothed target less than ATTITUDE_DEADBAND asks for no frame,
//!   so a phone at rest leaves the screen at rest. No haptics, no timers.
//! - Cards paint in index order and show their back faces mirrored.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, SensorKind, Surface, SurfaceError, Value};
use gestures::Phase;
use motion::{interpolate_clamp, Spring, SpringConfig};
use draw2d::{add_continuous_rrect, add_rect, add_rrect, continuous_rrect_path, Canvas, Color, Font, Matrix4, Paint, Renderer};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::card_shader_reflections_compose::{entry, module, Uniforms, ATLAS, GROUP_0, SMP, TILE, U};

/// Each card's shader type and title, in list order.
const CARDS: [(f32, &str); 4] = [(3.0, "Metal"), (0.0, "Silver"), (1.0, "Gold"), (2.0, "Platinum")];
/// Gap around the cards, pt.
const SPACING: f32 = 20.0;
/// Padding between a card's slot and its face, pt.
const VIEW_PADDING: f32 = 16.0;
/// The card's inner padding and corner radius, pt.
const CARD_PADDING: f32 = SPACING * 1.5;
const CARD_RADIUS: f32 = 20.0;
/// The base tilt, degrees, and the perspective distance, pt.
const TILT_DEG: f32 = 18.0;
const PERSPECTIVE: f32 = 1200.0;
/// The card shadow: y offset, σ (half the 20 pt blur), alpha, and the padding of its mask region.
const SHADOW_DY: f32 = 10.0;
const SHADOW_SIGMA: f32 = 10.0;
const SHADOW_ALPHA: f32 = 0.3;
const SHADOW_PAD: f32 = 2.0 * (20.0 + 1.0);
/// Opacity of the chip and title over the card.
const CONTENT_OPACITY: f32 = 0.7;
/// The chip's border, radius and padding, the contact grid's padding, row height and contact widths (fractions).
const CHIP_BORDER: f32 = 0.5;
const CHIP_RADIUS: f32 = 4.0;
const CHIP_PADDING: f32 = 2.0;
const GRID_PADDING: f32 = 2.0;
const ROW_HEIGHT: f32 = 0.28;
const SMALL: f32 = 0.25;
const LARGE: f32 = 0.65;
const CONTACT_BORDER: f32 = 0.5;
/// The rotated title's placement, size, weight, letter spacing and opacity.
const TITLE_LEFT: f32 = SPACING;
const TITLE_BOTTOM: f32 = SPACING;
const TITLE_BOX: f32 = 40.0;
const TITLE_DX: f32 = -20.0;
const TITLE_DY: f32 = 10.0;
const TITLE_SIZE: f32 = 16.0;
const TITLE_WEIGHT: f32 = 700.0;
const LETTER_SPACING: f32 = -1.0;
const TITLE_OPACITY: f32 = 0.9;
/// Transparent device pixels between the atlas's regions.
const GAP: u32 = 4;
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// The finger's tilt at the card's top or bottom edge, radians (8 degrees).
const MAX_TILT: f64 = 8.0 * std::f64::consts::PI / 180.0;
/// A finger that stays within this many points of where it landed is a tap: it moves nothing.
const TAP_SLOP: f32 = 8.0;
/// The tilt's spring: quick to follow, a small overshoot on the settle.
const TILT_SPRING: SpringConfig = SpringConfig { stiffness: 260.0, damping: 20.0, mass: 1.0 };
/// The phone's pitch and roll that move the light, each clamped to +-25 degrees (radians).
const ATTITUDE_RANGE: f64 = 25.0 * std::f64::consts::PI / 180.0;
/// How much of the phone's turn the light sees: half, so a hand's sway shades instead of flickering.
const ATTITUDE_GAIN: f64 = 0.5;
/// Attitude smoothing: critically damped, settled in about 0.5 s.
const ATTITUDE_SPRING: SpringConfig = SpringConfig { stiffness: 100.0, damping: 20.0, mass: 1.0 };
/// A sample that moves a target less than this (radians) is a hand's tremor: no frame.
const ATTITUDE_DEADBAND: f64 = 0.002;
/// The noise tile's side, texels.
const TILE_SIDE: u32 = 256;
/// The shadow's push in the card's plane per unit of sin(turn) and sin(tilt), pt.
const SHADOW_TURN: f32 = 10.0;
const SHADOW_TILT: f32 = 14.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(CardShaderReflections {
        layout: Layout::default(),
        scroll: UiScroll::new(0.0, 0.0, 0.0, FAST, Snap::Free),
        font: None,
        atlas: Canvas::default(),
        renderer: Renderer::default(),
        gpu: None,
        tilt: Spring::at(0.0),
        finger: None,
        down: (0.0, 0.0),
        dragging: false,
        pitch: Spring::at(0.0),
        roll: Spring::at(0.0),
        changed: true,
    })
}

/// Rounds an edge to the device-pixel grid (half up).
fn grid(v: f32, s: f32) -> f32 {
    ((v * s + 0.5 + 1e-4).floor()) / s
}

/// Rounds a text edge down to the device-pixel grid.
fn grid_floor(v: f32, s: f32) -> f32 {
    ((v * s + 1e-4).floor()) / s
}

/// The screen's layout for a window `w × h` at `s` device pixels per point.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f32,
    h: f32,
    s: f32,
    /// Card width and height.
    cw: f32,
    ch: f32,
    /// The list's top and bottom (rounded).
    list: (f32, f32),
    /// Card 0's slot: left (in the scroll content), top, width, height (rounded).
    view: [f32; 4],
    /// The card's face in its slot: left, top, width, height.
    card: [f32; 4],
    /// The card's absolute (unrounded) top-left, for its children's rounding.
    card_abs: (f32, f32),
}

impl Layout {
    fn new(w: f32, h: f32, s: f32) -> Layout {
        let cw = (w * 0.7).round();
        let ch = (cw * 1.58).round();
        let list_h = ch * 1.2;
        let list_top = (h - list_h) / 2.0;
        let pad = (w - cw) / 2.0;
        // Card i's container starts at (pad + i * cw, list top); its slot sits below SPACING.
        let (ax, ay) = (pad, list_top + SPACING);
        let (vx, vy) = (grid(ax, s), grid(ay, s));
        let view = [vx, vy, grid(ax + cw, s) - vx, grid(ay + ch, s) - vy];
        let (cx, cy) = (ax + VIEW_PADDING, ay + VIEW_PADDING);
        let card = [
            grid(cx, s) - vx,
            grid(cy, s) - vy,
            grid(ax + cw - VIEW_PADDING, s) - grid(cx, s),
            grid(ay + ch - VIEW_PADDING, s) - grid(cy, s),
        ];
        Layout { w, h, s, cw, ch, list: (grid(list_top, s), grid(list_top + list_h, s)), view, card, card_abs: (cx, cy) }
    }

    /// An edge `v` points right of the card's unrounded left, in the card's rounded coordinates.
    fn gx(&self, v: f32) -> f32 {
        grid(self.card_abs.0 + v, self.s) - grid(self.card_abs.0, self.s)
    }
    fn gy(&self, v: f32) -> f32 {
        grid(self.card_abs.1 + v, self.s) - grid(self.card_abs.1, self.s)
    }

    /// The shadow's padded region in the card's points: left, top, width, height.
    fn shadow(&self) -> [f32; 4] {
        let [_, _, w, h] = self.card;
        [-SHADOW_PAD, SHADOW_DY - SHADOW_PAD, w + 2.0 * SHADOW_PAD, h + 2.0 * SHADOW_PAD]
    }

    /// The chip's box in the card: left, top, right, bottom (rounded).
    fn chip(&self) -> [f32; 4] {
        let (l, t) = (CARD_PADDING, CARD_PADDING);
        [self.gx(l), self.gy(t), self.gx(l + self.cw * 0.15), self.gy(t + self.cw * 0.12)]
    }

    /// The overlay slot: the chip and the title live in x < this, the whole card's height.
    fn slot_width(&self) -> f32 {
        (CARD_PADDING + self.cw * 0.15 + 2.0).ceil().max(TITLE_LEFT + CARD_PADDING + TITLE_BOX)
    }

    /// Where the chip's alpha gives way to the title's (a y between them).
    fn split(&self) -> f32 {
        self.chip()[3] + 8.0
    }

    /// The atlas: the shadow's region at (0, 0), then the four overlay slots; in device pixels:
    /// (width, height), the shadow's size, the slot's width, each slot's left.
    fn atlas(&self) -> ((u32, u32), (u32, u32), u32, [u32; 4]) {
        let s = self.s;
        let sh = self.shadow();
        let shadow = ((sh[2] * s).ceil() as u32, (sh[3] * s).ceil() as u32);
        let slot = (self.slot_width() * s).ceil() as u32;
        let lefts = std::array::from_fn(|k| shadow.0 + GAP + k as u32 * (slot + GAP));
        let height = shadow.1.max((self.card[3] * s).ceil() as u32);
        ((lefts[3] + slot + GAP, height), shadow, slot, lefts)
    }
}

/// One card's animated values at `scroll_x`.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Pose {
    rotate_y_deg: f64,
    translate_y: f64,
    opacity: f64,
    chip: f64,
    title: f64,
    /// The shader's `rotate`, radians.
    rotate: f32,
    /// How centred the card is (1 centred, 0 a card away): its share of the tilt.
    near: f64,
}

fn pose(index: usize, scroll_x: f64, cw: f64) -> Pose {
    let i = index as f64;
    let input = [(i - 1.0) * cw, i * cw, (i + 1.0) * cw];
    let full = [(i - 1.0) * cw, (i - 0.5) * cw, i * cw, (i + 0.5) * cw, (i + 1.0) * cw];
    let pi = std::f64::consts::PI;
    Pose {
        rotate_y_deg: interpolate_clamp(scroll_x, &input, &[180.0, 0.0, -180.0]),
        translate_y: interpolate_clamp(scroll_x, &full, &[0.0, -6.0, 0.0, -6.0, 0.0]),
        opacity: interpolate_clamp(scroll_x, &input, &[0.5, 1.0, 0.5]),
        chip: interpolate_clamp(scroll_x, &input, &[0.2, 0.6, 0.2]),
        // Rounds half up.
        title: (interpolate_clamp(scroll_x, &input, &[0.0, 1.0, 0.0]) + 0.5).floor(),
        rotate: interpolate_clamp(scroll_x, &input, &[-pi, 0.0, pi]) as f32,
        near: (1.0 - (scroll_x / cw - i).abs()).max(0.0),
    }
}

struct CardShaderReflections {
    layout: Layout,
    scroll: UiScroll,
    font: Option<Option<Font>>,
    atlas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
    /// The finger's tilt about x (radians), on TILT_SPRING.
    tilt: Spring,
    /// The finger holding the list, where it landed, and whether it has left TAP_SLOP.
    finger: Option<u32>,
    down: (f32, f32),
    dragging: bool,
    /// The phone's CMAttitude pitch and roll (radians, clamped), on ATTITUDE_SPRING.
    pitch: Spring,
    roll: Spring,
    /// Whether the last input changed what the screen shows.
    changed: bool,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    /// The noise tile, written on the first frame.
    tile: wgpu::Texture,
    tile_written: bool,
    atlas: wgpu::TextureView,
    atlas_drawn: bool,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl CardShaderReflections {
    /// Card `k`'s plane in points to the screen, at the current scroll.
    fn matrix(&self, k: usize, pose: &Pose) -> draw2d::Matrix3 {
        let l = &self.layout;
        let tilt = self.held(pose);
        let [vx, vy, vw, vh] = l.view;
        let x = vx + k as f32 * l.cw - self.scroll.offset as f32;
        let (cx, cy) = (vw / 2.0, vh / 2.0);
        Matrix4::translate(x + cx, vy + cy, 0.0)
            .multiply(Matrix4::rotate_z(TILT_DEG.to_radians()))
            .multiply(Matrix4::perspective(PERSPECTIVE))
            .multiply(Matrix4::translate(0.0, pose.translate_y as f32, 0.0))
            .multiply(Matrix4::rotate_y((pose.rotate_y_deg as f32).to_radians()))
            .multiply(Matrix4::rotate_x(tilt))
            .multiply(Matrix4::translate(-cx + l.card[0], -cy + l.card[1], 0.0))
            .to_matrix3()
    }

    /// Whether card `k`'s plane region (its shadow's, the widest) reaches the screen.
    fn visible(&self, m: &draw2d::Matrix3) -> bool {
        let [x, y, w, h] = self.layout.shadow();
        let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for (px, py) in [(x, y), (x + w, y), (x, y + h), (x + w, y + h)] {
            let mm = m.0;
            if mm[6] * px + mm[7] * py + mm[8] <= 0.0 {
                return true;
            }
            let p = m.map(px, py);
            l = l.min(p.x);
            t = t.min(p.y);
            r = r.max(p.x);
            b = b.max(p.y);
        }
        r > 0.0 && l < self.layout.w && b > 0.0 && t < self.layout.h
    }

    /// The finger's tilt (radians) as card `pose` takes it.
    fn held(&self, pose: &Pose) -> f32 {
        (self.tilt.value * pose.near) as f32
    }

    /// Card `pose`'s frame in the room (x axis, y axis, normal; the lights and eye stay put):
    /// the phone's turn, the base roll, the scroll's turn, the finger's tilt.
    fn room_frame(&self, pose: &Pose) -> [[f32; 3]; 3] {
        let tilt = self.held(pose);
        let m = Matrix4::rotate_x((-self.pitch.value * ATTITUDE_GAIN) as f32)
            .multiply(Matrix4::rotate_y((self.roll.value * ATTITUDE_GAIN) as f32))
            .multiply(Matrix4::rotate_z(TILT_DEG.to_radians()))
            .multiply(Matrix4::rotate_y((pose.rotate_y_deg as f32).to_radians()))
            .multiply(Matrix4::rotate_x(tilt))
            .0;
        [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
    }

    /// Takes a Core Motion attitude sample: pitch and roll, clamped, chased by the springs.
    /// Returns whether it moved a target past the deadband.
    fn attitude(&mut self, q: [f32; 4]) -> bool {
        let (p, r) = pitch_roll(q.map(|v| v as f64));
        let p = if p.is_nan() { 0.0 } else { p.clamp(-ATTITUDE_RANGE, ATTITUDE_RANGE) };
        let r = if r.is_nan() { 0.0 } else { r.clamp(-ATTITUDE_RANGE, ATTITUDE_RANGE) };
        let mut moved = false;
        for (spring, to) in [(&mut self.pitch, p), (&mut self.roll, r)] {
            if (spring.target() - to).abs() >= ATTITUDE_DEADBAND {
                spring.retarget(to, ATTITUDE_SPRING);
                moved = true;
            }
        }
        moved
    }

    /// The tilt toward a finger at `y`: the card's top goes away under a finger on it.
    fn tilt_for(&self, y: f32) -> f64 {
        let [_, vy, _, vh] = self.layout.view;
        let half = (self.layout.card[3] / 2.0).max(1.0);
        let along = ((y - (vy + vh / 2.0)) / half).clamp(-1.0, 1.0) as f64;
        -along * MAX_TILT
    }

    fn poses(&self) -> [Pose; 4] {
        std::array::from_fn(|k| pose(k, self.scroll.offset, self.layout.cw as f64))
    }

    /// The chip and the four titles (each in its slot) and the shadow, into the atlas canvas.
    fn record_atlas(&mut self) {
        let l = self.layout;
        let s = l.s;
        let (_, _, _, lefts) = l.atlas();
        if self.font.is_none() {
            self.font = Some(draw2d::match_ui_font(TITLE_SIZE, TITLE_WEIGHT));
        }
        let c = &mut self.atlas;
        c.begin(s);

        // The shadow, at the atlas's origin.
        let sh = l.shadow();
        let [_, _, w, h] = l.card;
        c.save();
        c.translate(-sh[0], -sh[1]);
        c.clip_with(|b| add_rrect(b, -SHADOW_PAD, SHADOW_DY - SHADOW_PAD, w + 2.0 * SHADOW_PAD, h + 2.0 * SHADOW_PAD, CARD_RADIUS));
        c.draw_rrect_shadow(0.0, SHADOW_DY, w, h, CARD_RADIUS, SHADOW_SIGMA, Color::BLACK.alpha(SHADOW_ALPHA));
        c.restore();

        let slot_w = l.slot_width();
        for (k, &left) in lefts.iter().enumerate() {
            c.save();
            c.translate(left as f32 / s, 0.0);
            c.clip_with(|b| add_rect(b, 0.0, 0.0, slot_w, h));
            draw_chip(c, &l);
            if let Some(Some(font)) = self.font.as_ref() {
                draw_title(c, &l, font, &CARDS[k].1.to_uppercase());
            }
            c.restore();
        }
    }
}

/// The chip in the card's points at full opacity (the compose pass applies its alpha).
fn draw_chip(c: &mut Canvas, l: &Layout) {
    let [x0, y0, x1, y1] = l.chip();
    let (w, h) = (x1 - x0, y1 - y0);
    // The chip box: 0.15 x 0.12 of the card width at the content corner.
    let (ux, uy) = (CARD_PADDING, CARD_PADDING);
    let (uw, uh) = (l.cw * 0.15, l.cw * 0.12);
    // The contact grid sits inside the chip's border and padding.
    let inset = CHIP_BORDER + CHIP_PADDING;
    let (gx, gy, gw, gh) = (ux + inset, uy + inset, uw - 2.0 * inset, uh - 2.0 * inset);
    let (rx, ry, rw, rh) = (gx + GRID_PADDING, gy + GRID_PADDING, gw - 2.0 * GRID_PADDING, gh - 2.0 * GRID_PADDING);
    let row_h = rh * ROW_HEIGHT;
    let gap = (rh - 3.0 * row_h) / 2.0;

    c.save();
    // The chip clips its contents to its rounded corners.
    c.clip_with(|b| add_continuous_rrect(b, x0, y0, w, h, CHIP_RADIUS));
    let (gl, gt) = (l.gx(gx), l.gy(gy));
    c.draw_rect(gl, gt, l.gx(gx + gw) - gl, l.gy(gy + gh) - gt, &Paint::fill(Color::WHITE.alpha(0.1)));
    let fill = Paint::fill(Color::WHITE.alpha(0.15));
    let border = Paint::fill(Color::WHITE.alpha(0.4));
    for row in 0..3 {
        let top = ry + row as f32 * (row_h + gap);
        let small_first = row != 1;
        let (small, large) = (rw * SMALL, rw * LARGE);
        let boxes = if small_first { [(rx, small), (rx + rw - large, large)] } else { [(rx, large), (rx + rw - small, small)] };
        for (left, width) in boxes {
            let (bl, bt) = (l.gx(left), l.gy(top));
            let (bw, bh) = (l.gx(left + width) - bl, l.gy(top + row_h) - bt);
            c.draw_rect(bl, bt, bw, bh, &fill);
            // A translucent ring inside the contact.
            c.draw_path(&draw2d::border_ring_path(bl, bt, bw, bh, 0.0, CONTACT_BORDER), &border);
        }
    }
    c.restore();
    // The chip's border, in front of the content.
    let outer = continuous_rrect_path(x0, y0, w, h, CHIP_RADIUS);
    let inner = continuous_rrect_path(x0 + CHIP_BORDER, y0 + CHIP_BORDER, w - 2.0 * CHIP_BORDER, h - 2.0 * CHIP_BORDER, CHIP_RADIUS - CHIP_BORDER);
    c.draw_path_events(outer.iter().chain(inner.reversed()), &Paint::fill(Color::hex(0xA8A8A8)));
}

/// The title, rotated -90 degrees about its left bottom.
fn draw_title(c: &mut Canvas, l: &Layout, font: &Font, text: &str) {
    // The title box sits TITLE_LEFT and TITLE_BOTTOM in from the content box.
    let bottom = l.ch - 2.0 * VIEW_PADDING - CARD_PADDING - TITLE_BOTTOM;
    let left = CARD_PADDING + TITLE_LEFT;
    let (ox, oy) = (l.gx(left), l.gy(bottom));
    let top = grid_floor(l.card_abs.1 + bottom - TITLE_BOX, l.s) - grid(l.card_abs.1, l.s);
    let x = grid_floor(l.card_abs.0 + left, l.s) - grid(l.card_abs.0, l.s);
    c.save();
    c.translate(ox, oy);
    c.rotate(-std::f32::consts::FRAC_PI_2);
    c.translate(TITLE_DX, TITLE_DY);
    c.translate(-ox, -oy);
    let baseline = gfx::baseline(font, top);
    let paint = Paint::fill(Color::BLACK.alpha(TITLE_OPACITY));
    // Letter spacing is added to every glyph's advance; kerning is kept.
    let chars: Vec<char> = text.chars().collect();
    let mut prefix = String::with_capacity(text.len());
    for (k, ch) in chars.iter().enumerate() {
        let mut pen = font.advance_width(&prefix) + LETTER_SPACING * k as f32;
        if k > 0 {
            pen += font.kerning(chars[k - 1], *ch);
        }
        let mut glyph = [0u8; 4];
        c.draw_text(ch.encode_utf8(&mut glyph), x + pen, baseline, font, &paint);
        prefix.push(*ch);
    }
    c.restore();
}

impl Surface for CardShaderReflections {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let cw = self.layout.cw.max(1.0) as f64;
        let poses = self.poses();
        Some(format!(
            "{{\"scrollX\":{:.2},\"index\":{},\"rotate\":[{:.4},{:.4},{:.4},{:.4}],\"held\":{}}}",
            self.scroll.offset,
            (self.scroll.offset / cw).round(),
            poses[0].rotate,
            poses[1].rotate,
            poses[2].rotate,
            poses[3].rotate,
            self.scroll.moving()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        if let InputEvent::Sensor { sensor: SensorKind::RelativeOrientation, values, .. } = *event {
            self.changed = self.attitude(values);
            return;
        }
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else {
            self.changed = false;
            return;
        };
        self.changed = true;
        // The list's frame: the full width, the list's height.
        let (top, bottom) = self.layout.list;
        let inside = y >= top && y < bottom && x >= 0.0 && x <= self.layout.w;
        let phase = gfx::phase(phase);
        self.scroll.input(id, phase, x, y, at_ms, inside);
        match phase {
            Phase::Down if inside && self.finger.is_none() => {
                self.finger = Some(id);
                self.down = (x, y);
                self.dragging = false;
            }
            Phase::Move if self.finger == Some(id) => {
                self.dragging |= (x - self.down.0).hypot(y - self.down.1) > TAP_SLOP;
                if self.dragging {
                    let to = self.tilt_for(y);
                    self.tilt.retarget(to, TILT_SPRING);
                }
            }
            Phase::Up | Phase::Cancel if self.finger == Some(id) => {
                self.finger = None;
                if self.dragging {
                    self.tilt.retarget(0.0, TILT_SPRING);
                }
                self.dragging = false;
            }
            _ => {}
        }
    }

    fn input_changed(&self) -> bool {
        self.changed
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
        let layout = Layout::new(frame.width, frame.height, frame.scale);
        if layout != self.layout {
            self.layout = layout;
            self.scroll.port = layout.w as f64;
            self.scroll.max = 3.0 * layout.cw as f64;
            self.scroll.snap = Snap::Interval(layout.cw as f64);
            self.scroll.offset = self.scroll.offset.clamp(0.0, self.scroll.max);
        }
        let mut moving = self.scroll.step(frame.now_ms);
        moving |= self.tilt.step(frame.now_ms);
        moving |= self.pitch.step(frame.now_ms);
        moving |= self.roll.step(frame.now_ms);

        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.layout)) != Some((format, frame.shader_generation, layout)) {
            self.gpu = Some(build(device, format, frame.shader_generation, layout));
        }
        if !self.gpu.as_ref().unwrap().tile_written {
            let gpu = self.gpu.as_mut().unwrap();
            let side = TILE_SIDE;
            queue.write_texture(
                wgpu::TexelCopyTextureInfo { texture: &gpu.tile, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                &noise_tile(side),
                wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4 * side), rows_per_image: Some(side) },
                wgpu::Extent3d { width: side, height: side, depth_or_array_layers: 1 },
            );
            gpu.tile_written = true;
        }
        if !self.gpu.as_ref().unwrap().atlas_drawn {
            self.record_atlas();
            let ((aw, ah), ..) = layout.atlas();
            let gpu = self.gpu.as_mut().unwrap();
            self.renderer.draw(device, queue, encoder, &self.atlas, &gpu.atlas, LAYER_FORMAT, aw, ah, wgpu::Color::TRANSPARENT);
            gpu.atlas_drawn = true;
        }

        let poses = self.poses();
        let mut u = Uniforms::default();
        let s = layout.s;
        let ((aw, ah), _, slot_px, lefts) = layout.atlas();
        // The visible cards, in paint order.
        let mut drawn: Vec<u32> = Vec::with_capacity(4);
        for k in 0..4 {
            let pose = &poses[k];
            let m = self.matrix(k, pose);
            let visible = self.visible(&m);
            let tilt = self.held(pose);
            let axes = self.room_frame(pose);
            u.frame[3 * k] = [axes[0][0], axes[0][1], axes[0][2], CARDS[k].0];
            u.frame[3 * k + 1] = [axes[1][0], axes[1][1], axes[1][2], 0.0];
            u.frame[3 * k + 2] = [axes[2][0], axes[2][1], axes[2][2], 0.0];
            let rows = m.invert().unwrap_or(draw2d::Matrix3([0.0; 9])).rows();
            u.inv[3 * k..3 * k + 3].copy_from_slice(&rows);
            u.look[k] = [
                if visible { 1.0 } else { 0.0 },
                pose.opacity as f32,
                CONTENT_OPACITY * pose.chip as f32,
                CONTENT_OPACITY * pose.title as f32,
            ];
            // The shadow leans away from the turn and drops with the tilt.
            let turn = (pose.rotate_y_deg as f32).to_radians();
            let off = (-turn.sin() * SHADOW_TURN, tilt.sin() * SHADOW_TILT);
            u.slot[k] = [lefts[k] as f32, off.0, off.1, 0.0];
            // The card's quad grown by its shadow's reach, projected.
            let [_, _, w, h] = layout.card;
            let reach = 4.0 + ((3.0 + off.0).abs() + (12.0 + off.1).abs()) + 1.9 * 18.0 + 2.0;
            let c = [(-reach, -reach), (w + reach, -reach), (w + reach, h + reach), (-reach, h + reach)].map(|(x, y)| m.map(x, y));
            u.quad[2 * k] = [c[0].x, c[0].y, c[1].x, c[1].y];
            u.quad[2 * k + 1] = [c[2].x, c[2].y, c[3].x, c[3].y];
            if visible {
                drawn.push(k as u32);
            }
        }
        let [_, _, cw, chh] = layout.card;
        u.card = [cw, chh, CARD_RADIUS, layout.split()];
        u.tex = [TILE_SIDE as f32, TILE_SIDE as f32, aw as f32, ah as f32];
        u.light = [layout.cw, 0.0, 0.0, 0.0];
        u.overlay = [slot_px as f32 / s, chh, 0.0, 0.0];
        u.canvas = [frame.pixels().0 as f32, frame.pixels().1 as f32, s, gfx::srgb_flag(format)];
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        // #111 background, then each visible card's quad. An sRGB target takes the linear value.
        let v = 17.0_f64 / 255.0;
        let bg = if format.is_srgb() { ((v + 0.055) / 1.055).powf(2.4) } else { v };
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("card shader reflections"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: bg, g: bg, b: bg, a: 1.0 }), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.compose);
        pass.set_bind_group(0, &gpu.bind, &[]);
        for k in drawn {
            pass.draw(0..6, k..k + 1);
        }
        moving
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, layout: Layout) -> Gpu {
    let tile = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("card shader reflections noise"),
        size: wgpu::Extent3d { width: TILE_SIDE, height: TILE_SIDE, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: LAYER_FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let tile_view = tile.create_view(&Default::default());

    let ((aw, ah), ..) = layout.atlas();
    let atlas = draw2d::render::sampled_target(device, "card shader reflections atlas", LAYER_FORMAT, aw, ah);

    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let compose = draw2d::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING));
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("card shader reflections"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = draw2d::render::linear_sampler(device);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("card shader reflections"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: TILE.binding, resource: wgpu::BindingResource::TextureView(&tile_view) },
            wgpu::BindGroupEntry { binding: ATLAS.binding, resource: wgpu::BindingResource::TextureView(&atlas) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, layout, tile, tile_written: false, atlas, atlas_drawn: false, compose, uniforms, bind }
}

/// Pitch and roll of Core Motion's attitude quaternion `[x, y, z, w]`.
fn pitch_roll(q: [f64; 4]) -> (f64, f64) {
    let [x, y, z, w] = q;
    let pitch = (2.0 * (w * x + y * z)).clamp(-1.0, 1.0).asin();
    let roll = (2.0 * (w * y - x * z)).atan2(1.0 - 2.0 * (x * x + y * y));
    (pitch, roll)
}

/// A hash of a lattice point in [0, 1).
fn hash(x: u32, y: u32, seed: u32) -> f32 {
    let mut h = x.wrapping_mul(0x8da6_b343) ^ y.wrapping_mul(0xd816_3841) ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h & 0xff_ffff) as f32 / 16_777_216.0
}

/// Value noise that tiles a `side` square: `cells` lattice cells across each axis.
fn tiled_noise(x: u32, y: u32, side: u32, cells: (u32, u32), seed: u32) -> f32 {
    let fx = x as f32 * cells.0 as f32 / side as f32;
    let fy = y as f32 * cells.1 as f32 / side as f32;
    let (ix, iy) = (fx.floor() as u32, fy.floor() as u32);
    let smooth = |t: f32| t * t * (3.0 - 2.0 * t);
    let (tx, ty) = (smooth(fx.fract()), smooth(fy.fract()));
    let at = |i: u32, j: u32| hash(i % cells.0, j % cells.1, seed);
    let top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    let bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    top + (bottom - top) * ty
}

/// The cards' noise as a `side` x `side` RGBA8 tile: r the brushing lines (long along x),
/// g the bead-blast tooth, b the grain.
fn noise_tile(side: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity((side * side * 4) as usize);
    for y in 0..side {
        for x in 0..side {
            let lines = tiled_noise(x, y, side, (1, side), 1) * 0.5 + tiled_noise(x, y, side, (3, side / 2), 2) * 0.2 + tiled_noise(x, y, side, (2, side / 8), 3) * 0.1 + 0.1;
            let tooth = tiled_noise(x, y, side, (side * 7 / 10, side * 7 / 10), 4);
            let grain = hash(x, y, 5);
            out.extend([lines, tooth, grain].map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8));
            out.push(255);
        }
    }
    out
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn layout_is_yogas() {
        // 420 x 912 at 3x.
        let l = Layout::new(420.0, 912.0, 3.0);
        assert_eq!((l.cw, l.ch), (294.0, 465.0));
        assert_eq!(l.list, (177.0, 735.0));
        assert_eq!(l.view, [63.0, 197.0, 294.0, 465.0]);
        assert_eq!(l.card, [16.0, 16.0, 262.0, 433.0]);
        // The chip box is 44.1 x 35.28 at (30, 30), on the 1/3 pt grid.
        let chip = l.chip();
        assert_eq!(chip[0], 30.0);
        assert!((chip[2] - 74.0).abs() < 1e-4 && (chip[3] - (65.0 + 1.0 / 3.0)).abs() < 1e-4, "{chip:?}");
    }

    #[test]
    fn poses_follow_the_scroll() {
        let p = pose(1, 0.0, 294.0);
        assert_eq!((p.rotate_y_deg, p.translate_y, p.opacity, p.chip, p.title), (180.0, 0.0, 0.5, 0.2, 0.0));
        assert_eq!(p.rotate, -std::f32::consts::PI);
        let p = pose(1, 147.0, 294.0);
        assert_eq!((p.rotate_y_deg, p.translate_y, p.opacity), (90.0, -6.0, 0.75));
        // Half rounds up.
        assert_eq!(p.title, 1.0);
        let p = pose(0, 0.0, 294.0);
        assert_eq!((p.rotate_y_deg, p.opacity, p.title, p.rotate), (0.0, 1.0, 1.0, 0.0));
    }

    #[test]
    fn the_cards_tilt_turn_and_snap() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("card-shader-reflections-rest");
        assert!(!moving);
        let px = |img: &fixture::Pixels, x: f32, y: f32| img.at((x * 3.0) as u32, (y * 3.0) as u32);
        // #111 away from the cards.
        assert_eq!(&px(&rest, 5.0, 5.0)[..3], &[17, 17, 17]);
        assert_eq!(&px(&rest, 210.0, 900.0)[..3], &[17, 17, 17]);
        // Card 0's face at its centre: lit metal, not the background.
        let centre = px(&rest, 210.0, 429.5);
        assert!(centre[0] > 40, "{centre:?}");
        // The 18 degree tilt: the unrotated top-left corner is background; just inside the rotated one is the card.
        assert_eq!(&px(&rest, 84.0, 218.0)[..3], &[17, 17, 17]);
        let corner = px(&rest, 160.0, 195.0);
        assert!(corner[0] > 25, "{corner:?}");
        // Card 1 shows its back, at 0.5, at the right edge.
        let right = px(&rest, 410.0, 500.0);
        assert_ne!(&right[..3], &[17, 17, 17]);

        // A slow flick to the left: the scroll snaps one card on.
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 430.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 300.0, 16.0));
        for i in 1..=8 {
            s.input(&pointer(PointerPhase::Move, 300.0 - 15.0 * i as f32, 16.0 + 16.0 * i as f64));
        }
        let (mid, moving) = fixture::render(&gpu, s.as_mut(), &frame(150.0)).unwrap();
        mid.save("card-shader-reflections-turning");
        assert!(moving);
        s.input(&pointer(PointerPhase::Up, 180.0, 160.0));
        let mut ms = 160.0;
        let mut img = mid;
        let mut moving = true;
        while moving && ms < 4000.0 {
            ms += 16.0;
            (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        img.save("card-shader-reflections-next");
        let reply = s.agent("").unwrap();
        assert!(reply.starts_with("{\"scrollX\":294.00,\"index\":1,"), "{reply}");
        // Card 1 now centred, facing; card 0 turned away on the left.
        let centre = px(&img, 210.0, 429.5);
        assert!(centre[0] > 40, "{centre:?}");
        // No haptic on the flick.
        assert!(s.messages().is_empty());
        // A touch below the list does not scroll.
        let below = InputEvent::Pointer { id: 2, phase: PointerPhase::Down, x: 200.0, y: 850.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 5000.0 };
        s.input(&below);
        assert!(s.agent("").unwrap().ends_with("\"held\":false}"), "{}", s.agent("").unwrap());
        assert!(s.messages().is_empty());
    }

    #[test]
    fn a_drag_tilts_the_card_and_a_tap_does_nothing() {
        let mut s = match surface_with_layout() {
            Some(s) => s,
            None => return,
        };
        let pointer = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        // A tap, even with a small slip: no tilt, no message.
        s.input(&pointer(PointerPhase::Down, 240.0, 0.0));
        s.input(&pointer(PointerPhase::Move, 244.0, 10.0));
        assert_eq!(s.tilt.target(), 0.0);
        s.input(&pointer(PointerPhase::Up, 244.0, 50.0));
        assert_eq!(s.tilt.target(), 0.0);
        // A drag near the card's top: the top goes away (a positive rotateX).
        s.input(&pointer(PointerPhase::Down, 300.0, 100.0));
        s.input(&pointer(PointerPhase::Move, 240.0, 120.0));
        assert!(s.tilt.target() > 0.1, "{}", s.tilt.target());
        s.input(&pointer(PointerPhase::Up, 240.0, 150.0));
        assert_eq!(s.tilt.target(), 0.0);
        let mut ms = 150.0;
        while s.tilt.step(ms) && ms < 3000.0 {
            ms += 16.0;
        }
        assert!(ms < 3000.0 && s.tilt.value == 0.0);
        assert!(s.messages().is_empty());
    }

    #[test]
    fn the_phone_turn_moves_the_light() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let sensor = |pitch: f32, roll: f32, at_ms| {
            // Roll about y, then pitch about x.
            let (sp, cp) = (pitch / 2.0).sin_cos();
            let (sr, cr) = (roll / 2.0).sin_cos();
            InputEvent::Sensor { sensor: SensorKind::RelativeOrientation, values: [sp * cr, cp * sr, -sp * sr, cp * cr], dropped: 0, at_ms }
        };
        let settle = |s: &mut dyn Surface, from: f64| {
            let mut ms = from;
            let (mut img, mut moving) = fixture::render(&gpu, s, &frame(ms)).unwrap();
            while moving && ms < from + 3000.0 {
                ms += 16.0;
                (img, moving) = fixture::render(&gpu, s, &frame(ms)).unwrap();
            }
            assert!(!moving, "settles");
            img
        };
        let mut s = surface();
        let rest = settle(s.as_mut(), 0.0);
        rest.save("card-shader-reflections-phone-level");
        // Sensor noise asks for no frame.
        s.input(&sensor(0.0003, 0.0, 10.0));
        assert!(!s.input_changed());
        // The phone rolled 20° right: the highlights move; the clamp holds 40° at 25°.
        let deg = std::f32::consts::PI / 180.0;
        s.input(&sensor(0.0, 20.0 * deg, 20.0));
        assert!(s.input_changed());
        let right = settle(s.as_mut(), 4000.0);
        right.save("card-shader-reflections-phone-right");
        s.input(&sensor(-15.0 * deg, -40.0 * deg, 8000.0));
        let left = settle(s.as_mut(), 8000.0);
        left.save("card-shader-reflections-phone-left");
        // The face changed under the light (gently, ATTITUDE_GAIN halves the sweep); the background did not.
        let px = |img: &fixture::Pixels, x: f32, y: f32| img.at((x * 3.0) as u32, (y * 3.0) as u32);
        let changed = |a: &fixture::Pixels, b: &fixture::Pixels| {
            [(150.0, 300.0), (210.0, 429.5), (260.0, 560.0)].iter().map(|&(x, y)| (px(a, x, y)[1] as i32 - px(b, x, y)[1] as i32).abs()).max().unwrap()
        };
        assert!(changed(&rest, &right) > 6, "{}", changed(&rest, &right));
        assert!(changed(&right, &left) > 6, "{}", changed(&right, &left));
        assert_eq!(&px(&left, 5.0, 5.0)[..3], &[17, 17, 17]);
    }

    /// The surface at a 420 x 912 layout, without a GPU.
    fn surface_with_layout() -> Option<CardShaderReflections> {
        let layout = Layout::new(420.0, 912.0, 3.0);
        let s = CardShaderReflections {
            layout,
            scroll: UiScroll::new(0.0, 3.0 * layout.cw as f64, layout.w as f64, FAST, Snap::Interval(layout.cw as f64)),
            font: None,
            atlas: Canvas::default(),
            renderer: Renderer::default(),
            gpu: None,
            tilt: Spring::at(0.0),
            finger: None,
            down: (0.0, 0.0),
            dragging: false,
            pitch: Spring::at(0.0),
            roll: Spring::at(0.0),
            changed: true,
        };
        Some(s)
    }
}
