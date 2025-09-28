import { type FC, memo, useMemo } from 'react';

import { LinearGradient, Rect } from '@shopify/react-native-skia';

// Defining type for props
type BoundaryGradientProps = {
  mainColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Functional component for boundary gradient
export const BoundaryGradient: FC<BoundaryGradientProps> = memo(
  ({ x, y, width, height, mainColor }) => {
    // Memoizing the colors array
    const colors = useMemo(() => {
      return [
        mainColor,
        'transparent',
        'transparent',
        'transparent',
        mainColor,
      ];
    }, [mainColor]);

    // Returning a Rect component enclosing a LinearGradient
    return (
      <Rect x={x} y={y} width={width} height={height}>
        <LinearGradient
          colors={colors}
          start={{
            x: 0,
            y: 0,
          }}
          end={{
            x: width,
            y: 0,
          }}
        />
      </Rect>
    );
  },
);
