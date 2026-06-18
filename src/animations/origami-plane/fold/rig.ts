// Origami crane fold rig (stylized).
//
// A true crane (bird base + petal/reverse folds) can't be expressed with rigid
// single-hinge folds, so this is a recognizable stylization: a central body
// with two wings, a raised neck ending in a folded head, and a raised tail.
//
// The sheet lies flat in the XZ plane (y up). +Z is the front (head), -Z the
// back (tail). It's cut along every crease so each fold is a rigid rotation of
// a facet subset about a hinge line — no runtime polygon clipping.

import { quat, transform } from './math';

import type { Transform, Vec3 } from './math';

// Sheet extents (rest space).
const HALF_W = 1.0; // x in [-1, 1]
const FRONT_Z = 1.5; // +Z edge (head end)
const BACK_Z = -1.3; // -Z edge (tail end)

// Central body band: |x| < BODY_HALF carries neck/body/tail; the sides are
// wings. Kept thin so the neck and tail read as slender bird parts.
const BODY_HALF = 0.1;
const NECK_Z = 0.3; // neck hinge (front of body)
const TAIL_Z = -0.35; // tail hinge (back of body)
const HEAD_Z = 1.05; // head hinge (near the neck tip)

export interface Facet {
  v: [Vec3, Vec3, Vec3]; // rest-space vertices
  part: 'wingL' | 'wingR' | 'neck' | 'head' | 'tail' | 'body';
}

const facet = (a: Vec3, b: Vec3, c: Vec3, part: Facet['part']): Facet => ({
  v: [a, b, c],
  part,
});

// Two triangles for an axis-aligned quad x∈[x0,x1], z∈[z0,z1].
const quad = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  part: Facet['part'],
): Facet[] => [
  facet([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], part),
  facet([x0, 0, z0], [x1, 0, z1], [x0, 0, z1], part),
];

const B = BODY_HALF;

export const buildFacets = (): Facet[] => [
  // Wings: the full side columns.
  ...quad(-HALF_W, -B, BACK_Z, FRONT_Z, 'wingL'),
  ...quad(B, HALF_W, BACK_Z, FRONT_Z, 'wingR'),
  // Central column, split along z into tail / body / neck / head.
  ...quad(-B, B, BACK_Z, TAIL_Z, 'tail'),
  ...quad(-B, B, TAIL_Z, NECK_Z, 'body'),
  ...quad(-B, B, NECK_Z, HEAD_Z, 'neck'),
  ...quad(-B, B, HEAD_Z, FRONT_Z, 'head'),
];

// --- Fold parameters (radians). Signs chosen so flaps lift toward +Y (the
// camera). Tunable.
const WING_ANGLE = 0.45; // wings spread gently up from flat
const NECK_ANGLE = -1.7; // neck stands up, leaning slightly forward
const TAIL_ANGLE = 1.7; // tail swings up at the back
const HEAD_ANGLE = 2.3; // head/beak folds forward at the neck tip

interface Fold {
  pick: (f: Facet) => boolean;
  point: Vec3;
  dir: Vec3;
  angle: number;
  carrier?: Transform;
}

const X_AXIS: Vec3 = [1, 0, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

// The neck's rigid transform, used as the carrier for the head crease (which
// rides on the already-raised neck).
const neckCarrier: Transform = transform.rotateAboutLine(
  transform.identity(),
  [0, 0, NECK_Z],
  X_AXIS,
  NECK_ANGLE,
);

// Steps, in order. Each is a list of folds applied at the same keyframe.
const STEPS: Fold[][] = [
  // 1 — spread the wings up.
  [
    {
      pick: f => f.part === 'wingL',
      point: [-B, 0, 0],
      dir: Z_AXIS,
      angle: -WING_ANGLE,
    },
    {
      pick: f => f.part === 'wingR',
      point: [B, 0, 0],
      dir: Z_AXIS,
      angle: WING_ANGLE,
    },
  ],
  // 2 — raise the neck (carries the head with it).
  [
    {
      pick: f => f.part === 'neck' || f.part === 'head',
      point: [0, 0, NECK_Z],
      dir: X_AXIS,
      angle: NECK_ANGLE,
    },
  ],
  // 3 — raise the tail.
  [
    {
      pick: f => f.part === 'tail',
      point: [0, 0, TAIL_Z],
      dir: X_AXIS,
      angle: TAIL_ANGLE,
    },
  ],
  // 4 — fold the head down at the neck tip.
  [
    {
      pick: f => f.part === 'head',
      point: [0, 0, HEAD_Z],
      dir: X_AXIS,
      angle: HEAD_ANGLE,
      carrier: neckCarrier,
    },
  ],
];

export const STEP_COUNT = STEPS.length; // states are 0..STEP_COUNT

// Apply one step's folds to a base pose, each crease at `fraction` of its
// angle. Every facet matches at most one fold per step, so scaling that single
// hinge rotation reproduces real paper motion — the flap pivots on its crease
// while everything folded earlier stays rigid.
const applyStepFolds = (
  base: Transform[],
  folds: Fold[],
  fraction: number,
  facets: Facet[],
): Transform[] => {
  const out = base.map(tr => ({ q: tr.q, t: tr.t }));
  for (const fold of folds) {
    const carrier = fold.carrier;
    const p = carrier ? transform.apply(carrier, fold.point) : fold.point;
    const d = carrier ? quat.rotate(carrier.q, fold.dir) : fold.dir;
    facets.forEach((f, i) => {
      if (fold.pick(f)) {
        out[i] = transform.rotateAboutLine(out[i], p, d, fold.angle * fraction);
      }
    });
  }
  return out;
};

// keyframes[step][facetIndex] = fully-folded rigid transform at that step.
export const buildKeyframes = (facets: Facet[]): Transform[][] => {
  const keyframes: Transform[][] = [];
  let current = facets.map(() => transform.identity());
  keyframes.push(current);
  for (const folds of STEPS) {
    current = applyStepFolds(current, folds, 1, facets);
    keyframes.push(current);
  }
  return keyframes;
};

// Pose midway through step `stepIndex` (0-based), `fraction` ∈ [0,1] from the
// completed `base` pose of that step.
export const stepTransforms = (
  base: Transform[],
  stepIndex: number,
  fraction: number,
  facets: Facet[],
): Transform[] => applyStepFolds(base, STEPS[stepIndex], fraction, facets);
