import { useRef } from 'react';

import {
  Extrapolation,
  interpolate,
  makeMutable,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  BREATHE_SPEEDS,
  ENERGIES,
  GLOW_INTENSITIES,
  MOOD_INPUT_RANGE,
  PARTICLE_INTENSITIES,
  PARTICLE_SPEEDS,
  PARTICLE_COUNT_YAWN,
} from '../data';

type UseCheckyAnimationParams = {
  progress: SharedValue<number>;
  yawnProgress: SharedValue<number>;
};

export function useCheckyAnimation({
  progress,
  yawnProgress,
}: UseCheckyAnimationParams) {
  // Animation phases
  const flamePhase = useSharedValue(0);
  const flameDir = useSharedValue(1);
  const innerPhase = useSharedValue(0);
  const innerDir = useSharedValue(1);
  const breathePhase = useSharedValue(0);
  const glowPhase = useSharedValue(0);

  // Particle T values
  const particleTRef = useRef<SharedValue<number>[] | null>(null);
  if (particleTRef.current === null) {
    particleTRef.current = Array.from({ length: PARTICLE_COUNT_YAWN }, (_, i) =>
      makeMutable(i / PARTICLE_COUNT_YAWN),
    );
  }
  const particleTs = particleTRef.current;

  // Interpolated expression values
  const breatheSpeed = useDerivedValue(() =>
    interpolate(
      progress.value,
      MOOD_INPUT_RANGE,
      BREATHE_SPEEDS,
      Extrapolation.CLAMP,
    ),
  );
  const particleSpeed = useDerivedValue(() =>
    interpolate(
      progress.value,
      MOOD_INPUT_RANGE,
      PARTICLE_SPEEDS,
      Extrapolation.CLAMP,
    ),
  );
  const particleIntensity = useDerivedValue(() =>
    interpolate(
      progress.value,
      MOOD_INPUT_RANGE,
      PARTICLE_INTENSITIES,
      Extrapolation.CLAMP,
    ),
  );
  const energy = useDerivedValue(() =>
    interpolate(
      progress.value,
      MOOD_INPUT_RANGE,
      ENERGIES,
      Extrapolation.CLAMP,
    ),
  );
  const glowIntensity = useDerivedValue(() =>
    interpolate(
      progress.value,
      MOOD_INPUT_RANGE,
      GLOW_INTENSITIES,
      Extrapolation.CLAMP,
    ),
  );

  const breatheScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.17);

  useFrameCallback(info => {
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    const yawn = yawnProgress.value;
    const spd = breatheSpeed.value;
    const pSpd = particleSpeed.value;

    // Flame morph animation
    const morphSpd = (1 + yawn * 1.8) * spd;
    let fp = flamePhase.value + (dt / 1.8) * morphSpd * flameDir.value;
    if (fp >= 1) {
      fp = 1;
      flameDir.value = -1;
    } else if (fp <= 0) {
      fp = 0;
      flameDir.value = 1;
    }
    flamePhase.value = fp;

    let ip = innerPhase.value + (dt / 1.5) * morphSpd * innerDir.value;
    if (ip >= 1) {
      ip = 1;
      innerDir.value = -1;
    } else if (ip <= 0) {
      ip = 0;
      innerDir.value = 1;
    }
    innerPhase.value = ip;

    // Particle animation
    const yawnBoost = 1 + yawn * 2.5;
    const step = (dt / 5) * pSpd * yawnBoost;
    for (let i = 0; i < PARTICLE_COUNT_YAWN; i++) {
      let nt = particleTs[i].value + step;
      if (nt >= 1) {
        nt -= 1;
      }
      particleTs[i].value = nt;
    }

    // Breathing animation
    const bFreq = (Math.PI / 2.2) * spd;
    breathePhase.value = (breathePhase.value + dt * bFreq) % (2 * Math.PI);
    const amp = 0.015 * energy.value;
    breatheScale.value = 1 + amp * 0.1 + Math.sin(breathePhase.value) * amp;

    // Glow animation
    const gFreq = (Math.PI / 1.6) * spd;
    glowPhase.value = (glowPhase.value + dt * gFreq) % (2 * Math.PI);
    glowOpacity.value =
      0.17 + Math.sin(glowPhase.value) * 0.05 * glowIntensity.value;
  });

  return {
    flamePhase,
    innerPhase,
    particleTs,
    particleIntensity,
    breatheScale,
    glowOpacity,
    glowIntensity,
  };
}
