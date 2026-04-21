import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { SharedValue } from 'react-native-reanimated';
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
  atlasTextures: GPUTexture[];
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

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (resourcesRef.current) {
      const { atlasTextures, buffers } = resourcesRef.current;
      buffers.forEach(buffer => buffer.destroy());
      atlasTextures.forEach(texture => texture.destroy());
      resourcesRef.current = null;
    }

    isInitializedRef.current = false;
  }, []);

  const buildTileData = useCallback((): {
    data: Float32Array;
    count: number;
  } => {
    const validCells = cells.filter(
      cell => cell.photoId !== null && photoInfoMap.has(cell.photoId),
    );

    const data = new Float32Array(validCells.length * FLOATS_PER_TILE);

    validCells.forEach((cell, i) => {
      const info = photoInfoMap.get(cell.photoId!)!;
      const offset = i * FLOATS_PER_TILE;

      data[offset + 0] = cell.x;
      data[offset + 1] = cell.y;
      data[offset + 2] = cellWidth;
      data[offset + 3] = cellHeight;
      data[offset + 4] = info.atlasRect.x / ATLAS_WIDTH;
      data[offset + 5] = info.atlasRect.y / ATLAS_HEIGHT;
      data[offset + 6] = info.atlasRect.width / ATLAS_WIDTH;
      data[offset + 7] = info.atlasRect.height / ATLAS_HEIGHT;
      data[offset + 8] = info.atlasIndex;
    });

    return { data, count: validCells.length };
  }, [cells, photoInfoMap, cellWidth, cellHeight]);

  // Fetch ArrayBuffer for an atlas
  const fetchAtlasBuffer = useCallback(
    async (atlasIndex: number): Promise<ArrayBuffer | null> => {
      try {
        const resolved = Image.resolveAssetSource(ATLAS_ASSETS[atlasIndex]);
        if (!resolved?.uri) return null;

        const response = await fetch(resolved.uri);
        return response.arrayBuffer();
      } catch {
        return null;
      }
    },
    [],
  );

  // Decode using Skia (potentially faster than createImageBitmap)
  const decodeWithSkia = useCallback(
    async (
      device: GPUDevice,
      atlasIndex: number,
      arrayBuffer: ArrayBuffer,
    ): Promise<GPUTexture | null> => {
      try {
        const t0 = Date.now();

        // Decode with Skia
        const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
        const skImage = Skia.Image.MakeImageFromEncoded(data);
        if (!skImage) {
          console.error(`[Atlas ${atlasIndex}] Skia decode failed`);
          return null;
        }
        const t1 = Date.now();

        const width = skImage.width();
        const height = skImage.height();

        // Read pixels from Skia image
        const pixels = skImage.readPixels(0, 0, {
          width,
          height,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Unpremul,
        });
        const t2 = Date.now();

        if (!pixels) {
          console.error(`[Atlas ${atlasIndex}] Failed to read pixels`);
          return null;
        }

        // Create GPU texture and upload
        const texture = device.createTexture({
          size: [width, height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        device.queue.writeTexture(
          { texture },
          pixels,
          { bytesPerRow: width * 4, rowsPerImage: height },
          [width, height],
        );
        const t3 = Date.now();

        console.log(`[Atlas ${atlasIndex} Skia] decode=${t1-t0}ms pixels=${t2-t1}ms gpu=${t3-t2}ms total=${t3-t0}ms`);
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

    const { device, context, pipeline, bindGroup, uniformBuffer, tileCount } =
      resourcesRef.current;

    const time = (Date.now() - startTimeRef.current) / 1000;

    const uniformData = uniformDataRef.current;
    uniformData[0] = screenWidth;
    uniformData[1] = screenHeight;
    uniformData[2] = paintingWidth;
    uniformData[3] = paintingHeight;
    uniformData[4] = ATLAS_WIDTH;
    uniformData[5] = ATLAS_HEIGHT;
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

      // Pipeline approach: fetch all in parallel, decode with Skia
      const atlasStart = Date.now();

      // Step 1: Start all fetches in parallel
      console.log('[WebGPU] Starting parallel fetch...');
      const fetchStart = Date.now();
      const imageBufferPromises = Array.from({ length: ATLAS_COUNT }, (_, i) =>
        fetchAtlasBuffer(i),
      );
      const imageBuffers = await Promise.all(imageBufferPromises);
      console.log(`[WebGPU] All fetches complete: ${Date.now() - fetchStart}ms`);

      // Step 2: Decode with Skia in parallel batches of 2
      console.log('[WebGPU] Decoding with Skia (parallel x2)...');
      const decodeStart = Date.now();
      const atlasTextures: (GPUTexture | null)[] = new Array(ATLAS_COUNT).fill(null);

      const DECODE_BATCH = 7;
      for (let batch = 0; batch < ATLAS_COUNT; batch += DECODE_BATCH) {
        const batchIndices: number[] = [];
        for (let i = batch; i < Math.min(batch + DECODE_BATCH, ATLAS_COUNT); i++) {
          batchIndices.push(i);
        }

        const batchStart = Date.now();
        const batchResults = await Promise.all(
          batchIndices.map(async (i) => {
            const imgBuffer = imageBuffers[i];
            if (!imgBuffer) return null;
            return decodeWithSkia(device, i, imgBuffer);
          }),
        );
        console.log(`[Batch ${batch / DECODE_BATCH}] ${batchIndices.join(',')} done in ${Date.now() - batchStart}ms`);

        for (let j = 0; j < batchResults.length; j++) {
          if (!batchResults[j]) {
            console.error(`[WebGPU] Failed to decode atlas ${batchIndices[j]}`);
            return;
          }
          atlasTextures[batchIndices[j]] = batchResults[j];
        }
      }

      // Filter out nulls and verify we have all textures
      const validTextures = atlasTextures.filter((t): t is GPUTexture => t !== null);
      if (validTextures.length !== ATLAS_COUNT) {
        console.error('[WebGPU] Missing atlas textures');
        return;
      }

      console.log(`[WebGPU] All decodes complete: ${Date.now() - decodeStart}ms`);
      console.log(`[WebGPU] Total atlas loading: ${Date.now() - atlasStart}ms`);

      const buffers: GPUBuffer[] = [];

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(uniformBuffer);

      const { data: tileData, count: tileCount } = buildTileData();
      console.log(`[WebGPU] Built ${tileCount} tiles`);

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

      // Bind group layout with 7 textures
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
        ],
      });

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: tileBuffer } },
          { binding: 2, resource: validTextures[0].createView() },
          { binding: 3, resource: validTextures[1].createView() },
          { binding: 4, resource: validTextures[2].createView() },
          { binding: 5, resource: validTextures[3].createView() },
          { binding: 6, resource: validTextures[4].createView() },
          { binding: 7, resource: validTextures[5].createView() },
          { binding: 8, resource: validTextures[6].createView() },
          { binding: 9, resource: sampler },
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
        atlasTextures,
        buffers,
        tileCount,
      };

      isInitializedRef.current = true;
      startTimeRef.current = Date.now();
      console.log(`[WebGPU] Starting render loop with ${tileCount} tiles`);
      animationRef.current = requestAnimationFrame(render);
    } catch (e) {
      console.error('[WebGPU Mosaic] Initialization failed:', e);
    }
  }, [
    canvasRef,
    buildTileData,
    fetchAtlasBuffer,
    decodeWithSkia,
    cells.length,
    photoInfoMap.size,
    render,
  ]);

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
