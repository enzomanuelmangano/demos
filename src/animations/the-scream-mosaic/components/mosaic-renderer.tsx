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
  // Pre-render all images into a Picture with heavy blur
  // Each image becomes a colored "pixel" when zoomed out
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, canvasWidth, canvasHeight),
    );

    // No blur - let the small cell size create the mosaic effect naturally
    const paint = Skia.Paint();

    for (const cell of cells) {
      if (cell.photoId === null) continue;
      const info = photoInfoMap.get(cell.photoId);
      if (!info?.image) continue;

      const srcRect = Skia.XYWHRect(
        0,
        0,
        info.image.width(),
        info.image.height(),
      );
      const dstRect = Skia.XYWHRect(cell.x, cell.y, cellWidth, cellHeight);

      canvas.drawImageRect(info.image, srcRect, dstRect, paint);
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
