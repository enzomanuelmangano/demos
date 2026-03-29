import {
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef } from 'react';

import { Canvas, CanvasRef } from 'react-native-wgpu';

// Grid dimensions - painting aspect ratio roughly 4:3
const GRID_COLS = 32;
const GRID_ROWS = 24;

// Color palette for Starry Night
const COLORS = {
  // Sky blues
  SKY_DARK: { r: 0.15, g: 0.2, b: 0.45 },
  SKY_MID: { r: 0.25, g: 0.35, b: 0.6 },
  SKY_LIGHT: { r: 0.4, g: 0.5, b: 0.75 },
  SKY_SWIRL: { r: 0.35, g: 0.45, b: 0.7 },
  // Stars/Moon yellows
  STAR_BRIGHT: { r: 0.98, g: 0.95, b: 0.7 },
  STAR_GLOW: { r: 0.9, g: 0.85, b: 0.55 },
  MOON_YELLOW: { r: 0.95, g: 0.88, b: 0.45 },
  // Cypress tree
  CYPRESS_DARK: { r: 0.08, g: 0.12, b: 0.1 },
  CYPRESS_MID: { r: 0.12, g: 0.18, b: 0.15 },
  // Village/ground
  VILLAGE_DARK: { r: 0.1, g: 0.12, b: 0.18 },
  HILLS_DARK: { r: 0.15, g: 0.18, b: 0.3 },
  HILLS_MID: { r: 0.2, g: 0.25, b: 0.4 },
};

type ColorKey = keyof typeof COLORS;

// Starry Night pixel map - each cell has [colorKey, heightMultiplier]
// Heights: 0.1 = low (village), 0.3 = medium (sky), 0.6 = swirls, 1.0 = stars/moon
function generateStarryNight(): Array<{ color: ColorKey; height: number }[]> {
  const map: Array<{ color: ColorKey; height: number }[]> = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const rowData: { color: ColorKey; height: number }[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      let color: ColorKey = 'SKY_MID';
      let height = 0.3;

      // === CYPRESS TREE (left side, tall dark flame shape) ===
      if (col >= 1 && col <= 4 && row >= 8) {
        const treeCenterX = 2.5;
        const distFromCenter = Math.abs(col - treeCenterX);
        const treeWidth = 1.5 + (row - 8) * 0.15; // wider at bottom

        if (distFromCenter < treeWidth) {
          color = row < 12 ? 'CYPRESS_MID' : 'CYPRESS_DARK';
          // Taller at center, shorter at edges
          height = 0.9 - distFromCenter * 0.2 - (row - 8) * 0.03;
          height = Math.max(0.5, height);
        }
      }

      // === MOON (top right, large yellow crescent) ===
      else if (col >= 26 && col <= 30 && row >= 1 && row <= 5) {
        const moonCenterX = 28;
        const moonCenterY = 3;
        const dist = Math.sqrt(
          Math.pow(col - moonCenterX, 2) + Math.pow(row - moonCenterY, 2),
        );
        if (dist < 2.5) {
          color = dist < 1.5 ? 'STAR_BRIGHT' : 'MOON_YELLOW';
          height = 1.0 - dist * 0.15;
        }
      }

      // === LARGE STARS ===
      // Star 1 - top left area
      else if (col >= 8 && col <= 10 && row >= 2 && row <= 4) {
        const dist = Math.sqrt(Math.pow(col - 9, 2) + Math.pow(row - 3, 2));
        if (dist < 1.5) {
          color = dist < 0.8 ? 'STAR_BRIGHT' : 'STAR_GLOW';
          height = 0.95 - dist * 0.2;
        }
      }
      // Star 2
      else if (col >= 13 && col <= 15 && row >= 4 && row <= 6) {
        const dist = Math.sqrt(Math.pow(col - 14, 2) + Math.pow(row - 5, 2));
        if (dist < 1.3) {
          color = dist < 0.7 ? 'STAR_BRIGHT' : 'STAR_GLOW';
          height = 0.9 - dist * 0.2;
        }
      }
      // Star 3
      else if (col >= 18 && col <= 20 && row >= 2 && row <= 4) {
        const dist = Math.sqrt(Math.pow(col - 19, 2) + Math.pow(row - 3, 2));
        if (dist < 1.2) {
          color = dist < 0.6 ? 'STAR_BRIGHT' : 'STAR_GLOW';
          height = 0.88;
        }
      }
      // Star 4
      else if (col >= 5 && col <= 7 && row >= 5 && row <= 7) {
        const dist = Math.sqrt(Math.pow(col - 6, 2) + Math.pow(row - 6, 2));
        if (dist < 1.2) {
          color = dist < 0.6 ? 'STAR_BRIGHT' : 'STAR_GLOW';
          height = 0.85;
        }
      }
      // Star 5 - smaller stars scattered
      else if (col === 23 && row === 6) {
        color = 'STAR_GLOW';
        height = 0.75;
      } else if (col === 11 && row === 8) {
        color = 'STAR_GLOW';
        height = 0.7;
      }

      // === SWIRLING SKY PATTERNS ===
      else if (row < 14) {
        // Create swirl patterns using sine waves
        const swirl1 =
          Math.sin(col * 0.5 + row * 0.3) * Math.cos(row * 0.4) * 0.5 + 0.5;
        const swirl2 =
          Math.sin(col * 0.3 - row * 0.5 + 2) * Math.cos(col * 0.2) * 0.5 + 0.5;
        const swirlIntensity = (swirl1 + swirl2) / 2;

        if (swirlIntensity > 0.65) {
          color = 'SKY_LIGHT';
          height = 0.45 + swirlIntensity * 0.2;
        } else if (swirlIntensity > 0.4) {
          color = 'SKY_SWIRL';
          height = 0.35 + swirlIntensity * 0.15;
        } else if (swirlIntensity > 0.25) {
          color = 'SKY_MID';
          height = 0.3 + swirlIntensity * 0.1;
        } else {
          color = 'SKY_DARK';
          height = 0.25;
        }
      }

      // === HILLS (bottom right, rolling dark shapes) ===
      else if (row >= 14 && row < 18) {
        const hillWave = Math.sin(col * 0.4) * 0.3 + 0.5;
        if (hillWave > 0.5) {
          color = 'HILLS_MID';
          height = 0.25 + hillWave * 0.1;
        } else {
          color = 'HILLS_DARK';
          height = 0.2;
        }
      }

      // === VILLAGE (bottom center) ===
      else if (row >= 18) {
        // Church steeple
        if (col >= 14 && col <= 16 && row >= 18 && row <= 20) {
          color = 'VILLAGE_DARK';
          height = 0.4 - (row - 18) * 0.05;
        }
        // Village buildings
        else if (col >= 10 && col <= 22) {
          color = 'VILLAGE_DARK';
          height = 0.15 + Math.random() * 0.05;
        } else {
          color = 'HILLS_DARK';
          height = 0.12;
        }
      }

      rowData.push({ color, height });
    }
    map.push(rowData);
  }

  return map;
}

const PAINTING_MAP = generateStarryNight();

// Generate block data from painting map
function generateBlockData(): {
  positions: number[];
  heights: number[];
  colors: number[];
} {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = []; // Will store RGB as 3 floats per block

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = PAINTING_MAP[row][col];

      positions.push(col, 0, row, 0);
      heights.push(cell.height);

      // Pack color index (we'll decode in shader)
      const colorData = COLORS[cell.color];
      // Store as packed RGB
      const packed =
        Math.floor(colorData.r * 255) * 65536 +
        Math.floor(colorData.g * 255) * 256 +
        Math.floor(colorData.b * 255);
      colors.push(packed);
    }
  }

  return { positions, heights, colors };
}

const BLOCK_DATA = generateBlockData();
const NUM_BLOCKS = GRID_COLS * GRID_ROWS;

const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  padding: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) shade: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;

// Unpack RGB from u32
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

  let faceIndex = vertexIndex / 6u;
  let faceVertex = vertexIndex % 6u;

  let blockPos = blockPositions[instanceIndex].xyz;
  let blockColorPacked = blockColors[instanceIndex];
  let blockHeight = blockHeights[instanceIndex];

  // Block dimensions
  let blockSize = 0.020;
  let maxHeight = 1.2;

  let height = max(blockHeight * maxHeight, 0.08);

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  let cs = 0.92; // gap between blocks
  let hw = cs * 0.5;
  let hh = height * 0.5;

  switch(faceIndex) {
    case 0u: { // Top
      localPos = vec3f((qv.x - 0.5) * cs, hh, (qv.y - 0.5) * cs);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
    case 1u: { // Bottom
      localPos = vec3f((qv.x - 0.5) * cs, -hh, (0.5 - qv.y) * cs);
      faceNormal = vec3f(0.0, -1.0, 0.0);
    }
    case 2u: { // Front
      localPos = vec3f((qv.x - 0.5) * cs, (qv.y - 0.5) * height, hw);
      faceNormal = vec3f(0.0, 0.0, 1.0);
    }
    case 3u: { // Back
      localPos = vec3f((0.5 - qv.x) * cs, (qv.y - 0.5) * height, -hw);
      faceNormal = vec3f(0.0, 0.0, -1.0);
    }
    case 4u: { // Right
      localPos = vec3f(hw, (qv.y - 0.5) * height, (qv.x - 0.5) * cs);
      faceNormal = vec3f(1.0, 0.0, 0.0);
    }
    case 5u: { // Left
      localPos = vec3f(-hw, (qv.y - 0.5) * height, (0.5 - qv.x) * cs);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  var worldPos = blockPos * blockSize + localPos * blockSize;
  worldPos.y += hh * blockSize;

  // Center the grid
  worldPos.x -= f32(${GRID_COLS}) * blockSize * 0.5;
  worldPos.z -= f32(${GRID_ROWS}) * blockSize * 0.5;

  // Static isometric view
  let isoAngleY = 0.78;
  let isoAngleX = -0.55;

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

  let lightDir = normalize(vec3f(-0.3, 0.9, 0.3));
  let diffuse = max(dot(rotatedNormal, lightDir), 0.0);
  let ambient = 0.5;
  let topBoost = max(faceNormal.y, 0.0) * 0.2;
  let shade = ambient + diffuse * 0.4 + topBoost;

  let scale = 1.0;
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.color = unpackColor(blockColorPacked);
  output.shade = shade;

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct FragmentInput {
  @location(0) color: vec3f,
  @location(1) shade: f32,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let shadedColor = input.color * input.shade;
  return vec4f(shadedColor, 1.0);
}
`;

export const IsometricStarryNight = () => {
  const { width, height } = useWindowDimensions();
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

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

    context.configure({ device, format, alphaMode: 'opaque' });

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

    const aspectRatio = width / height;

    const render = () => {
      const time = (Date.now() - startTimeRef.current) / 1000;

      const uniformData = new Float32Array([aspectRatio, time, NUM_BLOCKS, 0]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.08, g: 0.08, b: 0.15, a: 1 },
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
      <Canvas ref={canvasRef} style={styles.canvas} />
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  container: { backgroundColor: '#0D0D18', flex: 1 },
});
