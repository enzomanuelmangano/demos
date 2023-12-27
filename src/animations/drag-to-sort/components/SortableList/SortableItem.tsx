// Import necessary modules and components from React and React Native
import React, { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  scrollTo,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import the Positions type
import { lightHapticFeedback } from '../../utils/haptics';

import type { Positions } from './types';

// Define the props for the SortableItem component
type SortableListItemProps = {
  children?: React.ReactNode;
  itemHeight: number;
  positions: Animated.SharedValue<Positions>;
  index: number;
  animatedIndex: Animated.SharedValue<number | null>;
  onDragEnd?: (data: Positions) => void;
  backgroundItem?: React.ReactNode;
  scrollContentOffsetY: Animated.SharedValue<number>;
  scrollViewRef: React.RefObject<Animated.ScrollView>;
};

// Define the SortableItem component
const SortableItem: React.FC<SortableListItemProps> = ({
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
  // Get safe area insets and window dimensions
  const inset = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const containerHeight = windowHeight - inset.top;

  // Shared values for gesture handling
  const contextY = useSharedValue(0);
  const translateX = useSharedValue(0);

  // Shared values for tracking gesture and animation state
  const wasLastActiveIndex = useSharedValue(false);

  // Animated reaction to update last active index
  useAnimatedReaction(
    () => animatedIndex.value,
    currentActiveIndex => {
      if (currentActiveIndex) {
        wasLastActiveIndex.value = currentActiveIndex === index;
      }
    },
  );

  // Derived value to check if the gesture is active
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
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      } else if (absoluteY + scrollContentOffsetY.value >= upperBound) {
        // while scrolling to the bottom of the list
        const nextPosition = scrollContentOffsetY.value + scrollSpeed;
        scrollTo(scrollViewRef, 0, Math.max(nextPosition, 0), false);
      }
    },
    [containerHeight, itemHeight, scrollContentOffsetY.value, scrollViewRef],
  );

  // Need to keep track of the previous positions to check if the positions have changed
  // This is needed to trigger the onDragEnd callback
  const prevPositions = useSharedValue({});

  // Gesture handler for pan gestures
  const panGesture = Gesture.Pan()
    // Activate the gesture after a long press
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
      // Trigger haptic feedback if the gesture starts ✨
      runOnJS(lightHapticFeedback)();
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
        // Check if the positions have changed to trigger the onDragEnd callback
        const positionsHaveChanged = Object.entries(prevPositions.value).some(
          ([key, value]) => {
            return positions.value[+key] !== value;
          },
        );

        if (isFinished && onDragEnd && positionsHaveChanged) {
          runOnJS(onDragEnd)(positions.value);
        }
      });
      wasLastActiveIndex.value = true;
      // Reset the animated index
      animatedIndex.value = null;
    });

  // Derived value for the top position of the item
  const top = useDerivedValue(() => {
    if (isGestureActive.value) return positions.value[index];

    const nextPosition = getPosition(index);
    positions.value[index] = nextPosition;
    positions.value = Object.assign({}, positions.value);

    return withTiming(nextPosition, {
      duration: 200,
    });
  }, [itemHeight, index]);

  // Callback to get the zIndex of the item
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

  // Animated style for the item
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
      shadowOpacity: withTiming(isGestureActive.value ? 0.3 : 0),
    };
  }, []);

  // Render the SortableItem component
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

// Styles for SortableItem component
const styles = StyleSheet.create({
  backgroundItem: {
    position: 'absolute',
    right: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -50,
  },
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    shadowColor: 'black',
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },
});

// Export the SortableItem component
export { SortableItem };
