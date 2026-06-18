// Origami paper-plane fold rig.
//
// The sheet lives flat in the XZ plane (y up), nose toward +Z. It is cut into
// triangle facets along every crease we use, so each fold is a rigid rotation
// of a facet subset about a hinge line — no runtime polygon clipping.
//
// Folds are grouped into "steps". Each Next press advances one step; we
// precompute every facet's rigid transform at each step boundary and the
// renderer slerps between adjacent steps for a smooth fold.

import { quat, transform, v3 } from './math';

import type { Transform, Vec3 } from './math';

// Paper half-width and nose/tail extents (rest space).
const W = 0.6; // x in [-W, W]
const NOSE_Z = 1.0; // +Z edge
const TAIL_Z = -1.0; // -Z edge
const SHOULDER_Z = NOSE_Z - W; // where the nose corner creases meet the side
const WING_X = 0.32; // wing crease offset from centre line

// Key points.
const M: Vec3 = [0, 0, NOSE_Z]; // nose tip (top-edge midpoint)
const MC: Vec3 = [0, 0, SHOULDER_Z]; // centre point at the shoulder line
const AL: Vec3 = [-W, 0, NOSE_Z]; // top-left corner
const AR: Vec3 = [W, 0, NOSE_Z]; // top-right corner
const EL: Vec3 = [-W, 0, SHOULDER_Z]; // left shoulder
const ER: Vec3 = [W, 0, SHOULDER_Z]; // right shoulder

export interface Facet {
  v: [Vec3, Vec3, Vec3]; // rest-space vertices
  centroidX: number; // for the body (centre-line) split
  wing: 'L' | 'R' | null; // belongs to a wing flap?
  nose: 'L' | 'R' | null; // belongs to a folding nose corner?
}

const facet = (
  a: Vec3,
  b: Vec3,
  c: Vec3,
  opts: { wing?: 'L' | 'R'; nose?: 'L' | 'R' } = {},
): Facet => ({
  v: [a, b, c],
  centroidX: (a[0] + b[0] + c[0]) / 3,
  wing: opts.wing ?? null,
  nose: opts.nose ?? null,
});

// Two triangles for an axis-aligned quad x∈[x0,x1], z∈[z0,z1].
const quadStrip = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  opts: { wing?: 'L' | 'R' } = {},
): Facet[] => [
  facet([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], opts),
  facet([x0, 0, z0], [x1, 0, z1], [x0, 0, z1], opts),
];

export const buildFacets = (): Facet[] => [
  // Nose corner triangles (fold inward to the centre line).
  facet(M, AL, EL, { nose: 'L' }),
  facet(M, AR, ER, { nose: 'R' }),
  // Central nose triangle, split at the centre line so each half tents cleanly.
  facet(M, EL, MC),
  facet(M, MC, ER),
  // Rectangular body, four vertical strips: left wing / left body / right body
  // / right wing.
  ...quadStrip(-W, -WING_X, TAIL_Z, SHOULDER_Z, { wing: 'L' }),
  ...quadStrip(-WING_X, 0, TAIL_Z, SHOULDER_Z),
  ...quadStrip(0, WING_X, TAIL_Z, SHOULDER_Z),
  ...quadStrip(WING_X, W, TAIL_Z, SHOULDER_Z, { wing: 'R' }),
];

// --- Fold parameters (radians). Tunable; signs chosen so folds lift toward +Y.
const THETA_NOSE = 2.7; // nose corners fold in/up
const BETA_BODY = 1.15; // each half tents up about the centre line
const GAMMA_WING = 1.55; // wing flaps fold back toward horizontal

// A single fold: rotate every facet matching `pick` about a hinge line.
interface Fold {
  pick: (f: Facet) => boolean;
  // World-space hinge is `carrier` applied to the rest line (point + dir).
  point: Vec3;
  dir: Vec3;
  angle: number;
  carrier?: Transform;
}

const Z_AXIS: Vec3 = [0, 0, 1];

// Body-fold transforms for each half (rotation about the centre line through
// the origin). Reused as the carrier for the wing creases, which ride on top
// of the already-tented halves.
const bodyL: Transform = {
  q: quat.fromAxisAngle(Z_AXIS, BETA_BODY),
  t: [0, 0, 0],
};
const bodyR: Transform = {
  q: quat.fromAxisAngle(Z_AXIS, -BETA_BODY),
  t: [0, 0, 0],
};

// Steps, in order. Each is a list of folds applied at the same keyframe.
const STEPS: Fold[][] = [
  // 1 — nose corners to the centre.
  [
    {
      pick: f => f.nose === 'L',
      point: M,
      dir: v3.normalize(v3.sub(EL, M)),
      angle: THETA_NOSE,
    },
    {
      pick: f => f.nose === 'R',
      point: M,
      dir: v3.normalize(v3.sub(ER, M)),
      angle: -THETA_NOSE,
    },
  ],
  // 2 — fold the body: each half tents up about the centre line.
  [
    {
      pick: f => f.centroidX < 0,
      point: [0, 0, 0],
      dir: Z_AXIS,
      angle: BETA_BODY,
    },
    {
      pick: f => f.centroidX > 0,
      point: [0, 0, 0],
      dir: Z_AXIS,
      angle: -BETA_BODY,
    },
  ],
  // 3 — fold the wings back down (hinges ride on the tented halves).
  [
    {
      pick: f => f.wing === 'L',
      point: [-WING_X, 0, 0],
      dir: Z_AXIS,
      angle: -GAMMA_WING,
      carrier: bodyL,
    },
    {
      pick: f => f.wing === 'R',
      point: [WING_X, 0, 0],
      dir: Z_AXIS,
      angle: GAMMA_WING,
      carrier: bodyR,
    },
  ],
];

export const STEP_COUNT = STEPS.length; // states are 0..STEP_COUNT

// Apply one step's folds to a base pose, each crease at `fraction` of its
// angle. Because every facet matches at most one fold per step, scaling that
// single hinge rotation reproduces real paper motion — the flap pivots on its
// crease while everything folded earlier stays rigid.
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
