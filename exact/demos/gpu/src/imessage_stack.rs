//! iMessage Stack (src/animations/imessage-stack: index.tsx, card.tsx): ten pastel cards in a
//! fanned stack driven by an invisible horizontal FlatList; a swipe brings the next card to the
//! front, the one leaving swinging aside and tucking behind.
//!
//! - The FlatList: horizontal, `inverted` (a scaleX −1 flip: the finger's x runs mirrored in
//!   its UIScrollView), snapToInterval CARD_WIDTH with disableIntervalMomentum (one card per fling
//!   at most, from the offset at the lift: `Snap::IntervalCurrent`), decelerationRate fast;
//!   pagingEnabled is overridden by the interval. Its content: paddingHorizontal CARD_WIDTH and
//!   ten CARD_WIDTH cells, so the offset runs 0 … 9 · CARD_WIDTH. It sits in a 0-tall wrapper
//!   (marginBottom CARD_HEIGHT) centred on the screen: top (H − CARD_HEIGHT) / 2, CARD_HEIGHT +
//!   50 tall, the width of the screen. scrollOffset = contentOffset.x.
//! - CARD_WIDTH = window width / 3 and CARD_HEIGHT = CARD_WIDTH / 3 · 4 (module constants).
//! - Each card (index 9 − i for the i-th of CARDS): absolute at left (W − CARD_WIDTH) / 2, top
//!   25 in the cards' layer, radius 20 continuous, its colour (Display P3), boxShadow 0 5 10
//!   rgba(0, 0, 0, 0.08) (RCTBoxShadow: σ 5, circular, outside the view); transform
//!   [translateX, translateY, translateX (swap), scale, rotate, rotateY] interpolated (CLAMP) over
//!   (index − 3 … index + 3) · CARD_WIDTH (the swap and rotateY also at the half steps). Its
//!   wrapper's transformOrigin z is the interpolated zIndex under perspective 10000000: the
//!   cards are depth-sorted on that unrounded value (the perspective itself is below 0.01 px),
//!   and rotateY under no perspective is a horizontal cos θ about the centre. The fans' ties at
//!   the half steps are broken so that no card behind ever swaps mid-swipe: see `depth`.
//! - Haptics (past RN, which plays none: the owner's haptic language): `haptic:selection` each
//!   time the front card (round(offset / CARD_WIDTH)) changes, during the drag and the glide, at
//!   most one per HAPTIC_GAP_MS; `haptic:impact-rigid` once each time the list is pulled or thrown
//!   past an end (the rubber band).

use exact_gpu::wgpu;
use exact_gpu::{Frame, InputEvent, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation};
use skia::{Canvas, Color, Paint, Renderer};

use crate::gfx;
use crate::ui_scroll::{Snap, UiScroll, FAST};

/// index.tsx CARDS.
const COLORS: [u32; 10] = [
    0xF1EEE0, 0xF3D9BC, 0xF4ACB7, 0xF6DFEB, 0xE2F0CB, 0xC7E3D4, 0xAFCBFF, 0xE3DFFF, 0xFFE5E0,
    0xFFD1DC,
];
/// VerticalListPadding.
const PAD: f64 = 25.0;
const RADIUS: f32 = 20.0;
const SHADOW_SIGMA: f32 = 5.0;
const PI: f64 = std::f64::consts::PI;
/// The shortest gap between two selection haptics, ms.
const HAPTIC_GAP_MS: f64 = 40.0;
/// How far past an end (points) the rubber band must pull before its haptic.
const PAST_END: f64 = 2.0;

/// The demo's surface (the whole screen).
pub fn surface() -> Box<dyn Surface> {
    Box::new(Stack {
        size: (0.0, 0.0),
        scroll: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
        front: None,
        past_end: false,
        haptic_at: f64::NEG_INFINITY,
        posted: Vec::new(),
    })
}

struct Stack {
    size: (f64, f64),
    scroll: Option<UiScroll>,
    canvas: Canvas,
    renderer: Renderer,
    /// The front card, and whether the list is past an end (their haptics).
    front: Option<i64>,
    past_end: bool,
    haptic_at: f64,
    posted: Vec<String>,
}

/// A card's transform at `u` = scrollOffset / CARD_WIDTH − index: (translateX, translateY,
/// scale, rotate (rad), rotateY (rad), zIndex).
pub fn card(u: f64, cw: f64, ch: f64) -> (f64, f64, f64, f64, f64, f64) {
    let seven = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
    let nine = [-3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0];
    let i7 = |out: [f64; 7]| interpolate(u, &seven, &out, Extrapolation::Clamp);
    let i9 = |out: [f64; 9]| interpolate(u, &nine, &out, Extrapolation::Clamp);
    let scale = i7([0.75, 0.8, 0.8, 1.0, 0.8, 0.8, 0.75]);
    let rotate = i7([
        -PI / 5.0,
        -PI / 10.0,
        -PI / 20.0,
        0.0,
        PI / 20.0,
        PI / 10.0,
        PI / 5.0,
    ]);
    let tx = i7([
        -cw * 0.3,
        -cw * 0.25,
        -cw * 0.2,
        0.0,
        cw * 0.2,
        cw * 0.25,
        cw * 0.3,
    ]);
    let ty = i7([
        -ch * 0.05,
        -ch * 0.025,
        -ch * 0.04,
        0.0,
        -ch * 0.04,
        -ch * 0.025,
        -ch * 0.02,
    ]);
    let swap = i9([0.0, 0.0, 0.0, -cw / 2.8, 0.0, cw / 2.8, 0.0, 0.0, 0.0]);
    let rotate_y = i9([
        -PI / 10.0,
        -PI / 10.0,
        -PI / 20.0,
        -PI / 5.0,
        0.0,
        PI / 5.0,
        PI / 20.0,
        PI / 10.0,
        PI / 10.0,
    ]);
    let z = i7([0.0, 200.0, 300.0, 400.0, 300.0, 200.0, 0.0]);
    (tx + swap, ty, scale, rotate, rotate_y, z)
}

/// A card's place in the drawing order at `u` with interpolated zIndex `z`: (group, z), drawn
/// in ascending order. RN's zIndex alone is symmetric in u, so the two fans' cards tie at every
/// half step (u = −1.5 and +1.5 both 250) and swap there, while the two front cards have swung
/// apart and the gap between them shows both fans: a card behind popped in front mid-swipe
/// (phone feedback, 2026-11-15). The fans are kept apart instead: the right one (the cards
/// passed, u ≥ 1) under the left one (the cards to come, u ≤ −1), each in zIndex order, and the
/// two cards swapping places (|u| < 1, zIndex above 300) over both, in zIndex order. A card
/// changes group only at |u| = 1, where the front card covers every place the fans overlap, and
/// the two front cards cross at u = ±0.5, apart; no change of order is ever seen.
///
/// Within a group, zIndex ties past |u| = 3, where every card is clamped to the same pose: the
/// nearer card (the smaller |u|) is on top there. Tied on the mounting order, the right fan's
/// farthest card came over the one arriving at u = 3 and the card showing at the fan's end
/// changed colour at each page (phone feedback, 2026-11-15). Drawn from the cards' shapes, a
/// sweep of pages 0 … 9 in 0.01 steps, each frame drawn in the order before and after every
/// change of order, finds no pixel that changes.
fn depth(u: f64, z: f64) -> (u8, f64, f64) {
    let group = if u.abs() < 1.0 {
        2
    } else if u < 0.0 {
        1
    } else {
        0
    };
    (group, z, -u.abs())
}

impl Stack {
    /// Every haptic this surface plays goes through here (`haptic:<name>`, which the
    /// Contract's `heard` plays), so a cheaper haptic path can replace it in one place.
    fn haptic(&mut self, name: &str) {
        self.posted.push(format!("haptic:{name}"));
    }

    /// A selection when the front card changes (one per HAPTIC_GAP_MS at most), a rigid thunk
    /// once per pull past an end.
    fn haptics(&mut self, now: f64) {
        let (cw, _) = self.dims();
        let Some(scroll) = self.scroll.as_ref() else {
            return;
        };
        let (offset, max) = (scroll.offset, scroll.max);
        if cw <= 0.0 {
            return;
        }
        let front = (offset / cw).round().clamp(0.0, (COLORS.len() - 1) as f64) as i64;
        if self.front.is_some_and(|f| f != front) && now - self.haptic_at >= HAPTIC_GAP_MS {
            self.haptic("selection");
            self.haptic_at = now;
        }
        self.front = Some(front);
        if offset < -PAST_END || offset > max + PAST_END {
            if !self.past_end {
                self.haptic("impact-rigid");
            }
            self.past_end = true;
        } else if (0.0..=max).contains(&offset) {
            self.past_end = false;
        }
    }

    fn dims(&self) -> (f64, f64) {
        let cw = self.size.0 / 3.0;
        (cw, cw / 3.0 * 4.0)
    }

    fn ensure(&mut self) {
        let (cw, _) = self.dims();
        let (max, port) = (9.0 * cw, self.size.0);
        match &mut self.scroll {
            Some(s) => {
                s.max = max;
                s.port = port;
                s.snap = Snap::IntervalCurrent(cw);
            }
            None => {
                self.scroll = Some(UiScroll::new(
                    0.0,
                    max,
                    port,
                    FAST,
                    Snap::IntervalCurrent(cw),
                ))
            }
        }
    }
}

impl Surface for Stack {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn wants_input(&self) -> bool {
        true
    }

    fn messages(&mut self) -> Vec<String> {
        crate::haptic::host(std::mem::take(&mut self.posted))
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let (cw, _) = self.dims();
        Some(format!(
            "{{\"offset\":{:.3},\"card\":{:.4}}}",
            offset,
            if cw > 0.0 { offset / cw } else { 0.0 }
        ))
    }

    fn input(&mut self, event: &InputEvent) {
        let InputEvent::Pointer {
            id,
            phase,
            x,
            y,
            at_ms,
            ..
        } = *event
        else {
            return;
        };
        if self.size.0 <= 0.0 {
            return;
        }
        self.ensure();
        let (w, h) = self.size;
        let (_, ch) = self.dims();
        let top = (h - ch) / 2.0;
        let inside =
            (0.0..=w).contains(&(x as f64)) && (top..=top + ch + 2.0 * PAD).contains(&(y as f64));
        // `inverted`: the list is flipped, so its pan reads the finger mirrored.
        if let Some(s) = &mut self.scroll {
            s.input(
                id,
                gfx::phase(phase),
                (w - x as f64) as f32,
                y,
                at_ms,
                inside,
            );
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
        self.size = (frame.width as f64, frame.height as f64);
        self.ensure();
        let moving = self.scroll.as_mut().is_some_and(|s| s.step(frame.now_ms));
        self.haptics(frame.now_ms);
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let (w, h) = self.size;
        let (cw, ch) = self.dims();
        let (left, top) = ((w - cw) / 2.0, (h - ch) / 2.0 + PAD);
        // Each card's transform, back to front: `depth` (see there).
        let mut cards: Vec<(usize, (f64, f64, f64, f64, f64, f64))> = (0..COLORS.len())
            .map(|i| (i, card(offset / cw - (9 - i) as f64, cw, ch)))
            .collect();
        let u = |i: usize| offset / cw - (9 - i) as f64;
        cards.sort_by(|a, b| {
            depth(u(a.0), a.1 .5)
                .partial_cmp(&depth(u(b.0), b.1 .5))
                .unwrap()
                .then(a.0.cmp(&b.0))
        });
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.fill(Color::BLACK);
        let (cwf, chf) = (cw as f32, ch as f32);
        for (i, (tx, ty, scale, rotate, rotate_y, _)) in cards {
            c.save();
            c.translate((left + cw / 2.0 + tx) as f32, (top + ch / 2.0 + ty) as f32);
            c.scale(scale as f32, scale as f32);
            c.rotate(rotate as f32);
            c.scale(rotate_y.cos() as f32, 1.0);
            c.translate(-cwf / 2.0, -chf / 2.0);
            c.save();
            c.clip_with(|b| {
                let e = 4.0 * SHADOW_SIGMA + 5.0;
                skia::add_rect(b, -e, -e, cwf + 2.0 * e, chf + 2.0 * e);
                skia::add_rrect_hole(b, 0.0, 0.0, cwf, chf, RADIUS);
            });
            c.draw_rrect_shadow_local(
                0.0,
                5.0,
                cwf,
                chf,
                RADIUS,
                SHADOW_SIGMA,
                Color::BLACK.alpha(0.08),
            );
            c.restore();
            c.draw_continuous_rrect(
                0.0,
                0.0,
                cwf,
                chf,
                RADIUS,
                &Paint::fill(Color::view_hex(COLORS[i])),
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
            wgpu::Color::BLACK,
        );
        moving || self.scroll.as_ref().is_some_and(|s| s.moving())
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use exact_gpu::PointerKind;

    #[test]
    fn the_front_card_is_index_zero_at_rest() {
        let (tx, ty, s, r, ry, z) = card(0.0, 140.0, 186.667);
        assert_eq!((tx, ty, s, r, ry, z), (0.0, 0.0, 1.0, 0.0, 0.0, 400.0));
        let (_, _, s, _, _, z) = card(1.0, 140.0, 186.667);
        assert_eq!((s, z), (0.8, 300.0));
    }

    #[test]
    fn a_fast_fling_moves_one_card() {
        let mut st = Stack {
            size: (420.0, 912.0),
            scroll: None,
            canvas: Canvas::default(),
            renderer: Renderer::default(),
            front: None,
            past_end: false,
            haptic_at: f64::NEG_INFINITY,
            posted: Vec::new(),
        };
        st.ensure();
        st.haptics(0.0);
        let ev = |phase, x: f32, at: f64| InputEvent::Pointer {
            id: 1,
            phase,
            x,
            y: 456.0,
            dx: 0.0,
            dy: 0.0,
            kind: PointerKind::Touch,
            buttons: 1,
            at_ms: at,
        };
        st.input(&ev(exact_gpu::PointerPhase::Down, 100.0, 0.0));
        for k in 1..=6 {
            st.input(&ev(
                exact_gpu::PointerPhase::Move,
                100.0 + 40.0 * k as f32,
                16.0 * k as f64,
            ));
        }
        st.input(&ev(exact_gpu::PointerPhase::Up, 340.0, 100.0));
        let mut t = 100.0;
        while st.scroll.as_mut().unwrap().step(t) && t < 5000.0 {
            st.haptics(t);
            t += 16.0;
        }
        st.haptics(t);
        // A finger moving right flings the inverted list forward by one card at most.
        let card = st.scroll.as_ref().unwrap().offset / 140.0;
        assert!(
            (card - 2.0).abs() < 1e-6 || (card - 1.0).abs() < 1e-6,
            "{card}"
        );
        // Selections only, at most one per card passed (two inside 40 ms play as one).
        let posted = st.messages();
        assert!(
            !posted.is_empty()
                && posted.len() <= card.round() as usize
                && posted.iter().all(|m| m == "haptic:selection"),
            "{posted:?}"
        );
        // A slow drag left of 600 pt: back a card at a time (a selection each), then past the
        // start, one rigid thunk however long it is held.
        t += 100.0;
        st.input(&ev(exact_gpu::PointerPhase::Down, 400.0, t));
        for k in 1..=40 {
            t += 33.0;
            st.input(&ev(
                exact_gpu::PointerPhase::Move,
                400.0 - 15.0 * k as f32,
                t,
            ));
            st.scroll.as_mut().unwrap().step(t);
            st.haptics(t);
        }
        t += 200.0;
        st.input(&ev(exact_gpu::PointerPhase::Up, -200.0, t));
        let end = t + 5000.0;
        while st.scroll.as_mut().unwrap().step(t) && t < end {
            st.haptics(t);
            t += 16.0;
        }
        st.haptics(t);
        assert!(st.scroll.as_ref().unwrap().offset.abs() < 0.01);
        let mut expected = vec!["haptic:selection".to_string(); card.round() as usize];
        expected.push("haptic:impact-rigid".to_string());
        assert_eq!(st.messages(), expected);
    }

    #[test]
    fn the_fans_never_swap_mid_swipe() {
        let (cw, ch) = (134.0, 178.667);
        // Draw order of every card at a page, back to front, as `render` sorts it.
        let order = |page: f64| {
            let mut v: Vec<usize> = (0..10).collect();
            let u = |i: usize| page - (9 - i) as f64;
            let z = |i: usize| card(u(i), cw, ch).5;
            v.sort_by(|&a, &b| {
                depth(u(a), z(a))
                    .partial_cmp(&depth(u(b), z(b)))
                    .unwrap()
                    .then(a.cmp(&b))
            });
            v
        };
        // Either side of the half step 1.5, where RN's zIndex ties the fans' top cards (7.5 ±
        // 1.5 = cards 6 and 9): the card to come (6, left) stays over the card passed (9, right).
        for page in [1.4, 1.45, 1.5, 1.55, 1.6] {
            let o = order(page);
            let at = |c: usize| o.iter().position(|&x| x == c).unwrap();
            assert!(at(6) > at(9), "{page}: {o:?}");
        }
        // The two swapping cards are on top, and cross at the half step.
        assert_eq!(&order(1.4)[8..], &[7, 8]);
        assert_eq!(&order(1.6)[8..], &[8, 7]);
        // On each side of the front pair the nearer card is always over the farther one, at
        // every page, clamped poses included (page 4.01: card 8 at u 3.01 over card 9 at 4.01).
        let mut page = 0.0;
        while page <= 9.0 {
            let o = order(page);
            let at = |c: usize| o.iter().position(|&x| x == c).unwrap();
            let u = |i: usize| page - (9 - i) as f64;
            for a in 0..10 {
                for b in 0..10 {
                    let same_side = (u(a) >= 1.0 && u(b) >= 1.0) || (u(a) <= -1.0 && u(b) <= -1.0);
                    if same_side && u(a).abs() < u(b).abs() {
                        assert!(at(a) > at(b), "{page}: {a} under {b} in {o:?}");
                    }
                }
            }
            page += 0.01;
        }
    }
}
