import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { Dot } from './dot';

import type { SharedValue } from 'react-native-reanimated';

type DotsProps = {
  count: number;
  activeIndex: SharedValue<number>;
  dotSize: number;
};

export const Dots: FC<DotsProps> = memo(({ count, activeIndex, dotSize }) => {
  const dotSpacing = 20;
  const externalSpacing = dotSpacing;
  const height = dotSize + 20;

  const rBarStyle = useAnimatedStyle(() => {
    // Here we calculate the width of the bar based on the active index
    // The maxWidth = (count) * dotSize + (count - 1) * dotSpacing + externalSpacing
    // So by knowing the maxWidth, we can easily replace the count with (activeIndex + 1)
    // and get the general formula for the activeWidth
    const activeWidth =
      (activeIndex.value + 1) * dotSize +
      activeIndex.value * dotSpacing +
      externalSpacing;

    return {
      // Spring animations, spring animations everywhere!
      width: withSpring(activeWidth),
    };
  }, []);

  return (
    <View
      style={[
        {
          paddingHorizontal: externalSpacing / 2,
          gap: dotSpacing,
        },
        styles.container,
      ]}>
      <Animated.View
        style={[
          {
            height,
          },
          styles.bar,
          rBarStyle,
        ]}
      />
      {new Array(count).fill(null).map((_, index) => {
        return (
          <Dot
            key={index}
            index={index}
            activeIndex={activeIndex}
            dotSize={dotSize}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#66e070',
    borderCurve: 'continuous',
    borderRadius: 100,
    position: 'absolute',
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
