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
import { ClipOp, Skia, SkImage } from '@shopify/react-native-skia';
import { interpolate, SharedValue } from 'react-native-reanimated';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CENTER_X,
  CENTER_Y,
  DISTANCE,
} from './constants';
import { reusableClipPath, reusablePaint, reusableWhiteBgPaint } from './data';
import { ColorConfig, Point3D, ShapeData } from './types';
import { rotateX, rotateY, smoothstep } from './utils';

/**
 * Computed transform data for a single avatar in the current frame.
 * Calculated for each point, then sorted by z-depth for proper rendering.
 */
interface AvatarTransform {
  index: number; // Original point index (for sprite assignment)
  x: number; // Screen X position (top-left corner)
  y: number; // Screen Y position (top-left corner)
  size: number; // Rendered size in pixels
  cornerRadius: number; // For rounded corners (circle → square during morph)
  imageOpacity: number; // Avatar image opacity (fades out during morph)
  z: number; // Z-depth for sorting (larger = further away)
  morphProgress: number; // This point's eased progress (0-1)
}

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
 * @param zoom - Zoom level (0 = normal view, 1 = zoomed out to see full donut)
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
  zoom: SharedValue<number>,
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
  const progressValue = progress.value; // 0 = torus, 1 = QR
  const timeValue = iTime.value % (Math.PI * 2); // Current rotation (wrapped)
  const staggerTime = staggerBaseTime.value; // Frozen rotation for wave
  const frozenRotation = frozenRotationTime.value; // Rotation to lerp from
  const zoomValue = zoom.value; // 0 = normal, 1 = zoomed out to see donut

  // Zoom-interpolated values: zoom=0 (normal) → zoom=1 (see full donut)
  // Position scale: 1 → 0.215 (ratio of targetHeight 0.14/0.65)
  const zoomPositionScale = interpolate(zoomValue, [0, 1], [1, 0.215]);
  // Tilt: 0.3 → 0.8 (more tilt to see donut shape from above)
  const zoomTilt = interpolate(zoomValue, [0, 1], [0.3, 0.8]);

  // Shape data
  const { allShapes, nPoints, qrModuleSize, avatarAssignments, spriteCoords } =
    shapeData;

  // Color ranges for background variation
  const [satMin, satMax] = colors.saturationRange;
  const [lightMin, lightMax] = colors.lightnessRange;
  const satRange = satMax - satMin;
  const lightRange = lightMax - lightMin;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: COMPUTE TRANSFORMS
  // Calculate screen position and visual properties for each point
  // ═══════════════════════════════════════════════════════════════════════════

  const transforms: AvatarTransform[] = [];

  for (let index = 0; index < nPoints; index++) {
    const torusPoint = allShapes[0][index];

    // ─── 2a: CALCULATE STAGGERED DELAY ─────────────────────────────────────
    // Points at different angles around the torus get different delays,
    // creating a "wave" effect that sweeps around during morphing.

    // Rotate torus point to frozen position for consistent wave pattern
    let rotatedTorus = rotateX(torusPoint, 0.3);
    rotatedTorus = rotateY(rotatedTorus, staggerTime);

    // Convert XZ position to angle (0 to 2π around the torus)
    const angle = Math.atan2(rotatedTorus.z, rotatedTorus.x);
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
    const baseX =
      allShapes[0][index].x +
      (allShapes[1][index].x - allShapes[0][index].x) * eased;
    const baseY =
      allShapes[0][index].y +
      (allShapes[1][index].y - allShapes[0][index].y) * eased;
    const baseZ =
      allShapes[0][index].z +
      (allShapes[1][index].z - allShapes[0][index].z) * eased;

    // ─── 2d: APPLY 3D ROTATION ─────────────────────────────────────────────
    // Rotation fades out as we approach QR mode

    // "Transition boost" adds a slight arc during mid-morph
    const transitionBoost = Math.sin(eased * Math.PI) * 0.6;

    // Handle 2π wrapping to prevent sudden jumps
    let rotationDelta = timeValue - frozenRotation;
    if (rotationDelta > Math.PI) rotationDelta -= 2 * Math.PI;
    if (rotationDelta < -Math.PI) rotationDelta += 2 * Math.PI;

    const rotationAmount =
      (frozenRotation + rotationDelta) * (1 - eased) + transitionBoost;
    // Tilt: 0.3 (normal) → 0.8 (zoomed out) - more tilt shows donut shape
    const tiltAmount = zoomTilt * (1 - eased);

    // Apply zoom scale to positions (makes torus smaller when zoomed out)
    let p: Point3D = {
      x: baseX * zoomPositionScale,
      y: baseY * zoomPositionScale,
      z: baseZ * zoomPositionScale,
    };
    p = rotateX(p, tiltAmount);
    p = rotateY(p, rotationAmount);

    // ─── 2e: PERSPECTIVE PROJECTION ────────────────────────────────────────
    // Objects further away appear smaller
    const scale = DISTANCE / (DISTANCE + p.z);
    const screenX = CENTER_X + p.x * scale;
    const screenY = CENTER_Y + p.y * scale;

    // ─── 2f: CALCULATE SIZE ────────────────────────────────────────────────
    // Avatar size: avatarSize * scale (normal) → avatarSize * 0.25 (zoomed out)
    const avatarScaleMultiplier = interpolate(zoomValue, [0, 1], [scale, 0.2]);
    const avatarScale = avatarSize * avatarScaleMultiplier;
    const qrScale = qrModuleSize * scale * 0.9;
    const baseSize = avatarScale + (qrScale - avatarScale) * eased;

    // Pulse effect during morph (grows then shrinks)
    const pulsePhase = eased * Math.PI;
    const scalePulse =
      1 + Math.sin(pulsePhase) * Math.pow(1 - eased, 0.5) * 0.3;
    const size = baseSize * scalePulse;

    // ─── 2g: VISUAL PROPERTIES ─────────────────────────────────────────────
    const cornerRadius = (size / 2) * (1 - eased); // Circle → Square
    const frontFade = smoothstep(100, -150, p.z); // Depth-based fade
    const transitionOpacity = 1 - eased;
    const imageOpacity = transitionOpacity * frontFade;

    transforms.push({
      index,
      x: screenX - size / 2,
      y: screenY - size / 2,
      size,
      cornerRadius,
      imageOpacity,
      z: p.z,
      morphProgress: eased,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: DEPTH SORT
  // Draw back-to-front for correct occlusion (painter's algorithm)
  // ═══════════════════════════════════════════════════════════════════════════

  // Insertion sort by z-depth (larger z = further = draw first)
  for (let i = 1; i < transforms.length; i++) {
    const current = transforms[i];
    let j = i - 1;
    while (j >= 0 && transforms[j].z < current.z) {
      transforms[j + 1] = transforms[j];
      j--;
    }
    transforms[j + 1] = current;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: RENDER
  // Draw each avatar to the canvas
  // ═══════════════════════════════════════════════════════════════════════════

  for (const t of transforms) {
    const avatarIndex = avatarAssignments[t.index];
    const coords = spriteCoords[avatarIndex];

    // Sprite sheet rectangles
    const srcRect = Skia.XYWHRect(coords.x, coords.y, coords.w, coords.h);
    const dstRect = Skia.XYWHRect(t.x, t.y, t.size, t.size);

    // ─── 4a: COLORED BACKGROUND ────────────────────────────────────────────
    // Each avatar gets a slightly different color (visual variety)
    const baseSat = satMin + (avatarIndex % 5) * (satRange / 4);
    const baseLight = lightMin + (avatarIndex % 4) * (lightRange / 3);

    // Increase contrast during morph (darker, more saturated)
    const contrastBoost = t.morphProgress;
    const sat = Math.min(100, baseSat + 10 * contrastBoost);
    const light = Math.max(30, baseLight - 15 * contrastBoost);

    const bgColor = `hsl(${colors.hue}, ${sat}%, ${light}%)`;
    reusableWhiteBgPaint.setColor(Skia.Color(bgColor));
    const bgOpacity = Math.max(t.imageOpacity, t.morphProgress);
    reusableWhiteBgPaint.setAlphaf(bgOpacity);

    // Draw rounded rect (slightly larger than avatar)
    const padding = 1;
    const bgRect = Skia.XYWHRect(
      t.x - padding,
      t.y - padding,
      t.size + padding,
      t.size + padding,
    );
    const bgRadius = (t.size + padding) / 2;
    canvas.drawRRect(
      Skia.RRectXY(bgRect, bgRadius, bgRadius),
      reusableWhiteBgPaint,
    );

    const imgOpacity = interpolate(zoomValue, [0, 1], [t.imageOpacity, 0]);
    // ─── 4b: AVATAR IMAGE ──────────────────────────────────────────────────
    if (imgOpacity > 0) {
      reusablePaint.setAlphaf(imgOpacity);

      // Clip to rounded rectangle
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
