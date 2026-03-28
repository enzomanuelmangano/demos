import React, { useCallback, useEffect, useRef } from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Canvas, CanvasRef } from 'react-native-wgpu';

// Voxel types - GitHub green levels (0 = empty, 1-4 = contribution levels)
const EMPTY = 0;
const GREEN_LEVEL_0 = 1; // Lightest - no/few contributions
const GREEN_LEVEL_1 = 2;
const GREEN_LEVEL_2 = 3;
const GREEN_LEVEL_3 = 4; // Darkest - most contributions

// Grid dimensions (like GitHub: 52 weeks x 7 days)
const GRID_COLS = 40; // weeks
const GRID_ROWS = 7;  // days
const MAX_HEIGHT = 12; // max column height

const WORLD_SIZE_X = GRID_COLS;
const WORLD_SIZE_Z = GRID_ROWS;
const WORLD_HEIGHT = MAX_HEIGHT + 1;

// Seeded random for consistent generation
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate contribution data (simulating GitHub activity)
function generateContributions(): number[][] {
  const data: number[][] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    const week: number[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const seed = col * 100 + row;
      const rand = seededRandom(seed);

      // Create realistic-looking contribution patterns
      // More activity in certain "bursts"
      const burstFactor = Math.sin(col * 0.3) * 0.5 + 0.5;
      const weekendFactor = (row === 0 || row === 6) ? 0.3 : 1.0;
      const activity = rand * burstFactor * weekendFactor;

      // Convert to contribution level (0-4)
      let level: number;
      if (activity < 0.15) level = 0;
      else if (activity < 0.35) level = 1;
      else if (activity < 0.55) level = 2;
      else if (activity < 0.75) level = 3;
      else level = 4;

      week.push(level);
    }
    data.push(week);
  }

  return data;
}

// Pre-generate contribution data
const CONTRIBUTIONS = generateContributions();

// Generate the voxel world - 3D contribution chart
function generateVoxels(): number[] {
  const voxels: number[] = new Array(
    WORLD_SIZE_X * WORLD_SIZE_Z * WORLD_HEIGHT,
  ).fill(EMPTY);

  const setVoxel = (x: number, y: number, z: number, type: number) => {
    if (
      x >= 0 &&
      x < WORLD_SIZE_X &&
      y >= 0 &&
      y < WORLD_HEIGHT &&
      z >= 0 &&
      z < WORLD_SIZE_Z
    ) {
      voxels[x + z * WORLD_SIZE_X + y * WORLD_SIZE_X * WORLD_SIZE_Z] = type;
    }
  };

  // Build columns based on contribution data
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const level = CONTRIBUTIONS[col][row];

      // Height based on contribution level
      // Level 0 = 1 block, Level 4 = up to MAX_HEIGHT blocks
      const height = level === 0 ? 1 : Math.ceil((level / 4) * MAX_HEIGHT);

      // Color type based on level
      const colorType = level === 0 ? GREEN_LEVEL_0 : level;

      // Build the column
      for (let y = 0; y < height; y++) {
        setVoxel(col, y, row, colorType);
      }
    }
  }

  return voxels;
}

// Pre-generate voxels
const VOXELS = generateVoxels();

// Count non-empty voxels
let voxelCount = 0;
for (const v of VOXELS) {
  if (v !== EMPTY) voxelCount++;
}

const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  voxelCount: f32,
  padding: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) shade: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> voxelData: array<u32>;
@group(0) @binding(2) var<storage, read> voxelPositions: array<vec4f>;

// GitHub contribution green palette
fn getVoxelColor(voxelType: u32) -> vec3f {
  switch(voxelType) {
    case 1u: { return vec3f(0.80, 0.90, 0.75); }  // Level 0 - Lightest green
    case 2u: { return vec3f(0.60, 0.82, 0.55); }  // Level 1 - Light green
    case 3u: { return vec3f(0.40, 0.72, 0.40); }  // Level 2 - Medium green
    case 4u: { return vec3f(0.20, 0.55, 0.30); }  // Level 3 - Dark green
    default: { return vec3f(0.15, 0.45, 0.25); }  // Darkest
  }
}

// Rotate a vector around Y axis
fn rotateY(v: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let faceIndex = vertexIndex / 6u;
  let faceVertex = vertexIndex % 6u;

  let voxelInfo = voxelPositions[instanceIndex];
  let voxelType = voxelData[instanceIndex];
  let voxelPos = voxelInfo.xyz;

  // Cube size
  let cubeSize = 0.012;

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  // Cube scale < 1.0 creates small gaps between cubes
  let cs = 0.88;
  let h = cs * 0.5;

  switch(faceIndex) {
    case 0u: { // Top (+Y)
      localPos = vec3f((qv.x - 0.5) * cs, h, (qv.y - 0.5) * cs);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
    case 1u: { // Bottom (-Y)
      localPos = vec3f((qv.x - 0.5) * cs, -h, (0.5 - qv.y) * cs);
      faceNormal = vec3f(0.0, -1.0, 0.0);
    }
    case 2u: { // Front (+Z)
      localPos = vec3f((qv.x - 0.5) * cs, (qv.y - 0.5) * cs, h);
      faceNormal = vec3f(0.0, 0.0, 1.0);
    }
    case 3u: { // Back (-Z)
      localPos = vec3f((0.5 - qv.x) * cs, (qv.y - 0.5) * cs, -h);
      faceNormal = vec3f(0.0, 0.0, -1.0);
    }
    case 4u: { // Right (+X)
      localPos = vec3f(h, (qv.y - 0.5) * cs, (qv.x - 0.5) * cs);
      faceNormal = vec3f(1.0, 0.0, 0.0);
    }
    case 5u: { // Left (-X)
      localPos = vec3f(-h, (qv.y - 0.5) * cs, (0.5 - qv.x) * cs);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  // Scale and position
  var worldPos = voxelPos * cubeSize + localPos * cubeSize;

  // Center the model
  worldPos.x -= f32(${WORLD_SIZE_X}) * cubeSize * 0.5;
  worldPos.z -= f32(${WORLD_SIZE_Z}) * cubeSize * 0.5;
  worldPos.y -= f32(${WORLD_HEIGHT}) * cubeSize * 0.35;

  // Rotation animation
  let rotSpeed = 0.04;
  let angle = uniforms.time * rotSpeed;

  worldPos = rotateY(worldPos, angle);
  faceNormal = rotateY(faceNormal, angle);

  // Isometric projection - classic top-down view
  let isoAngleY = 0.785398; // 45° rotation
  let isoAngleX = -0.52; // ~30° looking down from above

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

  // Light direction (sculptural lighting from top-left)
  let lightDir = normalize(vec3f(-0.4, 0.85, 0.35));

  // Calculate shading
  let diffuse = max(dot(rotatedNormal, lightDir), 0.0);
  let ambient = 0.35;
  // Boost top faces for that clean isometric look
  let topBoost = max(faceNormal.y, 0.0) * 0.20;
  let shade = ambient + diffuse * 0.55 + topBoost;

  // Orthographic projection
  let scale = 1.8;
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.color = getVoxelColor(voxelType);
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

    // Prepare voxel data - only non-empty voxels
    const voxelTypes: number[] = [];
    const voxelPositions: number[] = [];

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        for (let x = 0; x < WORLD_SIZE_X; x++) {
          const idx = x + z * WORLD_SIZE_X + y * WORLD_SIZE_X * WORLD_SIZE_Z;
          const voxel = VOXELS[idx];
          if (voxel !== EMPTY) {
            voxelTypes.push(voxel);
            voxelPositions.push(x, y, z, 0); // vec4 for alignment
          }
        }
      }
    }

    const numVoxels = voxelTypes.length;

    // Create buffers
    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const voxelTypeBuffer = device.createBuffer({
      size: numVoxels * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(voxelTypeBuffer, 0, new Uint32Array(voxelTypes));

    const voxelPosBuffer = device.createBuffer({
      size: numVoxels * 16, // vec4f per voxel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      voxelPosBuffer,
      0,
      new Float32Array(voxelPositions),
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
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: voxelTypeBuffer } },
        { binding: 2, resource: { buffer: voxelPosBuffer } },
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

      const uniformData = new Float32Array([aspectRatio, time, numVoxels, 0]);
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
      // 36 vertices per cube (6 faces * 6 vertices), numVoxels instances
      renderPass.draw(36, numVoxels);
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
