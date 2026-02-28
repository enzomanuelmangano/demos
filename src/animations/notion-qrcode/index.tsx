/**
 * QR Code Animation Component
 *
 * Creates an animated 3D visualization where avatar images arranged in a
 * rotating torus (donut shape) morph into a scannable QR code.
 *
 * ## How it works:
 *
 * 1. SHAPE GENERATION (useShapeData hook):
 *    - Generates N points on a 3D torus surface
 *    - Generates N points for the QR code (one per black module)
 *    - Uses Hungarian algorithm for optimal 1:1 point mapping
 *
 * 2. ANIMATION LOOP (createPicture worklet):
 *    - Runs every frame on the UI thread
 *    - Interpolates positions between torus → QR based on progress
 *    - Applies 3D rotation, perspective, depth sorting
 *    - See ./create-picture.ts for detailed implementation
 *
 * 3. WAVE EFFECT:
 *    - Points animate with staggered delays based on angular position
 *    - Creates a "wave" that sweeps around during morphing
 */
import { StyleSheet, View } from 'react-native';

import { useEffect, useRef } from 'react';

import { Canvas, Picture, Skia, useImage } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ToggleButton } from './components';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_AVATAR_SIZE,
  DEFAULT_COLORS,
  DEFAULT_QR_TARGET_HEIGHT,
  DEFAULT_TORUS,
} from './constants';
import { createPicture } from './create-picture';
import { useShapeData } from './hooks';
import {
  QRCodeAnimationProps,
  QRCodeAnimationRef,
  SpriteConfig,
} from './types';
import { hapticSoft } from './utils';

// Progress thresholds for haptic feedback (front-loaded burst)
const HAPTIC_THRESHOLDS = [0.05, 0.12, 0.21, 0.32];

/**
 * Core QR Code Animation component.
 *
 * Renders a 3D torus of avatars that morphs into a scannable QR code.
 * Control via the ref's toggle() method.
 *
 * @example
 * ```tsx
 * const ref = useRef<QRCodeAnimationRef>(null);
 *
 * <QRCodeAnimation
 *   ref={ref}
 *   qrData="https://example.com"
 *   sprite={{
 *     source: require('./sprites.png'),
 *     cols: 5, rows: 4, cellSize: 128, numAvatars: 20
 *   }}
 * />
 *
 * ref.current?.toggle(); // Toggle between torus and QR
 * ```
 */
const QRCodeAnimation = ({
  qrData,
  sprite,
  colors = DEFAULT_COLORS,
  torus = DEFAULT_TORUS,
  avatarSize = DEFAULT_AVATAR_SIZE,
  qrTargetHeight = DEFAULT_QR_TARGET_HEIGHT,
  progress: externalProgress,
  zoom: externalZoom,
  ref,
}: QRCodeAnimationProps) => {
  // ─── ANIMATION STATE ───
  const iTime = useSharedValue(0.0); // Continuous rotation time
  const internalProgress = useSharedValue(0); // Fallback if no external
  const internalZoom = useSharedValue(0); // Fallback if no external zoom
  const progress = externalProgress ?? internalProgress;
  const zoom = externalZoom ?? internalZoom;
  const isShowingQR = useSharedValue(false); // Current mode
  const lastHapticIndex = useSharedValue(-1); // Haptic tracking
  const staggerBaseTime = useSharedValue(0.0); // Frozen rotation for wave
  const frozenRotationTime = useSharedValue(0.0); // Rotation to lerp from

  // Compute shape data (torus points, QR points, optimal matching)
  const shapeData = useShapeData(qrData, torus, qrTargetHeight, sprite);

  // Load sprite sheet
  const spriteSheet = useImage(sprite.source);

  /**
   * Toggle between torus and QR code modes.
   */
  const toggle = () => {
    const showQR = !isShowingQR.value;
    isShowingQR.value = showQR;
    lastHapticIndex.value = -1;

    // Freeze rotation for consistent wave pattern
    const currentRotation = iTime.value % (2 * Math.PI);
    staggerBaseTime.value = currentRotation;
    frozenRotationTime.value = currentRotation;

    // Spring animation (longer for forward direction)
    progress.value = withSpring(showQR ? 1 : 0, {
      duration: showQR ? 6000 : 4000,
      dampingRatio: 1,
    });
  };

  // Expose toggle via ref (React 19 pattern)
  if (ref) {
    ref.current = { toggle };
  }

  // ─── HAPTIC FEEDBACK ───
  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (previous === null) return;

      if (current > previous) {
        // Forward: trigger haptics at thresholds
        for (let i = 0; i < HAPTIC_THRESHOLDS.length; i++) {
          if (
            previous < HAPTIC_THRESHOLDS[i] &&
            current >= HAPTIC_THRESHOLDS[i] &&
            i > lastHapticIndex.value
          ) {
            lastHapticIndex.value = i;
            scheduleOnRN(hapticSoft);
            break;
          }
        }
      } else if (current < 0.05) {
        // Reset when reversing
        lastHapticIndex.value = -1;
      }
    },
  );

  // ─── CONTINUOUS ROTATION ───
  useEffect(() => {
    const duration = 40000; // 40s per rotation
    const rotations = 1000; // Effectively infinite
    iTime.value = withTiming(Math.PI * 2 * rotations, {
      duration: duration * rotations,
      easing: Easing.linear,
    });
  }, [iTime]);

  // ─── RENDER FRAME ───
  const picture = useDerivedValue(() => {
    if (!spriteSheet) {
      // Empty picture while loading
      const recorder = Skia.PictureRecorder();
      recorder.beginRecording(Skia.XYWHRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
      return recorder.finishRecordingAsPicture();
    }
    return createPicture(
      spriteSheet,
      progress,
      iTime,
      staggerBaseTime,
      frozenRotationTime,
      shapeData,
      colors,
      avatarSize,
      zoom,
    );
  }, [
    spriteSheet,
    progress,
    iTime,
    staggerBaseTime,
    frozenRotationTime,
    shapeData,
    colors,
    avatarSize,
    zoom,
  ]);

  if (!spriteSheet) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
};

// ─── DEFAULT SPRITE CONFIG ───
const DEFAULT_SPRITE: SpriteConfig = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  source: require('./avatars-sprite.png'),
  cols: 5,
  rows: 4,
  cellSize: 128,
  numAvatars: 20,
};

/**
 * Pre-configured QR Code Animation with gradients and toggle button.
 * Uses the default reactiive.io QR code and avatar sprite.
 *
 * Supports pinch-to-zoom when viewing the donut:
 * - Pinch IN = zoom OUT = see full donut shape
 * - Pinch OUT = zoom IN = normal view
 */
const NotionQRCode = () => {
  const animationRef = useRef<QRCodeAnimationRef | null>(null);
  const progress = useSharedValue(0);
  const zoom = useSharedValue(0); // 0 = normal, 1 = zoomed out
  const savedZoom = useSharedValue(0);

  // Pinch gesture: only controls zoom when viewing donut (not QR)
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      savedZoom.value = zoom.value;
    })
    .onUpdate(event => {
      // Only allow zoom when showing the donut (progress near 0)
      if (progress.value > 0.1) return;

      // Pinch IN (scale < 1) = zoom OUT = see full donut
      // scale 0.3 → zoom 1, scale 1 → zoom 0
      const newZoom = savedZoom.value + (1 - event.scale);
      zoom.value = Math.max(0, Math.min(1, newZoom));
    })
    .onFinalize(() => {
      // Spring back to original view (same spring as toggle)
      zoom.value = withSpring(0, {
        duration: 1000,
        dampingRatio: 1,
      });
    });

  // Reset zoom when switching to QR mode
  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (previous === null) return;
      // Going to QR: reset zoom
      if (current > 0.5 && previous <= 0.5) {
        zoom.value = withSpring(0, { duration: 400, dampingRatio: 0.9 });
      }
    },
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={styles.gestureContainer}>
          <QRCodeAnimation
            ref={animationRef}
            qrData="https://www.reactiive.io"
            sprite={DEFAULT_SPRITE}
            progress={progress}
            zoom={zoom}
          />
        </Animated.View>
      </GestureDetector>

      <LinearGradient
        colors={['#fff', 'rgba(255, 255, 255, 0.8)', 'rgba(255, 255, 255, 0)']}
        locations={[0, 0.4, 1]}
        style={styles.topGradient}
        pointerEvents="none"
      />

      <LinearGradient
        colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.9)', '#fff']}
        locations={[0, 0.6, 1]}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      <ToggleButton
        progress={progress}
        onPress={() => animationRef.current?.toggle()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bottomGradient: {
    bottom: 0,
    height: 280,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  canvas: {
    height: CANVAS_HEIGHT,
    position: 'absolute',
    width: CANVAS_WIDTH,
  },
  container: {
    backgroundColor: '#f5f5f5',
    flex: 1,
  },
  gestureContainer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topGradient: {
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});

export { NotionQRCode, QRCodeAnimation };
export type { QRCodeAnimationProps, QRCodeAnimationRef };
