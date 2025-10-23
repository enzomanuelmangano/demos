import { useWindowDimensions, View } from 'react-native';

import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';

import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { IMAGES } from '../../constants';
import type { SharedValue } from 'react-native-reanimated';

type SwipeableCardProps = {
  image: (typeof IMAGES)[0];
  index: number;
  activeIndex: SharedValue<number>;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
};

export type SwipeableCardRefType = {
  swipeRight: () => void;
  swipeLeft: () => void;
  reset: () => void;
};

const SIGNED_NORMALIZED_INPUT_RANGE = [-1, 0, 1];

const SwipeableCard = forwardRef<
  {
    //
  },
  SwipeableCardProps
>(({ image, index, activeIndex, onSwipeLeft, onSwipeRight }, ref) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const currentActiveIndex = useSharedValue(Math.floor(activeIndex.value));
  const nextActiveIndex = useSharedValue(Math.floor(activeIndex.value));

  const { width } = useWindowDimensions();
  const maxCardTranslation = width * 1.5;

  const swipeRight = useCallback(() => {
    onSwipeRight?.();
    translateX.value = withSpring(maxCardTranslation);
    activeIndex.value = activeIndex.value + 1;
  }, [activeIndex, maxCardTranslation, onSwipeRight, translateX]);

  const swipeLeft = useCallback(() => {
    onSwipeLeft?.();
    translateX.value = withSpring(-maxCardTranslation);
    activeIndex.value = activeIndex.value + 1;
  }, [activeIndex, maxCardTranslation, onSwipeLeft, translateX]);

  const reset = useCallback(() => {
    if (translateX.value !== 0) {
      cancelAnimation(translateX);
      translateX.value = withSpring(0);
    }
    if (translateX.value !== 0) {
      cancelAnimation(translateY);
      translateY.value = withSpring(0);
    }
  }, [translateX, translateY]);

  useImperativeHandle(ref, () => {
    return {
      swipeLeft,
      swipeRight,
      reset,
    };
  }, [swipeLeft, swipeRight, reset]);

  const inputTranslationRange = useMemo(() => {
    return [-width / 3, 0, width / 3];
  }, [width]);

  // Time (in seconds) needed for crossing to one extreme of the inputTranslationRange with a quick flick of a finger
  const FLICK_DURATION = 0.1;
  const inputVelocityRange = useMemo(() => {
    return [
      inputTranslationRange[0] / FLICK_DURATION,
      0,
      inputTranslationRange[2] / FLICK_DURATION,
    ];
  }, [inputTranslationRange]);

  const rotate = useDerivedValue(() => {
    return interpolate(
      translateX.value,
      inputTranslationRange,
      [-Math.PI / 20, 0, Math.PI / 20],
      Extrapolation.CLAMP,
    );
  }, [inputTranslationRange]);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      currentActiveIndex.value = Math.floor(activeIndex.value);
    })
    .onUpdate(event => {
      if (currentActiveIndex.value !== index) return;
      translateX.value = event.translationX;
      translateY.value = event.translationY;

      const normalizedTranslationX = interpolate(
        translateX.value,
        inputTranslationRange,
        SIGNED_NORMALIZED_INPUT_RANGE,
        Extrapolation.EXTEND,
      );

      const normalizedVelocityX = interpolate(
        event.velocityX,
        inputVelocityRange,
        SIGNED_NORMALIZED_INPUT_RANGE,
        Extrapolation.EXTEND,
      );

      // Calculate decision boundary using unit circle formula (x² + y² = r² = 1).
      // When normalizedTranslation² + normalizedVelocity² crosses 1, the swipe is triggered.
      // This creates a circular decision boundary where both translation distance and velocity
      // contribute equally to the swipe decision.  A quick flick (high velocity, low distance)
      // and a slow drag (high distance, low velocity) are treated equivalently, while both
      // contribute always. Math.sign() preserves swipe direction.
      const signedNormalizedDecisionRadius =
        Math.sign(translateX.value) *
        (normalizedTranslationX * normalizedTranslationX +
          normalizedVelocityX * normalizedVelocityX);

      nextActiveIndex.value = interpolate(
        signedNormalizedDecisionRadius,
        SIGNED_NORMALIZED_INPUT_RANGE,
        [
          currentActiveIndex.value + 1,
          currentActiveIndex.value,
          currentActiveIndex.value + 1,
        ],
        Extrapolation.CLAMP,
      );
    })
    .onFinalize(event => {
      if (currentActiveIndex.value !== index) return;

      if (nextActiveIndex.value === activeIndex.value + 1) {
        const sign = Math.sign(event.translationX);
        if (sign === 1) {
          scheduleOnRN(swipeRight);
        } else {
          scheduleOnRN(swipeLeft);
        }
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const rCardStyle = useAnimatedStyle(() => {
    const opacity = withTiming(index - activeIndex.value < 5 ? 1 : 0);
    const transY = withTiming((index - activeIndex.value) * 23);
    const scale = withTiming(1 - 0.07 * (index - activeIndex.value));
    return {
      opacity,
      transform: [
        { rotate: `${rotate.value}rad` },
        { translateY: transY },
        { scale: scale },
        {
          translateX: translateX.value,
        },
        {
          translateY: translateY.value,
        },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            height: '75%',
            width: '90%',
            zIndex: -index,
          },
          rCardStyle,
        ]}>
        <View
          style={{
            flex: 1,
            borderRadius: 25,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}>
          <Image
            source={image}
            style={{ height: '100%', width: '100%' }}
            contentFit="cover"
            cachePolicy={'memory-disk'}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

export { SwipeableCard };
