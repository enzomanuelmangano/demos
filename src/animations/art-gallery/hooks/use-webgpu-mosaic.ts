import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { SharedValue, withSpring } from 'react-native-reanimated';
import { CanvasRef } from 'react-native-wgpu';

import { mosaicVertexShader, mosaicFragmentShader } from '../shaders';

import type { PhotoInfo } from './use-photo-atlas';
import type { RGB } from '../types';

// Atlas configuration - 7 atlases, 40x40 photos each at 200px
const PHOTO_SIZE = 200;
const ATLAS_COLS = 40;
const ATLAS_ROWS = 40;
const ATLAS_COUNT = 7;
const ATLAS_WIDTH = ATLAS_COLS * PHOTO_SIZE; // 8000px
const ATLAS_HEIGHT = ATLAS_ROWS * PHOTO_SIZE; // 8000px
const CONTRAST = 1.4;

// Uniform buffer size (16 floats aligned)
const UNIFORM_BUFFER_SIZE = 64;

// Tile data: 12 floats per tile (padded for alignment)
const FLOATS_PER_TILE = 12;

// Static atlas asset requires (must be at module level for Metro bundling)
const ATLAS_ASSETS = [
  require('../assets/atlases/photo-atlas-0.jpg'),
  require('../assets/atlases/photo-atlas-1.jpg'),
  require('../assets/atlases/photo-atlas-2.jpg'),
  require('../assets/atlases/photo-atlas-3.jpg'),
  require('../assets/atlases/photo-atlas-4.jpg'),
  require('../assets/atlases/photo-atlas-5.jpg'),
  require('../assets/atlases/photo-atlas-6.jpg'),
];

// Prefetch cache - starts loading when component mounts
let prefetchPromise: Promise<SkData[]> | null = null;
let cachedSkData: SkData[] | null = null;

type SkData = ReturnType<typeof Skia.Data.fromBytes>;

export function startAtlasPrefetch(): Promise<SkData[]> {
  if (cachedSkData) {
    return Promise.resolve(cachedSkData);
  }
  if (prefetchPromise) {
    return prefetchPromise;
  }

  console.log('[Prefetch] Starting Skia.Data.fromURI for all atlases...');
  const startTime = Date.now();

  prefetchPromise = Promise.all(
    ATLAS_ASSETS.map(asset => {
      const resolved = Image.resolveAssetSource(asset);
      return Skia.Data.fromURI(resolved.uri);
    }),
  ).then(dataArray => {
    cachedSkData = dataArray;
    console.log(`[Prefetch] All atlas data loaded in ${Date.now() - startTime}ms`);
    return dataArray;
  });

  return prefetchPromise;
}

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
}

interface PhotoTileData {
  x: number;
  y: number;
  w: number;
  h: number;
  uvX: number;
  uvY: number;
  uvW: number;
  uvH: number;
  atlasIndex: number;
}

interface RNWebGPUContext extends GPUCanvasContext {
  present(): void;
}

interface GPUResources {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  tileBuffer: GPUBuffer;
  oldTileBuffer: GPUBuffer;
  atlasTextures: GPUTexture[];
  depthTexture: GPUTexture;
  buffers: GPUBuffer[];
  tileCount: number;
  bindGroupVersion: number;
}

interface UseWebGPUMosaicOptions {
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  screenWidth: number;
  screenHeight: number;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  animProgress: SharedValue<number>;
}

export function useWebGPUMosaic(
  canvasRef: React.RefObject<CanvasRef | null>,
  options: UseWebGPUMosaicOptions,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const [gpuReady, setGpuReady] = useState(false);

  // Atlas reveal animation (ref-based, updated in render loop)
  const atlasRevealRef = useRef({ current: 0, target: 0 });

  // Track where each photo was in the previous painting
  // Positions are stored as SCREEN-RELATIVE (centered, ready for display)
  const previousPhotoPositionsRef = useRef<Map<number, PhotoTileData> | null>(null);

  const uniformDataRef = useRef(new Float32Array(16));

  const {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    screenWidth,
    screenHeight,
    scale,
    translateX,
    translateY,
    animProgress,
  } = options;

  // Store dynamic values in refs to avoid recreating render callback
  // Note: paintingWidth/paintingHeight are no longer needed - centering is baked into tile positions
  const renderValuesRef = useRef({ screenWidth, screenHeight });
  renderValuesRef.current = { screenWidth, screenHeight };

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { atlasTextures, buffers, depthTexture } = resourcesRef.current;
      buffers.forEach(buffer => buffer.destroy());
      atlasTextures.forEach(texture => texture.destroy());
      depthTexture.destroy();
      resourcesRef.current = null;
    }

    isInitializedRef.current = false;
  }, []);

  // Create a 1x1 placeholder texture
  const createPlaceholderTexture = useCallback((device: GPUDevice): GPUTexture => {
    const texture = device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture },
      new Uint8Array([255, 0, 255, 255]), // Magenta placeholder (obvious)
      { bytesPerRow: 4 },
      [1, 1],
    );
    return texture;
  }, []);

  // Create bind group with current textures
  const createBindGroup = useCallback((
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    uniformBuffer: GPUBuffer,
    tileBuffer: GPUBuffer,
    oldTileBuffer: GPUBuffer,
    textures: GPUTexture[],
    sampler: GPUSampler,
  ): GPUBindGroup => {
    return device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: tileBuffer } },
        { binding: 2, resource: textures[0].createView() },
        { binding: 3, resource: textures[1].createView() },
        { binding: 4, resource: textures[2].createView() },
        { binding: 5, resource: textures[3].createView() },
        { binding: 6, resource: textures[4].createView() },
        { binding: 7, resource: textures[5].createView() },
        { binding: 8, resource: textures[6].createView() },
        { binding: 9, resource: sampler },
        { binding: 10, resource: { buffer: oldTileBuffer } },
      ],
    });
  }, []);


  // Decode atlas from SkData and upload to GPU
  const decodeAtlasToGPU = useCallback(
    async (
      device: GPUDevice,
      atlasIndex: number,
      data: SkData,
    ): Promise<GPUTexture | null> => {
      try {
        const t0 = Date.now();
        console.log(`[Atlas ${atlasIndex}] Starting decode...`);

        const skImage = Skia.Image.MakeImageFromEncoded(data);
        if (!skImage) {
          console.error(`[Atlas ${atlasIndex}] Skia decode failed`);
          return null;
        }
        const t1 = Date.now();
        console.log(`[Atlas ${atlasIndex}] MakeImageFromEncoded: ${t1-t0}ms`);

        const width = skImage.width();
        const height = skImage.height();
        console.log(`[Atlas ${atlasIndex}] Image size: ${width}x${height}`);

        // Read pixels from Skia image
        console.log(`[Atlas ${atlasIndex}] Starting readPixels...`);
        const pixels = skImage.readPixels(0, 0, {
          width,
          height,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Unpremul,
        });
        const t2 = Date.now();
        console.log(`[Atlas ${atlasIndex}] readPixels: ${t2-t1}ms (${pixels ? 'success' : 'failed'})`);

        if (!pixels) {
          console.error(`[Atlas ${atlasIndex}] Failed to read pixels`);
          return null;
        }

        // Create GPU texture
        console.log(`[Atlas ${atlasIndex}] Creating GPU texture...`);
        const t2b = Date.now();
        const texture = device.createTexture({
          size: [width, height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        const t2c = Date.now();
        console.log(`[Atlas ${atlasIndex}] createTexture: ${t2c-t2b}ms`);

        // Upload to GPU
        console.log(`[Atlas ${atlasIndex}] Starting writeTexture...`);
        device.queue.writeTexture(
          { texture },
          pixels,
          { bytesPerRow: width * 4, rowsPerImage: height },
          [width, height],
        );
        const t3 = Date.now();
        console.log(`[Atlas ${atlasIndex}] writeTexture: ${t3-t2c}ms`);

        console.log(`[Atlas ${atlasIndex}] TOTAL: decode=${t1-t0}ms readPixels=${t2-t1}ms createTex=${t2c-t2b}ms writeTex=${t3-t2c}ms total=${t3-t0}ms`);
        return texture;
      } catch (e) {
        console.error(`[Atlas ${atlasIndex}] Skia error:`, e);
        return null;
      }
    },
    [],
  );

  const render = useCallback(() => {
    if (!resourcesRef.current) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    const { device, context, pipeline, bindGroup, uniformBuffer, tileCount, depthTexture } =
      resourcesRef.current;

    const time = (Date.now() - startTimeRef.current) / 1000;

    // Smoothly animate atlas reveal toward target (in render loop for smoothness)
    const reveal = atlasRevealRef.current;
    if (reveal.current < reveal.target) {
      // ~0.03 per frame = ~1.8 units/sec, full reveal in ~4 seconds
      reveal.current = Math.min(reveal.current + 0.03, reveal.target);
    }
    const { screenWidth: sw, screenHeight: sh } = renderValuesRef.current;

    const uniformData = uniformDataRef.current;
    uniformData[0] = sw;
    uniformData[1] = sh;
    uniformData[2] = 0; // unused
    uniformData[3] = 0; // unused
    uniformData[4] = ATLAS_WIDTH;
    uniformData[5] = ATLAS_HEIGHT;
    uniformData[6] = CONTRAST;
    uniformData[7] = time;
    uniformData[8] = scale.value;
    uniformData[9] = translateX.value;
    uniformData[10] = translateY.value;
    uniformData[11] = animProgress.value; // SharedValue: 1 = old positions, 0 = new positions
    uniformData[12] = reveal.current; // Atlas reveal progress for random tile pop-in
    uniformData[13] = 0; // unused

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
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6, tileCount);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    context.present();

    animationRef.current = requestAnimationFrame(render);
  }, [scale, translateX, translateY, animProgress]);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current || isInitializedRef.current) return;
    if (photoInfoMap.size === 0) return;

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

      const buffers: GPUBuffer[] = [];

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(uniformBuffer);

      // Create buffers with max size to handle any painting (15000 tiles max)
      const MAX_TILES = 15000;
      const tileBufferSize = MAX_TILES * FLOATS_PER_TILE * 4;

      const tileBuffer = device.createBuffer({
        size: tileBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      buffers.push(tileBuffer);

      const oldTileBuffer = device.createBuffer({
        size: tileBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      buffers.push(oldTileBuffer);

      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      // Create placeholder textures for immediate rendering
      const atlasTextures: GPUTexture[] = [];
      for (let i = 0; i < ATLAS_COUNT; i++) {
        atlasTextures.push(createPlaceholderTexture(device));
      }

      // Bind group layout with 7 textures + oldTileBuffer
      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 9, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 10, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        ],
      });

      // Create initial bind group with placeholders
      const bindGroup = createBindGroup(
        device,
        bindGroupLayout,
        uniformBuffer,
        tileBuffer,
        oldTileBuffer,
        atlasTextures,
        sampler,
      );

      // Create depth texture for 3D effect z-ordering
      const depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      });

      resourcesRef.current = {
        device,
        context,
        pipeline,
        bindGroup,
        bindGroupLayout,
        sampler,
        uniformBuffer,
        tileBuffer,
        oldTileBuffer,
        atlasTextures,
        depthTexture,
        buffers,
        tileCount: 0,
        bindGroupVersion: 0,
      };

      isInitializedRef.current = true;
      startTimeRef.current = Date.now();
      setGpuReady(true);
      console.log('[WebGPU] Initialized with placeholders, starting render...');
      animationRef.current = requestAnimationFrame(render);

      // Load real atlases in background (sequential to avoid memory spikes)
      const loadAtlasesProgressively = async () => {
        console.log('[WebGPU] Starting progressive atlas loading...');
        const totalStart = Date.now();

        const skDataArray = await startAtlasPrefetch();
        console.log(`[WebGPU] Prefetch complete, decoding atlases...`);

        for (let i = 0; i < skDataArray.length; i++) {
          if (!resourcesRef.current) return; // Component unmounted

          const texture = await decodeAtlasToGPU(device, i, skDataArray[i]);
          if (!texture || !resourcesRef.current) return;

          // Destroy placeholder and swap in real texture
          const oldPlaceholder = resourcesRef.current.atlasTextures[i];
          resourcesRef.current.atlasTextures[i] = texture;
          oldPlaceholder.destroy();

          // Recreate bind group with updated texture
          resourcesRef.current.bindGroup = createBindGroup(
            device,
            bindGroupLayout,
            uniformBuffer,
            tileBuffer,
            oldTileBuffer,
            resourcesRef.current.atlasTextures,
            sampler,
          );
          resourcesRef.current.bindGroupVersion = i + 1;

          console.log(`[WebGPU] Atlas ${i + 1}/${ATLAS_COUNT} ready`);

          // Set reveal target - tiles will animate in the render loop
          atlasRevealRef.current.target = i + 1;
        }

        console.log(`[WebGPU] All atlases loaded in ${Date.now() - totalStart}ms`);
      };

      // Start loading in background (don't await)
      loadAtlasesProgressively();
    } catch (e) {
      console.error('[WebGPU Mosaic] Initialization failed:', e);
    }
  }, [canvasRef, createPlaceholderTexture, createBindGroup, decodeAtlasToGPU, photoInfoMap.size, render]);

  useEffect(() => {
    // Don't update buffers if cells is empty (waiting for consistent data)
    // This prevents glitchy frames during painting transitions
    console.log(`[Tiles] Effect triggered: gpuReady=${gpuReady}, cells=${cells.length}`);
    if (!gpuReady || !resourcesRef.current || cells.length === 0) return;

    const { device, tileBuffer, oldTileBuffer } = resourcesRef.current;

    // Get valid cells (those with photos)
    const validCells = cells.filter(
      cell => cell.photoId !== null && photoInfoMap.has(cell.photoId),
    );

    const prevPositions = previousPhotoPositionsRef.current;
    const hasAnimation = prevPositions && prevPositions.size > 0;

    // Find photos that are disappearing (in old but not in new)
    const newPhotoIds = new Set(validCells.map(c => c.photoId!));
    const disappearingPhotos: PhotoTileData[] = [];
    if (hasAnimation) {
      for (const [photoId, tileData] of prevPositions) {
        if (!newPhotoIds.has(photoId)) {
          disappearingPhotos.push(tileData);
        }
      }
    }

    // Total tiles = new painting tiles + disappearing tiles
    const totalTileCount = validCells.length + disappearingPhotos.length;

    // Build combined tile data arrays
    const tileData = new Float32Array(totalTileCount * FLOATS_PER_TILE);
    const oldTileData = new Float32Array(totalTileCount * FLOATS_PER_TILE);

    let movingCount = 0;
    let appearingCount = 0;
    let disappearingCount = disappearingPhotos.length;

    // Process new painting tiles
    // Positions are ALREADY screen-relative (centered in index.tsx)
    validCells.forEach((cell, i) => {
      const offset = i * FLOATS_PER_TILE;
      const photoId = cell.photoId!;
      const info = photoInfoMap.get(photoId)!;

      // Use position directly - already screen-relative
      tileData[offset + 0] = cell.x;
      tileData[offset + 1] = cell.y;
      tileData[offset + 2] = cellWidth;
      tileData[offset + 3] = cellHeight;
      tileData[offset + 4] = info.atlasRect.x / ATLAS_WIDTH;
      tileData[offset + 5] = info.atlasRect.y / ATLAS_HEIGHT;
      tileData[offset + 6] = info.atlasRect.width / ATLAS_WIDTH;
      tileData[offset + 7] = info.atlasRect.height / ATLAS_HEIGHT;
      tileData[offset + 8] = info.atlasIndex;

      // Old tile data - already screen-relative from when it was stored
      const oldPos = hasAnimation ? prevPositions.get(photoId) : null;
      if (oldPos) {
        oldTileData[offset + 0] = oldPos.x;
        oldTileData[offset + 1] = oldPos.y;
        oldTileData[offset + 2] = oldPos.w;
        oldTileData[offset + 3] = oldPos.h;
        movingCount++;
      } else {
        // Photo is new - grow from size 0 at center of new position
        oldTileData[offset + 0] = cell.x + cellWidth / 2;
        oldTileData[offset + 1] = cell.y + cellHeight / 2;
        oldTileData[offset + 2] = 0;
        oldTileData[offset + 3] = 0;
        appearingCount++;
      }
      oldTileData[offset + 4] = tileData[offset + 4];
      oldTileData[offset + 5] = tileData[offset + 5];
      oldTileData[offset + 6] = tileData[offset + 6];
      oldTileData[offset + 7] = tileData[offset + 7];
      oldTileData[offset + 8] = tileData[offset + 8];
    });

    // Process disappearing tiles - already screen-relative
    disappearingPhotos.forEach((oldPos, i) => {
      const offset = (validCells.length + i) * FLOATS_PER_TILE;

      oldTileData[offset + 0] = oldPos.x;
      oldTileData[offset + 1] = oldPos.y;
      oldTileData[offset + 2] = oldPos.w;
      oldTileData[offset + 3] = oldPos.h;
      oldTileData[offset + 4] = oldPos.uvX;
      oldTileData[offset + 5] = oldPos.uvY;
      oldTileData[offset + 6] = oldPos.uvW;
      oldTileData[offset + 7] = oldPos.uvH;
      oldTileData[offset + 8] = oldPos.atlasIndex;

      // Shrink to size 0 at center of old position
      tileData[offset + 0] = oldPos.x + oldPos.w / 2;
      tileData[offset + 1] = oldPos.y + oldPos.h / 2;
      tileData[offset + 2] = 0;
      tileData[offset + 3] = 0;
      tileData[offset + 4] = oldPos.uvX;
      tileData[offset + 5] = oldPos.uvY;
      tileData[offset + 6] = oldPos.uvW;
      tileData[offset + 7] = oldPos.uvH;
      tileData[offset + 8] = oldPos.atlasIndex;
    });

    // Write buffers
    device.queue.writeBuffer(oldTileBuffer, 0, oldTileData as unknown as BufferSource);
    device.queue.writeBuffer(tileBuffer, 0, tileData as unknown as BufferSource);
    resourcesRef.current.tileCount = totalTileCount;

    if (hasAnimation) {
      console.log(`[WebGPU] Animation: ${movingCount} moving, ${appearingCount} appearing, ${disappearingCount} disappearing`);
      // Start animation: set to 1 (old positions) then animate to 0 (new positions)
      animProgress.value = 1;
      animProgress.value = withSpring(0, {
        duration: 1000,
        dampingRatio: 1,
      });
    } else {
      console.log(`[WebGPU] First load: ${totalTileCount} tiles`);
      animProgress.value = 0;
    }

    // Save current photo positions (already screen-relative)
    const currentPositions = new Map<number, PhotoTileData>();
    validCells.forEach((cell) => {
      if (cell.photoId !== null) {
        const info = photoInfoMap.get(cell.photoId)!;
        currentPositions.set(cell.photoId, {
          x: cell.x,  // Already screen-relative
          y: cell.y,
          w: cellWidth,
          h: cellHeight,
          uvX: info.atlasRect.x / ATLAS_WIDTH,
          uvY: info.atlasRect.y / ATLAS_HEIGHT,
          uvW: info.atlasRect.width / ATLAS_WIDTH,
          uvH: info.atlasRect.height / ATLAS_HEIGHT,
          atlasIndex: info.atlasIndex,
        });
      }
    });
    previousPhotoPositionsRef.current = currentPositions;
  }, [gpuReady, cells, photoInfoMap, cellWidth, cellHeight]);

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
