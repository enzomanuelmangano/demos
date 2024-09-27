import {
  Fill,
  LinearGradient,
  Group,
  Text,
  BlurMask,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import React, { useMemo } from 'react';
import type {
  SkFont,
  Skia,
} from '@shopify/react-native-skia/lib/commonjs/skia/types';

import { Spiral } from './spiral';
import { Grid } from './grid';

type AppIconProps = {
  width: number;
  height: number;
  Skia: Skia;
  grid?: boolean;
  background?: boolean;
  fadedSpiral?: boolean;
  randomFactor?: number;
  font: SkFont;
  text: string;
  fontSize: number;
  scaleSpiral?: number;
};

export const AppIcon = ({
  width,
  height,
  Skia,
  grid = true,
  background = true,
  fadedSpiral = false,
  randomFactor = Math.random(),
  font,
  text,
  fontSize,
  scaleSpiral = 1,
}: AppIconProps) => {
  const size = Math.max(width, height);

  const textY = useMemo(() => {
    const textHeight = fontSize;
    return height / 2 + textHeight / 3.2;
  }, [fontSize, height]);
  const textX = useMemo(() => {
    // font.measureText is not supported in Headless mode
    const textWidth = font.getTextWidth(text);
    return width / 2 - textWidth / 2;
  }, [font, width, text]);

  return (
    <Group>
      {background && (
        <Fill>
          <LinearGradient
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: size }}
            colors={['#0290FE', '#0048EC']}
          />
        </Fill>
      )}
      {grid && <Grid size={size} Skia={Skia} />}

      <Spiral
        Skia={Skia}
        width={width}
        height={height}
        faded={fadedSpiral}
        randomFactor={randomFactor}
        scale={scaleSpiral}
      />

      <Text
        x={textX}
        y={textY}
        color="rgba(255,255,255,0.5)"
        text={text}
        font={font}
      />
      <Text
        x={textX}
        y={textY}
        color={'white'}
        style={'stroke'}
        strokeWidth={8}
        text={text}
        font={font}>
        <BlurMask blur={5} style="solid" />
      </Text>
    </Group>
  );
};
