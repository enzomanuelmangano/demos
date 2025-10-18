import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import {
  DEFAULT_WHITE,
  WindowWidth,
  type ThemeDataType,
} from '../../constants';

export const ListItemSize = WindowWidth / 4.8;

const MAX_ROTATE_Y = 30;

// This code is really a mess 😅
// It's all about the Calculator Style
// I just played A LOT with the interpolation
// Because I wanted to recreate badly the same animation
// Made by AcuteCalc

export const ListItemCard = ({
  item,
  progress,
  onPress,
}: {
  item: ThemeDataType;
  index: number;
  progress: SharedValue<number>;
  onPress?: () => void;
}) => {
  const rStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(
      progress.value,
      [-1, 1],
      [-MAX_ROTATE_Y, MAX_ROTATE_Y],
      Extrapolation.CLAMP,
    );

    // My suggestion here is to play with the values
    // Comment and try to change them to see the effect
    // It's all about playing with the values until you get the desired effect
    return {
      transform: [
        { perspective: 500 },
        {
          translateX: -progress.value * 8,
        },
        {
          scale: 1 - Math.abs(progress.value) * 0.025,
        },
        {
          rotateY: `${rotateY}deg`,
        },
      ],
    };
  }, []);

  //   That's just a ridiculous logic to color the circles 👀
  const colorByIndex = useCallback(
    (index: number) => {
      if (index < 2) {
        return DEFAULT_WHITE;
      }
      if ((index + 1) % 3 === 0) return item.primary;

      return item.secondary;
    },
    [item.primary, item.secondary],
  );

  const itemWidth = ListItemSize * 1.2;
  const itemHeight = itemWidth / 0.7;

  return (
    <Animated.View
      onTouchEnd={() => {
        onPress && onPress();
      }}
      style={[
        styles.card,
        {
          width: itemWidth,
          height: itemHeight,
        },
        rStyle,
      ]}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        start={{
          x: 0,
          y: 0,
        }}
        end={{
          x: 1,
          y: 0,
        }}
        colors={['#343f3dff', '#242d2bff']}
      />
      <View style={{ flex: 2 }} />
      <View style={styles.listContainer}>
        {new Array(9).fill(0).map((_, i) => {
          return (
            <View
              key={i}
              style={{
                width: itemWidth / 3.5,
                height: itemWidth / 3.5,
                padding: 2.5,
              }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 100,
                  backgroundColor: colorByIndex(i),
                  borderCurve: 'continuous',
                }}
              />
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderRadius: 15,
    overflow: 'hidden',
  },
  listContainer: {
    flex: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
});
