//! A PIN lock screen. A glowing sweep-gradient ring holds a face: it opens its eyes at the first
//! digit, smiles at the right PIN (11111) and frowns at a wrong one, when the PIN area shakes.
//! The backspace key clears. The whole screen is this surface.
//!
//! - The layout follows the screen size and the safe-area insets.
//! - A key is pressed on touch-down and fires on a lift inside its own scaled bounds. A finger
//!   that slides off keeps the key pressed but presses nothing, and a cancel presses nothing.
//!   Each key takes its own finger.
//! - The press machine is the shared `pressto` crate's. Each press posts the selection haptic.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::Phase;
use reanimated::{interpolate, Easing, Extrapolation, Spring, Timing, GENTLE};
use skia::blur::{round_out, GraphiteBlur, GraphitePlan, IRect, Placed, GRAPHITE_FORMAT};
use skia::{point, Canvas, Cap, Color, Font, Join, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::mobile_input::{entry, module, Uniforms, BLURRED, COVERAGE, GROUP_0, SMP, U, UI};

static FA5_SOLID: &[u8] = include_bytes!("../fonts/fa5-solid-backspace-subset.ttf");

/// The PIN that makes the face smile.
const CORRECT_PIN: &str = "11111";
/// Keypad order: 1…9, an empty key, 0, backspace.
const KEYS: [Key; 12] = [
    Key::Digit(1),
    Key::Digit(2),
    Key::Digit(3),
    Key::Digit(4),
    Key::Digit(5),
    Key::Digit(6),
    Key::Digit(7),
    Key::Digit(8),
    Key::Digit(9),
    Key::Empty,
    Key::Digit(0),
    Key::Backspace,
];
/// Backspace glyph (Font Awesome 5).
const BACKSPACE: &str = "\u{F55A}";
/// Ring stroke width, pt.
const RING_STROKE: f32 = 25.0;
/// Mouth stroke width, and the face's scale.
const MOUTH_STROKE: f32 = 3.0;
const FACE_SCALE: f32 = 1.8;
/// Mouth control points, sad and happy: seven each.
const SAD: [[f32; 2]; 7] = [
    [31.2226, 8.20008],
    [27.3898, 4.95606],
    [22.4321, 3.0],
    [17.0176, 3.0],
    [11.6909, 3.0],
    [6.8063, 4.89309],
    [3.0, 8.04317],
];
const HAPPY: [[f32; 2]; 7] = [
    [31.2226, 2.99999],
    [27.3898, 6.24401],
    [22.4321, 8.20007],
    [17.0176, 8.20007],
    [11.6909, 8.20007],
    [6.8063, 6.30699],
    [3.0, 3.15691],
];
/// Face spring: critically damped, 400 ms.
const FACE_MS: f64 = 400.0;
const FACE_DAMPING_RATIO: f64 = 1.0;
/// PIN area text and margins, pt.
const LABEL: &str = "Enter PIN Mode";
const LABEL_SIZE: f32 = 15.0;
const PIN_MARGIN_TOP: f32 = 20.0;
const PIN_MARGIN_BOTTOM: f32 = 15.0;
const DOTS_MARGIN_TOP: f32 = 20.0;
const DOTS_MARGIN_BOTTOM: f32 = 25.0;
const DOT: f32 = 8.0;
const DOT_MARGIN: f32 = 12.0;
/// Digit and icon sizes, and the key corner radius, pt.
const DIGIT_SIZE: f32 = 30.0;
const ICON_SIZE: f32 = 24.0;
const KEY_RADIUS: f32 = 20.0;

/// A key's pressed values: scale 1 → 0.9, fill alpha 0 → 0.1.
const PRESS_SCALE: f64 = 0.9;
const PRESS_FILL: f64 = 0.1;

/// The surface (the whole screen). Inputs: the safe area's top and bottom insets.
pub fn surface() -> Box<dyn Surface> {
    Box::new(MobileInput::new())
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Key {
    Digit(u8),
    Empty,
    Backspace,
}

/// Rounds a view edge to the nearest device pixel, halves up, as Yoga does.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// Floors a text position to the pixel grid, as Yoga does.
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// A text's measured side, ceiled to the pixel grid: a 24 pt line can measure 24.333.
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

/// `x.toFixed(3)` as a number: the nearer thousandth, the larger on a tie.
fn to_fixed_3(x: f64) -> f64 {
    let k = x * 1000.0;
    let n = if k - k.floor() == 0.5 {
        k.ceil()
    } else {
        k.round()
    };
    n / 1000.0
}

/// A sequence of timed steps, each starting on the frame the previous one ended.
#[derive(Clone, Debug)]
struct Chain {
    timing: Timing,
    steps: Vec<(f64, f64, Easing)>,
    next: usize,
}

impl Chain {
    fn at(value: f64) -> Chain {
        Chain {
            timing: Timing::at(value),
            steps: Vec::new(),
            next: 0,
        }
    }

    /// Set to `from`, then `steps` (to, duration, easing) from the next frame.
    fn start(&mut self, from: f64, steps: Vec<(f64, f64, Easing)>) {
        self.timing.set(from);
        self.steps = steps;
        self.next = 0;
    }

    fn value(&self) -> f64 {
        self.timing.value
    }

    fn running(&self) -> bool {
        self.timing.running || self.next < self.steps.len()
    }

    fn step(&mut self, now: f64) -> bool {
        if self.timing.running && self.timing.step(now) {
            return true;
        }
        if self.next < self.steps.len() {
            let (to, ms, easing) = self.steps[self.next].clone();
            self.next += 1;
            self.timing.to(to, ms, easing);
            self.timing.step(now);
            return true;
        }
        false
    }
}

/// The shared press machine, with the key's fill and scale on top.
#[derive(Clone, Debug, Default)]
struct Press {
    pressable: pressto::Pressable,
}

impl Press {
    /// The finger holding it.
    fn finger(&self) -> Option<u32> {
        self.pressable.finger()
    }

    /// The press progress: 0 at rest, 1 pressed.
    fn progress(&self) -> f64 {
        self.pressable.progress()
    }

    /// interpolate(progress, [0, 1], [1, 0.9]).
    fn scale(&self) -> f32 {
        interpolate(
            self.progress(),
            &[0.0, 1.0],
            &[1.0, PRESS_SCALE],
            Extrapolation::Extend,
        ) as f32
    }

    /// The fill's alpha, rounded to three decimals and then to 8 bits.
    fn fill(&self) -> u8 {
        let a = to_fixed_3(interpolate(
            self.progress(),
            &[0.0, 1.0],
            &[0.0, PRESS_FILL],
            Extrapolation::Extend,
        ));
        (a.clamp(0.0, 1.0) * 255.0).round() as u8
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Layout {
    w: f32,
    h: f32,
    scale: f32,
    top: f32,
    bottom: f32,
    /// The label's box top and height; the dots' top.
    label_top: f32,
    label_h: f32,
    dots_top: f32,
    /// Each key's frame (x, y, w, h).
    keys: [[f32; 4]; 12],
}

impl Layout {
    fn new(w: f32, h: f32, scale: f32, top: f32, bottom: f32, label_h: f32) -> Layout {
        // The PIN area and keypad fill the bottom 60% of the inner area.
        let inner = h - top - bottom;
        let box_h = inner * 0.6;
        let box_top = top + inner - box_h;
        let label_top = box_top + PIN_MARGIN_TOP;
        let dots_top = label_top + label_h + DOTS_MARGIN_TOP;
        let grid_top = dots_top + DOT + DOTS_MARGIN_BOTTOM + PIN_MARGIN_BOTTOM;
        let grid_h = box_top + box_h - grid_top;
        // Keys are 30% × 20% of the grid, with gaps of 7/3% of the width.
        let (kw, kh, m) = (w * 0.3, grid_h * 0.2, w * (7.0 / 3.0) / 100.0);
        let line = kh + m;
        let keys = std::array::from_fn(|i| {
            let (col, row) = ((i % 3) as f32, (i / 3) as f32);
            let x = m + col * (kw + m);
            let y = grid_top + (line - kh) / 2.0 + row * line;
            let (x0, y0) = (grid(x, scale), grid(y, scale));
            [x0, y0, grid(x + kw, scale) - x0, grid(y + kh, scale) - y0]
        });
        Layout {
            w,
            h,
            scale,
            top,
            bottom,
            label_top: grid(label_top, scale),
            label_h,
            dots_top: grid(dots_top, scale),
            keys,
        }
    }

    /// The ring's centre and radius. The canvas is 2W × 0.9H; the ring sits a quarter in.
    fn ring(&self) -> (f32, f32, f32) {
        let (sw, sh) = (2.0 * self.w, 0.9 * self.h);
        (sw / 4.0, sh / 4.0 + 20.0, sh / 7.5)
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
    compose: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    sampler: wgpu::Sampler,
    coverage: wgpu::TextureView,
    ui: wgpu::TextureView,
    empty: wgpu::TextureView,
    /// The composite's bind group and the blurred view it reads (None: `empty`).
    bind: Option<(Option<wgpu::TextureView>, wgpu::BindGroup)>,
    /// The ring's coverage is drawn for this layout.
    ring_drawn: bool,
}

struct MobileInput {
    insets: (f32, f32),
    layout: Layout,
    label: Option<Font>,
    digit: Option<Font>,
    icon: Option<Font>,
    pin: Vec<u8>,
    /// The BlurMask's blur.
    blur: Chain,
    eyes: Spring,
    mouth: Spring,
    shake: Chain,
    dot_opacity: [Timing; 5],
    dot_scale: [Spring; 5],
    keys: [Press; 12],
    posted: Vec<String>,
    canvas: Canvas,
    ring: Canvas,
    renderer: Renderer,
    ring_renderer: Renderer,
    plan: GraphitePlan,
    gblur: GraphiteBlur,
    /// The σ (device px) the blurred image was made for, the image and its mapping.
    blurred_sigma: Option<f32>,
    blur_view: Option<wgpu::TextureView>,
    blur_low: [f32; 4],
    gpu: Option<Gpu>,
}

impl MobileInput {
    fn new() -> MobileInput {
        let mut blur = Chain::at(0.0);
        let inout = Easing::timing_default;
        blur.start(
            0.0,
            vec![
                (10.0, 4000.0, inout()),
                (45.0, 4000.0, inout()),
                (10.0, 4000.0, inout()),
            ],
        );
        MobileInput {
            insets: (0.0, 0.0),
            layout: Layout::default(),
            label: skia::match_ui_font(LABEL_SIZE, 400.0),
            digit: skia::match_ui_font(DIGIT_SIZE, 400.0),
            icon: Font::new(FA5_SOLID, ICON_SIZE).map(Font::with_ui_layout),
            pin: Vec::new(),
            blur,
            eyes: Spring::at(0.0),
            mouth: Spring::at(0.5),
            shake: Chain::at(0.0),
            dot_opacity: std::array::from_fn(|_| Timing::at(0.4)),
            dot_scale: std::array::from_fn(|_| Spring::at(1.0)),
            keys: std::array::from_fn(|_| Press::default()),
            posted: Vec::new(),
            canvas: Canvas::default(),
            ring: Canvas::default(),
            renderer: Renderer::default(),
            ring_renderer: Renderer::default(),
            plan: GraphitePlan::new([0, 0, 1, 1], [0, 0, 1, 1], 1.0).unwrap(),
            gblur: GraphiteBlur::default(),
            blurred_sigma: None,
            blur_view: None,
            blur_low: [0.0; 4],
            gpu: None,
        }
    }

    /// The key under (x, y) in its own transformed bounds (CGRectContainsPoint).
    fn inside(&self, k: usize, x: f32, y: f32) -> bool {
        let [kx, ky, kw, kh] = self.layout.keys[k];
        let s = self.keys[k].scale();
        let (cx, cy) = (kx + kw / 2.0, ky + kh / 2.0);
        let (lx, ly) = (cx + (x - cx) / s, cy + (y - cy) / s);
        lx >= kx && lx < kx + kw && ly >= ky && ly < ky + kh
    }

    /// Fires a press: its haptic, then the key's action.
    fn press(&mut self, k: usize, press: pressto::Press) {
        if let Some(m) = press.global_message() {
            self.posted.push(m.into());
        }
        match KEYS[k] {
            Key::Digit(d) => {
                self.pin.push(d);
                self.pin_changed();
            }
            Key::Backspace => self.reset(),
            Key::Empty => {}
        }
    }

    /// Clears the PIN and resets the face: neutral mouth, closed eyes.
    fn reset(&mut self) {
        self.pin.clear();
        self.pin_changed();
        gfx::spring_to(&mut self.mouth, 0.5, FACE_MS, FACE_DAMPING_RATIO);
        gfx::spring_to(&mut self.eyes, 0.0, FACE_MS, FACE_DAMPING_RATIO);
    }

    /// Updates the dots and the face for the PIN as it now is.
    fn pin_changed(&mut self) {
        let n = self.pin.len();
        for i in 0..5 {
            let active = n > i;
            self.dot_opacity[i].to(
                if active { 1.0 } else { 0.4 },
                300.0,
                Easing::timing_default(),
            );
            let v = if self.dot_scale[i].running {
                self.dot_scale[i].velocity
            } else {
                0.0
            };
            self.dot_scale[i].to(if active { 1.4 } else { 1.0 }, v, GENTLE);
        }
        if n > CORRECT_PIN.len() {
            return;
        }
        let pin: String = self.pin.iter().map(|d| char::from(b'0' + d)).collect();
        if pin == CORRECT_PIN {
            // correct: happy.
            gfx::spring_to(&mut self.mouth, 1.0, FACE_MS, FACE_DAMPING_RATIO);
        } else if n == CORRECT_PIN.len() {
            // wrong: shake, sad.
            let e = || Easing::bezier(0.36, 0.69, 0.49, 0.71);
            self.shake.start(
                0.0,
                vec![
                    (10.0, 100.0, e()),
                    (0.0, 100.0, e()),
                    (10.0, 100.0, e()),
                    (0.0, 100.0, e()),
                ],
            );
            gfx::spring_to(&mut self.mouth, 0.0, FACE_MS, FACE_DAMPING_RATIO);
        } else if n > 0 {
            // activate: openEyes.
            gfx::spring_to(&mut self.eyes, 1.0, FACE_MS, FACE_DAMPING_RATIO);
        }
    }

    /// Steps everything; true while something moves.
    fn step(&mut self, now: f64) -> bool {
        let mut moving = self.blur.step(now);
        moving |= self.shake.step(now);
        moving |= self.eyes.step(now);
        moving |= self.mouth.step(now);
        for t in self.dot_opacity.iter_mut() {
            moving |= t.step(now);
        }
        for s in self.dot_scale.iter_mut() {
            moving |= s.step(now);
        }
        for p in self.keys.iter_mut() {
            moving |= p.pressable.step(now);
        }
        moving
    }

    /// The mouth's points: happyMouth.interpolate(sadMouth, mouthProgress).
    fn mouth_points(&self) -> [[f32; 2]; 7] {
        let t = self.mouth.value as f32;
        std::array::from_fn(|i| {
            [
                HAPPY[i][0] * t + SAD[i][0] * (1.0 - t),
                HAPPY[i][1] * t + SAD[i][1] * (1.0 - t),
            ]
        })
    }

    /// The face, the PIN area and the keypad, into `self.canvas`.
    fn draw_ui(&mut self) {
        let l = self.layout;
        let s = l.scale;
        let pts = self.mouth_points();
        let c = &mut self.canvas;
        c.begin(s);
        // The face is scaled, then moved to its centre.
        let (sw, sh) = (2.0 * l.w, 0.9 * l.h);
        // The mouth's bounds, from its control points.
        let (minx, maxx) = pts
            .iter()
            .fold((f32::MAX, f32::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
        let bw = maxx - minx;
        let er = interpolate(
            self.eyes.value,
            &[0.0, 1.0],
            &[4.0, 6.0],
            Extrapolation::Extend,
        ) as f32;
        let (center_x, center_y) = (sw / 4.0 - bw / 2.0, sh / 4.0 + 30.0);
        let origin = (center_x + bw / 2.0 + er, center_y - 5.0);
        let m = skia::Matrix::translate(-origin.0, -origin.1)
            .then(skia::Matrix::translate(center_x, center_y))
            .then(skia::Matrix::scale(FACE_SCALE, FACE_SCALE))
            .then(skia::Matrix::translate(origin.0, origin.1));
        c.save();
        c.clip_rect(0.0, 0.0, l.w, 2.0 * l.w);
        c.concat(m);
        let white = Paint::fill(Color::WHITE);
        c.draw_circle(er / 2.0, -20.0, er, &white);
        c.draw_circle(bw + er / 2.0, -20.0, er, &white);
        let mut b = skia::path_builder();
        let p = |i: usize| point(pts[i][0], pts[i][1]);
        b.begin(p(0));
        b.cubic_bezier_to(p(1), p(2), p(3));
        b.cubic_bezier_to(p(4), p(5), p(6));
        b.end(false);
        let mouth = b.build();
        c.draw_path(
            &mouth,
            &Paint::stroke(Color::WHITE, MOUTH_STROKE).caps(Cap::Round, Join::Round),
        );
        c.restore();

        let (Some(label), Some(digit), Some(icon)) =
            (self.label.as_ref(), self.digit.as_ref(), self.icon.as_ref())
        else {
            return;
        };
        // PinArea, moved by the shake.
        c.save();
        c.translate(self.shake.value() as f32, 0.0);
        // The label is centred on the full width.
        let lw = label.advance_width(LABEL);
        c.draw_text(
            LABEL,
            (l.w - lw) / 2.0,
            gfx::baseline(label, l.label_top),
            label,
            &Paint::fill(Color::WHITE.alpha(0.9)),
        );
        let row = 5.0 * (DOT + 2.0 * DOT_MARGIN);
        for i in 0..5 {
            let cx =
                (l.w - row) / 2.0 + DOT_MARGIN + i as f32 * (DOT + 2.0 * DOT_MARGIN) + DOT / 2.0;
            let r = DOT / 2.0 * self.dot_scale[i].value as f32;
            let a = self.dot_opacity[i].value as f32;
            c.draw_circle(
                cx,
                l.dots_top + DOT / 2.0,
                r,
                &Paint::fill(Color::WHITE.alpha(a)),
            );
        }
        c.restore();

        // Each key: its fill and scale over its content.
        let (dh, ih) = (
            text_side(gfx::line_height(digit), s),
            text_side(gfx::line_height(icon), s),
        );
        for (k, key) in KEYS.iter().enumerate() {
            let [kx, ky, kw, kh] = l.keys[k];
            let sc = self.keys[k].scale();
            c.save();
            c.translate(kx + kw / 2.0, ky + kh / 2.0);
            c.scale(sc, sc);
            c.translate(-kw / 2.0, -kh / 2.0);
            let fill = self.keys[k].fill();
            if fill > 0 {
                c.draw_rrect(
                    0.0,
                    0.0,
                    kw,
                    kh,
                    KEY_RADIUS,
                    &Paint::fill(Color::rgba8(255, 255, 255, fill)),
                );
            }
            let (text, font, th) = match key {
                Key::Digit(d) => (char::from(b'0' + d).to_string(), digit, dh),
                Key::Backspace => (BACKSPACE.to_string(), icon, ih),
                Key::Empty => {
                    c.restore();
                    continue;
                }
            };
            let line = font.advance_width(&text);
            let tw = text_side(line, s);
            // Centre the line in the ceiled box.
            let x = text_grid((kw - tw) / 2.0, s) + (tw - line) / 2.0;
            c.draw_text(
                &text,
                x,
                gfx::baseline(font, text_grid((kh - th) / 2.0, s)),
                font,
                &white,
            );
            c.restore();
        }
    }

    fn place(&mut self, frame: &Frame) {
        let (top, bottom) = self.insets;
        let l = &self.layout;
        if l.w == frame.width
            && l.h == frame.height
            && l.scale == frame.scale
            && l.top == top
            && l.bottom == bottom
        {
            return;
        }
        let label_h = self
            .label
            .as_ref()
            .map_or(18.0, |f| text_side(gfx::line_height(f), frame.scale));
        self.layout = Layout::new(frame.width, frame.height, frame.scale, top, bottom, label_h);
        if let Some(g) = self.gpu.as_mut() {
            g.ring_drawn = false;
        }
        self.blurred_sigma = None;
    }
}

impl Surface for MobileInput {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let n = |i: usize| inputs.get(i).and_then(|v| v.as_number()).unwrap_or(0.0) as f32;
        self.insets = (n(0), n(1));
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let pin: String = self.pin.iter().map(|d| char::from(b'0' + d)).collect();
        let pressed: Vec<String> = (0..12)
            .filter(|&k| self.keys[k].finger().is_some())
            .map(|k| k.to_string())
            .collect();
        Some(format!(
            "{{\"pin\":\"{pin}\",\"eyes\":{:.4},\"mouth\":{:.4},\"blur\":{:.3},\"shake\":{:.3},\"pressed\":[{}],\"progress\":[{}]}}",
            self.eyes.value,
            self.mouth.value,
            self.blur.value(),
            self.shake.value(),
            pressed.join(","),
            self.keys.iter().map(|p| format!("{:.3}", p.progress())).collect::<Vec<_>>().join(",")
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        match gfx::phase(phase) {
            Phase::Down => {
                // Each key takes its own finger (pressto's buttons are not exclusive).
                if let Some(k) =
                    (0..12).find(|&k| self.keys[k].finger().is_none() && self.inside(k, x, y))
                {
                    self.keys[k].pressable.pointer_down(id, true);
                }
            }
            Phase::Move => {}
            phase @ (Phase::Up | Phase::Cancel) => {
                if let Some(k) = (0..12).find(|&k| self.keys[k].finger() == Some(id)) {
                    let inside = self.inside(k, x, y);
                    if let Some(pressto::PressEvent::Press(press)) =
                        self.keys[k].pressable.pointer(id, phase, inside)
                    {
                        self.press(k, press);
                    }
                }
            }
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
        let (pw, ph) = frame.pixels();
        let s = frame.scale;
        self.place(frame);
        if self
            .gpu
            .as_ref()
            .map(|g| (g.format, g.generation, g.pixels))
            != Some((format, frame.shader_generation, (pw, ph)))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, (pw, ph)));
            self.blurred_sigma = None;
        }
        let moving = self.step(frame.now_ms);
        let l = self.layout;
        let (cx, cy, r) = l.ring();
        let canvas_bottom = (2.0 * l.w * s).min(ph as f32);
        let gpu = self.gpu.as_mut().unwrap();
        if !gpu.ring_drawn {
            self.ring.begin(s);
            self.ring.clip_rect(0.0, 0.0, l.w, 2.0 * l.w);
            self.ring
                .draw_circle(cx, cy, r, &Paint::stroke(Color::WHITE, RING_STROKE));
            self.ring_renderer.draw(
                device,
                queue,
                encoder,
                &self.ring,
                &gpu.coverage,
                GRAPHITE_FORMAT,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
            gpu.ring_drawn = true;
        }
        let mut uniforms = Uniforms {
            canvas: [pw as f32, ph as f32, s, gfx::srgb_flag(format)],
            ring: [cx, cy, 0.0, canvas_bottom],
            low: [0.0; 4],
            output: [0.0; 4],
        };
        // σ is the blur in points; no blur at σ ≤ 0.
        let sigma = self.blur.value() as f32 * s;
        if sigma > 0.0 {
            if self.blurred_sigma != Some(sigma) {
                self.blur_view = None;
                let o = RING_STROKE / 2.0;
                let layer: IRect = round_out([
                    (cx - r - o) * s,
                    (cy - r - o) * s,
                    (cx + r + o) * s,
                    (cy + r + o) * s,
                ]);
                let desired = [0, 0, pw as i32, canvas_bottom as i32];
                if self.plan.update(layer, desired, sigma) {
                    let source = Placed {
                        view: &gpu.coverage,
                        origin: [0, 0],
                        size: [pw, ph],
                    };
                    let out = self.gblur.run(device, queue, encoder, source, &self.plan);
                    self.blur_view = Some(out.view.clone());
                    self.blur_low = low_mapping(&self.plan, out.origin, out.size);
                }
                self.blurred_sigma = Some(sigma);
            }
            if self.blur_view.is_some() {
                uniforms.low = self.blur_low;
                uniforms.output = self.plan.output.map(|v| v as f32);
                uniforms.ring[2] = 1.0;
            }
        }
        let blurred = if sigma > 0.0 {
            self.blur_view.clone()
        } else {
            None
        };
        if gpu.bind.as_ref().is_none_or(|(v, _)| *v != blurred) {
            let group = compose_bind(device, gpu, blurred.as_ref().unwrap_or(&gpu.empty));
            gpu.bind = Some((blurred, group));
        }
        self.draw_ui();
        let gpu = self.gpu.as_mut().unwrap();
        self.renderer.draw(
            device,
            queue,
            encoder,
            &self.canvas,
            &gpu.ui,
            GRAPHITE_FORMAT,
            pw,
            ph,
            wgpu::Color::TRANSPARENT,
        );
        queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
        if let Some((_, bind)) = gpu.bind.as_ref() {
            skia::render::fullscreen_pass(encoder, "mobile input", target, &gpu.compose, bind);
        }
        moving || self.blur.running() || self.keys.iter().any(|p| p.finger().is_some())
    }
}

/// uv = to_low(p) · (1 / size) − origin / size, as one scale and offset.
fn low_mapping(plan: &GraphitePlan, origin: [i32; 2], size: [u32; 2]) -> [f32; 4] {
    let src = plan.src_rect.map(|v| v as f32);
    let low = plan.low_bounds;
    let kx = (low[2] - low[0]) / (src[2] - src[0]);
    let ky = (low[3] - low[1]) / (src[3] - src[1]);
    let (sw, sh) = (size[0] as f32, size[1] as f32);
    [
        kx / sw,
        ky / sh,
        (low[0] - src[0] * kx - origin[0] as f32) / sw,
        (low[1] - src[1] * ky - origin[1] as f32) / sh,
    ]
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    pixels: (u32, u32),
) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let compose =
        skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, None);
    let target =
        |label| skia::render::sampled_target(device, label, GRAPHITE_FORMAT, pixels.0, pixels.1);
    Gpu {
        format,
        generation,
        pixels,
        compose,
        layout,
        uniforms: device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("mobile input"),
            size: Uniforms::SIZE as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        }),
        sampler: skia::render::linear_sampler(device),
        coverage: target("mobile input ring"),
        ui: target("mobile input ui"),
        empty: skia::render::sampled_target(device, "mobile input empty", GRAPHITE_FORMAT, 1, 1),
        bind: None,
        ring_drawn: false,
    }
}

fn compose_bind(device: &wgpu::Device, gpu: &Gpu, blurred: &wgpu::TextureView) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("mobile input"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: gpu.uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: COVERAGE.binding,
                resource: wgpu::BindingResource::TextureView(&gpu.coverage),
            },
            wgpu::BindGroupEntry {
                binding: BLURRED.binding,
                resource: wgpu::BindingResource::TextureView(blurred),
            },
            wgpu::BindGroupEntry {
                binding: UI.binding,
                resource: wgpu::BindingResource::TextureView(&gpu.ui),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
            },
        ],
    })
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn finger(s: &mut MobileInput, phase: PointerPhase, id: u32, x: f32, y: f32) {
        s.input(&InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms: 0.0,
        });
    }

    fn placed() -> MobileInput {
        let mut s = MobileInput::new();
        s.insets = (68.0, 34.0);
        let label_h = text_side(gfx::line_height(s.label.as_ref().unwrap()), 3.0);
        s.layout = Layout::new(420.0, 912.0, 3.0, 68.0, 34.0, label_h);
        s
    }

    fn tap(s: &mut MobileInput, k: usize) {
        let [x, y, w, h] = s.layout.keys[k];
        finger(s, PointerPhase::Down, 1, x + w / 2.0, y + h / 2.0);
        finger(s, PointerPhase::Up, 1, x + w / 2.0, y + h / 2.0);
    }

    #[test]
    fn the_layout_is_rns() {
        // Expected positions on the iPhone Air (420 × 912, insets 68 / 34).
        let s = placed();
        let l = s.layout;
        assert_eq!(l.label_h, 18.0);
        assert!(
            (l.label_top - 412.0).abs() < 1e-3 && (l.dots_top - 450.0).abs() < 1e-3,
            "{l:?}"
        );
        let rows = [503.0, 588.6667, 674.6667, 760.3333];
        let cols = [9.6667, 145.6667, 281.3333];
        for k in 0..12 {
            let [x, y, w, h] = l.keys[k];
            assert!(
                (x - cols[k % 3]).abs() < 1e-3 && (y - rows[k / 3]).abs() < 1e-3,
                "key {k}: {x} {y}"
            );
            assert!(
                (w - 126.0).abs() < 0.34 && (h - 76.0).abs() < 1e-3,
                "key {k}: {w} {h}"
            );
        }
        let (cx, cy, r) = l.ring();
        assert_eq!((cx, cy), (210.0, 225.2));
        assert!((r - 109.44).abs() < 1e-4);
    }

    #[test]
    fn to_fixed_is_jss() {
        assert_eq!(to_fixed_3(0.0999996), 0.1);
        assert_eq!(to_fixed_3(0.0123456), 0.012);
        assert_eq!(to_fixed_3(0.0625), 0.063);
        assert_eq!(to_fixed_3(1e-7), 0.0);
    }

    #[test]
    fn a_press_feeds_back_and_presses_on_a_lift_inside() {
        let mut s = placed();
        let [x, y, w, h] = s.layout.keys[4];
        finger(&mut s, PointerPhase::Down, 7, x + w / 2.0, y + h / 2.0);
        assert_eq!(s.keys[4].finger(), Some(7));
        s.step(0.0);
        s.step(125.0);
        let mid = s.keys[4].progress();
        // bezier(0.25, 0.1, 0.25, 1) at half time.
        assert!(
            (mid - Easing::bezier(0.25, 0.1, 0.25, 1.0).at(0.5)).abs() < 1e-9,
            "{mid}"
        );
        s.step(400.0);
        assert_eq!(s.keys[4].progress(), 1.0);
        assert_eq!(s.keys[4].fill(), 26);
        assert!((s.keys[4].scale() - 0.9).abs() < 1e-6);
        finger(&mut s, PointerPhase::Up, 7, x + w / 2.0, y + h / 2.0);
        assert_eq!(s.pin, vec![5]);
        assert_eq!(s.messages(), vec!["haptic:selection".to_string()]);
        // It eases back from where it is, over 250 ms.
        s.step(410.0);
        s.step(535.0);
        assert!(s.keys[4].progress() > 0.0 && s.keys[4].progress() < 0.5);
    }

    #[test]
    fn a_slide_off_keeps_the_feedback_and_presses_nothing() {
        let mut s = placed();
        let [x, y, w, h] = s.layout.keys[4];
        finger(&mut s, PointerPhase::Down, 1, x + w / 2.0, y + h / 2.0);
        finger(&mut s, PointerPhase::Move, 1, x + w + 40.0, y + h / 2.0);
        assert_eq!(s.keys[4].finger(), Some(1));
        finger(&mut s, PointerPhase::Up, 1, x + w + 40.0, y + h / 2.0);
        assert!(s.pin.is_empty());
        assert!(s.messages().is_empty());
        assert!(s.keys.iter().all(|p| p.finger().is_none()));
        // A lift inside the unscaled frame but outside the 0.9-scaled one presses nothing either.
        finger(&mut s, PointerPhase::Down, 2, x + w / 2.0, y + h / 2.0);
        s.step(0.0);
        s.step(300.0);
        finger(&mut s, PointerPhase::Up, 2, x + 2.0, y + h / 2.0);
        assert!(s.pin.is_empty());
        // A cancel presses nothing.
        finger(&mut s, PointerPhase::Down, 3, x + w / 2.0, y + h / 2.0);
        finger(&mut s, PointerPhase::Cancel, 3, x + w / 2.0, y + h / 2.0);
        assert!(s.pin.is_empty());
    }

    #[test]
    fn the_pin_drives_the_face_dots_and_shake() {
        let mut s = placed();
        tap(&mut s, 0);
        assert_eq!(s.eyes.target(), 1.0);
        assert_eq!(s.dot_opacity[0].target(), 1.0);
        assert_eq!(s.dot_scale[0].target(), 1.4);
        for _ in 0..4 {
            tap(&mut s, 0);
        }
        assert_eq!(s.pin, vec![1; 5]);
        assert_eq!(s.mouth.target(), 1.0);
        assert!(!s.shake.running());
        // Backspace: cleared, the face reset.
        tap(&mut s, 11);
        assert!(s.pin.is_empty());
        assert_eq!((s.mouth.target(), s.eyes.target()), (0.5, 0.0));
        assert_eq!(s.dot_opacity[4].target(), 0.4);
        // A wrong PIN: sad, and the shake 0 → 10 → 0 → 10 → 0 over 400 ms.
        for k in [1, 1, 1, 1, 1] {
            tap(&mut s, k);
        }
        assert_eq!(s.mouth.target(), 0.0);
        s.step(1000.0);
        s.step(1100.0);
        assert!((s.shake.value() - 10.0).abs() < 1e-9, "{}", s.shake.value());
        s.step(1150.0);
        s.step(1200.0);
        assert!(s.shake.value().abs() < 1e-9);
        // Each repeat starts at the frame the last one ended (1200, then 1400 here).
        s.step(1400.0);
        s.step(1500.0);
        s.step(1516.0);
        assert!(!s.shake.running() && s.shake.value() == 0.0);
        // The empty key: a haptic, nothing else.
        s.messages();
        tap(&mut s, 9);
        assert_eq!(s.pin.len(), 5);
        assert_eq!(s.messages().len(), 1);
    }

    #[test]
    fn the_blur_breathes_over_twelve_seconds() {
        let mut s = MobileInput::new();
        s.step(0.0);
        assert_eq!(s.blur.value(), 0.0);
        s.step(2000.0);
        assert!((s.blur.value() - 5.0).abs() < 1e-9);
        s.step(4000.0);
        s.step(6000.0);
        assert!((s.blur.value() - 27.5).abs() < 1e-9);
        s.step(8000.0);
        s.step(12000.0);
        assert_eq!(s.blur.value(), 10.0);
        assert!(!s.step(12016.0));
    }

    #[test]
    fn it_renders_the_screen() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
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
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(68.0), Value::Number(34.0)], None)
            .unwrap();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("mobile-input-start");
        assert!(animating);
        // The background (P3 #1C274D shown in sRGB), the ring's right edge (yellow → cyan) and the
        // eye's white.
        let bg = img.at(15, 1500);
        assert!(bg[2] > bg[0] && bg[3] == 255, "{bg:?}");
        let ring = img.at(3 * 319, 3 * 225);
        assert!(ring[1] > 200, "{ring:?}");
        let eye = img.at(3 * 185, 3 * 203);
        assert!(eye.iter().all(|&c| c > 240), "{eye:?}");
        // At rest after the 12 s sequence (every frame stepped, as the host's clock does).
        let mut s = MobileInput::new();
        s.bind(&[Value::Number(68.0), Value::Number(34.0)], None)
            .unwrap();
        let mut t = 0.0;
        while t < 12100.0 {
            s.step(t);
            t += 1000.0 / 60.0;
        }
        assert_eq!(s.blur.value(), 10.0);
        let (img, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        img.save("mobile-input-rest");
    }
}
