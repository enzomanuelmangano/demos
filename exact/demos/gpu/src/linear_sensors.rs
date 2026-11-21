//! A dark rounded square with the React logo's three ovals, tilting in 3D as the phone tilts.
//! Its shadow moves against the tilt, over a soft glow.
//!
//! - Both tilt angles come from one gravity sensor: the roll is atan2 of its x and −z, and the
//!   z sets the pitch. Each angle is clamped to ±π/8.
//! - The sensor reports the W3C sign, the opposite of CoreMotion's, so its values are negated.
//! - The layers are drawn once per size; a frame is one projected compose pass.

use std::f64::consts::PI;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, SensorKind, Surface, SurfaceError, Value};
use motion::interpolate_clamp;
use draw2d::{point, stops, Canvas, Color, Matrix4, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::linear_sensors::{Compose, GLOW, LAYER as LAYER_TEX, LAYER_BLUR, OVALS, OVALS_BLUR, SMP, U};
use shaders::linear_sensors_inner::{Inner, GRADIENT, SQUARE};

/// Side of the tilting canvas, pt.
const CANVAS: f32 = 500.0;
/// Side of the square, pt.
const SQUARE_SIZE: f32 = 170.0;
/// The part of the canvas kept in textures: a 300 pt window at (100, 100), holding the square,
/// its blurs and the shadow's travel.
const WINDOW: f32 = 100.0;
const SIDE: f32 = 300.0;
/// Logo size in pt, and the oval's width-to-height ratio.
const SIZE: f32 = 60.0;
const OVAL_HEIGHT_RATIO: f32 = 2.5;
const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// m/s² per g: 9.81 for the tilt, 9.80665 for the raw sensor values.
const REANIMATED_G: f64 = 9.81;
const STANDARD_G: f64 = 9.80665;

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(LinearSensors::default())
}

#[derive(Default)]
struct LinearSensors {
    /// Gravity in g, device frame; zero until the first sample.
    gravity: [f64; 3],
    layers: [Canvas; 4],
    renderers: [Renderer; 4],
    /// The gradient square's, the layer's, the ovals', the glow's.
    blurs: [draw2d::Blur; 4],
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32),
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl LinearSensors {
    /// (rotateX, rotateY).
    fn rotation(&self) -> (f64, f64) {
        let [gx, _, gz] = self.gravity;
        let roll = if gx == 0.0 && gz == 0.0 { 0.0 } else { gx.atan2(-gz) };
        let rotate_y = interpolate_clamp(roll, &[-1.0, 0.0, 1.0], &[PI / 8.0, 0.0, -PI / 8.0]);
        let z = gz * REANIMATED_G;
        let rotate_x = interpolate_clamp(z, &[-10.0, -6.0, -1.0], &[-PI / 8.0, 0.0, PI / 8.0]);
        (rotate_x, rotate_y)
    }
}

impl Surface for LinearSensors {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (rx, ry) = self.rotation();
        Some(format!("{{\"rotateX\":{rx:.4},\"rotateY\":{ry:.4}}}"))
    }

    fn input(&mut self, event: &InputEvent) {
        if let InputEvent::Sensor { sensor: SensorKind::Gravity, values, .. } = event {
            // (+ 0.0: a −0.0 would turn atan2 by π.)
            self.gravity = values.map(|v| v as f64 / -STANDARD_G + 0.0)[..3].try_into().unwrap_or([0.0; 3]);
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
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(self.build(device, queue, encoder, format, frame));
        }
        let (rx, ry) = self.rotation();
        let dx = interpolate_clamp(ry, &[-PI / 8.0, 0.0, PI / 8.0], &[10.0, 0.0, -10.0]) as f32;
        let dy = interpolate_clamp(rx, &[-PI / 8.0, 0.0, PI / 8.0], &[7.0, 0.0, 10.0]) as f32;
        let (ox, oy) = ((frame.width - CANVAS) / 2.0, (frame.height - CANVAS) / 2.0);
        let m = Matrix4::translate(ox, oy, 0.0)
            .multiply(
                Matrix4::perspective(200.0)
                    .multiply(Matrix4::rotate_y(ry as f32))
                    .multiply(Matrix4::rotate_x(rx as f32))
                    .pivot(CANVAS / 2.0, CANVAS / 2.0),
            )
            .to_matrix3();
        let r = m.invert().unwrap_or(draw2d::Matrix3([0.0; 9])).rows();
        let gpu = self.gpu.as_ref().unwrap();
        let uniforms = Compose {
            r0: r[0],
            r1: r[1],
            r2: r[2],
            canvas_rect: [ox, oy, CANVAS, CANVAS],
            shadow: [dx, dy, 0.0, 0.0],
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        draw2d::render::fullscreen_pass(encoder, "linear sensors", target, &gpu.compose, &gpu.bind);
        false
    }
}

impl LinearSensors {
    /// The pipelines and everything drawn once: the glow, and the group's plane (the square
    /// layer with its inner shadow, its blur for the drop shadow, the ovals and their blur).
    fn build(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, format: wgpu::TextureFormat, frame: &Frame) -> Gpu {
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let (w, h) = (frame.width, frame.height);
        let side = (SIDE * s).ceil() as u32;
        let target = |label| draw2d::render::sampled_target(device, label, FORMAT, side, side);
        let views = [target("linear sensors square"), target("linear sensors gradient"), target("linear sensors ovals")];
        let glow_source = draw2d::render::sampled_target(device, "linear sensors glow", FORMAT, pw, ph);
        let layer_view = target("linear sensors layer");

        let [square, gradient, ovals, glow] = &mut self.layers;
        let x = CANVAS / 2.0 - SQUARE_SIZE / 2.0;
        square.begin(s);
        square.translate(-WINDOW, -WINDOW);
        square.draw_rrect(x, x, SQUARE_SIZE, SQUARE_SIZE, 35.0, &Paint::fill(Color::hex(0x101010)));
        // The gradient is blurred below.
        gradient.begin(s);
        gradient.translate(-WINDOW, -WINDOW);
        let fill = Shader::Linear { start: point(0.0, 0.0), end: point(0.0, CANVAS / 1.8), stops: stops(&[Color::hex(0x2e2e2e), Color::hex(0x0e0e0e)]) };
        gradient.draw_rrect(x, x, SQUARE_SIZE, SQUARE_SIZE, 35.0, &Paint::shader(fill));
        // The ovals, about the canvas's centre.
        ovals.begin(s);
        ovals.translate(CANVAS / 2.0 - WINDOW, CANVAS / 2.0 - WINDOW);
        let mut b = draw2d::path_builder();
        draw2d::add_oval(&mut b, -SIZE, -SIZE / OVAL_HEIGHT_RATIO, SIZE * 2.0, SIZE / OVAL_HEIGHT_RATIO * 2.0);
        let oval = b.build();
        for angle in [0.0, PI / 3.0, PI * 2.0 / 3.0] {
            ovals.save();
            ovals.rotate(angle as f32);
            ovals.draw_path(&oval, &Paint::stroke(Color::WHITE, 2.0));
            ovals.restore();
        }
        glow.begin(s);
        let radial = Shader::Radial { center: point(w / 2.0, h / 2.0), radius: w / 1.5, stops: stops(&[Color::hex(0x252525), Color::hex(0x000000)]) };
        glow.draw_rect(0.0, 0.0, w, h, &Paint::shader(radial));

        let [r0, r1, r2, r3] = &mut self.renderers;
        let clear = wgpu::Color::TRANSPARENT;
        r0.draw(device, queue, encoder, square, &views[0], FORMAT, side, side, clear);
        r1.draw(device, queue, encoder, gradient, &views[1], FORMAT, side, side, clear);
        r2.draw(device, queue, encoder, ovals, &views[2], FORMAT, side, side, clear);
        r3.draw(device, queue, encoder, glow, &glow_source, FORMAT, pw, ph, clear);

        let [gradient_blur, layer_blur, ovals_blur, glow_blur] = &mut self.blurs;
        let gradient_blurred = gradient_blur.run(device, queue, encoder, &views[1], FORMAT, side, side, 10.0 * s);
        let sampler = draw2d::render::linear_sampler(device);

        // The layer: gradient over square, then the inner shadow.
        let inner_shader = device.create_shader_module(shaders::linear_sensors_inner::module());
        let inner_layout = device.create_bind_group_layout(&shaders::linear_sensors_inner::GROUP_0);
        let inner = draw2d::render::fullscreen_pipeline(device, &inner_shader, &inner_layout, shaders::linear_sensors_inner::entry::INNER, FORMAT, None);
        let inner_uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("linear sensors inner"), size: Inner::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        queue.write_buffer(&inner_uniforms, 0, &Inner { offset: [0.0, 0.8 / SIDE, 0.0, 0.0] }.bytes());
        let inner_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("linear sensors inner"),
            layout: &inner_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: shaders::linear_sensors_inner::U.binding, resource: inner_uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: SQUARE.binding, resource: wgpu::BindingResource::TextureView(&views[0]) },
                wgpu::BindGroupEntry { binding: GRADIENT.binding, resource: wgpu::BindingResource::TextureView(gradient_blurred) },
                wgpu::BindGroupEntry { binding: shaders::linear_sensors_inner::SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        });
        draw2d::render::fullscreen_pass(encoder, "linear sensors inner", &layer_view, &inner, &inner_bind);

        let layer_blurred = layer_blur.run(device, queue, encoder, &layer_view, FORMAT, side, side, 3.5 * s);
        let ovals_blurred = ovals_blur.run(device, queue, encoder, &views[2], FORMAT, side, side, 3.0 * s);
        let glow_blurred = glow_blur.run(device, queue, encoder, &glow_source, FORMAT, pw, ph, 50.0 * s);

        let shader = device.create_shader_module(shaders::linear_sensors::module());
        let layout = device.create_bind_group_layout(&shaders::linear_sensors::GROUP_0);
        let compose = draw2d::render::fullscreen_pipeline(device, &shader, &layout, shaders::linear_sensors::entry::COMPOSE, format, None);
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("linear sensors"), size: Compose::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("linear sensors"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: GLOW.binding, resource: wgpu::BindingResource::TextureView(glow_blurred) },
                wgpu::BindGroupEntry { binding: LAYER_TEX.binding, resource: wgpu::BindingResource::TextureView(&layer_view) },
                wgpu::BindGroupEntry { binding: LAYER_BLUR.binding, resource: wgpu::BindingResource::TextureView(layer_blurred) },
                wgpu::BindGroupEntry { binding: OVALS.binding, resource: wgpu::BindingResource::TextureView(&views[2]) },
                wgpu::BindGroupEntry { binding: OVALS_BLUR.binding, resource: wgpu::BindingResource::TextureView(ovals_blurred) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        });
        Gpu { format, generation: frame.shader_generation, size: (pw, ph), compose, uniforms, bind }
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    /// A gravity sample as the host delivers it: W3C units and sign, +z out of the screen.
    fn gravity_event(x: f32, y: f32, z: f32) -> InputEvent {
        InputEvent::Sensor { sensor: SensorKind::Gravity, values: [x, y, z, 0.0], dropped: 0, at_ms: 0.0 }
    }

    #[test]
    fn the_angles_follow_the_samples_and_ignore_other_sensors() {
        let mut s = LinearSensors::default();
        // No sample yet: the square rests at rotateX π/8, rotateY 0.
        let (rx, ry) = s.rotation();
        assert!((rx - PI / 8.0).abs() < 1e-9 && ry == 0.0, "{rx} {ry}");
        // Face up on a table (W3C: z = +g): rotateX near −π/8 (the range ends at −10 m/s², g is
        // 9.81), no roll.
        s.input(&gravity_event(0.0, 0.0, 9.80665));
        let (rx, ry) = s.rotation();
        assert!((rx + PI / 8.0).abs() < 0.02 && ry.abs() < 1e-9, "{rx} {ry}");
        // Resting angle: 6 m/s² of z is neutral.
        s.input(&gravity_event(0.0, 7.7, 6.0 * STANDARD_G as f32 / REANIMATED_G as f32));
        assert!(s.rotation().0.abs() < 1e-3, "{:?}", s.rotation());
        // Stood upright: rotateX leans the other way, to its end.
        s.input(&gravity_event(0.0, 9.8, 0.0));
        assert!((s.rotation().0 - PI / 8.0).abs() < 1e-6);
        // Rolling the right edge down turns rotateY from 0 toward −π/8, a step at a time.
        let mut last = 0.0;
        for deg in [10.0_f32, 20.0, 30.0, 40.0] {
            let (sin, cos) = deg.to_radians().sin_cos();
            s.input(&gravity_event(-9.80665 * sin, 0.0, 9.80665 * cos));
            let ry = s.rotation().1;
            assert!(ry < last, "{deg}: {ry} after {last}");
            last = ry;
        }
        // Rolling the other way turns it the other way.
        s.input(&gravity_event(9.80665 * 0.5, 0.0, 9.80665 * 0.87));
        assert!(s.rotation().1 > 0.0);
        // Another sensor's samples leave it alone.
        let before = s.rotation();
        s.input(&InputEvent::Sensor { sensor: SensorKind::Accelerometer, values: [5.0, 5.0, 5.0, 0.0], dropped: 0, at_ms: 0.0 });
        assert_eq!(s.rotation(), before);
        // The state the driver reads shows the same angles.
        let state = s.agent("{}").unwrap();
        assert!(state.contains(&format!("\"rotateY\":{:.4}", before.1)), "{state}");
    }

    /// Core Motion's gravity (g, +z out of the screen: face up reads z = -1) for a phone at
    /// `pitch` (top toward the user) and `roll` (right edge down), radians, as the host delivers
    /// it: negated into the W3C's m/s^2.
    fn host_sample(pitch: f64, roll: f64) -> InputEvent {
        let g = [roll.sin() * pitch.cos(), -pitch.sin(), -roll.cos() * pitch.cos()];
        gravity_event(g[0].mul_add(-STANDARD_G, 0.0) as f32, g[1].mul_add(-STANDARD_G, 0.0) as f32, g[2].mul_add(-STANDARD_G, 0.0) as f32)
    }

    #[test]
    fn every_axis_follows_rns_formulas_for_a_phone_at_any_attitude() {
        // RN: rotateY from the attitude's roll (rad) over [-1, 1], rotateX from Reanimated's
        // gravity z (Core Motion's g x 9.81) over [-10, -6, -1].
        let mut s = LinearSensors::default();
        for pitch_deg in [10.0_f64, 30.0, 45.0, 60.0, 75.0] {
            for roll_deg in [-80.0_f64, -57.0, -30.0, -5.0, 0.0, 5.0, 30.0, 57.0, 80.0] {
                let (pitch, roll) = (pitch_deg.to_radians(), roll_deg.to_radians());
                s.input(&host_sample(pitch, roll));
                let want_y = interpolate_clamp(roll, &[-1.0, 0.0, 1.0], &[PI / 8.0, 0.0, -PI / 8.0]);
                let z = -roll.cos() * pitch.cos() * 9.81;
                let want_x = interpolate_clamp(z, &[-10.0, -6.0, -1.0], &[-PI / 8.0, 0.0, PI / 8.0]);
                let (rx, ry) = s.rotation();
                assert!((rx - want_x).abs() < 2e-4 && (ry - want_y).abs() < 2e-4, "pitch {pitch_deg} roll {roll_deg}: ({rx}, {ry}) vs ({want_x}, {want_y})");
            }
        }
        // The signs, one axis at a time, from a reading position (pitch 52 degrees, no roll).
        s.input(&host_sample(52.0_f64.to_radians(), 0.0));
        let level = s.rotation();
        assert!(level.0.abs() < 0.02 && level.1.abs() < 1e-9, "{level:?}");
        // Right edge down: rotateY goes negative; left edge down: positive.
        s.input(&host_sample(52.0_f64.to_radians(), 0.3));
        assert!(s.rotation().1 < -0.1);
        s.input(&host_sample(52.0_f64.to_radians(), -0.3));
        assert!(s.rotation().1 > 0.1);
        // Top toward the user (more upright): rotateX goes positive; laid flat: negative.
        s.input(&host_sample(80.0_f64.to_radians(), 0.0));
        assert!(s.rotation().0 > 0.3);
        s.input(&host_sample(5.0_f64.to_radians(), 0.0));
        assert!(s.rotation().0 < -0.3);
    }

    #[test]
    fn the_square_tilts_with_gravity() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        // Held upright and a little back (the W3C reading: +y up the screen, +z out of it).
        let gravity = |x: f32, y: f32, z: f32| InputEvent::Sensor { sensor: SensorKind::Gravity, values: [x, y, z, 0.0], dropped: 0, at_ms: 0.0 };
        s.input(&gravity(0.0, 7.0, 6.86));
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        held.save("linear-sensors-held");
        assert!(!animating);
        // z = −6.86 × 9.81 / 9.80665: rotateX ≈ −0.084, roll 0.
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"rotateY\":0.0000"), "{state}");
        // The square's middle is dark grey, an oval's ring lighter, the corners near black.
        let mid = held.at(420, 912 + 2 * 70);
        assert!(mid[0] < 40 && mid[3] == 255, "{mid:?}");
        let ring = held.at(420 + 2 * 60, 912);
        assert!(ring[0] > 120, "{ring:?}");
        assert!(held.at(2, 2)[0] < 3);

        // Tilted right (roll > 0): rotateY < 0, and the square's right edge comes forward.
        s.input(&gravity(-8.0, 0.0, 5.0));
        let (tilted, _) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        tilted.save("linear-sensors-tilted");
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"rotateY\":-0.3927"), "{state}");
        assert_ne!(tilted.data, held.data);
    }
}
