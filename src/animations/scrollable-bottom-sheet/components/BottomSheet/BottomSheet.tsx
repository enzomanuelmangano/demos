import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Backdrop } from './Backdrop';

// Get the screen height
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Define the maximum translateY value for the bottom sheet
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

// Define the props for the BottomSheet component
type BottomSheetProps = {
  children?: React.ReactNode;
  active: SharedValue<boolean>; // Shared value to track activity state
  translateY: SharedValue<number>; // Shared value for translateY animation
  scrollTo: (destination: number) => void; // Function to scroll to a specific position
};

// Create the BottomSheet component
const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  translateY,
  active,
  scrollTo,
}) => {
  // Create a shared value for context
  const context = useSharedValue({ y: 0 });

  // Create a gesture handler for pan gestures
  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate(event => {
      // Handle just gestures to swipe down
      if (event.translationY > 0) {
        // Update the translateY value with clamping
        translateY.value = event.translationY + context.value.y;
        translateY.value = Math.max(translateY.value, MAX_TRANSLATE_Y);
      }
    })
    .onEnd(event => {
      if (event.translationY > 100) {
        // Close the bottom sheet when the user swipes down
        scrollTo(0);
      } else {
        // Restore to the previous position if the users doesn't swipe down enough
        scrollTo(context.value.y);
      }
    });

  // Create an animated style for the bottom sheet
  const rBottomSheetStyle = useAnimatedStyle(() => {
    // Interpolate the borderRadius based on translateY value
    const borderRadius = interpolate(
      translateY.value,
      [MAX_TRANSLATE_Y + 50, MAX_TRANSLATE_Y],
      [25, 5],
      Extrapolate.CLAMP,
    );

    return {
      borderRadius,
      transform: [{ translateY: translateY.value }],
    };
  });

  // Create an animated style for the spacer view
  const rSpacerViewStyle = useAnimatedStyle(() => {
    return {
      height: Math.max(SCREEN_HEIGHT + translateY.value, 0),
    };
  }, []);

  // Create an animated style for the children (content) view
  const rChildrenStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(active.value ? 1 : 0, { duration: 150 }), // Animate opacity based on active value
    };
  }, []);

  // Render the BottomSheet component
  return (
    <>
      {/* Backdrop to handle tap events */}
      <Backdrop
        onTap={() => {
          scrollTo(0); // Close the bottom sheet when the user taps on the backdrop
        }}
        isActive={active}
      />
      {/* Gesture detector to handle pan gestures */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.bottomSheetContainer, rBottomSheetStyle]}>
          <View style={styles.line} />
          <Animated.View style={[styles.fill, rChildrenStyle]}>
            {children}
          </Animated.View>
          <Animated.View style={rSpacerViewStyle} />
        </Animated.View>
      </GestureDetector>
    </>
  );
};

// Define the styles for the BottomSheet component
const styles = StyleSheet.create({
  bottomSheetContainer: {
    height: SCREEN_HEIGHT,
    width: '100%',
    backgroundColor: '#171717',
    position: 'absolute',
    top: SCREEN_HEIGHT,
    borderRadius: 25,
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

export { BottomSheet };
