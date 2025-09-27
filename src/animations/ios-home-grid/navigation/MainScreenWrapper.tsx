import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import Animated, { useDerivedValue } from 'react-native-reanimated';

import { useCustomNavigation } from './expansion-provider';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const MainScreenWrapper = ({ children }: { children: React.ReactNode }) => {
  const { springProgress } = useCustomNavigation();

  const intensity = useDerivedValue<number | undefined>(() => {
    return springProgress.value * 50;
  });

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        style={styles.blurView}
        intensity={intensity}
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
  container: {
    flex: 1,
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 1,
  },
});
