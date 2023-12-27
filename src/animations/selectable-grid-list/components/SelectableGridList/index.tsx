import { useWindowDimensions, type FlatListProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedRef,
  useDerivedValue,
  useSharedValue,
  scrollTo,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { useCallback, useImperativeHandle } from 'react';

import {
  calculateGridItemIndex,
  generateNumbersInRange,
  sameElements,
} from './utils';

type CustomRenderItemParams<T> = {
  index: number;
  activeIndexes: Animated.SharedValue<number[]>;
  item: T;
};
type CustomRenderItem<T> = (params: CustomRenderItemParams<T>) => JSX.Element;

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
  gridListRef?: React.RefObject<GridListRefType>;
};

function SelectableGridList<T>({
  itemSize,
  containerHeight: containerHeightProp,
  onSelectionChange,
  gridListRef,
  ...rest
}: GridListProps<T>): JSX.Element {
  const itemsPerRow = rest.numColumns ?? 1;

  const { height: windowHeight } = useWindowDimensions();
  const containerHeight = containerHeightProp ?? windowHeight;
  const flatListRef = useAnimatedRef<Animated.FlatList<T>>();

  const contentOffsetY = useSharedValue(0);
  // The currentActiveIndexes are the indexes that are currently selected (not pending)
  const currentActiveIndexes = useSharedValue<number[]>([]);

  // The pendingIndexes are the indexes that are currently being selected
  const pendingIndexes = useSharedValue<number[]>([]);

  // The totalActiveIndexes are all the indexes that are currently selected (pending + current)
  const totalActiveIndexes = useDerivedValue(() => {
    const combinedIndexes = [
      ...currentActiveIndexes.value,
      ...pendingIndexes.value,
    ];

    return [...new Set(combinedIndexes)];
  }, []);

  const calculateGridItemPosition = useCallback(
    ({ x, y }: { x: number; y: number }) => {
      'worklet';
      return calculateGridItemIndex({
        x,
        y,
        itemWidth: itemSize,
        itemHeight: itemSize,
        itemsPerRow: itemsPerRow,
      });
    },
    [itemSize, itemsPerRow],
  );

  const reset = useCallback(() => {
    // We don't need to update the totalActiveIndexes here because
    // its value is derived from the currentActiveIndexes and pendingIndexes
    currentActiveIndexes.value = [];
    pendingIndexes.value = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    gridListRef,
    () => ({
      reset,
    }),
    [reset],
  );

  //  useAnimatedReaction is a kind of "useEffect" for reanimated values
  //  It will run the callback function when the returned value from the first argument changes
  //  The second argument is the callback function
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
        // runOnJS is a helper function from reanimated that allows us to run a JS function
        // asynchronously from the UI thread.
        runOnJS(onSelectionChange)(updatedActiveIndexes);
      }
    },
  );

  const initialSelectedIndex = useSharedValue<number | null>(null);

  const toggleIndex = useCallback((index: number) => {
    'worklet';
    if (currentActiveIndexes.value.includes(index)) {
      currentActiveIndexes.value = currentActiveIndexes.value.filter(
        i => i !== index,
      );
    } else {
      currentActiveIndexes.value = [...currentActiveIndexes.value, index];
    }

    pendingIndexes.value = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panGesture = Gesture.Pan()
    .onBegin(event => {
      // Setup the initialSelectedIndex value
      initialSelectedIndex.value = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value, // we need to add the contentOffsetY because the grid is scrollable
      });
    })
    .onUpdate(event => {
      // If the initialSelectedIndex is null, it means that the user has not started the gesture
      if (initialSelectedIndex.value == null) return;

      const pendingFinalIndex = calculateGridItemPosition({
        x: event.x,
        y: event.y + contentOffsetY.value,
      });

      pendingIndexes.value = generateNumbersInRange(
        initialSelectedIndex.value,
        pendingFinalIndex,
      );
      currentActiveIndexes.value = currentActiveIndexes.value.filter(
        index => !pendingIndexes.value.includes(index),
      );

      // Handling scroll when the user drags the item to the top or bottom of the screen
      const lowerBound = contentOffsetY.value + itemSize;
      const upperBound = lowerBound + containerHeight - 2 * itemSize;

      // Not sure if this is the best way to name it
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

      pendingIndexes.value = generateNumbersInRange(
        initialSelectedIndex.value,
        finalIndex,
      );

      // If the user has only selected one item, we toggle it
      if (pendingIndexes.value.length === 1) {
        const index = pendingIndexes.value[0]!;
        toggleIndex(index);
        return;
      }

      currentActiveIndexes.value = [
        ...new Set([...currentActiveIndexes.value, ...pendingIndexes.value]),
      ];
    })
    .onFinalize(() => {
      pendingIndexes.value = [];
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

  return (
    <GestureDetector gesture={gesture}>
      <Animated.FlatList<T>
        {...rest}
        ref={flatListRef}
        scrollEventThrottle={16}
        onScroll={event => {
          contentOffsetY.value = event.nativeEvent.contentOffset.y;
          return rest?.onScroll?.(event);
        }}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
      />
    </GestureDetector>
  );
}

export { SelectableGridList };
