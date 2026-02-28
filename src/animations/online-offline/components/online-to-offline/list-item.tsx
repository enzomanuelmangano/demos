import { StyleSheet } from 'react-native';

import { memo } from 'react';

import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { LayoutTransition } from './animations';

import type { ItemProps } from './types';

export const ListItem = memo(
  ({
    item,
    leftPosition,
    itemSize,
    listColor,
    isOffline,
    zIndex,
  }: ItemProps) => {
    const grayscaleProgress = useDerivedValue(() => {
      return withTiming(isOffline ? 1 : 0, {
        duration: 300,
        easing: Easing.linear,
      });
    }, [isOffline]);

    const animatedStyle = useAnimatedStyle(() => {
      return {
        filter: [{ grayscale: grayscaleProgress.value }],
      };
    });

    return (
      <Animated.View
        key={item}
        layout={LayoutTransition}
        style={[
          styles.item,
          {
            left: leftPosition,
            width: itemSize,
            height: itemSize,
            borderRadius: itemSize / 2,
            borderColor: listColor,
            borderCurve: 'continuous',
            zIndex,
          },
        ]}>
        <Animated.Image
          source={{ uri: item }}
          style={[styles.image, animatedStyle]}
          resizeMode="cover"
        />
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  image: {
    height: '100%',
    width: '100%',
  },
  item: {
    backgroundColor: '#fff',
    borderWidth: 3,
    overflow: 'hidden',
    position: 'absolute',
  },
});
