// Import necessary modules and types from React and React Native
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Define the props for the InputButton component
type InputButtonProps = {
  style?: StyleProp<ViewStyle>;
  onTap?: () => void;
  onLongTap?: () => void;
  children?: React.ReactNode;
};

const TouchableFeedback: React.FC<InputButtonProps> = React.memo(
  ({ children, style, onTap, onLongTap }) => {
    // Shared value for tracking touch progress
    const progress = useSharedValue(0);

    // Tap gesture configuration
    const tapGesture = Gesture.Tap()
      .onTouchesDown(() => {
        progress.value = withTiming(1, { duration: 100 });
      })
      .onTouchesUp(() => {
        if (onTap) runOnJS(onTap)();
      })
      .onFinalize(() => {
        progress.value = withTiming(0);
      })
      .maxDuration(10000);

    // Long press gesture configuration
    const longTapGesture = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => {
        if (onLongTap) runOnJS(onLongTap)();
      });

    // Animated style based on touch progress
    const rStyle = useAnimatedStyle(() => {
      const opacity = interpolate(progress.value, [0, 1], [0, 0.1]).toFixed(2);
      const scale = interpolate(progress.value, [0, 1], [1, 0.9]);

      return {
        backgroundColor: `rgba(0,0,0,${opacity})`,
        transform: [{ scale }],
      };
    }, []);

    // Simultaneous gesture handling for tap and long press
    const gestures = Gesture.Simultaneous(tapGesture, longTapGesture);

    // Render the InputButton component
    return (
      <GestureDetector gesture={gestures}>
        <Animated.View style={[style, { borderRadius: 20 }, rStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

// Export the InputButton component
export { TouchableFeedback };
