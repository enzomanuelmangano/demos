//! The images the surfaces draw (`gpu/images`): embedded on the iPhone, fetched on the web.
//!
//! Native builds keep `include_bytes!`: [`image!`] expands to exactly that, [`Bytes`] is `[u8]` and
//! [`gate`] returns the surface it is given, so the iPhone's binary holds what it always held.
//! On the web the 25 MB stayed in the GPU module's data section and every GPU demo waited for it
//! (4G: ~30 s). There [`image!`] names the file, the web build serves the file cut in 64 KiB pieces
//! (tools/gpu-images-web.mjs, packages/gpu-images, at `/assets/demos-gpu-images/chunks/<file>.<i>`),
//! and [`gate`] wraps the demo's surface: its canvas asks for the pieces of the files it draws
//! (`Surface::assets`), shows nothing (the demo's backdrop) until every file has arrived, then hands
//! the surface the canvas's size and inputs, which it held meanwhile, and draws. A file arrives once
//! per page: another canvas of the same demo finds it in the store.

#[cfg(target_arch = "wasm32")]
pub use web::{gate, Bytes};

/// A file of `gpu/images`, by its path there: `&'static [u8]` on native (`include_bytes!`), a
/// [`Bytes`] the web fills when its canvas asked for it (`gate`).
#[cfg(not(target_arch = "wasm32"))]
#[macro_export]
macro_rules! image {
    ($path:literal) => {
        include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/images/", $path))
    };
}

/// A file of `gpu/images`, by its path there: `&'static [u8]` on native (`include_bytes!`), a
/// [`Bytes`] the web fills when its canvas asked for it (`gate`).
#[cfg(target_arch = "wasm32")]
#[macro_export]
macro_rules! image {
    ($path:literal) => {
        &$crate::bytes::Bytes::named($path)
    };
}

/// An image's bytes: a slice on native.
#[cfg(not(target_arch = "wasm32"))]
pub type Bytes = [u8];

/// Native: the surface itself (its images are in the binary).
#[cfg(not(target_arch = "wasm32"))]
pub fn gate(_images: &'static [&'static str], surface: Box<dyn exact_gpu::Surface>) -> Box<dyn exact_gpu::Surface> {
    surface
}

#[cfg(any(target_arch = "wasm32", test))]
/// The bytes of each file of gpu/images (build.rs): the web cuts a file into `size / CHUNK` pieces.
#[allow(dead_code)]
mod sizes {
    include!(concat!(env!("OUT_DIR"), "/image_sizes.rs"));
}

#[cfg(any(target_arch = "wasm32", test))]
/// The pieces' size: tools/gpu-images-web.mjs's CHUNK.
pub const CHUNK: usize = 64 * 1024;
#[cfg(any(target_arch = "wasm32", test))]
/// Where the web build serves the pieces (the package's name, then its exact.json paths).
pub const PREFIX: &str = "demos-gpu-images/chunks/";

#[cfg(any(target_arch = "wasm32", test))]
/// The size of `path` in gpu/images, if it is there.
pub fn size(path: &str) -> Option<usize> {
    sizes::SIZES.iter().find(|(p, _)| *p == path).map(|&(_, n)| n)
}

#[cfg(any(target_arch = "wasm32", test))]
/// The asset names of `path`'s pieces.
pub fn pieces(path: &str) -> Vec<String> {
    let n = size(path).unwrap_or(0).div_ceil(CHUNK).max(1);
    (0..n).map(|i| format!("{PREFIX}{path}.{i}")).collect()
}

#[cfg(target_arch = "wasm32")]
mod web {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use exact_gpu::wgpu;
    use exact_gpu::{
        AssetChanges, AssetError, ChildrenMode, ColorSpace, Frame, FrameTiming, InputEvent, Lifecycle, Placement, Restore, Surface, SurfaceError, Value,
    };

    use super::{pieces, size, PREFIX};

    thread_local! {
        /// Every file that arrived on this page, kept (as the data section kept them before).
        static STORE: RefCell<HashMap<&'static str, &'static [u8]>> = RefCell::new(HashMap::new());
    }

    fn stored(path: &str) -> Option<&'static [u8]> {
        STORE.with(|s| s.borrow().get(path).copied())
    }

    /// A file of gpu/images on the web: its path; its bytes once its canvas's gate has them.
    pub struct Bytes(&'static str);

    impl Bytes {
        /// The file at `path` in gpu/images.
        pub const fn named(path: &'static str) -> Self {
            Self(path)
        }
    }

    impl std::ops::Deref for Bytes {
        type Target = [u8];
        fn deref(&self) -> &[u8] {
            // A surface reads its images only once its gate opened, so a miss is a file its gate
            // does not list (bytes.rs's test checks every surface's list against its image! uses).
            stored(self.0).unwrap_or_else(|| panic!("gpu/images/{} is not loaded: add it to its surface's gate", self.0))
        }
    }

    /// `surface`, drawn once every file of `images` has arrived; itself when they all have.
    pub fn gate(images: &'static [&'static str], surface: Box<dyn Surface>) -> Box<dyn Surface> {
        let missing: Vec<&'static str> = images.iter().copied().filter(|p| stored(p).is_none()).collect();
        if missing.is_empty() {
            return surface;
        }
        Box::new(Gate {
            inner: surface,
            files: missing.into_iter().map(|p| File { path: p, parts: vec![None; pieces(p).len()] }).collect(),
            asked: false,
            retry: Vec::new(),
            tries: HashMap::new(),
            open: false,
            size: None,
            bind: None,
            error: None,
        })
    }

    struct File {
        path: &'static str,
        parts: Vec<Option<Vec<u8>>>,
    }

    /// The surface while its images load: the canvas's size and inputs are held, its input and
    /// frames dropped, and it shows nothing (its styles: the demo's backdrop) until it opens.
    struct Gate {
        inner: Box<dyn Surface>,
        files: Vec<File>,
        asked: bool,
        retry: Vec<String>,
        tries: HashMap<String, u32>,
        open: bool,
        size: Option<(f32, f32)>,
        bind: Option<Vec<Value>>,
        error: Option<SurfaceError>,
    }

    impl Gate {
        fn take(&mut self, name: &str, bytes: Vec<u8>) {
            let Some((path, index)) = name.strip_prefix(PREFIX).and_then(|n| n.rsplit_once('.')) else { return };
            let Ok(index) = index.parse::<usize>() else { return };
            let Some(file) = self.files.iter_mut().find(|f| f.path == path) else { return };
            if let Some(part) = file.parts.get_mut(index) {
                *part = Some(bytes);
            }
            if file.parts.iter().all(Option::is_some) {
                let whole: Vec<u8> = file.parts.drain(..).flatten().flatten().collect();
                if size(file.path).is_some_and(|n| n != whole.len()) {
                    self.error = Some(SurfaceError(format!("gpu/images/{}: {} bytes arrived, not {:?}", file.path, whole.len(), size(file.path))));
                }
                let path = file.path;
                STORE.with(|s| {
                    s.borrow_mut().entry(path).or_insert_with(|| Box::leak(whole.into_boxed_slice()));
                });
            }
            self.files.retain(|f| stored(f.path).is_none());
            if self.files.is_empty() {
                self.open();
            }
        }

        /// Every image is here: the surface gets the size and inputs the canvas gave meanwhile.
        fn open(&mut self) {
            self.open = true;
            if let Some((w, h)) = self.size.take() {
                self.inner.size(w, h);
            }
            if let Some(inputs) = self.bind.take() {
                if let Err(e) = self.inner.bind(&inputs, None) {
                    self.error = Some(e);
                }
            }
        }
    }

    impl Surface for Gate {
        fn storage(&mut self, data: &std::path::Path, cache: &std::path::Path, temporary: &std::path::Path) {
            self.inner.storage(data, cache, temporary)
        }
        fn render_scale(&self) -> f32 {
            self.inner.render_scale()
        }
        fn max_fps(&self) -> u32 {
            self.inner.max_fps()
        }
        fn timing(&mut self, timing: &FrameTiming) {
            self.inner.timing(timing)
        }
        fn lifecycle(&mut self, event: Lifecycle) {
            self.inner.lifecycle(event)
        }
        fn clock(&mut self, seekable: bool) {
            self.inner.clock(seekable)
        }
        fn reduced_motion(&mut self, reduce: bool) {
            self.inner.reduced_motion(reduce)
        }
        fn arguments(&self) -> Vec<(&'static str, Value)> {
            self.inner.arguments()
        }
        fn rest_arguments(&self) -> bool {
            self.inner.rest_arguments()
        }
        fn bind(&mut self, inputs: &[Value], at_ms: Option<f64>) -> Result<(), SurfaceError> {
            if self.open {
                return self.inner.bind(inputs, at_ms);
            }
            self.bind = Some(inputs.to_vec());
            Ok(())
        }
        fn size(&mut self, width: f32, height: f32) -> bool {
            if self.open {
                return self.inner.size(width, height);
            }
            self.size = Some((width, height));
            false
        }
        fn assets(&mut self) -> AssetChanges {
            let mut changes = self.inner.assets();
            if !self.asked {
                self.asked = true;
                for file in &self.files {
                    changes.requests.extend(pieces(file.path));
                }
            }
            for name in self.retry.drain(..) {
                changes.retired.push(name.clone());
                changes.requests.push(name);
            }
            changes
        }
        fn asset(&mut self, name: &str, bytes: Result<&[u8], AssetError>) {
            if !name.starts_with(PREFIX) {
                return self.inner.asset(name, bytes);
            }
            match bytes {
                Ok(bytes) => self.take(name, bytes.to_vec()),
                Err(e) => {
                    // A piece that failed is asked again (a slow link's timeout), a few times.
                    let tries = self.tries.entry(name.to_string()).or_insert(0);
                    *tries += 1;
                    if *tries <= 4 && !matches!(e, AssetError::Missing) {
                        self.retry.push(name.to_string());
                    } else {
                        self.error = Some(SurfaceError(format!("{name}: {e:?}")));
                    }
                }
            }
        }
        fn accepts_asset_update(&self, name: &str) -> bool {
            self.inner.accepts_asset_update(name)
        }
        fn prepare_assets(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, format: wgpu::TextureFormat) {
            self.inner.prepare_assets(device, queue, format)
        }
        fn preparing(&self) -> bool {
            self.inner.preparing()
        }
        fn carry(&mut self) -> Result<Option<Vec<u8>>, SurfaceError> {
            self.inner.carry()
        }
        fn restore(&mut self, bytes: &[u8], mode: Restore) -> Result<(), String> {
            self.inner.restore(bytes, mode)
        }
        fn render(
            &mut self,
            frame: &Frame,
            device: &wgpu::Device,
            queue: &wgpu::Queue,
            encoder: &mut wgpu::CommandEncoder,
            target: &wgpu::TextureView,
            format: wgpu::TextureFormat,
        ) -> bool {
            if !self.open {
                return false;
            }
            self.inner.render(frame, device, queue, encoder, target, format)
        }
        fn frame_ready(&self) -> bool {
            self.open && self.inner.frame_ready()
        }
        fn frame_presentable(&self) -> bool {
            self.open && self.inner.frame_presentable()
        }
        fn is_empty(&self) -> bool {
            !self.open || self.inner.is_empty()
        }
        fn submitted(&mut self) {
            if self.open {
                self.inner.submitted()
            }
        }
        fn advance(&mut self, frame: &Frame, device: &wgpu::Device, queue: &wgpu::Queue) {
            if self.open {
                self.inner.advance(frame, device, queue)
            }
        }
        fn device_ready(&mut self, features: wgpu::Features, limits: wgpu::Limits) {
            self.inner.device_ready(features, limits)
        }
        fn device_lost(&mut self) -> bool {
            self.inner.device_lost()
        }
        fn set_waker(&mut self, waker: exact_gpu::SurfaceWaker) {
            self.inner.set_waker(waker)
        }
        fn retier(&mut self) -> bool {
            self.inner.retier()
        }
        fn take_error(&mut self) -> Option<SurfaceError> {
            self.error.take().or_else(|| self.inner.take_error())
        }
        fn srgb_target(&self) -> bool {
            self.inner.srgb_target()
        }
        fn high_dynamic_range(&self) -> bool {
            self.inner.high_dynamic_range()
        }
        fn color_space(&self) -> ColorSpace {
            self.inner.color_space()
        }
        fn color_space_granted(&mut self, space: ColorSpace) {
            self.inner.color_space_granted(space)
        }
        fn opaque(&self) -> bool {
            self.open && self.inner.opaque()
        }
        fn wants_input(&self) -> bool {
            self.inner.wants_input()
        }
        fn wants_pads(&self) -> bool {
            self.inner.wants_pads()
        }
        fn input(&mut self, event: &InputEvent) {
            if self.open {
                self.inner.input(event)
            }
        }
        fn input_changed(&self) -> bool {
            self.open && self.inner.input_changed()
        }
        fn messages(&mut self) -> Vec<String> {
            self.inner.messages()
        }
        fn published(&mut self) -> Option<String> {
            self.inner.published()
        }
        fn set_performance_reporting(&mut self, enabled: bool) {
            self.inner.set_performance_reporting(enabled)
        }
        fn take_performance(&mut self, now_ms: f64) -> Option<String> {
            self.inner.take_performance(now_ms)
        }
        fn generation(&self) -> u64 {
            self.inner.generation()
        }
        fn agent(&mut self, request: &str) -> Option<String> {
            self.inner.agent(request)
        }
        fn children_mode(&self) -> ChildrenMode {
            self.inner.children_mode()
        }
        fn child(&mut self, index: usize, name: &str, texture: Option<&wgpu::TextureView>, frame: [f32; 4]) {
            self.inner.child(index, name, texture, frame)
        }
        fn placement(&self, index: usize) -> Option<Placement> {
            self.inner.placement(index)
        }
        fn placement_opacity(&self, index: usize) -> f32 {
            self.inner.placement_opacity(index)
        }
        fn children(&mut self, current: Option<&wgpu::TextureView>, previous: Option<&wgpu::TextureView>) {
            self.inner.children(current, previous)
        }
    }
}

#[cfg(test)]
mod tests {
    /// Every `image!` a surface's file uses is in that file's `gate(&[...])` list (the web draws a
    /// surface only once its gate's files arrived, and reads nothing else), and every listed file is in
    /// gpu/images.
    #[test]
    fn each_surface_gates_the_images_it_reads() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let quoted = |s: &str, from: &str| -> Vec<String> {
            let mut out = Vec::new();
            let mut rest = s;
            while let Some(at) = rest.find(from) {
                rest = &rest[at + from.len()..];
                let open = rest.find('"').unwrap();
                let close = rest[open + 1..].find('"').unwrap();
                out.push(rest[open + 1..open + 1 + close].to_string());
                rest = &rest[open + 1 + close..];
            }
            out
        };
        let mut checked = 0;
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|e| e != "rs") || path.ends_with("bytes.rs") {
                continue;
            }
            let src = std::fs::read_to_string(&path).unwrap();
            // Embedded on the web too: data a surface reads before it draws (a bind, its constructor, an
            // agent request), under 0.6 MB each: art-gallery's layout, mnist's weights, grid-visualizer's masks.
            const EMBEDDED: [&str; 3] = ["art-gallery/gallery.bin", "mnist/weights.f64", "grid-visualizer/masks.bin"];
            for line in src.lines().filter(|l| l.contains("include_bytes!(\"../images/")) {
                let file = line.split("../images/").nth(1).and_then(|r| r.split('"').next()).unwrap_or("");
                assert!(EMBEDDED.contains(&file), "{}: include_bytes! of gpu/images/{file}: use image!", path.display());
            }
            let used = quoted(&src, "image!(");
            if used.is_empty() {
                continue;
            }
            let gated: Vec<String> = src
                .find("IMAGES: &[&str] = &[")
                .map(|at| {
                    let list = &src[at..at + src[at..].find("];").unwrap()];
                    let mut names = Vec::new();
                    for part in list.split('"').skip(1).step_by(2) {
                        names.push(part.to_string());
                    }
                    names
                })
                .unwrap_or_default();
            for u in &used {
                assert!(gated.contains(u), "{}: image!(\"{u}\") is not in its IMAGES", path.display());
            }
            for g in &gated {
                assert!(super::size(g).is_some(), "{}: IMAGES names {g}, not in gpu/images", path.display());
                assert!(used.contains(g), "{}: IMAGES names {g}, which it never reads", path.display());
            }
            assert!(src.contains("gate(IMAGES"), "{}: its surface is not gated", path.display());
            checked += 1;
        }
        assert!(checked >= 15, "{checked} surfaces read images");
    }

    #[test]
    fn pieces_cover_the_file() {
        let n = super::size("art-gallery/deduped-atlas.astc").unwrap();
        let p = super::pieces("art-gallery/deduped-atlas.astc");
        assert_eq!(p.len(), n.div_ceil(super::CHUNK));
        assert_eq!(p[0], "demos-gpu-images/chunks/art-gallery/deduped-atlas.astc.0");
        assert!(p.iter().all(|n| n.len() <= 128 && exact_gpu::asset_name(n)));
    }
}
