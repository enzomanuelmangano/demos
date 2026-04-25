import { PixelRatio, Image } from 'react-native';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { SharedValue, withSpring } from 'react-native-reanimated';
import { CanvasRef } from 'react-native-wgpu';

import {
  mosaicVertexShader,
  mosaicFragmentShader,
  backgroundVertexShader,
  backgroundFragmentShader,
} from '../shaders';

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

type SkData = ReturnType<typeof Skia.Data.fromBytes>;

// Load a single atlas by index
export async function loadAtlasData(index: number): Promise<SkData | null> {
  try {
    const resolved = Image.resolveAssetSource(ATLAS_ASSETS[index]);
    return Skia.Data.fromURI(resolved.uri);
  } catch {
    return null;
  }
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
  // Background rendering
  backgroundPipeline: GPURenderPipeline;
  backgroundBindGroup: GPUBindGroup;
  backgroundUniformBuffer: GPUBuffer;
}

interface UseWebGPUMosaicOptions {
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  cols: number;
  rows: number;
  screenWidth: number;
  screenHeight: number;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  animProgress: SharedValue<number>;
  currentRow: SharedValue<number>;
  currentCol: SharedValue<number>;
}

export function useWebGPUMosaic(
  canvasRef: React.RefObject<CanvasRef | null>,
  options: UseWebGPUMosaicOptions,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const isLoadingAtlasesRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const [gpuReady, setGpuReady] = useState(false);

  // Focus overlay intensity (1 when focused, 0 when not)
  const focusIntensityRef = useRef(0);
  // Current interpolated focus position (sent to shader)
  const focusPosRef = useRef({ x: -9999, y: -9999 });
  // Start position for move animation
  const startFocusPosRef = useRef({ x: -9999, y: -9999 });
  // Target focus position (where we're animating to)
  const targetFocusPosRef = useRef({ x: -9999, y: -9999 });
  // Track if we were focused (to detect focus on/off transitions)
  const wasFocusedRef = useRef(false);
  // Timestamp when transition started
  const transitionStartRef = useRef<number | null>(null);
  // Animation type: 'move' for cell-to-cell, 'fade-in', 'fade-out'
  const animTypeRef = useRef<'move' | 'fade-in' | 'fade-out' | null>(null);

  // Track where each photo was in the previous painting
  // Positions are stored as SCREEN-RELATIVE (centered, ready for display)
  const previousPhotoPositionsRef = useRef<Map<number, PhotoTileData> | null>(
    null,
  );

  const uniformDataRef = useRef(new Float32Array(16));

  const {
    cells,
    photoInfoMap,
    cellWidth,
    cellHeight,
    cols,
    rows,
    screenWidth,
    screenHeight,
    scale,
    translateX,
    translateY,
    animProgress,
    currentRow,
    currentCol,
  } = options;

  // Store dynamic values in refs to avoid recreating render callback
  // Note: paintingWidth/paintingHeight are no longer needed - centering is baked into tile positions
  const renderValuesRef = useRef({
    screenWidth,
    screenHeight,
    cols,
    rows,
    cellWidth,
    cellHeight,
  });
  renderValuesRef.current = {
    screenWidth,
    screenHeight,
    cols,
    rows,
    cellWidth,
    cellHeight,
  };

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
  const createPlaceholderTexture = useCallback(
    (device: GPUDevice): GPUTexture => {
      const texture = device.createTexture({
        size: [1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture },
        new Uint8Array([0, 0, 0, 0]), // Transparent placeholder
        { bytesPerRow: 4 },
        [1, 1],
      );
      return texture;
    },
    [],
  );

  // Create bind group with current textures
  const createBindGroup = useCallback(
    (
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
    },
    [],
  );

  // Decode atlas from SkData and upload to GPU
  const decodeAtlasToGPU = useCallback(
    async (device: GPUDevice, data: SkData): Promise<GPUTexture | null> => {
      try {
        const skImage = Skia.Image.MakeImageFromEncoded(data);
        if (!skImage) {
          return null;
        }

        const width = skImage.width();
        const height = skImage.height();

        const pixels = skImage.readPixels(0, 0, {
          width,
          height,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Unpremul,
        });

        // Dispose SkImage immediately after reading pixels to free memory
        if ('dispose' in skImage && typeof skImage.dispose === 'function') {
          skImage.dispose();
        }

        if (!pixels) {
          return null;
        }

        const texture = device.createTexture({
          size: [width, height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        device.queue.writeTexture(
          { texture },
          pixels.buffer,
          { bytesPerRow: width * 4, rowsPerImage: height },
          [width, height],
        );

        return texture;
      } catch {
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

    const {
      device,
      context,
      pipeline,
      bindGroup,
      uniformBuffer,
      tileCount,
      depthTexture,
      backgroundPipeline,
      backgroundBindGroup,
      backgroundUniformBuffer,
    } = resourcesRef.current;

    const time = (Date.now() - startTimeRef.current) / 1000;

    const {
      screenWidth: sw,
      screenHeight: sh,
      cols: numCols,
      rows: numRows,
      cellWidth: cw,
      cellHeight: ch,
    } = renderValuesRef.current;

    // Compute focused tile center in screen-relative coords
    const focusRow = currentRow.value;
    const focusCol = currentCol.value;
    const hasFocus = focusRow >= 0;

    const now = Date.now();
    const ANIM_DURATION = 500; // 500ms for all animations

    // Calculate target position for current focus
    const newTargetX = hasFocus ? (focusCol + 0.5 - numCols / 2) * cw : -9999;
    const newTargetY = hasFocus ? (focusRow + 0.5 - numRows / 2) * ch : -9999;

    // Detect state changes
    const wasFocused = wasFocusedRef.current;
    const targetChanged =
      newTargetX !== targetFocusPosRef.current.x ||
      newTargetY !== targetFocusPosRef.current.y;

    if (targetChanged) {
      if (!wasFocused && hasFocus) {
        // Unfocused → Focused: fade in
        animTypeRef.current = 'fade-in';
        focusPosRef.current = { x: newTargetX, y: newTargetY };
        targetFocusPosRef.current = { x: newTargetX, y: newTargetY };
        transitionStartRef.current = now;
        wasFocusedRef.current = true;
      } else if (wasFocused && !hasFocus) {
        // Focused → Unfocused: fade out
        animTypeRef.current = 'fade-out';
        targetFocusPosRef.current = { x: -9999, y: -9999 };
        transitionStartRef.current = now;
        wasFocusedRef.current = false;
      } else if (wasFocused && hasFocus) {
        // Cell → Cell: interpolate position
        animTypeRef.current = 'move';
        startFocusPosRef.current = { ...focusPosRef.current }; // Save start position
        targetFocusPosRef.current = { x: newTargetX, y: newTargetY };
        transitionStartRef.current = now;
      }
    }

    // Run animation
    if (transitionStartRef.current !== null && animTypeRef.current) {
      const elapsed = now - transitionStartRef.current;
      const progress = Math.min(elapsed / ANIM_DURATION, 1);
      // Ease-out curve for smoother animation
      const eased = 1 - Math.pow(1 - progress, 2);

      if (animTypeRef.current === 'fade-in') {
        focusIntensityRef.current = eased;
      } else if (animTypeRef.current === 'fade-out') {
        focusIntensityRef.current = 1 - eased;
      } else if (animTypeRef.current === 'move') {
        // Interpolate position from start to target
        const startX = startFocusPosRef.current.x;
        const startY = startFocusPosRef.current.y;
        const endX = targetFocusPosRef.current.x;
        const endY = targetFocusPosRef.current.y;
        focusPosRef.current = {
          x: startX + (endX - startX) * eased,
          y: startY + (endY - startY) * eased,
        };
      }

      if (progress >= 1) {
        transitionStartRef.current = null;
        animTypeRef.current = null;
        if (hasFocus) {
          focusPosRef.current = targetFocusPosRef.current;
          focusIntensityRef.current = 1;
        } else {
          focusPosRef.current = { x: -9999, y: -9999 };
          focusIntensityRef.current = 0;
        }
      }
    }

    const focusedX = focusPosRef.current.x;
    const focusedY = focusPosRef.current.y;

    const uniformData = uniformDataRef.current;
    uniformData[0] = sw;
    uniformData[1] = sh;
    uniformData[2] = focusedX; // Focused tile center X (screen-relative, -9999 = none)
    uniformData[3] = focusedY; // Focused tile center Y (screen-relative, -9999 = none)
    uniformData[4] = ATLAS_WIDTH;
    uniformData[5] = ATLAS_HEIGHT;
    uniformData[6] = CONTRAST;
    uniformData[7] = time;
    uniformData[8] = scale.value;
    uniformData[9] = translateX.value;
    uniformData[10] = translateY.value;
    uniformData[11] = animProgress.value; // SharedValue: 1 = old positions, 0 = new positions
    uniformData[12] = ATLAS_COUNT; // All tiles visible immediately (no reveal animation)
    uniformData[13] = cw;
    uniformData[14] = ch;
    uniformData[15] = focusIntensityRef.current; // Smooth focus transition

    device.queue.writeBuffer(
      uniformBuffer,
      0,
      uniformData as unknown as BufferSource,
    );

    // Write background uniforms (actual canvas pixel dimensions for fragCoord)
    const canvas = context.canvas as HTMLCanvasElement;
    const bgUniformData = new Float32Array([canvas.width, canvas.height]);
    device.queue.writeBuffer(
      backgroundUniformBuffer,
      0,
      bgUniformData as unknown as BufferSource,
    );

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    // First pass: render background gradient (no depth)
    const bgPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    bgPass.setPipeline(backgroundPipeline);
    bgPass.setBindGroup(0, backgroundBindGroup);
    bgPass.draw(3); // Fullscreen triangle
    bgPass.end();

    // Second pass: render tiles on top (with depth)
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'load', // Keep the background
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

    // Mark as initialized immediately to prevent race conditions
    isInitializedRef.current = true;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      isInitializedRef.current = false;
      return;
    }

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
            texture: { sampleType: 'float' },
          },
          {
            binding: 4,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 5,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 6,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 7,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 8,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 9,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' },
          },
          {
            binding: 10,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'read-only-storage' },
          },
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

      // Background pipeline (simpler - no depth, just fullscreen gradient)
      const backgroundUniformBuffer = device.createBuffer({
        size: 8, // 2 floats: screenWidth, screenHeight
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      buffers.push(backgroundUniformBuffer);

      const backgroundBindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const backgroundBindGroup = device.createBindGroup({
        layout: backgroundBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: backgroundUniformBuffer } },
        ],
      });

      const backgroundPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [backgroundBindGroupLayout],
        }),
        vertex: {
          module: device.createShaderModule({ code: backgroundVertexShader }),
          entryPoint: 'main',
        },
        fragment: {
          module: device.createShaderModule({ code: backgroundFragmentShader }),
          entryPoint: 'main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
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
        backgroundPipeline,
        backgroundBindGroup,
        backgroundUniformBuffer,
      };

      startTimeRef.current = Date.now();
      setGpuReady(true);
      animationRef.current = requestAnimationFrame(render);

      // Load atlases sequentially (one at a time: fetch + decode)
      const loadAtlasesProgressively = async () => {
        // Ensure only one loading sequence runs
        if (isLoadingAtlasesRef.current) return;
        isLoadingAtlasesRef.current = true;

        for (let i = 0; i < ATLAS_COUNT; i++) {
          if (!resourcesRef.current) break;

          // Fetch this atlas (sequential - wait for completion)
          const skData = await loadAtlasData(i);
          if (!skData || !resourcesRef.current) {
            // Skip this atlas if loading failed, continue with others
            continue;
          }

          // Decode and upload to GPU (sequential - wait for completion)
          const texture = await decodeAtlasToGPU(device, skData);

          // Explicitly dispose Skia data to free memory before next atlas
          if ('dispose' in skData && typeof skData.dispose === 'function') {
            skData.dispose();
          }

          if (!texture || !resourcesRef.current) {
            continue;
          }

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

          // Yield to allow render frames
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => resolve()),
          );
        }

        isLoadingAtlasesRef.current = false;
      };

      // Start loading in background (don't await)
      loadAtlasesProgressively();
    } catch {
      isInitializedRef.current = false;
    }
  }, [
    canvasRef,
    createPlaceholderTexture,
    createBindGroup,
    decodeAtlasToGPU,
    photoInfoMap.size,
    render,
  ]);

  useEffect(() => {
    // Don't update buffers if cells is empty (waiting for consistent data)
    // This prevents glitchy frames during painting transitions
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
      } else {
        // Photo is new - grow from size 0 at center of new position
        oldTileData[offset + 0] = cell.x + cellWidth / 2;
        oldTileData[offset + 1] = cell.y + cellHeight / 2;
        oldTileData[offset + 2] = 0;
        oldTileData[offset + 3] = 0;
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
    device.queue.writeBuffer(
      oldTileBuffer,
      0,
      oldTileData as unknown as BufferSource,
    );
    device.queue.writeBuffer(
      tileBuffer,
      0,
      tileData as unknown as BufferSource,
    );
    resourcesRef.current.tileCount = totalTileCount;

    if (hasAnimation) {
      // Start animation: set to 1 (old positions) then animate to 0 (new positions)
      animProgress.value = 1;
      animProgress.value = withSpring(0, {
        duration: 1000,
        dampingRatio: 1,
      });
    } else {
      animProgress.value = 0;
    }

    // Save current photo positions (already screen-relative)
    const currentPositions = new Map<number, PhotoTileData>();
    validCells.forEach(cell => {
      if (cell.photoId !== null) {
        const info = photoInfoMap.get(cell.photoId)!;
        currentPositions.set(cell.photoId, {
          x: cell.x, // Already screen-relative
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
