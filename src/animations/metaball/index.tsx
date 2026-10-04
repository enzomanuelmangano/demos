import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useMemo } from 'react';

import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  Blur,
  ColorMatrix,
  Group,
  Paint,
  Path,
  rect,
  Skia,
  SweepGradient,
  vec,
} from 'react-native-skia';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

const RADIUS = 80;
const BLUR = 30;
// The blur kernel stops at 3σ, and the alpha threshold zeroes anything that
// faint anyway, so nothing is drawn further than this from a circle's centre.
const LAYER_MARGIN = RADIUS + 3 * BLUR + 2;

export function Metaball() {
  const { width, height } = useWindowDimensions();

  const firstCx = useSharedValue(width / 2);
  const firstCy = useSharedValue(height / 2);

  const context = useSharedValue({
    x: width / 2,
    y: height / 2,
  });
  const circleGesture = useGestureHandler({
    onStart: _ => {
      'worklet';
      context.set({
        x: firstCx.get(),
        y: firstCy.get(),
      });
    },
    onActive: ({ translationX, translationY }) => {
      'worklet';
      firstCx.set(context.get().x + translationX);
      firstCy.set(context.get().y + translationY);
    },
  });

  const secondCx = useSharedValue(width / 2);
  const secondCy = useSharedValue(height / 2);

  const secondCircleGesture = useGestureHandler({
    onStart: _ => {
      'worklet';
      context.set({
        x: secondCx.get(),
        y: secondCy.get(),
      });
    },
    onActive: ({ translationX, translationY }) => {
      'worklet';
      secondCx.set(context.get().x + translationX);
      secondCy.set(context.get().y + translationY);
    },
    onEnd: () => {
      'worklet';
      secondCx.set(withSpring(width / 2));
      secondCy.set(withSpring(height / 2));
    },
  });

  const path = useDerivedValue(() => {
    // Both circles wind the same way, so the default fill already draws
    // their union — what simplify() used to bake into the path.
    return Skia.PathBuilder.Make()
      .addCircle(firstCx.get(), firstCy.get(), RADIUS)
      .addCircle(secondCx.get(), secondCy.get(), RADIUS)
      .build();
  }, [firstCx, firstCy, secondCx, secondCy]);

  // Bounds the blur layer to the two circles instead of the whole screen.
  const layerClip = useDerivedValue(() => {
    const minX = Math.min(firstCx.get(), secondCx.get()) - LAYER_MARGIN;
    const minY = Math.min(firstCy.get(), secondCy.get()) - LAYER_MARGIN;
    const maxX = Math.max(firstCx.get(), secondCx.get()) + LAYER_MARGIN;
    const maxY = Math.max(firstCy.get(), secondCy.get()) + LAYER_MARGIN;
    return rect(minX, minY, maxX - minX, maxY - minY);
  }, [firstCx, firstCy, secondCx, secondCy]);

  const paint = useMemo(() => {
    return (
      <Paint>
        <Blur blur={BLUR} />
        <ColorMatrix
          matrix={[
            // R, G, B, A, Position
            // prettier-ignore
            1, 0, 0, 0, 0,
            // prettier-ignore
            0, 1, 0, 0, 0,
            // prettier-ignore
            0, 0, 1, 0, 0,
            // prettier-ignore
            0, 0, 0, 60, -30,
          ]}
        />
      </Paint>
    );
  }, []);

  return (
    <View style={styles.container}>
      <Touchable.Canvas style={{ flex: 1 }}>
        {/* The clip sits outside the layer so it bounds the offscreen surface */}
        <Group clip={layerClip}>
          <Group layer={paint}>
            <Path path={path}>
              <SweepGradient c={vec(0, 0)} colors={['cyan', 'blue', 'cyan']} />
            </Path>
          </Group>
        </Group>
        <Touchable.Circle
          cx={secondCx}
          cy={secondCy}
          r={RADIUS}
          {...secondCircleGesture}
          color={'transparent'}
        />
        <Touchable.Circle
          cx={firstCx}
          cy={firstCy}
          r={RADIUS}
          {...circleGesture}
          color={'transparent'}
        />
      </Touchable.Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A0A',
    flex: 1,
  },
});
