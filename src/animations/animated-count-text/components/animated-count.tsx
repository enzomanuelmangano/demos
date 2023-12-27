import React, { useMemo } from 'react';
import Animated from 'react-native-reanimated';

import { AnimatedDigit } from './animated-digit';

// Constants for the dimensions and styling of the animated digits
const TEXT_DIGIT_HEIGHT = 55;
const TEXT_DIGIT_WIDTH = 40;
const FONT_SIZE = 50;

// Define the prop types for the AnimatedCount component
type AnimatedCountProps = {
  number: number;
};

// AnimatedCount component
const AnimatedCount: React.FC<AnimatedCountProps> = React.memo(({ number }) => {
  // Split the number into individual digits and store them in an array
  const digits = React.useMemo(() => {
    return number
      .toString()
      .split('')
      .map(digit => parseInt(digit, 10));
  }, [number]);

  // Generate unique keys for each digit based on their index in the array
  // The keys are generated in reverse order because the digits array is
  // reversed before mapping over it to render the `AnimatedDigit` components.
  // This reverse order ensures that the keys are assigned correctly to
  // each digit in the original order.
  // When mapping over an array to render a list of components in React,
  // it is important to provide a unique key prop for each component.
  // This allows React to efficiently update and reconcile the list
  // when changes occur, such as adding or removing items.

  // In this code, the `digits` array is reversed using the `reverse()`
  // method before mapping over it to render the `AnimatedDigit` components.
  // By reversing the array, the digits are rendered in the original order.
  // However, to ensure that each digit receives a unique key,
  // the keys are generated in reverse order as well.
  // For example, if the original number is 123, the `digits`
  // array would be [3, 2, 1] after splitting and mapping.
  // The keys would be generated as ['lastdigit', 'lastlastdigit', 'lastlastlastdigit'] in reverse order.
  // This way, the first digit (3) receives the key 'lastdigit',
  // the second digit (2) receives the key 'lastlastdigit', and so on,
  // preserving the correct order of keys for each digit in the rendered list.
  const keys = useMemo(() => {
    return digits.reverse().map((_, index) => {
      return 'last'.repeat(index) + 'digit';
    });
  }, [digits]);

  // Render the animated digits
  return (
    <Animated.View
      style={{
        flexDirection: 'row-reverse',
      }}>
      {digits.map((digit, index) => {
        return (
          <AnimatedDigit
            duration={1250}
            key={keys[index]}
            digit={digit}
            height={TEXT_DIGIT_HEIGHT}
            width={TEXT_DIGIT_WIDTH}
            textStyle={{
              color: 'white',
              fontSize: FONT_SIZE,
              fontWeight: 'bold',
            }}
          />
        );
      })}
    </Animated.View>
  );
});

export { AnimatedCount };
