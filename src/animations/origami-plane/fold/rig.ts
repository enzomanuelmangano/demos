// Crane crease pattern + fold sequence (layer-aware origami simulator).
//
// AXIS-ALIGNED square in the XZ plane. Fold in half along the midlines twice →
// preliminary (square) base (a clean 4-layer quarter). The TOP layer is the
// original C quadrant (t1/t2); the petal fold lifts its open-corner triangles.
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
const mBC: Vec3 = [S, 0, 0];
const mCD: Vec3 = [0, 0, S];
const mDA: Vec3 = [-S, 0, 0];
const mAB: Vec3 = [0, 0, -S];
// Top-quadrant (C) petal subdivision: gusset on the O–C diagonal and the two
// crease ends on the outer edges (perpendicular to the diagonal at the gusset).
const gC: Vec3 = [0.84, 0, 0.84];
const e1: Vec3 = [S, 0, 0.28]; // on edge mBC–C
const e2: Vec3 = [0.28, 0, S]; // on edge mCD–C

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

// Order matters: petal carriers reference t1b (idx 1) and t2b (idx 4).
export const buildFacets = (): Facet[] => [
  // Top quadrant (C), split for the petal fold.
  mk(O, mBC, e1, 't1a', 'body', 0),
  mk(O, e1, gC, 't1b', 'body', 0),
  mk(gC, e1, C, 't1c', 'neck', 8), // outer, lifts in petal
  mk(O, e2, mCD, 't2a', 'body', 0),
  mk(O, gC, e2, 't2b', 'body', 0),
  mk(gC, C, e2, 't2c', 'neck', 8), // outer, lifts in petal
  // Remaining three quadrants.
  mk(O, mCD, D, 't3', 'tail', 2),
  mk(O, D, mDA, 't4', 'wingL', 3),
  mk(O, mDA, A, 't5', 'wingL', 4),
  mk(O, A, mAB, 't6', 'tail', 5),
  mk(O, mAB, B, 't7', 'wingR', 6),
  mk(O, B, mBC, 't8', 'wingR', 7),
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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const tagIs =
  (...tags: string[]) =>
  (f: Facet) =>
    tags.includes(f.tag);

const PETAL = 2.9;

export const STEP_COUNT = 3;

export const STEPS: Fold[][] = [
  // 1 — fold the left half onto the right.
  [{ pick: f => f.xSign < 0, point: O, dir: Z_AXIS, angle: -PI }],
  // 2 — fold the front half onto the back → preliminary (square) base.
  [{ pick: f => f.zSign > 0, point: O, dir: X_AXIS, angle: -PI }],
  // 3 — petal: lift the top layer's two open-corner triangles about the gusset
  // creases (carried by their inner neighbours, which stay put).
  [
    {
      pick: tagIs('t1c'),
      point: gC,
      dir: sub(e1, gC),
      angle: PETAL,
      carrier: pose => pose[1],
    },
    {
      pick: tagIs('t2c'),
      point: gC,
      dir: sub(e2, gC),
      angle: -PETAL,
      carrier: pose => pose[4],
    },
  ],
];
