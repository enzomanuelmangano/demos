fn main() {
    // The size of each file of images/ (bytes.rs: the web fetches a file in pieces of a known count).
    let images = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("images");
    println!("cargo:rerun-if-changed={}", images.display());
    let mut sizes = Vec::new();
    let mut stack = vec![images.clone()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(meta) = entry.metadata() {
                let rel = path.strip_prefix(&images).unwrap().to_string_lossy().replace('\\', "/");
                sizes.push((rel, meta.len()));
            }
        }
    }
    sizes.sort();
    let rows: String = sizes.iter().map(|(p, n)| format!("    ({p:?}, {n}),\n")).collect();
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(out_dir.join("image_sizes.rs"), format!("/// Each file of gpu/images and its bytes.\npub static SIZES: &[(&str, usize)] = &[\n{rows}];\n"))
        .unwrap();
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("shaders");
    println!("cargo:rerun-if-changed={}", dir.display());
    let generated = exact_gpu_reflect::generate(&dir).unwrap_or_else(|e| panic!("{e}"));
    for source in &generated.sources {
        println!("cargo:rerun-if-changed={}", source.display());
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("shaders.rs");
    std::fs::write(out, generated.rust).unwrap();
}
