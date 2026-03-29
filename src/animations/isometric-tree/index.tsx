import {
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef } from 'react';

import { Canvas, CanvasRef } from 'react-native-wgpu';

// Voxel types
const EMPTY = 0;
const STONE_DARK = 1;
const STONE_MID = 2;
const STONE_LIGHT = 3;
const DIRT = 4;
const GRASS_DARK = 5;
const GRASS_MID = 6;
const TRUNK_DARK = 7;
const TRUNK_LIGHT = 8;
const LEAVES = 9;
const FLOWER_PINK = 10;
const FLOWER_YELLOW = 11;
const FLOWER_RED = 12;
const GRASS_LIGHT = 13;
const GRASS_YELLOW = 14;

const WORLD_SIZE = 26;
const WORLD_HEIGHT = 38;

// Seeded random for consistent generation
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate the voxel world
function generateVoxels(): number[] {
  const voxels: number[] = new Array(
    WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT,
  ).fill(EMPTY);

  const setVoxel = (x: number, y: number, z: number, type: number) => {
    if (
      x >= 0 &&
      x < WORLD_SIZE &&
      y >= 0 &&
      y < WORLD_HEIGHT &&
      z >= 0 &&
      z < WORLD_SIZE
    ) {
      voxels[x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE] = type;
    }
  };

  const getVoxel = (x: number, y: number, z: number): number => {
    if (
      x >= 0 &&
      x < WORLD_SIZE &&
      y >= 0 &&
      y < WORLD_HEIGHT &&
      z >= 0 &&
      z < WORLD_SIZE
    ) {
      return voxels[x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE];
    }
    return EMPTY;
  };

  const centerX = WORLD_SIZE / 2;
  const centerZ = WORLD_SIZE / 2;
  const baseY = 8;

  // Generate island with terraced layers
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const dx = x - centerX + 0.5;
      const dz = z - centerZ + 0.5;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const seed = x * 100 + z;

      // Island radius with noise
      const noise =
        seededRandom(seed) * 1.5 +
        Math.sin(x * 0.35) * Math.cos(z * 0.35) * 1.0;
      const maxRadius = 11 + noise;

      if (dist < maxRadius) {
        // Terrain height with variation for terraces
        const heightNoise =
          seededRandom(seed + 1000) * 2 +
          Math.sin(x * 0.3) * Math.cos(z * 0.5) * 1.5;
        const terrainHeight = baseY + Math.floor(heightNoise);

        // Stone stalactites hanging below
        const stalactiteLength = Math.floor(
          4 + seededRandom(seed + 2000) * 4 + (maxRadius - dist) * 0.4,
        );
        for (let y = baseY - stalactiteLength; y < baseY - 2; y++) {
          if (y >= 0 && dist < maxRadius - (baseY - y) * 0.6) {
            const stoneType =
              y < baseY - stalactiteLength + 2
                ? STONE_LIGHT
                : y < baseY - stalactiteLength + 4
                  ? STONE_MID
                  : STONE_DARK;
            setVoxel(x, y, z, stoneType);
          }
        }

        // Dirt layer
        for (let y = baseY - 2; y < terrainHeight; y++) {
          setVoxel(x, y, z, DIRT);
        }

        // Grass layers with terracing and VISIBLE color patches
        const grassLayers = 1 + Math.floor(seededRandom(seed + 3000) * 2);
        for (let layer = 0; layer < grassLayers; layer++) {
          const y = terrainHeight + layer;
          if (dist < maxRadius - layer * 1.8) {
            // Create color patches using position-based pattern
            const patchX = Math.floor(x / 3);
            const patchZ = Math.floor(z / 3);
            const patchSeed = patchX * 17 + patchZ * 31 + layer * 7;
            const patchRand = seededRandom(patchSeed);

            let grassType: number;
            if (patchRand < 0.3) {
              grassType = GRASS_DARK;
            } else if (patchRand < 0.55) {
              grassType = GRASS_MID;
            } else if (patchRand < 0.8) {
              grassType = GRASS_LIGHT;
            } else {
              grassType = GRASS_YELLOW;
            }
            setVoxel(x, y, z, grassType);
          }
        }
      }
    }
  }

  // Add flowers and small decorations on grass
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const seed = x * 100 + z + 5000;
      for (let y = baseY; y < baseY + 6; y++) {
        const below = getVoxel(x, y, z);
        const above = getVoxel(x, y + 1, z);
        if (
          (below === GRASS_LIGHT ||
            below === GRASS_DARK ||
            below === GRASS_MID ||
            below === GRASS_YELLOW) &&
          above === EMPTY
        ) {
          if (seededRandom(seed + y) < 0.08) {
            const flowerType =
              seededRandom(seed + y + 100) < 0.5 ? FLOWER_PINK : FLOWER_YELLOW;
            setVoxel(x, y + 1, z, flowerType);
          }
        }
      }
    }
  }

  // Generate tree trunk with gradient
  const trunkX = Math.floor(centerX);
  const trunkZ = Math.floor(centerZ);
  const trunkBase = baseY + 3;
  const trunkHeight = 10;

  for (let y = trunkBase; y < trunkBase + trunkHeight; y++) {
    // Gradient: light at bottom, dark at top (like reference)
    const trunkType = y > trunkBase + 6 ? TRUNK_DARK : TRUNK_LIGHT;
    setVoxel(trunkX, y, trunkZ, trunkType);

    // Wider at base - use light trunk color for base
    const baseType = y < trunkBase + 4 ? TRUNK_LIGHT : trunkType;
    if (y < trunkBase + 4) {
      setVoxel(trunkX + 1, y, trunkZ, baseType);
      setVoxel(trunkX - 1, y, trunkZ, baseType);
      setVoxel(trunkX, y, trunkZ + 1, baseType);
      setVoxel(trunkX, y, trunkZ - 1, baseType);
    }
    if (y < trunkBase + 2) {
      setVoxel(trunkX + 1, y, trunkZ + 1, baseType);
      setVoxel(trunkX - 1, y, trunkZ + 1, baseType);
      setVoxel(trunkX + 1, y, trunkZ - 1, baseType);
      setVoxel(trunkX - 1, y, trunkZ - 1, baseType);
    }
  }

  // Generate spherical foliage - sparser, more organic
  const foliageCenterY = trunkBase + trunkHeight + 3;
  const foliageRadius = 7;

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const dx = x - centerX;
        const dy = (y - foliageCenterY) * 1.1;
        const dz = z - centerZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const seed = x * 1000 + y * 100 + z;
        const noise =
          seededRandom(seed) * 2.0 +
          Math.sin(x * 0.8) * Math.cos(z * 0.8) * 1.5;

        // Sparse foliage - skip some cubes for organic look
        const skipChance = seededRandom(seed + 500);
        if (dist < foliageRadius + noise && dist > 3 && skipChance > 0.25) {
          if (getVoxel(x, y, z) === EMPTY) {
            setVoxel(x, y, z, LEAVES);
          }
        }
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

// Colors for each voxel type (RGB) - VIVID saturated palette like reference
fn getVoxelColor(voxelType: u32) -> vec3f {
  switch(voxelType) {
    case 1u: { return vec3f(0.4, 0.4, 0.45); }    // Stone dark
    case 2u: { return vec3f(0.6, 0.6, 0.65); }    // Stone mid
    case 3u: { return vec3f(0.85, 0.85, 0.9); }   // Stone light/white
    case 4u: { return vec3f(0.9, 0.75, 0.4); }    // Dirt - golden yellow
    case 5u: { return vec3f(0.3, 0.65, 0.35); }   // Grass dark green
    case 6u: { return vec3f(0.4, 0.75, 0.45); }   // Grass mid green
    case 7u: { return vec3f(0.3, 0.28, 0.26); }   // Trunk dark gray
    case 8u: { return vec3f(0.7, 0.68, 0.65); }   // Trunk light gray/white
    case 9u: { return vec3f(1.0, 0.55, 0.5); }    // Leaves - VIVID coral salmon
    case 10u: { return vec3f(1.0, 0.5, 0.45); }   // Flower coral
    case 11u: { return vec3f(1.0, 0.9, 0.35); }   // Flower bright yellow
    case 12u: { return vec3f(0.95, 0.35, 0.35); } // Flower red
    case 13u: { return vec3f(0.45, 0.8, 0.5); }   // Grass light green
    case 14u: { return vec3f(0.55, 0.85, 0.45); } // Grass bright green
    default: { return vec3f(1.0, 0.0, 1.0); }     // Error
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
  let cubeSize = 0.014;

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  // Cube scale < 1.0 creates gaps between cubes (key for that polished look!)
  let cs = 0.82; // cube scale - smaller = bigger gaps
  let h = cs * 0.5; // half size

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
  worldPos.x -= f32(${WORLD_SIZE}) * cubeSize * 0.5;
  worldPos.z -= f32(${WORLD_SIZE}) * cubeSize * 0.5;
  worldPos.y -= f32(${WORLD_HEIGHT}) * cubeSize * 0.4;

  // Gentle animation for leaves (type 9)
  if (voxelType == 9u) {
    let wave = sin(uniforms.time * 1.5 + voxelPos.x * 0.3 + voxelPos.z * 0.3) * 0.001;
    worldPos.x += wave;
  }

  // Rotation animation
  let rotSpeed = 0.06;
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

  // Light direction (from top-left)
  let lightDir = normalize(vec3f(-0.5, 0.9, 0.3));

  // Calculate shading - more contrast for realistic shadows
  let diffuse = max(dot(rotatedNormal, lightDir), 0.0);
  let ambient = 0.3;
  // Boost top faces for that clean isometric look
  let topBoost = max(faceNormal.y, 0.0) * 0.25;
  let shade = ambient + diffuse * 0.6 + topBoost;

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

export const IsometricTree = () => {
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
      for (let z = 0; z < WORLD_SIZE; z++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
          const idx = x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE;
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

      const uniformData = new Float32Array([aspectRatio, time, numVoxels, 0]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
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
  container: { backgroundColor: '#050508', flex: 1 },
});
