//! Atlas button: a 250 × 200 button with the React logo at its centre. Held, it shrinks a little,
//! the logo rises, a "React Native" label fades in under it, and a disc of blue squares grows
//! from the centre, its middle randomly hollow.
//!
//! - The squares are drawn in the vertex shader, one instance each, with their colour and random
//!   value written once.
//! - A hold ends when the finger lifts, leaves the button, or after 10 seconds.
//! - Random numbers come from a seeded xorshift, so each mount rolls its squares anew. Colours
//!   truncate to 8 bits per channel, as Skia does.
//! - The label is laid out by UIKit, not Skia, so its advances match the platform's text.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::Phase;
use motion::{interpolate_clamp, Spring};
use draw2d::{fit_box, path_from_svg, Canvas, Color, Font, Paint, Path, Rect, Renderer};

use crate::{gfx, shaders};
use shaders::atlas_button::{entry, module, Uniforms, GROUP_0, LAYER, SMP, SQUARES, U};

/// Canvas size, points.
const WIDTH: f32 = 250.0;
const HEIGHT: f32 = 200.0;
/// Squares per row.
const H_SQUARES: u32 = 50;
/// Square colours as [r, g, b, a]; repeats set the odds.
const COLORS: [[f32; 4]; 7] = [
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.0, 0.0, 1.0],
    [0.0, 0.5, 1.0, 0.8],
    [0.0, 0.5, 1.0, 0.8],
    [0.0, 0.2, 1.0, 0.8],
    [0.3, 0.2, 1.0, 0.8],
];
/// The logo: a filled dot and three stroked orbits, in a 112 × 102 box.
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

/// Surfaces made so far: each mount rolls its squares anew.
static MOUNTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The demo's surface. Input: `env.seed`.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AtlasButton {
        mount: MOUNTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        // The label is a text view, so UIKit lays it out: the system face at bold, with its
        // tracking and kerning.
        font: draw2d::match_ui_font(20.0, 700.0).or_else(|| Font::new(OUTFIT, 20.0)),
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
    /// Seed and mount number for the random stream.
    seed: f64,
    mount: u64,
    font: Option<Font>,
    dot: Option<Path>,
    orbits: Vec<Path>,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
    /// Haptics: a light impact at the grab, a soft one when the hold ends.
    posted: Vec<String>,
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

/// Square side in points, and the number of rows that fit.
fn grid() -> (f32, u32) {
    let c = (WIDTH / H_SQUARES as f32).floor();
    (c, (HEIGHT / c).floor() as u32)
}

/// xorshift64* random numbers from a seed.
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

/// Truncates an Atlas colour channel to 8 bits, as Skia's SkColorSetARGB does: 0.5 is 127,
/// 0.3 is 76, 0.8 is 204.
fn sk_byte(v: f32) -> f32 {
    ((v as f64 * 255.0) as u8) as f32 / 255.0
}

/// Each square's colour and random value, rolled once per mount. Colours are picked by weight
/// (transparent 3/7, light blue 2/7, blue 1/7, blue variant 1/7), then blended over the white
/// sprite as drawAtlas's DstOver does.
fn roll(seed: u64) -> Vec<[f32; 4]> {
    let (_, rows) = grid();
    let n = (H_SQUARES * rows) as usize;
    let mut random = Random(seed | 1);
    let q = sk_byte;
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

    /// Ends the hold.
    fn release(&mut self) {
        if self.finger.take().is_some() {
            self.set_active(false);
            self.posted.push("haptic:impact-soft".into());
        }
    }

    /// The icon and the label, as the views over the canvas place them.
    fn record(&mut self, scale: f32) {
        let p = self.progress.value as f32;
        let p3 = (p * 3.0) as f64;
        let button = 1.0 - 0.05 * p;
        let c = &mut self.canvas;
        c.begin(scale);
        // Scale the whole button about its centre.
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
            // The baseline sits one ascent below the label's box top; the label is centred.
            let label_y = interpolate_clamp(p3, &[0.0, 1.0], &[50.0, 25.0]) as f32;
            let baseline = top + 10.0 + label_y - font.metrics().ascent;
            let w = font.advance_width(LABEL);
            c.draw_text(LABEL, (WIDTH - w) / 2.0, baseline, font, &Paint::fill(Color::WHITE).with_opacity(opacity));
        }
    }
}

impl Surface for AtlasButton {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        self.seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"active\":{},\"progress\":{:.3}}}", self.finger.is_some(), self.progress.value))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The touch is tested in the scaled button's own coordinates.
        let k = 1.0 - 0.05 * self.progress.value as f32;
        let (lx, ly) = (WIDTH / 2.0 + (x - WIDTH / 2.0) / k, HEIGHT / 2.0 + (y - HEIGHT / 2.0) / k);
        let inside = (0.0..=WIDTH).contains(&lx) && (0.0..=HEIGHT).contains(&ly);
        match gfx::phase(phase) {
            Phase::Down if self.finger.is_none() && inside => {
                self.finger = Some((id, at_ms));
                self.set_active(true);
                self.posted.push("haptic:impact-light".into());
            }
            // Leaving the button ends the hold.
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
        // A hold of 10 seconds ends.
        if self.finger.is_some_and(|(_, at)| frame.now_ms - at >= 10000.0) {
            self.release();
        }
        let moving = self.progress.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            if self.squares.is_empty() {
                // The seed's low 32 bits, with the mount number.
                let seed = (self.seed.abs() as u64 % (1 << 32)) << 32 | (self.mount & 0xFFFF_FFFF);
                self.squares = roll(seed ^ 0x5DEE_CE66_D1CE_4E5B);
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
                // The canvas is transparent over black.
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
        // Each colour is one of these blends over white.
        let rgb = |s: &[f32; 4]| [s[0], s[1], s[2]].map(|v| (v * 255.0).round() as u8);
        for s in &squares {
            assert!([[0, 0, 0], [51, 153, 255], [51, 92, 255], [112, 92, 255]].contains(&rgb(s)), "{:?}", rgb(s));
            assert!(s[3] > 0.0 && s[3] <= 1.0);
        }
        assert!(squares.iter().filter(|s| rgb(s) == [0, 0, 0]).count() > 600);
    }

    /// The colours truncate to 8 bits, byte for byte.
    #[test]
    fn colours_are_rn_skias_bytes() {
        let bytes = |c: [f32; 4]| c.map(|v| (sk_byte(v) * 255.0).round() as u8);
        assert_eq!(bytes(COLORS[0]), [0, 0, 0, 255]);
        assert_eq!(bytes(COLORS[3]), [0, 127, 255, 204]);
        assert_eq!(bytes(COLORS[5]), [0, 51, 255, 204]);
        assert_eq!(bytes(COLORS[6]), [76, 51, 255, 204]);
        // Blue variant over white is 112.
        let s = roll(11).into_iter().find(|s| s[2] > 0.99 && s[1] < 0.4 && s[0] > 0.3).unwrap();
        assert_eq!((s[0] * 255.0).round() as u8, 112);
        // Uniform over the seven entries (3/7 black), the random values in (0, 1].
        let squares: Vec<[f32; 4]> = (0..50).flat_map(roll).collect();
        let black = squares.iter().filter(|s| s[..3] == [0.0, 0.0, 0.0]).count() as f64 / squares.len() as f64;
        assert!((black - 3.0 / 7.0).abs() < 0.01, "{black}");
        let mean = squares.iter().map(|s| s[3] as f64).sum::<f64>() / squares.len() as f64;
        assert!((mean - 0.5).abs() < 0.01, "{mean}");
    }

    /// The label's pen positions and metrics match Core Text's line layout for "React Native".
    #[test]
    fn the_label_is_laid_out_as_uikit() {
        let Some(f) = draw2d::match_ui_font(20.0, 700.0) else { return eprintln!("no system font; skipped") };
        if f.metrics().ascent != -19.335_938 {
            return eprintln!("another SF than the reference's; skipped");
        }
        let ct = [0.0, 12.8972, 24.2477, 35.3897, 46.5611, 54.0927, 58.5158, 73.1221, 84.2641, 91.7957, 96.8694, 107.3948];
        let t: Vec<char> = LABEL.chars().collect();
        for (i, want) in ct.iter().enumerate() {
            let pre: String = t[..i].iter().collect();
            let k = if i > 0 { f.kerning(t[i - 1], t[i]) } else { 0.0 };
            let pen = f.advance_width(&pre) + k;
            assert!((pen - want).abs() < 1e-3, "#{i} {}: {pen} vs {want}", t[i]);
        }
        assert!((f.advance_width(LABEL) - 118.745_28).abs() < 1e-3, "{}", f.advance_width(LABEL));
        assert_eq!((f.metrics().descent, f.metrics().leading), (4.218_75, 0.0));
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
        // At rest only the logo shows: its dot is #61dafb at the centre.
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
        // The corner square is drawn, scaled about the centre.
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

#[cfg(test)]
mod haptic_tests {
    use super::*;
    use exact_gpu::{PointerKind, PointerPhase};

    fn finger(s: &mut AtlasButton, phase: PointerPhase, x: f32, y: f32) {
        s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 0.0 });
    }

    /// The grab plays a light impact and the hold's end a soft one; a touch outside plays none.
    #[test]
    fn the_hold_plays_its_grab_and_its_release() {
        let mut s = AtlasButton::default();
        finger(&mut s, PointerPhase::Down, 300.0, 100.0);
        assert!(s.messages().is_empty());
        finger(&mut s, PointerPhase::Down, 125.0, 100.0);
        assert_eq!(s.messages(), ["haptic:impact-light"]);
        finger(&mut s, PointerPhase::Up, 125.0, 100.0);
        assert_eq!(s.messages(), ["haptic:impact-soft"]);
        finger(&mut s, PointerPhase::Up, 125.0, 100.0);
        assert!(s.messages().is_empty());
    }
}
