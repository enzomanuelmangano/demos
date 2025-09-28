import { StyleSheet, Text, View } from 'react-native';

import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type BarProps = {
  maxHeight: number;
  minHeight: number;
  width: number;
  progress: SharedValue<number>;
  letter: string;
};

export const Bar: React.FC<BarProps> = ({
  maxHeight,
  minHeight,
  width,
  progress,
  letter,
}) => {
  const animatedProgress = useDerivedValue(() => {
    return withTiming(progress.value);
  }, [progress]);

  const rAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      animatedProgress.value,
      [0, 1],
      [minHeight, maxHeight],
    );

    const backgroundColor = interpolateColor(
      animatedProgress.value,
      [0, 1],
      ['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 1)'],
    );

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
    fontFamily: 'FiraCode-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
});
