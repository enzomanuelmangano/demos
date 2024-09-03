import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type BarProps = {
  maxHeight: number;
  minHeight: number;
  width: number;
  progress: number;
  letter: string;
};

export const Bar: React.FC<BarProps> = ({
  maxHeight,
  minHeight,
  width,
  progress,
  letter,
}) => {
  // Create an animated value that changes based on the `progress` prop/state with a timing function for smooth transitions
  const animatedProgress = useDerivedValue(() => {
    return withTiming(progress); // Animate the `progress` value smoothly over time
  }, [progress]); // Re-run the animation whenever `progress` changes

  // Create an animated style object that will update dynamically based on the animated progress value
  const rAnimatedStyle = useAnimatedStyle(() => {
    // Interpolate the animated progress value to determine the height between `minHeight` and `maxHeight`
    const height = interpolate(
      animatedProgress.value, // The current animated progress value
      [0, 1], // Input range (from 0 to 1)
      [minHeight, maxHeight], // Output range (from `minHeight` to `maxHeight`)
    );

    // Interpolate the animated progress value to determine the background color
    const backgroundColor = interpolateColor(
      animatedProgress.value, // The current animated progress value
      [0, 1], // Input range (from 0 to 1)
      ['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 1)'], // Output range (from semi-transparent white to opaque white)
    );

    // Return the animated style object with the computed height and background color
    return {
      height: height,
      backgroundColor,
    };
  }, []);

  return (
    <View>
      <Animated.View
        style={[
          {
            width: width,
            borderRadius: 10,
            borderCurve: 'continuous',
          },
          rAnimatedStyle,
        ]}
      />
      <Text style={styles.label}>{letter}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    color: 'white',
    textAlign: 'center',
    marginTop: 8,
    fontFamily: 'FiraCode-Regular',
  },
});
