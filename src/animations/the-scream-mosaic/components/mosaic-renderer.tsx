import { useMemo } from 'react';

import { Group, Image } from '@shopify/react-native-skia';

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
}

export const MosaicRenderer = ({
  cells,
  photoInfoMap,
  cellWidth,
  cellHeight,
}: MosaicRendererProps) => {
  // Build list of images to render
  const imagesToRender = useMemo(() => {
    const images: { image: SkImage; x: number; y: number; key: number }[] = [];

    for (const cell of cells) {
      if (cell.photoId === null) continue;
      const info = photoInfoMap.get(cell.photoId);
      if (!info?.image) continue;

      images.push({
        image: info.image,
        x: cell.x,
        y: cell.y,
        key: cell.index,
      });
    }

    console.log('[MosaicRenderer] Rendering', images.length, 'images');
    return images;
  }, [cells, photoInfoMap]);

  if (imagesToRender.length === 0) {
    return null;
  }

  return (
    <Group>
      {imagesToRender.map(item => (
        <Image
          key={item.key}
          image={item.image}
          x={item.x}
          y={item.y}
          width={cellWidth}
          height={cellHeight}
          fit="cover"
        />
      ))}
    </Group>
  );
};
