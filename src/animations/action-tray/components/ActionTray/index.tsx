import {
  forwardRef,
  type ReactNode,
  useCallback,
  useImperativeHandle,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Backdrop } from './Backdrop';

// Get the screen height
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Define the props for the ActionTray component
type ActionTrayProps = {
  children?: ReactNode;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
  onClose?: () => void;
};

export type ActionTrayRef = {
  open: () => void;
  isActive: () => boolean;
  close: () => void;
};

// Create the ActionTray component
const ActionTray = forwardRef<ActionTrayRef, ActionTrayProps>(
  ({ children, style, maxHeight = SCREEN_HEIGHT, onClose }, ref) => {
    // Create a shared value for translateY animation
    const translateY = useSharedValue(maxHeight);

    // Define the maximum translateY value for the ActionTray
    const MAX_TRANSLATE_Y = -maxHeight;

    // Create a shared value to track the active state
    const active = useSharedValue(false);

    // Function to scroll to a specific Y position
    const scrollTo = useCallback((destination: number) => {
      'worklet';
      active.value = destination !== maxHeight;

      translateY.value = withSpring(destination, {
        mass: 0.4,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Function to close the ActionTray
    const close = useCallback(() => {
      'worklet';
      return scrollTo(maxHeight);
    }, [maxHeight, scrollTo]);

    // Expose functions and values through useImperativeHandle
    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          'worklet';
          scrollTo(0);
        },
        close,
        isActive: () => {
          return active.value;
        },
      }),
      [close, scrollTo, active.value],
    );

    // Create a shared value for context
    const context = useSharedValue({ y: 0 });

    // Create a gesture handler for pan gestures
    const gesture = Gesture.Pan()
      .onStart(() => {
        context.value = { y: translateY.value };
      })
      .onUpdate(event => {
        // Handle just gestures to swipe down
        if (event.translationY > -50) {
          // Update the translateY value with clamping
          translateY.value = event.translationY + context.value.y;
        }
      })
      .onEnd(event => {
        if (event.translationY > 100) {
          // Close the Action Tray when the user swipes down
          if (onClose) {
            scheduleOnRN(onClose);
          } else close();
        } else {
          // Restore to the previous position if the users doesn't swipe down enough
          scrollTo(context.value.y);
        }
      });

    // Create an animated style for the bottom sheet
    const rActionTrayStyle = useAnimatedStyle(() => {
      // Interpolate the borderRadius based on translateY value
      const borderRadius = interpolate(
        translateY.value,
        [MAX_TRANSLATE_Y + 50, MAX_TRANSLATE_Y],
        [25, 5],
        Extrapolation.CLAMP,
      );

      return {
        borderRadius,
        transform: [{ translateY: translateY.value }],
      };
    });

    // Render the ActionTray component
    return (
      <>
        {/* Backdrop to handle tap events */}
        <Backdrop onTap={onClose ?? close} isActive={active} />
        {/* Gesture detector to handle pan gestures */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[styles.actionTrayContainer, rActionTrayStyle, style]}>
            <Animated.View
              layout={LinearTransition}
              entering={FadeIn}
              exiting={FadeOut}>
              {children}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </>
    );
  },
);

// Define the styles for the ActionTray component
const styles = StyleSheet.create({
  actionTrayContainer: {
    backgroundColor: '#FFF',
    width: '95%',
    position: 'absolute',
    bottom: 30,
    borderCurve: 'continuous',
    alignSelf: 'center',
  },
  line: {
    width: 75,
    height: 4,
    backgroundColor: 'grey',
    alignSelf: 'center',
    marginVertical: 15,
    borderRadius: 2,
  },
  fill: { flex: 1 },
});

export { ActionTray };
