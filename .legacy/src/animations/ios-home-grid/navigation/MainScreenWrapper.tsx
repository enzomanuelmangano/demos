import { StyleSheet, View } from 'react-native';

import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useCustomNavigation } from './expansion-provider';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const MainScreenWrapper = ({ children }: { children: React.ReactNode }) => {
  const { springProgress } = useCustomNavigation();

  // Animated intensity must go through useAnimatedProps on reanimated 4.3 —
  // passing a shared/derived value directly as the prop stopped applying
  // updates (the blur froze at BlurView's default 50, veiling the screen).
  const animatedProps = useAnimatedProps(() => ({
    intensity: springProgress.get() * 50,
  }));

  // At rest the intensity is 0 (a no-op blur); opacity 0 lets Core Animation
  // skip the full-screen effect layer over the 97-icon grid.
  const rBlurStyle = useAnimatedStyle(() => ({
    opacity: springProgress.get() !== 0 ? 1 : 0,
  }));

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        pointerEvents="none"
        style={[styles.blurView, rBlurStyle]}
        animatedProps={animatedProps}
        tint="light"
      />
      {children}
    </View>
  );
};

export const withMainScreenWrapper = <T extends object>(
  Component: React.ComponentType<T>,
) => {
  return (props: T) => {
    return (
      <MainScreenWrapper>
        <Component {...props} />
      </MainScreenWrapper>
    );
  };
};

const styles = StyleSheet.create({
  blurView: {
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  container: {
    flex: 1,
  },
});
