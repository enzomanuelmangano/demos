import { useMemo } from 'react';

import {
  Canvas,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';

type HighlightedPathProps = {
  width: number;
  height: number;
};

export const ShaderLight: React.FC<HighlightedPathProps> = ({
  width,
  height,
}) => {
  const internalCanvasHorizontalPadding = 5;
  const canvasWidth = width - internalCanvasHorizontalPadding * 2;

  const path = useMemo(() => {
    const builder = Skia.PathBuilder.Make();

    builder.moveTo(internalCanvasHorizontalPadding * 3, 0);
    builder.lineTo(width - internalCanvasHorizontalPadding * 3, 0);
    builder.lineTo(width, height);
    builder.lineTo(0, height);
    builder.close();

    return builder.build();
  }, [height, width]);

  return (
    <Canvas
      style={{
        width,
        height,
      }}>
      <Path path={path} color={'white'} opacity={0.5}>
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: height }}
          colors={['white', 'transparent']}
        />
      </Path>
      <RoundedRect
        x={internalCanvasHorizontalPadding}
        y={0}
        width={canvasWidth}
        height={7}
        color={'white'}
        r={20}
      />
    </Canvas>
  );
};
