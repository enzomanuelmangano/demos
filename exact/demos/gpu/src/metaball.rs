//! Metaball (src/animations/metaball/index.tsx): two circles (RADIUS 80) whose union is
//! blurred (BLUR 30) and thresholded into one liquid shape, filled with a sweep gradient from
//! the canvas's corner (cyan, blue, cyan) on #0A0A0A. Both start at the screen's centre; each
//! follows a finger. The first stays where it is dropped; the second springs back to the centre
//! (`withSpring`, Reanimated 4's default). A touch goes to the first circle if it is under the
//! finger, else to the second (RN's Touchable order: "the first one registered, i.e. rendered").
//!
//! Everything runs in this surface: the pans, the springs and the drawing. The owner's call
//! (phone feedback mwhp8vhc): not RN Skia's Blur 30 + ColorMatrix alpha threshold, but an
//! analytic SDF in one pass (`shaders/metaball.wgsl`): each circle's signed distance, the two
//! merged by a polynomial smooth minimum of K, the edge covered over one device pixel, crisp at
//! rest; the neck forms and breaks analytically, at centres SPLIT_AT = 2R + K/2 apart (RN's
//! blurred union pinches at about 2R + 40). The fill stays RN's sweep gradient in Display P3.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Spring, SpringConfig};

/// The release spring (the owner's call, phone feedback mwh5j03c / mwhlionx): damping ratio 1,
/// SwiftUI's `.spring(duration: 0.55, bounce: 0)`: mass 1, stiffness (2π / 0.55)², damping 2√k.
const RELEASE: SpringConfig = SpringConfig { stiffness: 130.507_165_634_239_4, damping: 22.848_165_582_471_224, mass: 1.0 };

// The haptics (the owner's calls, mwhlionx and mwhp8vhc; RN plays none), through the host:
// - a light impact at the grab;
// - while a blob is dragged, a texture of selection ticks spaced by the distance it travels:
//   sparse near the centre (TICK_SPACING_NEAR pt), dense as the tension rises toward the pinch
//   (TICK_SPACING_FAR), at most one per TICK_MIN_MS;
// - one medium "snap" the moment the neck breaks (the smooth minimum's field leaves the
//   midpoint: centres past SPLIT_AT), one soft "merge" when the blobs touch again;
// - a soft impact when a released blob's spring settles.
const GRAB: &str = "haptic:impact-light";
const TICK: &str = "haptic:selection";
const SNAP: &str = "haptic:impact-medium";
const MERGE: &str = "haptic:impact-soft";
const SETTLE: &str = "haptic:impact-soft";
const TICK_MIN_MS: f64 = 35.0;
const TICK_SPACING_NEAR: f32 = 36.0;
const TICK_SPACING_FAR: f32 = 8.0;
/// The tick spacing (pt of travel) at a tension of `d` (the blobs' gap) out of SPLIT_AT.
fn tick_spacing(d: f32) -> f32 {
    let k = (d / SPLIT_AT).clamp(0.0, 1.0);
    TICK_SPACING_NEAR + (TICK_SPACING_FAR - TICK_SPACING_NEAR) * k
}
/// The smooth minimum's k (pt): the neck's reach once the centres are 2R apart (it grows with
/// the gap from 0, so the blobs at rest are one circle of radius R: see metaball.wgsl).
const K: f32 = 80.0;
/// Where the merged field's midpoint crosses zero: smin(g, g, K) = g − K/4 with g = d/2 − R.
const SPLIT_AT: f32 = 2.0 * RADIUS + K / 2.0;
/// A rejoin needs the gap this far back under SPLIT_AT (no rattle at the threshold).
const MERGE_HYSTERESIS: f32 = 2.0;

use crate::{gfx, shaders};
use shaders::metaball::{entry, module, Uniforms, GROUP_0, U};

const RADIUS: f32 = 80.0;
/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Metaball::default())
}

#[derive(Default)]
struct Metaball {
    size: (f32, f32),
    first: (f32, f32),
    /// The first circle's way back to the centre after a lift (the owner's call: RN leaves it
    /// where it is dropped); `first_springs` while it runs.
    first_spring: (Spring, Spring),
    first_springs: bool,
    /// Haptics due to be posted, the last tick (its time and where the dragged blob was), whether
    /// the blobs are apart, and a release spring running (its settle is felt).
    posted: Vec<String>,
    apart: bool,
    released: bool,
    second: (Spring, Spring),
    first_pan: PanGesture,
    second_pan: PanGesture,
    first_from: (f32, f32),
    second_from: (f32, f32),
    /// Whether a finger has moved a circle yet: until then both sit at the canvas's centre,
    /// whatever size the canvas is laid out at (RN reads the window's size once).
    touched: bool,
    dirty: bool,
    gpu: Option<Gpu>,
    /// The dragged blob's travel since the last tick (pt), and where it was last frame.
    travel: f32,
    last_at: Option<(f32, f32)>,
    last_tick_ms: f64,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl Metaball {
    fn centre(&self) -> (f32, f32) {
        (self.size.0 / 2.0, self.size.1 / 2.0)
    }

    /// The springs' frame and the haptics it makes; whether anything still springs.
    fn step(&mut self, now_ms: f64) -> bool {
        let mut moving = self.second.0.step(now_ms) | self.second.1.step(now_ms);
        if self.first_springs {
            let first = self.first_spring.0.step(now_ms) | self.first_spring.1.step(now_ms);
            self.first = (self.first_spring.0.value as f32, self.first_spring.1.value as f32);
            self.first_springs = first;
            moving |= first;
        }
        let second = (self.second.0.value as f32, self.second.1.value as f32);
        // Apart or together: the neck breaks where the merged field's midpoint crosses zero.
        let gap = (self.first.0 - second.0).hypot(self.first.1 - second.1);
        if !self.apart && gap > SPLIT_AT {
            self.apart = true;
            self.posted.push(SNAP.into());
        } else if self.apart && gap < SPLIT_AT - MERGE_HYSTERESIS {
            self.apart = false;
            self.posted.push(MERGE.into());
        }
        // The stretch's texture: ticks by distance travelled, denser as the gap grows.
        let held = if self.first_pan.tracking() { Some(self.first) } else if self.second_pan.tracking() { Some(second) } else { None };
        match held {
            Some(at) => {
                let step = self.last_at.map_or(0.0, |from| (at.0 - from.0).hypot(at.1 - from.1));
                self.travel += step;
                self.last_at = Some(at);
                // Only while it moves: a blob held still is silent.
                if step > 0.0 && self.travel >= tick_spacing(gap) && now_ms - self.last_tick_ms >= TICK_MIN_MS {
                    self.posted.push(TICK.into());
                    self.travel = 0.0;
                    self.last_tick_ms = now_ms;
                }
            }
            None => {
                self.last_at = None;
                self.travel = 0.0;
            }
        }
        // A released blob settles at the centre.
        if self.released && !moving && held.is_none() {
            self.released = false;
            self.posted.push(SETTLE.into());
        }
        moving
    }
}

impl Surface for Metaball {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"size\":[{},{}],\"first\":[{},{}],\"second\":[{},{}],\"touched\":{}}}",
            self.size.0, self.size.1, self.first.0, self.first.1, self.second.0.value, self.second.1.value, self.touched
        ))
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn opaque(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        let hit = |c: (f32, f32)| (x - c.0).hypot(y - c.1) <= RADIUS;
        let second = (self.second.0.value as f32, self.second.1.value as f32);
        let on_first = hit(self.first) && !self.second_pan.tracking();
        let on_second = !on_first && hit(second) && !self.first_pan.tracking();
        match self.first_pan.event(id, phase, x, y, at_ms, on_first) {
            Event::Begin { .. } => {
                self.first_from = self.first;
                self.touched = true;
                self.posted.push(GRAB.into());
            }
            // onActive (the pan's onUpdate).
            Event::Start(p) | Event::Update(p) => {
                self.first_springs = false;
                self.first = (self.first_from.0 + p.translation_x, self.first_from.1 + p.translation_y);
                self.dirty = true;
            }
            // RN's circleGesture has no onEnd: the lift leaves it. The owner's call (mwhlionx):
            // it springs back to the centre as the second does, with the finger's velocity.
            Event::End(p) => {
                let (cx, cy) = self.centre();
                let v = |s: &Spring, springs: bool, finger: f32| if finger != 0.0 { finger as f64 } else if springs && s.running { s.velocity } else { 0.0 };
                let (vx, vy) = (v(&self.first_spring.0, self.first_springs, p.velocity_x), v(&self.first_spring.1, self.first_springs, p.velocity_y));
                if !self.first_springs {
                    self.first_spring = (Spring::at(self.first.0 as f64), Spring::at(self.first.1 as f64));
                }
                self.first_spring.0.launch(cx as f64, vx, RELEASE);
                self.first_spring.1.launch(cy as f64, vy, RELEASE);
                self.first_springs = true;
                self.released = true;
                self.dirty = true;
            }
            Event::Fail => {
                let (cx, cy) = self.centre();
                if !self.first_springs {
                    self.first_spring = (Spring::at(self.first.0 as f64), Spring::at(self.first.1 as f64));
                }
                for (s, to) in [(&mut self.first_spring.0, cx), (&mut self.first_spring.1, cy)] {
                    let v = if s.running { s.velocity } else { 0.0 };
                    s.launch(to as f64, v, RELEASE);
                }
                self.first_springs = true;
                self.released = true;
                self.dirty = true;
            }
            _ => {}
        }
        match self.second_pan.event(id, phase, x, y, at_ms, on_second) {
            // onStart (the pan's onBegin) only keeps the context: a spring back still running goes
            // on until onActive sets the values.
            Event::Begin { .. } => {
                self.touched = true;
                self.second_from = second;
                self.posted.push(GRAB.into());
            }
            Event::Start(p) | Event::Update(p) => {
                self.second.0.set((self.second_from.0 + p.translation_x) as f64);
                self.second.1.set((self.second_from.1 + p.translation_y) as f64);
                self.dirty = true;
            }
            // The lift: back to the centre on a critically damped spring (the owner's call, phone
            // feedback mwh5j03c: RN's withSpring() starts from rest) carrying the finger's release
            // velocity, whichever way it points.
            Event::End(p) => {
                let (cx, cy) = self.centre();
                // A lift with no drag (the pan never moved) keeps a running spring's velocity.
                let v = |s: &Spring, finger: f32| if finger != 0.0 { finger as f64 } else if s.running { s.velocity } else { 0.0 };
                let (vx, vy) = (v(&self.second.0, p.velocity_x), v(&self.second.1, p.velocity_y));
                self.second.0.launch(cx as f64, vx, RELEASE);
                self.second.1.launch(cy as f64, vy, RELEASE);
                self.released = true;
                self.dirty = true;
            }
            // A cancel: the same spring from where it is, at the velocity it has.
            Event::Fail => {
                let (cx, cy) = self.centre();
                for (s, to) in [(&mut self.second.0, cx), (&mut self.second.1, cy)] {
                    let v = if s.running { s.velocity } else { 0.0 };
                    s.launch(to as f64, v, RELEASE);
                }
                self.released = true;
                self.dirty = true;
            }
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
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
        if !self.touched {
            let (cx, cy) = self.centre();
            self.first = (cx, cy);
            self.second = (Spring::at(cx as f64), Spring::at(cy as f64));
        }
        let moving = self.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (c1, c2) = (self.first, (self.second.0.value as f32, self.second.1.value as f32));
        let u = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            blobs: [c1.0, c1.1, c2.0, c2.1],
            shape: [RADIUS, K, 0.0, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "metaball", target, &gpu.compose, &gpu.bind);
        self.dirty = false;
        moving || self.first_pan.tracking() || self.second_pan.tracking()
    }
}

/// The blurred image's uv of a device pixel: uv = p · xy + zw (as spiral's).
fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("metaball"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("metaball"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }],
    });
    Gpu { format, generation, compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None), uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 210.0,
            height: 456.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    #[test]
    fn the_circles_start_at_the_centre_and_follow_a_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = Metaball::default();
        let (img, _) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        img.save("metaball-start");
        let lit = |img: &fixture::Pixels, x: u32, y: u32| img.at(x, y)[2] > 128;
        assert!(lit(&img, 105, 228), "centre {:?}", img.at(105, 228));
        assert!(!lit(&img, 105, 100), "above {:?}", img.at(105, 100));
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 228.0, 10.0));
        // RNGH on iOS leaves UIKit's 10 pt hysteresis out of the translation (a pan that begins 90 ms or more after touch-down): 130 pt
        // of travel translate it 120.
        for i in 1..=11 {
            s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 228.0 - (12.0 * i as f32).min(130.0), 100.0 + 8.0 * i as f64));
        }
        let (img, _) = fixture::render(&gpu, &mut s, &frame(200.0)).unwrap();
        img.save("metaball-dragged");
        assert!(lit(&img, 105, 108), "dragged {:?}", img.at(105, 108));
        // Lifted, the first stays 120 pt above the second: their gap of 0 bridges.
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 98.0, 200.0));
        let (img, _) = fixture::render(&gpu, &mut s, &frame(300.0)).unwrap();
        img.save("metaball-bridge");
        assert!(lit(&img, 105, 168), "bridge {:?}", img.at(105, 168));
        assert!(!lit(&img, 20, 168), "beside the bridge {:?}", img.at(20, 168));
        // The lift at another point than the last move: circleGesture has no onEnd.
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 108.0, 400.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 96.0, 496.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 86.0, 504.0));
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 78.0, 512.0));
        assert_eq!(s.first, (105.0, 96.0));
    }

    #[test]
    fn grab_texture_snap_merge_and_settle_are_felt_and_the_first_springs_back() {
        let mut s = Metaball { size: (400.0, 800.0), touched: true, first: (200.0, 400.0), ..Default::default() };
        s.second = (Spring::at(200.0), Spring::at(400.0));
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(exact_gpu::PointerPhase::Down, 200.0, 400.0, 0.0));
        assert_eq!(s.messages(), [GRAB]);
        // Dragged down 400 pt at 4 pt a frame: the ticks come by distance, denser as the gap grows.
        let mut ticks = vec![];
        let mut snaps = vec![];
        let mut ms = 0.0;
        for i in 1..=100 {
            ms = 16.0 * i as f64;
            s.input(&pointer(exact_gpu::PointerPhase::Move, 200.0, 400.0 + 4.0 * i as f32, ms));
            s.step(ms);
            for m in s.messages() {
                if m == TICK {
                    if let Some(&(t, _)) = ticks.last() {
                        assert!(ms - t >= TICK_MIN_MS, "two ticks {} ms apart", ms - t);
                    }
                    ticks.push((ms, s.first.1 - 400.0));
                } else if m == SNAP {
                    snaps.push(s.first.1 - 400.0);
                } else {
                    panic!("{m}");
                }
            }
        }
        // One snap, where the neck breaks: the gap just past 2R + K/2.
        assert_eq!(snaps.len(), 1, "{snaps:?}");
        assert!(snaps[0] > SPLIT_AT && snaps[0] <= SPLIT_AT + 4.0, "{snaps:?}");
        // Sparse near the centre, denser under tension: the gaps between ticks shrink.
        let first = ticks[1].1 - ticks[0].1;
        let late: Vec<f32> = ticks.windows(2).filter(|w| w[0].1 > 150.0 && w[1].1 < SPLIT_AT).map(|w| w[1].1 - w[0].1).collect();
        assert!(first > 25.0 && !late.is_empty() && late.iter().all(|&d| d < first * 0.6), "{first} {late:?}");
        // Held still: no texture.
        for k in 1..=10 {
            s.step(ms + 16.0 * k as f64);
        }
        assert!(s.messages().is_empty());
        // Let go: the first springs back to the centre, merges once (soft), settles (soft).
        s.input(&pointer(exact_gpu::PointerPhase::Up, 200.0, 800.0, ms + 200.0));
        assert!(s.first_springs);
        let mut felt = vec![];
        let mut t = ms + 200.0;
        while t < ms + 3000.0 {
            t += 16.0;
            s.step(t);
            felt.extend(s.messages());
            if felt.len() == 2 {
                break;
            }
        }
        assert_eq!(felt, [MERGE, SETTLE]);
        assert!((s.first.1 - 400.0).abs() < 0.5, "{:?}", s.first);
        assert!(t - ms < 1700.0, "{}", t - ms);
    }

    #[test]
    fn the_sdf_draws_rest_a_stretch_a_thin_neck_and_the_pinch_off_crisply() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let f = Frame { width: 300.0, height: 600.0, scale: 2.0, ..frame(0.0) };
        let mut s = Metaball { size: (300.0, 600.0), touched: true, ..Default::default() };
        let lit = |img: &fixture::Pixels, x: f32, y: f32| img.at((x * 2.0) as u32, (y * 2.0) as u32)[2] > 128;
        for (name, gap) in [("rest", 0.0), ("stretch", 150.0), ("neck", 196.0), ("pinched", 206.0)] {
            s.first = (150.0, 200.0);
            s.second = (Spring::at(150.0), Spring::at(200.0 + gap as f64));
            let (img, _) = fixture::render(&gpu, &mut s, &f).unwrap();
            img.save(&format!("metaball-sdf-{name}"));
            // The neck's middle: lit while the centres are under SPLIT_AT apart, dark past it.
            assert_eq!(lit(&img, 150.0, 200.0 + gap / 2.0), gap < SPLIT_AT, "{name}");
            // Beside the neck (at its middle, a radius and 4 pt off the axis): never lit.
            assert!(!lit(&img, 150.0 - RADIUS - 4.0, 200.0 + gap / 2.0), "{name}");
            // A crisp edge at rest: the circle's rim goes from lit to background within 2 device px.
            if gap == 0.0 {
                let row = 400u32;
                let edge: Vec<u8> = (2 * 150 - 160 - 3..2 * 150 - 160 + 3).map(|x| img.at(x as u32, row)[2]).collect();
                assert!(edge[0] < 40 && edge[5] > 200, "{edge:?}");
                assert!(edge.iter().filter(|&&v| v > 40 && v < 200).count() <= 2, "{edge:?}");
            }
        }
    }

    #[test]
    fn the_neck_breaks_where_the_smooth_minimum_s_midpoint_leaves_the_shape() {
        let smin = |a: f32, b: f32| {
            let h = (0.5 + 0.5 * (b - a) / K).clamp(0.0, 1.0);
            b + (a - b) * h - K * h * (1.0 - h)
        };
        let mid = |gap: f32| smin(gap / 2.0 - RADIUS, gap / 2.0 - RADIUS);
        assert!(mid(SPLIT_AT - 0.5) < 0.0 && mid(SPLIT_AT + 0.5) > 0.0);
        assert_eq!(SPLIT_AT, 200.0);
    }

    #[test]
    fn the_second_springs_back_and_a_touch_down_does_not_stop_it() {
        let mut s = Metaball { size: (210.0, 456.0), touched: true, first: (105.0, 0.0), ..Default::default() };
        s.second = (Spring::at(105.0), Spring::at(228.0));
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, 228.0, 0.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 240.0, 8.0));
        s.input(&pointer(exact_gpu::PointerPhase::Move, 105.0, 400.0, 16.0));
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, 400.0, 32.0));
        assert!(s.second.1.running);
        // The lift carries the finger's velocity (down, away from the centre): the blob goes on
        // past where it was let go, then comes back, critically damped (no swing past the centre).
        s.second.1.step(32.0);
        s.second.1.step(48.0);
        assert!(s.second.1.value > 400.0, "{}", s.second.1.value);
        let mut ms = 48.0;
        let mut peak: f64 = 0.0;
        while s.second.1.value > 300.0 {
            ms += 16.0;
            s.second.1.step(ms);
            peak = peak.max(s.second.1.value);
            assert!(ms < 3000.0);
        }
        assert!(peak > 400.0);
        s.second.1.step(ms + 16.0);
        let mid = s.second.1.value;
        assert!(mid < 400.0 && mid > 228.0, "{mid}");
        // Held still on it (the pan not active yet): the spring goes on.
        s.input(&pointer(exact_gpu::PointerPhase::Down, 105.0, mid as f32, ms + 20.0));
        assert!(s.second.1.running);
        s.second.1.step(ms + 70.0);
        assert!(s.second.1.value < mid);
        // Lifted without a drag: the spring again, from where it is, at the velocity it has.
        s.input(&pointer(exact_gpu::PointerPhase::Up, 105.0, mid as f32, ms + 80.0));
        assert!(s.second.1.running && s.second.1.velocity < 0.0);
        // It settles at the centre without passing it (ζ = 1).
        let mut t = ms + 80.0;
        while s.second.1.running {
            t += 16.0;
            s.second.1.step(t);
            assert!(s.second.1.value >= 228.0 - 0.5, "{}", s.second.1.value);
            assert!(t < ms + 5000.0);
        }
    }
}
