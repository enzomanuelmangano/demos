import { PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-wgpu';

import { LERP_SPEED, MAX_BLOCKS } from '../constants';
import {
  blocksFragmentShader,
  blocksVertexShader,
  shadowFragmentShader,
  shadowVertexShader,
  skyFragmentShader,
  skyVertexShader,
} from '../shaders';
import { BlockData } from '../types';
import { generateBlockData, generateQRMatrix } from '../utils';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface UseWebGPUOptions {
  canvasRef: React.RefObject<CanvasRef | null>;
  canvasWidth: number;
  canvasHeight: number;
  qrContent: string;
  isFlat: React.RefObject<boolean>;
}

export function useWebGPU({
  canvasRef,
  canvasWidth,
  canvasHeight,
  qrContent,
  isFlat,
}: UseWebGPUOptions) {
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const progressRef = useRef(0);
  const rawProgressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  const deviceRef = useRef<GPUDevice | null>(null);
  const typeBufferRef = useRef<GPUBuffer | null>(null);
  const posBufferRef = useRef<GPUBuffer | null>(null);
  const heightBufferRef = useRef<GPUBuffer | null>(null);
  const baseYBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{ numBlocks: number; gridSize: number }>({
    numBlocks: 0,
    gridSize: 0,
  });
  const qrContentRef = useRef(qrContent);
  qrContentRef.current = qrContent;

  // Update buffers when QR content changes
  useEffect(() => {
    const device = deviceRef.current;
    const typeBuffer = typeBufferRef.current;
    const posBuffer = posBufferRef.current;
    const heightBuffer = heightBufferRef.current;
    const baseYBuffer = baseYBufferRef.current;

    if (!device || !typeBuffer || !posBuffer || !heightBuffer || !baseYBuffer)
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const blockData = generateBlockData(qrMatrix);
    updateBuffers(device, blockData, {
      typeBuffer,
      posBuffer,
      heightBuffer,
      baseYBuffer,
    });
    blockDataRef.current = {
      numBlocks: blockData.numBlocks,
      gridSize: blockData.gridSize,
    };
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
    const pixelRatio = PixelRatio.get();
    canvas.width = canvasWidth * pixelRatio;
    canvas.height = canvasHeight * pixelRatio;

    context.configure({ device, format, alphaMode: 'premultiplied' });

    // Generate initial block data
    const qrMatrix = generateQRMatrix(qrContentRef.current);
    const blockData = generateBlockData(qrMatrix);
    blockDataRef.current = {
      numBlocks: blockData.numBlocks,
      gridSize: blockData.gridSize,
    };

    // Create buffers
    const uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const typeBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    typeBufferRef.current = typeBuffer;

    const posBuffer = device.createBuffer({
      size: MAX_BLOCKS * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    posBufferRef.current = posBuffer;

    const heightBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    heightBufferRef.current = heightBuffer;

    const baseYBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    baseYBufferRef.current = baseYBuffer;

    // Initialize buffer data
    updateBuffers(device, blockData, {
      typeBuffer,
      posBuffer,
      heightBuffer,
      baseYBuffer,
    });

    // Create bind group layouts
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
        { binding: 1, resource: { buffer: typeBuffer } },
        { binding: 2, resource: { buffer: posBuffer } },
        { binding: 3, resource: { buffer: heightBuffer } },
        { binding: 4, resource: { buffer: baseYBuffer } },
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

    // Create pipelines
    const skyPipeline = createPipeline(device, format, skyBindGroupLayout, {
      vertex: skyVertexShader,
      fragment: skyFragmentShader,
      depthWrite: false,
      depthCompare: 'always',
    });

    const shadowPipeline = createPipeline(device, format, skyBindGroupLayout, {
      vertex: shadowVertexShader,
      fragment: shadowFragmentShader,
      depthWrite: false,
      depthCompare: 'always',
      blend: {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add',
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add',
        },
      },
    });

    const blocksPipeline = createPipeline(device, format, bindGroupLayout, {
      vertex: blocksVertexShader,
      fragment: blocksFragmentShader,
      depthWrite: true,
      depthCompare: 'less',
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspectRatio = canvas.width / canvas.height;

    // Render loop
    const render = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      // Animate progress
      const target = isFlat.current ? 1 : 0;
      rawProgressRef.current +=
        (target - rawProgressRef.current) * Math.min(1, LERP_SPEED * dt);
      if (Math.abs(rawProgressRef.current - target) < 0.001) {
        rawProgressRef.current = target;
      }
      progressRef.current = easeInOutCubic(rawProgressRef.current);

      const time = (now - startTimeRef.current) / 1000;
      const { numBlocks, gridSize } = blockDataRef.current;

      // Update uniforms
      const uniformData = new Float32Array([
        aspectRatio,
        time,
        numBlocks,
        progressRef.current,
        gridSize,
        0,
        0,
        0,
      ]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      // Render
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

      // Draw sky
      renderPass.setPipeline(skyPipeline);
      renderPass.setBindGroup(0, skyBindGroup);
      renderPass.draw(3);

      // Draw shadow
      renderPass.setPipeline(shadowPipeline);
      renderPass.setBindGroup(0, skyBindGroup);
      renderPass.draw(6);

      // Draw blocks
      renderPass.setPipeline(blocksPipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(36 * numBlocks);

      renderPass.end();
      device.queue.submit([commandEncoder.finish()]);
      context.present();

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  }, [canvasWidth, canvasHeight, canvasRef, isFlat]);

  useEffect(() => {
    const id = setTimeout(initWebGPU, 100);
    return () => {
      clearTimeout(id);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGPU]);
}

// Helper functions

function updateBuffers(
  device: GPUDevice,
  blockData: BlockData,
  buffers: {
    typeBuffer: GPUBuffer;
    posBuffer: GPUBuffer;
    heightBuffer: GPUBuffer;
    baseYBuffer: GPUBuffer;
  },
) {
  const { types, positions, heights, baseY } = blockData;

  const paddedTypes = new Uint32Array(MAX_BLOCKS);
  paddedTypes.set(types);
  device.queue.writeBuffer(buffers.typeBuffer, 0, paddedTypes);

  const paddedPositions = new Float32Array(MAX_BLOCKS * 4);
  paddedPositions.set(positions);
  device.queue.writeBuffer(buffers.posBuffer, 0, paddedPositions);

  const paddedHeights = new Float32Array(MAX_BLOCKS);
  paddedHeights.set(heights);
  device.queue.writeBuffer(buffers.heightBuffer, 0, paddedHeights);

  const paddedBaseY = new Float32Array(MAX_BLOCKS);
  paddedBaseY.set(baseY);
  device.queue.writeBuffer(buffers.baseYBuffer, 0, paddedBaseY);
}

interface PipelineOptions {
  vertex: string;
  fragment: string;
  depthWrite: boolean;
  depthCompare: GPUCompareFunction;
  blend?: GPUBlendState;
}

function createPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  bindGroupLayout: GPUBindGroupLayout,
  options: PipelineOptions,
): GPURenderPipeline {
  const defaultBlend: GPUBlendState = {
    color: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  };

  return device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({ code: options.vertex }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({ code: options.fragment }),
      entryPoint: 'main',
      targets: [
        {
          format,
          blend: options.blend ?? defaultBlend,
        },
      ],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      depthWriteEnabled: options.depthWrite,
      depthCompare: options.depthCompare,
      format: 'depth24plus',
    },
  });
}
