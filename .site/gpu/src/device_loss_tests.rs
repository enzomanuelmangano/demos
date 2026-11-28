//! A device lost and recovered (exact-gpu `Module::lose_device`, then `recover`: the same surface
//! instances on a new device). Each surface is drawn on one device, told `device_lost`, and drawn
//! on a second, as the module does after a loss: a resource kept from the first device would be a
//! wgpu validation error (a panic under the fixture), and the picture must be the same.

use exact_gpu::{fixture, Frame, Surface, Value};

fn frame(width: f32, height: f32, now_ms: f64) -> Frame {
    Frame {
        width,
        height,
        scale: 3.0,
        now_ms,
        children_generation: 0,
        seekable: true,
        period_ms: 0.0,
        shader_generation: exact_gpu::shaders::shader_generation(),
        headroom: 1.0,
    }
}

/// `make`'s surface bound to `inputs`, drawn on device A, lost, then drawn on device B: the same
/// pixels as a surface that only ever knew device B.
fn survives(name: &str, make: fn() -> Box<dyn Surface>, inputs: &[Value], frame: Frame) {
    let _one = crate::warm::per_device_test();
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
    let Some(a) = fixture::device_or_skip(fixture::device()) else { return };
    let Some(b) = fixture::device_or_skip(fixture::device()) else { return };
    let mut s = make();
    s.bind(inputs, None).unwrap();
    fixture::render(&a, s.as_mut(), &frame).unwrap();
    assert!(s.device_lost(), "{name}: recovers in place");
    let (after, _) = fixture::render(&b, s.as_mut(), &frame).unwrap();
    let mut fresh = make();
    fresh.bind(inputs, None).unwrap();
    let (want, _) = fixture::render(&b, fresh.as_mut(), &frame).unwrap();
    same(name, &after, &want);
}

/// The same, its first frame (`first`) on device A and the next (`then`) on device B, against a surface that drew
/// both on B: for a surface whose picture depends on how long it has been shown (`site` fades in from its first frame).
fn survives_then(name: &str, make: fn() -> Box<dyn Surface>, inputs: &[Value], first: Frame, then: Frame) {
    let _one = crate::warm::per_device_test();
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    exact_gpu::shaders::load_dir(&dir, &crate::REGISTRY).unwrap();
    let Some(a) = fixture::device_or_skip(fixture::device()) else { return };
    let Some(b) = fixture::device_or_skip(fixture::device()) else { return };
    let mut s = make();
    s.bind(inputs, None).unwrap();
    fixture::render(&a, s.as_mut(), &first).unwrap();
    assert!(s.device_lost(), "{name}: recovers in place");
    let (after, _) = fixture::render(&b, s.as_mut(), &then).unwrap();
    let mut fresh = make();
    fresh.bind(inputs, None).unwrap();
    fixture::render(&b, fresh.as_mut(), &first).unwrap();
    let (want, _) = fixture::render(&b, fresh.as_mut(), &then).unwrap();
    same(name, &after, &want);
}

fn same(name: &str, after: &fixture::Pixels, want: &fixture::Pixels) {
    assert!(after.data.iter().any(|&v| v != 0), "{name}: drew nothing on the new device");
    let diff = after.data.iter().zip(&want.data).map(|(x, y)| x.abs_diff(*y)).max().unwrap_or(0);
    assert!(diff <= 2, "{name}: the new device's picture differs by {diff}");
}

fn n(v: f64) -> Value {
    Value::Number(v)
}

#[test]
fn a_journey_row_draws_on_the_new_device() {
    let tiles = "210,218,84,c,0;141.5,310,70,l,2;141.5,400,70,l,2;278.5,490,70,l,2";
    let inputs = [Value::str(tiles), Value::str("200,260,0;190,270,0"), n(0.0), n(0.0), n(0.0), n(-1.0), n(-1.0), n(0.0), n(0.0), n(0.0), n(0.0)];
    survives("journeyunit", crate::journey::journey_unit, &inputs, frame(420.0, 600.0, 0.0));
}

#[test]
fn journey_s_floor_draws_on_the_new_device() {
    survives("journeyfloor", crate::journey_floor::journey_floor, &[n(120.0), n(116.0), n(0.0), n(0.0)], frame(140.0, 300.0, 0.0));
}

#[test]
fn arena_s_floor_draws_on_the_new_device() {
    survives("arena", crate::arena::arena, &[n(0.0), n(0.0), n(1.0), n(106.0), n(1.0), n(1.0)], frame(140.0, 300.0, 0.0));
}

#[test]
fn home_s_ghost_draws_on_the_new_device() {
    survives("hero", crate::hero::hero, &[n(0.26), n(1.0), n(1.0)], frame(152.0, 152.0, 1000.0));
}

// The two surfaces the site registers (lib.rs REGISTRY): what reactiive.io's /apps draws.
#[test]
fn apps_setup_ghost_draws_on_the_new_device() {
    let inputs = [n(0.0), n(0.0), n(0.0), n(0.0), n(0.0), n(0.0), n(0.0), n(0.0), n(0.62), n(0.94), n(1.0)];
    survives_then("site", crate::site::site, &inputs, frame(190.0, 190.0, 1000.0), frame(190.0, 190.0, 1400.0));
}

#[test]
fn apps_intro_stage_draws_on_the_new_device() {
    survives("ghost", crate::ghost::ghost, &[Value::str("dark"), n(0.0)], frame(420.0, 600.0, 1000.0));
}
