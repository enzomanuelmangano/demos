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
    scaleSpiral: 3,
  },
  {
    name: 'adaptive-icon',
    width: 1024,
    height: 1024,
    background: false,
    fadedSpiral: true,
  },
];

// Get command line arguments starting from index 2 (first two elements are node and script path)
const args = process.argv.slice(2);

// Parse the arguments
const parsedArgs = {};
args.forEach(arg => {
  const [key, value] = arg.split('=');
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  parsedArgs[key.replace('--', '')] = value;
});

const { value: text } = parsedArgs as { value: string };

// Add default value if text is undefined
const displayText = text || '0';

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

  for (const icon of Icons) {
    const surface = makeOffscreenSurface(icon.width, icon.height);
    const icon_image = await drawOffscreen(
      surface,
      <AppIcon
        text={displayText}
        fontSize={fontSize}
        font={font}
        Skia={Skia}
        {...icon}
        randomFactor={randomFactor}
      />,
    );

    const base64Image = icon_image.encodeToBase64();
    const buffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(`../../assets/${icon.name}.png`, buffer);
    icon_image.dispose();
    surface.dispose();
  }
})();
