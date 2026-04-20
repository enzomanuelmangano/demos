import { useEffect, useState } from 'react';

import { Skia } from '@shopify/react-native-skia';
import { Image } from 'react-native';

import type { LAB, RGB } from '../types';
import type { SkImage, SkRect } from '@shopify/react-native-skia';

// Atlas configuration - matches generate-sprite-atlas.ts
const PHOTO_SIZE = 80;
const ATLAS_COLS = 100;

export interface PhotoInfo {
  id: number;
  averageColor: RGB;
  labColor: LAB;
  atlasRect: SkRect;
}

interface UsePhotoAtlasResult {
  atlas: SkImage | null;
  photoInfoMap: Map<number, PhotoInfo>;
  isLoading: boolean;
}

// Compute atlas position from photo ID
const getAtlasRect = (id: number): SkRect => {
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
let cachedAtlas: SkImage | null = null;

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
  const [atlas, setAtlas] = useState<SkImage | null>(cachedAtlas);
  const [isLoading, setIsLoading] = useState(!cachedPhotoInfoMap);

  useEffect(() => {
    if (cachedPhotoInfoMap && cachedAtlas) {
      return;
    }

    const loadData = async () => {
      const startTime = Date.now();

      // Load compact manifest
      if (!cachedPhotoInfoMap) {
        console.log('[Atlas] Loading compact manifest...');
        const compactData = require('../assets/photos-compact.json') as number[];
        console.log(`[Atlas] Manifest loaded in ${Date.now() - startTime}ms`);

        const infoMap = parseCompactManifest(compactData);
        cachedPhotoInfoMap = infoMap;
        setPhotoInfoMap(infoMap);
        console.log(`[Atlas] PhotoInfoMap built in ${Date.now() - startTime}ms`);
      }

      setIsLoading(false);

      // Load atlas image
      if (!cachedAtlas) {
        console.log('[Atlas] Loading atlas image...');
        const atlasStart = Date.now();

        const resolved = Image.resolveAssetSource(
          require('../assets/photo-atlas.jpg'),
        );

        if (resolved?.uri) {
          try {
            const response = await fetch(resolved.uri);
            const arrayBuffer = await response.arrayBuffer();
            const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
            const image = Skia.Image.MakeImageFromEncoded(data);

            if (image) {
              cachedAtlas = image;
              setAtlas(image);
              console.log(`[Atlas] Image decoded in ${Date.now() - atlasStart}ms`);
            }
          } catch (e) {
            console.error('[Atlas] Failed to load:', e);
          }
        }
      }

      console.log(`[Atlas] Total load time: ${Date.now() - startTime}ms`);
    };

    loadData();
  }, []);

  return {
    atlas,
    photoInfoMap,
    isLoading,
  };
};
