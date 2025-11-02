import { Dimensions, StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import {
  Blur,
  Canvas,
  Fill,
  Group,
  LinearGradient,
  RadialGradient,
  RoundedRect,
  Shadow,
  vec,
} from '@shopify/react-native-skia';
import {
  useAnimatedSensor,
  SensorType,
  interpolate,
  Extrapolation,
  useDerivedValue,
} from 'react-native-reanimated';

import { ReactNativeLogo } from './react-logo';

const CanvasSize = {
  width: 500,
  height: 500,
};

const CanvasCenter = vec(CanvasSize.width / 2, CanvasSize.height / 2);

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const SquareSize = 170;

const App = () => {
  const deviceRotation = useAnimatedSensor(SensorType.ROTATION, {
    interval: 20,
  });

  const rotateY = useDerivedValue(() => {
    const { roll } = deviceRotation.sensor.value;

    return interpolate(
      roll,
      [-1, 0, 1],
      [Math.PI / 8, 0, -Math.PI / 8],
      Extrapolation.CLAMP,
    );
  });

  const rotationGravity = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 20,
  });

  const rotateX = useDerivedValue(() => {
    const { z } = rotationGravity.sensor.value;

    return interpolate(
      z,
      [-10, -6, -1],
      [-Math.PI / 8, 0, Math.PI / 8],
      Extrapolation.CLAMP,
    );
  });

  const rTransform = useDerivedValue(() => {
    return [
      { perspective: 200 },
      { rotateY: rotateY.value },
      { rotateX: rotateX.value },
    ];
  });

  const shadowDx = useDerivedValue(() => {
    return interpolate(
      rotateY.value,
      [-Math.PI / 8, 0, Math.PI / 8],
      [10, 0, -10],
      Extrapolation.CLAMP,
    );
  });

  const shadowDy = useDerivedValue(() => {
    return interpolate(
      rotateX.value,
      [-Math.PI / 8, 0, Math.PI / 8],
      // Exception instead of (-10 use 7) that's because the "light source" is on the top
      [7, 0, 10],
      Extrapolation.CLAMP,
    );
  });

  const GoodOldSquare = useCallback(
    ({ children }: { children?: React.ReactNode }) => {
      return (
        <RoundedRect
          x={CanvasSize.width / 2 - SquareSize / 2}
          y={CanvasSize.height / 2 - SquareSize / 2}
          width={SquareSize}
          height={SquareSize}
          color="#101010"
          r={35}>
          {children}
        </RoundedRect>
      );
    },
    [],
  );

  return (
    <View style={styles.fill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <RadialGradient
            c={vec(windowWidth / 2, windowHeight / 2)}
            r={windowWidth / 1.5}
            colors={['#252525', '#000000']}
          />
          <Blur blur={50} />
        </Fill>
      </Canvas>
      <View style={styles.container}>
        <Canvas
          style={{
            height: CanvasSize.height,
            width: CanvasSize.width,
          }}>
          <Group origin={CanvasCenter} transform={rTransform}>
            <Group>
              <GoodOldSquare />
              <GoodOldSquare>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, CanvasSize.height / 1.8)}
                  colors={['#2e2e2e', '#0e0e0e']}
                />
                <Blur blur={10} />
              </GoodOldSquare>
              <Shadow color="#4c4c4c" inner blur={0} dx={0} dy={0.8} />
              <Shadow color="#000000" blur={3.5} dx={shadowDx} dy={shadowDy} />
            </Group>
            <ReactNativeLogo canvasSize={CanvasSize} />
          </Group>
        </Canvas>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
});

export { App as LinearSensors };
