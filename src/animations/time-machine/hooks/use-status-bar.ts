import { useCallback } from 'react';
import { StatusBar } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

export const useStatusBar = (timeMachineProgress: SharedValue<number>) => {
  const updateStatusBar = useCallback(
    (type: 'light-content' | 'dark-content') => {
      StatusBar.setBarStyle(type, true);
    },
    [],
  );

  useAnimatedReaction(
    () => timeMachineProgress.value,
    newProgress => {
      if (newProgress === 0) {
        runOnJS(updateStatusBar)('dark-content');
      } else {
        runOnJS(updateStatusBar)('light-content');
      }
    },
  );
};
