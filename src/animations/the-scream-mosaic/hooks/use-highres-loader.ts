import { useCallback, useRef, useState } from 'react';

import { Skia } from '@shopify/react-native-skia';

import type { SkImage } from '@shopify/react-native-skia';

const HIGHRES_SIZE = 800;
const MAX_CACHED_IMAGES = 50; // Limit memory usage

interface HighResCache {
  [cellIndex: number]: SkImage;
}

interface UseHighResLoaderResult {
  highResImages: HighResCache;
  loadVisibleCells: (visibleCellIndices: number[], photoIdForCell: (index: number) => number | null) => void;
}

export const useHighResLoader = (): UseHighResLoaderResult => {
  const [highResImages, setHighResImages] = useState<HighResCache>({});
  const loadingRef = useRef<Set<number>>(new Set());
  const cacheOrderRef = useRef<number[]>([]); // Track order for LRU eviction

  const loadHighResImage = useCallback(async (cellIndex: number, photoId: number) => {
    if (loadingRef.current.has(cellIndex)) return;
    loadingRef.current.add(cellIndex);

    try {
      // Use picsum.photos with seed for consistent image
      const url = `https://picsum.photos/seed/mosaic-${photoId}/${HIGHRES_SIZE}/${HIGHRES_SIZE}`;
      const response = await fetch(url);

      if (!response.ok) {
        loadingRef.current.delete(cellIndex);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
      const image = Skia.Image.MakeImageFromEncoded(data);

      if (image) {
        setHighResImages(prev => {
          const newCache = { ...prev, [cellIndex]: image };

          // Update LRU order
          cacheOrderRef.current = cacheOrderRef.current.filter(i => i !== cellIndex);
          cacheOrderRef.current.push(cellIndex);

          // Evict oldest if over limit
          while (cacheOrderRef.current.length > MAX_CACHED_IMAGES) {
            const oldest = cacheOrderRef.current.shift()!;
            delete newCache[oldest];
          }

          return newCache;
        });
      }
    } catch (e) {
      console.warn(`Failed to load high-res for cell ${cellIndex}:`, e);
    } finally {
      loadingRef.current.delete(cellIndex);
    }
  }, []);

  const loadVisibleCells = useCallback((
    visibleCellIndices: number[],
    photoIdForCell: (index: number) => number | null,
  ) => {
    for (const cellIndex of visibleCellIndices) {
      // Skip if already loaded or loading
      if (highResImages[cellIndex] || loadingRef.current.has(cellIndex)) {
        continue;
      }

      const photoId = photoIdForCell(cellIndex);
      if (photoId !== null) {
        loadHighResImage(cellIndex, photoId);
      }
    }
  }, [highResImages, loadHighResImage]);

  return {
    highResImages,
    loadVisibleCells,
  };
};
