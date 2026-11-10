//! UIKit's partially animated blur: expo-blur's `<BlurView intensity tint>` on iOS, a
//! `UIVisualEffectView` whose `UIBlurEffect` is set inside a paused `UIViewPropertyAnimator`
//! (`fractionComplete` = intensity / 100, clamped to 0.01…1). Measured on the iOS 27.0 Simulator
//! by `exact/parity-tools/blur-probe` (the layer tree under the animator, and screenshots over
//! step edges and colour patches):
//!
//! - The effect is a `UICABackdropLayer` with a chain of CAFilters and a capture `scale`. The
//!   animator runs one linear `CABasicAnimation` per parameter, from its identity to its value,
//!   paused at the fraction: the blur radius from 0, `colorSaturate` from 1,
//!   `luminanceCurveMap`'s amount and `colorBrightness` from 0, the backdrop's `scale` from 1,
//!   and the tint layer's opacity (a `sourceOver` sublayer, `.regular` only) from 0.
//! - The backdrop reads only what is under its own bounds (`inputNormalizeEdges`: the Gaussian's
//!   weights renormalised inside them; nothing outside bleeds in), downsampled to `scale` (an area
//!   average over cells of 1/scale pixels on a grid anchored at the WINDOW's origin, cut by the
//!   bounds), filtered there in the chain's order, and drawn back up bilinearly on that grid.
//! - Everything works on the gamma-encoded sRGB values (the blur's midpoint over a black–white
//!   edge is 128). The Gaussian's σ is `inputRadius` points. `colorSaturate` is the Rec. 709
//!   luminance matrix, clamped to 0…1; `luminanceCurveMap` maps the Rec. 709 luminance through the
//!   cubic Bézier of its four `inputValues` to a grey, mixed in by its amount; `colorBrightness`
//!   adds its amount.
//!
//! [`BackdropBlur`] runs that chain on a texture the caller drew (what is under the effect), and
//! [`BACKDROP_WGSL`] samples the result back up in the caller's shader (or [`BackdropBlur::draw`]
//! writes it into a target). Not reproduced: the materials' `inputDither` (±½ of an 8-bit step of
//! noise).

use crate::wgpu;

/// A `UIBlurEffect.Style` as expo-blur maps a `tint` to it, in the Demos app's dark appearance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Material {
    /// `tint="default"` → `.regular` (dark).
    Regular,
    /// `tint="systemMaterialDark"`.
    SystemMaterialDark,
    /// `tint="systemUltraThinMaterialLight"`.
    SystemUltraThinMaterialLight,
}

/// A style's backdrop at full strength, as the probe read it from the layer tree.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Chain {
    /// `gaussianBlur.inputRadius`, points (σ).
    pub radius: f32,
    /// `CABackdropLayer.scale`.
    pub scale: f32,
    /// The blur is the chain's first filter (`.regular`), else its last.
    pub blur_first: bool,
    /// `luminanceCurveMap`: `inputAmount` and `inputValues`.
    pub curve: Option<(f32, [f32; 4])>,
    /// `colorSaturate.inputAmount`.
    pub saturation: f32,
    /// `colorBrightness.inputAmount`.
    pub brightness: f32,
    /// The tint sublayer: its grey (extended-sRGB gray) and alpha.
    pub tint: Option<(f32, f32)>,
}

impl Material {
    /// The measured chain.
    pub const fn chain(self) -> Chain {
        match self {
            // [gaussianBlur 20, colorSaturate 1.8], scale 0.125; a gray 0.11 α 0.73 layer.
            Material::Regular => Chain { radius: 20.0, scale: 0.125, blur_first: true, curve: None, saturation: 1.8, brightness: 0.0, tint: Some((0.11, 0.73)) },
            // [luminanceCurveMap 0.75 (0.16, 0.26, 0.10, 0.10), colorSaturate 1.5,
            // gaussianBlur 29.5], scale 0.25.
            Material::SystemMaterialDark => Chain { radius: 29.5, scale: 0.25, blur_first: false, curve: Some((0.75, [0.16, 0.26, 0.10, 0.10])), saturation: 1.5, brightness: 0.0, tint: None },
            // [luminanceCurveMap 0.5 (0.45, 0.55, 0.65, 0.68), colorSaturate 1.1,
            // colorBrightness 0.12, gaussianBlur 22.5], scale 0.25.
            Material::SystemUltraThinMaterialLight => Chain {
                radius: 22.5,
                scale: 0.25,
                blur_first: false,
                curve: Some((0.5, [0.45, 0.55, 0.65, 0.68])),
                saturation: 1.1,
                brightness: 0.12,
                tint: None,
            },
        }
    }
}

/// expo-blur's fraction for an `intensity` (0…100): `intensity / 100` clamped to 0.01…1
/// (`BlurEffectView`'s `@Clamping`): an intensity of 0 still blurs at 1 %.
pub fn expo_fraction(intensity: f64) -> f32 {
    (intensity / 100.0).clamp(0.01, 1.0) as f32
}

/// A chain at an animator fraction: every parameter linear from its identity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    /// σ, points.
    pub radius: f32,
    /// The capture scale.
    pub scale: f32,
    /// The blur comes first.
    pub blur_first: bool,
    /// `luminanceCurveMap.inputAmount`.
    pub curve_amount: f32,
    /// `luminanceCurveMap.inputValues`.
    pub curve: [f32; 4],
    /// `colorSaturate.inputAmount`.
    pub saturation: f32,
    /// `colorBrightness.inputAmount`.
    pub brightness: f32,
    /// The tint layer's grey.
    pub tint_grey: f32,
    /// The tint layer's alpha × its opacity.
    pub tint_alpha: f32,
}

impl Chain {
    /// The presentation values at `fraction` (0…1).
    pub fn at(&self, fraction: f32) -> Params {
        let f = fraction.clamp(0.0, 1.0);
        let (amount, curve) = self.curve.unwrap_or((0.0, [0.0; 4]));
        let (grey, alpha) = self.tint.unwrap_or((0.0, 0.0));
        Params {
            radius: self.radius * f,
            scale: 1.0 + (self.scale - 1.0) * f,
            blur_first: self.blur_first,
            curve_amount: amount * f,
            curve,
            saturation: 1.0 + (self.saturation - 1.0) * f,
            brightness: self.brightness * f,
            tint_grey: grey,
            tint_alpha: alpha * f,
        }
    }
}

/// Rec. 709 luminance, `colorSaturate`'s and `luminanceCurveMap`'s weights.
pub const LUMA: [f32; 3] = [0.2126, 0.7152, 0.0722];

impl Params {
    /// The colour filters (curve, saturation, brightness) on one encoded colour.
    pub fn grade(&self, c: [f32; 3]) -> [f32; 3] {
        let mut c = c;
        if self.curve_amount != 0.0 {
            let l = (c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]).clamp(0.0, 1.0);
            let (t, u) = (l, 1.0 - l);
            let v = self.curve;
            let g = u * u * u * v[0] + 3.0 * u * u * t * v[1] + 3.0 * u * t * t * v[2] + t * t * t * v[3];
            c = c.map(|x| x + (g - x) * self.curve_amount);
        }
        let l = c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
        let s = self.saturation;
        c.map(|x| ((l + (x - l) * s).clamp(0.0, 1.0) + self.brightness).clamp(0.0, 1.0))
    }

    /// The tint layer over a filtered colour.
    pub fn tint(&self, c: [f32; 3]) -> [f32; 3] {
        c.map(|x| x + (self.tint_grey - x) * self.tint_alpha)
    }

    /// A flat colour under the effect, as it comes out (a blur of a flat colour is that colour).
    pub fn flat(&self, c: [f32; 3]) -> [f32; 3] {
        self.tint(self.grade(c))
    }
}

const SHADER: &str = r#"
struct P {
    region: vec4<f32>,  // source x0, y0, x1, y1 (px)
    grid: vec4<f32>,    // pitch (1 / scale), used width, used height (low px), σ (low px)
    cells: vec4<f32>,   // the first cell's window-space origin minus the source's window offset
    dir: vec4<f32>,     // dx, dy, kernel radius, grade here (1) or not
    curve: vec4<f32>,
    grade: vec4<f32>,   // curve amount, saturation, brightness, -
    tint: vec4<f32>,    // grey, alpha, -, -
};
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<uniform> p: P;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn grade(c: vec3<f32>) -> vec3<f32> {
    var o = c;
    if (p.grade.x != 0.0) {
        let t = clamp(dot(o, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        let u = 1.0 - t;
        let g = u * u * u * p.curve.x + 3.0 * u * u * t * p.curve.y + 3.0 * u * t * t * p.curve.z + t * t * t * p.curve.w;
        o = o + (vec3<f32>(g) - o) * p.grade.x;
    }
    let l = dot(o, vec3<f32>(0.2126, 0.7152, 0.0722));
    o = clamp(vec3<f32>(l) + (o - vec3<f32>(l)) * p.grade.y, vec3<f32>(0.0), vec3<f32>(1.0));
    return clamp(o + vec3<f32>(p.grade.z), vec3<f32>(0.0), vec3<f32>(1.0));
}
// The capture: low pixel (i, j) is the area average of its 1/scale square of source pixels
// (cells on the window's grid), cut by the region.
@fragment fn down(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let cell = floor(pos.xy);
    let pitch = p.grid.x;
    let a = max(p.cells.xy + cell * pitch, p.region.xy);
    let b = min(p.cells.xy + (cell + vec2<f32>(1.0)) * pitch, p.region.zw);
    let size = vec2<i32>(textureDimensions(src));
    var sum = vec3<f32>(0.0);
    var total = 0.0;
    let x0 = i32(floor(a.x));
    let y0 = i32(floor(a.y));
    for (var dy = 0; dy < 10; dy = dy + 1) {
        let y = y0 + dy;
        let wy = min(b.y, f32(y + 1)) - max(a.y, f32(y));
        if (wy <= 0.0) { break; }
        for (var dx = 0; dx < 10; dx = dx + 1) {
            let x = x0 + dx;
            let wx = min(b.x, f32(x + 1)) - max(a.x, f32(x));
            if (wx <= 0.0) { break; }
            let at = clamp(vec2<i32>(x, y), vec2<i32>(0), size - vec2<i32>(1));
            sum = sum + textureLoad(src, at, 0).rgb * (wx * wy);
            total = total + wx * wy;
        }
    }
    var c = sum / max(total, 1e-6);
    if (p.dir.w > 0.5) { c = grade(c); }
    return vec4<f32>(c, 1.0);
}
// One 1-D pass of the Gaussian, its weights renormalised inside the capture
// (inputNormalizeEdges); the last pass grades (blur-first chains) and tints.
@fragment fn blur(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let at = vec2<i32>(floor(pos.xy));
    let n = vec2<i32>(p.grid.yz);
    let d = vec2<i32>(p.dir.xy);
    let r = i32(p.dir.z);
    let k = -0.5 / max(p.grid.w * p.grid.w, 1e-12);
    var sum = vec3<f32>(0.0);
    var total = 0.0;
    for (var i = -r; i <= r; i = i + 1) {
        let q = at + d * i;
        if (all(q >= vec2<i32>(0)) && all(q < n)) {
            let w = exp(f32(i * i) * k);
            sum = sum + textureLoad(src, q, 0).rgb * w;
            total = total + w;
        }
    }
    var c = sum / max(total, 1e-12);
    if (p.dir.w > 0.5) { c = grade(c); }
    c = c + (vec3<f32>(p.tint.x) - c) * p.tint.y;
    return vec4<f32>(c, 1.0);
}
"#;

/// The caller's side: `backdrop_uv(pixel, m, n)` is where to sample the result (bilinear,
/// [`BackdropBlur`]'s sampler or any linear clamped one) for a pixel centre of the source's pixel
/// space, with `m`, `n` = [`Backdrop::mapping`]'s two vectors.
pub const BACKDROP_WGSL: &str = r#"
fn backdrop_uv(px: vec2<f32>, m: vec4<f32>, n: vec4<f32>) -> vec2<f32> {
    let c = clamp(px * m.z + m.xy, vec2<f32>(0.5), n.xy - vec2<f32>(0.5));
    return c / n.zw;
}
"#;

const DRAW_SHADER: &str = r#"
@group(0) @binding(0) var low: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> map: array<vec4<f32>, 3>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}
fn decode(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
@fragment fn draw(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // map[2]: where the source's (0, 0) lands in the target (px), 1 when the target encodes sRGB.
    let px = pos.xy - map[2].xy;
    let c = textureSampleLevel(low, smp, backdrop_uv(px, map[0], map[1]), 0.0).rgb;
    return vec4<f32>(select(c, decode(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0))), map[2].z > 0.5), 1.0);
}
"#;

/// The low-resolution format: the chain's intermediate values unquantised.
const LOW_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const PARAMS_SIZE: u64 = 112;

/// The finished backdrop: a low-resolution texture to sample with [`BACKDROP_WGSL`].
pub struct Backdrop<'a> {
    /// The texture, encoded sRGB, opaque.
    pub view: &'a wgpu::TextureView,
    /// `m`: the low-resolution coordinate of the source's (0, 0) (texel edges), the scale, 0;
    /// `n`: the used size (texels), the texture's size.
    pub mapping: [[f32; 4]; 2],
}

/// The chain's passes, their textures (grown to the largest region seen, never per frame),
/// uniform buffers and bind groups kept between runs.
#[derive(Default)]
pub struct BackdropBlur {
    built: Option<Built>,
    /// Two low-resolution targets and their capacity.
    low: Option<((u32, u32), [wgpu::TextureView; 2])>,
    /// The bind groups reading the low targets (x pass reads 0, y pass reads 1).
    low_binds: Option<[wgpu::BindGroup; 2]>,
    /// The capture's bind group and the source view it reads.
    source_bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
    /// The draw pipeline for a target format, its bind group.
    draw: Option<(wgpu::TextureFormat, wgpu::RenderPipeline)>,
    draw_bind: Option<wgpu::BindGroup>,
    mapping: [[f32; 4]; 2],
}

struct Built {
    down: wgpu::RenderPipeline,
    blur: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    params: [wgpu::Buffer; 3],
    sampler: wgpu::Sampler,
    draw_module: wgpu::ShaderModule,
    draw_layout: wgpu::BindGroupLayout,
    draw_uniform: wgpu::Buffer,
}

fn pass(encoder: &mut wgpu::CommandEncoder, label: &str, view: &wgpu::TextureView, pipeline: &wgpu::RenderPipeline, bind: &wgpu::BindGroup, rect: [u32; 4], load: wgpu::LoadOp<wgpu::Color>) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment { view, resolve_target: None, depth_slice: None, ops: wgpu::Operations { load, store: wgpu::StoreOp::Store } })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_viewport(rect[0] as f32, rect[1] as f32, rect[2] as f32, rect[3] as f32, 0.0, 1.0);
    pass.set_scissor_rect(rect[0], rect[1], rect[2], rect[3]);
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind, &[]);
    pass.draw(0..3, 0..1);
}

/// The window-grid cells `[k0, k1)` a capture over window span `[a, b)` covers at `scale`.
pub fn cells(a: f32, b: f32, scale: f32) -> (i32, i32) {
    let k0 = (a * scale + 1e-4).floor() as i32;
    let k1 = ((b * scale - 1e-4).ceil() as i32).max(k0 + 1);
    (k0, k1)
}

impl BackdropBlur {
    /// Runs `params` on `region` (`[x0, y0, x1, y1]`, pixels of `source`, an encoded-sRGB
    /// texture holding what is under the effect), `window` the window pixel where the source's
    /// (0, 0) is (the capture grid is the window's), `pixels_per_point` the screen's scale.
    #[allow(clippy::too_many_arguments)]
    pub fn run<'s>(
        &'s mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        source: &wgpu::TextureView,
        region: [i32; 4],
        window: [f32; 2],
        params: &Params,
        pixels_per_point: f32,
    ) -> Backdrop<'s> {
        if self.built.is_none() {
            self.built = Some(build(device));
        }
        let (w, h) = ((region[2] - region[0]).max(1) as u32, (region[3] - region[1]).max(1) as u32);
        let s = params.scale;
        let (kx0, kx1) = cells(region[0] as f32 + window[0], region[2] as f32 + window[0], s);
        let (ky0, ky1) = cells(region[1] as f32 + window[1], region[3] as f32 + window[1], s);
        let (nw, nh) = ((kx1 - kx0) as u32, (ky1 - ky0) as u32);
        // Capacity: the region at scale 1 (the largest any fraction asks), grown only.
        let (w, h) = (w + 1, h + 1);
        if self.low.as_ref().is_none_or(|(c, _)| c.0 < w.max(nw) || c.1 < h.max(nh)) {
            let cap = self.low.as_ref().map_or((w.max(nw), h.max(nh)), |(c, _)| (c.0.max(w).max(nw), c.1.max(h).max(nh)));
            let t = || crate::render::sampled_target(device, "backdrop low", LOW_FORMAT, cap.0, cap.1);
            self.low = Some((cap, [t(), t()]));
            self.low_binds = None;
            self.draw_bind = None;
        }
        let built = self.built.as_ref().unwrap();
        let (cap, low) = self.low.as_ref().unwrap();
        let bind = |view: &wgpu::TextureView, i: usize| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("backdrop"),
                layout: &built.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(view) },
                    wgpu::BindGroupEntry { binding: 1, resource: built.params[i].as_entire_binding() },
                ],
            })
        };
        if self.low_binds.is_none() {
            self.low_binds = Some([bind(&low[0], 1), bind(&low[1], 2)]);
        }
        if self.source_bind.as_ref().is_none_or(|(v, _)| v != source) {
            self.source_bind = Some((source.clone(), bind(source, 0)));
        }
        let sigma = params.radius * pixels_per_point * params.scale;
        let taps = if sigma < 1e-3 { 0.0 } else { (3.0 * sigma).ceil() };
        let pre = if params.blur_first { 0.0 } else { 1.0 };
        let put = |i: usize, dir: [f32; 2], grade: f32, tint: f32| {
            let v: [f32; 28] = [
                region[0] as f32, region[1] as f32, region[2] as f32, region[3] as f32,
                1.0 / s, nw as f32, nh as f32, sigma,
                kx0 as f32 / s - window[0], ky0 as f32 / s - window[1], 0.0, 0.0,
                dir[0], dir[1], taps, grade,
                params.curve[0], params.curve[1], params.curve[2], params.curve[3],
                params.curve_amount, params.saturation, params.brightness, 0.0,
                params.tint_grey, params.tint_alpha * tint, 0.0, 0.0,
            ];
            queue.write_buffer(&built.params[i], 0, bytemuck::cast_slice(&v));
        };
        put(0, [0.0, 0.0], pre, 0.0);
        put(1, [1.0, 0.0], 0.0, 0.0);
        put(2, [0.0, 1.0], 1.0 - pre, 1.0);
        let rect = [0, 0, nw, nh];
        let clear = wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT);
        let binds = self.low_binds.as_ref().unwrap();
        pass(encoder, "backdrop capture", &low[0], &built.down, &self.source_bind.as_ref().unwrap().1, rect, clear);
        pass(encoder, "backdrop blur x", &low[1], &built.blur, &binds[0], rect, clear);
        pass(encoder, "backdrop blur y", &low[0], &built.blur, &binds[1], rect, clear);
        self.mapping = [[window[0] * s - kx0 as f32, window[1] * s - ky0 as f32, s, 0.0], [nw as f32, nh as f32, cap.0 as f32, cap.1 as f32]];
        Backdrop { view: &low[0], mapping: self.mapping }
    }

    /// The last [`BackdropBlur::run`]'s result, drawn back up into `target` (of `format`), the
    /// source's (0, 0) at target pixel `origin`, over the target rect `at` + `size`.
    #[allow(clippy::too_many_arguments)]
    pub fn draw(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat, origin: [f32; 2], at: [u32; 2], size: [u32; 2]) {
        let Some(built) = self.built.as_ref() else { return };
        let Some((_, low)) = self.low.as_ref() else { return };
        if self.draw.as_ref().map(|d| d.0) != Some(format) {
            self.draw = Some((format, crate::render::fullscreen_pipeline(device, &built.draw_module, &built.draw_layout, "draw", format, None)));
        }
        if self.draw_bind.is_none() {
            self.draw_bind = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("backdrop draw"),
                layout: &built.draw_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&low[0]) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&built.sampler) },
                    wgpu::BindGroupEntry { binding: 2, resource: built.draw_uniform.as_entire_binding() },
                ],
            }));
        }
        let m = self.mapping;
        let v: [f32; 12] = [m[0][0], m[0][1], m[0][2], m[0][3], m[1][0], m[1][1], m[1][2], m[1][3], origin[0], origin[1], if format.is_srgb() { 1.0 } else { 0.0 }, 0.0];
        queue.write_buffer(&built.draw_uniform, 0, bytemuck::cast_slice(&v));
        let pipeline = &self.draw.as_ref().unwrap().1;
        pass(encoder, "backdrop draw", target, pipeline, self.draw_bind.as_ref().unwrap(), [at[0], at[1], size[0], size[1]], wgpu::LoadOp::Load);
    }

    /// A linear, clamped sampler for [`BACKDROP_WGSL`] (none before the first run).
    pub fn sampler(&self) -> Option<&wgpu::Sampler> {
        self.built.as_ref().map(|b| &b.sampler)
    }
}

fn build(device: &wgpu::Device) -> Built {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("backdrop"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
    let texture = |binding| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
        count: None,
    };
    let uniform = |binding| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
        count: None,
    };
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("backdrop"), entries: &[texture(0), uniform(1)] });
    let draw_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("backdrop draw"),
        entries: &[texture(0), wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None }, uniform(2)],
    });
    let draw_source = format!("{BACKDROP_WGSL}{DRAW_SHADER}");
    let draw_module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("backdrop draw"), source: wgpu::ShaderSource::Wgsl(draw_source.into()) });
    let pipeline = |fs| crate::render::fullscreen_pipeline(device, &module, &layout, fs, LOW_FORMAT, None);
    let buffer = |size| device.create_buffer(&wgpu::BufferDescriptor { label: Some("backdrop"), size, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    Built {
        down: pipeline("down"),
        blur: pipeline("blur"),
        layout,
        params: [buffer(PARAMS_SIZE), buffer(PARAMS_SIZE), buffer(PARAMS_SIZE)],
        sampler: crate::render::linear_sampler(device),
        draw_module,
        draw_layout,
        draw_uniform: buffer(48),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STYLES: [Material; 3] = [Material::Regular, Material::SystemMaterialDark, Material::SystemUltraThinMaterialLight];
    const FRACTIONS: [f32; 6] = [0.01, 0.2, 0.4, 0.65, 0.7, 1.0];

    fn style_name(m: Material) -> &'static str {
        match m {
            Material::Regular => "regular",
            Material::SystemMaterialDark => "systemMaterialDark",
            Material::SystemUltraThinMaterialLight => "systemUltraThinMaterialLight",
        }
    }

    /// The probe's patch means: (kind, style, fraction) → 24 colours.
    fn patches() -> Vec<(String, String, String, Vec<[f32; 3]>)> {
        include_str!("../tests/backdrop/patches.txt")
            .lines()
            .filter(|l| !l.starts_with('#'))
            .map(|l| {
                let (head, body) = l.split_once(": ").unwrap();
                let mut h = head.split(' ');
                let (k, s, f) = (h.next().unwrap().to_string(), h.next().unwrap().to_string(), h.next().unwrap().to_string());
                let cs = body.split(' ').map(|t| {
                    let v: Vec<f32> = t.split(',').map(|x| x.parse().unwrap()).collect();
                    [v[0], v[1], v[2]]
                });
                (k, s, f, cs.collect())
            })
            .collect()
    }

    #[test]
    fn the_animator_interpolates_each_parameter_linearly() {
        // The probe's presentation values at 0.4 / 0.65.
        let p = Material::SystemMaterialDark.chain().at(0.65);
        assert!((p.radius - 19.175).abs() < 1e-3 && (p.saturation - 1.325).abs() < 1e-4 && (p.curve_amount - 0.4875).abs() < 1e-4);
        let p = Material::Regular.chain().at(0.4);
        assert!((p.radius - 8.0).abs() < 1e-5 && (p.scale - 0.65).abs() < 1e-6 && (p.saturation - 1.32).abs() < 1e-6 && (p.tint_alpha - 0.292).abs() < 1e-6);
        assert_eq!(expo_fraction(0.0), 0.01);
        assert_eq!(expo_fraction(40.0), 0.4);
    }

    #[test]
    fn flat_colours_match_the_probe_captures() {
        let all = patches();
        let none = |k: &str| all.iter().find(|(kk, s, _, _)| kk == k && s == "none").unwrap().3.clone();
        let mut worst = 0.0f32;
        for (k, s, f, got) in all.iter().filter(|(_, s, _, _)| s != "none") {
            let m = *STYLES.iter().find(|m| style_name(**m) == s).unwrap();
            let p = m.chain().at(f.parse().unwrap());
            for (src, want) in none(k).iter().zip(got) {
                let out = p.flat(src.map(|v| v / 255.0));
                for i in 0..3 {
                    worst = worst.max((out[i] * 255.0 - want[i]).abs());
                }
            }
        }
        // The captures carry the materials' dither (±1) and 8-bit rounding.
        assert!(worst < 2.2, "worst {worst}");
    }

    /// The probe's step pattern (one channel): left half black, right white, a white band
    /// (0…630 × 900…1020 px), a white bar above the effect (180…630 × 330…450) and a black one
    /// below it (630…1080 × 2250…2370). 1260 × 2736, the effect over 180…1080 × 450…2250.
    fn step_scene() -> Vec<u8> {
        let (w, h) = (1260usize, 2736usize);
        let mut px = vec![0u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let mut v = x >= 630;
                if (900..1020).contains(&y) && x < 630 || (330..450).contains(&y) && (180..630).contains(&x) {
                    v = true;
                }
                if (2250..2370).contains(&y) && (630..1080).contains(&x) {
                    v = false;
                }
                let c = if v { 255 } else { 0 };
                px[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&[c, c, c, 255]);
            }
        }
        px
    }

    #[test]
    fn step_edges_match_the_probe_captures_pixel_for_pixel() {
        let gpu = match exact_gpu::fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let (device, queue) = (&gpu.device, &gpu.queue);
        let (w, h) = (1260u32, 2736u32);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("scene"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(texture.as_image_copy(), &step_scene(), wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(w * 4), rows_per_image: None }, wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 });
        let scene = texture.create_view(&Default::default());
        let out = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("out"),
            size: wgpu::Extent3d { width: 900, height: 1800, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let out_view = out.create_view(&Default::default());
        let captures = include_bytes!("../tests/backdrop/step.bin");
        let mut blur = BackdropBlur::default();
        let mut report = String::new();
        let mut failed = false;
        for (si, m) in STYLES.iter().enumerate() {
            for (fi, f) in FRACTIONS.iter().enumerate() {
                let mut encoder = device.create_command_encoder(&Default::default());
                blur.run(device, queue, &mut encoder, &scene, [180, 450, 1080, 2250], [0.0, 0.0], &m.chain().at(*f), 3.0);
                blur.draw(device, queue, &mut encoder, &out_view, wgpu::TextureFormat::Rgba8Unorm, [-180.0, -450.0], [0, 0], [900, 1800]);
                queue.submit([encoder.finish()]);
                let px = exact_gpu::fixture::read(&gpu, &out).unwrap();
                let cap = &captures[(si * 6 + fi) * 5400..(si * 6 + fi + 1) * 5400];
                let mut worst = 0i32;
                let mut sum = 0i64;
                let mut count = 0i64;
                let mut check = |x: u32, y: u32, want: u8| {
                    let d = (px.at(x, y)[0] as i32 - want as i32).abs();
                    worst = worst.max(d);
                    sum += d as i64;
                    count += 1;
                };
                for x in 0..900u32 {
                    check(x, 510, cap[x as usize]);
                    check(x, 1000, cap[900 + x as usize]);
                }
                for y in 0..1800u32 {
                    check(200, y, cap[1800 + y as usize]);
                    check(700, y, cap[3600 + y as usize]);
                }
                let mean = sum as f64 / count as f64;
                report += &format!("{} {f}: max {worst}, mean {mean:.2}\n", style_name(*m));
                // At 1 % the blur is under a pixel and a hard edge's sub-pixel phase on the
                // capture grid decides a few levels; elsewhere the captures' dither and 8-bit
                // steps.
                let limit = if *f < 0.05 { 7 } else { 4 };
                if worst > limit || mean > 1.2 {
                    failed = true;
                }
            }
        }
        eprintln!("{report}");
        assert!(!failed, "{report}");
    }
}
