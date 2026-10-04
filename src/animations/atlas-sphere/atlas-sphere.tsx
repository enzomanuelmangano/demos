import { StyleSheet, View, Dimensions } from 'react-native';

import React, { useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  Atlas,
  Canvas,
  Circle,
  Skia,
  rect,
  useTexture,
} from 'react-native-skia';

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

// Grid position of every sprite, computed once instead of per frame
const GRID_X = new Float64Array(NUMBER_OF_SQUARES);
const GRID_Y = new Float64Array(NUMBER_OF_SQUARES);
for (let index = 0; index < NUMBER_OF_SQUARES; index++) {
  GRID_X[index] = (index % SQUARES_AMOUNT_HORIZONTAL) * SQUARE_CONTAINER_SIZE;
  GRID_Y[index] =
    Math.floor(index / SQUARES_AMOUNT_HORIZONTAL) * SQUARE_CONTAINER_SIZE;
}

const SQUARE_TEXTURE_SIZE = {
  width: SQUARE_CONTAINER_SIZE,
  height: SQUARE_CONTAINER_SIZE,
};

const MAX_SCALE = 1;
const MIN_SCALE = 0.1;
const SCALE_DISTANCE = MAX_DISTANCE / 4;

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
      progress.set(withSpring(1, { ...SpringConfig, duration: 600 }));
      touchedPoint.set({ x: event.x, y: event.y });
    })
    .onUpdate(event => {
      touchedPoint.set({ x: event.x, y: event.y });
    })
    .onTouchesUp(() => {
      progress.set(withSpring(0, SpringConfig));
    });

  const sprites = useMemo(() => {
    return new Array(NUMBER_OF_SQUARES).fill(0).map(() => {
      return rect(0, 0, SQUARE_SIZE, SQUARE_SIZE);
    });
  }, []);

  const texture = useTexture(BASE_SQUARE, SQUARE_TEXTURE_SIZE);

  // The RSXforms are written in place by a single loop below; the shared
  // value only signals the Atlas to redraw.
  const transforms = useMemo(
    () =>
      makeMutable(
        new Array(NUMBER_OF_SQUARES)
          .fill(0)
          .map((_, index) => Skia.RSXform(1, 0, GRID_X[index], GRID_Y[index])),
      ),
    [],
  );
  // Sprites already collapsed to zero: about half of the grid while
  // dragging, and they don't need another native set() call per frame.
  const hidden = useMemo(() => new Uint8Array(NUMBER_OF_SQUARES), []);

  useAnimatedReaction(
    () => ({ point: touchedPoint.get(), currentProgress: progress.get() }),
    ({ point, currentProgress }) => {
      const progressSquared = currentProgress ** 2;
      const xforms = transforms.get();
      for (let index = 0; index < NUMBER_OF_SQUARES; index++) {
        const tx = GRID_X[index];
        const ty = GRID_Y[index];

        // scale according to the distance from the touched point
        const distanceX = point ? point.x - tx : 0;
        const distanceY = point ? point.y - ty : 0;

        // calculate the distance from the touched point
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        const progressiveDistance = distance * currentProgress;

        // calculate the scaling factor based on distance: same as
        // interpolate(d, [0, SCALE_DISTANCE], [MAX_SCALE, MIN_SCALE]) with the
        // right side clamped, inlined to skip the per-sprite options object.
        const scale =
          progressiveDistance > SCALE_DISTANCE
            ? MIN_SCALE
            : MAX_SCALE +
              (progressiveDistance / SCALE_DISTANCE) * (MIN_SCALE - MAX_SCALE);

        if (scale <= MIN_SCALE) {
          // Hide the square if it's too small
          if (hidden[index] === 0) {
            hidden[index] = 1;
            xforms[index].set(0, 0, 0, 0);
          }
          continue;
        }
        hidden[index] = 0;

        // calculate the translation values with respect to the touched point
        const translatedX = tx + distanceX * (1 - scale) * progressSquared;
        const translatedY = ty + distanceY * (1 - scale) * progressSquared;

        xforms[index].set(scale, 0, translatedX, translatedY);
      }
      // Same array, so force the notification
      transforms.modify(undefined, true);
    },
  );

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
