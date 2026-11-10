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
//!
//! A spring frame allocates nothing: the dashes (one path of 4 × 2 rects, as the dashed 2-wide
//! butt stroke is) are built once per width, the label and its glyph outlines once, and the
//! line is rewritten in place in a `PathBuffer` kept between frames and drawn from its events
//! (`Canvas::draw_path_events`). The test `a_spring_frame_allocates_nothing` counts.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{Spring, GENTLE};
use skia::{point, Canvas, Color, Font, Paint, Path, PathBuffer, Point, Renderer};

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
    Box::new(graph())
}

fn graph() -> Graph {
    Graph {
        font: Font::new(SF_COMPACT_ROUNDED, 18.0),
        label: format!("{} pts", LINE_SCORE as i32),
        scores: std::array::from_fn(|_| Spring::default()),
        points: Vec::with_capacity(28),
        ..Default::default()
    }
}

#[derive(Default)]
struct Graph {
    difficulty: Option<usize>,
    scores: [Spring; 27],
    font: Option<Font>,
    label: String,
    points: Vec<Point>,
    /// The line's path, rewritten each frame in place.
    path: PathBuffer,
    /// The dashed line's rects for a canvas width (`<DashPathEffect intervals={[4, 4]}>`).
    dashes: Option<(f32, Path)>,
    canvas: Canvas,
    renderer: Renderer,
}

/// `<CornerPathEffect r>` on the open polyline `points`, written as `skia::corner_polyline`
/// writes it (the same events, checked in the tests) into `out`, cleared first: a buffer kept
/// between frames, so once it has grown to the line's size, writing it allocates nothing.
fn corner_path(points: &[Point], radius: f32, out: &mut PathBuffer) {
    out.clear();
    let mut b = out.builder();
    let Some(&first) = points.first() else {
        b.build();
        return;
    };
    b.begin(first);
    for pair in points.windows(2) {
        let (a, c) = (pair[0], pair[1]);
        // ComputeStep.
        let d = c - a;
        let dist = d.length();
        let (step, segment) = if dist <= radius * 2.0 { (d * 0.5, false) } else { (d * (radius / dist), true) };
        b.quadratic_bezier_to(a, a + step);
        if segment {
            b.line_to(c - step);
        }
    }
    if points.len() > 1 {
        b.line_to(points[points.len() - 1]);
    }
    b.end(false);
    b.build();
}

/// The dashes of `<Line p1={(0, y)} p2={(width, y)} strokeWidth={2}>` with `DashPathEffect
/// [4, 4]`: 4 on from x 0, 4 off, the last cut at the line's end, butt caps (2 tall rects).
fn dash_path(width: f32, y: f32) -> Path {
    let mut b = skia::path_builder();
    let mut x = 0.0;
    while x < width {
        skia::add_rect(&mut b, x, y - 1.0, 4.0f32.min(width - x), 2.0);
        x += 8.0;
    }
    b.build()
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
        if self.dashes.as_ref().map(|d| d.0) != Some(width) {
            self.dashes = Some((width, dash_path(width, line_y)));
        }
        c.draw_path(&self.dashes.as_ref().unwrap().1, &Paint::fill(Color::rgba8(0, 0, 0, 255).alpha(0.1)));
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
        corner_path(&self.points, 20.0, &mut self.path);
        // A solid paint holds no heap data: making it is free.
        let line = Paint::stroke(Color::hex(0x8A40FF), 3.0).caps(skia::Cap::Round, skia::Join::Miter);
        c.draw_path_events(self.path.get(0).iter(), &line);
    }
}

impl Graph {
    /// A frame's CPU work: the springs stepped, the canvas recorded.
    fn update(&mut self, frame: &Frame) -> bool {
        let mut moving = false;
        for s in self.scores.iter_mut() {
            moving |= s.step(frame.now_ms);
        }
        self.record(frame.width, frame.scale);
        moving
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
                // Reanimated's spring onStart: the running spring's velocity, clipped to 0
                // when it points away from the new target.
                let (x, v) = (s.value, s.velocity);
                let v = if !s.running || (to > x && v < 0.0) || (to < x && v > 0.0) { 0.0 } else { v };
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
        let moving = self.update(frame);
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
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::cell::Cell;

    /// The test binary's allocator: the system's, counting the allocations (and reallocations)
    /// a thread makes while its counter is on.
    struct Counting;
    thread_local! {
        static COUNT: Cell<Option<usize>> = const { Cell::new(None) };
    }
    fn bump() {
        let _ = COUNT.try_with(|c| {
            if let Some(n) = c.get() {
                c.set(Some(n + 1));
            }
        });
    }
    unsafe impl GlobalAlloc for Counting {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            bump();
            unsafe { System.alloc(layout) }
        }
        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            bump();
            unsafe { System.alloc_zeroed(layout) }
        }
        unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
            bump();
            unsafe { System.realloc(ptr, layout, size) }
        }
        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            unsafe { System.dealloc(ptr, layout) }
        }
    }
    #[global_allocator]
    static ALLOCATOR: Counting = Counting;

    fn counted<T>(f: impl FnOnce() -> T) -> (T, usize) {
        COUNT.with(|c| c.set(Some(0)));
        let out = f();
        (out, COUNT.with(|c| c.replace(None)).unwrap())
    }

    fn cpu_frame(now_ms: f64) -> Frame {
        Frame { width: 420.0, height: 200.0, scale: 3.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: 0, headroom: 1.0 }
    }

    #[test]
    fn a_spring_frame_allocates_nothing() {
        let mut g = graph();
        g.bind(&[Value::Number(1.0)], None).unwrap();
        // Every switch between the difficulties, each spring run to rest. Returns the frames
        // and, when counting, the allocations of the worst frame.
        let mut ms = 0.0;
        let mut cycle = |g: &mut Graph, count: bool| {
            let (mut frames, mut worst) = (0, 0);
            for to in [2.0, 0.0, 1.0, 0.0, 2.0, 1.0] {
                g.bind(&[Value::Number(to)], None).unwrap();
                loop {
                    ms += 16.0;
                    let (moving, n) = if count { counted(|| g.update(&cpu_frame(ms))) } else { (g.update(&cpu_frame(ms)), 0) };
                    frames += 1;
                    worst = worst.max(n);
                    if !moving {
                        break;
                    }
                }
            }
            (frames, worst)
        };
        // Warm up once: the canvas's and tessellators' buffers and the line's PathBuffer grow
        // to the largest frame they meet (amortized, a handful of times in all), the glyph
        // cache and the dashes fill. After that, a frame reuses them.
        cycle(&mut g, false);
        let (frames, worst) = cycle(&mut g, true);
        assert!(frames > 6 * 30, "{frames}");
        assert_eq!(worst, 0, "a spring frame allocated {worst} times");
    }

    #[test]
    fn the_corner_path_is_skias() {
        let lines = |scores: &[f64; 27]| -> Vec<Point> {
            let distance = (420.0 - PADDING * 2.0) / 26.0;
            let y = |s: f64| HEIGHT * (1.0 - s as f32 / MAX);
            std::iter::once(point(PADDING, y(scores[0]))).chain(scores.iter().enumerate().map(|(i, &s)| point(PADDING + distance * i as f32, y(s)))).collect()
        };
        let mut sets: Vec<Vec<Point>> = SCORES.iter().map(lines).collect();
        sets.push(vec![point(0.0, 0.0), point(100.0, 0.0), point(105.0, 30.0), point(300.0, 10.0)]);
        sets.push(vec![point(3.0, 4.0)]);
        sets.push(vec![point(3.0, 4.0), point(10.0, 4.0)]);
        for points in sets {
            let mut buffer = PathBuffer::new();
            corner_path(&points, 20.0, &mut buffer);
            let ours: Vec<_> = buffer.get(0).iter().collect();
            let skia: Vec<_> = skia::corner_polyline(&points, 20.0).iter().collect();
            assert_eq!(ours, skia);
        }
    }

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
