//! Fractal Glass (src/animations/fractal-glass/index.tsx, components/fractal-glass-mask.tsx): an
//! orange circle (r 100) dragged behind a pane of "fluted" glass; through the pane it is
//! blurred and shaded by a 4 × 4 grid of gradient cells.
//!
//! - The pane: x 40, height 300, y = (H − 300) / 2, width = W − 80 (the canvas is the window).
//! - The circle: centre (180, 270) at first; sharp outside the pane; inside it blurred (Blur 25,
//!   decal) and masked (mode "alpha") by each cell's LinearGradient, white → rgba(0,0,0,0.45),
//!   from the cell's top left to its bottom right less 5 pt.
//! - Pan on the circle's box (an Animated.View 200 × 200 at (cx − 100, cy − 100), above the
//!   canvas): onBegin saves the centre; onUpdate centre = saved + translation.
//! - Theme (the Contract's button, this surface's input: 0 light, 1 dark): the background
//!   withTiming white ↔ black, the circle withTiming orange ↔ #78C0E0 (300 ms, inOut(quad)),
//!   in Reanimated's colour space (each channel in gamma 2.2, rounded back to 8 bits).
//!
//! The blurred disc is radially symmetric: its profile is integrated once (a Gaussian of σ 25
//! over the disc) and read per pixel, so a frame is one full-screen pass and one uniform write.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Easing, Timing};

use crate::{gfx, shaders};
use shaders::fractal_glass::{entry, module, Uniforms, GROUP_0, U};

/// CircleRadius.
const RADIUS: f32 = 100.0;
/// `<Blur blur={25}>`: σ in points.
const SIGMA: f64 = 25.0;
/// Where the profile ends: past it the blur is under 1e-4.
const REACH: f32 = RADIUS + 4.0 * SIGMA as f32;
/// The pane: x, height (y and width follow the window).
const PANE_X: f32 = 40.0;
const PANE_HEIGHT: f32 = 300.0;
/// 'white' / 'black' and 'orange' / '#78C0E0'.
const LIGHT: ([f64; 3], [f64; 3]) = ([255.0, 255.0, 255.0], [255.0, 165.0, 0.0]);
const DARK: ([f64; 3], [f64; 3]) = ([0.0, 0.0, 0.0], [120.0, 192.0, 224.0]);

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FractalGlass {
        size: (0.0, 0.0),
        theme: None,
        channels: Default::default(),
        center: (180.0, 270.0),
        saved: (0.0, 0.0),
        pan: PanGesture::new(),
        profile: profile(),
        gpu: None,
    })
}

struct FractalGlass {
    size: (f32, f32),
    theme: Option<bool>,
    /// Background then circle, per channel in Reanimated's linear space (value^2.2).
    channels: [Timing; 6],
    center: (f32, f32),
    saved: (f32, f32),
    pan: PanGesture,
    profile: [[f32; 4]; 64],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
fn erf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.3275911 * x.abs());
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * (-x * x).exp();
    y.copysign(x)
}

fn phi(x: f64) -> f64 {
    0.5 * (1.0 + erf(x / std::f64::consts::SQRT_2))
}

/// The disc of RADIUS convolved with a Gaussian of σ SIGMA, at 256 distances 0…REACH: row by
/// row, a Gaussian in y times the blurred span of the row in x.
fn profile() -> [[f32; 4]; 64] {
    let (r, s) = (RADIUS as f64, SIGMA);
    let mut out = [[0.0f32; 4]; 64];
    const STEPS: usize = 800;
    for k in 0..256 {
        let d = REACH as f64 * k as f64 / 255.0;
        let mut sum = 0.0;
        for j in 0..STEPS {
            let y = -r + 2.0 * r * (j as f64 + 0.5) / STEPS as f64;
            let half = (r * r - y * y).sqrt();
            let g = (-0.5 * y * y / (s * s)).exp() / (s * (2.0 * std::f64::consts::PI).sqrt());
            sum += g * (phi((half - d) / s) - phi((-half - d) / s)) * 2.0 * r / STEPS as f64;
        }
        out[k / 4][k % 4] = sum as f32;
    }
    out
}

impl FractalGlass {
    fn retarget(&mut self, dark: bool, immediately: bool) {
        let (bg, circle) = if dark { DARK } else { LIGHT };
        for (k, ch) in self.channels.iter_mut().enumerate() {
            let c = if k < 3 { bg[k] } else { circle[k - 3] };
            let linear = (c / 255.0).powf(2.2);
            if immediately {
                ch.set(linear);
            } else {
                ch.to(linear, 300.0, Easing::timing_default());
            }
        }
    }

    /// rgbaArrayToRGBAColor(toGammaSpace(…)): channel `k` as drawn.
    fn channel(&self, k: usize) -> f32 {
        ((self.channels[k].value.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round() / 255.0) as f32
    }

    fn on_circle(&self, x: f32, y: f32) -> bool {
        (x - self.center.0).abs() <= RADIUS && (y - self.center.1).abs() <= RADIUS
    }
}

impl Surface for FractalGlass {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let dark = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0) > 0.5;
        if self.theme != Some(dark) {
            // A derived withTiming starts where it is going.
            let first = self.theme.is_none();
            self.theme = Some(dark);
            self.retarget(dark, first);
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let hex = |o: usize| (0..3).map(|k| format!("{:02X}", (self.channel(o + k) * 255.0).round() as u8)).collect::<String>();
        Some(format!(
            "{{\"theme\":\"{}\",\"cx\":{:.1},\"cy\":{:.1},\"background\":\"#{}\",\"circle\":\"#{}\"}}",
            if self.theme == Some(true) { "dark" } else { "light" },
            self.center.0,
            self.center.1,
            hex(0),
            hex(3)
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let claim = self.on_circle(x, y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, claim) {
            Event::Begin { .. } => self.saved = self.center,
            Event::Start(p) | Event::Update(p) => self.center = (self.saved.0 + p.translation_x, self.saved.1 + p.translation_y),
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
        if self.theme.is_none() {
            self.theme = Some(false);
            self.retarget(false, true);
        }
        let mut moving = false;
        for ch in self.channels.iter_mut() {
            moving |= ch.step(frame.now_ms);
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (w, h) = self.size;
        let (pw, ph) = frame.pixels();
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            glass: [PANE_X, (h - PANE_HEIGHT) / 2.0, w - PANE_X * 2.0, PANE_HEIGHT],
            circle: [self.center.0, self.center.1, RADIUS, REACH],
            background: [self.channel(0), self.channel(1), self.channel(2), 1.0],
            color: [self.channel(3), self.channel(4), self.channel(5), 1.0],
            profile: self.profile,
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        skia::render::fullscreen_pass(encoder, "fractal glass", target, &gpu.pipeline, &gpu.bind);
        moving || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::VS, entry::FS, None, "fractal glass");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fractal glass uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fractal glass"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }],
    });
    Gpu { format, generation, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn the_profile_is_a_blurred_disc() {
        let p = profile();
        let at = |k: usize| p[k / 4][k % 4];
        // Its centre nearly whole, its edge a little under half (the disc curves away), beyond
        // 4σ nothing.
        assert!(at(0) > 0.99 && at(0) <= 1.0, "{}", at(0));
        let edge = (RADIUS / REACH * 255.0).round() as usize;
        assert!(at(edge) > 0.4 && at(edge) < 0.5, "{}", at(edge));
        assert!(at(255) < 1e-3);
    }

    #[test]
    fn the_circle_blurs_behind_the_glass_and_follows_the_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("fractal-glass-light");
        assert!(!animating);
        // White; the circle sharp orange above the pane (y 306); blurred and paler under it.
        assert_eq!(&a.at(10, 10)[..3], &[255, 255, 255]);
        assert_eq!(&a.at(180, 250)[..3], &[255, 165, 0]);
        assert_eq!(&a.at(180, 290)[..3], &[255, 165, 0]);
        let under = a.at(180, 320);
        assert!(under[2] > 20 && under[2] < 200, "{under:?}");
        // Inside the pane past the circle's edge, the blur still tints (sharp it would be white).
        assert!(a.at(180, 385)[2] < 250, "{:?}", a.at(180, 385));

        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // A touch off the circle is not its pan.
        finger(&mut s, PointerPhase::Down, 400.0, 800.0, 10.0);
        finger(&mut s, PointerPhase::Move, 380.0, 700.0, 20.0);
        finger(&mut s, PointerPhase::Up, 380.0, 700.0, 30.0);
        assert!(s.agent("{}").unwrap().contains("\"cx\":180.0,\"cy\":270.0"));
        finger(&mut s, PointerPhase::Down, 200.0, 300.0, 40.0);
        finger(&mut s, PointerPhase::Move, 200.0, 400.0, 60.0);
        finger(&mut s, PointerPhase::Move, 220.0, 480.0, 80.0);
        finger(&mut s, PointerPhase::Up, 220.0, 480.0, 90.0);
        assert!(s.agent("{}").unwrap().contains("\"cx\":200.0,\"cy\":450.0"), "{}", s.agent("{}").unwrap());
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(100.0)).unwrap();
        b.save("fractal-glass-moved");
        // Wholly behind the pane: no sharp orange anywhere.
        assert_eq!(b.count(|p| p[..3] == [255, 165, 0]), 0);

        s.bind(&[Value::Number(1.0)], None).unwrap();
        let mut ms = 100.0;
        let mut moving = true;
        while moving && ms < 1000.0 {
            ms += 16.0;
            moving = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        c.save("fractal-glass-dark");
        assert!(s.agent("{}").unwrap().ends_with("\"background\":\"#000000\",\"circle\":\"#78C0E0\"}"));
        assert_eq!(&c.at(10, 10)[..3], &[0, 0, 0]);
    }
}
