import { StyleSheet, View } from 'react-native';

import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { PAPER_INK } from './constants';

const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;
const DOT_SPACING = 8;

type PaginatorDotProps = {
  index: number;
  scrollX: SharedValue<number>;
  windowWidth: number;
};

const PaginatorDot: React.FC<PaginatorDotProps> = ({
  index,
  scrollX,
  windowWidth,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const progress = (scrollX.get() - (index - 1) * windowWidth) / windowWidth;
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
  }, [windowWidth]);

  return (
    <Animated.View
      style={[
        {
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: PAPER_INK,
          borderCurve: 'continuous',
        },
        animatedStyle,
      ]}
    />
  );
};

type PaginatorProps = {
  count: number;
  scrollX: SharedValue<number>;
  windowWidth: number;
  /**
   * The page's own margin, so this sits on the same inset as everything else
   * and keeps its centreline with the button opposite it. Hardcoded numbers
   * here drifted the moment the margin changed.
   */
  margin: number;
  /** Height of the control across from it, to share a centreline. */
  alignTo: number;
};

export const Paginator: React.FC<PaginatorProps> = ({
  count,
  scrollX,
  windowWidth,
  margin,
  alignTo,
}) => {
  return (
    <View
      style={[
        styles.container,
        { bottom: margin + alignTo / 2 - DOT_SIZE / 2, left: margin },
      ]}>
      {Array.from({ length: count }).map((_, index) => (
        <PaginatorDot
          key={index}
          index={index}
          scrollX={scrollX}
          windowWidth={windowWidth}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: DOT_SPACING,
    position: 'absolute',
  },
});
