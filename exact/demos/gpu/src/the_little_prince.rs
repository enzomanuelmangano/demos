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
//! Math.random() is a stream seeded by the Contract (a launch's seed). The image's ink is kept
//! in images/ as the probability itself (8 bits), not the PNG. The targets are computed at the
//! first frame (RN defers them past its first paint, the morph a no-op until then).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{duration_config, Spring};
use skia::{Canvas, Color, Font, Images, Paint, Rect, Renderer, RsXform};

use crate::gfx;

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
/// prince.png's ink probability per pixel (row major, 910 × 1218, × 255).
static INK_MAP: &[u8] = include_bytes!("../images/prince-ink-910x1218.u8.zlib");

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
    Box::new(Prince {
        seed: None,
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
    })
}

struct Prince {
    seed: Option<f64>,
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
        let mut buf = [0u8; 4];
        let advance = |c: char, buf: &mut [u8; 4]| {
            let w = font.advance_width(c.encode_utf8(buf)) as f64;
            if w.is_finite() && w > 0.0 {
                w
            } else {
                FONT_SIZE as f64 * 0.5
            }
        };
        let char_advance: Vec<f64> = self.unique.iter().map(|&c| advance(c, &mut buf)).collect();
        let space = advance(' ', &mut buf);
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
                    self.page.push((cell_left + half, y + half));
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
    fn targets(&mut self, width: f64, height: f64, seed: f64) {
        let n = self.page.len();
        let mut random = gfx::Random::new(seed);
        let ink = miniz_oxide::inflate::decompress_to_vec_zlib(INK_MAP).unwrap_or_default();
        let (img_w, img_h) = IMAGE;
        let mut raw = if ink.len() == img_w * img_h {
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
        page_order.sort_by(|a, b| a.1.total_cmp(&b.1));
        let mut sample_order: Vec<(usize, f64)> = raw.iter().enumerate().map(|(i, &(x, y))| (i, (y - scy).atan2(x - scx))).collect();
        sample_order.sort_by(|a, b| a.1.total_cmp(&b.1));
        let (ax, ay) = (width, height);
        let max_r = self.page.iter().fold(1.0f64, |m, &(x, y)| m.max((x - ax).hypot(y - ay)));
        self.picture = vec![(0.0, 0.0); n];
        self.delays = vec![0.0; n];
        for k in 0..n {
            let pi = page_order[k].0;
            self.picture[pi] = raw[sample_order[k].0];
            let (px, py) = self.page[pi];
            let r = (px - ax).hypot(py - ay) / max_r;
            let e = r * r * r * (r * (r * 6.0 - 15.0) + 10.0);
            self.delays[pi] = e * (1.0 - JITTER) + random.next() * JITTER;
        }
        // reveal.tsx's travel memo.
        self.travel = (0..n).map(|i| ((self.picture[i].0 - self.page[i].0).hypot(self.picture[i].1 - self.page[i].1) / width).min(1.0)).collect();
        self.signs = (0..n).map(|i| if self.picture[i].0 - self.page[i].0 >= 0.0 { 1.0 } else { -1.0 }).collect();
        self.xforms = vec![RsXform::default(); n];
        self.colors = vec![Color::hex(INK); n];
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
fn sample(ink: &[u8], img_w: usize, img_h: usize, count: usize, min_dist: f64, random: &mut gfx::Random) -> Vec<(f64, f64)> {
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
    let prob = |x: usize, y: usize| ink[y * img_w + x] as f64 / 255.0;
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
fn prune(raw: Vec<(f64, f64)>, min_dist: f64, random: &mut gfx::Random) -> Vec<(f64, f64)> {
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
                self.targets(w, h, self.seed.unwrap_or(0.0));
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
        let [r, g, b, _] = Color::hex(INK).0;
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
            self.colors[i] = Color([r, g, b, (1.0 - eff * FADE) as f32]);
        }
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::hex(PAGE_BG));
        if let Some(atlas) = self.atlas.as_ref() {
            c.draw_atlas(atlas.image(0), &self.sprites, &self.xforms, Some(&self.colors), true);
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
}
