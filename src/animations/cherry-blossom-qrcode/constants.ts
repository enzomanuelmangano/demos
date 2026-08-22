// Background and container colors
export const COLORS = {
  background: '#f7f7f7',
} as const;

export const CONTAINER_BG = COLORS.background;
export const DEFAULT_QR_CONTENT = 'https://enzo.fyi';

// If this scene is ever pointed at a TestFlight invite, use a SHORT redirect
// (enzo.fyi/beta -> testflight.apple.com/join/...) rather than the invite URL
// itself. A 42-character TestFlight link pushes the symbol from 25x25 to
// 29x29, and the canopy - which is what encodes the dark modules - is a
// weaker contrast pair than flat ground. Decoding the flat view after a
// downscale and JPEG q45:
//
//   scale                      1.0    0.6    0.45   0.3
//   short link   (25x25)       ok     ok     ok     ok
//   TestFlight URL (29x29)     fail   fail   ok     fail
//
// The redirect costs nothing and keeps the code readable off a video.

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

// Tree structure parameters
export const TRUNK_RADIUS = 2.5;
export const TRUNK_LAYERS = 12;
export const MAX_CANOPY_LAYERS = 12;
export const CANOPY_OUTER_RADIUS_FACTOR = 0.46;

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

// The mob approaches from the camera side (yaw around -PI/4) so the canopy
// never hides the one thing the whole sequence is about.
export const CREEPER_APPROACH_YAW = -Math.PI / 4;
export const CREEPER_APPROACH_SPREAD = 1.0;
// Stride frequency (steps/sec) and how far the legs swing.
export const CREEPER_STEP_RATE = 3.1;
export const CREEPER_LEG_SWING = 0.62;

// Vanilla explosion mechanics. Minecraft does not throw blocks: it deletes
// every block inside a rough sphere and drops a fraction of them as items.
//
// Scale for the rebuild's centre-outward stagger, in blocks.
export const BLAST_RADIUS = 19.0;
// Blast resistance, indexed by BlockType, using vanilla's own values: leaves
// 0.2, dirt and grass 0.5, wood 2. Minecraft's destruction rays lose energy
// per block they pass, which is why a log survives closer to the centre than
// foliage does; this reproduces that ordering rather than treating every
// block as equally fragile.
export const RESISTANCE_BY_TYPE: readonly number[] = [
  0.5, // Dirt
  0.2, // CherryBlossom / leaves
  2.0, // Trunk / log
  0.5, // Grass
  0.2, // FallenPetals
  0.0, // Creeper - it is the bomb
];
// How much resistance slows a block down when it is thrown.
export const RESISTANCE_DRAG = 0.25;

// Blocks are thrown, not deleted. Vanilla deletes them, but a QR code made of
// flying cubes is the point of the shot, so this is the one mechanic the scene
// deliberately keeps from the physics version.
export const BLAST_SPEED = 20.0;
// Speed falloff reach, in blocks. Tight enough that there is a real gradient
// across the tree - wide and everything departs at the same speed, which reads
// as the tree inflating rather than being hit.
export const BLAST_REACH_GROUND = 5.0;
export const BLAST_REACH_TREE = 8.5;
// Launched near 45 degrees. Flatter and the debris skates off the plate.
export const BLAST_UP_BIAS = 0.95;
// The shock front's speed through the scene, in blocks/sec. Without it every
// block leaves on the same frame and the canopy keeps its silhouette.
export const SHOCK_SPEED = 42.0;
export const BLAST_GRAVITY = 28.0;
export const BLAST_RESTITUTION = 0.3;
export const BLAST_FRICTION = 0.35;
// Debris fades out rather than settling into a pile: it clears the code before
// the rebuild starts, and a heap of rubble sitting on the QR was covering the
// thing the whole scene exists to show.
export const DEBRIS_FADE_START = 0.85;
export const DEBRIS_FADE_SPREAD = 0.55;
export const DEBRIS_FADE_DURATION = 0.5;

// The particle ball: how far it swells, and how long it hangs.
export const SMOKE_RADIUS = 17.0;
export const SMOKE_DURATION = 1.15;

// Timeline after detonation.
export const DEBRIS_SETTLE = 2.6;
export const REBUILD_DURATION = 1.7;
// Vanilla has no camera shake at all. Kept as a single frame of settle so
// the cut still lands, rather than the game-feel wobble it was.
export const SHAKE_DURATION = 0.18;
export const FLASH_DURATION = 0.35;
