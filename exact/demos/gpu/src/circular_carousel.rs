//! Circular Carousel: nine round photos on a horizontal strip that bends into an arc as it
//! scrolls. The scale switch springs the arc's scale on and off.
//!
//! - A release snaps to a multiple of a quarter of the width. The snap interval, not paging,
//!   decides the target.
//! - Each photo's position, scale and opacity come from the scroll offset and the scale outputs.
//!   Photos are drawn into one offscreen layer, even indices left and odd right, then composited
//!   at their opacity.
//! - Photos are bundled pre-decoded, downscaled the way the platform image view does it, so they
//!   match the platform's output.
//! - Haptics: a selection each time the photo at the arc's crown changes, during the drag and the
//!   glide. Hysteresis at the half-item line keeps a hovering finger from flapping, and selections
//!   come at most one per HAPTIC_GAP_MS. A rigid impact each time the strip is pulled or thrown
//!   past an end.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring, GENTLE};
use skia::{Canvas, Color, Images, Matrix, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

const COUNT: usize = 9;
/// Photo inset from the cell edge, pt.
const MARGIN: f64 = 8.0;
/// Corner radius, pt; clamped to a circle.
const RADIUS: f32 = 100.0;
/// White ring width, pt.
const BORDER: f32 = 2.0;
/// Shadow sigma, pt.
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.1;
const SHOW: [f64; 5] = [0.5, 0.9, 1.2, 0.9, 0.5];
const AVOID: [f64; 5] = [1.0; 5];
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;
/// How far past the half-item line the offset goes before the crown changes, pt.
const SWITCH: f64 = 6.0;

/// Each photo as RGB rows, zlib-compressed, with its size.
static PHOTOS: [(&[u8], u32, u32); COUNT] = [
    (include_bytes!("../images/circular-carousel/01-400x250.rgb8.zlib"), 400, 250),
    (include_bytes!("../images/circular-carousel/02-400x267.rgb8.zlib"), 400, 267),
    (include_bytes!("../images/circular-carousel/03-400x250.rgb8.zlib"), 400, 250),
    (include_bytes!("../images/circular-carousel/04-267x402.rgb8.zlib"), 267, 402),
    (include_bytes!("../images/circular-carousel/05-400x250.rgb8.zlib"), 400, 250),
    (include_bytes!("../images/circular-carousel/06-400x250.rgb8.zlib"), 400, 250),
    (include_bytes!("../images/circular-carousel/07-267x402.rgb8.zlib"), 267, 402),
    (include_bytes!("../images/circular-carousel/08-400x267.rgb8.zlib"), 400, 267),
    (include_bytes!("../images/circular-carousel/09-267x402.rgb8.zlib"), 267, 402),
];
/// Pixel sizes of the downloaded photos.
const DOWNLOADED: [(f64, f64); COUNT] = [(400.0, 250.0), (400.0, 267.0), (400.0, 250.0), (400.0, 600.0), (400.0, 250.0), (400.0, 250.0), (400.0, 600.0), (400.0, 267.0), (400.0, 600.0)];

fn decode(&(bytes, w, h): &(&[u8], u32, u32)) -> skia::Image {
    let rgb = miniz_oxide::inflate::decompress_to_vec_zlib(bytes).unwrap_or_default();
    if rgb.len() != (w * h * 3) as usize {
        return skia::Image { width: 1, height: 1, pixels: vec![200, 200, 200, 255] };
    }
    let mut rgba = vec![255u8; (w * h * 4) as usize];
    for (d, s) in rgba.chunks_exact_mut(4).zip(rgb.chunks_exact(3)) {
        d[..3].copy_from_slice(s);
    }
    skia::Image::from_rgba(w, h, rgba)
}

/// Where photo `index` draws in its square view, in points: covered at its ideal size, downscaled
/// first when both its sides are large, then centred.
fn photo_rect(index: usize, left: f32, top: f32, side: f32, scale: f32, drawn: (f32, f32)) -> Rect {
    let (iw, ih) = DOWNLOADED[index];
    let side = side as f64;
    let a = (side / iw).max(side / ih);
    let (lw, lh) = (iw * a, ih * a);
    let (rw, rh) = (lw.ceil(), lh.ceil());
    // The image's size in points: the downscaled one at `scale`, else the download at 1.
    let (pw, ph) = if iw > rw * scale as f64 && ih > rh * scale as f64 { (drawn.0 as f64 / scale as f64, drawn.1 as f64 / scale as f64) } else { (drawn.0 as f64, drawn.1 as f64) };
    let fill = (lw / pw).max(lh / ph);
    let (dw, dh) = (pw * fill, ph * fill);
    let (x, y) = ((side - lw) / 2.0 + (lw - dw) / 2.0, (side - lh) / 2.0 + (lh - dh) / 2.0);
    Rect::new(left + x as f32, top + y as f32, dw as f32, dh as f32)
}

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
        group: None,
        group_size: (0, 0),
        group_canvas: Canvas::default(),
        group_renderer: Renderer::default(),
        centred: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    })
}

struct Circular {
    scroll: UiScroll,
    width: f64,
    enabled: Option<bool>,
    /// Scale per arc position, each springing to its target.
    outputs: [Spring; 5],
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
    /// The cells' layers (allowsGroupOpacity), even indices on the left half, odd on the right:
    /// twice the canvas's pixel width. The screen pass composites each from here.
    group: Option<(Images, wgpu::TextureView)>,
    group_size: (u32, u32),
    group_canvas: Canvas,
    group_renderer: Renderer,
    /// The photo at the crown, and whether the strip is past an end (their haptics).
    centred: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
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

/// Cell `i` through `m`: its shadow, the white ring as a disc, the photo in the ring's inner circle.
#[allow(clippy::too_many_arguments)]
fn draw_cell(c: &mut Canvas, images: &Images, i: usize, left: f64, top: f64, item: f64, m: Matrix, scale: f32) {
    let side = item - 2.0 * MARGIN;
    c.save();
    c.concat(m);
    let (bx, by, bs) = ((left + MARGIN) as f32, (top + MARGIN) as f32, side as f32);
    let round = bs / 2.0;
    let (cx, cy) = (bx + round, by + round);
    // The shadow, outside the view only.
    c.save();
    c.clip_with(|b| {
        let e = 3.0 * SHADOW_SIGMA + 2.0 * (2.0 * SHADOW_SIGMA + 1.0);
        skia::add_rect(b, bx - e, by - e, bs + 2.0 * e, bs + 2.0 * e);
        skia::add_rrect_hole(b, bx, by, bs, bs, round);
    });
    c.draw_rrect_shadow_local(bx, by, bs, bs, round, SHADOW_SIGMA, Color::BLACK.alpha(SHADOW_ALPHA));
    c.restore();
    c.draw_circle(cx, cy, round.min(RADIUS), &Paint::fill(Color::WHITE));
    let photo = images.image(i);
    let r = photo_rect(i, bx, by, bs, scale, (photo.width, photo.height));
    let placed = Matrix::scale(r.width / photo.width, r.height / photo.height).then(Matrix::translate(r.x, r.y));
    c.draw_circle(cx, cy, round.min(RADIUS) - BORDER, &Paint::image(photo, placed.invert()));
    c.restore();
}

impl Circular {
    /// A selection when the photo at the crown changes (one per HAPTIC_GAP_MS at most), a rigid
    /// thunk once per pull past an end.
    fn haptics(&mut self, x: f64, item: f64, now: f64) {
        let f = x / item;
        let centred = match self.centred {
            Some(c) if (f - c as f64).abs() < 0.5 + SWITCH / item => c,
            _ => f.round().clamp(0.0, (COUNT - 1) as f64) as i64,
        };
        if self.centred.is_some_and(|c| c != centred) && now - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = now;
        }
        self.centred = Some(centred);
        if x < -PAST_END || x > self.scroll.max + PAST_END {
            if !self.past_end {
                self.posted.push("haptic:impact-rigid".into());
            }
            self.past_end = true;
        } else if (0.0..=self.scroll.max).contains(&x) {
            self.past_end = false;
        }
    }
}

/// Snaps to the device-pixel grid.
fn grid(v: f64, scale: f64) -> f64 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

impl Surface for Circular {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let on = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        match self.enabled {
            // First value: no animation.
            None => {
                let range = if on { SHOW } else { AVOID };
                for (s, v) in self.outputs.iter_mut().zip(range) {
                    s.set(v);
                }
            }
            Some(was) if was != on => {
                let range = if on { SHOW } else { AVOID };
                // Each output springs from where it is, dropping any velocity that points away.
                for (s, v) in self.outputs.iter_mut().zip(range) {
                    s.retarget(v, GENTLE);
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

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The strip: the window's width, three quarters of it tall.
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
            // Nine cells plus three item widths of trailing padding.
            self.scroll.max = (COUNT as f64 * item + 3.0 * item - w).max(0.0);
            self.scroll.snap = Snap::Interval(item);
        }
        if self.images.is_none() {
            let decoded: Vec<skia::Image> = PHOTOS.iter().map(decode).collect();
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.group_renderer.set_images(&images);
            self.images = Some(images);
        }
        let (pw, ph) = frame.pixels();
        if self.group_size != (pw, ph) || self.group.is_none() {
            self.group_size = (pw, ph);
            let t = Images::target(device, 2 * pw, ph);
            let v = t.render_view();
            self.renderer.set_images(&t);
            self.group = Some((t, v));
        }
        let mut moving = self.scroll.step(frame.now_ms);
        for s in &mut self.outputs {
            moving |= s.step(frame.now_ms);
        }
        let outputs: [f64; 5] = std::array::from_fn(|k| self.outputs[k].value);
        let x = self.scroll.offset;
        self.haptics(x, item, frame.now_ms);
        let fs = frame.scale;
        self.canvas.begin(fs);
        self.group_canvas.begin(fs);
        if let (Some(images), Some((layer, _))) = (self.images.as_ref(), self.group.as_ref()) {
            // Cells are centred vertically.
            let top = grid((h - item) / 2.0, scale);
            for i in 0..COUNT {
                let (ty, opacity, s) = cell(x, i, item, &outputs);
                if opacity <= 0.0 {
                    continue;
                }
                let left = grid(i as f64 * item, scale) - x;
                let (cx, cy) = (left + item / 2.0, top + item / 2.0);
                let (sx, sy) = (cx + item * 1.5, cy + ty);
                // The cell's reach on screen (its shadow's included), points.
                let reach = ((item / 2.0 - MARGIN) + 3.0 * SHADOW_SIGMA as f64) * s + 1.0;
                if sx + reach < 0.0 || sx - reach > w || sy + reach < 0.0 || sy - reach > h {
                    continue;
                }
                let half = (i % 2) as f32 * w as f32;
                let m = Matrix::translate(-cx as f32, -cy as f32)
                    .then(Matrix::scale(s as f32, s as f32))
                    .then(Matrix::translate((sx as f32) + half, sy as f32));
                draw_cell(&mut self.group_canvas, images, i, left, top, item, m, fs);
                // The layer at its opacity, pixel for pixel.
                let (x0, y0) = (((sx - reach) * scale).floor() / scale, ((sy - reach) * scale).floor() / scale);
                let (x1, y1) = (((sx + reach) * scale).ceil() / scale, ((sy + reach) * scale).ceil() / scale);
                self.canvas.draw_rect(
                    x0 as f32,
                    y0 as f32,
                    (x1 - x0) as f32,
                    (y1 - y0) as f32,
                    &Paint::image(layer.image(0), Matrix::translate(half, 0.0).then(Matrix::scale(fs, fs))).with_opacity(opacity as f32),
                );
            }
        }
        if let Some((_, view)) = self.group.as_ref() {
            self.group_renderer.draw(device, queue, encoder, &self.group_canvas, view, wgpu::TextureFormat::Rgba8Unorm, 2 * pw, ph, wgpu::Color::TRANSPARENT);
        }
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
        sf.bind(&[Value::Bool(true)], None).unwrap();
        let mut ms = 0.0;
        while fixture::render(&gpu, sf.as_mut(), &frame(ms)).unwrap().1 && ms < 5000.0 {
            ms += 16.7;
        }
        assert!(sf.agent("{}").unwrap().contains("[0.5000,0.9000,1.2000,0.9000,0.5000]"), "{}", sf.agent("{}").unwrap());
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
        // A slow drag past the half item moves the crown once; a pull past the start is one rigid impact.
        assert!(sf.messages().is_empty());
        let drag = |sf: &mut Box<dyn Surface>, ms: &mut f64, by: f32| {
            sf.input(&touch(PointerPhase::Down, 200.0, *ms));
            for k in 1..=40 {
                sf.input(&touch(PointerPhase::Move, 200.0 - by * k as f32 / 40.0, *ms + 30.0 * k as f64));
                fixture::render(&gpu, sf.as_mut(), &frame(*ms + 30.0 * k as f64)).unwrap();
            }
            sf.input(&touch(PointerPhase::Up, 200.0 - by, *ms + 1500.0));
            *ms += 1500.0;
            while fixture::render(&gpu, sf.as_mut(), &frame(*ms)).unwrap().1 && *ms < 40_000.0 {
                *ms += 16.7;
            }
        };
        ms += 100.0;
        drag(&mut sf, &mut ms, 80.0);
        assert_eq!(sf.messages(), vec!["haptic:selection"]);
        ms += 100.0;
        drag(&mut sf, &mut ms, -150.0);
        assert_eq!(sf.messages(), vec!["haptic:selection", "haptic:impact-rigid"]);
    }

    #[test]
    fn hovering_on_the_half_item_line_plays_one_selection() {
        let mut s = Circular {
            scroll: UiScroll::new(0.0, 0.0, 0.0, NORMAL, Snap::Free),
            width: 0.0,
            enabled: None,
            outputs: std::array::from_fn(|_| Spring::at(1.0)),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
            images: None,
            group: None,
            group_size: (0, 0),
            group_canvas: Canvas::default(),
            group_renderer: Renderer::default(),
            centred: None,
            past_end: false,
            haptic_at: f64::NEG_INFINITY,
            posted: Vec::new(),
        };
        s.scroll.max = 1000.0;
        let item = 100.0;
        s.haptics(0.0, item, 0.0);
        for k in 0..40 {
            s.haptics(if k % 2 == 0 { 53.0 } else { 47.0 }, item, 100.0 * k as f64);
        }
        assert!(s.posted.is_empty(), "{:?}", s.posted);
        s.haptics(57.0, item, 5000.0);
        s.haptics(52.0, item, 5100.0);
        s.haptics(45.0, item, 5200.0);
        assert_eq!(s.posted, vec!["haptic:selection"]);
    }
}
