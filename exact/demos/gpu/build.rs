fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    println!("cargo:rerun-if-changed={}", dir.display());
    let generated = exact_gpu_reflect::generate(&dir).unwrap_or_else(|e| panic!("{e}"));
    for source in &generated.sources {
        println!("cargo:rerun-if-changed={}", source.display());
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("shaders.rs");
    std::fs::write(out, generated.rust).unwrap();
}
