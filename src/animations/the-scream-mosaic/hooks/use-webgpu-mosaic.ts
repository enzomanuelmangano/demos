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

// High-res cache configuration
const HIGH_RES_SIZE = 512; // Size of each high-res tile (reduced for compatibility)
const HIGH_RES_COLS = 4; // 4x4 grid = 16 cache slots
const HIGH_RES_CACHE_SIZE = HIGH_RES_COLS * HIGH_RES_SIZE; // 2048x2048 texture

// Uniform buffer size: 16 floats * 4 bytes = 64 bytes
// [screenW, screenH, paintingW, paintingH, atlasW, atlasH, contrast, time, highResCols, highResSize, scale, translateX, translateY, padding...]
const UNIFORM_BUFFER_SIZE = 80;

// Tile data: 10 floats per tile
const FLOATS_PER_TILE = 10;

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

interface HighResCacheSlot {
  cellIndex: number;
  photoId: number;
  lastUsed: number;
}

interface GPUResources {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  uniformBuffer: GPUBuffer;
  tileBuffer: GPUBuffer;
  atlasTexture: GPUTexture;
  highResTexture: GPUTexture;
  sampler: GPUSampler;
  buffers: GPUBuffer[];
  tileCount: number;
}

interface UseWebGPUMosaicOptions {
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  // Painting dimensions (for tile positioning)
  paintingWidth: number;
  paintingHeight: number;
  // Screen dimensions (for full-screen canvas)
  screenWidth: number;
  screenHeight: number;
  visibleCells?: { row: number; col: number }[];
  gridCols: number;
  // Transform SharedValues (read .value in render loop for real-time updates)
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
  const frameCountRef = useRef(0);

  // High-res cache state
  const highResCacheRef = useRef<Map<number, HighResCacheSlot>>(new Map());
  const cellToSlotRef = useRef<Map<number, number>>(new Map());
  const loadingCellsRef = useRef<Set<number>>(new Set());
  const tileDataRef = useRef<Float32Array | null>(null);

  const {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    paintingWidth,
    paintingHeight,
    screenWidth,
    screenHeight,
    visibleCells,
    gridCols,
    scale,
    translateX,
    translateY,
  } = options;

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { atlasTexture, highResTexture, buffers } = resourcesRef.current;
      buffers.forEach(buffer => buffer.destroy());
      atlasTexture.destroy();
      highResTexture.destroy();
      resourcesRef.current = null;
    }

    highResCacheRef.current.clear();
    cellToSlotRef.current.clear();
    loadingCellsRef.current.clear();
    isInitializedRef.current = false;
  }, []);

  // Find free slot or evict LRU
  const getAvailableSlot = useCallback((): number => {
    const cache = highResCacheRef.current;
    const maxSlots = HIGH_RES_COLS * HIGH_RES_COLS;

    // Find empty slot
    for (let i = 0; i < maxSlots; i++) {
      if (!cache.has(i)) {
        return i;
      }
    }

    // Evict LRU slot
    let oldestSlot = 0;
    let oldestTime = Infinity;
    cache.forEach((slot, index) => {
      if (slot.lastUsed < oldestTime) {
        oldestTime = slot.lastUsed;
        oldestSlot = index;
      }
    });

    // Remove from cellToSlot mapping
    const evictedSlot = cache.get(oldestSlot);
    if (evictedSlot) {
      cellToSlotRef.current.delete(evictedSlot.cellIndex);
    }
    cache.delete(oldestSlot);

    return oldestSlot;
  }, []);

  // Load high-res image for a cell
  const loadHighResImage = useCallback(
    async (cellIndex: number, photoId: number) => {
      if (!resourcesRef.current) return;
      if (loadingCellsRef.current.has(cellIndex)) return;
      if (cellToSlotRef.current.has(cellIndex)) return;

      loadingCellsRef.current.add(cellIndex);

      try {
        const { device, highResTexture } = resourcesRef.current;
        const url = `https://picsum.photos/seed/mosaic-${photoId}/${HIGH_RES_SIZE}/${HIGH_RES_SIZE}`;

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const imageBitmap = await createImageBitmap(arrayBuffer);

        // Get available slot
        const slot = getAvailableSlot();
        const slotCol = slot % HIGH_RES_COLS;
        const slotRow = Math.floor(slot / HIGH_RES_COLS);

        // Copy to texture at slot position
        device.queue.copyExternalImageToTexture(
          { source: imageBitmap },
          {
            texture: highResTexture,
            origin: [slotCol * HIGH_RES_SIZE, slotRow * HIGH_RES_SIZE],
          },
          [HIGH_RES_SIZE, HIGH_RES_SIZE],
        );

        // Update cache
        highResCacheRef.current.set(slot, {
          cellIndex,
          photoId,
          lastUsed: Date.now(),
        });
        cellToSlotRef.current.set(cellIndex, slot);

        // Update tile data with new slot
        if (tileDataRef.current && resourcesRef.current) {
          const tileIndex = cells.findIndex(c => c.index === cellIndex);
          if (tileIndex >= 0) {
            tileDataRef.current[tileIndex * FLOATS_PER_TILE + 8] = slot;
            device.queue.writeBuffer(
              resourcesRef.current.tileBuffer,
              0,
              tileDataRef.current as unknown as BufferSource,
            );
          }
        }
      } catch (e) {
        console.error(
          `[WebGPU] Failed to load high-res for cell ${cellIndex}:`,
          e,
        );
      } finally {
        loadingCellsRef.current.delete(cellIndex);
      }
    },
    [cells, getAvailableSlot],
  );

  // Build tile data with high-res slot info
  const buildTileData = useCallback((): {
    data: Float32Array;
    count: number;
  } => {
    const validCells = cells.filter(
      cell => cell.photoId !== null && photoInfoMap.has(cell.photoId),
    );

    const data = new Float32Array(validCells.length * FLOATS_PER_TILE);

    const atlasWidth = ATLAS_COLS * PHOTO_SIZE;
    const atlasRows = Math.ceil(photoInfoMap.size / ATLAS_COLS);
    const atlasHeight = atlasRows * PHOTO_SIZE;

    validCells.forEach((cell, i) => {
      const info = photoInfoMap.get(cell.photoId!)!;
      const offset = i * FLOATS_PER_TILE;

      data[offset + 0] = cell.x;
      data[offset + 1] = cell.y;
      data[offset + 2] = cellWidth;
      data[offset + 3] = cellHeight;
      data[offset + 4] = info.atlasRect.x / atlasWidth;
      data[offset + 5] = info.atlasRect.y / atlasHeight;
      data[offset + 6] = info.atlasRect.width / atlasWidth;
      data[offset + 7] = info.atlasRect.height / atlasHeight;
      data[offset + 8] = cellToSlotRef.current.get(cell.index) ?? -1;
      data[offset + 9] = 0; // padding
    });

    tileDataRef.current = data;
    return { data, count: validCells.length };
  }, [cells, photoInfoMap, cellWidth, cellHeight]);

  // Load atlas texture
  const loadAtlasTexture = useCallback(
    async (device: GPUDevice): Promise<GPUTexture | null> => {
      try {
        const resolved = Image.resolveAssetSource(
          require('../assets/photo-atlas.jpg'),
        );

        if (!resolved?.uri) {
          console.error('[WebGPU Mosaic] Failed to resolve atlas URI');
          return null;
        }

        const response = await fetch(resolved.uri);
        const arrayBuffer = await response.arrayBuffer();
        const imageBitmap = await createImageBitmap(arrayBuffer);
        console.log(
          `[WebGPU Mosaic] Atlas loaded: ${imageBitmap.width}x${imageBitmap.height}`,
        );

        const texture = device.createTexture({
          size: [imageBitmap.width, imageBitmap.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
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

  // Create high-res cache texture and initialize with black
  const createHighResTexture = useCallback((device: GPUDevice): GPUTexture => {
    console.log(
      `[WebGPU Mosaic] Creating high-res cache texture: ${HIGH_RES_CACHE_SIZE}x${HIGH_RES_CACHE_SIZE}`,
    );
    try {
      const texture = device.createTexture({
        size: [HIGH_RES_CACHE_SIZE, HIGH_RES_CACHE_SIZE],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Initialize texture with black pixels using a render pass
      const commandEncoder = device.createCommandEncoder();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      renderPass.end();
      device.queue.submit([commandEncoder.finish()]);

      console.log(
        '[WebGPU Mosaic] High-res cache texture created and initialized',
      );
      return texture;
    } catch (e) {
      console.error('[WebGPU Mosaic] Failed to create high-res texture:', e);
      // Create a tiny fallback texture
      return device.createTexture({
        size: [1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    }
  }, []);

  const initWebGPU = useCallback(async () => {
    console.log(
      `[WebGPU Mosaic] initWebGPU called - canvas: ${!!canvasRef.current}, initialized: ${isInitializedRef.current}, cells: ${cells.length}, photos: ${photoInfoMap.size}`,
    );
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
      const pixelRatio = PixelRatio.get();
      canvas.width = canvas.clientWidth * pixelRatio;
      canvas.height = canvas.clientHeight * pixelRatio;
      console.log(
        `[WebGPU Mosaic] Canvas: ${canvas.width}x${canvas.height} (ratio: ${pixelRatio})`,
      );

      context.configure({ device, format, alphaMode: 'premultiplied' });

      // Load textures
      const atlasTexture = await loadAtlasTexture(device);
      if (!atlasTexture) {
        console.error('[WebGPU Mosaic] Atlas texture not available');
        return;
      }

      console.log('[WebGPU Mosaic] Creating high-res texture...');
      const highResTexture = createHighResTexture(device);
      console.log('[WebGPU Mosaic] High-res texture created');

      // Create buffers
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

      // Create samplers (no mipmapFilter since we don't generate mipmaps)
      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      // Create bind group layout with high-res texture
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
          {
            binding: 4,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 5,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' },
          },
        ],
      });

      console.log('[WebGPU Mosaic] Creating bind group...');
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: tileBuffer } },
          { binding: 2, resource: atlasTexture.createView() },
          { binding: 3, resource: sampler },
          { binding: 4, resource: highResTexture.createView() },
          { binding: 5, resource: sampler },
        ],
      });
      console.log('[WebGPU Mosaic] Bind group created');

      console.log('[WebGPU Mosaic] Creating render pipeline...');
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

      console.log('[WebGPU Mosaic] Pipeline created successfully');

      resourcesRef.current = {
        device,
        context,
        pipeline,
        bindGroup,
        bindGroupLayout,
        uniformBuffer,
        tileBuffer,
        atlasTexture,
        highResTexture,
        sampler,
        buffers,
        tileCount,
      };

      console.log(
        `[WebGPU Mosaic] Initialization complete, ${tileCount} tiles`,
      );
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
    createHighResTexture,
    cells.length,
    photoInfoMap.size,
  ]);

  const render = useCallback(() => {
    if (!resourcesRef.current) {
      console.log('[WebGPU Mosaic] Render: no resources');
      return;
    }

    frameCountRef.current++;
    if (frameCountRef.current <= 3) {
      console.log(`[WebGPU Mosaic] Render frame ${frameCountRef.current}`);
    }

    const { device, context, pipeline, bindGroup, uniformBuffer, tileCount } =
      resourcesRef.current;

    const now = Date.now();
    const time = (now - startTimeRef.current) / 1000;

    const atlasWidth = ATLAS_COLS * PHOTO_SIZE;
    const atlasRows = Math.ceil(photoInfoMap.size / ATLAS_COLS);
    const atlasHeight = atlasRows * PHOTO_SIZE;

    // Update uniforms (16 floats, padded to 20)
    // Read .value from SharedValues for real-time gesture updates
    const uniformData = new Float32Array([
      screenWidth,
      screenHeight,
      paintingWidth,
      paintingHeight,
      atlasWidth,
      atlasHeight,
      CONTRAST,
      time,
      HIGH_RES_COLS,
      HIGH_RES_SIZE,
      scale.value,
      translateX.value,
      translateY.value,
      0, // padding
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
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
    // Note: scale, translateX, translateY are SharedValues - we read .value inside
    // the render loop so they don't need to be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    screenWidth,
    screenHeight,
    paintingWidth,
    paintingHeight,
    photoInfoMap.size,
  ]);

  const startRenderLoop = useCallback(() => {
    console.log('[WebGPU Mosaic] Starting render loop');
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(render);
  }, [render]);

  // Load high-res images for visible cells
  useEffect(() => {
    if (!resourcesRef.current || !visibleCells || visibleCells.length === 0)
      return;

    visibleCells.forEach(({ row, col }) => {
      const cellIndex = row * gridCols + col;
      const cell = cells.find(c => c.index === cellIndex);
      if (cell && cell.photoId !== null) {
        // Update LRU timestamp if already cached
        const slot = cellToSlotRef.current.get(cellIndex);
        if (slot !== undefined) {
          const cacheEntry = highResCacheRef.current.get(slot);
          if (cacheEntry) {
            cacheEntry.lastUsed = Date.now();
          }
        } else {
          // Load high-res
          loadHighResImage(cellIndex, cell.photoId);
        }
      }
    });
  }, [visibleCells, gridCols, cells, loadHighResImage]);

  // Update tile buffer when cells or cache changes
  useEffect(() => {
    if (!resourcesRef.current || cells.length === 0) return;

    const { device, tileBuffer } = resourcesRef.current;
    const { data: tileData, count: tileCount } = buildTileData();

    if (tileData.byteLength > tileBuffer.size) {
      console.log('[WebGPU Mosaic] Tile buffer needs resize');
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
