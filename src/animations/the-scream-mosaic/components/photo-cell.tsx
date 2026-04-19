import { memo } from 'react';

import { Image, Rect, useImage } from '@shopify/react-native-skia';

import { DISPLAY_SIZE, getPhotoUrl } from '../constants';

import type { RGB } from '../types';

interface PhotoCellProps {
  photoId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholderColor: RGB;
}

const PhotoCellInner = ({
  photoId,
  x,
  y,
  width,
  height,
  placeholderColor,
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
    <Image
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      fit="cover"
    />
  );
};

export const PhotoCell = memo(PhotoCellInner);
