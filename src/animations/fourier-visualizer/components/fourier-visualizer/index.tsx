import type { SkPath } from '@shopify/react-native-skia';
import { Path, Skia } from '@shopify/react-native-skia';
import React, { useCallback, useImperativeHandle } from 'react';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  fillToPowerOfTwo,
  generateLinearInterpolatedPoints,
  getPoints,
} from './utils/fill';
import { extractEpicycles } from './utils/extract-epicycles';
import { computeFFT } from './utils/fft';

// Define the ref type for external interaction with the FourierVisualizer component
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

const FourierVisualizer = React.forwardRef<
  FourierVisualizerRefType,
  {
    strokeWidth?: number;
  }
>(({ strokeWidth = 2.5 }, ref) => {
  // Shared value to store epicycles computed from the path
  const epicycles = useSharedValue<ReturnType<typeof extractEpicycles>>([]);

  // Time value for animation progression
  const time = useSharedValue(0);

  // Paths for visualizing the Fourier series
  const resultPath = useSharedValue(Skia.Path.Make());
  const circlesPath = useSharedValue(Skia.Path.Make());

  // Shared value for the opacity of drawn paths
  const opacity = useSharedValue(1);

  // Function to initiate the Fourier visualization based on a provided path
  const draw = useCallback(
    ({ path, onComplete }: { path: SkPath; onComplete?: () => void }) => {
      // Start by setting full opacity
      opacity.value = withTiming(1);

      // Convert path into linearly interpolated points
      const points = generateLinearInterpolatedPoints(getPoints(path), 10);

      // Ensure the number of points is a power of two for FFT
      const filledPoints = fillToPowerOfTwo(points);

      // Compute the Fast Fourier Transform on the points
      const data = computeFFT(filledPoints);

      // Extract the epicycles from the FFT data
      epicycles.value = extractEpicycles(data).sort(
        (a, b) => b.amplitude - a.amplitude,
      );

      // Animate over time to visualize the epicycles
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
              runOnJS(onComplete)();
            }
          }
        },
      );
    },
    [epicycles, time, opacity],
  );

  // Clear all visualizations
  const clear = useCallback(() => {
    'worklet';
    opacity.value = 0;
    epicycles.value = [];
    resultPath.value.reset();
    cancelAnimation(time);
    time.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, epicycles, time]);

  // Expose functions to parent component via ref
  useImperativeHandle(
    ref,
    () => ({
      draw,
      clear,
    }),
    [draw, clear],
  );

  // Derive the visualization path based on the time evolution of epicycles
  const drawPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    circlesPath.value.reset();

    let x = 0;
    let y = 0;

    // Compute the visualization based on each epicycle
    for (const epicycle of epicycles.value) {
      const { frequency, amplitude, phase } = epicycle;

      // Visualize the circles around the path
      if (x !== 0 && y !== 0) {
        circlesPath.value.addCircle(x, y, amplitude);
      }

      // Calculate the position on the circle for the current epicycle
      x += amplitude * Math.cos(frequency * time.value + phase);
      y += amplitude * Math.sin(frequency * time.value + phase);

      // Connect the path to the new position
      const lastSkiaPathPt = skPath.getLastPt();
      if (lastSkiaPathPt.x === 0 && lastSkiaPathPt.y === 0) {
        skPath.moveTo(x, y);
      } else {
        skPath.lineTo(x, y);
      }
    }

    // Update the resultPath to visualize the overall path over time
    const lastResultPathPt = resultPath.value.getLastPt();
    if (lastResultPathPt.x === 0 && lastResultPathPt.y === 0) {
      resultPath.value.moveTo(x, y);
    } else {
      resultPath.value.lineTo(x, y);
    }

    return skPath;
  }, [time]);

  return (
    // Render the visualization paths
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
