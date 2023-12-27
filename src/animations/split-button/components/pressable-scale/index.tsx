import { useCallback } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type PressableScaleProps = {
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Define the PressableScale component using React.FC (Functional Component)
const PressableScale: React.FC<PressableScaleProps> = ({
  onPress,
  children,
  style,
}) => {
  const scale = useSharedValue(1);

  // Define a callback function to execute external onPress function
  const onExternalPress = useCallback(() => {
    onPress?.(); // Call the provided onPress function if available
  }, [onPress]);

  // Define a gesture for tap interaction using Gesture.Tap()
  const gesture = Gesture.Tap()
    .onBegin(() => {
      scale.value = 0.9; // Scale down on tap begin
    })
    .onTouchesUp(() => {
      runOnJS(onExternalPress)(); // Execute the external onPress on tap release
    })
    .onFinalize(() => {
      scale.value = 1; // Reset scale on tap finalize
    })
    .maxDuration(100000); // Set maximum duration for the tap gesture

  // Define animated style for scaling effect
  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: withSpring(scale.value) }], // Apply scaling transformation
    };
  }, []);

  return (
    // Wrap the content with GestureDetector for gesture handling
    <GestureDetector gesture={gesture}>
      {/* Apply the animated scaling style to the wrapped content */}
      <Animated.View style={[rStyle, style]}>{children}</Animated.View>
    </GestureDetector>
  );
};

export { PressableScale };
