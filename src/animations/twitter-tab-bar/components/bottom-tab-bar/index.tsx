import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenNames } from '../../constants/screens';
import { useTheme } from '../theme-provider';

import { useActiveTabBarContext } from './active-tab-bar-provider';
import { BottomFloatingButton } from './floating-button';

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

// Define custom props interface
interface CustomBottomTabBarProps {
  activeTabIndex: number;
  onTabPress: (tabName: string) => void;
}

// Define the BottomTabBar component
const BottomTabBar: React.FC<CustomBottomTabBarProps> = ({
  activeTabIndex,
  onTabPress,
}) => {
  // Define shared animated values for tracking focused index and floating button progress
  const focusedIndex = useSharedValue(activeTabIndex);
  const { isActive } = useActiveTabBarContext();
  const { colors } = useTheme();
  const floatingProgress = useSharedValue(0);

  // Update focusedIndex when activeTabIndex changes
  useEffect(() => {
    focusedIndex.value = activeTabIndex;
  }, [activeTabIndex, focusedIndex]);

  // Callback function to handle tap on a tab bar icon
  const onTapIcon = useCallback(
    (selectedIndex: keyof typeof screensMap) => {
      const nextScreen = screensMap[selectedIndex];

      // Set the bottom floating button state based on the next screen
      isActive.value = true;
      if (nextScreen === 'Message') {
        floatingProgress.value = withTiming(1, {
          duration: 500,
        });
      } else {
        floatingProgress.value = withTiming(0, {
          duration: 500,
        });
      }

      // Navigate to the next screen
      onTabPress(nextScreen);
    },
    [floatingProgress, isActive, onTabPress],
  );

  // Get safe area insets for bottom padding
  const { bottom: safeBottom } = useSafeAreaInsets();

  // Define the animated style for the tab bar container
  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withTiming(
            isActive.value ? 0 : BOTTOM_BAR_HEIGHT + safeBottom,
            {
              duration: 300,
            },
          ),
        },
      ],
    };
  }, [safeBottom]);

  // Define the animated style for the floating action button
  const rFloatingActionStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isActive.value ? 1 : 0, {
            overshootClamping: true,
          }),
        },
      ],
    };
  }, []);

  // Render the BottomTabBar component
  return (
    <>
      {/* Floating action button */}
      <BottomFloatingButton
        onSelect={item => {
          console.log({ item });
        }}
        style={[
          {
            position: 'absolute',
            bottom: BOTTOM_BAR_HEIGHT + safeBottom / 2,
            right: 16,
            height: 64,
            aspectRatio: 1,
            backgroundColor: colors.primary,
            borderRadius: 32,
          },
          rFloatingActionStyle,
        ]}
        progress={floatingProgress}
      />

      {/* Animated View representing the tab bar */}
      <Animated.View
        style={[
          localStyles.container,
          {
            backgroundColor: colors.card,
            paddingBottom: safeBottom / 2,
          },
          rContainerStyle,
        ]}>
        {/* Render tab bar items */}
        {Object.keys(ScreenNames).map((key, index) => {
          return (
            <TabBarItem
              key={key}
              iconName={key}
              focusedIndex={focusedIndex}
              index={index}
              textColor={colors.text}
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
  textColor: string;
};

// React.memo for performance optimization (to prevent unnecessary re-renders)
const TabBarItem: React.FC<TabBarItemProps> = React.memo(
  ({ onPress, focusedIndex, index, iconName, textColor }) => {
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
            color={textColor}
          />
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

// Define local styles
const localStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    height: BOTTOM_BAR_HEIGHT,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  fill: {
    flex: 1,
  },
  fillCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

// Export the BottomTabBar component for usage in other components
export { BottomTabBar };
