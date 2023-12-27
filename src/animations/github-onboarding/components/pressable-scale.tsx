// Importing necessary modules from React and React Native
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Type definitions for the PressableScale component props
type PressableScaleProps = {
  children: React.ReactNode; // Children components to be rendered inside
  onPress?: () => void; // Callback for the press event
  style?: StyleProp<ViewStyle>; // Custom styles that can be passed from parent
  enabled?: boolean; // An optional prop to enable or disable the component (not utilized in this code)
};

const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  style,
}) => {
  // Shared value to determine if the press is active or not
  const active = useSharedValue(false);

  // Gesture configuration to handle tap events
  const gesture = Gesture.Tap()
    .maxDuration(4000) // Maximum duration for the tap gesture
    .onTouchesDown(() => {
      // Action on touch down
      active.value = true;
    })
    .onTouchesUp(() => {
      // Action on touch up
      if (onPress != null) runOnJS(onPress)(); // Execute onPress if provided
    })
    .onFinalize(() => {
      // Final actions when touch is released
      active.value = false;
    });

  // Animated style to handle the scaling effect on press
  const rAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(active.value ? 0.95 : 1), // Scale down to 0.95 when pressed, scale back to 1 when released
        },
      ],
    };
  }, []);

  // Render the animated view with gesture detector
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, rAnimatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
};

// Export the PressableScale component for external use
export { PressableScale };
