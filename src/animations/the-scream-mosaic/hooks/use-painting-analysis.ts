import { useCallback, useEffect, useState } from 'react';

import { useImage } from '@shopify/react-native-skia';

import { GRID_COLS, GRID_ROWS, TOTAL_CELLS } from '../constants';
import { rgbToLab } from '../utils/color-conversion';
import { sampleRegionColor } from '../utils/pixel-sampling';

import type { GridCell, LAB, RGB } from '../types';

// Module-level cache for painting analysis
let cachedPaintingAnalysis: GridCell[] | null = null;

interface UsePaintingAnalysisResult {
  gridCells: GridCell[];
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

  const analyzePainting = useCallback(async () => {
    if (!paintingImage) {
      return;
    }

    // Return cached result if available
    if (cachedPaintingAnalysis) {
      setGridCells(cachedPaintingAnalysis);
      setProgress(100);
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setError(null);

    const cells: GridCell[] = [];
    const imageWidth = paintingImage.width();
    const imageHeight = paintingImage.height();
    const cellWidth = imageWidth / GRID_COLS;
    const cellHeight = imageHeight / GRID_ROWS;

    // Process in batches to avoid blocking
    const processBatch = (startIndex: number): Promise<void> => {
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          const batchSize = 25;
          const endIndex = Math.min(startIndex + batchSize, TOTAL_CELLS);

          for (let i = startIndex; i < endIndex; i++) {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);

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

          setProgress(Math.round((endIndex / TOTAL_CELLS) * 100));

          if (endIndex < TOTAL_CELLS) {
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
      setGridCells(cells);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze painting',
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [paintingImage]);

  useEffect(() => {
    if (paintingImage) {
      analyzePainting();
    }
  }, [paintingImage, analyzePainting]);

  return {
    gridCells,
    isAnalyzing,
    progress,
    error,
  };
};

// Clear the cache (useful for testing)
export const clearPaintingAnalysisCache = (): void => {
  cachedPaintingAnalysis = null;
};
