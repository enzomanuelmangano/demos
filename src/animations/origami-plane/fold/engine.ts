// Turns the fold keyframes + a continuous `progress` into an interleaved
// vertex buffer (position + flat normal) ready for upload each frame.

import { transform, v3 } from './math';
import { buildFacets, buildKeyframes, STEP_COUNT, stepTransforms } from './rig';

import type { Transform, Vec3 } from './math';
import type { Facet } from './rig';

export { STEP_COUNT };

export const FLOATS_PER_VERTEX = 6; // vec3 position + vec3 normal

export interface FoldGeometry {
  facets: Facet[];
  keyframes: Transform[][];
  vertexCount: number;
  vertexData: Float32Array;
}

export const createGeometry = (): FoldGeometry => {
  const facets = buildFacets();
  const keyframes = buildKeyframes(facets);
  const vertexCount = facets.length * 3;
  return {
    facets,
    keyframes,
    vertexCount,
    vertexData: new Float32Array(vertexCount * FLOATS_PER_VERTEX),
  };
};

// Write world vertices for `progress` ∈ [0, STEP_COUNT]. The active step's
// crease rotates from the previous completed pose, so flaps pivot on their
// hinge like real paper instead of sliding between keyframes.
export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const { facets, keyframes, vertexData } = geo;
  const p = Math.max(0, Math.min(STEP_COUNT, progress));
  const i = Math.min(STEP_COUNT - 1, Math.floor(p));
  const f = p - i;
  const trs = stepTransforms(keyframes[i], i, f, facets);

  let o = 0;
  for (let fi = 0; fi < facets.length; fi++) {
    const tr = trs[fi];
    const v0 = transform.apply(tr, facets[fi].v[0]);
    const v1 = transform.apply(tr, facets[fi].v[1]);
    const v2 = transform.apply(tr, facets[fi].v[2]);

    const n = v3.normalize(v3.cross(v3.sub(v1, v0), v3.sub(v2, v0)));
    o = pushVertex(vertexData, o, v0, n);
    o = pushVertex(vertexData, o, v1, n);
    o = pushVertex(vertexData, o, v2, n);
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
