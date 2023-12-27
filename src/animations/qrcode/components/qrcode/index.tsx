import React, { useMemo } from 'react';
import type { SkiaValue } from '@shopify/react-native-skia';
import {
  useValue,
  Skia,
  Canvas,
  Path as SkiaPath,
  useComputedValue,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ErrorCorrectionLevelType } from './generate-matrix';
import { generateMatrix } from './generate-matrix';
import { transformMatrixIntoPath } from './transform-matrix-into-path';

type QRCodeProps = {
  value: string;
  style?: StyleProp<ViewStyle>;
  // Level L 7%, level M 15%, level Q 25%, level H 30%.
  errorCorrectionLevel: ErrorCorrectionLevelType;
  pathColor?: string;
  strokeWidthPercentage?: number | SkiaValue<number>;
  children?: React.ReactNode;
};

const unwrapValue = <T,>(val: T | SkiaValue<T>): T => {
  if ((val as SkiaValue<T>).current != null)
    return (val as SkiaValue<T>).current;
  return val as T;
};

// If the width, height (size) is already available
// then we can instantly retrieve it
const parseInitialLayout = (style: ViewStyle) => {
  const { width, height } = style;
  if (typeof width === 'number') return { width, height: width };
  if (typeof height === 'number') return { height, width: height };
  return {
    height: 0,
    width: 0,
  };
};

const QRCode: React.FC<QRCodeProps> = React.memo(
  ({
    value,
    style,
    pathColor = '#FFFFFF',
    children,
    errorCorrectionLevel = children != null ? 'H' : 'M',
    strokeWidthPercentage = 1,
  }) => {
    const flattenedStyle = useMemo(() => StyleSheet.flatten(style), [style]);
    const canvasSize = useValue(parseInitialLayout(flattenedStyle ?? {}));

    const computedPath = useComputedValue(() => {
      return transformMatrixIntoPath(
        generateMatrix(value, errorCorrectionLevel),
        canvasSize.current.width,
      );
    }, [canvasSize, errorCorrectionLevel, value]);

    const path = useComputedValue(() => {
      return Skia.Path.MakeFromSVGString(computedPath.current.path)!;
    }, [computedPath]);

    const maxStrokeWidth = useComputedValue(() => {
      const normalizedStrokeWidthPercentage = unwrapValue(
        strokeWidthPercentage,
      );
      return computedPath.current.cellSize * normalizedStrokeWidthPercentage;
    }, [computedPath, strokeWidthPercentage]);

    return (
      <Canvas style={style} onSize={canvasSize}>
        <SkiaPath
          path={path}
          color={pathColor}
          strokeWidth={maxStrokeWidth}
          style={'stroke'}>
          {children}
        </SkiaPath>
      </Canvas>
    );
  },
);

// eslint-disable-next-line import/no-default-export
export default QRCode;
