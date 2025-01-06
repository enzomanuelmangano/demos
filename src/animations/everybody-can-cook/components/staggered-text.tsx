import React, {
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  StyleSheet,
  View,
} from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { ForwardedRef } from 'react';
import { forwardRef, useImperativeHandle } from 'react';

import { StaggeredDigit } from './staggered-digit';

/**
 * Props for the StaggeredText component
 */
type StaggeredTextProps = {
  /** The text to be animated */
  text: string;
  /** Delay in milliseconds before starting the animation */
  delay?: number;
  /** Font size of the text */
  fontSize?: number;
  /** Additional text styles to be applied */
  textStyle?: StyleProp<TextStyle>;
  /** Additional container styles to be applied */
  containerStyle?: StyleProp<ViewStyle>;
  /** Enable reverse animation support */
  enableReverse?: boolean;
};

/**
 * Ref methods exposed by the StaggeredText component
 */
export type StaggeredTextRef = {
  /** Starts the staggered animation */
  animate: () => void;
  /** Resets the animation to its initial state */
  reset: () => void;
  /** Toggles between forward and reverse animation (requires enableReverse prop) */
  toggleAnimate: () => void;
};

/**
 * A component that creates a staggered animation effect for text.
 * Each character of the text animates individually with a slight delay,
 * creating a wave-like animation effect.
 *
 * @example
 * ```tsx
 * const textRef = useRef<StaggeredTextRef>(null);
 *
 * <StaggeredText
 *   text="Hello World"
 *   ref={textRef}
 *   fontSize={50}
 *   delay={300}
 * />
 *
 * // Trigger animation
 * textRef.current?.animate();
 * ```
 */
export const StaggeredText = forwardRef(
  (
    {
      text,
      delay = 0,
      fontSize = 50,
      textStyle,
      containerStyle,
      enableReverse = false,
    }: StaggeredTextProps,
    ref: ForwardedRef<StaggeredTextRef>,
  ) => {
    // Shared value to control the animation progress (0 to 1)
    const progress = useSharedValue(0);

    // Expose methods through the ref
    useImperativeHandle(ref, () => ({
      animate: () => {
        setTimeout(() => {
          progress.value = 1;
        }, 0);
      },
      reset: () => {
        progress.value = 0;
      },
      toggleAnimate: () => {
        if (!enableReverse) {
          console.warn(
            'You must add the "enableReverse" prop to the StaggeredText to support the toggleAnimate method',
          );
          return;
        }
        progress.value = progress.value === 0 ? 1 : 0;
      },
    }));

    return (
      <View style={[styles.container, containerStyle]}>
        {text.split('').map((char, index) => {
          // Create a delayed progress value for each character
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const delayedProgress = useDerivedValue(() => {
            'worklet';

            if (progress.value === 0 && !enableReverse) {
              return 0;
            }

            // Calculate delay based on character index
            const delayMs = index * 60 + delay;
            return withDelay(
              delayMs,
              withTiming(progress.value, {
                duration: 500,
                // Smooth easing curve for natural animation
                // https://www.easing.dev/in-out-quad
                easing: Easing.bezier(0.455, 0.03, 0.515, 0.955),
              }),
            );
          }, []);

          return (
            <StaggeredDigit
              key={index}
              digit={char}
              progress={delayedProgress}
              fontSize={fontSize}
              textStyle={textStyle}
            />
          );
        })}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
