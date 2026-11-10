//! CPU time per frame of the heaviest Skia surfaces: what `Surface::render` costs on the CPU
//! (recording the canvas, tessellating it, writing its buffers and encoding its passes), the
//! GPU's own time excluded. Each surface runs a scripted interaction so that it redraws
//! something that moves.
//!
//! `cargo test --release -p demos-gpu bench -- --ignored --nocapture` prints, per surface, the
//! minimum, median and 90th percentile of the thread's CPU time in microseconds over `BENCH_FRAMES` frames (default 300).

use exact_gpu::{fixture, wgpu, Frame, InputEvent, PointerKind, PointerPhase, Surface, Value};

/// This thread's CPU time in microseconds (what the frame cost, not what the scheduler took).
#[cfg(target_vendor = "apple")]
fn cpu_us() -> f64 {
    extern "C" {
        fn clock_gettime_nsec_np(clock: u32) -> u64;
    }
    // CLOCK_THREAD_CPUTIME_ID.
    unsafe { clock_gettime_nsec_np(16) as f64 / 1e3 }
}
#[cfg(not(target_vendor = "apple"))]
fn cpu_us() -> f64 {
    use std::sync::OnceLock;
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed().as_secs_f64() * 1e6
}

fn frame(w: f32, h: f32, scale: f32, now_ms: f64) -> Frame {
    Frame { width: w, height: h, scale, now_ms, seekable: true, period_ms: 0.0, children_generation: 0, shader_generation: exact_gpu::shaders::shader_generation(), headroom: 1.0 }
}

fn pointer(id: u32, phase: PointerPhase, x: f32, y: f32, at_ms: f64) -> InputEvent {
    InputEvent::Pointer { id, phase, x, y, dx: 0.0, dy: 0.0, kind: PointerKind::Touch, buttons: 1, at_ms }
}

/// One surface's script: its frame size, a setup, and what happens before frame `i` (at `ms`).
struct Case {
    name: &'static str,
    make: fn() -> Box<dyn Surface>,
    size: (f32, f32, f32),
    setup: fn(&mut dyn Surface),
    tick: fn(&mut dyn Surface, usize, f64),
}

fn cases() -> Vec<Case> {
    vec![
        Case {
            name: "spiral",
            make: crate::spiral::surface,
            size: (420.0, 912.0, 3.0),
            setup: |_| {},
            // A tap every 120 frames: all 1641 circles spring to a new angle.
            tick: |s, i, ms| {
                if i % 120 == 1 {
                    s.input(&pointer(1, PointerPhase::Down, 200.0, 400.0, ms));
                    s.input(&pointer(1, PointerPhase::Up, 200.0, 400.0, ms + 1.0));
                }
            },
        },
        Case {
            name: "radar-chart",
            make: crate::radar_chart::surface,
            size: (400.0, 400.0, 3.0),
            setup: |s| s.bind(&[1.0, 0.6, 0.1, 0.1, 0.5, 0.2, 0.1, 0.5, 0.9, 0.8].map(Value::Number), None).unwrap(),
            // New data every 60 frames: the polygons spring.
            tick: |s, i, ms| {
                if i % 60 == 0 {
                    let k = (i / 60) as f64;
                    let v: [f64; 10] = std::array::from_fn(|j| 0.1 + 0.8 * (((j as f64 + 1.0) * (k + 1.0) * 0.37).sin() * 0.5 + 0.5));
                    s.bind(&v.map(Value::Number), Some(ms)).unwrap();
                }
            },
        },
        Case {
            name: "slide-to-reveal",
            make: crate::slide_to_reveal::surface,
            size: (252.0, 80.0, 3.0),
            setup: |_| {},
            // A finger sliding back and forth across the digits.
            tick: |s, i, ms| {
                let x = 20.0 + 210.0 * (((i as f32) * 0.05).sin() * 0.5 + 0.5);
                let phase = if i == 0 { PointerPhase::Down } else { PointerPhase::Move };
                s.input(&pointer(1, phase, x, 45.0, ms));
            },
        },
        Case {
            name: "sphere-waves",
            make: crate::sphere_waves::surface,
            size: (420.0, 912.0, 3.0),
            setup: |_| {},
            tick: |_, _, _| {},
        },
        Case {
            name: "the-little-prince",
            make: crate::the_little_prince::surface,
            size: (420.0, 912.0, 3.0),
            setup: |s| s.bind(&[Value::Number(3.0), Value::Bool(false)], None).unwrap(),
            // The page flies into the picture and back, every 150 frames.
            tick: |s, i, _| {
                if i % 150 == 0 {
                    s.bind(&[Value::Number(3.0), Value::Bool((i / 150) % 2 == 0)], None).unwrap();
                }
            },
        },
        Case {
            name: "steddy-graph-interaction",
            make: crate::steddy_graph_interaction::surface,
            size: (420.0, 200.0, 3.0),
            setup: |s| s.bind(&[Value::Number(1.0)], None).unwrap(),
            tick: |s, i, _| {
                if i % 60 == 0 {
                    s.bind(&[Value::Number(((i / 60) % 3) as f64)], None).unwrap();
                }
            },
        },
        Case {
            name: "telegram-theme-switch",
            make: crate::telegram_theme_switch::surface,
            size: (420.0, 912.0, 3.0),
            setup: |s| s.bind(&[Value::Number(34.0)], None).unwrap(),
            // A tap on the switch every 120 frames: the reveal runs most of the time.
            tick: |s, i, ms| {
                if i % 120 == 0 {
                    let (x, y) = (420.0 - 90.0 + 40.0, 912.0 - 95.0 - 100.0 + 40.0);
                    s.input(&pointer(1, PointerPhase::Down, x, y, ms));
                    s.input(&pointer(1, PointerPhase::Up, x, y, ms + 60.0));
                }
            },
        },
    ]
}

/// Minimum, median and p90 CPU microseconds of `render` over `frames` frames of `case`.
fn measure(gpu: &exact_gpu::Gpu, case: &Case, frames: usize) -> (f64, f64, f64) {
    let (w, h, scale) = case.size;
    let format = wgpu::TextureFormat::Rgba8Unorm;
    let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("bench"),
        size: wgpu::Extent3d { width: (w * scale) as u32, height: (h * scale) as u32, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    let mut s = (case.make)();
    (case.setup)(s.as_mut());
    // Warm-up: pipelines, assets, buffers grown to size (not timed).
    for i in 0..30 {
        let ms = i as f64 * 16.67;
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        s.render(&frame(w, h, scale, ms), &gpu.device, &gpu.queue, &mut encoder, &view, format);
        gpu.queue.submit([encoder.finish()]);
        s.submitted();
        let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
    }
    let mut times = Vec::with_capacity(frames);
    for i in 0..frames {
        let ms = 1000.0 + i as f64 * 16.67;
        (case.tick)(s.as_mut(), i, ms);
        let _ = s.messages();
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        let t = cpu_us();
        s.render(&frame(w, h, scale, ms), &gpu.device, &gpu.queue, &mut encoder, &view, format);
        times.push(cpu_us() - t);
        gpu.queue.submit([encoder.finish()]);
        s.submitted();
        let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (times[0], times[frames / 2], times[frames * 9 / 10])
}

#[test]
#[ignore = "a benchmark: run with --release --ignored --nocapture"]
fn bench_cpu_per_frame() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
    let Some(gpu) = fixture::device_or_skip(fixture::device()) else { return };
    let frames = std::env::var("BENCH_FRAMES").ok().and_then(|v| v.parse().ok()).unwrap_or(300);
    let only = std::env::var("BENCH_ONLY").ok();
    for case in cases() {
        if only.as_deref().is_some_and(|o| !case.name.contains(o)) {
            continue;
        }
        let (min, median, p90) = measure(&gpu, &case, frames);
        println!("bench {:<26} min {:>7.1}  median {:>7.1}  p90 {:>7.1} us (thread CPU)", case.name, min, median, p90);
    }
}
