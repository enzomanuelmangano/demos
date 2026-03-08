import { memo } from 'react';

import { Circle, Group } from '@shopify/react-native-skia';
import {
  interpolate,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  PARTICLE_CONFIGS,
  RISE_HEIGHT,
  RISE_START_Y,
  type FlameColorPalette,
} from '../data';

type ParticleProps = {
  index: number;
  particleT: SharedValue<number>;
  palette: SharedValue<FlameColorPalette>;
  intensity: SharedValue<number>;
  yawnProgress: SharedValue<number>;
};

export const Particle = memo(function Particle({
  index,
  particleT,
  palette,
  intensity,
  yawnProgress,
}: ParticleProps) {
  const cfg = PARTICLE_CONFIGS[index];
  const colorIndex = index % 4;

  const color = useDerivedValue(() => palette.value.particles[colorIndex]);

  const transform = useDerivedValue(() => {
    const yawn = yawnProgress.value;
    const t = particleT.value;
    const extraHeight = yawn * 40;
    const y = RISE_START_Y - (RISE_HEIGHT + extraHeight) * t;
    const sway = Math.sin(t * 2.5 * Math.PI + cfg.swayOffset) * (6 + yawn * 4);
    const x = cfg.baseX + sway;
    return [{ translateX: x }, { translateY: y }];
  });

  const opacity = useDerivedValue(() => {
    const yawn = yawnProgress.value;
    const particleIntensity = intensity.value;
    if (cfg.isExtra && yawn < 0.05) {
      return 0;
    }
    const t = particleT.value;
    const base = interpolate(
      t,
      [0, 0.2, 0.6, 0.85, 1],
      [0.15, 0.7, 0.75, 0.5, 0.08],
    );
    const result = (base + yawn * 0.25) * particleIntensity;
    return cfg.isExtra ? result * yawn : result;
  });

  const radius = useDerivedValue(() => {
    const yawn = yawnProgress.value;
    return cfg.baseR * (1 + yawn * 0.8);
  });

  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={0} r={radius} color={color} />
    </Group>
  );
});
