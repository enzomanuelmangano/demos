//! Atlas Sphere (src/animations/atlas-sphere/atlas-sphere.tsx): a grid of small cyan dots that,
//! under a finger, shrink with their distance from it and gather toward it, as if wrapped on a
//! sphere; they spread back when it lifts.
//!
//! - The grid (CANVAS = the canvas the Contract sizes): SQUARES_AMOUNT_HORIZONTAL 40,
//!   SQUARE_CONTAINER_SIZE = floor(SCREEN_WIDTH / 48) = the canvas's width / 40, rows =
//!   floor(CANVAS_HEIGHT / SQUARE_CONTAINER_SIZE); sprite `i` at ((i % 40) · C, floor(i / 40) · C).
//! - Each sprite is the texture's (0, 0, 3, 3): BASE_SQUARE, a #00f7ff circle of r 1.5 at
//!   (1.5, 1.5) that useTexture records into a picture and plays into
//!   `Skia.Surface.MakeOffscreen(C, C)`: a C × C pixel BGRA8 premultiplied Graphite surface (one
//!   pixel per point, not per device pixel). There the anti-aliased circle takes Graphite's
//!   AnalyticRRectRenderStep (drawCircle → drawOval → drawRRect(oval) → `is_simple_shape`);
//!   `circle_texture` replays that step's mesh and coverage on the CPU (see there).
//! - `<Atlas>` draws it with drawAtlas's default `SkSamplingOptions(kLinear)` and the image
//!   shader's clamp: the same texture here, sampled by the GPU's own bilinear filter.
//! - Per sprite: d = point − grid (0 with no point yet), pd = |d| · progress; scale = pd >
//!   SCALE_DISTANCE ? 0.1 : 1 + pd / SCALE_DISTANCE · (0.1 − 1), SCALE_DISTANCE = √(W² + H²) / 4;
//!   scale ≤ 0.1 hides it; else RSXform(scale, 0, grid + d (1 − scale) progress²).
//! - Pan: onBegin, progress = withSpring(1, { duration 600, dampingRatio 1 }) and the point; onUpdate
//!   (once active, after 10 pt), the point; onTouchesUp, withSpring(0, { duration 1000,
//!   dampingRatio 1 }).
//!
//! The transforms are computed in the vertex shader, one instance per sprite: a frame writes
//! one uniform buffer.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use reanimated::Spring;

use crate::{gfx, shaders};
use shaders::atlas_sphere::{entry, module, Uniforms, CIRCLE, GROUP_0, SMP, U};

/// SQUARES_AMOUNT_HORIZONTAL.
const COLUMNS: u32 = 40;
/// SQUARE_SIZE: the circle's diameter, the sprite's side.
const SQUARE_SIZE: f32 = 3.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(AtlasSphere { pan: PanGesture::new(), ..Default::default() })
}

#[derive(Default)]
struct AtlasSphere {
    size: (f32, f32),
    point: Option<(f32, f32)>,
    progress: Spring,
    pan: PanGesture,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The texture's side, SQUARE_CONTAINER_SIZE in pixels.
    side: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

/// The circle's colour, #00f7ffff, as the 8-bit values Graphite blends.
const COLOR: [f32; 3] = [0.0, 247.0 / 255.0, 1.0];

/// The texture useTexture makes of BASE_SQUARE: `side × side` premultiplied RGBA8 texels.
///
/// RN Skia 3.7.2 is Skia m157 Graphite on Dawn/Metal. `drawCircle(1.5, 1.5, 1.5)` with an
/// anti-aliased fill reaches `Device::drawRRect(SkRRect::MakeOval(0, 0, 3, 3))`, a simple shape,
/// so `chooseRenderer` returns `analyticRRect()`. That step draws one instance of a fixed
/// 36-vertex, 69-index triangle strip (AnalyticRRectRenderStep.cpp), placed by
/// `analytic_rrect_vertex_fn` (sksl_graphite_vert.sksl), and every covered pixel centre gets
/// `analytic_rrect_coverage_fn` (sksl_graphite_frag.sksl); src-over then writes
/// `color · coverage` rounded to 8 bits. This replays exactly that: the same vertices (identity
/// transform, local AA radius 1; insets intersecting for a 3-pt circle, so the inner vertices
/// snap to the centre), the GPU's rasterization (8-bit sub-pixel snapping, top-left rule), the
/// interpolated varyings and the fragment function, branch for branch.
pub(crate) fn circle_texture(side: u32) -> Vec<[u8; 4]> {
    let r = SQUARE_SIZE / 2.0;
    let coverage = rrect_coverage([0.0, 0.0, SQUARE_SIZE, SQUARE_SIZE], r, side);
    coverage
        .into_iter()
        .map(|c| {
            // src-over onto the cleared surface: color · coverage, written as 8 bits.
            let c = c.unwrap_or(0.0);
            [COLOR[0] * c, COLOR[1] * c, COLOR[2] * c, c].map(unorm8)
        })
        .collect()
}

fn unorm8(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

/// AnalyticRRectRenderStep for a filled rrect `ltrb` with circular radius `r` on every corner,
/// under the identity: per pixel of a `side × side` target, the coverage of the fragment that
/// lands. The step's depth test is LESS with writes (Renderer.cpp: `kUseNonAAInnerFill`) and the
/// whole instance has one depth, so of the triangles covering a pixel centre only the first in
/// strip order is blended (the strip draws some triangles twice, e.g. TL+5, TL+2, TL+3).
pub(crate) fn rrect_coverage(ltrb: [f32; 4], r: f32, side: u32) -> Vec<Option<f32>> {
    let [l, t, rt, b] = ltrb;
    // The local AA radius under the identity is 1 (Transform::localAARadius); writeVertices
    // marks it -1 (kComplexAAInsets) when opposite_insets_intersect: 2 · aa ≥ size − radius.
    let complex = 2.0 >= (rt - l) - r || 2.0 >= (b - t) - r;
    let center = [(l + rt) / 2.0, (t + b) / 2.0];
    let xs = [l, rt, rt, l];
    let ys = [t, t, b, b];
    // Normalised local edge vectors L, T, R, B (xs − xs.wxyz).
    let dx = [0.0f32, 1.0, 0.0, -1.0];
    let dy = [-1.0f32, 0.0, 1.0, 0.0];
    const ROUND: f32 = 0.414_213_57; // kRoundScale, √2 − 1
    let hr2 = 0.5 * std::f32::consts::SQRT_2;
    // get_per_corner_vertex_attrs: position, normal, normalScale, centerWeight.
    let template: [([f32; 2], [f32; 2], f32, f32); 9] = [
        ([1.0, 0.0], [1.0, 0.0], 1.0, 0.0),
        ([1.0, 0.0], [hr2, hr2], 1.0, 0.0),
        ([0.0, 1.0], [hr2, hr2], 1.0, 0.0),
        ([0.0, 1.0], [0.0, 1.0], 1.0, 0.0),
        ([1.0, 0.0], [hr2, hr2], 0.0, 0.0),
        ([0.0, 1.0], [hr2, hr2], 0.0, 0.0),
        ([1.0, 0.0], [1.0, 0.0], -1.0, 0.0),
        ([0.0, 1.0], [0.0, 1.0], -1.0, 0.0),
        ([1.0, 0.0], [1.0, 0.0], -1.0, 1.0),
    ];
    // analytic_rrect_vertex_fn → (device position, local position, perPixelControl).
    let perp = |v: [f32; 2]| [-v[1], v[0]];
    let mut verts = Vec::with_capacity(36);
    for corner in 0..4 {
        let next = (corner + 1) % 4;
        let x_axis = [-dx[next], -dy[next]];
        let y_axis = [dx[corner], dy[corner]];
        for &(position, normal, normal_scale, center_weight) in &template {
            let local = if normal_scale < 0.0 && (complex || center_weight != 0.0) {
                center
            } else {
                let lp = if normal_scale < 0.0 {
                    // Inset by the AA radius (1): mitered when the radius doesn't exceed it.
                    if r <= 1.0 { [r - 1.0, r - 1.0] } else { [r * position[0] - normal[0], r * position[1] - normal[1]] }
                } else {
                    [r * (position[0] + ROUND * position[1]), r * (position[1] + ROUND * position[0])]
                };
                let lp = [lp[0] - r, lp[1] - r];
                [xs[corner] + x_axis[0] * lp[0] + y_axis[0] * lp[1], ys[corner] + x_axis[1] * lp[0] + y_axis[1] * lp[1]]
            };
            let mut dev = local;
            let mut ppc_y = 0.0;
            if normal_scale > 0.0 {
                // cornerAspectRatio = radii.yx; the Jacobian is the identity.
                let (px, py) = (perp([-y_axis[0], -y_axis[1]]), perp(x_axis));
                let n = [r * normal[0] * px[0] + r * normal[1] * py[0], r * normal[0] * px[1] + r * normal[1] * py[1]];
                let len = n[0].hypot(n[1]);
                dev = [dev[0] + n[0] / len, dev[1] + n[1] / len];
                ppc_y = -1.0;
            }
            let ppc_x = if center_weight != 0.0 { 1.0 } else { 0.0 };
            verts.push((dev, local, [ppc_x, ppc_y]));
        }
    }
    const TL: usize = 0;
    const TR: usize = 9;
    const BR: usize = 18;
    const BL: usize = 27;
    #[rustfmt::skip]
    let indices: [usize; 69] = [
        TL, TL+4, TL+1, TL+5, TL+2, TL+3, TL+5,
        TR, TR+4, TR+1, TR+5, TR+2, TR+3, TR+5,
        BR, BR+4, BR+1, BR+5, BR+2, BR+3, BR+5,
        BL, BL+4, BL+1, BL+5, BL+2, BL+3, BL+5,
        TL, TL+4,
        TL+4, TL+6, TL+5, TL+7,
        TR+4, TR+6, TR+5, TR+7,
        BR+4, BR+6, BR+5, BR+7,
        BL+4, BL+6, BL+5, BL+7,
        TL+4, TL+6,
        TL+6, TL+8, TL+7, TL+7, TR+8,
        TR+6, TR+8, TR+7, TR+7, BR+8,
        BR+6, BR+8, BR+7, BR+7, BL+8,
        BL+6, BL+8, BL+7, BL+7, TL+8,
        TL+6,
    ];
    // Rasterization: vertices snapped to 1/256 pixel, pixel centres, the top-left fill rule.
    let snap = |p: [f32; 2]| [(p[0] * 256.0).round() / 256.0, (p[1] * 256.0).round() / 256.0];
    let mut out = vec![None; (side * side) as usize];
    for k in 0..indices.len() - 2 {
        let mut tri = [indices[k], indices[k + 1], indices[k + 2]];
        let p = |i: usize| snap(verts[i].0);
        let cross = |a: [f32; 2], b: [f32; 2], c: [f32; 2]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        let area = cross(p(tri[0]), p(tri[1]), p(tri[2]));
        if area == 0.0 {
            continue;
        }
        if area < 0.0 {
            tri.swap(1, 2);
        }
        let [a, bb, c] = tri.map(p);
        let area = area.abs();
        // An edge a→b with the interior on its positive side: top (dy = 0, dx > 0) or left (dy < 0).
        let top_left = |a: [f32; 2], b: [f32; 2]| (b[1] == a[1] && b[0] > a[0]) || b[1] < a[1];
        let inside = |e: f32, a: [f32; 2], b: [f32; 2]| e > 0.0 || (e == 0.0 && top_left(a, b));
        for y in 0..side {
            for x in 0..side {
                let q = [x as f32 + 0.5, y as f32 + 0.5];
                let (w0, w1, w2) = (cross(bb, c, q), cross(c, a, q), cross(a, bb, q));
                if !(inside(w0, bb, c) && inside(w1, c, a) && inside(w2, a, bb)) {
                    continue;
                }
                if out[(y * side + x) as usize].is_some() {
                    continue;
                }
                let w = [w0 / area, w1 / area, w2 / area];
                let mix = |f: &dyn Fn(usize) -> [f32; 2]| {
                    let v = tri.map(f);
                    [w[0] * v[0][0] + w[1] * v[1][0] + w[2] * v[2][0], w[0] * v[0][1] + w[1] * v[1][1] + w[2] * v[2][1]]
                };
                let local = mix(&|i| verts[i].1);
                let ppc = mix(&|i| verts[i].2);
                // edgeDistances = dy·(xs − x) − dx·(ys − y), LTRB.
                let e = std::array::from_fn::<f32, 4, _>(|i| dy[i] * (xs[i] - local[0]) - dx[i] * (ys[i] - local[1]));
                out[(y * side + x) as usize] = Some(coverage(e, r, ppc));
            }
        }
    }
    out
}

/// analytic_rrect_coverage_fn for a fill (strokeParams (0, −1)) under the identity Jacobian.
fn coverage(e: [f32; 4], r: f32, ppc: [f32; 2]) -> f32 {
    if ppc[0] > 0.0 {
        return 1.0;
    }
    let outer = [e[0].min(e[2]), e[1].min(e[3])];
    let mut d = [outer[0].min(outer[1]), -1.0f32];
    // Solid interior (perPixelControl.x > −0.95): scale and bias from the full size.
    let scale = (e[0] + e[2]).min(e[1] + e[3]).min(1.0);
    let bias = 1.0 - 0.5 * scale; // coverage_bias
    for ced in [[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]]] {
        let uv = [r - ced[0], r - ced[1]];
        if uv[0] > 0.0 && uv[1] > 0.0 && r > 0.0 {
            // elliptical_distance with strokeRadius 0.
            let inv_r2 = 1.0 / (r * r);
            let norm = [uv[0] * inv_r2, uv[1] * inv_r2];
            let inv_grad = 1.0 / (norm[0] * norm[0] + norm[1] * norm[1]).sqrt();
            let f = 0.5 * inv_grad * (uv[0] * norm[0] + uv[1] * norm[1] - 1.0);
            d = [d[0].min(-f), d[1].min(-f)];
        }
    }
    let outset = ppc[1].min(0.0);
    (scale * ((d[0] + outset).min(-d[1]) + bias)).clamp(0.0, 1.0)
}

impl AtlasSphere {
    /// SQUARE_CONTAINER_SIZE, the rows, SCALE_DISTANCE.
    fn grid(&self) -> (f32, u32, f32) {
        let (w, h) = self.size;
        let c = (w / COLUMNS as f32).max(1.0);
        let rows = (h / c).floor().max(0.0) as u32;
        (c, rows, w.hypot(h) / 4.0)
    }
}

impl Surface for AtlasSphere {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let (x, y) = self.point.unwrap_or((-1.0, -1.0));
        Some(format!("{{\"progress\":{:.3},\"point\":[{x:.1},{y:.1}],\"held\":{}}}", self.progress.value, self.pan.tracking()))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        let phase = gfx::phase(phase);
        let was = self.pan.tracking();
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Begin { x, y } => {
                gfx::spring_to(&mut self.progress, 1.0, 600.0, 1.0);
                self.point = Some((x, y));
            }
            Event::Start(p) | Event::Update(p) => self.point = Some((p.x, p.y)),
            _ => {}
        }
        // onTouchesUp: the pan's finger lifted (or was cancelled).
        if was && !self.pan.tracking() && matches!(phase, Phase::Up | Phase::Cancel) {
            gfx::spring_to(&mut self.progress, 0.0, 1000.0, 1.0);
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
        let moving = self.progress.step(frame.now_ms);
        let (c, rows, scale_distance) = self.grid();
        // SQUARE_TEXTURE_SIZE: MakeOffscreen(C, C) takes whole pixels.
        let side = c as u32;
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.side)) != Some((format, frame.shader_generation, side)) {
            self.gpu = Some(build(device, queue, format, frame.shader_generation, side));
        }
        let gpu = self.gpu.as_ref().unwrap();
        let (px, py) = self.point.unwrap_or((0.0, 0.0));
        let (pw, ph) = frame.pixels();
        let uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
            grid: [c, COLUMNS as f32, scale_distance, side as f32],
            touch: [px, py, self.progress.value as f32, if self.point.is_some() { 1.0 } else { 0.0 }],
        };
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("atlas sphere"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                // The Canvas is transparent over the container's #000000.
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&gpu.pipeline);
        pass.set_bind_group(0, &gpu.bind, &[]);
        pass.draw(0..6, 0..COLUMNS * rows);
        moving || self.pan.tracking()
    }
}

fn build(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, generation: u32, side: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = gfx::fullscreen(device, format, &shader, &layout, entry::SPRITE_VS, entry::SPRITE_FS, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING), "atlas sphere");
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("atlas sphere uniforms"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    // The useTexture image: BGRA8Unorm premultiplied in RN (no colour space, no sRGB decode on
    // read), the same bytes as Rgba8Unorm here.
    let side = side.max(1);
    let size = wgpu::Extent3d { width: side, height: side, depth_or_array_layers: 1 };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("atlas sphere dot"),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let texels: Vec<u8> = circle_texture(side).into_iter().flatten().collect();
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &texels,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4 * side), rows_per_image: Some(side) },
        size,
    );
    let view = texture.create_view(&Default::default());
    // drawAtlas: SkSamplingOptions(SkFilterMode::kLinear), the image shader clamped.
    let sampler = gfx::linear_sampler(device, "atlas sphere");
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("atlas sphere"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: CIRCLE.binding, resource: wgpu::BindingResource::TextureView(&view) },
            wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&sampler) },
        ],
    });
    Gpu { format, generation, side, pipeline, uniforms, bind }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    /// Graphite's AnalyticRRect for BASE_SQUARE: symmetric, nothing past the 3-px circle, and
    /// the coverage of its own formula (0.5 + the first-order distance (r² − ρ²) / 2ρ at a
    /// corner pixel, the edge distance on the axes), not the exact r − ρ.
    #[test]
    fn the_dot_texture_is_graphites_circle() {
        let tex = circle_texture(8);
        let a = |x: usize, y: usize| tex[y * 8 + x][3];
        for y in 0..8 {
            eprintln!("{:?}", (0..8).map(|x| tex[y * 8 + x]).collect::<Vec<_>>());
        }
        for y in 0..8 {
            for x in 0..8 {
                if x >= 3 || y >= 3 {
                    assert_eq!(tex[y * 8 + x], [0; 4], "({x}, {y})");
                } else {
                    assert_eq!(a(x, y), a(2 - x, y));
                    assert_eq!(a(x, y), a(y, x));
                    let [r, g, b, al] = tex[y * 8 + x];
                    assert_eq!((r, b), (0, al));
                    // Premultiplied G (247 · coverage), within a rounding step of 247/255 · A.
                    assert!((g as f32 - 247.0 / 255.0 * al as f32).abs() <= 1.0, "{g} {al}");
                }
            }
        }
        // The strip covers every pixel centre of the circle.
        let layers = rrect_coverage([0.0, 0.0, 3.0, 3.0], 1.5, 8);
        for y in 0..3 {
            for x in 0..3 {
                assert!(layers[y * 8 + x].is_some(), "({x}, {y})");
            }
        }
        // The centre pixel and the axis pixels (edge distance 0.5): full.
        assert_eq!(a(1, 1), 255);
        assert_eq!(a(1, 0), 255);
        // The corner pixel, ρ = √2: 0.5 + (2.25 − 2) / (2√2) = 0.588 → 150 (r − ρ + 0.5 is 0.586 → 149).
        let rho = 2f32.sqrt();
        assert_eq!(a(0, 0), unorm8(0.5 + (2.25 - rho * rho) / (2.0 * rho)));
        // A large circle follows the same formula far from the strip's seams.
        let big = rrect_coverage([0.0, 0.0, 40.0, 40.0], 20.0, 40);
        let at = |x: u32, y: u32| big[(y * 40 + x) as usize].unwrap_or(0.0);
        let (px, py) = (20.5f32, 0.5f32);
        let rho = (px - 20.0).hypot(py - 20.0);
        assert!((at(20, 0) - (0.5 + (400.0 - rho * rho) / (2.0 * rho))).abs() < 1e-3, "{}", at(20, 0));
        assert_eq!(at(20, 20), 1.0);
        assert_eq!(at(0, 0), 0.0);
    }

    #[test]
    fn the_dots_gather_under_the_finger() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // iPhone Air (420 × 912): C = floor(420 / 48) = 8, the canvas 320 × 712, 89 rows.
        let frame = |now_ms| Frame { width: 320.0, height: 712.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("atlas-sphere-rest");
        assert!(!animating);
        // At rest every dot is at its grid cell: (1.5, 1.5) of cell (0, 0) lit, (5, 5) dark.
        assert!(rest.at(3, 3)[2] > 200, "{:?}", rest.at(3, 3));
        assert_eq!(rest.at(10, 10)[3], 0);
        let lit = |img: &fixture::Pixels, x0: u32, x1: u32, y0: u32, y1: u32| (y0..y1).flat_map(|y| (x0..x1).map(move |x| (x, y))).filter(|&(x, y)| img.at(x, y)[3] > 40).count();
        let a = lit(&rest, 0, 640, 0, 1424);
        assert!(a > 3560 * 4, "{a}");

        let finger = |s: &mut Box<dyn Surface>, phase, x: f32, y: f32, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 160.0, 356.0, 10.0);
        let mut ms = 0.0;
        while ms < 1200.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (held, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        held.save("atlas-sphere-held");
        assert!(animating);
        assert!(s.agent("{}").unwrap().starts_with("{\"progress\":1.000"));
        // A sphere about the finger: lit near it, past SCALE_DISTANCE (195 pt) nothing.
        assert!(lit(&held, 220, 420, 612, 812) > 400);
        assert_eq!(lit(&held, 0, 640, 0, 120), 0);
        assert_eq!(lit(&held, 0, 640, 1300, 1424), 0);

        finger(&mut s, PointerPhase::Up, 160.0, 356.0, ms);
        while ms < 3000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (back, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        assert!(!animating);
        assert_eq!(back.data, rest.data);
    }
}
