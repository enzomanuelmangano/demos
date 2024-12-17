import React, { forwardRef } from 'react';
import type { ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import type { InternalIconRef } from './icon';
import { InternalIcon } from './icon';

type IconSquareProps = {
  style?: ViewStyle;
  currentCodeLength: number;
  maxCodeLength: number;
};

export const IconSquare = forwardRef<InternalIconRef, IconSquareProps>(
  ({ style, currentCodeLength, maxCodeLength }, ref) => {
    const codeProgressPercentage = useDerivedValue(() => {
      return withTiming(currentCodeLength / maxCodeLength, {
        duration: 500,
      });
    }, [currentCodeLength, maxCodeLength]);

    const rotationY = useDerivedValue(() => {
      return interpolate(
        codeProgressPercentage.value,
        [0, 1],
        [-Math.PI / 8, Math.PI / 8],
      );
    }, [codeProgressPercentage]);

    const rCodeProgressStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            perspective: 300,
          },
          {
            rotateY: `${rotationY.value}rad`,
          },
          {
            rotateX: `${-Math.PI / 8}rad`,
          },
        ],
      };
    }, [rotationY]);

    const rIconStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            perspective: 200,
          },
          {
            translateY: 10,
          },
          {
            translateX: interpolate(
              codeProgressPercentage.value,
              [0, 1],
              [-10, 10],
            ),
          },
        ],
      };
    }, [codeProgressPercentage]);

    return (
      <Animated.View style={[styles.container, style, rCodeProgressStyle]}>
        <InternalIcon
          ref={ref}
          progress={codeProgressPercentage}
          style={rIconStyle}
        />
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    height: 96,
    width: 96,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
