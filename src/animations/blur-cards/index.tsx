import { Dimensions, StyleSheet, View } from 'react-native';

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
import { StatusBar } from 'expo-status-bar';
import {
  clamp,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const { width: WindowWidth, height: WindowHeight } = Dimensions.get('window');

type BlurredCardProps = {
  blurredProgress: SharedValue<number>;
};

const BlurredCard = ({ blurredProgress }: BlurredCardProps) => {
  const clipPath = useMemo(() => {
    const skPath = Skia.Path.Make();
    const x = WindowWidth / 2 - 150;
    const y = WindowHeight / 2 - 100;
    const width = 300;
    const height = 200;
    const r = 20;
    skPath.addRRect(rrect(rect(x, y, width, height), r, r));
    return skPath;
  }, []);

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
  const progress = useSharedValue(0);

  // Create transforms outside of the map to avoid violating React's rules of hooks
  const transform0 = useDerivedValue(() => {
    return [
      {
        rotate: (-Math.PI / 2) * progress.value,
      },
      {
        translateX: 25 * 0 * progress.value,
      },
      { perspective: 10000 },
      {
        rotateY: (Math.PI / 3) * progress.value,
      },
      {
        rotate: (Math.PI / 4) * progress.value,
      },
    ];
  });

  const transform1 = useDerivedValue(() => {
    return [
      {
        rotate: (-Math.PI / 2) * progress.value,
      },
      {
        translateX: 25 * 1 * progress.value,
      },
      { perspective: 10000 },
      {
        rotateY: (Math.PI / 3) * progress.value,
      },
      {
        rotate: (Math.PI / 4) * progress.value,
      },
    ];
  });

  const transform2 = useDerivedValue(() => {
    return [
      {
        rotate: (-Math.PI / 2) * progress.value,
      },
      {
        translateX: 25 * 2 * progress.value,
      },
      { perspective: 10000 },
      {
        rotateY: (Math.PI / 3) * progress.value,
      },
      {
        rotate: (Math.PI / 4) * progress.value,
      },
    ];
  });

  const transform3 = useDerivedValue(() => {
    return [
      {
        rotate: (-Math.PI / 2) * progress.value,
      },
      {
        translateX: 25 * 3 * progress.value,
      },
      { perspective: 10000 },
      {
        rotateY: (Math.PI / 3) * progress.value,
      },
      {
        rotate: (Math.PI / 4) * progress.value,
      },
    ];
  });

  const transform4 = useDerivedValue(() => {
    return [
      {
        rotate: (-Math.PI / 2) * progress.value,
      },
      {
        translateX: 25 * 4 * progress.value,
      },
      { perspective: 10000 },
      {
        rotateY: (Math.PI / 3) * progress.value,
      },
      {
        rotate: (Math.PI / 4) * progress.value,
      },
    ];
  });

  const transforms = [
    transform0,
    transform1,
    transform2,
    transform3,
    transform4,
  ];

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Rect x={0} y={0} width={WindowWidth} height={WindowHeight}>
          <RadialGradient
            c={vec(WindowWidth / 2, WindowHeight / 2)}
            r={Math.min(WindowWidth, WindowHeight) / 2}
            colors={['violet', 'black']}
          />
          <Blur blur={100} />
        </Rect>
        {transforms.map((transform, index) => {
          return (
            <Group
              key={index}
              origin={vec(WindowWidth / 2, WindowHeight / 2)}
              transform={transform}>
              <BlurredCard blurredProgress={progress} />
            </Group>
          );
        })}
      </Canvas>
      <View
        style={StyleSheet.absoluteFill}
        onTouchEnd={() => {
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
