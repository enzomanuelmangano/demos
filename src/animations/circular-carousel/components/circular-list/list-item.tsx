import { Image } from 'expo-image';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

// Get the window width for calculating the list item width
const { width: windowWidth } = Dimensions.get('window');
const LIST_ITEM_WIDTH = windowWidth / 4;

// This whole file is based on Interpolate content offset
// to create a circular list.
// If you're not familiar with the concept, check out these videos:
// Interpolate with ScrollView: https://youtu.be/SqwpRr7kbnQ?list=PLjHsmVtnAr9TWoMAh-3QMiP7bPUqPFuFZ
// React Native Advanced Onboarding: https://youtu.be/OT-73hpwxXQ

// CircularListItem component definition
const CircularListItem: React.FC<{
  index: number;
  imageUri: string;
  contentOffset: SharedValue<number>;
  scaleEnabled?: boolean;
}> = ({ index, contentOffset, imageUri, scaleEnabled }) => {
  // Define input range for interpolation
  const inputRange = [
    (index - 2) * LIST_ITEM_WIDTH,
    (index - 1) * LIST_ITEM_WIDTH,
    index * LIST_ITEM_WIDTH,
    (index + 1) * LIST_ITEM_WIDTH,
    (index + 2) * LIST_ITEM_WIDTH,
  ];

  // Here's where the magic happens 🪄
  // Calculate the scale output range based on the scaleEnabled flag
  const scaleOutputRange = useDerivedValue(() => {
    // Define two different output ranges for scaling:
    // 1. avoidScalingOutputRange: This range maintains a consistent scale of 1.
    // 2. showScalingOutputRange: This range provides a scale effect for visual impact.

    const avoidScalingOutputRange = [1, 1, 1, 1, 1];
    const showScalingOutputRange = [0.5, 0.9, 1.2, 0.9, 0.5];

    // Determine the final output range based on the scaleEnabled flag.
    // If scaleEnabled is true, use the showScalingOutputRange; otherwise, use avoidScalingOutputRange.
    const finalOutputRange = scaleEnabled
      ? showScalingOutputRange
      : avoidScalingOutputRange;

    // Use the withSpring function to create a spring animation effect
    // for transitioning between different scale output ranges.
    const scaledOutput = withSpring(finalOutputRange);

    return scaledOutput; // Return the final scale output range
  }, [scaleEnabled]); // Re-run the derived value computation when scaleEnabled changes

  // Define the scale value using interpolation based on content offset
  const scale = useDerivedValue(() => {
    // Interpolate the content offset value within the specified input and output ranges.
    // The input range is a set of values determined by the list item's position.
    // The output range is the corresponding scale values based on whether scaling is enabled.
    // Extrapolate.CLAMP ensures that the scale value stays within the defined output range.
    const interpolatedScale = interpolate(
      contentOffset.value, // Current content offset value from the shared value
      inputRange, // Input range array based on the list item's position
      scaleOutputRange.value, // Output range array for scale values
      Extrapolate.CLAMP, // Clamp the interpolated value within the output range
    );

    return interpolatedScale; // Return the interpolated scale value
  }, [scaleEnabled]); // Re-run the derived value computation when scaleEnabled changes

  // Define animated style for the circular list item
  const rStyle = useAnimatedStyle(() => {
    // Define translate and opacity output ranges for animation
    const translateOutputRange = [
      0,
      -LIST_ITEM_WIDTH / 3,
      -LIST_ITEM_WIDTH / 2,
      -LIST_ITEM_WIDTH / 3,
      0,
    ];
    const opacityOutputRange = [0.5, 1, 1, 1, 0.5];

    // Interpolate translateY and opacity based on content offset
    const translateY = interpolate(
      contentOffset.value,
      inputRange,
      translateOutputRange,
    );
    const opacity = interpolate(
      contentOffset.value,
      inputRange,
      opacityOutputRange,
      Extrapolate.CLAMP,
    );

    // Return the animated style object
    return {
      opacity,
      transform: [
        {
          translateX: LIST_ITEM_WIDTH / 2 + LIST_ITEM_WIDTH,
        },
        {
          translateY,
        },
        { scale: scale.value },
      ],
    };
  }, []);

  // Render the CircularListItem component
  return (
    <Animated.View style={[styles.container, rStyle]}>
      <Image style={styles.image} source={{ uri: imageUri }} />
    </Animated.View>
  );
};

// Styles for the CircularListItem component
const styles = StyleSheet.create({
  container: {
    width: LIST_ITEM_WIDTH,
    aspectRatio: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  image: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#fff',
    shadowRadius: 20,
    borderRadius: 100,
    margin: 8,
  },
});

// Export the CircularListItem component and the list item width
export { CircularListItem, LIST_ITEM_WIDTH };
