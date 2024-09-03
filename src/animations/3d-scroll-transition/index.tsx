// Import necessary components and libraries from React Native and Reanimated
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import React, { useCallback, useMemo } from 'react';

// Import the BlurredListItem component
import { BlurredListItem } from './components/blurred-list-item';

// Generate an array of numbers to be displayed in the list
const NUMBERS_ARRAY = new Array(100)
  .fill(0)
  .map((_, i) => i.toString())
  .reverse();

// Define the main App component
export const ScrollTransition3D = React.memo(() => {
  // Get window dimensions
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Shared animated value for scroll position
  const scrollY = useSharedValue(0);

  // Animated scroll handler
  // This is tremendously more efficient than using the default onScroll prop
  // Combining the useAnimatedScrollHandler with the Animated.FlatList's onScroll prop
  // is one of the most useful and efficient ways to handle scroll events 💥
  // Because everything happens on the native thread
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      'worklet';
      // Update the scroll position value
      scrollY.value = event.contentOffset.y;
    },
  });

  // Calculate the size of each list item
  const itemSize = windowWidth * 0.55;

  // Style for the content container of the FlatList
  const contentContainerStyle = useMemo(() => {
    return {
      // Center the content vertically
      paddingVertical: windowHeight / 2 - itemSize / 2,
    };
  }, [itemSize, windowHeight]);

  // Function to get the layout information for list items
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: itemSize,
      offset: itemSize * index,
      index,
    }),
    [itemSize],
  );

  // Render the main component
  return (
    <View style={styles.container}>
      {/* StatusBar component */}
      <StatusBar style="light" />
      {/* Animated FlatList */}
      <Animated.FlatList
        inverted // Invert the list to start from bottom
        contentContainerStyle={contentContainerStyle} // Apply the content container style
        onScroll={onScroll} // Assign the scroll handler
        data={NUMBERS_ARRAY} // Provide the data for the list
        getItemLayout={getItemLayout} // Assign the item layout function
        // Without this prop, the list will be a bit janky (that's the secret ingredient! 🤫)
        windowSize={2} // Number of offscreen elements to render
        snapToInterval={itemSize} // Snap list items to specified interval
        decelerationRate={'fast'}
        renderItem={({ item, index }) => (
          // Render each list item using BlurredListItem component
          <BlurredListItem
            text={item} // Pass the item text
            size={itemSize} // Pass the item size
            index={index} // Pass the item index
            scrollY={scrollY} // Pass the scroll position value
          />
        )}
      />
    </View>
  );
});

// Styles for the main container
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Black background color
    alignItems: 'center',
    justifyContent: 'center',
  },
});
