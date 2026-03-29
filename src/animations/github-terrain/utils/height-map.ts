import {
  GRID_COLS,
  GRID_ROWS,
  CONTRIBUTION_ESTIMATE_BY_LEVEL,
} from '../constants';

interface GridStats {
  sparsity: number; // 0-1, how many cells are empty
  intensity: number; // 0-1, average contribution level
  variance: number; // 0-1, how spread out values are
  peakDensity: number; // 0-1, ratio of high-value cells
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function estimatedContributionsForLevel(level: number): number {
  return CONTRIBUTION_ESTIMATE_BY_LEVEL[level] ?? 0;
}

/** Analyze grid to determine adaptive parameters. */
function analyzeGrid(contributionGrid: number[][]): GridStats {
  let total = 0;
  let nonZero = 0;
  let sum = 0;
  let highCount = 0;
  const values: number[] = [];

  for (const col of contributionGrid) {
    for (const level of col) {
      total++;
      if (level > 0) {
        nonZero++;
        sum += level;
        values.push(level);
        if (level >= 3) highCount++;
      }
    }
  }

  const sparsity = 1 - nonZero / total;
  const intensity = nonZero > 0 ? sum / (nonZero * 4) : 0;
  const peakDensity = nonZero > 0 ? highCount / nonZero : 0;

  const mean =
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance =
    values.length > 0
      ? Math.sqrt(
          values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length,
        ) / 4
      : 0;

  return { sparsity, intensity, variance, peakDensity };
}

/** Normalized [0,1] height proportional to relative contribution amount. */
function buildNormalizedContributionHeights(
  contributionGrid: number[][],
): number[][] {
  const raw = contributionGrid.map(col =>
    col.map(level => estimatedContributionsForLevel(level)),
  );
  let max = 0;
  for (const col of raw) {
    for (const v of col) {
      if (v > max) max = v;
    }
  }
  if (max === 0) max = 1;
  return raw.map(col => col.map(v => v / max));
}

/** Blur so peaks lift neighbors — continuous "mountain" terrain. */
function smoothHeightField(grid: number[][], passes: number): number[][] {
  const cols = grid.length;
  const rows = grid[0].length;
  let cur = grid.map(c => [...c]);

  for (let p = 0; p < passes; p++) {
    const next: number[][] = [];
    for (let c = 0; c < cols; c++) {
      next[c] = [];
      for (let r = 0; r < rows; r++) {
        let sum = 0;
        let count = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const cc = c + dc;
            const rr = r + dr;
            if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) {
              sum += cur[cc][rr];
              count += 1;
            }
          }
        }
        next[c][r] = sum / count;
      }
    }
    cur = next;
  }
  return cur;
}

/** Soft elliptical edge so the landmass feels organic. */
function applyEllipticalLandmask(
  heights: number[][],
  strength: number,
): number[][] {
  const cx = (GRID_COLS - 1) * 0.5;
  const cz = (GRID_ROWS - 1) * 0.5;
  const rx = GRID_COLS * 0.5;
  const rz = GRID_ROWS * 0.48;

  return heights.map((col, c) =>
    col.map((h, r) => {
      const nx = (c - cx) / rx;
      const nz = (r - cz) / rz;
      const d = nx * nx + nz * nz;
      const mask = 1 - smoothstep(0.64, 1.06, d);
      const blend = 1 - strength + strength * mask;
      return h * blend;
    }),
  );
}

/** Pull mids down / keep peaks — stronger apparent relief. */
function emphasizePeaks(heights: number[][], gamma: number): number[][] {
  return heights.map(col =>
    col.map(h => Math.pow(Math.max(0, Math.min(1, h)), gamma)),
  );
}

/** Ensure contributions have minimum visibility based on their level. */
function applyContributionFloor(
  heightMap: number[][],
  contributionGrid: number[][],
  floorStrength: number,
): number[][] {
  return heightMap.map((col, c) =>
    col.map((h, r) => {
      const level = contributionGrid[c][r];
      if (level <= 0) return h;
      const floor = (0.12 + (level / 4) * 0.24) * floorStrength;
      return Math.max(h, floor);
    }),
  );
}

/**
 * Build adaptive height map - analyzes data and adjusts processing automatically.
 */
export function buildHeightMap(contributionGrid: number[][]): number[][] {
  const stats = analyzeGrid(contributionGrid);
  const normalized = buildNormalizedContributionHeights(contributionGrid);

  // Adaptive parameters based on data characteristics
  const blurPasses = Math.round(2 + stats.sparsity * 1); // 2-3 passes (was 2-6)
  const gamma = 0.85 + stats.variance * 0.3 - stats.intensity * 0.15; // ~0.7-1.15
  const edgeStrength = 0.1 + stats.sparsity * 0.15; // 0.1-0.25
  const floorStrength = 0.6 + stats.sparsity * 0.5; // 0.6-1.1

  // Apply processing pipeline
  let heights = smoothHeightField(normalized, blurPasses);
  heights = applyEllipticalLandmask(heights, edgeStrength);
  heights = emphasizePeaks(heights, gamma);
  heights = applyContributionFloor(heights, contributionGrid, floorStrength);

  return heights;
}

/** Flatten height map for WGSL — neighbor height sampling. */
export function buildHeightGridFlat(heightMap: number[][]): Float32Array {
  const out = new Float32Array(GRID_COLS * GRID_ROWS);
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      out[c * GRID_ROWS + r] = heightMap[c][r];
    }
  }
  return out;
}
