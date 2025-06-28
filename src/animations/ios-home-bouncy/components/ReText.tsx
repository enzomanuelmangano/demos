import React, { useMemo } from 'react';
import type { TextInputProps, TextProps as RNTextProps } from 'react-native';
import { StyleSheet, TextInput } from 'react-native';
import type { AnimateProps, SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedProps } from 'react-native-reanimated';

const styles = StyleSheet.create({
  baseStyle: {
    color: 'black',
  },
});

Animated.addWhitelistedNativeProps({ text: true });

interface TextProps extends Omit<TextInputProps, 'value' | 'style'> {
  text: SharedValue<string>;
  style?: AnimateProps<RNTextProps>['style'];
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * ReText component displays animated text that updates based on a SharedValue
 * Uses TextInput under the hood for performant text updates
 *
 * Adapted from Redash (wcandillon)
 * https://raw.githubusercontent.com/wcandillon/react-native-redash/refs/heads/master/src/ReText.tsx
 */
export const ReText = (props: TextProps) => {
  const { style, text, ...rest } = props;
  const initialValue = useMemo(() => text.get(), [text]);
  const animatedProps = useAnimatedProps(() => {
    return {
      text: text.value,
      // Here we use any because the text prop is not available in the type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });
  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={initialValue}
      style={[styles.baseStyle, style || undefined]}
      {...rest}
      {...{ animatedProps }}
    />
  );
};
