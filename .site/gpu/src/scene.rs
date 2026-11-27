//! The intro's scene on the CPU: ghost.glb's nodes, meshes and node
//! animation, the camera the RN app solves for the opening shot, and the
//! eyes' expression and blink schedule. A port of
//! `apps/patterns/onboarding/ghost-scene-core.ts` (with `eye-rig.ts`), at
//! morph 0: the intro's first page at rest.

use glam::{Mat3, Mat4, Quat, Vec2, Vec3, Vec4};

/// The model, embedded: the same file the RN app ships.
pub const GLB: &[u8] = include_bytes!("../models/ghost.glb");

// ————— The camera, from Blender —————
const CAMERA_AT: Vec3 = Vec3::new(0.0, 5.6, 17.0);
const LOOK_AT: Vec3 = Vec3::new(0.0, 0.0, -6.8);
const CAM_LENS: f32 = 40.0;
const BOARD_YAW: f32 = std::f32::consts::FRAC_PI_4;
const START_FILL: f32 = 0.86;
const SCENE_FIT: f32 = 0.9;
const ORBIT_SETTLE: f32 = 0.42;
const ZOOM_FACTOR: f32 = 1.35;
/// The gap between the landed board and the copy (BOARD_COPY_GAP), points.
pub const BOARD_COPY_GAP: f32 = 24.0;

fn h_fov() -> f32 {
    2.0 * (36.0f32 / 2.0 / CAM_LENS).atan()
}

/// Vertical FOV in radians for a canvas aspect (the horizontal one is fixed).
pub fn v_fov(aspect: f32) -> f32 {
    2.0 * ((h_fov() / 2.0).tan() / aspect).atan()
}

/// What a mesh is drawn as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    TileLight,
    TileDark,
    /// The slab and base: the body colour.
    Body,
    /// `Board_Wire`, `Board_Inner_*`: the ghost's lit tone.
    Line,
    /// The collar: toon bands.
    Ghost,
    /// The veil: toon bands and the eyes.
    Veil,
}

pub struct Node {
    pub name: String,
    pub parent: Option<usize>,
    pub t: Vec3,
    pub r: Quat,
    pub s: Vec3,
}

pub struct Prim {
    pub node: usize,
    pub kind: Kind,
    pub double_sided: bool,
    /// Interleaved position, normal.
    pub vertices: Vec<[f32; 6]>,
    pub indices: Vec<u32>,
    pub min: Vec3,
    pub max: Vec3,
}

struct Track {
    node: usize,
    times: Vec<f32>,
    translations: Vec<Vec3>,
    rotations: Vec<Quat>,
}

pub struct Model {
    pub nodes: Vec<Node>,
    pub prims: Vec<Prim>,
    tracks: Vec<Track>,
    pub duration: f32,
}

impl Model {
    pub fn load() -> Result<Model, String> {
        let gltf = gltf::Gltf::from_slice(GLB).map_err(|e| format!("ghost.glb: {e}"))?;
        let blob = gltf.blob.as_deref();
        let doc = &gltf.document;
        let mut nodes: Vec<Node> = doc
            .nodes()
            .map(|n| {
                let (t, r, s) = n.transform().decomposed();
                Node { name: n.name().unwrap_or("").to_string(), parent: None, t: Vec3::from(t), r: Quat::from_array(r), s: Vec3::from(s) }
            })
            .collect();
        for n in doc.nodes() {
            for c in n.children() {
                nodes[c.index()].parent = Some(n.index());
            }
        }
        let part_of = |nodes: &[Node], mut i: usize| -> String {
            loop {
                let name = &nodes[i].name;
                if name.starts_with("Board") || name.starts_with("Ghost_") {
                    return name.clone();
                }
                match nodes[i].parent {
                    Some(p) => i = p,
                    None => return nodes[i].name.clone(),
                }
            }
        };
        let mut prims = Vec::new();
        for n in doc.nodes() {
            let Some(mesh) = n.mesh() else { continue };
            let part = part_of(&nodes, n.index());
            for p in mesh.primitives() {
                let reader = p.reader(|_| blob);
                let pos: Vec<[f32; 3]> = reader.read_positions().ok_or("ghost.glb: a primitive without positions")?.collect();
                let nor: Vec<[f32; 3]> = reader.read_normals().map(|n| n.collect()).unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; pos.len()]);
                let indices: Vec<u32> = match reader.read_indices() {
                    Some(i) => i.into_u32().collect(),
                    None => (0..pos.len() as u32).collect(),
                };
                let material = p.material().name().unwrap_or("").to_string();
                let kind = if part.starts_with("Board") {
                    if part.starts_with("Board_Tiles") {
                        if material.to_lowercase().contains("light") {
                            Kind::TileLight
                        } else {
                            Kind::TileDark
                        }
                    } else if material.starts_with("Ghost_Outline") {
                        Kind::Line
                    } else {
                        Kind::Body
                    }
                } else if part == "Ghost_Tail" {
                    Kind::Veil
                } else {
                    Kind::Ghost
                };
                let vertices = pos.iter().zip(&nor).map(|(p, n)| [p[0], p[1], p[2], n[0], n[1], n[2]]).collect();
                prims.push(Prim { node: n.index(), kind, double_sided: false, vertices, indices, min: Vec3::ZERO, max: Vec3::ZERO });
            }
        }
        let mut tracks: Vec<Track> = Vec::new();
        let mut duration = 0.0f32;
        for anim in doc.animations() {
            for ch in anim.channels() {
                let reader = ch.reader(|_| blob);
                let times: Vec<f32> = reader.read_inputs().ok_or("ghost.glb: no key times")?.collect();
                duration = duration.max(times.last().copied().unwrap_or(0.0));
                let node = ch.target().node().index();
                let at = match tracks.iter().position(|t| t.node == node) {
                    Some(i) => i,
                    None => {
                        tracks.push(Track { node, times: times.clone(), translations: Vec::new(), rotations: Vec::new() });
                        tracks.len() - 1
                    }
                };
                match reader.read_outputs() {
                    Some(gltf::animation::util::ReadOutputs::Translations(it)) => {
                        tracks[at].translations = it.map(Vec3::from).collect();
                    }
                    Some(gltf::animation::util::ReadOutputs::Rotations(r)) => {
                        tracks[at].rotations = r.into_f32().map(Quat::from_array).collect();
                    }
                    _ => {}
                }
            }
        }
        let mut model = Model { nodes, prims, tracks, duration };
        // The clip at its first frame, as the mixer leaves it before the first draw.
        model.pose(0.0);
        let worlds = model.worlds();
        for prim in &mut model.prims {
            if matches!(prim.kind, Kind::TileLight | Kind::TileDark) {
                close_tile_gaps(&mut prim.vertices);
            }
            if prim.kind == Kind::Line {
                prim.double_sided = !faces_up(prim, worlds[prim.node]);
            }
            let mut min = Vec3::splat(f32::INFINITY);
            let mut max = Vec3::splat(f32::NEG_INFINITY);
            for v in &prim.vertices {
                let p = Vec3::new(v[0], v[1], v[2]);
                min = min.min(p);
                max = max.max(p);
            }
            prim.min = min;
            prim.max = max;
        }
        Ok(model)
    }

    /// Sets the animated nodes to the clip at `seconds` (wrapped, as LoopRepeat).
    pub fn pose(&mut self, seconds: f32) {
        let t = if self.duration > 0.0 { seconds - self.duration * (seconds / self.duration).floor() } else { 0.0 };
        for track in &self.tracks {
            let n = &mut self.nodes[track.node];
            let times = &track.times;
            let (i, k) = if t <= times[0] {
                (0, 0.0)
            } else if t >= *times.last().unwrap() {
                (times.len() - 1, 0.0)
            } else {
                let i = times.partition_point(|&x| x <= t) - 1;
                (i, (t - times[i]) / (times[i + 1] - times[i]))
            };
            let j = (i + 1).min(times.len() - 1);
            if !track.translations.is_empty() {
                n.t = track.translations[i].lerp(track.translations[j], k);
            }
            if !track.rotations.is_empty() {
                n.r = slerp_flat(track.rotations[i], track.rotations[j], k);
            }
        }
    }

    /// The node named `name`.
    pub fn node_named(&self, name: &str) -> Option<usize> {
        self.nodes.iter().position(|n| n.name == name)
    }

    /// Whether node `i` is `root` or under it.
    fn under(&self, mut i: usize, root: usize) -> bool {
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

    /// The world box of everything under `root` (three's `Box3.setFromObject`).
    pub fn box_under(&self, root: usize, worlds: &[Mat4]) -> (Vec3, Vec3) {
        let (mut lo, mut hi) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
        for prim in &self.prims {
            if self.under(prim.node, root) {
                expand(&mut lo, &mut hi, prim, worlds[prim.node]);
            }
        }
        (lo, hi)
    }

    pub fn worlds(&self) -> Vec<Mat4> {
        let mut out = vec![None; self.nodes.len()];
        fn world(nodes: &[Node], out: &mut Vec<Option<Mat4>>, i: usize) -> Mat4 {
            if let Some(m) = out[i] {
                return m;
            }
            let n = &nodes[i];
            let local = Mat4::from_scale_rotation_translation(n.s, n.r, n.t);
            let m = match n.parent {
                Some(p) => world(nodes, out, p) * local,
                None => local,
            };
            out[i] = Some(m);
            m
        }
        (0..self.nodes.len()).map(|i| world(&self.nodes, &mut out, i)).collect()
    }
}

/// three's `Quaternion.slerpFlat`: shortest path, normalised lerp when nearly equal.
fn slerp_flat(a: Quat, b: Quat, t: f32) -> Quat {
    if t == 0.0 {
        return a;
    }
    if t == 1.0 {
        return b;
    }
    let (x0, y0, z0, w0) = (a.x, a.y, a.z, a.w);
    let (mut x1, mut y1, mut z1, mut w1) = (b.x, b.y, b.z, b.w);
    if w0 != w1 || x0 != x1 || y0 != y1 || z0 != z1 {
        let mut s = 1.0 - t;
        let cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
        let dir = if cos >= 0.0 { 1.0 } else { -1.0 };
        let sqr_sin = 1.0 - cos * cos;
        if sqr_sin > f32::EPSILON {
            let sin = sqr_sin.sqrt();
            let len = sin.atan2(cos * dir);
            s = (s * len).sin() / sin;
            let tt = (t * len).sin() / sin;
            let t_dir = tt * dir;
            let r = Quat::from_xyzw(x0 * s + x1 * t_dir, y0 * s + y1 * t_dir, z0 * s + z1 * t_dir, w0 * s + w1 * t_dir);
            return r;
        }
        let t_dir = t * dir;
        let q = Quat::from_xyzw(x0 * s + x1 * t_dir, y0 * s + y1 * t_dir, z0 * s + z1 * t_dir, w0 * s + w1 * t_dir);
        return q.normalize();
    }
    x1 = x0;
    y1 = y0;
    z1 = z0;
    w1 = w0;
    Quat::from_xyzw(x1, y1, z1, w1)
}

/// The RN app's `closeTileGaps`: quads smaller than the 0.75 pitch grow to meet.
fn close_tile_gaps(v: &mut [[f32; 6]]) {
    const PITCH: f32 = 0.75;
    if v.len() % 4 != 0 || v.is_empty() {
        return;
    }
    let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
    for p in &v[..4] {
        lo = lo.min(p[0]);
        hi = hi.max(p[0]);
    }
    let side = hi - lo;
    if side <= 0.0 || side >= PITCH {
        return;
    }
    let grow = PITCH / side;
    for q in v.chunks_mut(4) {
        let cx = q.iter().map(|p| p[0]).sum::<f32>() / 4.0;
        let cz = q.iter().map(|p| p[2]).sum::<f32>() / 4.0;
        for p in q {
            p[0] = cx + (p[0] - cx) * grow;
            p[2] = cz + (p[2] - cz) * grow;
        }
    }
}

fn faces_up(prim: &Prim, world: Mat4) -> bool {
    let normal = Mat3::from_mat4(world).inverse().transpose();
    if prim.indices.is_empty() || prim.indices.len() % 3 != 0 {
        return false;
    }
    prim.indices.chunks(3).all(|tri| {
        let p = |i: u32| {
            let v = prim.vertices[i as usize];
            Vec3::new(v[0], v[1], v[2])
        };
        let (a, b, c) = (p(tri[0]), p(tri[1]), p(tri[2]));
        let n = (normal * (b - a).cross(c - a)).normalize();
        n.y > 0.99
    })
}

fn box_corners(min: Vec3, max: Vec3) -> [Vec3; 8] {
    let mut out = [Vec3::ZERO; 8];
    let mut k = 0;
    for x in [min.x, max.x] {
        for y in [min.y, max.y] {
            for z in [min.z, max.z] {
                out[k] = Vec3::new(x, y, z);
                k += 1;
            }
        }
    }
    out
}

/// three's `Box3.expandByObject` (not precise): each geometry's box, carried to world.
fn expand(min: &mut Vec3, max: &mut Vec3, prim: &Prim, world: Mat4) {
    let (mut lo, mut hi) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
    for c in box_corners(prim.min, prim.max) {
        let p = world.transform_point3(c);
        lo = lo.min(p);
        hi = hi.max(p);
    }
    *min = min.min(lo);
    *max = max.max(hi);
}

/// What the opening shot is solved from; independent of the canvas.
pub struct Bounds {
    pub board_mid: Vec3,
    pub half_span: f32,
    board_corners: [Vec3; 8],
    scene_corners: [Vec3; 8],
}

impl Bounds {
    pub fn of(model: &mut Model) -> Bounds {
        model.pose(0.0);
        let worlds = model.worlds();
        let unyaw = Mat4::from_rotation_y(-BOARD_YAW);
        let (mut tlo, mut thi) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
        let (mut blo, mut bhi) = (tlo, thi);
        for prim in &model.prims {
            let w = worlds[prim.node];
            if matches!(prim.kind, Kind::TileLight | Kind::TileDark) {
                for v in &prim.vertices {
                    let p = unyaw.transform_point3(w.transform_point3(Vec3::new(v[0], v[1], v[2])));
                    tlo = tlo.min(p);
                    thi = thi.max(p);
                }
            }
            if matches!(prim.kind, Kind::TileLight | Kind::TileDark | Kind::Body | Kind::Line) {
                expand(&mut blo, &mut bhi, prim, w);
            }
        }
        let size = thi - tlo;
        let board_mid = Mat4::from_rotation_y(BOARD_YAW).transform_point3((tlo + thi) / 2.0);
        let half_span = size.x.max(size.z) / 2.0;
        // The whole orbit's bounds: 25 samples of the clip.
        let (mut slo, mut shi) = (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY));
        const SAMPLES: usize = 24;
        for i in 0..=SAMPLES {
            model.pose(model.duration * i as f32 / SAMPLES as f32);
            let worlds = model.worlds();
            for prim in &model.prims {
                expand(&mut slo, &mut shi, prim, worlds[prim.node]);
            }
        }
        model.pose(0.0);
        Bounds { board_mid, half_span, board_corners: box_corners(blo, bhi), scene_corners: box_corners(slo, shi) }
    }
}

/// `ease` in ghost-scene-core: a smoothstep that cannot be confused with TSL's.
pub fn ease(edge0: f32, edge1: f32, t: f32) -> f32 {
    let x = ((t - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

/// The board's local -Z in world space: screen-up at the landing, rank 8 on top.
pub fn board_up() -> Vec3 {
    Vec3::new(-BOARD_YAW.sin(), 0.0, -BOARD_YAW.cos())
}

const MORPH_ZOOM_TO: f32 = 0.65;
const MORPH_FLAT_FROM: f32 = 0.2;
/// Pulling back off the first page (ghost-scene-core.ts:148-159): how far the pager is dragged
/// to reach it (intro-clock.ts MORPH_BACK), and at full pull the turn round the arc (radians),
/// how much further out (of the opening distance) and the roll (radians).
pub const MORPH_BACK: f32 = 0.14;
const BACK_TILT: f32 = 0.13;
const BACK_PULL: f32 = 0.08;
const BACK_ROLL: f32 = 0.15;

/// The camera for a canvas of `width`×`height` points, at every point of the
/// morph: the opening orbit shot (`t` 0), the arc over the board, and the
/// overhead landing (`t` 1) where the board fills the width `land_shift`
/// points below the canvas's centre.
pub struct Rig {
    board_mid: Vec3,
    half_span: f32,
    start_dist: f32,
    start_zoom_dist: f32,
    land_height: f32,
    orbit_offset: Vec3,
    land_offset: Vec3,
    pub near: f32,
    pub far: f32,
    pub fov_y: f32,
    pub aspect: f32,
    pub width: f32,
    pub height: f32,
}

/// One camera pose.
pub struct Pose {
    pub eye: Vec3,
    pub target: Vec3,
    pub up: Vec3,
}

impl Rig {
    pub fn solve(b: &Bounds, width: f32, height: f32) -> Rig {
        let aspect = width / height;
        let up_world = Vec3::Y;
        let arc_dir = CAMERA_AT.normalize();
        let arc_dist = CAMERA_AT.length();
        let tan_h = (h_fov() / 2.0).tan();
        let tan_v = (v_fov(aspect) / 2.0).tan();
        let basis = |d: f32| {
            let eye = b.board_mid + arc_dir * d;
            let fwd = (b.board_mid - eye).normalize();
            let right = fwd.cross(up_world).normalize();
            let up = right.cross(fwd).normalize();
            (eye, fwd, right, up)
        };
        let mut start = arc_dist;
        for _ in 0..4 {
            let (eye, fwd, right, _) = basis(start);
            let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
            for c in b.board_corners {
                let v = c - eye;
                let z = v.dot(fwd);
                if z <= 1e-4 {
                    continue;
                }
                let x = v.dot(right) / (z * tan_h);
                lo = lo.min(x);
                hi = hi.max(x);
            }
            if !lo.is_finite() || hi <= lo {
                break;
            }
            start *= (hi - lo) / (2.0 * START_FILL);
        }
        let mut tall = arc_dist;
        for _ in 0..4 {
            let (eye, fwd, _, up) = basis(tall);
            let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
            for c in b.scene_corners {
                let v = c - eye;
                let z = v.dot(fwd);
                if z <= 1e-4 {
                    continue;
                }
                let y = v.dot(up) / (z * tan_v);
                lo = lo.min(y);
                hi = hi.max(y);
            }
            if !lo.is_finite() || hi <= lo {
                break;
            }
            tall *= (hi - lo) / (2.0 * SCENE_FIT);
        }
        let start_dist = start.max(tall);
        // The board lands BOARD_COPY_GAP above the canvas's bottom edge.
        let land_shift = height / 2.0 - width / 2.0 - BOARD_COPY_GAP;
        let (eye, fwd, _, up) = basis(start_dist);
        let mut lo = f32::INFINITY;
        for c in b.scene_corners {
            let v = c - eye;
            let z = v.dot(fwd);
            if z <= 1e-4 {
                continue;
            }
            lo = lo.min(v.dot(up) / (z * tan_v));
        }
        let shift = if lo.is_finite() {
            let scene_bottom = (1.0 - lo) / 2.0 * height;
            let landed_bottom = height / 2.0 + land_shift + width / 2.0;
            let delta = (landed_bottom - scene_bottom) * ORBIT_SETTLE;
            delta * start_dist * tan_v * 2.0 / height
        } else {
            0.0
        };
        let land_height = b.half_span / tan_h;
        let zoom = start_dist / ZOOM_FACTOR;
        let radius = b.scene_corners.iter().map(|c| c.distance(b.board_mid)).fold(0.0f32, f32::max);
        let nearest = start_dist.min(zoom).min(land_height);
        let farthest = start_dist.max(zoom).max(land_height);
        let pts_per_unit = width / (b.half_span * 2.0);
        Rig {
            board_mid: b.board_mid,
            half_span: b.half_span,
            start_dist,
            start_zoom_dist: zoom,
            land_height,
            orbit_offset: up * shift,
            land_offset: board_up() * if pts_per_unit > 0.0 { land_shift / pts_per_unit } else { 0.0 },
            near: (nearest - radius * 1.35).max(0.1),
            far: farthest + radius * 1.35,
            fov_y: v_fov(aspect),
            aspect,
            width,
            height,
        }
    }

    /// The camera at morph `t` (0 the orbit shot, 1 landed overhead; under 0, down to
    /// -`MORPH_BACK`, pulled back off the first page: turned back round the arc, further out and
    /// rolled, ghost-scene-core.ts:1851-1878).
    pub fn pose(&self, t: f32) -> Pose {
        let back = if t < 0.0 { (-t / MORPH_BACK).min(1.0) } else { 0.0 };
        let zoom_t = ease(0.0, MORPH_ZOOM_TO, t);
        let flat_t = ease(MORPH_FLAT_FROM, 1.0, t);
        let dist =
            ((self.start_dist + (self.start_zoom_dist - self.start_dist) * zoom_t) * (1.0 - flat_t) + self.land_height * flat_t) * (1.0 + BACK_PULL * back);
        let from_dir = (CAMERA_AT - Vec3::ZERO).normalize();
        let from_q = Quat::from_rotation_arc(Vec3::Y, from_dir);
        let mut arc_q = from_q.slerp(Quat::IDENTITY, flat_t);
        if back > 0.0 {
            // About the axis the morph swings about (ARC_AXIS = from × to).
            let axis = from_dir.cross(Vec3::Y).normalize();
            arc_q = Quat::from_axis_angle(axis, -BACK_TILT * back) * arc_q;
        }
        let arc_dir = arc_q * Vec3::Y;
        let eye = self.board_mid + arc_dir * dist + self.orbit_offset * (1.0 - flat_t) + self.land_offset * flat_t;
        let mut up = Vec3::Y.lerp(board_up(), flat_t).normalize();
        if back > 0.0 {
            // About the view direction: a roll, not a change of vantage.
            up = Quat::from_axis_angle(-arc_dir, BACK_ROLL * back) * up;
        }
        let target = LOOK_AT.lerp(self.board_mid, zoom_t) + self.orbit_offset * (1.0 - flat_t) + self.land_offset * flat_t;
        Pose { eye, target, up }
    }

    pub fn view_proj(&self, pose: &Pose) -> Mat4 {
        Mat4::perspective_rh(self.fov_y, self.aspect, self.near, self.far) * Mat4::look_at_rh(pose.eye, pose.target, pose.up)
    }

    /// The playing surface's a8, h8, h1, a1 corners in canvas points under `view_proj`.
    pub fn surface_quad(&self, view_proj: Mat4) -> [glam::Vec2; 4] {
        let up = board_up();
        let right = up.cross(Vec3::Y);
        let corner = |r: f32, u: f32| {
            let c = self.board_mid + right * (r * self.half_span) + up * (u * self.half_span);
            let p = view_proj.project_point3(c);
            glam::Vec2::new((p.x + 1.0) / 2.0 * self.width, (1.0 - p.y) / 2.0 * self.height)
        };
        [corner(-1.0, 1.0), corner(1.0, 1.0), corner(1.0, -1.0), corner(-1.0, -1.0)]
    }
}

// ————— Tones —————

/// sRGB bytes to linear, as three's ColorManagement does.
pub fn linear(rgb: u32) -> Vec3 {
    let c = |shift: u32| srgb_to_linear(((rgb >> shift) & 255) as f32 / 255.0);
    Vec3::new(c(16), c(8), c(0))
}

pub fn srgb_to_linear(c: f32) -> f32 {
    if c < 0.04045 {
        c * 0.0773993808
    } else {
        (c * 0.9478672986 + 0.0521327014).powf(2.4)
    }
}

/// `toneAt`: a position on background -> ink, mixed in sRGB bytes, then linear.
pub fn tone_at(background: u32, ink: u32, t: f32) -> Vec3 {
    let ch = |shift: u32| {
        let from = ((background >> shift) & 255) as f32;
        let to = ((ink >> shift) & 255) as f32;
        srgb_to_linear((from + (to - from) * t).round() / 255.0)
    };
    Vec3::new(ch(16), ch(8), ch(0))
}

pub const GHOST_BG: u32 = 0xf8f9fa;
pub const GHOST_INK: u32 = 0x2d3436;
pub const TONE_LIT: f32 = 0.06;
pub const TONE_MID: f32 = 0.2;
pub const TONE_SHADE: f32 = 0.545;
const EYE_INK: u32 = 0x303030;

// ————— The eyes (eye-rig.ts) —————

const AT_RAD: f32 = 0.269;
const APX_CURVE: [f32; 21] = [
    0.0, 0.0432, 0.0888, 0.1403, 0.2, 0.2712, 0.361, 0.4689, 0.5735, 0.6561, 0.7191, 0.7692, 0.8121, 0.8491, 0.8804, 0.9069, 0.9294, 0.9491, 0.9669, 0.9837,
    1.0,
];
/// Blender's APX_curve on the aperture at `k` (eye-rig.ts apxAt).
pub fn apx_at(k: f32) -> f32 {
    let x = k.clamp(0.0, 1.0) * (APX_CURVE.len() - 1) as f32;
    let i = (x.floor() as usize).min(APX_CURVE.len() - 2);
    APX_CURVE[i] + (APX_CURVE[i + 1] - APX_CURVE[i]) * (x - i as f32)
}
const EYE_SQ: f32 = 1.167;
const EYE_X: f32 = 0.361;
const EYE_H: f32 = 0.33;
const EYE_RAD_DEG: f32 = 15.61;
const EYE_SOFT_DEG: f32 = 0.7;
const GLINT_PX: f32 = 0.206;
const GLINT_SEAT: f32 = -0.26;

#[derive(Clone, Copy)]
pub struct Expr {
    w_l: f32,
    w_r: f32,
    h_l: f32,
    h_r: f32,
    ang_l: f32,
    ang_r: f32,
    frown_l: f32,
    frown_r: f32,
    glint_x: f32,
    glint_y: f32,
    yaw: f32,
    pitch: f32,
    spread: f32,
    open_mul: f32,
}

const NEUTRAL: Expr = Expr {
    w_l: 1.0,
    w_r: 1.0,
    h_l: 1.0,
    h_r: 1.0,
    ang_l: 0.0,
    ang_r: 0.0,
    frown_l: 0.0,
    frown_r: 0.0,
    glint_x: 0.0,
    glint_y: 0.0,
    yaw: 0.0,
    pitch: 0.0,
    spread: 0.0,
    open_mul: 1.0,
};

impl Expr {
    /// `self` moved toward `to` by `k` (0 none, 1 all of it), field by field.
    pub fn toward(&self, to: &Expr, k: f32) -> Expr {
        let (a, b) = (self.fields(), to.fields());
        let mut f = [0.0; 14];
        for i in 0..14 {
            f[i] = a[i] + (b[i] - a[i]) * k;
        }
        Expr::from_fields(f)
    }
    fn fields(&self) -> [f32; 14] {
        [
            self.w_l,
            self.w_r,
            self.h_l,
            self.h_r,
            self.ang_l,
            self.ang_r,
            self.frown_l,
            self.frown_r,
            self.glint_x,
            self.glint_y,
            self.yaw,
            self.pitch,
            self.spread,
            self.open_mul,
        ]
    }
    fn from_fields(f: [f32; 14]) -> Expr {
        Expr {
            w_l: f[0],
            w_r: f[1],
            h_l: f[2],
            h_r: f[3],
            ang_l: f[4],
            ang_r: f[5],
            frown_l: f[6],
            frown_r: f[7],
            glint_x: f[8],
            glint_y: f[9],
            yaw: f[10],
            pitch: f[11],
            spread: f[12],
            open_mul: f[13],
        }
    }
}

pub fn expression(name: &str) -> Expr {
    let n = NEUTRAL;
    match name {
        "attentive" => Expr { yaw: 4.0, pitch: 11.0, glint_y: 0.1, ..n },
        "down_gaze" => Expr { yaw: 2.0, pitch: -13.0, glint_y: -0.28, ..n },
        "curious_l" => Expr { yaw: -13.0, pitch: -11.0, w_l: 1.06, h_l: 1.06, ..n },
        "attentive_r" => Expr { yaw: 12.0, pitch: -13.0, w_r: 1.05, h_r: 1.05, ..n },
        "focused" => Expr { yaw: 2.0, pitch: -13.0, frown_l: 1.0, frown_r: 1.0, open_mul: 0.9, ..n },
        "found" => Expr { yaw: 2.0, pitch: -11.0, w_l: 1.04, w_r: 1.04, h_l: 1.12, h_r: 1.12, spread: 3.5, ..n },
        "skeptical" => Expr { yaw: -6.0, pitch: -14.0, frown_l: 1.0, frown_r: 0.0, ..n },
        // The poke's faces (faces.ts): `open` is `open_mul`.
        "surprised" => Expr { w_l: 1.1, w_r: 1.1, h_l: 1.15, h_r: 1.15, glint_y: 0.06, ..n },
        "shy" => Expr { yaw: 10.0, pitch: -10.0, h_l: 0.9, h_r: 0.9, glint_x: -0.1, ..n },
        "cross" => Expr { pitch: -8.0, frown_l: 1.0, frown_r: 1.0, open_mul: 0.85, spread: -2.0, ..n },
        "pleading" => Expr { yaw: 3.0, pitch: 11.0, w_l: 1.04, w_r: 1.04, h_l: 1.12, h_r: 1.12, spread: 3.5, ..n },
        _ => n,
    }
}

const BEATS: [(f32, &str); 21] = [
    (0.0, "attentive"),
    (1.1, "attentive"),
    (1.35, "down_gaze"),
    (2.6, "down_gaze"),
    (2.8, "curious_l"),
    (4.0, "curious_l"),
    (4.2, "attentive_r"),
    (5.2, "attentive_r"),
    (5.4, "focused"),
    (6.6, "focused"),
    (6.8, "curious_l"),
    (7.55, "curious_l"),
    (7.75, "skeptical"),
    (8.55, "skeptical"),
    (8.75, "focused"),
    (9.35, "focused"),
    (9.5, "found"),
    (10.7, "found"),
    (11.7, "pleading"),
    (12.2, "pleading"),
    (13.0, "attentive"),
];

pub fn expr_at(t: f32) -> Expr {
    for w in BEATS.windows(2) {
        let ((t0, n0), (t1, n1)) = (w[0], w[1]);
        if t < t0 || t > t1 {
            continue;
        }
        let k = if t1 == t0 {
            0.0
        } else {
            let x = (t - t0) / (t1 - t0);
            x * x * (3.0 - 2.0 * x)
        };
        let (a, b) = (expression(n0).fields(), expression(n1).fields());
        let mut f = [0.0; 14];
        for i in 0..14 {
            f[i] = a[i] + (b[i] - a[i]) * k;
        }
        return Expr::from_fields(f);
    }
    expression(BEATS[BEATS.len() - 1].1)
}

/// The blink schedule: the same blinks every loop.
fn openness_at(t: f32, duration: f32) -> f32 {
    const EVERY: f32 = 4.2;
    const VARY: f32 = 1.4;
    const CLOSE: f32 = 0.085;
    const SHUT: f32 = 0.035;
    const OPEN: f32 = 0.135;
    let span = CLOSE + SHUT + OPEN;
    let mut at = EVERY * 0.4;
    let mut i = 0u32;
    while at < duration + EVERY {
        let d = t - at;
        if (0.0..=span).contains(&d) {
            if d < CLOSE {
                return 1.0 - d / CLOSE;
            }
            if d < CLOSE + SHUT {
                return 0.0;
            }
            return (d - CLOSE - SHUT) / OPEN;
        }
        // JS doubles: |sin(i * 12.9898) * 43758.5453| % 1.
        let r = ((i as f64 * 12.9898).sin() * 43758.5453).abs() % 1.0;
        at += (EVERY as f64 + (r - 0.5) * 2.0 * VARY as f64).max(0.6) as f32;
        i += 1;
    }
    1.0
}

/// The eyes' uniforms for clip time `t` (seconds, already wrapped).
pub struct Eyes {
    pub u: [Vec3; 2],
    pub r: [Vec3; 2],
    pub rad: [f32; 2],
    pub sq: [f32; 2],
    pub glint_at: [Vec2; 2],
    pub glint_r: [f32; 2],
    pub frown: [f32; 2],
    pub ap: f32,
    pub ap_soft: f32,
    pub lid_curve: f32,
    pub frown_drop: f32,
    pub gate_lo: f32,
    pub gate_hi: f32,
    pub glint_soft: f32,
    pub k_soft: f32,
}

pub fn eyes_at(t: f32, duration: f32) -> Eyes {
    eyes_with(t, duration, expr_at(t))
}

/// The eyes for clip time `t` wearing expression `e` (the clip's, or a poke's over it).
pub fn eyes_with(t: f32, duration: f32, e: Expr) -> Eyes {
    eyes_open(0.04 + (1.0 - 0.04) * openness_at(t, duration), e)
}

/// A neutral face aimed by `yaw` and `pitch` (radians, ghost-materials.ts `setAim`: about
/// the vertical, then about the head's right axis), for the offer's mascot.
pub fn aimed(yaw: f32, pitch: f32) -> Expr {
    Expr { yaw: yaw.to_degrees(), pitch: -pitch.to_degrees(), ..NEUTRAL }
}

/// The eyes `open` (0 shut .. 1 open) wearing expression `e`.
pub fn eyes_open(open: f32, e: Expr) -> Eyes {
    let k = EYE_RAD_DEG.to_radians().sin();
    let k_soft = EYE_SOFT_DEG.to_radians().sin();
    let ap_lo = -0.0384 / AT_RAD * k;
    let ap_hi = 0.3717 / AT_RAD * k;
    let glint_of_eye = 0.08608 / AT_RAD;
    let open_now = open * e.open_mul;
    let ap_k = apx_at(open_now);
    let ap = ap_lo + ap_k * (ap_hi - ap_lo);
    let to_y = |x: f32, y: f32, z: f32| Vec3::new(x, z, -y).normalize();
    let dirs = [to_y(EYE_X, -0.86, EYE_H), to_y(-EYE_X, -0.86, EYE_H)];
    let gaze_up = Vec3::Y;
    let gaze_right = Vec3::new(-1.0, 0.0, 0.0);
    let mut out = Eyes {
        u: [Vec3::ZERO; 2],
        r: [Vec3::ZERO; 2],
        rad: [k; 2],
        sq: [1.0; 2],
        glint_at: [Vec2::ZERO; 2],
        glint_r: [0.0; 2],
        frown: [0.0; 2],
        ap,
        ap_soft: 0.0064 / AT_RAD * k,
        lid_curve: 0.9856 * AT_RAD / k,
        frown_drop: 0.12 / 0.269 * k,
        gate_lo: 0.0531 / AT_RAD * k,
        gate_hi: 0.1327 / AT_RAD * k,
        glint_soft: 0.003 / 0.08608,
        k_soft,
    };
    for i in 0..2 {
        let sgn = if i == 0 { 1.0 } else { -1.0 };
        let (w, h, ang) = if i == 0 { (e.w_l, e.h_l, e.ang_l) } else { (e.w_r, e.h_r, e.ang_r) };
        let q = Quat::from_axis_angle(gaze_up, (e.yaw + e.spread * sgn).to_radians()) * Quat::from_axis_angle(gaze_right, e.pitch.to_radians());
        let d = (q * dirs[i]).normalize();
        let mut u = gaze_up - d * gaze_up.dot(d);
        if u.length_squared() < 1e-8 {
            u = Vec3::Y;
        }
        u = u.normalize();
        let mut r = d.cross(u).normalize();
        if ang != 0.0 {
            let qa = Quat::from_axis_angle(d, (ang * sgn).to_radians());
            u = (qa * u).normalize();
            r = (qa * r).normalize();
        }
        let rad = k * w;
        let sq = (EYE_SQ * h / w.max(1e-4)).max(0.05);
        let half_u = rad * sq;
        out.u[i] = u;
        out.r[i] = r;
        out.rad[i] = rad;
        out.sq[i] = sq;
        out.glint_at[i] = Vec2::new((GLINT_PX + e.glint_x) * rad, (GLINT_SEAT * ap_k + e.glint_y) * half_u);
        out.glint_r[i] = (glint_of_eye * rad).min(0.42 * half_u);
        out.frown[i] = if i == 0 { e.frown_l } else { e.frown_r };
    }
    out
}

/// The scheme's colours: the page, the board, the glow.
#[derive(Clone, Copy)]
pub struct Palette {
    pub body: u32,
    pub light: u32,
    pub dark: u32,
    pub glow_core: u32,
    pub glow_halo: u32,
    pub glow_contact: u32,
    pub halo_gain: f32,
    pub contact_gain: f32,
}

pub const DARK: Palette = Palette {
    body: 0x040404,
    light: 0xFDE5D9,
    dark: 0xA48574,
    glow_core: 0xF5F3F1,
    glow_halo: 0xCBAA8E,
    glow_contact: 0xCBAA8E,
    halo_gain: 1.0,
    contact_gain: 1.0,
};

// The light page's board is the palette lifted by LIGHT_SCHEME_LIFT 0.04 in OKLCH lightness
// (use-board-palette.ts lightenPalette): sandstone's #FDE5D9 / #A48574 drawn #FFF2E6 / #B19180.
pub const LIGHT: Palette = Palette {
    body: 0x302A25,
    light: 0xFFF2E6,
    dark: 0xB19180,
    glow_core: 0xFFFFFF,
    glow_halo: 0xCBAA8E,
    glow_contact: 0x211911,
    halo_gain: 2.4,
    contact_gain: 0.55,
};

pub fn v4(v: Vec3) -> [f32; 4] {
    Vec4::new(v.x, v.y, v.z, 0.0).to_array()
}

pub fn eye_dark() -> Vec3 {
    linear(EYE_INK)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Past page 0 the camera pulls back (ghost-scene-core.ts:1851-1878): at full pull it is
    /// BACK_TILT further round the arc, BACK_PULL further out and rolled BACK_ROLL about its view.
    #[test]
    fn past_page_0_the_camera_pulls_back() {
        let mut model = Model::load().unwrap();
        let bounds = Bounds::of(&mut model);
        let rig = Rig::solve(&bounds, 420.0, 644.0);
        let arm = |p: &Pose| p.eye - rig.board_mid - rig.orbit_offset;
        let (rest, full, half) = (rig.pose(0.0), rig.pose(-MORPH_BACK), rig.pose(-MORPH_BACK / 2.0));
        let (a0, a1, ah) = (arm(&rest), arm(&full), arm(&half));
        assert!((a1.length() / a0.length() - (1.0 + BACK_PULL)).abs() < 1e-4);
        assert!((ah.length() / a0.length() - (1.0 + BACK_PULL / 2.0)).abs() < 1e-4);
        assert!((a0.angle_between(a1) - BACK_TILT).abs() < 1e-4);
        // Turned back away from overhead: the camera drops toward the board's plane.
        assert!(a1.normalize().y < a0.normalize().y);
        // The roll: `up` across the view turns by BACK_ROLL.
        let across = |up: Vec3, d: Vec3| (up - d * up.dot(d)).normalize();
        let d = a1.normalize();
        let rolled = across(full.up, d).angle_between(across(Vec3::Y, d));
        assert!((rolled - BACK_ROLL).abs() < 1e-3, "{rolled}");
        // Further than the full pull, nothing more.
        assert_eq!(rig.pose(-0.5).eye, full.eye);
        // On the forward side, nothing of it.
        assert_eq!(rig.pose(0.0).up, Vec3::Y);
    }
}
