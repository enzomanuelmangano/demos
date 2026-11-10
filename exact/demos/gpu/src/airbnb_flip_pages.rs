//! Airbnb Flip Interaction's description (src/animations/airbnb-flip-interaction/index.tsx and
//! flip-interaction/components/card/pages/{MainPage,SecondPage}.tsx): the page under the card,
//! swapped with Reanimated Keyframes when the card flips, under an AnimatedBlurView whose
//! intensity pulses with the flip. The canvas spans the window's width from the card box's top
//! (on the pixel grid), under the card's canvas; it draws nothing over the card.
//!
//! - descriptionSection: paddingHorizontal 32, its top cardHeight + 24 below the card box's
//!   (Yoga-rounded). The page container (radius 12 continuous, overflow hidden) at (32, top),
//!   356 wide: paddingBottom 32; each section marginBottom 12, paddingVertical 8: the title
//!   (SF-Pro-Rounded-Bold 20, #000, marginBottom 8) and the text (Source Sans Pro, "regular", 16,
//!   lineHeight 24, #1A1D29: each line's baseline (24 − UIFont.lineHeight) / 2 below TextKit's,
//!   wrapped as TextKit wraps). Each page is drawn once into its layer; Core Animation moves
//!   that layer (translateY) and fades it (opacity), as the Keyframes animate the View.
//! - Keyframes (linear between keys): SecondPage enters enteringFront (400 ms: 0 → opacity 0,
//!   ty −5; 60 % → 0.45, −2; 100 % → 1, 0) and exits exitingFront (250 ms: 0 → 1, 0; 30 % →
//!   0.45, 2; 100 % → 0, 5); MainPage enters enteringBack (ty +5, +2, 0) and exits exitingBack
//!   (ty 0, −2, −5). A page mounts on the first frame (entering), and each flip mounts the other
//!   one and keeps the old one where it was until its exit ends; a later sibling over an earlier.
//! - The AnimatedBlurView: absoluteFill of the section (the window wide, the entering page's
//!   height), zIndex 1, rgba(255,255,255,0.5) behind the effect, tint light (UIBlurEffect.light,
//!   `skia::backdrop`), intensity = interpolate(progress, [0, 0.2, 0.5, 0.8, 1], [0, 10, 20, 10, 0])
//!   (extended), as expo-blur's fraction (intensity / 100, clamped to 0.01 … 1).
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | progress | useDerivedValue(withSpring(isFlipped ? 1 : 0, { mass 1.2, stiffness 80, damping 12, velocity 0.3 })) | `Spring` (80, 12, 1.2); onStart: the running velocity + 0.3 (0.3 from rest), dropped when it points away from the target |
//! | intensity | interpolate(progress, …) above | the same, `expo_fraction` |
//! | page opacity / translateY | Keyframes above, from the commit that swaps the page | `Ghost`s, the same keys |
//!
//! Inputs: isFlipped, safeTop (the canvas's top in the window is safeTop + 56).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring, SpringConfig};
use skia::backdrop::{expo_fraction, BackdropBlur, Material};
use skia::blur::GRAPHITE_FORMAT;
use skia::{Canvas, Color, Font, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::airbnb_flip_pages::{entry, module, Uniforms, BLURRED, GROUP_0, PAGE0, PAGE1, SMP, U};

static BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-airbnb-subset.otf");
static REGULAR: &[u8] = include_bytes!("../fonts/source-sans-airbnb-subset.ttf");

const SPRING: SpringConfig = SpringConfig { stiffness: 80.0, damping: 12.0, mass: 1.2 };
const SPRING_VELOCITY: f64 = 0.3;
const PAD_X: f32 = 32.0;
const LINE: f32 = 24.0;
/// The page textures' height (points): taller than either page.
const PAGE_TEX_H: f32 = 400.0;

const PAGES: [[(&str, &str); 2]; 2] = [
    [
        ("Identity Verification", "Our identity verification process checks a person's information against trusted third-party sources or a government ID. The process has safeguards but doesn't guarantee that someone is who they say they are."),
        ("Trust & Safety", "Building trust in our community is essential. Verified identities help create safer, more reliable experiences for everyone."),
    ],
    [
        ("Profile Overview", "Your complete profile showcases your journey, including stats, personal information, and places visited. This transparency helps build trust within our community."),
        ("Community Engagement", "Through reviews, recommendations, and respectful interactions, you contribute to creating better experiences for everyone in our global community."),
    ],
];

/// A Keyframe: (progress, opacity, translateY), linear between.
type Keys = [(f64, f64, f64); 3];
const ENTER_FRONT: Keys = [(0.0, 0.0, -5.0), (0.6, 0.45, -2.0), (1.0, 1.0, 0.0)];
const EXIT_FRONT: Keys = [(0.0, 1.0, 0.0), (0.3, 0.45, 2.0), (1.0, 0.0, 5.0)];
const ENTER_BACK: Keys = [(0.0, 0.0, 5.0), (0.6, 0.45, 2.0), (1.0, 1.0, 0.0)];
const EXIT_BACK: Keys = [(0.0, 1.0, 0.0), (0.3, 0.45, -2.0), (1.0, 0.0, -5.0)];
const ENTER_MS: f64 = 400.0;
const EXIT_MS: f64 = 250.0;

fn keyframe(keys: &Keys, t: f64) -> (f64, f64) {
    let t = t.clamp(0.0, 1.0);
    for w in keys.windows(2) {
        let ((a, oa, ya), (b, ob, yb)) = (w[0], w[1]);
        if t <= b {
            let k = if b > a { (t - a) / (b - a) } else { 1.0 };
            return (oa + (ob - oa) * k, ya + (yb - ya) * k);
        }
    }
    let (_, o, y) = keys[keys.len() - 1];
    (o, y)
}

/// One mounted page View: which page, entering or exiting, since when.
#[derive(Clone, Copy, Debug)]
struct Ghost {
    page: usize,
    exiting: bool,
    start: Option<f64>,
}

impl Ghost {
    fn keys(&self) -> (&'static Keys, f64) {
        match (self.page, self.exiting) {
            (1, false) => (&ENTER_FRONT, ENTER_MS),
            (1, true) => (&EXIT_FRONT, EXIT_MS),
            (_, false) => (&ENTER_BACK, ENTER_MS),
            (_, true) => (&EXIT_BACK, EXIT_MS),
        }
    }
    /// (opacity, translateY, done).
    fn at(&self, now: f64) -> (f64, f64, bool) {
        let (keys, ms) = self.keys();
        let t = self.start.map_or(0.0, |s| (now - s) / ms);
        let (o, y) = keyframe(keys, t);
        (o, y, t >= 1.0)
    }
}

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Pages { flipped: None, safe_top: 0.0, progress: Spring::default(), ghosts: Vec::new(), heights: [0.0; 2], textures: None, under: None, blur: BackdropBlur::default(), gpu: None })
}

struct Pages {
    flipped: Option<bool>,
    safe_top: f32,
    progress: Spring,
    ghosts: Vec<Ghost>,
    /// Each page container's height (points).
    heights: [f32; 2],
    textures: Option<((u32, u32), [wgpu::TextureView; 2])>,
    under: Option<((u32, u32), wgpu::TextureView)>,
    blur: BackdropBlur,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    under: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    /// The compose pass's own (a buffer written twice in one submission holds the last write).
    uniforms2: wgpu::Buffer,
}

fn grid(v: f32, s: f32) -> f32 {
    (v * s + 0.5 + 1e-4).floor() / s
}
fn side(v: f32, s: f32) -> f32 {
    ((v * s + 1e-4).floor() + 1.0) / s
}
fn floor(v: f32, s: f32) -> f32 {
    (v * s + 1e-4).floor() / s
}

/// TextKit's word wrapping: breaks after spaces (hanging) and after a hyphen between letters.
fn wrap(font: &Font, text: &str, width: f32) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let n = chars.len();
    let byte = |i: usize| if i < n { chars[i].0 } else { text.len() };
    let mut breaks: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        let c = chars[i].1;
        if c == ' ' {
            let mut j = i;
            while j < n && chars[j].1 == ' ' {
                j += 1;
            }
            if j < n {
                breaks.push((i, j));
            }
            i = j;
            continue;
        }
        if c == '-' && i > 0 && i + 1 < n && chars[i - 1].1.is_alphanumeric() && chars[i + 1].1.is_alphanumeric() {
            breaks.push((i + 1, i + 1));
        }
        i += 1;
    }
    breaks.push((n, n));
    let fits = |a: usize, b: usize| font.advance_width(&text[byte(a)..byte(b)]) <= width + 1e-3;
    let (mut start, mut k) = (0, 0);
    while start < n {
        let mut last = None;
        while k < breaks.len() {
            let (end, next) = breaks[k];
            if end <= start {
                k += 1;
                continue;
            }
            if fits(start, end) {
                last = Some((end, next));
                k += 1;
            } else {
                break;
            }
        }
        match last {
            Some((end, next)) => {
                out.push((byte(start), byte(end)));
                start = next;
            }
            None => {
                let mut end = start + 1;
                while end < n && fits(start, end + 1) {
                    end += 1;
                }
                out.push((byte(start), byte(end)));
                start = end;
            }
        }
    }
    out
}

/// A page drawn into `c` at the container's origin; returns its container height.
fn record_page(c: &mut Canvas, page: usize, width: f32, title: &Font, body: &Font, s: f32, draw: bool) -> f32 {
    let title_h = side(gfx::line_height(title), s);
    let offset = (LINE - gfx::line_height(body)) / 2.0;
    let mut y = 0.0;
    for (k, (t, text)) in PAGES[page].iter().enumerate() {
        let lines = wrap(body, text, width);
        let body_h = side(LINE * lines.len() as f32, s);
        let section_h = 8.0 + title_h + 8.0 + body_h + 8.0;
        let top = if k == 0 { 0.0 } else { y };
        if draw {
            c.draw_text(t, 0.0, gfx::baseline(title, top + 8.0), title, &Paint::fill(Color::BLACK));
            let body_top = top + 8.0 + floor(title_h + 8.0, s);
            let paint = Paint::fill(Color::view_hex(0x1A1D29));
            for (i, &(a, b)) in lines.iter().enumerate() {
                c.draw_text(&text[a..b], 0.0, gfx::baseline(body, body_top + i as f32 * LINE + offset), body, &paint);
            }
        }
        y = top + grid(section_h + 12.0, s);
        let _ = k;
    }
    // The container: its sections (each with marginBottom 12) and paddingBottom 32.
    y + 32.0
}

impl Pages {
    fn step(&mut self, now: f64) -> bool {
        for g in &mut self.ghosts {
            if g.start.is_none() {
                g.start = Some(now);
            }
        }
        self.ghosts.retain(|g| !(g.exiting && g.at(now).2));
        let mut moving = self.progress.step(now);
        moving |= self.ghosts.iter().any(|g| !g.at(now).2);
        moving
    }
}

impl Surface for Pages {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let flipped = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        self.safe_top = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        if self.flipped == Some(flipped) {
            return Ok(());
        }
        let page = flipped as usize;
        if self.flipped.is_none() {
            self.progress.set(if flipped { 1.0 } else { 0.0 });
        } else {
            let v = if self.progress.running { self.progress.velocity } else { 0.0 } + SPRING_VELOCITY;
            self.progress.to(if flipped { 1.0 } else { 0.0 }, v, SPRING);
            for g in &mut self.ghosts {
                if !g.exiting {
                    g.exiting = true;
                    g.start = None;
                }
            }
        }
        self.ghosts.push(Ghost { page, exiting: false, start: None });
        self.flipped = Some(flipped);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"flipped\":{},\"progress\":{:.4},\"pages\":{},\"heights\":[{:.3},{:.3}]}}", self.flipped.unwrap_or(false), self.progress.value, self.ghosts.len(), self.heights[0], self.heights[1]))
    }

    fn render(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder, target: &wgpu::TextureView, format: wgpu::TextureFormat) -> bool {
        if self.flipped.is_none() {
            self.bind(&[], None).ok();
        }
        let s = frame.scale;
        let (pw, ph) = frame.pixels();
        let moving = self.step(frame.now_ms);
        let width = frame.width - 2.0 * PAD_X;
        // The section's top: the card box (cardWidth / 1.6) and cardSection's paddingBottom 24.
        let card_h = (frame.width - 64.0) / 1.6;
        let top = grid(card_h + 24.0, s);
        let tex = ((width * s).round() as u32, (PAGE_TEX_H * s).round() as u32);
        if self.textures.as_ref().map(|t| t.0) != Some(tex) {
            let (Some(title), Some(body)) = (Font::new(BOLD, 20.0).map(Font::with_ui_layout), Font::new(REGULAR, 16.0).map(Font::with_ui_layout)) else { return false };
            let mut views = Vec::new();
            for page in 0..2 {
                let view = skia::render::sampled_target(device, "airbnb page", GRAPHITE_FORMAT, tex.0, tex.1);
                let mut c = Canvas::default();
                c.begin(s);
                self.heights[page] = record_page(&mut c, page, width, &title, &body, s, true);
                Renderer::default().draw(device, queue, encoder, &c, &view, GRAPHITE_FORMAT, tex.0, tex.1, wgpu::Color::TRANSPARENT);
                views.push(view);
            }
            let [a, b]: [wgpu::TextureView; 2] = views.try_into().ok().unwrap();
            self.textures = Some((tex, [a, b]));
        }
        if self.under.as_ref().map(|u| u.0) != Some((pw, ph)) {
            self.under = Some(((pw, ph), skia::render::sampled_target(device, "airbnb under", GRAPHITE_FORMAT, pw, ph)));
        }
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            let shader = device.create_shader_module(module());
            let layout = device.create_bind_group_layout(&GROUP_0);
            self.gpu = Some(Gpu {
                format,
                generation: frame.shader_generation,
                under: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::UNDER, GRAPHITE_FORMAT, None),
                compose: skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None),
                layout,
                sampler: skia::render::linear_sampler(device),
                uniforms: device.create_buffer(&wgpu::BufferDescriptor { label: Some("airbnb pages"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
                uniforms2: device.create_buffer(&wgpu::BufferDescriptor { label: Some("airbnb pages 2"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
            });
        }
        // The section: the window wide, the entering page's height.
        let current = self.flipped.unwrap_or(false) as usize;
        let section = [0.0, (top * s).round(), pw as f32, ((top + self.heights[current]) * s).round().min(ph as f32)];
        let mut g = [[0.0f32; 4]; 4];
        let skip = self.ghosts.len().saturating_sub(4);
        for (k, ghost) in self.ghosts.iter().skip(skip).enumerate() {
            let (o, y, _) = ghost.at(frame.now_ms);
            g[k] = [ghost.page as f32, o as f32, y as f32, 1.0];
        }
        let mut u = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            section,
            page: [PAD_X, top, tex.0 as f32, tex.1 as f32],
            g0: g[0],
            g1: g[1],
            g2: g[2],
            g3: g[3],
            m: [0.0; 4],
            n: [1.0; 4],
        };
        let gpu = self.gpu.as_ref().unwrap();
        let (textures, under) = (&self.textures.as_ref().unwrap().1, &self.under.as_ref().unwrap().1);
        let bind = |blurred: &wgpu::TextureView| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("airbnb pages"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: PAGE0.binding, resource: wgpu::BindingResource::TextureView(&textures[0]) },
                    wgpu::BindGroupEntry { binding: PAGE1.binding, resource: wgpu::BindingResource::TextureView(&textures[1]) },
                    wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(blurred) },
                    wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
                ],
            })
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        // Pass 1: what the effect sees (its own background included).
        let first = bind(&textures[0]);
        skia::render::fullscreen_pass(encoder, "airbnb under", under, &gpu.under, &first);
        // The effect over the section.
        let intensity = interpolate(self.progress.value, &[0.0, 0.2, 0.5, 0.8, 1.0], &[0.0, 10.0, 20.0, 10.0, 0.0], Extrapolation::Extend);
        // expo-blur clamps the fraction to 0.01, but an intensity of 0 shows no effect (measured
        // at rest: the page under the veil is sharp, as fluid-tab-interaction's cells).
        let blurred = if intensity > 0.0 {
            let params = Material::Light.chain().at(expo_fraction(intensity));
            let region = [section[0] as i32, section[1] as i32, section[2] as i32, section[3] as i32];
            let window = [0.0, ((self.safe_top + 56.0) * s).round()];
            let out = self.blur.run(device, queue, encoder, under, region, window, &params, s);
            u.m = out.mapping[0];
            u.m[3] = 1.0;
            u.n = out.mapping[1];
            out.view.clone()
        } else {
            textures[0].clone()
        };
        queue.write_buffer(&gpu.uniforms2, 0, &u.bytes());
        let second = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("airbnb pages compose"),
            layout: &gpu.layout,
            entries: &[
                wgpu::BindGroupEntry { binding: U.binding, resource: gpu.uniforms2.as_entire_binding() },
                wgpu::BindGroupEntry { binding: PAGE0.binding, resource: wgpu::BindingResource::TextureView(&textures[0]) },
                wgpu::BindGroupEntry { binding: PAGE1.binding, resource: wgpu::BindingResource::TextureView(&textures[1]) },
                wgpu::BindGroupEntry { binding: BLURRED.binding, resource: wgpu::BindingResource::TextureView(&blurred) },
                wgpu::BindGroupEntry { binding: SMP.binding, resource: wgpu::BindingResource::Sampler(&gpu.sampler) },
            ],
        });
        skia::render::fullscreen_pass(encoder, "airbnb pages", target, &gpu.compose, &second);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn the_keyframes_are_rns() {
        assert_eq!(keyframe(&ENTER_FRONT, 0.0), (0.0, -5.0));
        let (o, y) = keyframe(&ENTER_FRONT, 0.3);
        assert!((o - 0.225).abs() < 1e-9 && (y + 3.5).abs() < 1e-9);
        assert_eq!(keyframe(&EXIT_BACK, 1.0), (0.0, -5.0));
    }

    #[test]
    fn the_pages_fit_their_texture() {
        let (Some(title), Some(body)) = (Font::new(BOLD, 20.0).map(Font::with_ui_layout), Font::new(REGULAR, 16.0).map(Font::with_ui_layout)) else { return };
        let mut c = Canvas::default();
        for page in 0..2 {
            let h = record_page(&mut c, page, 356.0, &title, &body, 3.0, false);
            assert!(h + 5.0 < PAGE_TEX_H, "{h}");
            assert!(h > 250.0, "{h}");
        }
        // MainPage's first text: five lines at 356, as RN wraps it.
        assert_eq!(wrap(&body, PAGES[0][0].1, 356.0).len(), 5);
    }

    #[test]
    fn a_flip_swaps_the_pages_and_pulses_the_blur() {
        let mut p = Pages { flipped: None, safe_top: 68.0, progress: Spring::default(), ghosts: Vec::new(), heights: [0.0; 2], textures: None, under: None, blur: BackdropBlur::default(), gpu: None };
        p.bind(&[Value::Bool(false), Value::Number(68.0)], None).unwrap();
        p.step(0.0);
        p.bind(&[Value::Bool(true), Value::Number(68.0)], None).unwrap();
        assert_eq!(p.ghosts.len(), 2);
        assert!(p.ghosts[0].exiting && !p.ghosts[1].exiting);
        let mut ms = 500.0;
        p.step(ms);
        let mut peak: f64 = 0.0;
        while p.step(ms) {
            ms += 1000.0 / 60.0;
            peak = peak.max(p.progress.value);
        }
        assert_eq!(p.ghosts.len(), 1);
        assert!(peak > 1.0, "{peak}");
    }
}
