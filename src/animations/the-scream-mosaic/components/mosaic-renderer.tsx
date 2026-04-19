import { useMemo } from 'react';

import { Group, Picture, Skia } from '@shopify/react-native-skia';

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

    // Heavy blur - makes each image look like a solid color pixel
    const blurRadius = Math.max(cellWidth, cellHeight) * 0.4;
    const paint = Skia.Paint();
    const blurFilter = Skia.ImageFilter.MakeBlur(
      blurRadius,
      blurRadius,
      1, // TileMode.Clamp
      null,
    );
    paint.setImageFilter(blurFilter);

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

  return (
    <Group>
      <Picture picture={picture} />
    </Group>
  );
};
