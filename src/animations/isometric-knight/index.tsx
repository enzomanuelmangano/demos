import {
  LayoutChangeEvent,
  PixelRatio,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, CanvasRef } from 'react-native-wgpu';

import {
  CONTRIBUTION_GRID_COLS,
  CONTRIBUTION_GRID_ROWS,
  getContributionGrid,
} from './contribution-data';

const GRID_COLS = CONTRIBUTION_GRID_COLS;
const GRID_ROWS = CONTRIBUTION_GRID_ROWS;

/** Cell footprint in grid units (< 1 leaves gutters). 3D uses smaller footprint; 2D stays nearly flush. */
const CELL_FOOTPRINT_ISO = 0.78;
const CELL_FOOTPRINT_FLAT = 0.91;

/** Contribution ramp swatches (levels 1–4), aligned with `getFlatColor` in WGSL. */
const LEGEND_SWATCH_COLORS = [
  '#B3E3BA',
  '#70D18F',
  '#42B275',
  '#1F8A57',
] as const;

const LEGEND_SWATCH_SIZE = 11;
const LEGEND_SWATCH_GAP = 3;

/**
 * GitHub only exposes 0–4 buckets, not raw counts. We map each bucket to a
 * monotonic “typical contribution day” estimate so bar height scales with amount,
 * then normalize by the strongest day in this grid.
 */
const CONTRIBUTION_ESTIMATE_BY_LEVEL: readonly number[] = [0, 1, 4, 11, 28];

function estimatedContributionsForLevel(level: number): number {
  return CONTRIBUTION_ESTIMATE_BY_LEVEL[level] ?? 0;
}

/** Normalized [0,1] height ∝ relative contribution amount for each cell. */
function buildNormalizedContributionHeights(
  contributionGrid: number[][],
): number[][] {
  const raw = contributionGrid.map(col =>
    col.map(level => estimatedContributionsForLevel(level)),
  );
  let max = 0;
  for (const col of raw) {
    for (const v of col) {
      if (v > max) {
        max = v;
      }
    }
  }
  if (max === 0) {
    max = 1;
  }
  return raw.map(col => col.map(v => v / max));
}

/** Blur so peaks lift neighbors — continuous “mountain” terrain (ref-style). */
function smoothHeightField(grid: number[][], passes: number): number[][] {
  const cols = grid.length;
  const rows = grid[0].length;
  let cur = grid.map(c => [...c]);
  for (let p = 0; p < passes; p++) {
    const next: number[][] = [];
    for (let c = 0; c < cols; c++) {
      next[c] = [];
      for (let r = 0; r < rows; r++) {
        let sum = 0;
        let count = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const cc = c + dc;
            const rr = r + dr;
            if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) {
              sum += cur[cc][rr];
              count += 1;
            }
          }
        }
        next[c][r] = sum / count;
      }
    }
    cur = next;
  }
  return cur;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Soft elliptical edge so the landmass feels organic, not a sharp rectangle. */
function applyEllipticalLandmask(heights: number[][]): number[][] {
  const cx = (GRID_COLS - 1) * 0.5;
  const cz = (GRID_ROWS - 1) * 0.5;
  const rx = GRID_COLS * 0.5;
  const rz = GRID_ROWS * 0.48;
  return heights.map((col, c) =>
    col.map((h, r) => {
      const nx = (c - cx) / rx;
      const nz = (r - cz) / rz;
      const d = nx * nx + nz * nz;
      const mask = 1 - smoothstep(0.64, 1.06, d);
      return h * (0.84 + 0.16 * mask);
    }),
  );
}

/** Pull mids down / keep peaks — stronger apparent relief without changing colors. */
function emphasizePeaks(heights: number[][], gamma: number): number[][] {
  return heights.map(col =>
    col.map(h => Math.pow(Math.max(0, Math.min(1, h)), gamma)),
  );
}

/**
 * Real GitHub grids are sparse; without a floor, active days read as tiny dots.
 * Blur + elliptical mask also washes out isolated commits — use a tighter pipeline.
 */
function applySparseContributionFloor(
  heightMap: number[][],
  contributionGrid: number[][],
): number[][] {
  return heightMap.map((col, c) =>
    col.map((h, r) => {
      const level = contributionGrid[c][r];
      if (level <= 0) {
        return h;
      }
      const floor = 0.14 + (level / 4) * 0.22;
      return Math.max(h, floor);
    }),
  );
}

function buildHeightMap(
  contributionGrid: number[][],
  useRealData: boolean,
): number[][] {
  const normalized = buildNormalizedContributionHeights(contributionGrid);

  if (useRealData) {
    const blurred = smoothHeightField(normalized, 3);
    const peaked = emphasizePeaks(blurred, 0.88);
    const floored = applySparseContributionFloor(peaked, contributionGrid);
    return floored;
  }

  return emphasizePeaks(
    applyEllipticalLandmask(smoothHeightField(normalized, 5)),
    1.08,
  );
}

/** Flat grid for WGSL — neighbor height sampling (self-shadow / contact). */
const HEIGHT_GRID_CELL_COUNT = GRID_COLS * GRID_ROWS;

function buildHeightGridFlat(heightMap: number[][]): Float32Array {
  const out = new Float32Array(HEIGHT_GRID_CELL_COUNT);
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      out[c * GRID_ROWS + r] = heightMap[c][r];
    }
  }
  return out;
}

function generateBlockData(
  contributionGrid: number[][],
  heightMap: number[][],
): {
  positions: number[];
  heights: number[];
  colors: number[];
} {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const height = heightMap[col][row];

      positions.push(col, 0, row, 0);
      heights.push(height);

      colors.push(contributionGrid[col][row]);
    }
  }

  return { positions, heights, colors };
}

const NUM_YEARS = 9;

function addYearCards(data: {
  positions: number[];
  heights: number[];
  colors: number[];
}) {
  for (let year = 0; year < NUM_YEARS; year++) {
    const cx = (GRID_COLS - 1) / 2;
    const cz = year * 7 + 3;

    // Card background (color 6) — behind contribution blocks
    data.positions.push(cx, -1, cz, 0);
    data.heights.push(0.001);
    data.colors.push(6);
  }
}

function buildSceneData(contributionGrid: number[][], useRealData: boolean) {
  const heightMap = buildHeightMap(contributionGrid, useRealData);
  const data = generateBlockData(contributionGrid, heightMap);
  addYearCards(data);
  const heightGridFlat = buildHeightGridFlat(heightMap);
  return { ...data, heightGridFlat };
}

const NUM_BLOCKS = GRID_COLS * GRID_ROWS + NUM_YEARS;

/** One surface family: canvas, shell, and clear color stay aligned. */
const SURFACE_RGB = { r: 0.969, g: 0.961, b: 0.941 } as const;

const ISO_ANGLE_Y = 0.8;
const ISO_ANGLE_X = -0.5;
/** How much of the NDC view the isometric chart fills (higher = larger / “closer”). */
const ISO_VIEWPORT_FILL = 0.96;
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
  @location(2) isBase: f32,
  @location(3) progress: f32,
  @location(4) isTop: f32,
  @location(5) heightFrac: f32,
  @location(6) edgeDist: f32,
  @location(7) topRim: f32,
  @location(8) shadowCast: f32,
  @location(9) peakLift: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;
@group(0) @binding(4) var<storage, read> heightGrid: array<f32>;

fn heightAt(c: i32, r: i32) -> f32 {
  if (c < 0 || c >= i32(${GRID_COLS}) || r < 0 || r >= i32(${GRID_ROWS})) {
    return 0.0;
  }
  return heightGrid[u32(c) * ${GRID_ROWS}u + u32(r)];
}

fn gridShadow(myH: f32, col: f32, row: f32) -> f32 {
  if (myH < 0.008) {
    return 1.0;
  }
  let lightDir = normalize(vec3f(0.38, 0.84, 0.36));
  var g = vec2f(lightDir.x, lightDir.z);
  let gl = length(g);
  if (gl < 1e-4) {
    return 1.0;
  }
  g = g / gl;
  let bc = i32(floor(col + 0.5));
  let br = i32(floor(row + 0.5));
  var sh = 1.0;
  for (var s: i32 = 1; s < 10; s = s + 1) {
    let nc = bc + i32(round(g.x * f32(s)));
    let nr = br + i32(round(g.y * f32(s)));
    let nh = heightAt(nc, nr);
    if (nh > myH + 0.06) {
      let t = smoothstep(myH + 0.06, myH + 0.36, nh);
      let fall = 1.0 - f32(s) * 0.05;
      sh *= mix(1.0, 0.78, t * 0.55 * max(fall, 0.5));
    }
  }
  return max(sh, 0.58);
}

fn getBlockColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.84, 0.90, 0.86); }
    case 1u: { return vec3f(0.74, 0.88, 0.74); }
    case 2u: { return vec3f(0.50, 0.80, 0.58); }
    case 3u: { return vec3f(0.30, 0.66, 0.44); }
    case 4u: { return vec3f(0.13, 0.50, 0.32); }
    case 6u: { return vec3f(0.972, 0.969, 0.958); }
    default: { return vec3f(0.90, 0.94, 0.88); }
  }
}

fn getFlatColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.92, 0.96, 0.90); }
    case 1u: { return vec3f(0.70, 0.89, 0.72); }
    case 2u: { return vec3f(0.44, 0.82, 0.56); }
    case 3u: { return vec3f(0.26, 0.70, 0.46); }
    case 4u: { return vec3f(0.12, 0.54, 0.34); }
    case 6u: { return vec3f(0.99, 0.988, 0.982); }
    default: { return vec3f(0.92, 0.96, 0.90); }
  }
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
  let blockColor = blockColors[instanceIndex];
  let blockHeight = blockHeights[instanceIndex];

  let blockSize = 0.009;
  let maxHeight = 8.6;
  let isCard = blockColor == 6u;

  var h3D = max(blockHeight * maxHeight, 0.026);
  var fH = 0.06;
  if (isCard) { h3D = 0.0; fH = 0.0; }
  let height = mix(h3D, fH, progress);

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  var csX = mix(${CELL_FOOTPRINT_ISO}, ${CELL_FOOTPRINT_FLAT}, progress);
  var csZ = csX;

  if (isCard) {
    csX = (f32(${GRID_COLS}) + 1.5) * progress;
    csZ = (7.0 + 0.6) * progress;
  }

  let hwX = csX * 0.5;
  let hwZ = csZ * 0.5;
  let hh = height * 0.5;

  switch(faceIndex) {
    case 0u: {
      let ux = qv.x - 0.5;
      let uz = qv.y - 0.5;
      let tr = clamp(length(vec2f(ux, uz)) * 2.08, 0.0, 1.0);
      let yTop = hh * (1.0 - 0.08 * smoothstep(0.32, 1.0, tr));
      localPos = vec3f(ux * csX, yTop, uz * csZ);
      let bump = 0.62;
      faceNormal = normalize(vec3f(-ux * csX * bump, 1.0, -uz * csZ * bump));
    }
    case 1u: {
      localPos = vec3f((qv.x - 0.5) * csX, -hh, (0.5 - qv.y) * csZ);
      faceNormal = vec3f(0.0, -1.0, 0.0);
    }
    case 2u: {
      localPos = vec3f((qv.x - 0.5) * csX, (qv.y - 0.5) * height, hwZ);
      faceNormal = vec3f(0.0, 0.0, 1.0);
    }
    case 3u: {
      localPos = vec3f((0.5 - qv.x) * csX, (qv.y - 0.5) * height, -hwZ);
      faceNormal = vec3f(0.0, 0.0, -1.0);
    }
    case 4u: {
      localPos = vec3f(hwX, (qv.y - 0.5) * height, (qv.x - 0.5) * csZ);
      faceNormal = vec3f(1.0, 0.0, 0.0);
    }
    case 5u: {
      localPos = vec3f(-hwX, (qv.y - 0.5) * height, (0.5 - qv.x) * csZ);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  var worldPos = blockPos * blockSize + localPos * blockSize;
  worldPos.y += hh * blockSize;

  worldPos.x -= (f32(${GRID_COLS}) - 1.0) * blockSize * 0.5;
  worldPos.z -= (f32(${GRID_ROWS}) - 1.0) * blockSize * 0.5;

  // Separate years with gaps in flat view (9 years, 7 rows each)
  let yearIndex = floor(blockPos.z / 7.0);
  let rowInYear = blockPos.z - yearIndex * 7.0;
  let yearGap = 4.0;
  let numGaps = 8.0;
  worldPos.z += (yearIndex * yearGap - numGaps * yearGap * 0.5) * blockSize * progress;

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

  let lightDir = normalize(vec3f(0.38, 0.84, 0.36));
  var rawDiffuse = max(dot(faceNormal, lightDir), 0.0);
  var shade3D = 0.26 + 0.74 * pow(rawDiffuse, 0.62);
  if (faceNormal.y > 0.45) {
    shade3D = min(1.0, shade3D * 1.1 + 0.06);
  }
  if (abs(faceNormal.y) < 0.12) {
    shade3D *= 0.62;
  }
  if (faceNormal.y < -0.45) {
    shade3D *= 0.78;
  }
  let shade = mix(shade3D, 1.0, progress);

  let halfW = (f32(${GRID_COLS}) - 1.0) * blockSize * 0.5;
  let halfZ = (f32(${GRID_ROWS}) - 1.0) * blockSize * 0.5;
  let isoSpanX = abs(cy) * halfW + abs(sy) * halfZ;
  let isoSpanY = abs(sx) * (abs(sy) * halfW + abs(cy) * halfZ) + abs(cx) * 4.2 * blockSize;
  let isoFit = min(${ISO_VIEWPORT_FILL} * uniforms.aspectRatio / max(isoSpanX, 1e-4), ${ISO_VIEWPORT_FILL} / max(isoSpanY, 1e-4));

  let totalZ = f32(${GRID_ROWS}) + numGaps * yearGap;
  let halfH = totalZ * blockSize * 0.5;
  let fitWidth = 0.9 * uniforms.aspectRatio / halfW;
  let fitHeight = 0.9 / halfH;
  let flatScale = min(fitWidth, fitHeight);
  let scale = mix(isoFit, flatScale, progress);
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.014 + 0.5,
    1.0
  );

  let color3D = getBlockColor(blockColor);
  let colorFlat = getFlatColor(blockColor);
  output.color = mix(color3D, colorFlat, progress);
  output.shade = shade;
  output.progress = progress;

  var isBaseVal = 0.0;
  if (blockColor == 0u) {
    isBaseVal = 1.0;
  }
  output.isBase = isBaseVal;

  var topVal = 0.0;
  if (faceNormal.y > 0.5) {
    topVal = 1.0;
  }
  output.isTop = topVal;

  var hf = clamp((localPos.y + hh) / max(height, 1e-5), 0.0, 1.0);
  if (isCard) {
    hf = 0.5;
  }
  output.heightFrac = hf;
  output.edgeDist = length(vec2f(ry_x, rx_y)) * scale;

  var rim = 0.0;
  if (faceIndex == 0u) {
    let ux = qv.x - 0.5;
    let uz = qv.y - 0.5;
    rim = clamp(length(vec2f(ux, uz)) * 2.0, 0.0, 1.0);
  }
  output.topRim = rim;

  output.shadowCast = gridShadow(blockHeight, blockPos.x, blockPos.z);

  var pl = 0.0;
  if (!isCard && faceIndex == 0u) {
    pl = blockHeight;
  }
  output.peakLift = pl;

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct FragmentInput {
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) isBase: f32,
  @location(3) progress: f32,
  @location(4) isTop: f32,
  @location(5) heightFrac: f32,
  @location(6) edgeDist: f32,
  @location(7) topRim: f32,
  @location(8) shadowCast: f32,
  @location(9) peakLift: f32,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let bg = vec3f(0.969, 0.961, 0.941);

  let toneLo = vec3f(0.965, 0.963, 0.958);
  let toneHi = vec3f(1.0, 0.998, 0.993);
  let tone = mix(toneLo, toneHi, pow(input.shade, mix(0.78, 0.86, input.progress)));
  let lift = mix(0.94, 1.0, input.shade);
  var lit = input.color * mix(tone * lift, vec3f(1.0), input.progress);

  let canopy = mix(vec3f(1.0), vec3f(1.04, 1.03, 1.02), input.isTop);
  lit = lit * mix(canopy, vec3f(1.0), input.progress);

  let peakShade = mix(0.94, 1.07, input.peakLift);
  lit = lit * mix(1.0, peakShade, (1.0 - input.progress) * input.isTop);

  let rimDark = mix(1.0, 0.9, pow(input.topRim, 1.2));
  lit = lit * mix(rimDark, 1.0, input.progress);

  let contact = mix(0.88, 1.0, smoothstep(0.0, 0.7, input.heightFrac));
  lit = lit * mix(contact, 1.0, input.progress);

  let castSoft = mix(1.0, input.shadowCast, 0.58);
  lit = lit * mix(castSoft, 1.0, input.progress);

  let luma = dot(lit, vec3f(0.299, 0.587, 0.114));
  lit = mix(vec3f(luma), lit, mix(1.04, 1.0, input.progress));

  let edgeFade = smoothstep(0.38, 0.62, input.edgeDist);
  lit = lit * mix(1.0, 0.995, edgeFade * (1.0 - input.progress) * 0.1);

  let baseFade = mix(0.26, 0.0, input.progress);
  var col = mix(lit, bg, input.isBase * baseFade);

  return vec4f(col, 1.0);
}
`;

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const IsometricKnight = () => {
  const { width, height } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [useMyContributions, setUseMyContributions] = useState(false);
  const layoutRef = useRef({ width, height });
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isFlat = useRef(false);
  const rawProgressRef = useRef(0);
  const progressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) {
      layoutRef.current = { width: w, height: h };
    }
  }, []);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current) return;

    const context = canvasRef.current.getContext('webgpu');
    if (!context) return;

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) return;

      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      const canvas = context.canvas as HTMLCanvasElement;
      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();

      context.configure({ device, format, alphaMode: 'opaque' });

      const { positions, heights, colors, heightGridFlat } = buildSceneData(
        getContributionGrid(useMyContributions),
        useMyContributions,
      );

      /** WebGPU: uniform buffer size must be a multiple of 256 bytes. */
      const UNIFORM_BUFFER_SIZE = 256;
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
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

      const heightGridByteSize = Math.max(
        256,
        Math.ceil(heightGridFlat.byteLength / 256) * 256,
      );
      const heightGridBuffer = device.createBuffer({
        size: heightGridByteSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        heightGridBuffer,
        0,
        new Float32Array(heightGridFlat),
      );

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
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
          { binding: 4, resource: { buffer: heightGridBuffer } },
        ],
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
          targets: [{ format }],
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

      const render = () => {
        const now = Date.now();
        const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
        lastFrameTimeRef.current = now;

        const { width: lw, height: lh } = layoutRef.current;
        const aspectRatio = lh > 0 ? lw / lh : width / height;

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
              clearValue: {
                r: SURFACE_RGB.r,
                g: SURFACE_RGB.g,
                b: SURFACE_RGB.b,
                a: 1,
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

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.draw(36, NUM_BLOCKS);
        renderPass.end();

        device.queue.submit([commandEncoder.finish()]);
        context.present();

        animationRef.current = requestAnimationFrame(render);
      };

      render();
    } catch (e) {
      console.error('[IsometricKnight] WebGPU init failed', e);
    }
  }, [height, width, useMyContributions]);

  useEffect(() => {
    layoutRef.current = { width, height };
  }, [width, height]);

  useEffect(() => {
    const id = setTimeout(initWebGPU, 100);
    return () => {
      clearTimeout(id);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGPU]);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Pressable style={styles.pressable} onPress={handlePress}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </Pressable>
      <View
        pointerEvents="box-none"
        style={[styles.sourceToggle, { bottom: safeBottom + 14 }]}>
        <Text style={styles.sourceToggleLabel}>My contributions</Text>
        <Switch
          accessibilityLabel="Toggle real GitHub contribution data"
          onValueChange={setUseMyContributions}
          value={useMyContributions}
        />
      </View>
      <View style={styles.legend} pointerEvents="none">
        <View style={styles.legendRow}>
          <Text style={styles.legendCaption}>Less</Text>
          <View style={styles.legendRamp}>
            <View style={styles.swatchRow}>
              {LEGEND_SWATCH_COLORS.map((color, i) => (
                <View
                  key={i}
                  style={[
                    styles.swatch,
                    { width: LEGEND_SWATCH_SIZE, height: LEGEND_SWATCH_SIZE },
                    i > 0 && { marginLeft: LEGEND_SWATCH_GAP },
                    { backgroundColor: color },
                  ]}
                />
              ))}
            </View>
            <View style={styles.legendMoreWrap}>
              <Text style={styles.legendCaption}>More</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  container: { backgroundColor: '#F7F5F0', flex: 1 },
  legend: {
    bottom: 28,
    position: 'absolute',
    right: 20,
  },
  legendCaption: {
    color: 'rgba(55, 55, 55, 0.72)',
    fontSize: 11,
    letterSpacing: 0.2,
    lineHeight: 14,
    marginRight: 10,
  },
  legendMoreWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  legendRamp: {
    alignItems: 'flex-end',
  },
  legendRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  pressable: { flex: 1 },
  sourceToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    left: 16,
    position: 'absolute',
    zIndex: 10,
  },
  sourceToggleLabel: {
    color: 'rgba(55, 55, 55, 0.78)',
    fontSize: 12,
    letterSpacing: 0.15,
  },
  swatch: {
    borderColor: 'rgba(0, 0, 0, 0.06)',
    borderCurve: 'continuous',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatchRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
