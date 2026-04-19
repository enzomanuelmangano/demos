import { useEffect, useMemo, useState } from 'react';

import type { PhotoInfo } from './use-photo-atlas';
import type { GridCell } from '../types';
import type { LAB } from '../types';

// Module-level cache
let cachedMosaicMapping: Map<number, number> | null = null;
let cachedMosaicKey: string | null = null;

interface UseMosaicMappingResult {
  mapping: Map<number, number>;
  isMatching: boolean;
  progress: number;
}

// LAB color distance (squared, for performance)
const labDistanceSq = (a: LAB, b: LAB): number => {
  const dL = a.l - b.l;
  const dA = a.a - b.a;
  const dB = a.b - b.b;
  return dL * dL + dA * dA + dB * dB;
};

// Get brightness bucket (0-19 for 20 buckets)
const getBucket = (l: number): number => Math.min(19, Math.floor(l / 5));

export const useMosaicMapping = (
  gridCells: GridCell[],
  photoInfoMap: Map<number, PhotoInfo>,
): UseMosaicMappingResult => {
  const [mapping, setMapping] = useState<Map<number, number>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [progress, setProgress] = useState(0);

  const cacheKey = useMemo(() => {
    if (gridCells.length === 0 || photoInfoMap.size === 0) {
      return null;
    }
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

    if (cachedMosaicMapping && cachedMosaicKey === cacheKey) {
      setMapping(cachedMosaicMapping);
      setProgress(100);
      return;
    }

    console.log('[Mapping] Starting bucketed color matching...');
    const startTime = Date.now();

    cachedMosaicMapping = null;
    cachedMosaicKey = null;
    setIsMatching(true);
    setProgress(0);

    const photos = Array.from(photoInfoMap.values());
    const newMapping = new Map<number, number>();

    // Step 1: Group cells and photos into brightness buckets
    const cellBuckets: GridCell[][] = Array.from({ length: 20 }, () => []);
    const photoBuckets: PhotoInfo[][] = Array.from({ length: 20 }, () => []);

    for (const cell of gridCells) {
      cellBuckets[getBucket(cell.targetLab.l)].push(cell);
    }
    for (const photo of photos) {
      photoBuckets[getBucket(photo.labColor.l)].push(photo);
    }

    console.log(`[Mapping] Bucketed in ${Date.now() - startTime}ms`);

    // Step 2: Balance buckets - redistribute photos to match cell counts
    // This ensures each bucket has enough photos for its cells
    const cellCounts = cellBuckets.map(b => b.length);

    // Create a pool of all photos sorted by brightness for redistribution
    const allPhotosSorted = [...photos].sort((a, b) => a.labColor.l - b.labColor.l);

    // Assign photos to buckets based on cell distribution
    const redistributedPhotoBuckets: PhotoInfo[][] = Array.from({ length: 20 }, () => []);
    let photoIdx = 0;

    for (let bucket = 0; bucket < 20; bucket++) {
      const neededPhotos = cellCounts[bucket];
      for (let i = 0; i < neededPhotos && photoIdx < allPhotosSorted.length; i++) {
        redistributedPhotoBuckets[bucket].push(allPhotosSorted[photoIdx++]);
      }
    }

    // If we have remaining photos, distribute them to buckets that can use them
    while (photoIdx < allPhotosSorted.length) {
      const photo = allPhotosSorted[photoIdx++];
      const bucket = getBucket(photo.labColor.l);
      redistributedPhotoBuckets[bucket].push(photo);
    }

    console.log(`[Mapping] Redistributed in ${Date.now() - startTime}ms`);

    // Step 3: Within each bucket, do greedy nearest-neighbor matching
    for (let bucket = 0; bucket < 20; bucket++) {
      const cells = cellBuckets[bucket];
      const bucketPhotos = redistributedPhotoBuckets[bucket];

      if (cells.length === 0) continue;

      // Create available photo set for this bucket
      const available = new Set(bucketPhotos.map((_, i) => i));

      // Sort cells by saturation (more saturated = harder to match, do first)
      const sortedCells = [...cells].sort((a, b) => {
        const satA = Math.sqrt(a.targetLab.a * a.targetLab.a + a.targetLab.b * a.targetLab.b);
        const satB = Math.sqrt(b.targetLab.a * b.targetLab.a + b.targetLab.b * b.targetLab.b);
        return satB - satA; // Higher saturation first
      });

      for (const cell of sortedCells) {
        if (available.size === 0) {
          // Steal from adjacent buckets if needed
          for (let offset = 1; offset < 20 && available.size === 0; offset++) {
            const lowerBucket = bucket - offset;
            const upperBucket = bucket + offset;

            if (lowerBucket >= 0 && redistributedPhotoBuckets[lowerBucket].length > 0) {
              const stolen = redistributedPhotoBuckets[lowerBucket].pop()!;
              bucketPhotos.push(stolen);
              available.add(bucketPhotos.length - 1);
            } else if (upperBucket < 20 && redistributedPhotoBuckets[upperBucket].length > 0) {
              const stolen = redistributedPhotoBuckets[upperBucket].pop()!;
              bucketPhotos.push(stolen);
              available.add(bucketPhotos.length - 1);
            }
          }
        }

        if (available.size === 0) continue;

        // Find best matching photo in bucket
        let bestIdx = -1;
        let bestDist = Infinity;

        for (const idx of available) {
          const dist = labDistanceSq(cell.targetLab, bucketPhotos[idx].labColor);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        }

        if (bestIdx >= 0) {
          newMapping.set(cell.index, bucketPhotos[bestIdx].id);
          available.delete(bestIdx);
        }
      }
    }

    console.log(`[Mapping] Completed in ${Date.now() - startTime}ms (${newMapping.size} unique photos)`);

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

export const clearMosaicMappingCache = (): void => {
  cachedMosaicMapping = null;
  cachedMosaicKey = null;
};
