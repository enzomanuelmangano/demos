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

// A small central body square with four tapered flaps hinged to its edges:
// a pointed neck (+ folded head) at the front, a pointed tail at the back, and
// two broad triangular wings on the sides. The flat layout is a 4-pointed
// star that folds up into the crane silhouette.
const B = 0.18; // body half-size
const NECK_NECK_Z = 1.0; // head crease along the neck
const NECK_TIP_Z = 1.55; // neck/head tip (front)
const TAIL_TIP_Z = -1.35; // tail tip (back)
const HEAD_HW = 0.06; // half-width of the neck at the head crease
const WING_TIP_X = 1.45; // wing span

export interface Facet {
  v: [Vec3, Vec3, Vec3]; // rest-space vertices
  part: 'wingL' | 'wingR' | 'neck' | 'head' | 'tail' | 'body';
}

const facet = (a: Vec3, b: Vec3, c: Vec3, part: Facet['part']): Facet => ({
  v: [a, b, c],
  part,
});

// Body corners.
const BFL: Vec3 = [-B, 0, B]; // front-left
const BFR: Vec3 = [B, 0, B]; // front-right
const BBR: Vec3 = [B, 0, -B]; // back-right
const BBL: Vec3 = [-B, 0, -B]; // back-left
// Neck crease ends (where the head folds).
const NL: Vec3 = [-HEAD_HW, 0, NECK_NECK_Z];
const NR: Vec3 = [HEAD_HW, 0, NECK_NECK_Z];

export const buildFacets = (): Facet[] => [
  // Body square.
  facet(BFL, BFR, BBR, 'body'),
  facet(BFL, BBR, BBL, 'body'),
  // Neck: trapezoid from the body front edge up to the head crease.
  facet(BFL, BFR, NR, 'neck'),
  facet(BFL, NR, NL, 'neck'),
  // Head: triangle from the head crease to the tip.
  facet(NL, NR, [0, 0, NECK_TIP_Z], 'head'),
  // Tail: triangle from the body back edge to the tip.
  facet(BBR, BBL, [0, 0, TAIL_TIP_Z], 'tail'),
  // Wings: broad triangles from the body side edges out to the tips.
  facet(BFR, BBR, [WING_TIP_X, 0, 0], 'wingR'),
  facet(BBL, BFL, [-WING_TIP_X, 0, 0], 'wingL'),
];

// --- Fold parameters (radians). Signs chosen so flaps lift toward +Y (the
// camera). Tunable.
const WING_ANGLE = 0.35; // wings spread gently up from flat
const NECK_ANGLE = -1.75; // neck stands up, leaning slightly forward
const TAIL_ANGLE = 1.5; // tail swings up at the back
const HEAD_ANGLE = 2.2; // head/beak folds forward at the neck tip

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
// rides on the already-raised neck). The neck hinges on the body front edge.
const neckCarrier: Transform = transform.rotateAboutLine(
  transform.identity(),
  [0, 0, B],
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
  // 2 — raise the neck (carries the head with it), hinged on the front edge.
  [
    {
      pick: f => f.part === 'neck' || f.part === 'head',
      point: [0, 0, B],
      dir: X_AXIS,
      angle: NECK_ANGLE,
    },
  ],
  // 3 — raise the tail, hinged on the back edge.
  [
    {
      pick: f => f.part === 'tail',
      point: [0, 0, -B],
      dir: X_AXIS,
      angle: TAIL_ANGLE,
    },
  ],
  // 4 — fold the head/beak forward at the neck crease.
  [
    {
      pick: f => f.part === 'head',
      point: [0, 0, NECK_NECK_Z],
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
