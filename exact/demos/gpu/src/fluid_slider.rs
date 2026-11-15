//! A blue slider bar with a metaball picker that melts into it, and the value 0 to 100 on the picker.
//!
//! - The picker is raised while a finger slides it, and its goo bridges it back to the bar.
//! - A touch far from the picker springs the picker to the finger, and a drag then carries on from
//!   where the picker is, without a snap. A touch near the picker moves it at once.
//! - Haptics: a light impact at the grab, a selection tick per value step (at most one per 40 ms),
//!   a rigid tap at 0 and 100, and a soft one where a far touch's spring lands.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use pressto::HitSlop;
use reanimated::{interpolate_clamp, Spring, SpringConfig, GENTLE};
use skia::blur::{ceil_size, outset, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT};
use skia::{Canvas, Color, Font, Paint, PathEvent, Renderer};

use crate::{gfx, shaders};
use shaders::fluid_slider::{entry, module, Uniforms, GOO, GROUP_0, SMP, TOP, U};

/// Blur sigma, pt.
const BLUR: f32 = 4.0;

/// Gap between the bar and the picker, pt.
const DISTANCE: f32 = 10.0;
/// Bar colour.
const COLOR: u32 = 0x007AFF;
/// Bar height, pt.
const SLIDER_HEIGHT: f32 = 12.0;
/// Value font size, pt.
const FONT_SIZE: f32 = 12.0;
/// The bar's touch area: 16 pt past it on every side, so the track is 44 pt tall.
const BAR_SLOP: HitSlop = HitSlop::all(16.0);
/// A touch farther than this from the picker springs it there; nearer, the picker jumps to the finger.
const CHASE_FROM: f32 = 20.0;
/// Haptic messages, posted through the host.
const GRAB: &str = "haptic:impact-light";
const TICK: &str = "haptic:selection";
const LIMIT: &str = "haptic:impact-rigid";
/// The value steps between two ticks, and the least time between them, ms.
const TICK_EVERY: i32 = 10;
const TICK_MIN_MS: f64 = 60.0;

/// The ink box of `text` drawn at (0, 0) with its baseline at 0: [left, top, right, bottom].
fn ink_box(font: &Font, text: &str) -> [f32; 4] {
    let mut b = [f32::MAX, f32::MAX, f32::MIN, f32::MIN];
    let mut add = |x: f32, y: f32| {
        b = [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)];
    };
    for e in font.text_path(text, 0.0, 0.0).iter() {
        match e {
            PathEvent::Begin { at } => add(at.x, at.y),
            PathEvent::Line { to, .. } => add(to.x, to.y),
            PathEvent::Quadratic { from, ctrl, to } => {
                for i in 1..=32 {
                    let t = i as f32 / 32.0;
                    let u = 1.0 - t;
                    add(u * u * from.x + 2.0 * u * t * ctrl.x + t * t * to.x, u * u * from.y + 2.0 * u * t * ctrl.y + t * t * to.y);
                }
            }
            PathEvent::Cubic { from, ctrl1, ctrl2, to } => {
                for i in 1..=32 {
                    let t = i as f32 / 32.0;
                    let u = 1.0 - t;
                    let (a, bb, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
                    add(a * from.x + bb * ctrl1.x + c * ctrl2.x + d * to.x, a * from.y + bb * ctrl1.y + c * ctrl2.y + d * to.y);
                }
            }
            PathEvent::End { .. } => {}
        }
    }
    if b[0] > b[2] { [0.0; 4] } else { b }
}
const PICKER_Y: SpringConfig = SpringConfig { stiffness: 200.0, damping: 20.0, mass: 0.8 };
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let mut renderers: [Renderer; 2] = Default::default();
    for r in &mut renderers {
        r.p3 = true;
    }
    Box::new(FluidSlider { font: Font::new(OUTFIT, FONT_SIZE), picker_y: None, renderers, plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(), ..Default::default() })
}

struct FluidSlider {
    /// The canvas, in points.
    size: (f32, f32),
    font: Option<Font>,
    pan: PanGesture,
    /// pickerX, in the RN canvas's points.
    picker_x: f32,
    /// Spring that chases the finger after a far touch, retargeted at every move until it catches up.
    picker: Spring,
    chasing: bool,
    sliding: bool,
    picker_y: Option<Spring>,
    /// The value's text, rebuilt only when it changes.
    label: String,
    label_value: i32,
    /// The label's ink extent, left and right of its pen, and its cap height.
    label_ink: (f32, f32),
    cap: Option<f32>,
    /// Haptics to post, the value last felt and when, and whether it sat at an end.
    posted: Vec<String>,
    felt_value: i32,
    felt_ms: f64,
    at_end: bool,
    layers: [Canvas; 2],
    renderers: [Renderer; 2],
    blur: GraphiteBlur,
    plan: GraphitePlan,
    gpu: Option<Gpu>,
}

impl Default for FluidSlider {
    fn default() -> FluidSlider {
        FluidSlider {
            size: (0.0, 0.0),
            font: None,
            pan: PanGesture::default(),
            picker_x: 0.0,
            picker: Spring::at(0.0),
            chasing: false,
            sliding: false,
            picker_y: None,
            label: String::new(),
            label_value: 0,
            label_ink: (0.0, 0.0),
            cap: None,
            posted: Vec::new(),
            felt_value: 0,
            felt_ms: f64::NEG_INFINITY,
            at_end: false,
            layers: Default::default(),
            renderers: Default::default(),
            blur: GraphiteBlur::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
            gpu: None,
        }
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The goo layer before its blur, and what is drawn over it.
    views: [wgpu::TextureView; 2],
    empty: wgpu::TextureView,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

impl FluidSlider {
    /// Width of the bar.
    fn slider_width(&self) -> f32 {
        self.size.0 * 0.95
    }
    /// Horizontal offset of the canvas.
    fn offset(&self) -> f32 {
        (self.size.0 - self.slider_width()) / 2.0
    }
    /// Picker radius: at most 20 pt.
    fn radius(&self) -> f32 {
        20f32.min((self.size.1 - DISTANCE / 2.0) / 3.0)
    }
    /// Top of the bar, centred vertically.
    fn bar_y(&self) -> f32 {
        self.size.1 / 2.0 - SLIDER_HEIGHT / 2.0 + 1.0
    }
    fn clamped_x(&self) -> f32 {
        self.picker_x.min(self.slider_width() - self.radius()).max(self.radius())
    }
    fn slide(&mut self, sliding: bool) {
        self.sliding = sliding;
        let h = self.size.1 as f64;
        if let Some(y) = self.picker_y.as_mut() {
            // Spring to the slide's target, keeping the running velocity.
            y.retarget(if sliding { h / 2.0 - 25.0 } else { h / 2.0 }, PICKER_Y);
        }
    }
    /// Whether (x, y) takes the bar, including its touch slop.
    fn on_bar(&self, x: f32, y: f32) -> bool {
        BAR_SLOP.contains(0.0, self.bar_y() as f64, self.slider_width() as f64, SLIDER_HEIGHT as f64, x as f64, y as f64)
    }
    /// Advances the chase; true while the picker still springs.
    fn step_chase(&mut self, now_ms: f64) -> bool {
        if !self.chasing {
            return false;
        }
        let running = self.picker.step(now_ms);
        self.picker_x = self.picker.value as f32;
        // Once caught up, the finger leads again.
        if !running || (self.sliding && (self.picker.value - self.picker.target()).abs() < 0.5) {
            self.chasing = false;
        }
        running
    }
    /// The value's haptics at this frame: a tick each time it crosses a multiple of TICK_EVERY, one
    /// rigid tap on reaching an end.
    fn feel(&mut self, value: i32, now_ms: f64) {
        if !(self.sliding || self.chasing) {
            return;
        }
        let end = value <= 0 || value >= 100;
        if end {
            if !self.at_end {
                self.posted.push(LIMIT.into());
            }
        } else if value / TICK_EVERY != self.felt_value / TICK_EVERY && now_ms - self.felt_ms >= TICK_MIN_MS {
            self.posted.push(TICK.into());
            self.felt_ms = now_ms;
        }
        self.at_end = end;
        self.felt_value = value;
    }
    /// The finger is at `x`: the picker moves there, or springs there while it chases.
    fn follow(&mut self, x: f32) {
        if self.chasing {
            self.picker.retarget(x as f64, GENTLE);
        } else {
            self.picker.set(x as f64);
            self.picker_x = x;
        }
    }
}

impl Surface for FluidSlider {
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
        Some(format!("{{\"value\":{},\"sliding\":{}}}", self.label_value, self.sliding))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let x = x - self.offset();
        let hit = self.on_bar(x, y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { x, .. } => {
                let (lo, hi) = (self.radius(), self.slider_width() - self.radius());
                self.chasing = (x.clamp(lo, hi) - self.clamped_x()).abs() > CHASE_FROM;
                if self.chasing {
                    // Start from where the picker shows, not from a finger past the end.
                    self.picker.set(self.clamped_x() as f64);
                }
                self.follow(x);
                self.slide(true);
                self.posted.push(GRAB.into());
                self.felt_value = self.label_value;
                self.at_end = self.label_value <= 0 || self.label_value >= 100;
            }
            Event::Start(p) | Event::Update(p) => self.follow(p.x),
            Event::End(_) | Event::Fail => self.slide(false),
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
        let rest = frame.height as f64 / 2.0;
        let picker_y = self.picker_y.get_or_insert_with(|| Spring::at(rest));
        if !picker_y.running && !self.sliding {
            picker_y.set(rest);
        }
        let moving = picker_y.step(frame.now_ms);
        let py = picker_y.value as f32;
        let chasing = self.step_chase(frame.now_ms);
        let (r, w) = (self.radius(), self.slider_width());
        let x = self.clamped_x();
        let value = interpolate_clamp(x as f64, &[r as f64, (w - r) as f64], &[0.0, 100.0]).round() as i32;
        if value != self.label_value || self.label.is_empty() {
            use std::fmt::Write;
            self.label.clear();
            let _ = write!(self.label, "{value}");
            self.label_value = value;
            if let Some(font) = &self.font {
                let b = ink_box(font, &self.label);
                self.label_ink = (b[0], b[2]);
                // Cap height: the ink top of a flat-topped figure, read once.
                self.cap.get_or_insert_with(|| -ink_box(font, "H")[1]);
            }
        }
        self.feel(value, frame.now_ms);

        let (pw, ph) = frame.pixels();
        let scale = frame.scale;
        let sigma = BLUR * scale;
        let reach = ceil_size(3.0 * sigma);
        let layer = (pw + 2 * reach as u32, ph + 2 * reach as u32);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph), layer));
        }
        let bar_y = self.bar_y();
        let shift = self.offset() * scale;
        let gpu = self.gpu.as_mut().unwrap();
        let color = Paint::fill(Color::hex(COLOR));
        let [goo, top] = &mut self.layers;
        // The layer's texel (0, 0) is the canvas's device pixel (−reach, −reach).
        goo.begin(scale);
        goo.translate(reach as f32 / scale, reach as f32 / scale);
        goo.draw_rrect(0.0, bar_y, w, SLIDER_HEIGHT, 6.0, &color);
        goo.draw_circle(x, py, r, &color);
        top.begin(scale);
        top.draw_circle(x, py, r * 0.8, &Paint::fill(Color::WHITE));
        if let Some(font) = &self.font {
            // The value's ink is centred on the picker, both horizontally and by its cap height.
            let (l, r_ink) = self.label_ink;
            let cap = self.cap.unwrap_or(FONT_SIZE * 0.7);
            top.draw_text(&self.label, x - (l + r_ink) / 2.0, py + cap / 2.0, font, &Paint::fill(Color::BLACK));
        }
        self.renderers[0].draw(device, queue, encoder, goo, &gpu.views[0], GRAPHITE_FORMAT, layer.0, layer.1, wgpu::Color::TRANSPARENT);
        self.renderers[1].draw(device, queue, encoder, top, &gpu.views[1], GRAPHITE_FORMAT, pw, ph, wgpu::Color::TRANSPARENT);
        let mut u = Uniforms {
            // Horizontal offset in device pixels.
            canvas: [pw as f32, ph as f32, gfx::srgb_flag(format), shift],
            low: [0.0; 4],
            out: [0.0; 4],
            layer: [0.0, 50.0, -25.0, 0.0],
        };
        let mut view = gpu.empty.clone();
        let desired = [0, 0, pw as i32, ph as i32];
        if self.plan.update(outset(desired, reach, reach), desired, sigma) {
            let out = self.blur.run(device, queue, encoder, Placed { view: &gpu.views[0], origin: [-reach, -reach], size: [layer.0, layer.1] }, &self.plan);
            u.low = low_mapping(&self.plan, out.origin, out.size);
            u.out = self.plan.output.map(|v| v as f32);
            u.layer[0] = 1.0;
            view = out.view.clone();
        }
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != view) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("fluid slider"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: GOO.binding, resource: wgpu::BindingResource::TextureView(&view) },
                    wgpu::BindGroupEntry { binding: TOP.binding, resource: wgpu::BindingResource::TextureView(&gpu.views[1]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((view, group));
        }
        skia::render::fullscreen_pass(encoder, "fluid slider", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        moving || chasing || self.pan.tracking()
    }
}

/// The blurred image's uv of a canvas pixel: uv = p · xy + zw.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [kx / sw, ky / sh, (low[0] - src[0] * kx - origin[0] as f32) / sw, (low[1] - src[1] * ky - origin[1] as f32) / sh]
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, size: (u32, u32), layer: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let view = |label, (w, h)| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, w, h);
    Gpu {
        format,
        generation,
        size,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("fluid slider"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        sampler: skia::render::linear_sampler(device),
        views: [view("fluid slider goo", layer), view("fluid slider top", size)],
        empty: view("fluid slider empty", (1, 1)),
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;
    use exact_gpu::PointerPhase;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 400.0, height: 100.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    #[test]
    fn the_value_s_ink_is_centred_and_its_cap_height_too() {
        let font = Font::new(OUTFIT, FONT_SIZE).unwrap();
        for text in ["0", "1", "47", "100"] {
            let b = ink_box(&font, text);
            assert!(b[2] > b[0] && b[2] - b[0] < font.measure_text(text).width + 1.0, "{text} {b:?}");
            // Drawn at x − (l + r) / 2, so the ink's middle lands on x.
            let x = 50.0 - (b[0] + b[2]) / 2.0;
            assert!(((x + b[0]) + (x + b[2]) - 100.0).abs() < 1e-4);
        }
        let cap = -ink_box(&font, "H")[1];
        assert!((cap - FONT_SIZE * 0.7).abs() < 1.5, "{cap}");
        // A figure's ink top is the cap height, so baseline py + cap / 2 centres it on py.
        let one = ink_box(&font, "1");
        assert!((-one[1] - cap).abs() < 0.3 && one[3].abs() < 0.3, "{one:?}");
    }

    #[test]
    fn a_grab_ticks_at_tens_and_ends_are_felt_once() {
        let mut s = FluidSlider { size: (400.0, 100.0), picker_y: Some(Spring::at(50.0)), ..Default::default() };
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 30.0, 51.0, 0.0));
        assert_eq!(s.posted, [GRAB]);
        s.posted.clear();
        // Steps inside a tens band play nothing; crossing one plays a tick, paced.
        s.feel(3, 0.0);
        s.feel(9, 16.0);
        assert!(s.posted.is_empty());
        s.feel(10, 100.0);
        s.feel(20, 110.0);
        s.feel(30, 200.0);
        assert_eq!(s.posted, [TICK, TICK]);
        s.posted.clear();
        // An end plays rigid once per visit, whatever the time since.
        s.feel(100, 300.0);
        s.feel(100, 400.0);
        assert_eq!(s.posted, [LIMIT]);
        s.posted.clear();
        // A release plays nothing more, and a chase that lands is silent.
        s.input(&pointer(PointerPhase::Up, 30.0, 51.0, 500.0));
        s.feel(50, 600.0);
        assert!(s.posted.is_empty());
    }

    #[test]
    fn a_touch_far_from_the_picker_springs_it_there_and_a_drag_carries_on() {
        let mut s = FluidSlider { size: (400.0, 100.0), picker_y: Some(Spring::at(50.0)), ..Default::default() };
        let pointer = |phase, x, y, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        // 16 pt below the bar's bottom still takes the touch.
        s.input(&pointer(PointerPhase::Down, 210.0, 72.0, 0.0));
        assert!(s.sliding && s.chasing);
        let mut last = s.clamped_x();
        assert_eq!(last, 20.0);
        let mut ms = 0.0;
        let mut frames = 0;
        while s.step_chase(ms) && s.chasing {
            // No jump: each frame moves part of the way, never past the finger.
            assert!(s.clamped_x() >= last && s.clamped_x() as f64 <= s.picker.target() + 1e-3, "{} after {last}", s.clamped_x());
            assert!(s.clamped_x() - last < 60.0, "a jump of {}", s.clamped_x() - last);
            last = s.clamped_x();
            ms += 16.0;
            frames += 1;
            if frames == 6 {
                // A drag begun with the touch carries on from where the picker is.
                let before = s.clamped_x();
                s.input(&pointer(PointerPhase::Move, 260.0, 51.0, ms));
                assert_eq!(s.clamped_x(), before);
            }
        }
        assert!(frames > 6, "{frames}");
        assert!((s.picker_x - 250.0).abs() < 0.5, "{}", s.picker_x);
        // Caught up: the finger leads again, one to one.
        s.input(&pointer(PointerPhase::Move, 280.0, 51.0, ms));
        assert_eq!(s.picker_x, 270.0);
        // A touch near the picker moves it to the finger at once.
        s.input(&pointer(PointerPhase::Up, 280.0, 51.0, ms));
        s.input(&pointer(PointerPhase::Down, 290.0, 51.0, ms + 500.0));
        assert!(!s.chasing);
        assert_eq!(s.picker_x, 280.0);
        // Far above the bar's slop: nothing.
        s.input(&pointer(PointerPhase::Up, 290.0, 51.0, ms + 600.0));
        s.input(&pointer(PointerPhase::Down, 50.0, 20.0, ms + 900.0));
        assert!(!s.sliding);
    }

    #[test]
    fn the_picker_rises_and_follows_the_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("fluid-slider-rest");
        // At rest: a white disc on the blue bar.
        let blue = |p: [u8; 4]| p[2] > 200 && p[0] < 60 && p[3] > 200;
        assert!(blue(img.at(400, 102)), "bar {:?}", img.at(400, 102));
        assert_eq!(img.at(60 + 26, 100)[..3], [255, 255, 255], "{:?}", img.at(86, 100));
        assert_eq!(img.at(400, 40)[3], 0);
        let pointer = |phase, x, at_ms| InputEvent::Pointer { id: 1, phase, x, y: 51.0, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&pointer(PointerPhase::Down, 200.0, 0.0));
        for i in 1..=10 {
            s.input(&pointer(PointerPhase::Move, 200.0 + 10.0 * i as f32, 16.0 * i as f64));
        }
        let mut ms = 0.0;
        let mut img = img;
        while ms < 1000.0 {
            ms += 16.0;
            img = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().0;
        }
        img.save("fluid-slider-sliding");
        // Sliding: the picker is raised, and the goo bridges it to the bar.
        assert!(blue(img.at(600, 14)), "picker rim {:?}", img.at(600, 14));
        assert_eq!(img.at(576, 50)[..3], [255, 255, 255], "picker disc {:?}", img.at(576, 50));
        assert!(!blue(img.at(100, 50)), "above the bar far from it {:?}", img.at(100, 50));
        assert_eq!(s.agent("{}").unwrap(), "{\"value\":79,\"sliding\":true}");
        s.input(&pointer(PointerPhase::Up, 300.0, 200.0));
        let mut animating = true;
        while animating && ms < 4000.0 {
            ms += 16.0;
            let (i, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            img = i;
            animating = a;
        }
        img.save("fluid-slider-dropped");
        assert!(!animating);
        assert_eq!(img.at(600, 14)[3], 0, "settled back {:?}", img.at(600, 14));
    }
}
