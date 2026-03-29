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
  skyZenith: { r: 0.82, g: 0.88, b: 0.92 },
  skyHorizon: { r: 0.91, g: 0.93, b: 0.91 },
  sun: { r: 1.15, g: 1.05, b: 0.95 },
  skyFill: { r: 0.85, g: 0.90, b: 0.95 },
  bounce: { r: 0.50, g: 0.65, b: 0.42 },
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
const MAX_BLOCKS = MAX_GRID_SIZE * MAX_GRID_SIZE * 18; // Extra blocks for dense foliage

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
  const blockSize = 0.0245; // Universal cube size - ALL blocks use this
  const cubeHeight = blockSize; // Same as width for perfect cubes

  const trunkRadius = 2.5; // Trunk radius
  const trunkLayers = 12; // Taller trunk
  const canopyBaseHeight = trunkLayers * cubeHeight; // Canopy sits on top of trunk
  const canopyOuterRadius = gridSize * 0.46;

  // Pseudo-random function for organic variation
  const pseudoRandom = (col: number, row: number, seed: number = 0) => {
    const s = Math.sin(col * 127.1 + row * 311.7 + seed * 43.7) * 43758.5;
    return s - Math.floor(s);
  };

  let blockCount = 0;

  // First pass: ground blocks (dirt, grass, trunk base)
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      positions.push(col, row, 0, 0);

      // ALL blocks use same cubeHeight for perfect cubes
      if (!isQrDark) {
        heights.push(cubeHeight);
        baseY.push(0);
        types.push(0); // dirt
      } else if (dist < trunkRadius) {
        heights.push(cubeHeight);
        baseY.push(0);
        types.push(2); // trunk base
      } else if (dist >= canopyOuterRadius) {
        heights.push(cubeHeight);
        baseY.push(0);
        types.push(3); // grass
      } else {
        heights.push(cubeHeight);
        baseY.push(0);
        types.push(4); // fallen petals under canopy (QR dark)
      }
      blockCount++;
    }
  }

  // Second pass: trunk blocks - only QR dark modules in trunk radius
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      if (!isQrDark) continue;

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < trunkRadius) {
        // Stack trunk blocks vertically (skip layer 0, already added)
        for (let layer = 1; layer < trunkLayers; layer++) {
          positions.push(col, row, 0, 0);
          heights.push(cubeHeight);
          baseY.push(layer * cubeHeight);
          types.push(2);
          blockCount++;
        }
      }
    }
  }

  // Third pass: dense canopy foliage - stacked vertically with NO gaps
  const maxLayers = 12; // Maximum vertical stack height - MORE DENSE

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isQrDark = qrMatrix[row][col];
      if (!isQrDark) continue;

      const dx = col - cx;
      const dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < canopyOuterRadius) {
        const t = 1 - dist / canopyOuterRadius; // 1 at center, 0 at edge

        // Dome shape: more layers near center, fewer at edges
        const layersHere = Math.max(3, Math.round(maxLayers * (0.25 + 0.75 * t * t)));

        // Stack CUBIC blocks vertically with no gaps - LEAVES ON TOP OF TRUNK TOO
        for (let layer = 0; layer < layersHere; layer++) {
          const layerY = canopyBaseHeight + layer * cubeHeight;

          // Slight dome curve - center is higher
          const domeOffset = Math.floor(t * 3) * cubeHeight;

          positions.push(col, row, 0, 0);
          heights.push(cubeHeight);
          baseY.push(layerY + domeOffset);
          types.push(1);
          blockCount++;
        }

        // Add extra blocks on top - STRICT GRID POSITIONING for QR code
        const extraCount = Math.floor(pseudoRandom(col, row, 500) * 4);
        for (let e = 0; e < extraCount; e++) {
          const extraLayer = layersHere + e;
          const domeOffset = Math.floor(t * 3) * cubeHeight;

          positions.push(col, row, 0, 0);
          heights.push(cubeHeight);
          baseY.push(canopyBaseHeight + extraLayer * cubeHeight + domeOffset);
          types.push(1);
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
  @location(8) layer: f32,
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
  output.layer = blockBaseY[blockIdx] / 0.0245; // Layer index for color variation

  let gridSize = uniforms.gridSize;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;
  let cubeSize = blockSize; // Perfect cubes - same size for all dimensions

  let baseX = col * blockSize - halfGrid;
  let baseY = blockBaseY[blockIdx]; // Starting Y position (elevated for canopy)
  let baseZ = row * blockSize - halfGrid;
  let h = cubeSize; // Use cubeSize for height - PERFECT CUBES
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
  @location(8) layer: f32,
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

  // DIRT/PATH colors (QR LIGHT modules) - very bright for scannability
  let dirtLight = vec3f(1.0, 0.98, 0.94);
  let dirtMid = vec3f(0.96, 0.94, 0.88);
  let dirtDark = vec3f(0.92, 0.88, 0.82);

  // CHERRY BLOSSOM colors (QR DARK modules) - vivid but dark
  let sakuraLight = vec3f(0.52, 0.18, 0.28);    // Light pink - more saturated
  let sakuraMid = vec3f(0.42, 0.12, 0.22);      // Medium pink
  let sakuraDeep = vec3f(0.32, 0.08, 0.16);     // Deep pink
  let sakuraRich = vec3f(0.24, 0.04, 0.12);     // Dark pink

  // TRUNK colors - richer browns
  let barkLight = vec3f(0.32, 0.18, 0.08);     // Light brown - warmer
  let barkMid = vec3f(0.26, 0.14, 0.05);       // Medium brown
  let barkDark = vec3f(0.20, 0.10, 0.03);      // Dark brown
  let barkDeep = vec3f(0.15, 0.07, 0.02);      // Deep brown

  // GRASS colors (QR DARK modules) - vivid but dark
  let grassDark = vec3f(0.06, 0.18, 0.04);
  let grassMid = vec3f(0.10, 0.28, 0.06);
  let grassBright = vec3f(0.15, 0.38, 0.10);

  let seed = vec2f(input.col, input.row);
  var albedo = vec3f(0.5);

  // Lighting - sun from top-left-front for isometric view
  let sunDir = normalize(vec3f(-0.5, 0.8, -0.5));
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let ambient = vec3f(0.35, 0.38, 0.45);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let bounce = ${wgslVec3(PALETTE.bounce)};

  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, vec3f(0.0, 1.0, 0.0)), 0.0);

  // Per-cube noise - includes layer for unique color per stacked cube
  let layer = input.layer;
  let blockSeed = seed.x * 17.3 + seed.y * 31.1 + layer * 73.7;
  let noise1 = fract(sin(blockSeed) * 43758.5);
  let noise2 = fract(sin(blockSeed * 1.7 + 127.1) * 43758.5);
  let noise3 = fract(sin(blockSeed * 2.3 + 311.7) * 43758.5);

  // Calculate tree shadow on platform
  let gridSize = uniforms.gridSize;
  let cx = gridSize * 0.5;
  let cy = gridSize * 0.5;

  // Offset shadow based on light direction (-0.5, 0.8, -0.5)
  // Light from top-left-front, so shadow shifts to bottom-right-back
  let shadowOffsetX = 1.5; // Shift shadow in +X direction
  let shadowOffsetY = 1.5; // Shift shadow in +Z direction

  let dx = input.col - (cx + shadowOffsetX);
  let dy = input.row - (cy + shadowOffsetY);
  let distFromShadowCenter = sqrt(dx * dx + dy * dy);

  // Canopy shadow - blocks under the canopy get darkened
  let canopyRadius = gridSize * 0.46;
  let trunkRadius = 2.5;
  // Shadow is stronger near center, fades toward canopy edge
  let shadowT = 1.0 - smoothstep(trunkRadius, canopyRadius, distFromShadowCenter);
  let treeShadow = 1.0 - shadowT * 0.35; // Up to 35% darker under canopy

  if (input.faceNy > 0.5) {
    // TOP FACE - brightest, this is what QR scanner sees when flat
    let topWarmTint = vec3f(1.1, 1.08, 1.02);

    if (blockType == 0) {
      // DIRT/PATH TOP (QR LIGHT) - stay bright, less variation
      var dirtColor = dirtMid;
      let t = noise1;
      if (t < 0.5) {
        dirtColor = mix(dirtLight, dirtMid, t / 0.5);
      } else {
        dirtColor = mix(dirtMid, dirtDark, (t - 0.5) / 0.5);
      }

      // Subtle variation - keep it light
      let shift = (noise2 - 0.5) * 0.1;
      dirtColor = dirtColor * (1.0 + shift);

      // Apply tree shadow to dirt under canopy
      dirtColor = dirtColor * treeShadow;

      albedo = dirtColor * topWarmTint;
    } else if (blockType == 1) {
      // CHERRY BLOSSOM TOP - rich tonal variation

      // Smooth continuous interpolation across full color range
      var cherryColor = sakuraMid;
      let t = noise1;

      // Smooth 4-stop gradient - coherent pink tones
      if (t < 0.33) {
        cherryColor = mix(sakuraLight, sakuraMid, t / 0.33);
      } else if (t < 0.66) {
        cherryColor = mix(sakuraMid, sakuraDeep, (t - 0.33) / 0.33);
      } else {
        cherryColor = mix(sakuraDeep, sakuraRich, (t - 0.66) / 0.34);
      }

      // Moderate variation to keep contrast
      let shift = (noise2 - 0.5) * 0.15;
      cherryColor = cherryColor * (1.0 + shift);

      albedo = cherryColor * topWarmTint;
    } else if (blockType == 2) {
      // TRUNK TOP - coherent brown variation with realistic shadows
      var barkColor = barkMid;
      let t = noise1;

      // Smooth 4-stop gradient
      if (t < 0.33) {
        barkColor = mix(barkLight, barkMid, t / 0.33);
      } else if (t < 0.66) {
        barkColor = mix(barkMid, barkDark, (t - 0.33) / 0.33);
      } else {
        barkColor = mix(barkDark, barkDeep, (t - 0.66) / 0.34);
      }

      // Strong variation for contrast
      let shift = (noise2 - 0.5) * 0.2;
      barkColor = barkColor * (1.0 + shift);

      // Height-based lighting - lower blocks are darker (ambient occlusion)
      let trunkMaxLayer = 12.0;
      let heightRatio = min(layer / trunkMaxLayer, 1.0);
      let aoShadow = 0.6 + heightRatio * 0.4; // 0.6 at base, 1.0 at top

      // Edge darkening for ambient occlusion on each cube
      let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      let edgeAO = 0.85 + smoothstep(0.0, 0.15, edgeDist) * 0.15;

      barkColor = barkColor * aoShadow * edgeAO;

      albedo = barkColor * topWarmTint;
    } else if (blockType == 3) {
      // GRASS TOP (QR dark) - mixed green and brownish tones
      let grassBrown = vec3f(0.28, 0.25, 0.12);   // Earthy brown (less red)
      let grassOlive = vec3f(0.32, 0.35, 0.15);   // Olive/dried grass

      var grassColor = grassMid;
      let t = noise1;
      if (t < 0.3) {
        grassColor = mix(grassBright, grassMid, t / 0.3);
      } else if (t < 0.6) {
        grassColor = mix(grassMid, grassDark, (t - 0.3) / 0.3);
      } else if (t < 0.8) {
        // Brownish patches
        grassColor = mix(grassDark, grassBrown, (t - 0.6) / 0.2);
      } else {
        // Olive dried grass
        grassColor = mix(grassBrown, grassOlive, (t - 0.8) / 0.2);
      }

      // Strong variation for contrast
      let shift = (noise2 - 0.5) * 0.2;
      grassColor = grassColor * (1.0 + shift);

      albedo = grassColor * topWarmTint;
    } else {
      // FALLEN PETALS (type 4) - random brown OR green, covered by canopy in 2D
      let brownLight = vec3f(0.52, 0.42, 0.30);
      let brownDark = vec3f(0.42, 0.32, 0.22);
      let greenLight = vec3f(0.38, 0.48, 0.28);
      let greenDark = vec3f(0.32, 0.42, 0.24);

      var fallenColor = brownLight;
      if (noise1 < 0.5) {
        // Brown block
        fallenColor = mix(brownLight, brownDark, noise2);
      } else {
        // Green block
        fallenColor = mix(greenLight, greenDark, noise2);
      }

      let shift = (noise2 - 0.5) * 0.15;
      fallenColor = fallenColor * (1.0 + shift);

      // Apply tree shadow
      fallenColor = fallenColor * treeShadow;

      albedo = fallenColor * topWarmTint;
    }

  } else if (abs(input.faceNz) > 0.5 || abs(input.faceNx) > 0.5) {
    // SIDE FACES - use actual sun direction for shading
    let faceN = normalize(vec3f(input.faceNx, input.faceNy, input.faceNz));
    let sunLight = max(dot(faceN, sunDir), 0.0);
    // Shade based on sun: 0.3 base + 0.65 from sun (stronger contrast)
    let shade = 0.3 + sunLight * 0.65;
    let tint = vec3f(0.95, 0.95, 0.98);

    if (blockType == 0) {
      // DIRT SIDE - high contrast
      var dirtColor = dirtMid;
      let t = noise1;
      if (t < 0.33) {
        dirtColor = mix(dirtLight, dirtMid, t / 0.33);
      } else if (t < 0.66) {
        dirtColor = mix(dirtMid, dirtDark, (t - 0.33) / 0.33);
      } else {
        dirtColor = dirtDark * (1.0 - (t - 0.66) * 0.3);
      }
      let shift = (noise2 - 0.5) * 0.2;
      dirtColor = dirtColor * (1.0 + shift);
      albedo = dirtColor * shade * tint;
    } else if (blockType == 1) {
      // CHERRY BLOSSOM SIDE - coherent pink tones
      var cherryColor = sakuraMid;
      let t = noise1;

      if (t < 0.33) {
        cherryColor = mix(sakuraLight, sakuraMid, t / 0.33);
      } else if (t < 0.66) {
        cherryColor = mix(sakuraMid, sakuraDeep, (t - 0.33) / 0.33);
      } else {
        cherryColor = mix(sakuraDeep, sakuraRich, (t - 0.66) / 0.34);
      }

      // Strong variation for contrast
      let shift = (noise2 - 0.5) * 0.25;
      cherryColor = cherryColor * (1.0 + shift);

      albedo = cherryColor * shade * tint;
    } else if (blockType == 2) {
      // TRUNK SIDE - high contrast brown with realistic shadows
      var barkColor = barkMid;
      let t = noise1;

      if (t < 0.33) {
        barkColor = mix(barkLight, barkMid, t / 0.33);
      } else if (t < 0.66) {
        barkColor = mix(barkMid, barkDark, (t - 0.33) / 0.33);
      } else {
        barkColor = mix(barkDark, barkDeep, (t - 0.66) / 0.34);
      }

      // Strong variation for contrast
      let shift = (noise2 - 0.5) * 0.2;
      barkColor = barkColor * (1.0 + shift);

      // Height-based lighting - lower blocks are darker
      let trunkMaxLayer = 12.0;
      let heightRatio = min(layer / trunkMaxLayer, 1.0);
      let aoShadow = 0.55 + heightRatio * 0.45; // Darker sides at base

      // Vertical gradient on side faces - darker at bottom of each cube
      let verticalAO = 0.75 + uv.y * 0.25;

      // Edge darkening for crevices between blocks
      let edgeDist = min(uv.x, 1.0 - uv.x);
      let edgeAO = 0.9 + smoothstep(0.0, 0.1, edgeDist) * 0.1;

      barkColor = barkColor * aoShadow * verticalAO * edgeAO;

      albedo = barkColor * shade * tint;
    } else if (blockType == 3) {
      // GRASS SIDE - mixed green and brownish tones
      let grassBrown = vec3f(0.28, 0.25, 0.12);   // Earthy brown (less red)
      let grassOlive = vec3f(0.32, 0.35, 0.15);   // Olive/dried grass

      var grassColor = grassMid;
      let t = noise1;
      if (t < 0.3) {
        grassColor = mix(grassBright, grassMid, t / 0.3);
      } else if (t < 0.6) {
        grassColor = mix(grassMid, grassDark, (t - 0.6) / 0.3);
      } else if (t < 0.8) {
        // Brownish patches
        grassColor = mix(grassDark, grassBrown, (t - 0.6) / 0.2);
      } else {
        // Olive dried grass
        grassColor = mix(grassBrown, grassOlive, (t - 0.8) / 0.2);
      }
      let shift = (noise2 - 0.5) * 0.2;
      grassColor = grassColor * (1.0 + shift);

      albedo = grassColor * shade * tint;
    } else {
      // FALLEN PETALS SIDE (type 4) - brown/green mix
      let fallenBrown = vec3f(0.45, 0.35, 0.26);
      let fallenGreen = vec3f(0.35, 0.42, 0.24);

      var fallenColor = mix(fallenBrown, fallenGreen, noise1 * 0.6);
      let shift = (noise2 - 0.5) * 0.15;
      fallenColor = fallenColor * (1.0 + shift);

      albedo = fallenColor * shade * tint;
    }
  } else {
    // BOTTOM FACE
    let bottomTint = vec3f(0.6, 0.62, 0.7);
    let fallenBottom = vec3f(0.45, 0.42, 0.32);
    if (blockType == 0) {
      albedo = dirtDark * 0.5 * bottomTint;
    } else if (blockType == 1) {
      albedo = sakuraDeep * 0.5 * bottomTint;
    } else if (blockType == 2) {
      albedo = barkDark * 0.5 * bottomTint;
    } else if (blockType == 3) {
      albedo = grassDark * 0.5 * bottomTint;
    } else {
      albedo = fallenBottom * 0.6 * bottomTint;
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
  // Consistent soft greenish-gray background matching container
  let bgColor = vec3f(0.91, 0.957, 0.91);

  // Very subtle gradient for depth
  let t = pow(uv.y, 0.5);
  var sky = mix(bgColor * 0.98, bgColor, t);

  sky = pow(sky, vec3f(1.0 / 2.2));

  return vec4f(sky, 1.0);
}
`;

// Shadow shaders - renders a soft elliptical shadow beneath the platform
const shadowVertexShader = /* wgsl */ `
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

struct ShadowOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vi: u32) -> ShadowOut {
  // Quad vertices centered at origin
  var quadVerts = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[vi];
  var o: ShadowOut;
  o.uv = qv * 0.5 + 0.5; // 0-1 UV

  // Shadow plane size - distant ground effect
  let gridSize = uniforms.gridSize;
  let blockSize = 0.0245;
  let halfGrid = gridSize * blockSize * 0.5;
  let shadowScale = 1.0; // Match platform size

  // Position in 3D space - FAR below the platform for levitation effect
  // Light comes from (-0.5, 0.8, -0.5), so shadow offsets toward (+x, +z)
  let progress = uniforms.progress;
  let shadowHeight = 0.45;
  let lightDirXZ = vec2f(-0.5, -0.5); // XZ components of sun direction
  // Offset fades out when going flat (looking straight down)
  let shadowOffset = -lightDirXZ * shadowHeight * 0.4 * (1.0 - progress);

  let localX = qv.x * halfGrid * shadowScale + shadowOffset.x;
  let localY = -shadowHeight;
  let localZ = qv.y * halfGrid * shadowScale + shadowOffset.y;

  // Apply same isometric rotation as blocks
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = localX * cy - localZ * sy;
  let ry_z = localX * sy + localZ * cy;
  let rx_y = localY * cx - ry_z * sx;
  let rx_z = localY * sx + ry_z * cx;

  let viewScale = mix(1.0, 1.35, progress);
  o.position = vec4f(
    ry_x * viewScale / uniforms.aspectRatio,
    rx_y * viewScale,
    0.99, // Behind everything but sky
    1.0
  );

  return o;
}
`;

const shadowFragmentShader = /* wgsl */ `
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
  // Center the UV
  let centered = uv * 2.0 - 1.0;

  // Soft circular distance - no visible shape edges
  let dist = length(centered);

  // Gaussian-like falloff for very soft blur
  let shadowStrength = 0.12;
  let falloff = exp(-dist * dist * 2.5); // Gaussian curve
  let alpha = shadowStrength * falloff;

  // Shadow color - slightly cool dark
  let shadowColor = vec3f(0.1, 0.12, 0.15);

  return vec4f(shadowColor * alpha, alpha);
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

    // Shadow pipeline - renders below the platform
    const shadowPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [skyBindGroupLayout] }),
      vertex: { module: device.createShaderModule({ code: shadowVertexShader }), entryPoint: 'main' },
      fragment: {
        module: device.createShaderModule({ code: shadowFragmentShader }),
        entryPoint: 'main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
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

      // Render shadow beneath platform
      renderPass.setPipeline(shadowPipeline);
      renderPass.setBindGroup(0, skyBindGroup);
      renderPass.draw(6);

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
