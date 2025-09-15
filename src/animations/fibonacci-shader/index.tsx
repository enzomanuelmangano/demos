import {
  Blur,
  Canvas,
  Circle,
  Mask,
  Rect,
  Shader,
  Skia,
} from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedSlider } from './components/animated-slider';

// Max 350 circles, but you can update this value as you want.
// It all depends on how fast is you're computer 😁
const MAX_CIRCLES_AMOUNT = 350;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH;

const FibonacciShader = () => {
  // N is the amount of circles
  const N = useSharedValue(5.0);
  // Try with this value: 77.51937688783158. The result is beautiful!
  const magicalMul = useSharedValue(2.4);

  const iTime = useSharedValue(0.0);

  const dynamicSource = useDerivedValue(() => {
    // WHAT IS THIS!!!
    // With RN Skia you can actually parametrize the values and then pass them to the Shader uniforms.
    // So why did I create the shader as a parametrized string?

    // The main issue I had was with the "N":
    // const float N.
    // This value needs to be const because it's used in a loop (these are shader rules)
    // But if we accept N as a uniform, it can't be used anymore in the loop.
    // To avoid this issue I'm recomputing the shader as a Reanimated Shared Value of type string.
    // Am I sure about this approach? Not at all 👀

    // This shader is deeeeeply inspired by: https://x.com/XorDev/status/1475524322785640455?s=20
    // This guy is amazing and honestly without his code this animation wouldn't exist.
    return Skia.RuntimeEffect.Make(`
      const vec2 iResolution = vec2(${CANVAS_SIZE}, ${CANVAS_SIZE});
      const float iTime = ${iTime.value};
      const float N = ${N.value};

      vec4 main(vec2 FC) {
        vec4 o = vec4(0, 0, 0, 1); 
        vec2 p = vec2(0);
        vec2 c = p ;
        vec2 u = FC.xy * 2.0 - iResolution.xy;
        float a;

        for (float i = 0.0; i < N; i++) {

          a = i / (N * 0.5) - 1.0;
          p = cos(i * ${magicalMul.value} + iTime + vec2(0, 11)) * sqrt(1.0 - a * a);
          c = u / iResolution.y + vec2(p.x, a) / (p.y + 2.0); 
          o += (cos(i + vec4(0, 2, 4, 0)) + 1.0) / dot(c, c) * (1.0 - p.y) / (N * 75.0); // Play with this 75.0
        }
        return o;
      }`)!;
  }, []);

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
            <Rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE}>
              <Shader source={dynamicSource} />
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
            // While updating the Slider, I'm updating the N value as well
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
          // I love randomness :)
          magicalMul.value = Math.random() * 100;
        }}
        style={styles.floatingButton}>
        <Text style={styles.floatingContent}>🪄</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  floatingButton: {
    position: 'absolute',
    right: 60,
    bottom: 120,
    backgroundColor: '#232323',
    borderRadius: 32,
    height: 64,
    width: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedSlider: {
    marginTop: 80,
    alignItems: 'center',
    flexDirection: 'column',
  },
  floatingContent: { fontSize: 32 },
});

export { FibonacciShader };
