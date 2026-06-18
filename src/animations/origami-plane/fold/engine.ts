// Builds an interleaved vertex buffer (position + flat normal) for the crane by
// running the origami spring solver toward a fold fraction derived from
// `progress`. The mesh state persists across frames so the physics relaxes.

import { buildMesh, resetMesh, step } from './solver';

import type { OrigamiMesh } from './solver';

export const STEP_COUNT = 1; // single continuous fold (square → crane)
export const FLOATS_PER_VERTEX = 6;

const MAX_FOLD = 0.92; // leave the crane open (3D), not fully flattened
const SUBSTEPS = 40; // solver iterations per frame
const RAMP = 0.006; // max fold-fraction change per frame (solver must track it)

export interface FoldGeometry {
  mesh: OrigamiMesh;
  vertexCount: number;
  vertexData: Float32Array;
  foldCurrent: number;
}

export const createGeometry = (): FoldGeometry => {
  const mesh = buildMesh();
  return {
    mesh,
    vertexCount: mesh.triCount * 3,
    vertexData: new Float32Array(mesh.triCount * 3 * FLOATS_PER_VERTEX),
    foldCurrent: 0,
  };
};

export const resetGeometry = (geo: FoldGeometry) => {
  resetMesh(geo.mesh);
  geo.foldCurrent = 0;
};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const { mesh, vertexData } = geo;
  // Ease the fold fraction slowly so the solver tracks the rigid-foldable path
  // instead of tangling when the target jumps.
  const target = Math.max(0, Math.min(1, progress / STEP_COUNT)) * MAX_FOLD;
  const d = target - geo.foldCurrent;
  geo.foldCurrent += Math.max(-RAMP, Math.min(RAMP, d));
  step(mesh, geo.foldCurrent, SUBSTEPS);

  const { pos, tris } = mesh;
  let o = 0;
  for (let t = 0; t < mesh.triCount; t++) {
    const ia = tris[t * 3];
    const ib = tris[t * 3 + 1];
    const ic = tris[t * 3 + 2];
    const ax = pos[ia * 3];
    const ay = pos[ia * 3 + 1];
    const az = pos[ia * 3 + 2];
    const bx = pos[ib * 3];
    const by = pos[ib * 3 + 1];
    const bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3];
    const cy = pos[ic * 3 + 1];
    const cz = pos[ic * 3 + 2];
    // flat normal
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    o = push(vertexData, o, ax, ay, az, nx, ny, nz);
    o = push(vertexData, o, bx, by, bz, nx, ny, nz);
    o = push(vertexData, o, cx, cy, cz, nx, ny, nz);
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
