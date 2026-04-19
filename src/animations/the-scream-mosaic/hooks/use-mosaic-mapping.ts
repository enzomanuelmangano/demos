import { useEffect, useMemo, useState } from 'react';

import { buildKdTree } from '../utils/kd-tree';

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

  // Create a stable key for caching
  const cacheKey = useMemo(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return null;
    }
    // Sample a few cells' colors to create a signature
    const sampleCells = [0, Math.floor(gridCells.length / 2), gridCells.length - 1];
    const colorSig = sampleCells
      .map((i) => {
        const cell = gridCells[i];
        if (!cell) {
          return '0';
        }
        return `${cell.targetColor.r}-${cell.targetColor.g}-${cell.targetColor.b}`;
      })
      .join('|');
    return `${gridCells.length}-${photoInfoMap.size}-${colorSig}`;
  }, [gridCells, photoInfoMap.size]);

  useEffect(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return;
    }

    // Check cache
    if (cachedMosaicMapping && cachedMosaicKey === cacheKey) {
      setMapping(cachedMosaicMapping);
      setProgress(100);
      return;
    }

    // Clear stale cache
    cachedMosaicMapping = null;
    cachedMosaicKey = null;

    setIsMatching(true);
    setProgress(0);

    // Convert map to array for k-d tree
    const photoArray = Array.from(photoInfoMap.values()).map((photo) => ({
      id: photo.id,
      labColor: photo.labColor,
    }));

    // Build k-d tree - O(n log n), ~10ms for 10k photos
    const kdTree = buildKdTree(photoArray);
    setProgress(20);

    // Process ALL cells synchronously - k-d tree is fast!
    // 10k findNearest calls at O(log n) each takes ~50ms
    const newMapping = new Map<number, number>();
    const totalCells = gridCells.length;

    for (let i = 0; i < totalCells; i++) {
      const cell = gridCells[i];
      const photoId = kdTree.findNearest(cell.targetLab);
      if (photoId !== null) {
        newMapping.set(cell.index, photoId);
      }
    }

    cachedMosaicMapping = newMapping;
    cachedMosaicKey = cacheKey;
    setMapping(newMapping);
    setIsMatching(false);
    setProgress(100);
  }, [gridCells, photoInfoMap, cacheKey]);

  return {
    mapping,
    isMatching,
    progress,
  };
};

// Clear the cache
export const clearMosaicMappingCache = (): void => {
  cachedMosaicMapping = null;
  cachedMosaicKey = null;
};
