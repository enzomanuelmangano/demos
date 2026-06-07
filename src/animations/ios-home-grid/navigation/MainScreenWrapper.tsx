import { StyleSheet, View } from 'react-native';

import { BlurView } from 'expo-blur';
import Animated, { useAnimatedProps } from 'react-native-reanimated';

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

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        style={styles.blurView}
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
