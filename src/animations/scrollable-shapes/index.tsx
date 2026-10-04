import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useEffect, useMemo } from 'react';

import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';
import {
  Blur,
  Canvas,
  Circle,
  Picture,
  PointMode,
  RadialGradient,
  Skia,
  vec,
} from 'react-native-skia';
import { isUIRuntime } from 'react-native-worklets';

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
      scrollX.set(event.contentOffset.x);
    },
  });

  // Input range for shape interpolation (computed once)
  const inputRange = ALL_SHAPES.map((_, idx) => windowWidth * idx);

  // Gradient paint is constant: build it once instead of every frame.
  const paint = useMemo(() => {
    const shader = Skia.Shader.MakeLinearGradient(
      { x: 0, y: 0 },
      { x: windowWidth, y: windowHeight },
      [Skia.Color('#00d9ff'), Skia.Color('#ffffff'), Skia.Color('#ff006e')],
      null,
      0,
    );
    const p = Skia.Paint();
    p.setShader(shader);
    p.setStyle(1); // Stroke
    p.setStrokeCap(1); // Round
    return p;
  }, [windowWidth, windowHeight]);

  // Point objects and bins reused across frames (created lazily on the UI
  // runtime) so each frame doesn't allocate 3000 objects + 3 arrays.
  const pools = useSharedValue<{
    near: { x: number; y: number }[];
    mid: { x: number; y: number }[];
    far: { x: number; y: number }[];
    points: { x: number; y: number }[];
  } | null>(null);

  // Create picture using drawPoints for massive performance gain
  const picture = useDerivedValue(() => {
    'worklet';
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, windowWidth, windowHeight),
    );

    const scroll = scrollX.get();
    const time = iTime.get();

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

    let pool = pools.get();
    if (pool === null) {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < N_POINTS; i++) {
        points.push({ x: 0, y: 0 });
      }
      pool = { near: [], mid: [], far: [], points };
      // Only kept on the UI runtime: the initial JS-side run must not hand
      // these (then frozen) objects to the shared value and mutate them.
      if (isUIRuntime()) pools.set(pool);
    }

    // Collect points in bins by depth for perspective sizing
    const nearPoints = pool.near;
    const midPoints = pool.mid;
    const farPoints = pool.far;
    nearPoints.length = 0;
    midPoints.length = 0;
    farPoints.length = 0;

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
      const point = pool.points[i];
      point.x = sx;
      point.y = sy;
      if (scale > 1.1) {
        nearPoints.push(point);
      } else if (scale > 0.9) {
        midPoints.push(point);
      } else {
        farPoints.push(point);
      }
    }

    // Draw each bin with appropriate size (far to near for proper depth)

    // Original used radius = Math.max(0.2, 0.5 * scale), so stroke width ~0.4-1.0
    if (farPoints.length > 0) {
      paint.setStrokeWidth(0.9);
      canvas.drawPoints(PointMode.Points, farPoints, paint);
    }

    if (midPoints.length > 0) {
      paint.setStrokeWidth(0.9);
      canvas.drawPoints(PointMode.Points, midPoints, paint);
    }

    if (nearPoints.length > 0) {
      paint.setStrokeWidth(1.0);
      canvas.drawPoints(PointMode.Points, nearPoints, paint);
    }

    return recorder.finishRecordingAsPicture();
  }, [
    scrollX,
    iTime,
    windowWidth,
    windowHeight,
    centerX,
    centerY,
    inputRange,
    paint,
    pools,
  ]);

  // Rotation animation
  useEffect(() => {
    iTime.set(
      withRepeat(
        withTiming(Math.PI * 2, { duration: 10000, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Static glow on its own canvas: the 60px blur would otherwise be
          re-rendered every frame together with the rotating shape. */}
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
      </Canvas>

      {/* Canvas with the shape */}
      <Canvas
        style={{
          width: windowWidth,
          height: windowHeight,
          position: 'absolute',
        }}>
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
