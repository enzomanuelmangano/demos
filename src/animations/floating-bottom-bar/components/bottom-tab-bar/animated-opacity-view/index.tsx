import React from 'react';
import type { ViewProps } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const AnimatedOpacityView: React.FC<
  ViewProps & {
    activeIndex: SharedValue<number>;
    index: number;
  }
> = ({ index, activeIndex, style, ...viewProps }) => {
  const rStyle = useAnimatedStyle(() => {
    const opacity = withTiming(activeIndex.value === index ? 1 : 0.5);

    return {
      opacity,
    };
  }, [index]);

  return <Animated.View style={[style, rStyle]} {...viewProps} />;
};

export { AnimatedOpacityView };
