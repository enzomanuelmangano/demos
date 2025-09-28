import { useCallback } from 'react';

import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const useActiveQRCode = () => {
  const showQRCode = useSharedValue(false);

  const rStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(showQRCode.value ? 1.4 : 1) },
      {
        rotate: withSpring(showQRCode.value ? '0deg' : '-10deg'),
      },
    ],
  }));

  const rLogoContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showQRCode.value ? 0 : 1),
  }));

  const toggleQRCodeVisibility = useCallback(() => {
    showQRCode.value = !showQRCode.value;
  }, [showQRCode]);

  return { rStyle, rLogoContainerStyle, toggleQRCodeVisibility };
};
