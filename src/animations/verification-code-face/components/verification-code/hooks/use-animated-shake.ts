import { useCallback } from 'react';

import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const useAnimatedShake = () => {
  const shakeTranslateX = useSharedValue(0);

  const shake = useCallback(() => {
    cancelAnimation(shakeTranslateX);

    shakeTranslateX.set(0);

    shakeTranslateX.set(
      withRepeat(
        withTiming(10, {
          duration: 120,
          easing: Easing.bezier(0.35, 0.7, 0.5, 0.7),
        }),
        6,
        true,
      ),
    );
  }, [shakeTranslateX]);

  const rShakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeTranslateX.get() }],
    };
  }, []);

  return { shake, rShakeStyle };
};

export { useAnimatedShake };
