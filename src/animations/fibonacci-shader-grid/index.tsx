import { Dimensions, StyleSheet, View } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Mask,
  Rect,
  Shader,
  Skia,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { ControlPanel } from './components/control-panel';

// Note: Please feel free to correct me because honestly I'm not sure of a single word 😅
//       That's just something I noticed while experimenting.

// By incresing the RESCALE_FACTOR, you'll improve performance but the quality will decrease.
// Why?
// The trick (?) is to determine the CanvasSize (Width and Height) based on the
// Screen Width / Rescale Factor.
// By doing that the shader will be applied to reduced portion of the screen and it will run by using less resources
const RESCALE_FACTOR = 3;

// Max 350 circles, but you can update this value as you want.
// It all depends on how fast is you're computer 😁
const MIN_CIRCLES_AMOUNT = 5;
const MAX_CIRCLES_AMOUNT = 350 / 2;

const INITIAL_CIRCLES_AMOUNT = (MAX_CIRCLES_AMOUNT + MIN_CIRCLES_AMOUNT) / 2;

const MIN_MAGICAL_MUL = 1.2;
const MAX_MAGICAL_MUL = 3.6;

const INITIAL_MAGICAL_MUL = (MAX_MAGICAL_MUL + MIN_MAGICAL_MUL) / 2;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH / RESCALE_FACTOR;

const FibonacciShaderGrid = () => {
  // N is the amount of circles
  const n = useSharedValue(INITIAL_CIRCLES_AMOUNT);

  // Try with this value: 77.51937688783158. The result is beautiful!
  const magicalMul = useSharedValue(INITIAL_MAGICAL_MUL);

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
      const float N = ${n.value};

      vec4 main(vec2 FC) {
        vec4 o = vec4(0, 0, 0, 1); 
        vec2 p = vec2(0);
        vec2 c = p ;
        vec2 u = FC.xy * 2.0 - iResolution.xy;
        float a;

        for (float i = 0.0; i < N; i++) {

          a = i / (N * 0.5) - 1.0;
          p = cos(i * ${magicalMul.value} + iTime + vec2(0, 11)) * sqrt( 1.0 - a * a);
          c = u / iResolution.y + vec2(p.x, a) / (p.y + 2.0); 
          o += (cos(i + vec4(0, 2, 4, 0)) + 1) / dot(c, c) * (1.0 - p.y) / (N * 75.0); // Play with this 75.0
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
          marginTop: 50,
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <Canvas
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            transform: [
              {
                scale: RESCALE_FACTOR, // Upscaling factor
              },
            ],
            // backgroundColor: 'blue', // Decomment me to visualize the purpose of the mask!! :)
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
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 100,
        }}>
        <ControlPanel
          minX={MIN_CIRCLES_AMOUNT}
          maxX={MAX_CIRCLES_AMOUNT}
          minY={MIN_MAGICAL_MUL}
          maxY={MAX_MAGICAL_MUL}
          x={n}
          y={magicalMul}
          width={Math.round((SCREEN_WIDTH - 90) / 10) * 6}
          height={Math.round((SCREEN_WIDTH - 90) / 10) * 6}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});

export { FibonacciShaderGrid };
