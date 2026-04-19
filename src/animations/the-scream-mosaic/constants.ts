// Grid configuration for "The Scream" mosaic
// 63 × 80 = 5040 cells, maintains ~4:5 aspect ratio
export const GRID_COLS = 63;
export const GRID_ROWS = 80;
export const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 5040 cells

// Photo loading configuration
// Note: picsum.photos only has ~600-700 valid IDs, so photos will repeat
export const PHOTO_COUNT = 700;
export const ANALYSIS_SIZE = 50; // 50x50 for color analysis (reduced for performance)
export const DISPLAY_SIZE = 100; // 100x100 for rendering (reduced for 5k images)
export const BATCH_SIZE = 50;
export const BATCH_DELAY = 50; // ms between batches

// Zoom levels (adjusted for 5k cell grid)
export const ZOOM_LEVELS = {
  overview: 1,
  grid: 4,
  cell: 12,
} as const;

// Spring configuration - critically damped
export const SPRING_CONFIG = { dampingRatio: 1, duration: 400 };

// Known broken picsum IDs to skip
export const BROKEN_PHOTO_IDS = new Set([
  86, 97, 105, 138, 148, 150, 205, 207, 224, 226, 245, 246, 262, 285, 286, 298,
  303, 332, 333, 346, 359, 394, 414, 422, 438, 462, 463, 470, 489, 540, 561,
  578, 587, 589, 592, 595, 597, 601, 624, 632, 636, 644, 647, 673, 697, 706,
  707, 708, 709, 710, 711, 712, 713, 714, 720, 725, 734, 745, 746, 747, 748,
  749, 750, 751, 752, 753, 754, 755, 756, 757, 758, 759, 760, 761, 762, 763,
  764, 765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778,
  779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793,
  794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808,
  809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823,
  824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834, 835, 836, 837, 838,
  839, 840, 841, 842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853,
  854, 855, 856, 857, 858, 859, 860, 861, 862, 863, 864, 865, 866, 867, 868,
  869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879, 880, 881, 882, 883,
]);

// Generate valid photo IDs
export const getValidPhotoIds = (count: number): number[] => {
  const ids: number[] = [];
  let currentId = 0;
  while (ids.length < count && currentId < 1000) {
    if (!BROKEN_PHOTO_IDS.has(currentId)) {
      ids.push(currentId);
    }
    currentId++;
  }
  return ids;
};

// Generate photo URL
export const getPhotoUrl = (id: number, size: number): string => {
  return `https://picsum.photos/id/${id}/${size}/${size}`;
};
