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
  skyZenith: background, // Keep white background
  skyHorizon: background, // Keep white background
  pavement: lerpRgb(building, background, 0.65),
  pavementSide: lerpRgb(building, background, 0.5),
  fog: { r: 0.96, g: 0.94, b: 0.92 }, // Subtle warm haze
  sun: { r: 1.12, g: 0.98, b: 0.82 }, // Soft golden sun
  skyFill: { r: 0.85, g: 0.82, b: 0.78 }, // Neutral warm fill
  bounce: { r: 0.42, g: 0.38, b: 0.34 }, // Subtle warm bounce
  window: { r: 1.0, g: 0.92, b: 0.75 },
  crown: lerpRgb(building, background, 0.1),
  rim: { r: 1.05, g: 0.95, b: 0.82 }, // Soft golden rim
  spec: { r: 1.02, g: 0.98, b: 0.92 }, // Subtle warm specular
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

/** Which finder patterns become special structures */
/** Fountain positions: 'bl' = top-left on screen, 'tr' = bottom-right on screen */
const FOUNTAIN_FINDERS: ('bl' | 'tr')[] = ['bl', 'tr'];
/** Castle position: 'br_area' = top-right on screen (no finder pattern there) */
const CASTLE_POSITION: 'br_area' = 'br_area';

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

/** Landmark: only ~1 corner gets full height; falloff in normalized distance [0,1]. */
const SKYLINE_LANDMARK_SIGMA = 0.29;
const SKYLINE_LANDMARK_POWER = 2.4;

/** Rest of grid: low-rise fabric (never near 1.0 except inside landmark blend). */
const SKYLINE_FABRIC_MIN = 0.08;
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

  // Get fountain centers and castle center to exclude those blocks
  const fountainCenters = getFountainCenters(gridSize);
  const castleCenter = getCastleCenter(gridSize);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isModule = qrMatrix[row][col];

      // Check if this block is in any fountain area (3x3 around center)
      const inFountainArea = fountainCenters.some(
        fc => Math.abs(col - fc.col) <= 1 && Math.abs(row - fc.row) <= 1
      );

      // Check if this block is in the castle area (within finder pattern bounds)
      const inCastleArea =
        Math.abs(col - castleCenter.col) <= 3 &&
        Math.abs(row - castleCenter.row) <= 3;

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (inFountainArea || inCastleArea) {
        // Flatten blocks in structure areas
        color = GROUND_COLOR;
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
  // Cinematic golden hour sun - warm side lighting
  let sunDir = normalize(vec3f(0.55, 0.48, 0.45));
  let halfUp = normalize(vec3f(0.15, 1.0, 0.2));
  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, halfUp), 0.0);
  let H = normalize(sunDir + V);
  let NdH = max(dot(N, H), 0.0);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let bounce = ${wgslVec3(PALETTE.bounce)};
  let ambient = vec3f(0.22, 0.20, 0.18); // Subtle warm ambient

  let dist = length(input.viewPos);
  let aerial = 1.0 - exp(-dist * 0.048);
  let fogCol = ${wgslVec3(PALETTE.fog)};

  if (input.building < 0.5) {
    if (input.faceNy < -0.45) {
      discard;
    }

    // Check if this ground block should be a glowing lantern
    let g = input.blockSeed;
    let lanternChance = hash2(g * 13.7);
    let isLantern = lanternChance > 0.85; // ~15% of ground blocks are lanterns

    if (isLantern) {
      // Glowing lantern block - like Minecraft glowstone/sea lantern
      let time = uniforms.time;

      // Lantern colors - bright warm golden glow
      let lanternCore = vec3f(1.0, 0.95, 0.7);     // Very bright center
      let lanternMid = vec3f(1.0, 0.85, 0.5);      // Mid tone
      let lanternEdge = vec3f(0.95, 0.7, 0.35);    // Warmer edge

      // Pixelated glowstone-style texture (4x4 grid)
      let px = floor(uv.x * 4.0);
      let py = floor(uv.y * 4.0);
      let cellNoise = fract(sin(px * 127.1 + py * 311.7 + g.x * 17.3) * 43758.5);

      // Create glowing crystal pattern with pulsing
      let pulse = sin(time * 3.0 + cellNoise * 6.28) * 0.15 + 1.0;

      var lanternColor = lanternMid;
      if (cellNoise > 0.6) {
        lanternColor = lanternCore;
      } else if (cellNoise < 0.3) {
        lanternColor = lanternEdge;
      }

      // Add shimmer/sparkle effect
      let sparkle = smoothstep(0.92, 1.0, fract(sin(px * 43.7 + py * 17.3 + time * 4.0) * 43758.5));
      lanternColor += vec3f(0.4, 0.35, 0.2) * sparkle;

      // Strong emissive glow
      let emissiveStrength = 2.0 * pulse;
      var hdrLantern = lanternColor * emissiveStrength;

      // Very slight face shading (still very bright on sides)
      if (input.faceNy < 0.5) {
        hdrLantern *= 0.9;
      }

      hdrLantern = acesFilm(hdrLantern);
      hdrLantern = pow(hdrLantern, vec3f(1.0 / 2.06));
      let alpha = 1.0 - p;
      if (alpha < 0.002) {
        discard;
      }
      return vec4f(hdrLantern * alpha, alpha);
    }

    let pave = ${wgslVec3(PALETTE.pavement)};
    let paveSide = ${wgslVec3(PALETTE.pavementSide)};
    var albedo = pave;
    if (input.faceNy > 0.5) {
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

  // Minecraft-style block types based on height
  // 0=cobblestone, 1=grass, 3=stonebrick, 4=snow, 5=mountain rock
  var blockType = 0;
  let seed = input.blockSeed;
  let typeNoise = hash2(seed * 3.1);

  if (input.blockH < 0.15) {
    blockType = 1; // Grass - low ground
  } else if (input.blockH < 0.3) {
    // Mix of stone brick and cobblestone
    if (typeNoise > 0.5) { blockType = 3; } else { blockType = 0; }
  } else if (input.blockH < 0.5) {
    // Stone brick for mid-height
    blockType = 3;
  } else if (input.blockH > 0.7) {
    // Mountain peaks - dark rock with scattered snow on top
    blockType = 5;
  } else {
    // Mid-high mountains - dark rock
    blockType = 5;
  }

  // CINEMATIC Minecraft colors - vibrant and saturated
  // Grass - lush vivid greens
  let grassBright = vec3f(0.45, 0.72, 0.25);
  let grassMid = vec3f(0.38, 0.62, 0.20);
  let grassDark = vec3f(0.28, 0.50, 0.15);
  // Dirt - rich warm brown
  let dirtSide = vec3f(0.58, 0.42, 0.26);
  let dirtDark = vec3f(0.42, 0.30, 0.18);
  let dirtMid = vec3f(0.50, 0.36, 0.22);

  // Stone/Cobblestone - neutral gray (OKLCH L=0.40-0.60, C=0, H=0)
  let stoneLight = vec3f(0.58, 0.58, 0.58);
  let stoneMid = vec3f(0.48, 0.48, 0.48);
  let stoneDark = vec3f(0.34, 0.34, 0.34);

  // Stone Bricks - slightly warm gray (OKLCH L=0.35-0.55, C=0.02, H=45)
  let brickLight = vec3f(0.54, 0.53, 0.51);
  let brickMid = vec3f(0.44, 0.43, 0.42);
  let brickDark = vec3f(0.30, 0.29, 0.28);

  // Mountain Rock - very dark neutral (OKLCH L=0.15-0.35, C=0.01, H=30)
  let rockLight = vec3f(0.34, 0.33, 0.32);
  let rockMid = vec3f(0.24, 0.23, 0.22);
  let rockDark = vec3f(0.14, 0.13, 0.12);
  let rockAccent = vec3f(0.28, 0.26, 0.24);

  // Snow - bright white with blue tint (OKLCH L=0.92-0.98, C=0.02, H=250)
  let snowTop = vec3f(0.96, 0.97, 1.0);
  let snowShade = vec3f(0.78, 0.84, 0.94);

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

  // Golden hour face lighting - subtle warm highlights, cool shadows
  let warmTint = vec3f(1.08, 1.02, 0.94);   // Subtle golden tint
  let coolTint = vec3f(0.88, 0.90, 0.96);   // Subtle cool shadow
  let saturationBoost = 1.25;               // Make colors pop

  if (input.faceVertical > 0.5) {
    var shade = 0.9;
    var tint = warmTint;
    if (isLeftFace) { shade = 0.55; tint = coolTint; }

    if (blockType == 1) {
      // GRASS SIDE - realistic soil with natural layers
      // Smooth vertical gradient for natural soil stratification
      let depth = 1.0 - uv.y;
      var dirtColor = mix(dirtSide, dirtDark, depth * 0.6);

      // Subtle horizontal variation for natural look
      let hVariation = sin(uv.x * 6.28) * 0.04;
      dirtColor = dirtColor * (1.0 + hVariation);

      // Grass/root layer at top - smooth transition
      let grassBlend = smoothstep(0.85, 0.95, uv.y);
      dirtColor = mix(dirtColor, grassDark * 0.9, grassBlend);

      albedo = dirtColor * shade * tint;

    } else if (blockType == 3) {
      // STONE BRICK - clean brick pattern
      let brickV = fract(uv.y * 4.0);
      let rowIdx = floor(uv.y * 4.0);
      var brickOffset = 0.0;
      if (fract(rowIdx * 0.5) > 0.25) { brickOffset = 0.5; }
      let brickU = fract(uv.x * 2.0 + brickOffset);
      // Mortar lines
      let isMortar = brickU < 0.06 || brickU > 0.94 || brickV < 0.08 || brickV > 0.92;
      var brickColor = brickMid;
      if (isMortar) {
        brickColor = brickDark * 0.75;
      }
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

    } else {
      // COBBLESTONE - clean stone grid
      let gridX = fract(uv.x * 2.0);
      let gridY = fract(uv.y * 3.0);
      // Simple mortar gaps
      let isMortar = gridX < 0.08 || gridX > 0.92 || gridY < 0.1 || gridY > 0.9;
      var cobbleColor = stoneMid;
      if (isMortar) { cobbleColor = stoneDark * 0.7; }
      albedo = cobbleColor * shade * tint;
    }
    albedo = albedo * (1.0 + hBoost);
    streetAo = mix(0.7, 1.0, smoothstep(0.0, 0.12, uv.y));

  } else if (input.faceNy > 0.5) {
    // TOP FACE - subtle golden hour glow
    let topWarmTint = vec3f(1.10, 1.04, 0.92);  // Subtle golden top
    if (blockType == 1) {
      // GRASS TOP - realistic natural grass
      // Smooth gradient based on position for natural variation
      let posVariation = sin(uv.x * 4.0) * sin(uv.y * 4.0) * 0.12;
      var grassColor = mix(grassMid, grassBright, 0.5 + posVariation);

      // Subtle directional grain like real grass blades
      let grain = sin(uv.x * 12.0 + uv.y * 2.0) * 0.04;
      grassColor = grassColor * (1.0 + grain);

      albedo = grassColor * topWarmTint;

    } else if (blockType == 3) {
      // STONE BRICK TOP - clean grid pattern
      let brickU = fract(uv.x * 2.0);
      let brickV = fract(uv.y * 2.0);
      let isMortar = brickU < 0.06 || brickU > 0.94 || brickV < 0.06 || brickV > 0.94;
      var brickColor = brickMid;
      if (isMortar) { brickColor = brickDark * 0.75; }
      albedo = brickColor * topWarmTint;

    } else if (blockType == 4) {
      // SNOW TOP - sparkly with warm sunlight
      var snowColor = mix(snowShade, snowTop, 0.65 + noise16 * 0.35);
      if (noise16b > 0.88) { snowColor = vec3f(1.0, 1.0, 1.0); }
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

    } else {
      // COBBLESTONE TOP - clean stone grid
      let gridX = fract(uv.x * 2.0);
      let gridY = fract(uv.y * 2.0);
      let isMortar = gridX < 0.06 || gridX > 0.94 || gridY < 0.06 || gridY > 0.94;
      var rockColor = stoneMid;
      if (isMortar) { rockColor = stoneDark * 0.7; }
      albedo = rockColor * topWarmTint;
    }
  } else {
    // BOTTOM FACE - subtle cool shadows
    let bottomCoolTint = vec3f(0.82, 0.84, 0.90);
    if (blockType == 1) { albedo = dirtDark * 0.4 * bottomCoolTint; }
    else if (blockType == 5) { albedo = rockDark * 0.35 * bottomCoolTint; }
    else { albedo = stoneDark * 0.4 * bottomCoolTint; }
  }

  // CINEMATIC DIFFUSE - high contrast, warm/cool color separation
  let diffuse =
    albedo * (ambient + sunCol * NdSun * 0.72 + skyFill * NdUp * 0.32 + bounce * 0.28) * streetAo;
  let specCol = ${wgslVec3(PALETTE.spec)} * specAmt * 0.28;
  let rim = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 3.5);
  let rimLight = rim * ${wgslVec3(PALETTE.rim)} * 0.042;

  var hdr = diffuse + specCol + rimLight + emissive;

  // Cinematic saturation boost
  let luminance = dot(hdr, vec3f(0.299, 0.587, 0.114));
  hdr = mix(vec3f(luminance), hdr, 1.25);

  hdr = mix(hdr, fogCol, aerial * 0.06 * (1.0 - p * 0.4));
  hdr = acesFilm(hdr * 1.02);
  hdr = pow(hdr, vec3f(1.0 / 2.1));
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
  let cubeSize = blockSize * 0.95;

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

  // Minecraft water colors - vibrant blue, semi-transparent
  let waterBase = vec3f(0.2, 0.4, 0.9);
  let waterLight = vec3f(0.4, 0.6, 1.0);
  let waterDark = vec3f(0.1, 0.25, 0.7);
  var alpha = 1.0;

  if (blockType > 2.5) {
    // POOL WATER - Minecraft classic animated texture
    let speed = 0.8;
    // Diagonal flowing pattern (classic Minecraft)
    let diag1 = fract((uv.x + uv.y) * 4.0 + time * speed);
    let diag2 = fract((uv.x + uv.y) * 4.0 + time * speed + 0.5);
    let wave = smoothstep(0.0, 0.3, diag1) * smoothstep(0.6, 0.3, diag1);
    let wave2 = smoothstep(0.0, 0.3, diag2) * smoothstep(0.6, 0.3, diag2);
    let pattern = max(wave, wave2 * 0.6);

    color = mix(waterBase, waterLight, pattern * 0.5);
    alpha = 0.75; // Semi-transparent

  } else if (blockType > 1.5) {
    // FLOWING WATER - vertical cascade
    let flowSpeed = 3.0;
    let flow = fract(uv.y * 3.0 - time * flowSpeed);
    let flowWave = smoothstep(0.0, 0.4, flow) * smoothstep(1.0, 0.4, flow);

    color = mix(waterDark, waterLight, flowWave * 0.7);
    alpha = 0.7;

  } else if (blockType > 0.5) {
    // WATER SOURCE - bubbling top
    let speed = 1.5;
    let bubble1 = sin((uv.x + uv.y) * 8.0 + time * speed) * 0.5 + 0.5;
    let bubble2 = sin((uv.x - uv.y) * 6.0 + time * speed * 1.2) * 0.5 + 0.5;
    let pattern = bubble1 * 0.5 + bubble2 * 0.5;

    color = mix(waterBase, waterLight, pattern * 0.4);
    alpha = 0.8;

  } else {
    // STONE BRICK - clean Minecraft sandstone/quartz style
    let stoneBase = vec3f(0.85, 0.82, 0.75);  // Light sandstone
    let stoneDark = vec3f(0.72, 0.68, 0.62);  // Darker shade

    // Simple brick grid
    let brickX = fract(uv.x * 2.0);
    let brickY = fract(uv.y * 3.0);
    let rowIdx = floor(uv.y * 3.0);
    var offset = 0.0;
    if (fract(rowIdx * 0.5) > 0.25) { offset = 0.5; }
    let shiftedX = fract(uv.x * 2.0 + offset);

    // Clean mortar lines
    let isMortar = shiftedX < 0.05 || shiftedX > 0.95 || brickY < 0.06 || brickY > 0.94;

    if (isMortar) {
      color = stoneDark * 0.8;
    } else {
      color = stoneBase;
    }
    alpha = 1.0; // Stone is fully opaque
  }

  // Minecraft-style face shading
  var shade = 1.0;
  if (face == 0) {
    shade = 1.0;  // Top - brightest
  } else if (face == 1) {
    shade = 0.85;  // Front
  } else {
    shade = 0.65;  // Side - darkest
  }

  // Water gets slightly brighter shading to look more translucent
  if (blockType > 0.5) {
    shade = shade * 0.9 + 0.1;
  }

  return vec4f(color * shade, alpha);
}
`;

// ============================================
// MINECRAFT-STYLE CASTLE SHADERS
// ============================================
// Structure: Stone walls + 4 corner towers + pointed roofs + red flags
// Based on medieval Minecraft castle designs - MUCH BIGGER VERSION
const CASTLE_BLOCKS = 49; // Grand central tower only
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
  @location(1) blockType: f32,  // 0=stone, 1=wood, 2=roof, 3=flag
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
  let cubeSize = blockSize * 0.9;

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
  let scale = 1.5;
  let thickness = 1.6;

  // Grand central tower only
  // Blocks 0-15: Central base tier 4×4 = 16 blocks
  // Blocks 16-24: Central second tier 3×3 = 9 blocks
  // Blocks 25-28: Central third tier 2×2 = 4 blocks
  // Blocks 29-36: Central spire 8 levels = 8 blocks
  // Blocks 37-44: Central roof pyramid 8 levels = 8 blocks
  // Blocks 45: Central flag pole = 1 block
  // Blocks 46: Central flag = 1 block
  // Total: 49 blocks

  if (blockIdx < 16u) {
    // Central base tier (4×4) - wide foundation
    let keepIdx = blockIdx;
    let kx = f32(i32(keepIdx) % 4) - 1.5;
    let kz = f32(i32(keepIdx) / 4) - 1.5;
    blockX = baseX + kx * blockSize * scale * 1.0;
    blockZ = baseZ + kz * blockSize * scale * 1.0;
    blockY = baseY;
    blockW = cubeSize * scale * 1.0 * thickness;
    blockD = cubeSize * scale * 1.0 * thickness;
    blockH = cubeSize * 5.0;
    blockType = 0.0; // Stone
  } else if (blockIdx < 25u) {
    // Central second tier (3×3) - narrower
    let keepIdx = blockIdx - 16u;
    let kx = f32(i32(keepIdx) % 3) - 1.0;
    let kz = f32(i32(keepIdx) / 3) - 1.0;
    blockX = baseX + kx * blockSize * scale * 0.9;
    blockZ = baseZ + kz * blockSize * scale * 0.9;
    blockY = baseY + cubeSize * 5.0;
    blockW = cubeSize * scale * 0.9 * thickness;
    blockD = cubeSize * scale * 0.9 * thickness;
    blockH = cubeSize * 6.0;
    blockType = 0.0; // Stone
  } else if (blockIdx < 29u) {
    // Central third tier (2×2) - even narrower
    let keepIdx = blockIdx - 25u;
    let kx = f32(i32(keepIdx) % 2) - 0.5;
    let kz = f32(i32(keepIdx) / 2) - 0.5;
    blockX = baseX + kx * blockSize * scale * 0.8;
    blockZ = baseZ + kz * blockSize * scale * 0.8;
    blockY = baseY + cubeSize * 11.0;
    blockW = cubeSize * scale * 0.8 * thickness;
    blockD = cubeSize * scale * 0.8 * thickness;
    blockH = cubeSize * 7.0;
    blockType = 0.0; // Stone
  } else if (blockIdx < 37u) {
    // Central spire (8 levels) - tall narrow tower
    let level = blockIdx - 29u;
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 18.0 + f32(level) * cubeSize * 1.2;
    let spireScale = 0.7 - f32(level) * 0.04;
    blockW = cubeSize * scale * spireScale * thickness;
    blockD = cubeSize * scale * spireScale * thickness;
    blockH = cubeSize * 1.2;
    blockType = 0.0; // Stone
  } else if (blockIdx < 45u) {
    // Central roof pyramid (8 levels)
    let rIdx = blockIdx - 37u;
    let roofScale = 0.8 - f32(rIdx) * 0.09;
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 27.6 + f32(rIdx) * cubeSize * 0.5;
    blockW = cubeSize * scale * roofScale * thickness;
    blockD = cubeSize * scale * roofScale * thickness;
    blockH = cubeSize * 0.5;
    blockType = 2.0; // Roof
  } else if (blockIdx < 47u) {
    // Central flag pole
    blockX = baseX;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 31.6;
    blockW = cubeSize * 0.15;
    blockD = cubeSize * 0.15;
    blockH = cubeSize * 2.0;
    blockType = 1.0; // Wood
  } else {
    // Central flag
    let wave = sin(time * 3.0) * 0.1;
    blockX = baseX + cubeSize * 0.5 + wave * cubeSize;
    blockZ = baseZ;
    blockY = baseY + cubeSize * 33.2;
    blockW = cubeSize * 1.0;
    blockD = cubeSize * 0.15;
    blockH = cubeSize * 0.7;
    blockType = 3.0; // Flag
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

  if (blockType > 2.5) {
    // RED FLAG
    let flagRed = vec3f(0.85, 0.15, 0.15);
    let flagDark = vec3f(0.7, 0.1, 0.1);
    // Simple wave pattern
    let wave = sin(uv.x * 6.28 + uniforms.time * 4.0) * 0.5 + 0.5;
    color = mix(flagDark, flagRed, wave * 0.3 + 0.7);

  } else if (blockType > 1.5) {
    // ROOF - dark slate tiles
    let roofDark = vec3f(0.22, 0.22, 0.28);
    let roofMid = vec3f(0.30, 0.30, 0.36);
    let roofLight = vec3f(0.38, 0.38, 0.44);

    // Tile pattern
    let tileX = fract(uv.x * 4.0);
    let tileY = fract(uv.y * 6.0);
    let rowIdx = floor(uv.y * 6.0);
    var tileOffset = 0.0;
    if (fract(rowIdx * 0.5) > 0.25) { tileOffset = 0.5; }
    let shiftedX = fract(uv.x * 4.0 + tileOffset);

    // Tile edges
    let edgeX = smoothstep(0.0, 0.1, shiftedX) * smoothstep(1.0, 0.9, shiftedX);
    let edgeY = smoothstep(0.0, 0.15, tileY) * smoothstep(1.0, 0.85, tileY);
    let edge = edgeX * edgeY;

    // Variation per tile
    let tileIdx = floor(uv.x * 4.0 + tileOffset) + rowIdx * 4.0;
    let variation = fract(sin(tileIdx * 127.1) * 43758.5);

    color = mix(roofDark, roofMid, edge);
    if (variation > 0.7) { color = mix(color, roofLight, 0.3); }

  } else if (blockType > 0.5) {
    // WOOD - timber frame / planks
    let woodDark = vec3f(0.35, 0.22, 0.12);
    let woodMid = vec3f(0.48, 0.32, 0.18);
    let woodLight = vec3f(0.58, 0.40, 0.22);

    // Plank pattern
    let plankY = fract(uv.y * 3.0);
    let plankIdx = floor(uv.y * 3.0);

    // Wood grain
    let grainNoise = fract(sin(uv.x * 20.0 + plankIdx * 7.1) * 43758.5);
    color = woodMid;
    if (grainNoise > 0.7) { color = woodLight; }
    else if (grainNoise < 0.3) { color = woodDark; }

    // Plank gaps
    if (plankY < 0.08 || plankY > 0.92) { color = woodDark * 0.6; }

  } else {
    // STONE BRICK - castle walls
    let stoneBase = vec3f(0.52, 0.50, 0.48);
    let stoneDark = vec3f(0.38, 0.36, 0.34);
    let stoneLight = vec3f(0.62, 0.60, 0.58);

    // Brick pattern (staggered)
    let brickX = fract(uv.x * 2.0);
    let brickY = fract(uv.y * 3.0);
    let rowIdx = floor(uv.y * 3.0);
    var brickOffset = 0.0;
    if (fract(rowIdx * 0.5) > 0.25) { brickOffset = 0.5; }
    let shiftedX = fract(uv.x * 2.0 + brickOffset);

    // Mortar lines
    let mortarX = smoothstep(0.0, 0.06, shiftedX) * smoothstep(1.0, 0.94, shiftedX);
    let mortarY = smoothstep(0.0, 0.08, brickY) * smoothstep(1.0, 0.92, brickY);
    let mortar = mortarX * mortarY;

    // Random per-brick variation
    let brickIdx = floor(uv.x * 2.0 + brickOffset) + rowIdx * 2.0;
    let variation = fract(sin(brickIdx * 127.1) * 43758.5);

    color = mix(stoneDark * 0.7, stoneBase, mortar);
    if (variation > 0.6) { color = mix(color, stoneLight, 0.25); }
    else if (variation < 0.3) { color = mix(color, stoneDark, 0.2); }

    // Surface noise
    let noise = fract(sin(uv.x * 40.0 + uv.y * 30.0) * 43758.5) * 0.08 - 0.04;
    color += noise;
  }

  // Golden hour face shading - subtle warm/cool
  let warmTint = vec3f(1.10, 1.04, 0.92);   // Subtle golden light
  let coolTint = vec3f(0.85, 0.88, 0.96);   // Subtle cool shadow
  let neutralTint = vec3f(0.96, 0.96, 0.96);

  var shade = 1.0;
  var tint = warmTint;
  if (face == 0) {
    shade = 1.05;  // Top - brightest, warmest
    tint = warmTint;
  } else if (face == 1) {
    shade = 0.85;  // Front - slightly cooler
    tint = neutralTint;
  } else {
    shade = 0.55;  // Side - cool shadows
    tint = coolTint;
  }

  // Apply cinematic color grading
  var finalColor = color * shade * tint;

  // Slight saturation boost for vibrancy
  let gray = dot(finalColor, vec3f(0.299, 0.587, 0.114));
  finalColor = mix(vec3f(gray), finalColor, 1.2);

  return vec4f(finalColor, 1.0);
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
    const fountainBuffer = fountainBufferRef.current;
    const castleBuffer = castleBufferRef.current;
    const qrMatrixBuffer = qrMatrixBufferRef.current;

    if (
      !device ||
      !colorBuffer ||
      !posBuffer ||
      !heightBuffer ||
      !fountainBuffer ||
      !castleBuffer ||
      !qrMatrixBuffer
    )
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const { positions, heights, colors, gridSize, numBlocks } =
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
