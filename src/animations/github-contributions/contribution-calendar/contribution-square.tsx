import { StyleSheet } from 'react-native';

import { forwardRef, useCallback, useImperativeHandle } from 'react';

import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { CalendarAnimationControls, ContributionLevel } from './types';
import { ColorScheme } from '../config/defaults';

export type ContributionSquareProps = {
  level: ContributionLevel;
  weekIndex: number;
  dayIndex: number;
  colorScheme: ColorScheme;
};

const getColorForLevel = (
  level: number,
  colorScheme: ContributionSquareProps['colorScheme'],
): string => {
  'worklet';
  switch (level) {
    case 0:
      return colorScheme.level0;
    case 1:
      return colorScheme.level1;
    case 2:
      return colorScheme.level2;
    case 3:
      return colorScheme.level3;
    case 4:
      return colorScheme.level4;
    default:
      return colorScheme.level0;
  }
};

const SpringConfig = {
  mass: 1.1,
  damping: 13, // set damping to 1, if you want to have fun 👀
  stiffness: 150,
  overshootClamping: false,
  restSpeedThreshold: 0.8,
};

export type SquareAnimationControls = Omit<
  CalendarAnimationControls,
  'toggleAnimation'
>;

export const ContributionSquare = forwardRef<
  SquareAnimationControls,
  ContributionSquareProps
>(({ level, weekIndex, dayIndex, colorScheme }, ref) => {
  const progress = useSharedValue(0);

  const startAnimation = useCallback(() => {
    // Bottom-left to top-right: start from Sunday (dayIndex=6) of first week (weekIndex=0)
    const delay = 45 * (weekIndex + (6 - dayIndex));
    cancelAnimation(progress);

    progress.value = withDelay(delay, withSpring(1, SpringConfig));
  }, [weekIndex, dayIndex, progress]);

  const resetAnimation = useCallback(() => {
    cancelAnimation(progress);

    progress.value = withDelay(
      Math.random() * 500,
      withSpring(0, {
        mass: 0.9,
        damping: 10,
        stiffness: 60,
      }),
    );
  }, [progress]);

  useImperativeHandle(
    ref,
    () => ({
      startAnimation: startAnimation,
      resetAnimation: resetAnimation,
    }),
    [startAnimation, resetAnimation],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const startColor = colorScheme.level0;
    const endColor = getColorForLevel(level, colorScheme);

    const animatedColor = interpolateColor(
      progress.value,
      [0, 1],
      [startColor, endColor],
      'RGB',
    );

    return {
      transform: [
        { scale: interpolate(progress.value, [0, 0.5, 1], [1, 0.4, 1]) },
      ],
      backgroundColor: animatedColor,
    };
  });

  return <Animated.View style={[styles.square, animatedStyle]} />;
});

const styles = StyleSheet.create({
  square: {
    borderRadius: 2,
    height: 14,
    marginBottom: 3,
    width: 14,
  },
});
