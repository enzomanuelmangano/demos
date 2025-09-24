import { memo, useMemo, type FC, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type PaginatorProps = {
  pagesAmount: number;
  currentPageIndex: SharedValue<number>;
  visibleDots: number;
  dotSize?: number;
  spacing?: number;
  background?: ReactNode;
};

const SpringConfig = {
  damping: 15,
  stiffness: 100,
  mass: 0.5,
} as const;

export const Paginator: FC<PaginatorProps> = memo(
  ({
    pagesAmount,
    currentPageIndex,
    visibleDots,
    dotSize = 7,
    spacing = 8,
  }) => {
    // Create memoized array of dots to prevent unnecessary recreations
    const dots = useMemo(() => new Array(pagesAmount).fill(0), [pagesAmount]);

    const visibleDotsIndices = useDerivedValue(() => {
      const currentIndex = Math.round(currentPageIndex.value);
      const halfVisible = Math.floor(visibleDots / 2);
      let start = Math.max(currentIndex - halfVisible, 0);
      const end = Math.min(start + visibleDots, pagesAmount);

      if (end === pagesAmount) {
        start = Math.max(pagesAmount - visibleDots, 0);
      }

      return { start, end, currentIndex };
    });

    const containerAnimatedStyle = useAnimatedStyle(() => {
      const { currentIndex } = visibleDotsIndices.value;
      const dotFullWidth = dotSize * 2.5; // Maximum width of an active dot
      const regularDotWidth = dotSize;
      const totalSpacing = spacing * (pagesAmount - 1);

      // Calculate the total width of all dots
      const totalWidth = (pagesAmount - 1) * regularDotWidth + dotFullWidth;

      // Calculate the center position
      const centerOffset = (totalWidth + totalSpacing) / 2;

      // Calculate the current position based on the current index
      const currentPosition =
        currentIndex * (regularDotWidth + spacing) + dotFullWidth / 2;

      // Calculate the translation needed to center the current dot
      const translateX = centerOffset - currentPosition;

      return {
        transform: [{ translateX: withSpring(translateX, SpringConfig) }],
      };
    });

    return (
      <View style={styles.paginatorContainer}>
        <Animated.View style={[styles.dotsContainer, containerAnimatedStyle]}>
          {dots.map((_, index) => (
            <AnimatedDot
              key={index}
              index={index}
              visibleDotsIndices={visibleDotsIndices}
              currentPageIndex={currentPageIndex}
              spacing={spacing}
              dotSize={dotSize}
            />
          ))}
        </Animated.View>
      </View>
    );
  },
);

type AnimatedDotProps = {
  index: number;
  visibleDotsIndices: SharedValue<{
    start: number;
    end: number;
    currentIndex: number;
  }>;
  spacing: number;
  currentPageIndex: SharedValue<number>;
  dotSize: number;
};

const AnimatedDot = memo(
  ({
    index,
    visibleDotsIndices,
    spacing,
    currentPageIndex,
    dotSize,
  }: AnimatedDotProps) => {
    const isVisible = useDerivedValue(() => {
      return (
        index >= visibleDotsIndices.value.start &&
        index < visibleDotsIndices.value.end
      );
    });

    const visibility = useDerivedValue(() => {
      const isActive = currentPageIndex.value === index;

      // eslint-disable-next-line no-nested-ternary
      const opacity = isActive ? 1 : isVisible.value ? 0.75 : 0;

      return withTiming(opacity, {
        duration: 500,
        easing: Easing.linear,
      });
    }, [currentPageIndex, index]);

    const rContainerStyle = useAnimatedStyle(() => {
      const scale = withSpring(
        currentPageIndex.value !== index ? 0.75 : 1,
        SpringConfig,
      );
      return {
        opacity: visibility.value,
        marginRight: spacing,
        transform: [{ scale }],
      };
    });

    const rDotStyle = useAnimatedStyle(() => {
      return {
        width: dotSize,
        height: dotSize,
      };
    });

    return (
      <Animated.View style={rContainerStyle}>
        <Animated.View style={[styles.dot, rDotStyle]} />
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  backgroundContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 208,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  paginatorContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
});
