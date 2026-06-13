import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { type FC, type ReactNode, useCallback } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type AnimatedRef,
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
  scrollViewRef: AnimatedRef<Animated.ScrollView>;
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
    () => animatedIndex.get(),
    currentActiveIndex => {
      if (currentActiveIndex) {
        wasLastActiveIndex.set(currentActiveIndex === index);
      }
    },
  );

  const isGestureActive = useDerivedValue(() => {
    return animatedIndex.get() === index;
  }, [index]);

  // Callback to get the position of a list item
  // The idea is very simple here:
  // Imagine to have the positions.get() map built as follows:
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

      const itemPosition = positions.get()[itemIndex];
      const indexInOrderedPositions = Object.values(positions.get())
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
      const upperBound = scrollContentOffsetY.get() + containerHeight;

      // scroll speed is proportional to the item height (the bigger the item, the faster it scrolls)
      const scrollSpeed = itemHeight * 0.1;

      if (absoluteY <= lowerBound) {
        // while scrolling to the top of the list
        const nextPosition = scrollContentOffsetY.get() - scrollSpeed;
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      } else if (absoluteY + scrollContentOffsetY.get() >= upperBound) {
        // while scrolling to the bottom of the list
        const nextPosition = scrollContentOffsetY.get() + scrollSpeed;
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      }
    },
    [containerHeight, itemHeight, scrollContentOffsetY.get(), scrollViewRef],
  );

  // Need to keep track of the previous positions to check if the positions have changed
  // This is needed to trigger the onDragEnd callback
  const prevPositions = useSharedValue({});

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(500)
    .onStart(({ translationX }) => {
      // Store the previous positions (before the gesture starts)
      prevPositions.set(Object.assign({}, positions.get()));

      animatedIndex.set(index);
      // Keep the reference of the initialContentOffset
      // At the beginning I was missing the -scrollContentOffsetY.get().
      // But that's extremely important to handle the edge cases while scrolling
      // Notice:
      // 1. In the context we subtract the scrollContentOffsetY.get()
      // 2. In the onUpdate we add the scrollContentOffsetY.get()
      // In the common case the contribution of the scrollContentOffsetY.get() will be 0
      // But in the edge cases the scrollContentOffsetY.get() will be updated during the onUpdate
      // and that's why we need to keep track of the initialContentOffset
      // That sounds trivial but it took me a lot of time to figure it out 😅
      contextY.set(positions.get()[index] - scrollContentOffsetY.get());

      translateX.set(translationX);
      scheduleOnRN(lightHapticFeedback);
    })
    .onUpdate(({ translationY, translationX, absoluteY }) => {
      translateX.set(translationX);

      const translateY = contextY.get() + translationY;

      // Build the next positions immutably — mutating the object returned by
      // get() modifies a value already shared with the worklet runtime.
      positions.set({
        ...positions.get(),
        [index]: translateY + scrollContentOffsetY.get(),
      });

      scrollLogic({ absoluteY });
    })
    .onFinalize(() => {
      translateX.set(
        withTiming(0, undefined, isFinished => {
          const positionsHaveChanged = Object.entries(prevPositions.get()).some(
            ([key, value]) => {
              return positions.get()[+key] !== value;
            },
          );

          if (isFinished && onDragEnd && positionsHaveChanged) {
            scheduleOnRN(onDragEnd, positions.get());
          }
        }),
      );
      wasLastActiveIndex.set(true);
      animatedIndex.set(null);
    });

  const top = useDerivedValue(() => {
    if (isGestureActive.get()) return positions.get()[index];

    const nextPosition = getPosition(index);
    positions.set({ ...positions.get(), [index]: nextPosition });

    return withTiming(nextPosition, {
      duration: 200,
    });
  }, [itemHeight, index]);

  const getZIndex = useCallback(() => {
    'worklet';
    // If it's the active item, it should be on top of the other items
    if (isGestureActive.get()) return 100;

    // After we have released the item, we want to keep it on top of the other items
    // until the animation is finished.
    // This is needed to avoid flickering of the item while the animation is running :)
    if (wasLastActiveIndex.get()) return 50;

    return 0;
  }, [isGestureActive.get(), wasLastActiveIndex.get()]);

  const rStyle = useAnimatedStyle(() => {
    const zIndex = getZIndex();

    return {
      top: top.get(),
      transform: [
        {
          translateX: translateX.get(),
        },
      ],
      zIndex: zIndex,
      borderRadius: withTiming(isGestureActive.get() ? 20 : 0, {
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
          testID={`drag-to-sort-item-${index}`}
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
