import {
  Canvas,
  LinearGradient,
  Rect,
  useComputedValue,
  vec,
} from '@shopify/react-native-skia';
import React, { useCallback, useImperativeHandle } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { IMAGES } from '../../constants';
import {
  SizeProvider,
  useDeprecatedCanvas,
} from '../../../../providers/canvas';

type SwipeableCardProps = {
  image: (typeof IMAGES)[0];
  index: number;
  activeIndex: Animated.SharedValue<number>;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
};

export type SwipeableCardRefType = {
  swipeRight: () => void;
  swipeLeft: () => void;
  reset: () => void;
};

const SwipeableCard = React.forwardRef<
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

  useImperativeHandle(
    ref,
    () => {
      return {
        swipeLeft,
        swipeRight,
        reset,
      };
    },
    [swipeLeft, swipeRight, reset],
  );

  const inputRange = React.useMemo(() => {
    return [-width / 3, 0, width / 3];
  }, [width]);

  const rotate = useDerivedValue(() => {
    return interpolate(
      translateX.value,
      inputRange,
      [-Math.PI / 20, 0, Math.PI / 20],
      Extrapolate.CLAMP,
    );
  }, [inputRange]);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      currentActiveIndex.value = Math.floor(activeIndex.value);
    })
    .onUpdate(event => {
      if (currentActiveIndex.value !== index) return;
      translateX.value = event.translationX;
      translateY.value = event.translationY;

      nextActiveIndex.value = interpolate(
        translateX.value,
        inputRange,
        [
          currentActiveIndex.value + 1,
          currentActiveIndex.value,
          currentActiveIndex.value + 1,
        ],
        Extrapolate.CLAMP,
      );
    })
    .onFinalize(event => {
      if (currentActiveIndex.value !== index) return;

      if (nextActiveIndex.value === activeIndex.value + 1) {
        const sign = Math.sign(event.translationX);
        if (sign === 1) {
          runOnJS(swipeRight)();
        } else {
          runOnJS(swipeLeft)();
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
        <View style={{ flex: 1, borderRadius: 15, overflow: 'hidden' }}>
          <Image
            source={image}
            style={{ height: '100%', width: '100%' }}
            contentFit="cover"
          />
          <SizeProvider
            size={{
              width: 100,
              height: 300,
            }}>
            <Canvas
              style={{
                ...StyleSheet.absoluteFillObject,
                bottom: -5,
                zIndex: 20,
              }}>
              <CardLinearGradient />
            </Canvas>
          </SizeProvider>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

const CardLinearGradient = React.memo(() => {
  const { size } = useDeprecatedCanvas();

  // linear gradient start value
  const start = useComputedValue(() => {
    return vec(0, size.height);
  }, [size]);

  // linear gradient end value
  const end = useComputedValue(() => {
    return vec(0, size.height * 0.7);
  }, [size]);

  // get rect width
  const width = useComputedValue(() => {
    return size.width;
  }, [size]);

  // get rect height
  const height = useComputedValue(() => {
    return size.height;
  }, [size]);

  return (
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient
        start={start}
        end={end}
        colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']}
      />
    </Rect>
  );
});
export { SwipeableCard };
