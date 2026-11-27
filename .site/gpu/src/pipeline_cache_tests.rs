//! The module's persistent pipeline cache (exact-gpu `PipelineCache`, a Metal binary archive on
//! disk) across launches, measured: each launch is a process of its own that loads the module as
//! the host does (`native::load`, which gives the device its archive), draws Journey's first row
//! (the road's 14 draw2d pipelines), the floor and Home's ghost, and unloads (the archive is
//! written). The first launch compiles; the second, on the same cache directory, loads them; a
//! third on an empty directory is the control (the system's own shader caches are as warm as for
//! the second). Not a gate (machine-dependent timing):
//! `cargo test -p patterns-exact-gpu --release pipeline_cache_tests -- --ignored --nocapture`.
//! The iOS simulator keeps no archive (exact-gpu: its Metal aborts serializing one); a device does.

use std::time::Instant;

const CHILD: &str = "PATTERNS_PIPELINE_CACHE_CHILD";

fn launch(cache: &std::path::Path) -> (f64, String) {
    let out = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "pipeline_cache_tests::a_later_launch_loads_the_pipelines", "--ignored", "--nocapture"])
        .env(CHILD, "1")
        .env("XDG_CACHE_HOME", cache)
        .env("EXACT_GPU_CACHE_KEY", "patterns-pipeline-cache-test")
        .env("EXACT_GPU_CACHE_SEED", cache.join("no-seed"))
        .env("EXACT_METAL_LIBRARIES", cache.join("no-libraries"))
        .output()
        .unwrap();
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    assert!(out.status.success(), "{text}");
    let ms = text.lines().find_map(|l| l.strip_prefix("FIRST_FRAMES_MS=")).and_then(|v| v.trim().parse().ok()).expect("a timing");
    let cache = text.lines().find(|l| l.starts_with("GPU module pipeline cache")).unwrap_or("GPU module pipeline cache: none").to_string();
    (ms, cache)
}

/// One launch: the first frames of a Journey row, the floor and Home's ghost, timed.
fn child() {
    use exact_gpu::native;
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
    assert_eq!(native::load(&crate::REGISTRY, "patterns-exact-gpu", &[]), 0, "{}", native::error());
    let start = Instant::now();
    let row = native::create_headless("journeyunit");
    let tiles = "210,218,84,c,0;141.5,310,70,l,2;141.5,400,70,l,2";
    assert_eq!(native::bind(row, &format!("[\"{tiles}\",\"200,260,0\",0,0,0,-1,-1,0,0,0,0]")), 0, "{}", native::error());
    let floor = native::create_headless("journeyfloor");
    assert_eq!(native::bind(floor, "[0,116,0,0]"), 0);
    let hero = native::create_headless("hero");
    assert_eq!(native::bind(hero, "[0.26,1,1]"), 0);
    let mut out = vec![0u8; 420 * 600 * 4];
    for id in [row, floor, hero] {
        let r = native::readback(id, 140.0, 200.0, 3.0, 0.0, &mut out);
        assert!(r == 0 || r == 2, "readback {r}: {}", native::error());
    }
    println!("FIRST_FRAMES_MS={}", start.elapsed().as_secs_f64() * 1000.0);
    native::unload();
}

#[test]
#[ignore]
fn a_later_launch_loads_the_pipelines() {
    if std::env::var(CHILD).is_ok() {
        child();
        return;
    }
    let base = std::env::temp_dir().join(format!("patterns-pipeline-cache-{}", std::process::id()));
    let (kept, fresh) = (base.join("kept"), base.join("fresh"));
    let first = launch(&kept);
    let second = launch(&kept);
    let control = launch(&fresh);
    let _ = std::fs::remove_dir_all(&base);
    println!("first launch   {:7.1} ms  {}", first.0, first.1);
    println!("second launch  {:7.1} ms  {}", second.0, second.1);
    println!("control (empty cache, warm system caches) {:7.1} ms  {}", control.0, control.1);
    if second.1.ends_with("loaded") {
        assert!(second.0 < control.0, "the kept archive must spare the compile");
    }
}
