//! GitHub Contributions' grid (src/animations/github-contributions/contribution-calendar): every
//! square of the calendar and its animation, on the host's frame clock.
//!
//! - contribution-square.tsx: one `progress` per square. startAnimation:
//!   `progress.set(withDelay(45 · (weekIndex + (6 − dayIndex)), withSpring(1, { mass 1.1,
//!   damping 13, stiffness 150 })))`, the animation it replaces still running through the delay
//!   (delay.ts steps its previousAnimation until it starts). resetAnimation: `cancelAnimation`,
//!   then `withDelay(Math.random() · 500, withSpring(0, { mass 0.9, damping 10, stiffness 60 }))`,
//!   so the square holds where it was through its delay. Either spring starts from rest: the
//!   animation before it is a withDelay, which has no velocity (spring.ts onStart:
//!   `previousAnimation.velocity + config.velocity || 0`). `restSpeedThreshold` plays no part in
//!   Reanimated 4: a spring rests on its energy (6e-9 of its start).
//! - rStyle: scale `interpolate(progress, [0, 0.5, 1], [1, 0.4, 1])` (extended past both ends),
//!   about the square's centre; backgroundColor `interpolateColor(progress, [0, 1], [level0,
//!   level colour], 'RGB')`: clamped, gamma 2.2, rounded to 8 bits.
//! - The app sets `RCTColorSpace.displayP3`, so a View's `rgba(r, g, b)` is that Display P3
//!   colour: the target is extended sRGB (`high_dynamic_range`), which holds the greens outside
//!   sRGB (levels 2–4) exactly.
//! - styles.square: 14 × 14, radius 2 continuous, 3 apart (marginBottom; a week's marginRight).
//!   An empty square (outside the data's range) is transparent.
//!
//! Inputs: levels (one character per calendar day, week by week from Monday: `0`–`4`, or `.` for
//! an empty square), toggles (each new count is one press: toggleAnimation), seed (the reset's
//! Math.random()).

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, interpolate_color, Extrapolation, Spring, SpringConfig as Config};
use skia::{Canvas, Color, Paint, Renderer};

/// styles.square: side, gap, radius.
const SIDE: f32 = 14.0;
const STEP: f32 = 17.0;
const RADIUS: f32 = 2.0;
/// SpringConfig and the reset's.
const IN: Config = Config {
    stiffness: 150.0,
    damping: 13.0,
    mass: 1.1,
};
const OUT: Config = Config {
    stiffness: 60.0,
    damping: 10.0,
    mass: 0.9,
};
/// COLOR_SCHEMES.github, level0 … level4 (Display P3 components, as the app reads them).
const LEVELS: [[f64; 4]; 5] = [
    [235.0, 237.0, 240.0, 1.0],
    [155.0, 233.0, 168.0, 1.0],
    [64.0, 196.0, 99.0, 1.0],
    [48.0, 161.0, 78.0, 1.0],
    [33.0, 110.0, 57.0, 1.0],
];

/// The grid's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Grid::default())
}

#[derive(Default)]
struct Square {
    /// Week and weekday (0 Monday).
    week: usize,
    day: usize,
    level: usize,
    progress: Spring,
    /// A withDelay waiting: when (ms on the frame clock), to what, on which spring.
    pending: Option<(f64, f64, Config)>,
}

#[derive(Default)]
struct Grid {
    levels: String,
    squares: Vec<Square>,
    toggles: f64,
    seed: f64,
    animating: bool,
    /// A press not yet stamped by a frame: whether it starts (true) or resets.
    press: Option<bool>,
    presses: u32,
    canvas: Canvas,
    renderer: Renderer,
}

/// A deterministic Math.random() for the reset: 0 ≤ r < 1 from the seed, the press and the square.
fn random(seed: f64, press: u32, index: usize) -> f64 {
    let mut x =
        (seed as u64) ^ ((press as u64) << 32) ^ (index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    x ^= x >> 33;
    x = x.wrapping_mul(0xFF51_AFD7_ED55_8CCD);
    x ^= x >> 33;
    x = x.wrapping_mul(0xC4CE_B9FE_1A85_EC53);
    x ^= x >> 33;
    (x >> 11) as f64 / (1u64 << 53) as f64
}

/// Display P3 components (0…255) as encoded extended sRGB: linear P3 → linear sRGB, the sRGB
/// curve mirrored below 0.
pub fn p3_to_extended_srgb(c: [f64; 3]) -> [f64; 3] {
    let lin = |v: f64| {
        let v = v / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    let enc = |v: f64| {
        let a = v.abs();
        let e = if a <= 0.0031308 {
            12.92 * a
        } else {
            1.055 * a.powf(1.0 / 2.4) - 0.055
        };
        e.copysign(v)
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    [
        enc(1.224_940_2 * r - 0.224_940_2 * g),
        enc(-0.042_056_9 * r + 1.042_056_9 * g),
        enc(-0.019_637_6 * r - 0.078_636_1 * g + 1.098_273_7 * b),
    ]
}

/// A square's scale and colour (Display P3 components, 0…255) at `progress`.
pub fn style(progress: f64, level: usize) -> (f64, [f64; 4]) {
    let scale = interpolate(
        progress,
        &[0.0, 0.5, 1.0],
        &[1.0, 0.4, 1.0],
        Extrapolation::Extend,
    );
    let colour = interpolate_color(progress, &[0.0, 1.0], &[LEVELS[0], LEVELS[level.min(4)]]);
    (scale, colour)
}

impl Grid {
    fn rebuild(&mut self) {
        self.squares = self
            .levels
            .chars()
            .enumerate()
            .filter_map(|(i, ch)| {
                ch.to_digit(10).map(|l| Square {
                    week: i / 7,
                    day: i % 7,
                    level: l as usize,
                    ..Default::default()
                })
            })
            .collect();
    }
}

impl Surface for Grid {
    fn high_dynamic_range(&self) -> bool {
        true
    }

    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let levels = inputs.first().and_then(|v| v.as_str()).unwrap_or("");
        let toggles = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        self.seed = inputs.get(2).and_then(|v| v.as_number()).unwrap_or(0.0);
        if levels != self.levels {
            self.levels = levels.to_string();
            self.rebuild();
        }
        if toggles != self.toggles {
            // toggleAnimation: isAnimating decides, then flips.
            self.toggles = toggles;
            self.animating = !self.animating;
            self.press = Some(self.animating);
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let moving = self
            .squares
            .iter()
            .filter(|s| s.progress.running || s.pending.is_some())
            .count();
        Some(format!(
            "{{\"squares\":{},\"animating\":{},\"moving\":{}}}",
            self.squares.len(),
            self.animating,
            moving
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
        if let Some(start) = self.press.take() {
            self.presses += 1;
            for (i, s) in self.squares.iter_mut().enumerate() {
                if start {
                    let delay = 45.0 * (s.week as f64 + (6.0 - s.day as f64));
                    s.pending = Some((now + delay, 1.0, IN));
                } else {
                    // cancelAnimation: held where it is through the delay.
                    s.progress = Spring::at(s.progress.value);
                    let delay = random(self.seed, self.presses, i) * 500.0;
                    s.pending = Some((now + delay, 0.0, OUT));
                }
            }
        }
        let mut moving = false;
        let c = &mut self.canvas;
        c.begin(frame.scale);
        for s in &mut self.squares {
            match s.pending {
                Some((due, to, config)) if now >= due => {
                    s.pending = None;
                    s.progress.to(to, 0.0, config);
                    s.progress.step(now);
                }
                Some(_) => {
                    s.progress.step(now);
                }
                None => {
                    s.progress.step(now);
                }
            }
            moving |= s.progress.running || s.pending.is_some();
            let (scale, colour) = style(s.progress.value, s.level);
            let [r, g, b] = p3_to_extended_srgb([colour[0], colour[1], colour[2]]);
            let (cx, cy) = (
                s.week as f32 * STEP + SIDE / 2.0,
                s.day as f32 * STEP + SIDE / 2.0,
            );
            c.save();
            c.translate(cx, cy);
            c.scale(scale as f32, scale as f32);
            c.draw_continuous_rrect(
                -SIDE / 2.0,
                -SIDE / 2.0,
                SIDE,
                SIDE,
                RADIUS,
                &Paint::fill(Color([r as f32, g as f32, b as f32, colour[3] as f32])),
            );
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

    #[test]
    fn levels_end_on_their_p3_greens() {
        let (s, c) = style(1.0, 2);
        assert_eq!((s, c), (1.0, [64.0, 196.0, 99.0, 1.0]));
        let (s, c) = style(0.5, 0);
        assert!((s - 0.4).abs() < 1e-12 && c == [235.0, 237.0, 240.0, 1.0]);
        // Display P3 rgb(64, 196, 99) is outside sRGB: its red is below 0.
        assert!(p3_to_extended_srgb([64.0, 196.0, 99.0])[0] < 0.0);
        // White stays white.
        let w = p3_to_extended_srgb([255.0, 255.0, 255.0]);
        assert!(w.iter().all(|v| (v - 1.0).abs() < 1e-4), "{w:?}");
    }

    #[test]
    fn a_press_sweeps_from_the_bottom_left() {
        let mut g = Grid::default();
        g.bind(
            &[
                Value::from("01234..".to_string() + "4321000"),
                Value::Number(1.0),
                Value::Number(7.0),
            ],
            None,
        )
        .unwrap();
        assert_eq!(g.squares.len(), 12);
        // Sunday of week 0 waits 0 ms, Monday 270, week 1's Sunday 45.
        g.press.take();
        assert!(g.animating);
    }

    #[test]
    fn draws_the_squares_where_rn_lays_them_out() {
        use exact_gpu::fixture;
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 34.0,
            height: 119.0,
            scale: 1.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(
            &[
                Value::from("0000000".to_string() + "1.....4"),
                Value::Number(0.0),
                Value::Number(1.0),
            ],
            None,
        )
        .unwrap();
        let (rest, _) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        // Week 0's Monday: level0's grey; week 1's Tuesday: empty.
        assert_eq!(&rest.at(7, 7)[..3], &[235, 237, 240]);
        assert_eq!(rest.at(24, 24)[3], 0);
        // A press: Sunday of week 0 starts at once, week 1's Sunday 45 ms on.
        s.bind(
            &[
                Value::from("0000000".to_string() + "1.....4"),
                Value::Number(1.0),
                Value::Number(1.0),
            ],
            None,
        )
        .unwrap();
        let mut ms = 0.0;
        let mut animating = true;
        while animating && ms < 4000.0 {
            animating = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1;
            ms += 1000.0 / 60.0;
        }
        assert!(!animating, "settles");
        let (done, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        // Level 1 on Monday of week 1: Display P3 rgb(155, 233, 168), in sRGB's gamut as
        // (129, 236, 162).
        let p = done.at(24, 7);
        assert_eq!(&p[..3], &[129, 236, 162]);
    }

    #[test]
    fn random_is_in_range() {
        for i in 0..1000 {
            let r = random(12345.0, 3, i);
            assert!((0.0..1.0).contains(&r));
        }
    }
}
