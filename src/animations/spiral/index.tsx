import { Dimensions, StyleSheet, View } from 'react-native';

import { useMemo } from 'react';

import {
  BlurMask,
  Canvas,
  Extrapolate,
  Group,
  interpolate,
  Path,
  SweepGradient,
  usePathValue,
  vec,
} from '@shopify/react-native-skia';
import { PressableWithoutFeedback } from 'pressto';
import {
  makeMutable,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { logarithmicSpiral } from './utils';

import type { SharedValue } from 'react-native-reanimated';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const spiralCircleCount = 1400;
const TimingConfig = {
  duration: 1500,
};

export const Spiral = (dimensions?: { width: number; height: number }) => {
  const { width, height } = {
    width: windowWidth,
    height: windowHeight,
    ...dimensions,
  };

  const MAX_DISTANCE_FROM_CENTER = Math.sqrt(
    (width / 2) ** 2 + (height / 2) ** 2,
  );

  const angle = useSharedValue(Math.PI / 2);

  const spiralCoordinates = useMemo(() => {
    const coordinates: SharedValue<{ x: number; y: number }>[] = [];
    for (let index = 0; index < spiralCircleCount; index++) {
      const coordinate = makeMutable(
        logarithmicSpiral({
          angle: angle.get(),
          index,
        }),
      );
      coordinates.push(coordinate);
    }
    return coordinates;
  }, [angle]);

  useAnimatedReaction(
    () => angle.get(),
    newAngle => {
      for (let index = 0; index < spiralCircleCount; index++) {
        spiralCoordinates[index].set(
          withTiming(
            logarithmicSpiral({
              angle: newAngle,
              index,
            }),
            TimingConfig,
          ),
        );
      }
    },
  );

  const path = usePathValue(skPath => {
    'worklet';

    for (let index = 0; index < spiralCircleCount; index++) {
      const { x, y } = spiralCoordinates[index].value;

      const distanceFromCenter = Math.sqrt(x ** 2 + y ** 2);

      const radius = interpolate(
        distanceFromCenter,
        [0, MAX_DISTANCE_FROM_CENTER],
        [1.2, 0.2],
        Extrapolate.CLAMP,
      );

      skPath.addCircle(x, y, radius);
    }

    return skPath;
  });

  return (
    <View style={{ flex: 1 }}>
      <Canvas style={{ flex: 1, backgroundColor: '#010101' }}>
        <Group
          transform={[
            {
              translateX: width / 2,
            },
            {
              translateY: height / 2,
            },
          ]}>
          <Path path={path} />
          <SweepGradient
            c={vec(0, 0)}
            colors={['cyan', 'magenta', 'yellow', 'cyan']}
          />
          <BlurMask blur={5} style="solid" />
        </Group>
      </Canvas>
      <PressableWithoutFeedback
        onPress={() => {
          angle.set(Math.PI * 2 * Math.random());
        }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};
