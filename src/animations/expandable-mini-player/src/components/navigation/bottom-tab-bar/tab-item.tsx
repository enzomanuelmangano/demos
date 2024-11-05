import { StyleSheet } from 'react-native';
import { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { PressableScale } from 'pressto';

import { EasingsUtils } from '../../../animations/easings';
import * as Icons from '../../../components/icons';
import { Palette } from '../../../constants/palette';

// Define the props for the TabItem component
type TabItemProps = {
  icon: string; // The name of the icon to display
  screen: string; // The screen to navigate to when the tab is pressed
  opacity?: number; // Optional opacity value for the tab item
  isActive: boolean; // Whether the tab item is active
};

// Function to capitalize the first letter of a string
const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const TabItem = ({
  icon,
  screen,
  opacity = 1,
  isActive,
}: TabItemProps) => {
  const navigation = useNavigation(); // Hook to access navigation

  // Callback function to handle press events
  const onPress = useCallback(() => {
    navigation.navigate(screen as never); // Navigate to the specified screen
  }, [screen, navigation]);

  // Capitalize the icon name to match the imported Icons
  const capitalizedIcon = capitalize(icon);
  const Icon = Icons[capitalizedIcon as keyof typeof Icons]; // Get the corresponding Icon component

  // Animated style for the tab item
  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isActive ? 0.8 * opacity : 0.2 * opacity, {
        easing: EasingsUtils.inOut,
      }), // Adjust opacity based on active status
    };
  }, [isActive, opacity]);

  return (
    <PressableScale onPress={onPress} style={[styles.fillCenter, rStyle]}>
      {/* Render the icon with the specified color */}
      <Icon color={Palette.icons} />
    </PressableScale>
  );
};

// Styles for the TabItem component
const styles = StyleSheet.create({
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
