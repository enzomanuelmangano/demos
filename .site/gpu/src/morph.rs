//! The intro's page turn as the RN app runs it (onboarding/index.tsx,
//! pattern-beat.tsx, ghost-scene-core.ts): the pager's scroll on
//! Reanimated's duration spring, the scene's morph easing after it one
//! render frame at a time, and the real board's landing.

/// Reanimated's `withSpring(…, { duration: PAGE_TRAVEL_MS, dampingRatio: 1 })`.
const PAGE_TRAVEL_MS: f64 = 1500.0;
/// GentleSpringConfig's mass, which a duration spring keeps.
const MASS: f64 = 4.0;
const ENERGY_THRESHOLD: f64 = 6e-9;

/// The ghost's render loop: 60 frames a second (GHOST_CEILING_FPS).
pub const TICK_MS: f64 = 1000.0 / 60.0;
/// Per-frame follow factor toward the scroll target; frame-rate dependent.
const MORPH_FOLLOW: f64 = 0.22;
const MORPH_SNAP: f64 = 0.02;
const MORPH_BIAS: f64 = 0.8;
const MORPH_BACK: f64 = 0.14;
const FLAT_ENOUGH: f32 = 0.997;

fn energy(x: f64, v: f64, k: f64) -> f64 {
    0.5 * k * x * x + 0.5 * MASS * v * v
}

/// A critically damped spring from `from` toward `to`, solved as Reanimated
/// solves a duration spring: the stiffness whose energy, 1.5 durations in,
/// is the threshold.
#[derive(Clone, Copy, Debug)]
struct Spring {
    to: f64,
    x0: f64,
    v0: f64,
    omega: f64,
    k: f64,
    e0: f64,
}

impl Spring {
    fn new(from: f64, to: f64, velocity: f64) -> Spring {
        let x0 = from - to;
        // Velocity that would carry the first frame away from the target is dropped.
        let v0 = if (to > from && velocity < 0.0) || (to < from && velocity > 0.0) { 0.0 } else { velocity };
        let settle = PAGE_TRAVEL_MS * 1.5 / 1000.0;
        let diff = |k: f64| {
            let w = (k / MASS).sqrt();
            let decay = (-w * settle).exp();
            let xt = (x0 + (v0 + x0 * w) * settle) * decay;
            let vt = (x0 + (v0 + x0 * w) * settle) * decay * -w + (v0 + x0 * w) * decay;
            energy(xt, vt, k) / energy(x0, v0, k) - ENERGY_THRESHOLD
        };
        // Reanimated's bisectRoot, as written.
        let (mut min, mut max) = (f64::EPSILON, 8e3);
        let precision = ENERGY_THRESHOLD * 1e-3;
        let direction = if diff(max) >= diff(min) { 1.0 } else { -1.0 };
        let mut current = (max + min) / 2.0;
        let mut left = 100;
        while diff(current).abs() > precision && left > 0 {
            left -= 1;
            if diff(current) * direction < 0.0 {
                min = current;
            } else {
                max = current;
            }
            current = (min + max) / 2.0;
        }
        let k = current;
        Spring { to, x0, v0, omega: (k / MASS).sqrt(), k, e0: energy(x0, 0.0, k) }
    }

    /// Position and velocity `t` seconds in, and whether it has come to rest.
    fn at(&self, t: f64) -> (f64, f64, bool) {
        let w = self.omega;
        let decay = (-w * t).exp();
        let x = (self.x0 + (self.v0 + w * self.x0) * t) * decay;
        let v = decay * -w * (self.x0 + (self.v0 + w * self.x0) * t) + decay * (self.v0 + w * self.x0);
        if self.e0 == 0.0 || energy(x, v, self.k) / self.e0 <= ENERGY_THRESHOLD {
            return (self.to, 0.0, true);
        }
        (self.to + x, v, false)
    }
}

/// `withTiming` with an easing, from a value toward a target.
#[derive(Clone, Copy, Debug)]
struct Timing {
    from: f64,
    to: f64,
    start_ms: f64,
    duration_ms: f64,
    out_cubic: bool,
}

impl Timing {
    fn at(&self, now: f64) -> f64 {
        let x = ((now - self.start_ms) / self.duration_ms).clamp(0.0, 1.0);
        let e = if self.out_cubic { 1.0 - (1.0 - x).powi(3) } else { x * x };
        self.from + (self.to - self.from) * e
    }
}

/// The page turn's state, advanced in the ghost's render frames.
#[derive(Clone, Debug)]
pub struct Morph {
    /// The page asked for.
    page: f64,
    /// The pager's position in pages, and its velocity in pages per second.
    scroll: f64,
    velocity: f64,
    spring: Option<(f64, Spring)>,
    /// A released swipe's settle (340 ms out-cubic), instead of the spring.
    glide: Option<Timing>,
    /// A finger holds the pager: `scroll` is where it put it.
    dragging: bool,
    /// The last two finger positions and their clocks, for the release's speed.
    held: [(f64, f64); 2],
    /// The scene's eased morph, `morphNow`.
    now: f64,
    /// The last frame's clock, ms.
    clock: Option<f64>,
    arrived: bool,
    landed: Timing,
    landed_target: i8,
    /// Reduce Motion: the scene's morph is the scroll's, with no follow (ghost-scene-core.ts).
    pub reduced: bool,
}

impl Default for Morph {
    fn default() -> Self {
        Morph {
            page: 0.0,
            scroll: 0.0,
            velocity: 0.0,
            spring: None,
            glide: None,
            dragging: false,
            held: [(0.0, 0.0); 2],
            now: 0.0,
            clock: None,
            arrived: false,
            landed: Timing { from: 0.0, to: 0.0, start_ms: 0.0, duration_ms: 1.0, out_cubic: true },
            landed_target: 0,
            reduced: false,
        }
    }
}

/// What a frame draws from the morph.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    /// The scene's morph, 0 orbit to 1 landed.
    pub t: f32,
    /// The pager in pages (`scrollX / width`), clamped as `morph` is.
    pub scroll: f32,
    /// The real board's landing, 0..1.
    pub landed: f32,
}

impl Morph {
    /// Starts at `page` with nothing moving (a launch, a restore).
    pub fn at_page(page: f64) -> Morph {
        let mut m = Morph::default();
        m.page = page;
        m.scroll = page;
        m.now = if page >= 1.0 { 1.0 } else { 0.0 };
        m.arrived = page >= 1.0;
        m.landed_target = if page >= 1.0 { 1 } else { 0 };
        m.landed = Timing { from: m.landed_target as f64, to: m.landed_target as f64, start_ms: 0.0, duration_ms: 1.0, out_cubic: true };
        m
    }

    /// Where the pager is, pages (the finger's rubber band included).
    pub fn scroll(&self) -> f64 {
        self.scroll
    }

    pub fn page(&self) -> f64 {
        self.page
    }

    /// A tap that turns to `page` at `at_ms`: the spring starts from where the
    /// pager is, keeping its velocity when it already heads there.
    pub fn turn(&mut self, page: f64, at_ms: f64) {
        if page == self.page {
            return;
        }
        if let Some(clock) = self.clock {
            self.advance(at_ms.max(clock));
        }
        self.page = page;
        self.spring = Some((at_ms, Spring::new(self.scroll, page, self.spring_velocity())));
    }

    /// The velocity a new `withSpring` starts with: the running animation's when it is a spring
    /// (Reanimated's `onStart` reads `previousAnimation.velocity`; a timing has none, and a value
    /// a finger set has no animation), else none.
    fn spring_velocity(&self) -> f64 {
        if self.spring.is_some() {
            self.velocity
        } else {
            0.0
        }
    }

    /// A finger moves the pager to `pos` (pages, rubber band included) at `at_ms`:
    /// the scroll is where it says, whatever was animating (onboarding/index.tsx
    /// `onUpdate`, which sets `scrollX` and so cancels its animation).
    pub fn drag(&mut self, pos: f64, at_ms: f64) {
        if let Some(clock) = self.clock {
            self.advance(at_ms.max(clock));
        }
        self.spring = None;
        self.glide = None;
        if !self.dragging {
            self.held = [(pos, at_ms); 2];
        } else {
            self.held = [self.held[1], (pos, at_ms)];
        }
        let (p0, t0) = self.held[0];
        self.velocity = if at_ms > t0 { (pos - p0) / ((at_ms - t0) / 1000.0) } else { 0.0 };
        self.dragging = true;
        self.scroll = pos;
    }

    /// The finger lifts (or the page is turned some other way): toward `page` on
    /// `how` — 0 the tap's spring, 1 a release's 340 ms out-cubic settle, 2 a jump
    /// (Reduce Motion's dip: the page changes under the fade, nothing flies).
    pub fn release(&mut self, page: f64, at_ms: f64, how: u8) {
        if let Some(clock) = self.clock {
            self.advance(at_ms.max(clock));
        }
        self.dragging = false;
        self.page = page;
        let velocity = self.spring_velocity();
        self.spring = None;
        self.glide = None;
        match how {
            1 => {
                self.glide = Some(Timing { from: self.scroll, to: page, start_ms: at_ms, duration_ms: 340.0, out_cubic: true });
            }
            2 => {
                self.scroll = page;
                self.velocity = 0.0;
                let raw = page.clamp(-MORPH_BACK, 1.0);
                self.now = if raw >= 0.0 { raw.powf(MORPH_BIAS) } else { raw };
            }
            _ => {
                self.spring = Some((at_ms, Spring::new(self.scroll, page, velocity)));
            }
        }
    }

    pub fn dragging(&self) -> bool {
        self.dragging
    }

    /// Brings the turn up to `now_ms`, one 60 Hz render frame at a time.
    pub fn advance(&mut self, now_ms: f64) {
        let mut clock = match self.clock {
            Some(c) => c,
            None => {
                self.clock = Some(now_ms);
                self.step(now_ms);
                return;
            }
        };
        // A long gap (a clock jump, a stall) is replayed frame by frame, as
        // the scene would have drawn them; far past, it is only the end.
        if now_ms - clock > 10_000.0 {
            clock = now_ms - 10_000.0;
        }
        while clock + TICK_MS <= now_ms + 1e-6 {
            clock += TICK_MS;
            self.step(clock);
        }
        self.clock = Some(clock);
    }

    fn step(&mut self, now: f64) {
        if let Some(glide) = self.glide {
            let x = glide.at(now);
            self.velocity = (x - self.scroll) / (TICK_MS / 1000.0);
            self.scroll = x;
            if now >= glide.start_ms + glide.duration_ms {
                self.glide = None;
                self.velocity = 0.0;
            }
        }
        if let Some((start, spring)) = self.spring {
            let (x, v, done) = spring.at(((now - start) / 1000.0).max(0.0));
            self.scroll = x;
            self.velocity = v;
            if done {
                self.spring = None;
            }
        }
        let raw = self.scroll.clamp(-MORPH_BACK, 1.0);
        let target = if raw >= 0.0 { raw.powf(MORPH_BIAS) } else { raw };
        if self.reduced {
            self.now = target;
        } else {
            self.now += (target - self.now) * MORPH_FOLLOW;
        }
        if (raw >= 1.0 || raw <= 0.0) && (target - self.now).abs() < MORPH_SNAP {
            self.now = target;
        }
        let t = self.t();
        self.arrived = crate::scene::ease(0.2, 1.0, t) >= FLAT_ENOUGH;
        // pattern-beat: leaving is checked first, against the scroll.
        let next: i8 = if raw < 0.9 {
            0
        } else if self.arrived {
            1
        } else {
            -1
        };
        if next >= 0 && next != self.landed_target {
            let from = self.landed.at(now);
            self.landed = if next == 1 {
                Timing { from, to: 1.0, start_ms: now, duration_ms: 280.0, out_cubic: true }
            } else {
                Timing { from, to: 0.0, start_ms: now, duration_ms: 120.0, out_cubic: false }
            };
            self.landed_target = next;
        }
    }

    fn t(&self) -> f32 {
        if self.now.abs() < 0.001 {
            0.0
        } else {
            self.now as f32
        }
    }

    pub fn frame(&self) -> Frame {
        let now = self.clock.unwrap_or(0.0);
        Frame { t: self.t(), scroll: self.scroll.clamp(-MORPH_BACK, 1.0) as f32, landed: self.landed.at(now) as f32 }
    }

    /// Nothing moves: the pager, the scene and the landing are all at rest.
    pub fn settled(&self) -> bool {
        let now = self.clock.unwrap_or(0.0);
        let raw = self.scroll.clamp(-MORPH_BACK, 1.0);
        let target = if raw >= 0.0 { raw.powf(MORPH_BIAS) } else { raw };
        self.spring.is_none() && self.glide.is_none() && !self.dragging && self.now == target && now >= self.landed.start_ms + self.landed.duration_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_spring_is_reanimateds() {
        let s = Spring::new(0.0, 1.0, 0.0);
        // Solved offline from springUtils.ts for 1500 ms, dampingRatio 1, mass 4.
        assert!((s.omega - 5.4966).abs() < 1e-3, "{}", s.omega);
        let (x, _, _) = s.at(0.5);
        assert!((x - 0.76).abs() < 1e-3, "{x}");
        assert!(s.at(2.3).2);
    }

    #[test]
    fn a_swipe_follows_the_finger_and_settles() {
        let mut m = Morph::at_page(0.0);
        m.advance(0.0);
        m.drag(0.3, 100.0);
        m.advance(200.0);
        assert_eq!(m.frame().scroll, 0.3);
        assert!(!m.settled());
        // Let go short of half way: back to page 0 in 340 ms.
        m.release(0.0, 200.0, 1);
        m.advance(200.0 + 170.0);
        let mid = m.frame().scroll;
        assert!(mid > 0.0 && mid < 0.1, "{mid}");
        m.advance(1500.0);
        assert_eq!(m.frame().scroll, 0.0);
        assert!(m.settled());
        // A full swipe lands.
        m.drag(0.6, 1600.0);
        m.release(1.0, 1650.0, 1);
        m.advance(4000.0);
        let f = m.frame();
        assert_eq!((f.scroll, f.t, f.landed), (1.0, 1.0, 1.0));
    }

    /// A tap's spring keeps a running spring's velocity (Reanimated's `withSpring` over a spring),
    /// and starts from rest over a release's settle (a timing has no velocity) or a finger.
    #[test]
    fn a_tap_inherits_only_a_springs_velocity() {
        let mut m = Morph::at_page(0.0);
        m.advance(0.0);
        m.turn(1.0, 0.0);
        m.advance(400.0);
        let v = m.velocity;
        assert!(v > 0.5, "{v}");
        m.release(1.0, 400.0, 0);
        assert_eq!(m.spring.unwrap().1.v0, v);
        let mut m = Morph::at_page(0.0);
        m.advance(0.0);
        m.drag(0.2, 16.0);
        m.drag(0.4, 32.0);
        m.release(1.0, 32.0, 1);
        m.advance(100.0);
        assert!(m.velocity > 0.0);
        m.release(1.0, 100.0, 0);
        assert_eq!(m.spring.unwrap().1.v0, 0.0);
    }

    /// Reduce Motion: no follow, the morph is the scroll's on the same frame.
    #[test]
    fn reduce_motion_does_not_follow() {
        let mut m = Morph::at_page(0.0);
        m.reduced = true;
        m.advance(0.0);
        m.release(1.0, 0.0, 2);
        m.advance(17.0);
        assert_eq!(m.frame().t, 1.0);
    }

    #[test]
    fn a_turn_lands() {
        let mut m = Morph::at_page(0.0);
        m.advance(0.0);
        m.turn(1.0, 0.0);
        m.advance(4000.0);
        let f = m.frame();
        assert_eq!(f.t, 1.0);
        assert_eq!(f.landed, 1.0);
        assert!(m.settled());
    }
}
