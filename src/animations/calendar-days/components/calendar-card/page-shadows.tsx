import { StyleSheet } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type DerivedValue,
} from 'react-native-reanimated';

import { PAGE_SIZE, SIZE } from './constants';

type CastShadowProps = {
  pageFlipProgress: DerivedValue<number>;
};

export const CastShadow = ({ pageFlipProgress }: CastShadowProps) => {
  const rShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      pageFlipProgress.value,
      [0, 0.5, 1],
      [0, 0.35, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity: shadowOpacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[rShadowStyle, styles.castShadowContainer]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={styles.castShadowGradient}
      />
    </Animated.View>
  );
};

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
      style={[rShadowStyle, styles.depthShadow]}
    />
  );
};

const styles = StyleSheet.create({
  castShadowContainer: {
    height: PAGE_SIZE,
    position: 'absolute',
    top: PAGE_SIZE,
    width: SIZE,
    zIndex: 1,
  },
  castShadowGradient: {
    height: PAGE_SIZE,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  depthShadow: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
