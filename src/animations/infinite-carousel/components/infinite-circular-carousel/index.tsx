import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  type ReactElement,
  type Ref,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';

import { WindowWidth } from '../../constants';

import { CarouselItem } from './carousel-item';
import { useInterpolateConfig } from './hooks/use-interpolate-config';
import type {
  InfiniteCircularCarouselProps,
  InfiniteCircularCarouselRef,
} from './types';
import { snapPoint } from './utils/snap-point';

// Before being scared by the code, let me tell you that all this complexity
// is there just to create a simple Infinite Circular Carousel.
// The logic behind it is very simple, but the implementation is a bit complex.
// I really lost a ton of time to make it work properly, but I think it was worth it.
// You can rebuild the same animation without all this stuff by using https://github.com/dohooo/react-native-reanimated-carousel
// But honestly when I tried it, I wasn't really happy with the snapping effect
// And I really wanted to have more control over the carousel and the gesture
// This is what this code is all about. It's a bit complex, but it's also very powerful.

// Base component for InfiniteCircularCarousel
const BaseInfiniteCircularCarousel = <T,>(
  {
    data, // Array of data items
    listViewPort = WindowWidth, // Width of the list view port
    listItemWidth = WindowWidth, // Width of each list item
    renderItem, // Function to render each item
    interpolateConfig, // Configuration for interpolation
    style, // Additional styles for the carousel
    centered = true, // Whether carousel items should be centered
    onActiveIndexChanged, // Callback function for active index change
    snapEnabled = true, // Whether snapping is enabled
  }: InfiniteCircularCarouselProps<T>, // Props for the component
  ref: Ref<InfiniteCircularCarouselRef>, // Ref for the component
) => {
  const listOffset = listItemWidth * data.length; // Total width of the list

  // Calculate offset for centered items
  const centeredOffset = centered ? (listViewPort - listItemWidth) / 2 : 0;
  // Calculate maximum number of visible items
  const maxVisibleItems = Math.round(listViewPort / listItemWidth);

  // Shared values for translation
  // We're shifting the translateX value by 500
  // To simplify the circular carousel logic
  // This way we can focus on handling the circular effect
  // from left to right without worrying about positive values
  // Technically, if you scroll the full_list_size * 500, you'll be back to the start
  // And you will loose the Infinite Circular Carousel effect
  // But honestly, who's going to scroll that much? 😅
  const translateX = useSharedValue(-listOffset * 500);
  const contextX = useSharedValue(0);

  // Function to find the closest position for a given index
  const findClosestIndexPosition = useCallback(
    (index: number) => {
      // Calculate fixed translateX value and base translation
      const fixedTranslateX = translateX.value % listOffset;
      const baseTranslation = translateX.value - fixedTranslateX;

      // Calculate possible destinations for the given index
      const destinations = [
        baseTranslation - index * listItemWidth,
        baseTranslation - index * listItemWidth + listOffset,
        baseTranslation - index * listItemWidth - listOffset,
      ];

      // Find the destination with the shortest distance from the current translateX value
      const { destination } = destinations.reduce(
        (acc, dest) => {
          const distance = Math.abs(translateX.value - dest);
          if (distance < acc.distance) {
            return { distance, destination: dest };
          }
          return acc;
        },
        { distance: Number.MAX_SAFE_INTEGER, destination: 0 },
      );

      return destination;
    },
    [listItemWidth, listOffset, translateX.value],
  );

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      if (!animated) {
        translateX.value = -index * listItemWidth;
        return;
      }

      const destination = findClosestIndexPosition(index);

      translateX.value = withSpring(destination, {
        mass: 0.25,
      });
    },
    [findClosestIndexPosition, translateX, listItemWidth],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex,
    }),
    [scrollToIndex],
  );

  useAnimatedReaction(
    () => {
      const scrolledAmount = (translateX.value % listOffset) / listItemWidth;
      return Math.abs(Math.round(scrolledAmount)) % data.length;
    },
    (newIndex, prevIndex) => {
      if (onActiveIndexChanged && newIndex !== prevIndex) {
        onActiveIndexChanged?.(newIndex);
      }
    },
  );

  const snapIntervals = useMemo(() => {
    const negativeIntervals = data.map(
      (_, index) => -(index + 1) * listItemWidth,
    );
    const positiveIntervals = data.map((_, index) => index * listItemWidth);
    return [...negativeIntervals, ...positiveIntervals];
  }, [data, listItemWidth]);

  // Define gesture for panning
  // Yep, we have recreated a ScrollView with a PanGestureHandler 😅
  // I think it's a good exercise to understand how gestures work
  // But it also brings a lot of flexibility and control over the gesture
  // You can customize the gesture as you like
  const gesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateX);
      contextX.value = translateX.value;
    })
    .onUpdate(({ translationX }) => {
      translateX.value = contextX.value + translationX;
    })
    .onEnd(event => {
      if (!snapEnabled) {
        // If snapping is disabled, use decay animation
        // to simulate the scroll momentum
        // That's not needed for our specific use-case
        // But I think it's really cool to have it 😎
        translateX.value = withDecay({
          velocity: event.velocityX,
        });
        return;
      }
      const fixedTranslateX = translateX.value % listOffset;

      const baseTranslation = translateX.value - fixedTranslateX;

      const snapTo = snapPoint(fixedTranslateX, event.velocityX, snapIntervals);

      translateX.value = withSpring(baseTranslation + snapTo, {
        mass: 0.25,
      });
    });

  const selectedInterpolateConfig = useInterpolateConfig({
    listItemWidth,
    interpolateConfig,
  });

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.container,
            {
              width: listViewPort,
              transform: [
                {
                  translateX: +centeredOffset,
                },
              ],
            },
            style,
          ]}>
          {data.map((item, index) => {
            return (
              <CarouselItem
                key={index}
                listItemWidth={listItemWidth}
                renderItem={renderItem}
                index={index}
                listSize={listOffset}
                translateX={translateX}
                maxVisibleItems={maxVisibleItems}
                dataLength={data.length}
                item={item}
                interpolateConfig={selectedInterpolateConfig}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
});

export const InfiniteCircularCarousel = forwardRef(
  BaseInfiniteCircularCarousel,
) as <T>(
  p: InfiniteCircularCarouselProps<T> & {
    ref?: Ref<InfiniteCircularCarouselRef>;
  },
) => ReactElement;

export { InfiniteCircularCarouselProps, InfiniteCircularCarouselRef };
