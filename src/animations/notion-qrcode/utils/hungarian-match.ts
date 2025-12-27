import { Point3D } from '../types';

export const hungarianMatch = (
  source: Point3D[],
  target: Point3D[],
): Point3D[] => {
  const n = source.length;
  if (n !== target.length) {
    throw new Error('Point sets must have equal length');
  }

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
