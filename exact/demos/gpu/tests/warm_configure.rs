//! The warm-up thread (src/warm.rs) must not make a canvas's surface configure fail. wgpu waits for the
//! device to be idle before it configures a surface and fails the configure when another thread submits
//! meanwhile; the surface is then unconfigured with no error sink, and its first `get_current_texture`
//! aborts the app (the SIGABRT in `exact_gpu::acquire` while Calendar Days opened and closed quickly).
//! Here every surface warms on a thread while this one configures new CAMetalLayer surfaces throughout.
#![cfg(target_os = "macos")]

use exact_gpu::wgpu;
use std::ffi::{c_char, c_void};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[link(name = "QuartzCore", kind = "framework")]
extern "C" {}
#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
}

/// A new CAMetalLayer (+1, leaked: the test's surfaces live until the process ends).
fn metal_layer() -> *mut c_void {
    // SAFETY: `+[CAMetalLayer new]` takes no arguments and returns an object.
    unsafe {
        let send: extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        send(objc_getClass(c"CAMetalLayer".as_ptr()), sel_registerName(c"new".as_ptr()))
    }
}

#[test]
fn a_surface_configured_during_the_warm_up_is_configured() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    exact_gpu::shaders::load_dir(&dir, &demos_gpu::REGISTRY).unwrap();
    let gpu = match exact_gpu::fixture::device() {
        Ok(gpu) => gpu,
        Err(error) => return eprintln!("{error}; skipped"),
    };
    let done = Arc::new(AtomicBool::new(false));
    let warming = {
        let (device, queue, done) = (gpu.device.clone(), gpu.queue.clone(), done.clone());
        std::thread::spawn(move || {
            for (name, _, _) in demos_gpu::REGISTRY.surfaces.iter().filter(|s| s.0 != "warm") {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    demos_gpu::warm::warm(name, &device, &queue)
                }));
            }
            done.store(true, Ordering::SeqCst);
        })
    };
    let (mut configured, mut failed) = (0, Vec::new());
    while !done.load(Ordering::SeqCst) {
        // SAFETY: the layer is never released.
        let target = unsafe {
            gpu.instance
                .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(metal_layer()))
        }
        .unwrap();
        let config = target.get_default_config(&gpu.adapter, 64, 64).unwrap();
        let scope = gpu.device.push_error_scope(wgpu::ErrorFilter::Validation);
        target.configure(&gpu.device, &config);
        configured += 1;
        if let Some(error) = exact_gpu::block_on(scope.pop()) {
            failed.push(error.to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    warming.join().unwrap();
    eprintln!("{configured} surfaces configured during the warm-up, {} failed", failed.len());
    assert!(configured > 0);
    assert!(failed.is_empty(), "{} of {configured} configures failed: {}", failed.len(), failed[0]);
}
