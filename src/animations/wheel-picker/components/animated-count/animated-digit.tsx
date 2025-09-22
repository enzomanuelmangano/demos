import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import type { ColorValue, StyleProp, TextStyle } from 'react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type AnimatedDigitProps = {
  index: number;
  count: SharedValue<number>;
  height: number;
  width: number;
  textStyle: StyleProp<TextStyle>;
  maxDigits: number;
  gradientAccentColor: string;
};

const getDigitByIndex = ({
  digitIndex,
  count,
  maxDigits,
}: {
  digitIndex: number;
  count: number;
  maxDigits: number;
}) => {
  'worklet';

  const paddedValue = count.toString().padStart(maxDigits, '0');

  return parseInt(
    paddedValue.toString().split('')?.[maxDigits - 1 - digitIndex] ?? 0,
    10,
  );
};

const BASE_TRANSPARENTS_COLOR_GRADIENT = [
  '#FFFFFF00',
  '#FFFFFF00',
  '#FFFFFF00',
];

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const AnimatedDigit: React.FC<AnimatedDigitProps> = React.memo(
  ({
    height,
    width,
    textStyle,
    index,
    count,
    maxDigits,
    gradientAccentColor,
  }) => {
    const TOP_GRADIENT = [
      gradientAccentColor,
      ...BASE_TRANSPARENTS_COLOR_GRADIENT,
    ];
    const BOTTOM_GRADIENT = [
      ...BASE_TRANSPARENTS_COLOR_GRADIENT,
      gradientAccentColor,
    ];

    const digit = useDerivedValue(() => {
      return getDigitByIndex({
        digitIndex: index,
        count: count.value,
        maxDigits: maxDigits,
      });
    }, [index]);

    // Calculate the amount of invisible (leading) digits.
    // for instance, if the maxDigits is 5 and the count is 123, then the invisible digits are 2.
    // Since count -> 00123
    const invisibleDigitsAmount = useDerivedValue(() => {
      return maxDigits - count.value.toString().length;
    }, [maxDigits]);

    const isVisible = useDerivedValue(() => {
      const isZero = digit.value === 0;

      if (!isZero) return true;

      return index < maxDigits - invisibleDigitsAmount.value;
    }, [index, maxDigits]);

    const flattenedTextStyle = React.useMemo(() => {
      return StyleSheet.flatten(textStyle);
    }, [textStyle]);

    // We need a way to track if the digit is changing
    // This is useful for the blur effect
    const isChanging = useSharedValue(false);

    const resetIsChanging = useCallback(() => {
      setTimeout(() => {
        isChanging.value = false;
        // We can improve by far this logic
        // But honestly, it's good enough for me :)
      }, 200);
    }, [isChanging]);

    useAnimatedReaction(
      () => {
        return digit.value;
      },
      (curr, prev) => {
        isChanging.value = curr !== prev;
        runOnJS(resetIsChanging)();
      },
    );

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateY: withSpring(-height * digit.value, {
              mass: 0.25,
            }),
          },
          {
            scaleX: withSpring(isChanging.value ? 0.7 : 1),
          },
        ],
      };
    }, [height]);

    const opacity = useDerivedValue(() => {
      return withTiming(isVisible.value ? 1 : 0);
    }, []);

    const rContainerStyle = useAnimatedStyle(() => {
      return {
        opacity: opacity.value,
        transform: [
          {
            translateX: withTiming((-width * invisibleDigitsAmount.value) / 2),
          },
        ],
      };
    });

    const isChangingProgress = useDerivedValue(() => {
      return withTiming(isChanging.value ? 1 : 0);
    }, []);

    const blurIntensity = useDerivedValue<number | undefined>(() => {
      return isChangingProgress.value * 17;
    }, []);

    return (
      <Animated.View
        style={[
          {
            height,
            width,
            // Comment this out to see the real trick behind the animation :)
            overflow: 'hidden',
          },
          rContainerStyle,
        ]}>
        {Platform.OS === 'ios' && (
          <AnimatedBlurView
            style={[
              StyleSheet.absoluteFill,
              {
                zIndex: 10,
              },
            ]}
            intensity={blurIntensity}
          />
        )}
        <LinearGradient
          style={[
            styles.gradientContainer,
            {
              height,
            },
          ]}
          colors={TOP_GRADIENT as [ColorValue, ColorValue, ...ColorValue[]]}
        />
        <LinearGradient
          style={[
            styles.gradientContainer,
            {
              height,
            },
          ]}
          colors={BOTTOM_GRADIENT as [ColorValue, ColorValue, ...ColorValue[]]}
        />
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
          {new Array(10).fill(0).map((_, textIndex) => {
            return (
              <Text
                key={textIndex}
                style={{
                  ...flattenedTextStyle,
                  width,
                  height,
                  textAlign: 'center',
                  textAlignVertical: 'center',
                  fontFamily: 'SF-Pro-Rounded-Bold',
                }}>
                {textIndex}
              </Text>
            );
          })}
        </Animated.View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  gradientContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
});

export { AnimatedDigit };
