import { PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-webgpu';

import {
  BLOCK_SIZE,
  CREEPER_APPROACH_SPREAD,
  CREEPER_APPROACH_YAW,
  CREEPER_FUSE_DURATION,
  CREEPER_TOTAL,
  CREEPER_WALK_DURATION,
  DEBRIS_SETTLE,
  LERP_SPEED,
  MAX_BLOCKS,
  REBUILD_DURATION,
} from '../constants';
import {
  blocksFragmentShader,
  blocksVertexShader,
  dustFragmentShader,
  dustVertexShader,
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

// Where the creeper plants itself, in blocks from the trunk — close enough to
// gut the tree, far enough out that it does not stand inside the trunk it is
// about to remove.
const CREEPER_STAND_DISTANCE = 8;

// Whole sequence: walk in, fuse, blast, debris settles, tree reassembles.
const SEQUENCE_DURATION = CREEPER_TOTAL + DEBRIS_SETTLE + REBUILD_DURATION;

const UNIFORM_FLOATS = 16;

interface UseWebGPUOptions {
  canvasRef: React.RefObject<CanvasRef | null>;
  canvasWidth: number;
  canvasHeight: number;
  qrContent: string;
  isFlat: React.RefObject<boolean>;
  /** Fired the frame the creeper detonates — used for the haptic thump. */
  onDetonate?: () => void;
  /** Fired when the tree is whole again and the QR is scannable. */
  onSequenceEnd?: () => void;
}

export function useWebGPU({
  canvasRef,
  canvasWidth,
  canvasHeight,
  qrContent,
  isFlat,
  onDetonate,
  onSequenceEnd,
}: UseWebGPUOptions) {
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const progressRef = useRef(0);
  const rawProgressRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  const deviceRef = useRef<GPUDevice | null>(null);
  const typeBufferRef = useRef<GPUBuffer | null>(null);
  const posBufferRef = useRef<GPUBuffer | null>(null);
  const massBufferRef = useRef<GPUBuffer | null>(null);
  const baseYBufferRef = useRef<GPUBuffer | null>(null);
  const blockDataRef = useRef<{ numBlocks: number; gridSize: number }>({
    numBlocks: 0,
    gridSize: 0,
  });
  const qrContentRef = useRef(qrContent);
  qrContentRef.current = qrContent;

  // The detonation sequence is one clock plus a fixed heading; every visual
  // downstream is a pure function of them, so nothing can drift out of sync.
  const sequenceStartRef = useRef<number | null>(null);
  const spawnAngleRef = useRef(0);
  const blastPosRef = useRef({ x: 0, z: 0 });
  const detonatedRef = useRef(false);
  const onDetonateRef = useRef(onDetonate);
  onDetonateRef.current = onDetonate;
  const onSequenceEndRef = useRef(onSequenceEnd);
  onSequenceEndRef.current = onSequenceEnd;

  /** Spawns a creeper. Ignored while one is already on its way. */
  const detonate = useCallback(() => {
    if (sequenceStartRef.current !== null) return false;
    // Approach from the camera side, with enough spread that two runs never
    // look identical — a mob that walks in from behind the canopy is a mob
    // nobody sees.
    const angle =
      CREEPER_APPROACH_YAW + (Math.random() - 0.5) * CREEPER_APPROACH_SPREAD;
    spawnAngleRef.current = angle;
    // Model faces rotY(+Z, yaw); it stops that far back along its own path,
    // which is also where the charge goes off.
    const fwdX = -Math.sin(angle);
    const fwdZ = Math.cos(angle);
    blastPosRef.current = {
      x: -fwdX * CREEPER_STAND_DISTANCE * BLOCK_SIZE,
      z: -fwdZ * CREEPER_STAND_DISTANCE * BLOCK_SIZE,
    };
    detonatedRef.current = false;
    sequenceStartRef.current = Date.now();
    return true;
  }, []);

  // Update buffers when QR content changes
  useEffect(() => {
    const device = deviceRef.current;
    const typeBuffer = typeBufferRef.current;
    const posBuffer = posBufferRef.current;
    const massBuffer = massBufferRef.current;
    const baseYBuffer = baseYBufferRef.current;

    if (!device || !typeBuffer || !posBuffer || !massBuffer || !baseYBuffer)
      return;

    const qrMatrix = generateQRMatrix(qrContent);
    const blockData = generateBlockData(qrMatrix);
    updateBuffers(device, blockData, {
      typeBuffer,
      posBuffer,
      massBuffer,
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
      size: UNIFORM_FLOATS * 4,
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

    const massBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    massBufferRef.current = massBuffer;

    const baseYBuffer = device.createBuffer({
      size: MAX_BLOCKS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    baseYBufferRef.current = baseYBuffer;

    // Initialize buffer data
    updateBuffers(device, blockData, {
      typeBuffer,
      posBuffer,
      massBuffer,
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
        { binding: 3, resource: { buffer: massBuffer } },
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

    const alphaBlend: GPUBlendState = {
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
    };

    const shadowPipeline = createPipeline(device, format, skyBindGroupLayout, {
      vertex: shadowVertexShader,
      fragment: shadowFragmentShader,
      depthWrite: false,
      depthCompare: 'always',
      blend: alphaBlend,
    });

    const blocksPipeline = createPipeline(device, format, bindGroupLayout, {
      vertex: blocksVertexShader,
      fragment: blocksFragmentShader,
      depthWrite: true,
      depthCompare: 'less',
    });

    // Smoke and flash sit in FRONT of the debris, so this one draws last and
    // ignores depth entirely. Its colours are premultiplied.
    const dustPipeline = createPipeline(device, format, skyBindGroupLayout, {
      vertex: dustVertexShader,
      fragment: dustFragmentShader,
      depthWrite: false,
      depthCompare: 'always',
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspectRatio = canvas.width / canvas.height;
    const uniformData = new Float32Array(UNIFORM_FLOATS);

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

      // ---- Creeper timeline ------------------------------------------
      let creeperT = -1;
      let fuseT = 0;
      let blastT = -1;
      let rebuildT = 0;
      let creeperAlpha = 0;

      const startedAt = sequenceStartRef.current;
      if (startedAt !== null) {
        const seq = (now - startedAt) / 1000;

        if (seq < CREEPER_WALK_DURATION) {
          creeperT = seq / CREEPER_WALK_DURATION;
          creeperAlpha = 1;
        } else if (seq < CREEPER_TOTAL) {
          creeperT = 1;
          fuseT = (seq - CREEPER_WALK_DURATION) / CREEPER_FUSE_DURATION;
          creeperAlpha = 1;
        } else {
          // Consumed by its own charge.
          blastT = seq - CREEPER_TOTAL;
          if (!detonatedRef.current) {
            detonatedRef.current = true;
            onDetonateRef.current?.();
          }
          const settleEnd = DEBRIS_SETTLE;
          if (blastT > settleEnd) {
            rebuildT = Math.min((blastT - settleEnd) / REBUILD_DURATION, 1);
          }
        }

        if (seq >= SEQUENCE_DURATION) {
          sequenceStartRef.current = null;
          onSequenceEndRef.current?.();
          creeperT = -1;
          fuseT = 0;
          blastT = -1;
          rebuildT = 0;
          creeperAlpha = 0;
        }
      }

      // Update uniforms
      uniformData[0] = aspectRatio;
      uniformData[1] = time;
      uniformData[2] = numBlocks;
      uniformData[3] = progressRef.current;
      uniformData[4] = gridSize;
      uniformData[5] = creeperT;
      uniformData[6] = fuseT;
      uniformData[7] = blastT;
      uniformData[8] = blastPosRef.current.x;
      uniformData[9] = blastPosRef.current.z;
      uniformData[10] = rebuildT;
      uniformData[11] = creeperAlpha;
      uniformData[12] = spawnAngleRef.current;
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

      // Draw smoke + flash over everything (no-ops before the blast)
      if (blastT >= 0) {
        renderPass.setPipeline(dustPipeline);
        renderPass.setBindGroup(0, skyBindGroup);
        renderPass.draw(9);
      }

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

  return { detonate };
}

// Helper functions

function updateBuffers(
  device: GPUDevice,
  blockData: BlockData,
  buffers: {
    typeBuffer: GPUBuffer;
    posBuffer: GPUBuffer;
    massBuffer: GPUBuffer;
    baseYBuffer: GPUBuffer;
  },
) {
  const { types, positions, mass, baseY } = blockData;

  const paddedTypes = new Uint32Array(MAX_BLOCKS);
  paddedTypes.set(types);
  device.queue.writeBuffer(buffers.typeBuffer, 0, paddedTypes);

  const paddedPositions = new Float32Array(MAX_BLOCKS * 4);
  paddedPositions.set(positions);
  device.queue.writeBuffer(buffers.posBuffer, 0, paddedPositions);

  const paddedMass = new Float32Array(MAX_BLOCKS);
  paddedMass.set(mass);
  device.queue.writeBuffer(buffers.massBuffer, 0, paddedMass);

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
