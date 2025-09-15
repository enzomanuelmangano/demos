import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions, useTheme } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import constants and custom hooks
import { ScreenNames } from '../../constants/screens';

// Get the screen height and define constants for small devices and bottom bar height
export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;
export const BOTTOM_BAR_HEIGHT = IS_SMALL_DEVICE ? 80 : 95;

// Map screen keys to their corresponding index for tab bar items
const screensMap = Object.keys(ScreenNames).reduce((acc, key, index) => {
  return {
    ...acc,
    [index]: key,
  };
}, {}) as Record<number, keyof typeof ScreenNames>;

// Define the BottomTabBar component
const BottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  // Define shared animated values for tracking focused index and floating button progress
  const focusedIndex = useSharedValue(state.index);

  const currentIndex = state.index;

  const { colors } = useTheme();

  // Callback function to handle tap on a tab bar icon
  const onTapIcon = useCallback(
    (selectedIndex: keyof typeof screensMap) => {
      const nextScreen = screensMap[selectedIndex];

      // Check if the route is changing
      const isChangingRoute = currentIndex !== selectedIndex;

      // Set the bottom floating button state based on the next screen

      // Get the number of screens to pop if the selected screen is already focused
      const popsAmount = navigation.getState().routes.find(item => {
        return item.name === nextScreen;
      })?.state?.index;

      // If not changing route and there are screens to pop, perform a pop action
      if (!isChangingRoute && popsAmount !== 0 && Boolean(popsAmount)) {
        const popAction = StackActions.pop(popsAmount);

        navigation.dispatch(popAction);
        return;
      }

      // Navigate to the next screen
      navigation.navigate(nextScreen);
      return;
    },
    [currentIndex, navigation],
  );

  // Get safe area insets for bottom padding
  const { bottom: safeBottom } = useSafeAreaInsets();

  // Render the BottomTabBar component
  return (
    <>
      {/* Animated View representing the tab bar */}
      <Animated.View
        style={[
          localStyles.container,
          {
            backgroundColor: colors.card,
            paddingBottom: safeBottom / 2,
          },
        ]}>
        {/* Render tab bar items */}
        {Object.keys(ScreenNames).map((key, index) => {
          return (
            <TabBarItem
              key={key}
              iconName={key}
              focusedIndex={focusedIndex}
              index={index}
              onPress={() => {
                onTapIcon(index);
                focusedIndex.value = index;
              }}
            />
          );
        })}
      </Animated.View>
    </>
  );
};

// Define the TabBarItem component
type TabBarItemProps = {
  children?: React.ReactNode;
  onPress: () => void;
  focusedIndex: SharedValue<number>;
  index: number;
  iconName: string;
};

// React.memo for performance optimization (to prevent unnecessary re-renders)
const TabBarItem: React.FC<TabBarItemProps> = React.memo(
  ({ onPress, focusedIndex, index, iconName }) => {
    const theme = useTheme();

    // Derive the focus state from the shared animated value
    const isFocused = useDerivedValue(() => {
      return focusedIndex.value === index;
    }, [index]);

    // Define the animated style for fading in/out the tab bar icon
    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isFocused.value ? 1 : 0.3),
      };
    }, []);

    // Render the individual tab bar item
    return (
      <Animated.View style={[localStyles.fill, rStyle]}>
        <TouchableOpacity style={localStyles.fillCenter} onPress={onPress}>
          <MaterialIcons
            // Render the appropriate icon based on the iconName prop
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            name={iconName.toLowerCase()}
            size={28}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

// Define local styles
const localStyles = StyleSheet.create({
  container: {
    height: BOTTOM_BAR_HEIGHT,
    flexDirection: 'row',
  },
  fill: {
    flex: 1,
  },
  fillCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

// Export the BottomTabBar component for usage in other components
export { BottomTabBar };
