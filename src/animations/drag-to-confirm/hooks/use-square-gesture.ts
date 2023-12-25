import type { SkiaMutableValue, SkiaValue } from '@shopify/react-native-skia';
import {
  clamp,
  Extrapolate,
  interpolate,
  runSpring,
  Skia,
  useComputedValue,
} from '@shopify/react-native-skia';
import { useGestureHandler } from 'react-native-skia-gesture';

type UseSquareGestureParams = {
  minTranslateX: number;
  maxTranslateX: SkiaValue<number>;
  translateX: SkiaMutableValue<number>;
  squareY: SkiaValue<number>;
  squareSize: number;
  onComplete?: () => void;
};

export const useSquarePathGesture = ({
  translateX,
  minTranslateX,
  maxTranslateX,
  squareY,
  squareSize,
  onComplete,
}: UseSquareGestureParams) => {
  const squareGesture = useGestureHandler<{ x: number }>({
    onStart: (_, ctx) => {
      ctx.x = translateX.current;
    },
    onActive: (event, ctx) => {
      translateX.current = Math.min(
        Math.max(ctx.x + event.translationX, minTranslateX),
        maxTranslateX.current,
      );
    },
    onEnd: () => {
      const isComplete = translateX.current > maxTranslateX.current / 2;

      if (isComplete && onComplete) {
        setTimeout(onComplete, 200);
      }

      runSpring(
        translateX,
        isComplete ? maxTranslateX.current : minTranslateX,
        { damping: 10, mass: 1, stiffness: 100 },
      );
    },
  });

  const offsetRight = useComputedValue(() => {
    return interpolate(
      translateX.current,
      [
        minTranslateX - 20,
        minTranslateX,
        maxTranslateX.current / 2,
        (3 * maxTranslateX.current) / 4,
        maxTranslateX.current,
      ],
      [-10, 0, 0, 10, 0],
      Extrapolate.CLAMP,
    );
  }, [translateX, maxTranslateX, minTranslateX]);

  const offsetLeft = useComputedValue(() => {
    return interpolate(
      translateX.current,
      [maxTranslateX.current, maxTranslateX.current + 20],
      [0, 10],
      Extrapolate.CLAMP,
    );
  }, [translateX, maxTranslateX, minTranslateX]);

  const squarePath = useComputedValue(() => {
    const path = Skia.Path.Make();

    const clampedTranslateX = clamp(
      translateX.current,
      minTranslateX,
      maxTranslateX.current,
    );

    path.moveTo(clampedTranslateX, squareY.current);
    path.lineTo(clampedTranslateX + squareSize, squareY.current);
    path.lineTo(
      clampedTranslateX + squareSize + offsetRight.current,
      squareY.current + squareSize / 2,
    );
    path.lineTo(clampedTranslateX + squareSize, squareY.current + squareSize);
    path.lineTo(clampedTranslateX, squareY.current + squareSize);
    path.lineTo(
      clampedTranslateX + offsetLeft.current,
      squareY.current + squareSize / 2,
    );
    path.close();

    return path;
  }, [
    translateX,
    squareY,
    minTranslateX,
    maxTranslateX,
    offsetRight,
    offsetLeft,
  ]);

  return { gesture: squareGesture, path: squarePath, offsetRight, offsetLeft };
};
