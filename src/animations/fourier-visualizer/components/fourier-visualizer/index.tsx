import { forwardRef, useCallback, useImperativeHandle } from 'react';

import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Path, Skia } from 'react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';

import { extractEpicycles } from './utils/extract-epicycles';
import { computeFFT } from './utils/fft';
import { fillToPowerOfTwo, getPoints } from './utils/fill';

import type { SkPath, SkPathBuilder } from 'react-native-skia';

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

  // Epicycles packed as [frequency, amplitude, phase, ...]: the chain is
  // evaluated every frame, so it reads a flat array instead of N objects
  const baseEpicycles = useSharedValue<Float64Array>(new Float64Array(0));

  const resultPath = useSharedValue(Skia.PathBuilder.Make().build());
  const chainPath = useSharedValue(Skia.PathBuilder.Make().build());
  const circlesPath = useSharedValue(Skia.PathBuilder.Make().build());

  // UI-only scratch: the builder that accumulates the result trace (so each
  // frame appends one point instead of copying the whole trace) and the
  // reused point objects for the chain polyline
  const scratch = useSharedValue<{
    resultBuilder: SkPathBuilder | null;
    builtResult: SkPath | null;
    points: { x: number; y: number }[];
  } | null>(null);

  const opacity = useSharedValue(1);

  const draw = useCallback(
    ({ path, onComplete }: { path: SkPath; onComplete?: () => void }) => {
      'worklet';
      opacity.set(withTiming(1));

      const points = getPoints(path);

      const filledPoints = fillToPowerOfTwo(points);

      const data = computeFFT(filledPoints);

      const extractedEpicycles = extractEpicycles(data).sort(
        (a, b) => b.amplitude - a.amplitude,
      );

      const packed = new Float64Array(extractedEpicycles.length * 3);
      for (let index = 0; index < extractedEpicycles.length; index++) {
        const { frequency, amplitude, phase } = extractedEpicycles[index];
        packed[index * 3] = frequency;
        packed[index * 3 + 1] = amplitude;
        packed[index * 3 + 2] = phase;
      }
      baseEpicycles.set(packed);

      resultPath.set(Skia.PathBuilder.Make().build());
      time.set(0);

      time.set(
        withTiming(
          2 * Math.PI - 0.05,
          {
            duration: 20000,
            easing: Easing.linear,
          },
          finished => {
            if (finished) {
              opacity.set(withTiming(0));
              if (onComplete) {
                scheduleOnRN(onComplete);
              }
            }
          },
        ),
      );
    },
    [baseEpicycles, time, opacity, resultPath],
  );

  const clear = useCallback(() => {
    'worklet';
    opacity.set(0);
    baseEpicycles.set(new Float64Array(0));
    resultPath.set(Skia.PathBuilder.Make().build());
    cancelAnimation(time);
    time.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, baseEpicycles, time]);

  useImperativeHandle(
    ref,
    () => ({
      draw,
      clear,
    }),
    [draw, clear],
  );

  // A reaction (not a derived value) so that writing the paths doesn't
  // re-trigger itself: it only runs when time or the epicycles change
  useAnimatedReaction(
    () => [time.get(), baseEpicycles.get()] as const,
    ([newTime, epicycles]) => {
      const count = epicycles.length / 3;
      if (count === 0) {
        chainPath.set(Skia.PathBuilder.Make().build());
        circlesPath.set(Skia.PathBuilder.Make().build());
        return;
      }

      let state = scratch.get();
      if (state === null) {
        state = { resultBuilder: null, builtResult: null, points: [] };
        scratch.set(state);
      }
      const points = state.points;
      while (points.length < count) {
        points.push({ x: 0, y: 0 });
      }
      points.length = count;

      const circlesBuilder = Skia.PathBuilder.Make();

      let cumulativeX = 0;
      let cumulativeY = 0;

      for (let index = 0; index < count; index++) {
        const frequency = epicycles[index * 3];
        const amplitude = epicycles[index * 3 + 1];
        const phase = epicycles[index * 3 + 2];

        if (index > 0) {
          circlesBuilder.addCircle(cumulativeX, cumulativeY, amplitude);
        }

        const x =
          cumulativeX + amplitude * Math.cos(frequency * newTime + phase);
        const y =
          cumulativeY + amplitude * Math.sin(frequency * newTime + phase);

        points[index].x = x;
        points[index].y = y;

        cumulativeX = x;
        cumulativeY = y;
      }

      // Same as moveTo(first) + lineTo(rest), in a single JSI call
      chainPath.set(Skia.PathBuilder.Make().addPoly(points, false).build());
      circlesPath.set(circlesBuilder.build());

      const finalX = cumulativeX;
      const finalY = cumulativeY;
      if (finalX !== 0 || finalY !== 0) {
        // draw/clear replace resultPath with a new empty path: restart from it
        if (
          state.resultBuilder === null ||
          state.builtResult !== resultPath.get()
        ) {
          state.resultBuilder = Skia.PathBuilder.MakeFromPath(resultPath.get());
        }
        const resultBuilder = state.resultBuilder;
        if (resultBuilder.isEmpty()) {
          resultBuilder.moveTo(finalX, finalY);
        } else {
          resultBuilder.lineTo(finalX, finalY);
        }
        // build() doesn't reset the builder, so it keeps accumulating
        const built = resultBuilder.build();
        state.builtResult = built;
        resultPath.set(built);
      }
    },
  );

  return (
    <>
      <Path
        opacity={opacity}
        path={chainPath}
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
