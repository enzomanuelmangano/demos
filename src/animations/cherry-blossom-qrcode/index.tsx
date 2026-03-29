import {
  PixelRatio,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import QRCode from 'qrcode';
import { Canvas, CanvasRef } from 'react-native-wgpu';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function wgslVec3(c: RGB): string {
  return `vec3f(${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)})`;
}

const COLORS = {
  background: '#e8f4e8',
};

const PALETTE = {
  skyZenith: { r: 0.55, g: 0.75, b: 0.95 },
  skyHorizon: { r: 0.92, g: 0.90, b: 0.95 },
  sun: { r: 1.1, g: 1.0, b: 0.92 },
  skyFill: { r: 0.75, g: 0.85, b: 0.98 },
  bounce: { r: 0.45, g: 0.58, b: 0.38 },
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
    return generateQRMatrix(DEFAULT_QR_CONTENT);
  }
}

const MAX_GRID_SIZE = 41;
const MAX_BLOCKS = MAX_GRID_SIZE * MAX_GRID_SIZE;

// Block types:
// 0 = dirt/path (QR light modules) - brown/tan, flat
// 1 = cherry blossom leaves (QR dark modules in canopy area) - pink, HIGH elevation
// 2 = trunk (QR dark modules at center core) - brown, tall from ground
// 3 = grass (QR dark modules outside tree area) - green, ground level

function generateBlockData(qrMatrix: boolean[][]): {
  positions: number[];
  heights: number[];
  baseY: number[];
  types: number[];
  gridSize: number;
  numBlocks: number;
} {
  const gridSize = qrMatrix.length;
  const cx = gridSize / 2;
  const cy = gridSize / 2;
  const positions: number[] = [];
  const heights: number[] = [];
  const baseY: number[] = []; // Starting Y position for each block
  const types: number[] = [];

  // Tree parameters - WIDE SPREADING cherry blossom (umbrella shape)
  const trunkRadius = 2.5; // Thick trunk
  const trunkHeight = 0.35; // Visible trunk
  const canopyBaseHeight = 0.32; // Canopy sits higher
  const canopyOuterRadius = gridSize * 0.48; // WIDE canopy - wider than tall
  const canopyThickness = 0.08; // FLAT canopy - not tall pillars
  const grassHeight = 0.045; // Ground grass height
  const dirtHeight = 0.018; // Dirt/path height

  // Pseudo-random function for organic variation
  const pseudoRandom = (col: number, row: number) => {
    const seed = Math.sin(col * 127.1 + row * 311.7) * 43758.5;
    return seed - Math.floor(seed);
  };

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      positions.push(col, row, 0, 0);

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!isQrDark) {
        // QR light module = dirt/path (type 0)
        heights.push(dirtHeight);
        baseY.push(0);
        types.push(0);
      } else {
        // QR dark module - this forms the tree illusion
        if (dist < trunkRadius) {
          // TRUNK - solid blocks from ground going UP
          heights.push(trunkHeight);
          baseY.push(0);
          types.push(2);
        } else if (dist < canopyOuterRadius) {
          // CANOPY - wide spreading FLAT umbrella shape
          const t = 1 - dist / canopyOuterRadius;

          // Flat canopy with slight variation - NOT tall pillars
          const thickness = canopyThickness * (0.8 + 0.2 * t);

          // Organic variation for fluffy look
          const noise = pseudoRandom(col, row);
          const heightVar = noise * 0.02 - 0.01;

          // Canopy blocks with slight droop at edges
          heights.push(thickness + heightVar);
          baseY.push(canopyBaseHeight - (1 - t) * 0.04); // Slight droop at edges
          types.push(1);
        } else {
          // Outside canopy - regular grass at ground
          heights.push(grassHeight);
          baseY.push(0);
          types.push(3);
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
    numBlocks: gridSize * gridSize,
  };
}

const ISO_ANGLE_Y = 0.78;
const ISO_ANGLE_X = -0.55;
const FLAT_ANGLE_Y = 0.0;
const FLAT_ANGLE_X = -1.5708;

// Main blocks vertex shader
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

struct BlockOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) faceNx: f32,
  @location(2) faceNy: f32,
  @location(3) faceNz: f32,
  @location(4) blockType: f32,
  @location(5) blockH: f32,
  @location(6) col: f32,
  @location(7) row: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockTypes: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;
@group(0) @binding(4) var<storage, read> blockBaseY: array<f32>;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> BlockOutput {
  var output: BlockOutput;
  let blockIdx = vertexIndex / 36u;
  let localVertIdx = vertexIndex % 36u;
  let faceIdx = localVertIdx / 6u;
  let vertIdx = localVertIdx % 6u;

  let blockCount = u32(uniforms.blockCount);
  if (blockIdx >= blockCount) {
    output.position = vec4f(0.0, 0.0, -10.0, 1.0);
    return output;
  }

  let posData = blockPositions[blockIdx];
  let col = posData.x;
  let row = posData.y;
  output.col = col;
  output.row = row;

  let gridSize = uniforms.gridSize;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;
  let cubeSize = blockSize * 0.92;

  let baseX = col * blockSize - halfGrid;
  let baseY = blockBaseY[blockIdx]; // Starting Y position (elevated for canopy)
  let baseZ = row * blockSize - halfGrid;
  let h = blockHeights[blockIdx];
  output.blockH = h;

  let typePacked = blockTypes[blockIdx];
  output.blockType = f32(typePacked);

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[vertIdx];
  let hw = cubeSize * 0.5;
  let hd = cubeSize * 0.5;

  var localPos = vec3f(0.0);
  var normal = vec3f(0.0);

  // Add gentle sway for cherry blossom blocks (type 1)
  var swayX = 0.0;
  var swayZ = 0.0;
  if (typePacked == 1u && h > 0.15) {
    let time = uniforms.time;
    swayX = sin(time * 0.8 + col * 0.3 + row * 0.2) * 0.002 * h;
    swayZ = sin(time * 0.6 + col * 0.2 + row * 0.4) * 0.0015 * h;
  }

  if (faceIdx == 0u) {
    localPos = vec3f(baseX + (qv.x - 0.5) * cubeSize + swayX, baseY + h, baseZ + (qv.y - 0.5) * cubeSize + swayZ);
    normal = vec3f(0.0, 1.0, 0.0);
  } else if (faceIdx == 1u) {
    localPos = vec3f(baseX + (qv.x - 0.5) * cubeSize, baseY, baseZ + (0.5 - qv.y) * cubeSize);
    normal = vec3f(0.0, -1.0, 0.0);
  } else if (faceIdx == 2u) {
    localPos = vec3f(baseX + (qv.x - 0.5) * cubeSize + swayX * qv.y, baseY + qv.y * h, baseZ + hd + swayZ * qv.y);
    normal = vec3f(0.0, 0.0, 1.0);
  } else if (faceIdx == 3u) {
    localPos = vec3f(baseX + (0.5 - qv.x) * cubeSize + swayX * qv.y, baseY + qv.y * h, baseZ - hd + swayZ * qv.y);
    normal = vec3f(0.0, 0.0, -1.0);
  } else if (faceIdx == 4u) {
    localPos = vec3f(baseX + hw + swayX * qv.y, baseY + qv.y * h, baseZ + (qv.x - 0.5) * cubeSize + swayZ * qv.y);
    normal = vec3f(1.0, 0.0, 0.0);
  } else {
    localPos = vec3f(baseX - hw + swayX * qv.y, baseY + qv.y * h, baseZ + (0.5 - qv.x) * cubeSize + swayZ * qv.y);
    normal = vec3f(-1.0, 0.0, 0.0);
  }

  output.uv = qv;
  output.faceNx = normal.x;
  output.faceNy = normal.y;
  output.faceNz = normal.z;

  let progress = uniforms.progress;
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

struct BlockInput {
  @location(0) uv: vec2f,
  @location(1) faceNx: f32,
  @location(2) faceNy: f32,
  @location(3) faceNz: f32,
  @location(4) blockType: f32,
  @location(5) blockH: f32,
  @location(6) col: f32,
  @location(7) row: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(input: BlockInput) -> @location(0) vec4f {
  let uv = input.uv;
  let N = normalize(vec3f(input.faceNx, input.faceNy, input.faceNz));
  let blockType = i32(input.blockType + 0.5);
  let progress = uniforms.progress;

  // Block type colors:
  // 0 = dirt/path (QR light) - tan/brown, should read as "light" when flat
  // 1 = cherry blossom (QR dark in canopy) - vivid pink, reads as "dark" when flat
  // 2 = trunk (QR dark at center) - dark brown, reads as "dark" when flat
  // 3 = grass (QR dark outside tree) - dark green, reads as "dark" when flat

  // DIRT/PATH colors (QR light modules) - light tan/beige
  let dirtLight = vec3f(0.88, 0.82, 0.72);
  let dirtMid = vec3f(0.78, 0.70, 0.58);
  let dirtDark = vec3f(0.65, 0.55, 0.42);

  // CHERRY BLOSSOM colors - vivid sakura pink (more saturated)
  let sakuraBright = vec3f(1.0, 0.72, 0.78);    // Bright pink
  let sakuraMid = vec3f(0.98, 0.58, 0.68);      // Medium pink - more saturated
  let sakuraDeep = vec3f(0.95, 0.48, 0.58);     // Deeper pink
  let sakuraRich = vec3f(0.88, 0.38, 0.50);     // Rich magenta accent

  // Accent colors - reduced percentages
  let petalWhite = vec3f(1.0, 0.92, 0.94);      // Soft white petals (~5%)
  let greenLeaf = vec3f(0.40, 0.62, 0.35);      // Green leaf accents (~8%)
  let greenDark = vec3f(0.30, 0.52, 0.28);      // Darker green

  // TRUNK colors (QR dark modules) - rich brown bark
  let barkDark = vec3f(0.22, 0.14, 0.08);
  let barkMid = vec3f(0.38, 0.24, 0.14);
  let barkLight = vec3f(0.48, 0.32, 0.20);

  // GRASS colors (QR dark modules) - dark green
  let grassDark = vec3f(0.22, 0.38, 0.15);
  let grassMid = vec3f(0.32, 0.52, 0.22);
  let grassBright = vec3f(0.42, 0.62, 0.28);

  let seed = vec2f(input.col, input.row);
  var albedo = vec3f(0.5);

  // Lighting
  let sunDir = normalize(vec3f(0.6, 0.8, 0.4));
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let ambient = vec3f(0.35, 0.38, 0.45);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let bounce = ${wgslVec3(PALETTE.bounce)};

  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, vec3f(0.0, 1.0, 0.0)), 0.0);

  // 8x8 pixelation for Minecraft look - 3 noise layers for complex patterns
  let px = floor(uv.x * 8.0);
  let py = floor(uv.y * 8.0);
  let blockSeed = seed.x * 17.3 + seed.y * 31.1;
  let noise1 = fract(sin(px * 127.1 + py * 311.7 + blockSeed) * 43758.5);
  let noise2 = fract(sin(px * 73.3 + py * 157.1 + blockSeed * 1.7) * 43758.5);
  let noise3 = fract(sin(px * 43.7 + py * 97.3 + blockSeed * 2.3) * 43758.5);

  if (input.faceNy > 0.5) {
    // TOP FACE - this is what QR scanner sees when flat
    let topWarmTint = vec3f(1.04, 1.02, 0.98);

    if (blockType == 0) {
      // DIRT/PATH TOP (QR light) - light tan, reads as light
      var dirtColor = dirtMid;
      if (noise1 < 0.3) { dirtColor = dirtLight; }
      else if (noise1 > 0.7) { dirtColor = dirtDark; }

      // Stone pattern
      let gridX = fract(uv.x * 3.0);
      let gridY = fract(uv.y * 3.0);
      let isMortar = gridX < 0.1 || gridX > 0.9 || gridY < 0.1 || gridY > 0.9;
      if (isMortar) { dirtColor *= 0.85; }

      albedo = dirtColor * topWarmTint;
    } else if (blockType == 1) {
      // CHERRY BLOSSOM TOP - vivid sakura with Minecraft-style texture

      // Color distribution using noise1
      var cherryColor = sakuraMid;  // Base
      if (noise1 < 0.22) { cherryColor = sakuraBright; }      // 22% bright
      else if (noise1 < 0.45) { cherryColor = sakuraMid; }    // 23% mid
      else if (noise1 < 0.70) { cherryColor = sakuraDeep; }   // 25% deep
      else { cherryColor = sakuraRich; }                       // 30% rich

      // Green leaf accents (8%) using noise2
      if (noise2 > 0.92) {
        if (noise3 > 0.5) {
          cherryColor = greenLeaf;
        } else {
          cherryColor = greenDark;
        }
      }

      // White petal highlights (5%) using noise3
      if (noise3 > 0.95 && noise2 < 0.92) {
        cherryColor = petalWhite;
      }

      // Saturation boost for vibrancy
      let gray = dot(cherryColor, vec3f(0.299, 0.587, 0.114));
      cherryColor = mix(vec3f(gray), cherryColor, 1.4) * 1.08;

      albedo = cherryColor * topWarmTint;
    } else if (blockType == 2) {
      // TRUNK TOP (QR dark) - brown bark
      var barkColor = barkMid;
      if (noise1 < 0.35) { barkColor = barkDark; }
      else if (noise1 > 0.7) { barkColor = barkLight; }

      albedo = barkColor * topWarmTint;
    } else {
      // GRASS TOP (QR dark) - green
      var grassColor = grassMid;
      if (noise1 < 0.3) { grassColor = grassBright; }
      else if (noise1 > 0.75) { grassColor = grassDark; }

      albedo = grassColor * topWarmTint;
    }

  } else if (abs(input.faceNz) > 0.5 || abs(input.faceNx) > 0.5) {
    // SIDE FACES
    let isFront = input.faceNz > 0.5;
    let shade = select(0.65, 0.85, isFront);
    let tint = select(vec3f(0.90, 0.92, 0.98), vec3f(0.98, 0.98, 0.98), isFront);

    if (blockType == 0) {
      // DIRT SIDE
      var dirtColor = dirtMid;
      if (noise1 > 0.6) { dirtColor = dirtDark; }
      albedo = dirtColor * shade * tint;
    } else if (blockType == 1) {
      // CHERRY BLOSSOM SIDE - vivid sakura with texture
      var cherryColor = sakuraMid;
      if (noise1 < 0.22) { cherryColor = sakuraBright; }
      else if (noise1 < 0.45) { cherryColor = sakuraMid; }
      else if (noise1 < 0.70) { cherryColor = sakuraDeep; }
      else { cherryColor = sakuraRich; }

      // Green leaf accents on sides too (8%)
      if (noise2 > 0.92) {
        cherryColor = select(greenLeaf, greenDark, noise3 > 0.5);
      }

      // White petal highlights (5%)
      if (noise3 > 0.95 && noise2 < 0.92) {
        cherryColor = petalWhite;
      }

      // Saturation boost
      let gray = dot(cherryColor, vec3f(0.299, 0.587, 0.114));
      cherryColor = mix(vec3f(gray), cherryColor, 1.4) * 1.08;

      albedo = cherryColor * shade * tint;
    } else if (blockType == 2) {
      // TRUNK SIDE - bark with vertical grooves
      let barkX = fract(uv.x * 4.0);
      let barkY = fract(uv.y * 6.0);
      let groove = smoothstep(0.0, 0.2, barkX) * smoothstep(1.0, 0.8, barkX);

      var barkColor = barkMid;
      if (noise1 < 0.35) { barkColor = barkDark; }
      else if (noise1 > 0.7) { barkColor = barkLight; }

      barkColor = mix(barkDark * 0.7, barkColor, groove);
      albedo = barkColor * shade * tint;
    } else {
      // GRASS SIDE - dirt below grass line
      let grassLine = 0.7;
      if (uv.y > grassLine) {
        var grassColor = grassMid;
        if (noise1 < 0.35) { grassColor = grassBright; }
        else if (noise1 > 0.7) { grassColor = grassDark; }
        albedo = grassColor * shade * tint;
      } else {
        var dirtColor = dirtMid * 0.7;
        if (noise1 > 0.6) { dirtColor = dirtDark * 0.7; }
        albedo = dirtColor * shade * tint;
      }
    }
  } else {
    // BOTTOM FACE
    let bottomTint = vec3f(0.6, 0.62, 0.7);
    if (blockType == 0) {
      albedo = dirtDark * 0.5 * bottomTint;
    } else if (blockType == 1) {
      albedo = sakuraDeep * 0.5 * bottomTint;
    } else if (blockType == 2) {
      albedo = barkDark * 0.5 * bottomTint;
    } else {
      albedo = grassDark * 0.5 * bottomTint;
    }
  }

  // Final lighting
  let diffuse = albedo * (ambient + sunCol * NdSun * 0.65 + skyFill * NdUp * 0.25 + bounce * 0.2);
  var hdr = diffuse;

  hdr = acesFilm(hdr * 1.05);
  hdr = pow(hdr, vec3f(1.0 / 2.2));

  return vec4f(hdr, 1.0);
}
`;

// Sky shaders
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

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let zenith = ${wgslVec3(PALETTE.skyZenith)};
  let horizon = ${wgslVec3(PALETTE.skyHorizon)};

  let t = pow(uv.y, 0.7);
  var sky = mix(horizon, zenith, t);

  sky = pow(sky, vec3f(1.0 / 2.2));

  return vec4f(sky, 1.0);
}
`;

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const CherryBlossomQRCode = () => {
  const [qrContent, setQrContent] = useState(DEFAULT_QR_CONTENT);
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isFlat = useRef(false);
  const progressRef = useRef(0);
  const rawProgressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  const deviceRef = useRef<GPUDevice | null>(null);
  const typeBufferRef = useRef<GPUBuffer | null>(null);
  const posBufferRef = useRef<GPUBuffer | null>(null);
  const heightBufferRef = useRef<GPUBuffer | null>(null);
  const baseYBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{
    numBlocks: number;
    gridSize: number;
  }>({
    numBlocks: 0,
    gridSize: 0,
  });
  const qrContentRef = useRef(qrContent);
  qrContentRef.current = qrContent;

  const handlePress = useCallback(() => {
    isFlat.current = !isFlat.current;
  }, []);

  useEffect(() => {
    const device = deviceRef.current;
    const typeBuffer = typeBufferRef.current;
    const posBuffer = posBufferRef.current;
    const heightBuffer = heightBufferRef.current;
    const baseYBuffer = baseYBufferRef.current;

    if (!device || !typeBuffer || !posBuffer || !heightBuffer || !baseYBuffer) return;

    const qrMatrix = generateQRMatrix(qrContent);
    const { positions, heights, baseY, types, gridSize, numBlocks } =
      generateBlockData(qrMatrix);

    blockDataRef.current = { numBlocks, gridSize };

    const paddedTypes = new Uint32Array(MAX_BLOCKS);
    paddedTypes.set(types);
    device.queue.writeBuffer(typeBuffer, 0, paddedTypes);

    const paddedPositions = new Float32Array(MAX_BLOCKS * 4);
    paddedPositions.set(positions);
    device.queue.writeBuffer(posBuffer, 0, paddedPositions);

    const paddedHeights = new Float32Array(MAX_BLOCKS);
    paddedHeights.set(heights);
    device.queue.writeBuffer(heightBuffer, 0, paddedHeights);

    const paddedBaseY = new Float32Array(MAX_BLOCKS);
    paddedBaseY.set(baseY);
    device.queue.writeBuffer(baseYBuffer, 0, paddedBaseY);
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

    const qrMatrix = generateQRMatrix(qrContentRef.current);
    const { positions, heights, baseY, types, gridSize, numBlocks } =
      generateBlockData(qrMatrix);
    blockDataRef.current = { numBlocks, gridSize };

    const uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const typeBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    typeBufferRef.current = typeBuffer;
    const paddedTypes = new Uint32Array(MAX_BLOCKS);
    paddedTypes.set(types);
    device.queue.writeBuffer(typeBuffer, 0, paddedTypes);

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

    const baseYBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    baseYBufferRef.current = baseYBuffer;
    const paddedBaseY = new Float32Array(MAX_BLOCKS);
    paddedBaseY.set(baseY);
    device.queue.writeBuffer(baseYBuffer, 0, paddedBaseY);

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: typeBuffer } },
        { binding: 2, resource: { buffer: posBuffer } },
        { binding: 3, resource: { buffer: heightBuffer } },
        { binding: 4, resource: { buffer: baseYBuffer } },
      ],
    });

    const skyBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const skyBindGroup = device.createBindGroup({
      layout: skyBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const skyPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [skyBindGroupLayout] }),
      vertex: { module: device.createShaderModule({ code: skyVertexShader }), entryPoint: 'main' },
      fragment: {
        module: device.createShaderModule({ code: skyFragmentShader }),
        entryPoint: 'main',
        targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { depthWriteEnabled: false, depthCompare: 'always', format: 'depth24plus' },
    });

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: device.createShaderModule({ code: vertexShader }), entryPoint: 'main' },
      fragment: {
        module: device.createShaderModule({ code: fragmentShader }),
        entryPoint: 'main',
        targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspectRatio = canvas.width / canvas.height;

    const render = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      const target = isFlat.current ? 1 : 0;
      rawProgressRef.current += (target - rawProgressRef.current) * Math.min(1, LERP_SPEED * dt);
      if (Math.abs(rawProgressRef.current - target) < 0.001) {
        rawProgressRef.current = target;
      }
      progressRef.current = easeInOutCubic(rawProgressRef.current);

      const time = (now - startTimeRef.current) / 1000;
      const { numBlocks, gridSize } = blockDataRef.current;

      const uniformData = new Float32Array([
        aspectRatio, time, numBlocks, progressRef.current, gridSize, 0, 0, 0,
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
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
      renderPass.draw(36 * numBlocks);

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
        accessibilityLabel="Cherry blossom tree QR code"
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
