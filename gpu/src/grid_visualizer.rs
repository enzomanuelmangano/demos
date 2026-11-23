//! A 35 × 50 grid of small white squares on black. The squares inside a random number's glyphs
//! spring outward and grow, the others fall back. A tap clears the number; 700 ms later a new
//! random one shows.
//!
//! - The squares are sprites placed between a shrunk and a scaled grid spot by their progress.
//! - The delay springs advance only when the active squares change, and their stiffness is solved
//!   for the duration. The progress springs step every frame, with a 64 ms cap.
//! - Random numbers come from the surface's own seeded generator, so runs repeat.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gestures::Phase;
use draw2d::{point, stops, Canvas, Color, Images, Paint, Rect, Renderer, RsXform, Shader};

use crate::gfx;

const W: f64 = 300.0;
const H: f64 = 340.0;
const HS: usize = 35;
const VS: usize = 50;
const N: usize = HS * VS;
const PAD: f64 = 70.0;
const SQUARE: f64 = 2.5;
const XS: f64 = (W - PAD) / HS as f64;
const YS: f64 = (H - PAD) / VS as f64;
/// Delay before a random number shows after a tap, ms.
const NEXT_MS: f64 = 700.0;

/// One bit per square for each number 0…99 (row-major, LSB first), from generate_masks.
static MASKS: &[u8] = include_bytes!("../images/grid-visualizer/masks.bin");
const MASK_BYTES: usize = N.div_ceil(8);

fn mask(number: usize) -> Vec<bool> {
    let m = &MASKS[number * MASK_BYTES..(number + 1) * MASK_BYTES];
    (0..N).map(|i| m[i / 8] >> (i % 8) & 1 == 1).collect()
}

#[derive(Clone, Copy)]
struct Config {
    mass: f64,
    stiffness: f64,
    damping: f64,
    use_duration: bool,
    duration: f64,
    ratio: f64,
}
const DELAY: Config = Config {
    mass: 4.0,
    stiffness: 900.0,
    damping: 120.0,
    use_duration: true,
    duration: 2000.0,
    ratio: 1.0,
};
const PROGRESS: Config = Config {
    mass: 2.0,
    stiffness: 100.0,
    damping: 10.0,
    use_duration: false,
    duration: 550.0,
    ratio: 1.0,
};
const THRESHOLD: f64 = 6e-9;
const PENDING_PER_FRAME: usize = 100;

fn energy(x: f64, v: f64, k: f64, m: f64) -> f64 {
    0.5 * k * x * x + 0.5 * m * v * v
}

/// The stiffness that settles a spring within its duration, found by bisection.
fn solve_stiffness(x0: f64, v0: f64, c: &Config) -> f64 {
    let settling = c.duration * 1.5 / 1000.0;
    let f = |k: f64| {
        let o = (k / c.mass).sqrt() * c.ratio;
        let d = (-o * settling).exp();
        let xt = (x0 + (v0 + x0 * o) * settling) * d;
        let vt = (x0 + (v0 + x0 * o) * settling) * d * -o + (v0 + x0 * o) * d;
        energy(xt, vt, k, c.mass) / energy(x0, v0, k, c.mass) - THRESHOLD
    };
    let precision = THRESHOLD * 1e-3;
    let (mut lo, mut hi) = (f64::EPSILON, 8e3);
    let dir = if f(hi) >= f(lo) { 1.0 } else { -1.0 };
    let mut k = (lo + hi) / 2.0;
    let mut v = f(k);
    let mut left = 100;
    while v.abs() > precision && left > 0 {
        left -= 1;
        if v * dir < 0.0 {
            lo = k;
        } else {
            hi = k;
        }
        k = (lo + hi) / 2.0;
        v = f(k);
    }
    k
}

/// One spring set, struct-of-arrays: one entry per square.
struct Springs {
    current: Vec<f64>,
    velocity: Vec<f64>,
    to: Vec<f64>,
    start_value: Vec<f64>,
    last: Vec<f64>,
    start: Vec<f64>,
    zeta: Vec<f64>,
    omega0: Vec<f64>,
    omega1: Vec<f64>,
    energy0: Vec<f64>,
    stiffness: Vec<f64>,
    running: Vec<bool>,
    pending: Vec<bool>,
}

impl Springs {
    fn new(initial: Vec<f64>) -> Springs {
        let z = vec![0.0; initial.len()];
        Springs {
            velocity: z.clone(),
            to: z.clone(),
            start_value: z.clone(),
            last: z.clone(),
            start: z.clone(),
            zeta: z.clone(),
            omega0: z.clone(),
            omega1: z.clone(),
            energy0: z.clone(),
            stiffness: z,
            running: vec![false; initial.len()],
            pending: vec![false; initial.len()],
            current: initial,
        }
    }

    /// Advances spring `i`; true once it rests.
    fn step(&mut self, i: usize, now: f64, c: &Config, max_dt: f64) -> bool {
        let to = self.to[i];
        let dt = (now - self.last[i]).max(0.0).min(max_dt);
        self.last[i] = now;
        let t = dt / 1000.0;
        let (v0, x0, zeta, o0) = (
            self.velocity[i],
            self.current[i] - to,
            self.zeta[i],
            self.omega0[i],
        );
        let (x, v) = if zeta < 1.0 {
            let o1 = self.omega1[i];
            let (s1, c1) = (o1 * t).sin_cos();
            let env = (-zeta * o0 * t).exp();
            let frag = env * (s1 * ((v0 + zeta * o0 * x0) / o1) + x0 * c1);
            (
                to + frag,
                -zeta * o0 * frag + env * (c1 * (v0 + zeta * o0 * x0) - o1 * x0 * s1),
            )
        } else {
            let env = (-o0 * t).exp();
            (
                to + env * (x0 + (v0 + o0 * x0) * t),
                env * -o0 * (x0 + (v0 + o0 * x0) * t) + env * (v0 + o0 * x0),
            )
        };
        self.current[i] = x;
        self.velocity[i] = v;
        let e0 = self.energy0[i];
        if e0 == 0.0 || energy(to - x, v, self.stiffness[i], c.mass) / e0 <= THRESHOLD {
            self.velocity[i] = 0.0;
            self.current[i] = to;
            self.last[i] = 0.0;
            self.running[i] = false;
            return true;
        }
        false
    }
}

/// Both spring sets and the rest stiffness cache they share.
struct Sim {
    delay: Springs,
    progress: Springs,
    cache: Option<(f64, f64)>,
    looping: bool,
}

impl Sim {
    fn stiffness(&mut self, x0: f64, v0: f64, c: &Config) -> f64 {
        if v0 == 0.0 {
            if let Some((d, k)) = self.cache {
                if d == c.duration {
                    return k;
                }
            }
        }
        let k = solve_stiffness(x0, v0, c);
        if v0 == 0.0 {
            self.cache = Some((c.duration, k));
        }
        k
    }

    fn cached(&self, c: &Config) -> bool {
        self.cache.is_some_and(|(d, _)| d == c.duration)
    }

    /// Retargets spring `which` (0 delay, 1 progress) to `to`.
    fn set(&mut self, which: u8, i: usize, to: f64, now: f64, c: &Config, defer: bool) {
        let cached = self.cached(c);
        let s = if which == 0 {
            &mut self.delay
        } else {
            &mut self.progress
        };
        let was = s.running[i];
        let value = s.current[i];
        if value == to {
            s.running[i] = false;
            s.pending[i] = false;
            s.velocity[i] = 0.0;
            s.last[i] = 0.0;
            return;
        }
        let twice = was && s.last[i] != 0.0 && s.start[i] != 0.0 && s.to[i] == to;
        let x0 = if twice { s.start_value[i] } else { value - to };
        s.start_value[i] = x0;
        s.to[i] = to;
        let mut v = if was { s.velocity[i] } else { 0.0 };
        if (to > value && v < 0.0) || (to < value && v > 0.0) {
            v = 0.0;
        }
        s.velocity[i] = v;
        if defer && c.use_duration && !twice && !(v == 0.0 && cached) {
            s.pending[i] = true;
            if !was || s.last[i] == 0.0 {
                s.last[i] = now;
            }
            s.start[i] = now;
            s.running[i] = true;
            return;
        }
        s.pending[i] = false;
        let mut k = c.stiffness;
        if !twice {
            let (zeta, o0) = if c.use_duration {
                k = self.stiffness(x0, v, c);
                (c.ratio, (k / c.mass).sqrt())
            } else {
                (
                    c.damping / (2.0 * (c.stiffness * c.mass).sqrt()),
                    (c.stiffness / c.mass).sqrt(),
                )
            };
            let s = if which == 0 {
                &mut self.delay
            } else {
                &mut self.progress
            };
            s.zeta[i] = zeta;
            s.omega0[i] = o0;
            s.omega1[i] = if zeta < 1.0 {
                o0 * (1.0 - zeta * zeta).sqrt()
            } else {
                0.0
            };
        }
        let s = if which == 0 {
            &mut self.delay
        } else {
            &mut self.progress
        };
        s.stiffness[i] = k;
        s.energy0[i] = energy(x0, 0.0, k, c.mass);
        if !was || s.last[i] == 0.0 {
            s.last[i] = now;
        }
        if !twice {
            s.start[i] = now;
        }
        s.running[i] = true;
        s.step(i, now, c, 64.0);
    }

    /// Fixes a deferred delay spring's stiffness and damping once its start is due.
    fn resolve(&mut self, i: usize) {
        let (x0, v) = (self.delay.start_value[i], self.delay.velocity[i]);
        let k = self.stiffness(x0, v, &DELAY);
        let s = &mut self.delay;
        let o0 = (k / DELAY.mass).sqrt();
        s.zeta[i] = DELAY.ratio;
        s.omega0[i] = o0;
        s.omega1[i] = if DELAY.ratio < 1.0 {
            o0 * (1.0 - DELAY.ratio * DELAY.ratio).sqrt()
        } else {
            0.0
        };
        s.stiffness[i] = k;
        s.energy0[i] = energy(x0, 0.0, k, DELAY.mass);
        s.pending[i] = false;
    }

    /// The reaction to a new set of active squares at `now`.
    fn react(&mut self, active: &[bool], now: f64, random: &mut gfx::Random) {
        for i in 0..N {
            if self.delay.pending[i] {
                self.resolve(i);
            }
            if self.delay.running[i] && self.delay.last[i] != now {
                self.delay.step(i, now, &DELAY, f64::INFINITY);
            }
        }
        for (i, &a) in active.iter().enumerate() {
            let to = if a { 1.0 } else { random.next() - 0.5 };
            self.set(0, i, to, now, &DELAY, true);
        }
        for (i, &a) in active.iter().enumerate() {
            let to = if a { self.delay.current[i] } else { 0.0 };
            self.set(1, i, to, now, &PROGRESS, false);
        }
        self.looping = true;
    }

    /// One frame of the loop: whether it goes on.
    fn frame(&mut self, now: f64) -> bool {
        let mut budget = PENDING_PER_FRAME;
        let mut left = 0;
        for i in 0..N {
            if self.delay.pending[i] {
                if budget > 0 {
                    self.resolve(i);
                    budget -= 1;
                } else {
                    left += 1;
                }
            }
        }
        let mut running = false;
        for i in 0..N {
            if !self.progress.running[i] || self.progress.last[i] == now {
                running |= self.progress.running[i];
                continue;
            }
            if !self.progress.step(i, now, &PROGRESS, 64.0) {
                running = true;
            }
        }
        self.looping = running || left > 0;
        self.looping
    }
}

/// The surface. Its one input is the random seed.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Grid {
        random: gfx::Random::new(1.0),
        sim: None,
        text: Some(99),
        reacted: None,
        next: None,
        finger: None,
        window: (0.0, 0.0, 1.0),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        p3: gfx::P3Layer::default(),
        images: None,
    })
}

struct Grid {
    random: gfx::Random,
    sim: Option<Sim>,
    /// The text shown (a number), None after a tap.
    text: Option<usize>,
    /// The text the springs last reacted to (None: not yet).
    reacted: Option<Option<usize>>,
    /// When the next random number shows (a tap's timeout).
    next: Option<f64>,
    finger: Option<u32>,
    /// The window (w, h, scale) of the last frame.
    window: (f64, f64, f64),
    canvas: Canvas,
    renderer: Renderer,
    p3: gfx::P3Layer,
    images: Option<Images>,
}

impl Grid {
    /// The grid canvas's origin in the window.
    fn origin(w: f64, h: f64, scale: f64) -> (f64, f64) {
        let g = |v: f64| (v * scale + 0.5 + 1e-4).floor() / scale;
        (g((w - W) / 2.0), g(10.0 + (h - 10.0 - H) / 2.0))
    }
}

impl Surface for Grid {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if self.sim.is_none() {
            let seed = inputs.first().and_then(|v| v.as_number()).unwrap_or(1.0);
            self.random = gfx::Random::new(seed);
        }
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let moving = self.sim.as_ref().is_some_and(|s| s.looping);
        Some(format!(
            "{{\"text\":{},\"moving\":{moving}}}",
            self.text.map_or("null".to_string(), |t| format!("\"{t}\""))
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id, phase, x, y, ..
        } = *event
        else {
            return;
        };
        // A tap clears the number on release; only a press inside the grid starts one.
        let (w, h, scale) = self.window;
        let (ox, oy) = Grid::origin(w, h, scale);
        let inside = (ox..=ox + W).contains(&(x as f64)) && (oy..=oy + H).contains(&(y as f64));
        match gfx::phase(phase) {
            Phase::Down if self.finger.is_none() && inside => self.finger = Some(id),
            Phase::Up if self.finger == Some(id) => {
                self.finger = None;
                self.text = None;
                self.next = Some(f64::NAN);
            }
            Phase::Cancel if self.finger == Some(id) => self.finger = None,
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
        let now = frame.now_ms;
        if self.sim.is_none() {
            let initial: Vec<f64> = (0..N).map(|_| self.random.next() - 0.5).collect();
            let mut sim = Sim {
                delay: Springs::new(initial),
                progress: Springs::new(vec![0.0; N]),
                cache: None,
                looping: false,
            };
            // Start from no squares, then react to the first number in the same frame.
            sim.react(&vec![false; N], now, &mut self.random);
            self.sim = Some(sim);
        }
        if let Some(at) = self.next {
            if at.is_nan() {
                self.next = Some(now + NEXT_MS);
            } else if now >= at {
                self.next = None;
                self.text = Some((self.random.next() * 100.0).floor() as usize);
            }
        }
        let sim = self.sim.as_mut().unwrap();
        if self.reacted != Some(self.text) {
            self.reacted = Some(self.text);
            let active = self.text.map_or(vec![false; N], mask);
            sim.react(&active, now, &mut self.random);
        } else if sim.looping {
            sim.frame(now);
        }
        let moving = sim.looping || self.next.is_some() || self.finger.is_some();
        if self.images.is_none() {
            let white = draw2d::Image {
                width: 4,
                height: 4,
                pixels: vec![255; 64],
            };
            let images = Images::upload(device, queue, &[&white]);
            self.renderer.set_images(&images);
            self.images = Some(images);
        }
        let (w, h, scale) = (frame.width as f64, frame.height as f64, frame.scale as f64);
        self.window = (w, h, scale);
        let c = &mut self.canvas;
        c.begin(frame.scale);
        // The background canvas: the window's size, 5 pt down.
        let bg_top = (5.0 * scale).round() / scale;
        let g = Shader::Radial {
            center: point((w / 2.0) as f32, (bg_top + h / 2.0) as f32),
            radius: w as f32,
            stops: stops(&[Color::WHITE.alpha(0.1), Color::TRANSPARENT]),
        };
        c.draw_rect(0.0, bg_top as f32, w as f32, h as f32, &Paint::shader(g));
        let (ox, oy) = Grid::origin(w, h, scale);
        let progress = &self.sim.as_ref().unwrap().progress.current;
        let (sx_half, sy_half) = ((XS + PAD) / 2.0, (YS + PAD) / 2.0);
        let (scx, scy) = (W / HS as f64, H / VS as f64);
        let mut sprites = Vec::with_capacity(N);
        let mut xforms = Vec::with_capacity(N);
        for (i, &p) in progress.iter().enumerate() {
            let (col, row) = ((i % HS) as f64, (i / HS) as f64);
            let (stx, sty) = (col * XS + sx_half, row * YS + sy_half);
            let (ctx, cty) = (col * scx + scx / 2.0, row * scy + scy / 2.0);
            let tx = stx + p * (ctx - stx);
            let ty = sty + p * (cty - sty);
            let s = (0.6 + p * (0.85 - 0.6)).clamp(0.6, 0.85);
            sprites.push(Rect::new(0.0, 0.0, SQUARE as f32, SQUARE as f32));
            xforms.push(RsXform {
                scos: s as f32,
                ssin: 0.0,
                tx: (ox + tx) as f32,
                ty: (oy + ty) as f32,
            });
        }
        if let Some(images) = self.images.as_ref() {
            c.draw_atlas(images.image(0), &sprites, &xforms, None, false);
        }
        let (pw, ph) = frame.pixels();
        self.p3.draw(
            &mut self.renderer,
            device,
            queue,
            encoder,
            &self.canvas,
            target,
            format,
            pw,
            ph,
            wgpu::Color::BLACK,
        );
        moving
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    /// Regenerates masks.bin from the font (run with `--ignored` after changing the rule).
    #[test]
    #[ignore]
    fn generate_masks() {
        let font_path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../legacy/assets/fonts/SF-Pro-Rounded-Heavy.otf"
        );
        let data: &'static [u8] = Box::leak(std::fs::read(font_path).unwrap().into_boxed_slice());
        let font = draw2d::Font::new(data, 120.0).unwrap();
        let mut out = vec![0u8; 100 * MASK_BYTES];
        for n in 0..100 {
            let text = n.to_string();
            let b = font.measure_text(&text);
            let (x, y) = (
                W as f32 / 2.0 - b.width / 2.0,
                H as f32 / 2.0 + b.height / 2.0,
            );
            let path = font.text_path(&text, x, y);
            for i in 0..N {
                let tx = (i % HS) as f64 * XS + (XS + PAD) / 2.0;
                let ty = (i / HS) as f64 * YS + (YS + PAD) / 2.0;
                if draw2d::path_contains(
                    &path,
                    (tx + SQUARE / 2.0) as f32,
                    (ty + SQUARE / 2.0) as f32,
                ) {
                    out[n * MASK_BYTES + i / 8] |= 1 << (i % 8);
                }
            }
        }
        std::fs::write(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/images/grid-visualizer/masks.bin"
            ),
            out,
        )
        .unwrap();
    }

    #[test]
    fn the_number_springs_out_and_a_tap_changes_it() {
        assert_eq!(MASKS.len(), 100 * MASK_BYTES);
        let on = mask(99).iter().filter(|&&a| a).count();
        assert!(on > 100 && on < 900, "{on}");
        assert!(mask(1).iter().filter(|&&a| a).count() < on);

        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame {
            width: 420.0,
            height: 912.0,
            scale: 3.0,
            now_ms,
            seekable: true,
            period_ms: 0.0,
            children_generation: 0,
            shader_generation: 0,
            headroom: 1.0,
        };
        let mut s = surface();
        s.bind(&[Value::Number(7.0)], None).unwrap();
        let mut ms = 0.0;
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < 8000.0 {
            ms += 16.7;
        }
        assert!(ms < 8000.0);
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("grid-visualizer-99");
        let touch = |phase, at_ms| InputEvent::Pointer {
            id: 1,
            phase,
            x: 210.0,
            y: 460.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms, shift_key: false, ctrl_key: false, alt_key: false, meta_key: false
        };
        s.input(&touch(PointerPhase::Down, ms));
        s.input(&touch(PointerPhase::Up, ms + 50.0));
        assert_eq!(s.agent("{}").unwrap(), "{\"text\":null,\"moving\":false}");
        let t0 = ms;
        while fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap().1 && ms < t0 + 8000.0 {
            ms += 16.7;
        }
        let a = s.agent("{}").unwrap();
        assert!(
            a.starts_with("{\"text\":\"") && a.ends_with("\"moving\":false}"),
            "{a}"
        );
        let (img, _) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        img.save("grid-visualizer-next");
    }
}
