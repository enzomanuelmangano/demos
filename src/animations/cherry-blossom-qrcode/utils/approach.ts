import {
  CREEPER_APPROACH_SPREAD,
  CREEPER_APPROACH_YAW,
  CREEPER_PATH_OFFSET,
  CREEPER_SPAWN_MARGIN,
  CREEPER_STAND_FROM_CENTRE,
  CREEPER_TRUNK_CLEARANCE,
  CREEPER_WALK_BLOCKS,
} from '../constants';

export interface Vec2 {
  x: number;
  z: number;
}

/** Walk direction for a heading. The model faces +z, so this is rotY(+z, yaw). */
export const forwardFor = (yaw: number): Vec2 => ({
  x: -Math.sin(yaw),
  z: Math.cos(yaw),
});

/**
 * Where the creeper always ends up, in blocks from the centre.
 *
 * FIXED, and deliberately not derived from the random heading: the walk is a
 * constant distance covered in a constant time, so only the direction it
 * arrives FROM varies. Deriving the destination from the heading - which is
 * what this used to do - moved the target every run.
 */
export function approachDestination(): Vec2 {
  const fwd = forwardFor(CREEPER_APPROACH_YAW);
  // Perpendicular, towards screen-right of the walk.
  const right = { x: -fwd.z, z: fwd.x };
  return {
    x: fwd.x * CREEPER_STAND_FROM_CENTRE + right.x * CREEPER_PATH_OFFSET,
    z: fwd.z * CREEPER_STAND_FROM_CENTRE + right.z * CREEPER_PATH_OFFSET,
  };
}

/** Spawn point for a heading, in blocks: a fixed distance back along it. */
export function spawnFor(yaw: number): Vec2 {
  const dest = approachDestination();
  const fwd = forwardFor(yaw);
  return {
    x: dest.x - fwd.x * CREEPER_WALK_BLOCKS,
    z: dest.z - fwd.z * CREEPER_WALK_BLOCKS,
  };
}

/**
 * Perpendicular distance from the trunk's centre to the walk line.
 *
 * The path passes through the fixed destination in direction `fwd`, so this is
 * the magnitude of the 2D cross product of the destination and the heading.
 */
export function trunkClearance(yaw: number): number {
  const dest = approachDestination();
  const fwd = forwardFor(yaw);
  return Math.abs(dest.x * fwd.z - dest.z * fwd.x);
}

/**
 * Headings whose spawn point still lands ON the platform.
 *
 * The destination sits well off-centre and the walk is a fixed 16 blocks, so
 * the spawn traces a circle that pokes outside the plate over much of its
 * range - a uniformly random heading would regularly start the mob in mid-air.
 * The usable headings are an arc, and it is not symmetric about the nominal
 * one, so it is found by sampling rather than assumed.
 */
export function validApproachYaws(gridSize: number, samples = 64): number[] {
  const limit = gridSize / 2 - CREEPER_SPAWN_MARGIN;
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const yaw =
      CREEPER_APPROACH_YAW +
      (i / (samples - 1) - 0.5) * 2 * CREEPER_APPROACH_SPREAD;
    const s = spawnFor(yaw);
    const onPlate = Math.hypot(s.x, s.z) <= limit;
    // ...and that do not walk THROUGH the trunk. The destination is fixed
    // while the heading varies, so swinging the heading pivots the whole line
    // about that point - and over the top half of the arc it swept straight
    // through the tree. Clearing the trunk at the nominal heading is not
    // enough once the approach is randomised.
    const clearsTrunk = trunkClearance(yaw) >= CREEPER_TRUNK_CLEARANCE;
    if (onPlate && clearsTrunk) out.push(yaw);
  }
  // Never return nothing: the nominal heading is the fallback.
  return out.length ? out : [CREEPER_APPROACH_YAW];
}

/** Picks one of the valid headings at random. */
export function pickApproachYaw(gridSize: number): number {
  const yaws = validApproachYaws(gridSize);
  return yaws[Math.floor(Math.random() * yaws.length)] ?? CREEPER_APPROACH_YAW;
}
