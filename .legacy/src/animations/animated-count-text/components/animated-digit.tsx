import { StyleSheet, Text } from 'react-native';

import { type FC, memo, useMemo } from 'react';

import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import type { StyleProp, TextStyle } from 'react-native';

type AnimatedDigitProps = {
  digit: number;
  height: number;
  width: number;
  textStyle: StyleProp<TextStyle>;
};

const AnimatedDigit: FC<AnimatedDigitProps> = memo(
  ({ digit, height, width, textStyle }) => {
    const flattenedTextStyle = useMemo(() => {
      return StyleSheet.flatten(textStyle);
    }, [textStyle]);

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: withSpring(-height * digit, {
              duration: 1000,
              dampingRatio: 0.9,
            }),
          },
        ],
      };
    });

    return (
      <Animated.View
        layout={LinearTransition.duration(800)}
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(250)}
        style={{
          height,
          width,
          overflow: 'hidden',
        }}>
        <Animated.View
          style={[
            {
              flexDirection: 'column',
            },
            rStyle,
          ]}>
          {/* 
            In summary, this code snippet creates and renders a series of <Text> components, 
            one for each digit from 0 to 9. The purpose of this is to display the possible 
            digits as individual elements inside the animated digit component. 
          */}
          {new Array(10).fill(0).map((_, index) => {
            return (
              <Text
                key={index}
                style={{
                  ...flattenedTextStyle,
                  width,
                  height,
                  textAlign: 'center',
                  textAlignVertical: 'center',
                }}>
                {index}
              </Text>
            );
          })}
        </Animated.View>
      </Animated.View>
    );
  },
);

export { AnimatedDigit };
