//! A drawing canvas: draw a stroke, lift the finger, and its Fourier epicycles retrace it.
//!
//! - On lift, the stroke is sampled along its length and its FFT is turned into epicycles, largest
//!   first. The FFT and the contour measuring are line-for-line ports of the JS, so the epicycles
//!   match the reference exactly.
//! - The chain of epicycles, their circles and the traced path animate over 20 s; the drawn stroke
//!   fades out as they start.
//! - A round button clears the canvas and appears only while drawing. It sits above the canvas, so
//!   a touch on it does not reach the stroke, unless the button is transparent there (alpha under
//!   0.01), when the touch falls through.
//! - Haptics: a light impact as a stroke starts; a selection tick every 12 points of it (at most one
//!   per 50 ms); a medium impact as the drawn shape becomes epicycles; a soft one as the chain
//!   completes its loop; and a selection on a press of the button.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture, Phase};
use pressto::{PressEvent, Pressable};
use reanimated::{Easing, Spring, Timing, GENTLE};
use skia::{point, Canvas, Color, Font, Paint, Point, Renderer, ScratchBuilder};

use crate::{gfx, shaders};
use shaders::fourier_visualizer::{entry, module, Uniforms, BUTTON as BUTTON_TEXTURE, GROUP_0, U};

/// Shortest stroke, pt, that draws epicycles.
const MIN_STROKE_LENGTH: f64 = 8.0;
/// The time's end value: 2π − 0.05, over 20 s.
const TIME_END: f64 = 2.0 * std::f64::consts::PI - 0.05;
/// Loop duration, ms.
const TIME_MS: f64 = 20000.0 / 1.8;
/// Fade duration between shapes, ms.
const FADE_MS: f64 = 180.0;
/// Haptic messages, posted through the host.
const START: &str = "haptic:impact-light";
const TICK: &str = "haptic:selection";
const COMMIT: &str = "haptic:impact-medium";
const LOOP: &str = "haptic:impact-soft";
const TICK_POINTS: usize = 12;
const TICK_MIN_MS: f64 = 50.0;
/// Canvas background.
const BACKGROUND: u32 = 0xD4D4D4;
/// Clear button: its inset from the right, its size, corner radius and colour.
const RIGHT: f32 = 30.0;
const SIDE: f32 = 64.0;
const RADIUS: f32 = 32.0;
const BUTTON_COLOR: u32 = 0x111111;
/// The button's bottom edge while drawing, pt.
const BOTTOM_DRAWING: f64 = 65.0;
/// Stroke widths: drawn stroke, chain, circles, trace.
const STROKE: f32 = 10.0;
const CHAIN: f32 = 2.5;
const CIRCLES: f32 = 0.8;
const TRACE: f32 = 5.0;
/// The clear icon's glyph and size, pt.
const CLEAR: &str = "\u{E14C}";
const ICON: f32 = 24.0;
static MATERIAL: &[u8] = include_bytes!("../fonts/materialicons-subset.ttf");
/// The button's layer: its pixels and this margin around them.
const LAYER_MARGIN: i32 = 2;
const LAYER_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
/// How far (device px) a circle's polygon may stray from the stroke's true edges.
const CIRCLE_TOLERANCE: f64 = 0.05;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(visualizer())
}

fn visualizer() -> FourierVisualizer {
    FourierVisualizer {
        size: (0.0, 0.0),
        px: 1.0,
        stroke: Vec::with_capacity(1024),
        stroke_opacity: Timing::at(1.0),
        pan: PanGesture::new(),
        epicycles: Vec::new(),
        time: Timing::at(0.0),
        opacity: Timing::at(1.0),
        dirty: false,
        chain: Vec::new(),
        circles: Vec::new(),
        trace: Vec::with_capacity(4096),
        drawing: false,
        button_opacity: Timing::at(0.0),
        bottom: Spring::at(0.0),
        press: Pressable::new(),
        posted: Vec::new(),
        last_tick: (0, 0.0),
        icon: Font::new(MATERIAL, ICON).map(Font::with_ui_layout),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        button: Canvas::default(),
        button_renderer: Renderer::default(),
        gpu: None,
    }
}

struct FourierVisualizer {
    size: (f32, f32),
    px: f32,
    /// The drawn path's points.
    stroke: Vec<Point>,
    /// The drawn Path's opacity.
    stroke_opacity: Timing,
    pan: PanGesture,
    /// Epicycles as [frequency, amplitude, phase], largest first.
    epicycles: Vec<f64>,
    time: Timing,
    /// The visualizer's three Paths' opacity.
    opacity: Timing,
    /// The reaction has a change to see (the time stepped or the epicycles changed).
    dirty: bool,
    /// chainPath's points, circlesPath's circles (x, y, r), resultPath's points.
    chain: Vec<Point>,
    circles: Vec<[f32; 3]>,
    trace: Vec<Point>,
    /// Whether a long-enough stroke is being shown.
    drawing: bool,
    button_opacity: Timing,
    bottom: Spring,
    /// pressto's progress.
    /// The button's press.
    press: Pressable,
    posted: Vec<String>,
    /// The stroke's length and the pointer's time at the last selection tick.
    last_tick: (usize, f64),
    icon: Option<Font>,
    canvas: Canvas,
    renderer: Renderer,
    /// The button's view, drawn into its own layer.
    button: Canvas,
    button_renderer: Renderer,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    /// The layer's side in device pixels.
    side: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: wgpu::Buffer,
    bind: wgpu::BindGroup,
    layer: wgpu::TextureView,
}

/// Rounds a layout edge to the nearest device pixel, halves up.
fn grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// Rounds a text's position down to the device pixel grid.
fn text_grid(v: f32, scale: f32) -> f32 {
    ((v * scale + 1e-4).floor()) / scale
}

/// Rounds a text's measured size up to the pixel grid.
fn text_side(v: f32, scale: f32) -> f32 {
    ((v + 0.001) * scale).ceil() / scale
}

/// The button's frame on the pixel grid, its icon's box origin, and its centre.
#[derive(Clone, Copy, Debug)]
struct ButtonLayout {
    l: f32,
    t: f32,
    r: f32,
    b: f32,
    icon: (f32, f32),
}

impl ButtonLayout {
    fn centre(&self) -> (f32, f32) {
        ((self.l + self.r) / 2.0, (self.t + self.b) / 2.0)
    }
}

impl FourierVisualizer {
    fn button_layout(&self) -> ButtonLayout {
        let (w, h) = self.size;
        let s = self.px;
        let left = w - RIGHT - SIDE;
        let top = h - self.bottom.value as f32 - SIDE;
        let (tw, th) = match self.icon.as_ref() {
            Some(font) => (text_side(font.advance_width(CLEAR), s), text_side(gfx::line_height(font), s)),
            None => (ICON, ICON),
        };
        ButtonLayout {
            l: grid(left, s),
            t: grid(top, s),
            r: grid(left + SIDE, s),
            b: grid(top + SIDE, s),
            // The icon's text is floored to the pixel grid, as text layout does.
            icon: (grid(left, s) + text_grid((SIDE - tw) / 2.0, s), grid(top, s) + text_grid((SIDE - th) / 2.0, s)),
        }
    }

    /// The button's scale (pressto: interpolate(progress, [0, 1], [1, 0.96])).
    fn button_scale(&self) -> f32 {
        self.press.scale() as f32
    }

    /// Whether (x, y) is inside the button's bounds, through its transform.
    fn in_button(&self, x: f32, y: f32) -> bool {
        let b = self.button_layout();
        let (cx, cy) = b.centre();
        let k = self.button_scale();
        ((x - cx) / k).abs() <= (b.r - b.l) / 2.0 && ((y - cy) / k).abs() <= (b.b - b.t) / 2.0
    }

    /// The button's hit test: UIKit skips a view below alpha 0.01.
    fn hits_button(&self, x: f32, y: f32) -> bool {
        self.button_opacity.value >= 0.01 && self.in_button(x, y)
    }

    /// Sets the drawing state; the button's animations start from where they are.
    fn set_drawing(&mut self, drawing: bool) {
        if self.drawing == drawing {
            return;
        }
        self.drawing = drawing;
        self.button_opacity.to(if drawing { 1.0 } else { 0.0 }, 300.0, Easing::timing_default());
        self.bottom.retarget(if drawing { BOTTOM_DRAWING } else { 0.0 }, GENTLE);
    }

    /// Clears the visualizer.
    fn clear(&mut self) {
        self.opacity.set(0.0);
        self.epicycles.clear();
        self.trace.clear();
        self.time.set(0.0);
        self.dirty = true;
    }

    /// Turns the drawn stroke into epicycles, on lift.
    fn finish_stroke(&mut self) {
        let points: Vec<Point> = self.stroke.iter().map(|p| point(svg_round_trip(p.x), svg_round_trip(p.y))).collect();
        let contour = Contour::measure(&points);
        if (contour.length as f64) < MIN_STROKE_LENGTH {
            self.set_drawing(false);
            self.clear();
            return;
        }
        self.set_drawing(true);
        self.draw(&contour);
        self.posted.push(COMMIT.into());
    }

    /// Starts the epicycle animation.
    fn draw(&mut self, contour: &Contour) {
        self.opacity.to(1.0, FADE_MS, Easing::timing_default());
        self.epicycles = epicycles(&fill_to_power_of_two(get_points(contour)));
        self.trace.clear();
        self.time.set(0.0);
        self.time.to(TIME_END, TIME_MS, Easing::Linear);
        self.dirty = true;
    }

    /// Recomputes the chain, circles and trace for the current time.
    fn react(&mut self) {
        self.chain.clear();
        self.circles.clear();
        let count = self.epicycles.len() / 3;
        if count == 0 {
            return;
        }
        let t = self.time.value;
        let (mut cx, mut cy) = (0.0f64, 0.0f64);
        for e in self.epicycles.chunks_exact(3) {
            let (frequency, amplitude, phase) = (e[0], e[1], e[2]);
            if !self.chain.is_empty() {
                self.circles.push([cx as f32, cy as f32, amplitude as f32]);
            }
            let x = cx + amplitude * (frequency * t + phase).cos();
            let y = cy + amplitude * (frequency * t + phase).sin();
            self.chain.push(point(x as f32, y as f32));
            cx = x;
            cy = y;
        }
        if cx != 0.0 || cy != 0.0 {
            self.trace.push(point(cx as f32, cy as f32));
        }
    }

    /// One frame of the animations at `now` (the worklets' frame callbacks); whether any moves.
    fn advance(&mut self, now: f64) -> bool {
        let mut moving = self.stroke_opacity.step(now);
        moving |= self.opacity.step(now);
        let timing = self.time.running;
        moving |= self.time.step(now);
        if timing {
            self.dirty = true;
            if !self.time.running {
                // At the end: fade the visualizer out and stop drawing.
                self.opacity.to(0.0, FADE_MS, Easing::timing_default());
                self.opacity.step(now);
                moving = true;
                self.posted.push(LOOP.into());
                self.set_drawing(false);
            }
        }
        if self.dirty {
            self.dirty = false;
            self.react();
        }
        moving |= self.button_opacity.step(now) | self.bottom.step(now) | self.press.step(now);
        moving || self.button_opacity.running || self.bottom.running
    }

    fn draw_canvas(&mut self) {
        let s = self.px;
        let (stroke_opacity, opacity) = (self.stroke_opacity.value as f32, self.opacity.value as f32);
        let Self { canvas: c, stroke, chain, circles, trace, .. } = self;
        c.begin(s);
        c.fill(Color::view_hex(BACKGROUND));
        if stroke_opacity > 0.0 {
            c.draw_with(&Paint::stroke(Color::BLACK, STROKE).with_opacity(stroke_opacity), |b| polyline(b, stroke));
        }
        if opacity > 0.0 {
            c.draw_with(&Paint::stroke(Color::BLACK.alpha(0.2), CHAIN).with_opacity(opacity), |b| polyline(b, chain));
            // Circles are filled as rings rather than stroked, which is much faster per frame.
            c.draw_with(&Paint::fill(Color::BLACK.alpha(0.2)).with_opacity(opacity), |b| {
                for &[x, y, r] in circles.iter() {
                    add_circle_ring(b, x, y, r, s);
                }
            });
            c.draw_with(&Paint::stroke(Color::BLACK, TRACE).with_opacity(opacity), |b| polyline(b, trace));
        }
    }

    /// Draws the button into its layer; returns the layer's origin in device pixels.
    fn draw_button(&mut self) -> (i32, i32) {
        let s = self.px;
        let lay = self.button_layout();
        let k = self.button_scale();
        let origin = ((lay.l * s).floor() as i32 - LAYER_MARGIN, (lay.t * s).floor() as i32 - LAYER_MARGIN);
        let (cx, cy) = lay.centre();
        let c = &mut self.button;
        c.begin(s);
        c.translate(-origin.0 as f32 / s, -origin.1 as f32 / s);
        c.translate(cx, cy);
        c.scale(k, k);
        c.translate(-cx, -cy);
        c.draw_rrect(lay.l, lay.t, lay.r - lay.l, lay.b - lay.t, RADIUS, &Paint::fill(Color::view_hex(BUTTON_COLOR)));
        if let Some(font) = self.icon.as_ref() {
            c.draw_text(CLEAR, lay.icon.0, gfx::baseline(font, lay.icon.1), font, &Paint::fill(Color::WHITE));
        }
        origin
    }
}

/// moveTo the first point, lineTo the rest (an empty path for none).
fn polyline(b: &mut ScratchBuilder<'_>, points: &[Point]) {
    let Some((&first, rest)) = points.split_first() else { return };
    b.begin(first);
    for &p in rest {
        b.line_to(p);
    }
    b.end(false);
}

/// The region a circle's stroke covers, as a nonzero-filled path: an annulus r ± CIRCLES / 2, or a
/// disc when r is under half the width. Nothing for r = 0.
fn add_circle_ring(b: &mut ScratchBuilder<'_>, x: f32, y: f32, r: f32, scale: f32) {
    if r <= 0.0 {
        return;
    }
    let half = CIRCLES as f64 / 2.0;
    let (cx, cy) = (x as f64, y as f64);
    let ring = |b: &mut ScratchBuilder<'_>, radius: f64, clockwise: bool| {
        // Vertices at 2ρ / (1 + cos(π / n)) keep the polygon within the tolerance.
        let t = CIRCLE_TOLERANCE / (radius * scale as f64);
        let n = ((std::f64::consts::PI / ((1.0 - t) / (1.0 + t)).clamp(-1.0, 1.0).acos().max(1e-4)).ceil() as usize).clamp(8, 2048);
        let rv = 2.0 * radius / (1.0 + (std::f64::consts::PI / n as f64).cos());
        let step = if clockwise { -std::f64::consts::TAU } else { std::f64::consts::TAU } / n as f64;
        let (step_sin, step_cos) = step.sin_cos();
        let (mut dx, mut dy) = (rv, 0.0f64);
        b.begin(point((cx + dx) as f32, cy as f32));
        for _ in 1..n {
            (dx, dy) = (dx * step_cos - dy * step_sin, dx * step_sin + dy * step_cos);
            b.line_to(point((cx + dx) as f32, (cy + dy) as f32));
        }
        b.end(true);
    };
    let r = r as f64;
    ring(b, r + half, false);
    if r > half {
        ring(b, r - half, true);
    }
}

/// Rounds a coordinate as Skia's SVG path string does, `%.8g`.
fn svg_round_trip(v: f32) -> f32 {
    if v == 0.0 || !v.is_finite() {
        return v;
    }
    format!("{:.7e}", v as f64).parse::<f64>().map_or(v, |d| d as f32)
}

/// Skia's contour measure of a polyline, in f32.
struct Contour {
    /// The points the segments index.
    pts: Vec<Point>,
    /// Each segment's end distance and first point index.
    segments: Vec<(f32, usize)>,
    length: f32,
}

impl Contour {
    fn measure(points: &[Point]) -> Contour {
        let mut pts = Vec::with_capacity(points.len());
        let mut segments = Vec::with_capacity(points.len());
        let mut distance = 0.0f32;
        if let Some(&first) = points.first() {
            pts.push(first);
        }
        for w in points.windows(2) {
            // The running length is summed in f32, as Skia does.
            let (dx, dy) = (w[1].x - w[0].x, w[1].y - w[0].y);
            let d = (dx * dx + dy * dy).sqrt();
            let prev = distance;
            distance += d;
            if distance > prev {
                segments.push((distance, pts.len() - 1));
                pts.push(w[1]);
            }
        }
        // A contour with no segments has length 0.
        let length = if segments.is_empty() { 0.0 } else { distance };
        Contour { pts, segments, length }
    }

    /// The position at distance `d`.
    fn pos(&self, distance: f32) -> Point {
        if self.segments.is_empty() {
            return point(0.0, 0.0);
        }
        let d = distance.clamp(0.0, self.length);
        // The first segment whose end distance is at least d.
        let index = self.segments.partition_point(|s| s.0 < d).min(self.segments.len() - 1);
        let (end, at) = self.segments[index];
        let start = if index > 0 { self.segments[index - 1].0 } else { 0.0 };
        // Linear interpolation within the segment, exact in f32.
        let t = (d - start) / (end - start);
        let (a, b) = (self.pts[at], self.pts[at + 1]);
        point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
    }
}

/// Samples `round(length)` points along the stroke, at (i / n) · length.
fn get_points(contour: &Contour) -> Vec<[f64; 2]> {
    let total = contour.length as f64;
    let amount = (total + 0.5).floor() as usize;
    (0..amount)
        .map(|i| {
            let p = contour.pos(((i as f64 / amount as f64) * total) as f32);
            [p.x as f64, p.y as f64]
        })
        .collect()
}

/// Pads the samples to a power of two with the last point.
fn fill_to_power_of_two(mut points: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    let n = points.len();
    let mut target = 1usize;
    if n != 0 && (n & (n - 1)) != 0 {
        let mut m = n;
        let mut count = 0;
        while m != 0 {
            m >>= 1;
            count += 1;
        }
        target = 1 << count;
    }
    if let Some(&last) = points.last() {
        points.resize(target.max(n), last);
    }
    points
}

/// FFT, epicycle extraction and the sort, packed as [frequency, amplitude, phase, …].
fn epicycles(points: &[[f64; 2]]) -> Vec<f64> {
    let n = points.len();
    if n < 2 {
        return Vec::new();
    }
    let fft = Fft::new(n);
    let mut input = vec![0.0f64; n * 2];
    let mut output = vec![0.0f64; n * 2];
    for (i, p) in points.iter().enumerate() {
        input[2 * i] = p[0];
        input[2 * i + 1] = p[1];
    }
    fft.transform(&mut output, &input);
    let nf = n as f64;
    let mut list: Vec<[f64; 3]> = (0..n)
        .map(|i| {
            let j = if i % 2 == 0 { i / 2 } else { n - (i + 1) / 2 };
            let (x, y) = (output[2 * j], output[2 * j + 1]);
            let frequency = ((j as f64 + nf / 2.0) % nf) - nf / 2.0;
            [frequency, (x * x + y * y).sqrt() / nf, y.atan2(x)]
        })
        .collect();
    // Stable sort, descending by amplitude.
    list.sort_by(|a, b| b[1].partial_cmp(&a[1]).unwrap_or(std::cmp::Ordering::Equal));
    list.into_iter().flatten().collect()
}

/// Radix-4 complex FFT, a line-for-line port of fft.js.
struct Fft {
    size: usize,
    table: Vec<f64>,
    width: u32,
    bitrev: Vec<i32>,
}

impl Fft {
    fn new(size: usize) -> Fft {
        let mut table = vec![0.0; size * 2];
        let mut i = 0;
        while i < table.len() {
            let angle = std::f64::consts::PI * i as f64 / size as f64;
            table[i] = angle.cos();
            table[i + 1] = -angle.sin();
            i += 2;
        }
        let mut power = 0u32;
        let mut t = 1usize;
        while size > t {
            t <<= 1;
            power += 1;
        }
        let width = if power % 2 == 0 { power - 1 } else { power };
        let mut bitrev = vec![0i32; 1 << width];
        for (j, rev) in bitrev.iter_mut().enumerate() {
            let mut shift = 0i32;
            while shift < width as i32 {
                // Shift counts use the low five bits, as JS does.
                let rev_shift = (width as i32 - shift - 2) as u32 & 31;
                *rev |= (((j as i32) >> shift) & 3).wrapping_shl(rev_shift);
                shift += 2;
            }
        }
        Fft { size, table, width, bitrev }
    }

    fn transform(&self, out: &mut [f64], data: &[f64]) {
        let size = self.size << 1;
        let width = self.width;
        let mut step = 1usize << width;
        let mut len = (size / step) << 1;
        let mut t = 0usize;
        let mut out_off = 0usize;
        if len == 4 {
            while out_off < size {
                let off = self.bitrev[t] as usize;
                single_transform2(out, data, out_off, off, step);
                out_off += len;
                t += 1;
            }
        } else {
            while out_off < size {
                let off = self.bitrev[t] as usize;
                single_transform4(out, data, out_off, off, step);
                out_off += len;
                t += 1;
            }
        }
        let inv = 1.0;
        let table = &self.table;
        step >>= 2;
        while step >= 2 {
            len = (size / step) << 1;
            let quarter_len = len >> 2;
            let mut out_off = 0;
            while out_off < size {
                let limit = out_off + quarter_len;
                let (mut i, mut k) = (out_off, 0usize);
                while i < limit {
                    let a = i;
                    let b = a + quarter_len;
                    let c = b + quarter_len;
                    let d = c + quarter_len;
                    let (ar, ai) = (out[a], out[a + 1]);
                    let (br, bi) = (out[b], out[b + 1]);
                    let (cr, ci) = (out[c], out[c + 1]);
                    let (dr, di) = (out[d], out[d + 1]);
                    let (mar, mai) = (ar, ai);
                    let table_br = table[k];
                    let table_bi = inv * table[k + 1];
                    let mbr = br * table_br - bi * table_bi;
                    let mbi = br * table_bi + bi * table_br;
                    let table_cr = table[2 * k];
                    let table_ci = inv * table[2 * k + 1];
                    let mcr = cr * table_cr - ci * table_ci;
                    let mci = cr * table_ci + ci * table_cr;
                    let table_dr = table[3 * k];
                    let table_di = inv * table[3 * k + 1];
                    let mdr = dr * table_dr - di * table_di;
                    let mdi = dr * table_di + di * table_dr;
                    let t0r = mar + mcr;
                    let t0i = mai + mci;
                    let t1r = mar - mcr;
                    let t1i = mai - mci;
                    let t2r = mbr + mdr;
                    let t2i = mbi + mdi;
                    let t3r = inv * (mbr - mdr);
                    let t3i = inv * (mbi - mdi);
                    out[a] = t0r + t2r;
                    out[a + 1] = t0i + t2i;
                    out[b] = t1r + t3i;
                    out[b + 1] = t1i - t3r;
                    out[c] = t0r - t2r;
                    out[c + 1] = t0i - t2i;
                    out[d] = t1r - t3i;
                    out[d + 1] = t1i + t3r;
                    i += 2;
                    k += step;
                }
                out_off += len;
            }
            step >>= 2;
        }
    }
}

/// Length-4 step of the FFT.
fn single_transform2(out: &mut [f64], data: &[f64], out_off: usize, off: usize, step: usize) {
    let (even_r, even_i) = (data[off], data[off + 1]);
    let (odd_r, odd_i) = (data[off + step], data[off + step + 1]);
    out[out_off] = even_r + odd_r;
    out[out_off + 1] = even_i + odd_i;
    out[out_off + 2] = even_r - odd_r;
    out[out_off + 3] = even_i - odd_i;
}

/// Length-8 step of the FFT.
fn single_transform4(out: &mut [f64], data: &[f64], out_off: usize, off: usize, step: usize) {
    let inv = 1.0;
    let (step2, step3) = (step * 2, step * 3);
    let (ar, ai) = (data[off], data[off + 1]);
    let (br, bi) = (data[off + step], data[off + step + 1]);
    let (cr, ci) = (data[off + step2], data[off + step2 + 1]);
    let (dr, di) = (data[off + step3], data[off + step3 + 1]);
    let t0r = ar + cr;
    let t0i = ai + ci;
    let t1r = ar - cr;
    let t1i = ai - ci;
    let t2r = br + dr;
    let t2i = bi + di;
    let t3r = inv * (br - dr);
    let t3i = inv * (bi - di);
    out[out_off] = t0r + t2r;
    out[out_off + 1] = t0i + t2i;
    out[out_off + 2] = t1r + t3i;
    out[out_off + 3] = t1i - t3r;
    out[out_off + 4] = t0r - t2r;
    out[out_off + 5] = t0i - t2i;
    out[out_off + 6] = t1r - t3i;
    out[out_off + 7] = t1i + t3r;
}

impl Surface for FourierVisualizer {
    fn bind(&mut self, _inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
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
            "{{\"drawing\":{},\"epicycles\":{},\"time\":{},\"trace\":{},\"stroke\":{},\"held\":{}}}",
            self.drawing,
            self.epicycles.len() / 3,
            self.time.value,
            self.trace.len(),
            self.stroke.len(),
            self.pan.tracking() || self.press.is_pressed()
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.size.0 <= 0.0 {
            return;
        }
        let phase = gfx::phase(phase);
        // The clear button, above the canvas.
        if phase == Phase::Down && !self.press.is_pressed() && self.hits_button(x, y) {
            self.press.pointer_down(id, true);
            return;
        }
        if self.press.finger() == Some(id) {
            let inside = self.in_button(x, y);
            if let Some(PressEvent::Press(press)) = self.press.pointer(id, phase, inside) {
                // A press clears the canvas and posts `press`.
                self.set_drawing(false);
                self.clear();
                if press.global {
                    self.posted.push("press".into());
                }
            }
            return;
        }
        match self.pan.event(id, phase, x, y, at_ms, true) {
            Event::Start(p) => {
                // A new stroke clears the previous one and restores the drawn opacity.
                self.clear();
                self.set_drawing(false);
                self.stroke_opacity.to(1.0, FADE_MS, Easing::timing_default());
                self.stroke.clear();
                self.stroke.push(point(p.x, p.y));
                self.stroke.push(point(p.x, p.y));
                // The first change of the pan draws the first segment.
                self.stroke.push(point(p.x, p.y));
                self.posted.push(START.into());
                self.last_tick = (self.stroke.len(), at_ms);
            }
            Event::Update(p) => {
                self.stroke.push(point(p.x, p.y));
                let (n, t) = self.last_tick;
                if self.stroke.len() >= n + TICK_POINTS && at_ms - t >= TICK_MIN_MS {
                    self.posted.push(TICK.into());
                    self.last_tick = (self.stroke.len(), at_ms);
                }
            }
            Event::End(_) => {
                self.stroke_opacity.to(0.0, FADE_MS, Easing::timing_default());
                self.finish_stroke();
            }
            _ => {}
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
        self.size = (frame.width, frame.height);
        self.px = frame.scale;
        let moving = self.advance(frame.now_ms);
        let (pw, ph) = frame.pixels();
        self.draw_canvas();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::BLACK);

        let alpha = self.button_opacity.value as f32;
        if alpha > 0.0 {
            let side = (SIDE * frame.scale).ceil() as u32 + 2 * LAYER_MARGIN as u32 + 2;
            if self.gpu.as_ref().map(|g| (g.format, g.generation, g.side)) != Some((format, frame.shader_generation, side)) {
                self.gpu = Some(build(device, format, frame.shader_generation, side));
            }
            let origin = self.draw_button();
            let gpu = self.gpu.as_ref().unwrap();
            self.button_renderer.draw(device, queue, encoder, &self.button, &gpu.layer, LAYER_FORMAT, side, side, wgpu::Color::TRANSPARENT);
            let uniforms = Uniforms { place: [origin.0 as f32, origin.1 as f32, alpha, gfx::srgb_flag(format)] };
            queue.write_buffer(&gpu.uniforms, 0, &uniforms.bytes());
            let (x0, y0) = (origin.0.max(0) as u32, origin.1.max(0) as u32);
            let (x1, y1) = (((origin.0 + side as i32).max(0) as u32).min(pw), ((origin.1 + side as i32).max(0) as u32).min(ph));
            if x1 > x0 && y1 > y0 {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("fourier visualizer button"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: target,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                pass.set_scissor_rect(x0, y0, x1 - x0, y1 - y0);
                pass.set_pipeline(&gpu.pipeline);
                pass.set_bind_group(0, &gpu.bind, &[]);
                pass.draw(0..3, 0..1);
            }
        }
        moving || self.pan.tracking() || self.press.is_animating()
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32, side: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let pipeline = skia::render::fullscreen_pipeline(device, &shader, &layout, entry::COMPOSE, format, Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING));
    let uniforms = device.create_buffer(&wgpu::BufferDescriptor { label: Some("fourier visualizer"), size: Uniforms::SIZE as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let layer = skia::render::sampled_target(device, "fourier visualizer button", LAYER_FORMAT, side, side);
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("fourier visualizer"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.as_entire_binding() },
            wgpu::BindGroupEntry { binding: BUTTON_TEXTURE.binding, resource: wgpu::BindingResource::TextureView(&layer) },
        ],
    });
    Gpu { format, generation, side, pipeline, uniforms, bind, layer }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    const W: f32 = 393.0;
    const H: f32 = 852.0;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: W, height: H, scale: 1.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
    }

    /// The stroke used by the parity test (f64, then f32).
    fn stroke() -> Vec<Point> {
        (0..120)
            .map(|k| {
                let s = (k as f64 - 60.0) / 25.0;
                let x = 200.0 + (120.0 * (1.0 - s * s)) / (1.0 + s * s) + 0.37 * k as f64;
                let y = 450.0 + (90.0 * 2.0 * s) / (1.0 + s * s);
                point(x as f32, y as f32)
            })
            .collect()
    }

    #[test]
    fn the_pipeline_matches_skia_and_fft_js() {
        assert_eq!(svg_round_trip(123.456789), "123.45679".parse::<f32>().unwrap());
        assert_eq!(svg_round_trip(7.123456789), 7.123457);
        let s = stroke();
        let mut path = vec![s[0], s[0], s[0]];
        path.extend_from_slice(&s[1..]);
        let rounded: Vec<Point> = path.iter().map(|p| point(svg_round_trip(p.x), svg_round_trip(p.y))).collect();
        let contour = Contour::measure(&rounded);
        // Reference values: length 510.93, 511 samples, 512 epicycles.
        assert_eq!(contour.length, 510.932_678_222_656_25);
        let points = get_points(&contour);
        assert_eq!(points.len(), 511);
        assert_eq!(points[1], [116.382_560_729_980_47, 385.619_232_177_734_4]);
        assert_eq!(points[510], [161.236_053_466_796_88, 515.399_963_378_906_2]);
        let (sx, sy) = points.iter().fold((0.0, 0.0), |(x, y), p| (x + p[0], y + p[1]));
        assert_eq!((sx, sy), (129_401.484_138_488_77, 226_953.336_120_605_47));
        let e = epicycles(&fill_to_power_of_two(points));
        assert_eq!(e.len(), 512 * 3);
        let expected = [
            [0.0, 511.288_152_112_188_64, 1.053_041_284_113_321_4],
            [1.0, 93.880_878_672_429_99, 2.962_742_699_080_862],
            [2.0, 14.670_465_457_052_385, 3.094_179_881_985_477_6],
            [3.0, 10.755_777_350_753_446, 2.908_552_005_931_955_6],
        ];
        for (k, want) in expected.iter().enumerate() {
            let got = &e[k * 3..k * 3 + 3];
            assert_eq!(got[0], want[0]);
            for i in 1..3 {
                assert!((got[i] - want[i]).abs() <= 1e-12 * want[i].abs().max(1.0), "{k}: {got:?} vs {want:?}");
            }
        }
    }

    #[test]
    fn the_fft_is_a_dft() {
        for n in [8usize, 16, 32, 64, 128] {
            let input: Vec<f64> = (0..2 * n).map(|i| ((i * 37 % 101) as f64 - 50.0) / 7.0).collect();
            let mut out = vec![0.0; 2 * n];
            Fft::new(n).transform(&mut out, &input);
            for k in 0..n {
                let (mut re, mut im) = (0.0, 0.0);
                for j in 0..n {
                    let a = -2.0 * std::f64::consts::PI * (j * k) as f64 / n as f64;
                    let (xr, xi) = (input[2 * j], input[2 * j + 1]);
                    re += xr * a.cos() - xi * a.sin();
                    im += xr * a.sin() + xi * a.cos();
                }
                assert!((out[2 * k] - re).abs() < 1e-9 && (out[2 * k + 1] - im).abs() < 1e-9, "n {n} k {k}");
            }
        }
        // A power of two stays as it is; anything else is padded with its last point.
        assert_eq!(fill_to_power_of_two(vec![[1.0, 2.0]; 256]).len(), 256);
        let padded = fill_to_power_of_two((0..300).map(|i| [i as f64, 0.0]).collect());
        assert_eq!((padded.len(), padded[511][0]), (512, 299.0));
    }

    fn pointer(phase: exact_gpu::PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
        InputEvent::Pointer { id: 1, phase, x, y, dx: 0.0, dy: 0.0, kind: exact_gpu::PointerKind::Touch, buttons: 1, at_ms }
    }

    fn grey(p: [u8; 4]) -> u8 {
        p[0]
    }

    #[test]
    fn a_stroke_is_retraced_by_its_epicycles_and_the_button_clears_it() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        use exact_gpu::PointerPhase::{Down, Move, Up};
        let mut v = visualizer();
        let (rest, _) = fixture::render(&gpu, &mut v, &frame(0.0)).unwrap();
        rest.save("fourier-visualizer-rest");
        // #D4D4D4 everywhere; the button is hidden (opacity 0, bottom 0).
        for (x, y) in [(10, 10), (196, 426), (331, 820), (380, 840)] {
            assert_eq!(&rest.at(x, y)[..3], &[212, 212, 212], "({x}, {y})");
        }

        // The stroke: down 12 pt left of its start, which activates the Pan there.
        let s = stroke();
        let mut ms = 16.0;
        v.input(&pointer(Down, s[0].x - 12.0, s[0].y, ms));
        for p in &s {
            ms += 16.0;
            v.input(&pointer(Move, p.x, p.y, ms));
        }
        let (drawing, _) = fixture::render(&gpu, &mut v, &frame(ms)).unwrap();
        drawing.save("fourier-visualizer-drawing");
        // The stroke (black, 10 wide) through its middle point; nothing else yet.
        let mid = s[60];
        assert!(grey(drawing.at(mid.x as u32, mid.y as u32)) < 10, "{:?}", drawing.at(mid.x as u32, mid.y as u32));
        assert!(v.agent("").unwrap().contains("\"epicycles\":0"));
        v.input(&pointer(Up, s[119].x, s[119].y, ms + 16.0));
        let reply = v.agent("").unwrap();
        assert!(reply.contains("\"drawing\":true") && reply.contains("\"epicycles\":512"), "{reply}");

        // Five seconds in: chain, circles and trace so far; the stroke has faded and the button is up.
        let start = ms + 16.0;
        let mut t = start;
        while t < start + 5000.0 {
            t += 1000.0 / 60.0;
            v.advance(t);
        }
        let (mid_run, moving) = fixture::render(&gpu, &mut v, &frame(t)).unwrap();
        mid_run.save("fourier-visualizer-5s");
        assert!(moving);
        let trace_len = v.trace.len();
        assert!((295..=305).contains(&trace_len), "{trace_len}");
        // The trace starts where the stroke did (the series at t = 0 is the sampled stroke).
        let first = v.trace[0];
        assert!((first.x - s[0].x).abs() < 1.5 && (first.y - s[0].y).abs() < 1.5, "{first:?}");
        assert!(grey(mid_run.at(first.x.round() as u32 + 1, first.y.round() as u32)) < 60);
        // The button: a dark disc with a white X.
        assert!((v.bottom.value - 65.0).abs() < 1e-3, "{}", v.bottom.value);
        assert_eq!(&mid_run.at(305, 755)[..3], &[17, 17, 17]);
        assert!(grey(mid_run.at(331, 755)) > 230, "{:?}", mid_run.at(331, 755));
        assert_eq!(&mid_run.at(300, 724)[..3], &[212, 212, 212]);
        assert_eq!(&mid_run.at(331, 790)[..3], &[212, 212, 212]);

        // On to the end: the whole trace, the visualizer fading, the button going away.
        while v.time.running {
            t += 1000.0 / 60.0;
            v.advance(t);
        }
        assert_eq!(v.time.value, TIME_END);
        assert!(!v.drawing);
        let (end, _) = fixture::render(&gpu, &mut v, &frame(t)).unwrap();
        end.save("fourier-visualizer-end");
        // The trace retraces the stroke: dark through its middle.
        assert!(grey(end.at(mid.x as u32, mid.y as u32)) < 60, "{:?}", end.at(mid.x as u32, mid.y as u32));

        // A new stroke, then the button (once it's back) clears it and posts the haptic.
        let mut ms = t + 1000.0;
        v.input(&pointer(Down, 100.0, 200.0, ms));
        for k in 1..=40 {
            ms += 16.0;
            v.input(&pointer(Move, 100.0 + 4.0 * k as f32, 200.0 + 2.0 * k as f32, ms));
        }
        v.input(&pointer(Up, 260.0, 280.0, ms));
        assert!(v.agent("").unwrap().contains("\"drawing\":true"));
        let mut t = ms;
        while t < ms + 1000.0 {
            t += 1000.0 / 60.0;
            v.advance(t);
        }
        v.input(&pointer(Down, 331.0, 755.0, t));
        v.advance(t + 16.0);
        let (pressed, _) = fixture::render(&gpu, &mut v, &frame(t + 300.0)).unwrap();
        pressed.save("fourier-visualizer-pressed");
        // Pressed: the button scales to 0.96 about its centre.
        assert_eq!(&pressed.at(299, 755)[..3], &[212, 212, 212]);
        v.input(&pointer(Up, 331.0, 755.0, t + 320.0));
        // Haptics of the two strokes: a light start, ticks, a medium at the epicycles, a soft one at the loop's end.
        let all = v.messages();
        assert_eq!(all.iter().filter(|m| m.as_str() == START).count(), 2, "{all:?}");
        assert_eq!(all.iter().filter(|m| m.as_str() == COMMIT).count(), 2, "{all:?}");
        assert_eq!(all.iter().filter(|m| m.as_str() == LOOP).count(), 1, "{all:?}");
        assert!(all.iter().filter(|m| m.as_str() == TICK).count() >= 4, "{all:?}");
        assert_eq!(all.first().map(String::as_str), Some(START));
        assert_eq!(all.last().map(String::as_str), Some("press"));
        let reply = v.agent("").unwrap();
        assert!(reply.contains("\"drawing\":false") && reply.contains("\"epicycles\":0") && reply.contains("\"held\":false"), "{reply}");

        // A tap (the Pan never activates) and a stroke under 8 pt draw nothing.
        v.input(&pointer(Down, 50.0, 50.0, t + 2000.0));
        v.input(&pointer(Up, 50.0, 50.0, t + 2050.0));
        v.input(&pointer(Down, 50.0, 50.0, t + 3000.0));
        v.input(&pointer(Move, 62.0, 50.0, t + 3016.0));
        v.input(&pointer(Up, 62.0, 50.0, t + 3032.0));
        assert!(v.agent("").unwrap().contains("\"drawing\":false"));
        assert!(v.agent("").unwrap().contains("\"epicycles\":0"));
    }
}
