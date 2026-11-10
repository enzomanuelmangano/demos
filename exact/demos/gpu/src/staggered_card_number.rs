//! Staggered Card Number's sixteen digits (src/animations/staggered-card-number/components/
//! card-info/hideable-number.tsx), each with its two expo-blur BlurViews: the row of
//! HideableNumbers inside the card's `numbers` row (the Contract draws the card, the title and the
//! eye button).
//!
//! - Cell i: an 11 × 25 View, overflow hidden, at x = 11·i + 8·⌊i / 4⌋ (marginRight 8 after each
//!   group of four). In it two absolute boxes (`styles.box`: 25 tall, the content centred,
//!   shrink-wrapped to the content's width):
//!   - the dot: Octicons dot-fill 14 black with paddingTop 3 (box 14 wide, wider than the cell),
//!     opacity progress³, translateY −25·(1 − progress), and over it a `<BlurView tint="light">`
//!     (absoluteFill) of intensity 25·(1 − progress);
//!   - the digit: FiraCode-Regular 20 (box 12 wide), opacity (1 − progress)³, translateY
//!     25·progress, and over it a `<BlurView>` (tint default: `.regular`, the app's dark
//!     appearance) of intensity 25·progress.
//! - progress = withDelay(25·i, withSpring(hidden ? 1 : 0, { duration: 700, dampingRatio: 1 })),
//!   hidden = toggled and i < 12. As Reanimated's withDelay: the previous animation runs on
//!   through the delay; the spring then starts from where it is with velocity 0 (the delay object
//!   it inherits has none) and its constants solved for that start.
//! - The blur (`skia::backdrop`): the repo's expo-blur patch sets `fractionComplete` straight
//!   from intensity / 100 after the first value (only the initial one is clamped to 0.01), so 0 is
//!   no effect. Each box's opacity composites as a group: bg·(1 − a) + a·E, E the chain over what
//!   lies under the box with the group's own glyph at full opacity (blur-probe, `.light`). Under
//!   the digit's box lies the card and the dot's composite; under the dot's, only the card: a
//!   cell's boxes reach into the next cell (dot 14, digit 12 wide), which UIKit draws later, so
//!   each backdrop reads a layer holding cells of one parity only.
//! - The glyphs are each Text's raster at rest moved by Core Animation: a fractional translateY
//!   samples the layer bilinearly. Text boxes: the line (hhea ascender + descender + lineGap)
//!   rounded up to the device pixel and clamped to the box (Fabric's measure clamps to its
//!   constraints: the digit's 26.24 pt line is 25 tall, its baseline 19.8 below the box's top,
//!   not the overflowing line's 19.13 — 60 px on the RN capture), its top floored to the pixel
//!   grid (a Text node's), the baseline on the next pixel row; TextKit sets an icon glyph half the
//!   font's lineGap lower.
//!
//! Inputs: toggled, the canvas's window origin (x, y, points). The canvas is the numbers row,
//! 208 × 25 (sixteen cells, three gaps and the last cell's trailing 8).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::Spring;
use skia::backdrop::{BackdropBlur, Material, BACKDROP_WGSL};
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::gfx;

static FIRA: &[u8] = include_bytes!("../fonts/fira-code-regular.ttf");
static OCTICONS: &[u8] = include_bytes!("../fonts/octicons-dot-fill-subset.ttf");
/// Octicons `dot-fill`.
const DOT: &str = "\u{f155}";
const DIGITS: &str = "2223000048400011";
const CELLS: usize = 16;
/// HIDDEN_INDEXES: the first 12.
const TOGGLED: usize = 12;
/// HideableNumberHeight; the cell's width.
const H: f32 = 25.0;
const CELL_W: f32 = 11.0;
/// MaxBlurIntensity.
const MAX_INTENSITY: f64 = 25.0;
/// DotSize; styles.cardNumber.fontSize.
const DOT_SIZE: f32 = 14.0;
const DIGIT_SIZE: f32 = 20.0;
/// The dot Text's paddingTop.
const DOT_PAD: f32 = 3.0;
/// The layers' margin above and below the row (points): a box moves up to 25 out of its cell.
const PAD: f32 = 25.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const COMPOSE_SLOT: u64 = 512;
const BLEND_SLOT: u64 = 256;
/// Compose slots: dots even/odd, digits even/odd, the final copy.
const COMPOSES: u64 = 5;

/// The demo's digits surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(digits())
}

fn digits() -> Digits {
    Digits {
        toggled: false,
        applied: None,
        toggle_at: None,
        origin: [0.0, 0.0],
        springs: [Spring::at(0.0); CELLS],
        pending: [None; CELLS],
        dot_font: Font::new(OCTICONS, DOT_SIZE).map(Font::with_ui_layout),
        digit_font: Font::new(FIRA, DIGIT_SIZE).map(Font::with_ui_layout),
        canvas: Canvas::default(),
        renderers: [Renderer::default(), Renderer::default()],
        blurs: (0..CELLS * 2).map(|_| BackdropBlur::default()).collect(),
        gpu: None,
        rest_drawn: false,
    }
}

/// The cell's left edge (points): `marginRight: index !== 0 && (index + 1) % 4 === 0 ? 8 : 0`.
pub fn cell_x(i: usize) -> f32 {
    i as f32 * CELL_W + 8.0 * (i / 4) as f32
}

/// One cell's frame: progress → (dot opacity, dot translateY, dot intensity, digit opacity, digit
/// translateY, digit intensity).
pub fn cell_state(p: f64) -> [f64; 6] {
    [
        p.powi(3),
        -(H as f64) * (1.0 - p),
        MAX_INTENSITY * (1.0 - p),
        (1.0 - p).powi(3),
        H as f64 * p,
        MAX_INTENSITY * p,
    ]
}

/// A Text node's baseline in a 25 pt box that centres it (points from the box's top):
/// `pad_top` above a line of `font`, the glyph `gap` lower than the ascender (TextKit's half
/// lineGap for an icon font).
fn text_baseline(font: &Font, pad_top: f32, gap: f32, scale: f32) -> f32 {
    let m = font.metrics();
    let line = -m.ascent + m.descent + m.leading;
    // Fabric clamps the measured size to the constraints: the digit's 26.24 pt line is 25 tall.
    let text_h = (pad_top + ((line * scale - 1e-4).ceil() / scale)).min(H);
    let top = (((H - text_h) / 2.0) * scale + 1e-4).floor() / scale;
    ((top + pad_top + gap - m.ascent) * scale - 1e-4).ceil() / scale
}

struct Gpu {
    size: (u32, u32),
    format: wgpu::TextureFormat,
    /// The glyphs at rest: dots, digits (canvas pixels, premultiplied).
    rest: [wgpu::TextureView; 2],
    /// Per parity: under the dots (card + dots), the composite so far, under the digits.
    under_dots: [wgpu::TextureView; 2],
    composite: [wgpu::TextureView; 2],
    under_digits: [wgpu::TextureView; 2],
    compose: [wgpu::RenderPipeline; 3],
    blend: wgpu::RenderPipeline,
    blend_layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// Dots even/odd, digits even/odd, final.
    compose_binds: Vec<wgpu::BindGroup>,
    /// Per blur (dot i, digit i): the views it was built on and the bind group.
    blend_binds: Vec<Option<(wgpu::TextureView, wgpu::TextureView, wgpu::BindGroup)>>,
}

struct Digits {
    toggled: bool,
    applied: Option<bool>,
    toggle_at: Option<f64>,
    origin: [f32; 2],
    springs: [Spring; CELLS],
    /// A delayed spring: when it starts, its target.
    pending: [Option<(f64, f64)>; CELLS],
    dot_font: Option<Font>,
    digit_font: Option<Font>,
    canvas: Canvas,
    renderers: [Renderer; 2],
    blurs: Vec<BackdropBlur>,
    gpu: Option<Gpu>,
    rest_drawn: bool,
}

impl Digits {
    /// Starts each cell's withDelay(25·i, withSpring(…)) at `now`, and runs the springs to `now`.
    fn step(&mut self, now: f64) -> bool {
        if self.applied != Some(self.toggled) {
            let first = self.applied.is_none();
            self.applied = Some(self.toggled);
            let to = if self.toggled { 1.0 } else { 0.0 };
            for i in 0..TOGGLED {
                if first {
                    self.springs[i] = Spring::at(to);
                } else {
                    self.pending[i] =
                        Some((self.toggle_at.unwrap_or(now).min(now) + 25.0 * i as f64, to));
                }
            }
            self.toggle_at = None;
        }
        let mut moving = false;
        for i in 0..CELLS {
            if let Some((at, to)) = self.pending[i] {
                if now >= at {
                    self.pending[i] = None;
                    let s = &mut self.springs[i];
                    let x0 = s.value - to;
                    s.to(
                        to,
                        0.0,
                        reanimated::duration_config(x0, 0.0, 700.0, 1.0, 4.0),
                    );
                } else {
                    moving = true;
                }
            }
            moving |= self.springs[i].step(now);
        }
        moving
    }

    fn ensure(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat, size: (u32, u32)) {
        if self
            .gpu
            .as_ref()
            .is_some_and(|g| g.size == size && g.format == format)
        {
            return;
        }
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("staggered card number"),
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let blend_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("staggered card number blend"),
            source: wgpu::ShaderSource::Wgsl(format!("{BACKDROP_WGSL}{BLEND_SHADER}").into()),
        });
        let tex = |i: u32| wgpu::BindGroupLayoutEntry {
            binding: i,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let smp = |i: u32| wgpu::BindGroupLayoutEntry {
            binding: i,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        };
        let uni = |i: u32| wgpu::BindGroupLayoutEntry {
            binding: i,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        };
        let compose_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("compose"),
            entries: &[tex(0), tex(1), tex(2), smp(3), uni(4)],
        });
        let blend_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("blend"),
            entries: &[tex(0), tex(1), smp(2), uni(3)],
        });
        let compose = [
            gfx::fullscreen(
                device,
                LAYER,
                &shader,
                &compose_layout,
                "vs",
                "under_dots",
                None,
                "under dots",
            ),
            gfx::fullscreen(
                device,
                LAYER,
                &shader,
                &compose_layout,
                "vs",
                "under_digits",
                None,
                "under digits",
            ),
            gfx::fullscreen(
                device,
                format,
                &shader,
                &compose_layout,
                "vs",
                "copy_out",
                None,
                "copy out",
            ),
        ];
        let constant = wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::Constant,
            dst_factor: wgpu::BlendFactor::OneMinusConstant,
            operation: wgpu::BlendOperation::Add,
        };
        let blend = gfx::fullscreen(
            device,
            LAYER,
            &blend_shader,
            &blend_layout,
            "vs",
            "group",
            Some(wgpu::BlendState {
                color: constant,
                alpha: constant,
            }),
            "group opacity",
        );
        let (pw, ph) = size;
        let padded = ph + (2.0 * PAD * ph as f32 / H).round() as u32;
        let t = |label| gfx::target(device, label, LAYER, pw, padded);
        let rest = [
            gfx::target(device, "dots at rest", LAYER, pw, ph),
            gfx::target(device, "digits at rest", LAYER, pw, ph),
        ];
        let under_dots = [t("under dots even"), t("under dots odd")];
        let composite = [t("composite even"), t("composite odd")];
        let under_digits = [t("under digits even"), t("under digits odd")];
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("staggered card number"),
            size: COMPOSES * COMPOSE_SLOT + (CELLS * 2) as u64 * BLEND_SLOT,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let sampler = gfx::linear_sampler(device, "staggered card number");
        let compose_bind =
            |slot: u64, a: &wgpu::TextureView, b: &wgpu::TextureView, c: &wgpu::TextureView| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("compose"),
                    layout: &compose_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(a),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(b),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::TextureView(c),
                        },
                        wgpu::BindGroupEntry {
                            binding: 3,
                            resource: wgpu::BindingResource::Sampler(&sampler),
                        },
                        wgpu::BindGroupEntry {
                            binding: 4,
                            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                                buffer: &uniforms,
                                offset: slot * COMPOSE_SLOT,
                                size: wgpu::BufferSize::new(COMPOSE_SLOT),
                            }),
                        },
                    ],
                })
            };
        let compose_binds = vec![
            compose_bind(0, &rest[0], &rest[0], &rest[0]),
            compose_bind(1, &rest[0], &rest[0], &rest[0]),
            compose_bind(2, &rest[1], &composite[0], &rest[1]),
            compose_bind(3, &rest[1], &composite[1], &rest[1]),
            compose_bind(4, &rest[1], &composite[0], &composite[1]),
        ];
        self.gpu = Some(Gpu {
            size,
            format,
            rest,
            under_dots,
            composite,
            under_digits,
            compose,
            blend,
            blend_layout,
            uniforms,
            sampler,
            compose_binds,
            blend_binds: (0..CELLS * 2).map(|_| None).collect(),
        });
        self.renderers = [Renderer::default(), Renderer::default()];
        self.rest_drawn = false;
    }
}

impl Surface for Digits {
    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        let toggled = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        if toggled != self.toggled && self.applied.is_some() {
            self.toggle_at = at_ms;
        }
        self.toggled = toggled;
        for k in 0..2 {
            self.origin[k] = inputs.get(k + 1).and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let p: Vec<String> = self
            .springs
            .iter()
            .map(|s| format!("{:.3}", s.value))
            .collect();
        Some(format!(
            "{{\"toggled\":{},\"progress\":[{}]}}",
            self.toggled,
            p.join(",")
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
        let moving = self.step(frame.now_ms);
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        self.ensure(device, format, (pw, ph));
        if !self.rest_drawn {
            self.rest_drawn = true;
            // Each glyph at rest in its cell.
            for (k, font) in [&self.dot_font, &self.digit_font].into_iter().enumerate() {
                let c = &mut self.canvas;
                c.begin(s);
                if let Some(font) = font {
                    let gap = if k == 0 {
                        font.metrics().leading / 2.0
                    } else {
                        0.0
                    };
                    let baseline = text_baseline(font, if k == 0 { DOT_PAD } else { 0.0 }, gap, s);
                    for (i, d) in DIGITS.chars().enumerate() {
                        let text = if k == 0 {
                            DOT.to_string()
                        } else {
                            d.to_string()
                        };
                        c.save();
                        c.clip_rect(cell_x(i), 0.0, CELL_W, H);
                        c.draw_text(&text, cell_x(i), baseline, font, &Paint::fill(Color::BLACK));
                        c.restore();
                    }
                }
                let gpu = self.gpu.as_ref().unwrap();
                self.renderers[k].draw(
                    device,
                    queue,
                    encoder,
                    &self.canvas,
                    &gpu.rest[k],
                    LAYER,
                    pw,
                    ph,
                    wgpu::Color::TRANSPARENT,
                );
            }
        }
        let pad = (PAD * s).round();
        let states: Vec<[f64; 6]> = self.springs.iter().map(|sp| cell_state(sp.value)).collect();
        let mut data =
            vec![0u8; (COMPOSES * COMPOSE_SLOT + (CELLS * 2) as u64 * BLEND_SLOT) as usize];
        let put = |data: &mut Vec<u8>, at: u64, v: &[f32]| {
            data[at as usize..at as usize + v.len() * 4]
                .copy_from_slice(&v.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>());
        };
        let mut table = Vec::with_capacity(CELLS * 4 + 8);
        for (i, st) in states.iter().enumerate() {
            table.extend_from_slice(&[cell_x(i) * s, st[1] as f32 * s, st[4] as f32 * s, 0.0]);
        }
        for slot in 0..COMPOSES {
            let mut v = table.clone();
            v.extend_from_slice(&[
                CELL_W * s,
                H * s,
                pad,
                (slot % 2) as f32,
                gfx::srgb_flag(format),
                0.0,
                0.0,
                0.0,
            ]);
            put(&mut data, slot * COMPOSE_SLOT, &v);
        }
        let window = [self.origin[0] * s, (self.origin[1] - PAD) * s];
        let gpu = self.gpu.as_mut().unwrap();
        let padded_h = ph + 2 * pad as u32;
        // The card and each dot at full opacity, one parity per layer.
        for p in 0..2 {
            gfx::pass(
                encoder,
                "under dots",
                &gpu.under_dots[p],
                &gpu.compose[0],
                &gpu.compose_binds[p],
            );
        }
        // Each box's backdrop: the region under its frame (rounded to the pixel), the scissor the
        // part of it inside the cell.
        let boxes = |i: usize, ty: f64, w: f32| -> ([i32; 4], [u32; 4]) {
            let top = (pad as f64 + ty * s as f64).round() as i32;
            let x0 = (cell_x(i) * s).round() as i32;
            let region = [
                x0,
                top,
                x0 + (w * s).round() as i32,
                top + (H * s).round() as i32,
            ];
            let y0 = top.max(pad as i32);
            let y1 = (top + (H * s).round() as i32).min(pad as i32 + (H * s).round() as i32);
            let clip_w = (CELL_W.min(w) * s).round() as u32;
            (
                region,
                [x0 as u32, y0.max(0) as u32, clip_w, (y1 - y0).max(0) as u32],
            )
        };
        // (blur index, cell, alpha, scissor).
        let mut draws: [Vec<(usize, f32, [u32; 4])>; 2] = [Vec::new(), Vec::new()];
        for layer in 0..2 {
            let mut groups = Vec::new();
            for (i, st) in states.iter().enumerate() {
                let (alpha, ty, intensity, width, material) = if layer == 0 {
                    (st[0], st[1], st[2], DOT_SIZE, Material::Light)
                } else {
                    (st[3], st[4], st[5], 12.0, Material::Regular)
                };
                let (region, scissor) = boxes(i, ty, width);
                if alpha <= 0.0 || scissor[3] == 0 {
                    continue;
                }
                let k = layer * CELLS + i;
                let src = if layer == 0 {
                    gpu.under_dots[i % 2].clone()
                } else {
                    gpu.under_digits[i % 2].clone()
                };
                let src = &src;
                let fraction = (intensity / 100.0) as f32;
                let (low, m, direct) = if fraction > 0.0 {
                    let params = material.chain().at(fraction);
                    let b =
                        self.blurs[k].run(device, queue, encoder, src, region, window, &params, s);
                    (b.view.clone(), b.mapping, 0.0)
                } else {
                    (src.clone(), [[0.0; 4]; 2], 1.0)
                };
                put(
                    &mut data,
                    COMPOSES * COMPOSE_SLOT + k as u64 * BLEND_SLOT,
                    &[
                        m[0][0], m[0][1], m[0][2], m[0][3], m[1][0], m[1][1], m[1][2], m[1][3],
                        direct, 0.0, 0.0, 0.0,
                    ],
                );
                if gpu.blend_binds[k]
                    .as_ref()
                    .is_none_or(|(l, sv, _)| *l != low || sv != src)
                {
                    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("group"),
                        layout: &gpu.blend_layout,
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&low),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::TextureView(src),
                            },
                            wgpu::BindGroupEntry {
                                binding: 2,
                                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                            },
                            wgpu::BindGroupEntry {
                                binding: 3,
                                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                                    buffer: &gpu.uniforms,
                                    offset: COMPOSES * COMPOSE_SLOT + k as u64 * BLEND_SLOT,
                                    size: wgpu::BufferSize::new(BLEND_SLOT),
                                }),
                            },
                        ],
                    });
                    gpu.blend_binds[k] = Some((low, src.clone(), bind));
                }
                groups.push((k, alpha as f32, scissor));
            }
            draws[layer] = groups;
            // Each group at its opacity over the composite (cleared to the card first).
            for p in 0..2 {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("groups"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &gpu.composite[p],
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: if layer == 0 {
                                wgpu::LoadOp::Clear(wgpu::Color::WHITE)
                            } else {
                                wgpu::LoadOp::Load
                            },
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                pass.set_pipeline(&gpu.blend);
                for &(k, alpha, r) in draws[layer].iter().filter(|(k, _, _)| (k % CELLS) % 2 == p) {
                    let r = [
                        r[0].min(pw),
                        r[1].min(padded_h),
                        r[2].min(pw - r[0].min(pw)),
                        r[3].min(padded_h - r[1].min(padded_h)),
                    ];
                    if r[2] == 0 || r[3] == 0 {
                        continue;
                    }
                    pass.set_bind_group(0, &gpu.blend_binds[k].as_ref().unwrap().2, &[]);
                    pass.set_blend_constant(wgpu::Color {
                        r: alpha as f64,
                        g: alpha as f64,
                        b: alpha as f64,
                        a: alpha as f64,
                    });
                    pass.set_scissor_rect(r[0], r[1], r[2], r[3]);
                    pass.draw(0..3, 0..1);
                }
            }
            if layer == 0 {
                // The composite so far and each digit at full opacity, one parity per layer.
                for p in 0..2 {
                    gfx::pass(
                        encoder,
                        "under digits",
                        &gpu.under_digits[p],
                        &gpu.compose[1],
                        &gpu.compose_binds[2 + p],
                    );
                }
            }
        }
        gfx::pass(
            encoder,
            "copy out",
            target,
            &gpu.compose[2],
            &gpu.compose_binds[4],
        );
        queue.write_buffer(&gpu.uniforms, 0, &data);
        moving
    }
}

const SHADER: &str = r#"
struct Compose {
    // x0 (px), the dot's translateY (px), the digit's (px), -
    cells: array<vec4<f32>, 16>,
    // the cell's width (px), the row's height (px), the layers' top margin (px), parity
    geo: vec4<f32>,
    // 1 when the target encodes sRGB itself
    out: vec4<f32>,
};
@group(0) @binding(0) var ta: texture_2d<f32>;
@group(0) @binding(1) var tb: texture_2d<f32>;
@group(0) @binding(2) var tc: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var<uniform> u: Compose;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
// The cell whose clip holds pixel column x, or -1.
fn cell_at(x: f32) -> i32 {
    for (var i = 0; i < 16; i++) {
        let x0 = u.cells[i].x;
        if (x >= x0 && x < x0 + u.geo.x) { return i; }
    }
    return -1;
}
// A glyph layer at rest, moved down by ty (px): Core Animation's bilinear sample.
fn moved(t: texture_2d<f32>, px: vec2<f32>, ty: f32) -> vec4<f32> {
    let size = vec2<f32>(textureDimensions(t));
    return textureSampleLevel(t, smp, (px - vec2<f32>(0.0, ty)) / size, 0.0);
}
fn inside(i: i32, y: f32) -> bool {
    return i >= 0 && f32(i % 2) == u.geo.w && y >= 0.0 && y < u.geo.y;
}
// The card under the dots of one parity: white, each dot at full opacity, clipped to its cell.
@fragment fn under_dots(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let i = cell_at(pos.x);
    let y = pos.y - u.geo.z;
    if (!inside(i, y)) { return vec4<f32>(1.0); }
    let r = moved(ta, vec2<f32>(pos.x, y), u.cells[i].y);
    return vec4<f32>(r.rgb + vec3<f32>(1.0 - r.a), 1.0);
}
// What lies under the digits of one parity: the composite so far and each digit at full opacity.
@fragment fn under_digits(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let base = textureLoad(tb, vec2<i32>(pos.xy), 0);
    let i = cell_at(pos.x);
    let y = pos.y - u.geo.z;
    if (!inside(i, y)) { return base; }
    let r = moved(ta, vec2<f32>(pos.x, y), u.cells[i].z);
    return vec4<f32>(r.rgb + base.rgb * (1.0 - r.a), 1.0);
}
fn decode(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
// The row: each cell from its parity's composite, the card's white between.
@fragment fn copy_out(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let i = cell_at(pos.x);
    var c = vec3<f32>(1.0);
    let p = vec2<i32>(i32(pos.x), i32(pos.y + u.geo.z));
    if (i >= 0) {
        c = select(textureLoad(tc, p, 0).rgb, textureLoad(tb, p, 0).rgb, i % 2 == 0);
    }
    return vec4<f32>(select(c, decode(c), u.out.x > 0.5), 1.0);
}
"#;

const BLEND_SHADER: &str = r#"
struct Blend { m: vec4<f32>, n: vec4<f32>, k: vec4<f32> };
@group(0) @binding(0) var low: texture_2d<f32>;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var<uniform> b: Blend;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
// A box's group: its effect E (or, with no effect, what is under it), blended at the group's
// opacity by the pipeline's blend constant.
@fragment fn group(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    if (b.k.x > 0.5) { return vec4<f32>(textureLoad(src, vec2<i32>(pos.xy), 0).rgb, 1.0); }
    return vec4<f32>(textureSampleLevel(low, smp, backdrop_uv(pos.xy, b.m, b.n), 0.0).rgb, 1.0);
}
"#;

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    /// The row with every cell at progress `p`, as the iPhone Air shows it (the canvas at (46,
    /// 456.33): the card's left 21 + paddingHorizontal 25; its top 416 + paddingTop 15 + the
    /// title's 61 px + marginTop 5).
    fn row(
        render: &mut dyn FnMut(&mut Digits, &Frame) -> fixture::Pixels,
        p: f64,
    ) -> fixture::Pixels {
        let mut d = digits();
        d.bind(
            &[
                Value::Bool(false),
                Value::Number(46.0),
                Value::Number(416.0 + 15.0 + 61.0 / 3.0 + 5.0),
            ],
            None,
        )
        .unwrap();
        let frame = Frame {
            width: 208.0,
            height: 25.0,
            scale: 3.0,
            now_ms: 0.0,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let _ = render(&mut d, &frame);
        // Every spring held at p, as a frame mid-animation has it.
        d.springs = [Spring::at(p); CELLS];
        render(&mut d, &frame)
    }

    #[test]
    fn rest_and_sweep() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut render = |d: &mut Digits, f: &Frame| fixture::render(&gpu, d, f).unwrap().0;
        let shown = row(&mut render, 0.0);
        // A digit's ink (black) in cell 0, white between the groups.
        assert!(shown.at(5 * 3 + 1, 15 * 3)[0] < 128 || (0..33).any(|x| shown.at(x, 45)[0] < 64));
        assert_eq!(shown.at(46 * 3, 30)[..3], [255, 255, 255]);
        let Some(dir) = std::env::var_os("SCN_SWEEP") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        for k in 0..=100 {
            let img = row(&mut render, k as f64 / 100.0);
            let mut out = Vec::with_capacity((img.width * img.height * 3) as usize);
            for px in img.data.chunks(4) {
                out.extend_from_slice(&px[..3]);
            }
            std::fs::write(dir.join(format!("p{k:03}.rgb")), out).unwrap();
        }
    }
}
