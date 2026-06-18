// Crane crease pattern + fold sequence (built incrementally, tuned on device).
//
// The square sits in the XZ plane as a diamond (corners front/right/back/left),
// cut by its two diagonals and two midlines into eight triangles. Each step
// rotates a subset of facets about a world-space fold line.

import type { Vec3 } from './math';

// Diamond corners, centre, edge midpoints (flat, y = 0).
const N: Vec3 = [0, 0, 1.4]; // front
const E: Vec3 = [1.4, 0, 0]; // right
const S: Vec3 = [0, 0, -1.4]; // back
const W: Vec3 = [-1.4, 0, 0]; // left
const O: Vec3 = [0, 0, 0];
const NE: Vec3 = [0.7, 0, 0.7];
const SE: Vec3 = [0.7, 0, -0.7];
const SW: Vec3 = [-0.7, 0, -0.7];
const NW: Vec3 = [-0.7, 0, 0.7];

export interface Facet {
  v: [Vec3, Vec3, Vec3];
  tag: string; // octant id: a..h
  xSign: number; // sign of rest centroid x
  zSign: number; // sign of rest centroid z
  layer: number; // stacking order for z-offset
}

const mk = (a: Vec3, b: Vec3, c: Vec3, tag: string, layer: number): Facet => ({
  v: [a, b, c],
  tag,
  xSign: Math.sign((a[0] + b[0] + c[0]) / 3),
  zSign: Math.sign((a[2] + b[2] + c[2]) / 3),
  layer,
});

export const buildFacets = (): Facet[] => [
  mk(O, N, NE, 'a', 0),
  mk(O, NE, E, 'b', 1),
  mk(O, E, SE, 'c', 2),
  mk(O, SE, S, 'd', 3),
  mk(O, S, SW, 'e', 4),
  mk(O, SW, W, 'f', 5),
  mk(O, W, NW, 'g', 6),
  mk(O, NW, N, 'h', 7),
];

export interface Fold {
  pick: (f: Facet) => boolean;
  point: Vec3;
  dir: Vec3;
  angle: number;
  carrier?: import('./math').Transform;
}

const PI = Math.PI;
const X_AXIS: Vec3 = [1, 0, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

export const STEP_COUNT = 2;

// Steps, in order.
export const STEPS: Fold[][] = [
  // 1 — fold the left (west) half onto the right about the N–S diagonal.
  [{ pick: f => f.xSign < 0, point: O, dir: Z_AXIS, angle: -PI }],
  // 2 — fold the front (north) half onto the back about the E–W diagonal.
  [{ pick: f => f.zSign > 0, point: O, dir: X_AXIS, angle: -PI }],
];
