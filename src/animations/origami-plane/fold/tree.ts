// Tree-based rigid-origami folder.
//
// The sheet is a triangulated flat square. Interior creases form a spanning
// tree over the facets: every facet has a parent it shares an edge (crease)
// with. Folding sets a dihedral angle per crease; a facet's world transform is
// its parent's transform composed with a rotation about the (parent-moved)
// crease line. Because children ride on their parents, shared edges never
// separate — the paper stays connected through the whole fold.
//
// Each crease carries a schedule: the target dihedral at every step. The
// renderer drives a continuous `progress` and we interpolate.

import { transform, v3 } from './math';

import type { Transform, Vec3 } from './math';

export interface Node {
  rest: [Vec3, Vec3, Vec3]; // flat triangle (y = 0)
  parent: number; // index of parent node, or -1 for the root
  hingeA: Vec3; // shared crease edge with parent (rest coords)
  hingeB: Vec3;
  angles: number[]; // dihedral at each step boundary (length STEP_COUNT + 1)
  layer: number; // stacking order, for a tiny z-offset against z-fighting
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

// Compute every node's world transform at continuous progress `p`.
export const solve = (
  nodes: Node[],
  p: number,
  stepCount: number,
): Transform[] => {
  const i = Math.max(0, Math.min(stepCount - 1, Math.floor(p)));
  const f = smooth(Math.max(0, Math.min(1, p - i)));
  const out: Transform[] = new Array(nodes.length);

  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    const angle = node.angles[i] + (node.angles[i + 1] - node.angles[i]) * f;
    if (node.parent < 0) {
      out[n] = transform.identity();
      continue;
    }
    const tp = out[node.parent];
    const a = transform.apply(tp, node.hingeA);
    const b = transform.apply(tp, node.hingeB);
    const dir = v3.normalize(v3.sub(b, a));
    out[n] = transform.rotateAboutLine(tp, a, dir, angle);
  }
  return out;
};
