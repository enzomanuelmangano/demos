//! Blurred Scroll (src/animations/blurred-scroll: index.tsx, components/BlurredItem.tsx): ten
//! violet rounded cards in a vertical list on black; the one leaving the centre upward shrinks,
//! tilts and blurs out, then comes back sharp as it leaves the screen.
//!
//! - The list: items `itemHeight` = windowHeight × 0.45 tall, padded by windowHeight / 2 −
//!   itemHeight / 2 at both ends, so item `i` is centred at contentOffsetY = i × itemHeight.
//!   Item `i`'s top on screen is that padding + i × itemHeight − contentOffsetY.
//! - Per item, over inputRange [(i − 1) h, i h, (i + 1) h, (i + 2) h] (Extrapolate.CLAMP):
//!   Blur [0.1, 0.1, 40, 0.1], the Animated.View's rotate [0, 0, π/20, 0] rad (about the view's
//!   centre), the Group's scale [0.8, 1, 0.8, 1] about (width / 2, 0).
//! - Inside each item's canvas (width × itemHeight, clipping): a white RoundedRect (inset
//!   horizontalPadding / 2 = verticalPadding / 2 = 60, r 20) in a Blur layer, then a Fill of
//!   LinearGradient((0, 0) → (width, itemHeight), #9459F4 → #3411E4) with srcIn.
//!
//! The scroll is the Contract's (native, with its bounce): its offset is this surface's one
//! input. Skia blurs a layer under a scale by σ × the scale, so a card's layer is blurred by
//! blur × scale points. At most two cards are blurred at once (i and i + 1 around a centred
//! one), each with its own layer; a card at 0.1 is drawn sharp, its rect's coverage computed in
//! the shader.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::interpolate_clamp;
use skia::{Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::blurred_scroll::{entry, module, Item, GROUP_0, LAYER as LAYER_BINDING, SMP, U};

/// The list's length (`new Array(10)`).
const ITEMS: usize = 10;
/// blurredItemContainerHeight = windowHeight × 0.45.
const ITEM_HEIGHT: f32 = 0.45;
/// horizontalPadding / 2 = verticalPadding / 2.
const INSET: f32 = 60.0;
/// The Blur below which Skia's blur is not visible (σ in device pixels): drawn sharp.
const SHARP_SIGMA_PX: f32 = 0.5;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurredScroll::default())
}

/// One blurred card's layer: drawn and blurred each frame it is blurred.
#[derive(Default)]
struct Slot {
    canvas: Canvas,
    renderer: Renderer,
    blur: skia::Blur,
}

#[derive(Default)]
struct BlurredScroll {
    /// contentOffsetY.
    scroll: f32,
    slots: [Slot; 2],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    /// One per item (the queue's writes all land before the frame's commands).
    uniforms: Vec<wgpu::Buffer>,
    /// Each slot's layer, before its blur (an item's canvas, in device pixels).
    layers: [wgpu::TextureView; 2],
}

/// What item `index` looks like at `scroll`: (blur, rotate, scale).
pub(crate) fn item_state(index: usize, scroll: f32, item_height: f32) -> (f32, f32, f32) {
    let h = item_height as f64;
    let i = index as f64;
    let input = [(i - 1.0) * h, i * h, (i + 1.0) * h, (i + 2.0) * h];
    let y = scroll as f64;
    let blur = interpolate_clamp(y, &input, &[0.1, 0.1, 40.0, 0.1]);
    let rotate = interpolate_clamp(y, &input, &[0.0, 0.0, std::f64::consts::PI / 20.0, 0.0]);
    let scale = interpolate_clamp(y, &input, &[0.8, 1.0, 0.8, 1.0]);
    (blur as f32, rotate as f32, scale as f32)
}

impl Surface for BlurredScroll {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.scroll = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"scroll\":{:.2}}}", self.scroll))
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
        let (w, screen_h, s) = (frame.width, frame.height, frame.scale);
        let h = screen_h * ITEM_HEIGHT;
        let pad = screen_h / 2.0 - h / 2.0;
        let (lw, lh) = (((w * s).round() as u32).max(1), ((h * s).round() as u32).max(1));
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph), (lw, lh)));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let srgb = gfx::srgb_flag(format);

        // The items on screen (a tilted card reaches past its box by less than half its height).
        let mut drawn: [Option<(usize, Option<usize>)>; ITEMS] = [None; ITEMS];
        for (index, slot_of) in drawn.iter_mut().enumerate() {
            let top = pad + index as f32 * h - self.scroll;
            if top + 1.5 * h < 0.0 || top - 0.5 * h > screen_h {
                continue;
            }
            let (blur, rotate, scale) = item_state(index, self.scroll, h);
            let sigma = blur * scale * s;
            let slot = (sigma >= SHARP_SIGMA_PX).then_some(index % 2);
            let uniforms = Item {
                view: [w / 2.0, top + h / 2.0, rotate.cos(), rotate.sin()],
                item: [w, h, scale, slot.is_some() as u32 as f32],
                canvas: [pw as f32, ph as f32, s, srgb],
            };
            queue.write_buffer(&gpu.uniforms[index], 0, &uniforms.bytes());
            if let Some(k) = slot {
                // The white rect in the canvas's space, under the Group's scale about (w / 2, 0).
                let layer = &mut self.slots[k];
                let c = &mut layer.canvas;
                c.begin(s);
                c.translate(w / 2.0, 0.0);
                c.scale(scale, scale);
                c.translate(-w / 2.0, 0.0);
                c.draw_rrect(INSET, INSET, w - 2.0 * INSET, h - 2.0 * INSET, 20.0, &Paint::fill(Color::WHITE));
                layer.renderer.draw(device, queue, encoder, c, &gpu.layers[k], LAYER, lw, lh, wgpu::Color::TRANSPARENT);
                layer.blur.run(device, queue, encoder, &gpu.layers[k], LAYER, lw, lh, sigma);
            }
            *slot_of = Some((index, slot));
        }
        let binds: Vec<(usize, wgpu::BindGroup)> = drawn
            .iter()
            .flatten()
            .map(|&(index, slot)| {
                let layer = slot.and_then(|k| self.slots[k].blur.output()).unwrap_or(&gpu.layers[0]);
                let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("blurred scroll"),
                    layout: &gpu.layout,
                    entries: &[
                        wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms[index].as_entire_binding() },
                        wgpu::BindGroupEntry { binding: LAYER_BINDING.binding, resource: wgpu::BindingResource::TextureView(layer) },
                        wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                    ],
                });
                (index, bind)
            })
            .collect();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("blurred scroll"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // styles.container: black.
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        // In the list's order: a later item over an earlier one.
        for (_, bind) in &binds {
            pass.set_bind_group(0, bind, &[]);
            pass.draw(0..3, 0..1);
        }
        false
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), layer: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::ITEM, format, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING));
    let view = |label| skia::render::sampled_target(device, label, LAYER, layer.0, layer.1);
    Gpu {
        format,
        generation,
        size,
        pipeline,
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: (0..ITEMS)
            .map(|_| device.create_buffer(&wgpu::BufferDescriptor { label: Some("blurred scroll"), size: Item::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }))
            .collect(),
        layers: [view("blurred scroll layer a"), view("blurred scroll layer b")],
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_card_above_the_centre_blurs_tilts_and_shrinks() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let h = 912.0 * ITEM_HEIGHT;
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        rest.save("blurred-scroll-0");
        assert!(!animating);
        // Item 0 centred (top 250.8, 410.4 tall): its card from (60, 310.8) to (360, 601.2),
        // sharp, the gradient's start colour at its top left, black outside.
        let (top, bottom) = (250.8f32, 250.8 + h);
        let inside = rest.at(70, (top + 70.0) as u32);
        assert!(inside[2] > 200 && inside[0] > 120 && inside[1] < 110, "{inside:?}");
        assert_eq!(&rest.at(50, 456)[..3], &[0, 0, 0]);
        assert_eq!(&rest.at(210, (top + 55.0) as u32)[..3], &[0, 0, 0], "sharp edge");
        // Item 1 below, at scale 0.8 about its top centre: its card from x 90 (210 − 150 × 0.8)
        // and 48 pt under its top.
        let below = bottom + 60.0;
        assert!(rest.at(100, below as u32)[2] > 150, "{:?}", rest.at(100, below as u32));
        assert_eq!(&rest.at(85, below as u32)[..3], &[0, 0, 0]);
        assert_eq!(&rest.at(210, (bottom + 44.0) as u32)[..3], &[0, 0, 0]);

        // Half way to item 1: item 0 above the centre, blurred (σ 20 × 0.9), tilted, smaller.
        s.bind(&[Value::Number((h / 2.0) as f64)], None).unwrap();
        let (mid, _) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        mid.save("blurred-scroll-half");
        let (blur, rotate, scale) = item_state(0, h / 2.0, h);
        assert!((blur - 20.05).abs() < 1e-3 && (rotate - std::f32::consts::PI / 40.0).abs() < 1e-4 && (scale - 0.9).abs() < 1e-4);
        // The blur reaches past the card's edge (dark at the sharp edge before, lit now).
        let top = 250.8 - h / 2.0;
        let edge = mid.at(210, (top + 50.0) as u32);
        assert!(edge[2] > 20 && edge[2] < 200, "blurred edge {edge:?}");

        // At item 1: item 0 fully blurred (σ 40 × 0.8), item 1 sharp in the centre.
        s.bind(&[Value::Number(h as f64)], None).unwrap();
        let (one, _) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        one.save("blurred-scroll-1");
        assert!(one.at(70, (250.8 + 70.0) as u32)[2] > 200);
        assert_ne!(one.data, mid.data);
    }
}
