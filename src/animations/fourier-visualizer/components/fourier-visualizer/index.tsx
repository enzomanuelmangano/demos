import { forwardRef, useCallback, useImperativeHandle } from 'react';

import { Path, Skia } from '@shopify/react-native-skia';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { extractEpicycles } from './utils/extract-epicycles';
import { computeFFT } from './utils/fft';
import { fillToPowerOfTwo, getPoints } from './utils/fill';

import type { SkPath } from '@shopify/react-native-skia';

export type FourierVisualizerRefType = {
  draw: ({
    path,
    onComplete,
  }: {
    path: SkPath;
    onComplete?: () => void;
  }) => void;
  clear: () => void;
};

const FourierVisualizer = forwardRef<
  FourierVisualizerRefType,
  {
    strokeWidth?: number;
  }
>(({ strokeWidth = 2.5 }, ref) => {
  const time = useSharedValue(0);

  const baseEpicycles = useSharedValue<ReturnType<typeof extractEpicycles>>([]);

  const resultPath = useSharedValue(Skia.Path.Make());
  const circlesPath = useSharedValue(Skia.Path.Make());

  const opacity = useSharedValue(1);

  const draw = useCallback(
    ({ path, onComplete }: { path: SkPath; onComplete?: () => void }) => {
      'worklet';
      opacity.value = withTiming(1);

      const points = getPoints(path);

      const filledPoints = fillToPowerOfTwo(points);

      const data = computeFFT(filledPoints);

      const extractedEpicycles = extractEpicycles(data).sort(
        (a, b) => b.amplitude - a.amplitude,
      );

      baseEpicycles.value = extractedEpicycles;

      resultPath.value.reset();
      time.value = 0;

      time.value = withTiming(
        2 * Math.PI - 0.05,
        {
          duration: 20000,
          easing: Easing.linear,
        },
        finished => {
          if (finished) {
            opacity.value = withTiming(0);
            if (onComplete) {
              scheduleOnRN(onComplete);
            }
          }
        },
      );
    },
    [baseEpicycles, time, opacity, resultPath],
  );

  const epicyclePositions = useSharedValue<{ x: number; y: number }[]>([]);

  useAnimatedReaction(
    () => [time.value, baseEpicycles.value] as const,
    ([newTime, epicycles]) => {
      if (epicycles.length === 0) return;

      const positions: { x: number; y: number }[] = [];
      let cumulativeX = 0;
      let cumulativeY = 0;

      for (let index = 0; index < epicycles.length; index++) {
        const { frequency, amplitude, phase } = epicycles[index];

        const x =
          cumulativeX + amplitude * Math.cos(frequency * newTime + phase);
        const y =
          cumulativeY + amplitude * Math.sin(frequency * newTime + phase);

        positions.push({ x, y });

        cumulativeX = x;
        cumulativeY = y;
      }

      epicyclePositions.value = positions;
    },
  );

  const clear = useCallback(() => {
    'worklet';
    opacity.value = 0;
    baseEpicycles.value = [];
    epicyclePositions.value = [];
    resultPath.value.reset();
    cancelAnimation(time);
    time.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, baseEpicycles, epicyclePositions, time]);

  useImperativeHandle(
    ref,
    () => ({
      draw,
      clear,
    }),
    [draw, clear],
  );

  const drawPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    circlesPath.value.reset();

    const positions = epicyclePositions.value;
    const epicycles = baseEpicycles.value;

    if (positions.length === 0 || epicycles.length === 0) {
      return skPath;
    }

    let finalX = 0;
    let finalY = 0;

    for (let index = 0; index < positions.length; index++) {
      const { x, y } = positions[index];
      const { amplitude } = epicycles[index];

      if (index > 0) {
        const { x: prevX, y: prevY } = positions[index - 1];
        circlesPath.value.addCircle(prevX, prevY, amplitude);
      }

      const lastSkiaPathPt = skPath.getLastPt();
      if (lastSkiaPathPt.x === 0 && lastSkiaPathPt.y === 0) {
        skPath.moveTo(x, y);
      } else {
        skPath.lineTo(x, y);
      }

      finalX = x;
      finalY = y;
    }

    if (finalX !== 0 || finalY !== 0) {
      const lastResultPathPt = resultPath.value.getLastPt();
      if (lastResultPathPt.x === 0 && lastResultPathPt.y === 0) {
        resultPath.value.moveTo(finalX, finalY);
      } else {
        resultPath.value.lineTo(finalX, finalY);
      }
    }

    return skPath;
  });

  return (
    <>
      <Path
        opacity={opacity}
        path={drawPath}
        strokeWidth={2.5}
        color="rgba(0, 0, 0, 0.2)"
        style="stroke"
      />

      <Path
        opacity={opacity}
        path={circlesPath}
        strokeWidth={0.8}
        color="rgba(0, 0, 0, 0.2)"
        style="stroke"
      />
      <Path
        opacity={opacity}
        path={resultPath}
        strokeWidth={strokeWidth}
        color="black"
        style="stroke"
      />
    </>
  );
});

export { FourierVisualizer };
