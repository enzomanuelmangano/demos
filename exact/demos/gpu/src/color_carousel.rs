//! Color Carousel: a square with a radial glow in the active card's colour, over a paged
//! horizontal strip of colour cards. The centred card is largest; the others shrink and turn
//! away from the centre in perspective.
//!
//! - The strip snaps to whole cards. A release lands on the card the flick projects to, clamped
//!   to the content.
//! - Cards are drawn back to front, by distance from the centre.
//! - The glow eases to the centred colour over 300 ms, in linear light, so the midpoint is not
//!   muddy.
//! - Haptics: a selection each time the centred colour changes, during the drag and the glide.
//!   Hysteresis past the line between two cards keeps a hovering finger from flapping, and
//!   selections come at most one per HAPTIC_GAP_MS. A rigid impact each time the strip is pulled
//!   or thrown past an end.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use motion::{interpolate, interpolate_clamp, Easing, Extrapolation, Timing};
use draw2d::Color;

use crate::ui_scroll::{Snap, UiScroll};
use crate::{gfx, shaders};
use exact_gpu::InputEvent;
use shaders::color_carousel::{entry, module, Uniforms, CARDS, GROUP_0, U};

/// The twenty card colours.
const COLORS: [u32; 20] = [
    0x336699, 0x6699CC, 0x99CCFF, 0xCCCCFF, 0x99CC99, 0xCCFFCC, 0xFFFF99, 0xFFCC99, 0xFF9999, 0xFFCCCC, 0xFF99CC, 0xCC99FF,
    0x9966CC, 0x663399, 0xFF9966, 0xFF6600, 0xCC6600, 0x996600, 0xFFCC00, 0xFFFF00,
];
/// Empty cards at each end, plus the colours.
const ITEMS: usize = COLORS.len() + 4;
/// Background colour, and the glow's outer edge.
const BACKGROUND: u32 = 0x111111;

/// Cards across the square.
const MAX_RENDERED: f64 = 5.0;
/// Card height over width.
const ASPECT: f64 = 3.0 / 4.0;
const PERSPECTIVE: f64 = 500.0;
const RADIUS: f32 = 5.0;
/// Shadow sigma, pt.
const SHADOW_SIGMA: f32 = 2.5;
/// Floats per card: five vec4s.
const CARD_FLOATS: usize = 20;
/// Deceleration rate; UIKit clamps it to fast.
const DECELERATION: f64 = 0.8;
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;
/// How far past the line between two cards the offset goes before the felt card changes, pt.
const SWITCH: f64 = 6.0;

/// The card the haptics feel at `precise` (in items), `felt` before: it holds until `precise`
/// is SWITCH (as `slack` items) past either of its edges.
fn detent(felt: Option<i64>, precise: f64, slack: f64) -> i64 {
    match felt {
        Some(c) if precise >= c as f64 - slack && precise < c as f64 + 1.0 + slack => c,
        _ => precise.floor() as i64,
    }
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let mut s = ColorCarousel { scroll: UiScroll::new(0.0, 0.0, 0.0, DECELERATION, Snap::Free), width: 0.0, scroll_x: 0.0, active: None, channels: Default::default(), cards: Vec::with_capacity(ITEMS * CARD_FLOATS), order: Vec::with_capacity(ITEMS), gpu: None, felt: None, past_end: false, haptic_at: f64::NEG_INFINITY, posted: Vec::new() };
    s.retarget(2, true);
    Box::new(s)
}

struct ColorCarousel {
    scroll: UiScroll,
    /// The square's side the scroll was laid out for.
    width: f64,
    scroll_x: f64,
    active: Option<i64>,
    /// The glow colour per channel, in linear light (value^2.2).
    channels: [Timing; 3],
    cards: Vec<f32>,
    order: Vec<(i64, usize)>,
    gpu: Option<Gpu>,
    /// The item the haptics last felt (with hysteresis), whether the strip is past an end, the
    /// last selection haptic, the messages to post.
    felt: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
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

/// The card's accent colour, or the background past the cards.
fn accent(index: i64) -> Color {
    match usize::try_from(index - 2).ok().and_then(|i| COLORS.get(i)) {
        Some(&c) => Color::hex(c).darken(0.1),
        None => Color::hex(BACKGROUND),
    }
}

/// JS `%`: the result takes the dividend's sign.
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

    /// The glow colour drawn this frame, back in gamma space.
    fn color(&self) -> [f32; 4] {
        let c = |k: usize| ((self.channels[k].value.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round() / 255.0) as f32;
        [c(0), c(1), c(2), 1.0]
    }
}

impl Surface for ColorCarousel {
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

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The strip covers the square.
        let w = self.width as f32;
        let inside = (0.0..=w).contains(&x) && (0.0..=w).contains(&y);
        self.scroll.input(id, gfx::phase(phase), x, y, at_ms, inside);
    }

    fn opaque(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
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
        if self.width != width {
            self.width = width;
            // ITEMS cards in a row, viewed through the square.
            self.scroll.port = width;
            self.scroll.max = (ITEMS as f64 * item_width - width).max(0.0);
            self.scroll.snap = Snap::Interval(item_width);
        }
        let mut moving = self.scroll.step(frame.now_ms);
        self.scroll_x = self.scroll.offset;
        let x = self.scroll_x;
        // The fractional card under the centre, from the offset.
        let precise = (MAX_RENDERED / 2.0).floor() + (x + item_width / 2.0) / (width / MAX_RENDERED);
        let index = precise.floor() as i64;
        // The haptic clamps to real cards: the rubber band past an end is not a detent.
        let card = |i: i64| i.clamp(2, ITEMS as i64 - 3);
        let felt = detent(self.felt, precise, SWITCH / item_width);
        if self.felt.is_some_and(|a| card(a) != card(felt)) && frame.now_ms - self.haptic_at >= HAPTIC_GAP_MS {
            self.posted.push("haptic:selection".into());
            self.haptic_at = frame.now_ms;
        }
        self.felt = Some(felt);
        self.retarget(index, false);
        if x < -PAST_END || x > self.scroll.max + PAST_END {
            if !self.past_end {
                self.posted.push("haptic:impact-rigid".into());
            }
            self.past_end = true;
        } else if (0.0..=self.scroll.max).contains(&x) {
            self.past_end = false;
        }
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
            // The card's centre in the square.
            let (cx, cy) = (position + item_width / 2.0, width / 2.0);
            // Scale, perspective and turn about y, in one matrix.
            let (sin, cos) = theta.sin_cos();
            let p = sin / PERSPECTIVE;
            let m0 = [k * (scale * cos + cx * p), 0.0, k * cx];
            let m1 = [k * cy * p, k * scale, k * cy];
            let m2 = [p, 0.0, 1.0];
            // Card colours are Display P3 (`Color::view_hex`).
            let c = Color::view_hex(rgb).0;
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
    fn the_felt_card_holds_across_a_hovering_line() {
        let slack = SWITCH / 84.0;
        let mut felt = detent(None, 4.9, slack);
        assert_eq!(felt, 4);
        for k in 0..40 {
            felt = detent(Some(felt), if k % 2 == 0 { 5.03 } else { 4.97 }, slack);
            assert_eq!(felt, 4);
        }
        assert_eq!(detent(Some(4), 5.1, slack), 5);
        assert_eq!(detent(Some(5), 4.95, slack), 5);
        assert_eq!(detent(Some(5), 4.9, slack), 4);
    }

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
        // Item 2 is centred at scale 2.
        assert_eq!(&a.at(210, 210)[..3], &[27, 104, 157]);
        assert_eq!(&a.at(210, 110)[..3], &[27, 104, 157]);
        assert_eq!(&a.at(320, 210)[..3], &[85, 155, 209]);
        assert_eq!(&a.at(2, 2)[..3], &[0x11, 0x11, 0x11]);
        assert!(s.agent("{}").unwrap().contains("#2E5C8A"));
        s.bind(&[Value::Number(84.0)], None).unwrap();
        let (_, moving) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        assert!(moving);
        let (b, moving) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        b.save("color-carousel-1");
        assert!(!moving);
        assert_eq!(&b.at(210, 210)[..3], &[85, 155, 209]);
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains(&{
            let [r, g, bb, _] = Color::hex(0x6699CC).darken(0.1).0.map(|v| (v * 255.0).round() as u8);
            format!("#{r:02X}{g:02X}{bb:02X}")
        }), "{reply}");
        s.bind(&[Value::Number(42.0)], None).unwrap();
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(800.0)).unwrap();
        c.save("color-carousel-half");
    }

    #[test]
    fn a_flick_moves_one_item_and_a_slow_drag_rounds() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 420.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let touch = |phase, x: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 210.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        let mut s = surface();
        let settle = |s: &mut Box<dyn Surface>, mut ms: f64| {
            while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 10_000.0 {
                ms += 16.67;
            }
            ms
        };
        let mut ms = settle(&mut s, 0.0);
        // A flick of 50 pt stops on the next card.
        use exact_gpu::PointerPhase::*;
        s.input(&touch(Down, 300.0, ms));
        for k in 1..=6 {
            s.input(&touch(Move, 300.0 - 10.0 * k as f32, ms + 16.67 * k as f64));
        }
        s.input(&touch(Up, 240.0, ms + 16.67 * 6.0));
        ms = settle(&mut s, ms + 100.0);
        assert!(s.agent("{}").unwrap().contains("\"scrollX\":168"), "{}", s.agent("{}").unwrap());
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:selection"]);
        s.input(&touch(Down, 300.0, ms));
        for k in 1..=30 {
            s.input(&touch(Move, 300.0 - k as f32, ms + 33.0 * k as f64));
        }
        s.input(&touch(Up, 270.0, ms + 33.0 * 30.0 + 200.0));
        ms = settle(&mut s, ms + 33.0 * 30.0 + 200.0);
        assert!(s.agent("{}").unwrap().contains("\"scrollX\":168"), "{}", s.agent("{}").unwrap());
        assert!(s.messages().is_empty());
        s.input(&touch(Down, 60.0, ms));
        for k in 1..=30 {
            s.input(&touch(Move, 60.0 + 10.0 * k as f32, ms + 33.0 * k as f64));
            fixture::render(&gpu, s.as_mut(), &frame(ms + 33.0 * k as f64)).unwrap();
        }
        s.input(&touch(Up, 360.0, ms + 33.0 * 30.0 + 200.0));
        settle(&mut s, ms + 33.0 * 30.0 + 200.0);
        assert_eq!(s.messages(), vec!["haptic:selection", "haptic:selection", "haptic:impact-rigid"]);
    }
}
