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
#[cfg(test)]
mod bench;
pub mod gfx;
pub mod gooey;
pub mod qr;
pub mod ui_scroll;

pub mod add_to_cart;
pub mod airbnb_flip_card;
pub mod airbnb_flip_pages;
pub mod alert_drawer_card;
pub mod animated_3d_parallax;
pub mod animated_clip_box;
pub mod atlas_button;
pub mod atlas_sphere;
pub mod audio_player;
pub mod balance_slider;
pub mod bezier_curve_outline;
pub mod blur_cards;
pub mod blur_circles;
pub mod blurred_bottom_bar;
pub mod blurred_scroll;
pub mod bottom_bar_skia;
pub mod card_shader_reflections;
pub mod circular_carousel;
pub mod cherry_blossom_qrcode;
pub mod clock_time_picker;
pub mod color_carousel;
pub mod coverflow_carousel;
pub mod cuberto_slider;
pub mod delete_button;
pub mod dot_sheet;
pub mod dot_sheet_card;
pub mod duration_slider;
pub mod dynamic_blur_tabs;
pub mod email_demo;
pub mod empty_qr_code;
pub mod exclusion_tabs;
pub mod expandable_mini_player;
pub mod fibonacci_shader;
pub mod fibonacci_shader_grid;
pub mod floating_bottom_bar;
pub mod floating_modal;
pub mod fluid_slider;
pub mod fluid_tab_interaction;
pub mod fourier_visualizer;
pub mod fractal_glass;
pub mod geometry_button;
pub mod github_contributions;
pub mod github_terrain;
pub mod gl_transitions;
pub mod image_cropper;
pub mod imessage_stack;
pub mod light_on_painting;
pub mod linear_sensors;
pub mod loading_button;
pub mod magnet_spring;
pub mod metaball;
pub mod miles_bar_chart;
pub mod mobile_input;
pub mod notion_qrcode;
pub mod paper_folding;
pub mod particles_button;
pub mod prequel_slider;
pub mod qr_code_generator;
pub mod radar_chart;
pub mod record_button;
pub mod scrollable_shapes;
pub mod selectable_grid_list;
pub mod skia_bottom_sheet;
pub mod skia_color_picker;
pub mod slide_to_reveal;
pub mod snake;
pub mod sphere_waves;
pub mod spiral;
pub mod stacked_carousel;
pub mod staggered_card_number;
pub mod steddy_graph_interaction;
pub mod story_list;
pub mod sudoku;
pub mod swipe_cards;
pub mod telegram_lottie;
pub mod telegram_theme_switch;
pub mod the_little_prince;
pub mod theme_canvas_animation;
pub mod threads_holo_ticket;
pub mod timer;
pub mod twodos_slide;
pub mod wheel_picker;

/// The module's surfaces and its reflected shaders.
pub static REGISTRY: Registry = Registry {
    surfaces: &[
        ("add_to_cart", 1, add_to_cart::surface),
        ("airbnb_flip_card", 1, airbnb_flip_card::surface),
        ("airbnb_flip_pages", 2, airbnb_flip_pages::surface),
        ("alert_drawer_card", 1, alert_drawer_card::surface),
        ("animated_3d_parallax", 0, animated_3d_parallax::surface),
        ("animated_clip_box", 1, animated_clip_box::surface),
        ("atlas_button", 1, atlas_button::surface),
        ("atlas_sphere", 0, atlas_sphere::surface),
        ("audio_player", 1, audio_player::surface),
        ("balance_slider", 0, balance_slider::surface),
        ("bezier_curve_outline", 2, bezier_curve_outline::surface),
        ("blur_cards", 1, blur_cards::surface),
        ("blur_circles", 0, blur_circles::surface),
        ("blurred_bottom_bar", 6, blurred_bottom_bar::surface),
        ("blurred_scroll", 1, blurred_scroll::surface),
        ("bottom_bar_skia", 1, bottom_bar_skia::surface),
        ("card_shader_reflections", 0, card_shader_reflections::surface),
        ("circular_carousel", 1, circular_carousel::surface),
        ("cherry_blossom_qrcode", 4, cherry_blossom_qrcode::surface),
        ("clock_time_picker", 0, clock_time_picker::surface),
        ("color_carousel", 0, color_carousel::surface),
        ("coverflow_carousel", 0, coverflow_carousel::surface),
        ("cuberto_slider", 0, cuberto_slider::surface),
        ("delete_button", 0, delete_button::surface),
        ("dot_sheet", 0, dot_sheet::surface),
        ("dot_sheet_card", 2, dot_sheet_card::surface),
        ("duration_slider", 0, duration_slider::surface),
        ("dynamic_blur_tabs", 7, dynamic_blur_tabs::surface),
        ("email_row", 2, email_demo::surface),
        ("empty_qr_code", 0, empty_qr_code::surface),
        ("exclusion_tabs", 0, exclusion_tabs::surface),
        ("expandable_mini_player", 1, expandable_mini_player::surface),
        ("fibonacci_shader", 1, fibonacci_shader::surface),
        ("fibonacci_shader_grid", 0, fibonacci_shader_grid::surface),
        ("floating_bottom_bar", 0, floating_bottom_bar::surface),
        ("floating_modal", 0, floating_modal::surface),
        ("fluid_slider", 0, fluid_slider::surface),
        ("fluid_tab_interaction", 0, fluid_tab_interaction::surface),
        ("fourier_visualizer", 0, fourier_visualizer::surface),
        ("fractal_glass", 1, fractal_glass::surface),
        ("geometry_button", 0, geometry_button::surface),
        ("github_contributions", 0, github_contributions::surface),
        ("github_terrain", 1, github_terrain::surface),
        ("gl_transitions", 4, gl_transitions::surface),
        ("image_cropper", 0, image_cropper::surface),
        ("imessage_stack", 0, imessage_stack::surface),
        ("light_on_painting", 4, light_on_painting::surface),
        ("linear_sensors", 0, linear_sensors::surface),
        ("loading_button", 0, loading_button::surface),
        ("magnet_spring", 0, magnet_spring::surface),
        ("metaball", 0, metaball::surface),
        ("miles_bar_chart", 7, miles_bar_chart::surface),
        ("mobile_input", 2, mobile_input::surface),
        ("notion_qrcode", 0, notion_qrcode::surface),
        ("paper_folding", 0, paper_folding::surface),
        ("particles_button", 1, particles_button::surface),
        ("prequel_slider", 2, prequel_slider::surface),
        ("qr_code_generator", 3, qr_code_generator::surface),
        ("radar_chart", 10, radar_chart::surface),
        ("record_button", 1, record_button::surface),
        ("scrollable_shapes", 0, scrollable_shapes::surface),
        ("selectable_grid_list", 1, selectable_grid_list::surface),
        ("skia_bottom_sheet", 0, skia_bottom_sheet::surface),
        ("skia_color_picker", 0, skia_color_picker::surface),
        ("slide_to_reveal", 0, slide_to_reveal::surface),
        ("snake", 3, snake::surface),
        ("sphere_waves", 0, sphere_waves::surface),
        ("spiral", 0, spiral::surface),
        ("stacked_carousel", 0, stacked_carousel::surface),
        ("staggered_card_number", 0, staggered_card_number::surface),
        ("steddy_graph_interaction", 1, steddy_graph_interaction::surface),
        ("steddy_highlight", 1, steddy_graph_interaction::highlight),
        ("story_list", 0, story_list::surface),
        ("sudoku", 3, sudoku::surface),
        ("swipe_cards", 4, swipe_cards::surface),
        ("telegram_theme_switch", 1, telegram_theme_switch::surface),
        ("the_little_prince", 2, the_little_prince::surface),
        ("theme_canvas_animation", 0, theme_canvas_animation::surface),
        ("threads_holo_ticket", 0, threads_holo_ticket::surface),
        ("timer", 2, timer::surface),
        ("twodos_slide", 0, twodos_slide::surface),
        ("wheel_picker", 1, wheel_picker::surface),
    ],
    shaders: shaders::SHADERS,
};

exact_gpu::module!(REGISTRY);
