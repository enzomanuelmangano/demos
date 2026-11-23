import { type FC, memo, useMemo } from 'react';

import Animated, { LinearTransition } from 'react-native-reanimated';

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
const AnimatedCount: FC<AnimatedCountProps> = memo(({ number }) => {
  // Split the number into individual digits and store them in an array
  const digits = useMemo(() => {
    return number
      .toString()
      .split('')
      .map(digit => parseInt(digit, 10));
  }, [number]);

  // Render the animated digits
  return (
    <Animated.View
      layout={LinearTransition.springify()}
      style={{
        flexDirection: 'row',
      }}>
      {digits.map((digit, index) => {
        // Use position from left (first digit gets position 0, second gets 1, etc)
        return (
          <AnimatedDigit
            key={`position-${index}`}
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
