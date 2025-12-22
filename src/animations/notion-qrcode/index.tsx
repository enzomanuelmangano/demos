import { StyleSheet, View } from 'react-native';

import { useEffect } from 'react';

import {
  Canvas,
  ClipOp,
  ColorMatrix,
  Picture,
  Skia,
  SkImage,
  useImage,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Easing,
  SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ToggleButton } from './components';
import {
  AVATAR_SIZE,
  BG_COLOR_HUE,
  BG_COLOR_LIGHT_MAX,
  BG_COLOR_LIGHT_MIN,
  BG_COLOR_SAT_MAX,
  BG_COLOR_SAT_MIN,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_X,
  CENTER_Y,
  DISTANCE,
} from './constants';
import {
  ALL_SHAPES,
  AVATAR_ASSIGNMENTS,
  N_POINTS,
  QR_MODULE_SIZE,
  SPRITE_COORDS,
  reusableClipPath,
  reusablePaint,
  reusableWhiteBgPaint,
} from './data';
import { Point3D } from './types';
import { hapticSoft, rotateX, rotateY, smoothstep } from './utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SPRITE_SHEET_SOURCE = require('./avatars-sprite.png');

interface AvatarTransform {
  index: number;
  x: number;
  y: number;
  size: number;
  cornerRadius: number;
  imageOpacity: number;
  overlayOpacity: number;
  z: number;
  depthFactor: number;
  morphProgress: number;
}

// Generate consistent monochromatic color for each avatar
const getAvatarColor = (avatarIndex: number) => {
  'worklet';
  const satRange = BG_COLOR_SAT_MAX - BG_COLOR_SAT_MIN;
  const lightRange = BG_COLOR_LIGHT_MAX - BG_COLOR_LIGHT_MIN;

  const saturation = BG_COLOR_SAT_MIN + (avatarIndex % 5) * (satRange / 4);
  const lightness = BG_COLOR_LIGHT_MIN + (avatarIndex % 4) * (lightRange / 3);

  return `hsl(${BG_COLOR_HUE}, ${saturation}%, ${lightness}%)`;
};

const createPicture = (
  spriteSheet: SkImage,
  progress: SharedValue<number>,
  iTime: SharedValue<number>,
  staggerBaseTime: SharedValue<number>,
  frozenRotationTime: SharedValue<number>,
) => {
  'worklet';
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
  );

  const progressValue = progress.value;
  const timeValue = iTime.value % (Math.PI * 2); // Use modulo for live rotation
  const staggerTime = staggerBaseTime.value;
  const frozenRotation = frozenRotationTime.value;

  const transforms: AvatarTransform[] = [];

  for (let index = 0; index < N_POINTS; index++) {
    const torusPoint = ALL_SHAPES[0][index];

    // Use frozen stagger time for consistent wave pattern during morph
    let rotatedTorus = rotateX(torusPoint, 0.3);
    rotatedTorus = rotateY(rotatedTorus, staggerTime);

    // Calculate stagger based on frozen position (consistent wave pattern)
    const angle = Math.atan2(rotatedTorus.z, rotatedTorus.x);
    const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);

    const waveDelay = normalizedAngle * 0.25;
    const staggeredProgress = Math.min(
      1,
      Math.max(0, (progressValue - waveDelay) / (1 - waveDelay)),
    );

    // Symmetric ease-in-out for smooth behavior in both directions
    const eased =
      staggeredProgress < 0.5
        ? 4 * Math.pow(staggeredProgress, 3)
        : 1 - Math.pow(-2 * staggeredProgress + 2, 3) / 2;

    const baseX =
      ALL_SHAPES[0][index].x +
      (ALL_SHAPES[1][index].x - ALL_SHAPES[0][index].x) * eased;
    const baseY =
      ALL_SHAPES[0][index].y +
      (ALL_SHAPES[1][index].y - ALL_SHAPES[0][index].y) * eased;
    const baseZ =
      ALL_SHAPES[0][index].z +
      (ALL_SHAPES[1][index].z - ALL_SHAPES[0][index].z) * eased;

    const transitionBoost = Math.sin(eased * Math.PI) * 0.6;
    // Calculate rotation relative to frozen point, handling 2π wrapping
    let rotationDelta = timeValue - frozenRotation;
    // Normalize delta to [-π, π] range to handle wrapping correctly
    if (rotationDelta > Math.PI) rotationDelta -= 2 * Math.PI;
    if (rotationDelta < -Math.PI) rotationDelta += 2 * Math.PI;
    const rotationAmount =
      (frozenRotation + rotationDelta) * (1 - eased) + transitionBoost;
    const tiltAmount = 0.3 * (1 - eased);

    let p: Point3D = { x: baseX, y: baseY, z: baseZ };
    p = rotateX(p, tiltAmount);
    p = rotateY(p, rotationAmount);

    const scale = DISTANCE / (DISTANCE + p.z);
    const screenX = CENTER_X + p.x * scale;
    const screenY = CENTER_Y + p.y * scale;

    const avatarScale = AVATAR_SIZE * scale;
    const qrScale = QR_MODULE_SIZE * scale * 0.9;
    const baseSize = avatarScale + (qrScale - avatarScale) * eased;
    const pulsePhase = eased * Math.PI;
    const scalePulse =
      1 + Math.sin(pulsePhase) * Math.pow(1 - eased, 0.5) * 0.3;
    const size = baseSize * scalePulse;

    const cornerRadius = (size / 2) * (1 - eased);
    const frontFade = smoothstep(100, -150, p.z);
    // Use symmetric easing for opacity - smooth both ways
    const transitionOpacity = 1 - eased;
    const imageOpacity = transitionOpacity * frontFade;
    const overlayOpacity = Math.min(1, eased * 1.5);

    const maxZ = 200;
    const depthFactor = Math.max(0, Math.min(1, (p.z + maxZ) / (maxZ * 2)));

    transforms.push({
      index,
      x: screenX - size / 2,
      y: screenY - size / 2,
      size,
      cornerRadius,
      imageOpacity,
      overlayOpacity,
      z: p.z,
      depthFactor,
      morphProgress: eased,
    });
  }

  // Sort by z-depth (back to front) using insertion sort
  for (let i = 1; i < transforms.length; i++) {
    const current = transforms[i];
    let j = i - 1;
    while (j >= 0 && transforms[j].z < current.z) {
      transforms[j + 1] = transforms[j];
      j--;
    }
    transforms[j + 1] = current;
  }

  // Draw all avatars
  for (const t of transforms) {
    const avatarIndex = AVATAR_ASSIGNMENTS[t.index];
    const coords = SPRITE_COORDS[avatarIndex];
    const srcRect = Skia.XYWHRect(coords.x, coords.y, coords.w, coords.h);
    const dstRect = Skia.XYWHRect(t.x, t.y, t.size, t.size);

    // Draw colored background - repositions to form QR code
    // Progressively increase contrast during morph while keeping variation
    const satRange = BG_COLOR_SAT_MAX - BG_COLOR_SAT_MIN;
    const lightRange = BG_COLOR_LIGHT_MAX - BG_COLOR_LIGHT_MIN;
    const baseSat = BG_COLOR_SAT_MIN + (avatarIndex % 5) * (satRange / 4);
    const baseLight = BG_COLOR_LIGHT_MIN + (avatarIndex % 4) * (lightRange / 3);

    // Apply uniform boost to all colors: +10 saturation, -15 lightness at full QR
    const contrastBoost = t.morphProgress;
    const sat = Math.min(100, baseSat + 10 * contrastBoost);
    const light = Math.max(30, baseLight - 15 * contrastBoost);

    const bgColor = `hsl(${BG_COLOR_HUE}, ${sat}%, ${light}%)`;
    reusableWhiteBgPaint.setColor(Skia.Color(bgColor));
    // Linear interpolation: torus mode (imageOpacity) → QR mode (1.0)
    const bgOpacity = Math.max(t.imageOpacity, t.morphProgress);
    reusableWhiteBgPaint.setAlphaf(bgOpacity);

    const padding = 1;
    const bgRect = Skia.XYWHRect(
      t.x - padding,
      t.y - padding,
      t.size + padding,
      t.size + padding,
    );
    const bgRadius = (t.size + padding) / 2;
    const bgRRect = Skia.RRectXY(bgRect, bgRadius, bgRadius);
    canvas.drawRRect(bgRRect, reusableWhiteBgPaint);

    // Draw avatar image (stays fully colored, no color interpolation)
    if (t.imageOpacity > 0) {
      reusablePaint.setAlphaf(t.imageOpacity);

      canvas.save();
      reusableClipPath.reset();
      reusableClipPath.addRRect(
        Skia.RRectXY(dstRect, t.cornerRadius, t.cornerRadius),
      );
      canvas.clipPath(reusableClipPath, ClipOp.Intersect, true);
      canvas.drawImageRect(spriteSheet, srcRect, dstRect, reusablePaint);
      canvas.restore();
    }
  }

  return recorder.finishRecordingAsPicture();
};

// Front-loaded haptics: strong burst at start, then silence
const HAPTIC_THRESHOLDS = [0.05, 0.12, 0.21, 0.32];

const NotionQRCode = () => {
  const iTime = useSharedValue(0.0);
  const progress = useSharedValue(0);
  const isShowingQR = useSharedValue(false);
  const lastHapticIndex = useSharedValue(-1);
  const staggerBaseTime = useSharedValue(0.0);
  const frozenRotationTime = useSharedValue(0.0);

  const toggleQR = () => {
    const showQR = !isShowingQR.value;
    isShowingQR.value = showQR;
    lastHapticIndex.value = -1;
    // Freeze the current rotation angles for consistent patterns
    const currentRotation = iTime.value % (2 * Math.PI);
    staggerBaseTime.value = currentRotation;
    frozenRotationTime.value = currentRotation;
    progress.value = withSpring(showQR ? 1 : 0, {
      duration: showQR ? 6000 : 4000,
      dampingRatio: 1,
    });
  };

  // Quick haptic burst at animation start, then silence
  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (previous === null) return;

      const isForward = current > previous;

      if (isForward) {
        // Forward only: quick burst of haptics at the start
        for (let i = 0; i < HAPTIC_THRESHOLDS.length; i++) {
          const threshold = HAPTIC_THRESHOLDS[i];
          if (
            previous < threshold &&
            current >= threshold &&
            i > lastHapticIndex.value
          ) {
            lastHapticIndex.value = i;
            scheduleOnRN(hapticSoft);
            break;
          }
        }
      } else {
        // Reset tracking when going back (no haptics)
        if (current < 0.05) {
          lastHapticIndex.value = -1;
        }
      }
    },
  );

  const spriteSheet = useImage(SPRITE_SHEET_SOURCE);

  useEffect(() => {
    const duration = 40000;
    const rotationsCount = 1000;
    iTime.value = withTiming(Math.PI * 2 * rotationsCount, {
      duration: duration * rotationsCount,
      easing: Easing.linear,
    });
  }, [iTime]);

  const picture = useDerivedValue(() => {
    if (!spriteSheet) {
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
    );
  }, [spriteSheet, progress, iTime, staggerBaseTime, frozenRotationTime]);

  if (!spriteSheet) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Picture picture={picture} />
      </Canvas>

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

      <ToggleButton progress={progress} onPress={toggleQR} />
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
});

export { NotionQRCode };
