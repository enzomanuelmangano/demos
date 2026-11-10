//! Light on Painting (src/animations/light-on-painting: index.tsx, state.ts, constants.ts,
//! paintings.ts, hooks/use-relight-renderer.ts, shaders/relight.ts, components/paginator.tsx):
//! Vermeer's *Girl with a Pearl Earring* and Hopper's *Nighthawks* side by side on black, one
//! window wide each, relit by a bulb hanging on a cord that the finger carries, swings when let
//! go and pinches deeper into the scene; a swipe anywhere else pages between them, a double tap
//! posts `settings` (the Contract opens the sheet whose four switches are this surface's inputs).
//!
//! The relighting pass (gpu/shaders/light_on_painting.wgsl) is relight.ts line for line, its
//! uniform buffer word for word (use-relight-renderer.ts startFrameLoop's floats[0..63]), its
//! textures RN's: the albedo as RN Skia decodes the JPEG (libjpeg-turbo's bytes, unconverted,
//! rgba8unorm) and the baked surface field's half floats (rgba16float), both linear-filtered,
//! clamped, one level. Bundled in images/light-on-painting/ (exact/parity-tools/
//! light-on-painting-assets.py: row deltas under zlib, lossless; the test checks the decoded
//! bytes' FNV-1a against the RN files'), inflated once at the first frame.
//!
//! The canvas is a react-native-webgpu CAMetalLayer: bgra8unorm, no colorspace, which iOS shows
//! as sRGB (MetalLayerColorSpace.mm), so the shader's output is sRGB as written. Its drawable is
//! min(PixelRatio, 2) × the canvas's points (MAX_PIXEL_RATIO), stretched over the bounds by Core
//! Animation's linear filter: the pass renders into an 8-bit layer at that raster, and
//! gpu/shaders/light_on_painting_compose.wgsl samples it bilinearly at each device pixel, with
//! the Paginator's views (drawn at the device's pixels) over it. Like RN, the pass runs only
//! when its uniforms change.
//!
//! Gestures, as RNGH on iOS sees them (Gesture.Simultaneous(pan, pinch) on the full canvas):
//! - Pan().minDistance(0): onBegin at touch-down (grab the bulb within LIGHT_GRAB_RADIUS of it,
//!   keeping the offset, or start paging); custom criteria activate it at the first move, where
//!   the translation is zeroed and onStart and onUpdate both fire; onEnd keeps velocityX;
//!   onFinalize (end, cancel or fail) spots taps (under TAP_SLOP of translation, TAP_DURATION)
//!   and double taps (TAP_GAP), commits the page, lets go of the bulb.
//! - Pinch: targetZ = clamp(pinchStart × scale, LIGHT_Z_MIN, LIGHT_Z_MAX), pinchStart taken as
//!   the pinch begins.
//!
//! Motion (the audit; every value advances in the frame loop, as startFrameLoop does with
//! Date.now() deltas, which here are the host's frame clock):
//! - light.z: z += (targetZ − z) × min(1, frame × 10), frame = min(dt, 1/15) s.
//! - light.pageShift: under the finger, pageStart − translationX / width, rubber-banded × 0.35
//!   past either end; released, settles exponentially on pageTarget (1 − e^(−12 × frame), snapped
//!   under 0.0005). pageTarget: a flick (|velocityX| > 450) moves one page against it, else a
//!   move of more than 0.25 pages moves one page with it, clamped.
//! - light.x / y and the cord: fixed 1/120 s Verlet slices (carry, at most 6 a frame, then the
//!   backlog is dropped): gravity 24, damping e^(−0.5 × step), 10 passes of distance constraints
//!   by inverse mass (bulb 8, anchor fixed, the held bulb fixed) and bending 0.22; held, the bulb
//!   chases the finger's target by 1 − e^(−30 × step); untouched, it hangs at CORD_REST_Y; the
//!   finger pays the cord out between 0.12 and 1.7. Untethered (no cord), only the chase.
//! - The Paginator dots: width 6 → 16 → 6 and opacity 0.3 → 1 → 0.3 linear in
//!   clamp(pageShift − (index − 1), 0, 2), read every frame (useAnimatedStyle on scrollX), laid out
//!   by Yoga (row, centred, gap 8, bottom 60) on the device-pixel grid.
//! - The sheet: the platform's (Contract `dialog`); no haptics here (the switches' selection
//!   haptic is the Contract's).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, PinchEvent, PinchGesture};
use skia::{Canvas, Color, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::light_on_painting as relight;
use shaders::light_on_painting_compose as compose;

// --- constants.ts -----------------------------------------------------------------------------

/// SURFACE_FAR_Z.
const SURFACE_FAR_Z: f64 = -0.32;
/// LIGHT_Z_MIN.
const LIGHT_Z_MIN: f64 = SURFACE_FAR_Z + 0.04;
/// LIGHT_Z_MAX.
const LIGHT_Z_MAX: f64 = 0.5;
/// LIGHT_Z_DEFAULT.
const LIGHT_Z_DEFAULT: f64 = -0.18;
/// PAINTING_WIDTH_RATIO.
const PAINTING_WIDTH_RATIO: f64 = 1.0;
/// DEFAULT_SETTINGS.
const INTENSITY: f64 = 4.05;
const EXPOSURE: f64 = 0.085;
const RELIEF: f64 = 1.25;
const SPECULAR: f64 = 0.3;
const SHADOW: f64 = 0.85;
const OCCLUSION: f64 = 0.6;
const LIGHT_REACH: f64 = 0.42;
const SHADOW_LIFT: f64 = 1.15;
const LIGHT_COLOR: [f64; 3] = [1.0, 0.76, 0.5];
/// The bulb's geometry, shared with the shader.
const VOID_Z: f64 = -32.0;
const BULB_WORLD_RADIUS: f64 = 0.045;
const BULB_CAMERA_Z: f64 = 2.0;
const BULB_REFERENCE_Z: f64 = 0.42;
const BULB_SOURCE_SOFTNESS: f64 = 0.08;
const BULB_SAMPLE_SPREAD: f64 = 0.6;
/// RelightMode.
const MODE_RELIT: u32 = 0;
const MODE_ALBEDO: u32 = 1;
const MODE_DEPTH: u32 = 2;
/// LIGHT_GRAB_RADIUS, points.
const LIGHT_GRAB_RADIUS: f64 = 64.0;
/// CORD_NODES.
const CORD_NODES: usize = 12;
/// DRAG_FOLLOW.
const DRAG_FOLLOW: f64 = 30.0;
/// PHYSICS_STEP, PHYSICS_MAX_STEPS.
const PHYSICS_STEP: f64 = 1.0 / 120.0;
const PHYSICS_MAX_STEPS: u32 = 6;
/// CORD_ITERATIONS, CORD_STIFFNESS.
const CORD_ITERATIONS: usize = 10;
const CORD_STIFFNESS: f64 = 0.22;
/// PENDULUM_GRAVITY, PENDULUM_DAMPING, BULB_MASS.
const PENDULUM_GRAVITY: f64 = 24.0;
const PENDULUM_DAMPING: f64 = 0.5;
const BULB_MASS: f64 = 8.0;
/// CORD_ANCHOR_X, CORD_MIN_LENGTH, CORD_MAX_LENGTH.
const CORD_ANCHOR_X: f64 = 0.0;
const CORD_MIN_LENGTH: f64 = 0.12;
const CORD_MAX_LENGTH: f64 = 1.7;
/// PAINTING_CENTER_Y, CORD_REST_Y.
const PAINTING_CENTER_Y: f64 = 0.5;
const CORD_REST_Y: f64 = -0.25;
/// TAP_SLOP (points), TAP_DURATION, TAP_GAP (ms).
const TAP_SLOP: f64 = 12.0;
const TAP_DURATION: f64 = 300.0;
const TAP_GAP: f64 = 320.0;
/// PAGE_SETTLE_RATE, PAGE_COMMIT_FRACTION, PAGE_FLICK_VELOCITY.
const PAGE_SETTLE_RATE: f64 = 12.0;
const PAGE_COMMIT_FRACTION: f64 = 0.25;
const PAGE_FLICK_VELOCITY: f64 = 450.0;
/// use-relight-renderer.ts MAX_PIXEL_RATIO.
const MAX_PIXEL_RATIO: f32 = 2.0;
/// paginator.tsx DOT_SIZE, DOT_ACTIVE_WIDTH, DOT_SPACING; styles.container bottom.
const DOT_SIZE: f64 = 6.0;
const DOT_ACTIVE_WIDTH: f64 = 16.0;
const DOT_SPACING: f64 = 8.0;
const PAGINATOR_BOTTOM: f64 = 60.0;

/// The relit layer and the paginator's layer: 8-bit, sRGB-encoded as RN's drawable is.
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

// --- paintings.ts -----------------------------------------------------------------------------

/// One painting's bundled pixels and facts (PaintingFacts).
struct Painting {
    /// The albedo, libjpeg-turbo's RGB rows (row deltas, zlib) and its size.
    albedo: &'static [u8],
    albedo_size: (u32, u32),
    /// The surface field's rgba16float half bits (row deltas, byte planes, zlib); its size is
    /// the field's `meta` (the json).
    surface: &'static [u8],
    meta: (u32, u32),
    /// occludeBulb (default true).
    occlude_bulb: bool,
}

const PAINTINGS: [Painting; 2] = [
    Painting {
        albedo: include_bytes!(
            "../images/light-on-painting/girl-with-a-pearl-earring-1200x1421.rgb8up.zlib"
        ),
        albedo_size: (1200, 1421),
        surface: include_bytes!(
            "../images/light-on-painting/girl-with-a-pearl-earring-surface-640x758.rgba16f.zlib"
        ),
        meta: (640, 758),
        occlude_bulb: false,
    },
    Painting {
        albedo: include_bytes!("../images/light-on-painting/nighthawks-1280x698.rgb8up.zlib"),
        albedo_size: (1280, 698),
        surface: include_bytes!(
            "../images/light-on-painting/nighthawks-surface-640x349.rgba16f.zlib"
        ),
        meta: (640, 349),
        occlude_bulb: true,
    },
];

/// halfHeightOf: 0.5 / (meta.width / meta.height).
fn half_height(p: &Painting) -> f64 {
    0.5 / (p.meta.0 as f64 / p.meta.1 as f64)
}

/// The albedo's RGBA8 texels (alpha 255).
fn albedo_texels(p: &Painting) -> Vec<u8> {
    let (w, h) = (p.albedo_size.0 as usize, p.albedo_size.1 as usize);
    let mut rows = miniz_oxide::inflate::decompress_to_vec_zlib(p.albedo).unwrap_or_default();
    if rows.len() != w * h * 3 {
        rows = vec![0; w * h * 3];
    }
    let stride = w * 3;
    for i in stride..rows.len() {
        rows[i] = rows[i].wrapping_add(rows[i - stride]);
    }
    let mut out = vec![255u8; w * h * 4];
    for (o, i) in out.chunks_exact_mut(4).zip(rows.chunks_exact(3)) {
        o[..3].copy_from_slice(i);
    }
    out
}

/// The surface field's half bits, [slopeX, slopeY, occlusion, depth] per texel.
fn surface_halfs(p: &Painting) -> Vec<u16> {
    let (w, h) = (p.meta.0 as usize, p.meta.1 as usize);
    let n = w * h;
    let planes = miniz_oxide::inflate::decompress_to_vec_zlib(p.surface).unwrap_or_default();
    let mut out = vec![0u16; n * 4];
    if planes.len() != n * 8 {
        return out;
    }
    for c in 0..4 {
        let (hi, lo) = (
            &planes[c * 2 * n..c * 2 * n + n],
            &planes[c * 2 * n + n..c * 2 * n + 2 * n],
        );
        for i in 0..n {
            out[i * 4 + c] = (hi[i] as u16) << 8 | lo[i] as u16;
        }
    }
    let stride = w * 4;
    for i in stride..out.len() {
        out[i] = out[i].wrapping_add(out[i - stride]);
    }
    out
}

// --- JS's numbers -----------------------------------------------------------------------------

/// Math.round: halves toward +∞.
fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// Math.sign.
fn js_sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        x
    }
}

/// `Math.hypot(dx, dy) || 1e-6`.
fn hypot_or(dx: f64, dy: f64) -> f64 {
    let d = dx.hypot(dy);
    if d == 0.0 || d.is_nan() {
        1e-6
    } else {
        d
    }
}

/// state.ts decodeHalf: IEEE half → float.
fn decode_half(bits: u16) -> f64 {
    let sign = if bits & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exponent = ((bits >> 10) & 0x1f) as i32;
    let fraction = (bits & 0x03ff) as f64;
    if exponent == 0 {
        return sign * 2f64.powi(-24) * fraction;
    }
    if exponent == 0x1f {
        return if fraction != 0.0 {
            f64::NAN
        } else {
            sign * f64::INFINITY
        };
    }
    sign * 2f64.powi(exponent - 15) * (1.0 + fraction / 1024.0)
}

// --- state.ts ---------------------------------------------------------------------------------

/// CordNode.
#[derive(Clone, Copy, Debug, Default)]
struct CordNode {
    x: f64,
    y: f64,
    previous_x: f64,
    previous_y: f64,
}

/// LightState.
#[derive(Clone, Debug)]
struct LightState {
    x: f64,
    y: f64,
    cord_length: f64,
    cord: [CordNode; CORD_NODES],
    paid_out: bool,
    held: bool,
    z: f64,
    target_z: f64,
    page_shift: f64,
    page_target: f64,
    paging: bool,
    target_x: f64,
    target_y: f64,
    carry: f64,
    page_start: f64,
    grab_x: f64,
    grab_y: f64,
    grabbed: bool,
}

impl Default for LightState {
    /// createLightState.
    fn default() -> Self {
        LightState {
            x: 0.0,
            y: 0.0,
            cord_length: 0.0,
            cord: [CordNode::default(); CORD_NODES],
            paid_out: false,
            held: false,
            z: LIGHT_Z_DEFAULT,
            target_z: LIGHT_Z_DEFAULT,
            page_shift: 0.0,
            page_target: 0.0,
            paging: false,
            target_x: 0.0,
            target_y: 0.0,
            carry: 0.0,
            page_start: 0.0,
            grab_x: 0.0,
            grab_y: 0.0,
            grabbed: false,
        }
    }
}

/// LightSettings, as index.tsx's effect translates the sheet's.
#[derive(Clone, Copy, Debug, PartialEq)]
struct LightSettings {
    intensity: f64,
    cord_opacity: f64,
    bulb_opacity: f64,
    tethered: bool,
    mode: u32,
}

impl LightSettings {
    fn of(show_bulb: bool, show_cord: bool, relight: bool, show_depth: bool) -> LightSettings {
        LightSettings {
            intensity: INTENSITY,
            cord_opacity: if show_cord && show_bulb { 1.0 } else { 0.0 },
            bulb_opacity: if show_bulb { 1.0 } else { 0.0 },
            tethered: show_cord && show_bulb,
            mode: if show_depth {
                MODE_DEPTH
            } else if relight {
                MODE_RELIT
            } else {
                MODE_ALBEDO
            },
        }
    }
}

/// cordAnchorY: just off the top of the screen.
fn cord_anchor_y(aspect_height: f64) -> f64 {
    -PAINTING_CENTER_Y * aspect_height - 0.02
}

/// bulbExposure: how much of the bulb's disc is clear of the scene behind it (nine taps of the
/// depth field at its nearest texel).
fn bulb_exposure(light: &LightState, fields: &[Vec<u16>]) -> f64 {
    let depth_at = |world_x: f64, world_y: f64| -> f64 {
        let page = js_round(world_x + light.page_shift);
        if page < 0.0 || page > (PAINTINGS.len() - 1) as f64 {
            return VOID_Z;
        }
        let k = page as usize;
        let painting = &PAINTINGS[k];
        let half = half_height(painting);
        let local_x = world_x - (page - light.page_shift);
        if local_x.abs() > 0.5 || world_y.abs() > half {
            return VOID_Z;
        }
        let u = (local_x + 0.5).max(0.0).min(0.999999);
        let v = (world_y / (half * 2.0) + 0.5).max(0.0).min(0.999999);
        let (w, h) = (painting.meta.0 as usize, painting.meta.1 as usize);
        let x = (u * w as f64).floor() as usize;
        let y = (v * h as f64).floor() as usize;
        let depth = fields
            .get(k)
            .and_then(|f| f.get((y * w + x) * 4 + 3))
            .map_or(0.0, |&b| decode_half(b));
        SURFACE_FAR_Z * (1.0 - depth)
    };

    let over = js_round(light.page_shift)
        .min((PAINTINGS.len() - 1) as f64)
        .max(0.0) as usize;
    if !PAINTINGS[over].occlude_bulb {
        return 1.0;
    }
    let radius =
        BULB_WORLD_RADIUS * ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - light.z));
    let mut open = 0.0;
    for y in -1..=1 {
        for x in -1..=1 {
            let clearance = light.z
                - depth_at(
                    light.x + x as f64 * radius * BULB_SAMPLE_SPREAD,
                    light.y + y as f64 * radius * BULB_SAMPLE_SPREAD,
                );
            let t = (clearance / BULB_SOURCE_SOFTNESS).max(0.0).min(1.0);
            open += t * t * (3.0 - 2.0 * t);
        }
    }
    open / 9.0
}

/// restCord: the whole cord straight down from the anchor.
fn rest_cord(light: &mut LightState, anchor_y: f64) {
    light.cord_length = CORD_REST_Y - anchor_y;
    let last = light.cord.len() - 1;
    for i in 0..=last {
        let node = &mut light.cord[i];
        node.x = CORD_ANCHOR_X;
        node.y = anchor_y + light.cord_length * (i as f64 / last as f64);
        node.previous_x = node.x;
        node.previous_y = node.y;
    }
    light.x = CORD_ANCHOR_X;
    light.y = anchor_y + light.cord_length;
    light.target_x = light.x;
    light.target_y = light.y;
}

/// integrateCord: one fixed slice.
fn integrate_cord(light: &mut LightState, settings: &LightSettings, step: f64, anchor_y: f64) {
    if !light.paid_out {
        rest_cord(light, anchor_y);
        return;
    }
    if light.held {
        let follow = 1.0 - (-DRAG_FOLLOW * step).exp();
        light.x += (light.target_x - light.x) * follow;
        light.y += (light.target_y - light.y) * follow;
    }
    if !settings.tethered {
        return;
    }
    let last = light.cord.len() - 1;
    let segment = light.cord_length / last as f64;
    let drag = (-PENDULUM_DAMPING * step).exp();
    let fall = PENDULUM_GRAVITY * step * step;
    let (held, lx, ly) = (light.held, light.x, light.y);
    let cord = &mut light.cord;
    for (i, node) in cord.iter_mut().enumerate().skip(1) {
        if i == last && held {
            node.previous_x = node.x;
            node.previous_y = node.y;
            node.x = lx;
            node.y = ly;
            continue;
        }
        let velocity_x = (node.x - node.previous_x) * drag;
        let velocity_y = (node.y - node.previous_y) * drag;
        node.previous_x = node.x;
        node.previous_y = node.y;
        node.x += velocity_x;
        node.y += velocity_y + fall;
    }
    cord[0].x = CORD_ANCHOR_X;
    cord[0].y = anchor_y;

    for _ in 0..CORD_ITERATIONS {
        for i in 0..last {
            let dx = cord[i + 1].x - cord[i].x;
            let dy = cord[i + 1].y - cord[i].y;
            let distance = hypot_or(dx, dy);
            let head_weight = if i == 0 { 0.0 } else { 1.0 };
            let tail_weight = if i + 1 == last {
                if held {
                    0.0
                } else {
                    1.0 / BULB_MASS
                }
            } else {
                1.0
            };
            let total = head_weight + tail_weight;
            if total == 0.0 {
                continue;
            }
            let correction = (distance - segment) / distance / total;
            let shift_x = dx * correction;
            let shift_y = dy * correction;
            cord[i].x += shift_x * head_weight;
            cord[i].y += shift_y * head_weight;
            cord[i + 1].x -= shift_x * tail_weight;
            cord[i + 1].y -= shift_y * tail_weight;
        }
        for i in 1..last {
            let (px, py, nx, ny) = (cord[i - 1].x, cord[i - 1].y, cord[i + 1].x, cord[i + 1].y);
            let node = &mut cord[i];
            node.x += ((px + nx) / 2.0 - node.x) * CORD_STIFFNESS;
            node.y += ((py + ny) / 2.0 - node.y) * CORD_STIFFNESS;
        }
    }
    light.x = cord[last].x;
    light.y = cord[last].y;
}

/// advanceLight: one rendered frame.
fn advance_light(
    light: &mut LightState,
    settings: &LightSettings,
    delta_seconds: f64,
    anchor_y: f64,
) {
    let frame = delta_seconds.min(1.0 / 15.0);
    light.z += (light.target_z - light.z) * (frame * 10.0).min(1.0);
    if !light.paging {
        let settle = 1.0 - (-PAGE_SETTLE_RATE * frame).exp();
        let remaining = light.page_target - light.page_shift;
        light.page_shift = if remaining.abs() < 0.0005 {
            light.page_target
        } else {
            light.page_shift + remaining * settle
        };
    }
    light.carry += frame;
    let mut slices = 0;
    while light.carry >= PHYSICS_STEP && slices < PHYSICS_MAX_STEPS {
        integrate_cord(light, settings, PHYSICS_STEP, anchor_y);
        light.carry -= PHYSICS_STEP;
        slices += 1;
    }
    if slices == PHYSICS_MAX_STEPS {
        light.carry = 0.0;
    }
}

// --- the surface ------------------------------------------------------------------------------

/// The demo's surface. Inputs: showBulb, showCord, relight, showDepth (the sheet's switches).
pub fn surface() -> Box<dyn Surface> {
    Box::new(LightOnPainting {
        light: LightState::default(),
        settings: LightSettings::default(),
        touch: (0.0, 0.0, 0.0),
        last_tap: 0.0,
        pinch_start: 0.0,
        release_velocity: 0.0,
        // minDistance(0): custom criteria, activating at the first move (RNPanHandler's
        // minimumNumberOfTouches 20 holds it at touch-down).
        pan: PanGesture::new().min_distance(f32::MIN_POSITIVE),
        pinch: PinchGesture::default(),
        layout: (1.0, 1.0),
        previous_ms: None,
        fields: Vec::new(),
        words: [0.0; 64],
        presented: None,
        dots_at: None,
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        gpu: None,
    })
}

struct LightOnPainting {
    light: LightState,
    settings: LightSettings,
    /// `touch` (where and when the finger landed), `lastTap`, `pinchStart`, `releaseVelocity`.
    touch: (f64, f64, f64),
    last_tap: f64,
    pinch_start: f64,
    release_velocity: f64,
    pan: PanGesture,
    pinch: PinchGesture,
    /// The container's onLayout, points.
    layout: (f64, f64),
    /// The frame loop's `previous`; None until it runs, or after it went idle.
    previous_ms: Option<f64>,
    /// The depth fields (half bits), for bulbExposure.
    fields: Vec<Vec<u16>>,
    /// The uniform words the relit layer holds, and the paginator's pageShift.
    words: [f32; 64],
    presented: Option<[u32; 64]>,
    dots_at: Option<(f64, u32, u32)>,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
    gpu: Option<Gpu>,
}

impl Default for LightSettings {
    fn default() -> Self {
        LightSettings::of(true, true, true, false)
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    relight: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    params: wgpu::Buffer,
    compose_uniforms: wgpu::Buffer,
    relight_bind: wgpu::BindGroup,
    sampler: wgpu::Sampler,
    /// The relit layer (RN's raster) and the paginator's (device pixels), with their sizes.
    layers: Option<Layers>,
}

struct Layers {
    raster: (u32, u32),
    pixels: (u32, u32),
    painting: wgpu::TextureView,
    dots: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

impl LightOnPainting {
    /// onBegin.
    fn pan_begin(&mut self, x: f64, y: f64, at_ms: f64) {
        self.touch = (x, y, at_ms);
        let (width, height) = self.layout;
        let scale = width * PAINTING_WIDTH_RATIO;
        let state = &mut self.light;
        let bulb_x = width * 0.5 + state.x * scale;
        let bulb_y = height * PAINTING_CENTER_Y + state.y * scale;
        if (bulb_x - x).hypot(bulb_y - y) <= LIGHT_GRAB_RADIUS {
            state.grab_x = state.x - (x - width * 0.5) / scale;
            state.grab_y = state.y - (y - height * PAINTING_CENTER_Y) / scale;
            state.target_x = state.x;
            state.target_y = state.y;
            state.paid_out = true;
            state.grabbed = true;
            state.held = true;
            return;
        }
        state.grabbed = false;
        state.page_start = state.page_shift;
        state.paging = true;
    }

    /// onUpdate.
    fn pan_update(&mut self, x: f64, y: f64, translation_x: f64) {
        let (width, height) = self.layout;
        let scale = width * PAINTING_WIDTH_RATIO;
        let tethered = self.settings.tethered;
        let state = &mut self.light;
        if !state.grabbed {
            let last = (PAINTINGS.len() - 1) as f64;
            let raw = state.page_start - translation_x / width;
            state.page_shift = if raw < 0.0 {
                raw * 0.35
            } else if raw > last {
                last + (raw - last) * 0.35
            } else {
                raw
            };
            return;
        }
        let next_x = (x - width * 0.5) / scale + state.grab_x;
        let next_y = (y - height * PAINTING_CENTER_Y) / scale + state.grab_y;
        if !tethered {
            state.target_x = next_x;
            state.target_y = next_y;
            return;
        }
        let anchor_y = cord_anchor_y(height / width);
        let dx = next_x - CORD_ANCHOR_X;
        let dy = next_y - anchor_y;
        let distance = hypot_or(dx, dy);
        state.cord_length = CORD_MAX_LENGTH.min(CORD_MIN_LENGTH.max(distance));
        state.target_x = CORD_ANCHOR_X + (dx / distance) * state.cord_length;
        state.target_y = anchor_y + (dy / distance) * state.cord_length;
    }

    /// onFinalize.
    fn pan_finalize(&mut self, translation_x: f64, translation_y: f64, at_ms: f64) {
        let travelled = translation_x.hypot(translation_y);
        if travelled < TAP_SLOP && at_ms - self.touch.2 < TAP_DURATION {
            if at_ms - self.last_tap < TAP_GAP {
                self.last_tap = 0.0;
                self.posted.push("settings".into());
            } else {
                self.last_tap = at_ms;
            }
        }
        let state = &mut self.light;
        if state.paging {
            let moved = state.page_shift - state.page_start;
            let velocity = self.release_velocity;
            let flicked = velocity.abs() > PAGE_FLICK_VELOCITY;
            let direction = if flicked {
                if velocity < 0.0 {
                    1.0
                } else {
                    -1.0
                }
            } else {
                js_sign(moved)
            };
            let committed = if flicked || moved.abs() > PAGE_COMMIT_FRACTION {
                state.page_start + direction
            } else {
                state.page_start
            };
            state.page_target = js_round(committed)
                .min((PAINTINGS.len() - 1) as f64)
                .max(0.0);
            state.paging = false;
        }
        self.release_velocity = 0.0;
        state.grabbed = false;
        state.held = false;
    }

    /// startFrameLoop's floats[0..63] for this frame (`raster`: the canvas's pixels).
    fn pack(&mut self, raster: (u32, u32)) {
        let light = &self.light;
        let settings = &self.settings;
        let (bw, bh) = (raster.0 as f64, raster.1 as f64);
        let painting_width_px = bw * PAINTING_WIDTH_RATIO;
        let anchor_y = cord_anchor_y(bh / bw);
        let n = PAINTINGS.len();
        let base = (light.page_shift.floor().min((n - 2) as f64)).max(0.0) as usize;
        let next = &PAINTINGS[(base + 1).min(n - 1)];
        let exposure = bulb_exposure(light, &self.fields);
        let f = &mut self.words;
        f[0] = LIGHT_COLOR[0] as f32;
        f[1] = LIGHT_COLOR[1] as f32;
        f[2] = LIGHT_COLOR[2] as f32;
        f[3] = 1.0;
        f[4] = (bw / painting_width_px) as f32;
        f[5] = (bh / painting_width_px) as f32;
        f[6] = 0.5;
        f[7] = PAINTING_CENTER_Y as f32;
        f[8] = 0.5;
        f[9] = half_height(&PAINTINGS[base]) as f32;
        f[10] = 0.5;
        f[11] = half_height(next) as f32;
        f[12] = light.x as f32;
        f[13] = light.y as f32;
        f[14] = CORD_ANCHOR_X as f32;
        f[15] = anchor_y as f32;
        f[16] = light.z as f32;
        f[17] = settings.intensity as f32;
        f[18] = EXPOSURE as f32;
        f[19] = RELIEF as f32;
        f[20] = SPECULAR as f32;
        f[21] = SHADOW as f32;
        f[22] = OCCLUSION as f32;
        f[23] = SURFACE_FAR_Z as f32;
        f[24] = settings.mode as f32;
        f[25] = settings.cord_opacity as f32;
        f[26] = LIGHT_REACH as f32;
        f[27] = SHADOW_LIFT as f32;
        f[28] = light.page_shift as f32;
        f[29] = base as f32;
        f[30] = n as f32;
        f[31] = if PAINTINGS[base].occlude_bulb {
            1.0
        } else {
            0.0
        };
        f[32] = settings.bulb_opacity as f32;
        f[33] = exposure as f32;
        f[34] = if next.occlude_bulb { 1.0 } else { 0.0 };
        f[35] = 0.0;
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        );
        for (i, node) in light.cord.iter().enumerate() {
            f[40 + i * 2] = node.x as f32;
            f[41 + i * 2] = node.y as f32;
            min_x = min_x.min(node.x);
            min_y = min_y.min(node.y);
            max_x = max_x.max(node.x);
            max_y = max_y.max(node.y);
        }
        f[36] = min_x as f32;
        f[37] = min_y as f32;
        f[38] = max_x as f32;
        f[39] = max_y as f32;
    }

    /// The Paginator's dots (paginator.tsx), each `(x, y, w, h, opacity)` in points on Yoga's
    /// device-pixel grid.
    fn dots(&self, width: f64, height: f64, px: f64) -> [(f32, f32, f32, f32, f32); 2] {
        let snap = |v: f64| (v * px).round() / px;
        let look = |index: usize| {
            let progress = (self.light.page_shift - (index as f64 - 1.0))
                .min(2.0)
                .max(0.0);
            if progress <= 1.0 {
                (
                    DOT_SIZE + (DOT_ACTIVE_WIDTH - DOT_SIZE) * progress,
                    0.3 + 0.7 * progress,
                )
            } else {
                (
                    DOT_ACTIVE_WIDTH - (DOT_ACTIVE_WIDTH - DOT_SIZE) * (progress - 1.0),
                    1.0 - 0.7 * (progress - 1.0),
                )
            }
        };
        let (a, b) = (look(0), look(1));
        // styles.container: absolute, left 0, right 0, bottom 60; row, centred, gap 8. Its
        // height is its tallest child's (6), so the dots' top is height − 60 − 6.
        let top = height - PAGINATOR_BOTTOM - DOT_SIZE;
        let left = (width - (a.0 + DOT_SPACING + b.0)) / 2.0;
        let mut out = [(0.0, 0.0, 0.0, 0.0, 0.0); 2];
        for (k, (x, (w, o))) in [(left, a), (left + a.0 + DOT_SPACING, b)]
            .into_iter()
            .enumerate()
        {
            let (l, t) = (snap(x), snap(top));
            out[k] = (
                l as f32,
                t as f32,
                (snap(x + w) - l) as f32,
                (snap(top + DOT_SIZE) - t) as f32,
                o as f32,
            );
        }
        out
    }
}

impl Surface for LightOnPainting {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let flag =
            |k: usize, default: bool| inputs.get(k).and_then(|v| v.as_bool()).unwrap_or(default);
        self.settings =
            LightSettings::of(flag(0, true), flag(1, true), flag(2, true), flag(3, false));
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        let phase = gfx::phase(phase);
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Begin { x, y } => self.pan_begin(x as f64, y as f64, at_ms),
            // RNGH sends the activation's state change (onStart) and an update (onUpdate).
            Event::Start(p) | Event::Update(p) => {
                self.pan_update(p.x as f64, p.y as f64, p.translation_x as f64)
            }
            Event::End(p) => {
                self.release_velocity = p.velocity_x as f64;
                self.pan_finalize(p.translation_x as f64, p.translation_y as f64, at_ms);
            }
            Event::Fail => self.pan_finalize(0.0, 0.0, at_ms),
            _ => {}
        }
        match self.pinch.event(id, phase, x, y, true) {
            PinchEvent::Start(p) => {
                self.pinch_start = self.light.target_z;
                self.light.target_z =
                    LIGHT_Z_MAX.min(LIGHT_Z_MIN.max(self.pinch_start * p.scale as f64));
            }
            PinchEvent::Update(p) => {
                self.light.target_z =
                    LIGHT_Z_MAX.min(LIGHT_Z_MIN.max(self.pinch_start * p.scale as f64));
            }
            _ => {}
        }
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let l = &self.light;
        Some(format!(
            "{{\"x\":{},\"y\":{},\"z\":{},\"targetZ\":{},\"pageShift\":{},\"pageTarget\":{},\"grabbed\":{},\"held\":{},\"paidOut\":{},\"mode\":{},\"tethered\":{},\"touching\":{}}}",
            l.x,
            l.y,
            l.z,
            l.target_z,
            l.page_shift,
            l.page_target,
            l.grabbed,
            l.held,
            l.paid_out,
            self.settings.mode,
            self.settings.tethered,
            self.pan.tracking() || self.pinch.tracking()
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
        self.layout = (frame.width as f64, frame.height as f64);
        let pixels = frame.pixels();
        // canvas.width = clientWidth × min(PixelRatio, 2).
        let ratio = frame.scale.min(MAX_PIXEL_RATIO);
        let raster = (
            ((frame.width * ratio).round() as u32).max(1),
            ((frame.height * ratio).round() as u32).max(1),
        );

        if self.gpu.as_ref().map(|g| (g.format, g.generation))
            != Some((format, frame.shader_generation))
        {
            let first = self.gpu.is_none();
            self.gpu = Some(build(device, queue, format, frame.shader_generation));
            if first || self.fields.is_empty() {
                self.fields = PAINTINGS.iter().map(surface_halfs).collect();
            }
            self.presented = None;
            self.dots_at = None;
        }

        // The frame loop: Date.now() deltas; after an idle stretch (RN's loop never stops), one
        // display frame.
        let period = if frame.period_ms > 0.0 {
            frame.period_ms
        } else {
            1000.0 / 60.0
        };
        let previous = self.previous_ms.unwrap_or(frame.now_ms - period);
        let anchor_y = cord_anchor_y(raster.1 as f64 / raster.0 as f64);
        let settings = self.settings;
        advance_light(
            &mut self.light,
            &settings,
            ((frame.now_ms - previous) / 1000.0).max(0.0),
            anchor_y,
        );
        self.previous_ms = Some(frame.now_ms);
        self.pack(raster);
        let dots = self.dots(frame.width as f64, frame.height as f64, frame.scale as f64);

        let gpu = self.gpu.as_mut().unwrap();
        if gpu.layers.as_ref().map(|l| (l.raster, l.pixels)) != Some((raster, pixels)) {
            let painting = skia::render::sampled_target(
                device,
                "light on painting relit",
                LAYER_FORMAT,
                raster.0,
                raster.1,
            );
            let dots = skia::render::sampled_target(
                device,
                "light on painting dots",
                LAYER_FORMAT,
                pixels.0,
                pixels.1,
            );
            let layout = device.create_bind_group_layout(&compose::GROUP_0);
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("light on painting compose"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: compose::U.binding,
                        resource: gpu.compose_uniforms.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: compose::PAINTING.binding,
                        resource: wgpu::BindingResource::TextureView(&painting),
                    },
                    wgpu::BindGroupEntry {
                        binding: compose::DOTS.binding,
                        resource: wgpu::BindingResource::TextureView(&dots),
                    },
                    wgpu::BindGroupEntry {
                        binding: compose::SMP.binding,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                ],
            });
            gpu.layers = Some(Layers {
                raster,
                pixels,
                painting,
                dots,
                bind,
            });
            self.presented = None;
            self.dots_at = None;
        }
        let layers = gpu.layers.as_ref().unwrap();

        // The relit layer, only when its uniforms changed (startFrameLoop's presentedWords).
        let bits: [u32; 64] = std::array::from_fn(|i| self.words[i].to_bits());
        let changed = self.presented != Some(bits);
        if changed {
            let mut bytes = [0u8; 256];
            for (chunk, w) in bytes.chunks_exact_mut(4).zip(self.words.iter()) {
                chunk.copy_from_slice(&w.to_le_bytes());
            }
            queue.write_buffer(&gpu.params, 0, &bytes);
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("light on painting relight"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &layers.painting,
                    resolve_target: None,
                    depth_slice: None,
                    // colorAttachment.clearValue: opaque black.
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.relight);
            pass.set_bind_group(0, &gpu.relight_bind, &[]);
            pass.draw(0..3, 0..1);
            drop(pass);
            self.presented = Some(bits);
        }

        // The Paginator, when scrollX moved.
        let dots_key = (self.light.page_shift, pixels.0, pixels.1);
        if self.dots_at != Some(dots_key) {
            self.canvas.begin(frame.scale);
            for (x, y, w, h, o) in dots {
                // backgroundColor white, borderRadius DOT_SIZE / 2, borderCurve continuous.
                self.canvas.draw_continuous_rrect(
                    x,
                    y,
                    w,
                    h,
                    (DOT_SIZE / 2.0) as f32,
                    &Paint::fill(Color::WHITE.alpha(o)),
                );
            }
            self.renderer.draw(
                device,
                queue,
                encoder,
                &self.canvas,
                &layers.dots,
                LAYER_FORMAT,
                pixels.0,
                pixels.1,
                wgpu::Color::TRANSPARENT,
            );
            self.dots_at = Some(dots_key);
        }

        let same = if raster == pixels { 1.0 } else { 0.0 };
        let c = compose::Uniforms {
            canvas: [
                pixels.0 as f32,
                pixels.1 as f32,
                gfx::srgb_flag(format),
                same,
            ],
        };
        queue.write_buffer(&gpu.compose_uniforms, 0, &c.bytes());
        gfx::pass(
            encoder,
            "light on painting compose",
            target,
            &gpu.compose,
            &layers.bind,
        );

        let touching = self.pan.tracking() || self.pinch.tracking();
        if !changed && !touching {
            // Nothing moved: the loop rests until a touch or a setting wakes it.
            self.previous_ms = None;
            return false;
        }
        true
    }
}

fn texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    format: wgpu::TextureFormat,
    (w, h): (u32, u32),
    bytes: &[u8],
    texel: u32,
) -> wgpu::TextureView {
    let size = wgpu::Extent3d {
        width: w,
        height: h,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        bytes,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(w * texel),
            rows_per_image: Some(h),
        },
        size,
    );
    texture.create_view(&Default::default())
}

fn build(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    format: wgpu::TextureFormat,
    generation: u32,
) -> Gpu {
    let module = device.create_shader_module(relight::module());
    let layout = device.create_bind_group_layout(&relight::GROUP_0);
    let relight_pipeline = gfx::fullscreen(
        device,
        LAYER_FORMAT,
        &module,
        &layout,
        relight::entry::VS,
        relight::entry::FS,
        None,
        "light on painting relight",
    );
    let compose_module = device.create_shader_module(compose::module());
    let compose_layout = device.create_bind_group_layout(&compose::GROUP_0);
    let compose_pipeline = gfx::fullscreen(
        device,
        format,
        &compose_module,
        &compose_layout,
        compose::entry::VS,
        compose::entry::COMPOSE,
        None,
        "light on painting compose",
    );
    let buffer = |label, size| {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(label),
            size,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    };
    let params = buffer("light on painting params", 256);
    let compose_uniforms = buffer("light on painting compose", compose::Uniforms::SIZE as u64);
    // The textures: albedo rgba8unorm, surface rgba16float (createTexture / writeTexture).
    let mut albedo = Vec::new();
    let mut surface = Vec::new();
    for p in &PAINTINGS {
        albedo.push(texture(
            device,
            queue,
            "light on painting albedo",
            wgpu::TextureFormat::Rgba8Unorm,
            p.albedo_size,
            &albedo_texels(p),
            4,
        ));
        let halfs = surface_halfs(p);
        let mut bytes = Vec::with_capacity(halfs.len() * 2);
        for h in &halfs {
            bytes.extend_from_slice(&h.to_le_bytes());
        }
        surface.push(texture(
            device,
            queue,
            "light on painting surface",
            wgpu::TextureFormat::Rgba16Float,
            p.meta,
            &bytes,
            8,
        ));
    }
    // magFilter / minFilter linear, clamp-to-edge.
    let sampler = gfx::linear_sampler(device, "light on painting");
    // The one pairing two paintings have: slot A the first, slot B the second.
    let relight_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("light on painting relight"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: relight::PARAMS.binding,
                resource: params.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: relight::ALBEDO_A.binding,
                resource: wgpu::BindingResource::TextureView(&albedo[0]),
            },
            wgpu::BindGroupEntry {
                binding: relight::SURFACE_A.binding,
                resource: wgpu::BindingResource::TextureView(&surface[0]),
            },
            wgpu::BindGroupEntry {
                binding: relight::ALBEDO_B.binding,
                resource: wgpu::BindingResource::TextureView(&albedo[1]),
            },
            wgpu::BindGroupEntry {
                binding: relight::SURFACE_B.binding,
                resource: wgpu::BindingResource::TextureView(&surface[1]),
            },
            wgpu::BindGroupEntry {
                binding: relight::TEX_SAMPLER.binding,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    Gpu {
        format,
        generation,
        relight: relight_pipeline,
        compose: compose_pipeline,
        params,
        compose_uniforms,
        relight_bind,
        sampler,
        layers: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 912.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 1000.0 / 60.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    fn fnv(bytes: impl IntoIterator<Item = u8>) -> u64 {
        bytes.into_iter().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
            (h ^ b as u64).wrapping_mul(0x0100_0000_01b3)
        })
    }

    #[test]
    fn the_bundled_pixels_are_rns() {
        // exact/parity-tools/light-on-painting-assets.py: libjpeg-turbo's RGB, the .bin's bytes.
        let rgb = |p: &Painting| {
            albedo_texels(p)
                .chunks_exact(4)
                .flat_map(|t| [t[0], t[1], t[2]])
                .collect::<Vec<u8>>()
        };
        let bin = |p: &Painting| {
            surface_halfs(p)
                .iter()
                .flat_map(|h| h.to_le_bytes())
                .collect::<Vec<u8>>()
        };
        assert_eq!(fnv(rgb(&PAINTINGS[0])), 0x8881b7b4cf5b7b38);
        assert_eq!(fnv(bin(&PAINTINGS[0])), 0x22c7be4d7e3fd743);
        assert_eq!(fnv(rgb(&PAINTINGS[1])), 0x0f406687b2467d3a);
        assert_eq!(fnv(bin(&PAINTINGS[1])), 0x78a2cd4227646964);
        assert_eq!(decode_half(0x3c00), 1.0);
        assert_eq!(decode_half(0xc000), -2.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_sign(0.0), 0.0);
    }

    #[test]
    fn the_bulb_hangs_relights_the_painting_and_pages() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let lum = |p: [u8; 4]| p[0] as u32 + p[1] as u32 + p[2] as u32;
        let mut s = surface();
        let (a, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        a.save("light-on-painting-rest");
        // W 420, H 912: anchorY −0.5 × 912 / 420 − 0.02; the bulb rests at y −0.25: (210, 351).
        let reply = s.agent("{}").unwrap();
        assert!(
            reply.contains("\"x\":0,") && reply.contains("\"y\":-0.25"),
            "{reply}"
        );
        // The bulb's glass is hot white; the cord above it is lit against black.
        assert!(lum(a.at(210, 351)) > 700, "{:?}", a.at(210, 351));
        assert!(
            lum(a.at(210, 120)) > lum(a.at(240, 120)) + 30,
            "{:?} {:?}",
            a.at(210, 120),
            a.at(240, 120)
        );
        // The girl spans 2 × 0.592 × 420 = 497 pt about the centre (207.3 to 704.7): black above
        // and below, away from the bulb's halo.
        assert!(lum(a.at(5, 905)) < 12, "{:?}", a.at(5, 905));
        assert!(
            lum(a.at(5, 220)) > lum(a.at(5, 200)),
            "{:?} {:?}",
            a.at(5, 220),
            a.at(5, 200)
        );
        // Lit by the bulb: the painting is brighter near it than at its far corner.
        let near = (180..240)
            .step_by(4)
            .map(|x| lum(a.at(x, 420)))
            .sum::<u32>();
        let far = (180..240)
            .step_by(4)
            .map(|x| lum(a.at(x, 690)))
            .sum::<u32>();
        assert!(near > far, "{near} {far}");
        // The paginator: dot 0 16 wide at x 195..211 (opacity 1), dot 1 6 wide at 219..225 (0.3),
        // y 846..852.
        assert!(lum(a.at(203, 849)) > 760, "{:?}", a.at(203, 849));
        let d1 = a.at(222, 849);
        assert!(d1[0] > 70 && d1[0] < 90, "{d1:?}");
        assert!(lum(a.at(214, 849)) < 12);

        // Grab the bulb and carry it to the lower left: the light follows.
        let p = |phase, x: f32, y: f32, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        };
        s.input(&p(PointerPhase::Down, 212.0, 355.0, 20.0));
        let mut t = 20.0;
        for k in 1..=20 {
            t += 16.0;
            s.input(&p(
                PointerPhase::Move,
                212.0 - k as f32 * 6.0,
                355.0 + k as f32 * 12.0,
                t,
            ));
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        for _ in 0..20 {
            t += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(t + 16.0)).unwrap();
        b.save("light-on-painting-carried");
        let reply = s.agent("{}").unwrap();
        assert!(
            reply.contains("\"held\":true") && reply.contains("\"paidOut\":true"),
            "{reply}"
        );
        // The bulb is at about (92, 595) now; the painting there brightened, at the old spot dimmed.
        assert!(lum(b.at(92, 595)) > 700, "{:?}", b.at(92, 595));
        let around = |img: &fixture::Pixels, cx: u32, cy: u32| {
            (0..9)
                .map(|k| lum(img.at(cx - 40 + k * 10, cy - 40)))
                .sum::<u32>()
        };
        assert!(
            around(&b, 92, 595) > around(&a, 92, 595) + 200,
            "{} {}",
            around(&b, 92, 595),
            around(&a, 92, 595)
        );
        assert!(
            around(&b, 250, 430) < around(&a, 250, 430),
            "{} {}",
            around(&b, 250, 430),
            around(&a, 250, 430)
        );
        // Let go: it swings back towards the bottom of its arc.
        s.input(&p(PointerPhase::Up, 92.0, 595.0, t + 20.0));
        for _ in 0..30 {
            t += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let reply = s.agent("{}").unwrap();
        let x: f64 = reply
            .split("\"x\":")
            .nth(1)
            .unwrap()
            .split(',')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert!(x > -0.28 + 0.02, "{reply}");

        // A swipe left elsewhere pages to Nighthawks (half height 0.273: 341.5 to 570.5).
        t += 400.0;
        s.input(&p(PointerPhase::Down, 380.0, 800.0, t));
        for k in 1..=10 {
            t += 16.0;
            s.input(&p(PointerPhase::Move, 380.0 - k as f32 * 20.0, 800.0, t));
        }
        s.input(&p(PointerPhase::Up, 180.0, 800.0, t + 16.0));
        for _ in 0..120 {
            t += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
        }
        let (c, _) = fixture::render(&gpu, s.as_mut(), &frame(t + 16.0)).unwrap();
        c.save("light-on-painting-nighthawks");
        assert!(s.agent("{}").unwrap().contains("\"pageShift\":1,"));
        assert!(lum(c.at(400, 250)) < 12, "{:?}", c.at(400, 250));
        assert!(lum(c.at(400, 500)) > 12, "{:?}", c.at(400, 500));
        // The dots swapped: dot 1 is the long one (209..225).
        assert!(lum(c.at(217, 849)) > 760, "{:?}", c.at(217, 849));

        // The shader off: the painting as scanned (relight false: ALBEDO).
        s.bind(
            &[
                Value::Bool(true),
                Value::Bool(true),
                Value::Bool(false),
                Value::Bool(false),
            ],
            None,
        )
        .unwrap();
        let (d, _) = fixture::render(&gpu, s.as_mut(), &frame(t + 32.0)).unwrap();
        d.save("light-on-painting-albedo");
        assert!(lum(d.at(400, 250)) == 0, "{:?}", d.at(400, 250));

        // A double tap asks for the sheet.
        t += 1000.0;
        for k in 0..2 {
            let at = t + k as f64 * 150.0;
            s.input(&p(PointerPhase::Down, 300.0, 750.0, at));
            s.input(&p(PointerPhase::Up, 300.0, 750.0, at + 60.0));
        }
        assert_eq!(s.messages(), vec!["settings".to_string()]);
    }
}
