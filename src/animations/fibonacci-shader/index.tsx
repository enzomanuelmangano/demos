import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { useEffect } from 'react';

import {
  Canvas,
  LinearGradient,
  Path,
  SkPath,
  usePathValue,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_HEIGHT = SCREEN_HEIGHT;
const CANVAS_WIDTH = SCREEN_WIDTH;
const createEnhancedFibonacciPath = (
  N: number,
  magicalMul: number,
  iTime: number,
  zOffset: number = 0,
  skPath: SkPath,
) => {
  'worklet';
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;

  for (let i = 0; i < N; i++) {
    const a = i / (N * 0.5) - 1.0;
    const px = Math.cos(i * magicalMul + iTime) * Math.sqrt(1.0 - a * a);
    const py = Math.cos(i * magicalMul + iTime + 11) * Math.sqrt(1.0 - a * a);

    // Enhanced 3D movement with multiple wave patterns
    const wave1 = Math.sin(i * 0.1 + iTime * 0.7 + zOffset) * 80;
    const wave2 = Math.cos(i * 0.05 + iTime * 0.3) * 40;
    const wave3 = Math.sin(i * 0.15 + iTime * 1.2) * 20;
    const z = wave1 + wave2 + wave3;

    // Perspective projection
    const distance = 300;
    const scale = distance / (distance + z);

    const x = centerX + px * CANVAS_WIDTH * 0.4 * scale;
    const y = centerY + a * CANVAS_WIDTH * 0.4 * scale;

    // Pulsing animation based on time and position
    const pulse = Math.sin(i * 0.2 + iTime * 2.0) * 0.3 + 1.0;
    const timePulse = Math.sin(iTime * 0.8) * 0.2 + 1.0;

    const intensity = (1.0 - Math.abs(py)) / (N * 0.01);
    const baseRadius = Math.max(0.5, Math.min(intensity * 4 * scale, 10));
    const radius = baseRadius * pulse * timePulse;

    skPath.addCircle(x, y, radius);
  }

  return skPath;
};

const FibonacciShader = () => {
  const N = useSharedValue(5.0);
  const magicalMul = useSharedValue(2.4);

  const iTime = useSharedValue(0.0);

  const fibonacciPath = usePathValue(skPath => {
    'worklet';
    return createEnhancedFibonacciPath(
      N.value,
      magicalMul.value,
      iTime.value,
      0,
      skPath,
    );
  });

  const animatedColors = useDerivedValue(() => {
    'worklet';
    const time = iTime.value;
    const hueShift = (time * 40) % 360;

    return [
      `hsl(${(340 + hueShift) % 360}, 90%, 70%)`,
      `hsl(${(280 + hueShift) % 360}, 85%, 75%)`,
      `hsl(${(220 + hueShift) % 360}, 95%, 80%)`,
      `hsl(${(160 + hueShift) % 360}, 88%, 72%)`,
      `hsl(${(60 + hueShift) % 360}, 92%, 78%)`,
    ];
  }, [iTime]);

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
      <Canvas
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: 'absolute',
        }}>
        {/* Main front layer with dynamic colors */}
        <Path path={fibonacciPath} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(CANVAS_WIDTH, CANVAS_HEIGHT)}
            colors={animatedColors}
          />
        </Path>
      </Canvas>

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
