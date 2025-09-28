import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type DotProps = {
  index: number;
  // This active index can also just be a number
  // but using a SharedValue helps with performance (since we're not going to re-render the component)
  activeIndex: SharedValue<number>;
  dotSize: number;
};

export const Dot: React.FC<DotProps> = ({ index, activeIndex, dotSize }) => {
  const rDotStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(
        // Change background color based on whether the dot is active
        activeIndex.value >= index ? 'white' : 'rgba(0,0,0,0.15)',
        {
          duration: 200, // Animation duration in milliseconds
        },
      ),
    };
  }, [index]);

  return (
    <Animated.View
      key={index}
      style={[
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
        },
        rDotStyle,
      ]}
    />
  );
};
