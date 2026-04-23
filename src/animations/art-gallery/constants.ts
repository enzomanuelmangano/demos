// Grid configuration for photo mosaic
// Target number of cells - actual grid dimensions calculated from painting aspect ratio
export const TARGET_CELLS = 10000;

// Photo configuration
// Low-res atlas for overview, high-res loaded on demand
export const PHOTO_SIZE = 80;
export const HIGHRES_SIZE = 800;

// Zoom levels (adjusted for 10k cell grid)
export const ZOOM_LEVELS = {
  overview: 1,
  grid: 4,
  cell: 12,
} as const;

// Spring configuration - critically damped
export const SPRING_CONFIG = { dampingRatio: 1, duration: 400 };
