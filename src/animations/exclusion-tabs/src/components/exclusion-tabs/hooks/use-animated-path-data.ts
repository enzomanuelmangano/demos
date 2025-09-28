import { rect, rrect, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, withTiming } from 'react-native-reanimated';

import { useBoxWidths } from './use-text-widths';

// This hook is shared between the ExclusionTabBox and ExclusionTabText components.
// It manages the animation of the path and its associated values.
// A lot of very small things are happening here, so let's break it down:
// - The hook creates an animated Skia path for the current tab's rounded rectangle.
// - The path is constructed based on the current tab's index, width, and padding.
// - The path is updated whenever the active tab changes.
// - The hook returns the animated values and the path for use in components.

export const useAnimatedPathData = ({
  tabs,
  activeTabIndex,
  index,
  pathHeight,
  internalBoxPadding,
  horizontalTabsPadding,
}: {
  tabs: readonly string[];
  activeTabIndex: number;
  index: number;
  pathHeight: number;
  internalBoxPadding: number;
  horizontalTabsPadding: number;
}) => {
  const isActiveTab = index === activeTabIndex;

  const borderRadius = useDerivedValue(
    () => withTiming(isActiveTab ? 12 : 0),
    [isActiveTab],
  );

  const translateX = useDerivedValue(() => {
    if (index >= activeTabIndex + 1) {
      return 10;
    }
    if (index <= activeTabIndex - 1) {
      return -10;
    }
    return 0;
  }, [activeTabIndex, index]);

  const animatedTranslateX = useDerivedValue(() => {
    return withTiming(translateX.value);
  }, [translateX]);

  const { textWidths, getPreviousBoxWidth } = useBoxWidths({
    tabs,
    internalBoxPadding,
  });

  const skPath = useDerivedValue(() => {
    const path = Skia.Path.Make();

    path.addRRect(
      rrect(
        rect(
          getPreviousBoxWidth(index) +
            animatedTranslateX.value +
            horizontalTabsPadding,
          0,
          textWidths[index] + internalBoxPadding * 2,
          pathHeight,
        ),
        borderRadius.value,
        borderRadius.value,
      ),
    );

    return path;
  }, [borderRadius, pathHeight, index]);

  return {
    skPath,
  };
};
