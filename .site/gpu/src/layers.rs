//! The intro's flat layers, drawn by its one surface in canvas points as RN's one canvas draws
//! everything (onboarding/README.md, laws 0 and 1), over the stage in the same pass: the copy (each piece rasterised once by
//! the host as a canvas child, faded and drifted here by the pager's position:
//! pattern-beat.tsx CopyZone, ZoneReveal; intro-clock.ts) and the story dots (index.tsx
//! StoryDot).

use exact_gpu::wgpu;

use crate::{gfx, shaders};

/// Where the copy hands over (intro-clock.ts COPY_HOLD, COPY_FADE), and each line's later window.
const COPY_HOLD: f32 = 0.18;
const COPY_FADE: f32 = 0.58;
const RUNG_STEP: f32 = 0.06;
/// A page's copy drifts 0.06 of the width against the turn (pattern-beat.tsx:1671).
const DRIFT: f32 = 0.06;
/// The text entrance's rise, points (animations/text-entrance.ts TEXT_ENTRANCE_RISE).
const RISE: f32 = 6.0;
/// The dots (index.tsx StoryDot): 22 pt wide at their page, 8 away, 4 apart, 8 high; opacity 1
/// to 0.6; `accent` to `text.muted` by Reanimated's `interpolateColor` (RGB, gamma 2.2) on RN's
/// hex values, which iOS then reads as Display P3 (patterns.ts DARK_ACCENT, text.muted).
const DOT_WIDE: f32 = 22.0;
const DOT_NARROW: f32 = 8.0;
const DOT_GAP: f32 = 4.0;
const DOT_HIGH: f32 = 8.0;
const ACCENT: u32 = 0xCBAA8E;
const MUTED_DARK: u32 = 0x82878C;
const MUTED_LIGHT: u32 = 0x746D68;

fn interp(x: f32, x0: f32, x1: f32, y0: f32, y1: f32) -> f32 {
    if x <= x0 {
        y0
    } else if x >= x1 {
        y1
    } else {
        y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    }
}
/// A page's copy at distance `d` (pages) from it.
pub fn zone(d: f32) -> f32 {
    interp(d, COPY_HOLD, COPY_FADE, 1.0, 0.0)
}
/// A line's reveal, `rung` lines down: ENTRANCE_EASING, cubic-bezier(0.19, 1, 0.22, 1).
pub fn reveal(d: f32, rung: f32) -> f32 {
    let x = interp(d, (COPY_HOLD - rung * RUNG_STEP).max(0.0), COPY_FADE - rung * RUNG_STEP, 1.0, 0.0);
    gfx::bezier(0.19, 1.0, 0.22, 1.0, x)
}

/// `v` points on the pixel grid of a screen `scale` pixels a point (text-entrance.ts snapToPixel).
pub fn snap(v: f32, scale: f32) -> f32 {
    if scale > 0.0 {
        (v * scale).round() / scale
    } else {
        v
    }
}

/// One piece of copy: opacity and offset (points, on the pixel grid of `scale`) at pager position
/// `p`, for a canvas `w` wide. `which`: 0 the first page's band, 1 the puzzle's title, 2 its
/// subtitle. Reduce Motion: a line's entrance is its fade alone, no rise (textEntranceStyle).
pub fn copy_at(which: u8, p: f32, w: f32, scale: f32, reduced: bool) -> (f32, f32, f32) {
    match which {
        0 => (zone(p.abs()), snap(interp(p, -1.0, 1.0, w * DRIFT, -w * DRIFT), scale), 0.0),
        _ => {
            let band = zone((p - 1.0).abs());
            let shift = snap(interp(p, 0.0, 2.0, w * DRIFT, -w * DRIFT), scale);
            let r = reveal((p - 1.0).abs(), if which == 1 { 0.0 } else { 1.0 });
            let rise = if reduced { 0.0 } else { snap(RISE * (1.0 - r), scale) };
            (band * r, shift, rise)
        }
    }
}

/// The two dots at `p`: each one's width, opacity and sand share.
pub fn dots_at(p: f32) -> [(f32, f32, f32); 2] {
    let one = |d: f32| {
        let d = d.clamp(0.0, 1.0);
        (DOT_WIDE - (DOT_WIDE - DOT_NARROW) * d, 1.0 - 0.4 * d, 1.0 - d)
    };
    [one(p.abs()), one((p - 1.0).abs())]
}

/// A dot's colour, `share` of the way from muted to the accent, as sRGB components 0..1:
/// Reanimated's `interpolateColor` on RN's hex bytes, then those bytes read as Display P3.
pub fn dot_color(share: f32, light: bool) -> [f32; 3] {
    let bytes = |c: u32| [((c >> 16) & 255) as f64, ((c >> 8) & 255) as f64, (c & 255) as f64, 1.0];
    let muted = if light { MUTED_LIGHT } else { MUTED_DARK };
    let c = motion::interpolate::interpolate_color(1.0 - share as f64, &[0.0, 1.0], &[bytes(ACCENT), bytes(muted)]);
    p3_to_srgb([c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0])
}

/// Display P3 components (encoded) to sRGB's (encoded), clamped to sRGB's gamut.
pub fn p3_to_srgb(c: [f32; 3]) -> [f32; 3] {
    let lin = |v: f32| crate::scene::srgb_to_linear(v);
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    let m = [1.2249401 * r - 0.2249404 * g, -0.0420569 * r + 1.0420571 * g, -0.0196376 * r - 0.0786361 * g + 1.0982735 * b];
    m.map(|v| {
        let v = v.clamp(0.0, 1.0);
        if v <= 0.0031308 {
            v * 12.92
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        }
    })
}

/// Draws at most, a frame: three pieces of copy, two dots.
const SLOTS: usize = 8;

/// One draw: where its uniform sits in the arena, its texture and the bind group over both.
struct Slot {
    at: usize,
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

/// The layers' pipeline and draws.
pub struct Layers {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    blank: wgpu::TextureView,
    slots: Vec<Slot>,
}

/// What to draw: a texture at a rect, or a pill.
pub enum Draw<'a> {
    Texture(&'a wgpu::TextureView, [f32; 4], f32),
    Pill([f32; 4], [f32; 4]),
}

impl Layers {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat, arena: &mut gfx::Arena) -> Layers {
        let module = device.create_shader_module(shaders::layer::module());
        let layout = device.create_bind_group_layout(&shaders::layer::GROUP_0);
        let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("intro layers"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let cache = gfx::pipeline_cache(device);
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("intro layers"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some(shaders::layer::entry::VS), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some(shaders::layer::entry::FS),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: cache.handle.as_ref(),
        });
        let blank = gfx::target(device, "intro layer blank", wgpu::TextureFormat::Rgba8Unorm, 1, 1);
        let slots = (0..SLOTS).map(|_| Slot { at: arena.reserve(shaders::layer::Layer::SIZE), bind: None }).collect();
        Layers { pipeline, layout, sampler: gfx::linear_sampler(device, "intro layers"), blank, slots }
    }

    /// Fills the uniforms of `draws` (on a canvas `size` points, `srgb` or not) in the arena
    /// and binds their textures: how many to encode.
    pub fn prepare(&mut self, device: &wgpu::Device, arena: &mut gfx::Arena, size: (f32, f32), srgb: bool, draws: &[Draw]) -> usize {
        let draws = &draws[..draws.len().min(SLOTS)];
        for (slot, d) in self.slots.iter_mut().zip(draws) {
            let (view, u) = match d {
                Draw::Texture(view, rect, opacity) => (
                    *view,
                    shaders::layer::Layer { rect: *rect, view: [size.0, size.1, 0.0, *opacity], color: [0.0; 4], misc: [srgb as u8 as f32, 0.0, 0.0, 0.0] },
                ),
                Draw::Pill(rect, color) => (
                    &self.blank,
                    shaders::layer::Layer { rect: *rect, view: [size.0, size.1, 1.0, 1.0], color: *color, misc: [srgb as u8 as f32, 0.0, 0.0, 0.0] },
                ),
            };
            u.write(arena.at(slot.at, shaders::layer::Layer::SIZE));
            if slot.bind.as_ref().map(|(v, _)| v != view).unwrap_or(true) {
                let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("intro layer"),
                    layout: &self.layout,
                    entries: &[
                        wgpu::BindGroupEntry { binding: shaders::layer::L.binding, resource: arena.binding(slot.at, shaders::layer::Layer::SIZE) },
                        wgpu::BindGroupEntry { binding: shaders::layer::TEX.binding, resource: wgpu::BindingResource::TextureView(view) },
                        wgpu::BindGroupEntry { binding: shaders::layer::SMP.binding, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                    ],
                });
                slot.bind = Some((view.clone(), bind));
            }
        }
        draws.len()
    }

    /// Encodes the `n` layers prepared, in order, into `pass`.
    pub fn encode(&self, pass: &mut wgpu::RenderPass<'_>, n: usize) {
        pass.set_pipeline(&self.pipeline);
        for slot in &self.slots[..n] {
            pass.set_bind_group(0, &slot.bind.as_ref().unwrap().1, &[]);
            pass.draw(0..6, 0..1);
        }
    }
}

/// The dots as pills: the first at `origin` (canvas points, its row's left and vertical
/// centre), each in its colour (`dot_color`), faded as a whole by its opacity times `fade` (the
/// top row's: the entrance's reveal).
pub fn dot_draws(p: f32, origin: (f32, f32), light: bool, fade: f32) -> [Draw<'static>; 2] {
    let mut x = origin.0;
    dots_at(p).map(|(w, opacity, share)| {
        let rect = [x, origin.1 - DOT_HIGH / 2.0, w, DOT_HIGH];
        let [r, g, b] = dot_color(share, light);
        let a = opacity * fade;
        x += w + DOT_GAP;
        Draw::Pill(rect, [r * a, g * a, b * a, a])
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_copy_hands_over_as_rn() {
        assert_eq!(copy_at(0, 0.0, 420.0, 3.0, false).0, 1.0);
        assert!(copy_at(0, 0.6, 420.0, 3.0, false).0 == 0.0);
        let (o, _, y) = copy_at(1, 1.0, 420.0, 3.0, false);
        assert!((o - 1.0).abs() < 1e-4 && y.abs() < 1e-3);
        assert_eq!(copy_at(2, 0.0, 420.0, 3.0, false).0, 0.0);
        let [a, b] = dots_at(0.0);
        assert_eq!((a.0, b.0), (22.0, 8.0));
    }

    /// The drift and the rise land on the pixel grid (snapToPixel), and Reduce Motion has no rise.
    #[test]
    fn the_copy_moves_on_whole_pixels() {
        for k in 0..50 {
            let p = k as f32 / 37.0;
            for which in 0..3 {
                let (_, dx, dy) = copy_at(which, p, 420.0, 3.0, false);
                assert!(((dx * 3.0) - (dx * 3.0).round()).abs() < 1e-3 && ((dy * 3.0) - (dy * 3.0).round()).abs() < 1e-3, "{p} {which}: {dx} {dy}");
            }
        }
        assert!(copy_at(2, 0.5, 420.0, 3.0, false).2 > 0.0);
        assert_eq!(copy_at(2, 0.5, 420.0, 3.0, true).2, 0.0);
    }

    /// The dots' colour: #CBAA8E read as Display P3 at its page, the muted ink away, and between
    /// them Reanimated's gamma-2.2 mix (lighter than a straight byte mix).
    #[test]
    fn the_dots_mix_as_reanimated_in_display_p3() {
        let byte = |c: [f32; 3]| c.map(|v| (v * 255.0).round() as i32);
        // RN's sand on screen, app.tamber's display-p3 sand: #D2A88A.
        let sand = byte(dot_color(1.0, false));
        assert!((sand[0] - 0xD2).abs() <= 1 && (sand[1] - 0xA8).abs() <= 1 && (sand[2] - 0x8A).abs() <= 1, "{sand:?}");
        let muted = byte(dot_color(0.0, false));
        let p3 = byte(p3_to_srgb([0x82 as f32 / 255.0, 0x87 as f32 / 255.0, 0x8C as f32 / 255.0]));
        assert_eq!(muted, p3);
        // Halfway: red channel 0xCB, 0x82 mixed at gamma 2.2 is 0xAB (straight: 0xA6), then P3.
        let mid = interpolate_mid();
        assert_eq!(mid, 0xAB);
    }

    fn interpolate_mid() -> i32 {
        let c = motion::interpolate::interpolate_color(0.5, &[0.0, 1.0], &[[203.0, 170.0, 142.0, 1.0], [130.0, 135.0, 140.0, 1.0]]);
        c[0] as i32
    }
}
