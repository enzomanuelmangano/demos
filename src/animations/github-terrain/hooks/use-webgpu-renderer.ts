import { AppState, PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-webgpu';

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
  depthView: GPUTextureView;
  buffers: GPUBuffer[];
}

/** The canvas is not measured on the first tick; poll briefly for a layout. */
const INIT_RETRY_MS = 50;
const INIT_MAX_ATTEMPTS = 20;

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
  // Bumped on every teardown. Init re-reads it after each await, so a screen
  // left while the adapter or device is still being requested drops the work
  // instead of starting a render loop on an unmounted canvas.
  const generationRef = useRef(0);
  // Frames to keep rendering after init even if settled, while the
  // surface is being set up
  const warmupFramesRef = useRef(0);
  // Reused every frame (writeBuffer copies it)
  const uniformDataRef = useRef(new Float32Array(6));

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { device, context, depthTexture, buffers } = resourcesRef.current;

      // The loop runs on this thread and was just cancelled, so no frame can
      // still be using these objects.
      context.unconfigure();

      // Destroy all buffers
      buffers.forEach(buffer => buffer.destroy());

      // Destroy depth texture
      depthTexture.destroy();

      device.destroy();

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

  /**
   * Resolves false when the canvas has not been laid out yet and the caller
   * should ask again; true once it has, whether or not init then succeeded.
   */
  const initWebGPU = useCallback(async () => {
    if (isInitializedRef.current) return true;
    if (!canvasRef.current) return false;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      console.error('[WebGPU] Failed to get context');
      return true;
    }

    const canvas = context.canvas as HTMLCanvasElement;
    // A canvas measured at zero would get a 0x0 depth texture, which fails
    // validation and leaves the screen blank, so wait for a real layout.
    if (!canvas.clientWidth || !canvas.clientHeight) return false;

    const generation = generationRef.current;
    const abandoned = () => generation !== generationRef.current;

    // Outside the try so a throw part-way through init can still release
    // them: resourcesRef is only set at the end, out of cleanup's reach.
    let initDevice: GPUDevice | null = null;
    let configured = false;
    const buffers: GPUBuffer[] = [];

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (abandoned()) return true;
      if (!adapter) {
        console.error('[WebGPU] No adapter available');
        return true;
      }

      const device = await adapter.requestDevice();
      if (abandoned()) {
        device.destroy();
        return true;
      }
      initDevice = device;
      const format = navigator.gpu.getPreferredCanvasFormat();

      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();

      context.configure({ device, format, alphaMode: 'opaque' });
      configured = true;

      // Build scene data for both data sets
      const syntheticData = buildSceneData(getContributionGrid(false));
      const realData = buildSceneData(getContributionGrid(true));

      // Create buffers
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
        depthView: depthTexture.createView(),
        buffers,
      };

      isInitializedRef.current = true;
      startRenderLoop();
    } catch (e) {
      console.error('[WebGPU] Initialization failed:', e);
      // Once resourcesRef holds them, cleanup owns them instead.
      if (initDevice && resourcesRef.current?.device !== initDevice) {
        if (configured) context.unconfigure();
        buffers.forEach(buffer => buffer.destroy());
        initDevice.destroy();
      }
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, cleanup, createDepthTexture]);

  const render = useCallback(() => {
    if (!resourcesRef.current || !stateRef.current || !layoutRef.current) {
      return;
    }

    const { device, context, pipeline, bindGroup, uniformBuffer, depthView } =
      resourcesRef.current;
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
    const uniformData = uniformDataRef.current;
    uniformData[0] = aspectRatio;
    uniformData[1] = time;
    uniformData[2] = NUM_BLOCKS;
    uniformData[3] = animState.progress;
    uniformData[4] = animState.dataProgress;
    uniformData[5] = 1.0; // zoomScale
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
        view: depthView,
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

    // Once both springs rest on their targets every next frame would be
    // identical (time isn't used by the shaders): stop the JS-thread loop
    // until requestRender() is called again
    if (warmupFramesRef.current > 0) warmupFramesRef.current -= 1;
    const isSettled =
      warmupFramesRef.current === 0 &&
      animState.progress === viewTarget &&
      animState.progressVelocity === 0 &&
      animState.dataProgress === dataTarget &&
      animState.dataVelocity === 0;
    animationRef.current = isSettled ? null : requestAnimationFrame(render);
  }, [stateRef, layoutRef]);

  // Renders again after the state or the layout changed
  const requestRender = useCallback(() => {
    if (!isInitializedRef.current || animationRef.current) return;
    lastFrameTimeRef.current = Date.now();
    animationRef.current = requestAnimationFrame(render);
  }, [render]);

  // The surface can be dropped while the app is in background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState === 'active') requestRender();
    });
    return () => subscription.remove();
  }, [requestRender]);

  const startRenderLoop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    lastFrameTimeRef.current = Date.now();
    warmupFramesRef.current = 30;
    animationRef.current = requestAnimationFrame(render);
  }, [render]);

  // Initialize on mount
  useEffect(() => {
    // The canvas reports a zero size for a tick or two after mount; ask again
    // on a short timer until it has been laid out, then stop asking.
    let cancelled = false;
    let attempts = 0;

    const attempt = async () => {
      const laidOut = await initWebGPU();
      if (cancelled || laidOut) return;
      if (attempts >= INIT_MAX_ATTEMPTS) {
        console.warn('[WebGPU] Canvas never got a size; not rendering');
        return;
      }
      attempts += 1;
      timeoutId = setTimeout(attempt, INIT_RETRY_MS);
    };

    let timeoutId = setTimeout(attempt, INIT_RETRY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [initWebGPU, cleanup]);

  return {
    isInitialized: isInitializedRef.current,
    requestRender,
  };
}
