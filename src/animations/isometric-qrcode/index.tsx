import {
  PixelRatio,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import QRCode from 'qrcode';
import { Canvas, CanvasRef } from 'react-native-wgpu';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function wgslVec3(c: RGB): string {
  return `vec3f(${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)})`;
}

function rgbToHex(c: RGB): string {
  const byte = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
}

/**
 * Photorealistic PBR-inspired palette.
 * Natural materials with physically-based colors and lighting.
 * Pool marker: isPoolLake detects waterBase { r:0.15, g:0.42, b:0.52 } (see vertex + fragment).
 */
const COLORS = {
  ink: '#2c2f36',
  canvas: '#e8e6e1',
} as const;

const ink = hexToRgb(COLORS.ink);
const canvas = hexToRgb(COLORS.canvas);

// Realistic sky - deeper blue zenith, warm atmospheric haze at horizon
const skyZenith: RGB = { r: 0.42, g: 0.58, b: 0.82 };
const skyHorizon: RGB = { r: 0.78, g: 0.82, b: 0.88 };

const SCENE_NIGHT_MUL: RGB = { r: 1.0, g: 1.0, b: 1.0 };

// Warm sandstone base for realistic stone
const sandstone: RGB = { r: 0.62, g: 0.55, b: 0.48 };
const limestone: RGB = { r: 0.76, g: 0.68, b: 0.58 };
const terracotta: RGB = { r: 0.65, g: 0.52, b: 0.45 };

const PALETTE: Record<string, RGB> = {
  // Buildings - warm earth tones
  building: lerpRgb(terracotta, ink, 0.55),
  buildingAlt: lerpRgb(sandstone, ink, 0.5),
  skyZenith,
  skyHorizon,
  fog: lerpRgb(skyHorizon, { r: 0.88, g: 0.85, b: 0.82 }, 0.35),
  // Warm golden hour sunlight
  sun: { r: 1.0, g: 0.94, b: 0.85 },
  skyFill: lerpRgb(skyZenith, skyHorizon, 0.45),
  // Warm earth bounce light
  bounce: { r: 0.78, g: 0.68, b: 0.55 },
  pavement: lerpRgb(limestone, sandstone, 0.35),
  pavementSide: lerpRgb(sandstone, ink, 0.28),
  window: { r: 0.22, g: 0.2, b: 0.28 },
  crown: lerpRgb(sandstone, canvas, 0.22),
  rim: { r: 0.95, g: 0.9, b: 0.82 },
  // Warm specular
  spec: { r: 0.92, g: 0.88, b: 0.8 },

  // Warm ambient
  ambient: { r: 0.15, g: 0.12, b: 0.1 },
  warmFaceTint: { r: 0.98, g: 0.92, b: 0.85 },
  coolFaceTint: { r: 0.82, g: 0.78, b: 0.75 },
  topWarmTint: { r: 1.0, g: 0.95, b: 0.88 },
  bottomCoolTint: { r: 0.58, g: 0.52, b: 0.48 },

  // Warm turquoise water
  waterBase: { r: 0.15, g: 0.42, b: 0.52 },
  waterLight: { r: 0.38, g: 0.58, b: 0.65 },
  waterDark: { r: 0.1, g: 0.28, b: 0.38 },
  waterFoam: { r: 0.9, g: 0.92, b: 0.92 },
  waterHighlight: { r: 0.95, g: 0.96, b: 0.95 },
  white: { r: 0.98, g: 0.96, b: 0.92 },

  // Terracotta roof tiles - warm clay
  roofBright: { r: 0.75, g: 0.48, b: 0.35 },
  roofMid: { r: 0.62, g: 0.38, b: 0.28 },
  roofDark: { r: 0.48, g: 0.28, b: 0.22 },

  // Warm earth tones
  dirtSide: { r: 0.58, g: 0.45, b: 0.35 },
  dirtDark: { r: 0.42, g: 0.32, b: 0.25 },
  dirtMid: { r: 0.5, g: 0.38, b: 0.3 },

  // Warm sandstone with natural variation
  stoneLight: { r: 0.82, g: 0.72, b: 0.62 },
  stoneMid: { r: 0.68, g: 0.58, b: 0.5 },
  stoneDark: { r: 0.52, g: 0.44, b: 0.38 },
  stoneDarkest: { r: 0.4, g: 0.34, b: 0.28 },

  // Warm brick
  brickLight: { r: 0.72, g: 0.52, b: 0.42 },
  brickMid: { r: 0.6, g: 0.42, b: 0.32 },
  brickDark: { r: 0.45, g: 0.3, b: 0.24 },

  // Warm rock tones
  rockLight: { r: 0.55, g: 0.48, b: 0.42 },
  rockMid: { r: 0.45, g: 0.38, b: 0.32 },
  rockDark: { r: 0.32, g: 0.26, b: 0.22 },
  rockAccent: { r: 0.5, g: 0.42, b: 0.35 },

  // Warm snow tint
  snowTop: { r: 0.98, g: 0.96, b: 0.94 },
  snowShade: { r: 0.85, g: 0.82, b: 0.8 },

  // Warm brass/bronze
  streetGoldBright: { r: 0.88, g: 0.72, b: 0.42 },
  streetGoldMid: { r: 0.72, g: 0.55, b: 0.3 },
  streetBronze: { r: 0.58, g: 0.42, b: 0.25 },
  streetWarmGlow: { r: 0.95, g: 0.78, b: 0.48 },

  // Warm limestone fountain
  fountainStone: { r: 0.85, g: 0.78, b: 0.68 },
  fountainStoneDark: { r: 0.62, g: 0.55, b: 0.48 },

  // Japanese ceramic roof - warm slate
  pagodaRoofLight: { r: 0.35, g: 0.32, b: 0.3 },
  pagodaRoofMid: { r: 0.28, g: 0.25, b: 0.24 },
  pagodaRoofDark: { r: 0.2, g: 0.18, b: 0.17 },

  // Warm aged brass
  metalBright: { r: 0.82, g: 0.68, b: 0.4 },
  metalMid: { r: 0.68, g: 0.52, b: 0.3 },
  metalDark: { r: 0.5, g: 0.38, b: 0.22 },

  // Warm paper lantern
  lanternPaper: { r: 0.98, g: 0.88, b: 0.68 },
  lanternCap: { r: 0.75, g: 0.62, b: 0.4 },
  lanternBand: { r: 0.5, g: 0.25, b: 0.18 },
  lanternYellow: { r: 0.98, g: 0.85, b: 0.52 },
  lanternGold: { r: 0.85, g: 0.7, b: 0.42 },
  lanternRed: { r: 0.65, g: 0.28, b: 0.2 },
  lanternAccent: { r: 0.4, g: 0.3, b: 0.18 },
  lanternHot: { r: 0.6, g: 0.45, b: 0.25 },

  // Warm aged wood
  woodDark: { r: 0.32, g: 0.24, b: 0.16 },
  woodMid: { r: 0.42, g: 0.32, b: 0.22 },
  woodLight: { r: 0.52, g: 0.4, b: 0.28 },

  // Warm wall plaster
  wallWhite: { r: 0.95, g: 0.9, b: 0.82 },
  wallCream: { r: 0.9, g: 0.84, b: 0.74 },
  frameWood: { r: 0.36, g: 0.28, b: 0.18 },

  // Warm building facades
  facadeWarm: { r: 0.92, g: 0.85, b: 0.75 },
  facadeCool: { r: 0.78, g: 0.72, b: 0.68 },
  facadeNeutral: { r: 0.82, g: 0.76, b: 0.7 },

  // Japanese autumn foliage - momiji colors
  mapleRed: { r: 0.82, g: 0.18, b: 0.12 },
  mapleOrange: { r: 0.88, g: 0.42, b: 0.15 },
  mapleGold: { r: 0.92, g: 0.72, b: 0.22 },
  mapleCrimson: { r: 0.72, g: 0.12, b: 0.18 },
  autumnBrown: { r: 0.55, g: 0.35, b: 0.2 },
  autumnTan: { r: 0.72, g: 0.55, b: 0.35 },
  fallenLeaf: { r: 0.65, g: 0.42, b: 0.22 },
  ginkgoYellow: { r: 0.95, g: 0.85, b: 0.28 },
  moss: { r: 0.32, g: 0.38, b: 0.22 },
  darkMoss: { r: 0.22, g: 0.28, b: 0.15 },
};

const CONTAINER_BG = COLORS.canvas;
const UI_INK_HEX = rgbToHex(ink);
const UI_FIELD_HEX = rgbToHex(lerpRgb(canvas, PALETTE.white, 0.88));
const UI_BORDER_RGBA = 'rgba(27, 28, 34, 0.09)';

const DEFAULT_QR_CONTENT = 'https://enzo.fyi';

function generateQRMatrix(content: string): boolean[][] {
  try {
    const qrCodeData = QRCode.create(content || DEFAULT_QR_CONTENT, {
      errorCorrectionLevel: 'M',
    });
    const { modules } = qrCodeData;
    const { size } = modules;

    const matrix: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x++) {
        row.push(modules.get(x, y) === 1);
      }
      matrix.push(row);
    }

    return matrix;
  } catch {
    // Return default QR if content is invalid
    return generateQRMatrix(DEFAULT_QR_CONTENT);
  }
}

// Maximum grid size we support (QR version ~6)
const MAX_GRID_SIZE = 41;
const MAX_BLOCKS = MAX_GRID_SIZE * MAX_GRID_SIZE;

/** Standard QR finder patterns — three 7×7 blocks on the edges (no bottom-right finder). */
const FINDER_PATTERN_SIZE = 7;

/** Outer ring of each 7×7 finder — one shared height (the “square” outline). */
const FINDER_EDGE_MODULE_HEIGHT = 0.14;

/** Inner 5×5 of the finder — shorter than the ring. */
const FINDER_INNER_MODULE_HEIGHT = 0.095;

/** Which finder patterns become special structures */
/** Fountain positions: 'bl' = top-left on screen, 'tr' = bottom-right on screen */
const FOUNTAIN_FINDERS: ('bl' | 'tr')[] = ['bl', 'tr'];
type FinderKind = 'tl' | 'tr' | 'bl';

function finderPlacement(
  col: number,
  row: number,
  gridSize: number,
): { kind: FinderKind; lx: number; ly: number } | null {
  const n = gridSize;
  const f = FINDER_PATTERN_SIZE;
  if (n < f) {
    return null;
  }
  if (col < f && row < f) {
    return { kind: 'tl', lx: col, ly: row };
  }
  if (col >= n - f && row < f) {
    return { kind: 'tr', lx: col - (n - f), ly: row };
  }
  if (col < f && row >= n - f) {
    return { kind: 'bl', lx: col, ly: row - (n - f) };
  }
  return null;
}

/** True on the 7×7 perimeter (ISO finder frame); false on inner 5×5. */
function isFinderOuterRing(lx: number, ly: number): boolean {
  const f = FINDER_PATTERN_SIZE;
  return lx === 0 || lx === f - 1 || ly === 0 || ly === f - 1;
}

/** Inner 5×5 of a finder: the “well” inside the gray stone frame (lake), not the 7×7 rim. */
function isFinderInnerCell(
  col: number,
  row: number,
  gridSize: number,
): boolean {
  const p = finderPlacement(col, row, gridSize);
  if (p === null) {
    return false;
  }
  return !isFinderOuterRing(p.lx, p.ly);
}

function finderModuleHeight(
  col: number,
  row: number,
  gridSize: number,
): number | null {
  const p = finderPlacement(col, row, gridSize);
  if (p === null) {
    return null;
  }
  return isFinderOuterRing(p.lx, p.ly)
    ? FINDER_EDGE_MODULE_HEIGHT
    : FINDER_INNER_MODULE_HEIGHT;
}

/** Get the center positions of fountains in grid coordinates */
function getFountainCenters(gridSize: number): { col: number; row: number }[] {
  const f = FINDER_PATTERN_SIZE;
  const center = Math.floor(f / 2);
  const positions: { col: number; row: number }[] = [];

  for (const finder of FOUNTAIN_FINDERS) {
    if (finder === 'bl') {
      // Bottom-left in matrix = top-left on screen
      positions.push({ col: center, row: gridSize - f + center });
    } else if (finder === 'tr') {
      // Top-right in matrix = bottom-right on screen
      positions.push({ col: gridSize - f + center, row: center });
    }
  }
  return positions;
}

/** Get the center position of the castle in grid coordinates */
function getCastleCenter(gridSize: number): { col: number; row: number } {
  const f = FINDER_PATTERN_SIZE;
  const center = Math.floor(f / 2);
  // 'br' area = bottom-right in matrix = top-right on screen
  return { col: gridSize - f + center, row: gridSize - f + center };
}

/**
 * Matrix corner labels: col→, row↓. Row 0 sits toward the bottom of the view;
 * **top-right on screen** matches `'br'` (max col & row).
 */
const SKYLINE_PEAK_CORNER: 'tl' | 'tr' | 'bl' | 'br' = 'br';

/** Low uniform heights for stone pillar field */
const SKYLINE_FABRIC_MIN = 0.14;
const SKYLINE_FABRIC_MAX = 0.22;

function skylinePeakCorner(): { px: number; py: number } {
  switch (SKYLINE_PEAK_CORNER) {
    case 'tl':
      return { px: 0, py: 0 };
    case 'tr':
      return { px: 1, py: 0 };
    case 'bl':
      return { px: 0, py: 1 };
    case 'br':
      return { px: 1, py: 1 };
  }
}

/**
 * Pure smooth gradient from peak corner - no randomness.
 * Heights decrease naturally as you move away from the "downtown" area.
 */
function skylineFabricHeight(
  col: number,
  row: number,
  gridSize: number,
): number {
  const g = Math.max(1, gridSize - 1);
  const nx = col / g;
  const nz = row / g;

  // Pure distance-based gradient from peak corner
  const { px, py } = skylinePeakCorner();
  const distFromPeak = Math.hypot(nx - px, nz - py) / Math.SQRT2;

  // Smooth falloff - no waves, no noise
  const t = 1.0 - distFromPeak;
  return SKYLINE_FABRIC_MIN + t * (SKYLINE_FABRIC_MAX - SKYLINE_FABRIC_MIN);
}

/**
 * Landmark (Gaussian-ish bump) at one corner + city fabric elsewhere.
 * Only the chosen corner reaches ~1.0; the rest stays in a low band with gentle hills.
 */
function skylineHeight(col: number, row: number, gridSize: number): number {
  // Get pagoda center position
  const f = 7; // finder pattern size
  const pagodaCol = gridSize - f + Math.floor(f / 2);
  const pagodaRow = gridSize - f + Math.floor(f / 2);

  // Distance from pagoda in blocks
  const distFromPagoda = Math.max(
    Math.abs(col - pagodaCol),
    Math.abs(row - pagodaRow),
  );

  // Very flat ground within 3 blocks of pagoda
  if (distFromPagoda <= 3) {
    return 0.001; // Basically flat - grass level
  }

  // Normal height for trees further away
  const fabric = skylineFabricHeight(col, row, gridSize);
  return fabric;
}

const BUILDING_BASE: RGB = PALETTE.building;

/** Unused visually — aligned to horizon OKLCH for data consistency */
const GROUND_COLOR: RGB = PALETTE.skyHorizon;

/** Marker albedo for finder pools — must match PALETTE.waterBase (isPoolLake gate in shaders). */
const FOUNTAIN_POOL_LAKE: RGB = PALETTE.waterBase;

function packRGB(c: RGB): number {
  return (
    Math.floor(c.r * 255) * 65536 +
    Math.floor(c.g * 255) * 256 +
    Math.floor(c.b * 255)
  );
}

function generateBlockData(qrMatrix: boolean[][]): {
  positions: number[];
  heights: number[];
  colors: number[];
  neighbors: number[];
  gridSize: number;
  numBlocks: number;
} {
  const gridSize = qrMatrix.length;
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];
  const neighbors: number[] = [];

  // Get fountain centers and castle center to exclude those blocks
  const fountainCenters = getFountainCenters(gridSize);
  const castleCenter = getCastleCenter(gridSize);

  // Helper to check if a cell is a "tall" block (QR module)
  const isTallBlock = (c: number, r: number): boolean => {
    if (c < 0 || c >= gridSize || r < 0 || r >= gridSize) return false;
    // Check castle area
    if (
      Math.abs(c - castleCenter.col) <= 3 &&
      Math.abs(r - castleCenter.row) <= 3
    )
      return false;
    // Check fountain areas
    if (
      fountainCenters.some(
        fc => Math.abs(c - fc.col) <= 1 && Math.abs(r - fc.row) <= 1,
      )
    )
      return false;
    if (isFinderInnerCell(c, r, gridSize)) return false;
    return qrMatrix[r][c];
  };

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isModule = qrMatrix[row][col];

      // Check if this block is in any fountain area (3x3 around center)
      const inFountainArea = fountainCenters.some(
        fc => Math.abs(col - fc.col) <= 1 && Math.abs(row - fc.row) <= 1,
      );

      // Check if this block is in the castle area (within finder pattern bounds)
      const inCastleArea =
        Math.abs(col - castleCenter.col) <= 3 &&
        Math.abs(row - castleCenter.row) <= 3;

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (inCastleArea) {
        color = GROUND_COLOR;
        height = 0.001;
      } else if (inFountainArea || isFinderInnerCell(col, row, gridSize)) {
        // All three finders: inner 5×5 is water (outer 7×7 ring stays tall stone).
        // inFountainArea is redundant with inner cells but keeps intent explicit.
        color = FOUNTAIN_POOL_LAKE;
        height = 0.001;
      } else if (isModule) {
        const district = Math.floor(col / 6) + Math.floor(row / 6);
        color = district % 2 === 0 ? BUILDING_BASE : PALETTE.buildingAlt;
        const fh = finderModuleHeight(col, row, gridSize);
        height = fh !== null ? fh : skylineHeight(col, row, gridSize);
      } else {
        color = GROUND_COLOR;
        /** Normalized — vertex shader applies a small extrude scale for lots */
        height = 0.006;
      }

      // Pack neighbor info: bit0=+X, bit1=-X, bit2=+Z, bit3=-Z, bits4-7=corners
      let neighborBits = 0;
      if (isTallBlock(col + 1, row)) neighborBits |= 1; // +X (right)
      if (isTallBlock(col - 1, row)) neighborBits |= 2; // -X (left)
      if (isTallBlock(col, row + 1)) neighborBits |= 4; // +Z (front)
      if (isTallBlock(col, row - 1)) neighborBits |= 8; // -Z (back)
      // Corners for smoother rounding
      if (isTallBlock(col + 1, row + 1)) neighborBits |= 16; // +X+Z
      if (isTallBlock(col - 1, row + 1)) neighborBits |= 32; // -X+Z
      if (isTallBlock(col + 1, row - 1)) neighborBits |= 64; // +X-Z
      if (isTallBlock(col - 1, row - 1)) neighborBits |= 128; // -X-Z

      heights.push(height);
      colors.push(packRGB(color));
      neighbors.push(neighborBits);
    }
  }

  return {
    positions,
    heights,
    colors,
    neighbors,
    gridSize,
    numBlocks: gridSize * gridSize,
  };
}

// Pack QR matrix into u32 array for shader (1 bit per cell)
function packQRMatrix(qrMatrix: boolean[][]): Uint32Array {
  const gridSize = qrMatrix.length;
  const totalCells = gridSize * gridSize;
  const numU32s = Math.ceil(totalCells / 32);
  const packed = new Uint32Array(numU32s + 1); // +1 for gridSize
  packed[0] = gridSize; // Store grid size at index 0

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cellIndex = row * gridSize + col;
      const u32Index = Math.floor(cellIndex / 32) + 1; // +1 because index 0 is gridSize
      const bitIndex = cellIndex % 32;
      if (qrMatrix[row][col]) {
        packed[u32Index] |= 1 << bitIndex;
      }
    }
  }
  return packed;
}

const ISO_ANGLE_Y = 0.78;
const ISO_ANGLE_X = -0.55;
const FLAT_ANGLE_Y = 0.0;
const FLAT_ANGLE_X = -1.5708;

const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) shimmer: f32,
  @location(3) building: f32,
  @location(4) facadeUv: vec2f,
  @location(5) faceVertical: f32,
  @location(6) blockSeed: vec2f,
  @location(7) faceNy: f32,
  @location(8) worldN: vec3f,
  @location(9) viewPos: vec3f,
  @location(10) blockH: f32,
  @location(11) neighbors: f32,
  @location(12) faceDir: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;
@group(0) @binding(4) var<storage, read> blockNeighbors: array<u32>;

fn unpackColor(packed: u32) -> vec3f {
  let r = f32((packed >> 16u) & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32(packed & 0xFFu) / 255.0;
  return vec3f(r, g, b);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let progress = uniforms.progress;

  let faceIndex = vertexIndex / 6u;
  let faceVertex = vertexIndex % 6u;

  let blockPos = blockPositions[instanceIndex].xyz;
  let blockColorPacked = blockColors[instanceIndex];
  let blockHeight = blockHeights[instanceIndex];
  let blockColor = unpackColor(blockColorPacked);
  let neighborBits = blockNeighbors[instanceIndex];

  let blockSize = 0.0245;
  let maxHeight = 14.0;
  let isBuilding = blockHeight > 0.085;

  let buildingExtrude = max(blockHeight * maxHeight, 0.2);
  let flatBuilding = 0.2;
  /** Keep lot extrusion ~same absolute thickness as before (was 4.05×0.14) */
  let lotBase = blockHeight * maxHeight * 0.041;

  // Detect water: waterBase = { r: 0.15, g: 0.42, b: 0.52 }
  let isPoolLake =
    blockColor.x < 0.2 && blockColor.y > 0.35 && blockColor.y < 0.55 && blockColor.z > 0.45 && blockColor.z < 0.6;

  let lx = i32(blockPos.x + 0.01);
  let lz = i32(blockPos.z + 0.01);
  // One lantern every 6 modules — readable paths, not crowded
  let onLanternGrid = ((lx + 2) % 6 == 0) && ((lz + 2) % 6 == 0);
  let isStreetLantern = !isBuilding && onLanternGrid && !isPoolLake;

  var height: f32;
  if (isBuilding) {
    height = mix(buildingExtrude, flatBuilding, progress);
  } else if (isPoolLake) {
    // Match flattened buildings in 2D so water modules stay visible top-down
    height = mix(lotBase, flatBuilding, progress);
  } else if (isStreetLantern) {
    // Same vertical scale as island stone towers (~2+ in extrusion units)
    let lanternIso = 2.45;
    let lanternFlat = 0.11;
    height = mix(lanternIso, lanternFlat, progress);
  } else {
    height = lotBase * (1.0 - progress);
  }

  var shimmerVal = 0.0;

  var localPos: vec3f;
  var faceNormal: vec3f;
  var facadeUv = vec2f(0.0);
  var faceVertical = 0.0;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  let cs = 1.0;
  let hw = cs * 0.5;
  let hh = height * 0.5;

  switch(faceIndex) {
    case 0u: { // Top — UV for roof variation
      localPos = vec3f((qv.x - 0.5) * cs, hh, (qv.y - 0.5) * cs);
      faceNormal = vec3f(0.0, 1.0, 0.0);
      facadeUv = qv;
    }
    case 1u: { // Bottom
      localPos = vec3f((qv.x - 0.5) * cs, -hh, (0.5 - qv.y) * cs);
      faceNormal = vec3f(0.0, -1.0, 0.0);
      facadeUv = qv;
    }
    case 2u: { // Front
      localPos = vec3f((qv.x - 0.5) * cs, (qv.y - 0.5) * height, hw);
      faceNormal = vec3f(0.0, 0.0, 1.0);
      facadeUv = qv;
      faceVertical = 1.0;
    }
    case 3u: { // Back
      localPos = vec3f((0.5 - qv.x) * cs, (qv.y - 0.5) * height, -hw);
      faceNormal = vec3f(0.0, 0.0, -1.0);
      facadeUv = qv;
      faceVertical = 1.0;
    }
    case 4u: { // Right
      localPos = vec3f(hw, (qv.y - 0.5) * height, (qv.x - 0.5) * cs);
      faceNormal = vec3f(1.0, 0.0, 0.0);
      facadeUv = qv;
      faceVertical = 1.0;
    }
    case 5u: { // Left
      localPos = vec3f(-hw, (qv.y - 0.5) * height, (0.5 - qv.x) * cs);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
      facadeUv = qv;
      faceVertical = 1.0;
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  var worldPos = blockPos * blockSize + localPos * blockSize;
  worldPos.y += hh * blockSize;
  if (isStreetLantern) {
    let cobbleTop = 0.006 * maxHeight * 0.041 * (1.0 - progress) * blockSize;
    // Clear the maze walls — offset ~one storey in world units
    let pedestal = 2.35 * blockSize * mix(1.0, 0.2, progress);
    worldPos.y += cobbleTop + pedestal;
  }

  worldPos.x -= uniforms.gridSize * blockSize * 0.5;
  worldPos.z -= uniforms.gridSize * blockSize * 0.5;

  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY);
  let sy = sin(isoAngleY);
  let cx = cos(isoAngleX);
  let sx = sin(isoAngleX);

  let ry_x = worldPos.x * cy - worldPos.z * sy;
  let ry_z = worldPos.x * sy + worldPos.z * cy;
  let rx_y = worldPos.y * cx - ry_z * sx;
  let rx_z = worldPos.y * sx + ry_z * cx;

  let ny_x = faceNormal.x * cy - faceNormal.z * sy;
  let ny_z = faceNormal.x * sy + faceNormal.z * cy;
  let nx_y = faceNormal.y * cx - ny_z * sx;
  let nx_z = faceNormal.y * sx + ny_z * cx;
  let rotatedNormal = normalize(vec3f(ny_x, nx_y, nx_z));

  let scale = mix(1.0, 1.35, progress);
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.color = blockColor;
  output.shade = 1.0;
  output.shimmer = shimmerVal;
  output.building = select(0.0, 1.0, isBuilding);
  output.facadeUv = facadeUv;
  output.faceVertical = faceVertical;
  output.blockSeed = vec2f(blockPos.x, blockPos.z);
  output.faceNy = faceNormal.y;
  output.worldN = rotatedNormal;
  output.viewPos = vec3f(ry_x, rx_y, rx_z);
  output.blockH = blockHeight;
  output.neighbors = f32(neighborBits);
  output.faceDir = f32(faceIndex);

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct FragmentInput {
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) shimmer: f32,
  @location(3) building: f32,
  @location(4) facadeUv: vec2f,
  @location(5) faceVertical: f32,
  @location(6) blockSeed: vec2f,
  @location(7) faceNy: f32,
  @location(8) worldN: vec3f,
  @location(9) viewPos: vec3f,
  @location(10) blockH: f32,
  @location(11) neighbors: f32,
  @location(12) faceDir: f32,
}

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Calculate edge rounding factor based on neighbors
// Returns 0.0-1.0 where 1.0 means fully exposed edge (should be rounded)
fn getEdgeRounding(uv: vec2f, neighbors: u32, faceDir: u32) -> f32 {
  let edgeSize = 0.12;
  var rounding = 0.0;

  // Neighbor bits: 0=+X, 1=-X, 2=+Z, 3=-Z, 4=+X+Z, 5=-X+Z, 6=+X-Z, 7=-X-Z
  let hasRight = (neighbors & 1u) != 0u;
  let hasLeft = (neighbors & 2u) != 0u;
  let hasFront = (neighbors & 4u) != 0u;
  let hasBack = (neighbors & 8u) != 0u;

  // Top face (faceDir=0): check all 4 edges
  if (faceDir == 0u) {
    // Right edge (+X)
    if (!hasRight && uv.x > (1.0 - edgeSize)) {
      let t = (uv.x - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    // Left edge (-X)
    if (!hasLeft && uv.x < edgeSize) {
      let t = (edgeSize - uv.x) / edgeSize;
      rounding = max(rounding, t * t);
    }
    // Front edge (+Z / +Y in UV)
    if (!hasFront && uv.y > (1.0 - edgeSize)) {
      let t = (uv.y - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    // Back edge (-Z / -Y in UV)
    if (!hasBack && uv.y < edgeSize) {
      let t = (edgeSize - uv.y) / edgeSize;
      rounding = max(rounding, t * t);
    }
  }
  // Front face (faceDir=2): left/right edges
  else if (faceDir == 2u) {
    if (!hasRight && uv.x > (1.0 - edgeSize)) {
      let t = (uv.x - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    if (!hasLeft && uv.x < edgeSize) {
      let t = (edgeSize - uv.x) / edgeSize;
      rounding = max(rounding, t * t);
    }
  }
  // Back face (faceDir=3): left/right edges (reversed)
  else if (faceDir == 3u) {
    if (!hasLeft && uv.x > (1.0 - edgeSize)) {
      let t = (uv.x - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    if (!hasRight && uv.x < edgeSize) {
      let t = (edgeSize - uv.x) / edgeSize;
      rounding = max(rounding, t * t);
    }
  }
  // Right face (faceDir=4): front/back edges
  else if (faceDir == 4u) {
    if (!hasFront && uv.x > (1.0 - edgeSize)) {
      let t = (uv.x - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    if (!hasBack && uv.x < edgeSize) {
      let t = (edgeSize - uv.x) / edgeSize;
      rounding = max(rounding, t * t);
    }
  }
  // Left face (faceDir=5): front/back edges (reversed)
  else if (faceDir == 5u) {
    if (!hasBack && uv.x > (1.0 - edgeSize)) {
      let t = (uv.x - (1.0 - edgeSize)) / edgeSize;
      rounding = max(rounding, t * t);
    }
    if (!hasFront && uv.x < edgeSize) {
      let t = (edgeSize - uv.x) / edgeSize;
      rounding = max(rounding, t * t);
    }
  }

  return rounding;
}

// Overgrown vegetation - moss, grass, vines for organic feel
struct VegetationResult {
  color: vec3f,
  amount: f32,
}

fn getVegetation(uv: vec2f, seed: vec2f, blockH: f32, isTop: bool, isLeftFace: bool, N: vec3f, time: f32) -> VegetationResult {
  var result: VegetationResult;
  result.color = vec3f(0.0);
  result.amount = 0.0;

  // Japanese autumn foliage colors (momiji)
  let mapleRed = ${wgslVec3(PALETTE.mapleRed)};
  let mapleOrange = ${wgslVec3(PALETTE.mapleOrange)};
  let mapleGold = ${wgslVec3(PALETTE.mapleGold)};
  let mapleCrimson = ${wgslVec3(PALETTE.mapleCrimson)};
  let autumnBrown = ${wgslVec3(PALETTE.autumnBrown)};
  let autumnTan = ${wgslVec3(PALETTE.autumnTan)};
  let fallenLeaf = ${wgslVec3(PALETTE.fallenLeaf)};
  let ginkgoYellow = ${wgslVec3(PALETTE.ginkgoYellow)};
  let moss = ${wgslVec3(PALETTE.moss)};
  let darkMoss = ${wgslVec3(PALETTE.darkMoss)};

  // Per-block foliage - most blocks have scattered autumn leaves
  let blockVeg = fract(sin(seed.x * 127.3 + seed.y * 311.7) * 43758.5);
  let hasLeaves = blockVeg > 0.25; // ~75% of blocks have fallen leaves

  // Multi-octave noise for organic patterns
  let n1 = fract(sin(uv.x * 17.3 + uv.y * 31.7 + seed.x * 7.1) * 43758.5);
  let n2 = fract(sin(uv.x * 43.1 + uv.y * 67.3 + seed.y * 13.7) * 43758.5);
  let noise = n1 * 0.6 + n2 * 0.4;

  if (isTop) {
    // TOP FACE: Fallen autumn leaves scattered on stone
    if (!hasLeaves) {
      // Some blocks just have subtle moss
      if (blockVeg > 0.35) {
        let mossNoise = fract(sin(uv.x * 12.0 + uv.y * 15.0 + seed.x) * 43758.5);
        if (mossNoise > 0.6) {
          result.color = mix(moss, darkMoss, noise);
          result.amount = mossNoise * 0.3;
        }
      }
      return result;
    }

    // Pixelated fallen leaves (8x8 for chunkier leaves)
    let px = floor(uv.x * 8.0);
    let py = floor(uv.y * 8.0);
    let leafNoise = fract(sin(px * 127.1 + py * 311.7 + seed.x * 17.3) * 43758.5);
    let leafType = fract(sin(px * 73.1 + py * 91.7 + seed.y * 31.3) * 43758.5);

    // Dense leaf coverage on tops
    if (leafNoise > 0.25) {
      // Pick autumn color based on leaf type
      var leafColor = mapleOrange;
      if (leafType < 0.2) { leafColor = mapleRed; }
      else if (leafType < 0.35) { leafColor = mapleCrimson; }
      else if (leafType < 0.5) { leafColor = mapleGold; }
      else if (leafType < 0.65) { leafColor = ginkgoYellow; }
      else if (leafType < 0.8) { leafColor = fallenLeaf; }
      else { leafColor = autumnBrown; }

      // Slight variation within each leaf
      leafColor = leafColor * (0.85 + noise * 0.3);

      result.color = leafColor;
      result.amount = 0.85;
    }

  } else {
    // SIDE FACES: Occasional clinging leaves and moss
    if (!hasLeaves) {
      return result;
    }

    // Sparse moss at bottom of walls (Japanese garden style)
    if (uv.y < 0.2) {
      let mossNoise = fract(sin(uv.x * 15.0 + uv.y * 12.0 + seed.x * 9.3) * 43758.5);
      if (mossNoise > 0.6) {
        result.color = mix(darkMoss, moss, noise);
        result.amount = (0.2 - uv.y) * mossNoise * 0.5;
        return result;
      }
    }

    // Rare clinging autumn leaf
    let leafX = floor(uv.x * 6.0);
    let leafY = floor(uv.y * 4.0);
    let clingNoise = fract(sin(leafX * 73.7 + leafY * 127.3 + seed.y * 17.3) * 43758.5);

    if (clingNoise > 0.88) {
      let leafType = fract(sin(leafX * 31.7 + seed.x * 73.1) * 43758.5);
      var clingColor = mapleRed;
      if (leafType < 0.3) { clingColor = mapleOrange; }
      else if (leafType < 0.6) { clingColor = mapleGold; }

      result.color = clingColor * 0.9;
      result.amount = 0.7;
    }
  }

  return result;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let p = uniforms.progress;
  let uv = input.facadeUv;
  let N = normalize(input.worldN);
  let V = normalize(vec3f(0.12, 0.38, 0.88));
  // Day — soft sun + sky fill
  let sunDir = normalize(vec3f(0.42, 0.68, 0.38));
  let halfUp = normalize(vec3f(0.08, 1.0, 0.12));
  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, halfUp), 0.0);
  let H = normalize(sunDir + V);
  let NdH = max(dot(N, H), 0.0);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let bounce = ${wgslVec3(PALETTE.bounce)};
  let ambient = ${wgslVec3(PALETTE.ambient)};

  let dist = length(input.viewPos);
  let aerial = 1.0 - exp(-dist * 0.048);
  let fogCol = ${wgslVec3(PALETTE.fog)};

  if (input.building < 0.5) {
    if (input.faceNy < -0.45) {
      discard;
    }

    // Fountain pool floor — detect waterBase { r: 0.15, g: 0.42, b: 0.52 }
    let isPoolLake =
      input.color.x < 0.2 && input.color.y > 0.35 && input.color.y < 0.55 && input.color.z > 0.45 && input.color.z < 0.6;

    if (isPoolLake) {
      let t = uniforms.time;
      let waterBase = ${wgslVec3(PALETTE.waterBase)};
      let waterLight = ${wgslVec3(PALETTE.waterLight)};
      let waterDark = ${wgslVec3(PALETTE.waterDark)};
      var albedoLake = waterBase;
      if (input.faceNy > 0.5) {
        // Realistic water surface with caustic-like patterns
        let centerDist = length(uv - vec2f(0.5, 0.5));
        let ripple = sin(centerDist * 18.0 - t * 2.8) * 0.5 + 0.5;
        let rippleFade = 1.0 - smoothstep(0.0, 0.6, centerDist);
        // Layered wave patterns for realism
        let wave1 = sin((uv.x + uv.y) * 12.0 + t * 1.5) * 0.5 + 0.5;
        let wave2 = sin((uv.x - uv.y) * 8.0 - t * 1.2) * 0.5 + 0.5;
        let pattern = mix(wave1 * wave2, ripple * rippleFade, 0.4);
        // Depth-based color (darker in center, lighter at edges)
        let depthFade = smoothstep(0.0, 0.5, centerDist);
        albedoLake = mix(waterDark, waterLight, pattern * 0.5 + depthFade * 0.3);
        // Subtle foam near center
        if (centerDist < 0.15) {
          let foam = fract(sin(t * 6.0 + uv.x * 40.0 + uv.y * 35.0) * 43758.5);
          if (foam > 0.8) {
            albedoLake = mix(albedoLake, ${wgslVec3(PALETTE.waterFoam)}, 0.25);
          }
        }
      } else {
        // Underwater side view - darker with caustic hints
        let sideN = fract(sin(uv.x * 28.0 + uv.y * 20.0 + t * 1.2) * 43758.5);
        albedoLake = mix(waterDark, waterBase, 0.35 + 0.25 * sideN);
        albedoLake = albedoLake * (0.75 + 0.25 * NdSun);
      }
      // Realistic water specular (high gloss)
      let waterSpec = ${wgslVec3(PALETTE.waterHighlight)} * pow(NdH, 96.0) * 0.45;
      // Fresnel reflection (water F0 ~0.02)
      let fresnelWater = 0.02 + 0.98 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
      let skyReflect = skyFill * fresnelWater * 0.35;
      var hdrL =
        albedoLake * (bounce * 0.25 + sunCol * NdSun * 0.55 + skyFill * NdUp * 0.3) +
        waterSpec + skyReflect;
      hdrL = mix(hdrL, fogCol, aerial * 0.08 * (1.0 - p * 0.35));
      hdrL = acesFilm(hdrL * 1.1);
      hdrL = pow(hdrL, vec3f(1.0 / 2.2));
      // Stay opaque in top-down 2D (other ground fades with progress)
      return vec4f(hdrL, 1.0);
    }

    // Golden street lanterns — sparse grid matches vertex
    let g = input.blockSeed;
    let ix = i32(g.x + 0.01);
    let iz = i32(g.y + 0.01);
    let isStreetLan = ((ix + 2) % 6 == 0) && ((iz + 2) % 6 == 0);

    if (isStreetLan) {
      let t = uniforms.time;
      let flicker =
        0.88 +
        0.12 * sin(t * 3.7 + g.x * 2.3 + g.y * 1.9) * sin(t * 5.1 + g.x);
      let goldBright = ${wgslVec3(PALETTE.streetGoldBright)};
      let goldMid = ${wgslVec3(PALETTE.streetGoldMid)};
      let bronze = ${wgslVec3(PALETTE.streetBronze)};
      let pat = fract(sin(uv.x * 44.0 + uv.y * 31.0 + g.x * 7.1) * 43758.5);
      var body = mix(bronze, goldMid, pat * 0.45 + 0.28);
      var emis = vec3f(0.0);
      var sh = 1.0;
      var wetMetal = 1.0;

      if (input.faceNy > 0.5) {
        body = mix(goldMid, goldBright, 0.4 + pat * 0.25);
        sh = 1.04;
        emis = goldBright * 0.36 * flicker;
        wetMetal = 1.35;
      } else if (input.faceVertical > 0.5) {
        let band = step(0.2, uv.y) * step(uv.y, 0.82);
        let warm = ${wgslVec3(PALETTE.streetWarmGlow)};
        if (band > 0.5) {
          emis = warm * (2.8 + 1.0 * pat) * flicker;
          body = mix(body, warm * 0.42, 0.65);
          wetMetal = 0.55;
        } else {
          sh = 0.62;
          body = mix(bronze, goldMid, 0.55);
        }
      } else {
        sh = 0.52;
        body = mix(bronze, goldMid * 0.7, 0.35);
      }

      let glintPhase =
        sin(t * 2.6 + uv.x * 28.0 + uv.y * 21.0 + g.x * 0.7 + g.y * 0.5) * 0.5 +
        0.5;
      let specCore = ${wgslVec3(PALETTE.spec)} * pow(NdH, 56.0) * 0.42 * wetMetal;
      let specPin = goldBright * pow(NdH, 132.0) * 0.62 * glintPhase * wetMetal;
      let rimGold =
        goldBright * pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 2.6) * 0.22 * wetMetal;

      var hdrLan = body * sh + emis + specCore + specPin + rimGold;
      hdrLan = acesFilm(hdrLan * 1.04);
      hdrLan = pow(hdrLan, vec3f(1.0 / 2.04));
      return vec4f(hdrLan, 1.0);
    }

    let stoneLight = ${wgslVec3(PALETTE.stoneLight)};
    let stoneMid = ${wgslVec3(PALETTE.stoneMid)};
    let stoneDark = ${wgslVec3(PALETTE.stoneDark)};
    let stoneDarkest = ${wgslVec3(PALETTE.stoneDarkest)};

    var albedo = stoneMid;
    if (input.faceNy > 0.5) {
      // TOP - smooth stone with subtle variation
      let texNoise = fract(sin(uv.x * 40.0 + uv.y * 35.0 + g.x * 17.3) * 43758.5);
      let texNoise2 = fract(sin(uv.x * 25.0 + uv.y * 30.0 + g.y * 11.7) * 43758.5);

      // Smooth color blend based on noise
      albedo = mix(stoneMid, stoneLight, texNoise * 0.4);
      albedo = mix(albedo, stoneDark, texNoise2 * 0.25);

      // Subtle surface texture
      albedo = albedo * (0.92 + texNoise * 0.08);
      albedo = albedo * (0.55 + 0.12 * NdSun + 0.25 * NdUp);
    } else {
      // SIDE - smooth darker stone
      let sideNoise = fract(sin(uv.x * 30.0 + uv.y * 20.0 + g.x) * 43758.5);
      albedo = mix(stoneDark, stoneMid, sideNoise * 0.4);
      albedo = albedo * (0.52 + 0.12 * NdSun + 0.18 * NdUp);
    }
    let diffSt = albedo * (bounce * 0.5 + sunCol * NdSun * 0.38 + skyFill * NdUp * 0.32);
    let specSt = ${wgslVec3(PALETTE.spec)} * pow(NdH, 56.0) * 0.14;
    var hdrSt = diffSt + specSt;
    hdrSt = mix(hdrSt, fogCol, aerial * 0.1 * (1.0 - p * 0.35));
    hdrSt = acesFilm(hdrSt * 0.99);
    hdrSt = pow(hdrSt, vec3f(1.0 / 2.06));
    let alpha = 1.0 - p;
    if (alpha < 0.002) {
      discard;
    }
    return vec4f(hdrSt * alpha, alpha);
  }

  let base = input.color * input.shade;
  let stone = base;
  let hBoost = smoothstep(0.42, 0.94, input.blockH) * 0.14;

  var albedo = vec3f(0.0);
  var specAmt = 0.0;
  var streetAo = 1.0;
  var emissive = vec3f(0.0);

  // Minecraft-style block types based on height
  // 0=cobblestone, 1=grass, 3=stonebrick, 4=snow, 5=mountain rock, 6=stone pillar
  var blockType = 0;
  let seed = input.blockSeed;

  if (input.blockH < 0.13) {
    // Flat ground - grass
    blockType = 1;
  } else {
    // Raised QR modules — carved stone pillars
    blockType = 6;
  }

  let roofBright = ${wgslVec3(PALETTE.roofBright)};
  let roofMid = ${wgslVec3(PALETTE.roofMid)};
  let roofDark = ${wgslVec3(PALETTE.roofDark)};
  let dirtSide = ${wgslVec3(PALETTE.dirtSide)};
  let dirtDark = ${wgslVec3(PALETTE.dirtDark)};
  let dirtMid = ${wgslVec3(PALETTE.dirtMid)};

  let stoneLight = ${wgslVec3(PALETTE.stoneLight)};
  let stoneMid = ${wgslVec3(PALETTE.stoneMid)};
  let stoneDark = ${wgslVec3(PALETTE.stoneDark)};

  let brickLight = ${wgslVec3(PALETTE.brickLight)};
  let brickMid = ${wgslVec3(PALETTE.brickMid)};
  let brickDark = ${wgslVec3(PALETTE.brickDark)};

  let rockLight = ${wgslVec3(PALETTE.rockLight)};
  let rockMid = ${wgslVec3(PALETTE.rockMid)};
  let rockDark = ${wgslVec3(PALETTE.rockDark)};
  let rockAccent = ${wgslVec3(PALETTE.rockAccent)};

  let snowTop = ${wgslVec3(PALETTE.snowTop)};
  let snowShade = ${wgslVec3(PALETTE.snowShade)};

  // Strong face differentiation for isometric city look
  let isLeftFace = N.x < -0.5;
  let isRightFace = N.z > 0.5;

  // High-res pixelated UV for detailed Minecraft textures (16x16 style)
  let px8 = floor(uv.x * 8.0);
  let py8 = floor(uv.y * 8.0);
  let px16 = floor(uv.x * 16.0);
  let py16 = floor(uv.y * 16.0);
  let noise8 = fract(sin(px8 * 127.1 + py8 * 311.7 + seed.x * 17.3) * 43758.5);
  let noise16 = fract(sin(px16 * 127.1 + py16 * 311.7 + seed.x * 17.3) * 43758.5);
  let noise16b = fract(sin(px16 * 73.3 + py16 * 157.1 + seed.y * 31.7) * 43758.5);

  let warmTint = ${wgslVec3(PALETTE.warmFaceTint)};
  let coolTint = ${wgslVec3(PALETTE.coolFaceTint)};

  if (input.faceVertical > 0.5) {
    var shade = 0.9;
    var tint = warmTint;
    if (isLeftFace) { shade = 0.55; tint = coolTint; }

    if (blockType == 1) {
      // ROOFTOP SIDE - grey stone wall with roof tiles at top
      // Stone wall texture
      let depth = 1.0 - uv.y;
      var wallColor = mix(dirtSide, dirtDark, depth * 0.5);

      // Smooth wall with subtle texture
      let wallNoise = fract(sin(uv.x * 25.0 + uv.y * 30.0) * 43758.5);
      wallColor = wallColor * (0.95 + wallNoise * 0.1);

      // Roof tile overhang at top
      let roofBlend = smoothstep(0.88, 0.95, uv.y);
      wallColor = mix(wallColor, roofDark * 0.9, roofBlend);

      albedo = wallColor * shade * tint;

    } else if (blockType == 3) {
      // STONE BRICK - smooth with variation
      let brickNoise = fract(sin(uv.x * 20.0 + uv.y * 25.0 + seed.x) * 43758.5);
      var brickColor = mix(brickMid, brickLight, brickNoise * 0.35);
      albedo = brickColor * shade * tint;

    } else if (blockType == 4) {
      // SNOW - sparkly texture
      var snowColor = mix(snowShade, snowTop, noise16 * 0.4 + 0.5);
      if (noise16b > 0.9) { snowColor = snowTop * 1.1; } // Sparkles
      albedo = snowColor * shade * tint;

    } else if (blockType == 5) {
      // MOUNTAIN ROCK - clean dark rock
      var mtnColor = rockMid;
      // Subtle horizontal bands
      let band = floor(uv.y * 4.0);
      let bandNoise = fract(sin(band * 127.1 + seed.x) * 43758.5);
      if (bandNoise > 0.6) { mtnColor = rockLight; }
      else if (bandNoise < 0.4) { mtnColor = rockDark; }
      albedo = mtnColor * shade * tint;

    } else if (blockType == 6) {
      // Stone pillar with per-block material variation
      let pillarBaseH = 0.35;
      let isShaft = uv.y < pillarBaseH && input.blockH > 0.16;

      // Per-block material variation (warm/cool, weathered/fresh)
      let materialVar = fract(sin(seed.x * 31.7 + seed.y * 73.1) * 43758.5);
      let warmShift = (materialVar - 0.5) * 0.15; // Varies warm/cool balance
      let weathered = fract(sin(seed.x * 97.3 + seed.y * 127.9) * 43758.5);

      var pillarColor = stoneMid;

      if (isShaft) {
        let streakX = fract(uv.x * 6.0);
        let streakNoise = fract(sin(floor(uv.x * 6.0) * 17.3 + floor(uv.y * 12.0) * 31.7 + seed.x) * 43758.5);
        pillarColor = mix(rockMid, stoneDark, streakNoise * 0.55);
        if (streakNoise > 0.62) { pillarColor = mix(pillarColor, stoneLight, 0.38); }
        else if (streakNoise < 0.28) { pillarColor = mix(pillarColor, rockDark, 0.42); }
        let groove = smoothstep(0.0, 0.15, streakX) * smoothstep(1.0, 0.85, streakX);
        pillarColor = mix(rockDark * 0.88, pillarColor, groove);
      } else {
        let px = floor(uv.x * 8.0);
        let py = floor(uv.y * 8.0);
        let pixelNoise = fract(sin(px * 127.1 + py * 311.7 + seed.x * 17.3) * 43758.5);
        let pixelNoise2 = fract(sin(px * 73.3 + py * 157.1 + seed.y * 31.7) * 43758.5);
        pillarColor = stoneMid;
        if (pixelNoise < 0.22) { pillarColor = stoneLight; }
        else if (pixelNoise < 0.42) { pillarColor = mix(stoneMid, rockLight, 0.4); }
        else if (pixelNoise > 0.8) { pillarColor = stoneDark; }
        if (pixelNoise2 > 0.84) { pillarColor = mix(pillarColor, stoneLight, 0.22); }
        else if (pixelNoise2 < 0.14) { pillarColor = mix(pillarColor, rockDark, 0.5); }
      }

      // Apply warm/cool variation
      pillarColor.r = pillarColor.r + warmShift;
      pillarColor.b = pillarColor.b - warmShift * 0.5;

      // Weathering - desaturate and darken some blocks
      if (weathered > 0.7) {
        let gray = dot(pillarColor, vec3f(0.299, 0.587, 0.114));
        pillarColor = mix(pillarColor, vec3f(gray) * 0.9, (weathered - 0.7) * 1.5);
      }

      albedo = pillarColor * shade * tint;

    } else {
      // COBBLESTONE SIDE - smooth stone with variation
      let sideNoise = fract(sin(uv.x * 20.0 + uv.y * 25.0 + seed.x) * 43758.5);
      let sideNoise2 = fract(sin(uv.x * 15.0 + uv.y * 18.0 + seed.y) * 43758.5);
      var cobbleColor = mix(stoneMid, stoneLight, sideNoise * 0.3);
      cobbleColor = mix(cobbleColor, stoneDark, sideNoise2 * 0.2);
      albedo = cobbleColor * shade * tint;
    }
    albedo = albedo * (1.0 + hBoost);
    streetAo = mix(0.7, 1.0, smoothstep(0.0, 0.12, uv.y));

  } else if (input.faceNy > 0.5) {
    let topWarmTint = ${wgslVec3(PALETTE.topWarmTint)};
    if (blockType == 1) {
      // ROOFTOP - terracotta tile pattern
      // Tile grid pattern
      let tileU = fract(uv.x * 4.0);
      let tileV = fract(uv.y * 6.0);
      let tileEdge = smoothstep(0.0, 0.08, tileU) * smoothstep(1.0, 0.92, tileU);
      let tileVEdge = smoothstep(0.0, 0.06, tileV) * smoothstep(1.0, 0.94, tileV);

      // Curved tile appearance
      let tileCurve = sin(tileV * 3.14159) * 0.15;
      var roofColor = mix(roofDark, roofMid, tileEdge * tileVEdge);
      roofColor = mix(roofColor, roofBright, tileCurve * tileEdge);

      albedo = roofColor * topWarmTint;

    } else if (blockType == 3) {
      // STONE BRICK TOP - smooth with variation
      let brickNoise = fract(sin(uv.x * 18.0 + uv.y * 22.0 + seed.x) * 43758.5);
      var brickColor = mix(brickMid, brickLight, brickNoise * 0.35);
      albedo = brickColor * topWarmTint;

    } else if (blockType == 4) {
      // SNOW TOP - sparkly with warm sunlight
      var snowColor = mix(snowShade, snowTop, 0.65 + noise16 * 0.35);
      if (noise16b > 0.88) { snowColor = ${wgslVec3(PALETTE.white)}; }
      albedo = snowColor * topWarmTint;

    } else if (blockType == 5) {
      // MOUNTAIN TOP - clean dark rock with snow patches
      var mtnTopColor = rockMid;
      // Snow patches on highest peaks
      let snowChance = 0.3 + (input.blockH - 0.5) * 1.5;
      let snowNoise = fract(sin(seed.x * 73.1 + seed.y * 157.3) * 43758.5);
      if (snowNoise > (1.0 - snowChance)) {
        mtnTopColor = snowTop;
      }
      albedo = mtnTopColor * topWarmTint;

    } else if (blockType == 6) {
      // Stone pillar cap with per-block material variation
      let px = floor(uv.x * 8.0);
      let py = floor(uv.y * 8.0);
      let pixelNoise = fract(sin(px * 127.1 + py * 311.7 + seed.x * 17.3) * 43758.5);
      let pixelNoise2 = fract(sin(px * 73.3 + py * 157.1 + seed.y * 31.7) * 43758.5);

      // Match side face material variation
      let materialVar = fract(sin(seed.x * 31.7 + seed.y * 73.1) * 43758.5);
      let warmShift = (materialVar - 0.5) * 0.15;
      let weathered = fract(sin(seed.x * 97.3 + seed.y * 127.9) * 43758.5);

      var capColor = stoneMid;
      if (pixelNoise < 0.24) { capColor = stoneLight; }
      else if (pixelNoise < 0.46) { capColor = mix(stoneMid, rockLight, 0.35); }
      else if (pixelNoise > 0.83) { capColor = stoneDark; }
      if (pixelNoise2 > 0.82) { capColor = mix(capColor, stoneLight, 0.2); }
      else if (pixelNoise2 < 0.13) { capColor = mix(capColor, rockDark, 0.45); }

      // Apply warm/cool variation
      capColor.r = capColor.r + warmShift;
      capColor.b = capColor.b - warmShift * 0.5;

      // Weathering
      if (weathered > 0.7) {
        let gray = dot(capColor, vec3f(0.299, 0.587, 0.114));
        capColor = mix(capColor, vec3f(gray) * 0.9, (weathered - 0.7) * 1.5);
      }

      albedo = capColor * topWarmTint;

    } else {
      // COBBLESTONE TOP - smooth stone with variation
      let topNoise = fract(sin(uv.x * 22.0 + uv.y * 28.0 + seed.x) * 43758.5);
      let topNoise2 = fract(sin(uv.x * 16.0 + uv.y * 20.0 + seed.y) * 43758.5);
      var rockColor = mix(stoneMid, stoneLight, topNoise * 0.35);
      rockColor = mix(rockColor, stoneDark, topNoise2 * 0.2);
      albedo = rockColor * topWarmTint;
    }
  } else {
    let bottomCoolTint = ${wgslVec3(PALETTE.bottomCoolTint)};
    if (blockType == 1) {
      albedo = dirtDark * 0.4 * bottomCoolTint;
    } else if (blockType == 6) {
      albedo = rockDark * 0.44 * bottomCoolTint;
    } else if (blockType == 5) {
      albedo = rockDark * 0.35 * bottomCoolTint;
    } else {
      albedo = stoneDark * 0.4 * bottomCoolTint;
    }
  }

  // Edge rounding for exposed edges (only for tall blocks)
  let neighborBits = u32(input.neighbors);
  let faceDir = u32(input.faceDir);
  var edgeRound = 0.0;
  if (input.building > 0.5) {
    edgeRound = getEdgeRounding(uv, neighborBits, faceDir);
  }

  // Japanese autumn foliage overlay
  if (input.building > 0.5) {
    let isTopFace = input.faceNy > 0.5;
    let isLeftSide = N.x < -0.5;
    let veg = getVegetation(uv, seed, input.blockH, isTopFace, isLeftSide, N, uniforms.time);

    // Apply autumn leaves - strong blend
    if (veg.amount > 0.01) {
      albedo = mix(albedo, veg.color, veg.amount);
      specAmt = specAmt * (1.0 - veg.amount * 0.5);
    }
  }

  // Also add fallen leaves to flat ground areas
  if (input.building < 0.5 && input.faceNy > 0.5) {
    let groundLeafNoise = fract(sin(uv.x * 12.0 + uv.y * 15.0 + seed.x * 7.3 + seed.y * 11.1) * 43758.5);
    if (groundLeafNoise > 0.7) {
      let leafType = fract(sin(seed.x * 31.7 + uv.x * 73.1) * 43758.5);
      var leafCol = ${wgslVec3(PALETTE.mapleOrange)};
      if (leafType < 0.25) { leafCol = ${wgslVec3(PALETTE.mapleRed)}; }
      else if (leafType < 0.5) { leafCol = ${wgslVec3(PALETTE.mapleGold)}; }
      else if (leafType < 0.75) { leafCol = ${wgslVec3(PALETTE.ginkgoYellow)}; }
      albedo = mix(albedo, leafCol, (groundLeafNoise - 0.7) * 2.5);
    }
  }

  // PBR-style lighting - physically-based diffuse and specular
  // Direct sunlight (key light)
  let directSun = sunCol * NdSun * 0.65;
  // Sky fill (hemisphere approximation)
  let skyLight = skyFill * NdUp * 0.35;
  // Ground bounce (warm earth reflection)
  let groundBounce = bounce * max(0.0, -N.y) * 0.15;
  // Ambient (sky irradiance)
  let ambientLight = ambient * 0.8;

  // Apply edge darkening for rounded appearance
  let edgeDarken = 1.0 - edgeRound * 0.35;
  let diffuse = albedo * (ambientLight + directSun + skyLight + groundBounce) * streetAo * edgeDarken;

  // GGX-inspired specular with roughness
  let roughness = 0.45;
  let specPower = 2.0 / (roughness * roughness) - 2.0;
  let specCol = ${wgslVec3(PALETTE.spec)} * pow(NdH, specPower) * specAmt * 0.35;

  // Fresnel rim light - enhanced at rounded edges
  let fresnel = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 4.0);
  let rimLight = fresnel * ${wgslVec3(PALETTE.rim)} * (0.08 + edgeRound * 0.15);

  var hdr = diffuse + specCol + rimLight + emissive;

  // Subtle saturation boost for realism
  let luminance = dot(hdr, vec3f(0.2126, 0.7152, 0.0722));
  hdr = mix(vec3f(luminance), hdr, 1.08);

  // Atmospheric perspective
  hdr = mix(hdr, fogCol, aerial * 0.12 * (1.0 - p * 0.4));

  // ACES tonemapping with adjusted exposure
  hdr = acesFilm(hdr * 1.15);
  // sRGB gamma
  hdr = pow(hdr, vec3f(1.0 / 2.2));
  return vec4f(hdr, 1.0);
}
`;

const skyVertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct SkyOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vi: u32) -> SkyOut {
  var tri = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  let p = tri[vi];
  var o: SkyOut;
  o.position = vec4f(p, 1.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}
`;

const skyFragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct SkyIn {
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(input: SkyIn) -> @location(0) vec4f {
  let uv = input.uv;
  let zenith = ${wgslVec3(PALETTE.skyZenith)};
  let horizon = ${wgslVec3(PALETTE.skyHorizon)};
  let haze = mix(horizon, zenith, pow(uv.y, 0.94));
  let alpha = 1.0 - uniforms.progress;
  return vec4f(haze * alpha, alpha);
}
`;

// ============================================
// MINECRAFT-STYLE FOUNTAIN SHADERS
// ============================================
// Structure: Stone rim + water pool + central pillar + water source + flowing water
// 8 stone rim + 1 water pool surface + 3 pillar + 1 water source + 16 flowing water (4 sides × 4 levels)
// Each cube = 36 vertices (6 faces × 6 verts)
// Multi-tiered fountain filling 7x7 finder pattern
// Stone tiers + central pillar + water source + cascading water covering all tiers
// Tier 0 (outer 5x5): 16 stone, Tier 1 (3x3): 8 stone, Pillar: 4 stone
// Water: 1 source + pool (5x5=25) + cascade layers
const FOUNTAIN_BLOCKS = 76;
const FOUNTAIN_VERTS = FOUNTAIN_BLOCKS * 36;

const fountainVertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct FountainOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) blockType: f32,  // 0=stone, 1=water
  @location(2) faceType: f32,   // 0=top, 1=front, 2=side
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> fountainPositions: array<vec2f>;

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> FountainOut {
  var output: FountainOut;
  let time = uniforms.time;
  let gridSize = uniforms.gridSize;
  let progress = uniforms.progress;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;

  // Fountain center position from instance
  let fountainPos = fountainPositions[instanceIndex];
  let centerCol = fountainPos.x;
  let centerRow = fountainPos.y;
  let baseX = centerCol * blockSize - halfGrid;
  let baseZ = centerRow * blockSize - halfGrid;

  // Which block and which vertex within that block
  let blockIdx = vertexIndex / 36u;
  let localVertIdx = vertexIndex % 36u;
  let faceIdx = localVertIdx / 6u;
  let vertIdx = localVertIdx % 6u;

  // Quad vertices for building cube faces
  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[vertIdx];

  // Fountain filling 7x7 finder pattern with cascading water
  // Stone structure forms stepped pyramid, water cascades down all sides

  var blockX = 0.0;
  var blockY = 0.0;
  var blockZ = 0.0;
  var blockType = 0.0; // 0 = stone, 1 = water source, 2.x = flowing water, 3 = pool
  let cubeSize = blockSize * 1.0;

  // Layout:
  // Blocks 0-15: Outer stone rim (4x4 hollow = 12, plus 4 corners = 16)
  // Blocks 16-23: Second tier stone (8 blocks)
  // Blocks 24-27: Third tier stone (4 blocks)
  // Blocks 28-30: Central pillar (3 blocks)
  // Block 31: Water source
  // Blocks 32-55: Pool water grid (24 blocks, 5x5 minus center)
  // Blocks 56-79: Cascading water (24 blocks covering tiers)

  let baseY = 0.0;

  if (blockIdx < 12u) {
    // Outer stone rim - 4x4 square edge (12 blocks, not 16)
    let idx = blockIdx;
    var ox = 0.0;
    var oz = 0.0;
    if (idx < 4u) { ox = f32(idx) - 1.5; oz = -1.5; }        // Top row: 4 blocks
    else if (idx < 8u) { ox = f32(idx - 4u) - 1.5; oz = 1.5; } // Bottom row: 4 blocks
    else if (idx < 10u) { ox = -1.5; oz = f32(idx - 8u) - 0.5; }  // Left col: 2 blocks
    else { ox = 1.5; oz = f32(idx - 10u) - 0.5; }               // Right col: 2 blocks
    blockX = baseX + ox * cubeSize;
    blockZ = baseZ + oz * cubeSize;
    blockY = baseY;
    blockType = 0.0;
  } else if (blockIdx < 20u) {
    // Second tier - 8 blocks in ring
    let idx = blockIdx - 12u;
    let offsets = array<vec2f, 8>(
      vec2f(-1.0, -1.0), vec2f(0.0, -1.0), vec2f(1.0, -1.0),
      vec2f(-1.0, 0.0),                    vec2f(1.0, 0.0),
      vec2f(-1.0, 1.0),  vec2f(0.0, 1.0),  vec2f(1.0, 1.0)
    );
    let off = offsets[idx];
    blockX = baseX + off.x * cubeSize * 0.7;
    blockZ = baseZ + off.y * cubeSize * 0.7;
    blockY = baseY + cubeSize;
    blockType = 0.0;
  } else if (blockIdx < 24u) {
    // Third tier - 4 cardinal blocks
    let idx = blockIdx - 20u;
    let offsets = array<vec2f, 4>(
      vec2f(0.0, -0.5), vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.0, 0.5)
    );
    let off = offsets[idx];
    blockX = baseX + off.x * cubeSize;
    blockZ = baseZ + off.y * cubeSize;
    blockY = baseY + cubeSize * 2.0;
    blockType = 0.0;
  } else if (blockIdx < 27u) {
    // Central pillar - 3 stacked
    let level = blockIdx - 24u;
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 2.5 + f32(level) * cubeSize;
    blockType = 0.0;
  } else if (blockIdx == 27u) {
    // Water source on top
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 5.5;
    blockType = 1.0;
  } else if (blockIdx < 52u) {
    // Pool water - 24 blocks covering base (5x5 grid minus center)
    let idx = blockIdx - 28u;
    let px = i32(idx % 5u) - 2;
    let pz = i32(idx / 5u) - 2;
    // Skip center block (pillar is there)
    var actualPx = px;
    var actualPz = pz;
    if (idx >= 12u) {
      let adjusted = idx + 1u; // Skip center
      actualPx = i32(adjusted % 5u) - 2;
      actualPz = i32(adjusted / 5u) - 2;
    }
    blockX = baseX + f32(actualPx) * cubeSize * 0.75;
    blockZ = baseZ + f32(actualPz) * cubeSize * 0.75;
    blockY = baseY + cubeSize * 0.6;
    blockType = 3.0;
  } else {
    // Cascading water - flows down from top, 24 blocks covering tiers
    let idx = blockIdx - 52u;
    let tier = idx / 8u;  // 0, 1, 2 = three cascade levels
    let pos = idx % 8u;   // 8 positions around center

    // 8 directions around center
    let angles = array<vec2f, 8>(
      vec2f(1.0, 0.0), vec2f(0.7, 0.7), vec2f(0.0, 1.0), vec2f(-0.7, 0.7),
      vec2f(-1.0, 0.0), vec2f(-0.7, -0.7), vec2f(0.0, -1.0), vec2f(0.7, -0.7)
    );
    let dir = angles[pos];

    // Cascade expands outward as it flows down
    let radius = 0.3 + f32(tier) * 0.4;
    blockX = baseX + dir.x * radius * cubeSize;
    blockZ = baseZ + dir.y * radius * cubeSize;
    blockY = baseY + cubeSize * (4.5 - f32(tier) * 1.5);
    blockType = 2.0 + f32(tier) * 0.1; // Different flow levels
  }

  // Build the cube faces (same as building blocks)
  let hw = cubeSize * 0.5;
  var localPos = vec3f(0.0);
  var faceType = 0.0;

  // Pool water blocks are thin, regular water/stone are full cubes
  let isPoolWater = blockType > 2.9 && blockType < 3.1;
  let isFlowingWater = blockType > 1.9 && blockType < 2.5;
  let poolHeight = cubeSize * 0.15;
  let flowHeight = cubeSize * 0.9;
  var effectiveHeight = cubeSize;
  if (isPoolWater) { effectiveHeight = poolHeight; }
  else if (isFlowingWater) { effectiveHeight = flowHeight; }
  let effectiveSize = cubeSize * 0.75; // All blocks same size

  if (faceIdx == 0u) {
    // Top face
    localPos = vec3f(
      blockX + (qv.x - 0.5) * effectiveSize,
      blockY + effectiveHeight,
      blockZ + (qv.y - 0.5) * effectiveSize
    );
    faceType = 0.0;
  } else if (faceIdx == 1u) {
    // Bottom face
    localPos = vec3f(
      blockX + (qv.x - 0.5) * effectiveSize,
      blockY,
      blockZ + (0.5 - qv.y) * effectiveSize
    );
    faceType = 0.0;
  } else if (faceIdx == 2u) {
    // Front face (+Z)
    let halfSize = effectiveSize * 0.5;
    localPos = vec3f(
      blockX + (qv.x - 0.5) * effectiveSize,
      blockY + qv.y * effectiveHeight,
      blockZ + halfSize
    );
    faceType = 1.0;
  } else if (faceIdx == 3u) {
    // Back face (-Z)
    let halfSize = effectiveSize * 0.5;
    localPos = vec3f(
      blockX + (0.5 - qv.x) * effectiveSize,
      blockY + qv.y * effectiveHeight,
      blockZ - halfSize
    );
    faceType = 1.0;
  } else if (faceIdx == 4u) {
    // Right face (+X)
    let halfSize = effectiveSize * 0.5;
    localPos = vec3f(
      blockX + halfSize,
      blockY + qv.y * effectiveHeight,
      blockZ + (qv.x - 0.5) * effectiveSize
    );
    faceType = 2.0;
  } else {
    // Left face (-X)
    let halfSize = effectiveSize * 0.5;
    localPos = vec3f(
      blockX - halfSize,
      blockY + qv.y * effectiveHeight,
      blockZ + (0.5 - qv.x) * effectiveSize
    );
    faceType = 2.0;
  }

  // Isometric transform
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);
  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = localPos.x * cy - localPos.z * sy;
  let ry_z = localPos.x * sy + localPos.z * cy;
  let rx_y = localPos.y * cx - ry_z * sx;
  let rx_z = localPos.y * sx + ry_z * cx;

  let viewScale = mix(1.0, 1.35, progress);

  output.position = vec4f(
    ry_x * viewScale / uniforms.aspectRatio,
    rx_y * viewScale,
    rx_z * 0.01 + 0.5,
    1.0
  );
  output.uv = qv;
  output.blockType = blockType;
  output.faceType = faceType;

  return output;
}
`;

const fountainFragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct FountainIn {
  @location(0) uv: vec2f,
  @location(1) blockType: f32,
  @location(2) faceType: f32,
}

@fragment
fn main(input: FountainIn) -> @location(0) vec4f {
  let uv = input.uv;
  let time = uniforms.time;
  let blockType = input.blockType;
  let face = i32(input.faceType + 0.5);

  var color = vec3f(0.0);

  let waterBase = ${wgslVec3(PALETTE.waterBase)};
  let waterLight = ${wgslVec3(PALETTE.waterLight)};
  let waterDark = ${wgslVec3(PALETTE.waterDark)};
  var alpha = 1.0;

  if (blockType > 2.5) {
    // POOL WATER - rippling surface with falling water splashes
    let speed = 1.2;
    // Concentric ripples from center (where water falls)
    let centerDist = length(uv - vec2f(0.5, 0.5));
    let ripple = sin(centerDist * 20.0 - time * speed * 3.0) * 0.5 + 0.5;
    let rippleFade = 1.0 - smoothstep(0.0, 0.5, centerDist);

    // Diagonal flowing pattern
    let diag1 = fract((uv.x + uv.y) * 4.0 + time * speed);
    let wave = smoothstep(0.0, 0.3, diag1) * smoothstep(0.6, 0.3, diag1);

    let pattern = mix(wave, ripple * rippleFade, 0.5);
    color = mix(waterBase, waterLight, pattern * 0.6);

    // Foam/splash highlights in center
    if (centerDist < 0.15) {
      let foam = fract(sin(time * 8.0 + uv.x * 50.0) * 43758.5);
      if (foam > 0.7) { color = mix(color, ${wgslVec3(PALETTE.waterFoam)}, 0.4); }
    }
    alpha = 0.75;

  } else if (blockType > 1.5) {
    // FLOWING WATER - cascading waterfall effect
    let flowSpeed = 4.5;
    // Multiple layers of falling water streams
    let stream1 = fract(uv.y * 6.0 - time * flowSpeed);
    let stream2 = fract(uv.y * 6.0 - time * flowSpeed + 0.33);
    let stream3 = fract(uv.y * 6.0 - time * flowSpeed + 0.66);

    // Create water droplet shapes falling down
    let drop1 = smoothstep(0.0, 0.2, stream1) * smoothstep(0.5, 0.2, stream1);
    let drop2 = smoothstep(0.0, 0.2, stream2) * smoothstep(0.5, 0.2, stream2);
    let drop3 = smoothstep(0.0, 0.2, stream3) * smoothstep(0.5, 0.2, stream3);

    // Horizontal variation for stream positions
    let xNoise = fract(sin(floor(uv.x * 4.0) * 127.1) * 43758.5);
    let streamMask = smoothstep(0.3, 0.5, xNoise) * smoothstep(0.9, 0.7, xNoise);

    let flowPattern = (drop1 + drop2 * 0.7 + drop3 * 0.5) * streamMask;

    // Bright highlights for water catching light
    let highlight = smoothstep(0.5, 0.8, flowPattern);
    color = mix(waterDark, waterLight, flowPattern * 0.8);
    color = mix(color, ${wgslVec3(PALETTE.waterHighlight)}, highlight * 0.5);
    alpha = 0.65 + flowPattern * 0.2;

  } else if (blockType > 0.5) {
    // WATER SOURCE - bubbling/splashing top
    let speed = 2.5;
    // Radial bubbling from center
    let centerDist = length(uv - vec2f(0.5, 0.5));
    let bubble1 = sin(centerDist * 15.0 - time * speed) * 0.5 + 0.5;
    let bubble2 = sin((uv.x + uv.y) * 10.0 + time * speed * 1.3) * 0.5 + 0.5;

    // Spray particles
    let spray = fract(sin(time * 12.0 + uv.x * 30.0 + uv.y * 40.0) * 43758.5);
    let sprayMask = smoothstep(0.0, 0.2, centerDist) * (1.0 - smoothstep(0.3, 0.5, centerDist));

    let pattern = bubble1 * 0.4 + bubble2 * 0.4 + spray * sprayMask * 0.3;
    color = mix(waterBase, waterLight, pattern * 0.5);

    // White foam splashes
    if (spray > 0.85 && centerDist < 0.3) {
      color = mix(color, ${wgslVec3(PALETTE.white)}, 0.5);
    }
    alpha = 0.8;

  } else {
    let stoneBase = ${wgslVec3(PALETTE.fountainStone)};
    let stoneDark = ${wgslVec3(PALETTE.fountainStoneDark)};

    // Smooth stone with subtle variation
    let stoneNoise = fract(sin(uv.x * 20.0 + uv.y * 25.0) * 43758.5);
    color = mix(stoneBase, stoneDark, stoneNoise * 0.25);
    alpha = 1.0; // Stone is fully opaque
  }

  var shade = 1.0;
  if (face == 0) {
    shade = 1.0;
  } else if (face == 1) {
    shade = 0.9;
  } else {
    shade = 0.74;
  }

  // Water gets slightly brighter shading to look more translucent
  if (blockType > 0.5) {
    shade = shade * 0.9 + 0.1;
  }

  return vec4f(color * shade * ${wgslVec3(SCENE_NIGHT_MUL)}, alpha);
}
`;

// ============================================
// JAPANESE PAGODA SHADERS
// ============================================
// Structure: Multi-tiered rectangular pagoda with teal roofs
// Based on reference: stone base, 3 floors with white walls/dark frame,
// teal roofs extending outward, yellow lanterns, golden spire
// Layout: Foundation(9) + Floor1(walls16+frame8+roof16) + Floor2(walls9+frame8+roof12)
//         + Spire(5) + corners(12) + eaves ring(12×3 roofs) = 148 blocks
const PAGODA_BLOCKS = 148;
const CASTLE_BLOCKS = PAGODA_BLOCKS;
const CASTLE_VERTS = CASTLE_BLOCKS * 36;

const castleVertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct CastleOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) blockType: f32,  // 0=wall, 1=wood, 2=roof, 3=corner lantern, 3.25=mini eaves, 4=spire
  @location(2) faceType: f32,   // 0=top, 1=front, 2=side
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> castlePos: vec2f;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> CastleOut {
  var output: CastleOut;
  let time = uniforms.time;
  let gridSize = uniforms.gridSize;
  let progress = uniforms.progress;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;
  let cubeSize = blockSize * 1.0;

  let centerCol = castlePos.x;
  let centerRow = castlePos.y;
  let baseX = centerCol * blockSize - halfGrid;
  let baseZ = centerRow * blockSize - halfGrid;

  let blockIdx = vertexIndex / 36u;
  let localVertIdx = vertexIndex % 36u;
  let faceIdx = localVertIdx / 6u;
  let vertIdx = localVertIdx % 6u;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[vertIdx];

  var blockX = 0.0;
  var blockY = 0.0;
  var blockZ = 0.0;
  var blockType = 0.0;
  var blockW = cubeSize;
  var blockH = cubeSize;
  var blockD = cubeSize;

  let baseY = 0.0;
  let scale = 1.3;
  let floorH = cubeSize * 5.0;
  let roofH = cubeSize * 0.8;

  // PROPER RECTANGULAR PAGODA matching reference image:
  // Stone foundation (3x3=9), then 3 floors each with walls + frame + roof + lanterns

  if (blockIdx < 9u) {
    // STONE FOUNDATION - 3x3 rectangular base - more compact
    let idx = blockIdx;
    let fx = f32(i32(idx) % 3) - 1.0;
    let fz = f32(i32(idx) / 3) - 1.0;
    blockX = baseX + fx * cubeSize * scale * 1.0;
    blockZ = baseZ + fz * cubeSize * scale * 1.0;
    blockY = baseY;
    blockW = cubeSize * scale * 1.0;
    blockD = cubeSize * scale * 1.0;
    blockH = cubeSize * 2.0;
    blockType = 1.0; // Stone base (dark)

  } else if (blockIdx < 25u) {
    // FLOOR 1 WALLS - 4x4 rectangular grid (white with frame) - more compact
    let idx = blockIdx - 9u;
    let wx = f32(i32(idx) % 4) - 1.5;
    let wz = f32(i32(idx) / 4) - 1.5;
    blockX = baseX + wx * cubeSize * scale * 0.75;
    blockZ = baseZ + wz * cubeSize * scale * 0.75;
    blockY = baseY + cubeSize * 2.0;
    blockW = cubeSize * scale * 0.75;
    blockD = cubeSize * scale * 0.75;
    blockH = floorH;
    blockType = 0.0; // White walls

  } else if (blockIdx < 33u) {
    // FLOOR 1 WOOD FRAME - 8 edge posts (corners + midpoints)
    let idx = blockIdx - 25u;
    let framePos = array<vec2f, 8>(
      vec2f(-2.0, -2.0), vec2f(0.0, -2.0), vec2f(2.0, -2.0),
      vec2f(-2.0, 0.0),                     vec2f(2.0, 0.0),
      vec2f(-2.0, 2.0),  vec2f(0.0, 2.0),  vec2f(2.0, 2.0)
    );
    let fp = framePos[idx];
    blockX = baseX + fp.x * cubeSize * scale * 0.6;
    blockZ = baseZ + fp.y * cubeSize * scale * 0.6;
    blockY = baseY + cubeSize * 2.0;
    blockW = cubeSize * scale * 0.25;
    blockD = cubeSize * scale * 0.25;
    blockH = floorH;
    blockType = 1.0; // Dark wood frame

  } else if (blockIdx < 49u) {
    // FLOOR 1 ROOF - 4x4 rectangular teal roof extending outward
    let idx = blockIdx - 33u;
    let rx = f32(i32(idx) % 4) - 1.5;
    let rz = f32(i32(idx) / 4) - 1.5;
    blockX = baseX + rx * cubeSize * scale * 1.6;
    blockZ = baseZ + rz * cubeSize * scale * 1.6;
    blockY = baseY + cubeSize * 2.0 + floorH;
    blockW = cubeSize * scale * 1.6;
    blockD = cubeSize * scale * 1.6;
    blockH = roofH;
    blockType = 2.0; // Teal roof

  } else if (blockIdx < 58u) {
    // FLOOR 2 WALLS - 3x3 rectangular grid
    let idx = blockIdx - 49u;
    let wx = f32(i32(idx) % 3) - 1.0;
    let wz = f32(i32(idx) / 3) - 1.0;
    blockX = baseX + wx * cubeSize * scale * 1.0;
    blockZ = baseZ + wz * cubeSize * scale * 1.0;
    blockY = baseY + cubeSize * 2.0 + floorH + roofH;
    blockW = cubeSize * scale * 1.0;
    blockD = cubeSize * scale * 1.0;
    blockH = floorH * 0.85;
    blockType = 0.0; // White walls

  } else if (blockIdx < 66u) {
    // FLOOR 2 WOOD FRAME - 8 posts
    let idx = blockIdx - 58u;
    let framePos = array<vec2f, 8>(
      vec2f(-1.6, -1.6), vec2f(0.0, -1.6), vec2f(1.6, -1.6),
      vec2f(-1.6, 0.0),                     vec2f(1.6, 0.0),
      vec2f(-1.6, 1.6),  vec2f(0.0, 1.6),  vec2f(1.6, 1.6)
    );
    let fp = framePos[idx];
    blockX = baseX + fp.x * cubeSize * scale * 0.55;
    blockZ = baseZ + fp.y * cubeSize * scale * 0.55;
    blockY = baseY + cubeSize * 2.0 + floorH + roofH;
    blockW = cubeSize * scale * 0.22;
    blockD = cubeSize * scale * 0.22;
    blockH = floorH * 0.85;
    blockType = 1.0; // Dark wood

  } else if (blockIdx < 78u) {
    // FLOOR 2 ROOF - 3x4 = 12 blocks
    let idx = blockIdx - 66u;
    let rx = f32(i32(idx) % 4) - 1.5;
    let rz = f32(i32(idx) / 4) - 1.0;
    blockX = baseX + rx * cubeSize * scale * 1.3;
    blockZ = baseZ + rz * cubeSize * scale * 1.3;
    blockY = baseY + cubeSize * 2.0 + floorH * 1.85 + roofH;
    blockW = cubeSize * scale * 1.3;
    blockD = cubeSize * scale * 1.3;
    blockH = roofH;
    blockType = 2.0; // Teal roof

  } else if (blockIdx < 82u) {
    // FLOOR 3 WALLS - 2x2
    let idx = blockIdx - 78u;
    let wx = f32(i32(idx) % 2) - 0.5;
    let wz = f32(i32(idx) / 2) - 0.5;
    blockX = baseX + wx * cubeSize * scale * 0.9;
    blockZ = baseZ + wz * cubeSize * scale * 0.9;
    blockY = baseY + cubeSize * 2.0 + floorH * 1.85 + roofH * 2.0;
    blockW = cubeSize * scale * 0.9;
    blockD = cubeSize * scale * 0.9;
    blockH = floorH * 0.75;
    blockType = 0.0; // White walls

  } else if (blockIdx < 86u) {
    // FLOOR 3 WOOD FRAME - 4 corner posts
    let idx = blockIdx - 82u;
    let corners = array<vec2f, 4>(
      vec2f(-1.1, -1.1), vec2f(1.1, -1.1),
      vec2f(-1.1, 1.1),  vec2f(1.1, 1.1)
    );
    let c = corners[idx];
    blockX = baseX + c.x * cubeSize * scale * 0.5;
    blockZ = baseZ + c.y * cubeSize * scale * 0.5;
    blockY = baseY + cubeSize * 2.0 + floorH * 1.85 + roofH * 2.0;
    blockW = cubeSize * scale * 0.2;
    blockD = cubeSize * scale * 0.2;
    blockH = floorH * 0.75;
    blockType = 1.0; // Dark wood

  } else if (blockIdx < 95u) {
    // FLOOR 3 ROOF - 3x3 = 9 blocks
    let idx = blockIdx - 86u;
    let rx = f32(i32(idx) % 3) - 1.0;
    let rz = f32(i32(idx) / 3) - 1.0;
    blockX = baseX + rx * cubeSize * scale * 1.1;
    blockZ = baseZ + rz * cubeSize * scale * 1.1;
    blockY = baseY + cubeSize * 2.0 + floorH * 2.6 + roofH * 2.0;
    blockW = cubeSize * scale * 1.1;
    blockD = cubeSize * scale * 1.1;
    blockH = roofH;
    blockType = 2.0; // Teal roof

  } else if (blockIdx < 100u) {
    // GOLDEN SPIRE - 5 stacked blocks getting smaller
    let idx = blockIdx - 95u;
    let spireScale = 0.5 - f32(idx) * 0.08;
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 2.0 + floorH * 2.6 + roofH * 3.0 + f32(idx) * cubeSize * 1.0;
    blockW = cubeSize * scale * spireScale;
    blockD = cubeSize * scale * spireScale;
    blockH = cubeSize * 1.0;
    blockType = 4.0; // Gold

  } else if (blockIdx < 112u) {
    // Corner lanterns — hang clearly below eaves
    let idx = blockIdx - 100u;
    let floorNum = idx / 4u;
    let cornerIdx = idx % 4u;
    let lanternCorners = array<vec2f, 4>(
      vec2f(-1.0, -1.0), vec2f(1.0, -1.0),
      vec2f(-1.0, 1.0),  vec2f(1.0, 1.0)
    );
    let lc = lanternCorners[cornerIdx];

    var roofSize = 1.6;
    var yPos = baseY + cubeSize * 2.0 + floorH;
    if (floorNum == 1u) {
      roofSize = 1.3;
      yPos = baseY + cubeSize * 2.0 + floorH * 1.85 + roofH;
    } else if (floorNum >= 2u) {
      roofSize = 1.1;
      yPos = baseY + cubeSize * 2.0 + floorH * 2.6 + roofH * 2.0;
    }

    let outMul = (0.96 + 0.035 * f32(floorNum)) * cubeSize * scale * roofSize;
    blockX = baseX + lc.x * outMul;
    blockZ = baseZ + lc.y * outMul;
    blockY = yPos - cubeSize * 1.52;
    blockW = cubeSize * scale * 0.46;
    blockD = cubeSize * scale * 0.46;
    blockH = cubeSize * 1.28;
    blockType = 3.0;

  } else {
    // Eaves lanterns — 12 per roof tier (all 3 red roofs share same yPos as that roof slab)
    let idx = blockIdx - 112u;
    let floorNum = idx / 12u;
    let posIdx = idx % 12u;
    let ring = array<vec2f, 12>(
      vec2f(-0.66, -1.0), vec2f(0.0, -1.0), vec2f(0.66, -1.0),
      vec2f(1.0, -0.66), vec2f(1.0, 0.0), vec2f(1.0, 0.66),
      vec2f(0.66, 1.0), vec2f(0.0, 1.0), vec2f(-0.66, 1.0),
      vec2f(-1.0, 0.66), vec2f(-1.0, 0.0), vec2f(-1.0, -0.66)
    );
    let em = ring[posIdx];

    var roofSizeM = 1.6;
    var yPosM = baseY + cubeSize * 2.0 + floorH;
    if (floorNum == 1u) {
      roofSizeM = 1.3;
      yPosM = baseY + cubeSize * 2.0 + floorH * 1.85 + roofH;
    } else if (floorNum >= 2u) {
      roofSizeM = 1.1;
      yPosM = baseY + cubeSize * 2.0 + floorH * 2.6 + roofH * 2.0;
    }

    let swayX =
      sin(time * 1.6 + f32(posIdx) * 0.7 + f32(floorNum) * 2.1) * 0.038 * cubeSize;
    let swayZ =
      cos(time * 1.4 + f32(posIdx) * 0.55 + f32(floorNum)) * 0.034 * cubeSize;

    let outRing = (0.97 + 0.04 * f32(floorNum)) * cubeSize * scale * roofSizeM;
    blockX = baseX + em.x * outRing + swayX;
    blockZ = baseZ + em.y * outRing + swayZ;
    blockY = yPosM - cubeSize * 1.22;
    blockW = cubeSize * scale * 0.4;
    blockD = cubeSize * scale * 0.4;
    blockH = cubeSize * 1.06;
    blockType = 3.25;
  }

  // Build cube faces
  let hw = blockW * 0.5;
  let hd = blockD * 0.5;
  var localPos = vec3f(0.0);
  var faceType = 0.0;

  if (faceIdx == 0u) {
    // Top
    localPos = vec3f(blockX + (qv.x - 0.5) * blockW, blockY + blockH, blockZ + (qv.y - 0.5) * blockD);
    faceType = 0.0;
  } else if (faceIdx == 1u) {
    // Bottom
    localPos = vec3f(blockX + (qv.x - 0.5) * blockW, blockY, blockZ + (0.5 - qv.y) * blockD);
    faceType = 0.0;
  } else if (faceIdx == 2u) {
    // Front (+Z)
    localPos = vec3f(blockX + (qv.x - 0.5) * blockW, blockY + qv.y * blockH, blockZ + hd);
    faceType = 1.0;
  } else if (faceIdx == 3u) {
    // Back (-Z)
    localPos = vec3f(blockX + (0.5 - qv.x) * blockW, blockY + qv.y * blockH, blockZ - hd);
    faceType = 1.0;
  } else if (faceIdx == 4u) {
    // Right (+X)
    localPos = vec3f(blockX + hw, blockY + qv.y * blockH, blockZ + (qv.x - 0.5) * blockD);
    faceType = 2.0;
  } else {
    // Left (-X)
    localPos = vec3f(blockX - hw, blockY + qv.y * blockH, blockZ + (0.5 - qv.x) * blockD);
    faceType = 2.0;
  }

  // Isometric transform
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);
  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = localPos.x * cy - localPos.z * sy;
  let ry_z = localPos.x * sy + localPos.z * cy;
  let rx_y = localPos.y * cx - ry_z * sx;
  let rx_z = localPos.y * sx + ry_z * cx;

  let viewScale = mix(1.0, 1.35, progress);

  output.position = vec4f(
    ry_x * viewScale / uniforms.aspectRatio,
    rx_y * viewScale,
    rx_z * 0.01 + 0.5,
    1.0
  );
  output.uv = qv;
  output.blockType = blockType;
  output.faceType = faceType;

  return output;
}
`;

const castleFragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct CastleIn {
  @location(0) uv: vec2f,
  @location(1) blockType: f32,
  @location(2) faceType: f32,
}

@fragment
fn main(input: CastleIn) -> @location(0) vec4f {
  let uv = input.uv;
  let blockType = input.blockType;
  let face = i32(input.faceType + 0.5);

  var color = vec3f(0.0);

  if (blockType > 3.5) {
    let goldBright = ${wgslVec3(PALETTE.metalBright)};
    let goldMid = ${wgslVec3(PALETTE.metalMid)};

    // Vertical bands for decorative spire
    let bandY = fract(uv.y * 6.0);
    let bandShine = smoothstep(0.3, 0.5, bandY) * smoothstep(0.7, 0.5, bandY);

    color = mix(goldMid, goldBright, bandShine * 0.6);

    // Add sparkle
    let sparkle = fract(sin(uv.x * 50.0 + uv.y * 30.0 + uniforms.time) * 43758.5);
    if (sparkle > 0.92) { color = goldBright * 1.06; }

  } else if (blockType > 3.12) {
    let flick = 0.86 + 0.14 * sin(uniforms.time * 3.2 + uv.x * 8.0) * sin(uniforms.time * 4.1 + uv.y * 6.0);
    let paper = ${wgslVec3(PALETTE.lanternPaper)};
    let cap = ${wgslVec3(PALETTE.lanternCap)};
    let band = ${wgslVec3(PALETTE.lanternBand)};
    let topC = uv.y > 0.88 || uv.y < 0.12;
    let redB = uv.y > 0.42 && uv.y < 0.58;

    if (topC) {
      color = cap;
      let gl = pow(sin(uv.x * 3.14159 * 3.0) * 0.5 + 0.5, 3.0);
      color = color + ${wgslVec3(PALETTE.lanternAccent)} * gl;
    } else if (redB) {
      color = band;
    } else {
      color = paper * (0.92 + 0.08 * sin(uv.y * 12.56));
      color = color + ${wgslVec3(PALETTE.lanternHot)} * flick * 0.38;
    }

  } else if (blockType > 2.5 && blockType < 3.12) {
    let lanternYellow = ${wgslVec3(PALETTE.lanternYellow)};
    let lanternGold = ${wgslVec3(PALETTE.lanternGold)};
    let lanternRed = ${wgslVec3(PALETTE.lanternRed)};
    let fk = 0.9 + 0.1 * sin(uniforms.time * 2.8 + uv.x * 5.0);

    let topCap = uv.y > 0.85;
    let bottomCap = uv.y < 0.15;
    let redBand = uv.y > 0.4 && uv.y < 0.6;

    if (topCap || bottomCap) {
      color = lanternGold + ${wgslVec3(PALETTE.lanternAccent)} * fk * 0.55;
    } else if (redBand) {
      color = lanternRed;
    } else {
      let glow = sin(uv.y * 6.28) * 0.1 + 0.92;
      color = lanternYellow * glow + ${wgslVec3(PALETTE.lanternHot)} * fk * 0.3;
    }

  } else if (blockType > 1.5) {
    let roofRedDark = ${wgslVec3(PALETTE.pagodaRoofDark)};
    let roofRedMid = ${wgslVec3(PALETTE.pagodaRoofMid)};
    let roofRedLight = ${wgslVec3(PALETTE.pagodaRoofLight)};

    // Curved tile pattern
    let tileX = fract(uv.x * 5.0);
    let tileY = fract(uv.y * 3.0);
    let rowIdx = floor(uv.y * 3.0);
    var tileOffset = 0.0;
    if (fract(rowIdx * 0.5) > 0.25) { tileOffset = 0.5; }
    let shiftedX = fract(uv.x * 5.0 + tileOffset);

    // Curved tile shape
    let tileCurve = sin(shiftedX * 3.14159) * 0.3;
    let tileEdge = smoothstep(0.0, 0.12, shiftedX) * smoothstep(1.0, 0.88, shiftedX);
    let tileVEdge = smoothstep(0.0, 0.15, tileY) * smoothstep(1.0, 0.85, tileY);

    // Mix colors based on tile shape
    color = mix(roofRedDark, roofRedMid, tileEdge * tileVEdge);
    color = mix(color, roofRedLight, tileCurve * tileEdge);

    // Add subtle variation per tile
    let tileIdx = floor(uv.x * 5.0 + tileOffset) + rowIdx * 5.0;
    let variation = fract(sin(tileIdx * 127.1) * 43758.5);
    if (variation > 0.75) { color *= 1.1; }
    else if (variation < 0.25) { color *= 0.9; }

  } else if (blockType > 0.5) {
    let woodDark = ${wgslVec3(PALETTE.woodDark)};
    let woodMid = ${wgslVec3(PALETTE.woodMid)};
    let woodLight = ${wgslVec3(PALETTE.woodLight)};

    // Vertical wood grain
    let grainX = sin(uv.x * 30.0) * 0.5 + 0.5;
    let grainY = fract(uv.y * 8.0);

    // Wood texture
    let grainNoise = fract(sin(uv.x * 40.0 + floor(uv.y * 8.0) * 7.1) * 43758.5);
    color = woodMid;
    if (grainNoise > 0.7) { color = woodLight; }
    else if (grainNoise < 0.3) { color = woodDark; }

    // Subtle grain lines
    color = mix(color, woodDark, (1.0 - grainX) * 0.15);

  } else {
    let wallWhite = ${wgslVec3(PALETTE.wallWhite)};
    let wallCream = ${wgslVec3(PALETTE.wallCream)};
    let frameWood = ${wgslVec3(PALETTE.frameWood)};

    // Grid pattern for shoji screen effect
    let gridX = fract(uv.x * 3.0);
    let gridY = fract(uv.y * 4.0);

    // Wood frame lines
    let isFrameX = gridX < 0.08 || gridX > 0.92;
    let isFrameY = gridY < 0.06 || gridY > 0.94;

    if (isFrameX || isFrameY) {
      color = frameWood;
    } else {
      // Paper panels with subtle texture
      let paperNoise = fract(sin(uv.x * 100.0 + uv.y * 80.0) * 43758.5) * 0.03;
      color = mix(wallWhite, wallCream, 0.3) + paperNoise;
    }
  }

  let warmTint = ${wgslVec3(PALETTE.facadeWarm)};
  let coolTint = ${wgslVec3(PALETTE.facadeCool)};
  let neutralTint = ${wgslVec3(PALETTE.facadeNeutral)};

  var shade = 1.0;
  var tint = warmTint;
  if (face == 0) {
    shade = 1.02;
    tint = warmTint;
  } else if (face == 1) {
    shade = 0.92;
    tint = neutralTint;
  } else {
    shade = 0.72;
    tint = coolTint;
  }

  var finalColor = color * shade * tint;

  let gray = dot(finalColor, vec3f(0.299, 0.587, 0.114));
  finalColor = mix(vec3f(gray), finalColor, 1.03);

  return vec4f(finalColor * ${wgslVec3(SCENE_NIGHT_MUL)}, 1.0);
}
`;

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const IsometricQRCode = () => {
  const { width: _width, height: _height } = useWindowDimensions();
  const [qrContent, setQrContent] = useState(DEFAULT_QR_CONTENT);
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isFlat = useRef(false);
  const progressRef = useRef(0);
  const rawProgressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  // Refs for GPU resources that need updating when QR content changes
  const deviceRef = useRef<GPUDevice | null>(null);
  const colorBufferRef = useRef<GPUBuffer | null>(null);
  const posBufferRef = useRef<GPUBuffer | null>(null);
  const heightBufferRef = useRef<GPUBuffer | null>(null);
  const neighborBufferRef = useRef<GPUBuffer | null>(null);
  const fountainBufferRef = useRef<GPUBuffer | null>(null);
  const castleBufferRef = useRef<GPUBuffer | null>(null);
  const qrMatrixBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{
    numBlocks: number;
    gridSize: number;
    fountainCenters: { col: number; row: number }[];
    castleCenter: { col: number; row: number };
  }>({
    numBlocks: 0,
    gridSize: 0,
    fountainCenters: [{ col: 3, row: 3 }],
    castleCenter: { col: 3, row: 3 },
  });
  const qrContentRef = useRef(qrContent);
  qrContentRef.current = qrContent;

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
  }, []);

  // Update GPU buffers when QR content changes
  useEffect(() => {
    const device = deviceRef.current;
    const colorBuffer = colorBufferRef.current;
    const posBuffer = posBufferRef.current;
    const heightBuffer = heightBufferRef.current;
    const neighborBuffer = neighborBufferRef.current;
    const fountainBuffer = fountainBufferRef.current;
    const castleBuffer = castleBufferRef.current;
    const qrMatrixBuffer = qrMatrixBufferRef.current;

    if (
      !device ||
      !colorBuffer ||
      !posBuffer ||
      !heightBuffer ||
      !neighborBuffer ||
      !fountainBuffer ||
      !castleBuffer ||
      !qrMatrixBuffer
    )
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const { positions, heights, colors, neighbors, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    const fountainCenters = getFountainCenters(gridSize);
    const castleCenter = getCastleCenter(gridSize);

    // Update refs for render loop
    blockDataRef.current = {
      numBlocks,
      gridSize,
      fountainCenters,
      castleCenter,
    };

    // Write new data to GPU buffers (pad to MAX_BLOCKS size)
    const paddedColors = new Uint32Array(MAX_BLOCKS);
    paddedColors.set(colors);
    device.queue.writeBuffer(colorBuffer, 0, paddedColors);

    const paddedPositions = new Float32Array(MAX_BLOCKS * 4);
    paddedPositions.set(positions);
    device.queue.writeBuffer(posBuffer, 0, paddedPositions);

    const paddedHeights = new Float32Array(MAX_BLOCKS);
    paddedHeights.set(heights);
    device.queue.writeBuffer(heightBuffer, 0, paddedHeights);

    const paddedNeighbors = new Uint32Array(MAX_BLOCKS);
    paddedNeighbors.set(neighbors);
    device.queue.writeBuffer(neighborBuffer, 0, paddedNeighbors);

    // Update fountain positions (2 fountains × 2 floats)
    const fountainData = new Float32Array(4);
    fountainCenters.forEach((fc, i) => {
      fountainData[i * 2] = fc.col;
      fountainData[i * 2 + 1] = fc.row;
    });
    device.queue.writeBuffer(fountainBuffer, 0, fountainData);

    // Update castle position
    const castleData = new Float32Array([castleCenter.col, castleCenter.row]);
    device.queue.writeBuffer(castleBuffer, 0, castleData);

    // Update QR matrix for wall detection
    const packedMatrix = packQRMatrix(qrMatrix);
    device.queue.writeBuffer(
      qrMatrixBuffer,
      0,
      packedMatrix.buffer as ArrayBuffer,
    );
  }, [qrContent]);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current) return;

    const context = canvasRef.current.getContext('webgpu');
    if (!context) return;

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return;

    const device = await adapter.requestDevice();
    deviceRef.current = device;
    const format = navigator.gpu.getPreferredCanvasFormat();

    const canvas = context.canvas as HTMLCanvasElement;
    canvas.width = canvas.clientWidth * PixelRatio.get();
    canvas.height = canvas.clientHeight * PixelRatio.get();

    context.configure({ device, format, alphaMode: 'premultiplied' });

    // Generate initial QR data
    const qrMatrix = generateQRMatrix(qrContentRef.current);
    const { positions, heights, colors, neighbors, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    const fountainCenters = getFountainCenters(gridSize);
    const castleCenter = getCastleCenter(gridSize);
    blockDataRef.current = {
      numBlocks,
      gridSize,
      fountainCenters,
      castleCenter,
    };

    const uniformBuffer = device.createBuffer({
      size: 32, // 8 floats: aspectRatio, time, blockCount, progress, gridSize, pad1, pad2, pad3
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Pre-allocate buffers for maximum QR size
    const colorBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    colorBufferRef.current = colorBuffer;
    const paddedColors = new Uint32Array(MAX_BLOCKS);
    paddedColors.set(colors);
    device.queue.writeBuffer(colorBuffer, 0, paddedColors);

    const posBuffer = device.createBuffer({
      size: MAX_BLOCKS * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    posBufferRef.current = posBuffer;
    const paddedPositions = new Float32Array(MAX_BLOCKS * 4);
    paddedPositions.set(positions);
    device.queue.writeBuffer(posBuffer, 0, paddedPositions);

    const heightBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    heightBufferRef.current = heightBuffer;
    const paddedHeights = new Float32Array(MAX_BLOCKS);
    paddedHeights.set(heights);
    device.queue.writeBuffer(heightBuffer, 0, paddedHeights);

    // Neighbor buffer for edge rounding
    const neighborBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    neighborBufferRef.current = neighborBuffer;
    const paddedNeighbors = new Uint32Array(MAX_BLOCKS);
    paddedNeighbors.set(neighbors);
    device.queue.writeBuffer(neighborBuffer, 0, paddedNeighbors);

    // Fountain positions buffer (2 fountains × 2 floats)
    const fountainBuffer = device.createBuffer({
      size: 4 * 4, // 4 floats for 2 vec2f positions
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    fountainBufferRef.current = fountainBuffer;
    const fountainData = new Float32Array(4);
    fountainCenters.forEach((fc, i) => {
      fountainData[i * 2] = fc.col;
      fountainData[i * 2 + 1] = fc.row;
    });
    device.queue.writeBuffer(fountainBuffer, 0, fountainData);

    // Castle position buffer
    const castleBuffer = device.createBuffer({
      size: 2 * 4, // vec2f
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    castleBufferRef.current = castleBuffer;
    const castleData = new Float32Array([castleCenter.col, castleCenter.row]);
    device.queue.writeBuffer(castleBuffer, 0, castleData);

    // QR matrix buffer for wall detection (packed bits + gridSize)
    const packedMatrix = packQRMatrix(qrMatrix);
    const qrMatrixBuffer = device.createBuffer({
      size: Math.max(packedMatrix.byteLength, 64), // Min 64 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    qrMatrixBufferRef.current = qrMatrixBuffer;
    device.queue.writeBuffer(
      qrMatrixBuffer,
      0,
      packedMatrix.buffer as ArrayBuffer,
    );

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: colorBuffer } },
        { binding: 2, resource: { buffer: posBuffer } },
        { binding: 3, resource: { buffer: heightBuffer } },
        { binding: 4, resource: { buffer: neighborBuffer } },
      ],
    });

    const skyBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const skyBindGroup = device.createBindGroup({
      layout: skyBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // Fountain bind group layout (uniforms + position)
    const fountainBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    const fountainBindGroup = device.createBindGroup({
      layout: fountainBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: fountainBuffer } },
      ],
    });

    // Castle bind group layout (same structure as fountain)
    const castleBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    const castleBindGroup = device.createBindGroup({
      layout: castleBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: castleBuffer } },
      ],
    });

    const skyPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [skyBindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: skyVertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: skyFragmentShader }),
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'always',
        format: 'depth24plus',
      },
    });

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: vertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: fragmentShader }),
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // Fountain pipeline - animated water feature
    const fountainPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [fountainBindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: fountainVertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: fountainFragmentShader }),
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // Castle pipeline - medieval structure
    const castlePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [castleBindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: castleVertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: castleFragmentShader }),
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Use actual canvas dimensions for aspect ratio, not window dimensions
    const aspectRatio = canvas.width / canvas.height;

    const render = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      const target = isFlat.current ? 1 : 0;
      rawProgressRef.current +=
        (target - rawProgressRef.current) * Math.min(1, LERP_SPEED * dt);
      if (Math.abs(rawProgressRef.current - target) < 0.001) {
        rawProgressRef.current = target;
      }
      progressRef.current = easeInOutCubic(rawProgressRef.current);

      const time = (now - startTimeRef.current) / 1000;
      const { numBlocks, gridSize } = blockDataRef.current;

      const uniformData = new Float32Array([
        aspectRatio,
        time,
        numBlocks,
        progressRef.current,
        gridSize,
        0, // padding
        0, // padding
        0, // padding
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: {
              r: PALETTE.skyHorizon.r,
              g: PALETTE.skyHorizon.g,
              b: PALETTE.skyHorizon.b,
              a: 1.0,
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });

      renderPass.setPipeline(skyPipeline);
      renderPass.setBindGroup(0, skyBindGroup);
      renderPass.draw(3);

      renderPass.setPipeline(pipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(36, numBlocks);

      // Fountains - water features (2 instances)
      renderPass.setPipeline(fountainPipeline);
      renderPass.setBindGroup(0, fountainBindGroup);
      renderPass.draw(FOUNTAIN_VERTS, 2);

      // Castle - medieval structure on top-right finder
      renderPass.setPipeline(castlePipeline);
      renderPass.setBindGroup(0, castleBindGroup);
      renderPass.draw(CASTLE_VERTS, 1);

      renderPass.end();

      device.queue.submit([commandEncoder.finish()]);
      context.present();

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  }, []);

  useEffect(() => {
    const id = setTimeout(initWebGPU, 100);
    return () => {
      clearTimeout(id);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGPU]);

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={qrContent}
          onChangeText={setQrContent}
          placeholder="Enter QR content..."
          placeholderTextColor={rgbToHex(lerpRgb(ink, canvas, 0.62))}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Pressable
        accessibilityLabel="City view. Double tap for top-down QR code."
        onPress={handlePress}
        style={styles.pressable}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { backgroundColor: 'transparent', flex: 1 },
  container: { backgroundColor: CONTAINER_BG, flex: 1 },
  input: {
    backgroundColor: UI_FIELD_HEX,
    borderColor: UI_BORDER_RGBA,
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    color: UI_INK_HEX,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputContainer: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 56,
  },
  pressable: { flex: 1 },
});
