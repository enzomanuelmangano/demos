//! Coverflow Carousel: eleven photos on a horizontal strip. The centred photo is full size; the
//! others shrink to slivers, squash and fan out as they leave the centre.
//!
//! - A release snaps to a multiple of the cell width (160 pt). The snap interval, not paging,
//!   decides the target.
//! - Each cell's scale, translation, corner radius and opacity come from the scroll offset alone,
//!   so cells draw in index order with no per-cell state.
//! - Haptics: a selection each time the centred photo changes, at most one per HAPTIC_GAP_MS,
//!   during the drag and the glide. A rigid impact each time the strip is pulled or thrown past
//!   an end (the rubber band).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation};
use skia::{fit_cover, Canvas, Images, Matrix, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

/// Cell width, pt.
const ITEM: f64 = 160.0;
/// Photo height, pt.
const IMAGE_H: f64 = 120.0;
/// Strip height, pt.
const LIST_H: f64 = 250.0;
const COUNT: usize = 11;
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past the half-item line the offset goes before the haptics' item changes, pt.
const SWITCH: f64 = 6.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;

static PHOTOS: [&[u8]; COUNT] = [
    include_bytes!("../images/coverflow-carousel/01.jpg"),
    include_bytes!("../images/coverflow-carousel/02.jpg"),
    include_bytes!("../images/coverflow-carousel/03.jpg"),
    include_bytes!("../images/coverflow-carousel/04.jpg"),
    include_bytes!("../images/coverflow-carousel/05.jpg"),
    include_bytes!("../images/coverflow-carousel/06.jpg"),
    include_bytes!("../images/coverflow-carousel/07.jpg"),
    include_bytes!("../images/coverflow-carousel/08.jpg"),
    include_bytes!("../images/coverflow-carousel/09.jpg"),
    include_bytes!("../images/coverflow-carousel/10.jpg"),
    include_bytes!("../images/coverflow-carousel/11.jpg"),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Coverflow {
        scroll: UiScroll::new(0.0, 0.0, 0.0, FAST, Snap::Interval(ITEM)),
        size: (0.0, 0.0),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        images: None,
        centred: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    })
}

struct Coverflow {
    scroll: UiScroll,
    size: (f64, f64),
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
    /// The centred photo, and whether the strip is past an end (their haptics).
    centred: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
}

/// One cell's animated style at scroll offset `x`.
struct Style {
    width: f64,
    scale_y: f64,
    translate_x: f64,
    radius: f64,
    opacity: f64,
}

fn style(x: f64, index: usize) -> Style {
    let i = index as f64;
    let input: [f64; 7] = std::array::from_fn(|k| (i + k as f64 - 3.0) * ITEM);
    let scale_x = interpolate(x, &input, &[0.1, 0.125, 0.2, 1.0, 0.2, 0.125, 0.1], Extrapolation::Clamp);
    let scale_y = interpolate(x, &input, &[0.6, 0.8, 0.9, 1.0, 0.9, 0.8, 0.6], Extrapolation::Extend);
    let translate_x = interpolate(x, &input, &[-ITEM * 1.9, -ITEM / 0.93, -ITEM / 3.3, 0.0, ITEM / 3.3, ITEM / 0.93, ITEM * 1.9], Extrapolation::Extend);
    let radius = interpolate(x, &input, &[25.0, 25.0, 25.0, 15.0, 25.0, 25.0, 25.0], Extrapolation::Extend);
    let fade: [f64; 9] = std::array::from_fn(|k| match k {
        0 => input[0] - 100.0,
        8 => input[6] + 100.0,
        k => input[k - 1],
    });
    let opacity = interpolate(x, &fade, &[0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0], Extrapolation::Clamp);
    // Whole points.
    Style { width: (ITEM * scale_x + 0.5).floor(), scale_y, translate_x, radius, opacity }
}

/// Snaps a value to the device-pixel grid.
fn grid(v: f64, scale: f64) -> f64 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

impl Coverflow {
    fn pad(&self) -> f64 {
        ((self.size.0 - ITEM) / 2.0 + 0.5).floor()
    }
    fn list_top(&self, scale: f64) -> f64 {
        grid((self.size.1 - LIST_H) / 2.0, scale)
    }

    /// A selection when the centred photo changes (one per HAPTIC_GAP_MS at most), a rigid thunk
    /// once per pull past an end.
    fn haptics(&mut self, x: f64, now: f64) {
        // The centred item holds until the offset is SWITCH past the half-item line: a finger
        // hovering there does not flap.
        let f = x / ITEM;
        let centred = match self.centred {
            Some(c) if (f - c as f64).abs() < 0.5 + SWITCH / ITEM => c,
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

impl Surface for Coverflow {
    /// An input, when given, sets the scroll's offset (tests).
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(x) = inputs.first().and_then(|v| v.as_number()) {
            self.scroll.offset = x;
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"contentOffset\":{:.2}}}", self.scroll.offset))
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The strip: full width, LIST_H tall, centred vertically.
        let top = (self.size.1 - LIST_H) / 2.0;
        let inside = (0.0..=self.size.0).contains(&(x as f64)) && (top..=top + LIST_H).contains(&(y as f64));
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
        if self.size != (w, h) {
            self.size = (w, h);
            self.scroll.port = w;
            self.scroll.max = (COUNT as f64 * ITEM + 2.0 * self.pad() - w).max(0.0);
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
        let moving = self.scroll.step(frame.now_ms);
        let x = self.scroll.offset;
        self.haptics(x, frame.now_ms);
        let (pad, top) = (self.pad(), self.list_top(scale));
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.draw_rect(0.0, 0.0, w as f32, h as f32, &Paint::fill(skia::Color::WHITE));
        if let Some(images) = self.images.as_ref() {
            for i in 0..COUNT {
                let s = style(x, i);
                if s.opacity <= 0.0 {
                    continue;
                }
                // The cell's view, centred in the cell, then moved by the scroll.
                let cell = pad + i as f64 * ITEM;
                let left = grid(cell + (ITEM - s.width) / 2.0, scale) - x;
                let y0 = grid(top + (LIST_H - IMAGE_H) / 2.0, scale);
                let (cx, cy) = (left + s.width / 2.0, y0 + IMAGE_H / 2.0);
                c.save();
                c.concat(Matrix::translate(-cx as f32, -cy as f32).then(Matrix::scale(1.0, s.scale_y as f32)).then(Matrix::translate((cx + s.translate_x) as f32, cy as f32)));
                let photo = images.image(i);
                let placed = fit_cover(Rect::new(0.0, 0.0, photo.width, photo.height), Rect::new(left as f32, y0 as f32, ITEM as f32, IMAGE_H as f32));
                let r = s.radius.min(s.width / 2.0).min(IMAGE_H / 2.0).max(0.0);
                c.draw_continuous_rrect(left as f32, y0 as f32, s.width as f32, IMAGE_H as f32, r as f32, &Paint::image(photo, placed.invert()).with_opacity(s.opacity as f32));
                c.restore();
            }
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::WHITE);
        moving || self.scroll.moving()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_centred_photo_is_full_size_and_a_flick_snaps_to_160() {
        let s0 = style(0.0, 0);
        assert_eq!((s0.width, s0.scale_y, s0.translate_x, s0.radius, s0.opacity), (160.0, 1.0, 0.0, 15.0, 1.0));
        let s1 = style(0.0, 1);
        assert_eq!(s1.width, 32.0);
        assert!((s1.translate_x + 160.0 / 3.3).abs() < 1e-9);
        assert_eq!(style(0.0, 4).opacity, 0.0);

        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let touch = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 456.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let mut s = surface();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&img, "coverflow-rest", [255, 255, 255]);
        let p = img.at(3 * 210, 3 * 456);
        assert!(p[3] == 255 && !(p[0] > 250 && p[1] > 250 && p[2] > 250), "{p:?}");
        let mut ms = 100.0;
        s.input(&touch(PointerPhase::Down, 300.0, ms));
        for k in 1..=6 {
            ms += 16.7;
            s.input(&touch(PointerPhase::Move, 300.0 - 12.0 * k as f32, ms));
        }
        s.input(&touch(PointerPhase::Up, 228.0, ms));
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 5000.0 {
            ms += 16.7;
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":160.00}");
        // One selection per photo change; one rigid impact past the start.
        assert_eq!(s.messages(), vec!["haptic:selection"]);
        ms += 100.0;
        s.input(&touch(PointerPhase::Down, 60.0, ms));
        for k in 1..=30 {
            s.input(&touch(PointerPhase::Move, 60.0 + 10.0 * k as f32, ms + 33.0 * k as f64));
            fixture::render(&gpu, s.as_mut(), &frame(ms + 33.0 * k as f64)).unwrap();
        }
        ms += 33.0 * 30.0 + 200.0;
        s.input(&touch(PointerPhase::Up, 360.0, ms));
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 10_000.0 {
            ms += 16.7;
        }
        assert_eq!(s.agent("{}").unwrap(), "{\"contentOffset\":0.00}");
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:impact-rigid"]);
    }
}
