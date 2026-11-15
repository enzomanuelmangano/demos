//! Verification Code Face (src/animations/verification-code-face: screens/verification-code,
//! components/verification-code/{index, animated-code-number}.tsx, icon-square/*): what RN's
//! layout animates or draws with Skia, in two canvases of this one surface (`part`).
//!
//! Part 0, the IconSquare: a 96² black view (borderRadius 24 continuous) under
//! `perspective(300) rotateY(θ) rotateX(−π/8)` about its centre, θ = interpolate(p, [0, 1],
//! [−π/8, π/8]). Its sublayers (InternalIcon, translate(interpolate(p, [−10, 10]), 10)) are laid
//! out by Yoga every frame from p: a centred column with gap g = interpolate(p, [7, 3]) holding
//! the eyebrow row (two 15 × 8 Skia canvases, gap g, marginBottom g), the eye row (two 20²
//! white circles, gap g, each holding a black view of side interpolate(p, [0.4, 0.8]) × 10,
//! radius half of it, translate(interpolate(p, [−4, 4]), 3)) and the mouth (a 25 × 20 Skia
//! canvas). Each node's position rounded to the device pixel relative to its parent, its size
//! from the unrounded absolute edges (Yoga). The square's layer is drawn flat at the screen's
//! scale and sampled through the 3D transform, as Core Animation does (aliased quad edges).
//!
//! Part 1, the code boxes (AnimatedCodeNumber's container, 80 % × 90 % of each flex-1 cell of
//! aspect ratio 0.95 in a row with paddingHorizontal 10): white, borderRadius 25 continuous,
//! boxShadow 0 10 10 rgba(0, 0, 0, 0.05) (RCTBoxShadow: σ 5, a circular rounded rect, outside
//! the view), border 2.1 (RCTBorderDrawing's ring with circular corners: the view does not clip;
//! invisible while transparent). The digits and the shake are the Contract's (Core Animation's
//! own 3D flips); this canvas sits under them inside the shaking row.
//!
//! Motion audit:
//!
//! | value | RN driver / config | here |
//! |---|---|---|
//! | p (codeProgressPercentage) | useDerivedValue(withTiming(code.length / 4, { duration 500 })), inOut(quad) | `Timing`, restarted only for a new target |
//! | θ, translateX, gap, eye side, eye translateX | interpolate(p, …) every frame | the same, laid out per frame |
//! | mouth | usePathInterpolation(withTiming(type), [Happy 0, Normal 1, Sad 2]): 300 ms inOut(quad), SkPath.interpolate (linear in the points) | `Timing` on the type, the control point lerped |
//! | eyebrows | usePathInterpolation(type) with no timing: a jump (useIconPaths passes `progress`, not the `animatedProgress` the mouth gets) | past RN (the owner: "when the eyebrows appear there's a jump"): the mouth's `Timing`, 300 ms inOut(quad), so brows and mouth move together |
//! | borderColor | withTiming(getColorByStatus(status)): highlighted (index == code.length) #5807a8 first, correct #3171f2, wrong #d62e2e, else transparent; 300 ms inOut(quad), each RGBA channel timed in gamma 2.2 space from the current colour as Reanimated wrote it (8-bit rgb), rgb rounded to 8 bits; Display P3 | four `Timing`s per box, the same rounding, `Color::view_hex` |
//! | borderWidth | withTiming(2.1): its initial style is the target, so 2.1 throughout | 2.1 |
//! | reset | setTimeout(1000) after a full code: status inProgress, code [], normal() | at 1000 ms on this surface's clock from the full code's frame |
//! | face | happy() on the correct code, sad() on a wrong one | the same |
//!
//! Inputs: part, code length, status (0 inProgress, 1 correct, 2 wrong), the check's time (a new
//! value is a new full code), the window's width and height (the absolute frame Yoga rounds in).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::easing::Easing;
use reanimated::{interpolate, Extrapolation, Timing};
use skia::{point, Canvas, Color, Matrix4, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::verification_code_face::{entry, module, Uniforms, FACE, GROUP_0, SMP, U};

/// index.tsx: correctCode 1111, so maxCodeLength 4.
const MAX: usize = 4;
/// IconSquare: 96 square, borderRadius 24 continuous; its wrapper's marginBottom 80.
const SQUARE: f32 = 96.0;
const SQUARE_RADIUS: f32 = 24.0;
const ICON_MARGIN: f64 = 80.0;
/// The face canvas reaches this far past the square on every side (the projection's reach).
pub const FACE_MARGIN: f32 = 12.0;
/// The boxes canvas reaches this far above the cells (the box shadow).
pub const BOXES_TOP: f32 = 8.0;
/// And this far below them.
pub const BOXES_BOTTOM: f32 = 32.0;
/// perspective 300, rotateX −π/8, rotateY ±π/8.
const PERSPECTIVE: f32 = 300.0;
const TILT: f64 = std::f64::consts::PI / 8.0;
/// useDerivedValue's withTiming duration.
const PROGRESS_MS: f64 = 500.0;
/// GAP_OUTPUT_RANGE.
const GAP: [f64; 2] = [7.0, 3.0];
/// EYEBROW_CANVAS_SIZE, EYEBROW_STROKE_WIDTH, MOUTH_CANVAS_SIZE, MOUTH_STROKE_WIDTH.
const BROW: (f64, f64) = (15.0, 8.0);
const BROW_STROKE: f32 = 1.2;
const MOUTH: (f64, f64) = (25.0, 20.0);
const MOUTH_STROKE: f32 = 2.0;
/// eyeContainer: 20², white, radius 10.
const EYE: f64 = 20.0;
/// VerificationCode: paddingHorizontal 10; codeContainer aspectRatio 0.95; the box 80 % × 90 %.
const ROW_PAD: f64 = 10.0;
const ASPECT: f64 = 0.95;
const BOX_W: f64 = 0.8;
const BOX_H: f64 = 0.9;
const BOX_RADIUS: f32 = 25.0;
const BORDER: f32 = 2.1;
/// boxShadow '0px 10px 10px rgba(0, 0, 0, 0.05)': RCTBoxShadow's σ is the blur / 2.
const SHADOW_Y: f32 = 10.0;
const SHADOW_SIGMA: f32 = 5.0;
const SHADOW_ALPHA: f32 = 0.05;
/// getColorByStatus.
const HIGHLIGHT: u32 = 0x5807a8;
const CORRECT: u32 = 0x3171f2;
const WRONG: u32 = 0xd62e2e;
/// resetCode's setTimeout.
const RESET_MS: f64 = 1000.0;
/// AnimationType.
const HAPPY: f64 = 0.0;
const NORMAL: f64 = 1.0;
const SAD: f64 = 2.0;
/// The square's layer texture.
const LAYER: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Face {
        part: 0,
        inputs: None,
        applied: None,
        window: (0.0, 0.0),
        reset_at: None,
        progress: Timing::at(0.0),
        mood: NORMAL,
        mouth: Timing::at(NORMAL),
        borders: std::array::from_fn(|i| channels(color_for(i, 0, 0)).map(Timing::at)),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        gpu: None,
    })
}

/// Yoga's `roundValueToPixelGrid` (half up; within 1e-4 of a pixel snaps to it).
fn grid(v: f64, s: f64) -> f64 {
    let x = v * s;
    let f = x - x.floor();
    let r = if f < 1e-4 {
        x.floor()
    } else if f > 1.0 - 1e-4 {
        x.ceil()
    } else {
        (x + 0.5).floor()
    };
    r / s
}

/// A node laid out at `rel` (to its parent, whose unrounded absolute origin is `abs`) of `size`:
/// its rounded position in the parent, its rounded size, its unrounded absolute origin.
fn node(
    abs: (f64, f64),
    rel: (f64, f64),
    size: (f64, f64),
    s: f64,
) -> ((f64, f64), (f64, f64), (f64, f64)) {
    let a = (abs.0 + rel.0, abs.1 + rel.1);
    (
        (grid(rel.0, s), grid(rel.1, s)),
        (
            grid(a.0 + size.0, s) - grid(a.0, s),
            grid(a.1 + size.1, s) - grid(a.1, s),
        ),
        a,
    )
}

/// The cell's side: flex 1 of the row's inner width, aspect ratio 0.95.
fn cell(width: f64) -> (f64, f64) {
    let w = (width - 2.0 * ROW_PAD) / MAX as f64;
    (w, w / ASPECT)
}

/// The unrounded absolute origins of the square and the code row: the content column (the
/// square's wrapper, its marginBottom 80, the row) centred in the window.
fn origins(width: f64, height: f64) -> ((f64, f64), (f64, f64)) {
    let (_, ch) = cell(width);
    let top = (height - (SQUARE as f64 + ICON_MARGIN + ch)) / 2.0;
    (
        ((width - SQUARE as f64) / 2.0, top),
        (0.0, top + SQUARE as f64 + ICON_MARGIN),
    )
}

/// getColorByStatus for box `i` (highlighted = i == code.length), as 0…1 RGBA.
fn color_for(i: usize, len: usize, status: u8) -> [f64; 4] {
    let hex = |c: u32| {
        [
            ((c >> 16) & 255) as f64 / 255.0,
            ((c >> 8) & 255) as f64 / 255.0,
            (c & 255) as f64 / 255.0,
            1.0,
        ]
    };
    if i == len {
        hex(HIGHLIGHT)
    } else if status == 1 {
        hex(CORRECT)
    } else if status == 2 {
        hex(WRONG)
    } else {
        [0.0; 4]
    }
}

/// toLinearSpace (gamma 2.2) of a 0…1 RGBA colour.
fn channels(c: [f64; 4]) -> [f64; 4] {
    [c[0].powf(2.2), c[1].powf(2.2), c[2].powf(2.2), c[3]]
}

/// What Reanimated writes for linear channels `c` (clampRGBA, toGammaSpace,
/// rgbaArrayToRGBAColor: rgb rounded to 8 bits), as 0…1 RGBA.
fn written(c: [f64; 4]) -> [f64; 4] {
    let byte = |v: f64| (v.clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0).round() / 255.0;
    [byte(c[0]), byte(c[1]), byte(c[2]), c[3].clamp(0.0, 1.0)]
}

/// The colour a view draws for Reanimated's linear channels (processColor: alpha to 8 bits).
fn view_color(c: [f64; 4]) -> Option<Color> {
    let w = written(c);
    let a = if w[3] < 0.001 { 0.0 } else { w[3] };
    let a8 = (a * 255.0).round();
    if a8 <= 0.0 {
        return None;
    }
    let b = |v: f64| (v * 255.0).round() as u32;
    Some(Color::view_hex((b(w[0]) << 16) | (b(w[1]) << 8) | b(w[2])).alpha((a8 / 255.0) as f32))
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    side: u32,
    layer: wgpu::TextureView,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

struct Face {
    part: u8,
    /// The latest inputs: code length, status, the check's time.
    inputs: Option<(usize, u8, f64)>,
    applied: Option<(usize, u8, f64)>,
    window: (f64, f64),
    /// When resetCode's timeout fires (this surface's clock).
    reset_at: Option<f64>,
    progress: Timing,
    /// The icon's AnimationType (the mouth and, past RN, the eyebrows time to it).
    mood: f64,
    mouth: Timing,
    /// Each box's borderColor, linear RGBA.
    borders: [[Timing; 4]; MAX],
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

impl Face {
    /// The state RN shows for `len` digits at `status`.
    fn show(&mut self, len: usize, status: u8) {
        let p = len as f64 / MAX as f64;
        if self.progress.target() != p {
            self.progress.to(p, PROGRESS_MS, Easing::timing_default());
        }
        for (i, border) in self.borders.iter_mut().enumerate() {
            let to = channels(color_for(i, len, status));
            if border.iter().zip(to).any(|(t, v)| t.target() != v) {
                // onStart: from the current colour as it was written (8-bit rgb).
                let now = channels(written([
                    border[0].value,
                    border[1].value,
                    border[2].value,
                    border[3].value,
                ]));
                for (k, t) in border.iter_mut().enumerate() {
                    t.set(now[k]);
                    t.to(to[k], 300.0, Easing::timing_default());
                }
            }
        }
    }

    fn set_mood(&mut self, mood: f64) {
        self.mood = mood;
        if self.mouth.target() != mood {
            self.mouth.to(mood, 300.0, Easing::timing_default());
        }
    }

    /// Applies new inputs and the reset's timeout at `now`.
    fn advance(&mut self, now: f64) {
        if self.inputs != self.applied {
            let first = self.applied.is_none();
            let (len, status, done) = self.inputs.unwrap_or((0, 0, 0.0));
            let new_check =
                status != 0 && self.applied.map_or(true, |a| a.2 != done || a.1 != status);
            self.applied = self.inputs;
            if first {
                // At mount every value is at its target (the initial style).
                self.progress = Timing::at(len.min(MAX) as f64 / MAX as f64);
                self.borders =
                    std::array::from_fn(|i| channels(color_for(i, len, status)).map(Timing::at));
            } else if new_check {
                self.reset_at = Some(now + RESET_MS);
                self.show(len, status);
                self.set_mood(if status == 1 { HAPPY } else { SAD });
            } else if status == 0 {
                self.reset_at = None;
                self.show(len, 0);
            }
        }
        if self.reset_at.is_some_and(|t| now >= t) {
            self.reset_at = None;
            self.show(0, 0);
            self.set_mood(NORMAL);
        }
    }

    /// The square's layer, flat, in its own points.
    fn draw_face(&mut self, s: f64) {
        let p = self.progress.value;
        let lin = |out: [f64; 2]| interpolate(p, &[0.0, 1.0], &out, Extrapolation::Extend);
        let g = lin(GAP);
        let (tx, ty) = (lin([-10.0, 10.0]), 10.0);
        let ew = lin([0.4, 0.8]) * 10.0;
        let (etx, ety) = (lin([-4.0, 4.0]), 3.0);
        let (abs, _) = origins(self.window.0, self.window.1);
        let sq = SQUARE as f64;
        // InternalIcon: a centred column, its width the eye row's.
        let (iw, ih) = (2.0 * EYE + g, BROW.1 + g + g + EYE + g + MOUTH.1);
        let (ip, _, ia) = node(abs, ((sq - iw) / 2.0, (sq - ih) / 2.0), (iw, ih), s);
        let (bp, _, ba) = node(
            ia,
            ((iw - (2.0 * BROW.0 + g)) / 2.0, 0.0),
            (2.0 * BROW.0 + g, BROW.1),
            s,
        );
        let (ep, _, ea) = node(ia, (0.0, BROW.1 + 2.0 * g), (2.0 * EYE + g, EYE), s);
        let (mp, ms, _) = node(ia, ((iw - MOUTH.0) / 2.0, BROW.1 + 3.0 * g + EYE), MOUTH, s);

        let c = &mut self.canvas;
        c.begin(s as f32);
        c.draw_continuous_rrect(
            0.0,
            0.0,
            SQUARE,
            SQUARE,
            SQUARE_RADIUS,
            &Paint::fill(Color::BLACK),
        );
        c.save();
        c.translate((ip.0 + tx) as f32, (ip.1 + ty) as f32);
        let white = Color::WHITE;
        // The eyebrows: createPath's quad, its control point at y = type × h / 2 (Happy is
        // 'Sad', Sad is 'Happy').
        for k in 0..2 {
            let (op, os, _) = node(ba, (k as f64 * (BROW.0 + g), 0.0), BROW, s);
            let (x, y) = ((bp.0 + op.0) as f32, (bp.1 + op.1) as f32);
            let (w, h) = (os.0 as f32, os.1 as f32);
            // Past RN: on the mouth's timing (RN reads the raw type here and jumps).
            let qy = (self.mouth.value * BROW.1 / 2.0) as f32;
            c.save();
            c.clip_rect(x, y, w, h);
            c.translate(x, y);
            c.draw_with(&Paint::stroke(white, BROW_STROKE), |b| {
                b.begin(point(0.0, BROW.1 as f32 / 2.0));
                b.quadratic_bezier_to(
                    point(BROW.0 as f32 / 2.0, qy),
                    point(BROW.0 as f32, BROW.1 as f32 / 2.0),
                );
                b.end(false);
            });
            c.restore();
        }
        // The eyes.
        for k in 0..2 {
            let (op, os, oa) = node(ea, (k as f64 * (EYE + g), 0.0), (EYE, EYE), s);
            let (x, y) = (ep.0 + op.0, ep.1 + op.1);
            c.draw_circle(
                (x + os.0 / 2.0) as f32,
                (y + os.1 / 2.0) as f32,
                (os.0 / 2.0) as f32,
                &Paint::fill(white),
            );
            let (pp, ps, _) = node(oa, ((EYE - ew) / 2.0, (EYE - ew) / 2.0), (ew, ew), s);
            let (cx, cy) = (x + pp.0 + etx + ps.0 / 2.0, y + pp.1 + ety + ps.1 / 2.0);
            c.draw_circle(
                cx as f32,
                cy as f32,
                (ps.0 / 2.0) as f32,
                &Paint::fill(Color::BLACK),
            );
        }
        // The mouth: Happy's control point at h, Normal's at h / 2, Sad's at 0.
        let m = self.mouth.value.clamp(HAPPY, SAD);
        let qy = (MOUTH.1 - m * MOUTH.1 / 2.0) as f32;
        let (x, y) = (mp.0 as f32, mp.1 as f32);
        c.save();
        c.clip_rect(x, y, ms.0 as f32, ms.1 as f32);
        c.translate(x, y);
        c.draw_with(&Paint::stroke(white, MOUTH_STROKE), |b| {
            b.begin(point(0.0, MOUTH.1 as f32 / 2.0));
            b.quadratic_bezier_to(
                point(MOUTH.0 as f32 / 2.0, qy),
                point(MOUTH.0 as f32, MOUTH.1 as f32 / 2.0),
            );
            b.end(false);
        });
        c.restore();
        c.restore();
    }

    /// Canvas points → the square's points: the canvas holds the square at (margin, margin).
    fn inverse(&self) -> [[f32; 4]; 3] {
        let p = self.progress.value;
        let theta = interpolate(p, &[0.0, 1.0], &[-TILT, TILT], Extrapolation::Extend) as f32;
        let c = SQUARE / 2.0;
        let m = Matrix4::translate(FACE_MARGIN + c, FACE_MARGIN + c, 0.0)
            .multiply(Matrix4::perspective(PERSPECTIVE))
            .multiply(Matrix4::rotate_y(theta))
            .multiply(Matrix4::rotate_x(-TILT as f32))
            .multiply(Matrix4::translate(-c, -c, 0.0));
        m.to_matrix3()
            .invert()
            .unwrap_or(skia::Matrix3([0.0; 9]))
            .rows()
    }

    fn draw_boxes(&mut self, s: f64) {
        let (_, row) = origins(self.window.0, self.window.1);
        let (cw, ch) = cell(self.window.0);
        let c = &mut self.canvas;
        c.begin(s as f32);
        c.translate(0.0, BOXES_TOP);
        for i in 0..MAX {
            // The row (codeContainer, then VerificationCode's container) at the row's origin.
            let (cp, _, ca) = node(row, (ROW_PAD + i as f64 * cw, 0.0), (cw, ch), s);
            let (bp, bs, _) = node(
                ca,
                ((cw - BOX_W * cw) / 2.0, (ch - BOX_H * ch) / 2.0),
                (BOX_W * cw, BOX_H * ch),
                s,
            );
            let (x, y, w, h) = (
                (cp.0 + bp.0) as f32,
                (cp.1 + bp.1) as f32,
                bs.0 as f32,
                bs.1 as f32,
            );
            c.save();
            c.clip_with(|b| {
                skia::add_rect(b, x - 40.0, y - 40.0, w + 80.0, h + 80.0);
                skia::add_rrect_hole(b, x, y, w, h, BOX_RADIUS);
            });
            c.draw_rrect_shadow(
                x,
                y + SHADOW_Y,
                w,
                h,
                BOX_RADIUS,
                SHADOW_SIGMA,
                Color::BLACK.alpha(SHADOW_ALPHA),
            );
            c.restore();
            c.draw_continuous_rrect(x, y, w, h, BOX_RADIUS, &Paint::fill(Color::WHITE));
            let b = &self.borders[i];
            if let Some(color) = view_color([b[0].value, b[1].value, b[2].value, b[3].value]) {
                c.draw_path(
                    &skia::border_ring_path(x, y, w, h, BOX_RADIUS, BORDER),
                    &Paint::fill(color),
                );
            }
        }
    }

    fn build(&self, device: &wgpu::Device, format: wgpu::TextureFormat, frame: &Frame) -> Gpu {
        let side = (SQUARE * frame.scale).ceil() as u32;
        let layer =
            skia::render::sampled_target(device, "verification face layer", LAYER, side, side);
        let shader = device.create_shader_module(module());
        let layout = device.create_bind_group_layout(&GROUP_0);
        let compose = skia::render::fullscreen_pipeline(
            device,
            &shader,
            &layout,
            entry::COMPOSE,
            format,
            None,
        );
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("verification face"),
            size: Uniforms::SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let sampler = skia::render::linear_sampler(device);
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("verification face"),
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: U.binding,
                    resource: uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: FACE.binding,
                    resource: wgpu::BindingResource::TextureView(&layer),
                },
                wgpu::BindGroupEntry {
                    binding: SMP.binding,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        Gpu {
            format,
            generation: frame.shader_generation,
            side,
            layer,
            compose,
            uniforms,
            bind,
        }
    }
}

impl Surface for Face {
    fn bind(&mut self, values: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| match values.get(i) {
            Some(Value::Number(v)) => *v,
            _ => 0.0,
        };
        self.part = n(0) as u8;
        self.inputs = Some(((n(1).max(0.0) as usize).min(MAX), n(2) as u8, n(3)));
        self.window = (n(4), n(5));
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let b = &self.borders[0];
        let c = written([b[0].value, b[1].value, b[2].value, b[3].value]);
        Some(format!(
            "{{\"progress\":{:.3},\"mood\":{},\"mouth\":{:.3},\"resetPending\":{},\"box0\":[{:.0},{:.0},{:.0},{:.3}]}}",
            self.progress.value,
            self.mood,
            self.mouth.value,
            self.reset_at.is_some(),
            c[0] * 255.0,
            c[1] * 255.0,
            c[2] * 255.0,
            c[3]
        ))
    }

    fn input(&mut self, _event: &InputEvent) {}

    fn render(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        let now = frame.now_ms;
        self.advance(now);
        let mut moving = self.progress.step(now);
        moving |= self.mouth.step(now);
        for border in self.borders.iter_mut() {
            for t in border.iter_mut() {
                moving |= t.step(now);
            }
        }
        let s = frame.scale as f64;
        let (pw, ph) = frame.pixels();
        if self.part == 0 {
            if self.gpu.as_ref().map(|g| (g.format, g.generation, g.side))
                != Some((
                    format,
                    frame.shader_generation,
                    (SQUARE * frame.scale).ceil() as u32,
                ))
            {
                self.gpu = Some(self.build(device, format, frame));
            }
            self.draw_face(s);
            let h = self.inverse();
            let gpu = self.gpu.as_ref().unwrap();
            self.renderer.draw(
                device,
                queue,
                encoder,
                &self.canvas,
                &gpu.layer,
                LAYER,
                gpu.side,
                gpu.side,
                wgpu::Color::TRANSPARENT,
            );
            let uniforms = Uniforms {
                h0: h[0],
                h1: h[1],
                h2: h[2],
                canvas: [pw as f32, ph as f32, frame.scale, gfx::srgb_flag(format)],
                layer: [SQUARE, gpu.side as f32, 0.0, 0.0],
            };
            queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
            skia::render::fullscreen_pass(
                encoder,
                "verification face",
                target,
                &gpu.compose,
                &gpu.bind,
            );
        } else {
            self.draw_boxes(s);
            self.renderer.draw(
                device,
                queue,
                encoder,
                &self.canvas,
                target,
                format,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
        }
        moving || self.reset_at.is_some()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    const W: f64 = 420.0;
    const H: f64 = 912.0;

    fn frame(part: u8, now_ms: f64) -> Frame {
        let (cw, ch) = cell(W);
        let _ = cw;
        let (w, h) = if part == 0 {
            (SQUARE + 2.0 * FACE_MARGIN, SQUARE + 2.0 * FACE_MARGIN)
        } else {
            (W as f32, ch as f32 + BOXES_TOP + BOXES_BOTTOM)
        };
        Frame {
            width: w,
            height: h,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        }
    }

    fn inputs(part: u8, len: usize, status: u8, done: f64) -> Vec<Value> {
        [part as f64, len as f64, status as f64, done, W, H]
            .map(Value::Number)
            .to_vec()
    }

    #[test]
    fn yoga_rounds_the_face_and_the_boxes() {
        // At rest with no digits: gap 7, the icon 47 × 69, centred in 96 (24.5 → 24.667).
        let (abs, row) = origins(W, H);
        let (ip, is, _) = node(
            abs,
            ((96.0 - 47.0) / 2.0, (96.0 - 69.0) / 2.0),
            (47.0, 69.0),
            3.0,
        );
        assert!(
            (ip.0 - 74.0 / 3.0).abs() < 1e-9 && (ip.1 - 41.0 / 3.0).abs() < 1e-9,
            "{ip:?}"
        );
        assert!((is.0 - 47.0).abs() < 1e-9 && (is.1 - 69.0).abs() < 1e-9);
        // The cells: (420 − 20) / 4 = 100 wide, 105.263 tall; the box 80 × 94.737 at (10, 5.263 → 5.333).
        let (cw, ch) = cell(W);
        assert!((cw - 100.0).abs() < 1e-9);
        let (cp, _, ca) = node(row, (ROW_PAD, 0.0), (cw, ch), 3.0);
        let (bp, bs, _) = node(ca, (10.0, ch * 0.05), (80.0, ch * 0.9), 3.0);
        assert!(
            (cp.0 - 10.0).abs() < 1e-9 && (bp.0 - 10.0).abs() < 1e-9 && (bs.0 - 80.0).abs() < 1e-9
        );
        assert!((bp.1 - 16.0 / 3.0).abs() < 1e-9, "{bp:?}");
    }

    #[test]
    fn colours_time_in_gamma_space_and_the_reset_returns_the_face() {
        let mut s = surface();
        s.bind(&inputs(1, 0, 0, 0.0), None).unwrap();
        let gpu = fixture::device().ok();
        let step = |s: &mut dyn Surface, at: f64| {
            if let Some(gpu) = gpu.as_ref() {
                fixture::render(gpu, s, &frame(1, at)).unwrap();
            }
        };
        if gpu.is_none() {
            return eprintln!("no GPU; skipped");
        }
        step(s.as_mut(), 0.0);
        assert!(s.agent("").unwrap().contains("\"box0\":[88,7,168,1.000]"));
        // Four ones: correct at 100 ms.
        s.bind(&inputs(1, 4, 1, 100.0), None).unwrap();
        let mut t = 16.0;
        while t < 700.0 {
            step(s.as_mut(), t);
            t += 1000.0 / 60.0;
        }
        let a = s.agent("").unwrap();
        assert!(
            a.contains("\"box0\":[49,113,242,1.000]")
                && a.contains("\"mood\":0")
                && a.contains("\"progress\":1.000"),
            "{a}"
        );
        while t < 2000.0 {
            step(s.as_mut(), t);
            t += 1000.0 / 60.0;
        }
        let a = s.agent("").unwrap();
        assert!(
            a.contains("\"box0\":[88,7,168,1.000]")
                && a.contains("\"mood\":1")
                && a.contains("\"progress\":0.000"),
            "{a}"
        );
        assert!(a.contains("\"resetPending\":false"), "{a}");
    }

    #[test]
    fn the_square_tilts_and_the_face_is_drawn() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let mut s = surface();
        s.bind(&inputs(0, 0, 0, 0.0), None).unwrap();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0, 0.0)).unwrap();
        gfx::save_over(&img, "verification-code-face-square", [255, 255, 255]);
        assert!(!animating);
        let m = (3.0 * FACE_MARGIN) as u32;
        // The centre is black (between the eyes and the mouth: the square's ink).
        let centre = img.at(3 * 60, 3 * 58);
        assert!(centre[3] == 255, "{centre:?}");
        // Outside the projected square: transparent.
        assert_eq!(img.at(2, 2)[3], 0);
        // The face's white is drawn (an eye), somewhere in the middle band.
        let mut white = 0;
        for y in m..(m + 288) {
            for x in m..(m + 288) {
                let p = img.at(x, y);
                if p[0] > 250 && p[3] == 255 {
                    white += 1;
                }
            }
        }
        assert!(white > 1500, "{white}");
        // rotateY(−π/8) at p 0: the right edge comes toward the viewer, so the right half is wider.
        let row = 3 * 60;
        let first = (0..img.width).find(|&x| img.at(x, row)[3] > 0).unwrap();
        let last = (0..img.width)
            .rev()
            .find(|&x| img.at(x, row)[3] > 0)
            .unwrap();
        let mid = 3 * 60;
        assert!(last - mid > mid - first, "{first} {last}");

        let mut b = surface();
        b.bind(&inputs(1, 0, 0, 0.0), None).unwrap();
        let (img, _) = fixture::render(&gpu, b.as_mut(), &frame(1, 0.0)).unwrap();
        gfx::save_over(&img, "verification-code-face-boxes", [255, 255, 255]);
        // Box 0's border (#5807a8 in P3) at its left edge, mid height; box 1 has none.
        let y = (3.0 * (BOXES_TOP as f64 + 52.0)) as u32;
        let p = img.at(3 * 20 + 3, y);
        assert!(p[2] > 150 && p[0] < 140 && p[1] < 60, "{p:?}");
        let q = img.at(3 * 120 + 3, y);
        assert!(q[0] == 255 && q[1] == 255 && q[2] == 255, "{q:?}");
    }

    #[test]
    fn the_eyebrows_move_with_the_mouth() {
        // Past RN: the brows' control point is the mouth's timed value, never the bare type.
        let src = include_str!("verification_code_face.rs");
        let brows = src.split("// The eyebrows:").nth(1).unwrap().split("// The mouth:").next().unwrap();
        assert!(brows.contains("self.mouth.value * BROW.1"));
        assert!(!brows.contains("self.mood *"));
    }
}
