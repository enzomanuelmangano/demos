import {
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef } from 'react';

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
  pavement: lerpRgb(building, background, 0.15),
  pavementSide: lerpRgb(building, background, 0.08),
  fog: lerpRgb(background, building, 0.02),
  sun: background,
  skyFill: lerpRgb(background, { r: 0.9, g: 0.92, b: 0.98 }, 0.2),
  bounce: lerpRgb(background, building, 0.05),
  window: lerpRgb(building, background, 0.12),
  crown: lerpRgb(building, background, 0.1),
  rim: lerpRgb(building, background, 0.25),
  spec: lerpRgb(background, building, 0.1),
};

const CONTAINER_BG = COLORS.background;

function generateQRMatrix(): boolean[][] {
  const qrCodeData = QRCode.create('https://enzo.fyi', {
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
}

const QR_MATRIX = generateQRMatrix();
const GRID_SIZE = QR_MATRIX.length;
const GRID_COLS = GRID_SIZE;
const GRID_ROWS = GRID_SIZE;

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
): { kind: FinderKind; lx: number; ly: number } | null {
  const n = GRID_SIZE;
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

function finderModuleHeight(col: number, row: number): number | null {
  const p = finderPlacement(col, row);
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
 * Smooth, deterministic “districts” — mid/low variation without random heights.
 */
function skylineFabricHeight(col: number, row: number, g: number): number {
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
function skylineHeight(col: number, row: number): number {
  const g = Math.max(1, GRID_SIZE - 1);
  const ax = col / g;
  const ay = row / g;
  const { px, py } = skylinePeakCorner();
  const d = Math.hypot(ax - px, ay - py);
  const dNorm = d / Math.SQRT2;
  const landmarkWeight = Math.exp(
    -Math.pow(dNorm / SKYLINE_LANDMARK_SIGMA, SKYLINE_LANDMARK_POWER),
  );
  const fabric = skylineFabricHeight(col, row, g);
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

function generateBlockData(): {
  positions: number[];
  heights: number[];
  colors: number[];
} {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const isModule = QR_MATRIX[row][col];

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (isModule) {
        const district = Math.floor(col / 6) + Math.floor(row / 6);
        color = district % 2 === 0 ? BUILDING_BASE : PALETTE.buildingAlt;
        const fh = finderModuleHeight(col, row);
        height = fh !== null ? fh : skylineHeight(col, row);
      } else {
        color = GROUND_COLOR;
        /** Normalized — vertex shader applies a small extrude scale for lots */
        height = 0.006;
      }

      heights.push(height);
      colors.push(packRGB(color));
    }
  }

  return { positions, heights, colors };
}

const BLOCK_DATA = generateBlockData();
const NUM_BLOCKS = GRID_COLS * GRID_ROWS;

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

  let cs = mix(0.93, 0.97, progress);
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

  worldPos.x -= f32(${GRID_COLS}) * blockSize * 0.5;
  worldPos.z -= f32(${GRID_ROWS}) * blockSize * 0.5;

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

  if (input.faceVertical > 0.5) {
    let seed = input.blockSeed;
    let grain = (hash2(uv * vec2f(7.0, 16.0) + seed) - 0.5) * 0.045;
    let bands = sin(uv.y * 46.0 + seed.x * 4.0) * 0.018 + sin(uv.x * 28.0 + seed.y * 3.0) * 0.01;
    let mullion = abs(fract(uv.x * 6.0) - 0.5);
    let vertRib = smoothstep(0.38, 0.5, mullion) * 0.045;
    let creaseV = abs(uv.x - 0.5) * 2.0;
    let edge = smoothstep(0.4, 0.5, creaseV) * 0.038;
    albedo = stone * (0.86 + 0.15 * NdSun + 0.07 * NdUp + grain + bands) * (1.0 - edge);
    albedo = albedo * (1.0 - vertRib);
    albedo = albedo * (1.0 + hBoost);
    specAmt = pow(NdH, 88.0) * 0.022;
    streetAo = mix(0.78, 1.0, smoothstep(0.0, 0.4, uv.y));
    let cell = vec2f(floor(uv.x * 6.0), floor(uv.y * 12.0));
    let win = step(0.78, hash2(cell + seed)) * smoothstep(0.18, 0.42, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
    emissive = ${wgslVec3(PALETTE.window)} * win * 0.07;
  } else if (input.faceNy > 0.5) {
    let grain = (hash2(uv * 21.0 + input.blockSeed) - 0.5) * 0.04;
    albedo = stone * (0.9 + 0.1 * NdSun + grain) * (1.0 + hBoost * 0.6);
    specAmt = pow(NdH, 72.0) * 0.028;
    let crown = smoothstep(0.78, 0.94, uv.y) * smoothstep(0.78, 0.55, input.blockH);
    emissive = emissive + ${wgslVec3(PALETTE.crown)} * crown * 0.045;
  } else {
    albedo = stone * (0.55 + 0.32 * NdSun + 0.1 * NdUp);
    streetAo = 0.93;
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

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const IsometricQRCode = () => {
  const { width, height } = useWindowDimensions();
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isFlat = useRef(false);
  const progressRef = useRef(0);
  const rawProgressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
  }, []);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current) return;

    const context = canvasRef.current.getContext('webgpu');
    if (!context) return;

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return;

    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();

    const canvas = context.canvas as HTMLCanvasElement;
    canvas.width = canvas.clientWidth * PixelRatio.get();
    canvas.height = canvas.clientHeight * PixelRatio.get();

    context.configure({ device, format, alphaMode: 'premultiplied' });

    const { positions, heights, colors } = BLOCK_DATA;

    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const colorBuffer = device.createBuffer({
      size: NUM_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(colorBuffer, 0, new Uint32Array(colors));

    const posBuffer = device.createBuffer({
      size: NUM_BLOCKS * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(posBuffer, 0, new Float32Array(positions));

    const heightBuffer = device.createBuffer({
      size: NUM_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(heightBuffer, 0, new Float32Array(heights));

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

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspectRatio = width / height;

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

      const uniformData = new Float32Array([
        aspectRatio,
        time,
        NUM_BLOCKS,
        progressRef.current,
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
      renderPass.draw(36, NUM_BLOCKS);

      renderPass.end();

      device.queue.submit([commandEncoder.finish()]);
      context.present();

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  }, [height, width]);

  useEffect(() => {
    const id = setTimeout(initWebGPU, 100);
    return () => {
      clearTimeout(id);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGPU]);

  return (
    <View style={styles.container}>
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
  pressable: { flex: 1 },
});
