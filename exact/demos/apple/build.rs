fn main() {
    let platform = match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
        // tvOS and watchOS reuse the manifest's iOS policy, including interpreted Rust updates.
        Ok("ios" | "tvos" | "watchos") => "ios",
        _ => "macos",
    };
    exact_js_bake::build(std::path::Path::new(".."), platform).unwrap_or_else(|error| {
        // What the bake found (tsc's and the compiler's diagnostics), as it is: no panic around it.
        eprintln!("{error}");
        std::process::exit(1);
    });
}
