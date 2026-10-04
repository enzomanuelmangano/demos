import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { useEffect } from 'react';

import { PressableScale } from 'pressto';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Blur,
  Canvas,
  Circle,
  Mask,
  Rect,
  Shader,
  Skia,
} from 'react-native-skia';

import { AnimatedSlider } from './components/animated-slider';

const MAX_CIRCLES_AMOUNT = 350;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH;

// This shader is deeeeeply inspired by: https://x.com/XorDev/status/1475524322785640455?s=20
// This guy is amazing and honestly without his code this animation wouldn't exist.
//
// The effect is compiled once. N, the time and the multiplier are uniforms:
// SkSL loops need a constant bound, so the loop runs up to the maximum and
// stops after N iterations, exactly as `i < N` did when N was baked into the
// source (which recompiled the shader on every frame).
const FibonacciEffect = Skia.RuntimeEffect.Make(`
  uniform float iTime;
  uniform float N;
  uniform float magicalMul;

  const vec2 iResolution = vec2(${CANVAS_SIZE}, ${CANVAS_SIZE});
  const float MAX_N = ${MAX_CIRCLES_AMOUNT.toFixed(1)};

  vec4 main(vec2 FC) {
    vec4 o = vec4(0, 0, 0, 1);
    vec2 p = vec2(0);
    vec2 c = p;
    vec2 u = FC.xy * 2.0 - iResolution.xy;
    float a;

    for (float i = 0.0; i < MAX_N; i++) {
      if (i >= N) {
        break;
      }
      a = i / (N * 0.5) - 1.0;
      p = cos(i * magicalMul + iTime + vec2(0, 11)) * sqrt(1.0 - a * a);
      c = u / iResolution.y + vec2(p.x, a) / (p.y + 2.0);
      o += (cos(i + vec4(0, 2, 4, 0)) + 1.0) / dot(c, c) * (1.0 - p.y) / (N * 75.0); // Play with this 75.0
    }
    return o;
  }`)!;

const FibonacciShader = () => {
  const N = useSharedValue(5.0);
  const magicalMul = useSharedValue(2.4);

  const iTime = useSharedValue(0.0);

  const uniforms = useDerivedValue(() => {
    return {
      iTime: iTime.get(),
      N: N.get(),
      magicalMul: magicalMul.get(),
    };
  }, []);

  useEffect(() => {
    iTime.set(
      withRepeat(
        withTiming(15, { duration: 20000, easing: Easing.linear }),
        -1,
        true,
      ),
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
            <Rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE}>
              <Shader source={FibonacciEffect} uniforms={uniforms} />
            </Rect>
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
            N.set(value);
          }}
          color="white"
          style={{
            width: SCREEN_WIDTH * 0.8,
          }}
        />
      </View>
      <PressableScale
        onPress={() => {
          magicalMul.set(Math.random() * 100);
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
