//! Arena's floor: the RN app's `ArenaFloor` and `useClockPull` (src/components/arena/arena-floor.tsx).
//! A chess clock's dial lying on Journey's floor, behind the Storm board; pulling the list down
//! fills a stopwatch in the gap the pull opens, and closing its ring (PULL_TO_REVEAL, under the
//! finger) starts the count: the hands appear at twelve, the second hand ticks the last COUNTDOWN
//! beats up to it while the dial lights, the hands fade where they stand and the light after them,
//! and at HANDS_GONE the dock's Storm pill beats under StormPulseFadePattern.
//!
//! `arena(scroll, dragging, reduced, gapTop, visible, light)`: the list's offset from the first drag's
//! rest in points (pulled down negative), a finger on the list (onBeginDrag / onEndDrag), Reduce
//! Motion, the bar's bottom in the canvas (safe top + HEADER_HEIGHT), whether Arena is in front
//! (leaving cancels a count, as the focus effect does) and the page's scheme
//! (`exactViewport().prefersColorScheme`, as Journey's surfaces: no probe child, so no host capture
//! on the first visit and no frames asked for until a read lands). It publishes
//! `{"armed","ticks","tick","beats"}`, each a count of its event, for the Contract to refetch (the
//! pull to refresh), tick the haptics and beat the dock. shaders/arena.wgsl draws it.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

use crate::pulsar::Pulsar;
use crate::{gfx, shaders};

/// How many inputs `arena` takes.
pub const INPUTS: usize = 6;

const TAU: f64 = std::f64::consts::TAU;
/// LINE_WEIGHT, DARK_INK and the light floor's 0.11 (arena-floor.tsx:221-227, 606-608).
const LINE_WEIGHT: f32 = 2.2;
const DARK_INK: f32 = 0.14;
const LIGHT_INK: f32 = 0.11;
/// PULL_TO_REVEAL: how far the list is pulled to close the ring, in points.
pub const PULL_TO_REVEAL: f64 = 110.0;
/// BURST_MS: the ring's burst.
const BURST_MS: f64 = 650.0;
/// COUNTDOWN ticks of TICK_S each; LAST_TICK when the one onto twelve starts.
pub const COUNTDOWN: i64 = 3;
pub const TICK_S: f64 = 0.4;
const LAST_TICK: f64 = COUNTDOWN as f64 * TICK_S;
const DIAL_LIFT: f32 = 1.4;
const FACE_INK: f32 = 0.06;
const FACE_INK_DARK: f32 = 0.07;
const CORE: f32 = 0.22;
const HALO: f32 = 0.07;
const CORE_LIGHT: f32 = 0.9;
const HALO_LIGHT: f32 = 0.55;
const HAND_LIFT: f32 = 0.45;
const HANDS_IN_MS: f64 = 120.0;
const HOLD_MS: f64 = 400.0;
const FADE_MS: f64 = 300.0;
const LIGHT_LAG_MS: f64 = 180.0;
const LIGHT_FADE_MS: f64 = 500.0;
const TICK_MS: f64 = 220.0;
const TICK_OVERSHOOT: f64 = 1.4;
/// HANDS_GONE: the dock's beat, seconds into the count.
pub const HANDS_GONE: f64 = LAST_TICK + (HOLD_MS + FADE_MS) / 1000.0;
/// COUNT_SECONDS: the whole count.
pub const COUNT_SECONDS: f64 = LAST_TICK + (HOLD_MS + if FADE_MS > LIGHT_LAG_MS + LIGHT_FADE_MS { FADE_MS } else { LIGHT_LAG_MS + LIGHT_FADE_MS }) / 1000.0;

/// theme.colors: accent, primaryDark, primaryLight; background.secondary light (patterns.ts).
const ACCENT: u32 = 0xCBAA8E;
const PRIMARY_DARK: u32 = 0xA68160;
const PRIMARY_LIGHT: u32 = 0xE4C6AD;
const PAGE_SECONDARY_LIGHT: u32 = 0xFFFFFF;

/// lib/haptics/storm-pulse.ts StormPulseFadePattern: the dock pill's beat, felt as a fade.
pub const STORM_PULSE_FADE: Pulsar = Pulsar {
    discrete: &[],
    amplitude: &[(0.0, 0.0), (70.0, 0.22), (160.0, 0.35), (270.0, 0.31), (450.0, 0.2), (620.0, 0.11), (780.0, 0.05), (900.0, 0.0)],
    frequency: &[(0.0, 0.3), (270.0, 0.18), (900.0, 0.05)],
};

/// The count's drawing at `t` seconds in (`None`: no count): the second hand's angle, the hands'
/// opacity and the light's share (arena-floor.tsx:640-689).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Count {
    pub second: f64,
    pub opacity: f64,
    pub live: f64,
    pub out: bool,
}

/// One frame of the count, `reduced` snapping each tick with no overshoot.
pub fn count_at(t: Option<f64>, reduced: bool) -> Count {
    let Some(t) = t else { return Count { second: TAU - COUNTDOWN as f64 / 60.0 * TAU, opacity: 0.0, live: 0.0, out: false } };
    let whole = (t / TICK_S).floor();
    let p = ((t - whole * TICK_S) / (TICK_MS / 1000.0)).min(1.0);
    let c = TICK_OVERSHOOT;
    let snap = if reduced { 1.0 } else { 1.0 + (c + 1.0) * (p - 1.0).powi(3) + c * (p - 1.0).powi(2) };
    let ticks_done = if whole < 1.0 { 0.0 } else { (COUNTDOWN as f64).min(whole - 1.0 + snap) };
    let fade_start = LAST_TICK + HOLD_MS / 1000.0;
    let fade_out = 1.0 - ((t - fade_start) / (FADE_MS / 1000.0)).clamp(0.0, 1.0);
    let shown = (t / (HANDS_IN_MS / 1000.0)).min(1.0);
    let start_at = TAU - COUNTDOWN as f64 / 60.0 * TAU;
    let light_start = fade_start + LIGHT_LAG_MS / 1000.0;
    let light_out = 1.0 - ((t - light_start) / (LIGHT_FADE_MS / 1000.0)).clamp(0.0, 1.0);
    let light_left = light_out * light_out * (3.0 - 2.0 * light_out);
    Count { second: start_at + ticks_done.max(0.0) / 60.0 * TAU, opacity: shown * fade_out, live: (t / 0.3).min(1.0) * light_left, out: shown * fade_out > 0.0 }
}

/// The clock pull's state machine (useClockPull's `wind`, the count's callback, the reactions).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Pull {
    pub dragging: bool,
    pub armed: bool,
    /// When the count started, ms on the frame clock.
    pub run_from: Option<f64>,
    pub burst_from: Option<f64>,
    /// The last tick felt (1..=COUNTDOWN) in this count, and whether its beat has gone.
    pub tick: i64,
    pub beat: bool,
    /// Each event's count, as published.
    pub armed_n: u32,
    pub ticks_n: u32,
    pub beats_n: u32,
}

/// What a frame of the pull asks the host for.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Felt {
    pub armed: bool,
    pub tick: i64,
    pub beat: bool,
}

impl Pull {
    /// A finger down or up (onBeginDrag disarms a finished count; onEndDrag only lets go).
    pub fn drag(&mut self, dragging: bool) {
        if dragging && !self.dragging && self.run_from.is_none() {
            self.armed = false;
        }
        self.dragging = dragging;
    }

    /// Arena left: the count and its burst cancelled, nothing armed (the focus effect's cleanup).
    pub fn cancel(&mut self) {
        self.run_from = None;
        self.burst_from = None;
        self.armed = false;
        self.dragging = false;
        self.tick = 0;
        self.beat = false;
    }

    /// The run's seconds at `now`, if one is out.
    pub fn run(&self, now: f64) -> Option<f64> {
        self.run_from.map(|from| ((now - from) / 1000.0).max(0.0))
    }

    /// One frame at `now` with the list `pulled` points down: the ring closing under a finger, the
    /// count's ticks, its beat and its end.
    pub fn step(&mut self, now: f64, pulled: f64, reduced: bool) -> Felt {
        let mut felt = Felt::default();
        if self.dragging && !self.armed && self.run_from.is_none() && pulled >= PULL_TO_REVEAL {
            self.armed = true;
            self.armed_n += 1;
            felt.armed = true;
            self.burst_from = if reduced { None } else { Some(now) };
            self.run_from = Some(now);
            self.tick = 0;
            self.beat = false;
        }
        if let Some(t) = self.run(now) {
            let tick = (t / TICK_S).floor() as i64;
            if tick != self.tick && (1..=COUNTDOWN).contains(&tick) {
                self.tick = tick;
                self.ticks_n += 1;
                felt.tick = tick;
            }
            if t >= HANDS_GONE && !self.beat {
                self.beat = true;
                self.beats_n += 1;
                felt.beat = true;
            }
            if t >= COUNT_SECONDS {
                self.run_from = None;
                if !self.dragging {
                    self.armed = false;
                }
            }
        }
        if self.burst_from.is_some_and(|b| now - b >= BURST_MS) {
            self.burst_from = None;
        }
        felt
    }

    fn burst(&self, now: f64) -> f64 {
        self.burst_from.map_or(0.0, |b| ((now - b) / BURST_MS).clamp(0.0, 1.0))
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    pipeline: wgpu::RenderPipeline,
    uniform: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

#[derive(Default)]
struct ArenaSurface {
    scroll: f32,
    reduced: bool,
    gap_top: f32,
    visible: bool,
    pull: Pull,
    published: (u32, u32, u32),
    publish: Option<String>,
    haptics: Vec<String>,
    light: bool,
    gpu: Option<Gpu>,
    /// The module's threads are joined once the last surface holding one goes (warm.rs).
    _lease: crate::warm::Lease,
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat) -> Gpu {
    let module = device.create_shader_module(shaders::arena::module());
    let layout = device.create_bind_group_layout(&shaders::arena::GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &module, &layout, shaders::arena::entry::VS, shaders::arena::entry::FS, None, "arena");
    let uniform = gfx::uniform(device, "arena", shaders::arena::Floor::SIZE);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("arena"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: shaders::arena::F.binding, resource: uniform.as_entire_binding() }],
    });
    Gpu { format, pipeline, uniform, bind }
}

fn rgb(c: u32) -> [f32; 3] {
    let v = gfx::srgb4(c);
    [v[0], v[1], v[2]]
}

impl Surface for ArenaSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) -> bool {
        self.gpu = None;
        true
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let get = |i: usize, name: &str| inputs.get(i).map(|v| number(v, name)).transpose();
        self.scroll = get(0, "scroll")?.unwrap_or(0.0) as f32;
        let dragging = get(1, "dragging")?.unwrap_or(0.0) > 0.5;
        self.reduced = get(2, "reduced")?.unwrap_or(0.0) > 0.5;
        self.gap_top = get(3, "gapTop")?.unwrap_or(106.0) as f32;
        let visible = get(4, "visible")?.unwrap_or(1.0) > 0.5;
        self.light = get(5, "light")?.unwrap_or(0.0) > 0.5;
        if self.visible && !visible {
            self.pull.cancel();
        }
        self.visible = visible;
        self.pull.drag(dragging && visible);
        Ok(())
    }

    fn published(&mut self) -> Option<String> {
        self.publish.take()
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.haptics)
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
        // Arena in front at launch: its first frame starts Journey's warm-up clock (warm.rs).
        crate::warm::first_frame(device, queue, format, frame.scale);
        let now = frame.now_ms;
        let pulled = (-self.scroll).max(0.0);
        let felt = self.pull.step(now, pulled as f64, self.reduced);
        if felt.beat {
            // beatStorm: the haptic with the dock's beat (the Contract pulses the pill on `beats`).
            self.haptics.extend(STORM_PULSE_FADE.messages());
        }
        let counts = (self.pull.armed_n, self.pull.ticks_n, self.pull.beats_n);
        if counts != self.published {
            self.published = counts;
            self.publish = Some(format!("{{\"armed\":{},\"ticks\":{},\"tick\":{},\"beats\":{}}}", counts.0, counts.1, self.pull.tick, counts.2));
        }

        let light = self.light;
        if self.gpu.as_ref().is_none_or(|g| g.format != format) {
            self.gpu = Some(build(device, format));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let run = self.pull.run(now);
        let count = count_at(run, self.reduced);
        let live = count.live as f32;
        let tint = rgb(if light { PRIMARY_DARK } else { ACCENT });
        let core = rgb(if light { PAGE_SECONDARY_LIGHT } else { PRIMARY_LIGHT });
        let halo = rgb(if light { PAGE_SECONDARY_LIGHT } else { ACCENT });
        let strength = (if light { LIGHT_INK } else { DARK_INK }) * LINE_WEIGHT;
        let pull_share = (pulled as f64 / PULL_TO_REVEAL).min(1.0);
        let ring = pull_share.max(if self.pull.armed { 1.0 } else { 0.0 }).max(if run.is_some() { 1.0 } else { 0.0 });
        let floor = shaders::arena::Floor {
            view: [frame.width, frame.height, frame.scale, if self.reduced { 0.0 } else { self.scroll }],
            tint: [tint[0], tint[1], tint[2], strength * (1.0 + DIAL_LIFT * live)],
            hands: [TAU as f32, TAU as f32, count.second as f32, count.opacity as f32],
            light: [
                if count.opacity > 0.0 { 1.0 } else { 0.0 },
                (if light { FACE_INK } else { FACE_INK_DARK }) * live,
                (if light { CORE_LIGHT } else { CORE }) * live,
                (if light { HALO_LIGHT } else { HALO }) * live,
            ],
            core: [core[0], core[1], core[2], if light { 0.0 } else { HAND_LIFT }],
            halo: [halo[0], halo[1], halo[2], if format.is_srgb() { 1.0 } else { 0.0 }],
            watch: [frame.width / 2.0, self.gap_top + pulled / 2.0, pulled, ring as f32],
            burst: [self.pull.burst(now) as f32, 0.0, 0.0, 0.0],
        };
        let mut bytes = [0u8; shaders::arena::Floor::SIZE];
        floor.write(&mut bytes);
        queue.write_buffer(&gpu.uniform, 0, &bytes);
        gfx::pass(encoder, "arena", target, &gpu.pipeline, &gpu.bind);
        // At rest nothing is redrawn: frames while a count or a burst runs.
        self.pull.run_from.is_some() || self.pull.burst_from.is_some() || self.publish.is_some()
    }
}

/// A new arena surface, for the registry.
pub fn arena() -> Box<dyn Surface> {
    Box::new(ArenaSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_count_runs_its_rn_lengths() {
        // 1.2 + (400 + max(300, 180 + 500)) / 1000 (arena-tab-data.md said 2.08: its sum was wrong).
        assert!((COUNT_SECONDS - 2.28).abs() < 1e-9);
        assert!((HANDS_GONE - 1.9).abs() < 1e-9);
    }

    #[test]
    fn the_ring_closes_only_under_a_finger_past_the_threshold() {
        let mut p = Pull::default();
        assert!(!p.step(0.0, 120.0, false).armed, "no finger: a bounce does not wind it");
        p.drag(true);
        assert!(!p.step(10.0, 109.0, false).armed);
        let f = p.step(20.0, 110.0, false);
        assert!(f.armed && p.armed && p.run_from == Some(20.0));
        assert!(!p.step(30.0, 140.0, false).armed, "once per wind");
    }

    #[test]
    fn the_count_ticks_three_times_beats_once_and_ends() {
        let mut p = Pull::default();
        p.drag(true);
        p.step(0.0, 120.0, false);
        let mut ticks = Vec::new();
        let mut beats = 0;
        let mut t = 0.0;
        while t <= 2400.0 {
            let f = p.step(t, 120.0, false);
            if f.tick > 0 {
                ticks.push((f.tick, t));
            }
            if f.beat {
                beats += 1;
                assert!(t >= 1900.0 && t < 1917.0);
            }
            t += 1000.0 / 60.0;
        }
        assert_eq!(ticks.iter().map(|x| x.0).collect::<Vec<_>>(), vec![1, 2, 3]);
        assert_eq!(beats, 1);
        assert!(p.run_from.is_none());
        assert!(p.armed, "still held: stays armed");
        p.drag(false);
        p.drag(true);
        assert!(!p.armed, "the next drag disarms it");
    }

    #[test]
    fn leaving_cancels_the_count_before_its_beat() {
        let mut p = Pull::default();
        p.drag(true);
        p.step(0.0, 120.0, false);
        p.step(1000.0, 0.0, false);
        p.cancel();
        assert!(!p.step(2000.0, 0.0, false).beat);
        assert_eq!(p.beats_n, 0);
    }

    #[test]
    fn the_second_hand_starts_three_ticks_short_and_lands_on_twelve() {
        let start = count_at(Some(0.0), false);
        assert!((start.second - (TAU - 3.0 / 60.0 * TAU)).abs() < 1e-9);
        assert!(start.opacity == 0.0);
        let end = count_at(Some(LAST_TICK + 0.3), false);
        assert!((end.second - TAU).abs() < 1e-9);
        assert!((end.opacity - 1.0).abs() < 1e-9);
        assert!(count_at(Some(COUNT_SECONDS), false).live < 1e-9);
        assert_eq!(count_at(Some(0.5), true).second, start.second + 1.0 / 60.0 * TAU);
    }
}
