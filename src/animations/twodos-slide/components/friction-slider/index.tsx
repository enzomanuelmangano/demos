import { Dimensions, Platform, StyleSheet } from 'react-native';

import { useCallback } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type FrictionSliderProps = {
  onProgressChange?: ({
    clampedProgress,
    realProgress,
  }: {
    clampedProgress: number;
    realProgress: number;
  }) => void;
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

const ScreenWidth = Dimensions.get('window').width;

// I just like this spring mass value, but you can change it if you want
const SpringMass = 1.1;

const MaxTranslationFrictionThreshold = ScreenWidth / 8;
const MaxTranslationProgress = MaxTranslationFrictionThreshold * 1.8;

const MinFriction = 1;
const MaxFriction = 0.35;

const INITIAL_SCROLL_POSITION = MaxTranslationProgress;

export const FrictionSlider: React.FC<FrictionSliderProps> = ({
  onProgressChange,
  children,
  containerStyle,
}) => {
  const scrollOffset = useSharedValue(INITIAL_SCROLL_POSITION);

  const convertScrollToProgress = useCallback((offset: number) => {
    'worklet';
    // Convert scroll offset to progress (-1 to 1)
    // When scrollOffset = INITIAL_SCROLL_POSITION, progress = 0
    // When scrolling right (positive), progress increases
    // When scrolling left (negative), progress decreases
    const translation = offset;
    return interpolate(
      translation,
      [-ScreenWidth / 4, 0, ScreenWidth / 4],
      [-1, 0, 1],
      Extrapolation.EXTEND,
    );
  }, []);

  const realProgress = useDerivedValue(() => {
    return convertScrollToProgress(scrollOffset.value);
  }, []);

  const clampedProgress = useDerivedValue(() => {
    // Clamp to -1..1 for visual feedback (path drawing)
    return interpolate(
      scrollOffset.value,
      [-ScreenWidth / 4, 0, ScreenWidth / 4],
      [-1, 0, 1],
      Extrapolation.CLAMP,
    );
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.value = event.contentOffset.x;
    },
  });

  // This is a reaction that triggers when the progress value changes
  // It's a kind of "useEffect" but for Reanimated values
  useAnimatedReaction(
    () => realProgress.value,
    (curr, prev) => {
      if (prev !== curr) {
        onProgressChange?.({
          // The clampedProgress is the one that will be used to update the Path
          // The realProgress includes the native scroll bounce effect
          clampedProgress: clampedProgress.value,
          realProgress: realProgress.value,
        });
      }
    },
  );

  // Use native ScrollView on iOS for authentic physics, PanGesture on other platforms
  if (Platform.OS === 'ios') {
    return (
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        bounces
        bouncesZoom={false}
        decelerationRate="normal"
        contentContainerStyle={styles.scrollView}
        contentOffset={{ x: INITIAL_SCROLL_POSITION, y: 0 }}>
        <Animated.View style={styles.scrollableView}>{children}</Animated.View>
      </Animated.ScrollView>
    );
  }

  // Fallback to PanGesture with manual friction for non-iOS platforms
  return (
    <FrictionSliderPanGesture
      onProgressChange={onProgressChange}
      containerStyle={containerStyle}>
      {children}
    </FrictionSliderPanGesture>
  );
};

// Original PanGesture implementation for non-iOS platforms
const FrictionSliderPanGesture: React.FC<FrictionSliderProps> = ({
  onProgressChange,
  children,
  containerStyle,
}) => {
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const progressTranslateX = useSharedValue(0);

  const convertTranslationToProgress = useCallback((translation: number) => {
    'worklet';
    return interpolate(
      translation,
      [-MaxTranslationProgress, 0, MaxTranslationProgress],
      [-1, 0, 1],
      Extrapolation.EXTEND,
    );
  }, []);

  const clampedProgress = useDerivedValue(() => {
    return convertTranslationToProgress(progressTranslateX.value);
  }, []);

  const realProgress = useDerivedValue(() => {
    return convertTranslationToProgress(translateX.value);
  }, []);

  useAnimatedReaction(
    () => realProgress.value,
    (curr, prev) => {
      if (prev !== curr) {
        onProgressChange?.({
          clampedProgress: clampedProgress.value,
          realProgress: realProgress.value,
        });
      }
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateX);
      contextX.value = translateX.value;
    })
    .onUpdate(event => {
      const baseTranslation = event.translationX + contextX.value;

      const incrementalFriction = interpolate(
        Math.abs(baseTranslation),
        [0, MaxTranslationFrictionThreshold],
        [MinFriction, MaxFriction],
        Extrapolation.CLAMP,
      );

      const translationWithFriction = baseTranslation * incrementalFriction;
      translateX.value = translationWithFriction;
      progressTranslateX.value = translationWithFriction;
    })
    .onFinalize(() => {
      translateX.value = withSpring(0, {
        mass: SpringMass,
        damping: 10,
        stiffness: 100,
      });
      progressTranslateX.value = withSpring(0, {
        mass: SpringMass,
        overshootClamping: true,
        damping: 10,
        stiffness: 100,
      });
    });

  const rTextStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: translateX.value,
        },
      ],
    };
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[rTextStyle, containerStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    alignItems: 'flex-start',
    height: 200,
    justifyContent: 'center',
    width: ScreenWidth,
  },
  scrollableView: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 48,
  },
});
