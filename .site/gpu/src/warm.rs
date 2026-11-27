//! Work paid ahead of a tab's first visit, off the main thread: the GPU half of RN's TabsWarmups
//! (journey-prewarm.ts, journey-gpu-warm.ts compile the road's programs while the app is idle on
//! another tab). Scheduled by events, as RN's gates are, never by counting frames:
//!
//! - [`first_frame`] (the first surface of the launch to render: Home's ghost, Journey's or Arena's
//!   floor) names the device and target to build for, starts the cap's clock and the one waiting
//!   thread, as lib/launch-settled.ts `whenLaunchGhostSettled` counts from its first caller: a launch
//!   with no ghost (another tab in front, Home left before its ghost drew) still gets the work;
//! - [`ghost_settled`] (Home's ghost's entrance played, at once under Reduce Motion, or Home left
//!   before it did: markLaunchGhostSettled, StaggeredMount's "given up on") opens the gate early;
//!   [`GHOST_MAX_WAIT_MS`] after the first frame it opens anyway;
//! - then lib/app-quiet.ts `runWhenQuiet`: the work waits until the player has not moved between
//!   screens for [`QUIET_MS`] ([`navigated`]: Home's ghost shown or hidden, the signal the GPU module
//!   has of a tab or a screen changing).
//!
//! The waiting thread sleeps between looks ([`POLL_MS`], as whenAppQuiet's poll); the work runs on it
//! (journey.rs `warm`). The surfaces that feed it hold a [`Lease`]: while none does (a sign-out, a story
//! unmounted) the waiting thread is stopped at once, and the next surface starts it again if the work
//! was not handed out. The module's threads ([`spawn`]) are joined by [`unload`]. Measured: knowledge-base/journey-tab-built.md "First visit".

#[cfg(not(target_arch = "wasm32"))]
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
#[cfg(not(target_arch = "wasm32"))]
use std::sync::Mutex;
#[cfg(not(target_arch = "wasm32"))]
use std::time::{Duration, Instant};

use exact_gpu::wgpu;

/// lib/launch-settled.ts GHOST_MAX_WAIT_MS: the longest the ghost's gate stays shut.
pub const GHOST_MAX_WAIT_MS: u64 = 8000;
/// lib/app-quiet.ts QUIET_MS: how long the player must not have moved between screens.
pub const QUIET_MS: u64 = 1500;
/// lib/app-quiet.ts POLL_MS: how often the waiting thread looks again.
pub const POLL_MS: u64 = 250;

/// The gate's state, as plain values so its rule is testable with any clock.
#[derive(Default)]
pub struct Gate {
    /// When the launch's first surface rendered (the cap counts from it: the first waiter).
    pub since: Option<f64>,
    /// Its entrance played, or Home was left before it did.
    pub settled: bool,
    /// The last time the player moved between screens.
    pub moved: f64,
    /// The work was handed out.
    pub started: bool,
}

impl Gate {
    /// Whether the work may start at `now` (ms, any clock the other times share).
    pub fn open(&self, now: f64) -> bool {
        let Some(since) = self.since else { return false };
        let settled = self.settled || now - since >= GHOST_MAX_WAIT_MS as f64;
        !self.started && settled && now - self.moved >= QUIET_MS as f64
    }
}

/// What the work is built for: the first surface's device and its canvas's target.
#[cfg(not(target_arch = "wasm32"))]
struct Target {
    device: wgpu::Device,
    queue: wgpu::Queue,
    format: wgpu::TextureFormat,
    scale: f32,
}

#[cfg(not(target_arch = "wasm32"))]
struct State {
    gate: Gate,
    target: Option<Target>,
    epoch: Option<Instant>,
}

#[cfg(not(target_arch = "wasm32"))]
static STATE: Mutex<State> =
    Mutex::new(State { gate: Gate { since: None, settled: false, moved: f64::NEG_INFINITY, started: false }, target: None, epoch: None });

#[cfg(not(target_arch = "wasm32"))]
fn with<R>(f: impl FnOnce(&mut State, f64) -> R) -> R {
    let mut s = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let epoch = *s.epoch.get_or_insert_with(Instant::now);
    let now = epoch.elapsed().as_secs_f64() * 1000.0;
    f(&mut s, now)
}

/// The waiting thread's stop and the start's once, with the count of the surfaces holding a
/// [`Lease`]: one value per module (a test makes its own).
#[cfg(not(target_arch = "wasm32"))]
struct Leases {
    count: AtomicUsize,
    /// Set while no surface holds a lease: the waiting thread ends at once ([`WAKE`]).
    stop: AtomicBool,
    /// Set once [`first_frame`] has started the clock and the thread: every later frame returns
    /// without the lock. Cleared with the last lease while the work has not been handed out, so the
    /// next surface (a sign-in after a sign-out, a story mounted again) starts them again.
    begun: AtomicBool,
}

#[cfg(not(target_arch = "wasm32"))]
impl Leases {
    const fn new() -> Leases {
        Leases { count: AtomicUsize::new(0), stop: AtomicBool::new(false), begun: AtomicBool::new(false) }
    }

    /// A surface took a lease: the first after none clears the stop.
    fn take(&self) {
        if self.count.fetch_add(1, Ordering::SeqCst) == 0 {
            self.stop.store(false, Ordering::SeqCst);
        }
    }

    /// A surface's lease went: the last stops the waiting thread (woken at once, never joined here:
    /// a sign-out must not wait on the main thread) and, when the work was not handed out yet,
    /// lets the next surface's first frame start the clock again. True for the last.
    fn give(&self, state: &Mutex<State>) -> bool {
        if self.count.fetch_sub(1, Ordering::SeqCst) != 1 {
            return false;
        }
        self.stop.store(true, Ordering::SeqCst);
        let mut s = state.lock().unwrap_or_else(|e| e.into_inner());
        if !s.gate.started {
            s.gate.since = None;
            s.gate.settled = false;
            s.target = None;
            self.begun.store(false, Ordering::SeqCst);
        }
        true
    }
}

#[cfg(not(target_arch = "wasm32"))]
static LEASES: Leases = Leases::new();
/// Wakes the waiting thread when the stop is set, rather than after its next POLL_MS.
#[cfg(not(target_arch = "wasm32"))]
static WAKE: std::sync::Condvar = std::sync::Condvar::new();
#[cfg(not(target_arch = "wasm32"))]
static WAKE_LOCK: Mutex<()> = Mutex::new(());
/// The module's threads, joined by [`unload`].
#[cfg(not(target_arch = "wasm32"))]
static THREADS: Mutex<Vec<std::thread::JoinHandle<()>>> = Mutex::new(Vec::new());

/// A thread of the module's (the ghost's GLB and figure, the warm-up), kept to be joined by [`unload`].
/// False when it could not be started (the caller does the work in line).
#[cfg(not(target_arch = "wasm32"))]
pub fn spawn(name: &str, work: impl FnOnce() + Send + 'static) -> bool {
    let Ok(handle) = std::thread::Builder::new().name(name.into()).spawn(work) else { return false };
    let mut all = THREADS.lock().unwrap_or_else(|e| e.into_inner());
    all.retain(|t| !t.is_finished());
    all.push(handle);
    true
}

/// Stops the waiting thread and joins every thread of the module's: for the module's unload
/// (exact-gpu's contract: no symbol outlives the library). Exact gives an app's GPU module no unload
/// callback today (`gpu_unload` only drops the module's surfaces); until it does, the last
/// [`Lease`] stops the waiting thread at once, and the others end with their one piece of work.
#[cfg(not(target_arch = "wasm32"))]
pub fn unload() {
    LEASES.stop.store(true, Ordering::SeqCst);
    {
        let _quiet = WAKE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        WAKE.notify_all();
    }
    let threads = std::mem::take(&mut *THREADS.lock().unwrap_or_else(|e| e.into_inner()));
    for t in threads {
        let _ = t.join();
    }
}

/// Held by each surface that starts or feeds the module's threads (Home's ghost, Journey's and
/// Arena's floors): while none does, the warm-up's thread is stopped (see [`Leases::give`]).
#[cfg(not(target_arch = "wasm32"))]
pub struct Lease(());

#[cfg(not(target_arch = "wasm32"))]
impl Default for Lease {
    fn default() -> Lease {
        LEASES.take();
        Lease(())
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl Drop for Lease {
    fn drop(&mut self) {
        if LEASES.give(&STATE) {
            // Under the waiting thread's lock: it reads the stop under it, so the wake is never missed.
            let _quiet = WAKE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            WAKE.notify_all();
        }
    }
}

/// A surface rendered on `device` into `format` at `scale`. The first of the launch (once per
/// process) keeps the target, starts the cap's clock and the thread that waits for the gate.
#[cfg(not(target_arch = "wasm32"))]
pub fn first_frame(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, scale: f32) {
    if LEASES.begun.swap(true, Ordering::SeqCst) {
        return;
    }
    with(|s, now| {
        s.gate.since = Some(now);
        s.target = Some(Target { device: device.clone(), queue: queue.clone(), format, scale });
    });
    // A failed spawn leaves the work to the first visit.
    spawn("journey-warm", || loop {
        {
            let quiet = WAKE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            if !LEASES.stop.load(Ordering::SeqCst) {
                let _ = WAKE.wait_timeout(quiet, Duration::from_millis(POLL_MS));
            }
        }
        if LEASES.stop.load(Ordering::SeqCst) {
            return;
        }
        let target = with(|s, now| {
            if !s.gate.open(now) {
                return None;
            }
            s.gate.started = true;
            s.target.take().map(|t| (t, now - s.gate.since.unwrap_or(now)))
        });
        if let Some((t, after)) = target {
            let start = Instant::now();
            crate::journey::warm(&t.device, &t.queue, t.format, t.scale);
            // One line per launch, beside exact-gpu's own pipeline-cache line: when it ran and its cost.
            eprintln!(
                "journey warm-up: started {after:.0} ms after the launch's first surface frame, built in {:.0} ms",
                start.elapsed().as_secs_f64() * 1000.0
            );
            return;
        }
    });
}

/// Home's ghost drew its first frame: the launch's first surface frame if none came before it.
#[cfg(not(target_arch = "wasm32"))]
pub fn ghost_drawn(device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat, scale: f32) {
    first_frame(device, queue, format, scale);
}

/// Home's ghost played its entrance (Reduce Motion: its first frame), or Home was left before it did.
#[cfg(not(target_arch = "wasm32"))]
pub fn ghost_settled() {
    with(|s, _| s.gate.settled = true);
}

/// The player moved between screens: Home's ghost was shown or hidden.
#[cfg(not(target_arch = "wasm32"))]
pub fn navigated() {
    with(|s, now| s.gate.moved = now);
}

/// The web: nothing (no threads; the first visit builds as before).
#[cfg(target_arch = "wasm32")]
pub fn first_frame(_device: &wgpu::Device, _queue: &wgpu::Queue, _format: wgpu::TextureFormat, _scale: f32) {}
/// The web: nothing.
#[cfg(target_arch = "wasm32")]
pub fn ghost_drawn(_device: &wgpu::Device, _queue: &wgpu::Queue, _format: wgpu::TextureFormat, _scale: f32) {}
/// The web: nothing.
#[cfg(target_arch = "wasm32")]
pub fn ghost_settled() {}
/// The web: nothing.
#[cfg(target_arch = "wasm32")]
pub fn navigated() {}
/// The web: no threads to join.
#[cfg(target_arch = "wasm32")]
#[derive(Default)]
pub struct Lease(());
/// The web: nothing to join.
#[cfg(target_arch = "wasm32")]
pub fn unload() {}

/// Which device this is, across instances: wgpu's `Device` equality compares an id local to its
/// instance (a test's fixtures, a device recovered from a loss under a new instance, can share it),
/// so the HAL device's address, as exact-gpu's pipeline cache keys its devices. The entries of
/// [`PerDevice`] keep their device alive, so the address is not reused while they are kept.
pub fn device_key(device: &wgpu::Device) -> usize {
    #[cfg(target_vendor = "apple")]
    {
        // SAFETY: only the guard's address is read; the HAL device is neither used nor destroyed.
        if let Some(guard) = unsafe { device.as_hal::<wgpu::hal::api::Metal>() } {
            return &*guard as *const wgpu::hal::metal::Device as usize;
        }
    }
    let _ = device;
    0
}

/// Something built once per device and a variant (a target format, a scale) and shared by every
/// surface of that device: Journey's road programs, its glyph atlas, the floor's pipeline. Only the
/// newest device's entries are kept (one recovered from a loss builds again). On the web (a
/// `Device` there is not `Send`), nothing is shared: each caller builds its own, as before.
#[cfg(not(target_arch = "wasm32"))]
pub struct PerDevice<T>(Mutex<Vec<(usize, wgpu::Device, u64, Arc<T>)>>);
/// The web's: shares nothing.
#[cfg(target_arch = "wasm32")]
pub struct PerDevice<T>(std::marker::PhantomData<fn() -> T>);

#[cfg(target_arch = "wasm32")]
impl<T> PerDevice<T> {
    /// An empty cache, for a `static`.
    pub const fn new() -> Self {
        PerDevice(std::marker::PhantomData)
    }

    /// A new one each time.
    pub fn get(&self, _device: &wgpu::Device, _variant: u64, make: impl FnOnce() -> T) -> Arc<T> {
        Arc::new(make())
    }
}

#[cfg(not(target_arch = "wasm32"))]
impl<T> PerDevice<T> {
    /// An empty cache, for a `static`.
    pub const fn new() -> Self {
        PerDevice(Mutex::new(Vec::new()))
    }

    /// The entry for `device` and `variant`, made by `make` the first time (under the lock: a second
    /// caller, the main thread meeting the warm-up halfway, waits for it rather than building twice).
    pub fn get(&self, device: &wgpu::Device, variant: u64, make: impl FnOnce() -> T) -> Arc<T> {
        let key = device_key(device);
        let mut all = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((_, _, _, t)) = all.iter().find(|(k, d, v, _)| *k == key && d == device && *v == variant) {
            return t.clone();
        }
        let t = Arc::new(make());
        all.retain(|(k, d, _, _)| *k == key && d == device);
        all.push((key, device.clone(), variant, t.clone()));
        t
    }
}

/// The tests that build on fixture devices through a [`PerDevice`] run one at a time: it keeps only
/// the newest device's entries, so another test's device between two calls would evict the first's.
#[cfg(test)]
pub(crate) fn per_device_test() -> std::sync::MutexGuard<'static, ()> {
    static ONE: Mutex<()> = Mutex::new(());
    ONE.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gate() -> Gate {
        Gate { moved: f64::NEG_INFINITY, ..Gate::default() }
    }

    #[test]
    fn shut_until_a_surface_has_rendered() {
        assert!(!gate().open(1e9));
    }

    #[test]
    fn opens_when_the_ghost_settles_and_the_player_is_still() {
        // Reduce Motion: drawn and settled on the same frame, nothing moved: at once.
        let mut g = gate();
        g.since = Some(1000.0);
        assert!(!g.open(1000.0));
        g.settled = true;
        assert!(g.open(1000.0));
        g.started = true;
        assert!(!g.open(1001.0), "handed out once");
    }

    #[test]
    fn a_move_between_screens_holds_it_for_quiet_ms() {
        // Home left at 2 s, before the entrance played (or before the ghost drew): settled (given up),
        // then quiet from there.
        let mut g = gate();
        g.since = Some(1000.0);
        g.settled = true;
        g.moved = 2000.0;
        assert!(!g.open(2000.0 + QUIET_MS as f64 - 1.0));
        assert!(g.open(2000.0 + QUIET_MS as f64));
    }

    #[test]
    fn journey_tapped_at_one_second_still_gets_the_work() {
        // No ghost ever drew (Journey opened before it): the cap counts from Journey's floor's first frame.
        let mut g = gate();
        g.since = Some(1000.0);
        g.moved = 1000.0;
        assert!(!g.open(1000.0 + GHOST_MAX_WAIT_MS as f64 - 1.0));
        assert!(g.open(1000.0 + GHOST_MAX_WAIT_MS as f64));
    }

    #[test]
    fn a_lease_taken_again_starts_the_warm_up_again() {
        // A sign-out (every lease gone) before the work was handed out, then a sign-in.
        let leases = Leases::new();
        let state = Mutex::new(State { gate: gate(), target: None, epoch: None });
        leases.take();
        leases.begun.store(true, Ordering::SeqCst);
        state.lock().unwrap().gate.since = Some(1000.0);
        assert!(leases.give(&state), "the last lease");
        assert!(leases.stop.load(Ordering::SeqCst), "the waiting thread stops");
        assert!(!leases.begun.load(Ordering::SeqCst), "the next first frame starts it again");
        assert_eq!(state.lock().unwrap().gate.since, None);
        leases.take();
        assert!(!leases.stop.load(Ordering::SeqCst), "a new lease clears the stop");
        // Once handed out, the work is not done twice.
        state.lock().unwrap().gate.started = true;
        leases.begun.store(true, Ordering::SeqCst);
        leases.take();
        assert!(!leases.give(&state));
        assert!(leases.give(&state));
        assert!(leases.begun.load(Ordering::SeqCst));
    }

    #[test]
    fn the_cap_opens_it_without_a_settle() {
        let mut g = gate();
        g.since = Some(1000.0);
        assert!(!g.open(1000.0 + GHOST_MAX_WAIT_MS as f64 - 1.0));
        assert!(g.open(1000.0 + GHOST_MAX_WAIT_MS as f64));
    }
}
