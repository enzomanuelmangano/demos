//! Card Shader Reflections (src/animations/card-shader-reflections: src/components/card-carousel/
//! card-carousel.tsx, card/*, utils/constants.ts): four metal cards (Metal, Silver, Gold,
//! Platinum) in a horizontal FlatList on #111, each tilted 18°, turning about y as it scrolls
//! away from the centre; each card's face is getCardShader (a lit, brushed-metal SkSL effect)
//! whose light follows the turn.
//!
//! Layout (Yoga's numbers, each edge on the device-pixel grid): CARD_WIDTH = round(W × 0.7),
//! CARD_HEIGHT = round(CARD_WIDTH × 1.58), SPACING 20. styles.container centres a View of height
//! CARD_HEIGHT × 1.2 (the FlatList: full width, contentContainer paddingHorizontal
//! (W − CARD_WIDTH) / 2). Item i (cardContainer: CARD_WIDTH × (CARD_HEIGHT + 20), paddingTop 20)
//! holds the Animated.View (flex 1, padding 16: CARD_WIDTH × CARD_HEIGHT) and in it styles.card
//! (radius 20, overflow hidden, padding 30, boxShadow `0px 10px 20px rgba(0,0,0,0.3)`):
//! - CardCanvas: absoluteFill but CARD_WIDTH × CARD_HEIGHT, so it overflows the card, which clips
//!   it; resolution [CARD_WIDTH, CARD_HEIGHT], cardType = the item's id
//!   (gpu/shaders/card_shader_reflections.wgsl, drawn into one 8-bit layer per card at device
//!   pixels, redrawn only when its `rotate` uniform changes, as RN's canvas is).
//! - cardContent (flex 1, opacity 0.7): CardChip (chipContainer 0.15 × 0.12 CARD_WIDTH; chip:
//!   0.5 pt #A8A8A8 Core Animation border, continuous radius 4, clipping, padding 2; chipGrid
//!   rgba(255,255,255,0.1), padding 2, three rows 28 % tall spaced between, each a 25 % and a
//!   65 % contact: rgba(255,255,255,0.15) under RN's 0.5 pt rgba(255,255,255,0.4) border image),
//!   and titleWrapper (absolute, left 20, bottom 20, height 40, `[rotate −90deg, translateY 10,
//!   translateX −20]` about its left bottom) with the uppercase title (System bold 16,
//!   letterSpacing −1, black, opacity 0.9).
//! - The card's corners: RN moves the children of an `overflow: hidden` view with a boxShadow
//!   into a container view whose layer gets the radius but not the cornerCurve: the clip is
//!   circular. The shadow (RCTBoxShadow) is its circular rounded rect offset (0, 10),
//!   shadowRadius 10 (σ 10), black 0.3, masked to outside the bounds' rounded rect.
//!
//! The card's transform about the Animated.View's centre: `[rotate 18deg, perspective 1200,
//! translateY, rotateY]` (Matrix4, as React Native composes it); Core Animation flattens each
//! cardContainer, so cards paint in index order; back faces show (mirrored).
//! gpu/shaders/card_shader_reflections_compose.wgsl draws every visible card per pixel.
//!
//! Motion audit (every animated value; i is the card's index, CW = CARD_WIDTH):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | scrollX | FlatList onScroll (useAnimatedScrollHandler, scrollEventThrottle 8): contentOffset.x of a UIScrollView, snapToInterval CW, decelerationRate "fast" | `UiScroll` (rubber band, rate 0.99/ms, interval snap by velocity), read every frame |
//! | rotateY | interpolate(scrollX, [(i−1), i, (i+1)] × CW, [180, 0, −180], CLAMP) deg | the same, per frame |
//! | translateY | interpolate(scrollX, [(i−1), (i−½), i, (i+½), (i+1)] × CW, [0, −6, 0, −6, 0], CLAMP) | the same |
//! | card opacity | interpolate(scrollX, [(i−1), i, (i+1)] × CW, [0.5, 1, 0.5], CLAMP) | the same |
//! | chip opacity | interpolate(…, [0.2, 0.6, 0.2], CLAMP) | the same (× cardContent's 0.7) |
//! | title opacity | Math.round(interpolate(…, [0, 1, 0], CLAMP)) | the same (half up) |
//! | shader rotate | useAnimatedReaction: interpolate(…, [−π, 0, π], CLAMP), written only when it changes | the card's layer is redrawn only when this value changes |
//!
//! No haptics, no timers: at rest nothing renders.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::interpolate_clamp;
use skia::{add_continuous_rrect, add_rect, add_rrect, continuous_rrect_path, Canvas, Color, Font, Matrix4, Paint, Renderer};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::card_shader_reflections as card_shader;
use shaders::card_shader_reflections_compose::{entry, module, Uniforms, ATLAS, GROUP_0, LAYERS, SMP, U};

/// CARD_DATA: (id = cardType, title), in list order.
const CARDS: [(f32, &str); 4] = [(3.0, "Metal"), (0.0, "Silver"), (1.0, "Gold"), (2.0, "Platinum")];
/// SPACING.
const SPACING: f32 = 20.0;
/// The Animated.View's padding.
const VIEW_PADDING: f32 = 16.0;
/// styles.card padding (SPACING × 1.5) and radius.
const CARD_PADDING: f32 = SPACING * 1.5;
const CARD_RADIUS: f32 = 20.0;
/// The base tilt and the perspective.
const TILT_DEG: f32 = 18.0;
const PERSPECTIVE: f32 = 1200.0;
/// boxShadow '0px 10px 20px rgba(0, 0, 0, 0.3)': offset, σ = shadowRadius = blur / 2, alpha;
/// RCTBoxShadow's mask pads the shadow rect by 2 × (blur + 1).
const SHADOW_DY: f32 = 10.0;
const SHADOW_SIGMA: f32 = 10.0;
const SHADOW_ALPHA: f32 = 0.3;
const SHADOW_PAD: f32 = 2.0 * (20.0 + 1.0);
/// cardContent's opacity.
const CONTENT_OPACITY: f32 = 0.7;
/// The chip: border width, radius, padding; chipGrid padding; the rows and the contacts.
const CHIP_BORDER: f32 = 0.5;
const CHIP_RADIUS: f32 = 4.0;
const CHIP_PADDING: f32 = 2.0;
const GRID_PADDING: f32 = 2.0;
const ROW_HEIGHT: f32 = 0.28;
const SMALL: f32 = 0.25;
const LARGE: f32 = 0.65;
const CONTACT_BORDER: f32 = 0.5;
/// styles.titleWrapper: left, bottom, height; its transform; cardTitle.
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

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(CardShaderReflections {
        layout: Layout::default(),
        scroll: UiScroll::new(0.0, 0.0, 0.0, FAST, Snap::Free),
        font: None,
        atlas: Canvas::default(),
        renderer: Renderer::default(),
        drawn: [None; 4],
        gpu: None,
    })
}

/// Yoga's rounding of an absolute edge to the pixel grid (a half rounds up).
fn grid(v: f32, s: f32) -> f32 {
    ((v * s + 0.5 + 1e-4).floor()) / s
}

/// Yoga's rounding of a text node's left / top edge (floored).
fn grid_floor(v: f32, s: f32) -> f32 {
    ((v * s + 1e-4).floor()) / s
}

/// The screen's layout for a window `w × h` at `s` device pixels per point.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f32,
    h: f32,
    s: f32,
    /// CARD_WIDTH, CARD_HEIGHT.
    cw: f32,
    ch: f32,
    /// The list's View: top and bottom (rounded).
    list: (f32, f32),
    /// Card 0's Animated.View: left (in the scroll content, which starts at x 0), top, width,
    /// height (rounded).
    view: [f32; 4],
    /// styles.card in the Animated.View: left, top, width, height.
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
        // cardContainer at (pad + i·CW, list top); the Animated.View below its paddingTop.
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

    /// The canvas layer's size in device pixels: the canvas (CW × CH at the card's origin) as
    /// far as the card shows it, plus one pixel for the bilinear filter at the clip's edge.
    fn layer_pixels(&self) -> (u32, u32) {
        let s = self.s;
        let canvas = ((self.gx(self.cw) * s).round() as u32, (self.gy(self.ch) * s).round() as u32);
        let shown = ((self.card[2] * s).ceil() as u32 + 1, (self.card[3] * s).ceil() as u32 + 1);
        (canvas.0.min(shown.0).max(1), canvas.1.min(shown.1).max(1))
    }

    /// The shadow's region in the card's points: left, top, width, height (RCTBoxShadow's
    /// padded mask).
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
    /// The shader's `rotate` (radians).
    rotate: f32,
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
        // Math.round: half up.
        title: (interpolate_clamp(scroll_x, &input, &[0.0, 1.0, 0.0]) + 0.5).floor(),
        rotate: interpolate_clamp(scroll_x, &input, &[-pi, 0.0, pi]) as f32,
    }
}

struct CardShaderReflections {
    layout: Layout,
    scroll: UiScroll,
    font: Option<Option<Font>>,
    atlas: Canvas,
    renderer: Renderer,
    /// The `rotate` each card's layer was last drawn with.
    drawn: [Option<f32>; 4],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    card_pipeline: wgpu::RenderPipeline,
    card_uniforms: [wgpu::Buffer; 4],
    card_binds: [wgpu::BindGroup; 4],
    /// Each card's canvas layer, as a render target.
    layer_views: [wgpu::TextureView; 4],
    atlas: wgpu::TextureView,
    atlas_drawn: bool,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl CardShaderReflections {
    /// Card `k`'s plane (styles.card's points) → the screen, at the current scroll.
    fn matrix(&self, k: usize, pose: &Pose) -> skia::Matrix3 {
        let l = &self.layout;
        let [vx, vy, vw, vh] = l.view;
        let x = vx + k as f32 * l.cw - self.scroll.offset as f32;
        let (cx, cy) = (vw / 2.0, vh / 2.0);
        Matrix4::translate(x + cx, vy + cy, 0.0)
            .multiply(Matrix4::rotate_z(TILT_DEG.to_radians()))
            .multiply(Matrix4::perspective(PERSPECTIVE))
            .multiply(Matrix4::translate(0.0, pose.translate_y as f32, 0.0))
            .multiply(Matrix4::rotate_y((pose.rotate_y_deg as f32).to_radians()))
            .multiply(Matrix4::translate(-cx + l.card[0], -cy + l.card[1], 0.0))
            .to_matrix3()
    }

    /// Whether card `k`'s plane region (its shadow's, the widest) reaches the screen.
    fn visible(&self, m: &skia::Matrix3) -> bool {
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

    fn poses(&self) -> [Pose; 4] {
        std::array::from_fn(|k| pose(k, self.scroll.offset, self.layout.cw as f64))
    }

    /// The chip and the four titles (each in its slot) and the shadow, into the atlas canvas.
    fn record_atlas(&mut self) {
        let l = self.layout;
        let s = l.s;
        let (_, _, _, lefts) = l.atlas();
        if self.font.is_none() {
            self.font = Some(skia::match_ui_font(TITLE_SIZE, TITLE_WEIGHT));
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

/// CardChip, in the card's points, at full opacity (its group's alpha is the compose pass's).
fn draw_chip(c: &mut Canvas, l: &Layout) {
    let [x0, y0, x1, y1] = l.chip();
    let (w, h) = (x1 - x0, y1 - y0);
    // chipContainer: CARD_WIDTH × 0.15 by CARD_WIDTH × 0.12 at the content box's corner.
    let (ux, uy) = (CARD_PADDING, CARD_PADDING);
    let (uw, uh) = (l.cw * 0.15, l.cw * 0.12);
    // chipGrid: inside the chip's border and padding; its padding box holds the rows.
    let inset = CHIP_BORDER + CHIP_PADDING;
    let (gx, gy, gw, gh) = (ux + inset, uy + inset, uw - 2.0 * inset, uh - 2.0 * inset);
    let (rx, ry, rw, rh) = (gx + GRID_PADDING, gy + GRID_PADDING, gw - 2.0 * GRID_PADDING, gh - 2.0 * GRID_PADDING);
    let row_h = rh * ROW_HEIGHT;
    let gap = (rh - 3.0 * row_h) / 2.0;

    c.save();
    // The chip clips its children to its continuous radius 4.
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
            // RN's border image (translucent, not clipping): a ring inside the box.
            c.draw_path(&skia::border_ring_path(bl, bt, bw, bh, 0.0, CONTACT_BORDER), &border);
        }
    }
    c.restore();
    // Core Animation's border, in front of the content, with the continuous curve.
    let outer = continuous_rrect_path(x0, y0, w, h, CHIP_RADIUS);
    let inner = continuous_rrect_path(x0 + CHIP_BORDER, y0 + CHIP_BORDER, w - 2.0 * CHIP_BORDER, h - 2.0 * CHIP_BORDER, CHIP_RADIUS - CHIP_BORDER);
    c.draw_path_events(outer.iter().chain(inner.reversed()), &Paint::fill(Color::hex(0xA8A8A8)));
}

/// The title: titleWrapper's transform about its left bottom, the Text at its top-left.
fn draw_title(c: &mut Canvas, l: &Layout, font: &Font, text: &str) {
    // cardContent (the card's content box) → titleWrapper: left 20, bottom 20, height 40.
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
    // letterSpacing −1 (NSKern): added to every glyph's advance, kerning and tracking kept.
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
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The FlatList's frame: the full width, the list View's height.
        let (top, bottom) = self.layout.list;
        let inside = y >= top && y < bottom && x >= 0.0 && x <= self.layout.w;
        self.scroll.input(id, gfx::phase(phase), x, y, at_ms, inside);
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
        let moving = self.scroll.step(frame.now_ms);

        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.layout)) != Some((format, frame.shader_generation, layout)) {
            self.gpu = Some(build(device, format, frame.shader_generation, layout));
            self.drawn = [None; 4];
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
        let (lw, lh) = layout.layer_pixels();
        let ((aw, ah), _, slot_px, lefts) = layout.atlas();
        for k in 0..4 {
            let pose = &poses[k];
            let m = self.matrix(k, pose);
            let visible = self.visible(&m);
            if visible && self.drawn[k] != Some(pose.rotate) {
                let gpu = self.gpu.as_ref().unwrap();
                let cu = card_shader::Uniforms { params: [pose.rotate, CARDS[k].0, 1.0 / s, 0.0], res: [layout.cw, layout.ch, 0.0, 0.0] };
                queue.write_buffer(&gpu.card_uniforms[k], 0, &cu.bytes());
                skia::render::fullscreen_pass(encoder, "card shader reflections card", &gpu.layer_views[k], &gpu.card_pipeline, &gpu.card_binds[k]);
                self.drawn[k] = Some(pose.rotate);
            }
            let rows = m.invert().unwrap_or(skia::Matrix3([0.0; 9])).rows();
            u.inv[3 * k..3 * k + 3].copy_from_slice(&rows);
            u.look[k] = [
                if visible { 1.0 } else { 0.0 },
                pose.opacity as f32,
                CONTENT_OPACITY * pose.chip as f32,
                CONTENT_OPACITY * pose.title as f32,
            ];
            u.slot[k] = [lefts[k] as f32, 0.0, 0.0, 0.0];
        }
        let [_, _, cw, chh] = layout.card;
        u.card = [cw, chh, CARD_RADIUS, layout.split()];
        u.tex = [lw as f32, lh as f32, aw as f32, ah as f32];
        u.shadow = layout.shadow();
        u.overlay = [slot_px as f32 / s, chh, 0.0, 0.0];
        u.canvas = [frame.pixels().0 as f32, frame.pixels().1 as f32, s, gfx::srgb_flag(format)];
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "card shader reflections", target, &gpu.compose, &gpu.bind);
        moving
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, layout: Layout) -> Gpu {
    // The cards' canvas layers: one array layer each.
    let (lw, lh) = layout.layer_pixels();
    let layers = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("card shader reflections layers"),
        size: wgpu::Extent3d { width: lw, height: lh, depth_or_array_layers: 4 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: LAYER_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let layer_views = std::array::from_fn(|k| {
        layers.create_view(&wgpu::TextureViewDescriptor {
            label: Some("card shader reflections layer"),
            dimension: Some(wgpu::TextureViewDimension::D2),
            base_array_layer: k as u32,
            array_layer_count: Some(1),
            ..Default::default()
        })
    });
    let array_view = layers.create_view(&wgpu::TextureViewDescriptor { label: Some("card shader reflections layers"), dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });

    let card_module = device.create_shader_module(card_shader::module());
    let card_layout = device.create_bind_group_layout(&card_shader::GROUP_0);
    let card_pipeline = skia::render::fullscreen_pipeline(device, &card_module, &card_layout, card_shader::entry::FS, LAYER_FORMAT, None);
    let card_uniforms: [wgpu::Buffer; 4] = std::array::from_fn(|_| {
        device.create_buffer(&wgpu::BufferDescriptor { label: Some("card shader reflections card"), size: card_shader::Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false })
    });
    let card_binds = std::array::from_fn(|k| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("card shader reflections card"),
            layout: &card_layout,
            entries: &[wgpu::BindGroupEntry { binding: card_shader::U.binding, resource: card_uniforms[k].as_entire_binding() }],
        })
    });

    let ((aw, ah), ..) = layout.atlas();
    let atlas = skia::render::sampled_target(device, "card shader reflections atlas", LAYER_FORMAT, aw, ah);

    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("card shader reflections"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = skia::render::linear_sampler(device);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("card shader reflections"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: LAYERS.binding, resource: wgpu::BindingResource::TextureView(&array_view) },
            wgpu::BindGroupEntry { binding: ATLAS.binding, resource: wgpu::BindingResource::TextureView(&atlas) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, layout, card_pipeline, card_uniforms, card_binds, layer_views, atlas, atlas_drawn: false, compose, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn layout_is_yogas() {
        // iPhone Air: 420 × 912 at 3×.
        let l = Layout::new(420.0, 912.0, 3.0);
        assert_eq!((l.cw, l.ch), (294.0, 465.0));
        assert_eq!(l.list, (177.0, 735.0));
        assert_eq!(l.view, [63.0, 197.0, 294.0, 465.0]);
        assert_eq!(l.card, [16.0, 16.0, 262.0, 433.0]);
        // chipContainer: 44.1 × 35.28 at (30, 30), on the 1/3 pt grid.
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
        // Math.round(0.5) is 1.
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
        // Card 0's face at its centre (210, 429.5): lit metal, not the background.
        let centre = px(&rest, 210.0, 429.5);
        assert!(centre[0] > 40, "{centre:?}");
        // The 18° tilt: the unrotated card's top-left corner (84, 218) is background now; the
        // rotated top-left corner sits near (152, 183): just inside it, the card.
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
        // A touch below the list does not scroll.
        let below = InputEvent::Pointer { id: 2, phase: PointerPhase::Down, x: 200.0, y: 850.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 5000.0 };
        s.input(&below);
        assert!(s.agent("").unwrap().ends_with("\"held\":false}"), "{}", s.agent("").unwrap());
    }
}
