import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { StackedSheetType } from './context';
import { useInternalStackedSheet } from './hooks';
import { StackedSheetHandle } from './stacked-sheet-handle';

// Define the props for the StackedSheet component
type StackedSheetProps = {
  index: number;
  stackedSheet: StackedSheetType;
  onDismiss: (StackedSheetId: number) => void;
};

// Constants for StackedSheet styling

const BaseSafeArea = 50;

// Define the StackedSheet component
const StackedSheet: React.FC<StackedSheetProps> = ({
  stackedSheet,
  index,
  onDismiss,
}) => {
  // Get the width of the window using useWindowDimensions hook
  const { width: windowWidth } = useWindowDimensions();
  const { id: stackedSheetId, bottomHeight } =
    useInternalStackedSheet(stackedSheet.key) ?? 0;
  const isActiveStackedSheet = stackedSheetId === 0;

  // Shared values for animation
  // That's the "initial" position of the StackedSheet
  // After that, the StackedSheet will be animated to the bottom
  const initialBottomPosition = isActiveStackedSheet
    ? // Not an elegant way to handle the first StackedSheet.
      // Basically the purpose is that the initial position of the StackedSheet
      // should be the same as the last StackedSheet that is being dismissed
      // Except for the first StackedSheet, that should be animated from the bottom
      // of the screen (so -HideStackedSheetOffset)
      -stackedSheet.componentHeight
    : BaseSafeArea;

  const bottom = useSharedValue(initialBottomPosition);

  // Update the bottom position when the StackedSheet id changes
  // After the "mount" animation, the StackedSheet will be animated to the
  // right bottom value.
  // To be honest that's not an easy solution, but it seems to work fine
  useEffect(() => {
    bottom.value = withSpring(BaseSafeArea + bottomHeight, {
      stiffness: 100,
      mass: 1,
      overshootClamping: false,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomHeight]);

  const translateY = useSharedValue(0);
  const isSwiping = useSharedValue(false);

  // Callback to dismiss the StackedSheet with animation
  const dismissItem = useCallback(() => {
    'worklet';
    translateY.value = withSpring(
      stackedSheet.componentHeight + BaseSafeArea,
      {
        stiffness: 100,
        mass: 1,
        overshootClamping: true,
      },
      isFinished => {
        if (isFinished) {
          runOnJS(onDismiss)(stackedSheetId);
        }
      },
    );
  }, [onDismiss, stackedSheet.componentHeight, stackedSheetId, translateY]);

  // Gesture handler for swipe interactions
  const gesture = Gesture.Pan()
    .enabled(isActiveStackedSheet)
    .onBegin(() => {
      isSwiping.value = true;
    })
    .onUpdate(event => {
      // Allow swiping only to the down direction
      if (event.translationY < 0) return;
      translateY.value = event.translationY;
    })
    .onEnd(event => {
      // Dismiss the StackedSheet if swiped enough, otherwise animate back to the initial position
      if (event.translationY > -50) {
        dismissItem();
      } else {
        translateY.value = withSpring(0);
      }
    })
    .onFinalize(() => {
      isSwiping.value = false;
    });

  // Animated styles for the StackedSheet container
  const rStackedSheetStyle = useAnimatedStyle(() => {
    const scale = 1 - stackedSheetId * 0.05;

    return {
      bottom: bottom.value,
      zIndex: 100 - stackedSheetId,
      shadowRadius: withTiming(Math.max(10 - stackedSheetId * 2.5, 2)),
      shadowOpacity: withTiming(Math.max(0.1 - stackedSheetId * 0.025, 0.05)),
      transform: [
        {
          scale: withSpring(scale),
        },
        {
          translateY: translateY.value,
        },
      ],
    };
  }, [stackedSheet, stackedSheetId]);

  // Animated styles for the visible container (opacity)
  const rVisibleContainerStyle = useAnimatedStyle(() => {
    return {
      // The content of the first two StackedSheets is visible
      // The content of the other StackedSheets is hidden
      opacity: withTiming(stackedSheetId <= 1 ? 1 : 0),
    };
  }, [stackedSheetId]);

  const memoizedChildren = useMemo(() => {
    if (!stackedSheet.children) return null;
    return stackedSheet.children();
  }, [stackedSheet]);

  // Render the StackedSheet component
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        key={index}
        style={[
          {
            width: windowWidth * 0.9,
            left: windowWidth * 0.05,
            zIndex: -1,
          },
          styles.container,
          rStackedSheetStyle,
        ]}>
        {memoizedChildren && (
          <Animated.View
            style={[
              rVisibleContainerStyle,
              {
                width: windowWidth * 0.9,
                borderRadius: 35,
                borderCurve: 'continuous',
                overflow: 'hidden',
                height: stackedSheet.componentHeight,
              },
            ]}>
            <StackedSheetHandle />
            {stackedSheetId <= 2 && memoizedChildren}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

// Styles for the StackedSheet component
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'white',
    borderRadius: 35,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 2,
  },
});

// Export the StackedSheet component for use in other files
export { StackedSheet };
