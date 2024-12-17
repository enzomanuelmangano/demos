import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';

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
    width: 20,
    height: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
