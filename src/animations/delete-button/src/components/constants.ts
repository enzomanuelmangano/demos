import { Platform } from 'react-native';

import { matchFont, Skia } from '@shopify/react-native-skia';

export const CloseSvgPath = Skia.SVG.MakeFromString(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" stroke-width="2" stroke="white" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>',
);

export const CloseSvgPathWidth = CloseSvgPath?.width() ?? 0;
export const CloseSvgPathHeight = CloseSvgPath?.height() ?? 0;

export const fontFamily = Platform.select({
  ios: 'Helvetica',
  default: 'serif',
});

export const fontStyle = {
  fontFamily,
  fontSize: 14,
  fontWeight: 'bold',
} as const;
export const font = matchFont(fontStyle);
