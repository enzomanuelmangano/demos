//! Magnet Spring (src/animations/magnet-spring/magnet.tsx): a graphite piece (#3b3b3b, radius
//! CHEESE_RADIUS 25, boxShadow `0px 2px 10px rgba(0,0,0,0.2)`) dragged over nine aluminium
//! magnets (#c1c1c1, radius MAGNET_RADIUS 10, boxShadow `0px 0px 20px rgba(0,0,0,0.1)`) on
//! #f5f5f5; each magnet grows toward the piece and the piece snaps to the nearest on release.
//!
//! - The magnets: createFibonacciPositions(8) (golden-angle spiral about the window's centre,
//!   radius min(w, h) × 0.0035 × √i × 100, kept 50 pt inside the window) and the centre; the
//!   piece starts on the first (the centre).
//! - A magnet's scale: interpolate(distance to the piece, [0, CHEESE_RADIUS × 2], [3, 1], CLAMP),
//!   every frame; its colour interpolates #c1c1c1 to #c1c1c1 (so it stays).
//! - The pan begins on the piece's view (its 50² square, scaled); onBegin sets isActive and
//!   takes the piece's position as context (a spring still running keeps running until the
//!   first update); onUpdate puts it at context + translation; onEnd springs x and y to the
//!   nearest magnet ({ mass 0.4, damping 15, stiffness 120 }, the release velocity); onFinalize
//!   clears isActive.
//! - The piece's scale: withSpring(isActive ? 1.2 : 1, { mass 0.5, damping 10, stiffness 100 }).
//! - Box shadows are σ = blur / 2 (RN's iOS shadowRadius = blur / 2), scaled with their view.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Spring, SpringConfig};

use crate::{gfx, shaders};
use shaders::magnet_spring::{entry, module, Items, Profiles, GROUP_0, PROFILES, U};

/// MAGNET_RADIUS.
const MAGNET_RADIUS: f64 = 10.0;
/// CHEESE_RADIUS.
const CHEESE_RADIUS: f64 = 25.0;
/// SPRING_CONFIG.
const SNAP: SpringConfig = SpringConfig { stiffness: 120.0, damping: 15.0, mass: 0.4 };
/// The piece's scale spring.
const PRESS: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 0.5 };
/// The shader's profile samples and their spacing (points).
const SAMPLES: usize = 128;
const STEP: f64 = 0.5;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(MagnetSpring { scale: Spring::at(1.0), ..Default::default() })
}

#[derive(Default)]
struct MagnetSpring {
    /// The window, in points, the magnets were placed for.
    size: (f32, f32),
    magnets: [(f64, f64); 9],
    pan: PanGesture,
    active: bool,
    context: (f64, f64),
    x: Spring,
    y: Spring,
    scale: Spring,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    compose: wgpu::RenderPipeline,
    items: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// createFibonacciPositions(8) and the centre.
fn magnets(width: f64, height: f64) -> [(f64, f64); 9] {
    let (cx, cy) = (width * 0.5, height * 0.5);
    let scale_factor = width.min(height) * 0.0035;
    let golden_ratio = 1.618033988749895;
    let mut out = [(cx, cy); 9];
    for (i, slot) in out.iter_mut().take(8).enumerate() {
        let theta = i as f64 * golden_ratio * std::f64::consts::PI * 2.0;
        let radius = scale_factor * (i as f64).sqrt();
        let x = cx + radius * theta.cos() * 100.0;
        let y = cy + radius * theta.sin() * 100.0;
        *slot = (50f64.max((width - 50.0).min(x)), 50f64.max((height - 50.0).min(y)));
    }
    out
}

/// A circle of radius `r` blurred by σ, its coverage at `d` from its centre: the 2D Gaussian
/// over the disc, ∫₀ʳ (ρ/σ²) e^{−(ρ−d)²/2σ²} I₀e(ρd/σ²) dρ (Simpson, 400 steps).
fn blurred_disc(r: f64, sigma: f64, d: f64) -> f64 {
    let s2 = sigma * sigma;
    let f = |rho: f64| rho / s2 * (-(rho - d) * (rho - d) / (2.0 * s2)).exp() * i0e(rho * d / s2);
    let n = 400;
    let h = r / n as f64;
    let mut sum = f(0.0) + f(r);
    for k in 1..n {
        sum += f(k as f64 * h) * if k % 2 == 1 { 4.0 } else { 2.0 };
    }
    sum * h / 3.0
}

/// e^{−x} I₀(x), x ≥ 0 (Abramowitz & Stegun 9.8.1, 9.8.2).
fn i0e(x: f64) -> f64 {
    if x <= 3.75 {
        let t = (x / 3.75).powi(2);
        let i0 = 1.0 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
        i0 * (-x).exp()
    } else {
        let t = 3.75 / x;
        (0.39894228
            + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377))))))))
            / x.sqrt()
    }
}

fn profile(r: f64, sigma: f64) -> [[f32; 4]; SAMPLES / 4] {
    let mut out = [[0.0; 4]; SAMPLES / 4];
    for i in 0..SAMPLES {
        out[i / 4][i % 4] = blurred_disc(r, sigma, i as f64 * STEP) as f32;
    }
    out
}

impl MagnetSpring {
    fn position(&self) -> (f64, f64) {
        (self.x.value, self.y.value)
    }

    fn place(&mut self, width: f32, height: f32) {
        if self.size == (width, height) {
            return;
        }
        self.size = (width, height);
        self.magnets = magnets(width as f64, height as f64);
        // initialPosition = magnets[0].
        let (x, y) = self.magnets[0];
        self.x = Spring::at(x);
        self.y = Spring::at(y);
    }

    /// getNearestMagnet: the first of the closest.
    fn nearest(&self) -> (f64, f64) {
        let (x, y) = self.position();
        let mut best = self.magnets[0];
        let mut shortest = (x - best.0).hypot(y - best.1);
        for &m in &self.magnets[1..] {
            let d = (x - m.0).hypot(y - m.1);
            if d < shortest {
                shortest = d;
                best = m;
            }
        }
        best
    }

    fn set_active(&mut self, active: bool) {
        self.active = active;
        self.scale.retarget(if active { 1.2 } else { 1.0 }, PRESS);
    }
}

impl Surface for MagnetSpring {
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
        let (x, y) = self.position();
        Some(format!("{{\"x\":{x:.2},\"y\":{y:.2},\"active\":{},\"held\":{}}}", self.active, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        // The piece's view: its 50² square about the position, scaled.
        let (px, py) = self.position();
        let half = CHEESE_RADIUS * self.scale.value;
        let hit = (x as f64 - px).abs() <= half && (y as f64 - py).abs() <= half;
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { .. } => {
                self.set_active(true);
                self.context = self.position();
            }
            Event::Start(p) | Event::Update(p) => {
                self.x.set(self.context.0 + p.translation_x as f64);
                self.y.set(self.context.1 + p.translation_y as f64);
            }
            Event::End(p) => {
                let (nx, ny) = self.nearest();
                self.x.to(nx, p.velocity_x as f64, SNAP);
                self.y.to(ny, p.velocity_y as f64, SNAP);
                self.set_active(false);
            }
            Event::Fail => self.set_active(false),
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
        self.place(frame.width, frame.height);
        let now = frame.now_ms;
        let moving = self.x.step(now) | self.y.step(now) | self.scale.step(now);
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation));
        }
        let (px, py) = self.position();
        let mut at = [[0.0f32; 4]; 10];
        for (slot, &(mx, my)) in at.iter_mut().zip(self.magnets.iter()) {
            let distance = (px - mx).hypot(py - my);
            let scale = interpolate_clamp(distance, &[0.0, CHEESE_RADIUS * 2.0], &[3.0, 1.0]);
            *slot = [mx as f32, my as f32, scale as f32, 0.0];
        }
        at[9] = [px as f32, py as f32, self.scale.value as f32, 0.0];
        let (pw, ph) = frame.pixels();
        let gpu = self.gpu.as_ref().unwrap();
        let items = Items { at, canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)] };
        queue.write_buffer(&gpu.items, 0, &items.bytes());
        skia::render::fullscreen_pass(encoder, "magnet spring", target, &gpu.compose, &gpu.bind);
        moving || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let buffer = |label, size: usize| device.create_buffer(&wgpu::BufferDescriptor { label: Some(label), size: size as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let items = buffer("magnet items", Items::SIZE);
    let profiles = buffer("magnet profiles", Profiles::SIZE);
    // boxShadow blurs 20 and 10: σ 10 and 5.
    let p = Profiles { magnet: profile(MAGNET_RADIUS, 10.0), piece: profile(CHEESE_RADIUS, 5.0) };
    queue.write_buffer(&profiles, 0, &p.bytes());
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("magnet spring"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: items.as_entire_binding() },
            wgpu::BindGroupEntry { binding: PROFILES.binding, resource: profiles.as_entire_binding() },
        ],
    });
    Gpu { format, generation, compose, items, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_blurred_disc_at_its_centre() {
        // 1 − e^{−r²/2σ²}.
        assert!((blurred_disc(10.0, 10.0, 0.0) - (1.0 - (-0.5f64).exp())).abs() < 1e-6);
        // At the edge, a little under half (the disc curves away): 0.4607 by Monte Carlo.
        assert!((blurred_disc(25.0, 5.0, 25.0) - 0.4607).abs() < 0.002);
        assert!(blurred_disc(10.0, 10.0, 50.0) < 1e-3);
    }

    #[test]
    fn the_piece_drags_grows_the_magnets_and_snaps() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("magnet-rest");
        assert!(!animating);
        let m = magnets(420.0, 912.0);
        // The piece at the centre; magnet 1 (golden angle) at its own place, radius 10, grey.
        assert_eq!(&rest.at(210, 456)[..3], &[59, 59, 59]);
        assert_eq!(&rest.at(m[1].0 as u32, m[1].1 as u32)[..3], &[193, 193, 193]);
        assert_eq!(&rest.at(5, 5)[..3], &[245, 245, 245]);

        // Drag the piece onto magnet 3 and past it, then let go slowly: it snaps to magnet 3.
        let pointer = |phase, x: f64, y: f64, at_ms| InputEvent::Pointer { id: 1, phase, x: x as f32, y: y as f32, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms };
        let (tx, ty) = (m[3].0 + 6.0, m[3].1 - 4.0);
        s.input(&pointer(PointerPhase::Down, 210.0, 456.0, 0.0));
        let mut ms = 0.0;
        for k in 1..=30 {
            let f = k as f64 / 30.0;
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, 210.0 + (tx - 210.0) * f, 456.0 + (ty - 456.0) * f, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        for _ in 0..20 {
            ms += 16.0;
            s.input(&pointer(PointerPhase::Move, tx, ty, ms));
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("magnet-held");
        // Magnet 3 under the piece's edge has grown: grey 7 pt to the far side of its radius 10
        // (scale ≈ 2.86 at 7.2 pt), outside the piece (scale 1.2 → radius 30).
        s.input(&pointer(PointerPhase::Up, tx, ty, ms + 200.0));
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (snapped, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        snapped.save("magnet-snapped");
        assert!(!animating);
        let state = s.agent("{}").unwrap();
        assert!(state.contains(&format!("\"x\":{:.2}", m[3].0)), "{state} {:?}", m[3]);
        assert!(state.contains(&format!("\"y\":{:.2}", m[3].1)), "{state} {:?}", m[3]);
        // At rest on magnet 3: the piece is drawn there, and the centre magnet is plain again.
        assert_eq!(&snapped.at(m[3].0 as u32, m[3].1 as u32)[..3], &[59, 59, 59]);
        assert_eq!(&snapped.at(210, 456)[..3], &[193, 193, 193]);
    }
}
