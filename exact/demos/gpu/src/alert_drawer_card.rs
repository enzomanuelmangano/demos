//! Alert Drawer's card body (src/animations/alert-drawer/src/components/alert-drawer: index.tsx
//! rCardContainerStyle, styles.ts card): the white card that grows around the pill, drawn under
//! the Contract's content so its corner radius animates as RN's does.
//!
//! - progress = withSpring(isExpanded ? 1 : 0, { dampingRatio: 1, duration: 400 }) (Reanimated's
//!   duration spring, solved from where it is); padding = progress · (EXPANDED_CARD_WIDTH −
//!   BUTTON_WIDTH) / 2.
//! - In the container (EXPANDED_CARD_WIDTH × 300, centred on the screen): bottom 0, left
//!   inset → 0, width BUTTON_WIDTH → EXPANDED_CARD_WIDTH, height 50 → 300 (layout props: Yoga
//!   rounds the edges every frame), borderRadius 50 − padding (continuous; Core Animation draws
//!   min(r, w / 2, h / 2): 25 collapsed, 33.2 open, about 45 at progress 0.3), backgroundColor
//!   interpolateColor('#FFFFFF00' → '#FFFFFF') (alpha linear), boxShadow 0 2 30 rgba(0, 0, 0, 0.1)
//!   (RCTBoxShadow: σ 15, the circular rounded rect, outside the view, whatever its colour).
//!
//! Inputs: isExpanded.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};
use reanimated::{interpolate, interpolate_color, Extrapolation, Spring};
use skia::{Canvas, Color, Paint, Renderer};

use crate::gfx;

const BUTTON_HEIGHT: f64 = 50.0;
const CARD_HEIGHT: f64 = 300.0;
const SHADOW_SIGMA: f32 = 15.0;

/// The card's surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Card {
        expanded: false,
        progress: Spring::at(0.0),
        canvas: Canvas::default(),
        renderer: Renderer::default(),
    })
}

struct Card {
    expanded: bool,
    progress: Spring,
    canvas: Canvas,
    renderer: Renderer,
}

fn grid(v: f64, scale: f64) -> f64 {
    ((v * scale + 0.5 + 1e-4).floor()) / scale
}

/// The card at `p` on a `w` × `h` screen: its frame (pixel-aligned) and drawn radius.
pub fn card(p: f64, w: f64, h: f64, scale: f64) -> ([f64; 4], f64) {
    let (bw, cw) = (w * 0.82, w * 0.9);
    let inset = (cw - bw) / 2.0;
    let lerp = |a: f64, b: f64| interpolate(p, &[0.0, 1.0], &[a, b], Extrapolation::Extend);
    // The container, centred.
    let (cx, cy) = ((w - cw) / 2.0, (h - CARD_HEIGHT) / 2.0);
    let (left, width, height) = (
        lerp(inset, 0.0),
        lerp(bw, cw),
        lerp(BUTTON_HEIGHT, CARD_HEIGHT),
    );
    let top = CARD_HEIGHT - height;
    let (x0, y0) = (grid(cx + left, scale), grid(cy + top, scale));
    let frame = [
        x0,
        y0,
        grid(cx + left + width, scale) - x0,
        grid(cy + CARD_HEIGHT, scale) - y0,
    ];
    let r = (50.0 - p * inset)
        .min(frame[2] / 2.0)
        .min(frame[3] / 2.0)
        .max(0.0);
    (frame, r)
}

impl Surface for Card {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let expanded = inputs.first().and_then(|v| v.as_bool()).unwrap_or(false);
        if expanded != self.expanded {
            self.expanded = expanded;
            gfx::spring_to(
                &mut self.progress,
                if expanded { 1.0 } else { 0.0 },
                400.0,
                1.0,
            );
        }
        Ok(())
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"expanded\":{},\"progress\":{:.4}}}",
            self.expanded, self.progress.value
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
        let p = self.progress.value;
        let ([x, y, w, h], r) = card(
            p,
            frame.width as f64,
            frame.height as f64,
            frame.scale as f64,
        );
        let (x, y, w, h, r) = (x as f32, y as f32, w as f32, h as f32, r as f32);
        let bg = interpolate_color(
            p,
            &[0.0, 1.0],
            &[[255.0, 255.0, 255.0, 0.0], [255.0, 255.0, 255.0, 1.0]],
        );
        let c = &mut self.canvas;
        c.begin(frame.scale);
        c.save();
        c.clip_with(|b| {
            let e = 4.0 * SHADOW_SIGMA;
            skia::add_rect(b, x - e, y - e, w + 2.0 * e, h + 2.0 * e);
            skia::add_rrect_hole(b, x, y, w, h, r);
        });
        c.draw_rrect_shadow(x, y + 2.0, w, h, r, SHADOW_SIGMA, Color::BLACK.alpha(0.1));
        c.restore();
        if bg[3] > 0.0 {
            c.draw_continuous_rrect(
                x,
                y,
                w,
                h,
                r,
                &Paint::fill(Color::WHITE.alpha(bg[3] as f32)),
            );
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
    fn radius_follows_rn() {
        // iPhone Air: the container at (21, 306), 378 × 300.
        let (f, r) = card(0.0, 420.0, 912.0, 3.0);
        assert_eq!((f[1], f[3], r), (556.0, 50.0, 25.0));
        let (_, r) = card(1.0, 420.0, 912.0, 3.0);
        assert!((r - 33.2).abs() < 1e-9);
        // Mid-spring the radius is RN's 50 − padding, not the open one.
        let (_, r) = card(0.3, 420.0, 912.0, 3.0);
        assert!((r - (50.0 - 0.3 * 16.8)).abs() < 1e-9);
    }
}
