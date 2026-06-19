// Discrete-step origami crane tutorial. Each baked frame is a real folded state
// (flat → preliminary base → bird base → … → crane), computed offline by a port
// of origamiodyssey's fold engine on the traditional-crane instruction tree.
// Next advances one step; we morph between consecutive states. No runtime
// physics → no flicker.

import frames from './crane-frames.json';

const RAW_FRAMES = frames.frames as number[][]; // each: nV*3 flat positions
const TRIS = frames.tris as number[][]; // triangle vertex indices
const NV = frames.nV as number;
const NUM_FRAMES = RAW_FRAMES.length;

// Folding about an edge shifts a pose's mass off-origin, so each raw frame
// drifts to a different corner of the screen. Rather than bake the offset into
// the geometry (which would corrupt the rigid-fold fit below — the "static"
// sheet would appear to move between frames), keep the RAW frames and store the
// per-frame horizontal (x,z) bounding-box centre. The centre is subtracted as
// a single translation at render time, interpolated across the step, so the
// paper stays framed while every rigid relationship between poses is preserved.
const CENTERS = RAW_FRAMES.map(f => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < NV; i++) {
    const x = f[i * 3];
    const z = f[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
});

// Tidy the raw instruction descriptions for display (drop solver annotations
// like "[NOT SHOWN]" and the literal quotes around fold names).
export const STEP_DESCS = (frames.descs as string[]).map(d =>
  d
    .replace(/\s*\[NOT SHOWN\]\s*/g, '')
    .replace(/"/g, '')
    .trim(),
);
export const STEP_COUNT = NUM_FRAMES - 1; // one Next per fold step
export const FLOATS_PER_VERTEX = 8; // pos(3) + normal(3) + paperUV(2)

// ---------------------------------------------------------------------------
// Rigid hinge folding.
//
// A straight vertex lerp between two coplanar poses warps the moving flap (the
// facets bend, the triangulation shows). Real paper folds rigidly: the flap
// stays flat and swings about the crease. For each consecutive pose pair we fit
// the single best rotation that carries the moving vertices from a→b (Horn's
// quaternion method). When the fit is good the step is a single rigid fold, so
// we rotate the flap rigidly through the transition. When it isn't (the
// coupled collapse / petal folds move several flaps at once) we fall back to
// the lerped arc.
// ---------------------------------------------------------------------------

interface Hinge {
  rigid: boolean;
  moving: Uint8Array; // per-vertex: 1 if part of the rotating flap
  ax: number; // rotation axis (unit)
  ay: number;
  az: number;
  angle: number; // total rotation angle a→b
  // A point on the crease line (the fixed axis of the rotation). The flap
  // rotates about this line, so the crease edge stays pinned to the sheet.
  px: number;
  py: number;
  pz: number;
}

const buildHinge = (a: number[], b: number[]): Hinge => {
  const moving = new Uint8Array(NV);
  let n = 0;
  let cax = 0;
  let cay = 0;
  let caz = 0;
  let cbx = 0;
  let cby = 0;
  let cbz = 0;
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    const dx = b[k] - a[k];
    const dy = b[k + 1] - a[k + 1];
    const dz = b[k + 2] - a[k + 2];
    if (dx * dx + dy * dy + dz * dz > 0.02 * 0.02) {
      moving[i] = 1;
      n++;
      cax += a[k];
      cay += a[k + 1];
      caz += a[k + 2];
      cbx += b[k];
      cby += b[k + 1];
      cbz += b[k + 2];
    }
  }
  const flat: Hinge = {
    rigid: false,
    moving,
    ax: 0,
    ay: 1,
    az: 0,
    angle: 0,
    px: 0,
    py: 0,
    pz: 0,
  };
  if (n < 3) return flat;
  cax /= n;
  cay /= n;
  caz /= n;
  cbx /= n;
  cby /= n;
  cbz /= n;

  // Cross-covariance H = Σ (a_i - ca) (b_i - cb)^T over moving vertices.
  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < NV; i++) {
    if (!moving[i]) continue;
    const k = i * 3;
    const px = a[k] - cax;
    const py = a[k + 1] - cay;
    const pz = a[k + 2] - caz;
    const qx = b[k] - cbx;
    const qy = b[k + 1] - cby;
    const qz = b[k + 2] - cbz;
    H[0] += px * qx;
    H[1] += px * qy;
    H[2] += px * qz; // prettier-ignore
    H[3] += py * qx;
    H[4] += py * qy;
    H[5] += py * qz; // prettier-ignore
    H[6] += pz * qx;
    H[7] += pz * qy;
    H[8] += pz * qz; // prettier-ignore
  }

  // Horn's 4x4 symmetric matrix; its largest eigenvector is the rotation
  // quaternion (w, x, y, z).
  const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = H;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  // Power-iterate on N + sI (shifted positive) for the dominant eigenvector.
  let shift = 1;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) shift += Math.abs(N[r][c]);
  for (let r = 0; r < 4; r++) N[r][r] += shift;
  let v = [1, 0, 0, 0];
  for (let it = 0; it < 64; it++) {
    const nv = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++)
      nv[r] = N[r][0] * v[0] + N[r][1] * v[1] + N[r][2] * v[2] + N[r][3] * v[3];
    const len = Math.hypot(nv[0], nv[1], nv[2], nv[3]) || 1;
    v = [nv[0] / len, nv[1] / len, nv[2] / len, nv[3] / len];
  }
  let [qw, qx, qy, qz] = v;
  if (qw < 0) {
    qw = -qw;
    qx = -qx;
    qy = -qy;
    qz = -qz;
  }
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, qw)));
  const sh = Math.sqrt(Math.max(0, 1 - qw * qw)) || 1;
  const ax = qx / sh;
  const ay = qy / sh;
  const az = qz / sh;

  // Residual: how well one rigid rotation about (ca→cb) explains the motion.
  let res = 0;
  for (let i = 0; i < NV; i++) {
    if (!moving[i]) continue;
    const k = i * 3;
    const px = a[k] - cax;
    const py = a[k + 1] - cay;
    const pz = a[k + 2] - caz;
    const r = rotAxis(px, py, pz, ax, ay, az, angle);
    const ex = r[0] + cbx - b[k];
    const ey = r[1] + cby - b[k + 1];
    const ez = r[2] + cbz - b[k + 2];
    res += Math.hypot(ex, ey, ez);
  }
  res /= n;

  // Pivot = a point on the rotation's fixed line (the crease). The rigid motion
  // is b = R·a + T with T = cb - R·ca; fixed points solve (I - R) x = T. (I-R)
  // is singular along the axis, so add axis⊗axis to make it invertible and
  // solve — this yields the crease point closest to the origin.
  const rca = rotAxis(cax, cay, caz, ax, ay, az, angle);
  const tx = cbx - rca[0];
  const ty = cby - rca[1];
  const tz = cbz - rca[2];
  // Columns of A' = (I - R) + axis⊗axis, computed by applying it to e_x,e_y,e_z.
  const col = (
    ex: number,
    ey: number,
    ez: number,
  ): [number, number, number] => {
    const r = rotAxis(ex, ey, ez, ax, ay, az, angle);
    const d = ax * ex + ay * ey + az * ez;
    return [ex - r[0] + ax * d, ey - r[1] + ay * d, ez - r[2] + az * d];
  };
  const c0 = col(1, 0, 0);
  const c1 = col(0, 1, 0);
  const c2 = col(0, 0, 1);
  const pivot = solve3(c0, c1, c2, tx, ty, tz);

  return {
    rigid: res < 0.06 && angle > 0.05 && pivot !== null,
    moving,
    ax,
    ay,
    az,
    angle,
    px: pivot ? pivot[0] : 0,
    py: pivot ? pivot[1] : 0,
    pz: pivot ? pivot[2] : 0,
  };
};

// Solve a 3x3 system [c0 c1 c2]·x = t (columns given). Returns null if singular.
const solve3 = (
  c0: [number, number, number],
  c1: [number, number, number],
  c2: [number, number, number],
  tx: number,
  ty: number,
  tz: number,
): [number, number, number] | null => {
  const det =
    c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c1[0] * (c0[1] * c2[2] - c0[2] * c2[1]) +
    c2[0] * (c0[1] * c1[2] - c0[2] * c1[1]);
  if (Math.abs(det) < 1e-6) return null;
  const id = 1 / det;
  // Cramer's rule.
  const dx =
    tx * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c1[0] * (ty * c2[2] - tz * c2[1]) +
    c2[0] * (ty * c1[2] - tz * c1[1]);
  const dy =
    c0[0] * (ty * c2[2] - tz * c2[1]) -
    tx * (c0[1] * c2[2] - c0[2] * c2[1]) +
    c2[0] * (c0[1] * tz - c0[2] * ty);
  const dz =
    c0[0] * (c1[1] * tz - c1[2] * ty) -
    c1[0] * (c0[1] * tz - c0[2] * ty) +
    tx * (c0[1] * c1[2] - c0[2] * c1[1]);
  return [dx * id, dy * id, dz * id];
};

// Rotate (x,y,z) about unit axis (ax,ay,az) by `angle` (Rodrigues).
const rotAxis = (
  x: number,
  y: number,
  z: number,
  ax: number,
  ay: number,
  az: number,
  angle: number,
): [number, number, number] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = x * ax + y * ay + z * az;
  // v*c + (axis×v)*s + axis*(axis·v)*(1-c)
  const cx = ay * z - az * y;
  const cy = az * x - ax * z;
  const cz = ax * y - ay * x;
  return [
    x * c + cx * s + ax * dot * (1 - c),
    y * c + cy * s + ay * dot * (1 - c),
    z * c + cz * s + az * dot * (1 - c),
  ];
};

const HINGES: Hinge[] = [];
for (let i = 0; i < NUM_FRAMES - 1; i++)
  HINGES.push(buildHinge(RAW_FRAMES[i], RAW_FRAMES[i + 1]));

// Per-vertex paper UV, locked to the flat rest sheet (frame 0). Because it
// comes from the unfolded square, the fiber/grain texture stays glued to the
// paper through every fold — so it reads as real paper even when folded.
const REST = RAW_FRAMES[0];
const restU = (vi: number) => REST[vi * 3] * 0.5 + 0.5; // x in ±1 → 0..1
const restV = (vi: number) => REST[vi * 3 + 2] * 0.5 + 0.5; // z in ±1 → 0..1

export interface FoldGeometry {
  vertexCount: number;
  vertexData: Float32Array;
  scratch: Float32Array; // interpolated vertex positions (NV*3)
  minY: number; // lowest point this frame (for the contact shadow plane)
}

export const createGeometry = (): FoldGeometry => ({
  vertexCount: TRIS.length * 3,
  vertexData: new Float32Array(TRIS.length * 3 * FLOATS_PER_VERTEX),
  scratch: new Float32Array(NV * 3),
  minY: 0,
});

export const resetGeometry = (_geo: FoldGeometry) => {};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const fp = Math.max(0, Math.min(NUM_FRAMES - 1, progress));
  const i0 = Math.floor(fp);
  const i1 = Math.min(NUM_FRAMES - 1, i0 + 1);
  const t = fp - i0;
  const a = RAW_FRAMES[i0];
  const b = RAW_FRAMES[i1];

  // Re-centring is applied here as one interpolated translation (x,z), so the
  // raw geometry keeps its rigid relationships for the fold while staying framed.
  const ox = CENTERS[i0].cx + (CENTERS[i1].cx - CENTERS[i0].cx) * t;
  const oz = CENTERS[i0].cz + (CENTERS[i1].cz - CENTERS[i0].cz) * t;

  const s = geo.scratch;
  const hinge = HINGES[i0];
  let minY = Infinity;
  if (hinge && hinge.rigid && t > 0 && t < 1) {
    // Rigid fold: rotate the moving flap as one flat panel about the crease
    // LINE by angle*t. Vertices on the crease are fixed, so the flap's hinge
    // edge stays pinned to the sheet for the whole motion — no detaching, no
    // warping, no triangulation showing. The static sheet holds its pose.
    const at = hinge.angle * t;
    for (let i = 0; i < NV; i++) {
      const k = i * 3;
      let x: number;
      let y: number;
      let z: number;
      if (hinge.moving[i]) {
        const r = rotAxis(
          a[k] - hinge.px,
          a[k + 1] - hinge.py,
          a[k + 2] - hinge.pz,
          hinge.ax,
          hinge.ay,
          hinge.az,
          at,
        );
        x = r[0] + hinge.px;
        y = r[1] + hinge.py;
        z = r[2] + hinge.pz;
      } else {
        x = a[k];
        y = a[k + 1];
        z = a[k + 2];
      }
      s[k] = (x - ox) * MODEL_SCALE;
      s[k + 1] = y * MODEL_SCALE;
      s[k + 2] = (z - oz) * MODEL_SCALE;
      if (s[k + 1] < minY) minY = s[k + 1];
    }
  } else {
    // Coupled / non-rigid step (or an exact endpoint): lerp the poses and add a
    // hinge arc so moving parts swing out of plane instead of sliding across it.
    const arc = Math.sin(Math.PI * t);
    for (let i = 0; i < NV; i++) {
      const k = i * 3;
      const dx = b[k] - a[k];
      const dy = b[k + 1] - a[k + 1];
      const dz = b[k + 2] - a[k + 2];
      const lift = arc * 0.5 * Math.hypot(dx, dy, dz);
      s[k] = (a[k] + dx * t - ox) * MODEL_SCALE;
      s[k + 1] = (a[k + 1] + dy * t + lift) * MODEL_SCALE;
      s[k + 2] = (a[k + 2] + dz * t - oz) * MODEL_SCALE;
      if (s[k + 1] < minY) minY = s[k + 1];
    }
  }
  geo.minY = minY;

  const out = geo.vertexData;
  let o = 0;
  for (let tr = 0; tr < TRIS.length; tr++) {
    const ia = TRIS[tr][0] * 3;
    const ib = TRIS[tr][1] * 3;
    const ic = TRIS[tr][2] * 3;
    const ax = s[ia];
    const ay = s[ia + 1];
    const az = s[ia + 2];
    const bx = s[ib];
    const by = s[ib + 1];
    const bz = s[ib + 2];
    const cx = s[ic];
    const cy = s[ic + 1];
    const cz = s[ic + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Layer separation (stacked coincident sheets) is done in clip space by
    // the vertex shader using the triangle index, so it doesn't open lateral
    // gaps between coplanar facets here.
    o = push(out, o, ax, ay, az, nx, ny, nz, restU(TRIS[tr][0]), restV(TRIS[tr][0])); // prettier-ignore
    o = push(out, o, bx, by, bz, nx, ny, nz, restU(TRIS[tr][1]), restV(TRIS[tr][1])); // prettier-ignore
    o = push(out, o, cx, cy, cz, nx, ny, nz, restU(TRIS[tr][2]), restV(TRIS[tr][2])); // prettier-ignore
  }
};

const MODEL_SCALE = 0.85;

const push = (
  out: Float32Array,
  off: number,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
): number => {
  out[off] = x;
  out[off + 1] = y;
  out[off + 2] = z;
  out[off + 3] = nx;
  out[off + 4] = ny;
  out[off + 5] = nz;
  out[off + 6] = u;
  out[off + 7] = v;
  return off + FLOATS_PER_VERTEX;
};
