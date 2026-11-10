//! The Little Prince (src/animations/the-little-prince: index.tsx, text.ts, assets/prince.png;
//! the generic src/animations/text-image-morph: constants.ts, atlas.ts, layout.ts,
//! sampling.ts, reveal.tsx, use-text-image-morph.ts, text-image-morph.tsx): a page of the
//! rose-and-fox farewell whose letters fly together into the prince on his planet, and back.
//! The whole window, #f7f4ec; the button that toggles it is the Contract's (the input).
//!
//! - The atlas (useTexture, at 1× as RN Skia's offscreen surface): every distinct letter in a
//!   40 pt cell (cols = ⌈√n⌉), drawn in Newsreader 30 (its default instance, wght 400, opsz
//!   18) in #1c1a17 at (3, 28.8) of its cell.
//! - The page (buildLayout): margins width × 0.09 and height × 0.13, letters at 0.48 scale,
//!   advances (not ink) × 0.48, lines 30 × 0.48 × 1.55 apart, paragraphs indented by three
//!   spaces, words wrapped, stopping at the bottom margin. A letter's point is its cell's centre.
//! - The picture (computeTargets): Poisson-disc points (min distance 0.014 × the image's long
//!   side) whose density follows the image's ink (max(1 − luminance, 0.45 × saturation), from
//!   0.18, to the power 1.4), up to 800 tries per letter; strays with fewer than 6 neighbours
//!   within 3.2 × that distance re-seeded on kept points; fitted (their bounding box) into
//!   0.9 × width by 0.7 × height, centred; paired with the letters by angle about each
//!   centroid; each letter delayed by the smootherstep of its distance to the bottom-right
//!   corner (× 0.85, plus 0.15 × random).
//! - Each frame, per letter (reveal.tsx): pe = clamp((p − 0.55 d) / 0.45); the point moves
//!   page → picture by pe, surges toward the camera (z = sin(pe π) × (85 + 290 × travel /
//!   width), perspective 820 / (820 − z) about the window's centre), scales 0.48 → 0.44 (× the
//!   perspective), tilts by sin(pe π) × 0.11 × travel / width toward its direction, and fades to
//!   1 − 0.42 sin(pe π). Drawn as one atlas, the colour srcIn.
//! - progress: withSpring(revealed, { dampingRatio 1, duration 2000 }) on each toggle; the
//!   surface posts `tick` at MORPH_PATTERN's discrete times (0 … 1200 ms) for the haptic.
//!
//! Numbers as RN holds them: the page points, the picture points and the delays are
//! Float32Arrays in RN (pageXY, picXY, delays), so they are rounded to f32 where RN stores them
//! and every later step reads the rounded values (the centroids, angles, ripple and travel); a
//! letter's advance is Core Text's (hmtx × 30 / 2000 in f64, then Skia's f32), not an f32
//! product. The colour buffer is RN Skia's: a Float32Array per letter read as JS numbers and
//! turned into an 8-bit SkColor by truncation (SkColorSetARGB(a × 255, r × 255, …)), so a
//! letter's alpha is ⌊f32(1 − 0.42 sin(pe π)) × 255⌋. drawAtlas blends it with the sprite as the
//! source and the colour as the destination (SkCanvas.h), so srcIn is the sprite × the colour's
//! alpha: the ink is the atlas's #1c1a17 and the buffer's rgb (0.11, 0.102, 0.09) never shows.
//! Here that is the atlas modulated by white at that alpha.
//!
//! Math.random(): a stream named by the launch's seed (`env.seed`, exactTime().seed: a whole
//! number drawn once per launch) and by this surface's instance, so each mount and each
//! re-computation (a resize) draws fresh numbers, as RN's Math.random does; 53-bit doubles in
//! [0, 1), as Math.random's. The image is kept in images/ as prince.png's own 8-bit r, g, b
//! (what RN's readPixels returns: tools/prince-ink.py), and RN's makeInkProb runs on them here
//! in f64. The targets are computed at the first frame (RN defers them past its first paint,
//! the morph a no-op until then).

use std::sync::atomic::{AtomicU32, Ordering};

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Spring};
use skia::{Canvas, Color, Font, Images, Paint, Rect, Renderer, RsXform};


/// PAGE_BG, INK.
const PAGE_BG: u32 = 0xf7f4ec;
const INK: u32 = 0x1c1a17;
/// GLYPH_CELL, GLYPH_FONT_SIZE, GLYPH_PAD.
const CELL: f64 = 40.0;
const FONT_SIZE: f32 = 30.0;
const PAD: f64 = 3.0;
const PAGE_SCALE: f64 = 0.48;
const PICTURE_SCALE: f64 = 0.44;
const PAGE_MARGIN: f64 = 0.09;
const MIN_SPACING: f64 = 0.014;
const MAX_TRIES: usize = 800;
const PRUNE_RADIUS: f64 = 3.2;
const PRUNE_MIN: usize = 6;
const BOX_W: f64 = 0.9;
const BOX_H: f64 = 0.7;
const STAGGER: f64 = 0.55;
const JITTER: f64 = 0.15;
const DURATION_MS: f64 = 2000.0;
const CAMERA_Z: f64 = 820.0;
const Z_BASE: f64 = 85.0;
const Z_MOVE: f64 = 290.0;
const ROT_3D: f64 = 0.11;
const FADE: f64 = 0.42;
/// MORPH_PATTERN's discrete events (ms).
const TICKS: [f64; 11] = [0.0, 90.0, 180.0, 280.0, 380.0, 490.0, 610.0, 740.0, 880.0, 1030.0, 1200.0];
const IMAGE: (usize, usize) = (910, 1218);
/// Newsreader's default instance, only the page's letters.
static NEWSREADER: &[u8] = include_bytes!("../fonts/newsreader-prince-subset.ttf");
/// prince.png's 8-bit r, g, b per pixel (row major, 910 × 1218; a pixel whose ink probability
/// is 0 written white, also 0): tools/prince-ink.py.
static PIXELS: &[u8] = include_bytes!("../images/prince-rgb-910x1218.rgb8.zlib");
/// constants.ts INK_FLOOR, SAT_WEIGHT, SAMPLE_GAMMA.
const INK_FLOOR: f64 = 0.18;
const SAT_WEIGHT: f64 = 0.45;
const SAMPLE_GAMMA: f64 = 1.4;
/// Newsreader's units per em: an advance is Core Text's hmtx × size / 2000.
const UNITS_PER_EM: f64 = 2000.0;
/// Surfaces made so far: each one's Math.random() stream is its own.
static INSTANCES: AtomicU32 = AtomicU32::new(0);

/// LITTLE_PRINCE_TEXT.
const TEXT: &str = "“You are beautiful, but you are empty,” he went on. “One could not die for you. To be \
    sure, an ordinary passerby would think that my rose looked just like you—the rose that \
    belongs to me. But in herself alone she is more important than all the hundreds of you \
    other roses: because it is she that I have watered; because it is she that I have put \
    under the glass globe; because it is she that I have sheltered behind the screen; \
    because it is for her that I have killed the caterpillars (except the two or three that \
    we saved to become butterflies); because it is she that I have listened to, when she \
    grumbled, or boasted, or even sometimes when she said nothing. Because she is my \
    rose.”\nAnd he went back to meet the fox.\n“Goodbye,” he said.\n“Goodbye,” said the \
    fox.\n“And now here is my secret, a very simple secret: It is only with the heart that \
    one can see rightly; what is essential is invisible to the eye.”\nWhat is essential is \
    invisible to the eye, the little prince repeated, so that he would be sure to \
    remember.\n“It is the time you have wasted for your rose that makes your rose so \
    important.”\n“It is the time I have wasted for my rose…” the little prince repeated, so \
    that he would be sure to remember.\n“Men have forgotten this truth,” said the fox. “But \
    you must not forget it. You become responsible, forever, for what you have tamed. You \
    are responsible for your rose…”";

/// The demo's surface. Inputs: a seed (Math.random()), and whether the picture is shown.
pub fn surface() -> Box<dyn Surface> {
    Box::new(prince())
}

fn prince() -> Prince {
    Prince {
        seed: None,
        instance: INSTANCES.fetch_add(1, Ordering::Relaxed),
        random: Stream(0),
        revealed: None,
        size: (0.0, 0.0),
        font: Font::new(NEWSREADER, FONT_SIZE),
        unique: Vec::new(),
        cols: 1,
        sprites: Vec::new(),
        page: Vec::new(),
        picture: Vec::new(),
        delays: Vec::new(),
        travel: Vec::new(),
        signs: Vec::new(),
        xforms: Vec::new(),
        colors: Vec::new(),
        progress: Spring::at(0.0),
        ticks: None,
        posted: Vec::new(),
        atlas: None,
        atlas_canvas: Canvas::default(),
        atlas_renderer: Renderer::default(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    }
}

struct Prince {
    seed: Option<f64>,
    instance: u32,
    /// Math.random(), for every computation of the targets this surface makes.
    random: Stream,
    revealed: Option<bool>,
    /// The window the layout and the targets were made for.
    size: (f64, f64),
    font: Option<Font>,
    /// atlas.uniqueChars.
    unique: Vec<char>,
    cols: usize,
    /// Per letter: its sprite, page point, picture point, delay, normMove, rotSign.
    sprites: Vec<Rect>,
    page: Vec<(f64, f64)>,
    picture: Vec<(f64, f64)>,
    delays: Vec<f64>,
    travel: Vec<f64>,
    signs: Vec<f64>,
    xforms: Vec<RsXform>,
    colors: Vec<Color>,
    progress: Spring,
    /// The haptic pattern: when it started (stamped at the next frame), the next event.
    ticks: Option<(Option<f64>, usize)>,
    posted: Vec<String>,
    atlas: Option<Images>,
    atlas_canvas: Canvas,
    atlas_renderer: Renderer,
    canvas: Canvas,
    renderer: Renderer,
}

/// Math.random(): mulberry32 named by (seed, instance), two draws per number as a 53-bit double
/// in [0, 1) (genrand_res53), the resolution of Math.random's.
#[derive(Clone)]
struct Stream(u32);

impl Stream {
    fn new(seed: f64, instance: u32) -> Stream {
        Stream((seed.abs() as u64 % 4_294_967_296) as u32 ^ 0x9E37_79B9 ^ instance.wrapping_mul(0x85EB_CA6B))
    }
    fn word(&mut self) -> u32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
    fn next(&mut self) -> f64 {
        let a = (self.word() >> 5) as f64;
        let b = (self.word() >> 6) as f64;
        (a * 67_108_864.0 + b) / 9_007_199_254_740_992.0
    }
}

/// A JS number stored in a Float32Array and read back.
fn f32r(v: f64) -> f64 {
    v as f32 as f64
}

/// makeInkProb on a pixel's 8-bit r, g, b, in RN's f64 and order of operations.
fn ink_prob(rgb: &[u8]) -> f64 {
    let r = rgb[0] as f64 / 255.0;
    let g = rgb[1] as f64 / 255.0;
    let b = rgb[2] as f64 / 255.0;
    let lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let mx = r.max(g).max(b);
    let mn = r.min(g).min(b);
    let sat = if mx <= 0.0 { 0.0 } else { (mx - mn) / mx };
    let ink = (1.0 - lum).max(sat * SAT_WEIGHT);
    let t = 0f64.max(1f64.min((ink - INK_FLOOR) / (1.0 - INK_FLOOR)));
    t.powf(SAMPLE_GAMMA)
}

/// getGlyphWidths at 30 as RN Skia measures on iOS: Core Text's advance (hmtx × 30 / 2000, in
/// f64) rounded once to f32. `advance_width` multiplies in f32 (one ulp off for 15 of the
/// page's characters); the font unit count is recovered from it exactly (an integer, far
/// inside f32's precision) and scaled as Core Text does.
fn core_text_advance(font: &Font, c: char) -> f64 {
    let mut buf = [0u8; 4];
    let w = font.advance_width(c.encode_utf8(&mut buf)) as f64;
    let units = (w * UNITS_PER_EM / FONT_SIZE as f64).round();
    (units * FONT_SIZE as f64 / UNITS_PER_EM) as f32 as f64
}

/// What a letter's colour does under srcIn: the sprite (the atlas's ink) × the colour's alpha,
/// the alpha as RN Skia makes the SkColor: val[3] = 1 − fade stored in a Float32Array, read back
/// as a JS number, × 255, truncated. As a modulating colour: white at that alpha.
fn sk_color(fade: f64) -> Color {
    let a = (1.0 - fade) as f32 as f64;
    Color::rgba8(255, 255, 255, (a * 255.0) as u8)
}

/// pe: 0 before a letter starts, 1 once it has landed.
fn letter_phase(p: f64, d: f64) -> f64 {
    let start = d * STAGGER;
    let end = start + (1.0 - STAGGER);
    ((p - start) / (end - start)).clamp(0.0, 1.0)
}

impl Prince {
    /// buildAtlas + buildLayout.
    fn layout(&mut self, font: &Font, width: f64, height: f64) {
        self.unique.clear();
        for c in TEXT.chars().filter(|c| *c != ' ' && *c != '\n') {
            if !self.unique.contains(&c) {
                self.unique.push(c);
            }
        }
        self.cols = (self.unique.len() as f64).sqrt().ceil() as usize;
        let advance = |c: char| {
            let w = core_text_advance(font, c);
            if w.is_finite() && w > 0.0 {
                w
            } else {
                FONT_SIZE as f64 * 0.5
            }
        };
        let char_advance: Vec<f64> = self.unique.iter().map(|&c| advance(c)).collect();
        let space = advance(' ');
        let ds = PAGE_SCALE;
        let half = CELL / 2.0 * ds;
        let pad_x = PAD * ds;
        let margin_x = width * PAGE_MARGIN;
        let margin_y = height * 0.13;
        let col_right = width - margin_x;
        let col_bottom = height - margin_y;
        let line_height = FONT_SIZE as f64 * ds * 1.55;
        let space_w = space * ds;
        let indent = space_w * 3.0;
        self.page.clear();
        self.sprites.clear();
        let cols = self.cols;
        let sprite = |i: usize| Rect::new(((i % cols) as f64 * CELL) as f32, ((i / cols) as f64 * CELL) as f32, CELL as f32, CELL as f32);
        let index = |c: char| self.unique.iter().position(|u| *u == c);
        let mut y = margin_y;
        let mut placed = true;
        for paragraph in TEXT.trim().split('\n').map(str::trim).filter(|p| !p.is_empty()) {
            if !placed {
                break;
            }
            let mut x = margin_x + indent;
            for word in paragraph.split_whitespace() {
                let word_w: f64 = word.chars().filter_map(index).map(|i| char_advance[i] * ds).sum();
                if x + word_w > col_right && x > margin_x {
                    x = margin_x;
                    y += line_height;
                    if y > col_bottom {
                        placed = false;
                        break;
                    }
                }
                for c in word.chars() {
                    let Some(i) = index(c) else { continue };
                    let cell_left = x - pad_x;
                    // Float32Array.from(pagePts).
                    self.page.push((f32r(cell_left + half), f32r(y + half)));
                    self.sprites.push(sprite(i));
                    x += char_advance[i] * ds;
                }
                x += space_w;
            }
            y += line_height;
            if y > col_bottom {
                placed = false;
            }
        }
    }

    /// computeTargets: sample → prune → fit → assign.
    fn targets(&mut self, width: f64, height: f64) {
        let n = self.page.len();
        let mut random = self.random.clone();
        let ink = miniz_oxide::inflate::decompress_to_vec_zlib(PIXELS).unwrap_or_default();
        let (img_w, img_h) = IMAGE;
        let mut raw = if ink.len() == img_w * img_h * 3 {
            let min_dist = img_w.max(img_h) as f64 * MIN_SPACING;
            let raw = sample(&ink, img_w, img_h, n, min_dist, &mut random);
            prune(raw, min_dist, &mut random)
        } else {
            Vec::new()
        };
        // fitToBox.
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        for &(x, y) in &raw {
            min_x = min_x.min(x);
            max_x = max_x.max(x);
            min_y = min_y.min(y);
            max_y = max_y.max(y);
        }
        if raw.is_empty() {
            (min_x, min_y, max_x, max_y) = (0.0, 0.0, 1.0, 1.0);
        }
        let cw = (max_x - min_x).max(1.0);
        let ch = (max_y - min_y).max(1.0);
        let aspect = cw / ch;
        let area_w = (width * BOX_W).min(height * BOX_H * aspect);
        let area_h = area_w / aspect;
        let ox = (width - area_w) / 2.0;
        let oy = (height - area_h) / 2.0;
        for s in raw.iter_mut() {
            *s = (ox + (s.0 - min_x) / cw * area_w, oy + (s.1 - min_y) / ch * area_h);
        }
        while raw.len() < n {
            let x = ox + area_w * (0.4 + random.next() * 0.2);
            let y = oy + area_h * (0.4 + random.next() * 0.2);
            raw.push((x, y));
        }
        // assignTargets.
        let centroid = |pts: &mut dyn Iterator<Item = (f64, f64)>| {
            let (mut sx, mut sy, mut k) = (0.0, 0.0, 0.0);
            for (x, y) in pts {
                sx += x;
                sy += y;
                k += 1.0;
            }
            (sx / k, sy / k)
        };
        let (pcx, pcy) = centroid(&mut self.page.iter().copied());
        let (scx, scy) = centroid(&mut raw.iter().take(n).copied());
        let mut page_order: Vec<(usize, f64)> = self.page.iter().enumerate().map(|(i, &(x, y))| (i, (y - pcy).atan2(x - pcx))).collect();
        // sort((u, v) => u.a - v.a): stable, −0 equal to +0.
        page_order.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        let mut sample_order: Vec<(usize, f64)> = raw.iter().enumerate().map(|(i, &(x, y))| (i, (y - scy).atan2(x - scx))).collect();
        sample_order.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        let (ax, ay) = (width, height);
        let max_r = self.page.iter().fold(1.0f64, |m, &(x, y)| {
            let r = ((x - ax) * (x - ax) + (y - ay) * (y - ay)).sqrt();
            if r > m {
                r
            } else {
                m
            }
        });
        self.picture = vec![(0.0, 0.0); n];
        self.delays = vec![0.0; n];
        for k in 0..n {
            let pi = page_order[k].0;
            let (sx, sy) = raw[sample_order[k].0];
            self.picture[pi] = (f32r(sx), f32r(sy));
            let (px, py) = self.page[pi];
            let (dx, dy) = (px - ax, py - ay);
            let r = (dx * dx + dy * dy).sqrt() / max_r;
            let e = r * r * r * (r * (r * 6.0 - 15.0) + 10.0);
            self.delays[pi] = f32r(e * (1.0 - JITTER) + random.next() * JITTER);
        }
        self.random = random;
        // reveal.tsx's travel memo.
        self.travel = (0..n)
            .map(|i| {
                let (dx, dy) = (self.picture[i].0 - self.page[i].0, self.picture[i].1 - self.page[i].1);
                ((dx * dx + dy * dy).sqrt() / width).min(1.0)
            })
            .collect();
        self.signs = (0..n).map(|i| if self.picture[i].0 - self.page[i].0 >= 0.0 { 1.0 } else { -1.0 }).collect();
        self.xforms = vec![RsXform::default(); n];
        self.colors = vec![sk_color(0.0); n];
    }

    /// The atlas texture: every unique letter in its cell, at 1×.
    fn build_atlas(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, encoder: &mut wgpu::CommandEncoder) {
        let Some(font) = self.font.as_ref() else { return };
        let rows = self.unique.len().div_ceil(self.cols);
        let (w, h) = ((self.cols as f64 * CELL) as u32, (rows as f64 * CELL) as u32);
        let images = Images::target(device, w, h);
        let c = &mut self.atlas_canvas;
        c.begin(1.0);
        let mut buf = [0u8; 4];
        for (i, ch) in self.unique.iter().enumerate() {
            let x = (i % self.cols) as f64 * CELL + PAD;
            let y = (i / self.cols) as f64 * CELL + CELL * 0.72;
            c.draw_text(ch.encode_utf8(&mut buf), x as f32, y as f32, font, &Paint::fill(Color::hex(INK)));
        }
        let view = images.render_view();
        self.atlas_renderer.draw(device, queue, encoder, c, &view, wgpu::TextureFormat::Rgba8Unorm, w, h, wgpu::Color::TRANSPARENT);
        self.renderer.set_images(&images);
        self.atlas = Some(images);
    }
}

/// sampleInkPoints: Poisson-disc samples where the ink is.
fn sample(rgb: &[u8], img_w: usize, img_h: usize, count: usize, min_dist: f64, random: &mut Stream) -> Vec<(f64, f64)> {
    let cell = min_dist;
    let gw = (img_w as f64 / cell).ceil() as usize + 1;
    let gh = (img_h as f64 / cell).ceil() as usize + 1;
    let mut grid: Vec<Vec<(f64, f64)>> = vec![Vec::new(); gw * gh];
    let mut raw = Vec::with_capacity(count);
    let min2 = min_dist * min_dist;
    let too_close = |grid: &Vec<Vec<(f64, f64)>>, x: f64, y: f64| {
        let (gx, gy) = ((x / cell).floor() as i64, (y / cell).floor() as i64);
        for ix in gx - 1..=gx + 1 {
            for iy in gy - 1..=gy + 1 {
                if ix < 0 || iy < 0 || ix as usize >= gw || iy as usize >= gh {
                    continue;
                }
                for &(px, py) in &grid[ix as usize * gh + iy as usize] {
                    if (px - x) * (px - x) + (py - y) * (py - y) < min2 {
                        return true;
                    }
                }
            }
        }
        false
    };
    let prob = |x: usize, y: usize| {
        let p = (y * img_w + x) * 3;
        ink_prob(&rgb[p..p + 3])
    };
    let max_guard = count * MAX_TRIES;
    let mut guard = 0;
    while raw.len() < count && guard < max_guard {
        guard += 1;
        let rx = (random.next() * img_w as f64).floor() as usize;
        let ry = (random.next() * img_h as f64).floor() as usize;
        let (x, y) = (rx as f64, ry as f64);
        if random.next() < prob(rx, ry) && !too_close(&grid, x, y) {
            grid[(x / cell).floor() as usize * gh + (y / cell).floor() as usize].push((x, y));
            raw.push((x, y));
        }
    }
    let mut guard = 0;
    while raw.len() < count && guard < max_guard {
        guard += 1;
        let rx = (random.next() * img_w as f64).floor() as usize;
        let ry = (random.next() * img_h as f64).floor() as usize;
        if random.next() < prob(rx, ry) {
            raw.push((rx as f64, ry as f64));
        }
    }
    raw
}

/// pruneStrays: drop points with fewer than PRUNE_MIN neighbours, re-seed onto kept ones.
fn prune(raw: Vec<(f64, f64)>, min_dist: f64, random: &mut Stream) -> Vec<(f64, f64)> {
    if raw.len() <= 8 {
        return raw;
    }
    let r2 = (min_dist * PRUNE_RADIUS).powi(2);
    let cell = min_dist * PRUNE_RADIUS;
    let mut grid: std::collections::HashMap<(i64, i64), Vec<usize>> = std::collections::HashMap::new();
    for (i, &(x, y)) in raw.iter().enumerate() {
        grid.entry(((x / cell).floor() as i64, (y / cell).floor() as i64)).or_default().push(i);
    }
    let neighbours = |i: usize| {
        let (x, y) = raw[i];
        let (gx, gy) = ((x / cell).floor() as i64, (y / cell).floor() as i64);
        let mut n = 0;
        for ix in gx - 1..=gx + 1 {
            for iy in gy - 1..=gy + 1 {
                for &j in grid.get(&(ix, iy)).map(|v| v.as_slice()).unwrap_or(&[]) {
                    if j != i && (raw[j].0 - x).powi(2) + (raw[j].1 - y).powi(2) < r2 {
                        n += 1;
                    }
                }
            }
        }
        n
    };
    let mut keep: Vec<(f64, f64)> = (0..raw.len()).filter(|&i| neighbours(i) >= PRUNE_MIN).map(|i| raw[i]).collect();
    if keep.len() <= 8 {
        return raw;
    }
    let missing = raw.len() - keep.len();
    for _ in 0..missing {
        let seed = keep[(random.next() * keep.len() as f64).floor() as usize];
        let x = seed.0 + (random.next() - 0.5) * min_dist;
        let y = seed.1 + (random.next() - 0.5) * min_dist;
        keep.push((x, y));
    }
    keep
}

impl Surface for Prince {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        if self.seed != Some(seed) {
            self.seed = Some(seed);
            self.random = Stream::new(seed, self.instance);
            self.size = (0.0, 0.0);
        }
        let revealed = inputs.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
        if let Some(was) = self.revealed {
            if was != revealed {
                let to = if revealed { 1.0 } else { 0.0 };
                let v = self.progress.velocity;
                let config = duration_config(self.progress.value - to, v, DURATION_MS, 1.0, 4.0);
                self.progress.to(to, v, config);
                self.ticks = Some((None, 0));
            }
        } else if revealed {
            self.progress.set(1.0);
        }
        self.revealed = Some(revealed);
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"revealed\":{},\"progress\":{:.3},\"letters\":{}}}", self.revealed.unwrap_or(false), self.progress.value, self.page.len()))
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
        let (w, h) = (frame.width as f64, frame.height as f64);
        if self.size != (w, h) {
            self.size = (w, h);
            if let Some(font) = self.font.take() {
                self.layout(&font, w, h);
                self.font = Some(font);
                self.targets(w, h);
            }
        }
        if self.atlas.is_none() && !self.unique.is_empty() {
            self.build_atlas(device, queue, encoder);
        }
        let now = frame.now_ms;
        let mut moving = self.progress.step(now);
        if let Some((start, next)) = &mut self.ticks {
            let start = *start.get_or_insert(now);
            while *next < TICKS.len() && now - start >= TICKS[*next] {
                self.posted.push("tick".into());
                *next += 1;
            }
            if *next >= TICKS.len() {
                self.ticks = None;
            } else {
                moving = true;
            }
        }
        let p = self.progress.value;
        let (cxc, cyc) = (w / 2.0, h / 2.0);
        let half = CELL / 2.0;
        for i in 0..self.page.len() {
            let pe = letter_phase(p, self.delays[i]);
            let (sx, sy) = self.page[i];
            let (tx, ty) = self.picture[i];
            let cx0 = sx + (tx - sx) * pe;
            let cy0 = sy + (ty - sy) * pe;
            let eff = (pe * std::f64::consts::PI).sin();
            let z = eff * (Z_BASE + self.travel[i] * Z_MOVE);
            let persp = CAMERA_Z / (CAMERA_Z - z);
            let cx = cxc + (cx0 - cxc) * persp;
            let cy = cyc + (cy0 - cyc) * persp;
            let s = (PAGE_SCALE + (PICTURE_SCALE - PAGE_SCALE) * pe) * persp;
            let rot = eff * ROT_3D * self.travel[i] * self.signs[i];
            let (scos, ssin) = (s * rot.cos(), s * rot.sin());
            self.xforms[i] = RsXform { scos: scos as f32, ssin: ssin as f32, tx: (cx - half * (scos - ssin)) as f32, ty: (cy - half * (ssin + scos)) as f32 };
            self.colors[i] = sk_color(eff * FADE);
        }
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::hex(PAGE_BG));
        if let Some(atlas) = self.atlas.as_ref() {
            // colorBlendMode="srcIn": the sprite in the colour's alpha (see the header).
            c.draw_atlas(atlas.image(0), &self.sprites, &self.xforms, Some(&self.colors), false);
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::WHITE);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_page_flies_into_the_picture_and_back() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 912.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(3.0), Value::Bool(false)], None).unwrap();
        let (page, moving) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        page.save("prince-page");
        assert!(!moving);
        let letters: usize = s.agent("{}").unwrap().split("\"letters\":").nth(1).unwrap().trim_end_matches('}').parse().unwrap();
        assert!(letters > 900, "{letters}");
        // Ink on the page's first line (y ≈ 118.6…), none in the margin.
        let first_line = (2 * 40..2 * 380).filter(|&x| page.at(x, 2 * 124)[0] < 150).count();
        assert!(first_line > 20, "{first_line}");
        assert_eq!(&page.at(10, 10)[..3], &[0xf7, 0xf4, 0xec]);

        s.bind(&[Value::Number(3.0), Value::Bool(true)], None).unwrap();
        let mut ms = 0.0;
        let mut ticks = 0;
        while ms < 1000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ticks += s.messages().len();
        }
        let (mid, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        mid.save("prince-mid");
        assert!(moving);
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            ticks += s.messages().len();
        }
        let (picture, moving) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        picture.save("prince-picture");
        assert!(!moving);
        assert_eq!(ticks, TICKS.len());
        // The page's first line is empty now.
        let first_line = (2 * 40..2 * 380).filter(|&x| picture.at(x, 2 * 124)[0] < 150).count();
        assert!(first_line < 10, "{first_line}");
    }

    /// prince.png through RN's makeInkProb (tools/prince-ink.py, numpy on the PNG's samples):
    /// the same pixels have ink, and the probabilities sum to the same f64, bit for bit.
    #[test]
    fn the_ink_is_rns_probability_of_the_pngs_own_pixels() {
        let rgb = miniz_oxide::inflate::decompress_to_vec_zlib(PIXELS).unwrap();
        assert_eq!(rgb.len(), IMAGE.0 * IMAGE.1 * 3);
        let (mut count, mut sum) = (0usize, 0.0f64);
        for px in rgb.chunks_exact(3) {
            let p = ink_prob(px);
            if p > 0.0 {
                count += 1;
                sum += p;
            }
        }
        assert_eq!(count, 170960);
        assert_eq!(sum, 4419.394717270405);
        // The 8-bit store this replaces was off by up to 1/510 per pixel: one of RN's
        // probabilities, (40, 36, 31), is not a multiple of 1/255.
        let p = ink_prob(&[40, 36, 31]);
        assert!(((p * 255.0).round() / 255.0 - p).abs() > 1e-4, "{p}");
    }

    /// Core Text's advances (CTFontGetAdvancesForGlyphs on Newsreader.ttf at 30, optical size
    /// "none" as Skia's SkCTFontCreateExactCopy asks), f32 as Skia keeps them.
    #[test]
    fn advances_are_core_texts() {
        let font = Font::new(NEWSREADER, FONT_SIZE).unwrap();
        for (c, ct) in [('o', 15.135f64), ('Y', 19.904999999999998), ('u', 15.344999999999999), (' ', 6.66), ('—', 20.37), ('“', 11.865)] {
            assert_eq!(core_text_advance(&font, c), ct as f32 as f64, "{c}");
        }
        let mut buf = [0u8; 4];
        for c in TEXT.chars().filter(|c| *c != '\n') {
            let w = font.advance_width(c.encode_utf8(&mut buf)) as f64 * UNITS_PER_EM / FONT_SIZE as f64;
            assert!((w - w.round()).abs() < 1e-3, "{c}: {w}");
        }
    }

    /// reveal.tsx's colour buffer as RN Skia converts it (SkColorSetARGB of the f32 × 255,
    /// truncated); only its alpha reaches the screen under srcIn.
    #[test]
    fn letter_colours_are_rn_skias_truncated_alpha() {
        assert_eq!(sk_color(0.0), Color::rgba8(255, 255, 255, 255));
        // Mid-flight, sin(pe π) = 1: 1 − 0.42 = 0.58, × 255 = 147.9 → 147.
        assert_eq!(sk_color(FADE), Color::rgba8(255, 255, 255, 147));
    }

    /// Math.random(): a fresh stream per surface (RN draws anew on each mount), 53-bit.
    #[test]
    fn each_surface_draws_its_own_numbers() {
        let (mut a, mut b) = (Stream::new(7.0, 0), Stream::new(7.0, 1));
        let (x, y) = (a.next(), b.next());
        assert_ne!(x, y);
        let mut fine = false;
        for _ in 0..64 {
            let v = a.next();
            assert!((0.0..1.0).contains(&v));
            fine |= (v * 4_294_967_296.0).fract() != 0.0;
        }
        assert!(fine, "only 32 bits");
        assert_ne!(prince().instance, prince().instance);
    }

    /// `PRINCE_DUMP=/tmp/prince.json cargo test -p demos-gpu prince_dump`: the layout and targets
    /// at a window and stream, for tools/prince-parity.ts to recompute with RN's own code.
    #[test]
    fn prince_dump() {
        let Ok(path) = std::env::var("PRINCE_DUMP") else { return };
        let mut out = String::from("[");
        for (i, &(w, h, seed)) in [(420.0, 912.0, 3.0), (402.0, 874.0, 2_718_281_828.0), (375.0, 667.0, 0.0)].iter().enumerate() {
            let mut p = prince();
            p.random = Stream::new(seed, 0);
            let state = p.random.0;
            let font = p.font.take().unwrap();
            p.layout(&font, w, h);
            let advances: Vec<String> = p.unique.iter().map(|&c| format!("[{},{}]", c as u32, core_text_advance(&font, c))).chain([format!("[32,{}]", core_text_advance(&font, ' '))]).collect();
            p.targets(w, h);
            let list = |v: &[(f64, f64)]| v.iter().map(|(x, y)| format!("{x},{y}")).collect::<Vec<_>>().join(",");
            let delays: Vec<String> = p.delays.iter().map(|d| d.to_string()).collect();
            if i > 0 {
                out.push(',');
            }
            out += &format!(
                "{{\"width\":{w},\"height\":{h},\"state\":{state},\"advances\":[{}],\"pageXY\":[{}],\"picXY\":[{}],\"delays\":[{}]}}",
                advances.join(","),
                list(&p.page),
                list(&p.picture),
                delays.join(",")
            );
        }
        out.push(']');
        std::fs::write(path, out).unwrap();
    }
}
