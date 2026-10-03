import { Platform, StyleSheet, Text, View } from 'react-native';

import { memo, useState, type FC } from 'react';

import { Octicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SharedValue } from 'react-native-reanimated';

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
export const HideableNumber: FC<HideableNumberProps> = memo(
  ({ number, hiddenIndexes, index }) => {
    // Check if this number is hidden
    const isHidden = useDerivedValue(
      () => hiddenIndexes.get().includes(index),
      [hiddenIndexes, index],
    );

    // The blur views are invisible at rest (intensity 0, or their layer is at
    // opacity 0), so they're only mounted while this digit animates: 32
    // UIVisualEffectViews updating every frame are the bulk of the cost.
    const [isAnimating, setIsAnimating] = useState(false);

    useAnimatedReaction(
      () => isHidden.get(),
      (hidden, prevHidden) => {
        if (prevHidden !== null && hidden !== prevHidden) {
          scheduleOnRN(setIsAnimating, true);
        }
      },
    );

    // Calculate the animation progress based on whether the number is hidden or not
    const animationProgress = useDerivedValue(
      () =>
        // withDelay is used to stagger the animation of each number
        // based on its index (i.e. 0.1s delay for each number)
        withDelay(
          index * HideableNumberHeight,
          withSpring(
            isHidden.get() ? 1 : 0,
            {
              duration: 700,
              dampingRatio: 1,
            },
            finished => {
              if (finished) scheduleOnRN(setIsAnimating, false);
            },
          ),
        ),
      [isHidden, index],
    );

    // Interpolate the Y position for the dot and text based on animation progress
    const dotPositionY = useDerivedValue(() =>
      interpolate(animationProgress.get(), [0, 1], [-HideableNumberHeight, 0]),
    );
    const textPositionY = useDerivedValue(() =>
      interpolate(animationProgress.get(), [0, 1], [0, HideableNumberHeight]),
    );

    // Define animated styles for dot and text
    const rDotNumberStyle = useAnimatedStyle(() => ({
      opacity: animationProgress.get() ** 3,
      transform: [{ translateY: dotPositionY.get() }],
    }));
    const rTextNumberStyle = useAnimatedStyle(() => ({
      opacity: (1 - animationProgress.get()) ** 3,
      transform: [{ translateY: textPositionY.get() }],
    }));

    // Define animated blur intensity for dot and text
    const animatedTextBlur = useAnimatedProps(() => ({
      intensity: MaxBlurIntensity * animationProgress.get(),
    }));
    const animatedDotBlur = useAnimatedProps(() => ({
      intensity: MaxBlurIntensity * (1 - animationProgress.get()),
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
          {Platform.OS === 'ios' && isAnimating && (
            <AnimatedBlurView
              animatedProps={animatedDotBlur}
              style={StyleSheet.absoluteFill}
              tint={'light'}
            />
          )}
        </Animated.View>
        {/* Animated text */}
        <Animated.View style={[styles.box, rTextNumberStyle]}>
          <Text style={styles.cardNumber}>{number}</Text>
          {Platform.OS === 'ios' && isAnimating && (
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
    height: HideableNumberHeight,
    justifyContent: 'center',
    position: 'absolute',
  },
  cardNumber: {
    fontFamily: 'FiraCode-Regular',
    fontSize: 20,
  },
});
