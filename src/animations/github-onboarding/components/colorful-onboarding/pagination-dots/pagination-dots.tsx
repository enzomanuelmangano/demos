import { StyleSheet, View } from 'react-native';

import { PressableScale } from 'pressto';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';

const DOT_SIZE = 7;
const OPACITY_THRESHOLD = 0.7;
const ENABLED_OPACITY = 0.6;
const DISABLED_OPACITY = 0.2;

export interface PaginationDotProps extends ViewProps {
  count: number;
  index: number;
  progress: SharedValue<number>;
  onPress?: (index: number) => void;
}

export function PaginationDot({
  count,
  index,
  progress,
  onPress,
  style,
  ...props
}: PaginationDotProps): ReactElement {
  const animatedDotStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [index - OPACITY_THRESHOLD, index, index + OPACITY_THRESHOLD],
      [DISABLED_OPACITY, ENABLED_OPACITY, DISABLED_OPACITY],
      {
        extrapolateLeft: Extrapolation.CLAMP,
        extrapolateRight: Extrapolation.CLAMP,
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
    backgroundColor: '#D4D4D4',
    borderRadius: DOT_SIZE / 2,
    height: DOT_SIZE,
    width: DOT_SIZE,
  },
});
