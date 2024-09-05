import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

type HideableNumberProps = {
  number: string;
  hiddenIndexes: SharedValue<number[]>;
  index: number;
};

const HideableNumberHeight = 25;
const MaxBlurIntensity = 25;
const DotSize = 14;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// Component to display a number that can be hidden
export const HideableNumber: React.FC<HideableNumberProps> = React.memo(
  ({ number, hiddenIndexes, index }) => {
    // Check if this number is hidden
    const isHidden = useDerivedValue(
      () => hiddenIndexes.value.includes(index),
      [hiddenIndexes, index],
    );

    // Calculate the animation progress based on whether the number is hidden or not
    const animationProgress = useDerivedValue(
      () =>
        // withDelay is used to stagger the animation of each number
        // based on its index (i.e. 0.1s delay for each number)
        withDelay(
          index * HideableNumberHeight,
          withSpring(isHidden.value ? 1 : 0, {
            mass: 0.75,
          }),
        ),
      [isHidden, index],
    );

    // Interpolate the Y position for the dot and text based on animation progress
    const dotPositionY = useDerivedValue(() =>
      interpolate(animationProgress.value, [0, 1], [-HideableNumberHeight, 0]),
    );
    const textPositionY = useDerivedValue(() =>
      interpolate(animationProgress.value, [0, 1], [0, HideableNumberHeight]),
    );

    // Define animated styles for dot and text
    const rDotNumberStyle = useAnimatedStyle(() => ({
      opacity: animationProgress.value ** 3,
      transform: [{ translateY: dotPositionY.value }],
    }));
    const rTextNumberStyle = useAnimatedStyle(() => ({
      opacity: (1 - animationProgress.value) ** 3,
      transform: [{ translateY: textPositionY.value }],
    }));

    // Define animated blur intensity for dot and text
    const animatedTextBlur = useAnimatedProps(() => ({
      intensity: MaxBlurIntensity * animationProgress.value,
    }));
    const animatedDotBlur = useAnimatedProps(() => ({
      intensity: MaxBlurIntensity * (1 - animationProgress.value),
    }));

    return (
      <View
        style={{ width: 11, overflow: 'hidden', height: HideableNumberHeight }}>
        {/* Animated dot */}
        <Animated.View style={[styles.box, rDotNumberStyle]}>
          <Octicons
            name="dot-fill"
            style={{ paddingTop: 3 }}
            size={DotSize}
            color="black"
          />
          {Platform.OS === 'ios' && (
            <AnimatedBlurView
              animatedProps={animatedDotBlur}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
        {/* Animated text */}
        <Animated.View style={[styles.box, rTextNumberStyle]}>
          <Text style={styles.cardNumber}>{number}</Text>
          {Platform.OS === 'ios' && (
            <AnimatedBlurView
              animatedProps={animatedTextBlur}
              style={StyleSheet.absoluteFill}
            />
          )}
        </Animated.View>
      </View>
    );
  },
);

// Styles
const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    height: HideableNumberHeight,
    justifyContent: 'center',
  },
  cardNumber: {
    fontFamily: 'FiraCode-Regular',
    fontSize: 20,
  },
});
