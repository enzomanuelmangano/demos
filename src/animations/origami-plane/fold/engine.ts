// Builds an interleaved vertex buffer (position + flat normal) for the crane
// at a continuous fold `progress`, using the tree folder.

import { transform, v3 } from './math';
import { buildNodes, STEP_COUNT } from './rig';
import { solve } from './tree';

import type { Vec3 } from './math';
import type { Node } from './tree';

export { STEP_COUNT };

export const FLOATS_PER_VERTEX = 6; // vec3 position + vec3 normal

const LAYER_OFFSET = 0.004; // tiny lift per stacking layer to avoid z-fighting

export interface FoldGeometry {
  nodes: Node[];
  vertexCount: number;
  vertexData: Float32Array;
}

export const createGeometry = (): FoldGeometry => {
  const nodes = buildNodes();
  const vertexCount = nodes.length * 3;
  return {
    nodes,
    vertexCount,
    vertexData: new Float32Array(vertexCount * FLOATS_PER_VERTEX),
  };
};

export const writeVertices = (geo: FoldGeometry, progress: number): void => {
  const { nodes, vertexData } = geo;
  const p = Math.max(0, Math.min(STEP_COUNT, progress));
  const transforms = solve(nodes, p, STEP_COUNT);

  let o = 0;
  for (let n = 0; n < nodes.length; n++) {
    const tr = transforms[n];
    const v0 = transform.apply(tr, nodes[n].rest[0]);
    const v1 = transform.apply(tr, nodes[n].rest[1]);
    const v2 = transform.apply(tr, nodes[n].rest[2]);
    let normal = v3.normalize(v3.cross(v3.sub(v1, v0), v3.sub(v2, v0)));
    // Lift stacked layers slightly along the face normal.
    const lift = nodes[n].layer * LAYER_OFFSET;
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
