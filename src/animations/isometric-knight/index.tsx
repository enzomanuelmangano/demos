import {
  LayoutChangeEvent,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef } from 'react';

import { Canvas, CanvasRef } from 'react-native-wgpu';

import {
  CONTRIBUTION_GRID,
  CONTRIBUTION_GRID_COLS,
  CONTRIBUTION_GRID_ROWS,
} from './contribution-data';

const GRID_COLS = CONTRIBUTION_GRID_COLS;
const GRID_ROWS = CONTRIBUTION_GRID_ROWS;

const HEIGHT_MAP: number[][] = CONTRIBUTION_GRID.map(col =>
  col.map(level => {
    switch (level) {
      case 0:
        return 0.02;
      case 1:
        return 0.15;
      case 2:
        return 0.35;
      case 3:
        return 0.65;
      case 4:
        return 1.0;
      default:
        return 0.02;
    }
  }),
);

function generateBlockData(): {
  positions: number[];
  heights: number[];
  colors: number[];
} {
  const positions: number[] = [];
  const heights: number[] = [];
  const colors: number[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const height = HEIGHT_MAP[col][row];

      positions.push(col, 0, row, 0);
      heights.push(height);

      let colorLevel: number;
      if (height < 0.05) colorLevel = 0;
      else if (height < 0.2) colorLevel = 1;
      else if (height < 0.4) colorLevel = 2;
      else if (height < 0.7) colorLevel = 3;
      else colorLevel = 4;
      colors.push(colorLevel);
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

const BLOCK_DATA = (() => {
  const data = generateBlockData();
  addYearCards(data);
  return data;
})();
const NUM_BLOCKS = GRID_COLS * GRID_ROWS + NUM_YEARS;

const ISO_ANGLE_Y = 0.78;
const ISO_ANGLE_X = -0.58;
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
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;

fn getBlockColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.87, 0.86, 0.82); }
    case 1u: { return vec3f(0.50, 0.70, 0.56); }
    case 2u: { return vec3f(0.26, 0.60, 0.42); }
    case 3u: { return vec3f(0.14, 0.48, 0.34); }
    case 4u: { return vec3f(0.07, 0.36, 0.24); }
    case 6u: { return vec3f(0.95, 0.94, 0.91); }
    default: { return vec3f(0.87, 0.86, 0.82); }
  }
}

fn getFlatColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.93, 0.92, 0.89); }
    case 1u: { return vec3f(0.55, 0.88, 0.64); }
    case 2u: { return vec3f(0.22, 0.78, 0.45); }
    case 3u: { return vec3f(0.14, 0.64, 0.36); }
    case 4u: { return vec3f(0.09, 0.48, 0.28); }
    case 6u: { return vec3f(0.99, 0.99, 0.97); }
    default: { return vec3f(0.93, 0.92, 0.89); }
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
  let maxHeight = 4.0;
  let isCard = blockColor == 6u;

  var h3D = max(blockHeight * maxHeight, 0.04);
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

  var csX = mix(0.94, 0.88, progress);
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
      localPos = vec3f((qv.x - 0.5) * csX, hh, (qv.y - 0.5) * csZ);
      faceNormal = vec3f(0.0, 1.0, 0.0);
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

  let lightDir = normalize(vec3f(0.42, 0.86, 0.28));
  var rawDiffuse = max(dot(faceNormal, lightDir), 0.0);
  var shade3D = 0.14 + 0.86 * pow(rawDiffuse, 0.72);
  if (faceNormal.y > 0.55) {
    shade3D = min(1.0, shade3D * 1.08 + 0.06);
  }
  if (faceNormal.y < -0.45) {
    shade3D *= 0.72;
  }
  let shade = mix(shade3D, 1.0, progress);

  let halfW = (f32(${GRID_COLS}) - 1.0) * blockSize * 0.5;
  let halfZ = (f32(${GRID_ROWS}) - 1.0) * blockSize * 0.5;
  let isoSpanX = abs(cy) * halfW + abs(sy) * halfZ;
  let isoSpanY = abs(sx) * (abs(sy) * halfW + abs(cy) * halfZ) + abs(cx) * 4.2 * blockSize;
  let isoFit = min(0.88 * uniforms.aspectRatio / max(isoSpanX, 1e-4), 0.88 / max(isoSpanY, 1e-4));

  let totalZ = f32(${GRID_ROWS}) + numGaps * yearGap;
  let halfH = totalZ * blockSize * 0.5;
  let fitWidth = 0.92 * uniforms.aspectRatio / halfW;
  let fitHeight = 0.92 / halfH;
  let flatScale = min(fitWidth, fitHeight);
  let scale = mix(isoFit, flatScale, progress);
  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.01 + 0.5,
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
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let bgTop = vec3f(0.96, 0.95, 0.92);
  let bgBot = vec3f(0.90, 0.88, 0.84);
  let bgColor = mix(bgBot, bgTop, 0.55);

  let warmLight = vec3f(1.04, 1.01, 0.96);
  let coolShadow = vec3f(0.82, 0.88, 0.94);
  let tint = mix(coolShadow, warmLight, input.shade);
  var lit = input.color * mix(tint * input.shade, vec3f(1.0), input.progress);

  let canopy = mix(vec3f(1.0), vec3f(1.06, 1.05, 1.0), input.isTop);
  lit = lit * mix(canopy, vec3f(1.0), input.progress);

  let luma = dot(lit, vec3f(0.299, 0.587, 0.114));
  lit = mix(vec3f(luma), lit, mix(1.12, 1.0, input.progress));

  let baseFade = mix(0.48, 0.0, input.progress);
  var col = mix(lit, bgColor * 0.99, input.isBase * baseFade);

  return vec4f(col, 1.0);
}
`;

const LERP_SPEED = 4.0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const IsometricKnight = () => {
  const { width, height } = useWindowDimensions();
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
            clearValue: { r: 0.93, g: 0.91, b: 0.87, a: 1 },
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
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  container: { backgroundColor: '#EDE9E2', flex: 1 },
  pressable: { flex: 1 },
});
