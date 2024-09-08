import {
  Fill,
  LinearGradient,
  Group,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import React from 'react';
import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';

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
};

export const AppIcon = ({
  width,
  height,
  Skia,
  grid = true,
  background = true,
  fadedSpiral = false,
  randomFactor = Math.random(),
}: AppIconProps) => {
  const size = Math.max(width, height);

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
      />
    </Group>
  );
};
