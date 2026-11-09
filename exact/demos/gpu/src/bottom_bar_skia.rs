//! BottomBarSkia (src/animations/bottom-bar-skia/components/bottom-tab-bar): a white tab bar
//! whose bump (a circle of r 50 melted into the bar by Blur 5 + ColorMatrix alpha × 20 − 10)
//! carries a #7E6CE2 circle (r 43) to the selected tab on withSpring() (Gentle); the selected
//! icon rises 35 into it (withSpring { duration 400, dampingRatio 1 }: stiffness 1699.6,
//! damping 164.9, mass 4) and turns white (withTiming 400 ms, interpolateColor #7E6CE2 →
//! #FFFFFF). The canvas view casts an iOS shadow (rgba(0,0,0,0.2), opacity 0.2, radius 25,
//! offset (0, −10)) from what it draws.
//!
//! Input: the selected index (Contract owns it, as the navigator does: its taps are boxes over
//! the canvas). The canvas is RN's (`bottomTabBarHeight + 50` tall, bottomTabBarHeight =
//! 65 + bottom inset / 2) with SHADOW_ROOM points more on top, where the shadow falls.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate_color, Easing, Spring, SpringConfig, Timing, GENTLE};
use skia::{fit_box, Canvas, Color, Paint, Path, Rect, Renderer};

use crate::{gfx, shaders};
use shaders::bottom_bar_skia::{entry, module, Uniforms, GROUP_0, LAYER, MASK, SMP, TOP, U};

/// BOTTOM_BAR_HEIGHT_OFFSET.
const OFFSET: f32 = 50.0;
/// Points above RN's canvas, for the shadow: offset 10 + 3σ (75).
pub const SHADOW_ROOM: f32 = 85.0;
/// The layer's padding past the canvas, points: 3σ of Blur 5.
const PAD: f32 = 15.0;
const TABS: usize = 3;
const ICON_SIZE: f32 = 30.0;
const PURPLE: u32 = 0x7E6CE2;
/// DurationConfig as withSpring: tools/spring.ts 400 1.
const ICON_SPRING: SpringConfig = SpringConfig { stiffness: 1699.6, damping: 164.9, mass: 4.0 };
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// svg-icons: HOME_ICON, SEARCH_ICON, USER_ICON and their FitBox `src` (square).
const ICONS: [(&str, f32); TABS] = [
    ("M21.71,11.29l-9-9a1,1,0,0,0-1.42,0l-9,9a1,1,0,0,0-.21,1.09A1,1,0,0,0,3,13H4v7.3A1.77,1.77,0,0,0,5.83,22H8.5a1,1,0,0,0,1-1V16.1a1,1,0,0,1,1-1h3a1,1,0,0,1,1,1V21a1,1,0,0,0,1,1h2.67A1.77,1.77,0,0,0,20,20.3V13h1a1,1,0,0,0,.92-.62A1,1,0,0,0,21.71,11.29Z", 24.0),
    ("M54.734,9.053C39.12,18.067,27.95,32.624,23.284,50.039c-4.667,17.415-2.271,35.606,6.743,51.22
      c12.023,20.823,34.441,33.759,58.508,33.759c7.599,0,15.139-1.308,22.287-3.818l30.364,52.592l21.65-12.5l-30.359-52.583
      c10.255-8.774,17.638-20.411,21.207-33.73c4.666-17.415,2.27-35.605-6.744-51.22C134.918,12.936,112.499,0,88.433,0
      C76.645,0,64.992,3.13,54.734,9.053z M125.29,46.259c5.676,9.831,7.184,21.285,4.246,32.25c-2.938,10.965-9.971,20.13-19.802,25.806
      c-6.462,3.731-13.793,5.703-21.199,5.703c-15.163,0-29.286-8.146-36.857-21.259c-5.676-9.831-7.184-21.284-4.245-32.25
      c2.938-10.965,9.971-20.13,19.802-25.807C73.696,26.972,81.027,25,88.433,25C103.597,25,117.719,33.146,125.29,46.259z", 183.792),
    ("M288 320a224 224 0 1 0 448 0 224 224 0 1 0-448 0zm544 608H160a32 32 0 0 1-32-32v-96a160 160 0 0 1 160-160h448a160 160 0 0 1 160 160v96a32 32 0 0 1-32 32z", 1024.0),
];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BottomBarSkia { icons: ICONS.map(|(d, _)| skia::path_from_svg(d)), ..Default::default() })
}

#[derive(Default)]
struct BottomBarSkia {
    /// The bound index; None before the first bind.
    index: Option<usize>,
    /// withSpring(currentIndex).
    animated: Spring,
    /// Each icon's translateY and colour progress, started at their targets.
    rise: [Spring; TABS],
    tint: [Timing; TABS],
    /// The tab bar's height when they were placed.
    placed: Option<f32>,
    icons: [Option<Path>; TABS],
    layers: [Canvas; 2],
    renderers: [Renderer; 2],
    blurs: [skia::Blur; 2],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    goo: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The padded layer, the padded thresholded shape, and the canvas-sized top.
    layer: wgpu::TextureView,
    shape: wgpu::TextureView,
    top: wgpu::TextureView,
    binds: Option<(wgpu::BindGroup, wgpu::BindGroup)>,
}

/// baseTranslateY = y + height / 2 − iconSize / 2 − 8, 35 higher when active.
fn rise_of(bar: f32, active: bool) -> f64 {
    let base = OFFSET + bar / 2.0 - ICON_SIZE / 2.0 - 8.0;
    (if active { base - 35.0 } else { base }) as f64
}

impl Surface for BottomBarSkia {
    fn arguments(&self) -> Vec<(&'static str, Value)> {
        vec![("index", Value::Number(0.0))]
    }

    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let index = inputs.first().and_then(Value::as_number).unwrap_or(0.0).clamp(0.0, (TABS - 1) as f64) as usize;
        match self.index {
            None => self.animated = Spring::at(index as f64),
            Some(old) if old != index => {
                self.animated.to(index as f64, self.animated.velocity, GENTLE);
                if let Some(bar) = self.placed {
                    for i in [old, index] {
                        let active = i == index;
                        self.rise[i].to(rise_of(bar, active), self.rise[i].velocity, ICON_SPRING);
                        self.tint[i].to(if active { 1.0 } else { 0.0 }, 400.0, Easing::timing_default());
                    }
                }
            }
            _ => {}
        }
        self.index = Some(index);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"index\":{},\"animatedIndex\":{}}}", self.index.unwrap_or(0), self.animated.value))
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
        let w = frame.width;
        let bar = frame.height - SHADOW_ROOM - OFFSET;
        let index = self.index.unwrap_or(0);
        if self.placed != Some(bar) {
            self.placed = Some(bar);
            for i in 0..TABS {
                self.rise[i] = Spring::at(rise_of(bar, i == index));
                self.tint[i] = Timing::at(if i == index { 1.0 } else { 0.0 });
            }
        }
        let now = frame.now_ms;
        let mut moving = self.animated.step(now);
        for i in 0..TABS {
            moving |= self.rise[i].step(now);
            moving |= self.tint[i].step(now);
        }
        let tab = w / TABS as f32;
        let cx = tab * self.animated.value as f32 + w / (TABS as f32 * 2.0);

        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let pad = (PAD * s).ceil() as u32;
        let (lw, lh) = (pw + 2 * pad, ph + 2 * pad);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph), (lw, lh)));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let [layer, top] = &mut self.layers;
        // The layer: rect(−10, 45, width + 50, height + 50) and the bump, white.
        layer.begin(s);
        layer.translate(pad as f32 / s, pad as f32 / s + SHADOW_ROOM);
        let mut shape = skia::path_builder();
        skia::add_rect(&mut shape, -10.0, 45.0, w + OFFSET, bar + OFFSET);
        skia::add_circle(&mut shape, cx, OFFSET, OFFSET);
        layer.draw_path(&shape.build(), &Paint::fill(Color::WHITE));
        // Over it: the circle and the icons.
        top.begin(s);
        top.translate(0.0, SHADOW_ROOM);
        top.draw_circle(cx, OFFSET, 43.0, &Paint::fill(Color::hex(PURPLE)));
        let from = [126.0, 108.0, 226.0, 1.0];
        let to = [255.0, 255.0, 255.0, 1.0];
        for (i, icon) in self.icons.iter().enumerate() {
            let Some(path) = icon else { continue };
            let c = interpolate_color(self.tint[i].value, &[0.0, 1.0], &[from, to]);
            let saved = top.matrix();
            top.translate(tab * i as f32 + tab / 2.0 - ICON_SIZE / 2.0, self.rise[i].value as f32);
            let side = ICONS[i].1;
            top.concat(fit_box(Rect::new(0.0, 0.0, side, side), Rect::new(0.0, 0.0, ICON_SIZE, ICON_SIZE)));
            top.draw_path(path, &Paint::fill(Color::rgb8(c[0] as u8, c[1] as u8, c[2] as u8)));
            top.set_matrix(saved);
        }
        self.renderers[0].draw(device, queue, encoder, layer, &gpu.layer, FORMAT, lw, lh, wgpu::Color::TRANSPARENT);
        self.renderers[1].draw(device, queue, encoder, top, &gpu.top, FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, gfx::srgb_flag(format), 0.0], pad: [pad as f32, lw as f32, lh as f32, 10.0 * s] };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let [blur_layer, blur_shadow] = &mut self.blurs;
        // Blur 5: σ 5 points; then the shape, thresholded, for the shadow (σ = shadowRadius 25).
        let blurred = blur_layer.run(device, queue, encoder, &gpu.layer, FORMAT, lw, lh, 5.0 * s);
        match gpu.binds.as_ref() {
            Some((goo, _)) => {
                skia::render::fullscreen_pass(encoder, "bottom bar skia shape", &gpu.shape, &gpu.goo, goo);
                blur_shadow.run(device, queue, encoder, &gpu.shape, FORMAT, lw, lh, 25.0 * s);
            }
            None => {
                let goo = bind_group(device, gpu, blurred, blurred);
                skia::render::fullscreen_pass(encoder, "bottom bar skia shape", &gpu.shape, &gpu.goo, &goo);
                let shadow = blur_shadow.run(device, queue, encoder, &gpu.shape, FORMAT, lw, lh, 25.0 * s);
                let compose = bind_group(device, gpu, blurred, shadow);
                gpu.binds = Some((goo, compose));
            }
        }
        let (_, compose) = gpu.binds.as_ref().unwrap();
        skia::render::fullscreen_pass(encoder, "bottom bar skia", target, &gpu.compose, compose);
        moving
    }
}

fn bind_group(device: &wgpu::Device, gpu: &Gpu, layer: &wgpu::TextureView, mask: &wgpu::TextureView) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("bottom bar skia"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: LAYER.binding, resource: wgpu::BindingResource::TextureView(layer) },
            wgpu::BindGroupEntry { binding: MASK.binding, resource: wgpu::BindingResource::TextureView(mask) },
            wgpu::BindGroupEntry { binding: TOP.binding, resource: wgpu::BindingResource::TextureView(&gpu.top) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
        ],
    })
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), padded: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let goo = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::GOO, FORMAT, None);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let view = |label, (w, h): (u32, u32)| skia::render::sampled_target(device, label, FORMAT, w, h);
    Gpu {
        format,
        generation,
        size,
        goo,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("bottom bar skia"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        sampler: skia::render::linear_sampler(device),
        layer: view("bottom bar skia layer", padded),
        shape: view("bottom bar skia shape", padded),
        top: view("bottom bar skia top", size),
        binds: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    /// A 390-wide screen with a 34 bottom inset: the bar 82 tall, the canvas 132 + 85.
    fn frame(now_ms: f64) -> Frame {
        Frame { width: 390.0, height: 82.0 + OFFSET + SHADOW_ROOM, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    #[test]
    fn the_bump_and_the_icon_move_to_the_tab() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("bottom-bar-skia-0");
        assert!(!animating);
        let y = |rn: f32| (2.0 * (rn + SHADOW_ROOM)) as u32;
        let purple = |p: [u8; 4]| p[0] == 0x7E && p[1] == 0x6C && p[2] == 0xE2;
        // The bump's circle at the first tab's centre (65, 50); the bar white below it.
        assert!(purple(img.at(2 * 65 - 70, y(50.0))), "{:?}", img.at(60, y(50.0)));
        assert_eq!(img.at(2 * 195, y(100.0))[..3], [255, 255, 255]);
        // Above the bar away from the bump: only the faint shadow.
        let above = img.at(2 * 195, y(40.0));
        assert!(above[3] < 20 && above[3] > 0, "shadow {above:?}");
        // The white bump's rim above the circle (r 43 within r 50).
        assert_eq!(img.at(2 * 65, y(3.0))[..3], [255, 255, 255], "{:?}", img.at(130, y(3.0)));
        s.bind(&[Value::Number(2.0)], None).unwrap();
        let mut ms = 0.0;
        let mut animating = true;
        let mut img = img;
        while animating && ms < 3000.0 {
            ms += 16.0;
            let (i, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            img = i;
            animating = a;
        }
        img.save("bottom-bar-skia-2");
        assert!(purple(img.at(2 * 325 - 70, y(50.0))), "{:?}", img.at(2 * 325 - 70, y(50.0)));
        assert!(!purple(img.at(2 * 65 - 70, y(50.0))), "{:?}", img.at(60, y(50.0)));
    }
}
