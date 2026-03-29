import {
  GRID_COLS,
  GRID_ROWS,
  NUM_YEARS,
  YEAR_CARD_COLOR_LEVEL,
} from '../constants';
import { buildHeightMap, buildHeightGridFlat } from './height-map';

export interface SceneData {
  positions: number[];
  heights: number[];
  colors: number[];
  heightGridFlat: Float32Array;
}

function generateBlockData(
  contributionGrid: number[][],
  heightMap: number[][],
): {
  positions: number[];
  heights: number[];
  colors: number[];
} {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const height = heightMap[col][row];
      positions.push(col, 0, row, 0);
      heights.push(height);
      colors.push(contributionGrid[col][row]);
    }
  }

  return { positions, heights, colors };
}

function addYearCards(data: {
  positions: number[];
  heights: number[];
  colors: number[];
}): void {
  for (let year = 0; year < NUM_YEARS; year++) {
    const cx = (GRID_COLS - 1) / 2;
    const cz = year * 7 + 3;

    // Card background — behind contribution blocks
    data.positions.push(cx, -1, cz, 0);
    data.heights.push(0.001);
    data.colors.push(YEAR_CARD_COLOR_LEVEL);
  }
}

/**
 * Build complete scene data from contribution grid.
 */
export function buildSceneData(contributionGrid: number[][]): SceneData {
  const heightMap = buildHeightMap(contributionGrid);
  const data = generateBlockData(contributionGrid, heightMap);
  addYearCards(data);
  const heightGridFlat = buildHeightGridFlat(heightMap);

  return { ...data, heightGridFlat };
}
