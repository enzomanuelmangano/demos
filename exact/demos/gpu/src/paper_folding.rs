//! A sheet of paper in three folds over a soft grey sweep. A tap folds it, or unfolds it.
//!
//! - Press: the paper shrinks a little while held.
//! - Lift: a selection haptic, then the fold runs 610 ms on a quick ease-out and lands with a
//!   soft impact haptic and a small rebound.
//! - Selection haptics also fire 100 and 200 ms after the lift.
//!
//! The paper is shaded in shaders/paper_folding.wgsl. The background is drawn and blurred once
//! per size; a frame is one pass and one uniform write.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{Config, PressEvent, Pressable};

/// The paper shrinks a little while held, about the screen's centre.
const PRESS: Config = Config { active_opacity: 0.5, min_scale: 0.97, base_scale: 1.0 };
use motion::{interpolate_color, Easing, Timing};
use draw2d::{point, stops, Blur, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::paper_folding::{entry, module, Uniforms, BACKGROUND, GROUP_0, SMP, U};

/// Paper size in points.
const WIDTH: f32 = 250.0;
const HEIGHT: f32 = 330.0;
/// Background blur radius in points.
const BLUR: f32 = 50.0;
/// Selection haptic times after the lift, in ms.
const HAPTICS_MS: [f64; 3] = [0.0, 100.0, 200.0];
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// Fold duration in ms: FOLD_MS plus FOLD_MS_PER_UNIT per unit of progress travelled.
const FOLD_MS: f64 = 230.0;
const FOLD_MS_PER_UNIT: f64 = 380.0;
/// Landing rebound: height (share of the travel), half-period, decay and end, in ms.
const SETTLE_LIFT: f64 = 0.022;
const SETTLE_HALF_MS: f64 = 85.0;
const SETTLE_DECAY_MS: f64 = 55.0;
const SETTLE_MS: f64 = 300.0;

/// Ease-in, then a strong ease-out with no tail.
fn fold_easing() -> Easing {
    Easing::bezier(0.3, 0.0, 0.2, 1.0)
}

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    // Skip the global haptic: this surface posts its own selection haptics.
    Box::new(PaperFolding { press: Pressable::new().skip_global_handlers().with_config(PRESS), ..Default::default() })
}

#[derive(Default)]
struct PaperFolding {
    /// The timed fold, from where the paper was to 0 (folded) or 1 (open).
    progress: Timing,
    /// Length of the fold in flight; scales the rebound.
    travel: f64,
    flying: bool,
    landed_at: Option<f64>,
    /// The rebound drawn over `progress` (toward where it came from).
    settle: f64,
    /// Press tracking. A press fires on the lift, however long it was held or far it moved.
    press: Pressable,
    /// Haptics still due, as delays after the lift.
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

/// Perspective distance for the fold stacking, in points.
const PERSPECTIVE: f32 = 1_000_000.0;

/// Scale of fold `i`'s plane under its perspective: 1 / (1 + z / PERSPECTIVE), z = (2 − i) × 100.
pub(crate) fn wrapper_scale(i: usize) -> f32 {
    1.0 / (1.0 + (2 - i) as f32 * 100.0 / PERSPECTIVE)
}

/// Fold `i`'s top (from the paper's top) and signed length on screen, at progress `p`, before
/// its wrapper's scale.
pub(crate) fn folds(p: f32) -> [(f32, f32); 3] {
    let fh = HEIGHT / 3.0;
    let rest = HEIGHT / 2.0 - fh / 2.0;
    let ty = rest * (1.0 - p);
    // Fold 1 turns about its top edge.
    let c1 = (-std::f32::consts::PI * (1.0 - p)).cos();
    let t1 = rest + ty;
    // Fold 2's two turns cancel: it stays full height, parallel to the screen.
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
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.3},\"target\":{}}}", self.drawn(), self.progress.target()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, .. } = *event else { return };
        if let Some(PressEvent::Press(_)) = self.press.pointer(id, gfx::phase(phase), true) {
            // From where the paper is drawn (a rebound included), to the other side.
            let from = self.drawn();
            let to = if from > 0.5 { 0.0 } else { 1.0 };
            self.progress.set(from);
            self.travel = (to - from).abs();
            self.progress.to(to, FOLD_MS + FOLD_MS_PER_UNIT * self.travel, fold_easing());
            self.flying = true;
            self.landed_at = None;
            self.settle = 0.0;
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
        let moving = self.step_motion(frame.now_ms);
        self.press.step(frame.now_ms);
        let held = self.press.scale() as f32;
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
            let sharp = draw2d::render::sampled_target(device, "paper folding background", LAYER, pw, ph);
            self.renderer.draw(device, queue, encoder, &self.layer, &sharp, LAYER, pw, ph, wgpu::Color::TRANSPARENT);
            let blurred = self.blur.run(device, queue, encoder, &sharp, LAYER, pw, ph, BLUR * frame.scale);
            self.gpu = Some(build(device, format, frame.shader_generation, size, blurred));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let p = self.drawn() as f32;
        let f = folds(p);
        let shade = interpolate_color(p as f64, &[0.0, 1.0], &[[177.0, 177.0, 177.0, 1.0], [255.0, 255.0, 255.0, 1.0]]);
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            paper: [(frame.width - WIDTH * held) / 2.0, (frame.height - HEIGHT * held) / 2.0, WIDTH * held, HEIGHT / 3.0 * held],
            folds: [0, 1, 2].map(|i| {
                let k = wrapper_scale(i);
                [f[i].0 * k * held, f[i].1 * k * held, k, 0.0]
            }),
            shade: [(shade[0] / 255.0) as f32, (shade[1] / 255.0) as f32, (shade[2] / 255.0) as f32, 1.0],
            look: [p, 0.0, 0.0, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        draw2d::render::fullscreen_pass(encoder, "paper folding", target, &gpu.pipeline, &gpu.bind);
        moving || !self.due.is_empty() || self.press.is_animating()
    }
}

impl PaperFolding {
    /// Steps the fold and the landing to the frame at `now_ms`; returns whether either moves.
    fn step_motion(&mut self, now_ms: f64) -> bool {
        let mut moving = self.progress.step(now_ms);
        if self.flying && !moving {
            // It lands this frame: a soft impact, then the rebound.
            self.flying = false;
            self.landed_at = Some(now_ms);
            self.posted.push("haptic:impact-soft".into());
        }
        self.settle = 0.0;
        if let Some(at) = self.landed_at {
            let t = now_ms - at;
            if t < SETTLE_MS {
                let toward = if self.progress.target() > 0.5 { -1.0 } else { 1.0 };
                let bounce = (std::f64::consts::PI * t / SETTLE_HALF_MS).sin().abs();
                self.settle = toward * SETTLE_LIFT * self.travel * (-t / SETTLE_DECAY_MS).exp() * bounce;
                moving = true;
            } else {
                self.landed_at = None;
            }
        }
        moving
    }

    /// The progress drawn: the fold, and the landing's rebound over it.
    fn drawn(&self) -> f64 {
        self.progress.value + self.settle
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
        // Mid-fold: fold 2 stays full height, its two turns cancel.
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
    fn the_paper_shrinks_while_held_on_presstos_curve() {
        let mut s = PaperFolding { press: Pressable::new().skip_global_handlers().with_config(PRESS), ..Default::default() };
        let finger = |s: &mut PaperFolding, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 50.0, y: 100.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 0.0);
        s.press.step(0.0);
        s.press.step(125.0);
        assert!((s.press.scale() - (1.0 - 0.03 * 0.8024)).abs() < 1e-3, "{}", s.press.scale());
        s.press.step(400.0);
        assert!((s.press.scale() - 0.97).abs() < 1e-9);
        // The lift eases the paper back to full size.
        finger(&mut s, PointerPhase::Up, 600.0);
        assert_eq!(s.messages(), ["haptic:selection"]);
        s.press.step(616.0);
        s.press.step(900.0);
        assert_eq!(s.press.scale(), 1.0);
    }

    #[test]
    fn the_fold_is_quick_and_lands_with_a_settle() {
        let mut s = PaperFolding { press: Pressable::new().skip_global_handlers().with_config(PRESS), ..Default::default() };
        let finger = |s: &mut PaperFolding, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 50.0, y: 100.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 0.0);
        finger(&mut s, PointerPhase::Up, 50.0);
        assert_eq!(s.progress.target(), 1.0);
        s.messages();
        // Stepped as `render` does, every 8 ms (120 Hz), from the lift's frame.
        let mut trace = Vec::new();
        let mut landed = None;
        let mut ms = 100.0;
        while ms <= 1200.0 {
            s.step_motion(ms);
            if landed.is_none() && s.landed_at.is_some() {
                landed = s.landed_at;
            }
            trace.push((ms - 100.0, s.progress.value));
            ms += 8.0;
        }
        let at = |t: f64| trace.iter().find(|(x, _)| *x >= t).unwrap().1;
        // 610 ms end to end, past half way at 200 ms, 94 % at 430 ms, no tail.
        assert!(landed.is_some_and(|t| (710.0..718.0).contains(&t)), "{landed:?}");
        assert!(at(200.0) > 0.5 && at(430.0) > 0.94 && at(560.0) > 0.99, "{} {} {}", at(200.0), at(430.0), at(560.0));
        // The landing: a soft impact, then a rebound under 2.2 % of the travel, gone by 300 ms.
        let mut s = PaperFolding { press: Pressable::new().skip_global_handlers().with_config(PRESS), ..Default::default() };
        s.travel = 1.0;
        s.progress.set(0.0);
        s.progress.to(1.0, 610.0, fold_easing());
        s.flying = true;
        let mut peak: f64 = 0.0;
        let mut drawn = Vec::new();
        let mut t = 0.0;
        let mut posted = Vec::new();
        while t < 1200.0 {
            s.step_motion(t);
            posted.extend(s.messages());
            if s.landed_at.is_some() {
                peak = peak.max(1.0 - s.drawn());
            }
            drawn.push(s.drawn());
            t += 8.0;
        }
        assert_eq!(posted, ["haptic:impact-soft"]);
        assert!(peak > 0.01 && peak < 0.022, "{peak}");
        assert!(drawn.iter().all(|&p| p <= 1.0 + 1e-9));
        assert_eq!(s.drawn(), 1.0);
        assert!(s.landed_at.is_none());
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
        // The folded paper's middle third: warm off-white, never pure white.
        let paper = a.at(210, 456);
        assert!(paper[0] >= 240 && paper[0] > paper[2] && paper[1] > paper[2], "{paper:?}");
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
        let mut haptics = Vec::new();
        let mut mid = None;
        while ms < 2500.0 {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            haptics.extend(s.messages());
            if mid.is_none() && ms >= 300.0 {
                mid = Some(img);
            }
        }
        // Two later selections, and one soft impact as the fold lands.
        assert_eq!(haptics, ["haptic:selection", "haptic:selection", "haptic:impact-soft"]);
        mid.unwrap().save("paper-folding-mid");
        let (b, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        b.save("paper-folding-open");
        assert!(!animating);
        assert!(s.agent("{}").unwrap().starts_with("{\"progress\":1.000"));
        // Poses at fixed progress (fold 2 full height).
        let mut posed = PaperFolding::default();
        // The rotating fold turns away from the light, so it is darker than fold 0.
        posed.progress.set(0.75);
        let (img, _) = fixture::render(&gpu, &mut posed, &frame(0.0)).unwrap();
        let (f0, f1) = (img.at(210, 360), img.at(210, 440));
        assert!(f1[0] + 25 < f0[0], "{f0:?} {f1:?}");
        for (p, name) in [(0.25, "paper-folding-p25"), (0.5, "paper-folding-p50"), (0.75, "paper-folding-p75")] {
            posed.progress.set(p);
            let (img, _) = fixture::render(&gpu, &mut posed, &frame(0.0)).unwrap();
            img.save(name);
            if p == 0.5 {
                // Fold 1 is edge-on here; fold 2 hangs below it, shaded.
                assert!(img.at(210, 510)[0] < 255 && img.at(210, 510)[3] == 255, "{:?}", img.at(210, 510));
            }
        }
        // Open: the inner shadow tints the lower folds' edges; the creases are faint lines.
        let open = b.at(210, 300);
        assert!(open[0] >= 240 && open[0] > open[2], "{open:?}");
        let low = b.at(210, 600);
        assert!(low[0] < 255 && low[0] >= 225, "{low:?}");
        let (crease, beside) = (b.at(210, 511), b.at(210, 516));
        assert!(crease[1] < beside[1], "{crease:?} {beside:?}");
        let edge = b.at(86, 560);
        assert!(edge[0] < low[0], "{edge:?} {low:?}");
        assert!(b.at(210, 640)[0] < 245);
    }

    /// Renders the poses at 3x for inspection (written where `EXACT_GPU_OUT` points).
    #[test]
    #[ignore]
    fn poses_at_3x() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 420.0, height: 912.0, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut posed = PaperFolding::default();
        for (p, name) in [(1.0, "pf3-open"), (0.985, "pf3-settle"), (0.8, "pf3-p80"), (0.65, "pf3-p65"), (0.5, "pf3-p50"), (0.3, "pf3-p30"), (0.12, "pf3-p12"), (0.0, "pf3-folded")] {
            posed.progress.set(p);
            let (img, _) = fixture::render(&gpu, &mut posed, &frame).unwrap();
            img.save(name);
        }
    }
}
