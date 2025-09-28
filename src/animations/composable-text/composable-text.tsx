import { memo, useMemo } from 'react';

import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
} from 'react-native-reanimated';

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

type ComposableTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
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
                entering={FadeIn.duration(200)
                  .withInitialValues({ transform: [{ scale: 0.5 }] })
                  .springify()
                  .mass(0.3)
                  .damping(12)
                  .stiffness(80)}
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
