/**
 * BlastCircleEffect Component
 *
 * A high-performance particle effect component that creates a circular blast animation
 * using React Native Skia for rendering. The component renders multiple circles that
 * expand outward from a central point with a spring animation.
 *
 * @component
 * @example
 * ```tsx
 * <BlastCircleEffect
 *   size={100}
 *   count={20}
 *   circleRadius={2}
 *   blastRadius={50}
 * />
 * ```
 */

import {
  Atlas,
  Canvas,
  Circle,
  Group,
  rect,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import type { WithSpringConfig } from 'react-native-reanimated';
import {
  cancelAnimation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

/**
 * Props for the BlastCircleEffect component
 */
type BlastCircleEffectProps = {
  /** The size of the container canvas */
  size: number;
  /** Number of particles to render in the blast effect */
  count: number;
  /** Radius of each individual circle particle */
  circleRadius: number;
  /** Optional radius of the blast effect. If not provided, defaults to half the container size */
  blastRadius?: number;
};

/**
 * Ref type for controlling the blast effect animation
 */
export type BlastEffectRefType = {
  /**
   * Triggers the blast animation
   * @param springAnimationConfig - Optional spring animation configuration
   * @param delay - Optional delay before the animation starts (in milliseconds)
   */
  blast: (springAnimationConfig?: WithSpringConfig, delay?: number) => void;
};

export const BlastCircleEffect = forwardRef<
  BlastEffectRefType,
  BlastCircleEffectProps
>(
  (
    {
      size: ContainerSize,
      count,
      circleRadius,
      blastRadius: blastRadiusProp,
    }: BlastCircleEffectProps,
    ref,
  ) => {
    const circleSize = circleRadius * 2;
    const blastRadius = blastRadiusProp ?? ContainerSize / 2 - circleSize;

    const origin = { x: ContainerSize / 2, y: ContainerSize / 2 };
    const progress = useSharedValue(0);

    const baseRandomness = useSharedValue(Math.random());

    const sprites = useDerivedValue(() => {
      return new Array(count).fill(0).map((_, i) => {
        return rect(circleSize * i, 0, circleSize, circleSize);
      });
    }, [count]);

    const texture = useTexture(
      <Group>
        {new Array(count).fill(0).map((_, index) => {
          return (
            <Circle
              key={`${index}-${count}`}
              cx={circleSize * index - circleRadius}
              cy={circleRadius}
              color="#ffffff"
              r={circleRadius}
              opacity={interpolate(Math.random(), [0, 1], [0.1, 0.2])}
            />
          );
        })}
      </Group>,
      {
        width: circleSize * count,
        height: circleSize,
      },
    );

    useImperativeHandle(
      ref,
      () => ({
        blast: (springAnimationConfig?: WithSpringConfig, delay?: number) => {
          cancelAnimation(progress);
          baseRandomness.value = Math.random();
          progress.value = 0;
          progress.value = withDelay(
            delay ?? 0,
            withSpring(1, springAnimationConfig),
          );
        },
      }),
      [baseRandomness, progress],
    );

    /**
     * Seeded random number generator for consistent particle distribution
     * @param seed - The seed value for the random number
     * @returns A deterministic random number between 0 and 1
     */
    const seededRandom = useCallback(
      (seed: number) => {
        'worklet';
        const x = Math.sin(seed++) * 10000;
        return Math.sqrt((x - Math.floor(x)) * baseRandomness.value);
      },
      [baseRandomness],
    );

    const progressRadius = useDerivedValue(() => {
      return interpolate(progress.value, [0, 1], [0, blastRadius]);
    }, [progress]);

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';

      const initialX = origin.x + circleRadius;
      const initialY = origin.y - circleRadius;

      const progressAnimation = progressRadius.value ** (i % 2 ? 1.02 : 1);

      const xRandom = interpolate(seededRandom(i), [0, 1], [-0.5, 0.5]);
      const randomAngle = (xRandom * Math.PI * 2) / count;

      const angle = (i / count) * Math.PI * 2 + randomAngle;
      const x = Math.cos(angle) * progressAnimation;
      const y = Math.sin(angle) * progressAnimation;

      val.set(0, 1, initialX + x, initialY + y);
    });

    const opacity = useDerivedValue(() => {
      const baseOpacity = interpolate(progress.value, [0.8, 1], [1, 0]);
      return baseOpacity ** 2;
    }, [progress]);

    return (
      <Canvas
        style={{
          width: ContainerSize,
          height: ContainerSize,
        }}>
        <Atlas
          image={texture}
          sprites={sprites}
          transforms={transforms}
          opacity={opacity}
        />
      </Canvas>
    );
  },
);

BlastCircleEffect.displayName = 'BlastCircleEffect';
