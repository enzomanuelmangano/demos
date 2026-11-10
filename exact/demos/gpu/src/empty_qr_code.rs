//! Empty QR Code (src/animations/empty-qrcode: index.tsx, components/qrcode-share/{index.tsx,
//! hooks/use-active-qrcode.ts, hooks/use-active-letter.ts}): a 150 × 150 card, tilted −10°,
//! that cycles the letters of "YOURLOGO" on radial gradients every 650 ms; a tap anywhere on its
//! row turns it straight, grows it to 1.4 and fades the letter away to show a white QR code of
//! "https://reactiive.io/demos" on #111. Another tap turns it back.
//!
//! Layout (Yoga's numbers, edges on the device-pixel grid): the container (#fbfbfb, flex 1,
//! justifyContent center, alignItems stretch) holds the PressableScale (pressto's BaseButton:
//! the window's width × the card's 150, vertically centred); in it QRCodeShare's Animated.View
//! (150 × 150, alignSelf center, borderRadius 50 continuous, overflow hidden) carries
//! `[scale, rotate]` about its centre. Inside it:
//! - the View (flex 1, #111, centring) and its QRCode (react-native-qrcode-skia 0.3.1: a
//!   90 × 90 Canvas, size 150 − 2 × 30, at (30, 30)) whose Path is `qr::rounded_path` of
//!   node-qrcode's ECL H symbol, filled white;
//! - over it (absoluteFill, zIndex 1) the logo View at its opacity, holding the letter Canvas
//!   (flex 1: 150 × 150): Rect 150 × 150 with RadialGradient c (75, 75), r 75 of the active
//!   colour pair; Text of the active letter, white, SF-Pro-Rounded-Bold.otf at 110 (glyph paths
//!   at this size), at x = −font.measureText(letter).width / 2 + 75, y = 110 / 3 + 75.
//! The two Skia canvases are drawn into their own layers (only when they change), and
//! gpu/shaders/empty_qr_code.wgsl composites the card as Core Animation does: the layers
//! sampled bilinearly through the inverse of the card's transform, the continuous rounded clip
//! drawn by the skia package under that transform.
//!
//! The press (RN with RNGH 3.3 and pressto 0.7): pressto hands BaseButton `onBegan`,
//! `onActivated`, `onEnded`, `onFailed` and `onCancelled`, which RNGH 3's (v3) BaseButton does
//! not read (its callbacks are onBegin / onActivate / onFinalize), so pressto's `active` never
//! turns true: the PressableScale never scales (progress stays 0). Its `onPress` is BaseButton's,
//! called from onFinalize when the native gesture was not cancelled or failed, whatever
//! `pointerInside` says: the RawButton's shouldCancelWhenOutside is false, so UIControl's
//! TouchUpOutside ends the gesture too. So a touch that starts inside the button's frame (UIKit's
//! hit test: the BaseButton's bounds, not the card's transformed overflow) toggles at its lift,
//! inside or outside; a cancelled touch (the screen's close pan taking it) does nothing.
//! onPress also runs the app's PressablesConfig onPress: Haptics.selectionAsync, posted here as
//! `haptic:selection`.
//!
//! The letter: useActiveLetterAnimation's `setInterval(…, 650)` from the mount. RN's iOS timers
//! (RCTTiming) are checked once per display frame: a repeating timer fires on the first frame
//! at or after its target and is rescheduled `interval` from that moment, so each tick lands on
//! the first frame ≥ the previous tick's frame + 650 ms (the drift of a frame per tick is
//! kept). The index advances by one modulo min(8, 8) per tick.
//!
//! Motion audit (every animated value):
//!
//! | value | RN driver / config | Exact |
//! |---|---|---|
//! | card scale | useAnimatedStyle withSpring(show ? 1.4 : 1), the default (900, 120, 4: ζ = 1); at mount the style updater's first value is the target (no motion) | `Spring::retarget(GENTLE)` from where it is; a velocity pointing away from the new target dropped (Reanimated's onStart); at rest at 1 |
//! | card rotate | withSpring(show ? '0deg' : '-10deg'), the default | the same, in degrees; at rest at −10 |
//! | logo opacity | withTiming(show ? 0 : 1): 300 ms, inOut(quad), from where it is | `Timing` (Easing::timing_default), same |
//! | button scale | pressto PressableScale: progress never leaves 0 (see above) | none |
//! | letter, colours, letterX | setInterval 650 ms: index (i + 1) % 8; useDerivedValue | ticks on the first frame ≥ last tick + 650 ms |
//! | haptic | PressablesConfig onPress: selectionAsync | `haptic:selection` at the lift |
//!
//! The interval keeps the surface drawing every frame (a compose pass); the Skia layers are
//! redrawn only when the letter changes, the clip only when the card moves.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};
use reanimated::{Easing, Spring, Timing, GENTLE};
use skia::{point, Canvas, Color, Font, Matrix, Paint, Renderer, Shader};

use crate::{qr, shaders};
use shaders::empty_qr_code::{entry, module, Compose, GROUP_0, LETTER, MASK, QR, SMP, U};

/// DEFAULT_QRCODE_SIZE: the card.
const SIZE: f32 = 150.0;
/// DEFAULT_QRCODE_PADDING: the QR is SIZE − 2 × PADDING.
const PADDING: f32 = 30.0;
/// DEFAULT_FONT_SIZE.
const FONT_SIZE: f32 = 110.0;
/// styles.container borderRadius (borderCurve continuous).
const RADIUS: f32 = 50.0;
/// index.tsx styles.container backgroundColor and the QR's View backgroundColor (View colours:
/// Display P3 components).
const BACKGROUND: u32 = 0xFBFBFB;
const FILL: u32 = 0x111111;
/// The value QRCodeShare gets.
const QR_VALUE: &str = "https://reactiive.io/demos";
/// rStyle's targets: scale and rotate (degrees), shown / hidden.
const SCALE_SHOWN: f64 = 1.4;
const ROTATE_HIDDEN: f64 = -10.0;
/// useActiveLetterAnimation's timeInterval.
const INTERVAL_MS: f64 = 650.0;
/// DEFAULT_LETTERS and DEFAULT_COLORS (Skia colours: sRGB).
const LETTERS: [&str; 8] = ["Y", "O", "U", "R", "L", "O", "G", "O"];
const COLORS: [(u32, u32); 8] = [
    (0x22AAA1, 0x4CE0D2),
    (0xE55934, 0xFA7921),
    (0xF2C94C, 0xF2C94C),
    (0x3C40C6, 0x575FCF),
    (0x2F80ED, 0x56CCF2),
    (0xF7A072, 0xFFD56D),
    (0x3C40C6, 0x575FCF),
    (0x2F80ED, 0x56CCF2),
];
/// Math.min(letters.length, colors.length).
const CYCLE: usize = if LETTERS.len() < COLORS.len() {
    LETTERS.len()
} else {
    COLORS.len()
};
/// assets/fonts/SF-Pro-Rounded-Bold.otf, cut to the letters of YOURLOGO (fontTools subset: the
/// same outlines, advances and metrics).
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-yourlogo.otf");
/// The clip's layer: a square of this many points about the card's centre holds the card at
/// any of its scales and angles (75 × 1.4 × √2 < 150).
const MASK_HALF: f32 = 150.0;
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(EmptyQrCode::new())
}

/// Yoga's rounding of an absolute edge to the pixel grid (a half rounds up).
fn grid(v: f32, s: f32) -> f32 {
    ((v * s + 0.5 + 1e-4).floor()) / s
}

/// The screen: a window `w × h` at `s` device pixels per point, and the card's frame.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Layout {
    w: f32,
    h: f32,
    s: f32,
    /// The card's left and top (its row, the button, shares the top).
    x0: f32,
    y0: f32,
}

impl Layout {
    fn new(w: f32, h: f32, s: f32) -> Layout {
        Layout {
            w,
            h,
            s,
            x0: grid((w - SIZE) / 2.0, s),
            y0: grid((h - SIZE) / 2.0, s),
        }
    }
    fn px(&self, points: f32) -> u32 {
        (points * self.s).round().max(1.0) as u32
    }
    /// The clip layer's origin on the target (device px) and its side.
    fn mask(&self) -> ([f32; 2], u32) {
        let (cx, cy) = (self.x0 + SIZE / 2.0, self.y0 + SIZE / 2.0);
        let o = [
            ((cx - MASK_HALF) * self.s).floor(),
            ((cy - MASK_HALF) * self.s).floor(),
        ];
        (o, (2.0 * MASK_HALF * self.s).ceil() as u32 + 2)
    }
}

struct EmptyQrCode {
    layout: Layout,
    /// showQRCode.
    show: bool,
    scale: Spring,
    /// Degrees.
    rotate: Spring,
    opacity: Timing,
    /// activeLetterIndex, and when the interval fires next (None until the first frame).
    index: usize,
    next_tick: Option<f64>,
    /// The finger the button tracks.
    finger: Option<u32>,
    posted: Vec<String>,
    font: Option<Font>,
    qr: skia::Path,
    letter: Canvas,
    letter_renderer: Renderer,
    qr_canvas: Canvas,
    qr_renderer: Renderer,
    mask: Canvas,
    mask_renderer: Renderer,
    /// What the layers hold: the letter's index, the clip's (scale, rotate).
    drawn_letter: Option<usize>,
    drawn_mask: Option<(f64, f64)>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
    letter_view: wgpu::TextureView,
    qr_view: wgpu::TextureView,
    mask_view: wgpu::TextureView,
    qr_drawn: bool,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl EmptyQrCode {
    fn new() -> EmptyQrCode {
        let mut verbs = Vec::new();
        if let Some(symbol) = qr::create(QR_VALUE, qr::Ecl::H) {
            qr::rounded_path(&symbol, (SIZE - PADDING * 2.0) as f64, &mut verbs);
        }
        EmptyQrCode {
            layout: Layout::default(),
            show: false,
            scale: Spring::at(1.0),
            rotate: Spring::at(ROTATE_HIDDEN),
            opacity: Timing::at(1.0),
            index: 0,
            next_tick: None,
            finger: None,
            posted: Vec::new(),
            font: Font::new(SF_ROUNDED_BOLD, FONT_SIZE),
            qr: qr::to_lyon(&verbs),
            letter: Canvas::default(),
            letter_renderer: Renderer::default(),
            qr_canvas: Canvas::default(),
            qr_renderer: Renderer::default(),
            mask: Canvas::default(),
            mask_renderer: Renderer::default(),
            drawn_letter: None,
            drawn_mask: None,
            gpu: None,
        }
    }

    /// toggleQRCodeVisibility: rStyle's springs and rLogoContainerStyle's timing start from
    /// where they are.
    fn toggle(&mut self) {
        self.show = !self.show;
        self.scale
            .retarget(if self.show { SCALE_SHOWN } else { 1.0 }, GENTLE);
        self.rotate
            .retarget(if self.show { 0.0 } else { ROTATE_HIDDEN }, GENTLE);
        self.opacity.to(
            if self.show { 0.0 } else { 1.0 },
            300.0,
            Easing::timing_default(),
        );
    }

    /// The card's points → the screen's: `[scale, rotate]` about its centre.
    fn matrix(&self) -> Matrix {
        let l = &self.layout;
        let k = self.scale.value as f32;
        Matrix::translate(-SIZE / 2.0, -SIZE / 2.0)
            .then(Matrix::rotate((self.rotate.value as f32).to_radians()))
            .then(Matrix::scale(k, k))
            .then(Matrix::translate(l.x0 + SIZE / 2.0, l.y0 + SIZE / 2.0))
    }

    /// UIKit's hit test of the BaseButton: its untransformed frame (the window's width × 150;
    /// pressto's scale never leaves 1).
    fn hits(&self, x: f32, y: f32) -> bool {
        let l = &self.layout;
        x >= 0.0 && x < l.w && y >= l.y0 && y < l.y0 + SIZE
    }

    /// setInterval's ticks up to this frame (at most one per frame, as RCTTiming fires them).
    fn tick(&mut self, now_ms: f64) {
        match self.next_tick {
            None => self.next_tick = Some(now_ms + INTERVAL_MS),
            Some(at) if now_ms >= at => {
                self.index = (self.index + 1) % CYCLE;
                self.next_tick = Some(now_ms + INTERVAL_MS);
            }
            Some(_) => {}
        }
    }

    /// The letter canvas, in its 150 × 150 points.
    fn record_letter(&mut self, s: f32) {
        let (c0, c1) = COLORS[self.index];
        let c = &mut self.letter;
        c.begin(s);
        let gradient = Shader::Radial {
            center: point(SIZE / 2.0, SIZE / 2.0),
            radius: SIZE / 2.0,
            stops: skia::stops(&[Color::hex(c0), Color::hex(c1)]),
        };
        c.draw_rect(0.0, 0.0, SIZE, SIZE, &Paint::shader(gradient));
        if let Some(font) = &self.font {
            let letter = LETTERS[self.index];
            let x = -font.measure_text(letter).width / 2.0 + SIZE / 2.0;
            let y = FONT_SIZE / 3.0 + SIZE / 2.0;
            c.draw_text(letter, x, y, font, &Paint::fill(Color::WHITE));
        }
    }
}

impl Surface for EmptyQrCode {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        match phase {
            PointerPhase::Down if self.finger.is_none() && self.layout.s > 0.0 => {
                if self.hits(x, y) {
                    self.finger = Some(id);
                }
            }
            PointerPhase::Up if self.finger == Some(id) => {
                self.finger = None;
                // onPress: toggle(), then the app's selection haptic.
                self.toggle();
                self.posted.push("haptic:selection".into());
            }
            PointerPhase::Cancel if self.finger == Some(id) => self.finger = None,
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"show\":{},\"index\":{},\"letter\":\"{}\",\"scale\":{},\"rotate\":{},\"opacity\":{},\"held\":{}}}",
            self.show,
            self.index,
            LETTERS[self.index],
            self.scale.value,
            self.rotate.value,
            self.opacity.value,
            self.finger.is_some()
        ))
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
        let layout = Layout::new(frame.width, frame.height, frame.scale);
        self.layout = layout;
        self.tick(frame.now_ms);
        self.scale.step(frame.now_ms);
        self.rotate.step(frame.now_ms);
        self.opacity.step(frame.now_ms);
        if self
            .gpu
            .as_ref()
            .map(|g| (g.format, g.generation, g.layout))
            != Some((format, frame.shader_generation, layout))
        {
            self.gpu = Some(build(device, format, frame.shader_generation, layout));
            self.drawn_letter = None;
            self.drawn_mask = None;
        }
        let s = layout.s;
        let (lp, qp) = (layout.px(SIZE), layout.px(SIZE - PADDING * 2.0));
        let (mask_origin, mask_px) = layout.mask();

        if !self.gpu.as_ref().unwrap().qr_drawn {
            self.qr_canvas.begin(s);
            self.qr_canvas
                .draw_path(&self.qr, &Paint::fill(Color::WHITE));
            let gpu = self.gpu.as_mut().unwrap();
            self.qr_renderer.draw(
                device,
                queue,
                encoder,
                &self.qr_canvas,
                &gpu.qr_view,
                LAYER_FORMAT,
                qp,
                qp,
                wgpu::Color::TRANSPARENT,
            );
            gpu.qr_drawn = true;
        }
        if self.drawn_letter != Some(self.index) {
            self.record_letter(s);
            let gpu = self.gpu.as_ref().unwrap();
            self.letter_renderer.draw(
                device,
                queue,
                encoder,
                &self.letter,
                &gpu.letter_view,
                LAYER_FORMAT,
                lp,
                lp,
                wgpu::Color::TRANSPARENT,
            );
            self.drawn_letter = Some(self.index);
        }
        let pose = (self.scale.value, self.rotate.value);
        if self.drawn_mask != Some(pose) {
            let m = self.matrix();
            let c = &mut self.mask;
            c.begin(s);
            c.translate(-mask_origin[0] / s, -mask_origin[1] / s);
            c.concat(m);
            c.draw_continuous_rrect(0.0, 0.0, SIZE, SIZE, RADIUS, &Paint::fill(Color::WHITE));
            let gpu = self.gpu.as_ref().unwrap();
            self.mask_renderer.draw(
                device,
                queue,
                encoder,
                &self.mask,
                &gpu.mask_view,
                LAYER_FORMAT,
                mask_px,
                mask_px,
                wgpu::Color::TRANSPARENT,
            );
            self.drawn_mask = Some(pose);
        }

        let [a, b, cc, d, e, f] = self.matrix().invert().0;
        let (bg, fill) = (p3(BACKGROUND), p3(FILL));
        let (pw, ph) = frame.pixels();
        let u = Compose {
            inv0: [a, cc, e, 0.0],
            inv1: [b, d, f, 0.0],
            card: [SIZE, SIZE, PADDING, PADDING],
            tex: [lp as f32, lp as f32, qp as f32, qp as f32],
            layer: [self.opacity.value as f32, SIZE - PADDING * 2.0, 0.0, 0.0],
            mask: [
                mask_origin[0],
                mask_origin[1],
                mask_px as f32,
                mask_px as f32,
            ],
            background: [bg[0], bg[1], bg[2], 1.0],
            fill: [fill[0], fill[1], fill[2], 1.0],
            canvas: [pw as f32, ph as f32, s, crate::gfx::srgb_flag(format)],
        };
        let gpu = self.gpu.as_ref().unwrap();
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());
        skia::render::fullscreen_pass(encoder, "empty qr code", target, &gpu.compose, &gpu.bind);
        // setInterval runs as long as the demo shows.
        true
    }
}

/// `0xRRGGBB` as a View's Display P3 components (encoded).
fn p3(rgb: u32) -> [f32; 3] {
    [(rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF].map(|c| c as f32 / 255.0)
}

fn build(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    generation: u32,
    layout: Layout,
) -> Gpu {
    let (lp, qp) = (layout.px(SIZE), layout.px(SIZE - PADDING * 2.0));
    let (_, mask_px) = layout.mask();
    let letter_view =
        skia::render::sampled_target(device, "empty qr code letter", LAYER_FORMAT, lp, lp);
    let qr_view = skia::render::sampled_target(device, "empty qr code qr", LAYER_FORMAT, qp, qp);
    let mask_view =
        skia::render::sampled_target(device, "empty qr code mask", LAYER_FORMAT, mask_px, mask_px);
    let sampler = skia::render::linear_sampler(device);
    let shader = device.create_shader_module(module());
    let group = device.create_bind_group_layout(&GROUP_0);
    let compose =
        skia::render::fullscreen_pipeline(device, &shader, &group, entry::COMPOSE, format, None);
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("empty qr code"),
        size: Compose::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("empty qr code"),
        layout: &group,
        entries: &[
            wgpu::BindGroupEntry {
                binding: U.binding,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: LETTER.binding,
                resource: wgpu::BindingResource::TextureView(&letter_view),
            },
            wgpu::BindGroupEntry {
                binding: QR.binding,
                resource: wgpu::BindingResource::TextureView(&qr_view),
            },
            wgpu::BindGroupEntry {
                binding: MASK.binding,
                resource: wgpu::BindingResource::TextureView(&mask_view),
            },
            wgpu::BindGroupEntry {
                binding: SMP.binding,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    Gpu {
        format,
        generation,
        layout,
        letter_view,
        qr_view,
        mask_view,
        qr_drawn: false,
        compose,
        uniforms,
        bind,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    const FRAME_MS: f64 = 1000.0 / 60.0;

    fn pointer(phase: PointerPhase, x: f32, y: f32) -> InputEvent {
        InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms: 0.0,
        }
    }

    #[test]
    fn layout_is_yogas() {
        // iPhone Air: 420 × 912 at 3×.
        let l = Layout::new(420.0, 912.0, 3.0);
        assert_eq!((l.x0, l.y0), (135.0, 381.0));
        assert_eq!((l.px(SIZE), l.px(SIZE - 2.0 * PADDING)), (450, 270));
        // An odd window: the card's edges on the 1/3 pt grid.
        let l = Layout::new(393.0, 852.0, 3.0);
        assert_eq!(((l.x0 * 3.0).fract(), l.y0), (0.0, 351.0));
        assert!((l.x0 - 121.666_67).abs() < 1e-3, "{}", l.x0);
    }

    #[test]
    fn the_interval_ticks_on_the_first_frame_past_650_ms_from_the_last() {
        let mut q = EmptyQrCode::new();
        let mut ticks = Vec::new();
        let mut last = q.index;
        for n in 0..200 {
            let t = 1000.0 + n as f64 * FRAME_MS;
            q.tick(t);
            if q.index != last {
                ticks.push(t - 1000.0);
                last = q.index;
            }
        }
        // 650 is frame 39 exactly (650.0 ms); each later tick is 39 frames after the last.
        assert!((ticks[0] - 650.0).abs() < 1e-6, "{ticks:?}");
        for w in ticks.windows(2) {
            assert!((w[1] - w[0] - 39.0 * FRAME_MS).abs() < 1e-6, "{ticks:?}");
        }
        // On a 120 Hz clock with a frame late, the drift is kept: no catching up.
        let mut q = EmptyQrCode::new();
        q.tick(0.0);
        q.tick(655.0);
        assert_eq!((q.index, q.next_tick), (1, Some(1305.0)));
        q.tick(1300.0);
        assert_eq!(q.index, 1);
        // Index cycles through the eight letters.
        let mut q = EmptyQrCode::new();
        q.tick(0.0);
        for k in 1..=9 {
            q.tick(k as f64 * 650.0);
        }
        assert_eq!(q.index, 9 % 8);
    }

    #[test]
    fn a_touch_on_the_row_toggles_at_its_lift_wherever_it_lifts() {
        let mut q = EmptyQrCode::new();
        q.layout = Layout::new(420.0, 912.0, 3.0);
        // Outside the button's 150-pt row (the card's overflow at 1.4 is not hit-testable).
        q.input(&pointer(PointerPhase::Down, 210.0, 370.0));
        q.input(&pointer(PointerPhase::Up, 210.0, 370.0));
        assert!(!q.show && q.messages().is_empty());
        // On the row, beside the card: a press.
        q.input(&pointer(PointerPhase::Down, 20.0, 400.0));
        q.input(&pointer(PointerPhase::Up, 20.0, 100.0));
        assert!(q.show);
        assert_eq!(q.messages(), vec!["haptic:selection".to_string()]);
        assert_eq!(
            (q.scale.target(), q.rotate.target(), q.opacity.target()),
            (1.4, 0.0, 0.0)
        );
        // A cancelled touch does nothing.
        q.input(&pointer(PointerPhase::Down, 210.0, 456.0));
        q.input(&pointer(PointerPhase::Cancel, 210.0, 456.0));
        assert!(q.show && q.messages().is_empty());
    }

    #[test]
    fn a_toggle_mid_flight_starts_from_where_the_springs_are() {
        let mut q = EmptyQrCode::new();
        q.toggle();
        let mut t = 0.0;
        for _ in 0..8 {
            q.scale.step(t);
            q.rotate.step(t);
            q.opacity.step(t);
            t += FRAME_MS;
        }
        let (s, r, o) = (q.scale.value, q.rotate.value, q.opacity.value);
        assert!(
            s > 1.1 && s < 1.4 && r > -10.0 && r < 0.0 && o > 0.0 && o < 1.0,
            "{s} {r} {o}"
        );
        q.toggle();
        // Reversed from where they are: the springs' velocity pointed away from the new targets,
        // so it is dropped (from rest, a critical spring moves 2.6 % of the way in a frame,
        // toward 1, where the kept +1.8/s would have carried it on up); the timing starts over
        // from its value.
        assert_eq!((q.scale.value, q.rotate.value), (s, r));
        q.scale.step(t);
        q.opacity.step(t);
        assert!(
            q.scale.value < s && q.scale.value > s - 0.01,
            "{} {s}",
            q.scale.value
        );
        assert_eq!(q.opacity.value, o);
        t += FRAME_MS;
        let mut prev = s;
        while q.scale.step(t) | q.rotate.step(t) {
            assert!(
                q.scale.value <= prev + 1e-12,
                "a critical spring from rest does not overshoot"
            );
            prev = q.scale.value;
            t += FRAME_MS;
        }
        assert_eq!((q.scale.value, q.rotate.value), (1.0, -10.0));
    }

    #[test]
    fn renders_the_letter_and_the_qr() {
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
        let px = |img: &fixture::Pixels, x: f32, y: f32| {
            let p = img.at((x * 3.0) as u32, (y * 3.0) as u32);
            [p[0] as i32, p[1] as i32, p[2] as i32]
        };
        let near = |a: [i32; 3], b: [i32; 3], tol: i32| (0..3).all(|k| (a[k] - b[k]).abs() <= tol);
        let view = |rgb: u32| {
            let c = Color::view_hex(rgb).0;
            [0, 1, 2].map(|k| (c[k] * 255.0).round() as i32)
        };
        let mut s = EmptyQrCode::new();
        let (rest, wants) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        rest.save("empty-qr-code-rest");
        assert!(wants, "the interval keeps it drawing");
        // The background, #fbfbfb in Display P3.
        assert!(
            near(px(&rest, 10.0, 10.0), view(BACKGROUND), 1),
            "{:?}",
            px(&rest, 10.0, 10.0)
        );
        // The card's centre (210, 456): the gradient's outer colour near the card's bottom edge,
        // inside the clip (rotated −10°: the bottom-centre point stays inside).
        let edge = px(&rest, 210.0, 456.0 + 70.0);
        assert!(edge[1] > edge[0] && edge[2] > edge[0], "teal: {edge:?}");
        // The Y's stem below the centre is white.
        assert!(
            near(px(&rest, 210.0, 456.0 + 20.0), [255, 255, 255], 2),
            "{:?}",
            px(&rest, 210.0, 456.0 + 20.0)
        );
        // Outside the clip's corner (the square's corner, rotated) is background.
        assert!(
            near(px(&rest, 135.5, 381.5), view(BACKGROUND), 1),
            "{:?}",
            px(&rest, 135.5, 381.5)
        );

        // The first tick: an O on orange.
        let (o, _) = fixture::render(&gpu, &mut s, &frame(650.0)).unwrap();
        o.save("empty-qr-code-o");
        assert_eq!(s.index, 1);
        let c = px(&o, 210.0, 456.0 + 70.0);
        assert!(c[0] > c[1] && c[1] > c[2], "orange: {c:?}");
        // The O's counter, at the centre, shows the gradient.
        let centre = px(&o, 210.0, 456.0 - 8.0);
        assert!(centre[0] > 200 && centre[2] < 120, "{centre:?}");

        // Shown: straight, at 1.4, the letter gone.
        s.toggle();
        let mut t = 700.0;
        let mut mid = None;
        while t < 2400.0 {
            let (img, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
            if mid.is_none() && t >= 850.0 {
                img.save("empty-qr-code-mid");
                mid = Some(());
            }
            t += FRAME_MS;
        }
        let (shown, _) = fixture::render(&gpu, &mut s, &frame(t)).unwrap();
        shown.save("empty-qr-code-shown");
        assert_eq!(
            (s.scale.value, s.rotate.value, s.opacity.value),
            (1.4, 0.0, 0.0)
        );
        // Module (0, 0) is dark (white), (1, 1) light (#111), in the 90-pt QR at (30, 30).
        let cell = 90.0 / 33.0;
        let at = |i: f32, j: f32| {
            (
                210.0 + 1.4 * (30.0 + (j + 0.5) * cell - 75.0),
                456.0 + 1.4 * (30.0 + (i + 0.5) * cell - 75.0),
            )
        };
        let (x, y) = at(0.0, 0.0);
        assert!(
            near(px(&shown, x, y), [255, 255, 255], 2),
            "{:?}",
            px(&shown, x, y)
        );
        let (x, y) = at(1.0, 1.0);
        assert!(
            near(px(&shown, x, y), view(FILL), 1),
            "{:?} {:?}",
            px(&shown, x, y),
            view(FILL)
        );
        // The card's edge at 1.4: 105 pt from the centre; just inside is #111, outside background.
        assert!(near(px(&shown, 210.0, 456.0 + 103.0), view(FILL), 1));
        assert!(near(px(&shown, 210.0, 456.0 + 106.0), view(BACKGROUND), 1));
    }
}
