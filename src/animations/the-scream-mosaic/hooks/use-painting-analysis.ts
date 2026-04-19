import { useEffect, useMemo, useState } from 'react';

import { AlphaType, ColorType, useImage } from '@shopify/react-native-skia';

import { TARGET_CELLS } from '../constants';
import { rgbToLab } from '../utils/color-conversion';

import type { GridCell, LAB, RGB } from '../types';

// Module-level cache for painting analysis
let cachedPaintingAnalysis: GridCell[] | null = null;
let cachedPaintingKey: string | null = null;

interface GridDimensions {
  cols: number;
  rows: number;
  totalCells: number;
  aspectRatio: number;
}

interface UsePaintingAnalysisResult {
  gridCells: GridCell[];
  gridDimensions: GridDimensions;
  isAnalyzing: boolean;
  progress: number;
  error: string | null;
}

// Sample average color from a region of a pixel buffer
const sampleRegionFromBuffer = (
  pixels: ArrayBufferLike | Uint8Array | Float32Array,
  imageWidth: number,
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
): RGB => {
  // Handle different buffer types
  const data = pixels instanceof Uint8Array
    ? pixels
    : new Uint8Array(pixels as ArrayBufferLike);
  const bytesPerPixel = 4;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Sample every 2nd pixel for speed
  const step = 2;

  const startX = Math.floor(regionX);
  const startY = Math.floor(regionY);
  const endX = Math.min(startX + Math.floor(regionWidth), imageWidth);
  const endY = startY + Math.floor(regionHeight);

  for (let y = startY; y < endY; y += step) {
    for (let x = startX; x < endX; x += step) {
      const idx = (y * imageWidth + x) * bytesPerPixel;
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

export const usePaintingAnalysis = (
  paintingSource: ReturnType<typeof require>,
): UsePaintingAnalysisResult => {
  const [gridCells, setGridCells] = useState<GridCell[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const paintingImage = useImage(paintingSource);

  // Calculate grid dimensions from image aspect ratio
  const gridDimensions = useMemo((): GridDimensions => {
    if (!paintingImage) {
      return { cols: 0, rows: 0, totalCells: 0, aspectRatio: 1 };
    }

    const width = paintingImage.width();
    const height = paintingImage.height();
    const aspectRatio = width / height;

    // Calculate grid that maintains aspect ratio with ~TARGET_CELLS total
    const rows = Math.round(Math.sqrt(TARGET_CELLS / aspectRatio));
    const cols = Math.round(rows * aspectRatio);
    const totalCells = cols * rows;

    return { cols, rows, totalCells, aspectRatio };
  }, [paintingImage]);

  useEffect(() => {
    if (!paintingImage || gridDimensions.cols === 0) {
      return;
    }

    const { cols, rows, totalCells } = gridDimensions;
    const imageWidth = paintingImage.width();
    const imageHeight = paintingImage.height();
    const cellWidth = imageWidth / cols;
    const cellHeight = imageHeight / rows;

    // Create a unique cache key
    const paintingKey = `${imageWidth}x${imageHeight}-${cols}x${rows}`;

    // Return cached result if available
    if (cachedPaintingAnalysis && cachedPaintingKey === paintingKey) {
      setGridCells(cachedPaintingAnalysis);
      setProgress(100);
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setError(null);

    // Read ALL pixels once (this is the expensive operation)
    const pixels = paintingImage.readPixels(0, 0, {
      width: imageWidth,
      height: imageHeight,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });

    if (!pixels) {
      setError('Failed to read painting pixels');
      setIsAnalyzing(false);
      return;
    }

    setProgress(10);

    // Now sample from the buffer - this is fast!
    const cells: GridCell[] = [];

    for (let i = 0; i < totalCells; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = col * cellWidth;
      const y = row * cellHeight;

      const rgb = sampleRegionFromBuffer(
        pixels,
        imageWidth,
        x,
        y,
        cellWidth,
        cellHeight,
      );

      const targetLab: LAB = rgbToLab(rgb);

      cells.push({
        index: i,
        row,
        col,
        targetColor: rgb,
        targetLab,
        photoId: null,
      });

      // Update progress periodically
      if (i % 1000 === 0) {
        setProgress(10 + Math.round((i / totalCells) * 90));
      }
    }

    cachedPaintingAnalysis = cells;
    cachedPaintingKey = paintingKey;
    setGridCells(cells);
    setProgress(100);
    setIsAnalyzing(false);
  }, [paintingImage, gridDimensions]);

  return {
    gridCells,
    gridDimensions,
    isAnalyzing,
    progress,
    error,
  };
};

// Clear the cache (useful for testing)
export const clearPaintingAnalysisCache = (): void => {
  cachedPaintingAnalysis = null;
  cachedPaintingKey = null;
};
