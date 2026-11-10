//! Dot Sheet's card (src/animations/dot-sheet/src/components/card-input.tsx): the white card
//! behind the text field, whose frame, rotation and corner radius all interpolate one progress.
//!
//! - progress = withSpring(focused ? 1 : 0, { duration: 800, dampingRatio: 1 }) from onFocus /
//!   onBlur of the field: Reanimated's duration spring (mass 4) solved from where it is.
//! - rCardStyle: top (h − h / 2.8) / 2 + 35 → safeTop + DEMO_BUTTON_ROW_HEIGHT (56) + 52, left
//!   (w − h / 2.8 · 3/4) / 2 → 1, height h / 2.8 → h, width h / 2.8 · 3/4 → w − 2, rotate −4° → 0°,
//!   borderRadius 16 → 32 (continuous). They are layout props: Yoga lays the card out every
//!   frame, its edges rounded to the pixel grid; the rotation turns it about its centre.
//! - styles.card: #fff, boxShadow 0 0 20 rgba(193, 193, 193, 0.1) (RCTBoxShadow: σ 10, the
//!   circular rounded rect, drawn outside the view), zIndex 1.
//! - onTouchEnd focuses the field only when progress is exactly 0: the surface posts
//!   `card:rest` when the spring lands at 0 and `card:moving` when it leaves it, so the Contract
//!   ignores a tap on a card still closing.
//!
//! Inputs: open (the field has focus), safeTop.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, Extrapolation, Spring};
use skia::{Canvas, Color, Paint, Renderer};

use crate::gfx;

/// DEMO_BUTTON_ROW_HEIGHT, potentialHeaderHeight.
const BUTTON_ROW: f64 = 56.0;
const HEADER: f64 = 52.0;
const SHADOW_SIGMA: f32 = 10.0;

/// The card's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Card {
        open: false,
        safe_top: 0.0,
        progress: Spring::at(0.0),
        at_rest: true,
        posted: Vec::new(),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct Card {
    open: bool,
    safe_top: f64,
    progress: Spring,
    at_rest: bool,
    posted: Vec<String>,
    canvas: Canvas,
    renderer: Renderer,
}

/// Yoga's rounding of a layout edge to the pixel grid.
fn grid(v: f64, scale: f64) -> f64 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// The card at `p`: its pixel-aligned frame, rotation (degrees) and radius.
pub fn card(p: f64, w: f64, h: f64, safe_top: f64, scale: f64) -> ([f64; 4], f64, f64) {
    let lerp = |a: f64, b: f64| interpolate(p, &[0.0, 1.0], &[a, b], Extrapolation::Extend);
    let (ih, iw) = (h / 2.8, h / 2.8 * (3.0 / 4.0));
    let top = lerp((h - ih) / 2.0 + 35.0, safe_top + BUTTON_ROW + HEADER);
    let left = lerp((w - iw) / 2.0, 1.0);
    let (ch, cw) = (lerp(ih, h), lerp(iw, w - 2.0));
    let (x0, y0) = (grid(left, scale), grid(top, scale));
    let frame = [
        x0,
        y0,
        grid(left + cw, scale) - x0,
        grid(top + ch, scale) - y0,
    ];
    (frame, lerp(-4.0, 0.0), lerp(16.0, 32.0))
}

impl Surface for Card {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let open = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        self.safe_top = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0);
        if open != self.open {
            self.open = open;
            gfx::spring_to(&mut self.progress, if open { 1.0 } else { 0.0 }, 800.0, 1.0);
        }
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"open\":{},\"progress\":{:.4},\"rest\":{}}}",
            self.open, self.progress.value, self.at_rest
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
        let moving = self.progress.step(frame.now_ms);
        let rest = !moving && self.progress.value == 0.0;
        if rest != self.at_rest {
            self.at_rest = rest;
            self.posted
                .push(if rest { "card:rest" } else { "card:moving" }.into());
        }
        let s = frame.scale as f64;
        let ([x, y, w, h], deg, r) = card(
            self.progress.value,
            frame.width as f64,
            frame.height as f64,
            self.safe_top,
            s,
        );
        let (x, y, w, h, r) = (
            x as f32,
            y as f32,
            w as f32,
            h as f32,
            (r as f32).min(w as f32 / 2.0).min(h as f32 / 2.0),
        );
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.save();
        c.translate(x + w / 2.0, y + h / 2.0);
        c.rotate((deg as f32).to_radians());
        c.translate(-w / 2.0, -h / 2.0);
        // RCTBoxShadow: outside the view's circular rounded rect.
        c.save();
        c.clip_with(|b| {
            let e = 4.0 * SHADOW_SIGMA;
            skia::add_rect(b, -e, -e, w + 2.0 * e, h + 2.0 * e);
            skia::add_rrect_hole(b, 0.0, 0.0, w, h, r);
        });
        c.draw_rrect_shadow_local(
            0.0,
            0.0,
            w,
            h,
            r,
            SHADOW_SIGMA,
            Color::view_hex(0xC1C1C1).alpha(0.1),
        );
        c.restore();
        c.draw_continuous_rrect(0.0, 0.0, w, h, r, &Paint::fill(Color::WHITE));
        c.restore();
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
    fn rests_and_opens_as_rn() {
        // iPhone Air, safeTop 68: open at (1, 176), 418 × 912 (RN measure: the field at 17, 200).
        let (f, deg, r) = card(1.0, 420.0, 912.0, 68.0, 3.0);
        assert_eq!((f[0], f[1], f[2], deg, r), (1.0, 176.0, 418.0, 0.0, 32.0));
        let (f, deg, r) = card(0.0, 420.0, 912.0, 68.0, 3.0);
        assert!((f[3] - 912.0 / 2.8).abs() < 0.34 && deg == -4.0 && r == 16.0);
    }

    #[test]
    fn posts_rest_and_moving() {
        let mut c = surface();
        c.bind(&[Value::Bool(true), Value::Number(68.0)], None)
            .unwrap();
        assert!(c.agent("").unwrap().contains("\"open\":true"));
    }
}
