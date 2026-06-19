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
// drifts to a different corner of the screen. Re-center every frame on its own
// horizontal (x,z) bounding-box centre so the paper stays framed at every step.
// Endpoints are centred before interpolation, so transitions glide to centre
// instead of sliding off-screen.
const FRAMES = RAW_FRAMES.map(f => {
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
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const g = f.slice();
  for (let i = 0; i < NV; i++) {
    g[i * 3] -= cx;
    g[i * 3 + 2] -= cz;
  }
  return g;
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

// Per-vertex paper UV, locked to the flat rest sheet (frame 0). Because it
// comes from the unfolded square, the fiber/grain texture stays glued to the
// paper through every fold — so it reads as real paper even when folded.
const REST = FRAMES[0];
const restU = (vi: number) => REST[vi * 3] * 0.5 + 0.5; // x in ±1 → 0..1
const restV = (vi: number) => REST[vi * 3 + 2] * 0.5 + 0.5; // z in ±1 → 0..1

export interface FoldGeometry {
  vertexCount: number;
  vertexData: Float32Array;
  scratch: Float32Array; // interpolated vertex positions (NV*3)
}

export const createGeometry = (): FoldGeometry => ({
  vertexCount: TRIS.length * 3,
  vertexData: new Float32Array(TRIS.length * 3 * FLOATS_PER_VERTEX),
  scratch: new Float32Array(NV * 3),
});

export const resetGeometry = (_geo: FoldGeometry) => {};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const fp = Math.max(0, Math.min(NUM_FRAMES - 1, progress));
  const i0 = Math.floor(fp);
  const i1 = Math.min(NUM_FRAMES - 1, i0 + 1);
  const t = fp - i0;
  const a = FRAMES[i0];
  const b = FRAMES[i1];

  // Interpolate the (smooth, pre-settled) frames — no physics, no flicker.
  // Scale the whole model down a touch so the paper doesn't crowd the frame.
  const s = geo.scratch;
  for (let k = 0; k < NV * 3; k++)
    s[k] = (a[k] + (b[k] - a[k]) * t) * MODEL_SCALE;

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
