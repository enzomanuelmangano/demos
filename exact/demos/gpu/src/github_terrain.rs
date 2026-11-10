//! GitHub Terrain (src/animations/github-terrain: index.tsx, constants.ts, contribution-data.ts,
//! utils/{height-map, scene-data, spring}.ts, hooks/use-webgpu-renderer.ts, shaders/*.ts): nine
//! years of GitHub contributions as 3339 blocks plus nine year cards, drawn with
//! react-native-webgpu, flat as the contribution chart at rest; a tap anywhere springs it into an
//! isometric mountain range (and back), the Switch springs between the real data and a
//! synthetic range.
//!
//! This surface is the full-screen Pressable and its Canvas (the Switch is the Contract's; its
//! value is the one input). The WGSL is RN's strings with their constants interpolated by the RN
//! code itself, and the block buffers are RN's own buildSceneData output for both data sets, bit
//! for bit (exact/parity-tools/github-terrain/build.ts → gpu/shaders/github_terrain.wgsl,
//! gpu/images/github-terrain/scene.bin): triangle list, cull none, depth24plus (less, written),
//! cleared to SURFACE_RGB, 36 vertices × NUM_BLOCKS instances.
//!
//! The canvas: `canvas.width = clientWidth × PixelRatio`, `canvas.height = clientHeight ×
//! PixelRatio` (truncated by the JSI), bgra8unorm, opaque, no colorspace (iOS shows it as sRGB:
//! the shader's output is sRGB as written). The scene renders into an 8-bit layer of that raster
//! (the film grain hashes the drawable's own fragCoord), composed over the canvas's device pixels
//! by cherry-blossom-qrcode's compose (Core Animation's stretch, a texel per pixel when equal).
//!
//! Motion audit (RN → here):
//!
//! | value | RN | Exact |
//! |---|---|---|
//! | progress (flat 1 ↔ 3D 0) | per rAF springStep: critically damped, ω = −ln(0.01) / 0.35 s, dt = min(Δ Date.now() / 1000, 0.05); snapped at |x − t| < 0.001 and |v| < 0.01; starts at 1 | the same, per host frame (after a rest, the first dt one display period, as requestRender restamps lastFrameTime) |
//! | dataProgress (synthetic 0 ↔ real 1) | the same spring; starts at 1 | the same |
//! | colour level | select(A, B, dataProgress > 0.5); colours mixed by dataProgress | WGSL verbatim |
//! | press | RN Pressable (Pressability): onPress on a release inside the canvas grown by the press-rect offsets (20, 20, 20 top, 30 bottom); a long press still presses (no onLongPress); a cancel (the screen's close pan) nothing; one responder | the same; `haptic:impact-light` (Haptics.impactAsync Light) at the press |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};

use crate::{gfx, shaders};
use shaders::cherry_blossom_qrcode_compose as compose;
use shaders::github_terrain::{
    entry as stage, module, Uniforms, BLOCK_COLORS, BLOCK_COLORS_B, BLOCK_HEIGHTS, BLOCK_HEIGHTS_B,
    BLOCK_POSITIONS, GROUP_0, HEIGHT_GRID, HEIGHT_GRID_B, UNIFORMS,
};

/// GRID_COLS × GRID_ROWS + NUM_YEARS.
const NUM_BLOCKS: usize = 53 * 63 + 9;
const GRID_CELLS: usize = 53 * 63;
/// SURFACE_RGB.
const SURFACE: wgpu::Color = wgpu::Color {
    r: 0.976,
    g: 0.965,
    b: 0.945,
    a: 1.0,
};
/// SPRING_DURATION; SPRING_OMEGA = −ln(0.01) / SPRING_DURATION.
const SPRING_DURATION: f64 = 0.35;
/// Pressability's DEFAULT_PRESS_RECT_OFFSETS: left, right, top, bottom.
const PRESS_RECT: (f32, f32, f32, f32) = (20.0, 20.0, 20.0, 30.0);
/// buildSceneData for both sets, as the renderer uploads them (build.ts).
static SCENE: &[u8] = include_bytes!("../images/github-terrain/scene.bin");

const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;

/// The demo's surface. Input: the Switch's value (useRealData).
pub fn surface() -> Box<dyn Surface> {
    Box::new(GithubTerrain {
        is_flat: true,
        use_real: true,
        progress: (1.0, 0.0),
        data: (1.0, 0.0),
        last_frame_ms: None,
        start_ms: None,
        size: (0.0, 0.0),
        responder: None,
        posted: Vec::new(),
        drawn: None,
        gpu: None,
    })
}

struct GithubTerrain {
    is_flat: bool,
    use_real: bool,
    /// (position, velocity) of each spring.
    progress: (f64, f64),
    data: (f64, f64),
    last_frame_ms: Option<f64>,
    start_ms: Option<f64>,
    size: (f32, f32),
    /// The touch the Pressable holds.
    responder: Option<u32>,
    posted: Vec<String>,
    /// What the layer holds: (progress, dataProgress, raster).
    drawn: Option<(f32, f32, (u32, u32))>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
    compose: wgpu::RenderPipeline,
    compose_layout: wgpu::BindGroupLayout,
    compose_uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    layers: Option<Layers>,
    _buffers: Vec<wgpu::Buffer>,
}

struct Layers {
    raster: (u32, u32),
    color: wgpu::TextureView,
    depth: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

/// springStep: x(t) = (x₀ + (v₀ + ω x₀) t) e^(−ω t) + target, in RN's f64.
pub(crate) fn spring_step(current: f64, velocity: f64, target: f64, dt: f64) -> (f64, f64) {
    let omega = -(0.01f64.ln()) / SPRING_DURATION;
    let displacement = current - target;
    let decay = (-omega * dt).exp();
    let new_displacement = (displacement + (velocity + omega * displacement) * dt) * decay;
    let new_velocity = (velocity - omega * (velocity + omega * displacement) * dt) * decay;
    (target + new_displacement, new_velocity)
}

fn entry<'a>(b: &wgpu::BindGroupLayoutEntry, buffer: &'a wgpu::Buffer) -> wgpu::BindGroupEntry<'a> {
    wgpu::BindGroupEntry {
        binding: b.binding,
        resource: buffer.as_entire_binding(),
    }
}

/// One spring's frame, snapped as isSpringSettled (0.001, 0.01).
fn advance(s: &mut (f64, f64), target: f64, dt: f64) {
    *s = spring_step(s.0, s.1, target, dt);
    if (s.0 - target).abs() < 0.001 && s.1.abs() < 0.01 {
        *s = (target, 0.0);
    }
}

impl GithubTerrain {
    fn targets(&self) -> (f64, f64) {
        (
            if self.is_flat { 1.0 } else { 0.0 },
            if self.use_real { 1.0 } else { 0.0 },
        )
    }
    fn settled(&self) -> bool {
        let (v, d) = self.targets();
        self.progress == (v, 0.0) && self.data == (d, 0.0)
    }
}

impl Surface for GithubTerrain {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(on) = inputs.first().and_then(|v| v.as_bool()) {
            self.use_real = on;
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"isFlat\":{},\"useRealData\":{},\"progress\":{:.4},\"dataProgress\":{:.4}}}",
            self.is_flat, self.use_real, self.progress.0, self.data.0
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        match phase {
            PointerPhase::Down if self.responder.is_none() => self.responder = Some(id),
            PointerPhase::Up if self.responder == Some(id) => {
                self.responder = None;
                let (l, r, t, b) = PRESS_RECT;
                let (w, h) = self.size;
                if x > -l && x < w + r && y > -t && y < h + b {
                    // handlePress: impactAsync(Light), isFlat = !isFlat, requestRender().
                    self.posted.push("haptic:impact-light".into());
                    self.is_flat = !self.is_flat;
                }
            }
            PointerPhase::Cancel if self.responder == Some(id) => self.responder = None,
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
        let now = frame.now_ms;
        self.size = (frame.width, frame.height);
        let start = *self.start_ms.get_or_insert(now);
        if self.gpu.as_ref().map(|g| (g.format, g.generation))
            != Some((format, frame.shader_generation))
        {
            self.gpu = Some(build(device, format, frame.shader_generation));
            self.drawn = None;
        }
        // canvas.width = clientWidth × PixelRatio, truncated.
        let raster = (
            (frame.width * frame.scale) as u32,
            (frame.height * frame.scale) as u32,
        );
        let pixels = frame.pixels();
        {
            let gpu = self.gpu.as_mut().unwrap();
            if gpu.layers.as_ref().map(|l| l.raster) != Some(raster) {
                gpu.layers = Some(layers(device, gpu, raster));
            }
        }

        // The render loop: dt clamped to 50 ms; after a rest, one display period.
        if !self.settled() || self.drawn.is_none() {
            let period = if frame.period_ms > 0.0 {
                frame.period_ms
            } else {
                1000.0 / 60.0
            };
            let last = self.last_frame_ms.unwrap_or(now - period);
            let dt = ((now - last) / 1000.0).min(0.05);
            self.last_frame_ms = Some(now);
            let (v, d) = self.targets();
            advance(&mut self.progress, v, dt);
            advance(&mut self.data, d, dt);
        }

        let gpu = self.gpu.as_ref().unwrap();
        let layers = gpu.layers.as_ref().unwrap();
        let words = (self.progress.0 as f32, self.data.0 as f32, raster);
        if self.drawn != Some(words) {
            let aspect = if frame.height > 0.0 {
                frame.width as f64 / frame.height as f64
            } else {
                1.0
            };
            let u = Uniforms {
                aspectRatio: aspect as f32,
                time: ((now - start) / 1000.0) as f32,
                blockCount: NUM_BLOCKS as f32,
                progress: words.0,
                dataProgress: words.1,
                zoomScale: 1.0,
            };
            queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("github terrain"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &layers.color,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(SURFACE),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &layers.depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.pipeline);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..36, 0..NUM_BLOCKS as u32);
            drop(pass);
            self.drawn = Some(words);
        }

        let c = compose::Compose {
            size: [
                raster.0 as f32,
                raster.1 as f32,
                pixels.0 as f32,
                pixels.1 as f32,
            ],
            flags: [
                gfx::srgb_flag(format),
                if raster == pixels { 1.0 } else { 0.0 },
                0.0,
                0.0,
            ],
        };
        queue.write_buffer(&gpu.compose_uniforms, 0, &c.bytes());
        gfx::pass(
            encoder,
            "github terrain compose",
            target,
            &gpu.compose,
            &layers.bind,
        );

        let busy = !self.settled();
        if !busy {
            self.last_frame_ms = None;
        }
        busy
    }
}

fn layers(device: &wgpu::Device, gpu: &Gpu, raster: (u32, u32)) -> Layers {
    let color = gfx::target(
        device,
        "github terrain layer",
        LAYER_FORMAT,
        raster.0.max(1),
        raster.1.max(1),
    );
    let depth = device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("github terrain depth"),
            size: wgpu::Extent3d {
                width: raster.0.max(1),
                height: raster.1.max(1),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: DEPTH_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
        .create_view(&Default::default());
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("github terrain compose"),
        layout: &gpu.compose_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: compose::U.binding,
                resource: gpu.compose_uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: compose::LAYER.binding,
                resource: wgpu::BindingResource::TextureView(&color),
            },
            wgpu::BindGroupEntry {
                binding: compose::SMP.binding,
                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
            },
        ],
    });
    Layers {
        raster,
        color,
        depth,
        bind,
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    // scene.bin: colors, positions, heights, grid (A); colors, heights, grid (B).
    let sizes = [
        NUM_BLOCKS * 4,
        NUM_BLOCKS * 16,
        NUM_BLOCKS * 4,
        GRID_CELLS * 4,
        NUM_BLOCKS * 4,
        NUM_BLOCKS * 4,
        GRID_CELLS * 4,
    ];
    let mut at = 0;
    let buffers: Vec<wgpu::Buffer> = sizes
        .iter()
        .map(|&n| {
            let b = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("github terrain blocks"),
                size: n as u64,
                usage: wgpu::BufferUsages::STORAGE,
                mapped_at_creation: true,
            });
            b.slice(..)
                .get_mapped_range_mut()
                .expect("mapped at creation")
                .copy_from_slice(&SCENE[at..at + n]);
            b.unmap();
            at += n;
            b
        })
        .collect();
    debug_assert_eq!(at, SCENE.len());
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("github terrain uniforms"),
        // UNIFORM_BUFFER_SIZE.
        size: 256,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let layout = device.create_bind_group_layout(&GROUP_0);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("github terrain"),
        layout: &layout,
        entries: &[
            entry(&UNIFORMS, &uniforms),
            entry(&BLOCK_COLORS, &buffers[0]),
            entry(&BLOCK_POSITIONS, &buffers[1]),
            entry(&BLOCK_HEIGHTS, &buffers[2]),
            entry(&HEIGHT_GRID, &buffers[3]),
            entry(&BLOCK_COLORS_B, &buffers[4]),
            entry(&BLOCK_HEIGHTS_B, &buffers[5]),
            entry(&HEIGHT_GRID_B, &buffers[6]),
        ],
    });
    let shader = device.create_shader_module(module());
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("github terrain"),
        layout: Some(
            &device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("github terrain"),
                bind_group_layouts: &[Some(&layout)],
                immediate_size: 0,
            }),
        ),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some(stage::VS_MAIN),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some(stage::FS_MAIN),
            targets: &[Some(wgpu::ColorTargetState {
                format: LAYER_FORMAT,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode: None,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let compose_shader = device.create_shader_module(compose::module());
    let compose_layout = device.create_bind_group_layout(&compose::GROUP_0);
    let compose = gfx::fullscreen(
        device,
        format,
        &compose_shader,
        &compose_layout,
        compose::entry::VS,
        compose::entry::FS,
        None,
        "github terrain compose",
    );
    let compose_uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("github terrain compose uniforms"),
        size: compose::Compose::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let sampler = gfx::linear_sampler(device, "github terrain");
    Gpu {
        format,
        generation,
        pipeline,
        uniforms,
        bind,
        compose,
        compose_layout,
        compose_uniforms,
        sampler,
        layers: None,
        _buffers: buffers,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn spring_is_rns() {
        // ω = 13.1576…; one 16 ms step from 1 toward 0 at rest.
        let (x, v) = spring_step(1.0, 0.0, 0.0, 0.016);
        let w = -(0.01f64.ln()) / 0.35;
        assert!((x - (1.0 + w * 0.016) * (-w * 0.016f64).exp()).abs() < 1e-12);
        assert!(v < 0.0);
        // 99 % in 350 ms; the 0.001 snap lands on frame 43 at 60 Hz.
        let mut s = (1.0, 0.0);
        let mut n = 0;
        while s != (0.0, 0.0) {
            advance(&mut s, 0.0, 1.0 / 60.0);
            n += 1;
        }
        assert_eq!(n, 43);
    }

    #[test]
    fn flat_chart_taps_into_terrain() {
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
            period_ms: 16.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Bool(true)], None).unwrap();
        let (flat, busy) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        flat.save("github-terrain-flat");
        assert!(!busy);
        // The corner is the surface colour (± the grain), the centre a chart of green-ish cells.
        let c = flat.at(5, 5);
        assert!(
            (c[0] as i32 - 249).abs() <= 9 && (c[2] as i32 - 241).abs() <= 9,
            "{c:?}"
        );
        let greens = (300..612)
            .step_by(4)
            .flat_map(|y| (60..360).step_by(4).map(move |x| (x, y)))
            .filter(|&(x, y)| {
                let p = flat.at(x, y);
                p[1] as i32 - p[0] as i32 > 40
            })
            .count();
        assert!(greens > 50, "{greens}");

        let e = |phase, at_ms| InputEvent::Pointer {
            id: 3,
            phase,
            x: 200.0,
            y: 400.0,
            dx: 0.0,
            dy: 0.0,
            kind: exact_gpu::PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&e(PointerPhase::Down, 10.0));
        s.input(&e(PointerPhase::Up, 80.0));
        assert_eq!(s.messages(), ["haptic:impact-light"]);
        let mut ms = 16.0;
        let mut busy = true;
        while busy && ms < 2000.0 {
            busy = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
            ms += 16.0;
        }
        assert!(s
            .agent("")
            .unwrap()
            .contains("\"isFlat\":false,\"useRealData\":true,\"progress\":0.0000"));
        let (iso, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        iso.save("github-terrain-iso");
        assert_ne!(flat.data, iso.data);

        // The Switch off: the synthetic range.
        s.bind(&[Value::Bool(false)], None).unwrap();
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 {
            ms += 16.0;
        }
        let (synthetic, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        synthetic.save("github-terrain-synthetic");
        assert_ne!(iso.data, synthetic.data);
        // A cancelled touch presses nothing.
        s.input(&e(PointerPhase::Down, 3000.0));
        s.input(&e(PointerPhase::Cancel, 3050.0));
        assert!(s.messages().is_empty());
    }
}
