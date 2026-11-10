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

pub mod animated_3d_parallax;
pub mod atlas_button;
pub mod atlas_sphere;
pub mod balance_slider;
pub mod blur_cards;
pub mod blur_circles;
pub mod blurred_scroll;
pub mod bottom_bar_skia;
pub mod color_carousel;
pub mod cuberto_slider;
pub mod dot_sheet;
pub mod fibonacci_shader;
pub mod floating_bottom_bar;
pub mod fluid_slider;
pub mod fractal_glass;
pub mod geometry_button;
pub mod linear_sensors;
pub mod loading_button;
pub mod magnet_spring;
pub mod metaball;
pub mod paper_folding;
pub mod radar_chart;
pub mod record_button;
pub mod skia_bottom_sheet;
pub mod slide_to_reveal;
pub mod sphere_waves;
pub mod spiral;
pub mod steddy_graph_interaction;
pub mod theme_canvas_animation;

/// The module's surfaces and its reflected shaders.
pub static REGISTRY: Registry = Registry {
    surfaces: &[
        ("animated_3d_parallax", 0, animated_3d_parallax::surface),
        ("atlas_button", 0, atlas_button::surface),
        ("atlas_sphere", 0, atlas_sphere::surface),
        ("balance_slider", 0, balance_slider::surface),
        ("blur_cards", 1, blur_cards::surface),
        ("blur_circles", 0, blur_circles::surface),
        ("blurred_scroll", 1, blurred_scroll::surface),
        ("bottom_bar_skia", 1, bottom_bar_skia::surface),
        ("color_carousel", 1, color_carousel::surface),
        ("cuberto_slider", 0, cuberto_slider::surface),
        ("dot_sheet", 0, dot_sheet::surface),
        ("fibonacci_shader", 1, fibonacci_shader::surface),
        ("floating_bottom_bar", 0, floating_bottom_bar::surface),
        ("fluid_slider", 0, fluid_slider::surface),
        ("fractal_glass", 1, fractal_glass::surface),
        ("geometry_button", 0, geometry_button::surface),
        ("linear_sensors", 0, linear_sensors::surface),
        ("loading_button", 1, loading_button::surface),
        ("magnet_spring", 0, magnet_spring::surface),
        ("metaball", 0, metaball::surface),
        ("paper_folding", 0, paper_folding::surface),
        ("radar_chart", 10, radar_chart::surface),
        ("record_button", 1, record_button::surface),
        ("skia_bottom_sheet", 0, skia_bottom_sheet::surface),
        ("slide_to_reveal", 0, slide_to_reveal::surface),
        ("sphere_waves", 0, sphere_waves::surface),
        ("spiral", 0, spiral::surface),
        ("steddy_graph_interaction", 1, steddy_graph_interaction::surface),
        ("theme_canvas_animation", 0, theme_canvas_animation::surface),
    ],
    shaders: shaders::SHADERS,
};

exact_gpu::module!(REGISTRY);
