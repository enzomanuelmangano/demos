// Discrete-step origami crane tutorial. Each baked frame is a real folded state
// (flat → preliminary base → bird base → … → crane), computed offline by a port
// of origamiodyssey's fold engine on the traditional-crane instruction tree.
// Next advances one step; we morph between consecutive states. No runtime
// physics → no flicker.

import frames from './crane-frames.json';

const FRAMES = frames.frames as number[][]; // each: nV*3 flat positions
const TRIS = frames.tris as number[][]; // triangle vertex indices
const NV = frames.nV as number;
const NUM_FRAMES = FRAMES.length;

export const STEP_DESCS = frames.descs as string[];
export const STEP_COUNT = NUM_FRAMES - 1; // one Next per fold step
export const FLOATS_PER_VERTEX = 6;

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
    o = push(out, o, ax, ay, az, nx, ny, nz);
    o = push(out, o, bx, by, bz, nx, ny, nz);
    o = push(out, o, cx, cy, cz, nx, ny, nz);
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
): number => {
  out[off] = x;
  out[off + 1] = y;
  out[off + 2] = z;
  out[off + 3] = nx;
  out[off + 4] = ny;
  out[off + 5] = nz;
  return off + FLOATS_PER_VERTEX;
};
