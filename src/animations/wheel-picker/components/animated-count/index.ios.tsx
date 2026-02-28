import { StyleSheet } from 'react-native';

import { memo, useMemo } from 'react';

import { Host } from '@expo/ui/swift-ui';
import {
  contentTransition,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
} from '@expo/ui/swift-ui/modifiers';
import { requireNativeView } from 'expo';
import Animated, { useAnimatedProps } from 'react-native-reanimated';

import type { AnimatedCountProps } from './types';

const TEXT_DIGIT_HEIGHT = 60;
const TEXT_DIGIT_WIDTH = 35;
const FONT_SIZE = 50;
const TEXT_COLOR = 'black';

const TextNativeView = requireNativeView('ExpoUI', 'TextView');
const AnimatedTextNativeView = Animated.createAnimatedComponent(TextNativeView);

const SPRING_ANIMATION = { type: 'spring', duration: 0.3 } as const;

export const AnimatedCount = memo(
  ({
    count,
    textDigitHeight = TEXT_DIGIT_HEIGHT,
    textDigitWidth = TEXT_DIGIT_WIDTH,
    fontSize = FONT_SIZE,
    color = TEXT_COLOR,
    maxDigits,
    style,
  }: AnimatedCountProps) => {
    const containerWidth = textDigitWidth * maxDigits;
    const containerHeight = textDigitHeight;

    const flattenedStyle = StyleSheet.flatten([
      {
        width: containerWidth,
        height: containerHeight,
      },
      style,
    ]);

    const staticModifiers = useMemo(
      () => [
        contentTransition('numericText'),
        font({ size: fontSize, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        frame({ maxWidth: 9999, alignment: 'center' }),
        foregroundStyle(color),
      ],
      [fontSize, color],
    );

    const animatedProps = useAnimatedProps(() => {
      const currentCount = count.value;
      return {
        text: currentCount.toString(),
        modifiers: [
          ...staticModifiers,
          {
            $type: 'animation',
            animation: SPRING_ANIMATION,
            animatedValue: currentCount,
          },
        ],
      };
    });

    return (
      <Host style={flattenedStyle}>
        <AnimatedTextNativeView
          text="0"
          modifiers={[
            ...staticModifiers,
            {
              $type: 'animation',
              animation: SPRING_ANIMATION,
              animatedValue: 0,
            },
          ]}
          animatedProps={animatedProps}
        />
      </Host>
    );
  },
);
