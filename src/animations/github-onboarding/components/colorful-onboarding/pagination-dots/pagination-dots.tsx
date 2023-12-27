import React from 'react';
import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { PressableScale } from '../../pressable-scale';

const DOT_SIZE = 7;
const OPACITY_THRESHOLD = 0.7;
const ENABLED_OPACITY = 0.6;
const DISABLED_OPACITY = 0.2;

export interface PaginationDotProps extends ViewProps {
  count: number;
  index: number;
  progress: Animated.SharedValue<number>;
  onPress?: (index: number) => void;
}

export function PaginationDot({
  count,
  index,
  progress,
  onPress,
  style,
  ...props
}: PaginationDotProps): React.ReactElement {
  const animatedDotStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [index - OPACITY_THRESHOLD, index, index + OPACITY_THRESHOLD],
      [DISABLED_OPACITY, ENABLED_OPACITY, DISABLED_OPACITY],
      {
        extrapolateLeft: Extrapolate.CLAMP,
        extrapolateRight: Extrapolate.CLAMP,
      },
    );

    return {
      opacity,
    };
  });

  return (
    <PressableScale onPress={() => onPress?.(index)} hitSlop={5} {...props}>
      <View
        style={{
          paddingHorizontal: 5,
        }}>
        <Animated.View style={[styles.dot, style, animatedDotStyle]} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#D4D4D4',
  },
});
