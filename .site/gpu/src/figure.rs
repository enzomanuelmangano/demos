//! Drawing a figure (a ghost-site ghost and its dizzy birds) the way the RN app's three.js scenes
//! do, at a low per-frame cost: the meshes and their morph displacements are uploaded once and
//! blended in the vertex shader (shaders/figure.wgsl), so a frame writes only uniforms, all of
//! them into one arena (gfx::Arena) copied in one go; 4× MSAA into a half-float target, then the
//! dissolve pass (shaders/dissolve.wgsl) encodes it onto the canvas.

use exact_gpu::wgpu;

use crate::{gfx, shaders};

/// The scene pass's samples, colour and depth formats (a caller's extra draws must match).
pub const MSAA: u32 = 4;
pub const SCENE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
pub const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;
/// The most morph targets a mesh may have (the Draw block's weights).
pub const MAX_TARGETS: usize = 56;

/// A mesh to upload: (position, normal) vertices, triangles, morph displacements.
pub struct MeshData<'a> {
    pub vertices: &'a [[f32; 6]],
    pub indices: &'a [u32],
    pub targets: &'a [Vec<[f32; 3]>],
}

struct GpuMesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
    targets: Option<wgpu::Buffer>,
}

struct Slot {
    at: usize,
    bind: wgpu::BindGroup,
}

struct Targets {
    size: (u32, u32),
    color: wgpu::TextureView,
    resolve: wgpu::TextureView,
    depth: wgpu::TextureView,
    dissolve_bind: wgpu::BindGroup,
}

/// One draw: a mesh with the uniforms in `slot`, and whether its contour is drawn too.
#[derive(Clone, Copy)]
pub struct Call {
    pub mesh: usize,
    pub slot: usize,
    pub outlined: bool,
}

/// The pipelines, the uploaded meshes and the uniform slots of one figure.
pub struct Figure {
    format: wgpu::TextureFormat,
    generation: u32,
    fill: wgpu::RenderPipeline,
    hull: wgpu::RenderPipeline,
    dissolve: wgpu::RenderPipeline,
    dissolve_layout: wgpu::BindGroupLayout,
    arena: gfx::Arena,
    scene_at: usize,
    dissolve_at: usize,
    scene_bind: wgpu::BindGroup,
    meshes: Vec<GpuMesh>,
    slots: Vec<Slot>,
    targets: Option<Targets>,
    /// Bumped whenever the targets are rebuilt (a binding to `resolved` must follow).
    epoch: u32,
    extra: Vec<usize>,
}

impl Figure {
    /// Uploads `meshes` and reserves one uniform slot per entry of `slots`, each bound to the
    /// morph displacements of the mesh it names (None: a mesh that does not morph).
    /// `extra` reserves more uniform blocks of those sizes in the arena, for the caller's own
    /// passes (`extra_at`, `block`, `binding`).
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, meshes: &[MeshData], slots: &[Option<usize>], extra: &[usize]) -> Figure {
        use wgpu::util::DeviceExt;
        let sm = device.create_shader_module(shaders::figure::module());
        let g0 = device.create_bind_group_layout(&shaders::figure::GROUP_0);
        let g1 = device.create_bind_group_layout(&shaders::figure::GROUP_1);
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("figure"),
            bind_group_layouts: &[Some(&g0), Some(&g1)],
            immediate_size: 0,
        });
        let cache = gfx::pipeline_cache(device);
        // Front faces as three's FrontSide; the contour is the hull seen from inside (BackSide).
        let pipeline = |label: &str, vs: &str, fs: &str, cull: wgpu::Face| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &sm,
                    entry_point: Some(vs),
                    buffers: &[Some(shaders::figure::VertexIn::LAYOUT)],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &sm,
                    entry_point: Some(fs),
                    targets: &[Some(wgpu::ColorTargetState { format: SCENE_FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState { cull_mode: Some(cull), front_face: wgpu::FrontFace::Ccw, ..Default::default() },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: DEPTH_FORMAT,
                    depth_write_enabled: Some(true),
                    depth_compare: Some(wgpu::CompareFunction::LessEqual),
                    stencil: Default::default(),
                    bias: Default::default(),
                }),
                multisample: wgpu::MultisampleState { count: MSAA, ..Default::default() },
                multiview_mask: None,
                cache: cache.handle.as_ref(),
            })
        };
        let fill = pipeline("figure", shaders::figure::entry::VS, shaders::figure::entry::FS, wgpu::Face::Back);
        let hull = pipeline("figure contour", shaders::figure::entry::VS_HULL, shaders::figure::entry::FS_HULL, wgpu::Face::Front);
        let dm = device.create_shader_module(shaders::dissolve::module());
        let dissolve_layout = device.create_bind_group_layout(&shaders::dissolve::GROUP_0);
        let dissolve =
            gfx::fullscreen(device, format, &dm, &dissolve_layout, shaders::dissolve::entry::VS, shaders::dissolve::entry::FS, None, "figure dissolve");

        let draw = shaders::figure::Draw::SIZE;
        let mut arena = gfx::Arena::new(device, "figure uniforms", 2048 + slots.len() * (draw + 256) + extra.iter().map(|e| e + 256).sum::<usize>());
        let scene_at = arena.reserve(shaders::figure::Scene::SIZE);
        let dissolve_at = arena.reserve(shaders::dissolve::Dissolve::SIZE);
        let extra: Vec<usize> = extra.iter().map(|size| arena.reserve(*size)).collect();
        let scene_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("figure scene"),
            layout: &g0,
            entries: &[wgpu::BindGroupEntry { binding: shaders::figure::S.binding, resource: arena.binding(scene_at, shaders::figure::Scene::SIZE) }],
        });
        let meshes: Vec<GpuMesh> = meshes
            .iter()
            .map(|m| {
                assert!(m.targets.len() <= MAX_TARGETS, "{} morph targets, {MAX_TARGETS} at most", m.targets.len());
                let targets = (!m.targets.is_empty()).then(|| {
                    let flat: Vec<f32> = m.targets.iter().flat_map(|t| t.iter().flatten().copied()).collect();
                    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("figure morph targets"),
                        contents: bytemuck::cast_slice(&flat),
                        usage: wgpu::BufferUsages::STORAGE,
                    })
                });
                GpuMesh {
                    vertices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("figure vertices"),
                        contents: bytemuck::cast_slice(m.vertices),
                        usage: wgpu::BufferUsages::VERTEX,
                    }),
                    indices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("figure indices"),
                        contents: bytemuck::cast_slice(m.indices),
                        usage: wgpu::BufferUsages::INDEX,
                    }),
                    count: m.indices.len() as u32,
                    targets,
                }
            })
            .collect();
        // What a slot that does not morph binds: never read (its target count is 0).
        let none = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("figure no targets"),
            contents: &[0u8; 16],
            usage: wgpu::BufferUsages::STORAGE,
        });
        let slots = slots
            .iter()
            .map(|mesh| {
                let at = arena.reserve(draw);
                let storage = mesh.and_then(|i| meshes[i].targets.as_ref()).unwrap_or(&none);
                let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("figure draw"),
                    layout: &g1,
                    entries: &[
                        wgpu::BindGroupEntry { binding: shaders::figure::D.binding, resource: arena.binding(at, draw) },
                        wgpu::BindGroupEntry { binding: shaders::figure::TARGETS.binding, resource: storage.as_entire_binding() },
                    ],
                });
                Slot { at, bind }
            })
            .collect();
        Figure {
            format,
            generation,
            fill,
            hull,
            dissolve,
            dissolve_layout,
            arena,
            scene_at,
            dissolve_at,
            scene_bind,
            meshes,
            slots,
            targets: None,
            epoch: 0,
            extra,
        }
    }

    /// Whether these pipelines were built for `format` and this shader generation.
    pub fn fits(&self, format: wgpu::TextureFormat, generation: u32) -> bool {
        self.format == format && self.generation == generation
    }

    /// This frame's scene block.
    pub fn scene(&mut self, scene: &shaders::figure::Scene) {
        scene.write(self.arena.at(self.scene_at, shaders::figure::Scene::SIZE));
    }

    /// This frame's block for `slot`.
    pub fn draw(&mut self, slot: usize, draw: &shaders::figure::Draw) {
        let at = self.slots[slot].at;
        draw.write(self.arena.at(at, shaders::figure::Draw::SIZE));
    }

    /// The offset of extra block `i`.
    pub fn extra_at(&self, i: usize) -> usize {
        self.extra[i]
    }

    /// The block at `offset` to fill this frame.
    pub fn block(&mut self, offset: usize, size: usize) -> &mut [u8] {
        self.arena.at(offset, size)
    }

    /// The block at `offset` as a binding.
    pub fn binding(&self, offset: usize, size: usize) -> wgpu::BindingResource<'_> {
        self.arena.binding(offset, size)
    }

    /// The resolved scene of the last `scene_pass`, and the epoch of its targets.
    pub fn resolved(&self) -> Option<(&wgpu::TextureView, u32)> {
        self.targets.as_ref().map(|t| (&t.resolve, self.epoch))
    }

    /// Records the uniforms' copy and the scene pass (`calls`, then `extra` in the same pass,
    /// depth-tested against them) into a target `pixels` in size.
    pub fn scene_pass(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        pixels: (u32, u32),
        calls: &[Call],
        extra: impl FnOnce(&mut wgpu::RenderPass),
    ) {
        if self.targets.as_ref().map(|t| t.size) != Some(pixels) {
            self.targets = Some(targets(device, &self.dissolve_layout, &self.arena, self.dissolve_at, pixels));
            self.epoch += 1;
        }
        self.arena.flush(queue, encoder);
        let tg = self.targets.as_ref().unwrap();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("figure"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &tg.color,
                resolve_target: Some(&tg.resolve),
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Discard },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &tg.depth,
                depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Discard }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_bind_group(0, &self.scene_bind, &[]);
        for (pipeline, hull) in [(&self.fill, false), (&self.hull, true)] {
            pass.set_pipeline(pipeline);
            for call in calls.iter().filter(|c| !hull || c.outlined) {
                let mesh = &self.meshes[call.mesh];
                pass.set_bind_group(1, &self.slots[call.slot].bind, &[]);
                pass.set_vertex_buffer(0, mesh.vertices.slice(..));
                pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.count, 0, 0..1);
            }
        }
        extra(&mut pass);
    }

    /// Records the frame: the scene, then the dissolve onto `target` (`pixels` wide and high)
    /// between `fade` (start, end down the canvas) at `opacity`.
    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        pixels: (u32, u32),
        fade: (f32, f32),
        opacity: f32,
        calls: &[Call],
    ) {
        let dissolve = shaders::dissolve::Dissolve { fade: [fade.0, fade.1, opacity, if self.format.is_srgb() { 1.0 } else { 0.0 }] };
        dissolve.write(self.arena.at(self.dissolve_at, shaders::dissolve::Dissolve::SIZE));
        self.scene_pass(device, queue, encoder, pixels, calls, |_| {});
        let tg = self.targets.as_ref().unwrap();
        gfx::pass(encoder, "figure dissolve", target, &self.dissolve, &tg.dissolve_bind);
    }

    /// A hash of the uniforms the last frame wrote (gfx::Stillness).
    pub fn fingerprint(&self) -> u64 {
        self.arena.fingerprint()
    }

    /// The frame was submitted.
    pub fn submitted(&mut self) {
        self.arena.submitted();
    }
}

fn targets(device: &wgpu::Device, layout: &wgpu::BindGroupLayout, arena: &gfx::Arena, dissolve_at: usize, (width, height): (u32, u32)) -> Targets {
    let texture = |label, format, samples, usage| {
        device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: samples,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage,
                view_formats: &[],
            })
            .create_view(&Default::default())
    };
    let color = texture("figure msaa", SCENE_FORMAT, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT);
    let resolve = texture("figure scene", SCENE_FORMAT, 1, wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING);
    let depth = texture("figure depth", DEPTH_FORMAT, MSAA, wgpu::TextureUsages::RENDER_ATTACHMENT);
    let dissolve_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("figure dissolve"),
        layout,
        entries: &[
            wgpu::BindGroupEntry { binding: shaders::dissolve::U.binding, resource: arena.binding(dissolve_at, shaders::dissolve::Dissolve::SIZE) },
            wgpu::BindGroupEntry { binding: shaders::dissolve::SCENE.binding, resource: wgpu::BindingResource::TextureView(&resolve) },
        ],
    });
    Targets { size: (width, height), color, resolve, depth, dissolve_bind }
}
