import { StyleSheet, Text } from 'react-native';

import { type FC, memo, useMemo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { StyleProp, TextStyle } from 'react-native';

type AnimatedDigitProps = {
  index: number;
  count: SharedValue<number>;
  height: number;
  width: number;
  textStyle: StyleProp<TextStyle>;
  maxDigits: number;
};

const getDigitByIndex = ({
  digitIndex,
  count,
  maxDigits,
}: {
  digitIndex: number;
  count: number;
  maxDigits: number;
}) => {
  'worklet';

  const paddedValue = count.toString().padStart(maxDigits, '0');

  return parseInt(
    paddedValue.toString().split('')?.[maxDigits - 1 - digitIndex] ?? 0,
    10,
  );
};

const AnimatedDigit: FC<AnimatedDigitProps> = memo(
  ({ height, width, textStyle, index, count, maxDigits }) => {
    const digit = useDerivedValue(() => {
      return getDigitByIndex({
        digitIndex: index,
        count: count.value,
        maxDigits: maxDigits,
      });
    }, [index]);

    // Calculate the amount of invisible (leading) digits.
    // for instance, if the maxDigits is 5 and the count is 123, then the invisible digits are 2.
    // Since count -> 00123
    const invisibleDigitsAmount = useDerivedValue(() => {
      return maxDigits - count.value.toString().length;
    }, [maxDigits]);

    const isVisible = useDerivedValue(() => {
      const isZero = digit.value === 0;

      if (!isZero) return true;

      return index < maxDigits - invisibleDigitsAmount.value;
    }, [index, maxDigits]);

    const flattenedTextStyle = useMemo(() => {
      return StyleSheet.flatten(textStyle);
    }, [textStyle]);

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: withSpring(-height * digit.value, {
              duration: 200,
              dampingRatio: 3,
            }),
          },
        ],
      };
    }, [height]);

    const opacity = useDerivedValue(() => {
      return withTiming(isVisible.value ? 1 : 0);
    }, []);

    const rContainerStyle = useAnimatedStyle(() => {
      return {
        opacity: opacity.value,
        transform: [
          {
            translateX: withSpring((-width * invisibleDigitsAmount.value) / 2, {
              dampingRatio: 1,
              duration: 200,
            }),
          },
        ],
      };
    });

    return (
      <Animated.View
        style={[
          {
            height,
            width,
            // Comment this out to see the real trick behind the animation :)
            overflow: 'hidden',
          },
          rContainerStyle,
        ]}>
        <Animated.View
          style={[
            {
              flexDirection: 'column',
            },
            rStyle,
          ]}>
          {/* 
            In summary, this code snippet creates and renders a series of <Text> components, 
            one for each digit from 0 to 9. The purpose of this is to display the possible 
            digits as individual elements inside the animated digit component. 
          */}
          {new Array(10).fill(0).map((_, textIndex) => {
            return (
              <Text
                key={textIndex}
                style={{
                  ...flattenedTextStyle,
                  width,
                  height,
                  textAlign: 'center',
                  textAlignVertical: 'center',
                }}>
                {textIndex}
              </Text>
            );
          })}
        </Animated.View>
      </Animated.View>
    );
  },
);

export { AnimatedDigit };
