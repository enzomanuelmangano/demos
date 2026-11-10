//! A `setTimeout` for a demo: Contract runs timers (`after`) only at the app's root, and the
//! iOS host ignores a transition's delay, so a demo whose RN code waits before changing a value
//! (popup-handler's `setTimeout(…, 800)`, a delayed `withTiming`) asks this surface instead.
//! Inputs: `token` (any number; each new non-zero value arms the timer once) and `ms`. When it
//! fires it posts `timer:<token>`. It draws nothing (a transparent 1 × 1 canvas) and wants frames
//! only while a timer is pending: one commit when it fires, none per frame.
//!
//! The web host (Exact's JS runtime) delivers no surface message: its `message=` hears only an
//! iframe's guest, and the GPU glue's `exact.message` is the wasm host's alone, so a post there
//! throws. On wasm32 the timer publishes instead: `exactSurface("timer")` is `{ "fired": [...] }`,
//! the last token each live timer fired (the root hands it to the demos as `env.timers`). A
//! surface name has one publisher, the first live instance, so the instances share the list and
//! every one renders while any is pending or has not published the latest list. iOS keeps the
//! message and publishes nothing.

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
    #[cfg(target_arch = "wasm32")]
    shared: web::Seat,
}

/// The web's channel: the live timers' fired tokens, one list for every instance.
#[cfg(target_arch = "wasm32")]
mod web {
    use std::cell::RefCell;

    #[derive(Default)]
    struct Board {
        next: u64,
        version: u64,
        pending: u32,
        fired: Vec<(u64, f64)>,
    }
    thread_local! { static BOARD: RefCell<Board> = RefCell::new(Board::default()); }

    /// One instance's place on the board: its id and the list version it last published.
    pub(super) struct Seat {
        id: u64,
        seen: u64,
        pending: bool,
    }

    impl Default for Seat {
        fn default() -> Self {
            let id = BOARD.with(|b| {
                let mut b = b.borrow_mut();
                b.next += 1;
                b.next
            });
            Seat {
                id,
                seen: 0,
                pending: false,
            }
        }
    }

    impl Seat {
        pub(super) fn set_pending(&mut self, on: bool) {
            if on != self.pending {
                self.pending = on;
                BOARD.with(|b| {
                    let mut b = b.borrow_mut();
                    if on {
                        b.pending += 1
                    } else {
                        b.pending -= 1
                    }
                });
            }
        }
        pub(super) fn fire(&mut self, token: f64) {
            BOARD.with(|b| {
                let mut b = b.borrow_mut();
                b.fired.retain(|(id, _)| *id != self.id);
                b.fired.push((self.id, token));
                b.version += 1;
            });
        }
        /// Whether this instance wants another frame: a timer is pending anywhere, or the list
        /// changed since this instance published it.
        pub(super) fn wants_frame(&self) -> bool {
            BOARD.with(|b| {
                let b = b.borrow();
                b.pending > 0 || b.version != self.seen
            })
        }
        pub(super) fn published(&mut self) -> Option<String> {
            BOARD.with(|b| {
                let b = b.borrow();
                if b.version == self.seen {
                    return None;
                }
                self.seen = b.version;
                let tokens: Vec<String> = b.fired.iter().map(|(_, t)| t.to_string()).collect();
                Some(format!("{{\"fired\":[{}]}}", tokens.join(",")))
            })
        }
    }

    impl Drop for Seat {
        fn drop(&mut self) {
            self.set_pending(false);
            BOARD.with(|b| {
                let mut b = b.borrow_mut();
                let before = b.fired.len();
                b.fired.retain(|(id, _)| *id != self.id);
                if b.fired.len() != before {
                    b.version += 1;
                }
            });
        }
    }
}

impl Surface for Timer {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let token = inputs.first().and_then(|v| v.as_number()).unwrap_or(0.0);
        self.ms = inputs
            .get(1)
            .and_then(|v| v.as_number())
            .unwrap_or(0.0)
            .max(0.0);
        if token != self.token {
            self.token = token;
            self.due = if token != 0.0 { Some(None) } else { None };
            #[cfg(target_arch = "wasm32")]
            self.shared.set_pending(self.due.is_some());
        }
        Ok(())
    }

    fn messages(&mut self) -> Vec<String> {
        std::mem::take(&mut self.posted)
    }

    #[cfg(target_arch = "wasm32")]
    fn published(&mut self) -> Option<String> {
        self.shared.published()
    }

    fn agent(&mut self, _request: &str) -> Option<String> {
        Some(format!(
            "{{\"token\":{},\"pending\":{}}}",
            self.token,
            self.due.is_some()
        ))
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
                #[cfg(not(target_arch = "wasm32"))]
                self.posted.push(format!("timer:{}", self.token));
                #[cfg(target_arch = "wasm32")]
                self.shared.fire(self.token);
            } else {
                pending = true;
            }
        }
        #[cfg(target_arch = "wasm32")]
        {
            self.shared.set_pending(pending);
            pending = pending || self.shared.wants_frame();
        }
        // Nothing to draw: clear the 1 × 1 target.
        drop(encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("timer"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
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
        t.bind(&[Value::Number(0.0), Value::Number(800.0)], None)
            .unwrap();
        assert!(t.due.is_none(), "token 0 arms nothing");
        t.bind(&[Value::Number(3.0), Value::Number(800.0)], None)
            .unwrap();
        assert!(t.due.is_some());
        t.bind(&[Value::Number(3.0), Value::Number(800.0)], None)
            .unwrap();
        assert_eq!(t.due, Some(None), "the same token does not re-arm");
    }
}
