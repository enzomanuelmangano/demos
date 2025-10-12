import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useMemo } from 'react';

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
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type BlurredCardProps = {
  blurredProgress: SharedValue<number>;
};

const BlurredCard = ({ blurredProgress }: BlurredCardProps) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const clipPath = useMemo(() => {
    const skPath = Skia.Path.Make();
    const x = windowWidth / 2 - 150;
    const y = windowHeight / 2 - 100;
    const width = 300;
    const height = 200;
    const r = 20;
    skPath.addRRect(rrect(rect(x, y, width, height), r, r));
    return skPath;
  }, [windowWidth, windowHeight]);

  const blur = useDerivedValue(() => {
    return Math.max(5 * blurredProgress.value, 0);
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

  return (
    <View style={styles.container}>
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
                rotate: (-Math.PI / 2) * progress.value,
              },
              {
                translateX: 25 * index * progress.value,
              },
              { perspective: 10000 },
              {
                rotateY: (Math.PI / 3) * progress.value,
              },
              {
                rotate: (Math.PI / 4) * progress.value,
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
        style={StyleSheet.absoluteFill}
        onPress={() => {
          progress.value = withSpring(progress.value > 0.5 ? 0 : 1, {
            duration: 1500,
            dampingRatio: 0.7,
          });
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
});
