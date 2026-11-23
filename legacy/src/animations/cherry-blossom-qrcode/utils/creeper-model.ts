import { CreeperPart } from '../types';

export interface CreeperVoxel {
  x: number;
  y: number;
  z: number;
  part: CreeperPart;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  part: CreeperPart;
}

// Vanilla creeper proportions at half a Minecraft pixel per voxel (head 8px
// -> 4 voxels), so the mob is 13 voxels tall against a ~27-block tree — big
// enough to read on a phone, small enough that the tree still dwarfs it.
// Model faces +Z; y = 0 is the ground under its feet.
const BOXES: Box[] = [
  // Head — deeper than the body, as in vanilla.
  { x0: -2, x1: 2, y0: 9, y1: 13, z0: -2, z1: 2, part: CreeperPart.Head },
  // Body.
  { x0: -2, x1: 2, y0: 3, y1: 9, z0: -1, z1: 1, part: CreeperPart.Body },
  // Four stubby legs: front pair pokes forward, back pair backward.
  { x0: -2, x1: 0, y0: 0, y1: 3, z0: 0, z1: 2, part: CreeperPart.LegFrontLeft },
  { x0: 0, x1: 2, y0: 0, y1: 3, z0: 0, z1: 2, part: CreeperPart.LegFrontRight },
  { x0: -2, x1: 0, y0: 0, y1: 3, z0: -2, z1: 0, part: CreeperPart.LegBackLeft },
  { x0: 0, x1: 2, y0: 0, y1: 3, z0: -2, z1: 0, part: CreeperPart.LegBackRight },
];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * Builds the creeper as a SHELL of voxels — interior cubes are dropped since
 * they can never be seen, and after the blast they would be debris nobody
 * asked for. ~150 visible voxels instead of ~340 solid ones.
 */
export function buildCreeperVoxels(): CreeperVoxel[] {
  const filled = new Set<string>();
  const all: CreeperVoxel[] = [];

  for (const box of BOXES) {
    for (let y = box.y0; y < box.y1; y++) {
      for (let z = box.z0; z < box.z1; z++) {
        for (let x = box.x0; x < box.x1; x++) {
          const k = key(x, y, z);
          if (filled.has(k)) continue;
          filled.add(k);
          all.push({ x, y, z, part: box.part });
        }
      }
    }
  }

  const exposed = (v: CreeperVoxel) =>
    !filled.has(key(v.x + 1, v.y, v.z)) ||
    !filled.has(key(v.x - 1, v.y, v.z)) ||
    !filled.has(key(v.x, v.y + 1, v.z)) ||
    !filled.has(key(v.x, v.y - 1, v.z)) ||
    !filled.has(key(v.x, v.y, v.z + 1)) ||
    !filled.has(key(v.x, v.y, v.z - 1));

  return all.filter(exposed);
}

// Where the legs hinge (top of the leg boxes), in voxels.
export const CREEPER_LEG_PIVOT_Y = 3;
// Total model height in voxels — used to place the blast centre at its chest.
export const CREEPER_HEIGHT = 13;
