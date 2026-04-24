import { useMemo, useRef } from 'react';

import { matchColorsNative } from '../../../native/ColorMatcher';

import type { PhotoInfo } from './use-photo-atlas';
import type { GridCell } from '../types';

// Module-level cache
let cachedMosaicMapping: Map<number, number> | null = null;
let cachedMosaicKey: string | null = null;

interface UseMosaicMappingResult {
  mapping: Map<number, number>;
}

export const useMosaicMapping = (
  gridCells: GridCell[],
  photoInfoMap: Map<number, PhotoInfo>,
): UseMosaicMappingResult => {
  const lastKeyRef = useRef<string | null>(null);

  const mapping = useMemo(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return new Map<number, number>();
    }

    // Generate cache key
    const sampleCells = [0, Math.floor(gridCells.length / 2), gridCells.length - 1];
    const colorSig = sampleCells
      .map((i) => {
        const cell = gridCells[i];
        if (!cell) return '0';
        return `${cell.targetColor.r}-${cell.targetColor.g}-${cell.targetColor.b}`;
      })
      .join('|');
    const cacheKey = `${gridCells.length}-${photoInfoMap.size}-${colorSig}`;

    // Return cached if available
    if (cachedMosaicMapping && cachedMosaicKey === cacheKey) {
      return cachedMosaicMapping;
    }

    console.log('[Mapping] Computing with native C++ module...');
    const startTime = Date.now();

    // Prepare flat arrays for native module
    const photos = Array.from(photoInfoMap.values());

    const cellLAB: number[] = [];
    const cellIndices: number[] = [];
    for (const cell of gridCells) {
      cellLAB.push(cell.targetLab.l, cell.targetLab.a, cell.targetLab.b);
      cellIndices.push(cell.index);
    }

    const photoLAB: number[] = [];
    const photoIds: number[] = [];
    for (const photo of photos) {
      photoLAB.push(photo.labColor.l, photo.labColor.a, photo.labColor.b);
      photoIds.push(photo.id);
    }

    // Run native C++ color matching
    const newMapping = matchColorsNative(
      cellLAB,
      cellIndices,
      photoLAB,
      photoIds,
    );

    console.log(`[Mapping] Completed in ${Date.now() - startTime}ms (${newMapping.size} unique photos)`);

    // Cache it
    cachedMosaicMapping = newMapping;
    cachedMosaicKey = cacheKey;
    lastKeyRef.current = cacheKey;

    return newMapping;
  }, [gridCells, photoInfoMap]);

  return { mapping };
};

export const clearMosaicMappingCache = (): void => {
  cachedMosaicMapping = null;
  cachedMosaicKey = null;
};
