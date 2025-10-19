import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { type FC, type ReactNode, type RefObject, useCallback } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { lightHapticFeedback } from '../../utils/haptics';

import type { Positions } from './types';

type SortableListItemProps = {
  children?: ReactNode;
  itemHeight: number;
  positions: SharedValue<Positions>;
  index: number;
  animatedIndex: SharedValue<number | null>;
  onDragEnd?: (data: Positions) => void;
  backgroundItem?: ReactNode;
  scrollContentOffsetY: SharedValue<number>;
  scrollViewRef: RefObject<Animated.ScrollView | null>;
};

const SortableItem: FC<SortableListItemProps> = ({
  children,
  itemHeight,
  positions,
  index,
  animatedIndex,
  onDragEnd,
  backgroundItem,
  scrollContentOffsetY,
  scrollViewRef,
}) => {
  const inset = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const containerHeight = windowHeight - inset.top;

  const contextY = useSharedValue(0);
  const translateX = useSharedValue(0);

  const wasLastActiveIndex = useSharedValue(false);

  useAnimatedReaction(
    () => animatedIndex.value,
    currentActiveIndex => {
      if (currentActiveIndex) {
        wasLastActiveIndex.value = currentActiveIndex === index;
      }
    },
  );

  const isGestureActive = useDerivedValue(() => {
    return animatedIndex.value === index;
  }, [index]);

  // Callback to get the position of a list item
  // The idea is very simple here:
  // Imagine to have the positions.value map built as follows:
  // {
  //   0: 0,
  //   1: ITEM_HEIGHT,
  //   2: ITEM_HEIGHT * 2 + 300 (translation),
  //   3: ITEM_HEIGHT * 3
  // }
  // The getPosition function will return the position of the item at the given index
  // The position of the item at the given index is calculated as follows:
  // 1. Sort the positions of the items
  // 2. Get the index of the item in the sorted array
  // 3. Multiply the index by the item height
  // This will give us the position of the item at the given index
  // This function is applied to all the items except the active one (in this case the [2] will be skipped)
  const getPosition = useCallback(
    (itemIndex: number) => {
      'worklet';

      const itemPosition = positions.value[itemIndex];
      const indexInOrderedPositions = Object.values(positions.value)
        .sort((a, b) => a - b)
        .indexOf(itemPosition);

      return indexInOrderedPositions * itemHeight;
    },
    [itemHeight, positions],
  );

  // Callback to handle edge cases while scrolling
  // (when the user drags the item to the top or bottom of the list)
  // Since we need to update the scroll position of the scroll view (scrollTo)
  const scrollLogic = useCallback(
    ({ absoluteY }: { absoluteY: number }) => {
      'worklet';
      const lowerBound = 1.5 * itemHeight;
      const upperBound = scrollContentOffsetY.value + containerHeight;

      // scroll speed is proportional to the item height (the bigger the item, the faster it scrolls)
      const scrollSpeed = itemHeight * 0.1;

      if (absoluteY <= lowerBound) {
        // while scrolling to the top of the list
        const nextPosition = scrollContentOffsetY.value - scrollSpeed;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      } else if (absoluteY + scrollContentOffsetY.value >= upperBound) {
        // while scrolling to the bottom of the list
        const nextPosition = scrollContentOffsetY.value + scrollSpeed;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      }
    },
    [containerHeight, itemHeight, scrollContentOffsetY.value, scrollViewRef],
  );

  // Need to keep track of the previous positions to check if the positions have changed
  // This is needed to trigger the onDragEnd callback
  const prevPositions = useSharedValue({});

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(500)
    .onStart(({ translationX }) => {
      // Store the previous positions (before the gesture starts)
      prevPositions.value = Object.assign({}, positions.value);

      animatedIndex.value = index;
      // Keep the reference of the initialContentOffset
      // At the beginning I was missing the -scrollContentOffsetY.value.
      // But that's extremely important to handle the edge cases while scrolling
      // Notice:
      // 1. In the context we subtract the scrollContentOffsetY.value
      // 2. In the onUpdate we add the scrollContentOffsetY.value
      // In the common case the contribution of the scrollContentOffsetY.value will be 0
      // But in the edge cases the scrollContentOffsetY.value will be updated during the onUpdate
      // and that's why we need to keep track of the initialContentOffset
      // That sounds trivial but it took me a lot of time to figure it out 😅
      contextY.value = positions.value[index] - scrollContentOffsetY.value;

      translateX.value = translationX;
      scheduleOnRN(lightHapticFeedback);
    })
    .onUpdate(({ translationY, translationX, absoluteY }) => {
      translateX.value = translationX;

      const translateY = contextY.value + translationY;

      positions.value[index] = translateY + scrollContentOffsetY.value;

      scrollLogic({ absoluteY });

      positions.value = Object.assign({}, positions.value);
    })
    .onFinalize(() => {
      translateX.value = withTiming(0, undefined, isFinished => {
        const positionsHaveChanged = Object.entries(prevPositions.value).some(
          ([key, value]) => {
            return positions.value[+key] !== value;
          },
        );

        if (isFinished && onDragEnd && positionsHaveChanged) {
          scheduleOnRN(onDragEnd, positions.value);
        }
      });
      wasLastActiveIndex.value = true;
      animatedIndex.value = null;
    });

  const top = useDerivedValue(() => {
    if (isGestureActive.value) return positions.value[index];

    const nextPosition = getPosition(index);
    positions.value[index] = nextPosition;
    positions.value = Object.assign({}, positions.value);

    return withTiming(nextPosition, {
      duration: 200,
    });
  }, [itemHeight, index]);

  const getZIndex = useCallback(() => {
    'worklet';
    // If it's the active item, it should be on top of the other items
    if (isGestureActive.value) return 100;

    // After we have released the item, we want to keep it on top of the other items
    // until the animation is finished.
    // This is needed to avoid flickering of the item while the animation is running :)
    if (wasLastActiveIndex.value) return 50;

    return 0;
  }, [isGestureActive.value, wasLastActiveIndex.value]);

  const rStyle = useAnimatedStyle(() => {
    const zIndex = getZIndex();

    return {
      top: top.value,
      transform: [
        {
          translateX: translateX.value,
        },
      ],
      zIndex: zIndex,
      borderRadius: withTiming(isGestureActive.value ? 20 : 0, {
        duration: 200,
      }),
    };
  }, []);

  return (
    <>
      <View
        style={[
          {
            top: index * itemHeight,
            height: itemHeight,
          },
          styles.backgroundItem,
        ]}>
        {backgroundItem}
      </View>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.item,
            {
              height: itemHeight,
            },
            rStyle,
          ]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
};

const styles = StyleSheet.create({
  backgroundItem: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: -50,
  },
  item: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
});

export { SortableItem };
