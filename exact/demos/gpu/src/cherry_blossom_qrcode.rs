//! Cherry Blossom QR Code (src/animations/cherry-blossom-qrcode: cherry-blossom-qr-code.tsx,
//! constants.ts, types.ts, haptics.ts, utils/{block-generator, creeper-model, qr-matrix,
//! approach}.ts, hooks/use-web-gpu.ts, shaders/*.ts): the QR code of the field's text built as a
//! voxel cherry tree (light modules dirt, dark ones trunk, blossom, fallen petals or grass),
//! drawn with react-native-webgpu in an isometric view. A tap folds it flat for scanning (and
//! back); a long press spawns a creeper that walks in, fuses, blows the tree apart and lets it
//! reassemble.
//!
//! This surface is the Pressable and its WebGPU Canvas (W × 0.6 H, at the top of canvasWrapper,
//! paddingTop 10 % of the width): use-web-gpu.ts line for line: the block buffers
//! (generateBlockData over generateQRMatrix, QRCode.create(content || DEFAULT, 'M') through
//! `qr::create`, its `modules.get(x, y)` transposed as the RN code reads it), the uniforms word
//! for word, the render loop and its idle skip, the isFlat lerp, the creeper sequence clock and
//! its one `Math.random()` (pickApproachYaw, `gfx::Random` seeded by env.seed). The WGSL is the RN
//! strings with their constants interpolated by the RN code itself
//! (exact/parity-tools/cherry-blossom-qrcode/wgsl.ts → gpu/shaders/cherry_blossom_qrcode.wgsl):
//! sky, shadow (src-alpha blend), blocks (depth24plus, less, written), dust (when blastT ≥ 0),
//! cull none, no MSAA, cleared to transparent black. The CPU numbers (validApproachYaws,
//! approachDestination, generateBlockData's arrays, clampToQRBytes) are checked bit for bit
//! against the app's Hermes (exact/parity-tools/cherry-blossom-qrcode/reference.txt).
//!
//! The canvas: `canvas.width = canvasWidth × PixelRatio`, `canvas.height = canvasHeight ×
//! PixelRatio` (the JSI's int setter truncates), configured bgra8unorm, premultiplied, no
//! colorspace (iOS shows it as sRGB: the shader's output is sRGB as written), aspectRatio =
//! width / height. The scene renders into an 8-bit layer of that raster (blending in encoded
//! values, as the bgra8unorm drawable does); gpu/shaders/cherry_blossom_qrcode_compose.wgsl
//! stretches it over the canvas's device pixels with Core Animation's linear filter (1641 rows
//! over 1642 on a 912 pt phone at 3x), a texel per pixel where the sizes agree.
//!
//! The Pressable (RN 0.88 Pressability, delayPressIn 0, delayLongPress 320, no hitSlop): the
//! responder region is the canvas; a touch inside is PRESS_IN at once; the long-press timer
//! (320 ms from the grant) is cancelled for good by a move of more than 10 pt from the touch's
//! activation point or by leaving the region grown by the press-rect offsets (left / right / top
//! 20, bottom 30, exclusive); back inside, PRESS_IN again. The timer firing in PRESS_IN is
//! onLongPress (LONG_PRESS_IN); a release in PRESS_IN is onPress, in LONG_PRESS_IN or outside
//! nothing; a cancel (the screen's close drag taking the touch) is nothing. One responder: other
//! fingers are ignored.
//! - onPress: isFlat = !isFlat, Presets.System.impactMedium (`haptic:impact-medium`), focus the
//!   field (`focus`).
//! - onLongPress: detonate(), ignored while a creeper is on its way (returns false: no haptic, no
//!   hint fade); else Presets.System.impactLight (`haptic:impact-light`) and the hint's fade
//!   (`spawned`).
//!
//! What the Contract does for this surface (cherry-blossom-qrcode.contract), from its messages:
//! the field's first focus INITIAL_FOCUS_DELAY_MS (120) after the first frame (`focus`), the
//! hint's fade-in HINT_DELAY_MS (2000) after it (`hint`), the field's text clamped to
//! MAX_QR_CONTENT_BYTES (`text:<clamped>`, when clampToQRBytes changes what was typed), and the
//! haptics (`haptic:<kind>`).
//!
//! Motion audit (RN driver / config → here):
//!
//! | value | RN | Exact |
//! |---|---|---|
//! | rawProgress | per rAF: dt = min(Δ Date.now() / 1000, 0.05); raw += (target − raw) × min(1, LERP_SPEED 4 × dt); snapped under 0.001; target isFlat ? 1 : 0 | the same per host frame (dt from the frame clock; after a rest the first dt is one display period, as RN's loop keeps lastFrameTime current while it skips) |
//! | progress | easeInOutCubic(raw) | the same (f64, then f32 as the Float32Array) |
//! | camera angles, view scale, 2D offsets | mix(ISO, FLAT, progress) in every vertex shader | the WGSL verbatim |
//! | time | (Date.now() − mount) / 1000 | (now − first frame) / 1000 |
//! | sequence clock | seq = (now − long press) / 1000: creeperT = seq / 3.2 (walk), fuseT = (seq − 3.2) / 1.8, blastT = seq − 5, rebuildT = min((blastT − 2.6) / 1.7, 1), creeperAlpha; reset at 9.3 | the same; the start is the long press's 320 ms timer |
//! | creeper spawn, walk, legs, bob, head, turn, swell, shudder, strobe | blocks vertex/fragment from creeperT, fuseT, time, spawnAngle (CREEPER_* constants) | WGSL verbatim |
//! | debris, shock front, tumble, fade, shake, rebuild stagger, soot, embers, fireball, shadow presence, smoke | blocks / shadow / dust shaders from blastT, rebuildT, time | WGSL verbatim |
//! | spawnAngle | pickApproachYaw: validApproachYaws(gridSize || 25)[floor(Math.random() × n)] | the same, `gfx::Random` (env.seed) |
//! | hint opacity | withDelay(2000, withTiming(1, 650 ms, out(quad))) × 0.72; long press: withTiming(0, 260 ms, inOut(quad)) | Contract: `hint` at 2000 ms → transition to 0.72, 650 ms cubic-bezier(1/3, 2/3, 2/3, 1) (out(quad) exactly); `spawned` → 0, 260 ms inOut(quad) linear() |
//! | hint, input translateY | −keyboardHeight from useKeyboardHandler onMove (the keyboard's frame, per frame) | Contract: a `toolbarPlacement="keyboard"` toolbar under overlays-content: lifted by the keyboard's overlap with a transform set inside the keyboard's own UIView animation (its duration and curve) |
//! | haptics | onPress impactMedium; onLongPress impactLight; fuse start: CREEPER_BLAST_PATTERN | `haptic:impact-medium`, `haptic:impact-light`; each discrete beat of the pattern at its time from the fuse's first frame as one impact (BEATS); its continuous channel has no Exact equivalent |

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, PointerPhase, Surface, SurfaceError, Value};

use crate::{gfx, qr, shaders};
use shaders::cherry_blossom_qrcode::{
    entry, module, Uniforms, BLOCK_BASE_Y, BLOCK_POSITIONS, BLOCK_RESISTANCE, BLOCK_TYPES, GROUP_0,
    UNIFORMS,
};
use shaders::cherry_blossom_qrcode_compose as compose;

// --- constants.ts -----------------------------------------------------------------------------

/// DEFAULT_QR_CONTENT.
const DEFAULT_QR_CONTENT: &str = "https://enzo.fyi";
/// BLOCK_SIZE, CUBE_HEIGHT.
const BLOCK_SIZE: f64 = 0.0245;
const CUBE_HEIGHT: f64 = BLOCK_SIZE;
/// TRUNK_RADIUS, TRUNK_LAYERS, MAX_CANOPY_LAYERS, CANOPY_OUTER_RADIUS_FACTOR.
const TRUNK_RADIUS: f64 = 2.5;
const TRUNK_LAYERS: usize = 12;
const MAX_CANOPY_LAYERS: f64 = 12.0;
const CANOPY_OUTER_RADIUS_FACTOR: f64 = 0.46;
/// MAX_GRID_SIZE, MAX_BLOCKS, MAX_QR_CONTENT_BYTES.
const MAX_GRID_SIZE: usize = 41;
const MAX_BLOCKS: usize = MAX_GRID_SIZE * MAX_GRID_SIZE * 18;
const MAX_QR_CONTENT_BYTES: usize = 106;
/// LERP_SPEED.
const LERP_SPEED: f64 = 4.0;
/// CREEPER_WALK_DURATION, CREEPER_FUSE_DURATION, CREEPER_TOTAL.
const CREEPER_WALK_DURATION: f64 = 3.2;
const CREEPER_FUSE_DURATION: f64 = 1.8;
const CREEPER_TOTAL: f64 = CREEPER_WALK_DURATION + CREEPER_FUSE_DURATION;
/// CREEPER_APPROACH_YAW, CREEPER_APPROACH_SPREAD, CREEPER_SPAWN_MARGIN.
const CREEPER_APPROACH_YAW: f64 = std::f64::consts::PI / 2.0;
const CREEPER_APPROACH_SPREAD: f64 = 0.9;
const CREEPER_SPAWN_MARGIN: f64 = 0.5;
/// CREEPER_STAND_FROM_CENTRE, CREEPER_WALK_BLOCKS, CREEPER_PATH_OFFSET, CREEPER_TRUNK_CLEARANCE.
const CREEPER_STAND_FROM_CENTRE: f64 = 6.0;
const CREEPER_WALK_BLOCKS: f64 = 15.0;
const CREEPER_PATH_OFFSET: f64 = 6.5;
const CREEPER_TRUNK_CLEARANCE: f64 = 4.5;
/// RESISTANCE_BY_TYPE (Dirt, CherryBlossom, Trunk, Grass, FallenPetals, Creeper).
const RESISTANCE_BY_TYPE: [f64; 6] = [0.5, 0.2, 2.0, 0.5, 0.2, 0.0];
/// DEBRIS_SETTLE, REBUILD_DURATION.
const DEBRIS_SETTLE: f64 = 2.6;
const REBUILD_DURATION: f64 = 1.7;
/// use-web-gpu.ts SEQUENCE_DURATION.
const SEQUENCE_DURATION: f64 = CREEPER_TOTAL + DEBRIS_SETTLE + REBUILD_DURATION;

/// types.ts BlockType.
const DIRT: u32 = 0;
const CHERRY_BLOSSOM: u32 = 1;
const TRUNK: u32 = 2;
const GRASS: u32 = 3;
const FALLEN_PETALS: u32 = 4;
const CREEPER: u32 = 5;

// --- cherry-blossom-qr-code.tsx ---------------------------------------------------------------

/// INITIAL_FOCUS_DELAY_MS: the field takes focus this long after the mount.
const INITIAL_FOCUS_DELAY_MS: f64 = 120.0;
/// HINT_DELAY_MS: the hint's withDelay.
const HINT_DELAY_MS: f64 = 2000.0;
/// The Pressable's delayLongPress.
const DELAY_LONG_PRESS_MS: f64 = 320.0;
/// Pressability: DEFAULT_LONG_PRESS_DEACTIVATION_DISTANCE and DEFAULT_PRESS_RECT_OFFSETS
/// (left, right, top, bottom).
const LONG_PRESS_DEACTIVATION_DISTANCE: f64 = 10.0;
const PRESS_RECT: [f64; 4] = [20.0, 20.0, 20.0, 30.0];

/// haptics.ts CREEPER_BLAST_PATTERN's discrete beats (ms from the fuse's start, amplitude,
/// frequency = sharpness) and the impact each is played as: Exact's haptics are UIKit's impact
/// generators at full intensity, so the dull, faint first ticks are light, the crisp ones from
/// sharpness 0.62 rigid, the blast heavy and its two fragments medium and soft.
const BEATS: [(f64, f64, f64, &str); 15] = [
    (0.0, 0.16, 0.4, "haptic:impact-light"),
    (300.0, 0.18, 0.43, "haptic:impact-light"),
    (560.0, 0.2, 0.47, "haptic:impact-light"),
    (790.0, 0.23, 0.51, "haptic:impact-light"),
    (990.0, 0.26, 0.56, "haptic:impact-light"),
    (1160.0, 0.3, 0.62, "haptic:impact-rigid"),
    (1310.0, 0.34, 0.68, "haptic:impact-rigid"),
    (1440.0, 0.39, 0.75, "haptic:impact-rigid"),
    (1550.0, 0.44, 0.82, "haptic:impact-rigid"),
    (1645.0, 0.48, 0.88, "haptic:impact-rigid"),
    (1725.0, 0.52, 0.94, "haptic:impact-rigid"),
    (1790.0, 0.55, 1.0, "haptic:impact-rigid"),
    (
        CREEPER_FUSE_DURATION * 1000.0,
        1.0,
        0.08,
        "haptic:impact-heavy",
    ),
    (
        CREEPER_FUSE_DURATION * 1000.0 + 45.0,
        0.72,
        0.3,
        "haptic:impact-medium",
    ),
    (
        CREEPER_FUSE_DURATION * 1000.0 + 105.0,
        0.5,
        0.5,
        "haptic:impact-soft",
    ),
];

/// The scene's layer, as the bgra8unorm drawable holds it.
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// The depth texture's format (createTexture 'depth24plus').
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;

/// The demo's surface. Inputs: the window's width and height (useWindowDimensions), env.seed,
/// the field's text.
pub fn surface() -> Box<dyn Surface> {
    let blocks = generate_block_data(&generate_qr_matrix(DEFAULT_QR_CONTENT));
    Box::new(CherryBlossomQrcode {
        window: (0.0, 0.0),
        seed: f64::NAN,
        random: gfx::Random::new(0.0),
        text: DEFAULT_QR_CONTENT.to_string(),
        num_blocks: blocks.num_blocks.min(MAX_BLOCKS),
        grid_size: blocks.grid_size,
        blocks,
        buffers_dirty: true,
        is_flat: false,
        raw_progress: 0.0,
        progress: 0.0,
        last_drawn_progress: None,
        last_frame_ms: None,
        start_ms: None,
        sequence_start: None,
        spawn_angle: 0.0,
        blast_pos: (0.0, 0.0),
        detonated: false,
        fuse_started: None,
        beats: 0,
        responder: None,
        focus_posted: false,
        hint_posted: false,
        posted: Vec::new(),
        upload: Vec::new(),
        drawn: None,
        gpu: None,
    })
}

// --- utils/qr-matrix.ts -----------------------------------------------------------------------

/// clampToQRBytes: the longest prefix, whole code points, of at most MAX_QR_CONTENT_BYTES UTF-8
/// bytes.
pub(crate) fn clamp_to_qr_bytes(text: &str) -> &str {
    let mut bytes = 0;
    let mut end = 0;
    for c in text.chars() {
        bytes += c.len_utf8();
        if bytes > MAX_QR_CONTENT_BYTES {
            break;
        }
        end += c.len_utf8();
    }
    &text[..end]
}

/// generateQRMatrix: `matrix[y][x] = modules.get(x, y) === 1` (node-qrcode's get(row, col), so
/// the symbol transposed), level M; the default content when empty, when it throws or when the
/// grid would pass MAX_GRID_SIZE.
pub(crate) fn generate_qr_matrix(content: &str) -> Vec<Vec<bool>> {
    let text = if content.is_empty() {
        DEFAULT_QR_CONTENT
    } else {
        content
    };
    match qr::create(text, qr::Ecl::M) {
        Some(symbol) if symbol.size <= MAX_GRID_SIZE => (0..symbol.size)
            .map(|y| (0..symbol.size).map(|x| symbol.dark(x, y)).collect())
            .collect(),
        _ => generate_qr_matrix(DEFAULT_QR_CONTENT),
    }
}

// --- utils/block-generator.ts, utils/creeper-model.ts -----------------------------------------

/// BlockData, as the JS arrays hold it (doubles) before the upload.
#[derive(Clone, Debug, Default)]
pub(crate) struct Blocks {
    positions: Vec<f64>,
    resistance: Vec<f64>,
    base_y: Vec<f64>,
    types: Vec<u32>,
    grid_size: usize,
    num_blocks: usize,
    creeper_start: usize,
}

/// pseudoRandom.
fn pseudo_random(col: f64, row: f64, seed: f64) -> f64 {
    let s = (col * 127.1 + row * 311.7 + seed * 43.7).sin() * 43758.5;
    s - s.floor()
}

/// generateBlockData: ground, trunk, canopy, then the creeper's shell, in the RN passes' order.
pub(crate) fn generate_block_data(qr_matrix: &[Vec<bool>]) -> Blocks {
    let grid_size = qr_matrix.len();
    let cx = grid_size as f64 / 2.0;
    let cy = grid_size as f64 / 2.0;
    let mut b = Blocks {
        grid_size,
        ..Default::default()
    };
    let canopy_base_height = TRUNK_LAYERS as f64 * CUBE_HEIGHT;
    let canopy_outer_radius = grid_size as f64 * CANOPY_OUTER_RADIUS_FACTOR;
    let push = |b: &mut Blocks, col: usize, row: usize, layer_y: f64, kind: u32| {
        b.positions
            .extend_from_slice(&[col as f64, row as f64, 0.0, 0.0]);
        b.base_y.push(layer_y);
        b.types.push(kind);
        b.resistance.push(RESISTANCE_BY_TYPE[kind as usize]);
        b.num_blocks += 1;
    };
    let dist = |col: usize, row: usize| {
        let dx = col as f64 - cx;
        let dy = row as f64 - cy;
        (dx * dx + dy * dy).sqrt()
    };
    // First pass: ground blocks.
    for row in 0..grid_size {
        for col in 0..grid_size {
            let d = dist(col, row);
            let kind = if !qr_matrix[row][col] {
                DIRT
            } else if d < TRUNK_RADIUS {
                TRUNK
            } else if d >= canopy_outer_radius {
                GRASS
            } else {
                FALLEN_PETALS
            };
            push(&mut b, col, row, 0.0, kind);
        }
    }
    // Second pass: trunk blocks stacked vertically.
    for row in 0..grid_size {
        for col in 0..grid_size {
            if qr_matrix[row][col] && dist(col, row) < TRUNK_RADIUS {
                for layer in 1..TRUNK_LAYERS {
                    push(&mut b, col, row, layer as f64 * CUBE_HEIGHT, TRUNK);
                }
            }
        }
    }
    // Third pass: canopy foliage with dome shape.
    for row in 0..grid_size {
        for col in 0..grid_size {
            if !qr_matrix[row][col] {
                continue;
            }
            let d = dist(col, row);
            if d < canopy_outer_radius {
                let t = 1.0 - d / canopy_outer_radius;
                // Math.round of a positive number: half up.
                let layers_here =
                    3.0f64.max((MAX_CANOPY_LAYERS * (0.25 + 0.75 * t * t)).round()) as usize;
                for layer in 0..layers_here {
                    let layer_y = canopy_base_height + layer as f64 * CUBE_HEIGHT;
                    let dome_offset = (t * 3.0).floor() * CUBE_HEIGHT;
                    push(&mut b, col, row, layer_y + dome_offset, CHERRY_BLOSSOM);
                }
                let extra_count =
                    (pseudo_random(col as f64, row as f64, 500.0) * 4.0).floor() as usize;
                for e in 0..extra_count {
                    let extra_layer = layers_here + e;
                    let dome_offset = (t * 3.0).floor() * CUBE_HEIGHT;
                    push(
                        &mut b,
                        col,
                        row,
                        canopy_base_height + extra_layer as f64 * CUBE_HEIGHT + dome_offset,
                        CHERRY_BLOSSOM,
                    );
                }
            }
        }
    }
    // Fourth pass: the creeper, model-local coords in positions.xy / baseY, its limb in z.
    b.creeper_start = b.num_blocks;
    for (x, y, z, part) in build_creeper_voxels() {
        b.positions
            .extend_from_slice(&[x as f64, z as f64, part as f64, 1.0]);
        b.base_y.push(y as f64 * CUBE_HEIGHT);
        b.types.push(CREEPER);
        b.resistance.push(0.0);
        b.num_blocks += 1;
    }
    b
}

/// creeper-model.ts BOXES: x0, x1, y0, y1, z0, z1, part (Head, Body, the four legs).
const BOXES: [(i32, i32, i32, i32, i32, i32, u32); 6] = [
    (-2, 2, 9, 13, -2, 2, 0),
    (-2, 2, 3, 9, -1, 1, 1),
    (-2, 0, 0, 3, 0, 2, 2),
    (0, 2, 0, 3, 0, 2, 3),
    (-2, 0, 0, 3, -2, 0, 4),
    (0, 2, 0, 3, -2, 0, 5),
];

/// buildCreeperVoxels: every box's voxels (y, z, x order; the first box to claim a cell keeps
/// it), then only those with a face exposed.
fn build_creeper_voxels() -> Vec<(i32, i32, i32, u32)> {
    let mut filled = std::collections::HashSet::new();
    let mut all = Vec::new();
    for &(x0, x1, y0, y1, z0, z1, part) in &BOXES {
        for y in y0..y1 {
            for z in z0..z1 {
                for x in x0..x1 {
                    if filled.insert((x, y, z)) {
                        all.push((x, y, z, part));
                    }
                }
            }
        }
    }
    let has = |x, y, z| filled.contains(&(x, y, z));
    all.into_iter()
        .filter(|&(x, y, z, _)| {
            !has(x + 1, y, z)
                || !has(x - 1, y, z)
                || !has(x, y + 1, z)
                || !has(x, y - 1, z)
                || !has(x, y, z + 1)
                || !has(x, y, z - 1)
        })
        .collect()
}

// --- utils/approach.ts ------------------------------------------------------------------------

/// forwardFor.
fn forward_for(yaw: f64) -> (f64, f64) {
    (-yaw.sin(), yaw.cos())
}

/// approachDestination, in blocks from the centre.
pub(crate) fn approach_destination() -> (f64, f64) {
    let fwd = forward_for(CREEPER_APPROACH_YAW);
    let right = (-fwd.1, fwd.0);
    (
        fwd.0 * CREEPER_STAND_FROM_CENTRE + right.0 * CREEPER_PATH_OFFSET,
        fwd.1 * CREEPER_STAND_FROM_CENTRE + right.1 * CREEPER_PATH_OFFSET,
    )
}

/// spawnFor.
fn spawn_for(yaw: f64) -> (f64, f64) {
    let dest = approach_destination();
    let fwd = forward_for(yaw);
    (
        dest.0 - fwd.0 * CREEPER_WALK_BLOCKS,
        dest.1 - fwd.1 * CREEPER_WALK_BLOCKS,
    )
}

/// trunkClearance.
fn trunk_clearance(yaw: f64) -> f64 {
    let dest = approach_destination();
    let fwd = forward_for(yaw);
    (dest.0 * fwd.1 - dest.1 * fwd.0).abs()
}

/// validApproachYaws(gridSize, 64).
pub(crate) fn valid_approach_yaws(grid_size: f64) -> Vec<f64> {
    let samples = 64;
    let limit = grid_size / 2.0 - CREEPER_SPAWN_MARGIN;
    let mut out = Vec::new();
    for i in 0..samples {
        let yaw = CREEPER_APPROACH_YAW
            + (i as f64 / (samples - 1) as f64 - 0.5) * 2.0 * CREEPER_APPROACH_SPREAD;
        let s = spawn_for(yaw);
        let on_plate = s.0.hypot(s.1) <= limit;
        let clears_trunk = trunk_clearance(yaw) >= CREEPER_TRUNK_CLEARANCE;
        if on_plate && clears_trunk {
            out.push(yaw);
        }
    }
    if out.is_empty() {
        out.push(CREEPER_APPROACH_YAW);
    }
    out
}

/// use-web-gpu.ts easeInOutCubic.
fn ease_in_out_cubic(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

// --- the Pressable ----------------------------------------------------------------------------

/// Pressability's touch states past the grant (delayPressIn 0: the grant is PRESS_IN at once).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Touch {
    PressIn,
    PressOut,
    LongPressIn,
    LongPressOut,
}

#[derive(Clone, Copy, Debug)]
struct Responder {
    id: u32,
    state: Touch,
    /// _touchActivatePosition.
    at: (f64, f64),
    /// When the long-press timeout fires; None once cancelled or fired.
    long_press_at: Option<f64>,
}

// --- the surface ------------------------------------------------------------------------------

struct CherryBlossomQrcode {
    /// useWindowDimensions() (points).
    window: (f64, f64),
    seed: f64,
    random: gfx::Random,
    /// qrContent (clamped).
    text: String,
    blocks: Blocks,
    /// blockDataRef: numBlocks (≤ MAX_BLOCKS), gridSize.
    num_blocks: usize,
    grid_size: usize,
    buffers_dirty: bool,
    is_flat: bool,
    raw_progress: f64,
    progress: f64,
    /// lastDrawnProgress (None: nothing drawn).
    last_drawn_progress: Option<f64>,
    /// lastFrameTimeRef (None after a rest: the next frame takes one display period).
    last_frame_ms: Option<f64>,
    /// startTimeRef (the first frame).
    start_ms: Option<f64>,
    /// sequenceStartRef, spawnAngleRef, blastPosRef, detonatedRef.
    sequence_start: Option<f64>,
    spawn_angle: f64,
    blast_pos: (f64, f64),
    detonated: bool,
    /// fuseStartedRef: when the fuse's first frame was (the pattern's start).
    fuse_started: Option<f64>,
    /// How many of the pattern's beats have been posted.
    beats: usize,
    responder: Option<Responder>,
    focus_posted: bool,
    hint_posted: bool,
    posted: Vec<String>,
    /// The block upload's bytes (reused).
    upload: Vec<u8>,
    /// The uniforms of the layer's image (None: the layer must be drawn).
    drawn: Option<[u32; 16]>,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    sky: wgpu::RenderPipeline,
    shadow: wgpu::RenderPipeline,
    blocks: wgpu::RenderPipeline,
    dust: wgpu::RenderPipeline,
    compose: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    types: wgpu::Buffer,
    positions: wgpu::Buffer,
    resistance: wgpu::Buffer,
    base_y: wgpu::Buffer,
    bind: wgpu::BindGroup,
    compose_uniforms: wgpu::Buffer,
    compose_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    layers: Option<Layers>,
}

struct Layers {
    raster: (u32, u32),
    color: wgpu::TextureView,
    depth: wgpu::TextureView,
    bind: wgpu::BindGroup,
}

/// What one frame hands the shaders (use-web-gpu.ts uniformData).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Timeline {
    creeper_t: f64,
    fuse_t: f64,
    blast_t: f64,
    rebuild_t: f64,
    creeper_alpha: f64,
}

impl CherryBlossomQrcode {
    /// The QR effect: new blocks for new content.
    fn set_content(&mut self, text: String) {
        self.blocks = generate_block_data(&generate_qr_matrix(&text));
        self.num_blocks = self.blocks.num_blocks.min(MAX_BLOCKS);
        self.grid_size = self.blocks.grid_size;
        self.buffers_dirty = true;
        self.text = text;
    }

    /// detonate(): spawns a creeper, false while one is on its way.
    fn detonate(&mut self, at_ms: f64) -> bool {
        if self.sequence_start.is_some() {
            return false;
        }
        let grid = if self.grid_size == 0 {
            25
        } else {
            self.grid_size
        };
        let yaws = valid_approach_yaws(grid as f64);
        let pick = (self.random.next() * yaws.len() as f64).floor() as usize;
        self.spawn_angle = yaws.get(pick).copied().unwrap_or(CREEPER_APPROACH_YAW);
        let dest = approach_destination();
        self.blast_pos = (dest.0 * BLOCK_SIZE, dest.1 * BLOCK_SIZE);
        self.detonated = false;
        self.fuse_started = None;
        self.beats = 0;
        self.sequence_start = Some(at_ms);
        true
    }

    /// onPress.
    fn pressed(&mut self) {
        self.is_flat = !self.is_flat;
        self.posted.push("haptic:impact-medium".into());
        self.posted.push("focus".into());
    }

    /// onLongPress.
    fn long_pressed(&mut self, at_ms: f64) {
        if !self.detonate(at_ms) {
            return;
        }
        self.posted.push("haptic:impact-light".into());
        self.posted.push("spawned".into());
    }

    /// The long-press timeout, if it is due by `now`.
    fn long_press_timer(&mut self, now: f64) {
        let Some(r) = self.responder.as_mut() else {
            return;
        };
        let Some(due) = r.long_press_at else { return };
        if now < due {
            return;
        }
        r.long_press_at = None;
        // _handleLongPress: only in PRESS_IN (or LONG_PRESS_IN).
        if r.state == Touch::PressIn {
            r.state = Touch::LongPressIn;
            self.long_pressed(due);
        }
    }

    /// _isTouchWithinResponderRegion: the canvas grown by the press-rect offsets, exclusive.
    fn within(&self, x: f64, y: f64, canvas: (f64, f64)) -> bool {
        let [l, r, t, b] = PRESS_RECT;
        x > -l && x < canvas.0 + r && y > -t && y < canvas.1 + b
    }

    /// The canvas's size in points: the Pressable's style, W × 0.6 H.
    fn canvas_points(&self) -> (f64, f64) {
        (self.window.0, self.window.1 * 0.6)
    }

    /// The sequence's values at `now` (and its end, the frame it ends).
    fn timeline(&mut self, now: f64) -> Timeline {
        let mut t = Timeline {
            creeper_t: -1.0,
            fuse_t: 0.0,
            blast_t: -1.0,
            rebuild_t: 0.0,
            creeper_alpha: 0.0,
        };
        let Some(started_at) = self.sequence_start else {
            return t;
        };
        let seq = (now - started_at) / 1000.0;
        if seq < CREEPER_WALK_DURATION {
            t.creeper_t = seq / CREEPER_WALK_DURATION;
            t.creeper_alpha = 1.0;
        } else if seq < CREEPER_TOTAL {
            t.creeper_t = 1.0;
            t.fuse_t = (seq - CREEPER_WALK_DURATION) / CREEPER_FUSE_DURATION;
            t.creeper_alpha = 1.0;
            if self.fuse_started.is_none() {
                // onFuseStart: the pattern plays from this frame.
                self.fuse_started = Some(now);
            }
        } else {
            t.blast_t = seq - CREEPER_TOTAL;
            self.detonated = true;
            let settle_end = DEBRIS_SETTLE;
            if t.blast_t > settle_end {
                t.rebuild_t = ((t.blast_t - settle_end) / REBUILD_DURATION).min(1.0);
            }
        }
        if seq >= SEQUENCE_DURATION {
            self.sequence_start = None;
            t = Timeline {
                creeper_t: -1.0,
                fuse_t: 0.0,
                blast_t: -1.0,
                rebuild_t: 0.0,
                creeper_alpha: 0.0,
            };
        }
        t
    }

    /// The pattern's beats due by `now`, one message each.
    fn play_beats(&mut self, now: f64) {
        let Some(from) = self.fuse_started else {
            return;
        };
        while self.beats < BEATS.len() && now - from >= BEATS[self.beats].0 {
            self.posted.push(BEATS[self.beats].3.into());
            self.beats += 1;
        }
    }

    /// The drawable: canvas.width / height = canvasWidth / canvasHeight × PixelRatio, truncated.
    fn raster(&self, frame: &Frame) -> (u32, u32) {
        let (w, h) = if self.window.0 > 0.0 {
            self.canvas_points()
        } else {
            (frame.width as f64, frame.height as f64)
        };
        let ratio = frame.scale as f64;
        (
            ((w * ratio).trunc() as u32).max(1),
            ((h * ratio).trunc() as u32).max(1),
        )
    }

    /// updateBuffers: the blocks in use, as Uint32Array / Float32Array.
    fn upload(&mut self, queue: &wgpu::Queue) {
        let Some(gpu) = self.gpu.as_ref() else { return };
        let count = self.blocks.num_blocks.min(MAX_BLOCKS);
        let bytes = &mut self.upload;
        bytes.clear();
        bytes.extend(
            self.blocks.types[..count]
                .iter()
                .flat_map(|v| v.to_le_bytes()),
        );
        queue.write_buffer(&gpu.types, 0, bytes);
        bytes.clear();
        bytes.extend(
            self.blocks.positions[..count * 4]
                .iter()
                .flat_map(|&v| (v as f32).to_le_bytes()),
        );
        queue.write_buffer(&gpu.positions, 0, bytes);
        bytes.clear();
        bytes.extend(
            self.blocks.resistance[..count]
                .iter()
                .flat_map(|&v| (v as f32).to_le_bytes()),
        );
        queue.write_buffer(&gpu.resistance, 0, bytes);
        bytes.clear();
        bytes.extend(
            self.blocks.base_y[..count]
                .iter()
                .flat_map(|&v| (v as f32).to_le_bytes()),
        );
        queue.write_buffer(&gpu.base_y, 0, bytes);
    }

    fn timers(&mut self, now: f64) -> bool {
        let start = *self.start_ms.get_or_insert(now);
        if !self.focus_posted && now - start >= INITIAL_FOCUS_DELAY_MS {
            self.focus_posted = true;
            self.posted.push("focus".into());
        }
        if !self.hint_posted && now - start >= HINT_DELAY_MS {
            self.hint_posted = true;
            self.posted.push("hint".into());
        }
        !(self.focus_posted && self.hint_posted)
    }
}

impl Surface for CherryBlossomQrcode {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let number = |i: usize, what| {
            inputs
                .get(i)
                .map(|v| exact_gpu::json::number(v, what))
                .transpose()
        };
        let width = number(0, "width")?.unwrap_or(0.0);
        let height = number(1, "height")?.unwrap_or(0.0);
        if (width, height) != self.window {
            self.window = (width, height);
            self.drawn = None;
        }
        let seed = number(2, "seed")?.unwrap_or(0.0);
        if seed.to_bits() != self.seed.to_bits() {
            self.seed = seed;
            self.random = gfx::Random::new(seed);
        }
        if let Some(v) = inputs.get(3) {
            let typed = exact_gpu::json::text(v, "text")?;
            let clamped = clamp_to_qr_bytes(&typed).to_string();
            if clamped != typed {
                // setQrContent(clampToQRBytes(text)): the controlled field shows the clamp.
                self.posted.push(format!("text:{clamped}"));
            }
            if clamped != self.text {
                self.set_content(clamped);
            }
        }
        Ok(())
    }

    fn opaque(&self) -> bool {
        // The sky covers every pixel at alpha 1.
        true
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let touch = self
            .responder
            .map(|r| format!("\"{:?}\"", r.state))
            .unwrap_or_else(|| "null".into());
        Some(format!(
            "{{\"isFlat\":{},\"progress\":{:.4},\"sequence\":{},\"spawnAngle\":{:.6},\"numBlocks\":{},\"gridSize\":{},\"text\":{:?},\"touch\":{}}}",
            self.is_flat,
            self.progress,
            self.sequence_start.is_some(),
            self.spawn_angle,
            self.num_blocks,
            self.grid_size,
            self.text,
            touch
        ))
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
        let (x, y) = (x as f64, y as f64);
        // A move or a lift after the timeout's time: the timeout ran first.
        self.long_press_timer(at_ms);
        let canvas = self.canvas_points();
        match phase {
            PointerPhase::Down => {
                if self.responder.is_none() {
                    self.responder = Some(Responder {
                        id,
                        state: Touch::PressIn,
                        at: (x, y),
                        long_press_at: Some(at_ms + DELAY_LONG_PRESS_MS),
                    });
                }
            }
            PointerPhase::Move => {
                let inside = self.within(x, y, canvas);
                let Some(r) = self.responder.as_mut().filter(|r| r.id == id) else {
                    return;
                };
                if (r.at.0 - x).hypot(r.at.1 - y) > LONG_PRESS_DEACTIVATION_DISTANCE {
                    r.long_press_at = None;
                }
                if inside {
                    r.state = match r.state {
                        Touch::PressIn | Touch::PressOut => Touch::PressIn,
                        Touch::LongPressIn | Touch::LongPressOut => Touch::LongPressIn,
                    };
                } else {
                    r.long_press_at = None;
                    r.state = match r.state {
                        Touch::PressIn | Touch::PressOut => Touch::PressOut,
                        Touch::LongPressIn | Touch::LongPressOut => Touch::LongPressOut,
                    };
                }
            }
            PointerPhase::Up => {
                if self.responder.is_some_and(|r| r.id == id) {
                    let r = self.responder.take().unwrap();
                    // A release in PRESS_IN presses; after a long press (LONG_PRESS_IN) it does not.
                    if r.state == Touch::PressIn {
                        self.pressed();
                    }
                }
            }
            PointerPhase::Cancel => {
                if self.responder.is_some_and(|r| r.id == id) {
                    self.responder = None;
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
        let now = frame.now_ms;
        let waiting = self.timers(now);
        self.long_press_timer(now);

        if self.gpu.as_ref().map(|g| (g.format, g.generation))
            != Some((format, frame.shader_generation))
        {
            self.gpu = Some(build(device, format, frame.shader_generation));
            self.buffers_dirty = true;
            self.drawn = None;
        }
        let raster = self.raster(frame);
        let pixels = frame.pixels();
        {
            let gpu = self.gpu.as_mut().unwrap();
            if gpu.layers.as_ref().map(|l| l.raster) != Some(raster) {
                gpu.layers = Some(layers(device, gpu, raster));
                self.drawn = None;
            }
        }
        if self.buffers_dirty {
            // The QR effect's updateBuffers.
            self.upload(queue);
        }

        // The render loop: dt clamped to 50 ms; after a rest, one display period.
        let period = if frame.period_ms > 0.0 {
            frame.period_ms
        } else {
            1000.0 / 60.0
        };
        let last = self.last_frame_ms.unwrap_or(now - period);
        let dt = ((now - last) / 1000.0).min(0.05);
        self.last_frame_ms = Some(now);
        let target_progress = if self.is_flat { 1.0 } else { 0.0 };
        self.raw_progress += (target_progress - self.raw_progress) * (LERP_SPEED * dt).min(1.0);
        if (self.raw_progress - target_progress).abs() < 0.001 {
            self.raw_progress = target_progress;
        }
        self.progress = ease_in_out_cubic(self.raw_progress);
        let start = self.start_ms.unwrap_or(now);
        let time = (now - start) / 1000.0;

        // Outside the sequence nothing reads `time`: with progress settled and the buffers as
        // they were, the frame on screen stands.
        let skip = self.sequence_start.is_none()
            && !self.buffers_dirty
            && self.last_drawn_progress == Some(self.progress)
            && self.drawn.is_some();
        if !skip {
            self.buffers_dirty = false;
            self.last_drawn_progress = Some(self.progress);
            let t = self.timeline(now);
            self.play_beats(now);
            let aspect_ratio = raster.0 as f64 / raster.1 as f64;
            let u = Uniforms {
                aspectRatio: aspect_ratio as f32,
                time: time as f32,
                blockCount: self.num_blocks as f32,
                progress: self.progress as f32,
                gridSize: self.grid_size as f32,
                creeperT: t.creeper_t as f32,
                fuseT: t.fuse_t as f32,
                blastT: t.blast_t as f32,
                blastX: self.blast_pos.0 as f32,
                blastZ: self.blast_pos.1 as f32,
                rebuildT: t.rebuild_t as f32,
                creeperAlpha: t.creeper_alpha as f32,
                spawnAngle: self.spawn_angle as f32,
                _pad0: 0.0,
                _pad1: 0.0,
                _pad2: 0.0,
            };
            let bytes = u.bytes();
            let words: [u32; 16] = std::array::from_fn(|i| {
                u32::from_le_bytes([
                    bytes[4 * i],
                    bytes[4 * i + 1],
                    bytes[4 * i + 2],
                    bytes[4 * i + 3],
                ])
            });
            if self.drawn != Some(words) {
                let gpu = self.gpu.as_ref().unwrap();
                queue.write_buffer(&gpu.uniforms, 0, &bytes);
                draw_scene(encoder, gpu, self.num_blocks, t.blast_t >= 0.0);
                self.drawn = Some(words);
            }
        }

        // The layer, as Core Animation shows the drawable.
        let gpu = self.gpu.as_ref().unwrap();
        let layers = gpu.layers.as_ref().unwrap();
        let c = compose::Compose {
            size: [
                raster.0 as f32,
                raster.1 as f32,
                pixels.0 as f32,
                pixels.1 as f32,
            ],
            flags: [
                gfx::srgb_flag(format),
                if raster == pixels { 1.0 } else { 0.0 },
                0.0,
                0.0,
            ],
        };
        queue.write_buffer(&gpu.compose_uniforms, 0, &c.bytes());
        gfx::pass(
            encoder,
            "cherry blossom qrcode compose",
            target,
            &gpu.compose,
            &layers.bind,
        );

        let settled = self.raw_progress == target_progress;
        let busy = self.sequence_start.is_some()
            || !settled
            || self.responder.is_some()
            || waiting
            || self.buffers_dirty;
        if !busy {
            self.last_frame_ms = None;
        }
        busy
    }
}

/// The sky, the shadow, the blocks and (from the detonation) the dust, into the layer.
fn draw_scene(encoder: &mut wgpu::CommandEncoder, gpu: &Gpu, num_blocks: usize, dust: bool) {
    let layers = gpu.layers.as_ref().unwrap();
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("cherry blossom qrcode"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: &layers.color,
            resolve_target: None,
            depth_slice: None,
            // clearValue { r: 0, g: 0, b: 0, a: 0 }.
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
            view: &layers.depth,
            depth_ops: Some(wgpu::Operations {
                load: wgpu::LoadOp::Clear(1.0),
                store: wgpu::StoreOp::Store,
            }),
            stencil_ops: None,
        }),
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_bind_group(0, &gpu.bind, &[]);
    pass.set_pipeline(&gpu.sky);
    pass.draw(0..3, 0..1);
    pass.set_pipeline(&gpu.shadow);
    pass.draw(0..6, 0..1);
    pass.set_pipeline(&gpu.blocks);
    pass.draw(0..(36 * num_blocks) as u32, 0..1);
    if dust {
        pass.set_pipeline(&gpu.dust);
        pass.draw(0..3, 0..1);
    }
}

/// The layer and its depth texture at `raster`, and the compose bind group over it.
fn layers(device: &wgpu::Device, gpu: &Gpu, raster: (u32, u32)) -> Layers {
    let color = gfx::target(
        device,
        "cherry blossom qrcode layer",
        LAYER_FORMAT,
        raster.0,
        raster.1,
    );
    let depth = device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("cherry blossom qrcode depth"),
            size: wgpu::Extent3d {
                width: raster.0,
                height: raster.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: DEPTH_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
        .create_view(&Default::default());
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("cherry blossom qrcode compose"),
        layout: &gpu.compose_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: compose::U.binding,
                resource: gpu.compose_uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: compose::LAYER.binding,
                resource: wgpu::BindingResource::TextureView(&color),
            },
            wgpu::BindGroupEntry {
                binding: compose::SMP.binding,
                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
            },
        ],
    });
    Layers {
        raster,
        color,
        depth,
        bind,
    }
}

/// createPipeline: triangle list, cull none, depth24plus, one colour target (the layer).
fn pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    (vs, fs): (&str, &str),
    depth_write: bool,
    depth_compare: wgpu::CompareFunction,
    blend: wgpu::BlendState,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(vs),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some(vs),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some(fs),
            targets: &[Some(wgpu::ColorTargetState {
                format: LAYER_FORMAT,
                blend: Some(blend),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode: None,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: Some(depth_write),
            depth_compare: Some(depth_compare),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    })
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("cherry blossom qrcode"),
        bind_group_layouts: &[Some(&layout)],
        immediate_size: 0,
    });
    // createPipeline's default blend: one, one-minus-src-alpha (colour and alpha).
    let default_blend = wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING;
    // alphaBlend: colour src-alpha, one-minus-src-alpha; alpha one, one-minus-src-alpha.
    let alpha_blend = wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::SrcAlpha,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
    };
    use wgpu::CompareFunction::{Always, Less};
    let sky = pipeline(
        device,
        &shader,
        &pl,
        (entry::SKY_VS, entry::SKY_FS),
        false,
        Always,
        default_blend,
    );
    let shadow = pipeline(
        device,
        &shader,
        &pl,
        (entry::SHADOW_VS, entry::SHADOW_FS),
        false,
        Always,
        alpha_blend,
    );
    let blocks = pipeline(
        device,
        &shader,
        &pl,
        (entry::BLOCKS_VS, entry::BLOCKS_FS),
        true,
        Less,
        default_blend,
    );
    let dust = pipeline(
        device,
        &shader,
        &pl,
        (entry::DUST_VS, entry::DUST_FS),
        false,
        Always,
        default_blend,
    );
    let buffer = |label, size: usize, usage| {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(label),
            size: size as u64,
            usage: usage | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    };
    let storage = wgpu::BufferUsages::STORAGE;
    let uniforms = buffer(
        "cherry blossom qrcode uniforms",
        Uniforms::SIZE,
        wgpu::BufferUsages::UNIFORM,
    );
    let types = buffer("cherry blossom qrcode types", MAX_BLOCKS * 4, storage);
    let positions = buffer("cherry blossom qrcode positions", MAX_BLOCKS * 16, storage);
    let resistance = buffer("cherry blossom qrcode resistance", MAX_BLOCKS * 4, storage);
    let base_y = buffer("cherry blossom qrcode baseY", MAX_BLOCKS * 4, storage);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("cherry blossom qrcode"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: UNIFORMS.binding,
                resource: uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: BLOCK_TYPES.binding,
                resource: types.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: BLOCK_POSITIONS.binding,
                resource: positions.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: BLOCK_RESISTANCE.binding,
                resource: resistance.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: BLOCK_BASE_Y.binding,
                resource: base_y.as_entire_binding(),
            },
        ],
    });
    let compose_shader = device.create_shader_module(compose::module());
    let compose_layout = device.create_bind_group_layout(&compose::GROUP_0);
    let compose = gfx::fullscreen(
        device,
        format,
        &compose_shader,
        &compose_layout,
        compose::entry::VS,
        compose::entry::FS,
        None,
        "cherry blossom qrcode compose",
    );
    let compose_uniforms = buffer(
        "cherry blossom qrcode compose",
        compose::Compose::SIZE,
        wgpu::BufferUsages::UNIFORM,
    );
    Gpu {
        format,
        generation,
        sky,
        shadow,
        blocks,
        dust,
        compose,
        uniforms,
        types,
        positions,
        resistance,
        base_y,
        bind,
        compose_uniforms,
        compose_layout,
        sampler: gfx::linear_sampler(device, "cherry blossom qrcode"),
        layers: None,
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind};

    /// reference.txt's lines that start with `kind`.
    fn reference(kind: &str) -> Vec<Vec<String>> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../parity-tools/cherry-blossom-qrcode/reference.txt");
        let text = std::fs::read_to_string(path).unwrap();
        text.lines()
            .filter(|l| l.starts_with(&format!("{kind} ")))
            .map(|l| tokens(&l[kind.len() + 1..]))
            .collect()
    }

    /// Space-separated tokens, a JSON string kept whole.
    fn tokens(line: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut rest = line;
        while !rest.is_empty() {
            if rest.starts_with('"') {
                let mut end = 1;
                let bytes = rest.as_bytes();
                while bytes[end] != b'"' {
                    end += if bytes[end] == b'\\' { 2 } else { 1 };
                }
                out.push(rest[..=end].to_string());
                rest = rest[end + 1..].trim_start();
            } else {
                let end = rest.find(' ').unwrap_or(rest.len());
                out.push(rest[..end].to_string());
                rest = rest[end..].trim_start();
            }
        }
        out
    }

    /// JSON.stringify's string, back (the reference's texts have no escapes but quotes).
    fn unjson(s: &str) -> String {
        s[1..s.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    }

    fn hex(v: f64) -> String {
        format!("{:016x}", v.to_bits())
    }

    #[test]
    fn approach_headings_are_the_apps_bit_for_bit() {
        for line in reference("yaws") {
            let grid: f64 = line[0].parse().unwrap();
            let ours: Vec<String> = valid_approach_yaws(grid).into_iter().map(hex).collect();
            assert_eq!(ours, line[1..].to_vec(), "grid {grid}");
        }
        let dest = &reference("dest")[0];
        let (x, z) = approach_destination();
        assert_eq!((hex(x), hex(z)), (dest[0].clone(), dest[1].clone()));
    }

    #[test]
    fn block_data_is_the_apps_bit_for_bit() {
        for line in reference("blocks") {
            let text = unjson(&line[0]);
            let b = generate_block_data(&generate_qr_matrix(&text));
            let mut h: u32 = 0x811c9dc5;
            let mut eat = |v: f64| {
                for byte in v.to_le_bytes() {
                    h ^= byte as u32;
                    h = h.wrapping_mul(0x01000193);
                }
            };
            b.types.iter().for_each(|&v| eat(v as f64));
            b.positions.iter().for_each(|&v| eat(v));
            b.resistance.iter().for_each(|&v| eat(v));
            b.base_y.iter().for_each(|&v| eat(v));
            let ours = [
                b.num_blocks.to_string(),
                b.creeper_start.to_string(),
                b.grid_size.to_string(),
                format!("{h:08x}"),
            ];
            assert_eq!(ours.to_vec(), line[1..].to_vec(), "{text:?}");
        }
    }

    #[test]
    fn the_field_clamps_on_utf8_bytes_as_rn() {
        for line in reference("clamp") {
            assert_eq!(clamp_to_qr_bytes(&unjson(&line[0])), unjson(&line[1]));
        }
    }

    fn frame(now_ms: f64) -> Frame {
        Frame {
            width: 420.0,
            height: 547.2,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 1000.0 / 60.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    fn touch(s: &mut Box<dyn Surface>, phase: PointerPhase, x: f32, y: f32, at_ms: f64) {
        s.input(&InputEvent::Pointer {
            id: 3,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms,
        });
    }

    fn bound() -> Box<dyn Surface> {
        let mut s = surface();
        s.bind(
            &[
                Value::Number(420.0),
                Value::Number(912.0),
                Value::Number(7.0),
                Value::str(DEFAULT_QR_CONTENT),
            ],
            None,
        )
        .unwrap();
        s
    }

    #[test]
    fn a_tap_flattens_and_a_long_press_spawns_once() {
        let mut s = bound();
        // A tap: onPress, impactMedium, focus.
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, 1000.0);
        touch(&mut s, PointerPhase::Up, 200.0, 300.0, 1100.0);
        assert_eq!(s.messages(), ["haptic:impact-medium", "focus"]);
        assert!(s.agent("{}").unwrap().contains("\"isFlat\":true"));
        // Held 320 ms: onLongPress, and the release presses nothing.
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, 2000.0);
        touch(&mut s, PointerPhase::Move, 205.0, 304.0, 2319.0);
        assert!(s.messages().is_empty());
        touch(&mut s, PointerPhase::Up, 205.0, 304.0, 2400.0);
        assert_eq!(s.messages(), ["haptic:impact-light", "spawned"]);
        let state = s.agent("{}").unwrap();
        assert!(
            state.contains("\"isFlat\":true") && state.contains("\"sequence\":true"),
            "{state}"
        );
        // A second long press while the creeper walks: ignored, and no onPress.
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, 3000.0);
        touch(&mut s, PointerPhase::Up, 200.0, 300.0, 3500.0);
        assert!(s.messages().is_empty());
        // A move past 10 pt cancels the long press; the release inside still presses.
        touch(&mut s, PointerPhase::Down, 100.0, 100.0, 4000.0);
        touch(&mut s, PointerPhase::Move, 111.0, 100.0, 4050.0);
        touch(&mut s, PointerPhase::Up, 111.0, 100.0, 4600.0);
        assert_eq!(s.messages(), ["haptic:impact-medium", "focus"]);
        // Out past the retention rect (bottom 30) and released there: nothing.
        touch(&mut s, PointerPhase::Down, 100.0, 540.0, 5000.0);
        touch(&mut s, PointerPhase::Move, 100.0, 547.2 + 31.0, 5050.0);
        touch(&mut s, PointerPhase::Up, 100.0, 547.2 + 31.0, 5100.0);
        assert!(s.messages().is_empty());
        // Out and back inside the rect: a press again.
        touch(&mut s, PointerPhase::Down, 100.0, 540.0, 6000.0);
        touch(&mut s, PointerPhase::Move, 100.0, 547.2 + 29.0, 6020.0);
        touch(&mut s, PointerPhase::Up, 100.0, 547.2 + 29.0, 6040.0);
        assert_eq!(s.messages(), ["haptic:impact-medium", "focus"]);
    }

    #[test]
    fn the_clamp_goes_back_to_the_field() {
        let mut s = bound();
        let long = "🌸".repeat(30);
        s.bind(
            &[
                Value::Number(420.0),
                Value::Number(912.0),
                Value::Number(7.0),
                Value::str(&long),
            ],
            None,
        )
        .unwrap();
        assert_eq!(s.messages(), [format!("text:{}", "🌸".repeat(26))]);
    }

    /// A dark module's top: coloured (blossom, grass, petals, bark), where the path's dirt is a
    /// near-white grey.
    fn dark(img: &fixture::Pixels, x: u32, y: u32) -> bool {
        let p = img.at(x, y);
        let (hi, lo) = (p[..3].iter().max().unwrap(), p[..3].iter().min().unwrap());
        hi - lo > 30 || *hi < 170
    }

    #[test]
    fn the_tree_folds_flat_into_its_qr_and_blows_up_and_rebuilds() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let bg = [247, 247, 247];
        let mut s = bound();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        gfx::save_over(&rest, "cherry-blossom-qrcode-rest", bg);
        // The timers: focus and the hint still to come.
        assert!(animating);
        let (w, h) = (rest.width, rest.height);
        assert_eq!((w, h), (1260, 1642));
        // The sky (#f7f7f7) at the corners; the tree in the middle.
        assert_eq!(&rest.at(4, 4)[..3], &[247, 247, 247]);
        assert_eq!(&rest.at(w - 4, h - 4)[..3], &[247, 247, 247]);
        let (_, _) = fixture::render(&gpu, s.as_mut(), &frame(130.0)).unwrap();
        assert_eq!(s.messages(), ["focus"]);

        // A tap: the lerp to flat, settled within ~2 s at 60 fps.
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, 140.0);
        touch(&mut s, PointerPhase::Up, 200.0, 300.0, 200.0);
        s.messages();
        let mut ms = 200.0;
        let mut mid = None;
        let mut flat = None;
        while ms < 4000.0 {
            ms += 1000.0 / 60.0;
            let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            if mid.is_none() && ms >= 450.0 {
                mid = Some(img);
            } else if ms >= 3900.0 {
                flat = Some(img);
            }
        }
        assert!(s.messages().contains(&"hint".to_string()));
        gfx::save_over(mid.as_ref().unwrap(), "cherry-blossom-qrcode-folding", bg);
        let flat = flat.unwrap();
        gfx::save_over(&flat, "cherry-blossom-qrcode-flat", bg);
        assert!(s.agent("{}").unwrap().contains("\"progress\":1.0000"));

        // Flat: each module's top face reads dark or light as the QR has it. The flat camera:
        // x' = (x + X_OFFSET_2D) × 2.1 / max(ar, 1), y' = (z + Y_OFFSET_2D) × 2.1 / max(1 / ar, 1).
        let m = generate_qr_matrix(DEFAULT_QR_CONTENT);
        let n = m.len();
        let ar = 1260.0 / 1641.0;
        let half = n as f64 * BLOCK_SIZE * 0.5;
        let mut wrong = 0;
        for row in 0..n {
            for col in 0..n {
                let x = col as f64 * BLOCK_SIZE - half;
                let z = row as f64 * BLOCK_SIZE - half;
                let ndc = (
                    (x + 0.015) * 2.1 / f64::max(ar, 1.0),
                    (z + 0.08) * 2.1 / f64::max(1.0 / ar, 1.0),
                );
                // The layer's pixel, stretched 1641 → 1642 rows.
                let px = ((ndc.0 + 1.0) / 2.0 * 1260.0) as u32;
                let py = ((1.0 - ndc.1) / 2.0 * 1641.0 * 1642.0 / 1641.0) as u32;
                if dark(&flat, px, py) != m[row][col] {
                    wrong += 1;
                }
            }
        }
        assert_eq!(wrong, 0, "modules read wrong in the flat view");

        // Back to 3D, then a long press: the creeper.
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, ms);
        touch(&mut s, PointerPhase::Up, 200.0, 300.0, ms + 50.0);
        s.messages();
        let frames = |s: &mut Box<dyn Surface>, from: f64, to: f64| {
            let mut t = from;
            let mut last = None;
            while t < to {
                t += 1000.0 / 60.0;
                last = Some(fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap().0);
            }
            (t, last.unwrap())
        };
        let (t, _) = frames(&mut s, ms, ms + 3000.0);
        touch(&mut s, PointerPhase::Down, 200.0, 300.0, t);
        let (t, _) = frames(&mut s, t, t + 340.0);
        touch(&mut s, PointerPhase::Up, 200.0, 300.0, t);
        assert_eq!(s.messages(), ["haptic:impact-light", "spawned"]);
        let (t, walk) = frames(&mut s, t, t + 1800.0);
        gfx::save_over(&walk, "cherry-blossom-qrcode-walk", bg);
        let (t, fuse) = frames(&mut s, t, t + 2700.0);
        gfx::save_over(&fuse, "cherry-blossom-qrcode-fuse", bg);
        // The fuse's ticks so far, then the blast's three.
        let ticks = s.messages();
        assert!(
            !ticks.is_empty() && ticks.iter().all(|m| m.starts_with("haptic:impact-")),
            "{ticks:?}"
        );
        let (t, blast) = frames(&mut s, t, t + 700.0);
        gfx::save_over(&blast, "cherry-blossom-qrcode-blast", bg);
        let all: Vec<String> = ticks.into_iter().chain(s.messages()).collect();
        assert_eq!(all.len(), BEATS.len(), "{all:?}");
        assert_eq!(all[12], "haptic:impact-heavy");
        let (t, rebuild) = frames(&mut s, t, t + 2500.0);
        gfx::save_over(&rebuild, "cherry-blossom-qrcode-rebuild", bg);
        let (_, after) = frames(&mut s, t, t + 2000.0);
        gfx::save_over(&after, "cherry-blossom-qrcode-after", bg);
        assert!(s.agent("{}").unwrap().contains("\"sequence\":false"));
        // The rebuilt tree is the tree at rest.
        assert_eq!(after.data, rest.data);
    }
}
