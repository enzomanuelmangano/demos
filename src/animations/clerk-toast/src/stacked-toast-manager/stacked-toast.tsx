import { StyleSheet, useWindowDimensions } from 'react-native';

import { useCallback, useEffect, useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from './constants';
import { useInternalStackedToast } from './hooks';

import type { StackedToastType } from './context';

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
      mass: 1,
      damping: 100,
      stiffness: 80,
      overshootClamping: false,
    });
  }, [bottom, bottomHeight]);

  const translateX = useSharedValue(0);
  const isSwiping = useSharedValue(false);

  const dismissItem = useCallback(() => {
    'worklet';
    translateX.value = withSpring(
      -windowWidth,
      {
        dampingRatio: 1,
        duration: 350,
      },
      isFinished => {
        if (isFinished) {
          scheduleOnRN(onDismiss, stackedToastId);
        }
      },
    );
  }, [onDismiss, stackedToastId, translateX, windowWidth]);

  const gesture = Gesture.Pan()
    // .enabled(isActiveStackedToast)
    .onBegin(() => {
      isSwiping.value = true;
    })
    .onUpdate(event => {
      if (event.translationX > 0) return;
      translateX.value = event.translationX;
    })
    .onEnd(event => {
      if (event.translationX < -50) {
        dismissItem();
      } else {
        translateX.value = withSpring(0);
      }
    })
    .onFinalize(() => {
      isSwiping.value = false;
    });

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

const styles = StyleSheet.create({
  container: {
    borderCurve: 'continuous',
    borderRadius: 35,
    boxShadow: '0px 0px 0px #000',
    position: 'absolute',
  },
});

export { StackedToast };
