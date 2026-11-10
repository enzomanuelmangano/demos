//! Clock Time Picker (src/animations/clock-time-picker: index.tsx, components/clock.tsx,
//! components/time-range.tsx): a 100 pt analog clock beside a scrolling list of times (1:00 pm …
//! 10:30 pm, every 30 minutes); the hands follow the list's scroll offset as it moves.
//!
//! The canvas is the picker container's content: the clock (100², centred in the 120 tall row)
//! at x 0, the 32 gap, the list (100 × 120) at x 132.
//!
//! - Clock (Skia): face circle r 50 #1e1e1e; twelve ticks (#bfbfbf, width 1, from r − 8 to r)
//!   under scale 0.9 about the centre; the hour hand (length 15, #e6e6e6, width 3, round caps)
//!   and the minute hand (32, #d2d2d2, width 2), each with the outer Group's Shadow (black, blur
//!   10, dx dy 0) as its own image filter, then the centre dot (r 3, white) with its own Group's
//!   Shadow (the same, replacing the inherited one: RN Skia's savePaint copies the paint and
//!   materializePaint sets the new filter). The shadows are Graphite blurs of each shape's alpha
//!   on a layer of its fast bounds, clipped to the clock's canvas.
//! - Angles: date = interpolate(contentOffset.y, i × 30, dates[i]) (extended past the ends), plus
//!   the local offset: the wall time as UTC ms, whatever the time zone. hours = ms / 1000 / 60 /
//!   60, angle = hours · 2π / 12; minutes likewise over 60.
//! - List: FlatList width 100, contentContainer paddingVertical 45, items 30 tall, text
//!   format(date, 'h:mm aaa') lowercased, #d8d8d8, Honk-Regular 20, centred (an RN <Text>: UIKit
//!   layout, match_ui_font's GSUB and GPOS kerning). Two expo LinearGradients over it: #111111 →
//!   transparent over the top half, transparent → #111111 over the bottom half.
//! - Scroll: UIScrollView's. The drag is 1:1 (rubber-banded past the ends); at release UIKit
//!   projects the target (velocity · rate / (1 − rate), decelerationRate "fast" 0.99 per ms),
//!   RCTEnhancedScrollView snaps it to snapToOffsets (velocity > 0: the next offset at or past the
//!   target; < 0: the one before; 0: the nearest), clamped to the content; the scroll then
//!   decelerates exponentially at 0.99 per ms onto it. Released past an end, it bounces back.
//!   disableIntervalMomentum has no effect with snapToOffsets.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate, Extrapolation};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{point, stops, Canvas, Color, Font, Paint, PathEvent, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::clock_time_picker::{entry, module, Uniforms, B0, B1, B2, BASE, DOT, GROUP_0, HOUR, MINUTE, SMP, U};

/// The clock's size, the list's x and size, ITEM_HEIGHT, the item count.
const CLOCK: f32 = 100.0;
const CLOCK_Y: f32 = 10.0;
const LIST_X: f32 = 132.0;
const LIST_W: f32 = 100.0;
const LIST_H: f32 = 120.0;
const ITEM: f64 = 30.0;
const ITEMS: usize = 20;
/// Date.UTC(2025, 0, 1, 13, 0): dates[0] as wall time.
const FIRST_MS: f64 = 1_735_736_400_000.0;
const HALF_HOUR_MS: f64 = 1_800_000.0;
/// UIScrollView.DecelerationRate.fast, per ms; the rubber band's constant.
const RATE: f64 = 0.99;
const RUBBER: f64 = 0.55;
/// The bounce back to an end: critically damped at this rate (per ms), as selectable_grid_list.
const BOUNCE_RATE: f64 = 0.0125;
const SHADOW_SIGMA: f32 = 10.0;
static HONK: &[u8] = include_bytes!("../fonts/honk-regular-times-subset.otf");

/// The demo's surface (the canvas is 232 × 120).
pub fn surface() -> Box<dyn Surface> {
    let labels = std::array::from_fn(|i| {
        let h = 13 + i / 2;
        format!("{}:{} pm", h - 12, if i % 2 == 0 { "00" } else { "30" })
    });
    let plan = || GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap();
    Box::new(ClockTimePicker {
        offset: 0.0,
        scroll: Scroll::Idle,
        pan: PanGesture::new(),
        labels,
        font: Font::new(HONK, 20.0).map(Font::with_ui_layout),
        gradients: None,
        list_clip: skia::rect_path(LIST_X, 0.0, LIST_W, LIST_H),
        canvases: Default::default(),
        renderers: Default::default(),
        blurs: Default::default(),
        plans: [plan(), plan(), plan()],
        gpu: None,
    })
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Scroll {
    Idle,
    /// A finger scrolling: its y and the offset when the scroll began.
    Drag { id: u32, y: f64, offset: f64 },
    /// Decelerating onto a snap offset.
    Settle { from: f64, to: f64, at: f64 },
    /// Past an end: back to `edge` from `offset` at `velocity` (points per ms) since `at`.
    Bounce { edge: f64, offset: f64, velocity: f64, at: Option<f64> },
}

struct ClockTimePicker {
    /// contentOffset.y.
    offset: f64,
    scroll: Scroll,
    pan: PanGesture,
    labels: [String; ITEMS],
    font: Option<Font>,
    /// The two gradient overlays' paints.
    gradients: Option<(Paint, Paint)>,
    /// The list's bounds, its clip.
    list_clip: skia::Path,
    /// base (face, ticks, list), hour, minute, dot.
    canvases: [Canvas; 4],
    renderers: [Renderer; 4],
    blurs: [GraphiteBlur; 3],
    plans: [GraphitePlan; 3],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    empty: wgpu::TextureView,
    layers: [wgpu::TextureView; 4],
    bind: Option<([wgpu::TextureView; 3], wgpu::BindGroup)>,
}

/// The furthest offset: 20 items and 2 × 45 padding, less the 120 viewport.
/// `<Line p1 p2 paint>`, as path events (no allocation).
fn line(c: &mut Canvas, x0: f32, y0: f32, x1: f32, y1: f32, paint: &Paint) {
    let (a, b) = (point(x0, y0), point(x1, y1));
    c.draw_path_events([PathEvent::Begin { at: a }, PathEvent::Line { from: a, to: b }, PathEvent::End { last: b, first: a, close: false }], paint);
}

fn max_offset() -> f64 {
    ITEMS as f64 * ITEM + 2.0 * (LIST_H as f64 / 2.0 - ITEM / 2.0) - LIST_H as f64
}

/// RCTEnhancedScrollView's scrollViewWillEndDragging with snapToOffsets (i × 30).
fn snap(offset: f64, target: f64, velocity: f64) -> f64 {
    let max = max_offset();
    let (mut smaller, mut larger) = (0.0f64, max);
    for i in 0..ITEMS {
        let o = i as f64 * ITEM;
        if o <= target && target - o < target - smaller {
            smaller = o;
        }
        if o >= target && o - target < larger - target {
            larger = o;
        }
    }
    let nearest = if target - smaller < larger - target { smaller } else { larger };
    let _ = offset;
    let t = if velocity > 0.0 {
        larger
    } else if velocity < 0.0 {
        smaller
    } else {
        nearest
    };
    t.clamp(0.0, max)
}

/// The wall time the clock shows at a scroll offset (interpolate, extended).
fn date_at(offset: f64) -> f64 {
    let input: [f64; ITEMS] = std::array::from_fn(|i| i as f64 * ITEM);
    let output: [f64; ITEMS] = std::array::from_fn(|i| FIRST_MS + i as f64 * HALF_HOUR_MS);
    interpolate(offset, &input, &output, Extrapolation::Extend)
}

/// The hands' angles (hour, minute), radians clockwise from 12.
fn angles(ms: f64) -> (f64, f64) {
    let hours = ms / 1000.0 / 60.0 / 60.0;
    let minutes = ms / 1000.0 / 60.0;
    ((hours * (std::f64::consts::PI * 2.0)) / 12.0, (minutes * (std::f64::consts::PI * 2.0)) / 60.0)
}

impl ClockTimePicker {
    fn dragged(&self, raw: f64) -> f64 {
        let (max, d) = (max_offset(), LIST_H as f64);
        let band = |x: f64| (1.0 - 1.0 / (x * RUBBER / d + 1.0)) * d;
        if raw < 0.0 {
            -band(-raw)
        } else if raw > max {
            max + band(raw - max)
        } else {
            raw
        }
    }

    fn release(&mut self, finger_velocity: f32) {
        // Scroll velocity, points per ms (the content moves against the finger).
        let v = -(finger_velocity as f64) / 1000.0;
        let max = max_offset();
        if self.offset < 0.0 || self.offset > max {
            let edge = if self.offset < 0.0 { 0.0 } else { max };
            self.scroll = Scroll::Bounce { edge, offset: self.offset, velocity: v, at: None };
            return;
        }
        let projected = self.offset + v * RATE / (1.0 - RATE);
        let to = snap(self.offset, projected, v);
        self.scroll = if (to - self.offset).abs() < 1e-9 { Scroll::Idle } else { Scroll::Settle { from: self.offset, to, at: f64::NAN } };
    }

    fn step(&mut self, now: f64) -> bool {
        match self.scroll {
            Scroll::Settle { from, to, at } => {
                let at = if at.is_nan() { now } else { at };
                let t = now - at;
                let x = to + (from - to) * RATE.powf(t);
                if (x - to).abs() < 0.01 {
                    self.offset = to;
                    self.scroll = Scroll::Idle;
                } else {
                    self.offset = x;
                    self.scroll = Scroll::Settle { from, to, at };
                }
                true
            }
            Scroll::Bounce { edge, offset, velocity, at } => {
                let at = at.unwrap_or(now);
                let t = now - at;
                let (x0, w) = (offset - edge, BOUNCE_RATE);
                let x = (x0 + (velocity + w * x0) * t) * (-w * t).exp();
                if t > 0.0 && x.abs() < 0.01 {
                    self.offset = edge;
                    self.scroll = Scroll::Idle;
                } else {
                    self.offset = edge + x;
                    self.scroll = Scroll::Bounce { edge, offset, velocity, at: Some(at) };
                }
                true
            }
            Scroll::Drag { .. } => true,
            Scroll::Idle => false,
        }
    }

    /// Records the four canvases at this offset.
    fn record(&mut self, s: f32) -> [(f32, f32, f32, f32, f32); 3] {
        let (hour_a, minute_a) = angles(date_at(self.offset));
        let c = CLOCK / 2.0;
        let (ox, oy) = (0.0, CLOCK_Y);
        let hand = |a: f64, len: f32| (ox + c + len * (a.sin() as f32), oy + c - len * (a.cos() as f32));
        let hour_end = hand(hour_a, CLOCK * 0.15);
        let minute_end = hand(minute_a, CLOCK * 0.32);
        let [base, hour, minute, dot] = &mut self.canvases;
        base.begin(s);
        base.draw_circle(ox + c, oy + c, c, &Paint::fill(Color::hex(0x1E1E1E)));
        base.save();
        base.translate(ox + c, oy + c);
        base.scale(0.9, 0.9);
        base.translate(-c, -c);
        let tick = CLOCK * 0.08;
        for i in 0..12 {
            let a = (i as f64 * (std::f64::consts::PI * 2.0)) / 12.0;
            let (sx, sy) = (c + (c - tick) * a.sin() as f32, c - (c - tick) * a.cos() as f32);
            let (ex, ey) = (c + c * a.sin() as f32, c - c * a.cos() as f32);
            line(base, sx, sy, ex, ey, &Paint::stroke(Color::hex(0xBFBFBF), 1.0));
        }
        base.restore();
        // The list, clipped to its bounds (a ScrollView clips), under its two gradients.
        base.save();
        base.clip_path(&self.list_clip);
        if let Some(font) = self.font.as_ref() {
            let lh = gfx::line_height(font);
            let top0 = (LIST_H as f64 / 2.0 - ITEM / 2.0) - self.offset;
            for (i, label) in self.labels.iter().enumerate() {
                let top = top0 + i as f64 * ITEM;
                if top + ITEM < 0.0 || top > LIST_H as f64 {
                    continue;
                }
                let w = font.advance_width(label);
                let y = gfx::baseline(font, top as f32 + (ITEM as f32 - lh) / 2.0);
                base.draw_text(label, LIST_X + (LIST_W - w) / 2.0, y, font, &Paint::fill(Color::view_hex(0xD8D8D8)));
            }
        }
        if let Some((a, b)) = self.gradients.as_ref() {
            base.draw_rect(LIST_X, 0.0, LIST_W, LIST_H, a);
            base.draw_rect(LIST_X, 0.0, LIST_W, LIST_H, b);
        }
        base.restore();
        let round = |p: Paint| p.caps(skia::Cap::Round, skia::Join::Round);
        hour.begin(s);
        line(hour, ox + c, oy + c, hour_end.0, hour_end.1, &round(Paint::stroke(Color::hex(0xE6E6E6), 3.0)));
        minute.begin(s);
        line(minute, ox + c, oy + c, minute_end.0, minute_end.1, &round(Paint::stroke(Color::hex(0xD2D2D2), 2.0)));
        dot.begin(s);
        dot.draw_circle(ox + c, oy + c, 3.0, &Paint::fill(Color::WHITE));
        // Each shape's fast bounds (a round-capped stroke outsets by half its width).
        [
            (ox + c, oy + c, hour_end.0, hour_end.1, 1.5),
            (ox + c, oy + c, minute_end.0, minute_end.1, 1.0),
            (ox + c - 3.0, oy + c - 3.0, ox + c + 3.0, oy + c + 3.0, 0.0),
        ]
    }
}

impl Surface for ClockTimePicker {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let ms = date_at(self.offset);
        let wall = (ms - FIRST_MS) / 60000.0 + 13.0 * 60.0;
        Some(format!("{{\"offset\":{:.2},\"minutes\":{:.1},\"settled\":{}}}", self.offset, wall, self.scroll == Scroll::Idle))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let on_list = (LIST_X..=LIST_X + LIST_W).contains(&x) && (0.0..=LIST_H).contains(&y);
        let phase = gfx::phase(phase);
        if phase == gesture_handler::Phase::Down && on_list && !matches!(self.scroll, Scroll::Drag { .. }) {
            // A finger down catches a moving list where it is.
            self.scroll = Scroll::Idle;
        }
        match self.pan.event(id, phase, x, y, at_ms, on_list) {
            Event::Start(p) => {
                // The drag goes on from the raw offset under the shown one: a list caught past an
                // end is banded once, not twice.
                let (max, d) = (max_offset(), LIST_H as f64);
                let unband = |y: f64| d / RUBBER * (1.0 / (1.0 - y / d) - 1.0);
                let raw = if self.offset < 0.0 {
                    -unband(-self.offset)
                } else if self.offset > max {
                    max + unband(self.offset - max)
                } else {
                    self.offset
                };
                self.scroll = Scroll::Drag { id, y: p.y as f64, offset: raw };
            }
            Event::Update(p) => {
                if let Scroll::Drag { y: y0, offset, .. } = self.scroll {
                    self.offset = self.dragged(offset + (y0 - p.y as f64));
                }
            }
            Event::End(p) => self.release(p.velocity_y),
            // A touch with no drag: UIScrollView leaves a caught list where it stopped (no
            // scrollViewWillEndDragging, so no snap); only one past an end bounces back.
            Event::Fail => {
                if self.offset < 0.0 || self.offset > max_offset() {
                    self.release(0.0);
                }
            }
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
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let moving = self.step(frame.now_ms);
        if self.gradients.is_none() {
            let dark = Color::hex(0x111111);
            let clear = Color::rgba8(0x11, 0x11, 0x11, 0);
            // start (0, 0) → end (0, 0.5) and (0, 0.5) → (0, 1) of the 120 tall view.
            let top = Shader::Linear { start: point(0.0, 0.0), end: point(0.0, LIST_H / 2.0), stops: stops(&[dark, clear]) };
            let bottom = Shader::Linear { start: point(0.0, LIST_H / 2.0), end: point(0.0, LIST_H), stops: stops(&[clear, dark]) };
            self.gradients = Some((Paint::shader(top), Paint::shader(bottom)));
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let bounds = self.record(s);
        let gpu = self.gpu.as_mut().unwrap();
        for i in 0..4 {
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], &gpu.layers[i], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        }
        let clip: IRect = round_out([0.0, CLOCK_Y * s, CLOCK * s, (CLOCK_Y + CLOCK) * s]);
        let mut u = Uniforms { canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)], low0: [0.0; 4], out0: [0.0; 4], low1: [0.0; 4], out1: [0.0; 4], low2: [0.0; 4], out2: [0.0; 4] };
        let mut views = [gpu.empty.clone(), gpu.empty.clone(), gpu.empty.clone()];
        for (k, (x0, y0, x1, y1, o)) in bounds.into_iter().enumerate() {
            let layer = round_out([(x0.min(x1) - o) * s, (y0.min(y1) - o) * s, (x0.max(x1) + o) * s, (y0.max(y1) + o) * s]);
            if !self.plans[k].update(layer, clip, SHADOW_SIGMA * s) {
                continue;
            }
            let out = self.blurs[k].run(device, queue, encoder, Placed { view: &gpu.layers[k + 1], origin: [0, 0], size: [pw, ph] }, &self.plans[k]);
            let low = low_mapping(&self.plans[k], out.origin, out.size);
            let output = self.plans[k].output.map(|v| v as f32);
            match k {
                0 => (u.low0, u.out0) = (low, output),
                1 => (u.low1, u.out1) = (low, output),
                _ => (u.low2, u.out2) = (low, output),
            }
            views[k] = out.view.clone();
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != views) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("clock time picker"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: BASE.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[0]) },
                    wgpu::BindGroupEntry { binding: HOUR.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[1]) },
                    wgpu::BindGroupEntry { binding: MINUTE.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[2]) },
                    wgpu::BindGroupEntry { binding: DOT.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[3]) },
                    wgpu::BindGroupEntry { binding: B0.binding, resource: wgpu::BindingResource::TextureView(&views[0]) },
                    wgpu::BindGroupEntry { binding: B1.binding, resource: wgpu::BindingResource::TextureView(&views[1]) },
                    wgpu::BindGroupEntry { binding: B2.binding, resource: wgpu::BindingResource::TextureView(&views[2]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((views, group));
        }
        skia::render::fullscreen_pass(encoder, "clock time picker", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        moving || self.pan.tracking()
    }
}

fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let target = |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    Gpu {
        format,
        generation,
        pixels,
        compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None),
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("clock time picker"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        empty: skia::render::sampled_target(device, "clock time picker empty", GRAPHITE_FORMAT, 1, 1),
        layers: [target("clock base"), target("clock hour"), target("clock minute"), target("clock dot")],
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn labels_and_times() {
        let s = surface();
        drop(s);
        assert_eq!(max_offset(), 570.0);
        // 13:00 → the hour hand at 1 o'clock (30°), the minute hand at 12.
        let (h, m) = angles(date_at(0.0));
        assert!(((h % std::f64::consts::TAU).to_degrees() - 30.0).abs() < 1e-6);
        assert!(m.cos() > 1.0 - 1e-9, "{m}");
        // Half way between two items: 15 minutes more.
        let (_, m) = angles(date_at(15.0));
        assert!(((m % std::f64::consts::TAU).to_degrees() - 90.0).abs() < 1e-6);
        // Snapping: a slow flick down from 31 lands on 60; no velocity, the nearest.
        assert_eq!(snap(31.0, 40.0, 0.1), 60.0);
        assert_eq!(snap(31.0, 40.0, -0.1), 30.0);
        assert_eq!(snap(44.0, 44.0, 0.0), 30.0);
        assert_eq!(snap(560.0, 900.0, 3.0), 570.0);
    }

    #[test]
    fn a_flick_scrolls_settles_on_an_item_and_turns_the_hands() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 232.0, height: 120.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("clock-time-picker-rest");
        assert!(!animating);
        // The face's #1e1e1e left of centre; the list's middle row has light text pixels.
        let face = rest.at(3 * 20, 3 * 60);
        assert_eq!(&face[..3], &[0x1E, 0x1E, 0x1E]);
        let text = (3 * 132..3 * 232).filter(|&x| (3 * 52..3 * 68).any(|y| rest.at(x, y)[0] > 150)).count();
        assert!(text > 20, "{text}");
        let finger = |s: &mut Box<dyn Surface>, phase, y, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 180.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 100.0, 0.0);
        for i in 1..=8 {
            finger(&mut s, PointerPhase::Move, 100.0 - 8.0 * i as f32, 10.0 * i as f64);
        }
        finger(&mut s, PointerPhase::Up, 36.0, 80.0);
        let mut ms = 80.0;
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (after, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        after.save("clock-time-picker-scrolled");
        assert!(!animating);
        let state = s.agent("{}").unwrap();
        // It settled on an item (a multiple of 30), past where the finger left it.
        let offset: f64 = state.split("\"offset\":").nth(1).unwrap().split(',').next().unwrap().parse().unwrap();
        assert!(offset > 54.0 && (offset / 30.0 - (offset / 30.0).round()).abs() < 1e-6, "{state}");
        assert_ne!(rest.data, after.data);
    }
}
