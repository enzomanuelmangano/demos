import { StyleSheet } from 'react-native';

import { useAnimatedProps, withTiming } from 'react-native-reanimated';

import { isSwitchingThemeShared } from '../../theme';
import { AnimatedBlurView } from '../animated-blur-view';

export const ThemeBlurView = () => {
  // Animated intensity must go through useAnimatedProps: a shared value passed
  // directly as the prop only forwards its value on the FIRST render
  // (reanimated's PropsFilter) — re-renders drop the prop and the React commit
  // clobbers UI-thread updates with the component default.
  const animatedProps = useAnimatedProps(
    () => ({
      intensity: withTiming(isSwitchingThemeShared.get() ? 15 : 0, {
        duration: 350,
      }),
    }),
    [],
  );

  return (
    <AnimatedBlurView
      pointerEvents={'none'}
      animatedProps={animatedProps}
      style={{
        ...StyleSheet.absoluteFill,
        zIndex: 5,
      }}
    />
  );
};
