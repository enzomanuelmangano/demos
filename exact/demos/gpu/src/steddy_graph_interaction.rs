//! Steddy Graph Interaction (src/animations/steddy-graph-interaction/components/graph/index.tsx):
//! the graph under the segmented control, a purple line of 27 scores that springs to the
//! scores of the difficulty picked (the input: 0 Light, 1 Standard, 2 Pro).
//!
//! - The canvas: the window's width × 200 (canvasHeight), padding 50, maxValue 100 → 110,
//!   lineScore 70: lineY = (1 − 70 / 110) × 200.
//! - A dashed Line (0, lineY) → (W, lineY): rgba(0,0,0,0.1), stroke 2, DashPathEffect [4, 4].
//! - Text "70 pts" at (W − 80, lineY + 40), SF-Compact-Rounded-Medium 18, rgba(0,0,0,0.5).
//! - The Path: moveTo(50, y(s₀)), then lineTo(50 + i · (W − 100) / 26, y(sᵢ)) for every i
//!   (the first a zero-length segment), y(s) = 200 (1 − s / 110); stroke 3, round caps,
//!   #8A40FF (Palette.primary), CornerPathEffect r 20.
//! - rRawScores = withSpring(scores): each score its own default spring (Gentle), from where it
//!   is at its velocity; on mount at the scores.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Spring, GENTLE};
use skia::{corner_polyline, point, Canvas, Color, Font, Paint, Point, Renderer};

/// LIGHT_GRAPH_SCORES, STANRDARD_GRAPH_SCORES, PRO_GRAPH_SCORES (constants/graph-scores.ts).
const SCORES: [[f64; 27]; 3] = [
    [100., 53., 82., 59., 43., 63., 51., 66., 54., 62., 72., 81., 89., 100., 100., 100., 96., 98., 100., 100., 100., 100., 100., 93., 97., 100., 100.],
    [84., 42., 67., 48., 35., 54., 43., 57., 47., 53., 61., 68., 77., 85., 87., 93., 82., 84., 88., 87., 95., 91., 90., 77., 82., 87., 92.],
    [70., 35., 55., 39., 29., 46., 37., 50., 40., 45., 51., 57., 65., 73., 74., 80., 71., 71., 75., 73., 79., 75., 74., 63., 69., 74., 79.],
];
const HEIGHT: f32 = 200.0;
const PADDING: f32 = 50.0;
/// maxValue + 10.
const MAX: f32 = 110.0;
const LINE_SCORE: f32 = 70.0;
/// SF-Compact-Rounded-Medium.otf, its ASCII (fontTools subset: same outlines, same metrics).
static SF_COMPACT_ROUNDED: &[u8] = include_bytes!("../../assets/fonts/SF-Compact-Rounded-Medium.otf");

/// The demo's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Graph {
        font: Font::new(SF_COMPACT_ROUNDED, 18.0),
        label: format!("{} pts", LINE_SCORE as i32),
        scores: std::array::from_fn(|_| Spring::default()),
        points: Vec::with_capacity(28),
        ..Default::default()
    })
}

#[derive(Default)]
struct Graph {
    difficulty: Option<usize>,
    scores: [Spring; 27],
    font: Option<Font>,
    label: String,
    points: Vec<Point>,
    canvas: Canvas,
    renderer: Renderer,
}

impl Graph {
    /// lineY.
    fn line_y() -> f32 {
        (1.0 - LINE_SCORE / MAX) * HEIGHT
    }

    fn record(&mut self, width: f32, scale: f32) {
        let c = &mut self.canvas;
        c.begin(scale);
        let line_y = Graph::line_y();
        // The dashed line: 4 on, 4 off from x 0, 2 wide, butt caps.
        let dash = Paint::fill(Color::rgba8(0, 0, 0, 255).alpha(0.1));
        let mut x = 0.0;
        while x < width {
            c.draw_rect(x, line_y - 1.0, 4.0f32.min(width - x), 2.0, &dash);
            x += 8.0;
        }
        if let Some(font) = &self.font {
            c.draw_text(&self.label, width - 80.0, line_y + 40.0, font, &Paint::fill(Color::rgba8(0, 0, 0, 255).alpha(0.5)));
        }
        let distance = (width - PADDING * 2.0) / (self.scores.len() - 1) as f32;
        let y = |s: f64| HEIGHT * (1.0 - s as f32 / MAX);
        self.points.clear();
        self.points.push(point(PADDING, y(self.scores[0].value)));
        for (i, s) in self.scores.iter().enumerate() {
            self.points.push(point(PADDING + distance * i as f32, y(s.value)));
        }
        let path = corner_polyline(&self.points, 20.0);
        let line = Paint::stroke(Color::hex(0x8A40FF), 3.0).caps(skia::Cap::Round, skia::Join::Miter);
        c.draw_path(&path, &line);
    }
}

impl Surface for Graph {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let d = (inputs.first().and_then(|v| v.as_number()).unwrap_or(1.0).round() as usize).min(2);
        if self.difficulty == Some(d) {
            return Ok(());
        }
        let first = self.difficulty.is_none();
        self.difficulty = Some(d);
        for (s, &to) in self.scores.iter_mut().zip(SCORES[d].iter()) {
            if first {
                s.set(to);
            } else {
                let v = if s.running { s.velocity } else { 0.0 };
                s.to(to, v, GENTLE);
            }
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let scores: Vec<String> = self.scores.iter().map(|s| format!("{:.2}", s.value)).collect();
        Some(format!("{{\"difficulty\":{},\"scores\":[{}]}}", self.difficulty.unwrap_or(1), scores.join(",")))
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
        if self.difficulty.is_none() {
            self.bind(&[], None).ok();
        }
        let mut moving = false;
        for s in self.scores.iter_mut() {
            moving |= s.step(frame.now_ms);
        }
        self.record(frame.width, frame.scale);
        let (pw, ph) = frame.pixels();
        // The Canvas is transparent over the container's Palette.background.
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    #[test]
    fn the_line_springs_to_the_difficulty_picked() {
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 200.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Number(1.0)], None).unwrap();
        let (standard, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        standard.save("steddy-graph-standard");
        assert!(!animating);
        let purple = |p: [u8; 4]| p[3] > 200 && p[2] > 200 && p[0] > 100 && p[1] < 100;
        // Score 84 at x 50: y = 200 (1 − 84 / 110) = 47.3 (device ×2).
        assert!(purple(standard.at(100, 95)), "{:?}", standard.at(100, 95));
        // The dash at lineY 72.7: on at x 0–4, off at 4–8 (device ×2).
        assert!(standard.at(4, 145)[3] > 0 && standard.at(12, 145)[3] == 0, "{:?} {:?}", standard.at(4, 145), standard.at(12, 145));
        // "70 pts" grey below it at the right.
        assert!(standard.count(|p| p[3] > 100 && p[0] < 10 && p[1] < 10 && p[2] < 10) > 100);

        s.bind(&[Value::Number(0.0)], None).unwrap();
        let mut ms = 0.0;
        let mut moving = true;
        while moving && ms < 3000.0 {
            ms += 16.0;
            moving = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
        }
        assert!((700.0..1200.0).contains(&ms), "{ms}");
        let (light, _) = fixture::render(&gpu, s.as_mut(), &frame(ms + 16.0)).unwrap();
        light.save("steddy-graph-light");
        assert!(s.agent("{}").unwrap().starts_with("{\"difficulty\":0,\"scores\":[100.00,53.00"));
        // Score 100 at x 50: y 18.2.
        assert!(purple(light.at(100, 37)), "{:?}", light.at(100, 37));
        assert!(!purple(light.at(100, 95)));
    }
}
