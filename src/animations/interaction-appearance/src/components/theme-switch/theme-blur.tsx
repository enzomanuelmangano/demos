import { StyleSheet } from 'react-native';
import { useDerivedValue, withTiming } from 'react-native-reanimated';

import { AnimatedBlurView } from '../animated-blur-view';
import { isSwitchingThemeShared } from '../../theme';

export const ThemeBlurView = () => {
  // Create an animated value for the blurIntensity using useDerivedValue
  const intensity = useDerivedValue(() => {
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
