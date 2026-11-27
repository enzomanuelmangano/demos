//! Patterns' GPU module: the surfaces the app draws on wgpu, the RN app's onboarding/* three.js
//! and Skia code, exported as the module Exact loads after the first pixel (`<app>-gpu`, from
//! the app's `gpu/`).
//!
//! - `ghost` (ghost.rs): the intro's 3D stage, the ghost beside his board,
//!   the glow, and the page turn that lands the real board (board.rs).
//! - `wave` (wave.rs): the checkmate wave and the frosted haze it leaves.
//! - `mascot` (mascot.rs): the offer card's pawn-to-ghost morph beside his board.
//! - `site` (site.rs): the setup's ghost (username, daily goal, Pro), with his dizzy birds.
//! - `levelboard` (level_board.rs): the level test's pieces, carried under the finger.
//! - `aura` (aura.rs): the daily goal's glow behind the ring, and the light page's pool.
//! - `hero` (hero.rs, hero_rig.rs): Home's live ghost beside the rating.
//! - `arena` (arena.rs): Arena's floor, the clock dial the pull winds.
//! - `journeyunit` (journey.rs), `journeyfloor` (journey_floor.rs): Journey's road and its board.

#![deny(missing_docs)]

use exact_gpu::Registry;

/// Shader interfaces reflected from WGSL during the build.
pub mod shaders {
    include!(concat!(env!("OUT_DIR"), "/shaders.rs"));
}
#[allow(missing_docs)]
pub mod arena;
pub mod aura;
#[allow(missing_docs)]
pub mod birds;
#[allow(missing_docs)]
pub mod board;
#[allow(missing_docs)]
pub mod board_glyphs;
#[allow(missing_docs)]
pub mod figure;
pub mod gfx;
#[allow(missing_docs)]
pub mod ghost;
#[allow(missing_docs)]
pub mod glb;
#[allow(missing_docs)]
pub mod hero;
#[allow(missing_docs)]
pub mod hero_rig;
#[allow(missing_docs)]
pub mod journey;
pub mod journey_floor;
#[allow(missing_docs)]
pub mod layers;
pub mod level_board;
#[allow(missing_docs)]
pub mod mascot;
#[allow(missing_docs)]
pub mod mascot_clip;
#[allow(missing_docs)]
pub mod morph;
#[allow(missing_docs)]
pub mod poke;
pub mod probe;
#[allow(missing_docs)]
pub mod pulsar;
#[allow(missing_docs)]
pub mod scene;
#[allow(missing_docs)]
pub mod site;
#[allow(missing_docs)]
pub mod touch;
#[allow(missing_docs)]
pub mod veil;
pub mod warm;
pub mod wave;

/// The module's surfaces and its reflected shaders.
pub static REGISTRY: Registry = Registry {
    // /apps: Patterns' setup ghost (`site`: his gaze, takes, moods and dizzy birds) and the intro's stage.
    surfaces: &[("site", 12, site::site), ("ghost", ghost::INPUTS, ghost::ghost)],
    shaders: shaders::SHADERS,
};

exact_gpu::module!(REGISTRY);

#[cfg(all(test, target_os = "macos"))]
mod pipeline_cache_tests;

#[cfg(all(test, not(target_arch = "wasm32")))]
mod device_loss_tests;
