import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { useRouter } from 'expo-router';
import debounce from 'lodash.debounce';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  makeMutable,
  measure,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SharedValue, useAnimatedRef } from 'react-native-reanimated';

type AnimatedRef = ReturnType<typeof useAnimatedRef>;

const ExpansionContext = createContext<{
  startTransition: (
    animatedRef: AnimatedRef,
    {
      id,
      onComplete,
      borderRadius,
      color,
    }: {
      id: string;
      onComplete?: () => void;
      borderRadius?: number;
      color?: string;
    },
  ) => void;
  resetTransition: () => void;
  backTransition: () => void;
  timingProgress: SharedValue<number>;
  springProgress: SharedValue<number>;
  transitionScale: SharedValue<number>;
  transitionId: SharedValue<string | null>;
}>({
  startTransition: () => {},
  resetTransition: () => {},
  backTransition: () => {},
  timingProgress: makeMutable(0),
  springProgress: makeMutable(0),
  transitionScale: makeMutable(1),
  transitionId: makeMutable<string | null>(null),
});

const SpringIconProgressConfig = {
  mass: 2.5,
  damping: 18,
  stiffness: 135,
} as const;

const SpringConfig = {
  mass: 0.1,
  damping: 24,
  stiffness: 25,
} as const;

export const ExpansionProvider = ({ children }: { children: ReactNode }) => {
  const dimensionsSharedValue = useSharedValue<null | ReturnType<
    typeof measure
  >>(null);
  const transitionId = useSharedValue<string | null>(null);
  const transitionScale = useSharedValue(1);

  const transitionProgress = useSharedValue(0);
  const springIconProgress = useSharedValue(0);
  const transitionOpacityProgress = useSharedValue(0);
  const componentConfig = useSharedValue<{
    borderRadius: number;
    color: string;
  } | null>(null);

  const startTransition = useCallback(
    (
      animatedRef: AnimatedRef,
      {
        id,
        onComplete,
        borderRadius,
        color,
      }: {
        id: string;
        onComplete?: () => void;
        borderRadius?: number;
        color?: string;
      },
    ) => {
      'worklet';
      if (!animatedRef) return;
      const dimensions = measure(animatedRef);

      if (!dimensions) return;
      const { width, height, x, y, pageX, pageY } = dimensions;
      componentConfig.value = {
        borderRadius: borderRadius ?? 10,
        color: color ?? 'rgba(0, 0, 0, 1)',
      };
      transitionId.value = id;
      dimensionsSharedValue.value = { width, height, x, y, pageX, pageY };
      cancelAnimation(transitionOpacityProgress);
      cancelAnimation(transitionProgress);
      cancelAnimation(springIconProgress);
      cancelAnimation(transitionScale);
      transitionScale.value = 1;
      transitionOpacityProgress.value = 0;
      transitionProgress.value = 0;
      transitionOpacityProgress.value = withTiming(1, {
        duration: 100,
      });
      springIconProgress.value = withSpring(1, SpringIconProgressConfig);
      transitionProgress.value = withSpring(1, SpringConfig, isFinished => {
        if (isFinished && onComplete) {
          onComplete();
          transitionOpacityProgress.value = withTiming(0, {
            duration: 300,
            easing: Easing.in(Easing.ease),
          });
        }
      });
    },
    [
      componentConfig,
      dimensionsSharedValue,
      springIconProgress,
      transitionId,
      transitionOpacityProgress,
      transitionProgress,
      transitionScale,
    ],
  );

  const navigation = useRouter();
  const debouncedBackNavigation = useMemo(
    () => debounce(navigation.back, 1000, { leading: true, trailing: false }),
    [navigation.back],
  );
  const backTransition = useCallback(() => {
    'worklet';
    scheduleOnRN(debouncedBackNavigation);
    transitionOpacityProgress.value = withSequence(
      withTiming(1, { duration: 0 }),
      withTiming(0, { duration: 700, easing: Easing.in(Easing.ease) }),
    );
    cancelAnimation(transitionProgress);
    cancelAnimation(springIconProgress);
    springIconProgress.value = 1;
    transitionProgress.value = 1;
    springIconProgress.value = withSpring(0, SpringIconProgressConfig);
    transitionProgress.value = withSpring(0, {
      mass: 0.1,
      stiffness: 42,
      damping: 4,
    });
  }, [
    debouncedBackNavigation,
    springIconProgress,
    transitionOpacityProgress,
    transitionProgress,
  ]);

  const resetTransition = useCallback(() => {
    'worklet';
    dimensionsSharedValue.value = null;
  }, [dimensionsSharedValue]);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const rStyle = useAnimatedStyle(() => {
    if (!dimensionsSharedValue.value) return { width: 0, height: 0 };
    const { width, height, pageX, pageY } = dimensionsSharedValue.value;
    const animatedWidth = interpolate(
      transitionProgress.value,
      [0, 1],
      [width, windowWidth * transitionScale.value],
    );
    const animatedHeight = interpolate(
      transitionProgress.value,
      [0, 1],
      [height, windowHeight * transitionScale.value],
    );

    const translateX = interpolate(
      transitionProgress.value,
      [0, 1],
      [pageX, (windowWidth * (1 - transitionScale.value)) / 2],
    );
    const translateY = interpolate(
      transitionProgress.value,
      [0, 1],
      [pageY, (windowHeight * (1 - transitionScale.value)) / 2],
    );

    const borderRadius = interpolate(
      transitionProgress.value,
      [0, 1],
      [componentConfig.value?.borderRadius ?? 10, 50],
    );

    return {
      width: animatedWidth,
      height: animatedHeight,
      transform: [{ translateX }, { translateY }],
      borderRadius,
      borderCurve: 'continuous',
      backgroundColor: componentConfig.value?.color,
      opacity: transitionOpacityProgress.value,
    };
  }, []);

  const value = useMemo(() => {
    return {
      startTransition,
      resetTransition,
      backTransition,
      timingProgress: transitionOpacityProgress,
      springProgress: springIconProgress,
      transitionScale,
      transitionId,
    };
  }, [
    backTransition,
    resetTransition,
    springIconProgress,
    startTransition,
    transitionId,
    transitionOpacityProgress,
    transitionScale,
  ]);

  return (
    <ExpansionContext.Provider value={value}>
      {children}
      <Animated.View style={[styles.animatedView, rStyle]} />
    </ExpansionContext.Provider>
  );
};

export const useCustomNavigation = () => {
  return useContext(ExpansionContext);
};

const styles = StyleSheet.create({
  animatedView: {
    elevation: 5,
    position: 'absolute',
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    zIndex: 1000,
  },
});
