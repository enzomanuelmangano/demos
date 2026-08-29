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
import { StyleSheet, Text, View } from 'react-native';

import { useEffect, useRef, useState } from 'react';

import { Canvas, Picture, Skia, useImage } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import {
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
  ref,
}: QRCodeAnimationProps) => {
  // ─── ANIMATION STATE ───
  const iTime = useSharedValue(0.0); // Continuous rotation time
  const internalProgress = useSharedValue(0); // Fallback if no external
  const progress = externalProgress ?? internalProgress;
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
    const showQR = !isShowingQR.get();
    isShowingQR.set(showQR);
    lastHapticIndex.set(-1);

    // Freeze rotation for consistent wave pattern
    const currentRotation = iTime.get() % (2 * Math.PI);
    staggerBaseTime.set(currentRotation);
    frozenRotationTime.set(currentRotation);

    // Spring animation (longer for forward direction)
    progress.set(
      withSpring(showQR ? 1 : 0, {
        duration: showQR ? 6000 : 4000,
        dampingRatio: 1,
      }),
    );
  };

  // Expose toggle via ref (React 19 pattern)
  if (ref) {
    ref.current = { toggle };
  }

  // ─── HAPTIC FEEDBACK ───
  useAnimatedReaction(
    () => progress.get(),
    (current, previous) => {
      if (previous === null) return;

      if (current > previous) {
        // Forward: trigger haptics at thresholds
        for (let i = 0; i < HAPTIC_THRESHOLDS.length; i++) {
          if (
            previous < HAPTIC_THRESHOLDS[i] &&
            current >= HAPTIC_THRESHOLDS[i] &&
            i > lastHapticIndex.get()
          ) {
            lastHapticIndex.set(i);
            scheduleOnRN(hapticSoft);
            break;
          }
        }
      } else if (current < 0.05) {
        // Reset when reversing
        lastHapticIndex.set(-1);
      }
    },
  );

  // ─── CONTINUOUS ROTATION ───
  useEffect(() => {
    const duration = 40000; // 40s per rotation
    const rotations = 1000; // Effectively infinite
    iTime.set(
      withTiming(Math.PI * 2 * rotations, {
        duration: duration * rotations,
        easing: Easing.linear,
      }),
    );
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
  ]);

  // Don't render until both sprite and shape data are ready
  if (!spriteSheet || shapeData.nPoints === 0) {
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
 */
const NotionQRCode = () => {
  const animationRef = useRef<QRCodeAnimationRef | null>(null);
  const progress = useSharedValue(0);

  // e2e outcome probe: the torus↔QR mode is driven by a spring on the UI
  // thread. Bridge progress crossing the halfway point back to JS so a test can
  // assert the toggle actually morphed. Visually negligible (alpha ~0.01).
  const [status, setStatus] = useState<'torus' | 'qr'>('torus');
  useAnimatedReaction(
    () => progress.get() > 0.5,
    (isQR, prev) => {
      if (prev === null || isQR === prev) return;
      scheduleOnRN(setStatus, isQR ? 'qr' : 'torus');
    },
  );

  return (
    <View style={styles.container}>
      <Text testID="notion-qrcode-status" style={styles.statusProbe}>
        {status}
      </Text>
      <QRCodeAnimation
        ref={animationRef}
        qrData="https://www.reactiive.io"
        sprite={DEFAULT_SPRITE}
        progress={progress}
      />

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
  topGradient: {
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#f5f5f5',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { NotionQRCode, QRCodeAnimation };
export type { QRCodeAnimationProps, QRCodeAnimationRef };
