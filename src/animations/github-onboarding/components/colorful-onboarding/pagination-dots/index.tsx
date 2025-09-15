// Import necessary modules and types from React and React Native libraries.
import React from 'react';
import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

// Importing PaginationDot component from local files.
import { PaginationDot } from './pagination-dots';

// Define the props type for the PaginationDots component.
export interface PaginationDotsProps extends ViewProps {
  count: number; // Total number of dots
  progress: SharedValue<number>; // Current progress value (which dot is active)
  onDotPress?: (index: number) => void; // Optional callback for dot press events
  reversed?: boolean; // Optional prop to reverse the order of dots
}

// Define the PaginationDots component.
export function PaginationDots({
  count,
  progress,
  onDotPress,
  style,
  reversed,
  ...props
}: PaginationDotsProps): React.ReactElement {
  // Calculate the effective progress based on the 'reversed' prop.
  const effectiveProgress = useDerivedValue(() => {
    return reversed ? count - 1 - progress.value : progress.value;
  }, [reversed, count]);

  // Render the PaginationDots component.
  return (
    <View style={[styles.container, style]} {...props}>
      {
        // Generate an array of 'count' dots and render each dot.
        Array(count)
          .fill(0)
          .map((_, index) => (
            <React.Fragment key={index}>
              <PaginationDot
                count={count}
                index={index}
                progress={effectiveProgress}
                onPress={onDotPress}
                key={index}
              />
            </React.Fragment>
          ))
      }
    </View>
  );
}

// Define the styles for this component.
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', // Arrange dots in a row.
    alignItems: 'center', // Center-align dots vertically.
    justifyContent: 'center', // Center-align dots horizontally.
  },
});
