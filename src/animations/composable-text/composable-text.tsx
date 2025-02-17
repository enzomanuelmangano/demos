import type { TextStyle, ViewStyle, StyleProp } from 'react-native';
import React, { useMemo } from 'react';
import Animated, {
  LinearTransition,
  FadeOut,
  FadeIn,
  LayoutAnimationConfig,
} from 'react-native-reanimated';

// Props interface for the ComposableText component
type ComposableTextProps = {
  text: string; // The text to be animated
  style?: StyleProp<TextStyle>; // Optional style for each character
  containerStyle?: StyleProp<ViewStyle>; // Optional style for the container
};

// A memoized component that renders text with per-character animations
export const ComposableText = React.memo(
  ({ text, style, containerStyle }: ComposableTextProps) => {
    // Generate unique keys for each character to maintain animation stability
    // This is necessary when the same character appears multiple times
    const buildKeys = useMemo(() => {
      const charCounts: Record<string, number> = {};
      return text.split('').map(char => {
        const count = charCounts[char] || 0;
        charCounts[char] = count + 1;
        return `${char}-${count}`; // Creates keys like 'a-0', 'a-1' for repeated chars
      });
    }, [text]);

    return (
      // Layout animation wrapper that skips enter animation
      <LayoutAnimationConfig skipEntering>
        {/* Container for all characters with spring-based layout transitions */}
        <Animated.View
          style={[{ flexDirection: 'row' }, containerStyle]}
          layout={LinearTransition.springify()
            .mass(0.4)
            .damping(12)
            .stiffness(100)}>
          {/* Map each character to an animated text component */}
          {text.split('').map((char, index) => {
            return (
              <Animated.Text
                key={buildKeys[index]}
                // Entrance animation: fade in with scale
                entering={FadeIn.duration(200)
                  .withInitialValues({ transform: [{ scale: 0.5 }] })
                  .springify()
                  .mass(0.3)
                  .damping(12)
                  .stiffness(80)}
                // Exit animation: simple fade out
                exiting={FadeOut.duration(200)}
                // Layout animation for position changes
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

// Component display name for debugging purposes
ComposableText.displayName = 'ComposableText';
