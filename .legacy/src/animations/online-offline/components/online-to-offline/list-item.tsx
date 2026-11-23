import { Image, StyleSheet } from 'react-native';

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
        filter: `grayscale(${grayscaleProgress.get()})`,
      };
    });

    // The filter goes on the container, not on the Image: on iOS a filter
    // wraps the view's content in a SwiftUI host, and for an Image that host
    // often never paints the bitmap, so avatars stayed blank until they moved.
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
          animatedStyle,
        ]}>
        <Image source={{ uri: item }} style={styles.image} resizeMode="cover" />
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
    borderWidth: 3,
    overflow: 'hidden',
    position: 'absolute',
  },
});
