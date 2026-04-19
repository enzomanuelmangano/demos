import { useCallback, useEffect, useMemo, useState } from 'react';

import { useImage } from '@shopify/react-native-skia';

import { TARGET_CELLS } from '../constants';
import { rgbToLab } from '../utils/color-conversion';
import { sampleRegionColor } from '../utils/pixel-sampling';

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

  const analyzePainting = useCallback(async () => {
    if (!paintingImage || gridDimensions.cols === 0) {
      return;
    }

    const { cols, rows, totalCells } = gridDimensions;
    const imageWidth = paintingImage.width();
    const imageHeight = paintingImage.height();
    const cellWidth = imageWidth / cols;
    const cellHeight = imageHeight / rows;

    // Sample a few spots to create a unique key that changes with image content
    const sampleSpots = [
      { x: 0, y: 0 },
      { x: Math.floor(imageWidth / 2), y: Math.floor(imageHeight / 2) },
      { x: imageWidth - 1, y: imageHeight - 1 },
    ];
    const colorSig = sampleSpots
      .map(spot => {
        const color = sampleRegionColor(paintingImage, spot.x, spot.y, 1, 1);
        return color ? `${color.r}-${color.g}-${color.b}` : '0';
      })
      .join('|');
    const paintingKey = `${imageWidth}x${imageHeight}-${cols}x${rows}-${colorSig}`;

    // Return cached result if available and key matches
    if (cachedPaintingAnalysis && cachedPaintingKey === paintingKey) {
      setGridCells(cachedPaintingAnalysis);
      setProgress(100);
      return;
    }

    // Clear stale cache
    cachedPaintingAnalysis = null;
    cachedPaintingKey = null;

    setIsAnalyzing(true);
    setProgress(0);
    setError(null);

    const cells: GridCell[] = [];

    // Process in batches to avoid blocking
    const processBatch = (startIndex: number): Promise<void> => {
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          const batchSize = 25;
          const endIndex = Math.min(startIndex + batchSize, totalCells);

          for (let i = startIndex; i < endIndex; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            const x = col * cellWidth;
            const y = row * cellHeight;

            const rgb = sampleRegionColor(
              paintingImage,
              x,
              y,
              cellWidth,
              cellHeight,
            );

            const targetColor: RGB = rgb || { r: 128, g: 128, b: 128 };
            const targetLab: LAB = rgbToLab(targetColor);

            cells.push({
              index: i,
              row,
              col,
              targetColor,
              targetLab,
              photoId: null,
            });
          }

          setProgress(Math.round((endIndex / totalCells) * 100));

          if (endIndex < totalCells) {
            setTimeout(() => processBatch(endIndex).then(resolve), 0);
          } else {
            resolve();
          }
        });
      });
    };

    try {
      await processBatch(0);
      cachedPaintingAnalysis = cells;
      cachedPaintingKey = paintingKey;
      setGridCells(cells);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze painting',
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [paintingImage, gridDimensions]);

  useEffect(() => {
    if (paintingImage) {
      analyzePainting();
    }
  }, [paintingImage, analyzePainting]);

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
