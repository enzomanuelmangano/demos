import { useEffect, useState } from 'react';

import type { LAB, RGB } from '../types';

// Atlas configuration - matches generate-sprite-atlas.ts
const PHOTO_SIZE = 200;
const ATLAS_COLS = 40;
const PHOTOS_PER_ATLAS = ATLAS_COLS * 40; // 1600

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
  atlasIndex: number;
}

interface UsePhotoAtlasResult {
  photoInfoMap: Map<number, PhotoInfo>;
  isLoading: boolean;
}

// Compute atlas index and position within atlas from photo ID
const getAtlasInfo = (id: number): { atlasIndex: number; rect: Rect } => {
  const atlasIndex = Math.floor(id / PHOTOS_PER_ATLAS);
  const indexInAtlas = id % PHOTOS_PER_ATLAS;
  const col = indexInAtlas % ATLAS_COLS;
  const row = Math.floor(indexInAtlas / ATLAS_COLS);
  return {
    atlasIndex,
    rect: {
      x: col * PHOTO_SIZE,
      y: row * PHOTO_SIZE,
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
    },
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
    const { atlasIndex, rect } = getAtlasInfo(i);
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
      atlasRect: rect,
      atlasIndex,
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

    const compactData = require('../assets/photos-compact.json') as number[];
    const infoMap = parseCompactManifest(compactData);

    cachedPhotoInfoMap = infoMap;
    setPhotoInfoMap(infoMap);
    setIsLoading(false);
  }, []);

  return {
    photoInfoMap,
    isLoading,
  };
};
