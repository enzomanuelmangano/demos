import React, { RefObject, useCallback } from 'react';
import type { ScrollViewProps } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { SortableItem } from './SortableItem';
import type { Positions } from './types';

type SortableListProps<T> = {
  listItemHeight: number;
  data: T[];
  renderItem?: (_: { item: T; index: number }) => React.ReactNode;
  onAnimatedIndexChange?: (index: number | null) => void;
  onDragEnd?: (positions: Positions) => void;
  backgroundItem?: React.ReactNode;
} & ScrollViewProps;

function SortableList<T>({
  renderItem: renderItemProp,
  data,
  listItemHeight,
  onAnimatedIndexChange,
  onDragEnd,
  backgroundItem,
  ...rest
}: SortableListProps<T>) {
  const scrollContentOffsetY = useSharedValue(0);
  const scrollView = useAnimatedRef<Animated.ScrollView>();

  const initialPositions = new Array(data?.length)
    .fill(0)
    .map((_, index) => index * listItemHeight)
    .reduce((acc, curr, index) => {
      acc[index] = curr;
      return acc;
    }, {} as Positions);

  const positions = useSharedValue<Positions>(initialPositions);

  const animatedIndex = useSharedValue<number | null>(null);

  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { y } }) => {
      scrollContentOffsetY.value = y;
    },
  });

  useAnimatedReaction(
    () => animatedIndex.get(),
    currentIndex => {
      if (onAnimatedIndexChange) runOnJS(onAnimatedIndexChange)(currentIndex);
    },
  );

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
          scrollViewRef={scrollView as RefObject<Animated.ScrollView>}
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
      ]}
      scrollEnabled={false}>
      {data.map((item, index) => {
        return renderItem({
          item,
          index: index,
        });
      })}
    </Animated.ScrollView>
  );
}

export { SortableList };
