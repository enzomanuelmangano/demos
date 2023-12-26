import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';
import {
  Blur,
  ColorMatrix,
  Group,
  Paint,
  Path,
  Skia,
  SweepGradient,
  useComputedValue,
  useValue,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';

const RADIUS = 80;

export function Metaball() {
  const { width, height } = useWindowDimensions();

  const firstCx = useValue(width / 2);
  const firstCy = useValue(height / 2);

  const circleGesture = useGestureHandler<{
    x: number;
    y: number;
  }>({
    onStart: (_, context) => {
      context.x = firstCx.current;
      context.y = firstCy.current;
    },
    onActive: ({ translationX, translationY }, context) => {
      firstCx.current = context.x + translationX;
      firstCy.current = context.y + translationY;
    },
  });

  const secondCx = useValue(width / 2);
  const secondCy = useValue(height / 2);

  const secondCircleGesture = useGestureHandler<{
    x: number;
    y: number;
  }>({
    onStart: (_, context) => {
      context.x = secondCx.current;
      context.y = secondCy.current;
    },
    onActive: ({ translationX, translationY }, context) => {
      secondCx.current = context.x + translationX;
      secondCy.current = context.y + translationY;
    },
  });

  const path = useComputedValue(() => {
    const circles = Skia.Path.Make();
    circles.addCircle(firstCx.current, firstCy.current, RADIUS);
    circles.addCircle(secondCx.current, secondCy.current, RADIUS);
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
      <StatusBar style="light" />
      <Touchable.Canvas style={{ flex: 1 }}>
        <Group layer={paint}>
          <Path path={path}>
            <SweepGradient c={vec(0, 0)} colors={['cyan', 'blue', 'cyan']} />
          </Path>
        </Group>
        <Touchable.Circle
          cx={secondCx}
          cy={secondCy}
          r={(RADIUS / 60) * 30}
          {...secondCircleGesture}
          color={'transparent'}
        />
        <Touchable.Circle
          cx={firstCx}
          cy={firstCy}
          r={(RADIUS / 60) * 30}
          {...circleGesture}
          color={'transparent'}
        />
      </Touchable.Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});
