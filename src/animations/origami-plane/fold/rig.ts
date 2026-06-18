// Crane crease pattern + fold sequence (layer-aware origami simulator).
//
// AXIS-ALIGNED square in the XZ plane. Creases: the two midlines (x=0, z=0) and
// the two diagonals (z=±x). Folding the square in half along the midlines twice
// gives the classic preliminary (square) base — a clean quarter square — which
// is the foundation for the petal folds → bird base → crane.
//
// Each fold step rotates a subset of facets about a world-space fold line
// (optionally carried by an earlier fold), composing on the prior pose.

import type { Transform, Vec3 } from './math';

const S = 1.4; // half-side

// Corners, centre, edge midpoints.
const A: Vec3 = [-S, 0, -S];
const B: Vec3 = [S, 0, -S];
const C: Vec3 = [S, 0, S];
const D: Vec3 = [-S, 0, S];
const O: Vec3 = [0, 0, 0];
const mAB: Vec3 = [0, 0, -S]; // front mid
const mBC: Vec3 = [S, 0, 0]; // right mid
const mCD: Vec3 = [0, 0, S]; // back mid
const mDA: Vec3 = [-S, 0, 0]; // left mid

export type Part = 'neck' | 'head' | 'tail' | 'wingL' | 'wingR' | 'body';

export interface Facet {
  v: [Vec3, Vec3, Vec3];
  tag: string;
  part: Part;
  xSign: number;
  zSign: number;
  layer: number;
}

const mk = (
  a: Vec3,
  b: Vec3,
  c: Vec3,
  tag: string,
  part: Part,
  layer: number,
): Facet => ({
  v: [a, b, c],
  tag,
  part,
  xSign: Math.sign((a[0] + b[0] + c[0]) / 3) || 0,
  zSign: Math.sign((a[2] + b[2] + c[2]) / 3) || 0,
  layer,
});

// Eight triangles fanning from O, split by both midlines and both diagonals.
export const buildFacets = (): Facet[] => [
  mk(O, mBC, C, 't1', 'wingR', 0), // x>0, 0<z<x
  mk(O, C, mCD, 't2', 'tail', 1), // x>0, z>x
  mk(O, mCD, D, 't3', 'tail', 2), // x<0, z>|x|
  mk(O, D, mDA, 't4', 'wingL', 3), // x<0, |z|<|x|, z>0
  mk(O, mDA, A, 't5', 'wingL', 4), // x<0, z<0
  mk(O, A, mAB, 't6', 'neck', 5), // x<0, z<-|x|
  mk(O, mAB, B, 't7', 'neck', 6), // x>0, z<-|x|
  mk(O, B, mBC, 't8', 'wingR', 7), // x>0, z<0
];

export interface Fold {
  pick: (f: Facet) => boolean;
  point: Vec3;
  dir: Vec3;
  angle: number;
  carrier?: Transform | ((pose: Transform[], facets: Facet[]) => Transform);
  target?: (f: Facet) => Transform;
}

const PI = Math.PI;
const X_AXIS: Vec3 = [1, 0, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

export const STEP_COUNT = 2;

// Stage 1-2: fold in half along the midlines twice → preliminary (square) base.
export const STEPS: Fold[][] = [
  [{ pick: f => f.xSign < 0, point: O, dir: Z_AXIS, angle: -PI }],
  [{ pick: f => f.zSign > 0, point: O, dir: X_AXIS, angle: -PI }],
];
