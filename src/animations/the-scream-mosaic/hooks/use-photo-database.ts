import { useCallback, useEffect, useState } from 'react';

import { Skia } from '@shopify/react-native-skia';

import {
  ANALYSIS_SIZE,
  BATCH_DELAY,
  BATCH_SIZE,
  getPhotoUrl,
  getValidPhotoIds,
  PHOTO_COUNT,
} from '../constants';
import { rgbToLab } from '../utils/color-conversion';

import type { PhotoData, RGB } from '../types';

// Module-level cache for photo database
let cachedPhotoDatabase: PhotoData[] | null = null;

interface UsePhotoDatabaseResult {
  photoDatabase: PhotoData[];
  isLoading: boolean;
  progress: number;
  loadedCount: number;
  error: string | null;
}

// Extract average color from raw image data
const extractAverageColor = (
  data: Uint8Array,
  width: number,
  height: number,
): RGB => {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Sample every 4th pixel for performance
  const step = 4;
  const bytesPerPixel = 4; // RGBA

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * bytesPerPixel;
      if (idx + 3 < data.length) {
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) {
    return { r: 128, g: 128, b: 128 };
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};

// Fetch and analyze a single photo
const analyzePhoto = async (id: number): Promise<PhotoData | null> => {
  try {
    const url = getPhotoUrl(id, ANALYSIS_SIZE);
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
    const image = Skia.Image.MakeImageFromEncoded(data);

    if (!image) {
      return null;
    }

    const width = image.width();
    const height = image.height();

    // Read pixels from the image
    const pixels = image.readPixels(0, 0, {
      width,
      height,
      colorType: 4, // RGBA_8888
      alphaType: 1, // Unpremul
    });

    if (!pixels) {
      return null;
    }

    const averageColor = extractAverageColor(
      new Uint8Array(pixels),
      width,
      height,
    );
    const labColor = rgbToLab(averageColor);

    return {
      id,
      averageColor,
      labColor,
    };
  } catch {
    return null;
  }
};

export const usePhotoDatabase = (): UsePhotoDatabaseResult => {
  const [photoDatabase, setPhotoDatabase] = useState<PhotoData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadPhotoDatabase = useCallback(async () => {
    // Return cached result if available
    if (cachedPhotoDatabase && cachedPhotoDatabase.length > 0) {
      setPhotoDatabase(cachedPhotoDatabase);
      setLoadedCount(cachedPhotoDatabase.length);
      setProgress(100);
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setError(null);

    const validIds = getValidPhotoIds(PHOTO_COUNT);
    const database: PhotoData[] = [];

    // Process in batches
    for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
      const batchIds = validIds.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchResults = await Promise.all(batchIds.map(analyzePhoto));

      // Add successful results to database
      for (const result of batchResults) {
        if (result) {
          database.push(result);
        }
      }

      setLoadedCount(database.length);
      setProgress(Math.round(((i + BATCH_SIZE) / validIds.length) * 100));

      // Small delay between batches to prevent memory spikes
      if (i + BATCH_SIZE < validIds.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    cachedPhotoDatabase = database;
    setPhotoDatabase(database);
    setIsLoading(false);
    setProgress(100);
  }, []);

  useEffect(() => {
    loadPhotoDatabase();
  }, [loadPhotoDatabase]);

  return {
    photoDatabase,
    isLoading,
    progress,
    loadedCount,
    error,
  };
};

// Clear the cache (useful for testing)
export const clearPhotoDatabaseCache = (): void => {
  cachedPhotoDatabase = null;
};
