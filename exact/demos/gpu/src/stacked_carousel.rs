//! Stacked Carousel (src/animations/stacked-carousel: index.tsx,
//! components/stacked-carousel/index.tsx, components/paginator/index.tsx): twenty white cards in
//! a pile over an invisible FlatList, and a paginator of dots.
//!
//! - The FlatList: the window's width × (cardHeight + stackOffset × 6) = 272, centred;
//!   horizontal, snapToInterval cardWidth (320), decelerationRate "fast",
//!   disableIntervalMomentum (one page per fling at most), bounces; its content padded left
//!   (width − 320) / 2, so it scrolls from 0 to 50 + 20 × 320 − width.
//! - AnimatedCard i, centred (320 × 200, zIndex totalCards × 1000 − index), with
//!   u = scrollX / 320 − i: scale [0.7, 0.8, 1, 1.5, 1.5] and translateY [65, 35, 0, −100, −100]
//!   (CLAMP), opacity [0.2, 0.8, 1, −1, −2] (EXTEND), at u = −2 … 2; FAR_RIGHT (u ≤ −3) and
//!   FAR_LEFT (u ≥ 1) styles; transform [translateY, scale] about its centre. Inside it,
//!   [perspective 600, rotateX floor(interpolate(u, …, [45, 30, 0, 0, 0], CLAMP)) deg] about
//!   the inner view's centre (45° at u ≤ −2, 0° at u ≥ 0). The card: white, radius 25
//!   continuous, boxShadow 0 0 5px rgba(0, 0, 0, 0.05) (σ 2.5, RN iOS's shadowRadius = blur / 2).
//! - A selection haptic each time round(scrollX / 320) changes (useAnimatedReaction).
//! - The Paginator: its 40 pt strip 120 below the screen's centre (the carousel box is its
//!   paddingVertical 80, the paginator's box from cardHeight to its bottom); a centred row of
//!   twenty 10 pt dots (rgba(0, 0, 0, 0.15), round) with marginRight 10, translateX
//!   withSpring(centerOffset − currentPosition, { damping 15, stiffness 100, mass 0.5 }); each
//!   dot opacity withTiming(currentPageIndex == i ? 1 : visible ? 0.75 : 0, 500 ms linear) and
//!   scale withSpring(currentPageIndex == i ? 1 : 0.75, the same config). currentIndex =
//!   round(currentPageIndex); the window of three dots starts at max(current − 1, 0), moved back
//!   to end at the last page. currentPageIndex == index is RN's float equality: a dot is active
//!   only while the scroll rests exactly on its page. Everything starts at its target.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing};
use skia::{Canvas, Color, Matrix4, Paint, Renderer};

use crate::ui_scroll::{Snap, UiScroll, FAST};
use crate::{gfx, shaders};
use shaders::stacked_carousel::{entry, module, Uniforms, CARD, GROUP_0, SMP, U};

const COUNT: usize = 20;
const CARD_W: f64 = 320.0;
const CARD_H: f64 = 200.0;
const STACK_OFFSET: f64 = 12.0;
const PERSPECTIVE: f32 = 600.0;
/// The card layer's margin around the card (3σ and a little).
const MARGIN: f32 = 10.0;
const SLOTS: usize = 5;
/// The paginator's SpringConfig.
const DOT_SPRING: SpringConfig = SpringConfig {
    stiffness: 100.0,
    damping: 15.0,
    mass: 0.5,
};
const DOT: f64 = 10.0;
const SPACING: f64 = 10.0;
const VISIBLE: i64 = 3;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Carousel::default())
}

#[derive(Default)]
struct Carousel {
    size: (f64, f64),
    scroll: Option<UiScroll>,
    /// round(scrollX / cardWidth) as last heard.
    page: Option<i64>,
    row: Option<Spring>,
    dot_opacity: Vec<Timing>,
    dot_scale: Vec<Spring>,
    posted: Vec<String>,
    layer_canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// interpolate on the card's extended input range (u = −2 … 2).
fn curve(u: f64, out: [f64; 5], e: Extrapolation) -> f64 {
    interpolate(u, &[-2.0, -1.0, 0.0, 1.0, 2.0], &out, e)
}

/// The card's (translateY, scale, opacity, rotateX in degrees) at u.
fn card_style(u: f64) -> (f64, f64, f64, f64) {
    let (ty, s, o) = if u <= -3.0 {
        (65.0, 0.7, 0.0)
    } else if u >= 1.0 {
        (-100.0, 1.5, 0.0)
    } else {
        (
            curve(u, [65.0, 35.0, 0.0, -100.0, -100.0], Extrapolation::Clamp),
            curve(u, [0.7, 0.8, 1.0, 1.5, 1.5], Extrapolation::Clamp),
            curve(u, [0.2, 0.8, 1.0, -1.0, -2.0], Extrapolation::Extend),
        )
    };
    let rx = if u <= -2.0 {
        45.0
    } else if u >= 0.0 {
        0.0
    } else {
        curve(u, [45.0, 30.0, 0.0, 0.0, 0.0], Extrapolation::Clamp).floor()
    };
    (ty, s, o, rx)
}

/// visibleDotsIndices: (start, end, currentIndex).
fn window(page: f64) -> (i64, i64, i64) {
    let current = page.round() as i64;
    let mut start = (current - VISIBLE / 2).max(0);
    let end = (start + VISIBLE).min(COUNT as i64);
    if end == COUNT as i64 {
        start = (COUNT as i64 - VISIBLE).max(0);
    }
    (start, end, current)
}

/// containerAnimatedStyle's translateX target.
fn row_target(current: i64) -> f64 {
    let n = COUNT as f64;
    let full = DOT * 2.5;
    let total = (n - 1.0) * DOT + full;
    let center = (total + SPACING * (n - 1.0)) / 2.0;
    center - (current as f64 * (DOT + SPACING) + full / 2.0)
}

impl Carousel {
    fn max_offset(&self) -> f64 {
        let w = self.size.0;
        ((w - CARD_W) / 2.0 + CARD_W * COUNT as f64 - w).max(0.0)
    }

    fn ensure(&mut self) {
        let (w, max) = (self.size.0, self.max_offset());
        match &mut self.scroll {
            Some(s) => {
                s.max = max;
                s.port = w;
            }
            None => {
                self.scroll = Some(UiScroll::new(
                    0.0,
                    max,
                    w,
                    FAST,
                    Snap::IntervalCurrent(CARD_W),
                ))
            }
        }
        if self.row.is_none() {
            let (start, end, current) = window(0.0);
            self.row = Some(Spring::at(row_target(current)));
            self.dot_opacity = (0..COUNT as i64)
                .map(|i| {
                    Timing::at(if i == 0 {
                        1.0
                    } else if i >= start && i < end {
                        0.75
                    } else {
                        0.0
                    })
                })
                .collect();
            self.dot_scale = (0..COUNT)
                .map(|i| Spring::at(if i == 0 { 1.0 } else { 0.75 }))
                .collect();
            self.page = Some(0);
        }
    }

    /// The mappers that read the scroll, run each frame it moves.
    fn react(&mut self) {
        let x = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let page = x / CARD_W;
        let rounded = page.round() as i64;
        if self.page.is_some_and(|p| p != rounded) {
            self.posted.push("haptic:selection".into());
        }
        self.page = Some(rounded);
        let (start, end, current) = window(page);
        if let Some(row) = &mut self.row {
            row.retarget(row_target(current), DOT_SPRING);
        }
        for i in 0..COUNT {
            let active = page == i as f64;
            let visible = (i as i64) >= start && (i as i64) < end;
            let o = if active {
                1.0
            } else if visible {
                0.75
            } else {
                0.0
            };
            let t = &mut self.dot_opacity[i];
            if t.target() != o {
                t.to(o, 500.0, Easing::Linear);
            }
            self.dot_scale[i].retarget(if active { 1.0 } else { 0.75 }, DOT_SPRING);
        }
    }

    /// Card i's screen → card-points matrix rows, and its opacity.
    fn card_rows(&self, i: usize, x: f64) -> Option<([[f32; 4]; 3], f32)> {
        let u = x / CARD_W - i as f64;
        let (ty, s, o, rx) = card_style(u);
        if o <= 0.0 {
            return None;
        }
        let (w, h) = self.size;
        let (cx, cy) = (w / 2.0, h / 2.0);
        let m = Matrix4::translate(cx as f32, (cy + ty) as f32, 0.0)
            .multiply(Matrix4::scale(s as f32, s as f32, 1.0))
            .multiply(Matrix4::perspective(PERSPECTIVE))
            .multiply(Matrix4::rotate_x((rx as f32).to_radians()))
            .multiply(Matrix4::translate(
                -(CARD_W / 2.0) as f32,
                -(CARD_H / 2.0) as f32,
                0.0,
            ));
        let rows = m.to_matrix3().invert()?.rows();
        Some((rows, o.min(1.0) as f32))
    }

    fn build(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        format: wgpu::TextureFormat,
        frame: &Frame,
    ) -> Gpu {
        let s = frame.scale;
        let (lw, lh) = (
            ((CARD_W as f32 + 2.0 * MARGIN) * s).ceil() as u32,
            ((CARD_H as f32 + 2.0 * MARGIN) * s).ceil() as u32,
        );
        let layer = skia::render::sampled_target(device, "stacked carousel card", LAYER, lw, lh);
        let c = &mut self.layer_canvas;
        c.begin(s);
        c.translate(MARGIN, MARGIN);
        let (w, h) = (CARD_W as f32, CARD_H as f32);
        c.draw_rrect_shadow(
            0.0,
            0.0,
            w,
            h,
            25.0,
            2.5,
            Color::rgba8(0, 0, 0, 255).alpha(0.05),
        );
        c.draw_continuous_rrect(0.0, 0.0, w, h, 25.0, &Paint::fill(Color::WHITE));
        self.renderer.draw(
            device,
            queue,
            encoder,
            c,
            &layer,
            LAYER,
            lw,
            lh,
            wgpu::Color::TRANSPARENT,
        );

        let shader = device.create_shader_module(module());
        let layout = device.create_bind_group_layout(&GROUP_0);
        let pipeline = skia::render::fullscreen_pipeline(
            device,
            &shader,
            &layout,
            entry::COMPOSE,
            format,
            None,
        );
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("stacked carousel"),
            size: Uniforms::SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let sampler = gfx::linear_sampler(device, "stacked carousel");
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("stacked carousel"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: U.binding,
                    resource: uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: CARD.binding,
                    resource: wgpu::BindingResource::TextureView(&layer),
                },
                wgpu::BindGroupEntry {
                    binding: SMP.binding,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        Gpu {
            format,
            generation: frame.shader_generation,
            size: frame.pixels(),
            pipeline,
            uniforms,
            bind,
        }
    }
}

impl Surface for Carousel {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let held = self.scroll.as_ref().is_some_and(|s| s.dragging());
        Some(format!(
            "{{\"offset\":{offset:.2},\"page\":{},\"held\":{held}}}",
            self.page.unwrap_or(0)
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
        if self.size.0 <= 0.0 {
            return;
        }
        self.ensure();
        let (w, h) = self.size;
        let list_h = CARD_H + STACK_OFFSET * 6.0;
        let top = (h - list_h) / 2.0;
        let inside = (0.0..=w).contains(&(x as f64)) && (top..=top + list_h).contains(&(y as f64));
        if let Some(s) = &mut self.scroll {
            s.input(id, gfx::phase(phase), x, y, at_ms, inside);
        }
        self.react();
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
        self.ensure();
        let now = frame.now_ms;
        let mut moving = self.scroll.as_mut().is_some_and(|s| s.step(now));
        self.react();
        if let Some(row) = &mut self.row {
            moving |= row.step(now);
        }
        for t in &mut self.dot_opacity {
            moving |= t.step(now);
        }
        for s in &mut self.dot_scale {
            moving |= s.step(now);
        }
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size))
            != Some((format, frame.shader_generation, (pw, ph)))
        {
            self.gpu = Some(self.build(device, queue, encoder, format, frame));
        }
        let x = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        // Back to front: the highest index first.
        let mut cards = [[0.0f32; 4]; SLOTS * 3];
        let mut k = 0;
        for i in (0..COUNT).rev() {
            if k == SLOTS {
                break;
            }
            if let Some((rows, o)) = self.card_rows(i, x) {
                cards[k * 3] = [rows[0][0], rows[0][1], rows[0][2], o];
                cards[k * 3 + 1] = rows[1];
                cards[k * 3 + 2] = rows[2];
                k += 1;
            }
        }
        let (w, h) = self.size;
        let strip = h / 2.0 + 120.0;
        let row_x = self.row.as_ref().map_or(0.0, |r| r.value);
        let row_w = COUNT as f64 * (DOT + SPACING);
        let left = (w - row_w) / 2.0 + row_x;
        let mut dots = [[0.0f32; 4]; COUNT];
        for (i, d) in dots.iter_mut().enumerate() {
            let cx = left + i as f64 * (DOT + SPACING) + DOT / 2.0;
            *d = [
                cx as f32,
                (strip + 20.0) as f32,
                (DOT / 2.0 * self.dot_scale[i].value) as f32,
                self.dot_opacity[i].value as f32,
            ];
        }
        let gpu = self.gpu.as_ref().unwrap();
        let uniforms = Uniforms {
            cards,
            dots,
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            layer: [CARD_W as f32, CARD_H as f32, MARGIN, strip as f32],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(
            encoder,
            "stacked carousel",
            target,
            &gpu.pipeline,
            &gpu.bind,
        );
        moving || self.scroll.as_ref().is_some_and(|s| s.moving())
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn styles_match_the_rn_ranges() {
        assert_eq!(card_style(0.0), (0.0, 1.0, 1.0, 0.0));
        assert_eq!(card_style(-1.0), (35.0, 0.8, 0.8, 30.0));
        // u = −1.5: rotateX floor(37.5) = 37.
        assert_eq!(card_style(-1.5).3, 37.0);
        assert!(card_style(0.5).2 == 0.0);
        assert_eq!(window(19.0), (17, 20, 19));
        assert_eq!(row_target(0), (19.0 * 10.0 + 25.0 + 190.0) / 2.0 - 12.5);
    }

    #[test]
    fn a_hard_fling_pages_once() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
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
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let pointer = |phase, x: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 456.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        let mut s = surface();
        let (rest, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("stacked-carousel-rest");
        assert!(!moving);
        // The front card's centre is white; the background #eeeeee.
        assert_eq!(&rest.at(3 * 210, 3 * 456)[..3], &[255, 255, 255]);
        assert_eq!(&rest.at(3 * 10, 3 * 200)[..3], &[238, 238, 238]);
        let mut ms = 16.0;
        s.input(&pointer(PointerPhase::Down, 380.0, ms));
        for k in 1..=5 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 380.0 - 50.0 * k as f32, ms));
        }
        s.input(&pointer(PointerPhase::Up, 130.0, ms + 4.0));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"offset\":320.00"), "{state}");
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let (paged, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        paged.save("stacked-carousel-paged");
    }
}
