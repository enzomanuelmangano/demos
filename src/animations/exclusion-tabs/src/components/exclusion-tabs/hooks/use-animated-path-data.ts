import { useDerivedValue, withTiming } from 'react-native-reanimated';
import { rect, rrect, Skia } from '@shopify/react-native-skia';

import { useBoxWidths } from './use-text-widths';

// This hook is shared between the ExclusionTabBox and ExclusionTabText components.
// It manages the animation of the path and its associated values.
// A lot of very small things are happening here, so let's break it down:
// - The hook creates an animated Skia path for the current tab's rounded rectangle.
// - The path is constructed based on the current tab's index, width, and padding.
// - The path is updated whenever the active tab changes.
// - The hook returns the animated values and the path for use in components.

export const useAnimatedPathData = ({
  tabs, // Array of tab labels.
  activeTabIndex, // Index of the currently active tab.
  index, // Index of the current tab.
  pathHeight, // Height of the animated path.
  internalBoxPadding, // Padding within the box containing the text.
  horizontalTabsPadding, // Padding between the tabs and the path.
}: {
  tabs: readonly string[]; // Tab labels, read-only.
  activeTabIndex: number; // Active tab index.
  index: number; // Index of the current tab.
  pathHeight: number; // Path height for the animated tab.
  internalBoxPadding: number; // Padding inside the tab box.
  horizontalTabsPadding: number; // Horizontal padding for tabs.
}) => {
  // Check if the current tab is the active tab.
  const isActiveTab = index === activeTabIndex;

  // Animated border radius: smooth transition to 12 when active, 0 otherwise.
  const borderRadius = useDerivedValue(
    () => withTiming(isActiveTab ? 12 : 0), // Animates the border radius based on the active state.
    [isActiveTab], // Re-runs whenever the active tab changes.
  );

  // Handle horizontal translation of tabs: add subtle offsets for non-active tabs.
  const translateX = useDerivedValue(() => {
    if (index >= activeTabIndex + 1) {
      return 10; // Offset to the right for tabs after the active one.
    }
    if (index <= activeTabIndex - 1) {
      return -10; // Offset to the left for tabs before the active one.
    }
    return 0; // No offset for the active tab.
  }, [activeTabIndex, index]);

  // Smooth animation for horizontal translation using `withTiming`.
  const animatedTranslateX = useDerivedValue(() => {
    return withTiming(translateX.value); // Apply a smooth timing transition to the translateX value.
  }, [translateX]);

  const {
    textWidths, // Width of each tab's text.
    getPreviousBoxWidth, // Accumulated width of all previous
  } = useBoxWidths({
    tabs, // Array of tab labels.
    internalBoxPadding, // Padding inside the tab box.
  });

  // Create an animated Skia path for the current tab's rounded rectangle.
  const skPath = useDerivedValue(() => {
    const path = Skia.Path.Make(); // Create a new Skia path object.

    // Add a rounded rectangle (rrect) to the path for the current tab.
    path.addRRect(
      rrect(
        rect(
          getPreviousBoxWidth(index) +
            animatedTranslateX.value +
            horizontalTabsPadding, // x-coordinate with animation and padding.
          0, // y-coordinate.
          textWidths[index] + internalBoxPadding * 2, // Width of the rectangle, accounting for text and padding.
          pathHeight, // Height of the rectangle (constant for all tabs).
        ),
        borderRadius.value, // Animated border radius.
        borderRadius.value, // Same radius for both x and y directions.
      ),
    );

    return path; // Return the animated path.
  }, [borderRadius, pathHeight, index]);

  // Return the animated values and the path for use in components.
  return {
    skPath, // The animated Skia path for the current tab.
  };
};
