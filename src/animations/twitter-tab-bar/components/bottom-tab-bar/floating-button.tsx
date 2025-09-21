import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '../../constants/palette';

// Define the type for BottomFloatingButtonProps
type BottomFloatingButtonProps = {
  progress: SharedValue<number>; // Animated shared value for tracking the progress of animations
  style?: StyleProp<ViewStyle>; // Optional style prop for customizing the button's appearance
  onSelect?: (option: 'message' | 'default') => void; // Optional callback function for handling icon selection
};

// Define the BottomFloatingButton component
const BottomFloatingButton: React.FC<BottomFloatingButtonProps> = ({
  progress: floatingProgress,
  style,
  onSelect,
}) => {
  // Define the animated style for rotating and scaling the floating button icon
  const rFloatingIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      floatingProgress.value,
      [0, 1],
      [0, 2 * Math.PI],
    );
    const rotateRad = `${rotate}rad`;

    return {
      transform: [
        {
          rotate: rotateRad,
        },
        {
          scale: interpolate(floatingProgress.value, [0, 0.5, 1], [1, 1.2, 1]),
        },
      ],
    };
  }, []);

  // Define the animated style for hiding/showing the 'message' icon based on progress value
  const rMessageIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.value <= 0.5 ? 0 : 1,
    };
  }, []);

  // Define the animated style for hiding/showing the 'edit' icon based on progress value
  const rEditIconStyle = useAnimatedStyle(() => {
    return {
      opacity: floatingProgress.value > 0.5 ? 0 : 1,
    };
  }, []);

  // Create a shared animated value 'highlighted' to track whether the button is highlighted
  const highlighted = useSharedValue(false);

  // Create a tap gesture using GestureHandler and define the tap behavior
  const gesture = Gesture.Tap()
    .maxDuration(10000) // Set the maximum duration for a tap gesture
    .onBegin(() => {
      highlighted.value = true; // Mark the button as highlighted when the tap begins
    })
    .onTouchesUp(() => {
      // When the tap ends, determine which option to select based on progress value
      const option = floatingProgress.value > 0.5 ? 'default' : 'message';
      if (onSelect) runOnJS(onSelect)(option); // Call the onSelect callback with the selected option
    })
    .onFinalize(() => {
      highlighted.value = false; // Reset the highlighted state when the tap gesture is finalized
    });

  // Define the animated style for scaling the button when it is highlighted
  const rHighlightedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(highlighted.value ? 0.8 : 1), // Scale the button down when highlighted, return to normal scale otherwise
        },
      ],
    };
  }, []);

  // Render the BottomFloatingButton component
  return (
    <GestureDetector gesture={gesture}>
      {/* Animated View representing the floating button */}
      <Animated.View style={[style, rFloatingIconStyle, rHighlightedStyle]}>
        {/* Absolute positioned view for the 'edit' icon */}
        <Animated.View
          style={[StyleSheet.absoluteFill, rEditIconStyle, styles.center]}>
          <MaterialIcons name={'edit'} size={28} color={Palette.text} />
        </Animated.View>
        {/* Absolute positioned view for the 'message' icon */}
        <Animated.View
          style={[StyleSheet.absoluteFill, rMessageIconStyle, styles.center]}>
          <MaterialIcons name={'message'} size={28} color={Palette.text} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Export the BottomFloatingButton component for usage in other components
export { BottomFloatingButton };
