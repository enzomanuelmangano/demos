//! Blur Circles (src/animations/blur-circles): a sweep-gradient circle (cyan, magenta, yellow,
//! cyan about (50, 128)) and a glass circle, both RADIUS 80, wandering about the screen's
//! centre on simplex noise (constants.ts: FREQUENCY 1800, A 30; the glass at 2×FREQUENCY and
//! 3×A, each on its own permutation table). The clock runs 0 → 20000 → 0 forever
//! (withRepeat(withTiming(20000, { duration: 20000 }), -1, true): Easing.inOut(quad)).
//!
//! Drawn as RN Skia's Graphite draws it into the canvas's 8-bit Display P3 surface
//! (`shaders/blur_circles.wgsl` composes the draws in order, each stored in 8 bits):
//! - `<Group clip={glass}><Circle>{sweep}</Circle><Blur blur={10} /></Group>`: the clip (RN
//!   Skia's native recorder clips without antialiasing, so Graphite snaps the rrect's device
//!   bounds to whole pixels before its analytic clip: measured, the edge exact only so), then
//!   the filtered layer, sized as Skia sizes it (the clip's device bounds outset by the blur's
//!   ceil(3σ)); the sweep circle drawn into it in P3, clipped only to the layer's bounds (a
//!   layer device's clip starts as its bounds), Graphite's blur of it (`skia::blur::GraphiteBlur`,
//!   σ 30 px at 3×), drawn back through the glass's clip.
//! - the same circle under `invertClip`.
//! - the glass, rgba(0,0,0,0.08) through `<BlurMask blur={20} style="inner" />`: Graphite turns
//!   the mask filter into an image filter on a coverage layer (the circle's rounded-out device
//!   bounds), Blur(σ 60 px) then DstIn with the coverage, and draws the paint through it.
//! - the white hairline, rgba(255,255,255,0.25), 1 pt.
//!
//! `-blurCirclesAt cx,cy,cx2,cy2` (a launch argument) pins both centres and stops the clock:
//! the parity stills, against RN's values read from its shared values at a frozen clock.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::Easing;
use simplex_noise::{Noise2D, Random};
use skia::blur::{
    ceil_size, intersect, outset, round_out, GraphiteBlur, GraphitePlan, Placed, GRAPHITE_FORMAT,
};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::blur_circles::{
    entry, module, Uniforms, GROUP_0, INSIDE_LOW, MASK, MASK_LOW, SMP, SWEEP, U,
};

const RADIUS: f32 = 80.0;
const FREQUENCY: f64 = 1800.0;
const A: f64 = 30.0;
/// `<Blur blur={10} />` and `<BlurMask blur={20} />`: σ in points (both follow the CTM).
const BLUR: f32 = 10.0;
const MASK_BLUR: f32 = 20.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(BlurCircles {
        pinned: pinned(std::env::args()),
        ..BlurCircles::default()
    })
}

/// `-blurCirclesAt cx,cy,cx2,cy2` among the process's arguments.
fn pinned(mut args: impl Iterator<Item = String>) -> Option<[f32; 4]> {
    args.find(|a| a == "-blurCirclesAt")?;
    let v: Vec<f32> = args
        .next()?
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    (v.len() == 4).then(|| [v[0], v[1], v[2], v[3]])
}

/// A layer the blur reads, with its plan and blur.
struct Filtered {
    canvas: Canvas,
    renderer: Renderer,
    blur: GraphiteBlur,
    plan: GraphitePlan,
}

impl Default for Filtered {
    fn default() -> Filtered {
        let mut renderer = Renderer::default();
        renderer.p3 = true;
        Filtered {
            canvas: Canvas::default(),
            renderer,
            blur: GraphiteBlur::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
        }
    }
}

#[derive(Default)]
struct BlurCircles {
    pinned: Option<[f32; 4]>,
    start_ms: Option<f64>,
    paint: Option<Paint>,
    inside: Filtered,
    mask: Filtered,
    sweep: (Canvas, Renderer),
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The canvas in device px, the inside layer's side and the mask layer's (px).
    size: (u32, u32, u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The inside layer (room for the glass's device bounds + the blur's reach on every side),
    /// the sweep circle (the canvas), the mask's coverage layer (the glass's device bounds).
    inside: wgpu::TextureView,
    sweep: wgpu::TextureView,
    mask: wgpu::TextureView,
    empty: wgpu::TextureView,
    bind: Option<([wgpu::TextureView; 2], wgpu::BindGroup)>,
}

/// constants.ts's two permutation tables: built once when the module loads, so every open of
/// the demo in one run of the app follows the same path (a new run, new tables).
static TABLES: std::sync::OnceLock<(Noise2D, Noise2D)> = std::sync::OnceLock::new();

/// useVec's two centres at clock `t` about (cx, cy): the circle (A, FREQUENCY, noiseTables)
/// and the glass (3A, 2·FREQUENCY, secondNoiseTables).
fn centres(tables: &(Noise2D, Noise2D), t: f64, cx: f64, cy: f64) -> [[f64; 2]; 2] {
    let at = |n: &Noise2D, a: f64, f: f64| [a * n.at(t / f, 0.0) + cx, a * n.at(0.0, t / f) + cy];
    [
        at(&tables.0, A, FREQUENCY),
        at(&tables.1, 3.0 * A, 2.0 * FREQUENCY),
    ]
}

/// withRepeat(withTiming(20000, { duration: 20000 }), -1, true).
fn clock(ms: f64) -> f64 {
    let ease = Easing::timing_default();
    let c = ms.rem_euclid(40000.0);
    if c < 20000.0 {
        20000.0 * ease.at(c / 20000.0)
    } else {
        20000.0 - 20000.0 * ease.at((c - 20000.0) / 20000.0)
    }
}

/// The blurred image's uv of a device pixel: uv = p · xy + zw (as metaball's).
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [
        kx / sw,
        ky / sh,
        (low[0] - src[0] * kx - origin[0] as f32) / sw,
        (low[1] - src[1] * ky - origin[1] as f32) / sh,
    ]
}

impl Surface for BlurCircles {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
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
        let (c1, c2) = match self.pinned {
            Some(p) => ((p[0], p[1]), (p[2], p[3])),
            None => {
                let start = *self.start_ms.get_or_insert(frame.now_ms);
                let tables = TABLES.get_or_init(|| {
                    let mut random = Random::new(frame.now_ms.to_bits());
                    (
                        Noise2D::new(|| random.next()),
                        Noise2D::new(|| random.next()),
                    )
                });
                // constants.ts's `center`: the window's centre (the canvas fills it).
                let [c1, c2] = centres(
                    tables,
                    clock(frame.now_ms - start),
                    frame.width as f64 / 2.0,
                    frame.height as f64 / 2.0,
                );
                ((c1[0] as f32, c1[1] as f32), (c2[0] as f32, c2[1] as f32))
            }
        };
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let (in_sigma, m_sigma) = (BLUR * s, MASK_BLUR * s);
        let (in_reach, m_reach) = (ceil_size(3.0 * in_sigma), ceil_size(3.0 * m_sigma));
        // round_out of a 2·RADIUS·s box spans at most ceil(2·RADIUS·s) + 1 pixels.
        let side = (2.0 * RADIUS * s).ceil() as u32 + 1;
        let size = (pw, ph, side + 2 * in_reach as u32, side);
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.size))
            != Some((format, frame.shader_generation, size))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, size));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let screen = [0, 0, pw as i32, ph as i32];
        let glass = [c2.0 - RADIUS, c2.1 - RADIUS, c2.0 + RADIUS, c2.1 + RADIUS];
        // RN Skia's native Group clips with `clipRRect(rrect, op)`, no antialiasing: Graphite
        // snaps the clip's device bounds to whole pixels (SkRect::round).
        let clip = glass.map(|v| (v * s + 0.5).floor() as i32);
        // The SweepGradient, built once (useMemo).
        let sweep = &*self.paint.get_or_insert_with(|| {
            Paint::shader(Shader::Sweep {
                center: point(50.0, 128.0),
                stops: stops(&[
                    Color::parse("cyan"),
                    Color::parse("magenta"),
                    Color::parse("yellow"),
                    Color::parse("cyan"),
                ]),
            })
        });
        let mut u = Uniforms {
            glass: [c2.0 * s, c2.1 * s, RADIUS * s, s],
            clip: clip.map(|v| v as f32),
            canvas: [pw as f32, ph as f32, gfx::srgb_flag(format), 0.0],
            in_low: [0.0; 4],
            in_out: [0.0; 4],
            m_low: [0.0; 4],
            m_out: [0.0; 4],
            flags: [0.0; 4],
        };
        let mut views = [gpu.empty.clone(), gpu.empty.clone()];

        // Group 1: the clip (the glass), then the layer: the clip's device bounds, outset by
        // the blur's reach. Texel (0, 0) is the layer's top left.
        if let Some(desired) = intersect(clip, screen) {
            let f = &mut self.inside;
            let layer = outset(desired, in_reach, in_reach);
            f.canvas.begin(s);
            f.canvas
                .translate(-layer[0] as f32 / s, -layer[1] as f32 / s);
            // A layer's device starts with its own bounds as the clip: the glass's shape is
            // not in it, so the circle is blurred whole within the layer (RN: colour up to
            // the glass's edge, not faded at it).
            let l = layer.map(|v| v as f32 / s);
            f.canvas.clip_rect(l[0], l[1], l[2] - l[0], l[3] - l[1]);
            f.canvas.draw_circle(c1.0, c1.1, RADIUS, sweep);
            f.renderer.draw(
                device,
                queue,
                encoder,
                &f.canvas,
                &gpu.inside,
                GRAPHITE_FORMAT,
                size.2,
                size.2,
                wgpu::Color::TRANSPARENT,
            );
            if f.plan.update(layer, desired, in_sigma) {
                let placed = Placed {
                    view: &gpu.inside,
                    origin: [layer[0], layer[1]],
                    size: [size.2, size.2],
                };
                let out = f.blur.run(device, queue, encoder, placed, &f.plan);
                u.in_low = low_mapping(&f.plan, out.origin, out.size);
                u.in_out = f.plan.output.map(|v| v as f32);
                u.flags[0] = 1.0;
                views[0] = out.view.clone();
            }
        }

        // Group 2's circle (its inverse clip is the compose's).
        let (canvas, renderer) = &mut self.sweep;
        renderer.p3 = true;
        canvas.begin(s);
        canvas.draw_circle(c1.0, c1.1, RADIUS, sweep);
        renderer.draw(
            device,
            queue,
            encoder,
            canvas,
            &gpu.sweep,
            GRAPHITE_FORMAT,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );

        // The glass's coverage layer: the circle's rounded-out device bounds within the device
        // clip outset by the blur's reach; the filter's output, the screen.
        if let Some(layer) = intersect(
            round_out(glass.map(|v| v * s)),
            outset(screen, m_reach, m_reach),
        ) {
            let f = &mut self.mask;
            f.canvas.begin(s);
            f.canvas
                .translate(-layer[0] as f32 / s, -layer[1] as f32 / s);
            f.canvas
                .draw_circle(c2.0, c2.1, RADIUS, &Paint::fill(Color::WHITE));
            f.renderer.draw(
                device,
                queue,
                encoder,
                &f.canvas,
                &gpu.mask,
                GRAPHITE_FORMAT,
                size.3,
                size.3,
                wgpu::Color::TRANSPARENT,
            );
            u.flags[2] = layer[0] as f32;
            u.flags[3] = layer[1] as f32;
            if f.plan.update(layer, screen, m_sigma) {
                let placed = Placed {
                    view: &gpu.mask,
                    origin: [layer[0], layer[1]],
                    size: [size.3, size.3],
                };
                let out = f.blur.run(device, queue, encoder, placed, &f.plan);
                u.m_low = low_mapping(&f.plan, out.origin, out.size);
                u.m_out = f.plan.output.map(|v| v as f32);
                u.flags[1] = 1.0;
                views[1] = out.view.clone();
            }
        }

        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != views) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("blur circles"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: U.binding,
                        resource: gpu.uniforms.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: INSIDE_LOW.binding,
                        resource: wgpu::BindingResource::TextureView(&views[0]),
                    },
                    wgpu::BindGroupEntry {
                        binding: SWEEP.binding,
                        resource: wgpu::BindingResource::TextureView(&gpu.sweep),
                    },
                    wgpu::BindGroupEntry {
                        binding: MASK.binding,
                        resource: wgpu::BindingResource::TextureView(&gpu.mask),
                    },
                    wgpu::BindGroupEntry {
                        binding: MASK_LOW.binding,
                        resource: wgpu::BindingResource::TextureView(&views[1]),
                    },
                    wgpu::BindGroupEntry {
                        binding: SMP.binding,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                ],
            });
            gpu.bind = Some((views, group));
        }
        skia::render::fullscreen_pass(
            encoder,
            "blur circles",
            target,
            &gpu.compose,
            &gpu.bind.as_ref().unwrap().1,
        );
        self.pinned.is_none()
    }
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    size: (u32, u32, u32, u32),
) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose =
        skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let (pw, ph, inside, mask) = size;
    let view = |label, w, h| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, w, h);
    Gpu {
        format,
        generation,
        size,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("blur circles"),
            size: Uniforms::SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }),
        sampler: skia::render::linear_sampler(device),
        inside: view("blur circles inside", inside, inside),
        sweep: view("blur circles sweep", pw, ph),
        mask: view("blur circles mask", mask, mask),
        empty: view("blur circles empty", 1, 1),
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_glass_blurs_what_it_covers() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface();
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(1000.0)).unwrap();
        a.save("blur-circles-0");
        assert!(animating);
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(9000.0)).unwrap();
        b.save("blur-circles-8s");
        // White far from the circles; colour at the centre.
        assert_eq!(&a.at(10, 10)[..3], &[255, 255, 255]);
        assert!(a.at(210, 456)[..3] != [255, 255, 255]);
        assert_ne!(a.data, b.data);
    }

    /// RN's centres at clock 3000 (read from its shared values with the clock frozen), at 3×:
    /// the parity still, against RN's screenshot.
    #[test]
    fn pinned_still() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let at = "203.70441593352083,460.4132675869569,141.48407131518877,400.26506529907414";
        let mut s = BlurCircles {
            pinned: pinned(["-blurCirclesAt".to_string(), at.to_string()].into_iter()),
            ..BlurCircles::default()
        };
        let frame = Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms: 0.0,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let (image, animating) = fixture::render(&gpu, &mut s, &frame).unwrap();
        image.save("blur-circles-pinned");
        assert!(!animating);
    }

    /// RN's own tables (read from the app's constants module) give RN's centres (read from its
    /// shared values with the clock frozen), to within 1e-9 pt (Hermes' last bit).
    #[test]
    fn rn_path() {
        const RN_PERM: [[u8; 256]; 2] = [
            [
                49, 118, 23, 221, 66, 119, 70, 111, 19, 179, 166, 140, 137, 218, 194, 136, 171,
                110, 83, 22, 6, 12, 251, 176, 34, 229, 211, 169, 224, 145, 10, 58, 242, 132, 96,
                244, 209, 47, 33, 182, 77, 161, 74, 153, 50, 170, 8, 130, 36, 248, 85, 87, 65, 181,
                167, 114, 125, 154, 3, 5, 213, 1, 212, 15, 17, 92, 107, 190, 222, 165, 9, 86, 134,
                37, 236, 206, 30, 79, 178, 7, 93, 198, 150, 29, 174, 177, 173, 73, 44, 35, 31, 172,
                94, 202, 253, 254, 129, 4, 185, 252, 246, 207, 225, 215, 184, 193, 27, 89, 227,
                100, 220, 113, 203, 42, 98, 122, 196, 105, 97, 201, 183, 127, 157, 82, 121, 21, 48,
                25, 28, 240, 84, 142, 51, 216, 219, 128, 138, 75, 239, 123, 106, 117, 16, 71, 205,
                64, 63, 175, 160, 230, 78, 53, 56, 164, 18, 131, 226, 155, 156, 141, 146, 11, 197,
                55, 108, 80, 199, 124, 148, 104, 243, 103, 54, 116, 13, 81, 40, 152, 67, 237, 192,
                101, 91, 46, 69, 109, 168, 238, 200, 2, 189, 191, 95, 43, 228, 208, 76, 235, 24,
                120, 115, 250, 99, 32, 232, 187, 26, 20, 41, 217, 62, 144, 61, 204, 0, 241, 45,
                163, 214, 68, 149, 147, 102, 249, 210, 247, 90, 231, 234, 186, 162, 72, 135, 60,
                245, 151, 255, 139, 57, 143, 88, 59, 39, 133, 180, 188, 158, 52, 233, 112, 126, 38,
                14, 159, 223, 195,
            ],
            [
                54, 134, 84, 254, 125, 248, 105, 227, 4, 21, 170, 180, 99, 139, 5, 46, 231, 238,
                250, 190, 251, 39, 115, 173, 166, 141, 132, 199, 38, 185, 118, 79, 61, 196, 130,
                212, 121, 7, 228, 219, 83, 252, 22, 95, 255, 188, 53, 236, 97, 43, 159, 90, 76, 16,
                26, 75, 223, 87, 172, 220, 167, 119, 164, 78, 63, 13, 211, 33, 68, 156, 62, 209,
                116, 153, 179, 72, 126, 234, 51, 80, 158, 12, 182, 124, 94, 1, 247, 216, 184, 102,
                37, 197, 29, 244, 202, 226, 45, 140, 239, 106, 155, 103, 88, 73, 17, 15, 144, 25,
                40, 110, 41, 113, 2, 152, 20, 160, 131, 71, 85, 206, 58, 28, 136, 74, 195, 237,
                213, 207, 123, 230, 69, 82, 232, 194, 187, 253, 235, 34, 221, 149, 6, 14, 31, 192,
                77, 49, 183, 169, 10, 177, 193, 205, 138, 67, 137, 146, 92, 30, 98, 210, 24, 89,
                203, 27, 245, 240, 171, 181, 214, 101, 36, 32, 200, 225, 215, 145, 165, 18, 176,
                147, 64, 233, 55, 96, 122, 151, 66, 229, 104, 107, 208, 175, 129, 81, 191, 50, 218,
                19, 222, 246, 157, 249, 93, 44, 59, 128, 142, 3, 148, 70, 120, 65, 23, 56, 0, 8,
                11, 86, 150, 143, 186, 60, 241, 163, 133, 111, 154, 112, 91, 117, 162, 217, 100,
                42, 204, 198, 161, 243, 201, 168, 127, 57, 108, 189, 52, 9, 135, 114, 47, 224, 48,
                174, 242, 35, 178, 109,
            ],
        ];

        // Noise2D's shuffle replayed so it lands on `perm`: each step's random picks the index.
        let noise = |perm: &[u8; 256]| {
            let mut cur: Vec<u8> = (0..=255).collect();
            let mut i = 0;
            Noise2D::new(|| {
                let r = cur.iter().position(|&v| v == perm[i]).unwrap();
                cur.swap(i, r);
                let x = (r - i) as f64 + 0.5;
                let n = (256 - i) as f64;
                i += 1;
                x / n
            })
        };
        let tables = (noise(&RN_PERM[0]), noise(&RN_PERM[1]));
        for (t, rn) in [
            (
                3000.0,
                [
                    203.70441593352083,
                    460.4132675869569,
                    141.48407131518877,
                    400.26506529907414,
                ],
            ),
            (
                16000.0,
                [
                    232.98633314249835,
                    461.88656891748343,
                    145.53260301160373,
                    530.6690397669526,
                ],
            ),
        ] {
            let [a, b] = centres(&tables, t, 210.0, 456.0);
            for (ours, rn) in [a[0], a[1], b[0], b[1]].into_iter().zip(rn) {
                assert!((ours - rn).abs() < 1e-9, "clock {t}: {ours} vs {rn}");
            }
        }
    }
}
