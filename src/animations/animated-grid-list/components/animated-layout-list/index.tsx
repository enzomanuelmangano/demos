import { type ReactElement, useCallback } from 'react';

import Animated, {
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

export type AnimatedLayoutListProps<T> = {
  data: T[];
  renderItem: (item: T, index: number, isExpanded: boolean) => ReactElement;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  layout?: 'grid' | 'list';
};

enum Direction {
  Up = -1,
  Down = 1,
  None = 0,
}

const MAX_ROTATE_DEG = 20;
const MIN_ROTATE_DEG = -20;

function AnimatedLayoutList<T>({
  data,
  renderItem,
  style,
  contentContainerStyle,
  layout = 'list',
}: AnimatedLayoutListProps<T>) {
  const isExpanded = layout === 'list';

  const isScrolling = useSharedValue(false);
  const direction = useSharedValue(Direction.None);
  const lastOffset = useSharedValue(0);

  const onScrollEnd = useCallback(() => {
    'worklet';
    isScrolling.value = false;
    direction.value = Direction.None;
  }, [direction, isScrolling]);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: ({ contentOffset: { y } }) => {
      lastOffset.value = y;
    },
    onScroll: ({ contentOffset: { y } }) => {
      isScrolling.value = true;
      direction.value = y > lastOffset.value ? Direction.Down : Direction.Up;
    },
    onEndDrag: event => {
      if (event.velocity?.y === 0 && event.velocity?.x === 0) {
        onScrollEnd();
      }
    },
    onMomentumEnd: () => {
      onScrollEnd();
    },
  });

  const rotation = useDerivedValue(() => {
    'worklet';

    if (isScrolling.value && direction.value !== Direction.None) {
      return direction.value === Direction.Up
        ? `${MAX_ROTATE_DEG}deg`
        : `${MIN_ROTATE_DEG}deg`;
    }
    return '0deg';
  }, []);

  const rAnimatedStyle = useAnimatedStyle(() => {
    const rotate = withSpring(rotation.value, {
      dampingRatio: 1,
      duration: 500,
    });

    return {
      transform: [
        {
          perspective: 500,
        },
        {
          rotateX: rotate,
        },
      ],
    };
  }, []);

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={[
        {
          overflow: 'visible',
        },
        style,
      ]}
      contentContainerStyle={[
        {
          flexWrap: 'wrap',
          flexDirection: 'row',
        },
        contentContainerStyle,
      ]}>
      {data.map((item, i) => (
        <Animated.View
          key={i}
          layout={LinearTransition.duration(700)}
          style={[
            {
              height: isExpanded ? 100 : 120,
              aspectRatio: isExpanded ? undefined : 1,
              width: isExpanded ? '90%' : `${(100 - 15) / 2}%`,
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              marginBottom: 20,
              marginLeft: '5%',
              overflow: 'hidden',
              borderCurve: 'continuous',
            },
            rAnimatedStyle,
          ]}>
          {renderItem(item, i, isExpanded)}
        </Animated.View>
      ))}
    </Animated.ScrollView>
  );
}

export { AnimatedLayoutList };
