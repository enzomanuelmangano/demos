import { StyleSheet } from 'react-native';

import { useDerivedValue, withTiming } from 'react-native-reanimated';

import { isSwitchingThemeShared } from '../../theme';
import { AnimatedBlurView } from '../animated-blur-view';

export const ThemeBlurView = () => {
  const intensity = useDerivedValue<number | undefined>(() => {
    return withTiming(isSwitchingThemeShared.value ? 15 : 0, {
      duration: 350,
    });
  }, []);

  return (
    <AnimatedBlurView
      pointerEvents={'none'}
      intensity={intensity}
      style={{
        ...StyleSheet.absoluteFillObject,
        zIndex: 5,
      }}
    />
  );
};
