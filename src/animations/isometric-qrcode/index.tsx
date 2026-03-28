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

// Generate streetlight positions only on empty cells (streets)
const STREETLIGHT_SPACING = 4; // Every 4 cells
const MAX_STREETLIGHTS = 150;

function generateStreetlightPositions(qrMatrix: boolean[][]): {
  positions: Float32Array;
  count: number;
} {
  const gridSize = qrMatrix.length;
  const positions: number[] = [];

  for (let row = 0; row < gridSize; row += STREETLIGHT_SPACING) {
    for (let col = 0; col < gridSize; col += STREETLIGHT_SPACING) {
      // Only place light if this cell is empty (not a building)
      if (!qrMatrix[row][col]) {
        positions.push(col, row);
      }
    }
  }

  // Pad to MAX_STREETLIGHTS
  const result = new Float32Array(MAX_STREETLIGHTS * 2);
  for (let i = 0; i < Math.min(positions.length, MAX_STREETLIGHTS * 2); i++) {
    result[i] = positions[i];
  }

  return {
    positions: result,
    count: Math.min(positions.length / 2, MAX_STREETLIGHTS),
  };
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

// Streetlights shader - actual lamp posts with poles and glowing heads
// Each streetlight = 18 vertices (pole: 6, lamp head: 6, glow quad: 6)
const VERTS_PER_STREETLIGHT = 18;

const streetlightVertexShader = /* wgsl */ `
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

struct LightOut {
  @builtin(position) position: vec4f,
  @location(0) partType: f32,  // 0=pole, 1=lamp, 2=glow
  @location(1) localUv: vec2f,
  @location(2) intensity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> lightPositions: array<vec2f>;

fn hash(p: f32) -> f32 {
  return fract(sin(p * 127.1) * 43758.5453);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> LightOut {
  var output: LightOut;
  let progress = uniforms.progress;
  let time = uniforms.time;
  let gridSize = uniforms.gridSize;

  // Determine which part of the streetlight (pole, lamp head, or glow)
  let partIndex = vertexIndex / 6u;  // 0=pole, 1=lamp, 2=glow
  let localVertex = vertexIndex % 6u;

  // Quad vertices
  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[localVertex];

  // Read position from buffer (col, row)
  let cellPos = lightPositions[instanceIndex];
  let cellX = cellPos.x;
  let cellZ = cellPos.y;

  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;

  // Position at grid cell, offset to corner for lamp post look
  let seed = f32(instanceIndex);
  let cornerOffset = hash(seed * 1.7) * 0.3 - 0.15;
  let baseX = cellX * blockSize - halfGrid + blockSize * (0.3 + cornerOffset);
  let baseZ = cellZ * blockSize - halfGrid + blockSize * 0.3;

  // Lamp post dimensions
  let poleWidth = 0.001;
  let poleHeight = 0.035 + hash(seed * 2.1) * 0.01;
  let lampSize = 0.004;
  let glowSize = 0.025;

  var localPos: vec3f;
  var partType: f32 = 0.0;

  if (partIndex == 0u) {
    // Pole - thin vertical rectangle
    partType = 0.0;
    let x = (qv.x - 0.5) * poleWidth;
    let y = qv.y * poleHeight;
    localPos = vec3f(baseX + x, y, baseZ);
  } else if (partIndex == 1u) {
    // Lamp head - small box at top of pole
    partType = 1.0;
    let x = (qv.x - 0.5) * lampSize;
    let y = poleHeight + qv.y * lampSize * 0.6;
    localPos = vec3f(baseX + x, y, baseZ);
  } else {
    // Glow - billboard quad centered on lamp
    partType = 2.0;
    localPos = vec3f(baseX, poleHeight + lampSize * 0.3, baseZ);
  }

  // Isometric transform
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY);
  let sy = sin(isoAngleY);
  let cx = cos(isoAngleX);
  let sx = sin(isoAngleX);

  let ry_x = localPos.x * cy - localPos.z * sy;
  let ry_z = localPos.x * sy + localPos.z * cy;
  let rx_y = localPos.y * cx - ry_z * sx;
  let rx_z = localPos.y * sx + ry_z * cx;

  let scale = mix(1.0, 1.35, progress);

  var screenX = ry_x * scale / uniforms.aspectRatio;
  var screenY = rx_y * scale;

  // For glow, expand as billboard
  if (partIndex == 2u) {
    let glowOffset = (qv - 0.5) * 2.0 * glowSize;
    screenX += glowOffset.x;
    screenY += glowOffset.y;
  }

  output.position = vec4f(screenX, screenY, rx_z * 0.01 + 0.5, 1.0);
  output.partType = partType;
  output.localUv = qv * 2.0 - 1.0;

  // Flickering
  let flicker = 0.9 + 0.1 * sin(time * (3.0 + hash(seed * 2.3) * 2.0) + seed * 10.0);
  output.intensity = flicker * (1.0 - progress * 0.9);

  return output;
}
`;

const streetlightFragmentShader = /* wgsl */ `
struct LightIn {
  @location(0) partType: f32,
  @location(1) localUv: vec2f,
  @location(2) intensity: f32,
}

@fragment
fn main(input: LightIn) -> @location(0) vec4f {
  let uv = input.localUv;

  if (input.partType < 0.5) {
    // Pole - dark metal color
    let poleColor = vec3f(0.15, 0.15, 0.17);
    return vec4f(poleColor, 1.0);
  } else if (input.partType < 1.5) {
    // Lamp head - glowing warm color
    let lampColor = vec3f(1.0, 0.85, 0.5) * input.intensity;
    return vec4f(lampColor, 1.0);
  } else {
    // Glow effect
    let dist = length(uv);
    let glow = exp(-dist * 2.5) * input.intensity;
    let bloom = smoothstep(1.0, 0.0, dist) * 0.3 * input.intensity;
    let brightness = glow + bloom;

    let warmColor = vec3f(1.0, 0.8, 0.4);
    let finalColor = warmColor * brightness;
    let alpha = brightness * 0.6;

    if (alpha < 0.01) {
      discard;
    }

    return vec4f(finalColor * alpha, alpha);
  }
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
  const streetlightBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{
    numBlocks: number;
    gridSize: number;
    streetlightCount: number;
  }>({ numBlocks: 0, gridSize: 0, streetlightCount: 0 });
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
    const streetlightBuffer = streetlightBufferRef.current;

    if (
      !device ||
      !colorBuffer ||
      !posBuffer ||
      !heightBuffer ||
      !streetlightBuffer
    )
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const { positions, heights, colors, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    const streetlightData = generateStreetlightPositions(qrMatrix);

    // Update refs for render loop
    blockDataRef.current = {
      numBlocks,
      gridSize,
      streetlightCount: streetlightData.count,
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

    // Update streetlight positions
    device.queue.writeBuffer(streetlightBuffer, 0, streetlightData.positions);
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
    const streetlightData = generateStreetlightPositions(qrMatrix);
    blockDataRef.current = {
      numBlocks,
      gridSize,
      streetlightCount: streetlightData.count,
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

    // Streetlight position buffer
    const streetlightBuffer = device.createBuffer({
      size: MAX_STREETLIGHTS * 2 * 4, // vec2f per light
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    streetlightBufferRef.current = streetlightBuffer;
    device.queue.writeBuffer(streetlightBuffer, 0, streetlightData.positions);

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

    // Streetlight bind group layout (uniforms + positions)
    const streetlightBindGroupLayout = device.createBindGroupLayout({
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

    const streetlightBindGroup = device.createBindGroup({
      layout: streetlightBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: streetlightBuffer } },
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

    // Streetlight pipeline - glowing lights on the ground
    const streetlightPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [streetlightBindGroupLayout],
      }),
      vertex: {
        module: device.createShaderModule({ code: streetlightVertexShader }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: streetlightFragmentShader }),
        entryPoint: 'main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one', // Additive blending for glow
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
        depthCompare: 'always', // Always draw on top with blending
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
      const { numBlocks, gridSize, streetlightCount } = blockDataRef.current;

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

      // Streetlights - lamp posts with poles and glowing heads
      renderPass.setPipeline(streetlightPipeline);
      renderPass.setBindGroup(0, streetlightBindGroup);
      renderPass.draw(VERTS_PER_STREETLIGHT, streetlightCount);

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
