//! Journey's road (WP-C): `journeyunit`, one unit row of the road, as the RN app paints it
//! (src/components/journey/road-units.ts `paintUnit`: the trail's dots, then each tile in node
//! order by iso-tile.tsx `drawIsoTile`), on draw2d. The row canvas sits inside the native scroll's
//! content (home-tabs-architecture.md §2): UIKit moves it, nothing is drawn per scroll frame, and
//! only the unit with the shining or pressed tile draws again.
//!
//! `journeyunit(tiles, dots, shine, pulse, pulseKey, press, shake, shakeKey, tick, reduced, light)`:
//! - `tiles` "x,y,size,state,glyph;…" in the canvas's points (state d/c/l, glyph an index of
//!   [`GLYPHS`]) and `dots` "x,y,reached;…", as api/journey-road.ts lays them out;
//! - `shine` the tile that breathes (the current node), -1 none; `pulse` 0 at rest, 1 the pulse
//!   (pulseJourneyNode, after 350 ms), 2 the arrival's shine (shineJourneyNode after 320 ms, then the
//!   pulse); `pulseKey` restarts it;
//! - `press` the tile under the finger (tileMotion.press), -1 none; `shake`/`shakeKey` a locked
//!   tile's "not yet" (shakeTile); `tick` a tap that let go before the press's haptic (road-gesture.ts
//!   PressDelayMs 90: the tap ticks on release instead); `reduced` Reduce Motion; `light` the page's
//!   scheme (`exactViewport().prefersColorScheme`), so a row draws in it on its first frame.
//!
//! First visit (knowledge-base/journey-tab-built.md "First visit"): the canvas has no children (a
//! scheme probe child cost each row a host capture and a probe pipeline), every row shares its
//! device's draw2d programs and the glyph atlas's texture, and [`warm`] builds both off the main
//! thread while Home is idle, as RN's journey-gpu-warm.ts compiles the road's programs ahead.

use std::sync::{Arc, OnceLock};

use draw2d::{point, Canvas, Color, Image, ImageRef, Images, Paint, Path, Point, Programs, Rect, Renderer, RsXform, Shader};
use exact_gpu::json::{number, text};
use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use motion::easing::Easing;
use motion::spring::{duration_config, Spring};
use motion::timing::Timing;

use crate::pulsar::Pulsar;
use crate::warm::PerDevice;

/// The inputs, in bind order.
pub const INPUTS: usize = 11;

// ── iso-tile.tsx ──
const HALF_WIDTH_RATIO: f32 = 0.62;
const DEPTH_RATIO: f32 = 0.15;
const PRESS_TRAVEL: f32 = 0.75;
const PRESS_SHADE: f32 = 0.28;
const CORNER_RADIUS: f32 = 4.0;
const SHADOW_REACH: f32 = 1.1;
const SHADOW_SPREAD: f32 = 1.06;
const SHINE_LIFT: f32 = 0.7;
const SHINE_MS: f64 = 1800.0;
const PULSE_MS: f64 = 2000.0;
const PULSE_STRENGTH: f32 = 0.35;
const PULSE_GAP_MS: f64 = 1600.0;
const SHINE_RISE: f32 = 0.45;
const SHINE_GLOW_REACH: f32 = 0.55;
const SHINE_FACE: f32 = 0.3;
const FLASH_FACE: f32 = 0.28;
const SHINE_RING_REACH: f32 = 1.1;
const SHINE_RING_SPAN: f32 = 0.9;
/// journey.tsx: the pulse starts 350 ms after the screen comes on stage; the arrival's shine 320 ms.
const PULSE_DELAY_MS: f64 = 350.0;
const ARRIVAL_DELAY_MS: f64 = 320.0;
/// While the light rests (iso-tile.tsx: `withDelay(PulseGapMs, …)` holds the shared value, so Skia
/// draws nothing), the row draws at most REST_FPS (exact-gpu's lowest cap) and goes back to the
/// display's rate REST_WAKE_MS before the next round.
const REST_FPS: u32 = 5;
const REST_WAKE_MS: f64 = 250.0;
/// road-gesture.ts PressDelayMs: the press's haptic, once per touch.
const PRESS_HAPTIC_MS: f64 = 90.0;
fn tan30() -> f32 {
    (std::f32::consts::PI / 6.0).tan()
}

/// lib/haptics/journey.ts JourneyPressPattern, as written (the continuous half's times are 0.07,
/// in Pulsar's milliseconds).
pub const PRESS_PATTERN: Pulsar = Pulsar { discrete: &[(0.0, 0.85, 0.25)], amplitude: &[(0.0, 0.45), (0.07, 0.0)], frequency: &[(0.0, 0.2), (0.07, 0.1)] };

/// journey-road.ts GlyphName, in the order api/journey-road.ts indexes it.
pub const GLYPHS: [&str; 7] = ["cap", "check", "lock", "play", "trophy", "book", "again"];

/// iso-glyph-atlas.ts IsoGlyphCells: each glyph's cell for tiles of 70 and 84, at 2x and 3x.
fn cell(scale: u32, glyph: usize, size: f32) -> Rect {
    let big = size > 77.0;
    if scale == 2 {
        let y = glyph as f32 * 68.0;
        if big {
            Rect { x: 96.0, y, width: 114.0, height: 68.0 }
        } else {
            Rect { x: 0.0, y, width: 96.0, height: 57.0 }
        }
    } else {
        let y = glyph as f32 * 99.0;
        if big {
            Rect { x: 141.0, y, width: 168.0, height: 99.0 }
        } else {
            Rect { x: 0.0, y, width: 141.0, height: 83.0 }
        }
    }
}

fn atlas(scale: u32) -> &'static Image {
    static TWO: OnceLock<Image> = OnceLock::new();
    static THREE: OnceLock<Image> = OnceLock::new();
    let (slot, bytes): (&OnceLock<Image>, &[u8]) =
        if scale == 2 { (&TWO, include_bytes!("../textures/journey/iso@2x.png")) } else { (&THREE, include_bytes!("../textures/journey/iso@3x.png")) };
    slot.get_or_init(|| {
        let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
        decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
        let mut reader = decoder.read_info().expect("a vendored PNG");
        let mut buf = vec![0; reader.output_buffer_size().expect("a vendored PNG's size")];
        let info = reader.next_frame(&mut buf).expect("a vendored PNG");
        buf.truncate(info.buffer_size());
        Image::from_rgba(info.width, info.height, buf)
    })
}

/// The glyph atlas for `scale` on `device`, decoded and uploaded once and shared by every row (each
/// row uploaded its own copy before). The last device's only: a recovered device uploads again.
fn atlas_images(device: &wgpu::Device, queue: &wgpu::Queue, scale: u32) -> Arc<Images> {
    static UPLOADED: PerDevice<Images> = PerDevice::new();
    UPLOADED.get(device, scale as u64, || Images::upload_unmipped(device, queue, atlas(scale)))
}

/// The road's draw2d programs for `format` on `device`, built once and shared by every row.
fn programs(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat) -> Arc<Programs> {
    static BUILT: PerDevice<Programs> = PerDevice::new();
    BUILT.get(device, format_key(format), || Programs::new(device, queue, format, crate::gfx::pipeline_cache(device).handle.as_ref()))
}

/// A texture format as a cache variant.
pub fn format_key(format: wgpu::TextureFormat) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    format.hash(&mut h);
    h.finish()
}

/// Journey's first visit, paid ahead (RN: journey-gpu-warm.ts, while the app is idle on another tab):
/// the road's draw2d programs for the canvases' `format`, the glyph atlas at `scale` decoded and
/// uploaded, and the floor's pipeline. Called once, off the main thread (crate::warm).
pub fn warm(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, scale: f32) {
    let _ = programs(device, queue, format);
    let _ = atlas_images(device, queue, if scale > 2.5 { 3 } else { 2 });
    crate::journey_floor::warm(device, format);
}

/// journey-colors.ts mixHex: per channel, rounded.
pub fn mix(from: u32, to: u32, t: f32) -> u32 {
    let ch = |c: u32, s: u32| ((c >> s) & 0xff) as f32;
    let one = |s: u32| ((ch(from, s) + (ch(to, s) - ch(from, s)) * t).round() as u32) << s;
    one(16) | one(8) | one(0)
}

/// The sand (journey-colors.ts unitColors, always sand): face, the road's track.
pub const FACE: u32 = 0xCBAA8E;
/// journey-prewarm.ts roadTheme `track`: dark colors.track, light colors.border.
pub fn track(light: bool) -> u32 {
    if light {
        0xE0DBD8
    } else {
        0x282C30
    }
}

/// tilePaintFor(tileTopFor(state)): the six colours of a tile in a state and scheme.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TilePaint {
    pub top: u32,
    pub top_light: u32,
    pub left: u32,
    pub right: u32,
    pub glyph: u32,
    pub shadow: Color,
    pub shadow_cast: Color,
}

pub fn tile_paint(state: u8, light: bool) -> TilePaint {
    let locked = state == b'l';
    let top = match state {
        b'l' => track(light),
        b'c' => mix(FACE, 0xFFFFFF, 0.12),
        _ => FACE,
    };
    let dark = !light;
    TilePaint {
        top,
        top_light: mix(top, 0xFFFFFF, 0.12),
        left: mix(top, 0, if dark { 0.24 } else { 0.14 }),
        right: mix(top, 0, if dark { 0.42 } else { 0.26 }),
        glyph: if locked { mix(top, if dark { 0xFFFFFF } else { 0 }, if dark { 0.22 } else { 0.18 }) } else { mix(top, 0, 0.62) },
        shadow: if dark { Color([0.0, 0.0, 0.0, 0.46]) } else { Color([33.0 / 255.0, 25.0 / 255.0, 17.0 / 255.0, 0.20]) },
        shadow_cast: if dark { Color([0.0, 0.0, 0.0, 0.36]) } else { Color([33.0 / 255.0, 25.0 / 255.0, 17.0 / 255.0, 0.24]) },
    }
}

/// easeBreath: smootherstep.
pub fn ease_breath(t: f32) -> f32 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

/// shineSwell: rises to 1 by SHINE_RISE, falls back to 0 by 1.
pub fn shine_swell(progress: f32) -> f32 {
    if progress <= 0.0 || progress >= 1.0 {
        return 0.0;
    }
    if progress < SHINE_RISE {
        return ease_breath(progress / SHINE_RISE);
    }
    1.0 - ease_breath((progress - SHINE_RISE) / (1.0 - SHINE_RISE))
}

/// The breathing light's progress and strength `ms` after it was asked for (pulse 1 or 2):
/// pulseJourneyNode's delay then repeat [0, linear to 1 in PULSE_MS, held PULSE_GAP_MS] at 0.35;
/// shineJourneyNode's 0 through its delay, linear to 1 in SHINE_MS at 1, then the pulse after the
/// gap. Reduce Motion: the pulse rests (1); the arrival's shine still runs, then rests.
pub fn shine_at(mode: u8, ms: f64, reduced: bool) -> (f32, f32) {
    let pulse = |ms: f64| -> (f32, f32) {
        if reduced || ms < 0.0 {
            return (1.0, PULSE_STRENGTH);
        }
        let k = ms % (PULSE_MS + PULSE_GAP_MS);
        ((k / PULSE_MS).min(1.0) as f32, PULSE_STRENGTH)
    };
    match mode {
        1 => pulse(ms - PULSE_DELAY_MS),
        2 => {
            let t = ms - ARRIVAL_DELAY_MS;
            if t < 0.0 {
                (0.0, 1.0)
            } else if t < SHINE_MS {
                ((t / SHINE_MS) as f32, 1.0)
            } else {
                pulse(t - SHINE_MS - PULSE_GAP_MS)
            }
        }
        _ => (1.0, PULSE_STRENGTH),
    }
}

/// How long the light of [`shine_at`] stays as it is from `ms` on, `None` while it moves: the pulse's
/// delay and its PULSE_GAP_MS hold, the arrival's dark delay and the gap after its shine.
pub fn shine_rests_for(mode: u8, ms: f64, reduced: bool) -> Option<f64> {
    let pulse = |ms: f64| -> Option<f64> {
        if reduced {
            return Some(f64::INFINITY);
        }
        if ms < 0.0 {
            return Some(-ms);
        }
        let k = ms % (PULSE_MS + PULSE_GAP_MS);
        (k >= PULSE_MS).then(|| PULSE_MS + PULSE_GAP_MS - k)
    };
    match mode {
        1 => pulse(ms - PULSE_DELAY_MS),
        2 => {
            let t = ms - ARRIVAL_DELAY_MS;
            if t < 0.0 {
                Some(-t)
            } else if t < SHINE_MS {
                None
            } else {
                pulse(t - SHINE_MS - PULSE_GAP_MS)
            }
        }
        _ => Some(f64::INFINITY),
    }
}

/// shakeTile's sequence: −6 (50 ms), 6 (60), −4 (60), 0 (50), each withTiming's default ease.
pub fn shake_at(ms: f64) -> f32 {
    let steps: [(f64, f32); 4] = [(50.0, -6.0), (60.0, 6.0), (60.0, -4.0), (50.0, 0.0)];
    let ease = Easing::timing_default();
    let (mut t, mut from) = (ms.max(0.0), 0.0f32);
    for (d, to) in steps {
        if t < d {
            return from + (to - from) * ease.at(t / d) as f32;
        }
        t -= d;
        from = to;
    }
    0.0
}

/// Reduce Motion's "not yet": a brightening, 1 in 70 ms, 0 in 150.
pub fn flash_at(ms: f64) -> f32 {
    let ease = Easing::timing_default();
    if ms < 0.0 || ms >= 220.0 {
        0.0
    } else if ms < 70.0 {
        ease.at(ms / 70.0) as f32
    } else {
        1.0 - ease.at((ms - 70.0) / 150.0) as f32
    }
}

/// A closed polygon with Skia's corner effect (PathEffect.MakeCorner): each corner a quadratic on
/// the corner, from `radius` (at most half the side) before it to as far after it.
pub fn corner_polygon(points: &[Point], radius: f32) -> Path {
    let n = points.len();
    let mut b = Path::builder();
    let along = |a: Point, c: Point, r: f32| {
        let d = c - a;
        let len = d.length();
        let k = if len > 0.0 { r.min(len / 2.0) / len } else { 0.0 };
        a + d * k
    };
    for i in 0..n {
        let (prev, here, next) = (points[(i + n - 1) % n], points[i], points[(i + 1) % n]);
        let a = along(here, prev, radius);
        let c = along(here, next, radius);
        if i == 0 {
            b.begin(a);
        } else {
            b.line_to(a);
        }
        b.quadratic_bezier_to(here, c);
    }
    b.end(true);
    b.build()
}

fn rgb(c: u32) -> Color {
    Color::hex(c)
}

/// One tile of a row.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tile {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub state: u8,
    pub glyph: usize,
}

/// One dot of the trail.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Dot {
    pub x: f32,
    pub y: f32,
    pub reached: bool,
}

pub fn parse_tiles(s: &str) -> Vec<Tile> {
    s.split(';')
        .filter_map(|t| {
            let f: Vec<&str> = t.split(',').collect();
            if f.len() < 5 {
                return None;
            }
            Some(Tile { x: f[0].parse().ok()?, y: f[1].parse().ok()?, size: f[2].parse().ok()?, state: *f[3].as_bytes().first()?, glyph: f[4].parse().ok()? })
        })
        .collect()
}

pub fn parse_dots(s: &str) -> Vec<Dot> {
    s.split(';')
        .filter_map(|t| {
            let f: Vec<&str> = t.split(',').collect();
            if f.len() < 3 {
                return None;
            }
            Some(Dot { x: f[0].parse().ok()?, y: f[1].parse().ok()?, reached: f[2] == "1" })
        })
        .collect()
}

/// A tile's motion this frame.
#[derive(Clone, Copy, Debug, Default)]
pub struct TileMotion {
    pub shake: f32,
    pub pressed: f32,
    pub flash: f32,
    /// The breathing light: progress and strength; `glow` only for the shining tile.
    pub shine: f32,
    pub strength: f32,
    pub glow: bool,
}

/// drawIsoTile: ring, glow, cast shadow, contact, body (left, then right clipped), top face,
/// glyph, shine and press shade. `iso`: the atlas at `scale` (2 or 3).
pub fn draw_tile(c: &mut Canvas, tile: &Tile, m: &TileMotion, light: bool, reduced: bool, iso: Option<(ImageRef, u32)>) {
    let paint = tile_paint(tile.state, light);
    let x = tile.x + m.shake;
    let hw = tile.size * HALF_WIDTH_RATIO;
    let hh = hw * tan30();
    let depth = tile.size * DEPTH_RATIO;
    let cy = tile.y - (hh * 2.0 + depth) / 2.0 + hh;
    let shine_at = if m.glow { m.shine } else { 1.0 };
    let swell = shine_swell(shine_at) * m.strength;
    let o = m.pressed * depth * PRESS_TRAVEL - if reduced { 0.0 } else { swell * depth * SHINE_LIFT };
    let rhombus = |cx: f32, cy: f32, w: f32, h: f32| [point(cx, cy - h), point(cx + w, cy), point(cx, cy + h), point(cx - w, cy)];
    // The glow's colour: face at 0.22 (journey-road.ts buildDetail `glow`).
    let glow_alpha = 0.22f32;
    if !reduced && m.glow && shine_at > 0.0 && shine_at < SHINE_RING_SPAN {
        let t = shine_at / SHINE_RING_SPAN;
        let spread = 1.0 + ease_breath(t) * SHINE_RING_REACH;
        let ring = corner_polygon(&rhombus(x, cy + depth, hw * spread, hh * spread), CORNER_RADIUS * spread);
        let a = (glow_alpha * 3.0).min(1.0) * (std::f32::consts::PI * t).sin() * m.strength;
        c.draw_path(&ring, &Paint::stroke(rgb(FACE).alpha(a), 2.0));
    }
    if m.glow {
        let spread = 1.45 + swell * SHINE_GLOW_REACH;
        let a = (glow_alpha * 0.9 * (1.0 + swell * 1.5)).min(1.0);
        c.draw_polygon_shadow(&rhombus(x, cy + depth, hw * spread, hh * spread), hw * 0.28, rgb(FACE).alpha(a));
    }
    let by = cy + depth;
    let sx = (depth - o) * SHADOW_REACH;
    let sy = sx * tan30();
    let sw = hw * SHADOW_SPREAD;
    let sh = hh * SHADOW_SPREAD;
    let cast = [point(x - sw, by), point(x, by - sh), point(x + sw, by), point(x + sw + sx, by + sy), point(x + sx, by + sh + sy), point(x - sw + sx, by + sy)];
    c.draw_polygon_shadow(&cast, depth * 0.45 + 2.0, paint.shadow_cast);
    c.draw_polygon_shadow(&rhombus(x, by, hw, hh), depth * 0.35 + 1.0, paint.shadow);
    let body = corner_polygon(
        &[point(x, cy - hh + o), point(x + hw, cy + o), point(x + hw, cy + depth), point(x, cy + hh + depth), point(x - hw, cy + depth), point(x - hw, cy + o)],
        CORNER_RADIUS,
    );
    c.draw_path(&body, &Paint::fill(rgb(paint.left)));
    c.save();
    c.clip_rect(x, cy - hh - 8.0, hw + 8.0, hh * 2.0 + depth + 16.0);
    c.draw_path(&body, &Paint::fill(rgb(paint.right)));
    c.restore();
    let top = corner_polygon(&rhombus(x, cy + o, hw, hh), CORNER_RADIUS);
    let face = Paint::shader(Shader::Linear {
        start: point(x, cy - hh + o),
        end: point(x, cy + hh + o),
        stops: draw2d::stops(&[rgb(paint.top_light), rgb(paint.top)]),
    });
    c.draw_path(&top, &face);
    if let Some((image, scale)) = iso {
        let r = cell(scale, tile.glyph, tile.size);
        let s = scale as f32;
        let (w, h) = (r.width / s, r.height / s);
        let mut left = x - w / 2.0;
        let mut upper = cy + o - h / 2.0;
        if o == 0.0 && m.shake == 0.0 {
            left = (left * s).round() / s;
            upper = (upper * s).round() / s;
        }
        c.draw_atlas(image, &[r], &[RsXform { scos: 1.0 / s, ssin: 0.0, tx: left, ty: upper }], Some(&[rgb(paint.glyph)]), true);
    }
    if swell > 0.0 || m.flash > 0.0 {
        c.draw_path(&top, &Paint::fill(Color::WHITE.alpha(swell * SHINE_FACE + m.flash * FLASH_FACE)));
    }
    if m.pressed > 0.0 {
        c.draw_path(&top, &Paint::fill(rgb(paint.right).alpha(m.pressed * PRESS_SHADE)));
    }
}

/// paintDots: r 2.5, reached in the face at 0.55, else the track.
pub fn draw_dots(c: &mut Canvas, dots: &[Dot], light: bool) {
    for d in dots {
        let color = if d.reached { rgb(FACE).alpha(0.55) } else { rgb(track(light)) };
        c.draw_circle(d.x, d.y, 2.5, &Paint::fill(color));
    }
}

#[derive(Default)]
struct UnitSurface {
    tiles: Vec<Tile>,
    dots: Vec<Dot>,
    shine: i32,
    pulse: u8,
    pulse_key: f64,
    pulse_from: Option<f64>,
    press: i32,
    /// The tile the press, shake or flash last moved (tileMotion.id).
    active: i32,
    pressed: Timing,
    release: Option<Spring>,
    press_started: Option<f64>,
    haptic_played: bool,
    shake: i32,
    shake_key: f64,
    shake_from: Option<f64>,
    tick: f64,
    reduced: bool,
    light: bool,
    renderer: Renderer,
    /// The format the renderer was given the shared programs for.
    shared: Option<wgpu::TextureFormat>,
    canvas: Canvas,
    images: Option<(u32, Arc<Images>)>,
    messages: Vec<String>,
    /// [`Surface::max_fps`]: REST_FPS while only a resting light would redraw, else 0.
    rest_fps: u32,
}

impl UnitSurface {
    fn haptic(&mut self) {
        if !self.haptic_played {
            self.haptic_played = true;
            self.messages.extend(PRESS_PATTERN.messages());
        }
    }
}

impl Surface for UnitSurface {
    /// The device was lost (exact-gpu `Module::lose_device`; recovery gives this surface a new one):
    /// drop every resource of the old device, so the next render builds on the new one.
    fn device_lost(&mut self) {
        // The renderer's buffers, targets, bind group and shared programs, and the atlas's texture.
        self.renderer = Renderer::default();
        self.shared = None;
        self.images = None;
    }

    fn max_fps(&self) -> u32 {
        self.rest_fps
    }

    fn bind(&mut self, inputs: &[Value], _at_ms: Option<f64>) -> Result<(), SurfaceError> {
        // A new input (a press, a shake, a pulse) draws at the display's rate at once.
        self.rest_fps = 0;
        let num = |i: usize, name: &str| -> Result<f64, SurfaceError> { inputs.get(i).map(|v| number(v, name)).transpose().map(|v| v.unwrap_or(0.0)) };
        let txt = |i: usize, name: &str| -> Result<String, SurfaceError> { inputs.get(i).map(|v| text(v, name)).transpose().map(|v| v.unwrap_or_default()) };
        let tiles = txt(0, "tiles")?;
        self.tiles = parse_tiles(&tiles);
        self.dots = parse_dots(&txt(1, "dots")?);
        self.shine = num(2, "shine")? as i32;
        let pulse = num(3, "pulse")? as u8;
        let pulse_key = num(4, "pulseKey")?;
        if pulse != self.pulse || pulse_key != self.pulse_key {
            self.pulse = pulse;
            self.pulse_key = pulse_key;
            self.pulse_from = None;
        }
        let press = num(5, "press")? as i32;
        if press != self.press {
            if press >= 0 {
                // pressTile: to 1 in 70 ms (withTiming's default ease), the haptic at PressDelayMs.
                self.active = press;
                self.release = None;
                self.pressed.to(1.0, 70.0, Easing::timing_default());
                self.press_started = None;
                self.haptic_played = false;
            } else if self.press >= 0 {
                // releaseTile: withCalmSpring(0, dampingRatio 0.9, duration 260).
                let x0 = self.pressed.value;
                let mut s = Spring::at(x0);
                if self.reduced {
                    s.to_clamped(0.0, 0.0, duration_config(x0, 0.0, 260.0, 0.9, 1.0));
                } else {
                    s.to(0.0, 0.0, duration_config(x0, 0.0, 260.0, 0.9, 1.0));
                }
                self.release = Some(s);
                self.press_started = None;
            }
            self.press = press;
        }
        let shake = num(6, "shake")? as i32;
        let shake_key = num(7, "shakeKey")?;
        if shake_key != self.shake_key {
            self.shake_key = shake_key;
            if shake >= 0 && shake_key > 0.0 {
                self.active = shake;
                self.shake = shake;
                self.shake_from = None;
            }
        }
        let tick = num(8, "tick")?;
        if tick != self.tick {
            self.tick = tick;
            if tick > 0.0 {
                self.haptic();
            }
        }
        self.reduced = num(9, "reduced")? > 0.5;
        self.light = num(10, "light")? > 0.5;
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.messages)
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
        let light = self.light;
        // Press: the timing in, the spring out; the haptic once the press has held PressDelayMs.
        let mut moving = false;
        if self.press >= 0 {
            let start = *self.press_started.get_or_insert(now);
            moving |= self.pressed.step(now);
            if !self.haptic_played {
                if now - start >= PRESS_HAPTIC_MS {
                    self.haptic();
                } else {
                    moving = true;
                }
            }
        } else if let Some(s) = self.release.as_mut() {
            moving |= s.step(now);
            self.pressed.set(s.value.max(0.0));
            if !s.running {
                self.release = None;
                self.pressed.set(0.0);
            }
        }
        let shake_ms = self.shake_from.map_or(0.0, |t| now - t);
        if self.shake_key > 0.0 && self.shake_from.is_none() {
            self.shake_from = Some(now);
        }
        let shaking = self.shake_key > 0.0 && shake_ms < 220.0;
        moving |= shaking;
        let pulse_ms = now - *self.pulse_from.get_or_insert(now);
        let (shine, strength) = shine_at(self.pulse, pulse_ms, self.reduced);
        let breathing = self.shine >= 0
            && self.pulse != 0
            && !(self.reduced && self.pulse == 1)
            && !(self.pulse == 2 && self.reduced && pulse_ms > ARRIVAL_DELAY_MS + SHINE_MS);
        // Only the light would redraw, and it rests: a few frames a second until just before it moves.
        let resting = breathing && !moving && shine_rests_for(self.pulse, pulse_ms, self.reduced).is_some_and(|r| r > REST_WAKE_MS);
        self.rest_fps = if resting { REST_FPS } else { 0 };
        moving |= breathing;

        if self.shared != Some(format) {
            self.renderer.share(programs(device, queue, format));
            self.shared = Some(format);
        }
        let scale = if frame.scale > 2.5 { 3 } else { 2 };
        if self.images.as_ref().is_none_or(|(s, _)| *s != scale) {
            let images = atlas_images(device, queue, scale);
            self.renderer.set_images(&images);
            self.images = Some((scale, images));
        }
        let iso = self.images.as_ref().map(|(s, i)| (i.image(0), *s));
        let (pw, ph) = frame.pixels();
        let c = &mut self.canvas;
        c.begin(frame.scale);
        {
            draw_dots(c, &self.dots, light);
            for (i, tile) in self.tiles.iter().enumerate() {
                let i = i as i32;
                let active = i == self.active;
                let m = TileMotion {
                    shake: if active && shaking && !self.reduced { shake_at(shake_ms) } else { 0.0 },
                    flash: if active && shaking && self.reduced { flash_at(shake_ms) } else { 0.0 },
                    pressed: if active { self.pressed.value as f32 } else { 0.0 },
                    shine,
                    strength,
                    glow: i == self.shine,
                };
                draw_tile(c, tile, &m, light, self.reduced, iso);
            }
        }
        self.renderer.draw(device, queue, encoder, c, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        // Only while something moves.
        moving
    }
}

/// A new unit row surface, for the registry.
pub fn journey_unit() -> Box<dyn Surface> {
    Box::new(UnitSurface { shine: -1, press: -1, active: -1, shake: -1, pressed: Timing::at(0.0), ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tile_colours_are_rn_s() {
        // knowledge-base/journey-tab.md, the resolved table.
        let d = tile_paint(b'd', false);
        assert_eq!((d.top, d.top_light, d.left, d.right, d.glyph), (0xCBAA8E, 0xD1B49C, 0x9A816C, 0x766352, 0x4D4136));
        let c = tile_paint(b'c', false);
        assert_eq!((c.top, c.top_light, c.left, c.right, c.glyph), (0xD1B49C, 0xD7BDA8, 0x9F8977, 0x79685A, 0x4F443B));
        let l = tile_paint(b'l', false);
        assert_eq!((l.top, l.top_light, l.left, l.right, l.glyph), (0x282C30, 0x424549, 0x1E2124, 0x171A1C, 0x575A5E));
        let ll = tile_paint(b'l', true);
        assert_eq!((ll.top, ll.top_light, ll.left, ll.right, ll.glyph), (0xE0DBD8, 0xE4DFDD, 0xC1BCBA, 0xA6A2A0, 0xB8B4B1));
        let dl = tile_paint(b'd', true);
        assert_eq!((dl.left, dl.right), (0xAF927A, 0x967E69));
    }

    #[test]
    fn the_light_breathes_as_rn_s() {
        assert_eq!(shine_swell(0.0), 0.0);
        assert!((shine_swell(0.45) - 1.0).abs() < 1e-5);
        assert_eq!(shine_swell(1.0), 0.0);
        // The pulse: at rest through its delay, a round of 2000 ms, then held 1600.
        assert_eq!(shine_at(1, 100.0, false).0, 1.0);
        assert!((shine_at(1, 350.0 + 1000.0, false).0 - 0.5).abs() < 1e-4);
        assert_eq!(shine_at(1, 350.0 + 2500.0, false).0, 1.0);
        assert!(shine_at(1, 350.0 + 3600.0 + 10.0, false).0 < 0.01);
        assert_eq!(shine_at(1, 1000.0, true).0, 1.0);
        // The arrival: dark through 320 ms, a full-strength shine, then the pulse after the gap.
        assert_eq!(shine_at(2, 100.0, false), (0.0, 1.0));
        assert!((shine_at(2, 320.0 + 900.0, false).0 - 0.5).abs() < 1e-4);
        assert_eq!(shine_at(2, 320.0 + 1800.0 + 100.0, false), (1.0, PULSE_STRENGTH));
    }

    #[test]
    fn the_light_rests_where_rn_s_holds_it() {
        // The pulse's 350 ms delay, then its 1600 ms hold after each 2000 ms round.
        assert_eq!(shine_rests_for(1, 100.0, false), Some(250.0));
        assert_eq!(shine_rests_for(1, 350.0 + 1000.0, false), None);
        assert_eq!(shine_rests_for(1, 350.0 + 2600.0, false), Some(1000.0));
        // The arrival: dark through 320 ms, moving through its shine, then the gap and the pulse.
        assert_eq!(shine_rests_for(2, 20.0, false), Some(300.0));
        assert_eq!(shine_rests_for(2, 320.0 + 900.0, false), None);
        assert_eq!(shine_rests_for(2, 320.0 + 1800.0 + 100.0, false), Some(1500.0));
        // Wherever it rests, shine_at holds one value until it moves again.
        for mode in [1u8, 2] {
            let mut ms = 0.0;
            while ms < 12000.0 {
                if let Some(r) = shine_rests_for(mode, ms, false) {
                    let later = ms + (r - 1.0).max(0.0);
                    assert_eq!(shine_at(mode, ms, false), shine_at(mode, later, false), "mode {mode} at {ms}");
                }
                ms += 37.0;
            }
        }
    }

    #[test]
    fn the_shake_goes_left_right_left_home() {
        assert!((shake_at(50.0) + 6.0).abs() < 1e-4);
        assert!((shake_at(110.0) - 6.0).abs() < 1e-4);
        assert!((shake_at(170.0) + 4.0).abs() < 1e-4);
        assert_eq!(shake_at(220.0), 0.0);
        assert!((flash_at(70.0) - 1.0).abs() < 1e-4);
        assert_eq!(flash_at(220.0), 0.0);
    }

    #[test]
    fn rows_parse() {
        assert_eq!(
            parse_tiles("210,218,84,c,0;1.5,2,70,l,2"),
            vec![Tile { x: 210.0, y: 218.0, size: 84.0, state: b'c', glyph: 0 }, Tile { x: 1.5, y: 2.0, size: 70.0, state: b'l', glyph: 2 },]
        );
        assert_eq!(parse_dots("1,2,1;3,4,0").len(), 2);
        assert!(parse_tiles("").is_empty());
    }

    /// Every row of a device draws with one set of programs and one atlas texture (the first visit
    /// built them per row: 14 pipelines each); two devices, even under instances whose device ids
    /// match, never share them.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn rows_share_one_device_s_programs() {
        use exact_gpu::fixture;
        let _one = crate::warm::per_device_test();
        let Some(a) = fixture::device_or_skip(fixture::device()) else { return };
        let Some(b) = fixture::device_or_skip(fixture::device()) else { return };
        let f = wgpu::TextureFormat::Bgra8Unorm;
        assert!(Arc::ptr_eq(&programs(&a.device, &a.queue, f), &programs(&a.device, &a.queue, f)));
        assert!(Arc::ptr_eq(&atlas_images(&a.device, &a.queue, 3), &atlas_images(&a.device, &a.queue, 3)));
        assert!(!Arc::ptr_eq(&programs(&a.device, &a.queue, f), &programs(&b.device, &b.queue, f)));
        assert_eq!(programs(&b.device, &b.queue, f).format(), f);
    }

    /// A row of the first unit as a new player sees it (api/journey-road.ts's tiles), dark: the
    /// current tile's face where it stands, the trail's dots, transparent past the tiles.
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn a_row_draws_its_tiles() {
        use exact_gpu::fixture;
        let _one = crate::warm::per_device_test();
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        let s_ = |t: &str| Value::str(t);
        let n = |v: f64| Value::Number(v);
        let mut s = journey_unit();
        let tiles = "210,218,84,c,0;141.5,310,70,l,2;141.5,400,70,l,2;278.5,490,70,l,2;278.5,580,70,l,2;210,670,84,l,4";
        s.bind(&[s_(tiles), s_("200,260,0;190,270,0"), n(0.0), n(0.0), n(0.0), n(-1.0), n(-1.0), n(0.0), n(0.0), n(0.0), n(0.0)], None).unwrap();
        let frame = Frame {
            width: 420.0,
            height: 800.0,
            scale: 3.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let (px, more) = fixture::render(&gpu, s.as_mut(), &frame).unwrap();
        assert!(!more, "a row at rest asks for no more frames");
        if let Some(out) = std::env::var_os("EXACT_GPU_OUT") {
            std::fs::create_dir_all(&out).unwrap();
            std::fs::write(std::path::Path::new(&out).join(format!("journey-row-{}x{}.rgba", px.width, px.height)), &px.data).unwrap();
        }
        // The current tile's top face just under its middle: topLight→top, #D1B49C..#D7BDA8.
        let face = px.at(210 * 3, (218.0 * 3.0 - 30.0) as u32);
        assert!(face[3] > 250 && (200..=220).contains(&face[0]), "face {face:?}");
        assert!(px.at(5, 5)[3] == 0, "transparent off the tiles");
    }

    /// The analytic polygon blur against a brute-force Gaussian of the contact rhombus, read back
    /// from the GPU: within 3/255 at full alpha (home-tabs-architecture.md §4 measured 1.8 on the CPU).
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn the_polygon_shadow_is_a_gaussian() {
        use exact_gpu::fixture;
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
        struct One {
            r: Renderer,
            c: Canvas,
        }
        impl Surface for One {
            fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
                Ok(())
            }
            fn render(
                &mut self,
                f: &Frame,
                d: &wgpu::Device,
                q: &wgpu::Queue,
                e: &mut wgpu::CommandEncoder,
                t: &wgpu::TextureView,
                fmt: wgpu::TextureFormat,
            ) -> bool {
                self.c.begin(f.scale);
                let (hw, hh) = (43.4f32, 43.4 * tan30());
                self.c.draw_polygon_shadow(
                    &[point(60.0, 60.0 - hh), point(60.0 + hw, 60.0), point(60.0, 60.0 + hh), point(60.0 - hw, 60.0)],
                    4.675,
                    Color::BLACK,
                );
                let (w, h) = f.pixels();
                self.r.draw(d, q, e, &self.c, t, fmt, w, h, wgpu::Color::WHITE);
                false
            }
        }
        let frame = Frame {
            width: 120.0,
            height: 120.0,
            scale: 1.0,
            now_ms: 0.0,
            children_generation: 0,
            seekable: true,
            period_ms: 0.0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = One { r: Renderer::default(), c: Canvas::default() };
        let (px, _) = fixture::render(&gpu, &mut s, &frame).unwrap();
        let (hw, hh, sigma) = (43.4f64, 43.4 * (std::f64::consts::PI / 6.0).tan(), 4.675f64);
        let inside = |x: f64, y: f64| (x - 60.0).abs() / hw + (y - 60.0).abs() / hh <= 1.0;
        let mut worst = 0.0f64;
        for &(x, y) in &[(60.0, 60.0), (60.0 + hw, 60.0), (60.0, 60.0 - hh), (60.0 + hw / 2.0, 60.0 - hh / 2.0), (60.0 + hw + 6.0, 60.0), (30.0, 70.0)] {
            // Brute force over a 0.25 pt grid of ±4σ.
            let (mut sum, mut wsum) = (0.0, 0.0);
            let step = 0.25;
            let r = 4.0 * sigma;
            let mut v = -r;
            while v <= r {
                let mut u = -r;
                while u <= r {
                    let g = (-(u * u + v * v) / (2.0 * sigma * sigma)).exp();
                    wsum += g;
                    if inside(x.floor() + 0.5 + u, y.floor() + 0.5 + v) {
                        sum += g;
                    }
                    u += step;
                }
                v += step;
            }
            let expect = 255.0 * (1.0 - sum / wsum);
            let got = px.at(x as u32, y as u32)[0] as f64;
            worst = worst.max((got - expect).abs());
        }
        assert!(worst <= 3.0, "worst {worst}/255");
    }
}
