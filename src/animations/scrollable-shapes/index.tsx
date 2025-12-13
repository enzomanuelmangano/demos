import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useEffect } from 'react';

import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  Extrapolate,
  interpolate,
  LinearGradient,
  Path,
  RadialGradient,
  usePathValue,
  vec,
} from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';

import { Paginator } from './components';
import {
  type Point3D,
  N_POINTS,
  ALL_SHAPES,
  ALL_SHAPES_X,
  ALL_SHAPES_Y,
  ALL_SHAPES_Z,
} from './shapes';

// Number of shapes
const SHAPES_COUNT = ALL_SHAPES.length;

// ============ 3D UTILITIES ============
const rotateX = (p: Point3D, angle: number): Point3D => {
  'worklet';
  return {
    x: p.x,
    y: p.y * Math.cos(angle) - p.z * Math.sin(angle),
    z: p.y * Math.sin(angle) + p.z * Math.cos(angle),
  };
};

const rotateY = (p: Point3D, angle: number): Point3D => {
  'worklet';
  return {
    x: p.x * Math.cos(angle) + p.z * Math.sin(angle),
    y: p.y,
    z: -p.x * Math.sin(angle) + p.z * Math.cos(angle),
  };
};

const ScrollableShapes = () => {
  const iTime = useSharedValue(0.0);
  const scrollX = useSharedValue(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Scroll handler for the invisible ScrollView
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Create the path by interpolating between shapes
  const morphPath = usePathValue(skPath => {
    'worklet';
    const centerX = windowWidth / 2;
    const centerY = windowHeight / 2;
    const distance = 350;

    // Input range for all shapes
    const shapeWidth = windowWidth;
    const inputRange = new Array(ALL_SHAPES.length)
      .fill(0)
      .map((_, idx) => shapeWidth * idx);

    for (let i = 0; i < N_POINTS; i++) {
      // Interpolate 3D point between the 4 shapes
      const baseX = interpolate(
        scrollX.value,
        inputRange,
        ALL_SHAPES_X[i],
        Extrapolate.CLAMP,
      );

      const baseY = interpolate(
        scrollX.value,
        inputRange,
        ALL_SHAPES_Y[i],
        Extrapolate.CLAMP,
      );

      const baseZ = interpolate(
        scrollX.value,
        inputRange,
        ALL_SHAPES_Z[i],
        Extrapolate.CLAMP,
      );

      // Apply rotation (based on iTime)
      let p: Point3D = { x: baseX, y: baseY, z: baseZ };
      p = rotateX(p, 0.2); // Slight fixed tilt
      p = rotateY(p, iTime.value); // Animated horizontal rotation

      // Perspective projection
      const scale = distance / (distance + p.z);
      const screenX = centerX + p.x * scale;
      const screenY = centerY + p.y * scale;

      // Very small radius based on depth
      const radius = Math.max(0.2, 0.5 * scale);

      skPath.addCircle(screenX, screenY, radius);
    }

    return skPath;
  });

  // Aurora Borealis gradient (static)
  const colors = ['#00d9ff', '#ffffff', '#ff006e'];

  // Rotation animation
  useEffect(() => {
    iTime.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 10000, easing: Easing.linear }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Canvas with the shape */}
      <Canvas
        style={{
          width: windowWidth,
          height: windowHeight,
          position: 'absolute',
        }}>
        {/* Background radial gradient blurred */}
        <Circle
          cx={windowWidth / 2}
          cy={windowHeight / 2}
          r={windowWidth * 0.6}>
          <RadialGradient
            c={vec(windowWidth / 2, windowHeight / 2)}
            r={windowWidth * 0.6}
            colors={['#ffffff40', 'transparent']}
          />
          <Blur blur={60} />
        </Circle>

        {/* Main shape */}
        <Path path={morphPath} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(windowWidth, windowHeight)}
            colors={colors}
          />
          <BlurMask blur={5} style="solid" />
        </Path>
      </Canvas>

      {/* Invisible ScrollView to control the morph */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={windowWidth}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{
          width: windowWidth * SHAPES_COUNT,
        }}
      />

      {/* Paginator */}
      <Paginator
        count={SHAPES_COUNT}
        scrollX={scrollX}
        windowWidth={windowWidth}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
});

export { ScrollableShapes };
