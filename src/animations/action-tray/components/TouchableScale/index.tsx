import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// I use this component a lot in my projects, and maybe
// it's worth to create a package for it (one day) :)

// Define the props for the PressableScale component
export type PressableScaleProps = {
  children?: React.ReactNode; // Content to be wrapped by the pressable component
  onPress?: () => void; // Function to be executed on press
  style?: StyleProp<ViewStyle>; // Custom styles for the pressable component
};

// Create the PressableScale component
const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  style,
}) => {
  // Create a shared value to track the press state
  const active = useSharedValue(false);

  // Create a tap gesture handler
  const gesture = Gesture.Tap()
    .maxDuration(4000) // Set maximum duration for tap gesture
    .onTouchesDown(() => {
      active.value = true; // Mark as active on touch down
    })
    .onTouchesUp(() => {
      if (onPress != null) runOnJS(onPress)(); // Execute onPress on touch up
    })
    .onFinalize(() => {
      active.value = false; // Reset press state on finalize
    });

  // Create an animated style for scaling effect
  const rAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(active.value ? 0.92 : 1), // Scale down when active, return to normal otherwise
        },
      ],
    };
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, rAnimatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
};

export { PressableScale };
