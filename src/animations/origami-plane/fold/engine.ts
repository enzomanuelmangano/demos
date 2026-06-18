// Builds an interleaved vertex buffer (position + flat normal) for the crane
// at a continuous fold `progress`.
//
// Folding model: each step rotates a subset of facets about a world-space fold
// line by a scaled angle, composed on top of the previous step's pose. Because
// the fold lines are evaluated in world space (after earlier folds), sequential
// half-plane folds and squash/petal folds compose correctly while every facet
// stays rigid.

import { quat, transform, v3 } from './math';
import { buildFacets, STEPS, STEP_COUNT } from './rig';

import type { Transform, Vec3 } from './math';
import type { Facet, Fold } from './rig';

export { STEP_COUNT };

export const FLOATS_PER_VERTEX = 6; // vec3 position + vec3 normal

const LAYER_OFFSET = 0.005; // tiny lift per stacking layer to avoid z-fighting

export interface FoldGeometry {
  facets: Facet[];
  vertexCount: number;
  vertexData: Float32Array;
}

export const createGeometry = (): FoldGeometry => {
  const facets = buildFacets();
  const vertexCount = facets.length * 3;
  return {
    facets,
    vertexCount,
    vertexData: new Float32Array(vertexCount * FLOATS_PER_VERTEX),
  };
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

// Apply one step's folds to a base pose at `fraction` of their angle.
const applyStep = (
  base: Transform[],
  folds: Fold[],
  fraction: number,
  facets: Facet[],
): Transform[] => {
  const out = base.map(tr => ({ q: tr.q, t: tr.t }));
  for (const fold of folds) {
    // Target-blend mode: ease each picked facet toward a precomputed pose.
    if (fold.target) {
      const target = fold.target;
      facets.forEach((f, i) => {
        if (fold.pick(f)) out[i] = transform.lerp(out[i], target(f), fraction);
      });
      continue;
    }
    // Hinge mode: rotate picked facets about a world-space fold line. The
    // carrier (a fixed transform or one derived from the current pose, e.g. a
    // reverse fold riding on the already-folded neck) moves the crease.
    const carrier =
      typeof fold.carrier === 'function'
        ? fold.carrier(out, facets)
        : fold.carrier;
    const p = carrier ? transform.apply(carrier, fold.point) : fold.point;
    const d = carrier ? quat.rotate(carrier.q, fold.dir) : fold.dir;
    const dn = v3.normalize(d);
    facets.forEach((f, i) => {
      if (fold.pick(f)) {
        out[i] = transform.rotateAboutLine(
          out[i],
          p,
          dn,
          fold.angle * fraction,
        );
      }
    });
  }
  return out;
};

// Pose at continuous progress: all steps before `i` fully applied, step `i` at
// fraction f.
const poseAt = (facets: Facet[], progress: number): Transform[] => {
  const p = Math.max(0, Math.min(STEP_COUNT, progress));
  const i = Math.min(STEP_COUNT - 1, Math.floor(p));
  const f = smooth(p - i);
  let pose = facets.map(() => transform.identity());
  for (let s = 0; s < i; s++) pose = applyStep(pose, STEPS[s], 1, facets);
  pose = applyStep(pose, STEPS[i], f, facets);
  return pose;
};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const { facets, vertexData } = geo;
  const pose = poseAt(facets, progress);

  let o = 0;
  for (let n = 0; n < facets.length; n++) {
    const tr = pose[n];
    const v0 = transform.apply(tr, facets[n].v[0]);
    const v1 = transform.apply(tr, facets[n].v[1]);
    const v2 = transform.apply(tr, facets[n].v[2]);
    const normal = v3.normalize(v3.cross(v3.sub(v1, v0), v3.sub(v2, v0)));
    const lift = facets[n].layer * LAYER_OFFSET;
    const off: Vec3 = [normal[0] * lift, normal[1] * lift, normal[2] * lift];
    o = pushVertex(vertexData, o, v3.add(v0, off), normal);
    o = pushVertex(vertexData, o, v3.add(v1, off), normal);
    o = pushVertex(vertexData, o, v3.add(v2, off), normal);
  }
};

const pushVertex = (
  out: Float32Array,
  offset: number,
  pos: Vec3,
  normal: Vec3,
): number => {
  out[offset] = pos[0];
  out[offset + 1] = pos[1];
  out[offset + 2] = pos[2];
  out[offset + 3] = normal[0];
  out[offset + 4] = normal[1];
  out[offset + 5] = normal[2];
  return offset + FLOATS_PER_VERTEX;
};
