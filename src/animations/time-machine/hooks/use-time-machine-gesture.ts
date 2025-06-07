import type { SharedValue } from 'react-native-reanimated';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { IsTimeMachineActiveAtom } from '../atoms/time-machine-active';

type UseTimeMachineGestureProps = {
  timeMachineProgress: SharedValue<number>;
  onClose: () => void;
};

export const useTimeMachineGesture = ({
  timeMachineProgress,
  onClose,
}: UseTimeMachineGestureProps) => {
  const prevPosition = useSharedValue(0);
  const setTimeMachineActive = useSetAtom(IsTimeMachineActiveAtom);

  const updateTimeMachineActiveWrapper = useCallback(
    (value: boolean) => {
      setTimeMachineActive(value);
    },
    [setTimeMachineActive],
  );

  useAnimatedReaction(
    () => timeMachineProgress.value,
    value => {
      if (value > 0.5) {
        runOnJS(updateTimeMachineActiveWrapper)(true);
      } else {
        runOnJS(updateTimeMachineActiveWrapper)(false);
      }
    },
    [updateTimeMachineActiveWrapper],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      // Store the current progress as the starting point
      prevPosition.value = timeMachineProgress.value;
    })
    .onUpdate(({ translationY }) => {
      // Calculate progress relative to the starting position
      const maxPanDistance = 300;
      const rawProgress = translationY / maxPanDistance;

      // Add the translation to the previous position
      const newProgress = prevPosition.value + rawProgress;

      timeMachineProgress.value = Math.max(0, Math.min(1, newProgress));
    })
    .onEnd(({ translationY, velocityY }) => {
      // Simple threshold-based snapping
      if (translationY > 100 || velocityY > 500) {
        // Snap to fully open
        timeMachineProgress.value = 1;
      } else if (translationY < -50 || velocityY < -300) {
        // Snap to closed
        timeMachineProgress.value = 0;
        runOnJS(onClose)();
      } else {
        // Snap to nearest state
        const currentProgress = timeMachineProgress.value;
        const targetProgress = currentProgress > 0.5 ? 1 : 0;
        if (targetProgress === 0) {
          runOnJS(onClose)();
        }
        timeMachineProgress.value = targetProgress;
      }
    });

  return panGesture;
};
