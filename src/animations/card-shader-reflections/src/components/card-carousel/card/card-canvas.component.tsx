import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { type FC } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { cardShader } from './card.shader';

interface CardCanvasProps {
  rotation: SharedValue<number>;
  cardType: number;
  width: number;
  height: number;
}

export const CardCanvas: FC<CardCanvasProps> = ({
  rotation,
  cardType,
  width,
  height,
}) => {
  const uniforms = useDerivedValue(
    () => ({
      rotate: rotation.value,
      resolution: [width, height],
      cardType,
    }),
    [rotation, width, height, cardType],
  );

  return (
    <Canvas style={[StyleSheet.absoluteFillObject, { width, height }]}>
      <Fill>
        <Shader source={cardShader} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
};
