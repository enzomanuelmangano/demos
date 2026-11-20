//! A pill button reading "Check Transaction" that turns into a spinner and "Analyzing
//! Transaction", then a check and "Transaction Safe" (or a lock and "Transaction Unsafe" on
//! every other call), and back to idle after 1.5 s.
//!
//! - The pill's width follows its title and indicator every frame. The title crossfades on a
//!   critically damped spring (400 ms) that carries the pill from one title's width to the
//!   other, each title in its own colour.
//! - Edges snap to the device pixel grid only at rest. A moving edge snapped each frame would
//!   step.
//! - The indicator is a 20 pt spinner while loading, then a disc with a check or a lock. The
//!   spinner keeps the loading colour while it fades, and the outcome's disc and icon stay while
//!   they fade back to idle.
//! - A press posts the selection haptic. A press while loading is ignored. Otherwise the status
//!   turns to loading, then after 2 s to success or error, and 1.5 s after that back to idle.
//!   A press during the outcome starts again, and the earlier reset timer still fires.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use pressto::{PressEvent, Pressable};
use motion::{Easing, Timing};
use draw2d::{fit_box, path_from_svg, Canvas, Color, Font, Paint, Path, Rect, Renderer};

use crate::floating_modal::press_easing;
use crate::gfx;

const SIZE: f32 = 20.0;
const STROKE: f32 = 2.5;
const SVG_SIZE: f32 = 24.0;
/// One turn of the repeat: 4π in 800 ms.
const PERIOD_MS: f64 = 800.0;
/// Time spent loading before the outcome, ms.
const WAIT_MS: f64 = 2000.0;
/// Time the outcome shows before the reset to idle, ms.
const RESET_MS: f64 = 1500.0;
const SUCCESS: &str = "M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z";
const ERROR: &str = "M12 8c-1.062 0-2.073.211-3 .587v-3.587c0-1.654 1.346-3 3-3s3 1.346 3 3v1h2v-1c0-2.761-2.238-5-5-5-2.763 0-5 2.239-5 5v4.761c-1.827 1.466-3 3.714-3 6.239 0 4.418 3.582 8 8 8s8-3.582 8-8-3.582-8-8-8zm0 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2z";

/// The pill: height, paddingHorizontal, radius; the indicator's box and its margin at full.
const PILL_H: f64 = 40.0;
const PAD: f64 = 12.0;
const PILL_R: f32 = 16.0;
const GAP: f64 = 6.0;
/// Pill end sprite width, pt: past the continuous corner's reach (24.4 pt).
const CAP: f32 = 26.0;
/// The atlas's gutter (points) and its sprites' places: the 2 × CAP pill, then the arc, the
/// success and the error icon (SIZE squares).
const GUTTER: f32 = 1.0;
fn sprite_x(k: usize) -> f32 {
    match k {
        0 => GUTTER,
        _ => GUTTER + 2.0 * CAP + GUTTER + (k - 1) as f32 * (SIZE + GUTTER),
    }
}
/// Status colours (Display P3, 0…255), and each one lightened for the pill's background.
const ACTIVE: [u32; 4] = [0x47A1E6, 0x47A1E6, 0x5BC682, 0xCD5454];
const LIGHT: [u32; 4] = [0xE6F2FC, 0xE6F2FC, 0xDCF3E4, 0xF4DADA];
const TITLES: [&str; 4] = [
    "Check Transaction",
    "Analyzing Transaction",
    "Transaction Safe",
    "Transaction Unsafe",
];

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(LoadingButton::new())
}

struct LoadingButton {
    size: (f64, f64),
    scale: f64,
    /// The last frame's time.
    last_now: f64,
    status: u8,
    is_loading: bool,
    /// Calls so far: even ones succeed, odd ones fail.
    calls: u32,
    /// When the repeat started (at the first frame after the status turned loading).
    spin_from: Option<Option<f64>>,
    loading: Timing,
    icon: Timing,
    /// The indicator box's progress.
    progress: Timing,
    /// The background colour's CSS transition: from, to, start (None until stamped).
    background: ([f64; 3], [f64; 3], Option<f64>),
    /// The title's FadeIn.
    fade: Timing,
    /// The crossfade from `from_title` to the status's title: 0 → 1 on each change.
    blend: motion::Spring,
    from_title: u8,
    /// The last outcome (success 2 or error 3): the icon group's colour and icon as it fades.
    outcome: u8,
    /// Whether this frame is at rest (edges on the pixel grid, as Yoga's).
    rest: bool,
    /// The pill's Yoga frame (x, width), as last drawn.
    yoga: (f64, f64),
    /// The PressableScale (the shared pressto machine).
    press: Pressable,
    /// The pending timers: armed (None until the next frame stamps them), then due at.
    settle_at: Option<Option<f64>>,
    reset_at: Option<Option<f64>>,
    posted: Vec<String>,
    arc: Path,
    success: Path,
    error: Path,
    title: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
    /// Shapes drawn once into an atlas at the frame's scale, instead of tessellated each frame:
    /// the pill's continuous ends, the arc and the two icons. Each frame draws them as sprites.
    sprites: Option<(draw2d::Images, f32)>,
    sprite_canvas: Canvas,
    sprite_renderer: Renderer,
}

fn color(status: u8) -> Color {
    match status {
        2 => Color::hex(0x5BC682),
        3 => Color::hex(0xCD5454),
        _ => Color::hex(0x47A1E6),
    }
}

fn components(rgb: u32) -> [f64; 3] {
    [
        ((rgb >> 16) & 255) as f64,
        ((rgb >> 8) & 255) as f64,
        (rgb & 255) as f64,
    ]
}

/// Display P3 components (0…255) as the sRGB colour they make (`Color::view_hex`, unrounded).
fn p3(c: [f64; 3]) -> Color {
    let lin = |v: f64| {
        let v = v / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    let enc = |v: f64| {
        let v = v.clamp(0.0, 1.0);
        (if v <= 0.0031308 {
            12.92 * v
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        }) as f32
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    Color([
        enc(1.2249 * r - 0.2247 * g),
        enc(-0.0420 * r + 1.0419 * g),
        enc(-0.0197 * r - 0.0786 * g + 1.0979 * b),
        1.0,
    ])
}

impl LoadingButton {
    fn new() -> LoadingButton {
        let mut arc = draw2d::path_builder();
        draw2d::add_arc(
            &mut arc,
            STROKE / 2.0,
            STROKE / 2.0,
            SIZE - STROKE,
            SIZE - STROKE,
            0.0,
            90.0,
        );
        let light = components(LIGHT[0]);
        LoadingButton {
            size: (0.0, 0.0),
            scale: 3.0,
            last_now: 0.0,
            status: 0,
            is_loading: false,
            calls: 0,
            spin_from: None,
            loading: Timing::at(0.0),
            icon: Timing::at(0.0),
            progress: Timing::at(0.0),
            background: (light, light, None),
            fade: {
                let mut t = Timing::at(0.0);
                t.to(1.0, 300.0, Easing::timing_default());
                t
            },
            blend: motion::Spring::at(1.0),
            from_title: 0,
            outcome: 2,
            rest: true,
            yoga: (0.0, 0.0),
            press: Pressable::new(),
            settle_at: None,
            reset_at: None,
            posted: Vec::new(),
            arc: arc.build(),
            success: path_from_svg(SUCCESS).unwrap_or_default(),
            error: path_from_svg(ERROR).unwrap_or_default(),
            title: draw2d::match_ui_font(14.0, 700.0),
            canvas: Canvas::default(),
            renderer: Renderer::default(),
            sprites: None,
            sprite_canvas: Canvas::default(),
            sprite_renderer: Renderer::default(),
        }
    }

    /// Rounds to the pixel grid, at rest only.
    fn round(&self, v: f64) -> f64 {
        if !self.rest {
            return v;
        }
        (v * self.scale).round() / self.scale
    }

    fn floor(&self, v: f64) -> f64 {
        if !self.rest {
            return v;
        }
        (v * self.scale + 1e-4).floor() / self.scale
    }

    fn ceil(&self, v: f64) -> f64 {
        if !self.rest {
            return v;
        }
        (v * self.scale - 1e-4).ceil() / self.scale
    }

    /// Applies a status: the title's crossfade, the indicator's timings and the background.
    fn set_status(&mut self, status: u8) {
        if status == self.status {
            return;
        }
        let was = self.status;
        self.status = status;
        if TITLES[was as usize] != TITLES[status as usize] {
            // The title on screen now: the one the running crossfade is closer to.
            self.from_title = if self.blend.value >= 0.5 {
                was
            } else {
                self.from_title
            };
            self.blend = motion::Spring::at(0.0);
            gfx::spring_to(&mut self.blend, 1.0, 400.0, 1.0);
        }
        if status >= 2 {
            self.outcome = status;
        }
        let loading = if status == 1 { 1.0 } else { 0.0 };
        let icon = if status >= 2 { 1.0 } else { 0.0 };
        if self.loading.target() != loading {
            self.loading.to(loading, 200.0, Easing::timing_default());
        }
        if self.icon.target() != icon {
            self.icon.to(icon, 200.0, Easing::timing_default());
        }
        let progress = if status == 0 { 0.0 } else { 1.0 };
        if self.progress.target() != progress {
            self.progress.to(progress, 200.0, Easing::timing_default());
        }
        self.spin_from = if status == 1 { Some(None) } else { None };
        if LIGHT[was as usize] != LIGHT[status as usize] {
            let (from, to, at) = self.background;
            let now = self.background_now(from, to, at);
            self.background = (now, components(LIGHT[status as usize]), None);
        }
    }

    /// The background colour at the last frame (the transition's ease, 200 ms).
    fn background_now(&self, from: [f64; 3], to: [f64; 3], at: Option<f64>) -> [f64; 3] {
        let Some(at) = at else { return from };
        let t = ((self.last_now - at) / 200.0).clamp(0.0, 1.0);
        let e = press_easing().at(t);
        [0, 1, 2].map(|k| from[k] + (to[k] - from[k]) * e)
    }

    /// A press: ignored while loading; otherwise it starts loading and arms the settle timer.
    fn handle_press(&mut self) {
        if self.is_loading {
            return;
        }
        self.is_loading = true;
        self.set_status(1);
        self.settle_at = Some(None);
    }

    /// The pill's Yoga frame (x, width) for the current progress and title.
    fn layout(&self) -> (f64, f64) {
        let p = self.progress.value;
        let text = self.text_width();
        let w = PAD * 2.0 + (SIZE as f64 + GAP) * p + text;
        let x0 = self.round((self.size.0 - w) / 2.0);
        let x1 = self.round((self.size.0 + w) / 2.0);
        (x0, x1 - x0)
    }

    fn text_width(&self) -> f64 {
        let b = self.blend.value.clamp(0.0, 1.0);
        let to = self.title_width(self.status);
        if b >= 1.0 {
            return to;
        }
        let from = self.title_width(self.from_title);
        from + (to - from) * b
    }

    fn title_width(&self, status: u8) -> f64 {
        self.title.as_ref().map_or(0.0, |f| {
            self.ceil(f.advance_width(TITLES[status as usize]) as f64)
        })
    }

    /// The pill's top.
    fn top(&self) -> f64 {
        self.round((self.size.1 - PILL_H) / 2.0)
    }
}

impl Surface for LoadingButton {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"status\":{},\"loadingOpacity\":{},\"iconOpacity\":{},\"pill\":[{:.2},{:.2}],\"held\":{}}}",
            self.status, self.loading.value, self.icon.value, self.yoga.0, self.yoga.1, self.press.is_pressed()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        let (ox, ow) = self.yoga;
        let top = self.top();
        let inside =
            (ox..=ox + ow).contains(&(x as f64)) && (top..=top + PILL_H).contains(&(y as f64));
        if let Some(PressEvent::Press(press)) = self.press.pointer(id, gfx::phase(phase), inside) {
            self.posted.extend(press.global_message().map(String::from));
            self.handle_press();
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
        self.size = (frame.width as f64, frame.height as f64);
        self.scale = frame.scale as f64;
        let now = frame.now_ms;
        self.last_now = now;
        if self.background.2.is_none() && self.background.0 != self.background.1 {
            self.background.2 = Some(now);
        }
        // The settle and reset timers.
        let mut moving = false;
        for k in 0..2 {
            let (slot, delay) = if k == 0 {
                (&mut self.settle_at, WAIT_MS)
            } else {
                (&mut self.reset_at, RESET_MS)
            };
            if let Some(due) = slot {
                let due = *due.get_or_insert(now + delay);
                if now >= due {
                    *slot = None;
                    if k == 0 {
                        // Even calls succeed, odd ones fail; the reset timer is armed next.
                        let outcome = if self.calls % 2 == 0 { 2 } else { 3 };
                        self.calls += 1;
                        self.set_status(outcome);
                        self.is_loading = false;
                        self.reset_at = Some(None);
                    } else {
                        self.set_status(0);
                        self.is_loading = false;
                    }
                } else {
                    moving = true;
                }
            }
        }
        moving |= self.loading.step(now)
            | self.icon.step(now)
            | self.progress.step(now)
            | self.fade.step(now)
            | self.press.step(now)
            | self.blend.step(now);
        if let Some(at) = self.background.2 {
            moving |= now - at < 200.0;
        }
        self.rest = !moving && self.spin_from.is_none() && !self.press.is_animating();
        // Yoga's frame, every frame.
        let yoga = self.layout();
        self.yoga = yoga;
        let rotation = match &mut self.spin_from {
            Some(start) => {
                moving = true;
                let start = *start.get_or_insert(now);
                4.0 * std::f64::consts::PI * ((now - start).rem_euclid(PERIOD_MS) / PERIOD_MS)
            }
            None => 0.0,
        };

        let status = self.status;
        let (ox, ow) = yoga;
        let pill_w = yoga.1 as f32;
        let top = self.top() as f32;
        let p = self.progress.value;
        let boxw = self.round(PAD + SIZE as f64 * p) - PAD;
        let box_top = self.round((PILL_H - SIZE as f64 * p) / 2.0) as f32;
        let text_left = self.floor(PAD + (SIZE as f64 + GAP) * p) as f32;
        let (from, to, at) = self.background;
        let bg = p3(self.background_now(from, to, at));
        let fade = self.fade.value as f32;
        let press = self.press.scale() as f32;
        let title = TITLES[status as usize];
        let blend = self.blend.value.clamp(0.0, 1.0) as f32;
        let from_title = TITLES[self.from_title as usize];
        let from_color = p3(components(ACTIVE[self.from_title as usize]));
        let outcome = self.outcome;
        let text_top = self.title.as_ref().map(|f| {
            let m = f.metrics();
            let th = self.ceil((-m.ascent + m.descent + m.leading) as f64);
            let t = self.floor((PILL_H - th) / 2.0);
            self.ceil(t - m.ascent as f64) as f32
        });

        let sc = frame.scale;
        if self.sprites.as_ref().is_none_or(|(_, k)| *k != sc) {
            let aw = ((sprite_x(4) + GUTTER) * sc).ceil() as u32;
            let ah = ((PILL_H as f32 + 2.0 * GUTTER) * sc).ceil() as u32;
            let images = draw2d::Images::target(device, aw, ah);
            let a = &mut self.sprite_canvas;
            a.begin(sc);
            let white = Paint::fill(Color::WHITE);
            a.draw_continuous_rrect(
                sprite_x(0),
                GUTTER,
                2.0 * CAP,
                PILL_H as f32,
                PILL_R,
                &white,
            );
            a.save();
            a.translate(sprite_x(1), GUTTER);
            a.draw_path(
                &self.arc,
                &Paint::stroke(Color::WHITE, STROKE).caps(draw2d::Cap::Round, draw2d::Join::Miter),
            );
            a.restore();
            for (k, svg) in [(2, &self.success), (3, &self.error)] {
                // Fit the 24-unit icon into a centred square of 45% of the size.
                let icon_size = SIZE * 0.45;
                let offset = (SIZE - icon_size) / 2.0;
                a.save();
                a.translate(sprite_x(k), GUTTER);
                a.concat(fit_box(
                    Rect::new(0.0, 0.0, SVG_SIZE, SVG_SIZE),
                    Rect::new(offset, offset, icon_size, icon_size),
                ));
                a.draw_path(svg, &white);
                a.restore();
            }
            self.sprite_renderer.draw(
                device,
                queue,
                encoder,
                &self.sprite_canvas,
                &images.render_view(),
                wgpu::TextureFormat::Rgba8Unorm,
                aw,
                ah,
                wgpu::Color::TRANSPARENT,
            );
            self.renderer.set_images(&images);
            self.sprites = Some((images, sc));
        }
        let atlas = self.sprites.as_ref().unwrap().0.image(0);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::WHITE);
        c.save();
        // PressableScale: its animated frame, scaled about its centre.
        c.translate((ox + ow / 2.0) as f32, top + PILL_H as f32 / 2.0);
        c.scale(press, press);
        c.translate(-(ow / 2.0) as f32, -(PILL_H as f32) / 2.0);
        // The pill: its two continuous ends as sprites in the background colour, the middle an
        // analytic rect overlapping each by half a point.
        let px = |v: f32| v * sc;
        let k = 1.0 / sc;
        let ends = [
            draw2d::Rect::new(px(sprite_x(0)), px(GUTTER), px(CAP), px(PILL_H as f32)),
            draw2d::Rect::new(
                px(sprite_x(0) + CAP),
                px(GUTTER),
                px(CAP),
                px(PILL_H as f32),
            ),
        ];
        let at = [
            draw2d::RsXform {
                scos: k,
                ssin: 0.0,
                tx: 0.0,
                ty: 0.0,
            },
            draw2d::RsXform {
                scos: k,
                ssin: 0.0,
                tx: pill_w - CAP,
                ty: 0.0,
            },
        ];
        c.draw_atlas(atlas, &ends, &at, Some(&[bg, bg]), true);
        c.draw_rect(
            CAP - 0.5,
            0.0,
            (pill_w - 2.0 * CAP + 1.0).max(0.0),
            PILL_H as f32,
            &Paint::fill(bg),
        );
        // The indicator's box, clipping its 20 pt canvas.
        if boxw > 0.0 {
            c.save();
            c.translate(PAD as f32, box_top);
            c.clip_rect(0.0, 0.0, boxw as f32, boxw as f32);
            draw_indicator(
                c,
                atlas,
                sc,
                outcome,
                rotation,
                self.loading.value as f32,
                self.icon.value as f32,
            );
            c.restore();
        }
        if let (Some(font), Some(baseline)) = (self.title.as_ref(), text_top) {
            // The crossfade, inside the pill (the outgoing title is wider while the pill narrows).
            c.save();
            c.clip_rect(0.0, 0.0, pill_w, PILL_H as f32);
            if blend < 1.0 {
                c.draw_text(
                    from_title,
                    text_left,
                    baseline,
                    font,
                    &Paint::fill(from_color).with_opacity(fade * (1.0 - blend)),
                );
            }
            c.draw_text(
                title,
                text_left,
                baseline,
                font,
                &Paint::fill(p3(components(ACTIVE[status as usize]))).with_opacity(fade * blend),
            );
            c.restore();
        }
        c.restore();
        let (pw, ph) = frame.pixels();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            target,
            format,
            pw,
            ph,
            wgpu::Color::WHITE,
        );
        moving || self.press.is_animating()
    }
}

/// The ActivityIndicator's canvas, at its origin: the arc and the icons as the atlas's sprites
/// (white, tinted), the ring and the disc analytic circles.
#[allow(clippy::too_many_arguments)]
fn draw_indicator(
    canvas: &mut Canvas,
    atlas: draw2d::ImageRef,
    scale: f32,
    outcome: u8,
    rotation: f64,
    loading: f32,
    icon: f32,
) {
    // The spinner is only ever the loading colour; the disc and icon are the last outcome's, so
    // neither changes colour (nor the icon vanishes) while it fades.
    let c = color(1);
    let center = SIZE / 2.0;
    let radius = center - STROKE / 2.0;
    let sprite = |k: usize| {
        draw2d::Rect::new(
            sprite_x(k) * scale,
            GUTTER * scale,
            SIZE * scale,
            SIZE * scale,
        )
    };
    canvas.save();
    canvas.opacity(loading);
    // The arc turned about the centre: the sprite's (scale-sized) centre onto (10, 10).
    let (sin, cos) = (rotation as f32).sin_cos();
    let (sc, ss) = (cos / scale, sin / scale);
    let h = SIZE * scale / 2.0;
    let xf = draw2d::RsXform {
        scos: sc,
        ssin: ss,
        tx: center - (sc * h - ss * h),
        ty: center - (ss * h + sc * h),
    };
    canvas.draw_atlas(atlas, &[sprite(1)], &[xf], Some(&[c]), true);
    canvas.draw_circle(
        center,
        center,
        radius,
        &Paint::stroke(c, STROKE).with_opacity(0.08),
    );
    canvas.restore();
    canvas.save();
    canvas.opacity(icon);
    canvas.draw_circle(center, center, radius, &Paint::fill(color(outcome)));
    if outcome == 2 || outcome == 3 {
        let xf = draw2d::RsXform {
            scos: 1.0 / scale,
            ssin: 0.0,
            tx: 0.0,
            ty: 0.0,
        };
        canvas.draw_atlas(
            atlas,
            &[sprite(outcome as usize)],
            &[xf],
            Some(&[Color::WHITE]),
            true,
        );
    }
    canvas.restore();
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn a_press_loads_settles_and_resets() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let pointer = |phase, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x: 210.0,
            y: 456.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        let mut s = surface();
        let mut ms = 0.0;
        while ms < 500.0 {
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ms += 16.0;
        }
        let (idle, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&idle, "loading-button-idle", [255, 255, 255]);
        assert!(!moving);
        s.input(&pointer(PointerPhase::Down, ms));
        s.input(&pointer(PointerPhase::Up, ms + 60.0));
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        assert!(s.agent("{}").unwrap().contains("\"status\":1"));
        // A second press while loading does nothing.
        s.input(&pointer(PointerPhase::Down, ms + 100.0));
        s.input(&pointer(PointerPhase::Up, ms + 160.0));
        let t0 = ms;
        while ms < t0 + 2100.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"status\":2"), "{state}");
        let (safe, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        gfx::save_over(&safe, "loading-button-safe", [255, 255, 255]);
        while ms < t0 + 6000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let state = s.agent("{}").unwrap();
        assert!(state.contains("\"status\":0"), "{state}");
        let (back, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        assert!(!moving);
        assert_eq!(back.data, idle.data);
    }

    #[test]
    fn the_title_crossfades_and_the_indicator_grows_in_layout() {
        let mut s = LoadingButton::new();
        s.size = (420.0, 912.0);
        let (x0, w0) = s.layout();
        s.handle_press();
        // The crossfade starts from the old title's width; the indicator's box is still 0.
        let (_, w1) = s.layout();
        assert!((w1 - w0).abs() < 0.34, "{w1} {w0}");
        s.blend.value = 1.0;
        let (x2, w2) = s.layout();
        assert!(w2 > w0 && x2 < x0);
        s.progress.value = 0.5;
        let (_, w3) = s.layout();
        assert!((w3 - w2 - 13.0).abs() < 0.34, "{w3} {w2}");
    }
}
