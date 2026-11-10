//! Fibonacci Shader Grid (src/animations/fibonacci-shader-grid): on black, a square of the
//! window's width (marginTop 50) runs XorDev's effect (gpu/shaders/fibonacci_shader_grid.wgsl),
//! masked in luminance by a white circle of radius width / 2 under Blur(10). Below it, in the
//! rest of the window less marginBottom 100, the ControlPanel (components/control-panel) sits
//! centred: a pad `round((width − 90) / 10) × 6` square whose x sets N (the number of circles,
//! [5, 175]) and y the multiplier ([1.2, 3.6]), both CLAMP.
//!
//! The pad, as RN's views draw it (Yoga's layout rounded to the device-pixel grid):
//! - styles.container: rgba(255,255,255,0.09) on a continuous radius 24 (the background layer
//!   keeps the borderCurve); its 2 pt rgba(255,255,255,0.4) border is translucent on a view that
//!   does not clip, so RN draws it as its border image, with circular corners.
//! - styles.pointer: absolute at the content box (2, 2), 48 square, white, continuous radius
//!   24, translated to `mapValue − 24` on both axes and scaled about its centre.
//! - The grid view: `width × height` at (2, 2) (overflowing the border by 2), clipping its 36
//!   cells (`height / 6 − 0.7` square, a 1 pt rgba(255,255,255,0.1) Core Animation border,
//!   wrapped six to a row) and its two rgba(255,255,255,0.8) lines (zIndex 10, over the cells):
//!   the vertical one `left width / 2 − 1, top −2, 2 × height`, the horizontal one
//!   `left −1, top height / 2 − 1, (width − 1) × 2`.
//!
//! Motion (the audit):
//! - iTime: withRepeat(withTiming(15, { duration: 20000, easing: linear }), -1, true).
//! - N, magicalMul: on the Pan's onBegin, withSpring(remap(event), { mass 0.5, damping 10,
//!   stiffness 100 }) (ζ 0.707: it overshoots, and the shader reads the overshoot); onUpdate
//!   sets remap(event) at once (cancelling the spring). remap: interpolate(event.x, [0, width],
//!   [minX, maxX], CLAMP), the same for y.
//! - The pointer: translate mapValue(x | y) − 24 (interpolate CLAMP back to [0, width]);
//!   opacity withTiming(isActive ? 0.6 : 1) (300 ms, inOut(quad)); scale withSpring(isActive ?
//!   1.2 : 1) (the default spring). isActive: true on onBegin, false on onFinalize.
//!
//! The GestureDetector wraps the container: RNGH's recognizer gets the touches of the container
//! and of its children (the grid overflowing it by 2, the pointer wherever it is).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate_clamp, Easing, SpringConfig as Config, Spring, Timing, GENTLE};
use skia::{add_continuous_rrect, add_rect, add_rrect, add_rrect_hole, Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::fibonacci_shader_grid::{entry, module, Uniforms, GROUP_0, U};

/// MIN_CIRCLES_AMOUNT, MAX_CIRCLES_AMOUNT (350 / 2).
const MIN_X: f64 = 5.0;
const MAX_X: f64 = 175.0;
/// MIN_MAGICAL_MUL, MAX_MAGICAL_MUL.
const MIN_Y: f64 = 1.2;
const MAX_Y: f64 = 3.6;
/// The square's marginTop.
const TOP: f32 = 50.0;
/// The panel's View: marginBottom.
const BOTTOM: f32 = 100.0;
/// BUTTON_RADIUS.
const R: f32 = 24.0;
/// styles.container borderWidth.
const BORDER: f32 = 2.0;
/// The x / y springs of onBegin.
const PAD_SPRING: Config = Config { stiffness: 100.0, damping: 10.0, mass: 0.5 };

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FibonacciShaderGrid {
        // INITIAL_CIRCLES_AMOUNT, INITIAL_MAGICAL_MUL.
        x: Spring::at((MAX_X + MIN_X) / 2.0),
        y: Spring::at((MAX_Y + MIN_Y) / 2.0),
        opacity: Timing::at(1.0),
        scale: Spring::at(1.0),
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

/// withRepeat(withTiming(15, { duration: 20000, easing: linear }), -1, true).
fn itime(ms: f64) -> f64 {
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        15.0 * c / 20000.0
    } else {
        15.0 - 15.0 * (c - 20000.0) / 20000.0
    }
}

impl FibonacciShaderGrid {
    /// The pad's side: Math.round((SCREEN_WIDTH - 90) / 10) * 6.
    fn side(&self) -> f32 {
        ((self.width - 90.0) / 10.0).round() * 6.0
    }
    /// The container's top-left corner (unrounded, as Yoga computes it).
    fn origin(&self) -> (f32, f32) {
        let s = self.side();
        let below = TOP + self.width;
        let space = self.height - below - BOTTOM;
        ((self.width - s) / 2.0, below + (space - s) / 2.0)
    }
    /// An edge on the device-pixel grid (Yoga's rounding).
    fn snap(&self, v: f32) -> f32 {
        let px = self.px.max(1.0);
        (v * px).round() / px
    }
    /// A box laid out at (x, y, w, h), its edges snapped.
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
    /// mapXvalue / mapYvalue: the pointer's centre in the pad, before its box's (2, 2).
    fn pointer(&self) -> (f32, f32) {
        let s = self.side() as f64;
        (
            interpolate_clamp(self.x.value, &[MIN_X, MAX_X], &[0.0, s]) as f32,
            interpolate_clamp(self.y.value, &[MIN_Y, MAX_Y], &[0.0, s]) as f32,
        )
    }
    /// Whether a touch at (x, y) lands on the container or a child of it.
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
        // The container's background, then its border image (circular corners).
        c.draw_with(&Paint::fill(Color::WHITE.alpha(0.09)), |b| add_continuous_rrect(b, cx, cy, cw, ch, R));
        c.draw_with(&Paint::fill(Color::WHITE.alpha(0.4)), |b| {
            add_rrect(b, cx, cy, cw, ch, R);
            add_rrect_hole(b, cx + BORDER, cy + BORDER, cw - 2.0 * BORDER, ch - 2.0 * BORDER, R - BORDER);
        });
        // The pointer: translate, then scale about its centre.
        c.save();
        c.translate(pl + mx - R + pw / 2.0, pt + my - R + ph / 2.0);
        c.scale(scale, scale);
        c.opacity(opacity);
        c.draw_with(&Paint::fill(Color::WHITE), |b| add_continuous_rrect(b, -pw / 2.0, -ph / 2.0, pw, ph, R));
        c.restore();
        // The grid, clipped to its view.
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
        // event.x / event.y: in the container.
        let (ex, ey) = (x - ox, y - oy);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, hit) {
            Event::Begin { .. } => {
                self.set_active(true);
                let (tx, ty) = (self.remap_x(ex), self.remap_y(ey));
                self.x.to(tx, self.x.velocity, PAD_SPRING);
                self.y.to(ty, self.y.velocity, PAD_SPRING);
            }
            Event::Start(_) | Event::Update(_) => {
                let (tx, ty) = (self.remap_x(ex), self.remap_y(ey));
                self.x.set(tx);
                self.y.set(ty);
            }
            Event::End(_) | Event::Fail => self.set_active(false),
            _ => {}
        }
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
        // iTime runs for ever.
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
        // The pad (W 420, H 912): side round(33) × 6 = 198 at (111, 542).
        // Black above the square and in its corners (outside the mask).
        assert_eq!(&a.at(210, 20)[..3], &[0, 0, 0]);
        assert_eq!(&a.at(3, 53)[..3], &[0, 0, 0]);
        let lit = (50..470).step_by(4).flat_map(|y| (0..420).step_by(4).map(move |x| (x, y))).filter(|&(x, y)| a.at(x, y)[..3].iter().any(|&c| c > 60)).count();
        assert!(lit > 50, "{lit} lit samples");
        // The pointer (white) at the pad's centre: N 90 and 2.4 map to 99, + 2: (212, 643).
        assert_eq!(&a.at(212 - 10, 643 - 10)[..3], &[255, 255, 255]);
        // The vertical line (0.8 white) at x 211..213 near the pad's top, over the cells.
        let v = a.at(212, 548);
        assert!(v[0] > 190 && v[0] < 220, "{v:?}");
        // Outside the pad's corner: black; just inside its left side, the 0.4 border.
        assert_eq!(&a.at(111, 542)[..3], &[0, 0, 0]);
        let b = a.at(112, 643);
        assert!(b[0] > 110 && b[0] < 122, "{b:?}");

        // A touch at the pad's top-left: the springs head for (5, 1.2); a drag sets them at once.
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
        // A touch outside the pad does nothing.
        s.input(&p(exact_gpu::PointerPhase::Down, 50.0, 850.0, 900.0));
        assert!(s.agent("{}").unwrap().contains("\"held\":false"));
    }
}
