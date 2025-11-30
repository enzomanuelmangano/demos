import { StyleSheet } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type DerivedValue,
} from 'react-native-reanimated';

import { PAGE_SIZE } from './constants';

type DepthShadowProps = {
  pageFlipProgress: DerivedValue<number>;
  variant: 'front' | 'back';
};

export const DepthShadow = ({
  pageFlipProgress,
  variant,
}: DepthShadowProps) => {
  const rShadowStyle = useAnimatedStyle(() => {
    const progress = pageFlipProgress.value;

    const shadowOpacity =
      variant === 'front'
        ? interpolate(progress, [0, 0.5], [0, 0.3], Extrapolation.CLAMP)
        : interpolate(progress, [0.5, 1], [0.3, 0], Extrapolation.CLAMP);

    return {
      opacity: shadowOpacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[rShadowStyle, styles.depthShadow]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'transparent']}
        style={styles.depthShadowGradient}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  depthShadow: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  depthShadowGradient: {
    height: PAGE_SIZE,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
