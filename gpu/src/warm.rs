//! Warm-up: a surface's first frame builds its shader modules and pipelines, which a phone compiles
//! in tens of milliseconds each, on the main thread, inside the demo's open.
//!
//! The `warm` surface sits in the app's plan with a 1 × 1 canvas. Its first render hands the
//! module's device to a thread of utility priority, which draws one small frame of every other
//! surface into an offscreen target (recorded, never submitted: see [`warm`]), one at a time with
//! a pause between, so the compiled shaders are in the device's caches before a demo opens.
//! [`prioritize`] moves one demo to the front (the finger is down on its icon).
//!
//! The canvas's one input says whether the home is on top. While a demo is open the thread warms only
//! that demo's surfaces (the front) and waits for the home to come back before the rest: the warm-up
//! took ~25 s of a fifth of a core after launch, all of it spent while the open demo sat still.

use std::collections::VecDeque;
#[cfg(not(target_arch = "wasm32"))]
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

use exact_gpu::wgpu;
use exact_gpu::{Frame, Surface, SurfaceError, Value};

/// The warm size, in points: a phone's, at one pixel per point so a frame costs a ninth of the screen's.
#[cfg(not(target_arch = "wasm32"))]
const WIDTH: f32 = 390.0;
#[cfg(not(target_arch = "wasm32"))]
const HEIGHT: f32 = 844.0;
/// The pause after each surface, so the main thread and the render server are never starved.
#[cfg(not(target_arch = "wasm32"))]
const PAUSE: Duration = Duration::from_millis(60);
/// How often a paused warm-up (a demo is open) looks for the home again.
#[cfg(not(target_arch = "wasm32"))]
const PAUSED_POLL: Duration = Duration::from_millis(250);

/// The surface: draws nothing; its first frame starts the warm-up. Its input: the home is on top.
pub fn surface() -> Box<dyn Surface> {
    Box::new(Warm { started: false })
}

struct Warm {
    started: bool,
}

impl Surface for Warm {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        if let Some(home) = inputs.first().and_then(|v| v.as_bool()) {
            HOME.store(home, Ordering::Release);
        }
        Ok(())
    }

    fn render(
        &mut self,
        _: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        _: &mut wgpu::CommandEncoder,
        _: &wgpu::TextureView,
        _: wgpu::TextureFormat,
    ) -> bool {
        if !self.started {
            self.started = true;
            start(device.clone(), queue.clone());
        }
        false
    }
}

#[cfg(not(target_arch = "wasm32"))]
static STARTED: AtomicBool = AtomicBool::new(false);
/// The home is on top: the warm-up may build every demo, not only the front's.
static HOME: AtomicBool = AtomicBool::new(true);
/// The demos to warm before the rest, most recent first.
static FRONT: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

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
        // The demo the finger is on, else (only while the home is on top) the next one in the registry.
        let rest = |n: &&str| !done.contains(n) && *n != "warm" && *n != "timer";
        let front = FRONT.lock().unwrap_or_else(|e| e.into_inner()).front().cloned();
        let next = front.and_then(|key| surfaces.iter().map(|s| s.0).find(|n| !done.contains(n) && *n != "warm" && belongs(n, &key))).or_else(|| {
            if HOME.load(Ordering::Acquire) {
                surfaces.iter().map(|s| s.0).find(rest)
            } else {
                None
            }
        });
        let Some(name) = next else {
            // The front's demos are done: drop them and look again.
            if FRONT.lock().unwrap_or_else(|e| e.into_inner()).pop_front().is_some() {
                continue;
            }
            // Finished, or a demo is open: wait for the home before the rest.
            if !surfaces.iter().map(|s| s.0).any(|n| rest(&n)) {
                return;
            }
            std::thread::sleep(PAUSED_POLL);
            continue;
        };
        done.push(name);
        let _ = catch_unwind(AssertUnwindSafe(|| warm(name, device, queue)));
        std::thread::sleep(PAUSE);
    }
}

/// The browser's device is not `Send` and compiles shaders itself: no warm-up there.
#[cfg(target_arch = "wasm32")]
fn start(_: wgpu::Device, _: wgpu::Queue) {}

/// One frame of surface `name`, drawn offscreen at the size and format a canvas would have.
#[cfg(not(target_arch = "wasm32"))]
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
