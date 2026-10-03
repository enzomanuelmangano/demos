import { Dimensions, StyleSheet, View } from 'react-native';

import { useEffect, useMemo, useRef } from 'react';

import * as Haptics from 'expo-haptics';
import debounce from 'lodash.debounce';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  Extrapolation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Canvas,
  Picture,
  Skia,
  type SkCanvas,
  type SkPaint,
} from 'react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';

const N_ITEMS = 2000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_HEIGHT = SCREEN_HEIGHT;
const CANVAS_WIDTH = SCREEN_WIDTH;

// Draws every dot with drawCircle into a recorded picture: same pixels as
// filling one path with 2000 circle contours, without tessellating that path
// on every frame.
const drawEnhancedFibonacci = (
  N: number,
  magicalMul: number,
  iTime: number,
  distance: number,
  canvas: SkCanvas,
  paint: SkPaint,
) => {
  'worklet';
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;

  // Loop invariants, hoisted out of the per-dot loop
  const timePulse = Math.sin(iTime * 0.8) * 0.2 + 1.0;
  const halfN = N * 0.5;
  const intensityDiv = N * 0.01;
  const radiusScale = CANVAS_WIDTH * 0.4;
  const t07 = iTime * 0.7;
  const t03 = iTime * 0.3;
  const t12 = iTime * 1.2;
  const t20 = iTime * 2.0;

  for (let i = 0; i < N; i++) {
    const a = i / halfN - 1.0;
    const sq = Math.sqrt(1.0 - a * a);
    const angle = i * magicalMul + iTime;
    const px = Math.cos(angle) * sq;
    const py = Math.cos(angle + 11) * sq;

    // Enhanced 3D movement with multiple wave patterns
    const wave1 = Math.sin(i * 0.1 + t07) * 80;
    const wave2 = Math.cos(i * 0.05 + t03) * 40;
    const wave3 = Math.sin(i * 0.15 + t12) * 20;
    const z = wave1 + wave2 + wave3;

    // Perspective projection
    const scale = distance / (distance + z);

    const x = centerX + px * radiusScale * scale;
    const y = centerY + a * radiusScale * scale;

    // Pulsing animation based on time and position
    const pulse = Math.sin(i * 0.2 + t20) * 0.3 + 1.0;

    const intensity = (1.0 - Math.abs(py)) / intensityDiv;
    const baseRadius = Math.max(0.5, Math.min(intensity * 20 * scale, 10));
    const radius = baseRadius * pulse * timePulse;

    canvas.drawCircle(x, y, radius, paint);
  }
};

const INITIAL_MAGICAL_MUL = 2.4;

const lightHapticFeedback = () => {
  Haptics.selectionAsync();
};

const heavyHapticFeedback = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

const debouncedFeedback = debounce(heavyHapticFeedback, 500, {
  leading: true,
  trailing: false,
});

const SphereWaves = () => {
  const magicalMul = useSharedValue(INITIAL_MAGICAL_MUL);
  const distance = useSharedValue(300);
  const savedDistance = useSharedValue(300);

  const iTime = useSharedValue(0.0);

  // History tracking for magicalMul values
  const historyRef = useRef<number[]>([INITIAL_MAGICAL_MUL]);
  const historyIndexRef = useRef(0);

  const tapGesture = Gesture.Tap().onEnd(event => {
    scheduleOnRN(lightHapticFeedback);
    const isRightSide = event.x > SCREEN_WIDTH / 2;

    if (isRightSide) {
      // Generate new random value and add to history
      const newValue = Math.random() * 100;
      // Trim any "future" history if we went back
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      historyRef.current.push(newValue);
      historyIndexRef.current = historyRef.current.length - 1;
      magicalMul.set(newValue);
      return;
    }
    // Go back in history
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      magicalMul.set(historyRef.current[historyIndexRef.current]);
    }
  });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedDistance.set(distance.get());
    })
    .onUpdate(event => {
      if (event.scale < 0.3) {
        scheduleOnRN(debouncedFeedback);
      }
      // Map scale ~0.3-3 to a wider multiplier range
      const multiplier = interpolate(
        event.scale,
        [0.05, 0.2, 0.3, 1, 3],
        [80, 25, 2, 1, 0.05],
        Extrapolation.CLAMP,
      );
      distance.set(savedDistance.get() * multiplier);
    })
    .onEnd(() => {
      distance.set(withSpring(300));
    });

  // Reused across frames; only its gradient shader changes per frame.
  const paint = useMemo(() => {
    const p = Skia.Paint();
    p.setAntiAlias(true);
    return p;
  }, []);

  const picture = useDerivedValue(() => {
    'worklet';
    const time = iTime.get();
    const hueShift = (time * 40) % 360;

    const colors = [
      Skia.Color(`hsl(${(340 + hueShift) % 360}, 90%, 70%)`),
      Skia.Color(`hsl(${(280 + hueShift) % 360}, 85%, 75%)`),
      Skia.Color(`hsl(${(220 + hueShift) % 360}, 95%, 80%)`),
      Skia.Color(`hsl(${(160 + hueShift) % 360}, 88%, 72%)`),
      Skia.Color(`hsl(${(60 + hueShift) % 360}, 92%, 78%)`),
    ];
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: 0 },
        { x: CANVAS_WIDTH, y: CANVAS_HEIGHT },
        colors,
        null,
        0,
      ),
    );

    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(
      Skia.XYWHRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
    );
    drawEnhancedFibonacci(
      N_ITEMS,
      magicalMul.get(),
      time,
      distance.get(),
      canvas,
      paint,
    );
    return recorder.finishRecordingAsPicture();
  }, [iTime, magicalMul, distance, paint]);

  useEffect(() => {
    iTime.set(
      withRepeat(
        withTiming(15, { duration: 50000, easing: Easing.linear }),
        -1,
        true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const combinedGesture = Gesture.Simultaneous(tapGesture, pinchGesture);

  return (
    <GestureDetector gesture={combinedGesture}>
      <View style={styles.container}>
        <Canvas
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            position: 'absolute',
          }}>
          {/* Main front layer with dynamic colors */}
          <Picture picture={picture} />
        </Canvas>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
});

export { SphereWaves };
