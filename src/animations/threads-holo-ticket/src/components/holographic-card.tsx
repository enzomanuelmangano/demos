import { type FC, useMemo } from 'react';

import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  interpolate,
  LinearGradient,
  Mask,
  Path,
  Rect,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';
import { Extrapolation, useDerivedValue } from 'react-native-reanimated';

import { useDeviceTilt } from '../hooks/use-device-tilt';

import type { SharedValue } from 'react-native-reanimated';

/**
 * Props for the HolographicCard component
 * @typedef {Object} HolographicCardProps
 * @property {number} width - The width of the card
 * @property {number} height - The height of the card
 * @property {SharedValue<number>} rotateY - Animated rotation value around Y axis
 * @property {string} [color='#FFF'] - Background color of the card
 */
interface HolographicCardProps {
  width: number;
  height: number;
  rotateY: SharedValue<number>;
  color?: string;
}

export const HolographicCard: FC<HolographicCardProps> = ({
  width,
  height,
  rotateY,
  color = '#FFF',
}) => {
  // Get smoothed device tilt values
  const { pitch: smoothPitch, roll: smoothRoll } = useDeviceTilt();

  // Calculate the center of the mask based on rotation AND device tilt
  const maskCenterX = useDerivedValue(() => {
    const normalizedRotation = rotateY.value % 360;
    const rotation =
      normalizedRotation < 0 ? normalizedRotation + 360 : normalizedRotation;

    // Base position from card rotation
    const baseX =
      width / 2 - Math.sin((rotation * Math.PI) / 180) * (width / 2);

    // Add offset based on device pitch (tilting forward/backward)
    const tiltOffsetX = interpolate(
      smoothPitch.value,
      [-Math.PI / 4, Math.PI / 4],
      [-width / 3, width / 3],
      Extrapolation.CLAMP,
    );

    return baseX + tiltOffsetX;
  });

  const maskCenterY = useDerivedValue(() => {
    // Use device roll (tilting left/right) to shift Y position
    const tiltOffsetY = interpolate(
      smoothRoll.value,
      [-Math.PI / 4, Math.PI / 4],
      [-height / 3, height / 3],
      Extrapolation.CLAMP,
    );

    return height / 2 + tiltOffsetY;
  });

  // Calculate mask opacity based on rotation angle
  const maskOpacity = useDerivedValue(() => {
    const normalizedRotation = interpolate(
      Math.abs(rotateY.value),
      [0, 90, 180, 270, 360],
      [0, 0.5, 0, 0.5, 0],
      Extrapolation.CLAMP,
    );

    return normalizedRotation;
  });

  // Create the mask for the holographic effect
  const mask = useMemo(() => {
    return (
      <Group>
        <Rect
          x={0}
          y={0}
          width={width}
          opacity={maskOpacity}
          height={height}
          color={'white'}
        />
        <Circle
          cx={maskCenterX}
          cy={maskCenterY}
          r={height / 2.5}
          color={'rgba(0,0,0,1)'}>
          <BlurMask blur={200} style="normal" />
        </Circle>
      </Group>
    );
  }, [maskOpacity, width, height, maskCenterX, maskCenterY]);

  // Constants for the dot pattern
  const DotSize = 25;

  // Create clip area with circular cutouts at top and bottom
  const clipArea = useMemo(() => {
    const skPath = Skia.Path.Make();
    skPath.addCircle(width / 2, 0, DotSize);
    skPath.addCircle(width / 2, height, DotSize);
    return skPath;
  }, [height, width]);

  // Calculate grid dimensions for the pattern
  const LogoAmountHorizontal = 25;
  const LogoSize = width / LogoAmountHorizontal;
  const LogoAmountVertical = Math.round(height / LogoSize) + 1;

  // Create the grid pattern of circles
  const GridPath = useMemo(() => {
    const skPath = Skia.Path.Make();
    for (let i = 0; i < LogoAmountHorizontal; i++) {
      for (let j = 0; j < LogoAmountVertical; j++) {
        skPath.addCircle(
          LogoSize / 2 + i * LogoSize,
          LogoSize / 2 + j * LogoSize,
          LogoSize / 2,
        );
      }
    }
    return skPath;
  }, [LogoAmountVertical, LogoSize]);

  // Gradient positions influenced by device tilt - subtle effect
  const gradientStart = useDerivedValue(() => {
    const x = interpolate(
      smoothRoll.value,
      [-Math.PI / 4, Math.PI / 4],
      [width * 0.1, width * 0.25],
      Extrapolation.CLAMP,
    );
    const y = interpolate(
      smoothPitch.value,
      [-Math.PI / 4, Math.PI / 4],
      [height * 0.1, height * 0.25],
      Extrapolation.CLAMP,
    );

    return { x, y };
  });

  const gradientEnd = useDerivedValue(() => {
    const x = interpolate(
      smoothRoll.value,
      [-Math.PI / 4, Math.PI / 4],
      [width * 0.9, width * 0.75],
      Extrapolation.CLAMP,
    );
    const y = interpolate(
      smoothPitch.value,
      [-Math.PI / 4, Math.PI / 4],
      [height * 0.9, height * 0.75],
      Extrapolation.CLAMP,
    );

    return { x, y };
  });

  return (
    <Canvas style={{ width, height, backgroundColor: 'transparent' }}>
      <Group clip={clipArea} invertClip>
        {/* Main card background */}
        <RoundedRect
          x={0}
          y={0}
          width={width}
          height={height}
          color={color}
          r={5}
        />
        <Group>
          {/* Holographic effect mask */}
          <Mask mask={mask} mode="luminance">
            <Path path={GridPath}>
              {/* Holographic gradient colors - responds to device tilt */}
              <LinearGradient
                start={gradientStart}
                end={gradientEnd}
                colors={[
                  '#ECD9A8', // Rich champagne
                  '#B89FCC', // Medium lavender
                  '#E5C896', // Warm gold
                  '#8FB3D5', // Soft blue
                  '#E8CF9E', // Golden beige
                  '#9B89C0', // Periwinkle
                  '#EDD5A5', // Champagne gold
                ]}
                positions={[0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]}
              />
            </Path>
          </Mask>
        </Group>
      </Group>
    </Canvas>
  );
};
