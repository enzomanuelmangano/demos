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
      { scale: withSpring(showQRCode.get() ? 1.4 : 1) },
      {
        rotate: withSpring(showQRCode.get() ? '0deg' : '-10deg'),
      },
    ],
  }));

  const rLogoContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showQRCode.get() ? 0 : 1),
  }));

  const toggleQRCodeVisibility = useCallback(() => {
    showQRCode.set(!showQRCode.get());
  }, [showQRCode]);

  return { rStyle, rLogoContainerStyle, toggleQRCodeVisibility };
};
