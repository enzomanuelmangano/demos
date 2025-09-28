import { type FC, memo } from 'react';

import Animated, { type SharedValue } from 'react-native-reanimated';

import { AnimatedDigit } from './animated-digit';

const TEXT_DIGIT_HEIGHT = 60;
const TEXT_DIGIT_WIDTH = 35;
const FONT_SIZE = 50;
const TEXT_COLOR = 'black';

type AnimatedCountProps = {
  count: SharedValue<number>;
  maxDigits: number;
  textDigitHeight?: number;
  textDigitWidth?: number;
  fontSize?: number;
  color?: string;
  gradientAccentColor?: string;
};

// The following component was started for this patreon post:
// AnimatedCount: https://www.patreon.com/posts/animated-text-84712135
// Then it was optimized in this patreon post:
// Airbnb Animated Slider with Reanimated: https://www.patreon.com/posts/airbnb-animated-90962925

// + Stay Tuned because I have a new idea for additional improvements to this component!
// The main issue here is that it's too hard to handle the commas

// This component is used to animate a number by splitting it into digits
// and animating each digit separately.
// The animation in the old post was done by relying on the useState + LayoutAnimation API.

// The point is that since we're binding the animation to a Slider component,
// the updates are going to be very frequent and the LayoutAnimation API is not going to be able to keep up.

// So this is a completely different approach that relies fully on Reanimated.
// We use a shared value to store the count and we use a derived value to extract the digits from the count.
// Then we animate each digit separately.
// This approach is much more efficient and it's going to be able to keep up with the frequent updates.

// But there's a catch: we need to know the maximum number of digits that we're going to have :/
// Of course, we could use a dynamic approach and calculate the number of digits based on the count,
// but that would mean that we would have to re-render the component every time the count changes.
// And that's not what we want (if the amount of digits isn't too big).

const AnimatedCount: FC<AnimatedCountProps> = memo(
  ({
    count,
    maxDigits,
    textDigitHeight = TEXT_DIGIT_HEIGHT,
    textDigitWidth = TEXT_DIGIT_WIDTH,
    fontSize = FONT_SIZE,
    color = TEXT_COLOR,
    gradientAccentColor = '#FFFFFF',
  }) => {
    return (
      <Animated.View
        style={{
          flexDirection: 'row-reverse',
        }}>
        {new Array(maxDigits).fill(0).map((_, index) => {
          return (
            <AnimatedDigit
              maxDigits={maxDigits}
              gradientAccentColor={gradientAccentColor}
              key={index}
              index={index}
              count={count}
              height={textDigitHeight}
              width={textDigitWidth}
              textStyle={{
                color: color,
                fontSize: fontSize,
                fontWeight: 'bold',
              }}
            />
          );
        })}
      </Animated.View>
    );
  },
);

export { AnimatedCount };
