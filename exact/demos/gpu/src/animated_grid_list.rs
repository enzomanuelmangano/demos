//! Animated Grid List's cards (src/animations/animated-grid-list: index.tsx, constants.ts,
//! components/animated-layout-list): the ScrollView and its ten cards; the floating button stays
//! in Contract (above this canvas) and hands the layout in.
//!
//! - The ScrollView (UIScrollView, `ui_scroll` on its y axis): its frame is the container less
//!   the safe area's top and bottom, its content drawn outside it too (overflow visible). The
//!   content is a wrapped row: a card is `width: 42.5%`, aspect 1 (Yoga's aspectRatio wins over
//!   height 120) in the grid, `90%` × 100 in the list; marginLeft 5%, marginBottom 20. Yoga
//!   rounds each node's position relative to its parent half up and its size from the unrounded
//!   absolute edges; a Text's position is floored and its side ceiled after an epsilon.
//! - A card: white, radius 10 continuous, clipping. Its renderItem (flex 1, centred, a row in
//!   the list, a column in the grid) holds the photo (200 square, or 64 with radius 32 and
//!   marginHorizontal 16; RN's Image, its photo covering the frame) and, in the list, a column
//!   of the title (14, maxWidth 80 %, one line) and the subtitle (#383838 12, maxWidth 200, one
//!   line), both truncated at the tail.
//! - The toggle (one commit) starts every layout animation on the same frame, as Reanimated's
//!   layout animations do: each card's LinearTransition.duration(700), the photo's
//!   LinearTransition (300 ms; its radius set at once), the text column's FadeIn (300 ms) or
//!   FadeOut (300 ms from 1, kept where it was), all `withTiming` on inOut(quad), each from the
//!   frame shown now.
//! - The tilt: onBeginDrag keeps lastOffset; onScroll sets isScrolling and direction = y >
//!   lastOffset ? Down : Up; onEndDrag with no velocity and onMomentumEnd clear both. rotation is
//!   20deg (Up), −20deg (Down) or 0, and the cards' style runs `withSpring(rotation,
//!   { dampingRatio: 1, duration: 500 })` when it changes: spring.ts onStart, so a velocity that
//!   points away from the new target is dropped and the stiffness is solved from the running
//!   value and velocity. `perspective: 500` then rotateX about each card's centre: Core
//!   Animation samples the card's layer through the transform with hard edges.
//! - Photos: RN requests picsum's random 200/300 for every cell; picsum is not reachable from
//!   here, so the cells show picsum photos already bundled (selectable-grid-list's), covered as
//!   RN covers any photo.
//!
//! Inputs: isList, safeTop, safeBottom, the twenty quote indices ("t0,s0,t1,s1,…").

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::{Easing, Spring, Timing};
use skia::{Canvas, Color, Font, Images, Matrix, Matrix4, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{self, Snap, UiScroll};

const CARDS: usize = 10;
/// The rotation: MAX_ROTATE_DEG / MIN_ROTATE_DEG, perspective.
const ROTATE: f64 = 20.0;
const PERSPECTIVE: f32 = 500.0;
/// The layer margin around a card in its texture, device pixels.
const MARGIN: f32 = 2.0;

/// constants.ts getRandomQuote's quotes.
const QUOTES: [&str; 13] = [
    "The greatest glory in living lies not in never falling, but in rising every time we fall.",
    "The way to get started is to quit talking and begin doing.",
    "Your time is limited, so don’t waste it living someone else’s life. Don’t be trapped by dogma, which is living with the results of other people’s thinking. Don’t let the noise of others’ opinions drown out your own inner voice. And most important, have the courage to follow your heart and intuition. They somehow already know what you truly want to become. Everything else is secondary.",
    "If life were predictable it would cease to be life, and be without flavor.",
    "If you look at what you have in life, you’ll always have more. If you look at what you don’t have in life, you’ll never have enough.",
    "If you set your goals ridiculously high and it’s a failure, you will fail above everyone else’s success.",
    "Life is what happens when you’re busy making other plans.",
    "Spread love everywhere you go. Let no one ever come to you without leaving happier.",
    "When you reach the end of your rope, tie a knot in it and hang on.",
    "Always remember that you are absolutely unique. Just like everyone else.",
    "Don’t judge each day by the harvest you reap but by the seeds that you plant.",
    "The future belongs to those who believe in the beauty of their dreams.",
    "Tell me and I forget. Teach me and I remember. Involve me and I learn.",
];

macro_rules! photos {
    ($($n:literal),*) => { [$(include_bytes!(concat!("../images/selectable-grid-list/", $n, ".jpg")).as_slice()),*] };
}
static PHOTOS: [&[u8]; CARDS] = photos!("00", "01", "02", "03", "04", "05", "06", "07", "08", "09");

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AnimatedGridList::default())
}

/// Yoga's roundValueToPixelGrid (half up).
fn yr(v: f64, s: f64) -> f64 {
    (v * s + 0.5 + 1e-6).floor() / s
}

/// RCTTextLayoutManager's measured side.
fn text_side(v: f64, s: f64) -> f64 {
    ((v + 0.001) * s).ceil() / s
}

/// A frame: x, y, width, height.
type Rect = [f64; 4];

/// The final layout of one card and its photo (relative to the card), as Yoga rounds them.
fn layout(i: usize, list: bool, w: f64, s: f64) -> (Rect, Rect) {
    let margin = 0.05 * w;
    if list {
        let (left, top, cw) = (margin, 120.0 * i as f64, 0.9 * w);
        let card = [yr(left, s), yr(top, s), yr(left + cw, s) - yr(left, s), yr(top + 100.0, s) - yr(top, s)];
        (card, [16.0, 18.0, 64.0, 64.0])
    } else {
        let side = 0.425 * w;
        let (col, row) = ((i % 2) as f64, (i / 2) as f64);
        let left = margin + col * (side + margin);
        let top = row * (side + 20.0);
        let card = [yr(left, s), yr(top, s), yr(left + side, s) - yr(left, s), yr(top + side, s) - yr(top, s)];
        // A column, centred across: the 200² photo (wider than the card, clipped).
        let rel = (side - 200.0) / 2.0;
        let photo = [yr(rel, s), 0.0, yr(left + rel + 200.0, s) - yr(left + rel, s), yr(top + 200.0, s) - yr(top, s)];
        (card, photo)
    }
}

/// The scroll content's height.
fn content_height(list: bool, w: f64, s: f64) -> f64 {
    if list {
        1200.0
    } else {
        yr(5.0 * (0.425 * w + 20.0), s)
    }
}

/// NSLineBreakByTruncatingTail on one line `max` wide: the longest prefix that fits with "…".
fn truncate(font: &Font, text: &str, max: f32) -> String {
    if font.advance_width(text) <= max + 1e-3 {
        return text.to_string();
    }
    let ends: Vec<usize> = text.char_indices().map(|(i, _)| i).skip(1).chain([text.len()]).collect();
    let (mut lo, mut hi) = (0usize, ends.len());
    // The prefix width grows with its length: bisect on it.
    while lo < hi {
        let mid = (lo + hi).div_ceil(2);
        let cand = format!("{}…", &text[..ends[mid - 1]]);
        if font.advance_width(&cand) <= max + 1e-3 {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    if lo == 0 {
        "…".to_string()
    } else {
        format!("{}…", &text[..ends[lo - 1]])
    }
}

/// `sv = withSpring(to, { duration, dampingRatio })` restarted by a style at `now_ms`.
fn start_spring(spring: &mut Spring, to: f64, now_ms: f64) {
    let x = spring.value;
    let v = if spring.running { spring.velocity } else { 0.0 };
    let v = if (to > x && v < 0.0) || (to < x && v > 0.0) { 0.0 } else { v };
    let config = reanimated::duration_config(x - to, v, 500.0, 1.0, 4.0);
    if spring.running {
        spring.retarget(to, config);
    } else {
        spring.assign(to, config, now_ms);
    }
}

/// A frame moved by a LinearTransition.
#[derive(Clone, Default)]
struct Moving([Timing; 4]);

impl Moving {
    fn at(r: Rect) -> Moving {
        Moving(r.map(Timing::at))
    }
    fn to(&mut self, r: Rect, ms: f64) {
        for (t, v) in self.0.iter_mut().zip(r) {
            t.to(v, ms, Easing::timing_default());
        }
    }
    fn step(&mut self, now: f64) -> bool {
        self.0.iter_mut().fold(false, |m, t| t.step(now) | m)
    }
    fn rect(&self) -> Rect {
        [self.0[0].value, self.0[1].value, self.0[2].value, self.0[3].value]
    }
}

/// The list's text column: entering (or shown) or exiting, its opacity.
#[derive(Clone)]
struct Texts {
    opacity: Timing,
    exiting: bool,
}

#[derive(Clone, Default)]
struct Card {
    frame: Moving,
    photo: Moving,
    /// The photo's borderRadius (set at the commit).
    radius: f64,
    texts: Vec<Texts>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The cards' layers: one texture of ten, a view per layer to draw into.
    layer_views: Vec<wgpu::TextureView>,
    layer_size: (u32, u32),
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

#[derive(Default)]
struct AnimatedGridList {
    list: bool,
    applied: Option<bool>,
    safe_top: f64,
    safe_bottom: f64,
    quotes: [usize; 2 * CARDS],
    size: (f64, f64),
    scale: f64,
    cards: Vec<Card>,
    scroll: Option<UiScroll>,
    /// The finger's pan, to read the lift's velocity as UIKit reports it to onEndDrag.
    pan: PanGesture,
    last_offset: f64,
    shown_offset: f64,
    scrolling: bool,
    direction: i32,
    decelerating: bool,
    tilt: Spring,
    fonts: Option<(Font, Font)>,
    photos: Option<Images>,
    canvases: Vec<Canvas>,
    renderers: Vec<Renderer>,
    /// The cards' content changed since their layers were drawn.
    dirty: bool,
    /// Per card: its layer is out of date (drawn only once the card is on screen).
    stale: Vec<bool>,
    /// Where in its layer each card's point (0, 0) was drawn (texels): the origin's fraction of
    /// a device pixel then, plus the margin. A scroll since moves the drawn layer as it is.
    drawn_at: Vec<[f32; 2]>,
    gpu: Option<Gpu>,
}

impl AnimatedGridList {
    fn port(&self) -> f64 {
        (self.size.1 - self.safe_top - self.safe_bottom).max(0.0)
    }

    /// Lays the cards out at rest (the first frame, a size change) or starts the toggle's
    /// animations.
    fn apply(&mut self, now: f64) {
        let (w, s) = (self.size.0, self.scale);
        let first = self.applied.is_none() || self.cards.len() != CARDS;
        if first {
            self.cards = (0..CARDS)
                .map(|i| {
                    let (card, photo) = layout(i, self.list, w, s);
                    let texts = if self.list { vec![Texts { opacity: Timing::at(1.0), exiting: false }] } else { Vec::new() };
                    Card { frame: Moving::at(card), photo: Moving::at(photo), radius: if self.list { 32.0 } else { 0.0 }, texts }
                })
                .collect();
        } else {
            let list = self.list;
            for (i, c) in self.cards.iter_mut().enumerate() {
                let (card, photo) = layout(i, list, w, s);
                c.frame.to(card, 700.0);
                c.photo.to(photo, 300.0);
                c.radius = if list { 32.0 } else { 0.0 };
                for t in &mut c.texts {
                    if !t.exiting {
                        // FadeOut: from 1 (its initialValues), wherever FadeIn was.
                        t.exiting = true;
                        t.opacity = Timing::at(1.0);
                        t.opacity.to(0.0, 300.0, Easing::timing_default());
                    }
                }
                if list {
                    let mut opacity = Timing::at(0.0);
                    opacity.to(1.0, 300.0, Easing::timing_default());
                    c.texts.push(Texts { opacity, exiting: false });
                }
            }
            let _ = now;
        }
        self.applied = Some(self.list);
        let (max, port) = (content_height(self.list, w, s) - self.port(), self.port());
        let scroll = self.scroll.get_or_insert_with(|| UiScroll::new(0.0, 0.0, port, ui_scroll::NORMAL, Snap::Free));
        scroll.max = max.max(0.0);
        scroll.port = port;
        self.dirty = true;
    }

    /// The rotation's target.
    fn rotation(&self) -> f64 {
        if self.scrolling && self.direction != 0 {
            if self.direction < 0 { ROTATE } else { -ROTATE }
        } else {
            0.0
        }
    }

    /// onScroll.
    fn scrolled(&mut self, y: f64) {
        if y == self.shown_offset {
            return;
        }
        self.shown_offset = y;
        self.scrolling = true;
        self.direction = if y > self.last_offset { 1 } else { -1 };
    }

    fn scroll_end(&mut self) {
        self.scrolling = false;
        self.direction = 0;
    }

    fn pointer(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64) {
        let Some(scroll) = self.scroll.as_mut() else { return };
        let inside = (y as f64) >= self.safe_top && (y as f64) < self.size.1 - self.safe_bottom;
        if phase == Phase::Down && inside && !scroll.dragging() {
            // A finger catches a decelerating scroll: UIKit ends no momentum (no event).
            self.decelerating = false;
        }
        let was_dragging = scroll.dragging();
        // The scroll runs on y: the recognizers take (y, x).
        scroll.input(id, phase, y, x, ms, inside);
        let release = match self.pan.event(id, phase, y, x, ms, inside) {
            Event::End(p) => Some(ui_scroll::uiscroll_release(p.velocity_x)),
            _ => None,
        };
        let scroll = self.scroll.as_mut().unwrap();
        let (dragging, offset, ended, moving) = (scroll.dragging(), scroll.offset, scroll.take_drag_end(), scroll.moving());
        if !was_dragging && dragging {
            // onBeginDrag: lastOffset.
            self.last_offset = offset;
        }
        self.scrolled(offset);
        if ended {
            // onEndDrag: no velocity ends the scroll; a deceleration or a bounce ends at
            // onMomentumEnd.
            if release.unwrap_or(0.0) == 0.0 {
                self.scroll_end();
            }
            self.decelerating = moving;
        }
    }
}

const COMPOSITE: &str = r#"
struct Card { r0: vec4<f32>, r1: vec4<f32>, r2: vec4<f32>, rect: vec4<f32> };
struct U { cards: array<Card, 10>, canvas: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var layers: texture_2d_array<f32>;
@group(0) @binding(2) var smp: sampler;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
// Each card's layer through its inverse projective transform (screen points → the card's
// points), with hard edges as Core Animation projects a 3D-transformed layer; later cards on top.
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy / u.canvas.z;
    let size = vec2<f32>(textureDimensions(layers));
    var c = vec4<f32>(0.0);
    for (var i = 0; i < 10; i = i + 1) {
        let k = u.cards[i];
        if (k.rect.x <= 0.0) { continue; }
        let h = vec3<f32>(p, 1.0);
        let q = vec3<f32>(dot(k.r0.xyz, h), dot(k.r1.xyz, h), dot(k.r2.xyz, h));
        if (q.z <= 0.0) { continue; }
        let l = q.xy / q.z;
        if (any(l < vec2<f32>(0.0)) || any(l > k.rect.xy)) { continue; }
        let t = (l * u.canvas.z + k.rect.zw) / size;
        let s = textureSampleLevel(layers, smp, t, i, 0.0);
        c = s + c * (1.0 - s.a);
    }
    // Over styles.container's #EEEEEE: the surface is opaque (the web's canvas is opaque-only).
    c = vec4<f32>(c.rgb + vec3<f32>(238.0 / 255.0) * (1.0 - c.a), 1.0);
    if (u.canvas.w > 0.5) { c = vec4<f32>(to_linear(c.rgb / max(c.a, 1e-6)) * c.a, c.a); }
    return c;
}
"#;

impl Surface for AnimatedGridList {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.list = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        self.safe_top = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        self.safe_bottom = inputs.get(2).and_then(|v| v.as_number()).unwrap_or(0.0);
        if let Some(q) = inputs.get(3).and_then(|v| v.as_str()) {
            for (k, n) in q.split(',').take(2 * CARDS).enumerate() {
                self.quotes[k] = n.trim().parse::<usize>().unwrap_or(0).min(QUOTES.len() - 1);
            }
            self.dirty = true;
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        self.pointer(id, gfx::phase(phase), x, y, at_ms);
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"isList\":{},\"offset\":{:.3},\"rotation\":{:.3},\"scrolling\":{},\"direction\":{},\"held\":{}}}",
            self.list,
            self.scroll.as_ref().map_or(0.0, |s| s.offset),
            self.tilt.value,
            self.scrolling,
            self.direction,
            self.pan.tracking()
        ))
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
        let s = frame.scale;
        let resized = self.size != (frame.width as f64, frame.height as f64) || self.scale != s as f64;
        self.size = (frame.width as f64, frame.height as f64);
        self.scale = s as f64;
        if resized {
            self.applied = None;
        }
        if self.applied != Some(self.list) {
            self.apply(now);
        }
        // The scroll, then its onScroll / onMomentumEnd.
        let mut moving = false;
        if let Some(scroll) = self.scroll.as_mut() {
            moving |= scroll.step(now);
            let (offset, still) = (scroll.offset, !scroll.moving());
            self.scrolled(offset);
            if self.decelerating && still {
                self.decelerating = false;
                self.scroll_end();
            }
        }
        let to = self.rotation();
        if self.tilt.target() != to || (!self.tilt.running && self.tilt.value != to) {
            start_spring(&mut self.tilt, to, now);
        }
        moving |= self.tilt.step(now);
        let mut animating = false;
        for c in &mut self.cards {
            animating |= c.frame.step(now) | c.photo.step(now);
            for t in &mut c.texts {
                animating |= t.opacity.step(now);
            }
            c.texts.retain(|t| !(t.exiting && !t.opacity.running));
        }
        if self.fonts.is_none() {
            self.fonts = skia::match_ui_font(14.0, 400.0).zip(skia::match_ui_font(12.0, 400.0));
        }
        if self.photos.is_none() {
            let decoded: Vec<skia::Image> = PHOTOS.iter().map(|b| skia::Image::from_jpeg(b).unwrap_or(skia::Image { width: 1, height: 1, pixels: vec![200, 200, 200, 255] })).collect();
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            self.photos = Some(Images::upload(device, queue, &refs));
        }
        // The layers: one per card, the size of the largest card frame either layout has.
        let (w, _) = self.size;
        let lw = ((0.9 * w + 1.0) as f32 * s + 2.0 * MARGIN).ceil() as u32;
        let lh = (((0.425 * w).max(100.0) + 1.0) as f32 * s + 2.0 * MARGIN).ceil() as u32;
        let stale = self.gpu.as_ref().is_none_or(|g| g.format != format || g.generation != frame.shader_generation || g.layer_size != (lw, lh));
        if stale {
            self.gpu = Some(build(device, format, frame, lw, lh));
            self.dirty = true;
        }
        if self.renderers.len() != CARDS {
            self.renderers = (0..CARDS).map(|_| Renderer::default()).collect();
            self.canvases = (0..CARDS).map(|_| Canvas::default()).collect();
            self.dirty = true;
        }
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let origins: Vec<[f64; 2]> = self.cards.iter().map(|c| {
            let r = c.frame.rect();
            [r[0], self.safe_top + r[1] - offset]
        }).collect();
        if self.dirty || animating || self.stale.len() != CARDS {
            self.stale = vec![true; CARDS];
            self.dirty = false;
        }
        // Only the cards on screen (even tilted) are drawn; the others when they come in.
        let vh = self.size.1;
        let visible: Vec<bool> = self.cards.iter().zip(&origins).map(|(c, o)| {
            let h = c.frame.rect()[3];
            o[1] + h >= -h && o[1] <= vh + h
        }).collect();
        if (0..CARDS).any(|i| self.stale[i] && visible[i]) {
            self.draw_layers(device, queue, encoder, &origins, &visible);
        }
        // The composite: per card the inverse of translate(origin + centre) · perspective ·
        // rotateX · translate(−centre).
        let gpu = self.gpu.as_ref().unwrap();
        let mut data = vec![0f32; CARDS * 16 + 4];
        let angle = (self.tilt.value as f32).to_radians();
        for (i, c) in self.cards.iter().enumerate() {
            let r = c.frame.rect();
            let o = origins[i];
            if !visible[i] {
                continue; // off screen even tilted
            }
            let (cx, cy) = ((r[2] / 2.0) as f32, (r[3] / 2.0) as f32);
            let m = Matrix4::translate(o[0] as f32 + cx, o[1] as f32 + cy, 0.0)
                .multiply(Matrix4::perspective(PERSPECTIVE))
                .multiply(Matrix4::rotate_x(angle))
                .multiply(Matrix4::translate(-cx, -cy, 0.0));
            let Some(inv) = m.to_matrix3().invert() else { continue };
            let rows = inv.rows();
            let base = i * 16;
            for (k, row) in rows.iter().enumerate() {
                data[base + 4 * k..base + 4 * k + 4].copy_from_slice(row);
            }
            let at = self.drawn_at.get(i).copied().unwrap_or([MARGIN; 2]);
            data[base + 12..base + 16].copy_from_slice(&[r[2] as f32, r[3] as f32, at[0], at[1]]);
        }
        let n = CARDS * 16;
        data[n..n + 4].copy_from_slice(&[frame.width * s, frame.height * s, s, if format.is_srgb() { 1.0 } else { 0.0 }]);
        let bytes: Vec<u8> = data.iter().flat_map(|f| f.to_le_bytes()).collect();
        queue.write_buffer(&gpu.uniforms, 0, &bytes);
        skia::render::fullscreen_pass(encoder, "animated grid list", target, &gpu.pipeline, &gpu.bind);
        moving || animating || self.decelerating || self.pan.tracking()
    }
}

impl AnimatedGridList {
    /// Each card's layer: its frame now, at its origin's sub-pixel offset.
    fn draw_layers(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, origins: &[[f64; 2]], visible: &[bool]) {
        let s = self.scale as f32;
        let gpu = self.gpu.as_ref().unwrap();
        let photos = self.photos.as_ref().unwrap();
        let (layer_w, layer_h) = gpu.layer_size;
        let w = self.size.0;
        self.drawn_at.resize(CARDS, [MARGIN; 2]);
        for (i, c) in self.cards.iter().enumerate() {
            if !(self.stale[i] && visible[i]) {
                continue;
            }
            self.stale[i] = false;
            let r = c.frame.rect();
            let o = origins[i];
            // At the origin's fraction of a device pixel: at rest, texel for pixel.
            let frac = |v: f64| ((v * s as f64) - (v * s as f64).floor()) as f32 + MARGIN;
            let at = [frac(o[0]), frac(o[1])];
            self.drawn_at[i] = at;
            let canvas = &mut self.canvases[i];
            canvas.begin(s);
            canvas.concat(Matrix::translate(at[0] / s, at[1] / s));
            let (cw, ch) = (r[2] as f32, r[3] as f32);
            canvas.save();
            canvas.clip_continuous_rrect(0.0, 0.0, cw, ch, 10.0);
            canvas.draw_rect(0.0, 0.0, cw, ch, &Paint::fill(Color::WHITE));
            // The photo, covered (UIViewContentModeScaleAspectFill), its radius clamped.
            let p = c.photo.rect();
            let (px, py, pw, ph) = (p[0] as f32, p[1] as f32, p[2] as f32, p[3] as f32);
            let img = photos.image(i);
            let (iw, ih) = (img.width as f64, img.height as f64);
            let k = (pw as f64 / iw).max(ph as f64 / ih) as f32;
            let (dx, dy) = (px + (pw - iw as f32 * k) / 2.0, py + (ph - ih as f32 * k) / 2.0);
            let to = Matrix::translate(-dx, -dy).then(Matrix::scale(1.0 / k, 1.0 / k));
            let radius = (c.radius as f32).min(pw / 2.0).min(ph / 2.0);
            canvas.save();
            canvas.clip_rrect(px, py, pw, ph, radius);
            canvas.draw_rect(px, py, pw, ph, &Paint::image(img, to));
            canvas.restore();
            if let Some((title_font, sub_font)) = self.fonts.as_ref() {
                for t in &c.texts {
                    let a = t.opacity.value as f32;
                    if a <= 0.0 {
                        continue;
                    }
                    // The column: after the 64 photo and its margins, centred in the 100 row:
                    // the title's box (one line, ceiled) + 2 + the subtitle's.
                    let th = text_side(gfx::line_height(title_font) as f64, self.scale);
                    let sh = text_side(gfx::line_height(sub_font) as f64, self.scale);
                    let top = yr((100.0 - (th + 2.0 + sh)) / 2.0, self.scale) as f32;
                    let left = 96.0;
                    // Yoga's column is 80 % of the card's inner width; the title 80 % of it.
                    let title_max = (0.8 * 0.8 * 0.9 * w) as f32;
                    let title = truncate(title_font, QUOTES[self.quotes[2 * i]], title_max);
                    let sub = truncate(sub_font, QUOTES[self.quotes[2 * i + 1]], 200.0);
                    let black = Paint::fill(Color::BLACK).with_opacity(a);
                    let grey = Paint::fill(Color::hex(0x383838)).with_opacity(a);
                    canvas.draw_text(&title, left, gfx::baseline(title_font, top), title_font, &black);
                    canvas.draw_text(&sub, left, gfx::baseline(sub_font, top + th as f32 + 2.0), sub_font, &grey);
                }
            }
            canvas.restore();
            let view = &gpu.layer_views[i];
            self.renderers[i].set_images(photos);
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], view, wgpu::TextureFormat::Rgba8Unorm, layer_w, layer_h, wgpu::Color::TRANSPARENT);
        }
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, frame: &Frame, lw: u32, lh: u32) -> Gpu {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("animated grid list cards"),
        size: wgpu::Extent3d { width: lw, height: lh, depth_or_array_layers: CARDS as u32 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let layer_views = (0..CARDS as u32)
        .map(|l| texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2), base_array_layer: l, array_layer_count: Some(1), ..Default::default() }))
        .collect();
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("animated grid list"), source: wgpu::ShaderSource::Wgsl(COMPOSITE.into()) });
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("animated grid list"),
        entries: &[
            wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2Array, multisampled: false },
                count: None,
            },
            wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
        ],
    });
    let pipeline = skia::render::fullscreen_pipeline(device, &module, &layout, "fs", format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("animated grid list"), size: ((CARDS * 16 + 4) * 4) as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = skia::render::linear_sampler(device);
    let view = texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("animated grid list"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&view) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation: frame.shader_generation, layer_views, layer_size: (lw, lh), pipeline, uniforms, bind }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yoga_lays_the_cards_out() {
        // iPhone Air, 420 wide, 3×: the grid's second column starts at 220.5 → 662 px.
        let (c0, p0) = layout(0, false, 420.0, 3.0);
        let (c1, p1) = layout(1, false, 420.0, 3.0);
        assert_eq!((c0[0] * 3.0, c0[2] * 3.0), (63.0, 536.0));
        assert!(((c1[0] * 3.0) - 662.0).abs() < 1e-6 && ((c1[2] * 3.0) - 535.0).abs() < 1e-6, "{c1:?}");
        // The photo: −10.75 relative, half up → −32 px; 600 px wide from the absolute edges.
        assert!((p0[0] * 3.0 + 32.0).abs() < 1e-6 && (p0[2] * 3.0 - 600.0).abs() < 1e-6, "{p0:?}");
        assert!((p1[0] * 3.0 + 32.0).abs() < 1e-6, "{p1:?}");
        let (l3, _) = layout(3, true, 420.0, 3.0);
        assert_eq!(l3, [21.0, 360.0, 378.0, 100.0]);
        assert!((content_height(false, 420.0, 3.0) - 992.6666).abs() < 1e-3);
    }

    #[test]
    fn a_reversing_tilt_starts_from_rest() {
        let mut t = Spring::at(0.0);
        start_spring(&mut t, -20.0, 0.0);
        for i in 1..10 {
            t.step(i as f64 * 16.667);
        }
        assert!(t.velocity < 0.0);
        let x = t.value;
        // Up now: +20, the downward velocity is dropped (Reanimated), the stiffness from rest.
        start_spring(&mut t, 20.0, 170.0);
        let mut fresh = Spring::at(x);
        fresh.to(20.0, 0.0, reanimated::duration_config(x - 20.0, 0.0, 500.0, 1.0, 4.0));
        t.step(166.67);
        fresh.step(0.0);
        fresh.step(16.667);
        assert!((t.value - fresh.value).abs() < 1e-6, "{} {}", t.value, fresh.value);
    }

    #[test]
    fn the_tail_is_truncated_to_fit() {
        let Some(f) = skia::match_ui_font(14.0, 400.0) else { return };
        let t = truncate(&f, QUOTES[2], 241.92);
        assert!(t.ends_with('…') && f.advance_width(&t) <= 241.93, "{t}");
        assert_eq!(truncate(&f, "Life", 241.92), "Life");
    }

    #[test]
    fn a_toggle_starts_every_animation_on_the_same_frame() {
        let gpu = match exact_gpu::fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = AnimatedGridList::default();
        let quotes = Value::from((0..20).map(|i| (i % 13).to_string()).collect::<Vec<_>>().join(","));
        s.bind(&[Value::Bool(false), Value::Number(68.0), Value::Number(34.0), quotes.clone()], None).unwrap();
        let (img, _) = exact_gpu::fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        // The first card at (21, 68): white inside its corner.
        assert_eq!(img.at(63 + 300, 204 + 300)[3], 255);
        // Between the two columns and below the first row: the container's #EEEEEE.
        assert_eq!(img.at(630, 300), [238, 238, 238, 255]);
        assert_eq!(img.at(300, 204 + 536 + 30), [238, 238, 238, 255]);
        s.bind(&[Value::Bool(true), Value::Number(68.0), Value::Number(34.0), quotes], None).unwrap();
        exact_gpu::fixture::render(&gpu, &mut s, &frame(16.0)).unwrap();
        exact_gpu::fixture::render(&gpu, &mut s, &frame(32.0)).unwrap();
        for c in &s.cards {
            // 16 ms into both: the card's 700 ms and the photo's 300 ms, from the same frame.
            let (f, p) = (&c.frame.0[2], &c.photo.0[2]);
            assert!(f.running && p.running);
        }
        let w0 = s.cards[0].photo.0[2].value;
        let e = Easing::timing_default().at(16.0 / 300.0);
        assert!((w0 - (600.0 / 3.0 + (64.0 - 200.0) * e)).abs() < 1e-6, "{w0}");
        let mut ms = 32.0;
        while exact_gpu::fixture::render(&gpu, &mut s, &frame(ms)).unwrap().1 && ms < 3000.0 {
            ms += 16.0;
        }
        assert!(ms < 1000.0, "{ms}");
        assert_eq!(s.cards[1].frame.rect(), [21.0, 120.0, 378.0, 100.0]);
    }
}
