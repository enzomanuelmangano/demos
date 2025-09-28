import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

/**
 * Props for the StaggeredDigit component
 */
type StaggeredDigitProps = {
  /** The character to be animated */
  digit: string;
  /** Animation progress value (0 to 1) */
  progress: SharedValue<number>;
  /** Font size of the digit */
  fontSize?: number;
  /** Height of the font for animation calculations */
  fontHeight?: number;
  /** Additional text styles to be applied */
  textStyle?: StyleProp<TextStyle>;
};

const DefaultFontSize = 50;
const DefaultFontHeight = DefaultFontSize + 5;

/**
 * A component that animates a single character with a 3D flip effect.
 * Used internally by StaggeredText to create character-by-character animations.
 *
 * The animation consists of two copies of the same character:
 * 1. Top character that rotates down and fades out
 * 2. Bottom character that rotates up and fades in
 *
 * @internal This component is intended for internal use by StaggeredText
 */
export const StaggeredDigit: React.FC<StaggeredDigitProps> = ({
  digit,
  progress,
  fontSize = DefaultFontSize,
  fontHeight = DefaultFontHeight,
  textStyle,
}) => {
  const rStyle = useAnimatedStyle(() => {
    const rotateX = `${progress.value * 90}deg`;
    return {
      opacity: 1 - progress.value,
      transform: [
        {
          perspective: 1000,
        },
        {
          translateY: (-progress.value * fontHeight) / 2,
        },
        {
          rotateX,
        },
      ],
    };
  });

  const rBottomDigitStyle = useAnimatedStyle(() => {
    const rotateX = interpolate(progress.value, [0, 1], [-90, 0]);
    const translateY = interpolate(progress.value, [0, 1], [fontHeight / 2, 0]);
    return {
      opacity: progress.value,
      transform: [
        {
          translateY,
        },
        {
          rotateX: `${rotateX}deg`,
        },
      ],
    };
  });

  return (
    <Animated.View style={styles.container}>
      <Animated.Text
        style={[
          styles.digit,
          {
            fontSize,
          },
          rStyle,
          textStyle,
        ]}>
        {digit}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.digit,
          {
            position: 'absolute',
            fontSize,
          },
          rBottomDigitStyle,
          textStyle,
        ]}>
        {digit}
      </Animated.Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    color: 'white',
  },
});
