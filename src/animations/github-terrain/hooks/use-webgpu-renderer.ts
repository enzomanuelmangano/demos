import { PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-wgpu';

import { NUM_BLOCKS, SURFACE_RGB, UNIFORM_BUFFER_SIZE } from '../constants';
import { getContributionGrid } from '../contribution-data';
import { vertexShader, fragmentShader } from '../shaders';
import { buildSceneData } from '../utils/scene-data';
import { springStep, isSpringSettled } from '../utils/spring';

export interface RendererState {
  isFlat: boolean;
  useRealData: boolean;
}

// Extended context type for react-native-wgpu which has present() method
interface RNWebGPUContext extends GPUCanvasContext {
  present(): void;
}

interface GPUResources {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  depthTexture: GPUTexture;
  buffers: GPUBuffer[];
}

interface AnimationState {
  progress: number;
  progressVelocity: number;
  dataProgress: number;
  dataVelocity: number;
}

export function useWebGPURenderer(
  canvasRef: React.RefObject<CanvasRef | null>,
  stateRef: React.RefObject<RendererState>,
  layoutRef: React.RefObject<{ width: number; height: number }>,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const animStateRef = useRef<AnimationState>({
    progress: 1, // Start with flat view (contribution chart)
    progressVelocity: 0,
    dataProgress: 1, // Start with real data
    dataVelocity: 0,
  });
  const lastFrameTimeRef = useRef<number>(Date.now());
  const startTimeRef = useRef<number>(Date.now());
  const isInitializedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { depthTexture, buffers } = resourcesRef.current;

      // Destroy all buffers
      buffers.forEach(buffer => buffer.destroy());

      // Destroy depth texture
      depthTexture.destroy();

      resourcesRef.current = null;
    }

    isInitializedRef.current = false;
  }, []);

  const createDepthTexture = useCallback(
    (device: GPUDevice, width: number, height: number): GPUTexture => {
      return device.createTexture({
        size: [width, height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    },
    [],
  );

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current || isInitializedRef.current) return;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      console.error('[WebGPU] Failed to get context');
      return;
    }

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) {
        console.error('[WebGPU] No adapter available');
        return;
      }

      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      const canvas = context.canvas as HTMLCanvasElement;
      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();

      context.configure({ device, format, alphaMode: 'opaque' });

      // Build scene data for both data sets
      const syntheticData = buildSceneData(getContributionGrid(false));
      const realData = buildSceneData(getContributionGrid(true));

      // Create buffers
      const buffers: GPUBuffer[] = [];

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(uniformBuffer);

      const createStorageBuffer = (
        data: Float32Array | Uint32Array,
        minSize?: number,
      ): GPUBuffer => {
        const size = minSize
          ? Math.max(minSize, Math.ceil(data.byteLength / 256) * 256)
          : data.byteLength;
        const buffer = device.createBuffer({
          size,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, data as unknown as BufferSource);
        buffers.push(buffer);
        return buffer;
      };

      // Primary data set (A = synthetic)
      const colorBuffer = createStorageBuffer(
        new Uint32Array(syntheticData.colors),
      );
      const posBuffer = createStorageBuffer(
        new Float32Array(syntheticData.positions),
      );
      const heightBuffer = createStorageBuffer(
        new Float32Array(syntheticData.heights),
      );
      const heightGridBuffer = createStorageBuffer(
        syntheticData.heightGridFlat,
        256,
      );

      // Secondary data set (B = real)
      const colorBufferB = createStorageBuffer(
        new Uint32Array(realData.colors),
      );
      const heightBufferB = createStorageBuffer(
        new Float32Array(realData.heights),
      );
      const heightGridBufferB = createStorageBuffer(
        realData.heightGridFlat,
        256,
      );

      // Create bind group layout
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
          {
            binding: 4,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'read-only-storage' },
          },
          {
            binding: 5,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'read-only-storage' },
          },
          {
            binding: 6,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'read-only-storage' },
          },
          {
            binding: 7,
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
          { binding: 4, resource: { buffer: heightGridBuffer } },
          { binding: 5, resource: { buffer: colorBufferB } },
          { binding: 6, resource: { buffer: heightBufferB } },
          { binding: 7, resource: { buffer: heightGridBufferB } },
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

      const depthTexture = createDepthTexture(
        device,
        canvas.width,
        canvas.height,
      );

      resourcesRef.current = {
        device,
        context,
        pipeline,
        bindGroup,
        uniformBuffer,
        depthTexture,
        buffers,
      };

      isInitializedRef.current = true;
      startRenderLoop();
    } catch (e) {
      console.error('[WebGPU] Initialization failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, cleanup, createDepthTexture]);

  const render = useCallback(() => {
    if (!resourcesRef.current || !stateRef.current || !layoutRef.current) {
      return;
    }

    const {
      device,
      context,
      pipeline,
      bindGroup,
      uniformBuffer,
      depthTexture,
    } = resourcesRef.current;
    const state = stateRef.current;
    const layout = layoutRef.current;

    const now = Date.now();
    const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
    lastFrameTimeRef.current = now;

    const animState = animStateRef.current;

    // Animate view transition (3D ↔ flat)
    const viewTarget = state.isFlat ? 1 : 0;
    const viewSpring = springStep(
      animState.progress,
      animState.progressVelocity,
      viewTarget,
      dt,
    );
    animState.progress = viewSpring.position;
    animState.progressVelocity = viewSpring.velocity;

    if (
      isSpringSettled(
        animState.progress,
        animState.progressVelocity,
        viewTarget,
      )
    ) {
      animState.progress = viewTarget;
      animState.progressVelocity = 0;
    }

    // Animate data transition
    const dataTarget = state.useRealData ? 1 : 0;
    const dataSpring = springStep(
      animState.dataProgress,
      animState.dataVelocity,
      dataTarget,
      dt,
    );
    animState.dataProgress = dataSpring.position;
    animState.dataVelocity = dataSpring.velocity;

    if (
      isSpringSettled(
        animState.dataProgress,
        animState.dataVelocity,
        dataTarget,
      )
    ) {
      animState.dataProgress = dataTarget;
      animState.dataVelocity = 0;
    }

    // Calculate aspect ratio
    const aspectRatio = layout.height > 0 ? layout.width / layout.height : 1;
    const time = (now - startTimeRef.current) / 1000;

    // Update uniforms
    const uniformData = new Float32Array([
      aspectRatio,
      time,
      NUM_BLOCKS,
      animState.progress,
      animState.dataProgress,
      1.0, // zoomScale
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Render
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: {
            r: SURFACE_RGB.r,
            g: SURFACE_RGB.g,
            b: SURFACE_RGB.b,
            a: 1,
          },
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
  }, [stateRef, layoutRef]);

  const startRenderLoop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    lastFrameTimeRef.current = Date.now();
    animationRef.current = requestAnimationFrame(render);
  }, [render]);

  // Initialize on mount
  useEffect(() => {
    // Small delay to ensure canvas is ready
    const timeoutId = setTimeout(() => {
      initWebGPU();
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [initWebGPU, cleanup]);

  return {
    isInitialized: isInitializedRef.current,
  };
}
