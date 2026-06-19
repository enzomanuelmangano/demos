// Plays back the origami crane fold animation that was baked offline by the
// origuide spring solver (real traditional-crane crease pattern, folded from a
// flat square). Pre-computed frames → no runtime physics → no jitter/flicker.

import frames from './crane-frames.json';

const FRAMES = frames.frames as number[][]; // each: nV*3 flat positions
const TRIS = frames.tris as number[][]; // triangle vertex indices
const NV = frames.nV as number;
const NUM_FRAMES = FRAMES.length;

export const STEP_COUNT = 5; // Next advances through the baked fold in waves
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
  const p = Math.max(0, Math.min(1, progress / STEP_COUNT));
  const OPEN_END = 0.8; // stop before the crane flattens fully (keep it 3D)
  const fp = p * (NUM_FRAMES - 1) * OPEN_END;
  const i0 = Math.floor(fp);
  const i1 = Math.min(NUM_FRAMES - 1, i0 + 1);
  const t = fp - i0;
  const a = FRAMES[i0];
  const b = FRAMES[i1];

  // Interpolate the (smooth, pre-settled) frames — no physics, no flicker.
  const s = geo.scratch;
  for (let k = 0; k < NV * 3; k++) s[k] = a[k] + (b[k] - a[k]) * t;

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
    o = push(out, o, ax, ay, az, nx, ny, nz);
    o = push(out, o, bx, by, bz, nx, ny, nz);
    o = push(out, o, cx, cy, cz, nx, ny, nz);
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
): number => {
  out[off] = x;
  out[off + 1] = y;
  out[off + 2] = z;
  out[off + 3] = nx;
  out[off + 4] = ny;
  out[off + 5] = nz;
  return off + FLOATS_PER_VERTEX;
};
