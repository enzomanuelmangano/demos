import { Dimensions, StyleSheet, View } from 'react-native';

import { PressableWithoutFeedback } from 'pressto';
import {
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Group,
  Path,
  SweepGradient,
  usePathValue,
  vec,
} from 'react-native-skia';

import { logarithmicSpiral } from './utils';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const spiralCircleCount = Math.floor(windowHeight * 1.8);
const spiralPositions = (angle: number) => {
  'worklet';
  const positions: number[] = new Array(spiralCircleCount * 2);
  for (let index = 0; index < spiralCircleCount; index++) {
    const { x, y } = logarithmicSpiral({ angle, index });
    positions[index * 2] = x;
    positions[index * 2 + 1] = y;
  }
  return positions;
};

const TimingConfig = {
  duration: 3000,
  dampingRatio: 1,
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

  // Every circle's coordinates, flattened as [x0, y0, x1, y1, ...], in one
  // shared value. Reanimated springs each element of an animated array on
  // its own, exactly as it springs each key of an {x, y} object, so the
  // motion is the same as one shared value per circle, without ~1700 shared
  // values to update and read every frame.
  const spiralCoordinates = useSharedValue(spiralPositions(angle.get()));

  useAnimatedReaction(
    () => angle.get(),
    newAngle => {
      spiralCoordinates.set(
        withSpring(spiralPositions(newAngle), TimingConfig),
      );
    },
  );

  const path = usePathValue(skPath => {
    'worklet';

    const coordinates = spiralCoordinates.get();
    for (let index = 0; index < spiralCircleCount; index++) {
      const x = coordinates[index * 2];
      const y = coordinates[index * 2 + 1];

      const distanceFromCenter = Math.sqrt(x ** 2 + y ** 2);

      // interpolate(distance, [0, max], [1.2, 0.2], CLAMP), inlined so the
      // loop allocates nothing per circle.
      const progress = Math.min(
        Math.max(distanceFromCenter / MAX_DISTANCE_FROM_CENTER, 0),
        1,
      );
      const radius = 1.2 - progress;

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
