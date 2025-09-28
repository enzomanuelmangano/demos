import { Skia } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';

import { SpringConfig } from './constants';

type UseCloseButtonAnimationsParams = {
  isToggled: SharedValue<boolean>;
  width: number;
  additionalWidth: number;
};

export const useCloseButtonAnimations = ({
  isToggled,
  width,
  additionalWidth,
}: UseCloseButtonAnimationsParams) => {
  const isCloseButtonPressed = useSharedValue(false);

  const closeIconCircleX = useDerivedValue(() => {
    return withSpring(
      isToggled.value
        ? width + additionalWidth / 2
        : width / 2 + additionalWidth / 2,
      SpringConfig,
    );
  }, []);

  const closeButtonOpacity = useDerivedValue(() => {
    return withTiming(isToggled.value ? 1 : 0);
  }, []);

  const gestureHandlerClose = useGestureHandler({
    onStart: () => {
      'worklet';
      isCloseButtonPressed.value = true;
    },
    onTap: () => {
      'worklet';
      isCloseButtonPressed.value = false;
      isToggled.value = false;
    },
  });

  const closeButtonScale = useDerivedValue(() => {
    return withTiming(isCloseButtonPressed.value ? 0.95 : 1);
  }, []);

  const closeButtonTransform = useDerivedValue(() => {
    return [{ scale: closeButtonScale.value }];
  }, []);

  const paint = useSharedValue(Skia.Paint());
  useAnimatedReaction(
    () => closeButtonOpacity.value,
    opacity => {
      paint.value.setAlphaf(opacity);
    },
  );

  return {
    closeIconCircleX,
    closeButtonOpacity,
    gestureHandlerClose,
    closeButtonTransform,
    paint,
  };
};
