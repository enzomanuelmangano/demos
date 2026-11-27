//! The dizzy birds (onboarding/dizzy-birds.ts): three butter-yellow canaries made the ghost's
//! way (banded toon on the camera key, a dark inverted-hull contour of even width) that circle
//! close over his crown, banking into the turn and flapping, spring in one after another, and
//! pop away in turn when he stops reeling: each puffs up, is gone in a frame, and a burst of
//! feathers flies out where it was (one haptic per pop). The geometry is three's, rebuilt:
//! lobed spheres welded and smoothed, a cone beak, sphere eyes.

use glam::{Mat4, Quat, Vec3};

const BIRDS: usize = 3;
const LAP_SEC: f32 = 1.6;
const FLAP_HZ: f32 = 8.0;
const STAGGER_SEC: f32 = 0.09;
const ORBIT_RADIUS: f32 = 0.95;
const ORBIT_HEIGHT: f32 = 0.62;
const LEAVE_STAGGER_SEC: f32 = 0.13;
const SWELL_SEC: f32 = 0.1;
const POP_SWELL: f32 = 0.38;
/// Feathers a bird bursts into.
pub const FEATHERS: usize = 6;
const BURST_SEC: f32 = 0.32;
const BURST_REACH: f32 = 0.55;
const FEATHER_SIZE: f32 = 0.32;
const BOB: f32 = 0.07;
const BIRD_SIZE: f32 = 0.24;
const BANK: f32 = 0.38;
const PITCH: f32 = 0.25;
const POP_OMEGA: f32 = 15.0;
const POP_DAMPING: f32 = 0.6;
const STEP_SEC: f32 = 1.0 / 240.0;
const FRAME_LIMIT: f32 = 0.86;

/// The body's and the beak's three bands (lit, mid, shade), sRGB.
pub const BODY: [u32; 3] = [0xf6d77a, 0xe9bd55, 0xc8933c];
pub const BEAK: [u32; 3] = [0xee9c5a, 0xdc8045, 0xb4633a];
/// The ghost's own contour colour, and its width in body radii.
pub const CONTOUR: u32 = 0x080808;
pub const CONTOUR_WIDTH: f32 = 0.07;

/// A mesh the birds are made of.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Part {
    Body,
    WingL,
    WingR,
    Tuft,
    Beak,
    Eye,
    Feather,
}

/// Every part, in the order `meshes` builds them.
pub const PARTS: [Part; 7] = [Part::Body, Part::WingL, Part::WingR, Part::Tuft, Part::Beak, Part::Eye, Part::Feather];

/// How a part is drawn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Look {
    /// The body's toon, outlined.
    Body,
    /// The beak's toon, outlined.
    Beak,
    /// The contour's ink, flat, no outline (the eyes).
    Ink,
}

/// One part to draw this frame.
#[derive(Clone, Copy, Debug)]
pub struct Draw {
    pub part: Part,
    pub look: Look,
    pub model: Mat4,
}

/// The most parts a frame draws: per bird its six pieces and its six feathers.
pub const MAX_DRAWS: usize = BIRDS * (7 + FEATHERS);

// ————— geometry —————

/// A mesh: (position, normal) vertices and triangles.
pub struct Mesh {
    pub vertices: Vec<[f32; 6]>,
    pub indices: Vec<u32>,
}

type Lobe = (Vec3, f32, i32);

fn lobe_radius(d: Vec3, lobes: &[Lobe]) -> f32 {
    let mut r = 1.0;
    for (dir, amount, sharp) in lobes {
        r += amount * d.dot(*dir).max(0.0).powi(*sharp);
    }
    r
}

/// three's SphereGeometry: positions and triangles.
fn sphere(radius: f32, ws: u32, hs: u32) -> (Vec<Vec3>, Vec<u32>) {
    let mut pos = Vec::new();
    let mut grid = Vec::new();
    for iy in 0..=hs {
        let v = iy as f32 / hs as f32;
        let mut row = Vec::new();
        for ix in 0..=ws {
            let u = ix as f32 / ws as f32;
            let (phi, theta) = (u * std::f32::consts::TAU, v * std::f32::consts::PI);
            pos.push(Vec3::new(-radius * phi.cos() * theta.sin(), radius * theta.cos(), radius * phi.sin() * theta.sin()));
            row.push(pos.len() as u32 - 1);
        }
        grid.push(row);
    }
    let mut idx = Vec::new();
    for iy in 0..hs as usize {
        for ix in 0..ws as usize {
            let (a, b, c, d) = (grid[iy][ix + 1], grid[iy][ix], grid[iy + 1][ix], grid[iy + 1][ix + 1]);
            if iy != 0 {
                idx.extend([a, b, d]);
            }
            if iy != hs as usize - 1 {
                idx.extend([b, c, d]);
            }
        }
    }
    (pos, idx)
}

/// three's mergeVertices (positions to 4 decimals) then computeVertexNormals.
fn welded(pos: &[Vec3], idx: &[u32]) -> Mesh {
    let key = |p: Vec3| ((p.x * 1e4).round() as i64, (p.y * 1e4).round() as i64, (p.z * 1e4).round() as i64);
    let mut seen: Vec<((i64, i64, i64), u32)> = Vec::new();
    let mut remap = Vec::with_capacity(pos.len());
    let mut out: Vec<Vec3> = Vec::new();
    for p in pos {
        let k = key(*p);
        match seen.iter().find(|(q, _)| *q == k) {
            Some((_, i)) => remap.push(*i),
            None => {
                out.push(*p);
                let i = out.len() as u32 - 1;
                seen.push((k, i));
                remap.push(i);
            }
        }
    }
    let indices: Vec<u32> = idx.iter().map(|&i| remap[i as usize]).collect();
    let mut normals = vec![Vec3::ZERO; out.len()];
    for t in indices.chunks_exact(3) {
        let (a, b, c) = (out[t[0] as usize], out[t[1] as usize], out[t[2] as usize]);
        let n = (c - b).cross(a - b);
        for &i in t {
            normals[i as usize] += n;
        }
    }
    let vertices = out
        .iter()
        .zip(&normals)
        .map(|(p, n)| {
            let n = n.normalize_or_zero();
            [p.x, p.y, p.z, n.x, n.y, n.z]
        })
        .collect();
    Mesh { vertices, indices }
}

/// A sphere pushed out into lobes, then scaled: one surface, one silhouette, one contour.
fn lobed(lobes: &[Lobe], scale: Vec3, detail: u32, offset: Vec3) -> Mesh {
    let (pos, idx) = sphere(1.0, detail, (detail as f32 * 0.7).round() as u32);
    let pos: Vec<Vec3> = pos
        .into_iter()
        .map(|p| {
            let d = p.normalize();
            d * lobe_radius(d, lobes) * scale + offset
        })
        .collect();
    welded(&pos, &idx)
}

fn surface_at(dir: Vec3, lobes: &[Lobe], scale: Vec3) -> Vec3 {
    let d = dir.normalize();
    d * lobe_radius(d, lobes) * scale
}

/// three's ConeGeometry(radius, height, segments), turned to point along +Z.
fn cone(radius: f32, height: f32, segments: u32) -> Mesh {
    let half = height / 2.0;
    let slope = radius / height;
    let mut v: Vec<[f32; 6]> = Vec::new();
    let mut idx = Vec::new();
    let mut rows = [[0u32; 13]; 2];
    for (y, row) in rows.iter_mut().enumerate() {
        let r = y as f32 * radius;
        for x in 0..=segments {
            let t = x as f32 / segments as f32 * std::f32::consts::TAU;
            let n = Vec3::new(t.sin(), slope, t.cos()).normalize();
            v.push([r * t.sin(), -(y as f32) * height + half, r * t.cos(), n.x, n.y, n.z]);
            row[x as usize] = v.len() as u32 - 1;
        }
    }
    for x in 0..segments as usize {
        // The apex row has no first triangle.
        idx.extend([rows[1][x], rows[1][x + 1], rows[0][x + 1]]);
    }
    let centre = v.len() as u32;
    for _ in 1..=segments {
        v.push([0.0, -half, 0.0, 0.0, -1.0, 0.0]);
    }
    let ring = v.len() as u32;
    for x in 0..=segments {
        let t = x as f32 / segments as f32 * std::f32::consts::TAU;
        v.push([radius * t.sin(), -half, radius * t.cos(), 0.0, -1.0, 0.0]);
    }
    for x in 0..segments {
        idx.extend([ring + x + 1, ring + x, centre + x]);
    }
    // rotateX(π/2): (x, y, z) → (x, −z, y).
    for p in &mut v {
        *p = [p[0], -p[2], p[1], p[3], -p[5], p[4]];
    }
    Mesh { vertices: v, indices: idx }
}

fn v(x: f32, y: f32, z: f32) -> Vec3 {
    Vec3::new(x, y, z)
}

fn body_lobes() -> [Lobe; 2] {
    [(v(0.0, 0.62, 0.78).normalize(), 0.42, 4), (v(0.0, 0.3, -0.95).normalize(), 0.62, 10)]
}
const BODY_SCALE: Vec3 = Vec3::new(0.86, 0.84, 1.0);

/// The parts' meshes, in `PARTS` order.
pub fn meshes() -> Vec<Mesh> {
    let wing = |side: f32| lobed(&[(v(side, 0.0, -0.55).normalize(), 0.85, 3)], v(0.5, 0.11, 0.34), 18, v(0.42 * side, 0.0, -0.05));
    let (eye_pos, eye_idx) = sphere(0.1, 12, 8);
    let eye = Mesh {
        vertices: eye_pos
            .iter()
            .map(|p| {
                let n = p.normalize();
                [p.x, p.y, p.z, n.x, n.y, n.z]
            })
            .collect(),
        indices: eye_idx,
    };
    vec![
        lobed(&body_lobes(), BODY_SCALE, 28, Vec3::ZERO),
        wing(1.0),
        wing(-1.0),
        lobed(&[(v(0.0, 1.0, -0.35).normalize(), 1.6, 3)], v(0.16, 0.2, 0.16), 14, Vec3::ZERO),
        cone(0.17, 0.36, 12),
        eye,
        lobed(&[(v(0.0, 1.0, 0.0), 0.7, 3)], v(0.5, 0.75, 0.32), 12, Vec3::ZERO),
    ]
}

// ————— motion —————

fn smooth(x: f32) -> f32 {
    let c = x.clamp(0.0, 1.0);
    c * c * (3.0 - 2.0 * c)
}

/// three's Euler in `XYZ` order.
fn euler_xyz(x: f32, y: f32, z: f32) -> Quat {
    Quat::from_rotation_x(x) * Quat::from_rotation_y(y) * Quat::from_rotation_z(z)
}

#[derive(Clone, Copy, Default)]
struct Bird {
    shown: f32,
    speed: f32,
    exit_from: f32,
    flap: f32,
    burst_at: f32,
    burst_scale: f32,
    burst_pos: Vec3,
}

/// The three birds' state.
pub struct Birds {
    birds: [Bird; BIRDS],
    lap: f32,
    clock: f32,
    on_at: f32,
    off_at: f32,
    was_on: bool,
    draws: [Draw; MAX_DRAWS],
    count: usize,
    head_top: Vec3,
    beak_at: Vec3,
    eye_at: [Vec3; 2],
    feather_dirs: [Vec3; FEATHERS],
}

impl Default for Birds {
    fn default() -> Birds {
        let lobes = body_lobes();
        let eye_at = |side: f32| surface_at(v(0.42 * side, 0.68, 0.62), &lobes, BODY_SCALE) * 0.97;
        let mut feather_dirs = [Vec3::ZERO; FEATHERS];
        for (k, d) in feather_dirs.iter_mut().enumerate() {
            let a = k as f32 / FEATHERS as f32 * std::f32::consts::TAU;
            *d = v(a.cos(), 0.35 + 0.45 * (k % 2) as f32, a.sin()).normalize();
        }
        Birds {
            birds: [Bird { exit_from: -1.0, burst_at: -1.0, ..Default::default() }; BIRDS],
            lap: 0.0,
            clock: 0.0,
            on_at: -1.0,
            off_at: f32::NEG_INFINITY,
            was_on: false,
            draws: [Draw { part: Part::Body, look: Look::Body, model: Mat4::IDENTITY }; MAX_DRAWS],
            count: 0,
            head_top: surface_at(v(0.0, 0.92, 0.4), &lobes, BODY_SCALE) * 0.96,
            beak_at: surface_at(v(0.0, 0.5, 1.0), &lobes, BODY_SCALE) + v(0.0, 0.0, 0.12),
            eye_at: [eye_at(1.0), eye_at(-1.0)],
            feather_dirs,
        }
    }
}

impl Birds {
    /// Once per frame: `head` is the centre of his head in world space and `radius` its radius
    /// there; `view_proj` the camera's. Returns the pops this frame, one bit per bird.
    pub fn update(&mut self, dt: f32, on: bool, head: Vec3, radius: f32, view_proj: Mat4, reduced: bool) -> u32 {
        self.clock += dt;
        let clock = self.clock;
        if on && !self.was_on {
            self.on_at = clock;
        }
        if !on && self.was_on {
            self.off_at = clock;
        }
        self.was_on = on;
        if !reduced {
            self.lap += dt / LAP_SEC * std::f32::consts::TAU;
        }
        let inv = view_proj.inverse();
        let mut pops = 0;
        self.count = 0;
        for i in 0..BIRDS {
            let b = &mut self.birds[i];
            let leave_at = if on { f32::INFINITY } else { self.off_at + i as f32 * LEAVE_STAGGER_SEC };
            let exit_t = if reduced { -1.0 } else { clock - leave_at };
            let mut popping = false;
            if exit_t >= 0.0 && b.shown > 0.0 {
                if b.exit_from < 0.0 {
                    b.exit_from = b.shown;
                }
                b.shown = b.exit_from * (1.0 + POP_SWELL * smooth(exit_t / SWELL_SEC));
                b.speed = 0.0;
                popping = exit_t >= SWELL_SEC;
            } else {
                b.exit_from = -1.0;
                let want = if (on && clock - self.on_at >= i as f32 * STAGGER_SEC) || (!on && clock < leave_at && b.shown > 0.0) { 1.0 } else { 0.0 };
                if reduced {
                    b.shown += (want - b.shown) * (dt * 8.0).min(1.0);
                    b.speed = 0.0;
                } else {
                    let mut left = dt;
                    while left > 0.0 {
                        let h = left.min(STEP_SEC);
                        let accel = POP_OMEGA * POP_OMEGA * (want - b.shown) - 2.0 * POP_DAMPING * POP_OMEGA * b.speed;
                        b.speed += accel * h;
                        b.shown += b.speed * h;
                        left -= STEP_SEC;
                    }
                }
                if want == 0.0 && b.shown < 0.002 && b.speed.abs() < 0.01 {
                    b.shown = 0.0;
                    b.speed = 0.0;
                }
            }

            let a = self.lap + i as f32 * std::f32::consts::TAU / BIRDS as f32;
            let wave = a * 2.0 + i as f32;
            let bob = if reduced { 0.0 } else { wave.sin() * BOB };
            let mut pos = head + v(a.cos() * ORBIT_RADIUS * radius, (ORBIT_HEIGHT + bob) * radius, a.sin() * ORBIT_RADIUS * radius);
            // Kept inside the canvas, pulled back in at the same depth.
            let ndc = view_proj.project_point3(pos);
            if ndc.x.abs() > FRAME_LIMIT || ndc.y.abs() > FRAME_LIMIT {
                pos = inv.project_point3(v(ndc.x.clamp(-FRAME_LIMIT, FRAME_LIMIT), ndc.y.clamp(-FRAME_LIMIT, FRAME_LIMIT), ndc.z));
            }

            if popping {
                b.burst_pos = pos;
                b.burst_at = clock;
                b.burst_scale = BIRD_SIZE * radius * b.exit_from;
                b.shown = 0.0;
                b.exit_from = -1.0;
                pops |= 1 << i;
            }

            // The burst runs on its own clock.
            if b.burst_at >= 0.0 {
                let u = (clock - b.burst_at) / BURST_SEC;
                if u >= 1.0 {
                    b.burst_at = -1.0;
                } else {
                    let out = 1.0 - (1.0 - u).powi(3);
                    let size = b.burst_scale * FEATHER_SIZE * (1.0 - smooth(u));
                    for k in 0..FEATHERS {
                        let mut p = self.feather_dirs[k] * (out * BURST_REACH * radius);
                        p.y -= u * u * 0.18 * radius;
                        let spin = if k % 2 == 1 { 1.0 } else { -1.0 };
                        let r = euler_xyz(k as f32 * 1.1, k as f32 * 0.7, k as f32 * 0.5 + u * 2.4 * spin);
                        self.draws[self.count] =
                            Draw { part: Part::Feather, look: Look::Body, model: Mat4::from_scale_rotation_translation(Vec3::splat(size), r, b.burst_pos + p) };
                        self.count += 1;
                    }
                }
            }

            let shown = b.shown.max(0.0);
            if shown <= 0.0 {
                continue;
            }
            // Facing along the lap, banked toward the centre, nose up as it rises (YXZ).
            let rot = Quat::from_rotation_y((-a.sin()).atan2(a.cos()))
                * Quat::from_rotation_x(if reduced { 0.0 } else { -PITCH * wave.cos() })
                * Quat::from_rotation_z(if reduced { 0.0 } else { BANK });
            let root = Mat4::from_scale_rotation_translation(Vec3::splat(BIRD_SIZE * radius * shown), rot, pos);
            b.flap += dt * FLAP_HZ * std::f32::consts::TAU;
            let flap = if reduced { 0.25 } else { 0.3 + 0.6 * (b.flap + i as f32 * 1.7).sin() };
            let at = |p: Vec3| root * Mat4::from_translation(p);
            let parts = [
                (Part::Body, Look::Body, root),
                (Part::Tuft, Look::Body, at(self.head_top)),
                (Part::Beak, Look::Beak, at(self.beak_at)),
                (Part::Eye, Look::Ink, at(self.eye_at[0])),
                (Part::Eye, Look::Ink, at(self.eye_at[1])),
                (Part::WingL, Look::Body, root * Mat4::from_rotation_translation(Quat::from_rotation_z(flap), v(0.5, 0.18, 0.0))),
                (Part::WingR, Look::Body, root * Mat4::from_rotation_translation(Quat::from_rotation_z(-flap), v(-0.5, 0.18, 0.0))),
            ];
            for (part, look, model) in parts {
                self.draws[self.count] = Draw { part, look, model };
                self.count += 1;
            }
        }
        pops
    }

    /// What to draw this frame.
    pub fn draws(&self) -> &[Draw] {
        &self.draws[..self.count]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn camera() -> Mat4 {
        Mat4::perspective_rh(0.85, 1.0, 0.1, 100.0) * Mat4::look_at_rh(v(0.0, 0.0, 6.0), Vec3::ZERO, Vec3::Y)
    }

    #[test]
    fn they_spring_in_one_after_another_then_pop_in_turn() {
        let mut b = Birds::default();
        let mut pops = Vec::new();
        for f in 0..240 {
            let on = f < 120;
            let p = b.update(1.0 / 60.0, on, Vec3::ZERO, 1.0, camera(), false);
            if f == 60 {
                assert_eq!(b.draws().len(), 21, "three birds of seven parts");
            }
            for i in 0..3 {
                if p & (1 << i) != 0 {
                    pops.push((f, i));
                }
            }
        }
        assert_eq!(pops.iter().map(|p| p.1).collect::<Vec<_>>(), vec![0, 1, 2]);
        assert!(pops[1].0 > pops[0].0 && pops[2].0 > pops[1].0);
        assert!(b.draws().is_empty(), "gone once the feathers settle");
    }

    #[test]
    fn the_meshes_are_closed_and_smooth() {
        for m in meshes() {
            assert!(!m.indices.is_empty());
            assert!(m.vertices.iter().all(|v| (v[3] * v[3] + v[4] * v[4] + v[5] * v[5] - 1.0).abs() < 1e-3));
        }
    }
}
