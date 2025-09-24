import type { SkPath } from '@shopify/react-native-skia';
import { Path, Skia } from '@shopify/react-native-skia';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
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

const FourierVisualizer = forwardRef<
  FourierVisualizerRefType,
  {
    strokeWidth?: number;
  }
>(({ strokeWidth = 2.5 }, ref) => {
  // Time value for animation progression
  const time = useSharedValue(0);

  // Shared value to store the base epicycles data
  const baseEpicycles = useSharedValue<ReturnType<typeof extractEpicycles>>([]);

  // Paths for visualizing the Fourier series
  const resultPath = useSharedValue(Skia.Path.Make());
  const circlesPath = useSharedValue(Skia.Path.Make());

  // Shared value for the opacity of drawn paths
  const opacity = useSharedValue(1);

  // Function to initiate the Fourier visualization based on a provided path
  const draw = useCallback(
    ({ path, onComplete }: { path: SkPath; onComplete?: () => void }) => {
      'worklet';
      // Start by setting full opacity
      opacity.value = withTiming(1);

      // Convert path into linearly interpolated points
      const points = getPoints(path);

      // Ensure the number of points is a power of two for FFT
      const filledPoints = fillToPowerOfTwo(points);

      // Compute the Fast Fourier Transform on the points
      const data = computeFFT(filledPoints);

      // Extract the epicycles from the FFT data
      const extractedEpicycles = extractEpicycles(data).sort(
        (a, b) => b.amplitude - a.amplitude,
      );

      // Store the base epicycles data
      baseEpicycles.value = extractedEpicycles;

      // Reset paths
      resultPath.value.reset();
      time.value = 0;

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
              scheduleOnRN(onComplete);
            }
          }
        },
      );
    },
    [baseEpicycles, time, opacity, resultPath],
  );

  // Shared values to store computed epicycle positions
  const epicyclePositions = useSharedValue<{ x: number; y: number }[]>([]);

  // Animated reaction to compute epicycle positions based on time changes
  useAnimatedReaction(
    () => [time.value, baseEpicycles.value] as const,
    ([newTime, epicycles]) => {
      if (epicycles.length === 0) return;

      const positions: { x: number; y: number }[] = [];
      let cumulativeX = 0;
      let cumulativeY = 0;

      for (let index = 0; index < epicycles.length; index++) {
        const { frequency, amplitude, phase } = epicycles[index];

        // Calculate the position on the circle for the current epicycle
        const x =
          cumulativeX + amplitude * Math.cos(frequency * newTime + phase);
        const y =
          cumulativeY + amplitude * Math.sin(frequency * newTime + phase);

        positions.push({ x, y });

        // Update cumulative position for next epicycle
        cumulativeX = x;
        cumulativeY = y;
      }

      epicyclePositions.value = positions;
    },
  );

  // Clear all visualizations
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

  // Expose functions to parent component via ref
  useImperativeHandle(
    ref,
    () => ({
      draw,
      clear,
    }),
    [draw, clear],
  );

  // Derive the visualization path based on the computed positions
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

    // Compute the visualization based on each epicycle position
    for (let index = 0; index < positions.length; index++) {
      const { x, y } = positions[index];
      const { amplitude } = epicycles[index];

      // Visualize the circles around the path
      if (index > 0) {
        const { x: prevX, y: prevY } = positions[index - 1];
        circlesPath.value.addCircle(prevX, prevY, amplitude);
      }

      // Connect the path to the new position
      const lastSkiaPathPt = skPath.getLastPt();
      if (lastSkiaPathPt.x === 0 && lastSkiaPathPt.y === 0) {
        skPath.moveTo(x, y);
      } else {
        skPath.lineTo(x, y);
      }

      finalX = x;
      finalY = y;
    }

    // Update the resultPath to visualize the overall path over time
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
