import React from 'react';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

// Define the props for the Backdrop component
type BackdropProps = {
  onTap: () => void; // Function to handle tap event
  isActive: Animated.SharedValue<boolean>; // Animated shared value to track activity state
};

// Create the Backdrop component
const Backdrop: React.FC<BackdropProps> = React.memo(({ isActive, onTap }) => {
  // Define animated style for the backdrop's opacity
  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isActive.value ? 1 : 0), // Animate opacity based on isActive value
    };
  }, []);

  // Define animated props for the backdrop
  const rBackdropProps = useAnimatedProps(() => {
    return {
      pointerEvents: isActive.value ? 'auto' : 'none', // Enable or disable touch events based on isActive value
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }, []);

  // Render the Backdrop component
  return (
    <Animated.View
      onTouchStart={onTap} // Handle touch start event with onTap function
      animatedProps={rBackdropProps} // Apply animated props to the View
      style={[
        {
          ...StyleSheet.absoluteFillObject, // Make the View cover the entire parent
          backgroundColor: 'rgba(0,0,0,0.2)', // Set the background color with transparency
        },
        rBackdropStyle, // Apply the animated style for opacity
      ]}
    />
  );
});

export { Backdrop };
