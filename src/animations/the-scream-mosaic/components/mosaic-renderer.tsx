import { useMemo } from 'react';

import { Atlas, Group, rect, Skia } from '@shopify/react-native-skia';

import { ATLAS_TILE_SIZE } from '../hooks/use-photo-atlas';

import type { PhotoInfo } from '../hooks/use-photo-atlas';
import type { RGB } from '../types';
import type { SkImage, SkRSXform, SkRect } from '@shopify/react-native-skia';

interface CellData {
  index: number;
  x: number;
  y: number;
  photoId: number | null;
  placeholderColor: RGB;
}

interface MosaicRendererProps {
  atlas: SkImage;
  cells: CellData[];
  photoInfoMap: Map<number, PhotoInfo>;
  cellWidth: number;
}

export const MosaicRenderer = ({
  atlas,
  cells,
  photoInfoMap,
  cellWidth,
}: MosaicRendererProps) => {
  // Build sprites and transforms together
  const { sprites, transforms } = useMemo(() => {
    const rects: SkRect[] = [];
    const xforms: SkRSXform[] = [];

    // Scale from atlas tile size to cell size
    const scale = cellWidth / ATLAS_TILE_SIZE;

    for (const cell of cells) {
      if (cell.photoId === null) continue;
      const info = photoInfoMap.get(cell.photoId);
      if (!info) continue;

      // Source rect in atlas
      rects.push(
        rect(info.atlasX, info.atlasY, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE),
      );

      // Transform: scale and position
      // RSXform(scos, ssin, tx, ty) - no rotation so scos=scale, ssin=0
      xforms.push(Skia.RSXform(scale, 0, cell.x, cell.y));
    }

    return { sprites: rects, transforms: xforms };
  }, [cells, photoInfoMap, cellWidth]);

  if (sprites.length === 0) {
    return null;
  }

  return (
    <Group>
      <Atlas image={atlas} sprites={sprites} transforms={transforms} />
    </Group>
  );
};
