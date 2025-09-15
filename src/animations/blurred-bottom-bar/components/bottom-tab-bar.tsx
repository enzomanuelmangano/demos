import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenNames } from '../constants/screens';
import {
  BOTTOM_BAR_HEIGHT,
  useSafeBottomBarHeight,
} from '../hooks/use-bottom-bar-height';

import { TabBarItem } from './tab-bar-item';

// Get the screen height and define constants for small devices and bottom bar height
export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const IS_SMALL_DEVICE = SCREEN_HEIGHT < 700;

export const LINEAR_GRADIENT_COLORS = [
  'rgba(255,255,255,0)',
  'rgba(0,0,0,0.1)',
  'rgba(0,0,0,0.5)',
  'rgba(0,0,0,0.8)',
] as const;

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

  const bottomBarSafeHeight = useSafeBottomBarHeight();

  // Render the BottomTabBar component
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={LINEAR_GRADIENT_COLORS}
        style={[
          {
            height: bottomBarSafeHeight,
          },
          localStyles.gradientContainer,
        ]}
      />
      {/* Animated View representing the tab bar */}
      <View
        style={[
          localStyles.bottomContainer,
          {
            bottom: safeBottom + 15,
            height: BOTTOM_BAR_HEIGHT,
          },
        ]}>
        <BlurView
          intensity={Platform.OS === 'android' ? 20 : 40}
          style={[
            localStyles.container,
            {
              backgroundColor: 'rgba(255,255,255,0.05)',
              flex: 1,
            },
          ]}>
          {/* Render tab bar items */}
          {Object.keys(ScreenNames).map((key, index) => {
            return (
              <TabBarItem
                key={key}
                screenName={key}
                focusedIndex={focusedIndex}
                index={index}
                onPress={() => {
                  onTapIcon(index);
                  focusedIndex.value = index;
                }}
              />
            );
          })}
        </BlurView>
      </View>
    </>
  );
};

// Define local styles
const localStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 15,
  },
  gradientContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomContainer: {
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    left: '15%',
    right: '15%',
    borderWidth: 1,
    borderColor: 'rgb(216, 216, 216)',
    position: 'absolute',
  },
});

// Export the BottomTabBar component for usage in other components
export { BottomTabBar };
