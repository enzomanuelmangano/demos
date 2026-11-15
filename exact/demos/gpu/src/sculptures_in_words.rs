//! Sculptures in Words: three articles (the Venus de Milo, the Victory of Samothrace, Rodin's
//! Thinker) whose letters lift off the column onto their statue at a tap, and back. While a statue
//! shows, a sideways drag re-seats the letters onto the next figure. The window is white.
//!
//! - The column: each article is baked into glyph positions per width and drawn as lines of
//!   glyphs, shifted by the scroll.
//! - The figure: one instanced quad per letter, in a WGSL shader with a depth buffer, composited
//!   over the column.
//! - The clock: a spring from 0 (the column) to 1 (the statue) on each tap. The statue's yaw turns
//!   while it shows and springs back when it hides.
//! - Haptics: 14 light impacts spread over the departures.
//! - Scrolls: vertical while the clock is near 0 (reading), horizontal across the three pages while
//!   it is near 1 (crossing). A touch stays with the scroll it went down on.

use std::sync::OnceLock;

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use motion::Spring;
use draw2d::{point, Canvas, Color, Font, Images, Matrix, Paint, Renderer, Shader};

use crate::gfx;
use crate::shaders::sculptures_in_words::{entry, GROUP_0};
use crate::ui_scroll::{Snap, UiScroll};

/// Newsreader's glyphs the columns use (a subset), still variable: Core Text draws them at opsz 12.
static FONT: &[u8] = include_bytes!("../fonts/newsreader-sculptures-subset.ttf");
/// The baked columns and figure data, zlib-compressed.
static BAKED: &[u8] = include_bytes!("../images/sculptures-in-words/sculptures.bin.zlib");

const PAGE_BG: u32 = 0xffffff;
/// A linear gradient from `y0` to `y1`, full width.
fn fade_rect(c: &mut Canvas, w: f32, y0: f32, y1: f32, stops: &[(f32, Color)]) {
    let shader = Shader::Linear { start: point(0.0, y0), end: point(0.0, y1), stops: stops.to_vec() };
    c.draw_rect(0.0, y0.min(y1), w, (y1 - y0).abs(), &Paint::shader(shader));
}

/// The canvas's clear: opaque PAGE_BG. The web's canvas composites over black with no other alpha
/// mode, so a transparent clear would show black.
fn page_clear() -> wgpu::Color {
    let c = |k: u32| ((PAGE_BG >> k) & 0xff) as f64 / 255.0;
    wgpu::Color { r: c(16), g: c(8), b: c(0), a: 1.0 }
}
const PAPER_INK: u32 = 0x1c1a17;
const GLYPH_FONT_SIZE: f64 = 46.0;
const PAGE_GLYPH_SCALE: f64 = 0.34;
const PAGE_MARGIN_FRAC: f64 = 0.09;
const PAGE_TOP_FRAC: f64 = 0.14;
const GLYPH_WORLD: f64 = 0.036;
const CAMERA_DIST: f64 = 6.4;
const CAMERA_FOV: f64 = 32.0 * std::f64::consts::PI / 180.0;
const CAMERA_TARGET: [f64; 3] = [0.0, 0.05, 0.0];
const IDLE_SPIN: f64 = 0.35;
const SHAPE_LEAN: f64 = 0.08;
const SHAPE_YAW_OFFSET: f64 = std::f64::consts::PI * 1.35;
const CLOCK: motion::SpringConfig = motion::SpringConfig {
    stiffness: 2.2,
    damping: 2.098,
    mass: 0.5,
};
const MORPH_DURATION_MS: f64 = 3500.0;
const STAGGER: f64 = 0.5;
const BOTTOM_FADE_FRAC: f64 = 0.22;
const TOP_FADE_FRAC: f64 = 0.14;
const FADE_STOPS: usize = 12;
/// Paginator geometry, in points.
const FAB_SIZE: f64 = 48.0;
const DOT_SIZE: f64 = 6.0;
const DOT_ACTIVE_WIDTH: f64 = 16.0;
const DOT_SPACING: f64 = 8.0;
/// Floats per baked point, per instance and in the uniform block.
const POINT_STRIDE: usize = 7;
const INSTANCE_FLOATS: usize = 36;
const UNIFORM_FLOATS: usize = 52;
const MAX_PIXEL_RATIO: f32 = 3.0;
/// Subpixel phases per glyph in the atlas.
const PHASES: usize = 4;
/// Impact ticks spread over the departures.
const TICKS: usize = 14;
/// Scroll deceleration rates, per ms: normal and fast.
const RATE_NORMAL: f64 = 0.998;
const RATE_FAST: f64 = 0.99;
const ARTICLES: usize = 3;

/// The surface. Input: whether the statue is shown (the button's toggle).
pub fn surface() -> Box<dyn Surface> {
    Box::new(Sculptures::new())
}

// ---- the bake ----

struct Article {
    /// Per mark: its glyph as an index into `Baked::union`.
    cell: Vec<u16>,
    /// Per mark: its x along its paragraph, iOS's 16.16 units.
    p: Vec<i32>,
    /// Line k's baseline below the paragraph's top.
    baselines: Vec<f32>,
    /// Per width from `w_min`: the paragraph's height and each line (marks | 0x80 opens one).
    widths: Vec<(f32, Vec<u8>)>,
}

struct Baked {
    w_min: usize,
    union: Vec<u16>,
    /// getGlyphWidths of each union glyph (Core Text's at 15.64, f32).
    adv: Vec<f32>,
    articles: Vec<Article>,
    /// bust, nike, thinker: x y z nx ny nz ao per point, the latter two fitted to the bust.
    clouds: Vec<Vec<f32>>,
    nike_for_bust: Vec<u16>,
    thinker_for_bust: Vec<u16>,
}

fn baked() -> &'static Baked {
    static BAKED_DATA: OnceLock<Baked> = OnceLock::new();
    BAKED_DATA.get_or_init(|| {
        parse(&miniz_oxide::inflate::decompress_to_vec_zlib(BAKED).expect("sculptures.bin"))
    })
}

struct Reader<'a>(&'a [u8], usize);
impl Reader<'_> {
    fn take(&mut self, n: usize) -> &[u8] {
        let s = &self.0[self.1..self.1 + n];
        self.1 += n;
        s
    }
    fn u8(&mut self) -> u8 {
        self.take(1)[0]
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes(self.take(2).try_into().unwrap())
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.take(4).try_into().unwrap())
    }
    fn f32(&mut self) -> f32 {
        f32::from_le_bytes(self.take(4).try_into().unwrap())
    }
    fn i32(&mut self) -> i32 {
        i32::from_le_bytes(self.take(4).try_into().unwrap())
    }
}

fn parse(b: &[u8]) -> Baked {
    let mut r = Reader(b, 0);
    assert_eq!(r.take(4), b"SIW1");
    let w_min = r.u16() as usize;
    let w_count = r.u16() as usize;
    let n = r.u16() as usize;
    let union = (0..n).map(|_| r.u16()).collect();
    let adv = (0..n).map(|_| r.f32()).collect();
    let articles = (0..ARTICLES)
        .map(|_| {
            let marks = r.u32() as usize;
            let cell = (0..marks).map(|_| r.u16()).collect();
            let p = (0..marks).map(|_| r.i32()).collect();
            let lines = r.u16() as usize;
            let baselines = (0..lines).map(|_| r.f32()).collect();
            let widths = (0..w_count)
                .map(|_| {
                    let h = r.f32();
                    let l = r.u16() as usize;
                    (h, (0..l).map(|_| r.u8()).collect())
                })
                .collect();
            Article {
                cell,
                p,
                baselines,
                widths,
            }
        })
        .collect();
    let clouds = (0..3)
        .map(|_| {
            let points = r.u32() as usize;
            (0..points * POINT_STRIDE).map(|_| r.f32()).collect()
        })
        .collect();
    let b_n = r.u32() as usize;
    let nike_for_bust = (0..b_n).map(|_| r.u16()).collect();
    let c_n = r.u32() as usize;
    let thinker_for_bust = (0..c_n).map(|_| r.u16()).collect();
    assert_eq!(r.1, b.len());
    Baked {
        w_min,
        union,
        adv,
        articles,
        clouds,
        nike_for_bust,
        thinker_for_bust,
    }
}

// ---- a page (buildPageLayout at this window) ----

struct Line {
    /// Its first mark and how many.
    start: usize,
    count: usize,
    /// Its baseline below the paragraph's top (the text blob's y).
    baseline: f32,
}

struct Page {
    /// Interleaved [x, y] per mark: its origin on the baseline, in window points.
    xy: Vec<f32>,
    /// getGlyphWidths per mark.
    adv: Vec<f32>,
    /// The union index per mark.
    cell: Vec<f32>,
    /// Per mark: its glyph id and x in its line (the blob's positions).
    glyph: Vec<u16>,
    x_line: Vec<f32>,
    lines: Vec<Line>,
    /// top × 2 + the paragraph's height.
    height: f64,
    count: usize,
}

fn build_page(a: usize, width: f64, height: f64) -> Page {
    let b = baked();
    let art = &b.articles[a];
    let wi = (width.round() as i64 - b.w_min as i64).clamp(0, art.widths.len() as i64 - 1) as usize;
    let (para_h, rows) = &art.widths[wi];
    let margin_x = width * PAGE_MARGIN_FRAC;
    let top = height * PAGE_TOP_FRAC;
    let n = art.cell.len();
    let (mut xy, mut x_line) = (Vec::with_capacity(n * 2), Vec::with_capacity(n));
    let mut lines = Vec::with_capacity(rows.len());
    let mut i = 0;
    for (k, &row) in rows.iter().enumerate() {
        let count = (row & 0x7f) as usize;
        let opens = row & 0x80 != 0;
        let base = if opens || count == 0 { 0 } else { art.p[i] };
        let baseline = art.baselines[k];
        lines.push(Line {
            start: i,
            count,
            baseline,
        });
        for j in i..i + count {
            // Skia's 16.16 positions, as the difference from the line's first glyph. f32, as Skia keeps them.
            let x = ((art.p[j] - base) as f64 / 65536.0) as f32;
            x_line.push(x);
            xy.push((margin_x + x as f64) as f32);
            xy.push((top + baseline as f64) as f32);
        }
        i += count;
    }
    assert_eq!(i, n);
    let glyph = art.cell.iter().map(|&c| b.union[c as usize]).collect();
    let adv = art.cell.iter().map(|&c| b.adv[c as usize]).collect();
    let cell = art.cell.iter().map(|&c| c as f32).collect();
    Page {
        xy,
        adv,
        cell,
        glyph,
        x_line,
        lines,
        height: top * 2.0 + *para_h as f64,
        count: n,
    }
}

/// pairByAngle: each page mark's point on the figure, by angle about each one's centroid.
fn pair_by_angle(page_xy: &[f32], cloud: &[f32], count: usize) -> Vec<usize> {
    let (mut pcx, mut pcy, mut bcx, mut bcy) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    for i in 0..count {
        pcx += page_xy[i * 2] as f64;
        pcy += page_xy[i * 2 + 1] as f64;
        bcx += cloud[i * POINT_STRIDE] as f64;
        bcy += cloud[i * POINT_STRIDE + 1] as f64;
    }
    let c = count as f64;
    let (pcx, pcy, bcx, bcy) = (pcx / c, pcy / c, bcx / c, bcy / c);
    let page: Vec<f64> = (0..count)
        .map(|i| (pcy - page_xy[i * 2 + 1] as f64).atan2(page_xy[i * 2] as f64 - pcx))
        .collect();
    let bust: Vec<f64> = (0..count)
        .map(|i| {
            (cloud[i * POINT_STRIDE + 1] as f64 - bcy).atan2(cloud[i * POINT_STRIDE] as f64 - bcx)
        })
        .collect();
    // A stable sort by angle: ties keep their order.
    let order = |angles: &[f64]| {
        let mut o: Vec<usize> = (0..count).collect();
        o.sort_by(|&a, &b| {
            (angles[a] - angles[b])
                .partial_cmp(&0.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        o
    };
    let (po, bo) = (order(&page), order(&bust));
    let mut out = vec![0; count];
    for k in 0..count {
        out[po[k]] = bo[k];
    }
    out
}

/// The instance buffer: one instance per point of the largest figure.
fn build_instances(pages: &[Page]) -> (Vec<f32>, usize) {
    let b = baked();
    let (bust, nike, thinker) = (&b.clouds[0], &b.clouds[1], &b.clouds[2]);
    let count_a = (bust.len() / POINT_STRIDE).min(pages[0].count);
    let count_b = (nike.len() / POINT_STRIDE).min(pages[1].count);
    let count_c = (thinker.len() / POINT_STRIDE).min(pages[2].count);
    let count = count_a.max(count_b).max(count_c);
    let shared_b = count_a.min(count_b);
    let shared_c = count_a.min(count_c);
    let bust_for_a = pair_by_angle(&pages[0].xy, bust, count_a);
    let nike_for_b = pair_by_angle(&pages[1].xy, nike, count_b);
    let thinker_for_c = pair_by_angle(&pages[2].xy, thinker, count_c);
    let invert = |v: &[usize]| {
        let mut o = vec![0; v.len()];
        for (i, &t) in v.iter().enumerate() {
            o[t] = i;
        }
        o
    };
    let (a_at_bust, b_at_nike, c_at_thinker) = (
        invert(&bust_for_a),
        invert(&nike_for_b),
        invert(&thinker_for_c),
    );
    let mut out = vec![0f32; count * INSTANCE_FLOATS];
    for p0 in 0..count {
        let has_a = p0 < count_a;
        let q = if p0 < shared_b {
            b.nike_for_bust[p0] as usize
        } else {
            p0
        };
        let r = if p0 < shared_c {
            b.thinker_for_bust[p0] as usize
        } else {
            p0
        };
        let has_b = q < count_b;
        let has_c = r < count_c;
        let a_src = if has_a { p0 } else { count_a - 1 };
        let b_src = if has_b { q } else { count_b - 1 };
        let c_src = if has_c { r } else { count_c - 1 };
        let (a, bb, c) = (a_at_bust[a_src], b_at_nike[b_src], c_at_thinker[c_src]);
        let o = &mut out[p0 * INSTANCE_FLOATS..(p0 + 1) * INSTANCE_FLOATS];
        let mut put = |at: usize, cloud: &[f32], src: usize, page: &Page, m: usize| {
            let i = src * POINT_STRIDE;
            o[at..at + 11].copy_from_slice(&[
                cloud[i],
                cloud[i + 1],
                cloud[i + 2],
                cloud[i + 6],
                cloud[i + 3],
                cloud[i + 4],
                cloud[i + 5],
                page.xy[m * 2],
                page.xy[m * 2 + 1],
                page.cell[m],
                page.adv[m],
            ]);
        };
        put(0, bust, a_src, &pages[0], a);
        put(11, nike, b_src, &pages[1], bb);
        put(22, thinker, c_src, &pages[2], c);
        o[33] = has_a as u32 as f32;
        o[34] = has_b as u32 as f32;
        o[35] = has_c as u32 as f32;
    }
    (out, count)
}

/// The atlas's grid at a pixel ratio: 1.6 em cells, glyphs at (0.2 em, 1.1 em) in each.
#[derive(Clone, Copy, Debug, PartialEq)]
struct AtlasGeo {
    cell: u32,
    origin_x: u32,
    origin_y: u32,
    cols: u32,
    width: u32,
    height: u32,
}

fn atlas_geo(glyphs: usize, ratio: f32) -> AtlasGeo {
    let em = GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE * ratio as f64;
    let cell = (em * 1.6).ceil() as u32;
    let origin_x = (em * 0.2).round() as u32;
    let origin_y = (em * 1.1).round() as u32;
    let cells = glyphs * PHASES;
    let cols = (cells as f64).sqrt().ceil() as u32;
    let rows = (cells as u32).div_ceil(cols);
    AtlasGeo {
        cell,
        origin_x,
        origin_y,
        cols,
        width: cols * cell,
        height: rows * cell,
    }
}

/// The atlas's coverage (row major, `geo.width` wide): each glyph's four phase masks, drawn as
/// Skia draws them into its offscreen surface (src-over, coverage in the alpha).
fn atlas_pixels(font: &Font, geo: &AtlasGeo, ratio: f32) -> Vec<u8> {
    let b = baked();
    let mut px = vec![0u8; (geo.width * geo.height) as usize];
    let ink = Paint::fill(Color::hex(PAPER_INK));
    for (g, &id) in b.union.iter().enumerate() {
        for phase in 0..PHASES {
            let index = (g * PHASES + phase) as u32;
            let left = (index % geo.cols) * geo.cell;
            let top = (index / geo.cols) * geo.cell;
            let Some(mask) = font.subpixel_mask(id, ratio, phase as u8, &ink) else {
                continue;
            };
            let (ox, oy) = (
                (left + geo.origin_x) as i32 + mask.left,
                (top + geo.origin_y) as i32 + mask.top,
            );
            for y in 0..mask.height as i32 {
                for x in 0..mask.width as i32 {
                    let (dx, dy) = (ox + x, oy + y);
                    if dx < 0 || dy < 0 || dx >= geo.width as i32 || dy >= geo.height as i32 {
                        continue;
                    }
                    let a = mask.coverage[(y * mask.width as i32 + x) as usize] as f32 / 255.0;
                    let d = &mut px[(dy as u32 * geo.width + dx as u32) as usize];
                    *d = ((a + *d as f32 / 255.0 * (1.0 - a)) * 255.0).round() as u8;
                }
            }
        }
    }
    px
}

/// perspective(fovy, aspect, near, far), column major.
fn perspective(fovy: f64, aspect: f64, near: f64, far: f64) -> [f64; 16] {
    let f = 1.0 / (fovy / 2.0).tan();
    [
        f / aspect,
        0.0,
        0.0,
        0.0,
        0.0,
        f,
        0.0,
        0.0,
        0.0,
        0.0,
        far / (near - far),
        -1.0,
        0.0,
        0.0,
        (far * near) / (near - far),
        0.0,
    ]
}

/// The model rotation: lean, then the spin, as a padded mat3x3.
fn write_model(out: &mut [f32], lean: f64, spin: f64) {
    let (cl, sl, cs, ss) = (lean.cos(), lean.sin(), spin.cos(), spin.sin());
    out[16] = cs as f32;
    out[17] = (sl * ss) as f32;
    out[18] = (-cl * ss) as f32;
    out[20] = 0.0;
    out[21] = cl as f32;
    out[22] = sl as f32;
    out[24] = ss as f32;
    out[25] = (-sl * cs) as f32;
    out[26] = (cl * cs) as f32;
}

// ---- the surface ----

/// The yaw: a turntable from `from`, or a spring.
enum Yaw {
    Spin {
        from: f64,
        start: Option<f64>,
        value: f64,
    },
    Spring(Spring),
}

impl Yaw {
    fn value(&self) -> f64 {
        match self {
            Yaw::Spin { value, .. } => *value,
            Yaw::Spring(s) => s.value,
        }
    }
    fn step(&mut self, now: f64) -> bool {
        match self {
            // A linear turn from `from`, repeating: each turn restarts on the frame the last one ended.
            Yaw::Spin { from, start, value } => {
                let duration = std::f64::consts::TAU * 1000.0 / IDLE_SPIN;
                let t0 = *start.get_or_insert(now);
                let u = ((now - t0) / duration).min(1.0);
                *value = *from + std::f64::consts::TAU * u;
                if u >= 1.0 {
                    *start = Some(now);
                }
                true
            }
            Yaw::Spring(s) => s.running && s.step(now),
        }
    }
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    uniforms: wgpu::Buffer,
    quad: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// The atlas at a ratio and its bind group.
    atlas: Option<(f32, AtlasGeo, wgpu::BindGroup)>,
    /// The instances for a window size, and their count.
    instances: Option<((u32, u32), wgpu::Buffer, usize)>,
    /// The letters' target (as the canvas's image) and depth, at a pixel size.
    shape: Option<((u32, u32), Images, wgpu::TextureView, wgpu::TextureView)>,
    /// The canvas composited, under the dots.
    composite: Option<((u32, u32), Images, wgpu::TextureView)>,
}

struct Sculptures {
    revealed: Option<bool>,
    progress: Spring,
    rewind: f64,
    yaw: Yaw,
    /// setOrigin: the ripple's centre (column px) and the farthest a letter is from it.
    origin: (f64, f64),
    origin_pending: Option<f64>,
    read: UiScroll,
    crossing: UiScroll,
    /// Which scroll each finger went down on (true: reading).
    fingers: Vec<(u32, bool)>,
    size: (f64, f64),
    pages: Vec<Page>,
    font: Option<Font>,
    /// The haptic pattern: its ticks' times, from the frame the tap is first seen.
    ticks: Option<(Option<f64>, usize)>,
    posted: Vec<String>,
    now: f64,
    gpu: Option<Gpu>,
    renderer: Renderer,
    dots: Renderer,
    p3: gfx::P3Layer,
    /// The composite path has drawn once (see `render`).
    warmed: bool,
    canvas: Canvas,
    top_canvas: Canvas,
    uniforms: [f32; UNIFORM_FLOATS],
    /// Tests: draw at this clock.
    #[cfg(test)]
    forced: Option<f64>,
    /// Tests: leave the column out.
    #[cfg(test)]
    quads_only: bool,
}

impl Sculptures {
    fn new() -> Sculptures {
        let mut crossing = UiScroll::new(0.0, 0.0, 1.0, RATE_FAST, Snap::IntervalCurrent(1.0));
        crossing.bounces = true;
        Sculptures {
            revealed: None,
            progress: Spring::at(0.0),
            rewind: 0.0,
            yaw: Yaw::Spring(Spring::at(0.0)),
            origin: (0.0, 0.0),
            origin_pending: Some(0.0),
            read: UiScroll::new(0.0, 0.0, 1.0, RATE_NORMAL, Snap::Free),
            crossing,
            fingers: Vec::new(),
            size: (0.0, 0.0),
            pages: Vec::new(),
            font: Font::new(FONT, (GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE) as f32),
            ticks: None,
            posted: Vec::new(),
            now: 0.0,
            gpu: None,
            renderer: Renderer::default(),
            dots: Renderer::default(),
            p3: gfx::P3Layer::default(),
            warmed: false,
            canvas: Canvas::default(),
            top_canvas: Canvas::default(),
            uniforms: [0.0; UNIFORM_FLOATS],
            #[cfg(test)]
            forced: None,
            #[cfg(test)]
            quads_only: false,
        }
    }

    fn cross(&self) -> f64 {
        self.crossing.offset / self.size.0.max(1.0)
    }

    fn column_heights(&self) -> [f64; ARTICLES] {
        std::array::from_fn(|i| self.pages.get(i).map_or(1.0, |p| p.height))
    }

    /// The reading spacer: the columns' heights interpolated by the crossing.
    fn spacer(&self) -> f64 {
        let h = self.column_heights();
        let k = self.cross().clamp(0.0, (ARTICLES - 1) as f64);
        let lo = k.floor() as usize;
        let hi = (lo + 1).min(ARTICLES - 1);
        h[lo] + (h[hi] - h[lo]) * (k - lo as f64)
    }

    /// Sets the ripple's origin for a scroll position.
    fn set_origin(&mut self, scroll: f64) {
        let (w, h) = self.size;
        let k = (self.cross().round().max(0.0) as usize).min(ARTICLES - 1);
        let column = self.column_heights()[k];
        let (cx, cy) = (w / 2.0, scroll + h / 2.0);
        let reach = cx
            .hypot(cy)
            .max((w - cx).hypot(cy))
            .max(cx.hypot(column - cy))
            .max((w - cx).hypot(column - cy));
        self.origin = (cy, reach);
    }

    fn layout(&mut self, w: f64, h: f64) {
        if self.size == (w, h) && !self.pages.is_empty() {
            return;
        }
        self.size = (w, h);
        self.pages = (0..ARTICLES).map(|a| build_page(a, w, h)).collect();
        self.read.port = h;
        self.crossing.port = w;
        self.crossing.max = w * (ARTICLES as f64 - 1.0);
        self.crossing.snap = Snap::IntervalCurrent(w);
        self.read.max = (self.spacer() - h).max(0.0);
        if let Some(gpu) = &mut self.gpu {
            gpu.instances = None;
        }
        if self.origin_pending.take().is_some() {
            self.set_origin(0.0);
        }
    }

    fn toggle(&mut self, next: bool) {
        self.ticks = Some((None, 0));
        let target = if next { 1.0 } else { 0.0 };
        let clock = self.progress.value;
        if clock <= 0.001 || clock >= 0.999 {
            self.rewind = if next { 0.0 } else { 1.0 };
            if clock <= 0.001 {
                if self.size.0 > 0.0 {
                    self.set_origin(self.read.offset);
                } else {
                    self.origin_pending = Some(self.read.offset);
                }
            }
        }
        let v = if self.progress.running {
            self.progress.velocity
        } else {
            0.0
        };
        self.progress.to(target, v, CLOCK);
        let yaw = self.yaw.value();
        if next {
            self.yaw = Yaw::Spin {
                from: yaw,
                start: None,
                value: yaw,
            };
        } else {
            let mut s = Spring::at(yaw);
            gfx::spring_to(&mut s, 0.0, MORPH_DURATION_MS, 1.0);
            self.yaw = Yaw::Spring(s);
        }
    }

    fn morph(&self) -> f64 {
        #[cfg(test)]
        if let Some(p) = self.forced {
            return p;
        }
        self.progress.value
    }

    fn step(&mut self, now: f64) -> bool {
        self.now = now;
        let mut moving = false;
        if self.progress.running {
            moving |= self.progress.step(now);
        }
        moving |= self.yaw.step(now);
        moving |= self.read.step(now);
        moving |= self.crossing.step(now);
        self.read.max = (self.spacer() - self.size.1).max(0.0);
        // The impact ticks: each at its time along the departures.
        if let Some((start, next)) = &mut self.ticks {
            let t0 = *start.get_or_insert(now);
            let departures = MORPH_DURATION_MS * STAGGER;
            while *next < TICKS {
                let t = *next as f64 / (TICKS - 1) as f64;
                let at = (departures * t * t * 0.5 + departures * t * 0.5).round();
                if now - t0 < at {
                    break;
                }
                self.posted.push("haptic:impact-light".into());
                *next += 1;
            }
            if *next >= TICKS {
                self.ticks = None;
            } else {
                moving = true;
            }
        }
        moving || !self.fingers.is_empty()
    }

    fn ensure_gpu(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        frame: &Frame,
        format: wgpu::TextureFormat,
    ) {
        if self.gpu.as_ref().map(|g| (g.format, g.generation))
            != Some((format, frame.shader_generation))
        {
            let module = device.create_shader_module(crate::shaders::sculptures_in_words::module());
            let layout = device.create_bind_group_layout(&GROUP_0);
            let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("sculptures letters"),
                bind_group_layouts: &[Some(&layout)],
                immediate_size: 0,
            });
            let f4 = wgpu::VertexFormat::Float32x4;
            let f3 = wgpu::VertexFormat::Float32x3;
            let attrs = [
                wgpu::VertexAttribute {
                    shader_location: 1,
                    offset: 0,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 2,
                    offset: 16,
                    format: f3,
                },
                wgpu::VertexAttribute {
                    shader_location: 3,
                    offset: 28,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 4,
                    offset: 44,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 5,
                    offset: 60,
                    format: f3,
                },
                wgpu::VertexAttribute {
                    shader_location: 7,
                    offset: 72,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 8,
                    offset: 88,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 9,
                    offset: 104,
                    format: f3,
                },
                wgpu::VertexAttribute {
                    shader_location: 10,
                    offset: 116,
                    format: f4,
                },
                wgpu::VertexAttribute {
                    shader_location: 11,
                    offset: 132,
                    format: f3,
                },
            ];
            let corner = [wgpu::VertexAttribute {
                shader_location: 0,
                offset: 0,
                format: wgpu::VertexFormat::Float32x2,
            }];
            let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("sculptures letters"),
                layout: Some(&pl),
                vertex: wgpu::VertexState {
                    module: &module,
                    entry_point: Some(entry::VS),
                    buffers: &[
                        Some(wgpu::VertexBufferLayout {
                            array_stride: 8,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &corner,
                        }),
                        Some(wgpu::VertexBufferLayout {
                            array_stride: (INSTANCE_FLOATS * 4) as u64,
                            step_mode: wgpu::VertexStepMode::Instance,
                            attributes: &attrs,
                        }),
                    ],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &module,
                    entry_point: Some(entry::FS),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        blend: Some(wgpu::BlendState {
                            color: wgpu::BlendComponent {
                                src_factor: wgpu::BlendFactor::One,
                                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                                operation: wgpu::BlendOperation::Add,
                            },
                            alpha: wgpu::BlendComponent {
                                src_factor: wgpu::BlendFactor::One,
                                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                                operation: wgpu::BlendOperation::Add,
                            },
                        }),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    ..Default::default()
                },
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth24Plus,
                    depth_write_enabled: Some(true),
                    depth_compare: Some(wgpu::CompareFunction::LessEqual),
                    stencil: Default::default(),
                    bias: Default::default(),
                }),
                multisample: Default::default(),
                multiview_mask: None,
                cache: None,
            });
            let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("sculptures uniforms"),
                size: (UNIFORM_FLOATS * 4) as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let quad = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("sculptures quad"),
                size: 48,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let corners: [f32; 12] = [
                -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ];
            queue.write_buffer(&quad, 0, bytes(&corners));
            let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
                label: Some("sculptures glyphs"),
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                ..Default::default()
            });
            self.gpu = Some(Gpu {
                format,
                generation: frame.shader_generation,
                pipeline,
                layout,
                uniforms,
                quad,
                sampler,
                atlas: None,
                instances: None,
                shape: None,
                composite: None,
            });
        }
        let ratio = frame.scale.min(MAX_PIXEL_RATIO);
        let gpu = self.gpu.as_mut().unwrap();
        if gpu.atlas.as_ref().map(|a| a.0) != Some(ratio) {
            let geo = atlas_geo(baked().union.len(), ratio);
            let px = self.font.as_ref().map_or_else(
                || vec![0; (geo.width * geo.height) as usize],
                |f| atlas_pixels(f, &geo, ratio),
            );
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("sculptures atlas"),
                size: wgpu::Extent3d {
                    width: geo.width,
                    height: geo.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::R8Unorm,
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
                &px,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(geo.width),
                    rows_per_image: Some(geo.height),
                },
                wgpu::Extent3d {
                    width: geo.width,
                    height: geo.height,
                    depth_or_array_layers: 1,
                },
            );
            let view = texture.create_view(&Default::default());
            let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("sculptures letters"),
                layout: &gpu.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: gpu.uniforms.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&gpu.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(&view),
                    },
                ],
            });
            gpu.atlas = Some((ratio, geo, bind));
        }
        let key = (
            self.size.0.to_bits() as u32 ^ (self.size.0.to_bits() >> 32) as u32,
            self.size.1 as u32,
        );
        if gpu.instances.as_ref().map(|i| i.0) != Some(key) {
            let (data, count) = build_instances(&self.pages);
            let buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("sculptures instances"),
                size: (data.len() * 4).max(4) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            queue.write_buffer(&buffer, 0, bytes(&data));
            gpu.instances = Some((key, buffer, count));
        }
        let (w, h) = self.size;
        let target = (
            (w * ratio as f64).round() as u32,
            (h * ratio as f64).round() as u32,
        );
        if gpu.shape.as_ref().map(|s| s.0) != Some(target) {
            let images = Images::target(device, target.0, target.1);
            let view = images.render_view();
            let depth = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("sculptures depth"),
                size: wgpu::Extent3d {
                    width: target.0.max(1),
                    height: target.1.max(1),
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Depth24Plus,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            gpu.shape = Some((target, images, view, depth.create_view(&Default::default())));
        }
    }

    /// Fills the uniform block for this frame.
    fn write_uniforms(&mut self, ratio: f32, geo: &AtlasGeo) {
        let (w, h) = self.size;
        let (morph, cross, yaw) = (self.morph(), self.cross(), self.yaw.value());
        let u = &mut self.uniforms;
        for (i, v) in perspective(CAMERA_FOV, w / h, 0.1, 100.0)
            .iter()
            .enumerate()
        {
            u[i] = *v as f32;
        }
        let half_h = (CAMERA_FOV / 2.0).tan() * CAMERA_DIST;
        let half_w = half_h * (w / h);
        let world_per_px = (half_h * 2.0) / h;
        let page_glyph = (geo.cell as f64 / ratio as f64) * world_per_px;
        u[28] = -CAMERA_TARGET[0] as f32;
        u[29] = -CAMERA_TARGET[1] as f32;
        u[30] = -(CAMERA_TARGET[2] + CAMERA_DIST) as f32;
        u[32] = half_w as f32;
        u[33] = half_h as f32;
        u[34] = -CAMERA_DIST as f32;
        u[36] = w as f32;
        u[37] = h as f32;
        u[38] = ratio;
        u[39] = page_glyph as f32;
        u[40] = GLYPH_WORLD as f32;
        u[41] = geo.cell as f32;
        u[42] = geo.cols as f32;
        u[44] = geo.width as f32;
        u[45] = geo.height as f32;
        u[46] = geo.origin_x as f32;
        u[47] = geo.origin_y as f32;
        write_model(u, SHAPE_LEAN, yaw + SHAPE_YAW_OFFSET);
        u[31] = morph as f32;
        u[35] = self.read.offset as f32;
        u[43] = self.origin.0 as f32;
        u[48] = self.origin.1 as f32;
        u[49] = cross as f32;
        u[50] = self.rewind as f32;
    }

    /// Draws the column and the fades, in points.
    fn draw_canvas(&mut self, scale: f32, clock: f64) {
        let (w, h) = self.size;
        let ratio = scale as f64;
        let c = &mut self.canvas;
        c.begin(scale);
        let ink = Paint::fill(Color::hex(PAPER_INK));
        #[cfg(test)]
        let column = clock <= 0.003 && !self.quads_only;
        #[cfg(not(test))]
        let column = clock <= 0.003;
        if column {
            if let Some(font) = &self.font {
                let scroll = self.read.offset;
                let cross = self.crossing.offset / w.max(1.0);
                let tallest = self.pages.iter().map(|p| p.height).fold(0.0, f64::max);
                let shift = -(scroll * ratio).round() / ratio;
                let margin_x = (w * PAGE_MARGIN_FRAC) as f32;
                let origin_y = (h * PAGE_TOP_FRAC) as f32;
                let em = (GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE * 2.0) as f32;
                c.save();
                c.translate(0.0, shift as f32);
                c.clip_rect(0.0, 0.0, w as f32, tallest as f32);
                let mut run = Vec::new();
                for (i, page) in self.pages.iter().enumerate() {
                    let dx = (i as f64 - cross) * w;
                    if dx.abs() >= w {
                        continue;
                    }
                    c.save();
                    c.translate(dx as f32, 0.0);
                    for line in &page.lines {
                        let y = origin_y + line.baseline;
                        let on = y as f64 + shift;
                        if line.count == 0 || on < -(em as f64) || on > h + em as f64 {
                            continue;
                        }
                        run.clear();
                        run.extend(
                            (line.start..line.start + line.count)
                                .map(|m| (page.glyph[m], page.x_line[m], 0.0f32)),
                        );
                        c.save();
                        c.translate(margin_x, y);
                        c.draw_glyphs_subpixel(&run, font, &ink);
                        c.restore();
                    }
                    c.restore();
                }
                c.restore();
            }
        }
        if clock > 0.0 {
            if let Some((_, images, _, _)) = self.gpu.as_ref().and_then(|g| g.shape.as_ref()) {
                let (iw, ih) = (images.image(0).width, images.image(0).height);
                let to = Matrix::scale(iw / w as f32, ih / h as f32);
                c.draw_rect(
                    0.0,
                    0.0,
                    w as f32,
                    h as f32,
                    &Paint::image(images.image(0), to),
                );
            }
        }
        // The fades: a cubic ramp of white, 12 stops.
        let stops: Vec<(f32, Color)> = (0..FADE_STOPS)
            .map(|i| {
                let t = i as f64 / (FADE_STOPS - 1) as f64;
                let a = (255.0 * t * t * t).round() as u8;
                let (r, g, b) = ((PAGE_BG >> 16) as u8, (PAGE_BG >> 8) as u8, PAGE_BG as u8);
                (t as f32, Color::rgba8(r, g, b, a))
            })
            .collect();
        let top_fade = (h * TOP_FADE_FRAC) as f32;
        let fade = (h * BOTTOM_FADE_FRAC) as f32;
        let w32 = w as f32;
        fade_rect(c, w32, top_fade, 0.0, &stops);
        fade_rect(c, w32, h as f32 - fade, h as f32, &stops);
    }

    /// The paginator's dots, their widths and opacities from the crossing. Their layer fades in with the clock.
    fn draw_dots(&mut self, scale: f32, clock: f64, composite: Option<&Images>) {
        let (w, h) = self.size;
        let c = &mut self.top_canvas;
        c.begin(scale);
        if let Some(images) = composite {
            let im = images.image(0);
            c.draw_rect(
                0.0,
                0.0,
                w as f32,
                h as f32,
                &Paint::image(im, Matrix::scale(im.width / w as f32, im.height / h as f32)),
            );
        }
        let layer = ((clock - 0.55) / 0.35).clamp(0.0, 1.0);
        if layer <= 0.0 {
            return;
        }
        let s = scale as f64;
        let round = |v: f64| (v * s).round() / s;
        let margin = w * PAGE_MARGIN_FRAC;
        let bottom = margin + FAB_SIZE / 2.0 - DOT_SIZE / 2.0;
        let top = h - bottom - DOT_SIZE;
        let scroll_x = self.crossing.offset;
        let mut x = margin;
        for i in 0..ARTICLES {
            let p = ((scroll_x - (i as f64 - 1.0) * w) / w).clamp(0.0, 2.0);
            let (dw, op) = if p <= 1.0 {
                (DOT_SIZE + (DOT_ACTIVE_WIDTH - DOT_SIZE) * p, 0.3 + 0.7 * p)
            } else {
                (
                    DOT_ACTIVE_WIDTH - (DOT_ACTIVE_WIDTH - DOT_SIZE) * (p - 1.0),
                    1.0 - 0.7 * (p - 1.0),
                )
            };
            let (l, r) = (round(x), round(x + dw));
            let (t, b) = (round(top), round(top + DOT_SIZE));
            let paint = Paint::fill(Color::hex(PAPER_INK)).with_opacity((op * layer) as f32);
            let (dw_r, dh_r) = ((r - l) as f32, (b - t) as f32);
            if (dw_r - dh_r).abs() < 1e-3 {
                // A square with a half-side radius is a circle.
                c.draw_circle(
                    l as f32 + dw_r / 2.0,
                    t as f32 + dh_r / 2.0,
                    dh_r / 2.0,
                    &paint,
                );
            } else {
                c.draw_continuous_rrect(
                    l as f32,
                    t as f32,
                    dw_r,
                    dh_r,
                    (DOT_SIZE / 2.0) as f32,
                    &paint,
                );
            }
            x += dw + DOT_SPACING;
        }
    }
}

fn bytes(v: &[f32]) -> &[u8] {
    // SAFETY: f32 has no padding and any byte pattern is valid u8.
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
}

impl Surface for Sculptures {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let revealed = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        match self.revealed {
            Some(was) if was != revealed => self.toggle(revealed),
            None if revealed => {
                self.progress.set(1.0);
                self.yaw = Yaw::Spin {
                    from: 0.0,
                    start: None,
                    value: 0.0,
                };
            }
            _ => {}
        }
        self.revealed = Some(revealed);
        Ok(())
    }

    fn size(&mut self, width: f32, height: f32) -> bool {
        self.layout(width as f64, height as f64);
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
        Some(format!(
            "{{\"revealed\":{},\"progress\":{:.4},\"scroll\":{:.2},\"cross\":{:.3},\"rewind\":{},\"marks\":[{}],\"held\":{}}}",
            self.revealed.unwrap_or(false),
            self.progress.value,
            self.read.offset,
            self.cross(),
            self.rewind,
            self.pages.iter().map(|p| p.count.to_string()).collect::<Vec<_>>().join(","),
            !self.fingers.is_empty()
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
        use gestures::Phase;
        let clock = self.progress.value;
        let reading = match (phase, self.fingers.iter().find(|f| f.0 == id)) {
            (_, Some(f)) => Some(f.1),
            (Phase::Down, None) if clock < 0.1 => Some(true),
            (Phase::Down, None) if clock > 0.9 => Some(false),
            _ => None,
        };
        let Some(reading) = reading else { return };
        if phase == Phase::Down && !self.fingers.iter().any(|f| f.0 == id) {
            self.fingers.push((id, reading));
        }
        if reading {
            // The reading column scrolls vertically: the horizontal model on swapped axes.
            self.read.input(id, phase, y, x, at_ms, true);
        } else {
            self.crossing.input(id, phase, x, y, at_ms, true);
        }
        if matches!(phase, Phase::Up | Phase::Cancel) {
            self.fingers.retain(|f| f.0 != id);
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
        self.layout(frame.width as f64, frame.height as f64);
        let moving = self.step(frame.now_ms);
        let clock = self.morph();
        let ratio = frame.scale.min(MAX_PIXEL_RATIO);
        self.ensure_gpu(device, queue, frame, format);
        if clock > 0.0 {
            let geo = self.gpu.as_ref().unwrap().atlas.as_ref().unwrap().1;
            self.write_uniforms(ratio, &geo);
            let gpu = self.gpu.as_ref().unwrap();
            queue.write_buffer(&gpu.uniforms, 0, bytes(&self.uniforms));
            let (_, _, view, depth) = gpu.shape.as_ref().unwrap();
            let (_, instances, count) = gpu.instances.as_ref().unwrap();
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("sculptures letters"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
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
            pass.set_pipeline(&gpu.pipeline);
            pass.set_bind_group(0, &gpu.atlas.as_ref().unwrap().2, &[]);
            pass.set_vertex_buffer(0, gpu.quad.slice(..));
            pass.set_vertex_buffer(1, instances.slice(..));
            pass.draw(0..6, 0..*count as u32);
        }
        self.draw_canvas(frame.scale, clock);
        let (pw, ph) = frame.pixels();
        {
            let gpu = self.gpu.as_ref().unwrap();
            self.renderer.set_images(&gpu.shape.as_ref().unwrap().1);
        }
        // The first frame takes the composite path too, so the dots' renderer and the composite target
        // are built at mount. Building them at the first reveal froze the figure for about 0.9 s.
        let dots = ((clock - 0.55) / 0.35).clamp(0.0, 1.0) > 0.0 || !self.warmed;
        self.warmed = true;
        if !dots {
            self.p3.draw(
                &mut self.renderer,
                device,
                queue,
                encoder,
                &self.canvas,
                target,
                format,
                pw,
                ph,
                page_clear(),
            );
        } else {
            let gpu = self.gpu.as_mut().unwrap();
            if gpu.composite.as_ref().map(|c| c.0) != Some((pw, ph)) {
                let images = Images::target(device, pw, ph);
                let view = images.render_view();
                gpu.composite = Some(((pw, ph), images, view));
            }
            let (_, _, view) = gpu.composite.as_ref().unwrap();
            self.p3.draw(
                &mut self.renderer,
                device,
                queue,
                encoder,
                &self.canvas,
                view,
                wgpu::TextureFormat::Rgba8Unorm,
                pw,
                ph,
                page_clear(),
            );
            let composite = self
                .gpu
                .as_ref()
                .unwrap()
                .composite
                .as_ref()
                .map(|c| &c.1 as *const Images);
            // SAFETY: `composite` lives in self.gpu, which draw_dots does not touch.
            let composite = composite.map(|p| unsafe { &*p });
            self.draw_dots(frame.scale, clock, composite);
            if let Some(images) = composite {
                self.dots.set_images(images);
            }
            self.dots.draw(
                device,
                queue,
                encoder,
                &self.top_canvas,
                target,
                format,
                pw,
                ph,
                wgpu::Color::TRANSPARENT,
            );
        }
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_bake_reads_back() {
        let b = baked();
        assert_eq!(b.union.len(), b.adv.len());
        let marks: Vec<usize> = b.articles.iter().map(|a| a.cell.len()).collect();
        assert_eq!(marks, vec![11814, 14191, 17800]);
        assert_eq!(
            b.clouds
                .iter()
                .map(|c| c.len() / POINT_STRIDE)
                .collect::<Vec<_>>(),
            marks
        );
        for a in &b.articles {
            for (_, rows) in &a.widths {
                let n: usize = rows.iter().map(|r| (r & 0x7f) as usize).sum();
                assert_eq!(n, a.cell.len());
                assert!(rows.len() <= a.baselines.len());
            }
        }
        // The union holds each glyph id once.
        let mut seen = std::collections::HashSet::new();
        assert!(b.union.iter().all(|g| seen.insert(*g)));
    }

    #[test]
    fn pages_are_laid_out_as_the_bake_says() {
        let p = build_page(0, 420.0, 912.0);
        // The title's first mark follows the em space.
        assert_eq!(
            p.xy[0],
            (420.0 * 0.09 + baked().articles[0].p[0] as f64 / 65536.0) as f32
        );
        assert!((p.xy[0] - 37.8 - 15.64).abs() < 0.5, "{}", p.xy[0]);
        assert_eq!(p.xy[1], (912.0 * 0.14 + p.lines[0].baseline as f64) as f32);
        // Every line inside the column (floored width, a quarter point of rounding slack).
        let max = (420.0f64 - 420.0 * 0.09 * 2.0).floor() + 0.25;
        for l in &p.lines {
            if l.count > 0 {
                let last = l.start + l.count - 1;
                assert!(
                    (p.x_line[last] + p.adv[last]) as f64 <= max + 1.0,
                    "line ends at {}",
                    p.x_line[last] + p.adv[last]
                );
            }
        }
        let (inst, count) = build_instances(&[
            build_page(0, 420.0, 912.0),
            build_page(1, 420.0, 912.0),
            build_page(2, 420.0, 912.0),
        ]);
        assert_eq!(count, 17800);
        assert_eq!(inst.len(), count * INSTANCE_FLOATS);
        // Each page mark lands on exactly one bust point.
        let mut used = vec![false; 11814];
        for i in 0..11814 {
            let x = inst[i * INSTANCE_FLOATS + 7];
            let y = inst[i * INSTANCE_FLOATS + 8];
            let m = (0..11814)
                .find(|&m| p.xy[m * 2] == x && p.xy[m * 2 + 1] == y)
                .unwrap();
            assert!(!used[m]);
            used[m] = true;
        }
    }

    #[test]
    fn the_atlas_geometry_is_build_glyph_atlases() {
        let g = atlas_geo(81, 3.0);
        assert_eq!(
            (g.cell, g.origin_x, g.origin_y, g.cols, g.width, g.height),
            (76, 9, 52, 18, 1368, 1368)
        );
    }

    /// The subset font draws every mask the full one does, bit for bit.
    #[cfg(target_vendor = "apple")]
    #[test]
    fn the_subset_font_draws_the_full_fonts_masks() {
        static FULL: &[u8] =
            include_bytes!("../../../../src/animations/sculptures-in-words/assets/Newsreader.ttf");
        let size = (GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE) as f32;
        let (sub, full) = (
            Font::new(FONT, size).unwrap(),
            Font::new(FULL, size).unwrap(),
        );
        let ink = Paint::fill(Color::hex(PAPER_INK));
        let mut drawn = 0;
        for &g in &baked().union {
            for phase in 0..4 {
                let (a, b) = (
                    sub.subpixel_mask(g, 3.0, phase, &ink),
                    full.subpixel_mask(g, 3.0, phase, &ink),
                );
                assert_eq!(a, b, "glyph {g} phase {phase}");
                drawn += a.is_some() as usize;
            }
        }
        assert_eq!(drawn, baked().union.len() * 4);
    }

    fn render(
        gpu: &exact_gpu::Gpu,
        s: &mut Sculptures,
        now: f64,
        w: u32,
        h: u32,
        scale: f32,
    ) -> fixture::Pixels {
        let frame = Frame {
            width: w as f32,
            height: h as f32,
            scale,
            now_ms: now,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        fixture::render(gpu, s, &frame).unwrap().0
    }

    /// At rest the column is Skia's text; the figure's quads draw the same letters on the same pixels.
    #[cfg(target_vendor = "apple")]
    #[test]
    fn the_handoff_draws_the_same_letters() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let (w, h, scale) = (420u32, 912u32, 3.0f32);
        let mut s = Sculptures::new();
        s.bind(&[Value::Bool(false)], None).unwrap();
        s.size(w as f32, h as f32);
        s.forced = Some(0.0);
        let rest = render(&gpu, &mut s, 0.0, w, h, scale);
        // Only the quads: the clock just above Skia's cut, before any letter has moved.
        s.forced = Some(1e-7);
        s.quads_only = true;
        let quads = render(&gpu, &mut s, 16.0, w, h, scale);
        let (pw, ph) = (rest.width as usize, rest.height as usize);
        let (mut diff, mut ink, mut max) = (0u64, 0u64, 0u8);
        for y in (h as f32 * scale * TOP_FADE_FRAC as f32) as usize
            ..(ph as f32 * (1.0 - BOTTOM_FADE_FRAC as f32)) as usize
        {
            for x in 0..pw {
                let i = (y * pw + x) * 4 + 3;
                let (a, b) = (rest.data[i], quads.data[i]);
                ink += (a > 0) as u64;
                diff += a.abs_diff(b) as u64;
                max = max.max(a.abs_diff(b));
            }
        }
        gfx::save_over(&rest, "sculptures-rest", [255, 255, 255]);
        gfx::save_over(&quads, "sculptures-quads", [255, 255, 255]);
        assert!(ink > 100_000, "{ink} inked pixels");
        let mean = diff as f64 / ink as f64;
        // Differences are at most two levels, and the mean is far below one.
        assert!(mean < 0.05 && max <= 2, "mean {mean} max {max}");
        // The statue (the clock at 1, facing as at rest), and half way.
        for (p, name) in [(1.0, "sculptures-figure"), (0.45, "sculptures-flight")] {
            s.forced = Some(p);
            let img = render(&gpu, &mut s, 32.0, w, h, scale);
            gfx::save_over(&img, name, [255, 255, 255]);
            assert!(img.count(|px| px[3] > 128) > 20_000, "{name}");
        }
    }

    /// The tap: the clock springs to 1 and the yaw turns; a touch scrolls the column.
    #[test]
    fn the_tap_morphs_and_the_column_scrolls() {
        let mut s = Sculptures::new();
        s.size(420.0, 912.0);
        s.bind(&[Value::Bool(false)], None).unwrap();
        for t in 0..10 {
            s.step(t as f64 * 16.0);
        }
        s.bind(&[Value::Bool(true)], None).unwrap();
        let mut posted = 0;
        for t in 10..400 {
            s.step(t as f64 * 16.0);
            posted += s.messages().len();
        }
        assert!(s.progress.value > 0.99, "{}", s.progress.value);
        assert_eq!(posted, TICKS);
        assert!(s.yaw.value() > 0.5);
        s.bind(&[Value::Bool(false)], None).unwrap();
        assert_eq!(s.rewind, 1.0);
        for t in 400..1200 {
            s.step(t as f64 * 16.0);
        }
        assert_eq!(s.progress.value, 0.0);
        // A drag up the column scrolls it.
        let touch = |s: &mut Sculptures, phase, y: f32, at: f64| {
            s.input(&InputEvent::Pointer {
                id: 1,
                phase,
                x: 200.0,
                y,
                dx: 0.0,
                dy: 0.0,
                kind: exact_gpu::PointerKind::Touch,
                buttons: 1,
                at_ms: at,
            })
        };
        touch(&mut s, exact_gpu::PointerPhase::Down, 700.0, 20000.0);
        for k in 1..20 {
            touch(
                &mut s,
                exact_gpu::PointerPhase::Move,
                700.0 - k as f32 * 15.0,
                20000.0 + k as f64 * 30.0,
            );
        }
        touch(&mut s, exact_gpu::PointerPhase::Up, 415.0, 20700.0);
        assert!(s.read.offset > 200.0, "{}", s.read.offset);
    }
}
