import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  FadeOutLeft,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo } from 'react';

import type { StackedToastType } from './context';
import { useInternalStackedToast } from './hooks';
import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from './constants';

// Define the props for the StackedToast component
type StackedToastProps = {
  index: number;
  stackedSheet: StackedToastType;
  onDismiss: (StackedToastId: number) => void;
};

// Constants for StackedToast styling

const BaseSafeArea = 50;

// Define the StackedToast component
const StackedToast: React.FC<StackedToastProps> = ({
  stackedSheet,
  index,
  onDismiss,
}) => {
  // Get the width of the window using useWindowDimensions hook
  const { width: windowWidth } = useWindowDimensions();
  const { id: stackedToastId, bottomHeight } =
    useInternalStackedToast(stackedSheet.key) ?? 0;
  const isActiveStackedToast = stackedToastId === 0;

  // Shared values for animation
  // That's the "initial" position of the StackedToast
  // After that, the StackedToast will be animated to the bottom
  const initialBottomPosition = isActiveStackedToast
    ? // Not an elegant way to handle the first StackedToast.
      // Basically the purpose is that the initial position of the StackedToast
      // should be the same as the last StackedToast that is being dismissed
      // Except for the first StackedToast, that should be animated from the bottom
      // of the screen (so -HideStackedToastOffset)
      -TOAST_HEIGHT
    : BaseSafeArea;

  const bottom = useSharedValue(initialBottomPosition);

  // Update the bottom position when the StackedToast id changes
  // After the "mount" animation, the StackedToast will be animated to the
  // right bottom value.
  // To be honest that's not an easy solution, but it seems to work fine
  useEffect(() => {
    bottom.value = withSpring(BaseSafeArea + bottomHeight, {
      duration: 500,
      dampingRatio: 1.5,
      stiffness: 1,
      overshootClamping: false,
      restSpeedThreshold: 50,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomHeight]);

  const translateX = useSharedValue(0);
  const isSwiping = useSharedValue(false);

  // Callback to dismiss the StackedToast with animation
  const dismissItem = useCallback(() => {
    'worklet';
    translateX.value = withTiming(
      -windowWidth,
      {
        duration: 250,
      },
      isFinished => {
        if (isFinished) {
          runOnJS(onDismiss)(stackedToastId);
        }
      },
    );
  }, [onDismiss, stackedToastId, translateX, windowWidth]);

  // Gesture handler for swipe interactions
  const gesture = Gesture.Pan()
    // .enabled(isActiveStackedToast)
    .onBegin(() => {
      isSwiping.value = true;
    })
    .onUpdate(event => {
      // Allow swiping only to the left direction
      if (event.translationX > 0) return;
      translateX.value = event.translationX;
    })
    .onEnd(event => {
      // Dismiss the StackedToast if swiped enough, otherwise animate back to the initial position
      if (event.translationX < -50) {
        dismissItem();
      } else {
        translateX.value = withSpring(0);
      }
    })
    .onFinalize(() => {
      isSwiping.value = false;
    });

  // Animated styles for the StackedToast container
  const rStackedToastStyle = useAnimatedStyle(() => {
    return {
      bottom: bottom.value,
      zIndex: 100 - stackedToastId,
      shadowRadius: withTiming(Math.max(10 - stackedToastId * 2.5, 2)),
      shadowOpacity: withTiming(
        stackedToastId > 3 ? 0.1 - stackedToastId * 0.025 : 0.08,
      ),
    };
  }, [stackedSheet, stackedToastId]);

  const rStackedToastTranslationStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: translateX.value,
        },
      ],
    };
  }, []);

  // Animated styles for the visible container (opacity)
  const rVisibleContainerStyle = useAnimatedStyle(() => {
    return {
      // The content of the first two StackedToasts is visible
      // The content of the other StackedToasts is hidden
      opacity: withTiming(stackedToastId < MAX_VISIBLE_TOASTS ? 1 : 0),
    };
  }, [stackedToastId]);

  const memoizedChildren = useMemo(() => {
    if (!stackedSheet.children) return null;
    return stackedSheet.children();
  }, [stackedSheet]);

  // Render the StackedToast component
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
          rStackedToastStyle,
        ]}
        exiting={FadeOutLeft.delay(120 * stackedToastId)}>
        <Animated.View key={index} style={rStackedToastTranslationStyle}>
          {memoizedChildren && (
            <Animated.View
              style={[
                rVisibleContainerStyle,
                {
                  width: windowWidth * 0.9,
                  borderRadius: 35,
                  borderCurve: 'continuous',
                  overflow: 'hidden',
                  height: TOAST_HEIGHT,
                },
              ]}>
              {stackedToastId <= MAX_VISIBLE_TOASTS * 1.5 && memoizedChildren}
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

// Styles for the StackedToast component
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderRadius: 35,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 2,
  },
});

// Export the StackedToast component for use in other files
export { StackedToast };
