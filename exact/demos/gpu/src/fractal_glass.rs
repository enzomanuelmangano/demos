//! An orange circle dragged behind a pane of reeded glass: per flute a cylindrical lens refracts
//! the sharp circle and its blur (the frosting), with dispersion, a specular line and a groove shadow.
//!
//! - Input 0 is the theme (0 light, 1 dark; +2 for the theme button's fill instance, which draws
//!   the circle's colour in a rounded square). The theme animates over 300 ms in a gamma-2.2 colour space.
//! - Pan on the circle's 200 x 200 box: the drawn circle follows the finger through a spring; a
//!   release carries its velocity on to a rest point kept on screen.
//! - Haptics: one light impact when a finger lands on the circle; nothing else (not the drag,
//!   the pane's edge, the release or the landing).
//! - Untouched and settled, the lights still drift: IDLE_FPS frames a second (`max_fps`), every
//!   frame while a finger, a spring or the theme moves.
//!
//! One full-screen pass, no offscreen target: the circle is evaluated in the shader, its blur is a
//! function of the distance to its centre (`blurred_disc`, integrated once into PROFILE_N values),
//! and what depends on the clock alone is evaluated once a frame, not per pixel.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::{Event, PanGesture};
use motion::{Easing, Spring, SpringConfig, Timing};

use crate::{gfx, shaders};
use shaders::fractal_glass::{entry, module, Uniforms, GROUP_0, PROFILE, SMP, U};

/// The circle's radius, pt.
const RADIUS: f32 = 100.0;
/// The blur's σ, pt.
const SIGMA: f32 = 25.0;
/// The pane's left inset and height, pt; its y and width follow the window.
const PANE_X: f32 = 40.0;
const PANE_HEIGHT: f32 = 300.0;
/// A flute's width in points, about: the pane holds a whole number of them.
const FLUTE: f32 = 17.0;
/// Corner radius of the theme button's fill, pt.
const BUTTON_RADIUS: f32 = 29.0;
/// Background and circle colours per theme: white and orange, black and #78C0E0.
const LIGHT: ([f64; 3], [f64; 3]) = ([255.0, 255.0, 255.0], [255.0, 165.0, 0.0]);
const DARK: ([f64; 3], [f64; 3]) = ([0.0, 0.0, 0.0], [120.0, 192.0, 224.0]);
/// The blurred circle's profile: PROFILE_N alpha values from the centre out to REACH pt
/// (the radius plus four σ, past which the blur is under 1/255).
const PROFILE_N: usize = 256;
const REACH: f32 = RADIUS + 4.0 * SIGMA;

/// The drawn circle chasing the finger (ζ ≈ 0.75).
const FOLLOW: SpringConfig = SpringConfig { stiffness: 520.0, damping: 34.0, mass: 1.0 };
/// The rest point keeps this much of the circle's radius on screen.
const KEEP: f32 = 0.5;
/// The idle clock's period, seconds.
const CLOCK_S: f64 = 60.0;
/// Frames a second while only the lights drift (slow enough that a step is under a quarter grey level).
const IDLE_FPS: u32 = 20;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    surface_struct()
}

fn surface_struct() -> Box<FractalGlass> {
    Box::new(FractalGlass {
        size: (0.0, 0.0),
        theme: None,
        button: false,
        channels: Default::default(),
        center: (180.0, 270.0),
        shown: [Spring::at(180.0), Spring::at(270.0)],
        saved: (0.0, 0.0),
        pan: PanGesture::new(),
        touched: false,
        moving: true,
        posted: Vec::new(),
        canvas: draw2d::Canvas::default(),
        renderer: draw2d::Renderer::default(),
        gpu: None,
    })
}

struct FractalGlass {
    size: (f32, f32),
    theme: Option<bool>,
    /// The theme button's fill instance.
    button: bool,
    /// Background then circle, per channel in linear space (value^2.2).
    channels: [Timing; 6],
    /// Where the finger puts the circle (or, released, where it comes to rest).
    center: (f32, f32),
    /// The circle drawn: x and y, springing to `center`.
    shown: [Spring; 2],
    saved: (f32, f32),
    pan: PanGesture,
    /// A finger holds the circle.
    touched: bool,
    /// A spring or the theme's timing was still running at the last frame.
    moving: bool,
    posted: Vec<String>,
    canvas: draw2d::Canvas,
    renderer: draw2d::Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    /// Fixed for the surface's life: the uniforms, the profile, the sampler.
    bind: wgpu::BindGroup,
}

/// A linear channel as its 8-bit gamma-encoded value.
fn gamma8(linear: f64) -> f64 {
    (linear.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round()
}

/// The error function (Abramowitz-Stegun 7.1.26).
fn erf(x: f64) -> f64 {
    let t = 1.0 / (1.0 + 0.3275911 * x.abs());
    let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * (-x * x).exp();
    y.copysign(x)
}

/// The alpha of a disc of radius `RADIUS` blurred by a Gaussian of σ `SIGMA`, at distance `d`
/// from its centre (decal: nothing beyond the disc).
fn blurred_disc(d: f64) -> f64 {
    let (r, s) = (RADIUS as f64, SIGMA as f64);
    let steps = 512;
    let mut sum = 0.0;
    for k in 0..steps {
        let theta = (k as f64 + 0.5) / steps as f64 * std::f64::consts::PI - std::f64::consts::FRAC_PI_2;
        let (x, l) = (r * theta.sin(), r * theta.cos());
        let g = (-(x - d) * (x - d) / (2.0 * s * s)).exp() / (s * (2.0 * std::f64::consts::PI).sqrt());
        sum += g * erf(l / (s * std::f64::consts::SQRT_2)) * l;
    }
    (sum * std::f64::consts::PI / steps as f64).clamp(0.0, 1.0)
}

/// An f32 in 0..1 as half-float bits (round to nearest; below the smallest normal, 0).
fn half_bits(v: f32) -> u16 {
    let bits = v.clamp(0.0, 1.0).to_bits();
    let exponent = ((bits >> 23) & 0xff) as i32 - 127 + 15;
    if exponent <= 0 {
        return 0;
    }
    (((exponent as u32) << 10) + (bits >> 13 & 0x3ff) + (bits >> 12 & 1)) as u16
}

/// A unit vector.
fn unit(v: [f32; 3]) -> [f32; 3] {
    let n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    v.map(|c| c / n)
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
                // A mid-flight toggle restarts from the colour shown, re-linearised.
                ch.value = (gamma8(ch.value) / 255.0).powf(2.2);
                ch.to(linear, 300.0, Easing::timing_default());
                self.moving = true;
            }
        }
    }

    /// Channel `k` as drawn (0..1, on the 8-bit grid).
    fn channel(&self, k: usize) -> f32 {
        (gamma8(self.channels[k].value) / 255.0) as f32
    }

    /// The circle as drawn.
    fn drawn(&self) -> (f32, f32) {
        (self.shown[0].value as f32, self.shown[1].value as f32)
    }

    fn on_circle(&self, x: f32, y: f32) -> bool {
        let (cx, cy) = self.drawn();
        (x - cx).abs() <= RADIUS && (y - cy).abs() <= RADIUS
    }

    /// A release leaves the circle where the finger put it, kept on screen: no carried velocity.
    fn release(&mut self) {
        let (w, h) = self.size;
        let keep = RADIUS * KEEP;
        let rest = |c: f32, size: f32| if size > 2.0 * keep { c.clamp(keep, size - keep) } else { c };
        self.center = (rest(self.center.0, w), rest(self.center.1, h));
        self.shown[0].retarget(self.center.0 as f64, FOLLOW);
        self.shown[1].retarget(self.center.1 as f64, FOLLOW);
        self.moving = true;
    }
}

impl Surface for FractalGlass {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let v = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        self.button = v >= 1.5;
        let dark = (v % 2.0) > 0.5;
        if self.theme != Some(dark) {
            // The first theme applies at once, with no fade.
            let first = self.theme.is_none();
            self.theme = Some(dark);
            self.retarget(dark, first);
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        // The button's corners are transparent, so never declared opaque.
        false
    }

    fn wants_input(&self) -> bool {
        !self.button
    }

    /// Every frame while a finger, a spring or the theme moves; untouched and settled, the
    /// lights' slow drift at IDLE_FPS. The button's fill only changes with the theme.
    fn max_fps(&self) -> u32 {
        if self.touched || self.moving { 0 } else { IDLE_FPS }
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let hex = |o: usize| (0..3).map(|k| format!("{:02X}", (self.channel(o + k) * 255.0).round() as u8)).collect::<String>();
        Some(format!(
            "{{\"theme\":\"{}\",\"cx\":{:.1},\"cy\":{:.1},\"x\":{:.1},\"y\":{:.1},\"background\":\"#{}\",\"circle\":\"#{}\"}}",
            if self.theme == Some(true) { "dark" } else { "light" },
            self.center.0,
            self.center.1,
            self.shown[0].value,
            self.shown[1].value,
            hex(0),
            hex(3)
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        if self.button {
            return;
        }
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let claim = self.on_circle(x, y);
        let event = self.pan.event(id, gfx::phase(phase), x, y, at_ms, claim);
        match event {
            Event::Begin { .. } => {
                // Caught where it is drawn, mid-flight or not.
                let (cx, cy) = self.drawn();
                self.shown[0].set(cx as f64);
                self.shown[1].set(cy as f64);
                self.center = (cx, cy);
                self.saved = self.center;
                self.touched = true;
                // The finger landed on the circle.
                self.posted.push("haptic:impact-light".into());
            }
            Event::Start(p) | Event::Update(p) => {
                if !self.touched {
                    // A pan with no slop starts without a Begin.
                    self.touched = true;
                    self.posted.push("haptic:impact-light".into());
                }
                self.center = (self.saved.0 + p.translation_x, self.saved.1 + p.translation_y);
                self.shown[0].retarget(self.center.0 as f64, FOLLOW);
                self.shown[1].retarget(self.center.1 as f64, FOLLOW);
            }
            Event::End(p) => {
                self.touched = false;
                self.release();
            }
            Event::Fail | Event::Tap { .. } => self.touched = false,
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
            self.theme = Some(true);
            self.retarget(true, true);
        }
        let mut moving = false;
        for ch in self.channels.iter_mut() {
            moving |= ch.step(frame.now_ms);
        }
        for sp in self.shown.iter_mut() {
            moving |= sp.step(frame.now_ms);
        }
        self.moving = moving;
        let (pw, ph) = frame.pixels();
        let color = [self.channel(3), self.channel(4), self.channel(5)];
        if self.button {
            // The button fill: the whole canvas, continuous corners.
            let (w, h) = self.size;
            self.canvas.begin(frame.scale);
            self.canvas.draw_continuous_rrect(0.0, 0.0, w, h, BUTTON_RADIUS, &draw2d::Paint::fill(draw2d::Color([color[0], color[1], color[2], 1.0])));
            self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
            return moving;
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation));
        }
        let (w, h) = self.size;
        let (cx, cy) = self.drawn();
        let glass = [PANE_X, (h - PANE_HEIGHT) / 2.0, w - PANE_X * 2.0, PANE_HEIGHT];
        let flutes = (glass[2] / FLUTE).round().max(1.0);
        // The lights from the clock (seconds wrapped at CLOCK_S): the second light's Lissajous
        // centre, the swaying key light, the highlight's phase.
        let t = (frame.now_ms / 1000.0).rem_euclid(CLOCK_S);
        let tau = std::f64::consts::TAU;
        let ambient = [
            glass[0] + glass[2] * 0.5 + 0.30 * glass[2] * (tau * t / 20.0 + 0.9).cos() as f32,
            glass[1] + glass[3] * 0.5 + 0.36 * glass[3] * (tau * t / 15.0 + 2.2).sin() as f32,
            (tau * t / 10.0) as f32,
            0.0,
        ];
        let key = unit([-0.55 + 0.22 * (tau * t / 12.0).sin() as f32, -0.25, 1.0]);
        let halfway = unit([key[0], key[1], key[2] + 1.0]);
        let (bg0, bg1, bg2) = (self.channel(0), self.channel(1), self.channel(2));
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            glass,
            background: [bg0, bg1, bg2, bg0 * 0.299 + bg1 * 0.587 + bg2 * 0.114],
            circle: [cx, cy, RADIUS, 0.0],
            colour: [color[0], color[1], color[2], glass[2] / flutes],
            ambient,
            key: [key[0], key[1], key[2], 0.0],
            halfway: [halfway[0], halfway[1], halfway[2], 0.0],
        };
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        draw2d::render::fullscreen_pass(encoder, "fractal glass", target, &gpu.pipeline, &gpu.bind);
        // Always true: the lights drift; `max_fps` paces the host.
        true
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::VS, entry::FS, None, "fractal glass");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fractal glass uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let profile = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("fractal glass profile"),
        size: wgpu::Extent3d { width: PROFILE_N as u32, height: 1, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::R16Float,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let bits: Vec<u8> = (0..PROFILE_N).flat_map(|i| half_bits(blurred_disc(i as f64 * REACH as f64 / (PROFILE_N - 1) as f64) as f32).to_le_bytes()).collect();
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &profile, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &bits,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(2 * PROFILE_N as u32), rows_per_image: Some(1) },
        wgpu::Extent3d { width: PROFILE_N as u32, height: 1, depth_or_array_layers: 1 },
    );
    let view = profile.create_view(&Default::default());
    let sampler = gfx::linear_sampler(device, "fractal glass");
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fractal glass"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: PROFILE.binding, resource: wgpu::BindingResource::TextureView(&view) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};
    use draw2d::blur::{intersect, outset, round_out, GraphitePlan, IRect};

    /// The blur's filter layer in device pixels: the clip outset by 3σ, intersected with the oval's bounds.
    fn filter_layer(clip: IRect, oval: [f32; 4], radius: i32) -> Option<IRect> {
        intersect(outset(clip, radius, radius), round_out(oval))
    }

    /// The pane's device clip bounds: its rect rounded out.
    fn pane_clip(w: f32, h: f32, s: f32) -> IRect {
        let (x, y) = (PANE_X * s, (h - PANE_HEIGHT) / 2.0 * s);
        let (r, b) = ((w - PANE_X) * s, (h + PANE_HEIGHT) / 2.0 * s);
        [x.floor() as i32, y.floor() as i32, r.ceil() as i32, b.ceil() as i32]
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
        // The glass's lights drift: it draws every frame.
        assert!(animating);
        // White above the pane, where the circle is sharp; through the pane it is refracted.
        // The corner stays white.
        assert!(a.at(10, 10)[..3].iter().all(|&c| c >= 245), "{:?}", a.at(10, 10));
        assert_eq!(&a.at(180, 250)[..3], &[255, 165, 0]);
        assert_eq!(&a.at(180, 290)[..3], &[255, 165, 0]);
        let under = a.at(184, 320);
        assert!(under[0] > 200 && under[2] < 120, "{under:?}");
        // Inside the pane past the circle's edge, the frosting still tints (sharp it would be white).
        assert!(a.at(184, 385)[2] < 245, "{:?}", a.at(184, 385));

        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false })
        };
        // A touch off the circle is not its pan.
        finger(&mut s, PointerPhase::Down, 400.0, 800.0, 10.0);
        finger(&mut s, PointerPhase::Move, 380.0, 700.0, 20.0);
        finger(&mut s, PointerPhase::Up, 380.0, 700.0, 30.0);
        assert!(s.agent("{}").unwrap().contains("\"cx\":180.0,\"cy\":270.0"));
        finger(&mut s, PointerPhase::Down, 200.0, 300.0, 40.0);
        finger(&mut s, PointerPhase::Move, 200.0, 400.0, 140.0);
        finger(&mut s, PointerPhase::Move, 220.0, 480.0, 160.0);
        // The pan begins 90 ms after touch-down.
        assert!(s.agent("{}").unwrap().contains("\"cx\":200.0,\"cy\":440.0"), "{}", s.agent("{}").unwrap());
        finger(&mut s, PointerPhase::Up, 220.0, 480.0, 170.0);
        // The release leaves the circle where the finger put it: no carried velocity.
        let rest = s.agent("{}").unwrap();
        let (rx, ry) = (field(&rest, "cx"), field(&rest, "cy"));
        assert!((rx - 200.0).abs() < 0.01 && (ry - 440.0).abs() < 0.01, "{rest}");
        // The drawn circle catches up and settles there.
        let mut ms = 100.0;
        while ms < 2600.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let settled = s.agent("{}").unwrap();
        assert!((field(&settled, "x") - rx).abs() < 0.5 && (field(&settled, "y") - ry).abs() < 0.5, "{settled}");
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        b.save("fractal-glass-moved");

        s.bind(&[Value::Number(1.0)], None).unwrap();
        let end = ms + 1000.0;
        while ms < end {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        c.save("fractal-glass-dark");
        assert!(s.agent("{}").unwrap().ends_with("\"background\":\"#000000\",\"circle\":\"#78C0E0\"}"));
        // Black, a breath of the second light at most.
        assert!(c.at(10, 10)[..3].iter().all(|&v| v <= 12), "{:?}", c.at(10, 10));
    }

    /// A number field of the agent's JSON.
    fn field(json: &str, key: &str) -> f32 {
        let at = json.find(&format!("\"{key}\":")).unwrap() + key.len() + 3;
        json[at..].split(|c| c == ',' || c == '}').next().unwrap().parse().unwrap()
    }

    /// Bilinear read of an 8-bit RGBA image placed at `origin`, transparent outside (decal).
    fn bilinear(img: &[[f64; 4]], w: i32, h: i32, origin: [i32; 2], p: [f64; 2]) -> [f64; 4] {
        let (x, y) = (p[0] - origin[0] as f64 - 0.5, p[1] - origin[1] as f64 - 0.5);
        let (x0, y0) = (x.floor(), y.floor());
        let (fx, fy) = (x - x0, y - y0);
        let at = |i: i32, j: i32| if i < 0 || j < 0 || i >= w || j >= h { [0.0; 4] } else { img[(j * w + i) as usize] };
        let (i, j) = (x0 as i32, y0 as i32);
        let mut out = [0.0; 4];
        for k in 0..4 {
            let top = at(i, j)[k] * (1.0 - fx) + at(i + 1, j)[k] * fx;
            let bottom = at(i, j + 1)[k] * (1.0 - fx) + at(i + 1, j + 1)[k] * fx;
            out[k] = top * (1.0 - fy) + bottom * fy;
        }
        out
    }

    fn q8(v: [f64; 4]) -> [f64; 4] {
        v.map(|c| (c.clamp(0.0, 1.0) * 255.0).round() / 255.0)
    }

    /// CPU reference of Graphite's blur chain, in f64.
    fn reference(center: (f32, f32), w: f32, h: f32, xs: &[(u32, u32)]) -> Vec<f64> {
        let s = 1.0f32;
        let clip = pane_clip(w, h, s);
        let sigma = SIGMA * s;
        let oval = [center.0 - RADIUS, center.1 - RADIUS, center.0 + RADIUS, center.1 + RADIUS];
        let layer = filter_layer(clip, oval, draw2d::blur::ceil_size(3.0 * sigma)).unwrap();
        let plan = GraphitePlan::new(layer, clip, sigma).unwrap();
        let orange = [1.0, 165.0 / 255.0, 0.0];
        // The layer: the circle's coverage within it.
        let side = (layer[2].max(layer[3]) + 2) as u32;
        let cov = crate::atlas_sphere::rrect_coverage(oval, RADIUS, side);
        let (lw, lh) = (layer[2] - layer[0], layer[3] - layer[1]);
        let mut img: Vec<[f64; 4]> = (0..lh)
            .flat_map(|j| (0..lw).map(move |i| (i, j)))
            .map(|(i, j)| {
                let c = cov[((j + layer[1]) as u32 * side + (i + layer[0]) as u32) as usize].unwrap_or(0.0) as f64;
                q8([orange[0] * c, orange[1] * c, orange[2] * c, c])
            })
            .collect();
        let (mut origin, mut iw, mut ih) = ([layer[0], layer[1]], lw, lh);
        for step in &plan.steps {
            let p = step.pixels;
            let (nw, nh) = (p[2] - p[0], p[3] - p[1]);
            let k = [((step.from[2] - step.from[0]) / (step.to[2] - step.to[0])) as f64, ((step.from[3] - step.from[1]) / (step.to[3] - step.to[1])) as f64];
            let next: Vec<[f64; 4]> = (0..nh)
                .flat_map(|j| (0..nw).map(move |i| (i, j)))
                .map(|(i, j)| {
                    let q = [(p[0] + i) as f64 + 0.5, (p[1] + j) as f64 + 0.5];
                    let src = [step.from[0] as f64 + (q[0] - step.to[0] as f64) * k[0], step.from[1] as f64 + (q[1] - step.to[1] as f64) * k[1]];
                    q8(bilinear(&img, iw, ih, origin, src))
                })
                .collect();
            img = next;
            origin = [p[0], p[1]];
            iw = nw;
            ih = nh;
        }
        // The blur on the low-res grid, with the kernel's reach around it.
        let reach = plan.low_radius + 2;
        let gorigin = [origin[0] - reach, origin[1] - reach];
        let (gw, gh) = (iw + 2 * reach, ih + 2 * reach);
        let kernel = plan.linear_kernel();
        let pass = |src: &Vec<[f64; 4]>, so: [i32; 2], sw: i32, sh: i32, dir: [f64; 2]| -> Vec<[f64; 4]> {
            (0..gh)
                .flat_map(|j| (0..gw).map(move |i| (i, j)))
                .map(|(i, j)| {
                    let c = [(gorigin[0] + i) as f64 + 0.5, (gorigin[1] + j) as f64 + 0.5];
                    let mut sum = [0.0; 4];
                    for &(o, wgt) in &kernel {
                        let v = bilinear(src, sw, sh, so, [c[0] + o as f64 * dir[0], c[1] + o as f64 * dir[1]]);
                        for k in 0..4 {
                            sum[k] += wgt as f64 * v[k];
                        }
                    }
                    q8(sum)
                })
                .collect()
        };
        let hpass = pass(&img, origin, iw, ih, [1.0, 0.0]);
        let vpass = pass(&hpass, gorigin, gw, gh, [0.0, 1.0]);
        xs.iter()
            .map(|&(x, y)| {
                let px = [x as f64 + 0.5, y as f64 + 0.5];
                let o = plan.output;
                let mut l1 = [0.0; 4];
                if px[0] >= o[0] as f64 && px[0] < o[2] as f64 && px[1] >= o[1] as f64 && px[1] < o[3] as f64 {
                    let low = plan.to_low([px[0] as f32, px[1] as f32]);
                    l1 = q8(bilinear(&vpass, gw, gh, gorigin, [low[0] as f64, low[1] as f64]));
                }
                l1[3]
            })
            .collect()
    }

    #[test]
    fn the_profile_is_the_graphite_blur() {
        // The profile against the CPU replay of Graphite's chain, for circles whose disc lies
        // within 3σ of the pane (past that Graphite's layer cuts the source and fades the edge).
        let (w, h) = (420.0f32, 912.0f32);
        for (cx, cy) in [(183.3f32, 341.7f32), (140.4, 420.2), (300.0, 250.0)] {
            let points: Vec<(u32, u32)> = (309..603).step_by(3).flat_map(|y| (43..377).step_by(3).map(move |x| (x, y))).collect();
            let want = reference((cx, cy), w, h, &points);
            let (mut worst, mut sum) = (0.0f64, 0.0f64);
            for (&(x, y), w) in points.iter().zip(&want) {
                let d = (((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)) as f64).sqrt();
                // The shader's lookup: linear between the table's values.
                let at = (d / REACH as f64 * (PROFILE_N - 1) as f64).min((PROFILE_N - 1) as f64);
                let (i, f) = (at.floor() as usize, at.fract());
                let value = |i: usize| blurred_disc(i.min(PROFILE_N - 1) as f64 * REACH as f64 / (PROFILE_N - 1) as f64);
                let got = value(i) * (1.0 - f) + value(i + 1) * f;
                let diff = (got - w).abs() * 255.0;
                worst = worst.max(diff);
                sum += diff;
            }
            eprintln!("profile vs the Graphite blur at ({cx}, {cy}): worst {worst:.2}, mean {:.3} of 255", sum / points.len() as f64);
            assert!(worst < 3.5, "{worst}");
        }
    }

    #[test]
    fn the_blurred_disc_has_the_right_shape() {
        // Nearly full at the centre, a little under half at the edge, nothing at the reach.
        assert!(blurred_disc(0.0) > 0.99, "{}", blurred_disc(0.0));
        assert!((blurred_disc(100.0) - 0.45).abs() < 0.05, "{}", blurred_disc(100.0));
        assert!(blurred_disc(REACH as f64) < 1.0 / 255.0, "{}", blurred_disc(REACH as f64));
        let mut last = 1.0;
        for i in 0..PROFILE_N {
            let v = blurred_disc(i as f64 * REACH as f64 / (PROFILE_N - 1) as f64);
            assert!(v <= last + 1e-9, "not monotonic at {i}");
            last = v;
        }
        // Half-float bits round-trip within a half-float's 11 bits.
        for v in [0.0f32, 0.001, 0.25, 0.5, 0.999, 1.0] {
            let b = half_bits(v);
            let back = f32::from_bits(((b as u32 & 0x8000) << 16) | if b & 0x7fff == 0 { 0 } else { (((b as u32 & 0x7c00) >> 10) + 112) << 23 | (b as u32 & 0x3ff) << 13 });
            assert!((back - v).abs() <= v / 1024.0 + 1e-4, "{v} -> {back}");
        }
    }

    /// This thread's CPU time, us.
    #[cfg(target_vendor = "apple")]
    fn cpu_us() -> f64 {
        extern "C" {
            fn clock_gettime_nsec_np(clock: u32) -> u64;
        }
        unsafe { clock_gettime_nsec_np(16) as f64 / 1e3 }
    }
    #[cfg(not(target_vendor = "apple"))]
    fn cpu_us() -> f64 {
        0.0
    }

    /// The frame at the phone's size, at rest and under a drag: CPU time of `render`, its heap
    /// allocations, and the GPU's time from submit to idle.
    /// `cargo test --release -p demos-gpu bench_the_frame -- --ignored --nocapture`
    #[test]
    #[ignore = "a benchmark: run with --release --ignored --nocapture"]
    fn bench_the_frame() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let (w, h, scale) = (402.0f32, 874.0f32, 3.0f32);
        let format = wgpu::TextureFormat::Bgra8UnormSrgb;
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("bench"),
            size: wgpu::Extent3d { width: (w * scale) as u32, height: (h * scale) as u32, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&Default::default());
        let step = 1000.0 / 120.0;
        for dragging in [false, true] {
            let mut s = surface();
            s.size(w, h);
            s.bind(&[Value::Number(0.0)], None).unwrap();
            let (mut cpu, mut gpu_us, mut allocs) = (Vec::new(), Vec::new(), Vec::new());
            let mut animating = 0;
            for i in 0..360usize {
                let ms = 100.0 + i as f64 * step;
                if dragging {
                    let t = i as f32 / 360.0 * std::f32::consts::TAU;
                    let (x, y) = (180.0 + 120.0 * t.sin(), 270.0 + 300.0 * (1.0 - t.cos()) * 0.5);
                    let phase = if i == 0 { PointerPhase::Down } else if i == 359 { PointerPhase::Up } else { PointerPhase::Move };
                    s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false });
                }
                let _ = s.messages();
                let mut encoder = gpu.device.create_command_encoder(&Default::default());
                let t = cpu_us();
                let (more, n) = crate::steddy_graph_interaction::tests::counted(|| {
                    s.render(&Frame { width: w, height: h, scale, now_ms: ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }, &gpu.device, &gpu.queue, &mut encoder, &view, format)
                });
                let dt = cpu_us() - t;
                animating += more as usize;
                let buffer = encoder.finish();
                let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
                let t = std::time::Instant::now();
                gpu.queue.submit([buffer]);
                s.submitted();
                let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
                if i >= 60 {
                    cpu.push(dt);
                    allocs.push(n as f64);
                    gpu_us.push(t.elapsed().as_secs_f64() * 1e6);
                }
            }
            let q = |v: &mut Vec<f64>, p: usize| {
                v.sort_by(|a, b| a.partial_cmp(b).unwrap());
                v[v.len() * p / 100]
            };
            // GPU time per frame: 20 frames in one submission share the submit-to-idle floor.
            if !dragging {
                let mut per = Vec::new();
                for round in 0..40usize {
                    let mut encoder = gpu.device.create_command_encoder(&Default::default());
                    for k in 0..20usize {
                        let ms = 5000.0 + (round * 20 + k) as f64 * step;
                        s.render(&Frame { width: w, height: h, scale, now_ms: ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }, &gpu.device, &gpu.queue, &mut encoder, &view, format);
                    }
                    let buffer = encoder.finish();
                    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
                    let t = std::time::Instant::now();
                    gpu.queue.submit([buffer]);
                    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
                    if round >= 8 {
                        per.push(t.elapsed().as_secs_f64() * 1e6 / 20.0);
                    }
                }
                per.sort_by(|a, b| a.partial_cmp(b).unwrap());
                println!("bench fractal-glass gpu per frame, 20 to a submission: median {:.0} us, best {:.0} us", per[per.len() / 2], per[0]);
            }
            println!(
                "bench fractal-glass {:<5} cpu median {:>7.0} p90 {:>7.0} us | allocs median {:>4.0} | gpu median {:>7.0} p90 {:>7.0} us | asks for a frame {}/360 | max_fps {}",
                if dragging { "drag" } else { "rest" },
                q(&mut cpu, 50),
                q(&mut cpu, 90),
                q(&mut allocs, 50),
                q(&mut gpu_us, 50),
                q(&mut gpu_us, 90),
                animating,
                s.max_fps()
            );
        }
    }

    /// A drag from above the pane down behind it and back out, then a hover across its top edge:
    /// every haptic with its time. `step` is the ms between moves.
    fn haptics_of_a_drag(step: f64) -> Vec<(f64, String)> {
        let mut s = surface_struct();
        s.size = (420.0, 912.0);
        let mut played = Vec::new();
        let mut at = 0.0;
        let mut send = |s: &mut FractalGlass, phase, y: f32, at_ms: f64| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 180.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false });
            played.extend(s.messages().into_iter().map(|m| (at_ms, m)));
        };
        send(&mut s, PointerPhase::Down, 270.0, at);
        at = 100.0;
        for k in 1..=10 {
            at += step;
            send(&mut s, PointerPhase::Move, 270.0 + 10.0 * k as f32, at);
        }
        for k in 1..=10 {
            at += step;
            send(&mut s, PointerPhase::Move, 370.0 - 15.0 * k as f32, at);
        }
        // Hovering across the pane's edge, flapping every 50 ms.
        for k in 0..20 {
            at += 50.0;
            send(&mut s, PointerPhase::Move, if k % 2 == 0 { 330.0 } else { 300.0 }, at);
        }
        // The lift plays nothing, and the circle landing none.
        send(&mut s, PointerPhase::Up, 220.0, at + 50.0);
        for ms in 0..120 {
            s.shown[0].step(at + 50.0 + ms as f64 * 16.0);
            s.shown[1].step(at + 50.0 + ms as f64 * 16.0);
        }
        assert!(s.messages().is_empty());
        played
    }

    #[test]
    fn only_the_finger_landing_plays_a_haptic() {
        for step in [8.0, 16.0, 60.0, 200.0] {
            // Down the pane, out again and hovering over its edge: one light impact, at the
            // landing, and nothing for the drag, the edge, the lift or the settle.
            let played = haptics_of_a_drag(step);
            assert_eq!(played, vec![(0.0, "haptic:impact-light".to_string())], "{step}");
        }
    }

    #[test]
    fn a_tap_on_the_circle_plays_the_landing_only() {
        let mut s = surface_struct();
        s.size = (420.0, 912.0);
        let p = |phase, at_ms| InputEvent::Pointer { id: 1, phase, x: 180.0, y: 270.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&p(PointerPhase::Down, 0.0));
        assert_eq!(s.messages(), vec!["haptic:impact-light".to_string()]);
        s.input(&p(PointerPhase::Up, 60.0));
        assert!(s.messages().is_empty());
        assert!(!s.touched);
        // A finger that lands off the circle plays nothing.
        s.input(&InputEvent::Pointer { id: 2, phase: PointerPhase::Down, x: 20.0, y: 700.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 100.0, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false });
        assert!(s.messages().is_empty());
    }

    #[test]
    fn it_draws_every_frame_while_moving_and_slowly_at_rest() {
        let mut s = surface_struct();
        s.size = (420.0, 912.0);
        s.bind(&[Value::Number(0.0)], None).unwrap();
        // Before the first frame, it has something to draw.
        assert_eq!(s.max_fps(), 0);
        for ms in 0..30 {
            let now = ms as f64 * 8.0;
            s.moving = [s.channels[0].step(now), s.shown[0].step(now), s.shown[1].step(now)].iter().any(|&m| m);
        }
        assert_eq!(s.max_fps(), IDLE_FPS);
        // A finger asks for every frame at once; so does the lift's spring, and the theme.
        let p = |phase, y: f32, at_ms| InputEvent::Pointer { id: 1, phase, x: 180.0, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false };
        s.input(&p(PointerPhase::Down, 270.0, 1000.0));
        assert_eq!(s.max_fps(), 0);
        s.input(&p(PointerPhase::Move, 400.0, 1200.0));
        s.input(&p(PointerPhase::Up, 400.0, 1216.0));
        assert_eq!(s.max_fps(), 0);
        s.touched = false;
        s.moving = false;
        s.bind(&[Value::Number(1.0)], None).unwrap();
        assert_eq!(s.max_fps(), 0);
    }

    #[test]
    fn a_toggle_mid_way_continues_from_the_current_colour() {
        let mut s = *surface_struct();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let step = |s: &mut FractalGlass, ms: f64| {
            for ch in s.channels.iter_mut() {
                ch.step(ms);
            }
        };
        let circle = |s: &FractalGlass| [s.channel(3), s.channel(4), s.channel(5)].map(|c| (c * 255.0).round() as i32);
        step(&mut s, 0.0);
        assert_eq!(circle(&s), [255, 165, 0]);
        // Dark at 0 ms; at 150 ms, half way, back to light.
        s.bind(&[Value::Number(1.0)], None).unwrap();
        step(&mut s, 0.0);
        step(&mut s, 150.0);
        let mid = circle(&s);
        // Half way: each channel mid-point in value^2.2, rounded.
        let half = |a: f64, b: f64| gamma8(((a / 255.0).powf(2.2) + (b / 255.0).powf(2.2)) / 2.0) as i32;
        assert_eq!(mid, [half(255.0, 120.0), half(165.0, 192.0), half(0.0, 224.0)]);
        s.bind(&[Value::Number(0.0)], None).unwrap();
        step(&mut s, 150.0);
        // No jump: the new timing starts at the colour shown.
        assert_eq!(circle(&s), mid);
        step(&mut s, 166.0);
        let next = circle(&s);
        // From the re-read colour toward orange, 16 ms into 300 on inOut(quad).
        let e = { let t = 16.0f64 / 300.0; if t < 0.5 { 2.0 * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(2) / 2.0 } };
        let want = |from: i32, to: f64| gamma8((from as f64 / 255.0).powf(2.2) + ((to / 255.0).powf(2.2) - (from as f64 / 255.0).powf(2.2)) * e) as i32;
        assert_eq!(next, [want(mid[0], 255.0), want(mid[1], 165.0), want(mid[2], 0.0)]);
        // And it lands on orange 300 ms later, not before.
        step(&mut s, 440.0);
        assert_ne!(circle(&s), [255, 165, 0]);
        step(&mut s, 451.0);
        assert_eq!(circle(&s), [255, 165, 0]);
    }

    #[test]
    fn the_button_instance_fills_with_the_circle_colour() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 58.0, height: 58.0, scale: 3.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(2.0)], None).unwrap();
        assert!(!s.wants_input());
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        img.save("fractal-glass-button");
        assert_eq!(img.at(87, 87), [255, 165, 0, 255]);
        // The continuous corner leaves the box's corner empty.
        assert_eq!(img.at(1, 1)[3], 0);
    }
}
