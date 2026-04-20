import { useCallback, useRef, useState } from 'react';

import { Skia } from '@shopify/react-native-skia';

import type { SkImage } from '@shopify/react-native-skia';

const HIGHRES_SIZE = 1000;
const MAX_CACHED = 25;

interface UseHighResLoaderResult {
  getHighResImage: (cellIndex: number) => SkImage | null;
  isLoading: (cellIndex: number) => boolean;
  loadCell: (cellIndex: number, photoId: number) => void;
  loadedCells: Map<number, SkImage>;
  version: number; // Triggers re-render when images load
}

// Module-level cache
const imageCache = new Map<number, SkImage>();
const loadingSet = new Set<number>();
const cacheOrder: number[] = [];

export const useHighResLoader = (): UseHighResLoaderResult => {
  const [version, setVersion] = useState(0);
  const pendingLoads = useRef<Map<number, Promise<void>>>(new Map());

  const loadImage = useCallback(async (cellIndex: number, photoId: number): Promise<void> => {
    if (imageCache.has(cellIndex) || loadingSet.has(cellIndex)) {
      console.log(`[HighRes] Skipping cell ${cellIndex} - already cached or loading`);
      return;
    }

    loadingSet.add(cellIndex);
    setVersion(n => n + 1);

    const url = `https://picsum.photos/seed/mosaic-${photoId}/${HIGHRES_SIZE}/${HIGHRES_SIZE}`;
    console.log(`[HighRes] Loading cell ${cellIndex}, photoId ${photoId}: ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[HighRes] Fetched ${arrayBuffer.byteLength} bytes for cell ${cellIndex}`);

      const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
      const image = Skia.Image.MakeImageFromEncoded(data);

      if (image) {
        console.log(`[HighRes] Decoded image for cell ${cellIndex}: ${image.width()}x${image.height()}`);
        // Add to cache
        imageCache.set(cellIndex, image);

        // Update LRU
        const idx = cacheOrder.indexOf(cellIndex);
        if (idx > -1) cacheOrder.splice(idx, 1);
        cacheOrder.push(cellIndex);

        // Evict if over limit
        while (cacheOrder.length > MAX_CACHED) {
          const oldest = cacheOrder.shift()!;
          imageCache.delete(oldest);
        }
      } else {
        console.warn(`[HighRes] Failed to decode image for cell ${cellIndex}`);
      }
    } catch (e) {
      console.warn(`[HighRes] Failed to load cell ${cellIndex}:`, e);
    } finally {
      loadingSet.delete(cellIndex);
      pendingLoads.current.delete(cellIndex);
      setVersion(n => n + 1);
    }
  }, []);

  const loadCell = useCallback((cellIndex: number, photoId: number) => {
    if (!imageCache.has(cellIndex) && !pendingLoads.current.has(cellIndex)) {
      const promise = loadImage(cellIndex, photoId);
      pendingLoads.current.set(cellIndex, promise);
    }
  }, [loadImage]);

  const getHighResImage = useCallback((cellIndex: number): SkImage | null => {
    return imageCache.get(cellIndex) ?? null;
  }, []);

  const isLoading = useCallback((cellIndex: number): boolean => {
    return loadingSet.has(cellIndex);
  }, []);

  return {
    getHighResImage,
    isLoading,
    loadCell,
    loadedCells: imageCache,
    version,
  };
};
