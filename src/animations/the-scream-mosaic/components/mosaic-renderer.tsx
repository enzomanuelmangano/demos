import { useMemo } from 'react';

import { ColorMatrix, Group, Picture, Skia } from '@shopify/react-native-skia';

import type { PhotoInfo } from '../hooks/use-photo-atlas';
import type { RGB } from '../types';
import type { SkImage } from '@shopify/react-native-skia';

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
}

interface MosaicRendererProps {
  atlas: SkImage | null;
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export const MosaicRenderer = ({
  cells,
  photoInfoMap,
  cellWidth,
  cellHeight,
  canvasWidth,
  canvasHeight,
}: MosaicRendererProps) => {
  // Pre-render all cells as solid colored rectangles using each photo's average color
  // This creates a clean mosaic effect where each cell is a single color "pixel"
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, canvasWidth, canvasHeight),
    );

    const paint = Skia.Paint();

    for (const cell of cells) {
      const dstRect = Skia.XYWHRect(cell.x, cell.y, cellWidth, cellHeight);

      // Get the photo's average color, or fall back to the target color
      const info = cell.photoId !== null ? photoInfoMap.get(cell.photoId) : null;
      const color = info?.averageColor ?? cell.placeholderColor;

      const { r, g, b } = color;
      paint.setColor(Skia.Color(`rgb(${r}, ${g}, ${b})`));
      canvas.drawRect(dstRect, paint);
    }

    return recorder.finishRecordingAsPicture();
  }, [cells, photoInfoMap, cellWidth, cellHeight, canvasWidth, canvasHeight]);

  if (!picture) {
    return null;
  }

  // Contrast boost matrix: increases contrast by 1.4x, centered around 0.5
  const contrast = 1.4;
  const offset = 0.5 * (1 - contrast);
  const contrastMatrix = [
    contrast, 0, 0, 0, offset,
    0, contrast, 0, 0, offset,
    0, 0, contrast, 0, offset,
    0, 0, 0, 1, 0,
  ];

  return (
    <Group>
      <Picture picture={picture}>
        <ColorMatrix matrix={contrastMatrix} />
      </Picture>
    </Group>
  );
};
