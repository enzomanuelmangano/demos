//! Animated 3D Parallax (src/animations/animated-3d-parallax: index.tsx,
//! hooks/use-3d-rotation-style.ts): a 300² card (#1E2731, radius 10, boxShadow
//! `0px 0px 10px rgba(0,0,0,0.15)`) on #17202A that tilts toward the finger, and the logo above
//! it that tilts after it: the same rotation, sprung more loosely (the lag is the parallax).
//!
//! - touchX/Y: the finger in the card (onBegin and onUpdate), back to CARD_SIZE / 2 at
//!   onFinalize / onTouchesUp / onTouchesCancelled. The pan begins only on the card's square.
//! - The card follows `withSpring(touch)` (Reanimated 4's default, 900/120/4); the content
//!   `withSpring(touch, { stiffness: 100, damping: 10, mass: 1 })`; both are derived values,
//!   retargeted from where they are at each move.
//! - use3DRotationStyle: rotateX = interpolate(y, [0, 300], [18, −18]) deg, rotateY =
//!   interpolate(x, [0, 300], [−18, 18]) deg (extended past the card), under `perspective` 500.
//!   The content's transformOrigin is ['50%', '50%', 300]: React Native resolves it as
//!   translate(0, 0, 300) · M · translate(0, 0, −300), so its plane sits 300 pt behind the
//!   perspective's origin: drawn at 500 / 800 of its size, and shifted against the tilt.
//! - The box shadow is σ = 5 (RN's iOS box shadow: shadowRadius = blur / 2), drawn in the card's
//!   plane and projected with it, as Core Animation projects the shadow sublayer.
//!
//! The logo is the demo's own logo.png (1024 × 842), its coverage kept in images/ (zlib) and
//! mipmapped here, drawn in its colour #179CF0 into the 200² `contain` box.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate, Extrapolation, Spring, SpringConfig, GENTLE};
use skia::{Canvas, Color, Matrix4, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::animated_3d_parallax::{entry, module, Uniforms, GROUP_0, LOGO, SHADOW, SMP, U};

/// CARD_SIZE.
const CARD_SIZE: f32 = 300.0;
/// MAX_CARD_ROTATE_DEG.
const MAX_ROTATE_DEG: f64 = 18.0;
/// The `perspective` both views use.
const PERSPECTIVE: f32 = 500.0;
/// The content's transformOrigin z.
const ORIGIN_Z: f32 = 300.0;
/// delayedSpringConfig.
const DELAYED: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 1.0 };
/// The shadow layer's margin around the card, in points (3σ and a little).
const MARGIN: f32 = 20.0;
/// boxShadow 10 px blur: σ = 5 pt.
const SHADOW_SIGMA: f32 = 5.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
static LOGO_BITMAP: &[u8] = include_bytes!("../images/parallax-logo-1024x842.a8.zlib");
const LOGO_SIZE: (u32, u32) = (1024, 842);

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let half = (CARD_SIZE / 2.0) as f64;
    Box::new(Parallax {
        touch: (half, half),
        card: (Spring::at(half), Spring::at(half)),
        content: (Spring::at(half), Spring::at(half)),
        ..Default::default()
    })
}

#[derive(Default)]
struct Parallax {
    /// The canvas, in points.
    size: (f32, f32),
    pan: PanGesture,
    finger: Option<u32>,
    /// touchX, touchY.
    touch: (f64, f64),
    /// touchCardX/Y.
    card: (Spring, Spring),
    /// touchCardContentX/Y.
    content: (Spring, Spring),
    shadow_layer: Canvas,
    renderer: Renderer,
    blur: skia::Blur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// use3DRotationStyle's transform about the view's centre, `origin_z` behind it, in the view's
/// points.
fn rotation(x: f64, y: f64, origin_z: f32) -> Matrix4 {
    let max = MAX_ROTATE_DEG;
    let rotate_x = interpolate(y, &[0.0, CARD_SIZE as f64], &[max, -max], Extrapolation::Extend);
    let rotate_y = interpolate(x, &[0.0, CARD_SIZE as f64], &[-max, max], Extrapolation::Extend);
    let c = CARD_SIZE / 2.0;
    Matrix4::translate(c, c, origin_z)
        .multiply(Matrix4::perspective(PERSPECTIVE))
        .multiply(Matrix4::rotate_x((rotate_x as f32).to_radians()))
        .multiply(Matrix4::rotate_y((rotate_y as f32).to_radians()))
        .multiply(Matrix4::translate(-c, -c, -origin_z))
}

impl Parallax {
    /// The card container's top-left in the canvas: centred (styles.container).
    fn origin(&self) -> (f32, f32) {
        ((self.size.0 - CARD_SIZE) / 2.0, (self.size.1 - CARD_SIZE) / 2.0)
    }

    fn set_touch(&mut self, x: f64, y: f64) {
        self.touch = (x, y);
        self.card.0.retarget(x, GENTLE);
        self.card.1.retarget(y, GENTLE);
        self.content.0.retarget(x, DELAYED);
        self.content.1.retarget(y, DELAYED);
    }

    /// Screen points → a view's points, as the shader's three rows.
    fn inverse(&self, m: Matrix4) -> [[f32; 4]; 3] {
        let (ox, oy) = self.origin();
        let screen = Matrix4::translate(ox, oy, 0.0).multiply(m).to_matrix3();
        screen.invert().unwrap_or(skia::Matrix3([0.0; 9])).rows()
    }
}

impl Surface for Parallax {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"touch\":[{},{}],\"card\":[{:.2},{:.2}],\"content\":[{:.2},{:.2}],\"held\":{}}}",
            self.touch.0,
            self.touch.1,
            self.card.0.value,
            self.card.1.value,
            self.content.0.value,
            self.content.1.value,
            self.finger.is_some()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let (ox, oy) = self.origin();
        let (x, y) = (x - ox, y - oy);
        let on_card = (0.0..=CARD_SIZE).contains(&x) && (0.0..=CARD_SIZE).contains(&y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, on_card) {
            Event::Begin { x, y } => {
                self.finger = Some(id);
                self.set_touch(x as f64, y as f64);
            }
            Event::Start(p) | Event::Update(p) => self.set_touch(p.x as f64, p.y as f64),
            Event::End(_) | Event::Fail => {
                self.finger = None;
                let half = (CARD_SIZE / 2.0) as f64;
                self.set_touch(half, half);
            }
            _ => {}
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
        self.size = (frame.width, frame.height);
        let now = frame.now_ms;
        let moving = self.card.0.step(now) | self.card.1.step(now) | self.content.0.step(now) | self.content.1.step(now);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(self.build(device, queue, encoder, format, frame));
        }
        let card = self.inverse(rotation(self.card.0.value, self.card.1.value, 0.0));
        let logo = self.inverse(rotation(self.content.0.value, self.content.1.value, ORIGIN_Z));
        let gpu = self.gpu.as_ref().unwrap();
        let uniforms = Uniforms {
            card0: card[0],
            card1: card[1],
            card2: card[2],
            logo0: logo[0],
            logo1: logo[1],
            logo2: logo[2],
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(encoder, "animated 3d parallax", target, &gpu.compose, &gpu.bind);
        moving || self.finger.is_some()
    }
}

impl Parallax {
    /// The pipeline, the card's shadow (drawn and blurred once, in the card's points) and the
    /// logo's mipmapped coverage.
    fn build(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, format: wgpu::TextureFormat, frame: &Frame) -> Gpu {
        let s = frame.scale;
        let side = ((CARD_SIZE + 2.0 * MARGIN) * s).ceil() as u32;
        let layer = skia::render::sampled_target(device, "parallax shadow", LAYER, side, side);
        let c = &mut self.shadow_layer;
        c.begin(s);
        c.translate(MARGIN, MARGIN);
        c.draw_rrect(0.0, 0.0, CARD_SIZE, CARD_SIZE, 10.0, &Paint::fill(Color::rgba8(0, 0, 0, 255).alpha(0.15)));
        self.renderer.draw(device, queue, encoder, c, &layer, LAYER, side, side, wgpu::Color::TRANSPARENT);
        let shadow = self.blur.run(device, queue, encoder, &layer, LAYER, side, side, SHADOW_SIGMA * s);

        let logo = logo_texture(device, queue);
        let shader = device.create_shader_module(module());
        let layout = device.create_bind_group_layout(&GROUP_0);
        let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("parallax"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("parallax"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("parallax"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: SHADOW.binding, resource: wgpu::BindingResource::TextureView(shadow) },
                wgpu::BindGroupEntry { binding: LOGO.binding, resource: wgpu::BindingResource::TextureView(&logo) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        });
        Gpu { format, generation: frame.shader_generation, size: frame.pixels(), compose, uniforms, bind }
    }
}

/// logo.png's coverage, inflated, with its mip chain (each level a 2×2 box of the last).
fn logo_texture(device: &wgpu::Device, queue: &wgpu::Queue) -> wgpu::TextureView {
    let (w, h) = LOGO_SIZE;
    let mut level = miniz_oxide::inflate::decompress_to_vec_zlib(LOGO_BITMAP).unwrap_or_else(|_| vec![0; (w * h) as usize]);
    let levels = 32 - w.max(h).leading_zeros();
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("parallax logo"),
        size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        mip_level_count: levels,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::R8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let (mut lw, mut lh) = (w, h);
    for mip in 0..levels {
        queue.write_texture(
            wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: mip, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            &level,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(lw), rows_per_image: Some(lh) },
            wgpu::Extent3d { width: lw, height: lh, depth_or_array_layers: 1 },
        );
        let (nw, nh) = ((lw / 2).max(1), (lh / 2).max(1));
        let mut next = vec![0u8; (nw * nh) as usize];
        for y in 0..nh {
            for x in 0..nw {
                let at = |dx: u32, dy: u32| level[(((2 * y + dy).min(lh - 1)) * lw + (2 * x + dx).min(lw - 1)) as usize] as u32;
                next[(y * nw + x) as usize] = ((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1) + 2) / 4) as u8;
            }
        }
        level = next;
        (lw, lh) = (nw, nh);
    }
    texture.create_view(&Default::default())
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_card_tilts_toward_the_finger_and_the_logo_lags() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("parallax-rest");
        assert!(!animating);
        // At rest: the card spans 60…360 × 306…606; the logo, at 5/8 of its size, is centred.
        assert_eq!(&rest.at(5, 5)[..3], &[23, 32, 42]);
        assert_eq!(&rest.at(70, 320)[..3], &[30, 39, 49]);
        assert_eq!(&rest.at(210, 456)[..3], &[23, 156, 240]);
        // The bird at 5/8: 125 pt wide about x = 210, so nothing of it at x = 210 ± 70.
        assert_ne!(&rest.at(285, 456)[..3], &[23, 156, 240]);

        // A finger at the card's top-right corner: that corner recedes (the card's edge there moves
        // inward), and the logo is still on its way while the card has nearly arrived.
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 350.0, 316.0, 0.0));
        let mut ms = 0.0;
        while ms < 300.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (tilted, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        tilted.save("parallax-tilted");
        assert!(animating);
        // The top-right corner went in: (358, 308) was card at rest, background now.
        assert_eq!(&tilted.at(358, 308)[..3], &[23, 32, 42]);
        // The bottom-left corner came out past the rest edge.
        assert_eq!(&tilted.at(57, 609)[..3], &[30, 39, 49]);
        s.input(&pointer(PointerPhase::Up, 350.0, 316.0, ms));
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        assert!(!animating);
        assert_eq!(back.data, rest.data);
    }
}
