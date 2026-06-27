import { useEffect, useState } from 'react';

import type { LAB, RGB } from '../types';

// Atlas configuration - matches generate-deduped-atlas.ts
const PHOTO_SIZE = 200;
const ATLAS_COLS = 40;

// Dedup: picsum reused ~1000 source images across the 10k photos, so the atlas
// stores only the ~979 unique tiles. atlas-slots.json maps each logical photo
// id -> its slot in the single deduped atlas. Duplicate ids share a slot, which
// keeps the color-matcher inventory and the rendered mosaic unchanged.
const ATLAS_SLOTS = (
  require('../assets/atlas-slots.json') as { slots: number[] }
).slots;

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

// Resolve a photo ID to its slot in the single deduped atlas
const getAtlasInfo = (id: number): { atlasIndex: number; rect: Rect } => {
  const slot = ATLAS_SLOTS[id] ?? 0;
  const col = slot % ATLAS_COLS;
  const row = Math.floor(slot / ATLAS_COLS);
  return {
    atlasIndex: 0,
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
