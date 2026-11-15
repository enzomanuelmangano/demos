//! Family Number Input's number (src/animations/family-number-input/components/animated-number):
//! the value as `toLocaleString('en-US')`, one glyph per digit and comma (SF-Pro-Rounded-Bold
//! 90, white, marginHorizontal 2), centred where RN centres its row, scaled by
//! max(1.05 − 0.05 × characters, 0.45).
//!
//! Drawn here, not in Contract: on the phone every keypress was a Contract commit starting a
//! dozen keyed transitions, and the iOS host skipped their first frames. The keypad stays in
//! Contract and hands this surface the digits as one string; the surface diffs it into glyph
//! identities on its own clock, so a tap costs one input bind and no commit-started motion.
//!
//! Motion (Emil Kowalski / Jakub Krehel, beyond RN's FadeInDown / LinearTransition):
//! - a digit or comma enters from 24 pt below, at 0.9 scale and transparent, over 380 ms on a
//!   strong ease-out (cubic-bezier(0.23, 1, 0.32, 1)); it leaves faster and subtler: 200 ms,
//!   12 pt down, to 0.92, fading, on the same curve;
//! - each glyph's place, the row's width (its centring) and the row's scale follow one
//!   critically damped spring, ω = 2π / 0.45 s (Motion's { duration 0.45, bounce 0 }): a
//!   retarget keeps position and velocity, so fast typing never restarts from rest;
//! - identities: digits keep theirs while the digits before them are unchanged (typing
//!   appends, backspace pops; 0 → 5 replaces); comma k keeps its identity while there are more
//!   than k commas, so commas slide as RN's ordinal-keyed commas do.
//!
//! Inputs: `digits` (a string of 0-9, "0" for zero). Glyphs are their outlines (the digits
//! subset of the bundled face; the comma's outline from the full face, below), filled through
//! the canvas transform: crisp at any scale, nothing re-rasterised per frame.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

use skia::{point as lpoint, Canvas, Color, Font, Paint, Path, Renderer};

/// assets/fonts/SF-Pro-Rounded-Bold.otf cut to the digits (snake's subset: same outlines and
/// advances).
static SF_ROUNDED_BOLD: &[u8] = include_bytes!("../fonts/sf-pro-rounded-bold-digits.otf");
/// styles.character: fontSize 90, marginHorizontal 2.
const SIZE: f32 = 90.0;
const MARGIN: f32 = 2.0;
/// The Text's line (hhea (1950 + 494) / 2048 × 90 = 107.40, ceiled to the pixel by RN) and its
/// baseline below the line's top (1950 / 2048 × 90).
const LINE: f32 = 107.666_67;
const ASCENT: f32 = 85.693_36;
/// The number's box: number-input.tsx's fillCenter padded 50 at its top; the row centred below.
const PAD_TOP: f32 = 50.0;
/// ',' in SF-Pro-Rounded-Bold: advance 569 of 2048 units, outline (y up) from CoreText.
const COMMA_ADVANCE: f32 = 569.0;
const COMMA: &[(char, [f32; 6])] = &[
    ('M', [289.0, 267.0, 0.0, 0.0, 0.0, 0.0]),
    ('C', [213.0, 267.0, 164.0, 230.0, 154.0, 146.0]),
    ('L', [103.0, -219.0, 0.0, 0.0, 0.0, 0.0]),
    ('C', [102.0, -222.0, 101.0, -227.0, 101.0, -235.0]),
    ('C', [98.0, -297.0, 137.0, -343.0, 207.0, -343.0]),
    ('C', [276.0, -343.0, 311.0, -312.0, 326.0, -245.0]),
    ('L', [407.0, 92.0, 0.0, 0.0, 0.0, 0.0]),
    ('C', [412.0, 113.0, 414.0, 132.0, 414.0, 151.0]),
    ('C', [414.0, 223.0, 365.0, 267.0, 289.0, 267.0]),
];
const UNITS: f32 = 2048.0;
/// Gaps' ids, apart from the characters' (which the agent and the tests read).
const GAP_IDS: u64 = 1 << 62;

/// Enter and exit.
const ENTER_MS: f64 = 380.0;
const EXIT_MS: f64 = 200.0;
const ENTER_Y: f32 = 24.0;
const ENTER_SCALE: f32 = 0.9;
const EXIT_Y: f32 = 12.0;
const EXIT_SCALE: f32 = 0.92;
/// Motion's spring { duration 0.45, bounce 0 }: critically damped, ω = 2π / 0.45.
const OMEGA: f64 = std::f64::consts::TAU / 0.45;
/// The longest step a frame integrates (a stalled frame does not teleport).
const MAX_DT: f64 = 1.0 / 30.0;

/// cubic-bezier(0.23, 1, 0.32, 1): Emil's strong ease-out.
fn ease_out(t: f64) -> f64 {
    bezier(0.23, 1.0, 0.32, 1.0, t.clamp(0.0, 1.0))
}

fn bezier(x1: f64, y1: f64, x2: f64, y2: f64, x: f64) -> f64 {
    let curve = |a: f64, b: f64, t: f64| {
        3.0 * a * t * (1.0 - t) * (1.0 - t) + 3.0 * b * t * t * (1.0 - t) + t * t * t
    };
    let slope = |a: f64, b: f64, t: f64| {
        3.0 * a * (1.0 - t) * (1.0 - t) + 6.0 * (b - a) * t * (1.0 - t) + 3.0 * (1.0 - b) * t * t
    };
    let mut t = x;
    for _ in 0..8 {
        let d = slope(x1, x2, t);
        if d.abs() < 1e-6 {
            break;
        }
        t -= (curve(x1, x2, t) - x) / d;
        t = t.clamp(0.0, 1.0);
    }
    // Bisection to finish where Newton stalls.
    let (mut lo, mut hi) = (0.0, 1.0);
    if (curve(x1, x2, t) - x).abs() > 1e-7 {
        for _ in 0..40 {
            t = (lo + hi) / 2.0;
            if curve(x1, x2, t) < x {
                lo = t
            } else {
                hi = t
            }
        }
    }
    curve(y1, y2, t)
}

/// A critically damped spring, integrated in closed form: retargeting keeps x and v.
#[derive(Clone, Copy, Debug)]
struct Spring {
    x: f64,
    v: f64,
    to: f64,
}

impl Spring {
    fn at(x: f64) -> Spring {
        Spring { x, v: 0.0, to: x }
    }
    fn moving(&self) -> bool {
        self.x != self.to || self.v != 0.0
    }
    fn step(&mut self, dt: f64) {
        if !self.moving() {
            return;
        }
        let d = self.x - self.to;
        let e = (-OMEGA * dt).exp();
        let k = self.v + OMEGA * d;
        self.x = self.to + (d + k * dt) * e;
        self.v = (self.v - OMEGA * k * dt) * e;
        if (self.x - self.to).abs() < 1e-3 && self.v.abs() < 1e-2 {
            self.x = self.to;
            self.v = 0.0;
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    Digit(u8),
    Comma,
    /// Where a comma stood before it moved (a digit typed or deleted regroups the number): a
    /// slot closing behind it, drawn as nothing.
    Gap,
}

#[derive(Debug)]
struct Glyph {
    id: u64,
    kind: Kind,
    /// Its slot's width (its Text's cell). Places are the running sum of the slots. A digit's
    /// slot is its cell at once (typing appends: nothing before it moves, as in RN); a comma's
    /// opens from 0 as it enters and closes as it leaves, so it pushes the digits after it
    /// aside and pulls them back. A leaving digit keeps its place but takes no room.
    w: Spring,
    /// When it entered and (once leaving) when it began to leave, ms.
    born: f64,
    left: Option<f64>,
    /// The glyph it stood after in the row, kept for when it leaves.
    prev: Option<u64>,
    /// A comma: the digit it follows, and how far it is drawn from its slot (a spring to 0: a
    /// comma that moves slides from where it was drawn, as RN's ordinal-keyed comma slides).
    after: Option<u64>,
    slide: Spring,
    /// A comma that moved: shown whole while its new slot opens (an entering comma shows as
    /// much as its slot is open).
    moved: bool,
}

/// The number's state: the glyphs in visual order (leaving ones where they were) and the
/// row's scale.
struct Model {
    digits: String,
    glyphs: Vec<Glyph>,
    /// The live digits' and commas' glyph ids, in order.
    digit_ids: Vec<u64>,
    comma_ids: Vec<u64>,
    next: u64,
    gaps: u64,
    /// The live row's width (the centring) and scale.
    width: Spring,
    scale: Spring,
    /// The device scale RN rounds Text widths to.
    px: f32,
    advances: [f32; 10],
}

fn comma_count(n: usize) -> usize {
    (n.max(1) - 1) / 3
}
fn first_group(n: usize) -> usize {
    (n.max(1) - 1) % 3 + 1
}
/// A comma after digit j of n.
fn comma_after(j: usize, n: usize) -> bool {
    j + 1 < n && j + 1 >= first_group(n) && (j + 1 - first_group(n)) % 3 == 0
}

impl Model {
    fn new(advances: [f32; 10], px: f32) -> Model {
        let mut m = Model {
            digits: String::new(),
            glyphs: Vec::new(),
            digit_ids: Vec::new(),
            comma_ids: Vec::new(),
            next: 0,
            gaps: 0,
            width: Spring::at(0.0),
            scale: Spring::at(1.0),
            px,
            advances,
        };
        m.set("0", 0.0, false);
        m
    }

    fn advance(&self, k: Kind) -> f32 {
        match k {
            Kind::Digit(d) => self.advances[d as usize],
            Kind::Comma => COMMA_ADVANCE / UNITS * SIZE,
            Kind::Gap => 0.0,
        }
    }

    /// A Text's width as Yoga lays it out: the advance ceiled to the device pixel, + margins.
    fn cell(&self, k: Kind) -> f32 {
        (self.advance(k) * self.px).ceil() / self.px + 2.0 * MARGIN
    }

    /// The live characters in order: (glyph id, kind).
    fn chars(&self) -> Vec<(u64, Kind)> {
        let ds: Vec<u8> = self.digits.bytes().map(|b| b - b'0').collect();
        let n = ds.len();
        let mut out = Vec::new();
        let mut k = 0;
        for (j, d) in ds.iter().enumerate() {
            out.push((self.digit_ids[j], Kind::Digit(*d)));
            if comma_after(j, n) {
                out.push((self.comma_ids[k], Kind::Comma));
                k += 1;
            }
        }
        out
    }

    /// The row's width now (its centring spring).
    fn width(&self) -> f64 {
        self.width.x
    }

    /// Whether a glyph takes room in the row: not a leaving digit.
    fn takes_room(g: &Glyph) -> bool {
        !matches!(g.kind, Kind::Digit(_)) || g.left.is_none()
    }

    /// Each glyph's drawn centre x from the row's left (its slide included) and its opacity
    /// factor from its slot.
    fn layout(&self) -> Vec<(f32, f32)> {
        let mut x = 0.0f32;
        let mut out = Vec::with_capacity(self.glyphs.len());
        for g in &self.glyphs {
            let slot = g.w.x as f32;
            let adv = self.advance(g.kind);
            // A digit's pen is its slot's left + the margin, where RN's Text draws it. A comma
            // stands in the middle of its slot; entering or leaving, it shows as much as its
            // slot is open, so it never shows over the digit it is pushing.
            let at = match g.kind {
                Kind::Digit(_) => (x + MARGIN + adv / 2.0, 1.0),
                Kind::Comma => {
                    let open = if g.moved && g.left.is_none() {
                        1.0
                    } else {
                        (slot / self.cell(g.kind)).clamp(0.0, 1.0)
                    };
                    (x + slot / 2.0 + g.slide.x as f32, open)
                }
                Kind::Gap => (x, 0.0),
            };
            out.push(at);
            if Model::takes_room(g) {
                x += slot;
            }
        }
        out
    }

    /// The new digits: kept, leaving and entering glyphs, every slot retargeted, the row's
    /// scale retargeted. `animate` false places everything at once (the first value).
    fn set(&mut self, digits: &str, now: f64, animate: bool) {
        let digits: String = digits.chars().filter(|c| c.is_ascii_digit()).collect();
        let digits = if digits.is_empty() {
            "0".to_string()
        } else {
            digits
        };
        if digits == self.digits && !self.glyphs.is_empty() {
            return;
        }
        let old: Vec<u8> = self.digits.bytes().collect();
        let new: Vec<u8> = digits.bytes().collect();
        let keep = old
            .iter()
            .zip(new.iter())
            .take_while(|(a, b)| a == b)
            .count();
        let mut leaving: Vec<u64> = self.digit_ids.drain(keep..).collect();
        for _ in keep..new.len() {
            self.digit_ids.push(self.next);
            self.next += 1;
        }
        let commas = comma_count(new.len());
        if self.comma_ids.len() > commas {
            leaving.extend(self.comma_ids.drain(commas..));
        }
        while self.comma_ids.len() < commas {
            self.comma_ids.push(self.next);
            self.next += 1;
        }
        self.digits = digits;
        // Where each comma is drawn now, to slide one that moves from there.
        let drawn: Vec<(u64, f64)> = self
            .glyphs
            .iter()
            .zip(self.layout())
            .map(|(g, (x, _))| (g.id, x as f64))
            .collect();
        for g in &mut self.glyphs {
            if leaving.contains(&g.id) && g.left.is_none() {
                g.left = Some(now);
                if g.kind == Kind::Comma {
                    g.w.to = 0.0;
                }
            }
        }
        // The new order: the live characters, each leaving glyph kept right after the glyph
        // that stood before it (so a leaving comma closes its gap where it was).
        let chars = self.chars();
        let mut old_glyphs: Vec<Glyph> = std::mem::take(&mut self.glyphs);
        let mut order: Vec<Glyph> = Vec::with_capacity(old_glyphs.len() + 2);
        let mut moved: Vec<u64> = Vec::new();
        let mut last_digit: Option<u64> = None;
        for (id, kind) in &chars {
            let cell = self.cell(*kind) as f64;
            match old_glyphs.iter().position(|g| g.id == *id) {
                Some(i) => {
                    let mut g = old_glyphs.remove(i);
                    g.w.to = cell;
                    if g.kind == Kind::Comma && g.after != last_digit && animate {
                        // Regrouped: a gap closes where it stood, its slot opens here, and the
                        // comma slides across (set below, once the new places are known).
                        old_glyphs.push(Glyph {
                            id: GAP_IDS + self.gaps,
                            kind: Kind::Gap,
                            w: g.w,
                            born: f64::NEG_INFINITY,
                            left: Some(now),
                            prev: g.prev,
                            after: None,
                            slide: Spring::at(0.0),
                            moved: false,
                        });
                        self.gaps += 1;
                        if let Some(gap) = old_glyphs.last_mut() {
                            gap.w.to = 0.0;
                        }
                        g.w = Spring {
                            x: 0.0,
                            v: 0.0,
                            to: cell,
                        };
                        g.moved = true;
                        moved.push(g.id);
                    }
                    g.after = last_digit;
                    order.push(g);
                }
                None => order.push(Glyph {
                    id: *id,
                    kind: *kind,
                    w: if animate && *kind == Kind::Comma {
                        Spring {
                            x: 0.0,
                            v: 0.0,
                            to: cell,
                        }
                    } else {
                        Spring::at(cell)
                    },
                    born: if animate { now } else { f64::NEG_INFINITY },
                    left: None,
                    prev: None,
                    after: last_digit,
                    slide: Spring::at(0.0),
                    moved: false,
                }),
            }
            if matches!(kind, Kind::Digit(_)) {
                last_digit = Some(*id);
            }
        }
        // `old_glyphs` now holds the leaving ones, in their old order; `prev` names the id
        // each stood after in the previous frame's order.
        for g in old_glyphs {
            let at = g
                .prev
                .and_then(|p| order.iter().position(|o| o.id == p))
                .map_or(0, |i| i + 1);
            order.insert(at.min(order.len()), g);
        }
        for i in 0..order.len() {
            let before = if i == 0 { None } else { Some(order[i - 1].id) };
            order[i].prev = before;
        }
        self.glyphs = order;
        if !moved.is_empty() {
            let now_at: Vec<f64> = self.layout().iter().map(|(x, _)| *x as f64).collect();
            for (i, g) in self.glyphs.iter_mut().enumerate() {
                if moved.contains(&g.id) {
                    let was = drawn
                        .iter()
                        .find(|(id, _)| *id == g.id)
                        .map_or(now_at[i], |(_, x)| *x);
                    // From where it is drawn, keeping the slide's speed.
                    g.slide.x += was - now_at[i];
                    g.slide.to = 0.0;
                }
            }
        }
        self.width.to = chars.iter().map(|(_, k)| self.cell(*k) as f64).sum();
        self.scale.to = (1.05 - 0.05 * chars.len() as f64).max(0.45);
        if !animate {
            self.scale = Spring::at(self.scale.to);
            self.width = Spring::at(self.width.to);
            self.glyphs.retain(|g| g.left.is_none());
            for g in &mut self.glyphs {
                g.w = Spring::at(g.w.to);
                g.slide = Spring::at(0.0);
            }
        }
    }

    /// Advances the springs by `dt` seconds and drops glyphs whose exit ended; true while
    /// anything moves.
    fn step(&mut self, now: f64, dt: f64) -> bool {
        let dt = dt.clamp(0.0, MAX_DT);
        self.scale.step(dt);
        self.width.step(dt);
        let mut moving = self.scale.moving() || self.width.moving();
        self.glyphs.retain(|g| {
            g.left.is_none_or(|t| {
                (g.kind != Kind::Gap && now - t < EXIT_MS)
                    || (!matches!(g.kind, Kind::Digit(_)) && g.w.x > 0.01)
            })
        });
        for g in &mut self.glyphs {
            g.w.step(dt);
            g.slide.step(dt);
            moving |=
                g.w.moving() || g.slide.moving() || g.left.is_some() || now - g.born < ENTER_MS;
        }
        moving
    }
}

/// One glyph's look at `now`: y offset, scale and opacity.
fn look(g: &Glyph, now: f64) -> (f32, f32, f32) {
    if let Some(t) = g.left {
        let q = ease_out((now - t) / EXIT_MS) as f32;
        return (EXIT_Y * q, 1.0 - (1.0 - EXIT_SCALE) * q, 1.0 - q);
    }
    let p = if g.born.is_finite() {
        ease_out((now - g.born) / ENTER_MS) as f32
    } else {
        1.0
    };
    (
        ENTER_Y * (1.0 - p),
        ENTER_SCALE + (1.0 - ENTER_SCALE) * p,
        p,
    )
}

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(FamilyNumber::default())
}

#[derive(Default)]
struct FamilyNumber {
    /// The digits last bound, applied at the next frame (on the frame clock).
    pending: Option<String>,
    model: Option<Model>,
    last: Option<f64>,
    font: Option<Font>,
    paths: Vec<Path>,
    comma: Option<Path>,
    canvas: Canvas,
    renderer: Renderer,
}

impl FamilyNumber {
    fn prepare(&mut self, scale: f32) {
        if self.font.is_none() {
            self.font = Font::new(SF_ROUNDED_BOLD, SIZE).map(Font::with_ui_layout);
            if let Some(f) = self.font.as_ref() {
                self.paths = (0..10)
                    .map(|d| f.text_path(&d.to_string(), 0.0, 0.0))
                    .collect();
            }
            let u = SIZE / UNITS;
            let mut b = Path::builder();
            let p = |x: f32, y: f32| lpoint(x * u, -y * u);
            for (op, a) in COMMA {
                match op {
                    'M' => {
                        b.begin(p(a[0], a[1]));
                    }
                    'L' => {
                        b.line_to(p(a[0], a[1]));
                    }
                    _ => {
                        b.cubic_bezier_to(p(a[0], a[1]), p(a[2], a[3]), p(a[4], a[5]));
                    }
                }
            }
            b.end(true);
            self.comma = Some(b.build());
        }
        if self.model.as_ref().is_none_or(|m| m.px != scale) {
            let mut adv = [0.0f32; 10];
            if let Some(f) = self.font.as_ref() {
                for (d, a) in adv.iter_mut().enumerate() {
                    *a = f.advance_width(&d.to_string());
                }
            }
            let digits = self.model.as_ref().map(|m| m.digits.clone());
            let mut m = Model::new(adv, scale);
            if let Some(d) = digits {
                m.set(&d, 0.0, false);
            }
            self.model = Some(m);
        }
    }
}

impl Surface for FamilyNumber {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let digits = inputs
            .first()
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .to_string();
        self.pending = Some(digits);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let m = self.model.as_ref()?;
        let ids: Vec<String> = m
            .chars()
            .iter()
            .map(|(id, k)| format!("\"{}{}\"", if *k == Kind::Comma { "c" } else { "d" }, id))
            .collect();
        Some(format!(
            "{{\"digits\":\"{}\",\"glyphs\":[{}],\"drawn\":{}}}",
            m.digits,
            ids.join(","),
            m.glyphs.len()
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
        let now = frame.now_ms;
        let first = self.model.is_none();
        self.prepare(frame.scale);
        let dt = self.last.map_or(0.0, |t| (now - t) / 1000.0);
        self.last = Some(now);
        let model = self.model.as_mut().unwrap();
        // Springs first to this frame, then the new value retargets from where they are.
        let mut moving = model.step(now, dt);
        if let Some(d) = self.pending.take() {
            model.set(&d, now, !first);
            moving = true;
        }
        let model = self.model.as_ref().unwrap();
        let (w, h) = (frame.width, frame.height);
        let (cx, cy) = (w / 2.0, PAD_TOP + (h - PAD_TOP) / 2.0);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        let white = Paint::fill(Color::WHITE);
        let row_scale = model.scale.x as f32;
        let left = -(model.width() as f32) / 2.0;
        let baseline = -LINE / 2.0 + ASCENT;
        // Glyphs scale about their outline's middle: digits' ink spans about 0.7 em up.
        let mid_y = -0.36 * SIZE;
        let mut draws = Vec::with_capacity(model.glyphs.len());
        for (g, (centre, open)) in model.glyphs.iter().zip(model.layout()) {
            let (dy, s, o) = look(g, now);
            let o = o * open;
            if o > 0.0 && g.kind != Kind::Gap {
                draws.push((g.kind, centre, dy, s, o, model.advance(g.kind)));
            }
        }
        for (kind, x, dy, s, o, adv) in draws {
            let Some(path) = (match kind {
                Kind::Digit(d) => self.paths.get(d as usize),
                Kind::Comma => self.comma.as_ref(),
                Kind::Gap => None,
            }) else {
                continue;
            };
            c.save();
            c.translate(cx, cy);
            c.scale(row_scale, row_scale);
            c.translate(left + x, baseline + dy + mid_y);
            c.scale(s, s);
            c.translate(-adv / 2.0, -mid_y);
            c.opacity(o);
            c.draw_path(path, &white);
            c.restore();
        }
        let (pw, ph) = frame.pixels();
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
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    fn model() -> Model {
        let adv = [
            59.018, 43.198, 54.272, 56.689, 58.271, 56.25, 57.876, 51.504, 58.711, 58.052,
        ];
        Model::new(adv, 3.0)
    }
    fn keys(m: &Model) -> Vec<String> {
        m.chars()
            .iter()
            .map(|(id, k)| format!("{}{}", if *k == Kind::Comma { "c" } else { "d" }, id))
            .collect()
    }

    #[test]
    fn identities_follow_typing_and_deleting() {
        let mut m = model();
        assert_eq!(keys(&m), ["d0"]);
        m.set("1", 0.0, true);
        assert_eq!(keys(&m), ["d1"], "0 is replaced");
        m.set("12", 10.0, true);
        m.set("123", 20.0, true);
        m.set("1234", 30.0, true);
        assert_eq!(keys(&m), ["d1", "c5", "d2", "d3", "d4"]);
        m.set("12345", 40.0, true);
        assert_eq!(
            keys(&m),
            ["d1", "d2", "c5", "d3", "d4", "d6"],
            "the comma keeps its identity and slides"
        );
        m.set("1234", 50.0, true);
        assert_eq!(keys(&m), ["d1", "c5", "d2", "d3", "d4"]);
        m.set("123", 60.0, true);
        assert_eq!(keys(&m), ["d1", "d2", "d3"]);
        m.set("1239", 70.0, true);
        assert_eq!(
            keys(&m),
            ["d1", "c8", "d2", "d3", "d7"],
            "a retyped digit and comma are new"
        );
        // Leaving glyphs stay drawn until their exit ends.
        assert!(m.glyphs.iter().any(|g| g.id == 4 && g.left.is_some()));
        m.step(70.0 + EXIT_MS + 1.0, 0.016);
        assert!(!m.glyphs.iter().any(|g| g.id == 4));
        m.set("0", 400.0, true);
        assert_eq!(keys(&m), ["d9"]);
    }

    #[test]
    fn spring_keeps_velocity_on_retarget_and_settles() {
        let mut s = Spring::at(0.0);
        s.to = 100.0;
        for _ in 0..6 {
            s.step(1.0 / 120.0);
        }
        let (x, v) = (s.x, s.v);
        assert!(v > 0.0);
        s.to = 200.0;
        assert_eq!((s.x, s.v), (x, v), "a retarget moves nothing by itself");
        let mut t: f64 = 0.0;
        while s.moving() && t < 3.0 {
            s.step(1.0 / 120.0);
            t += 1.0 / 120.0;
            assert!(s.x <= 200.0 + 1e-6, "critically damped: no overshoot");
        }
        assert_eq!(s.x, 200.0);
        assert!(t < 1.2, "settles in {t}");
    }

    #[test]
    fn row_centres_and_scales_like_rn() {
        let mut m = model();
        m.set("1234", 0.0, false);
        // 1,234: four digits and a comma, scale 1.05 − 0.25.
        assert!((m.scale.to - 0.8).abs() < 1e-9);
        let w: f32 = [1usize, 2, 3, 4]
            .iter()
            .map(|d| m.cell(Kind::Digit(*d as u8)))
            .sum::<f32>()
            + m.cell(Kind::Comma);
        assert!((m.glyphs.iter().map(|g| g.w.to).sum::<f64>() as f32 - w).abs() < 1e-4);
        assert!((m.width() as f32 - w).abs() < 1e-4, "placed at once");
        assert!((ease_out(0.5) - 0.94).abs() < 0.05);
    }

    #[test]
    fn renders_typing_and_deleting() {
        use exact_gpu::fixture;
        let Some(gpu) = fixture::device_or_skip(fixture::device()) else {
            return;
        };
        let frame = |now_ms: f64| Frame {
            width: 393.0,
            height: 380.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::str("0")], None).unwrap();
        let mut t: f64 = 0.0;
        let shoot = |s: &mut Box<dyn Surface>, t: f64, name: &str| {
            let (img, moving) = fixture::render(&gpu, s.as_mut(), &frame(t)).unwrap();
            save(&img, name);
            moving
        };
        shoot(&mut s, t, "00-rest");
        let mut value = String::new();
        // Type 1 2 3 4 5 6 7, 90 ms apart (a fast typist), rendering every 1/120 s.
        let mut n = 0;
        for d in ["1", "2", "3", "4", "5", "6", "7"] {
            value.push_str(d);
            s.bind(&[Value::str(&value)], None).unwrap();
            for _ in 0..11 {
                t += 1000.0 / 120.0;
                n += 1;
                let moving = shoot(&mut s, t, &format!("type-{n:03}"));
                assert!(moving);
            }
        }
        // Settle.
        let mut settled = false;
        for _ in 0..240 {
            t += 1000.0 / 120.0;
            if !shoot(&mut s, t, "settled") {
                settled = true;
                break;
            }
        }
        assert!(settled, "comes to rest");
        // Delete three, 70 ms apart (the hold's pace), then retype during the exit.
        for k in 0..3 {
            value.pop();
            s.bind(&[Value::str(&value)], None).unwrap();
            for i in 0..8 {
                t += 1000.0 / 120.0;
                shoot(&mut s, t, &format!("del-{k}-{i}"));
            }
        }
        value.push('9');
        s.bind(&[Value::str(&value)], None).unwrap();
        for i in 0..60 {
            t += 1000.0 / 120.0;
            shoot(&mut s, t, &format!("retype-{i:02}"));
        }
        let state = s.agent("").unwrap();
        assert!(state.contains("\"digits\":\"12349\""), "{state}");
    }

    fn save(img: &exact_gpu::fixture::Pixels, name: &str) {
        let Some(dir) = std::env::var_os("EXACT_GPU_OUT") else {
            return;
        };
        let mut out = format!("P6\n{} {}\n255\n", img.width, img.height).into_bytes();
        for p in img.data.chunks(4) {
            for k in 0..3 {
                out.push(p[k]);
            }
        }
        let _ = std::fs::write(std::path::Path::new(&dir).join(format!("{name}.ppm")), out);
    }
}
