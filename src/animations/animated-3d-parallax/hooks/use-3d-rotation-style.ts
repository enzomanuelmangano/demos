import type { SharedValue } from 'react-native-reanimated';
import { interpolate, useAnimatedStyle } from 'react-native-reanimated';

type Use3DRotationStyleParams = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  maxSize: number;
  maxRotation: number;
  perspective?: number;
};

// If you want to fully understand the math behind this function,
// I've made in the past a video about it: https://youtu.be/pVesCl7TY8A
const use3DRotationStyle = ({
  x,
  y,
  maxSize,
  maxRotation,
  perspective = 500,
}: Use3DRotationStyleParams) => {
  const rStyle = useAnimatedStyle(() => {
    const rotateX = interpolate(
      y.value,
      [0, maxSize],
      [maxRotation, -maxRotation],
    );

    const rotateY = interpolate(
      x.value,
      [0, maxSize],
      [-maxRotation, maxRotation],
    );

    return {
      transform: [
        { perspective: perspective },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
      ],
    };
  }, []);

  return {
    rRotationStyle: rStyle,
  };
};

export { use3DRotationStyle };
