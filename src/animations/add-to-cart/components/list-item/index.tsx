import { StyleSheet, Text, View } from 'react-native';

import { useCallback } from 'react';

import { Image } from 'expo-image';
import Animated, {
  measure,
  type MeasuredDimensions,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from './pressable-scale';

import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type ListItemProps<T> = {
  index: number;
  item: T;
  onTap?: (params: {
    item: T;
    index: number;
    layout: MeasuredDimensions;
  }) => void;
  style: StyleProp<ViewStyle>;
  buttonStyle: StyleProp<ViewStyle>;
  selectedIndex: SharedValue<number | null>;
  confirmButtonChildren?: React.ReactNode;
  animationProgress: SharedValue<number>;
};

const ListItem = <
  T extends {
    id: number;
    title: string;
    count: number;
    description: string;
    imageUri: string;
  },
>({
  index,
  item,
  onTap,
  buttonStyle,
  selectedIndex,
  confirmButtonChildren,
  animationProgress,
  style,
}: ListItemProps<T>) => {
  const viewRef = useAnimatedRef<Animated.View>();

  const onPress = useCallback(() => {
    'worklet';
    const layout = measure(viewRef);
    if (onTap)
      scheduleOnRN(onTap, {
        item, // item is the item you passed to the list
        index, // index is the index of the item in the list
        layout: layout ?? {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          pageX: 0,
          pageY: 0,
        },
      });
  }, [index, item, onTap, viewRef]);

  const rButtonContainerStyle = useAnimatedStyle(() => {
    const isAnimating = selectedIndex.value === index;
    return {
      opacity: isAnimating ? 0 : 1,
    };
  }, [index]);

  const rCounterStyle = useAnimatedStyle(() => {
    const isAnimating = selectedIndex.value === index;
    return {
      opacity: isAnimating ? (1 - animationProgress.value) ** 2 : 1,
    };
  }, [index]);

  return (
    <View key={index} style={style}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Image
          cachePolicy={'memory-disk'}
          style={{ height: '65%', aspectRatio: 1, borderRadius: 10 }}
          source={{
            uri: item.imageUri,
          }}
        />
        <View style={{ paddingLeft: 10, justifyContent: 'center' }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>
            {item.title}
          </Text>
          <Text
            numberOfLines={2}
            style={{ maxWidth: '80%', color: 'rgba(0,0,0,0.8)' }}>
            {item.description}
          </Text>
        </View>
      </View>
      <PressableScale onPress={onPress} style={{ overflow: 'visible' }}>
        {Boolean(item.count) && (
          <Animated.View style={[styles.badge, rCounterStyle]}>
            <Text
              style={{
                color: 'white',
                fontSize: 10,
                textAlign: 'center',
                fontWeight: 'bold',
              }}>
              {item.count}
            </Text>
          </Animated.View>
        )}
        <Animated.View
          ref={viewRef}
          style={[buttonStyle, rButtonContainerStyle]}>
          {confirmButtonChildren}
        </Animated.View>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#D12727',
    borderRadius: 10,
    height: 15,
    justifyContent: 'center',
    position: 'absolute',
    right: -2.5,
    top: -2.5,
    zIndex: 100,
  },
});

export { ListItem };

export type { ListItemProps };
