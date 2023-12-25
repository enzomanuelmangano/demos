import { StyleSheet, Text, View } from 'react-native';
import React from 'react';
import {
  CornerPathEffect,
  Path,
  Skia,
  SkiaValue,
  useComputedValue,
} from '@shopify/react-native-skia';

type DestinationSquareProps = {
  squareY: SkiaValue<number>;
  maxTranslateX: SkiaValue<number>;
  offsetRight: SkiaValue<number>;
  squareSize: number;
  cornerRadius: number;
  opacity?: SkiaValue<number> | number;
};

const DestinationSquare: React.FC<DestinationSquareProps> = React.memo(
  ({
    squareY,
    maxTranslateX,
    offsetRight,
    squareSize,
    cornerRadius,
    opacity,
  }) => {
    const destinationSquarePath = useComputedValue(() => {
      const path = Skia.Path.Make();

      const x = maxTranslateX.current;

      path.moveTo(x, squareY.current);
      path.lineTo(x + squareSize, squareY.current);
      path.lineTo(x + squareSize, squareY.current + squareSize);
      path.lineTo(x, squareY.current + squareSize);
      path.lineTo(
        x - Math.max(offsetRight.current, 0),
        squareY.current + squareSize / 2
      );
      path.lineTo(x, squareY.current);
      path.close();
      return path;
    }, [squareY, maxTranslateX, offsetRight]);

    return (
      <Path
        path={destinationSquarePath}
        style={'stroke'}
        color={'rgba(255,255,255,0.4)'}
        strokeWidth={1.8}
        opacity={opacity}
      >
        <CornerPathEffect r={cornerRadius} />
      </Path>
    );
  }
);

export { DestinationSquare };
