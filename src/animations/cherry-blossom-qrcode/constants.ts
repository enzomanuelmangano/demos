// Background and container colors
export const COLORS = {
  background: '#f7f7f7',
} as const;

export const CONTAINER_BG = COLORS.background;
export const DEFAULT_QR_CONTENT = 'https://enzo.fyi';

// Color palette for lighting
export const PALETTE = {
  skyZenith: { r: 0.82, g: 0.88, b: 0.92 },
  skyHorizon: { r: 0.91, g: 0.93, b: 0.91 },
  sun: { r: 1.15, g: 1.05, b: 0.95 },
  skyFill: { r: 0.85, g: 0.9, b: 0.95 },
  bounce: { r: 0.5, g: 0.65, b: 0.42 },
} as const;

// Block/cube dimensions
export const BLOCK_SIZE = 0.0245;
export const CUBE_HEIGHT = BLOCK_SIZE;

// House dimensions, in blocks. Width and depth are derived from the grid so
// the building keeps its proportions whatever QR version the URL produces,
// and both are forced ODD so the gable has a true centre ridge.
export const HOUSE_WIDTH_FACTOR = 0.5;
export const HOUSE_DEPTH_FACTOR = 0.42;
export const HOUSE_MIN_WIDTH = 9;
export const HOUSE_MAX_WIDTH = 17;
export const HOUSE_MIN_DEPTH = 7;
export const HOUSE_MAX_DEPTH = 13;

// Vertical layout, course by course. Two storeys of timber framing over a
// cobble footing, then the gable.
export const FOUNDATION_TOP = 2; // y1..y2 cobble
export const GROUND_TOP = 5; // y3..y5 lower storey
export const MID_BAND = 6; // y6 log band at the upper floor line
export const UPPER_TOP = 9; // y7..y9 upper storey
export const WALL_TOP = 10; // y10 log top plate
export const ROOF_BASE = 11; // gable starts here
export const CHIMNEY_RISE = 3;
// Window courses within each storey.
export const GROUND_WINDOW_LO = 4;
export const GROUND_WINDOW_HI = 5;
export const UPPER_WINDOW_LO = 8;
export const UPPER_WINDOW_HI = 9;
// A log post every this many cells along a wall, between the corners.
export const POST_SPACING = 4;
// Covered porch depth, in cells, in front of the door.
export const PORCH_DEPTH = 2;
export const PORCH_HALF_WIDTH = 2;
export const PORCH_ROOF_Y = 7;

// Grid limits
export const MAX_GRID_SIZE = 41;
export const MAX_BLOCKS = MAX_GRID_SIZE * MAX_GRID_SIZE * 18;

// Camera angles for 3D isometric view
export const ISO_ANGLE_Y = 0.78;
export const ISO_ANGLE_X = -0.55;

// Camera angles for 2D flat view (top-down for QR scanning)
export const FLAT_ANGLE_Y = 0.0;
export const FLAT_ANGLE_X = -1.5708; // -π/2

// Animation
export const LERP_SPEED = 4.0;

// View scaling
export const VIEW_SCALE_3D = 1.6;
export const VIEW_SCALE_2D = 2.1;

// Centering offsets for 2D view
export const Y_OFFSET_2D = 0.08;
export const X_OFFSET_2D = 0.015;

// ============================================================
// Creeper + detonation
// ============================================================

// The mob is built from the same voxel grid as the tree, shrunk so it stands
// about a third of the tree's height — a 1:1 voxel creeper next to a 27-block
// tree is a giant, and a true-to-Minecraft 1:6 one is a speck on a phone.
export const CREEPER_SCALE = 0.62;

// Spawn -> boom is exactly 5s: the walk-in, then the classic hiss/swell fuse.
export const CREEPER_WALK_DURATION = 3.2;
export const CREEPER_FUSE_DURATION = 1.8;
export const CREEPER_TOTAL = CREEPER_WALK_DURATION + CREEPER_FUSE_DURATION;

// The mob walks in along the door's axis, so it ends up on the porch step
// rather than wandering to a blank corner. Yaw 0 means "facing +z", which is
// the wall the door is in; the spread keeps two runs from looking identical
// without ever putting the creeper behind the house.
export const CREEPER_APPROACH_YAW = 0;
export const CREEPER_APPROACH_SPREAD = 0.5;
// Stride frequency (steps/sec) and how far the legs swing.
export const CREEPER_STEP_RATE = 3.1;
export const CREEPER_LEG_SWING = 0.62;

// Debris physics, written in BLOCKS (not scene units) so the numbers read
// like Minecraft and stay meaningful if BLOCK_SIZE changes: ~28 blocks/s^2
// gravity, a point-blank block leaving the crater at ~17 blocks/s.
export const BLAST_GRAVITY = 28.0;
export const BLAST_SPEED = 20.0;
// Reach of the impulse, in blocks, as 1/(1 + (d/reach)^2.2). The ground gets a
// tight one so the crater keeps a sharp lip; the tree gets a wide one because
// a trunk transmits the shock through the whole canopy instead of letting the
// far side sit there while the near side leaves.
export const BLAST_REACH_GROUND = 6.5;
export const BLAST_REACH_TREE = 15.0;
// Loose material is thrown UP as much as out. Near 45 degrees the debris
// arcs and lands back on the lawn; flatter than that and it skates off the
// plate entirely and reads like confetti in a wind tunnel.
export const BLAST_UP_BIAS = 0.95;
export const BLAST_RESTITUTION = 0.3;
export const BLAST_FRICTION = 0.35;
// Per-type mass, indexed by BlockType. Glass shatters and flies, cobble
// foundations barely notice, and the creeper's entry is never read.
export const MASS_BY_TYPE: readonly number[] = [
  1.0, // Dirt
  1.05, // Grass
  2.0, // Cobble
  1.1, // Planks
  1.6, // Log
  1.2, // RoofDark
  1.2, // RoofLight
  0.5, // Glass
  1.15, // Door
  1, // Creeper
];
export const GROUND_MASS_BONUS = 1.5;

// Timeline after detonation.
export const DEBRIS_SETTLE = 2.6;
export const REBUILD_DURATION = 1.7;
export const SHAKE_DURATION = 0.8;
export const FLASH_DURATION = 0.35;
