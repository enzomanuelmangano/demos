//! Blurred Scroll (src/animations/blurred-scroll: index.tsx, components/BlurredItem.tsx): ten
//! violet rounded cards in a vertical list on black; the one leaving the centre upward shrinks,
//! tilts and blurs out, then comes back sharp as it leaves the screen.
//!
//! - The list: an Animated.FlatList (a UIScrollView, `ui_scroll`: no snapping, normal
//!   deceleration, bounces) of items `itemHeight` = windowHeight × 0.45 tall, padded by
//!   windowHeight / 2 − itemHeight / 2 at both ends, so item `i` is centred at contentOffsetY =
//!   i × itemHeight. Yoga rounds each item's edges to the device pixel (half up); UIScrollView
//!   shows the content on the device pixel.
//! - Per item, over inputRange [(i − 1) h, i h, (i + 1) h, (i + 2) h] (Extrapolate.CLAMP) of the
//!   onScroll offset: Blur [0.1, 0.1, 40, 0.1], the Animated.View's rotate [0, 0, π/20, 0] rad
//!   (about the view's centre), the Group's scale [0.8, 1, 0.8, 1] about (width / 2, 0).
//! - Inside each item's canvas (its rounded frame; an 8-bit Display P3 surface cleared
//!   transparent): a white RoundedRect (inset horizontalPadding / 2 = verticalPadding / 2 = 60,
//!   r 20) in a Blur layer, then a Fill of LinearGradient((0, 0) → (width, itemHeight), #9459F4 →
//!   #3411E4) with srcIn.
//!
//! Each visible item's canvas is drawn as RN Skia draws it, into its own texture: the rect
//! analytic under the Group's scale, Graphite's blur of the layer (the canvas outset by the
//! blur's reach; σ = blur × scale × the screen scale, the blur at rest too: Skia's 0.1 leaves a
//! 0.4 % tail one pixel out), drawn back 8-bit, the gradient srcIn in P3. The canvas is redrawn
//! only when its blur, scale or size changes; the screen pass rotates it as Core Animation does.
//! No commit per scroll frame.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::interpolate_clamp;
use skia::blur::{outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{Canvas, Color, Paint, Renderer};

use crate::ui_scroll::{self, Snap, UiScroll};
use crate::{gfx, shaders};
use shaders::blurred_scroll::{entry, module, Item, GROUP_0, LAYER as LAYER_BINDING, SMP, U};

/// The list's length (`new Array(10)`).
const ITEMS: usize = 10;
/// blurredItemContainerHeight = windowHeight × 0.45.
const ITEM_HEIGHT: f64 = 0.45;
/// horizontalPadding / 2 = verticalPadding / 2.
const INSET: f32 = 60.0;
/// RoundedRect r, drawn with continuous corners (iOS's squircle), not RN Skia's circular arcs.
const RADIUS: f32 = 20.0;
/// The items one canvas texture each (a screen shows at most four consecutive ones).
const SLOTS: usize = 4;
/// The LinearGradient's colours.
const FROM: [u8; 3] = [0x94, 0x59, 0xF4];
const TO: [u8; 3] = [0x34, 0x11, 0xE4];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurredScroll::default())
}

/// What item `index` looks like at `scroll`: (blur, rotate, scale).
pub(crate) fn item_state(index: usize, scroll: f64, item_height: f64) -> (f64, f64, f64) {
    let (h, i) = (item_height, index as f64);
    let input = [(i - 1.0) * h, i * h, (i + 1.0) * h, (i + 2.0) * h];
    let blur = interpolate_clamp(scroll, &input, &[0.1, 0.1, 40.0, 0.1]);
    let rotate = interpolate_clamp(
        scroll,
        &input,
        &[0.0, 0.0, std::f64::consts::PI / 20.0, 0.0],
    );
    let scale = interpolate_clamp(scroll, &input, &[0.8, 1.0, 0.8, 1.0]);
    (blur, rotate, scale)
}

/// Yoga's rounding of a layout edge to the device pixel (half up), in device pixels.
fn yoga_px(v: f64, s: f64) -> f64 {
    (v * s + 0.5 + 1e-6).floor()
}

/// The list's geometry for a window `w` × `h` points at scale `s`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f64,
    h: f64,
    s: f64,
    /// itemHeight (points, unrounded).
    item: f64,
    /// paddingTop (points).
    pad: f64,
}

impl Layout {
    fn new(w: f64, h: f64, s: f64) -> Layout {
        let item = h * ITEM_HEIGHT;
        Layout {
            w,
            h,
            s,
            item,
            pad: h / 2.0 - item / 2.0,
        }
    }

    /// Item `i`'s top and bottom in the content, device pixels (Yoga's rounded edges).
    fn edges(&self, i: usize) -> (f64, f64) {
        let top = self.pad + i as f64 * self.item;
        (yoga_px(top, self.s), yoga_px(top + self.item, self.s))
    }

    /// The content's height, points (its rounded bottom edge).
    fn content(&self) -> f64 {
        yoga_px(2.0 * self.pad + ITEMS as f64 * self.item, self.s) / self.s
    }

    /// The canvas's width, device pixels.
    fn width_px(&self) -> u32 {
        yoga_px(self.w, self.s) as u32
    }

    /// The tallest item canvas, device pixels.
    fn max_height_px(&self) -> u32 {
        (0..ITEMS)
            .map(|i| self.edges(i))
            .map(|(t, b)| (b - t) as u32)
            .max()
            .unwrap_or(1)
            .max(1)
    }
}

/// One item's canvas: drawn when its look changes, sampled every frame.
struct Slot {
    canvas: Canvas,
    renderer: Renderer,
    blur: GraphiteBlur,
    plan: GraphitePlan,
    /// (item, blur, scale, canvas height px) the textures hold.
    key: Option<(usize, u64, u64, u32)>,
}

impl Default for Slot {
    fn default() -> Slot {
        let mut renderer = Renderer::default();
        renderer.p3 = true;
        Slot {
            canvas: Canvas::default(),
            renderer,
            blur: GraphiteBlur::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
            key: None,
        }
    }
}

struct SlotGpu {
    uniforms: wgpu::Buffer,
    /// The white rect before the blur (the layer's pixels over the canvas).
    layer: wgpu::TextureView,
    /// The blurred layer drawn back into the canvas.
    blurred: wgpu::TextureView,
    /// The canvas: the gradient srcIn.
    canvas: wgpu::TextureView,
    compose_bind: wgpu::BindGroup,
    item_bind: wgpu::BindGroup,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The canvas textures' size, device pixels.
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    item: wgpu::RenderPipeline,
    slots: Vec<SlotGpu>,
}

#[derive(Default)]
struct BlurredScroll {
    layout: Layout,
    list: Option<UiScroll>,
    finger: Option<u32>,
    slots: [Slot; SLOTS],
    gpu: Option<Gpu>,
}

impl BlurredScroll {
    fn offset(&self) -> f64 {
        self.list.as_ref().map_or(0.0, |l| l.offset)
    }

    fn sync_list(&mut self) {
        let l = self.layout;
        if l.h <= 0.0 {
            return;
        }
        let list = self
            .list
            .get_or_insert_with(|| UiScroll::new(0.0, 0.0, 1.0, ui_scroll::NORMAL, Snap::Free));
        list.max = (l.content() - l.h).max(0.0);
        list.port = l.h;
    }
}

/// A straight sRGB colour as encoded Display P3 (RN Skia converts a gradient's colours to its
/// surface's space, then mixes them).
fn srgb_to_p3(c: [u8; 3]) -> [f32; 3] {
    let lin = |v: u8| {
        let v = v as f64 / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    let enc = |v: f64| {
        let v = v.clamp(0.0, 1.0);
        (if v <= 0.0031308 {
            12.92 * v
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        }) as f32
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    [
        enc(0.822_461_97 * r + 0.177_538_03 * g),
        enc(0.033_194_2 * r + 0.966_805_8 * g),
        enc(0.017_082_63 * r + 0.072_397_4 * g + 0.910_519_97 * b),
    ]
}

impl Surface for BlurredScroll {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let held = self.list.as_ref().is_some_and(|l| l.dragging());
        Some(format!(
            "{{\"scroll\":{:.3},\"held\":{held}}}",
            self.offset()
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
        let Some(list) = self.list.as_mut() else {
            return;
        };
        let phase = gfx::phase(phase);
        if phase == Phase::Down && self.finger.is_none() {
            self.finger = Some(id);
        }
        if self.finger == Some(id) {
            // The list scrolls vertically: UiScroll's axis is y.
            list.input(id, phase, y, x, at_ms, true);
            if matches!(phase, Phase::Up | Phase::Cancel) {
                self.finger = None;
            }
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
        let l = Layout::new(frame.width as f64, frame.height as f64, frame.scale as f64);
        if l != self.layout {
            self.layout = l;
            for slot in self.slots.iter_mut() {
                slot.key = None;
            }
        }
        self.sync_list();
        let moving = self
            .list
            .as_mut()
            .is_some_and(|list| list.step(frame.now_ms) || list.moving());
        let s = l.s;
        // UIScrollView keeps contentOffset on the device pixel (the scroll probe logs thirds of a
        // point, dragging and decelerating): onScroll reads it so, and the content shows there.
        let offset = (self.offset() * s).round() / s;
        let (pw, ph) = frame.pixels();
        let size = (l.width_px(), l.max_height_px());
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size))
            != Some((format, frame.shader_generation, size))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, size));
            for slot in self.slots.iter_mut() {
                slot.key = None;
            }
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (c0, c1) = (srgb_to_p3(FROM), srgb_to_p3(TO));
        let shown = (offset * s).round();
        let mut drawn: [Option<usize>; ITEMS] = [None; ITEMS];
        for (index, slot_of) in drawn.iter_mut().enumerate() {
            let (top, bottom) = l.edges(index);
            let (top, bottom) = (top - shown, bottom - shown);
            let hv = bottom - top;
            // A tilted card reaches past its box by less than half its height.
            if bottom + 0.5 * hv < 0.0 || top - 0.5 * hv > ph as f64 {
                continue;
            }
            let (blur, rotate, scale) = item_state(index, offset, l.item);
            let k = index % SLOTS;
            let lh = hv as u32;
            let uniforms = Item {
                view: [
                    pw as f32 / 2.0,
                    (top + hv / 2.0) as f32,
                    rotate.cos() as f32,
                    rotate.sin() as f32,
                ],
                item: [size.0 as f32, lh as f32, scale as f32, s as f32],
                canvas: [l.w as f32, l.item as f32, pw as f32, ph as f32],
                c0: [c0[0], c0[1], c0[2], gfx::srgb_flag(format)],
                c1: [c1[0], c1[1], c1[2], 0.0],
            };
            let sg = &gpu.slots[k];
            queue.write_buffer(&sg.uniforms, 0, &uniforms.bytes());
            let key = (index, blur.to_bits(), scale.to_bits(), lh);
            let slot = &mut self.slots[k];
            if slot.key != Some(key) {
                slot.key = Some(key);
                // The white rect in the canvas's space, under the Group's scale about (w / 2, 0).
                let (w, g) = (l.w as f32, scale as f32);
                let c = &mut slot.canvas;
                c.begin(s as f32);
                c.translate(w / 2.0, 0.0);
                c.scale(g, g);
                c.translate(-w / 2.0, 0.0);
                // Core Animation's continuous corner (the owner's call over RN's circular arcs).
                c.draw_continuous_rrect(
                    INSET,
                    INSET,
                    w - 2.0 * INSET,
                    l.item as f32 - 2.0 * INSET,
                    RADIUS,
                    &Paint::fill(Color::WHITE),
                );
                slot.renderer.draw(
                    device,
                    queue,
                    encoder,
                    c,
                    &sg.layer,
                    GRAPHITE_FORMAT,
                    size.0,
                    size.1,
                    wgpu::Color::TRANSPARENT,
                );
                // The layer: the canvas (the device clip) outset by the blur's reach; σ through
                // the CTM (the Group's scale and the screen's).
                let desired = [0, 0, size.0 as i32, lh as i32];
                let sigma = (blur * scale * s) as f32;
                let reach = skia::blur::ceil_size(3.0 * sigma);
                if slot
                    .plan
                    .update(outset(desired, reach, reach), desired, sigma)
                {
                    slot.blur.run_into(
                        device,
                        queue,
                        encoder,
                        Placed {
                            view: &sg.layer,
                            origin: [0, 0],
                            size: [size.0, size.1],
                        },
                        &slot.plan,
                        &sg.blurred,
                        [0, 0],
                        [size.0, size.1],
                    );
                }
                skia::render::fullscreen_pass(
                    encoder,
                    "blurred scroll canvas",
                    &sg.canvas,
                    &gpu.compose,
                    &sg.compose_bind,
                );
            }
            *slot_of = Some(k);
        }
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("blurred scroll"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // styles.container: black.
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.item);
        // In the list's order: a later item over an earlier one.
        for k in drawn.iter().flatten() {
            pass.set_bind_group(0, &gpu.slots[*k].item_bind, &[]);
            pass.draw(0..3, 0..1);
        }
        moving
    }
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let sampler = skia::render::linear_sampler(device);
    let target =
        |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, size.0, size.1);
    let bind = |uniforms: &wgpu::Buffer, view: &wgpu::TextureView| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blurred scroll"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: U.binding,
                    resource: uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: LAYER_BINDING.binding,
                    resource: wgpu::BindingResource::TextureView(view),
                },
                wgpu::BindGroupEntry {
                    binding: SMP.binding,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        })
    };
    let slots = (0..SLOTS)
        .map(|_| {
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("blurred scroll"),
                size: Item::SIZE as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let (layer, blurred, canvas) = (
                target("blurred scroll layer"),
                target("blurred scroll blurred"),
                target("blurred scroll canvas"),
            );
            let compose_bind = bind(&uniforms, &blurred);
            let item_bind = bind(&uniforms, &canvas);
            SlotGpu {
                uniforms,
                layer,
                blurred,
                canvas,
                compose_bind,
                item_bind,
            }
        })
        .collect();
    Gpu {
        format,
        generation,
        size,
        compose: skia::render::fullscreen_pipeline(
            device,
            &shader,
            &layout,
            entry::COMPOSE,
            GRAPHITE_FORMAT,
            None,
        ),
        item: skia::render::fullscreen_pipeline(
            device,
            &shader,
            &layout,
            entry::ITEM,
            format,
            Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
        ),
        slots,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    #[test]
    fn items_sit_on_yogas_pixels() {
        let l = Layout::new(420.0, 912.0, 3.0);
        // paddingTop 250.8 pt = 752.4 px → 752; item 1 at 1983.6 → 1984.
        assert_eq!(l.edges(0), (752.0, 1984.0));
        assert_eq!(l.edges(1), (1984.0, 3215.0));
        assert!((l.content() - 13817.0 / 3.0).abs() < 1e-9);
        assert_eq!(l.max_height_px(), 1232);
    }

    #[test]
    fn the_card_above_the_centre_blurs_tilts_and_shrinks() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let h = 912.0 * ITEM_HEIGHT;
        let mut s = BlurredScroll::default();
        let (rest, animating) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        rest.save("blurred-scroll-0");
        assert!(!animating);
        // Item 0 at Yoga's 251 (250.8 rounded), its card from (60, 311) to (360, 601.4).
        let top = 251.0f32;
        let inside = rest.at(70, (top + 70.0) as u32);
        assert!(
            inside[2] > 200 && inside[0] > 120 && inside[1] < 110,
            "{inside:?}"
        );
        assert_eq!(&rest.at(50, 456)[..3], &[0, 0, 0]);
        assert_eq!(
            &rest.at(210, (top + 58.0) as u32)[..3],
            &[0, 0, 0],
            "sharp edge"
        );
        // Item 1 below, at scale 0.8 about its top centre: its card from x 90.
        let below = 251.0 + h as f32 + 60.0;
        assert!(
            rest.at(100, below as u32)[2] > 150,
            "{:?}",
            rest.at(100, below as u32)
        );
        assert_eq!(&rest.at(85, below as u32)[..3], &[0, 0, 0]);

        // Half way to item 1: item 0 above the centre, blurred (σ 20 × 0.9), tilted, smaller.
        s.list.as_mut().unwrap().set_offset(h / 2.0);
        let (mid, _) = fixture::render(&gpu, &mut s, &frame(16.0)).unwrap();
        mid.save("blurred-scroll-half");
        let (blur, rotate, scale) = item_state(0, h / 2.0, h);
        assert!(
            (blur - 20.05).abs() < 1e-9
                && (rotate - std::f64::consts::PI / 40.0).abs() < 1e-9
                && (scale - 0.9).abs() < 1e-9
        );
        let top = (251.0 - (h / 2.0).round()) as f32;
        let edge = mid.at(210, (top + 50.0) as u32);
        assert!(edge[2] > 20 && edge[2] < 200, "blurred edge {edge:?}");

        // A drag up scrolls the list: the content follows the finger.
        let pointer = |phase, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x: 200.0,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: exact_gpu::PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.list.as_mut().unwrap().set_offset(0.0);
        s.input(&pointer(exact_gpu::PointerPhase::Down, 600.0, 100.0));
        for i in 1..=10 {
            s.input(&pointer(
                exact_gpu::PointerPhase::Move,
                600.0 - 12.0 * i as f32,
                300.0 + 16.0 * i as f64,
            ));
        }
        assert!(s.offset() > 80.0, "{}", s.offset());
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod probe {
    use super::*;
    use exact_gpu::fixture;

    /// `BLURRED_SCROLL_AT=<offset pt>`: the screen at 3× at that offset (`EXACT_GPU_OUT`), to
    /// compare with an RN screenshot at the same offset.
    #[test]
    #[ignore]
    fn render_at_offset() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = fixture::device().unwrap();
        let at: f64 = std::env::var("BLURRED_SCROLL_AT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0.0);
        let frame = Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms: 0.0,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = BlurredScroll::default();
        fixture::render(&gpu, &mut s, &frame).unwrap();
        s.list.as_mut().unwrap().set_offset(at);
        let (img, _) = fixture::render(
            &gpu,
            &mut s,
            &Frame {
                now_ms: 16.0,
                ..frame
            },
        )
        .unwrap();
        img.save("blurred-scroll-at");
    }
}
