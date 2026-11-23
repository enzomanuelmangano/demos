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
    const sampleCells = [
      0,
      Math.floor(gridCells.length / 2),
      gridCells.length - 1,
    ];
    const colorSig = sampleCells
      .map(i => {
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

    // Prepare flat RGB arrays for native module (LAB conversion happens in C++)
    const photos = Array.from(photoInfoMap.values());

    const cellRGB: number[] = [];
    const cellIndices: number[] = [];
    for (const cell of gridCells) {
      cellRGB.push(cell.targetColor.r, cell.targetColor.g, cell.targetColor.b);
      cellIndices.push(cell.index);
    }

    const photoRGB: number[] = [];
    const photoIds: number[] = [];
    for (const photo of photos) {
      photoRGB.push(
        photo.averageColor.r,
        photo.averageColor.g,
        photo.averageColor.b,
      );
      photoIds.push(photo.id);
    }

    // Run native C++ color matching (handles RGB→LAB + parallel matching)
    const newMapping = matchColorsNative(
      cellRGB,
      cellIndices,
      photoRGB,
      photoIds,
    );

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
