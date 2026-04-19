import { useEffect, useMemo, useState } from 'react';

import { colorDistance } from '../utils/color-distance';

import type { PhotoInfo } from './use-photo-atlas';
import type { GridCell } from '../types';

// Module-level cache for mosaic mapping
let cachedMosaicMapping: Map<number, number> | null = null;
let cachedMosaicKey: string | null = null;

interface UseMosaicMappingResult {
  mapping: Map<number, number>;
  isMatching: boolean;
  progress: number;
}

export const useMosaicMapping = (
  gridCells: GridCell[],
  photoInfoMap: Map<number, PhotoInfo>,
): UseMosaicMappingResult => {
  const [mapping, setMapping] = useState<Map<number, number>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [progress, setProgress] = useState(0);

  // Create a stable key for caching - include color signature from first few cells
  const cacheKey = useMemo(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return null;
    }
    // Sample a few cells' colors to create a signature
    const sampleCells = [0, Math.floor(gridCells.length / 2), gridCells.length - 1];
    const colorSig = sampleCells
      .map(i => {
        const cell = gridCells[i];
        if (!cell) return '0';
        return `${cell.targetColor.r}-${cell.targetColor.g}-${cell.targetColor.b}`;
      })
      .join('|');
    return `${gridCells.length}-${photoInfoMap.size}-${colorSig}`;
  }, [gridCells, photoInfoMap.size]);

  useEffect(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return;
    }

    // Check cache - key includes color signature so it invalidates when painting changes
    if (cachedMosaicMapping && cachedMosaicKey === cacheKey) {
      setMapping(cachedMosaicMapping);
      setProgress(100);
      return;
    }

    // Clear stale cache
    cachedMosaicMapping = null;
    cachedMosaicKey = null;

    const computeMapping = async () => {
      setIsMatching(true);
      setProgress(0);

      const newMapping = new Map<number, number>();
      const batchSize = 50;

      // Convert map to array and track which photos are still available
      const photoArray = Array.from(photoInfoMap.values());
      const usedPhotoIds = new Set<number>();

      // Find closest UNUSED photo for a cell
      const findClosestUnused = (cell: GridCell): number | null => {
        let closestId: number | null = null;
        let minDistance = Infinity;

        for (const photo of photoArray) {
          if (usedPhotoIds.has(photo.id)) continue;

          const distance = colorDistance(cell.targetLab, photo.labColor);
          if (distance < minDistance) {
            minDistance = distance;
            closestId = photo.id;
          }
        }

        return closestId;
      };

      const processBatch = (startIndex: number): Promise<void> => {
        return new Promise(resolve => {
          requestAnimationFrame(() => {
            const endIndex = Math.min(startIndex + batchSize, gridCells.length);

            for (let i = startIndex; i < endIndex; i++) {
              const cell = gridCells[i];
              const photoId = findClosestUnused(cell);
              if (photoId !== null) {
                newMapping.set(cell.index, photoId);
                usedPhotoIds.add(photoId); // Mark as used - no duplicates!
              }
            }

            setProgress(Math.round((endIndex / gridCells.length) * 100));

            if (endIndex < gridCells.length) {
              setTimeout(() => processBatch(endIndex).then(resolve), 0);
            } else {
              resolve();
            }
          });
        });
      };

      await processBatch(0);

      cachedMosaicMapping = newMapping;
      cachedMosaicKey = cacheKey;
      setMapping(newMapping);
      setIsMatching(false);
      setProgress(100);
    };

    computeMapping();
  }, [gridCells, photoInfoMap, cacheKey]);

  return {
    mapping,
    isMatching,
    progress,
  };
};

// Clear the cache (useful for testing)
export const clearMosaicMappingCache = (): void => {
  cachedMosaicMapping = null;
  cachedMosaicKey = null;
};
