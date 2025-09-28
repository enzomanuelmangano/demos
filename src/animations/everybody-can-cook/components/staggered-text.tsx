import {
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  StyleSheet,
  View,
} from 'react-native';

import { forwardRef, useImperativeHandle } from 'react';

import {
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { StaggeredDigit } from './staggered-digit';

import type { ForwardedRef } from 'react';

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
    const progress = useSharedValue(0);

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
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const delayedProgress = useDerivedValue(() => {
            'worklet';

            if (progress.value === 0 && !enableReverse) {
              return 0;
            }

            const delayMs = index * 40 + delay;
            return withDelay(
              delayMs,
              withSpring(progress.value, {
                duration: 350,
                dampingRatio: 2.8,
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
