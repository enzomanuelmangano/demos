import { buildCreeperVoxels } from './creeper-model';
import {
  CANOPY_OUTER_RADIUS_FACTOR,
  CUBE_HEIGHT,
  RESISTANCE_BY_TYPE,
  MAX_CANOPY_LAYERS,
  TRUNK_LAYERS,
  TRUNK_RADIUS,
} from '../constants';
import { BlockData, BlockType } from '../types';

/**
 * Pseudo-random function for organic variation.
 * Returns a value between 0 and 1 based on grid position and seed.
 */
function pseudoRandom(col: number, row: number, seed: number = 0): number {
  const s = Math.sin(col * 127.1 + row * 311.7 + seed * 43.7) * 43758.5;
  return s - Math.floor(s);
}

/**
 * Generates 3D block data for a cherry blossom tree visualization of a QR code.
 *
 * The tree structure maps QR code modules to different block types:
 * - Light modules become dirt/path (scannable as "light")
 * - Dark modules become tree parts based on position:
 *   - Center: trunk
 *   - Canopy area: cherry blossoms
 *   - Outside canopy: grass
 *
 * Every block also carries a MASS, which is what the detonation reads to
 * decide how far it flies: petals drift, trunk logs barely shift, and the
 * ground resists until it is hit hard enough to crater.
 */
export function generateBlockData(qrMatrix: boolean[][]): BlockData {
  const gridSize = qrMatrix.length;
  const cx = gridSize / 2;
  const cy = gridSize / 2;

  const positions: number[] = [];
  const resistance: number[] = [];
  const baseY: number[] = [];
  const types: number[] = [];

  const canopyBaseHeight = TRUNK_LAYERS * CUBE_HEIGHT;
  const canopyOuterRadius = gridSize * CANOPY_OUTER_RADIUS_FACTOR;

  let blockCount = 0;

  const push = (col: number, row: number, layerY: number, type: BlockType) => {
    positions.push(col, row, 0, 0);
    baseY.push(layerY);
    types.push(type);
    resistance.push(RESISTANCE_BY_TYPE[type] ?? 0.5);
    blockCount++;
  };

  // First pass: ground blocks (dirt, grass, trunk base, fallen petals)
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let type = BlockType.Dirt;
      if (!isQrDark) {
        type = BlockType.Dirt;
      } else if (dist < TRUNK_RADIUS) {
        type = BlockType.Trunk;
      } else if (dist >= canopyOuterRadius) {
        type = BlockType.Grass;
      } else {
        type = BlockType.FallenPetals;
      }
      push(col, row, 0, type);
    }
  }

  // Second pass: trunk blocks stacked vertically
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      if (!isQrDark) continue;

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < TRUNK_RADIUS) {
        // Stack trunk blocks (skip layer 0, already added in first pass)
        for (let layer = 1; layer < TRUNK_LAYERS; layer++) {
          push(col, row, layer * CUBE_HEIGHT, BlockType.Trunk);
        }
      }
    }
  }

  // Third pass: canopy foliage with dome shape
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      if (!isQrDark) continue;

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < canopyOuterRadius) {
        // t = 1 at center, 0 at edge
        const t = 1 - dist / canopyOuterRadius;

        // Dome shape: more layers near center, fewer at edges
        const layersHere = Math.max(
          3,
          Math.round(MAX_CANOPY_LAYERS * (0.25 + 0.75 * t * t)),
        );

        // Stack cubic blocks vertically
        for (let layer = 0; layer < layersHere; layer++) {
          const layerY = canopyBaseHeight + layer * CUBE_HEIGHT;
          // Slight dome curve - center is higher
          const domeOffset = Math.floor(t * 3) * CUBE_HEIGHT;
          push(col, row, layerY + domeOffset, BlockType.CherryBlossom);
        }

        // Add random extra blocks on top for organic look
        const extraCount = Math.floor(pseudoRandom(col, row, 500) * 4);
        for (let e = 0; e < extraCount; e++) {
          const extraLayer = layersHere + e;
          const domeOffset = Math.floor(t * 3) * CUBE_HEIGHT;
          push(
            col,
            row,
            canopyBaseHeight + extraLayer * CUBE_HEIGHT + domeOffset,
            BlockType.CherryBlossom,
          );
        }
      }
    }
  }

  // Fourth pass: the creeper. Its voxels live in the same buffers as the tree
  // so there is still exactly one draw call, but they are tagged BlockType.
  // Creeper and carry their limb id, which the vertex shader uses to rig the
  // walk. Local model coords go in positions.xy/baseY; positions.z is the
  // limb.
  const creeperStart = blockCount;
  for (const voxel of buildCreeperVoxels()) {
    positions.push(voxel.x, voxel.z, voxel.part, 1);
    baseY.push(voxel.y * CUBE_HEIGHT);
    types.push(BlockType.Creeper);
    // Gunpowder: the mob is consumed by its own blast, so mass is irrelevant
    // — it is flagged here only for completeness.
    resistance.push(0);
    blockCount++;
  }

  return {
    positions,
    resistance,
    baseY,
    types,
    gridSize,
    numBlocks: blockCount,
    creeperStart,
  };
}
