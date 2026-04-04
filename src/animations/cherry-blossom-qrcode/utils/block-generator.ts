import {
  CANOPY_OUTER_RADIUS_FACTOR,
  CUBE_HEIGHT,
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
 */
export function generateBlockData(qrMatrix: boolean[][]): BlockData {
  const gridSize = qrMatrix.length;
  const cx = gridSize / 2;
  const cy = gridSize / 2;

  const positions: number[] = [];
  const heights: number[] = [];
  const baseY: number[] = [];
  const types: number[] = [];

  const canopyBaseHeight = TRUNK_LAYERS * CUBE_HEIGHT;
  const canopyOuterRadius = gridSize * CANOPY_OUTER_RADIUS_FACTOR;

  let blockCount = 0;

  // First pass: ground blocks (dirt, grass, trunk base, fallen petals)
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      positions.push(col, row, 0, 0);
      heights.push(CUBE_HEIGHT);
      baseY.push(0);

      if (!isQrDark) {
        types.push(BlockType.Dirt);
      } else if (dist < TRUNK_RADIUS) {
        types.push(BlockType.Trunk);
      } else if (dist >= canopyOuterRadius) {
        types.push(BlockType.Grass);
      } else {
        types.push(BlockType.FallenPetals);
      }
      blockCount++;
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
          positions.push(col, row, 0, 0);
          heights.push(CUBE_HEIGHT);
          baseY.push(layer * CUBE_HEIGHT);
          types.push(BlockType.Trunk);
          blockCount++;
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

          positions.push(col, row, 0, 0);
          heights.push(CUBE_HEIGHT);
          baseY.push(layerY + domeOffset);
          types.push(BlockType.CherryBlossom);
          blockCount++;
        }

        // Add random extra blocks on top for organic look
        const extraCount = Math.floor(pseudoRandom(col, row, 500) * 4);
        for (let e = 0; e < extraCount; e++) {
          const extraLayer = layersHere + e;
          const domeOffset = Math.floor(t * 3) * CUBE_HEIGHT;

          positions.push(col, row, 0, 0);
          heights.push(CUBE_HEIGHT);
          baseY.push(canopyBaseHeight + extraLayer * CUBE_HEIGHT + domeOffset);
          types.push(BlockType.CherryBlossom);
          blockCount++;
        }
      }
    }
  }

  return {
    positions,
    heights,
    baseY,
    types,
    gridSize,
    numBlocks: blockCount,
  };
}
