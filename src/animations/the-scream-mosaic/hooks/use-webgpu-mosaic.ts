import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { SharedValue } from 'react-native-reanimated';
import { CanvasRef } from 'react-native-wgpu';

import { mosaicVertexShader, mosaicFragmentShader } from '../shaders';

import type { PhotoInfo } from './use-photo-atlas';
import type { RGB } from '../types';

// Atlas configuration
const PHOTO_SIZE = 80;
const ATLAS_COLS = 100;
const CONTRAST = 1.4;

// Uniform buffer size (16 floats aligned)
const UNIFORM_BUFFER_SIZE = 64;

// Tile data: 8 floats per tile (removed high-res slot)
const FLOATS_PER_TILE = 8;

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
}

interface RNWebGPUContext extends GPUCanvasContext {
  present(): void;
}

interface GPUResources {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  tileBuffer: GPUBuffer;
  atlasTexture: GPUTexture;
  buffers: GPUBuffer[];
  tileCount: number;
}

interface UseWebGPUMosaicOptions {
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  paintingWidth: number;
  paintingHeight: number;
  screenWidth: number;
  screenHeight: number;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
}

export function useWebGPUMosaic(
  canvasRef: React.RefObject<CanvasRef | null>,
  options: UseWebGPUMosaicOptions,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());

  // Pre-allocate uniform buffer to avoid GC during render
  const uniformDataRef = useRef(new Float32Array(16));

  const {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    paintingWidth,
    paintingHeight,
    screenWidth,
    screenHeight,
    scale,
    translateX,
    translateY,
  } = options;

  // Pre-compute atlas dimensions
  const atlasWidth = ATLAS_COLS * PHOTO_SIZE;
  const atlasHeight = Math.ceil(photoInfoMap.size / ATLAS_COLS) * PHOTO_SIZE;

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { atlasTexture, buffers } = resourcesRef.current;
      buffers.forEach(buffer => buffer.destroy());
      atlasTexture.destroy();
      resourcesRef.current = null;
    }

    isInitializedRef.current = false;
  }, []);

  // Build tile data (simplified - no high-res slots)
  const buildTileData = useCallback((): {
    data: Float32Array;
    count: number;
  } => {
    const validCells = cells.filter(
      cell => cell.photoId !== null && photoInfoMap.has(cell.photoId),
    );

    const data = new Float32Array(validCells.length * FLOATS_PER_TILE);

    const aWidth = ATLAS_COLS * PHOTO_SIZE;
    const aHeight = Math.ceil(photoInfoMap.size / ATLAS_COLS) * PHOTO_SIZE;

    validCells.forEach((cell, i) => {
      const info = photoInfoMap.get(cell.photoId!)!;
      const offset = i * FLOATS_PER_TILE;

      data[offset + 0] = cell.x;
      data[offset + 1] = cell.y;
      data[offset + 2] = cellWidth;
      data[offset + 3] = cellHeight;
      data[offset + 4] = info.atlasRect.x / aWidth;
      data[offset + 5] = info.atlasRect.y / aHeight;
      data[offset + 6] = info.atlasRect.width / aWidth;
      data[offset + 7] = info.atlasRect.height / aHeight;
    });

    return { data, count: validCells.length };
  }, [cells, photoInfoMap, cellWidth, cellHeight]);

  // Load atlas texture
  const loadAtlasTexture = useCallback(
    async (device: GPUDevice): Promise<GPUTexture | null> => {
      try {
        const resolved = Image.resolveAssetSource(
          require('../assets/photo-atlas.jpg'),
        );

        if (!resolved?.uri) return null;

        const response = await fetch(resolved.uri);
        const arrayBuffer = await response.arrayBuffer();
        const imageBitmap = await createImageBitmap(arrayBuffer);

        const texture = device.createTexture({
          size: [imageBitmap.width, imageBitmap.height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        device.queue.copyExternalImageToTexture(
          { source: imageBitmap },
          { texture },
          [imageBitmap.width, imageBitmap.height],
        );

        return texture;
      } catch (e) {
        console.error('[WebGPU Mosaic] Failed to load atlas texture:', e);
        return null;
      }
    },
    [],
  );

  // Render loop
  const render = useCallback(() => {
    if (!resourcesRef.current) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    const { device, context, pipeline, bindGroup, uniformBuffer, tileCount } =
      resourcesRef.current;

    const time = (Date.now() - startTimeRef.current) / 1000;

    // Reuse pre-allocated buffer
    const uniformData = uniformDataRef.current;
    uniformData[0] = screenWidth;
    uniformData[1] = screenHeight;
    uniformData[2] = paintingWidth;
    uniformData[3] = paintingHeight;
    uniformData[4] = atlasWidth;
    uniformData[5] = atlasHeight;
    uniformData[6] = CONTRAST;
    uniformData[7] = time;
    uniformData[8] = scale.value;
    uniformData[9] = translateX.value;
    uniformData[10] = translateY.value;

    device.queue.writeBuffer(
      uniformBuffer,
      0,
      uniformData as unknown as BufferSource,
    );

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6, tileCount);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    context.present();

    animationRef.current = requestAnimationFrame(render);
  }, [
    screenWidth,
    screenHeight,
    paintingWidth,
    paintingHeight,
    atlasWidth,
    atlasHeight,
    scale,
    translateX,
    translateY,
  ]);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current || isInitializedRef.current) return;
    if (cells.length === 0 || photoInfoMap.size === 0) return;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) return;

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) return;

      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      const canvas = context.canvas as HTMLCanvasElement;
      const pixelRatio = PixelRatio.get();
      canvas.width = canvas.clientWidth * pixelRatio;
      canvas.height = canvas.clientHeight * pixelRatio;

      context.configure({ device, format, alphaMode: 'premultiplied' });

      const atlasTexture = await loadAtlasTexture(device);
      if (!atlasTexture) return;

      const buffers: GPUBuffer[] = [];

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(uniformBuffer);

      const { data: tileData, count: tileCount } = buildTileData();

      const tileBuffer = device.createBuffer({
        size: Math.max(tileData.byteLength, 32),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        tileBuffer,
        0,
        tileData as unknown as BufferSource,
      );
      buffers.push(tileBuffer);

      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

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
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 3,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' },
          },
        ],
      });

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: tileBuffer } },
          { binding: 2, resource: atlasTexture.createView() },
          { binding: 3, resource: sampler },
        ],
      });

      const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: device.createShaderModule({ code: mosaicVertexShader }),
          entryPoint: 'main',
        },
        fragment: {
          module: device.createShaderModule({ code: mosaicFragmentShader }),
          entryPoint: 'main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'none',
        },
      });

      resourcesRef.current = {
        device,
        context,
        pipeline,
        bindGroup,
        uniformBuffer,
        tileBuffer,
        atlasTexture,
        buffers,
        tileCount,
      };

      isInitializedRef.current = true;
      startTimeRef.current = Date.now();
      animationRef.current = requestAnimationFrame(render);
    } catch (e) {
      console.error('[WebGPU Mosaic] Initialization failed:', e);
    }
  }, [
    canvasRef,
    buildTileData,
    loadAtlasTexture,
    cells.length,
    photoInfoMap.size,
    render,
  ]);

  // Update tile buffer when cells change
  useEffect(() => {
    if (!resourcesRef.current || cells.length === 0) return;

    const { device, tileBuffer } = resourcesRef.current;
    const { data: tileData, count: tileCount } = buildTileData();

    device.queue.writeBuffer(
      tileBuffer,
      0,
      tileData as unknown as BufferSource,
    );
    resourcesRef.current.tileCount = tileCount;
  }, [cells, buildTileData]);

  // Initialize on mount
  useEffect(() => {
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
