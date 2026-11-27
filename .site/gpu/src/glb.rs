//! The RN app's baked ghost models (ghost-morph.glb, ghost-site.glb), read by hand: Exact's game
//! engine refuses morph targets and the `gltf` crate refuses KHR_mesh_quantization, so the file is
//! loaded unvalidated and its accessors (int8/int16 normalised, some sparse) read here. The pose
//! follows three's AnimationMixer as the RN scenes drive it (src/components/ghost/
//! ghost-scene-native.ts, onboarding/mascot-scene-core.ts): linear translations and scales,
//! slerped rotations, morph weights on three's smooth (cubic) interpolant, every clip held at its
//! last key past its end.

use glam::{Mat4, Quat, Vec3};

/// A node: its parent, rest transform, this frame's transform and morph weights.
#[derive(Clone)]
pub struct Node {
    pub name: String,
    pub parent: Option<usize>,
    pub rest: (Vec3, Quat, Vec3),
    pub t: Vec3,
    pub r: Quat,
    pub s: Vec3,
    pub weights: Vec<f32>,
    /// The found-marker (`Found_*`) and everything under it: the intro's, never drawn here.
    pub hidden: bool,
}

/// One primitive: its node, material name, base vertices (position, normal), morph
/// displacements (one list of positions per target) and triangle indices.
#[derive(Clone)]
pub struct Prim {
    pub node: usize,
    pub material: String,
    pub base: Vec<[f32; 6]>,
    pub targets: Vec<Vec<[f32; 3]>>,
    pub indices: Vec<u32>,
}

#[derive(Clone, Copy)]
enum Path {
    T,
    R,
    S,
    W,
}

#[derive(Clone)]
struct Channel {
    node: usize,
    path: Path,
    times: Vec<f32>,
    values: Vec<f32>,
    width: usize,
}

/// A whole file.
#[derive(Clone)]
pub struct Scene {
    pub nodes: Vec<Node>,
    pub prims: Vec<Prim>,
    channels: Vec<Channel>,
    /// The nodes, parents before their children.
    order: Vec<usize>,
}

/// An accessor's components as f32, flattened, normalised integers included
/// (KHR_mesh_quantization), sparse substitutions applied.
fn read(acc: &gltf::Accessor, blob: &[u8]) -> Vec<f32> {
    use gltf::accessor::DataType as D;
    let n = acc.dimensions().multiplicity();
    let count = acc.count();
    let size = acc.data_type().size();
    let norm = acc.normalized();
    let comp = |bytes: &[u8], dt: D| -> f32 {
        match dt {
            D::F32 => f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
            D::I8 => {
                let v = bytes[0] as i8 as f32;
                if norm {
                    (v / 127.0).max(-1.0)
                } else {
                    v
                }
            }
            D::U8 => {
                let v = bytes[0] as f32;
                if norm {
                    v / 255.0
                } else {
                    v
                }
            }
            D::I16 => {
                let v = i16::from_le_bytes([bytes[0], bytes[1]]) as f32;
                if norm {
                    (v / 32767.0).max(-1.0)
                } else {
                    v
                }
            }
            D::U16 => {
                let v = u16::from_le_bytes([bytes[0], bytes[1]]) as f32;
                if norm {
                    v / 65535.0
                } else {
                    v
                }
            }
            D::U32 => u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as f32,
        }
    };
    let mut out = vec![0.0f32; count * n];
    if let Some(view) = acc.view() {
        let stride = view.stride().unwrap_or(size * n);
        let start = view.offset() + acc.offset();
        for i in 0..count {
            for c in 0..n {
                let at = start + i * stride + c * size;
                out[i * n + c] = comp(&blob[at..at + size], acc.data_type());
            }
        }
    }
    if let Some(sparse) = acc.sparse() {
        let iv = sparse.indices().view();
        let istart = iv.offset() + sparse.indices().offset();
        let isize = match sparse.indices().index_type() {
            gltf::accessor::sparse::IndexType::U8 => 1,
            gltf::accessor::sparse::IndexType::U16 => 2,
            gltf::accessor::sparse::IndexType::U32 => 4,
        };
        let vv = sparse.values().view();
        let vstart = vv.offset() + sparse.values().offset();
        for k in 0..sparse.count() {
            let at = istart + k * isize;
            let idx = match isize {
                1 => blob[at] as usize,
                2 => u16::from_le_bytes([blob[at], blob[at + 1]]) as usize,
                _ => u32::from_le_bytes([blob[at], blob[at + 1], blob[at + 2], blob[at + 3]]) as usize,
            };
            for c in 0..n {
                let at = vstart + (k * n + c) * size;
                out[idx * n + c] = comp(&blob[at..at + size], acc.data_type());
            }
        }
    }
    out
}

impl Scene {
    /// Reads `bytes` (a .glb), leaving out the animations whose names start with `skip`
    /// (empty skips none).
    pub fn load(bytes: &[u8], label: &str, skip: &str) -> Result<Scene, String> {
        // Unvalidated: the crate refuses KHR_mesh_quantization, which `read` handles.
        let gltf = gltf::Gltf::from_slice_without_validation(bytes).map_err(|e| format!("{label}: {e}"))?;
        let blob = gltf.blob.as_deref().ok_or_else(|| format!("{label}: no binary chunk"))?;
        let doc = &gltf.document;
        let mut nodes: Vec<Node> = doc
            .nodes()
            .map(|n| {
                let (t, r, s) = n.transform().decomposed();
                let rest = (Vec3::from(t), Quat::from_array(r), Vec3::from(s));
                let weights = n.mesh().and_then(|m| m.weights().map(|w| w.to_vec())).unwrap_or_default();
                let name = n.name().unwrap_or("").to_string();
                let hidden = name.starts_with("Found_");
                Node { name, parent: None, rest, t: rest.0, r: rest.1, s: rest.2, weights, hidden }
            })
            .collect();
        for n in doc.nodes() {
            for c in n.children() {
                nodes[c.index()].parent = Some(n.index());
            }
        }
        // The found-marker is not part of the shot, nor anything under it.
        for i in 0..nodes.len() {
            let mut p = nodes[i].parent;
            while let Some(j) = p {
                if nodes[j].hidden {
                    nodes[i].hidden = true;
                }
                p = nodes[j].parent;
            }
        }
        let mut prims = Vec::new();
        for n in doc.nodes() {
            let Some(mesh) = n.mesh() else { continue };
            let weights = mesh.weights().map(|w| w.len()).unwrap_or(0);
            if nodes[n.index()].weights.len() < weights {
                nodes[n.index()].weights = vec![0.0; weights];
            }
            for p in mesh.primitives() {
                let pos = read(&p.get(&gltf::Semantic::Positions).ok_or_else(|| format!("{label}: no positions"))?, blob);
                let nor = p.get(&gltf::Semantic::Normals).map(|a| read(&a, blob)).unwrap_or_else(|| vec![0.0; pos.len()]);
                let indices: Vec<u32> = match p.indices() {
                    Some(a) => read(&a, blob).into_iter().map(|v| v as u32).collect(),
                    None => (0..(pos.len() / 3) as u32).collect(),
                };
                let base = (0..pos.len() / 3).map(|i| [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]]).collect();
                let targets = p
                    .morph_targets()
                    .map(|t| {
                        let d = t.positions().map(|a| read(&a, blob)).unwrap_or_default();
                        d.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect()
                    })
                    .collect();
                let material = p.material().name().unwrap_or("").to_string();
                prims.push(Prim { node: n.index(), material, base, targets, indices });
            }
        }
        let mut channels = Vec::new();
        for anim in doc.animations() {
            if !skip.is_empty() && anim.name().unwrap_or("").starts_with(skip) {
                continue;
            }
            for ch in anim.channels() {
                let s = ch.sampler();
                let times = read(&s.input(), blob);
                let values = read(&s.output(), blob);
                let (path, width) = match ch.target().property() {
                    gltf::animation::Property::Translation => (Path::T, 3),
                    gltf::animation::Property::Rotation => (Path::R, 4),
                    gltf::animation::Property::Scale => (Path::S, 3),
                    gltf::animation::Property::MorphTargetWeights => (Path::W, values.len() / times.len().max(1)),
                };
                channels.push(Channel { node: ch.target().node().index(), path, times, values, width });
            }
        }
        let mut order = Vec::with_capacity(nodes.len());
        let mut placed = vec![false; nodes.len()];
        while order.len() < nodes.len() {
            for i in 0..nodes.len() {
                if !placed[i] && nodes[i].parent.is_none_or(|p| placed[p]) {
                    placed[i] = true;
                    order.push(i);
                }
            }
        }
        Ok(Scene { nodes, prims, channels, order })
    }

    /// The node called `name`.
    pub fn named(&self, name: &str) -> Option<usize> {
        self.nodes.iter().position(|n| n.name == name)
    }

    /// The clip at `t` seconds: linear translations and scales, slerped
    /// rotations, and the morph weights on three's smooth (cubic) interpolant.
    pub fn pose(&mut self, t: f32) {
        for n in &mut self.nodes {
            n.t = n.rest.0;
            n.r = n.rest.1;
            n.s = n.rest.2;
        }
        for ch in &self.channels {
            let times = &ch.times;
            let w = ch.width;
            let last = times.len() - 1;
            let (i, k) = if t <= times[0] {
                (0, 0.0)
            } else if t >= times[last] {
                (last, 0.0)
            } else {
                let i = times.partition_point(|&x| x <= t) - 1;
                (i, (t - times[i]) / (times[i + 1] - times[i]))
            };
            let j = (i + 1).min(last);
            let v = |idx: usize, c: usize| ch.values[idx * w + c];
            let n = &mut self.nodes[ch.node];
            match ch.path {
                Path::T => n.t = Vec3::new(v(i, 0), v(i, 1), v(i, 2)).lerp(Vec3::new(v(j, 0), v(j, 1), v(j, 2)), k),
                Path::S => n.s = Vec3::new(v(i, 0), v(i, 1), v(i, 2)).lerp(Vec3::new(v(j, 0), v(j, 1), v(j, 2)), k),
                Path::R => {
                    let a = Quat::from_xyzw(v(i, 0), v(i, 1), v(i, 2), v(i, 3)).normalize();
                    let b = Quat::from_xyzw(v(j, 0), v(j, 1), v(j, 2), v(j, 3)).normalize();
                    n.r = a.slerp(b, k);
                }
                Path::W => {
                    if n.weights.len() < w {
                        n.weights.resize(w, 0.0);
                    }
                    if i == j || k == 0.0 {
                        for c in 0..w {
                            n.weights[c] = v(i, c);
                        }
                    } else {
                        // three's CubicInterpolant with zero-curvature ends.
                        let (t0, t1) = (times[i], times[j]);
                        let (ip, tp) = if i > 0 { (i - 1, times[i - 1]) } else { (j, t0 + t0 - t1) };
                        let (inx, tn) = if j < last { (j + 1, times[j + 1]) } else { (i, t1 + t1 - t0) };
                        let half = (t1 - t0) * 0.5;
                        let (wp, wn) = (half / (t0 - tp), half / (tn - t1));
                        let (p, pp) = (k, k * k);
                        let ppp = pp * p;
                        let sp = -wp * ppp + 2.0 * wp * pp - wp * p;
                        let s0 = (1.0 + wp) * ppp + (-1.5 - 2.0 * wp) * pp + (-0.5 + wp) * p + 1.0;
                        let s1 = (-1.0 - wn) * ppp + (1.5 + wn) * pp + 0.5 * p;
                        let sn = wn * ppp - wn * pp;
                        for c in 0..w {
                            n.weights[c] = sp * v(ip, c) + s0 * v(i, c) + s1 * v(j, c) + sn * v(inx, c);
                        }
                    }
                }
            }
        }
    }

    /// Every node's world matrix, into `out` (resized, never reallocated once grown).
    pub fn worlds_into(&self, out: &mut Vec<Mat4>) {
        out.resize(self.nodes.len(), Mat4::IDENTITY);
        for &i in &self.order {
            let n = &self.nodes[i];
            let local = Mat4::from_scale_rotation_translation(n.s, n.r, n.t);
            out[i] = match n.parent {
                Some(p) => out[p] * local,
                None => local,
            };
        }
    }

    /// Every node's world matrix.
    pub fn worlds(&self) -> Vec<Mat4> {
        let mut out = Vec::new();
        self.worlds_into(&mut out);
        out
    }

    /// Whether node `i` is `root` or under it.
    pub fn under(&self, mut i: usize, root: usize) -> bool {
        loop {
            if i == root {
                return true;
            }
            match self.nodes[i].parent {
                Some(p) => i = p,
                None => return false,
            }
        }
    }

    /// The world box of the base pose of the prims `keep` takes under `root`.
    pub fn box_under(&self, root: usize, worlds: &[Mat4], keep: impl Fn(&Prim) -> bool) -> (Vec3, Vec3) {
        let (mut lo, mut hi) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
        for p in &self.prims {
            if self.nodes[p.node].hidden || !self.under(p.node, root) || !keep(p) {
                continue;
            }
            for v in &p.base {
                let w = worlds[p.node].transform_point3(Vec3::new(v[0], v[1], v[2]));
                lo = lo.min(w);
                hi = hi.max(w);
            }
        }
        (lo, hi)
    }
}
