import {
  CONTRIBUTION_GRID_COLS,
  CONTRIBUTION_GRID_ROWS,
} from './contribution-data';

// Grid dimensions
export const GRID_COLS = CONTRIBUTION_GRID_COLS;
export const GRID_ROWS = CONTRIBUTION_GRID_ROWS;
export const NUM_YEARS = 9;
export const NUM_BLOCKS = GRID_COLS * GRID_ROWS + NUM_YEARS;

// Cell sizing
/** Cell footprint in grid units (< 1 leaves gutters). */
export const CELL_FOOTPRINT_ISO = 0.78;
export const CELL_FOOTPRINT_FLAT = 0.91;

// Camera angles
export const ISO_ANGLE_Y = 0.8;
export const ISO_ANGLE_X = -0.5;
export const FLAT_ANGLE_Y = 0.0;
export const FLAT_ANGLE_X = -1.5708; // -π/2

/** How much of the NDC view the isometric chart fills (higher = larger). */
export const ISO_VIEWPORT_FILL = 0.96;
export const FLAT_VIEWPORT_FILL = 0.9;

// Block rendering
export const BLOCK_SIZE = 0.009;
export const MAX_BLOCK_HEIGHT = 8.6;
export const MIN_BLOCK_HEIGHT = 0.026;
export const FLAT_BLOCK_HEIGHT = 0.06;

// Year card layout
export const YEAR_GAP = 4.0;
export const NUM_YEAR_GAPS = 8.0;

// Surface colors (consistent across canvas, clear color, container)
export const SURFACE_RGB = { r: 0.976, g: 0.965, b: 0.945 } as const;
export const SURFACE_HEX = '#F9F6F1';

// Spring animation
export const SPRING_DURATION = 0.35; // 350ms for 99% settle
export const SPRING_OMEGA = -Math.log(0.01) / SPRING_DURATION;

// WebGPU
export const UNIFORM_BUFFER_SIZE = 256; // Must be multiple of 256 bytes

/**
 * GitHub only exposes 0–4 buckets, not raw counts. We map each bucket to a
 * monotonic "typical contribution day" estimate so bar height scales with amount.
 */
export const CONTRIBUTION_ESTIMATE_BY_LEVEL: readonly number[] = [
  0, 1, 4, 11, 28,
];

// Color level used for year cards (special marker)
export const YEAR_CARD_COLOR_LEVEL = 6;
