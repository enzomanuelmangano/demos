import { Point3D } from '../types';

// Threshold for switching from O(n³) Hungarian to O(n²) greedy matching
// Hungarian: 500³ = 125M ops (~acceptable)
// Hungarian: 800³ = 512M ops (~too slow)
const HUNGARIAN_THRESHOLD = 500;

/**
 * Greedy nearest-neighbor matching - O(n²)
 * For each source point, assigns the closest unassigned target point.
 * Not globally optimal but visually similar and much faster for large n.
 */
const greedyMatch = (source: Point3D[], target: Point3D[]): Point3D[] => {
  const n = source.length;
  const result: Point3D[] = new Array(n);
  const used = new Array(n).fill(false);

  // Pre-compute squared distances (avoid sqrt for comparison)
  for (let i = 0; i < n; i++) {
    let bestJ = -1;
    let bestDistSq = Infinity;

    for (let j = 0; j < n; j++) {
      if (used[j]) continue;

      const dx = source[i].x - target[j].x;
      const dy = source[i].y - target[j].y;
      const dz = source[i].z - target[j].z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestJ = j;
      }
    }

    result[i] = target[bestJ];
    used[bestJ] = true;
  }

  return result;
};

/**
 * Hungarian algorithm - O(n³) optimal assignment
 * Finds the globally optimal 1:1 matching that minimizes total distance.
 */
const hungarianOptimal = (source: Point3D[], target: Point3D[]): Point3D[] => {
  const n = source.length;

  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost[i] = [];
    for (let j = 0; j < n; j++) {
      const dx = source[i].x - target[j].x;
      const dy = source[i].y - target[j].y;
      const dz = source[i].z - target[j].z;
      cost[i][j] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result: Point3D[] = new Array(n);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) {
      result[p[j] - 1] = target[j - 1];
    }
  }

  return result;
};

/**
 * Smart point matching - chooses algorithm based on point count.
 * - n <= 500: Hungarian O(n³) for optimal paths
 * - n > 500: Greedy O(n²) for acceptable paths without freezing
 */
export const hungarianMatch = (
  source: Point3D[],
  target: Point3D[],
): Point3D[] => {
  const n = source.length;
  if (n !== target.length) {
    throw new Error('Point sets must have equal length');
  }

  if (n <= HUNGARIAN_THRESHOLD) {
    return hungarianOptimal(source, target);
  } else {
    // For large point sets, use greedy matching to avoid O(n³) freeze
    return greedyMatch(source, target);
  }
};
