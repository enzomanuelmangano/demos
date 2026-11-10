//! Particles Button (src/animations/particles-button: index.tsx, components/circular-button.tsx,
//! components/blast-effect/index.tsx): a 48 pt dark disc on #111 with a "plus-circle"; pressed,
//! the plus turns into a check and back, and twenty faint dots burst out of the disc.
//!
//! The canvas is BlastCircleEffect's (size × 5 = 240 square, centred on the button, behind it);
//! the button is drawn over it here, so its press, its chained springs and its icons' clamped
//! interpolations run on the same clock.
//!
//! Motion audit (each row matched here):
//! - press (pressto PressableScale): progress = withTiming(active, 250 ms, bezier(0.25, 0.1,
//!   0.25, 1)), scale interpolate(p, [0, 1], [1, 0.96]) about the button's centre. active on
//!   touch-down (onBegan), off on lift or cancel (onEnded/onFailed/onCancelled). onPress when the
//!   finger lifts inside the button's own 48² bounds (RNGestureHandlerButton's strict hit frame):
//!   the app's selection haptic (posted `haptic:selection`), then onPressHandler. All of it is
//!   the shared `pressto::Pressable`.
//! - onPressHandler, unless isAnimating: progress = withSpring(1, { mass 0.5, stiffness 70,
//!   damping 16 }) (ζ 1.35: run critically damped, as Reanimated does), then on finish
//!   withSpring(0, { mass 0.5, stiffness 120, damping 14 }) (ζ 0.90, undershoots 0), then
//!   isAnimating = false.
//! - base icon (AntDesign plus-circle 48 #afafaf): opacity interpolate(p, [0, 0.5], [1, 0])
//!   (extended, shown clamped to 0…1), rotate interpolate(p, [0, 0.5], [0, 45]) CLAMP, degrees.
//! - active icon (FontAwesome6 check, solid, 24 #afafaf): opacity interpolate(p, [0, 1], [0, 1])
//!   (extended, clamped), rotate interpolate(p, [0, 1], [-45, 0]) CLAMP.
//! - blast(BlastEffectConfig, 100): baseRandomness = Math.random(); progress 0 then
//!   withDelay(100, withSpring(1, { mass 1, stiffness 100, damping 20 })) (ζ 1). radius =
//!   interpolate(p, [0, 1], [0, 96]); particle i at RSXform(1, 0, 122 + cos(a)·r^e, 118 +
//!   sin(a)·r^e), e = 1.02 for odd i, a = 2πi/20 + (√(frac(sin(i)·10⁴)·base) − 0.5)·2π/20.
//!   Atlas opacity interpolate(p, [0.8, 1], [1, 0])² (extended, clamped by the paint).
//!
//! The texture is useTexture's 80 × 4 offscreen image at one pixel per point: circle k at
//! (4k − 2, 2), r 2, white at opacity 0.1 + 0.1·Math.random(), so sprite i (rect(4i, 0, 4, 4))
//! holds circle i + 1 and sprite 19 is empty. Each circle is Graphite's analytic coverage
//! (atlas_sphere::rrect_coverage), written as 8 bits; the sprites sample it bilinearly (the
//! Atlas default, kLinear), each 4 × 4 points on screen.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use reanimated::{interpolate, interpolate_clamp, Extrapolation, Spring, SpringConfig};
use skia::{Canvas, Color, Font, Image, Images, Paint, Rect, Renderer, RsXform};

use crate::gfx;

/// buttonSize, size × 5, buttonSize × 2.
const SIZE: f32 = 48.0;
const BLAST_SIZE: f32 = SIZE * 5.0;
const BLAST_RADIUS: f64 = SIZE as f64 * 2.0;
/// BlastCircleEffect count, circleRadius.
const COUNT: usize = 20;
const CIRCLE_R: f32 = 2.0;
/// The springs.
const BLAST_CURVE: SpringConfig = SpringConfig { stiffness: 70.0, damping: 16.0, mass: 0.5 };
const FAST_RESET: SpringConfig = SpringConfig { stiffness: 120.0, damping: 14.0, mass: 0.5 };
const BLAST_EFFECT: SpringConfig = SpringConfig { stiffness: 100.0, damping: 20.0, mass: 1.0 };
const BLAST_DELAY_MS: f64 = 100.0;
/// lightColor (a Text colour: Display P3, the same numbers for a grey), darkColor (a View).
const LIGHT: u32 = 0xAFAFAF;
const DARK: u32 = 0x1D1D1D;
/// AntDesign plus-circle, FontAwesome6 (solid) check.
const PLUS_CIRCLE: &str = "\u{F4DB}";
const CHECK: &str = "\u{F00C}";
static ANTDESIGN: &[u8] = include_bytes!("../fonts/antdesign-plus-circle-subset.ttf");
static FA6_SOLID: &[u8] = include_bytes!("../fonts/fa6-solid-check-subset.ttf");

static MOUNTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The demo's surface. Input: `env.seed` (Math.random()'s stream).
pub fn surface() -> Box<dyn Surface> {
    let sprites = std::array::from_fn(|i| Rect::new(2.0 * CIRCLE_R * i as f32, 0.0, 2.0 * CIRCLE_R, 2.0 * CIRCLE_R));
    Box::new(ParticlesButton {
        mount: MOUNTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        seed: None,
        random: gfx::Random::new(0.0),
        base: 0.0,
        texture: None,
        images: None,
        press: Pressable::new(),
        pressed: false,
        progress: Spring::at(0.0),
        stage: Stage::Idle,
        blast: Spring::at(0.0),
        blast_at: None,
        sprites,
        transforms: [RsXform { scos: 1.0, ssin: 0.0, tx: 0.0, ty: 0.0 }; COUNT],
        plus: Font::new(ANTDESIGN, SIZE).map(Font::with_ui_layout),
        check: Font::new(FA6_SOLID, SIZE / 2.0).map(Font::with_ui_layout),
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Stage {
    Idle,
    /// withSpring(1, BlastCurveConfig).
    Out,
    /// withSpring(0, FastResetConfig).
    Back,
}

struct ParticlesButton {
    mount: u64,
    seed: Option<f64>,
    random: gfx::Random,
    /// baseRandomness.
    base: f64,
    /// The 80 × 4 premultiplied texture, rolled at mount.
    texture: Option<Image>,
    images: Option<Images>,
    /// The PressableScale (the shared pressto machine).
    press: Pressable,
    /// A press to handle on the next frame (JS runs it, the UI thread starts its animations).
    pressed: bool,
    progress: Spring,
    stage: Stage,
    blast: Spring,
    /// withDelay's start time (the frame the blast was called on).
    blast_at: Option<f64>,
    sprites: [Rect; COUNT],
    transforms: [RsXform; COUNT],
    plus: Option<Font>,
    check: Option<Font>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

/// The button's rect in the canvas.
fn button_origin() -> f32 {
    (BLAST_SIZE - SIZE) / 2.0
}

/// seededRandom(i) (f64, as JS).
fn seeded(i: usize, base: f64) -> f64 {
    let x = (i as f64).sin() * 10000.0;
    ((x - x.floor()) * base).sqrt()
}

/// useTexture's image: circle k at (4k − 2, 2), opacity `opacities[k]`, over 80 × 4 pixels.
fn texture(opacities: &[f64; COUNT]) -> Image {
    let cell = (2.0 * CIRCLE_R) as u32;
    let coverage = crate::atlas_sphere::rrect_coverage([0.0, 0.0, cell as f32, cell as f32], CIRCLE_R, cell);
    let (w, h) = (cell * COUNT as u32, cell);
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    // Circle k's cell starts at 4k − 4: k = 0 is off the image, k = 1…19 land in cells 0…18.
    for (k, &opacity) in opacities.iter().enumerate().skip(1) {
        let x0 = (k as u32 - 1) * cell;
        for y in 0..cell {
            for x in 0..cell {
                let c = coverage[(y * cell + x) as usize].unwrap_or(0.0);
                let v = (opacity as f32 * c).clamp(0.0, 1.0) * 255.0;
                let v = v.round() as u8;
                let d = (((y * w) + x0 + x) * 4) as usize;
                pixels[d..d + 4].copy_from_slice(&[v, v, v, v]);
            }
        }
    }
    Image { width: w, height: h, pixels }
}

impl ParticlesButton {
    fn animating(&self) -> bool {
        self.stage != Stage::Idle
    }

    /// onPressHandler, on the frame after the press.
    fn on_press(&mut self, now: f64) {
        if self.animating() {
            return;
        }
        self.stage = Stage::Out;
        self.progress.to(1.0, 0.0, BLAST_CURVE);
        self.progress.step(now);
        // blast(BlastEffectConfig, 100).
        self.base = self.random.next();
        self.blast.set(0.0);
        self.blast_at = Some(now);
    }

    fn step(&mut self, now: f64) -> bool {
        let mut moving = self.press.step(now);
        if self.pressed {
            self.pressed = false;
            self.on_press(now);
        }
        if self.stage != Stage::Idle {
            self.progress.step(now);
            if !self.progress.running {
                match self.stage {
                    Stage::Out => {
                        self.stage = Stage::Back;
                        self.progress.to(0.0, 0.0, FAST_RESET);
                        self.progress.step(now);
                    }
                    _ => self.stage = Stage::Idle,
                }
            }
            moving = true;
        }
        if let Some(at) = self.blast_at {
            if now - at >= BLAST_DELAY_MS {
                self.blast_at = None;
                self.blast.to(1.0, 0.0, BLAST_EFFECT);
                self.blast.step(now);
            }
            moving = true;
        }
        moving | self.blast.step(now)
    }

    fn record(&mut self, scale: f32, images: Option<&Images>) {
        let c = &mut self.canvas;
        c.begin(scale);
        // The blast, behind the button.
        if let Some(images) = images {
            let p = self.blast.value;
            let radius = interpolate(p, &[0.0, 1.0], &[0.0, BLAST_RADIUS], Extrapolation::Extend);
            let (ox, oy) = (BLAST_SIZE as f64 / 2.0 + CIRCLE_R as f64, BLAST_SIZE as f64 / 2.0 - CIRCLE_R as f64);
            for (i, t) in self.transforms.iter_mut().enumerate() {
                let r = radius.powf(if i % 2 == 1 { 1.02 } else { 1.0 });
                let x_random = interpolate(seeded(i, self.base), &[0.0, 1.0], &[-0.5, 0.5], Extrapolation::Extend);
                let angle = (i as f64 / COUNT as f64) * std::f64::consts::TAU + x_random * std::f64::consts::TAU / COUNT as f64;
                *t = RsXform { scos: 1.0, ssin: 0.0, tx: (ox + angle.cos() * r) as f32, ty: (oy + angle.sin() * r) as f32 };
            }
            let opacity = interpolate(p, &[0.8, 1.0], &[1.0, 0.0], Extrapolation::Extend).powi(2).clamp(0.0, 1.0) as f32;
            if opacity > 0.0 {
                c.save();
                c.opacity(opacity);
                c.draw_atlas(images.image(0), &self.sprites, &self.transforms, None, false);
                c.restore();
            }
        }
        // The PressableScale: scaled about its centre.
        let k = self.press.scale() as f32;
        let mid = BLAST_SIZE / 2.0;
        c.save();
        c.translate(mid, mid);
        c.scale(k, k);
        c.draw_circle(0.0, 0.0, SIZE / 2.0, &Paint::fill(Color::view_hex(DARK)));
        let p = self.progress.value;
        let icon = |c: &mut Canvas, font: &Font, glyph: &str, opacity: f64, degrees: f64| {
            let opacity = opacity.clamp(0.0, 1.0) as f32;
            if opacity <= 0.0 {
                return;
            }
            // The Text (advance × line height) centred in the 48² iconContainer, rotated about it.
            c.save();
            c.rotate(degrees.to_radians() as f32);
            let w = font.advance_width(glyph);
            let lh = gfx::line_height(font);
            c.draw_text(glyph, -w / 2.0, gfx::baseline(font, -lh / 2.0), font, &Paint::fill(Color::view_hex(LIGHT)).with_opacity(opacity));
            c.restore();
        };
        if let Some(font) = self.plus.as_ref() {
            let opacity = interpolate(p, &[0.0, 0.5], &[1.0, 0.0], Extrapolation::Extend);
            icon(c, font, PLUS_CIRCLE, opacity, interpolate_clamp(p, &[0.0, 0.5], &[0.0, 45.0]));
        }
        if let Some(font) = self.check.as_ref() {
            let opacity = interpolate(p, &[0.0, 1.0], &[0.0, 1.0], Extrapolation::Extend);
            icon(c, font, CHECK, opacity, interpolate_clamp(p, &[0.0, 1.0], &[-45.0, 0.0]));
        }
        c.restore();
    }
}

impl Surface for ParticlesButton {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        if self.seed.is_none() {
            self.seed = Some(seed);
            // Math.random() at mount: baseRandomness's initial value, then each circle's opacity.
            self.random = gfx::Random::new(seed * 4096.0 + self.mount as f64);
            self.base = self.random.next();
            let mut opacities = [0.0; COUNT];
            for o in &mut opacities {
                *o = interpolate(self.random.next(), &[0.0, 1.0], &[0.1, 0.2], Extrapolation::Extend);
            }
            self.texture = Some(texture(&opacities));
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"animating\":{},\"progress\":{:.3},\"blast\":{:.3},\"pressed\":{}}}",
            self.animating(),
            self.progress.value,
            self.blast.value,
            self.press.is_pressed()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, .. } = *event else { return };
        let o = button_origin();
        let inside = (o..=o + SIZE).contains(&x) && (o..=o + SIZE).contains(&y);
        if let Some(PressEvent::Press(press)) = self.press.pointer(id, gfx::phase(phase), inside) {
            self.posted.extend(press.global_message().map(String::from));
            self.pressed = true;
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
        if self.images.is_none() {
            if let Some(t) = self.texture.as_ref() {
                let images = Images::upload(device, queue, &[t]);
                self.renderer.set_images(&images);
                self.images = Some(images);
            }
        }
        let moving = self.step(frame.now_ms);
        let images = self.images.take();
        self.record(frame.scale, images.as_ref());
        self.images = images;
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.press.is_animating() || self.pressed
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn sprite_i_holds_circle_i_plus_one_and_the_last_is_empty() {
        let mut o = [0.0; COUNT];
        for (k, v) in o.iter_mut().enumerate() {
            *v = 0.1 + 0.005 * k as f64;
        }
        let t = texture(&o);
        assert_eq!((t.width, t.height), (80, 4));
        // Cell 0's centre pixel: circle 1 at its opacity (full coverage).
        let at = |x: u32, y: u32| t.pixels[((y * 80 + x) * 4) as usize];
        assert_eq!(at(1, 1), (0.105f32 * 255.0).round() as u8);
        assert_eq!(at(17 * 4 + 1, 2), (0.19f32 * 255.0).round() as u8);
        assert!((76..80).all(|x| (0..4).all(|y| at(x, y) == 0)));
    }

    #[test]
    fn a_press_turns_the_plus_into_a_check_and_bursts_the_dots() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 240.0, height: 240.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(3.0)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("particles-button-rest");
        assert!(!animating);
        // The disc #1d1d1d at a point between the ring and the plus; transparent outside it.
        let near = |a: [u8; 4], b: u8| a[3] == 255 && a[..3].iter().all(|&c| (c as i32 - b as i32).abs() <= 2);
        assert!(rest.data.len() == 480 * 480 * 4);
        assert_eq!(rest.at(20, 20)[3], 0);
        // The plus-circle's light ring covers the disc's middle ring.
        let light = |img: &fixture::Pixels| img.count(|p| p[3] == 255 && p[0] > 150);
        assert!(light(&rest) > 1500, "{}", light(&rest));
        assert!(near(rest.at(240, 194), 0x1D) || near(rest.at(240, 194), 0xAF), "{:?}", rest.at(240, 194));

        let finger = |s: &mut Box<dyn Surface>, phase, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x: 120.0, y: 120.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        finger(&mut s, PointerPhase::Down, 5.0);
        finger(&mut s, PointerPhase::Up, 60.0);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        let mut ms = 0.0;
        let mut out = None;
        while ms < 3000.0 {
            ms += 16.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if (ms - 400.0).abs() < 8.0 {
                img.save("particles-button-400ms");
                out = Some(img);
            }
        }
        let out = out.unwrap();
        // At 400 ms the dots are out on a ring about the centre (radius < 96 + 4), faint white.
        let dots = out.count(|p| p[3] > 0 && p[3] < 80);
        assert!(dots > 100, "{dots}");
        // The check has replaced the plus: far fewer light pixels than the plus-circle's ring.
        let (back, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!animating, "{}", s.agent("{}").unwrap());
        // After the reset everything is as at rest, but the dots are gone (opacity 0 at p = 1).
        assert_eq!(light(&back), light(&rest));
    }
}
