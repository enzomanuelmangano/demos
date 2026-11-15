//! A pentagon radar chart of two datasets over five labelled axes. Each new dataset springs in, one
//! axis after the next, so the shape turns into the next one.
//!
//! - The labels sit upright outside their vertex, aligned away from the chart. The radius leaves
//!   room for the widest label.
//! - The grid recedes: rings and spokes are faint white hairlines.
//! - The data is yellow and cyan: a 2 pt outline, a fill that brightens toward the rim, and a dot
//!   at each vertex.
//! - Drawn on a Display P3 layer (`gfx::P3Layer`), so the colours are the P3 values.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::Spring;
use skia::{point, stops, Canvas, Cap, Color, Font, Join, Paint, Path, Renderer, Shader};

/// Axis labels, clockwise from the top. The data's values come in this order.
const LABELS: [&str; 5] = ["Sacrifice", "Fork", "Endgame", "Deflection", "Checkmate"];
const N: usize = 5;
const SETS: usize = 2;
const LAYERS: usize = 5;
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");
/// The labels: San Francisco 13 semibold (Outfit 13 where the system face can't be read).
const LABEL_SIZE: f32 = 13.0;
/// Label to vertex (pt), and label to the canvas's edge.
const LABEL_GAP: f32 = 12.0;
const EDGE: f32 = 16.0;
/// iOS dark-mode systemYellow and systemCyan.
const COLORS: [u32; SETS] = [0xFFD60A, 0x64D2FF];
/// Each axis morphs over 550 ms with a damping ratio of 0.8, STAGGER_MS after the previous one.
const MORPH_MS: f64 = 550.0;
const MORPH_RATIO: f64 = 0.8;
const STAGGER_MS: f64 = 24.0;

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    let font = skia::match_ui_font(LABEL_SIZE, 600.0).or_else(|| Font::new(OUTFIT, LABEL_SIZE));
    Box::new(RadarChart { font, progress: [Spring::at(1.0); N], ..Default::default() })
}

#[derive(Default)]
struct RadarChart {
    font: Option<Font>,
    bound: bool,
    current: [[f64; N]; SETS],
    target: [[f64; N]; SETS],
    /// Each axis's progress from `current` to `target`.
    progress: [Spring; N],
    /// New data waiting for its first frame (the stagger starts there), and that frame's time.
    armed: bool,
    start_ms: f64,
    started: [bool; N],
    /// The grid, for the size it was built at, and its radius.
    grid: Option<(f32, f32, Path, Vec<Path>)>,
    canvas: Canvas,
    renderer: Renderer,
    /// An 8-bit Display P3 layer, cleared transparent over the black view.
    p3: crate::gfx::P3Layer,
}

impl RadarChart {
    fn values(&self, set: usize) -> [f64; N] {
        let mut out = [0.0; N];
        for (i, v) in out.iter_mut().enumerate() {
            let (a, b) = (self.current[set][i], self.target[set][i]);
            *v = (a + (b - a) * self.progress[i].value).max(0.0);
        }
        out
    }

    fn settled(&self) -> bool {
        !self.armed && self.progress.iter().all(|p| !p.running)
    }
}

fn vertex(i: usize, c: f32, r: f32, v: f32) -> skia::Point {
    let a = i as f32 * std::f32::consts::TAU / N as f32;
    point(c + a.sin() * r * v, c - a.cos() * r * v)
}

/// A closed polygon through each value along its axis.
fn polygon(values: impl Iterator<Item = f32>, c: f32, r: f32) -> Path {
    let mut b = skia::path_builder();
    for (i, v) in values.enumerate() {
        if i == 0 {
            b.begin(vertex(i, c, r, v));
        } else {
            b.line_to(vertex(i, c, r, v));
        }
    }
    b.end(true);
    b.build()
}

impl Surface for RadarChart {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let mut next = [[0.0; N]; SETS];
        for (k, v) in inputs.iter().take(SETS * N).enumerate() {
            next[k / N][k % N] = v.as_number().unwrap_or(0.0);
        }
        if !self.bound {
            self.bound = true;
            self.current = next;
            self.target = next;
            self.started = [true; N];
            return Ok(());
        }
        if next == self.target {
            return Ok(());
        }
        // Interrupted: the current data is where the last change left it.
        if !self.settled() {
            self.current = [self.values(0), self.values(1)];
        }
        self.target = next;
        // Each axis gets its own spring, started STAGGER_MS apart from the next frame.
        self.progress = [Spring::at(0.0); N];
        self.started = [false; N];
        self.armed = true;
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"settled\":{},\"values\":{:?}}}", self.settled(), [self.values(0), self.values(1)]))
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
        if self.armed {
            self.armed = false;
            self.start_ms = frame.now_ms;
        }
        let mut moving = false;
        for i in 0..N {
            if !self.started[i] && frame.now_ms >= self.start_ms + STAGGER_MS * i as f64 {
                self.started[i] = true;
                crate::gfx::spring_to(&mut self.progress[i], 1.0, MORPH_MS, MORPH_RATIO);
            }
            moving |= self.progress[i].step(frame.now_ms) || !self.started[i];
        }
        if !moving {
            // Every axis at rest: the data is the target.
            self.current = self.target;
            self.progress = [Spring::at(1.0); N];
        }
        let side = frame.width.min(frame.height);
        let c = side / 2.0;
        if self.grid.as_ref().map(|g| g.0) != Some(side) {
            // The radius: the widest side label fits between its vertex and the edge.
            let widest = self.font.as_ref().map_or(0.0, |f| LABELS.iter().map(|l| f.advance_width(l)).fold(0.0, f32::max));
            let side_sin = (std::f32::consts::TAU / N as f32).sin();
            let r = ((c - EDGE - LABEL_GAP - widest) / side_sin).min(c * 0.74).max(c * 0.4);
            // Spokes from the centre, then the rings.
            let mut b = skia::path_builder();
            for i in 0..N {
                b.begin(point(c, c));
                b.line_to(vertex(i, c, r, 1.0));
                b.end(false);
            }
            let rings = (0..LAYERS).map(|k| polygon(std::iter::repeat_n(1.0 - k as f32 / LAYERS as f32, N), c, r)).collect();
            self.grid = Some((side, r, b.build(), rings));
        }
        let (_, r, spokes, rings) = self.grid.as_ref().unwrap();
        let r = *r;
        let hair = |a: u8| Paint::stroke(Color::rgba8(255, 255, 255, a), 1.0).caps(Cap::Round, Join::Round);
        let data = [self.values(0), self.values(1)];
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        canvas.draw_path(spokes, &hair(20));
        for (k, ring) in rings.iter().enumerate() {
            canvas.draw_path(ring, &hair(if k == 0 { 56 } else { 26 }));
        }
        if let Some(font) = &self.font {
            let ink = Paint::fill(Color::rgba8(255, 255, 255, 204));
            let m = font.metrics();
            for (i, label) in LABELS.iter().enumerate() {
                let a = i as f32 * std::f32::consts::TAU / N as f32;
                let (sx, cy_) = (a.sin(), -a.cos());
                let anchor = vertex(i, c, r + LABEL_GAP, 1.0);
                let w = font.advance_width(label);
                // Away from the chart: left of the left spokes, right of the right, centred on top.
                let x = if sx.abs() < 0.1 { anchor.x - w / 2.0 } else if sx > 0.0 { anchor.x } else { anchor.x - w };
                // Vertically: above the top spoke, below the bottom ones, centred on the side.
                let mid = (m.ascent + m.descent) / 2.0;
                let y = if cy_ < -0.9 { anchor.y - m.descent } else if cy_ > 0.5 { anchor.y - m.ascent } else { anchor.y - mid };
                canvas.draw_text(label, x.clamp(EDGE, side - EDGE - w), y, font, &ink);
            }
        }
        for (set, values) in data.iter().enumerate() {
            let path = polygon(values.iter().map(|v| *v as f32), c, r);
            let color = Color::hex(COLORS[set]);
            let [cr, cg, cb] = [(COLORS[set] >> 16) as u8, (COLORS[set] >> 8) as u8, COLORS[set] as u8];
            let fill = Shader::Radial { center: point(c, c), radius: r, stops: stops(&[Color::rgba8(cr, cg, cb, 20), Color::rgba8(cr, cg, cb, 77)]) };
            canvas.draw_path(&path, &Paint::shader(fill));
            canvas.draw_path(&path, &Paint::stroke(color, 2.0).caps(Cap::Round, Join::Round));
            for (i, v) in values.iter().enumerate() {
                let p = vertex(i, c, r, *v as f32);
                canvas.draw_circle(p.x, p.y, 5.5, &Paint::fill(Color::BLACK));
                canvas.draw_circle(p.x, p.y, 3.5, &Paint::fill(color));
            }
        }
        let (pw, ph) = frame.pixels();
        self.p3.draw(&mut self.renderer, device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    fn frame(now_ms: f64) -> Frame {
        Frame { width: 400.0, height: 400.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn the_polygons_spring_to_new_data() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut s = RadarChart { font: Font::new(OUTFIT, LABEL_SIZE), progress: [Spring::at(1.0); N], ..Default::default() };
        let data = |v: [f64; 10]| v.map(Value::Number);
        // Yellow, then cyan, five values each.
        s.bind(&data([1.0, 0.6, 0.1, 0.1, 0.5, 0.2, 0.1, 0.5, 0.9, 0.8]), None).unwrap();
        let (img, animating) = fixture::render(&gpu, &mut s, &frame(0.0)).unwrap();
        crate::gfx::save_over(&img, "radar-chart-a", [0, 0, 0]);
        assert!(!animating);
        let r = s.grid.as_ref().unwrap().1;
        assert!(r > 200.0 * 0.5 && r <= 200.0 * 0.74, "{r}");
        let px = |img: &fixture::Pixels, p: skia::Point| img.at((2.0 * p.x) as u32, (2.0 * p.y) as u32);
        // Within 3 levels (the 8-bit P3 canvas's round trip).
        let near = |a: [u8; 4], b: [u8; 3]| (0..3).all(|k| (a[k] as i32 - b[k] as i32).abs() <= 3);
        // The yellow dot at the top spoke's end; the cyan one on spoke 3 at 0.9.
        assert!(near(px(&img, vertex(0, 200.0, r, 1.0)), [0xFF, 0xD6, 0x0A]), "{:?}", px(&img, vertex(0, 200.0, r, 1.0)));
        assert!(near(px(&img, vertex(3, 200.0, r, 0.9)), [0x64, 0xD2, 0xFF]), "{:?}", px(&img, vertex(3, 200.0, r, 0.9)));
        // Labels upright and outside: ink above the top vertex, and below the lower ones.
        let ink = |x0: f32, x1: f32, y0: f32, y1: f32| {
            let mut n = 0;
            for x in (x0 as u32)..(x1 as u32) {
                for y in (y0 as u32)..(y1 as u32) {
                    n += (img.at(2 * x, 2 * y)[0] > 150) as u32;
                }
            }
            n
        };
        let top = vertex(0, 200.0, r, 1.0);
        assert!(ink(top.x - 30.0, top.x + 30.0, top.y - 30.0, top.y - 6.0) > 20);
        let endgame = vertex(2, 200.0, r, 1.0);
        assert!(ink(endgame.x - 10.0, endgame.x + 60.0, endgame.y + 8.0, endgame.y + 30.0) > 20);
        // The grid recedes: the outer ring between two vertices is a dim grey.
        let mid = point((vertex(1, 200.0, r, 1.0).x + vertex(2, 200.0, r, 1.0).x) / 2.0, (vertex(1, 200.0, r, 1.0).y + vertex(2, 200.0, r, 1.0).y) / 2.0);
        assert!(px(&img, mid)[0] < 90, "{:?}", px(&img, mid));
        s.bind(&data([0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3]), Some(0.0)).unwrap();
        let mut ms = 16.0;
        let mut animating = true;
        let mut last = img;
        let mut max_top = 0.0f64;
        while animating && ms < 3000.0 {
            let (i, a) = fixture::render(&gpu, &mut s, &frame(ms)).unwrap();
            max_top = max_top.max(1.0 - s.values(0)[0]);
            last = i;
            animating = a;
            ms += 16.0;
        }
        crate::gfx::save_over(&last, "radar-chart-b", [0, 0, 0]);
        assert!(ms < 1500.0, "{ms}");
        // It settles a little past the target (yellow top 1 → 0.2 dips under 0.2), then rests.
        assert!(max_top > 0.8 && max_top < 0.85, "{max_top}");
        assert!(near(px(&last, vertex(0, 200.0, r, 0.3)), [0x64, 0xD2, 0xFF]), "{:?}", px(&last, vertex(0, 200.0, r, 0.3)));
        assert_eq!(s.values(0), [0.2; 5]);
    }
}
