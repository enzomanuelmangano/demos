import { type FlatListProps, useWindowDimensions } from 'react-native';

import {
  type ReactElement,
  type RefObject,
  useCallback,
  useImperativeHandle,
} from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  calculateGridItemIndex,
  generateNumbersInRange,
  sameElements,
} from './utils';

type CustomRenderItemParams<T> = {
  index: number;
  activeIndexes: SharedValue<number[]>;
  item: T;
};
type CustomRenderItem<T> = (params: CustomRenderItemParams<T>) => ReactElement;

type CustomFlatListProps<T> = Omit<FlatListProps<T>, 'renderItem'> & {
  renderItem: CustomRenderItem<T>;
};

export type GridListRefType = {
  reset: () => void;
};

type GridListProps<T> = CustomFlatListProps<T> & {
  itemSize: number;
  containerHeight?: number;
  onSelectionChange?: (indexes: number[]) => void;
  gridListRef?: RefObject<GridListRefType | null>;
};

function SelectableGridList<T>({
  itemSize,
  containerHeight: containerHeightProp,
  onSelectionChange,
  gridListRef,
  ...rest
}: GridListProps<T>): ReactElement {
  const itemsPerRow = rest.numColumns ?? 1;

  const { height: windowHeight } = useWindowDimensions();
  const containerHeight = containerHeightProp ?? windowHeight;
  const flatListRef = useAnimatedRef<Animated.FlatList<T>>();

  const contentOffsetY = useSharedValue(0);
  const currentActiveIndexes = useSharedValue<number[]>([]);

  const pendingIndexes = useSharedValue<number[]>([]);
  const pendingIndexesSet = useSharedValue<Set<number>>(new Set());
  const currentActiveIndexesSet = useSharedValue<Set<number>>(new Set());

  const totalActiveIndexes = useDerivedValue(() => {
    const combined = new Set([...currentActiveIndexes.get()]);
    for (const idx of pendingIndexes.get()) {
      combined.add(idx);
    }
    return Array.from(combined);
  }, []);

  const totalItems = rest.data?.length ?? 0;

  const calculateGridItemPosition = useCallback(
    ({ x, y }: { x: number; y: number }) => {
      'worklet';
      const index = calculateGridItemIndex({
        x,
        y,
        itemWidth: itemSize,
        itemHeight: itemSize,
        itemsPerRow: itemsPerRow,
      });
      // Clamp index to valid range [0, totalItems - 1]
      return Math.max(0, Math.min(index, totalItems - 1));
    },
    [itemSize, itemsPerRow, totalItems],
  );

  const reset = useCallback(() => {
    // We don't need to update the totalActiveIndexes here because
    // its value is derived from the currentActiveIndexes and pendingIndexes
    currentActiveIndexes.set([]);
    pendingIndexes.set([]);
    currentActiveIndexesSet.set(new Set());
    pendingIndexesSet.set(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    gridListRef,
    () => ({
      reset,
    }),
    [reset],
  );

  // useAnimatedReaction is a kind of "useEffect" for reanimated values
  // It will run the callback function when the returned value from the first argument changes
  // The second argument is the callback function
  // In this case, we are using it to detect when the totalActiveIndexes changes
  // and then run the onSelectionChange callback.
  // I've used the "sameElements" function to compare the previous and current values of totalActiveIndexes
  // The purpose is to make a deep comparison of the arrays, because the "sameElements" function
  // will return true if the arrays have the same elements, even if they are in different order.
  useAnimatedReaction(
    () => {
      return totalActiveIndexes.get();
    },
    (updatedActiveIndexes, prevActiveIndexes) => {
      if (
        onSelectionChange &&
        !sameElements(updatedActiveIndexes, prevActiveIndexes ?? [])
      ) {
        scheduleOnRN(onSelectionChange, updatedActiveIndexes);
      }
    },
  );

  const initialSelectedIndex = useSharedValue<number | null>(null);

  const toggleIndex = useCallback((index: number) => {
    'worklet';
    const currentSet = new Set(currentActiveIndexes.get());
    if (currentSet.has(index)) {
      currentSet.delete(index);
    } else {
      currentSet.add(index);
    }
    currentActiveIndexes.set(Array.from(currentSet));
    currentActiveIndexesSet.set(currentSet);

    pendingIndexes.set([]);
    pendingIndexesSet.set(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panGesture = Gesture.Pan()
    .onBegin(event => {
      initialSelectedIndex.set(
        calculateGridItemPosition({
          x: event.x,
          y: event.y + contentOffsetY.get(),
        }),
      );
    })
    .onUpdate(event => {
      const startIndex = initialSelectedIndex.get();
      if (startIndex == null) return;

      const pendingFinalIndex = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.get(),
      });

      const newPending = generateNumbersInRange(startIndex, pendingFinalIndex);
      pendingIndexes.set(newPending);
      const pendingSet = new Set(newPending);
      pendingIndexesSet.set(pendingSet);

      const filteredCurrent = [];
      for (const idx of currentActiveIndexes.get()) {
        if (!pendingSet.has(idx)) {
          filteredCurrent.push(idx);
        }
      }
      currentActiveIndexes.set(filteredCurrent);
      currentActiveIndexesSet.set(new Set(filteredCurrent));

      const lowerBound = contentOffsetY.get() + itemSize;
      const upperBound = lowerBound + containerHeight - 2 * itemSize;

      const scrollSpeed = itemSize * 0.15;
      if (event.y + contentOffsetY.get() <= lowerBound) {
        scrollTo(flatListRef, 0, contentOffsetY.get() - scrollSpeed, false);
      } else if (event.y + contentOffsetY.get() >= upperBound) {
        scrollTo(flatListRef, 0, contentOffsetY.get() + scrollSpeed, false);
      }
    })
    .onEnd(event => {
      const startIndex = initialSelectedIndex.get();
      if (startIndex == null) return;

      const finalIndex = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.get(),
      });

      const finalPending = generateNumbersInRange(startIndex, finalIndex);
      pendingIndexes.set(finalPending);

      if (finalPending.length === 1) {
        const index = finalPending[0]!;
        toggleIndex(index);
        return;
      }

      const combined = new Set(currentActiveIndexes.get());
      for (const idx of finalPending) {
        combined.add(idx);
      }
      currentActiveIndexes.set(Array.from(combined));
      currentActiveIndexesSet.set(combined);
    })
    .onFinalize(() => {
      pendingIndexes.set([]);
      pendingIndexesSet.set(new Set());
      initialSelectedIndex.set(null);
    });

  const tapGesture = Gesture.Tap()
    .maxDeltaY(5)
    .maxDeltaX(5)
    .onStart(event => {
      initialSelectedIndex.set(
        calculateGridItemPosition({
          x: event.x,
          y: event.y + contentOffsetY.get(),
        }),
      );
    })
    .onEnd(event => {
      const index = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.get(),
      });
      toggleIndex(index);
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const renderItem = useCallback(
    (defaultRenderItemParams: { index: number; item: T }) => {
      return rest.renderItem({
        ...defaultRenderItemParams,
        activeIndexes: totalActiveIndexes,
      });
    },
    [rest, totalActiveIndexes],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      return {
        length: itemSize,
        offset: itemSize * index,
        index,
      };
    },
    [itemSize],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      contentOffsetY.set(event.contentOffset.y);
    },
  });

  return (
    <GestureDetector gesture={gesture}>
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <Animated.FlatList<T>
        {...rest}
        ref={flatListRef}
        scrollEventThrottle={1}
        removeClippedSubviews={true}
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={20}
        onScroll={onScroll}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
      />
    </GestureDetector>
  );
}

export { SelectableGridList };
