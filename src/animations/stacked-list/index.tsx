import { Dimensions, StyleSheet, View } from 'react-native';

import { useMemo } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

// Constants for list item height, margin, and additional measurements
const ListItemHeight = 100;
const Margin = 10;
const FullListItemHeight = ListItemHeight + Margin;

// Array representing items in the list
const Items = new Array(50).fill(0);

// Calculating total list height based on the number of items
const ListHeight = FullListItemHeight * Items.length;

// Constants for list margin top and a nice offset
const ListMarginTop = 70;

// Honestly, I didn't know how to name this constant :)
// But it's just a simple offset to make the animation looks nicer
// Feel free to change it to see the difference
const NiceOffset = 80;

// visibleAmount at which the (extended) opacity reaches 1:
// 0.7 at FullListItemHeight, +0.3 per 2/3 * FullListItemHeight
const FullyVisibleAmount = FullListItemHeight + (FullListItemHeight * 2) / 3;

// Used while an item is invisible (opacity <= 0). Its transform doesn't
// matter then; a constant object lets Reanimated skip the update.
const HiddenStyle = {
  opacity: 0,
  transform: [{ translateY: 0 }, { scale: 0.6 }],
};

// Get screen dimensions
const { height: ScreenHeight, width: ScreenWidth } = Dimensions.get('window');

// Define the props for each list item
type ListItemProps = {
  index: number;
  scrollOffset: SharedValue<number>;
};

// Functional component representing each item in the list
const ListItem: React.FC<ListItemProps> = ({ index, scrollOffset }) => {
  // Calculate base translateY for the item
  const baseTranslateY = index * FullListItemHeight;

  // Calculate item width and spacing
  const itemWidth = ScreenWidth * 0.95;
  const itemSpacing = (ScreenWidth - itemWidth) / 2;

  // This indicates the bottom threshold for the item to disappear/rescale
  // Basically the point where I'm expecting the animation to start
  const BottomThreshold = ScreenHeight - ListMarginTop - NiceOffset;

  // Once an item is far enough above the stack, every value is clamped
  // (opacity >= 1): reusing the same object lets Reanimated skip the update.
  const fullyVisibleStyle = useMemo(
    () => ({
      opacity: 1,
      transform: [{ translateY: baseTranslateY }, { scale: 1 }],
    }),
    [baseTranslateY],
  );

  // Animated style for the item.
  // Everything is computed in this single worklet (instead of three derived
  // values + the style) to run 1 mapper per item per frame instead of 4.
  const rContainerStyle = useAnimatedStyle(() => {
    // This calculates the visible amount of an item on the screen based on its position and the scroll offset.
    // Calculate the distance between the top of the item and the bottom of the screen after scrolling
    const distanceFromTop =
      scrollOffset.get() + BottomThreshold - baseTranslateY;

    // Map the distance to the visible amount within the range of [0, FullListItemHeight]
    // If the item is fully visible, the output will be FullListItemHeight, otherwise, it will be less.

    // Theoretically, this could have been done much easier with the clamp function
    // return clamp(distanceFromTop, -FullListItemHeight, FullListItemHeight); (i.e)
    // But I don't want just to clamp values between 0 and FullListItemHeight
    // I want values to get a negative amount based on the distance from the item and the ScreenHeight
    // The point is that I'm going to use this value to evaluate the opacity and I want that the opacity
    // decreases when the item is going to disappear from the screen
    const visibleAmount = interpolate(
      distanceFromTop,
      [0, FullListItemHeight], // Input range: [0, FullListItemHeight]
      [0, FullListItemHeight], // Output range: [0, FullListItemHeight]
      // You can set .CLAMP to see the difference
      Extrapolation.EXTEND, // Extrapolate values outside the input range
    );

    // Opacity reaches 0 at -FullListItemHeight: the item is invisible
    if (visibleAmount <= -FullListItemHeight) return HiddenStyle;
    // Opacity reaches 1 at FullListItemHeight + 73.3: nothing changes anymore
    if (visibleAmount >= FullyVisibleAmount) return fullyVisibleStyle;

    // The real translateY of the item
    const realTranslateY = interpolate(
      visibleAmount,
      [0, FullListItemHeight],
      [
        scrollOffset.get() + BottomThreshold - FullListItemHeight,
        baseTranslateY,
      ],
      Extrapolation.CLAMP,
    );

    // The scale of the item
    const scale = interpolate(
      visibleAmount,
      [0, FullListItemHeight],
      [0.6, 1],
      Extrapolation.CLAMP,
    );

    return {
      opacity: interpolate(
        visibleAmount,
        [0, FullListItemHeight / 3, FullListItemHeight],
        // The opacity will be 0.7 when the item is fully visible
        // That's why I'm multiplying the "NiceOffset" by 1.5 (look at the FlatList contentContainerStyle)
        // So why am I setting the opacity to 0.7 when the item is fully visible?
        // Just because it's easier to appreciate the stacked animation on the bottom
        [0.3, 0.4, 0.7],
        Extrapolation.EXTEND,
      ),
      transform: [
        {
          translateY: realTranslateY,
        },
        {
          scale: scale,
        },
      ],
    };
  }, [fullyVisibleStyle]);

  // Render the item
  return (
    <Animated.View
      style={[
        {
          height: ListItemHeight,
          backgroundColor: '#51ACCC',
          width: itemWidth,
          left: itemSpacing,
          position: 'absolute',
          top: 0,
          borderRadius: 15,
          borderCurve: 'continuous',
          zIndex: -index,
        },
        rContainerStyle,
      ]}
    />
  );
};

// Main application component
export const StackedList = () => {
  const scrollOffset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.set(event.contentOffset.y);
    },
  });

  // Render the app
  return (
    <View style={styles.container}>
      <Animated.FlatList
        onScroll={onScroll}
        data={Items}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{
          marginTop: ListMarginTop,
          // We're telling to the list the proper height since the items have absolute position
          // This is important to avoid the list to be cut off
          // The height is calculated based on the number of items and the height of each item
          // In theory we shouldn't need to multiply the "NiceOffset" by 1.5
          // I'm doing that because the opacity will be 0.7 when the item is fully visible and I want to see the last item
          height: ListHeight + ListMarginTop + NiceOffset * 1.5,
        }}
        renderItem={({ index }) => (
          <ListItem index={index} scrollOffset={scrollOffset} />
        )}
        keyExtractor={(_, index) => index.toString()}
      />
    </View>
  );
};

// Styles for the main application component
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
});
