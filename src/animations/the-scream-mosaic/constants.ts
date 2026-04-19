// Grid configuration for photo mosaic
// Target number of cells - actual grid dimensions calculated from painting aspect ratio
export const TARGET_CELLS = 10000;

// Photo configuration
// Photos are pre-downloaded and bundled with the app
export const PHOTO_SIZE = 80; // 80x80 pixels per photo

// Zoom levels (adjusted for 10k cell grid)
export const ZOOM_LEVELS = {
  overview: 1,
  grid: 4,
  cell: 12,
} as const;

// Spring configuration - critically damped
export const SPRING_CONFIG = { dampingRatio: 1, duration: 400 };
