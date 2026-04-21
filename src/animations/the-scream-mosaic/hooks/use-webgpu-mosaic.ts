import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-wgpu';

import { mosaicVertexShader, mosaicFragmentShader } from '../shaders';

import type { PhotoInfo } from './use-photo-atlas';
import type { RGB } from '../types';

// Atlas configuration - matches generate-sprite-atlas.ts
const PHOTO_SIZE = 80;
const ATLAS_COLS = 100;
const CONTRAST = 1.4;

// Uniform buffer size: 6 floats * 4 bytes = 24 bytes, padded to 32
const UNIFORM_BUFFER_SIZE = 32;

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
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
  canvasWidth: number;
  canvasHeight: number;
}

export function useWebGPUMosaic(
  canvasRef: React.RefObject<CanvasRef | null>,
  options: UseWebGPUMosaicOptions,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());

  const {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    canvasWidth,
    canvasHeight,
  } = options;

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { atlasTexture, buffers } = resourcesRef.current;

      // Destroy all buffers
      buffers.forEach(buffer => buffer.destroy());

      // Destroy atlas texture
      atlasTexture.destroy();

      resourcesRef.current = null;
    }

    isInitializedRef.current = false;
  }, []);

  // Build tile data from cells and photoInfoMap
  const buildTileData = useCallback((): {
    data: Float32Array;
    count: number;
  } => {
    // Filter cells with valid photoIds
    const validCells = cells.filter(
      cell => cell.photoId !== null && photoInfoMap.has(cell.photoId),
    );

    // 8 floats per tile
    const data = new Float32Array(validCells.length * 8);

    // Calculate atlas dimensions
    const atlasWidth = ATLAS_COLS * PHOTO_SIZE;
    const atlasRows = Math.ceil(photoInfoMap.size / ATLAS_COLS);
    const atlasHeight = atlasRows * PHOTO_SIZE;

    validCells.forEach((cell, i) => {
      const info = photoInfoMap.get(cell.photoId!)!;
      const offset = i * 8;

      // Position in canvas coordinates
      data[offset + 0] = cell.x;
      data[offset + 1] = cell.y;
      data[offset + 2] = cellWidth;
      data[offset + 3] = cellHeight;

      // UV coordinates normalized to 0-1
      data[offset + 4] = info.atlasRect.x / atlasWidth;
      data[offset + 5] = info.atlasRect.y / atlasHeight;
      data[offset + 6] = info.atlasRect.width / atlasWidth;
      data[offset + 7] = info.atlasRect.height / atlasHeight;
    });

    return { data, count: validCells.length };
  }, [cells, photoInfoMap, cellWidth, cellHeight]);

  // Load atlas texture
  const loadAtlasTexture = useCallback(
    async (device: GPUDevice): Promise<GPUTexture | null> => {
      try {
        // Resolve the asset URI
        const resolved = Image.resolveAssetSource(
          require('../assets/photo-atlas.jpg'),
        );

        if (!resolved?.uri) {
          console.error('[WebGPU Mosaic] Failed to resolve atlas URI');
          return null;
        }

        // Fetch the image as ArrayBuffer (react-native-wgpu createImageBitmap expects ArrayBuffer, not Blob)
        const response = await fetch(resolved.uri);
        const arrayBuffer = await response.arrayBuffer();
        const imageBitmap = await createImageBitmap(arrayBuffer);

        // Create GPU texture
        const texture = device.createTexture({
          size: [imageBitmap.width, imageBitmap.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Copy image to texture
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

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current || isInitializedRef.current) return;
    if (cells.length === 0 || photoInfoMap.size === 0) return;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      console.error('[WebGPU Mosaic] Failed to get context');
      return;
    }

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) {
        console.error('[WebGPU Mosaic] No adapter available');
        return;
      }

      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      const canvas = context.canvas as HTMLCanvasElement;
      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();

      context.configure({ device, format, alphaMode: 'premultiplied' });

      // Load atlas texture
      const atlasTexture = await loadAtlasTexture(device);
      if (!atlasTexture) {
        console.error('[WebGPU Mosaic] Atlas texture not available');
        return;
      }

      // Create buffers
      const buffers: GPUBuffer[] = [];

      // Uniform buffer
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(uniformBuffer);

      // Build tile data
      const { data: tileData, count: tileCount } = buildTileData();

      // Tile storage buffer
      const tileBuffer = device.createBuffer({
        size: Math.max(tileData.byteLength, 32), // Minimum 32 bytes
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        tileBuffer,
        0,
        tileData as unknown as BufferSource,
      );
      buffers.push(tileBuffer);

      // Create sampler
      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });

      // Create bind group layout
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

      // Create pipeline
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
          targets: [
            {
              format,
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
            },
          ],
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
      startRenderLoop();
    } catch (e) {
      console.error('[WebGPU Mosaic] Initialization failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasRef,
    cleanup,
    buildTileData,
    loadAtlasTexture,
    cells.length,
    photoInfoMap.size,
  ]);

  const render = useCallback(() => {
    if (!resourcesRef.current) {
      return;
    }

    const { device, context, pipeline, bindGroup, uniformBuffer, tileCount } =
      resourcesRef.current;

    const now = Date.now();
    const time = (now - startTimeRef.current) / 1000;

    // Calculate atlas dimensions
    const atlasWidth = ATLAS_COLS * PHOTO_SIZE;
    const atlasRows = Math.ceil(photoInfoMap.size / ATLAS_COLS);
    const atlasHeight = atlasRows * PHOTO_SIZE;

    // Update uniforms
    const uniformData = new Float32Array([
      canvasWidth,
      canvasHeight,
      atlasWidth,
      atlasHeight,
      CONTRAST,
      time,
      0, // padding
      0, // padding
    ]);
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      uniformData as unknown as BufferSource,
    );

    // Render
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
    renderPass.draw(6, tileCount); // 6 vertices per tile, tileCount instances
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    context.present();

    animationRef.current = requestAnimationFrame(render);
  }, [canvasWidth, canvasHeight, photoInfoMap.size]);

  const startRenderLoop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(render);
  }, [render]);

  // Update tile buffer when cells change
  useEffect(() => {
    if (!resourcesRef.current || cells.length === 0) return;

    const { device, tileBuffer } = resourcesRef.current;
    const { data: tileData, count: tileCount } = buildTileData();

    // Check if buffer needs to be resized
    if (tileData.byteLength > tileBuffer.size) {
      console.log('[WebGPU Mosaic] Resizing tile buffer');
      // Need to recreate buffer - for now just log warning
      // Full re-initialization would be needed for resize
    }

    device.queue.writeBuffer(
      tileBuffer,
      0,
      tileData as unknown as BufferSource,
    );
    resourcesRef.current.tileCount = tileCount;
  }, [cells, buildTileData]);

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
