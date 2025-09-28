import { Dimensions, StyleSheet, View } from 'react-native';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useScrollViewOffset,
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

  // This function calculates the visible amount of an item on the screen based on its position and the scroll offset.
  // It utilizes the interpolate function from Reanimated to map the input range to the output range
  const visibleAmount = useDerivedValue(() => {
    // Calculate the distance between the top of the item and the bottom of the screen after scrolling

    const distanceFromTop =
      scrollOffset.value + BottomThreshold - baseTranslateY;

    // Map the distance to the visible amount within the range of [0, FullListItemHeight]
    // If the item is fully visible, the output will be FullListItemHeight, otherwise, it will be less.

    // Theoretically, this could have been done much easier with the clamp function
    // return clamp(distanceFromTop, -FullListItemHeight, FullListItemHeight); (i.e)
    // But I don't want just to clamp values between 0 and FullListItemHeight
    // I want values to get a negative amount based on the distance from the item and the ScreenHeight
    // The point is that I'm going to use this value to evaluate the opacity and I want that the opacity
    // decreases when the item is going to disappear from the screen

    return interpolate(
      distanceFromTop,
      [0, FullListItemHeight], // Input range: [0, FullListItemHeight]
      [0, FullListItemHeight], // Output range: [0, FullListItemHeight]
      // You can set .CLAMP to see the difference
      Extrapolation.EXTEND, // Extrapolate values outside the input range
    );
  }, []);

  // Derived value for the real translateY of the item
  const realTranslateY = useDerivedValue(() => {
    return interpolate(
      visibleAmount.value,
      [0, FullListItemHeight],
      [
        scrollOffset.value + BottomThreshold - FullListItemHeight,
        baseTranslateY,
      ],
      Extrapolation.CLAMP,
    );
  }, []);

  // Derived value for the scale of the item
  const scale = useDerivedValue(() => {
    return interpolate(
      visibleAmount.value,
      [0, FullListItemHeight],
      [0.6, 1],
      Extrapolation.CLAMP,
    );
  }, [baseTranslateY]);

  // Animated style for the item
  const rContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        visibleAmount.value,
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
          translateY: realTranslateY.value,
        },
        {
          scale: scale.value,
        },
      ],
    };
  }, []);

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
  // Reference for animated flat list
  const scrollAnimatedRef = useAnimatedRef<Animated.FlatList<number>>();

  // Get scroll offset
  // Note: Casting to any because TypeScript does not provide consistent types for useScrollViewOffset
  // This useScrollViewOffset is a magical hook provided by Reanimated that returns the scroll offset of a ScrollView/FlatList
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrollOffset = useScrollViewOffset(scrollAnimatedRef as any);

  // Render the app
  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={scrollAnimatedRef}
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
