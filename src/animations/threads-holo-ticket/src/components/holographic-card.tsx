/**
 * A component that creates a holographic card effect using Skia for high-performance graphics.
 * The card displays a grid of circles with a dynamic holographic gradient that responds to rotation.
 */

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

// const LogoSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-11.5 -10.23174 23 20.46348">
//   <title>React Logo</title>
//   <circle cx="0" cy="0" r="2.05" fill="currentColor"/>
//   <g stroke="currentColor" stroke-width="1" fill="none">
//     <ellipse rx="11" ry="4.2"/>
//     <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
//     <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
//   </g>
// </svg>`;
// const LogoSvg = Skia.SVG.MakeFromString(LogoSvgString);

export const HolographicCard: FC<HolographicCardProps> = ({
  width,
  height,
  rotateY,
  color = '#FFF',
}) => {
  // Calculate the center of the mask based on rotation
  const maskCenterX = useDerivedValue(() => {
    const normalizedRotation = rotateY.value % 360;
    const rotation =
      normalizedRotation < 0 ? normalizedRotation + 360 : normalizedRotation;

    const v = width / 2 - Math.sin((rotation * Math.PI) / 180) * (width / 2);

    return v;
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
          cy={height / 2}
          r={height / 2.5}
          color={'rgba(0,0,0,1)'}>
          <BlurMask blur={200} style="normal" />
        </Circle>
      </Group>
    );
  }, [maskOpacity, width, height, maskCenterX]);

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
              {/* Holographic gradient colors */}
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: width, y: height }}
                colors={[
                  '#FFD700', // Bright gold
                  '#1E90FF', // Dodger blue
                  '#FFD700',
                  '#4169E1', // Royal blue
                  '#DAA520', // Golden rod
                  '#000080', // Navy blue
                  '#B8860B', // Dark golden rod
                  '#1E90FF',
                  '#FFD700',
                ]}
                positions={[0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]}
              />
            </Path>
          </Mask>
        </Group>
      </Group>
    </Canvas>
  );
};
