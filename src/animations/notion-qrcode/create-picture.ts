/**
 * createPicture - Core rendering worklet for the QR Code Animation
 *
 * This file contains the frame-by-frame rendering logic that runs as a Skia worklet.
 * It's separated from the main component for clarity and maintainability.
 *
 * ## Animation Pipeline (per frame):
 *
 * 1. COMPUTE TRANSFORMS: For each point, calculate:
 *    - Staggered delay based on angular position (creates wave effect)
 *    - Interpolated position between torus and QR shapes
 *    - 3D rotation (fades out as we approach QR mode)
 *    - Perspective projection to 2D screen coordinates
 *    - Size, opacity, and corner radius
 *
 * 2. DEPTH SORT: Order points back-to-front for correct occlusion
 *
 * 3. RENDER: Draw each point as:
 *    - Colored rounded rectangle background
 *    - Avatar image from sprite sheet (with clipping)
 */
import { SharedValue } from 'react-native-reanimated';
import { ClipOp, Skia, SkImage } from 'react-native-skia';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_X,
  CENTER_Y,
  DISTANCE,
} from './constants';
import { reusablePaint, reusableWhiteBgPaint } from './data';
import { ColorConfig, ShapeData } from './types';
import { smoothstep } from './utils';

/**
 * Background color string for an avatar at a given morph progress.
 * Shared by the per-frame path and the precomputed cache so both produce
 * exactly the same color.
 */
const backgroundColorString = (
  colors: ColorConfig,
  avatarIndex: number,
  contrastBoost: number,
) => {
  'worklet';
  const [satMin, satMax] = colors.saturationRange;
  const [lightMin, lightMax] = colors.lightnessRange;
  const satRange = satMax - satMin;
  const lightRange = lightMax - lightMin;

  const baseSat = satMin + (avatarIndex % 5) * (satRange / 4);
  const baseLight = lightMin + (avatarIndex % 4) * (lightRange / 3);

  // Increase contrast during morph (darker, more saturated)
  const sat = Math.min(100, baseSat + 10 * contrastBoost);
  const light = Math.max(30, baseLight - 15 * contrastBoost);

  return `hsl(${colors.hue}, ${sat}%, ${light}%)`;
};

/**
 * Parsed background colors for the two resting states (torus = 0, QR = 1).
 * Points sit at one of these most of the time, so the frame loop can skip
 * building and parsing an hsl() string per point.
 */
export type BackgroundColors = {
  torus: Float32Array[];
  qr: Float32Array[];
};

export const createBackgroundColors = (
  colors: ColorConfig,
  numAvatars: number,
): BackgroundColors => {
  const torus: Float32Array[] = [];
  const qr: Float32Array[] = [];
  for (let i = 0; i < numAvatars; i++) {
    torus.push(Skia.Color(backgroundColorString(colors, i, 0)));
    qr.push(Skia.Color(backgroundColorString(colors, i, 1)));
  }
  return { torus, qr };
};

/**
 * Creates a single frame of the animation as a Skia Picture.
 *
 * This worklet runs on the UI thread for smooth 60fps animation.
 * It computes transforms for all points, sorts by depth, and draws to canvas.
 *
 * @param spriteSheet - The loaded avatar sprite sheet image
 * @param progress - Animation progress (0 = torus, 1 = QR code)
 * @param iTime - Continuous rotation time (radians, loops every 2π)
 * @param staggerBaseTime - Frozen rotation angle when morph started (for wave)
 * @param frozenRotationTime - Rotation angle to interpolate from during morph
 * @param shapeData - Pre-computed torus/QR points and sprite coordinates
 * @param colors - HSL color configuration for backgrounds
 * @param avatarSize - Base size of avatars in torus mode
 * @param backgroundColors - Precomputed colors for the resting states
 */
export const createPicture = (
  spriteSheet: SkImage,
  progress: SharedValue<number>,
  iTime: SharedValue<number>,
  staggerBaseTime: SharedValue<number>,
  frozenRotationTime: SharedValue<number>,
  shapeData: ShapeData,
  colors: ColorConfig,
  avatarSize: number,
  backgroundColors: BackgroundColors,
) => {
  'worklet';

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: SETUP
  // Initialize Skia recorder and extract current animation values
  // ═══════════════════════════════════════════════════════════════════════════

  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
  );

  // Current animation state
  const progressValue = progress.get(); // 0 = torus, 1 = QR
  const timeValue = iTime.get() % (Math.PI * 2); // Current rotation (wrapped)
  const staggerTime = staggerBaseTime.get(); // Frozen rotation for wave
  const frozenRotation = frozenRotationTime.get(); // Rotation to lerp from

  // Shape data
  const { allShapes, nPoints, qrModuleSize, avatarAssignments, spriteCoords } =
    shapeData;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: COMPUTE TRANSFORMS
  // Calculate screen position and visual properties for each point.
  // Stored in flat arrays indexed by point (no per-point objects).
  // ═══════════════════════════════════════════════════════════════════════════

  const xs = new Float64Array(nPoints); // Screen X (top-left corner)
  const ys = new Float64Array(nPoints); // Screen Y (top-left corner)
  const sizes = new Float64Array(nPoints); // Rendered size in pixels
  const cornerRadii = new Float64Array(nPoints); // Circle → square during morph
  const imageOpacities = new Float64Array(nPoints); // Fades out during morph
  const zs = new Float64Array(nPoints); // Z-depth (larger = further away)
  const morphProgresses = new Float64Array(nPoints); // Eased progress (0-1)

  // Rotation angles shared by every point
  const staggerTiltCos = Math.cos(0.3);
  const staggerTiltSin = Math.sin(0.3);
  const staggerCos = Math.cos(staggerTime);
  const staggerSin = Math.sin(staggerTime);

  // Handle 2π wrapping to prevent sudden jumps
  let rotationDelta = timeValue - frozenRotation;
  if (rotationDelta > Math.PI) rotationDelta -= 2 * Math.PI;
  if (rotationDelta < -Math.PI) rotationDelta += 2 * Math.PI;

  for (let index = 0; index < nPoints; index++) {
    const torusPoint = allShapes[0][index];
    const qrPoint = allShapes[1][index];

    // ─── 2a: CALCULATE STAGGERED DELAY ─────────────────────────────────────
    // Points at different angles around the torus get different delays,
    // creating a "wave" effect that sweeps around during morphing.

    // Rotate torus point to frozen position for consistent wave pattern
    // (rotateX by 0.3, then rotateY by staggerTime, inlined)
    const tiltedZ =
      torusPoint.y * staggerTiltSin + torusPoint.z * staggerTiltCos;
    const rotatedTorusX = torusPoint.x * staggerCos + tiltedZ * staggerSin;
    const rotatedTorusZ = -torusPoint.x * staggerSin + tiltedZ * staggerCos;

    // Convert XZ position to angle (0 to 2π around the torus)
    const angle = Math.atan2(rotatedTorusZ, rotatedTorusX);
    const normalizedAngle = (angle + Math.PI) / (2 * Math.PI); // 0 to 1

    // Wave delay: angle 0 starts immediately, angle 1 starts at 25% progress
    const waveDelay = normalizedAngle * 0.25;

    // Remap global progress to this point's local progress
    const staggeredProgress = Math.min(
      1,
      Math.max(0, (progressValue - waveDelay) / (1 - waveDelay)),
    );

    // ─── 2b: APPLY EASING ──────────────────────────────────────────────────
    // Cubic ease-in-out for smooth acceleration/deceleration
    const eased =
      staggeredProgress < 0.5
        ? 4 * Math.pow(staggeredProgress, 3)
        : 1 - Math.pow(-2 * staggeredProgress + 2, 3) / 2;

    // ─── 2c: INTERPOLATE POSITION ──────────────────────────────────────────
    // Linear interpolation between torus [0] and QR [1] positions
    const baseX = torusPoint.x + (qrPoint.x - torusPoint.x) * eased;
    const baseY = torusPoint.y + (qrPoint.y - torusPoint.y) * eased;
    const baseZ = torusPoint.z + (qrPoint.z - torusPoint.z) * eased;

    // ─── 2d: APPLY 3D ROTATION ─────────────────────────────────────────────
    // Rotation fades out as we approach QR mode

    // "Transition boost" adds a slight arc during mid-morph
    const transitionBoost = Math.sin(eased * Math.PI) * 0.6;

    const rotationAmount =
      (frozenRotation + rotationDelta) * (1 - eased) + transitionBoost;
    const tiltAmount = 0.3 * (1 - eased);

    // Apply rotation (rotateX by tiltAmount, then rotateY, inlined)
    const tiltCos = Math.cos(tiltAmount);
    const tiltSin = Math.sin(tiltAmount);
    const tY = baseY * tiltCos - baseZ * tiltSin;
    const tZ = baseY * tiltSin + baseZ * tiltCos;
    const rotCos = Math.cos(rotationAmount);
    const rotSin = Math.sin(rotationAmount);
    const px = baseX * rotCos + tZ * rotSin;
    const py = tY;
    const pz = -baseX * rotSin + tZ * rotCos;

    // ─── 2e: PERSPECTIVE PROJECTION ────────────────────────────────────────
    // Objects further away appear smaller
    const scale = DISTANCE / (DISTANCE + pz);
    const screenX = CENTER_X + px * scale;
    const screenY = CENTER_Y + py * scale;

    // ─── 2f: CALCULATE SIZE ────────────────────────────────────────────────
    const avatarScale = avatarSize * scale;
    const qrScale = qrModuleSize * scale * 0.9;
    const baseSize = avatarScale + (qrScale - avatarScale) * eased;

    // Pulse effect during morph (grows then shrinks)
    const pulsePhase = eased * Math.PI;
    const scalePulse =
      1 + Math.sin(pulsePhase) * Math.pow(1 - eased, 0.5) * 0.3;
    const size = baseSize * scalePulse;

    // ─── 2g: VISUAL PROPERTIES ─────────────────────────────────────────────
    const frontFade = smoothstep(100, -150, pz); // Depth-based fade
    const transitionOpacity = 1 - eased;

    xs[index] = screenX - size / 2;
    ys[index] = screenY - size / 2;
    sizes[index] = size;
    cornerRadii[index] = (size / 2) * (1 - eased); // Circle → Square
    imageOpacities[index] = transitionOpacity * frontFade;
    zs[index] = pz;
    morphProgresses[index] = eased;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: DEPTH SORT
  // Draw back-to-front for correct occlusion (painter's algorithm)
  // ═══════════════════════════════════════════════════════════════════════════

  // Sort by z-depth (larger z = further = draw first), ties by index: the
  // same order the old stable insertion sort gave, in O(n log n) instead of
  // O(n²) moves per frame.
  const order: number[] = [];
  for (let i = 0; i < nPoints; i++) order.push(i);
  order.sort((a, b) => zs[b] - zs[a] || a - b);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: RENDER
  // Draw each avatar to the canvas
  // ═══════════════════════════════════════════════════════════════════════════

  // Plain rect/rrect objects reused for every point: Skia reads them by value,
  // so this avoids ~1.5k host-object allocations per frame.
  const srcRect = { x: 0, y: 0, width: 0, height: 0 };
  const dstRect = { x: 0, y: 0, width: 0, height: 0 };
  const bgRect = { x: 0, y: 0, width: 0, height: 0 };
  const bgRRect = { rect: bgRect, rx: 0, ry: 0 };
  const clipRRect = { rect: dstRect, rx: 0, ry: 0 };

  for (let o = 0; o < nPoints; o++) {
    const index = order[o];
    const avatarIndex = avatarAssignments[index];
    const coords = spriteCoords[avatarIndex];
    const x = xs[index];
    const y = ys[index];
    const size = sizes[index];
    const imageOpacity = imageOpacities[index];
    const morphProgress = morphProgresses[index];

    // Sprite sheet rectangles
    srcRect.x = coords.x;
    srcRect.y = coords.y;
    srcRect.width = coords.w;
    srcRect.height = coords.h;
    dstRect.x = x;
    dstRect.y = y;
    dstRect.width = size;
    dstRect.height = size;

    // ─── 4a: COLORED BACKGROUND ────────────────────────────────────────────
    // Each avatar gets a slightly different color (visual variety), with
    // more contrast during the morph.
    if (morphProgress === 0) {
      reusableWhiteBgPaint.setColor(backgroundColors.torus[avatarIndex]);
    } else if (morphProgress === 1) {
      reusableWhiteBgPaint.setColor(backgroundColors.qr[avatarIndex]);
    } else {
      reusableWhiteBgPaint.setColor(
        Skia.Color(backgroundColorString(colors, avatarIndex, morphProgress)),
      );
    }
    const bgOpacity = Math.max(imageOpacity, morphProgress);
    reusableWhiteBgPaint.setAlphaf(bgOpacity);

    // Draw rounded rect (slightly larger than avatar)
    const padding = 1;
    bgRect.x = x - padding;
    bgRect.y = y - padding;
    bgRect.width = size + padding;
    bgRect.height = size + padding;
    const bgRadius = (size + padding) / 2;
    bgRRect.rx = bgRadius;
    bgRRect.ry = bgRadius;
    canvas.drawRRect(bgRRect, reusableWhiteBgPaint);

    // ─── 4b: AVATAR IMAGE ──────────────────────────────────────────────────
    if (imageOpacity > 0) {
      reusablePaint.setAlphaf(imageOpacity);

      // Clip to rounded rectangle — clipRRect avoids the deprecated mutable
      // SkPath (reset/addRRect) entirely.
      canvas.save();
      clipRRect.rx = cornerRadii[index];
      clipRRect.ry = cornerRadii[index];
      canvas.clipRRect(clipRRect, ClipOp.Intersect, true);
      canvas.drawImageRect(spriteSheet, srcRect, dstRect, reusablePaint);
      canvas.restore();
    }
  }

  return recorder.finishRecordingAsPicture();
};
