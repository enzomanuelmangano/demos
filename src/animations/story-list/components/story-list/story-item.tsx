import { StyleSheet } from 'react-native';

import { type ReactNode } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type StoryListItemProps<T> = {
  story: T;
  index: number;
  style?: StyleProp<ViewStyle>;
  translateX: SharedValue<number>;
  activeIndex: SharedValue<number>;
  itemWidth: number;
  renderItem: (item: T, index: number) => ReactNode;
  visibleItems: number;
  gap: number;
};

function StoryListItem<T>({
  story,
  index,
  style,
  translateX,
  activeIndex,
  itemWidth,
  renderItem,
  visibleItems,
  gap,
}: StoryListItemProps<T>) {
  const width = (StyleSheet.flatten(style).width as number) ?? 0;

  // This is where the magic happens
  const rStyle = useAnimatedStyle(() => {
    // This is the trick to make the items appear one after the other
    // with a small gap between them (35)
    // Note that since we want to see maximum 3 items at a time
    // we need to limit the left value to 2 * 35
    // Feel free to play with the values to see the effect on the UI
    // Example:
    // const left = Math.min(index - activeIndex.value, 20) * 20;
    const left = Math.min(index - activeIndex.value, visibleItems - 1) * gap;

    // scale the items to make the active item bigger
    const scale = 1 - (index - activeIndex.value) * 0.1;

    // We just want to translate the items that have been swiped
    // or that are currently active
    const translateVal =
      index <= activeIndex.value ? translateX.value + index * itemWidth : 0;

    return {
      left,
      transform: [
        {
          scale,
        },
        {
          translateX: translateVal,
        },
      ],
    };
  }, [index]);

  return (
    <Animated.View
      key={index}
      style={[
        {
          position: 'absolute',
          top: 0,
          width,
          height: width,
        },
        style,
        rStyle,
      ]}>
      {/* Just in order to make the component reusable */}
      {renderItem(story, index)}
    </Animated.View>
  );
}

export { StoryListItem };
export type { StoryListItemProps };
