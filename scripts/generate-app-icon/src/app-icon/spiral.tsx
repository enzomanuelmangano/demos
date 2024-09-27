import {
  Group,
  Path,
  RadialGradient,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import React, { useMemo } from 'react';

const interpolate = (
  value: number,
  inputRange: number[],
  outputRange: number[],
) => {
  'worklet';
  if (inputRange.length !== outputRange.length) {
    throw new Error('inputRange and outputRange must have the same length');
  }

  if (value <= inputRange[0]) {
    return outputRange[0];
  }

  if (value >= inputRange[inputRange.length - 1]) {
    const lastIndex = inputRange.length - 1;
    return outputRange[lastIndex];
  }

  for (let i = 1; i < inputRange.length; i++) {
    if (value < inputRange[i]) {
      const t =
        (value - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
      return outputRange[i - 1] + t * (outputRange[i] - outputRange[i - 1]);
    }
  }

  // This should never happen
  return outputRange[outputRange.length - 1];
};

// The logarithmic spiral will depend on the index
const logarithmicSpiral = ({
  angle,
  index,
}: {
  angle: number;
  index: number;
}) => {
  'worklet';
  const a = index / 4;
  const k = 0.005;
  return {
    x: a * Math.exp(k * angle) * Math.cos(angle * index),
    y: a * Math.exp(k * angle) * Math.sin(angle * index),
  };
};

const Spiral = ({
  Skia,
  width,
  height,
  faded = true,
  randomFactor = Math.random(),
  scale = 1,
}: {
  Skia: Skia;
  width: number;
  height: number;
  faded?: boolean;
  randomFactor?: number;
  scale?: number;
}) => {
  const MAX_DISTANCE_FROM_CENTER = Math.sqrt(
    (width / 2) ** 2 + (height / 2) ** 2,
  );

  const angle = (Math.PI * randomFactor) / 2;

  const path = useMemo(() => {
    const circles = Skia.Path.Make();

    for (let index = 0; index < 3000; index++) {
      const { x, y } = logarithmicSpiral({
        angle,
        index,
      });

      const distanceFromCenter = Math.sqrt(x ** 2 + y ** 2);

      const radius = interpolate(
        distanceFromCenter,
        [0, MAX_DISTANCE_FROM_CENTER],
        [0, 7],
      );

      circles.addCircle(x, y, radius);
    }

    return circles;
  }, [MAX_DISTANCE_FROM_CENTER, Skia.Path, angle]);

  return (
    <Group
      transform={[
        {
          translateX: width / 2,
        },
        {
          translateY: height / 2,
        },
        {
          scale: scale,
        },
      ]}>
      <Path path={path} color={'white'}>
        {faded && (
          <RadialGradient
            c={{ x: 0, y: 0 }}
            r={width * 0.5}
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.8)',
              'rgba(255,255,255,1)',
            ]}
          />
        )}
      </Path>
    </Group>
  );
};

export { Spiral };
