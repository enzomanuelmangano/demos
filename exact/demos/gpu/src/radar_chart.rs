//! Radar Chart (src/animations/radar-chart/components/radar-chart): a pentagon grid (five
//! spokes and five rings at 1, 0.8, …, 0.2, stroked 2 in rgba(255,255,255,0.5)), five labels
//! (Outfit 16, white, each rotated about the centre by its spoke's angle, its baseline at y 20)
//! and two data polygons (filled rgba(255,255,0,0.2) / rgba(0,255,255,0.3); dots of 8 and an
//! outline of 4 in their colour `.darken(0.1).hex()`: #E5E600 / #00E5E6).
//!
//! - radius = min(cx, cy) × 0.82 − 8 / 2 (dotStrokeWidth = strokeWidth × 4).
//! - A point: (cx + sin(a) r v, cy − cos(a) r v), a = i × 2π / 5.
//! - New data (the inputs: two datasets × five values, in the labels' order): progress from 0
//!   to 1 on withSpring({ duration 500, dampingRatio 1 }) (stiffness 1087.7, damping 131.9,
//!   mass 4), each value interpolated from where the last change left it (use-unwrapped-radar-
//!   values.ts).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Spring, SpringConfig};
use skia::{point, Canvas, Color, Font, Paint, Path, Renderer};

/// Object.keys of the data's values: generateRandomDataChart builds `{ [key]: v, ...acc }`
/// over Checkmate…Sacrifice, so the last key comes first.
const LABELS: [&str; 5] = ["Sacrifice", "Fork", "Endgame", "Deflection", "Checkmate"];
const N: usize = 5;
const SETS: usize = 2;
const STROKE_WIDTH: f32 = 2.0;
const LAYERS: usize = 5;
const PROGRESS: SpringConfig = SpringConfig { stiffness: 1087.7, damping: 131.9, mass: 4.0 };
static OUTFIT: &[u8] = include_bytes!("../fonts/outfit.ttf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(RadarChart { font: Font::new(OUTFIT, 16.0), progress: Spring::at(1.0), ..Default::default() })
}

#[derive(Default)]
struct RadarChart {
    font: Option<Font>,
    bound: bool,
    current: [[f64; N]; SETS],
    target: [[f64; N]; SETS],
    progress: Spring,
    /// The grid, for the size it was built at.
    grid: Option<(f32, Path, Vec<Path>)>,
    canvas: Canvas,
    renderer: Renderer,
}

impl RadarChart {
    fn values(&self, set: usize) -> [f64; N] {
        let p = self.progress.value.clamp(0.0, 1.0);
        let mut out = [0.0; N];
        for (i, v) in out.iter_mut().enumerate() {
            let (a, b) = (self.current[set][i], self.target[set][i]);
            *v = a + (b - a) * p;
        }
        out
    }
}

fn vertex(i: usize, c: f32, r: f32, v: f32) -> skia::Point {
    let a = i as f32 * std::f32::consts::TAU / N as f32;
    point(c + a.sin() * r * v, c - a.cos() * r * v)
}

/// getScaledPolygonPath.
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
            return Ok(());
        }
        if next == self.target {
            return Ok(());
        }
        // Interrupted: the current data is where the last change left it.
        if self.progress.value < 1.0 {
            self.current = [self.values(0), self.values(1)];
        }
        self.target = next;
        self.progress = Spring::at(0.0);
        self.progress.to(1.0, 0.0, PROGRESS);
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"progress\":{},\"values\":{:?}}}", self.progress.value, [self.values(0), self.values(1)]))
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
        let moving = self.progress.step(frame.now_ms);
        if !moving && self.progress.value >= 1.0 {
            // progress === 1: currentData = targetData.
            self.current = self.target;
        }
        let c = frame.width.min(frame.height) / 2.0;
        let r = c * 0.82 - STROKE_WIDTH * 4.0 / 2.0;
        if self.grid.as_ref().map(|g| g.0) != Some(frame.width.min(frame.height)) {
            // usePolygonGrid: a move to the centre and a line out, per spoke; then close().
            let mut b = skia::path_builder();
            for i in 0..N {
                b.begin(point(c, c));
                b.line_to(vertex(i, c, r, 1.0));
                b.end(i == N - 1);
            }
            let rings = (0..LAYERS).map(|k| polygon(std::iter::repeat_n(1.0 - k as f32 / LAYERS as f32, N), c, r)).collect();
            self.grid = Some((frame.width.min(frame.height), b.build(), rings));
        }
        let (_, spokes, rings) = self.grid.as_ref().unwrap();
        let line = Paint::stroke(Color::parse("rgba(255,255,255,0.5)"), STROKE_WIDTH);
        let data = [self.values(0), self.values(1)];
        let canvas = &mut self.canvas;
        canvas.begin(frame.scale);
        canvas.draw_path(spokes, &line);
        for ring in rings {
            canvas.draw_path(ring, &line);
        }
        if let Some(font) = &self.font {
            let white = Paint::fill(Color::WHITE);
            for (i, label) in LABELS.iter().enumerate() {
                let saved = canvas.matrix();
                canvas.translate(c, c);
                canvas.rotate(std::f32::consts::TAU / N as f32 * i as f32);
                canvas.translate(-c, -c);
                canvas.draw_text(label, c - font.measure_text(label).width / 2.0, 20.0, font, &white);
                canvas.set_matrix(saved);
            }
        }
        let fills = ["rgba(255,255,0,0.2)", "rgba(0,255,255,0.3)"];
        let strokes = [0xE5E600, 0x00E5E6];
        for (set, values) in data.iter().enumerate() {
            let path = polygon(values.iter().map(|v| *v as f32), c, r);
            let dark = Color::hex(strokes[set]);
            canvas.draw_path(&path, &Paint::fill(Color::parse(fills[set])));
            // <Points> (mode "points", strokeCap round, strokeWidth 8): a dot of 8 at each.
            for (i, v) in values.iter().enumerate() {
                let p = vertex(i, c, r, *v as f32);
                canvas.draw_circle(p.x, p.y, STROKE_WIDTH * 4.0 / 2.0, &Paint::fill(dark));
            }
            canvas.draw_path(&path, &Paint::stroke(dark, STROKE_WIDTH * 2.0));
        }
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
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
        let mut s = surface();
        let data = |v: [f64; 10]| v.map(Value::Number);
        // RN's commented example: yellow 1, 0.6, 0.1, 0.1, 0.5 / cyan 0.2, 0.1, 0.5, 0.9, 0.8.
        s.bind(&data([1.0, 0.6, 0.1, 0.1, 0.5, 0.2, 0.1, 0.5, 0.9, 0.8]), None).unwrap();
        let (img, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        img.save("radar-chart-a");
        assert!(!animating);
        // radius = 200 × 0.82 − 4 = 160. The yellow dot at the top spoke's end (200, 40).
        let px = |x: f32, y: f32| img.at((2.0 * x) as u32, (2.0 * y) as u32);
        assert_eq!(px(200.0, 40.0)[..3], [0xE5, 0xE6, 0x00], "{:?}", px(200.0, 40.0));
        // The cyan dot on spoke 3 (216°) at 0.9.
        let a = 3.0 * std::f32::consts::TAU / 5.0;
        let (x, y) = (200.0 + a.sin() * 144.0, 200.0 - a.cos() * 144.0);
        assert_eq!(px(x, y)[..3], [0x00, 0xE5, 0xE6], "{:?}", px(x, y));
        // A label: "Sacrifice" above the top, white, baseline 20.
        let label = (180..220).flat_map(|x| (8..20).map(move |y| (x, y))).filter(|&(x, y)| img.at(2 * x, 2 * y)[0] > 200).count();
        assert!(label > 20, "label pixels {label}");
        // A grid ring at 0.6 crossing the top spoke (200, 104), white at half alpha over black.
        let ring = px(200.0, 200.0 - 0.6 * 160.0);
        assert!(ring[0] > 100, "{ring:?}");
        s.bind(&data([0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3]), Some(0.0)).unwrap();
        let (mid, _) = fixture::render(&gpu, s.as_mut(), &frame(16.0)).unwrap();
        let mut ms = 16.0;
        let mut animating = true;
        let mut last = mid;
        while animating && ms < 3000.0 {
            ms += 16.0;
            let (i, a) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
            last = i;
            animating = a;
        }
        last.save("radar-chart-b");
        assert!(ms < 1500.0, "{ms}");
        // The cyan top vertex now at 0.3: (200, 152); nothing left at the old yellow (200, 40).
        assert_eq!(last.at(400, 2 * 152)[..3], [0x00, 0xE5, 0xE6], "{:?}", last.at(400, 304));
        assert_ne!(last.at(400, 80)[..3], [0xE5, 0xE6, 0x00]);
    }
}
