import {
  BlurMask,
  Canvas,
  Group,
  Oval,
  Path,
  usePathInterpolation,
} from '@shopify/react-native-skia';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  FACE_CENTER_X,
  FACE_CENTER_Y,
  FLAME_PATHS,
  INNER_PATHS,
  LEFT_EYE_BASE_PATHS,
  LEFT_EYE_TAP_PATHS,
  lerpPalette,
  MOOD_INPUT_RANGE,
  MOUTH_BASE_PATHS,
  MOUTH_TAP_PATHS,
  RIGHT_EYE_BASE_PATHS,
  RIGHT_EYE_TAP_PATHS,
} from '../data';
import { useCheckyAnimation, useCheckyGesture } from '../hooks';
import { Particle } from './particle';

const FACE_TRANSFORM = [
  { translateX: FACE_CENTER_X },
  { translateY: FACE_CENTER_Y },
  { scale: 0.88 },
  { translateX: -FACE_CENTER_X },
  { translateY: -FACE_CENTER_Y },
];

type ScrollFlameProps = {
  progress: SharedValue<number>;
  size?: number;
};

export function ScrollFlame({ progress, size = 280 }: ScrollFlameProps) {
  const scale = size / 180;
  const canvasW = size * 1.6;
  const canvasH = size * 1.8;
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;

  const { gesture, yawnProgress, yawnSeed, eyeScale, fingerAngle } =
    useCheckyGesture({ centerX, centerY });

  const {
    flamePhase,
    innerPhase,
    particleTs,
    particleIntensity,
    breatheScale,
    glowOpacity,
    glowIntensity,
  } = useCheckyAnimation({ progress, yawnProgress });

  // Expression progress (eased)
  const exprProgress = useDerivedValue(
    () => 1 - Math.pow(1 - Math.min(1, yawnProgress.value), 3),
  );

  // Path interpolation
  const leftEyeBase = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    LEFT_EYE_BASE_PATHS,
  );
  const rightEyeBase = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    RIGHT_EYE_BASE_PATHS,
  );
  const mouthBase = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    MOUTH_BASE_PATHS,
  );
  const leftEyeTap = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    LEFT_EYE_TAP_PATHS,
  );
  const rightEyeTap = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    RIGHT_EYE_TAP_PATHS,
  );
  const mouthTap = usePathInterpolation(
    progress,
    MOOD_INPUT_RANGE,
    MOUTH_TAP_PATHS,
  );

  const leftEye = useDerivedValue(
    () =>
      leftEyeBase.value.interpolate(leftEyeTap.value, exprProgress.value) ??
      leftEyeBase.value,
  );
  const rightEye = useDerivedValue(
    () =>
      rightEyeBase.value.interpolate(rightEyeTap.value, exprProgress.value) ??
      rightEyeBase.value,
  );
  const mouth = useDerivedValue(
    () =>
      mouthBase.value.interpolate(mouthTap.value, exprProgress.value) ??
      mouthBase.value,
  );

  const flamePath = usePathInterpolation(
    flamePhase,
    [0, 0.33, 0.67, 1],
    [FLAME_PATHS.A, FLAME_PATHS.B, FLAME_PATHS.C, FLAME_PATHS.A],
  );
  const innerPath = usePathInterpolation(
    innerPhase,
    [0, 0.33, 0.67, 1],
    [INNER_PATHS.A, INNER_PATHS.C, INNER_PATHS.B, INNER_PATHS.A],
  );

  const palette = useDerivedValue(() => lerpPalette(progress.value));

  // Transforms
  const eyeBlinkTransform = useDerivedValue(() => [
    { translateX: FACE_CENTER_X },
    { translateY: 115 },
    { scaleY: eyeScale.value },
    { translateX: -FACE_CENTER_X },
    { translateY: -115 },
  ]);

  const flameYawnTransform = useDerivedValue(() => {
    const o = yawnProgress.value;
    const stretch =
      1 + interpolate(o, [0, 0.4, 0.7, 1], [0, 0.6, 0.9, 1]) * 0.15;
    return [{ translateY: 190 }, { scaleY: stretch }, { translateY: -190 }];
  });

  const rootTransform = useDerivedValue(() => {
    const s = breatheScale.value;
    const o = yawnProgress.value;
    const seed = yawnSeed.value;
    const sx = 1 + o * (0.02 + seed * 0.03);
    const sy = 1 + o * (0.03 + (1 - seed) * 0.03);
    const tilt =
      o * Math.max(-15, Math.min(15, (fingerAngle.value * 180) / Math.PI));
    return [
      { scale: s },
      { translateX: FACE_CENTER_X },
      { translateY: FACE_CENTER_Y + 2 },
      { rotate: (tilt * Math.PI) / 180 },
      { scaleX: sx },
      { scaleY: sy },
      { translateX: -FACE_CENTER_X },
      { translateY: -FACE_CENTER_Y - 2 },
    ];
  });

  const glowCombined = useDerivedValue(
    () => (glowOpacity.value + yawnProgress.value * 0.12) * glowIntensity.value,
  );

  // Derived colors
  const feat = useDerivedValue(() => palette.value.feature);
  const glowO = useDerivedValue(() => palette.value.glowOuter);
  const glowI = useDerivedValue(() => palette.value.glowInner);
  const fOuter = useDerivedValue(() => palette.value.flameOuter);
  const fMid = useDerivedValue(() => palette.value.flameMid);
  const fInner = useDerivedValue(() => palette.value.flameInner);
  const fHigh = useDerivedValue(() => palette.value.flameHighlight);
  const sDeep = useDerivedValue(() => palette.value.shadowDeep);
  const sDark = useDerivedValue(() => palette.value.shadowDark);
  const sMid = useDerivedValue(() => palette.value.shadowMid);
  const faceColor = useDerivedValue(() => palette.value.face);
  const faceH = useDerivedValue(() => palette.value.faceHighlight);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={{ width: canvasW, height: canvasH }}>
        <Canvas style={{ width: canvasW, height: canvasH }}>
          <Group
            transform={[
              { translateX: canvasW / 2 - 90 * scale },
              { translateY: canvasH / 2 - 120 * scale },
              { scale },
            ]}>
            <Group transform={rootTransform}>
              <Oval
                x={50}
                y={175}
                width={80}
                height={25}
                color={feat}
                opacity={0.15}>
                <BlurMask blur={12} style="normal" />
              </Oval>

              <Group opacity={glowCombined}>
                <Oval
                  x={-10}
                  y={40}
                  width={200}
                  height={170}
                  color={glowO}
                  opacity={0.4}>
                  <BlurMask blur={50} style="normal" />
                </Oval>
                <Oval x={10} y={60} width={160} height={140} color={glowI}>
                  <BlurMask blur={30} style="normal" />
                </Oval>
              </Group>

              {particleTs.map((pt, i) => (
                <Particle
                  key={i}
                  index={i}
                  particleT={pt}
                  palette={palette}
                  intensity={particleIntensity}
                  yawnProgress={yawnProgress}
                />
              ))}

              <Group transform={flameYawnTransform}>
                <Path path={flamePath} color={fOuter} />
                <Oval
                  x={40}
                  y={150}
                  width={100}
                  height={45}
                  color={sDeep}
                  opacity={0.4}>
                  <BlurMask blur={12} style="normal" />
                </Oval>
                <Path path={innerPath} color={fMid} />
                <Oval
                  x={55}
                  y={80}
                  width={70}
                  height={90}
                  color={fInner}
                  opacity={0.5}>
                  <BlurMask blur={18} style="normal" />
                </Oval>
                <Oval
                  x={80}
                  y={52}
                  width={20}
                  height={24}
                  color={fHigh}
                  opacity={0.35}>
                  <BlurMask blur={8} style="normal" />
                </Oval>
              </Group>

              <Group transform={FACE_TRANSFORM}>
                <Oval
                  x={42}
                  y={105}
                  width={96}
                  height={90}
                  color={sDark}
                  opacity={0.35}>
                  <BlurMask blur={8} style="normal" />
                </Oval>
                <Oval x={48} y={100} width={84} height={80} color={faceColor} />
                <Oval
                  x={58}
                  y={108}
                  width={64}
                  height={60}
                  color={faceH}
                  opacity={0.3}>
                  <BlurMask blur={12} style="normal" />
                </Oval>
                <Oval
                  x={62}
                  y={156}
                  width={56}
                  height={16}
                  color={sMid}
                  opacity={0.06}>
                  <BlurMask blur={10} style="normal" />
                </Oval>
                <Oval
                  x={86}
                  y={127}
                  width={9}
                  height={6}
                  color={feat}
                  opacity={0.12}>
                  <BlurMask blur={3} style="normal" />
                </Oval>
                <Oval x={84} y={122} width={12} height={10} color={faceH} />

                <Group transform={eyeBlinkTransform}>
                  <Path
                    path={leftEye}
                    color={feat}
                    style="stroke"
                    strokeWidth={4}
                    strokeCap="round"
                  />
                  <Path
                    path={rightEye}
                    color={feat}
                    style="stroke"
                    strokeWidth={4}
                    strokeCap="round"
                  />
                </Group>

                <Path
                  path={mouth}
                  color={feat}
                  style="stroke"
                  strokeWidth={4}
                  strokeCap="round"
                />
              </Group>
            </Group>
          </Group>
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
}
