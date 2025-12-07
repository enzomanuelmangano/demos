import { StyleSheet, useWindowDimensions } from 'react-native';

import { type FC, useCallback, useEffect, useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useInternalStackedSheet } from './hooks';
import { StackedSheetHandle } from './stacked-sheet-handle';

import type { StackedSheetType } from './context';

// Define the props for the StackedSheet component
type StackedSheetProps = {
  index: number;
  stackedSheet: StackedSheetType;
  onDismiss: (StackedSheetId: number) => void;
};

// Constants for StackedSheet styling

const BaseSafeArea = 50;

// Define the StackedSheet component
const StackedSheet: FC<StackedSheetProps> = ({
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
    bottom.value = withSpring(BaseSafeArea + bottomHeight);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomHeight]);

  const translateY = useSharedValue(0);
  const isSwiping = useSharedValue(false);

  const dismissItem = useCallback(() => {
    'worklet';
    translateY.value = withSpring(
      stackedSheet.componentHeight + BaseSafeArea,
      {
        duration: 250,
        dampingRatio: 1,
      },
      isFinished => {
        if (isFinished) {
          scheduleOnRN(onDismiss, stackedSheetId);
        }
      },
    );
  }, [onDismiss, stackedSheet.componentHeight, stackedSheetId, translateY]);

  const gesture = Gesture.Pan()
    .enabled(isActiveStackedSheet)
    .onBegin(() => {
      isSwiping.value = true;
    })
    .onUpdate(event => {
      if (event.translationY < 0) return;
      translateY.value = event.translationY;
    })
    .onEnd(event => {
      if (event.translationY > -50) {
        dismissItem();
      } else {
        translateY.value = withSpring(0);
      }
    })
    .onFinalize(() => {
      isSwiping.value = false;
    });

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

  const rVisibleContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(stackedSheetId <= 1 ? 1 : 0),
    };
  }, [stackedSheetId]);

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

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 35,
    boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.03)',
    position: 'absolute',
  },
});

export { StackedSheet };
