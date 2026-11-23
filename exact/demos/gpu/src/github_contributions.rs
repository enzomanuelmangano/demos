//! The grid of GitHub-style contribution squares. Each square animates on its own spring, on the frame clock.
//!
//! - A press starts a square's spring after a delay that staggers the grid by weekday and week.
//!   A reset springs it back to empty after a random delay, from wherever it is.
//! - A square scales down to 0.4 and back up as it fills, and its colour blends from the empty
//!   level to its own level.
//! - Colours are Display P3, so the target is extended sRGB, which keeps the greens outside sRGB.
//!
//! Inputs: levels, one character per calendar day, week by week from Monday: `0` to `4`, or `.` for
//! an empty square; toggles, one per new count; and a seed for the reset's random delays.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use motion::{interpolate, interpolate_color, Extrapolation, Spring, SpringConfig as Config};
use draw2d::{Canvas, Color, Paint, Renderer};

/// Square side, step between squares, and corner radius, pt.
const SIDE: f32 = 14.0;
const STEP: f32 = 17.0;
const RADIUS: f32 = 2.0;
/// Springs for filling and for resetting.
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
/// The GitHub palette, levels 0 to 4, as Display P3 components.
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
    /// A delayed spring: when it starts (ms on the frame clock), its target, and its spring.
    pending: Option<(f64, f64, Config)>,
}

#[derive(Default)]
struct Grid {
    levels: String,
    squares: Vec<Square>,
    toggles: f64,
    seed: f64,
    animating: bool,
    /// A press not yet stamped by a frame: true to fill, false to reset.
    press: Option<bool>,
    presses: u32,
    canvas: Canvas,
    renderer: Renderer,
}

/// A deterministic random number in [0, 1) for the reset, from the seed, the press and the square.
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

/// Display P3 components (0 to 255) as extended sRGB. Values below 0 mean outside sRGB.
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

/// A square's scale and colour at `progress`.
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
                    // Hold the square where it is through the delay.
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
        // This green is outside sRGB, so its red is below 0.
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
        // Delays stagger by weekday and week.
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
        // Week 0's Monday is the empty grey; week 1's Tuesday has no level.
        assert_eq!(&rest.at(7, 7)[..3], &[235, 237, 240]);
        assert_eq!(rest.at(24, 24)[3], 0);
        // A press: week 0's Sunday starts at once, week 1's Sunday 45 ms later.
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
        // Level 1 in Display P3 lands inside sRGB at (129, 236, 162).
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
