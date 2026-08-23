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

// The mob walks in from BEHIND the tree, along a WORLD AXIS rather than along
// the view diagonal. That distinction is the whole look: travelling the
// diagonal projects to straight-down-the-screen with no lateral drift, which
// reads flat, while a world axis projects to a diagonal across the plate -
// the way a mob moving on the grid reads in an isometric shot.
//
// Yaw PI/2 faces -x, which projects down-and-LEFT: it enters at the back-right
// edge and crosses to front-left of the trunk. (Yaw PI is the mirror of this,
// running back-left to front-right.)
export const CREEPER_APPROACH_YAW = Math.PI / 2;
// How far the approach heading may swing either side of nominal. Only the
// DIRECTION varies - the destination and the walk distance are fixed - so this
// can be generous without the mob arriving somewhere different.
export const CREEPER_APPROACH_SPREAD = 0.9;
// Keep the spawn point this many blocks inside the plate edge. Small, so the
// walk can start right at the back edge and cross as much ground as possible.
export const CREEPER_SPAWN_MARGIN = 0.5;
// The heading that points the mob straight at the viewer. The camera sits off
// -x-z, so facing (-0.707, -0.707) looks down the barrel of it. The approach
// heading is random, so it turns to this on the fuse - a creeper looks at you
// before it goes off.
export const CREEPER_CAMERA_YAW = (3 * Math.PI) / 4;
// Where it stops, in blocks past the centre towards the camera. Far enough
// forward that the canopy cannot hide it.
export const CREEPER_STAND_FROM_CENTRE = 6;
// How far it walks, in blocks, so more of the approach happens in view.
//
// There is a hard ceiling here: the spawn sits on a circle of this radius
// around a destination about 7 blocks off centre, so it can only still land on
// the plate while WALK <= |dest| + plateRadius, which is about 18 on a 25-wide
// grid. Past that NO heading works and the mob starts in mid-air, which is the
// floating bug again. 17.5 is close to the ceiling on purpose.
export const CREEPER_WALK_BLOCKS = 15;
// Fraction of the walk spent spawning in. The mob grows out of the ground at
// its spawn point and only then starts moving, instead of simply existing at
// full size on the first frame.
export const CREEPER_SPAWN_FRACTION = 0.12;
// Sideways offset of the whole path, in blocks, towards the camera. This is
// what makes the mob pass IN FRONT of the trunk rather than alongside it: at
// 3.5 it ended beside the trunk with their edges touching; at 6.5 the
// destination sits directly over the trunk on screen and 12 blocks nearer the
// camera, so it crosses in front of the tree it is about to remove.
export const CREEPER_PATH_OFFSET = 6.5;
// How far the walk line must stay from the trunk's centre, in blocks. The
// trunk is TRUNK_RADIUS (2.5) and the mob is about 2.5 wide, so anything under
// ~3.8 clips; this leaves a little air on top of that.
export const CREEPER_TRUNK_CLEARANCE = 4.5;
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
export const BLAST_SPEED = 27.0;
// Speed falloff reach, in blocks. Tight enough that there is a real gradient
// across the tree - wide and everything departs at the same speed, which reads
// as the tree inflating rather than being hit.
export const BLAST_REACH_GROUND = 5.0;
export const BLAST_REACH_TREE = 8.5;
// Launched near 45 degrees. Flatter and the debris skates off the plate.
export const BLAST_UP_BIAS = 0.95;
// The shock front's speed through the scene, in blocks/sec. Without it every
// block leaves on the same frame and the canopy keeps its silhouette - but at
// 42 the far side of the canopy, 30 blocks out, did not move until 0.7s after
// the bang, so the explosion visibly happened AFTER its own detonation. Fast
// enough now to cross the whole scene in about a seventh of a second: the
// ordering still reads, the delay does not.
export const SHOCK_SPEED = 220.0;
export const BLAST_GRAVITY = 28.0;
export const BLAST_RESTITUTION = 0.3;
export const BLAST_FRICTION = 0.35;
// Debris fades out rather than settling into a pile: it clears the code before
// the rebuild starts, and a heap of rubble sitting on the QR was covering the
// thing the whole scene exists to show.
export const DEBRIS_FADE_START = 0.85;
export const DEBRIS_FADE_SPREAD = 0.55;
export const DEBRIS_FADE_DURATION = 0.5;

// The particle poof. Sized off vanilla rather than off taste: a normal
// creeper uses the small `explosion` particle, while `explosion_emitter` -
// the big multi-particle ball - is reserved for TNT and CHARGED creepers. And
// explosions carried no smoke particles at all between 1.15 and 1.21.9, so a
// lingering cloud is not what a creeper looks like in most of the game's
// modern history. Small, sparse and brief.
export const SMOKE_RADIUS = 13.0;
export const SMOKE_DURATION = 0.75;
// Vanilla's explosion particle is a white-grey poof with no fire in it at
// all; the orange fireball everyone pictures comes from shaders and mods.
// Kept only as a small, very brief warm core for punch - a white flash would
// be invisible against this near-white background.
export const FIREBALL_RADIUS = 5.5;
export const FIREBALL_DURATION = 0.16;

// Timeline after detonation.
export const DEBRIS_SETTLE = 2.6;
export const REBUILD_DURATION = 1.7;
// Not vanilla, which has no shake at all - but this is a hybrid now, and the
// punch was missing without it.
export const SHAKE_DURATION = 0.45;
export const FLASH_DURATION = 0.35;
