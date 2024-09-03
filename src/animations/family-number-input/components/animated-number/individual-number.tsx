// Import necessary modules and types from React and React Native
import React, { useEffect } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  Layout,
  SlideOutDown,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Define the props for the AnimatedSingleNumber component
type AnimatedSingleNumberProps = {
  // Value can be a number (0-9) or a string (',')
  value: number | string;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
  index: number;
  itemWidth: number;
  itemHeight: number;
  totalNumbersLength: number;
  rightSpace?: number;
  scale: number;
  scaleWidthOffset?: number;
};

// AnimatedSingleNumber component definition
export const AnimatedSingleNumber: React.FC<AnimatedSingleNumberProps> = ({
  value,
  style,
  index,
  itemHeight,
  itemWidth,
  totalNumbersLength,
  containerStyle,
  rightSpace,
  scale,
  scaleWidthOffset = 0,
}) => {
  // The real trick here is to use the SharedValues to handle the "entering" animation.
  // Basically we render the numbers with opacity 0 and bottom -50.
  // Then in the useEffect we trigger the animation to bottom 0 and opacity 1.
  // The whole point is that we have much more control over the animation this way.

  // The exiting animation instead is handled by the Layout Animations from Reanimated.
  // Honestly they are MAGICAL. I'm still trying to understand how they work.
  // I would have like to handle the exiting animation with SharedValues too,
  // but I didn't find a way to do it.
  // The problem is that handling the "exiting" means "stopping" the unmouting of the component
  // until the animation is finished. And I have absolutely no idea how to do it 👀

  // Shared values for animation
  const bottom = useSharedValue(-50);
  const opacity = useSharedValue(0);

  // Calculate the scaled item width based on scale and offset
  const scaledItemWidth = useDerivedValue(() => {
    return itemWidth * (scale + scaleWidthOffset);
  }, [itemWidth, scale]);

  // Effect to trigger animations on mount
  useEffect(() => {
    bottom.value = withTiming(0);
    opacity.value = withTiming(1);
  }, [bottom, opacity]);

  // Animated style for positioning and scaling
  const rStyle = useAnimatedStyle(() => {
    const left = (index - totalNumbersLength / 2) * scaledItemWidth.value;

    return {
      bottom: bottom.value,
      opacity: opacity.value,
      left: withTiming(left + (rightSpace ?? 0), {
        duration: 200,
      }),
      transform: [{ scale: withTiming(scale) }],
    };
  }, [index, itemWidth, totalNumbersLength]);

  // Render the AnimatedSingleNumber component
  return (
    // I'm using two Animated.View here because I want to handle the exiting animation
    // with both a FadeOut and a SlideOutDown animation.
    <Animated.View layout={Layout} exiting={FadeOut.duration(100)}>
      <Animated.View
        layout={Layout}
        exiting={SlideOutDown.duration(3000).easing(Easing.linear)}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: itemWidth,
              height: itemHeight,
            },
            rStyle,
            containerStyle,
          ]}>
          <Animated.Text
            style={[
              {
                position: 'absolute',
              },
              style,
            ]}>
            {value}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};
