import {
  BlurMask,
  Group,
  Path,
  RadialGradient,
  Shadow,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

import type { SharedValue } from 'react-native-reanimated';

type PickerProps = {
  cx: number; // X-coordinate of the circle's center
  cy: number; // Y-coordinate of the circle's center
  radius: number; // Radius of the circle
  strokeWidth: number; // Width of the picker's stroke
  translateX: SharedValue<number>; // Shared value for X translation
  translateY: SharedValue<number>; // Shared value for Y translation
};

// The Picker component creates an interactive, circular picker using Skia.
// It allows users to select a point on a circle's circumference through touch interactions.
// The component uses gesture handling to update the picker's position and
// provides visual feedback with gradients, shadows, and blur effects.
export const Picker: React.FC<PickerProps> = ({
  cx,
  cy,
  radius,
  strokeWidth,
  translateX,
  translateY,
}) => {
  const gesture = useGestureHandler({
    onStart: event => {
      'worklet';
      translateX.set(event.x);
      translateY.set(event.y);
    },
    onActive: event => {
      'worklet';
      translateX.set(event.x);
      translateY.set(event.y);
    },
  });

  const normalizeAngle = (angle: number) => {
    'worklet';
    const twoPi = 2 * Math.PI;
    return (angle + twoPi) % twoPi;
  };

  const theta = useDerivedValue(() => {
    const x = translateX.get() - cx;
    const y = translateY.get() - cy;
    return normalizeAngle(Math.atan2(y, x));
  }, [translateX.get(), translateY.get()]);

  const pickerPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    builder.addCircle(
      radius * Math.cos(theta.get()) + cx,
      radius * Math.sin(theta.get()) + cy,
      strokeWidth / 2,
    );
    return builder.build();
  }, [cx, radius, strokeWidth, theta.get()]);

  const internalPickerPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    builder.addCircle(
      radius * Math.cos(theta.get()) + cx,
      radius * Math.sin(theta.get()) + cy,
      strokeWidth / 2 - 10,
    );
    return builder.build();
  }, [cx, radius, strokeWidth, theta.get()]);

  return (
    <Group>
      <Group>
        <Touchable.Path {...gesture} path={pickerPath}>
          <RadialGradient
            c={vec(cx, cy)}
            r={radius + strokeWidth}
            colors={['#dc3f69', '#f2384d']}
          />
        </Touchable.Path>
        <BlurMask blur={20} style={'solid'} />
      </Group>
      <Path path={internalPickerPath} color={'#FFFFFF'}>
        <Shadow dx={0} dy={20} blur={10} color="#d4d4d4" inner />
      </Path>
    </Group>
  );
};
