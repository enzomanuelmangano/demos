//! A grid of cells on black, under a glowing fibonacci sphere. A pad below the sphere sets its
//! parameters: x is the number of circles and y the multiplier, both clamped.
//!
//! - The pad's pointer is a white dot that grows while a finger holds it.
//! - Motion: on touch-down the pointer's springs head for the touch's position; a drag sets them
//!   at once. Time sweeps 0 to 15 and back, 20 s each way.
//!
//! Haptics: a light impact when the pan takes the pad (not on a tap); a selection each time the
//! finger crosses into another of the 6 × 6 cells, with a small hysteresis at the cell edges and
//! at most one per 40 ms; a rigid impact each time it leaves the pad, re-armed once it comes back.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Easing, SpringConfig as Config, Spring, Timing, GENTLE};
use skia::{add_continuous_rrect, add_rect, add_rrect, add_rrect_hole, Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::fibonacci_shader_grid::{entry, module, Uniforms, GROUP_0, U};

/// Circle count range.
const MIN_X: f64 = 5.0;
const MAX_X: f64 = 175.0;
/// Multiplier range.
const MIN_Y: f64 = 1.2;
const MAX_Y: f64 = 3.6;
/// Space above the square, pt.
const TOP: f32 = 50.0;
/// Space below the panel, pt.
const BOTTOM: f32 = 100.0;
/// Pointer radius, pt.
const R: f32 = 24.0;
/// Pad border width, pt.
const BORDER: f32 = 2.0;
/// Shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// Cells per side of the grid.
const CELLS: f32 = 6.0;
/// Hysteresis at a cell edge, pt: the felt cell changes only past it.
const SWITCH: f32 = 4.0;
/// How far back inside the pad the finger must go before the off-pad rigid can play again, pt.
const REARM: f32 = 6.0;
const PAD_SPRING: Config = Config { stiffness: 100.0, damping: 10.0, mass: 0.5 };

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FibonacciShaderGrid {
        // Initial circles and multiplier.
        x: Spring::at((MAX_X + MIN_X) / 2.0),
        y: Spring::at((MAX_Y + MIN_Y) / 2.0),
        opacity: Timing::at(1.0),
        scale: Spring::at(1.0),
        haptic_at: f64::NEG_INFINITY,
        ..Default::default()
    })
}

#[derive(Default)]
struct FibonacciShaderGrid {
    x: Spring,
    y: Spring,
    active: bool,
    opacity: Timing,
    scale: Spring,
    pan: PanGesture,
    /// The cell under the finger, and the last selection haptic's time.
    cell: (i32, i32),
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
    start_ms: Option<f64>,
    width: f32,
    height: f32,
    px: f32,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// Shader time: sweeps 0 to 15 and back, 20 s each way.
fn itime(ms: f64) -> f64 {
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        15.0 * c / 20000.0
    } else {
        15.0 - 15.0 * (c - 20000.0) / 20000.0
    }
}

impl FibonacciShaderGrid {
    /// Side of the pad, rounded to a multiple of 6.
    fn side(&self) -> f32 {
        ((self.width - 90.0) / 10.0).round() * 6.0
    }
    /// Top-left corner of the pad.
    fn origin(&self) -> (f32, f32) {
        let s = self.side();
        let below = TOP + self.width;
        let space = self.height - below - BOTTOM;
        ((self.width - s) / 2.0, below + (space - s) / 2.0)
    }
    /// Rounds a coordinate to the device-pixel grid.
    fn snap(&self, v: f32) -> f32 {
        let px = self.px.max(1.0);
        (v * px).round() / px
    }
    /// A box at (x, y, w, h), with its edges snapped to the pixel grid.
    fn rect(&self, x: f32, y: f32, w: f32, h: f32) -> (f32, f32, f32, f32) {
        let (l, t) = (self.snap(x), self.snap(y));
        (l, t, self.snap(x + w) - l, self.snap(y + h) - t)
    }
    fn remap_x(&self, v: f32) -> f64 {
        interpolate_clamp(v as f64, &[0.0, self.side() as f64], &[MIN_X, MAX_X])
    }
    fn remap_y(&self, v: f32) -> f64 {
        interpolate_clamp(v as f64, &[0.0, self.side() as f64], &[MIN_Y, MAX_Y])
    }
    /// The pointer's centre in the pad.
    fn pointer(&self) -> (f32, f32) {
        let s = self.side() as f64;
        (
            interpolate_clamp(self.x.value, &[MIN_X, MAX_X], &[0.0, s]) as f32,
            interpolate_clamp(self.y.value, &[MIN_Y, MAX_Y], &[0.0, s]) as f32,
        )
    }
    /// Whether a touch at (x, y) lands on the pad or its pointer.
    fn hit(&self, x: f32, y: f32) -> bool {
        let (ox, oy) = self.origin();
        let s = self.side();
        let inside = |l: f32, t: f32, w: f32, h: f32| x >= l && x <= l + w && y >= t && y <= t + h;
        let (pcx, pcy) = self.pointer();
        let half = R * self.scale.value as f32;
        inside(ox, oy, s, s)
            || inside(ox + BORDER, oy + BORDER, s, s)
            || inside(ox + BORDER + pcx - half, oy + BORDER + pcy - half, 2.0 * half, 2.0 * half)
    }
    /// The grid cell under (ex, ey), clamped to the pad, and whether the point is off the pad.
    fn cell_at(&self, ex: f32, ey: f32) -> ((i32, i32), bool) {
        let s = self.side();
        let k = |v: f32| (v / (s / CELLS)).floor().clamp(0.0, CELLS - 1.0) as i32;
        ((k(ex), k(ey)), ex < 0.0 || ex > s || ey < 0.0 || ey > s)
    }
    /// The cell the haptics feel at (ex, ey): each axis keeps the current cell until the finger
    /// is SWITCH past its edge.
    fn felt_cell(&self, ex: f32, ey: f32) -> (i32, i32) {
        let cs = self.side() / CELLS;
        let (cell, _) = self.cell_at(ex, ey);
        let hold = |v: f32, c: i32, n: i32| {
            let lo = c as f32 * cs - SWITCH;
            let hi = (c + 1) as f32 * cs + SWITCH;
            if v >= lo && v < hi { c } else { n }
        };
        (hold(ex, self.cell.0, cell.0), hold(ey, self.cell.1, cell.1))
    }
    /// Whether the finger is well inside the pad.
    fn inside(&self, ex: f32, ey: f32) -> bool {
        let s = self.side();
        ex > REARM && ex < s - REARM && ey > REARM && ey < s - REARM
    }
    fn set_active(&mut self, active: bool) {
        if self.active == active {
            return;
        }
        self.active = active;
        let (o, k) = if active { (0.6, 1.2) } else { (1.0, 1.0) };
        self.opacity.to(o, 300.0, Easing::timing_default());
        self.scale.to(k, self.scale.velocity, GENTLE);
    }

    fn draw_pad(&mut self) {
        let s = self.side();
        let (ox, oy) = self.origin();
        let (cx, cy, cw, ch) = self.rect(ox, oy, s, s);
        let (gx, gy, gw, gh) = self.rect(ox + BORDER, oy + BORDER, s, s);
        let (pl, pt, pw, ph) = self.rect(ox + BORDER, oy + BORDER, 2.0 * R, 2.0 * R);
        let (mx, my) = self.pointer();
        let cell = s / 6.0 - 0.7;
        let cells: [(f32, f32, f32, f32); 36] = std::array::from_fn(|k| {
            let (row, col) = ((k / 6) as f32, (k % 6) as f32);
            self.rect(ox + BORDER + col * cell, oy + BORDER + row * cell, cell, cell)
        });
        let vline = self.rect(ox + BORDER + s / 2.0 - 1.0, oy + BORDER - 2.0, 2.0, s);
        let hline = self.rect(ox + BORDER - 1.0, oy + BORDER + s / 2.0 - 1.0, s - 1.0, 2.0);
        let (opacity, scale) = (self.opacity.value as f32, self.scale.value as f32);

        let c = &mut self.canvas;
        // Background, then the border image with circular corners.
        c.draw_with(&Paint::fill(Color::WHITE.alpha(0.09)), |b| add_continuous_rrect(b, cx, cy, cw, ch, R));
        c.draw_with(&Paint::fill(Color::WHITE.alpha(0.4)), |b| {
            add_rrect(b, cx, cy, cw, ch, R);
            add_rrect_hole(b, cx + BORDER, cy + BORDER, cw - 2.0 * BORDER, ch - 2.0 * BORDER, R - BORDER);
        });
        // Pointer: translate, then scale about its centre.
        c.save();
        c.translate(pl + mx - R + pw / 2.0, pt + my - R + ph / 2.0);
        c.scale(scale, scale);
        c.opacity(opacity);
        c.draw_with(&Paint::fill(Color::WHITE), |b| add_continuous_rrect(b, -pw / 2.0, -ph / 2.0, pw, ph, R));
        c.restore();
        // Grid, clipped to the pad.
        c.save();
        c.clip_with(|b| add_rect(b, gx, gy, gw, gh));
        let border = Paint::fill(Color::WHITE.alpha(0.1));
        for &(x, y, w, h) in &cells {
            c.draw_with(&border, |b| {
                add_rect(b, x, y, w, h);
                add_rrect_hole(b, x + 1.0, y + 1.0, w - 2.0, h - 2.0, 0.0);
            });
        }
        let line = Paint::fill(Color::WHITE.alpha(0.8));
        for (x, y, w, h) in [vline, hline] {
            c.draw_rect(x, y, w, h, &line);
        }
        c.restore();
    }
}

impl Surface for FibonacciShaderGrid {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let hit = self.hit(x, y);
        let (ox, oy) = self.origin();
        // Event position relative to the pad.
        let (ex, ey) = (x - ox, y - oy);
        let event = self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit);
        match event {
            Event::Begin { .. } => {
                self.set_active(true);
                let (tx, ty) = (self.remap_x(ex), self.remap_y(ey));
                self.x.to(tx, self.x.velocity, PAD_SPRING);
                self.y.to(ty, self.y.velocity, PAD_SPRING);
                (self.cell, self.past_end) = self.cell_at(ex, ey);
            }
            Event::Start(_) | Event::Update(_) => {
                if matches!(event, Event::Start(_)) {
                    self.posted.push("haptic:impact-light".into());
                }
                let (_, past) = self.cell_at(ex, ey);
                let cell = self.felt_cell(ex, ey);
                if cell != self.cell {
                    self.cell = cell;
                    if at_ms - self.haptic_at >= HAPTIC_GAP_MS {
                        self.posted.push("haptic:selection".into());
                        self.haptic_at = at_ms;
                    }
                }
                if past && !self.past_end {
                    self.posted.push("haptic:impact-rigid".into());
                    self.past_end = true;
                } else if self.inside(ex, ey) {
                    self.past_end = false;
                }
                let (tx, ty) = (self.remap_x(ex), self.remap_y(ey));
                self.x.set(tx);
                self.y.set(ty);
            }
            Event::End(_) | Event::Fail => self.set_active(false),
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"n\":{},\"magicalMul\":{},\"active\":{},\"held\":{}}}",
            self.x.value,
            self.y.value,
            self.active,
            self.pan.tracking()
        ))
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
        self.width = frame.width;
        self.height = frame.height;
        self.px = frame.scale;
        let start = *self.start_ms.get_or_insert(frame.now_ms);
        for spring in [&mut self.x, &mut self.y, &mut self.scale] {
            spring.step(frame.now_ms);
        }
        self.opacity.step(frame.now_ms);
        let (pw, ph) = frame.pixels();

        self.canvas.begin(frame.scale);
        self.draw_pad();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);

        // The shader's square.
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let s = frame.scale;
        let side = frame.width;
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            square: [0.0, TOP, side, 0.0],
            params: [itime(frame.now_ms - start) as f32, self.x.value as f32, self.y.value as f32, 0.0],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let (y0, y1) = ((TOP * s).round().min(ph as f32) as u32, ((TOP + side) * s).round().min(ph as f32) as u32);
        if y1 > y0 {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("fibonacci shader grid"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_scissor_rect(0, y0, pw, y1 - y0);
            pass.set_pipeline(&gpu.pipeline);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..3, 0..1);
        }
        true
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::FS, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fibonacci shader grid"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fibonacci shader grid"),
        layout: &layout,
        entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() }],
    });
    Gpu { format, generation, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    #[test]
    fn the_sphere_glows_and_the_pad_sets_n_and_the_multiplier() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("fibonacci-shader-grid-rest");
        assert!(animating);
        // Black outside the mask.
        assert_eq!(&a.at(210, 20)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(3, 53)[..3], &[0, 0, 0]);
        let lit = (50..470).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit > 50, "{lit} lit samples");
        // The pointer is white at the pad's centre.
        assert_eq!(&a.at(212 - 10, 643 - 10)[..3], &[255, 255, 255]);
        // The vertical line is drawn over the cells.
        let v = a.at(212, 548);
        assert!(v[0] > 190 && v[0] < 220, "{v:?}");
        // Black outside the pad's corner; the border is visible just inside its left side.
        assert_eq!(&a.at(111, 542)[..3], &[0, 0, 0]);
        let b = a.at(112, 643);
        assert!(b[0] > 110 && b[0] < 122, "{b:?}");

        // A touch at the pad's top-left heads for the minimum values.
        let p = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms };
        s.input(&p(exact_gpu::PointerPhase::Down, 111.0, 542.0, 10.0));
        for k in 1..=10 {
            s.input(&p(exact_gpu::PointerPhase::Move, 111.0 + k as f32 * 30.0, 542.0, 10.0 + k as f64 * 16.0));
        }
        let reply = s.agent("{}").unwrap();
        assert!(reply.contains("\"n\":175") && reply.contains("\"magicalMul\":1.2") && reply.contains("\"active\":true"), "{reply}");
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(400.0)).unwrap();
        b.save("fibonacci-shader-grid-dragged");
        assert_ne!(a.data, b.data);
        s.input(&p(exact_gpu::PointerPhase::Up, 411.0, 542.0, 400.0));
        assert!(s.agent("{}").unwrap().contains("\"active\":false"));
        // The grab, the cell crossings paced to one per 40 ms, and one leave of the pad.
        assert_eq!(s.messages(), vec!["haptic:impact-light", "haptic:selection", "haptic:selection", "haptic:impact-rigid"]);
        // A touch outside the pad is ignored.
        s.input(&p(exact_gpu::PointerPhase::Down, 50.0, 850.0, 900.0));
        assert!(s.agent("{}").unwrap().contains("\"held\":false"));
    }
}
