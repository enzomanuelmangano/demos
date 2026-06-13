import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useMemo, useState } from 'react';

import {
  BackdropBlur,
  Blur,
  Canvas,
  Group,
  Path,
  RadialGradient,
  rect,
  Rect,
  rrect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { PressableOpacity } from 'pressto';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SharedValue } from 'react-native-reanimated';

type BlurredCardProps = {
  blurredProgress: SharedValue<number>;
};

const BlurredCard = ({ blurredProgress }: BlurredCardProps) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const clipPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    const x = windowWidth / 2 - 150;
    const y = windowHeight / 2 - 100;
    const width = 300;
    const height = 200;
    const r = 20;
    builder.addRRect(rrect(rect(x, y, width, height), r, r));
    return builder.build();
  }, [windowWidth, windowHeight]);

  const blur = useDerivedValue(() => {
    return Math.max(5 * blurredProgress.get(), 0);
  });

  return (
    <Group>
      <Path path={clipPath} color={'rgba(255, 255, 255, 0.1)'} />
      <Path
        path={clipPath}
        style={'stroke'}
        strokeWidth={2}
        opacity={blurredProgress}
        color={'rgba(255, 255, 255, 0.2)'}
      />
      <BackdropBlur blur={blur} clip={clipPath} />
    </Group>
  );
};

export const BlurCards = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const progress = useSharedValue(0);

  // e2e outcome probe: the fan/collapse state lives in a Skia worklet with no
  // inspectable React state, so we bridge progress crossing the halfway point
  // back to JS. Visually negligible (alpha ~0.01).
  const [status, setStatus] = useState<'collapsed' | 'fanned'>('collapsed');
  useAnimatedReaction(
    () => progress.get() > 0.5,
    (fanned, prev) => {
      if (prev === null || fanned === prev) return;
      scheduleOnRN(setStatus, fanned ? 'fanned' : 'collapsed');
    },
  );

  return (
    <View style={styles.container}>
      <Text testID="blur-cards-status" style={styles.statusProbe}>
        {status}
      </Text>
      <Canvas style={styles.canvas}>
        <Rect x={0} y={0} width={windowWidth} height={windowHeight}>
          <RadialGradient
            c={vec(windowWidth / 2, windowHeight / 2)}
            r={Math.min(windowWidth, windowHeight) / 2}
            colors={['violet', 'black']}
          />
          <Blur blur={100} />
        </Rect>
        {new Array(5).fill(0).map((_, index) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const transform = useDerivedValue(() => {
            return [
              {
                rotate: (-Math.PI / 2) * progress.get(),
              },
              {
                translateX: 25 * index * progress.get(),
              },
              { perspective: 10000 },
              {
                rotateY: (Math.PI / 3) * progress.get(),
              },
              {
                rotate: (Math.PI / 4) * progress.get(),
              },
            ];
          }, [index]);

          return (
            <Group
              key={index}
              origin={vec(windowWidth / 2, windowHeight / 2)}
              transform={transform}>
              <BlurredCard blurredProgress={progress} />
            </Group>
          );
        })}
      </Canvas>
      <PressableOpacity
        testID="blur-cards-canvas"
        style={StyleSheet.absoluteFill}
        onPress={() => {
          progress.set(
            withSpring(progress.get() > 0.5 ? 0 : 1, {
              duration: 1500,
              dampingRatio: 0.7,
            }),
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: 'black',
    opacity: 0.012,
    zIndex: 10,
  },
});
