//! Dynamic Tab Indicator (src/animations/dynamic-tab-indicator: components/dynamic-tab-indicator/
//! index.tsx, section-tabs.tsx): five full-screen photos on a paged horizontal ScrollView under
//! the frosted bar of country tabs, and the black line that follows the scroll from title to title.
//! The titles and their PressableOpacity are the Contract's, above this canvas; it draws the rest.
//!
//! - The ScrollView: horizontal, `pagingEnabled`, bounces, normal deceleration: UIKit's paging
//!   (`ui_scroll`, `Snap::Page`). A tab's `scrollTo({ x: index * width, animated: true })` is
//!   `setContentOffset(_:animated:)` (`UiScroll::scroll_to`). The bar (a plain View, zIndex 5)
//!   takes the touches over it, so a drag that starts on the bar never scrolls.
//! - Each photo: an RN `<Image resizeMode="cover">` of the window's size, clipped to it. RN decodes a
//!   photo larger than that with ImageIO's thumbnail at the cover size and Core Animation shows it
//!   1:1, centred; a smaller one is decoded whole and scaled up. `gpu/images/dynamic-tab-indicator`
//!   holds those decodes (make.sh), cropped to what an iPhone Air shows; they go in one atlas,
//!   sampled bilinear at level 0, as Core Animation samples a layer's contents.
//! - SectionTabs' bar: rgba(255, 255, 255, 0.9), INDICATOR_CONTAINER_HEIGHT 120 +
//!   DEMO_BUTTON_ROW_HEIGHT 56 tall.
//! - The indicator: `interpolate(contentOffsetX, [0, w, …, 4w], xs | ws, CLAMP)` (each title's
//!   onLayout x + index × w / 5, and its width; the Contract measures them and passes them in), at
//!   top `y + 120 + 56 − 35`, 2 tall, black, borderRadius 5 (Core Animation clamps it to 1).
//!   It is laid out by Yoga each scroll event, so its edges round to the device pixel.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation};
use skia::{Canvas, Color, Images, Matrix, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, NORMAL};

const COUNT: usize = 5;
/// INDICATOR_CONTAINER_HEIGHT + DEMO_BUTTON_ROW_HEIGHT.
const BAR: f64 = 120.0 + 56.0;

/// One photo as stored: the JPEG, and for an ImageIO decode cropped by make.sh the decode's
/// full width and where the crop starts (`None`: the whole photo, decoded and scaled up by RN).
struct Photo {
    jpeg: &'static [u8],
    crop: Option<(u32, u32)>,
}

static PHOTOS: [Photo; COUNT] = [
    Photo {
        jpeg: include_bytes!("../images/dynamic-tab-indicator/france-1824-279.jpg"),
        crop: Some((1824, 279)),
    },
    Photo {
        jpeg: include_bytes!("../images/dynamic-tab-indicator/italy-1823-278.jpg"),
        crop: Some((1823, 278)),
    },
    Photo {
        jpeg: include_bytes!("../images/dynamic-tab-indicator/iceland-1824-279.jpg"),
        crop: Some((1824, 279)),
    },
    Photo {
        jpeg: include_bytes!("../images/dynamic-tab-indicator/norway.jpg"),
        crop: None,
    },
    Photo {
        jpeg: include_bytes!("../images/dynamic-tab-indicator/japan.jpg"),
        crop: None,
    },
];

/// Where photo `i` lies in the atlas: its cell's left, the decode's pixel at that left, and the
/// decode's full size (what RN covers the view with).
#[derive(Clone, Copy, Debug)]
struct Cell {
    atlas_x: f64,
    x0: f64,
    width: f64,
    height: f64,
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(DynamicTabIndicator {
        size: (0.0, 0.0),
        scale: 3.0,
        scroll: None,
        xs: [0.0; COUNT],
        ws: [0.0; COUNT],
        y: 0.0,
        token: None,
        target: 0.0,
        pending: false,
        cells: Vec::new(),
        images: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct DynamicTabIndicator {
    size: (f64, f64),
    scale: f64,
    scroll: Option<UiScroll>,
    xs: [f64; COUNT],
    ws: [f64; COUNT],
    y: f64,
    token: Option<f64>,
    target: f64,
    pending: bool,
    cells: Vec<Cell>,
    images: Option<Images>,
    canvas: Canvas,
    renderer: Renderer,
}

impl DynamicTabIndicator {
    fn round(&self, v: f64) -> f64 {
        (v * self.scale).round() / self.scale
    }

    fn ensure_scroll(&mut self) {
        let w = self.size.0;
        let max = w * (COUNT as f64 - 1.0);
        match &mut self.scroll {
            Some(s) => {
                s.max = max;
                s.port = w;
                s.snap = Snap::Page(w);
            }
            None => self.scroll = Some(UiScroll::new(0.0, max, w, NORMAL, Snap::Page(w))),
        }
    }

    /// The view's cover of a decode `width` × `height` (device pixels): its scale and offset.
    fn cover(&self, width: f64, height: f64) -> (f64, f64, f64) {
        let (vw, vh) = (self.size.0 * self.scale, self.size.1 * self.scale);
        let k = (vw / width).max(vh / height);
        (k, (vw - width * k) / 2.0, (vh - height * k) / 2.0)
    }

    /// Decodes the photos into one atlas (each the part the view shows, 3 px more each side).
    fn build_atlas(&mut self) -> skia::Image {
        // (decoded image, its first column copied, columns copied, cell)
        let mut parts: Vec<(skia::Image, u32, u32, Cell)> = Vec::new();
        let mut atlas_w = 0u32;
        for p in &PHOTOS {
            let Some(img) = skia::Image::from_jpeg(p.jpeg) else { continue };
            let (full_w, x0, from, cw) = match p.crop {
                // make.sh's crop: x0 is where it starts in the decode, all of it is copied.
                Some((full_w, x0)) => (full_w, x0, 0, img.width),
                None => {
                    let (k, left, _) = self.cover(img.width as f64, img.height as f64);
                    let first = ((-left / k).floor() as i64 - 3).max(0) as u32;
                    let last = ((((self.size.0 * self.scale - left) / k).ceil() as u32) + 3).min(img.width);
                    (img.width, first, first, last - first)
                }
            };
            let cell = Cell {
                atlas_x: atlas_w as f64,
                x0: x0 as f64,
                width: full_w as f64,
                height: img.height as f64,
            };
            parts.push((img, from, cw, cell));
            atlas_w += cw;
        }
        let atlas_h = parts.iter().map(|(img, ..)| img.height).max().unwrap_or(1);
        let mut pixels = vec![0u8; (atlas_w * atlas_h * 4) as usize];
        self.cells.clear();
        for (img, from, cw, cell) in &parts {
            let (from, cw) = (*from, *cw);
            for row in 0..img.height {
                let src = ((row * img.width + from) * 4) as usize;
                let dst = ((row * atlas_w + cell.atlas_x as u32) * 4) as usize;
                pixels[dst..dst + (cw * 4) as usize].copy_from_slice(&img.pixels[src..src + (cw * 4) as usize]);
            }
            self.cells.push(*cell);
        }
        skia::Image {
            width: atlas_w,
            height: atlas_h,
            pixels,
        }
    }
}

impl Surface for DynamicTabIndicator {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        for i in 0..COUNT {
            self.xs[i] = n(i);
            self.ws[i] = n(COUNT + i);
        }
        self.y = n(2 * COUNT);
        let token = n(2 * COUNT + 2);
        match self.token {
            // handleSelectSection: scrollTo({ x: index * width, animated: true }).
            Some(t) if t != token => {
                self.target = n(2 * COUNT + 1);
                self.pending = true;
            }
            _ => {}
        }
        self.token = Some(token);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        Some(format!("{{\"contentOffset\":{offset:.2}}}"))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, at_ms, ..
        } = *event
        else {
            return;
        };
        if self.size.0 <= 0.0 {
            return;
        }
        self.ensure_scroll();
        // The bar (SectionTabs' View, above the ScrollView) takes what lands on it.
        let inside = (0.0..=self.size.0).contains(&(x as f64)) && (BAR..=self.size.1).contains(&(y as f64));
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
            let atlas = self.build_atlas();
            let images = Images::upload_unmipped(device, queue, &atlas);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let (w, h) = self.size;
        if std::mem::take(&mut self.pending) {
            if let Some(s) = &mut self.scroll {
                s.scroll_to((self.target * w).clamp(0.0, s.max));
            }
        }
        let moving = self.scroll.as_mut().is_some_and(|s| s.step(frame.now_ms));
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let s = self.scale;
        let covers: Vec<(f64, f64, f64)> = self.cells.iter().map(|c| self.cover(c.width, c.height)).collect();
        let top = self.round(self.y + BAR - 35.0);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        if let Some(images) = self.images.as_ref() {
            for (i, (cell, &(k, left, top))) in self.cells.iter().zip(&covers).enumerate() {
                let page = i as f64 * w - offset;
                if page >= w || page + w <= 0.0 {
                    continue;
                }
                // Points → atlas pixels: the view's pixel, back through the cover, into the cell.
                let to_image = Matrix([
                    (s / k) as f32,
                    0.0,
                    0.0,
                    (s / k) as f32,
                    (cell.atlas_x - cell.x0 - (page * s + left) / k) as f32,
                    (-top / k) as f32,
                ]);
                c.draw_rect(page as f32, 0.0, w as f32, h as f32, &Paint::image(images.image(0), to_image));
            }
        }
        // styles.safeContainer: rgba(255, 255, 255, 0.9).
        c.draw_rect(0.0, 0.0, w as f32, BAR as f32, &Paint::fill(Color::WHITE.alpha(0.9)));
        // rIndicatorLayoutStyle: Yoga rounds its edges to the device pixel.
        let input: Vec<f64> = (0..COUNT).map(|i| i as f64 * w).collect();
        let x = interpolate(offset, &input, &self.xs, Extrapolation::Clamp);
        let width = interpolate(offset, &input, &self.ws, Extrapolation::Clamp);
        let (l, r) = ((x * s).round() / s, ((x + width) * s).round() / s);
        if r > l {
            c.draw_rrect(l as f32, top as f32, (r - l) as f32, 2.0, 1.0, &Paint::fill(Color::BLACK));
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

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn inputs(target: f64, token: f64) -> Vec<Value> {
        let mut v: Vec<Value> = [14.0, 108.0, 186.0, 260.0, 347.0, 56.0, 35.667, 59.667, 63.0, 50.0]
            .iter()
            .map(|&n| Value::Number(n))
            .collect();
        v.extend([0.0, target, token].map(Value::Number));
        v
    }

    fn state(s: &mut Box<dyn Surface>) -> f64 {
        let a = s.agent("{}").unwrap();
        a.split(':').nth(1).unwrap().trim_end_matches('}').parse().unwrap()
    }

    #[test]
    fn a_tab_scrolls_and_a_drag_on_the_bar_does_not() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&inputs(0.0, 0.0), None).unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "dynamic-tab-indicator-rest", [0, 0, 0]);
        // The tab Norway: an animated scrollTo, 300 ms.
        s.bind(&inputs(3.0, 1.0), None).unwrap();
        let mut ms = 0.0;
        while ms < 600.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(state(&mut s), 1260.0);
        // A drag over the bar moves nothing.
        let pointer = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&pointer(PointerPhase::Down, 300.0, 100.0, ms));
        for k in 1..=10 {
            s.input(&pointer(PointerPhase::Move, 300.0 - 20.0 * k as f32, 100.0, ms + 16.0 * k as f64));
        }
        s.input(&pointer(PointerPhase::Up, 100.0, 100.0, ms + 180.0));
        while ms < 1500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(state(&mut s), 1260.0);
        // A fast flick on the photo turns one page.
        let t = ms;
        s.input(&pointer(PointerPhase::Down, 300.0, 500.0, t));
        for k in 1..=5 {
            s.input(&pointer(PointerPhase::Move, 300.0 - 30.0 * k as f32, 500.0, t + 16.0 * k as f64));
        }
        s.input(&pointer(PointerPhase::Up, 150.0, 500.0, t + 84.0));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert_eq!(state(&mut s), 1680.0);
    }
}
