import { buildCreeperVoxels } from './creeper-model';
import {
  CHIMNEY_RISE,
  CUBE_HEIGHT,
  FOUNDATION_TOP,
  GROUND_MASS_BONUS,
  HOUSE_DEPTH_FACTOR,
  HOUSE_MAX_DEPTH,
  HOUSE_MAX_WIDTH,
  HOUSE_MIN_DEPTH,
  HOUSE_MIN_WIDTH,
  HOUSE_WIDTH_FACTOR,
  MASS_BY_TYPE,
  ROOF_BASE,
  WALL_TOP,
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

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Nearest odd number, so the gable gets a true centre ridge. */
const toOdd = (v: number) =>
  Math.round(v) % 2 === 0 ? Math.round(v) + 1 : Math.round(v);

/**
 * Generates 3D block data for a QR code rendered as a voxel house on a lawn.
 *
 * The QR survives because NOTHING is allowed to cover a module with the wrong
 * value. On the lawn that is easy: light modules are path, dark modules are
 * grass. Under the house it is not, because a roof is a solid slab over both.
 * So the roof itself carries the code: a tile standing over a dark module is
 * dark slate, one standing over a light module is pale timber. Seen from
 * above the building IS the QR; seen from the side it is a two-tone roof.
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

  // ------------------------------------------------------------------
  // House footprint, centred and always odd.
  // ------------------------------------------------------------------
  const width = toOdd(
    clamp(gridSize * HOUSE_WIDTH_FACTOR, HOUSE_MIN_WIDTH, HOUSE_MAX_WIDTH),
  );
  const depth = toOdd(
    clamp(gridSize * HOUSE_DEPTH_FACTOR, HOUSE_MIN_DEPTH, HOUSE_MAX_DEPTH),
  );
  const halfW = (width - 1) / 2;
  const halfD = (depth - 1) / 2;
  const centreCol = Math.floor(gridSize / 2);
  const centreRow = Math.floor(gridSize / 2);
  const colMin = centreCol - halfW;
  const colMax = centreCol + halfW;
  const rowMin = centreRow - halfD;
  const rowMax = centreRow + halfD;

  const inGrid = (col: number, row: number) =>
    col >= 0 && col < gridSize && row >= 0 && row < gridSize;

  // The gable ridge runs along the width, so height rises towards the middle
  // row and the triangles land on the two width-ends.
  const roofYAt = (row: number) => {
    const clamped = clamp(row, rowMin, rowMax);
    const fromEdge = Math.min(clamped - rowMin, rowMax - clamped);
    return ROOF_BASE + fromEdge;
  };

  const isCorner = (col: number, row: number) =>
    (col === colMin || col === colMax) && (row === rowMin || row === rowMax);

  // The front wall faces the camera-near side of the isometric view, which is
  // where the creeper walks in from - so the door is the thing it walks at.
  const doorCol = centreCol;
  const doorRow = rowMin;

  // ------------------------------------------------------------------
  // Walls: cobble footing, plank infill, log posts and a top plate.
  // ------------------------------------------------------------------
  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const onPerimeter =
        col === colMin || col === colMax || row === rowMin || row === rowMax;
      if (!onPerimeter || !inGrid(col, row)) continue;

      const corner = isCorner(col, row);
      for (let layer = 1; layer <= WALL_TOP; layer++) {
        // Door: a two-block opening in the front wall.
        if (
          col === doorCol &&
          row === doorRow &&
          (layer === 3 || layer === 4)
        ) {
          push(col, row, layer, BlockType.Door, false);
          continue;
        }

        if (layer <= FOUNDATION_TOP) {
          push(col, row, layer, BlockType.Cobble, false);
          continue;
        }

        // Corner posts run full height; the top course is a log plate, which
        // is what gives the reference build its timber-framed look.
        if (corner || layer === WALL_TOP) {
          push(col, row, layer, BlockType.Log, false);
          continue;
        }

        // Windows: every other bay, clear of the corners and the doorway.
        const alongWidth = row === rowMin || row === rowMax;
        const bay = alongWidth ? col - colMin : row - rowMin;
        const nearDoor = col === doorCol && row === doorRow;
        const isWindow =
          !nearDoor &&
          (layer === 5 || layer === 6 || layer === 7) &&
          bay % 2 === 1 &&
          bay > 0 &&
          bay < (alongWidth ? width : depth) - 1;
        push(
          col,
          row,
          layer,
          isWindow ? BlockType.Glass : BlockType.Planks,
          false,
        );
      }

      // Gable infill: the width-ends rise with the roof, otherwise the
      // building is open to the sky from the side.
      if (col === colMin || col === colMax) {
        for (let layer = WALL_TOP + 1; layer < roofYAt(row); layer++) {
          push(col, row, layer, BlockType.Planks, false);
        }
      }
    }
  }

  // Interior floor, one course above the footing. Hidden by the roof, but it
  // stops the inside reading as a hole once the blast opens a wall.
  for (let row = rowMin + 1; row < rowMax; row++) {
    for (let col = colMin + 1; col < colMax; col++) {
      if (inGrid(col, row)) push(col, row, 1, BlockType.Planks, false);
    }
  }

  // ------------------------------------------------------------------
  // Roof. Every tile is typed by the module UNDERNEATH it, which is what
  // keeps the code readable from directly above.
  // ------------------------------------------------------------------
  for (let row = rowMin - 1; row <= rowMax + 1; row++) {
    for (let col = colMin - 1; col <= colMax + 1; col++) {
      if (!inGrid(col, row)) continue;
      const dark = qrMatrix[row][col];
      push(
        col,
        row,
        roofYAt(row),
        dark ? BlockType.RoofDark : BlockType.RoofLight,
        false,
      );
    }
  }

  // ------------------------------------------------------------------
  // Chimney, rising out of the roof. Its cap is typed by the module too, so
  // even this one column does not punch a hole in the code.
  // ------------------------------------------------------------------
  const chimneyCol = colMin + 1;
  const chimneyRow = centreRow;
  if (inGrid(chimneyCol, chimneyRow)) {
    const top = roofYAt(chimneyRow) + CHIMNEY_RISE;
    for (let layer = 1; layer < top; layer++) {
      push(chimneyCol, chimneyRow, layer, BlockType.Cobble, false);
    }
    const dark = qrMatrix[chimneyRow][chimneyCol];
    push(
      chimneyCol,
      chimneyRow,
      top,
      dark ? BlockType.RoofDark : BlockType.RoofLight,
      false,
    );
  }

  // ------------------------------------------------------------------
  // Scattered grass tufts on the lawn, for a little relief. Ground level
  // only where the module is dark, so the code is untouched.
  // ------------------------------------------------------------------
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!qrMatrix[row][col]) continue;
      const insideHouse =
        col >= colMin - 1 &&
        col <= colMax + 1 &&
        row >= rowMin - 1 &&
        row <= rowMax + 1;
      if (insideHouse) continue;
      if (pseudoRandom(col, row, 91) > 0.9) {
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
    houseHalfW: halfW,
    houseHalfD: halfD,
  };
}
