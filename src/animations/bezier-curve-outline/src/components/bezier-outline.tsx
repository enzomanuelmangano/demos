import { StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';
import type { SkPath } from '@shopify/react-native-skia';
import { Circle, Group, Path, Skia } from '@shopify/react-native-skia';

import { useSharedControlPoint } from '../hooks/useSharedControlPoint';

import { InitialPoints } from './constants';

type BezierOutlineProps = {
  onPathUpdate: (path: SkPath) => void;
};

export const BezierOutline = ({ onPathUpdate }: BezierOutlineProps) => {
  const first = useSharedControlPoint(InitialPoints.first);
  const second = useSharedControlPoint(InitialPoints.second);
  const third = useSharedControlPoint(InitialPoints.third);
  const fourth = useSharedControlPoint(InitialPoints.fourth);
  const controlPoints = [first, second, third, fourth];

  const bezierPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();

    skPath.moveTo(first.cx.value, first.cy.value);
    skPath.cubicTo(
      second.cx.value,
      second.cy.value,
      third.cx.value,
      third.cy.value,
      fourth.cx.value,
      fourth.cy.value,
    );
    onPathUpdate(skPath);
    return skPath;
  }, []);

  const bezierPathVisualization = useDerivedValue(() => {
    const skPath = Skia.Path.Make();

    skPath.moveTo(first.cx.value, first.cy.value);
    skPath.lineTo(second.cx.value, second.cy.value);

    skPath.moveTo(third.cx.value, third.cy.value);
    skPath.lineTo(fourth.cx.value, fourth.cy.value);

    return skPath;
  }, []);

  return (
    <View style={styles.container}>
      <Touchable.Canvas
        style={{
          flex: 1,
        }}>
        <Path
          path={bezierPath}
          color={'rgba(255, 255, 255, 0.4)'}
          style={'stroke'}
          strokeWidth={1}
        />
        <Path
          path={bezierPathVisualization}
          color={'rgba(255, 255, 255, 0.1)'}
          style={'stroke'}
          strokeWidth={1}
        />
        {controlPoints.map(({ cx, cy, controlPoint }, index) => {
          const onUpdate = (event: { x: number; y: number }) => {
            'worklet';
            controlPoint.value = { x: event.x, y: event.y };
          };

          const isStartOrEnd = index === 0 || index === 3;

          const color = isStartOrEnd
            ? 'rgba(255, 255, 255, 0.4)'
            : 'rgba(255, 255, 255, 0.2)';

          return (
            <Group key={index}>
              <Touchable.Circle
                cx={cx}
                cy={cy}
                onStart={onUpdate}
                onActive={onUpdate}
                r={isStartOrEnd ? 12 : 10}
                color={color}
                strokeWidth={2}
                style={'stroke'}
              />
              <Circle
                cx={cx}
                cy={cy}
                r={isStartOrEnd ? 12 : 10}
                color={'#202020'}
                strokeWidth={2}
                style={'fill'}
              />
            </Group>
          );
        })}
      </Touchable.Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
});
