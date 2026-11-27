//! The checkmate wave: the RN app's `CheckmateAuraProvider`
//! (onboarding/checkmate-aura.tsx, wave-shader.ts, wave-pyramid.ts) on wgpu.
//!
//! `wave(x, y, reduced, eraseTop, eraseBottom, snapshot, held)`: the mated king in
//! canvas points, whether Reduce Motion is on (1) or not (0), the bands left out
//! of the frost, in canvas points from the top (everything above `eraseTop` and
//! below `eraseBottom`), and the screen as the mate left it: the path of
//! @patterns/view-snapshot's raw pixels (an 8-byte header, width and height as
//! little-endian u32, then premultiplied RGBA), "" until taken, as RN snapshots
//! the view (view-snapshot.ts). The canvas covers the screen. From the first
//! frame that has the snapshot the sweep runs 4200 ms on a linear
//! clock (the ease is the shader's), the haze breathes on a 4200 ms in-out
//! swing for as long as it shows, and once the frost covers the card's area
//! (or 0.9 of the sweep has run) the surface publishes `{"card": 1, "at": p}`
//! (`exactSurface("wave")`), `p` the sweep's progress then: the offer card's
//! cue, from which the root times the card's focus and touches as RN times
//! them on `progress`. Reduce Motion: no sweep; the settled haze fades in over
//! 500 ms and the card is let in at once. The wave's first frame plays
//! WAVE_PATTERN, the card's cue CARD_PATTERN (pulsar.rs), as RN's Pulsar does.
//! The scheme is read off the snapshot's page (its top-left corner).
//! `held` (1) stills the haze's breath where it is, as a sign-in starts
//! (checkmate-aura.tsx `hold(true)`: cancelAnimation); let go (0, a cancel or a
//! failure), it eases back to the trough over 2100 ms in-out(ease) and swings on
//! from there (`hold(false)`); never under Reduce Motion.

use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

use crate::gfx::{self, smoothstep};
use crate::pulsar;
use crate::shaders;

/// checkmate-aura.tsx and wave-shader.ts.
pub const WAVE_MS: f64 = 4200.0;
const BREATH_MS: f64 = 4200.0;
/// Reduce Motion: the overlay's fade in (withFade's default in-out quad).
const REDUCED_FADE_MS: f64 = 500.0;
const CARD_COVER: f32 = 0.9;
const CARD_FLOOR: f32 = 0.9;
/// The card's content as fractions of the screen (CARD_RECT).
const CARD_RECT: [f32; 4] = [0.06, 0.94, 0.28, 0.96];
const PYRAMID_BLUR_A: f32 = 7.0;
const PYRAMID_BLUR_B: f32 = 16.5;
/// The uniforms `CheckmateAuraProvider` sweeps with.
const BAND: f32 = 64.0;
const AMPLITUDE: f32 = 50.0;
const GLOW_STRENGTH: f32 = 0.3;
const WOBBLE: f32 = 0.04;
const MAX_BLUR: f32 = 14.0;
const TINT: f32 = 0.68;
/// The theme's accent (both schemes), the board's gold (light lifted 0.04 in
/// OKLCH, use-board-palette.ts) and `background.secondary` (the haze's ground).
const ACCENT: u32 = 0xCBAA8E;
const GOLD_DARK: u32 = 0xC18E35;
const GOLD_LIGHT: u32 = 0xCE9A43;
const BASE_DARK: u32 = 0x121417;
const BASE_LIGHT: u32 = 0xFFFFFF;
/// What the bands left out of the frost are painted with: `background.primary`, the page
/// (pattern-beat.tsx showAura `erase.color`), not the haze's ground.
const ERASE_DARK: u32 = 0x090A0D;
const ERASE_LIGHT: u32 = 0xF6F4F2;
/// Where the page is read for the scheme, in points from the top-left.
const PROBE_PT: f32 = 2.0;
const LEVEL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Reanimated's `Easing.inOut(Easing.ease)`, `ease` being bezier(0.42, 0, 1, 1).
fn in_out_ease(t: f32) -> f32 {
    let ease = |x: f32| gfx::bezier(0.42, 0.0, 1.0, 1.0, x);
    if t < 0.5 {
        ease(t * 2.0) / 2.0
    } else {
        1.0 - ease((1.0 - t) * 2.0) / 2.0
    }
}

/// The settled glow's breath at `ms` into the sweep: 0 to 1 and back, forever.
pub fn breath_at(ms: f64) -> f32 {
    let k = (ms / BREATH_MS).max(0.0);
    let swing = in_out_ease(k.fract() as f32);
    if (k.floor() as i64) % 2 == 0 {
        swing
    } else {
        1.0 - swing
    }
}

/// The breath at `now` for a sweep that started at `start`: held, easing back to the trough
/// from `back` (BREATH_MS / 2 in-out ease, then the loop afresh), or the loop.
pub fn breath_now(start: f64, now: f64, held: Option<f32>, back: Option<(f64, f32)>) -> f32 {
    if let Some(b) = held {
        return b;
    }
    match back {
        Some((at, from)) => {
            let half = BREATH_MS / 2.0;
            let t = now - at;
            if t < half {
                from * (1.0 - in_out_ease((t.max(0.0) / half) as f32))
            } else {
                breath_at(t - half)
            }
        }
        None => breath_at(now - start),
    }
}

/// The farthest a wave from (ox, oy) has to travel on a w×h screen, ×1.28.
pub fn max_radius(ox: f32, oy: f32, w: f32, h: f32) -> f32 {
    let d = |x: f32, y: f32| (x * x + y * y).sqrt();
    d(ox, oy).max(d(w - ox, oy)).max(d(ox, h - oy)).max(d(w - ox, h - oy)) * 1.28
}

/// How much of the card's area the frost covers at `progress` (`cardCover`).
pub fn card_cover(ox: f32, oy: f32, w: f32, h: f32, progress: f32) -> f32 {
    let [l, r, t, b] = CARD_RECT;
    let mut far = 0.0f32;
    for x in [l * w, r * w] {
        for y in [t * h, b * h] {
            far = far.max(((x - ox) * (x - ox) + (y - oy) * (y - oy)).sqrt());
        }
    }
    let drop_r = max_radius(ox, oy, w, h) * smoothstep(0.26, 0.82, progress) * 1.35;
    smoothstep(drop_r, drop_r - w * 0.9, far)
}

/// Whether the card is let in at `progress`.
pub fn card_due(ox: f32, oy: f32, w: f32, h: f32, progress: f32) -> bool {
    card_cover(ox, oy, w, h, progress) >= CARD_COVER || progress >= CARD_FLOOR
}

/// The wave over the mated screen.
#[derive(Default)]
pub struct WaveSurface {
    origin: (f32, f32),
    reduced: bool,
    erase: (f32, f32),
    /// The snapshot's path, its pixels read and not yet uploaded, and its texture.
    path: String,
    pending: Option<(u32, u32, Vec<u8>)>,
    children: Option<wgpu::TextureView>,
    /// The pyramid is for an older snapshot (or none).
    stale: bool,
    /// The clock at the sweep's first frame.
    started: Option<f64>,
    card_sent: bool,
    /// The breath: held where it stood, or easing back from a value since a time; the last frame's clock.
    held: Option<f32>,
    back: Option<(f64, f32)>,
    last_ms: Option<f64>,
    publish: Option<String>,
    /// Haptic patterns for the host, not yet handed over.
    haptics: Vec<String>,
    gpu: Option<Gpu>,
}

struct Pyramid {
    size: (u32, u32),
    half: wgpu::TextureView,
    tmp_a: wgpu::TextureView,
    a: wgpu::TextureView,
    quarter: wgpu::TextureView,
    tmp_b: wgpu::TextureView,
    b: wgpu::TextureView,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    wave: wgpu::RenderPipeline,
    wave_layout: wgpu::BindGroupLayout,
    down: wgpu::RenderPipeline,
    gauss: wgpu::RenderPipeline,
    blur_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniform: wgpu::Buffer,
    /// One per pyramid pass: a buffer written twice in one submit is read
    /// with its last contents by every pass.
    blur_uniforms: Vec<wgpu::Buffer>,
    pyramid: Option<Pyramid>,
    bind: Option<wgpu::BindGroup>,
}

/// @patterns/view-snapshot's file: its size and premultiplied RGBA.
fn read_snapshot(path: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let mut bytes = std::fs::read(path).map_err(|e| format!("wave.snapshot: {path}: {e}"))?;
    if bytes.len() < 8 {
        return Err(format!("wave.snapshot: {path} is not a snapshot"));
    }
    let w = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    let h = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
    if w == 0 || h == 0 || bytes.len() != 8 + (w as usize) * (h as usize) * 4 {
        return Err(format!("wave.snapshot: {path} is not {w}x{h} RGBA"));
    }
    bytes.drain(..8);
    Ok((w, h, bytes))
}

impl WaveSurface {
    /// The snapshot's pixels, uploaded once.
    pub fn set_snapshot(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, w: u32, h: u32, px: &[u8]) {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("wave snapshot"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            texture.as_image_copy(),
            px,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(w * 4), rows_per_image: None },
            wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        );
        self.children = Some(texture.create_view(&Default::default()));
        self.stale = true;
    }

    fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
        let wm = device.create_shader_module(shaders::wave::module());
        let wave_layout = device.create_bind_group_layout(&shaders::wave::GROUP_0);
        let wave = gfx::fullscreen(
            device,
            format,
            &wm,
            &wave_layout,
            shaders::wave::entry::VS,
            shaders::wave::entry::FS,
            Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
            "wave",
        );
        let bm = device.create_shader_module(shaders::blur::module());
        let blur_layout = device.create_bind_group_layout(&shaders::blur::GROUP_0);
        let down = gfx::fullscreen(device, LEVEL_FORMAT, &bm, &blur_layout, shaders::blur::entry::VS, shaders::blur::entry::DOWN, None, "wave pyramid down");
        let gauss = gfx::fullscreen(device, LEVEL_FORMAT, &bm, &blur_layout, shaders::blur::entry::VS, shaders::blur::entry::GAUSS, None, "wave pyramid blur");
        Gpu {
            format,
            generation,
            wave,
            wave_layout,
            down,
            gauss,
            blur_layout,
            sampler: gfx::linear_sampler(device, "wave"),
            uniform: gfx::uniform(device, "wave uniforms", shaders::wave::Wave::SIZE),
            blur_uniforms: (0..6).map(|_| gfx::uniform(device, "wave pyramid uniforms", shaders::blur::Blur::SIZE)).collect(),
            pyramid: None,
            bind: None,
        }
    }

    /// The snapshot blurred to PYRAMID_BLUR_A points at half its size and to
    /// PYRAMID_BLUR_B at a quarter (wave-pyramid.ts), with the erased bands.
    fn build_pyramid(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let Some(image) = self.children.as_ref() else { return };
        let gpu = self.gpu.as_mut().unwrap();
        let (pw, ph) = frame.pixels();
        let half = ((pw / 2).max(1), (ph / 2).max(1));
        let quarter = ((half.0 / 2).max(1), (half.1 / 2).max(1));
        if gpu.pyramid.as_ref().map(|p| p.size) != Some((pw, ph)) {
            let t = |label, s: (u32, u32)| gfx::target(device, label, LEVEL_FORMAT, s.0, s.1);
            gpu.pyramid = Some(Pyramid {
                size: (pw, ph),
                half: t("wave half", half),
                tmp_a: t("wave half blur", half),
                a: t("wave level a", half),
                quarter: t("wave quarter", quarter),
                tmp_b: t("wave quarter blur", quarter),
                b: t("wave level b", quarter),
            });
        }
        let p = gpu.pyramid.as_ref().unwrap();
        let h = frame.height.max(1.0);
        let ratio = frame.scale;
        let sigma_a = PYRAMID_BLUR_A * ratio / 2.0 / 2.0;
        let sigma_b = PYRAMID_BLUR_B * ratio / 2.0 / 4.0;
        let probe = [PROBE_PT / frame.width.max(1.0), PROBE_PT / h, 0.0, 0.0];
        let f = |s: (u32, u32)| (s.0 as f32, s.1 as f32);
        // (source, its size, target, its size, erase?, sigma, step axis, pipeline)
        let passes: [(&wgpu::TextureView, (f32, f32), &wgpu::TextureView, (f32, f32), bool, f32, (f32, f32), bool); 6] = [
            (image, (pw as f32, ph as f32), &p.half, f(half), true, 0.0, (0.0, 0.0), true),
            (&p.half, f(half), &p.tmp_a, f(half), false, sigma_a, (1.0, 0.0), false),
            (&p.tmp_a, f(half), &p.a, f(half), false, sigma_a, (0.0, 1.0), false),
            (&p.half, f(half), &p.quarter, f(quarter), false, 0.0, (0.0, 0.0), true),
            (&p.quarter, f(quarter), &p.tmp_b, f(quarter), false, sigma_b, (1.0, 0.0), false),
            (&p.tmp_b, f(quarter), &p.b, f(quarter), false, sigma_b, (0.0, 1.0), false),
        ];
        for (i, (src, ss, dst, ds, erase, sigma, axis, down)) in passes.into_iter().enumerate() {
            let u = shaders::blur::Blur {
                size: [ss.0, ss.1, ds.0, ds.1],
                erase: [self.erase.0 / h, self.erase.1 / h, if erase { 1.0 } else { 0.0 }, sigma],
                step: [axis.0 / ss.0, axis.1 / ss.1, 0.0, 0.0],
                base_dark: gfx::srgb4(ERASE_DARK),
                base_light: gfx::srgb4(ERASE_LIGHT),
                probe,
            };
            queue.write_buffer(&gpu.blur_uniforms[i], 0, &u.bytes());
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("wave pyramid"),
                layout: &gpu.blur_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: shaders::blur::B.binding, resource: gpu.blur_uniforms[i].as_entire_binding() },
                    wgpu::BindGroupEntry { binding: shaders::blur::SRC.binding, resource: wgpu::BindingResource::TextureView(src) },
                    wgpu::BindGroupEntry { binding: shaders::blur::SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gfx::pass(encoder, "wave pyramid", dst, if down { &gpu.down } else { &gpu.gauss }, &bind);
        }
        gpu.bind = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("wave"),
            layout: &gpu.wave_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: shaders::wave::U.binding, resource: gpu.uniform.as_entire_binding() },
                wgpu::BindGroupEntry { binding: shaders::wave::IMAGE.binding, resource: wgpu::BindingResource::TextureView(image) },
                wgpu::BindGroupEntry { binding: shaders::wave::BLUR_A.binding, resource: wgpu::BindingResource::TextureView(&p.a) },
                wgpu::BindGroupEntry { binding: shaders::wave::BLUR_B.binding, resource: wgpu::BindingResource::TextureView(&p.b) },
                wgpu::BindGroupEntry { binding: shaders::wave::SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        }));
        self.stale = false;
    }
}

impl Surface for WaveSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) {
        self.gpu = None;
        // The snapshot's texture was the old device's: read it again for the new one.
        if self.children.take().is_some() && !self.path.is_empty() {
            self.pending = read_snapshot(&self.path).ok();
        }
        self.stale = true;
    }

    fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
        if inputs.len() != 7 {
            return Err(SurfaceError(format!("wave: expected 7 inputs, got {}", inputs.len())));
        }
        let path = inputs[5].as_str().ok_or_else(|| SurfaceError("wave.snapshot: expected a string".into()))?;
        if path != self.path {
            self.path = path.to_string();
            if !path.is_empty() {
                self.pending = Some(read_snapshot(path).map_err(SurfaceError)?);
            }
        }
        self.origin = (number(&inputs[0], "x")? as f32, number(&inputs[1], "y")? as f32);
        self.reduced = number(&inputs[2], "reduced")? > 0.5;
        self.erase = (number(&inputs[3], "eraseTop")? as f32, number(&inputs[4], "eraseBottom")? as f32);
        let held = number(&inputs[6], "held")? > 0.5;
        self.hold(held, at_ms.or(self.last_ms).unwrap_or(0.0));
        Ok(())
    }

    fn published(&mut self) -> Option<String> {
        self.publish.take()
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.haptics)
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
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(Self::build(device, format, frame.shader_generation));
            self.stale = true;
        }
        if let Some((w, h, px)) = self.pending.take() {
            self.set_snapshot(device, queue, w, h, &px);
        }
        // Nothing until the snapshot is in: the live screen shows through.
        if self.children.is_none() {
            encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("wave clear"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            // Idle until a snapshot is bound: no frames asked for.
            return false;
        }
        if self.stale || self.gpu.as_ref().unwrap().pyramid.as_ref().map(|p| p.size) != Some(frame.pixels()) {
            self.build_pyramid(frame, device, queue, encoder);
        }
        if self.started.is_none() {
            // The detonation, on the wave's first visible frame (checkmate-aura.tsx show).
            self.haptics.extend(pulsar::WAVE.messages());
        }
        let start = *self.started.get_or_insert(frame.now_ms);
        self.last_ms = Some(frame.now_ms);
        let t = (frame.now_ms - start).max(0.0);
        let (w, h) = (frame.width.max(1.0), frame.height.max(1.0));
        let (ox, oy) = self.origin;
        let (progress, vis, breath) = if self.reduced {
            let x = (t / REDUCED_FADE_MS).min(1.0) as f32;
            let quad = if x < 0.5 { 2.0 * x * x } else { 1.0 - (-2.0 * x + 2.0).powi(2) / 2.0 };
            (1.0, quad, 0.0)
        } else {
            ((t / WAVE_MS).min(1.0) as f32, 1.0, breath_now(start, frame.now_ms, self.held, self.back))
        };
        if !self.card_sent && card_due(ox, oy, w, h, progress) {
            self.card_sent = true;
            self.publish = Some(format!("{{\"card\":1,\"at\":{progress}}}"));
            // The card's triumph, hung off the reveal (celebrate-offer.tsx playCardHaptic).
            self.haptics.extend(pulsar::CARD.messages());
        }
        let u = shaders::wave::Wave {
            res: [w, h, frame.scale, if format.is_srgb() { 1.0 } else { 0.0 }],
            origin: [ox, oy, progress, max_radius(ox, oy, w, h)],
            p1: [BAND, AMPLITUDE, GLOW_STRENGTH, WOBBLE],
            p2: [MAX_BLUR, breath, TINT, vis],
            blur: [PYRAMID_BLUR_A, PYRAMID_BLUR_B, PROBE_PT / w, PROBE_PT / h],
            accent_dark: gfx::srgb4(ACCENT),
            accent_light: gfx::srgb4(ACCENT),
            gold_dark: gfx::srgb4(GOLD_DARK),
            gold_light: gfx::srgb4(GOLD_LIGHT),
            base_dark: gfx::srgb4(BASE_DARK),
            base_light: gfx::srgb4(BASE_LIGHT),
        };
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniform, 0, &u.bytes());
        if let Some(bind) = &gpu.bind {
            gfx::pass(encoder, "wave", target, &gpu.wave, bind);
        }
        wants_frame(self.held.is_some(), self.reduced, progress, vis)
    }
}

/// Whether the surface asks for another frame: the haze breathes for as long as it shows, unless
/// held; Reduce Motion holds it still once faded in. Held, it still finishes the sweep and the
/// fade-in (a hold set during Reduce Motion's 500 ms fade would freeze it half-faded).
fn wants_frame(held: bool, reduced: bool, progress: f32, vis: f32) -> bool {
    if held {
        return progress < 1.0 || vis < 1.0;
    }
    !reduced || vis < 1.0
}

impl WaveSurface {
    /// checkmate-aura.tsx `hold`, at `now`: held, the breath stops where it is; let go, it eases
    /// back from there, unless Reduce Motion is on (it stays still) or the sweep has not shown.
    fn hold(&mut self, held: bool, now: f64) {
        match (held, self.held) {
            (true, None) => {
                let b = match self.started {
                    Some(start) if !self.reduced => breath_now(start, now, None, self.back),
                    _ => 0.0,
                };
                self.held = Some(b);
                self.back = None;
            }
            (false, Some(b)) => {
                if self.started.is_none() {
                    self.held = None;
                } else if !self.reduced {
                    self.held = None;
                    self.back = Some((now, b));
                }
            }
            _ => {}
        }
    }
}

/// A new wave surface, for the registry.
pub fn wave() -> Box<dyn Surface> {
    Box::new(WaveSurface::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_breath_swings_and_returns() {
        assert!(breath_at(0.0).abs() < 1e-4);
        assert!((breath_at(BREATH_MS) - 1.0).abs() < 1e-4);
        assert!(breath_at(2.0 * BREATH_MS).abs() < 1e-4);
        assert!((breath_at(BREATH_MS / 2.0) - 0.5).abs() < 1e-3);
    }

    #[test]
    fn a_held_breath_stills_and_eases_back_to_the_trough() {
        let mut s = WaveSurface { started: Some(0.0), ..WaveSurface::default() };
        let at = BREATH_MS * 0.5;
        let b = breath_at(at);
        s.hold(true, at);
        assert_eq!(breath_now(0.0, at + 5000.0, s.held, s.back), b, "still while held");
        s.hold(false, at + 5000.0);
        let back = |t: f64| breath_now(0.0, t, s.held, s.back);
        assert_eq!(back(at + 5000.0), b);
        assert!((back(at + 5000.0 + 1050.0) - b * 0.5).abs() < 1e-3, "half way at 1050 ms");
        assert!(back(at + 5000.0 + 2100.0).abs() < 1e-4, "the trough at 2100 ms");
        assert!((back(at + 5000.0 + 2100.0 + BREATH_MS) - 1.0).abs() < 1e-4, "then the full swing");
        // Under Reduce Motion a let-go leaves it still.
        let mut r = WaveSurface { started: Some(0.0), reduced: true, ..WaveSurface::default() };
        r.hold(true, 100.0);
        r.hold(false, 200.0);
        assert_eq!(r.held, Some(0.0));
    }

    #[test]
    fn a_hold_never_freezes_the_haze_part_way() {
        // Reduce Motion: progress is 1 from the start; held during the fade, it keeps fading in.
        assert!(wants_frame(true, true, 1.0, 0.4), "held mid-fade under Reduce Motion");
        assert!(!wants_frame(true, true, 1.0, 1.0), "held and faded in: still");
        assert!(wants_frame(true, false, 0.5, 1.0), "held mid-sweep");
        assert!(!wants_frame(true, false, 1.0, 1.0), "held after the sweep: the breath stops");
        assert!(wants_frame(false, false, 1.0, 1.0), "free: it breathes");
        assert!(wants_frame(false, true, 1.0, 0.4) && !wants_frame(false, true, 1.0, 1.0));
    }

    #[test]
    fn the_card_waits_for_the_frost_and_never_past_the_floor() {
        // The intro's king (h8) on the Air: near the top right.
        let (w, h) = (420.0, 912.0);
        let (ox, oy) = (420.0 - 26.25, 214.0);
        assert!(!card_due(ox, oy, w, h, 0.3));
        let first = (0..=100).map(|i| i as f32 / 100.0).find(|p| card_due(ox, oy, w, h, *p)).unwrap();
        assert!(first > 0.4 && first <= CARD_FLOOR, "let in at {first}");
    }

    /// The sweep over a synthetic screen (the page, a bright board up top),
    /// read back: sharp where the wave has not been, the page's ground once
    /// settled, in the scheme the page says, and the card's cue published.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn the_wave_settles_onto_the_page_in_its_scheme() {
        use exact_gpu::fixture;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let (w, h) = (210u32, 456u32);
        for (page, ground) in [([9u8, 10, 13], 0x12u8), ([246u8, 244, 242], 0xFFu8)] {
            let mut px = vec![0u8; (w * h * 4) as usize];
            for y in 0..h {
                for x in 0..w {
                    let i = ((y * w + x) * 4) as usize;
                    let board = (100..310).contains(&(y * 2)) && x > 5;
                    let c = if board { [253, 229, 217] } else { page };
                    px[i..i + 4].copy_from_slice(&[c[0], c[1], c[2], 255]);
                }
            }
            let mut s = WaveSurface::default();
            s.bind(
                &[
                    Value::Number(380.0),
                    Value::Number(214.0),
                    Value::Number(0.0),
                    Value::Number(40.0),
                    Value::Number(800.0),
                    Value::str(""),
                    Value::Number(0.0),
                ],
                None,
            )
            .unwrap();
            s.set_snapshot(&gpu.device, &gpu.queue, w, h, &px);
            let mut frame = Frame {
                width: 420.0,
                height: 912.0,
                scale: 0.5,
                now_ms: 1000.0,
                children_generation: 1,
                seekable: true,
                period_ms: 0.0,
                shader_generation: exact_gpu::shaders::shader_generation(),
                headroom: 1.0,
            };
            let (first, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
            let far = first.at(10, 440);
            assert!(far[..3].iter().zip(page).all(|(a, b)| (*a as i32 - b as i32).abs() <= 2), "sharp before the wave: {far:?}");
            assert!(s.published().is_none(), "no card on the first frame");
            assert_eq!(s.messages().len(), 2, "the detonation on the first frame");
            frame.now_ms += WAVE_MS + 10.0;
            let (end, wants) = fixture::render(&gpu, &mut s, &frame).unwrap();
            assert!(wants, "the haze keeps breathing");
            assert_eq!(s.published().as_deref(), Some("{\"card\":1,\"at\":1}"));
            assert_eq!(s.messages().len(), 2, "the card's triumph");
            let low = end.at(105, 430);
            assert!((low[0] as i32 - ground as i32).abs() <= 6, "the lower screen sinks to the ground: {low:?}");
        }
    }
}
