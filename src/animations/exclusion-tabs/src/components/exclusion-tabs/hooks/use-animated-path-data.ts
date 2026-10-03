import { useDerivedValue, withTiming } from 'react-native-reanimated';
import { rect, rrect, Skia } from 'react-native-skia';

import { useBoxWidths } from './use-text-widths';

// This hook is shared between the ExclusionTabBox and ExclusionTabText components.
// It manages the animation of the path and its associated values.
// A lot of very small things are happening here, so let's break it down:
// - The hook creates an animated Skia path for the current tab's rounded rectangle.
// - The path is constructed based on the current tab's index, width, and padding.
// - The path is updated whenever the active tab changes.
// - The hook returns the animated values and the path for use in components.

// The animated x of the tab's box. The text only needs this value, so it
// uses this hook instead of building (and measuring) its own copy of the path.
export const useAnimatedBoxX = ({
  tabs,
  activeTabIndex,
  index,
  internalBoxPadding,
  horizontalTabsPadding,
}: {
  tabs: readonly string[];
  activeTabIndex: number;
  index: number;
  internalBoxPadding: number;
  horizontalTabsPadding: number;
}) => {
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
    return withTiming(translateX.get());
  }, [translateX]);

  const { textWidths, getPreviousBoxWidth } = useBoxWidths({
    tabs,
    internalBoxPadding,
  });

  const boxX = useDerivedValue(() => {
    return (
      getPreviousBoxWidth(index) +
      animatedTranslateX.get() +
      horizontalTabsPadding
    );
  }, [index]);

  return { boxX, textWidths };
};

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

  const { boxX, textWidths } = useAnimatedBoxX({
    tabs,
    activeTabIndex,
    index,
    internalBoxPadding,
    horizontalTabsPadding,
  });

  const skPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();

    builder.addRRect(
      rrect(
        rect(
          boxX.get(),
          0,
          textWidths[index] + internalBoxPadding * 2,
          pathHeight,
        ),
        borderRadius.get(),
        borderRadius.get(),
      ),
    );

    return builder.build();
  }, [borderRadius, pathHeight, index]);

  return {
    skPath,
  };
};
