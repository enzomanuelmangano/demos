import { memo } from 'react';

import { Blur, Group, Image, Rect, useImage } from '@shopify/react-native-skia';

import { DISPLAY_SIZE, getPhotoUrl } from '../constants';

import type { RGB } from '../types';
import type { SharedValue } from 'react-native-reanimated';

interface PhotoCellProps {
  photoId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholderColor: RGB;
  blur: SharedValue<number>;
}

const PhotoCellInner = ({
  photoId,
  x,
  y,
  width,
  height,
  placeholderColor,
  blur,
}: PhotoCellProps) => {
  const url = photoId !== null ? getPhotoUrl(photoId, DISPLAY_SIZE) : null;
  const image = useImage(url);

  // Show placeholder color while loading or if no photo assigned
  if (!image) {
    const colorString = `rgb(${placeholderColor.r}, ${placeholderColor.g}, ${placeholderColor.b})`;
    return (
      <Rect x={x} y={y} width={width} height={height} color={colorString} />
    );
  }

  return (
    <Group clip={{ x, y, width, height }} layer={<Blur blur={blur} />}>
      <Image
        image={image}
        x={x}
        y={y}
        width={width}
        height={height}
        fit="cover"
      />
    </Group>
  );
};

export const PhotoCell = memo(PhotoCellInner);
