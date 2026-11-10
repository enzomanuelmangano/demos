//! Sphere Waves (src/animations/sphere-waves/index.tsx): 2000 dots on a Fibonacci sphere,
//! breathing in waves of depth, filled with a five-colour gradient whose hues turn with time,
//! on black. A tap on the right half picks a new random `magicalMul` (another pattern), on the
//! left half goes back in the history of them; a pinch moves the eye nearer or farther.
//!
//! - drawEnhancedFibonacci, per dot `i` of N = 2000 (CANVAS = the window): a = i / (N / 2) − 1,
//!   angle = i × magicalMul + iTime, px = cos(angle) √(1 − a²), py = cos(angle + 11) √(1 − a²);
//!   z = 80 sin(0.1 i + 0.7 t) + 40 cos(0.05 i + 0.3 t) + 20 sin(0.15 i + 1.2 t); scale =
//!   distance / (distance + z); the dot at (W/2 + px · 0.4 W · scale, H/2 + a · 0.4 W · scale),
//!   radius clamp((1 − |py|) / (N · 0.01) · 20 · scale, 0.5, 10) · (sin(0.2 i + 2 t) · 0.3 + 1)
//!   · (sin(0.8 t) · 0.2 + 1).
//! - The paint: LinearGradient((0, 0) → (W, H)) of hsl(340, 90%, 70%), hsl(280, 85%, 75%),
//!   hsl(220, 95%, 80%), hsl(160, 88%, 72%), hsl(60, 92%, 78%), each hue + (40 t mod 360)
//!   (mod 360, to 2 decimals).
//! - iTime: withRepeat(withTiming(15, { duration: 50000, easing: linear }), −1, true).
//! - Tap (onEnd): x > W / 2 pushes Math.random() × 100 after the current history entry (the
//!   entries after it dropped) and shows it; else steps back one entry, if any. INITIAL 2.4.
//! - Pinch: onStart saves distance (300 at first); onUpdate distance = saved ×
//!   interpolate(scale, [0.05, 0.2, 0.3, 1, 3], [80, 25, 2, 1, 0.05], CLAMP); onEnd
//!   withSpring(300) (Reanimated 4's default).
//!
//! The dots are computed here in f64, as the worklet does (i × magicalMul reaches 2 × 10⁵ rad,
//! past f32's precision), and drawn as instances of one quad.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PinchEvent, PinchGesture, TapGesture};
use reanimated::{interpolate_clamp, Spring, GENTLE};
use skia::Color;

use crate::{gfx, shaders};
use shaders::sphere_waves::{entry, module, Uniforms, DOTS, GROUP_0, U};

/// N_ITEMS.
const N: usize = 2000;
/// INITIAL_MAGICAL_MUL.
const INITIAL_MAGICAL_MUL: f64 = 2.4;
/// distance's start and rest.
const DISTANCE: f64 = 300.0;
/// iTime's withTiming: to 15 over 50 s, linear, back and forth.
const TIME_TO: f64 = 15.0;
const TIME_MS: f64 = 50000.0;
/// The gradient's base hues, saturations and lightnesses.
const HSL: [(f64, f32, f32); 5] = [(340.0, 90.0, 70.0), (280.0, 85.0, 75.0), (220.0, 95.0, 80.0), (160.0, 88.0, 72.0), (60.0, 92.0, 78.0)];

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(SphereWaves {
        magical_mul: INITIAL_MAGICAL_MUL,
        history: vec![INITIAL_MAGICAL_MUL],
        distance: Spring::at(DISTANCE),
        saved_distance: DISTANCE,
        dots: Vec::with_capacity(N),
        ..Default::default()
    })
}

#[derive(Default)]
struct SphereWaves {
    size: (f32, f32),
    magical_mul: f64,
    history: Vec<f64>,
    history_index: usize,
    distance: Spring,
    saved_distance: f64,
    start_ms: Option<f64>,
    tap: TapGesture,
    pinch: PinchGesture,
    taps: u64,
    dots: Vec<[f32; 4]>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    dots: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// iTime at `ms` after the start: 0 → 15 → 0 every 100 s.
pub(crate) fn time_at(ms: f64) -> f64 {
    let c = ms.max(0.0).rem_euclid(2.0 * TIME_MS);
    if c < TIME_MS {
        TIME_TO * c / TIME_MS
    } else {
        TIME_TO * (2.0 * TIME_MS - c) / TIME_MS
    }
}

/// drawEnhancedFibonacci's dots, in canvas points: (x, y, radius).
pub(crate) fn fibonacci(out: &mut Vec<[f32; 4]>, width: f64, height: f64, magical_mul: f64, time: f64, distance: f64) {
    out.clear();
    let (cx, cy) = (width / 2.0, height / 2.0);
    let time_pulse = (time * 0.8).sin() * 0.2 + 1.0;
    let half = N as f64 * 0.5;
    let intensity_div = N as f64 * 0.01;
    let radius_scale = width * 0.4;
    let (t07, t03, t12, t20) = (time * 0.7, time * 0.3, time * 1.2, time * 2.0);
    for i in 0..N {
        let fi = i as f64;
        let a = fi / half - 1.0;
        let sq = (1.0 - a * a).sqrt();
        let angle = fi * magical_mul + time;
        let px = angle.cos() * sq;
        let py = (angle + 11.0).cos() * sq;
        let z = (fi * 0.1 + t07).sin() * 80.0 + (fi * 0.05 + t03).cos() * 40.0 + (fi * 0.15 + t12).sin() * 20.0;
        let scale = distance / (distance + z);
        let x = cx + px * radius_scale * scale;
        let y = cy + a * radius_scale * scale;
        let pulse = (fi * 0.2 + t20).sin() * 0.3 + 1.0;
        let intensity = (1.0 - py.abs()) / intensity_div;
        let base = (intensity * 20.0 * scale).clamp(0.5, 10.0);
        let radius = base * pulse * time_pulse;
        // distance + z at 0: Skia draws nothing for a circle at infinity.
        if x.is_finite() && y.is_finite() && radius.is_finite() {
            out.push([x as f32, y as f32, radius as f32, 0.0]);
        }
    }
}

impl SphereWaves {
    /// Math.random(): xorshift over the tap's clock and count.
    fn random(&mut self, at_ms: f64) -> f64 {
        self.taps += 1;
        let mut x = (at_ms.to_bits() ^ self.taps.wrapping_mul(0x9E37_79B9_7F4A_7C15)) | 1;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        (x >> 11) as f64 / (1u64 << 53) as f64
    }

    fn tapped(&mut self, x: f32, at_ms: f64) {
        if x > self.size.0 / 2.0 {
            let value = self.random(at_ms) * 100.0;
            self.history.truncate(self.history_index + 1);
            self.history.push(value);
            self.history_index = self.history.len() - 1;
            self.magical_mul = value;
        } else if self.history_index > 0 {
            self.history_index -= 1;
            self.magical_mul = self.history[self.history_index];
        }
    }
}

impl Surface for SphereWaves {
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
            "{{\"magicalMul\":{:.4},\"historyIndex\":{},\"history\":{},\"distance\":{:.2}}}",
            self.magical_mul,
            self.history_index,
            self.history.len(),
            self.distance.value
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        // Gesture.Simultaneous(tap, pinch).
        if let Event::Tap { x, .. } = self.tap.event(id, phase, x, y, at_ms, true) {
            self.tapped(x, at_ms);
        }
        match self.pinch.event(id, phase, x, y, true) {
            PinchEvent::Start(_) => self.saved_distance = self.distance.value,
            PinchEvent::Update(p) => {
                let multiplier = interpolate_clamp(p.scale as f64, &[0.05, 0.2, 0.3, 1.0, 3.0], &[80.0, 25.0, 2.0, 1.0, 0.05]);
                self.distance.set(self.saved_distance * multiplier);
            }
            PinchEvent::End(_) => {
                let v = if self.distance.running { self.distance.velocity } else { 0.0 };
                self.distance.to(DISTANCE, v, GENTLE);
            }
            PinchEvent::None => {}
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
        let start = *self.start_ms.get_or_insert(frame.now_ms);
        let time = time_at(frame.now_ms - start);
        self.distance.step(frame.now_ms);
        fibonacci(&mut self.dots, frame.width as f64, frame.height as f64, self.magical_mul, time, self.distance.value);

        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        // hueShift = (time × 40) % 360; each hue ((base + shift) % 360).toFixed(2).
        let shift = (time * 40.0) % 360.0;
        let mut stops = [[0.0f32; 4]; 5];
        for (stop, &(base, s, l)) in stops.iter_mut().zip(HSL.iter()) {
            let hue = (((base + shift) % 360.0) * 100.0).round() / 100.0;
            *stop = Color::hsl(hue as f32, s, l).0;
        }
        let (pw, ph) = frame.pixels();
        let uniforms = Uniforms { canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)], stops };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        queue.write_buffer(&gpu.dots, 0, as_bytes(&self.dots));
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("sphere waves"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // styles.container: black.
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.draw(0..6, 0..self.dots.len() as u32);
        // iTime repeats forever.
        true
    }
}

fn as_bytes(data: &[[f32; 4]]) -> &[u8] {
    // [f32; 4] is plain old data: 16 bytes, no padding.
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, std::mem::size_of_val(data)) }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::DOT_VS, entry::DOT_FS, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), "sphere waves");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("sphere waves uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let dots = device.create_buffer(&wgpu::BufferDescriptor { label: Some("sphere waves dots"), size: (N * 16) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("sphere waves"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }, wgpu::BindGroupEntry { binding: DOTS.binding, resource: dots.as_entire_binding() }],
    });
    Gpu { format, generation, pipeline, uniforms, dots, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;
    use exact_gpu::PointerPhase;

    #[test]
    fn hsl_is_react_natives() {
        // normalizeColor('hsl(340, 90%, 70%)'): q 0.97, p 0.43 → (247, 110, 156).
        let c = Color::hsl(340.0, 90.0, 70.0).0;
        assert_eq!([c[0], c[1], c[2]].map(|v| (v * 255.0).round() as u8), [247, 110, 156]);
        assert_eq!(Color::parse("hsl(340.00, 90%, 70%)").0, Color::hsl(340.0, 90.0, 70.0).0);
    }

    #[test]
    fn the_sphere_breathes_and_taps_walk_the_history() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("sphere-waves-0");
        assert!(animating);
        // A cloud of dots (radius 0.5 to ~1.3 pt) about the centre, its perspective scale up to
        // 1.9 at 300: inside it lit samples, at the left and top edges black.
        let lit = |img: &fixture::Pixels, x0: u32, x1: u32, y0: u32, y1: u32| {
            (y0..y1).step_by(3).flat_map(|y| (x0..x1).step_by(3).map(move |x| (x, y))).filter(|&(x, y)| img.at(x, y)[..3].iter().any(|&c| c > 60)).count()
        };
        assert!(lit(&a, 110, 310, 356, 556) > 60, "{}", lit(&a, 110, 310, 356, 556));
        assert_eq!(lit(&a, 0, 420, 0, 150), 0);
        assert_eq!(&a.at(5, 5)[..3], &[0, 0, 0]);
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(4000.0)).unwrap();
        assert_ne!(a.data, b.data);

        let tap = |s: &mut Box<dyn Surface>, x: f32, at_ms: f64| {
            let e = |phase| InputEvent::Pointer { id: 7, phase, x, y: 400.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
            s.input(&e(PointerPhase::Down));
            s.input(&e(PointerPhase::Up));
        };
        tap(&mut s, 400.0, 100.0);
        let after = s.agent("{}").unwrap();
        assert!(after.contains("\"historyIndex\":1,\"history\":2"), "{after}");
        assert!(!after.contains("\"magicalMul\":2.4000"), "{after}");
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(4000.0)).unwrap();
        c.save("sphere-waves-random");
        assert_ne!(b.data, c.data);
        tap(&mut s, 20.0, 200.0);
        assert!(s.agent("{}").unwrap().starts_with("{\"magicalMul\":2.4000,\"historyIndex\":0,\"history\":2"));
        let (d, _) = fixture::render(&gpu, s.as_mut(), &frame(4000.0)).unwrap();
        assert_eq!(b.data, d.data);
        // Back at the start, a left tap does nothing.
        tap(&mut s, 20.0, 300.0);
        assert!(s.agent("{}").unwrap().contains("\"historyIndex\":0"));

        // A pinch in to half: distance × interpolate(0.5) = 300 × (1 + (2 − 1) × 0.5 / 0.7).
        let finger = |s: &mut Box<dyn Surface>, id, phase, y: f32| {
            s.input(&InputEvent::Pointer { id, phase, x: 210.0, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms: 500.0 })
        };
        finger(&mut s, 1, PointerPhase::Down, 256.0);
        finger(&mut s, 2, PointerPhase::Down, 656.0);
        finger(&mut s, 2, PointerPhase::Move, 656.0);
        finger(&mut s, 2, PointerPhase::Move, 456.0);
        let pinched = s.agent("{}").unwrap();
        assert!(pinched.ends_with("\"distance\":514.29}"), "{pinched}");
        let (e, _) = fixture::render(&gpu, s.as_mut(), &frame(4100.0)).unwrap();
        e.save("sphere-waves-pinched");
        finger(&mut s, 1, PointerPhase::Up, 256.0);
        let mut ms = 4100.0;
        while ms < 7000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        assert!(s.agent("{}").unwrap().ends_with("\"distance\":300.00}"));
    }
}
