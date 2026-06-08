import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useMemo } from 'react';

import {
  Blur,
  ColorMatrix,
  Group,
  Paint,
  Path,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

const RADIUS = 80;

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
    const circles = Skia.Path.Make();
    circles.addCircle(firstCx.get(), firstCy.get(), RADIUS);
    circles.addCircle(secondCx.get(), secondCy.get(), RADIUS);
    circles.simplify();
    return circles;
  }, [firstCx, firstCy, secondCx, secondCy]);

  const paint = useMemo(() => {
    return (
      <Paint>
        <Blur blur={30} />
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
        <Group layer={paint}>
          <Path path={path}>
            <SweepGradient c={vec(0, 0)} colors={['cyan', 'blue', 'cyan']} />
          </Path>
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
