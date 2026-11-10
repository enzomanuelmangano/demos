//! Story List (src/animations/story-list: index.tsx, components/story-list/index.tsx,
//! story-item.tsx): eight story cards over one invisible horizontal ScrollView.
//!
//! - The list box: the window's width square, centred in the screen (#2D3045 behind, the
//!   Contract's). Item width × 0.7 by width; paddingLeft (width − itemWidth) / 4; the content
//!   itemWidth × 8 + (width − itemWidth) wide, so the scroll runs from 0 to itemWidth × 7.
//! - The ScrollView: horizontal, snapToInterval itemWidth, decelerationRate "fast",
//!   disableIntervalMomentum (the page is picked from where the finger lifts, so a fling moves
//!   one card at most), bounces. `ui_scroll` is UIScrollView with RCTScrollView's snapping.
//! - Each card (zIndex −index, at left paddingLeft): with activeIndex = offset / itemWidth,
//!   translateX = interpolate(activeIndex, [i − 2, i − 1, i, i + 1], [70, 35, 0,
//!   −itemWidth − paddingLeft × 2], CLAMP), scale = … [0.8, 0.9, 1, 1], CLAMP, about its
//!   centre; the expo-image covers it (centred), radius 25 continuous.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation};
use skia::{fit_cover, Canvas, Images, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

const COUNT: usize = 8;
static IMAGE_01: &[u8] = include_bytes!("../images/story-list/image_01-800x600.rgb8.zlib");
static JPEGS: [&[u8]; 3] = [
    include_bytes!("../images/story-list/image_02.jpg"),
    include_bytes!("../images/story-list/image_03.jpg"),
    include_bytes!("../images/story-list/image_04.jpg"),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(StoryList {
        size: (0.0, 0.0),
        scale: 3.0,
        scroll: None,
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct StoryList {
    size: (f64, f64),
    scale: f64,
    scroll: Option<UiScroll>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl StoryList {
    fn round(&self, v: f64) -> f64 {
        (v * self.scale).round() / self.scale
    }

    /// The list box's top, the item width and paddingLeft.
    fn layout(&self) -> (f64, f64, f64) {
        let (w, h) = self.size;
        let item = w * 0.7;
        (self.round((h - w) / 2.0), item, (w - item) / 4.0)
    }

    fn ensure_scroll(&mut self) {
        let (w, _) = self.size;
        let (_, item, _) = self.layout();
        match &mut self.scroll {
            Some(s) => {
                s.max = item * (COUNT as f64 - 1.0);
                s.port = w;
                s.snap = Snap::IntervalCurrent(item);
            }
            None => {
                self.scroll = Some(UiScroll::new(
                    0.0,
                    item * (COUNT as f64 - 1.0),
                    w,
                    FAST,
                    Snap::IntervalCurrent(item),
                ))
            }
        }
    }
}

impl Surface for StoryList {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let held = self.scroll.as_ref().is_some_and(|s| s.dragging());
        Some(format!("{{\"offset\":{offset:.2},\"held\":{held}}}"))
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
        self.ensure_scroll();
        let (top, _, _) = self.layout();
        let w = self.size.0;
        let inside = (0.0..=w).contains(&(x as f64)) && (top..=top + w).contains(&(y as f64));
        if let Some(s) = &mut self.scroll {
            s.input(id, gfx::phase(phase), x, y, at_ms, inside);
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
        self.scale = frame.scale as f64;
        self.ensure_scroll();
        if self.images.is_none() {
            let rgb = miniz_oxide::inflate::decompress_to_vec_zlib(IMAGE_01).unwrap_or_default();
            let rgba: Vec<u8> = rgb
                .chunks_exact(3)
                .flat_map(|p| [p[0], p[1], p[2], 255])
                .collect();
            let first = if rgba.len() == 800 * 600 * 4 {
                skia::Image::from_rgba(800, 600, rgba)
            } else {
                skia::Image {
                    width: 1,
                    height: 1,
                    pixels: vec![0, 0, 0, 255],
                }
            };
            let mut decoded = vec![first];
            for b in JPEGS {
                decoded.push(skia::Image::from_jpeg(b).unwrap_or(skia::Image {
                    width: 1,
                    height: 1,
                    pixels: vec![0, 0, 0, 255],
                }));
            }
            let refs: Vec<&skia::Image> = decoded.iter().collect();
            let images = Images::upload(device, queue, &refs);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let moving = self.scroll.as_mut().is_some_and(|s| s.step(frame.now_ms));
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let (top, item, pad) = self.layout();
        let w = self.size.0;
        let (left, right) = (self.round(pad), self.round(pad + item));
        let (cw, ch) = ((right - left) as f32, w as f32);
        let active = offset / item;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(images) = self.images.as_ref() {
            for i in (0..COUNT).rev() {
                let k = i as f64;
                let range = [k - 2.0, k - 1.0, k, k + 1.0];
                let tx = interpolate(
                    active,
                    &range,
                    &[70.0, 35.0, 0.0, -item - pad * 2.0],
                    Extrapolation::Clamp,
                ) as f32;
                let s =
                    interpolate(active, &range, &[0.8, 0.9, 1.0, 1.0], Extrapolation::Clamp) as f32;
                c.save();
                c.translate(left as f32 + cw / 2.0 + tx, top as f32 + ch / 2.0);
                c.scale(s, s);
                let photo = images.image(i % 4);
                let placed = fit_cover(
                    Rect::new(0.0, 0.0, photo.width, photo.height),
                    Rect::new(-cw / 2.0, -ch / 2.0, cw, ch),
                );
                c.draw_continuous_rrect(
                    -cw / 2.0,
                    -ch / 2.0,
                    cw,
                    ch,
                    25.0,
                    &Paint::image(photo, placed.invert()),
                );
                c.restore();
            }
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
            wgpu::Color::TRANSPARENT,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_hard_fling_moves_one_card() {
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
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 450.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut s = surface();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "story-list-rest", [0x2D, 0x30, 0x45]);
        // A 200 pt flick left in 80 ms (2500 pt/s).
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 350.0, ms));
        for k in 1..=5 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 350.0 - 40.0 * k as f32, ms));
        }
        s.input(&pointer(PointerPhase::Up, 150.0, ms + 4.0));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"offset\":294.00"), "{state}");
    }
}
