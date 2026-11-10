//! A `setTimeout` for a demo: Contract runs timers (`after`) only at the app's root, and the
//! iOS host ignores a transition's delay, so a demo whose RN code waits before changing a value
//! (popup-handler's `setTimeout(…, 800)`, a delayed `withTiming`) asks this surface instead.
//! Inputs: `token` (any number; each new non-zero value arms the timer once) and `ms`. When it
//! fires it posts `timer:<token>`. It draws nothing (a transparent 1 × 1 canvas) and wants frames
//! only while a timer is pending: one commit when it fires, none per frame.

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

/// The surface.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Timer::default())
}

#[derive(Default)]
struct Timer {
    token: f64,
    ms: f64,
    /// Armed (None until the next frame stamps it), then due at.
    due: Option<Option<f64>>,
    posted: Vec<String>,
}

impl Surface for Timer {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let token = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        self.ms = inputs.get(1).and_then(|v| v.as_number()).unwrap_or(0.0).max(0.0);
        if token != self.token {
            self.token = token;
            self.due = if token != 0.0 { Some(None) } else { None };
        }
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!("{{\"token\":{},\"pending\":{}}}", self.token, self.due.is_some()))
    }

    fn render(
        &mut self,
        frame: &Frame,
        _device: &wgpu::Device,
        _queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        _format: wgpu::TextureFormat,
    ) -> bool {
        let mut pending = false;
        if let Some(due) = &mut self.due {
            let at = *due.get_or_insert(frame.now_ms + self.ms);
            if frame.now_ms >= at {
                self.due = None;
                self.posted.push(format!("timer:{}", self.token));
            } else {
                pending = true;
            }
        }
        // Nothing to draw: clear the 1 × 1 target.
        drop(encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("timer"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        }));
        pending
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn fires_once_after_its_delay() {
        let mut t = Timer::default();
        t.bind(&[Value::Number(0.0), Value::Number(800.0)], None).unwrap();
        assert!(t.due.is_none(), "token 0 arms nothing");
        t.bind(&[Value::Number(3.0), Value::Number(800.0)], None).unwrap();
        assert!(t.due.is_some());
        t.bind(&[Value::Number(3.0), Value::Number(800.0)], None).unwrap();
        assert_eq!(t.due, Some(None), "the same token does not re-arm");
    }
}
