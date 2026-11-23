import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import * as Haptics from 'expo-haptics';
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
      componentConfig.set({
        borderRadius: borderRadius ?? 10,
        color: color ?? 'rgba(0, 0, 0, 1)',
      });
      transitionId.set(id);
      dimensionsSharedValue.set({ width, height, x, y, pageX, pageY });
      cancelAnimation(transitionOpacityProgress);
      cancelAnimation(transitionProgress);
      cancelAnimation(springIconProgress);
      cancelAnimation(transitionScale);
      transitionScale.set(1);
      transitionOpacityProgress.set(0);
      transitionProgress.set(0);
      transitionOpacityProgress.set(
        withTiming(1, {
          duration: 100,
        }),
      );
      springIconProgress.set(withSpring(1, SpringIconProgressConfig));
      transitionProgress.set(
        withSpring(1, SpringConfig, isFinished => {
          if (isFinished && onComplete) {
            onComplete();
            transitionOpacityProgress.set(
              withTiming(0, {
                duration: 300,
                easing: Easing.in(Easing.ease),
              }),
            );
          }
        }),
      );
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

  // Back navigation is owned by the screens (they sit inside the independent
  // NavigationContainer); this only drives the collapse animation. Using
  // expo-router's back() here popped the OUTER tree and exited the demo.
  const backTransition = useCallback(() => {
    'worklet';
    scheduleOnRN(Haptics.selectionAsync);
    transitionOpacityProgress.set(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
    );
    cancelAnimation(transitionProgress);
    cancelAnimation(springIconProgress);
    springIconProgress.set(1);
    transitionProgress.set(1);
    springIconProgress.set(withSpring(0, SpringIconProgressConfig));
    transitionProgress.set(
      withSpring(0, {
        mass: 0.1,
        stiffness: 42,
        damping: 4,
      }),
    );
  }, [springIconProgress, transitionOpacityProgress, transitionProgress]);

  const resetTransition = useCallback(() => {
    'worklet';
    dimensionsSharedValue.set(null);
  }, [dimensionsSharedValue]);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const rStyle = useAnimatedStyle(() => {
    const dimensionsValue = dimensionsSharedValue.get();
    if (!dimensionsValue) return { width: 0, height: 0 };
    const { width, height, pageX, pageY } = dimensionsValue;
    const animatedWidth = interpolate(
      transitionProgress.get(),
      [0, 1],
      [width, windowWidth * transitionScale.get()],
    );
    const animatedHeight = interpolate(
      transitionProgress.get(),
      [0, 1],
      [height, windowHeight * transitionScale.get()],
    );

    const translateX = interpolate(
      transitionProgress.get(),
      [0, 1],
      [pageX, (windowWidth * (1 - transitionScale.get())) / 2],
    );
    const translateY = interpolate(
      transitionProgress.get(),
      [0, 1],
      [pageY, (windowHeight * (1 - transitionScale.get())) / 2],
    );

    const borderRadius = interpolate(
      transitionProgress.get(),
      [0, 1],
      [componentConfig.get()?.borderRadius ?? 10, 50],
    );

    return {
      width: animatedWidth,
      height: animatedHeight,
      transform: [{ translateX }, { translateY }],
      borderRadius,
      borderCurve: 'continuous',
      backgroundColor: componentConfig.get()?.color,
      opacity: transitionOpacityProgress.get(),
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
    boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.2)',
    position: 'absolute',
    zIndex: 1000,
  },
});
