//! Circular Carousel (src/animations/circular-carousel: index.tsx, components/circular-list/
//! index.tsx, components/circular-list/list-item.tsx): nine round photos on a horizontal FlatList
//! that bends into an arc as it scrolls; the Scale switch (Contract) springs the arc's scale on
//! and off. This surface is the list: absolute at the bottom, the window wide, LIST_ITEM_WIDTH × 3
//! tall.
//!
//! - The FlatList: horizontal, pagingEnabled, snapToInterval LIST_ITEM_WIDTH (W / 4), default
//!   decelerationRate (normal). On iOS snapToInterval overrides pagingEnabled (ScrollView.js), so
//!   a release snaps to a multiple of W / 4 (RCTEnhancedScrollView's ceil / floor / round by the
//!   velocity's sign): `ui_scroll`, UIKit's drag, rubber band, bounce and deceleration as
//!   measured. Content: the nine cells then paddingRight 3 × W / 4, alignItems center.
//! - Each cell (list-item.tsx): W / 4 square; transform [translateX W / 4 × 1.5, translateY,
//!   scale] about its centre, opacity. Over (index − 2 … index + 2) × W / 4: translateY [0, −W/12,
//!   −W/8, −W/12, 0] EXTEND; opacity [0.5, 1, 1, 1, 0.5] CLAMP; scale over the output range
//!   scaleOutputRange, CLAMP, where scaleOutputRange = withSpring([0.5, 0.9, 1.2, 0.9, 0.5] or
//!   [1, 1, 1, 1, 1]) (Reanimated's default spring, GENTLE: 900 / 120 / 4) each time the switch
//!   flips: each of the five outputs springs on its own, from where it is.
//! - Inside: imageContainer margin 8, borderRadius 100 continuous, boxShadow 0 0 10px
//!   rgba(0,0,0,0.1) (RCTBoxShadow: blur / 2 sigma, its path the circular rounded rect, outside the
//!   view only); the image fills it, borderRadius 100 continuous, a 2 pt white Core Animation
//!   border along the continuous outline, expo-image contentFit cover. Each cell is one layer
//!   for its opacity: shadow, ring and photo do not overlap, so per-draw alpha is the same.
//! - The photos: index.tsx's Unsplash URLs (w=400), bundled (gpu/images/circular-carousel).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring, GENTLE};
use skia::{fit_cover, Canvas, Color, Images, Matrix, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

const COUNT: usize = 9;
/// imageContainer margin.
const MARGIN: f64 = 8.0;
/// borderRadius (clamped to half the side).
const RADIUS: f32 = 100.0;
/// The image's borderWidth.
const BORDER: f32 = 2.0;
/// boxShadow blur 10px: sigma 5; rgba(0, 0, 0, 0.1).
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.1;
const SHOW: [f64; 5] = [0.5, 0.9, 1.2, 0.9, 0.5];
const AVOID: [f64; 5] = [1.0; 5];

static PHOTOS: [&[u8]; COUNT] = [
    include_bytes!("../images/circular-carousel/01.jpg"),
    include_bytes!("../images/circular-carousel/02.jpg"),
    include_bytes!("../images/circular-carousel/03.jpg"),
    include_bytes!("../images/circular-carousel/04.jpg"),
    include_bytes!("../images/circular-carousel/05.jpg"),
    include_bytes!("../images/circular-carousel/06.jpg"),
    include_bytes!("../images/circular-carousel/07.jpg"),
    include_bytes!("../images/circular-carousel/08.jpg"),
    include_bytes!("../images/circular-carousel/09.jpg"),
];

/// The demo's surface: input `scaleEnabled`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Circular {
        scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
        width: 0.0,
        enabled: None,
        outputs: std::array::from_fn(|_| Spring::at(1.0)),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        images: None,
    })
}

struct Circular {
    scroll: UiScroll,
    width: f64,
    enabled: Option<bool>,
    /// scaleOutputRange, each value springing.
    outputs: [Spring; 5],
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
}

/// One cell's style at offset `x` for item width `item` and the scale outputs.
fn cell(x: f64, index: usize, item: f64, outputs: &[f64; 5]) -> (f64, f64, f64) {
    let i = index as f64;
    let input: [f64; 5] = std::array::from_fn(|k| (i + k as f64 - 2.0) * item);
    let ty = interpolate(x, &input, &[0.0, -item / 3.0, -item / 2.0, -item / 3.0, 0.0], Extrapolation::Extend);
    let opacity = interpolate(x, &input, &[0.5, 1.0, 1.0, 1.0, 0.5], Extrapolation::Clamp);
    let scale = interpolate(x, &input, outputs, Extrapolation::Clamp);
    (ty, opacity, scale)
}

/// Yoga's pixel grid.
fn grid(v: f64, scale: f64) -> f64 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

impl Surface for Circular {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let on = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        match self.enabled {
            // The first value: no spring (useDerivedValue's first run).
            None => {
                let range = if on { SHOW } else { AVOID };
                for (s, v) in self.outputs.iter_mut().zip(range) {
                    s.set(v);
                }
            }
            Some(was) if was != on => {
                let range = if on { SHOW } else { AVOID };
                for (s, v) in self.outputs.iter_mut().zip(range) {
                    let velocity = s.velocity;
                    s.to(v, velocity, GENTLE);
                }
            }
            _ => {}
        }
        self.enabled = Some(on);
        if let Some(x) = inputs.get(1).and_then(|v| v.as_number()) {
            self.scroll.offset = x;
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"contentOffset\":{:.2},\"scaleOutputRange\":[{}]}}", self.scroll.offset, self.outputs.iter().map(|s| format!("{:.4}", s.value)).collect::<Vec<_>>().join(",")))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The FlatList is this canvas.
        let (w, h) = (self.width as f32, self.width as f32 * 0.75);
        let inside = (0.0..=w).contains(&x) && (0.0..=h).contains(&y);
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
        let (w, h, scale) = (frame.width as f64, frame.height as f64, frame.scale as f64);
        let item = w / 4.0;
        if self.width != w {
            self.width = w;
            self.scroll.port = w;
            // Nine cells and paddingRight 3 × LIST_ITEM_WIDTH.
            self.scroll.max = (COUNT as f64 * item + 3.0 * item - w).max(0.0);
            self.scroll.snap = Snap::Interval(item);
        }
        if self.images.is_none() {
            let decoded: Vec<skia::Image> = PHOTOS
                .iter()
                .map(|b| skia::Image::from_jpeg(b).unwrap_or(skia::Image { width: 1, height: 1, pixels: vec![200, 200, 200, 255] }))
                .collect();
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let mut moving = self.scroll.step(frame.now_ms);
        for s in &mut self.outputs {
            moving |= s.step(frame.now_ms);
        }
        let outputs: [f64; 5] = std::array::from_fn(|k| self.outputs[k].value);
        let x = self.scroll.offset;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(images) = self.images.as_ref() {
            // alignItems center in the list's height.
            let top = grid((h - item) / 2.0, scale);
            let side = item - 2.0 * MARGIN;
            for i in 0..COUNT {
                let (ty, opacity, s) = cell(x, i, item, &outputs);
                if opacity <= 0.0 {
                    continue;
                }
                let left = grid(i as f64 * item, scale) - x;
                let (cx, cy) = (left + item / 2.0, top + item / 2.0);
                c.save();
                c.concat(
                    Matrix::translate(-cx as f32, -cy as f32)
                        .then(Matrix::scale(s as f32, s as f32))
                        .then(Matrix::translate((cx + item * 1.5) as f32, (cy + ty) as f32)),
                );
                c.opacity(opacity as f32);
                let (bx, by, bs) = ((left + MARGIN) as f32, (top + MARGIN) as f32, side as f32);
                let round = bs / 2.0;
                // The shadow, outside the view only.
                c.save();
                c.clip_with(|b| {
                    let e = 3.0 * SHADOW_SIGMA + 2.0 * (2.0 * SHADOW_SIGMA + 1.0);
                    skia::add_rect(b, bx - e, by - e, bs + 2.0 * e, bs + 2.0 * e);
                    skia::add_rrect_hole(b, bx, by, bs, bs, round);
                });
                c.draw_rrect_shadow_local(bx, by, bs, bs, round, SHADOW_SIGMA, Color::BLACK.alpha(SHADOW_ALPHA));
                c.restore();
                // The border ring and the photo inside it.
                let outer = skia::continuous_rrect_path(bx, by, bs, bs, RADIUS);
                let inner = skia::continuous_rrect_path(bx + BORDER, by + BORDER, bs - 2.0 * BORDER, bs - 2.0 * BORDER, RADIUS - BORDER);
                c.draw_path_events(outer.iter().chain(inner.reversed()), &Paint::fill(Color::WHITE));
                let photo = images.image(i);
                let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), Rect::new(bx, by, bs, bs));
                c.draw_path(&inner, &Paint::image(photo, placed.invert()));
                c.restore();
            }
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.scroll.moving()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_arc_and_the_scale_spring() {
        let item = 105.0;
        let (ty, o, s) = cell(0.0, 0, item, &SHOW);
        assert_eq!((ty, o, s), (-52.5, 1.0, 1.2));
        let (ty, o, s) = cell(0.0, 2, item, &SHOW);
        assert_eq!((ty, o, s), (0.0, 0.5, 0.5));
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 315.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut sf = surface();
        sf.bind(&[Value::Bool(false)], None).unwrap();
        let (img, moving) = fixture::render(&gpu, sf.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "circular-rest", [244, 244, 246]);
        assert!(!moving);
        // Flip the switch: the outputs spring toward the arc's scale.
        sf.bind(&[Value::Bool(true)], None).unwrap();
        let mut ms = 0.0;
        while fixture::render(&gpu, sf.as_mut(), &frame(ms)).unwrap().1 && ms < 5000.0 {
            ms += 16.7;
        }
        assert!(sf.agent("{}").unwrap().contains("[0.5000,0.9000,1.2000,0.9000,0.5000]"), "{}", sf.agent("{}").unwrap());
        // A slow drag of 40 pt rounds back; a flick moves on.
        let touch = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 150.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        ms += 100.0;
        sf.input(&touch(PointerPhase::Down, 300.0, ms));
        for k in 1..=40 {
            sf.input(&touch(PointerPhase::Move, 300.0 - k as f32, ms + 30.0 * k as f64));
        }
        sf.input(&touch(PointerPhase::Up, 260.0, ms + 1500.0));
        ms += 1500.0;
        while fixture::render(&gpu, sf.as_mut(), &frame(ms)).unwrap().1 && ms < 20_000.0 {
            ms += 16.7;
        }
        assert!(sf.agent("{}").unwrap().starts_with("{\"contentOffset\":0.00"), "{}", sf.agent("{}").unwrap());
    }
}
