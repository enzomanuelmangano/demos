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
//!   and rotateY under no perspective is a horizontal cos θ about the centre.

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

/// The demo's surface (the whole screen).
pub fn surface() -> Box<dyn Surface> {
    Box::new(Stack {
        size: (0.0, 0.0),
        scroll: None,
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct Stack {
    size: (f64, f64),
    scroll: Option<UiScroll>,
    canvas: Canvas,
    renderer: Renderer,
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

impl Stack {
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
        let offset = self.scroll.as_ref().map_or(0.0, |s| s.offset);
        let (w, h) = self.size;
        let (cw, ch) = self.dims();
        let (left, top) = ((w - cw) / 2.0, (h - ch) / 2.0 + PAD);
        // Each card's transform, back to front (zIndex, then the order RN mounts them).
        let mut cards: Vec<(usize, (f64, f64, f64, f64, f64, f64))> = (0..COLORS.len())
            .map(|i| (i, card(offset / cw - (9 - i) as f64, cw, ch)))
            .collect();
        cards.sort_by(|a, b| a.1 .5.partial_cmp(&b.1 .5).unwrap().then(a.0.cmp(&b.0)));
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
        };
        st.ensure();
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
            t += 16.0;
        }
        // A finger moving right flings the inverted list forward by one card at most.
        let card = st.scroll.as_ref().unwrap().offset / 140.0;
        assert!(
            (card - 2.0).abs() < 1e-6 || (card - 1.0).abs() < 1e-6,
            "{card}"
        );
    }
}
