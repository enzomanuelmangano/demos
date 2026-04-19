import { useMemo } from 'react';

import { useImage } from '@shopify/react-native-skia';

import manifest from '../assets/photos-manifest.json';
import atlasInfo from '../assets/atlas-info.json';

import type { LAB, RGB } from '../types';
import type { SkImage, SkRect } from '@shopify/react-native-skia';

// Type the manifest data
interface PhotoManifestEntry {
  id: number;
  rgb: RGB;
  lab: LAB;
}

interface Manifest {
  photos: PhotoManifestEntry[];
}

interface AtlasPhotoEntry {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AtlasInfo {
  atlasWidth: number;
  atlasHeight: number;
  photoSize: number;
  cols: number;
  rows: number;
  photos: AtlasPhotoEntry[];
}

const typedManifest = manifest as Manifest;
const typedAtlasInfo = atlasInfo as AtlasInfo;

export interface PhotoInfo {
  id: number;
  averageColor: RGB;
  labColor: LAB;
  atlasRect: SkRect; // Source rect in the atlas
}

interface UsePhotoAtlasResult {
  atlas: SkImage | null;
  photoInfoMap: Map<number, PhotoInfo>;
  isLoading: boolean;
  progress: number;
  loadedCount: number;
}

// Pre-build the photo info map from manifest + atlas info
const buildPhotoInfoMap = (): Map<number, PhotoInfo> => {
  const infoMap = new Map<number, PhotoInfo>();

  // Create lookup for atlas positions
  const atlasPositions = new Map<number, AtlasPhotoEntry>();
  for (const entry of typedAtlasInfo.photos) {
    atlasPositions.set(entry.id, entry);
  }

  // Combine manifest colors with atlas positions
  for (const photo of typedManifest.photos) {
    const atlasEntry = atlasPositions.get(photo.id);
    if (atlasEntry) {
      infoMap.set(photo.id, {
        id: photo.id,
        averageColor: photo.rgb,
        labColor: photo.lab,
        atlasRect: {
          x: atlasEntry.x,
          y: atlasEntry.y,
          width: atlasEntry.width,
          height: atlasEntry.height,
        },
      });
    }
  }

  return infoMap;
};

// Build once at module load - this is instant
const cachedPhotoInfoMap = buildPhotoInfoMap();

export const usePhotoAtlas = (): UsePhotoAtlasResult => {
  // Load the single atlas image
  const atlas = useImage(require('../assets/photo-atlas.jpg'));

  // photoInfoMap is pre-computed - no async needed
  const photoInfoMap = useMemo(() => cachedPhotoInfoMap, []);

  return {
    atlas,
    photoInfoMap,
    isLoading: !atlas,
    progress: atlas ? 100 : 0,
    loadedCount: photoInfoMap.size,
  };
};

// Get atlas info for rendering
export const getAtlasInfo = () => typedAtlasInfo;
