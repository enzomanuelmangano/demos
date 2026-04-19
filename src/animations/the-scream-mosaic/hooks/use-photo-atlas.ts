import { useCallback, useEffect, useState } from 'react';

import { Skia } from '@shopify/react-native-skia';

import {
  BATCH_DELAY,
  BATCH_SIZE,
  DISPLAY_SIZE,
  getPhotoUrl,
  getValidPhotoIds,
  PHOTO_COUNT,
} from '../constants';
import { rgbToLab } from '../utils/color-conversion';

import type { LAB, RGB } from '../types';
import type { SkImage } from '@shopify/react-native-skia';

// Atlas configuration
const ATLAS_COLS = 27; // 27 x 26 = 702 slots (enough for ~700 photos)
const ATLAS_ROWS = 26;
const TILE_SIZE = DISPLAY_SIZE;
const ATLAS_WIDTH = ATLAS_COLS * TILE_SIZE;
const ATLAS_HEIGHT = ATLAS_ROWS * TILE_SIZE;

export interface PhotoInfo {
  id: number;
  averageColor: RGB;
  labColor: LAB;
  atlasX: number; // Position in atlas
  atlasY: number;
}

interface UsePhotoAtlasResult {
  atlas: SkImage | null;
  photoInfoMap: Map<number, PhotoInfo>;
  isLoading: boolean;
  progress: number;
  loadedCount: number;
}

// Module-level cache
let cachedAtlas: SkImage | null = null;
let cachedPhotoInfoMap: Map<number, PhotoInfo> | null = null;

// Extract average color from raw image data
const extractAverageColor = (
  data: Uint8Array,
  width: number,
  height: number,
): RGB => {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  const step = 4;
  const bytesPerPixel = 4;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * bytesPerPixel;
      if (idx + 3 < data.length) {
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};

// Fetch a single photo and return both image and color info
const fetchPhoto = async (
  id: number,
): Promise<{ image: SkImage; color: RGB } | null> => {
  try {
    const url = getPhotoUrl(id, DISPLAY_SIZE);
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
    const image = Skia.Image.MakeImageFromEncoded(data);

    if (!image) {
      return null;
    }

    const width = image.width();
    const height = image.height();

    const pixels = image.readPixels(0, 0, {
      width,
      height,
      colorType: 4,
      alphaType: 1,
    });

    if (!pixels) {
      return null;
    }

    const color = extractAverageColor(new Uint8Array(pixels), width, height);

    return { image, color };
  } catch {
    return null;
  }
};

export const usePhotoAtlas = (): UsePhotoAtlasResult => {
  const [atlas, setAtlas] = useState<SkImage | null>(null);
  const [photoInfoMap, setPhotoInfoMap] = useState<Map<number, PhotoInfo>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);

  const buildAtlas = useCallback(async () => {
    // Return cached if available
    if (cachedAtlas && cachedPhotoInfoMap) {
      setAtlas(cachedAtlas);
      setPhotoInfoMap(cachedPhotoInfoMap);
      setLoadedCount(cachedPhotoInfoMap.size);
      setProgress(100);
      return;
    }

    setIsLoading(true);
    setProgress(0);

    const validIds = getValidPhotoIds(PHOTO_COUNT);
    const infoMap = new Map<number, PhotoInfo>();
    const loadedImages: { id: number; image: SkImage; color: RGB }[] = [];

    // Load all images
    for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
      const batchIds = validIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batchIds.map(fetchPhoto));

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result) {
          loadedImages.push({
            id: batchIds[j],
            image: result.image,
            color: result.color,
          });
        }
      }

      setLoadedCount(loadedImages.length);
      setProgress(Math.round(((i + BATCH_SIZE) / validIds.length) * 100));

      if (i + BATCH_SIZE < validIds.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Create atlas surface
    const surface = Skia.Surface.MakeOffscreen(ATLAS_WIDTH, ATLAS_HEIGHT);
    if (!surface) {
      setIsLoading(false);
      return;
    }

    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('black'));

    // Draw all images to atlas and build info map
    for (let i = 0; i < loadedImages.length; i++) {
      const { id, image, color } = loadedImages[i];
      const col = i % ATLAS_COLS;
      const row = Math.floor(i / ATLAS_COLS);
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;

      // Draw image to atlas
      const srcRect = Skia.XYWHRect(0, 0, image.width(), image.height());
      const dstRect = Skia.XYWHRect(x, y, TILE_SIZE, TILE_SIZE);
      canvas.drawImageRect(image, srcRect, dstRect, Skia.Paint());

      // Store info
      infoMap.set(id, {
        id,
        averageColor: color,
        labColor: rgbToLab(color),
        atlasX: x,
        atlasY: y,
      });
    }

    // Create atlas image from surface
    const atlasImage = surface.makeImageSnapshot();

    cachedAtlas = atlasImage;
    cachedPhotoInfoMap = infoMap;

    setAtlas(atlasImage);
    setPhotoInfoMap(infoMap);
    setIsLoading(false);
    setProgress(100);
  }, []);

  useEffect(() => {
    buildAtlas();
  }, [buildAtlas]);

  return {
    atlas,
    photoInfoMap,
    isLoading,
    progress,
    loadedCount,
  };
};

// Export atlas tile size for rendering
export const ATLAS_TILE_SIZE = TILE_SIZE;

// Clear the cache
export const clearPhotoAtlasCache = (): void => {
  cachedAtlas = null;
  cachedPhotoInfoMap = null;
};
