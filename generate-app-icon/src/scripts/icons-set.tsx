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
    fadedSpiral: true,
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
    fadedSpiral: true,
  },
];

(async () => {
  await LoadSkiaWeb();
  // Once that CanvasKit is loaded, you can access Skia via getSkiaExports()
  const { Skia } = getSkiaExports();

  const randomFactor = Math.random();

  const data = Skia.Data.fromBytes(
    fs.readFileSync(require.resolve('../../assets/SF-Pro-Rounded-Bold.otf')),
  );

  const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);

  const fontSize = 500;
  const font = Skia.Font(tf!, fontSize);

  Icons.forEach(icon => {
    const surface = makeOffscreenSurface(icon.width, icon.height);
    const icon_image = drawOffscreen(
      surface,
      <AppIcon
        text="80"
        fontSize={fontSize}
        font={font}
        Skia={Skia}
        {...icon}
        randomFactor={randomFactor}
      />,
    );

    const base64Image = icon_image.encodeToBase64();
    const buffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(`../assets/${icon.name}.png`, buffer);
    icon_image.dispose();
    surface.dispose();
  });
})();
