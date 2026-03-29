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

/** Core colors - everything else derives from these */
const COLORS = {
  building: '#1a1a1a',
  background: '#f5f5f5',
};

const building = hexToRgb(COLORS.building);
const background = hexToRgb(COLORS.background);

const PALETTE = {
  building: building,
  buildingAlt: lerpRgb(building, background, 0.08),
  skyZenith: lerpRgb(background, { r: 0.9, g: 0.92, b: 0.98 }, 0.3),
  skyHorizon: background,
  pavement: lerpRgb(building, background, 0.65),
  pavementSide: lerpRgb(building, background, 0.5),
  fog: lerpRgb(background, building, 0.02),
  sun: background,
  skyFill: lerpRgb(background, { r: 0.9, g: 0.92, b: 0.98 }, 0.2),
  bounce: lerpRgb(background, building, 0.05),
  window: { r: 1.0, g: 0.92, b: 0.7 },
  crown: lerpRgb(building, background, 0.1),
  rim: lerpRgb(building, background, 0.25),
  spec: lerpRgb(background, building, 0.1),
};

const CONTAINER_BG = COLORS.background;

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

/** Which finder pattern becomes the fountain (NOT 'tr' - that's the tallest) */
const FOUNTAIN_FINDER: 'tl' | 'bl' = Math.random() > 0.5 ? 'tl' : 'bl';

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

/** Get the center position of the fountain in grid coordinates */
function getFountainCenter(gridSize: number): { col: number; row: number } {
  const f = FINDER_PATTERN_SIZE;
  const center = Math.floor(f / 2);
  if (FOUNTAIN_FINDER === 'tl') {
    return { col: center, row: center };
  } else {
    // 'bl'
    return { col: center, row: gridSize - f + center };
  }
}

/**
 * Matrix corner labels: col→, row↓. Row 0 sits toward the bottom of the view;
 * **top-right on screen** matches `'br'` (max col & row).
 */
const SKYLINE_PEAK_CORNER: 'tl' | 'tr' | 'bl' | 'br' = 'br';

/** Landmark: only ~1 corner gets full height; falloff in normalized distance [0,1]. */
const SKYLINE_LANDMARK_SIGMA = 0.29;
const SKYLINE_LANDMARK_POWER = 2.4;

/** Rest of grid: low-rise fabric (never near 1.0 except inside landmark blend). */
const SKYLINE_FABRIC_MIN = 0.1;
const SKYLINE_FABRIC_MAX = 0.28;

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
 * Smooth, deterministic "districts" — mid/low variation without random heights.
 */
function skylineFabricHeight(
  col: number,
  row: number,
  gridSize: number,
): number {
  const g = Math.max(1, gridSize - 1);
  const nx = col / g;
  const nz = row / g;
  const w1 = Math.sin(nx * 3.4 * Math.PI + nz * 2.1 * Math.PI);
  const w2 = Math.cos(nx * 2.2 * Math.PI - nz * 3.6 * Math.PI);
  const w3 = Math.sin((nx + nz) * 2.8 * Math.PI);
  const mix = 0.33 * w1 + 0.34 * w2 + 0.33 * w3;
  const t = 0.5 + 0.5 * mix;
  const shaped = Math.pow(Math.max(0, Math.min(1, t)), 0.9);
  return (
    SKYLINE_FABRIC_MIN + shaped * (SKYLINE_FABRIC_MAX - SKYLINE_FABRIC_MIN)
  );
}

/**
 * Landmark (Gaussian-ish bump) at one corner + city fabric elsewhere.
 * Only the chosen corner reaches ~1.0; the rest stays in a low band with gentle hills.
 */
function skylineHeight(col: number, row: number, gridSize: number): number {
  const g = Math.max(1, gridSize - 1);
  const ax = col / g;
  const ay = row / g;
  const { px, py } = skylinePeakCorner();
  const d = Math.hypot(ax - px, ay - py);
  const dNorm = d / Math.SQRT2;
  const landmarkWeight = Math.exp(
    -Math.pow(dNorm / SKYLINE_LANDMARK_SIGMA, SKYLINE_LANDMARK_POWER),
  );
  const fabric = skylineFabricHeight(col, row, gridSize);
  const h = landmarkWeight * 1.0 + (1.0 - landmarkWeight) * fabric;
  return Math.min(1, h);
}

const BUILDING_BASE: RGB = PALETTE.building;

/** Unused visually — aligned to horizon OKLCH for data consistency */
const GROUND_COLOR: RGB = PALETTE.skyHorizon;

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
  gridSize: number;
  numBlocks: number;
} {
  const gridSize = qrMatrix.length;
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isModule = qrMatrix[row][col];

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (isModule) {
        const district = Math.floor(col / 6) + Math.floor(row / 6);
        color = district % 2 === 0 ? BUILDING_BASE : PALETTE.buildingAlt;
        const fh = finderModuleHeight(col, row, gridSize);
        height = fh !== null ? fh : skylineHeight(col, row, gridSize);
      } else {
        color = GROUND_COLOR;
        /** Normalized — vertex shader applies a small extrude scale for lots */
        height = 0.006;
      }

      heights.push(height);
      colors.push(packRGB(color));
    }
  }

  return {
    positions,
    heights,
    colors,
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

// Generate pedestrian spawn positions on empty cells
const MAX_PEDESTRIANS = 1;

function generatePedestrianPositions(qrMatrix: boolean[][]): {
  positions: Float32Array;
  count: number;
} {
  const gridSize = qrMatrix.length;

  // Helper to check if cell is empty (not a wall)
  const isEmpty = (c: number, r: number): boolean => {
    if (c < 0 || c >= gridSize || r < 0 || r >= gridSize) return false;
    return !qrMatrix[r][c];
  };

  // Count adjacent empty cells (4 directions)
  const countAdjacentEmpty = (col: number, row: number): number => {
    let count = 0;
    if (isEmpty(col + 1, row)) count++;
    if (isEmpty(col - 1, row)) count++;
    if (isEmpty(col, row + 1)) count++;
    if (isEmpty(col, row - 1)) count++;
    return count;
  };

  // Find the best spot: the cell with the most adjacent empty neighbors
  let bestCol = -1;
  let bestRow = -1;
  let maxAdjacent = 0;

  for (let row = 1; row < gridSize - 1; row++) {
    for (let col = 1; col < gridSize - 1; col++) {
      if (isEmpty(col, row)) {
        const adjacent = countAdjacentEmpty(col, row);
        if (adjacent > maxAdjacent) {
          maxAdjacent = adjacent;
          bestCol = col;
          bestRow = row;
        }
      }
    }
  }

  const result = new Float32Array(MAX_PEDESTRIANS * 2);
  if (bestCol >= 0 && bestRow >= 0) {
    result[0] = bestCol;
    result[1] = bestRow;
    return { positions: result, count: 1 };
  }

  return { positions: result, count: 0 };
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
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;

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

  let blockSize = 0.0245;
  let maxHeight = 14.0;
  let isBuilding = blockHeight > 0.085;

  let buildingExtrude = max(blockHeight * maxHeight, 0.2);
  let flatBuilding = 0.2;
  /** Keep lot extrusion ~same absolute thickness as before (was 4.05×0.14) */
  let lotBase = blockHeight * maxHeight * 0.041;

  var height: f32;
  if (isBuilding) {
    height = mix(buildingExtrude, flatBuilding, progress);
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

  let cs = mix(0.88, 1.0, progress);
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

  output.color = unpackColor(blockColorPacked);
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

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let p = uniforms.progress;
  let uv = input.facadeUv;
  let N = normalize(input.worldN);
  let V = normalize(vec3f(0.12, 0.38, 0.88));
  let sunDir = normalize(vec3f(0.5, 0.42, 0.38));
  let halfUp = normalize(vec3f(0.2, 1.0, 0.15));
  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, halfUp), 0.0);
  let H = normalize(sunDir + V);
  let NdH = max(dot(N, H), 0.0);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let bounce = ${wgslVec3(PALETTE.bounce)};

  let dist = length(input.viewPos);
  let aerial = 1.0 - exp(-dist * 0.048);
  let fogCol = ${wgslVec3(PALETTE.fog)};

  if (input.building < 0.5) {
    if (input.faceNy < -0.45) {
      discard;
    }
    let pave = ${wgslVec3(PALETTE.pavement)};
    let paveSide = ${wgslVec3(PALETTE.pavementSide)};
    var albedo = pave;
    if (input.faceNy > 0.5) {
      let g = input.blockSeed;
      let wx = abs(fract(uv.x * 8.0 + g.x * 0.07) - 0.5);
      let wy = abs(fract(uv.y * 8.0 + g.y * 0.07) - 0.5);
      let lane = smoothstep(0.1, 0.16, min(wx, wy));
      let gridDark = (1.0 - lane) * 0.1;
      let stain = (hash2(floor(uv * 5.0) + g) - 0.5) * 0.035;
      albedo = pave * (1.0 - gridDark + stain);
      albedo = albedo * (0.9 + 0.14 * NdSun + 0.1 * NdUp);
    } else {
      albedo = paveSide * (0.78 + 0.18 * NdSun + 0.07 * NdUp);
    }
    let diffSt = albedo * (bounce * 0.44 + sunCol * NdSun * 0.46 + skyFill * NdUp * 0.2);
    let specSt = ${wgslVec3(PALETTE.spec)} * pow(NdH, 56.0) * 0.14;
    var hdrSt = diffSt + specSt;
    hdrSt = mix(hdrSt, fogCol, aerial * 0.06 * (1.0 - p * 0.35));
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

  // Strong face differentiation for isometric city look
  let isLeftFace = N.x < -0.5;
  let isRightFace = N.z > 0.5;

  if (input.faceVertical > 0.5) {
    if (isLeftFace) {
      // Left face - darkest (shadow side)
      albedo = stone * 0.65;
    } else {
      // Right face - medium (lit side)
      albedo = stone * 0.85;
    }
    albedo = albedo * (1.0 + hBoost);
    streetAo = mix(0.7, 1.0, smoothstep(0.0, 0.12, uv.y));
  } else if (input.faceNy > 0.5) {
    // Top face - brightest
    albedo = stone * 1.05 * (1.0 + hBoost * 0.5);
  } else {
    albedo = stone * 0.5;
  }

  let diffuse =
    albedo * (bounce * 0.38 + sunCol * NdSun * 0.52 + skyFill * NdUp * 0.22) * streetAo;
  let specCol = ${wgslVec3(PALETTE.spec)} * specAmt * 0.26;
  let rim = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 3.8);
  let rimLight = rim * ${wgslVec3(PALETTE.rim)} * 0.035;

  var hdr = diffuse + specCol + rimLight + emissive;
  hdr = mix(hdr, fogCol, aerial * 0.07 * (1.0 - p * 0.35));
  hdr = acesFilm(hdr * 0.99);
  hdr = pow(hdr, vec3f(1.0 / 2.06));
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
  let haze = mix(horizon, zenith, pow(uv.y, 0.88));
  let alpha = 1.0 - uniforms.progress;
  return vec4f(haze * alpha, alpha);
}
`;

// Minecraft Steve - exact proportions from wiki: Head 8x8x8, Torso 8x12x4, Limbs 4x12x4
// Total height = 32 pixels (8 head + 12 torso + 12 legs)
// 6 body parts × 3 visible faces × 6 vertices = 108 vertices per character
const VERTS_PER_PEDESTRIAN = 108;

const pedestrianVertexShader = /* wgsl */ `
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

struct PedOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) partType: f32,
  @location(2) faceType: f32,
  @location(3) pixelSize: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> pedPositions: array<vec2f>;
@group(0) @binding(2) var<storage, read> qrMatrix: array<u32>;

fn hash(p: f32) -> f32 {
  return fract(sin(p * 127.1) * 43758.5453);
}

fn isWall(col: i32, row: i32) -> bool {
  let sz = i32(qrMatrix[0]);
  if (col < 0 || col >= sz || row < 0 || row >= sz) { return true; }
  let idx = row * sz + col;
  return (qrMatrix[idx / 32 + 1] & (1u << u32(idx % 32))) != 0u;
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> PedOut {
  var output: PedOut;
  let time = uniforms.time;
  let gridSize = uniforms.gridSize;
  let progress = uniforms.progress;

  // 18 vertices per body part (3 faces × 6 verts)
  let partIndex = vertexIndex / 18u;
  let partVertex = vertexIndex % 18u;
  let faceIndex = partVertex / 6u;
  let faceVertex = partVertex % 6u;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[faceVertex];

  let cellPos = pedPositions[instanceIndex];
  let seed = f32(instanceIndex);
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;

  // Movement timing - one box per second
  let t = time + hash(seed * 3.7) * 100.0;

  // Simulate path: walk until wall, then turn
  var col = i32(cellPos.x);
  var row = i32(cellPos.y);
  var dx = select(-1, 1, hash(seed * 4.1) > 0.5);
  var dz = 0;
  if (hash(seed * 4.5) > 0.5) { dz = dx; dx = 0; }

  let stepTime = 1.0;
  let steps = i32(t / stepTime);
  let frac = fract(t / stepTime);

  for (var s = 0; s < min(steps, 200); s++) {
    let nc = col + dx;
    let nr = row + dz;
    if (!isWall(nc, nr)) {
      col = nc; row = nr;
    } else {
      let h = hash(f32(s) * 13.7 + seed * 7.3);
      var found = false;
      let dirs = array<vec2i, 4>(
        vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1)
      );
      let startDir = i32(h * 4.0) % 4;
      for (var d = 0; d < 4; d++) {
        let dirIdx = (startDir + d) % 4;
        let tryDir = dirs[dirIdx];
        if (!isWall(col + tryDir.x, row + tryDir.y)) {
          dx = tryDir.x;
          dz = tryDir.y;
          found = true;
          break;
        }
      }
      if (!found) { dx = 0; dz = 0; }
    }

    let changeDir = hash(f32(s) * 31.3 + seed * 17.1);
    if (changeDir > 0.92) {
      let h2 = hash(f32(s) * 23.7 + seed * 11.3);
      let dirs2 = array<vec2i, 4>(
        vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1)
      );
      let tryDir = dirs2[i32(h2 * 4.0) % 4];
      if (!isWall(col + tryDir.x, row + tryDir.y)) {
        dx = tryDir.x;
        dz = tryDir.y;
      }
    }
  }

  // Smooth interpolation to next cell
  var nc = col + dx;
  var nr = row + dz;
  var smoothCol = f32(col);
  var smoothRow = f32(row);
  if (!isWall(nc, nr)) {
    smoothCol = mix(f32(col), f32(nc), frac);
    smoothRow = mix(f32(row), f32(nr), frac);
  }

  let baseX = smoothCol * blockSize - halfGrid;
  let baseZ = smoothRow * blockSize - halfGrid;
  let groundY = 0.006;

  // ============================================
  // MINECRAFT STEVE EXACT PROPORTIONS
  // Total: 32px tall (8 head + 12 torso + 12 legs)
  // ============================================
  let unit = 0.0038;

  // Head: 8×8×8 (perfect cube)
  let headW = 8.0 * unit;
  let headH = 8.0 * unit;
  let headD = 8.0 * unit;

  // Torso: 8 wide × 12 tall × 4 deep
  let torsoW = 8.0 * unit;
  let torsoH = 12.0 * unit;
  let torsoD = 4.0 * unit;

  // Arms: 4 wide × 12 tall × 4 deep
  let armW = 4.0 * unit;
  let armH = 12.0 * unit;
  let armD = 4.0 * unit;

  // Legs: 4 wide × 12 tall × 4 deep
  let legW = 4.0 * unit;
  let legH = 12.0 * unit;
  let legD = 4.0 * unit;

  // Walking animation - subtle to avoid body part clipping
  let walkSpeed = 4.0;
  let walkPhase = frac * 6.28318 * walkSpeed;
  let legSwingAngle = sin(walkPhase) * 0.25;
  let armSwingAngle = sin(walkPhase) * 0.2;
  let bodyBob = abs(sin(walkPhase)) * 0.001;

  // Calculate swing offsets (reduced to prevent clipping)
  let legSwingZ = sin(legSwingAngle) * legH * 0.25;
  let armSwingZ = sin(armSwingAngle) * armH * 0.2;

  // Part dimensions and positions
  var partW = 0.0; var partH = 0.0; var partD = 0.0;
  var partX = 0.0; var partY = 0.0; var partZ = 0.0;
  var partType = 0u; // 0=head, 1=torso, 2=leftArm, 3=rightArm, 4=leftLeg, 5=rightLeg
  var pixelW = 8.0; var pixelH = 8.0; // Texture pixel dimensions for UV mapping

  if (partIndex == 0u) {
    // HEAD
    partW = headW; partH = headH; partD = headD;
    partX = 0.0;
    partY = groundY + legH + torsoH + bodyBob;
    partZ = 0.0;
    partType = 0u;
    pixelW = 8.0; pixelH = 8.0;
  } else if (partIndex == 1u) {
    // TORSO
    partW = torsoW; partH = torsoH; partD = torsoD;
    partX = 0.0;
    partY = groundY + legH + bodyBob;
    partZ = 0.0;
    partType = 1u;
    pixelW = 8.0; pixelH = 12.0;
  } else if (partIndex == 2u) {
    // LEFT ARM
    partW = armW; partH = armH; partD = armD;
    partX = -(torsoW * 0.5 + armW * 0.5);
    partY = groundY + legH + bodyBob;
    partZ = -armSwingZ;
    partType = 2u;
    pixelW = 4.0; pixelH = 12.0;
  } else if (partIndex == 3u) {
    // RIGHT ARM
    partW = armW; partH = armH; partD = armD;
    partX = (torsoW * 0.5 + armW * 0.5);
    partY = groundY + legH + bodyBob;
    partZ = armSwingZ;
    partType = 3u;
    pixelW = 4.0; pixelH = 12.0;
  } else if (partIndex == 4u) {
    // LEFT LEG
    partW = legW; partH = legH; partD = legD;
    partX = -legW * 0.5;
    partY = groundY;
    partZ = legSwingZ;
    partType = 4u;
    pixelW = 4.0; pixelH = 12.0;
  } else {
    // RIGHT LEG
    partW = legW; partH = legH; partD = legD;
    partX = legW * 0.5;
    partY = groundY;
    partZ = -legSwingZ;
    partType = 5u;
    pixelW = 4.0; pixelH = 12.0;
  }

  // Build 3D box - 3 visible faces for isometric view
  // Matching building shader: FRONT at +Z, RIGHT at +X, TOP at +Y
  var localPos = vec3f(0.0);
  var faceType = 0.0; // 0=top, 1=front, 2=side
  let hw = partW * 0.5;
  let hd = partD * 0.5;
  var uv = qv;

  output.pixelSize = vec2f(pixelW, pixelH);

  if (faceIndex == 0u) {
    // TOP face
    localPos = vec3f(
      partX + (qv.x - 0.5) * partW,
      partY + partH,
      partZ + (qv.y - 0.5) * partD
    );
    faceType = 0.0;
    output.pixelSize = vec2f(pixelW, pixelW);
  } else if (faceIndex == 1u) {
    // FRONT face (at +Z, facing camera)
    localPos = vec3f(
      partX + (qv.x - 0.5) * partW,
      partY + qv.y * partH,
      partZ + hd
    );
    faceType = 1.0;
  } else {
    // RIGHT SIDE face (at +X)
    localPos = vec3f(
      partX + hw,
      partY + qv.y * partH,
      partZ + (qv.x - 0.5) * partD
    );
    faceType = 2.0;
  }

  let worldX = baseX + localPos.x;
  let worldY = localPos.y;
  let worldZ = baseZ + localPos.z;

  // Isometric camera transform
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);
  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = worldX * cy - worldZ * sy;
  let ry_z = worldX * sy + worldZ * cy;
  let rx_y = worldY * cx - ry_z * sx;
  let rx_z = worldY * sx + ry_z * cx;

  let viewScale = mix(1.0, 1.35, progress);
  output.position = vec4f(
    ry_x * viewScale / uniforms.aspectRatio,
    rx_y * viewScale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.uv = uv;
  output.partType = f32(partType);
  output.faceType = faceType;

  return output;
}
`;

const pedestrianFragmentShader = /* wgsl */ `
struct PedIn {
  @location(0) uv: vec2f,
  @location(1) partType: f32,
  @location(2) faceType: f32,
  @location(3) pixelSize: vec2f,
}

// Minecraft Steve colors - authentic pixel art style
fn getSteveColor(part: i32, face: i32, px: i32, py: i32) -> vec3f {
  // Steve skin palette
  let skin = vec3f(0.808, 0.627, 0.459);      // Main skin
  let skinDark = vec3f(0.675, 0.502, 0.341);  // Shadow/nose
  let hair = vec3f(0.275, 0.188, 0.118);      // Dark brown hair
  let eyeWhite = vec3f(1.0, 1.0, 1.0);        // Eye white
  let eyeBrown = vec3f(0.341, 0.220, 0.141);  // Eye brown/pupil
  let mouth = vec3f(0.459, 0.271, 0.180);     // Mouth
  let shirt = vec3f(0.0, 0.671, 0.671);       // Cyan shirt
  let pants = vec3f(0.224, 0.224, 0.608);     // Blue pants

  // HEAD (8x8)
  if (part == 0) {
    if (face == 0) { return hair; } // Top = hair
    if (face == 1) {
      // FRONT FACE - Steve's iconic face
      // Row 0-1: Hair
      if (py <= 1) { return hair; }
      // Row 2-3: Eyes
      if (py == 2 || py == 3) {
        // Eyes: white outer, brown inner
        // Right eye (viewer's left): px 2=white, px 3=brown
        // Left eye (viewer's right): px 4=brown, px 5=white
        if (px == 2) { return eyeWhite; }
        if (px == 3) { return eyeBrown; }
        if (px == 4) { return eyeBrown; }
        if (px == 5) { return eyeWhite; }
        return skin;
      }
      // Row 4: Nose highlight
      if (py == 4) { return skin; }
      // Row 5: Nose shadow
      if (py == 5) {
        if (px == 3 || px == 4) { return skinDark; }
        return skin;
      }
      // Row 6: Mouth
      if (py == 6) {
        if (px >= 3 && px <= 4) { return mouth; }
        return skin;
      }
      // Row 7: Chin
      return skin;
    }
    // SIDE face - hair on top 2 rows
    if (py <= 1) { return hair; }
    return skin;
  }

  // TORSO
  if (part == 1) { return shirt; }

  // ARMS (bare skin in classic Steve)
  if (part == 2 || part == 3) { return skin; }

  // LEGS
  return pants;
}

@fragment
fn main(input: PedIn) -> @location(0) vec4f {
  let uv = clamp(input.uv, vec2f(0.0), vec2f(0.999));
  let part = i32(input.partType + 0.5);
  let face = i32(input.faceType + 0.5);

  // Pixel coordinates
  let px = i32(floor(uv.x * input.pixelSize.x));
  let py = i32(floor((1.0 - uv.y) * input.pixelSize.y));

  let color = getSteveColor(part, face, px, py);

  // Minecraft-style flat shading per face
  var shade = 1.0;
  if (face == 1) { shade = 0.8; }      // Front
  else if (face == 2) { shade = 0.6; } // Side

  return vec4f(color * shade, 1.0);
}
`;

// ============================================
// MINECRAFT-STYLE FOUNTAIN SHADERS
// ============================================
// Structure: Stone rim + water pool + central pillar + water source + flowing water
// 8 stone rim + 1 water pool surface + 3 pillar + 1 water source + 16 flowing water (4 sides × 4 levels)
// Each cube = 36 vertices (6 faces × 6 verts)
const FOUNTAIN_BLOCKS = 29; // 8 rim + 1 pool + 3 pillar + 1 source + 16 flowing
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
@group(0) @binding(1) var<storage, read> fountainPos: vec2f;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> FountainOut {
  var output: FountainOut;
  let time = uniforms.time;
  let gridSize = uniforms.gridSize;
  let progress = uniforms.progress;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;

  // Fountain center position
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

  // Block positions in the fountain structure
  // Blocks 0-7: Base ring (stone bricks) - arranged in a square pattern
  // Blocks 8-11: Central pillar (4 stacked stone blocks)
  // Block 12: Water source on top

  var blockX = 0.0;
  var blockY = 0.0;
  var blockZ = 0.0;
  var blockType = 0.0; // 0 = stone, 1 = water
  let cubeSize = blockSize * 0.9;

  // Stone rim positions (8 blocks forming outer edge of basin)
  let rimOffsets = array<vec2f, 8>(
    vec2f(-1.0, -1.0), vec2f(0.0, -1.0), vec2f(1.0, -1.0),
    vec2f(-1.0, 0.0),                    vec2f(1.0, 0.0),
    vec2f(-1.0, 1.0),  vec2f(0.0, 1.0),  vec2f(1.0, 1.0)
  );

  // Fountain sits ON TOP of finder pattern (finder height ~0.1)
  let finderTopY = 0.11;
  let poolSurfaceY = finderTopY + cubeSize * 0.3; // Pool water level

  if (blockIdx < 8u) {
    // Stone rim - raised edge around the pool
    let offset = rimOffsets[blockIdx];
    blockX = baseX + offset.x * blockSize;
    blockZ = baseZ + offset.y * blockSize;
    blockY = finderTopY;
    blockType = 0.0; // Stone
  } else if (blockIdx == 8u) {
    // Water pool surface (flat water in the basin)
    blockX = baseX;
    blockZ = baseZ;
    blockY = finderTopY;
    blockType = 3.0; // Pool water (special - shorter height)
  } else if (blockIdx < 12u) {
    // Central pillar - 3 stacked stone blocks rising from pool
    let stackLevel = blockIdx - 9u;
    blockX = baseX;
    blockZ = baseZ;
    blockY = poolSurfaceY + f32(stackLevel) * cubeSize;
    blockType = 0.0; // Stone
  } else if (blockIdx == 12u) {
    // Water source block on top of pillar
    blockX = baseX;
    blockZ = baseZ;
    blockY = poolSurfaceY + 3.0 * cubeSize;
    blockType = 1.0; // Water source
  } else {
    // Flowing water (blocks 13-28)
    // 4 directions × 4 levels = 16 flowing water blocks
    let flowIdx = blockIdx - 13u;
    let direction = flowIdx / 4u;  // 0=+X, 1=-X, 2=+Z, 3=-Z
    let level = flowIdx % 4u;      // 0=top (at source), 3=bottom (at pool)

    // Offset from center based on direction
    var offsetX = 0.0;
    var offsetZ = 0.0;
    if (direction == 0u) { offsetX = cubeSize; }
    else if (direction == 1u) { offsetX = -cubeSize; }
    else if (direction == 2u) { offsetZ = cubeSize; }
    else { offsetZ = -cubeSize; }

    blockX = baseX + offsetX;
    blockZ = baseZ + offsetZ;
    // Water flows from source level (3*cubeSize) down to pool level (0)
    // level 0 = at source, level 3 = at pool surface
    blockY = poolSurfaceY + f32(3u - level) * cubeSize;
    blockType = 2.0 + f32(level) * 0.1; // 2.0-2.3 for flow animation
  }

  // Build the cube faces (same as building blocks)
  let hw = cubeSize * 0.5;
  var localPos = vec3f(0.0);
  var faceType = 0.0;

  // Pool water is rendered as a thin slab (only top face visible)
  let isPoolWater = blockType > 2.9 && blockType < 3.1;
  let poolHeight = cubeSize * 0.15; // Thin water surface
  let effectiveHeight = select(cubeSize, poolHeight, isPoolWater);

  if (faceIdx == 0u) {
    // Top face
    localPos = vec3f(
      blockX + (qv.x - 0.5) * cubeSize,
      blockY + effectiveHeight,
      blockZ + (qv.y - 0.5) * cubeSize
    );
    faceType = 0.0;
  } else if (faceIdx == 1u) {
    // Bottom face
    localPos = vec3f(
      blockX + (qv.x - 0.5) * cubeSize,
      blockY,
      blockZ + (0.5 - qv.y) * cubeSize
    );
    faceType = 0.0;
  } else if (faceIdx == 2u) {
    // Front face (+Z)
    localPos = vec3f(
      blockX + (qv.x - 0.5) * cubeSize,
      blockY + qv.y * effectiveHeight,
      blockZ + hw
    );
    faceType = 1.0;
  } else if (faceIdx == 3u) {
    // Back face (-Z)
    localPos = vec3f(
      blockX + (0.5 - qv.x) * cubeSize,
      blockY + qv.y * effectiveHeight,
      blockZ - hw
    );
    faceType = 1.0;
  } else if (faceIdx == 4u) {
    // Right face (+X)
    localPos = vec3f(
      blockX + hw,
      blockY + qv.y * effectiveHeight,
      blockZ + (qv.x - 0.5) * cubeSize
    );
    faceType = 2.0;
  } else {
    // Left face (-X)
    localPos = vec3f(
      blockX - hw,
      blockY + qv.y * effectiveHeight,
      blockZ + (0.5 - qv.x) * cubeSize
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

  if (blockType > 2.5) {
    // POOL WATER - calm water surface with ripples
    let waterBase = vec3f(0.1, 0.3, 0.7);
    let waterLight = vec3f(0.25, 0.45, 0.85);

    // Gentle ripples spreading outward
    let center = uv - 0.5;
    let dist = length(center);
    let ripple = sin(dist * 20.0 - time * 3.0) * 0.5 + 0.5;

    color = mix(waterBase, waterLight, ripple * 0.3);

    // Surface sparkles
    let sparkle = smoothstep(0.95, 1.0, sin(uv.x * 15.0 + time * 2.0) * sin(uv.y * 15.0 + time * 1.5));
    color += sparkle * 0.4;

  } else if (blockType > 1.5) {
    // FLOWING WATER - animated downward flow
    let flowLevel = (blockType - 2.0) * 10.0;
    let waterBase = vec3f(0.15, 0.35, 0.85);
    let waterLight = vec3f(0.4, 0.6, 1.0);
    let waterFoam = vec3f(0.7, 0.85, 1.0);

    // Downward flowing animation
    let flowSpeed = 5.0;
    let flowY = fract(uv.y - time * flowSpeed);

    // Create vertical streaks for flowing effect
    let streakX = floor(uv.x * 5.0);
    let streakPhase = fract(sin(streakX * 127.1) * 43758.5);
    let streak = fract(flowY + streakPhase);

    // Wave pattern - brighter streaks
    let wave = smoothstep(0.0, 0.4, streak) * smoothstep(1.0, 0.4, streak);

    color = mix(waterBase, waterLight, wave * 0.7);

    // Add foam/bubbles
    let foam = smoothstep(0.85, 1.0, fract(uv.y * 4.0 - time * 3.0)) * 0.5;
    color = mix(color, waterFoam, foam);

    // Sparkle
    let sparkle = smoothstep(0.95, 1.0, sin(uv.x * 15.0 + time * 6.0) * sin(flowY * 12.0));
    color += sparkle * 0.4;

  } else if (blockType > 0.5) {
    // WATER SOURCE BLOCK - Minecraft style animated water
    let waterBase = vec3f(0.2, 0.4, 0.9);
    let waterLight = vec3f(0.4, 0.6, 1.0);

    // Simple animated pattern like Minecraft water
    let px = floor(uv.x * 4.0);
    let py = floor(uv.y * 4.0);
    let wave = sin(time * 2.0 + px * 0.5 + py * 0.3) * 0.5 + 0.5;

    color = mix(waterBase, waterLight, wave * 0.3);

    // Slight transparency feel with lighter streaks
    let streak = sin(uv.x * 8.0 + uv.y * 4.0 + time * 3.0) * 0.5 + 0.5;
    color += vec3f(0.1, 0.15, 0.2) * streak * 0.3;

  } else {
    // STONE BRICK - Minecraft cobblestone/stone brick texture
    let stoneBase = vec3f(0.45, 0.45, 0.45);
    let stoneDark = vec3f(0.3, 0.3, 0.3);
    let stoneLight = vec3f(0.55, 0.55, 0.55);

    // Create brick pattern (2x2 grid)
    let brickX = fract(uv.x * 2.0);
    let brickY = fract(uv.y * 2.0);

    // Mortar lines between bricks
    let mortarX = smoothstep(0.0, 0.08, brickX) * smoothstep(1.0, 0.92, brickX);
    let mortarY = smoothstep(0.0, 0.08, brickY) * smoothstep(1.0, 0.92, brickY);
    let mortar = mortarX * mortarY;

    // Random variation per brick
    let brickIdx = floor(uv.x * 2.0) + floor(uv.y * 2.0) * 2.0;
    let variation = fract(sin(brickIdx * 127.1) * 43758.5) * 0.15 - 0.075;

    color = mix(stoneDark, stoneBase + variation, mortar);

    // Add some noise/texture
    let noise = fract(sin(uv.x * 50.0 + uv.y * 37.0) * 43758.5) * 0.1 - 0.05;
    color += noise;
  }

  // Minecraft-style face shading
  var shade = 1.0;
  if (face == 0) {
    shade = 1.0;  // Top - brightest
  } else if (face == 1) {
    shade = 0.8;  // Front
  } else {
    shade = 0.6;  // Side - darkest
  }

  return vec4f(color * shade, 1.0);
}
`;

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const IsometricQRCode = () => {
  const { width, height } = useWindowDimensions();
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
  const pedestrianBufferRef = useRef<GPUBuffer | null>(null);
  const fountainBufferRef = useRef<GPUBuffer | null>(null);
  const qrMatrixBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{
    numBlocks: number;
    gridSize: number;
    pedestrianCount: number;
    fountainCenter: { col: number; row: number };
  }>({ numBlocks: 0, gridSize: 0, pedestrianCount: 0, fountainCenter: { col: 3, row: 3 } });
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
    const pedestrianBuffer = pedestrianBufferRef.current;
    const fountainBuffer = fountainBufferRef.current;
    const qrMatrixBuffer = qrMatrixBufferRef.current;

    if (
      !device ||
      !colorBuffer ||
      !posBuffer ||
      !heightBuffer ||
      !pedestrianBuffer ||
      !fountainBuffer ||
      !qrMatrixBuffer
    )
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const { positions, heights, colors, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    const pedestrianData = generatePedestrianPositions(qrMatrix);
    const fountainCenter = getFountainCenter(gridSize);

    // Update refs for render loop
    blockDataRef.current = {
      numBlocks,
      gridSize,
      pedestrianCount: pedestrianData.count,
      fountainCenter,
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

    // Update pedestrian positions
    device.queue.writeBuffer(pedestrianBuffer, 0, pedestrianData.positions);

    // Update fountain center position
    const fountainData = new Float32Array([fountainCenter.col, fountainCenter.row]);
    device.queue.writeBuffer(fountainBuffer, 0, fountainData);

    // Update QR matrix for wall detection
    const packedMatrix = packQRMatrix(qrMatrix);
    device.queue.writeBuffer(qrMatrixBuffer, 0, packedMatrix);
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
    const { positions, heights, colors, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    const pedestrianData = generatePedestrianPositions(qrMatrix);
    const fountainCenter = getFountainCenter(gridSize);
    blockDataRef.current = {
      numBlocks,
      gridSize,
      pedestrianCount: pedestrianData.count,
      fountainCenter,
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

    // Pedestrian position buffer
    const pedestrianBuffer = device.createBuffer({
      size: MAX_PEDESTRIANS * 2 * 4, // vec2f per pedestrian
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    pedestrianBufferRef.current = pedestrianBuffer;
    device.queue.writeBuffer(pedestrianBuffer, 0, pedestrianData.positions);

    // Fountain center position buffer
    const fountainBuffer = device.createBuffer({
      size: 2 * 4, // vec2f
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    fountainBufferRef.current = fountainBuffer;
    const fountainData = new Float32Array([fountainCenter.col, fountainCenter.row]);
    device.queue.writeBuffer(fountainBuffer, 0, fountainData);

    // QR matrix buffer for wall detection (packed bits + gridSize)
    const packedMatrix = packQRMatrix(qrMatrix);
    const qrMatrixBuffer = device.createBuffer({
      size: Math.max(packedMatrix.byteLength, 64), // Min 64 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    qrMatrixBufferRef.current = qrMatrixBuffer;
    device.queue.writeBuffer(qrMatrixBuffer, 0, packedMatrix);

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
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: colorBuffer } },
        { binding: 2, resource: { buffer: posBuffer } },
        { binding: 3, resource: { buffer: heightBuffer } },
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

    // Pedestrian bind group layout (uniforms + positions + QR matrix)
    const pedestrianBindGroupLayout = device.createBindGroupLayout({
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
      ],
    });

    const pedestrianBindGroup = device.createBindGroup({
      layout: pedestrianBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: pedestrianBuffer } },
        { binding: 2, resource: { buffer: qrMatrixBuffer } },
      ],
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

    // Pedestrian pipeline - walking figures
    const pedestrianPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [pedestrianBindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: pedestrianVertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: pedestrianFragmentShader }),
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
      const { numBlocks, gridSize, pedestrianCount } =
        blockDataRef.current;

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
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
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

      // Fountain - beautiful water feature replacing one finder pattern
      renderPass.setPipeline(fountainPipeline);
      renderPass.setBindGroup(0, fountainBindGroup);
      renderPass.draw(FOUNTAIN_VERTS, 1);

      // Pedestrians - walking figures on the streets
      if (pedestrianCount > 0) {
        renderPass.setPipeline(pedestrianPipeline);
        renderPass.setBindGroup(0, pedestrianBindGroup);
        renderPass.draw(VERTS_PER_PEDESTRIAN, pedestrianCount);
      }

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
          placeholderTextColor="#999"
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
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1a1a1a',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputContainer: {
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  pressable: { flex: 1 },
});
