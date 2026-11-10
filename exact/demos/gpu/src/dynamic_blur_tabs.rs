//! Dynamic Blur Tabs' bar (src/animations/dynamic-blur-tabs/src/components/bottom-tab-bar/
//! index.tsx): the BlurView (tint systemMaterialDark, intensity 70, backgroundColor
//! rgba(255,255,255,0.05)), the bar's continuous outline that clips it, and the bar's border.
//! The Contract keeps the scroll, the grid, the gradient and the icons; this canvas covers the
//! bottom of the window where the bar can be, transparent outside the bar.
//!
//! - progress = withSpring(IsTabBarActive ? 1 : 0) (Reanimated's default, 900 / 120 / 4).
//!   rBarStyle: left = right = interpolate(progress, [0, 1], [0.15 W, 0]), height [70,
//!   70 + safeBottom + 15], borderRadius [0.15 W, 20] (continuous), borderWidth [1, 0.6],
//!   bottom paddingBottom − 2 with paddingBottom [safeBottom + 15, 0]. Yoga puts the bar's and
//!   the BlurView's edges on the pixel grid each frame; the BlurView is the bar inside its border.
//! - The border: Core Animation's (the bar clips): the outline minus the outline inset by the
//!   width (radius r − width), rgba(216, 216, 216, 0.597).
//! - What UIKit's backdrop captures under the BlurView: the focused screen (home: the FlatList on
//!   black, its gradient squares where the scroll puts them; another tab: the navigator's
//!   rgb(242, 242, 242)), the LinearGradient over the window's bottom (LINEAR_GRADIENT_COLORS,
//!   BOTTOM_BAR_HEIGHT + safeBottom + 15 + 100 tall, unpremultiplied as Core Graphics), and the
//!   BlurView's own 5 % white. Then skia::backdrop's systemMaterialDark chain at 0.7.
//! - A square: `(W − 40) / 4`, padded 4 in a FlatList of four columns (padding 4, paddingTop
//!   safeTop); its LinearGradient of three hsl stops (generateHarmonicColors, Math.random as
//!   the Contract's `roll(seed, …)`, P3 components as the app reads them) top to bottom, its
//!   contents not clipped by the radius; the 1 pt rgba(255,255,255,0.2) border RN draws itself
//!   (translucent, not clipping): `skia::border_ring_path`, radius 4.
//!
//! Inputs: IsTabBarActive, the focused tab, the scroll's offset, the seed, safeTop,
//! safeBottom, the window's height.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring, GENTLE};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::{gfx, shaders};
use shaders::dynamic_blur_tabs::{entry, module, Uniforms, BLURRED, GROUP_0, HOLE, OUTLINE, SMP, U};

/// `intensity={70}`.
const INTENSITY: f64 = 70.0;
/// BOTTOM_BAR_HEIGHT.
const BAR_HEIGHT: f64 = 70.0;
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's bar surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(DynamicBlurTabs::default())
}

#[derive(Default)]
struct DynamicBlurTabs {
    active: Option<bool>,
    focused: usize,
    scroll: f32,
    seed: f64,
    safe_top: f32,
    safe_bottom: f64,
    window_height: f32,
    progress: Spring,
    /// The hundred squares' stops for `seed`.
    colors: Option<(u64, Vec<[Color; 3]>)>,
    /// The backdrop, the outline, its inset.
    canvases: [Canvas; 3],
    renderers: [Renderer; 3],
    blur: BackdropBlur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    layers: [wgpu::TextureView; 3],
    bind: Option<(wgpu::TextureView, wgpu::BindGroup)>,
}

/// The Contract's `roll(seed, k, n)` (env.contract), in the same f64 steps.
pub fn roll(seed: f64, k: f64, n: f64) -> f64 {
    let turn = |x: f64| (x % 65536.0) * 32768.0 + (x / 65536.0).floor();
    let stir = |x: f64| turn((x * (16807.0 + (x / 65536.0).floor())) % 2147483647.0);
    (stir(stir(stir(1.0 + (stir(stir(1.0 + seed % 2147483646.0)) + k) % 2147483646.0))) * n / 2147483647.0).floor()
}

/// CSS's hsl → RGB, each channel rounded to 8 bits (processColor), as `0xRRGGBB`.
fn hsl(h: f64, s: f64, l: f64) -> u32 {
    let c = (1.0 - (2.0 * l / 100.0 - 1.0).abs()) * s / 100.0;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let m = l / 100.0 - c / 2.0;
    let ch = |v: f64| (255.0 * (m + v)).round().clamp(0.0, 255.0) as u32;
    (ch(r) << 16) | (ch(g) << 8) | ch(b)
}

/// generateHarmonicColors for square `k`: hue, hue + 30, hue + 60 at one saturation and
/// lightness, P3 components shown as sRGB (`Color::view_hex`).
fn harmonic(seed: f64, k: usize) -> [Color; 3] {
    let k = k as f64;
    let hue = roll(seed, k * 3.0, 36000.0) / 100.0;
    let sat = 70.0 + roll(seed, k * 3.0 + 1.0, 1000.0) / 1000.0;
    let light = 40.0 + roll(seed, k * 3.0 + 2.0, 2000.0) / 100.0;
    [0.0, 30.0, 60.0].map(|d| Color::view_hex(hsl((hue + d) % 360.0, sat, light)))
}

/// The bar at `progress`, in window points: x, y, width, height, radius, border width.
pub fn bar(progress: f64, width: f64, height: f64, safe_bottom: f64) -> [f64; 6] {
    let p = |a: f64, b: f64| interpolate(progress, &[0.0, 1.0], &[a, b], Extrapolation::Extend);
    let side = p(0.15 * width, 0.0);
    let h = p(BAR_HEIGHT, BAR_HEIGHT + safe_bottom + 15.0);
    let bottom = p(safe_bottom + 15.0, 0.0) - 2.0;
    [side, height - bottom - h, width - 2.0 * side, h, p(0.15 * width, 20.0), p(1.0, 0.6)]
}

impl Surface for DynamicBlurTabs {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let num = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0);
        let active = inputs.first().and_then(|v| v.as_bool()).unwrap_or(true);
        match self.active {
            None => self.progress = Spring::at(if active { 1.0 } else { 0.0 }),
            Some(was) if was != active => self.progress.retarget(if active { 1.0 } else { 0.0 }, GENTLE),
            _ => {}
        }
        self.active = Some(active);
        self.focused = num(1).max(0.0) as usize;
        self.scroll = num(2) as f32;
        self.seed = num(3);
        self.safe_top = num(4) as f32;
        self.safe_bottom = num(5);
        self.window_height = num(6) as f32;
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{:.3},\"scroll\":{:.1}}}", self.progress.value, self.scroll))
    }

    fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
        let moving = self.progress.step(frame.now_ms);
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        let sd = s as f64;
        let (cw, ch) = (frame.width, frame.height);
        let wh = self.window_height;
        // The canvas's top in the window.
        let y0 = wh - ch;
        if self.gpu.as_ref().map(|g| (g.format, g.generation, g.pixels)) != Some((format, frame.shader_generation, (pw, ph))) {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
        }
        let seed_key = self.seed.to_bits();
        if self.colors.as_ref().is_none_or(|(k, _)| *k != seed_key) {
            self.colors = Some((seed_key, (0..100).map(|k| harmonic(self.seed, k)).collect()));
        }
        // The bar, its edges on the pixel grid (Yoga), in canvas points.
        let [bx, by, bw, bh, radius, border] = bar(self.progress.value, cw as f64, wh as f64, self.safe_bottom);
        let snap = |v: f64| (v * sd).round() / sd;
        let (x0, x1, top, bottom) = (snap(bx), snap(bx + bw), snap(by - y0 as f64), snap(by - y0 as f64 + bh));
        let (ix0, ix1, iy0, iy1) = (snap(x0 + border), snap(x1 - border), snap(top + border), snap(bottom - border));
        let (x0, x1, top, bottom, radius, border) = (x0 as f32, x1 as f32, top as f32, bottom as f32, radius as f32, border as f32);
        let [backdrop, outline, hole] = &mut self.canvases;
        // What the backdrop captures, in canvas points (the window shifted up by y0).
        backdrop.begin(s);
        if self.focused == 0 {
            backdrop.fill(Color::BLACK);
            let size = (cw - 40.0) / 4.0;
            let cell = size + 8.0;
            let colors = &self.colors.as_ref().unwrap().1;
            for (k, stops3) in colors.iter().enumerate() {
                let (row, col) = ((k / 4) as f32, (k % 4) as f32);
                let x = 4.0 + col * cell + 4.0;
                let y = self.safe_top + row * cell + 4.0 - self.scroll - y0;
                if y + size < 0.0 || y > ch {
                    continue;
                }
                let shade = Shader::Linear { start: point(0.0, y), end: point(0.0, y + size), stops: stops(stops3) };
                backdrop.draw_rect(x, y, size, size, &Paint::shader(shade));
                backdrop.draw_path(&skia::border_ring_path(x, y, size, size, 4.0, 1.0), &Paint::fill(Color::WHITE.alpha(0.2)));
            }
        } else {
            backdrop.fill(Color::rgb8(242, 242, 242));
        }
        // LINEAR_GRADIENT_COLORS over BOTTOM_BAR_HEIGHT + safeBottom + 15 + 100.
        let gh = 185.0 + self.safe_bottom as f32;
        let g0 = wh - gh - y0;
        let shade = Shader::Linear {
            start: point(0.0, g0),
            end: point(0.0, g0 + gh),
            stops: stops(&[Color::WHITE.alpha(0.0), Color::BLACK.alpha(0.1), Color::BLACK.alpha(0.5), Color::BLACK.alpha(0.8)]),
        };
        backdrop.draw_rect(0.0, g0, cw, gh, &Paint::shader(shade));
        // The BlurView's backgroundColor, under its effect.
        backdrop.draw_rect(ix0 as f32, iy0 as f32, (ix1 - ix0) as f32, (iy1 - iy0) as f32, &Paint::fill(Color::WHITE.alpha(0.05)));
        outline.begin(s);
        outline.draw_continuous_rrect(x0, top, x1 - x0, bottom - top, radius, &Paint::fill(Color::WHITE));
        hole.begin(s);
        hole.draw_continuous_rrect(x0 + border, top + border, x1 - x0 - 2.0 * border, bottom - top - 2.0 * border, (radius - border).max(0.0), &Paint::fill(Color::WHITE));
        let gpu = self.gpu.as_mut().unwrap();
        for i in 0..3 {
            let clear = if i == 0 { wgpu::Color::BLACK } else { wgpu::Color::TRANSPARENT };
            self.renderers[i].draw(device, queue, encoder, &self.canvases[i], &gpu.layers[i], LAYER, pw, ph, clear);
        }
        // The BlurView: its region on the canvas, within the window.
        let px = |v: f64, max: u32| ((v * sd).round() as i32).clamp(0, max as i32);
        let region = [px(ix0, pw), px(iy0, ph), px(ix1, pw).max(px(ix0, pw) + 1), px(iy1, ph).max(px(iy0, ph) + 1)];
        let params = Material::SystemMaterialDark.chain().at(expo_fraction(INTENSITY));
        let out = self.blur.run(device, queue, encoder, &gpu.layers[0], region, [0.0, y0 * s], &params, s);
        let u = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            inner: [region[0] as f32, region[1] as f32, region[2] as f32, region[3] as f32],
            low: out.mapping[0],
            size: out.mapping[1],
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        if gpu.bind.as_ref().is_none_or(|(v, _)| v != out.view) {
            let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("dynamic blur tabs"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(out.view) },
                    wgpu::BindGroupEntry { binding: OUTLINE.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[1]) },
                    wgpu::BindGroupEntry { binding: HOLE.binding, resource: wgpu::BindingResource::TextureView(&gpu.layers[2]) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            });
            gpu.bind = Some((out.view.clone(), group));
        }
        skia::render::fullscreen_pass(encoder, "dynamic blur tabs", target, &gpu.compose, &gpu.bind.as_ref().unwrap().1);
        moving
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, pixels: (u32, u32)) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let target = |label| skia::render::sampled_target(device, label, LAYER, pixels.0, pixels.1);
    Gpu {
        format,
        generation,
        pixels,
        compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None),
        layout,
        sampler: skia::render::linear_sampler(device),
        uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("dynamic blur tabs"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
        layers: [target("dynamic blur tabs backdrop"), target("dynamic blur tabs outline"), target("dynamic blur tabs hole")],
        bind: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn roll_and_hsl_follow_the_contract() {
        // hsl(0, 70%, 50%) → (217, 38, 38); hsl(120, 100%, 25%) → (0, 128, 0).
        assert_eq!(hsl(0.0, 70.0, 50.0), 0xD92626);
        assert_eq!(hsl(120.0, 100.0, 25.0), 0x008000);
        for k in 0..20 {
            let r = roll(12345.0, k as f64, 36000.0);
            assert!((0.0..36000.0).contains(&r) && r.fract() == 0.0);
        }
    }

    #[test]
    fn the_bar_springs_between_sheet_and_pill() {
        // iPhone Air: 420 × 912, safeBottom 34.
        let sheet = bar(1.0, 420.0, 912.0, 34.0);
        assert_eq!(sheet, [0.0, 912.0 - (-2.0) - 119.0, 420.0, 119.0, 20.0, 0.6]);
        let pill = bar(0.0, 420.0, 912.0, 34.0);
        assert_eq!(pill, [63.0, 912.0 - 47.0 - 70.0, 294.0, 70.0, 63.0, 1.0]);
    }

    #[test]
    fn the_bar_is_the_blurred_backdrop_inside_its_border_and_nothing_else() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        // The canvas: the window's bottom safeBottom + 85 = 119 points.
        let frame = |now_ms| Frame { width: 420.0, height: 119.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        let inputs = |active: bool, focused: f64| [Value::Bool(active), Value::Number(focused), Value::Number(0.0), Value::Number(7.0), Value::Number(62.0), Value::Number(34.0), Value::Number(912.0)];
        s.bind(&inputs(true, 1.0), None).unwrap();
        let (sheet, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        sheet.save("dynamic-blur-tabs-sheet");
        assert!(!animating);
        // Another tab: rgb(242, 242, 242) under the gradient and 5 % white, through
        // systemMaterialDark at 0.7 — flat there, so the chain's own flat colour.
        let mid = sheet.at(630, 180);
        assert!(mid[3] == 255 && mid[0] > 60 && mid[0] < 200, "{mid:?}");
        // Scrolled: the pill, transparent beside it.
        s.bind(&inputs(false, 0.0), None).unwrap();
        let mut ms = 0.0;
        loop {
            ms += 16.0;
            let (_, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if !animating || ms > 3000.0 {
                break;
            }
        }
        let (pill, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        pill.save("dynamic-blur-tabs-pill");
        assert_eq!(pill.at(30, 200)[3], 0, "beside the pill");
        assert_eq!(pill.at(630, 200)[3], 255, "inside the pill");
        // Against UIKit (exact/parity-tools/blur-probe `-pattern grid`, the same seed's squares,
        // gradient and BlurView over the pill's inner rect), away from the rounded ends, every
        // 4th pixel.
        let cap = include_bytes!("../tests/dynamic-blur-tabs/pill.rgb");
        let mut worst = 0i32;
        for y in 0..51u32 {
            for x in 0..135u32 {
                let got = pill.at(360 + 4 * x, 2388 - 2379 + 4 * y);
                for c in 0..3 {
                    worst = worst.max((got[c] as i32 - cap[((y * 135 + x) * 3 + c as u32) as usize] as i32).abs());
                }
            }
        }
        // The P3 squares' out-of-sRGB components: clipped here, kept by Core Animation.
        assert!(worst <= 5, "worst {worst}");
        // The pill's left end: the border's grey over nothing.
        let edge = pill.at(190, 111);
        assert!(edge[3] > 0, "{edge:?}");
    }
}
