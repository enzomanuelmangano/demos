//! Paper Folding (src/animations/paper-folding: index.tsx, background-gradient.tsx,
//! components/index.tsx): a 250 × 330 sheet of paper in three folds over a soft grey sweep; a
//! tap anywhere folds it (letter-fold, the first fold on top) or unfolds it.
//!
//! - BackgroundGradient: a window-sized Rect with SweepGradient about the centre (#eaeaea,
//!   #e9ebec, #dddddd, #e0e0e0) and Blur 50 (decal).
//! - Paper (centred): foldHeight = 330 / 3. With progress p, translateY = (h/2 − fh/2)(1 − p);
//!   fold 0 at top 0 (+ translateY); fold 1 at top h/2 − fh/2, rotated about its top edge by
//!   rotateX(−π(1 − p)) after translateY; fold 2 hinged on fold 1's bottom edge, rotateX(π(1 −
//!   p)) more. Fold 2's list is one layer's matrix, so its rotations add up to 0: it stays
//!   parallel to the screen, full height, hung from fold 1's far edge. Each fold's view is a
//!   plain layer, which flattens its content (an orthographic projection: rotateX(θ) scales y
//!   by cos θ). Folds 1 and 2: interpolateColor(p, [0, 1], [#b1b1b1, #ffffff]) under an inner
//!   Shadow (0, 12, 25, #efefef); fold 0: #ffffff (its drop shadow falls outside its canvas).
//! - Stacking: each fold's wrapper has transform [perspective(1000000)] about transformOrigin
//!   (50%, 50%, z = 200, 100, 0) of its 250 × 0 box (the paper's top edge). That matrix moves
//!   the wrapper's plane to depth z − z/(1 + z/1e6) (0.04, 0.01, 0 pt) and scales it by
//!   1/(1 + z/1e6) about (125, 0): Core Animation depth-sorts sibling layers, so fold 0 is
//!   drawn over 1 over 2 at every angle (each wrapper is flat, its depth constant).
//! - The press (PressableWithoutFeedback over the screen, no global handler): progress =
//!   withSpring(p > 0.5 ? 0 : 1, { duration 1000, dampingRatio 1.5 }); three selection haptics,
//!   at once and 100 and 200 ms later (posted for the app).
//!
//! The background is drawn and blurred once per size; a frame is one pass and one uniform write.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate_color, Spring};
use skia::{point, stops, Blur, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::paper_folding::{entry, module, Uniforms, BACKGROUND, GROUP_0, SMP, U};

/// PaperWidth, PaperHeight.
const WIDTH: f32 = 250.0;
const HEIGHT: f32 = 330.0;
/// `<Blur blur={50}>`.
const BLUR: f32 = 50.0;
/// paperFoldingHaptics: selectionAsync now, at 100 ms and at 200 ms.
const HAPTICS_MS: [f64; 3] = [0.0, 100.0, 200.0];
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // RN passes `globalHandlers={{}}`, which is no pressto prop (it falls through to the
    // BaseButton): the intent, no global haptic over its own three, is `skipGlobalHandlers`.
    Box::new(PaperFolding { press: Pressable::new().skip_global_handlers(), ..Default::default() })
}

#[derive(Default)]
struct PaperFolding {
    progress: Spring,
    /// pressto's PressableWithoutFeedback over the screen, the shared `pressto::Pressable`
    /// (RNGH's BaseButton): onPress at the lift however long it was held or far it moved.
    press: Pressable,
    /// Haptics still due: their delay after the press, the press's frame time once known.
    due: Vec<f64>,
    pressed_at: Option<f64>,
    pressed: bool,
    posted: Vec<String>,
    layer: Canvas,
    renderer: Renderer,
    blur: Blur,
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

/// `perspective: 1000000`.
const PERSPECTIVE: f32 = 1_000_000.0;

/// Fold `i`'s wrapper's scale about the paper's top centre: perspective(d) about
/// transformOrigin z = (2 − i) × 100 maps a point of its plane by 1 / (1 + z / d).
pub(crate) fn wrapper_scale(i: usize) -> f32 {
    1.0 / (1.0 + (2 - i) as f32 * 100.0 / PERSPECTIVE)
}

/// Fold `i`'s top (from the paper's top) and signed length on screen, at progress `p`, before
/// its wrapper's scale.
pub(crate) fn folds(p: f32) -> [(f32, f32); 3] {
    let fh = HEIGHT / 3.0;
    let rest = HEIGHT / 2.0 - fh / 2.0;
    let ty = rest * (1.0 - p);
    // rotateX(−π(1 − p)) about fold 1's top edge.
    let c1 = (-std::f32::consts::PI * (1.0 - p)).cos();
    let t1 = rest + ty;
    // Fold 2: rotateX(−π(1 − p)) then rotateX(π(1 − p)) in one matrix, cos(0) = 1.
    [(ty, fh), (t1, fh * c1), (t1 + fh * c1, fh)]
}

impl Surface for PaperFolding {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.3},\"target\":{}}}", self.progress.value, self.progress.target()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, .. } = *event else { return };
        if let Some(PressEvent::Press(_)) = self.press.pointer(id, gfx::phase(phase), true) {
            let to = if self.progress.value > 0.5 { 0.0 } else { 1.0 };
            gfx::spring_to(&mut self.progress, to, 1000.0, 1.5);
            self.posted.push("haptic:selection".into());
            self.due.clear();
            self.due.extend_from_slice(&HAPTICS_MS[1..]);
            self.pressed = true;
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
        let moving = self.progress.step(frame.now_ms);
        if std::mem::take(&mut self.pressed) {
            self.pressed_at = Some(frame.now_ms);
        }
        if let Some(at) = self.pressed_at {
            let before = self.due.len();
            self.due.retain(|&delay| frame.now_ms < at + delay);
            for _ in self.due.len()..before {
                self.posted.push("haptic:selection".into());
            }
        }
        let (pw, ph) = frame.pixels();
        let size = (pw, ph);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, size)) {
            // The background, once per size: the sweep, blurred.
            let (w, h) = (frame.width, frame.height);
            self.layer.begin(frame.scale);
            let sweep = Shader::Sweep {
                center: point(w / 2.0, h / 2.0),
                stops: stops(&[Color::hex(0xEAEAEA), Color::hex(0xE9EBEC), Color::hex(0xDDDDDD), Color::hex(0xE0E0E0)]),
            };
            self.layer.draw_rect(0.0, 0.0, w, h, &Paint::shader(sweep));
            let sharp = skia::render::sampled_target(device, "paper folding background", LAYER, pw, ph);
            self.renderer.draw(device, queue, encoder, &self.layer, &sharp, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
            let blurred = self.blur.run(device, queue, encoder, &sharp, LAYER, pw, ph, BLUR * frame.scale);
            self.gpu = Some(build(device, format, frame.shader_generation, size, blurred));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let p = self.progress.value as f32;
        let f = folds(p);
        let shade = interpolate_color(p as f64, &[0.0, 1.0], &[[177.0, 177.0, 177.0, 1.0], [255.0, 255.0, 255.0, 1.0]]);
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            paper: [(frame.width - WIDTH) / 2.0, (frame.height - HEIGHT) / 2.0, WIDTH, HEIGHT / 3.0],
            folds: [0, 1, 2].map(|i| {
                let k = wrapper_scale(i);
                [f[i].0 * k, f[i].1 * k, k, 0.0]
            }),
            shade: [(shade[0] / 255.0) as f32, (shade[1] / 255.0) as f32, (shade[2] / 255.0) as f32, 1.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(encoder, "paper folding", target, &gpu.pipeline, &gpu.bind);
        moving || !self.due.is_empty()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), background: &wgpu::TextureView) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::VS, entry::FS, None, "paper folding");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("paper folding uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let sampler = gfx::linear_sampler(device, "paper folding");
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("paper folding"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: BACKGROUND.binding, resource: wgpu::BindingResource::TextureView(background) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, size, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_folds_meet_end_to_end() {
        // Folded: all three over the middle third; unfolded: one under the other.
        let folded = folds(0.0);
        assert!((folded[0].0 - 110.0).abs() < 1e-4 && (folded[1].0 - 220.0).abs() < 1e-4);
        assert!((folded[1].1 + 110.0).abs() < 1e-3 && (folded[2].0 - 110.0).abs() < 1e-3 && (folded[2].1 - 110.0).abs() < 1e-3);
        assert_eq!(folds(1.0), [(0.0, 110.0), (110.0, 110.0), (220.0, 110.0)]);
        // Mid-fold, against RN's transform lists multiplied out as 4 × 4 matrices (p = 0.25:
        // fold 1 spans 192.5 → 114.718, fold 2 114.718 → 224.718; p = 0.5: fold 1 is edge-on
        // at 165, fold 2 165 → 275). Fold 2 stays full height: its two rotations cancel.
        let quarter = folds(0.25);
        assert!((quarter[0].0 - 82.5).abs() < 1e-3);
        assert!((quarter[1].0 - 192.5).abs() < 1e-3 && (quarter[1].0 + quarter[1].1 - 114.718).abs() < 1e-3);
        assert!((quarter[2].0 - 114.718).abs() < 1e-3 && (quarter[2].1 - 110.0).abs() < 1e-3);
        let half = folds(0.5);
        assert!((half[1].0 - 165.0).abs() < 1e-3 && half[1].1.abs() < 1e-3);
        assert!((half[2].0 - 165.0).abs() < 1e-3 && (half[2].1 - 110.0).abs() < 1e-3);
        // The wrappers: 1/(1 + 200/1e6), 1/(1 + 100/1e6), 1.
        assert!((wrapper_scale(0) - 0.999_8).abs() < 1e-6 && (wrapper_scale(1) - 0.999_9).abs() < 1e-6);
        assert_eq!(wrapper_scale(2), 1.0);
    }

    #[test]
    fn a_tap_unfolds_the_paper() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("paper-folding-folded");
        assert!(!animating);
        // The paper (left 85, top 291) folded to its middle third, y 401…511: white on top.
        assert_eq!(&a.at(210, 456)[..3], &[255, 255, 255]);
        // Above it the background: a light grey, opaque in the middle of the screen.
        let bg = a.at(210, 300);
        assert!(bg[3] == 255 && (200..240).contains(&bg[0]), "{bg:?}");
        // At the screen's corner, the decal blur fades it out.
        assert!(a.at(0, 0)[3] < 200, "{:?}", a.at(0, 0));

        let finger = |s: &mut Box<dyn Surface>, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 50.0, y: 100.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 10.0);
        finger(&mut s, PointerPhase::Up, 900.0);
        assert_eq!(s.messages(), ["haptic:selection"]);
        let mut ms = 0.0;
        let mut haptics = 0;
        let mut mid = None;
        while ms < 2500.0 {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            haptics += s.messages().len();
            if mid.is_none() && ms >= 300.0 {
                mid = Some(img);
            }
        }
        assert_eq!(haptics, 2);
        mid.unwrap().save("paper-folding-mid");
        let (b, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        b.save("paper-folding-open");
        assert!(!animating);
        assert!(s.agent("{}").unwrap().starts_with("{\"progress\":1.000"));
        // Poses at fixed progress, for reading against RN's matrices (fold 2 full height).
        let mut posed = PaperFolding::default();
        for (p, name) in [(0.25, "paper-folding-p25"), (0.5, "paper-folding-p50"), (0.75, "paper-folding-p75")] {
            posed.progress.set(p);
            let (img, _) = fixture::render(&gpu, &mut posed, &frame(0.0)).unwrap();
            img.save(name);
            if p == 0.5 {
                // Fold 1 edge-on at 291 + 165; fold 2 hangs below it, 456…566, shaded.
                assert!(img.at(210, 510)[0] < 255 && img.at(210, 510)[3] == 255, "{:?}", img.at(210, 510));
            }
        }
        // Open: white from the paper's top (291) to its bottom (621); the inner shadow tints
        // the lower folds' edges #efefef-ward.
        assert_eq!(&b.at(210, 300)[..3], &[255, 255, 255]);
        let low = b.at(210, 600);
        assert!(low[0] < 255 && low[0] >= 239, "{low:?}");
        let edge = b.at(86, 560);
        assert!(edge[0] < low[0], "{edge:?} {low:?}");
        assert!(b.at(210, 640)[0] < 245);
    }
}
