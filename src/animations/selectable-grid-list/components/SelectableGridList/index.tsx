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
    const combined = new Set([...currentActiveIndexes.value]);
    for (const idx of pendingIndexes.value) {
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
    currentActiveIndexes.value = [];
    pendingIndexes.value = [];
    currentActiveIndexesSet.value = new Set();
    pendingIndexesSet.value = new Set();
  }, [
    currentActiveIndexes,
    pendingIndexes,
    currentActiveIndexesSet,
    pendingIndexesSet,
  ]);

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
      return totalActiveIndexes.value;
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

  const toggleIndex = useCallback(
    (index: number) => {
      'worklet';
      const currentSet = new Set(currentActiveIndexes.value);
      if (currentSet.has(index)) {
        currentSet.delete(index);
      } else {
        currentSet.add(index);
      }
      currentActiveIndexes.value = Array.from(currentSet);
      currentActiveIndexesSet.value = currentSet;

      pendingIndexes.value = [];
      pendingIndexesSet.value = new Set();
    },
    [
      currentActiveIndexes,
      pendingIndexes,
      currentActiveIndexesSet,
      pendingIndexesSet,
    ],
  );

  const panGesture = Gesture.Pan()
    .onBegin(event => {
      initialSelectedIndex.value = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
      });
    })
    .onUpdate(event => {
      if (initialSelectedIndex.value == null) return;

      const pendingFinalIndex = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
      });

      const newPending = generateNumbersInRange(
        initialSelectedIndex.value,
        pendingFinalIndex,
      );
      pendingIndexes.value = newPending;
      const pendingSet = new Set(newPending);
      pendingIndexesSet.value = pendingSet;

      const filteredCurrent = [];
      for (const idx of currentActiveIndexes.value) {
        if (!pendingSet.has(idx)) {
          filteredCurrent.push(idx);
        }
      }
      currentActiveIndexes.value = filteredCurrent;
      currentActiveIndexesSet.value = new Set(filteredCurrent);

      const lowerBound = contentOffsetY.value + itemSize;
      const upperBound = lowerBound + containerHeight - 2 * itemSize;

      const scrollSpeed = itemSize * 0.15;
      if (event.y + contentOffsetY.value <= lowerBound) {
        scrollTo(flatListRef, 0, contentOffsetY.value - scrollSpeed, false);
      } else if (event.y + contentOffsetY.value >= upperBound) {
        scrollTo(flatListRef, 0, contentOffsetY.value + scrollSpeed, false);
      }
    })
    .onEnd(event => {
      if (initialSelectedIndex.value == null) return;

      const finalIndex = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
      });

      const finalPending = generateNumbersInRange(
        initialSelectedIndex.value,
        finalIndex,
      );
      pendingIndexes.value = finalPending;

      if (finalPending.length === 1) {
        const index = finalPending[0]!;
        toggleIndex(index);
        return;
      }

      const combined = new Set(currentActiveIndexes.value);
      for (const idx of finalPending) {
        combined.add(idx);
      }
      currentActiveIndexes.value = Array.from(combined);
      currentActiveIndexesSet.value = combined;
    })
    .onFinalize(() => {
      pendingIndexes.value = [];
      pendingIndexesSet.value = new Set();
      initialSelectedIndex.value = null;
    });

  const tapGesture = Gesture.Tap()
    .maxDeltaY(5)
    .maxDeltaX(5)
    .onStart(event => {
      initialSelectedIndex.value = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
      });
    })
    .onEnd(event => {
      const index = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
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
      contentOffsetY.value = event.contentOffset.y;
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
