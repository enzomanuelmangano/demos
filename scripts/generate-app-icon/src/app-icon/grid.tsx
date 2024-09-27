import {
  DashPathEffect,
  Path,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import React, { useMemo } from 'react';

export const Grid = ({ size, Skia }: { size: number; Skia: Skia }) => {
  const grid = useMemo(() => {
    const skPath = Skia.Path.Make();
    // add a grid of lines
    const numberOfLines = 4;
    const lineWidth = size / numberOfLines;

    for (let i = 0; i < numberOfLines; i++) {
      skPath.lineTo(0, i * lineWidth);
      skPath.lineTo(size, i * lineWidth);
      skPath.moveTo(0, i * lineWidth);
    }

    for (let i = 0; i < numberOfLines; i++) {
      skPath.lineTo(i * lineWidth, 0);
      skPath.lineTo(i * lineWidth, size);
      skPath.moveTo(i * lineWidth, 0);
    }

    return skPath;
  }, [size, Skia]);

  return (
    <Path
      path={grid}
      style="stroke"
      strokeWidth={1}
      color="white"
      opacity={0.3}>
      <DashPathEffect intervals={[4, 4]} />
    </Path>
  );
};
