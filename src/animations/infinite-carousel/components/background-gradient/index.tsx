import {
  Blur,
  Canvas,
  Rect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import { memo, type FC } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { DEFAULT_WHITE, WindowHeight, WindowWidth } from '../../constants';

type BackgroundGradientProps = {
  mainColor: SharedValue<string>;
};

// This code looks complex but honestly, it's very simple.
// Here I'm simply creating an animated gradient with Skia.
// All this Rects, Blurs and SweepGradients are just added to create a nice effect.
// But the truth is that everything is based on a very simple concept.
// Learn more: Animated Gradient in React Native (Skia) https://youtu.be/ZSPvvGU2LBg

export const BackgroundGradient: FC<BackgroundGradientProps> = memo(
  ({ mainColor }) => {
    const sweepGradientColors = useDerivedValue(() => {
      return [DEFAULT_WHITE, mainColor.value, mainColor.value];
    }, []);

    return (
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect
          x={0}
          y={0}
          width={WindowWidth}
          height={WindowHeight}
          color={mainColor}
          opacity={0.75}
        />
        <Rect x={0} y={0} width={WindowWidth} height={WindowHeight}>
          <SweepGradient
            c={vec(WindowWidth / 2, WindowHeight / 2)}
            colors={sweepGradientColors}
          />
          <Blur blur={30} />
        </Rect>
        <Rect
          x={0}
          y={0}
          width={WindowWidth}
          height={WindowHeight}
          opacity={0.3}>
          <SweepGradient
            c={vec(WindowWidth / 2, WindowHeight / 2)}
            colors={['white', 'white', '#d9d9d9']}
          />
          <Blur blur={10} />
        </Rect>
      </Canvas>
    );
  },
);
