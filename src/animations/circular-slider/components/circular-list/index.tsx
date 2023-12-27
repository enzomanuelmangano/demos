import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { CircularListItem, LIST_ITEM_WIDTH } from './list-item';

// Define the props type for the CircularList component
type CircularListProps = {
  data: string[];
  scaleEnabled?: boolean;
};

// CircularList component definition
const CircularList: React.FC<CircularListProps> = ({ data, scaleEnabled }) => {
  // Create a shared value to keep track of the content offset
  const contentOffset = useSharedValue(0);

  return (
    // Animated.FlatList renders the circular list
    <Animated.FlatList
      // Snap each item to the width of a list item
      snapToInterval={LIST_ITEM_WIDTH}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
      // Enable paging for smooth snapping
      pagingEnabled
      contentContainerStyle={styles.listContent}
      horizontal
      data={data}
      // Throttle scroll events to every 16ms for smoother performance
      scrollEventThrottle={16}
      // Listen to scroll events to update the content offset shared value
      onScroll={event => {
        // Update the shared value with the current content offset
        contentOffset.value = event.nativeEvent.contentOffset.x;
      }}
      renderItem={({ index }) => (
        <CircularListItem
          imageUri={data[index]}
          scaleEnabled={scaleEnabled}
          index={index}
          contentOffset={contentOffset}
        />
      )}
      // Generate unique keys for each item
      keyExtractor={(_, index) => index.toString()}
    />
  );
};

// Styles for the CircularList component
const styles = StyleSheet.create({
  // Position the list absolutely at the bottom
  list: {
    position: 'absolute',
    bottom: 0,
    // Height is set to accommodate three list items
    height: LIST_ITEM_WIDTH * 3,
    left: 0,
    right: 0,
  },
  // Center the list content and add padding for circular movement illusion
  listContent: {
    justifyContent: 'center',
    alignItems: 'center',
    // Add padding to the left and right to accommodate space for three list items
    paddingRight: LIST_ITEM_WIDTH * 3,
  },
});

// Export the CircularList component
export { CircularList };
