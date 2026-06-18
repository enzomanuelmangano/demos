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
// Bottom-quadrant (B) petal subdivision, mirror across z = 0.
const gB: Vec3 = [0.84, 0, -0.84];
const e3: Vec3 = [S, 0, -0.28]; // on edge mBC–B
const e4: Vec3 = [0.28, 0, -S]; // on edge mAB–B

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

// Order matters: petal carriers reference the inner neighbours by index.
export const buildFacets = (): Facet[] => [
  // Top quadrant (C), split for the front petal fold. idx 0..5
  mk(O, mBC, e1, 't1a', 'body', 0),
  mk(O, e1, gC, 't1b', 'body', 0),
  mk(gC, e1, C, 't1c', 'neck', 8), // outer, lifts in front petal
  mk(O, e2, mCD, 't2a', 'body', 0),
  mk(O, gC, e2, 't2b', 'body', 0),
  mk(gC, C, e2, 't2c', 'neck', 8), // outer, lifts in front petal
  // Side quadrants (D, A) → wings. idx 6..9
  mk(O, mCD, D, 't3', 'wingL', 2),
  mk(O, D, mDA, 't4', 'wingL', 3),
  mk(O, mDA, A, 't5', 'wingR', 4),
  mk(O, A, mAB, 't6', 'wingR', 5),
  // Bottom quadrant (B), split for the back petal fold. idx 10..15
  mk(O, mAB, e4, 't7a', 'body', 1),
  mk(O, e4, gB, 't7b', 'body', 1),
  mk(gB, e4, B, 't7c', 'tail', 9), // outer, lifts in back petal
  mk(O, e3, mBC, 't8a', 'body', 1),
  mk(O, gB, e3, 't8b', 'body', 1),
  mk(gB, B, e3, 't8c', 'tail', 9), // outer, lifts in back petal
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

export const STEP_COUNT = 4;

export const STEPS: Fold[][] = [
  // 1 — fold the left half onto the right.
  [{ pick: f => f.xSign < 0, point: O, dir: Z_AXIS, angle: -PI }],
  // 2 — fold the front half onto the back → preliminary (square) base.
  [{ pick: f => f.zSign > 0, point: O, dir: X_AXIS, angle: -PI }],
  // 3 — front petal: lift the top layer's open-corner triangles.
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
  // 4 — back petal: lift the bottom layer's open-corner triangles → bird base.
  [
    {
      pick: tagIs('t7c'),
      point: gB,
      dir: sub(e4, gB),
      angle: -PETAL,
      carrier: pose => pose[11],
    },
    {
      pick: tagIs('t8c'),
      point: gB,
      dir: sub(e3, gB),
      angle: PETAL,
      carrier: pose => pose[14],
    },
  ],
];
