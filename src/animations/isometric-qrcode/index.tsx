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

/** One albedo for all built modules — finder vs data must not compete with the QR pattern */
const BUILDING_BASE: RGB = { r: 0.032, g: 0.034, b: 0.052 };

/** Normalized height for every built module — uniform slab so the QR grid reads clearly */
const BUILDING_HEIGHT = 0.72;

/** Unused visually — ground voxels are discarded in the fragment shader */
const GROUND_COLOR: RGB = { r: 1.0, g: 1.0, b: 1.0 };

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

      positions.push(col, 0, row, 0);

      let color: RGB;
      let height: number;

      if (isModule) {
        color = BUILDING_BASE;
        height = BUILDING_HEIGHT;
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
  let maxHeight = 3.25;
  let isBuilding = blockHeight > 0.1;

  let height3D = max(blockHeight * maxHeight, 0.06);
  let flatHeight = 0.06;
  let height = mix(height3D, flatHeight, progress);

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
  if (input.building < 0.5) {
    discard;
  }

  let t = uniforms.time;
  let uv = input.facadeUv;
  let base = input.color * input.shade;
  let wallTone = base * vec3f(0.92, 0.94, 1.08) * 0.72;
  let N = normalize(input.worldN);
  let moonDir = normalize(vec3f(-0.52, 0.58, 0.38));
  let L = moonDir;
  let V = normalize(vec3f(0.14, 0.36, 0.92));
  let H = normalize(L + V);
  let NdL = max(dot(N, L), 0.0);
  let NdH = max(dot(N, H), 0.0);
  let rim = pow(clamp(1.0 - dot(V, N), 0.0, 1.0), 2.2);

  let moonCol = vec3f(0.22, 0.28, 0.45);
  let skyHi = vec3f(0.06, 0.08, 0.14);
  let skyAmb = vec3f(0.012, 0.014, 0.028);
  let bounce = vec3f(0.18, 0.12, 0.05);
  let amberSpill = vec3f(1.0, 0.72, 0.12);

  let dist = length(input.viewPos);
  let aerial = 1.0 - exp(-dist * 0.085);
  let fogCol = vec3f(0.008, 0.012, 0.031);
  let sunsetFill = vec3f(0.0);

  var albedo = vec3f(0.0);
  var specAmt = 0.0;
  var fresnelGlass = 0.0;
  var skyReflect = 0.0;
  var streetAo = 1.0;
  var emissive = vec3f(0.0);

  if (input.faceVertical > 0.5) {
    let seed = input.blockSeed;
    let nCol = 2.0;
    let nRow = 3.0;
    let gx = uv.x * nCol;
    let gy = uv.y * nRow;
    let cell = vec2f(floor(gx), floor(gy));
    var cellUv = vec2f(fract(gx), fract(gy));

    let fw = 0.045;
    let ms = 0.006;
    let mx = smoothstep(fw - ms, fw + ms, cellUv.x) *
      smoothstep(1.0 - fw + ms, 1.0 - fw - ms, cellUv.x);
    let my = smoothstep(fw - ms, fw + ms, cellUv.y) *
      smoothstep(1.0 - fw + ms, 1.0 - fw - ms, cellUv.y);
    let inPane = mx * my;
    let edgeDist = min(
      min(cellUv.x, 1.0 - cellUv.x),
      min(cellUv.y, 1.0 - cellUv.y)
    );
    let recess = smoothstep(0.0, 0.22, edgeDist);

    let frame = vec3f(0.052, 0.055, 0.068);
    let winId = hash2(cell + seed * 0.19);
    let lit = step(0.72, winId);
    let pulse = sin(t * 0.5 + winId * 6.283) * 0.5 + 0.5;
    let interior = vec3f(0.5, 0.53, 0.62) * lit * (0.78 + 0.22 * pulse);
    let glassDark = vec3f(0.034, 0.037, 0.046);
    let winCol = mix(glassDark, interior, max(lit, 0.1));
    var mixCol = mix(frame, winCol, inPane * recess);
    let fp = fract(uv.y * nRow);
    mixCol *= 1.0 - 0.065 * exp(-pow(fp / 0.036, 2.0));

    albedo = mixCol;
    streetAo = mix(0.58, 1.0, smoothstep(0.0, 0.3, uv.y));
    emissive = interior * inPane * recess * lit * 0.62;
    let R = reflect(-V, N);
    fresnelGlass = 0.03 * inPane * recess;
    skyReflect = max(R.y, 0.0) * inPane * recess * 0.09;
    specAmt = pow(NdH, 44.0) * 0.05 * inPane;
  } else if (input.faceNy > 0.5) {
    albedo = wallTone * 0.5;
    specAmt = pow(NdH, 28.0) * 0.032;
  } else {
    albedo = wallTone * 0.36;
    streetAo = 0.88;
  }

  let streetGlowAmt =
    amberSpill * 0.12 * input.faceVertical * smoothstep(0.0, 0.5, 1.0 - uv.y);
  let diffuse =
    albedo * (skyAmb * 0.65 + bounce * 0.16 + moonCol * NdL * 0.07 + sunsetFill) * streetAo +
    streetGlowAmt * vec3f(0.22, 0.2, 0.16) * 0.28;
  let specCol = moonCol * specAmt * 0.48 + skyHi * skyReflect * fresnelGlass;
  let rimLight = rim * vec3f(0.1, 0.12, 0.18) * 0.09;

  var hdr = diffuse + specCol + rimLight + emissive;
  hdr = mix(hdr, fogCol, aerial * 0.2);

  hdr = acesFilm(hdr * 1.02);
  let bloom = max(hdr - vec3f(0.78), vec3f(0.0));
  hdr = hdr + bloom * bloom * vec3f(0.14, 0.15, 0.18);
  hdr = pow(hdr, vec3f(1.0 / 2.08));
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

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var x = p;
  v += a * vnoise(x);
  x = x * 2.08 + vec2f(0.17, 0.23);
  a *= 0.5;
  v += a * vnoise(x);
  x = x * 2.08 + vec2f(0.17, 0.23);
  a *= 0.5;
  v += a * vnoise(x);
  x = x * 2.08 + vec2f(0.17, 0.23);
  a *= 0.5;
  v += a * vnoise(x);
  return v;
}

@fragment
fn main(input: SkyIn) -> @location(0) vec4f {
  let t = uniforms.time;
  let uv = input.uv;
  let top = vec3f(0.02, 0.035, 0.09);
  let horizon = vec3f(0.006, 0.012, 0.04);
  let grad = mix(horizon, top, pow(uv.y, 0.85));

  let moonUv = uv - vec2f(0.74, 0.18);
  let moonAspect = vec2f(1.0, uniforms.aspectRatio);
  let md = length(moonUv * moonAspect);
  let moon = 1.0 - smoothstep(0.034, 0.056, md);
  let moonGlow = exp(-md * 14.0) * 0.35;
  let moonCol = vec3f(0.88, 0.9, 0.96);
  var sky = grad * (1.0 - moon * 0.92) + moonCol * (moon + moonGlow);

  let wind = vec2f(t * 0.012, t * 0.007);
  let cuv = uv * vec2f(2.4, 1.6) + wind;
  let c2 = fbm(cuv + fbm(cuv * 1.7 + t * 0.02));
  let clouds = smoothstep(0.38, 0.72, c2) * (0.22 + 0.12 * sin(t * 0.15 + c2 * 3.0));
  let cloudCol = vec3f(0.07, 0.09, 0.14);
  sky = mix(sky, cloudCol + vec3f(0.04, 0.045, 0.055), clouds * 0.42);

  return vec4f(sky, 1.0);
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
        targets: [{ format }],
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
      <Pressable style={styles.pressable} onPress={handlePress}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { backgroundColor: 'transparent', flex: 1 },
  container: { backgroundColor: '#020308', flex: 1 },
  pressable: { flex: 1 },
});
