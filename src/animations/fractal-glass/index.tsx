import { StyleSheet, useWindowDimensions } from 'react-native';

import { useState } from 'react';

import { Octicons } from '@expo/vector-icons';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Mask,
  rect,
} from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FractalGlassMask } from './components/fractal-glass-mask';

type Theme = 'light' | 'dark';

const CircleRadius = 100;

const App = () => {
  const [theme, setTheme] = useState<Theme>('light');

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const x = 40;
  const height = 300;
  const y = (windowHeight - height) / 2;
  const gradientsAmount = 4;
  const width = windowWidth - x * 2;

  const cx = useSharedValue(180);
  const cy = useSharedValue(270);
  const prevCx = useSharedValue(0);
  const prevCy = useSharedValue(0);

  const fractalGlassMaskPath = rect(x, y, width, height);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      prevCx.value = cx.value;
      prevCy.value = cy.value;
    })
    .onUpdate(event => {
      cx.value = prevCx.value + event.translationX;
      cy.value = prevCy.value + event.translationY;
    });

  const rBackgroundStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(theme === 'light' ? 'white' : 'black'),
    };
  }, [theme]);

  const circleColor = useDerivedValue(() => {
    return withTiming(theme === 'light' ? 'orange' : '#78C0E0');
  }, [theme]);

  const rFloatingBackgroundStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: circleColor.value,
    };
  }, [theme]);

  const rFakeCircleStyle = useAnimatedStyle(() => {
    return {
      left: cx.value - CircleRadius,
      top: cy.value - CircleRadius,
    };
  }, []);

  return (
    <Animated.View style={[styles.fill, rBackgroundStyle]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            rFakeCircleStyle,
            {
              position: 'absolute',
              height: CircleRadius * 2,
              width: CircleRadius * 2,
              borderRadius: CircleRadius,
              zIndex: 100,
            },
          ]}
        />
      </GestureDetector>

      <Canvas style={styles.fill}>
        {/* <FractalGlassMask
          x={x}
          y={y}
          width={width}
          height={height}
          gradientsN={gradientsAmount}
        /> */}
        <Group clip={fractalGlassMaskPath} invertClip>
          <Circle cx={cx} cy={cy} r={CircleRadius} color={circleColor} />
        </Group>

        <Group clip={fractalGlassMaskPath}>
          <Mask
            mode="alpha"
            mask={
              <FractalGlassMask
                x={x}
                y={y}
                width={width}
                height={height}
                gradientsN={gradientsAmount}
              />
            }>
            <Circle
              cx={cx}
              cy={cy}
              r={CircleRadius}
              color={circleColor}
              clip={rect(x, y, width, height)}>
              <Blur blur={25} mode={'decal'} />
            </Circle>
          </Mask>
        </Group>
      </Canvas>

      <PressableScale
        style={styles.floatingButton}
        onPress={() => {
          setTheme(theme === 'light' ? 'dark' : 'light');
        }}>
        <Animated.View
          style={[rFloatingBackgroundStyle, styles.floatingContent]}>
          <Octicons
            name={theme !== 'light' ? 'sun' : 'moon'}
            size={24}
            color="white"
          />
        </Animated.View>
      </PressableScale>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  floatingButton: {
    aspectRatio: 1,
    bottom: 64,
    height: 58,
    position: 'absolute',
    right: 64,
    zIndex: 100,
  },
  floatingContent: {
    alignItems: 'center',
    borderRadius: 29,
    flex: 1,
    justifyContent: 'center',
  },
});

export { App as FractalGlass };
