import { StyleSheet, View } from 'react-native';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const DOT_SIZE = 8;
const DOT_ACTIVE_WIDTH = 20;
const DOT_SPACING = 8;

type PaginatorDotProps = {
  index: number;
  progress: SharedValue<number>;
};

const PaginatorDot: React.FC<PaginatorDotProps> = ({ index, progress }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index);
    return {
      width: interpolate(
        d,
        [0, 0.5, 1],
        [DOT_ACTIVE_WIDTH, DOT_SIZE, DOT_SIZE],
        Extrapolation.CLAMP,
      ),
      opacity: interpolate(d, [0, 0.5, 1], [1, 0.4, 0.3], Extrapolation.CLAMP),
      backgroundColor: d < 0.5 ? '#FFFFFF' : '#FFFFFF80',
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

type PaginatorProps = {
  count: number;
  progress: SharedValue<number>;
};

export const Paginator: React.FC<PaginatorProps> = ({ count, progress }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <PaginatorDot key={index} index={index} progress={progress} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    bottom: 60,
    flexDirection: 'row',
    gap: DOT_SPACING,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dot: {
    borderCurve: 'continuous',
    borderRadius: DOT_SIZE / 2,
    height: DOT_SIZE,
  },
});
