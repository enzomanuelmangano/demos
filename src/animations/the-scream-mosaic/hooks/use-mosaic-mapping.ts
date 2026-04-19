import { useEffect, useMemo, useState } from 'react';

import { findClosestPhoto } from '../utils/color-distance';

import type { GridCell, PhotoData } from '../types';

// Module-level cache for mosaic mapping
let cachedMosaicMapping: Map<number, number> | null = null;

interface UseMosaicMappingResult {
  mapping: Map<number, number>;
  isMatching: boolean;
  progress: number;
}

export const useMosaicMapping = (
  gridCells: GridCell[],
  photoDatabase: PhotoData[],
): UseMosaicMappingResult => {
  const [mapping, setMapping] = useState<Map<number, number>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [progress, setProgress] = useState(0);

  // Create a stable key for caching
  const cacheKey = useMemo(() => {
    if (gridCells.length === 0 || photoDatabase.length === 0) {
      return null;
    }
    return `${gridCells.length}-${photoDatabase.length}`;
  }, [gridCells.length, photoDatabase.length]);

  useEffect(() => {
    if (gridCells.length === 0 || photoDatabase.length === 0) {
      return;
    }

    // Check cache
    if (cachedMosaicMapping && cachedMosaicMapping.size === gridCells.length) {
      setMapping(cachedMosaicMapping);
      setProgress(100);
      return;
    }

    const computeMapping = async () => {
      setIsMatching(true);
      setProgress(0);

      const newMapping = new Map<number, number>();
      const batchSize = 50;

      const processBatch = (startIndex: number): Promise<void> => {
        return new Promise(resolve => {
          requestAnimationFrame(() => {
            const endIndex = Math.min(startIndex + batchSize, gridCells.length);

            for (let i = startIndex; i < endIndex; i++) {
              const cell = gridCells[i];
              const photoId = findClosestPhoto(cell.targetLab, photoDatabase);
              if (photoId !== null) {
                newMapping.set(cell.index, photoId);
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
      setMapping(newMapping);
      setIsMatching(false);
      setProgress(100);
    };

    computeMapping();
  }, [gridCells, photoDatabase, cacheKey]);

  return {
    mapping,
    isMatching,
    progress,
  };
};

// Clear the cache (useful for testing)
export const clearMosaicMappingCache = (): void => {
  cachedMosaicMapping = null;
};
