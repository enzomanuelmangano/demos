import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSharedValue, withTiming } from 'react-native-reanimated';

type UseTimerParams = {
  incrementOffset: number;
  progress: SharedValue<number>;
  onCompletion?: () => void;
};

export const useTimer = ({
  progress,
  incrementOffset,
  onCompletion,
}: UseTimerParams) => {
  // Shared value to enable or disable the timer
  const isTimerEnabled = useSharedValue(false);

  // References to manage timer and counter
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const counter = useRef(0);

  const clearCounter = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    counter.current = 0;
  }, []);

  const runTimer = useCallback(
    async (toValue: number) => {
      // Validate input value
      if (Math.floor(toValue) === 0) {
        return Alert.alert('Please enter a valid number');
      }

      // Clear existing timer if it exists
      if (timerRef.current) {
        clearCounter();
      }

      // Enable the timer and reset progress
      isTimerEnabled.value = true;
      progress.value = withTiming(0, { duration: 500 });

      // Wait for a short delay before starting the timer
      await new Promise(resolve => setTimeout(resolve, 300));

      // Set interval to update the counter and progress
      // IMPORTANT:
      // I heavily recommend using the react-native-background-timer package for these use cases.
      // I didn't use it because I wanted to run the code on Expo Go.
      // The react-native-background-timer package can be used with Expo Development Builds
      // package link: https://github.com/ocetnik/react-native-background-timer
      timerRef.current = setInterval(() => {
        counter.current += 1;
        progress.value -= incrementOffset;

        // Check if timer has reached the target value
        if (counter.current >= toValue) {
          clearInterval(timerRef.current as NodeJS.Timeout);
          if (onCompletion) {
            onCompletion();
          }
        }
      }, 1000);
    },
    [clearCounter, incrementOffset, isTimerEnabled, onCompletion, progress],
  );

  const stopTimer = useCallback(() => {
    isTimerEnabled.value = false;
    if (!timerRef.current) {
      return;
    }
    clearCounter();
  }, [clearCounter, isTimerEnabled]);

  const resetTimer = useCallback(() => {
    isTimerEnabled.value = false;
    progress.value = withTiming(0, { duration: 500 });
    clearCounter();
  }, [clearCounter, isTimerEnabled, progress]);

  // Cleanup function to clear interval on component unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    runTimer,
    resetTimer,
    stopTimer,
    isTimerEnabled,
  };
};
