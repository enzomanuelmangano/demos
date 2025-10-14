import { StyleSheet, View } from 'react-native';

import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

export const Eye = ({ progress }: { progress: SharedValue<number> }) => {
  const rStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.4, 0.8]);
    const width = scale * 10;
    const height = scale * 10;
    const translateX = interpolate(progress.value, [0, 1], [-4, 4]);
    const translateY = interpolate(progress.value, [0, 1], [3, 3]);

    // Initially I was using scale, but it was causing a blur on the
    // Eye Resolution for some very weird reason (after upgrading React Native)
    return {
      transform: [{ translateX }, { translateY }],
      width,
      height,
      borderCurve: 'continuous',
      borderRadius: width / 2,
    };
  });

  return (
    <View style={styles.eyeContainer}>
      <Animated.View style={[rStyle, { backgroundColor: 'black' }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  eyeContainer: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 20,
  },
});
