//! Fractal Glass (src/animations/fractal-glass/index.tsx, components/fractal-glass-mask.tsx): an
//! orange circle (r 100) dragged behind a pane of "fluted" glass; through the pane it is
//! blurred and shaded by a 4 × 4 grid of gradient cells.
//!
//! - The pane: x 40, height 300, y = (H − 300) / 2, width = W − 80 (the canvas is the window).
//! - The circle: centre (180, 270) at first; sharp outside the pane; inside it blurred (Blur 25,
//!   decal) and masked (mode "alpha") by each cell's LinearGradient, white → rgba(0,0,0,0.45),
//!   from the cell's top left to its bottom right less 5 pt.
//! - Pan on the circle's box (an Animated.View 200 × 200 at (cx − 100, cy − 100), above the
//!   canvas; its borderRadius and borderCurve draw nothing and don't shape the hit area, which
//!   is the view's rect): onBegin saves the centre; onUpdate centre = saved + translation.
//! - Theme (this surface's input: 0 light, 1 dark; + 2 for the button's instance): the
//!   background withTiming white ↔ black, the circle withTiming orange ↔ #78C0E0 (300 ms,
//!   inOut(quad)), in Reanimated's colour space: each channel value^2.2, back with ^(1/2.2)
//!   and rounded to 8 bits (rgbaArrayToRGBAColor). A toggle mid-way starts the new timing
//!   from the current colour string, re-read: the rounded colour, linearised again.
//! - The theme button's fill (styles.floatingContent: 58 × 58, borderRadius 29, borderCurve
//!   'continuous', backgroundColor circleColor) is this surface's second instance (input + 2),
//!   so its colour is the circle's own timing, frame for frame.
//!
//! How Skia m157 Graphite draws it, reproduced:
//! - Each circle is AnalyticRRectRenderStep (fractal_glass_rrect.wgsl).
//! - `<Blur blur={25}>` is `SkImageFilters::Blur(25, 25, kDecal)`: σ is 25 pt (not a radius;
//!   no ConvertRadiusToSigma), 25 · scale device pixels. The circle is drawn unclipped into
//!   the filter's layer (the clip outset by ⌈3σ⌉, ∩ the oval's bounds, + 1 transparent pixel),
//!   then `FilterResult::blur`: downscaled to σ 4, blurred, drawn back up
//!   (skia::blur::GraphitePlan / GraphiteBlur).
//! - The rest (mask, dstIn, the background) is fractal_glass.wgsl.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{Easing, Timing};
use skia::blur::{intersect, outset, round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};

use crate::{gfx, shaders};
use shaders::fractal_glass::{entry, module, Uniforms, BLURRED, GROUP_0, SHARP, SMP, U};
use shaders::fractal_glass_rrect as rrect;

/// CircleRadius.
const RADIUS: f32 = 100.0;
/// `<Blur blur={25}>`: σ in points.
const SIGMA: f32 = 25.0;
/// The pane: x, height (y and width follow the window).
const PANE_X: f32 = 40.0;
const PANE_HEIGHT: f32 = 300.0;
/// styles.floatingContent's borderRadius.
const BUTTON_RADIUS: f32 = 29.0;
/// 'white' / 'black' and 'orange' / '#78C0E0'.
const LIGHT: ([f64; 3], [f64; 3]) = ([255.0, 255.0, 255.0], [255.0, 165.0, 0.0]);
const DARK: ([f64; 3], [f64; 3]) = ([0.0, 0.0, 0.0], [120.0, 192.0, 224.0]);
/// The filter layer's transparent margin here (Skia pads 1; past it is decal, transparent).
const LAYER_MARGIN: i32 = 4;

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
        saved: (0.0, 0.0),
        pan: PanGesture::new(),
        blur: GraphiteBlur::default(),
        canvas: skia::Canvas::default(),
        renderer: skia::Renderer::default(),
        gpu: None,
    })
}

struct FractalGlass {
    size: (f32, f32),
    theme: Option<bool>,
    /// The theme button's fill instance.
    button: bool,
    /// Background then circle, per channel in Reanimated's linear space (value^2.2).
    channels: [Timing; 6],
    center: (f32, f32),
    saved: (f32, f32),
    pan: PanGesture,
    blur: GraphiteBlur,
    canvas: skia::Canvas,
    renderer: skia::Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    mesh: wgpu::RenderPipeline,
    mesh_layout: wgpu::BindGroupLayout,
    /// The two circles' mesh uniforms: the sharp one, the filter layer's.
    mesh_uniforms: [wgpu::Buffer; 2],
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    /// The canvas-sized surface of the sharp circle and its depth.
    sharp: Option<((u32, u32), wgpu::TextureView, wgpu::TextureView)>,
    /// The filter layer and its depth.
    layer: Option<((u32, u32), wgpu::TextureView, wgpu::TextureView)>,
    /// An empty texture for a frame with no blur.
    empty: wgpu::TextureView,
}

/// rgbaArrayToRGBAColor ∘ toGammaSpace: a linear channel as the 8-bit value the colour
/// string holds.
fn gamma8(linear: f64) -> f64 {
    (linear.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round()
}

/// The filter layer: the device clip outset by ⌈3σ⌉ (SkBlurImageFilter's input bounds) ∩ the
/// oval's bounds rounded out (the draw's content bounds), in device pixels.
fn filter_layer(clip: IRect, oval: [f32; 4], radius: i32) -> Option<IRect> {
    intersect(outset(clip, radius, radius), round_out(oval))
}

/// The pane's device clip bounds: its rect rounded out.
fn pane_clip(w: f32, h: f32, s: f32) -> IRect {
    let (x, y) = (PANE_X * s, (h - PANE_HEIGHT) / 2.0 * s);
    let (r, b) = ((w - PANE_X) * s, (h + PANE_HEIGHT) / 2.0 * s);
    [x.floor() as i32, y.floor() as i32, r.ceil() as i32, b.ceil() as i32]
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
                // colorOnStart: from the current colour string, re-linearised.
                ch.value = (gamma8(ch.value) / 255.0).powf(2.2);
                ch.to(linear, 300.0, Easing::timing_default());
            }
        }
    }

    /// Channel `k` as drawn (0…1, 8-bit values).
    fn channel(&self, k: usize) -> f32 {
        (gamma8(self.channels[k].value) / 255.0) as f32
    }

    fn on_circle(&self, x: f32, y: f32) -> bool {
        (x - self.center.0).abs() <= RADIUS && (y - self.center.1).abs() <= RADIUS
    }
}

impl Surface for FractalGlass {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let v = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        self.button = v >= 1.5;
        let dark = (v % 2.0) > 0.5;
        if self.theme != Some(dark) {
            // A derived withTiming starts where it is going.
            let first = self.theme.is_none();
            self.theme = Some(dark);
            self.retarget(dark, first);
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        // Not known before the first bind, and the button's corners are transparent: never
        // declared opaque (the main instance writes alpha 1 everywhere anyway).
        false
    }

    fn wants_input(&self) -> bool {
        !self.button
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let hex = |o: usize| (0..3).map(|k| format!("{:02X}", (self.channel(o + k) * 255.0).round() as u8)).collect::<String>();
        Some(format!(
            "{{\"theme\":\"{}\",\"cx\":{:.1},\"cy\":{:.1},\"background\":\"#{}\",\"circle\":\"#{}\"}}",
            if self.theme == Some(true) { "dark" } else { "light" },
            self.center.0,
            self.center.1,
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
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, claim) {
            Event::Begin { .. } => self.saved = self.center,
            Event::Start(p) | Event::Update(p) => self.center = (self.saved.0 + p.translation_x, self.saved.1 + p.translation_y),
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
            self.theme = Some(false);
            self.retarget(false, true);
        }
        let mut moving = false;
        for ch in self.channels.iter_mut() {
            moving |= ch.step(frame.now_ms);
        }
        let (pw, ph) = frame.pixels();
        let color = [self.channel(3), self.channel(4), self.channel(5)];
        if self.button {
            // styles.floatingContent: the whole canvas, radius 29, continuous corners.
            let (w, h) = self.size;
            self.canvas.begin(frame.scale);
            self.canvas.draw_continuous_rrect(0.0, 0.0, w, h, BUTTON_RADIUS, &skia::Paint::fill(skia::Color([color[0], color[1], color[2], 1.0])));
            self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
            return moving;
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let (w, h) = self.size;
        let s = frame.scale;
        let background = [self.channel(0), self.channel(1), self.channel(2), 1.0];
        let gpu = self.gpu.as_mut().unwrap();
        let (cx, cy) = self.center;
        let oval = [(cx - RADIUS) * s, (cy - RADIUS) * s, (cx + RADIUS) * s, (cy + RADIUS) * s];
        let mesh = |target: [f32; 4]| {
            let mut m = rrect::Mesh::default();
            m.ltrb = [cx - RADIUS, cy - RADIUS, cx + RADIUS, cy + RADIUS];
            // localAARadius 1/s; opposite insets intersect when 2 · aa ≥ size − radius.
            let aa = 1.0 / s;
            m.shape = [RADIUS, s, if 2.0 * aa >= RADIUS { -1.0 } else { aa }, 0.0];
            m.surface = target;
            m.color = [color[0], color[1], color[2], 1.0];
            m.bytes()
        };
        // The sharp circle, on a canvas-sized surface.
        ensure(&mut gpu.sharp, device, "fractal glass sharp", (pw, ph));
        queue.write_buffer(&gpu.mesh_uniforms[0], 0, &mesh([0.0, 0.0, pw as f32, ph as f32]));
        draw_mesh(encoder, device, gpu, 0, (pw, ph), None);
        // The blur.
        let clip = pane_clip(w, h, s);
        let sigma = SIGMA * s;
        let radius = skia::blur::ceil_size(3.0 * sigma);
        let plan = filter_layer(clip, oval, radius).and_then(|layer| GraphitePlan::new(layer, clip, sigma).map(|p| (layer, p)));
        let mut uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            glass: [PANE_X, (h - PANE_HEIGHT) / 2.0, w - PANE_X * 2.0, PANE_HEIGHT],
            background,
            low: [0.0; 4],
            output: [0.0; 4],
        };
        let blurred = if let Some((layer, plan)) = plan {
            let origin = [layer[0] - LAYER_MARGIN, layer[1] - LAYER_MARGIN];
            let size = ((layer[2] - layer[0] + 2 * LAYER_MARGIN) as u32, (layer[3] - layer[1] + 2 * LAYER_MARGIN) as u32);
            ensure(&mut gpu.layer, device, "fractal glass layer", size);
            queue.write_buffer(&gpu.mesh_uniforms[1], 0, &mesh([origin[0] as f32, origin[1] as f32, size.0 as f32, size.1 as f32]));
            // Only the layer's pixels exist (the padding stays transparent).
            draw_mesh(encoder, device, gpu, 1, size, Some([LAYER_MARGIN as u32, LAYER_MARGIN as u32, (layer[2] - layer[0]) as u32, (layer[3] - layer[1]) as u32]));
            let source = Placed { view: &gpu.layer.as_ref().unwrap().1, origin, size: [size.0, size.1] };
            let out = self.blur.run(device, queue, encoder, source, &plan);
            // uv = (to_low(p) − origin) / size, to_low(p) = low.l + (p − src.l) · k.
            let src = plan.src_rect.map(|v| v as f32);
            let low = plan.low_bounds;
            let kx = (low[2] - low[0]) / (src[2] - src[0]);
            let ky = (low[3] - low[1]) / (src[3] - src[1]);
            let (sw, sh) = (out.size[0] as f32, out.size[1] as f32);
            uniforms.low = [kx / sw, ky / sh, (low[0] - src[0] * kx - out.origin[0] as f32) / sw, (low[1] - src[1] * ky - out.origin[1] as f32) / sh];
            uniforms.output = plan.output.map(|v| v as f32);
            Some(out.view)
        } else {
            None
        };
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("fractal glass"),
            layout: &gpu.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                wgpu::BindGroupEntry { binding: SHARP.binding, resource: wgpu::BindingResource::TextureView(&gpu.sharp.as_ref().unwrap().1) },
                wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred.unwrap_or(&gpu.empty)) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        skia::render::fullscreen_pass(encoder, "fractal glass", target, &gpu.pipeline, &bind);
        moving || self.pan.tracking()
    }
}

/// A Graphite surface of `size` and its depth, kept while the size holds.
fn ensure(slot: &mut Option<((u32, u32), wgpu::TextureView, wgpu::TextureView)>, device: &wgpu::Device, label: &str, size: (u32, u32)) {
    if slot.as_ref().map(|s| s.0) != Some(size) {
        let color = skia::render::sampled_target(device, label, GRAPHITE_FORMAT, size.0, size.1);
        let depth = device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d { width: size.0.max(1), height: size.1.max(1), depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Depth32Float,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&Default::default());
        *slot = Some((size, color, depth));
    }
}

/// One AnalyticRRect instance (`which`: 0 the sharp surface, 1 the filter layer), cleared
/// first, scissored to `scissor` (x, y, w, h).
fn draw_mesh(encoder: &mut wgpu::CommandEncoder, device: &wgpu::Device, gpu: &Gpu, which: usize, size: (u32, u32), scissor: Option<[u32; 4]>) {
    let (_, color, depth) = if which == 0 { gpu.sharp.as_ref().unwrap() } else { gpu.layer.as_ref().unwrap() };
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fractal glass circle"),
        layout: &gpu.mesh_layout,
        entries: &[wgpu::BindGroupEntry { binding: rrect::M.binding, resource: gpu.mesh_uniforms[which].as_entire_binding() }],
    });
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("fractal glass circle"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: color,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
        })],
        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
            view: depth,
            depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
            stencil_ops: None,
        }),
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    if let Some([x, y, w, h]) = scissor {
        pass.set_scissor_rect(x, y, w.min(size.0 - x), h.min(size.1 - y));
    }
    pass.set_pipeline(&gpu.mesh);
    pass.set_bind_group(0, &bind, &[]);
    pass.draw(0..69, 0..1);
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::VS, entry::FS, None, "fractal glass");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fractal glass uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let mesh_shader = device.create_shader_module(rrect::module());
    let mesh_layout = device.create_bind_group_layout(&rrect::GROUP_0);
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("fractal glass circle"), bind_group_layouts: &[Some(&mesh_layout)], immediate_size: 0 });
    let mesh = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("fractal glass circle"),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module: &mesh_shader, entry_point: Some(rrect::entry::RRECT_VS), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &mesh_shader,
            entry_point: Some(rrect::entry::RRECT_FS),
            // src-over onto the cleared surface; each pixel is written once (the depth test).
            targets: &[Some(wgpu::ColorTargetState { format: GRAPHITE_FORMAT, blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, cull_mode: None, ..Default::default() },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let buffer = || device.create_buffer(&wgpu::BufferDescriptor { label: Some("fractal glass circle"), size: rrect::Mesh::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let empty = skia::render::sampled_target(device, "fractal glass empty", GRAPHITE_FORMAT, 1, 1);
    Gpu {
        format,
        generation,
        pipeline,
        uniforms,
        mesh,
        mesh_layout,
        mesh_uniforms: [buffer(), buffer()],
        layout,
        sampler: gfx::linear_sampler(device, "fractal glass"),
        sharp: None,
        layer: None,
        empty,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

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
        assert!(!animating);
        // White; the circle sharp orange above the pane (y 306); blurred and paler under it.
        assert_eq!(&a.at(10, 10)[..3], &[255, 255, 255]);
        assert_eq!(&a.at(180, 250)[..3], &[255, 165, 0]);
        assert_eq!(&a.at(180, 290)[..3], &[255, 165, 0]);
        let under = a.at(180, 320);
        assert!(under[2] > 20 && under[2] < 200, "{under:?}");
        // Inside the pane past the circle's edge, the blur still tints (sharp it would be white).
        assert!(a.at(180, 385)[2] < 250, "{:?}", a.at(180, 385));

        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // A touch off the circle is not its pan.
        finger(&mut s, PointerPhase::Down, 400.0, 800.0, 10.0);
        finger(&mut s, PointerPhase::Move, 380.0, 700.0, 20.0);
        finger(&mut s, PointerPhase::Up, 380.0, 700.0, 30.0);
        assert!(s.agent("{}").unwrap().contains("\"cx\":180.0,\"cy\":270.0"));
        finger(&mut s, PointerPhase::Down, 200.0, 300.0, 40.0);
        finger(&mut s, PointerPhase::Move, 200.0, 400.0, 140.0);
        finger(&mut s, PointerPhase::Move, 220.0, 480.0, 160.0);
        finger(&mut s, PointerPhase::Up, 220.0, 480.0, 170.0);
        // RNGH on iOS leaves UIKit's 10 pt hysteresis (along the set-off, down) out of a pan that
        // begins 90 ms or more after touch-down: (20, 170).
        assert!(s.agent("{}").unwrap().contains("\"cx\":200.0,\"cy\":440.0"), "{}", s.agent("{}").unwrap());
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(100.0)).unwrap();
        b.save("fractal-glass-moved");
        // Wholly behind the pane: no sharp orange anywhere.
        assert_eq!(b.count(|p| p[..3] == [255, 165, 0]), 0);

        s.bind(&[Value::Number(1.0)], None).unwrap();
        let mut ms = 100.0;
        let mut moving = true;
        while moving && ms < 1000.0 {
            ms += 16.0;
            moving = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        c.save("fractal-glass-dark");
        assert!(s.agent("{}").unwrap().ends_with("\"background\":\"#000000\",\"circle\":\"#78C0E0\"}"));
        assert_eq!(&c.at(10, 10)[..3], &[0, 0, 0]);
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

    /// The whole of Graphite's path on the CPU, in f64, from its definitions: the AnalyticRRect
    /// circle into the padded layer, each rescale step's bilinear draw into 8 bits, the two
    /// linear-kernel passes, the bilinear draw back up into L1 (8 bits), the mask's 8-bit alpha
    /// (dstIn), Core Animation's src-over on the background. Device pixel (x, y) at scale 1.
    fn reference(center: (f32, f32), w: f32, h: f32, xs: &[(u32, u32)]) -> Vec<[u8; 3]> {
        let s = 1.0f32;
        let clip = pane_clip(w, h, s);
        let sigma = SIGMA * s;
        let oval = [center.0 - RADIUS, center.1 - RADIUS, center.0 + RADIUS, center.1 + RADIUS];
        let layer = filter_layer(clip, oval, skia::blur::ceil_size(3.0 * sigma)).unwrap();
        let plan = GraphitePlan::new(layer, clip, sigma).unwrap();
        let orange = [1.0, 165.0 / 255.0, 0.0];
        // The layer: the circle's coverage (the identity CPU replay of the step), only within it.
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
                // The cell's gradient.
                let g = [PANE_X as f64, ((h - PANE_HEIGHT) / 2.0) as f64, (w - 2.0 * PANE_X) as f64, PANE_HEIGHT as f64];
                let cell = [g[2] / 4.0, g[3] / 4.0];
                let ix = ((px[0] - g[0]) / cell[0]).floor().clamp(0.0, 3.0);
                let iy = ((px[1] - g[1]) / cell[1]).floor().clamp(0.0, 3.0);
                let st = [g[0] + cell[0] * ix, g[1] + cell[1] * iy];
                let d = [cell[0] - 5.0, cell[1] - 5.0];
                let t = (((px[0] - st[0]) * d[0] + (px[1] - st[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])).clamp(0.0, 1.0);
                let mask = ((1.0 + (0.45 - 1.0) * t) * 255.0).round() / 255.0;
                let l1 = q8(l1.map(|c| c * mask));
                // Over white.
                [0, 1, 2].map(|k| ((l1[k] + 1.0 * (1.0 - l1[3])) * 255.0).round() as u8)
            })
            .collect()
    }

    #[test]
    fn the_blur_is_graphites_pipeline() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = Frame { width: 420.0, height: 912.0, scale: 1.0, now_ms: 0.0, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        // A fractional centre, so nothing lands on the pixel grid by luck.
        let (cx, cy) = (183.3f32, 341.7f32);
        s.input(&InputEvent::Pointer { id: 1, phase: PointerPhase::Down, x: 180.0, y: 270.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 0.0 });
        // The pan sets off straight down: UIKit's 10 pt hysteresis is left out of the
        // translation (RNGH on iOS, a begin 90 ms or more after touch-down), so the finger ends
        // 10 pt past the centre's travel.
        s.input(&InputEvent::Pointer { id: 1, phase: PointerPhase::Move, x: 180.0, y: 270.0 + 20.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 100.0 });
        s.input(&InputEvent::Pointer { id: 1, phase: PointerPhase::Move, x: 180.0 + (cx - 180.0), y: 280.0 + (cy - 270.0), dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 110.0 });
        s.input(&InputEvent::Pointer { id: 1, phase: PointerPhase::Up, x: 180.0 + (cx - 180.0), y: 280.0 + (cy - 270.0), dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms: 120.0 });
        assert!(s.agent("{}").unwrap().contains("\"cx\":183.3,\"cy\":341.7"), "{}", s.agent("{}").unwrap());
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        img.save("fractal-glass-reference");
        // Every 3rd pixel of the pane and a band around the circle.
        let points: Vec<(u32, u32)> = (306..606).step_by(3).flat_map(|y| (40..380).step_by(3).map(move |x| (x, y))).collect();
        let want = reference((cx, cy), 420.0, 912.0, &points);
        // The GPU's bilinear filter and f32 against the f64 replay: a 1-LSB rounding flip in an
        // early 8-bit step can carry; nothing more.
        let (mut worst, mut off) = (0i32, 0usize);
        for (&(x, y), w) in points.iter().zip(&want) {
            let got = img.at(x, y);
            for k in 0..3 {
                let d = (got[k] as i32 - w[k] as i32).abs();
                worst = worst.max(d);
                off += (d > 1) as usize;
                assert!(d <= 2, "({x}, {y}) {got:?} vs {w:?}");
            }
        }
        eprintln!("worst channel difference vs the CPU replay: {worst}, {off} of {} channels over 1", points.len() * 3);
        assert!(off * 1000 < points.len() * 3, "{off}");

        // At 3× (σ 75 px: five rescale steps, σ 4 on a 32-pixel image) the start pose: the
        // blur under the pane's top edge, fading downward.
        let big = Frame { scale: 3.0, ..frame };
        let mut s = surface();
        s.bind(&[Value::Number(0.0)], None).unwrap();
        let (img, _) = fixture::render(&gpu, s.as_mut(), &big).unwrap();
        img.save("fractal-glass-3x");
        let b = |x: u32, y: u32| img.at(x, y)[2] as i32;
        assert!(b(540, 930) < b(540, 1100) && b(540, 1100) < b(540, 1300), "{} {} {}", b(540, 930), b(540, 1100), b(540, 1300));
        assert_eq!(&img.at(540, 810)[..3], &[255, 165, 0]);
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
        // inOut(quad) at ½ is ½: each channel half way in value^2.2, rounded.
        let half = |a: f64, b: f64| gamma8(((a / 255.0).powf(2.2) + (b / 255.0).powf(2.2)) / 2.0) as i32;
        assert_eq!(mid, [half(255.0, 120.0), half(165.0, 192.0), half(0.0, 224.0)]);
        s.bind(&[Value::Number(0.0)], None).unwrap();
        step(&mut s, 150.0);
        // No jump: the new timing starts at the colour shown.
        assert_eq!(circle(&s), mid);
        step(&mut s, 166.0);
        let next = circle(&s);
        // From the re-read colour toward orange: inOut(quad)(16/300) of the way.
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
