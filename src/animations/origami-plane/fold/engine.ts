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
// facets bend, the triangulation shows). Real paper folds rigidly: each flap
// stays flat and swings about its crease. Per step we partition the moving
// vertices into flaps and fit one rotation per flap (Horn's quaternion method),
// then drive the transition by rotating each flap about its crease line. A
// per-vertex residual term (baked pose minus the rigid prediction, applied
// linearly) corrects folds that aren't perfectly rigid so the end pose is still
// reproduced exactly.
// ---------------------------------------------------------------------------

// One rigid sub-rotation over a subset of vertices (a single flap hinging
// about one crease line), plus how well it fit (res).
interface SubHinge {
  ax: number;
  ay: number;
  az: number;
  angle: number;
  px: number; // a point on the crease line
  py: number;
  pz: number;
  res: number;
}

// A folding step: per-vertex cluster id (-1 = static), one SubHinge per cluster,
// and a per-vertex residual-correction vector. Motion is driven by rigid
// rotation of each cluster; `err` (b minus the rigid prediction, applied
// linearly over the step) guarantees the baked end pose is reproduced exactly
// even when a fold isn't perfectly a set of rigid rotations.
interface Step {
  cluster: Int8Array;
  subs: SubHinge[];
  err: Float32Array;
}

// Fit the single best rigid rotation carrying vertices `idx` from a→b (Horn's
// quaternion method) and return it only if it explains the motion well.
const fitRotation = (
  a: number[],
  b: number[],
  idx: number[],
): SubHinge | null => {
  const n = idx.length;
  if (n < 3) return null;
  let cax = 0;
  let cay = 0;
  let caz = 0;
  let cbx = 0;
  let cby = 0;
  let cbz = 0;
  for (const i of idx) {
    const k = i * 3;
    cax += a[k];
    cay += a[k + 1];
    caz += a[k + 2];
    cbx += b[k];
    cby += b[k + 1];
    cbz += b[k + 2];
  }
  cax /= n;
  cay /= n;
  caz /= n;
  cbx /= n;
  cby /= n;
  cbz /= n;

  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const i of idx) {
    const k = i * 3;
    const px = a[k] - cax;
    const py = a[k + 1] - cay;
    const pz = a[k + 2] - caz;
    const qx = b[k] - cbx;
    const qy = b[k + 1] - cby;
    const qz = b[k + 2] - cbz;
    H[0] += px * qx;
    H[1] += px * qy;
    H[2] += px * qz;
    H[3] += py * qx;
    H[4] += py * qy;
    H[5] += py * qz;
    H[6] += pz * qx;
    H[7] += pz * qy;
    H[8] += pz * qz;
  }

  const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = H;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  let shift = 1;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) shift += Math.abs(N[r][c]);
  for (let r = 0; r < 4; r++) N[r][r] += shift;
  let v = [1, 0.3, 0.3, 0.3]; // off-axis start so 180° rotations converge too
  for (let it = 0; it < 80; it++) {
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

  let res = 0;
  for (const i of idx) {
    const k = i * 3;
    const r = rotAxis(a[k] - cax, a[k + 1] - cay, a[k + 2] - caz, ax, ay, az, angle); // prettier-ignore
    res += Math.hypot(r[0] + cbx - b[k], r[1] + cby - b[k + 1], r[2] + cbz - b[k + 2]); // prettier-ignore
  }
  res /= n;
  if (angle < 0.02) return null;

  // Pivot on the rotation's fixed line: fixed points solve (I-R)x = T with
  // T = cb - R·ca. Add axis⊗axis to make (I-R) invertible, then solve.
  const rca = rotAxis(cax, cay, caz, ax, ay, az, angle);
  const tx = cbx - rca[0];
  const ty = cby - rca[1];
  const tz = cbz - rca[2];
  const col = (
    ex: number,
    ey: number,
    ez: number,
  ): [number, number, number] => {
    const r = rotAxis(ex, ey, ez, ax, ay, az, angle);
    const d = ax * ex + ay * ey + az * ez;
    return [ex - r[0] + ax * d, ey - r[1] + ay * d, ez - r[2] + az * d];
  };
  const pivot = solve3(col(1, 0, 0), col(0, 1, 0), col(0, 0, 1), tx, ty, tz);
  if (!pivot) return null;
  return { ax, ay, az, angle, px: pivot[0], py: pivot[1], pz: pivot[2], res };
};

// Build a step. Many folds move several flaps at once (e.g. a symmetric pair),
// which is not one rotation — so try a few partitions of the moving vertices
// (whole, split L/R, split front/back, quadrants) and pick the simplest one
// whose clusters all fit a clean rigid rotation; if none is clean, take the
// partition with the lowest residual. The chosen rotations drive the motion;
// the residual is corrected linearly so the baked end pose lands exactly.
const buildStep = (a: number[], b: number[]): Step => {
  const cluster = new Int8Array(NV).fill(-1);
  const err = new Float32Array(NV * 3);
  const staticOnly = (): Step => {
    for (let i = 0; i < NV * 3; i++) err[i] = b[i] - a[i];
    return { cluster, subs: [], err };
  };

  const mv: number[] = [];
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    const dx = b[k] - a[k];
    const dy = b[k + 1] - a[k + 1];
    const dz = b[k + 2] - a[k + 2];
    if (dx * dx + dy * dy + dz * dz > 0.02 * 0.02) mv.push(i);
  }
  if (mv.length < 3) return staticOnly();

  const median = (sel: (i: number) => number): number => {
    const vals = mv.map(sel).sort((p, q) => p - q);
    return vals[vals.length >> 1];
  };
  const mx = median(i => a[i * 3]);
  const mz = median(i => a[i * 3 + 2]);
  const partOf = (i: number, mode: number): number => {
    if (mode === 0) return 0;
    if (mode === 1) return a[i * 3] < mx ? 0 : 1;
    if (mode === 2) return a[i * 3 + 2] < mz ? 0 : 1;
    return (a[i * 3] < mx ? 0 : 1) + (a[i * 3 + 2] < mz ? 0 : 2);
  };

  let best: { used: number[][]; subs: SubHinge[]; maxRes: number } | null =
    null;
  for (const mode of [0, 1, 2, 3]) {
    const groups: number[][] = [[], [], [], []];
    for (const i of mv) groups[partOf(i, mode)].push(i);
    const used = groups.filter(g => g.length > 0);
    const fits = used.map(g => fitRotation(a, b, g));
    if (fits.some(f => f === null)) continue;
    const subs = fits as SubHinge[];
    const maxRes = Math.max(...subs.map(s => s.res));
    if (maxRes < 0.05) {
      best = { used, subs, maxRes };
      break; // fewest clusters that fit cleanly
    }
    if (!best || maxRes < best.maxRes) best = { used, subs, maxRes };
  }
  if (!best) return staticOnly();

  best.used.forEach((g, ci) => g.forEach(i => (cluster[i] = ci)));
  // Per-vertex residual = baked b minus the rigid prediction at full angle.
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    const c = cluster[i];
    let px = a[k];
    let py = a[k + 1];
    let pz = a[k + 2];
    if (c >= 0) {
      const s = best.subs[c];
      const r = rotAxis(a[k] - s.px, a[k + 1] - s.py, a[k + 2] - s.pz, s.ax, s.ay, s.az, s.angle); // prettier-ignore
      px = r[0] + s.px;
      py = r[1] + s.py;
      pz = r[2] + s.pz;
    }
    err[k] = b[k] - px;
    err[k + 1] = b[k + 1] - py;
    err[k + 2] = b[k + 2] - pz;
  }
  return { cluster, subs: best.subs, err };
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

const STEPS: Step[] = [];
for (let i = 0; i < NUM_FRAMES - 1; i++)
  STEPS.push(buildStep(RAW_FRAMES[i], RAW_FRAMES[i + 1]));

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
  minY: number; // lowest point this frame (contact-shadow plane height)
  cx: number; // horizontal footprint centre + half-extents, for the shadow blob
  cz: number;
  rx: number;
  rz: number;
}

export const createGeometry = (): FoldGeometry => ({
  vertexCount: TRIS.length * 3,
  vertexData: new Float32Array(TRIS.length * 3 * FLOATS_PER_VERTEX),
  scratch: new Float32Array(NV * 3),
  minY: 0,
  cx: 0,
  cz: 0,
  rx: 1,
  rz: 1,
});

export const resetGeometry = (_geo: FoldGeometry) => {};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const fp = Math.max(0, Math.min(NUM_FRAMES - 1, progress));
  // Clamp the step index so the final frame uses the last step at t=1 (which
  // reproduces it exactly) — STEPS has one entry per transition, not per frame.
  const i0 = Math.min(Math.floor(fp), NUM_FRAMES - 2);
  const i1 = i0 + 1;
  const t = fp - i0;
  const a = RAW_FRAMES[i0];

  // Re-centring is applied here as one interpolated translation (x,z), so the
  // raw geometry keeps its rigid relationships for the fold while staying framed.
  const ox = CENTERS[i0].cx + (CENTERS[i1].cx - CENTERS[i0].cx) * t;
  const oz = CENTERS[i0].cz + (CENTERS[i1].cz - CENTERS[i0].cz) * t;

  const s = geo.scratch;
  const step = STEPS[i0];
  const { cluster, subs, err } = step;
  let minY = Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  // Every flap rotates rigidly about its own crease by angle*t (so facets stay
  // flat and pinned at the crease). The residual `err` — the gap between the
  // rigid prediction and the baked pose for folds that aren't purely rigid — is
  // added linearly so the end pose is still reproduced exactly.
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    let x: number;
    let y: number;
    let z: number;
    const c = cluster[i];
    if (c >= 0) {
      const sub = subs[c];
      const r = rotAxis(
        a[k] - sub.px,
        a[k + 1] - sub.py,
        a[k + 2] - sub.pz,
        sub.ax,
        sub.ay,
        sub.az,
        sub.angle * t,
      );
      x = r[0] + sub.px + err[k] * t;
      y = r[1] + sub.py + err[k + 1] * t;
      z = r[2] + sub.pz + err[k + 2] * t;
    } else {
      x = a[k] + err[k] * t;
      y = a[k + 1] + err[k + 1] * t;
      z = a[k + 2] + err[k + 2] * t;
    }
    const sx = (x - ox) * MODEL_SCALE;
    const sy = y * MODEL_SCALE;
    const sz = (z - oz) * MODEL_SCALE;
    s[k] = sx;
    s[k + 1] = sy;
    s[k + 2] = sz;
    if (sy < minY) minY = sy;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sz < minZ) minZ = sz;
    if (sz > maxZ) maxZ = sz;
  }
  geo.minY = minY;
  geo.cx = (minX + maxX) / 2;
  geo.cz = (minZ + maxZ) / 2;
  geo.rx = (maxX - minX) / 2;
  geo.rz = (maxZ - minZ) / 2;

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
