// Discrete-step origami crane tutorial. The crane is baked as a real folded
// sequence (flat → preliminary base → bird base → … → crane). The raw solver
// gives only 25 sparse keyframes; lerping straight between them CRUSHES the paper
// (a 180° fold collapses to zero area at the midpoint — edges stretch ~100%).
//
// So we pre-bake a DENSE, near-isometric fold path offline (scripts/bake-dense):
// between every keyframe a position-based distance solver rolls the flap toward
// the target while holding every edge at its rest (flat) length and pinning the
// crease — producing `subPerStep` valid in-between frames per fold. Paper stays
// inextensible the whole way, so a plain lerp between adjacent DENSE frames is
// near-isometric and reads as real folding. No runtime physics → no flicker.

import frames from './crane-frames-dense.json';

const FRAMES = frames.frames as number[][]; // dense: nV*3 flat positions each
const TRIS = frames.tris as number[][]; // triangle vertex indices
const NV = frames.nV as number;
const SUB = frames.subPerStep as number; // dense frames per UI fold step
const DENSE_COUNT = FRAMES.length;

// Per-frame horizontal (x,z) bounding-box centre. Folding shifts a pose's mass
// off-origin; we subtract this centre (interpolated) at render time so the paper
// stays framed without baking the offset into the geometry.
const CENTERS = FRAMES.map(f => {
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

// Tidy the raw instruction descriptions for display. One per UI step.
export const STEP_DESCS = (frames.descs as string[]).map(d =>
  d
    .replace(/\s*\[NOT SHOWN\]\s*/g, '')
    .replace(/"/g, '')
    .trim(),
);
export const STEP_COUNT = STEP_DESCS.length - 1; // one Next per fold step (24)
export const FLOATS_PER_VERTEX = 8; // pos(3) + normal(3) + paperUV(2)

// Per-step total vertex path length (how much the paper actually moves in that
// fold). Folds vary ~30× in size; playing each over equal TIME makes big folds
// whip and small ones crawl — inconsistent between steps. So the renderer drives
// the animation at constant SPEED through this arc-space (duration ∝ size).
const STEP_ARC: number[] = [];
for (let i = 0; i < STEP_COUNT; i++) {
  let arc = 0;
  for (let s = i * SUB; s < (i + 1) * SUB; s++) {
    let d = 0;
    const p = FRAMES[s + 1];
    const q = FRAMES[s];
    for (let v = 0; v < NV; v++) {
      const k = v * 3;
      d += Math.hypot(p[k] - q[k], p[k + 1] - q[k + 1], p[k + 2] - q[k + 2]);
    }
    arc += d;
  }
  // floor so a near-zero "strengthen the crease" step still gets a small beat
  STEP_ARC.push(Math.max(arc, 3));
}
const CUMARC: number[] = [0];
for (let i = 0; i < STEP_COUNT; i++) CUMARC.push(CUMARC[i] + STEP_ARC[i]);
export const TOTAL_ARC = CUMARC[STEP_COUNT];

// Convert a UI step position [0,STEP_COUNT] ↔ arc position [0,TOTAL_ARC].
export const progressToArc = (p: number): number => {
  const pc = Math.max(0, Math.min(STEP_COUNT, p));
  const i = Math.min(STEP_COUNT - 1, Math.floor(pc));
  return CUMARC[i] + (pc - i) * STEP_ARC[i];
};
export const arcToProgress = (arc: number): number => {
  const a = Math.max(0, Math.min(TOTAL_ARC, arc));
  let i = 0;
  while (i < STEP_COUNT - 1 && CUMARC[i + 1] <= a) i++;
  const f = (a - CUMARC[i]) / STEP_ARC[i];
  return i + Math.max(0, Math.min(1, f));
};

// Per-vertex paper UV, locked to the flat rest sheet (frame 0), so the fibre/
// grain texture stays glued to the paper through every fold.
const REST = FRAMES[0];
const restU = (vi: number) => REST[vi * 3] * 0.5 + 0.5; // x in ±1 → 0..1
const restV = (vi: number) => REST[vi * 3 + 2] * 0.5 + 0.5; // z in ±1 → 0..1

const MODEL_SCALE = 0.85;

export interface FoldGeometry {
  vertexCount: number;
  vertexData: Float32Array;
  scratch: Float32Array; // interpolated vertex positions (NV*3)
  minY: number; // lowest point this frame (contact-shadow plane height)
}

export const createGeometry = (): FoldGeometry => ({
  vertexCount: TRIS.length * 3,
  vertexData: new Float32Array(TRIS.length * 3 * FLOATS_PER_VERTEX),
  scratch: new Float32Array(NV * 3),
  minY: 0,
});

export const resetGeometry = (_geo: FoldGeometry) => {};

// progress is in UI step units [0, STEP_COUNT]. Map it onto the dense frame
// timeline (×SUB) and lerp between adjacent dense frames — which are already a
// valid, near-isometric fold path, so this small lerp doesn't crush the paper.
export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const stepP = Math.max(0, Math.min(STEP_COUNT, progress));
  const dp = stepP * SUB;
  const i0 = Math.min(Math.floor(dp), DENSE_COUNT - 2);
  const i1 = i0 + 1;
  const t = dp - i0;
  const a = FRAMES[i0];
  const b = FRAMES[i1];

  const ox = CENTERS[i0].cx + (CENTERS[i1].cx - CENTERS[i0].cx) * t;
  const oz = CENTERS[i0].cz + (CENTERS[i1].cz - CENTERS[i0].cz) * t;

  const s = geo.scratch;
  let minY = Infinity;
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    const x = a[k] + (b[k] - a[k]) * t;
    const y = a[k + 1] + (b[k + 1] - a[k + 1]) * t;
    const z = a[k + 2] + (b[k + 2] - a[k + 2]) * t;
    s[k] = (x - ox) * MODEL_SCALE;
    s[k + 1] = y * MODEL_SCALE;
    s[k + 2] = (z - oz) * MODEL_SCALE;
    if (s[k + 1] < minY) minY = s[k + 1];
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
    o = push(out, o, ax, ay, az, nx, ny, nz, restU(TRIS[tr][0]), restV(TRIS[tr][0])); // prettier-ignore
    o = push(out, o, bx, by, bz, nx, ny, nz, restU(TRIS[tr][1]), restV(TRIS[tr][1])); // prettier-ignore
    o = push(out, o, cx, cy, cz, nx, ny, nz, restU(TRIS[tr][2]), restV(TRIS[tr][2])); // prettier-ignore
  }
};

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
