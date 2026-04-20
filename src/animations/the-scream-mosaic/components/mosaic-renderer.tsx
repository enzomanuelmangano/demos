import { useMemo } from 'react';

import { Atlas, ColorMatrix, Group, Image, Picture, rect, Skia } from '@shopify/react-native-skia';

import type { PhotoInfo } from '../hooks/use-photo-atlas';
import type { RGB } from '../types';
import type { SkImage, SkRSXform } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
}

interface HighResCache {
  [cellIndex: number]: SkImage;
}

interface MosaicRendererProps {
  atlas: SkImage | null;
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
  cellHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  imageOpacity: SharedValue<number>;
  highResImages?: HighResCache;
}

export const MosaicRenderer = ({
  atlas,
  cells,
  photoInfoMap,
  cellWidth,
  cellHeight,
  canvasWidth,
  canvasHeight,
  imageOpacity,
  highResImages = {},
}: MosaicRendererProps) => {
  // Picture with solid colored rectangles (visible when zoomed out)
  const colorPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, canvasWidth, canvasHeight),
    );

    const paint = Skia.Paint();

    for (const cell of cells) {
      const dstRect = Skia.XYWHRect(cell.x, cell.y, cellWidth, cellHeight);
      const info = cell.photoId !== null ? photoInfoMap.get(cell.photoId) : null;
      const color = info?.averageColor ?? cell.placeholderColor;

      const { r, g, b } = color;
      paint.setColor(Skia.Color(`rgb(${r}, ${g}, ${b})`));
      canvas.drawRect(dstRect, paint);
    }

    return recorder.finishRecordingAsPicture();
  }, [cells, photoInfoMap, cellWidth, cellHeight, canvasWidth, canvasHeight]);

  // Atlas sprites and transforms for efficient batch rendering
  const { sprites, transforms } = useMemo(() => {
    const spriteRects: ReturnType<typeof rect>[] = [];
    const xforms: SkRSXform[] = [];

    for (const cell of cells) {
      if (cell.photoId === null) {
        continue;
      }

      const info = photoInfoMap.get(cell.photoId);
      if (!info) {
        continue;
      }

      // Source rect from the atlas
      spriteRects.push(
        rect(info.atlasRect.x, info.atlasRect.y, info.atlasRect.width, info.atlasRect.height),
      );

      // Transform: scale from atlas size to cell size, then translate to position
      const scale = cellWidth / info.atlasRect.width;

      // RSXform: [scos, ssin, tx, ty]
      // For scaling without rotation: scos = scale, ssin = 0
      // tx/ty are the translation
      xforms.push(
        Skia.RSXform(scale, 0, cell.x, cell.y),
      );
    }

    return { sprites: spriteRects, transforms: xforms };
  }, [cells, photoInfoMap, cellWidth, cellHeight]);

  if (!colorPicture) {
    return null;
  }

  // High-res images to render on top
  const highResEntries = useMemo(() => {
    return cells
      .filter(cell => highResImages[cell.index])
      .map(cell => ({
        cell,
        image: highResImages[cell.index],
      }));
  }, [cells, highResImages]);

  // Contrast boost matrix
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
      {/* Base layer: solid colors (always visible) */}
      <Picture picture={colorPicture}>
        <ColorMatrix matrix={contrastMatrix} />
      </Picture>

      {/* Middle layer: atlas sprites (low-res) */}
      {atlas && sprites.length > 0 && (
        <Group opacity={imageOpacity}>
          <Atlas
            image={atlas}
            sprites={sprites}
            transforms={transforms}
          >
            <ColorMatrix matrix={contrastMatrix} />
          </Atlas>
        </Group>
      )}

      {/* Top layer: high-res images (loaded on demand) */}
      {highResEntries.map(({ cell, image }) => (
        <Image
          key={cell.index}
          image={image}
          x={cell.x}
          y={cell.y}
          width={cellWidth}
          height={cellHeight}
          fit="cover"
        >
          <ColorMatrix matrix={contrastMatrix} />
        </Image>
      ))}
    </Group>
  );
};
