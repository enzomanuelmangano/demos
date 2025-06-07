import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  Easing,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Blur,
  Canvas,
  Rect,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { withPause } from 'react-native-redash';
import { useAtomValue } from 'jotai';

import { shader } from '../shader';
import { IsTimeMachineActiveAtom } from '../atoms/time-machine-active';

type BackgroundCanvasProps = {
  timeMachineProgress: SharedValue<number>;
  width: number;
  height: number;
};

export const BackgroundCanvas = ({
  timeMachineProgress,
  width,
  height,
}: BackgroundCanvasProps) => {
  const progress = useSharedValue(0);
  const isTimeMachineActive = useAtomValue(IsTimeMachineActiveAtom);

  const isTimeMachinePaused = useDerivedValue(() => {
    return !isTimeMachineActive;
  }, [isTimeMachineActive]);

  useEffect(() => {
    progress.value = withPause(
      withRepeat(
        withTiming(10, {
          easing: Easing.linear,
          duration: 100000,
        }),
        -1,
        true,
      ),
      isTimeMachinePaused,
    );
  }, [progress, timeMachineProgress, isTimeMachinePaused]);

  const uniforms = useDerivedValue(() => {
    return {
      iResolution: vec(width, height),
      iTime: progress.value,
    };
  }, [width, height, progress]);

  const blur = useDerivedValue(() => {
    return interpolate(timeMachineProgress.value, [1, 0], [0, 15]);
  }, [timeMachineProgress]);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height}>
        <Shader source={shader} uniforms={uniforms} />
        <Blur blur={blur} />
      </Rect>
    </Canvas>
  );
};
