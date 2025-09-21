import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

type AnimatedDigitProps = {
  digit: number;
  height: number;
  width: number;
  textStyle: StyleProp<TextStyle>;
};

// AnimatedDigit component
const AnimatedDigit: React.FC<AnimatedDigitProps> = React.memo(
  ({ digit, height, width, textStyle }) => {
    // Flatten the textStyle object into a single style object
    const flattenedTextStyle = React.useMemo(() => {
      return StyleSheet.flatten(textStyle);
    }, [textStyle]);

    // Define the animated style for the digit transformation
    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: withSpring(-height * digit, {
              damping: 20,
              stiffness: 300,
              mass: 1,
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
          // Comment this out to see the real trick behind the animation :)
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
