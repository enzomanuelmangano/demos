import { StyleSheet, View } from 'react-native';

import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;
const DOT_SPACING = 8;

type PaginatorDotProps = {
  index: number;
  /** Scroll position in pages; whole numbers sit on a painting. */
  pageShift: SharedValue<number>;
};

const PaginatorDot: React.FC<PaginatorDotProps> = ({ index, pageShift }) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const progress = pageShift.get() - (index - 1);
    const clampedProgress = Math.max(0, Math.min(2, progress));

    // Manual interpolation
    let width: number;
    let opacity: number;

    if (clampedProgress <= 1) {
      width = DOT_SIZE + (DOT_ACTIVE_WIDTH - DOT_SIZE) * clampedProgress;
      opacity = 0.3 + 0.7 * clampedProgress;
    } else {
      width =
        DOT_ACTIVE_WIDTH -
        (DOT_ACTIVE_WIDTH - DOT_SIZE) * (clampedProgress - 1);
      opacity = 1 - 0.7 * (clampedProgress - 1);
    }

    return {
      width,
      opacity,
    };
  }, []);

  return (
    <Animated.View
      style={[
        {
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: 'white',
          borderCurve: 'continuous',
        },
        animatedStyle,
      ]}
    />
  );
};

type PaginatorProps = {
  count: number;
  pageShift: SharedValue<number>;
};

export const Paginator: React.FC<PaginatorProps> = ({ count, pageShift }) => {
  return (
    <View pointerEvents="none" style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <PaginatorDot key={index} index={index} pageShift={pageShift} />
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
});
