//! Demos on Apple: the Contract UI and the TypeScript data module.

include!(concat!(env!("OUT_DIR"), "/module.rs"));

type ExactEmbeddedData = exact_js::Placed<exact_js::Module>;
fn embedded_data() -> ExactEmbeddedData {
    exact_js::Module::new(APP_BYTECODE, APP, GRANTS)
        .with_canvas_surfaces(CANVAS_SURFACES)
        .placed(TYPESCRIPT_PLACEMENT)
}
include!(concat!(env!("OUT_DIR"), "/logic.rs"));
include!(concat!(env!("OUT_DIR"), "/linked.rs"));
// The host app.json's deploy.store names (with an update store, signed updates), and the plan it boots.
include!(concat!(env!("OUT_DIR"), "/host.rs"));
