import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { BOTTOM_BAR_HEIGHT } from '../../components/bottom-tab-bar';
import { useActiveTabBarContext } from '../../components/bottom-tab-bar/active-tab-bar-provider';
import { useTheme } from '../../components/theme-provider';

const HomeScreen = () => {
  // Get the 'isActive' value from the active tab bar context
  const { isActive } = useActiveTabBarContext();
  const { colors } = useTheme();

  // Create a shared value for storing the previous scroll offset
  const prevContentOffsetY = useSharedValue(0);

  // Scroll handler to respond to scroll events
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      // Calculate positive scroll offsets to prevent negative values
      const positiveOffsetY = Math.max(event.contentOffset.y, 0);
      const positivePrevOffsetY = Math.max(prevContentOffsetY.value, 0);

      // Check the scroll direction (upwards or downwards)
      const isScrollingUp = positivePrevOffsetY - positiveOffsetY >= 0;

      // Update the 'isActive' value based on the scroll direction
      isActive.value = isScrollingUp;

      // Update the previous scroll offset with the current offset
      prevContentOffsetY.value = event.contentOffset.y;
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Animated FlatList to handle scrolling */}
      <Animated.FlatList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: BOTTOM_BAR_HEIGHT, // Add padding for the bottom tab bar
        }}
        data={new Array(50).fill(0)} // Dummy data for FlatList
        renderItem={() => (
          <View style={[styles.listItem, { borderColor: colors.border }]} />
        )} // Render list items
      />
    </View>
  );
};

// Styles for the HomeScreen component
const styles = StyleSheet.create({
  container: {
    flex: 1, // Take up the entire available space
  },
  listItem: {
    height: 100, // Set the height of each list item
    borderBottomWidth: 1, // Add a bottom border to each list item
  },
});

// Export the HomeScreen component
export { HomeScreen };
