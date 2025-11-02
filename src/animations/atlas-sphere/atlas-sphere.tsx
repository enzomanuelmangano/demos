import { StyleSheet, View, Dimensions } from 'react-native';

import React, { useMemo } from 'react';

import {
  Atlas,
  Canvas,
  Circle,
  Extrapolate,
  rect,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SQUARES_AMOUNT_HORIZONTAL = 40;
const SQUARE_CONTAINER_SIZE = Math.floor(
  SCREEN_WIDTH / (SQUARES_AMOUNT_HORIZONTAL * 1.2),
);
const CANVAS_WIDTH = SQUARES_AMOUNT_HORIZONTAL * SQUARE_CONTAINER_SIZE;
// const PADDING = 10;
const SQUARE_SIZE = 3; //SQUARE_CONTAINER_SIZE - PADDING;
const CANVAS_HEIGHT = SCREEN_HEIGHT - 200;
const SQUARES_AMOUNT_VERTICAL = Math.floor(
  CANVAS_HEIGHT / SQUARE_CONTAINER_SIZE,
);

const MAX_DISTANCE = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);

const NUMBER_OF_SQUARES = SQUARES_AMOUNT_HORIZONTAL * SQUARES_AMOUNT_VERTICAL;

const SQUARE_TEXTURE_SIZE = {
  width: SQUARE_CONTAINER_SIZE,
  height: SQUARE_CONTAINER_SIZE,
};

const MAX_SCALE = 1;
const MIN_SCALE = 0.1;

const BASE_SQUARE = (
  <Circle
    cx={SQUARE_SIZE / 2}
    cy={SQUARE_SIZE / 2}
    r={SQUARE_SIZE / 2}
    color="#00f7ffff"
  />
);

const SpringConfig = {
  duration: 1000,
  dampingRatio: 1,
};

export const AtlasSphere = () => {
  const touchedPoint = useSharedValue<{ x: number; y: number } | null>(null);

  const progress = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(event => {
      progress.value = withSpring(1, { ...SpringConfig, duration: 600 });
      touchedPoint.value = { x: event.x, y: event.y };
    })
    .onUpdate(event => {
      touchedPoint.value = { x: event.x, y: event.y };
    })
    .onTouchesUp(() => {
      progress.value = withSpring(0, SpringConfig);
    });

  const sprites = useMemo(() => {
    return new Array(NUMBER_OF_SQUARES).fill(0).map(() => {
      return rect(0, 0, SQUARE_SIZE, SQUARE_SIZE);
    });
  }, []);

  const texture = useTexture(BASE_SQUARE, SQUARE_TEXTURE_SIZE);

  const transforms = useRSXformBuffer(NUMBER_OF_SQUARES, (val, index) => {
    'worklet';

    const tx = (index % SQUARES_AMOUNT_HORIZONTAL) * SQUARE_CONTAINER_SIZE;
    const ty =
      Math.floor(index / SQUARES_AMOUNT_HORIZONTAL) * SQUARE_CONTAINER_SIZE;

    // scale according to the distance from the touched point
    const touchedPointX = touchedPoint.value?.x ?? tx;
    const touchedPointY = touchedPoint.value?.y ?? ty;

    const distanceX = touchedPointX - tx;
    const distanceY = touchedPointY - ty;

    // calculate the distance from the touched point
    const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

    const progressiveDistance = distance * progress.value;

    // calculate the scaling factor based on distance
    const scale = interpolate(
      progressiveDistance,
      [0, MAX_DISTANCE / 4],
      [MAX_SCALE, MIN_SCALE],
      {
        extrapolateRight: Extrapolate.CLAMP,
      },
    );

    if (scale <= MIN_SCALE) {
      // Hide the square if it's too small
      return val.set(0, 0, 0, 0);
    }

    // calculate the translation values with respect to the touched point
    const translatedX = tx + distanceX * (1 - scale) * progress.value ** 2;
    const translatedY = ty + distanceY * (1 - scale) * progress.value ** 2;

    val.set(scale, 0, translatedX, translatedY);
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View>
          <Canvas
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
            }}>
            <Atlas image={texture} sprites={sprites} transforms={transforms} />
          </Canvas>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'center',
    paddingTop: 70,
  },
});
