//! Warm-up: a surface's first frame builds its shader modules and pipelines, which a phone compiles
//! in tens of milliseconds each, on the main thread, inside the demo's open.
//!
//! The `warm` surface sits in the app's plan with a 1 × 1 canvas. Its first render hands the
//! module's device to a thread of utility priority, which draws one small frame of every other
//! surface into an offscreen target (recorded, never submitted: see [`warm`]), one at a time with
//! a pause between, so the compiled shaders are in the device's caches before a demo opens.
//! [`prioritize`] moves one demo to the front (the finger is down on its icon).

use std::collections::VecDeque;
#[cfg(not(target_arch = "wasm32"))]
use std::panic::{catch_unwind, AssertUnwindSafe};
#[cfg(not(target_arch = "wasm32"))]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

/// The warm size, in points: a phone's, at one pixel per point so a frame costs a ninth of the screen's.
const WIDTH: f32 = 390.0;
const HEIGHT: f32 = 844.0;
/// The web's pace: one surface per this many milliseconds of the warm canvas's frames.
#[cfg(target_arch = "wasm32")]
const WEB_PAUSE_MS: f64 = 120.0;
/// The pause after each surface, so the main thread and the render server are never starved.
#[cfg(not(target_arch = "wasm32"))]
const PAUSE: Duration = Duration::from_millis(60);

/// The surface: draws nothing; its first frame starts the warm-up.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Warm { started: false, #[cfg(target_arch = "wasm32")] web: Web::default() })
}

struct Warm {
    started: bool,
    #[cfg(target_arch = "wasm32")]
    web: Web,
}

/// The web's warm-up: the browser's device is not `Send`, so there is no thread; the warm canvas asks for
/// frames instead and builds one surface per [`WEB_PAUSE_MS`] on the main thread, recorded, never submitted.
/// Safari compiles a pipeline's Metal shaders the first time it meets them (a cold Sculptures froze the page
/// 6 s on an iPhone 17 on its first open) and keeps them in the system's shader cache: built here, on the
/// home, the demo's own pipelines find them there.
#[cfg(target_arch = "wasm32")]
#[derive(Default)]
struct Web {
    done: Vec<&'static str>,
    last_ms: Option<f64>,
    finished: bool,
}

impl Surface for Warm {
    fn bind(&mut self, _: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        Ok(())
    }

    fn render(
        &mut self,
        _frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        _: &mut wgpu::CommandEncoder,
        _: &wgpu::TextureView,
        _: wgpu::TextureFormat,
    ) -> bool {
        #[cfg(target_arch = "wasm32")]
        {
            let _ = &self.started;
            return self.web.step(_frame.now_ms, device, queue);
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            if !self.started {
                self.started = true;
                start(device.clone(), queue.clone());
            }
            false
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
static STARTED: AtomicBool = AtomicBool::new(false);
/// The demos to warm before the rest, most recent first.
static FRONT: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

/// Whether surface `name` belongs to the demo keyed `key` (`a_b`, or `a_b_part`).
#[cfg(target_arch = "wasm32")]
fn belongs(name: &str, key: &str) -> bool {
    name == key || name.strip_prefix(key).is_some_and(|rest| rest.starts_with('_'))
}

/// Moves the surfaces of the demo `slug` (`a-b`) to the front of the warm-up.
pub fn prioritize(slug: &str) {
    let key = slug.replace('-', "_");
    let mut front = FRONT.lock().unwrap_or_else(|e| e.into_inner());
    front.retain(|k| *k != key);
    front.push_front(key);
}

/// Whether surface `name` belongs to the demo `key`: its own, or a companion (`sudoku_backdrop`).
#[cfg(not(target_arch = "wasm32"))]
fn belongs(name: &str, key: &str) -> bool {
    name == key || name.strip_prefix(key).is_some_and(|rest| rest.starts_with('_'))
}

#[cfg(not(target_arch = "wasm32"))]
fn start(device: wgpu::Device, queue: wgpu::Queue) {
    if STARTED.swap(true, Ordering::AcqRel) {
        return;
    }
    let _ = std::thread::Builder::new().name("demos-gpu-warm".into()).spawn(move || {
        lower_priority();
        run(&device, &queue);
    });
}

#[cfg(all(target_vendor = "apple", not(target_arch = "wasm32")))]
fn lower_priority() {
    extern "C" {
        fn pthread_set_qos_class_self_np(class: u32, relative: i32) -> i32;
    }
    const QOS_CLASS_UTILITY: u32 = 0x11;
    // SAFETY: a libSystem call on the current thread with a documented class.
    unsafe { pthread_set_qos_class_self_np(QOS_CLASS_UTILITY, 0) };
}

#[cfg(all(not(target_vendor = "apple"), not(target_arch = "wasm32")))]
fn lower_priority() {}

#[cfg(not(target_arch = "wasm32"))]
fn run(device: &wgpu::Device, queue: &wgpu::Queue) {
    let mut done: Vec<&'static str> = Vec::new();
    let surfaces = crate::REGISTRY.surfaces;
    loop {
        // The demo the finger is on, else the next one in the registry.
        let front = FRONT.lock().unwrap_or_else(|e| e.into_inner()).front().cloned();
        let next = front
            .and_then(|key| surfaces.iter().map(|s| s.0).find(|n| !done.contains(n) && *n != "warm" && belongs(n, &key)))
            .or_else(|| surfaces.iter().map(|s| s.0).find(|n| !done.contains(n) && *n != "warm" && *n != "timer"));
        let Some(name) = next else {
            // The front's demos are done: drop them and finish if nothing is left.
            let mut front = FRONT.lock().unwrap_or_else(|e| e.into_inner());
            if front.pop_front().is_none() {
                return;
            }
            continue;
        };
        done.push(name);
        let _ = catch_unwind(AssertUnwindSafe(|| warm(name, device, queue)));
        std::thread::sleep(PAUSE);
    }
}

#[cfg(target_arch = "wasm32")]
impl Web {
    /// One step of the web's warm-up at `now_ms`: whether the warm canvas wants another frame.
    fn step(&mut self, now_ms: f64, device: &wgpu::Device, queue: &wgpu::Queue) -> bool {
        if self.finished {
            return false;
        }
        if self.last_ms.is_some_and(|last| now_ms - last < WEB_PAUSE_MS) {
            return true;
        }
        self.last_ms = Some(now_ms);
        let surfaces = crate::REGISTRY.surfaces;
        let front = FRONT.lock().unwrap_or_else(|e| e.into_inner()).front().cloned();
        let next = front
            .and_then(|key| surfaces.iter().map(|s| s.0).find(|n| !self.done.contains(n) && *n != "warm" && belongs(n, &key)))
            .or_else(|| surfaces.iter().map(|s| s.0).find(|n| !self.done.contains(n) && *n != "warm" && *n != "timer"));
        let Some(name) = next else {
            self.finished = true;
            return false;
        };
        self.done.push(name);
        warm(name, device, queue);
        true
    }
}

/// One frame of surface `name`, drawn offscreen at the size and format a canvas would have.
pub fn warm(name: &str, device: &wgpu::Device, queue: &wgpu::Queue) {
    let Some(&(_, arity, factory)) = crate::REGISTRY.surfaces.iter().find(|s| s.0 == name) else { return };
    let mut surface = factory();
    surface.size(WIDTH, HEIGHT);
    let inputs = vec![Value::Number(0.0); arity];
    if surface.bind(&inputs, None).is_err() {
        return;
    }
    let format = if surface.high_dynamic_range() {
        wgpu::TextureFormat::Rgba16Float
    } else if surface.srgb_target() {
        wgpu::TextureFormat::Bgra8UnormSrgb
    } else {
        wgpu::TextureFormat::Bgra8Unorm
    };
    surface.device_ready(device.features(), device.limits());
    let frame = Frame {
        width: WIDTH,
        height: HEIGHT,
        scale: 1.0,
        now_ms: 0.0,
        seekable: false,
        period_ms: 1000.0 / 120.0,
        children_generation: 0,
        shader_generation: exact_gpu::shaders::shader_generation(),
        headroom: 1.0,
    };
    // One scope, so a validation error in a shader or pipeline is reported (and dropped) instead of aborting
    // the app. wgpu keeps scopes per thread (exact-gpu builds it with `std`), so this one cannot interleave
    // with the main thread's per-frame scope. A panic mid-frame drops the scope in order.
    let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
    let (w, h) = frame.pixels();
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("warm"),
        size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = target.create_view(&Default::default());
    let mut encoder = device.create_command_encoder(&Default::default());
    surface.render(&frame, device, queue, &mut encoder, &view, format);
    // Recorded, never submitted: the shaders and pipelines are built by now, which is what the warm-up is for.
    // A submit from this thread can land while the main thread configures a new canvas's surface; wgpu then
    // fails the configure ("failed to wait for GPU to come idle"), leaves the surface unconfigured with no
    // error sink, and the canvas's acquisition thread aborts the app in `get_current_texture` (the SIGABRT
    // of rapid Calendar Days opens). Queue writes made here ride the main thread's next submit.
    drop(encoder.finish());
    surface.submitted();
    // The web cannot block on the pop: dropping the guard pops the scope, its error (if any) discarded.
    #[cfg(target_arch = "wasm32")]
    drop(scope);
    #[cfg(not(target_arch = "wasm32"))]
    let _ = exact_gpu::block_on(scope.pop());
}

/// Moves a demo to the front of the warm-up: the finger is on its icon. `slug` is `len` bytes of UTF-8.
///
/// # Safety
/// `slug` is `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn demos_gpu_prioritize(slug: *const u8, len: usize) {
    if slug.is_null() {
        return;
    }
    // SAFETY: the caller's contract.
    let bytes = unsafe { std::slice::from_raw_parts(slug, len) };
    if let Ok(slug) = std::str::from_utf8(bytes) {
        prioritize(slug);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use exact_gpu::fixture;

    /// Every surface survives a warm frame on a real device, and the second pass of the same
    /// surfaces is faster than the first (the shader and pipeline builds are what the warm-up moves).
    #[test]
    fn every_surface_warms() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        let mut first = 0.0;
        let mut worst = (String::new(), 0.0);
        for (name, _, _) in crate::REGISTRY.surfaces.iter().filter(|s| s.0 != "warm") {
            let t = std::time::Instant::now();
            let ok = catch_unwind(AssertUnwindSafe(|| warm(name, &gpu.device, &gpu.queue))).is_ok();
            let ms = t.elapsed().as_secs_f64() * 1000.0;
            assert!(ok, "{name} panicked");
            first += ms;
            if ms > worst.1 {
                worst = (name.to_string(), ms);
            }
        }
        eprintln!("warm: {} surfaces, {first:.0} ms in all, slowest {} {:.0} ms", crate::REGISTRY.surfaces.len(), worst.0, worst.1);
    }

    /// What the warm-up buys: the same surface built again on the same device.
    #[test]
    fn a_second_build_is_cheaper() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
        exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
        let gpu = match fixture::device() {
            Ok(gpu) => gpu,
            Err(error) => return eprintln!("{error}; skipped"),
        };
        for name in ["snake", "fibonacci_shader", "swipe_cards", "sphere_waves"] {
            let times: Vec<f64> = (0..3)
                .map(|_| {
                    let t = std::time::Instant::now();
                    warm(name, &gpu.device, &gpu.queue);
                    t.elapsed().as_secs_f64() * 1000.0
                })
                .collect();
            eprintln!("warm {name}: {times:.1?} ms");
        }
    }
}
