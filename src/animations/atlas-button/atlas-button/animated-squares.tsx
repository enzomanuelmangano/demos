import {
  Atlas,
  Fill,
  useRSXformBuffer,
  useRectBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { type FC, memo, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

type AnimatedSquaresProps = {
  width: number;
  height: number;
  progress: SharedValue<number>;
  colors: Array<Float32Array>;
  horizontalSquaresAmount?: number;
};

export const AnimatedSquares: FC<AnimatedSquaresProps> = memo(
  ({
    width,
    height,
    progress,
    colors: _colors,
    horizontalSquaresAmount = 50,
  }) => {
    const HSquares = horizontalSquaresAmount;
    const SquareContainerSize = Math.floor(width / HSquares);
    const SquareSize = SquareContainerSize - 2.5;
    const VSquares = Math.floor(height / SquareContainerSize);
    const SquaresAmount = HSquares * VSquares;

    const maxRadius = Math.sqrt(width ** 2 + height ** 2) / 2;

    const activeRadius = useDerivedValue(() => {
      return progress.value * maxRadius;
    }, [maxRadius]);

    const texture = useTexture(<Fill color={'white'} />, {
      width,
      height,
    });

    const staticColors = useMemo(() => {
      return Array.from({ length: SquaresAmount }, () => {
        const rand = Math.floor(Math.random() * _colors.length);
        return _colors[rand];
      });
    }, [SquaresAmount, _colors]);

    const randomValues = useMemo(() => {
      return Array.from({ length: SquaresAmount }, () => Math.random());
    }, [SquaresAmount]);

    const transforms = useRSXformBuffer(SquaresAmount, (val, i) => {
      'worklet';

      const tx = (i % HSquares) * SquareContainerSize;
      const ty = Math.floor(i / HSquares) * SquareContainerSize;

      const distance = Math.sqrt(
        (tx - width / 2) ** 2 + (ty - height / 2) ** 2,
      );

      const scale = Math.max(0, 1.5 - distance / activeRadius.value);

      const randomValue = randomValues[i] || 1;

      // Hide the square if the scale is above a certain threshold
      // The randomness is used to make the animation more interesting and less uniform
      // The trick is to maximize the probability of the square being hidden in the center
      // That's because the scale range in the center will be between [0.9, 1.4]
      if (scale >= 0.9 + randomValue * 0.5) {
        val.set(0, 0, 0, 0);
        return;
      }

      val.set(scale, 0, tx, ty);
    });

    const sprites = useRectBuffer(SquaresAmount, (val, j) => {
      'worklet';

      const x = (j % HSquares) * SquareContainerSize;
      const y = Math.floor(j / HSquares) * SquareContainerSize;
      val.setXYWH(x, y, SquareSize, SquareSize);
    });

    return (
      <Atlas
        image={texture}
        sprites={sprites}
        colors={staticColors}
        transforms={transforms}
      />
    );
  },
);
