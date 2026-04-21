import { useEffect, useState } from 'react';

import type { LAB, RGB } from '../types';

// Atlas configuration - matches generate-sprite-atlas.ts
const PHOTO_SIZE = 80;
const ATLAS_COLS = 100;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoInfo {
  id: number;
  averageColor: RGB;
  labColor: LAB;
  atlasRect: Rect;
}

interface UsePhotoAtlasResult {
  photoInfoMap: Map<number, PhotoInfo>;
  isLoading: boolean;
}

// Compute atlas position from photo ID
const getAtlasRect = (id: number): Rect => {
  const col = id % ATLAS_COLS;
  const row = Math.floor(id / ATLAS_COLS);
  return {
    x: col * PHOTO_SIZE,
    y: row * PHOTO_SIZE,
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  };
};

// Cache
let cachedPhotoInfoMap: Map<number, PhotoInfo> | null = null;

// Parse compact manifest: [r,g,b,l,a,b, r,g,b,l,a,b, ...]
const parseCompactManifest = (data: number[]): Map<number, PhotoInfo> => {
  const infoMap = new Map<number, PhotoInfo>();
  const numPhotos = data.length / 6;

  for (let i = 0; i < numPhotos; i++) {
    const offset = i * 6;
    infoMap.set(i, {
      id: i,
      averageColor: {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      },
      labColor: {
        l: data[offset + 3],
        a: data[offset + 4],
        b: data[offset + 5],
      },
      atlasRect: getAtlasRect(i),
    });
  }

  return infoMap;
};

export const usePhotoAtlas = (): UsePhotoAtlasResult => {
  const [photoInfoMap, setPhotoInfoMap] = useState<Map<number, PhotoInfo>>(
    () => cachedPhotoInfoMap ?? new Map(),
  );
  const [isLoading, setIsLoading] = useState(!cachedPhotoInfoMap);

  useEffect(() => {
    if (cachedPhotoInfoMap) {
      return;
    }

    const startTime = Date.now();
    console.log('[Atlas] Loading compact manifest...');

    const compactData = require('../assets/photos-compact.json') as number[];
    const infoMap = parseCompactManifest(compactData);

    cachedPhotoInfoMap = infoMap;
    setPhotoInfoMap(infoMap);
    setIsLoading(false);

    console.log(`[Atlas] PhotoInfoMap built in ${Date.now() - startTime}ms`);
  }, []);

  return {
    photoInfoMap,
    isLoading,
  };
};
