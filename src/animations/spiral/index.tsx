import { Dimensions, StyleSheet, View } from 'react-native';

import { PressableWithoutFeedback } from 'pressto';
import {
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
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

import {
  createSpringArrayState,
  retargetSpringArray,
  stepSpringArray,
} from './spring-array';
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

  // Every circle's coordinates, flattened as [x0, y0, x1, y1, ...], sprung
  // together toward the spiral for the new angle. spring-array.ts steps them
  // exactly as withSpring(TimingConfig) steps each coordinate, in one frame
  // callback instead of ~3400 animation objects, and stops once they rest.
  const springs = useSharedValue(
    createSpringArrayState(spiralPositions(angle.get())),
  );
  // Bumped on every stepped frame so the path rebuilds.
  const frame = useSharedValue(0);

  useFrameCallback(({ timestamp }) => {
    'worklet';
    const state = springs.get();
    if (!state.running) {
      // At rest: nothing to step, and the path is left as it is.
      return;
    }
    stepSpringArray(state, timestamp);
    frame.set(frame.get() + 1);
  });

  useAnimatedReaction(
    () => angle.get(),
    (newAngle, previousAngle) => {
      if (previousAngle === null) {
        return;
      }
      retargetSpringArray(
        springs.get(),
        spiralPositions(newAngle),
        TimingConfig.duration,
      );
    },
  );

  const path = usePathValue(skPath => {
    'worklet';

    frame.get();
    const coordinates = springs.get().current;
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
