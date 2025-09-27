import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { useEffect } from 'react';

import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  LinearGradient,
  Mask,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedSlider } from './components/animated-slider';

const MAX_CIRCLES_AMOUNT = 350;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH;

const createFibonacci3DPath = (
  N: number,
  magicalMul: number,
  iTime: number,
  zOffset: number = 0,
) => {
  'worklet';
  const path = Skia.Path.Make();
  const centerX = CANVAS_SIZE / 2;
  const centerY = CANVAS_SIZE / 2;

  for (let i = 0; i < N; i++) {
    const a = i / (N * 0.5) - 1.0;
    const px = Math.cos(i * magicalMul + iTime) * Math.sqrt(1.0 - a * a);
    const py = Math.cos(i * magicalMul + iTime + 11) * Math.sqrt(1.0 - a * a);

    // 3D position calculation
    const z = Math.sin(i * 0.1 + iTime * 0.5 + zOffset) * 100; // Z depth in world units

    // Perspective projection (objects further away appear smaller and closer to center)
    const distance = 200; // Camera distance
    const scale = distance / (distance + z);

    const x = centerX + px * CANVAS_SIZE * 0.4 * scale;
    const y = centerY + a * CANVAS_SIZE * 0.4 * scale;

    const intensity = (1.0 - Math.abs(py)) / (N * 0.01);
    const radius = Math.max(0.3, Math.min(intensity * 5 * scale, 12));

    path.addCircle(x, y, radius);
  }

  return path;
};

const FibonacciShader = () => {
  const N = useSharedValue(5.0);
  const magicalMul = useSharedValue(2.4);

  const iTime = useSharedValue(0.0);

  const fibonacciPath = useDerivedValue(() => {
    return createFibonacci3DPath(N.value, magicalMul.value, iTime.value);
  }, [iTime, N, magicalMul]);

  const fibonacciBackPath = useDerivedValue(() => {
    return createFibonacci3DPath(
      N.value,
      magicalMul.value,
      iTime.value,
      Math.PI,
    );
  }, [iTime, N, magicalMul]);

  useEffect(() => {
    iTime.value = withRepeat(
      withTiming(15, { duration: 20000, easing: Easing.linear }),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View
        style={{
          marginTop: 100,
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <Canvas
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
          }}>
          {/* 
            This mask is applied just to smooth a bit the borders of the Rect with some blurry borders.
            You can see it better by updating the backgroundColor of the Canvas
           */}
          <Mask
            mode="luminance"
            mask={
              <Circle
                cx={CANVAS_SIZE / 2}
                cy={CANVAS_SIZE / 2}
                r={CANVAS_SIZE / 2}
                color={'#FFF'}>
                <Blur blur={10} />
              </Circle>
            }>
            {/* Back layer - darker for depth */}
            <Path path={fibonacciBackPath} style="fill" opacity={0.4}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(CANVAS_SIZE, CANVAS_SIZE)}
                colors={['#8B3A62', '#2E8B8B', '#2E5984']}
              />
              <BlurMask blur={8} style="outer" />
            </Path>

            {/* Main front layer */}
            <Path path={fibonacciPath} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(CANVAS_SIZE, CANVAS_SIZE)}
                colors={['#FF6B6B', '#4ECDC4', '#45B7D1']}
              />
            </Path>

            {/* Bright glow for front layer */}
            <Path path={fibonacciPath} style="fill" opacity={0.6}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(CANVAS_SIZE, CANVAS_SIZE)}
                colors={['#FFB3B3', '#B3F5F5', '#B3D7F5']}
              />
              <BlurMask blur={6} style="outer" />
            </Path>
          </Mask>
        </Canvas>
      </View>

      <View style={styles.animatedSlider}>
        <AnimatedSlider
          sliderHeight={40}
          minValue={5}
          maxValue={MAX_CIRCLES_AMOUNT}
          onUpdate={value => {
            'worklet';
            N.value = value;
          }}
          color="white"
          style={{
            width: SCREEN_WIDTH * 0.8,
          }}
        />
      </View>
      <PressableScale
        onPress={() => {
          magicalMul.value = Math.random() * 100;
        }}
        style={styles.floatingButton}>
        <Text style={styles.floatingContent}>🪄</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  animatedSlider: {
    alignItems: 'center',
    flexDirection: 'column',
    marginTop: 80,
  },
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: '#232323',
    borderRadius: 32,
    bottom: 120,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 60,
    width: 64,
  },
  floatingContent: { fontSize: 32 },
});

export { FibonacciShader };
