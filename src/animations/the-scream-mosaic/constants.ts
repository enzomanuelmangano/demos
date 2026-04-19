// Grid configuration for photo mosaic
// 65 × 77 = 5005 cells, matches Vermeer painting aspect ratio (~0.84)
export const GRID_COLS = 65;
export const GRID_ROWS = 77;
export const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 5005 cells

// Photo loading configuration
// Using seed-based URLs for unlimited unique photos
export const PHOTO_COUNT = TOTAL_CELLS; // One unique photo per cell
export const ANALYSIS_SIZE = 50; // 50x50 for color analysis (reduced for performance)
export const DISPLAY_SIZE = 80; // 80x80 for rendering (reduced for 5k images)
export const BATCH_SIZE = 100;
export const BATCH_DELAY = 30; // ms between batches

// Zoom levels (adjusted for 5k cell grid)
export const ZOOM_LEVELS = {
  overview: 1,
  grid: 4,
  cell: 12,
} as const;

// Spring configuration - critically damped
export const SPRING_CONFIG = { dampingRatio: 1, duration: 400 };

// Generate photo indices (0 to count-1)
export const getValidPhotoIds = (count: number): number[] => {
  return Array.from({ length: count }, (_, i) => i);
};

// Generate photo URL using seed for unique random photos
export const getPhotoUrl = (id: number, size: number): string => {
  // Using seed-based URL - each seed produces a unique random photo
  return `https://picsum.photos/seed/mosaic-${id}/${size}/${size}`;
};
