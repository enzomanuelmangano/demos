import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';

type AnimatedDigitProps = {
  index: number;
  count: Animated.SharedValue<number>;
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

  // Ensure the number is zero-padded to the maxDigits length, then extract the digit at the given index.
  const paddedValue = count.toString().padStart(maxDigits, '0');

  return parseInt(
    paddedValue.toString().split('')?.[maxDigits - 1 - digitIndex] ?? 0,
    10,
  );
};

// AnimatedDigit component
const AnimatedDigit: React.FC<AnimatedDigitProps> = React.memo(
  ({ height, width, textStyle, index, count, maxDigits }) => {
    // Calculate the digit at the specified index.
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

    // Check if it's 0 and all the previous digits are 0
    const isVisible = useDerivedValue(() => {
      const isZero = digit.value === 0;

      if (!isZero) return true;

      return index < maxDigits - invisibleDigitsAmount.value;
    }, [index, maxDigits]);

    // Flatten the textStyle object into a single style object
    const flattenedTextStyle = React.useMemo(() => {
      return StyleSheet.flatten(textStyle);
    }, [textStyle]);

    // Define the animated style for the digit transformation
    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: withSpring(-height * digit.value, {
              mass: 0.6,
            }),
          },
        ],
      };
    }, [height]);

    // Create a shared value for opacity animation
    const opacity = useDerivedValue(() => {
      return withTiming(isVisible.value ? 1 : 0);
    }, []);

    // Define the animated style for the container opacity
    const rContainerStyle = useAnimatedStyle(() => {
      return {
        opacity: opacity.value,
        transform: [
          {
            // Translate the container to the left by half of the width of the invisible digits
            translateX: withTiming((-width * invisibleDigitsAmount.value) / 2),
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
