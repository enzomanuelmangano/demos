import { type ReactNode } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

type StoryListItemProps<T> = {
  story: T;
  index: number;
  scrollOffset: SharedValue<number>;
  itemWidth: number;
  itemHeight: number;
  paddingLeft: number;
  renderItem: (item: T, index: number) => ReactNode;
};

function StoryListItem<T>({
  story,
  index,
  scrollOffset,
  itemWidth,
  itemHeight,
  paddingLeft,
  renderItem,
}: StoryListItemProps<T>) {
  const rStyle = useAnimatedStyle(() => {
    const activeIndex = scrollOffset.value / itemWidth;

    const translateX = interpolate(
      activeIndex,
      [index - 2, index - 1, index, index + 1],
      [70, 35, 0, -itemWidth - paddingLeft * 2],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      activeIndex,
      [index - 2, index - 1, index, index + 1],
      [0.8, 0.9, 1, 1],
      Extrapolation.CLAMP,
    );

    return {
      left: paddingLeft,
      transform: [
        {
          translateX: translateX,
        },
        { scale },
      ],
    };
  }, [index, itemWidth, paddingLeft]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          width: itemWidth,
          height: itemHeight,
          zIndex: -index,
        },
        rStyle,
      ]}>
      {renderItem(story, index)}
    </Animated.View>
  );
}

export { StoryListItem };
export type { StoryListItemProps };
