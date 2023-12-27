// Import necessary modules and components from React and React Native
import React, { useCallback } from 'react';
import type { ScrollViewProps } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

// Import the SortableItem component and Positions type
import { SortableItem } from './SortableItem';
import type { Positions } from './types';

// Define the props for the SortableList component
type SortableListProps<T> = {
  listItemHeight: number;
  data: T[];
  renderItem?: (_: { item: T; index: number }) => React.ReactNode;
  onAnimatedIndexChange?: (index: number | null) => void;
  onDragEnd?: (positions: Positions) => void;
  backgroundItem?: React.ReactNode;
} & ScrollViewProps;

// Define the SortableList component
function SortableList<T>({
  renderItem: renderItemProp,
  data,
  listItemHeight,
  onAnimatedIndexChange,
  onDragEnd,
  backgroundItem,
  ...rest
}: SortableListProps<T>) {
  // Shared values for tracking scroll position, animated index, and scroll view reference
  const scrollContentOffsetY = useSharedValue(0);
  const scrollView = useAnimatedRef<Animated.ScrollView>();

  // Initial positions for list items
  const initialPositions = new Array(data?.length)
    .fill(0)
    .map((_, index) => index * listItemHeight)
    .reduce((acc, curr, index) => {
      acc[index] = curr;
      return acc;
    }, {} as Positions);

  // Shared value for tracking positions of list items
  const positions = useSharedValue<Positions>(initialPositions);

  // Shared value for tracking the currently animated index during drag-and-drop
  const animatedIndex = useSharedValue<number | null>(null);

  // Animated scroll handler to update the scroll position
  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { y } }) => {
      scrollContentOffsetY.value = y;
    },
  });

  // Animated reaction to trigger a callback when the animated index changes
  useAnimatedReaction(
    () => animatedIndex.value,
    currentIndex => {
      if (onAnimatedIndexChange) runOnJS(onAnimatedIndexChange)(currentIndex);
    },
  );

  // Callback function for rendering each item
  const renderItem = useCallback(
    (params: { item: T; index: number }) => {
      return (
        <SortableItem
          itemHeight={listItemHeight}
          positions={positions}
          index={params.index}
          animatedIndex={animatedIndex}
          onDragEnd={onDragEnd}
          backgroundItem={backgroundItem}
          scrollViewRef={scrollView}
          scrollContentOffsetY={scrollContentOffsetY}
          key={params.index}>
          {renderItemProp?.(params)}
        </SortableItem>
      );
    },
    [
      animatedIndex,
      backgroundItem,
      listItemHeight,
      onDragEnd,
      positions,
      renderItemProp,
      scrollContentOffsetY,
      scrollView,
    ],
  );

  // Render the SortableList component with an Animated.ScrollView
  return (
    <Animated.ScrollView
      {...rest}
      onScroll={onScroll}
      ref={scrollView}
      contentContainerStyle={[
        rest.contentContainerStyle,
        {
          height: listItemHeight * data.length,
          paddingBottom: listItemHeight * data.length + listItemHeight * 2,
        },
      ]}>
      {data.map((item, index) => {
        return renderItem({
          item,
          index: index,
        });
      })}
    </Animated.ScrollView>
  );
}

// Export the SortableList component
export { SortableList };
