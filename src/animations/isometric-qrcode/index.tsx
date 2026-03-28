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

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Muted masonry / concrete / glass — reads like real downtown blocks */
const BUILDING_PALETTE: RGB[] = [
  { r: 0.45, g: 0.47, b: 0.5 }, // Cast concrete
  { r: 0.38, g: 0.4, b: 0.44 }, // Weathered gray
  { r: 0.55, g: 0.53, b: 0.5 }, // Limestone
  { r: 0.42, g: 0.38, b: 0.36 }, // Brownstone
  { r: 0.32, g: 0.35, b: 0.4 }, // Curtain wall (blue-gray glass)
  { r: 0.36, g: 0.37, b: 0.39 }, // Steel frame
  { r: 0.48, g: 0.46, b: 0.44 }, // Sandstone
  { r: 0.34, g: 0.33, b: 0.35 }, // Charcoal brick
  { r: 0.4, g: 0.42, b: 0.45 }, // Cool granite
  { r: 0.44, g: 0.4, b: 0.38 }, // Warm brick
];

const FINDER_PALETTE: RGB[] = [
  { r: 0.58, g: 0.56, b: 0.52 }, // Landmark stone (still urban, not gold)
  { r: 0.52, g: 0.5, b: 0.48 },
];

/** Unused visually — ground voxels are discarded in the fragment shader */
const GROUND_COLOR: RGB = { r: 1.0, g: 1.0, b: 1.0 };

function isInFinderPattern(col: number, row: number, size: number): boolean {
  if (col < 7 && row < 7) return true;
  if (col >= size - 7 && row < 7) return true;
  if (col < 7 && row >= size - 7) return true;
  return false;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

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
      const isFinder = isInFinderPattern(col, row, GRID_SIZE);

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (isModule) {
        const rand = seededRandom(col * 137 + row * 311);

        if (isFinder) {
          const idx = Math.floor(
            seededRandom(col * 73 + row * 191) * FINDER_PALETTE.length,
          );
          color = FINDER_PALETTE[idx];
          height = 0.82 + rand * 0.22;
        } else {
          const idx = Math.floor(
            seededRandom(col * 59 + row * 223) * BUILDING_PALETTE.length,
          );
          color = BUILDING_PALETTE[idx];
          const tier = seededRandom(col * 419 + row * 167);
          if (tier > 0.9) {
            height = 0.92 + rand * 0.08;
          } else if (tier > 0.78) {
            height = 0.72 + rand * 0.2;
          } else if (tier > 0.38) {
            height = 0.38 + rand * 0.34;
          } else {
            height = 0.18 + rand * 0.22;
          }
        }
      } else {
        color = GROUND_COLOR;
        height = 0.03 + seededRandom(col * 41 + row * 83) * 0.02;
      }

      heights.push(height);
      colors.push(packRGB(color));
    }
  }

  return { positions, heights, colors };
}

const BLOCK_DATA = generateBlockData();
const NUM_BLOCKS = GRID_COLS * GRID_ROWS;

const NUM_PEDESTRIANS = 36;

function generatePedestrians(): Float32Array {
  const data = new Float32Array(NUM_PEDESTRIANS * 4);
  let i = 0;
  let guard = 0;
  while (i < NUM_PEDESTRIANS && guard < 8000) {
    guard += 1;
    const col = Math.floor(seededRandom(guard * 13) * GRID_COLS);
    const row = Math.floor(seededRandom(guard * 29) * GRID_ROWS);
    if (QR_MATRIX[row][col]) {
      continue;
    }
    const idx = i * 4;
    data[idx] = col;
    data[idx + 1] = row;
    data[idx + 2] = 0.35 + seededRandom(guard * 41) * 0.35;
    data[idx + 3] = seededRandom(guard * 97) * 628.3;
    i += 1;
  }
  while (i < NUM_PEDESTRIANS) {
    const idx = i * 4;
    data[idx] = 1;
    data[idx + 1] = 1;
    data[idx + 2] = 0.4;
    data[idx + 3] = 0;
    i += 1;
  }
  return data;
}

const PEDESTRIAN_DATA = generatePedestrians();

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

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let progress = uniforms.progress;
  let time = uniforms.time;

  let faceIndex = vertexIndex / 6u;
  let faceVertex = vertexIndex % 6u;

  let blockPos = blockPositions[instanceIndex].xyz;
  let blockColorPacked = blockColors[instanceIndex];
  let blockHeight = blockHeights[instanceIndex];

  let blockSize = 0.0245;
  let maxHeight = 2.35;
  let isBuilding = blockHeight > 0.1;

  let height3D = max(blockHeight * maxHeight, 0.06);
  let flatHeight = 0.06;
  let height = mix(height3D, flatHeight, progress);

  // Per-building shimmer: windows lighting up and glass reflections
  var shimmerVal = 0.0;
  if (isBuilding) {
    let bPos = vec2f(blockPos.x, blockPos.z);

    // Each building has unique phase and speed
    let phase1 = hash(bPos) * 6.2832;
    let speed1 = 0.4 + hash(bPos * 1.7) * 1.2;

    // Slow warm pulse (windows lighting up)
    let windowPulse = sin(time * speed1 + phase1) * 0.5 + 0.5;

    // Secondary rhythm at different frequency
    let phase2 = hash(bPos * 3.1) * 6.2832;
    let speed2 = 0.8 + hash(bPos * 2.3) * 0.8;
    let windowPulse2 = sin(time * speed2 + phase2) * 0.5 + 0.5;

    // Glass glint: sharp occasional sparkle
    let glintPhase = hash(bPos * 5.7) * 6.2832;
    let glintRaw = sin(time * 0.6 + glintPhase);
    let glint = pow(max(glintRaw, 0.0), 12.0);

    shimmerVal = windowPulse * 0.08 + windowPulse2 * 0.06 + glint * 0.22;
  }

  var localPos: vec3f;
  var faceNormal: vec3f;
  var facadeUv = vec2f(0.0);
  var faceVertical = 0.0;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  let cs = mix(0.988, 1.0, progress);
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

  // Low sun over the skyline — longer facades read more like a city canyon
  let lightAngle = time * 0.38;
  let lightDir = normalize(vec3f(
    cos(lightAngle) * 0.72,
    0.58,
    sin(lightAngle) * 0.72
  ));

  let diffuse = max(dot(rotatedNormal, lightDir), 0.0);
  let ambient = 0.32;
  let topBoost = max(faceNormal.y, 0.0) * 0.18;
  let shade = ambient + diffuse * 0.62 + topBoost;

  let scale = mix(1.0, 1.35, progress);
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
    1.0
  );

  output.color = unpackColor(blockColorPacked);
  output.shade = shade;
  output.shimmer = shimmerVal;
  output.building = select(0.0, 1.0, isBuilding);
  output.facadeUv = facadeUv;
  output.faceVertical = faceVertical;
  output.blockSeed = vec2f(blockPos.x, blockPos.z);
  output.faceNy = faceNormal.y;

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct FragmentInput {
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) shimmer: f32,
  @location(3) building: f32,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  if (input.building < 0.5) {
    discard;
  }

  let baseColor = input.color * input.shade;

  // Shimmer: lit windows + glass (warm evening city)
  let warmTint = vec3f(1.1, 1.03, 0.94);
  let glow = baseColor + input.shimmer * baseColor * warmTint;

  return vec4f(glow, 1.0);
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
      <Pressable style={styles.pressable} onPress={handlePress}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { backgroundColor: 'transparent', flex: 1 },
  container: { backgroundColor: 'transparent', flex: 1 },
  pressable: { flex: 1 },
});
