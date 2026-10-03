import { memo, useMemo } from 'react';

import Animated, {
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  withSpring,
} from 'react-native-reanimated';

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  AnimatedStyle,
  EntryExitAnimationFunction,
} from 'react-native-reanimated';

const CharacterSpringConfig = { mass: 0.3, damping: 12, stiffness: 80 };

// Each character springs in from half size. Reanimated 4.5's FadeIn keeps only
// the opacity of withInitialValues, so the scale needs its own animation.
const CharacterEntering: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.5 }] },
    animations: {
      opacity: withSpring(1, CharacterSpringConfig),
      transform: [{ scale: withSpring(1, CharacterSpringConfig) }],
    },
  };
};

type ComposableTextProps = {
  text: string;
  style?: StyleProp<AnimatedStyle<TextStyle>>;
  containerStyle?: StyleProp<ViewStyle>;
};

export const ComposableText = memo(
  ({ text, style, containerStyle }: ComposableTextProps) => {
    // Generate unique keys for each character to maintain animation stability
    // This is necessary when the same character appears multiple time
    const buildKeys = useMemo(() => {
      const charCounts: Record<string, number> = {};
      return text.split('').map(char => {
        const count = charCounts[char] || 0;
        charCounts[char] = count + 1;
        return `${char}-${count}`; // Creates keys like 'a-0', 'a-1' for repeated chars
      });
    }, [text]);

    return (
      <LayoutAnimationConfig skipEntering>
        <Animated.View
          style={[{ flexDirection: 'row' }, containerStyle]}
          layout={LinearTransition.springify()
            .mass(0.4)
            .damping(12)
            .stiffness(100)}>
          {text.split('').map((char, index) => {
            return (
              <Animated.Text
                key={buildKeys[index]}
                entering={CharacterEntering}
                exiting={FadeOut.duration(200)}
                layout={LinearTransition.springify()
                  .mass(0.3)
                  .damping(12)
                  .stiffness(80)}
                style={style}>
                {char}
              </Animated.Text>
            );
          })}
        </Animated.View>
      </LayoutAnimationConfig>
    );
  },
);

ComposableText.displayName = 'ComposableText';
