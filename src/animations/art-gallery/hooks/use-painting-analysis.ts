import { Image } from 'react-native';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import { TARGET_CELLS } from '../constants';

import type { GridCell, RGB } from '../types';
import type { SkImage } from '@shopify/react-native-skia';

// Module-level cache
let cachedPaintingAnalysis: GridCell[] | null = null;
let cachedPaintingKey: string | null = null;

export interface GridDimensions {
  cols: number;
  rows: number;
  totalCells: number;
  aspectRatio: number;
}

export const EMPTY_DIMENSIONS: GridDimensions = {
  cols: 0,
  rows: 0,
  totalCells: 0,
  aspectRatio: 1,
};

export interface AnalysisResult {
  gridCells: GridCell[];
  gridDimensions: GridDimensions;
}

export const EMPTY_ANALYSIS: AnalysisResult = {
  gridCells: [],
  gridDimensions: EMPTY_DIMENSIONS,
};

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

// Synchronous analysis of a loaded image
const analyzeImage = (image: SkImage): AnalysisResult => {
  const imageWidth = image.width();
  const imageHeight = image.height();
  const aspectRatio = imageWidth / imageHeight;

  const rows = Math.round(Math.sqrt(TARGET_CELLS / aspectRatio));
  const cols = Math.round(rows * aspectRatio);
  const totalCells = cols * rows;
  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  const paintingKey = `${imageWidth}x${imageHeight}-${cols}x${rows}`;
  const dimensions = { cols, rows, totalCells, aspectRatio };

  // Return cached if available
  if (cachedPaintingAnalysis && cachedPaintingKey === paintingKey) {
    return { gridCells: cachedPaintingAnalysis, gridDimensions: dimensions };
  }

  const pixels = image.readPixels(0, 0, {
    width: imageWidth,
    height: imageHeight,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });

  if (!pixels) {
    return EMPTY_ANALYSIS;
  }

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
    cells.push({ index: i, row, col, targetColor: rgb, photoId: null });
  }

  cachedPaintingAnalysis = cells;
  cachedPaintingKey = paintingKey;

  return { gridCells: cells, gridDimensions: dimensions };
};

/**
 * Load and analyze a painting - call this directly from event handlers
 */
export const loadAndAnalyzePainting = async (
  paintingSource: ReturnType<typeof require>,
): Promise<AnalysisResult> => {
  const resolved = Image.resolveAssetSource(paintingSource);
  if (!resolved?.uri) {
    return EMPTY_ANALYSIS;
  }

  try {
    const data = await Skia.Data.fromURI(resolved.uri);
    const image = Skia.Image.MakeImageFromEncoded(data);

    if (image) {
      return analyzeImage(image);
    }
  } catch {
    // Silently fail
  }

  return EMPTY_ANALYSIS;
};

export const clearPaintingAnalysisCache = (): void => {
  cachedPaintingAnalysis = null;
  cachedPaintingKey = null;
};
