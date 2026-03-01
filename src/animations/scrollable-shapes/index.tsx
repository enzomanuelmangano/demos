import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useEffect } from 'react';

import {
  Blur,
  Canvas,
  Circle,
  Picture,
  PointMode,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';

import { Paginator } from './components';
import {
  N_POINTS,
  ALL_SHAPES,
  ALL_SHAPES_X,
  ALL_SHAPES_Y,
  ALL_SHAPES_Z,
} from './shapes';

// Number of shapes
const SHAPES_COUNT = ALL_SHAPES.length;
const DISTANCE = 350;

// Pre-computed tilt rotation (0.2 radians)
const TILT_COS = Math.cos(0.2);
const TILT_SIN = Math.sin(0.2);

const ScrollableShapes = () => {
  const iTime = useSharedValue(0.0);
  const scrollX = useSharedValue(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const centerX = windowWidth / 2;
  const centerY = windowHeight / 2;

  // Scroll handler for the invisible ScrollView
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Input range for shape interpolation (computed once)
  const inputRange = ALL_SHAPES.map((_, idx) => windowWidth * idx);

  // Create picture using drawPoints for massive performance gain
  const picture = useDerivedValue(() => {
    'worklet';
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, windowWidth, windowHeight),
    );

    const scroll = scrollX.value;
    const time = iTime.value;

    // Pre-compute rotation values once per frame
    const cosT = Math.cos(time);
    const sinT = Math.sin(time);

    // Find segment once (same for all points)
    let idx = 0;
    while (idx < inputRange.length - 1 && scroll > inputRange[idx + 1]) {
      idx++;
    }
    const nextIdx = Math.min(idx + 1, inputRange.length - 1);
    const t =
      idx >= inputRange.length - 1
        ? 1
        : (scroll - inputRange[idx]) / (inputRange[nextIdx] - inputRange[idx]);
    const clampedT = t < 0 ? 0 : t > 1 ? 1 : t;

    // Collect points in bins by depth for perspective sizing
    const nearPoints: { x: number; y: number }[] = [];
    const midPoints: { x: number; y: number }[] = [];
    const farPoints: { x: number; y: number }[] = [];

    for (let i = 0; i < N_POINTS; i++) {
      const arrX = ALL_SHAPES_X[i];
      const arrY = ALL_SHAPES_Y[i];
      const arrZ = ALL_SHAPES_Z[i];

      // Lerp
      const x = arrX[idx] + (arrX[nextIdx] - arrX[idx]) * clampedT;
      const y = arrY[idx] + (arrY[nextIdx] - arrY[idx]) * clampedT;
      const z = arrZ[idx] + (arrZ[nextIdx] - arrZ[idx]) * clampedT;

      // Inline rotateX (tilt) then rotateY (time)
      const y1 = y * TILT_COS - z * TILT_SIN;
      const z1 = y * TILT_SIN + z * TILT_COS;
      const x2 = x * cosT + z1 * sinT;
      const z2 = -x * sinT + z1 * cosT;

      // Perspective
      const scale = DISTANCE / (DISTANCE + z2);
      const sx = centerX + x2 * scale;
      const sy = centerY + y1 * scale;

      // Bin by depth
      const point = { x: sx, y: sy };
      if (scale > 1.1) {
        nearPoints.push(point);
      } else if (scale > 0.9) {
        midPoints.push(point);
      } else {
        farPoints.push(point);
      }
    }

    // Create gradient shader
    const shader = Skia.Shader.MakeLinearGradient(
      { x: 0, y: 0 },
      { x: windowWidth, y: windowHeight },
      [Skia.Color('#00d9ff'), Skia.Color('#ffffff'), Skia.Color('#ff006e')],
      null,
      0,
    );

    // Draw each bin with appropriate size (far to near for proper depth)
    const paint = Skia.Paint();
    paint.setShader(shader);
    paint.setStyle(1); // Stroke
    paint.setStrokeCap(1); // Round

    // Original used radius = Math.max(0.2, 0.5 * scale), so stroke width ~0.4-1.0
    if (farPoints.length > 0) {
      paint.setStrokeWidth(0.6);
      canvas.drawPoints(PointMode.Points, farPoints, paint);
    }

    if (midPoints.length > 0) {
      paint.setStrokeWidth(0.8);
      canvas.drawPoints(PointMode.Points, midPoints, paint);
    }

    if (nearPoints.length > 0) {
      paint.setStrokeWidth(1.0);
      canvas.drawPoints(PointMode.Points, nearPoints, paint);
    }

    return recorder.finishRecordingAsPicture();
  }, [scrollX, iTime, windowWidth, windowHeight, centerX, centerY, inputRange]);

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

        {/* Main shape - using Picture for GPU caching */}
        <Picture picture={picture} />
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
