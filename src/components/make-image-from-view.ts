import { PixelRatio } from 'react-native';

import { Skia } from 'react-native-skia';
import { importDevice } from 'react-native-webgpu';

import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';
import type { SkImage } from 'react-native-skia';

// Skia 3.6 removed `makeImageFromView`. The same snapshot now goes through
// react-native-webgpu on Skia's own device: the view is rasterized into a
// texture (drawViewHierarchyInRect on iOS, as before) and Skia wraps that
// texture as an image, without a copy.
let device: GPUDevice | null = null;
const getDevice = () => {
  device ??= importDevice(Skia.getNativeDevice());
  return device;
};

// Fabric drops a measure callback when the view unmounts mid-call: give up
// rather than wait forever.
const MEASURE_TIMEOUT_MS = 500;

const measureSize = (view: HostInstance) =>
  new Promise<{ width: number; height: number } | null>(resolve => {
    const timeout = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    view.measure((_x, _y, width, height) => {
      clearTimeout(timeout);
      resolve({ width, height });
    });
  });

/**
 * Snapshots a mounted host view (rendered with `collapsable={false}`) into an
 * SkImage at the screen's pixel density. Resolves to null when it can't —
 * the view is gone or there is no GPU — like the Skia API it replaces, so a
 * caller never gets stuck on a rejection.
 */
export const makeImageFromView = async (
  viewRef: RefObject<HostInstance | null>,
): Promise<SkImage | null> => {
  try {
    return await snapshot(viewRef);
  } catch {
    return null;
  }
};

const snapshot = async (
  viewRef: RefObject<HostInstance | null>,
): Promise<SkImage | null> => {
  const view = viewRef.current;
  if (!view || !Skia.gpu.isAvailable) return null;
  const measured = await measureSize(view);
  if (!measured) return null;
  const { width, height } = measured;
  const scale = PixelRatio.get();
  const size = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  const gpu = getDevice();
  const texture = gpu.createTexture({
    size,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  await gpu.queue.drawElementImageToTexture(
    { source: view },
    { texture, size },
  );
  // The image holds its own reference to the texture: never destroy() it here.
  return Skia.Image.MakeImageFromGPUTexture(texture);
};
