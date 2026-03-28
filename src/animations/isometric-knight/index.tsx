import React, { useCallback, useEffect, useRef } from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Canvas, CanvasRef } from 'react-native-wgpu';

// Grid dimensions - more square-shaped
const GRID_COLS = 20;
const GRID_ROWS = 14;

// Seeded random for consistent generation
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate terrain-like contribution heights (0.0 to 1.0)
function generateHeightMap(): number[][] {
  const data: number[][] = [];

  // Create mountain peaks at specific locations
  const peaks = [
    { x: 14, z: 8, strength: 1.0, spread: 5 },   // Main peak (right-back)
    { x: 15, z: 10, strength: 0.85, spread: 4 }, // Adjacent peak
    { x: 12, z: 6, strength: 0.7, spread: 4 },   // Connected ridge
    { x: 6, z: 10, strength: 0.5, spread: 4 },   // Left back hill
    { x: 4, z: 5, strength: 0.35, spread: 3 },   // Front left small
    { x: 10, z: 3, strength: 0.3, spread: 3 },   // Front middle small
    { x: 16, z: 4, strength: 0.4, spread: 3 },   // Front right
  ];

  for (let col = 0; col < GRID_COLS; col++) {
    const week: number[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      // Base height (minimum)
      let height = 0.08;

      // Add peak influences (gaussian-like falloff)
      for (const peak of peaks) {
        const dx = col - peak.x;
        const dz = row - peak.z;
        const dist = Math.sqrt(dx * dx + dz * dz * 2);
        const influence = Math.exp((-dist * dist) / (peak.spread * peak.spread)) * peak.strength;
        height += influence;
      }

      // Slight random variation
      height += seededRandom(col * 100 + row) * 0.08;

      // Clamp
      height = Math.min(1, height);

      week.push(height);
    }
    data.push(week);
  }

  return data;
}

// Pre-generate height data
const HEIGHT_MAP = generateHeightMap();

// We'll pass height data to shader - each position is ONE block with variable height
// Format: [x, z, height, colorLevel] for each grid cell
function generateBlockData(): { positions: number[]; heights: number[]; colors: number[] } {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const height = HEIGHT_MAP[col][row];

      positions.push(col, 0, row, 0); // x, y, z, padding

      // Height determines both the stretch AND the color
      heights.push(height);

      // Color level based on height (1-4)
      let colorLevel: number;
      if (height < 0.2) colorLevel = 1;
      else if (height < 0.4) colorLevel = 2;
      else if (height < 0.6) colorLevel = 3;
      else colorLevel = 4;
      colors.push(colorLevel);
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

// GitHub contribution green palette
fn getBlockColor(level: u32) -> vec3f {
  switch(level) {
    case 1u: { return vec3f(0.76, 0.88, 0.72); }  // Lightest green
    case 2u: { return vec3f(0.55, 0.78, 0.52); }  // Light green
    case 3u: { return vec3f(0.38, 0.66, 0.42); }  // Medium green
    case 4u: { return vec3f(0.22, 0.50, 0.32); }  // Dark green
    default: { return vec3f(0.76, 0.88, 0.72); }
  }
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
  let blockColor = blockColors[instanceIndex];
  let blockHeight = blockHeights[instanceIndex];

  // Block size in world units
  let blockSize = 0.022;
  let maxHeight = 1.8; // Tall peaks like mountains

  // Scale height (0-1 range to actual height)
  let height = max(blockHeight * maxHeight, 0.12); // minimum height for base blocks

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  // Block scale (gap between blocks)
  let cs = 0.90;
  let hw = cs * 0.5; // half width
  let hh = height * 0.5; // half height (variable)

  switch(faceIndex) {
    case 0u: { // Top (+Y)
      localPos = vec3f((qv.x - 0.5) * cs, hh, (qv.y - 0.5) * cs);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
    case 1u: { // Bottom (-Y)
      localPos = vec3f((qv.x - 0.5) * cs, -hh, (0.5 - qv.y) * cs);
      faceNormal = vec3f(0.0, -1.0, 0.0);
    }
    case 2u: { // Front (+Z)
      localPos = vec3f((qv.x - 0.5) * cs, (qv.y - 0.5) * height, hw);
      faceNormal = vec3f(0.0, 0.0, 1.0);
    }
    case 3u: { // Back (-Z)
      localPos = vec3f((0.5 - qv.x) * cs, (qv.y - 0.5) * height, -hw);
      faceNormal = vec3f(0.0, 0.0, -1.0);
    }
    case 4u: { // Right (+X)
      localPos = vec3f(hw, (qv.y - 0.5) * height, (qv.x - 0.5) * cs);
      faceNormal = vec3f(1.0, 0.0, 0.0);
    }
    case 5u: { // Left (-X)
      localPos = vec3f(-hw, (qv.y - 0.5) * height, (0.5 - qv.x) * cs);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  // World position
  var worldPos = blockPos * blockSize + localPos * blockSize;
  worldPos.y += hh * blockSize; // Lift blocks so they sit on ground

  // Center the grid
  worldPos.x -= f32(${GRID_COLS}) * blockSize * 0.5;
  worldPos.z -= f32(${GRID_ROWS}) * blockSize * 0.5;

  // NO rotation - static view
  // Isometric camera angle (looking at the terrain from corner)
  let isoAngleY = 0.75; // ~43° rotation
  let isoAngleX = -0.50; // Looking down at the terrain

  let cy = cos(isoAngleY);
  let sy = sin(isoAngleY);
  let cx = cos(isoAngleX);
  let sx = sin(isoAngleX);

  // Apply isometric rotation to position
  let ry_x = worldPos.x * cy - worldPos.z * sy;
  let ry_z = worldPos.x * sy + worldPos.z * cy;
  let rx_y = worldPos.y * cx - ry_z * sx;
  let rx_z = worldPos.y * sx + ry_z * cx;

  // Apply isometric rotation to normal for lighting
  let ny_x = faceNormal.x * cy - faceNormal.z * sy;
  let ny_z = faceNormal.x * sy + faceNormal.z * cy;
  let nx_y = faceNormal.y * cx - ny_z * sx;
  let nx_z = faceNormal.y * sx + ny_z * cx;
  let rotatedNormal = normalize(vec3f(ny_x, nx_y, nx_z));

  // Light direction (soft top-left lighting)
  let lightDir = normalize(vec3f(-0.3, 0.9, 0.3));

  // Calculate shading
  let diffuse = max(dot(rotatedNormal, lightDir), 0.0);
  let ambient = 0.45;
  let topBoost = max(faceNormal.y, 0.0) * 0.25;
  let shade = ambient + diffuse * 0.45 + topBoost;

  // Orthographic projection
  let scale = 0.9;
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.color = getBlockColor(blockColor);
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

export const IsometricKnight = () => {
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

    // Block data
    const { positions, heights, colors } = BLOCK_DATA;

    // Create buffers
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
      size: NUM_BLOCKS * 16, // vec4f per block
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(posBuffer, 0, new Float32Array(positions));

    const heightBuffer = device.createBuffer({
      size: NUM_BLOCKS * 4, // f32 per block
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
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
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
            clearValue: { r: 0.94, g: 0.93, b: 0.90, a: 1 },
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
      // 36 vertices per block (6 faces * 6 vertices), NUM_BLOCKS instances
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
  container: { backgroundColor: '#F0EDE6', flex: 1 },
});
