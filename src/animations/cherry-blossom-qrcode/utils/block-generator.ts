import { buildCreeperVoxels } from './creeper-model';
import {
  CUBE_HEIGHT,
  DOCK_TOP,
  GROUND_MASS_BONUS,
  MASS_BY_TYPE,
  PHONE_DEPTH,
  PHONE_HEIGHT,
  PHONE_WIDTH,
  SCREEN_INSET,
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
 * Generates 3D block data for a QR code with a phone standing on it.
 *
 * The QR survives because nothing is allowed to cover a module with the wrong
 * value. On the lawn that is easy. The phone is the exception: its top edge is
 * the highest thing at those cells, so those blocks are typed by the module
 * underneath them, exactly as the roof was. That is only 18 cells here, which
 * is the whole reason for choosing a thin structure - the code stays flat,
 * evenly lit lawn, which is what survives being scanned off a video.
 */
export function generateBlockData(qrMatrix: boolean[][]): BlockData {
  const gridSize = qrMatrix.length;

  const positions: number[] = [];
  const mass: number[] = [];
  const baseY: number[] = [];
  const types: number[] = [];

  let blockCount = 0;
  const push = (
    col: number,
    row: number,
    layer: number,
    type: BlockType,
    isGround: boolean,
  ) => {
    positions.push(col, row, 0, 0);
    baseY.push(layer * CUBE_HEIGHT);
    types.push(type);
    mass.push((MASS_BY_TYPE[type] ?? 1) * (isGround ? GROUND_MASS_BONUS : 1));
    blockCount++;
  };

  // ------------------------------------------------------------------
  // Ground: the QR itself, one block per module.
  // ------------------------------------------------------------------
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      push(
        col,
        row,
        0,
        qrMatrix[row][col] ? BlockType.Grass : BlockType.Dirt,
        true,
      );
    }
  }

  const centreCol = Math.floor(gridSize / 2);
  const centreRow = Math.floor(gridSize / 2);
  const halfW = (PHONE_WIDTH - 1) / 2;
  const colMin = centreCol - halfW;
  const colMax = centreCol + halfW;
  // Depth 2: the front row carries the screen, the back row the body.
  const rowFront = centreRow - 1;
  const rowBack = rowFront + PHONE_DEPTH - 1;

  const inGrid = (col: number, row: number) =>
    col >= 0 && col < gridSize && row >= 0 && row < gridSize;

  // Anything that ends up top-most at a cell carries that cell's module.
  const codedTypeFor = (col: number, row: number) =>
    qrMatrix[row][col] ? BlockType.RoofDark : BlockType.RoofLight;

  const bodyBottom = DOCK_TOP + 1;
  const bodyTop = bodyBottom + PHONE_HEIGHT - 1;
  const screenLo = bodyBottom + SCREEN_INSET;
  const screenHi = bodyTop - SCREEN_INSET;

  // ------------------------------------------------------------------
  // Wooden dock. Gives the handset something to stand on and keeps the
  // silhouette from growing straight out of the grass.
  // ------------------------------------------------------------------
  for (let row = rowFront - 1; row <= rowBack + 1; row++) {
    for (let col = colMin - 1; col <= colMax + 1; col++) {
      if (!inGrid(col, row)) continue;
      for (let layer = 1; layer <= DOCK_TOP; layer++) {
        const edge =
          col === colMin - 1 ||
          col === colMax + 1 ||
          row === rowFront - 1 ||
          row === rowBack + 1;
        push(
          col,
          row,
          layer,
          edge && layer === DOCK_TOP ? BlockType.Log : BlockType.Planks,
          false,
        );
      }
    }
  }

  // A lantern on each end of the dock.
  for (const col of [colMin - 1, colMax + 1]) {
    if (inGrid(col, rowFront - 1)) {
      push(col, rowFront - 1, DOCK_TOP + 1, BlockType.Lantern, false);
    }
  }

  // ------------------------------------------------------------------
  // The handset. Front row is bezel + display, back row is the body.
  // ------------------------------------------------------------------
  for (let layer = bodyBottom; layer <= bodyTop; layer++) {
    for (let col = colMin; col <= colMax; col++) {
      // The very top course is the highest block at these cells, so it is
      // typed by the module rather than by the material.
      const coded = layer === bodyTop;

      if (inGrid(col, rowFront)) {
        const onBezel =
          col <= colMin + SCREEN_INSET - 1 ||
          col >= colMax - SCREEN_INSET + 1 ||
          layer < screenLo ||
          layer > screenHi;
        push(
          col,
          rowFront,
          layer,
          coded
            ? codedTypeFor(col, rowFront)
            : onBezel
              ? BlockType.PhoneBody
              : BlockType.Screen,
          false,
        );
      }

      for (let row = rowFront + 1; row <= rowBack; row++) {
        if (!inGrid(col, row)) continue;
        push(
          col,
          row,
          layer,
          coded ? codedTypeFor(col, row) : BlockType.PhoneBody,
          false,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Lawn planting. Tufts and shrubs only ever sit on DARK modules, so the
  // greenery can never disturb the code.
  // ------------------------------------------------------------------
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!qrMatrix[row][col]) continue;
      const nearPhone =
        col >= colMin - 2 &&
        col <= colMax + 2 &&
        row >= rowFront - 2 &&
        row <= rowBack + 2;
      if (nearPhone) continue;
      const r = pseudoRandom(col, row, 91);
      if (r > 0.94) {
        push(col, row, 1, BlockType.Foliage, false);
      } else if (r > 0.88) {
        push(col, row, 1, BlockType.Grass, false);
      }
    }
  }

  // ------------------------------------------------------------------
  // The creeper. Same buffers as the world, tagged so the vertex shader can
  // rig it; local model coords go in positions.xy/baseY, limb in positions.z.
  // ------------------------------------------------------------------
  const creeperStart = blockCount;
  for (const voxel of buildCreeperVoxels()) {
    positions.push(voxel.x, voxel.z, voxel.part, 1);
    baseY.push(voxel.y * CUBE_HEIGHT);
    types.push(BlockType.Creeper);
    mass.push(1);
    blockCount++;
  }

  return {
    positions,
    mass,
    baseY,
    types,
    gridSize,
    numBlocks: blockCount,
    creeperStart,
    phoneHalfW: halfW,
    phoneHalfD: PHONE_DEPTH / 2,
    screenLo,
    screenHi,
  };
}
