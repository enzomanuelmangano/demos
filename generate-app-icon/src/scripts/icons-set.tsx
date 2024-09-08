/* eslint-disable camelcase */
import fs from 'fs';

import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb';
import {
  makeOffscreenSurface,
  drawOffscreen,
  getSkiaExports,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import React from 'react';

import { AppIcon } from '../app-icon';

const Icons = [
  {
    name: 'icon',
    width: 1024,
    height: 1024,
  },
  {
    name: 'splash',
    width: 1284,
    height: 2778,
    grid: false,
    background: false,
    fadedSpiral: true,
  },
  {
    name: 'adaptive-icon',
    width: 1024,
    height: 1024,
    background: false,
  },
];

(async () => {
  await LoadSkiaWeb();
  // Once that CanvasKit is loaded, you can access Skia via getSkiaExports()
  const { Skia } = getSkiaExports();

  const randomFactor = Math.random();

  Icons.forEach(icon => {
    const surface = makeOffscreenSurface(icon.width, icon.height);
    const icon_image = drawOffscreen(
      surface,
      <AppIcon Skia={Skia} {...icon} randomFactor={randomFactor} />,
    );

    const base64Image = icon_image.encodeToBase64();
    const buffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(`../assets/${icon.name}.png`, buffer);
    icon_image.dispose();
    surface.dispose();
  });
})();
