import { useEffect, useMemo, useState } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Image } from 'react-native';

import { TARGET_CELLS } from '../constants';
import { rgbToLab } from '../utils/color-conversion';

import type { GridCell, LAB, RGB } from '../types';
import type { SkImage } from '@shopify/react-native-skia';

// Module-level cache
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
  const data =
    pixels instanceof Uint8Array
      ? pixels
      : new Uint8Array(pixels as ArrayBufferLike);
  const bytesPerPixel = 4;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

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
  const [paintingImage, setPaintingImage] = useState<SkImage | null>(null);
  const [gridCells, setGridCells] = useState<GridCell[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load painting image directly (faster than useImage)
  useEffect(() => {
    const loadPainting = async () => {
      console.log('[Painting] Loading...');
      const startTime = Date.now();

      const resolved = Image.resolveAssetSource(paintingSource);
      if (!resolved?.uri) {
        setError('Failed to resolve painting');
        setIsAnalyzing(false);
        return;
      }

      try {
        const response = await fetch(resolved.uri);
        const arrayBuffer = await response.arrayBuffer();
        const data = Skia.Data.fromBytes(new Uint8Array(arrayBuffer));
        const image = Skia.Image.MakeImageFromEncoded(data);

        if (image) {
          setPaintingImage(image);
          console.log(`[Painting] Loaded in ${Date.now() - startTime}ms`);
        } else {
          setError('Failed to decode painting');
          setIsAnalyzing(false);
        }
      } catch (e) {
        setError('Failed to load painting');
        setIsAnalyzing(false);
      }
    };

    loadPainting();
  }, [paintingSource]);

  // Calculate grid dimensions
  const gridDimensions = useMemo((): GridDimensions => {
    if (!paintingImage) {
      return { cols: 0, rows: 0, totalCells: 0, aspectRatio: 1 };
    }

    const width = paintingImage.width();
    const height = paintingImage.height();
    const aspectRatio = width / height;

    const rows = Math.round(Math.sqrt(TARGET_CELLS / aspectRatio));
    const cols = Math.round(rows * aspectRatio);
    const totalCells = cols * rows;

    return { cols, rows, totalCells, aspectRatio };
  }, [paintingImage]);

  // Analyze painting when image loads
  useEffect(() => {
    if (!paintingImage || gridDimensions.cols === 0) {
      return;
    }

    const { cols, rows, totalCells } = gridDimensions;
    const imageWidth = paintingImage.width();
    const imageHeight = paintingImage.height();
    const cellWidth = imageWidth / cols;
    const cellHeight = imageHeight / rows;

    const paintingKey = `${imageWidth}x${imageHeight}-${cols}x${rows}`;

    if (cachedPaintingAnalysis && cachedPaintingKey === paintingKey) {
      setGridCells(cachedPaintingAnalysis);
      setProgress(100);
      setIsAnalyzing(false);
      return;
    }

    console.log('[Painting] Analyzing...');
    const startTime = Date.now();
    setProgress(0);

    // Read ALL pixels once
    const pixels = paintingImage.readPixels(0, 0, {
      width: imageWidth,
      height: imageHeight,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });

    if (!pixels) {
      setError('Failed to read pixels');
      setIsAnalyzing(false);
      return;
    }

    setProgress(10);

    // Sample from buffer - fast!
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
    }

    cachedPaintingAnalysis = cells;
    cachedPaintingKey = paintingKey;
    setGridCells(cells);
    setProgress(100);
    setIsAnalyzing(false);
    console.log(`[Painting] Analyzed in ${Date.now() - startTime}ms`);
  }, [paintingImage, gridDimensions]);

  return {
    gridCells,
    gridDimensions,
    isAnalyzing,
    progress,
    error,
  };
};

export const clearPaintingAnalysisCache = (): void => {
  cachedPaintingAnalysis = null;
  cachedPaintingKey = null;
};
