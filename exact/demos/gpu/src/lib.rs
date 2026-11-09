//! The Demos app's GPU module: what the RN demos draw with Skia, three.js or WebGPU, drawn
//! with wgpu, loaded by Exact after the first pixel. One module per demo, named after its
//! slug; `gfx` and `spring` are what they share.
//!
//! A demo's gestures and motion run here, on the host's frame clock, as RN runs them in
//! worklets on the UI thread: a touch inside a canvas that asks for input never reaches the
//! app's runner, and nothing is committed per frame.

#![deny(missing_docs)]

use exact_gpu::Registry;

/// Shader interfaces reflected from WGSL during the build.
#[allow(missing_docs)]
pub mod shaders {
    include!(concat!(env!("OUT_DIR"), "/shaders.rs"));
}
pub mod gfx;

pub mod blur_circles;
pub mod bottom_bar_skia;
pub mod cuberto_slider;
pub mod floating_bottom_bar;
pub mod fluid_slider;
pub mod geometry_button;
pub mod metaball;
pub mod radar_chart;
pub mod spiral;

/// The module's surfaces and its reflected shaders.
pub static REGISTRY: Registry = Registry {
    surfaces: &[("blur_circles", 0, blur_circles::surface), ("bottom_bar_skia", 1, bottom_bar_skia::surface), ("cuberto_slider", 0, cuberto_slider::surface), ("floating_bottom_bar", 0, floating_bottom_bar::surface), ("fluid_slider", 0, fluid_slider::surface), ("geometry_button", 0, geometry_button::surface), ("metaball", 0, metaball::surface), ("radar_chart", 10, radar_chart::surface), ("spiral", 0, spiral::surface)],
    shaders: shaders::SHADERS,
};

exact_gpu::module!(REGISTRY);
