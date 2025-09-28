import { useWindowDimensions } from 'react-native';

import { type ReactNode, useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

import { StoryListItem } from './story-item';
import { clamp, findClosestSnapPoint } from '../../helpers';

type StoryListProps<T> = {
  stories: T[];
  pagingEnabled?: boolean;
  storyItemDimensions: {
    width: number;
    height: number;
  };
  renderItem: (story: T, index: number) => ReactNode;
  visibleItems?: number;
  gap?: number;
};

function StoryList<T>({
  stories,
  pagingEnabled,
  storyItemDimensions,
  renderItem,
  visibleItems = 3,
  gap = 35,
}: StoryListProps<T>) {
  const { width } = useWindowDimensions();

  // Here I've defined three shared values in order to
  // handle the translation of the list
  // - translateX is the value that will be animated
  // - contextX is the value that will be used to store
  //   the current translation value when the gesture begins
  // - clampedTranslateX is the value that will be used
  //   to clamp the translateX value so that it doesn't
  //   go out of bounds
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const clampedTranslateX = useDerivedValue(() => {
    return clamp(
      translateX.value,
      -storyItemDimensions.width * (stories.length - 1),
      0,
    );
  }, [width, stories]);

  const storiesSnapPoints = useMemo(() => {
    return stories.map((_, index) => {
      return -storyItemDimensions.width * index;
    });
  }, [stories, storyItemDimensions.width]);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      // cancel any ongoing animations
      // That's quite important, otherwise if you
      // start dragging the list while it's animating
      // it will flicker and jump around
      cancelAnimation(translateX);

      // store the current clamped translation value
      // Please not that we're using the clamped value
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      // update the translateX value by adding the
      // current translation to the stored context value
      translateX.value = contextX.value + event.translationX;
    })
    .onFinalize(event => {
      if (!pagingEnabled) {
        // If paging is disabled, we need to use a decay animation
        // to simulate the momentum of the gesture
        // To be honest this high order function is super useful
        // and feels quite magical :)
        translateX.value = withDecay({
          velocity: event.velocityX,
        });
        return;
      }

      // If paging is enabled, we need to snap to the closest snap point
      const closestSnapPoint = findClosestSnapPoint(
        translateX.value,
        storiesSnapPoints,
      );
      // snap to the closest snap point using a timing animation
      // (you can use any animation you want)
      translateX.value = withTiming(closestSnapPoint);
    });

  // To be very precise, this is not the active index
  // In order to have the active index, we need to
  // apply Math.floor to the activeIndex value
  // But we're not doing that here because we need
  // the active index to be a float value in order
  // to animate smoothly the items
  const activeIndex = useDerivedValue(() => {
    // calculate the active index by dividing the current
    // translation by the width of a story item
    // We're using Math.abs here because the translation value is negative
    return Math.abs(clampedTranslateX.value / storyItemDimensions.width);
  }, [storyItemDimensions.width]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View>
        {stories.map((story, index) => (
          <StoryListItem
            key={index}
            story={story}
            index={index}
            activeIndex={activeIndex}
            translateX={clampedTranslateX}
            itemWidth={storyItemDimensions.width}
            visibleItems={visibleItems}
            gap={gap}
            style={{
              width: width,
              zIndex: stories.length - index,
            }}
            renderItem={renderItem}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

export { StoryList };
