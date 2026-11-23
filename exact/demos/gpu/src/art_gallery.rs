//! Art gallery: 10,000 photos in a 100 × 100 grid that rearrange into a painting picked from the
//! menu. Pinch zooms about the fingers, a pan moves the zoomed mosaic, a double tap zooms into the
//! tapped cell or back out, and a blurred button zooms back out.
//!
//! The atlas slots and each painting's cell-to-photo mapping are baked ahead of time
//! (images/art-gallery/gallery.bin). The atlas is an ASTC 10×10 file, uploaded as it is and sampled
//! linearly with no mipmaps. Without ASTC support the tiles draw black.
//!
//! The mosaic is one instanced draw with depth, after a radial background pass. A pick rearranges
//! the tiles over 1 s from the buffer swap, and the focus dims the rest of the grid over 500 ms.
//!
//! Gestures: a double tap races a simultaneous pinch and pan. Pinch and pan are one transform under
//! the fingers, so the content point under their centroid stays under it as they move. A finger
//! landing or lifting re-bases the anchor, so one and two fingers never jump.
//! - Past the limits the transform is rubber-banded, as UIScrollView does. On release it springs
//!   home, snaps to a centred cell in grid mode, or glides and bounces on each axis.
//! - A pick springs the zoom home, clears the focus, and plays eight light impacts then a medium
//!   one. New tiles grow from their centre, and photos left out shrink to their old centre.
//!   Picking the painting already shown changes no cell, only the zoom and the haptics.
//!
//! The header and the painting menu are Contract-owned: a pick arrives as the inputs (painting id,
//! picks).

use std::sync::OnceLock;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::Phase;
use pressto::Pressable;
use motion::{Spring, interpolate_clamp};
use draw2d::backdrop::{BackdropBlur, Material, expo_fraction};
use draw2d::{Canvas, Color, Font, Paint, Renderer};

use crate::{gfx, shaders};
use shaders::art_gallery::{GROUP_0, Uniforms, entry};
use shaders::art_gallery_present::{GROUP_0 as PRESENT_GROUP, Present, entry as present_entry};

static GALLERY: &[u8] = include_bytes!("../images/art-gallery/gallery.bin");
/// The atlas file, byte for byte.
static ATLAS: &crate::bytes::Bytes = crate::image!("art-gallery/deduped-atlas.astc");
/// The zoom-out icon's glyph (U+F28A) from the icon font.
static IONICONS: &[u8] = include_bytes!("../fonts/ionicons-contract-outline-subset.ttf");
const CONTRACT_OUTLINE: &str = "\u{F28A}";

/// Photo tile size and atlas columns.
const PHOTO_SIZE: f64 = 200.0;
/// Contrast, the reveal count for all tiles, and floats per tile.
const CONTRAST: f32 = 1.4;
const ATLAS_COUNT: f32 = 7.0;
const FLOATS_PER_TILE: usize = 12;
/// Focus animation length, ms.
const FOCUS_MS: f64 = 500.0;
const DEFAULT_GRID: usize = 100;
const CANVAS_WIDTH_RATIO: f64 = 0.95;
const GRID_MODE_THRESHOLD: f64 = 0.5;
const GRID_MODE_TARGET: f64 = 0.7;
const SNAP_BACK_THRESHOLD: f64 = 1.2;
const MIN_SCALE_RUBBER_BAND: f64 = 0.5;
const SPRING_MS: f64 = 350.0;
const SPRING_RATIO: f64 = 1.0;
const SWIPE_THRESHOLD: f32 = 300.0;
/// Pan slop before the pan starts, points.
const SLOP: f64 = 10.0;
/// UIScrollView's constants: deceleration, rubber band and bounce rates, and the fling threshold.
const DECELERATION: f64 = 0.998;
const STOP_VELOCITY: f64 = 0.00988;
const FLING_MIN: f64 = 335.0;
const RUBBER: f64 = 0.55;
const BOUNCE_RATE: f64 = 0.01088;
const BOUNCE_PULL: f64 = 0.00797;
const BOUNCE_CARRY: f64 = 1.656;
/// The lowest scale the rubber band pulls down towards, below 1.
/// MIN_SCALE_RUBBER_BAND) below 1.
const SCALE_BAND: f64 = std::f64::consts::LN_2;
/// Tap timeouts: the default maximum duration and delay.
const TAP_MAX_MS: f64 = 500.0;
/// Zoom-out button: 56 points, 40 from the bottom and 20 from the right.
const FAB: f64 = 56.0;
const FAB_BOTTOM: f64 = 40.0;
const FAB_RIGHT: f64 = 20.0;
const ICON_SIZE: f32 = 24.0;
const BLUR_INTENSITY: f64 = 60.0;
const SCENE: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const DEPTH: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;

/// The files of gpu/images this surface draws: embedded on the iPhone, fetched before it draws on the web
/// (crate::bytes).
const IMAGES: &[&str] = &[
    "art-gallery/deduped-atlas.astc",
];

/// The demo's surface.
/// On the web it draws once its [`IMAGES`] arrived (crate::bytes::gate).
pub fn surface() -> Box<dyn Surface> {
    crate::bytes::gate(IMAGES, ungated())
}

fn ungated() -> Box<dyn Surface> {
    Box::new(new())
}

fn new() -> ArtGallery {
    ArtGallery {
        scale: Spring::at(1.0),
        tx: Spring::at(0.0),
        ty: Spring::at(0.0),
        row: -1,
        col: -1,
        picks: 0.0,
        focus: Focus::default(),
        ..Default::default()
    }
}

/// One painting's baked analysis and mapping.
struct Painting {
    id: String,
    width: f64,
    height: f64,
    cols: usize,
    rows: usize,
    /// The photo of each cell, row-major; `EMPTY` where the matcher left none.
    photos: Vec<u16>,
}

const EMPTY: u16 = 0xFFFF;

struct Gallery {
    /// Each photo id's slot in the atlas.
    slots: Vec<u16>,
    atlas_rows: usize,
    atlas_cols: usize,
    paintings: Vec<Painting>,
}

fn gallery() -> &'static Gallery {
    static G: OnceLock<Gallery> = OnceLock::new();
    G.get_or_init(|| parse(GALLERY))
}

fn parse(b: &[u8]) -> Gallery {
    let mut o = 0usize;
    let mut u16_at = || {
        let v = u16::from_le_bytes([b[o], b[o + 1]]);
        o += 2;
        v
    };
    let photos = u16_at() as usize;
    let atlas_rows = u16_at() as usize;
    let atlas_cols = u16_at() as usize;
    let count = u16_at() as usize;
    let slots = (0..photos).map(|_| u16_at()).collect();
    let mut paintings = Vec::with_capacity(count);
    for _ in 0..count {
        let n = b[o] as usize;
        let id = String::from_utf8_lossy(&b[o + 1..o + 1 + n]).into_owned();
        o += 1 + n;
        let mut u16_at = || {
            let v = u16::from_le_bytes([b[o], b[o + 1]]);
            o += 2;
            v
        };
        let (width, height, cols, rows) = (
            u16_at() as f64,
            u16_at() as f64,
            u16_at() as usize,
            u16_at() as usize,
        );
        let photos = (0..cols * rows).map(|_| u16_at()).collect();
        paintings.push(Painting {
            id,
            width,
            height,
            cols,
            rows,
            photos,
        });
    }
    Gallery {
        slots,
        atlas_rows,
        atlas_cols,
        paintings,
    }
}

/// The grid shown for a painting (None: the atlas), on a screen `sw` points wide.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Grid {
    cols: usize,
    rows: usize,
    canvas_w: f64,
    canvas_h: f64,
    cell_w: f64,
    cell_h: f64,
}

fn grid(shown: Option<usize>, sw: f64) -> Grid {
    let (cols, rows, aspect) = match shown {
        None => (DEFAULT_GRID, DEFAULT_GRID, 1.0),
        Some(p) => {
            let p = &gallery().paintings[p];
            (p.cols, p.rows, p.width / p.height)
        }
    };
    let canvas_w = sw * CANVAS_WIDTH_RATIO;
    let canvas_h = if aspect > 0.0 {
        canvas_w / aspect
    } else {
        canvas_w
    };
    let cell_w = if cols > 0 {
        canvas_w / cols as f64
    } else {
        0.0
    };
    let cell_h = if rows > 0 {
        canvas_h / rows as f64
    } else {
        0.0
    };
    Grid {
        cols,
        rows,
        canvas_w,
        canvas_h,
        cell_w,
        cell_h,
    }
}

/// A tile: position, size, atlas UVs and atlas index, as the shader reads them.
type Tile = [f32; 9];

/// The tile buffers for `shown`, from the previous painting's photo positions `prev`.
/// `prev` and `order` become this painting's.
fn build_tiles(
    shown: Option<usize>,
    sw: f64,
    prev: &mut Vec<Option<Tile>>,
    order: &mut Vec<u16>,
) -> (Vec<f32>, Vec<f32>, usize, bool) {
    let g = gallery();
    let gr = grid(shown, sw);
    let (half_w, half_h) = (gr.canvas_w / 2.0, gr.canvas_h / 2.0);
    let atlas_w = g.atlas_cols as f64 * PHOTO_SIZE;
    let atlas_h = g.atlas_rows as f64 * PHOTO_SIZE;
    let photo_count = g.slots.len();
    // The cells with a photo (validCells), in cell order.
    let mut valid: Vec<(f64, f64, u16)> = Vec::with_capacity(gr.cols * gr.rows);
    for i in 0..gr.cols * gr.rows {
        let (row, col) = (i / gr.cols, i % gr.cols);
        let photo = match shown {
            None => {
                if i < photo_count {
                    i as u16
                } else {
                    continue;
                }
            }
            Some(p) => g.paintings[p].photos[i],
        };
        if photo == EMPTY || photo as usize >= photo_count {
            continue;
        }
        valid.push((
            col as f64 * gr.cell_w - half_w,
            row as f64 * gr.cell_h - half_h,
            photo,
        ));
    }
    let uv = |photo: u16| {
        let slot = g.slots[photo as usize] as usize;
        let (c, r) = (slot % g.atlas_cols, slot / g.atlas_cols);
        [
            (c as f64 * PHOTO_SIZE / atlas_w) as f32,
            (r as f64 * PHOTO_SIZE / atlas_h) as f32,
            (PHOTO_SIZE / atlas_w) as f32,
            (PHOTO_SIZE / atlas_h) as f32,
        ]
    };
    let animate = !order.is_empty();
    let mut in_new = vec![false; photo_count];
    for &(_, _, p) in &valid {
        in_new[p as usize] = true;
    }
    let disappearing: Vec<Tile> = if animate {
        order
            .iter()
            .filter(|&&p| !in_new[p as usize])
            .filter_map(|&p| prev[p as usize])
            .collect()
    } else {
        Vec::new()
    };
    let total = valid.len() + disappearing.len();
    let mut tiles = vec![0f32; total * FLOATS_PER_TILE];
    let mut old = vec![0f32; total * FLOATS_PER_TILE];
    let (cw, ch) = (gr.cell_w as f32, gr.cell_h as f32);
    for (i, &(x, y, photo)) in valid.iter().enumerate() {
        let o = i * FLOATS_PER_TILE;
        let [ux, uy, uw, uh] = uv(photo);
        tiles[o..o + 9].copy_from_slice(&[x as f32, y as f32, cw, ch, ux, uy, uw, uh, 0.0]);
        match if animate { prev[photo as usize] } else { None } {
            Some(p) => old[o..o + 4].copy_from_slice(&p[..4]),
            // Photo is new: grow from size 0 at the centre of its new position.
            None => old[o..o + 4].copy_from_slice(&[
                (x + gr.cell_w / 2.0) as f32,
                (y + gr.cell_h / 2.0) as f32,
                0.0,
                0.0,
            ]),
        }
        old[o + 4..o + 9].copy_from_slice(&tiles[o + 4..o + 9]);
    }
    for (k, p) in disappearing.iter().enumerate() {
        let o = (valid.len() + k) * FLOATS_PER_TILE;
        old[o..o + 9].copy_from_slice(p);
        // Shrink to size 0 at the centre of its old position.
        tiles[o..o + 9].copy_from_slice(&[
            p[0] + p[2] / 2.0,
            p[1] + p[3] / 2.0,
            0.0,
            0.0,
            p[4],
            p[5],
            p[6],
            p[7],
            p[8],
        ]);
    }
    // A photo keeps its first position in the order, and its last cell as its value.
    prev.clear();
    prev.resize(photo_count, None);
    order.clear();
    for &(x, y, photo) in &valid {
        let [ux, uy, uw, uh] = uv(photo);
        if prev[photo as usize].is_none() {
            order.push(photo);
        }
        prev[photo as usize] = Some([x as f32, y as f32, cw, ch, ux, uy, uw, uh, 0.0]);
    }
    (tiles, old, total, animate)
}

/// The focus overlay's animation.
#[derive(Clone, Copy, Debug, PartialEq)]
enum FocusAnim {
    FadeIn,
    FadeOut,
    Move,
}

#[derive(Clone, Copy, Debug)]
struct Focus {
    intensity: f64,
    pos: (f64, f64),
    start_pos: (f64, f64),
    target: (f64, f64),
    was_focused: bool,
    start: Option<f64>,
    anim: Option<FocusAnim>,
}

impl Default for Focus {
    fn default() -> Self {
        Focus {
            intensity: 0.0,
            pos: (-9999.0, -9999.0),
            start_pos: (-9999.0, -9999.0),
            target: (-9999.0, -9999.0),
            was_focused: false,
            start: None,
            anim: None,
        }
    }
}

impl Focus {
    /// One frame at `now`: the focused cell (row < 0: none) of a `cols` × `rows` grid of `cw` × `ch`.
    fn frame(&mut self, now: f64, row: i32, col: i32, cols: usize, rows: usize, cw: f64, ch: f64) {
        let has = row >= 0;
        let nx = if has {
            (col as f64 + 0.5 - cols as f64 / 2.0) * cw
        } else {
            -9999.0
        };
        let ny = if has {
            (row as f64 + 0.5 - rows as f64 / 2.0) * ch
        } else {
            -9999.0
        };
        if nx != self.target.0 || ny != self.target.1 {
            if !self.was_focused && has {
                self.anim = Some(FocusAnim::FadeIn);
                self.pos = (nx, ny);
                self.target = (nx, ny);
                self.start = Some(now);
                self.was_focused = true;
            } else if self.was_focused && !has {
                self.anim = Some(FocusAnim::FadeOut);
                self.target = (-9999.0, -9999.0);
                self.start = Some(now);
                self.was_focused = false;
            } else if self.was_focused && has {
                self.anim = Some(FocusAnim::Move);
                self.start_pos = self.pos;
                self.target = (nx, ny);
                self.start = Some(now);
            }
        }
        if let (Some(start), Some(anim)) = (self.start, self.anim) {
            let progress = ((now - start) / FOCUS_MS).min(1.0);
            let eased = 1.0 - (1.0 - progress).powi(2);
            match anim {
                FocusAnim::FadeIn => self.intensity = eased,
                FocusAnim::FadeOut => self.intensity = 1.0 - eased,
                FocusAnim::Move => {
                    self.pos.0 = self.start_pos.0 + (self.target.0 - self.start_pos.0) * eased;
                    self.pos.1 = self.start_pos.1 + (self.target.1 - self.start_pos.1) * eased;
                }
            }
            if progress >= 1.0 {
                self.start = None;
                self.anim = None;
                if has {
                    self.pos = self.target;
                    self.intensity = 1.0;
                } else {
                    self.pos = (-9999.0, -9999.0);
                    self.intensity = 0.0;
                }
            }
        }
    }
}

/// UIScrollView's rubber band: `x` past an end shows this much, over a port `d` wide.
fn band(x: f64, d: f64) -> f64 {
    (1.0 - 1.0 / (x * RUBBER / d + 1.0)) * d
}

/// The raw travel past an end that shows `y` of overshoot.
fn unband(y: f64, d: f64) -> f64 {
    let y = y.min(d * 0.999_999);
    (1.0 / (1.0 - y / d) - 1.0) * d / RUBBER
}

/// `x` inside [lo, hi], rubber-banded over `d` past either end.
fn band_range(x: f64, lo: f64, hi: f64, d: f64) -> f64 {
    if x > hi {
        hi + band(x - hi, d)
    } else if x < lo {
        lo - band(lo - x, d)
    } else {
        x
    }
}

/// The raw value `band_range` shows as `y`.
fn unband_range(y: f64, lo: f64, hi: f64, d: f64) -> f64 {
    if y > hi {
        hi + unband(y - hi, d)
    } else if y < lo {
        lo - unband(lo - y, d)
    } else {
        y
    }
}

/// One axis of the translation after the fingers let go, as UIScrollView moves it: a
/// deceleration (which bounces off `edge` if it gets there) or a bounce back to an edge.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
enum Glide {
    #[default]
    Off,
    /// From `from` at `v` pt/ms, decaying at `lambda` per ms from `at`.
    Decay {
        from: f64,
        v: f64,
        at: f64,
        lambda: f64,
        edge: Option<f64>,
    },
    /// Critically damped onto `edge` from `x0` past it at `v0` pt/ms, from `at`.
    Bounce {
        edge: f64,
        x0: f64,
        v0: f64,
        at: f64,
    },
}

impl Glide {
    /// UIScrollView's release of an axis at `t` (bound ±`bound`, port `d`) by a finger at
    /// `finger` pt/s, its clock from `at`.
    fn release(t: f64, finger: f64, bound: f64, d: f64, at: f64) -> Glide {
        if t.abs() > bound {
            let edge = t.clamp(-bound, bound);
            let x0 = t - edge;
            // The pull back plus what the bounce keeps of the content's banded velocity.
            let raw = unband(x0.abs(), d);
            let slope = RUBBER / (raw * RUBBER / d + 1.0).powi(2);
            let v0 = -BOUNCE_PULL * x0 + BOUNCE_CARRY * finger / 1000.0 * slope;
            return Glide::Bounce { edge, x0, v0, at };
        }
        if finger.abs() < FLING_MIN {
            return Glide::Off;
        }
        let v = finger / 1000.0;
        let lambda = -DECELERATION.ln();
        let projected = t + v.signum() * (v.abs() - STOP_VELOCITY) / lambda;
        let edge = if projected > bound {
            Some(bound)
        } else if projected < -bound {
            Some(-bound)
        } else {
            None
        };
        Glide::Decay {
            from: t,
            v,
            at,
            lambda,
            edge,
        }
    }

    /// The value at `now` and whether it still moves; None when off.
    fn step(&mut self, now: f64) -> Option<(f64, bool)> {
        match *self {
            Glide::Off => None,
            Glide::Decay {
                from,
                v,
                at,
                lambda,
                edge,
            } => {
                let t = (now - at).max(0.0);
                if let Some(edge) = edge {
                    // Free deceleration until it crosses the edge, then the bounce from there
                    // with the velocity it crossed at.
                    let k = 1.0 - (edge - from) * lambda / v;
                    if k > 0.0 {
                        let cross = -k.ln() / lambda;
                        if t >= cross {
                            *self = Glide::Bounce {
                                edge,
                                x0: 0.0,
                                v0: v * (-lambda * cross).exp(),
                                at: at + cross,
                            };
                            return self.step(now);
                        }
                    }
                }
                if (v * (-lambda * t).exp()).abs() <= STOP_VELOCITY {
                    *self = Glide::Off;
                    return Some((
                        from + v.signum() * (v.abs() - STOP_VELOCITY).max(0.0) / lambda,
                        false,
                    ));
                }
                Some((from + v / lambda * (1.0 - (-lambda * t).exp()), true))
            }
            Glide::Bounce { edge, x0, v0, at } => {
                let t = (now - at).max(0.0);
                let w = BOUNCE_RATE;
                let x = (x0 + (v0 + w * x0) * t) * (-w * t).exp();
                if t > 0.0 && x.abs() < 0.01 {
                    *self = Glide::Off;
                    return Some((edge, false));
                }
                Some((edge + x, true))
            }
        }
    }
}

/// The transform the fingers hold since the last time a finger landed or lifted: their centroid
/// (from the screen's centre) and spread then, and the raw (unbanded) ln scale, the scale shown
/// and the raw translation then.
#[derive(Clone, Copy, Debug, Default)]
struct Grab {
    c0: (f64, f64),
    d0: f64,
    l0: f64,
    s0: f64,
    u0: (f64, f64),
}

/// A double tap: two taps within 500 ms each, with no distance limit. A second finger fails it.
#[derive(Clone, Debug, Default)]
struct DoubleTap {
    taps: u32,
    id: Option<u32>,
    deadline: f64,
}

impl DoubleTap {
    fn reset(&mut self) {
        self.taps = 0;
        self.id = None;
    }

    /// Some((x, y)) at the second lift: onEnd.
    fn event(&mut self, id: u32, phase: Phase, x: f32, y: f32, ms: f64) -> Option<(f32, f32)> {
        match phase {
            Phase::Down => {
                if self.id.is_some() {
                    self.reset();
                    return None;
                }
                if self.taps > 0 && ms > self.deadline {
                    self.reset();
                }
                self.taps += 1;
                self.id = Some(id);
                self.deadline = ms + TAP_MAX_MS;
                None
            }
            Phase::Move => None,
            Phase::Up | Phase::Cancel => {
                if self.id != Some(id) {
                    return None;
                }
                self.id = None;
                if phase == Phase::Cancel || ms > self.deadline {
                    self.reset();
                    return None;
                }
                if self.taps >= 2 {
                    self.reset();
                    return Some((x, y));
                }
                self.deadline = ms + TAP_MAX_MS;
                None
            }
        }
    }
}

#[derive(Default)]
struct ArtGallery {
    /// The screen in points (the canvas is the window).
    size: (f64, f64),
    /// What the menu last picked (None: Default, the atlas) and how many picks so far.
    picked: Option<usize>,
    picks: f64,
    /// What the tiles show, and the screen width they were built for.
    shown: Option<(Option<usize>, f64)>,
    prev: Vec<Option<Tile>>,
    order: Vec<u16>,
    tiles: Vec<f32>,
    old_tiles: Vec<f32>,
    tile_count: usize,
    tiles_dirty: bool,
    /// The rearrange clock (mosaicAnimStartRef): pending until the frame that swaps the buffers.
    anim_pending: bool,
    anim_start: Option<f64>,
    scale: Spring,
    tx: Spring,
    ty: Spring,
    /// The fingers down (id, x, y), in landing order.
    fingers: Vec<(u32, f64, f64)>,
    /// Where the first finger landed, and whether that touch caught motion.
    down_at: (f64, f64),
    caught: bool,
    /// The fingers hold the transform (past the slop, or two of them).
    grab: Option<Grab>,
    /// Two fingers held it during this touch.
    pinched: bool,
    /// The raw (unbanded) ln scale and translation the fingers put it at.
    raw_l: f64,
    raw_t: (f64, f64),
    /// The centroid's samples (ms, x, y), shifted at each landing or lift so they stay
    /// continuous: the release velocity.
    samples: Vec<(f64, f64, f64)>,
    shift: (f64, f64),
    glide_x: Glide,
    glide_y: Glide,
    /// Where the springs a touch caught were going: a tap that never dragged lets them finish.
    resume: Option<(f64, f64, f64)>,
    row: i32,
    col: i32,
    focus: Focus,
    /// playTransitionHaptics: armed at a pick, timed from the next frame.
    haptics_pending: bool,
    haptics: Vec<(f64, &'static str)>,
    tap: DoubleTap,
    press: Pressable,
    posted: Vec<String>,
    gpu: Option<Gpu>,
    canvas: Canvas,
    renderer: Renderer,
    blur: BackdropBlur,
    icon: Option<Font>,
    last_now: f64,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    bg: wgpu::RenderPipeline,
    tiles: wgpu::RenderPipeline,
    present: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    present_layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    present_uniforms: wgpu::Buffer,
    tile_buf: wgpu::Buffer,
    old_buf: wgpu::Buffer,
    capacity: usize,
    atlas: wgpu::TextureView,
    sampler: wgpu::Sampler,
    bind: wgpu::BindGroup,
    /// The scene and its depth, at the canvas's pixel size.
    scene: Option<((u32, u32), wgpu::TextureView, wgpu::TextureView)>,
    /// The button's icon and border, unscaled (side in pixels).
    ink: Option<(u32, wgpu::TextureView)>,
    /// A 1×1 stand-in for the backdrop and the ink while the button is hidden.
    blank: wgpu::TextureView,
}

impl ArtGallery {
    fn grid(&self) -> Grid {
        grid(self.picked_shown(), self.size.0)
    }

    /// What the cells show: the shown painting once built, else the pick.
    fn picked_shown(&self) -> Option<usize> {
        self.shown.map_or(self.picked, |(s, _)| s)
    }

    fn ideal_grid_scale(&self) -> f64 {
        let g = self.grid();
        if g.cell_w > 0.0 {
            (GRID_MODE_TARGET * self.size.0) / g.cell_w
        } else {
            1.0
        }
    }

    fn spring(s: &mut Spring, to: f64) {
        gfx::spring_to(s, to, SPRING_MS, SPRING_RATIO);
    }

    fn home(&mut self) {
        self.glide_x = Glide::Off;
        self.glide_y = Glide::Off;
        Self::spring(&mut self.scale, 1.0);
        Self::spring(&mut self.tx, 0.0);
        Self::spring(&mut self.ty, 0.0);
        self.row = -1;
        self.col = -1;
    }

    fn light(&mut self) {
        self.posted.push("haptic:impact-light".into());
    }

    fn snap_to_cell(&mut self, row: i32, col: i32) {
        self.light();
        self.glide_x = Glide::Off;
        self.glide_y = Glide::Off;
        let g = self.grid();
        let ideal = self.ideal_grid_scale();
        Self::spring(&mut self.scale, ideal);
        let (cx, cy) = ((col as f64 + 0.5) * g.cell_w, (row as f64 + 0.5) * g.cell_h);
        let max_tx = ((g.canvas_w / 2.0 - g.cell_w / 2.0) * ideal).max(0.0);
        let max_ty = ((g.canvas_h / 2.0 - g.cell_h / 2.0) * ideal).max(0.0);
        let tx = (-(cx - g.canvas_w / 2.0) * ideal).clamp(-max_tx, max_tx);
        let ty = (-(cy - g.canvas_h / 2.0) * ideal).clamp(-max_ty, max_ty);
        Self::spring(&mut self.tx, tx);
        Self::spring(&mut self.ty, ty);
        self.row = row;
        self.col = col;
    }

    /// The cell centred on screen (pinch and pan onEnd).
    fn centred_cell(&self) -> (i32, i32) {
        let g = self.grid();
        let s = self.scale.value;
        let ccx = g.canvas_w / 2.0 - self.tx.value / s;
        let ccy = g.canvas_h / 2.0 - self.ty.value / s;
        (
            (ccy / g.cell_h - 0.5).round() as i32,
            (ccx / g.cell_w - 0.5).round() as i32,
        )
    }

    fn clamp_cell(&self, row: i32, col: i32) -> (i32, i32) {
        let g = self.grid();
        (
            row.clamp(0, g.rows as i32 - 1),
            col.clamp(0, g.cols as i32 - 1),
        )
    }

    fn in_grid_mode(&self) -> bool {
        self.grid().cell_w * self.scale.value >= self.size.0 * GRID_MODE_THRESHOLD
    }

    /// A pick of a painting.
    fn pick(&mut self, painting: Option<usize>) {
        self.home();
        self.haptics_pending = true;
        self.picked = painting;
    }

    fn fab_opacity(&self) -> f64 {
        interpolate_clamp(self.scale.value, &[1.0, 1.5], &[0.0, 1.0])
    }

    /// The button's frame (points, Yoga-rounded to the pixel) and its pressed scale.
    fn fab_frame(&self, ppp: f64) -> (f64, f64, f64) {
        let round = |v: f64| (v * ppp).round() / ppp;
        (
            round(self.size.0 - FAB_RIGHT - FAB),
            round(self.size.1 - FAB_BOTTOM - FAB),
            self.press.scale(),
        )
    }

    /// The highest scale (the pinch clamp, idealGridScale × 1.2), never under 1.
    fn max_scale(&self) -> f64 {
        (self.ideal_grid_scale() * 1.2).max(1.0)
    }

    /// The scale a raw ln scale shows: rubber-banded under 1 (towards MIN_SCALE_RUBBER_BAND) and
    /// over the top (towards twice it).
    fn banded_scale(&self, l: f64) -> f64 {
        let hi = self.max_scale().ln();
        if l > hi {
            (hi + band(l - hi, SCALE_BAND)).exp()
        } else if l < 0.0 {
            (-band(-l, -MIN_SCALE_RUBBER_BAND.ln())).exp()
        } else {
            l.exp()
        }
    }

    fn raw_scale(&self, s: f64) -> f64 {
        let (l, hi) = (s.ln(), self.max_scale().ln());
        if l > hi {
            hi + unband(l - hi, SCALE_BAND)
        } else if l < 0.0 {
            -unband(-l, -MIN_SCALE_RUBBER_BAND.ln())
        } else {
            l
        }
    }

    /// How far the mosaic may move from the centre at scale `s`, per axis. Once a cell fills half
    /// the screen, the cell bound ((canvas − cell) / 2 × s: any cell can be centred); zoomed out,
    /// the content's edges at the screen's edges (Photos); between, blended by the cell's share
    /// of half the screen, so the bound never jumps as the scale changes.
    fn bounds(&self, s: f64) -> (f64, f64) {
        let g = self.grid();
        let (w, h) = self.size;
        let f = if w > 0.0 {
            (g.cell_w * s / (w * GRID_MODE_THRESHOLD)).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let axis = |canvas: f64, cell: f64, screen: f64| {
            let edges = (canvas * s - screen) / 2.0;
            let cells = (canvas - cell) * s / 2.0;
            (edges + (cells - edges) * f).max(0.0)
        };
        (axis(g.canvas_w, g.cell_w, w), axis(g.canvas_h, g.cell_h, h))
    }

    /// The fingers' centroid, from the screen's centre.
    fn centroid(&self) -> (f64, f64) {
        let n = self.fingers.len().max(1) as f64;
        let (x, y) = self
            .fingers
            .iter()
            .fold((0.0, 0.0), |(a, b), f| (a + f.1, b + f.2));
        (x / n - self.size.0 / 2.0, y / n - self.size.1 / 2.0)
    }

    /// The first two fingers' distance (0 with one).
    fn spread(&self) -> f64 {
        match self.fingers.as_slice() {
            [a, b, ..] => (b.1 - a.1).hypot(b.2 - a.2),
            _ => 0.0,
        }
    }

    /// Stops every glide and spring where it is (a running spring's targets kept in `resume`);
    /// whether anything was moving.
    fn catch(&mut self) -> bool {
        let glided = self.glide_x != Glide::Off || self.glide_y != Glide::Off;
        self.glide_x = Glide::Off;
        self.glide_y = Glide::Off;
        let sprung = self.scale.running || self.tx.running || self.ty.running;
        if sprung {
            self.resume = Some((self.scale.target(), self.tx.target(), self.ty.target()));
        }
        for s in [&mut self.scale, &mut self.tx, &mut self.ty] {
            s.set(s.value);
        }
        glided || sprung
    }

    /// The fingers take the transform where it shows.
    fn take(&mut self) {
        self.catch();
        self.raw_l = self.raw_scale(self.scale.value);
        let (bx, by) = self.bounds(self.scale.value);
        self.raw_t = (
            unband_range(self.tx.value, -bx, bx, self.size.0),
            unband_range(self.ty.value, -by, by, self.size.1),
        );
        self.rebase();
    }

    /// A finger landed or lifted: the anchor moves to where the fingers and the content are now.
    fn rebase(&mut self) {
        self.grab = Some(Grab {
            c0: self.centroid(),
            d0: self.spread(),
            l0: self.raw_l,
            s0: self.scale.value,
            u0: self.raw_t,
        });
    }

    /// The fingers moved: the content point under the anchor's centroid goes under the
    /// centroid, scaled by the spread.
    fn follow(&mut self) {
        let Some(g) = self.grab else { return };
        let c = self.centroid();
        let mut l = g.l0;
        if self.fingers.len() >= 2 && g.d0 > 0.0 {
            l += (self.spread() / g.d0).ln();
        }
        self.raw_l = l;
        let s = self.banded_scale(l);
        let k = s / g.s0;
        let u = (c.0 - (g.c0.0 - g.u0.0) * k, c.1 - (g.c0.1 - g.u0.1) * k);
        self.raw_t = u;
        let (bx, by) = self.bounds(s);
        self.scale.set(s);
        self.tx.set(band_range(u.0, -bx, bx, self.size.0));
        self.ty.set(band_range(u.1, -by, by, self.size.1));
    }

    fn sample(&mut self, ms: f64) {
        let c = self.centroid();
        let (x, y) = (c.0 + self.shift.0, c.1 + self.shift.1);
        if self.samples.last().is_some_and(|s| s.1 == x && s.2 == y) {
            return; // a finger at rest: UIKit hears no move, its velocity stands
        }
        self.samples.retain(|s| ms - s.0 <= 150.0);
        self.samples.push((ms, x, y));
    }

    /// The centroid's velocity (pt/s) over the last 100 ms of moves (UIKit's estimate).
    fn velocity(&self) -> (f64, f64) {
        let Some(last) = self.samples.last() else {
            return (0.0, 0.0);
        };
        let first = self
            .samples
            .iter()
            .find(|s| last.0 - s.0 <= 100.0)
            .unwrap_or(last);
        let dt = (last.0 - first.0) / 1000.0;
        if dt <= 0.0 {
            return (0.0, 0.0);
        }
        ((last.1 - first.1) / dt, (last.2 - first.2) / dt)
    }

    /// The last finger lifted (or a catch let go): where the transform goes from here.
    fn release(&mut self, (vx, vy): (f64, f64)) {
        self.grab = None;
        let s = self.scale.value;
        if s < SNAP_BACK_THRESHOLD {
            self.home();
            return;
        }
        let g = self.grid();
        if self.in_grid_mode() && g.cols > 0 && g.rows > 0 {
            // The centred cell; a one-finger fling over 300 pt/s goes one cell further.
            let (mut row, mut col) = self.centred_cell();
            if !self.pinched && vx.abs().max(vy.abs()) > SWIPE_THRESHOLD as f64 {
                if vx.abs() > vy.abs() {
                    col += if vx > 0.0 { -1 } else { 1 };
                } else {
                    row += if vy > 0.0 { -1 } else { 1 };
                }
            }
            let (r, c) = self.clamp_cell(row, col);
            self.snap_to_cell(r, c);
            return;
        }
        // Between 1.2 and grid mode the scale is in range: each axis glides as UIScrollView,
        // its clock from the last frame (a pointer's time is not on the frame clock).
        let (bx, by) = self.bounds(s);
        let at = self.last_now;
        self.glide_x = Glide::release(self.tx.value, vx, bx, self.size.0, at);
        self.glide_y = Glide::release(self.ty.value, vy, by, self.size.1, at);
        self.row = -1;
        self.col = -1;
    }

    /// Every finger as one transform (pinch and pan); whether the fingers took it now.
    fn touch(&mut self, id: u32, phase: Phase, x: f64, y: f64, ms: f64, on_fab: bool) -> bool {
        let at = self.fingers.iter().position(|f| f.0 == id);
        let before = self.centroid();
        let mut took = false;
        match phase {
            Phase::Down => {
                if at.is_some() {
                    return false;
                }
                if self.fingers.is_empty() {
                    self.resume = None;
                    self.caught = !on_fab && self.catch();
                    self.down_at = (x, y);
                    self.pinched = false;
                    self.samples.clear();
                    self.shift = (0.0, 0.0);
                }
                self.fingers.push((id, x, y));
                if !self.samples.is_empty() {
                    let after = self.centroid();
                    self.shift.0 += before.0 - after.0;
                    self.shift.1 += before.1 - after.1;
                }
                if self.fingers.len() >= 2 {
                    self.pinched = true;
                    if self.grab.is_some() {
                        self.rebase();
                    } else {
                        self.take();
                        took = true;
                    }
                }
                self.sample(ms);
            }
            Phase::Move => {
                let Some(k) = at else { return false };
                self.fingers[k] = (id, x, y);
                if self.grab.is_none() {
                    let (dx, dy) = (x - self.down_at.0, y - self.down_at.1);
                    // One finger moves nothing at scale ≤ 1.
                    if dx.hypot(dy) >= SLOP && self.scale.value > 1.0 + 1e-9 {
                        self.take();
                        took = true;
                    }
                }
                self.follow();
                self.sample(ms);
            }
            Phase::Up | Phase::Cancel => {
                let Some(k) = at else { return false };
                self.fingers[k] = (id, x, y);
                self.follow();
                self.sample(ms);
                if self.fingers.len() == 1 {
                    self.fingers.clear();
                    if self.grab.is_some() {
                        let v = self.velocity();
                        self.release(v);
                    } else if self.caught {
                        // A tap on moving content: a snap or the way home finishes; a glide
                        // stays where it was caught (or bounces back in range).
                        match self.resume.take() {
                            Some((s, x, y)) => {
                                Self::spring(&mut self.scale, s);
                                Self::spring(&mut self.tx, x);
                                Self::spring(&mut self.ty, y);
                            }
                            None => self.release((0.0, 0.0)),
                        }
                    }
                    self.caught = false;
                    return false;
                }
                let before = self.centroid();
                self.fingers.remove(k);
                let after = self.centroid();
                self.shift.0 += before.0 - after.0;
                self.shift.1 += before.1 - after.1;
                if self.grab.is_some() {
                    self.rebase();
                }
            }
        }
        took
    }

    /// Steps every motion to `now`; whether anything still moves.
    fn step_motion(&mut self, now: f64) -> bool {
        let mut moving = false;
        for s in [&mut self.scale, &mut self.tx, &mut self.ty] {
            moving |= s.step(now);
        }
        for (glide, s) in [
            (&mut self.glide_x, &mut self.tx),
            (&mut self.glide_y, &mut self.ty),
        ] {
            if let Some((v, m)) = glide.step(now) {
                s.set(v);
                moving |= m;
            }
        }
        moving |= self.press.step(now);
        moving || !self.fingers.is_empty()
    }

    fn double_tap(&mut self, x: f32, y: f32) {
        if self.scale.value > SNAP_BACK_THRESHOLD {
            self.light();
            self.home();
            return;
        }
        let g = self.grid();
        if g.cols > 0 && g.rows > 0 && g.cell_w > 0.0 && g.cell_h > 0.0 {
            let (tap_x, tap_y) = (x as f64 - self.size.0 / 2.0, y as f64 - self.size.1 / 2.0);
            let s = self.scale.value;
            let canvas_x = (tap_x - self.tx.value) / s + g.canvas_w / 2.0;
            let canvas_y = (tap_y - self.ty.value) / s + g.canvas_h / 2.0;
            let (r, c) = self.clamp_cell(
                (canvas_y / g.cell_h).floor() as i32,
                (canvas_x / g.cell_w).floor() as i32,
            );
            self.snap_to_cell(r, c);
        }
    }

    fn fab_hit(&self, x: f32, y: f32) -> bool {
        // The button takes touches through its transformed bounds, only above 0.5 opacity.
        if self.fab_opacity() <= 0.5 {
            return false;
        }
        let (l, t, s) = self.fab_frame(3.0);
        let (cx, cy) = (l + FAB / 2.0, t + FAB / 2.0);
        ((x as f64 - cx).abs() <= FAB / 2.0 * s) && ((y as f64 - cy).abs() <= FAB / 2.0 * s)
    }

    fn rebuild_if_needed(&mut self, now: f64) {
        if self.size.0 <= 0.0 {
            return;
        }
        let want = (self.picked, self.size.0);
        if self.shown == Some(want) {
            return;
        }
        let (tiles, old, count, animate) =
            build_tiles(self.picked, self.size.0, &mut self.prev, &mut self.order);
        self.tiles = tiles;
        self.old_tiles = old;
        self.tile_count = count;
        self.tiles_dirty = true;
        self.shown = Some(want);
        self.anim_pending = false;
        self.anim_start = if animate { Some(now) } else { None };
    }
}

impl Surface for ArtGallery {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let id = inputs.first().and_then(|v| v.as_str()).unwrap_or("");
        let picks = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        let painting = if id.is_empty() {
            None
        } else {
            gallery().paintings.iter().position(|p| p.id == id)
        };
        if picks != self.picks {
            self.picks = picks;
            self.pick(painting);
        } else {
            self.picked = painting;
        }
        Ok(())
    }

    fn size(&mut self, width: f32, height: f32) -> bool {
        self.size = (width as f64, height as f64);
        true
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
        let shown = self
            .picked_shown()
            .map_or("", |p| gallery().paintings[p].id.as_str());
        Some(format!(
            "{{\"painting\":\"{shown}\",\"tiles\":{},\"scale\":{:.3},\"translateX\":{:.2},\"translateY\":{:.2},\"row\":{},\"col\":{},\"focus\":{:.3},\"rearranging\":{},\"fab\":{:.3}}}",
            self.tile_count,
            self.scale.value,
            self.tx.value,
            self.ty.value,
            self.row,
            self.col,
            self.focus.intensity,
            self.anim_start.is_some(),
            self.fab_opacity()
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
        let phase = gfx::phase(phase);
        // pointerEvents is read at the touch-down.
        let fab = phase == Phase::Down && self.fab_hit(x, y);
        // Race(doubleTap, Simultaneous(pinch, pan)).
        let tapped = self.tap.event(id, phase, x, y, at_ms);
        let took = self.touch(id, phase, x as f64, y as f64, at_ms, fab);
        let dragged = phase == Phase::Move
            && self.fingers.len() == 1
            && (x as f64 - self.down_at.0).hypot(y as f64 - self.down_at.1) >= SLOP;
        if took || dragged {
            // The pinch or pan took the touch: the tap fails, the button's touch is cancelled.
            self.tap.reset();
            self.press.cancel();
        }
        if let Some((tx, ty)) = tapped {
            self.press.cancel();
            self.double_tap(tx, ty);
        }
        match phase {
            Phase::Down => {
                self.press.pointer_down(id, fab);
            }
            Phase::Move => self.press.pointer_move(id, self.fab_hit(x, y)),
            Phase::Up => {
                let inside = {
                    let (l, t, s) = self.fab_frame(3.0);
                    let (cx, cy) = (l + FAB / 2.0, t + FAB / 2.0);
                    ((x as f64 - cx).abs() <= FAB / 2.0 * s)
                        && ((y as f64 - cy).abs() <= FAB / 2.0 * s)
                };
                if let Some(press) = self.press.pointer_up(id, inside) {
                    if let Some(m) = press.global_message() {
                        self.posted.push(m.into());
                    }
                    // resetZoom.
                    self.light();
                    self.home();
                }
            }
            Phase::Cancel => {
                self.press.cancel();
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
        self.last_now = now;
        self.size = (frame.width as f64, frame.height as f64);
        let ppp = frame.scale as f64;
        let (pw, ph) = frame.pixels();
        self.rebuild_if_needed(now);
        if self.haptics_pending {
            self.haptics_pending = false;
            // Eight light impacts 100 ms apart, then a medium one.
            self.haptics = (0..8)
                .map(|i| (now + 100.0 * i as f64, "haptic:impact-light"))
                .chain([(now + 800.0, "haptic:impact-medium")])
                .collect();
        }
        while self.haptics.first().is_some_and(|h| h.0 <= now) {
            let (_, m) = self.haptics.remove(0);
            self.posted.push(m.into());
        }
        let moving = self.step_motion(now);
        let g = self.grid();
        self.focus
            .frame(now, self.row, self.col, g.cols, g.rows, g.cell_w, g.cell_h);
        let progress = match self.anim_start {
            Some(start) => {
                let t = (now - start) / 1000.0;
                if t >= 1.0 {
                    self.anim_start = None;
                    0.0
                } else {
                    (1.0 + 9.0 * t) * (-9.0 * t).exp()
                }
            }
            None => 0.0,
        };

        let a = self.fab_opacity();
        let (l, t, s) = self.fab_frame(ppp);
        // ---- device resources ----
        if self.gpu.as_ref().map(|g| (g.format, g.generation))
            != Some((format, frame.shader_generation))
        {
            self.gpu = Some(build(device, queue, format, frame.shader_generation));
            self.tiles_dirty = true;
        }
        let gpu = self.gpu.as_mut().unwrap();
        if gpu.capacity < self.tile_count {
            let cap = self.tile_count.max(15000);
            let buf = |label| {
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some(label),
                    size: (cap * FLOATS_PER_TILE * 4) as u64,
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                })
            };
            gpu.tile_buf = buf("art gallery tiles");
            gpu.old_buf = buf("art gallery old tiles");
            gpu.capacity = cap;
            gpu.bind = mosaic_bind(device, gpu);
            self.tiles_dirty = true;
        }
        if self.tiles_dirty && self.tile_count > 0 {
            queue.write_buffer(&gpu.tile_buf, 0, bytes(&self.tiles));
            queue.write_buffer(&gpu.old_buf, 0, bytes(&self.old_tiles));
        }
        self.tiles_dirty = false;
        if gpu.scene.as_ref().is_none_or(|(s, _, _)| *s != (pw, ph)) {
            let scene = gfx::target(device, "art gallery scene", SCENE, pw, ph);
            let depth = device
                .create_texture(&wgpu::TextureDescriptor {
                    label: Some("art gallery depth"),
                    size: wgpu::Extent3d {
                        width: pw,
                        height: ph,
                        depth_or_array_layers: 1,
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: DEPTH,
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[],
                })
                .create_view(&Default::default());
            gpu.scene = Some(((pw, ph), scene, depth));
        }
        let u = Uniforms {
            screenWidth: frame.width,
            screenHeight: frame.height,
            focusedX: self.focus.pos.0 as f32,
            focusedY: self.focus.pos.1 as f32,
            atlasWidth: (gallery().atlas_cols as f64 * PHOTO_SIZE) as f32,
            atlasHeight: (gallery().atlas_rows as f64 * PHOTO_SIZE) as f32,
            contrast: CONTRAST,
            time: 0.0,
            scale: self.scale.value as f32,
            translateX: self.tx.value as f32,
            translateY: self.ty.value as f32,
            animProgress: progress as f32,
            atlasReveal: ATLAS_COUNT,
            cellWidth: g.cell_w as f32,
            cellHeight: g.cell_h as f32,
            focusIntensity: self.focus.intensity as f32,
            pixelWidth: pw as f32,
            pixelHeight: ph as f32,
            pad0: 0.0,
            pad1: 0.0,
        };
        queue.write_buffer(&gpu.uniforms, 0, &u.bytes());

        // ---- the mosaic, into the scene ----
        let (_, scene, depth) = gpu.scene.as_ref().unwrap();
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("art gallery background"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: scene,
                    resolve_target: None,
                    depth_slice: None,
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
            pass.set_pipeline(&gpu.bg);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..3, 0..1);
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("art gallery tiles"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: scene,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth,
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
            pass.set_pipeline(&gpu.tiles);
            pass.set_bind_group(0, &gpu.bind, &[]);
            pass.draw(0..6, 0..self.tile_count as u32);
        }

        // ---- the zoom-out button, then the frame on screen ----
        let (cx, cy) = ((l + FAB / 2.0) * ppp, (t + FAB / 2.0) * ppp);
        let side = (FAB * ppp).round() as u32;
        // The BlurView: absoluteFill inside the hairline border, scaled with the button.
        let inset = 1.0 / ppp;
        let half = (FAB / 2.0 - inset) * ppp * s;
        let blur_rect = [
            (cx - half) as f32,
            (cy - half) as f32,
            (cx + half) as f32,
            (cy + half) as f32,
        ];
        let mut mapping = [[0.0f32; 4]; 2];
        let mut low: Option<wgpu::TextureView> = None;
        if a > 0.0 {
            let region = [
                blur_rect[0].floor() as i32,
                blur_rect[1].floor() as i32,
                blur_rect[2].ceil() as i32,
                blur_rect[3].ceil() as i32,
            ];
            let params = Material::Regular.chain().at(expo_fraction(BLUR_INTENSITY));
            let out = self.blur.run(
                device,
                queue,
                encoder,
                scene,
                region,
                [0.0, 0.0],
                &params,
                frame.scale,
            );
            mapping = out.mapping;
            low = Some(out.view.clone());
            // The icon and the border, unscaled, into `ink`.
            if gpu.ink.as_ref().is_none_or(|(n, _)| *n != side) {
                gpu.ink = Some((
                    side,
                    gfx::target(device, "art gallery button", SCENE, side, side),
                ));
            }
            if self.icon.is_none() {
                self.icon = Font::new(IONICONS, ICON_SIZE).map(Font::with_ui_layout);
            }
            let c = &mut self.canvas;
            c.begin(frame.scale);
            if let Some(font) = self.icon.as_ref() {
                // iconContainer: absoluteFill inside the border, the Text centred in it, its
                // sides ceiled (after an epsilon) and its offset floored to the pixel (Yoga).
                let side_of = |v: f64| (v * ppp + 1e-3).ceil() / ppp;
                let floor = |v: f64| (v * ppp + 1e-4).floor() / ppp;
                let (tw, th) = (
                    side_of(font.advance_width(CONTRACT_OUTLINE) as f64),
                    side_of(font.ui_line_height() as f64),
                );
                let box_side = FAB - 2.0 * inset;
                let x = inset + floor((box_side - tw) / 2.0);
                let y = inset + floor((box_side - th) / 2.0);
                c.draw_text(
                    CONTRACT_OUTLINE,
                    x as f32,
                    gfx::baseline(font, y as f32),
                    font,
                    &Paint::fill(Color::WHITE),
                );
            }
            // Core Animation's border on a clipping layer: inside the bounds, over the content.
            let r = (FAB / 2.0) as f32;
            c.draw_circle(
                r,
                r,
                r - (inset / 2.0) as f32,
                &Paint::stroke(Color::WHITE.alpha(0.2), inset as f32),
            );
            let ink = &gpu.ink.as_ref().unwrap().1;
            self.renderer.draw(
                device,
                queue,
                encoder,
                &self.canvas,
                ink,
                SCENE,
                side,
                side,
                wgpu::Color::TRANSPARENT,
            );
        }
        let ink_origin = [(l * ppp) as f32, (t * ppp) as f32];
        let pu = Present {
            canvas: [pw as f32, ph as f32, gfx::srgb_flag(format), a as f32],
            fab: [cx as f32, cy as f32, (FAB / 2.0 * ppp * s) as f32, s as f32],
            ink: [ink_origin[0], ink_origin[1], side as f32, side as f32],
            blur: blur_rect,
            m: mapping[0],
            n: mapping[1],
        };
        queue.write_buffer(&gpu.present_uniforms, 0, &pu.bytes());
        let ink_view = gpu
            .ink
            .as_ref()
            .map(|(_, v)| v.clone())
            .unwrap_or_else(|| gpu.blank.clone());
        let low = low.unwrap_or_else(|| gpu.blank.clone());
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("art gallery present"),
            layout: &gpu.present_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: gpu.present_uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(scene),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&low),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&ink_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                },
            ],
        });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("art gallery present"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
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
            pass.set_pipeline(&gpu.present);
            pass.set_bind_group(0, &bind, &[]);
            pass.draw(0..3, 0..1);
        }
        moving
            || self.anim_start.is_some()
            || self.focus.start.is_some()
            || !self.haptics.is_empty()
            || self.haptics_pending
    }
}

fn bytes(v: &[f32]) -> &[u8] {
    // f32 is plain old data.
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
}

fn mosaic_bind(device: &wgpu::Device, gpu: &Gpu) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("art gallery mosaic"),
        layout: &gpu.layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: gpu.uniforms.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: gpu.tile_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: gpu.old_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: wgpu::BindingResource::TextureView(&gpu.atlas),
            },
            wgpu::BindGroupEntry {
                binding: 4,
                resource: wgpu::BindingResource::Sampler(&gpu.sampler),
            },
        ],
    })
}

/// The atlas: the .astc file's blocks as an ASTC 10×10 texture (its 16-byte header holds the size).
/// Without ASTC on the device, a 1×1 transparent placeholder.
fn atlas(device: &wgpu::Device, queue: &wgpu::Queue) -> wgpu::TextureView {
    let dim = |o: usize| ATLAS[o] as u32 | (ATLAS[o + 1] as u32) << 8 | (ATLAS[o + 2] as u32) << 16;
    let (w, h) = (dim(7), dim(10));
    let astc = device
        .features()
        .contains(wgpu::Features::TEXTURE_COMPRESSION_ASTC);
    let (format, size, data, row, rows) = if astc && w > 0 && h > 0 {
        let (bw, bh) = (w.div_ceil(10), h.div_ceil(10));
        (
            wgpu::TextureFormat::Astc {
                block: wgpu::AstcBlock::B10x10,
                channel: wgpu::AstcChannel::Unorm,
            },
            (w, h),
            &ATLAS[16..],
            bw * 16,
            bh,
        )
    } else {
        (
            wgpu::TextureFormat::Rgba8Unorm,
            (1, 1),
            &[0u8, 0, 0, 0][..],
            4,
            1,
        )
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("art gallery atlas"),
        size: wgpu::Extent3d {
            width: size.0,
            height: size.1,
            depth_or_array_layers: 1,
        },
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
        data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(row),
            rows_per_image: Some(rows),
        },
        wgpu::Extent3d {
            width: size.0,
            height: size.1,
            depth_or_array_layers: 1,
        },
    );
    texture.create_view(&Default::default())
}

fn build(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    format: wgpu::TextureFormat,
    generation: u32,
) -> Gpu {
    let module = device.create_shader_module(shaders::art_gallery::module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let bg = gfx::fullscreen(
        device,
        SCENE,
        &module,
        &layout,
        entry::BG_VS,
        entry::BG_FS,
        None,
        "art gallery background",
    );
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("art gallery tiles"),
        bind_group_layouts: &[Some(&layout)],
        immediate_size: 0,
    });
    let tiles = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("art gallery tiles"),
        layout: Some(&pl),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some(entry::TILE_VS),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some(entry::TILE_FS),
            targets: &[Some(wgpu::ColorTargetState {
                format: SCENE,
                blend: None,
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
            format: DEPTH,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    let present_module = device.create_shader_module(shaders::art_gallery_present::module());
    let present_layout = device.create_bind_group_layout(&PRESENT_GROUP);
    let present = gfx::fullscreen(
        device,
        format,
        &present_module,
        &present_layout,
        present_entry::PRESENT_VS,
        present_entry::PRESENT_FS,
        None,
        "art gallery present",
    );
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("art gallery uniforms"),
        size: Uniforms::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let present_uniforms = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("art gallery present"),
        size: Present::SIZE as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let buf = |label| {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(label),
            size: (15000 * FLOATS_PER_TILE * 4) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    };
    let (tile_buf, old_buf) = (buf("art gallery tiles"), buf("art gallery old tiles"));
    // Linear min and mag, clamped to the edge, no mipmaps.
    let sampler = gfx::linear_sampler(device, "art gallery");
    let atlas = atlas(device, queue);
    let blank = gfx::target(device, "art gallery blank", SCENE, 1, 1);
    let mut gpu = Gpu {
        format,
        generation,
        bg,
        tiles,
        present,
        layout,
        present_layout,
        uniforms,
        present_uniforms,
        tile_buf,
        old_buf,
        capacity: 15000,
        atlas,
        sampler,
        bind: device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: None,
                entries: &[],
            }),
            entries: &[],
        }),
        scene: None,
        ink: None,
        blank,
    };
    gpu.bind = mosaic_bind(device, &gpu);
    gpu
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{PointerKind, PointerPhase, fixture};

    const W: f32 = 420.0;
    const H: f32 = 912.0;

    fn frame(now_ms: f64, scale: f32) -> Frame {
        Frame {
            width: W,
            height: H,
            scale,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: exact_gpu::shaders::shader_generation(),
            headroom: 1.0,
        }
    }

    fn touch(s: &mut Box<dyn Surface>, id: u32, phase: PointerPhase, x: f32, y: f32, at_ms: f64) {
        s.input(&InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        });
    }

    fn field(s: &mut Box<dyn Surface>, key: &str) -> String {
        let a = s.agent("{}").unwrap();
        let k = format!("\"{key}\":");
        let at = a.find(&k).unwrap() + k.len();
        a[at..]
            .split([',', '}'])
            .next()
            .unwrap()
            .trim_matches('"')
            .to_string()
    }

    #[test]
    fn the_bake_holds_every_painting_and_the_slots() {
        let g = gallery();
        assert_eq!(g.slots.len(), 10000);
        assert_eq!((g.atlas_rows, g.atlas_cols), (25, 40));
        assert!(g.slots.iter().all(|&s| (s as usize) < 979));
        assert_eq!(g.paintings.len(), 26);
        assert_eq!(g.paintings[0].id, "mona-lisa");
        for p in &g.paintings {
            // analyzeImage: rows = round(√(10000 / aspect)), cols = round(rows × aspect).
            let aspect = p.width / p.height;
            let rows = (10000.0 / aspect).sqrt().round();
            assert_eq!(
                (p.rows as f64, p.cols as f64),
                (rows, (rows * aspect).round()),
                "{}",
                p.id
            );
        }
        // The atlas header: 10×10 blocks, 8000 × 5000 (25 rows of 200).
        assert_eq!(&ATLAS[4..7], &[10, 10, 1]);
    }

    #[test]
    fn every_transition_fits_rns_tile_buffers() {
        // The buffers hold 15000 tiles: new and disappearing ones, between any two paintings.
        let n = gallery().paintings.len();
        let shows: Vec<Option<usize>> = std::iter::once(None).chain((0..n).map(Some)).collect();
        for &a in &shows {
            for &b in &shows {
                let (mut prev, mut order) = (Vec::new(), Vec::new());
                build_tiles(a, W as f64, &mut prev, &mut order);
                let (_, _, count, animate) = build_tiles(b, W as f64, &mut prev, &mut order);
                assert!(animate);
                assert!(count <= 15000, "{a:?} → {b:?}: {count}");
            }
        }
    }

    #[test]
    fn a_new_painting_moves_each_photo_from_where_it_was() {
        let (mut prev, mut order) = (Vec::new(), Vec::new());
        let (atlas, _, n, animate) = build_tiles(None, W as f64, &mut prev, &mut order);
        assert_eq!((n, animate), (10000, false));
        // The atlas: photo i at cell i of 100 × 100 over 399 pt, centred.
        let cw = (420.0 * 0.95 / 100.0) as f32;
        assert_eq!(
            &atlas[12..16],
            &[(cw as f64 - 199.5) as f32, -199.5, cw, cw]
        );
        let (tiles, old, n, animate) = build_tiles(Some(0), W as f64, &mut prev, &mut order);
        assert!(animate);
        let p = &gallery().paintings[0];
        let first = p.photos.iter().position(|&id| id != EMPTY).unwrap();
        let id = p.photos[first] as usize;
        // The old position of the first tile is photo `id`'s atlas cell.
        assert_eq!(&old[0..4], &atlas[id * 12..id * 12 + 4]);
        assert_eq!(tiles[2], (399.0 / p.cols as f64) as f32);
        let valid = p.photos.iter().filter(|&&v| v != EMPTY).count();
        let distinct = {
            let mut s = p
                .photos
                .iter()
                .filter(|&&v| v != EMPTY)
                .copied()
                .collect::<Vec<_>>();
            s.sort();
            s.dedup();
            s.len()
        };
        assert_eq!(n, valid + (10000 - distinct));
        // A painting that leaves photos out after the atlas: they shrink to their old centre.
        let mut shrunk = 0;
        for k in 0..gallery().paintings.len() {
            let (mut prev, mut order) = (Vec::new(), Vec::new());
            build_tiles(None, W as f64, &mut prev, &mut order);
            let (tiles, old, n, _) = build_tiles(Some(k), W as f64, &mut prev, &mut order);
            let valid = gallery().paintings[k]
                .photos
                .iter()
                .filter(|&&v| v != EMPTY)
                .count();
            for i in valid..n {
                let o = i * 12;
                assert_eq!((tiles[o + 2], tiles[o]), (0.0, old[o] + old[o + 2] / 2.0));
                shrunk += 1;
            }
        }
        assert!(shrunk > 0);
    }

    #[test]
    fn the_mosaic_draws_and_the_gestures_zoom() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = surface();
        s.bind(&[Value::from(String::new()), Value::Number(0.0)], None)
            .unwrap();
        s.size(W, H);
        let (a, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0, 1.0)).unwrap();
        a.save("art-gallery-atlas");
        assert!(!animating);
        // Outside the 399 pt square, the background's radial gradient: at the top corner
        // dist ≥ 0.7 → 0.02 (5); just above the square, brighter.
        assert_eq!(&a.at(2, 2)[..3], &[5, 5, 5]);
        let above = a.at(210, 250)[0];
        assert!((10..=31).contains(&above), "{above}");
        // Inside, photos (an ASTC device draws them; without, black tiles).
        if gpu
            .device
            .features()
            .contains(wgpu::Features::TEXTURE_COMPRESSION_ASTC)
        {
            let lit = (0..40)
                .filter(|k| a.at(20 + k * 9, 300 + k * 8)[..3].iter().any(|&c| c > 20))
                .count();
            assert!(lit > 30, "{lit}");
        }
        assert_eq!(field(&mut s, "fab"), "0.000");

        // A double tap on the centre: the cell under it fills 70 % of the width.
        touch(&mut s, 1, PointerPhase::Down, 210.0, 456.0, 100.0);
        touch(&mut s, 1, PointerPhase::Up, 210.0, 456.0, 150.0);
        touch(&mut s, 1, PointerPhase::Down, 211.0, 456.0, 300.0);
        touch(&mut s, 1, PointerPhase::Up, 211.0, 456.0, 350.0);
        assert_eq!(s.messages(), ["haptic:impact-light"]);
        assert_eq!(
            (field(&mut s, "row"), field(&mut s, "col")),
            ("50".into(), "50".into())
        );
        let mut ms = 400.0;
        while ms < 1400.0 {
            fixture::render(&gpu, s.as_mut(), &frame(ms, 1.0)).unwrap();
            ms += 16.0;
        }
        // idealGridScale = 0.7 × 420 / 3.99; cell 50's centre at 0.5 × 3.99 right of the middle.
        let ideal = 0.7 * 420.0 / 3.99;
        assert_eq!(field(&mut s, "scale"), format!("{ideal:.3}"));
        assert_eq!(
            field(&mut s, "translateX"),
            format!("{:.2}", -(50.5 * 3.99 - 199.5) * ideal)
        );
        assert_eq!(field(&mut s, "focus"), "1.000");
        assert_eq!(field(&mut s, "fab"), "1.000");
        let (b, _) = fixture::render(&gpu, s.as_mut(), &frame(ms, 1.0)).unwrap();
        b.save("art-gallery-zoomed");

        // The zoom-out button (344, 816, 56 × 56): the global haptic, then resetZoom.
        touch(&mut s, 2, PointerPhase::Down, 372.0, 844.0, ms);
        fixture::render(&gpu, s.as_mut(), &frame(ms + 100.0, 1.0)).unwrap();
        touch(&mut s, 2, PointerPhase::Up, 372.0, 844.0, ms + 120.0);
        assert_eq!(s.messages(), ["haptic:selection", "haptic:impact-light"]);
        let mut t = ms + 140.0;
        while t < ms + 1400.0 {
            fixture::render(&gpu, s.as_mut(), &frame(t, 1.0)).unwrap();
            t += 16.0;
        }
        assert_eq!(field(&mut s, "scale"), "1.000");
        assert_eq!(field(&mut s, "focus"), "0.000");

        // A pick: eight light impacts 100 ms apart, then medium; the tiles rearrange over 1 s.
        s.bind(
            &[Value::from("starry-night".to_string()), Value::Number(1.0)],
            None,
        )
        .unwrap();
        let start = t;
        let mut heard = Vec::new();
        let mut mid = None;
        while t < start + 1200.0 {
            fixture::render(&gpu, s.as_mut(), &frame(t, 1.0)).unwrap();
            if mid.is_none() && t >= start + 150.0 {
                mid = Some(fixture::render(&gpu, s.as_mut(), &frame(t, 1.0)).unwrap().0);
            }
            heard.extend(s.messages());
            t += 16.0;
        }
        mid.unwrap().save("art-gallery-rearranging");
        assert_eq!(heard.len(), 9);
        assert_eq!(heard[8], "haptic:impact-medium");
        assert_eq!(field(&mut s, "painting"), "starry-night");
        assert_eq!(field(&mut s, "rearranging"), "false");
        let (c, animating) = fixture::render(&gpu, s.as_mut(), &frame(t, 1.0)).unwrap();
        c.save("art-gallery-starry-night");
        assert!(!animating);
        assert_ne!(a.data, c.data);
        // The same painting again: only the zoom and the haptics.
        s.bind(
            &[Value::from("starry-night".to_string()), Value::Number(2.0)],
            None,
        )
        .unwrap();
        fixture::render(&gpu, s.as_mut(), &frame(t + 16.0, 1.0)).unwrap();
        assert_eq!(field(&mut s, "rearranging"), "false");
    }

    // ---- gestures: synthetic pointer sequences on the surface, its motion stepped at 120 Hz ----

    fn at(scale: f64, tx: f64, ty: f64) -> ArtGallery {
        let mut g = new();
        g.size = (W as f64, H as f64);
        g.scale.set(scale);
        g.tx.set(tx);
        g.ty.set(ty);
        g
    }

    fn put(g: &mut ArtGallery, id: u32, phase: PointerPhase, x: f64, y: f64, at_ms: f64) {
        g.input(&InputEvent::Pointer {
            id,
            phase,
            x: x as f32,
            y: y as f32,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        });
    }

    /// Frames every 8.33 ms from `from` until nothing moves; the time it stopped and every tx.
    fn run(g: &mut ArtGallery, from: f64) -> (f64, Vec<f64>) {
        let (mut t, mut xs) = (from, Vec::new());
        while t < from + 5000.0 {
            g.last_now = t;
            let moving = g.step_motion(t);
            xs.push(g.tx.value);
            if !moving {
                break;
            }
            t += 1000.0 / 120.0;
        }
        (t, xs)
    }

    /// The content point (from the canvas's centre, unscaled) under a screen point.
    fn content(g: &ArtGallery, x: f64, y: f64) -> (f64, f64) {
        (
            (x - W as f64 / 2.0 - g.tx.value) / g.scale.value,
            (y - H as f64 / 2.0 - g.ty.value) / g.scale.value,
        )
    }

    fn transform(g: &ArtGallery) -> (f64, f64, f64) {
        (g.scale.value, g.tx.value, g.ty.value)
    }

    fn near(a: (f64, f64, f64), b: (f64, f64, f64)) -> bool {
        (a.0 - b.0).abs() < 1e-9 && (a.1 - b.1).abs() < 1e-6 && (a.2 - b.2).abs() < 1e-6
    }

    #[test]
    fn a_pinch_keeps_the_content_under_moving_fingers() {
        // A pinch must keep the focal point under the fingers, or the content slides out from under them.
        let mut g = at(4.0, 100.0, -50.0);
        put(&mut g, 1, PointerPhase::Down, 150.0, 400.0, 0.0);
        put(&mut g, 2, PointerPhase::Down, 250.0, 400.0, 5.0);
        let q0 = content(&g, 200.0, 400.0);
        for i in 1..=20 {
            let k = i as f64 / 20.0;
            let (cx, cy, half) = (200.0 + 30.0 * k, 400.0 + 80.0 * k, 50.0 + 20.0 * k);
            put(
                &mut g,
                1,
                PointerPhase::Move,
                cx - half,
                cy,
                5.0 + 8.0 * i as f64,
            );
            put(
                &mut g,
                2,
                PointerPhase::Move,
                cx + half,
                cy,
                6.0 + 8.0 * i as f64,
            );
            let q = content(&g, cx, cy);
            assert!(
                (q.0 - q0.0).abs() < 1e-6 && (q.1 - q0.1).abs() < 1e-6,
                "{i}: {q:?} {q0:?}"
            );
        }
        assert!((g.scale.value - 4.0 * 1.4).abs() < 1e-9);
    }

    #[test]
    fn one_and_two_fingers_hand_over_without_a_jump() {
        // Lifting one finger of a pinch must not throw the content back by the pinch's travel.
        let mut g = at(4.0, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 200.0, 400.0, 0.0);
        for i in 1..=5 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                200.0 + 8.0 * i as f64,
                400.0,
                16.0 * i as f64,
            );
        }
        // From the activation (16 pt) the content follows 1:1: 24 more.
        assert!((g.tx.value - 24.0).abs() < 1e-6, "{}", g.tx.value);
        let before = transform(&g);
        put(&mut g, 2, PointerPhase::Down, 320.0, 520.0, 100.0);
        assert!(near(transform(&g), before));
        put(&mut g, 2, PointerPhase::Move, 360.0, 560.0, 116.0);
        assert!(g.scale.value > 4.0);
        let pinched = transform(&g);
        put(&mut g, 1, PointerPhase::Up, 240.0, 400.0, 130.0);
        assert!(near(transform(&g), pinched));
        put(&mut g, 2, PointerPhase::Move, 380.0, 540.0, 146.0);
        let after = transform(&g);
        assert!((after.0 - pinched.0).abs() < 1e-9);
        assert!(
            (after.1 - pinched.1 - 20.0).abs() < 1e-6 && (after.2 - pinched.2 + 20.0).abs() < 1e-6
        );
        // And back to two: still no jump.
        put(&mut g, 3, PointerPhase::Down, 100.0, 100.0, 160.0);
        assert!(near(transform(&g), after));
    }

    #[test]
    fn the_scale_rubber_bands_past_its_limits_and_springs_back() {
        // Over the top: resisting, never past twice the limit; a release snaps to the cell.
        let mut g = at(60.0, 0.0, 0.0);
        let max = g.max_scale();
        put(&mut g, 1, PointerPhase::Down, 160.0, 456.0, 0.0);
        put(&mut g, 2, PointerPhase::Down, 260.0, 456.0, 0.0);
        let (mut last, mut step) = (60.0, f64::INFINITY);
        for i in 1..=40 {
            let half = 50.0 + 5.0 * i as f64;
            put(
                &mut g,
                1,
                PointerPhase::Move,
                210.0 - half,
                456.0,
                8.0 * i as f64,
            );
            put(
                &mut g,
                2,
                PointerPhase::Move,
                210.0 + half,
                456.0,
                8.0 * i as f64 + 1.0,
            );
            let s = g.scale.value;
            assert!(s > last && s < 2.0 * max, "{i}: {s}");
            if last > max {
                // Each step adds less than the one before (the band stiffens).
                assert!(s - last < step, "{i}");
                step = s - last;
            }
            last = s;
        }
        assert!(last > max);
        put(&mut g, 1, PointerPhase::Up, 10.0, 456.0, 400.0);
        put(&mut g, 2, PointerPhase::Up, 410.0, 456.0, 401.0);
        run(&mut g, 410.0);
        assert!((g.scale.value - g.ideal_grid_scale()).abs() < 1e-6);
        assert_eq!((g.row, g.col), (50, 50));

        // Under 1: down towards 0.5, never under; a release goes home.
        let mut g = at(1.0, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 110.0, 456.0, 0.0);
        put(&mut g, 2, PointerPhase::Down, 310.0, 456.0, 0.0);
        put(&mut g, 1, PointerPhase::Move, 185.0, 456.0, 16.0);
        put(&mut g, 2, PointerPhase::Move, 235.0, 456.0, 17.0);
        let s = g.scale.value;
        assert!(s > 0.5 && s < 1.0 && s > 0.25, "{s}");
        put(&mut g, 1, PointerPhase::Up, 185.0, 456.0, 30.0);
        put(&mut g, 2, PointerPhase::Up, 235.0, 456.0, 31.0);
        let (t, _) = run(&mut g, 40.0);
        assert_eq!(transform(&g), (1.0, 0.0, 0.0));
        assert!(t < 40.0 + 700.0, "{t}");
    }

    #[test]
    fn a_drag_past_the_edge_rubber_bands_and_bounces_back() {
        let mut g = at(3.0, 0.0, 0.0);
        let (bx, _) = g.bounds(3.0);
        g.tx.set(bx);
        // A slow drag (100 pt/s, under UIScrollView's fling) 300 pt to the right.
        put(&mut g, 1, PointerPhase::Down, 100.0, 400.0, 0.0);
        for i in 1..=30 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                100.0 + 10.0 * i as f64,
                400.0,
                100.0 * i as f64,
            );
        }
        let over = g.tx.value - bx;
        // 290 pt of travel past the bound shows as band(290, 420).
        assert!(
            (over - band(290.0, W as f64)).abs() < 1e-6 && over < 150.0,
            "{over}"
        );
        put(&mut g, 1, PointerPhase::Up, 400.0, 400.0, 3000.0);
        let (t, xs) = run(&mut g, 3000.0);
        assert!(xs.windows(2).all(|w| w[1] <= w[0] + 1e-9), "monotonic back");
        assert!(xs.iter().all(|&x| x >= bx - 0.01));
        assert!((g.tx.value - bx).abs() < 1e-9);
        assert!(t - 3000.0 < 900.0, "{}", t - 3000.0);
    }

    #[test]
    fn a_fling_decelerates_as_uiscrollview_and_bounces_off_the_bound() {
        // 500 pt/s, in range: UIKit's projection (v − 0.00988) / −ln 0.998 past the lift.
        let mut g = at(3.0, -300.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 100.0, 400.0, 0.0);
        for i in 1..=10 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                100.0 + 5.0 * i as f64,
                400.0,
                10.0 * i as f64,
            );
        }
        put(&mut g, 1, PointerPhase::Up, 150.0, 400.0, 110.0);
        let lifted = g.tx.value;
        let (t, xs) = run(&mut g, 120.0);
        let projected = (0.5 - STOP_VELOCITY) / -DECELERATION.ln();
        assert!(
            (g.tx.value - lifted - projected).abs() < 1e-6,
            "{} {projected}",
            g.tx.value - lifted
        );
        assert!(xs.windows(2).all(|w| w[1] >= w[0]));
        assert!(t > 1000.0, "{t}");

        // 2000 pt/s towards the bound: through it, then back onto it.
        let mut g = at(3.0, 0.0, 0.0);
        let (bx, _) = g.bounds(3.0);
        put(&mut g, 1, PointerPhase::Down, 100.0, 400.0, 0.0);
        for i in 1..=10 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                100.0 + 20.0 * i as f64,
                400.0,
                10.0 * i as f64,
            );
        }
        put(&mut g, 1, PointerPhase::Up, 300.0, 400.0, 110.0);
        let (_, xs) = run(&mut g, 120.0);
        let peak = xs.iter().cloned().fold(f64::MIN, f64::max);
        assert!(peak > bx + 5.0 && peak < bx + W as f64, "{peak} {bx}");
        assert!((g.tx.value - bx).abs() < 1e-9);

        // A slow lift (200 pt/s) stops under the finger.
        let mut g = at(3.0, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 100.0, 400.0, 0.0);
        for i in 1..=10 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                100.0 + 4.0 * i as f64,
                400.0,
                20.0 * i as f64,
            );
        }
        put(&mut g, 1, PointerPhase::Up, 140.0, 400.0, 210.0);
        let lifted = g.tx.value;
        run(&mut g, 220.0);
        assert_eq!(g.tx.value, lifted);
    }

    #[test]
    fn a_touch_catches_a_fling_and_a_tap_lets_a_snap_finish() {
        let mut g = at(3.0, -300.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 100.0, 400.0, 0.0);
        for i in 1..=10 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                100.0 + 5.0 * i as f64,
                400.0,
                10.0 * i as f64,
            );
        }
        put(&mut g, 1, PointerPhase::Up, 150.0, 400.0, 110.0);
        let mut t = 120.0;
        for _ in 0..20 {
            g.last_now = t;
            g.step_motion(t);
            t += 8.33;
        }
        put(&mut g, 2, PointerPhase::Down, 200.0, 400.0, t);
        let held = g.tx.value;
        g.step_motion(t + 8.33);
        assert_eq!(g.tx.value, held);
        put(&mut g, 2, PointerPhase::Up, 200.0, 400.0, t + 50.0);
        run(&mut g, t + 60.0);
        assert_eq!(g.tx.value, held);

        // A double tap's snap, interrupted by a tap, still lands on the cell.
        let mut g = at(1.0, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 210.0, 456.0, 0.0);
        put(&mut g, 1, PointerPhase::Up, 210.0, 456.0, 50.0);
        put(&mut g, 1, PointerPhase::Down, 210.0, 456.0, 150.0);
        put(&mut g, 1, PointerPhase::Up, 210.0, 456.0, 200.0);
        for i in 0..10 {
            g.step_motion(210.0 + 8.33 * i as f64);
        }
        let mid = g.scale.value;
        assert!(mid > 1.5 && mid < g.ideal_grid_scale() - 1.0, "{mid}");
        put(&mut g, 2, PointerPhase::Down, 50.0, 700.0, 300.0);
        put(&mut g, 2, PointerPhase::Up, 50.0, 700.0, 340.0);
        run(&mut g, 350.0);
        assert!((g.scale.value - g.ideal_grid_scale()).abs() < 1e-6);
    }

    #[test]
    fn a_double_tap_zooms_into_the_tapped_cell_and_back_out() {
        let mut g = at(1.0, 0.0, 0.0);
        // A tap 60 pt left and 100 pt up of the centre: cell (row, col) under it.
        let (x, y): (f64, f64) = (150.0, 356.0);
        let cw: f64 = 399.0 / 100.0;
        // The second tap's point (RNGH's onEnd event).
        let col = ((x + 2.0 - 210.0 + 199.5) / cw).floor() as i32;
        let row = ((y - 456.0 + 199.5) / cw).floor() as i32;
        put(&mut g, 1, PointerPhase::Down, x, y, 0.0);
        put(&mut g, 1, PointerPhase::Up, x, y, 60.0);
        put(&mut g, 1, PointerPhase::Down, x + 2.0, y, 200.0);
        put(&mut g, 1, PointerPhase::Up, x + 2.0, y, 260.0);
        assert_eq!((g.row, g.col), (row, col));
        run(&mut g, 270.0);
        let ideal = g.ideal_grid_scale();
        assert!((g.scale.value - ideal).abs() < 1e-6);
        // The tapped cell is centred.
        let c = content(&g, 210.0, 456.0);
        assert!(
            (c.0 - ((col as f64 + 0.5) * cw - 199.5)).abs() < 1e-6,
            "{c:?}"
        );
        put(&mut g, 1, PointerPhase::Down, 300.0, 300.0, 2000.0);
        put(&mut g, 1, PointerPhase::Up, 300.0, 300.0, 2050.0);
        put(&mut g, 1, PointerPhase::Down, 300.0, 300.0, 2150.0);
        put(&mut g, 1, PointerPhase::Up, 300.0, 300.0, 2200.0);
        run(&mut g, 2210.0);
        assert_eq!(transform(&g), (1.0, 0.0, 0.0));
    }

    #[test]
    fn one_finger_at_scale_1_moves_nothing_and_a_drag_is_no_tap() {
        let mut g = at(1.0, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 200.0, 400.0, 0.0);
        put(&mut g, 1, PointerPhase::Up, 200.0, 400.0, 50.0);
        put(&mut g, 1, PointerPhase::Down, 200.0, 400.0, 150.0);
        for i in 1..=6 {
            put(
                &mut g,
                1,
                PointerPhase::Move,
                200.0 + 10.0 * i as f64,
                400.0,
                150.0 + 10.0 * i as f64,
            );
        }
        put(&mut g, 1, PointerPhase::Up, 260.0, 400.0, 230.0);
        assert_eq!(transform(&g), (1.0, 0.0, 0.0));
        assert!(
            !g.scale.running && g.row == -1,
            "the drag failed the double tap"
        );
        assert!(g.posted.is_empty());
    }

    #[test]
    fn a_pinch_released_in_grid_mode_snaps_to_the_centred_cell() {
        let ideal = at(1.0, 0.0, 0.0).ideal_grid_scale();
        let mut g = at(ideal, 0.0, 0.0);
        put(&mut g, 1, PointerPhase::Down, 160.0, 456.0, 0.0);
        put(&mut g, 2, PointerPhase::Down, 260.0, 456.0, 0.0);
        // Pinch in a little and drift 100 pt left: the cell right of the middle comes in.
        for i in 1..=10 {
            let k = i as f64 / 10.0;
            put(
                &mut g,
                1,
                PointerPhase::Move,
                160.0 + 5.0 * k - 100.0 * k,
                456.0,
                16.0 * i as f64,
            );
            put(
                &mut g,
                2,
                PointerPhase::Move,
                260.0 - 5.0 * k - 100.0 * k,
                456.0,
                16.0 * i as f64 + 1.0,
            );
        }
        assert!(g.scale.value < ideal);
        let (r, c) = g.centred_cell();
        put(&mut g, 1, PointerPhase::Up, 65.0, 456.0, 200.0);
        put(&mut g, 2, PointerPhase::Up, 155.0, 456.0, 201.0);
        assert_eq!((g.row, g.col), (r, c));
        assert_eq!(g.posted, ["haptic:impact-light"]);
        run(&mut g, 210.0);
        assert!((g.scale.value - ideal).abs() < 1e-6);
    }
}
