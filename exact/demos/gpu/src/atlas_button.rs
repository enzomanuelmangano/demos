//! Atlas Button (src/animations/atlas-button: index.tsx, atlas-button/index.tsx,
//! atlas-button/animated-squares.tsx): a 250 × 200 button, the React logo at its centre; held,
//! it shrinks a little, the logo rises, "React Native" fades in under it, and a disc of blue
//! squares grows from the centre, its middle randomly hollow.
//!
//! - The squares: HSquares 50, SquareContainerSize = floor(250 / 50) = 5, SquareSize 2.5,
//!   VSquares = floor(200 / 5); square `i` at ((i % 50) · 5, floor(i / 50) · 5), its distance d
//!   from (125, 100); scale = max(0, 1.5 − d / max(progress · maxRadius, 1e-3)), maxRadius =
//!   √(250² + 200²) / 2; hidden when scale ≥ 0.9 + random · 0.5 (`randomValues[i] || 1`);
//!   else RSXform(scale, 0, x, y). A random colour each (TRANSPARENT ×3, LIGHT_BLUE ×2, BLUE,
//!   BLUE_VARIANT) over the white texture with DstOver: rgb · a + (1 − a), opaque.
//! - Tap().maxDuration(10000): onTouchesDown isActive = true; onFinalize false (the finger up, out
//!   of the button, or held 10 s). progress = withSpring(isActive, { duration 1200,
//!   dampingRatio 1 }).
//! - The button scales by interpolate(progress, [0, 1], [1, 0.95]) about its centre. Over the
//!   canvas, centred: the icon (iconSize = 250 × 0.2, the SVG fitted 'contain'), translateY
//!   interpolate(3p, [0, 1], [0, −25], CLAMP); the label (white, 20, bold, centred over 250,
//!   absolute at the icon box's top + marginTop 10), opacity 3p (clamped), translateY
//!   interpolate(3p, [0, 1], [50, 25], CLAMP).
//!
//! The squares' transforms run in the vertex shader (one instance each, their colours and
//! random values written once); the icon and label are packages/skia, into a layer composited
//! in the same pass.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::{interpolate_clamp, Spring};
use skia::{fit_box, path_from_svg, Canvas, Color, Font, Paint, Path, Rect, Renderer};

use crate::{gfx, shaders};
use shaders::atlas_button::{entry, module, Uniforms, GROUP_0, LAYER, SMP, SQUARES, U};

/// CanvasWidth, CanvasHeight, horizontalSquaresAmount.
const WIDTH: f32 = 250.0;
const HEIGHT: f32 = 200.0;
const H_SQUARES: u32 = 50;
/// The colours (index.tsx), as Float32Array [r, g, b, a], repeated for their odds.
const COLORS: [[f32; 4]; 7] = [
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.5, 1.0, 0.8],
    [0.0, 0.5, 1.0, 0.8],
    [0.0, 0.2, 1.0, 0.8],
    [0.3, 0.2, 1.0, 0.8],
];
/// assets/header_logo.svg (112 × 102): a filled circle and three stroked orbits, #61dafb.
const LOGO_SIZE: (f32, f32) = (112.0, 102.0);
const LOGO_DOT: &str = "M56 61.832c5.891 0 10.667-4.776 10.667-10.667S61.89 40.498 56 40.498c-5.89 0-10.666 4.776-10.666 10.667S50.108 61.832 56 61.832Z";
const LOGO_ORBITS: [&str; 3] = [
    "M56 75.165c29.455 0 53.333-10.745 53.333-24s-23.878-24-53.333-24-53.334 10.745-53.334 24 23.879 24 53.334 24Z",
    "M35.215 63.165c14.728 25.509 35.972 40.815 47.451 34.188 11.48-6.628 8.846-32.68-5.882-58.188-14.727-25.51-35.972-40.816-47.45-34.188-11.48 6.627-8.846 32.679 5.881 58.188Z",
    "M35.215 39.165c-14.727 25.509-17.36 51.56-5.882 58.188 11.48 6.627 32.724-8.68 47.451-34.188 14.728-25.51 17.362-51.56 5.883-58.188-11.48-6.628-32.724 8.679-47.452 34.188Z",
];
const LOGO_STROKE: f32 = 5.333;
const LABEL: &str = "React Native";
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AtlasButton {
        font: skia::match_system_font(20.0, 700.0).or_else(|| Font::new(OUTFIT, 20.0)),
        dot: path_from_svg(LOGO_DOT),
        orbits: LOGO_ORBITS.iter().filter_map(|d| path_from_svg(d)).collect(),
        ..Default::default()
    })
}

#[derive(Default)]
struct AtlasButton {
    progress: Spring,
    /// isActive, and the finger that holds it with when it went down.
    finger: Option<(u32, f64)>,
    /// Each square's colour and random value, rolled once.
    squares: Vec<[f32; 4]>,
    font: Option<Font>,
    dot: Option<Path>,
    orbits: Vec<Path>,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    squares: wgpu::RenderPipeline,
    layer_pipeline: wgpu::RenderPipeline,
    layer: wgpu::TextureView,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// SquareContainerSize, VSquares.
fn grid() -> (f32, u32) {
    let c = (WIDTH / H_SQUARES as f32).floor();
    (c, (HEIGHT / c).floor() as u32)
}

/// Math.random(), xorshift64* from a seed.
struct Random(u64);

impl Random {
    fn next(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// The squares' colours (Float32Array → SkColor, 8 bits; DstOver the white sprite) and random
/// values.
fn roll(seed: u64) -> Vec<[f32; 4]> {
    let (_, rows) = grid();
    let n = (H_SQUARES * rows) as usize;
    let mut random = Random(seed | 1);
    let q = |v: f32| (v * 255.0).round() / 255.0;
    let colors: Vec<[f32; 4]> = (0..n)
        .map(|_| {
            let [r, g, b, a] = COLORS[(random.next() * COLORS.len() as f64).floor() as usize % COLORS.len()].map(q);
            [r * a + 1.0 - a, g * a + 1.0 - a, b * a + 1.0 - a, 0.0]
        })
        .collect();
    colors
        .into_iter()
        .map(|[r, g, b, _]| {
            let v = random.next() as f32;
            [r, g, b, if v == 0.0 { 1.0 } else { v }]
        })
        .collect()
}

impl AtlasButton {
    fn set_active(&mut self, active: bool) {
        gfx::spring_to(&mut self.progress, if active { 1.0 } else { 0.0 }, 1200.0, 1.0);
    }

    /// onFinalize.
    fn release(&mut self) {
        if self.finger.take().is_some() {
            self.set_active(false);
        }
    }

    /// The icon and the label, as the views over the canvas place them.
    fn record(&mut self, scale: f32) {
        let p = self.progress.value as f32;
        let p3 = (p * 3.0) as f64;
        let button = 1.0 - 0.05 * p;
        let c = &mut self.canvas;
        c.begin(scale);
        // rStyle: the whole button scaled about its centre.
        c.translate(WIDTH / 2.0, HEIGHT / 2.0);
        c.scale(button, button);
        c.translate(-WIDTH / 2.0, -HEIGHT / 2.0);
        let icon_size = WIDTH * 0.2;
        let (left, top) = ((WIDTH - icon_size) / 2.0, (HEIGHT - icon_size) / 2.0);
        let icon_y = interpolate_clamp(p3, &[0.0, 1.0], &[0.0, -25.0]) as f32;
        c.save();
        c.translate(left, top + icon_y);
        c.concat(fit_box(Rect::new(0.0, 0.0, LOGO_SIZE.0, LOGO_SIZE.1), Rect::new(0.0, 0.0, icon_size, icon_size)));
        let blue = Color::hex(0x61DAFB);
        if let Some(dot) = &self.dot {
            c.draw_path(dot, &Paint::fill(blue));
        }
        for orbit in &self.orbits {
            c.draw_path(orbit, &Paint::stroke(blue, LOGO_STROKE));
        }
        c.restore();
        let opacity = p3.clamp(0.0, 1.0) as f32;
        if let (Some(font), true) = (&self.font, opacity > 0.0) {
            // The label's box: the icon box's top, + marginTop 10, + translateY; its line's
            // baseline an ascent below; centred over the button's width.
            let label_y = interpolate_clamp(p3, &[0.0, 1.0], &[50.0, 25.0]) as f32;
            let baseline = top + 10.0 + label_y - font.metrics().ascent;
            let w = font.advance_width(LABEL);
            c.draw_text(LABEL, (WIDTH - w) / 2.0, baseline, font, &Paint::fill(Color::WHITE).with_opacity(opacity));
        }
    }
}

impl Surface for AtlasButton {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"active\":{},\"progress\":{:.3}}}", self.finger.is_some(), self.progress.value))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let inside = (0.0..=WIDTH).contains(&x) && (0.0..=HEIGHT).contains(&y);
        match gfx::phase(phase) {
            Phase::Down if self.finger.is_none() && inside => {
                self.finger = Some((id, at_ms));
                self.set_active(true);
            }
            // shouldCancelWhenOutside: a finger that leaves the button ends the tap.
            Phase::Move if self.finger.is_some_and(|(f, _)| f == id) && !inside => self.release(),
            Phase::Up | Phase::Cancel if self.finger.is_some_and(|(f, _)| f == id) => self.release(),
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
        // maxDuration(10000): held that long, the tap fails.
        if self.finger.is_some_and(|(_, at)| frame.now_ms - at >= 10000.0) {
            self.release();
        }
        let moving = self.progress.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            if self.squares.is_empty() {
                self.squares = roll(frame.now_ms.to_bits() ^ 0x5DEE_CE66_D1CE_4E5B);
            }
            self.gpu = Some(build(device, queue, format, frame.shader_generation, (pw, ph), &self.squares));
        }
        self.record(frame.scale);
        let gpu = self.gpu.as_ref().unwrap();
        self.renderer.draw(device, queue, encoder, &self.canvas, &gpu.layer, format, pw, ph, wgpu::Color::TRANSPARENT);
        let (c, _) = grid();
        let max_radius = WIDTH.hypot(HEIGHT) / 2.0;
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            grid: [c, H_SQUARES as f32, c - 2.5, self.progress.value as f32 * max_radius],
            view: [1.0 - 0.05 * self.progress.value as f32, WIDTH / 2.0, HEIGHT / 2.0, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("atlas button"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // The Canvas is transparent over the container's #000000.
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_bind_group(0, &gpu.bind, &[]);
        if self.progress.value > 0.0 {
            pass.set_pipeline(&gpu.squares);
            pass.draw(0..6, 0..self.squares.len() as u32);
        }
        pass.set_pipeline(&gpu.layer_pipeline);
        pass.draw(0..3, 0..1);
        moving || self.finger.is_some()
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), squares: &[[f32; 4]]) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let blend = Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING);
    let squares_pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::SQUARE_VS, entry::SQUARE_FS, blend, "atlas button squares");
    let layer_pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::LAYER_VS, entry::LAYER_FS, blend, "atlas button layer");
    let layer = gfx::target(device, "atlas button layer", format, size.0, size.1);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("atlas button uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let data: Vec<u8> = squares.iter().flatten().flat_map(|v| v.to_le_bytes()).collect();
    let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("atlas button squares"), size: data.len().max(16) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&buffer, 0, &data);
    let sampler = gfx::linear_sampler(device, "atlas button");
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("atlas button"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: SQUARES.binding, resource: buffer.as_entire_binding() },
            wgpu::BindGroupEntry { binding: LAYER.binding, resource: wgpu::BindingResource::TextureView(&layer) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, size, squares: squares_pipeline, layer_pipeline, layer, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_colours_are_the_atlas_blend() {
        let squares = roll(7);
        assert_eq!(squares.len(), 50 * 40);
        // DstOver of the white sprite: TRANSPARENT is black; BLUE 0.8 is (51, 92, 255)…
        let rgb = |s: &[f32; 4]| [s[0], s[1], s[2]].map(|v| (v * 255.0).round() as u8);
        for s in &squares {
            assert!([[0, 0, 0], [51, 153, 255], [51, 92, 255], [113, 92, 255]].contains(&rgb(s)), "{:?}", rgb(s));
            assert!(s[3] > 0.0 && s[3] <= 1.0);
        }
        assert!(squares.iter().filter(|s| rgb(s) == [0, 0, 0]).count() > 600);
    }

    #[test]
    fn holding_grows_the_squares_and_shows_the_label() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 250.0, height: 200.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("atlas-button-rest");
        assert!(!animating);
        // At rest: only the logo, its dot #61dafb at the centre ((112 / 2) · 0.446 + 100 = 125,
        // 51.2 · 0.446 + 2.2 + 75 = 100).
        let c = rest.at(250, 200);
        assert!(c[3] == 255 && (c[2] as i32 - 0xFB).abs() < 3 && (c[1] as i32 - 0xDA).abs() < 3, "{c:?}");
        let blue = |img: &fixture::Pixels| img.count(|p| p[3] == 255 && p[2] == 255 && p[0] < 120 && p[1] < 160);
        assert_eq!(blue(&rest), 0);
        let white = |img: &fixture::Pixels| img.count(|p| p[..3] == [255, 255, 255]);
        assert_eq!(white(&rest), 0);

        let finger = |s: &mut Box<dyn Surface>, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 125.0, y: 100.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 10.0);
        let mut ms = 0.0;
        while ms < 2000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("atlas-button-held");
        assert!(animating);
        assert!(s.agent("{}").unwrap().contains("\"progress\":1.000"));
        // Blue squares about the hollow centre; the white label below the risen logo.
        assert!(blue(&held) > 2000, "{}", blue(&held));
        assert!(white(&held) > 300, "{}", white(&held));
        // At its corner a square at half size: (0, 0) to (1.25, 1.25) points, scaled about the
        // centre by 0.95.
        assert_eq!(held.at(13, 11)[3], 255);

        finger(&mut s, PointerPhase::Up, ms);
        while ms < 4500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!animating);
        assert_eq!(back.data, rest.data);
    }
}
