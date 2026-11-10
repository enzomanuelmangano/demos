//! Coverflow Carousel (src/animations/coverflow-carousel: index.tsx, constants.ts,
//! components/coverflow-carousel/index.tsx, carousel-item.tsx): eleven photos on a horizontal
//! FlatList; the centred one is full size, the others shrink to slivers, squash and fan out as they
//! leave the centre.
//!
//! - Layout (index.tsx): white, the 250 pt `coverflow` box centred on the screen; the FlatList
//!   (horizontal, pagingEnabled, snapToInterval ItemWidth 160, decelerationRate 'fast') pads its
//!   content by paddingHorizontal = round((W − 160) / 2) each side, alignItems center. On iOS
//!   snapToInterval overrides pagingEnabled (ScrollView.js), so a release snaps to a multiple of
//!   160 (RCTEnhancedScrollView: ceil / floor of UIKit's projected target by the velocity's sign,
//!   round with none): `ui_scroll` (UIKit's drag, rubber band, bounce, deceleration, measured).
//! - Each cell (carousel-item.tsx) is 160 wide and centres the image's Animated.View: width
//!   round(160 × scaleX), 120 tall (the 160-wide image's aspectRatio 4 / 3), overflow hidden with
//!   continuous corners of the interpolated radius, so it shows the 160 × 120 image (expo-image,
//!   contentFit cover) from its own left edge. Its transform is [translateX, scaleY] about its
//!   centre, and its opacity fades. Cells draw in index order.
//! - Interpolations of the scroll offset over (index − 3 … index + 3) × 160: scaleX [0.1, 0.125,
//!   0.2, 1, 0.2, 0.125, 0.1] CLAMP; scaleY [0.6, 0.8, 0.9, 1, 0.9, 0.8, 0.6] EXTEND; translateX
//!   [−1.9w, −w/0.93, −w/3.3, 0, w/3.3, w/0.93, 1.9w] EXTEND; borderRadius [25, 25, 25, 15, 25, 25,
//!   25] EXTEND (Core Animation draws a corner at most half the side); opacity over [(i − 3) × w −
//!   100, …, (i + 3) × w + 100] → [0, 1 …, 1, 0] CLAMP.
//! - Pixels: Yoga puts each view on the 1 / scale grid inside the scrolled content; the scroll's
//!   offset moves the content by fractions. The photos are constants.ts's Unsplash URLs (w=640),
//!   bundled (gpu/images/coverflow-carousel).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation};
use skia::{fit_cover, Canvas, Images, Matrix, Paint, Rect, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

/// ItemWidth.
const ITEM: f64 = 160.0;
/// The image's height: 160 at aspectRatio 4 / 3.
const IMAGE_H: f64 = 120.0;
/// styles.coverflow height.
const LIST_H: f64 = 250.0;
const COUNT: usize = 11;

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
    })
}

struct Coverflow {
    scroll: UiScroll,
    size: (f64, f64),
    canvas: Canvas,
    renderer: Renderer,
    images: Option<Images>,
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
    // Math.round(itemWidth * scaleX).
    Style { width: (ITEM * scale_x + 0.5).floor(), scale_y, translate_x, radius, opacity }
}

/// Yoga's pixel grid.
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

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The FlatList: the window's width, the coverflow box's 250 pt.
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
                // The cell in the content, the view centred in it (Yoga's grid), then the scroll.
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
        // The centred photo spans 130 … 290 at the list's middle, opaque.
        let p = img.at(3 * 210, 3 * 456);
        assert!(p[3] == 255 && !(p[0] > 250 && p[1] > 250 && p[2] > 250), "{p:?}");
        // A flick left: the next multiple of 160.
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
    }
}
