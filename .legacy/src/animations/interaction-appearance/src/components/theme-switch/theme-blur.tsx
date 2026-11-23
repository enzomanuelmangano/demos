import { StyleSheet } from 'react-native';

import {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { isSwitchingThemeShared } from '../../theme';
import { AnimatedBlurView } from '../animated-blur-view';

export const ThemeBlurView = () => {
  // Animated intensity must go through useAnimatedProps: a shared value passed
  // directly as the prop only forwards its value on the FIRST render
  // (reanimated's PropsFilter) — re-renders drop the prop and the React commit
  // clobbers UI-thread updates with the component default.
  const intensity = useDerivedValue(() => {
    return withTiming(isSwitchingThemeShared.get() ? 15 : 0, {
      duration: 350,
    });
  }, []);

  const animatedProps = useAnimatedProps(
    () => ({
      intensity: intensity.get(),
    }),
    [],
  );

  // At intensity 0 the blur is a no-op; opacity 0 lets Core Animation skip
  // the full-screen effect layer over the scrolling content while idle.
  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: intensity.get() !== 0 ? 1 : 0,
    };
  }, []);

  return (
    <AnimatedBlurView
      pointerEvents={'none'}
      animatedProps={animatedProps}
      style={[
        {
          ...StyleSheet.absoluteFill,
          zIndex: 5,
        },
        rStyle,
      ]}
    />
  );
};
