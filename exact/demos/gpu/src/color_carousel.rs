//! Color Carousel (src/animations/color-carousel): a window-wide square (index.tsx) with a
//! radial gradient (centre (w/2, w/2), radius w/2, from the active item's accent colour to
//! BACKGROUND_COLOR #111111) under a paged horizontal strip of 24 items (two empty at each
//! end, then constants.ts's twenty colours), each `w / 5` wide and `(w / 5) / (3 / 4)` tall,
//! centred on the square's middle (components/carousel). The strip's scroll is the Contract's
//! (a native scroller, snapping at every item); its offset is this surface's input, and the
//! cards are drawn here.
//!
//! Per item (carousel-item.tsx), from translateX = −scrollX:
//! - position = index × itemWidth + translateX; distance = |w/2 − ((position + w/2 +
//!   itemWidth/2) % w)| (JS `%`); n = 1 − distance / (w/2).
//! - scale = interpolate(n, [0, 1], [2, 0.8], CLAMP); zIndex = floor(interpolate(n, [0, 1],
//!   [1000, 0], CLAMP)) (drawn back to front, ties in index order).
//! - rotateY = interpolate(preciseActiveIndex − index − 0.5, [−2, −1, 0, 1, 2], [−25, −20, 0,
//!   20, 25]) degrees (EXTEND), preciseActiveIndex = 2 + (scrollX + itemWidth/2) / itemWidth.
//! - transform [scale, perspective 500, rotateY] about the item's centre; the card fills it:
//!   radius 5, its colour, boxShadow 0 0 5px rgba(0,0,0,0.25).
//!
//! The active index is floor(preciseActiveIndex); the gradient's colour follows it with
//! withTiming (300 ms, inOut(quad)) in Reanimated's colour space (each channel in gamma 2.2,
//! rounded back to 8 bits), from `Color(c).darken(0.1).hex()`.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, interpolate_clamp, Easing, Extrapolation, Timing};
use skia::Color;

use crate::{gfx, shaders};
use shaders::color_carousel::{entry, module, Uniforms, CARDS, GROUP_0, U};

/// The twenty colours (constants.ts).
const COLORS: [u32; 20] = [
    0x336699, 0x6699CC, 0x99CCFF, 0xCCCCFF, 0x99CC99, 0xCCFFCC, 0xFFFF99, 0xFFCC99, 0xFF9999, 0xFFCCCC, 0xFF99CC, 0xCC99FF,
    0x9966CC, 0x663399, 0xFF9966, 0xFF6600, 0xCC6600, 0x996600, 0xFFCC00, 0xFFFF00,
];
/// `[null, null, ...colors, null, null]`.
const ITEMS: usize = COLORS.len() + 4;
/// BACKGROUND_COLOR.
const BACKGROUND: u32 = 0x111111;
/// MAX_RENDERED_ITEMS.
const MAX_RENDERED: f64 = 5.0;
/// LIST_ITEM_ASPECT_RATIO.
const ASPECT: f64 = 3.0 / 4.0;
const PERSPECTIVE: f64 = 500.0;
const RADIUS: f32 = 5.0;
/// boxShadow blur 5px: sigma 2.5.
const SHADOW_SIGMA: f32 = 2.5;
/// Floats per card: five vec4s.
const CARD_FLOATS: usize = 20;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let mut s = ColorCarousel { scroll_x: 0.0, active: None, channels: Default::default(), cards: Vec::with_capacity(ITEMS * CARD_FLOATS), order: Vec::with_capacity(ITEMS), gpu: None };
    s.retarget(2, true);
    Box::new(s)
}

struct ColorCarousel {
    scroll_x: f64,
    active: Option<i64>,
    /// The gradient's colour, per channel in Reanimated's linear space (value^2.2).
    channels: [Timing; 3],
    cards: Vec<f32>,
    order: Vec<(i64, usize)>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    background: wgpu::RenderPipeline,
    cards: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    buffer: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// `data[i]?.accentColor ?? BACKGROUND_COLOR`.
fn accent(index: i64) -> Color {
    match usize::try_from(index - 2).ok().and_then(|i| COLORS.get(i)) {
        Some(&c) => Color::hex(c).darken(0.1),
        None => Color::hex(BACKGROUND),
    }
}

/// JS `%`: the sign of the dividend.
fn js_rem(a: f64, b: f64) -> f64 {
    a % b
}

impl ColorCarousel {
    fn retarget(&mut self, index: i64, immediately: bool) {
        if self.active == Some(index) {
            return;
        }
        self.active = Some(index);
        let c = accent(index);
        for (k, ch) in self.channels.iter_mut().enumerate() {
            let linear = (c.0[k] as f64).powf(2.2);
            if immediately {
                ch.set(linear);
            } else {
                ch.to(linear, 300.0, Easing::timing_default());
            }
        }
    }

    /// rgbaArrayToRGBAColor(toGammaSpace(…)): the colour drawn this frame.
    fn color(&self) -> [f32; 4] {
        let c = |k: usize| ((self.channels[k].value.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round() / 255.0) as f32;
        [c(0), c(1), c(2), 1.0]
    }
}

impl Surface for ColorCarousel {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.scroll_x = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let [r, g, b, _] = self.color().map(|v| (v * 255.0).round() as u8);
        Some(format!("{{\"scrollX\":{},\"activeIndex\":{},\"color\":\"#{r:02X}{g:02X}{b:02X}\"}}", self.scroll_x, self.active.unwrap_or(2)))
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
        let width = frame.width as f64;
        let item_width = width / MAX_RENDERED;
        let item_height = item_width / ASPECT;
        let x = self.scroll_x;
        // onScroll: activeIndex = floor(2 + (x + itemWidth / 2) / (width / 5)).
        let precise = (MAX_RENDERED / 2.0).floor() + (x + item_width / 2.0) / (width / MAX_RENDERED);
        self.retarget(precise.floor() as i64, false);
        let mut moving = false;
        for ch in &mut self.channels {
            moving |= ch.step(frame.now_ms);
        }

        // The cards, back to front.
        let k = frame.scale as f64;
        let center = width / 2.0;
        self.order.clear();
        for index in 0..ITEMS {
            let position = index as f64 * item_width - x;
            let distance = (center - js_rem(position + center + item_width / 2.0, width)).abs();
            let n = 1.0 - distance / (width / 2.0);
            let z = interpolate_clamp(n, &[0.0, 1.0], &[1000.0, 0.0]).floor() as i64;
            self.order.push((z, index));
        }
        self.order.sort();
        self.cards.clear();
        for &(_, index) in &self.order {
            let Some(&rgb) = index.checked_sub(2).and_then(|i| COLORS.get(i)) else { continue };
            let position = index as f64 * item_width - x;
            let distance = (center - js_rem(position + center + item_width / 2.0, width)).abs();
            let n = 1.0 - distance / (width / 2.0);
            let scale = interpolate_clamp(n, &[0.0, 1.0], &[2.0, 0.8]);
            let theta = interpolate(precise - index as f64 - 0.5, &[-2.0, -1.0, 0.0, 1.0, 2.0], &[-25.0, -20.0, 0.0, 20.0, 25.0], Extrapolation::Extend).to_radians();
            // The item's centre in the square; content is centred vertically (alignItems).
            let (cx, cy) = (position + item_width / 2.0, width / 2.0);
            // S · P · R_y on (lx, ly, 0, 1): x = s cos θ lx, y = s ly, w = 1 + sin θ lx / 500.
            let (sin, cos) = theta.sin_cos();
            let p = sin / PERSPECTIVE;
            let m0 = [k * (scale * cos + cx * p), 0.0, k * cx];
            let m1 = [k * cy * p, k * scale, k * cy];
            let m2 = [p, 0.0, 1.0];
            let c = Color::hex(rgb).0;
            for row in [m0, m1, m2] {
                self.cards.extend_from_slice(&[row[0] as f32, row[1] as f32, row[2] as f32, 0.0]);
            }
            self.cards.extend_from_slice(&[c[0], c[1], c[2], 1.0]);
            self.cards.extend_from_slice(&[(item_width / 2.0) as f32, (item_height / 2.0) as f32, RADIUS, SHADOW_SIGMA]);
        }

        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (pw, ph) = frame.pixels();
        let outer = Color::hex(BACKGROUND).0;
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)], inner: self.color(), outer };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let count = self.cards.len() / CARD_FLOATS;
        if count > 0 {
            queue.write_buffer(&gpu.buffer, 0, bytes(&self.cards));
        }
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("color carousel"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.set_pipeline(&gpu.background);
        pass.draw(0..3, 0..1);
        if count > 0 {
            pass.set_pipeline(&gpu.cards);
            pass.draw(0..6, 0..count as u32);
        }
        moving
    }
}

fn bytes(data: &[f32]) -> &[u8] {
    // f32 is plain old data.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let premultiplied = Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING);
    let background = gfx::fullscreen(device, format, &shader, &layout, entry::BG_VS, entry::BG_FS, None, "color carousel background");
    let cards = gfx::fullscreen(device, format, &shader, &layout, entry::CARD_VS, entry::CARD_FS, premultiplied, "color carousel cards");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("color carousel"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("color carousel cards"), size: (ITEMS * CARD_FLOATS * 4) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("color carousel"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: CARDS.binding, resource: buffer.as_entire_binding() },
        ],
    });
    Gpu { format, generation, background, cards, uniforms, buffer, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_centred_card_is_largest_and_the_glow_follows_it() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 420.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (a, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("color-carousel-0");
        assert!(!moving);
        // Item 2 (#336699) is centred at scale 2: 168 x 224 about (210, 210).
        assert_eq!(&a.at(210, 210)[..3], &[0x33, 0x66, 0x99]);
        assert_eq!(&a.at(210, 110)[..3], &[0x33, 0x66, 0x99]);
        // Its neighbour (#6699CC) shows past its right edge at 1.52.
        assert_eq!(&a.at(320, 210)[..3], &[0x66, 0x99, 0xCC]);
        // The gradient's corner is BACKGROUND_COLOR.
        assert_eq!(&a.at(2, 2)[..3], &[0x11, 0x11, 0x11]);
        assert!(s.agent("{}").unwrap().contains("#2E5C8A"));
        // One item on: #6699CC is centred and the glow eases to its accent.
        s.bind(&[Value::Number(84.0)], None).unwrap();
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        assert!(moving);
        let (b, moving) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        b.save("color-carousel-1");
        assert!(!moving);
        assert_eq!(&b.at(210, 210)[..3], &[0x66, 0x99, 0xCC]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains(&{
            let [r, g, bb, _] = Color::hex(0x6699CC).darken(0.1).0.map(|v| (v * 255.0).round() as u8);
            format!("#{r:02X}{g:02X}{bb:02X}")
        }), "{reply}");
        // Half an item: the cards turn in perspective.
        s.bind(&[Value::Number(42.0)], None).unwrap();
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(800.0)).unwrap();
        c.save("color-carousel-half");
    }
}
