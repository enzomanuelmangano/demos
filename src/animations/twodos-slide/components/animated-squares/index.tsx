import { StyleSheet, View } from 'react-native';

import { useMemo } from 'react';

import { Entypo } from '@expo/vector-icons';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import Animated, {
  clamp,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import { drawSquirclePath } from '../../utils/draw-squircle';

import type { SharedValue } from 'react-native-reanimated';

type AnimatedSquaresProps = {
  clampedProgress: SharedValue<number>;
  progress: SharedValue<number>;
  size: number;
};

const strokeWidth = 9;

const internalSquarePathPadding = 30;
const externalBorderRadius = 25;

export const AnimatedSquares: React.FC<AnimatedSquaresProps> = ({
  progress,
  clampedProgress,
  size,
}) => {
  const baseSquareStyle = useMemo(() => {
    return {
      ...styles.base,
      width: size,
      height: size,
    };
  }, [size]);

  const baseRotation = useDerivedValue(() => {
    return 5 * progress.value + 5;
  }, []);

  // Here we're rotating the squares in opposite directions
  // But we're also scaling the first square a little bit

  // If you look closely you can see that in the transform array we're applying some transformations
  // The first two are moving the square to the bottom right:
  // { translateY: size / 2 },
  // { translateX: size / 2 },
  // the third one is scaling the square (just for the first square):
  // { scale: 1.04 },
  // The fourth one is rotating the square (so since we have translateX and translateY we're rotating around the bottom right corner):
  // { rotate: `${baseRotation.value}deg` },
  // The last two are moving the square back to the original position (since we don't really want to translate the square around the screen, we just want to rotate it around the bottom right corner)
  // { translateX: -size / 2 },
  // { translateY: -size / 2 },

  const rFirstSquareStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: size / 2 },
        { translateX: size / 2 },
        { scale: 1.04 },
        {
          rotate: `${baseRotation.value}deg`,
        },
        { translateX: -size / 2 },
        { translateY: -size / 2 },
      ],
    };
  }, []);

  const rSecondSquareStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: size / 2 },
        { translateX: size / 2 },
        {
          rotate: `${-1.2 * baseRotation.value}deg`,
        },
        { translateX: -size / 2 },
        { translateY: -size / 2 },
      ],
    };
  }, []);

  const rectPath = useMemo(() => {
    // These are 3 different ways to achieve almost the same result.
    // As always the beauty lies in details.
    // 1. The first one is using the drawSquirclePath function
    return drawSquirclePath({
      borderSmoothing: 1,
      borderRadius: 20,
      width: size - internalSquarePathPadding * 2 + strokeWidth,
      height: size - internalSquarePathPadding * 2 + strokeWidth,
    });

    // 2. The second one is using the drawRRectWithLines function (basically it's all about different borders)
    // return drawRRectWithLines({
    //   size: size,
    //   innerBorderRadius,
    //   internalSquarePathPadding,
    // });

    // 3. This is the easiest way to draw a rounded rectangle but we don't have control over the start/end of the path
    // const path = Skia.Path.Make();

    // return path.addRRect(
    //   rrect(
    //     rect(
    //       internalSquarePathPadding,
    //       internalSquarePathPadding,
    //       size - internalSquarePathPadding * 2,
    //       size - internalSquarePathPadding * 2,
    //     ),
    //     innerBorderRadius,
    //     innerBorderRadius,
    //   ),
    // );
  }, [size]);

  const pathProgress = useDerivedValue(() => {
    return clamp(clampedProgress.value, 0, 1);
  }, []);

  return (
    <Animated.View
      style={{
        height: size,
        width: size,
      }}>
      <Animated.View
        style={[
          baseSquareStyle,
          {
            backgroundColor: '#DEB986',
          },
          rFirstSquareStyle,
        ]}>
        <Canvas
          style={{
            flex: 1,
          }}>
          <Group
            transform={[
              {
                translateX: internalSquarePathPadding - strokeWidth / 2,
              },
              {
                translateY: internalSquarePathPadding - strokeWidth / 2,
              },
            ]}>
            <Path
              path={rectPath}
              color={'#f4dbbd'}
              style={'stroke'}
              strokeWidth={strokeWidth}
            />
            <Path
              path={rectPath}
              color={'#2a2a2a'}
              style={'stroke'}
              strokeCap={'round'}
              strokeWidth={strokeWidth}
              start={0}
              end={pathProgress}
            />
          </Group>
        </Canvas>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}>
          <Entypo name="check" size={size / 2.8} color="#2a2a2a" />
        </View>
      </Animated.View>
      <Animated.View
        style={[
          baseSquareStyle,
          {
            backgroundColor: '#f4dbbd',
            zIndex: -1,
          },
          rSecondSquareStyle,
        ]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderCurve: 'continuous',
    borderRadius: externalBorderRadius,
    boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.1)',
    position: 'absolute',
  },
});
