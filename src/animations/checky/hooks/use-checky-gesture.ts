import { useCallback, useEffect, useRef } from 'react';

import * as Haptics from 'expo-haptics';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type UseCheckyGestureParams = {
  centerX: number;
  centerY: number;
};

export function useCheckyGesture({ centerX, centerY }: UseCheckyGestureParams) {
  const yawnProgress = useSharedValue(0);
  const yawnSeed = useSharedValue(0.5);
  const rawAngle = useSharedValue(0);
  const eyeScale = useSharedValue(1);

  const fingerAngle = useDerivedValue(() =>
    withSpring(rawAngle.value, { mass: 2.5, damping: 28, stiffness: 35 }),
  );

  // Haptics refs
  const hapticRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHaptics = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    hapticRef.current = setInterval(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      80,
    );
  }, []);

  const stopHaptics = useCallback(() => {
    if (hapticRef.current) {
      clearInterval(hapticRef.current);
      hapticRef.current = null;
    }
  }, []);

  const triggerBlink = useCallback(() => {
    eyeScale.value = withSequence(
      withSpring(0.7, { mass: 1, damping: 18, stiffness: 400 }),
      withSpring(1, { mass: 1, damping: 14, stiffness: 300 }),
    );
  }, [eyeScale]);

  // Blink loop
  useEffect(() => {
    const loop = () => {
      blinkRef.current = setTimeout(
        () => {
          triggerBlink();
          loop();
        },
        2000 + Math.random() * 3000,
      );
    };
    loop();
    return () => {
      if (blinkRef.current) {
        clearTimeout(blinkRef.current);
      }
      stopHaptics();
    };
  }, [triggerBlink, stopHaptics]);

  const gesture = Gesture.Pan()
    .onBegin(e => {
      'worklet';
      cancelAnimation(yawnProgress);
      yawnSeed.value = Math.random();
      yawnProgress.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      const dx = e.x - centerX;
      const dy = e.y - centerY;
      rawAngle.value = withSpring(Math.atan2(dx, -dy), {
        mass: 1,
        damping: 15,
        stiffness: 150,
      });
      scheduleOnRN(startHaptics);
    })
    .onUpdate(e => {
      'worklet';
      rawAngle.value = Math.atan2(e.x - centerX, -(e.y - centerY));
    })
    .onFinalize(() => {
      'worklet';
      cancelAnimation(yawnProgress);
      cancelAnimation(rawAngle);
      yawnProgress.value = withSpring(0, {
        mass: 1,
        damping: 15,
        stiffness: 150,
      });
      rawAngle.value = 0;
      scheduleOnRN(stopHaptics);
    });

  return {
    gesture,
    yawnProgress,
    yawnSeed,
    eyeScale,
    fingerAngle,
  };
}
