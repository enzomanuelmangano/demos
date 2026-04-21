import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

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

  const loadAtlasTexture = useCallback(
    async (device: GPUDevice, atlasIndex: number): Promise<GPUTexture | null> => {
      try {
        console.log(`[WebGPU] Loading atlas ${atlasIndex}...`);

        let resolved;
        switch (atlasIndex) {
          case 0: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-0.jpg')); break;
          case 1: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-1.jpg')); break;
          case 2: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-2.jpg')); break;
          case 3: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-3.jpg')); break;
          case 4: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-4.jpg')); break;
          case 5: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-5.jpg')); break;
          case 6: resolved = Image.resolveAssetSource(require('../assets/atlases/photo-atlas-6.jpg')); break;
          default: return null;
        }

        if (!resolved?.uri) {
          console.error(`[WebGPU] No URI for atlas ${atlasIndex}`);
          return null;
        }

        const response = await fetch(resolved.uri);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

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

        console.log(`[WebGPU] Loaded atlas ${atlasIndex}: ${imageBitmap.width}x${imageBitmap.height}`);
        return texture;
      } catch (e) {
        console.error(`[WebGPU Mosaic] Failed to load atlas ${atlasIndex}:`, e);
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

      // Load all 7 atlas textures
      const atlasTextures: GPUTexture[] = [];
      for (let i = 0; i < ATLAS_COUNT; i++) {
        const texture = await loadAtlasTexture(device, i);
        if (!texture) {
          console.error(`[WebGPU] Failed to load atlas ${i}`);
          return;
        }
        atlasTextures.push(texture);
      }

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
          { binding: 2, resource: atlasTextures[0].createView() },
          { binding: 3, resource: atlasTextures[1].createView() },
          { binding: 4, resource: atlasTextures[2].createView() },
          { binding: 5, resource: atlasTextures[3].createView() },
          { binding: 6, resource: atlasTextures[4].createView() },
          { binding: 7, resource: atlasTextures[5].createView() },
          { binding: 8, resource: atlasTextures[6].createView() },
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
    loadAtlasTexture,
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
