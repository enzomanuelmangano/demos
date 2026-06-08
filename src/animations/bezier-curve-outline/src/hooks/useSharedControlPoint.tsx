import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

type Point = {
  x: number;
  y: number;
};

export const useSharedControlPoint = (initialPoint: Point) => {
  const controlPoint = useSharedValue(initialPoint);
  const cx = useDerivedValue(() => {
    return controlPoint.get().x;
  });

  const cy = useDerivedValue(() => {
    return controlPoint.get().y;
  });

  return { controlPoint, cx, cy };
};
