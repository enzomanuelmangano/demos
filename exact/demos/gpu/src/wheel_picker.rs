//! Wheel Picker's DraggableSlider (src/animations/wheel-picker: index.tsx,
//! components/draggable-slider/index.tsx, boundary-gradient, utils/get-lines-path.ts,
//! utils/snap-point.ts): a ruler of 51 grey ticks dragged sideways under a fixed orange
//! indicator, snapping to a tick with a bounce; the expand button respaces the ticks.
//!
//! The canvas is the slider's view: ScreenWidth × scrollableAreaHeight (150). The Skia canvas
//! (ScreenWidth × maxLineHeight 20) sits at paddingTop 150 / 2 − 20 / 2 = 65; the indicator View
//! (lineWidth × 1.4 = 2.1 by maxLineHeight × 1.5 = 30, radius 10 continuous, orange) at left
//! ScreenWidth / 2, top 150 / 2 − 15.
//!
//! - Lines (getLinesPath): i = 0…50 at x = i · spacePerLine (+ scrollOffset), width 1.5, height
//!   20 where i % bigLineIndexOffset (20) == 0 else 10, centred in the 20; rrect radius 10, which
//!   SkRRect scales to 0.75 (half the width). Both paths #c6c6c6 (the big/small split uses
//!   isBigLine's default 10 but only picks which path a line joins: same colour, no overlap).
//! - BoundaryGradient: lineColor is light, so white → transparent ×3 → white across the width.
//!
//! Motion audit (each row matched here):
//! - spacePerLine = withSpring(isExpanded ? 50 : 20, { dampingRatio 1, duration 500 })
//!   (gfx::spring_to: the stiffness solved per start, mass 4).
//! - Pan: onBegin context = scrollOffset, cancelAnimation(scrollOffset). onUpdate scrollOffset =
//!   clamp(context + translationX, −50 · space + W / 2, W / 2), clampedScrollOffset = it. onEnd
//!   scrollOffset = withSpring(snapPoint(scrollOffset, vx, spacings), { mass 0.45, damping 10,
//!   stiffness 100 }) (ζ 0.75: it bounces), clampedScrollOffset = withTiming(snapPoint(…), 50 ms,
//!   inOut(quad)). snapPoint: the spacing nearest value + 0.2 · velocity.
//! - The spacing reaction: on each change keep the tick: index = round((W / 2 − clamped) / prev),
//!   both offsets set to clamp(W / 2 − index · space, −50 · space + W / 2, W / 2).
//! - The progress reaction (on clampedScrollOffset): progress = interpolate(clamped, [W / 2,
//!   W / 2 − 50 · space], [0, 1]); index = floor(progress · 50): a selection haptic when it
//!   changes (previousLineIndex starts at −1); the count = ceil(progress · 50), posted as
//!   `count:<n>` for the Contract's numeric text.

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use gesture_handler::{Event, PanGesture};
use reanimated::{interpolate, Easing, Extrapolation, Spring, SpringConfig, Timing};
use skia::{point, stops, Canvas, Color, Paint, Renderer, Shader};

use crate::gfx;

const LINES: usize = 50;
const AREA_H: f32 = 150.0;
const MAX_LINE: f32 = 20.0;
const MIN_LINE: f32 = 10.0;
const LINE_W: f32 = 1.5;
const BIG_EACH: usize = 20;
/// SkRRect's radius for rrect(1.5 × h, 10, 10): scaled to half the width.
const LINE_R: f32 = LINE_W / 2.0;
const SNAP: SpringConfig = SpringConfig { stiffness: 100.0, damping: 10.0, mass: 0.45 };

/// The demo's surface. Input: isExpanded.
pub fn surface() -> Box<dyn Surface> {
    Box::new(WheelPicker {
        width: 0.0,
        expanded: None,
        space: Spring::at(20.0),
        scroll: Spring::at(0.0),
        clamped: Timing::at(0.0),
        last_clamped: f64::NAN,
        context: 0.0,
        pan: PanGesture::new(),
        line_index: -1,
        count: 0,
        posted: Vec::new(),
        gradient: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct WheelPicker {
    width: f64,
    expanded: Option<bool>,
    /// spacePerLine.
    space: Spring,
    /// scrollOffset, clampedScrollOffset.
    scroll: Spring,
    clamped: Timing,
    /// clampedScrollOffset as the reaction last saw it.
    last_clamped: f64,
    /// scrollContext.
    context: f64,
    pan: PanGesture,
    /// previousLineIndex.
    line_index: i64,
    /// animatedNumber.
    count: i64,
    posted: Vec<String>,
    gradient: Option<Paint>,
    canvas: Canvas,
    renderer: Renderer,
}

/// snapPoint (redash): the point nearest value + 0.2 · velocity, the first of equals.
fn snap_point(value: f64, velocity: f64, w: f64, space: f64) -> f64 {
    let p = value + 0.2 * velocity;
    let mut best = w / 2.0;
    let mut min = f64::INFINITY;
    for i in 0..=LINES {
        let s = w / 2.0 - i as f64 * space;
        let d = (p - s).abs();
        if d < min {
            min = d;
            best = s;
        }
    }
    best
}

impl WheelPicker {
    fn bounds(&self) -> (f64, f64) {
        (-(LINES as f64) * self.space.value + self.width / 2.0, self.width / 2.0)
    }

    /// Both offsets set at once (cancelling their animations).
    fn set_offsets(&mut self, v: f64) {
        self.scroll.set(v);
        self.clamped.set(v);
    }

    /// useAnimatedReaction on clampedScrollOffset.
    fn react(&mut self) {
        let c = self.clamped.value;
        if c == self.last_clamped {
            return;
        }
        let first = self.last_clamped.is_nan();
        self.last_clamped = c;
        if first {
            return;
        }
        let w = self.width;
        let width = LINES as f64 * self.space.value;
        let progress = interpolate(c, &[w / 2.0, -width + w / 2.0], &[0.0, 1.0], Extrapolation::Extend);
        if progress < 0.0 {
            return;
        }
        let index = (progress * LINES as f64).floor() as i64;
        if index != self.line_index {
            self.posted.push("haptic:selection".into());
            self.line_index = index;
        }
        let count = (progress * LINES as f64).ceil() as i64;
        if count != self.count {
            self.count = count;
            self.posted.push(format!("count:{count}"));
        }
    }
}

impl Surface for WheelPicker {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let expanded = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        match self.expanded {
            None => self.space.set(if expanded { 50.0 } else { 20.0 }),
            Some(e) if e != expanded => gfx::spring_to(&mut self.space, if expanded { 50.0 } else { 20.0 }, 500.0, 1.0),
            _ => {}
        }
        self.expanded = Some(expanded);
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"count\":{},\"offset\":{:.2},\"space\":{:.2}}}", self.count, self.scroll.value, self.space.value))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer { id, phase, x, y, at_ms, .. } = *event else { return };
        if self.width <= 0.0 {
            return;
        }
        let inside = (0.0..=self.width as f32).contains(&x) && (0.0..=AREA_H).contains(&y);
        match self.pan.event(id, gfx::phase(phase), x, y, at_ms, inside) {
            Event::Begin { .. } => {
                self.context = self.scroll.value;
                // cancelAnimation(scrollOffset): it stays where it is.
                let v = self.scroll.value;
                self.scroll.set(v);
            }
            Event::Start(p) | Event::Update(p) => {
                let (lo, hi) = self.bounds();
                self.set_offsets((self.context + p.translation_x as f64).clamp(lo, hi));
                self.react();
            }
            Event::End(p) => {
                let (w, s, vx) = (self.width, self.space.value, p.velocity_x as f64);
                self.scroll.to(snap_point(self.scroll.value, vx, w, s), 0.0, SNAP);
                self.clamped.to(snap_point(self.clamped.value, vx, w, s), 50.0, Easing::timing_default());
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
        let w = frame.width as f64;
        if self.width != w {
            self.width = w;
            self.set_offsets(w / 2.0);
            let white = Color::WHITE;
            let clear = Color::rgba8(255, 255, 255, 0);
            self.gradient = Some(Paint::shader(Shader::Linear { start: point(0.0, 0.0), end: point(w as f32, 0.0), stops: stops(&[white, clear, clear, clear, white]) }));
        }
        let now = frame.now_ms;
        // The spacing, then its reaction (keeps the tick), then the offsets and theirs. The
        // progress reaction hears an offset the spacing reaction set one frame later, against
        // that frame's progressWidth (Reanimated runs a reaction a mapper's write dirtied on the
        // next pass): expanding at tick 6 rolls the count 6 → 5 → 6, collapsing 6 → 8 → 7 → 6,
        // as the RN app does (recorded on the sim).
        let prev = self.space.value;
        let mut moving = self.space.step(now);
        self.react();
        if self.space.value != prev {
            let curr = self.space.value;
            let tick = ((w / 2.0 - self.clamped.value) / prev).round();
            let v = (w / 2.0 - tick * curr).clamp(-(LINES as f64) * curr + w / 2.0, w / 2.0);
            self.set_offsets(v);
        }
        moving |= self.scroll.step(now);
        moving |= self.clamped.step(now);
        if self.space.value == prev {
            // A pan's or the snap's offsets are heard this frame (the spacing is at rest).
            self.react();
        }
        moving |= self.clamped.value != self.last_clamped;

        let c = &mut self.canvas;
        c.begin(frame.scale);
        let top = AREA_H / 2.0 - MAX_LINE / 2.0;
        c.save();
        c.clip_rrect(0.0, top, w as f32, MAX_LINE, 0.0);
        let x0 = self.scroll.value as f32;
        let space = self.space.value as f32;
        let paint = Paint::fill(Color::hex(0xC6C6C6));
        for i in 0..=LINES {
            let x = i as f32 * space + x0;
            if x + LINE_W < 0.0 || x > w as f32 {
                continue;
            }
            let h = if i % BIG_EACH == 0 { MAX_LINE } else { MIN_LINE };
            c.draw_rrect(x, top + (MAX_LINE - h) / 2.0, LINE_W, h, LINE_R, &paint);
        }
        if let Some(g) = self.gradient.as_ref() {
            c.save();
            c.translate(0.0, top);
            c.draw_rect(0.0, 0.0, w as f32, MAX_LINE, g);
            c.restore();
        }
        c.restore();
        // The indicator View (RN's 'orange', a Display P3 view colour).
        let (iw, ih) = (LINE_W * 1.4, MAX_LINE * 1.5);
        c.draw_continuous_rrect(w as f32 / 2.0, AREA_H / 2.0 - ih / 2.0, iw, ih, 10.0, &Paint::fill(Color::view_hex(0xFFA500)));
        let (pw, ph) = frame.pixels();
        self.renderer.draw(device, queue, encoder, &self.canvas, target, format, pw, ph, wgpu::Color::TRANSPARENT);
        moving || self.pan.tracking()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::{fixture, PointerKind, PointerPhase};

    #[test]
    fn snap_point_is_redashs() {
        // W 420: spacings 210 − 20 i. 150 + 0.2 · 100 = 170 → 170.
        assert_eq!(snap_point(150.0, 100.0, 420.0, 20.0), 170.0);
        assert_eq!(snap_point(151.0, 0.0, 420.0, 20.0), 150.0);
        // Beyond the ends: the last.
        assert_eq!(snap_point(-2000.0, 0.0, 420.0, 20.0), 210.0 - 1000.0);
    }

    #[test]
    fn dragging_counts_and_snaps_and_expanding_keeps_the_tick() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let frame = |now_ms| Frame { width: 420.0, height: 150.0, scale: 2.0, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 };
        let mut s = surface();
        s.bind(&[Value::Bool(false)], None).unwrap();
        let (rest, animating) = fixture::render(&gpu, s.as_mut(), &frame(0.0)).unwrap();
        rest.save("wheel-picker-rest");
        assert!(!animating);
        // The indicator at x 210…212.1, orange; tick 0 under it (hidden by it), tick 1 at 230.
        let ind = rest.at(421, 150);
        assert!(ind[0] > 240 && ind[1] > 140 && ind[1] < 190 && ind[2] < 40, "{ind:?}");
        let tick = rest.at(461, 150);
        assert!(tick[3] > 100 && tick[0] > 150 && tick[0] < 230, "{tick:?}");
        let finger = |s: &mut Box<dyn Surface>, phase, x, at_ms| {
            s.input(&InputEvent::Pointer { id: 1, phase, x, y: 75.0, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms })
        };
        // Drag left 103 pt slowly; RNGH on iOS leaves UIKit's 10 pt hysteresis out of the
        // translation: offset 210 − 93 → 4.65 lines; the haptics and counts posted.
        finger(&mut s, PointerPhase::Down, 300.0, 0.0);
        for i in 1..=10 {
            finger(&mut s, PointerPhase::Move, 300.0 - 10.3 * i as f32, 30.0 * i as f64);
        }
        finger(&mut s, PointerPhase::Move, 197.0, 600.0);
        let posted = s.messages();
        assert!(posted.contains(&"count:5".to_string()), "{posted:?}");
        assert_eq!(posted.iter().filter(|m| *m == "haptic:selection").count(), 5, "{posted:?}");
        finger(&mut s, PointerPhase::Up, 197.0, 700.0);
        let mut ms = 700.0;
        while ms < 2500.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        // The finger rested 300 ms, but UIKit's velocity is the last move's (343 pt/s, as on RN):
        // snapPoint projects 93 + 0.2 · 343 = 161.6 → 8 lines (offset 50): count 8.
        assert!(s.agent("{}").unwrap().contains("\"count\":8,\"offset\":50.00"), "{}", s.agent("{}").unwrap());
        // Expanding keeps tick 8 (offset 210 − 400 = −190), no count change.
        s.bind(&[Value::Bool(true)], None).unwrap();
        s.messages();
        while ms < 4000.0 {
            ms += 16.0;
            fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        }
        let (expanded, animating) = fixture::render(&gpu, s.as_mut(), &frame(ms)).unwrap();
        expanded.save("wheel-picker-expanded");
        assert!(!animating);
        assert!(s.agent("{}").unwrap().contains("\"count\":8,\"offset\":-190.00,\"space\":50.00"), "{}", s.agent("{}").unwrap());
    }
}
