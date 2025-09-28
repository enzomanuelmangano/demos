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
      context.value = {
        x: firstCx.value,
        y: firstCy.value,
      };
    },
    onActive: ({ translationX, translationY }) => {
      'worklet';
      firstCx.value = context.value.x + translationX;
      firstCy.value = context.value.y + translationY;
    },
  });

  const secondCx = useSharedValue(width / 2);
  const secondCy = useSharedValue(height / 2);

  const secondCircleGesture = useGestureHandler({
    onStart: _ => {
      'worklet';
      context.value = {
        x: secondCx.value,
        y: secondCy.value,
      };
    },
    onActive: ({ translationX, translationY }) => {
      'worklet';
      secondCx.value = context.value.x + translationX;
      secondCy.value = context.value.y + translationY;
    },
    onEnd: () => {
      'worklet';
      secondCx.value = withSpring(width / 2);
      secondCy.value = withSpring(height / 2);
    },
  });

  const path = useDerivedValue(() => {
    const circles = Skia.Path.Make();
    circles.addCircle(firstCx.value, firstCy.value, RADIUS);
    circles.addCircle(secondCx.value, secondCy.value, RADIUS);
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
