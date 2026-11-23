import { StyleSheet, TextInput } from 'react-native';

import { useState } from 'react';

import Animated, {
  dispatchCommand,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
} from 'react-native-reanimated';

import type { StyleProp, TextInputProps, TextStyle } from 'react-native';
import type { AnimatedStyle, DerivedValue } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type ReTextProps = Omit<TextInputProps, 'value' | 'defaultValue' | 'style'> & {
  text: DerivedValue<string>;
  style?: StyleProp<AnimatedStyle<StyleProp<TextStyle>>>;
};

// TextInput's own command for replacing its text. The first argument is the
// native event count, which stays 0 because the input is never edited.
const setText = (
  ref: ReturnType<typeof useAnimatedRef<TextInput>>,
  value: string,
) => {
  'worklet';
  dispatchCommand(ref, 'setTextAndSelection', [0, value, -1, -1]);
};

// A text driven by a shared value on the UI thread (the redash ReText idea).
//
// redash's ReText only animates the `text` prop through animatedProps. On
// Fabric that prop reaches the screen through a TextInput state update in a
// layout pass, so the label could freeze when nothing else in the frame
// triggered one (e.g. a slider whose bar moves with a transform), and when
// Reanimated 4 handed the settled prop back to React, TextInput rebuilt its
// text from the frozen `value` and snapped back to the initial string.
//
// Here:
// - every new string is pushed straight to the native view with TextInput's
//   setTextAndSelection command, from the UI thread: what's on screen never
//   depends on a commit or a layout pass;
// - the animated props still carry it as `text` and `defaultValue`, so any
//   React render of the input (settled props, style changes) rebuilds it with
//   the current string instead of the first one.
export const ReText = ({ text, style, ...rest }: ReTextProps) => {
  const ref = useAnimatedRef<TextInput>();
  const [initialText] = useState(() => text.get());

  useAnimatedReaction(
    () => text.get(),
    (value, previous) => {
      if (previous !== null && value !== previous) {
        setText(ref, value);
      }
    },
  );

  const animatedProps = useAnimatedProps(() => {
    const value = text.get();
    return { text: value, defaultValue: value } as TextInputProps;
  });

  return (
    <AnimatedTextInput
      ref={ref}
      underlineColorAndroid="transparent"
      editable={false}
      defaultValue={initialText}
      style={[styles.baseStyle, style]}
      {...rest}
      animatedProps={animatedProps}
    />
  );
};

const styles = StyleSheet.create({
  baseStyle: {
    color: 'black',
  },
});
