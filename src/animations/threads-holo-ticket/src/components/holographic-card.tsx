import { PixelRatio } from 'react-native';

import { type FC, useMemo } from 'react';

import {
  Extrapolation,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Image,
  interpolate,
  LinearGradient,
  Mask,
  Path,
  Rect,
  RoundedRect,
  Skia,
  useTexture,
} from 'react-native-skia';

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
  const { pitch: sensorPitch, roll: sensorRoll } = useDeviceTilt();

  // Calculate mask opacity based on rotation angle
  const maskOpacity = useDerivedValue(() => {
    const normalizedRotation = interpolate(
      Math.abs(rotateY.get()),
      [0, 90, 180, 270, 360],
      [0, 0.5, 0, 0.5, 0],
      Extrapolation.CLAMP,
    );

    return normalizedRotation;
  });

  // At opacity 0 the luminance mask hides the whole holographic layer, so the
  // tilt is only forwarded while it's visible: the noisy sensor would
  // otherwise redraw the canvas at 60Hz with the card at rest.
  const smoothPitch = useSharedValue(0);
  const smoothRoll = useSharedValue(0);
  useAnimatedReaction(
    () => (maskOpacity.get() > 0 ? sensorPitch.get() : null),
    pitch => {
      if (pitch !== null) smoothPitch.set(pitch);
    },
  );
  useAnimatedReaction(
    () => (maskOpacity.get() > 0 ? sensorRoll.get() : null),
    roll => {
      if (roll !== null) smoothRoll.set(roll);
    },
  );

  // Calculate the center of the mask based on rotation AND device tilt
  const maskCenterX = useDerivedValue(() => {
    const normalizedRotation = rotateY.get() % 360;
    const rotation =
      normalizedRotation < 0 ? normalizedRotation + 360 : normalizedRotation;

    // Base position from card rotation
    const baseX =
      width / 2 - Math.sin((rotation * Math.PI) / 180) * (width / 2);

    // Add offset based on device pitch (tilting forward/backward)
    const tiltOffsetX = interpolate(
      smoothPitch.get(),
      [-Math.PI / 4, Math.PI / 4],
      [-width / 3, width / 3],
      Extrapolation.CLAMP,
    );

    return baseX + tiltOffsetX;
  });

  const maskCenterY = useDerivedValue(() => {
    // Use device roll (tilting left/right) to shift Y position
    const tiltOffsetY = interpolate(
      smoothRoll.get(),
      [-Math.PI / 4, Math.PI / 4],
      [-height / 3, height / 3],
      Extrapolation.CLAMP,
    );

    return height / 2 + tiltOffsetY;
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
    const builder = Skia.PathBuilder.Make();
    builder.addCircle(width / 2, 0, DotSize);
    builder.addCircle(width / 2, height, DotSize);
    return builder.build();
  }, [height, width]);

  // Calculate grid dimensions for the pattern
  const LogoAmountHorizontal = 25;
  const LogoSize = width / LogoAmountHorizontal;
  const LogoAmountVertical = Math.round(height / LogoSize) + 1;

  // Create the grid pattern of circles
  const GridPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    for (let i = 0; i < LogoAmountHorizontal; i++) {
      for (let j = 0; j < LogoAmountVertical; j++) {
        builder.addCircle(
          LogoSize / 2 + i * LogoSize,
          LogoSize / 2 + j * LogoSize,
          LogoSize / 2,
        );
      }
    }
    return builder.build();
  }, [LogoAmountVertical, LogoSize]);

  // The ~850-circle grid is static: rasterize it once at device resolution
  // and use it to cut the gradient (dstIn) instead of filling the path every
  // frame.
  const pixelRatio = PixelRatio.get();
  const gridTexture = useTexture(
    <Group transform={[{ scale: pixelRatio }]}>
      <Path path={GridPath} color="white" />
    </Group>,
    { width: width * pixelRatio, height: height * pixelRatio },
    [GridPath, pixelRatio, width, height],
  );

  // Gradient positions influenced by device tilt - subtle effect
  const gradientStart = useDerivedValue(() => {
    const x = interpolate(
      smoothRoll.get(),
      [-Math.PI / 4, Math.PI / 4],
      [width * 0.1, width * 0.25],
      Extrapolation.CLAMP,
    );
    const y = interpolate(
      smoothPitch.get(),
      [-Math.PI / 4, Math.PI / 4],
      [height * 0.1, height * 0.25],
      Extrapolation.CLAMP,
    );

    return { x, y };
  });

  const gradientEnd = useDerivedValue(() => {
    const x = interpolate(
      smoothRoll.get(),
      [-Math.PI / 4, Math.PI / 4],
      [width * 0.9, width * 0.75],
      Extrapolation.CLAMP,
    );
    const y = interpolate(
      smoothPitch.get(),
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
            <Rect x={0} y={0} width={width} height={height}>
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
            </Rect>
            <Image
              image={gridTexture}
              x={0}
              y={0}
              width={width}
              height={height}
              fit="fill"
              blendMode="dstIn"
            />
          </Mask>
        </Group>
      </Group>
    </Canvas>
  );
};
