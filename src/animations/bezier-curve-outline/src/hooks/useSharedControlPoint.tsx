import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

type Point = {
  x: number;
  y: number;
};

export const useSharedControlPoint = (initialPoint: Point) => {
  const controlPoint = useSharedValue(initialPoint);
  const cx = useDerivedValue(() => {
    return controlPoint.value.x;
  });

  const cy = useDerivedValue(() => {
    return controlPoint.value.y;
  });

  return { controlPoint, cx, cy };
};
